from __future__ import annotations

import io
import json
from typing import Any

from app.services.credential_service import credential_service


DEFAULT_OPENAI_MODEL = "gpt-5"


class OpenAiService:
    def has_api_key(self) -> bool:
        return credential_service.get_openai_key() is not None

    def plan_interaction(self, payload: dict[str, Any], context: dict[str, Any], rag: dict[str, Any]) -> dict[str, Any]:
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

        response = client.responses.create(
            model=DEFAULT_OPENAI_MODEL,
            input=[
                {
                    "role": "system",
                    "content": (
                        "Eres el asistente documental de KnowNext.ai. Devuelve solo JSON válido con el esquema pedido. "
                        "No inventes operaciones de filesystem si el usuario solo pregunta. "
                        "Para editar documentos, devuelve el Markdown completo actualizado en updatedMarkdown. "
                        "Para borrar, devuelve solo una solicitud delete_node; la aplicación pedirá confirmación. "
                        "Si el contexto incluye projectSearch.exactMatches, úsalo como evidencia local exacta y cita sus paths en respuestas informativas."
                    ),
                },
                {
                    "role": "user",
                    "content": json.dumps({
                        "request": payload,
                        "context": context,
                        "responseSchema": _interaction_plan_schema(),
                    }, ensure_ascii=False),
                },
            ],
            tools=tools or None,
            text={
                "format": {
                    "type": "json_schema",
                    "name": "knownext_ai_interaction_plan",
                    "schema": _interaction_plan_schema(),
                    "strict": True,
                }
            },
        )

        raw_text = getattr(response, "output_text", None)
        if not raw_text:
            raw_text = _extract_output_text(response)
        try:
            parsed = json.loads(raw_text)
        except (TypeError, json.JSONDecodeError) as error:
            raise OpenAiProviderError("OpenAI returned an invalid structured response") from error
        return parsed if isinstance(parsed, dict) else {}

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
    pass


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
            "answer": {"type": ["string", "null"]},
            "operations": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "properties": {
                        "type": {
                            "type": "string",
                            "enum": ["document_modified", "create_folder", "create_document", "delete_node"],
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
        "required": ["display", "answer", "operations"],
    }


openai_service = OpenAiService()
