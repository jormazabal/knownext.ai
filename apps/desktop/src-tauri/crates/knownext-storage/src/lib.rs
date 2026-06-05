use base64::Engine;
use reqwest::blocking::Client;
use reqwest::header::{HeaderMap, HeaderValue, ACCEPT, USER_AGENT};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::process::Command;
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
            ("POST", ["api", "transcription"]) => ok(self.transcribe_audio(body, files)),
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
            ("GET", ["api", "github", "repositories"]) => ok(self.github_repositories()),
            ("GET", ["api", "projects"]) => ok(json!(self.list_projects())),
            ("POST", ["api", "projects"]) => ok(self.create_project(body)?),
            ("GET", ["api", "projects", "active"]) => self.active_project(),
            ("GET", ["api", "projects", "capabilities"]) => ok(json!({
                "canCreateLocalProject": true,
                "canOpenLocalFolder": true,
                "canUseLocalGit": true,
                "canConnectGithub": true,
                "canUseGithubApi": github_client_id().is_some(),
                "requiresGithubLoginForVersioning": true
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
            ("POST", ["api", "projects", project_id, "assets", "reindex-images"]) => ok(self.reindex_project_images(project_id)?),
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
            ("GET", ["api", "drafts", "orphans"]) => ok(self.orphan_drafts()),
            ("POST", ["api", "drafts", draft_key, "restore"]) => ok(self.restore_orphan_draft(draft_key)?),
            ("DELETE", ["api", "drafts", draft_key]) => {
                self.discard_draft_key(draft_key);
                no_content()
            },
            ("GET", ["api", "documents", document_id, "versions"]) => ok(json!(self.list_versions(document_id))),
            ("POST", ["api", "projects", project_id, "versions"]) => ok(self.create_version(project_id, body)?),
            ("GET", ["api", "documents", document_id, "versions", version_id, "content"]) => ok(self.version_content(document_id, version_id)?),
            ("POST", ["api", "documents", document_id, "versions", version_id, "restore"]) => ok(self.restore_version(document_id, version_id)?),
            ("GET", ["api", "projects", project_id, "sync", "status"]) => ok(self.sync_status(project_id)),
            ("POST", ["api", "projects", project_id, "sync", "pull"]) => ok(self.sync_operation(project_id, "pull")),
            ("POST", ["api", "projects", project_id, "sync", "push"]) => ok(self.sync_operation(project_id, "push")),
            ("POST", ["api", "projects", project_id, "sync", "scan"]) => ok(self.sync_status(project_id)),
            ("POST", ["api", "projects", project_id, "sync", "auto-run"]) => ok(self.sync_status(project_id)),
            ("POST", ["api", "projects", project_id, "history", "enable"]) => ok(self.enable_project_history(project_id)?),
            ("PUT", ["api", "projects", project_id, "sync-mode"]) => ok(self.change_project_sync_mode(project_id, body)?),
            ("POST", ["api", "projects", project_id, "github", "connect"]) => ok(self.connect_project_github(project_id, body, false)?),
            ("POST", ["api", "projects", project_id, "github", "verify-connection"]) => ok(self.sync_status(project_id)),
            ("POST", ["api", "projects", project_id, "github", "publish"]) => ok(self.connect_project_github(project_id, body, true)?),
            ("POST", ["api", "projects", project_id, "sync", "conflicts", _conflict_id, "resolve"]) => ok(self.sync_status(project_id)),
            ("GET", ["api", "projects", project_id, "external-changes"]) => ok(self.external_changes(project_id)),
            ("POST", ["api", "projects", project_id, "external-changes", "scan"]) => ok(self.external_changes(project_id)),
            ("POST", ["api", "projects", project_id, "external-changes", "import"]) => ok(self.import_external_changes(project_id, body)?),
            ("POST", ["api", "projects", project_id, "previews"]) => ok(self.create_preview(project_id, body)?),
            ("GET", ["api", "projects", project_id, "previews", preview_id]) => ok(self.get_preview(project_id, preview_id)?),
            ("POST", ["api", "projects", project_id, "previews", preview_id, "refresh"]) => ok(self.get_preview(project_id, preview_id)?),
            ("GET", ["api", "projects", project_id, "previews", preview_id, "text"]) => ok(self.preview_text(project_id, preview_id)?),
            ("GET", ["api", "projects", project_id, "previews", preview_id, "sheets"]) => ok(self.preview_sheets(project_id, preview_id)?),
            ("GET", ["api", "projects", project_id, "previews", preview_id, "sheets", sheet_id]) => ok(self.preview_sheet(project_id, preview_id, sheet_id)?),
            ("POST", ["api", "projects", project_id, "previews", preview_id, "open-external"]) => ok(self.open_preview_external(project_id, preview_id)?),
            ("GET", ["api", "projects", project_id, "ai", "context", "search"]) => ok(self.ai_context_search(project_id, &query)),
            ("GET", ["api", "projects", project_id, "ai", "context", "sources"]) => ok(self.ai_sources(project_id)),
            ("POST", ["api", "projects", project_id, "ai", "context", "project-documents"]) => ok(self.ai_source(project_id, body_id(&body, &["documentId"]).unwrap_or("document"), "project_document")),
            ("POST", ["api", "projects", project_id, "ai", "context", "project-images"]) => ok(self.ai_source(project_id, body_id(&body, &["assetId", "documentId"]).unwrap_or("image"), "image")),
            ("POST", ["api", "projects", project_id, "ai", "context", "project-attachments"]) => ok(self.ai_source(project_id, body_id(&body, &["attachmentId", "documentId"]).unwrap_or("attachment"), "external_file")),
            ("POST", ["api", "projects", project_id, "ai", "context", "files"]) => ok(self.ai_upload_sources(project_id, files)),
            ("POST", ["api", "projects", project_id, "ai", "context", "local-files"]) => self.ai_upload_local_sources(project_id, body),
            ("DELETE", ["api", "projects", project_id, "ai", "context", "sources", source_id]) => ok(self.remove_ai_source(project_id, source_id)),
            ("POST", ["api", "projects", project_id, "ai", "context", "sources", source_id, "extend"]) => ok(self.ai_source(project_id, source_id, "external_file")),
            ("GET", ["api", "projects", project_id, "ai", "context", "sources", source_id, "preview"]) => ok(self.ai_source_preview(project_id, source_id)),
            ("POST", ["api", "projects", project_id, "ai", "context", "sources", source_id, "add-to-project"]) => ok(self.add_ai_source_to_project(project_id, source_id, body)?),
            ("POST", ["api", "documents", document_id, "ai", "prompt"]) => ok(knownext_ai::prompt_response(
                body.get("prompt").and_then(Value::as_str).unwrap_or(""),
                body.get("markdown").and_then(Value::as_str).unwrap_or(""),
                Some(document_id),
                self.openai_key().as_deref(),
                self.ai_model().as_str(),
            )),
            ("POST", ["api", "projects", _project_id, "ai", "prompt"]) => ok(knownext_ai::prompt_response(
                body.get("prompt").and_then(Value::as_str).unwrap_or(""),
                "",
                None,
                self.openai_key().as_deref(),
                self.ai_model().as_str(),
            )),
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
                self.delete_openai_key();
                no_content()
            }
            ("GET", ["api", "projects", project_id, "ai", "index", "status"]) => ok(self.ai_index_status(project_id)),
            ("POST", ["api", "projects", project_id, "ai", "index", "rebuild"]) => ok(self.ai_index_status(project_id)),
            ("DELETE", ["api", "projects", project_id, "ai", "index"]) => ok(self.ai_index_status(project_id)),
            ("POST", ["api", "runtime", "select-folder"]) => ok(json!({ "folderPath": body.get("currentPath").and_then(Value::as_str) })),
            ("GET", ["api", "runtime", "logging"]) => ok(self.runtime_logging_status()?),
            ("POST", ["api", "runtime", "logging"]) => ok(self.record_runtime_log(body)?),
            ("POST", ["api", "runtime", "open-folder"]) => ok(self.open_runtime_folder(body)?),
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
    fn context_sources_path(&self, project_id: &str) -> PathBuf { self.app_data_dir.join("ai-context").join(format!("{project_id}.json")) }
    fn image_index_path(&self, project_id: &str) -> PathBuf { self.app_data_dir.join("image-index").join(format!("{project_id}.json")) }

    fn read_json(&self, path: &Path, default: Value) -> Value {
        std::fs::read_to_string(path).ok().and_then(|text| serde_json::from_str(&text).ok()).unwrap_or(default)
    }

    fn write_json(&self, path: &Path, value: &Value) -> Result<(), String> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }
        std::fs::write(path, serde_json::to_string_pretty(value).map_err(|error| error.to_string())?).map_err(|error| error.to_string())
    }

    fn runtime_logging_status(&self) -> Result<Value, String> {
        let log_dir = self.logs_dir();
        std::fs::create_dir_all(&log_dir).map_err(|error| error.to_string())?;
        Ok(json!({
            "enabled": true,
            "folderPath": log_dir.to_string_lossy(),
            "filePath": log_dir.join("knownext.log").to_string_lossy()
        }))
    }

    fn record_runtime_log(&self, body: Value) -> Result<Value, String> {
        let status = self.runtime_logging_status()?;
        let file_path = self.logs_dir().join("knownext.log");
        let level = body.get("level").and_then(Value::as_str).unwrap_or("error");
        let source = body.get("source").and_then(Value::as_str).unwrap_or("local-api");
        let message = body.get("message").and_then(Value::as_str).unwrap_or("");
        let detail = body.get("detail").and_then(Value::as_str).unwrap_or("");
        let mut entry = format!(
            "{} [{}] {}\nMessage: {}\n",
            knownext_core::now_iso(),
            level.to_ascii_uppercase(),
            source,
            message
        );
        if !detail.trim().is_empty() {
            entry.push_str("Detail:\n");
            entry.push_str(detail.trim_end());
            entry.push('\n');
        }
        entry.push_str("---\n");
        use std::io::Write;
        let mut file = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&file_path)
            .map_err(|error| error.to_string())?;
        file.write_all(entry.as_bytes()).map_err(|error| error.to_string())?;
        Ok(status)
    }

    fn open_runtime_folder(&self, body: Value) -> Result<Value, String> {
        let folder_path = body.get("folderPath").and_then(Value::as_str).unwrap_or("");
        if folder_path.trim().is_empty() {
            return Ok(json!({ "opened": false, "message": "No se indicó carpeta local." }));
        }
        std::fs::create_dir_all(folder_path).map_err(|error| error.to_string())?;
        Ok(json!({ "opened": true, "folderPath": folder_path }))
    }

    fn registry(&self) -> Value {
        self.read_json(&self.registry_path(), json!({ "schemaVersion": 2, "activeProjectId": null, "projects": [] }))
    }

    fn write_registry(&self, registry: &Value) -> Result<(), String> {
        self.write_json(&self.registry_path(), registry)
    }

    fn list_projects(&self) -> Vec<Value> {
        self.registry()["projects"]
            .as_array()
            .cloned()
            .unwrap_or_default()
            .into_iter()
            .map(normalize_project_metadata)
            .collect()
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
        let payload_versioning_mode = payload.get("versioningMode").and_then(Value::as_str).unwrap_or("local-git");
        let versioning_mode = normalize_versioning_mode(payload_versioning_mode);
        if versioning_mode != "none" {
            let _ = ensure_git_repo(&root);
        }
        if is_github_sync_mode(payload.get("syncMode").and_then(Value::as_str).unwrap_or("none")) {
            if let Some((owner, repo, _branch)) = github_repository_parts(payload.get("githubRepository").unwrap_or(&Value::Null)) {
                let _ = ensure_github_remote(&root, &owner, &repo);
            }
        }
        let project = json!({
            "id": id,
            "name": payload.get("name").and_then(Value::as_str).unwrap_or("Proyecto"),
            "folderPath": root.to_string_lossy(),
            "icon": payload.get("icon").and_then(Value::as_str).unwrap_or("folder"),
            "iconColor": payload.get("iconColor").and_then(Value::as_str).unwrap_or("#F37021"),
            "storageMode": if is_old_github_versioning_mode(Some(payload_versioning_mode)) { "local-files" } else { payload.get("storageMode").and_then(Value::as_str).unwrap_or("local-files") },
            "versioningMode": versioning_mode,
            "syncMode": payload.get("syncMode").and_then(Value::as_str).unwrap_or("none"),
            "authRequired": payload.get("authRequired").and_then(Value::as_bool).unwrap_or(false),
            "githubRepository": payload.get("githubRepository").cloned().unwrap_or(Value::Null),
            "isGitRepository": root.join(".git").exists(),
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
        normalize_project_metadata_in_place(project);
        for key in ["name", "folderPath", "icon", "iconColor", "storageMode", "versioningMode", "syncMode", "githubRepository"] {
            if let Some(value) = payload.get(key) {
                project[key] = if key == "versioningMode" {
                    Value::from(normalize_versioning_mode(value.as_str().unwrap_or("local-git")))
                } else if key == "storageMode" && is_old_github_versioning_mode(payload.get("versioningMode").and_then(Value::as_str)) {
                    Value::from("local-files")
                } else {
                    value.clone()
                };
            }
        }
        let updated = project.clone();
        self.write_registry(&registry)?;
        Ok(updated)
    }

    fn enable_project_history(&self, project_id: &str) -> Result<Value, String> {
        let root = self.project_root(project_id)?;
        let _ = ensure_git_repo(&root);
        self.update_project_fields(project_id, |project| {
            project["versioningMode"] = Value::from("local-git");
            if project["syncMode"].as_str().unwrap_or("none") == "none" {
                project["syncMode"] = Value::from("manual-local");
            }
            project["isGitRepository"] = Value::Bool(root.join(".git").exists());
        })?;
        Ok(json!({ "status": "enabled", "message": "Historial local preparado desde Rust/Tauri.", "projectId": project_id }))
    }

    fn change_project_sync_mode(&self, project_id: &str, body: Value) -> Result<Value, String> {
        let sync_mode = body.get("syncMode").and_then(Value::as_str).unwrap_or("manual-local");
        self.update_project_fields(project_id, |project| {
            project["syncMode"] = Value::from(sync_mode);
            if sync_mode != "none" {
                project["versioningMode"] = Value::from("local-git");
                project["isGitRepository"] = Value::Bool(true);
            }
        })?;
        Ok(self.sync_status(project_id))
    }

    fn connect_project_github(&self, project_id: &str, body: Value, publishing: bool) -> Result<Value, String> {
        let owner = body.get("owner").and_then(Value::as_str).unwrap_or("").trim();
        let repo = body.get("repo").and_then(Value::as_str).unwrap_or("").trim();
        if owner.is_empty() || repo.is_empty() {
            return Err("Falta repositorio GitHub".to_string());
        }
        let sync_mode = body.get("syncMode").and_then(Value::as_str).unwrap_or("manual-github");
        let permissions = if publishing { json!(["pull", "push"]) } else { json!(["pull"]) };
        let github_repository = json!({
            "owner": owner,
            "repo": repo,
            "defaultRef": body.get("defaultRef").cloned().unwrap_or(Value::Null),
            "rootPath": body.get("rootPath").and_then(Value::as_str).unwrap_or(""),
            "permissions": permissions
        });
        let root = self.project_root(project_id)?;
        let _ = ensure_git_repo(&root);
        let _ = ensure_github_remote(&root, owner, repo);
        self.update_project_fields(project_id, |project| {
            project["versioningMode"] = Value::from("local-git");
            project["syncMode"] = Value::from(sync_mode);
            project["githubRepository"] = github_repository.clone();
            project["isGitRepository"] = Value::Bool(root.join(".git").exists());
            project["authRequired"] = Value::Bool(true);
        })?;
        Ok(self.sync_status(project_id))
    }

    fn update_project_fields<F>(&self, project_id: &str, mut update: F) -> Result<Value, String>
    where
        F: FnMut(&mut Value),
    {
        let mut registry = self.registry();
        let projects = registry["projects"].as_array_mut().ok_or("Registro de proyectos inválido")?;
        let project = projects.iter_mut().find(|project| project["id"].as_str() == Some(project_id)).ok_or("Proyecto no encontrado")?;
        update(project);
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
        let moved_files = moved_file_mappings(&self.project_root(project_id)?, &old_path, &old_relative, &new_relative)?;
        std::fs::rename(old_path, new_path).map_err(|error| error.to_string())?;
        let mut affected = moved_markdown_affected_documents(project_id, &moved_files);
        affected.extend(self.apply_reference_updates_after_move(project_id, &moved_files)?);
        self.file_result(project_id, Some(new_relative.clone()), dedupe_affected_documents(affected))
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
        let moved_files = moved_file_mappings(&self.project_root(project_id)?, &old_path, &old_relative, &new_relative)?;
        std::fs::rename(old_path, new_path).map_err(|error| error.to_string())?;
        let mut affected = moved_markdown_affected_documents(project_id, &moved_files);
        affected.extend(self.apply_reference_updates_after_move(project_id, &moved_files)?);
        self.file_result(project_id, Some(new_relative.clone()), dedupe_affected_documents(affected))
    }

    fn delete_node(&self, project_id: &str, node_id: &str) -> Result<Value, String> {
        let relative = document_ref_path(node_id)?;
        let path = self.resolve_project_relative(project_id, &relative)?;
        let affected = deleted_markdown_affected_documents(project_id, &self.project_root(project_id)?, &path)?;
        if path.is_dir() {
            std::fs::remove_dir_all(path).map_err(|error| error.to_string())?;
        } else {
            std::fs::remove_file(path).map_err(|error| error.to_string())?;
        }
        self.file_result(project_id, None, affected)
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
        let draft = self.read_draft(document_id);
        let draft_markdown = draft.as_ref().and_then(|value| value["markdown"].as_str()).unwrap_or(&markdown);
        let draft_updated_at = draft.as_ref().and_then(|value| value["draftUpdatedAt"].as_str()).map(Value::from).unwrap_or(Value::Null);
        let has_draft = draft.is_some() && normalize_markdown(draft_markdown) != normalize_markdown(&markdown);
        Ok(json!({
            "id": document_id,
            "name": path.file_name().and_then(|value| value.to_str()).unwrap_or("documento.md"),
            "path": relative,
            "projectId": project_id,
            "markdown": draft_markdown,
            "diskMarkdown": markdown,
            "wordCount": knownext_core::word_count(draft_markdown),
            "updatedAt": knownext_core::now_iso(),
            "baseFingerprint": self.fingerprint(&path),
            "hasDraft": has_draft,
            "isDirty": has_draft,
            "diskChanged": false,
            "orphaned": false,
            "conflictStatus": if has_draft { "draft" } else { "none" },
            "draftUpdatedAt": draft_updated_at
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
        let path = self.draft_path(document_id);
        self.write_json(&path, &json!({ "documentId": document_id, "markdown": payload.get("markdown").cloned().unwrap_or(Value::String(String::new())), "baseFingerprint": payload.get("baseFingerprint").cloned().unwrap_or(Value::Null), "draftUpdatedAt": knownext_core::now_iso() }))?;
        ok_value(json!({ "documentId": document_id, "draftUpdatedAt": knownext_core::now_iso(), "isDirty": true }))
    }

    fn delete_draft(&self, document_id: &str) {
        let _ = std::fs::remove_file(self.draft_path(document_id));
    }

    fn draft_path(&self, document_id: &str) -> PathBuf {
        self.app_data_dir.join("drafts").join(safe_name(document_id)).with_extension("json")
    }

    fn draft_key_path(&self, draft_key: &str) -> PathBuf {
        self.app_data_dir.join("drafts").join(safe_name(draft_key)).with_extension("json")
    }

    fn read_draft(&self, document_id: &str) -> Option<Value> {
        let path = self.draft_path(document_id);
        if !path.exists() {
            return None;
        }
        let draft = self.read_json(&path, Value::Null);
        if draft.is_null() { None } else { Some(draft) }
    }

    fn read_draft_key(&self, draft_key: &str) -> Option<Value> {
        let path = self.draft_key_path(draft_key);
        if !path.exists() {
            return None;
        }
        let draft = self.read_json(&path, Value::Null);
        if draft.is_null() { None } else { Some(draft) }
    }

    fn discard_draft_key(&self, draft_key: &str) {
        let _ = std::fs::remove_file(self.draft_key_path(draft_key));
    }

    fn orphan_drafts(&self) -> Value {
        let drafts_dir = self.app_data_dir.join("drafts");
        let mut drafts = Vec::new();
        let Ok(entries) = std::fs::read_dir(drafts_dir) else { return json!([]) };

        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|value| value.to_str()) != Some("json") {
                continue;
            }
            let draft = self.read_json(&path, Value::Null);
            let document_id = draft["documentId"].as_str().unwrap_or("");
            let Ok((project_id, relative)) = document_ref(document_id) else { continue };
            let document_path = self.resolve_project_relative(&project_id, &relative);
            let exists = document_path.as_ref().map(|path| path.exists()).unwrap_or(false);
            if exists {
                continue;
            }
            let draft_key = path.file_stem().and_then(|value| value.to_str()).unwrap_or("").to_string();
            let recoverable = document_path.is_ok();
            drafts.push(json!({
                "draftKey": draft_key,
                "documentId": document_id,
                "projectId": project_id,
                "path": relative,
                "name": relative.rsplit('/').next().unwrap_or(&relative),
                "wordCount": knownext_core::word_count(draft["markdown"].as_str().unwrap_or("")),
                "createdAt": draft["draftUpdatedAt"].clone(),
                "draftUpdatedAt": draft["draftUpdatedAt"].clone(),
                "recoverable": recoverable,
                "reason": if recoverable { Value::Null } else { Value::String("Proyecto no disponible".to_string()) }
            }));
        }

        drafts.sort_by(|left, right| {
            right["draftUpdatedAt"].as_str().unwrap_or("").cmp(left["draftUpdatedAt"].as_str().unwrap_or(""))
        });
        Value::Array(drafts)
    }

    fn restore_orphan_draft(&self, draft_key: &str) -> Result<Value, String> {
        let draft = self.read_draft_key(draft_key).ok_or("Draft no disponible")?;
        let document_id = draft["documentId"].as_str().ok_or("Draft sin documentId")?;
        let path = self.resolve_document_path(document_id)?;
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }
        std::fs::write(&path, draft["markdown"].as_str().unwrap_or("")).map_err(|error| error.to_string())?;
        self.discard_draft_key(draft_key);
        Ok(json!({ "document": self.get_document(document_id)? }))
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
            let path = self.resolve_document_path(id).ok();
            let exists = path.as_ref().map(|path| path.exists()).unwrap_or(false);
            let current_fingerprint = path.as_ref().filter(|path| path.exists()).map(|path| self.fingerprint(path)).unwrap_or(Value::Null);
            let base_fingerprint = item.get("baseFingerprint").cloned().unwrap_or(Value::Null);
            let has_draft = self.read_draft(id).is_some();
            let orphaned = !exists && has_draft;
            let disk_changed = exists && !base_fingerprint.is_null() && current_fingerprint != base_fingerprint;
            let conflict_status = if orphaned {
                "orphaned"
            } else if has_draft {
                "draft"
            } else if disk_changed {
                "disk-changed"
            } else {
                "none"
            };
            json!({ "documentId": id, "exists": exists, "currentFingerprint": current_fingerprint, "diskChanged": disk_changed, "hasDraft": has_draft, "orphaned": orphaned, "conflictStatus": conflict_status, "versionState": "ok", "localChanged": has_draft || disk_changed, "remoteChanged": false, "localVersionHash": null, "remoteVersionHash": null, "message": null })
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
        let title = body.get("title").and_then(Value::as_str).unwrap_or("Version local");
        let root = self.project_root(project_id)?;
        if root.join(".git").exists() {
            let (_, relative) = document_ref(document_id)?;
            git_add_path(&root, &relative)?;
            git_commit_all(&root, title)?;
        }
        let hash = git_head_hash(&root)?.unwrap_or_else(|| id.chars().rev().take(8).collect::<String>());
        let version = json!({ "id": id, "hash": hash, "title": title, "author": "KnowNext.ai", "authorInitials": "KN", "createdAt": knownext_core::now_iso(), "relativeTime": "ahora", "current": true, "markdown": document["markdown"], "projectId": project_id });
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

    fn read_config(&self) -> Value {
        let mut config = self.read_json(&self.config_path(), default_config());
        let original = config.clone();
        normalize_config(&mut config);
        if config != original {
            let _ = self.write_json(&self.config_path(), &config);
        }
        config
    }
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
        normalize_config(&mut config);
        config["updatedAt"] = Value::from(knownext_core::now_iso());
        let _ = self.write_json(&self.config_path(), &config);
        self.ai_config_status()
    }
    fn openai_key(&self) -> Option<String> {
        self.credentials()
            .get("openaiKey")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_string)
    }
    fn github_access_token(&self) -> Option<String> {
        let credentials = self.credentials();
        credentials
            .get("github")
            .and_then(|github| github.get("accessToken"))
            .or_else(|| credentials.get("accessToken"))
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_string)
    }
    fn credentials(&self) -> Value {
        self.read_json(&self.credentials_path(), json!({}))
    }
    fn update_credentials<F>(&self, mut update: F) -> Value
    where
        F: FnMut(&mut serde_json::Map<String, Value>),
    {
        let mut credentials = self.credentials();
        if !credentials.is_object() {
            credentials = json!({});
        }
        if let Some(object) = credentials.as_object_mut() {
            update(object);
        }
        let _ = self.write_json(&self.credentials_path(), &credentials);
        credentials
    }
    fn ai_model(&self) -> String {
        self.read_config()["ai"]["model"].as_str().unwrap_or("gpt-5.4-mini").to_string()
    }
    fn transcribe_audio(&self, body: Value, files: Vec<LocalApiFile>) -> Value {
        let Some(file) = files.into_iter().find(|file| file.field_name == "file") else {
            return json!({ "status": "error", "error": "missing_audio", "transcript": "", "message": "No se recibió audio para transcribir." });
        };
        let bytes = match base64::engine::general_purpose::STANDARD.decode(file.data_base64) {
            Ok(bytes) => bytes,
            Err(error) => return json!({ "status": "error", "error": "invalid_audio", "transcript": "", "message": error.to_string() }),
        };
        knownext_ai::transcribe_audio(
            self.openai_key().as_deref(),
            body.get("language").and_then(Value::as_str),
            bytes,
        )
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
        if is_github_auth_without_credentials(&auth, self.github_access_token().is_some()) {
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
        self.update_credentials(|credentials| {
            credentials.insert("github".to_string(), json!({
                "provider": "github",
                "accessToken": access_token,
                "scopes": scopes,
                "updatedAt": knownext_core::now_iso()
            }));
            credentials.remove("provider");
            credentials.remove("accessToken");
            credentials.remove("scopes");
        });
        let _ = self.write_json(&self.auth_path(), &auth);
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
        self.update_credentials(|credentials| {
            credentials.remove("github");
            credentials.remove("provider");
            credentials.remove("accessToken");
            credentials.remove("scopes");
        });
        let _ = std::fs::remove_file(self.github_device_path());
        default_auth_status()
    }

    fn github_repositories(&self) -> Value {
        let Some(token) = self.github_access_token() else {
            return json!([]);
        };

        let response = github_http_client()
            .get("https://api.github.com/user/repos?per_page=100&sort=updated")
            .bearer_auth(token)
            .send();

        let Ok(response) = response else {
            return json!([]);
        };
        if !response.status().is_success() {
            return json!([]);
        }

        let repos = response.json::<Value>().unwrap_or_else(|_| json!([]));
        let list = repos.as_array().cloned().unwrap_or_default().into_iter().filter_map(|repo| {
            let full_name = repo.get("full_name").and_then(Value::as_str).unwrap_or("");
            let (owner, name) = full_name.split_once('/').unwrap_or(("", ""));
            if owner.is_empty() || name.is_empty() {
                return None;
            }
            let permissions = repo.get("permissions").cloned().unwrap_or_else(|| json!({}));
            let mut access = Vec::new();
            if permissions.get("pull").and_then(Value::as_bool).unwrap_or(true) {
                access.push("pull");
            }
            if permissions.get("push").and_then(Value::as_bool).unwrap_or(false) {
                access.push("push");
            }
            if permissions.get("admin").and_then(Value::as_bool).unwrap_or(false) {
                access.push("admin");
            }
            Some(json!({
                "owner": owner,
                "repo": name,
                "defaultRef": repo.get("default_branch").and_then(Value::as_str),
                "rootPath": "",
                "permissions": access,
                "private": repo.get("private").and_then(Value::as_bool).unwrap_or(false),
                "updatedAt": repo.get("updated_at").and_then(Value::as_str)
            }))
        }).collect::<Vec<_>>();

        Value::Array(list)
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
        let versioning_mode = project["versioningMode"].as_str().unwrap_or("none");
        let root = project["folderPath"].as_str().map(PathBuf::from);
        let git_available = root.as_ref().map(|root| root.join(".git").exists()).unwrap_or(false);
        let enabled = versioning_mode != "none";
        let available = enabled && git_available;
        let local_changes = root.as_ref()
            .filter(|_| available)
            .and_then(|root| git_status_items(root).ok())
            .map(|items| !items.is_empty())
            .unwrap_or(false);
        let last_hash = root.as_ref().filter(|_| available).and_then(|root| git_head_hash(root).ok()).flatten();
        let reason = if !enabled {
            Value::from("Historial no disponible en proyectos de archivos locales")
        } else if !available {
            Value::from("Git local no está inicializado para este proyecto")
        } else {
            Value::Null
        };
        json!({
            "enabled": enabled,
            "available": available,
            "reason": reason,
            "storageMode": project["storageMode"],
            "versioningMode": project["versioningMode"],
            "syncMode": project["syncMode"],
            "statusLabel": if available { "Historial local" } else { "Sin historial" },
            "hasLocalChanges": local_changes,
            "hasRemoteChanges": false,
            "lastVersionHash": last_hash,
            "lastVersionRelativeTime": if last_hash.is_some() { Value::from("reciente") } else { Value::Null }
        })
    }
    fn sync_status(&self, project_id: &str) -> Value {
        let project = self.list_projects().into_iter().find(|project| project["id"].as_str() == Some(project_id)).unwrap_or_default();
        let sync_mode = project["syncMode"].as_str().unwrap_or("none");
        let is_github = is_github_sync_mode(sync_mode);
        let root = project["folderPath"].as_str().map(PathBuf::from);
        let local_changes = root
            .as_ref()
            .filter(|root| root.join(".git").exists())
            .and_then(|root| git_status_items(root).ok())
            .map(|items| !items.is_empty())
            .unwrap_or(false);
        let local_hash = root
            .as_ref()
            .filter(|root| root.join(".git").exists())
            .and_then(|root| git_head_hash(root).ok())
            .flatten();
        if is_github {
            let mode = if sync_mode == "auto-github" { "github-auto" } else { "github-manual" };
            let authenticated = self.auth_status()["isAuthenticated"].as_bool().unwrap_or(false);
            if authenticated {
                let Some(root) = root.as_ref() else {
                    return github_remote_status(project_id, mode, "error", "Proyecto sin carpeta local", "La carpeta local del proyecto no está disponible.", "missing-local-folder", true, local_changes, local_hash.clone(), None, false, false);
                };
                if !root.join(".git").exists() {
                    return github_remote_status(project_id, mode, "local-history", "Git local no inicializado", "Inicializa el historial local antes de sincronizar con GitHub.", "missing-local-git", true, local_changes, local_hash.clone(), None, false, false);
                }
                let Some((owner, repo, default_branch)) = github_repository_parts(project.get("githubRepository").unwrap_or(&Value::Null)) else {
                    return github_remote_status(project_id, mode, "local-history", "Repositorio GitHub incompleto", "Configura owner/repo para activar la sincronización remota.", "missing-remote-config", true, local_changes, local_hash.clone(), None, local_hash.is_some(), false);
                };
                let branch = default_branch.unwrap_or_else(|| current_git_branch(root).unwrap_or_else(|| "main".to_string()));
                if git_remote_url(root, "origin").ok().flatten().is_none() {
                    let _ = ensure_github_remote(root, &owner, &repo);
                }
                if git_remote_url(root, "origin").ok().flatten().is_none() {
                    return github_remote_status(project_id, mode, "local-history", "GitHub sin remoto local", "El proyecto tiene GitHub configurado, pero el repositorio Git local no tiene origin.", "missing-origin", true, local_changes, local_hash.clone(), None, local_hash.is_some(), false);
                }
                let Some(token) = self.github_access_token() else {
                    return github_remote_status(project_id, mode, "local-history", "GitHub pausado", "Sin credenciales GitHub activas. El historial local sigue disponible y la sincronización remota queda pausada.", "unauthenticated", true, local_changes, local_hash.clone(), None, local_hash.is_some() || local_changes, false);
                };
                let remote_hash = match git_remote_head_hash(root, &token, "origin", &branch) {
                    Ok(hash) => hash,
                    Err(message) => {
                        let remote = classify_git_remote_error(&message);
                        return github_remote_status(project_id, mode, remote.state, remote.label, &remote.detail, remote.access, true, local_changes, local_hash.clone(), None, local_hash.is_some() || local_changes, false);
                    }
                };
                let pending_push = local_hash.is_some() && (local_changes || remote_hash.as_ref() != local_hash.as_ref());
                let pending_pull = remote_hash.is_some() && local_hash.is_some() && remote_hash.as_ref() != local_hash.as_ref() && !local_changes;
                let state = if local_changes || pending_push { "local-pending" } else if pending_pull { "remote-available" } else { "local-history" };
                return json!({
                    "projectId": project_id,
                    "mode": mode,
                    "state": state,
                    "label": "GitHub conectado",
                    "detail": if local_changes { "Hay cambios locales sin guardar en historial. GitHub esperará." } else { "El historial local está activo y la sincronización remota está disponible." },
                    "remoteAccess": "available",
                    "remotePaused": false,
                    "remoteReason": null,
                    "remoteAction": null,
                    "localState": if local_changes { "dirty" } else if pending_push { "pending-push" } else { "clean" },
                    "pendingPush": pending_push,
                    "pendingPull": pending_pull,
                    "hasConflicts": false,
                    "lastSyncAt": null,
                    "lastLocalVersionHash": local_hash,
                    "lastRemoteHash": remote_hash,
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
                "localState": if local_changes { "dirty" } else { "clean" },
                "pendingPush": local_hash.is_some() || local_changes,
                "pendingPull": false,
                "hasConflicts": false,
                "lastSyncAt": null,
                "lastLocalVersionHash": local_hash,
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
            "localState": if local_changes { "dirty" } else { "clean" },
            "pendingPush": false,
            "pendingPull": false,
            "hasConflicts": false,
            "lastSyncAt": null,
            "lastLocalVersionHash": local_hash,
            "lastRemoteHash": null,
            "conflicts": []
        })
    }
    fn sync_operation(&self, project_id: &str, direction: &str) -> Value {
        let status = self.sync_status(project_id);
        let remote_paused = status["remotePaused"].as_bool().unwrap_or(false);
        if remote_paused {
            return json!({
                "status": "paused",
                "message": status["detail"].as_str().unwrap_or("La sincronización remota está pausada."),
                "projectId": project_id,
                "direction": direction,
                "remoteAccess": status["remoteAccess"].clone(),
                "remotePaused": true
            });
        }
        let project = self.list_projects().into_iter().find(|project| project["id"].as_str() == Some(project_id)).unwrap_or_default();
        let sync_mode = project["syncMode"].as_str().unwrap_or("none");
        if is_github_sync_mode(sync_mode) {
            let Some(token) = self.github_access_token() else {
                return json!({ "status": "paused", "message": "Sin cuenta GitHub. El historial local sigue disponible.", "projectId": project_id, "direction": direction, "remoteAccess": "unauthenticated", "remotePaused": true });
            };
            let Some(root) = project["folderPath"].as_str().map(PathBuf::from) else {
                return json!({ "status": "error", "message": "La carpeta local del proyecto no está disponible.", "projectId": project_id, "direction": direction, "remoteAccess": "missing-local-folder", "remotePaused": true });
            };
            if !root.join(".git").exists() {
                return json!({ "status": "error", "message": "Git local no está inicializado para este proyecto.", "projectId": project_id, "direction": direction, "remoteAccess": "missing-local-git", "remotePaused": true });
            }
            if git_remote_url(&root, "origin").ok().flatten().is_none() {
                if let Some((owner, repo, _branch)) = github_repository_parts(project.get("githubRepository").unwrap_or(&Value::Null)) {
                    let _ = ensure_github_remote(&root, &owner, &repo);
                }
            }
            let branch = github_repository_parts(project.get("githubRepository").unwrap_or(&Value::Null))
                .and_then(|(_, _, branch)| branch)
                .or_else(|| current_git_branch(&root))
                .unwrap_or_else(|| "main".to_string());
            if direction == "push" {
                if !git_status_items(&root).unwrap_or_default().is_empty() {
                    return json!({ "status": "local-pending", "message": "Guarda primero los cambios en el historial local antes de subir a GitHub.", "projectId": project_id, "direction": direction, "remoteAccess": "available", "remotePaused": false });
                }
                if git_head_hash(&root).ok().flatten().is_none() {
                    return json!({ "status": "local-pending", "message": "No hay ninguna versión local que subir a GitHub.", "projectId": project_id, "direction": direction, "remoteAccess": "available", "remotePaused": false });
                }
                return match git_push_origin(&root, &token, &branch) {
                    Ok(()) => json!({ "status": "synced", "message": "Historial local subido a GitHub.", "projectId": project_id, "direction": direction, "remoteAccess": "available", "remotePaused": false }),
                    Err(message) => {
                        let remote = classify_git_remote_error(&message);
                        json!({ "status": "paused", "message": remote.detail, "projectId": project_id, "direction": direction, "remoteAccess": remote.access, "remotePaused": true })
                    },
                };
            }
            if direction == "pull" {
                if !git_status_items(&root).unwrap_or_default().is_empty() {
                    return json!({ "status": "local-pending", "message": "Guarda o descarta primero los cambios locales antes de traer cambios de GitHub.", "projectId": project_id, "direction": direction, "remoteAccess": "available", "remotePaused": false });
                }
                return match git_pull_ff_only(&root, &token, &branch) {
                    Ok(()) => json!({ "status": "synced", "message": "Proyecto actualizado desde GitHub.", "projectId": project_id, "direction": direction, "remoteAccess": "available", "remotePaused": false }),
                    Err(message) => {
                        let remote = classify_git_remote_error(&message);
                        json!({ "status": "paused", "message": remote.detail, "projectId": project_id, "direction": direction, "remoteAccess": remote.access, "remotePaused": true })
                    },
                };
            }
        }
        let message = match direction {
            "pull" => "No hay cambios remotos pendientes. El proyecto local sigue disponible.",
            "push" => "No hay cambios locales pendientes de envío. El historial local está al día.",
            _ => "Sincronización local actualizada.",
        };
        json!({
            "status": "synced",
            "message": message,
            "projectId": project_id,
            "direction": direction,
            "remoteAccess": status["remoteAccess"].clone(),
            "remotePaused": false
        })
    }
    fn external_changes(&self, project_id: &str) -> Value {
        let Ok(root) = self.project_root(project_id) else {
            return external_change_set(project_id, Vec::new(), Some("Proyecto no encontrado".to_string()));
        };
        if !root.join(".git").exists() {
            return external_change_set(project_id, Vec::new(), Some("El historial Git local no está inicializado para este proyecto.".to_string()));
        }
        match git_status_items(&root) {
            Ok(items) => external_change_set(project_id, items, None),
            Err(message) => external_change_set(project_id, Vec::new(), Some(message)),
        }
    }
    fn import_external_changes(&self, project_id: &str, body: Value) -> Result<Value, String> {
        let root = self.project_root(project_id)?;
        if !root.join(".git").exists() {
            return Ok(json!({ "status": "unsupported", "message": "El historial Git local no está inicializado.", "tree": self.project_tree(project_id)?, "versionTitle": null, "syncedAt": null, "pendingRemoteSync": false }));
        }
        let current_items = git_status_items(&root)?;
        let decisions = body["decisions"].as_array().cloned().unwrap_or_default();
        let mut decision_by_id = BTreeMap::new();
        for decision in decisions {
            if let (Some(item_id), Some(value)) = (decision["itemId"].as_str(), decision["decision"].as_str()) {
                decision_by_id.insert(item_id.to_string(), value.to_string());
            }
        }

        let included = current_items.into_iter().filter(|item| {
            let id = item["id"].as_str().unwrap_or("");
            let default_decision = item["decision"].as_str().unwrap_or("review");
            let decision = decision_by_id.get(id).map(String::as_str).unwrap_or(default_decision);
            decision == "include"
        }).collect::<Vec<_>>();

        if included.is_empty() {
            return Ok(json!({ "status": "synced", "message": "No se incluyeron cambios externos en el historial.", "tree": self.project_tree(project_id)?, "versionTitle": null, "syncedAt": knownext_core::now_iso(), "pendingRemoteSync": false }));
        }

        for item in &included {
            if let Some(relative) = item["path"].as_str() {
                git_add_path(&root, relative)?;
            }
        }
        let title = format!("Cambios externos importados ({})", included.len());
        git_commit_all(&root, &title)?;
        let _ = self.record_activity(project_id, json!({
            "type": "external-changes-imported",
            "scope": "history",
            "title": "Cambios externos importados",
            "message": format!("{} cambio(s) añadidos al historial local.", included.len()),
            "tone": "success"
        }));
        Ok(json!({ "status": "synced", "message": "Cambios externos añadidos al historial local.", "tree": self.project_tree(project_id)?, "versionTitle": title, "syncedAt": knownext_core::now_iso(), "pendingRemoteSync": self.sync_status(project_id)["mode"].as_str().unwrap_or("") != "local-history" }))
    }

    fn asset_metadata(&self, project_id: &str, asset_id: &str) -> Result<Value, String> {
        let path = self.resolve_document_path(asset_id).or_else(|_| self.resolve_project_relative(project_id, asset_id))?;
        let metadata = std::fs::metadata(&path).map_err(|error| error.to_string())?;
        let relative = path.strip_prefix(self.project_root(project_id)?).unwrap_or(&path).to_string_lossy().replace('\\', "/");
        let usage_count = self.asset_references(project_id, Some(&relative))?.len();
        let indexed = self.image_index_entry(project_id, &relative).is_some();
        let is_image = is_image_path(&path);
        Ok(json!({
            "id": doc_id(project_id, &relative),
            "projectId": project_id,
            "name": path.file_name().and_then(|value| value.to_str()).unwrap_or("asset"),
            "path": relative,
            "mimeType": mime_for_path(&path),
            "sizeBytes": metadata.len(),
            "width": null,
            "height": null,
            "colorDepthBits": null,
            "updatedAt": knownext_core::now_iso(),
            "usageCount": usage_count,
            "indexed": indexed,
            "indexStatus": if is_image { if indexed { "indexed" } else { "not-indexed" } } else { "not-applicable" },
            "visualDescription": null
        }))
    }
    fn asset_usage(&self, project_id: &str, asset_id: &str) -> Result<Value, String> {
        let asset = self.asset_metadata(project_id, asset_id)?;
        let relative = asset["path"].as_str().unwrap_or("");
        Ok(json!({ "asset": asset, "references": self.asset_references(project_id, Some(relative))? }))
    }
    fn reindex_project_images(&self, project_id: &str) -> Result<Value, String> {
        let root = self.project_root(project_id)?;
        let mut images = Vec::new();
        for path in collect_project_files(&root)? {
            if !is_image_path(&path) {
                continue;
            }
            let metadata = std::fs::metadata(&path).map_err(|error| error.to_string())?;
            let relative = relative_from_root(&root, &path);
            let usage_count = self.asset_references(project_id, Some(&relative))?.len();
            images.push(json!({
                "id": doc_id(project_id, &relative),
                "path": relative,
                "name": path.file_name().and_then(|value| value.to_str()).unwrap_or("image"),
                "mimeType": mime_for_path(&path),
                "sizeBytes": metadata.len(),
                "usageCount": usage_count,
                "indexedAt": knownext_core::now_iso(),
                "status": "indexed"
            }));
        }
        images.sort_by(|left, right| left["path"].as_str().unwrap_or("").cmp(right["path"].as_str().unwrap_or("")));
        let indexed_at = knownext_core::now_iso();
        let count = images.len();
        self.write_json(&self.image_index_path(project_id), &json!({
            "projectId": project_id,
            "indexedAt": indexed_at,
            "images": images
        }))?;
        Ok(json!({
            "projectId": project_id,
            "imageCount": count,
            "indexedImageCount": count,
            "status": "updated",
            "indexedAt": indexed_at
        }))
    }
    fn image_index_entry(&self, project_id: &str, relative: &str) -> Option<Value> {
        let index = self.read_json(&self.image_index_path(project_id), json!({ "images": [] }));
        index["images"].as_array()?.iter().find(|image| image["path"].as_str() == Some(relative)).cloned()
    }
    fn asset_references(&self, project_id: &str, asset_relative: Option<&str>) -> Result<Vec<Value>, String> {
        let root = self.project_root(project_id)?;
        let mut references = Vec::new();
        for path in collect_project_files(&root)? {
            if !is_markdown_path(&path) {
                continue;
            }
            let document_path = relative_from_root(&root, &path);
            let document_id = doc_id(project_id, &document_path);
            let document_name = path.file_name().and_then(|value| value.to_str()).unwrap_or("documento.md").to_string();
            let markdown = std::fs::read_to_string(&path).unwrap_or_default();
            for reference in markdown_image_references(&markdown, project_id, &document_id, &document_name, &document_path) {
                let resolved = reference["resolvedAssetPath"].as_str();
                if asset_relative.map(|relative| resolved == Some(relative)).unwrap_or(true) {
                    references.push(reference);
                }
            }
        }
        references.sort_by(|left, right| {
            (
                left["documentPath"].as_str().unwrap_or(""),
                left["line"].as_u64().unwrap_or(0),
                left["column"].as_u64().unwrap_or(0),
            ).cmp(&(
                right["documentPath"].as_str().unwrap_or(""),
                right["line"].as_u64().unwrap_or(0),
                right["column"].as_u64().unwrap_or(0),
            ))
        });
        Ok(references)
    }
    fn image_reference(&self, project_id: &str, document_id: &str, body: Value) -> Result<Value, String> {
        let asset_id = body.get("assetId").and_then(Value::as_str).unwrap_or("");
        let asset = self.asset_metadata(project_id, asset_id)?;
        let alt = body.get("altText").and_then(Value::as_str).unwrap_or_else(|| asset["name"].as_str().unwrap_or("Imagen"));
        let target = document_ref_path(document_id)
            .ok()
            .map(|document_path| relative_link_target(&document_path, asset["path"].as_str().unwrap_or("")))
            .unwrap_or_else(|| asset["path"].as_str().unwrap_or("").to_string());
        Ok(json!({ "markdown": format!("![{}]({})", alt, target), "asset": asset, "documentId": document_id }))
    }
    fn document_move_impact(&self, project_id: &str, document_id: &str) -> Result<Value, String> {
        let (_, relative) = document_ref(document_id)?;
        let references = self.asset_references(project_id, None)?
            .into_iter()
            .filter(|reference| reference["documentId"].as_str() == Some(document_id))
            .collect::<Vec<_>>();
        let mut shared_asset_paths = Vec::new();
        for reference in &references {
            let Some(asset_path) = reference["resolvedAssetPath"].as_str() else {
                continue;
            };
            if shared_asset_paths.iter().any(|path: &String| path == asset_path) {
                continue;
            }
            if self.asset_references(project_id, Some(asset_path))?.len() > 1 {
                shared_asset_paths.push(asset_path.to_string());
            }
        }
        let message = if references.is_empty() {
            "Sin referencias de imagen que actualizar."
        } else {
            "El documento contiene referencias de imagen; al moverlo se deben revisar rutas relativas."
        };
        Ok(json!({ "documentId": document_id, "documentPath": relative, "references": references, "sharedAssetPaths": shared_asset_paths, "message": message }))
    }
    fn apply_reference_updates_after_move(&self, project_id: &str, moved_files: &[(String, String)]) -> Result<Vec<Value>, String> {
        let root = self.project_root(project_id)?;
        let image_mapping = moved_files
            .iter()
            .filter(|(old, new)| is_image_path(Path::new(old)) || is_image_path(Path::new(new)))
            .cloned()
            .collect::<BTreeMap<_, _>>();
        let moved_doc_by_new = moved_files
            .iter()
            .filter(|(old, new)| is_markdown_path(Path::new(old)) || is_markdown_path(Path::new(new)))
            .map(|(old, new)| (new.clone(), old.clone()))
            .collect::<BTreeMap<_, _>>();
        if image_mapping.is_empty() && moved_doc_by_new.is_empty() {
            return Ok(Vec::new());
        }

        let mut affected = Vec::new();
        for path in collect_project_files(&root)? {
            if !is_markdown_path(&path) {
                continue;
            }
            let current_relative = relative_from_root(&root, &path);
            let old_document_relative = moved_doc_by_new.get(&current_relative).map(String::as_str).unwrap_or(&current_relative);
            let markdown = std::fs::read_to_string(&path).unwrap_or_default();
            let rewritten = rewrite_markdown_image_targets(&markdown, old_document_relative, &current_relative, &image_mapping);
            if rewritten == markdown {
                continue;
            }
            std::fs::write(&path, rewritten).map_err(|error| error.to_string())?;
            affected.push(json!({
                "oldId": doc_id(project_id, old_document_relative),
                "newId": doc_id(project_id, &current_relative),
                "name": path.file_name().and_then(|value| value.to_str()).unwrap_or("documento.md"),
                "path": current_relative,
                "referenceUpdated": true
            }));
        }
        if !image_mapping.is_empty() {
            let _ = self.reindex_project_images(project_id);
        }
        Ok(affected)
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
    fn preview_sheets(&self, project_id: &str, preview_id: &str) -> Result<Value, String> {
        let preview = self.get_preview(project_id, preview_id)?;
        if preview["format"].as_str() != Some("xlsx") {
            return Ok(json!({ "previewId": preview_id, "sheets": [] }));
        }
        let path = self.resolve_project_relative(project_id, preview["path"].as_str().unwrap_or(""))?;
        Ok(json!({ "previewId": preview_id, "sheets": knownext_docs::xlsx_sheet_summaries(&path) }))
    }
    fn preview_sheet(&self, project_id: &str, preview_id: &str, sheet_id: &str) -> Result<Value, String> {
        let preview = self.get_preview(project_id, preview_id)?;
        if preview["format"].as_str() != Some("xlsx") {
            return Err("La vista no es una hoja de cálculo".to_string());
        }
        let path = self.resolve_project_relative(project_id, preview["path"].as_str().unwrap_or(""))?;
        let mut sheet = knownext_docs::xlsx_sheet(&path, sheet_id).ok_or_else(|| "Hoja no encontrada".to_string())?;
        sheet["previewId"] = Value::from(preview_id);
        Ok(sheet)
    }
    fn open_preview_external(&self, project_id: &str, preview_id: &str) -> Result<Value, String> {
        let preview = self.get_preview(project_id, preview_id)?;
        let path = self.resolve_project_relative(project_id, preview["path"].as_str().unwrap_or(""))?;
        match open_path_external(&path) {
            Ok(()) => Ok(json!({ "opened": true, "filePath": path.to_string_lossy(), "message": "Documento abierto con la aplicación predeterminada del sistema." })),
            Err(message) => Ok(json!({ "opened": false, "filePath": path.to_string_lossy(), "message": message }))
        }
    }

    fn ai_context_search(&self, project_id: &str, query: &BTreeMap<String, String>) -> Value {
        let needle = query.get("q").map(|value| value.to_ascii_lowercase()).unwrap_or_default();
        let mut matches = Vec::new();
        if let (Ok(root), Ok(nodes)) = (self.project_root(project_id), self.project_tree(project_id)) {
            flatten_nodes(&nodes, &mut matches, &root, &needle);
        }
        Value::Array(matches)
    }
    fn ai_sources(&self, project_id: &str) -> Value {
        let mut list = self.ai_sources_internal(project_id);
        if let Some(sources) = list["sources"].as_array_mut() {
            for source in sources {
                if let Some(object) = source.as_object_mut() {
                    object.remove("text");
                }
            }
        }
        list
    }
    fn ai_sources_internal(&self, project_id: &str) -> Value {
        self.read_json(&self.context_sources_path(project_id), json!({ "sources": [], "expiredSourceIds": [] }))
    }
    fn ai_source(&self, project_id: &str, source_id: &str, kind: &str) -> Value {
        let now = knownext_core::now_iso();
        let source = self.build_ai_source(project_id, source_id, kind, &now);
        let mut list = self.ai_sources_internal(project_id);
        let sources = list["sources"].as_array_mut();
        if let Some(sources) = sources {
            sources.retain(|item| item["id"].as_str() != Some(source_id));
            sources.push(source.clone());
            let _ = self.write_json(&self.context_sources_path(project_id), &list);
        }
        without_internal_source_text(source)
    }
    fn ai_upload_sources(&self, project_id: &str, files: Vec<LocalApiFile>) -> Value {
        let mut list = self.ai_sources_internal(project_id);
        let now = knownext_core::now_iso();
        let mut uploaded = Vec::new();
        if let Some(sources) = list["sources"].as_array_mut() {
            for file in files {
                let id = format!("upload_{}", knownext_core::compact_id(&safe_name(&file.name)));
                let bytes = base64::engine::general_purpose::STANDARD.decode(file.data_base64.as_bytes()).unwrap_or_default();
                let text = if file.mime_type.as_deref().unwrap_or("").starts_with("text/")
                    || file.name.ends_with(".md")
                    || file.name.ends_with(".txt")
                    || file.name.ends_with(".csv")
                {
                    String::from_utf8_lossy(&bytes).chars().take(20_000).collect::<String>()
                } else {
                    String::new()
                };
                let name = file.name;
                let mime_type = file.mime_type;
                let source = json!({
                    "id": id,
                    "projectId": project_id,
                    "kind": "external_file",
                    "name": name,
                    "path": null,
                    "mimeType": mime_type,
                    "sizeBytes": bytes.len(),
                    "status": "ready",
                    "weight": "medium",
                    "warning": null,
                    "error": null,
                    "createdAt": now,
                    "updatedAt": now,
                    "lastUsedAt": null,
                    "expiresAt": null,
                    "text": text
                });
                sources.retain(|item| item["id"].as_str() != source["id"].as_str());
                sources.push(source.clone());
                uploaded.push(source);
            }
        }
        let _ = self.write_json(&self.context_sources_path(project_id), &list);
        self.ai_sources(project_id)
    }
    fn ai_upload_local_sources(&self, project_id: &str, body: Value) -> ApiResult {
        const MAX_CONTEXT_FILE_BYTES: u64 = 25 * 1024 * 1024;
        let Some(paths) = body.get("paths").and_then(Value::as_array) else {
            return Ok(LocalApiResponse {
                status: 400,
                body: json!({ "error": "missing_paths", "message": "Selecciona al menos un archivo para añadirlo al contexto IA." }),
            });
        };

        let mut files = Vec::new();
        for raw_path in paths.iter().filter_map(Value::as_str).filter(|value| !value.trim().is_empty()) {
            let path = PathBuf::from(raw_path);
            let metadata = match std::fs::metadata(&path) {
                Ok(metadata) if metadata.is_file() => metadata,
                Ok(_) => {
                    return Ok(LocalApiResponse {
                        status: 400,
                        body: json!({ "error": "invalid_file", "message": format!("La ruta seleccionada no es un archivo: {raw_path}") }),
                    });
                }
                Err(error) => {
                    return Ok(LocalApiResponse {
                        status: 400,
                        body: json!({ "error": "file_unavailable", "message": format!("No se pudo leer el archivo seleccionado: {error}") }),
                    });
                }
            };
            if metadata.len() > MAX_CONTEXT_FILE_BYTES {
                return Ok(LocalApiResponse {
                    status: 413,
                    body: json!({ "error": "file_too_large", "message": format!("El archivo supera el límite de 25 MB: {}", path.file_name().and_then(|value| value.to_str()).unwrap_or(raw_path)) }),
                });
            }

            let bytes = std::fs::read(&path).map_err(|error| error.to_string())?;
            files.push(LocalApiFile {
                field_name: "files".to_string(),
                name: path.file_name().and_then(|value| value.to_str()).unwrap_or("archivo").to_string(),
                mime_type: Some(mime_for_path(&path).to_string()),
                data_base64: base64::engine::general_purpose::STANDARD.encode(bytes),
            });
        }

        if files.is_empty() {
            return Ok(LocalApiResponse {
                status: 400,
                body: json!({ "error": "missing_paths", "message": "Selecciona al menos un archivo para añadirlo al contexto IA." }),
            });
        }

        Ok(LocalApiResponse {
            status: 200,
            body: self.ai_upload_sources(project_id, files),
        })
    }
    fn build_ai_source(&self, project_id: &str, source_id: &str, kind: &str, now: &str) -> Value {
        let path = document_ref_path(source_id).ok();
        let resolved_path = path.as_deref().and_then(|relative| self.resolve_project_relative(project_id, relative).ok());
        let name = resolved_path
            .as_ref()
            .and_then(|path| path.file_name())
            .and_then(|value| value.to_str())
            .unwrap_or(source_id)
            .to_string();
        let size = resolved_path.as_ref().and_then(|path| std::fs::metadata(path).ok()).map(|metadata| metadata.len()).unwrap_or(0);
        let mime = resolved_path.as_ref().map(|path| mime_for_path(path));
        let text = resolved_path.as_ref().map(|path| knownext_docs::extract_plain_text(path)).unwrap_or_default();
        json!({
            "id": source_id,
            "projectId": project_id,
            "kind": kind,
            "name": name,
            "path": path,
            "mimeType": mime,
            "sizeBytes": size,
            "status": "ready",
            "weight": if size > 500_000 { "high" } else { "medium" },
            "warning": null,
            "error": null,
            "createdAt": now,
            "updatedAt": now,
            "lastUsedAt": null,
            "expiresAt": null,
            "text": text
        })
    }
    fn remove_ai_source(&self, project_id: &str, source_id: &str) -> Value {
        let mut list = self.ai_sources_internal(project_id);
        if let Some(sources) = list["sources"].as_array_mut() {
            sources.retain(|item| item["id"].as_str() != Some(source_id));
        }
        let _ = self.write_json(&self.context_sources_path(project_id), &list);
        self.ai_sources(project_id)
    }
    fn ai_source_preview(&self, project_id: &str, source_id: &str) -> Value {
        let sources = self.ai_sources_internal(project_id);
        let source = sources["sources"].as_array().and_then(|sources| {
            sources.iter().find(|source| source["id"].as_str() == Some(source_id)).cloned()
        }).unwrap_or_else(|| self.build_ai_source(project_id, source_id, "external_file", &knownext_core::now_iso()));
        let preview = source["text"].as_str().unwrap_or("").chars().take(4000).collect::<String>();
        json!({ "source": without_internal_source_text(source), "previewText": preview, "metadata": {} })
    }
    fn add_ai_source_to_project(&self, project_id: &str, source_id: &str, body: Value) -> Result<Value, String> {
        let sources = self.ai_sources_internal(project_id);
        let source = sources["sources"].as_array().and_then(|sources| {
            sources.iter().find(|source| source["id"].as_str() == Some(source_id)).cloned()
        }).unwrap_or_else(|| self.build_ai_source(project_id, source_id, "external_file", &knownext_core::now_iso()));

        let parent = self.node_relative(project_id, body.get("parentId").and_then(Value::as_str))?;
        let requested_name = body
            .get("name")
            .and_then(Value::as_str)
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| source["name"].as_str().unwrap_or("contexto.md"));
        let file_name = markdown_file_name(requested_name);
        let relative = self.unique_project_relative(project_id, parent.as_deref(), &file_name)?;
        let path = self.resolve_project_relative(project_id, &relative)?;
        if let Some(parent_path) = path.parent() {
            std::fs::create_dir_all(parent_path).map_err(|error| error.to_string())?;
        }

        let source_name = source["name"].as_str().unwrap_or("Fuente IA");
        let source_path = source["path"].as_str();
        let text = source["text"].as_str().unwrap_or("").trim();
        let markdown = if text.is_empty() {
            format!(
                "# {source_name}\n\nFuente añadida desde el contexto IA.\n{}\n",
                source_path.map(|path| format!("\nRuta original: `{path}`\n")).unwrap_or_default()
            )
        } else {
            format!(
                "# {source_name}\n\n{}\n\n{}",
                source_path.map(|path| format!("Fuente: `{path}`\n")).unwrap_or_default(),
                text
            )
        };
        std::fs::write(&path, markdown).map_err(|error| error.to_string())?;
        let document_id = doc_id(project_id, &relative);
        Ok(json!({
            "documentId": document_id,
            "path": relative,
            "tree": self.project_tree(project_id)?
        }))
    }
    fn unique_project_relative(&self, project_id: &str, parent: Option<&str>, file_name: &str) -> Result<String, String> {
        let base_relative = join_relative(parent, file_name);
        let base_path = self.resolve_project_relative(project_id, &base_relative)?;
        if !base_path.exists() {
            return Ok(base_relative);
        }
        let stem = file_name.rsplit_once('.').map(|(stem, _)| stem).unwrap_or(file_name);
        let ext = file_name.rsplit_once('.').map(|(_, ext)| format!(".{ext}")).unwrap_or_default();
        for index in 2..1000 {
            let candidate = join_relative(parent, &format!("{stem} {index}{ext}"));
            if !self.resolve_project_relative(project_id, &candidate)?.exists() {
                return Ok(candidate);
            }
        }
        Err("No se pudo generar un nombre de documento libre".to_string())
    }
    fn ai_conversation(&self, project_id: &str) -> Value {
        self.read_json(&self.conversation_path(project_id), json!({ "events": [] }))
    }
    fn ai_interaction(&self, project_id: &str, body: Value) -> Value {
        let context_sources = self.resolve_ai_context_sources(project_id, &body);
        let mut runtime_body = body;
        if let Some(object) = runtime_body.as_object_mut() {
            object.insert("runtimePermissions".to_string(), self.read_config()["ai"]["permissions"].clone());
        }
        let response = knownext_ai::answer_interaction(project_id, &runtime_body, context_sources, self.openai_key().as_deref(), self.ai_model().as_str());
        let mut conversation = self.ai_conversation(project_id);
        if let Some(events) = conversation["events"].as_array_mut() {
            events.extend(response["conversationEvents"].as_array().cloned().unwrap_or_default());
        }
        let _ = self.write_json(&self.conversation_path(project_id), &conversation);
        response
    }
    fn resolve_ai_context_sources(&self, project_id: &str, body: &Value) -> Value {
        let source_ids = body["contextSourceIds"].as_array().cloned().unwrap_or_default();
        let stored = self.ai_sources_internal(project_id);
        let sources = stored["sources"].as_array().cloned().unwrap_or_default();
        let mut resolved = Vec::new();
        for id in source_ids.iter().filter_map(Value::as_str) {
            if let Some(source) = sources.iter().find(|source| source["id"].as_str() == Some(id)) {
                resolved.push(source.clone());
            }
        }
        Value::Array(resolved)
    }
    fn ai_usage_summary(&self, _query: &BTreeMap<String, String>) -> Value {
        json!({ "month": knownext_core::now_iso().chars().take(7).collect::<String>(), "currency": "EUR", "estimated": true, "totalEstimatedCost": 0, "generatedAt": knownext_core::now_iso(), "capabilities": [], "models": [] })
    }
    fn openai_key_status(&self) -> Value {
        let value = self.credentials();
        let key = value["openaiKey"].as_str().unwrap_or("");
        json!({ "configured": !key.is_empty(), "preview": if key.len() > 8 { Value::from(format!("{}...{}", &key[..3], &key[key.len()-4..])) } else { Value::Null } })
    }
    fn save_openai_key(&self, body: Value) -> Value {
        let key = body.get("apiKey").and_then(Value::as_str).unwrap_or("");
        self.update_credentials(|credentials| {
            credentials.insert("openaiKey".to_string(), Value::from(key));
        });
        self.openai_key_status()
    }
    fn delete_openai_key(&self) {
        self.update_credentials(|credentials| {
            credentials.remove("openaiKey");
        });
    }
    fn ai_index_status(&self, project_id: &str) -> Value {
        let docs = self.project_tree(project_id).map(|nodes| count_documents(&nodes)).unwrap_or(0);
        json!({
            "projectId": project_id,
            "enabled": false,
            "status": "not-indexed",
            "vectorStoreId": null,
            "lastIndexedAt": null,
            "error": null,
            "documentCount": docs,
            "indexedDocumentCount": 0,
            "pendingDocumentCount": 0,
            "failedDocumentCount": 0,
            "deletedDocumentCount": 0,
            "localExactReady": true
        })
    }
}

fn ok(body: Value) -> ApiResult { Ok(LocalApiResponse { status: 200, body }) }
fn ok_value(body: Value) -> Result<Value, String> { Ok(body) }
fn no_content() -> ApiResult { Ok(LocalApiResponse { status: 204, body: Value::Null }) }
fn bad(status: u16, detail: &str) -> ApiResult { Ok(LocalApiResponse { status, body: json!({ "detail": detail }) }) }

fn body_id<'a>(body: &'a Value, keys: &[&str]) -> Option<&'a str> {
    keys.iter().find_map(|key| body.get(*key).and_then(Value::as_str).filter(|value| !value.is_empty()))
}

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

