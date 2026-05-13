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
