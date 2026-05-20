from fastapi import APIRouter

from app.schemas.github import SyncResponse
from app.schemas.sync import (
    ChangeSyncModeRequest,
    ConnectGithubRequest,
    EnableHistoryResponse,
    ProjectSyncStatus,
    PublishGithubRequest,
    ResolveConflictRequest,
    SyncScanRequest,
)
from app.services.sync_service import sync_service

router = APIRouter()


@router.get("/projects/{project_id}/sync/status", response_model=ProjectSyncStatus)
def get_sync_status(project_id: str) -> ProjectSyncStatus:
    return sync_service.status(project_id)


@router.post("/projects/{project_id}/sync/scan", response_model=ProjectSyncStatus)
def scan_project_sync(project_id: str, payload: SyncScanRequest) -> ProjectSyncStatus:
    return sync_service.scan(project_id, payload)


@router.post("/projects/{project_id}/sync/auto-run", response_model=ProjectSyncStatus)
def auto_run_project_sync(project_id: str, payload: SyncScanRequest) -> ProjectSyncStatus:
    return sync_service.auto_run(project_id, payload)


@router.post("/projects/{project_id}/sync/push", response_model=SyncResponse)
def push_project(project_id: str) -> SyncResponse:
    status = sync_service.push(project_id)
    return SyncResponse(status=status.state, message=status.detail or status.label)


@router.post("/projects/{project_id}/sync/pull", response_model=SyncResponse)
def pull_project(project_id: str, payload: SyncScanRequest | None = None) -> SyncResponse:
    status = sync_service.pull(project_id, payload)
    return SyncResponse(status=status.state, message=status.detail or status.label)


@router.post("/projects/{project_id}/history/enable", response_model=EnableHistoryResponse)
def enable_project_history(project_id: str) -> EnableHistoryResponse:
    return sync_service.enable_history(project_id)


@router.post("/projects/{project_id}/github/publish", response_model=ProjectSyncStatus)
def publish_project_to_github(project_id: str, payload: PublishGithubRequest) -> ProjectSyncStatus:
    return sync_service.publish_to_github(project_id, payload)


@router.post("/projects/{project_id}/github/connect", response_model=ProjectSyncStatus)
def connect_project_to_github(project_id: str, payload: ConnectGithubRequest) -> ProjectSyncStatus:
    return sync_service.connect_github(project_id, payload)


@router.post("/projects/{project_id}/github/verify-connection", response_model=ProjectSyncStatus)
def verify_project_github_connection(project_id: str) -> ProjectSyncStatus:
    return sync_service.verify_github_connection(project_id)


@router.post("/projects/{project_id}/sync-mode", response_model=ProjectSyncStatus)
def change_project_sync_mode(project_id: str, payload: ChangeSyncModeRequest) -> ProjectSyncStatus:
    return sync_service.change_sync_mode(project_id, payload)


@router.post("/projects/{project_id}/sync/conflicts/{conflict_id}/resolve", response_model=ProjectSyncStatus)
def resolve_project_sync_conflict(project_id: str, conflict_id: str, payload: ResolveConflictRequest) -> ProjectSyncStatus:
    return sync_service.resolve_conflict(project_id, conflict_id, payload)