fn collect_project_files(root: &Path) -> Result<Vec<PathBuf>, String> {
    let mut files = Vec::new();
    collect_project_files_into(root, root, &mut files)?;
    Ok(files)
}

fn collect_project_files_into(root: &Path, current: &Path, files: &mut Vec<PathBuf>) -> Result<(), String> {
    let entries = std::fs::read_dir(current).map_err(|error| error.to_string())?;
    for entry in entries.flatten() {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') || matches!(name.as_str(), "node_modules" | "target" | "dist") {
            continue;
        }
        if path.is_dir() {
            collect_project_files_into(root, &path, files)?;
        } else if path.strip_prefix(root).is_ok() {
            files.push(path);
        }
    }
    Ok(())
}

fn relative_from_root(root: &Path, path: &Path) -> String {
    path.strip_prefix(root).unwrap_or(path).to_string_lossy().replace('\\', "/")
}

fn moved_file_mappings(root: &Path, old_path: &Path, old_relative: &str, new_relative: &str) -> Result<Vec<(String, String)>, String> {
    if old_path.is_dir() {
        let mut mappings = Vec::new();
        for path in collect_project_files(old_path)? {
            let old_file_relative = relative_from_root(root, &path);
            let suffix = old_file_relative
                .strip_prefix(old_relative.trim_end_matches('/'))
                .unwrap_or(&old_file_relative)
                .trim_start_matches('/');
            let new_file_relative = join_relative(Some(new_relative), suffix);
            mappings.push((old_file_relative, new_file_relative));
        }
        Ok(mappings)
    } else {
        Ok(vec![(old_relative.to_string(), new_relative.to_string())])
    }
}

