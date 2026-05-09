from fastapi import APIRouter

from app.schemas.ai import AiPromptRequest, AiPromptResponse
from app.services.ai_service import ai_service

router = APIRouter()


@router.post("/documents/{document_id}/ai/prompt", response_model=AiPromptResponse)
def prompt_document(document_id: str, payload: AiPromptRequest) -> AiPromptResponse:
    return ai_service.prompt_document(document_id, payload)


@router.post("/projects/{project_id}/ai/prompt", response_model=AiPromptResponse)
def prompt_project(project_id: str, payload: AiPromptRequest) -> AiPromptResponse:
    return ai_service.prompt_project(project_id, payload)
