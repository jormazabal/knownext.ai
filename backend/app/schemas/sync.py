from typing import Literal

from pydantic import BaseModel

from app.schemas.document import DocumentFingerprint


ProductProjectMode = Literal["local-files", "local-history", "github-manual", "github-auto"]
ProjectSyncState = Literal[
    "unconfigured",
    "local-only",
    "local-history",
    "synced",
    "saving",
    "syncing",
    "pending",
    "local-pending",
    "remote-available",
    "review-required",
    "conflict",
    "offline",
    "error",
    "unsupported",
]
SyncConflictType = Literal[
    "remote_changed_open_document",
    "local_and_remote_changed",
    "remote_deleted_local_modified",
    "local_deleted_remote_modified",
    "diverged_history",
    "push_rejected",
    "dirty_working_tree",
]
ConflictResolution = Literal["keep-local", "take-remote", "save-local-copy-and-take-remote", "manual-resolved"]


class OpenDocumentSyncState(BaseModel):
    documentId: str
    path: str
    isActive: bool = False
    isDirty: bool = False
    hasDraft: bool = False
    baseFingerprint: DocumentFingerprint | None = None


class SyncScanRequest(BaseModel):
    openDocuments: list[OpenDocumentSyncState] = []
    allowAutoApply: bool = False


class SyncConflict(BaseModel):
    id: str
    projectId: str
    path: str
    type: SyncConflictType
    status: Literal["open", "resolved", "dismissed"] = "open"
    localHash: str | None = None
    remoteHash: str | None = None
    message: str
    createdAt: str
    updatedAt: str


class ProjectSyncStatus(BaseModel):
    projectId: str
    mode: ProductProjectMode
    state: ProjectSyncState
    label: str
    detail: str | None = None
    pendingPush: bool = False
    pendingPull: bool = False
    hasConflicts: bool = False
    lastSyncAt: str | None = None
    lastLocalVersionHash: str | None = None
    lastRemoteHash: str | None = None
    conflicts: list[SyncConflict] = []


class EnableHistoryResponse(BaseModel):
    projectId: str
    message: str
    versionHash: str | None = None


class PublishGithubRequest(BaseModel):
    owner: str
    repo: str
    visibility: Literal["private", "public"] = "private"
    description: str | None = None
    syncMode: Literal["manual-github", "auto-github"] = "manual-github"


class ConnectGithubRequest(BaseModel):
    owner: str
    repo: str
    defaultRef: str | None = None
    rootPath: str = ""
    syncMode: Literal["manual-github", "auto-github"] = "manual-github"


class ChangeSyncModeRequest(BaseModel):
    syncMode: Literal["none", "manual-local", "auto-local", "manual-github", "auto-github"]


class ResolveConflictRequest(BaseModel):
    resolution: ConflictResolution
