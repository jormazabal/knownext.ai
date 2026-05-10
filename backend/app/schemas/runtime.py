from pydantic import BaseModel


class FolderSelectionRequest(BaseModel):
    currentPath: str | None = None


class FolderSelectionResponse(BaseModel):
    folderPath: str | None = None


class FolderOpenRequest(BaseModel):
    folderPath: str


class TraceLogRequest(BaseModel):
    level: str = "error"
    source: str
    message: str
    detail: str | None = None


class TraceLogStatus(BaseModel):
    enabled: bool
    folderPath: str
    filePath: str
