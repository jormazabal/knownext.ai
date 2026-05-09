from fastapi import HTTPException
from pathlib import Path
from uuid import uuid4

from app.schemas.project import (
    CreateDocumentRequest,
    CreateFolderRequest,
    FileOperationResult,
    MoveNodeRequest,
    Project,
    ProjectPayload,
    RenameNodeRequest,
    TreeNode,
)
from app.services.app_storage import JsonFileStore
from app.services.draft_service import draft_service
from app.services.filesystem_service import filesystem_service
from app.services.mock_store import PROJECTS


class ProjectService:
    def __init__(self) -> None:
        self.store = JsonFileStore("projects.json")

    def list_projects(self) -> list[Project]:
        registry = self._read_registry()
        return [Project(**project) for project in registry["projects"]]

    def get_active_project(self) -> Project:
        projects = self.list_projects()
        active = next((project for project in projects if project.active), projects[0])
        return active

    def create_project(self, payload: ProjectPayload) -> Project:
        registry = self._read_registry()
        project = {
            "id": f"project-{uuid4()}",
            "name": payload.name.strip() or "Nuevo proyecto",
            "folderPath": payload.folderPath.strip(),
            "icon": payload.icon,
            "iconColor": payload.iconColor,
            "isGitRepository": False,
            "active": True,
        }

        registry["projects"] = [{**current, "active": False} for current in registry["projects"]]
        registry["projects"].append(project)
        registry["activeProjectId"] = project["id"]
        self.store.write(registry)
        return Project(**project)

    def update_project(self, project_id: str, payload: ProjectPayload) -> Project:
        registry = self._read_registry()
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

        if len(projects) == 1:
            raise HTTPException(status_code=400, detail="Cannot delete the last project")

        remaining_projects = [project for project in projects if project["id"] != project_id]
        active_project_id = registry["activeProjectId"]
        if active_project_id == project_id:
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
        registry = self._read_registry()
        project = self._find_project(registry, project_id)
        return filesystem_service.get_tree(project_id, Path(project["folderPath"]))

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
        projects = registry.get("projects")

        if registry.get("schemaVersion") != 1 or not isinstance(projects, list) or not projects:
            registry = self._default_registry()
            self.store.write(registry)
            return registry

        active_project_id = registry.get("activeProjectId")
        if not active_project_id:
            active_project_id = next((project.get("id") for project in projects if project.get("active")), projects[0]["id"])
        if active_project_id not in {project.get("id") for project in projects}:
            active_project_id = projects[0]["id"]

        normalized_projects = []
        for project in projects:
            normalized_projects.append({**project, "active": project.get("id") == active_project_id})

        registry["projects"] = normalized_projects
        registry["activeProjectId"] = active_project_id
        return registry

    def _find_project(self, registry: dict, project_id: str) -> dict:
        project = next((project for project in registry["projects"] if project["id"] == project_id), None)
        if project is None:
            raise HTTPException(status_code=404, detail="Project not found")
        return project

    def _get_project_root(self, project_id: str) -> Path:
        registry = self._read_registry()
        project = self._find_project(registry, project_id)
        root = Path(project["folderPath"])
        if not root.exists() or not root.is_dir():
            raise HTTPException(status_code=404, detail="Project folder not found")
        return root

    def _default_registry(self) -> dict:
        active_project_id = next((project["id"] for project in PROJECTS if project.get("active")), PROJECTS[0]["id"])
        return {
            "schemaVersion": 1,
            "activeProjectId": active_project_id,
            "projects": [{**project, "active": project["id"] == active_project_id} for project in PROJECTS],
        }


project_service = ProjectService()
