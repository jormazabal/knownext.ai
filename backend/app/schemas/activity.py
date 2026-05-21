from typing import Literal

from pydantic import BaseModel


ActivityTone = Literal["success", "warning", "danger", "info"]
ActivityScope = Literal["project", "history", "github", "security", "document"]


class ActivityEvent(BaseModel):
    id: str
    projectId: str
    type: str
    scope: ActivityScope
    title: str
    message: str
    tone: ActivityTone = "info"
    createdAt: str
    documentPath: str | None = None
    repository: str | None = None


class ActivityEventList(BaseModel):
    projectId: str
    events: list[ActivityEvent]


class RecordActivityRequest(BaseModel):
    type: str
    scope: ActivityScope = "project"
    title: str
    message: str
    tone: ActivityTone = "info"
    documentPath: str | None = None
    repository: str | None = None
