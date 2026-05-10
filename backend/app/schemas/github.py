from pydantic import BaseModel, Field


class GithubRepositorySummary(BaseModel):
    owner: str
    repo: str
    fullName: str
    private: bool = False
    defaultRef: str | None = None
    permissions: list[str] = Field(default_factory=list)


class SyncResponse(BaseModel):
    status: str
    message: str
