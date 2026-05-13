from __future__ import annotations

import io
import json
from typing import Any

from app.services.credential_service import credential_service


DEFAULT_OPENAI_MODEL = "gpt-5.4-mini"


class OpenAiService:
    def has_api_key(self) -> bool:
        return credential_service.get_openai_key() is not None

    def analyze_interaction(self, payload: dict[str, Any], context: dict[str, Any], rag: dict[str, Any], model: str = DEFAULT_OPENAI_MODEL) -> dict[str, Any]:
        api_key = credential_service.get_openai_key()
        if not api_key:
            raise OpenAiUnavailableError("OpenAI API key is not configured")

        try:
            from openai import OpenAI
        except ImportError as error:
            raise OpenAiUnavailableError("OpenAI SDK is not installed") from error

        client = OpenAI(api_key=api_key)
        response = client.responses.create(
            model=model or DEFAULT_OPENAI_MODEL,
            input=[
                {
                    "role": "system",
                    "content": (
                        "Eres el analizador de ejecución de KnowNext.ai. Devuelve solo JSON válido y mínimo. "
                        "No resuelvas todavía la tarea ni redactes contenido final. Clasifica semánticamente, sin palabras clave, idioma, regex ni listas de frases. "
                        "direct_action significa que basta una ejecución directa. needs_permission significa que falta permiso web u otro permiso explícito. "
                        "needs_clarification significa que falta información imprescindible. agentic_task se reserva para trabajo largo con varios pasos, fuentes, documentos o checkpoints. "
                        "too_expensive_or_unclear significa que el coste o alcance no son razonables para ejecutar sin que el usuario reformule. "
                        "Respeta request.reasoningDepth para el presupuesto: light es conservador, medium permite varias fuentes/documentos, deep permite tareas amplias."
                    ),
                },
                {
                    "role": "user",
                    "content": json.dumps({
                        "request": payload,
                        "context": _preflight_context(context),
                        "rag": {"enabled": bool(rag.get("enabled")), "hasVectorStore": bool(rag.get("vectorStoreId"))},
                        "responseSchema": _interaction_preflight_schema(),
                    }, ensure_ascii=False),
                },
            ],
            text={
                "format": {
                    "type": "json_schema",
                    "name": "knownext_ai_execution_preflight",
                    "schema": _interaction_preflight_schema(),
                    "strict": True,
                }
            },
        )
        return _parse_json_response(response)

    def plan_interaction(self, payload: dict[str, Any], context: dict[str, Any], rag: dict[str, Any], model: str = DEFAULT_OPENAI_MODEL) -> dict[str, Any]:
        api_key = credential_service.get_openai_key()
        if not api_key:
            raise OpenAiUnavailableError("OpenAI API key is not configured")

        try:
            from openai import OpenAI
        except ImportError as error:
            raise OpenAiUnavailableError("OpenAI SDK is not installed") from error

        client = OpenAI(api_key=api_key)
        tools = []
        if rag.get("enabled") and rag.get("vectorStoreId"):
            tools.append({
                "type": "file_search",
                "vector_store_ids": [rag["vectorStoreId"]],
                "max_num_results": 6,
            })
        web_search_enabled = _web_search_enabled(payload, context)
        if web_search_enabled:
            tools.append({"type": "web_search"})

        response = client.responses.create(
            model=model or DEFAULT_OPENAI_MODEL,
            input=[
                {
                    "role": "system",
                    "content": (
                        "Eres el asistente documental de KnowNext.ai. Devuelve solo JSON válido con el esquema pedido. "
                        "Separa siempre la respuesta conversacional de los cambios aplicables. "
                        "Respeta request.executionMode: en quick nunca devuelvas interactionType=agentic_task, task ni uiPlacement=conversation_tab. "
                        "En quick resuelve en una sola ejecución directa o pide una aclaración breve; si requiere trabajo largo, responde que el usuario debe cambiar a Razonar. "
                        "En reasoning puedes usar context.reasoningPreflight para decidir si la ejecución es directa, permiso, aclaración o tarea agentica. "
                        "Todas las decisiones de intención deben ir en intentDecision y pendingIntent; no dependas de palabras concretas, idioma, regex ni frases fijas. "
                        "Si context.pendingIntent existe, resuelve semánticamente el prompt o intentAction contra esa intención estructurada. "
                        "Conserva targetDocumentId de context.pendingIntent cuando la conversación continúe desde la pestaña IA o sin documento activo. "
                        "No inventes operaciones de filesystem si el usuario solo pregunta o si necesitas aclaración. "
                        "Solo se debe editar el documento activo cuando tu decisión semántica sea interactionType=document_edit o mixed "
                        "y debes devolver documentChange con targetDocumentId y el Markdown completo resultante. Nunca uses answer como contenido del documento. "
                        "Para preguntas informativas, aclaraciones o planificación, responde en answer, sin documentChange. "
                        "Si el usuario pide crear documentos nuevos, usa operaciones create_document en la carpeta adecuada; no reemplaces el documento activo para explicar lo que falta. "
                        "Si context.selectionFocus existe, es el texto seleccionado por el usuario para este prompt: úsalo para resolver referencias como "
                        "'lo', 'este texto' o 'esto', pero no reemplaza al activeDocument completo. "
                        "Si el usuario pide transformar solo ese foco, devuelve documentChange con el Markdown completo y cambia solo esa parte cuando sea posible. "
                        "Si el usuario pide reescribir el documento pero dejar el foco sin tocar, conserva exactamente ese texto seleccionado. "
                        "Para borrar, devuelve solo una solicitud delete_node; la aplicación pedirá confirmación. "
                        "Para mover documentos o carpetas, devuelve move_node con nodeId o path y parentPath como carpeta destino. "
                        "Para duplicar documentos, devuelve duplicate_document con nodeId o path; parentPath es opcional como carpeta destino y name como nombre de la copia. "
                        "Si el contexto incluye projectSearch.exactMatches, úsalo como evidencia local exacta y cita sus paths en respuestas informativas. "
                        "Si el contexto incluye recentConversation, úsalo solo para resolver referencias recientes como 'eso', 'lo anterior' o 'ahora'. "
                        "No dejes que recentConversation contradiga el prompt actual ni el activeDocument actual; la prioridad es activeDocument, luego request, "
                        "después operaciones recientes y por último conversación reciente. "
                        "Si el usuario pide crear documentos relacionados con el documento activo y no indica ubicación, usa context.activeDocumentFolder.path como parentPath. "
                        "Mover documentos y duplicar documentos dependen del permiso de crear documentos; mover carpetas depende del permiso de crear carpetas. "
                        "El historial reciente nunca sustituye una confirmación explícita para borrar. "
                        "Si la petición nace desde un documento y requiere investigación o confirmación antes de escribir, crea o actualiza pendingIntent con ese documento como targetDocumentId. "
                        "Si la tarea requiere web y context.agentic.webResearchEnabled no está activo o la intención no tiene webResearchAllowed, usa pendingIntent.status=awaiting_web_permission. "
                        "Usa uiPlacement=document_bubble para tareas documentales simples y conversation_tab solo para tareas largas, múltiples documentos, múltiples fuentes o checkpoints. "
                        "Si la petición parece requerir varios pasos, investigación, decisiones intermedias o navegación por muchas fuentes, usa interactionType=agentic_task, "
                        "uiPlacement=conversation_tab y task con pasos claros. Si requiere web y context.agentic.webResearchEnabled no está activo, marca requiresWebResearch=true, "
                        "webResearchAllowed=false y pide permiso o instrucciones en answer."
                    ),
                },
                {
                    "role": "user",
                "content": json.dumps({
                        "request": payload,
                        "context": context,
                        "agentic": context.get("agentic"),
                        "responseSchema": _interaction_plan_schema(),
                    }, ensure_ascii=False),
                },
            ],
            tools=tools or None,
            include=["web_search_call.action.sources"] if web_search_enabled else None,
            text={
                "format": {
                    "type": "json_schema",
                    "name": "knownext_ai_interaction_plan",
                    "schema": _interaction_plan_schema(),
                    "strict": True,
                }
            },
        )

        parsed = _parse_json_response(response)
        sources = _extract_web_sources(response)
        if sources:
            parsed["__webSources"] = sources
        return parsed

    def create_vector_store(self, project_id: str) -> str:
        api_key = credential_service.get_openai_key()
        if not api_key:
            raise OpenAiUnavailableError("OpenAI API key is not configured")

        try:
            from openai import OpenAI
        except ImportError as error:
            raise OpenAiUnavailableError("OpenAI SDK is not installed") from error

        client = OpenAI(api_key=api_key)
        vector_store = client.vector_stores.create(
            name=f"KnowNext.ai {project_id}",
            metadata={"projectId": project_id},
        )
        return vector_store.id

    def upload_markdown_document(
        self,
        vector_store_id: str,
        project_id: str,
        relative_path: str,
        content: str,
        attributes: dict[str, Any],
    ) -> dict[str, str | None]:
        api_key = credential_service.get_openai_key()
        if not api_key:
            raise OpenAiUnavailableError("OpenAI API key is not configured")

        try:
            from openai import OpenAI
        except ImportError as error:
            raise OpenAiUnavailableError("OpenAI SDK is not installed") from error

        client = OpenAI(api_key=api_key)
        uploaded = client.files.create(
            file=(relative_path, io.BytesIO(content.encode("utf-8")), "text/markdown"),
            purpose="assistants",
        )
        vector_file = _create_vector_store_file_and_poll(
            client,
            vector_store_id=vector_store_id,
            file_id=uploaded.id,
            attributes=_openai_attributes({
                **attributes,
                "projectId": project_id,
                "path": relative_path,
            }),
        )
        return {
            "openaiFileId": uploaded.id,
            "vectorStoreFileId": getattr(vector_file, "id", uploaded.id),
        }

    def delete_vector_store_file(self, vector_store_id: str, file_id: str | None) -> None:
        if not file_id:
            return
        api_key = credential_service.get_openai_key()
        if not api_key:
            raise OpenAiUnavailableError("OpenAI API key is not configured")

        try:
            from openai import OpenAI
        except ImportError as error:
            raise OpenAiUnavailableError("OpenAI SDK is not installed") from error

        client = OpenAI(api_key=api_key)
        client.vector_stores.files.delete(vector_store_id=vector_store_id, file_id=file_id)

    def delete_file(self, file_id: str) -> None:
        api_key = credential_service.get_openai_key()
        if not api_key:
            raise OpenAiUnavailableError("OpenAI API key is not configured")

        try:
            from openai import OpenAI
        except ImportError as error:
            raise OpenAiUnavailableError("OpenAI SDK is not installed") from error

        client = OpenAI(api_key=api_key)
        client.files.delete(file_id)

    def delete_vector_store(self, vector_store_id: str) -> None:
        api_key = credential_service.get_openai_key()
        if not api_key:
            raise OpenAiUnavailableError("OpenAI API key is not configured")

        try:
            from openai import OpenAI
        except ImportError as error:
            raise OpenAiUnavailableError("OpenAI SDK is not installed") from error

        client = OpenAI(api_key=api_key)
        client.vector_stores.delete(vector_store_id)


