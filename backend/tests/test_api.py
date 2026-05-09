import json

import pytest
from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


@pytest.fixture(autouse=True)
def isolated_app_data(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("KNOWNEXT_APP_DATA_DIR", str(tmp_path))


def test_health() -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"
    assert response.json()["version"] == "0.4.0"


def test_projects_and_tree() -> None:
    projects = client.get("/api/projects")
    assert projects.status_code == 200
    assert projects.json()[0]["name"] == "Proyecto Alpha"

    tree = client.get("/api/projects/project-alpha/tree")
    assert tree.status_code == 200
    assert tree.json() == []


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
    created = client.post(
        "/api/projects",
        json={
            "name": "Proyecto Persistente",
            "folderPath": "C:\\Documentacion\\Persistente",
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
            "folderPath": "D:\\Docs\\Persistente",
            "icon": "book",
            "iconColor": "#D85A12",
        },
    )
    assert updated.status_code == 200
    assert updated.json()["folderPath"] == "D:\\Docs\\Persistente"

    projects_file = tmp_path / "projects.json"
    registry = json.loads(projects_file.read_text(encoding="utf-8"))
    persisted_project = next(project for project in registry["projects"] if project["id"] == project_id)
    assert persisted_project["name"] == "Proyecto Persistente Editado"
    assert registry["activeProjectId"] == project_id

    deleted = client.delete(f"/api/projects/{project_id}")
    assert deleted.status_code == 200
    assert all(project["id"] != project_id for project in deleted.json())

    registry_after_delete = json.loads(projects_file.read_text(encoding="utf-8"))
    assert all(project["id"] != project_id for project in registry_after_delete["projects"])
    assert registry_after_delete["activeProjectId"] != project_id


def test_config_writes_config_json(tmp_path) -> None:
    config = client.get("/api/config")
    assert config.status_code == 200
    assert config.json()["layout"]["sidebarWidth"] == 338
    assert config.json()["tabsByProject"]["project-alpha"]["activeDocumentId"] == "meeting-minutes"

    updated = client.put(
        "/api/config",
        json={
            "layout": {"sidebarWidth": 420, "historyWidth": 360},
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
    assert updated.json()["tabsByProject"]["project-alpha"]["openTabs"][0]["id"] == "decision-tech"

    config_file = tmp_path / "config.json"
    persisted_config = json.loads(config_file.read_text(encoding="utf-8"))
    assert persisted_config["layout"] == {"sidebarWidth": 420, "historyWidth": 360}
    assert persisted_config["tabsByProject"]["project-alpha"]["activeDocumentId"] == "decision-tech"


def test_invalid_config_file_is_backed_up(tmp_path) -> None:
    config_file = tmp_path / "config.json"
    config_file.write_text("{invalid json", encoding="utf-8")

    response = client.get("/api/config")

    assert response.status_code == 200
    assert response.json()["schemaVersion"] == 1
    assert config_file.exists()
    assert list(tmp_path.glob("config.json.corrupt-*"))


def test_document_save_and_versions() -> None:
    document = client.get("/api/documents/meeting-minutes")
    assert document.status_code == 200
    assert document.json()["name"] == "acta-reunion.md"

    saved = client.put("/api/documents/meeting-minutes", json={"markdown": "# Guardado\n\nContenido actualizado."})
    assert saved.status_code == 200
    assert saved.json()["wordCount"] == 4

    versions = client.get("/api/documents/meeting-minutes/versions")
    assert versions.status_code == 200
    assert versions.json()[0]["current"] is True


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


def test_ai_prompt() -> None:
    response = client.post(
        "/api/documents/meeting-minutes/ai/prompt",
        json={"prompt": "Resume acuerdos", "markdown": "# Documento"},
    )
    assert response.status_code == 200
    assert "Respuesta simulada" in response.json()["answer"]


def test_project_ai_prompt() -> None:
    response = client.post(
        "/api/projects/project-alpha/ai/prompt",
        json={"prompt": "Resume la documentación del proyecto"},
    )
    assert response.status_code == 200
    assert "documentación del proyecto project-alpha" in response.json()["answer"]


def test_runtime_select_folder_returns_path(monkeypatch) -> None:
    from app.api.routes.runtime import runtime_service

    monkeypatch.setattr(runtime_service, "select_folder", lambda current_path: "C:\\Dev\\knownext.ai")

    response = client.post("/api/runtime/select-folder", json={"currentPath": "C:\\Dev"})

    assert response.status_code == 200
    assert response.json()["folderPath"] == "C:\\Dev\\knownext.ai"
