import base64
import json
import os
from concurrent.futures import ThreadPoolExecutor
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.app_storage import JsonFileStore


client = TestClient(app)

TINY_PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII="
)


@pytest.fixture(autouse=True)
def isolated_app_data(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("KNOWNEXT_APP_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("APPDATA", str(tmp_path / "isolated-appdata"))
    monkeypatch.delenv("KNOWNEXT_GITHUB_CLIENT_ID", raising=False)


def _find_tree_node(nodes: list[dict], name: str) -> dict:
    for node in nodes or []:
        if node["name"] == name:
            return node
        child = _find_tree_node(node.get("children") or [], name)
        if child:
            return child
    return {}


def test_health() -> None:
    response = client.get("/health")
    assert response.status_code == 200
    payload = response.json()
    assert payload["app"] == "knownext"
    assert payload["schemaVersion"] == 2
    assert payload["status"] == "ok"
    assert payload["version"] == "0.16.2"
    assert payload["profile"] == "desktop"
    assert payload["port"] == 8765
    assert payload["managedBy"] == "manual"
    assert payload["instanceId"].startswith("backend-")
    assert payload["appDataDir"]


def test_projects_and_tree() -> None:
    projects = client.get("/api/projects")
    assert projects.status_code == 200
    assert projects.json() == []

    active = client.get("/api/projects/active")
    assert active.status_code == 404


def test_dev_browser_ports_are_allowed_by_cors() -> None:
    response = client.options(
        "/api/config/ai",
        headers={
            "Origin": "http://127.0.0.1:1421",
            "Access-Control-Request-Method": "PUT",
            "Access-Control-Request-Headers": "content-type",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://127.0.0.1:1421"


def test_ai_config_persists_selected_model() -> None:
    current = client.get("/api/config/ai")
    assert current.status_code == 200
    payload = current.json()
    assert payload["model"] == "gpt-5.4-mini"
    assert payload["agentic"]["depth"] == "guided"
    assert payload["agentic"]["webResearchEnabled"] is False

    payload["model"] = "gpt-5.5"
    payload["agentic"]["depth"] = "deep"
    payload["agentic"]["webResearchEnabled"] = True
    updated = client.put("/api/config/ai", json=payload)

    assert updated.status_code == 200
    assert updated.json()["model"] == "gpt-5.5"
    assert updated.json()["agentic"]["depth"] == "deep"
    assert updated.json()["agentic"]["webResearchEnabled"] is True
    assert client.get("/api/config/ai").json()["model"] == "gpt-5.5"


def test_app_config_persists_extended_underline_appearance_option() -> None:
    current = client.get("/api/config")
    assert current.status_code == 200
    payload = current.json()
    assert payload["appearance"]["markdownExtendedUnderlineEnabled"] is True

    payload["appearance"]["markdownExtendedUnderlineEnabled"] = False
    updated = client.put("/api/config", json={"appearance": payload["appearance"]})

    assert updated.status_code == 200
    assert updated.json()["appearance"]["markdownExtendedUnderlineEnabled"] is False
    assert client.get("/api/config").json()["appearance"]["markdownExtendedUnderlineEnabled"] is False


def test_json_file_store_handles_concurrent_writes(tmp_path) -> None:
    store = JsonFileStore("concurrent.json")

    def write_revision(index: int) -> None:
        store.write({"schemaVersion": 1, "revision": index})

    with ThreadPoolExecutor(max_workers=8) as executor:
        list(executor.map(write_revision, range(40)))

    persisted = json.loads((tmp_path / "concurrent.json").read_text(encoding="utf-8"))
    assert persisted["schemaVersion"] == 1
    assert isinstance(persisted["revision"], int)
    assert list(tmp_path.glob("concurrent.json.*.tmp")) == []


def test_seeded_mock_projects_are_ignored_and_recovered_from_backup(tmp_path) -> None:
    projects_file = tmp_path / "projects.json"
    projects_file.write_text(
        json.dumps(
            {
                "schemaVersion": 2,
                "activeProjectId": "project-alpha",
                "projects": [
                    {
                        "id": "project-alpha",
                        "name": "Proyecto Alpha",
                        "folderPath": "C:/Knowledge/Mind/Personal",
                        "icon": "book",
                        "iconColor": "#65A30D",
                        "storageMode": "local-files",
                        "versioningMode": "local-git",
                        "syncMode": "none",
                        "authRequired": True,
                        "githubRepository": None,
                        "isGitRepository": True,
                        "active": True,
                    },
                    {
                        "id": "project-beta",
                        "name": "Proyecto Beta",
                        "folderPath": "C:/Knowledge/Mind/Personal",
                        "icon": "boxes",
                        "iconColor": "#2563EB",
                        "storageMode": "local-files",
                        "versioningMode": "none",
                        "syncMode": "none",
                        "authRequired": False,
                        "githubRepository": None,
                        "isGitRepository": False,
                        "active": False,
                    },
                ],
            }
        ),
        encoding="utf-8",
    )
    (tmp_path / "projects.json.corrupt-20260511152707").write_text(
        json.dumps(
            {
                "schemaVersion": 2,
                "activeProjectId": "project-real",
                "projects": [
                    {
                        "id": "project-real",
                        "name": "LKS Next",
                        "folderPath": str(tmp_path / "LKS Next"),
                        "icon": "layers",
                        "iconColor": "#F37021",
                        "storageMode": "local-files",
                        "versioningMode": "local-git",
                        "syncMode": "manual-github",
                        "authRequired": True,
                        "githubRepository": {
                            "owner": "jormazabal",
                            "repo": "knownext-lksnext",
                            "defaultRef": None,
                            "rootPath": "",
                            "permissions": ["pull", "push"],
                        },
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
    assert [project["name"] for project in response.json()] == ["LKS Next"]
    persisted_registry = json.loads(projects_file.read_text(encoding="utf-8"))
    assert persisted_registry["activeProjectId"] == "project-real"


def test_seeded_mock_projects_are_removed_when_no_real_backup_exists(tmp_path) -> None:
    projects_file = tmp_path / "projects.json"
    projects_file.write_text(
        json.dumps(
            {
                "schemaVersion": 2,
                "activeProjectId": "project-alpha",
                "projects": [
                    {
                        "id": "project-alpha",
                        "name": "Proyecto Alpha",
                        "folderPath": "C:/Knowledge/Mind/Personal",
                        "icon": "book",
                        "iconColor": "#65A30D",
                        "storageMode": "local-files",
                        "versioningMode": "local-git",
                        "syncMode": "none",
                        "authRequired": True,
                        "githubRepository": None,
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
    assert response.json() == []
    persisted_registry = json.loads(projects_file.read_text(encoding="utf-8"))
    assert persisted_registry == {"schemaVersion": 2, "activeProjectId": None, "projects": []}


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


def test_external_changes_decode_git_quoted_utf8_paths() -> None:
    from app.services.external_changes_service import external_changes_service

    assert (
        external_changes_service._decode_git_path('"Facturaci\\303\\263n/Facturaciones.md"')
        == "Facturación/Facturaciones.md"
    )


def test_git_service_retries_transient_index_lock(tmp_path, monkeypatch) -> None:
    from app.services import git_service as git_service_module
    from app.services.git_service import git_service

    calls = 0

    def fake_run(*args, **kwargs):
        nonlocal calls
        calls += 1
        if calls == 1:
            return SimpleNamespace(
                returncode=128,
                stdout="",
                stderr="fatal: Unable to create '.git/index.lock': File exists. Another git process seems to be running in this repository.",
            )
        return SimpleNamespace(returncode=0, stdout="ok\n", stderr="")

    monkeypatch.setattr(git_service_module.subprocess, "run", fake_run)
    monkeypatch.setattr(git_service_module.time, "sleep", lambda _seconds: None)

    assert git_service._run(tmp_path, ["git", "status"]) == "ok\n"
    assert calls == 2


def test_external_changes_scan_classifies_and_imports_safe_git_changes(tmp_path) -> None:
    docs_root = tmp_path / "external-docs"
    docs_root.mkdir()
    (docs_root / "intro.md").write_text("# Intro\n", encoding="utf-8")

    device = client.post("/api/auth/github/device/start").json()
    client.post("/api/auth/github/device/poll", json={"deviceCode": device["deviceCode"]})
    created = client.post(
        "/api/projects",
        json={
            "name": "External Docs",
            "folderPath": str(docs_root),
            "icon": "folder",
            "iconColor": "#F37021",
            "storageMode": "local-files",
            "versioningMode": "local-git",
            "syncMode": "none",
        },
    )
    project_id = created.json()["id"]
    os.system(f'git -C "{docs_root}" add intro.md')
    os.system(f'git -C "{docs_root}" commit -m "Initial"')

    (docs_root / "Facturación").mkdir()
    (docs_root / "Facturación" / "Facturaciones.md").write_text("# Facturación\n", encoding="utf-8")
    (docs_root / ".env").write_text("SECRET=value\n", encoding="utf-8")

    scanned = client.post(f"/api/projects/{project_id}/external-changes/scan")
    assert scanned.status_code == 200
    payload = scanned.json()
    assert payload["summary"]["total"] >= 2
    assert payload["summary"]["safe"] >= 1
    assert payload["summary"]["blocked"] >= 1
    assert payload["requiresReview"] is True
    assert any(item["path"] == "Facturación/Facturaciones.md" and item["decision"] == "include" for item in payload["items"])
    assert any(item["path"] == ".env" and item["decision"] == "omit" for item in payload["items"])

    imported = client.post(
        f"/api/projects/{project_id}/external-changes/import",
        json={
            "syncRemote": False,
            "decisions": [
                {
                    "itemId": item["id"],
                    "decision": "include" if item["risk"] == "safe" else "omit",
                }
                for item in payload["items"]
            ],
        },
    )
    assert imported.status_code == 200
    assert imported.json()["status"] == "synced"
    assert _find_tree_node(imported.json()["tree"], "Facturaciones.md")["type"] == "document"
    assert ".env" not in os.popen(f'git -C "{docs_root}" ls-files').read()


def test_project_tree_imports_and_exposes_image_assets(tmp_path) -> None:
    docs_root = tmp_path / "docs-images"
    docs_root.mkdir()
    (docs_root / "intro.md").write_text("# Intro\n", encoding="utf-8")
    (docs_root / "diagram.png").write_bytes(TINY_PNG)

    created = client.post(
        "/api/projects",
        json={"name": "Docs con imagenes", "folderPath": str(docs_root), "icon": "folder", "iconColor": "#F37021"},
    )
    project_id = created.json()["id"]

    tree = client.get(f"/api/projects/{project_id}/tree").json()
    image_node = _find_tree_node(tree, "diagram.png")

    assert image_node["type"] == "image"
    assert image_node["mimeType"] == "image/png"
    assert image_node["sizeBytes"] > 0
    asset = client.get(f"/api/projects/{project_id}/assets/{image_node['id']}").json()
    assert asset["width"] == 1
    assert asset["height"] == 1
    assert asset["colorDepthBits"] is not None

    imported = client.post(
        f"/api/projects/{project_id}/assets/images",
        files={"file": ("screen.webp", TINY_PNG, "image/webp")},
    )

    assert imported.status_code == 200
    assert imported.json()["asset"]["name"] == "screen.webp"
    assert (docs_root / "screen.webp").exists()


def test_image_references_are_built_tracked_and_rewritten_when_image_moves(tmp_path) -> None:
    docs_root = tmp_path / "docs-image-references"
    docs_root.mkdir()
    (docs_root / "readme.md").write_text("# Readme\n\n![Diagram](./diagram.png)\n", encoding="utf-8")
    (docs_root / "diagram.png").write_bytes(TINY_PNG)

    created = client.post(
        "/api/projects",
        json={"name": "Referencias", "folderPath": str(docs_root), "icon": "folder", "iconColor": "#F37021"},
    )
    project_id = created.json()["id"]
    tree = client.get(f"/api/projects/{project_id}/tree").json()
    document_id = _find_tree_node(tree, "readme.md")["id"]
    image_id = _find_tree_node(tree, "diagram.png")["id"]

    reference = client.post(
        f"/api/projects/{project_id}/documents/{document_id}/image-reference",
        json={"assetId": image_id, "altText": "Arquitectura"},
    )
    assert reference.status_code == 200
    assert reference.json()["markdown"] == "![Arquitectura](./diagram.png)"

    usage = client.get(f"/api/projects/{project_id}/assets/{image_id}/usage")
    assert usage.status_code == 200
    assert usage.json()["references"][0]["documentPath"] == "readme.md"
    assert usage.json()["references"][0]["status"] == "valid"

    folder = client.post(f"/api/projects/{project_id}/folders", json={"parentId": None, "name": "Media"}).json()["node"]
    moved = client.patch(f"/api/projects/{project_id}/nodes/{image_id}/move", json={"targetFolderId": folder["id"]})
    assert moved.status_code == 200

    updated_tree = moved.json()["tree"]
    moved_image_id = _find_tree_node(updated_tree, "diagram.png")["id"]
    updated_document = client.get(f"/api/documents/{document_id}").json()
    assert "![Diagram](Media/diagram.png)" in updated_document["markdown"]

    moved_usage = client.get(f"/api/projects/{project_id}/assets/{moved_image_id}/usage").json()
    assert moved_usage["references"][0]["resolvedAssetPath"] == "Media/diagram.png"


def test_image_references_preserve_asset_paths_with_spaces(tmp_path) -> None:
    docs_root = tmp_path / "docs-image-references-with-spaces"
    docs_root.mkdir()
    image_name = "ChatGPT Image 4 may 2026, 22_18_18.png"
    (docs_root / "scope.md").write_text(f"# Scope\n\n![0.53](./{image_name})\n", encoding="utf-8")
    (docs_root / image_name).write_bytes(TINY_PNG)

    created = client.post(
        "/api/projects",
        json={"name": "Referencias con espacios", "folderPath": str(docs_root), "icon": "folder", "iconColor": "#F37021"},
    )
    project_id = created.json()["id"]
    tree = client.get(f"/api/projects/{project_id}/tree").json()
    document_id = _find_tree_node(tree, "scope.md")["id"]
    image_id = _find_tree_node(tree, image_name)["id"]

    reference = client.post(
        f"/api/projects/{project_id}/documents/{document_id}/image-reference",
        json={"assetId": image_id, "altText": "0.53"},
    )
    assert reference.status_code == 200
    assert reference.json()["markdown"] == f"![0.53](<./{image_name}>)"

    usage = client.get(f"/api/projects/{project_id}/assets/{image_id}/usage")
    assert usage.status_code == 200
    assert usage.json()["references"][0]["status"] == "valid"
    assert usage.json()["references"][0]["resolvedAssetPath"] == image_name


def test_document_move_impact_and_move_preserve_image_links(tmp_path) -> None:
    docs_root = tmp_path / "docs-document-move"
    docs_root.mkdir()
    (docs_root / "Assets").mkdir()
    (docs_root / "Assets" / "flow.png").write_bytes(TINY_PNG)
    (docs_root / "guide.md").write_text("# Guide\n\n![Flow](Assets/flow.png)\n", encoding="utf-8")

    created = client.post(
        "/api/projects",
        json={"name": "Mover docs", "folderPath": str(docs_root), "icon": "folder", "iconColor": "#F37021"},
    )
    project_id = created.json()["id"]
    tree = client.get(f"/api/projects/{project_id}/tree").json()
    document_id = _find_tree_node(tree, "guide.md")["id"]

    impact = client.get(f"/api/projects/{project_id}/documents/{document_id}/move-impact")
    assert impact.status_code == 200
    assert impact.json()["references"][0]["resolvedAssetPath"] == "Assets/flow.png"

    destination = client.post(f"/api/projects/{project_id}/folders", json={"parentId": None, "name": "Docs"}).json()["node"]
    moved = client.patch(f"/api/projects/{project_id}/nodes/{document_id}/move", json={"targetFolderId": destination["id"]})
    assert moved.status_code == 200
    moved_document_id = moved.json()["affectedDocuments"][0]["newId"]
    moved_document = client.get(f"/api/documents/{moved_document_id}").json()
    assert "![Flow](../Assets/flow.png)" in moved_document["markdown"]


def test_visual_image_reindex_uses_configured_vision_model(tmp_path, monkeypatch) -> None:
    from app.services.asset_service import asset_service
    from app.services.openai_service import openai_service

    docs_root = tmp_path / "docs-vision"
    docs_root.mkdir()
    (docs_root / "screen.png").write_bytes(TINY_PNG)
    created = client.post(
        "/api/projects",
        json={"name": "Vision", "folderPath": str(docs_root), "icon": "folder", "iconColor": "#F37021"},
    )
    project_id = created.json()["id"]
    config = client.get("/api/config/ai").json()
    config["vision"]["imageIndexingEnabled"] = True
    config["vision"]["model"] = "gpt-5.4"
    config["vision"]["detail"] = "low"
    client.put("/api/config/ai", json=config)

    calls: list[dict[str, str | bool]] = []

    def fake_describe(image_data_url: str, prompt: str, model: str, detail: str) -> str:
        calls.append({"model": model, "detail": detail, "image": image_data_url.startswith("data:image/png;base64,"), "prompt": prompt[:20]})
        return "Captura de pantalla de prueba."

    monkeypatch.setattr(openai_service, "describe_image", fake_describe)
    result = asset_service.reindex_visual_assets(project_id)

    assert result["indexedImageCount"] == 1
    assert calls == [{"model": "gpt-5.4", "detail": "low", "image": True, "prompt": "Describe esta imagen"}]
    tree = client.get(f"/api/projects/{project_id}/tree").json()
    image_id = _find_tree_node(tree, "screen.png")["id"]
    metadata = client.get(f"/api/projects/{project_id}/assets/{image_id}").json()
    assert metadata["indexed"] is True
    assert metadata["visualDescription"] == "Captura de pantalla de prueba."
    summary = client.get("/api/ai/usage/summary?tzOffsetMinutes=120").json()
    vision_summary = next(capability for capability in summary["capabilities"] if capability["capability"] == "vision")
    assert vision_summary["interactions"] == 1
    assert vision_summary["totalTokens"] > 0
    assert any(model["model"] == "gpt-5.4" for model in summary["models"])


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


def test_project_creation_uses_managed_storage_when_folder_path_is_empty(tmp_path) -> None:
    created = client.post(
        "/api/projects",
        json={
            "name": "Proyecto Web",
            "folderPath": "",
            "icon": "folder",
            "iconColor": "#F37021",
            "creationMode": "new-local",
            "storageMode": "local-files",
            "versioningMode": "none",
            "syncMode": "none",
        },
    )

    assert created.status_code == 201
    project = created.json()
    assert project["folderPath"].startswith(str(tmp_path / "projects"))
    assert (tmp_path / "projects" / project["id"]).is_dir()


def test_existing_project_with_empty_folder_path_is_migrated_to_managed_storage(tmp_path) -> None:
    projects_file = tmp_path / "projects.json"
    projects_file.write_text(
        json.dumps(
            {
                "schemaVersion": 2,
                "activeProjectId": "project-web",
                "projects": [
                    {
                        "id": "project-web",
                        "name": "Proyecto Web",
                        "folderPath": "",
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

    projects = client.get("/api/projects")
    assert projects.status_code == 200
    project = projects.json()[0]
    assert project["folderPath"] == str(tmp_path / "projects" / "project-web")
    assert (tmp_path / "projects" / "project-web").is_dir()

    tree = client.get("/api/projects/project-web/tree")
    assert tree.status_code == 200
    assert tree.json() == []


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
    assert config.json()["appearance"] == {
        "language": "es",
        "zoomPercent": 100,
        "markdownExtendedUnderlineEnabled": True,
        "themeMode": "system",
        "primaryColor": "orange",
    }
    assert config.json()["diagnostics"] == {"traceLoggingEnabled": False}
    assert config.json()["tabsByProject"] == {}

    updated = client.put(
        "/api/config",
        json={
            "layout": {"sidebarWidth": 420, "historyWidth": 360},
            "appearance": {
                "language": "en",
                "zoomPercent": 115,
                "markdownExtendedUnderlineEnabled": False,
                "themeMode": "dark",
                "primaryColor": "green",
            },
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
    assert updated.json()["appearance"] == {
        "language": "en",
        "zoomPercent": 115,
        "markdownExtendedUnderlineEnabled": False,
        "themeMode": "dark",
        "primaryColor": "green",
    }
    assert updated.json()["diagnostics"] == {"traceLoggingEnabled": True}
    assert updated.json()["tabsByProject"]["project-alpha"]["openTabs"][0]["id"] == "decision-tech"

    config_file = tmp_path / "config.json"
    persisted_config = json.loads(config_file.read_text(encoding="utf-8"))
    assert persisted_config["layout"] == {"sidebarWidth": 420, "historyWidth": 360}
    assert persisted_config["appearance"] == {
        "language": "en",
        "zoomPercent": 115,
        "markdownExtendedUnderlineEnabled": False,
        "themeMode": "dark",
        "primaryColor": "green",
    }
    assert persisted_config["diagnostics"] == {"traceLoggingEnabled": True}
    assert persisted_config["tabsByProject"]["project-alpha"]["activeDocumentId"] == "decision-tech"


def test_realtime_whisper_session_update_omits_turn_detection() -> None:
    from app.services.transcription_service import _build_session_update

    session_update = _build_session_update("gpt-realtime-whisper", "es")
    audio_input = session_update["session"]["audio"]["input"]

    assert audio_input["transcription"] == {"model": "gpt-realtime-whisper", "language": "es"}
    assert "turn_detection" not in audio_input


def test_realtime_whisper_session_update_omits_auto_language_hint() -> None:
    from app.services.transcription_service import _build_session_update

    session_update = _build_session_update("gpt-realtime-whisper", "auto")

    assert session_update["session"]["audio"]["input"]["transcription"] == {"model": "gpt-realtime-whisper"}


def test_realtime_transcription_completed_event_records_usage() -> None:
    import asyncio

    from app.services.transcription_service import transcription_service

    class FakeClientWebSocket:
        def __init__(self) -> None:
            self.messages: list[dict] = []

        async def send_json(self, payload: dict) -> None:
            self.messages.append(payload)

    class FakeOpenAiWebSocket:
        def __init__(self) -> None:
            self.events = [
                json.dumps(
                    {
                        "type": "conversation.item.input_audio_transcription.completed",
                        "item_id": "audio-1",
                        "transcript": "Texto transcrito para medir uso de audio.",
                    }
                )
            ]

        async def recv(self) -> str:
            if self.events:
                return self.events.pop(0)
            raise RuntimeError("closed")

    async def run_forwarder() -> FakeClientWebSocket:
        websocket = FakeClientWebSocket()
        stop_event = asyncio.Event()
        await transcription_service._forward_openai_events(
            websocket,
            FakeOpenAiWebSocket(),
            stop_event,
            "project-audio",
            None,
            "gpt-realtime-whisper",
        )
        return websocket

    websocket = asyncio.run(run_forwarder())

    assert websocket.messages[0]["type"] == "completed"
    summary = client.get("/api/ai/usage/summary?tzOffsetMinutes=120").json()
    audio_summary = next(capability for capability in summary["capabilities"] if capability["capability"] == "audio")
    assert audio_summary["interactions"] == 1
    assert audio_summary["outputTokens"] > 0
    assert any(model["model"] == "gpt-realtime-whisper" for model in summary["models"])


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


def test_ai_context_project_document_source_is_resolved_and_traced(tmp_path) -> None:
    docs_root = tmp_path / "project-ai-context"
    docs_root.mkdir()
    (docs_root / "scope.md").write_text("# Scope\n\nContexto interno.", encoding="utf-8")
    created = client.post(
        "/api/projects",
        json={"name": "Project AI Context", "folderPath": str(docs_root), "icon": "folder", "iconColor": "#F37021"},
    )
    project_id = created.json()["id"]
    document_id = client.get(f"/api/projects/{project_id}/tree").json()[0]["id"]

    search = client.get(f"/api/projects/{project_id}/ai/context/search?q=scop")
    assert search.status_code == 200
    assert search.json()[0]["path"] == "scope.md"

    source = client.post(
        f"/api/projects/{project_id}/ai/context/project-documents",
        json={"documentId": document_id},
    )
    assert source.status_code == 200
    source_payload = source.json()
    assert source_payload["kind"] == "project_document"
    assert source_payload["status"] == "ready"
    assert source_payload["expiresAt"]

    response = client.post(
        f"/api/projects/{project_id}/ai/interactions",
        json={
            "projectId": project_id,
            "prompt": "Usa la fuente",
            "activeMarkdown": "",
            "mode": "project",
            "clientMessageId": "client-context",
            "contextSourceIds": [source_payload["id"]],
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["conversationEvents"][0]["sourcesUsed"][0]["name"] == "scope.md"
    assert payload["contextSources"][0]["lastUsedAt"]


def test_ai_context_external_markdown_preview_and_add_to_project(tmp_path) -> None:
    docs_root = tmp_path / "project-ai-context-external"
    docs_root.mkdir()
    created = client.post(
        "/api/projects",
        json={"name": "Project AI External", "folderPath": str(docs_root), "icon": "folder", "iconColor": "#F37021"},
    )
    project_id = created.json()["id"]

    uploaded = client.post(
        f"/api/projects/{project_id}/ai/context/files",
        files={"files": ("brief.md", b"# Brief\n\nTexto externo para IA.", "text/markdown")},
    )
    assert uploaded.status_code == 200
    source = uploaded.json()["sources"][0]
    assert source["kind"] == "external_file"
    assert source["status"] == "ready"

    preview = client.get(f"/api/projects/{project_id}/ai/context/sources/{source['id']}/preview")
    assert preview.status_code == 200
    assert "Texto externo" in preview.json()["previewText"]

    added = client.post(
        f"/api/projects/{project_id}/ai/context/sources/{source['id']}/add-to-project",
        json={"name": "brief-extraido.md", "parentId": None},
    )
    assert added.status_code == 200
    assert added.json()["path"] == "brief-extraido.md"
    assert (docs_root / "brief-extraido.md").exists()


def test_ai_usage_summary_starts_empty() -> None:
    response = client.get("/api/ai/usage/summary?month=2026-05&tzOffsetMinutes=120")

    assert response.status_code == 200
    payload = response.json()
    assert payload["month"] == "2026-05"
    assert payload["currency"] == "EUR"
    assert payload["estimated"] is True
    assert payload["totalEstimatedCost"] == 0
    assert [capability["capability"] for capability in payload["capabilities"]] == [
        "document_ai",
        "image_generation",
        "vision",
        "audio",
        "agentic_tasks",
    ]
    assert all(capability["interactions"] == 0 for capability in payload["capabilities"])
    assert payload["models"] == []


def test_ai_interaction_records_provider_usage_summary(tmp_path, monkeypatch) -> None:
    from app.services.ai_service import openai_service

    docs_root = tmp_path / "ai-usage"
    docs_root.mkdir()
    (docs_root / "usage.md").write_text("# Usage\n", encoding="utf-8")
    created = client.post(
        "/api/projects",
        json={"name": "AI Usage", "folderPath": str(docs_root), "icon": "folder", "iconColor": "#F37021"},
    )
    project_id = created.json()["id"]
    document_id = client.get(f"/api/projects/{project_id}/tree").json()[0]["id"]
    client.put("/api/credentials/openai-key", json={"apiKey": "sk-test-secret-1234"})

    def fake_plan(payload, context, rag, model=None):
        return {
            "display": "bubble",
            "answer": "Respuesta medida",
            "operations": [],
            "__openaiUsage": {
                "inputTokens": 1000,
                "cachedInputTokens": 200,
                "outputTokens": 500,
                "reasoningTokens": 50,
                "embeddingTokens": 0,
                "totalTokens": 1500,
                "usageSource": "provider",
            },
        }

    monkeypatch.setattr(openai_service, "plan_interaction", fake_plan)

    response = client.post(
        f"/api/projects/{project_id}/ai/interactions",
        json={
            "projectId": project_id,
            "documentId": document_id,
            "prompt": "Resume",
            "activeMarkdown": "# Usage\n",
            "mode": "document",
            "clientMessageId": "client-usage",
        },
    )

    assert response.status_code == 200
    summary = client.get("/api/ai/usage/summary?tzOffsetMinutes=120").json()
    model_summary = summary["models"][0]
    assert model_summary["model"] == "gpt-5.4-mini"
    assert model_summary["interactions"] == 1
    assert model_summary["inputTokens"] == 1000
    assert model_summary["cachedInputTokens"] == 200
    assert model_summary["outputTokens"] == 500
    assert model_summary["reasoningTokens"] == 50
    assert model_summary["totalTokens"] == 1500
    assert model_summary["usageSource"] == "provider"
    assert model_summary["estimatedCost"] > 0
    assert summary["totalEstimatedCost"] == model_summary["estimatedCost"]
    capability_summary = summary["capabilities"][0]
    assert capability_summary["capability"] == "document_ai"
    assert capability_summary["interactions"] == 1
    assert capability_summary["totalTokens"] == 1500
    assert capability_summary["estimatedCost"] == model_summary["estimatedCost"]


def test_ai_usage_summary_includes_legacy_generated_image_metadata(tmp_path) -> None:
    generated_dir = tmp_path / "ai-generated-images"
    generated_dir.mkdir()
    (generated_dir / "project-legacy-images.json").write_text(
        json.dumps(
            {
                "schemaVersion": 1,
                "images": [
                    {
                        "path": "gato-tocando-la-bateria.png",
                        "updatedAt": "2026-05-16T17:37:55.654799+00:00",
                        "kind": "ai_generated_image",
                        "prompt": "Un gato tocando la batería.",
                        "model": "gpt-image-2",
                        "size": "auto",
                        "quality": "auto",
                        "format": "png",
                    }
                ],
            }
        ),
        encoding="utf-8",
    )

    summary = client.get("/api/ai/usage/summary?month=2026-05&tzOffsetMinutes=120").json()
    image_summary = next(capability for capability in summary["capabilities"] if capability["capability"] == "image_generation")

    assert image_summary["interactions"] == 1
    assert image_summary["usageSource"] == "estimated"
    assert image_summary["estimatedCost"] > 0
    assert summary["models"][0]["model"] == "gpt-image-2"


def test_ai_generates_project_image_asset_from_prompt(tmp_path, monkeypatch) -> None:
    from app.services.ai_service import openai_service

    docs_root = tmp_path / "ai-generated-image"
    docs_root.mkdir()
    (docs_root / "visual.md").write_text("# Visual\n\nTexto base.\n", encoding="utf-8")
    created = client.post(
        "/api/projects",
        json={"name": "AI Image", "folderPath": str(docs_root), "icon": "folder", "iconColor": "#F37021"},
    )
    project_id = created.json()["id"]
    document_id = client.get(f"/api/projects/{project_id}/tree").json()[0]["id"]
    client.put("/api/credentials/openai-key", json={"apiKey": "sk-test-secret-1234"})

    def fake_plan(payload, context, rag, model=None):
        return {
            "display": "bubble",
            "uiPlacement": "document_bubble",
            "interactionType": "image_generation",
            "confidence": "high",
            "executionScope": "direct_action",
            "intentDecision": "execute_now",
            "routeToAiTab": False,
            "needsUserClarification": False,
            "answer": "He creado la imagen.",
            "pendingIntent": None,
            "documentChange": None,
            "imageGeneration": {
                "intent": "generate_image_asset",
                "prompt": "Infografía compacta sobre el texto seleccionado.",
                "altText": "Infografía del texto seleccionado",
                "filename": "infografia-visual.png",
                "insertIntoDocument": False,
                "targetDocumentId": None,
                "placement": "after_selection",
                "model": None,
                "size": None,
                "quality": None,
                "format": "png",
            },
            "task": None,
            "operations": [],
        }

    def fake_generate_image(**kwargs):
        return {"bytes": TINY_PNG, "revisedPrompt": "Infografía revisada.", "model": kwargs["model"], "size": kwargs["size"], "quality": kwargs["quality"], "format": kwargs["output_format"]}

    monkeypatch.setattr(openai_service, "plan_interaction", fake_plan)
    monkeypatch.setattr(openai_service, "generate_image", fake_generate_image)

    response = client.post(
        f"/api/projects/{project_id}/ai/interactions",
        json={
            "projectId": project_id,
            "documentId": document_id,
            "prompt": "Haz algo visual con esto",
            "activeMarkdown": "# Visual\n\nTexto base.\n",
            "mode": "document",
            "clientMessageId": "client-image",
            "selectionFocus": {"documentId": document_id, "path": "visual.md", "from": 10, "to": 21, "text": "Texto base."},
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["interactionType"] == "image_generation"
    assert payload["generatedImages"][0]["asset"]["name"] == "infografia-visual.png"
    assert payload["generatedImages"][0]["insertedIntoDocumentId"] is None
    assert any(operation["type"] == "image_generated" for operation in payload["operations"])
    assert (docs_root / "infografia-visual.png").exists()
    summary = client.get("/api/ai/usage/summary?tzOffsetMinutes=120").json()
    image_summary = next(capability for capability in summary["capabilities"] if capability["capability"] == "image_generation")
    assert image_summary["interactions"] == 1
    assert image_summary["estimatedCost"] > 0
    assert any(model["model"] == "gpt-image-2" for model in summary["models"])


def test_ai_generates_project_image_asset_in_custom_folder(tmp_path, monkeypatch) -> None:
    from app.services.ai_service import openai_service

    docs_root = tmp_path / "ai-generated-image-custom-folder"
    docs_root.mkdir()
    (docs_root / "visual.md").write_text("# Visual\n\nTexto base.\n", encoding="utf-8")
    created = client.post(
        "/api/projects",
        json={"name": "AI Image Custom Folder", "folderPath": str(docs_root), "icon": "folder", "iconColor": "#F37021"},
    )
    project_id = created.json()["id"]
    document_id = client.get(f"/api/projects/{project_id}/tree").json()[0]["id"]
    client.put("/api/credentials/openai-key", json={"apiKey": "sk-test-secret-1234"})
    config = client.get("/api/config/ai").json()
    config["imageGeneration"]["defaultFolder"] = "custom_folder"
    config["imageGeneration"]["customFolderPath"] = "assets/infografias"
    updated_config = client.put("/api/config/ai", json=config)
    assert updated_config.status_code == 200

    def fake_plan(payload, context, rag, model=None):
        return {
            "display": "bubble",
            "uiPlacement": "document_bubble",
            "interactionType": "image_generation",
            "confidence": "high",
            "executionScope": "direct_action",
            "intentDecision": "execute_now",
            "routeToAiTab": False,
            "needsUserClarification": False,
            "answer": "He creado la imagen.",
            "pendingIntent": None,
            "documentChange": None,
            "imageGeneration": {
                "intent": "generate_image_asset",
                "prompt": "Infografía compacta sobre el texto seleccionado.",
                "altText": "Infografía del texto seleccionado",
                "filename": "infografia-visual.png",
                "insertIntoDocument": False,
                "targetDocumentId": None,
                "placement": "after_selection",
                "model": None,
                "size": None,
                "quality": None,
                "format": "png",
            },
            "task": None,
            "operations": [],
        }

    def fake_generate_image(**kwargs):
        return {"bytes": TINY_PNG, "revisedPrompt": "Infografía revisada.", "model": kwargs["model"], "size": kwargs["size"], "quality": kwargs["quality"], "format": kwargs["output_format"]}

    monkeypatch.setattr(openai_service, "plan_interaction", fake_plan)
    monkeypatch.setattr(openai_service, "generate_image", fake_generate_image)

    response = client.post(
        f"/api/projects/{project_id}/ai/interactions",
        json={
            "projectId": project_id,
            "documentId": document_id,
            "prompt": "Haz algo visual con esto",
            "activeMarkdown": "# Visual\n\nTexto base.\n",
            "mode": "document",
            "clientMessageId": "client-image-custom-folder",
            "selectionFocus": {"documentId": document_id, "path": "visual.md", "from": 10, "to": 21, "text": "Texto base."},
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["generatedImages"][0]["asset"]["path"] == "assets/infografias/infografia-visual.png"
    assert (docs_root / "assets" / "infografias" / "infografia-visual.png").exists()
    def flatten_paths(nodes):
        paths = set()
        for node in nodes:
            paths.add(node["path"])
            paths.update(flatten_paths(node.get("children") or []))
        return paths

    tree_paths = flatten_paths(client.get(f"/api/projects/{project_id}/tree").json())
    assert "assets" in tree_paths
    assert "assets/infografias" in tree_paths


def test_ai_generates_and_inserts_project_image_reference(tmp_path, monkeypatch) -> None:
    from app.services.ai_service import openai_service

    docs_root = tmp_path / "ai-insert-generated-image"
    docs_root.mkdir()
    markdown = "# Proceso\n\nTexto importante.\n\nFin\n"
    (docs_root / "proceso.md").write_text(markdown, encoding="utf-8")
    created = client.post(
        "/api/projects",
        json={"name": "AI Insert Image", "folderPath": str(docs_root), "icon": "folder", "iconColor": "#F37021"},
    )
    project_id = created.json()["id"]
    document_id = client.get(f"/api/projects/{project_id}/tree").json()[0]["id"]
    client.put("/api/credentials/openai-key", json={"apiKey": "sk-test-secret-1234"})

    def fake_plan(payload, context, rag, model=None):
        return {
            "display": "bubble",
            "uiPlacement": "document_bubble",
            "interactionType": "image_generation",
            "confidence": "high",
            "executionScope": "direct_action",
            "intentDecision": "execute_now",
            "routeToAiTab": False,
            "needsUserClarification": False,
            "answer": "He creado e insertado la imagen.",
            "pendingIntent": None,
            "documentChange": None,
            "imageGeneration": {
                "intent": "generate_and_insert_image",
                "prompt": "Infografía para explicar Texto importante.",
                "altText": "Infografía del proceso",
                "filename": "infografia-proceso.png",
                "insertIntoDocument": True,
                "targetDocumentId": document_id,
                "placement": "after_selection",
                "model": None,
                "size": None,
                "quality": None,
                "format": "png",
            },
            "task": None,
            "operations": [],
        }

    monkeypatch.setattr(openai_service, "plan_interaction", fake_plan)
    monkeypatch.setattr(openai_service, "generate_image", lambda **kwargs: {"bytes": TINY_PNG, "revisedPrompt": None, "model": kwargs["model"], "size": kwargs["size"], "quality": kwargs["quality"], "format": kwargs["output_format"]})

    response = client.post(
        f"/api/projects/{project_id}/ai/interactions",
        json={
            "projectId": project_id,
            "documentId": document_id,
            "prompt": "Crea una infografía y ponla aquí",
            "activeMarkdown": markdown,
            "mode": "document",
            "clientMessageId": "client-insert-image",
            "selectionFocus": {"documentId": document_id, "path": "proceso.md", "from": 11, "to": 28, "text": "Texto importante."},
        },
    )

    assert response.status_code == 200
    payload = response.json()
    updated = payload["updatedDocument"]
    assert updated["documentId"] == document_id
    assert "Texto importante.\n\n![Infografía del proceso](./infografia-proceso.png)" in updated["markdown"]
    assert payload["generatedImages"][0]["insertedIntoDocumentId"] == document_id
    assert payload["generatedImages"][0]["markdownReference"] == "![Infografía del proceso](./infografia-proceso.png)"
    assert any(operation["type"] == "image_inserted" for operation in payload["operations"])
    assert (docs_root / "infografia-proceso.png").exists()


def test_ai_index_status_returns_project_rag_status(tmp_path) -> None:
    docs_root = tmp_path / "project-ai-index-status"
    docs_root.mkdir()
    created = client.post(
        "/api/projects",
        json={"name": "Project AI Index", "folderPath": str(docs_root), "icon": "folder", "iconColor": "#F37021"},
    )
    project_id = created.json()["id"]

    response = client.get(f"/api/projects/{project_id}/ai/index/status")

    assert response.status_code == 200
    payload = response.json()
    assert payload["projectId"] == project_id
    assert payload["enabled"] is False
    assert payload["status"] == "not-indexed"
    assert payload["vectorStoreId"] is None


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
    config = client.get("/api/config/ai").json()
    config["model"] = "gpt-5.5"
    client.put("/api/config/ai", json=config)
    captured_model = None

    def fake_plan(payload, context, rag, model=None):
        nonlocal captured_model
        captured_model = model
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
    assert captured_model == "gpt-5.5"
    assert document_path.read_text(encoding="utf-8") == "# Original\n"


def test_ai_context_includes_active_document_folder_for_related_documents(tmp_path, monkeypatch) -> None:
    from app.services.ai_service import openai_service

    docs_root = tmp_path / "ai-active-folder"
    docs_root.mkdir()
    nested = docs_root / "guias" / "producto"
    nested.mkdir(parents=True)
    (nested / "base.md").write_text("# Base\n", encoding="utf-8")
    created = client.post(
        "/api/projects",
        json={"name": "AI Active Folder", "folderPath": str(docs_root), "icon": "folder", "iconColor": "#F37021"},
    )
    project_id = created.json()["id"]

    def flatten(nodes):
        for node in nodes:
            yield node
            yield from flatten(node.get("children", []))

    tree = client.get(f"/api/projects/{project_id}/tree").json()
    document_id = next(node["id"] for node in flatten(tree) if node["name"] == "base.md")
    client.put("/api/credentials/openai-key", json={"apiKey": "sk-test-secret-1234"})
    captured_context: dict | None = None

    def fake_plan(payload, context, rag, model=None):
        nonlocal captured_context
        captured_context = context
        return {
            "display": "conversation",
            "answer": None,
            "operations": [
                {
                    "type": "create_document",
                    "name": "relacionado.md",
                    "parentPath": context["activeDocumentFolder"]["path"],
                    "path": None,
                    "nodeId": None,
                    "markdown": "# Relacionado\n",
                    "updatedMarkdown": None,
                    "summary": None,
                }
            ],
        }

    monkeypatch.setattr(openai_service, "plan_interaction", fake_plan)
    config = client.get("/api/config/ai").json()
    config["permissions"]["createDocuments"] = True
    client.put("/api/config/ai", json=config)

    response = client.post(
        f"/api/projects/{project_id}/ai/interactions",
        json={
            "projectId": project_id,
            "documentId": document_id,
            "prompt": "Crea otro documento relacionado",
            "activeMarkdown": "# Base\n",
            "mode": "document",
            "clientMessageId": "client-active-folder",
        },
    )

    assert response.status_code == 200
    assert captured_context is not None
    assert captured_context["activeDocument"]["path"] == "guias/producto/base.md"
    assert captured_context["activeDocumentFolder"]["path"] == "guias/producto"
    assert captured_context["activeDocumentFolder"]["name"] == "producto"
    assert captured_context["activeDocumentFolder"]["id"]
    assert (nested / "relacionado.md").read_text(encoding="utf-8") == "# Relacionado\n"


def test_ai_answer_only_never_updates_active_document(tmp_path, monkeypatch) -> None:
    from app.services.ai_service import openai_service

    docs_root = tmp_path / "ai-writing-fallback"
    docs_root.mkdir()
    document_path = docs_root / "recipe.md"
    document_path.write_text("# Borrador\n", encoding="utf-8")
    created = client.post(
        "/api/projects",
        json={"name": "AI Writing", "folderPath": str(docs_root), "icon": "folder", "iconColor": "#F37021"},
    )
    project_id = created.json()["id"]
    document_id = client.get(f"/api/projects/{project_id}/tree").json()[0]["id"]
    client.put("/api/credentials/openai-key", json={"apiKey": "sk-test-secret-1234"})

    def fake_plan(payload, context, rag, model=None):
        return {
            "display": "bubble",
            "answer": "# Receta de cocina\n\n## Ingredientes\n\n- Tomate\n- Aceite\n",
            "operations": [],
        }

    monkeypatch.setattr(openai_service, "plan_interaction", fake_plan)

    response = client.post(
        f"/api/projects/{project_id}/ai/interactions",
        json={
            "projectId": project_id,
            "documentId": document_id,
            "prompt": "Redacta una receta de cocina",
            "activeMarkdown": "# Borrador\n",
            "mode": "document",
            "clientMessageId": "client-writing",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["updatedDocument"] is None
    assert payload["operations"] == []
    assert payload["answer"].startswith("# Receta de cocina")
    assert payload["interactionType"] == "chat"
    assert document_path.read_text(encoding="utf-8") == "# Borrador\n"


def test_ai_document_change_contract_updates_active_document_without_writing_disk(tmp_path, monkeypatch) -> None:
    from app.services.ai_service import openai_service

    docs_root = tmp_path / "ai-document-change-contract"
    docs_root.mkdir()
    document_path = docs_root / "contract.md"
    document_path.write_text("# Borrador\n", encoding="utf-8")
    created = client.post(
        "/api/projects",
        json={"name": "AI Contract", "folderPath": str(docs_root), "icon": "folder", "iconColor": "#F37021"},
    )
    project_id = created.json()["id"]
    document_id = client.get(f"/api/projects/{project_id}/tree").json()[0]["id"]
    client.put("/api/credentials/openai-key", json={"apiKey": "sk-test-secret-1234"})

    def fake_plan(payload, context, rag, model=None):
        return {
            "display": "conversation",
            "interactionType": "document_edit",
            "confidence": "high",
            "routeToAiTab": False,
            "needsUserClarification": False,
            "answer": "He actualizado el documento.",
            "documentChange": {
                "updatedMarkdown": "# Receta de cocina\n\n## Ingredientes\n\n- Tomate\n- Aceite\n",
                "summary": "Receta redactada.",
            },
            "task": None,
            "operations": [],
        }

    monkeypatch.setattr(openai_service, "plan_interaction", fake_plan)

    response = client.post(
        f"/api/projects/{project_id}/ai/interactions",
        json={
            "projectId": project_id,
            "documentId": document_id,
            "prompt": "Redacta una receta de cocina",
            "activeMarkdown": "# Borrador\n",
            "mode": "document",
            "clientMessageId": "client-document-change",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["updatedDocument"]["markdown"].startswith("# Receta de cocina")
    assert payload["updatedDocument"]["summary"] == "Receta redactada."
    assert payload["operations"][0]["type"] == "document_modified"
    assert payload["answer"] == "He actualizado el documento."
    assert payload["interactionType"] == "document_edit"
    assert document_path.read_text(encoding="utf-8") == "# Borrador\n"


def test_ai_quick_document_edit_executes_without_pending_intent(tmp_path, monkeypatch) -> None:
    from app.services.ai_service import openai_service

    docs_root = tmp_path / "ai-quick-edit-policy"
    docs_root.mkdir()
    document_path = docs_root / "quick.md"
    document_path.write_text("Valor y vida.\n", encoding="utf-8")
    created = client.post(
        "/api/projects",
        json={"name": "AI Quick Edit Policy", "folderPath": str(docs_root), "icon": "folder", "iconColor": "#F37021"},
    )
    project_id = created.json()["id"]
    document_id = client.get(f"/api/projects/{project_id}/tree").json()[0]["id"]
    client.put("/api/credentials/openai-key", json={"apiKey": "sk-test-secret-1234"})

    def fake_plan(payload, context, rag, model=None):
        return {
            "display": "bubble",
            "uiPlacement": "document_bubble",
            "interactionType": "document_edit",
            "confidence": "high",
            "executionScope": "needs_clarification",
            "intentDecision": "needs_clarification",
            "routeToAiTab": False,
            "needsUserClarification": True,
            "answer": "Aplicaré el cambio en el documento activo.",
            "pendingIntent": {
                "id": None,
                "originDocumentId": document_id,
                "targetDocumentId": document_id,
                "targetPath": "quick.md",
                "goal": "Poner en negrita palabras con V.",
                "proposedAction": "edit_document",
                "requiresWebResearch": False,
                "webResearchAllowed": False,
                "status": "awaiting_decision",
            },
            "documentChange": {
                "targetDocumentId": document_id,
                "updatedMarkdown": "**Valor** y **vida**.\n",
                "summary": "Palabras con V en negrita.",
            },
            "task": None,
            "operations": [],
        }

    monkeypatch.setattr(openai_service, "plan_interaction", fake_plan)

    response = client.post(
        f"/api/projects/{project_id}/ai/interactions",
        json={
            "projectId": project_id,
            "documentId": document_id,
            "prompt": "pon en negrita las palabras que comienzan con V",
            "activeMarkdown": "Valor y vida.\n",
            "executionMode": "quick",
            "mode": "document",
            "clientMessageId": "client-quick-edit-policy",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["updatedDocument"]["markdown"] == "**Valor** y **vida**.\n"
    assert payload["pendingIntent"] is None
    assert payload["pendingIntentStatus"] is None
    assert payload["needsUserClarification"] is False
    assert client.get(f"/api/projects/{project_id}/ai/pending-intent").status_code == 200
    assert client.get(f"/api/projects/{project_id}/ai/pending-intent").json() is None
    assert document_path.read_text(encoding="utf-8") == "Valor y vida.\n"


def test_ai_repairs_document_edit_plan_without_document_change(tmp_path, monkeypatch) -> None:
    from app.services.ai_service import openai_service

    docs_root = tmp_path / "ai-edit-repair"
    docs_root.mkdir()
    document_path = docs_root / "repair.md"
    document_path.write_text("Valor y vida.\n", encoding="utf-8")
    created = client.post(
        "/api/projects",
        json={"name": "AI Edit Repair", "folderPath": str(docs_root), "icon": "folder", "iconColor": "#F37021"},
    )
    project_id = created.json()["id"]
    document_id = client.get(f"/api/projects/{project_id}/tree").json()[0]["id"]
    client.put("/api/credentials/openai-key", json={"apiKey": "sk-test-secret-1234"})
    calls: list[dict] = []

    def fake_plan(payload, context, rag, model=None):
        calls.append(context)
        if len(calls) == 1:
            return {
                "display": "bubble",
                "uiPlacement": "document_bubble",
                "interactionType": "document_edit",
                "confidence": "high",
                "executionScope": "direct_action",
                "intentDecision": None,
                "routeToAiTab": False,
                "needsUserClarification": False,
                "answer": "He puesto en negrita las palabras que comienzan con V en el documento activo.",
                "pendingIntent": None,
                "documentChange": None,
                "task": None,
                "operations": [],
            }
        assert context["contractRepair"]["previousPlan"]["interactionType"] == "document_edit"
        return {
            "display": "bubble",
            "uiPlacement": "document_bubble",
            "interactionType": "document_edit",
            "confidence": "high",
            "executionScope": "direct_action",
            "intentDecision": None,
            "routeToAiTab": False,
            "needsUserClarification": False,
            "answer": "Palabras con V en negrita.",
            "pendingIntent": None,
            "documentChange": {
                "targetDocumentId": document_id,
                "updatedMarkdown": "**Valor** y **vida**.\n",
                "summary": "Palabras con V en negrita.",
            },
            "task": None,
            "operations": [],
        }

    monkeypatch.setattr(openai_service, "plan_interaction", fake_plan)

    response = client.post(
        f"/api/projects/{project_id}/ai/interactions",
        json={
            "projectId": project_id,
            "documentId": document_id,
            "prompt": "pon en negrita las palabras que comienzan con V",
            "activeMarkdown": "Valor y vida.\n",
            "executionMode": "quick",
            "mode": "document",
            "clientMessageId": "client-edit-repair",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert len(calls) == 2
    assert payload["updatedDocument"]["markdown"] == "**Valor** y **vida**.\n"
    assert payload["needsUserClarification"] is False
    assert payload["pendingIntent"] is None
    assert document_path.read_text(encoding="utf-8") == "Valor y vida.\n"


def test_ai_document_edit_respects_edit_permission(tmp_path, monkeypatch) -> None:
    from app.services.ai_service import openai_service

    docs_root = tmp_path / "ai-edit-permission"
    docs_root.mkdir()
    document_path = docs_root / "blocked.md"
    document_path.write_text("# Original\n", encoding="utf-8")
    created = client.post(
        "/api/projects",
        json={"name": "AI Edit Permission", "folderPath": str(docs_root), "icon": "folder", "iconColor": "#F37021"},
    )
    project_id = created.json()["id"]
    document_id = client.get(f"/api/projects/{project_id}/tree").json()[0]["id"]
    client.put("/api/credentials/openai-key", json={"apiKey": "sk-test-secret-1234"})
    config = client.get("/api/config/ai").json()
    config["permissions"]["editDocuments"] = False
    client.put("/api/config/ai", json=config)

    def fake_plan(payload, context, rag, model=None):
        return {
            "display": "bubble",
            "interactionType": "document_edit",
            "confidence": "high",
            "answer": "Cambio preparado.",
            "documentChange": {"targetDocumentId": document_id, "updatedMarkdown": "# Updated\n", "summary": "Actualizado."},
            "operations": [],
        }

    monkeypatch.setattr(openai_service, "plan_interaction", fake_plan)

    response = client.post(
        f"/api/projects/{project_id}/ai/interactions",
        json={
            "projectId": project_id,
            "documentId": document_id,
            "prompt": "Actualiza el documento",
            "activeMarkdown": "# Original\n",
            "mode": "document",
            "clientMessageId": "client-edit-permission",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "blocked"
    assert payload["updatedDocument"] is None
    assert payload["operations"][0]["type"] == "permission_blocked"
    assert "Configuración de la app > IA" in payload["answer"]
    assert document_path.read_text(encoding="utf-8") == "# Original\n"


def test_ai_agentic_task_routes_to_conversation_with_limits(tmp_path, monkeypatch) -> None:
    from app.services.ai_service import openai_service

    docs_root = tmp_path / "ai-agentic-task"
    docs_root.mkdir()
    (docs_root / "base.md").write_text("# Base\n", encoding="utf-8")
    created = client.post(
        "/api/projects",
        json={"name": "AI Agentic", "folderPath": str(docs_root), "icon": "folder", "iconColor": "#F37021"},
    )
    project_id = created.json()["id"]
    document_id = client.get(f"/api/projects/{project_id}/tree").json()[0]["id"]
    client.put("/api/credentials/openai-key", json={"apiKey": "sk-test-secret-1234"})
    config = client.get("/api/config/ai").json()
    config["agentic"]["maxSteps"] = 2
    config["agentic"]["maxDocuments"] = 3
    config["agentic"]["maxEstimatedCostEur"] = 0.5
    config["agentic"]["webResearchEnabled"] = True
    client.put("/api/config/ai", json=config)

    def fake_plan(payload, context, rag, model=None):
        return {
            "display": "conversation",
            "interactionType": "agentic_task",
            "confidence": "medium",
            "routeToAiTab": True,
            "needsUserClarification": True,
            "answer": "Necesito encauzar esta tarea en la pestaña IA antes de crear documentos.",
            "documentChange": None,
            "task": {
                "title": "Preparar resúmenes documentales",
                "status": "proposed",
                "depth": "deep",
                "requiresWebResearch": True,
                "webResearchAllowed": True,
                "needsUserConfirmation": False,
                "maxSteps": 6,
                "maxDocuments": 10,
                "maxEstimatedCostEur": 4.0,
                "steps": [
                    {"id": "s1", "title": "Revisar instrucciones", "status": "pending", "detail": None},
                    {"id": "s2", "title": "Buscar fuentes", "status": "pending", "detail": "Solo si está permitido."},
                    {"id": "s3", "title": "Crear borradores", "status": "pending", "detail": None},
                ],
                "sources": [
                    {"title": "Fuente prevista", "url": "https://example.com", "path": None, "status": "planned"},
                ],
            },
            "operations": [],
            "__openaiUsage": {
                "inputTokens": 1800,
                "cachedInputTokens": 0,
                "outputTokens": 700,
                "reasoningTokens": 120,
                "embeddingTokens": 0,
                "totalTokens": 2500,
                "usageSource": "provider",
            },
        }

    def fake_preflight_agentic(payload, context, rag, model=None):
        return {
            "executionScope": "agentic_task",
            "uiPlacement": "conversation_tab",
            "confidence": "medium",
            "requiresWebResearch": True,
            "estimatedSteps": 3,
            "estimatedAffectedDocuments": 3,
            "requiresCheckpoint": True,
            "reason": "Requiere varios pasos y fuentes.",
            "answer": None,
        }

    monkeypatch.setattr(openai_service, "analyze_interaction", fake_preflight_agentic)
    monkeypatch.setattr(openai_service, "plan_interaction", fake_plan)

    response = client.post(
        f"/api/projects/{project_id}/ai/interactions",
        json={
            "projectId": project_id,
            "documentId": document_id,
            "prompt": "Prepara varios resúmenes buscando fuentes",
            "activeMarkdown": "# Base\n",
            "executionMode": "reasoning",
            "reasoningDepth": "medium",
            "mode": "document",
            "clientMessageId": "client-agentic",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["interactionType"] == "agentic_task"
    assert payload["routeToAiTab"] is True
    assert payload["needsUserClarification"] is True
    assert payload["updatedDocument"] is None
    assert payload["task"]["maxSteps"] == 2
    assert payload["task"]["maxDocuments"] == 3
    assert payload["task"]["maxEstimatedCostEur"] == 0.5
    assert payload["task"]["steps"][1]["title"] == "Buscar fuentes"
    assert len(payload["task"]["steps"]) == 2
    assert payload["task"]["webResearchAllowed"] is True
    assert payload["conversationEvents"][-1]["type"] == "task_planned"
    assert payload["conversationEvents"][-1]["task"]["title"] == "Preparar resúmenes documentales"
    summary = client.get("/api/ai/usage/summary?tzOffsetMinutes=120").json()
    agentic_summary = next(capability for capability in summary["capabilities"] if capability["capability"] == "agentic_tasks")
    assert agentic_summary["interactions"] == 1
    assert agentic_summary["totalTokens"] == 2500


def test_ai_interaction_includes_recent_document_conversation_context(tmp_path, monkeypatch) -> None:
    from app.services.ai_service import openai_service

    docs_root = tmp_path / "ai-recent-context"
    docs_root.mkdir()
    (docs_root / "context.md").write_text("# Borrador\n", encoding="utf-8")
    created = client.post(
        "/api/projects",
        json={"name": "AI Recent Context", "folderPath": str(docs_root), "icon": "folder", "iconColor": "#F37021"},
    )
    project_id = created.json()["id"]
    document_id = client.get(f"/api/projects/{project_id}/tree").json()[0]["id"]
    client.put("/api/credentials/openai-key", json={"apiKey": "sk-test-secret-1234"})
    captured_context: dict | None = None
    calls = 0

    def fake_plan(payload, context, rag, model=None):
        nonlocal captured_context, calls
        calls += 1
        if calls == 1:
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
                        "updatedMarkdown": "# Patata\n",
                        "summary": "Se escribió un título sobre patatas.",
                    }
                ],
            }
        captured_context = context
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
                    "updatedMarkdown": "# PATATA\n",
                    "summary": "Se puso el título anterior en mayúsculas.",
                }
            ],
        }

    monkeypatch.setattr(openai_service, "plan_interaction", fake_plan)

    first = client.post(
        f"/api/projects/{project_id}/ai/interactions",
        json={
            "projectId": project_id,
            "documentId": document_id,
            "prompt": "Escribe un título sobre patatas",
            "activeMarkdown": "# Borrador\n",
            "mode": "document",
            "clientMessageId": "client-context-1",
        },
    )
    assert first.status_code == 200

    second = client.post(
        f"/api/projects/{project_id}/ai/interactions",
        json={
            "projectId": project_id,
            "documentId": document_id,
            "prompt": "Ahora ponlo en mayúsculas",
            "activeMarkdown": "# Patata\n",
            "mode": "document",
            "clientMessageId": "client-context-2",
        },
    )
    assert second.status_code == 200
    assert captured_context is not None
    recent_events = captured_context["recentConversation"]["events"]
    recent_text = " ".join(event["content"] for event in recent_events)
    assert "Escribe un título sobre patatas" in recent_text
    assert "Se escribió un título sobre patatas." in recent_text
    assert "Ahora ponlo en mayúsculas" not in recent_text
    assert all(event["documentId"] == document_id for event in recent_events)


def test_ai_interaction_includes_selected_text_focus_without_replacing_document_context(tmp_path, monkeypatch) -> None:
    from app.services.ai_service import openai_service

    docs_root = tmp_path / "ai-selection-focus"
    docs_root.mkdir()
    document_path = docs_root / "focus.md"
    document_path.write_text("Primer párrafo.\n\nTexto importante.\n\nÚltimo párrafo.\n", encoding="utf-8")
    created = client.post(
        "/api/projects",
        json={"name": "AI Selection Focus", "folderPath": str(docs_root), "icon": "folder", "iconColor": "#F37021"},
    )
    project_id = created.json()["id"]
    document_id = client.get(f"/api/projects/{project_id}/tree").json()[0]["id"]
    client.put("/api/credentials/openai-key", json={"apiKey": "sk-test-secret-1234"})
    captured_context: dict | None = None

    def fake_plan(payload, context, rag, model=None):
        nonlocal captured_context
        captured_context = context
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
                    "updatedMarkdown": "Primer párrafo.\n\n**Texto importante.**\n\nÚltimo párrafo.\n",
                    "summary": "Se puso en negrita el texto seleccionado.",
                }
            ],
        }

    monkeypatch.setattr(openai_service, "plan_interaction", fake_plan)

    response = client.post(
        f"/api/projects/{project_id}/ai/interactions",
        json={
            "projectId": project_id,
            "documentId": document_id,
            "prompt": "Ponlo en negrita",
            "activeMarkdown": "Primer párrafo.\n\nTexto importante.\n\nÚltimo párrafo.\n",
            "selectionFocus": {
                "documentId": document_id,
                "path": "focus.md",
                "from": 18,
                "to": 35,
                "text": "Texto importante.",
            },
            "mode": "document",
            "clientMessageId": "client-selection-focus",
        },
    )

    assert response.status_code == 200
    assert captured_context is not None
    assert captured_context["activeDocument"]["markdown"].startswith("Primer párrafo.")
    assert captured_context["selectionFocus"]["text"] == "Texto importante."
    assert captured_context["selectionFocus"]["path"] == "focus.md"
    assert captured_context["selectionFocus"]["from"] == 18
    assert response.json()["updatedDocument"]["markdown"] == "Primer párrafo.\n\n**Texto importante.**\n\nÚltimo párrafo.\n"
    assert document_path.read_text(encoding="utf-8") == "Primer párrafo.\n\nTexto importante.\n\nÚltimo párrafo.\n"


def test_ai_pending_intent_preserves_target_document_across_project_conversation(tmp_path, monkeypatch) -> None:
    from app.services.ai_service import openai_service

    docs_root = tmp_path / "ai-pending-intent"
    docs_root.mkdir()
    document_path = docs_root / "pp.md"
    document_path.write_text("# Original\n", encoding="utf-8")
    created = client.post(
        "/api/projects",
        json={"name": "AI Pending Intent", "folderPath": str(docs_root), "icon": "folder", "iconColor": "#F37021"},
    )
    project_id = created.json()["id"]
    document_id = client.get(f"/api/projects/{project_id}/tree").json()[0]["id"]
    client.put("/api/credentials/openai-key", json={"apiKey": "sk-test-secret-1234"})
    calls = 0
    captured_context: dict | None = None

    def fake_preflight(payload, context, rag, model=None):
        return {
            "executionScope": "direct_action",
            "uiPlacement": "document_bubble",
            "confidence": "high",
            "requiresWebResearch": False,
            "estimatedSteps": 1,
            "estimatedAffectedDocuments": 1,
            "requiresCheckpoint": False,
            "reason": "Preparar intención en modo razonamiento.",
            "answer": None,
        }

    def fake_plan(payload, context, rag, model=None):
        nonlocal calls, captured_context
        calls += 1
        if calls == 1:
            return {
                "display": "bubble",
                "uiPlacement": "document_bubble",
                "interactionType": "clarification",
                "confidence": "high",
                "intentDecision": "create_intent",
                "routeToAiTab": False,
                "needsUserClarification": True,
                "answer": "Prepararé el cambio sobre pp.md.",
                "pendingIntent": {
                    "id": None,
                    "originDocumentId": document_id,
                    "targetDocumentId": document_id,
                    "targetPath": "pp.md",
                    "goal": "Redactar una descripción externa y ponerla en pp.md.",
                    "proposedAction": "research_then_write",
                    "requiresWebResearch": False,
                    "webResearchAllowed": False,
                    "status": "awaiting_decision",
                },
                "documentChange": None,
                "task": None,
                "operations": [],
            }
        captured_context = context
        return {
            "display": "bubble",
            "uiPlacement": "document_bubble",
            "interactionType": "document_edit",
            "confidence": "high",
            "intentDecision": "execute_now",
            "routeToAiTab": False,
            "needsUserClarification": False,
            "answer": "Lo cambié.",
            "pendingIntent": None,
            "documentChange": {"targetDocumentId": None, "updatedMarkdown": "# MATTIN.AI\n\nDescripción redactada.\n", "summary": "Descripción redactada."},
            "task": None,
            "operations": [],
        }

    monkeypatch.setattr(openai_service, "analyze_interaction", fake_preflight)
    monkeypatch.setattr(openai_service, "plan_interaction", fake_plan)

    first = client.post(
        f"/api/projects/{project_id}/ai/interactions",
        json={
            "projectId": project_id,
            "documentId": document_id,
            "prompt": "Redacta una descripción externa",
            "activeMarkdown": "# Original\n",
            "clientContext": {"lastDocumentId": document_id, "lastDocumentPath": "pp.md"},
            "executionMode": "reasoning",
            "mode": "document",
            "clientMessageId": "client-pending-1",
        },
    )
    assert first.status_code == 200
    assert first.json()["pendingIntent"]["targetDocumentId"] == document_id
    assert first.json()["uiPlacement"] == "document_bubble"
    persisted = client.get(f"/api/projects/{project_id}/ai/pending-intent")
    assert persisted.status_code == 200
    assert persisted.json()["targetDocumentId"] == document_id

    second = client.post(
        f"/api/projects/{project_id}/ai/interactions",
        json={
            "projectId": project_id,
            "documentId": None,
            "prompt": "Continúa",
            "activeMarkdown": "",
            "clientContext": {"lastDocumentId": document_id, "lastDocumentPath": "pp.md"},
            "executionMode": "reasoning",
            "mode": "project",
            "clientMessageId": "client-pending-2",
        },
    )

    assert second.status_code == 200
    payload = second.json()
    assert captured_context is not None
    assert captured_context["pendingIntent"]["targetDocumentId"] == document_id
    assert payload["updatedDocument"]["documentId"] == document_id
    assert payload["updatedDocument"]["markdown"].startswith("# MATTIN.AI")
    assert document_path.read_text(encoding="utf-8") == "# Original\n"


def test_ai_pending_intent_requires_web_permission_without_applying_document_change(tmp_path, monkeypatch) -> None:
    from app.services.ai_service import openai_service

    docs_root = tmp_path / "ai-pending-web"
    docs_root.mkdir()
    document_path = docs_root / "pp.md"
    document_path.write_text("# Original\n", encoding="utf-8")
    created = client.post(
        "/api/projects",
        json={"name": "AI Pending Web", "folderPath": str(docs_root), "icon": "folder", "iconColor": "#F37021"},
    )
    project_id = created.json()["id"]
    document_id = client.get(f"/api/projects/{project_id}/tree").json()[0]["id"]
    client.put("/api/credentials/openai-key", json={"apiKey": "sk-test-secret-1234"})

    def fake_plan(payload, context, rag, model=None):
        return {
            "display": "bubble",
            "uiPlacement": "document_bubble",
            "interactionType": "clarification",
            "confidence": "high",
            "intentDecision": "create_intent",
            "routeToAiTab": False,
            "needsUserClarification": True,
            "answer": "Necesito permiso para buscar en la web antes de redactar.",
            "pendingIntent": {
                "id": None,
                "originDocumentId": document_id,
                "targetDocumentId": document_id,
                "targetPath": "pp.md",
                "goal": "Investigar y redactar en pp.md.",
                "proposedAction": "research_then_write",
                "requiresWebResearch": True,
                "webResearchAllowed": False,
                "status": "awaiting_web_permission",
            },
            "documentChange": None,
            "task": None,
            "operations": [],
        }

    monkeypatch.setattr(openai_service, "plan_interaction", fake_plan)

    response = client.post(
        f"/api/projects/{project_id}/ai/interactions",
        json={
            "projectId": project_id,
            "documentId": document_id,
            "prompt": "Redacta investigando online",
            "activeMarkdown": "# Original\n",
            "mode": "document",
            "clientMessageId": "client-pending-web",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "blocked"
    assert payload["executionScope"] == "needs_permission"
    assert payload["pendingIntent"] is None
    assert payload["operations"][0]["type"] == "permission_blocked"
    assert "Configuración de la app > IA" in payload["answer"]
    assert payload["updatedDocument"] is None
    assert document_path.read_text(encoding="utf-8") == "# Original\n"


def test_ai_quick_mode_never_enters_agentic_task(tmp_path, monkeypatch) -> None:
    from app.services.ai_service import openai_service

    docs_root = tmp_path / "ai-quick-mode"
    docs_root.mkdir()
    (docs_root / "pp.md").write_text("# Base\n", encoding="utf-8")
    created = client.post(
        "/api/projects",
        json={"name": "AI Quick Mode", "folderPath": str(docs_root), "icon": "folder", "iconColor": "#F37021"},
    )
    project_id = created.json()["id"]
    document_id = client.get(f"/api/projects/{project_id}/tree").json()[0]["id"]
    client.put("/api/credentials/openai-key", json={"apiKey": "sk-test-secret-1234"})

    def fake_plan(payload, context, rag, model=None):
        return {
            "display": "conversation",
            "uiPlacement": "conversation_tab",
            "interactionType": "agentic_task",
            "confidence": "medium",
            "executionScope": "agentic_task",
            "intentDecision": None,
            "routeToAiTab": True,
            "needsUserClarification": False,
            "answer": "Prepararía una tarea larga.",
            "pendingIntent": None,
            "documentChange": None,
            "task": {
                "title": "Tarea larga",
                "status": "proposed",
                "depth": "deep",
                "requiresWebResearch": False,
                "webResearchAllowed": False,
                "needsUserConfirmation": True,
                "maxSteps": 4,
                "maxDocuments": 6,
                "maxEstimatedCostEur": 1,
                "steps": [{"id": "s1", "title": "Paso", "status": "pending", "detail": None}],
                "sources": [],
            },
            "operations": [],
        }

    monkeypatch.setattr(openai_service, "plan_interaction", fake_plan)

    response = client.post(
        f"/api/projects/{project_id}/ai/interactions",
        json={
            "projectId": project_id,
            "documentId": document_id,
            "prompt": "Haz una tarea larga",
            "activeMarkdown": "# Base\n",
            "executionMode": "quick",
            "reasoningDepth": "light",
            "mode": "document",
            "clientMessageId": "client-quick-never-agentic",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["interactionType"] == "clarification"
    assert payload["uiPlacement"] == "document_bubble"
    assert payload["routeToAiTab"] is False
    assert payload["task"] is None


def test_ai_reasoning_mode_runs_preflight_before_planning(tmp_path, monkeypatch) -> None:
    from app.services.ai_service import openai_service

    docs_root = tmp_path / "ai-reasoning-mode"
    docs_root.mkdir()
    (docs_root / "pp.md").write_text("# Base\n", encoding="utf-8")
    created = client.post(
        "/api/projects",
        json={"name": "AI Reasoning Mode", "folderPath": str(docs_root), "icon": "folder", "iconColor": "#F37021"},
    )
    project_id = created.json()["id"]
    document_id = client.get(f"/api/projects/{project_id}/tree").json()[0]["id"]
    client.put("/api/credentials/openai-key", json={"apiKey": "sk-test-secret-1234"})
    plan_called = False

    def fake_preflight(payload, context, rag, model=None):
        assert payload["executionMode"] == "reasoning"
        assert payload["reasoningDepth"] == "deep"
        return {
            "executionScope": "needs_clarification",
            "uiPlacement": "document_bubble",
            "confidence": "high",
            "requiresWebResearch": False,
            "estimatedSteps": 1,
            "estimatedAffectedDocuments": 0,
            "requiresCheckpoint": False,
            "reason": "Falta el tema.",
            "answer": "Indica el tema antes de continuar.",
        }

    def fake_plan(payload, context, rag, model=None):
        nonlocal plan_called
        plan_called = True
        return {}

    monkeypatch.setattr(openai_service, "analyze_interaction", fake_preflight)
    monkeypatch.setattr(openai_service, "plan_interaction", fake_plan)

    response = client.post(
        f"/api/projects/{project_id}/ai/interactions",
        json={
            "projectId": project_id,
            "documentId": document_id,
            "prompt": "Hazlo bien",
            "activeMarkdown": "# Base\n",
            "executionMode": "reasoning",
            "reasoningDepth": "deep",
            "mode": "document",
            "clientMessageId": "client-reasoning-preflight",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert plan_called is False
    assert payload["executionMode"] == "reasoning"
    assert payload["reasoningDepth"] == "deep"
    assert payload["executionScope"] == "needs_clarification"
    assert payload["answer"] == "Indica el tema antes de continuar."


def test_openai_web_search_tool_requires_agentic_web_and_permission() -> None:
    from app.services.openai_service import _web_search_enabled

    payload = {"intentAction": {"type": "apply", "intentId": "intent-1"}}
    disabled_context = {"agentic": {"webResearchEnabled": False}, "pendingIntent": {"webResearchAllowed": True}}
    blocked_context = {"agentic": {"webResearchEnabled": True}, "pendingIntent": {"webResearchAllowed": False}}
    allowed_context = {"agentic": {"webResearchEnabled": True}, "pendingIntent": {"webResearchAllowed": True}}

    assert _web_search_enabled(payload, disabled_context) is False
    assert _web_search_enabled(payload, blocked_context) is True
    assert _web_search_enabled(payload, allowed_context) is True


def test_ai_recent_document_context_excludes_other_documents(tmp_path, monkeypatch) -> None:
    from app.services.ai_service import openai_service

    docs_root = tmp_path / "ai-recent-context-scope"
    docs_root.mkdir()
    (docs_root / "first.md").write_text("# Primero\n", encoding="utf-8")
    (docs_root / "second.md").write_text("# Segundo\n", encoding="utf-8")
    created = client.post(
        "/api/projects",
        json={"name": "AI Context Scope", "folderPath": str(docs_root), "icon": "folder", "iconColor": "#F37021"},
    )
    project_id = created.json()["id"]
    tree = client.get(f"/api/projects/{project_id}/tree").json()
    first_document_id = next(node["id"] for node in tree if node["name"] == "first.md")
    second_document_id = next(node["id"] for node in tree if node["name"] == "second.md")
    client.put("/api/credentials/openai-key", json={"apiKey": "sk-test-secret-1234"})
    captured_context: dict | None = None
    calls = 0

    def fake_plan(payload, context, rag, model=None):
        nonlocal captured_context, calls
        calls += 1
        if calls == 2:
            captured_context = context
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
                    "updatedMarkdown": payload["activeMarkdown"] or "# Actualizado\n",
                    "summary": "Resumen específico del primer documento" if payload["documentId"] == first_document_id else "Resumen del segundo documento",
                }
            ],
        }

    monkeypatch.setattr(openai_service, "plan_interaction", fake_plan)

    first = client.post(
        f"/api/projects/{project_id}/ai/interactions",
        json={
            "projectId": project_id,
            "documentId": first_document_id,
            "prompt": "Trabaja sobre el primer documento",
            "activeMarkdown": "# Primero\n",
            "mode": "document",
            "clientMessageId": "client-scope-1",
        },
    )
    assert first.status_code == 200

    second = client.post(
        f"/api/projects/{project_id}/ai/interactions",
        json={
            "projectId": project_id,
            "documentId": second_document_id,
            "prompt": "Resume el contexto disponible",
            "activeMarkdown": "# Segundo\n",
            "mode": "document",
            "clientMessageId": "client-scope-2",
        },
    )
    assert second.status_code == 200
    assert captured_context is not None
    recent_events = captured_context["recentConversation"]["events"]
    recent_text = " ".join(event["content"] for event in recent_events)
    assert "primer documento" not in recent_text
    assert all(event["documentId"] in {None, second_document_id} for event in recent_events)


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

    def fake_plan(payload, context, rag, model=None):
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


def test_ai_duplicate_document_uses_create_document_permission(tmp_path, monkeypatch) -> None:
    from app.services.ai_service import openai_service

    docs_root = tmp_path / "ai-duplicate"
    target_folder = docs_root / "Nueva carpeta"
    target_folder.mkdir(parents=True)
    (docs_root / "source.md").write_text("# Source\n", encoding="utf-8")
    created = client.post(
        "/api/projects",
        json={"name": "AI Duplicate", "folderPath": str(docs_root), "icon": "folder", "iconColor": "#F37021"},
    )
    project_id = created.json()["id"]
    client.put("/api/credentials/openai-key", json={"apiKey": "sk-test-secret-1234"})

    def fake_plan(payload, context, rag, model=None):
        return {
            "display": "conversation",
            "answer": None,
            "operations": [
                {
                    "type": "duplicate_document",
                    "name": "source-copy.md",
                    "parentPath": "Nueva carpeta",
                    "path": "source.md",
                    "nodeId": None,
                    "markdown": None,
                    "updatedMarkdown": None,
                    "summary": None,
                }
            ],
        }

    monkeypatch.setattr(openai_service, "plan_interaction", fake_plan)

    blocked = client.post(
        f"/api/projects/{project_id}/ai/interactions",
        json={"projectId": project_id, "prompt": "Duplica source.md", "activeMarkdown": "", "mode": "project", "clientMessageId": "client-duplicate-1"},
    )
    assert blocked.status_code == 200
    assert blocked.json()["operations"][0]["type"] == "permission_blocked"
    assert not (target_folder / "source-copy.md").exists()

    config = client.get("/api/config/ai").json()
    config["permissions"]["createDocuments"] = True
    client.put("/api/config/ai", json=config)
    duplicated = client.post(
        f"/api/projects/{project_id}/ai/interactions",
        json={"projectId": project_id, "prompt": "Duplica source.md", "activeMarkdown": "", "mode": "project", "clientMessageId": "client-duplicate-2"},
    )

    assert duplicated.status_code == 200
    payload = duplicated.json()
    assert payload["operations"][0]["type"] == "document_duplicated"
    assert payload["operations"][0]["path"] == "Nueva carpeta/source-copy.md"
    assert (target_folder / "source-copy.md").read_text(encoding="utf-8") == "# Source\n"


def test_ai_move_document_uses_create_document_permission_and_reports_affected_documents(tmp_path, monkeypatch) -> None:
    from app.services.ai_service import openai_service

    docs_root = tmp_path / "ai-move"
    target_folder = docs_root / "Nueva carpeta"
    target_folder.mkdir(parents=True)
    (docs_root / "source.md").write_text("# Source\n", encoding="utf-8")
    created = client.post(
        "/api/projects",
        json={"name": "AI Move", "folderPath": str(docs_root), "icon": "folder", "iconColor": "#F37021"},
    )
    project_id = created.json()["id"]
    client.put("/api/credentials/openai-key", json={"apiKey": "sk-test-secret-1234"})

    def fake_plan(payload, context, rag, model=None):
        return {
            "display": "conversation",
            "answer": None,
            "operations": [
                {
                    "type": "move_node",
                    "name": None,
                    "parentPath": "Nueva carpeta",
                    "path": "source.md",
                    "nodeId": None,
                    "markdown": None,
                    "updatedMarkdown": None,
                    "summary": None,
                }
            ],
        }

    monkeypatch.setattr(openai_service, "plan_interaction", fake_plan)

    blocked = client.post(
        f"/api/projects/{project_id}/ai/interactions",
        json={"projectId": project_id, "prompt": "Mueve source.md a Nueva carpeta", "activeMarkdown": "", "mode": "project", "clientMessageId": "client-move-1"},
    )
    assert blocked.status_code == 200
    assert blocked.json()["operations"][0]["type"] == "permission_blocked"
    assert (docs_root / "source.md").exists()

    config = client.get("/api/config/ai").json()
    config["permissions"]["createDocuments"] = True
    client.put("/api/config/ai", json=config)
    moved = client.post(
        f"/api/projects/{project_id}/ai/interactions",
        json={"projectId": project_id, "prompt": "Mueve source.md a Nueva carpeta", "activeMarkdown": "", "mode": "project", "clientMessageId": "client-move-2"},
    )

    assert moved.status_code == 200
    payload = moved.json()
    assert payload["operations"][0]["type"] == "node_moved"
    assert payload["operations"][0]["path"] == "Nueva carpeta/source.md"
    assert payload["affectedDocuments"][0]["oldId"] != payload["affectedDocuments"][0]["newId"]
    assert payload["affectedDocuments"][0]["path"] == "Nueva carpeta/source.md"
    assert (target_folder / "source.md").read_text(encoding="utf-8") == "# Source\n"
    assert not (docs_root / "source.md").exists()


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

    def fake_plan(payload, context, rag, model=None):
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
