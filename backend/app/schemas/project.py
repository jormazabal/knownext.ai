from typing import Literal

from pydantic import BaseModel, Field


StorageMode = Literal["local-files", "local-cache"]
VersioningMode = Literal["none", "local-git", "github-api"]
SyncMode = Literal["none", "manual-github"]
GithubPublishVisibility = Literal["private", "public"]


class GithubRepository(BaseModel):
    owner: str
    repo: str
    defaultRef: str | None = None
    rootPath: str = ""
    permissions: list[str] = Field(default_factory=list)


class GithubPublishRequest(BaseModel):
    visibility: GithubPublishVisibility = "private"
    description: str | None = None


class ProjectVersioningStatus(BaseModel):
    enabled: bool
    available: bool
    reason: str | None = None
    storageMode: StorageMode
    versioningMode: VersioningMode
    syncMode: SyncMode
    statusLabel: str
    hasLocalChanges: bool = False
    hasRemoteChanges: bool = False
    lastVersionHash: str | None = None
    lastVersionRelativeTime: str | None = None


ExternalChangeType = Literal["added", "modified", "deleted", "renamed"]
ExternalChangeKind = Literal["folder", "document", "image", "attachment", "private", "ignored", "unsupported"]
ExternalChangeRisk = Literal["safe", "review", "blocked"]
ExternalChangeDecision = Literal["include", "omit", "review"]
ExternalChangeSetStatus = Literal["none", "safe", "needs-review", "blocked"]
ProjectSyncState = Literal["synced", "saving", "syncing", "pending", "review-required", "error", "unsupported"]


class ExternalChangeItem(BaseModel):
    id: str
    path: str
    name: str
    changeType: ExternalChangeType
    kind: ExternalChangeKind
    risk: ExternalChangeRisk
    decision: ExternalChangeDecision
    sizeBytes: int | None = None
    reason: str | None = None


class ExternalChangeSummary(BaseModel):
    total: int = 0
    safe: int = 0
    review: int = 0
    blocked: int = 0
    added: int = 0
    modified: int = 0
    deleted: int = 0
    folders: int = 0
    documents: int = 0
    images: int = 0
    attachments: int = 0
    omitted: int = 0
    totalBytes: int = 0


class ExternalChangeSet(BaseModel):
    id: str
    projectId: str
    title: str
    source: Literal["filesystem", "git", "github-api-cache"] = "filesystem"
    status: ExternalChangeSetStatus
    detectedAt: str
    requiresReview: bool
    summary: ExternalChangeSummary
    items: list[ExternalChangeItem]
    message: str | None = None


class ExternalChangeImportDecision(BaseModel):
    itemId: str
    decision: ExternalChangeDecision


class ExternalChangeImportRequest(BaseModel):
    decisions: list[ExternalChangeImportDecision] = []
    syncRemote: bool = True


class ExternalChangeImportResult(BaseModel):
    status: ProjectSyncState
    message: str
    tree: list["TreeNode"]
    versionTitle: str | None = None
    syncedAt: str | None = None
    pendingRemoteSync: bool = False


class ProjectCapabilities(BaseModel):
    canCreateLocalProject: bool = True
    canOpenLocalFolder: bool = True
    canUseLocalGit: bool
    canConnectGithub: bool
    canUseGithubApi: bool
    requiresGithubLoginForVersioning: bool = True


class Project(BaseModel):
    id: str
    name: str
    folderPath: str
    icon: str
    iconColor: str
    storageMode: StorageMode = "local-files"
    versioningMode: VersioningMode = "none"
    syncMode: SyncMode = "none"
    authRequired: bool = False
    githubRepository: GithubRepository | None = None
    isGitRepository: bool = False
    active: bool = False


class ProjectPayload(BaseModel):
    name: str
    folderPath: str
    icon: str
    iconColor: str
    creationMode: Literal["new-local", "open-local", "github-repository"] = "open-local"
    storageMode: StorageMode = "local-files"
    versioningMode: VersioningMode = "none"
    syncMode: SyncMode = "none"
    githubRepository: GithubRepository | None = None
    publishToGithub: GithubPublishRequest | None = None


class TreeNode(BaseModel):
    id: str
    name: str
    type: str
    path: str | None = None
    mimeType: str | None = None
    sizeBytes: int | None = None
    children: list["TreeNode"] | None = None
    open: bool = False


class CreateFolderRequest(BaseModel):
    parentId: str | None = None
    name: str


class CreateDocumentRequest(BaseModel):
    parentId: str | None = None
    name: str
    markdown: str = ""


class RenameNodeRequest(BaseModel):
    name: str


class MoveNodeRequest(BaseModel):
    targetFolderId: str | None = None


class AffectedDocument(BaseModel):
    oldId: str
    newId: str | None = None
    name: str | None = None
    path: str | None = None


class FileOperationResult(BaseModel):
    tree: list[TreeNode]
    node: TreeNode | None = None
    affectedDocuments: list[AffectedDocument] = []


class AssetMetadata(BaseModel):
    id: str
    projectId: str
    name: str
    path: str
    mimeType: str
    sizeBytes: int
    width: int | None = None
    height: int | None = None
    colorDepthBits: int | None = None
    updatedAt: str
    usageCount: int = 0
    indexed: bool = False
    indexStatus: str = "not-indexed"
    visualDescription: str | None = None


class AssetReference(BaseModel):
    id: str
    projectId: str
    documentId: str
    documentName: str
    documentPath: str
    rawTarget: str
    resolvedAssetPath: str | None = None
    kind: str = "markdown_image"
    status: str = "valid"
    altText: str | None = None
    title: str | None = None
    line: int | None = None
    column: int | None = None


class AssetUsageResponse(BaseModel):
    asset: AssetMetadata
    references: list[AssetReference]


class AssetImportResponse(BaseModel):
    tree: list[TreeNode]
    asset: AssetMetadata


class AssetMoveImpact(BaseModel):
    asset: AssetMetadata
    references: list[AssetReference]
    canUpdateReferences: bool = True
    message: str


class DocumentMoveImpact(BaseModel):
    documentId: str
    documentPath: str
    references: list[AssetReference]
    sharedAssetPaths: list[str] = []
    message: str


class InsertImageReferenceRequest(BaseModel):
    assetId: str
    altText: str | None = None


class InsertImageReferenceResponse(BaseModel):
    markdown: str
    asset: AssetMetadata