class OpenAiUnavailableError(Exception):
    pass


class OpenAiProviderError(Exception):
    def __init__(self, message: str, usage: dict[str, int | str] | None = None) -> None:
        super().__init__(message)
        self.usage = usage


def _extract_output_text(response: Any) -> str:
    output = getattr(response, "output", None) or []
    fragments: list[str] = []
    for item in output:
        content = getattr(item, "content", None) or []
        for content_item in content:
            text = getattr(content_item, "text", None)
            if text:
                fragments.append(text)
    return "\n".join(fragments)


def _parse_json_response(response: Any) -> dict[str, Any]:
    raw_text = getattr(response, "output_text", None)
    if not raw_text:
        raw_text = _extract_output_text(response)
    usage = _extract_usage(response)
    try:
        parsed = json.loads(raw_text)
    except (TypeError, json.JSONDecodeError) as error:
        raise OpenAiProviderError("OpenAI returned an invalid structured response", usage=usage) from error
    if not isinstance(parsed, dict):
        return {}
    if usage:
        parsed["__openaiUsage"] = usage
    return parsed


def _extract_usage(response: Any) -> dict[str, int | str] | None:
    usage = getattr(response, "usage", None)
    if usage is None:
        return None

    input_tokens = _usage_int(usage, "input_tokens")
    output_tokens = _usage_int(usage, "output_tokens")
    total_tokens = _usage_int(usage, "total_tokens")
    input_details = getattr(usage, "input_tokens_details", None)
    output_details = getattr(usage, "output_tokens_details", None)
    cached_input_tokens = _usage_int(input_details, "cached_tokens")
    reasoning_tokens = _usage_int(output_details, "reasoning_tokens")

    if input_tokens + output_tokens + total_tokens <= 0:
        return None

    return {
        "inputTokens": input_tokens,
        "cachedInputTokens": cached_input_tokens,
        "outputTokens": output_tokens,
        "reasoningTokens": reasoning_tokens,
        "embeddingTokens": 0,
        "totalTokens": total_tokens or input_tokens + output_tokens,
        "usageSource": "provider",
    }


