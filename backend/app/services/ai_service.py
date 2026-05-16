from __future__ import annotations

import re
from datetime import datetime, timezone
from datetime import timedelta
from pathlib import Path
from typing import Any
from uuid import uuid4

from fastapi import HTTPException

from app.schemas.ai import (
    AiConfirmDeleteRequest,
    AiAgenticTask,
    AiContextSourceRef,
    AiConversationEvent,
    AiConversationResponse,
    AiIndexStatusResponse,
    AiInteractionRequest,
    AiInteractionResponse,
    AiGeneratedImage,
    AiOperation,
    AiPendingDelete,
    AiPendingIntent,
    AiPromptRequest,
    AiPromptResponse,
    AiUpdatedDocument,
)
from app.schemas.project import CreateDocumentRequest, CreateFolderRequest, MoveNodeRequest, TreeNode
from app.services.ai_context_service import ai_context_service
from app.services.app_storage import JsonFileStore
from app.services.config_service import config_service
from app.services.credential_service import credential_service
from app.services.document_service import document_service
from app.services.filesystem_service import decode_document_id, decode_node_id
from app.services.ai_usage_service import ai_usage_service
from app.services.asset_service import asset_service
from app.services.openai_service import OpenAiProviderError, OpenAiUnavailableError, openai_service
from app.services.project_service import project_service
from app.services.rag_service import RagIndexState, rag_service


RECENT_CONVERSATION_MAX_EVENTS = 6
RECENT_CONVERSATION_MAX_EVENT_CHARS = 700
RECENT_CONVERSATION_MAX_TOTAL_CHARS = 3000
RECENT_CONVERSATION_EVENT_TYPES = {
    "user_message",
    "assistant_message",
    "document_modified",
    "folder_created",
    "document_created",
    "document_duplicated",
    "node_moved",
    "delete_requested",
    "node_deleted",
    "permission_blocked",
    "task_planned",
    "task_checkpoint",
    "source_found",
    "image_generated",
    "image_inserted",
}

INTERACTION_TYPES = {"chat", "document_edit", "project_operation", "agentic_task", "image_generation", "clarification", "mixed"}
CONFIDENCE_LEVELS = {"high", "medium", "low"}
UI_PLACEMENTS = {"document_bubble", "conversation_tab", "none"}
EXECUTION_SCOPES = {"direct_action", "needs_permission", "needs_clarification", "agentic_task", "too_expensive_or_unclear"}
INTENT_DECISIONS = {"create_intent", "confirm_intent", "update_intent", "cancel_intent", "needs_clarification", "execute_now"}
INTENT_STATUSES = {"awaiting_decision", "awaiting_web_permission", "ready", "running", "completed", "cancelled"}
INTENT_ACTIONS = {"replace_document", "edit_document", "create_document", "project_operation", "research_then_write"}
INTENT_TTL_HOURS = 24


