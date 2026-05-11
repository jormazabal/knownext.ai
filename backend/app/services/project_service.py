import json
from fastapi import HTTPException
from pathlib import Path
from uuid import uuid4

from app.schemas.project import (
    CreateDocumentRequest,
    CreateFolderRequest,
    FileOperationResult,
    ProjectCapabilities,
    MoveNodeRequest,
    Project,
    ProjectPayload,
    ProjectVersioningStatus,
    RenameNodeRequest,
    TreeNode,
)
from app.services.app_storage import get_app_data_dir, get_legacy_app_data_dirs
from app.services.app_storage import JsonFileStore
from app.services.auth_service import auth_service
from app.services.draft_service import draft_service
from app.services.filesystem_service import filesystem_service
from app.services.git_service import git_service
from app.services.github_service import github_service
from app.services.logging_service import trace_logging_service


KNOWN_SEED_PROJECT_IDS = {"project-alpha", "project-beta", "project-gamma"}


class ProjectService:
    def __init__(self) -> None:
        self.store = JsonFileStore("projects.json")

    def list_projects(self) -> list[Project]:
        registry = self._read_registry()
        return [Project(**project) for project in registry["projects"]]

    def get_capabilities(self) -> ProjectCapabilities:
        authenticated = auth_service.get_status().isAuthenticated
        return ProjectCapabilities(
            canUseLocalGit=authenticated,
            canConnectGithub=authenticated,
            canUseGithubApi=authenticated,
        )

    def get_active_project(self) -> Project:
        projects = self.list_projects()
        active = next((project for project in projects if project.active), None)
        if active is None:
            raise HTTPException(status_code=404, detail="No active project")
        return active

    def create_project(self, payload: ProjectPayload) -> Project:
        registry = self._read_registry()
        self._validate_project_mode(payload)
        project_id = f"project-{uuid4()}"
        folder_path = payload.folderPath.strip()
        if not folder_path:
            folder_path = str(self._managed_project_root(project_id))
        github_repository = payload.githubRepository
        if payload.storageMode == "local-cache" and payload.githubRepository:
            Path(folder_path).mkdir(parents=True, exist_ok=True)
        else:
            self._prepare_local_project_folder(payload.creationMode, Path(folder_path))

        project = {
            "id": project_id,
            "name": payload.name.strip() or "Nuevo proyecto",
            "folderPath": folder_path,
            "icon": payload.icon,
            "iconColor": payload.iconColor,
            "storageMode": payload.storageMode,
            "versioningMode": payload.versioningMode,
            "syncMode": payload.syncMode,
            "authRequired": payload.versioningMode != "none",
            "githubRepository": github_repository.model_dump() if github_repository else None,
            "isGitRepository": payload.versioningMode == "local-git",
            "active": True,
        }

        project_root = Path(folder_path)
        if payload.versioningMode == "local-git":
            git_service.ensure_repository(project_root)
            if payload.publishToGithub and github_repository:
                github_repository = github_service.create_repository(
                    github_repository,
                    payload.publishToGithub.visibility,
                    payload.publishToGithub.description,
                )
                git_service.set_remote_origin(project_root, f"https://github.com/{github_repository.owner}/{github_repository.repo}.git")
                project["githubRepository"] = github_repository.model_dump()
        if payload.versioningMode == "github-api" and payload.githubRepository:
            github_service.hydrate_repository_cache(project_id, project_root, payload.githubRepository)

        registry["projects"] = [{**current, "active": False} for current in registry["projects"]]
        registry["projects"].append(project)
        registry["activeProjectId"] = project["id"]
        self.store.write(registry)
        return Project(**project)

    def update_project(self, project_id: str, payload: ProjectPayload) -> Project:
        registry = self._read_registry()
        self._validate_project_mode(payload)
        updated_project = None

        for index, project in enumerate(registry["projects"]):
            if project["id"] != project_id:
                continue

            updated_project = {
                **project,
                "name": payload.name.strip() or "Nuevo proyecto",
                "folderPath": payload.folderPath.strip(),
                "icon": payload.icon,
                "iconColor": payload.iconColor,
                "storageMode": payload.storageMode,
                "versioningMode": payload.versioningMode,
                "syncMode": payload.syncMode,
                "authRequired": payload.versioningMode != "none",
                "githubRepository": payload.githubRepository.model_dump() if payload.githubRepository else project.get("githubRepository"),
                "isGitRepository": payload.versioningMode == "local-git",
            }
            registry["projects"][index] = updated_project
            break

        if updated_project is None:
            raise HTTPException(status_code=404, detail="Project not found")

        self.store.write(registry)
        return Project(**updated_project)

    def delete_project(self, project_id: str) -> list[Project]:
        registry = self._read_registry()
        projects = registry["projects"]

        if project_id not in {project["id"] for project in projects}:
            raise HTTPException(status_code=404, detail="Project not found")

        remaining_projects = [project for project in projects if project["id"] != project_id]
        active_project_id = registry["activeProjectId"]
        if not remaining_projects:
            active_project_id = None
        elif active_project_id == project_id:
            active_project_id = remaining_projects[0]["id"]

        registry["activeProjectId"] = active_project_id
        registry["projects"] = [
            {**project, "active": project["id"] == active_project_id}
            for project in remaining_projects
        ]
        self.store.write(registry)
        return [Project(**project) for project in registry["projects"]]

    def set_active_project(self, project_id: str) -> Project:
        registry = self._read_registry()
        active = None
        next_projects = []

        for project in registry["projects"]:
            is_active = project["id"] == project_id
            next_project = {**project, "active": is_active}
            next_projects.append(next_project)
            if is_active:
                active = next_project

        if active is None:
            raise HTTPException(status_code=404, detail="Project not found")

        registry["projects"] = next_projects
        registry["activeProjectId"] = project_id
        self.store.write(registry)
        return Project(**active)

    def get_project_tree(self, project_id: str) -> list[TreeNode]:
        draft_service.run_maintenance()
        return filesystem_service.get_tree(project_id, self._get_project_root(project_id))

    def get_versioning_status(self, project_id: str) -> ProjectVersioningStatus:
        registry = self._read_registry()
        project = self._find_project(registry, project_id)
        authenticated = auth_service.get_status().isAuthenticated
        versioning_mode = project["versioningMode"]
        if versioning_mode == "none":
            return ProjectVersioningStatus(
                enabled=False,
                available=True,
                storageMode=project["storageMode"],
                versioningMode=versioning_mode,
                syncMode=project["syncMode"],
                statusLabel="Sin historial",
            )
        if project["authRequired"] and not authenticated:
            return ProjectVersioningStatus(
                enabled=False,
                available=False,
                reason="github-login-required",
                storageMode=project["storageMode"],
                versioningMode=versioning_mode,
                syncMode=project["syncMode"],
                statusLabel="Historial requiere GitHub",
            )
        root = Path(project["folderPath"])
        has_changes = False
        last_hash = None
        last_time = None
        if versioning_mode == "local-git":
            has_changes, last_hash, last_time = git_service.status(root)
        return ProjectVersioningStatus(
            enabled=True,
            available=True,
            storageMode=project["storageMode"],
            versioningMode=versioning_mode,
            syncMode=project["syncMode"],
            statusLabel="Cambios sin versionar" if has_changes else "Sincronizado",
            hasLocalChanges=has_changes,
            lastVersionHash=last_hash,
            lastVersionRelativeTime=last_time,
        )

    def sync_pull(self, project_id: str) -> dict[str, str]:
        project = self._get_versioned_project(project_id)
        if project["versioningMode"] == "local-git":
            output = git_service.pull(Path(project["folderPath"]))
            return {"status": "ok", "message": output or "Proyecto actualizado"}
        if project["versioningMode"] == "github-api" and project.get("githubRepository"):
            from app.schemas.project import GithubRepository

            github_service.hydrate_repository_cache(project_id, Path(project["folderPath"]), GithubRepository(**project["githubRepository"]))
            return {"status": "ok", "message": "Cache local actualizada desde GitHub"}
        return {"status": "ok", "message": "No hay proveedor remoto configurado"}

    def sync_push(self, project_id: str) -> dict[str, str]:
        project = self._get_versioned_project(project_id)
        if project["versioningMode"] == "local-git":
            output = git_service.push(Path(project["folderPath"]))
            return {"status": "ok", "message": output or "Cambios enviados"}
        return {"status": "ok", "message": "Las versiones GitHub API se publican al crear versión"}

    def create_folder(self, project_id: str, payload: CreateFolderRequest) -> FileOperationResult:
        return filesystem_service.create_folder(project_id, self._get_project_root(project_id), payload.parentId, payload.name)

    def create_document(self, project_id: str, payload: CreateDocumentRequest) -> FileOperationResult:
        return filesystem_service.create_document(
            project_id,
            self._get_project_root(project_id),
            payload.parentId,
            payload.name,
            payload.markdown,
        )

    def rename_node(self, project_id: str, node_id: str, payload: RenameNodeRequest) -> FileOperationResult:
        result = filesystem_service.rename_node(project_id, self._get_project_root(project_id), node_id, payload.name)
        draft_service.apply_affected_documents(result.affectedDocuments)
        return result

    def delete_node(self, project_id: str, node_id: str) -> FileOperationResult:
        result = filesystem_service.delete_node(project_id, self._get_project_root(project_id), node_id)
        draft_service.apply_affected_documents(result.affectedDocuments)
        return result

    def duplicate_document(self, project_id: str, document_id: str) -> FileOperationResult:
        return filesystem_service.duplicate_document(project_id, self._get_project_root(project_id), document_id)

    def move_node(self, project_id: str, node_id: str, payload: MoveNodeRequest) -> FileOperationResult:
        result = filesystem_service.move_node(project_id, self._get_project_root(project_id), node_id, payload.targetFolderId)
        draft_service.apply_affected_documents(result.affectedDocuments)
        return result

    def _read_registry(self) -> dict:
        registry = self.store.read(self._default_registry())
        original_registry = json.loads(json.dumps(registry))
        projects = registry.get("projects")

        if not isinstance(projects, list):
            registry = self._default_registry()
            self.store.write(registry)
            return registry

        if self._is_known_seed_registry(registry):
            recovered_registry = self._recover_registry_from_backups()
            registry = recovered_registry if recovered_registry is not None else self._default_registry()
            self.store.write(registry)
            trace_logging_service.record(
                "warning",
                "project.registry",
                "Ignored seeded mock project registry.",
                "A projects.json file containing Proyecto Alpha/Beta/Gamma seed data was detected and replaced with recovered user projects or an empty registry.",
            )
            projects = registry.get("projects")

        if not projects:
            registry["projects"] = []
            registry["activeProjectId"] = None
            registry["schemaVersion"] = 2
            if registry != original_registry:
                self.store.write(registry)
            return registry

        active_project_id = registry.get("activeProjectId")
        if not active_project_id:
            active_project_id = next((project.get("id") for project in projects if project.get("active")), projects[0]["id"])
        if active_project_id not in {project.get("id") for project in projects}:
            active_project_id = projects[0]["id"]

        normalized_projects = []
        for project in projects:
            normalized_projects.append(self._normalize_project({**project, "active": project.get("id") == active_project_id}))

        registry["projects"] = normalized_projects
        registry["activeProjectId"] = active_project_id
        registry["schemaVersion"] = 2
        if registry != original_registry:
            self.store.write(registry)
        return registry

    def _find_project(self, registry: dict, project_id: str) -> dict:
        project = next((project for project in registry["projects"] if project["id"] == project_id), None)
        if project is None:
            raise HTTPException(status_code=404, detail="Project not found")
        return project

    def _get_project_root(self, project_id: str) -> Path:
        registry = self._read_registry()
        project = self._find_project(registry, project_id)
        root = Path(project["folderPath"].strip() or str(self._managed_project_root(project_id)))
        if not root.exists() or not root.is_dir():
            raise HTTPException(status_code=404, detail="Project folder not found")
        return root

    def _managed_project_root(self, project_id: str) -> Path:
        return get_app_data_dir() / "projects" / project_id

    def _default_registry(self) -> dict:
        return {
            "schemaVersion": 2,
            "activeProjectId": None,
            "projects": [],
        }

    def _is_known_seed_registry(self, registry: dict) -> bool:
        projects = registry.get("projects")
        if not isinstance(projects, list) or not projects:
            return False

        project_ids = {project.get("id") for project in projects if isinstance(project, dict)}
        if not project_ids or not project_ids.issubset(KNOWN_SEED_PROJECT_IDS):
            return False

        seed_markers = 0
        for project in projects:
            if not isinstance(project, dict):
                continue
            name = str(project.get("name", ""))
            folder_path = str(project.get("folderPath", "")).replace("\\", "/")
            if name in {"Proyecto Alpha", "Proyecto Beta", "Proyecto Gamma"}:
                seed_markers += 1
            if folder_path in {"C:/Knowledge/Mind/Personal", "C:/Documentacion/Proyecto Gamma"}:
                seed_markers += 1

        return seed_markers >= len(projects)

    def _recover_registry_from_backups(self) -> dict | None:
        for candidate in self._registry_recovery_candidates():
            recovered = self._read_registry_candidate(candidate)
            if recovered is not None:
                trace_logging_service.record(
                    "warning",
                    "project.registry",
                    "Recovered project registry from backup.",
                    f"path={candidate}",
                )
                return recovered
        return None

    def _registry_recovery_candidates(self) -> list[Path]:
        candidates: list[Path] = []
        current_path = self.store.path
        candidates.extend(sorted(current_path.parent.glob(f"{current_path.name}.corrupt-*"), key=lambda path: path.stat().st_mtime, reverse=True))

        for legacy_dir in get_legacy_app_data_dirs():
            legacy_path = legacy_dir / self.store.filename
            candidates.append(legacy_path)
            candidates.extend(sorted(legacy_dir.glob(f"{self.store.filename}.corrupt-*"), key=lambda path: path.stat().st_mtime, reverse=True))

        unique_candidates: list[Path] = []
        seen: set[str] = set()
        for candidate in candidates:
            key = str(candidate.resolve()) if candidate.exists() else str(candidate)
            if key in seen:
                continue
            seen.add(key)
            unique_candidates.append(candidate)

        return unique_candidates

    def _read_registry_candidate(self, path: Path) -> dict | None:
        if not path.exists() or path == self.store.path:
            return None
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            return None
        if not isinstance(data, dict):
            return None
        projects = data.get("projects")
        if not isinstance(projects, list) or not projects:
            return None
        if self._is_known_seed_registry(data):
            return None
        return data

    def _normalize_project(self, project: dict) -> dict:
        project_id = str(project.get("id") or f"project-{uuid4()}")
        folder_path = str(project.get("folderPath") or "").strip()
        if not folder_path:
            folder_path = str(self._managed_project_root(project_id))
            Path(folder_path).mkdir(parents=True, exist_ok=True)
        versioning_mode = project.get("versioningMode")
        if versioning_mode not in {"none", "local-git", "github-api"}:
            versioning_mode = "local-git" if project.get("isGitRepository") else "none"
        storage_mode = project.get("storageMode")
        if storage_mode not in {"local-files", "local-cache"}:
            storage_mode = "local-cache" if versioning_mode == "github-api" else "local-files"
        sync_mode = project.get("syncMode")
        if sync_mode not in {"none", "manual-github"}:
            sync_mode = "manual-github" if versioning_mode in {"local-git", "github-api"} and project.get("githubRepository") else "none"
        return {
            **project,
            "id": project_id,
            "folderPath": folder_path,
            "storageMode": storage_mode,
            "versioningMode": versioning_mode,
            "syncMode": sync_mode,
            "authRequired": versioning_mode != "none",
            "githubRepository": project.get("githubRepository"),
            "isGitRepository": versioning_mode == "local-git",
        }

    def _validate_project_mode(self, payload: ProjectPayload) -> None:
        if payload.publishToGithub and payload.versioningMode != "local-git":
            raise HTTPException(status_code=400, detail="Publishing to a new GitHub repo requires local Git versioning")
        if payload.publishToGithub and payload.githubRepository is None:
            raise HTTPException(status_code=400, detail="Publishing to GitHub requires repository owner and name")
        if payload.versioningMode == "none":
            if payload.storageMode == "local-cache":
                raise HTTPException(status_code=400, detail="Local cache storage requires GitHub API versioning")
            return
        auth_service.require_github_auth()
        if payload.publishToGithub and payload.syncMode != "manual-github":
            raise HTTPException(status_code=400, detail="Publishing to GitHub requires manual GitHub sync mode")
        if payload.versioningMode == "github-api" and payload.syncMode != "manual-github":
            raise HTTPException(status_code=400, detail="GitHub API projects require manual GitHub sync mode")
        if payload.versioningMode == "github-api" and payload.storageMode != "local-cache":
            raise HTTPException(status_code=400, detail="GitHub API projects require local cache storage")
        if payload.versioningMode == "github-api" and payload.githubRepository is None:
            raise HTTPException(status_code=400, detail="GitHub API projects require a GitHub repository")

    def _prepare_local_project_folder(self, creation_mode: str, root: Path) -> None:
        if not str(root).strip():
            raise HTTPException(status_code=400, detail="Project folder path is required")
        if creation_mode == "new-local":
            root.mkdir(parents=True, exist_ok=True)
            return
        if not root.exists() or not root.is_dir():
            raise HTTPException(status_code=404, detail="Project folder not found")

    def _get_versioned_project(self, project_id: str) -> dict:
        registry = self._read_registry()
        project = self._find_project(registry, project_id)
        if project["versioningMode"] == "none":
            raise HTTPException(status_code=409, detail="Project has no versioning enabled")
        auth_service.require_github_auth()
        return project


project_service = ProjectService()
