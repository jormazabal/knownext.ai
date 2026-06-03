use base64::Engine;
use reqwest::blocking::Client;
use reqwest::header::{HeaderMap, HeaderValue, ACCEPT, USER_AGENT};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

#[derive(Clone)]
pub struct LocalApi {
    app_data_dir: PathBuf,
    version: String,
    profile: String,
    started_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalApiFile {
    pub field_name: String,
    pub name: String,
    pub mime_type: Option<String>,
    pub data_base64: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalApiResponse {
    pub status: u16,
    pub body: Value,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalApiContentResponse {
    pub status: u16,
    pub content_type: String,
    pub filename: Option<String>,
    pub data_base64: String,
}

type ApiResult = Result<LocalApiResponse, String>;

impl LocalApi {
    pub fn new(app_data_dir: PathBuf, version: String, profile: String) -> Self {
        let _ = std::fs::create_dir_all(&app_data_dir);
        Self {
            app_data_dir,
            version,
            profile,
            started_at: knownext_core::now_iso(),
        }
    }

    pub fn health(&self) -> Value {
        json!({
            "app": "knownext",
            "schemaVersion": 3,
            "status": "ok",
            "service": "local-tauri-rust",
            "version": self.version,
            "profile": self.profile,
            "host": "local-tauri",
            "port": null,
            "endpoint": "tauri://local-api",
            "instanceId": "tauri-rust-local",
            "startedAt": self.started_at,
            "managedBy": "tauri",
            "appDataDir": self.app_data_dir.to_string_lossy(),
        })
    }

    pub fn handle(&self, method: &str, raw_path: &str, body: Value, files: Vec<LocalApiFile>) -> ApiResult {
        let (path, query) = split_path(raw_path);
        let segment_strings = path.trim_matches('/').split('/').map(knownext_core::percent_decode).collect::<Vec<_>>();
        let segments = segment_strings.iter().map(String::as_str).collect::<Vec<_>>();
        let method = method.to_ascii_uppercase();

        match (method.as_str(), segments.as_slice()) {
            ("GET", ["health"]) => ok(self.health()),
            ("GET", ["api", "config"]) => ok(self.read_config()),
            ("PUT", ["api", "config"]) => ok(self.update_config(body)),
            ("GET", ["api", "config", "ai"]) => ok(self.ai_config_status()),
            ("PUT", ["api", "config", "ai"]) => ok(self.update_ai_config(body)),
            ("GET", ["api", "config", "export-template"]) => ok(self.read_export_template()),
            ("PUT", ["api", "config", "export-template"]) => ok(self.update_export_template(body)),
            ("POST", ["api", "config", "export-template", "reset"]) => ok(self.reset_export_template()),
            ("GET", ["api", "config", "export-template", "path"]) => ok(json!({ "path": self.export_template_path().to_string_lossy() })),
            ("GET", ["api", "notes"]) => ok(self.read_notes()),
            ("PUT", ["api", "notes"]) => ok(self.write_notes(body.get("markdown").and_then(Value::as_str).unwrap_or("").to_string())),
            ("GET", ["api", "auth", "status"]) => ok(self.auth_status()),
            ("POST", ["api", "auth", "github", "device", "start"]) => ok(self.start_github_device()),
            ("POST", ["api", "auth", "github", "device", "poll"]) => ok(self.poll_github_device()),
            ("POST", ["api", "auth", "logout"]) => ok(self.clear_auth_status()),
            ("GET", ["api", "github", "repositories"]) => ok(json!([])),
            ("GET", ["api", "projects"]) => ok(json!(self.list_projects())),
            ("POST", ["api", "projects"]) => ok(self.create_project(body)?),
            ("GET", ["api", "projects", "active"]) => self.active_project(),
            ("GET", ["api", "projects", "capabilities"]) => ok(json!({
                "canCreateLocalProject": true,
                "canOpenLocalFolder": true,
                "canUseLocalGit": true,
                "canConnectGithub": true,
                "canUseGithubApi": false,
                "requiresGithubLoginForVersioning": false
            })),
            ("GET", ["api", "projects", project_id, "tree"]) => ok(json!(self.project_tree(project_id)?)),
            ("GET", ["api", "projects", project_id, "versioning", "status"]) => ok(self.versioning_status(project_id)),
            ("GET", ["api", "projects", project_id, "activity"]) => ok(self.project_activity(project_id)),
            ("POST", ["api", "projects", project_id, "activity"]) => ok(self.record_activity(project_id, body)),
            ("PUT", ["api", "projects", project_id, "active"]) => ok(self.set_active_project(project_id)?),
            ("PUT", ["api", "projects", project_id]) => ok(self.update_project(project_id, body)?),
            ("DELETE", ["api", "projects", project_id]) => ok(json!(self.delete_project(project_id)?)),
            ("POST", ["api", "projects", project_id, "folders"]) => ok(self.create_folder(project_id, body)?),
            ("POST", ["api", "projects", project_id, "documents"]) => ok(self.create_document(project_id, body)?),
            ("POST", ["api", "projects", project_id, "attachments"]) => ok(self.import_file(project_id, &query, files, false)?),
            ("POST", ["api", "projects", project_id, "assets", "images"]) => ok(self.import_file(project_id, &query, files, true)?),
            ("GET", ["api", "projects", project_id, "assets", asset_id]) => ok(self.asset_metadata(project_id, asset_id)?),
            ("GET", ["api", "projects", project_id, "assets", asset_id, "usage"]) => ok(self.asset_usage(project_id, asset_id)?),
            ("POST", ["api", "projects", project_id, "assets", "reindex-images"]) => ok(json!({ "projectId": project_id, "imageCount": 0, "indexedImageCount": 0, "status": "updated" })),
            ("POST", ["api", "projects", project_id, "documents", document_id, "image-reference"]) => ok(self.image_reference(project_id, document_id, body)?),
            ("GET", ["api", "projects", project_id, "documents", document_id, "move-impact"]) => ok(self.document_move_impact(project_id, document_id)?),
            ("PATCH", ["api", "projects", project_id, "nodes", node_id, "rename"]) => ok(self.rename_node(project_id, node_id, body)?),
            ("PATCH", ["api", "projects", project_id, "nodes", node_id, "move"]) => ok(self.move_node(project_id, node_id, body)?),
            ("DELETE", ["api", "projects", project_id, "nodes", node_id]) => ok(self.delete_node(project_id, node_id)?),
            ("POST", ["api", "projects", project_id, "documents", document_id, "duplicate"]) => ok(self.duplicate_document(project_id, document_id)?),
            ("GET", ["api", "documents", document_id]) => ok(self.get_document(document_id)?),
            ("PUT", ["api", "documents", document_id]) => ok(self.save_document(document_id, body)?),
            ("PUT", ["api", "documents", document_id, "draft"]) => ok(self.save_draft(document_id, body)?),
            ("DELETE", ["api", "documents", document_id, "draft"]) => {
                self.delete_draft(document_id);
                no_content()
            }
            ("POST", ["api", "documents", document_id, "export"]) => ok(self.export_document(document_id, body)?),
            ("POST", ["api", "documents", "sync-status"]) => ok(self.documents_sync_status(body)),
            ("GET", ["api", "drafts", "orphans"]) => ok(json!([])),
            ("POST", ["api", "drafts", _draft_key, "restore"]) => bad(404, "Draft no disponible"),
            ("DELETE", ["api", "drafts", _draft_key]) => no_content(),
            ("GET", ["api", "documents", document_id, "versions"]) => ok(json!(self.list_versions(document_id))),
            ("POST", ["api", "projects", project_id, "versions"]) => ok(self.create_version(project_id, body)?),
            ("GET", ["api", "documents", document_id, "versions", version_id, "content"]) => ok(self.version_content(document_id, version_id)?),
            ("POST", ["api", "documents", document_id, "versions", version_id, "restore"]) => ok(self.restore_version(document_id, version_id)?),
            ("GET", ["api", "projects", project_id, "sync", "status"]) => ok(self.sync_status(project_id)),
            ("POST", ["api", "projects", project_id, "sync", "scan"]) => ok(self.sync_status(project_id)),
            ("POST", ["api", "projects", project_id, "sync", "auto-run"]) => ok(self.sync_status(project_id)),
            ("POST", ["api", "projects", project_id, "history", "enable"]) => ok(json!({ "status": "enabled", "message": "Historial local preparado desde Rust/Tauri.", "projectId": project_id })),
            ("PUT", ["api", "projects", project_id, "sync-mode"]) => ok(self.sync_status(project_id)),
            ("POST", ["api", "projects", project_id, "github", "connect"]) => ok(self.sync_status(project_id)),
            ("POST", ["api", "projects", project_id, "github", "verify-connection"]) => ok(self.sync_status(project_id)),
            ("POST", ["api", "projects", project_id, "github", "publish"]) => ok(self.sync_status(project_id)),
            ("POST", ["api", "projects", project_id, "sync", "conflicts", _conflict_id, "resolve"]) => ok(self.sync_status(project_id)),
            ("GET", ["api", "projects", project_id, "external-changes"]) => ok(self.external_changes(project_id)),
            ("POST", ["api", "projects", project_id, "external-changes", "scan"]) => ok(self.external_changes(project_id)),
            ("POST", ["api", "projects", project_id, "external-changes", "import"]) => ok(json!({ "status": "synced", "message": "No hay cambios externos pendientes.", "tree": self.project_tree(project_id)?, "versionTitle": null, "syncedAt": knownext_core::now_iso(), "pendingRemoteSync": false })),
            ("POST", ["api", "projects", project_id, "previews"]) => ok(self.create_preview(project_id, body)?),
            ("GET", ["api", "projects", project_id, "previews", preview_id]) => ok(self.get_preview(project_id, preview_id)?),
            ("POST", ["api", "projects", project_id, "previews", preview_id, "refresh"]) => ok(self.get_preview(project_id, preview_id)?),
            ("GET", ["api", "projects", project_id, "previews", preview_id, "text"]) => ok(self.preview_text(project_id, preview_id)?),
            ("GET", ["api", "projects", _project_id, "previews", preview_id, "sheets"]) => ok(json!({ "previewId": preview_id, "sheets": [] })),
            ("GET", ["api", "projects", _project_id, "previews", preview_id, "sheets", sheet_id]) => ok(json!({ "previewId": preview_id, "sheetId": sheet_id, "name": "Hoja", "rowCount": 0, "columnCount": 0, "cells": [], "warnings": [] })),
            ("POST", ["api", "projects", project_id, "previews", preview_id, "open-external"]) => ok(self.open_preview_external(project_id, preview_id)?),
            ("GET", ["api", "projects", project_id, "ai", "context", "search"]) => ok(self.ai_context_search(project_id, &query)),
            ("GET", ["api", "projects", project_id, "ai", "context", "sources"]) => ok(self.ai_sources(project_id)),
            ("POST", ["api", "projects", project_id, "ai", "context", "project-documents"]) => ok(self.ai_source(project_id, body.get("documentId").and_then(Value::as_str).unwrap_or("document"), "project_document")),
            ("POST", ["api", "projects", project_id, "ai", "context", "project-images"]) => ok(self.ai_source(project_id, body.get("assetId").and_then(Value::as_str).unwrap_or("image"), "image")),
            ("POST", ["api", "projects", project_id, "ai", "context", "project-attachments"]) => ok(self.ai_source(project_id, body.get("attachmentId").and_then(Value::as_str).unwrap_or("attachment"), "external_file")),
            ("POST", ["api", "projects", project_id, "ai", "context", "files"]) => ok(self.ai_upload_sources(project_id, files)),
            ("DELETE", ["api", "projects", project_id, "ai", "context", "sources", _source_id]) => ok(self.ai_sources(project_id)),
            ("POST", ["api", "projects", project_id, "ai", "context", "sources", source_id, "extend"]) => ok(self.ai_source(project_id, source_id, "external_file")),
            ("GET", ["api", "projects", project_id, "ai", "context", "sources", source_id, "preview"]) => ok(json!({ "source": self.ai_source(project_id, source_id, "external_file"), "previewText": "", "metadata": {} })),
            ("POST", ["api", "projects", project_id, "ai", "context", "sources", source_id, "add-to-project"]) => ok(json!({ "documentId": source_id, "path": format!("{source_id}.md"), "tree": self.project_tree(project_id)? })),
            ("POST", ["api", "documents", _document_id, "ai", "prompt"]) => ok(knownext_ai::prompt_response(body.get("prompt").and_then(Value::as_str).unwrap_or(""))),
            ("POST", ["api", "projects", _project_id, "ai", "prompt"]) => ok(knownext_ai::prompt_response(body.get("prompt").and_then(Value::as_str).unwrap_or(""))),
            ("POST", ["api", "projects", project_id, "ai", "interactions"]) => ok(self.ai_interaction(project_id, body)),
            ("GET", ["api", "projects", project_id, "ai", "conversation"]) => ok(self.ai_conversation(project_id)),
            ("DELETE", ["api", "projects", project_id, "ai", "conversation"]) => {
                self.write_json(&self.conversation_path(project_id), &json!({ "events": [] }))?;
                ok(json!({ "events": [] }))
            }
            ("GET", ["api", "projects", _project_id, "ai", "pending-intent"]) => ok(Value::Null),
            ("POST", ["api", "projects", project_id, "ai", "confirm-delete"]) => ok(self.ai_interaction(project_id, body)),
            ("GET", ["api", "ai", "usage", "summary"]) => ok(self.ai_usage_summary(&query)),
            ("GET", ["api", "credentials", "openai-key"]) => ok(self.openai_key_status()),
            ("PUT", ["api", "credentials", "openai-key"]) => ok(self.save_openai_key(body)),
            ("DELETE", ["api", "credentials", "openai-key"]) => {
                let _ = std::fs::remove_file(self.credentials_path());
                no_content()
            }
            ("GET", ["api", "projects", project_id, "ai", "index", "status"]) => ok(self.ai_index_status(project_id)),
            ("POST", ["api", "projects", project_id, "ai", "index", "rebuild"]) => ok(self.ai_index_status(project_id)),
            ("DELETE", ["api", "projects", project_id, "ai", "index"]) => ok(self.ai_index_status(project_id)),
            ("POST", ["api", "runtime", "select-folder"]) => ok(json!({ "folderPath": body.get("currentPath").and_then(Value::as_str) })),
            ("GET", ["api", "runtime", "logging"]) => ok(json!({ "enabled": true, "folderPath": self.logs_dir().to_string_lossy(), "filePath": self.logs_dir().join("knownext.log").to_string_lossy() })),
            _ => bad(404, &format!("Contrato local no implementado: {method} {path}")),
        }
    }

    pub fn content(&self, raw_path: &str, body: Value) -> Result<LocalApiContentResponse, String> {
        let (path, _query) = split_path(raw_path);
        let segment_strings = path.trim_matches('/').split('/').map(knownext_core::percent_decode).collect::<Vec<_>>();
        let segments = segment_strings.iter().map(String::as_str).collect::<Vec<_>>();
        match segments.as_slice() {
            ["api", "documents", document_id, "export", "content"] => {
                let document = self.get_document(document_id)?;
                let format = body.get("format").and_then(Value::as_str).unwrap_or("pdf");
                let markdown = body.get("markdown").and_then(Value::as_str).unwrap_or_else(|| document["markdown"].as_str().unwrap_or(""));
                let name = document["name"].as_str().unwrap_or("document.md");
                let (content_type, filename, bytes) = export_bytes(name, markdown, format);
                Ok(binary(200, content_type, Some(filename), bytes))
            }
            ["api", "projects", project_id, "assets", asset_id, "content"] => {
                let path = self.resolve_document_path(asset_id).or_else(|_| self.resolve_project_relative(project_id, asset_id))?;
                let bytes = std::fs::read(&path).map_err(|error| error.to_string())?;
                Ok(binary(200, mime_for_path(&path), path.file_name().map(|value| value.to_string_lossy().to_string()), bytes))
            }
            ["api", "projects", project_id, "previews", preview_id, "pdf"] => {
                let preview = self.get_preview(project_id, preview_id)?;
                let source_path = self.resolve_project_relative(project_id, preview["path"].as_str().unwrap_or(""))?;
                let markdown = knownext_docs::extract_plain_text(&source_path);
                let bytes = if source_path.extension().and_then(|value| value.to_str()).unwrap_or("").eq_ignore_ascii_case("pdf") {
                    std::fs::read(&source_path).unwrap_or_else(|_| knownext_docs::minimal_pdf(preview_id, &markdown))
                } else {
                    knownext_docs::minimal_pdf(preview["name"].as_str().unwrap_or(preview_id), &markdown)
                };
                Ok(binary(200, "application/pdf".to_string(), Some(format!("{preview_id}.pdf")), bytes))
            }
            _ => Ok(binary(404, "application/json".to_string(), None, br#"{"detail":"Contenido local no implementado"}"#.to_vec())),
        }
    }

    fn registry_path(&self) -> PathBuf { self.app_data_dir.join("projects.json") }
    fn config_path(&self) -> PathBuf { self.app_data_dir.join("config.json") }
    fn notes_path(&self) -> PathBuf { self.app_data_dir.join("notes.json") }
    fn export_template_path(&self) -> PathBuf { self.app_data_dir.join("export-template.json") }
    fn auth_path(&self) -> PathBuf { self.app_data_dir.join("auth.json") }
    fn github_device_path(&self) -> PathBuf { self.app_data_dir.join("github-device.json") }
    fn credentials_path(&self) -> PathBuf { self.app_data_dir.join("credentials.json") }
    fn logs_dir(&self) -> PathBuf { self.app_data_dir.join("logs") }
    fn previews_dir(&self) -> PathBuf { self.app_data_dir.join("previews") }
    fn versions_dir(&self) -> PathBuf { self.app_data_dir.join("versions") }
    fn conversation_path(&self, project_id: &str) -> PathBuf { self.app_data_dir.join("ai").join(format!("{project_id}.json")) }

    fn read_json(&self, path: &Path, default: Value) -> Value {
        std::fs::read_to_string(path).ok().and_then(|text| serde_json::from_str(&text).ok()).unwrap_or(default)
    }

    fn write_json(&self, path: &Path, value: &Value) -> Result<(), String> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }
        std::fs::write(path, serde_json::to_string_pretty(value).map_err(|error| error.to_string())?).map_err(|error| error.to_string())
    }

    fn registry(&self) -> Value {
        self.read_json(&self.registry_path(), json!({ "schemaVersion": 2, "activeProjectId": null, "projects": [] }))
    }

    fn write_registry(&self, registry: &Value) -> Result<(), String> {
        self.write_json(&self.registry_path(), registry)
    }

    fn list_projects(&self) -> Vec<Value> {
        self.registry()["projects"].as_array().cloned().unwrap_or_default()
    }

    fn active_project(&self) -> ApiResult {
        let registry = self.registry();
        let active_id = registry["activeProjectId"].as_str().unwrap_or("");
        self.list_projects().into_iter().find(|project| project["id"].as_str() == Some(active_id)).map_or_else(|| bad(404, "No hay proyecto activo"), ok)
    }

    fn create_project(&self, payload: Value) -> Result<Value, String> {
        let id = knownext_core::compact_id("project");
        let root = payload.get("folderPath").and_then(Value::as_str).filter(|value| !value.is_empty()).map(PathBuf::from).unwrap_or_else(|| self.app_data_dir.join("projects").join(&id));
        std::fs::create_dir_all(&root).map_err(|error| error.to_string())?;
        let project = json!({
            "id": id,
            "name": payload.get("name").and_then(Value::as_str).unwrap_or("Proyecto"),
            "folderPath": root.to_string_lossy(),
            "icon": payload.get("icon").and_then(Value::as_str).unwrap_or("folder"),
            "iconColor": payload.get("iconColor").and_then(Value::as_str).unwrap_or("#F37021"),
            "storageMode": payload.get("storageMode").and_then(Value::as_str).unwrap_or("local-files"),
            "versioningMode": payload.get("versioningMode").and_then(Value::as_str).unwrap_or("local-git"),
            "syncMode": payload.get("syncMode").and_then(Value::as_str).unwrap_or("none"),
            "authRequired": payload.get("authRequired").and_then(Value::as_bool).unwrap_or(false),
            "githubRepository": payload.get("githubRepository").cloned().unwrap_or(Value::Null),
            "isGitRepository": true,
            "active": true
        });
        let mut registry = self.registry();
        registry["activeProjectId"] = project["id"].clone();
        let projects = registry["projects"].as_array_mut().ok_or("Registro de proyectos inválido")?;
        for existing in projects.iter_mut() {
            existing["active"] = Value::Bool(false);
        }
        projects.push(project.clone());
        self.write_registry(&registry)?;
        Ok(project)
    }

    fn update_project(&self, project_id: &str, payload: Value) -> Result<Value, String> {
        let mut registry = self.registry();
        let projects = registry["projects"].as_array_mut().ok_or("Registro de proyectos inválido")?;
        let project = projects.iter_mut().find(|project| project["id"].as_str() == Some(project_id)).ok_or("Proyecto no encontrado")?;
        for key in ["name", "folderPath", "icon", "iconColor", "storageMode", "versioningMode", "syncMode", "githubRepository"] {
            if let Some(value) = payload.get(key) {
                project[key] = value.clone();
            }
        }
        let updated = project.clone();
        self.write_registry(&registry)?;
        Ok(updated)
    }

    fn delete_project(&self, project_id: &str) -> Result<Vec<Value>, String> {
        let mut registry = self.registry();
        let active_was_deleted = registry["activeProjectId"].as_str() == Some(project_id);
        let remaining = {
            let projects = registry["projects"].as_array_mut().ok_or("Registro de proyectos inválido")?;
            projects.retain(|project| project["id"].as_str() != Some(project_id));
            projects.clone()
        };
        if active_was_deleted {
            registry["activeProjectId"] = remaining.first().and_then(|project| project["id"].as_str()).map(Value::from).unwrap_or(Value::Null);
        }
        self.write_registry(&registry)?;
        Ok(remaining)
    }

    fn set_active_project(&self, project_id: &str) -> Result<Value, String> {
        let mut registry = self.registry();
        let mut selected = None;
        for project in registry["projects"].as_array_mut().ok_or("Registro de proyectos inválido")? {
            let active = project["id"].as_str() == Some(project_id);
            project["active"] = Value::Bool(active);
            if active {
                selected = Some(project.clone());
            }
        }
        registry["activeProjectId"] = Value::from(project_id);
        self.write_registry(&registry)?;
        selected.ok_or_else(|| "Proyecto no encontrado".to_string())
    }

    fn project_root(&self, project_id: &str) -> Result<PathBuf, String> {
        self.list_projects().into_iter()
            .find(|project| project["id"].as_str() == Some(project_id))
            .and_then(|project| project["folderPath"].as_str().map(PathBuf::from))
            .ok_or_else(|| "Proyecto no encontrado".to_string())
    }

    fn project_tree(&self, project_id: &str) -> Result<Vec<Value>, String> {
        let root = self.project_root(project_id)?;
        read_tree(project_id, &root, &root)
    }

    fn resolve_project_relative(&self, project_id: &str, relative: &str) -> Result<PathBuf, String> {
        let root = self.project_root(project_id)?;
        let relative_path = PathBuf::from(relative.replace('/', std::path::MAIN_SEPARATOR_STR));
        if relative_path.is_absolute() || relative_path.components().any(|component| matches!(component, std::path::Component::ParentDir)) {
            return Err("Ruta fuera del proyecto".to_string());
        }
        Ok(root.join(relative_path))
    }

    fn resolve_document_path(&self, document_id: &str) -> Result<PathBuf, String> {
        let (project_id, relative) = document_ref(document_id)?;
        self.resolve_project_relative(&project_id, &relative)
    }

    fn create_folder(&self, project_id: &str, payload: Value) -> Result<Value, String> {
        let parent = self.node_relative(project_id, payload.get("parentId").and_then(Value::as_str))?;
        let name = payload.get("name").and_then(Value::as_str).unwrap_or("Carpeta");
        let relative = join_relative(parent.as_deref(), name);
        let path = self.resolve_project_relative(project_id, &relative)?;
        std::fs::create_dir_all(path).map_err(|error| error.to_string())?;
        self.file_result(project_id, Some(relative), vec![])
    }

    fn create_document(&self, project_id: &str, payload: Value) -> Result<Value, String> {
        let parent = self.node_relative(project_id, payload.get("parentId").and_then(Value::as_str))?;
        let name = payload.get("name").and_then(Value::as_str).unwrap_or("documento.md");
        let relative = join_relative(parent.as_deref(), name);
        let path = self.resolve_project_relative(project_id, &relative)?;
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }
        std::fs::write(&path, payload.get("markdown").and_then(Value::as_str).unwrap_or("")).map_err(|error| error.to_string())?;
        self.file_result(project_id, Some(relative), vec![])
    }

    fn import_file(&self, project_id: &str, query: &BTreeMap<String, String>, files: Vec<LocalApiFile>, image: bool) -> Result<Value, String> {
        let file = files.into_iter().find(|file| file.field_name == "file").ok_or("Falta archivo")?;
        let parent = self.node_relative(project_id, query.get("parentId").map(String::as_str))?;
        let relative = join_relative(parent.as_deref(), &file.name);
        let path = self.resolve_project_relative(project_id, &relative)?;
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }
        let bytes = base64::engine::general_purpose::STANDARD.decode(file.data_base64).map_err(|error| error.to_string())?;
        std::fs::write(&path, bytes).map_err(|error| error.to_string())?;
        if image {
            Ok(json!({ "tree": self.project_tree(project_id)?, "asset": self.asset_metadata(project_id, &doc_id(project_id, &relative))? }))
        } else {
            self.file_result(project_id, Some(relative), vec![])
        }
    }

    fn rename_node(&self, project_id: &str, node_id: &str, payload: Value) -> Result<Value, String> {
        let old_relative = document_ref_path(node_id)?;
        let old_path = self.resolve_project_relative(project_id, &old_relative)?;
        let new_name = payload.get("name").and_then(Value::as_str).unwrap_or("renombrado.md");
        let new_relative = old_relative.rsplit_once('/').map(|(parent, _)| format!("{parent}/{new_name}")).unwrap_or_else(|| new_name.to_string());
        let new_path = self.resolve_project_relative(project_id, &new_relative)?;
        std::fs::rename(old_path, new_path).map_err(|error| error.to_string())?;
        self.file_result(project_id, Some(new_relative.clone()), vec![json!({ "oldId": node_id, "newId": doc_id(project_id, &new_relative), "name": new_name, "path": new_relative })])
    }

    fn move_node(&self, project_id: &str, node_id: &str, payload: Value) -> Result<Value, String> {
        let old_relative = document_ref_path(node_id)?;
        let name = old_relative.rsplit('/').next().unwrap_or(&old_relative).to_string();
        let target = self.node_relative(project_id, payload.get("targetFolderId").and_then(Value::as_str))?;
        let new_relative = join_relative(target.as_deref(), &name);
        let old_path = self.resolve_project_relative(project_id, &old_relative)?;
        let new_path = self.resolve_project_relative(project_id, &new_relative)?;
        if let Some(parent) = new_path.parent() {
            std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }
        std::fs::rename(old_path, new_path).map_err(|error| error.to_string())?;
        self.file_result(project_id, Some(new_relative.clone()), vec![json!({ "oldId": node_id, "newId": doc_id(project_id, &new_relative), "name": name, "path": new_relative })])
    }

    fn delete_node(&self, project_id: &str, node_id: &str) -> Result<Value, String> {
        let relative = document_ref_path(node_id)?;
        let path = self.resolve_project_relative(project_id, &relative)?;
        if path.is_dir() {
            std::fs::remove_dir_all(path).map_err(|error| error.to_string())?;
        } else {
            std::fs::remove_file(path).map_err(|error| error.to_string())?;
        }
        self.file_result(project_id, None, vec![json!({ "oldId": node_id, "newId": null, "name": null, "path": relative })])
    }

    fn duplicate_document(&self, project_id: &str, document_id: &str) -> Result<Value, String> {
        let relative = document_ref_path(document_id)?;
        let path = self.resolve_project_relative(project_id, &relative)?;
        let stem = path.file_stem().and_then(|value| value.to_str()).unwrap_or("documento");
        let ext = path.extension().and_then(|value| value.to_str()).map(|value| format!(".{value}")).unwrap_or_default();
        let new_name = format!("{stem} copia{ext}");
        let new_relative = relative.rsplit_once('/').map(|(parent, _)| format!("{parent}/{new_name}")).unwrap_or(new_name);
        let new_path = self.resolve_project_relative(project_id, &new_relative)?;
        std::fs::copy(path, new_path).map_err(|error| error.to_string())?;
        self.file_result(project_id, Some(new_relative), vec![])
    }

    fn node_relative(&self, _project_id: &str, node_id: Option<&str>) -> Result<Option<String>, String> {
        match node_id.filter(|value| !value.is_empty()) {
            Some(id) => Ok(Some(document_ref_path(id)?)),
            None => Ok(None),
        }
    }

    fn file_result(&self, project_id: &str, selected_relative: Option<String>, affected: Vec<Value>) -> Result<Value, String> {
        let node = selected_relative.as_ref().and_then(|relative| self.node_for_relative(project_id, relative).ok());
        Ok(json!({ "tree": self.project_tree(project_id)?, "node": node, "affectedDocuments": affected }))
    }

    fn node_for_relative(&self, project_id: &str, relative: &str) -> Result<Value, String> {
        let path = self.resolve_project_relative(project_id, relative)?;
        Ok(tree_node(project_id, &self.project_root(project_id)?, &path, relative))
    }

    fn get_document(&self, document_id: &str) -> Result<Value, String> {
        let path = self.resolve_document_path(document_id)?;
        let markdown = std::fs::read_to_string(&path).map_err(|error| error.to_string())?;
        let (project_id, relative) = document_ref(document_id)?;
        Ok(json!({
            "id": document_id,
            "name": path.file_name().and_then(|value| value.to_str()).unwrap_or("documento.md"),
            "path": relative,
            "projectId": project_id,
            "markdown": markdown,
            "diskMarkdown": markdown,
            "wordCount": knownext_core::word_count(&markdown),
            "updatedAt": knownext_core::now_iso(),
            "baseFingerprint": self.fingerprint(&path),
            "hasDraft": false,
            "isDirty": false,
            "diskChanged": false,
            "orphaned": false,
            "conflictStatus": "none",
            "draftUpdatedAt": null
        }))
    }

    fn save_document(&self, document_id: &str, payload: Value) -> Result<Value, String> {
        let path = self.resolve_document_path(document_id)?;
        let markdown = payload.get("markdown").and_then(Value::as_str).unwrap_or("");
        std::fs::write(path, markdown).map_err(|error| error.to_string())?;
        self.delete_draft(document_id);
        self.get_document(document_id)
    }

    fn save_draft(&self, document_id: &str, payload: Value) -> Result<Value, String> {
        let path = self.app_data_dir.join("drafts").join(safe_name(document_id)).with_extension("json");
        self.write_json(&path, &json!({ "documentId": document_id, "markdown": payload.get("markdown").cloned().unwrap_or(Value::String(String::new())), "baseFingerprint": payload.get("baseFingerprint").cloned().unwrap_or(Value::Null), "draftUpdatedAt": knownext_core::now_iso() }))?;
        ok_value(json!({ "documentId": document_id, "draftUpdatedAt": knownext_core::now_iso(), "isDirty": true }))
    }

    fn delete_draft(&self, document_id: &str) {
        let _ = std::fs::remove_file(self.app_data_dir.join("drafts").join(safe_name(document_id)).with_extension("json"));
    }

    fn export_document(&self, document_id: &str, payload: Value) -> Result<Value, String> {
        let document = self.get_document(document_id)?;
        let output = payload.get("outputPath").and_then(Value::as_str).ok_or("Falta outputPath")?;
        let format = payload.get("format").and_then(Value::as_str).unwrap_or("md");
        let markdown = payload.get("markdown").and_then(Value::as_str).unwrap_or_else(|| document["markdown"].as_str().unwrap_or(""));
        match format {
            "md" => std::fs::write(output, markdown).map_err(|error| error.to_string())?,
            "pdf" => std::fs::write(output, knownext_docs::minimal_pdf(document["name"].as_str().unwrap_or("documento"), markdown)).map_err(|error| error.to_string())?,
            "docx" => knownext_docs::write_docx(Path::new(output), markdown)?,
            _ => return Err("Formato no soportado".to_string()),
        }
        Ok(json!({ "documentId": document_id, "format": format, "outputPath": output, "exportedAt": knownext_core::now_iso() }))
    }

    fn documents_sync_status(&self, body: Value) -> Value {
        let documents = body["documents"].as_array().cloned().unwrap_or_default().into_iter().map(|item| {
            let id = item["documentId"].as_str().unwrap_or("");
            let exists = self.resolve_document_path(id).map(|path| path.exists()).unwrap_or(false);
            json!({ "documentId": id, "exists": exists, "currentFingerprint": null, "diskChanged": false, "hasDraft": false, "orphaned": false, "conflictStatus": "none", "versionState": "ok", "localChanged": false, "remoteChanged": false, "localVersionHash": null, "remoteVersionHash": null, "message": null })
        }).collect::<Vec<_>>();
        json!({ "documents": documents })
    }

    fn fingerprint(&self, path: &Path) -> Value {
        let Ok(metadata) = std::fs::metadata(path) else { return Value::Null };
        json!({ "mtimeNs": null, "size": metadata.len(), "sha256": null })
    }

    fn versions_path(&self, document_id: &str) -> PathBuf {
        self.versions_dir().join(safe_name(document_id)).with_extension("json")
    }

    fn list_versions(&self, document_id: &str) -> Vec<Value> {
        self.read_json(&self.versions_path(document_id), json!([])).as_array().cloned().unwrap_or_default()
    }

    fn create_version(&self, project_id: &str, body: Value) -> Result<Value, String> {
        let document_id = body.get("documentId").and_then(Value::as_str).ok_or("Falta documentId")?;
        let document = self.get_document(document_id)?;
        let id = knownext_core::compact_id("version");
        let version = json!({ "id": id, "hash": id.chars().rev().take(8).collect::<String>(), "title": body.get("title").and_then(Value::as_str).unwrap_or("Version local"), "author": "KnowNext.ai", "authorInitials": "KN", "createdAt": knownext_core::now_iso(), "relativeTime": "ahora", "current": true, "markdown": document["markdown"], "projectId": project_id });
        let mut versions = self.list_versions(document_id);
        for item in versions.iter_mut() { item["current"] = Value::Bool(false); }
        versions.push(version.clone());
        self.write_json(&self.versions_path(document_id), &Value::Array(versions))?;
        Ok(json!({ "version": public_version(&version) }))
    }

    fn version_content(&self, document_id: &str, version_id: &str) -> Result<Value, String> {
        let version = self.list_versions(document_id).into_iter().find(|item| item["id"].as_str() == Some(version_id)).ok_or("Version no encontrada")?;
        Ok(json!({ "documentId": document_id, "versionId": version_id, "markdown": version["markdown"] }))
    }

    fn restore_version(&self, document_id: &str, version_id: &str) -> Result<Value, String> {
        let content = self.version_content(document_id, version_id)?;
        self.save_document(document_id, json!({ "markdown": content["markdown"] }))?;
        Ok(json!({ "version": self.list_versions(document_id).into_iter().find(|item| item["id"].as_str() == Some(version_id)).map(|item| public_version(&item)).unwrap_or(Value::Null) }))
    }

    fn read_config(&self) -> Value { self.read_json(&self.config_path(), default_config()) }
    fn update_config(&self, patch: Value) -> Value {
        let mut config = self.read_config();
        merge(&mut config, &patch);
        normalize_config(&mut config);
        config["updatedAt"] = Value::from(knownext_core::now_iso());
        let _ = self.write_json(&self.config_path(), &config);
        config
    }
    fn ai_config_status(&self) -> Value {
        let mut ai = self.read_config()["ai"].clone();
        let status = self.openai_key_status();
        ai["openaiKeyConfigured"] = status["configured"].clone();
        ai["openaiKeyPreview"] = status["preview"].clone();
        ai
    }
    fn update_ai_config(&self, payload: Value) -> Value {
        let mut config = self.read_config();
        config["ai"] = payload;
        let _ = self.write_json(&self.config_path(), &config);
        self.ai_config_status()
    }
    fn read_export_template(&self) -> Value { self.read_json(&self.export_template_path(), default_export_template()) }
    fn update_export_template(&self, patch: Value) -> Value {
        let mut template = self.read_export_template();
        merge(&mut template, &patch);
        template["updatedAt"] = Value::from(knownext_core::now_iso());
        let _ = self.write_json(&self.export_template_path(), &template);
        template
    }
    fn reset_export_template(&self) -> Value {
        let template = default_export_template();
        let _ = self.write_json(&self.export_template_path(), &template);
        template
    }
    fn read_notes(&self) -> Value { self.read_json(&self.notes_path(), json!({ "markdown": "", "updatedAt": knownext_core::now_iso() })) }
    fn write_notes(&self, markdown: String) -> Value {
        let notes = json!({ "markdown": markdown, "updatedAt": knownext_core::now_iso() });
        let _ = self.write_json(&self.notes_path(), &notes);
        notes
    }
    fn auth_status(&self) -> Value {
        let mut auth = self.read_json(&self.auth_path(), default_auth_status());
        if is_mock_github_auth(&auth) {
            let _ = std::fs::remove_file(self.auth_path());
            return default_auth_status();
        }
        if remove_public_auth_secrets(&mut auth) {
            let _ = self.write_json(&self.auth_path(), &auth);
        }
        auth
    }

    fn start_github_device(&self) -> Value {
        let Some(client_id) = self.github_client_id() else {
            let _ = std::fs::remove_file(self.github_device_path());
            return github_unconfigured_device_response();
        };

        let client = github_http_client();
        let response = client
            .post("https://github.com/login/device/code")
            .form(&[
                ("client_id", client_id.as_str()),
                ("scope", "repo read:user user:email"),
            ])
            .send();

        let Ok(response) = response else {
            return json!({
                "deviceCode": "",
                "userCode": "",
                "verificationUri": "https://github.com/login/device",
                "expiresIn": 0,
                "interval": 5,
                "mock": false,
                "status": "error",
                "error": "github_network_unavailable"
            });
        };

        let body = response.json::<Value>().unwrap_or_else(|_| json!({}));
        if let Some(error) = body.get("error").and_then(Value::as_str) {
            return json!({
                "deviceCode": "",
                "userCode": "",
                "verificationUri": "https://github.com/login/device",
                "expiresIn": 0,
                "interval": 5,
                "mock": false,
                "status": "error",
                "error": error
            });
        }

        let device_code = body.get("device_code").and_then(Value::as_str).unwrap_or("");
        let user_code = body.get("user_code").and_then(Value::as_str).unwrap_or("");
        let verification_uri = body
            .get("verification_uri")
            .or_else(|| body.get("verification_uri_complete"))
            .and_then(Value::as_str)
            .unwrap_or("https://github.com/login/device");
        let expires_in = body.get("expires_in").and_then(Value::as_i64).unwrap_or(900).max(1);
        let interval = body.get("interval").and_then(Value::as_i64).unwrap_or(5).max(1);

        if device_code.is_empty() || user_code.is_empty() {
            return json!({
                "deviceCode": "",
                "userCode": "",
                "verificationUri": "https://github.com/login/device",
                "expiresIn": 0,
                "interval": 5,
                "mock": false,
                "status": "error",
                "error": "github_device_start_failed"
            });
        }

        let pending = json!({
            "deviceCode": device_code,
            "expiresAtEpochSeconds": unix_now_seconds() + expires_in,
            "interval": interval
        });
        let _ = self.write_json(&self.github_device_path(), &pending);

        json!({
            "deviceCode": device_code,
            "userCode": user_code,
            "verificationUri": verification_uri,
            "expiresIn": expires_in,
            "interval": interval,
            "mock": false
        })
    }

    fn poll_github_device(&self) -> Value {
        let Some(client_id) = self.github_client_id() else {
            return json!({
                "status": "error",
                "auth": self.auth_status(),
                "interval": null,
                "error": "github_remote_not_configured"
            });
        };

        let pending = self.read_json(&self.github_device_path(), json!({}));
        let device_code = pending.get("deviceCode").and_then(Value::as_str).unwrap_or("");
        let expires_at = pending.get("expiresAtEpochSeconds").and_then(Value::as_i64).unwrap_or(0);
        if device_code.is_empty() {
            return json!({
                "status": "error",
                "auth": self.auth_status(),
                "interval": null,
                "error": "incorrect_device_code"
            });
        }
        if expires_at <= unix_now_seconds() {
            let _ = std::fs::remove_file(self.github_device_path());
            return json!({
                "status": "error",
                "auth": self.auth_status(),
                "interval": null,
                "error": "expired_token"
            });
        }

        let client = github_http_client();
        let response = client
            .post("https://github.com/login/oauth/access_token")
            .form(&[
                ("client_id", client_id.as_str()),
                ("device_code", device_code),
                ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"),
            ])
            .send();

        let Ok(response) = response else {
            return json!({
                "status": "error",
                "auth": self.auth_status(),
                "interval": pending.get("interval").cloned().unwrap_or(Value::Null),
                "error": "github_network_unavailable"
            });
        };

        let token_body = response.json::<Value>().unwrap_or_else(|_| json!({}));
        if let Some(error) = token_body.get("error").and_then(Value::as_str) {
            if error == "authorization_pending" {
                return json!({
                    "status": "pending",
                    "auth": self.auth_status(),
                    "interval": pending.get("interval").cloned().unwrap_or(Value::Null),
                    "error": null
                });
            }
            return json!({
                "status": "error",
                "auth": self.auth_status(),
                "interval": if error == "slow_down" {
                    Some(pending.get("interval").and_then(Value::as_i64).unwrap_or(5) + 5)
                } else {
                    None
                },
                "error": error
            });
        }

        let access_token = token_body.get("access_token").and_then(Value::as_str).unwrap_or("");
        if access_token.is_empty() {
            return json!({
                "status": "error",
                "auth": self.auth_status(),
                "interval": null,
                "error": "github_token_missing"
            });
        }

        let user = client
            .get("https://api.github.com/user")
            .bearer_auth(access_token)
            .send()
            .ok()
            .and_then(|response| response.json::<Value>().ok())
            .unwrap_or_else(|| json!({}));

        let login = user.get("login").and_then(Value::as_str).unwrap_or("");
        if login.is_empty() {
            return json!({
                "status": "error",
                "auth": self.auth_status(),
                "interval": null,
                "error": "github_user_unavailable"
            });
        }

        let scopes = parse_github_scopes(token_body.get("scope").and_then(Value::as_str).unwrap_or(""));
        let auth = json!({
            "isAuthenticated": true,
            "provider": "github",
            "user": {
                "login": login,
                "name": user.get("name").and_then(Value::as_str).unwrap_or(login),
                "avatarUrl": user.get("avatar_url").and_then(Value::as_str)
            },
            "scopes": scopes.clone(),
            "expiresAt": null,
            "updatedAt": knownext_core::now_iso()
        });
        let credentials = json!({
            "provider": "github",
            "accessToken": access_token,
            "scopes": scopes,
            "updatedAt": knownext_core::now_iso()
        });
        let _ = self.write_json(&self.auth_path(), &auth);
        let _ = self.write_json(&self.credentials_path(), &credentials);
        let _ = std::fs::remove_file(self.github_device_path());

        json!({
            "status": "authenticated",
            "auth": auth,
            "interval": null,
            "error": null
        })
    }

    fn clear_auth_status(&self) -> Value {
        let _ = std::fs::remove_file(self.auth_path());
        let _ = std::fs::remove_file(self.credentials_path());
        let _ = std::fs::remove_file(self.github_device_path());
        default_auth_status()
    }

    fn github_client_id(&self) -> Option<String> {
        if cfg!(test) || self.profile == "test" {
            return None;
        }
        github_client_id()
    }

    fn project_activity(&self, project_id: &str) -> Value {
        let path = self.app_data_dir.join("activity").join(format!("{}.json", safe_name(project_id)));
        self.read_json(&path, json!({ "projectId": project_id, "events": [] }))
    }
    fn record_activity(&self, project_id: &str, body: Value) -> Value {
        let event = json!({
            "id": knownext_core::compact_id("activity"),
            "projectId": project_id,
            "type": body.get("type").and_then(Value::as_str).unwrap_or("activity"),
            "scope": body.get("scope").and_then(Value::as_str).unwrap_or("project"),
            "title": body.get("title").and_then(Value::as_str).unwrap_or("Actividad"),
            "message": body.get("message").and_then(Value::as_str).unwrap_or(""),
            "tone": body.get("tone").and_then(Value::as_str).unwrap_or("info"),
            "createdAt": knownext_core::now_iso(),
            "documentPath": body.get("documentPath").cloned().unwrap_or(Value::Null),
            "repository": body.get("repository").cloned().unwrap_or(Value::Null)
        });
        let path = self.app_data_dir.join("activity").join(format!("{}.json", safe_name(project_id)));
        let mut list = self.project_activity(project_id);
        list["events"].as_array_mut().unwrap().insert(0, event.clone());
        let _ = self.write_json(&path, &list);
        event
    }

    fn versioning_status(&self, project_id: &str) -> Value {
        let project = self.list_projects().into_iter().find(|project| project["id"].as_str() == Some(project_id)).unwrap_or_default();
        json!({ "enabled": true, "available": true, "reason": null, "storageMode": project["storageMode"], "versioningMode": project["versioningMode"], "syncMode": project["syncMode"], "statusLabel": "Historial local", "hasLocalChanges": false, "hasRemoteChanges": false, "lastVersionHash": null, "lastVersionRelativeTime": null })
    }
    fn sync_status(&self, project_id: &str) -> Value {
        let project = self.list_projects().into_iter().find(|project| project["id"].as_str() == Some(project_id)).unwrap_or_default();
        let sync_mode = project["syncMode"].as_str().unwrap_or("none");
        let is_github = sync_mode == "manual-github" || sync_mode == "auto-github";
        if is_github {
            let mode = if sync_mode == "auto-github" { "github-auto" } else { "github-manual" };
            let authenticated = self.auth_status()["isAuthenticated"].as_bool().unwrap_or(false);
            if authenticated {
                return json!({
                    "projectId": project_id,
                    "mode": mode,
                    "state": "local-history",
                    "label": "GitHub conectado",
                    "detail": "El historial local está activo y la sincronización remota está disponible.",
                    "remoteAccess": "available",
                    "remotePaused": false,
                    "remoteReason": null,
                    "remoteAction": null,
                    "localState": "clean",
                    "pendingPush": false,
                    "pendingPull": false,
                    "hasConflicts": false,
                    "lastSyncAt": null,
                    "lastLocalVersionHash": null,
                    "lastRemoteHash": null,
                    "conflicts": []
                });
            }
            return json!({
                "projectId": project_id,
                "mode": mode,
                "state": "local-history",
                "label": "GitHub pausado",
                "detail": "Sin cuenta GitHub. El historial local sigue disponible y la sincronización remota queda pausada.",
                "remoteAccess": "unauthenticated",
                "remotePaused": true,
                "remoteReason": "Sin cuenta GitHub",
                "remoteAction": "connect-github",
                "localState": "clean",
                "pendingPush": false,
                "pendingPull": false,
                "hasConflicts": false,
                "lastSyncAt": null,
                "lastLocalVersionHash": null,
                "lastRemoteHash": null,
                "conflicts": []
            });
        }
        json!({
            "projectId": project_id,
            "mode": "local-history",
            "state": "local-history",
            "label": "Local-first",
            "detail": "Historial y sincronización se gestionan localmente desde Rust/Tauri.",
            "remoteAccess": "not-configured",
            "remotePaused": false,
            "remoteReason": null,
            "remoteAction": null,
            "localState": "clean",
            "pendingPush": false,
            "pendingPull": false,
            "hasConflicts": false,
            "lastSyncAt": null,
            "lastLocalVersionHash": null,
            "lastRemoteHash": null,
            "conflicts": []
        })
    }
    fn external_changes(&self, project_id: &str) -> Value {
        json!({ "id": format!("changes-{project_id}"), "projectId": project_id, "title": "Sin cambios externos", "source": "filesystem", "status": "none", "detectedAt": knownext_core::now_iso(), "requiresReview": false, "summary": { "total": 0, "safe": 0, "review": 0, "blocked": 0, "added": 0, "modified": 0, "deleted": 0, "folders": 0, "documents": 0, "images": 0, "attachments": 0, "omitted": 0, "totalBytes": 0 }, "items": [], "message": null })
    }

    fn asset_metadata(&self, project_id: &str, asset_id: &str) -> Result<Value, String> {
        let path = self.resolve_document_path(asset_id).or_else(|_| self.resolve_project_relative(project_id, asset_id))?;
        let metadata = std::fs::metadata(&path).map_err(|error| error.to_string())?;
        let relative = path.strip_prefix(self.project_root(project_id)?).unwrap_or(&path).to_string_lossy().replace('\\', "/");
        Ok(json!({ "id": doc_id(project_id, &relative), "projectId": project_id, "name": path.file_name().and_then(|value| value.to_str()).unwrap_or("asset"), "path": relative, "mimeType": mime_for_path(&path), "sizeBytes": metadata.len(), "width": null, "height": null, "colorDepthBits": null, "updatedAt": knownext_core::now_iso(), "usageCount": 0, "indexed": false, "indexStatus": "not-indexed", "visualDescription": null }))
    }
    fn asset_usage(&self, project_id: &str, asset_id: &str) -> Result<Value, String> {
        Ok(json!({ "asset": self.asset_metadata(project_id, asset_id)?, "references": [] }))
    }
    fn image_reference(&self, project_id: &str, document_id: &str, body: Value) -> Result<Value, String> {
        let asset_id = body.get("assetId").and_then(Value::as_str).unwrap_or("");
        let asset = self.asset_metadata(project_id, asset_id)?;
        let alt = body.get("altText").and_then(Value::as_str).unwrap_or_else(|| asset["name"].as_str().unwrap_or("Imagen"));
        Ok(json!({ "markdown": format!("![{}]({})", alt, asset["path"].as_str().unwrap_or("")), "asset": asset, "documentId": document_id }))
    }
    fn document_move_impact(&self, _project_id: &str, document_id: &str) -> Result<Value, String> {
        let (_, relative) = document_ref(document_id)?;
        Ok(json!({ "documentId": document_id, "documentPath": relative, "references": [], "sharedAssetPaths": [], "message": "Sin referencias de imagen que actualizar." }))
    }

    fn create_preview(&self, project_id: &str, body: Value) -> Result<Value, String> {
        let relative = body.get("path").and_then(Value::as_str).ok_or("Falta path")?;
        let path = self.resolve_project_relative(project_id, relative)?;
        if !path.exists() { return Err("Documento no encontrado".to_string()); }
        let preview_id = knownext_core::compact_id("preview");
        let preview = preview_value(project_id, &preview_id, relative, &path);
        self.write_json(&self.previews_dir().join(format!("{preview_id}.json")), &preview)?;
        Ok(preview)
    }
    fn get_preview(&self, _project_id: &str, preview_id: &str) -> Result<Value, String> {
        let preview = self.read_json(&self.previews_dir().join(format!("{preview_id}.json")), Value::Null);
        if preview.is_null() { Err("Vista no encontrada".to_string()) } else { Ok(preview) }
    }
    fn preview_text(&self, project_id: &str, preview_id: &str) -> Result<Value, String> {
        let preview = self.get_preview(project_id, preview_id)?;
        let path = self.resolve_project_relative(project_id, preview["path"].as_str().unwrap_or(""))?;
        Ok(json!({ "previewId": preview_id, "text": knownext_docs::extract_plain_text(&path), "searchable": true, "warnings": [] }))
    }
    fn open_preview_external(&self, _project_id: &str, _preview_id: &str) -> Result<Value, String> {
        Ok(json!({ "opened": false, "message": "Apertura externa delegada al runtime Tauri." }))
    }

    fn ai_context_search(&self, project_id: &str, query: &BTreeMap<String, String>) -> Value {
        let needle = query.get("q").map(|value| value.to_ascii_lowercase()).unwrap_or_default();
        let mut matches = Vec::new();
        if let (Ok(root), Ok(nodes)) = (self.project_root(project_id), self.project_tree(project_id)) {
            flatten_nodes(&nodes, &mut matches, &root, &needle);
        }
        Value::Array(matches)
    }
    fn ai_sources(&self, _project_id: &str) -> Value { json!({ "sources": [], "expiredSourceIds": [] }) }
    fn ai_source(&self, project_id: &str, source_id: &str, kind: &str) -> Value {
        json!({ "id": source_id, "projectId": project_id, "kind": kind, "name": source_id, "path": null, "mimeType": null, "sizeBytes": 0, "status": "ready", "weight": "light", "warning": null, "error": null, "createdAt": knownext_core::now_iso(), "updatedAt": knownext_core::now_iso(), "lastUsedAt": null, "expiresAt": null })
    }
    fn ai_upload_sources(&self, project_id: &str, files: Vec<LocalApiFile>) -> Value {
        let sources = files.into_iter().map(|file| self.ai_source(project_id, &file.name, "external_file")).collect::<Vec<_>>();
        json!({ "sources": sources, "expiredSourceIds": [] })
    }
    fn ai_conversation(&self, project_id: &str) -> Value {
        self.read_json(&self.conversation_path(project_id), json!({ "events": [] }))
    }
    fn ai_interaction(&self, project_id: &str, body: Value) -> Value {
        let response = knownext_ai::answer_interaction(project_id, &body, json!([]));
        let mut conversation = self.ai_conversation(project_id);
        if let Some(events) = conversation["events"].as_array_mut() {
            events.extend(response["conversationEvents"].as_array().cloned().unwrap_or_default());
        }
        let _ = self.write_json(&self.conversation_path(project_id), &conversation);
        response
    }
    fn ai_usage_summary(&self, _query: &BTreeMap<String, String>) -> Value {
        json!({ "month": knownext_core::now_iso().chars().take(7).collect::<String>(), "currency": "EUR", "estimated": true, "totalEstimatedCost": 0, "generatedAt": knownext_core::now_iso(), "capabilities": [], "models": [] })
    }
    fn openai_key_status(&self) -> Value {
        let value = self.read_json(&self.credentials_path(), json!({}));
        let key = value["openaiKey"].as_str().unwrap_or("");
        json!({ "configured": !key.is_empty(), "preview": if key.len() > 8 { Value::from(format!("{}...{}", &key[..3], &key[key.len()-4..])) } else { Value::Null } })
    }
    fn save_openai_key(&self, body: Value) -> Value {
        let key = body.get("apiKey").and_then(Value::as_str).unwrap_or("");
        let _ = self.write_json(&self.credentials_path(), &json!({ "openaiKey": key }));
        self.openai_key_status()
    }
    fn ai_index_status(&self, project_id: &str) -> Value {
        let docs = self.project_tree(project_id).map(|nodes| count_documents(&nodes)).unwrap_or(0);
        json!({ "projectId": project_id, "enabled": self.read_config()["ai"]["rag"]["enabled"].as_bool().unwrap_or(false), "status": "updated", "vectorStoreId": null, "lastIndexedAt": knownext_core::now_iso(), "error": null, "documentCount": docs, "indexedDocumentCount": docs, "pendingDocumentCount": 0, "failedDocumentCount": 0, "deletedDocumentCount": 0, "localExactReady": true })
    }
}

fn ok(body: Value) -> ApiResult { Ok(LocalApiResponse { status: 200, body }) }
fn ok_value(body: Value) -> Result<Value, String> { Ok(body) }
fn no_content() -> ApiResult { Ok(LocalApiResponse { status: 204, body: Value::Null }) }
fn bad(status: u16, detail: &str) -> ApiResult { Ok(LocalApiResponse { status, body: json!({ "detail": detail }) }) }

fn binary(status: u16, content_type: String, filename: Option<String>, bytes: Vec<u8>) -> LocalApiContentResponse {
    LocalApiContentResponse {
        status,
        content_type,
        filename,
        data_base64: base64::engine::general_purpose::STANDARD.encode(bytes),
    }
}

fn split_path(raw_path: &str) -> (String, BTreeMap<String, String>) {
    let (path, query) = raw_path.split_once('?').unwrap_or((raw_path, ""));
    let mut params = BTreeMap::new();
    for pair in query.split('&').filter(|value| !value.is_empty()) {
        let (key, value) = pair.split_once('=').unwrap_or((pair, ""));
        params.insert(knownext_core::percent_decode(key), knownext_core::percent_decode(value));
    }
    (path.to_string(), params)
}

fn read_tree(project_id: &str, root: &Path, current: &Path) -> Result<Vec<Value>, String> {
    let mut nodes = Vec::new();
    let entries = std::fs::read_dir(current).map_err(|error| error.to_string())?;
    for entry in entries.flatten() {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') {
            continue;
        }
        let relative = path.strip_prefix(root).unwrap_or(&path).to_string_lossy().replace('\\', "/");
        let mut node = tree_node(project_id, root, &path, &relative);
        if path.is_dir() {
            node["children"] = Value::Array(read_tree(project_id, root, &path)?);
        }
        nodes.push(node);
    }
    nodes.sort_by(|a, b| {
        let at = a["type"].as_str().unwrap_or("");
        let bt = b["type"].as_str().unwrap_or("");
        (at != "folder", a["name"].as_str().unwrap_or("")).cmp(&(bt != "folder", b["name"].as_str().unwrap_or("")))
    });
    Ok(nodes)
}

