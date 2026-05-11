from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from fastapi import HTTPException

from app.schemas.ai import (
    AiConfirmDeleteRequest,
    AiConversationEvent,
    AiConversationResponse,
    AiIndexStatusResponse,
    AiInteractionRequest,
    AiInteractionResponse,
    AiOperation,
    AiPendingDelete,
    AiPromptRequest,
    AiPromptResponse,
    AiUpdatedDocument,
)
from app.schemas.config import AppConfigUpdate
from app.schemas.project import CreateDocumentRequest, CreateFolderRequest, TreeNode
from app.services.app_storage import JsonFileStore
from app.services.config_service import config_service
from app.services.credential_service import credential_service
from app.services.document_service import document_service
from app.services.filesystem_service import decode_document_id, decode_node_id
from app.services.openai_service import OpenAiProviderError, OpenAiUnavailableError, openai_service
from app.services.project_service import project_service


class AiService:
    def __init__(self) -> None:
        self.pending_deletes = JsonFileStore("ai-pending-deletes.json")

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
        if not payload.prompt.strip():
            raise HTTPException(status_code=400, detail="Prompt is required")

        project_service.get_project_tree(project_id)
        interaction_id = f"ai-{uuid4()}"
        user_event = self._event(project_id, "user_message", "user", payload.prompt.strip(), document_id=payload.documentId)

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
            )

        context = self._build_context(project_id, payload)
        ai_config = config_service.get_config().ai
        try:
            plan = openai_service.plan_interaction(
                payload.model_dump(),
                context,
                ai_config.rag.model_dump(),
            )
        except OpenAiUnavailableError as error:
            return self._provider_error_response(project_id, interaction_id, user_event, str(error), unavailable=True)
        except Exception as error:
            message = str(error) if isinstance(error, OpenAiProviderError) else "OpenAI no pudo completar la interacción."
            return self._provider_error_response(project_id, interaction_id, user_event, message, unavailable=False)

        response = self._execute_plan(project_id, interaction_id, payload, plan)
        self._append_events(project_id, [user_event, *response.conversationEvents])
        return response.model_copy(update={"conversationEvents": [user_event, *response.conversationEvents]})

    def get_conversation(self, project_id: str) -> AiConversationResponse:
        project_service.get_project_tree(project_id)
        return AiConversationResponse(events=[AiConversationEvent(**event) for event in self._read_conversation(project_id)])

    def clear_conversation(self, project_id: str) -> AiConversationResponse:
        project_service.get_project_tree(project_id)
        self._conversation_store(project_id).write({"schemaVersion": 1, "events": []})
        return AiConversationResponse(events=[])

    def confirm_delete(self, project_id: str, payload: AiConfirmDeleteRequest) -> AiInteractionResponse:
        pending = self._read_pending_deletes()
        record = pending.get(payload.confirmationId)
        if not isinstance(record, dict) or record.get("projectId") != project_id:
            raise HTTPException(status_code=404, detail="Pending AI delete request not found")

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
        rag = config_service.get_config().ai.rag
        return self._index_status_response(project_id, rag)

    def rebuild_index(self, project_id: str) -> AiIndexStatusResponse:
        project_root = project_service._get_project_root(project_id)
        config = config_service.get_config()
        rag = config.ai.rag.model_copy(update={"enabled": True, "status": "indexing", "error": None})
        config_service.update_config(AppConfigUpdate(ai=config.ai.model_copy(update={"rag": rag})))
        try:
            vector_store_id = openai_service.rebuild_vector_store(project_id, project_root, rag.vectorStoreId)
        except Exception as error:
            next_rag = rag.model_copy(update={"status": "error", "error": str(error)})
        else:
            next_rag = rag.model_copy(update={
                "status": "updated",
                "vectorStoreId": vector_store_id,
                "lastIndexedAt": _now_iso(),
                "error": None,
            })
        updated = config_service.update_config(AppConfigUpdate(ai=config.ai.model_copy(update={"rag": next_rag})))
        return self._index_status_response(project_id, updated.ai.rag)

    def delete_index(self, project_id: str) -> AiIndexStatusResponse:
        project_service.get_project_tree(project_id)
        config = config_service.get_config()
        vector_store_id = config.ai.rag.vectorStoreId
        if vector_store_id:
            try:
                openai_service.delete_vector_store(vector_store_id)
            except Exception:
                pass
        next_rag = config.ai.rag.model_copy(update={
            "enabled": False,
            "vectorStoreId": None,
            "lastIndexedAt": None,
            "status": "not-indexed",
            "error": None,
        })
        updated = config_service.update_config(AppConfigUpdate(ai=config.ai.model_copy(update={"rag": next_rag})))
        return self._index_status_response(project_id, updated.ai.rag)

    def _index_status_response(self, project_id: str, rag: Any) -> AiIndexStatusResponse:
        return AiIndexStatusResponse(projectId=project_id, **rag.model_dump())

    def _execute_plan(self, project_id: str, interaction_id: str, payload: AiInteractionRequest, plan: dict[str, Any]) -> AiInteractionResponse:
        ai_config = config_service.get_config().ai
        events: list[AiConversationEvent] = []
        operations: list[AiOperation] = []
        updated_document: AiUpdatedDocument | None = None
        tree: list[dict] | None = None
        pending_delete: AiPendingDelete | None = None

        answer = plan.get("answer") if isinstance(plan.get("answer"), str) else None
        if answer:
            events.append(self._event(project_id, "assistant_message", "assistant", answer, document_id=payload.documentId))

        for requested in plan.get("operations", []):
            if not isinstance(requested, dict):
                continue
            requested_type = requested.get("type")

            if requested_type == "document_modified":
                if payload.mode != "document" or not payload.documentId:
                    operation = self._blocked(project_id, "La IA solo puede modificar el documento cuando hay un documento activo.")
                    operations.append(operation)
                    events.append(self._operation_event(project_id, operation))
                    continue
                markdown = requested.get("updatedMarkdown") or requested.get("markdown")
                if not isinstance(markdown, str) or not markdown:
                    continue
                summary = requested.get("summary") if isinstance(requested.get("summary"), str) else "Documento actualizado por IA."
                updated_document = AiUpdatedDocument(documentId=payload.documentId, markdown=markdown, summary=summary)
                path = self._document_path(payload.documentId)
                operation = AiOperation(
                    type="document_modified",
                    message=f"Documento modificado: {path}",
                    documentId=payload.documentId,
                    path=path,
                    summary=summary,
                )
                operations.append(operation)
                events.append(self._event(project_id, "document_modified", "system", operation.message, document_id=payload.documentId, path=path, summary=summary))

            elif requested_type == "create_folder":
                if not ai_config.permissions.createFolders:
                    operation = self._blocked(project_id, "La IA no puede crear carpetas porque el permiso está desactivado.")
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
                    operation = self._blocked(project_id, "La IA no puede crear documentos porque el permiso está desactivado.")
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

            elif requested_type == "delete_node":
                if not ai_config.permissions.deleteDocumentsAndFolders:
                    operation = self._blocked(project_id, "La IA no puede eliminar documentos o carpetas porque el permiso está desactivado.")
                    operations.append(operation)
                    events.append(self._operation_event(project_id, operation))
                    continue
                node_id = requested.get("nodeId") if isinstance(requested.get("nodeId"), str) else self._node_id_from_path(project_id, requested.get("path"))
                if not node_id:
                    continue
                pending_delete = self._create_pending_delete(project_id, [node_id])
                operation = AiOperation(
                    type="delete_requested",
                    status="pending",
                    message="La IA solicita confirmación antes de eliminar.",
                    nodeId=node_id,
                    paths=pending_delete.paths,
                    confirmationId=pending_delete.confirmationId,
                )
                operations.append(operation)
                events.append(self._event(project_id, "delete_requested", "system", operation.message, paths=pending_delete.paths))

        display = plan.get("display") if plan.get("display") in {"bubble", "conversation", "none"} else ("bubble" if answer else "conversation")
        if updated_document or pending_delete:
            display = "conversation"
        return AiInteractionResponse(
            interactionId=interaction_id,
            status="completed",
            display=display,
            answer=answer,
            conversationEvents=events,
            operations=operations,
            updatedDocument=updated_document,
            tree=tree,
            requiresConfirmation=pending_delete,
        )

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

    def _build_context(self, project_id: str, payload: AiInteractionRequest) -> dict[str, Any]:
        tree = project_service.get_project_tree(project_id)
        context: dict[str, Any] = {
            "tree": [node.model_dump() for node in tree],
            "activeDocument": None,
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
            except HTTPException:
                context["activeDocument"] = {"id": payload.documentId, "markdown": payload.activeMarkdown}
        return context

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

    def _read_pending_deletes(self) -> dict[str, Any]:
        data = self.pending_deletes.read({"schemaVersion": 1, "items": {}})
        items = data.get("items")
        return items if isinstance(items, dict) else {}

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

    def _node_id_from_path(self, project_id: str, path: object) -> str | None:
        if not isinstance(path, str) or not path.strip():
            return None
        node = _find_node_by_path(project_service.get_project_tree(project_id), path.strip())
        return node.id if node else None

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


def _count_documents(node: TreeNode) -> int:
    if node.type == "document":
        return 1
    return sum(_count_documents(child) for child in node.children or [])


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


ai_service = AiService()
