from fastapi import APIRouter

from app.schemas.activity import ActivityEvent, ActivityEventList, RecordActivityRequest
from app.services.activity_service import activity_service

router = APIRouter()


@router.get("/projects/{project_id}/activity", response_model=ActivityEventList)
def list_project_activity(project_id: str) -> ActivityEventList:
    return activity_service.list_project_events(project_id)


@router.post("/projects/{project_id}/activity", response_model=ActivityEvent)
def record_project_activity(project_id: str, payload: RecordActivityRequest) -> ActivityEvent:
    return activity_service.record(
        project_id,
        event_type=payload.type,
        scope=payload.scope,
        title=payload.title,
        message=payload.message,
        tone=payload.tone,
        document_path=payload.documentPath,
        repository=payload.repository,
    )