fn tree_node(project_id: &str, _root: &Path, path: &Path, relative: &str) -> Value {
    let metadata = std::fs::metadata(path).ok();
    let kind = if path.is_dir() {
        "folder"
    } else {
        match path.extension().and_then(|value| value.to_str()).unwrap_or("").to_ascii_lowercase().as_str() {
            "md" | "markdown" => "document",
            "png" | "jpg" | "jpeg" | "gif" | "webp" | "svg" => "image",
            _ => "attachment",
        }
    };
    json!({
        "id": doc_id(project_id, relative),
        "name": path.file_name().and_then(|value| value.to_str()).unwrap_or(relative),
        "type": kind,
        "path": relative,
        "mimeType": if kind == "folder" { Value::Null } else { Value::String(mime_for_path(path)) },
        "sizeBytes": metadata.map(|value| Value::from(value.len())).unwrap_or(Value::Null),
        "children": if kind == "folder" { Value::Array(vec![]) } else { Value::Null },
        "open": false,
        "isEditing": false
    })
}

fn doc_id(project_id: &str, relative: &str) -> String {
    format!("{project_id}::{relative}")
}

fn document_ref(document_id: &str) -> Result<(String, String), String> {
    document_id.split_once("::").map(|(project_id, relative)| (project_id.to_string(), relative.to_string())).ok_or_else(|| "Identificador de documento inválido".to_string())
}