fn moved_markdown_affected_documents(project_id: &str, moved_files: &[(String, String)]) -> Vec<Value> {
    moved_files
        .iter()
        .filter(|(old_relative, new_relative)| is_markdown_path(Path::new(old_relative)) || is_markdown_path(Path::new(new_relative)))
        .map(|(old_relative, new_relative)| json!({
            "oldId": doc_id(project_id, old_relative),
            "newId": doc_id(project_id, new_relative),
            "name": Path::new(new_relative).file_name().and_then(|value| value.to_str()).unwrap_or("documento.md"),
            "path": new_relative
        }))
        .collect()
}

fn deleted_markdown_affected_documents(project_id: &str, root: &Path, path: &Path) -> Result<Vec<Value>, String> {
    let paths = if path.is_dir() {
        collect_project_files(path)?
    } else {
        vec![path.to_path_buf()]
    };
    Ok(paths
        .into_iter()
        .filter(|path| is_markdown_path(path))
        .map(|path| {
            let relative = relative_from_root(root, &path);
            json!({
                "oldId": doc_id(project_id, &relative),
                "newId": null,
                "name": path.file_name().and_then(|value| value.to_str()).unwrap_or("documento.md"),
                "path": relative
            })
        })
        .collect())
}

fn dedupe_affected_documents(affected: Vec<Value>) -> Vec<Value> {
    let mut by_identity: BTreeMap<(String, String), Value> = BTreeMap::new();
    for item in affected {
        let old_id = item["oldId"].as_str().unwrap_or("").to_string();
        let new_id = item["newId"].as_str().unwrap_or("").to_string();
        if old_id.is_empty() {
            continue;
        }
        by_identity
            .entry((old_id, new_id))
            .and_modify(|existing| {
                if item["referenceUpdated"].as_bool().unwrap_or(false) {
                    existing["referenceUpdated"] = Value::from(true);
                }
            })
            .or_insert(item);
    }
    by_identity.into_values().collect()
}

