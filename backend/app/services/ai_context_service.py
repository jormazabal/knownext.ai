from __future__ import annotations

import base64
import json
import mimetypes
import re
import shutil
import zipfile
from datetime import datetime, timedelta, timezone
from html import unescape
from pathlib import Path
from typing import Any
from uuid import uuid4
from xml.etree import ElementTree

from fastapi import HTTPException, UploadFile

from app.schemas.ai import (
    AiContextAddToProjectRequest,
    AiContextAddToProjectResponse,
    AiContextSearchResult,
    AiContextSource,
    AiContextSourceListResponse,
    AiContextSourcePreviewResponse,
    AiContextSourceRef,
)
from app.schemas.project import CreateDocumentRequest, TreeNode
from app.services.app_storage import JsonFileStore, get_app_data_dir
from app.services.document_service import document_service
from app.services.filesystem_service import IMAGE_SUFFIXES, decode_document_id, decode_node_id, encode_node_id
from app.services.project_service import project_service


CONTEXT_TTL_MINUTES = 60
EXPIRING_THRESHOLD_MINUTES = 10
MAX_PREVIEW_CHARS = 2400
MAX_CONTEXT_CHARS_LIGHT = 12000
MAX_CONTEXT_CHARS_HIGH = 36000
SUPPORTED_EXTENSIONS = {".md", ".txt", ".pdf", ".docx", ".pptx", ".png", ".jpg", ".jpeg", ".webp", ".gif"}
IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".gif"}