def _usage_int(container: Any, key: str) -> int:
    if container is None:
        return 0
    value = getattr(container, key, None)
    if value is None and isinstance(container, dict):
        value = container.get(key)
    return value if isinstance(value, int) and not isinstance(value, bool) else 0


def _web_search_enabled(payload: dict[str, Any], context: dict[str, Any]) -> bool:
    agentic = context.get("agentic") if isinstance(context.get("agentic"), dict) else {}
    pending_intent = context.get("pendingIntent") if isinstance(context.get("pendingIntent"), dict) else {}
    intent_action = payload.get("intentAction") if isinstance(payload.get("intentAction"), dict) else {}
    if not agentic.get("webResearchEnabled"):
        return False
    if pending_intent.get("webResearchAllowed") or intent_action.get("type") == "allow_web_research":
        return True
    return bool(payload.get("allowWebResearch"))


def _extract_web_sources(response: Any) -> list[dict[str, str | None]]:
    output = getattr(response, "output", None) or []
    sources: list[dict[str, str | None]] = []
    seen_urls: set[str] = set()
    for item in output:
        item_type = getattr(item, "type", None)
        action = getattr(item, "action", None)
        if item_type != "web_search_call" and action is None:
            continue
        source_items = []
        if action is not None:
            source_items = getattr(action, "sources", None) or []
            if not source_items and isinstance(action, dict):
                source_items = action.get("sources") or []
        for source in source_items:
            title = getattr(source, "title", None) or (source.get("title") if isinstance(source, dict) else None)
            url = getattr(source, "url", None) or (source.get("url") if isinstance(source, dict) else None)
            if not isinstance(url, str) or url in seen_urls:
                continue
            seen_urls.add(url)
            sources.append({"title": title if isinstance(title, str) and title else url, "url": url, "path": None, "status": "used"})
    return sources


