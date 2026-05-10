from pathlib import Path

from fastapi import HTTPException

from app.schemas.version import CreateVersionRequest, CreateVersionResponse, VersionRecord
from app.schemas.project import GithubRepository
from app.services.auth_service import auth_service
from app.services.document_service import document_service
from app.services.filesystem_service import decode_document_id
from app.services.git_service import git_service
from app.services.github_service import github_service
from app.services.project_service import project_service


class VersionService:
    def get_document_versions(self, document_id: str) -> list[VersionRecord]:
        project, relative_path = self._resolve_project_and_path(document_id)
        if project["versioningMode"] == "none":
            raise HTTPException(status_code=409, detail="Project has no versioning enabled")
        auth_service.require_github_auth()
        if project["versioningMode"] == "local-git" and document_id.startswith("fs_"):
            return git_service.document_history(Path(project["folderPath"]), relative_path)
        if project["versioningMode"] == "github-api" and project.get("githubRepository"):
            return github_service.document_history(GithubRepository(**project["githubRepository"]), relative_path)
        raise HTTPException(status_code=409, detail="Unsupported versioning provider")

    def create_version(self, project_id: str, payload: CreateVersionRequest) -> CreateVersionResponse:
        registry = project_service._read_registry()
        project = project_service._find_project(registry, project_id)
        if project["versioningMode"] == "none":
            raise HTTPException(status_code=409, detail="Project has no versioning enabled")
        auth_service.require_github_auth()
        _, relative_path = self._resolve_project_and_path(payload.documentId)
        if project["versioningMode"] == "local-git":
            version = git_service.create_version(Path(project["folderPath"]), relative_path, payload.title)
            return CreateVersionResponse(version=version)
        if project["versioningMode"] == "github-api" and project.get("githubRepository"):
            document = document_service.get_document(payload.documentId)
            version = github_service.create_or_update_document(
                GithubRepository(**project["githubRepository"]),
                relative_path,
                document.markdown,
                payload.title,
                Path(project["folderPath"]),
            )
            return CreateVersionResponse(version=version)
        raise HTTPException(status_code=409, detail="Unsupported versioning provider")

    def _resolve_project_and_path(self, document_id: str) -> tuple[dict, str]:
        if document_id.startswith("fs_"):
            project_id, relative_path = decode_document_id(document_id)
            registry = project_service._read_registry()
            return project_service._find_project(registry, project_id), relative_path
        document = document_service.get_document_without_draft(document_id)
        registry = project_service._read_registry()
        return project_service._find_project(registry, document.projectId), document.path


version_service = VersionService()
