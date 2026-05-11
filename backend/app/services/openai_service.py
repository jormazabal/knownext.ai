from __future__ import annotations

import io
import json
from pathlib import Path
from typing import Any

from app.services.credential_service import credential_service
from app.services.filesystem_service import DOCUMENT_SUFFIX


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
                        "Para borrar, devuelve solo una solicitud delete_node; la aplicación pedirá confirmación."
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

    def rebuild_vector_store(self, project_id: str, project_root: Path, current_vector_store_id: str | None = None) -> str:
        api_key = credential_service.get_openai_key()
        if not api_key:
            raise OpenAiUnavailableError("OpenAI API key is not configured")

        try:
            from openai import OpenAI
        except ImportError as error:
            raise OpenAiUnavailableError("OpenAI SDK is not installed") from error

        client = OpenAI(api_key=api_key)
        if current_vector_store_id:
            try:
                client.vector_stores.delete(current_vector_store_id)
            except Exception:
                pass

        vector_store = client.vector_stores.create(name=f"KnowNext.ai {project_id}")
        vector_store_id = vector_store.id
        for document_path in sorted(project_root.rglob(f"*{DOCUMENT_SUFFIX}")):
            if not document_path.is_file():
                continue
            relative_path = document_path.relative_to(project_root).as_posix()
            content = document_path.read_bytes()
            uploaded = client.files.create(
                file=(relative_path, io.BytesIO(content), "text/markdown"),
                purpose="assistants",
            )
            client.vector_stores.files.create(
                vector_store_id=vector_store_id,
                file_id=uploaded.id,
                attributes={
                    "projectId": project_id,
                    "path": relative_path,
                },
            )
        return vector_store_id

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