def _preflight_context(context: dict[str, Any]) -> dict[str, Any]:
    active_document = context.get("activeDocument") if isinstance(context.get("activeDocument"), dict) else None
    pending_intent = context.get("pendingIntent") if isinstance(context.get("pendingIntent"), dict) else None
    tree = context.get("tree") if isinstance(context.get("tree"), list) else []
    return {
        "activeDocument": {
            "id": active_document.get("id"),
            "path": active_document.get("path"),
            "wordCountApprox": len(str(active_document.get("markdown") or "").split()),
        } if active_document else None,
        "activeDocumentFolder": context.get("activeDocumentFolder"),
        "selectionFocus": context.get("selectionFocus"),
        "pendingIntent": pending_intent,
        "agentic": context.get("agentic"),
        "treeNodeCount": len(tree),
    }


def _interaction_preflight_schema() -> dict[str, Any]:
    return {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "executionScope": {
                "type": "string",
                "enum": ["direct_action", "needs_permission", "needs_clarification", "agentic_task", "too_expensive_or_unclear"],
            },
            "uiPlacement": {"type": "string", "enum": ["document_bubble", "conversation_tab", "none"]},
            "confidence": {"type": "string", "enum": ["high", "medium", "low"]},
            "requiresWebResearch": {"type": "boolean"},
            "estimatedSteps": {"type": "integer"},
            "estimatedAffectedDocuments": {"type": "integer"},
            "requiresCheckpoint": {"type": "boolean"},
            "reason": {"type": "string"},
            "answer": {"type": ["string", "null"]},
        },
        "required": [
            "executionScope",
            "uiPlacement",
            "confidence",
            "requiresWebResearch",
            "estimatedSteps",
            "estimatedAffectedDocuments",
            "requiresCheckpoint",
            "reason",
            "answer",
        ],
    }


def _create_vector_store_file_and_poll(client: Any, vector_store_id: str, file_id: str, attributes: dict[str, Any]) -> Any:
    files_api = client.vector_stores.files
    create_and_poll = getattr(files_api, "create_and_poll", None)
    if callable(create_and_poll):
        return create_and_poll(vector_store_id=vector_store_id, file_id=file_id, attributes=attributes)
    return files_api.create(vector_store_id=vector_store_id, file_id=file_id, attributes=attributes)


def _openai_attributes(attributes: dict[str, Any]) -> dict[str, str | int | float | bool]:
    sanitized: dict[str, str | int | float | bool] = {}
    for key, value in attributes.items():
        if len(sanitized) >= 16:
            break
        if not isinstance(key, str) or not key:
            continue
        safe_key = key[:64]
        if isinstance(value, bool | int | float):
            sanitized[safe_key] = value
        elif value is not None:
            sanitized[safe_key] = str(value)[:512]
    return sanitized