class AiContextService:
    def search_project_documents(self, project_id: str, query: str) -> list[AiContextSearchResult]:
        tree = project_service.get_project_tree(project_id)
        normalized_query = query.strip().lower()
        documents = _flatten_documents(tree)
        if normalized_query:
            documents = [
                document
                for document in documents
                if normalized_query in document.name.lower() or normalized_query in (document.path or "").lower()
            ]
        documents.sort(key=lambda document: (_score_document(document, normalized_query), document.path or document.name))
        images = _flatten_images(tree)
        if normalized_query:
            images = [
                image
                for image in images
                if normalized_query in image.name.lower() or normalized_query in (image.path or "").lower()
            ]
        images.sort(key=lambda image: (_score_document(image, normalized_query), image.path or image.name))
        attachments = _flatten_context_attachments(tree)
        if normalized_query:
            attachments = [
                attachment
                for attachment in attachments
                if normalized_query in attachment.name.lower() or normalized_query in (attachment.path or "").lower()
            ]
        attachments.sort(key=lambda attachment: (_score_document(attachment, normalized_query), attachment.path or attachment.name))
        results = [
            AiContextSearchResult(documentId=document.id, name=document.name, path=document.path or document.name, kind="project_document")
            for document in documents[:12]
        ]
        results.extend(
            AiContextSearchResult(
                documentId=image.id,
                name=image.name,
                path=image.path or image.name,
                kind="image",
                mimeType=image.mimeType,
            )
            for image in images[:8]
        )
        results.extend(
            AiContextSearchResult(
                documentId=attachment.id,
                name=attachment.name,
                path=attachment.path or attachment.name,
                kind="external_file",
                mimeType=attachment.mimeType,
            )
            for attachment in attachments[:8]
        )
        return results[:20]

    def list_sources(self, project_id: str) -> AiContextSourceListResponse:
        data = self._read_project_data(project_id)
        sources, expired = self._active_sources_from_data(project_id, data)
        if expired:
            self._write_sources(project_id, [source.model_dump() for source in sources])
        return AiContextSourceListResponse(sources=sources, expiredSourceIds=expired)

    def create_project_document_source(self, project_id: str, document_id: str) -> AiContextSource:
        document = document_service.get_document(document_id)
        if document.projectId != project_id:
            raise HTTPException(status_code=400, detail="Document does not belong to project")

        data = self._read_project_data(project_id)
        sources = data.get("sources") if isinstance(data.get("sources"), list) else []
        for source in sources:
            if source.get("kind") == "project_document" and source.get("documentId") == document.id and not self._is_expired(source):
                updated = self._refresh_record(source)
                self._replace_source(project_id, updated)
                return self._source_from_record(updated)

        now = _now()
        record = {
            "id": f"ctx_{uuid4().hex}",
            "projectId": project_id,
            "kind": "project_document",
            "documentId": document.id,
            "name": document.name,
            "path": document.path,
            "mimeType": "text/markdown",
            "sizeBytes": len(document.markdown.encode("utf-8")),
            "status": "ready",
            "weight": _weight_for_chars(len(document.markdown)),
            "warning": None,
            "error": None,
            "createdAt": now,
            "updatedAt": now,
            "lastUsedAt": None,
            "expiresAt": _expires_from(now),
        }
        self._append_source(project_id, record)
        return self._source_from_record(record)

    def create_project_image_source(self, project_id: str, image_path: Path, root: Path) -> AiContextSource:
        relative_path = image_path.relative_to(root).as_posix().strip("/")
        data = self._read_project_data(project_id)
        sources = data.get("sources") if isinstance(data.get("sources"), list) else []
        for source in sources:
            if source.get("kind") == "image" and source.get("assetPath") == relative_path and not self._is_expired(source):
                updated = self._refresh_record(source)
                self._replace_source(project_id, updated)
                return self._source_from_record(updated)

        source_id = f"ctx_{uuid4().hex}"
        now = _now()
        mime_type = mimetypes.guess_type(image_path.name)[0] or "image/*"
        data_bytes = image_path.read_bytes()
        extracted = {
            "text": "",
            "metadata": {"mimeType": mime_type, "sizeBytes": len(data_bytes), "source": "project", "path": relative_path},
            "imageDataUrl": f"data:{mime_type};base64,{base64.b64encode(data_bytes).decode('ascii')}",
        }
        self._write_extracted(project_id, source_id, extracted)
        record = {
            "id": source_id,
            "projectId": project_id,
            "kind": "image",
            "assetPath": relative_path,
            "name": image_path.name,
            "path": relative_path,
            "mimeType": mime_type,
            "sizeBytes": len(data_bytes),
            "status": "ready",
            "weight": "medium" if len(data_bytes) > 2 * 1024 * 1024 else "light",
            "warning": None,
            "error": None,
            "createdAt": now,
            "updatedAt": now,
            "lastUsedAt": None,
            "expiresAt": _expires_from(now),
        }
        self._append_source(project_id, record)
        return self._source_from_record(record)

    def create_project_attachment_source(self, project_id: str, attachment_id: str) -> AiContextSource:
        node_project_id, relative_path = decode_node_id(attachment_id)
        if node_project_id != project_id:
            raise HTTPException(status_code=400, detail="Attachment does not belong to project")
        root = project_service._get_project_root(project_id).resolve()
        attachment_path = (root / relative_path).resolve()
        try:
            attachment_path.relative_to(root)
        except ValueError:
            raise HTTPException(status_code=400, detail="Attachment path escapes project folder") from None
        if not attachment_path.exists() or not attachment_path.is_file():
            raise HTTPException(status_code=404, detail="Attachment not found")
        extension = attachment_path.suffix.lower()
        if extension not in SUPPORTED_EXTENSIONS or extension in IMAGE_EXTENSIONS or extension in {".md"}:
            raise HTTPException(status_code=400, detail="This project file cannot be used as text context")

        normalized_path = attachment_path.relative_to(root).as_posix().strip("/")
        data = self._read_project_data(project_id)
        sources = data.get("sources") if isinstance(data.get("sources"), list) else []
        for source in sources:
            if source.get("kind") == "external_file" and source.get("attachmentPath") == normalized_path and not self._is_expired(source):
                updated = self._refresh_record(source)
                self._replace_source(project_id, updated)
                return self._source_from_record(updated)

        source_id = f"ctx_{uuid4().hex}"
        now = _now()
        mime_type = mimetypes.guess_type(attachment_path.name)[0] or "application/octet-stream"
        try:
            extracted = self._extract_file(attachment_path, attachment_path.name, mime_type, is_image=False)
            status = "warning" if extracted.get("warning") else "ready"
            warning = extracted.get("warning")
            error = None
        except Exception as exc:
            extracted = {"text": "", "metadata": {"format": extension.lstrip("."), "source": "project", "path": normalized_path}}
            status = "error"
            warning = None
            error = f"No se pudo leer el archivo: {type(exc).__name__}"
        extracted["metadata"] = {
            **(extracted.get("metadata") if isinstance(extracted.get("metadata"), dict) else {}),
            "source": "project",
            "path": normalized_path,
            "mimeType": mime_type,
            "sizeBytes": attachment_path.stat().st_size,
        }
        self._write_extracted(project_id, source_id, extracted)
        text = str(extracted.get("text") or "")
        record = {
            "id": source_id,
            "projectId": project_id,
            "kind": "external_file",
            "attachmentPath": normalized_path,
            "name": attachment_path.name,
            "path": normalized_path,
            "mimeType": mime_type,
            "sizeBytes": attachment_path.stat().st_size,
            "status": status,
            "weight": _weight_for_chars(len(text)),
            "warning": warning,
            "error": error,
            "createdAt": now,
            "updatedAt": now,
            "lastUsedAt": None,
            "expiresAt": _expires_from(now),
        }
        self._append_source(project_id, record)
        return self._source_from_record(record)

    async def upload_files(self, project_id: str, files: list[UploadFile]) -> AiContextSourceListResponse:
        project_service.get_project_tree(project_id)
        created: list[AiContextSource] = []
        for upload in files:
            created.append(await self._create_file_source(project_id, upload))
        list_response = self.list_sources(project_id)
        return AiContextSourceListResponse(sources=list_response.sources, expiredSourceIds=list_response.expiredSourceIds)

    def remove_source(self, project_id: str, source_id: str) -> AiContextSourceListResponse:
        data = self._read_project_data(project_id)
        records = data.get("sources") if isinstance(data.get("sources"), list) else []
        next_records = [record for record in records if record.get("id") != source_id]
        if len(next_records) == len(records):
            raise HTTPException(status_code=404, detail="AI context source not found")
        self._write_sources(project_id, next_records)
        self._delete_source_files(project_id, source_id)
        return self.list_sources(project_id)

    def extend_source(self, project_id: str, source_id: str) -> AiContextSource:
        record = self._record_by_id(project_id, source_id)
        record = self._refresh_record(record)
        self._replace_source(project_id, record)
        return self._source_from_record(record)

    def preview_source(self, project_id: str, source_id: str) -> AiContextSourcePreviewResponse:
        record = self._record_by_id(project_id, source_id)
        source = self._source_from_record(record)
        preview_text = None
        metadata: dict[str, Any] = {}
        if record.get("kind") == "project_document" and isinstance(record.get("documentId"), str):
            document = document_service.get_document(record["documentId"])
            preview_text = _truncate(document.markdown, MAX_PREVIEW_CHARS)
            metadata = {"wordCount": document.wordCount}
        elif record.get("kind") == "external_file":
            extracted = self._read_extracted(project_id, source_id)
            preview_text = _truncate(str(extracted.get("text") or ""), MAX_PREVIEW_CHARS)
            metadata = extracted.get("metadata") if isinstance(extracted.get("metadata"), dict) else {}
        elif record.get("kind") == "image":
            metadata = self._read_extracted(project_id, source_id).get("metadata", {})
        return AiContextSourcePreviewResponse(source=source, previewText=preview_text, metadata=metadata)

    def add_source_to_project(self, project_id: str, source_id: str, payload: AiContextAddToProjectRequest) -> AiContextAddToProjectResponse:
        record = self._record_by_id(project_id, source_id)
        if record.get("kind") == "project_document":
            raise HTTPException(status_code=400, detail="Project documents are already part of the project")

        extracted = self._read_extracted(project_id, source_id)
        text = str(extracted.get("text") or "").strip()
        if not text:
            raise HTTPException(status_code=409, detail="This source has no extracted text to add as a document")
        name = payload.name or f"{Path(str(record.get('name') or 'fuente')).stem}.md"
        if not name.lower().endswith(".md"):
            name = f"{name}.md"
        markdown = f"# {Path(name).stem}\n\n{text.strip()}\n"
        result = project_service.create_document(project_id, CreateDocumentRequest(parentId=payload.parentId, name=name, markdown=markdown))
        return AiContextAddToProjectResponse(
            documentId=result.node.id if result.node else "",
            path=result.node.path if result.node else name,
            tree=[node.model_dump() for node in result.tree],
        )

    def resolve_sources(self, project_id: str, source_ids: list[str]) -> tuple[list[dict[str, Any]], list[AiContextSourceRef], list[str]]:
        if not source_ids:
            return [], [], []
        data = self._read_project_data(project_id)
        records = data.get("sources") if isinstance(data.get("sources"), list) else []
        requested = list(dict.fromkeys(source_ids))
        by_id = {record.get("id"): record for record in records if isinstance(record, dict)}
        resolved: list[dict[str, Any]] = []
        refs: list[AiContextSourceRef] = []
        expired: list[str] = []
        now = _now()

        for source_id in requested:
            record = by_id.get(source_id)
            if not record:
                refs.append(AiContextSourceRef(id=source_id, kind="external_file", name="Fuente no disponible", status="failed"))
                continue
            if self._is_expired(record):
                expired.append(source_id)
                refs.append(self._ref_from_record(record, "expired"))
                continue
            status = record.get("status")
            if status not in {"ready", "warning"}:
                refs.append(self._ref_from_record(record, "failed"))
                continue
            content = self._resolve_record_content(project_id, record)
            if content is None:
                refs.append(self._ref_from_record(record, "failed"))
                continue
            resolved.append(content)
            refs.append(self._ref_from_record(record, "used"))
            record["lastUsedAt"] = now
            record["expiresAt"] = _expires_from(now)
            record["updatedAt"] = now

        active_records = [record for record in records if record.get("id") not in expired]
        self._write_sources(project_id, active_records)
        return resolved, refs, expired

    def _resolve_record_content(self, project_id: str, record: dict[str, Any]) -> dict[str, Any] | None:
        kind = record.get("kind")
        if kind == "project_document" and isinstance(record.get("documentId"), str):
            try:
                document = document_service.get_document(record["documentId"])
            except HTTPException:
                return None
            return {
                "id": record["id"],
                "kind": kind,
                "name": document.name,
                "path": document.path,
                "content": _truncate(document.markdown, MAX_CONTEXT_CHARS_HIGH),
                "metadata": {"source": "project", "wordCount": document.wordCount},
            }
        if kind == "external_file":
            extracted = self._read_extracted(project_id, str(record.get("id")))
            text = str(extracted.get("text") or "")
            summary = str(extracted.get("summary") or "") if extracted.get("summary") else None
            return {
                "id": record["id"],
                "kind": kind,
                "name": record.get("name"),
                "path": record.get("path"),
                "content": _truncate(text, MAX_CONTEXT_CHARS_HIGH),
                "summary": summary,
                "metadata": extracted.get("metadata") if isinstance(extracted.get("metadata"), dict) else {},
            }
        if kind == "image":
            extracted = self._read_extracted(project_id, str(record.get("id")))
            return {
                "id": record["id"],
                "kind": kind,
                "name": record.get("name"),
                "content": "Imagen adjunta por el usuario. Analiza su contenido visual si el modelo soporta imagen.",
                "metadata": extracted.get("metadata") if isinstance(extracted.get("metadata"), dict) else {},
                "imageDataUrl": extracted.get("imageDataUrl"),
            }
        return None

    async def _create_file_source(self, project_id: str, upload: UploadFile) -> AiContextSource:
        filename = Path(upload.filename or "archivo").name
        extension = Path(filename).suffix.lower()
        if extension not in SUPPORTED_EXTENSIONS:
            raise HTTPException(status_code=400, detail=f"Tipo de archivo no soportado: {extension or filename}")
        source_id = f"ctx_{uuid4().hex}"
        now = _now()
        source_path = self._source_file_path(project_id, source_id, filename)
        source_path.parent.mkdir(parents=True, exist_ok=True)
        size = 0
        with source_path.open("wb") as output:
            while True:
                chunk = await upload.read(1024 * 1024)
                if not chunk:
                    break
                size += len(chunk)
                output.write(chunk)
        mime_type = upload.content_type or mimetypes.guess_type(filename)[0] or "application/octet-stream"
        is_image = extension in IMAGE_EXTENSIONS or mime_type.startswith("image/")
        if is_image and not mime_type.startswith("image/"):
            mime_type = mimetypes.guess_type(filename)[0] or "image/png"
        record = {
            "id": source_id,
            "projectId": project_id,
            "kind": "image" if is_image else "external_file",
            "name": filename,
            "path": None,
            "mimeType": mime_type,
            "sizeBytes": size,
            "status": "processing",
            "weight": "light",
            "warning": None,
            "error": None,
            "createdAt": now,
            "updatedAt": now,
            "lastUsedAt": None,
            "expiresAt": _expires_from(now),
            "filePath": str(source_path.relative_to(self._project_context_dir(project_id))),
        }
        try:
            extracted = self._extract_file(source_path, filename, mime_type, is_image)
            self._write_extracted(project_id, source_id, extracted)
            text = str(extracted.get("text") or "")
            record["weight"] = _weight_for_chars(len(text))
            record["status"] = "warning" if extracted.get("warning") else "ready"
            record["warning"] = extracted.get("warning")
            record["updatedAt"] = _now()
        except Exception as error:
            record["status"] = "error"
            record["error"] = f"No se pudo leer el archivo: {type(error).__name__}"
            record["updatedAt"] = _now()
        self._append_source(project_id, record)
        return self._source_from_record(record)

    def _extract_file(self, path: Path, filename: str, mime_type: str, is_image: bool) -> dict[str, Any]:
        if is_image:
            data = path.read_bytes()
            return {
                "text": "",
                "metadata": {"mimeType": mime_type, "sizeBytes": len(data)},
                "imageDataUrl": f"data:{mime_type};base64,{base64.b64encode(data).decode('ascii')}",
            }
        extension = path.suffix.lower()
        if extension in {".md", ".txt"}:
            text = path.read_text(encoding="utf-8", errors="replace")
            return {"text": text, "metadata": {"format": extension.lstrip(".")}}
        if extension == ".docx":
            text = _extract_docx(path)
            return {"text": text, "metadata": {"format": "docx"}}
        if extension == ".pptx":
            slides = _extract_pptx(path)
            text = "\n\n".join(f"Slide {index + 1}\n{slide}" for index, slide in enumerate(slides))
            return {"text": text, "metadata": {"format": "pptx", "slides": len(slides)}}
        if extension == ".pdf":
            text = _extract_pdf_text(path)
            warning = None if len(text.strip()) > 40 else "El PDF no tiene texto extraíble suficiente; puede ser escaneado."
            return {"text": text, "metadata": {"format": "pdf"}, "warning": warning}
        return {"text": "", "metadata": {"format": extension.lstrip(".")}, "warning": "Tipo de archivo parcialmente soportado."}

    def _record_by_id(self, project_id: str, source_id: str) -> dict[str, Any]:
        data = self._read_project_data(project_id)
        records = data.get("sources") if isinstance(data.get("sources"), list) else []
        for record in records:
            if isinstance(record, dict) and record.get("id") == source_id:
                return dict(record)
        raise HTTPException(status_code=404, detail="AI context source not found")

    def _source_from_record(self, record: dict[str, Any]) -> AiContextSource:
        record = dict(record)
        record.pop("documentId", None)
        record.pop("filePath", None)
        if record.get("expiresAt") and _minutes_until(str(record["expiresAt"])) <= EXPIRING_THRESHOLD_MINUTES and not self._is_expired(record):
            record["status"] = "expiring"
        return AiContextSource(**record)

    def _ref_from_record(self, record: dict[str, Any], status: str) -> AiContextSourceRef:
        return AiContextSourceRef(
            id=str(record.get("id")),
            kind=record.get("kind") if record.get("kind") in {"project_document", "external_file", "image"} else "external_file",
            name=str(record.get("name") or "Fuente"),
            path=record.get("path") if isinstance(record.get("path"), str) else None,
            status=status,
        )

    def _active_sources_from_data(self, project_id: str, data: dict[str, Any]) -> tuple[list[AiContextSource], list[str]]:
        records = data.get("sources") if isinstance(data.get("sources"), list) else []
        active: list[AiContextSource] = []
        expired: list[str] = []
        for record in records:
            if not isinstance(record, dict):
                continue
            if self._is_expired(record):
                expired.append(str(record.get("id")))
                continue
            try:
                active.append(self._source_from_record(record))
            except Exception:
                continue
        return active, expired

    def _refresh_record(self, record: dict[str, Any]) -> dict[str, Any]:
        now = _now()
        updated = dict(record)
        updated["updatedAt"] = now
        updated["lastUsedAt"] = now
        updated["expiresAt"] = _expires_from(now)
        return updated

    def _is_expired(self, record: dict[str, Any]) -> bool:
        expires_at = record.get("expiresAt")
        if not isinstance(expires_at, str):
            return False
        return _parse_iso(expires_at) <= datetime.now(timezone.utc)

    def _read_project_data(self, project_id: str) -> dict[str, Any]:
        return self._store(project_id).read({"schemaVersion": 1, "sources": []})

    def _append_source(self, project_id: str, record: dict[str, Any]) -> None:
        data = self._read_project_data(project_id)
        sources = data.get("sources") if isinstance(data.get("sources"), list) else []
        sources.append(record)
        self._write_sources(project_id, sources)

    def _replace_source(self, project_id: str, record: dict[str, Any]) -> None:
        data = self._read_project_data(project_id)
        sources = data.get("sources") if isinstance(data.get("sources"), list) else []
        self._write_sources(project_id, [record if source.get("id") == record.get("id") else source for source in sources])

    def _write_sources(self, project_id: str, sources: list[dict[str, Any]]) -> None:
        self._store(project_id).write({"schemaVersion": 1, "sources": sources})

    def _store(self, project_id: str) -> JsonFileStore:
        return JsonFileStore(f"ai-context/{_safe_project_filename(project_id)}/sources.json")

    def _project_context_dir(self, project_id: str) -> Path:
        return get_app_data_dir() / "ai-context" / _safe_project_filename(project_id)

    def _source_file_path(self, project_id: str, source_id: str, filename: str) -> Path:
        return self._project_context_dir(project_id) / "files" / f"{source_id}_{_safe_filename(filename)}"

    def _extracted_path(self, project_id: str, source_id: str) -> Path:
        return self._project_context_dir(project_id) / "extracted" / f"{source_id}.json"

    def _write_extracted(self, project_id: str, source_id: str, extracted: dict[str, Any]) -> None:
        path = self._extracted_path(project_id, source_id)
        path.parent.mkdir(parents=True, exist_ok=True)
        temp_path = path.with_name(f"{source_id[:16]}.tmp")
        try:
            with temp_path.open("w", encoding="utf-8") as file:
                json.dump(extracted, file, ensure_ascii=False, indent=2)
                file.write("\n")
            temp_path.replace(path)
        finally:
            try:
                temp_path.unlink(missing_ok=True)
            except OSError:
                pass

    def _read_extracted(self, project_id: str, source_id: str) -> dict[str, Any]:
        path = self._extracted_path(project_id, source_id)
        if not path.exists():
            return {"text": "", "metadata": {}}
        try:
            with path.open("r", encoding="utf-8") as file:
                data = json.load(file)
        except (json.JSONDecodeError, OSError):
            return {"text": "", "metadata": {}}
        return data if isinstance(data, dict) else {"text": "", "metadata": {}}

    def _delete_source_files(self, project_id: str, source_id: str) -> None:
        context_dir = self._project_context_dir(project_id)
        for folder in ("files", "extracted"):
            target_dir = context_dir / folder
            if not target_dir.exists():
                continue
            for path in target_dir.glob(f"{source_id}*"):
                try:
                    if path.is_dir():
                        shutil.rmtree(path)
                    else:
                        path.unlink()
                except OSError:
                    pass


