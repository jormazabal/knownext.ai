from fastapi import APIRouter, Response

from app.schemas.ai import (
    AiConfirmDeleteRequest,
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
