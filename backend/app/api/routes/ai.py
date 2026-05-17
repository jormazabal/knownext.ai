from fastapi import APIRouter, File, Response, UploadFile

from app.schemas.ai import (
    AiConfirmDeleteRequest,
    AiContextAddToProjectRequest,
    AiContextAddToProjectResponse,
    AiContextSearchResult,
    AiContextSource,
    AiContextSourceListResponse,
    AiContextSourcePreviewResponse,
    AiCreateProjectDocumentContextRequest,
    AiConversationResponse,
    AiIndexStatusResponse,
    AiInteractionRequest,
    AiInteractionResponse,
    AiPendingIntent,
    AiPromptRequest,
    AiPromptResponse,
    AiUsageSummaryResponse,
    OpenAiKeyStatus,
    OpenAiKeyUpdate,
)
from app.services.ai_service import ai_service
from app.services.ai_context_service import ai_context_service
from app.services.asset_service import asset_service
from app.services.ai_usage_service import ai_usage_service
from app.services.credential_service import credential_service

router = APIRouter()


@router.post("/documents/{document_id}/ai/prompt", response_model=AiPromptResponse)
def prompt_document(document_id: str, payload: AiPromptRequest) -> AiPromptResponse:
    return ai_service.prompt_document(document_id, payload)


@router.post("/projects/{project_id}/ai/prompt", response_model=AiPromptResponse)
def prompt_project(project_id: str, payload: AiPromptRequest) -> AiPromptResponse:
    return ai_service.prompt_project(project_id, payload)


@router.post("/projects/{project_id}/ai/interactions", response_model=AiInteractionResponse)
def interact(project_id: str, payload: AiInteractionRequest) -> AiInteractionResponse:
    return ai_service.interact(project_id, payload)


@router.get("/projects/{project_id}/ai/context/search", response_model=list[AiContextSearchResult])
def search_context_documents(project_id: str, q: str = "") -> list[AiContextSearchResult]:
    return ai_context_service.search_project_documents(project_id, q)


@router.get("/projects/{project_id}/ai/context/sources", response_model=AiContextSourceListResponse)
def list_context_sources(project_id: str) -> AiContextSourceListResponse:
    return ai_context_service.list_sources(project_id)


@router.post("/projects/{project_id}/ai/context/project-documents", response_model=AiContextSource)
def create_project_document_context_source(project_id: str, payload: AiCreateProjectDocumentContextRequest) -> AiContextSource:
    return ai_context_service.create_project_document_source(project_id, payload.documentId)


@router.post("/projects/{project_id}/ai/context/project-images", response_model=AiContextSource)
def create_project_image_context_source(project_id: str, payload: AiCreateProjectDocumentContextRequest) -> AiContextSource:
    return asset_service.create_project_image_context_source(project_id, payload.documentId)


@router.post("/projects/{project_id}/ai/context/project-attachments", response_model=AiContextSource)
def create_project_attachment_context_source(project_id: str, payload: AiCreateProjectDocumentContextRequest) -> AiContextSource:
    return ai_context_service.create_project_attachment_source(project_id, payload.documentId)


@router.post("/projects/{project_id}/ai/context/files", response_model=AiContextSourceListResponse)
async def upload_context_files(project_id: str, files: list[UploadFile] = File(...)) -> AiContextSourceListResponse:
    return await ai_context_service.upload_files(project_id, files)


@router.delete("/projects/{project_id}/ai/context/sources/{source_id}", response_model=AiContextSourceListResponse)
def remove_context_source(project_id: str, source_id: str) -> AiContextSourceListResponse:
    return ai_context_service.remove_source(project_id, source_id)


@router.post("/projects/{project_id}/ai/context/sources/{source_id}/extend", response_model=AiContextSource)
def extend_context_source(project_id: str, source_id: str) -> AiContextSource:
    return ai_context_service.extend_source(project_id, source_id)


@router.get("/projects/{project_id}/ai/context/sources/{source_id}/preview", response_model=AiContextSourcePreviewResponse)
def preview_context_source(project_id: str, source_id: str) -> AiContextSourcePreviewResponse:
    return ai_context_service.preview_source(project_id, source_id)


@router.post("/projects/{project_id}/ai/context/sources/{source_id}/add-to-project", response_model=AiContextAddToProjectResponse)
def add_context_source_to_project(project_id: str, source_id: str, payload: AiContextAddToProjectRequest) -> AiContextAddToProjectResponse:
    return ai_context_service.add_source_to_project(project_id, source_id, payload)


@router.get("/ai/usage/summary", response_model=AiUsageSummaryResponse)
def get_ai_usage_summary(month: str | None = None, tzOffsetMinutes: int = 0) -> AiUsageSummaryResponse:
    return ai_usage_service.get_summary(month=month, tz_offset_minutes=tzOffsetMinutes)


@router.get("/projects/{project_id}/ai/conversation", response_model=AiConversationResponse)
def get_conversation(project_id: str) -> AiConversationResponse:
    return ai_service.get_conversation(project_id)


@router.get("/projects/{project_id}/ai/pending-intent", response_model=AiPendingIntent | None)
def get_pending_intent(project_id: str) -> AiPendingIntent | None:
    return ai_service.get_pending_intent(project_id)


@router.delete("/projects/{project_id}/ai/conversation", response_model=AiConversationResponse)
def clear_conversation(project_id: str) -> AiConversationResponse:
    return ai_service.clear_conversation(project_id)


@router.post("/projects/{project_id}/ai/confirm-delete", response_model=AiInteractionResponse)
def confirm_delete(project_id: str, payload: AiConfirmDeleteRequest) -> AiInteractionResponse:
    return ai_service.confirm_delete(project_id, payload)


@router.get("/credentials/openai-key", response_model=OpenAiKeyStatus)
def get_openai_key_status() -> OpenAiKeyStatus:
    return OpenAiKeyStatus(configured=credential_service.get_openai_key() is not None, preview=credential_service.get_openai_key_preview())


@router.put("/credentials/openai-key", response_model=OpenAiKeyStatus)
def save_openai_key(payload: OpenAiKeyUpdate) -> OpenAiKeyStatus:
    credential_service.save_openai_key(payload.apiKey)
    return OpenAiKeyStatus(configured=True, preview=credential_service.get_openai_key_preview())


@router.delete("/credentials/openai-key", status_code=204)
def delete_openai_key() -> Response:
    credential_service.clear_openai_key()
    return Response(status_code=204)


@router.get("/projects/{project_id}/ai/index/status", response_model=AiIndexStatusResponse)
def get_index_status(project_id: str) -> AiIndexStatusResponse:
    return ai_service.get_index_status(project_id)


@router.post("/projects/{project_id}/ai/index/rebuild", response_model=AiIndexStatusResponse)
def rebuild_index(project_id: str) -> AiIndexStatusResponse:
    return ai_service.rebuild_index(project_id)


@router.delete("/projects/{project_id}/ai/index", response_model=AiIndexStatusResponse)
def delete_index(project_id: str) -> AiIndexStatusResponse:
    return ai_service.delete_index(project_id)
