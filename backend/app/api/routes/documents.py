from fastapi import APIRouter, Response

from app.schemas.document import (
    Document,
    DraftResponse,
    OrphanDraft,
    RestoreDraftResponse,
    SaveDocumentRequest,
    SaveDraftRequest,
    SyncStatusRequest,
    SyncStatusResponse,
)
from app.services.document_service import document_service

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