fn document_ref_path(document_id: &str) -> Result<String, String> {
    document_ref(document_id).map(|(_, relative)| relative)
}

fn join_relative(parent: Option<&str>, name: &str) -> String {
    match parent.filter(|value| !value.is_empty()) {
        Some(parent) => format!("{}/{}", parent.trim_matches('/'), name.trim_matches('/')),
        None => name.trim_matches('/').to_string(),
    }
}

fn public_version(version: &Value) -> Value {
    json!({ "id": version["id"], "hash": version["hash"], "title": version["title"], "author": version["author"], "authorInitials": version["authorInitials"], "createdAt": version["createdAt"], "relativeTime": version["relativeTime"], "current": version["current"] })
}

fn export_bytes(name: &str, markdown: &str, format: &str) -> (String, String, Vec<u8>) {
    match format {
        "md" => ("text/markdown;charset=utf-8".to_string(), export_name(name, "md"), markdown.as_bytes().to_vec()),
        "docx" => {
            let mut path = std::env::temp_dir();
            path.push(format!("{}.docx", knownext_core::compact_id("knownext-export")));
            let _ = knownext_docs::write_docx(&path, markdown);
            let bytes = std::fs::read(&path).unwrap_or_default();
            let _ = std::fs::remove_file(path);
            ("application/vnd.openxmlformats-officedocument.wordprocessingml.document".to_string(), export_name(name, "docx"), bytes)
        }
        _ => ("application/pdf".to_string(), export_name(name, "pdf"), knownext_docs::minimal_pdf(name, markdown)),
    }
}

