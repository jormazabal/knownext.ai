from pydantic import BaseModel


class VersionRecord(BaseModel):
    id: str
    hash: str
    title: str
    author: str
    authorInitials: str
    createdAt: str | None = None
    relativeTime: str
    current: bool = False


class CreateVersionRequest(BaseModel):
    documentId: str
    title: str


class CreateVersionResponse(BaseModel):
    version: VersionRecord


class VersionContentResponse(BaseModel):
    documentId: str
    versionId: str
    markdown: str


class RestoreVersionResponse(BaseModel):
    version: VersionRecord
