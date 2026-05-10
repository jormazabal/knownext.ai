from fastapi import APIRouter

from app.schemas.auth import AuthStatus, GithubDevicePollRequest, GithubDevicePollResponse, GithubDeviceStartResponse
from app.services.auth_service import auth_service

router = APIRouter()


@router.get("/auth/status", response_model=AuthStatus)
def get_auth_status() -> AuthStatus:
    return auth_service.get_status()


@router.post("/auth/github/device/start", response_model=GithubDeviceStartResponse)
def start_github_device_flow() -> GithubDeviceStartResponse:
    return auth_service.start_github_device_flow()


@router.post("/auth/github/device/poll", response_model=GithubDevicePollResponse)
def poll_github_device_flow(payload: GithubDevicePollRequest) -> GithubDevicePollResponse:
    return auth_service.poll_github_device_flow(payload.deviceCode)


@router.post("/auth/logout", response_model=AuthStatus)
def logout() -> AuthStatus:
    return auth_service.logout()
