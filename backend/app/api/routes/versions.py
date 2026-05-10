from fastapi import APIRouter

from app.schemas.version import CreateVersionRequest, CreateVersionResponse, VersionRecord
from app.services.version_service import version_service

router = APIRouter()


@router.get("/documents/{document_id}/versions", response_model=list[VersionRecord])
def get_document_versions(document_id: str) -> list[VersionRecord]:
    return version_service.get_document_versions(document_id)


@router.post("/projects/{project_id}/versions", response_model=CreateVersionResponse)
def create_project_version(project_id: str, payload: CreateVersionRequest) -> CreateVersionResponse:
    return version_service.create_version(project_id, payload)