fn is_image_path(path: &Path) -> bool {
    matches!(
        path.extension().and_then(|value| value.to_str()).unwrap_or("").to_ascii_lowercase().as_str(),
        "png" | "jpg" | "jpeg" | "gif" | "webp" | "svg"
    )
}

fn is_markdown_path(path: &Path) -> bool {
    matches!(
        path.extension().and_then(|value| value.to_str()).unwrap_or("").to_ascii_lowercase().as_str(),
        "md" | "markdown"
    )
}

fn markdown_image_references(markdown: &str, project_id: &str, document_id: &str, document_name: &str, document_path: &str) -> Vec<Value> {
    let mut references = Vec::new();
    for (line_index, line) in markdown.lines().enumerate() {
        references.extend(markdown_image_references_in_line(project_id, document_id, document_name, document_path, line, line_index + 1));
        references.extend(html_image_references_in_line(project_id, document_id, document_name, document_path, line, line_index + 1));
    }
    references
}

#[derive(Clone)]
struct ImageTargetSpan {
    start: usize,
    end: usize,
    raw: String,
}

fn rewrite_markdown_image_targets(markdown: &str, old_document_path: &str, new_document_path: &str, image_mapping: &BTreeMap<String, String>) -> String {
    let mut output = String::with_capacity(markdown.len());
    for chunk in markdown.split_inclusive('\n') {
        let (line, newline) = chunk.strip_suffix('\n').map(|line| (line, "\n")).unwrap_or((chunk, ""));
        let rewritten = rewrite_markdown_image_targets_in_line(line, old_document_path, new_document_path, image_mapping);
        output.push_str(&rewritten);
        output.push_str(newline);
    }
    if markdown.is_empty() {
        String::new()
    } else {
        output
    }
}

fn rewrite_markdown_image_targets_in_line(line: &str, old_document_path: &str, new_document_path: &str, image_mapping: &BTreeMap<String, String>) -> String {
    let mut spans = markdown_target_spans_in_line(line);
    spans.extend(html_src_target_spans_in_line(line));
    if spans.is_empty() {
        return line.to_string();
    }
    spans.sort_by_key(|span| span.start);
    let mut rewritten = line.to_string();
    for span in spans.into_iter().rev() {
        let Some(old_asset_path) = resolve_markdown_asset_target(old_document_path, &span.raw) else {
            continue;
        };
        let new_asset_path = image_mapping.get(&old_asset_path).map(String::as_str).unwrap_or(&old_asset_path);
        if old_document_path == new_document_path && old_asset_path == new_asset_path {
            continue;
        }
        let new_target = relative_link_target(new_document_path, new_asset_path);
        rewritten.replace_range(span.start..span.end, &new_target);
    }
    rewritten
}

fn markdown_target_spans_in_line(line: &str) -> Vec<ImageTargetSpan> {
    let mut spans = Vec::new();
    let mut offset = 0usize;
    while let Some(start) = line[offset..].find("![") {
        let image_start = offset + start;
        let alt_start = image_start + 2;
        let Some(alt_end_relative) = line[alt_start..].find(']') else {
            break;
        };
        let alt_end = alt_start + alt_end_relative;
        let open_paren = alt_end + 1;
        if !line[open_paren..].starts_with('(') {
            offset = alt_end + 1;
            continue;
        }
        let target_start = open_paren + 1;
        let Some(target_end_relative) = find_markdown_link_close(&line[target_start..]) else {
            break;
        };
        let target_end = target_start + target_end_relative;
        if let Some((relative_start, relative_end, raw)) = parse_markdown_link_destination_span(&line[target_start..target_end]) {
            spans.push(ImageTargetSpan {
                start: target_start + relative_start,
                end: target_start + relative_end,
                raw: raw.to_string(),
            });
        }
        offset = target_end + 1;
    }
    spans
}

fn html_src_target_spans_in_line(line: &str) -> Vec<ImageTargetSpan> {
    let mut spans = Vec::new();
    let mut offset = 0usize;
    let lower = line.to_ascii_lowercase();
    while let Some(start) = lower[offset..].find("<img") {
        let image_start = offset + start;
        let tag_end = lower[image_start..].find('>').map(|value| image_start + value).unwrap_or(line.len());
        let tag = &line[image_start..tag_end];
        if let Some((relative_start, relative_end, raw)) = html_attr_value_span(tag, "src") {
            spans.push(ImageTargetSpan {
                start: image_start + relative_start,
                end: image_start + relative_end,
                raw: raw.to_string(),
            });
        }
        offset = tag_end.saturating_add(1);
        if offset >= line.len() {
            break;
        }
    }
    spans
}

