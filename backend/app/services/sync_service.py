from __future__ import annotations

import hashlib
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import HTTPException

from app.schemas.project import GithubRepository, Project
from app.schemas.sync import (
    ChangeSyncModeRequest,
    ConnectGithubRequest,
    EnableHistoryResponse,
    OpenDocumentSyncState,
    ProductProjectMode,
    ProjectSyncStatus,
    PublishGithubRequest,
    ResolveConflictRequest,
    SyncConflict,
    SyncScanRequest,
)
from app.services.auth_service import auth_service
from app.services.git_service import git_service
from app.services.github_service import github_service
from app.services.credential_service import credential_service
from app.services.sync_state_service import sync_state_service


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class SyncService:
    def __init__(self) -> None:
        self._locks: dict[str, threading.RLock] = {}
        self._locks_guard = threading.Lock()

    def status(self, project_id: str) -> ProjectSyncStatus:
        project = self._project(project_id)
        return self._status_from_state(project, sync_state_service.get_project_state(project_id))

    def scan(self, project_id: str, payload: SyncScanRequest | None = None) -> ProjectSyncStatus:
        project = self._project(project_id)
        payload = payload or SyncScanRequest()
        with self._lock_for(project_id):
            status = self._scan_locked(project, payload)
        return status

    def push(self, project_id: str) -> ProjectSyncStatus:
        project = self._versioned_project(project_id)
        with self._lock_for(project_id):
            if project["versioningMode"] == "github-api":
                state = sync_state_service.update_project_state(
                    project_id,
                    {
                        "state": "synced",
                        "pendingPush": False,
                        "lastSyncAt": _now_iso(),
                        "lastError": None,
                    },
                )
                return self._status_from_state(project, state)

            root = Path(project["folderPath"])
            if not git_service.has_remote_origin(root):
                state = sync_state_service.update_project_state(
                    project_id,
                    {"state": "local-pending", "pendingPush": True, "lastError": "No hay remoto GitHub configurado."},
                )
                return self._status_from_state(project, state)
            try:
                git_service.push(root, self._github_token())
                state = self._record_git_heads(project, "synced", pending_push=False, pending_pull=False)
                state["lastSuccessfulPushAt"] = _now_iso()
                state["lastSyncAt"] = state["lastSuccessfulPushAt"]
                state["lastError"] = None
                sync_state_service.update_project_state(project_id, state)
                return self.status(project_id)
            except HTTPException as error:
                conflict = self._conflict(project_id, "", "push_rejected", "GitHub rechazó la subida. Trae cambios antes de volver a subir.")
                state = sync_state_service.update_project_state(
                    project_id,
                    {
                        "state": "review-required",
                        "pendingPush": True,
                        "conflicts": [conflict.model_dump()],
                        "lastError": str(error.detail),
                    },
                )
                return self._status_from_state(project, state)

    def pull(self, project_id: str, payload: SyncScanRequest | None = None) -> ProjectSyncStatus:
        project = self._versioned_project(project_id)
        payload = payload or SyncScanRequest()
        with self._lock_for(project_id):
            if project["versioningMode"] == "github-api" and project.get("githubRepository"):
                github_service.hydrate_repository_cache(project_id, Path(project["folderPath"]), GithubRepository(**project["githubRepository"]))
                state = sync_state_service.update_project_state(
                    project_id,
                    {
                        "state": "synced",
                        "pendingPull": False,
                        "lastSuccessfulPullAt": _now_iso(),
                        "lastSyncAt": _now_iso(),
                        "lastError": None,
                    },
                )
                return self._status_from_state(project, state)

            root = Path(project["folderPath"])
            self._ensure_remote(root)
            git_service.fetch(root, self._github_token())
            remote_ref = git_service.remote_ref(root, self._project_branch(project))
            if not remote_ref:
                raise HTTPException(status_code=409, detail="Remote ref is not available")
            remote_paths = self._remote_changed_paths(root, remote_ref)
            blocked_paths = self._protected_paths(remote_paths, payload.openDocuments)
            if blocked_paths:
                state = self._mark_remote_review(project, remote_ref, blocked_paths)
                return self._status_from_state(project, state)
            git_service.pull(root, self._github_token())
            state = self._record_git_heads(project, "synced", pending_push=False, pending_pull=False)
            state["lastSuccessfulPullAt"] = _now_iso()
            state["lastSyncAt"] = state["lastSuccessfulPullAt"]
            state["lastError"] = None
            sync_state_service.update_project_state(project_id, state)
            return self.status(project_id)

    def auto_run(self, project_id: str, payload: SyncScanRequest | None = None) -> ProjectSyncStatus:
        payload = payload or SyncScanRequest(allowAutoApply=True)
        payload.allowAutoApply = True
        return self.scan(project_id, payload)

    def after_local_change(self, project_id: str, paths: list[str], operation: str, title: str) -> None:
        project = self._project(project_id)
        if project["versioningMode"] == "none":
            sync_state_service.update_project_state(project_id, {"state": "local-only", "pendingPush": False, "lastError": None})
            return
        if project["versioningMode"] != "local-git":
            state = "local-pending" if project["syncMode"] == "auto-github" else "synced"
            sync_state_service.update_project_state(project_id, {"state": state, "pendingPush": project["syncMode"] != "none"})
            return

        normalized_paths = [path.replace("\\", "/").strip("/") for path in paths if path.strip()]
        if not normalized_paths:
            return

        with self._lock_for(project_id):
            root = Path(project["folderPath"])
            if project["syncMode"] in {"auto-local", "auto-github"}:
                try:
                    git_service.create_project_version(root, normalized_paths, title)
                except HTTPException as error:
                    if error.status_code != 409:
                        raise
                if project["syncMode"] == "auto-local":
                    sync_state_service.update_project_state(
                        project_id,
                        {"state": "local-history", "pendingPush": False, "lastLocalHead": git_service.rev_parse(root, "HEAD", short=True), "lastError": None},
                    )
                elif project.get("githubRepository") and git_service.has_remote_origin(root):
                    self._try_auto_push(project)
                else:
                    sync_state_service.update_project_state(
                        project_id,
                        {"state": "local-pending", "pendingPush": True, "lastError": "No hay remoto GitHub configurado."},
                    )
                return

            state = "local-history" if project["syncMode"] in {"none", "manual-local"} else "local-pending"
            sync_state_service.update_project_state(
                project_id,
                {
                    "state": state,
                    "pendingPush": project["syncMode"] in {"manual-github", "auto-github"},
                    "lastLocalHead": git_service.rev_parse(root, "HEAD", short=True),
                    "lastError": None,
                },
            )

    def enable_history(self, project_id: str) -> EnableHistoryResponse:
        from app.services.project_service import project_service

        registry = project_service._read_registry()
        project = project_service._find_project(registry, project_id)
        root = Path(project["folderPath"])
        with self._lock_for(project_id):
            git_service.ensure_repository(root)
            tracked_paths = self._all_project_paths(root)
            version_hash = None
            if tracked_paths:
                try:
                    version_hash = git_service.create_project_version(root, tracked_paths, "Versión inicial del proyecto")
                except HTTPException as error:
                    if error.status_code != 409:
                        raise
            project["versioningMode"] = "local-git"
            project["syncMode"] = project.get("syncMode") if project.get("syncMode") in {"manual-local", "auto-local"} else "manual-local"
            project["authRequired"] = False
            project["isGitRepository"] = True
            project_service.store.write(registry)
            sync_state_service.update_project_state(
                project_id,
                {"state": "local-history", "pendingPush": False, "lastLocalHead": git_service.rev_parse(root, "HEAD", short=True), "lastError": None},
            )
        return EnableHistoryResponse(projectId=project_id, message="Historial local activado.", versionHash=version_hash)

    def publish_to_github(self, project_id: str, payload: PublishGithubRequest) -> ProjectSyncStatus:
        from app.services.project_service import project_service

        auth_service.require_github_auth()
        registry = project_service._read_registry()
        project = project_service._find_project(registry, project_id)
        root = Path(project["folderPath"])
        with self._lock_for(project_id):
            git_service.ensure_repository(root)
            paths = self._all_project_paths(root)
            if paths:
                try:
                    git_service.create_project_version(root, paths, "Versión inicial del proyecto")
                except HTTPException as error:
                    if error.status_code != 409:
                        raise
            repository = github_service.create_repository(
                GithubRepository(owner=payload.owner, repo=payload.repo, defaultRef="main", rootPath="", permissions=["pull", "push"]),
                payload.visibility,
                payload.description,
            )
            git_service.set_remote_origin(root, f"https://github.com/{repository.owner}/{repository.repo}.git")
            project.update(
                {
                    "versioningMode": "local-git",
                    "syncMode": payload.syncMode,
                    "authRequired": True,
                    "githubRepository": repository.model_dump(),
                    "isGitRepository": True,
                }
            )
            project_service.store.write(registry)
            return self.push(project_id)

    def connect_github(self, project_id: str, payload: ConnectGithubRequest) -> ProjectSyncStatus:
        from app.services.project_service import project_service

        auth_service.require_github_auth()
        registry = project_service._read_registry()
        project = project_service._find_project(registry, project_id)
        root = Path(project["folderPath"])
        with self._lock_for(project_id):
            git_service.ensure_repository(root)
            repository = GithubRepository(
                owner=payload.owner,
                repo=payload.repo,
                defaultRef=payload.defaultRef or "main",
                rootPath=payload.rootPath,
                permissions=["pull", "push"],
            )
            git_service.set_remote_origin(root, f"https://github.com/{repository.owner}/{repository.repo}.git")
            project.update(
                {
                    "versioningMode": "local-git",
                    "syncMode": payload.syncMode,
                    "authRequired": True,
                    "githubRepository": repository.model_dump(),
                    "isGitRepository": True,
                }
            )
            project_service.store.write(registry)
            return self.scan(project_id, SyncScanRequest())

    def verify_github_connection(self, project_id: str) -> ProjectSyncStatus:
        project = self._project(project_id)
        with self._lock_for(project_id):
            try:
                if project["syncMode"] not in {"manual-github", "auto-github"} or not project.get("githubRepository"):
                    raise HTTPException(status_code=409, detail="Este proyecto no tiene repositorio GitHub configurado.")
                auth_service.require_github_auth()

                repository = GithubRepository(**project["githubRepository"])
                if project["versioningMode"] == "github-api":
                    github_service.verify_repository_access(repository)
                    state = sync_state_service.update_project_state(
                        project_id,
                        {
                            "state": "synced",
                            "pendingPush": False,
                            "pendingPull": False,
                            "lastScanAt": _now_iso(),
                            "lastError": None,
                        },
                    )
                    return self._status_from_state(project, state).model_copy(
                        update={"detail": f"Conexión verificada con {repository.owner}/{repository.repo}."}
                    )

                root = Path(project["folderPath"])
                self._ensure_remote(root)
                status = self.scan(project_id, SyncScanRequest())
                if status.state in {"error", "offline"}:
                    return status
                return status.model_copy(update={"detail": f"Conexión verificada con {repository.owner}/{repository.repo}."})
            except HTTPException as error:
                state = sync_state_service.update_project_state(
                    project_id,
                    {
                        "state": "offline" if error.status_code >= 500 else "error",
                        "lastScanAt": _now_iso(),
                        "lastError": str(error.detail),
                    },
                )
                return self._status_from_state(project, state)

    def change_sync_mode(self, project_id: str, payload: ChangeSyncModeRequest) -> ProjectSyncStatus:
        from app.services.project_service import project_service

        registry = project_service._read_registry()
        project = project_service._find_project(registry, project_id)
        if payload.syncMode in {"manual-github", "auto-github"}:
            auth_service.require_github_auth()
            if not project.get("githubRepository"):
                raise HTTPException(status_code=409, detail="GitHub repository is required for GitHub sync")
        if project["versioningMode"] == "none" and payload.syncMode != "none":
            raise HTTPException(status_code=409, detail="Enable local history before GitHub sync")
        project["syncMode"] = payload.syncMode
        project["authRequired"] = payload.syncMode in {"manual-github", "auto-github"}
        project_service.store.write(registry)
        return self.scan(project_id, SyncScanRequest(allowAutoApply=payload.syncMode in {"auto-local", "auto-github"}))

    def resolve_conflict(self, project_id: str, conflict_id: str, payload: ResolveConflictRequest) -> ProjectSyncStatus:
        state = sync_state_service.get_project_state(project_id)
        conflicts = []
        for conflict in state.get("conflicts", []):
            if conflict.get("id") == conflict_id:
                conflicts.append({**conflict, "status": "resolved", "updatedAt": _now_iso(), "resolution": payload.resolution})
            else:
                conflicts.append(conflict)
        open_conflicts = [conflict for conflict in conflicts if conflict.get("status") == "open"]
        state = sync_state_service.update_project_state(
            project_id,
            {"conflicts": conflicts, "state": "conflict" if open_conflicts else "local-pending" if state.get("pendingPush") else "synced"},
        )
        return self._status_from_state(self._project(project_id), state)

    def _scan_locked(self, project: dict, payload: SyncScanRequest) -> ProjectSyncStatus:
        project_id = project["id"]
        if project["versioningMode"] == "none":
            state = sync_state_service.update_project_state(project_id, {"state": "local-only", "lastScanAt": _now_iso(), "pendingPush": False, "pendingPull": False})
            return self._status_from_state(project, state)
        if project["syncMode"] in {"none", "manual-local", "auto-local"}:
            state = sync_state_service.update_project_state(project_id, {"state": "local-history", "lastScanAt": _now_iso(), "pendingPush": False, "pendingPull": False})
            return self._status_from_state(project, state)
        auth_service.require_github_auth()

        if project["versioningMode"] == "github-api":
            state = sync_state_service.update_project_state(project_id, {"state": "synced", "lastScanAt": _now_iso(), "lastError": None})
            return self._status_from_state(project, state)

        root = Path(project["folderPath"])
        if not git_service.has_remote_origin(root):
            state = sync_state_service.update_project_state(project_id, {"state": "local-pending", "pendingPush": True, "lastScanAt": _now_iso(), "lastError": "No hay remoto GitHub configurado."})
            return self._status_from_state(project, state)

        try:
            git_service.fetch(root, self._github_token())
            head = git_service.rev_parse(root, "HEAD")
            remote_ref = git_service.remote_ref(root, self._project_branch(project))
            remote = git_service.rev_parse(root, remote_ref) if remote_ref else None
            if not head or not remote:
                state = sync_state_service.update_project_state(project_id, {"state": "local-pending", "pendingPush": True, "pendingPull": False, "lastScanAt": _now_iso(), "lastLocalHead": head[:7] if head else None, "lastRemoteHead": None, "lastError": None})
                return self._status_from_state(project, state)
            if head == remote:
                state = sync_state_service.update_project_state(project_id, {"state": "synced", "pendingPush": False, "pendingPull": False, "lastScanAt": _now_iso(), "lastLocalHead": head[:7], "lastRemoteHead": remote[:7], "lastError": None})
                return self._status_from_state(project, state)
            if git_service.is_ancestor(root, remote, head):
                if project["syncMode"] == "auto-github" and payload.allowAutoApply:
                    return self._try_auto_push(project)
                state = sync_state_service.update_project_state(project_id, {"state": "local-pending", "pendingPush": True, "pendingPull": False, "lastScanAt": _now_iso(), "lastLocalHead": head[:7], "lastRemoteHead": remote[:7], "lastError": None})
                return self._status_from_state(project, state)
            if git_service.is_ancestor(root, head, remote):
                remote_paths = git_service.changed_paths_between(root, head, remote)
                blocked_paths = self._protected_paths(remote_paths, payload.openDocuments)
                if blocked_paths:
                    state = self._mark_remote_review(project, remote_ref or "origin/main", blocked_paths)
                    return self._status_from_state(project, state)
                if project["syncMode"] == "auto-github" and payload.allowAutoApply and not git_service.working_tree_dirty(root):
                    git_service.pull(root, self._github_token())
                    state = self._record_git_heads(project, "synced", pending_push=False, pending_pull=False)
                    state["lastSuccessfulPullAt"] = _now_iso()
                    state["lastSyncAt"] = state["lastSuccessfulPullAt"]
                    sync_state_service.update_project_state(project_id, state)
                    return self.status(project_id)
                state = sync_state_service.update_project_state(project_id, {"state": "remote-available", "pendingPull": True, "pendingPush": False, "lastScanAt": _now_iso(), "lastLocalHead": head[:7], "lastRemoteHead": remote[:7], "lastError": None})
                return self._status_from_state(project, state)

            conflict = self._conflict(project_id, "", "diverged_history", "El historial local y GitHub avanzaron por separado. Revisa antes de sincronizar.")
            state = sync_state_service.update_project_state(project_id, {"state": "conflict", "pendingPush": True, "pendingPull": True, "conflicts": [conflict.model_dump()], "lastScanAt": _now_iso(), "lastLocalHead": head[:7], "lastRemoteHead": remote[:7]})
            return self._status_from_state(project, state)
        except HTTPException as error:
            state = sync_state_service.update_project_state(project_id, {"state": "offline" if error.status_code >= 500 else "error", "lastScanAt": _now_iso(), "lastError": str(error.detail)})
            return self._status_from_state(project, state)

    def _try_auto_push(self, project: dict) -> ProjectSyncStatus:
        root = Path(project["folderPath"])
        project_id = project["id"]
        try:
            git_service.fetch(root, self._github_token())
            remote_ref = git_service.remote_ref(root, self._project_branch(project))
            head = git_service.rev_parse(root, "HEAD")
            remote = git_service.rev_parse(root, remote_ref) if remote_ref else None
            if remote and head and not git_service.is_ancestor(root, remote, head):
                conflict = self._conflict(project_id, "", "push_rejected", "GitHub tiene cambios nuevos. Trae cambios antes de subir.")
                state = sync_state_service.update_project_state(project_id, {"state": "review-required", "pendingPush": True, "pendingPull": True, "conflicts": [conflict.model_dump()]})
                return self._status_from_state(project, state)
            git_service.push(root, self._github_token())
            state = self._record_git_heads(project, "synced", pending_push=False, pending_pull=False)
            now = _now_iso()
            state.update({"lastSyncAt": now, "lastSuccessfulPushAt": now, "lastError": None})
            sync_state_service.update_project_state(project_id, state)
            return self.status(project_id)
        except HTTPException as error:
            state = sync_state_service.update_project_state(project_id, {"state": "local-pending", "pendingPush": True, "lastError": str(error.detail)})
            return self._status_from_state(project, state)

    def _record_git_heads(self, project: dict, state_name: str, pending_push: bool, pending_pull: bool) -> dict[str, Any]:
        root = Path(project["folderPath"])
        branch = self._project_branch(project)
        remote_ref = git_service.remote_ref(root, branch)
        return {
            "state": state_name,
            "pendingPush": pending_push,
            "pendingPull": pending_pull,
            "lastScanAt": _now_iso(),
            "lastLocalHead": git_service.rev_parse(root, "HEAD", short=True),
            "lastRemoteHead": git_service.rev_parse(root, remote_ref, short=True) if remote_ref else None,
            "conflicts": [],
        }

    def _mark_remote_review(self, project: dict, remote_ref: str, paths: list[str]) -> dict[str, Any]:
        conflicts = [
            self._conflict(project["id"], path, "remote_changed_open_document", "GitHub cambió un documento abierto o con borrador. Revisa antes de actualizar.").model_dump()
            for path in paths
        ]
        return sync_state_service.update_project_state(
            project["id"],
            {"state": "review-required", "pendingPull": True, "conflicts": conflicts, "lastRemoteHead": git_service.rev_parse(Path(project["folderPath"]), remote_ref, short=True), "lastScanAt": _now_iso()},
        )

    def _remote_changed_paths(self, root: Path, remote_ref: str) -> list[str]:
        head = git_service.rev_parse(root, "HEAD")
        remote = git_service.rev_parse(root, remote_ref)
        if not head or not remote:
            return []
        return git_service.changed_paths_between(root, head, remote)

    def _protected_paths(self, changed_paths: list[str], open_documents: list[OpenDocumentSyncState]) -> list[str]:
        protected = {doc.path.replace("\\", "/").strip("/") for doc in open_documents if doc.isActive or doc.isDirty or doc.hasDraft}
        return [path for path in changed_paths if path.replace("\\", "/").strip("/") in protected]

    def _status_from_state(self, project: dict, state: dict[str, Any]) -> ProjectSyncStatus:
        conflicts = [SyncConflict(**conflict) for conflict in state.get("conflicts", []) if isinstance(conflict, dict)]
        state_name = state.get("state") or self._default_state_for_project(project)
        return ProjectSyncStatus(
            projectId=project["id"],
            mode=self._mode(project),
            state=state_name,
            label=self._label(state_name),
            detail=state.get("lastError"),
            pendingPush=bool(state.get("pendingPush")),
            pendingPull=bool(state.get("pendingPull")),
            hasConflicts=any(conflict.status == "open" for conflict in conflicts),
            lastSyncAt=state.get("lastSyncAt"),
            lastLocalVersionHash=state.get("lastLocalHead"),
            lastRemoteHash=state.get("lastRemoteHead"),
            conflicts=conflicts,
        )

    def _mode(self, project: dict) -> ProductProjectMode:
        if project["versioningMode"] == "none":
            return "local-files"
        if project["syncMode"] == "auto-github":
            return "github-auto"
        if project["syncMode"] == "manual-github":
            return "github-manual"
        return "local-history"

    def _label(self, state: str) -> str:
        labels = {
            "local-only": "Solo local",
            "local-history": "Historial local",
            "synced": "Sincronizado",
            "saving": "Guardando versión",
            "syncing": "Sincronizando",
            "pending": "Pendiente",
            "local-pending": "Pendiente de subir",
            "remote-available": "Cambios remotos disponibles",
            "review-required": "Revisión necesaria",
            "conflict": "Conflicto",
            "offline": "Sin conexión",
            "error": "Error de sincronización",
            "unsupported": "No disponible",
        }
        return labels.get(state, "Sin configurar")

    def _default_state_for_project(self, project: dict) -> str:
        if project["versioningMode"] == "none":
            return "local-only"
        if project["syncMode"] in {"none", "manual-local", "auto-local"}:
            return "local-history"
        return "synced"

    def _conflict(self, project_id: str, path: str, conflict_type: str, message: str) -> SyncConflict:
        now = _now_iso()
        digest = hashlib.sha1(f"{project_id}:{path}:{conflict_type}:{now}".encode("utf-8")).hexdigest()[:16]
        return SyncConflict(id=f"sync-conflict-{digest}", projectId=project_id, path=path, type=conflict_type, message=message, createdAt=now, updatedAt=now)

    def _all_project_paths(self, root: Path) -> list[str]:
        excluded = {".git", ".knownext-github-cache.json"}
        paths: list[str] = []
        for path in root.rglob("*"):
            if not path.is_file():
                continue
            relative = path.relative_to(root)
            if any(part in excluded or part.startswith(".git") for part in relative.parts):
                continue
            paths.append(relative.as_posix())
        return paths

    def _ensure_remote(self, root: Path) -> None:
        if not git_service.has_remote_origin(root):
            raise HTTPException(status_code=409, detail="Project has no GitHub remote configured")

    def _github_token(self) -> str | None:
        return credential_service.get_github_token()

    def _project_branch(self, project: dict) -> str | None:
        repository = project.get("githubRepository")
        if isinstance(repository, dict):
            return repository.get("defaultRef")
        return None

    def _project(self, project_id: str) -> dict:
        from app.services.project_service import project_service

        registry = project_service._read_registry()
        return project_service._find_project(registry, project_id)

    def _versioned_project(self, project_id: str) -> dict:
        project = self._project(project_id)
        if project["versioningMode"] == "none":
            raise HTTPException(status_code=409, detail="Project has no versioning enabled")
        if project["syncMode"] in {"manual-github", "auto-github"}:
            auth_service.require_github_auth()
        return project

    def _lock_for(self, project_id: str) -> threading.RLock:
        with self._locks_guard:
            lock = self._locks.get(project_id)
            if lock is None:
                lock = threading.RLock()
                self._locks[project_id] = lock
            return lock


sync_service = SyncService()
