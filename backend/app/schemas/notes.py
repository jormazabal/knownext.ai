from pydantic import BaseModel


class UserNotes(BaseModel):
    markdown: str
    updatedAt: str


class UserNotesUpdate(BaseModel):
    markdown: str