fn export_name(name: &str, ext: &str) -> String {
    format!("{}.{}", name.rsplit_once('.').map(|(stem, _)| stem).unwrap_or(name), ext)
}

fn preview_value(project_id: &str, preview_id: &str, relative: &str, path: &Path) -> Value {
    let ext = path.extension().and_then(|value| value.to_str()).unwrap_or("").to_ascii_lowercase();
    let format = if ext == "xlsx" { "xlsx" } else if ext == "docx" { "docx" } else { "pdf" };
    let renditions = if format == "xlsx" { json!(["text", "workbook"]) } else { json!(["pdf", "text"]) };
    json!({
        "id": preview_id,
        "projectId": project_id,
        "path": relative,
        "name": path.file_name().and_then(|value| value.to_str()).unwrap_or(relative),
        "format": format,
        "status": "ready",
        "readonly": true,
        "sourceFingerprint": { "mtimeNs": null, "size": std::fs::metadata(path).map(|m| m.len()).unwrap_or(0), "sha256": null },
        "availableRenditions": renditions,
        "pageCount": if format == "xlsx" { Value::Null } else { Value::from(1) },
        "sheets": if format == "xlsx" { json!([]) } else { Value::Null },
        "warnings": [],
        "generatedAt": knownext_core::now_iso(),
        "error": null
    })
}