fn markdown_image_references_in_line(
    project_id: &str,
    document_id: &str,
    document_name: &str,
    document_path: &str,
    line: &str,
    line_number: usize,
) -> Vec<Value> {
    let mut references = Vec::new();
    let mut offset = 0usize;
    while let Some(start) = line[offset..].find("![") {
        let image_start = offset + start;
        let alt_start = image_start + 2;
        let Some(alt_end_relative) = line[alt_start..].find(']') else {
            break;
        };
        let alt_end = alt_start + alt_end_relative;
        let open_paren = alt_end + 1;
        if !line[open_paren..].starts_with('(') {
            offset = alt_end + 1;
            continue;
        }
        let target_start = open_paren + 1;
        let Some(target_end_relative) = find_markdown_link_close(&line[target_start..]) else {
            break;
        };
        let target_end = target_start + target_end_relative;
        let raw = parse_markdown_link_destination(&line[target_start..target_end]);
        let alt_text = line[alt_start..alt_end].trim();
        references.push(asset_reference_value(
            project_id,
            document_id,
            document_name,
            document_path,
            raw,
            "markdown-image",
            Some(alt_text),
            line_number,
            line[..image_start].chars().count() + 1,
        ));
        offset = target_end + 1;
    }
    references
}

fn html_image_references_in_line(
    project_id: &str,
    document_id: &str,
    document_name: &str,
    document_path: &str,
    line: &str,
    line_number: usize,
) -> Vec<Value> {
    let mut references = Vec::new();
    let mut offset = 0usize;
    let lower = line.to_ascii_lowercase();
    while let Some(start) = lower[offset..].find("<img") {
        let image_start = offset + start;
        let tag_end = lower[image_start..].find('>').map(|value| image_start + value).unwrap_or(line.len());
        let tag = &line[image_start..tag_end];
        if let Some(src) = html_attr_value(tag, "src") {
            references.push(asset_reference_value(
                project_id,
                document_id,
                document_name,
                document_path,
                src,
                "html-image",
                html_attr_value(tag, "alt"),
                line_number,
                line[..image_start].chars().count() + 1,
            ));
        }
        offset = tag_end.saturating_add(1);
        if offset >= line.len() {
            break;
        }
    }
    references
}

fn find_markdown_link_close(value: &str) -> Option<usize> {
    let mut escaped = false;
    for (index, ch) in value.char_indices() {
        if escaped {
            escaped = false;
            continue;
        }
        if ch == '\\' {
            escaped = true;
            continue;
        }
        if ch == ')' {
            return Some(index);
        }
    }
    None
}

fn parse_markdown_link_destination(value: &str) -> &str {
    let trimmed = value.trim();
    if let Some(rest) = trimmed.strip_prefix('<') {
        return rest.split('>').next().unwrap_or("").trim();
    }
    trimmed.split_whitespace().next().unwrap_or("").trim()
}

fn parse_markdown_link_destination_span(value: &str) -> Option<(usize, usize, &str)> {
    let leading = value.len().saturating_sub(value.trim_start().len());
    let trimmed = value.trim_start();
    if let Some(rest) = trimmed.strip_prefix('<') {
        let end = rest.find('>')?;
        let start = leading + 1;
        return Some((start, start + end, &value[start..start + end]));
    }
    let raw = trimmed.split_whitespace().next().unwrap_or("");
    if raw.is_empty() {
        None
    } else {
        Some((leading, leading + raw.len(), &value[leading..leading + raw.len()]))
    }
}

fn html_attr_value<'a>(tag: &'a str, attr: &str) -> Option<&'a str> {
    let lower = tag.to_ascii_lowercase();
    let needle = format!("{attr}=");
    let start = lower.find(&needle)? + needle.len();
    let rest = &tag[start..];
    let quote = rest.chars().next()?;
    if quote == '"' || quote == '\'' {
        let content = &rest[quote.len_utf8()..];
        content.find(quote).map(|end| &content[..end])
    } else {
        Some(rest.split_whitespace().next().unwrap_or(""))
    }
}

fn html_attr_value_span<'a>(tag: &'a str, attr: &str) -> Option<(usize, usize, &'a str)> {
    let lower = tag.to_ascii_lowercase();
    let needle = format!("{attr}=");
    let start = lower.find(&needle)? + needle.len();
    let rest = &tag[start..];
    let quote = rest.chars().next()?;
    if quote == '"' || quote == '\'' {
        let content_start = start + quote.len_utf8();
        let content = &tag[content_start..];
        let end = content.find(quote)?;
        Some((content_start, content_start + end, &tag[content_start..content_start + end]))
    } else {
        let raw = rest.split_whitespace().next().unwrap_or("");
        if raw.is_empty() {
            None
        } else {
            Some((start, start + raw.len(), &tag[start..start + raw.len()]))
        }
    }
}

fn asset_reference_value(
    project_id: &str,
    document_id: &str,
    document_name: &str,
    document_path: &str,
    raw_target: &str,
    kind: &str,
    alt_text: Option<&str>,
    line: usize,
    column: usize,
) -> Value {
    let resolved = resolve_markdown_asset_target(document_path, raw_target);
    let status = if raw_target.starts_with("http://")
        || raw_target.starts_with("https://")
        || raw_target.starts_with("data:")
        || raw_target.starts_with("mailto:")
    {
        "external"
    } else if resolved.is_some() {
        "resolved"
    } else {
        "missing"
    };
    json!({
        "id": format!("asset-ref-{}-{line}-{column}", safe_name(document_id)),
        "projectId": project_id,
        "documentId": document_id,
        "documentName": document_name,
        "documentPath": document_path,
        "rawTarget": raw_target,
        "resolvedAssetPath": resolved,
        "kind": kind,
        "status": status,
        "altText": alt_text,
        "title": null,
        "line": line,
        "column": column
    })
}

fn resolve_markdown_asset_target(document_path: &str, raw_target: &str) -> Option<String> {
    let mut target = raw_target.trim();
    if target.is_empty()
        || target.starts_with('#')
        || target.starts_with("http://")
        || target.starts_with("https://")
        || target.starts_with("data:")
        || target.starts_with("mailto:")
    {
        return None;
    }
    target = target.split(['?', '#']).next().unwrap_or(target).trim();
    let decoded = knownext_core::percent_decode(target).replace('\\', "/");
    let joined = if decoded.starts_with('/') {
        decoded.trim_start_matches('/').to_string()
    } else {
        join_relative(document_path.rsplit_once('/').map(|(parent, _)| parent), &decoded)
    };
    normalize_project_relative(&joined)
}

fn normalize_project_relative(value: &str) -> Option<String> {
    let mut parts = Vec::new();
    for part in value.split('/') {
        match part {
            "" | "." => {}
            ".." => {
                parts.pop()?;
            }
            part => parts.push(part),
        }
    }
    if parts.is_empty() {
        None
    } else {
        Some(parts.join("/"))
    }
}

fn relative_link_target(document_path: &str, asset_path: &str) -> String {
    let document_parent = document_path.rsplit_once('/').map(|(parent, _)| parent).unwrap_or("");
    let from_parts = document_parent.split('/').filter(|part| !part.is_empty()).collect::<Vec<_>>();
    let to_parts = asset_path.split('/').filter(|part| !part.is_empty()).collect::<Vec<_>>();
    let mut common = 0usize;
    while common < from_parts.len() && common < to_parts.len() && from_parts[common] == to_parts[common] {
        common += 1;
    }
    let mut parts = Vec::new();
    for _ in common..from_parts.len() {
        parts.push("..".to_string());
    }
    for part in &to_parts[common..] {
        parts.push((*part).to_string());
    }
    if parts.is_empty() {
        asset_path.to_string()
    } else {
        parts.join("/")
    }
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

fn open_path_external(path: &Path) -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        let _ = path;
        return Err("La apertura externa no está disponible desde este contrato local en Android.".to_string());
    }
    #[cfg(not(target_os = "android"))]
    {
        #[cfg(target_os = "windows")]
        let mut command = {
            let mut command = Command::new("explorer.exe");
            command.arg(path);
            command
        };
        #[cfg(target_os = "macos")]
        let mut command = {
            let mut command = Command::new("open");
            command.arg(path);
            command
        };
        #[cfg(all(unix, not(target_os = "macos")))]
        let mut command = {
            let mut command = Command::new("xdg-open");
            command.arg(path);
            command
        };
        command.spawn().map(|_| ()).map_err(|error| format!("No se pudo abrir el documento con la aplicación predeterminada: {error}"))
    }
}

fn preview_value(project_id: &str, preview_id: &str, relative: &str, path: &Path) -> Value {
    let ext = path.extension().and_then(|value| value.to_str()).unwrap_or("").to_ascii_lowercase();
    let format = if ext == "xlsx" { "xlsx" } else if ext == "docx" { "docx" } else { "pdf" };
    let renditions = if format == "xlsx" { json!(["text", "workbook"]) } else { json!(["pdf", "text"]) };
    let sheets = if format == "xlsx" { Value::Array(knownext_docs::xlsx_sheet_summaries(path)) } else { Value::Null };
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
        "sheets": sheets,
        "warnings": [],
        "generatedAt": knownext_core::now_iso(),
        "error": null
    })
}

#[allow(clippy::too_many_arguments)]
fn github_remote_status(
    project_id: &str,
    mode: &str,
    state: &str,
    label: &str,
    detail: &str,
    remote_access: &str,
    remote_paused: bool,
    local_changes: bool,
    local_hash: Option<String>,
    remote_hash: Option<String>,
    pending_push: bool,
    pending_pull: bool,
) -> Value {
    json!({
        "projectId": project_id,
        "mode": mode,
        "state": state,
        "label": label,
        "detail": detail,
        "remoteAccess": remote_access,
        "remotePaused": remote_paused,
        "remoteReason": if remote_paused { Value::from(detail) } else { Value::Null },
        "remoteAction": if remote_paused { Value::from(remote_action_for_access(remote_access)) } else { Value::Null },
        "localState": if local_changes { "dirty" } else if pending_push { "pending-push" } else { "clean" },
        "pendingPush": pending_push,
        "pendingPull": pending_pull,
        "hasConflicts": false,
        "lastSyncAt": null,
        "lastLocalVersionHash": local_hash,
        "lastRemoteHash": remote_hash,
        "conflicts": []
    })
}

fn remote_action_for_access(remote_access: &str) -> &'static str {
    match remote_access {
        "unauthenticated" => "connect-github",
        "unauthorized" => "request-permission",
        "offline" | "unknown" => "retry",
        _ => "retry",
    }
}

fn ensure_git_repo(root: &Path) -> Result<(), String> {
    if root.join(".git").exists() {
        return Ok(());
    }
    let output = Command::new("git")
        .arg("-C")
        .arg(root)
        .arg("init")
        .output()
        .map_err(|error| format!("Git no está disponible: {error}"))?;
    if output.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
    }
}

fn is_github_sync_mode(sync_mode: &str) -> bool {
    sync_mode == "manual-github" || sync_mode == "auto-github"
}

fn normalize_versioning_mode(versioning_mode: &str) -> &'static str {
    if versioning_mode == "none" {
        "none"
    } else {
        "local-git"
    }
}

fn normalize_project_metadata(mut project: Value) -> Value {
    normalize_project_metadata_in_place(&mut project);
    project
}

fn normalize_project_metadata_in_place(project: &mut Value) {
    let versioning_mode = project["versioningMode"].as_str().unwrap_or("none");
    let sync_mode = project["syncMode"].as_str().unwrap_or("none");
    let has_github_repository = project.get("githubRepository").is_some_and(|repository| !repository.is_null());
    let should_use_local_git = is_old_github_versioning_mode(Some(versioning_mode))
        || versioning_mode == "local-git"
        || is_github_sync_mode(sync_mode)
        || has_github_repository;
    project["versioningMode"] = Value::from(if should_use_local_git { "local-git" } else { "none" });
    if project["storageMode"].as_str() == Some("local-cache") && should_use_local_git {
        project["storageMode"] = Value::from("local-files");
    }
}

fn github_repository_parts(repository: &Value) -> Option<(String, String, Option<String>)> {
    let owner = repository.get("owner").and_then(Value::as_str)?.trim();
    let repo = repository
        .get("repo")
        .or_else(|| repository.get("name"))
        .and_then(Value::as_str)?
        .trim();
    if owner.is_empty() || repo.is_empty() {
        return None;
    }
    let branch = repository
        .get("defaultRef")
        .or_else(|| repository.get("defaultBranch"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string);
    Some((owner.to_string(), repo.to_string(), branch))
}

fn ensure_github_remote(root: &Path, owner: &str, repo: &str) -> Result<(), String> {
    ensure_git_repo(root)?;
    let url = format!("https://github.com/{owner}/{repo}.git");
    if git_remote_url(root, "origin")?.is_some() {
        let output = Command::new("git")
            .arg("-C")
            .arg(root)
            .args(["remote", "set-url", "origin", &url])
            .output()
            .map_err(|error| format!("Git no está disponible: {error}"))?;
        return command_ok(output);
    }
    let output = Command::new("git")
        .arg("-C")
        .arg(root)
        .args(["remote", "add", "origin", &url])
        .output()
        .map_err(|error| format!("Git no está disponible: {error}"))?;
    command_ok(output)
}

fn git_remote_url(root: &Path, remote: &str) -> Result<Option<String>, String> {
    let output = Command::new("git")
        .arg("-C")
        .arg(root)
        .args(["remote", "get-url", remote])
        .output()
        .map_err(|error| format!("Git no está disponible: {error}"))?;
    if output.status.success() {
        let value = String::from_utf8_lossy(&output.stdout).trim().to_string();
        Ok((!value.is_empty()).then_some(value))
    } else {
        Ok(None)
    }
}

fn current_git_branch(root: &Path) -> Option<String> {
    let output = Command::new("git")
        .arg("-C")
        .arg(root)
        .args(["branch", "--show-current"])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let branch = String::from_utf8_lossy(&output.stdout).trim().to_string();
    (!branch.is_empty()).then_some(branch)
}

fn git_status_items(root: &Path) -> Result<Vec<Value>, String> {
    let output = Command::new("git")
        .arg("-C")
        .arg(root)
        .args(["status", "--porcelain=v1", "--untracked-files=all"])
        .output()
        .map_err(|error| format!("Git no está disponible: {error}"))?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }

    let text = String::from_utf8_lossy(&output.stdout);
    let mut items = Vec::new();
    for line in text.lines() {
        if line.len() < 4 {
            continue;
        }
        let status = &line[..2];
        let raw_path = line[3..].trim();
        let path = raw_path.split(" -> ").last().unwrap_or(raw_path).replace('\\', "/");
        if path.is_empty() || path.starts_with(".git/") {
            continue;
        }
        let change_type = if status.contains('R') {
            "renamed"
        } else if status.contains('D') {
            "deleted"
        } else if status == "??" || status.contains('A') {
            "added"
        } else {
            "modified"
        };
        let (kind, risk, decision, reason) = classify_external_change(&path, root);
        let size = if change_type == "deleted" {
            Value::Null
        } else {
            std::fs::metadata(root.join(path.replace('/', std::path::MAIN_SEPARATOR_STR)))
                .map(|metadata| Value::from(metadata.len()))
                .unwrap_or(Value::Null)
        };
        let name = path.rsplit('/').next().unwrap_or(&path);
        items.push(json!({
            "id": format!("external-{}", safe_name(&path)),
            "path": path,
            "name": name,
            "changeType": change_type,
            "kind": kind,
            "risk": risk,
            "decision": decision,
            "sizeBytes": size,
            "reason": reason
        }));
    }
    Ok(items)
}

fn git_head_hash(root: &Path) -> Result<Option<String>, String> {
    let output = Command::new("git")
        .arg("-C")
        .arg(root)
        .args(["rev-parse", "--short=8", "HEAD"])
        .output()
        .map_err(|error| format!("Git no está disponible: {error}"))?;
    if output.status.success() {
        let hash = String::from_utf8_lossy(&output.stdout).trim().to_string();
        Ok((!hash.is_empty()).then_some(hash))
    } else {
        Ok(None)
    }
}

fn git_auth_header(token: &str) -> String {
    let credentials = base64::engine::general_purpose::STANDARD.encode(format!("x-access-token:{token}"));
    format!("AUTHORIZATION: basic {credentials}")
}

fn git_remote_head_hash(root: &Path, token: &str, remote: &str, branch: &str) -> Result<Option<String>, String> {
    let output = Command::new("git")
        .arg("-C")
        .arg(root)
        .arg("-c")
        .arg(format!("http.https://github.com/.extraheader={}", git_auth_header(token)))
        .args(["ls-remote", remote, &format!("refs/heads/{branch}")])
        .output()
        .map_err(|error| format!("Git no está disponible: {error}"))?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    Ok(stdout.split_whitespace().next().map(|hash| hash.chars().take(8).collect()))
}

fn git_push_origin(root: &Path, token: &str, branch: &str) -> Result<(), String> {
    let output = Command::new("git")
        .arg("-C")
        .arg(root)
        .arg("-c")
        .arg(format!("http.https://github.com/.extraheader={}", git_auth_header(token)))
        .args(["push", "-u", "origin", &format!("HEAD:{branch}")])
        .output()
        .map_err(|error| format!("Git no está disponible: {error}"))?;
    command_ok(output)
}

fn git_pull_ff_only(root: &Path, token: &str, branch: &str) -> Result<(), String> {
    let fetch = Command::new("git")
        .arg("-C")
        .arg(root)
        .arg("-c")
        .arg(format!("http.https://github.com/.extraheader={}", git_auth_header(token)))
        .args(["fetch", "origin", branch])
        .output()
        .map_err(|error| format!("Git no está disponible: {error}"))?;
    command_ok(fetch)?;
    let merge = Command::new("git")
        .arg("-C")
        .arg(root)
        .args(["merge", "--ff-only", &format!("origin/{branch}")])
        .output()
        .map_err(|error| format!("Git no está disponible: {error}"))?;
    command_ok(merge)
}

fn command_ok(output: std::process::Output) -> Result<(), String> {
    if output.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
    }
}

struct GitRemoteError {
    access: &'static str,
    state: &'static str,
    label: &'static str,
    detail: String,
}