class AiService:
    def __init__(self) -> None:
        self.pending_deletes = JsonFileStore("ai-pending-deletes.json")
        self.pending_intents = JsonFileStore("ai-pending-intents.json")

    def prompt_document(self, document_id: str, payload: AiPromptRequest) -> AiPromptResponse:
        return AiPromptResponse(
            answer=(
                "La asistencia IA todavía no está configurada para este documento. "
                "KnowNext.ai no generará respuestas simuladas; cuando se active un proveedor real, "
                "la consulta se resolverá desde FastAPI con contexto del documento activo."
            ),
            suggestedActions=[],
        )

    def prompt_project(self, project_id: str, payload: AiPromptRequest) -> AiPromptResponse:
        return AiPromptResponse(
            answer=(
                "La asistencia IA todavía no está configurada para este proyecto. "
                "KnowNext.ai no generará respuestas simuladas; cuando se active un proveedor real, "
                "la consulta se resolverá desde FastAPI con contexto de la documentación del proyecto."
            ),
            suggestedActions=[],
        )

    def interact(self, project_id: str, payload: AiInteractionRequest) -> AiInteractionResponse:
        if payload.projectId != project_id:
            raise HTTPException(status_code=400, detail="Project id mismatch")
        if not payload.prompt.strip() and payload.intentAction is None:
            raise HTTPException(status_code=400, detail="Prompt is required")

        project_service.get_project_tree(project_id)
        interaction_id = f"ai-{uuid4()}"
        pending_intent = self._active_pending_intent(project_id)
        action_response = self._handle_intent_action(project_id, interaction_id, payload, pending_intent)
        if action_response is not None:
            return action_response
        pending_intent = self._active_pending_intent(project_id)
        explicit_context_sources, sources_used, expired_context_source_ids = ai_context_service.resolve_sources(project_id, payload.contextSourceIds)

        user_event = self._event(
            project_id,
            "user_message",
            "user",
            payload.prompt.strip() or _intent_action_event_content(payload),
            document_id=payload.documentId or (pending_intent.targetDocumentId if pending_intent else None),
            sources_used=sources_used,
        )

        if not credential_service.get_openai_key():
            operation = AiOperation(
                type="provider_unavailable",
                status="blocked",
                message="Configura una OpenAI API key para activar la asistencia IA.",
            )
            provider_event = self._event(project_id, "provider_unavailable", "system", operation.message)
            self._append_events(project_id, [user_event, provider_event])
            return AiInteractionResponse(
                interactionId=interaction_id,
                status="blocked",
                display="conversation",
                answer=operation.message,
                operations=[operation],
                conversationEvents=[user_event, provider_event],
                contextSources=ai_context_service.list_sources(project_id).sources,
                expiredContextSourceIds=expired_context_source_ids,
            )

        ai_config = config_service.get_config().ai
        has_image_context = any(isinstance(source, dict) and source.get("kind") == "image" for source in explicit_context_sources)
        selected_model = ai_config.vision.model if ai_config.vision.enabled and has_image_context else ai_config.model
        rag_context = rag_service.query_context(project_id, payload.prompt, ai_config.rag.enabled)
        if payload.executionMode == "quick" and payload.intentAction is None and pending_intent is not None:
            self._write_project_pending_intent(project_id, None)
            pending_intent = None
        context = self._build_context(project_id, payload, rag_context, pending_intent, explicit_context_sources)
        provider_usage: dict[str, Any] | None = None
        preflight: dict[str, Any] | None = None
        try:
            if payload.executionMode == "reasoning" and payload.intentAction is None:
                preflight = openai_service.analyze_interaction(
                    payload.model_dump(),
                    context,
                    rag_context,
                    selected_model,
                )
                provider_usage = self._pop_provider_usage(preflight)
                preflight = self._normalize_preflight(preflight)
                if preflight["executionScope"] in {"needs_clarification", "too_expensive_or_unclear"}:
                    response = self._preflight_only_response(project_id, interaction_id, payload, preflight, user_event)
                    ai_usage_service.record_provider_event(
                        project_id=project_id,
                        document_id=payload.documentId,
                        request_id=interaction_id,
                        model=selected_model,
                        usage_kind="reasoning_preflight",
                        status="completed",
                        usage=provider_usage,
                    )
                    self._append_events(project_id, [user_event, *response.conversationEvents])
                    return response.model_copy(update={
                        "conversationEvents": [user_event, *response.conversationEvents],
                        "contextSources": ai_context_service.list_sources(project_id).sources,
                        "expiredContextSourceIds": expired_context_source_ids,
                    })
                context["reasoningPreflight"] = preflight
            plan = openai_service.plan_interaction(
                payload.model_dump(),
                context,
                rag_context,
                selected_model,
            )
            provider_usage = _merge_usage(provider_usage, self._pop_provider_usage(plan))
            provider_sources = self._pop_provider_sources(plan)
            plan = self._normalize_provider_plan(plan)
            if preflight is not None:
                plan["executionScope"] = preflight["executionScope"]
            if provider_sources:
                plan["__webSources"] = provider_sources
            if self._needs_document_change_repair(payload, plan):
                repair_context = {
                    **context,
                    "contractRepair": {
                        "reason": "El plan anterior clasifico una accion directa de edicion documental, pero no incluyo documentChange.",
                        "required": "Si la peticion modifica el documento activo, devuelve documentChange con el Markdown completo actualizado. Si no era una edicion, devuelve un plan conversacional sin afirmar que has cambiado el documento.",
                        "previousPlan": _safe_plan_for_context(plan),
                    },
                }
                repaired_plan = openai_service.plan_interaction(
                    payload.model_dump(),
                    repair_context,
                    rag_context,
                    selected_model,
                )
                provider_usage = _merge_usage(provider_usage, self._pop_provider_usage(repaired_plan))
                repaired_sources = self._pop_provider_sources(repaired_plan)
                repaired_plan = self._normalize_provider_plan(repaired_plan)
                if preflight is not None:
                    repaired_plan["executionScope"] = preflight["executionScope"]
                if repaired_sources:
                    repaired_plan["__webSources"] = repaired_sources
                if repaired_plan:
                    plan = repaired_plan
        except OpenAiUnavailableError as error:
            response = self._provider_error_response(project_id, interaction_id, user_event, str(error), unavailable=True)
            return response.model_copy(update={"contextSources": ai_context_service.list_sources(project_id).sources, "expiredContextSourceIds": expired_context_source_ids})
        except Exception as error:
            provider_usage = getattr(error, "usage", None) if isinstance(error, OpenAiProviderError) else None
            if provider_usage:
                ai_usage_service.record_provider_event(
                    project_id=project_id,
                    document_id=payload.documentId,
                    request_id=interaction_id,
                    model=selected_model,
                    usage_kind=self._usage_kind(payload, None, has_image_context=has_image_context),
                    status="failed",
                    usage=provider_usage,
                    error_code=type(error).__name__,
                )
            message = str(error) if isinstance(error, OpenAiProviderError) else "OpenAI no pudo completar la interacción."
            response = self._provider_error_response(project_id, interaction_id, user_event, message, unavailable=False)
            return response.model_copy(update={"contextSources": ai_context_service.list_sources(project_id).sources, "expiredContextSourceIds": expired_context_source_ids})

        try:
            response = self._execute_plan(project_id, interaction_id, payload, plan, pending_intent)
        except HTTPException as error:
            message = _http_error_message(error)
            if provider_usage:
                ai_usage_service.record_provider_event(
                    project_id=project_id,
                    document_id=payload.documentId,
                    request_id=interaction_id,
                    model=selected_model,
                    usage_kind=self._usage_kind(payload, None, has_image_context=has_image_context),
                    status="failed",
                    usage=provider_usage,
                    error_code=type(error).__name__,
                )
            response = self._provider_error_response(project_id, interaction_id, user_event, message, unavailable=False)
            return response.model_copy(update={"contextSources": ai_context_service.list_sources(project_id).sources, "expiredContextSourceIds": expired_context_source_ids})
        except Exception as error:
            if provider_usage:
                ai_usage_service.record_provider_event(
                    project_id=project_id,
                    document_id=payload.documentId,
                    request_id=interaction_id,
                    model=selected_model,
                    usage_kind=self._usage_kind(payload, None, has_image_context=has_image_context),
                    status="failed",
                    usage=provider_usage,
                    error_code=type(error).__name__,
                )
            response = self._provider_error_response(project_id, interaction_id, user_event, "No se pudieron aplicar las acciones propuestas por la IA.", unavailable=False)
            return response.model_copy(update={"contextSources": ai_context_service.list_sources(project_id).sources, "expiredContextSourceIds": expired_context_source_ids})
        ai_usage_service.record_provider_event(
            project_id=project_id,
            document_id=payload.documentId,
            request_id=interaction_id,
            model=selected_model,
            usage_kind=self._usage_kind(payload, response, has_image_context=has_image_context),
            status="completed",
            usage=provider_usage,
        )
        self._append_events(project_id, [user_event, *response.conversationEvents])
        return response.model_copy(update={
            "conversationEvents": [user_event, *response.conversationEvents],
            "contextSources": ai_context_service.list_sources(project_id).sources,
            "expiredContextSourceIds": expired_context_source_ids,
        })

    def get_conversation(self, project_id: str) -> AiConversationResponse:
        project_service.get_project_tree(project_id)
        return AiConversationResponse(events=[AiConversationEvent(**event) for event in self._read_conversation(project_id)])

    def get_pending_intent(self, project_id: str) -> AiPendingIntent | None:
        project_service.get_project_tree(project_id)
        return self._active_pending_intent(project_id)

    def clear_conversation(self, project_id: str) -> AiConversationResponse:
        project_service.get_project_tree(project_id)
        self._conversation_store(project_id).write({"schemaVersion": 1, "events": []})
        return AiConversationResponse(events=[])

    def confirm_delete(self, project_id: str, payload: AiConfirmDeleteRequest) -> AiInteractionResponse:
        pending = self._read_pending_deletes()
        record = pending.get(payload.confirmationId)
        if not isinstance(record, dict) or record.get("projectId") != project_id:
            raise HTTPException(status_code=404, detail="Pending AI delete request not found")
        if _is_expired(record.get("createdAt"), minutes=30):
            pending.pop(payload.confirmationId, None)
            self.pending_deletes.write({"schemaVersion": 1, "items": pending})
            raise HTTPException(status_code=409, detail="Pending AI delete request expired")

        events: list[AiConversationEvent] = []
        operations: list[AiOperation] = []
        tree: list[TreeNode] | None = None
        for node_id in sorted(record.get("nodeIds", []), key=lambda value: len(value), reverse=True):
            result = project_service.delete_node(project_id, node_id)
            tree = result.tree
            path = self._path_from_node_id(node_id)
            operation = AiOperation(type="node_deleted", message=f"Eliminado {path}", nodeId=node_id, path=path)
            operations.append(operation)
            events.append(self._event(project_id, "node_deleted", "system", operation.message, path=path))

        pending.pop(payload.confirmationId, None)
        self.pending_deletes.write({"schemaVersion": 1, "items": pending})
        self._append_events(project_id, events)
        return AiInteractionResponse(
            interactionId=f"ai-{uuid4()}",
            status="completed",
            display="conversation",
            conversationEvents=events,
            operations=operations,
            tree=[node.model_dump() for node in tree] if tree is not None else None,
        )

    def get_index_status(self, project_id: str) -> AiIndexStatusResponse:
        project_service.get_project_tree(project_id)
        return self._index_status_response(project_id)

    def rebuild_index(self, project_id: str) -> AiIndexStatusResponse:
        project_root = project_service._get_project_root(project_id)
        config = config_service.get_config()
        state = rag_service.index_project(project_id, project_root)
        return self._index_status_response(project_id, state=state, globally_enabled=config.ai.rag.enabled)

    def delete_index(self, project_id: str) -> AiIndexStatusResponse:
        project_service.get_project_tree(project_id)
        state = rag_service.delete_index(project_id)
        return self._index_status_response(project_id, state=state)

    def _execute_plan(
        self,
        project_id: str,
        interaction_id: str,
        payload: AiInteractionRequest,
        plan: dict[str, Any],
        pending_intent: AiPendingIntent | None,
    ) -> AiInteractionResponse:
        ai_config = config_service.get_config().ai
        events: list[AiConversationEvent] = []
        operations: list[AiOperation] = []
        updated_document: AiUpdatedDocument | None = None
        generated_images: list[AiGeneratedImage] = []
        tree: list[dict] | None = None
        affected_documents: list[dict] = []
        pending_delete: AiPendingDelete | None = None
        active_intent = pending_intent

        interaction_type = plan.get("interactionType") if plan.get("interactionType") in INTERACTION_TYPES else "chat"
        confidence = plan.get("confidence") if plan.get("confidence") in CONFIDENCE_LEVELS else "medium"
        execution_scope = plan.get("executionScope") if plan.get("executionScope") in EXECUTION_SCOPES else None
        intent_decision = plan.get("intentDecision") if plan.get("intentDecision") in INTENT_DECISIONS else None
        ui_placement = plan.get("uiPlacement") if plan.get("uiPlacement") in UI_PLACEMENTS else None
        needs_user_clarification = bool(plan.get("needsUserClarification")) or interaction_type == "clarification"
        provider_sources = plan.get("__webSources") if isinstance(plan.get("__webSources"), list) else []
        if provider_sources:
            raw_task = plan.get("task")
            if isinstance(raw_task, dict):
                existing_sources = raw_task.get("sources") if isinstance(raw_task.get("sources"), list) else []
                raw_task["sources"] = [*existing_sources, *provider_sources]
            else:
                plan["task"] = {
                    "title": "Investigación web",
                    "status": "completed",
                    "depth": ai_config.agentic.depth,
                    "requiresWebResearch": True,
                    "webResearchAllowed": True,
                    "needsUserConfirmation": ai_config.agentic.confirmBeforeApplying,
                    "maxSteps": ai_config.agentic.maxSteps,
                    "maxDocuments": ai_config.agentic.maxDocuments,
                    "maxEstimatedCostEur": ai_config.agentic.maxEstimatedCostEur,
                    "steps": [],
                    "sources": provider_sources,
                }
        task = self._task_from_plan(plan.get("task"), ai_config)
        permission_response = self._permission_policy_response(
            project_id,
            interaction_id,
            payload,
            plan,
            task,
            interaction_type,
            confidence,
        )
        if permission_response is not None:
            return permission_response
        if payload.executionMode == "quick" and (interaction_type == "agentic_task" or task is not None):
            answer = plan.get("answer") if isinstance(plan.get("answer"), str) and plan.get("answer").strip() else (
                "Esta tarea necesita planificación. Cambia el modo del prompt a Razonar para analizarla antes de ejecutarla."
            )
            event = self._event(project_id, "assistant_message", "assistant", answer, document_id=payload.documentId)
            return AiInteractionResponse(
                interactionId=interaction_id,
                status="completed",
                display="bubble",
                uiPlacement="document_bubble",
                interactionType="clarification",
                confidence=confidence,
                executionMode=payload.executionMode,
                reasoningDepth=payload.reasoningDepth,
                executionScope="needs_clarification",
                routeToAiTab=False,
                needsUserClarification=True,
                answer=answer,
                conversationEvents=[event],
            )
        if task is not None:
            if interaction_type == "chat":
                interaction_type = "agentic_task"
            if interaction_type != "agentic_task" and task.requiresWebResearch and not task.webResearchAllowed:
                ui_placement = ui_placement or "document_bubble"

        if ui_placement is None:
            if bool(plan.get("routeToAiTab")) and interaction_type == "agentic_task":
                ui_placement = "conversation_tab"
            elif task is not None and (len(task.steps) > 2 or len(task.sources) > 1 or task.maxDocuments > 1):
                ui_placement = "conversation_tab"
            elif plan.get("display") == "none":
                ui_placement = "none"
            else:
                ui_placement = "document_bubble"
        route_to_ai_tab = ui_placement == "conversation_tab"

        if payload.executionMode == "quick" and intent_decision in {"create_intent", "update_intent", "needs_clarification"}:
            if isinstance(plan.get("documentChange"), dict) or plan.get("operations"):
                intent_decision = "execute_now"
                plan["pendingIntent"] = None
                needs_user_clarification = False
            else:
                intent_decision = None
                plan["pendingIntent"] = None

        if intent_decision == "needs_clarification":
            plan["pendingIntent"] = None
        elif intent_decision in {"create_intent", "update_intent"}:
            active_intent = self._intent_from_plan(project_id, payload, plan, active_intent)
            if active_intent is not None:
                self._write_project_pending_intent(project_id, active_intent)
        elif intent_decision == "cancel_intent":
            active_intent = self._mark_pending_intent(project_id, active_intent, "cancelled")

        answer = plan.get("answer") if isinstance(plan.get("answer"), str) else None
        if answer:
            events.append(self._event(project_id, "assistant_message", "assistant", answer, document_id=payload.documentId or (active_intent.targetDocumentId if active_intent else None)))

        document_change = plan.get("documentChange")
        if isinstance(document_change, dict):
            markdown = document_change.get("updatedMarkdown")
            summary = document_change.get("summary") if isinstance(document_change.get("summary"), str) else "Documento actualizado por IA."
            if interaction_type in {"document_edit", "mixed"}:
                target_document_id = self._document_change_target_id(project_id, payload, document_change, active_intent)
                if not target_document_id:
                    operation = self._blocked(project_id, "La IA no indicó un documento válido para aplicar el cambio.")
                    operations.append(operation)
                    events.append(self._operation_event(project_id, operation))
                elif isinstance(markdown, str) and markdown:
                    updated_document = AiUpdatedDocument(documentId=target_document_id, markdown=markdown, summary=summary)
                    path = self._document_path(target_document_id)
                    operation = AiOperation(
                        type="document_modified",
                        message=f"Documento modificado: {path}",
                        documentId=target_document_id,
                        path=path,
                        summary=summary,
                    )
                    operations.append(operation)
                    events.append(self._event(project_id, "document_modified", "system", operation.message, document_id=target_document_id, path=path, summary=summary))
                    if active_intent is not None and active_intent.status not in {"completed", "cancelled"}:
                        active_intent = self._mark_pending_intent(project_id, active_intent, "completed")
            elif isinstance(markdown, str) and markdown:
                operation = self._blocked(
                    project_id,
                    "La IA propuso cambiar el documento, pero el plan no estaba marcado como edición. No se aplicó el cambio.",
                )
                operations.append(operation)
                events.append(self._operation_event(project_id, operation))

        image_generation = plan.get("imageGeneration") if isinstance(plan.get("imageGeneration"), dict) else None
        if image_generation is not None:
            base_markdown_by_document = {updated_document.documentId: updated_document.markdown} if updated_document is not None else {}
            image_result = self._execute_image_generation(project_id, payload, image_generation, base_markdown_by_document)
            generated_images.extend(image_result["generatedImages"])
            operations.extend(image_result["operations"])
            events.extend(image_result["events"])
            tree = image_result["tree"] or tree
            if image_result["updatedDocument"] is not None:
                updated_document = image_result["updatedDocument"]
                if interaction_type == "image_generation":
                    interaction_type = "mixed"

        if task is not None:
            task_message = "Tarea IA preparada"
            if task.requiresWebResearch and not task.webResearchAllowed:
                task_message = "Tarea IA preparada; requiere permiso de investigación web."
            events.append(self._event(project_id, "task_planned", "assistant", task_message, document_id=payload.documentId or (active_intent.targetDocumentId if active_intent else None), task=task))

        for requested in plan.get("operations", []):
            if not isinstance(requested, dict):
                continue
            requested_type = requested.get("type")

            if requested_type == "create_folder":
                if not ai_config.permissions.createFolders:
                    operation = self._blocked(project_id, _permission_message("crear o mover carpetas"))
                    operations.append(operation)
                    events.append(self._operation_event(project_id, operation))
                    continue
                name = self._name_from_request(requested, "Nueva carpeta")
                parent_id = self._folder_id_from_path(project_id, requested.get("parentPath"))
                result = project_service.create_folder(project_id, CreateFolderRequest(parentId=parent_id, name=name))
                tree = [node.model_dump() for node in result.tree]
                path = result.node.path if result.node else name
                operation = AiOperation(type="folder_created", message=f"Carpeta creada: {path}", nodeId=result.node.id if result.node else None, path=path)
                operations.append(operation)
                events.append(self._event(project_id, "folder_created", "system", operation.message, path=path))

            elif requested_type == "create_document":
                if not ai_config.permissions.createDocuments:
                    operation = self._blocked(project_id, _permission_message("crear, duplicar o mover documentos"))
                    operations.append(operation)
                    events.append(self._operation_event(project_id, operation))
                    continue
                name = self._name_from_request(requested, "nuevo-documento.md")
                parent_id = self._folder_id_from_path(project_id, requested.get("parentPath"))
                markdown = requested.get("markdown") if isinstance(requested.get("markdown"), str) else ""
                result = project_service.create_document(project_id, CreateDocumentRequest(parentId=parent_id, name=name, markdown=markdown))
                tree = [node.model_dump() for node in result.tree]
                path = result.node.path if result.node else name
                operation = AiOperation(type="document_created", message=f"Documento creado: {path}", documentId=result.node.id if result.node else None, path=path)
                operations.append(operation)
                events.append(self._event(project_id, "document_created", "system", operation.message, document_id=result.node.id if result.node else None, path=path))

            elif requested_type == "duplicate_document":
                if not ai_config.permissions.createDocuments:
                    operation = self._blocked(project_id, _permission_message("crear, duplicar o mover documentos"))
                    operations.append(operation)
                    events.append(self._operation_event(project_id, operation))
                    continue
                document_id = self._document_id_from_request(project_id, requested, payload.documentId)
                if not document_id:
                    continue
                parent_id = self._folder_id_from_path(project_id, requested.get("parentPath"))
                name = requested.get("name") if isinstance(requested.get("name"), str) and requested.get("name").strip() else None
                result = project_service.duplicate_document(project_id, document_id, parent_id, name)
                tree = [node.model_dump() for node in result.tree]
                path = result.node.path if result.node else self._document_path(document_id)
                operation = AiOperation(
                    type="document_duplicated",
                    message=f"Documento duplicado: {path}",
                    documentId=result.node.id if result.node else None,
                    nodeId=result.node.id if result.node else None,
                    path=path,
                )
                operations.append(operation)
                events.append(self._event(project_id, "document_duplicated", "system", operation.message, document_id=result.node.id if result.node else None, path=path))

            elif requested_type == "move_node":
                node_id = self._node_id_from_request(project_id, requested, payload.documentId)
                if not node_id:
                    continue
                node = _find_node(project_service.get_project_tree(project_id), node_id)
                if node is None:
                    continue
                if node.type == "folder" and not ai_config.permissions.createFolders:
                    operation = self._blocked(project_id, _permission_message("crear o mover carpetas"))
                    operations.append(operation)
                    events.append(self._operation_event(project_id, operation))
                    continue
                if node.type != "folder" and not ai_config.permissions.createDocuments:
                    operation = self._blocked(project_id, _permission_message("crear, duplicar o mover documentos"))
                    operations.append(operation)
                    events.append(self._operation_event(project_id, operation))
                    continue
                parent_id = self._folder_id_from_path(project_id, requested.get("parentPath"))
                result = project_service.move_node(project_id, node_id, MoveNodeRequest(targetFolderId=parent_id))
                tree = [tree_node.model_dump() for tree_node in result.tree]
                affected_documents.extend(affected.model_dump() for affected in result.affectedDocuments)
                path = result.node.path if result.node else self._path_from_node_id(node_id)
                operation = AiOperation(
                    type="node_moved",
                    message=f"Elemento movido: {path}",
                    documentId=result.node.id if result.node and result.node.type == "document" else None,
                    nodeId=result.node.id if result.node else node_id,
                    path=path,
                )
                operations.append(operation)
                events.append(self._event(project_id, "node_moved", "system", operation.message, document_id=operation.documentId, path=path))

            elif requested_type == "delete_node":
                if not ai_config.permissions.deleteDocumentsAndFolders:
                    operation = self._blocked(project_id, _permission_message("eliminar documentos o carpetas"))
                    operations.append(operation)
                    events.append(self._operation_event(project_id, operation))
                    continue
                node_id = requested.get("nodeId") if isinstance(requested.get("nodeId"), str) else self._node_id_from_path(project_id, requested.get("path"))
                if not node_id:
                    continue
                result = project_service.delete_node(project_id, node_id)
                tree = [tree_node.model_dump() for tree_node in result.tree]
                affected_documents.extend(affected.model_dump() for affected in result.affectedDocuments)
                path = self._path_from_node_id(node_id)
                operation = AiOperation(
                    type="node_deleted",
                    message=f"Eliminado {path}",
                    nodeId=node_id,
                    paths=[path],
                )
                operations.append(operation)
                events.append(self._event(project_id, "node_deleted", "system", operation.message, paths=[path]))

        display = plan.get("display") if plan.get("display") in {"bubble", "conversation", "none"} else ("bubble" if answer else "conversation")
        if ui_placement == "conversation_tab" or pending_delete:
            display = "conversation"
        elif ui_placement == "none":
            display = "none"
        elif ui_placement == "document_bubble" and display == "conversation" and not pending_delete:
            display = "bubble"
        return AiInteractionResponse(
            interactionId=interaction_id,
            status="completed",
            display=display,
            uiPlacement=ui_placement,
            interactionType=interaction_type,
            confidence=confidence,
            executionMode=payload.executionMode,
            reasoningDepth=payload.reasoningDepth,
            executionScope=execution_scope,
            routeToAiTab=route_to_ai_tab,
            needsUserClarification=needs_user_clarification,
            pendingIntent=active_intent,
            pendingIntentStatus=active_intent.status if active_intent else None,
            answer=answer,
            conversationEvents=events,
            operations=operations,
            updatedDocument=updated_document,
            generatedImages=generated_images,
            task=task,
            tree=tree,
            affectedDocuments=affected_documents,
            requiresConfirmation=pending_delete,
        )

    def _execute_image_generation(
        self,
        project_id: str,
        payload: AiInteractionRequest,
        image_generation: dict[str, Any],
        base_markdown_by_document: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        ai_config = config_service.get_config().ai
        operations: list[AiOperation] = []
        events: list[AiConversationEvent] = []
        generated_images: list[AiGeneratedImage] = []
        tree: list[dict] | None = None
        updated_document: AiUpdatedDocument | None = None

        intent = image_generation.get("intent")
        if intent == "ask_clarification":
            operation = self._blocked(project_id, "Necesito confirmar si quieres crear la imagen como archivo o insertarla en el documento.")
            operations.append(operation)
            events.append(self._operation_event(project_id, operation))
            return {"operations": operations, "events": events, "generatedImages": generated_images, "tree": tree, "updatedDocument": updated_document}
        if intent not in {"generate_image_asset", "generate_and_insert_image"}:
            return {"operations": operations, "events": events, "generatedImages": generated_images, "tree": tree, "updatedDocument": updated_document}

        prompt = image_generation.get("prompt") if isinstance(image_generation.get("prompt"), str) else ""
        prompt = prompt.strip()
        if not prompt:
            operation = self._blocked(project_id, "La IA no preparó un prompt visual válido para generar la imagen.")
            operations.append(operation)
            events.append(self._operation_event(project_id, operation))
            return {"operations": operations, "events": events, "generatedImages": generated_images, "tree": tree, "updatedDocument": updated_document}

        image_config = ai_config.imageGeneration
        output_format = image_generation.get("format") if image_generation.get("format") in {"png", "webp", "jpeg"} else image_config.outputFormat
        model = image_generation.get("model") if image_generation.get("model") in {"gpt-image-2", "gpt-image-1.5", "gpt-image-1", "gpt-image-1-mini"} else image_config.model
        size = image_generation.get("size") if image_generation.get("size") in {"auto", "1024x1024", "1536x1024", "1024x1536"} else image_config.size
        quality = image_generation.get("quality") if image_generation.get("quality") in {"auto", "low", "medium", "high"} else image_config.quality
        alt_text = image_generation.get("altText") if isinstance(image_generation.get("altText"), str) and image_generation.get("altText").strip() else "Imagen generada"
        filename = _image_filename(image_generation.get("filename"), alt_text, output_format)

        try:
            generated = openai_service.generate_image(
                prompt=prompt,
                model=model,
                size=size,
                quality=quality,
                output_format=output_format,
            )
            parent_id = self._generated_image_parent_id(
                project_id,
                payload,
                image_config.defaultFolder,
                image_config.customFolderPath,
            )
            asset_response = asset_service.create_generated_image(
                project_id,
                parent_id,
                filename,
                generated["bytes"],
                {
                    "kind": "ai_generated_image",
                    "prompt": prompt if image_config.storePromptMetadata else None,
                    "revisedPrompt": generated.get("revisedPrompt") if image_config.storePromptMetadata else None,
                    "model": model,
                    "size": size,
                    "quality": quality,
                    "format": output_format,
                    "sourceDocumentId": payload.documentId,
                },
            )
        except (OpenAiUnavailableError, OpenAiProviderError) as error:
            operation = AiOperation(type="provider_error", status="error", message=str(error))
            operations.append(operation)
            events.append(self._event(project_id, "provider_error", "system", operation.message))
            return {"operations": operations, "events": events, "generatedImages": generated_images, "tree": tree, "updatedDocument": updated_document}

        asset = asset_response.asset
        should_insert = intent == "generate_and_insert_image" or bool(image_generation.get("insertIntoDocument"))
        ai_usage_service.record_image_generation_event(
            project_id=project_id,
            document_id=payload.documentId,
            request_id=f"{payload.clientMessageId}:image:{asset.path}",
            model=str(generated.get("model") or model),
            size=str(generated.get("size") or size),
            quality=str(generated.get("quality") or quality),
            output_format=str(generated.get("format") or output_format),
            image_count=1,
            metadata={"assetPath": asset.path, "insertRequested": should_insert},
        )
        tree = [node.model_dump() for node in asset_response.tree]
        operation = AiOperation(type="image_generated", message=f"Imagen creada: {asset.path}", nodeId=asset.id, path=asset.path)
        operations.append(operation)
        events.append(self._event(project_id, "image_generated", "system", operation.message, path=asset.path))

        markdown_reference: str | None = None
        inserted_document_id: str | None = None
        if should_insert and image_config.confirmBeforeDocumentInsert:
            blocked = self._blocked(project_id, "La imagen quedó creada como archivo del proyecto. La inserción automática está desactivada en Configuración de la app > IA.")
            operations.append(blocked)
            events.append(self._operation_event(project_id, blocked))
        elif should_insert and not ai_config.permissions.insertImagesIntoDocuments:
            blocked = self._blocked(project_id, _permission_message("insertar imágenes en documentos"))
            operations.append(blocked)
            events.append(self._operation_event(project_id, blocked))
        elif should_insert and not ai_config.permissions.editDocuments:
            blocked = self._blocked(project_id, _permission_message("editar documentos"))
            operations.append(blocked)
            events.append(self._operation_event(project_id, blocked))
        elif should_insert:
            target_document_id = image_generation.get("targetDocumentId") if isinstance(image_generation.get("targetDocumentId"), str) else payload.documentId
            if target_document_id and self._document_id_belongs_to_project(project_id, target_document_id):
                try:
                    reference = asset_service.build_markdown_reference(project_id, target_document_id, asset.id, alt_text)
                    base_markdown = (
                        (base_markdown_by_document or {}).get(target_document_id)
                        or (payload.activeMarkdown if target_document_id == payload.documentId else document_service.get_document(target_document_id).markdown)
                    )
                    updated_markdown = _insert_image_markdown(base_markdown, reference.markdown, payload.selectionFocus if target_document_id == payload.documentId else None)
                    updated_document = AiUpdatedDocument(
                        documentId=target_document_id,
                        markdown=updated_markdown,
                        summary=f"Imagen insertada: {asset.name}",
                    )
                    markdown_reference = reference.markdown
                    inserted_document_id = target_document_id
                    path = self._document_path(target_document_id)
                    inserted_operation = AiOperation(
                        type="image_inserted",
                        message=f"Imagen insertada en {path}: {asset.name}",
                        documentId=target_document_id,
                        nodeId=asset.id,
                        path=asset.path,
                        summary=f"Referencia Markdown añadida: {asset.name}",
                    )
                    operations.append(inserted_operation)
                    events.append(self._event(project_id, "image_inserted", "system", inserted_operation.message, document_id=target_document_id, path=asset.path, summary=inserted_operation.summary))
                except HTTPException as error:
                    blocked = self._blocked(project_id, _http_error_message(error))
                    operations.append(blocked)
                    events.append(self._operation_event(project_id, blocked))
            else:
                blocked = self._blocked(project_id, "No hay un documento activo válido para insertar la imagen.")
                operations.append(blocked)
                events.append(self._operation_event(project_id, blocked))

        source_selection = None
        if payload.selectionFocus and isinstance(payload.selectionFocus.text, str) and payload.selectionFocus.text.strip():
            source_selection = {
                "from": payload.selectionFocus.from_,
                "to": payload.selectionFocus.to,
                "text": _truncate_text(payload.selectionFocus.text, 500),
            }
        generated_images.append(
            AiGeneratedImage(
                asset=asset.model_dump(),
                prompt=prompt,
                revisedPrompt=generated.get("revisedPrompt"),
                altText=alt_text,
                markdownReference=markdown_reference,
                insertedIntoDocumentId=inserted_document_id,
                sourceDocumentId=payload.documentId,
                sourceSelection=source_selection,
                model=model,
                size=size,
                quality=quality,
                format=output_format,
            )
        )
        return {"operations": operations, "events": events, "generatedImages": generated_images, "tree": tree, "updatedDocument": updated_document}

    def _permission_policy_response(
        self,
        project_id: str,
        interaction_id: str,
        payload: AiInteractionRequest,
        plan: dict[str, Any],
        task: AiAgenticTask | None,
        interaction_type: str,
        confidence: str,
    ) -> AiInteractionResponse | None:
        ai_config = config_service.get_config().ai
        blocked_action: str | None = None

        if isinstance(plan.get("documentChange"), dict) and not ai_config.permissions.editDocuments:
            blocked_action = "editar documentos"

        if blocked_action is None:
            for requested in plan.get("operations", []):
                if not isinstance(requested, dict):
                    continue
                requested_type = requested.get("type")
                if requested_type == "create_folder" and not ai_config.permissions.createFolders:
                    blocked_action = "crear o mover carpetas"
                elif requested_type in {"create_document", "duplicate_document"} and not ai_config.permissions.createDocuments:
                    blocked_action = "crear, duplicar o mover documentos"
                elif requested_type == "move_node":
                    node_id = self._node_id_from_request(project_id, requested, payload.documentId)
                    node = _find_node(project_service.get_project_tree(project_id), node_id) if node_id else None
                    is_folder = node is not None and node.type == "folder"
                    if is_folder and not ai_config.permissions.createFolders:
                        blocked_action = "crear o mover carpetas"
                    elif not is_folder and not ai_config.permissions.createDocuments:
                        blocked_action = "crear, duplicar o mover documentos"
                elif requested_type == "delete_node" and not ai_config.permissions.deleteDocumentsAndFolders:
                    blocked_action = "eliminar documentos o carpetas"
                if blocked_action is not None:
                    break

        image_generation = plan.get("imageGeneration") if isinstance(plan.get("imageGeneration"), dict) else None
        if blocked_action is None and image_generation is not None:
            intent = image_generation.get("intent")
            if intent in {"generate_image_asset", "generate_and_insert_image"}:
                if not ai_config.imageGeneration.enabled:
                    blocked_action = "generar imágenes porque la generación está desactivada"
                elif not ai_config.permissions.generateImages:
                    blocked_action = "generar imágenes"
                elif not ai_config.permissions.createImageAssets:
                    blocked_action = "crear archivos de imagen en el proyecto"
                elif (
                    not ai_config.permissions.useDocumentContextForImageGeneration
                    and (payload.documentId or payload.selectionFocus or payload.contextSourceIds)
                ):
                    blocked_action = "usar contexto documental para generar imágenes"

        if blocked_action is None and self._plan_requires_web(plan, task) and not ai_config.agentic.webResearchEnabled:
            blocked_action = "usar investigación web"

        if blocked_action is None:
            return None

        message = _permission_message(blocked_action)
        operation = self._blocked(project_id, message)
        event = self._operation_event(project_id, operation)
        return AiInteractionResponse(
            interactionId=interaction_id,
            status="blocked",
            display="bubble",
            uiPlacement="document_bubble",
            interactionType=interaction_type if interaction_type in INTERACTION_TYPES else "chat",
            confidence=confidence if confidence in CONFIDENCE_LEVELS else "medium",
            executionMode=payload.executionMode,
            reasoningDepth=payload.reasoningDepth,
            executionScope="needs_permission",
            routeToAiTab=False,
            needsUserClarification=False,
            answer=message,
            conversationEvents=[event],
            operations=[operation],
        )

    def _plan_requires_web(self, plan: dict[str, Any], task: AiAgenticTask | None) -> bool:
        raw_intent = plan.get("pendingIntent") if isinstance(plan.get("pendingIntent"), dict) else {}
        return bool(
            plan.get("requiresWebResearch")
            or raw_intent.get("requiresWebResearch")
            or (task is not None and task.requiresWebResearch)
        )

    def _normalize_provider_plan(self, plan: dict[str, Any]) -> dict[str, Any]:
        if not isinstance(plan, dict):
            return {}

        normalized = dict(plan)
        operations = normalized.get("operations")
        if not isinstance(operations, list):
            normalized["operations"] = []
            operations = []

        normalized_operations: list[dict[str, Any]] = []
        legacy_document_change: dict[str, Any] | None = None
        explicit_interaction_type = normalized.get("interactionType") in INTERACTION_TYPES

        for operation in operations:
            if not isinstance(operation, dict):
                continue
            if operation.get("type") == "document_modified":
                markdown = operation.get("updatedMarkdown") or operation.get("markdown")
                if isinstance(markdown, str) and markdown and legacy_document_change is None:
                    summary = operation.get("summary") if isinstance(operation.get("summary"), str) else "Documento actualizado por IA."
                    legacy_document_change = {
                        "updatedMarkdown": markdown,
                        "summary": summary,
                        "targetDocumentId": operation.get("targetDocumentId") if isinstance(operation.get("targetDocumentId"), str) else None,
                    }
                continue
            normalized_operations.append(operation)

        if legacy_document_change and normalized.get("documentChange") is None:
            normalized["documentChange"] = legacy_document_change
            if not explicit_interaction_type:
                normalized["interactionType"] = "document_edit"

        normalized["operations"] = normalized_operations
        if normalized.get("intentDecision") not in INTENT_DECISIONS:
            normalized["intentDecision"] = None
        if normalized.get("uiPlacement") not in UI_PLACEMENTS:
            normalized["uiPlacement"] = None
        if normalized.get("executionScope") not in EXECUTION_SCOPES:
            normalized["executionScope"] = None
        image_generation = normalized.get("imageGeneration")
        if not isinstance(image_generation, dict) or image_generation.get("intent") not in {"none", "generate_image_asset", "generate_and_insert_image", "ask_clarification"}:
            normalized["imageGeneration"] = None
        return normalized

    def _normalize_preflight(self, preflight: dict[str, Any]) -> dict[str, Any]:
        normalized = preflight if isinstance(preflight, dict) else {}
        scope = normalized.get("executionScope")
        ui_placement = normalized.get("uiPlacement")
        confidence = normalized.get("confidence")
        return {
            "executionScope": scope if scope in EXECUTION_SCOPES else "direct_action",
            "uiPlacement": ui_placement if ui_placement in UI_PLACEMENTS else "document_bubble",
            "confidence": confidence if confidence in CONFIDENCE_LEVELS else "medium",
            "requiresWebResearch": bool(normalized.get("requiresWebResearch")),
            "estimatedSteps": _int_between(normalized.get("estimatedSteps"), 1, 99, 1),
            "estimatedAffectedDocuments": _int_between(normalized.get("estimatedAffectedDocuments"), 0, 999, 0),
            "requiresCheckpoint": bool(normalized.get("requiresCheckpoint")),
            "reason": normalized.get("reason") if isinstance(normalized.get("reason"), str) else "",
            "answer": normalized.get("answer") if isinstance(normalized.get("answer"), str) else None,
        }

    def _preflight_only_response(
        self,
        project_id: str,
        interaction_id: str,
        payload: AiInteractionRequest,
        preflight: dict[str, Any],
        user_event: AiConversationEvent,
    ) -> AiInteractionResponse:
        answer = preflight.get("answer") or preflight.get("reason") or "Necesito una aclaración antes de continuar."
        event = self._event(project_id, "assistant_message", "assistant", str(answer), document_id=payload.documentId)
        return AiInteractionResponse(
            interactionId=interaction_id,
            status="completed",
            display="bubble",
            uiPlacement="document_bubble",
            interactionType="clarification",
            confidence=preflight.get("confidence") if preflight.get("confidence") in CONFIDENCE_LEVELS else "medium",
            executionMode=payload.executionMode,
            reasoningDepth=payload.reasoningDepth,
            executionScope=preflight.get("executionScope") if preflight.get("executionScope") in EXECUTION_SCOPES else "needs_clarification",
            routeToAiTab=False,
            needsUserClarification=True,
            answer=str(answer),
            conversationEvents=[event],
        )

    def _pop_provider_usage(self, plan: dict[str, Any]) -> dict[str, Any] | None:
        usage = plan.pop("__openaiUsage", None)
        return usage if isinstance(usage, dict) else None

    def _pop_provider_sources(self, plan: dict[str, Any]) -> list[dict[str, Any]]:
        sources = plan.pop("__webSources", None)
        return sources if isinstance(sources, list) else []

    def _needs_document_change_repair(self, payload: AiInteractionRequest, plan: dict[str, Any]) -> bool:
        if not payload.documentId or not isinstance(payload.activeMarkdown, str):
            return False
        if isinstance(plan.get("documentChange"), dict) or plan.get("operations") or plan.get("task"):
            return False
        if plan.get("intentDecision") in {"create_intent", "update_intent", "needs_clarification"}:
            return False
        return plan.get("interactionType") == "document_edit" or plan.get("executionScope") == "direct_action"

    def _task_from_plan(self, raw_task: object, ai_config: Any) -> AiAgenticTask | None:
        if not isinstance(raw_task, dict):
            return None

        task_data = dict(raw_task)
        agentic = ai_config.agentic
        task_data["depth"] = task_data.get("depth") if task_data.get("depth") in {"quick", "guided", "deep", "bounded_autonomous"} else agentic.depth
        task_data["webResearchAllowed"] = bool(task_data.get("webResearchAllowed")) and agentic.webResearchEnabled
        task_data["needsUserConfirmation"] = bool(task_data.get("needsUserConfirmation", agentic.confirmBeforeApplying)) or agentic.confirmBeforeApplying
        task_data["maxSteps"] = _int_between(task_data.get("maxSteps"), 1, agentic.maxSteps, agentic.maxSteps)
        task_data["maxDocuments"] = _int_between(task_data.get("maxDocuments"), 1, agentic.maxDocuments, agentic.maxDocuments)
        task_data["maxEstimatedCostEur"] = _float_between(
            task_data.get("maxEstimatedCostEur"),
            0.1,
            agentic.maxEstimatedCostEur,
            agentic.maxEstimatedCostEur,
        )
        if not isinstance(task_data.get("steps"), list):
            task_data["steps"] = []
        task_data["steps"] = task_data["steps"][: agentic.maxSteps]
        if not isinstance(task_data.get("sources"), list):
            task_data["sources"] = []
        task_data["sources"] = task_data["sources"][: agentic.maxSources]
        try:
            return AiAgenticTask(**task_data)
        except Exception:
            return None

    def _usage_kind(self, payload: AiInteractionRequest, response: AiInteractionResponse | None, *, has_image_context: bool = False) -> str:
        if response and response.interactionType == "agentic_task":
            return "agentic_task"
        if response and any(operation.type == "document_modified" for operation in response.operations):
            return "document_edit"
        if response and any(operation.type in {"document_created", "folder_created", "document_duplicated", "node_moved", "delete_requested"} for operation in response.operations):
            return "document_operation"
        if response and any(operation.type in {"image_generated", "image_inserted"} for operation in response.operations):
            return "image_generation"
        if has_image_context:
            return "vision"
        if payload.mode == "document":
            return "chat"
        return "project_chat"

    def _provider_error_response(self, project_id: str, interaction_id: str, user_event: AiConversationEvent, message: str, unavailable: bool) -> AiInteractionResponse:
        operation_type = "provider_unavailable" if unavailable else "provider_error"
        operation = AiOperation(type=operation_type, status="blocked" if unavailable else "error", message=message)
        event = self._event(project_id, operation_type, "system", message)
        self._append_events(project_id, [user_event, event])
        return AiInteractionResponse(
            interactionId=interaction_id,
            status="blocked" if unavailable else "error",
            display="conversation",
            answer=message,
            operations=[operation],
            conversationEvents=[user_event, event],
        )

    def _build_context(
        self,
        project_id: str,
        payload: AiInteractionRequest,
        rag_context: dict[str, Any] | None = None,
        pending_intent: AiPendingIntent | None = None,
        explicit_context_sources: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        tree = project_service.get_project_tree(project_id)
        ai_config = config_service.get_config().ai
        context: dict[str, Any] = {
            "tree": _tree_context(tree, payload),
            "activeDocument": None,
            "activeDocumentFolder": None,
            "selectionFocus": self._selection_focus_context(payload),
            "execution": {
                "mode": payload.executionMode,
                "reasoningDepth": payload.reasoningDepth,
                "rule": "quick never opens agentic task; reasoning may preflight then choose direct or agentic.",
            },
            "agentic": ai_config.agentic.model_dump(),
            "vision": ai_config.vision.model_dump(),
            "permissions": {
                "editDocuments": ai_config.permissions.editDocuments,
                "createFolders": ai_config.permissions.createFolders,
                "createDocuments": ai_config.permissions.createDocuments,
                "deleteDocumentsAndFolders": ai_config.permissions.deleteDocumentsAndFolders,
                "generateImages": ai_config.permissions.generateImages,
                "createImageAssets": ai_config.permissions.createImageAssets,
                "insertImagesIntoDocuments": ai_config.permissions.insertImagesIntoDocuments,
                "useDocumentContextForImageGeneration": ai_config.permissions.useDocumentContextForImageGeneration,
                "webResearchEnabled": ai_config.agentic.webResearchEnabled,
                "policy": "Si el permiso necesario esta activo, ejecuta directamente. Si esta inactivo, devuelve una accion bloqueada; no pidas permiso en la conversacion.",
            },
            "imageGeneration": {
                **ai_config.imageGeneration.model_dump(),
                "capabilities": [
                    "generate_image_asset",
                    "generate_and_insert_image",
                    "ask_clarification",
                ],
                "rule": "Decide semanticamente si el usuario necesita una imagen. No dependas de palabras concretas, idioma, regex ni frases fijas. Toda imagen generada se guarda primero como archivo del proyecto.",
            },
            "projectSearch": {
                "exactMatches": (rag_context or {}).get("exactMatches", []),
            },
            "explicitSources": {
                "purpose": "Fuentes visibles como chips en el prompt. Si aparecen aquí, el usuario espera que se usen como contexto activo.",
                "priority": "Prioridad alta después del documento activo y del prompt actual. Cita name/path cuando bases una afirmación en una fuente.",
                "sources": explicit_context_sources or [],
            },
            "recentConversation": self._recent_conversation_context(project_id, payload),
            "pendingIntent": pending_intent.model_dump() if pending_intent else None,
            "clientContext": payload.clientContext.model_dump() if payload.clientContext else None,
        }
        if payload.documentId:
            try:
                document = document_service.get_document(payload.documentId)
                context["activeDocument"] = {
                    "id": document.id,
                    "path": document.path,
                    "markdown": payload.activeMarkdown or document.markdown,
                    "conflictStatus": document.conflictStatus,
                }
                context["activeDocumentFolder"] = self._active_document_folder_context(tree, document.path)
            except HTTPException:
                context["activeDocument"] = {"id": payload.documentId, "markdown": payload.activeMarkdown}
        return context

    def _selection_focus_context(self, payload: AiInteractionRequest) -> dict[str, Any] | None:
        focus = payload.selectionFocus
        if focus is None or not isinstance(focus.text, str) or not focus.text.strip():
            return None
        if payload.documentId and focus.documentId and focus.documentId != payload.documentId:
            return None

        return {
            "purpose": "Texto seleccionado por el usuario como foco de atencion para el prompt actual. No sustituye al documento completo.",
            "priority": "Usalo para resolver referencias como 'lo', 'este texto' o 'esto'. La modificacion puede afectar otras partes si el prompt lo pide.",
            "documentId": focus.documentId or payload.documentId,
            "path": focus.path,
            "from": focus.from_,
            "to": focus.to,
            "text": _truncate_text(focus.text, 4000),
        }

    def _active_document_folder_context(self, tree: list[TreeNode], document_path: str | None) -> dict[str, str | None] | None:
        if not document_path:
            return {"id": None, "path": "", "name": ""}
        normalized_path = document_path.replace("\\", "/").strip("/")
        if "/" not in normalized_path:
            return {"id": None, "path": "", "name": ""}
        folder_path = normalized_path.rsplit("/", 1)[0]
        folder = _find_node_by_path(tree, folder_path)
        return {
            "id": folder.id if folder and folder.type == "folder" else None,
            "path": folder_path,
            "name": folder_path.split("/")[-1] if folder_path else "",
        }

    def _recent_conversation_context(self, project_id: str, payload: AiInteractionRequest) -> dict[str, Any]:
        events = self._read_conversation(project_id)
        candidates: list[tuple[int, int, dict[str, Any]]] = []
        for index, event in enumerate(events):
            item = self._conversation_context_item(event, payload)
            if item is None:
                continue
            event_document_id = event.get("documentId")
            priority = 0 if payload.documentId and event_document_id == payload.documentId else 1
            candidates.append((priority, index, item))

        selected: list[dict[str, Any]] = []
        total_chars = 0
        for _priority, _index, item in sorted(candidates, key=lambda candidate: (candidate[0], -candidate[1])):
            content_length = len(str(item.get("content") or ""))
            if total_chars + content_length > RECENT_CONVERSATION_MAX_TOTAL_CHARS and selected:
                continue
            selected.append(item)
            total_chars += content_length
            if len(selected) >= RECENT_CONVERSATION_MAX_EVENTS:
                break

        selected.sort(key=lambda item: str(item.get("createdAt") or ""))
        return {
            "purpose": "Ayuda a resolver referencias recientes como 'eso', 'lo anterior' o 'ahora'.",
            "priority": "Prioridad baja: documento activo actual > prompt actual > operaciones recientes > conversación reciente.",
            "events": selected,
        }

    def _conversation_context_item(self, event: dict[str, Any], payload: AiInteractionRequest) -> dict[str, Any] | None:
        event_type = event.get("type")
        if event_type not in RECENT_CONVERSATION_EVENT_TYPES:
            return None
        event_document_id = event.get("documentId")
        if payload.mode == "document" and payload.documentId and event_document_id and event_document_id != payload.documentId:
            return None

        content = _event_context_content(event)
        if not content:
            return None

        return {
            "type": event_type,
            "role": event.get("role") if event.get("role") in {"user", "assistant", "system"} else "system",
            "content": _truncate_text(content, RECENT_CONVERSATION_MAX_EVENT_CHARS),
            "documentId": event_document_id,
            "path": event.get("path"),
            "paths": event.get("paths") if isinstance(event.get("paths"), list) else [],
            "createdAt": event.get("createdAt"),
        }

    def _event(
        self,
        project_id: str,
        event_type: str,
        role: str,
        content: str,
        document_id: str | None = None,
        path: str | None = None,
        paths: list[str] | None = None,
        summary: str | None = None,
        task: AiAgenticTask | None = None,
        sources_used: list[AiContextSourceRef] | None = None,
    ) -> AiConversationEvent:
        return AiConversationEvent(
            id=f"event-{uuid4()}",
            projectId=project_id,
            type=event_type,
            role=role,
            content=content,
            createdAt=_now_iso(),
            documentId=document_id,
            path=path,
            paths=paths or [],
            summary=summary,
            task=task,
            sourcesUsed=sources_used or [],
        )

    def _blocked(self, project_id: str, message: str) -> AiOperation:
        return AiOperation(type="permission_blocked", status="blocked", message=message)

    def _operation_event(self, project_id: str, operation: AiOperation) -> AiConversationEvent:
        return self._event(project_id, operation.type, "system", operation.message, path=operation.path, paths=operation.paths, summary=operation.summary)

    def _conversation_store(self, project_id: str) -> JsonFileStore:
        return JsonFileStore(f"ai-conversations/{project_id}.json")

    def _read_conversation(self, project_id: str) -> list[dict[str, Any]]:
        data = self._conversation_store(project_id).read({"schemaVersion": 1, "events": []})
        events = data.get("events")
        return events if isinstance(events, list) else []

    def _append_events(self, project_id: str, events: list[AiConversationEvent]) -> None:
        data = self._conversation_store(project_id).read({"schemaVersion": 1, "events": []})
        current_events = data.get("events") if isinstance(data.get("events"), list) else []
        current_events.extend(event.model_dump() for event in events)
        self._conversation_store(project_id).write({"schemaVersion": 1, "events": current_events})

    def _handle_intent_action(
        self,
        project_id: str,
        interaction_id: str,
        payload: AiInteractionRequest,
        pending_intent: AiPendingIntent | None,
    ) -> AiInteractionResponse | None:
        action = payload.intentAction
        if action is None:
            return None
        if pending_intent is None or action.intentId != pending_intent.id:
            raise HTTPException(status_code=404, detail="Pending AI intent not found")

        user_event = self._event(project_id, "user_message", "user", _intent_action_event_content(payload), document_id=pending_intent.targetDocumentId)
        if action.type == "cancel":
            updated_intent = self._mark_pending_intent(project_id, pending_intent, "cancelled")
            answer = "Solicitud cancelada."
            assistant_event = self._event(project_id, "assistant_message", "assistant", answer, document_id=pending_intent.targetDocumentId)
            self._append_events(project_id, [user_event, assistant_event])
            return AiInteractionResponse(
                interactionId=interaction_id,
                status="completed",
                display="bubble",
                uiPlacement="document_bubble",
                answer=answer,
                pendingIntent=updated_intent,
                pendingIntentStatus=updated_intent.status,
                conversationEvents=[user_event, assistant_event],
            )

        if action.type == "allow_web_research":
            updated_intent = pending_intent.model_copy(
                update={
                    "webResearchAllowed": True,
                    "status": "ready",
                    "updatedAt": _now_iso(),
                }
            )
            self._write_project_pending_intent(project_id, updated_intent)
            answer = "Búsqueda web autorizada. Puedes aplicar la intención cuando quieras."
            assistant_event = self._event(project_id, "assistant_message", "assistant", answer, document_id=pending_intent.targetDocumentId)
            self._append_events(project_id, [user_event, assistant_event])
            return AiInteractionResponse(
                interactionId=interaction_id,
                status="completed",
                display="bubble",
                uiPlacement="document_bubble",
                answer=answer,
                pendingIntent=updated_intent,
                pendingIntentStatus=updated_intent.status,
                conversationEvents=[user_event, assistant_event],
            )

        if action.type == "apply":
            if pending_intent.status == "awaiting_web_permission" and not pending_intent.webResearchAllowed:
                answer = "Esta intención requiere permiso de búsqueda web antes de aplicarse."
                assistant_event = self._event(project_id, "assistant_message", "assistant", answer, document_id=pending_intent.targetDocumentId)
                self._append_events(project_id, [user_event, assistant_event])
                return AiInteractionResponse(
                    interactionId=interaction_id,
                    status="blocked",
                    display="bubble",
                    uiPlacement="document_bubble",
                    answer=answer,
                    pendingIntent=pending_intent,
                    pendingIntentStatus=pending_intent.status,
                    conversationEvents=[user_event, assistant_event],
                )
            self._write_project_pending_intent(project_id, pending_intent.model_copy(update={"status": "running", "updatedAt": _now_iso()}))
            return None

        raise HTTPException(status_code=400, detail="Unsupported pending intent action")

    def _active_pending_intent(self, project_id: str) -> AiPendingIntent | None:
        data = self.pending_intents.read({"schemaVersion": 1, "items": {}})
        items = data.get("items") if isinstance(data.get("items"), dict) else {}
        raw_intent = items.get(project_id)
        if not isinstance(raw_intent, dict):
            return None
        try:
            intent = AiPendingIntent(**raw_intent)
        except Exception:
            self._write_project_pending_intent(project_id, None)
            return None
        if intent.status in {"completed", "cancelled"} or _is_past_iso(intent.expiresAt):
            self._write_project_pending_intent(project_id, None)
            return None
        return intent

    def _write_project_pending_intent(self, project_id: str, intent: AiPendingIntent | None) -> None:
        data = self.pending_intents.read({"schemaVersion": 1, "items": {}})
        items = data.get("items") if isinstance(data.get("items"), dict) else {}
        if intent is None:
            items.pop(project_id, None)
        else:
            items[project_id] = intent.model_dump()
        self.pending_intents.write({"schemaVersion": 1, "items": items})

    def _mark_pending_intent(self, project_id: str, intent: AiPendingIntent | None, status: str) -> AiPendingIntent | None:
        if intent is None or status not in INTENT_STATUSES:
            return intent
        updated = intent.model_copy(update={"status": status, "updatedAt": _now_iso()})
        if status in {"completed", "cancelled"}:
            self._write_project_pending_intent(project_id, None)
        else:
            self._write_project_pending_intent(project_id, updated)
        return updated

    def _intent_from_plan(
        self,
        project_id: str,
        payload: AiInteractionRequest,
        plan: dict[str, Any],
        current_intent: AiPendingIntent | None,
    ) -> AiPendingIntent | None:
        raw = plan.get("pendingIntent")
        raw_intent = raw if isinstance(raw, dict) else {}
        now = _now_iso()
        document_change = plan.get("documentChange") if isinstance(plan.get("documentChange"), dict) else {}
        target_document_id = (
            raw_intent.get("targetDocumentId")
            if isinstance(raw_intent.get("targetDocumentId"), str)
            else document_change.get("targetDocumentId")
            if isinstance(document_change.get("targetDocumentId"), str)
            else payload.documentId
            or (payload.clientContext.lastDocumentId if payload.clientContext else None)
            or (current_intent.targetDocumentId if current_intent else None)
        )
        if target_document_id and not self._document_id_belongs_to_project(project_id, target_document_id):
            target_document_id = None
        target_path = raw_intent.get("targetPath") if isinstance(raw_intent.get("targetPath"), str) else None
        if not target_path and target_document_id:
            target_path = self._document_path(target_document_id)
        goal = raw_intent.get("goal") if isinstance(raw_intent.get("goal"), str) and raw_intent.get("goal").strip() else payload.prompt.strip()
        proposed_action = raw_intent.get("proposedAction") if raw_intent.get("proposedAction") in INTENT_ACTIONS else "project_operation"
        if target_document_id and proposed_action == "project_operation":
            proposed_action = "edit_document"
        requires_web = bool(raw_intent.get("requiresWebResearch") or plan.get("requiresWebResearch"))
        web_allowed = bool(raw_intent.get("webResearchAllowed") or (current_intent.webResearchAllowed if current_intent else False))
        status = raw_intent.get("status") if raw_intent.get("status") in INTENT_STATUSES else None
        if status is None:
            status = "awaiting_web_permission" if requires_web and not web_allowed else "awaiting_decision"
        if status == "awaiting_web_permission" and web_allowed:
            status = "ready"
        return AiPendingIntent(
            id=(raw_intent.get("id") if isinstance(raw_intent.get("id"), str) and raw_intent.get("id") else current_intent.id if current_intent else f"intent-{uuid4()}"),
            projectId=project_id,
            originDocumentId=payload.documentId or (current_intent.originDocumentId if current_intent else None),
            targetDocumentId=target_document_id,
            targetPath=target_path,
            goal=goal or "Solicitud pendiente de IA",
            proposedAction=proposed_action,
            requiresWebResearch=requires_web,
            webResearchAllowed=web_allowed,
            status=status,
            createdAt=current_intent.createdAt if current_intent else now,
            updatedAt=now,
            expiresAt=_expires_at_iso(hours=INTENT_TTL_HOURS),
        )

    def _document_change_target_id(
        self,
        project_id: str,
        payload: AiInteractionRequest,
        document_change: dict[str, Any],
        pending_intent: AiPendingIntent | None,
    ) -> str | None:
        candidates = [
            document_change.get("targetDocumentId") if isinstance(document_change.get("targetDocumentId"), str) else None,
            pending_intent.targetDocumentId if pending_intent else None,
            payload.documentId,
            payload.clientContext.lastDocumentId if payload.clientContext else None,
        ]
        for candidate in candidates:
            if candidate and self._document_id_belongs_to_project(project_id, candidate):
                return candidate
        return None

    def _document_id_belongs_to_project(self, project_id: str, document_id: str) -> bool:
        node = _find_node(project_service.get_project_tree(project_id), document_id)
        return node is not None and node.type == "document"

    def _read_pending_deletes(self) -> dict[str, Any]:
        data = self.pending_deletes.read({"schemaVersion": 1, "items": {}})
        items = data.get("items")
        if not isinstance(items, dict):
            return {}
        active_items = {
            key: value
            for key, value in items.items()
            if isinstance(value, dict) and not _is_expired(value.get("createdAt"), minutes=30)
        }
        if len(active_items) != len(items):
            self.pending_deletes.write({"schemaVersion": 1, "items": active_items})
        return active_items

    def _index_status_response(self, project_id: str, state: RagIndexState | None = None, globally_enabled: bool | None = None) -> AiIndexStatusResponse:
        configured_rag = config_service.get_config().ai.rag
        state = state or rag_service.get_status(project_id, configured_rag.enabled if globally_enabled is None else globally_enabled)
        return AiIndexStatusResponse(
            projectId=project_id,
            enabled=state.enabled,
            status=state.status,
            vectorStoreId=state.vector_store_id,
            lastIndexedAt=state.last_indexed_at,
            error=state.error,
            documentCount=state.document_count,
            indexedDocumentCount=state.indexed_document_count,
            pendingDocumentCount=state.pending_document_count,
            failedDocumentCount=state.failed_document_count,
            deletedDocumentCount=state.deleted_document_count,
            localExactReady=state.local_exact_ready,
        )

    def _create_pending_delete(self, project_id: str, node_ids: list[str]) -> AiPendingDelete:
        tree = project_service.get_project_tree(project_id)
        paths: list[str] = []
        document_count = 0
        for node_id in node_ids:
            node = _find_node(tree, node_id)
            if node is None:
                raise HTTPException(status_code=404, detail="Node not found")
            paths.append(node.path or node.name)
            document_count += _count_documents(node)
        confirmation_id = f"delete-{uuid4()}"
        pending = self._read_pending_deletes()
        pending[confirmation_id] = {
            "projectId": project_id,
            "nodeIds": node_ids,
            "paths": paths,
            "documentCount": document_count,
            "createdAt": _now_iso(),
        }
        self.pending_deletes.write({"schemaVersion": 1, "items": pending})
        return AiPendingDelete(confirmationId=confirmation_id, nodeIds=node_ids, paths=paths, documentCount=document_count)

    def _folder_id_from_path(self, project_id: str, path: object) -> str | None:
        if not isinstance(path, str) or not path.strip():
            return None
        node = _find_node_by_path(project_service.get_project_tree(project_id), path.strip())
        if node is None or node.type != "folder":
            raise HTTPException(status_code=404, detail="AI target folder not found")
        return node.id

    def _generated_image_parent_id(self, project_id: str, payload: AiInteractionRequest, default_folder: str, custom_folder_path: str) -> str | None:
        if default_folder == "generated_assets":
            return self._ensure_generated_assets_folder(project_id)
        if default_folder == "custom_folder":
            return self._ensure_folder_path(project_id, custom_folder_path)
        if payload.documentId:
            try:
                document_path = self._document_path(payload.documentId)
                parent_path = str(Path(document_path).parent).replace("\\", "/")
                if parent_path and parent_path != ".":
                    return self._folder_id_from_path(project_id, parent_path)
            except HTTPException:
                return None
        return None

    def _ensure_generated_assets_folder(self, project_id: str) -> str | None:
        return self._ensure_folder_path(project_id, "assets/generated")

    def _ensure_folder_path(self, project_id: str, folder_path: str) -> str | None:
        normalized_path = self._normalize_generated_folder_path(folder_path)
        existing = _find_node_by_path(project_service.get_project_tree(project_id), normalized_path)
        if existing is not None:
            if existing.type != "folder":
                raise HTTPException(status_code=409, detail="AI image destination path is not a folder")
            return existing.id

        parent_id: str | None = None
        current_path = ""
        for part in normalized_path.split("/"):
            current_path = f"{current_path}/{part}" if current_path else part
            node = _find_node_by_path(project_service.get_project_tree(project_id), current_path)
            if node is not None:
                if node.type != "folder":
                    raise HTTPException(status_code=409, detail="AI image destination path is not a folder")
                parent_id = node.id
                continue
            created = project_service.create_folder(project_id, CreateFolderRequest(parentId=parent_id, name=part))
            if created.node is None or created.node.type != "folder":
                return None
            parent_id = created.node.id
        return parent_id

    def _normalize_generated_folder_path(self, folder_path: str | None) -> str:
        normalized = (folder_path or "assets/generated").strip().replace("\\", "/")
        parts = [part.strip() for part in normalized.split("/") if part.strip()]
        if normalized.startswith("/") or ":" in normalized or not parts or any(part in {".", ".."} for part in parts):
            raise HTTPException(status_code=400, detail="AI image destination must be a relative project folder")
        return "/".join(parts)

    def _node_id_from_path(self, project_id: str, path: object) -> str | None:
        if not isinstance(path, str) or not path.strip():
            return None
        node = _find_node_by_path(project_service.get_project_tree(project_id), path.strip())
        return node.id if node else None

    def _node_id_from_request(self, project_id: str, requested: dict[str, Any], fallback_node_id: str | None = None) -> str | None:
        node_id = requested.get("nodeId")
        if isinstance(node_id, str) and node_id.strip():
            return node_id.strip()
        path_node_id = self._node_id_from_path(project_id, requested.get("path"))
        return path_node_id or fallback_node_id

    def _document_id_from_request(self, project_id: str, requested: dict[str, Any], fallback_document_id: str | None = None) -> str | None:
        node_id = self._node_id_from_request(project_id, requested, fallback_document_id)
        if not node_id:
            return None
        node = _find_node(project_service.get_project_tree(project_id), node_id)
        if node is not None and node.type != "document":
            return None
        return node_id

    def _name_from_request(self, requested: dict[str, Any], default: str) -> str:
        value = requested.get("name")
        if isinstance(value, str) and value.strip():
            return value.strip()
        path = requested.get("path")
        if isinstance(path, str) and path.strip():
            return path.strip().replace("\\", "/").split("/")[-1]
        return default

    def _document_path(self, document_id: str) -> str:
        try:
            _, relative_path = decode_document_id(document_id)
            return relative_path
        except HTTPException:
            return document_id

    def _path_from_node_id(self, node_id: str) -> str:
        try:
            _, relative_path = decode_node_id(node_id)
            return relative_path
        except HTTPException:
            return node_id


def _find_node(nodes: list[TreeNode], node_id: str) -> TreeNode | None:
    for node in nodes:
        if node.id == node_id:
            return node
        if node.children:
            child = _find_node(node.children, node_id)
            if child is not None:
                return child
    return None


def _find_node_by_path(nodes: list[TreeNode], path: str) -> TreeNode | None:
    normalized_path = path.replace("\\", "/").strip("/")
    for node in nodes:
        if (node.path or node.name).strip("/") == normalized_path:
            return node
        if node.children:
            child = _find_node_by_path(node.children, normalized_path)
            if child is not None:
                return child
    return None


def _tree_context(nodes: list[TreeNode], payload: AiInteractionRequest) -> list[dict[str, Any]]:
    max_nodes = 90 if payload.executionMode == "quick" else {"light": 120, "medium": 180, "deep": 260}.get(payload.reasoningDepth, 120)
    remaining = {"count": max_nodes}

    def compact(node: TreeNode) -> dict[str, Any] | None:
        if remaining["count"] <= 0:
            return None
        remaining["count"] -= 1
        children = []
        for child in node.children or []:
            compact_child = compact(child)
            if compact_child is not None:
                children.append(compact_child)
        item: dict[str, Any] = {
            "id": node.id,
            "name": node.name,
            "type": node.type,
            "path": node.path,
        }
        if children:
            item["children"] = children
        return item

    result: list[dict[str, Any]] = []
    for node in nodes:
        compact_node = compact(node)
        if compact_node is not None:
            result.append(compact_node)
    return result


def _count_documents(node: TreeNode) -> int:
    if node.type == "document":
        return 1
    return sum(_count_documents(child) for child in node.children or [])


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _expires_at_iso(hours: int) -> str:
    return (datetime.now(timezone.utc) + timedelta(hours=hours)).isoformat()


def _is_past_iso(value: object) -> bool:
    if not isinstance(value, str):
        return True
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError:
        return True
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed <= datetime.now(timezone.utc)


def _is_expired(value: object, minutes: int) -> bool:
    if not isinstance(value, str):
        return True
    try:
        created_at = datetime.fromisoformat(value)
    except ValueError:
        return True
    if created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=timezone.utc)
    return datetime.now(timezone.utc) - created_at > timedelta(minutes=minutes)


def _http_error_message(error: HTTPException) -> str:
    detail = error.detail
    if isinstance(detail, dict):
        message = detail.get("message") or detail.get("code")
        return str(message or "No se pudo aplicar la acción IA.")
    if isinstance(detail, str):
        return detail
    return "No se pudo aplicar la acción IA."


def _event_context_content(event: dict[str, Any]) -> str:
    event_type = event.get("type")
    summary = event.get("summary")
    content = event.get("content")
    if event_type in {"document_modified", "folder_created", "document_created", "document_duplicated", "node_moved", "delete_requested", "node_deleted", "permission_blocked"}:
        text = summary if isinstance(summary, str) and summary.strip() else content
    else:
        text = content
    return text.strip() if isinstance(text, str) else ""


def _intent_action_event_content(payload: AiInteractionRequest) -> str:
    action = payload.intentAction.type if payload.intentAction else "unknown"
    return f"Acción estructurada sobre intención IA: {action}"


def _permission_message(action: str) -> str:
    return (
        f"No puedo {action} porque ese permiso está desactivado. "
        "Puedes activarlo en Configuración de la app > IA."
    )


def _safe_plan_for_context(plan: dict[str, Any]) -> dict[str, Any]:
    return {
        key: value
        for key, value in plan.items()
        if key
        in {
            "display",
            "uiPlacement",
            "interactionType",
            "confidence",
            "executionScope",
            "intentDecision",
            "routeToAiTab",
            "needsUserClarification",
            "answer",
            "pendingIntent",
            "documentChange",
            "imageGeneration",
            "task",
            "operations",
        }
    }


def _truncate_text(value: str, max_chars: int) -> str:
    normalized = re.sub(r"\s+", " ", value).strip()
    if len(normalized) <= max_chars:
        return normalized
    return f"{normalized[: max_chars - 3].rstrip()}..."


def _slug(value: str, default: str = "imagen-generada") -> str:
    normalized = re.sub(r"[^a-zA-Z0-9._ -]+", "", value.lower()).strip()
    normalized = re.sub(r"[\s_]+", "-", normalized).strip("-._")
    return normalized[:64].strip("-._") or default


def _image_filename(raw_filename: object, alt_text: str, output_format: str) -> str:
    suffix = ".jpeg" if output_format == "jpeg" else f".{output_format}"
    if isinstance(raw_filename, str) and raw_filename.strip():
        name = Path(raw_filename.strip()).name
        if Path(name).suffix.lower() in {".png", ".jpg", ".jpeg", ".webp", ".gif"}:
            return name
        return f"{_slug(Path(name).stem, _slug(alt_text))}{suffix}"
    return f"{_slug(alt_text)}{suffix}"


def _insert_image_markdown(markdown: str, image_markdown: str, selection_focus: Any) -> str:
    normalized_reference = f"\n\n{image_markdown}\n\n"
    focus_text = getattr(selection_focus, "text", None) if selection_focus is not None else None
    if isinstance(focus_text, str) and focus_text.strip():
        index = markdown.find(focus_text)
        if index >= 0:
            insert_at = index + len(focus_text)
            return f"{markdown[:insert_at].rstrip()}{normalized_reference}{markdown[insert_at:].lstrip()}"
    from_value = getattr(selection_focus, "from_", None) if selection_focus is not None else None
    to_value = getattr(selection_focus, "to", None) if selection_focus is not None else None
    if isinstance(to_value, int) and 0 <= to_value <= len(markdown):
        return f"{markdown[:to_value].rstrip()}{normalized_reference}{markdown[to_value:].lstrip()}"
    if isinstance(from_value, int) and 0 <= from_value <= len(markdown):
        return f"{markdown[:from_value].rstrip()}{normalized_reference}{markdown[from_value:].lstrip()}"
    return f"{markdown.rstrip()}{normalized_reference}".lstrip()


def _int_between(value: object, minimum: int, maximum: int, default: int) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        parsed = default
    return min(max(parsed, minimum), maximum)


def _float_between(value: object, minimum: float, maximum: float, default: float) -> float:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        parsed = default
    return min(max(parsed, minimum), maximum)


def _merge_usage(first: dict[str, Any] | None, second: dict[str, Any] | None) -> dict[str, Any] | None:
    if not first:
        return second
    if not second:
        return first
    merged = dict(first)
    for key in ["inputTokens", "cachedInputTokens", "outputTokens", "reasoningTokens", "embeddingTokens", "totalTokens"]:
        merged[key] = int(first.get(key) or 0) + int(second.get(key) or 0)
    merged["usageSource"] = "provider"
    return merged


ai_service = AiService()