fn flatten_nodes(nodes: &[Value], matches: &mut Vec<Value>, root: &Path, needle: &str) {
    for node in nodes {
        let name = node["name"].as_str().unwrap_or("");
        let path = node["path"].as_str().unwrap_or("");
        let content_matches = if needle.is_empty() || node["type"].as_str() == Some("folder") {
            false
        } else {
            let relative_path = PathBuf::from(path.replace('/', std::path::MAIN_SEPARATOR_STR));
            std::fs::read_to_string(root.join(relative_path))
                .map(|content| content.to_ascii_lowercase().contains(needle))
                .unwrap_or(false)
        };
        if node["type"].as_str() != Some("folder") && (needle.is_empty() || name.to_ascii_lowercase().contains(needle) || path.to_ascii_lowercase().contains(needle) || content_matches) {
            matches.push(json!({ "documentId": node["id"], "name": name, "path": path, "kind": "project_document", "mimeType": node["mimeType"] }));
        }
        if let Some(children) = node["children"].as_array() {
            flatten_nodes(children, matches, root, needle);
        }
    }
}

fn count_documents(nodes: &[Value]) -> usize {
    nodes.iter().map(|node| {
        let own = usize::from(node["type"].as_str() == Some("document"));
        let children = node["children"].as_array().map(|children| count_documents(children)).unwrap_or(0);
        own + children
    }).sum()
}