def _flatten_documents(nodes: list[TreeNode]) -> list[TreeNode]:
    documents: list[TreeNode] = []
    for node in nodes:
        if node.type == "document":
            documents.append(node)
        if node.children:
            documents.extend(_flatten_documents(node.children))
    return documents


def _flatten_images(nodes: list[TreeNode]) -> list[TreeNode]:
    images: list[TreeNode] = []
    for node in nodes:
        if node.type == "image":
            images.append(node)
        if node.children:
            images.extend(_flatten_images(node.children))
    return images


def _flatten_context_attachments(nodes: list[TreeNode]) -> list[TreeNode]:
    attachments: list[TreeNode] = []
    for node in nodes:
        if node.type == "attachment" and Path(node.name).suffix.lower() in SUPPORTED_EXTENSIONS - IMAGE_EXTENSIONS - {".md"}:
            attachments.append(node)
        if node.children:
            attachments.extend(_flatten_context_attachments(node.children))
    return attachments


def _score_document(document: TreeNode, query: str) -> int:
    if not query:
        return 100
    name = document.name.lower()
    path = (document.path or "").lower()
    if name == query or path == query:
        return 0
    if name.startswith(query):
        return 1
    if query in name:
        return 2
    return 3


def _extract_docx(path: Path) -> str:
    with zipfile.ZipFile(path) as archive:
        names = [name for name in archive.namelist() if name.startswith("word/") and name.endswith(".xml")]
        texts: list[str] = []
        for name in sorted(names):
            if not (name == "word/document.xml" or name.startswith("word/header") or name.startswith("word/footer")):
                continue
            texts.extend(_xml_text_nodes(archive.read(name)))
        return "\n".join(text for text in texts if text.strip())


