import base64
import json
import os

import pytest
from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


@pytest.fixture(autouse=True)
def isolated_app_data(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("KNOWNEXT_APP_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("APPDATA", str(tmp_path / "isolated-appdata"))
    monkeypatch.delenv("KNOWNEXT_GITHUB_CLIENT_ID", raising=False)


def test_health() -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"
    assert response.json()["version"] == "0.6.11"
    assert response.json()["appDataDir"]


def test_projects_and_tree() -> None:
    projects = client.get("/api/projects")
    assert projects.status_code == 200
    assert projects.json() == []

    active = client.get("/api/projects/active")
    assert active.status_code == 404


def test_project_tree_reads_local_folder_and_manages_files(tmp_path) -> None:
    docs_root = tmp_path / "docs"
    docs_root.mkdir()
    (docs_root / "intro.md").write_text("# Intro\n", encoding="utf-8")
    (docs_root / "Guides").mkdir()
    (docs_root / "Guides" / "setup.md").write_text("# Setup\n", encoding="utf-8")

    created = client.post(
        "/api/projects",
        json={
            "name": "Docs locales",
            "folderPath": str(docs_root),
            "icon": "folder",
            "iconColor": "#F37021",
        },
    )
    project_id = created.json()["id"]

    tree = client.get(f"/api/projects/{project_id}/tree")
    assert tree.status_code == 200
    root_nodes = tree.json()
    assert root_nodes[0]["name"] == "Guides"
    assert root_nodes[1]["name"] == "intro.md"

    folder_id = root_nodes[0]["id"]
    created_document = client.post(
        f"/api/projects/{project_id}/documents",
        json={"parentId": folder_id, "name": "notes.md", "markdown": "# Notes\n"},
    )
    assert created_document.status_code == 200
    document_id = created_document.json()["node"]["id"]
    assert (docs_root / "Guides" / "notes.md").exists()

    document = client.get(f"/api/documents/{document_id}")
    assert document.status_code == 200
    assert document.json()["markdown"] == "# Notes\n"

    renamed = client.patch(
        f"/api/projects/{project_id}/nodes/{document_id}/rename",
        json={"name": "notes-renamed.md"},
    )
    assert renamed.status_code == 200
    renamed_id = renamed.json()["node"]["id"]
    assert renamed.json()["affectedDocuments"][0]["oldId"] == document_id
    assert (docs_root / "Guides" / "notes-renamed.md").exists()

    duplicated = client.post(f"/api/projects/{project_id}/documents/{renamed_id}/duplicate")
    assert duplicated.status_code == 200
    assert (docs_root / "Guides" / "notes-renamed copia.md").exists()

    deleted = client.delete(f"/api/projects/{project_id}/nodes/{renamed_id}")
    assert deleted.status_code == 200
    assert not (docs_root / "Guides" / "notes-renamed.md").exists()


def test_project_registry_writes_projects_json(tmp_path) -> None:
    docs_root = tmp_path / "persistente"
    docs_root.mkdir()
    edited_root = tmp_path / "persistente-editado"
    edited_root.mkdir()
    created = client.post(
        "/api/projects",
        json={
            "name": "Proyecto Persistente",
            "folderPath": str(docs_root),
            "icon": "folder",
            "iconColor": "#F37021",
        },
    )
    assert created.status_code == 201
    project_id = created.json()["id"]

    updated = client.put(
        f"/api/projects/{project_id}",
        json={
            "name": "Proyecto Persistente Editado",
            "folderPath": str(edited_root),
            "icon": "book",
            "iconColor": "#D85A12",
        },
    )
    assert updated.status_code == 200
    assert updated.json()["folderPath"] == str(edited_root)

    projects_file = tmp_path / "projects.json"
    registry = json.loads(projects_file.read_text(encoding="utf-8"))
    persisted_project = next(project for project in registry["projects"] if project["id"] == project_id)
    assert persisted_project["name"] == "Proyecto Persistente Editado"
    assert registry["activeProjectId"] == project_id

    deleted = client.delete(f"/api/projects/{project_id}")
    assert deleted.status_code == 200
    assert all(project["id"] != project_id for project in deleted.json())
    assert deleted.json() == []

    registry_after_delete = json.loads(projects_file.read_text(encoding="utf-8"))
    assert all(project["id"] != project_id for project in registry_after_delete["projects"])
    assert registry_after_delete["activeProjectId"] is None


def test_new_local_project_creates_folder_and_open_local_requires_existing_folder(tmp_path) -> None:
    new_root = tmp_path / "new-docs"
    created = client.post(
        "/api/projects",
        json={
            "name": "Nuevo local",
            "folderPath": str(new_root),
            "icon": "folder",
            "iconColor": "#F37021",
            "creationMode": "new-local",
        },
    )
    assert created.status_code == 201
    assert new_root.exists()

    missing_root = tmp_path / "missing-docs"
    opened = client.post(
        "/api/projects",
        json={
            "name": "Falta carpeta",
            "folderPath": str(missing_root),
            "icon": "folder",
            "iconColor": "#F37021",
            "creationMode": "open-local",
        },
    )
    assert opened.status_code == 404


def test_config_writes_config_json(tmp_path) -> None:
    config = client.get("/api/config")
    assert config.status_code == 200
    assert config.json()["layout"]["sidebarWidth"] == 338
    assert config.json()["appearance"] == {"language": "es", "zoomPercent": 100}
    assert config.json()["diagnostics"] == {"traceLoggingEnabled": False}
    assert config.json()["tabsByProject"] == {}

    updated = client.put(
        "/api/config",
        json={
            "layout": {"sidebarWidth": 420, "historyWidth": 360},
            "appearance": {"language": "en", "zoomPercent": 115},
            "diagnostics": {"traceLoggingEnabled": True},
            "tabsByProject": {
                "project-alpha": {
                    "openTabs": [
                        {"id": "decision-tech", "name": "decision-tecnologica.md"},
                        {"id": "meeting-minutes", "name": "acta-reunion.md"},
                    ],
                    "activeDocumentId": "decision-tech",
                }
            },
        },
    )
    assert updated.status_code == 200
    assert updated.json()["layout"] == {"sidebarWidth": 420, "historyWidth": 360}
    assert updated.json()["appearance"] == {"language": "en", "zoomPercent": 115}
    assert updated.json()["diagnostics"] == {"traceLoggingEnabled": True}
    assert updated.json()["tabsByProject"]["project-alpha"]["openTabs"][0]["id"] == "decision-tech"

    config_file = tmp_path / "config.json"
    persisted_config = json.loads(config_file.read_text(encoding="utf-8"))
    assert persisted_config["layout"] == {"sidebarWidth": 420, "historyWidth": 360}
    assert persisted_config["appearance"] == {"language": "en", "zoomPercent": 115}
    assert persisted_config["diagnostics"] == {"traceLoggingEnabled": True}
    assert persisted_config["tabsByProject"]["project-alpha"]["activeDocumentId"] == "decision-tech"


def test_trace_logging_writes_only_when_enabled(tmp_path) -> None:
    disabled = client.post(
        "/api/runtime/logging",
        json={"level": "info", "source": "test", "message": "disabled"},
    )
    assert disabled.status_code == 200
    assert disabled.json()["enabled"] is False
    assert not (tmp_path / "logs" / "knownext.log").exists()

    disabled_error = client.post(
        "/api/runtime/logging",
        json={"level": "error", "source": "test", "message": "visible error", "detail": "important"},
    )
    assert disabled_error.status_code == 200
    assert disabled_error.json()["enabled"] is False
    assert "Message: visible error" in (tmp_path / "logs" / "knownext.log").read_text(encoding="utf-8")

    client.put("/api/config", json={"diagnostics": {"traceLoggingEnabled": True}})
    enabled = client.post(
        "/api/runtime/logging",
        json={"level": "error", "source": "test", "message": "enabled", "detail": "stack"},
    )
    assert enabled.status_code == 200
    assert enabled.json()["enabled"] is True
    assert enabled.json()["folderPath"] == str(tmp_path / "logs")

    log_file = tmp_path / "logs" / "knownext.log"
    entry = log_file.read_text(encoding="utf-8")
    assert "[ERROR] test" in entry
    assert "Message: enabled" in entry
    assert "Detail:\nstack" in entry
    assert entry.rstrip().endswith("---")

    missing_root = tmp_path / "missing-project-folder"
    controlled_error = client.post(
        "/api/projects",
        json={
            "name": "Missing",
            "folderPath": str(missing_root),
            "icon": "folder",
            "iconColor": "#F37021",
            "creationMode": "open-local",
        },
    )
    assert controlled_error.status_code == 404
    controlled_entry = log_file.read_text(encoding="utf-8")
    assert "[ERROR] POST /api/projects" in controlled_entry
    assert "Project folder not found" in controlled_entry


def test_empty_current_profile_recovers_legacy_projects_config_and_credentials(tmp_path, monkeypatch) -> None:
    current_dir = tmp_path / "current-profile"
    legacy_parent = tmp_path / "legacy-appdata"
    legacy_dir = legacy_parent / "KnowNext.ai"
    docs_root = tmp_path / "docs"
    docs_root.mkdir()
    current_dir.mkdir()
    legacy_dir.mkdir(parents=True)
    monkeypatch.setenv("KNOWNEXT_APP_DATA_DIR", str(current_dir))
    monkeypatch.setenv("APPDATA", str(legacy_parent))

    (current_dir / "projects.json").write_text(
        json.dumps({"schemaVersion": 2, "activeProjectId": None, "projects": []}),
        encoding="utf-8",
    )
    (current_dir / "credentials.json").write_text(
        json.dumps({"schemaVersion": 1, "github": None}),
        encoding="utf-8",
    )
    (legacy_dir / "projects.json").write_text(
        json.dumps(
            {
                "schemaVersion": 2,
                "activeProjectId": "project-legacy",
                "projects": [
                    {
                        "id": "project-legacy",
                        "name": "Proyecto legado",
                        "folderPath": str(docs_root),
                        "icon": "folder",
                        "iconColor": "#F37021",
                        "storageMode": "local-files",
                        "versioningMode": "none",
                        "syncMode": "none",
                        "authRequired": False,
                        "githubRepository": None,
                        "isGitRepository": False,
                        "active": True,
                    }
                ],
            }
        ),
        encoding="utf-8",
    )
    (legacy_dir / "config.json").write_text(
        json.dumps(
            {
                "schemaVersion": 1,
                "layout": {"sidebarWidth": 410, "historyWidth": 360},
                "appearance": {"language": "en", "zoomPercent": 110},
                "diagnostics": {"traceLoggingEnabled": True},
                "tabsByProject": {},
                "lastRunAppVersion": "0.6.8",
                "lastSeenReleaseNotesVersion": "0.6.8",
                "openUtilityTabs": [],
                "activeUtilityTab": None,
                "updatedAt": "2026-05-10T00:00:00Z",
            }
        ),
        encoding="utf-8",
    )
    (legacy_dir / "credentials.json").write_text(
        json.dumps(
            {
                "schemaVersion": 1,
                "github": {
                    "accessToken": "legacy-token",
                    "scopes": ["read:user", "repo"],
                    "user": {"login": "legacy-user", "name": "Legacy User", "avatarUrl": None},
                },
            }
        ),
        encoding="utf-8",
    )

    projects = client.get("/api/projects")
    config = client.get("/api/config")
    auth = client.get("/api/auth/status")

    assert projects.status_code == 200
    assert projects.json()[0]["name"] == "Proyecto legado"
    assert config.json()["layout"]["sidebarWidth"] == 410
    assert config.json()["diagnostics"]["traceLoggingEnabled"] is True
    assert auth.json()["isAuthenticated"] is True
    assert auth.json()["user"]["login"] == "legacy-user"
    assert json.loads((current_dir / "projects.json").read_text(encoding="utf-8"))["activeProjectId"] == "project-legacy"
    assert json.loads((current_dir / "credentials.json").read_text(encoding="utf-8"))["github"]["user"]["login"] == "legacy-user"


def test_invalid_config_file_is_backed_up(tmp_path) -> None:
    config_file = tmp_path / "config.json"
    config_file.write_text("{invalid json", encoding="utf-8")

    response = client.get("/api/config")

    assert response.status_code == 200
    assert response.json()["schemaVersion"] == 1
    assert config_file.exists()
    assert list(tmp_path.glob("config.json.corrupt-*"))


def test_document_save_and_versions(tmp_path) -> None:
    docs_root = tmp_path / "docs"
    docs_root.mkdir()
    (docs_root / "meeting.md").write_text("# Reunión\n", encoding="utf-8")
    created = client.post(
        "/api/projects",
        json={"name": "Docs", "folderPath": str(docs_root), "icon": "folder", "iconColor": "#F37021"},
    )
    project_id = created.json()["id"]
    document_id = client.get(f"/api/projects/{project_id}/tree").json()[0]["id"]

    document = client.get(f"/api/documents/{document_id}")
    assert document.status_code == 200
    assert document.json()["name"] == "meeting.md"

    saved = client.put(f"/api/documents/{document_id}", json={"markdown": "# Guardado\n\nContenido actualizado."})
    assert saved.status_code == 200
    assert saved.json()["wordCount"] == 4

    versions = client.get(f"/api/documents/{document_id}/versions")
    assert versions.status_code == 409

    device = client.post("/api/auth/github/device/start")
    assert device.status_code == 200
    authenticated = client.post("/api/auth/github/device/poll", json={"deviceCode": device.json()["deviceCode"]})
    assert authenticated.status_code == 200
    assert authenticated.json()["auth"]["isAuthenticated"] is True

    versions = client.get(f"/api/documents/{document_id}/versions")
    assert versions.status_code == 409


def test_projects_registry_migrates_v1_project_modes(tmp_path) -> None:
    projects_file = tmp_path / "projects.json"
    projects_file.write_text(
        json.dumps(
            {
                "schemaVersion": 1,
                "activeProjectId": "legacy",
                "projects": [
                    {
                        "id": "legacy",
                        "name": "Legacy",
                        "folderPath": "C:\\Docs\\Legacy",
                        "icon": "folder",
                        "iconColor": "#F37021",
                        "isGitRepository": True,
                        "active": True,
                    }
                ],
            }
        ),
        encoding="utf-8",
    )

    response = client.get("/api/projects")

    assert response.status_code == 200
    project = response.json()[0]
    assert project["versioningMode"] == "local-git"
    assert project["authRequired"] is True
    assert json.loads(projects_file.read_text(encoding="utf-8"))["schemaVersion"] == 2


def test_versioned_project_creation_requires_github_login(tmp_path) -> None:
    docs_root = tmp_path / "versioned"
    response = client.post(
        "/api/projects",
        json={
            "name": "Versionado",
            "folderPath": str(docs_root),
            "icon": "folder",
            "iconColor": "#F37021",
            "creationMode": "new-local",
            "storageMode": "local-files",
            "versioningMode": "local-git",
            "syncMode": "manual-github",
        },
    )

    assert response.status_code == 403


def test_auth_status_mock_login_logout_and_capabilities() -> None:
    assert client.get("/api/auth/status").json()["isAuthenticated"] is False
    assert client.get("/api/projects/capabilities").json()["canUseLocalGit"] is False

    device = client.post("/api/auth/github/device/start")
    assert device.status_code == 200
    login = client.post("/api/auth/github/device/poll", json={"deviceCode": device.json()["deviceCode"]})
    assert login.status_code == 200
    assert login.json()["auth"]["user"]["login"] == "knownext-user"
    assert client.get("/api/projects/capabilities").json()["canUseLocalGit"] is True

    logout = client.post("/api/auth/logout")
    assert logout.status_code == 200
    assert logout.json()["isAuthenticated"] is False


def test_github_device_poll_keeps_slow_down_as_pending(monkeypatch) -> None:
    from app.services.auth_service import auth_service

    monkeypatch.setenv("KNOWNEXT_GITHUB_CLIENT_ID", "client-id")
    monkeypatch.setattr(auth_service, "_post_form", lambda _url, _payload: {"error": "slow_down"})

    response = client.post("/api/auth/github/device/poll", json={"deviceCode": "device-code"})

    assert response.status_code == 200
    assert response.json()["status"] == "pending"
    assert response.json()["error"] == "slow_down"
    assert response.json()["auth"]["isAuthenticated"] is False


def test_local_git_project_versions_document(tmp_path) -> None:
    device = client.post("/api/auth/github/device/start")
    client.post("/api/auth/github/device/poll", json={"deviceCode": device.json()["deviceCode"]})
    docs_root = tmp_path / "git-docs"

    created = client.post(
        "/api/projects",
        json={
            "name": "Git Docs",
            "folderPath": str(docs_root),
            "icon": "folder",
            "iconColor": "#F37021",
            "creationMode": "new-local",
            "storageMode": "local-files",
            "versioningMode": "local-git",
            "syncMode": "manual-github",
        },
    )
    assert created.status_code == 201
    project_id = created.json()["id"]

    document = client.post(
        f"/api/projects/{project_id}/documents",
        json={"parentId": None, "name": "versioned.md", "markdown": "# Versioned\n"},
    )
    document_id = document.json()["node"]["id"]

    version = client.post(
        f"/api/projects/{project_id}/versions",
        json={"documentId": document_id, "title": "Primera versión"},
    )

    assert version.status_code == 200
    assert version.json()["version"]["title"] == "Primera versión"
    history = client.get(f"/api/documents/{document_id}/versions")
    assert history.status_code == 200
    assert history.json()[0]["title"] == "Primera versión"


def test_local_folder_can_create_new_github_repository(tmp_path, monkeypatch) -> None:
    from app.schemas.project import GithubRepository
    from app.services.github_service import github_service

    device = client.post("/api/auth/github/device/start")
    client.post("/api/auth/github/device/poll", json={"deviceCode": device.json()["deviceCode"]})
    docs_root = tmp_path / "publish-docs"
    created_repositories = []

    def fake_create_repository(repository: GithubRepository, visibility: str, description: str | None = None) -> GithubRepository:
        created_repositories.append((repository, visibility, description))
        return GithubRepository(
            owner=repository.owner,
            repo=repository.repo,
            defaultRef="main",
            rootPath="",
            permissions=["pull", "push"],
        )

    monkeypatch.setattr(github_service, "create_repository", fake_create_repository)

    created = client.post(
        "/api/projects",
        json={
            "name": "Publish Docs",
            "folderPath": str(docs_root),
            "icon": "folder",
            "iconColor": "#F37021",
            "creationMode": "new-local",
            "storageMode": "local-files",
            "versioningMode": "local-git",
            "syncMode": "manual-github",
            "githubRepository": {"owner": "knownext-user", "repo": "publish-docs", "rootPath": "", "permissions": ["pull", "push"]},
            "publishToGithub": {"visibility": "public", "description": "Docs"},
        },
    )

    assert created.status_code == 201
    project = created.json()
    assert project["versioningMode"] == "local-git"
    assert project["syncMode"] == "manual-github"
    assert project["githubRepository"]["owner"] == "knownext-user"
    assert project["githubRepository"]["repo"] == "publish-docs"
    assert (docs_root / ".git").exists()
    assert created_repositories[0][1] == "public"

    status = client.get(f"/api/projects/{project['id']}/versioning/status")
    assert status.status_code == 200
    assert status.json()["statusLabel"] == "Sincronizado"
    assert status.json()["lastVersionHash"] is None


def test_github_api_project_uses_cache_metadata_and_blocks_remote_conflicts(tmp_path, monkeypatch) -> None:
    from app.services.github_service import github_service

    device = client.post("/api/auth/github/device/start")
    client.post("/api/auth/github/device/poll", json={"deviceCode": device.json()["deviceCode"]})
    remote_sha = {"value": "remote-1"}

    def fake_github_request(path: str, method: str = "GET", body: dict | None = None):
        if path == "/repos/acme/docs/contents":
            return [{"path": "guide.md", "type": "file", "sha": remote_sha["value"]}]
        if path == "/repos/acme/docs/contents/guide.md" and method == "GET":
            return {
                "sha": remote_sha["value"],
                "content": base64.b64encode(b"# Remote\n").decode("ascii"),
            }
        if path == "/repos/acme/docs/contents/guide.md" and method == "PUT":
            remote_sha["value"] = "remote-3"
            return {
                "content": {"sha": remote_sha["value"]},
                "commit": {"sha": "commit-3", "author": {"name": "GitHub"}},
            }
        raise AssertionError(f"Unexpected GitHub request: {method} {path}")

    monkeypatch.setattr(github_service, "_request_json", fake_github_request)

    created = client.post(
        "/api/projects",
        json={
            "name": "GitHub Docs",
            "folderPath": "",
            "icon": "github",
            "iconColor": "#F37021",
            "creationMode": "github-repository",
            "storageMode": "local-cache",
            "versioningMode": "github-api",
            "syncMode": "manual-github",
            "githubRepository": {"owner": "acme", "repo": "docs", "rootPath": "", "permissions": ["pull", "push"]},
        },
    )
    assert created.status_code == 201
    project_id = created.json()["id"]
    document_id = client.get(f"/api/projects/{project_id}/tree").json()[0]["id"]
    document = client.get(f"/api/documents/{document_id}").json()

    saved = client.put(
        f"/api/documents/{document_id}",
        json={"markdown": "# Local\n", "baseFingerprint": document["baseFingerprint"]},
    )
    assert saved.status_code == 200

    remote_sha["value"] = "remote-2"
    conflict = client.post(f"/api/projects/{project_id}/versions", json={"documentId": document_id, "title": "Publica guía"})
    assert conflict.status_code == 409
    assert conflict.json()["detail"]["code"] == "github_remote_changed"

    remote_sha["value"] = "remote-1"
    version = client.post(f"/api/projects/{project_id}/versions", json={"documentId": document_id, "title": "Publica guía"})
    assert version.status_code == 200
    assert version.json()["version"]["hash"] == "commit-"


def test_document_draft_is_internal_and_recovered(tmp_path) -> None:
    docs_root = tmp_path / "docs"
    docs_root.mkdir()
    (docs_root / "drafted.md").write_text("# Original\n", encoding="utf-8")

    created = client.post(
        "/api/projects",
        json={"name": "Drafts", "folderPath": str(docs_root), "icon": "folder", "iconColor": "#F37021"},
    )
    project_id = created.json()["id"]
    document_id = client.get(f"/api/projects/{project_id}/tree").json()[0]["id"]
    document = client.get(f"/api/documents/{document_id}").json()

    draft = client.put(
        f"/api/documents/{document_id}/draft",
        json={"markdown": "# Draft\n", "baseFingerprint": document["baseFingerprint"]},
    )
    assert draft.status_code == 200
    assert not list(docs_root.glob("*.json"))

    recovered = client.get(f"/api/documents/{document_id}")
    assert recovered.status_code == 200
    assert recovered.json()["markdown"] == "# Draft\n"
    assert recovered.json()["hasDraft"] is True
    assert recovered.json()["isDirty"] is True
    assert (docs_root / "drafted.md").read_text(encoding="utf-8") == "# Original\n"


def test_document_save_conflicts_when_disk_changed_after_draft(tmp_path) -> None:
    docs_root = tmp_path / "docs"
    docs_root.mkdir()
    document_path = docs_root / "conflict.md"
    document_path.write_text("# Original\n", encoding="utf-8")

    created = client.post(
        "/api/projects",
        json={"name": "Conflicts", "folderPath": str(docs_root), "icon": "folder", "iconColor": "#F37021"},
    )
    project_id = created.json()["id"]
    document_id = client.get(f"/api/projects/{project_id}/tree").json()[0]["id"]
    document = client.get(f"/api/documents/{document_id}").json()
    base_fingerprint = document["baseFingerprint"]

    client.put(f"/api/documents/{document_id}/draft", json={"markdown": "# Draft\n", "baseFingerprint": base_fingerprint})
    document_path.write_text("# External\n", encoding="utf-8")

    conflict = client.put(
        f"/api/documents/{document_id}",
        json={"markdown": "# Draft\n", "baseFingerprint": base_fingerprint},
    )
    assert conflict.status_code == 409

    recovered = client.get(f"/api/documents/{document_id}")
    assert recovered.json()["diskChanged"] is True
    assert recovered.json()["conflictStatus"] == "disk-changed"

    forced = client.put(
        f"/api/documents/{document_id}",
        json={"markdown": "# Draft\n", "baseFingerprint": base_fingerprint, "force": True},
    )
    assert forced.status_code == 200
    assert document_path.read_text(encoding="utf-8") == "# Draft\n"
    assert client.get(f"/api/documents/{document_id}").json()["hasDraft"] is False


def test_document_same_content_with_new_mtime_is_not_disk_conflict(tmp_path) -> None:
    docs_root = tmp_path / "docs"
    docs_root.mkdir()
    document_path = docs_root / "same-content.md"
    document_path.write_text("# Original\n", encoding="utf-8")

    created = client.post(
        "/api/projects",
        json={"name": "Mtime", "folderPath": str(docs_root), "icon": "folder", "iconColor": "#F37021"},
    )
    project_id = created.json()["id"]
    document_id = client.get(f"/api/projects/{project_id}/tree").json()[0]["id"]
    document = client.get(f"/api/documents/{document_id}").json()
    base_fingerprint = document["baseFingerprint"]

    os.utime(document_path, ns=(base_fingerprint["mtimeNs"] + 1_000_000_000, base_fingerprint["mtimeNs"] + 1_000_000_000))

    changed = client.post("/api/documents/sync-status", json={"documents": [{"documentId": document_id, "baseFingerprint": base_fingerprint}]})
    assert changed.status_code == 200
    assert changed.json()["documents"][0]["diskChanged"] is False
    assert changed.json()["documents"][0]["conflictStatus"] == "none"

    saved = client.put(
        f"/api/documents/{document_id}",
        json={"markdown": "# Draft\n", "baseFingerprint": base_fingerprint},
    )
    assert saved.status_code == 200
    assert document_path.read_text(encoding="utf-8") == "# Draft\n"


def test_document_draft_can_be_discarded_and_migrates_on_rename(tmp_path) -> None:
    docs_root = tmp_path / "docs"
    docs_root.mkdir()
    (docs_root / "rename.md").write_text("# Original\n", encoding="utf-8")

    created = client.post(
        "/api/projects",
        json={"name": "Rename Drafts", "folderPath": str(docs_root), "icon": "folder", "iconColor": "#F37021"},
    )
    project_id = created.json()["id"]
    document_id = client.get(f"/api/projects/{project_id}/tree").json()[0]["id"]
    document = client.get(f"/api/documents/{document_id}").json()

    client.put(f"/api/documents/{document_id}/draft", json={"markdown": "# Draft\n", "baseFingerprint": document["baseFingerprint"]})
    renamed = client.patch(f"/api/projects/{project_id}/nodes/{document_id}/rename", json={"name": "renamed.md"})
    renamed_id = renamed.json()["node"]["id"]

    assert client.get(f"/api/documents/{renamed_id}").json()["markdown"] == "# Draft\n"

    discarded = client.delete(f"/api/documents/{renamed_id}/draft")
    assert discarded.status_code == 204
    assert client.get(f"/api/documents/{renamed_id}").json()["hasDraft"] is False


def test_document_sync_status_detects_clean_changed_and_orphaned_document(tmp_path) -> None:
    docs_root = tmp_path / "docs"
    docs_root.mkdir()
    document_path = docs_root / "sync.md"
    document_path.write_text("# Original\n", encoding="utf-8")

    created = client.post(
        "/api/projects",
        json={"name": "Sync", "folderPath": str(docs_root), "icon": "folder", "iconColor": "#F37021"},
    )
    project_id = created.json()["id"]
    document_id = client.get(f"/api/projects/{project_id}/tree").json()[0]["id"]
    document = client.get(f"/api/documents/{document_id}").json()
    base_fingerprint = document["baseFingerprint"]

    clean = client.post("/api/documents/sync-status", json={"documents": [{"documentId": document_id, "baseFingerprint": base_fingerprint}]})
    assert clean.status_code == 200
    assert clean.json()["documents"][0]["diskChanged"] is False

    document_path.write_text("# External\n", encoding="utf-8")
    changed = client.post("/api/documents/sync-status", json={"documents": [{"documentId": document_id, "baseFingerprint": base_fingerprint}]})
    assert changed.json()["documents"][0]["diskChanged"] is True
    assert changed.json()["documents"][0]["conflictStatus"] == "disk-changed"

    client.put(f"/api/documents/{document_id}/draft", json={"markdown": "# Draft\n", "baseFingerprint": base_fingerprint})
    document_path.unlink()
    orphaned = client.post("/api/documents/sync-status", json={"documents": [{"documentId": document_id, "baseFingerprint": base_fingerprint}]})
    assert orphaned.json()["documents"][0]["exists"] is False
    assert orphaned.json()["documents"][0]["orphaned"] is True
    assert orphaned.json()["documents"][0]["conflictStatus"] == "orphaned"


def test_orphan_drafts_can_be_listed_restored_discarded_and_not_overwritten(tmp_path) -> None:
    docs_root = tmp_path / "docs"
    docs_root.mkdir()
    document_path = docs_root / "lost.md"
    document_path.write_text("# Original\n", encoding="utf-8")

    created = client.post(
        "/api/projects",
        json={"name": "Orphans", "folderPath": str(docs_root), "icon": "folder", "iconColor": "#F37021"},
    )
    project_id = created.json()["id"]
    document_id = client.get(f"/api/projects/{project_id}/tree").json()[0]["id"]
    document = client.get(f"/api/documents/{document_id}").json()

    client.put(f"/api/documents/{document_id}/draft", json={"markdown": "# Draft\n\nRecovered text", "baseFingerprint": document["baseFingerprint"]})
    document_path.unlink()

    orphans = client.get("/api/drafts/orphans")
    assert orphans.status_code == 200
    orphan = orphans.json()[0]
    assert orphan["documentId"] == document_id
    assert orphan["recoverable"] is True

    document_path.write_text("# Reappeared\n", encoding="utf-8")
    blocked_restore = client.post(f"/api/drafts/{orphan['draftKey']}/restore")
    assert blocked_restore.status_code == 409
    document_path.unlink()

    restored = client.post(f"/api/drafts/{orphan['draftKey']}/restore")
    assert restored.status_code == 200
    assert document_path.read_text(encoding="utf-8") == "# Draft\n\nRecovered text"
    assert client.get("/api/drafts/orphans").json() == []

    client.put(f"/api/documents/{document_id}/draft", json={"markdown": "# Draft again\n", "baseFingerprint": restored.json()["document"]["baseFingerprint"]})
    document_path.unlink()
    orphan = client.get("/api/drafts/orphans").json()[0]
    discarded = client.delete(f"/api/drafts/{orphan['draftKey']}")
    assert discarded.status_code == 204
    assert client.get("/api/drafts/orphans").json() == []


def test_orphan_draft_can_be_updated_after_file_is_deleted(tmp_path) -> None:
    docs_root = tmp_path / "docs"
    docs_root.mkdir()
    document_path = docs_root / "editable-orphan.md"
    document_path.write_text("# Original\n", encoding="utf-8")

    created = client.post(
        "/api/projects",
        json={"name": "Editable Orphan", "folderPath": str(docs_root), "icon": "folder", "iconColor": "#F37021"},
    )
    project_id = created.json()["id"]
    document_id = client.get(f"/api/projects/{project_id}/tree").json()[0]["id"]
    document = client.get(f"/api/documents/{document_id}").json()

    client.put(f"/api/documents/{document_id}/draft", json={"markdown": "# Draft 1\n", "baseFingerprint": document["baseFingerprint"]})
    document_path.unlink()
    updated = client.put(f"/api/documents/{document_id}/draft", json={"markdown": "# Draft 2\n", "baseFingerprint": document["baseFingerprint"]})

    assert updated.status_code == 200
    orphan = client.get("/api/drafts/orphans").json()[0]
    assert orphan["wordCount"] == 3


def test_draft_maintenance_removes_tmp_and_moves_corrupt_files(tmp_path) -> None:
    drafts_dir = tmp_path / "drafts"
    drafts_dir.mkdir()
    (drafts_dir / "dangling.tmp").write_text("partial", encoding="utf-8")
    corrupt_path = drafts_dir / ("a" * 64 + ".json")
    corrupt_path.write_text("{bad json", encoding="utf-8")

    response = client.get("/api/drafts/orphans")

    assert response.status_code == 200
    assert not (drafts_dir / "dangling.tmp").exists()
    assert list((drafts_dir / "corrupt").glob("*.corrupt-*"))


def test_ai_prompt(tmp_path) -> None:
    docs_root = tmp_path / "ai-docs"
    docs_root.mkdir()
    (docs_root / "context.md").write_text("# Documento\n", encoding="utf-8")
    created = client.post(
        "/api/projects",
        json={"name": "AI Docs", "folderPath": str(docs_root), "icon": "folder", "iconColor": "#F37021"},
    )
    project_id = created.json()["id"]
    document_id = client.get(f"/api/projects/{project_id}/tree").json()[0]["id"]

    response = client.post(
        f"/api/documents/{document_id}/ai/prompt",
        json={"prompt": "Resume acuerdos", "markdown": "# Documento"},
    )
    assert response.status_code == 200
    assert "no está configurada" in response.json()["answer"]
    assert response.json()["suggestedActions"] == []


def test_project_ai_prompt(tmp_path) -> None:
    docs_root = tmp_path / "project-ai"
    docs_root.mkdir()
    created = client.post(
        "/api/projects",
        json={"name": "Project AI", "folderPath": str(docs_root), "icon": "folder", "iconColor": "#F37021"},
    )
    project_id = created.json()["id"]

    response = client.post(
        f"/api/projects/{project_id}/ai/prompt",
        json={"prompt": "Resume la documentación del proyecto"},
    )
    assert response.status_code == 200
    assert "no está configurada" in response.json()["answer"]


def test_ai_interaction_without_openai_key_returns_unavailable(tmp_path) -> None:
    docs_root = tmp_path / "project-ai-unavailable"
    docs_root.mkdir()
    created = client.post(
        "/api/projects",
        json={"name": "Project AI", "folderPath": str(docs_root), "icon": "folder", "iconColor": "#F37021"},
    )
    project_id = created.json()["id"]

    response = client.post(
        f"/api/projects/{project_id}/ai/interactions",
        json={
            "projectId": project_id,
            "prompt": "Resume el proyecto",
            "activeMarkdown": "",
            "mode": "project",
            "clientMessageId": "client-1",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "blocked"
    assert payload["operations"][0]["type"] == "provider_unavailable"
    assert client.get(f"/api/projects/{project_id}/ai/conversation").json()["events"]


def test_openai_key_status_does_not_expose_secret() -> None:
    saved = client.put("/api/credentials/openai-key", json={"apiKey": "sk-test-secret-1234"})
    assert saved.status_code == 200
    assert saved.json() == {"configured": True, "preview": "sk-...1234"}

    status = client.get("/api/credentials/openai-key")
    assert status.status_code == 200
    assert status.json() == {"configured": True, "preview": "sk-...1234"}
    assert "secret" not in str(status.json())

    deleted = client.delete("/api/credentials/openai-key")
    assert deleted.status_code == 204
    assert client.get("/api/credentials/openai-key").json() == {"configured": False, "preview": None}


def test_openai_key_rejects_invalid_values() -> None:
    empty = client.put("/api/credentials/openai-key", json={"apiKey": "   "})
    assert empty.status_code == 400

    invalid = client.put("/api/credentials/openai-key", json={"apiKey": "not-a-key"})
    assert invalid.status_code == 400
    assert client.get("/api/credentials/openai-key").json() == {"configured": False, "preview": None}


def test_ai_document_edit_returns_markdown_without_writing_disk(tmp_path, monkeypatch) -> None:
    from app.services.ai_service import openai_service

    docs_root = tmp_path / "ai-edit"
    docs_root.mkdir()
    document_path = docs_root / "doc.md"
    document_path.write_text("# Original\n", encoding="utf-8")
    created = client.post(
        "/api/projects",
        json={"name": "AI Edit", "folderPath": str(docs_root), "icon": "folder", "iconColor": "#F37021"},
    )
    project_id = created.json()["id"]
    document_id = client.get(f"/api/projects/{project_id}/tree").json()[0]["id"]
    client.put("/api/credentials/openai-key", json={"apiKey": "sk-test-secret-1234"})

    def fake_plan(payload, context, rag):
        return {
            "display": "conversation",
            "answer": None,
            "operations": [
                {
                    "type": "document_modified",
                    "name": None,
                    "parentPath": None,
                    "path": None,
                    "nodeId": None,
                    "markdown": None,
                    "updatedMarkdown": "# Updated\n",
                    "summary": "Título actualizado",
                }
            ],
        }

    monkeypatch.setattr(openai_service, "plan_interaction", fake_plan)

    response = client.post(
        f"/api/projects/{project_id}/ai/interactions",
        json={
            "projectId": project_id,
            "documentId": document_id,
            "prompt": "Actualiza el título",
            "activeMarkdown": "# Original\n",
            "mode": "document",
            "clientMessageId": "client-2",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["updatedDocument"]["markdown"] == "# Updated\n"
    assert payload["operations"][0]["type"] == "document_modified"
    assert document_path.read_text(encoding="utf-8") == "# Original\n"


def test_ai_create_document_respects_permissions(tmp_path, monkeypatch) -> None:
    from app.services.ai_service import openai_service

    docs_root = tmp_path / "ai-create"
    docs_root.mkdir()
    created = client.post(
        "/api/projects",
        json={"name": "AI Create", "folderPath": str(docs_root), "icon": "folder", "iconColor": "#F37021"},
    )
    project_id = created.json()["id"]
    client.put("/api/credentials/openai-key", json={"apiKey": "sk-test-secret-1234"})

    def fake_plan(payload, context, rag):
        return {
            "display": "conversation",
            "answer": None,
            "operations": [
                {
                    "type": "create_document",
                    "name": "generated.md",
                    "parentPath": None,
                    "path": "generated.md",
                    "nodeId": None,
                    "markdown": "# Generated\n",
                    "updatedMarkdown": None,
                    "summary": None,
                }
            ],
        }

    monkeypatch.setattr(openai_service, "plan_interaction", fake_plan)

    blocked = client.post(
        f"/api/projects/{project_id}/ai/interactions",
        json={"projectId": project_id, "prompt": "Crea un documento", "activeMarkdown": "", "mode": "project", "clientMessageId": "client-3"},
    )
    assert blocked.status_code == 200
    assert blocked.json()["operations"][0]["type"] == "permission_blocked"
    assert not (docs_root / "generated.md").exists()

    config = client.get("/api/config/ai").json()
    config["permissions"]["createDocuments"] = True
    client.put("/api/config/ai", json=config)
    created_doc = client.post(
        f"/api/projects/{project_id}/ai/interactions",
        json={"projectId": project_id, "prompt": "Crea un documento", "activeMarkdown": "", "mode": "project", "clientMessageId": "client-4"},
    )
    assert created_doc.status_code == 200
    assert created_doc.json()["operations"][0]["type"] == "document_created"
    assert (docs_root / "generated.md").read_text(encoding="utf-8") == "# Generated\n"


def test_ai_index_status_is_project_scoped(tmp_path, monkeypatch) -> None:
    from app.services.ai_service import openai_service

    first_root = tmp_path / "first-index"
    second_root = tmp_path / "second-index"
    first_root.mkdir()
    second_root.mkdir()
    (first_root / "one.md").write_text("# One\n", encoding="utf-8")
    (second_root / "two.md").write_text("# Two\n", encoding="utf-8")
    first = client.post("/api/projects", json={"name": "First", "folderPath": str(first_root), "icon": "folder", "iconColor": "#F37021"}).json()
    second = client.post("/api/projects", json={"name": "Second", "folderPath": str(second_root), "icon": "folder", "iconColor": "#F37021"}).json()
    client.put("/api/credentials/openai-key", json={"apiKey": "sk-test-secret-1234"})

    uploaded_paths: list[str] = []
    monkeypatch.setattr(openai_service, "create_vector_store", lambda project_id: f"vs-{project_id}")
    monkeypatch.setattr(
        openai_service,
        "upload_markdown_document",
        lambda vector_store_id, project_id, relative_path, content, attributes: uploaded_paths.append(relative_path)
        or {"openaiFileId": f"file-{relative_path}", "vectorStoreFileId": f"vsf-{relative_path}"},
    )
    monkeypatch.setattr(openai_service, "delete_vector_store_file", lambda vector_store_id, file_id: None)
    monkeypatch.setattr(openai_service, "delete_file", lambda file_id: None)
    monkeypatch.setattr(openai_service, "delete_vector_store", lambda vector_store_id: None)

    rebuilt = client.post(f"/api/projects/{first['id']}/ai/index/rebuild")
    assert rebuilt.status_code == 200
    assert rebuilt.json()["status"] == "updated"
    assert rebuilt.json()["vectorStoreId"] == f"vs-{first['id']}"
    assert rebuilt.json()["documentCount"] == 1
    assert rebuilt.json()["indexedDocumentCount"] == 1
    assert rebuilt.json()["localExactReady"] is True
    assert uploaded_paths == ["one.md"]

    rebuilt_again = client.post(f"/api/projects/{first['id']}/ai/index/rebuild")
    assert rebuilt_again.status_code == 200
    assert uploaded_paths == ["one.md"]

    first_status = client.get(f"/api/projects/{first['id']}/ai/index/status").json()
    second_status = client.get(f"/api/projects/{second['id']}/ai/index/status").json()
    assert first_status["vectorStoreId"] == f"vs-{first['id']}"
    assert second_status["vectorStoreId"] is None
    assert second_status["status"] == "not-indexed"


def test_ai_interaction_includes_local_exact_rag_matches(tmp_path, monkeypatch) -> None:
    from app.services.ai_service import openai_service

    docs_root = tmp_path / "rag-context"
    docs_root.mkdir()
    (docs_root / "adr.md").write_text("# ADR\n\nDecision keyword-zeta lives here.\n", encoding="utf-8")
    created = client.post(
        "/api/projects",
        json={"name": "RAG Context", "folderPath": str(docs_root), "icon": "folder", "iconColor": "#F37021"},
    )
    project_id = created.json()["id"]
    client.put("/api/credentials/openai-key", json={"apiKey": "sk-test-secret-1234"})
    config = client.get("/api/config/ai").json()
    config["rag"]["enabled"] = True
    client.put("/api/config/ai", json=config)

    monkeypatch.setattr(openai_service, "create_vector_store", lambda project_id: f"vs-{project_id}")
    monkeypatch.setattr(
        openai_service,
        "upload_markdown_document",
        lambda vector_store_id, project_id, relative_path, content, attributes: {"openaiFileId": "file-adr", "vectorStoreFileId": "vsf-adr"},
    )
    client.post(f"/api/projects/{project_id}/ai/index/rebuild")

    captured_context = {}

    def fake_plan(payload, context, rag):
        captured_context.update(context)
        return {"display": "bubble", "answer": "Encontrado en adr.md", "operations": []}

    monkeypatch.setattr(openai_service, "plan_interaction", fake_plan)

    response = client.post(
        f"/api/projects/{project_id}/ai/interactions",
        json={"projectId": project_id, "prompt": "Busca keyword-zeta", "activeMarkdown": "", "mode": "project", "clientMessageId": "client-rag"},
    )

    assert response.status_code == 200
    matches = captured_context["projectSearch"]["exactMatches"]
    assert matches[0]["path"] == "adr.md"
    assert "keyword-zeta" in matches[0]["snippet"]


def test_runtime_select_folder_returns_path(monkeypatch) -> None:
    from app.api.routes.runtime import runtime_service

    monkeypatch.setattr(runtime_service, "select_folder", lambda current_path: "C:\\Dev\\knownext.ai")

    response = client.post("/api/runtime/select-folder", json={"currentPath": "C:\\Dev"})

    assert response.status_code == 200
    assert response.json()["folderPath"] == "C:\\Dev\\knownext.ai"
