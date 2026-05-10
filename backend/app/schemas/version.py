from pydantic import BaseModel


class VersionRecord(BaseModel):
    id: str
    hash: str
    title: str
    author: str
    authorInitials: str
    relativeTime: str
    current: bool = False


class CreateVersionRequest(BaseModel):
    documentId: str
    title: str


class CreateVersionResponse(BaseModel):
    version: VersionRecord