def _extract_pptx(path: Path) -> list[str]:
    with zipfile.ZipFile(path) as archive:
        slide_names = sorted(
            [name for name in archive.namelist() if name.startswith("ppt/slides/slide") and name.endswith(".xml")],
            key=_natural_sort_key,
        )
        slides: list[str] = []
        for name in slide_names:
            slide_text = "\n".join(_xml_text_nodes(archive.read(name)))
            slides.append(slide_text)
        return slides


def _xml_text_nodes(data: bytes) -> list[str]:
    try:
        root = ElementTree.fromstring(data)
    except ElementTree.ParseError:
        return []
    texts: list[str] = []
    for element in root.iter():
        if element.tag.endswith("}t") or element.tag.endswith("}instrText"):
            if element.text:
                texts.append(element.text)
    return texts


def _extract_pdf_text(path: Path) -> str:
    data = path.read_bytes()
    chunks: list[str] = []
    for match in re.finditer(rb"\(([^()]|\\.){2,}\)", data):
        value = match.group(0)[1:-1]
        try:
            chunks.append(unescape(value.decode("latin-1", errors="ignore").replace("\\(", "(").replace("\\)", ")")))
        except Exception:
            continue
    if chunks:
        return "\n".join(_clean_text(chunk) for chunk in chunks if _clean_text(chunk))
    decoded = data.decode("latin-1", errors="ignore")
    words = re.findall(r"[A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9][A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9 ,.;:()/%+-]{3,}", decoded)
    return "\n".join(_clean_text(word) for word in words[:400] if _clean_text(word))