fn classify_git_remote_error(message: &str) -> GitRemoteError {
    let sanitized = sanitize_git_error(message);
    let lower = sanitized.to_ascii_lowercase();
    if lower.contains("could not resolve host")
        || lower.contains("failed to connect")
        || lower.contains("connection timed out")
        || lower.contains("network")
        || lower.contains("schannel")
    {
        return GitRemoteError {
            access: "offline",
            state: "offline",
            label: "GitHub sin conexión",
            detail: "No se puede contactar con GitHub ahora. El historial local sigue disponible y se podrá reintentar más tarde.".to_string(),
        };
    }
    if lower.contains("authentication failed")
        || lower.contains("bad credentials")
        || lower.contains("could not read username")
        || lower.contains("invalid username or password")
    {
        return GitRemoteError {
            access: "unauthenticated",
            state: "local-history",
            label: "GitHub pausado",
            detail: "La sesión de GitHub no es válida. El historial local sigue disponible hasta reconectar la cuenta.".to_string(),
        };
    }
    if lower.contains("repository not found")
        || lower.contains("permission denied")
        || lower.contains("403")
        || lower.contains("not authorized")
        || lower.contains("access denied")
    {
        return GitRemoteError {
            access: "unauthorized",
            state: "local-history",
            label: "Sin permiso GitHub",
            detail: "La cuenta conectada no tiene permiso sobre este repositorio. El historial local sigue disponible hasta recuperar acceso.".to_string(),
        };
    }
    GitRemoteError {
        access: "unknown",
        state: "error",
        label: "GitHub pausado",
        detail: if sanitized.is_empty() {
            "GitHub no pudo completar la comprobación remota. El historial local sigue disponible.".to_string()
        } else {
            sanitized
        },
    }
}

fn sanitize_git_error(message: &str) -> String {
    let trimmed = message.trim();
    if trimmed.is_empty() {
        "GitHub no pudo completar la operación.".to_string()
    } else {
        trimmed.replace("x-access-token:", "")
    }
}

fn classify_external_change(path: &str, root: &Path) -> (&'static str, &'static str, &'static str, Value) {
    let lower = path.to_ascii_lowercase();
    let file_name = lower.rsplit('/').next().unwrap_or(&lower);
    if file_name == ".env"
        || file_name.ends_with(".pem")
        || file_name.ends_with(".key")
        || file_name.ends_with(".p12")
        || file_name.ends_with(".pfx")
        || lower.contains("secret")
        || lower.contains("credential")
    {
        return ("private", "blocked", "omit", Value::from("Archivo potencialmente privado."));
    }
    if lower.starts_with("node_modules/")
        || lower.starts_with("target/")
        || lower.starts_with("dist/")
        || lower.starts_with(".tauri/")
        || lower.starts_with(".idea/")
        || lower.starts_with(".vscode/")
    {
        return ("ignored", "blocked", "omit", Value::from("Archivo técnico omitido del historial del proyecto."));
    }
    let full_path = root.join(path.replace('/', std::path::MAIN_SEPARATOR_STR));
    if full_path.is_dir() {
        return ("folder", "safe", "include", Value::Null);
    }
    match lower.rsplit('.').next().unwrap_or("") {
        "md" | "markdown" | "txt" => ("document", "safe", "include", Value::Null),
        "png" | "jpg" | "jpeg" | "gif" | "webp" | "svg" => ("image", "safe", "include", Value::Null),
        "pdf" | "docx" | "xlsx" | "csv" => ("attachment", "review", "review", Value::from("Adjunto detectado fuera de la app; revisa antes de incluir.")),
        _ => ("unsupported", "review", "review", Value::from("Tipo de archivo no reconocido automáticamente.")),
    }
}

fn external_change_set(project_id: &str, items: Vec<Value>, message: Option<String>) -> Value {
    let mut summary = json!({
        "total": items.len(),
        "safe": 0,
        "review": 0,
        "blocked": 0,
        "added": 0,
        "modified": 0,
        "deleted": 0,
        "folders": 0,
        "documents": 0,
        "images": 0,
        "attachments": 0,
        "omitted": 0,
        "totalBytes": 0
    });
    for item in &items {
        match item["risk"].as_str().unwrap_or("review") {
            "safe" => summary["safe"] = Value::from(summary["safe"].as_u64().unwrap_or(0) + 1),
            "blocked" => summary["blocked"] = Value::from(summary["blocked"].as_u64().unwrap_or(0) + 1),
            _ => summary["review"] = Value::from(summary["review"].as_u64().unwrap_or(0) + 1),
        }
        match item["changeType"].as_str().unwrap_or("") {
            "added" => summary["added"] = Value::from(summary["added"].as_u64().unwrap_or(0) + 1),
            "modified" => summary["modified"] = Value::from(summary["modified"].as_u64().unwrap_or(0) + 1),
            "deleted" => summary["deleted"] = Value::from(summary["deleted"].as_u64().unwrap_or(0) + 1),
            _ => {}
        }
        match item["kind"].as_str().unwrap_or("") {
            "folder" => summary["folders"] = Value::from(summary["folders"].as_u64().unwrap_or(0) + 1),
            "document" => summary["documents"] = Value::from(summary["documents"].as_u64().unwrap_or(0) + 1),
            "image" => summary["images"] = Value::from(summary["images"].as_u64().unwrap_or(0) + 1),
            "attachment" => summary["attachments"] = Value::from(summary["attachments"].as_u64().unwrap_or(0) + 1),
            "private" | "ignored" => summary["omitted"] = Value::from(summary["omitted"].as_u64().unwrap_or(0) + 1),
            _ => {}
        }
        summary["totalBytes"] = Value::from(summary["totalBytes"].as_u64().unwrap_or(0) + item["sizeBytes"].as_u64().unwrap_or(0));
    }
    let status = if items.is_empty() {
        "none"
    } else if summary["blocked"].as_u64().unwrap_or(0) > 0 {
        "blocked"
    } else if summary["review"].as_u64().unwrap_or(0) > 0 {
        "needs-review"
    } else {
        "safe"
    };
    json!({
        "id": format!("changes-{project_id}"),
        "projectId": project_id,
        "title": if items.is_empty() { "Sin cambios externos" } else { "Cambios externos detectados" },
        "source": "filesystem",
        "status": status,
        "detectedAt": knownext_core::now_iso(),
        "requiresReview": status == "needs-review" || status == "blocked",
        "summary": summary,
        "items": items,
        "message": message
    })
}

fn git_add_path(root: &Path, relative: &str) -> Result<(), String> {
    let output = Command::new("git")
        .arg("-C")
        .arg(root)
        .arg("add")
        .arg("--")
        .arg(relative)
        .output()
        .map_err(|error| format!("Git no está disponible: {error}"))?;
    if output.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
    }
}

fn git_commit_all(root: &Path, title: &str) -> Result<(), String> {
    let output = Command::new("git")
        .arg("-C")
        .arg(root)
        .args(["-c", "user.name=KnowNext.ai", "-c", "user.email=knownext.local@knownext.ai"])
        .args(["commit", "-m", title])
        .output()
        .map_err(|error| format!("Git no está disponible: {error}"))?;
    if output.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        if stderr.contains("nothing to commit") {
            Ok(())
        } else {
            Err(stderr)
        }
    }
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

