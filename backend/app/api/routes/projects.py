from fastapi import APIRouter, File, UploadFile

from app.schemas.project import (
    CreateDocumentRequest,
    CreateFolderRequest,
    FileOperationResult,
    AssetImportResponse,
    AssetMetadata,
    AssetMoveImpact,
    AssetUsageResponse,
    DocumentMoveImpact,
    InsertImageReferenceRequest,
    InsertImageReferenceResponse,
    MoveNodeRequest,
    Project,
    ProjectCapabilities,
    ProjectPayload,
    ProjectVersioningStatus,
    RenameNodeRequest,
    TreeNode,
)
from app.schemas.github import SyncResponse
from app.services.asset_service import asset_service
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


@router.post("/projects/{project_id}/assets/images", response_model=AssetImportResponse)
async def import_image_asset(project_id: str, parentId: str | None = None, file: UploadFile = File(...)) -> AssetImportResponse:
    return await asset_service.import_image(project_id, parentId, file)


@router.get("/projects/{project_id}/assets/{asset_id}", response_model=AssetMetadata)
def get_asset(project_id: str, asset_id: str) -> AssetMetadata:
    return asset_service.get_asset(project_id, asset_id)


@router.get("/projects/{project_id}/assets/{asset_id}/content")
def get_asset_content(project_id: str, asset_id: str):
    return asset_service.get_content_response(project_id, asset_id)


@router.get("/projects/{project_id}/assets/{asset_id}/usage", response_model=AssetUsageResponse)
def get_asset_usage(project_id: str, asset_id: str) -> AssetUsageResponse:
    return asset_service.usage(project_id, asset_id)


@router.get("/projects/{project_id}/assets/{asset_id}/move-impact", response_model=AssetMoveImpact)
def get_asset_move_impact(project_id: str, asset_id: str) -> AssetMoveImpact:
    return asset_service.move_impact(project_id, asset_id)


@router.get("/projects/{project_id}/documents/{document_id}/move-impact", response_model=DocumentMoveImpact)
def get_document_move_impact(project_id: str, document_id: str) -> DocumentMoveImpact:
    return asset_service.document_move_impact(project_id, document_id)


@router.post("/projects/{project_id}/documents/{document_id}/image-reference", response_model=InsertImageReferenceResponse)
def build_image_reference(project_id: str, document_id: str, payload: InsertImageReferenceRequest) -> InsertImageReferenceResponse:
    return asset_service.build_markdown_reference(project_id, document_id, payload.assetId, payload.altText)


@router.post("/projects/{project_id}/assets/reindex-images")
def reindex_images(project_id: str) -> dict:
    return asset_service.reindex_visual_assets(project_id)


@router.get("/projects/{project_id}/references/broken")
def list_broken_references(project_id: str) -> list:
    return asset_service.list_broken_references(project_id)
