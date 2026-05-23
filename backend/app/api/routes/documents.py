from urllib.parse import quote

from fastapi import APIRouter, Response

from app.schemas.document import (
    Document,
    DraftResponse,
    ExportDocumentContentRequest,
    ExportDocumentRequest,
    ExportDocumentResponse,
    OrphanDraft,
    RestoreDraftResponse,
    SaveDocumentRequest,
    SaveDraftRequest,
    SyncStatusRequest,
    SyncStatusResponse,
)
from app.services.document_service import document_service
from app.services.export_service import export_service

router = APIRouter()


@router.get("/documents/{document_id}", response_model=Document)
def get_document(document_id: str) -> Document:
    return document_service.get_document(document_id)


@router.put("/documents/{document_id}", response_model=Document)
def save_document(document_id: str, payload: SaveDocumentRequest) -> Document:
    return document_service.save_document(document_id, payload.markdown, payload.baseFingerprint, payload.force)


@router.put("/documents/{document_id}/draft", response_model=DraftResponse)
def save_document_draft(document_id: str, payload: SaveDraftRequest) -> DraftResponse:
    return document_service.save_draft(document_id, payload.markdown, payload.baseFingerprint)


@router.post("/documents/{document_id}/export", response_model=ExportDocumentResponse)
def export_document(document_id: str, payload: ExportDocumentRequest) -> ExportDocumentResponse:
    document = document_service.get_document(document_id)
    markdown = payload.markdown if payload.markdown is not None else document.markdown
    return export_service.export_document(document_id, payload.format, payload.outputPath, markdown, document.name)


@router.post("/documents/{document_id}/export/content")
def export_document_content(document_id: str, payload: ExportDocumentContentRequest) -> Response:
    document = document_service.get_document(document_id)
    markdown = payload.markdown if payload.markdown is not None else document.markdown
    content = export_service.export_document_bytes(document_id, payload.format, markdown, document.name)
    filename = _export_filename(document.name, payload.format)
    return Response(
        content=content,
        media_type=_export_media_type(payload.format),
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(filename)}"},
    )


@router.delete("/documents/{document_id}/draft", status_code=204)
def discard_document_draft(document_id: str) -> Response:
    document_service.discard_draft(document_id)
    return Response(status_code=204)


@router.post("/documents/sync-status", response_model=SyncStatusResponse)
def get_documents_sync_status(payload: SyncStatusRequest) -> SyncStatusResponse:
    return document_service.get_sync_status(payload.documents)


@router.get("/drafts/orphans", response_model=list[OrphanDraft])
def list_orphan_drafts() -> list[OrphanDraft]:
    return document_service.list_orphan_drafts()


@router.post("/drafts/{draft_key}/restore", response_model=RestoreDraftResponse)
def restore_orphan_draft(draft_key: str) -> RestoreDraftResponse:
    return document_service.restore_orphan_draft(draft_key)


@router.delete("/drafts/{draft_key}", status_code=204)
def discard_orphan_draft(draft_key: str) -> Response:
    document_service.discard_orphan_draft(draft_key)
    return Response(status_code=204)


def _export_filename(document_name: str, export_format: str) -> str:
    base_name = document_name.rsplit(".", 1)[0] if document_name.lower().endswith(".md") else document_name
    suffix = f".{export_format}"
    if base_name.lower().endswith(suffix):
        return base_name
    return f"{base_name}{suffix}"


def _export_media_type(export_format: str) -> str:
    if export_format == "pdf":
        return "application/pdf"
    if export_format == "docx":
        return "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    return "text/markdown; charset=utf-8"
