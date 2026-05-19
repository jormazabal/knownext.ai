from fastapi import APIRouter

from app.schemas.version import CreateVersionRequest, CreateVersionResponse, RestoreVersionResponse, VersionContentResponse, VersionRecord
from app.services.version_service import version_service

router = APIRouter()


@router.get("/documents/{document_id}/versions", response_model=list[VersionRecord])
def get_document_versions(document_id: str) -> list[VersionRecord]:
    return version_service.get_document_versions(document_id)


@router.post("/projects/{project_id}/versions", response_model=CreateVersionResponse)
def create_project_version(project_id: str, payload: CreateVersionRequest) -> CreateVersionResponse:
    return version_service.create_version(project_id, payload)


@router.get("/documents/{document_id}/versions/{version_id}/content", response_model=VersionContentResponse)
def get_version_content(document_id: str, version_id: str) -> VersionContentResponse:
    return version_service.get_version_content(document_id, version_id)


@router.post("/documents/{document_id}/versions/{version_id}/restore", response_model=RestoreVersionResponse)
def restore_version(document_id: str, version_id: str) -> RestoreVersionResponse:
    return version_service.restore_version(document_id, version_id)
