from __future__ import annotations

import hashlib
import json
import os
import platform
import re
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import HTTPException

from app.schemas.document import DocumentFingerprint
from app.schemas.document_preview import (
    DocumentPreview,
    DocumentPreviewRequest,
    DocumentPreviewTextResponse,
    PreviewFormat,
    SpreadsheetSheetResponse,
    SpreadsheetSheetsResponse,
)
from app.services.docx_fallback_preview_service import DOCX_FALLBACK_WARNING, docx_fallback_preview_service
from app.services.office_conversion_service import OFFICE_CONVERSION_ENGINE_VERSION, office_conversion_service
from app.services.preview_cache_service import preview_cache_service
from app.services.preview_text_service import preview_text_service
from app.services.project_service import project_service
from app.services.spreadsheet_preview_service import spreadsheet_preview_service


SUPPORTED_SUFFIXES: dict[str, PreviewFormat] = {
    ".pdf": "pdf",
    ".docx": "docx",
    ".xlsx": "xlsx",
}
MAX_PREVIEW_BYTES = 75 * 1024 * 1024
PREVIEW_SCHEMA_VERSION = 4


class DocumentPreviewService:
    def create_preview(self, project_id: str, payload: DocumentPreviewRequest) -> DocumentPreview:
        source_path = self._resolve_source_path(project_id, payload.path)
        source_format = self._format_for_path(source_path)
        fingerprint = self._fingerprint(source_path)
        source_hash = self._source_hash(project_id, payload.path, fingerprint, source_format, payload.preferredMode)
        preview_id = f"pv_{source_hash[:32]}"
        preview_dir = preview_cache_service.preview_dir(project_id, source_hash)
        preview_path = preview_dir / "preview.json"
        cached = preview_cache_service.read_json(preview_path)
        if cached:
            preview = DocumentPreview(**cached)
            if self._is_fingerprint_current(source_path, preview.sourceFingerprint):
                return preview
            return preview.model_copy(update={"status": "stale", "warnings": [*preview.warnings, "Vista desactualizada."]})

        preview_dir.mkdir(parents=True, exist_ok=True)
        preview = DocumentPreview(
            id=preview_id,
            projectId=project_id,
            path=payload.path.replace("\\", "/").strip("/"),
            name=source_path.name,
            format=source_format,
            status="processing",
            sourceFingerprint=fingerprint,
            availableRenditions=[],
            warnings=[],
        )
        try:
            preview = self._generate_preview(preview, source_path, preview_dir)
        except HTTPException as error:
            detail = error.detail if isinstance(error.detail, dict) else {"message": str(error.detail)}
            status = "error"
            if detail.get("code") == "converter_unavailable":
                status = "unsupported"
            preview = preview.model_copy(
                update={
                    "status": status,
                    "error": str(detail.get("message") or "No se pudo preparar la vista."),
                    "generatedAt": self._now(),
                }
            )
        preview_cache_service.write_json(preview_path, preview.model_dump(mode="json"))
        return preview

    def get_preview(self, project_id: str, preview_id: str) -> DocumentPreview:
        preview = self._find_preview(project_id, preview_id)
        source_path = self._resolve_source_path(project_id, preview.path)
        if not self._is_fingerprint_current(source_path, preview.sourceFingerprint):
            return preview.model_copy(update={"status": "stale", "warnings": unique_strings([*preview.warnings, "Vista desactualizada."])})
        return preview

    def refresh_preview(self, project_id: str, preview_id: str) -> DocumentPreview:
        preview = self._find_preview(project_id, preview_id)
        source_path = self._resolve_source_path(project_id, preview.path)
        source_format = self._format_for_path(source_path)
        fingerprint = self._fingerprint(source_path)
        source_hash = self._source_hash(project_id, preview.path, fingerprint, source_format, None)
        next_dir = preview_cache_service.preview_dir(project_id, source_hash)
        next_preview_id = f"pv_{source_hash[:32]}"
        next_preview = DocumentPreview(
            id=next_preview_id,
            projectId=project_id,
            path=preview.path,
            name=source_path.name,
            format=source_format,
            status="processing",
            sourceFingerprint=fingerprint,
            availableRenditions=[],
            warnings=[],
        )
        next_dir.mkdir(parents=True, exist_ok=True)
        try:
            next_preview = self._generate_preview(next_preview, source_path, next_dir)
        except HTTPException as error:
            detail = error.detail if isinstance(error.detail, dict) else {"message": str(error.detail)}
            next_preview = next_preview.model_copy(
                update={"status": "error", "error": str(detail.get("message") or "No se pudo actualizar la vista."), "generatedAt": self._now()}
            )
        preview_cache_service.write_json(next_dir / "preview.json", next_preview.model_dump(mode="json"))
        return next_preview

    def pdf_path(self, project_id: str, preview_id: str) -> Path:
        preview, preview_dir = self._find_preview_with_dir(project_id, preview_id)
        if "pdf" not in preview.availableRenditions:
            raise HTTPException(status_code=404, detail="PDF rendition not available")
        path = preview_dir / "document.pdf"
        if not path.exists():
            source_path = self._resolve_source_path(project_id, preview.path)
            if preview.format == "pdf":
                return source_path
            raise HTTPException(status_code=404, detail="PDF rendition not found")
        return path

    def get_text(self, project_id: str, preview_id: str) -> DocumentPreviewTextResponse:
        preview, preview_dir = self._find_preview_with_dir(project_id, preview_id)
        text_payload = preview_cache_service.read_json(preview_dir / "text.json") or {}
        text = str(text_payload.get("text") or "")
        warnings = [str(item) for item in text_payload.get("warnings", []) if isinstance(item, str)]
        return DocumentPreviewTextResponse(previewId=preview.id, text=text, searchable=bool(text.strip()), warnings=warnings)

    def get_sheets(self, project_id: str, preview_id: str) -> SpreadsheetSheetsResponse:
        preview, _ = self._find_preview_with_dir(project_id, preview_id)
        if preview.format != "xlsx" or preview.sheets is None:
            raise HTTPException(status_code=404, detail="Workbook rendition not available")
        return SpreadsheetSheetsResponse(previewId=preview.id, sheets=preview.sheets)

    def get_sheet(self, project_id: str, preview_id: str, sheet_id: str) -> SpreadsheetSheetResponse:
        _, preview_dir = self._find_preview_with_dir(project_id, preview_id)
        workbook = preview_cache_service.read_json(preview_dir / "workbook.json")
        if not workbook:
            raise HTTPException(status_code=404, detail="Workbook rendition not found")
        sheet = workbook.get("sheets", {}).get(sheet_id)
        if not isinstance(sheet, dict):
            raise HTTPException(status_code=404, detail="Sheet not found")
        return SpreadsheetSheetResponse(**sheet)

    def open_external(self, project_id: str, preview_id: str) -> dict[str, str]:
        preview = self._find_preview(project_id, preview_id)
        source_path = self._resolve_source_path(project_id, preview.path)
        try:
            if platform.system() == "Windows":
                os.startfile(str(source_path))  # type: ignore[attr-defined]
            elif platform.system() == "Darwin":
                subprocess.Popen(["open", str(source_path)])
            else:
                subprocess.Popen(["xdg-open", str(source_path)])
        except OSError as error:
            raise HTTPException(status_code=500, detail="No se pudo abrir el archivo con la aplicación externa.") from error
        return {"status": "ok"}

    def _generate_preview(self, preview: DocumentPreview, source_path: Path, preview_dir: Path) -> DocumentPreview:
        warnings: list[str] = []
        renditions: list[str] = []
        page_count: int | None = None
        sheets = None

        if preview.sourceFingerprint.size and preview.sourceFingerprint.size > MAX_PREVIEW_BYTES:
            return preview.model_copy(
                update={
                    "status": "error",
                    "error": "Archivo demasiado grande para vista integrada.",
                    "generatedAt": self._now(),
                }
            )

        if preview.format == "pdf":
            (preview_dir / "document.pdf").write_bytes(source_path.read_bytes())
            renditions.append("pdf")
            text, text_warnings = preview_text_service.extract_pdf_text(source_path)
            warnings.extend(text_warnings)
            preview_cache_service.write_json(preview_dir / "text.json", {"text": text, "warnings": text_warnings})
            if text:
                renditions.append("text")
            page_count = count_pdf_pages(source_path)

        elif preview.format == "docx":
            try:
                office_conversion_service.convert_to_pdf(source_path, preview_dir / "document.pdf")
            except HTTPException as error:
                detail = error.detail if isinstance(error.detail, dict) else {}
                if detail.get("code") != "converter_unavailable":
                    raise
                docx_fallback_preview_service.generate_pdf(source_path, preview_dir / "document.pdf")
                warnings.append(DOCX_FALLBACK_WARNING)
            renditions.append("pdf")
            text, text_warnings = preview_text_service.extract_docx_text(source_path)
            warnings.extend(["Vista generada desde Word.", *text_warnings])
            preview_cache_service.write_json(preview_dir / "text.json", {"text": text, "warnings": text_warnings})
            if text:
                renditions.append("text")
            page_count = count_pdf_pages(preview_dir / "document.pdf")

        elif preview.format == "xlsx":
            workbook = spreadsheet_preview_service.read_workbook(source_path, preview.id)
            sheets = workbook["sheets"]
            workbook_payload = {
                "sheets": {
                    sheet_id: sheet.model_dump(mode="json")
                    for sheet_id, sheet in workbook["sheet_payloads"].items()
                }
            }
            preview_cache_service.write_json(preview_dir / "workbook.json", workbook_payload)
            renditions.append("workbook")
            text, text_warnings = preview_text_service.extract_xlsx_text(workbook)
            preview_cache_service.write_json(preview_dir / "text.json", {"text": text, "warnings": text_warnings})
            if text:
                renditions.append("text")

        return preview.model_copy(
            update={
                "status": "ready",
                "availableRenditions": unique_strings(renditions),
                "pageCount": page_count,
                "sheets": sheets,
                "warnings": unique_strings(warnings),
                "generatedAt": self._now(),
                "error": None,
            }
        )

    def _find_preview(self, project_id: str, preview_id: str) -> DocumentPreview:
        preview, _ = self._find_preview_with_dir(project_id, preview_id)
        return preview

    def _find_preview_with_dir(self, project_id: str, preview_id: str) -> tuple[DocumentPreview, Path]:
        project_cache_dir = preview_cache_service.root / project_id
        for preview_path in project_cache_dir.glob("*/preview.json"):
            payload = preview_cache_service.read_json(preview_path)
            if payload and payload.get("id") == preview_id:
                return DocumentPreview(**payload), preview_path.parent
        raise HTTPException(status_code=404, detail="Preview not found")

    def _resolve_source_path(self, project_id: str, relative_path: str) -> Path:
        root = project_service._get_project_root(project_id).resolve()
        normalized_path = relative_path.replace("\\", "/").strip("/")
        if not normalized_path or normalized_path.startswith("../") or "/../" in f"/{normalized_path}/":
            raise HTTPException(status_code=400, detail="Preview path escapes project folder")
        source_path = (root / normalized_path).resolve()
        try:
            source_path.relative_to(root)
        except ValueError:
            raise HTTPException(status_code=400, detail="Preview path escapes project folder") from None
        if not source_path.exists() or not source_path.is_file():
            raise HTTPException(status_code=404, detail="Reference document not found")
        self._format_for_path(source_path)
        return source_path

    def _format_for_path(self, path: Path) -> PreviewFormat:
        suffix = path.suffix.lower()
        if suffix not in SUPPORTED_SUFFIXES:
            raise HTTPException(status_code=415, detail="Unsupported reference document format")
        return SUPPORTED_SUFFIXES[suffix]

    def _fingerprint(self, path: Path) -> DocumentFingerprint:
        stat = path.stat()
        digest = hashlib.sha256()
        with path.open("rb") as file:
            for chunk in iter(lambda: file.read(1024 * 1024), b""):
                digest.update(chunk)
        return DocumentFingerprint(mtimeNs=stat.st_mtime_ns, size=stat.st_size, sha256=digest.hexdigest())

    def _is_fingerprint_current(self, path: Path, fingerprint: DocumentFingerprint) -> bool:
        current = self._fingerprint(path)
        return current.sha256 == fingerprint.sha256 and current.size == fingerprint.size

    def _source_hash(self, project_id: str, relative_path: str, fingerprint: DocumentFingerprint, source_format: PreviewFormat, preferred_mode: str | None) -> str:
        payload = {
            "schema": PREVIEW_SCHEMA_VERSION,
            "projectId": project_id,
            "path": relative_path.replace("\\", "/").strip("/"),
            "fingerprint": fingerprint.model_dump(mode="json"),
            "format": source_format,
            "mode": preferred_mode,
            "engine": OFFICE_CONVERSION_ENGINE_VERSION,
        }
        return hashlib.sha256(json.dumps(payload, sort_keys=True).encode("utf-8")).hexdigest()

    def _now(self) -> str:
        return datetime.now(timezone.utc).isoformat()


def count_pdf_pages(path: Path) -> int | None:
    try:
        from pypdf import PdfReader  # type: ignore
        return len(PdfReader(str(path)).pages)
    except Exception:
        try:
            data = path.read_bytes()
        except OSError:
            return None
        count = len(re.findall(rb"/Type\s*/Page\b", data))
        return count or None


def unique_strings(values: list[Any]) -> list[str]:
    result: list[str] = []
    seen: set[str] = set()
    for value in values:
        item = str(value)
        if not item or item in seen:
            continue
        seen.add(item)
        result.append(item)
    return result


document_preview_service = DocumentPreviewService()