fn mime_for_path(path: &Path) -> String {
    match path.extension().and_then(|value| value.to_str()).unwrap_or("").to_ascii_lowercase().as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        "pdf" => "application/pdf",
        "docx" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "xlsx" => "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "md" | "markdown" => "text/markdown",
        _ => "application/octet-stream",
    }.to_string()
}

fn default_auth_status() -> Value {
    json!({
        "isAuthenticated": false,
        "provider": null,
        "user": null,
        "scopes": [],
        "expiresAt": null
    })
}

fn github_unconfigured_device_response() -> Value {
    json!({
        "deviceCode": "",
        "userCode": "",
        "verificationUri": "https://github.com/login/device",
        "expiresIn": 0,
        "interval": 5,
        "mock": true,
        "status": "error",
        "error": "github_remote_not_configured"
    })
}

fn github_client_id() -> Option<String> {
    std::env::var("KNOWNEXT_GITHUB_CLIENT_ID")
        .ok()
        .filter(|value| !value.trim().is_empty())
        .or_else(|| {
            option_env!("KNOWNEXT_GITHUB_CLIENT_ID")
                .map(str::to_string)
                .filter(|value| !value.trim().is_empty())
        })
}

fn github_http_client() -> Client {
    let mut headers = HeaderMap::new();
    headers.insert(USER_AGENT, HeaderValue::from_static("KnowNext.ai"));
    headers.insert(ACCEPT, HeaderValue::from_static("application/json"));
    Client::builder()
        .default_headers(headers)
        .timeout(Duration::from_secs(20))
        .build()
        .unwrap_or_else(|_| Client::new())
}

