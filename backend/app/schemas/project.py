from pydantic import BaseModel


class Project(BaseModel):
    id: str
    name: str
    folderPath: str
    icon: str
    iconColor: str
    isGitRepository: bool
    active: bool = False


class ProjectPayload(BaseModel):
    name: str
    folderPath: str
    icon: str
    iconColor: str


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


class FileOperationResult(BaseModel):
    tree: list[TreeNode]
    node: TreeNode | None = None
    affectedDocuments: list[AffectedDocument] = []
