from pydantic import BaseModel, Field


class AuthUser(BaseModel):
    login: str
    name: str | None = None
    avatarUrl: str | None = None


class AuthStatus(BaseModel):
    isAuthenticated: bool
    provider: str | None = None
    user: AuthUser | None = None
    scopes: list[str] = Field(default_factory=list)
    expiresAt: str | None = None


class GithubDeviceStartResponse(BaseModel):
    deviceCode: str
    userCode: str
    verificationUri: str
    expiresIn: int
    interval: int
    mock: bool = False


class GithubDevicePollRequest(BaseModel):
    deviceCode: str


class GithubDevicePollResponse(BaseModel):
    status: str
    auth: AuthStatus
    interval: int | None = None
    error: str | None = None
