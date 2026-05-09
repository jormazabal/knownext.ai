from pydantic import BaseModel


class FolderSelectionRequest(BaseModel):
    currentPath: str | None = None


class FolderSelectionResponse(BaseModel):
    folderPath: str | None = None
