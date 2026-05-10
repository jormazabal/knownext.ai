from __future__ import annotations

import base64
import hashlib
import json
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

from fastapi import HTTPException

from app.schemas.github import GithubRepositorySummary
from app.schemas.project import GithubRepository
from app.schemas.version import VersionRecord
from app.services.credential_service import credential_service
from app.services.filesystem_service import get_document_id
from app.services.git_service import git_service

GITHUB_API_URL = "https://api.github.com"


class GithubService:
    def list_repositories(self) -> list[GithubRepositorySummary]:
        data = self._request_json("/user/repos?sort=updated&per_page=50")
        return [
            GithubRepositorySummary(
                owner=item["owner"]["login"],
                repo=item["name"],
                fullName=item["full_name"],
                private=item.get("private", False),
                defaultRef=item.get("default_branch"),
                permissions=[permission for permission, allowed in item.get("permissions", {}).items() if allowed],
            )
            for item in data
        ]

    def hydrate_repository_cache(self, project_id: str, root: Path, repository: GithubRepository) -> None:
        root.mkdir(parents=True, exist_ok=True)
        metadata = self._read_cache_metadata(root)
        metadata.update({
            "schemaVersion": 1,
            "repository": f"{repository.owner}/{repository.repo}",
            "rootPath": repository.rootPath,
        })
        metadata.setdefault("files", {})
        self._write_markdown_tree(project_id, root, repository, repository.rootPath.strip("/"), metadata)
        self._write_cache_metadata(root, metadata)

    def document_history(self, repository: GithubRepository, relative_path: str) -> list[VersionRecord]:
        path = self._repo_path(repository, relative_path)
        encoded_path = urllib.parse.quote(path)
        data = self._request_json(f"/repos/{repository.owner}/{repository.repo}/commits?path={encoded_path}&per_page=50")
        versions: list[VersionRecord] = []
        for index, item in enumerate(data):
            commit = item.get("commit", {})
            author = commit.get("author", {}) or {}
            name = author.get("name") or item.get("author", {}).get("login") or "GitHub"
            sha = item.get("sha", "")
            date_value = author.get("date") or ""
            versions.append(
                VersionRecord(
                    id=f"github-{sha}",
                    hash=sha[:7],
                    title=commit.get("message", "Versión GitHub").splitlines()[0],
                    author=name,
                    authorInitials=git_service._initials(name),
                    relativeTime=git_service._relative_time(date_value) if date_value else "",
                    current=index == 0,
                )
            )
        return versions

    def create_or_update_document(
        self,
        repository: GithubRepository,
        relative_path: str,
        markdown: str,
        message: str,
        cache_root: Path | None = None,
    ) -> VersionRecord:
        path = self._repo_path(repository, relative_path)
        current_sha = None
        try:
            current = self._request_json(f"/repos/{repository.owner}/{repository.repo}/contents/{urllib.parse.quote(path)}")
            if isinstance(current, dict):
                current_sha = current.get("sha")
        except HTTPException as error:
            if error.status_code != 404:
                raise
        expected_sha = self._cached_remote_sha(cache_root, relative_path) if cache_root else None
        if expected_sha and current_sha and current_sha != expected_sha:
            raise HTTPException(
                status_code=409,
                detail={
                    "code": "github_remote_changed",
                    "message": "GitHub cambió este documento desde la última lectura. Trae cambios antes de crear una versión.",
                },
            )

        body = {
            "message": message.strip() or "Actualiza documento",
            "content": base64.b64encode(markdown.encode("utf-8")).decode("ascii"),
        }
        if current_sha:
            body["sha"] = current_sha
        if repository.defaultRef:
            body["branch"] = repository.defaultRef
        result = self._request_json(
            f"/repos/{repository.owner}/{repository.repo}/contents/{urllib.parse.quote(path)}",
            method="PUT",
            body=body,
        )
        if cache_root:
            self._update_cache_metadata(
                cache_root,
                relative_path,
                path,
                result.get("content", {}).get("sha") or current_sha,
                markdown,
                repository,
            )
        commit = result.get("commit", {})
        sha = commit.get("sha", "")
        author = commit.get("author", {}).get("name") or "GitHub"
        return VersionRecord(
            id=f"github-{sha}",
            hash=sha[:7],
            title=body["message"],
            author=author,
            authorInitials=git_service._initials(author),
            relativeTime="ahora",
            current=True,
        )

    def _write_markdown_tree(self, project_id: str, root: Path, repository: GithubRepository, path: str, metadata: dict) -> None:
        query_path = f"/{path}" if path else ""
        data = self._request_json(f"/repos/{repository.owner}/{repository.repo}/contents{query_path}")
        if isinstance(data, dict):
            data = [data]
        for item in data:
            item_path = item.get("path", "")
            item_type = item.get("type")
            if item_type == "dir":
                self._write_markdown_tree(project_id, root, repository, item_path, metadata)
                continue
            if item_type != "file" or not item_path.lower().endswith(".md"):
                continue
            content = self._request_json(f"/repos/{repository.owner}/{repository.repo}/contents/{urllib.parse.quote(item_path)}")
            encoded = content.get("content", "")
            markdown = base64.b64decode(encoded).decode("utf-8") if encoded else ""
            relative_path = item_path.removeprefix(repository.rootPath.strip("/") + "/") if repository.rootPath else item_path
            target = root / relative_path
            cached = metadata.get("files", {}).get(relative_path, {})
            if target.exists() and cached.get("localSha256") and _file_sha256(target) != cached["localSha256"]:
                raise HTTPException(
                    status_code=409,
                    detail={
                        "code": "github_cache_has_local_changes",
                        "message": "Hay cambios locales sin versionar. Crea una versión o descártalos antes de traer cambios.",
                    },
                )
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(markdown, encoding="utf-8")
            get_document_id(project_id, relative_path)
            metadata.setdefault("files", {})[relative_path] = {
                "githubPath": item_path,
                "sha": content.get("sha") or item.get("sha"),
                "localSha256": _text_sha256(markdown),
            }

    def _repo_path(self, repository: GithubRepository, relative_path: str) -> str:
        root = repository.rootPath.strip("/")
        child = relative_path.strip("/")
        return f"{root}/{child}" if root else child

    def _cached_remote_sha(self, root: Path | None, relative_path: str) -> str | None:
        if root is None:
            return None
        metadata = self._read_cache_metadata(root)
        cached = metadata.get("files", {}).get(relative_path)
        if not isinstance(cached, dict):
            return None
        sha = cached.get("sha")
        return sha if isinstance(sha, str) and sha else None

    def _update_cache_metadata(
        self,
        root: Path,
        relative_path: str,
        github_path: str,
        remote_sha: str | None,
        markdown: str,
        repository: GithubRepository,
    ) -> None:
        metadata = self._read_cache_metadata(root)
        metadata.update({
            "schemaVersion": 1,
            "repository": f"{repository.owner}/{repository.repo}",
            "rootPath": repository.rootPath,
        })
        metadata.setdefault("files", {})[relative_path] = {
            "githubPath": github_path,
            "sha": remote_sha,
            "localSha256": _text_sha256(markdown),
        }
        self._write_cache_metadata(root, metadata)

    def _read_cache_metadata(self, root: Path) -> dict:
        metadata_path = root / ".knownext-github-cache.json"
        if not metadata_path.exists():
            return {"schemaVersion": 1, "files": {}}
        try:
            data = json.loads(metadata_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            return {"schemaVersion": 1, "files": {}}
        if not isinstance(data, dict):
            return {"schemaVersion": 1, "files": {}}
        if not isinstance(data.get("files"), dict):
            data["files"] = {}
        return data

    def _write_cache_metadata(self, root: Path, metadata: dict) -> None:
        (root / ".knownext-github-cache.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")

    def _request_json(self, path: str, method: str = "GET", body: dict | None = None):
        token = credential_service.get_github_token()
        if not token:
            raise HTTPException(status_code=403, detail="GitHub login is required")
        data = json.dumps(body).encode("utf-8") if body is not None else None
        request = urllib.request.Request(
            f"{GITHUB_API_URL}{path}",
            data=data,
            method=method,
            headers={
                "Accept": "application/vnd.github+json",
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
                "X-GitHub-Api-Version": "2022-11-28",
            },
        )
        try:
            with urllib.request.urlopen(request, timeout=20) as response:
                return json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as error:
            detail = error.read().decode("utf-8") or error.reason
            raise HTTPException(status_code=error.code, detail=detail) from error
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as error:
            raise HTTPException(status_code=502, detail=f"GitHub request failed: {error}") from error


github_service = GithubService()


def _text_sha256(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()
