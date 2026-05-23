from fastapi import APIRouter, Response

from app.schemas.document_preview import (
    DocumentPreview,
    DocumentPreviewRequest,
    DocumentPreviewTextResponse,
    SpreadsheetSheetResponse,
    SpreadsheetSheetsResponse,
)
from app.services.document_preview_service import document_preview_service

router = APIRouter()


@router.post("/projects/{project_id}/previews", response_model=DocumentPreview)
def create_document_preview(project_id: str, payload: DocumentPreviewRequest) -> DocumentPreview:
    return document_preview_service.create_preview(project_id, payload)


@router.get("/projects/{project_id}/previews/{preview_id}", response_model=DocumentPreview)
def get_document_preview(project_id: str, preview_id: str) -> DocumentPreview:
    return document_preview_service.get_preview(project_id, preview_id)


@router.get("/projects/{project_id}/previews/{preview_id}/pdf")
def get_document_preview_pdf(project_id: str, preview_id: str) -> Response:
    path = document_preview_service.pdf_path(project_id, preview_id)
    return Response(
        content=path.read_bytes(),
        media_type="application/pdf",
        headers={"Cache-Control": "no-store"},
    )


@router.get("/projects/{project_id}/previews/{preview_id}/text", response_model=DocumentPreviewTextResponse)
def get_document_preview_text(project_id: str, preview_id: str) -> DocumentPreviewTextResponse:
    return document_preview_service.get_text(project_id, preview_id)


@router.get("/projects/{project_id}/previews/{preview_id}/sheets", response_model=SpreadsheetSheetsResponse)
def get_document_preview_sheets(project_id: str, preview_id: str) -> SpreadsheetSheetsResponse:
    return document_preview_service.get_sheets(project_id, preview_id)


@router.get("/projects/{project_id}/previews/{preview_id}/sheets/{sheet_id}", response_model=SpreadsheetSheetResponse)
def get_document_preview_sheet(project_id: str, preview_id: str, sheet_id: str) -> SpreadsheetSheetResponse:
    return document_preview_service.get_sheet(project_id, preview_id, sheet_id)


@router.post("/projects/{project_id}/previews/{preview_id}/refresh", response_model=DocumentPreview)
def refresh_document_preview(project_id: str, preview_id: str) -> DocumentPreview:
    return document_preview_service.refresh_preview(project_id, preview_id)


@router.post("/projects/{project_id}/previews/{preview_id}/open-external")
def open_document_preview_external(project_id: str, preview_id: str) -> dict[str, str]:
    return document_preview_service.open_external(project_id, preview_id)
