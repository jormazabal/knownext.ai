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