def _clean_text(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def _natural_sort_key(value: str) -> list[Any]:
    return [int(part) if part.isdigit() else part for part in re.split(r"(\d+)", value)]


def _weight_for_chars(chars: int) -> str:
    if chars > MAX_CONTEXT_CHARS_HIGH:
        return "too_large"
    if chars > MAX_CONTEXT_CHARS_LIGHT:
        return "high"
    if chars > 3000:
        return "medium"
    return "light"


def _truncate(value: str, max_chars: int) -> str:
    if len(value) <= max_chars:
        return value
    return f"{value[:max_chars].rstrip()}\n\n[Contenido truncado por tamaño]"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _expires_from(iso_value: str) -> str:
    return (_parse_iso(iso_value) + timedelta(minutes=CONTEXT_TTL_MINUTES)).isoformat()


def _parse_iso(value: str) -> datetime:
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return datetime.now(timezone.utc)
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _minutes_until(value: str) -> float:
    return (_parse_iso(value) - datetime.now(timezone.utc)).total_seconds() / 60


def _safe_project_filename(project_id: str) -> str:
    return re.sub(r"[^A-Za-z0-9_.-]+", "_", project_id).strip("._") or "project"


def _safe_filename(filename: str) -> str:
    value = re.sub(r"[^A-Za-z0-9_.-]+", "_", filename).strip("._")
    return value or "archivo"


ai_context_service = AiContextService()