fn unix_now_seconds() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs() as i64)
        .unwrap_or(0)
}

fn parse_github_scopes(scope: &str) -> Vec<String> {
    scope
        .split(|ch: char| ch == ',' || ch.is_whitespace())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .collect()
}

fn remove_public_auth_secrets(auth: &mut Value) -> bool {
    let Some(object) = auth.as_object_mut() else {
        return false;
    };
    let mut changed = false;
    changed |= object.remove("accessToken").is_some();
    changed |= object.remove("token").is_some();
    changed
}

fn is_mock_github_auth(auth: &Value) -> bool {
    auth.get("provider").and_then(Value::as_str) == Some("github")
        && auth.get("user").and_then(|user| user.get("login")).and_then(Value::as_str) == Some("knownext-dev")
}

fn safe_name(value: &str) -> String {
    value.chars().map(|ch| if ch.is_ascii_alphanumeric() { ch } else { '_' }).collect()
}

fn merge(target: &mut Value, patch: &Value) {
    match (target, patch) {
        (Value::Object(target), Value::Object(patch)) => {
            for (key, value) in patch {
                merge(target.entry(key.clone()).or_insert(Value::Null), value);
            }
        }
        (target, patch) => *target = patch.clone(),
    }
}

fn normalize_config(config: &mut Value) {
    if let Some(tabs) = config["openUtilityTabs"].as_array_mut() {
        tabs.retain(|value| value.as_str() != Some("notes"));
    }
    if config["activeUtilityTab"].is_null() {
        config["activeUtilityTab"] = Value::from("notes");
    }
}

fn default_config() -> Value {
    json!({
        "schemaVersion": 3,
        "layout": { "sidebarWidth": 300, "historyWidth": 320 },
        "appearance": { "language": "es", "zoomPercent": 100, "markdownExtendedUnderlineEnabled": true, "themeMode": "system", "primaryColor": "orange" },
        "diagnostics": { "traceLoggingEnabled": true },
        "ai": default_ai_config(),
        "tabsByProject": {},
        "treeOpenPathsByProject": {},
        "lastRunAppVersion": null,
        "lastSeenReleaseNotesVersion": null,
        "openUtilityTabs": ["release-notes"],
        "activeUtilityTab": "notes",
        "updatedAt": knownext_core::now_iso()
    })
}

fn default_ai_config() -> Value {
    json!({
        "provider": "openai",
        "model": "gpt-5.4-mini",
        "permissions": { "editDocuments": false, "createFolders": false, "createDocuments": false, "deleteDocumentsAndFolders": false, "generateImages": false, "createImageAssets": false, "insertImagesIntoDocuments": false, "useDocumentContextForImageGeneration": false },
        "rag": { "enabled": false, "vectorStoreId": null, "lastIndexedAt": null, "status": "not-indexed", "error": null },
        "vision": { "enabled": false, "model": "gpt-5.4-mini", "imageIndexingEnabled": false, "maxImagesPerPrompt": 3, "maxImageSizeMb": 8, "detail": "auto", "storeVisualDescriptions": false },
        "imageGeneration": { "enabled": false, "model": "gpt-image-2", "size": "auto", "quality": "auto", "outputFormat": "png", "defaultFolder": "generated_assets", "customFolderPath": "", "maxImagesPerPrompt": 1, "confirmBeforeDocumentInsert": true, "confirmBeforeUsingMultipleSources": true, "storePromptMetadata": true },
        "agentic": { "depth": "guided", "webResearchEnabled": false, "confirmBeforeApplying": true, "maxSteps": 4, "maxDocuments": 6, "maxEstimatedCostEur": 1, "maxSources": 6 },
        "transcription": { "enabled": false, "model": "gpt-realtime-whisper", "defaultTarget": "prompt", "defaultLanguage": "auto", "favoriteLanguages": ["es", "en"] }
    })
}

