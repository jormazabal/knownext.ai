from fastapi import APIRouter

from app.schemas.project import (
    CreateDocumentRequest,
    CreateFolderRequest,
    FileOperationResult,
    MoveNodeRequest,
    Project,
    ProjectCapabilities,
    ProjectPayload,
    ProjectVersioningStatus,
    RenameNodeRequest,
    TreeNode,
)
from app.schemas.github import SyncResponse
from app.services.project_service import project_service

router = APIRouter()


@router.get("/projects", response_model=list[Project])
def list_projects() -> list[Project]:
    return project_service.list_projects()


@router.get("/projects/active", response_model=Project)
def get_active_project() -> Project:
    return project_service.get_active_project()


@router.get("/projects/capabilities", response_model=ProjectCapabilities)
def get_project_capabilities() -> ProjectCapabilities:
    return project_service.get_capabilities()


@router.post("/projects", response_model=Project, status_code=201)
def create_project(payload: ProjectPayload) -> Project:
    return project_service.create_project(payload)


@router.put("/projects/{project_id}", response_model=Project)
def update_project(project_id: str, payload: ProjectPayload) -> Project:
    return project_service.update_project(project_id, payload)


@router.delete("/projects/{project_id}", response_model=list[Project])
def delete_project(project_id: str) -> list[Project]:
    return project_service.delete_project(project_id)


@router.put("/projects/{project_id}/active", response_model=Project)
def set_active_project(project_id: str) -> Project:
    return project_service.set_active_project(project_id)


@router.get("/projects/{project_id}/tree", response_model=list[TreeNode])
def get_project_tree(project_id: str) -> list[TreeNode]:
    return project_service.get_project_tree(project_id)


@router.get("/projects/{project_id}/versioning/status", response_model=ProjectVersioningStatus)
def get_project_versioning_status(project_id: str) -> ProjectVersioningStatus:
    return project_service.get_versioning_status(project_id)


@router.post("/projects/{project_id}/sync/pull", response_model=SyncResponse)
def pull_project(project_id: str) -> SyncResponse:
    return SyncResponse(**project_service.sync_pull(project_id))


@router.post("/projects/{project_id}/sync/push", response_model=SyncResponse)
def push_project(project_id: str) -> SyncResponse:
    return SyncResponse(**project_service.sync_push(project_id))


@router.post("/projects/{project_id}/folders", response_model=FileOperationResult)
def create_folder(project_id: str, payload: CreateFolderRequest) -> FileOperationResult:
    return project_service.create_folder(project_id, payload)


@router.post("/projects/{project_id}/documents", response_model=FileOperationResult)
def create_document(project_id: str, payload: CreateDocumentRequest) -> FileOperationResult:
    return project_service.create_document(project_id, payload)


@router.patch("/projects/{project_id}/nodes/{node_id}/rename", response_model=FileOperationResult)
def rename_node(project_id: str, node_id: str, payload: RenameNodeRequest) -> FileOperationResult:
    return project_service.rename_node(project_id, node_id, payload)


@router.delete("/projects/{project_id}/nodes/{node_id}", response_model=FileOperationResult)
def delete_node(project_id: str, node_id: str) -> FileOperationResult:
    return project_service.delete_node(project_id, node_id)


@router.post("/projects/{project_id}/documents/{document_id}/duplicate", response_model=FileOperationResult)
def duplicate_document(project_id: str, document_id: str) -> FileOperationResult:
    return project_service.duplicate_document(project_id, document_id)


@router.patch("/projects/{project_id}/nodes/{node_id}/move", response_model=FileOperationResult)
def move_node(project_id: str, node_id: str, payload: MoveNodeRequest) -> FileOperationResult:
    return project_service.move_node(project_id, node_id, payload)
