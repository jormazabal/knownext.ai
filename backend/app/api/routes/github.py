from fastapi import APIRouter

from app.schemas.github import GithubRepositorySummary
from app.services.auth_service import auth_service
from app.services.github_service import github_service

router = APIRouter()


@router.get("/github/repositories", response_model=list[GithubRepositorySummary])
def list_github_repositories() -> list[GithubRepositorySummary]:
    auth_service.require_github_auth()
    return github_service.list_repositories()
