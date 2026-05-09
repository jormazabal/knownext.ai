from pydantic import BaseModel


class VersionRecord(BaseModel):
    id: str
    hash: str
    title: str
    author: str
    authorInitials: str
    relativeTime: str
    current: bool = False