fn default_export_template() -> Value {
    json!({
        "schemaVersion": 1,
        "name": "basic",
        "page": { "size": "A4", "margins": { "topMm": 20, "rightMm": 20, "bottomMm": 20, "leftMm": 20 } },
        "normal": { "fontFamily": "Arial", "fontSizePt": 11, "color": "#111827", "textFormat": "normal" },
        "headingFontFamily": "Arial",
        "headings": {
            "h1": { "fontFamily": "Arial", "fontSizePt": 22, "color": "#111827", "textFormat": "bold" },
            "h2": { "fontFamily": "Arial", "fontSizePt": 18, "color": "#111827", "textFormat": "bold" },
            "h3": { "fontFamily": "Arial", "fontSizePt": 15, "color": "#111827", "textFormat": "bold" },
            "h4": { "fontFamily": "Arial", "fontSizePt": 13, "color": "#111827", "textFormat": "bold" },
            "h5": { "fontFamily": "Arial", "fontSizePt": 12, "color": "#111827", "textFormat": "bold" },
            "h6": { "fontFamily": "Arial", "fontSizePt": 11, "color": "#111827", "textFormat": "bold" }
        },
        "code": { "fontFamily": "Consolas", "fontSizePt": 10, "color": "#111827", "textFormat": "normal" },
        "paragraph": { "lineSpacing": 1.25, "spaceAfterPt": 6 },
        "document": { "includeTitle": false, "linkColor": "#D85A12", "horizontalRuleColor": "#E5E7EB" },
        "updatedAt": knownext_core::now_iso()
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn api() -> LocalApi {
        let root = std::env::temp_dir().join(knownext_core::compact_id("knownext-test"));
        LocalApi::new(root, "2.0.2".to_string(), "desktop".to_string())
    }

    fn create_project(api: &LocalApi) -> (String, PathBuf) {
        let root = std::env::temp_dir().join(knownext_core::compact_id("knownext-project"));
        let created = api.handle("POST", "/api/projects", json!({
            "name": "Docs",
            "folderPath": root.to_string_lossy(),
            "icon": "folder",
            "iconColor": "#F37021"
        }), vec![]).unwrap();
        (created.body["id"].as_str().unwrap().to_string(), root)
    }

    fn create_document(api: &LocalApi, project_id: &str, name: &str, markdown: &str) -> String {
        let document = api.handle("POST", &format!("/api/projects/{project_id}/documents"), json!({
            "parentId": null,
            "name": name,
            "markdown": markdown
        }), vec![]).unwrap();
        document.body["node"]["id"].as_str().unwrap().to_string()
    }

    #[test]
    fn health_reports_local_tauri_runtime() {
        let api = api();
        let response = api.handle("GET", "/health", Value::Null, vec![]).unwrap();

        assert_eq!(response.status, 200);
        assert_eq!(response.body["app"], "knownext");
        assert_eq!(response.body["service"], "local-tauri-rust");
        assert_eq!(response.body["version"], "2.0.2");
        assert_eq!(response.body["profile"], "desktop");
        assert_eq!(response.body["endpoint"], "tauri://local-api");
    }

    #[test]
    fn github_sync_pauses_without_auth_and_recovers_after_real_auth_state() {
        let api = api();
        let root = std::env::temp_dir().join(knownext_core::compact_id("knownext-github-project"));
        let created = api.handle("POST", "/api/projects", json!({
            "name": "GitHub docs",
            "folderPath": root.to_string_lossy(),
            "syncMode": "auto-github",
            "githubRepository": {
                "owner": "knownext",
                "name": "docs",
                "defaultBranch": "main"
            }
        }), vec![]).unwrap();
        let project_id = created.body["id"].as_str().unwrap();

        let paused = api.handle("GET", &format!("/api/projects/{project_id}/sync/status"), Value::Null, vec![]).unwrap();
        assert_eq!(paused.body["remoteAccess"], "unauthenticated");
        assert_eq!(paused.body["remotePaused"], true);
        assert_eq!(paused.body["state"], "local-history");

        let start = api.handle("POST", "/api/auth/github/device/start", Value::Null, vec![]).unwrap();
        assert_eq!(start.body["mock"], true);
        assert_eq!(start.body["status"], "error");
        assert_eq!(start.body["error"], "github_remote_not_configured");
        assert_eq!(start.body["deviceCode"], "");

        let login = api.handle("POST", "/api/auth/github/device/poll", json!({ "deviceCode": "dev" }), vec![]).unwrap();
        assert_eq!(login.body["status"], "error");
        assert_eq!(login.body["auth"]["isAuthenticated"], false);
        assert_eq!(login.body["error"], "github_remote_not_configured");

        let paused_again = api.handle("GET", &format!("/api/projects/{project_id}/sync/status"), Value::Null, vec![]).unwrap();
        assert_eq!(paused_again.body["remoteAccess"], "unauthenticated");
        assert_eq!(paused_again.body["remotePaused"], true);

        let _ = api.write_json(&api.auth_path(), &json!({
            "isAuthenticated": true,
            "provider": "github",
            "user": {
                "login": "octocat",
                "name": "Octocat",
                "avatarUrl": null
            },
            "scopes": ["repo"],
            "expiresAt": null
        }));

        let available = api.handle("GET", &format!("/api/projects/{project_id}/sync/status"), Value::Null, vec![]).unwrap();
        assert_eq!(available.body["remoteAccess"], "available");
        assert_eq!(available.body["remotePaused"], false);
        assert_eq!(available.body["label"], "GitHub conectado");
    }

    #[test]
    fn production_auth_status_clears_persisted_dev_github_account() {
        let api = api();
        let _ = api.write_json(&api.auth_path(), &json!({
            "isAuthenticated": true,
            "provider": "github",
            "user": {
                "login": "knownext-dev",
                "name": "KnowNext Dev",
                "avatarUrl": null
            },
            "scopes": ["repo"],
            "expiresAt": null
        }));

        let auth = api.handle("GET", "/api/auth/status", Value::Null, vec![]).unwrap();

        assert_eq!(auth.body["isAuthenticated"], false);
        assert!(!api.auth_path().exists());
    }

    #[test]
    fn auth_status_never_exposes_persisted_github_tokens_to_frontend() {
        let api = api();
        let _ = api.write_json(&api.auth_path(), &json!({
            "isAuthenticated": true,
            "provider": "github",
            "user": {
                "login": "octocat",
                "name": "Octocat",
                "avatarUrl": null
            },
            "scopes": ["repo"],
            "expiresAt": null,
            "accessToken": "secret-token",
            "token": "legacy-secret-token"
        }));

        let auth = api.handle("GET", "/api/auth/status", Value::Null, vec![]).unwrap();
        let persisted = api.read_json(&api.auth_path(), json!({}));

        assert_eq!(auth.body["isAuthenticated"], true);
        assert!(auth.body.get("accessToken").is_none());
        assert!(auth.body.get("token").is_none());
        assert!(persisted.get("accessToken").is_none());
        assert!(persisted.get("token").is_none());
    }

    #[test]
    fn creates_project_and_reads_markdown_document() {
        let api = api();
        let (project_id, _root) = create_project(&api);

        let document_id = create_document(&api, &project_id, "intro.md", "# Intro\n");
        let loaded = api.handle("GET", &format!("/api/documents/{document_id}"), Value::Null, vec![]).unwrap();

        assert_eq!(loaded.body["markdown"], "# Intro\n");
        assert_eq!(api.handle("GET", &format!("/api/projects/{project_id}/tree"), Value::Null, vec![]).unwrap().body.as_array().unwrap().len(), 1);
    }

    #[test]
    fn notes_and_config_persist_as_local_json() {
        let api = api();
        let notes = api.handle("PUT", "/api/notes", json!({ "markdown": "# Notas" }), vec![]).unwrap();
        assert_eq!(notes.body["markdown"], "# Notas");
        assert_eq!(api.handle("GET", "/api/notes", Value::Null, vec![]).unwrap().body["markdown"], "# Notas");

        let config = api.handle("PUT", "/api/config", json!({
            "appearance": { "zoomPercent": 125 },
            "activeUtilityTab": "notes",
            "openUtilityTabs": ["notes", "release-notes"]
        }), vec![]).unwrap();
        assert_eq!(config.body["appearance"]["zoomPercent"], 125);
        assert_eq!(config.body["openUtilityTabs"], json!(["release-notes"]));
    }

    #[test]
    fn imports_previews_exports_and_versions_local_documents() {
        let api = api();
        let (project_id, root) = create_project(&api);
        let document_id = create_document(&api, &project_id, "release-notes.md", "# Release\nContenido local.");

        let draft = api.handle("PUT", &format!("/api/documents/{document_id}/draft"), json!({
            "markdown": "# Release\nBorrador local.",
            "baseFingerprint": null
        }), vec![]).unwrap();
        assert_eq!(draft.status, 200);
        assert_eq!(draft.body["isDirty"], true);

        let saved = api.handle("PUT", &format!("/api/documents/{document_id}"), json!({
            "markdown": "# Release\nContenido final local."
        }), vec![]).unwrap();
        assert_eq!(saved.body["markdown"], "# Release\nContenido final local.");

        let version = api.handle("POST", &format!("/api/projects/{project_id}/versions"), json!({
            "documentId": document_id,
            "title": "Validacion local"
        }), vec![]).unwrap();
        let version_id = version.body["version"]["id"].as_str().unwrap();
        let version_content = api.handle("GET", &format!("/api/documents/{document_id}/versions/{version_id}/content"), Value::Null, vec![]).unwrap();
        assert_eq!(version_content.body["markdown"], "# Release\nContenido final local.");

        let md_output = root.join("release-export.md");
        let pdf_output = root.join("release-export.pdf");
        let docx_output = root.join("release-export.docx");
        for (format, output) in [("md", &md_output), ("pdf", &pdf_output), ("docx", &docx_output)] {
            let exported = api.handle("POST", &format!("/api/documents/{document_id}/export"), json!({
                "format": format,
                "outputPath": output.to_string_lossy()
            }), vec![]).unwrap();
            assert_eq!(exported.body["format"], format);
            assert!(output.exists(), "{format} export should exist");
            assert!(std::fs::metadata(output).unwrap().len() > 0, "{format} export should not be empty");
        }

        let file = LocalApiFile {
            field_name: "file".to_string(),
            name: "pixel.png".to_string(),
            mime_type: Some("image/png".to_string()),
            data_base64: base64::engine::general_purpose::STANDARD.encode([0x89, b'P', b'N', b'G', b'\r', b'\n', 0x1a, b'\n']),
        };
        let imported = api.handle("POST", &format!("/api/projects/{project_id}/assets/images"), Value::Null, vec![file]).unwrap();
        assert_eq!(imported.body["asset"]["mimeType"], "image/png");

        let pdf_path = root.join("reference.pdf");
        std::fs::write(&pdf_path, knownext_docs::minimal_pdf("reference", "Texto de referencia")).unwrap();
        let preview = api.handle("POST", &format!("/api/projects/{project_id}/previews"), json!({ "path": "reference.pdf" }), vec![]).unwrap();
        let preview_id = preview.body["id"].as_str().unwrap();
        assert_eq!(preview.body["format"], "pdf");
        let preview_text = api.handle("GET", &format!("/api/projects/{project_id}/previews/{preview_id}/text"), Value::Null, vec![]).unwrap();
        assert_eq!(preview_text.body["searchable"], true);

        let binary = api.content(&format!("/api/documents/{document_id}/export/content"), json!({ "format": "pdf" })).unwrap();
        assert_eq!(binary.status, 200);
        assert_eq!(binary.content_type, "application/pdf");
        assert!(!binary.data_base64.is_empty());
    }

    #[test]
    fn ai_context_and_prompt_contracts_are_local_runtime_backed() {
        let api = api();
        let (project_id, _root) = create_project(&api);
        let document_id = create_document(&api, &project_id, "context.md", "# Contexto\nBusca este contenido.");

        let search = api.handle("GET", &format!("/api/projects/{project_id}/ai/context/search?q=contenido"), Value::Null, vec![]).unwrap();
        assert_eq!(search.status, 200);
        assert_eq!(search.body.as_array().unwrap()[0]["documentId"], document_id);

        let prompt = api.handle("POST", &format!("/api/documents/{document_id}/ai/prompt"), json!({
            "prompt": "Resume el documento activo"
        }), vec![]).unwrap();
        assert_eq!(prompt.status, 200);
        assert!(prompt.body["answer"].as_str().unwrap().contains("Rust/Tauri"));

        let interaction = api.handle("POST", &format!("/api/projects/{project_id}/ai/interactions"), json!({
            "prompt": "Propón un siguiente paso",
            "documentId": document_id
        }), vec![]).unwrap();
        assert_eq!(interaction.status, 200);
        assert!(interaction.body["answer"].as_str().unwrap().contains(&document_id));
        assert!(!interaction.body["conversationEvents"].as_array().unwrap().is_empty());

        let index = api.handle("GET", &format!("/api/projects/{project_id}/ai/index/status"), Value::Null, vec![]).unwrap();
        assert_eq!(index.body["localExactReady"], true);
        assert_eq!(index.body["documentCount"], 1);
    }
}