fn without_internal_source_text(mut source: Value) -> Value {
    if let Some(object) = source.as_object_mut() {
        object.remove("text");
    }
    source
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

const PUBLIC_GITHUB_CLIENT_ID: &str = "Ov23livdT6INmeECRYoc";

fn github_client_id() -> Option<String> {
    std::env::var("KNOWNEXT_GITHUB_CLIENT_ID")
        .ok()
        .filter(|value| !value.trim().is_empty())
        .or_else(|| {
            option_env!("KNOWNEXT_GITHUB_CLIENT_ID")
                .map(str::to_string)
                .filter(|value| !value.trim().is_empty())
        })
        .or_else(|| Some(PUBLIC_GITHUB_CLIENT_ID.to_string()))
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
        && auth.get("user").and_then(|user| user.get("login")).and_then(Value::as_str) == Some(mock_github_login().as_str())
}

fn is_github_auth_without_credentials(auth: &Value, has_github_token: bool) -> bool {
    auth.get("provider").and_then(Value::as_str) == Some("github")
        && auth.get("isAuthenticated").and_then(Value::as_bool).unwrap_or(false)
        && !has_github_token
}

fn is_old_github_versioning_mode(versioning_mode: Option<&str>) -> bool {
    versioning_mode == Some(old_github_versioning_mode().as_str())
}

fn old_github_versioning_mode() -> String {
    ["github", "api"].join("-")
}

fn mock_github_login() -> String {
    ["knownext", "dev"].join("-")
}

fn safe_name(value: &str) -> String {
    value.chars().map(|ch| if ch.is_ascii_alphanumeric() { ch } else { '_' }).collect()
}

fn markdown_file_name(value: &str) -> String {
    let cleaned = value
        .trim()
        .chars()
        .map(|ch| match ch {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => '-',
            ch if ch.is_control() => '-',
            ch => ch,
        })
        .collect::<String>()
        .trim_matches([' ', '.', '-'])
        .to_string();
    let name = if cleaned.is_empty() { "contexto-ia".to_string() } else { cleaned };
    if name.to_ascii_lowercase().ends_with(".md") {
        name
    } else {
        format!("{name}.md")
    }
}

fn normalize_markdown(markdown: &str) -> String {
    markdown.replace("\r\n", "\n").replace('\r', "\n").trim_end_matches('\n').to_string()
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
    if !config.is_object() {
        *config = default_config();
    } else {
        let mut merged = default_config();
        merge(&mut merged, config);
        *config = merged;
    }
    config["schemaVersion"] = Value::from(3);
    if let Some(tabs) = config["openUtilityTabs"].as_array_mut() {
        tabs.retain(|value| value.as_str() != Some("notes"));
    }
    if config["activeUtilityTab"].is_null() {
        config["activeUtilityTab"] = Value::from("notes");
    }
    normalize_ai_config(&mut config["ai"]);
}

fn normalize_ai_config(ai: &mut Value) {
    if !ai.is_object() {
        *ai = default_ai_config();
    }
    merge(ai, &default_ai_config());
    ai["provider"] = Value::from("openai");
    ai["permissions"]["generateImages"] = Value::Bool(false);
    ai["permissions"]["createImageAssets"] = Value::Bool(false);
    ai["permissions"]["insertImagesIntoDocuments"] = Value::Bool(false);
    ai["permissions"]["useDocumentContextForImageGeneration"] = Value::Bool(false);
    ai["rag"]["enabled"] = Value::Bool(false);
    ai["rag"]["vectorStoreId"] = Value::Null;
    ai["rag"]["lastIndexedAt"] = Value::Null;
    ai["rag"]["status"] = Value::from("not-indexed");
    ai["rag"]["error"] = Value::Null;
    ai["imageGeneration"]["enabled"] = Value::Bool(false);
    if ai["imageGeneration"]["model"].as_str() == Some("gpt-image-2") {
        ai["imageGeneration"]["model"] = Value::from("gpt-image-1.5");
    }
    ai["agentic"]["webResearchEnabled"] = Value::Bool(false);
}

fn default_config() -> Value {
    json!({
        "schemaVersion": 3,
        "layout": { "sidebarWidth": 338, "historyWidth": 320 },
        "appearance": { "language": "es", "zoomPercent": 100, "markdownExtendedUnderlineEnabled": true, "themeMode": "system", "primaryColor": "orange" },
        "diagnostics": { "traceLoggingEnabled": false },
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
        "permissions": { "editDocuments": true, "createFolders": false, "createDocuments": false, "deleteDocumentsAndFolders": false, "generateImages": false, "createImageAssets": false, "insertImagesIntoDocuments": false, "useDocumentContextForImageGeneration": false },
        "rag": { "enabled": false, "vectorStoreId": null, "lastIndexedAt": null, "status": "not-indexed", "error": null },
        "vision": { "enabled": true, "model": "gpt-5.4-mini", "imageIndexingEnabled": false, "maxImagesPerPrompt": 4, "maxImageSizeMb": 12, "detail": "auto", "storeVisualDescriptions": true },
        "imageGeneration": { "enabled": false, "model": "gpt-image-1.5", "size": "auto", "quality": "auto", "outputFormat": "png", "defaultFolder": "document_folder", "customFolderPath": "assets/generated", "maxImagesPerPrompt": 1, "confirmBeforeDocumentInsert": false, "confirmBeforeUsingMultipleSources": true, "storePromptMetadata": true },
        "agentic": { "depth": "guided", "webResearchEnabled": false, "confirmBeforeApplying": true, "maxSteps": 4, "maxDocuments": 6, "maxEstimatedCostEur": 1, "maxSources": 6 },
        "transcription": { "enabled": true, "model": "gpt-4o-mini-transcribe", "defaultTarget": "prompt", "defaultLanguage": "auto", "favoriteLanguages": ["es", "en"] }
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
        LocalApi::new(root, "2.0.3".to_string(), "desktop".to_string())
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
        create_document_with_parent(api, project_id, "", name, markdown)
    }

    fn create_document_with_parent(api: &LocalApi, project_id: &str, parent_id: &str, name: &str, markdown: &str) -> String {
        let document = api.handle("POST", &format!("/api/projects/{project_id}/documents"), json!({
            "parentId": if parent_id.is_empty() { Value::Null } else { Value::from(parent_id) },
            "name": name,
            "markdown": markdown
        }), vec![]).unwrap();
        document.body["node"]["id"].as_str().unwrap().to_string()
    }

    fn child_id_for_path(id: &str) -> String {
        id.replace("::", "%3A%3A").replace('/', "%2F")
    }

    fn run_git(command: &mut Command) {
        let output = command.output().unwrap();
        assert!(
            output.status.success(),
            "git command failed\nstdout: {}\nstderr: {}",
            String::from_utf8_lossy(&output.stdout),
            String::from_utf8_lossy(&output.stderr)
        );
    }

    #[test]
    fn health_reports_local_tauri_runtime() {
        let api = api();
        let response = api.handle("GET", "/health", Value::Null, vec![]).unwrap();

        assert_eq!(response.status, 200);
        assert_eq!(response.body["app"], "knownext");
        assert_eq!(response.body["service"], "local-tauri-rust");
        assert_eq!(response.body["version"], "2.0.3");
        assert_eq!(response.body["profile"], "desktop");
        assert_eq!(response.body["endpoint"], "tauri://local-api");
    }

    #[test]
    fn project_capabilities_expose_local_git_and_github_device_flow() {
        let api = api();
        let response = api.handle("GET", "/api/projects/capabilities", Value::Null, vec![]).unwrap();

        assert_eq!(response.status, 200);
        assert_eq!(response.body["canCreateLocalProject"], true);
        assert_eq!(response.body["canOpenLocalFolder"], true);
        assert_eq!(response.body["canUseLocalGit"], true);
        assert_eq!(response.body["canConnectGithub"], true);
        assert_eq!(response.body["canUseGithubApi"], true);
        assert_eq!(response.body["requiresGithubLoginForVersioning"], true);
    }

    #[test]
    fn github_remote_errors_are_product_states() {
        let offline = classify_git_remote_error("fatal: unable to access 'https://github.com/org/repo/': Could not resolve host: github.com");
        assert_eq!(offline.access, "offline");
        assert_eq!(offline.state, "offline");

        let invalid_session = classify_git_remote_error("fatal: Authentication failed for 'https://github.com/org/repo.git/'");
        assert_eq!(invalid_session.access, "unauthenticated");
        assert_eq!(invalid_session.state, "local-history");

        let missing_permission = classify_git_remote_error("ERROR: Repository not found.");
        assert_eq!(missing_permission.access, "unauthorized");
        assert_eq!(missing_permission.state, "local-history");
    }

    #[test]
    fn github_sync_pauses_without_auth_and_without_credentials() {
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

        let missing_credentials = api.handle("GET", &format!("/api/projects/{project_id}/sync/status"), Value::Null, vec![]).unwrap();
        assert_eq!(missing_credentials.body["remoteAccess"], "unauthenticated");
        assert_eq!(missing_credentials.body["remotePaused"], true);
        assert_eq!(missing_credentials.body["remoteAction"], "connect-github");
        assert_eq!(missing_credentials.body["label"], "GitHub pausado");
    }

    #[test]
    fn manual_sync_contracts_return_local_first_status_instead_of_legacy_404() {
        let api = api();
        let (project_id, _root) = create_project(&api);

        let push = api.handle("POST", &format!("/api/projects/{project_id}/sync/push"), Value::Null, vec![]).unwrap();
        let pull = api.handle("POST", &format!("/api/projects/{project_id}/sync/pull"), Value::Null, vec![]).unwrap();

        assert_eq!(push.status, 200);
        assert_eq!(pull.status, 200);
        assert_eq!(push.body["status"], "synced");
        assert_eq!(pull.body["status"], "synced");
        assert_eq!(push.body["remotePaused"], false);
        assert_eq!(pull.body["remotePaused"], false);
    }

    #[test]
    fn github_sync_pushes_and_pulls_through_configured_git_remote() {
        let api = api();
        let root = std::env::temp_dir().join(knownext_core::compact_id("knownext-sync-local"));
        let remote = std::env::temp_dir().join(knownext_core::compact_id("knownext-sync-remote.git"));
        let remote_work = std::env::temp_dir().join(knownext_core::compact_id("knownext-sync-remote-work"));
        let created = api.handle("POST", "/api/projects", json!({
            "name": "Remote docs",
            "folderPath": root.to_string_lossy(),
            "versioningMode": "local-git",
            "syncMode": "manual-local"
        }), vec![]).unwrap();
        let project_id = created.body["id"].as_str().unwrap();

        std::fs::write(root.join("README.md"), "# Local\n").unwrap();
        git_add_path(&root, "README.md").unwrap();
        git_commit_all(&root, "Initial local version").unwrap();
        let branch = current_git_branch(&root).unwrap_or_else(|| "master".to_string());

        run_git(Command::new("git").arg("init").arg("--bare").arg(&remote));
        let connected = api.handle("POST", &format!("/api/projects/{project_id}/github/connect"), json!({
            "owner": "octocat",
            "repo": "remote-docs",
            "defaultRef": branch,
            "rootPath": "",
            "syncMode": "manual-github"
        }), vec![]).unwrap();
        assert_eq!(connected.status, 200);
        run_git(Command::new("git").arg("-C").arg(&root).args(["remote", "set-url", "origin"]).arg(&remote));
        let _ = api.write_json(&api.auth_path(), &json!({
            "isAuthenticated": true,
            "provider": "github",
            "user": { "login": "octocat", "name": "Octocat", "avatarUrl": null },
            "scopes": ["repo"],
            "expiresAt": null
        }));
        let _ = api.write_json(&api.credentials_path(), &json!({
            "github": {
                "provider": "github",
                "accessToken": "gho_contract_test",
                "scopes": ["repo"],
                "updatedAt": knownext_core::now_iso()
            }
        }));

        let push = api.handle("POST", &format!("/api/projects/{project_id}/sync/push"), Value::Null, vec![]).unwrap();
        assert_eq!(push.body["status"], "synced");
        assert_eq!(push.body["message"], "Historial local subido a GitHub.");
        assert!(git_head_hash(&root).unwrap().is_some());

        run_git(Command::new("git").arg("clone").arg("--branch").arg(&branch).arg(&remote).arg(&remote_work));
        std::fs::write(remote_work.join("remote.md"), "# Remoto\n").unwrap();
        run_git(Command::new("git").arg("-C").arg(&remote_work).args(["add", "remote.md"]));
        run_git(Command::new("git").arg("-C").arg(&remote_work).args(["-c", "user.name=Remote", "-c", "user.email=remote@example.test", "commit", "-m", "Remote version"]));
        run_git(Command::new("git").arg("-C").arg(&remote_work).args(["push", "origin"]).arg(&branch));

        let pull = api.handle("POST", &format!("/api/projects/{project_id}/sync/pull"), Value::Null, vec![]).unwrap();
        assert_eq!(pull.body["status"], "synced");
        assert_eq!(pull.body["message"], "Proyecto actualizado desde GitHub.");
        assert_eq!(normalize_markdown(&std::fs::read_to_string(root.join("remote.md")).unwrap()), "# Remoto");
    }

    #[test]
    fn project_history_and_github_connection_contracts_update_project_registry() {
        let api = api();
        let (project_id, _root) = create_project(&api);

        let history = api.handle("POST", &format!("/api/projects/{project_id}/history/enable"), Value::Null, vec![]).unwrap();
        assert_eq!(history.status, 200);

        let after_history = api.handle("GET", "/api/projects", Value::Null, vec![]).unwrap();
        assert_eq!(after_history.body[0]["versioningMode"], "local-git");
        assert_eq!(after_history.body[0]["syncMode"], "manual-local");

        let connected = api.handle("POST", &format!("/api/projects/{project_id}/github/connect"), json!({
            "owner": "octocat",
            "repo": "docs",
            "defaultRef": "main",
            "rootPath": "docs",
            "syncMode": "auto-github"
        }), vec![]).unwrap();
        assert_eq!(connected.status, 200);
        assert_eq!(connected.body["remotePaused"], true);

        let projects = api.handle("GET", "/api/projects", Value::Null, vec![]).unwrap();
        assert_eq!(projects.body[0]["syncMode"], "auto-github");
        assert_eq!(projects.body[0]["githubRepository"]["owner"], "octocat");
        assert_eq!(projects.body[0]["githubRepository"]["repo"], "docs");
        assert_eq!(projects.body[0]["githubRepository"]["defaultRef"], "main");
        assert_eq!(projects.body[0]["githubRepository"]["rootPath"], "docs");

        let mode = api.handle("PUT", &format!("/api/projects/{project_id}/sync-mode"), json!({
            "syncMode": "manual-github"
        }), vec![]).unwrap();
        assert_eq!(mode.body["mode"], "github-manual");
        assert_eq!(mode.body["state"], "local-history");
        let after_mode = api.handle("GET", "/api/projects", Value::Null, vec![]).unwrap();
        assert_eq!(after_mode.body[0]["syncMode"], "manual-github");
    }

    #[test]
    fn old_github_versioning_projects_are_returned_as_local_git_projects() {
        let api = api();
        let root = std::env::temp_dir().join(knownext_core::compact_id("knownext-old-github-mode"));
        std::fs::create_dir_all(&root).unwrap();
        ensure_git_repo(&root).unwrap();
        api.write_json(&api.registry_path(), &json!({
            "schemaVersion": 2,
            "activeProjectId": "project-old-github",
            "projects": [{
                "id": "project-old-github",
                "name": "Old GitHub docs",
                "folderPath": root.to_string_lossy(),
                "icon": "folder",
                "iconColor": "#F37021",
                "storageMode": "local-cache",
                "versioningMode": old_github_versioning_mode(),
                "syncMode": "manual-github",
                "authRequired": true,
                "githubRepository": {
                    "owner": "octocat",
                    "repo": "docs",
                    "defaultRef": "main",
                    "rootPath": "",
                    "permissions": ["pull", "push"]
                },
                "isGitRepository": true,
                "active": true
            }]
        })).unwrap();

        let projects = api.handle("GET", "/api/projects", Value::Null, vec![]).unwrap();
        assert_eq!(projects.body[0]["versioningMode"], "local-git");
        assert_eq!(projects.body[0]["storageMode"], "local-files");

        let active = api.handle("GET", "/api/projects/active", Value::Null, vec![]).unwrap();
        assert_eq!(active.body["versioningMode"], "local-git");
        assert_eq!(active.body["storageMode"], "local-files");

        let updated = api.handle("PUT", "/api/projects/project-old-github", json!({
            "name": "Normalized GitHub docs"
        }), vec![]).unwrap();
        assert_eq!(updated.body["versioningMode"], "local-git");
        assert_eq!(updated.body["storageMode"], "local-files");
    }

    #[test]
    fn creating_project_version_commits_document_changes_to_local_git() {
        let api = api();
        let (project_id, root) = create_project(&api);
        let document_id = create_document(&api, &project_id, "plan.md", "# Plan\n");

        let first_version = api.handle("POST", &format!("/api/projects/{project_id}/versions"), json!({
            "documentId": document_id,
            "title": "Version inicial"
        }), vec![]).unwrap();
        let first_hash = git_head_hash(&root).unwrap().unwrap();
        assert_eq!(first_version.body["version"]["hash"], first_hash);
        assert!(git_status_items(&root).unwrap().is_empty());

        let encoded_document_id = child_id_for_path(&document_id);
        let _saved = api.handle("PUT", &format!("/api/documents/{encoded_document_id}"), json!({
            "markdown": "# Plan\n\nActualizado.\n"
        }), vec![]).unwrap();
        assert!(!git_status_items(&root).unwrap().is_empty());

        let second_version = api.handle("POST", &format!("/api/projects/{project_id}/versions"), json!({
            "documentId": document_id,
            "title": "Actualiza plan.md"
        }), vec![]).unwrap();
        let second_hash = git_head_hash(&root).unwrap().unwrap();
        assert_ne!(first_hash, second_hash);
        assert_eq!(second_version.body["version"]["hash"], second_hash);
        assert!(git_status_items(&root).unwrap().is_empty());
    }

    #[test]
    fn versioning_status_respects_files_only_projects() {
        let api = api();
        let root = std::env::temp_dir().join(knownext_core::compact_id("knownext-files-only"));
        let created = api.handle("POST", "/api/projects", json!({
            "name": "Files only",
            "folderPath": root.to_string_lossy(),
            "versioningMode": "none",
            "syncMode": "none"
        }), vec![]).unwrap();
        let project_id = created.body["id"].as_str().unwrap();

        assert_eq!(created.body["isGitRepository"], false);
        assert!(!root.join(".git").exists());

        let status = api.handle("GET", &format!("/api/projects/{project_id}/versioning/status"), Value::Null, vec![]).unwrap();
        assert_eq!(status.body["enabled"], false);
        assert_eq!(status.body["available"], false);
        assert_eq!(status.body["statusLabel"], "Sin historial");
    }

    #[test]
    fn external_changes_scan_and_import_use_local_git_history() {
        let api = api();
        let (project_id, root) = create_project(&api);
        let _document_id = create_document(&api, &project_id, "baseline.md", "# Baseline\n");
        git_add_path(&root, "baseline.md").unwrap();
        git_commit_all(&root, "Baseline").unwrap();

        let clean_versioning = api.handle("GET", &format!("/api/projects/{project_id}/versioning/status"), Value::Null, vec![]).unwrap();
        assert_eq!(clean_versioning.body["available"], true);
        assert_eq!(clean_versioning.body["hasLocalChanges"], false);
        assert!(clean_versioning.body["lastVersionHash"].as_str().unwrap().len() >= 7);

        std::fs::write(root.join("external.md"), "# Externo\n").unwrap();
        std::fs::write(root.join(".env"), "TOKEN=secret").unwrap();

        let dirty_versioning = api.handle("GET", &format!("/api/projects/{project_id}/versioning/status"), Value::Null, vec![]).unwrap();
        assert_eq!(dirty_versioning.body["hasLocalChanges"], true);

        let changes = api.handle("GET", &format!("/api/projects/{project_id}/external-changes"), Value::Null, vec![]).unwrap();
        assert_eq!(changes.status, 200);
        assert_eq!(changes.body["status"], "blocked");
        assert_eq!(changes.body["summary"]["total"], 2);
        assert_eq!(changes.body["summary"]["documents"], 1);
        assert_eq!(changes.body["summary"]["omitted"], 1);
        assert!(changes.body["items"].as_array().unwrap().iter().any(|item| item["path"].as_str() == Some("external.md") && item["decision"].as_str() == Some("include")));
        assert!(changes.body["items"].as_array().unwrap().iter().any(|item| item["path"].as_str() == Some(".env") && item["decision"].as_str() == Some("omit")));

        let external_id = changes.body["items"].as_array().unwrap().iter()
            .find(|item| item["path"].as_str() == Some("external.md"))
            .and_then(|item| item["id"].as_str())
            .unwrap()
            .to_string();
        let imported = api.handle("POST", &format!("/api/projects/{project_id}/external-changes/import"), json!({
            "decisions": [{ "itemId": external_id, "decision": "include" }],
            "syncRemote": false
        }), vec![]).unwrap();
        assert_eq!(imported.body["status"], "synced");
        assert_eq!(imported.body["pendingRemoteSync"], false);
        assert!(imported.body["versionTitle"].as_str().unwrap().contains("Cambios externos importados"));

        let after_import = api.handle("GET", &format!("/api/projects/{project_id}/external-changes"), Value::Null, vec![]).unwrap();
        assert_eq!(after_import.body["summary"]["total"], 1);
        assert_eq!(after_import.body["items"][0]["path"], ".env");
        assert_eq!(after_import.body["items"][0]["decision"], "omit");
        let after_import_versioning = api.handle("GET", &format!("/api/projects/{project_id}/versioning/status"), Value::Null, vec![]).unwrap();
        assert_eq!(after_import_versioning.body["hasLocalChanges"], true);
    }

    #[test]
    fn production_auth_status_clears_persisted_dev_github_account() {
        let api = api();
        let mock_name = ["KnowNext", "Dev"].join(" ");
        let _ = api.write_json(&api.auth_path(), &json!({
            "isAuthenticated": true,
            "provider": "github",
            "user": {
                "login": mock_github_login(),
                "name": mock_name,
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
        let _ = api.write_json(&api.credentials_path(), &json!({
            "github": {
                "provider": "github",
                "accessToken": "gho_private_secret",
                "scopes": ["repo"],
                "updatedAt": knownext_core::now_iso()
            }
        }));
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
    fn auth_status_clears_github_account_when_private_credentials_are_missing() {
        let api = api();
        let _ = api.write_json(&api.auth_path(), &json!({
            "isAuthenticated": true,
            "provider": "github",
            "user": {
                "login": "octocat",
                "name": "Octocat",
                "avatarUrl": null
            },
            "scopes": ["repo", "read:user"],
            "expiresAt": null
        }));

        let auth = api.handle("GET", "/api/auth/status", Value::Null, vec![]).unwrap();

        assert_eq!(auth.body["isAuthenticated"], false);
        assert!(!api.auth_path().exists());
    }

    #[test]
    fn runtime_logging_and_folder_contracts_are_local_runtime_backed() {
        let api = api();

        let status = api.handle("GET", "/api/runtime/logging", Value::Null, vec![]).unwrap();
        assert_eq!(status.status, 200);
        assert_eq!(status.body["enabled"], true);
        assert!(status.body["filePath"].as_str().unwrap().ends_with("knownext.log"));

        let recorded = api.handle("POST", "/api/runtime/logging", json!({
            "level": "info",
            "source": "test.runtime",
            "message": "Contrato runtime logging validado.",
            "detail": "detalle"
        }), vec![]).unwrap();
        assert_eq!(recorded.status, 200);
        assert!(api.logs_dir().join("knownext.log").exists());

        let folder = api.app_data_dir.join("manual-open-folder");
        let opened = api.handle("POST", "/api/runtime/open-folder", json!({
            "folderPath": folder.to_string_lossy()
        }), vec![]).unwrap();
        assert_eq!(opened.status, 200);
        assert_eq!(opened.body["opened"], true);
        assert!(folder.exists());
    }

    #[test]
    fn github_and_openai_credentials_are_preserved_independently() {
        let api = api();
        let _ = api.write_json(&api.credentials_path(), &json!({
            "github": {
                "provider": "github",
                "accessToken": "gho_secret",
                "scopes": ["repo"],
                "updatedAt": knownext_core::now_iso()
            }
        }));

        let saved_key = api.handle("PUT", "/api/credentials/openai-key", json!({ "apiKey": "sk-knownext-test-key" }), vec![]).unwrap();
        let credentials_after_key = api.read_json(&api.credentials_path(), json!({}));

        assert_eq!(saved_key.body["configured"], true);
        assert_eq!(credentials_after_key["openaiKey"], "sk-knownext-test-key");
        assert_eq!(credentials_after_key["github"]["accessToken"], "gho_secret");

        let _ = api.handle("POST", "/api/auth/logout", Value::Null, vec![]).unwrap();
        let credentials_after_logout = api.read_json(&api.credentials_path(), json!({}));

        assert_eq!(credentials_after_logout["openaiKey"], "sk-knownext-test-key");
        assert!(credentials_after_logout.get("github").is_none());

        let _ = api.write_json(&api.credentials_path(), &json!({
            "openaiKey": "sk-knownext-test-key",
            "github": {
                "provider": "github",
                "accessToken": "gho_secret",
                "scopes": ["repo"]
            }
        }));
        let _ = api.handle("DELETE", "/api/credentials/openai-key", Value::Null, vec![]).unwrap();
        let credentials_after_openai_delete = api.read_json(&api.credentials_path(), json!({}));

        assert!(credentials_after_openai_delete.get("openaiKey").is_none());
        assert_eq!(credentials_after_openai_delete["github"]["accessToken"], "gho_secret");
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
    fn folder_move_rename_and_delete_report_child_markdown_documents_as_affected() {
        let api = api();
        let (project_id, _root) = create_project(&api);

        let docs = api.handle("POST", &format!("/api/projects/{project_id}/folders"), json!({
            "parentId": null,
            "name": "docs"
        }), vec![]).unwrap();
        let docs_id = docs.body["node"]["id"].as_str().unwrap().to_string();
        let child_id = create_document_with_parent(&api, &project_id, &docs_id, "plan.md", "# Plan\n");
        let docs_id_path = child_id_for_path(&docs_id);

        let archive = api.handle("POST", &format!("/api/projects/{project_id}/folders"), json!({
            "parentId": null,
            "name": "archive"
        }), vec![]).unwrap();
        let archive_id = archive.body["node"]["id"].as_str().unwrap().to_string();
        let moved = api.handle("PATCH", &format!("/api/projects/{project_id}/nodes/{docs_id_path}/move"), json!({
            "targetFolderId": archive_id
        }), vec![]).unwrap();

        let moved_child_id = doc_id(&project_id, "archive/docs/plan.md");
        assert!(moved.body["affectedDocuments"].as_array().unwrap().iter().any(|document| {
            document["oldId"] == child_id && document["newId"] == moved_child_id && document["path"] == "archive/docs/plan.md"
        }));

        let moved_docs_id = doc_id(&project_id, "archive/docs");
        let moved_docs_id_path = child_id_for_path(&moved_docs_id);
        let renamed = api.handle("PATCH", &format!("/api/projects/{project_id}/nodes/{moved_docs_id_path}/rename"), json!({
            "name": "current"
        }), vec![]).unwrap();

        let renamed_child_id = doc_id(&project_id, "archive/current/plan.md");
        assert!(renamed.body["affectedDocuments"].as_array().unwrap().iter().any(|document| {
            document["oldId"] == moved_child_id && document["newId"] == renamed_child_id && document["path"] == "archive/current/plan.md"
        }));

        let renamed_docs_id = doc_id(&project_id, "archive/current");
        let renamed_docs_id_path = child_id_for_path(&renamed_docs_id);
        let deleted = api.handle("DELETE", &format!("/api/projects/{project_id}/nodes/{renamed_docs_id_path}"), Value::Null, vec![]).unwrap();

        assert!(deleted.body["affectedDocuments"].as_array().unwrap().iter().any(|document| {
            document["oldId"] == renamed_child_id && document["newId"].is_null() && document["path"] == "archive/current/plan.md"
        }));
    }

    #[test]
    fn drafts_reload_report_orphan_status_and_restore_without_legacy_404() {
        let api = api();
        let (project_id, root) = create_project(&api);
        let document_id = create_document(&api, &project_id, "drafted.md", "# Disco\n");
        let loaded = api.handle("GET", &format!("/api/documents/{document_id}"), Value::Null, vec![]).unwrap();
        let base_fingerprint = loaded.body["baseFingerprint"].clone();

        let draft = api.handle("PUT", &format!("/api/documents/{document_id}/draft"), json!({
            "markdown": "# Borrador recuperable\nContenido sin guardar.",
            "baseFingerprint": base_fingerprint
        }), vec![]).unwrap();
        assert_eq!(draft.status, 200);

        let reloaded = api.handle("GET", &format!("/api/documents/{document_id}"), Value::Null, vec![]).unwrap();
        assert_eq!(reloaded.body["markdown"], "# Borrador recuperable\nContenido sin guardar.");
        assert_eq!(reloaded.body["diskMarkdown"], "# Disco\n");
        assert_eq!(reloaded.body["hasDraft"], true);
        assert_eq!(reloaded.body["isDirty"], true);
        assert_eq!(reloaded.body["conflictStatus"], "draft");

        std::fs::remove_file(root.join("drafted.md")).unwrap();
        let status = api.handle("POST", "/api/documents/sync-status", json!({
            "documents": [{ "documentId": document_id, "baseFingerprint": base_fingerprint }]
        }), vec![]).unwrap();
        assert_eq!(status.body["documents"][0]["exists"], false);
        assert_eq!(status.body["documents"][0]["hasDraft"], true);
        assert_eq!(status.body["documents"][0]["orphaned"], true);
        assert_eq!(status.body["documents"][0]["conflictStatus"], "orphaned");

        let orphans = api.handle("GET", "/api/drafts/orphans", Value::Null, vec![]).unwrap();
        assert_eq!(orphans.body.as_array().unwrap().len(), 1);
        assert_eq!(orphans.body[0]["documentId"], document_id);
        assert_eq!(orphans.body[0]["recoverable"], true);

        let draft_key = orphans.body[0]["draftKey"].as_str().unwrap();
        let restored = api.handle("POST", &format!("/api/drafts/{draft_key}/restore"), Value::Null, vec![]).unwrap();
        assert_eq!(restored.status, 200);
        assert_eq!(restored.body["document"]["markdown"], "# Borrador recuperable\nContenido sin guardar.");
        assert_eq!(restored.body["document"]["hasDraft"], false);
        assert_eq!(std::fs::read_to_string(root.join("drafted.md")).unwrap(), "# Borrador recuperable\nContenido sin guardar.");

        let empty = api.handle("GET", "/api/drafts/orphans", Value::Null, vec![]).unwrap();
        assert_eq!(empty.body.as_array().unwrap().len(), 0);
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
            "openUtilityTabs": ["notes", "release-notes"],
            "ai": {
                "rag": { "enabled": true, "vectorStoreId": "vs_legacy", "status": "ready" },
                "imageGeneration": { "enabled": true, "model": "gpt-image-2" },
                "agentic": { "webResearchEnabled": true },
                "permissions": {
                    "generateImages": true,
                    "createImageAssets": true,
                    "insertImagesIntoDocuments": true,
                    "useDocumentContextForImageGeneration": true
                }
            }
        }), vec![]).unwrap();
        assert_eq!(config.body["schemaVersion"], 3);
        assert_eq!(config.body["layout"]["sidebarWidth"], 338);
        assert_eq!(config.body["appearance"]["zoomPercent"], 125);
        assert_eq!(config.body["openUtilityTabs"], json!(["release-notes"]));
        assert_eq!(config.body["ai"]["rag"]["enabled"], false);
        assert!(config.body["ai"]["rag"]["vectorStoreId"].is_null());
        assert_eq!(config.body["ai"]["rag"]["status"], "not-indexed");
        assert_eq!(config.body["ai"]["imageGeneration"]["enabled"], false);
        assert_eq!(config.body["ai"]["imageGeneration"]["model"], "gpt-image-1.5");
        assert_eq!(config.body["ai"]["agentic"]["webResearchEnabled"], false);
        assert_eq!(config.body["ai"]["permissions"]["generateImages"], false);

        let ai_status = api.handle("PUT", "/api/config/ai", json!({
            "provider": "openai",
            "model": "gpt-5.4-mini",
            "rag": { "enabled": true, "vectorStoreId": "vs_legacy", "status": "ready" },
            "imageGeneration": { "enabled": true, "model": "gpt-image-2" },
            "agentic": { "webResearchEnabled": true },
            "permissions": { "generateImages": true }
        }), vec![]).unwrap();
        assert_eq!(ai_status.body["rag"]["enabled"], false);
        assert!(ai_status.body["rag"]["vectorStoreId"].is_null());
        assert_eq!(ai_status.body["imageGeneration"]["enabled"], false);
        assert_eq!(ai_status.body["agentic"]["webResearchEnabled"], false);

        api.write_json(&api.config_path(), &json!({
            "schemaVersion": 1,
            "appearance": { "language": "en" },
            "ai": {
                "rag": { "enabled": true, "vectorStoreId": "vs_legacy", "status": "updated" },
                "imageGeneration": { "enabled": true, "model": "gpt-image-2" },
                "agentic": { "webResearchEnabled": true }
            }
        })).unwrap();
        let migrated = api.handle("GET", "/api/config", Value::Null, vec![]).unwrap();
        assert_eq!(migrated.body["schemaVersion"], 3);
        assert_eq!(migrated.body["layout"]["sidebarWidth"], 338);
        assert_eq!(migrated.body["diagnostics"]["traceLoggingEnabled"], false);
        assert_eq!(migrated.body["appearance"]["language"], "en");
        assert_eq!(migrated.body["ai"]["permissions"]["editDocuments"], true);
        assert_eq!(migrated.body["ai"]["vision"]["enabled"], true);
        assert_eq!(migrated.body["ai"]["transcription"]["enabled"], true);
        assert_eq!(migrated.body["ai"]["rag"]["enabled"], false);
        assert!(migrated.body["ai"]["rag"]["vectorStoreId"].is_null());
        assert_eq!(migrated.body["ai"]["imageGeneration"]["enabled"], false);
        assert_eq!(migrated.body["ai"]["imageGeneration"]["model"], "gpt-image-1.5");
        assert_eq!(migrated.body["ai"]["agentic"]["webResearchEnabled"], false);
        let persisted = api.read_json(&api.config_path(), json!({}));
        assert_eq!(persisted["schemaVersion"], 3);
        assert_eq!(persisted["ai"]["rag"]["enabled"], false);
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
        let asset_id = imported.body["asset"]["id"].as_str().unwrap().to_string();

        let folder = api.handle("POST", &format!("/api/projects/{project_id}/folders"), json!({
            "parentId": null,
            "name": "docs"
        }), vec![]).unwrap();
        let folder_id = folder.body["node"]["id"].as_str().unwrap().to_string();
        let nested = api.handle("POST", &format!("/api/projects/{project_id}/documents"), json!({
            "parentId": folder_id,
            "name": "visual.md",
            "markdown": "# Visual\n"
        }), vec![]).unwrap();
        let nested_document_id = nested.body["node"]["id"].as_str().unwrap().to_string();
        let nested_document_id_path = nested_document_id.replace("::", "%3A%3A").replace('/', "%2F");
        let reference = api.handle("POST", &format!("/api/projects/{project_id}/documents/{nested_document_id_path}/image-reference"), json!({
            "assetId": asset_id,
            "altText": "Pixel"
        }), vec![]).unwrap();
        assert_eq!(reference.body["markdown"], "![Pixel](../pixel.png)");
        api.handle("PUT", &format!("/api/documents/{nested_document_id_path}"), json!({
            "markdown": format!("# Visual\n\n{}\n", reference.body["markdown"].as_str().unwrap())
        }), vec![]).unwrap();
        let usage = api.handle("GET", &format!("/api/projects/{project_id}/assets/{asset_id}/usage"), Value::Null, vec![]).unwrap();
        assert_eq!(usage.body["asset"]["usageCount"], 1);
        assert_eq!(usage.body["references"][0]["documentPath"], "docs/visual.md");
        assert_eq!(usage.body["references"][0]["resolvedAssetPath"], "pixel.png");
        let impact = api.handle("GET", &format!("/api/projects/{project_id}/documents/{nested_document_id_path}/move-impact"), Value::Null, vec![]).unwrap();
        assert_eq!(impact.body["references"].as_array().unwrap().len(), 1);
        assert!(impact.body["message"].as_str().unwrap().contains("referencias de imagen"));
        let image_index = api.handle("POST", &format!("/api/projects/{project_id}/assets/reindex-images"), Value::Null, vec![]).unwrap();
        assert_eq!(image_index.body["imageCount"], 1);
        assert_eq!(image_index.body["indexedImageCount"], 1);
        let indexed_asset = api.handle("GET", &format!("/api/projects/{project_id}/assets/{asset_id}"), Value::Null, vec![]).unwrap();
        assert_eq!(indexed_asset.body["indexed"], true);
        assert_eq!(indexed_asset.body["indexStatus"], "indexed");
        let moved_image = api.handle("PATCH", &format!("/api/projects/{project_id}/nodes/{asset_id}/move"), json!({
            "targetFolderId": folder_id
        }), vec![]).unwrap();
        assert_eq!(moved_image.status, 200);
        let moved_asset_id = doc_id(&project_id, "docs/pixel.png");
        let nested_after_image_move = api.handle("GET", &format!("/api/documents/{nested_document_id_path}"), Value::Null, vec![]).unwrap();
        assert!(nested_after_image_move.body["markdown"].as_str().unwrap().contains("![Pixel](pixel.png)"));
        let moved_asset_id_path = moved_asset_id.replace("::", "%3A%3A").replace('/', "%2F");
        let usage_after_image_move = api.handle("GET", &format!("/api/projects/{project_id}/assets/{moved_asset_id_path}/usage"), Value::Null, vec![]).unwrap();
        assert_eq!(usage_after_image_move.body["references"][0]["resolvedAssetPath"], "docs/pixel.png");

        let moved_document = api.handle("PATCH", &format!("/api/projects/{project_id}/nodes/{nested_document_id_path}/move"), json!({
            "targetFolderId": null
        }), vec![]).unwrap();
        assert_eq!(moved_document.status, 200);
        let root_visual_id = doc_id(&project_id, "visual.md");
        let root_visual_id_path = root_visual_id.replace("::", "%3A%3A").replace('/', "%2F");
        let root_visual = api.handle("GET", &format!("/api/documents/{root_visual_id_path}"), Value::Null, vec![]).unwrap();
        assert!(root_visual.body["markdown"].as_str().unwrap().contains("![Pixel](docs/pixel.png)"));

        let pdf_path = root.join("reference.pdf");
        std::fs::write(&pdf_path, knownext_docs::minimal_pdf("reference", "Texto de referencia")).unwrap();
        let preview = api.handle("POST", &format!("/api/projects/{project_id}/previews"), json!({ "path": "reference.pdf" }), vec![]).unwrap();
        let preview_id = preview.body["id"].as_str().unwrap();
        assert_eq!(preview.body["format"], "pdf");
        let preview_text = api.handle("GET", &format!("/api/projects/{project_id}/previews/{preview_id}/text"), Value::Null, vec![]).unwrap();
        assert_eq!(preview_text.body["searchable"], true);

        let xlsx_path = root.join("budget.xlsx");
        knownext_docs::write_xlsx(&xlsx_path, "Presupuesto", &[
            vec!["Concepto".to_string(), "Importe".to_string()],
            vec!["Licencias".to_string(), "1200".to_string()],
        ]).unwrap();
        let xlsx_preview = api.handle("POST", &format!("/api/projects/{project_id}/previews"), json!({ "path": "budget.xlsx", "preferredMode": "spreadsheet" }), vec![]).unwrap();
        let xlsx_preview_id = xlsx_preview.body["id"].as_str().unwrap();
        assert_eq!(xlsx_preview.body["format"], "xlsx");
        assert_eq!(xlsx_preview.body["sheets"][0]["name"], "Presupuesto");
        assert_eq!(xlsx_preview.body["sheets"][0]["rowCount"], 2);
        assert_eq!(xlsx_preview.body["sheets"][0]["columnCount"], 2);
        let sheets = api.handle("GET", &format!("/api/projects/{project_id}/previews/{xlsx_preview_id}/sheets"), Value::Null, vec![]).unwrap();
        let sheet_id = sheets.body["sheets"][0]["id"].as_str().unwrap();
        let sheet = api.handle("GET", &format!("/api/projects/{project_id}/previews/{xlsx_preview_id}/sheets/{sheet_id}"), Value::Null, vec![]).unwrap();
        assert_eq!(sheet.body["name"], "Presupuesto");
        assert!(sheet.body["cells"].as_array().unwrap().iter().any(|cell| cell["address"] == "A1" && cell["displayValue"] == "Concepto"));
        assert!(sheet.body["cells"].as_array().unwrap().iter().any(|cell| cell["address"] == "B2" && cell["displayValue"] == "1200"));

        let binary = api.content(&format!("/api/documents/{document_id}/export/content"), json!({ "format": "pdf" })).unwrap();
        assert_eq!(binary.status, 200);
        assert_eq!(binary.content_type, "application/pdf");
        assert!(!binary.data_base64.is_empty());
    }

    #[test]
    fn ai_context_and_prompt_contracts_are_local_runtime_backed() {
        let api = api();
        let (project_id, root) = create_project(&api);
        let document_id = create_document(&api, &project_id, "context.md", "# Contexto\nBusca este contenido.");

        let search = api.handle("GET", &format!("/api/projects/{project_id}/ai/context/search?q=contenido"), Value::Null, vec![]).unwrap();
        assert_eq!(search.status, 200);
        assert_eq!(search.body.as_array().unwrap()[0]["documentId"], document_id);

        let prompt = api.handle("POST", &format!("/api/documents/{document_id}/ai/prompt"), json!({
            "prompt": "Resume el documento activo"
        }), vec![]).unwrap();
        assert_eq!(prompt.status, 200);
        assert_eq!(prompt.body["suggestedActions"][0], "Configurar OpenAI");
        assert!(prompt.body["answer"].as_str().unwrap().contains("OpenAI"));

        let source = api.handle("POST", &format!("/api/projects/{project_id}/ai/context/project-documents"), json!({
            "documentId": document_id
        }), vec![]).unwrap();
        assert_eq!(source.body["id"], document_id);
        assert_eq!(source.body["kind"], "project_document");
        let sources = api.handle("GET", &format!("/api/projects/{project_id}/ai/context/sources"), Value::Null, vec![]).unwrap();
        assert_eq!(sources.body["sources"].as_array().unwrap().len(), 1);
        assert_eq!(sources.body["sources"][0]["id"], document_id);
        assert!(sources.body["sources"][0]["text"].is_null());

        let preview = api.handle("GET", &format!("/api/projects/{project_id}/ai/context/sources/{document_id}/preview"), Value::Null, vec![]).unwrap();
        assert!(preview.body["source"]["text"].is_null());
        assert!(preview.body["previewText"].as_str().unwrap().contains("Busca este contenido"));

        let nested_folder = api.handle("POST", &format!("/api/projects/{project_id}/folders"), json!({
            "parentId": null,
            "name": "nested"
        }), vec![]).unwrap();
        let nested_folder_id = nested_folder.body["node"]["id"].as_str().unwrap().to_string();
        let nested_document_id = create_document_with_parent(&api, &project_id, &nested_folder_id, "inside.md", "# Dentro\nContexto en subcarpeta.");
        let nested_document_id_path = child_id_for_path(&nested_document_id);
        let nested_prompt = api.handle("POST", &format!("/api/documents/{nested_document_id_path}/ai/prompt"), json!({
            "prompt": "Resume el documento dentro de carpeta",
            "markdown": "# Dentro\nContexto en subcarpeta."
        }), vec![]).unwrap();
        assert_eq!(nested_prompt.status, 200);
        assert!(nested_prompt.body["answer"].as_str().unwrap().contains("OpenAI"));

        let nested_source = api.handle("POST", &format!("/api/projects/{project_id}/ai/context/project-documents"), json!({
            "documentId": nested_document_id
        }), vec![]).unwrap();
        assert_eq!(nested_source.body["id"], nested_document_id);
        let nested_preview = api.handle("GET", &format!("/api/projects/{project_id}/ai/context/sources/{nested_document_id_path}/preview"), Value::Null, vec![]).unwrap();
        assert_eq!(nested_preview.status, 200);
        assert!(nested_preview.body["previewText"].as_str().unwrap().contains("Contexto en subcarpeta"));

        let uploaded_file = LocalApiFile {
            field_name: "files".to_string(),
            name: "brief.txt".to_string(),
            mime_type: Some("text/plain".to_string()),
            data_base64: base64::engine::general_purpose::STANDARD.encode("Contenido externo para convertir en documento."),
        };
        let uploaded = api.handle("POST", &format!("/api/projects/{project_id}/ai/context/files"), Value::Null, vec![uploaded_file]).unwrap();
        let uploaded_id = uploaded.body["sources"].as_array().unwrap().iter()
            .find(|source| source["name"].as_str() == Some("brief.txt"))
            .and_then(|source| source["id"].as_str())
            .unwrap()
            .to_string();
        let local_context_path = root.join("local-context.md");
        std::fs::write(&local_context_path, "# Local\nArchivo elegido con picker nativo.").unwrap();
        let local_uploaded = api.handle("POST", &format!("/api/projects/{project_id}/ai/context/local-files"), json!({
            "paths": [local_context_path.to_string_lossy()]
        }), vec![]).unwrap();
        assert_eq!(local_uploaded.status, 200);
        let local_source = local_uploaded.body["sources"].as_array().unwrap().iter()
            .find(|source| source["name"].as_str() == Some("local-context.md"))
            .unwrap();
        assert_eq!(local_source["kind"], "external_file");
        assert!(local_source["text"].is_null());
        let local_uploaded_id = local_source["id"].as_str().unwrap();
        let local_preview = api.handle("GET", &format!("/api/projects/{project_id}/ai/context/sources/{local_uploaded_id}/preview"), Value::Null, vec![]).unwrap();
        assert!(local_preview.body["previewText"].as_str().unwrap().contains("Archivo elegido con picker nativo"));

        let added = api.handle("POST", &format!("/api/projects/{project_id}/ai/context/sources/{uploaded_id}/add-to-project"), json!({
            "name": "brief.md",
            "parentId": null
        }), vec![]).unwrap();
        assert_eq!(added.status, 200);
        assert_eq!(added.body["path"], "brief.md");
        assert!(root.join("brief.md").exists());
        assert!(std::fs::read_to_string(root.join("brief.md")).unwrap().contains("Contenido externo para convertir en documento."));
        assert!(!added.body["tree"].as_array().unwrap().is_empty());

        let interaction = api.handle("POST", &format!("/api/projects/{project_id}/ai/interactions"), json!({
            "prompt": "Propón un siguiente paso",
            "documentId": document_id,
            "contextSourceIds": [document_id]
        }), vec![]).unwrap();
        assert_eq!(interaction.status, 200);
        assert_eq!(interaction.body["status"], "error");
        assert_eq!(interaction.body["operations"][0]["type"], "provider_unavailable");
        assert!(interaction.body["conversationEvents"][0]["sourcesUsed"][0]["text"].is_null());
        assert!(!interaction.body["conversationEvents"].as_array().unwrap().is_empty());

        let transcription = api.handle("POST", "/api/transcription", json!({ "language": "es" }), vec![]).unwrap();
        assert_eq!(transcription.body["status"], "error");
        assert_eq!(transcription.body["error"], "missing_audio");

        let index = api.handle("GET", &format!("/api/projects/{project_id}/ai/index/status"), Value::Null, vec![]).unwrap();
        assert_eq!(index.body["localExactReady"], true);
        assert_eq!(index.body["enabled"], false);
        assert_eq!(index.body["status"], "not-indexed");
        assert!(index.body["vectorStoreId"].is_null());
        assert!(index.body["lastIndexedAt"].is_null());
        assert_eq!(index.body["documentCount"], 4);
        assert_eq!(index.body["indexedDocumentCount"], 0);
    }
}
