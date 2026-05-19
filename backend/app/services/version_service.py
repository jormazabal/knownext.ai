from pathlib import Path

from fastapi import HTTPException

from app.schemas.version import CreateVersionRequest, CreateVersionResponse, RestoreVersionResponse, VersionContentResponse, VersionRecord
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
        if project["versioningMode"] == "local-git" and document_id.startswith("fs_"):
            return git_service.document_history(Path(project["folderPath"]), relative_path)
        auth_service.require_github_auth()
        if project["versioningMode"] == "github-api" and project.get("githubRepository"):
            return github_service.document_history(GithubRepository(**project["githubRepository"]), relative_path)
        raise HTTPException(status_code=409, detail="Unsupported versioning provider")

    def create_version(self, project_id: str, payload: CreateVersionRequest) -> CreateVersionResponse:
        registry = project_service._read_registry()
        project = project_service._find_project(registry, project_id)
        if project["versioningMode"] == "none":
            raise HTTPException(status_code=409, detail="Project has no versioning enabled")
        _, relative_path = self._resolve_project_and_path(payload.documentId)
        if project["versioningMode"] == "local-git":
            version = git_service.create_version(Path(project["folderPath"]), relative_path, payload.title)
            return CreateVersionResponse(version=version)
        auth_service.require_github_auth()
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

    def get_version_content(self, document_id: str, version_id: str) -> VersionContentResponse:
        project, relative_path = self._resolve_project_and_path(document_id)
        if project["versioningMode"] != "local-git":
            raise HTTPException(status_code=409, detail="Version content preview is only available for local Git projects")
        commit_hash = self._version_hash(version_id)
        markdown = git_service.read_file_at_version(Path(project["folderPath"]), commit_hash, relative_path)
        return VersionContentResponse(documentId=document_id, versionId=version_id, markdown=markdown)

    def restore_version(self, document_id: str, version_id: str) -> RestoreVersionResponse:
        project, relative_path = self._resolve_project_and_path(document_id)
        if project["versioningMode"] != "local-git":
            raise HTTPException(status_code=409, detail="Version restore is only available for local Git projects")
        root = Path(project["folderPath"])
        commit_hash = self._version_hash(version_id)
        markdown = git_service.read_file_at_version(root, commit_hash, relative_path)
        document_path = (root / relative_path).resolve()
        try:
            document_path.relative_to(root.resolve())
        except ValueError:
            raise HTTPException(status_code=400, detail="Document path escapes project folder") from None
        document_path.parent.mkdir(parents=True, exist_ok=True)
        document_path.write_text(markdown, encoding="utf-8")
        version = git_service.create_version(root, relative_path, f"Restaura versión anterior: {document_path.name}")
        if project.get("syncMode") == "auto-github":
            from app.services.sync_service import sync_service

            sync_service.after_local_change(project["id"], [relative_path], "version_restored", f"Restaura versión anterior: {document_path.name}")
        return RestoreVersionResponse(version=version)

    def _version_hash(self, version_id: str) -> str:
        if version_id.startswith("git-"):
            return version_id.removeprefix("git-")
        if version_id.startswith("github-"):
            return version_id.removeprefix("github-")
        return version_id

    def _resolve_project_and_path(self, document_id: str) -> tuple[dict, str]:
        if document_id.startswith("fs_"):
            project_id, relative_path = decode_document_id(document_id)
            registry = project_service._read_registry()
            return project_service._find_project(registry, project_id), relative_path
        document = document_service.get_document_without_draft(document_id)
        registry = project_service._read_registry()
        return project_service._find_project(registry, document.projectId), document.path


version_service = VersionService()