def _interaction_plan_schema() -> dict[str, Any]:
    return {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "display": {"type": "string", "enum": ["bubble", "conversation", "none"]},
            "uiPlacement": {"type": "string", "enum": ["document_bubble", "conversation_tab", "none"]},
            "interactionType": {"type": "string", "enum": ["chat", "document_edit", "project_operation", "agentic_task", "clarification", "mixed"]},
            "confidence": {"type": "string", "enum": ["high", "medium", "low"]},
            "executionScope": {
                "type": ["string", "null"],
                "enum": ["direct_action", "needs_permission", "needs_clarification", "agentic_task", "too_expensive_or_unclear", None],
            },
            "intentDecision": {
                "type": ["string", "null"],
                "enum": ["create_intent", "confirm_intent", "update_intent", "cancel_intent", "needs_clarification", "execute_now", None],
            },
            "routeToAiTab": {"type": "boolean"},
            "needsUserClarification": {"type": "boolean"},
            "answer": {"type": ["string", "null"]},
            "pendingIntent": {
                "type": ["object", "null"],
                "additionalProperties": False,
                "properties": {
                    "id": {"type": ["string", "null"]},
                    "originDocumentId": {"type": ["string", "null"]},
                    "targetDocumentId": {"type": ["string", "null"]},
                    "targetPath": {"type": ["string", "null"]},
                    "goal": {"type": "string"},
                    "proposedAction": {
                        "type": "string",
                        "enum": ["replace_document", "edit_document", "create_document", "project_operation", "research_then_write"],
                    },
                    "requiresWebResearch": {"type": "boolean"},
                    "webResearchAllowed": {"type": "boolean"},
                    "status": {
                        "type": "string",
                        "enum": ["awaiting_decision", "awaiting_web_permission", "ready", "running", "completed", "cancelled"],
                    },
                },
                "required": [
                    "id",
                    "originDocumentId",
                    "targetDocumentId",
                    "targetPath",
                    "goal",
                    "proposedAction",
                    "requiresWebResearch",
                    "webResearchAllowed",
                    "status",
                ],
            },
            "documentChange": {
                "type": ["object", "null"],
                "additionalProperties": False,
                "properties": {
                    "targetDocumentId": {"type": ["string", "null"]},
                    "updatedMarkdown": {"type": "string"},
                    "summary": {"type": "string"},
                },
                "required": ["targetDocumentId", "updatedMarkdown", "summary"],
            },
            "task": {
                "type": ["object", "null"],
                "additionalProperties": False,
                "properties": {
                    "title": {"type": "string"},
                    "status": {"type": "string", "enum": ["proposed", "waiting_confirmation", "running", "completed", "blocked"]},
                    "depth": {"type": "string", "enum": ["quick", "guided", "deep", "bounded_autonomous"]},
                    "requiresWebResearch": {"type": "boolean"},
                    "webResearchAllowed": {"type": "boolean"},
                    "needsUserConfirmation": {"type": "boolean"},
                    "maxSteps": {"type": "integer"},
                    "maxDocuments": {"type": "integer"},
                    "maxEstimatedCostEur": {"type": "number"},
                    "steps": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "additionalProperties": False,
                            "properties": {
                                "id": {"type": "string"},
                                "title": {"type": "string"},
                                "status": {"type": "string", "enum": ["pending", "running", "completed", "blocked"]},
                                "detail": {"type": ["string", "null"]},
                            },
                            "required": ["id", "title", "status", "detail"],
                        },
                    },
                    "sources": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "additionalProperties": False,
                            "properties": {
                                "title": {"type": "string"},
                                "url": {"type": ["string", "null"]},
                                "path": {"type": ["string", "null"]},
                                "status": {"type": "string", "enum": ["planned", "used", "blocked"]},
                            },
                            "required": ["title", "url", "path", "status"],
                        },
                    },
                },
                "required": [
                    "title",
                    "status",
                    "depth",
                    "requiresWebResearch",
                    "webResearchAllowed",
                    "needsUserConfirmation",
                    "maxSteps",
                    "maxDocuments",
                    "maxEstimatedCostEur",
                    "steps",
                    "sources",
                ],
            },
            "operations": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "properties": {
                        "type": {
                            "type": "string",
                            "enum": ["create_folder", "create_document", "duplicate_document", "move_node", "delete_node"],
                        },
                        "name": {"type": ["string", "null"]},
                        "parentPath": {"type": ["string", "null"]},
                        "path": {"type": ["string", "null"]},
                        "nodeId": {"type": ["string", "null"]},
                        "markdown": {"type": ["string", "null"]},
                        "updatedMarkdown": {"type": ["string", "null"]},
                        "summary": {"type": ["string", "null"]},
                    },
                    "required": ["type", "name", "parentPath", "path", "nodeId", "markdown", "updatedMarkdown", "summary"],
                },
            },
        },
        "required": [
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
            "task",
            "operations",
        ],
    }


openai_service = OpenAiService()
