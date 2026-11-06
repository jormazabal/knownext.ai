#![recursion_limit = "256"]

mod atomic_io;
mod recording_runtime;
mod runtime_health;
mod state_io;
mod projects_runtime;
mod documents_runtime;
mod settings_runtime;
mod audio_transcription;
mod export_styles;
mod application_notes;
mod github_auth;
mod activity_runtime;
mod context_runtime;
mod ai_application;
mod mixed_application_guard;
mod local_file_identity;
mod project_tree;
mod runtime_owner;
mod project_owner;
pub use runtime_owner::{acquire_runtime_owner,RuntimeOwner};
mod path_policy;
mod trash;
mod batch;
mod local_search;
mod local_corpus;
mod credential_store;
mod draft_store;
mod draft_versions;
mod document_recovery;
mod orphan_recovery;
mod recovery_review;
mod recovery_inventory;
mod recovery_lifecycle;
mod operation_journal;
mod slow_runtime;
pub use slow_runtime::{is_slow_runtime_work,dispatch_slow_runtime,cooperative_runtime_work,runtime_resource};
mod compatibility_inventory;
mod recovery_quotas;
mod recovery_copy_storage;
mod retention_generation;
mod recovery_incomplete;
mod recovery_local_edits;
mod version_history;
mod file_moves;
mod document_links;
mod document_references;
mod file_references;
mod project_capabilities;
mod local_state;
mod ai_interaction;
mod ai_results;
mod export_execution;
mod export_profiles;
mod export_batch;
pub use export_batch::{dispatch_export_batch,is_export_batch_work};
mod document_templates;
mod project_transfer;
mod portable_preferences;
mod portable_workspace;
mod project_lifecycle;
mod project_locations;
pub use project_locations::{reviewed_location_owner,location_recording_blocker};
mod storage_usage;
mod ai_index_store;
mod ai_data_policy;
mod security_controls;
mod ai_privacy;
pub use ai_privacy::PrivatePermit;
mod input_limits;
pub use input_limits::validate_runtime_input;
mod ai_private_state;
mod ai_context_origin;
mod ai_operational_state;
mod ancillary_state;
mod state_migrations;
mod document_conflicts;
mod conflict_attempts;
mod handwritten_conflicts;
mod index_rebuild;
pub use index_rebuild::{dispatch_index_rebuild,index_rebuild_project};
mod request_scope;
mod preview_store;
mod file_imports;
mod asset_work;
mod image_inventory_work;
pub use asset_work::{asset_work_request,dispatch_asset_work,AssetWorkKind};
mod portable_paths;
mod history_milestones;
mod history_groups;
mod history_views;
mod history_restore;
mod meeting_minutes;
mod handwritten_ocr;
mod ai_change_history;
mod document_replace;
mod remote_conflicts;
mod project_sync;
mod asset_queries;
mod asset_catalog;
mod handwritten_assets;
mod preview_queries;
mod research_workflow;
mod research_evidence_review;
mod scheduled_backups;
mod scheduled_backup_work;
pub use scheduled_backup_work::is_scheduled_backup_work;
mod provider_work;
pub use provider_work::is_provider_work;
mod external_changes;
mod favorites;
mod diagnostics;
mod runtime_performance;
pub use project_lifecycle::{dispatch_project_lifecycle,is_project_lifecycle_work};
mod document_validation;
pub use document_templates::read_transfer_file;
pub use project_transfer::{dispatch_project_transfer, is_project_transfer_work, is_portable_history_work};
pub use export_execution::{dispatch_export,dispatch_export_content,is_export_request,is_export_content_request,stage_export_content,StagedUserExport};
pub use ai_interaction::{dispatch_interaction, interaction_project_id};
#[cfg(target_os = "android")]
pub use credential_store::initialize_android_credential_protector;

use base64::Engine;
use reqwest::blocking::Client;
use reqwest::header::{HeaderMap, HeaderValue, ACCEPT, USER_AGENT};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};
use std::path::{Path, PathBuf};
use std::process::{Command, Output};
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use time::{format_description::well_known::Rfc3339, Duration as TimeDuration, OffsetDateTime};

#[derive(Clone)]
pub struct LocalApi {
    app_data_dir: PathBuf,
    version: String,
    profile: String,
    started_at: String,
    credential_gate:std::sync::Arc<std::sync::Mutex<()>>,
    batch_deliveries:std::sync::Arc<std::sync::Mutex<BTreeSet<String>>>,
    private_activity:std::sync::Arc<std::sync::Mutex<ai_privacy::Activity>>,
    auth_gate:std::sync::Arc<std::sync::Mutex<()>>,
    auth_generation:std::sync::Arc<std::sync::atomic::AtomicU64>,
    research_gate: std::sync::Arc<std::sync::Mutex<()>>,
    usage_gate: std::sync::Arc<std::sync::Mutex<()>>,
    runtime_id: String,
    runtime_performance: std::sync::Arc<runtime_performance::RuntimePerformance>,
    scheduled_backup_cursor: std::sync::Arc<std::sync::atomic::AtomicUsize>,
    background_work: knownext_core::operations::BackgroundActivity,
    research_failures: std::sync::Arc<std::sync::Mutex<BTreeSet<String>>>,
    project_owners: std::sync::Arc<std::sync::Mutex<BTreeMap<PathBuf,std::sync::Arc<project_owner::ProjectOwner>>>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase",deny_unknown_fields)]
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

const AI_CONVERSATION_MAX_EVENTS: usize = 2_000;

impl LocalApi {
    /// Audited snapshots, diagnostics and cooperative stop signals bypass document mutations.
    pub fn is_independent_snapshot(method: &str, path: &str) -> bool {
        let parts: Vec<_> = path.split('?').next().unwrap_or("").trim_matches('/').split('/').collect();
        matches!((method,parts.as_slice()),
            ("GET",["api","projects",_,"nodes","batch",_]) |
            ("POST",["api","projects",_,"nodes","batch",_,"cancel"]) |
            ("POST",["api","projects",_,"search","content"]) |
            ("POST",["api","projects",_,"location","review"]) |
            ("GET",["api","recovery","drafts" | "archives"]) |
            ("GET",["api","recovery","conflict-attempts"]) |
            ("GET",["api","recovery","conflict-attempt-archives"]) |
            ("GET",["api","recovery","conflict-attempts",_]) |
            ("GET",["api","recovery","conflict-attempts",_,"package-review"]) |
            ("GET",["api","recovery","conflict-attempts",_,"retention"]) |
            ("GET",["api","recovery","conflict-attempts",_,"payloads"]) |
            ("GET",["api","recovery","formats"|"families"]) |
            ("GET",["api","recovery","families",_]) |
            ("POST",["api","recovery","families",_,_,"review"]) |
            ("GET",["api","projects",_,"scheduled-backups"]) |
            ("GET",["api","projects",_,"scheduled-backups",_]) |
            ("GET",["api","projects",_,"protection"]) |
            ("GET",["api","recovery","storage"]) |
            ("GET",["api","recovery","storage","quotas"]) |
            ("GET",["api","drafts","orphans"]) |
            ("GET",["api","recovery","orphans"]) |
            ("POST",["api","recovery","drafts",_,"preview"]) |
            ("POST",["api","recovery","local-edits",_,"review"]) |
            ("GET",["api","documents",_,"links"]) |
            ("GET",["api","documents",_,"history"]) |
            ("GET",["api","documents",_,"history","groups"]) |
            ("GET",["api","documents",_,"remote-conflict"]) |
            ("POST",["api","documents"|"handwritten-notes",_,"conflict-attempts",_,"review"]) |
            ("GET",["api","projects",_,"sync","remote-review"]) |
            ("GET",["api","projects",_,"sync","graph-joins",_]) |
            ("GET",["api","projects",_,"tree"]) |
            ("POST",["api","projects",_,"sync","history-copies","review"]) |
            ("GET",["api","projects",_,"sync","history-copies",_]) |
            ("GET",["api","documents",_,"versions"]) |
            ("GET",["api","documents",_,"versions",_,"content"]) |
            ("GET",["api","project-transfers"]) |
            ("GET",["api","project-templates"]) |
            ("GET",["api","retired-projects"]) |
            ("GET",["api","storage","usage"]) |
            ("GET",["api","ai","usage","summary"|"ledger"|"budget"]) |
            ("GET",["api","storage","preview-cleanup"]) |
            ("GET",["api","ai","data-policy"]) |
            ("GET",["api","recovery","upgrade" | "upgrades"]) |
            ("GET",["api","recovery","archives",_,"content-review"]) |
            ("POST",["api","projects",_,"sync","mixed-selections","review"]) |
            ("GET",["api","projects",_,"sync","mixed-selections",_]) |
            ("GET",["api","projects",_,"sync","mixed-selections",_,"application"]) |
            ("GET",["api","projects",_,"sync","mixed-selections",_,"application","retention"]) |
            ("GET",["api","projects",_,"sync","mixed-selections",_,"application","backup"]) |
            ("POST",["api","projects",_,"sync","mixed-selections",_,"application","review"]) |
            ("GET",["api","recovery","system"]) |
            ("GET",["api","recovery","system",_]) |
            ("GET",["api","recovery","upgrades",_]) |
            ("GET",["api","recovery","upgrades",_,"retention"]) |
            ("GET",["api","projects",_,"history-restores"|"document-replacements"|"ai-changes"|"meeting-minutes"|"handwritten-ocr",..]) |
            ("POST",["api","projects",_,"history-restores","review"|"preview"]) |
            ("POST",["api","projects",_,"meeting-minutes","review"]) |
            ("GET",["api","handwritten-notes",_,"ocr",..]) |
            ("POST",["api","projects",_,"document-replacements","review"]) |
            ("POST",["api","projects",_,"ai-changes",_,"review"|"page-preview"]) |
            ("GET",["api","projects",_,"research-evidence",_]) |
            ("POST",["api","projects",_,"research-evidence",_,"prepare"]) |
            ("GET",["api","projects",_,"asset-catalog",..]) |
            ("GET",["api","project-templates","catalogue-attempts",..]) |
            ("GET",["api","projects",_,"favorites"]) |
            ("GET",["api","projects",_,"portable-preferences"]) |
            ("GET",["api","projects",_,"portable-history"]) |
            ("POST",["api","projects",_,"portable-history",_,"review"]) |
            ("GET",["api","projects",_,"portable-recordings"]) |
            ("POST",["api","projects",_,"portable-recordings",_,"review"]) |
            ("GET",["api","projects",_,"portable-drafts"]) |
            ("POST",["api","projects",_,"portable-drafts",_,"review"]) |
            ("GET",["api","runtime","diagnostics" | "logging"]) |
            ("POST",["api","runtime","logging"]))
    }
    pub fn new(app_data_dir: PathBuf, version: String, profile: String) -> Self {
        let _ = std::fs::create_dir_all(&app_data_dir);
        Self {
            app_data_dir,
            version,
            profile,
            started_at: knownext_core::now_iso(),
            auth_gate:Default::default(),auth_generation:Default::default(),
            research_gate: Default::default(),
            usage_gate: Default::default(),
            runtime_id: knownext_core::compact_id("runtime"),
            runtime_performance: Default::default(),
            scheduled_backup_cursor: std::sync::Arc::new(std::sync::atomic::AtomicUsize::new(0)),
            credential_gate:Default::default(),
            batch_deliveries:Default::default(),
            private_activity:Default::default(),
            background_work: Default::default(),
            research_failures: Default::default(),
            project_owners: Default::default(),
        }
    }

}

fn ok(body: Value) -> ApiResult {
    Ok(LocalApiResponse { status: 200, body })
}
fn ok_value(body: Value) -> Result<Value, String> {
    Ok(body)
}
fn no_content() -> ApiResult {
    Ok(LocalApiResponse {
        status: 204,
        body: Value::Null,
    })
}
fn bad(status: u16, detail: &str) -> ApiResult {
    Ok(LocalApiResponse {
        status,
        body: json!({ "detail": detail }),
    })
}

fn body_id<'a>(body: &'a Value, keys: &[&str]) -> Option<&'a str> {
    keys.iter().find_map(|key| {
        body.get(*key)
            .and_then(Value::as_str)
            .filter(|value| !value.is_empty())
    })
}

fn binary(
    status: u16,
    content_type: String,
    filename: Option<String>,
    bytes: Vec<u8>,
) -> LocalApiContentResponse {
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
        params.insert(
            knownext_core::percent_decode(key),
            knownext_core::percent_decode(value),
        );
    }
    (path.to_string(), params)
}

fn tree_node(project_id: &str, _root: &Path, path: &Path, relative: &str) -> Value {
    tree_node_from_metadata(project_id,path,relative,std::fs::metadata(path).ok())
}
fn tree_node_from_metadata(project_id:&str,path:&Path,relative:&str,metadata:Option<std::fs::Metadata>)->Value{
    let kind = if metadata.as_ref().is_some_and(std::fs::Metadata::is_dir) {
        "folder"
    } else {
        match path
            .extension()
            .and_then(|value| value.to_str())
            .unwrap_or("")
            .to_ascii_lowercase()
            .as_str()
        {
            "md" | "markdown" => "document",
            "knote" => "handwritten-note",
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

fn collect_project_sync_entries(root: &Path) -> Result<Vec<PathBuf>, String> {
    let mut entries = Vec::new();
    collect_project_sync_entries_into(root, root, &mut entries)?;
    Ok(entries)
}

fn collect_project_sync_entries_into(
    root: &Path,
    current: &Path,
    entries: &mut Vec<PathBuf>,
) -> Result<(), String> {
    let entries_iter = std::fs::read_dir(current).map_err(|error| error.to_string())?;
    for entry in entries_iter.flatten() {
        let path = entry.path();
        if batch::linked(&std::fs::symlink_metadata(&path).map_err(|e| e.to_string())?) { continue; }
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') || matches!(name.as_str(), "node_modules" | "target" | "dist") {
            continue;
        }
        if path.strip_prefix(root).is_ok() {
            entries.push(path.clone());
        }
        if path.is_dir() {
            collect_project_sync_entries_into(root, &path, entries)?;
        }
    }
    Ok(())
}

fn collect_project_files_into(
    root: &Path,
    current: &Path,
    files: &mut Vec<PathBuf>,
) -> Result<(), String> {
    let entries = std::fs::read_dir(current).map_err(|error| error.to_string())?;
    for entry in entries.flatten() {
        let path = entry.path();
        if batch::linked(&std::fs::symlink_metadata(&path).map_err(|e| e.to_string())?) { continue; }
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
    path.strip_prefix(root)
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/")
}

fn phase_status(state: &str, label: &str, detail: Option<&str>) -> Value {
    json!({
        "state": state,
        "label": label,
        "detail": detail
    })
}

fn file_sync_kind(path: &Path) -> &'static str {
    if path.is_dir() {
        return "folder";
    }
    match path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_ascii_lowercase()
        .as_str()
    {
        "md" | "markdown" | "txt" => "document",
        "knote" => "handwritten-note",
        "png" | "jpg" | "jpeg" | "gif" | "webp" | "svg" => "image",
        "pdf" | "docx" | "xlsx" | "csv" => "attachment",
        _ => "attachment",
    }
}

fn system_time_iso(value: SystemTime) -> Option<String> {
    let duration = value.duration_since(UNIX_EPOCH).ok()?;
    let timestamp = OffsetDateTime::from_unix_timestamp(duration.as_secs() as i64).ok()?
        + TimeDuration::nanoseconds(duration.subsec_nanos() as i64);
    timestamp.format(&Rfc3339).ok()
}

fn moved_file_mappings(
    root: &Path,
    old_path: &Path,
    old_relative: &str,
    new_relative: &str,
) -> Result<Vec<(String, String)>, String> {
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

fn moved_markdown_affected_documents(
    project_id: &str,
    moved_files: &[(String, String)],
) -> Vec<Value> {
    moved_files
        .iter()
        .filter(|(old_relative, new_relative)| {
            let old_path = Path::new(old_relative);
            let new_path = Path::new(new_relative);
            is_markdown_path(old_path)
                || is_markdown_path(new_path)
                || is_handwritten_note_path(old_path)
                || is_handwritten_note_path(new_path)
        })
        .map(|(old_relative, new_relative)| json!({
            "oldId": doc_id(project_id, old_relative),
            "newId": doc_id(project_id, new_relative),
            "name": Path::new(new_relative).file_name().and_then(|value| value.to_str()).unwrap_or("documento.md"),
            "path": new_relative
        }))
        .collect()
}

fn deleted_markdown_affected_documents(
    project_id: &str,
    root: &Path,
    path: &Path,
) -> Result<Vec<Value>, String> {
    let paths = if path.is_dir() {
        collect_project_files(path)?
    } else {
        vec![path.to_path_buf()]
    };
    Ok(paths
        .into_iter()
        .filter(|path| is_markdown_path(path) || is_handwritten_note_path(path))
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
                if let (Some(target),Some(source))=(existing.as_object_mut(),item.as_object()) {
                    target.extend(source.clone());
                }
            })
            .or_insert(item);
    }
    by_identity.into_values().collect()
}

fn is_image_path(path: &Path) -> bool {
    matches!(
        path.extension()
            .and_then(|value| value.to_str())
            .unwrap_or("")
            .to_ascii_lowercase()
            .as_str(),
        "png" | "jpg" | "jpeg" | "gif" | "webp" | "svg"
    )
}

fn is_exportable_raster_image_path(path: &Path) -> bool {
    matches!(
        path.extension()
            .and_then(|value| value.to_str())
            .unwrap_or("")
            .to_ascii_lowercase()
            .as_str(),
        "png" | "jpg" | "jpeg" | "gif" | "webp"
    )
}

fn image_content_type(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_ascii_lowercase()
        .as_str()
    {
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        _ => "image/png",
    }
}

fn image_data_url_bytes(value: &str) -> Option<(String, Vec<u8>)> {
    let (header, data) = value.split_once(',')?;
    let content_type = header
        .strip_prefix("data:")
        .and_then(|rest| rest.split(';').next())
        .filter(|mime| {
            matches!(
                *mime,
                "image/png" | "image/jpeg" | "image/gif" | "image/webp"
            )
        })?;
    if !header.contains(";base64") {
        return None;
    }
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(data.trim())
        .ok()?;
    Some((content_type.to_string(), bytes))
}

fn is_markdown_path(path: &Path) -> bool {
    matches!(
        path.extension()
            .and_then(|value| value.to_str())
            .unwrap_or("")
            .to_ascii_lowercase()
            .as_str(),
        "md" | "markdown"
    )
}

fn is_text_context_path(path: &Path) -> bool {
    matches!(
        path.extension()
            .and_then(|value| value.to_str())
            .unwrap_or("")
            .to_ascii_lowercase()
            .as_str(),
        "txt" | "csv" | "tsv" | "json" | "yaml" | "yml"
    )
}

fn markdown_image_references(
    markdown: &str,
    project_id: &str,
    document_id: &str,
    document_name: &str,
    document_path: &str,
) -> Vec<Value> {
    let (mut cursor, mut line, mut column) = (0, 1, 1);
    knownext_docs::markdown_images(markdown).into_iter().map(|image| {
        for character in markdown[cursor..image.range.start].chars() {
            if character == '\n' { line += 1; column = 1; } else { column += 1; }
        }
        cursor = image.range.start;
        asset_reference_value(project_id, document_id, document_name, document_path, &image.source, image.kind, Some(&image.alt), line, column)
    }).collect()
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
    if let Some(relative) = knownext_asset_url_relative(target) {
        return normalize_project_relative(&relative);
    }
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
        join_relative(
            document_path.rsplit_once('/').map(|(parent, _)| parent),
            &decoded,
        )
    };
    normalize_project_relative(&joined)
}

fn knownext_asset_url_relative(target: &str) -> Option<String> {
    let rest = target
        .strip_prefix("http://knownext-asset.localhost/")
        .or_else(|| target.strip_prefix("https://knownext-asset.localhost/"))?;
    let (_, asset_id) = rest.split_once('/')?;
    Some(
        knownext_core::percent_decode(asset_id.split(['?', '#']).next().unwrap_or(asset_id))
            .replace('\\', "/"),
    )
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
    let document_parent = document_path
        .rsplit_once('/')
        .map(|(parent, _)| parent)
        .unwrap_or("");
    let from_parts = document_parent
        .split('/')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>();
    let to_parts = asset_path
        .split('/')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>();
    let mut common = 0usize;
    while common < from_parts.len()
        && common < to_parts.len()
        && from_parts[common] == to_parts[common]
    {
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
    document_id
        .split_once("::")
        .map(|(project_id, relative)| (project_id.to_string(), relative.to_string()))
        .ok_or_else(|| "Identificador de documento inválido".to_string())
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

fn is_handwritten_note_path(path: &Path) -> bool {
    path.extension()
        .and_then(|value| value.to_str())
        .map(|value| value.eq_ignore_ascii_case("knote"))
        .unwrap_or(false)
}

fn relative_markdown_target(document_relative: &str, asset_relative: &str) -> String {
    let document_parent = document_relative
        .rsplit_once('/')
        .map(|(parent, _)| parent)
        .unwrap_or("");
    if document_parent.is_empty() {
        return asset_relative.to_string();
    }
    if let Some(stripped) = asset_relative.strip_prefix(&format!("{document_parent}/")) {
        return stripped.to_string();
    }
    let parent_depth = document_parent
        .split('/')
        .filter(|segment| !segment.trim().is_empty())
        .count();
    format!("{}{}", "../".repeat(parent_depth), asset_relative)
}

fn export_bytes(
    name: &str, markdown: &str, format: &str,
    diagram_assets: &[knownext_docs::DiagramAsset],
    image_assets: &[knownext_docs::ExportImageAsset], export_template: &Value,
) -> Result<(String,String,Vec<u8>),String> {
    let (content_type,extension,bytes)=match format {
        "md"=>("text/markdown;charset=utf-8","md",markdown.as_bytes().to_vec()),
        "docx"=>{
            let temporary=tempfile::tempdir().map_err(|error|format!("No se puede preparar la exportación Word: {error}"))?;
            let path=temporary.path().join("document.docx");
            knownext_docs::write_docx_with_assets_template_and_title(&path,markdown,diagram_assets,image_assets,Some(export_template),Some(name))?;
            let bytes=std::fs::read(&path).map_err(|error|format!("No se puede leer la exportación Word: {error}"))?;
            if bytes.is_empty(){return Err("La exportación Word no ha producido contenido".into());}
            ("application/vnd.openxmlformats-officedocument.wordprocessingml.document","docx",bytes)
        },
        "pdf"=>("application/pdf","pdf",knownext_docs::export_pdf_with_assets_and_template(name,markdown,diagram_assets,image_assets,Some(export_template))?),
        _=>return Err("Formato de exportación no soportado".into()),
    };
    Ok((content_type.into(),export_name(name,extension),bytes))
}

fn export_name(name: &str, ext: &str) -> String {
    format!(
        "{}.{}",
        name.rsplit_once('.').map(|(stem, _)| stem).unwrap_or(name),
        ext
    )
}

fn open_path_external(path: &Path) -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        let _ = path;
        return Err(
            "La apertura externa no está disponible desde este contrato local en Android."
                .to_string(),
        );
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
        command.spawn().map(|_| ()).map_err(|error| {
            format!("No se pudo abrir el documento con la aplicación predeterminada: {error}")
        })
    }
}

fn preview_value(project_id: &str, preview_id: &str, relative: &str, path: &Path) -> Value {
    let ext = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    let format = if ext == "xlsx" {
        "xlsx"
    } else if ext == "docx" {
        "docx"
    } else {
        "pdf"
    };
    let renditions = if format == "xlsx" {
        json!(["text", "workbook"])
    } else {
        json!(["pdf", "text"])
    };
    let sheets = if format == "xlsx" {
        Value::Array(knownext_docs::xlsx_sheet_summaries(path))
    } else {
        Value::Null
    };
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
        "localAheadCount": if pending_push { 1 } else { 0 },
        "remoteAheadCount": if pending_pull { 1 } else { 0 },
        "localAheadPaths": [],
        "remoteAheadPaths": [],
        "diverged": false,
        "conflicts": []
    })
}

fn json_string_set(value: Option<&Value>) -> BTreeSet<String> {
    value
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default()
}

fn remote_action_for_access(remote_access: &str) -> &'static str {
    match remote_access {
        "unauthenticated" => "connect-github",
        "unauthorized" => "request-permission",
        "offline" | "unknown" => "retry",
        _ => "retry",
    }
}

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

fn local_git_command() -> Command {
    let mut command = Command::new("git");
    command
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GCM_INTERACTIVE", "never")
        .env("GCM_MODAL_PROMPT", "false");
    configure_silent_process(&mut command);
    command
}

#[cfg(target_os = "windows")]
fn configure_silent_process(command: &mut Command) {
    use std::os::windows::process::CommandExt;
    command.creation_flags(CREATE_NO_WINDOW);
}

#[cfg(not(target_os = "windows"))]
fn configure_silent_process(_command: &mut Command) {}

fn run_local_git(command: &mut Command) -> Result<Output, String> {
    command
        .output()
        .map_err(|error| format!("Git no está disponible: {error}"))
}

fn git_version() -> Result<String, String> {
    let output = run_local_git(local_git_command().arg("--version"))?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
    }
}

fn ensure_git_repo(root: &Path) -> Result<(), String> {
    if root.join(".git").exists() {
        return Ok(());
    }
    let output = run_local_git(local_git_command().arg("-C").arg(root).arg("init"))?;
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
    let has_github_repository = project
        .get("githubRepository")
        .is_some_and(|repository| !repository.is_null());
    let should_use_local_git = is_old_github_versioning_mode(Some(versioning_mode))
        || versioning_mode == "local-git"
        || is_github_sync_mode(sync_mode)
        || (has_github_repository && project.get("versioningMode").and_then(Value::as_str).is_none());
    project["versioningMode"] = Value::from(if should_use_local_git {
        "local-git"
    } else {
        "none"
    });
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
        let output = run_local_git(
            local_git_command()
                .arg("-C")
                .arg(root)
                .args(["remote", "set-url", "origin", &url]),
        )?;
        return command_ok(output);
    }
    let output = run_local_git(
        local_git_command()
            .arg("-C")
            .arg(root)
            .args(["remote", "add", "origin", &url]),
    )?;
    command_ok(output)
}

fn git_remote_url(root: &Path, remote: &str) -> Result<Option<String>, String> {
    let output = run_local_git(
        local_git_command()
            .arg("-C")
            .arg(root)
            .args(["remote", "get-url", remote]),
    )?;
    if output.status.success() {
        let value = String::from_utf8_lossy(&output.stdout).trim().to_string();
        Ok((!value.is_empty()).then_some(value))
    } else {
        Ok(None)
    }
}

fn current_git_branch(root: &Path) -> Option<String> {
    let output = run_local_git(
        local_git_command()
            .arg("-C")
            .arg(root)
            .args(["branch", "--show-current"]),
    )
    .ok()?;
    if !output.status.success() {
        return None;
    }
    let branch = String::from_utf8_lossy(&output.stdout).trim().to_string();
    (!branch.is_empty()).then_some(branch)
}

fn git_status_items(root: &Path) -> Result<Vec<Value>, String> {
    let output = run_local_git(local_git_command().arg("-C").arg(root).args([
        "status",
        "--porcelain=v1",
        "--untracked-files=all",
    ]))?;
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
        let path = git_status_path(raw_path);
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

fn git_status_path(raw_path: &str) -> String {
    let path = split_git_rename_target(raw_path);
    unquote_git_path(path).replace('\\', "/")
}

fn split_git_rename_target(raw_path: &str) -> &str {
    let bytes = raw_path.as_bytes();
    let mut in_quotes = false;
    let mut escaped = false;
    let mut index = 0;
    while index + 4 <= bytes.len() {
        let byte = bytes[index];
        if in_quotes {
            if escaped {
                escaped = false;
            } else if byte == b'\\' {
                escaped = true;
            } else if byte == b'"' {
                in_quotes = false;
            }
        } else if byte == b'"' {
            in_quotes = true;
        } else if &bytes[index..index + 4] == b" -> " {
            return raw_path[index + 4..].trim();
        }
        index += 1;
    }
    raw_path.trim()
}

fn unquote_git_path(path: &str) -> String {
    let trimmed = path.trim();
    if !trimmed.starts_with('"') {
        return trimmed.to_string();
    }
    let mut chars = trimmed[1..].chars().peekable();
    let mut output = Vec::<u8>::new();
    while let Some(character) = chars.next() {
        if character == '"' {
            break;
        }
        if character != '\\' {
            let mut buffer = [0; 4];
            output.extend_from_slice(character.encode_utf8(&mut buffer).as_bytes());
            continue;
        }
        match chars.next() {
            Some('a') => output.push(0x07),
            Some('b') => output.push(0x08),
            Some('f') => output.push(0x0c),
            Some('n') => output.push(b'\n'),
            Some('r') => output.push(b'\r'),
            Some('t') => output.push(b'\t'),
            Some('v') => output.push(0x0b),
            Some('\\') => output.push(b'\\'),
            Some('"') => output.push(b'"'),
            Some(first @ '0'..='7') => {
                let mut octal = String::from(first);
                for _ in 0..2 {
                    if matches!(chars.peek(), Some(next) if next.is_ascii_digit() && *next < '8') {
                        octal.push(chars.next().unwrap_or('0'));
                    } else {
                        break;
                    }
                }
                if let Ok(value) = u8::from_str_radix(&octal, 8) {
                    output.push(value);
                }
            }
            Some(other) => {
                let mut buffer = [0; 4];
                output.extend_from_slice(other.encode_utf8(&mut buffer).as_bytes());
            }
            None => break,
        }
    }
    String::from_utf8_lossy(&output).to_string()
}

fn git_head_hash(root: &Path) -> Result<Option<String>, String> {
    let output = run_local_git(local_git_command().arg("-C").arg(root).args([
        "rev-parse",
        "--short=8",
        "HEAD",
    ]))?;
    if output.status.success() {
        let hash = String::from_utf8_lossy(&output.stdout).trim().to_string();
        Ok((!hash.is_empty()).then_some(hash))
    } else {
        Ok(None)
    }
}

fn git_auth_header(token: &str) -> String {
    let credentials =
        base64::engine::general_purpose::STANDARD.encode(format!("x-access-token:{token}"));
    format!("AUTHORIZATION: basic {credentials}")
}

fn git_remote_head_hash(
    root: &Path,
    token: &str,
    remote: &str,
    branch: &str,
) -> Result<Option<String>, String> {
    let output = run_local_git(
        local_git_command()
            .arg("-C")
            .arg(root)
            .arg("-c")
            .arg(format!(
                "http.https://github.com/.extraheader={}",
                git_auth_header(token)
            ))
            .args(["ls-remote", remote, &format!("refs/heads/{branch}")]),
    )?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    Ok(stdout
        .split_whitespace()
        .next()
        .map(|hash| hash.chars().take(8).collect()))
}

#[derive(Default)]
struct GitRemoteDelta {
    local_ahead_count: u64,
    remote_ahead_count: u64,
    local_ahead_paths: Vec<String>,
    remote_ahead_paths: Vec<String>,
}

fn git_remote_delta(
    root: &Path,
    token: &str,
    branch: &str,
    remote_exists: bool,
) -> Result<GitRemoteDelta, String> {
    if !remote_exists {
        return Ok(GitRemoteDelta::default());
    }
    git_fetch_origin(root, token, branch)?;
    let (local_ahead_count, remote_ahead_count) =
        git_rev_list_counts(root, &format!("origin/{branch}"))?;
    Ok(GitRemoteDelta {
        local_ahead_count,
        remote_ahead_count,
        local_ahead_paths: git_diff_names(root, &format!("origin/{branch}..HEAD"))?,
        remote_ahead_paths: git_diff_names(root, &format!("HEAD..origin/{branch}"))?,
    })
}

fn git_fetch_origin(root: &Path, token: &str, branch: &str) -> Result<(), String> {
    let output = run_local_git(
        local_git_command()
            .arg("-C")
            .arg(root)
            .arg("-c")
            .arg(format!(
                "http.https://github.com/.extraheader={}",
                git_auth_header(token)
            ))
            .args(["fetch", "origin", branch]),
    )?;
    command_ok(output)
}

fn git_rev_list_counts(root: &Path, upstream: &str) -> Result<(u64, u64), String> {
    let output = run_local_git(local_git_command().arg("-C").arg(root).args([
        "rev-list",
        "--left-right",
        "--count",
        &format!("HEAD...{upstream}"),
    ]))?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut parts = stdout.split_whitespace();
    let local = parts
        .next()
        .and_then(|value| value.parse::<u64>().ok())
        .unwrap_or(0);
    let remote = parts
        .next()
        .and_then(|value| value.parse::<u64>().ok())
        .unwrap_or(0);
    Ok((local, remote))
}

fn git_diff_names(root: &Path, range: &str) -> Result<Vec<String>, String> {
    let output = run_local_git(local_git_command().arg("-C").arg(root).args([
        "diff",
        "--name-only",
        range,
    ]))?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }
    let mut paths = String::from_utf8_lossy(&output.stdout)
        .lines()
        .map(git_status_path)
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>();
    paths.sort();
    paths.dedup();
    Ok(paths)
}

fn git_push_origin(root: &Path, token: &str, branch: &str) -> Result<(), String> {
    let output = run_local_git(
        local_git_command()
            .arg("-C")
            .arg(root)
            .arg("-c")
            .arg(format!(
                "http.https://github.com/.extraheader={}",
                git_auth_header(token)
            ))
            .args(["push", "-u", "origin", &format!("HEAD:{branch}")]),
    )?;
    command_ok(output)
}

fn git_pull_ff_only(root: &Path, token: &str, branch: &str) -> Result<(), String> {
    git_fetch_origin(root, token, branch)?;
    let merge = run_local_git(local_git_command().arg("-C").arg(root).args([
        "merge",
        "--ff-only",
        &format!("origin/{branch}"),
    ]))?;
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
            "GitHub no pudo completar la comprobación remota. El historial local sigue disponible."
                .to_string()
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

fn classify_external_change(
    path: &str,
    root: &Path,
) -> (&'static str, &'static str, &'static str, Value) {
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
        return (
            "private",
            "blocked",
            "omit",
            Value::from("Archivo potencialmente privado."),
        );
    }
    if lower.starts_with("node_modules/")
        || lower.starts_with("target/")
        || lower.starts_with("dist/")
        || lower.starts_with(".tauri/")
        || lower.starts_with(".idea/")
        || lower.starts_with(".vscode/")
    {
        return (
            "ignored",
            "blocked",
            "omit",
            Value::from("Archivo técnico omitido del historial del proyecto."),
        );
    }
    let full_path = root.join(path.replace('/', std::path::MAIN_SEPARATOR_STR));
    if full_path.is_dir() {
        return ("folder", "safe", "include", Value::Null);
    }
    match lower.rsplit('.').next().unwrap_or("") {
        "md" | "markdown" | "txt" => ("document", "safe", "include", Value::Null),
        "knote" => ("handwritten-note", "safe", "include", Value::Null),
        "png" | "jpg" | "jpeg" | "gif" | "webp" | "svg" => {
            ("image", "safe", "include", Value::Null)
        }
        "pdf" | "docx" | "xlsx" | "csv" => (
            "attachment",
            "review",
            "review",
            Value::from("Adjunto detectado fuera de la app; revisa antes de incluir."),
        ),
        _ => (
            "unsupported",
            "review",
            "review",
            Value::from("Tipo de archivo no reconocido automáticamente."),
        ),
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
            "blocked" => {
                summary["blocked"] = Value::from(summary["blocked"].as_u64().unwrap_or(0) + 1)
            }
            _ => summary["review"] = Value::from(summary["review"].as_u64().unwrap_or(0) + 1),
        }
        match item["changeType"].as_str().unwrap_or("") {
            "added" => summary["added"] = Value::from(summary["added"].as_u64().unwrap_or(0) + 1),
            "modified" => {
                summary["modified"] = Value::from(summary["modified"].as_u64().unwrap_or(0) + 1)
            }
            "deleted" => {
                summary["deleted"] = Value::from(summary["deleted"].as_u64().unwrap_or(0) + 1)
            }
            _ => {}
        }
        match item["kind"].as_str().unwrap_or("") {
            "folder" => {
                summary["folders"] = Value::from(summary["folders"].as_u64().unwrap_or(0) + 1)
            }
            "document" => {
                summary["documents"] = Value::from(summary["documents"].as_u64().unwrap_or(0) + 1)
            }
            "image" => summary["images"] = Value::from(summary["images"].as_u64().unwrap_or(0) + 1),
            "attachment" => {
                summary["attachments"] =
                    Value::from(summary["attachments"].as_u64().unwrap_or(0) + 1)
            }
            "private" | "ignored" => {
                summary["omitted"] = Value::from(summary["omitted"].as_u64().unwrap_or(0) + 1)
            }
            _ => {}
        }
        summary["totalBytes"] = Value::from(
            summary["totalBytes"].as_u64().unwrap_or(0) + item["sizeBytes"].as_u64().unwrap_or(0),
        );
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

fn trim_ai_conversation_events(events: &mut Vec<Value>) {
    if events.len() <= AI_CONVERSATION_MAX_EVENTS {
        return;
    }
    let excess = events.len() - AI_CONVERSATION_MAX_EVENTS;
    events.drain(0..excess);
}

fn git_add_path(root: &Path, relative: &str) -> Result<(), String> {
    let output = run_local_git(
        local_git_command()
            .arg("-C")
            .arg(root)
            .arg("add")
            .arg("--")
            .arg(relative),
    )?;
    if output.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
    }
}

#[cfg(test)]
fn git_commit_all(root: &Path, title: &str) -> Result<(), String> {
    mixed_application_guard::ensure(root)?;
    let output = run_local_git(
        local_git_command()
            .arg("-C")
            .arg(root)
            .args([
                "-c",
                "user.name=KnowNext.ai",
                "-c",
                "user.email=knownext.local@knownext.ai",
            ])
            .args(["commit", "-m", title]),
    )?;
    if output.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let combined = [stdout.as_str(), stderr.as_str()]
            .into_iter()
            .filter(|part| !part.is_empty())
            .collect::<Vec<_>>()
            .join("\n");
        if combined.is_empty() || combined.contains("nothing to commit") {
            Ok(())
        } else {
            Err(combined)
        }
    }
}

fn git_commit_paths(root: &Path, title: &str, paths: &[&str]) -> Result<(), String> {
    mixed_application_guard::ensure(root)?;
    if paths.is_empty() {
        return Ok(());
    }
    for path in paths {
        git_add_path(root, path)?;
    }
    let mut command = local_git_command();
    command
        .arg("-C")
        .arg(root)
        .args([
            "-c",
            "user.name=KnowNext.ai",
            "-c",
            "user.email=knownext.local@knownext.ai",
        ])
        .args(["commit", "-m", title, "--"]);
    for path in paths {
        command.arg(path);
    }
    let output = run_local_git(&mut command)?;
    if output.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let combined = [stdout.as_str(), stderr.as_str()]
            .into_iter()
            .filter(|part| !part.is_empty())
            .collect::<Vec<_>>()
            .join("\n");
        if combined.is_empty() || combined.contains("nothing to commit") {
            Ok(())
        } else {
            Err(combined)
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
            let full_path = root.join(relative_path);
            if is_handwritten_note_path(&full_path) {
                std::fs::read_to_string(&full_path)
                    .ok()
                    .and_then(|content| serde_json::from_str::<Value>(&content).ok())
                    .map(|note| {
                        knownext_docs::handwritten_note_text(&note)
                            .to_ascii_lowercase()
                            .contains(needle)
                    })
                    .unwrap_or(false)
            } else {
                std::fs::read_to_string(full_path)
                    .map(|content| content.to_ascii_lowercase().contains(needle))
                    .unwrap_or(false)
            }
        };
        if node["type"].as_str() != Some("folder")
            && (needle.is_empty()
                || name.to_ascii_lowercase().contains(needle)
                || path.to_ascii_lowercase().contains(needle)
                || content_matches)
        {
            let kind = if node["type"].as_str() == Some("handwritten-note") {
                "handwritten_note"
            } else {
                "project_document"
            };
            matches.push(json!({ "documentId": node["id"], "name": name, "path": path, "kind": kind, "mimeType": node["mimeType"] }));
        }
        if let Some(children) = node["children"].as_array() {
            flatten_nodes(children, matches, root, needle);
        }
    }
}

fn count_documents(nodes: &[Value]) -> usize {
    nodes
        .iter()
        .map(|node| {
            let own = usize::from(matches!(
                node["type"].as_str(),
                Some("document") | Some("handwritten-note")
            ));
            let children = node["children"]
                .as_array()
                .map(|children| count_documents(children))
                .unwrap_or(0);
            own + children
        })
        .sum()
}

fn without_internal_source_text(source: Value) -> Value {
    ai_context_origin::public(source)
}

fn mime_for_path(path: &Path) -> String {
    match path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_ascii_lowercase()
        .as_str()
    {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        "pdf" => "application/pdf",
        "docx" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "xlsx" => "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "md" | "markdown" => "text/markdown",
        "knote" => "application/vnd.knownext.handwritten-note+json",
        _ => "application/octet-stream",
    }
    .to_string()
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
    knownext_core::http_client_builder()
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
        && auth
            .get("user")
            .and_then(|user| user.get("login"))
            .and_then(Value::as_str)
            == Some(mock_github_login().as_str())
}

fn is_github_auth_without_credentials(auth: &Value, has_github_token: bool) -> bool {
    auth.get("provider").and_then(Value::as_str) == Some("github")
        && auth
            .get("isAuthenticated")
            .and_then(Value::as_bool)
            .unwrap_or(false)
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
    value
        .chars()
        .map(|ch| if ch.is_ascii_alphanumeric() { ch } else { '_' })
        .collect()
}

fn handwritten_file_name(value: &str) -> String {
    let cleaned = value
        .trim()
        .chars()
        .map(|ch| match ch {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => '-',
            ch if ch.is_control() => '-',
            ch => ch,
        })
        .collect::<String>()
        .trim_matches('.')
        .trim()
        .to_string();
    let name = if cleaned.is_empty() {
        "nota-a-mano".to_string()
    } else {
        cleaned
    };
    if name.to_ascii_lowercase().ends_with(".knote") {
        name
    } else {
        format!("{name}.knote")
    }
}

fn default_handwritten_note(note_id: &str, title: &str) -> Value {
    let now = knownext_core::now_iso();
    json!({
        "schemaVersion": 1,
        "id": note_id,
        "title": if title.trim().is_empty() { "Nota a mano" } else { title },
        "createdAt": now,
        "updatedAt": now,
        "defaultPage": { "preset": "A4", "orientation": "portrait", "background": "blank" },
        "toolPresets": default_handwritten_tool_presets(),
        "pages": [default_handwritten_page("page-1", "blank")],
        "ocr": { "status": "not-indexed", "updatedAt": Value::Null, "textByPage": {} }
    })
}

fn default_handwritten_tool_presets() -> Value {
    json!([
        { "id": "pencil-1", "type": "pen", "label": "Boligrafo", "color": "#111827", "width": 4.0, "opacity": 1.0, "pressure": true, "pressureSensitivity": 0.55, "smoothing": 0.62 },
        { "id": "pencil-2", "type": "pencil", "label": "Lapiz", "color": "#374151", "width": 3.0, "opacity": 0.68, "pressure": true, "pressureSensitivity": 0.82, "smoothing": 0.48 },
        { "id": "pencil-3", "type": "highlighter", "label": "Subrayador", "color": "#FACC15", "width": 18.0, "opacity": 0.36, "pressure": false, "pressureSensitivity": 0.2, "smoothing": 0.42 }
    ])
}

fn default_handwritten_page(page_id: &str, background: &str) -> Value {
    json!({
        "id": page_id,
        "title": Value::Null,
        "size": { "width": 1190, "height": 1684, "unit": "px", "preset": "A4" },
        "background": { "type": background, "spacing": 32 },
        "strokes": [],
        "thumbnailHash": Value::Null,
        "updatedAt": knownext_core::now_iso()
    })
}

fn normalize_handwritten_note(mut content: Value, note_id: &str, fallback_title: &str) -> Value {
    if !content.is_object() {
        return default_handwritten_note(note_id, fallback_title);
    }
    content["schemaVersion"] = Value::from(1);
    // File location and the native command bind identity. A portable or renamed
    // note may carry its origin ID on disk; reading rebinds RAM without rewriting it.
    content["id"] = Value::from(note_id.to_string());
    if content["title"].as_str().unwrap_or("").trim().is_empty() {
        content["title"] = Value::from(if fallback_title.trim().is_empty() {
            "Nota a mano"
        } else {
            fallback_title
        });
    }
    if content["createdAt"].as_str().unwrap_or("").is_empty() {
        content["createdAt"] = Value::from(knownext_core::now_iso());
    }
    if content["updatedAt"].as_str().unwrap_or("").is_empty() {
        content["updatedAt"] = Value::from(knownext_core::now_iso());
    }
    if !content["defaultPage"].is_object() {
        content["defaultPage"] =
            json!({ "preset": "A4", "orientation": "portrait", "background": "blank" });
    }
    if !content["toolPresets"].is_array()
        || content["toolPresets"]
            .as_array()
            .map(Vec::is_empty)
            .unwrap_or(true)
    {
        content["toolPresets"] = default_handwritten_tool_presets();
    }
    if !content["pages"].is_array()
        || content["pages"]
            .as_array()
            .map(Vec::is_empty)
            .unwrap_or(true)
    {
        content["pages"] = json!([default_handwritten_page(
            "page-1",
            content["defaultPage"]["background"]
                .as_str()
                .unwrap_or("blank")
        )]);
    }
    if let Some(pages) = content["pages"].as_array_mut() {
        for (index, page) in pages.iter_mut().enumerate() {
            if !page.is_object() {
                *page = default_handwritten_page(&format!("page-{}", index + 1), "blank");
            }
            if page["id"].as_str().unwrap_or("").is_empty() {
                page["id"] = Value::from(format!("page-{}", index + 1));
            }
            if !page["size"].is_object() {
                page["size"] =
                    json!({ "width": 1190, "height": 1684, "unit": "px", "preset": "A4" });
            }
            if !page["background"].is_object() {
                page["background"] = json!({ "type": "blank", "spacing": 32 });
            }
            if !page["strokes"].is_array() {
                page["strokes"] = Value::Array(vec![]);
            }
            normalize_handwritten_stroke_textures(&mut page["strokes"]);
            if page["updatedAt"].as_str().unwrap_or("").is_empty() {
                page["updatedAt"] = Value::from(knownext_core::now_iso());
            }
        }
    }
    if !content["ocr"].is_object() {
        content["ocr"] =
            json!({ "status": "not-indexed", "updatedAt": Value::Null, "textByPage": {} });
    }
    if !content["ocr"]["textByPage"].is_object() {
        content["ocr"]["textByPage"] = json!({});
    }
    content
}

fn normalize_handwritten_stroke_textures(strokes: &mut Value) {
    let Some(strokes) = strokes.as_array_mut() else {
        return;
    };
    for stroke in strokes {
        if stroke["tool"].as_str() != Some("pencil") {
            continue;
        }
        if stroke["textureSeed"]
            .as_str()
            .unwrap_or("")
            .trim()
            .is_empty()
        {
            stroke["textureSeed"] = Value::from(handwritten_texture_seed(stroke));
        }
        stroke["textureVersion"] = Value::from(1);
    }
}

fn handwritten_texture_seed(stroke: &Value) -> String {
    let first_point = stroke["points"]
        .as_array()
        .and_then(|points| points.first())
        .and_then(Value::as_array)
        .map(|point| {
            format!(
                "{:.2},{:.2}",
                point.first().and_then(Value::as_f64).unwrap_or(0.0),
                point.get(1).and_then(Value::as_f64).unwrap_or(0.0)
            )
        })
        .unwrap_or_else(|| "empty".to_string());
    format!(
        "{}:{}:{}:{:.2}:{}",
        stroke["id"].as_str().unwrap_or("stroke"),
        stroke["path"].as_str().unwrap_or(""),
        stroke["color"].as_str().unwrap_or("#374151"),
        stroke["width"].as_f64().unwrap_or(2.4),
        first_point
    )
}

fn handwritten_content_hash(content: &Value) -> String {
    let bytes = serde_json::to_vec(content).unwrap_or_default();
    sha256_hex(&bytes)
}

fn with_extension(file_name: &str, extension: &str) -> String {
    let stem = file_name
        .rsplit_once('.')
        .map(|(stem, _)| stem)
        .unwrap_or(file_name);
    format!("{stem}.{extension}")
}

fn markdown_alt_escape(value: &str) -> String {
    let mut escaped = String::new();
    for character in value.chars() {
        if matches!(character, '\r' | '\n') { escaped.push(' '); }
        else { if character.is_ascii_punctuation() { escaped.push('\\'); } escaped.push(character); }
    }
    escaped
}

fn markdown_image_destination_escape(value: &str) -> String {
    let mut escaped = String::new();
    for character in value.chars() {
        match character {
            ' ' => escaped.push_str("%20"), '\r' => escaped.push_str("%0D"), '\n' => escaped.push_str("%0A"),
            '\\' | '(' | ')' | '<' | '>' | '&' => { escaped.push('\\'); escaped.push(character); },
            _ => escaped.push(character),
        }
    }
    escaped
}

fn research_title_for_request(topic: &str) -> String {
    format!("Investigación - {topic}")
}

fn research_objective_for_request(topic: &str) -> String {
    format!("Investigar de forma contrastada {topic}, separando hallazgos verificados, incertidumbres y recomendaciones.")
}

fn research_secondary_objectives_for_request(topic: &str) -> Vec<Value> {
    vec![
        format!("Delimitar el alcance real, contexto y criterios de análisis de {topic}."),
        "Contrastar información con fuentes web independientes y detectar contradicciones relevantes.".to_string(),
        "Convertir la evidencia en conclusiones útiles, limitaciones explícitas y recomendaciones accionables.".to_string(),
    ]
    .into_iter()
    .map(Value::from)
    .collect()
}

fn research_aspects_for_request(topic: &str) -> Vec<Value> {
    vec![
        format!("Alcance, contexto, términos clave y criterios de decisión sobre {topic}."),
        "Fuentes fiables, recientes e independientes que aportan evidencia verificable."
            .to_string(),
        "Datos, comparativas o argumentos que sostienen los hallazgos principales.".to_string(),
        "Contradicciones, lagunas, sesgos y puntos que deben quedar como no concluyentes."
            .to_string(),
        "Implicaciones prácticas, recomendaciones y límites del informe final.".to_string(),
    ]
    .into_iter()
    .map(Value::from)
    .collect()
}

fn research_recommended_style_for_request(_topic: &str, report_length: &str) -> &'static str {
    match report_length {
        "brief" => "Informe ejecutivo conciso, orientado a decisión.",
        "wide" => "Informe amplio, analítico y verificable, con estructura clara y anexos si aportan valor.",
        "exhaustive" => "Informe exhaustivo, trazable y detallado, con análisis de contradicciones, anexos y recomendaciones.",
        _ => "Informe profesional verificable, con síntesis, evidencias, limitaciones y recomendaciones.",
    }
}

fn research_report_length_label(report_length: &str) -> &'static str {
    match report_length {
        "brief" => "breve",
        "wide" => "amplia",
        "exhaustive" => "exhaustiva",
        _ => "estándar",
    }
}

fn normalize_research_report_length(value: &str) -> &'static str {
    match value {
        "brief" => "brief",
        "wide" => "wide",
        "exhaustive" => "exhaustive",
        _ => "standard",
    }
}

fn research_proposed_candidate_source_limit(topic: &str, prompt: &str, body: &Value) -> u64 {
    let words = prompt
        .split_whitespace()
        .chain(topic.split_whitespace())
        .count();
    let context_count = body
        .get("contextSources")
        .and_then(Value::as_array)
        .map(Vec::len)
        .unwrap_or(0)
        + body
            .get("attachments")
            .and_then(Value::as_array)
            .map(Vec::len)
            .unwrap_or(0);
    let has_active_context = body
        .get("activeMarkdown")
        .and_then(Value::as_str)
        .map(|value| !value.trim().is_empty())
        .unwrap_or(false)
        || body
            .get("documentId")
            .and_then(Value::as_str)
            .map(|value| !value.trim().is_empty())
            .unwrap_or(false);
    let complexity = words + context_count * 12 + usize::from(has_active_context) * 8;
    match complexity {
        0..=18 => 50,
        19..=55 => 200,
        _ => 500,
    }
}

fn research_proposed_report_length(
    topic: &str,
    prompt: &str,
    candidate_source_limit: u64,
) -> &'static str {
    let words = prompt
        .split_whitespace()
        .chain(topic.split_whitespace())
        .count();
    match (candidate_source_limit, words) {
        (0..=10, _) => "brief",
        (11..=50, 0..=20) => "brief",
        (11..=50, _) => "standard",
        (51..=200, 0..=35) => "standard",
        (51..=200, _) => "wide",
        (_, 0..=55) => "wide",
        _ => "exhaustive",
    }
}

fn legacy_research_visual_enabled(agentic: &Value, field: &str, fallback: bool) -> bool {
    agentic["researchPresets"]
        .as_object()
        .map(|presets| {
            presets
                .values()
                .any(|preset| preset[field].as_bool().unwrap_or(false))
        })
        .unwrap_or(fallback)
}

fn research_objective_coverage() -> Value {
    json!([
        { "objectiveIndex": 0, "aspectIndexes": [0, 1] },
        { "objectiveIndex": 1, "aspectIndexes": [1, 2, 3] },
        { "objectiveIndex": 2, "aspectIndexes": [3, 4] }
    ])
}

fn research_auxiliary_skill_ids(diagrams_enabled: bool, images_enabled: bool) -> Vec<Value> {
    let mut skills = vec![Value::from("knownext.markdown")];
    if diagrams_enabled {
        skills.push(Value::from("knownext.mermaid"));
    }
    if images_enabled {
        skills.push(Value::from("knownext.image_generation"));
    }
    skills
}

fn research_visual_plan(diagrams_enabled: bool, images_enabled: bool) -> String {
    let mut parts = Vec::new();
    if diagrams_enabled {
        parts.push(
            "Diagramas permitidos si aclaran relaciones, procesos o arquitectura".to_string(),
        );
    }
    if images_enabled {
        parts.push("Imágenes permitidas si aportan claridad real al informe".to_string());
    }
    if parts.is_empty() {
        "Sin diagramas ni imágenes habilitadas para este tipo de investigación.".to_string()
    } else {
        parts.join(". ")
    }
}

fn append_research_activity(job: &mut Value, phase: &str, level: &str, message: &str) {
    let event = knownext_research::activity_event(phase, level, message);
    let now = event["createdAt"].as_str().unwrap_or("").to_string();
    if let Some(activity) = job["activity"].as_array_mut() {
        activity.push(event);
        if activity.len() > 200 {
            let overflow = activity.len().saturating_sub(200);
            activity.drain(0..overflow);
        }
    } else {
        job["activity"] = Value::Array(vec![event]);
    }
    if !now.is_empty() {
        job["heartbeatAt"] = Value::from(now.clone());
        job["lastActivityAt"] = Value::from(now);
    }
}

fn refresh_research_runtime_fields(job: &mut Value) {
    job["artifactCounts"] = research_artifact_counts(job);
}

fn research_artifact_counts(job: &Value) -> Value {
    let source_candidates = job["sourceCandidates"]
        .as_array()
        .map(Vec::len)
        .unwrap_or(0);
    let ranked_sources = job["rankedSources"].as_array().map(Vec::len).unwrap_or(0);
    let selected_sources = job["sources"].as_array().map(Vec::len).unwrap_or(0);
    let read_sources = job["sourceReads"]
        .as_array()
        .map(|items| {
            items
                .iter()
                .filter(|item| item["status"].as_str() == Some("read"))
                .count()
        })
        .unwrap_or(0);
    let evidence = job["evidence"].as_array().map(Vec::len).unwrap_or(0);
    let findings = job["findings"].as_array().map(Vec::len).unwrap_or(0);
    let cited_sources = job["qualityReport"]["citedSourceCount"]
        .as_u64()
        .and_then(|value| usize::try_from(value).ok())
        .unwrap_or_else(|| {
            job["evidence"]
                .as_array()
                .map(|items| {
                    items
                        .iter()
                        .filter_map(|item| item["sourceId"].as_str())
                        .collect::<BTreeSet<_>>()
                        .len()
                })
                .unwrap_or(0)
        });
    let markdown = job["markdown"]
        .as_str()
        .or_else(|| job["draftMarkdown"].as_str())
        .unwrap_or("");
    let images = job["generatedImages"]
        .as_array()
        .map(|items| {
            items
                .iter()
                .filter(|item| item["status"].as_str() == Some("completed"))
                .count()
        })
        .unwrap_or(0);
    json!({
        "candidateSources": source_candidates,
        "rankedSources": ranked_sources,
        "selectedSources": selected_sources,
        "readSources": read_sources,
        "evidence": evidence,
        "findings": findings,
        "citedSources": cited_sources,
        "tables": count_markdown_tables(markdown),
        "diagrams": count_mermaid_blocks(markdown),
        "images": images
    })
}

fn count_mermaid_blocks(markdown: &str) -> usize {
    markdown
        .lines()
        .filter(|line| line.trim().eq_ignore_ascii_case("```mermaid"))
        .count()
}

fn count_markdown_tables(markdown: &str) -> usize {
    let lines = markdown.lines().collect::<Vec<_>>();
    lines
        .windows(2)
        .filter(|pair| is_markdown_table_row(pair[0]) && is_markdown_table_separator(pair[1]))
        .count()
}

fn is_markdown_table_row(line: &str) -> bool {
    let trimmed = line.trim();
    trimmed.contains('|') && trimmed.matches('|').count() >= 2
}

fn is_markdown_table_separator(line: &str) -> bool {
    let trimmed = line.trim().trim_matches('|').trim();
    !trimmed.is_empty()
        && trimmed
            .split('|')
            .all(|cell| cell.trim().chars().all(|ch| matches!(ch, '-' | ':' | ' ')))
}

fn clean_web_text(value: &str) -> String {
    let mut text = String::with_capacity(value.len().min(20_000));
    let mut in_tag = false;
    for ch in value.chars() {
        match ch {
            '<' => {
                in_tag = true;
                text.push(' ');
            }
            '>' => in_tag = false,
            _ if !in_tag => text.push(ch),
            _ => {}
        }
    }
    text.split_whitespace()
        .take(4_000)
        .collect::<Vec<_>>()
        .join(" ")
}

fn project_context_source_reads(context_sources: &Value) -> Vec<Value> {
    context_sources
        .as_array()
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .enumerate()
        .map(|(index, source)| {
            let content = source
                .get("markdown")
                .and_then(Value::as_str)
                .or_else(|| source.get("content").and_then(Value::as_str))
                .or_else(|| source.get("text").and_then(Value::as_str))
                .unwrap_or("")
                .chars()
                .take(8_000)
                .collect::<String>();
            let id = source
                .get("id")
                .and_then(Value::as_str)
                .map(ToOwned::to_owned)
                .unwrap_or_else(|| knownext_core::compact_id("project-source"));
            json!({
                "sourceId": id,
                "title": source.get("title").or_else(|| source.get("name")).cloned().unwrap_or_else(|| Value::from("Documento del proyecto")),
                "url": Value::Null,
                "path": source.get("path").cloned().unwrap_or(Value::Null),
                "kind": "project_document",
                "status": if content.trim().is_empty() { "unavailable" } else { "read" },
                "readAt": knownext_core::now_iso(),
                "content": content,
                "excerpt": source.get("excerpt").and_then(Value::as_str).unwrap_or("").chars().take(1_200).collect::<String>(),
                "objectiveIndex": index % 3,
                "aspectIndex": index % 5
            })
        })
        .collect()
}

fn research_brief_for_worker(brief: &Value) -> Value {
    json!({
        "id": brief["id"].clone(),
        "topic": brief["topic"].clone(),
        "objective": brief["objective"].clone(),
        "questions": brief["questions"].clone(),
        "candidateSourceLimit": brief["candidateSourceLimit"].clone(),
        "reportLength": brief["reportLength"].clone(),
        "language": brief["language"].clone(),
        "tone": brief["tone"].clone(),
        "reportProfile": brief["reportProfile"].clone()
    })
}

fn research_plan_for_worker(plan: &Value) -> Value {
    json!({
        "title": plan["title"].clone(),
        "primaryObjective": plan["primaryObjective"].clone(),
        "secondaryObjectives": plan["secondaryObjectives"].clone(),
        "researchAspects": plan["researchAspects"].clone(),
        "objectiveCoverage": plan["objectiveCoverage"].clone(),
        "recommendedReportStyle": plan["recommendedReportStyle"].clone(),
        "candidateSourceLimit": plan["candidateSourceLimit"].clone(),
        "reportLength": plan["reportLength"].clone(),
        "constraints": plan["constraints"].clone()
    })
}

fn compact_research_context_sources(context_sources: &Value) -> Value {
    let items = context_sources
        .as_array()
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .take(12)
        .map(|source| {
            let text = source
                .get("markdown")
                .and_then(Value::as_str)
                .or_else(|| source.get("content").and_then(Value::as_str))
                .or_else(|| source.get("text").and_then(Value::as_str))
                .or_else(|| source.get("excerpt").and_then(Value::as_str))
                .unwrap_or("");
            json!({
                "id": source["id"].clone(),
                "title": source.get("title").or_else(|| source.get("name")).cloned().unwrap_or(Value::Null),
                "path": source["path"].clone(),
                "excerpt": text.chars().take(1_500).collect::<String>()
            })
        })
        .collect::<Vec<_>>();
    Value::Array(items)
}

fn research_source_read_batches(source_reads: &[Value]) -> Vec<Vec<Value>> {
    let compact = source_reads
        .iter()
        .filter(|source| source["status"].as_str() == Some("read"))
        .map(|source| compact_research_source_read(source, 2_400))
        .collect::<Vec<_>>();
    let mut batches = Vec::new();
    let mut current = Vec::new();
    let mut current_chars = 0usize;
    for source in compact {
        let source_chars = source.to_string().chars().count();
        if !current.is_empty() && (current.len() >= 6 || current_chars + source_chars > 18_000) {
            batches.push(current);
            current = Vec::new();
            current_chars = 0;
        }
        current_chars += source_chars;
        current.push(source);
    }
    if !current.is_empty() {
        batches.push(current);
    }
    batches
}

fn compact_research_source_read(source: &Value, max_content_chars: usize) -> Value {
    let content = source
        .get("content")
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .or_else(|| source.get("excerpt").and_then(Value::as_str))
        .unwrap_or("");
    json!({
        "sourceId": source["sourceId"].clone(),
        "title": source["title"].clone(),
        "url": source["url"].clone(),
        "path": source["path"].clone(),
        "kind": source["kind"].clone(),
        "status": source["status"].clone(),
        "readAt": source["readAt"].clone(),
        "content": content.chars().take(max_content_chars).collect::<String>(),
        "excerpt": source.get("excerpt").and_then(Value::as_str).unwrap_or("").chars().take(600).collect::<String>(),
        "objectiveIndex": source["objectiveIndex"].clone(),
        "aspectIndex": source["aspectIndex"].clone()
    })
}

fn compact_research_evidence(
    evidence: &[Value],
    max_items: usize,
    max_excerpt_chars: usize,
) -> Vec<Value> {
    evidence
        .iter()
        .take(max_items)
        .map(|item| {
            let excerpt = item
                .get("excerpt")
                .and_then(Value::as_str)
                .unwrap_or("")
                .chars()
                .take(max_excerpt_chars)
                .collect::<String>();
            json!({
                "id": item["id"].clone(),
                "sourceId": item["sourceId"].clone(),
                "claim": item["claim"].clone(),
                "excerpt": excerpt,
                "confidence": item["confidence"].clone(),
                "objectiveIndex": item["objectiveIndex"].clone(),
                "aspectIndex": item["aspectIndex"].clone(),
                "consultedAt": item["consultedAt"].clone(),
                "sourceKind": item["sourceKind"].clone()
            })
        })
        .collect()
}

fn compact_research_findings(
    findings: &[Value],
    max_items: usize,
    max_summary_chars: usize,
) -> Vec<Value> {
    findings
        .iter()
        .take(max_items)
        .map(|item| {
            let summary = item
                .get("summary")
                .and_then(Value::as_str)
                .unwrap_or("")
                .chars()
                .take(max_summary_chars)
                .collect::<String>();
            json!({
                "id": item["id"].clone(),
                "title": item["title"].clone(),
                "summary": summary,
                "evidenceIds": item["evidenceIds"].clone(),
                "objectiveIndex": item["objectiveIndex"].clone(),
                "aspectIndex": item["aspectIndex"].clone(),
                "confidence": item["confidence"].clone()
            })
        })
        .collect()
}

fn compact_research_evidence_for_findings(
    evidence: &[Value],
    findings: &[Value],
    max_items: usize,
    max_excerpt_chars: usize,
) -> Vec<Value> {
    let mut used_ids = BTreeSet::new();
    for finding in findings {
        if let Some(ids) = finding["evidenceIds"].as_array() {
            for id in ids.iter().filter_map(Value::as_str) {
                used_ids.insert(id.to_string());
            }
        }
    }
    let selected = evidence
        .iter()
        .filter(|item| {
            item["id"]
                .as_str()
                .map(|id| used_ids.contains(id))
                .unwrap_or(false)
        })
        .cloned()
        .collect::<Vec<_>>();
    let selected = if selected.is_empty() {
        evidence.to_vec()
    } else {
        selected
    };
    compact_research_evidence(&selected, max_items, max_excerpt_chars)
}

fn validate_research_draft(markdown: &str, brief: &Value, source_reads: &Value) -> Vec<Value> {
    let mut diagnostics = Vec::new();
    if markdown.trim().is_empty() {
        diagnostics.push(json!({ "level": "error", "message": "El informe está vacío." }));
    }
    for required in ["Fuentes consultadas", "Limitaciones"] {
        if !markdown.contains(required) {
            diagnostics.push(json!({
                "level": "error",
                "message": format!("El informe debe incluir la sección {required}.")
            }));
        }
    }
    if source_reads
        .as_array()
        .map(|items| {
            items
                .iter()
                .all(|item| item["status"].as_str() == Some("unavailable"))
        })
        .unwrap_or(true)
    {
        diagnostics.push(json!({
            "level": "error",
            "message": "No hay fuentes leídas o extractos suficientes para verificar el informe."
        }));
    }
    if brief["reportProfile"]["diagramsEnabled"]
        .as_bool()
        .unwrap_or(false)
    {
        for code in extract_mermaid_code_blocks(markdown) {
            if !mermaid_looks_valid(&code) {
                diagnostics.push(json!({
                    "level": "error",
                    "message": "Hay un bloque Mermaid que no parece válido."
                }));
            }
        }
    }
    diagnostics
}

fn extract_mermaid_code_blocks(markdown: &str) -> Vec<String> {
    let mut blocks = Vec::new();
    let mut current = Vec::new();
    let mut in_mermaid = false;
    for line in markdown.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("```mermaid") {
            in_mermaid = true;
            current.clear();
            continue;
        }
        if in_mermaid && trimmed.starts_with("```") {
            in_mermaid = false;
            blocks.push(current.join("\n"));
            current.clear();
            continue;
        }
        if in_mermaid {
            current.push(line.to_string());
        }
    }
    blocks
}

fn mermaid_looks_valid(code: &str) -> bool {
    let first = code
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .unwrap_or("");
    matches!(
        first,
        "flowchart TD"
            | "flowchart LR"
            | "graph TD"
            | "graph LR"
            | "sequenceDiagram"
            | "classDiagram"
            | "stateDiagram-v2"
            | "erDiagram"
            | "journey"
            | "gantt"
            | "pie"
    )
}

fn supported_claim_ratio(evidence: &Value) -> Value {
    let Some(items) = evidence.as_array() else {
        return Value::Null;
    };
    if items.is_empty() {
        return Value::Null;
    }
    let supported = items
        .iter()
        .filter(|item| {
            matches!(item["confidence"].as_str(), Some("high" | "medium"))
                || item["confidence"]
                    .as_f64()
                    .map(|value| value >= 0.55)
                    .unwrap_or(false)
        })
        .count();
    Value::from((supported as f64) / (items.len() as f64))
}

fn iso_duration_ms(started_at: &str, finished_at: &str) -> Value {
    let started = OffsetDateTime::parse(started_at, &Rfc3339);
    let finished = OffsetDateTime::parse(finished_at, &Rfc3339);
    match (started, finished) {
        (Ok(started), Ok(finished)) => {
            Value::from((finished - started).whole_milliseconds().max(0) as i64)
        }
        _ => Value::Null,
    }
}

fn research_export_file_name(topic: &str, extension: &str) -> String {
    let cleaned = markdown_file_name(&format!("Investigación - {topic}.md"));
    let stem = cleaned.strip_suffix(".md").unwrap_or(cleaned.as_str());
    format!("{stem}.{extension}")
}

fn safe_research_markdown_file_name(topic: &str, job_id: &str) -> String {
    let suffix = job_id
        .chars()
        .rev()
        .take(8)
        .collect::<String>()
        .chars()
        .rev()
        .collect::<String>();
    let base = topic
        .trim()
        .chars()
        .map(|ch| match ch {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => '-',
            ch if ch.is_control() => '-',
            ch => ch,
        })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .trim_matches([' ', '.', '-'])
        .chars()
        .take(30)
        .collect::<String>()
        .trim_matches([' ', '.', '-'])
        .to_string();
    let stem = if base.is_empty() {
        "Investigación".to_string()
    } else {
        format!("Investigación - {base}")
    };
    markdown_file_name(&format!("{stem} {suffix}.md"))
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
    let name = if cleaned.is_empty() {
        "contexto-ia".to_string()
    } else {
        cleaned
    };
    if name.to_ascii_lowercase().ends_with(".md") {
        name
    } else {
        format!("{name}.md")
    }
}

fn write_string_atomic(path: &Path, content: &str) -> Result<(), String> {
    atomic_io::write(path, content.as_bytes()).map_err(|error| error.to_string())
}

fn image_file_name(value: &str, default_format: &str) -> String {
    let format = match default_format {
        "webp" => "webp",
        "jpeg" | "jpg" => "jpeg",
        _ => "png",
    };
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
    let mut name = if cleaned.is_empty() {
        "imagen-ia".to_string()
    } else {
        cleaned
    };
    let lower = name.to_ascii_lowercase();
    if !matches!(
        lower.rsplit('.').next(),
        Some("png" | "webp" | "jpg" | "jpeg")
    ) {
        name.push('.');
        name.push_str(format);
    }
    name
}

fn append_markdown_reference(markdown: &str, reference: &str) -> String {
    let mut next = markdown.trim_end().to_string();
    if !next.is_empty() {
        next.push_str("\n\n");
    }
    next.push_str(reference);
    next.push('\n');
    next
}

fn insert_markdown_reference_near_focus(
    markdown: &str,
    reference: &str,
    placement: Option<&Value>,
    selection_focus: Option<&Value>,
) -> String {
    let placement_type = placement
        .and_then(|value| value.get("type"))
        .and_then(Value::as_str)
        .unwrap_or("document_end");
    let anchor_excerpt = placement
        .and_then(|value| value.get("anchorExcerpt"))
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty());
    let selection_text = selection_focus
        .and_then(|value| value.get("text"))
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty());

    match placement_type {
        "before_selection" => selection_text
            .and_then(|excerpt| insert_before_unique_excerpt(markdown, excerpt, reference))
            .unwrap_or_else(|| append_markdown_reference(markdown, reference)),
        "after_selection" => selection_text
            .and_then(|excerpt| insert_after_unique_excerpt(markdown, excerpt, reference))
            .unwrap_or_else(|| append_markdown_reference(markdown, reference)),
        "after_paragraph" => anchor_excerpt
            .and_then(|excerpt| insert_after_unique_excerpt(markdown, excerpt, reference))
            .unwrap_or_else(|| append_markdown_reference(markdown, reference)),
        "after_heading" => placement
            .and_then(|value| value.get("headingPath"))
            .and_then(Value::as_array)
            .and_then(|parts| {
                parts
                    .iter()
                    .filter_map(Value::as_str)
                    .map(str::trim)
                    .filter(|value| !value.is_empty())
                    .last()
                    .map(str::to_string)
            })
            .and_then(|heading| insert_after_heading(markdown, &heading, reference))
            .or_else(|| {
                anchor_excerpt
                    .and_then(|excerpt| insert_after_unique_excerpt(markdown, excerpt, reference))
            })
            .unwrap_or_else(|| append_markdown_reference(markdown, reference)),
        "at_cursor" => selection_focus
            .and_then(|value| value.get("nearTextBefore"))
            .and_then(Value::as_str)
            .filter(|value| !value.trim().is_empty())
            .and_then(|excerpt| insert_after_unique_excerpt(markdown, excerpt, reference))
            .unwrap_or_else(|| append_markdown_reference(markdown, reference)),
        _ => append_markdown_reference(markdown, reference),
    }
}

fn insert_before_unique_excerpt(markdown: &str, excerpt: &str, reference: &str) -> Option<String> {
    let normalized_markdown = normalize_line_endings(markdown);
    let (index, _) = unique_excerpt_match(&normalized_markdown, excerpt)?;
    Some(join_markdown_blocks(
        &normalized_markdown[..index],
        reference,
        &normalized_markdown[index..],
    ))
}

fn insert_after_unique_excerpt(markdown: &str, excerpt: &str, reference: &str) -> Option<String> {
    let normalized_markdown = normalize_line_endings(markdown);
    let (index, matched) = unique_excerpt_match(&normalized_markdown, excerpt)?;
    let insert_at = index + matched.len();
    Some(join_markdown_blocks(
        &normalized_markdown[..insert_at],
        reference,
        &normalized_markdown[insert_at..],
    ))
}

fn insert_after_heading(markdown: &str, heading: &str, reference: &str) -> Option<String> {
    let normalized = normalize_line_endings(markdown);
    let mut offset = 0;
    let mut match_range: Option<(usize, usize)> = None;
    for line in normalized.split('\n') {
        let line_len = line.len();
        if read_atx_heading_text(line).as_deref() == Some(heading) {
            if match_range.is_some() {
                return None;
            }
            match_range = Some((offset, line_len));
        }
        offset += line_len + 1;
    }
    let (index, len) = match_range?;
    let insert_at = index + len;
    Some(join_markdown_blocks(
        &normalized[..insert_at],
        reference,
        &normalized[insert_at..],
    ))
}

fn unique_excerpt_match(markdown: &str, excerpt: &str) -> Option<(usize, String)> {
    let normalized_excerpt = normalize_line_endings(excerpt).trim().to_string();
    if normalized_excerpt.is_empty() {
        return None;
    }
    let normalized_markdown = normalize_line_endings(markdown);
    let first = normalized_markdown.find(&normalized_excerpt)?;
    if normalized_markdown[first + normalized_excerpt.len()..].contains(&normalized_excerpt) {
        return None;
    }
    Some((first, normalized_excerpt))
}

fn normalize_line_endings(value: &str) -> String {
    value.replace("\r\n", "\n").replace('\r', "\n")
}

fn join_markdown_blocks(before: &str, insertion: &str, after: &str) -> String {
    let before = before.trim_end();
    let insertion = insertion.trim();
    let after = after.trim_start();
    match (before.is_empty(), after.is_empty()) {
        (true, true) => format!("{insertion}\n"),
        (true, false) => format!("{insertion}\n\n{after}"),
        (false, true) => format!("{before}\n\n{insertion}\n"),
        (false, false) => format!("{before}\n\n{insertion}\n\n{after}"),
    }
}

fn read_atx_heading_text(line: &str) -> Option<String> {
    let trimmed = line.trim();
    let level = trimmed.chars().take_while(|ch| *ch == '#').count();
    if !(1..=6).contains(&level) || !trimmed.chars().nth(level).is_some_and(char::is_whitespace) {
        return None;
    }
    Some(
        trimmed[level..]
            .trim()
            .trim_end_matches('#')
            .trim()
            .to_string(),
    )
}

fn chunk_text(text: &str, max_chars: usize, overlap_chars: usize) -> Vec<String> {
    let normalized = text.replace("\r\n", "\n").replace('\r', "\n");
    let chars = normalized.chars().collect::<Vec<_>>();
    if chars.is_empty() {
        return Vec::new();
    }
    let mut chunks = Vec::new();
    let mut start = 0;
    while start < chars.len() {
        let mut end = (start + max_chars).min(chars.len());
        if end < chars.len() {
            if let Some(relative_break) = chars[start..end]
                .iter()
                .rposition(|ch| *ch == '\n' || *ch == '.' || *ch == ';')
            {
                let candidate = start + relative_break + 1;
                if candidate > start + max_chars / 2 {
                    end = candidate;
                }
            }
        }
        let chunk = chars[start..end]
            .iter()
            .collect::<String>()
            .trim()
            .to_string();
        if !chunk.is_empty() {
            chunks.push(chunk);
        }
        if end == chars.len() {
            break;
        }
        start = end.saturating_sub(overlap_chars);
        if start >= end {
            start = end;
        }
    }
    chunks
}

fn ai_index_query_text(body: &Value) -> String {
    let mut parts = Vec::new();
    if let Some(prompt) = body.get("prompt").and_then(Value::as_str) {
        parts.push(prompt.to_string());
    }
    if let Some(selection) = body.pointer("/selectionFocus/text").and_then(Value::as_str) {
        parts.push(selection.to_string());
    }
    if let Some(markdown) = body.get("activeMarkdown").and_then(Value::as_str) {
        parts.push(markdown.chars().take(3000).collect());
    }
    parts.join("\n")
}

fn tokenize_for_rag(text: &str) -> BTreeSet<String> {
    let mut tokens = BTreeSet::new();
    let mut current = String::new();
    for ch in text.chars().flat_map(char::to_lowercase) {
        if ch.is_alphanumeric() {
            current.push(ch);
        } else if current.len() >= 3 {
            tokens.insert(current.clone());
            current.clear();
        } else {
            current.clear();
        }
    }
    if current.len() >= 3 {
        tokens.insert(current);
    }
    tokens
}

fn rag_score(text: &str, query_tokens: &BTreeSet<String>) -> usize {
    let text_tokens = tokenize_for_rag(text);
    let mut score = 0;
    for token in query_tokens {
        if text_tokens.contains(token) {
            score += token.len().min(12);
        }
    }
    score
}

fn normalize_markdown(markdown: &str) -> String {
    markdown
        .replace("\r\n", "\n")
        .replace('\r', "\n")
        .trim_end_matches('\n')
        .to_string()
}

fn markdown_content_hash(markdown: &str) -> String {
    sha256_hex(normalize_markdown(markdown).as_bytes())
}

fn sha256_hex(bytes: &[u8]) -> String {
    let digest = Sha256::digest(bytes);
    digest.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn draft_base_is_verified(draft: &Value) -> bool {
    let base = &draft["baseFingerprint"];
    base["size"].as_u64().is_some() && base["sha256"].as_str().is_some_and(|hash|hash.len()==64 && hash.bytes().all(|byte|byte.is_ascii_hexdigit()))
}

fn fingerprint_bytes(bytes: &[u8]) -> Value {
    json!({"mtimeNs":null,"size":bytes.len(),"sha256":sha256_hex(bytes)})
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
    // Explicit null means the document workspace is active. The default already
    // supplies Notes for legacy configurations where the property is absent.
    normalize_handwritten_config(&mut config["handwritten"]);
    normalize_ai_config(&mut config["ai"]);
}

fn normalize_handwritten_config(handwritten: &mut Value) {
    if !handwritten.is_object() {
        *handwritten = default_handwritten_config();
    } else {
        let mut merged = default_handwritten_config();
        merge(&mut merged, handwritten);
        *handwritten = merged;
    }

    let mut normalized_presets = Vec::new();
    let eraser_width = handwritten["eraser"]["width"]
        .as_f64()
        .unwrap_or(24.0)
        .clamp(6.0, 72.0)
        .round();
    let eraser_mode = match handwritten["eraser"]["mode"].as_str().unwrap_or("stroke") {
        "partial" => "partial",
        _ => "stroke",
    };
    handwritten["eraser"] = json!({ "width": eraser_width, "mode": eraser_mode });

    if let Some(presets) = handwritten["toolPresets"].as_array() {
        for preset in presets {
            if normalized_presets.len() >= 7 {
                break;
            }
            let tool_type = preset["type"]
                .as_str()
                .or_else(|| preset["id"].as_str())
                .filter(|value| {
                    matches!(
                        *value,
                        "pen" | "fountain" | "pencil" | "marker" | "highlighter"
                    )
                });
            let Some(tool_type) = tool_type else {
                continue;
            };
            let fallback = default_pencil_preset_for_type(tool_type);
            let id = preset["id"]
                .as_str()
                .filter(|value| !value.trim().is_empty())
                .unwrap_or(fallback["id"].as_str().unwrap_or("pencil-1"));
            let label = preset["label"]
                .as_str()
                .filter(|value| !value.trim().is_empty())
                .unwrap_or(fallback["label"].as_str().unwrap_or("Boligrafo"));
            let color = preset["color"]
                .as_str()
                .filter(|value| is_hex_color(value))
                .unwrap_or(fallback["color"].as_str().unwrap_or("#111827"));
            let width = preset["width"]
                .as_f64()
                .unwrap_or_else(|| fallback["width"].as_f64().unwrap_or(4.0))
                .clamp(1.0, 38.0);
            let opacity = preset["opacity"]
                .as_f64()
                .unwrap_or_else(|| fallback["opacity"].as_f64().unwrap_or(1.0))
                .clamp(0.1, 1.0);
            let smoothing = preset["smoothing"]
                .as_f64()
                .unwrap_or_else(|| fallback["smoothing"].as_f64().unwrap_or(0.62))
                .clamp(0.0, 1.0);
            let pressure_sensitivity = preset["pressureSensitivity"]
                .as_f64()
                .unwrap_or_else(|| fallback["pressureSensitivity"].as_f64().unwrap_or(0.55))
                .clamp(0.0, 1.0);
            normalized_presets.push(json!({
                "id": id,
                "type": tool_type,
                "label": label,
                "color": color,
                "width": width,
                "opacity": opacity,
                "pressure": preset["pressure"].as_bool().unwrap_or_else(|| fallback["pressure"].as_bool().unwrap_or(true)),
                "pressureSensitivity": pressure_sensitivity,
                "smoothing": smoothing
            }));
        }
    }

    let defaults = default_handwritten_tool_presets();
    if let Some(default_presets) = defaults.as_array() {
        for preset in default_presets {
            if normalized_presets.len() >= 3 {
                break;
            }
            normalized_presets.push(preset.clone());
        }
    }
    handwritten["toolPresets"] = Value::Array(normalized_presets);
}

fn normalize_ai_config(ai: &mut Value) {
    let original_agentic = ai.get("agentic").cloned().unwrap_or(Value::Null);
    if !ai.is_object() {
        *ai = default_ai_config();
    } else {
        let mut merged = default_ai_config();
        merge(&mut merged, ai);
        *ai = merged;
    }
    ai["provider"] = Value::from("openai");
    normalize_ai_permissions(&mut ai["permissions"]);
    normalize_ai_image_generation_config(&mut ai["imageGeneration"]);
    normalize_ai_diagram_config(&mut ai["diagrams"]);
    normalize_ai_handwritten_drawing_config(&mut ai["handwrittenDrawing"]);
    ai["rag"]["status"] = Value::from(
        match ai["rag"]["status"].as_str().unwrap_or("not-indexed") {
            "ready" | "updated" => "updated",
            "indexing" => "indexing",
            "error" => "error",
            _ => "not-indexed",
        },
    );
    ai["agentic"]["webResearchEnabled"] = Value::Bool(
        ai["agentic"]["webResearchEnabled"]
            .as_bool()
            .unwrap_or(true),
    );
    normalize_ai_research_presets(&mut ai["agentic"]["researchPresets"]);
    ai["agentic"]["researchDiagramsEnabled"] = Value::Bool(
        original_agentic["researchDiagramsEnabled"]
            .as_bool()
            .unwrap_or_else(|| {
                legacy_research_visual_enabled(&original_agentic, "diagramsEnabled", true)
            }),
    );
    ai["agentic"]["researchImagesEnabled"] = Value::Bool(
        original_agentic["researchImagesEnabled"]
            .as_bool()
            .unwrap_or_else(|| {
                legacy_research_visual_enabled(&original_agentic, "imagesEnabled", true)
            }),
    );
}

fn normalize_ai_permissions(permissions: &mut Value) {
    if !permissions.is_object() {
        *permissions = default_ai_config()["permissions"].clone();
    }
    let defaults = default_ai_config()["permissions"].clone();
    for key in [
        "editDocuments",
        "editHandwrittenNotes",
        "drawHandwrittenNotes",
        "createFolders",
        "createDocuments",
        "deleteDocumentsAndFolders",
        "generateImages",
        "createImageAssets",
        "insertImagesIntoDocuments",
        "useDocumentContextForImageGeneration",
    ] {
        permissions[key] = Value::Bool(
            permissions[key]
                .as_bool()
                .unwrap_or_else(|| defaults[key].as_bool().unwrap_or(false)),
        );
    }
}

fn normalize_ai_handwritten_drawing_config(handwritten_drawing: &mut Value) {
    if !handwritten_drawing.is_object() {
        *handwritten_drawing = default_ai_config()["handwrittenDrawing"].clone();
    }

    handwritten_drawing["enabled"] =
        Value::Bool(handwritten_drawing["enabled"].as_bool().unwrap_or(true));
    handwritten_drawing["creativeSketchEnabled"] = Value::Bool(
        handwritten_drawing["creativeSketchEnabled"]
            .as_bool()
            .unwrap_or(false),
    );
    handwritten_drawing["defaultStyle"] = Value::from("professional_whiteboard");
    handwritten_drawing["maxElements"] = Value::from(
        handwritten_drawing["maxElements"]
            .as_u64()
            .unwrap_or(48)
            .clamp(4, 96),
    );
    handwritten_drawing["maxStrokes"] = Value::from(
        handwritten_drawing["maxStrokes"]
            .as_u64()
            .unwrap_or(1400)
            .clamp(100, 4000),
    );
    handwritten_drawing["maxPagesPerRequest"] = Value::from(
        handwritten_drawing["maxPagesPerRequest"]
            .as_u64()
            .unwrap_or(1)
            .clamp(1, 3),
    );
}

fn normalize_ai_research_presets(presets: &mut Value) {
    let defaults = default_ai_config()["agentic"]["researchPresets"].clone();
    if !presets.is_object() {
        *presets = defaults;
    }
    let current = presets.clone();
    let mut normalized = serde_json::Map::new();
    for key in ["quick", "deep", "compare", "currentDocument"] {
        let preset = &current[key];
        let default_preset = default_ai_config()["agentic"]["researchPresets"][key].clone();
        let default_candidate = default_preset["candidateSourceLimit"]
            .as_u64()
            .unwrap_or(50);
        let explicit_candidate = preset["candidateSourceLimit"].as_u64();
        let legacy_max_sources = preset["maxSources"].as_u64();
        let candidate_source_limit = if explicit_candidate == Some(default_candidate) {
            legacy_max_sources.or(explicit_candidate)
        } else {
            explicit_candidate.or(legacy_max_sources)
        }
        .unwrap_or(default_candidate)
        .clamp(1, 500);
        let legacy_diagrams = preset["diagrams"].as_str().map(|value| value != "none");
        let legacy_images = preset["images"].as_str().map(|value| value != "none");
        let diagrams_enabled = preset["diagramsEnabled"]
            .as_bool()
            .or(legacy_diagrams)
            .unwrap_or(default_preset["diagramsEnabled"].as_bool().unwrap_or(false));
        let images_enabled = preset["imagesEnabled"]
            .as_bool()
            .or(legacy_images)
            .unwrap_or(default_preset["imagesEnabled"].as_bool().unwrap_or(false));
        normalized.insert(
            key.to_string(),
            json!({
                "candidateSourceLimit": candidate_source_limit,
                "diagramsEnabled": diagrams_enabled,
                "imagesEnabled": images_enabled
            }),
        );
    }
    *presets = Value::Object(normalized);
}

fn normalize_ai_diagram_config(diagrams: &mut Value) {
    if !diagrams.is_object() {
        *diagrams = default_ai_config()["diagrams"].clone();
    }

    diagrams["enabled"] = Value::Bool(diagrams["enabled"].as_bool().unwrap_or(true));
    let visual_profile = match diagrams["visualProfile"].as_str().unwrap_or("visual_local") {
        "compatible" => "compatible",
        "advanced" => "advanced",
        _ => "visual_local",
    };
    diagrams["visualProfile"] = Value::from(visual_profile);

    let icon_set = match diagrams["iconSet"].as_str().unwrap_or("lucide") {
        "none" => "none",
        "lucide" if visual_profile != "compatible" => "lucide",
        _ if visual_profile == "compatible" => "none",
        _ => "lucide",
    };
    diagrams["iconSet"] = Value::from(icon_set);

    let image_policy = match diagrams["imagePolicy"].as_str().unwrap_or("project_assets") {
        "disabled" => "disabled",
        "external_confirm" if visual_profile == "advanced" => "external_confirm",
        "project_assets" if visual_profile != "compatible" => "project_assets",
        _ if visual_profile == "compatible" => "disabled",
        _ => "project_assets",
    };
    diagrams["imagePolicy"] = Value::from(image_policy);

    diagrams["betaPolicy"] = Value::from(match diagrams["betaPolicy"].as_str().unwrap_or("ask") {
        "disabled" => "disabled",
        "enabled" if visual_profile == "advanced" => "enabled",
        _ => "ask",
    });
    diagrams["defaultWidth"] =
        Value::from(match diagrams["defaultWidth"].as_str().unwrap_or("wide") {
            "compact" => "compact",
            "auto" => "auto",
            "full" => "full",
            _ => "wide",
        });
    diagrams["aiGenerationMode"] = Value::from(
        match diagrams["aiGenerationMode"].as_str().unwrap_or("visual") {
            "safe" => "safe",
            "visual" if visual_profile != "compatible" => "visual",
            _ => "safe",
        },
    );
}

fn normalize_ai_image_generation_config(image_generation: &mut Value) {
    let model = image_generation["model"]
        .as_str()
        .filter(|m| !m.trim().is_empty())
        .unwrap_or("gpt-image-2.5-flare")
        .to_string();
    image_generation["model"] = Value::from(model.clone());

    let size = match image_generation["size"].as_str().unwrap_or("auto") {
        "1024x1024" => "1024x1024",
        "1536x1024" => "1536x1024",
        "1024x1536" => "1024x1536",
        "2048x2048" if model.starts_with("gpt-image-2") => "2048x2048",
        "2048x1152" if model.starts_with("gpt-image-2") => "2048x1152",
        "3840x2160" if model.starts_with("gpt-image-2") => "3840x2160",
        "2160x3840" if model.starts_with("gpt-image-2") => "2160x3840",
        _ => "auto",
    };
    image_generation["size"] = Value::from(size);

    let quality = match image_generation["quality"].as_str().unwrap_or("auto") {
        "low" => "low",
        "medium" => "medium",
        "high" => "high",
        _ => "auto",
    };
    image_generation["quality"] = Value::from(quality);

    let output_format = match image_generation["outputFormat"].as_str().unwrap_or("png") {
        "webp" => "webp",
        "jpeg" | "jpg" => "jpeg",
        _ => "png",
    };
    image_generation["outputFormat"] = Value::from(output_format);
}

fn default_config() -> Value {
    json!({
        "schemaVersion": 3,
        "layout": { "sidebarWidth": 338, "historyWidth": 320 },
        "appearance": { "language": "es", "zoomPercent": 100, "markdownExtendedUnderlineEnabled": true, "themeMode": "system", "primaryColor": "orange" },
        "diagnostics": { "traceLoggingEnabled": false },
        "handwritten": default_handwritten_config(),
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

fn default_handwritten_config() -> Value {
    json!({
        "toolPresets": default_handwritten_tool_presets(),
        "eraser": { "width": 24.0, "mode": "stroke" }
    })
}

fn default_pencil_preset_for_type(tool_type: &str) -> Value {
    match tool_type {
        "fountain" => {
            json!({ "id": "pencil-1", "type": "fountain", "label": "Pluma", "color": "#111827", "width": 5.0, "opacity": 1.0, "pressure": true, "pressureSensitivity": 0.72, "smoothing": 0.82 })
        }
        "pencil" => {
            json!({ "id": "pencil-2", "type": "pencil", "label": "Lapiz", "color": "#374151", "width": 3.0, "opacity": 0.68, "pressure": true, "pressureSensitivity": 0.82, "smoothing": 0.48 })
        }
        "marker" => {
            json!({ "id": "pencil-1", "type": "marker", "label": "Rotulador", "color": "#D85A12", "width": 9.0, "opacity": 0.92, "pressure": true, "pressureSensitivity": 0.38, "smoothing": 0.56 })
        }
        "highlighter" => {
            json!({ "id": "pencil-3", "type": "highlighter", "label": "Subrayador", "color": "#FACC15", "width": 18.0, "opacity": 0.36, "pressure": false, "pressureSensitivity": 0.2, "smoothing": 0.42 })
        }
        _ => {
            json!({ "id": "pencil-1", "type": "pen", "label": "Boligrafo", "color": "#111827", "width": 4.0, "opacity": 1.0, "pressure": true, "pressureSensitivity": 0.55, "smoothing": 0.62 })
        }
    }
}

fn is_hex_color(value: &str) -> bool {
    let bytes = value.as_bytes();
    bytes.len() == 7 && bytes[0] == b'#' && bytes[1..].iter().all(|byte| byte.is_ascii_hexdigit())
}

fn default_ai_config() -> Value {
    json!({
        "provider": "openai",
        "model": knownext_core::model_catalog::catalog()["defaults"]["text"],
        "permissions": { "editDocuments": true, "editHandwrittenNotes": true, "drawHandwrittenNotes": true, "createFolders": false, "createDocuments": true, "deleteDocumentsAndFolders": false, "generateImages": true, "createImageAssets": true, "insertImagesIntoDocuments": true, "useDocumentContextForImageGeneration": true },
        "rag": { "enabled": true, "vectorStoreId": null, "lastIndexedAt": null, "status": "not-indexed", "error": null },
        "vision": { "enabled": true, "model": knownext_core::model_catalog::catalog()["defaults"]["vision"], "imageIndexingEnabled": false, "maxImagesPerPrompt": 4, "maxImageSizeMb": 12, "detail": "auto", "storeVisualDescriptions": true },
        "imageGeneration": { "enabled": true, "model": knownext_core::model_catalog::catalog()["defaults"]["image"], "size": "auto", "quality": "auto", "outputFormat": "png", "defaultFolder": "document_folder", "customFolderPath": "assets/generated", "maxImagesPerPrompt": 1, "confirmBeforeDocumentInsert": false, "confirmBeforeUsingMultipleSources": true, "storePromptMetadata": true },
        "agentic": {
            "depth": "guided",
            "webResearchEnabled": true,
            "confirmBeforeApplying": true,
            "maxSteps": 4,
            "maxDocuments": 6,
            "maxEstimatedCostEur": 1,
            "maxSources": 500,
            "researchDiagramsEnabled": true,
            "researchImagesEnabled": true,
            "researchPresets": {
                "quick": { "candidateSourceLimit": 50, "diagramsEnabled": false, "imagesEnabled": false },
                "deep": { "candidateSourceLimit": 500, "diagramsEnabled": true, "imagesEnabled": true },
                "compare": { "candidateSourceLimit": 200, "diagramsEnabled": true, "imagesEnabled": false },
                "currentDocument": { "candidateSourceLimit": 10, "diagramsEnabled": true, "imagesEnabled": false }
            }
        },
        "transcription": { "enabled": true, "model": knownext_core::model_catalog::catalog()["defaults"]["transcription"], "defaultTarget": "prompt", "defaultLanguage": "auto", "favoriteLanguages": ["es", "en"] },
        "diagrams": { "enabled": true, "visualProfile": "visual_local", "iconSet": "lucide", "imagePolicy": "project_assets", "betaPolicy": "ask", "defaultWidth": "wide", "aiGenerationMode": "visual" },
        "handwrittenDrawing": { "enabled": true, "creativeSketchEnabled": false, "defaultStyle": "professional_whiteboard", "maxElements": 48, "maxStrokes": 1400, "maxPagesPerRequest": 1 }
    })
}

fn default_export_template() -> Value {
    json!({
        "schemaVersion": 2,
        "name": "basic",
        "page": { "size": "A4", "margins": { "topMm": 20, "rightMm": 20, "bottomMm": 20, "leftMm": 20 } },
        "normal": { "fontFamily": "Arial", "fontSizePt": 11, "color": "#111827", "textFormat": "normal" },
        "headingFontFamily": "Arial",
        "headings": {
            "h1": { "fontFamily": "Arial", "fontSizePt": 22, "color": "#111827", "textFormat": "bold", "spaceBeforePt": 12, "spaceAfterPt": 8 },
            "h2": { "fontFamily": "Arial", "fontSizePt": 18, "color": "#111827", "textFormat": "bold", "spaceBeforePt": 10, "spaceAfterPt": 6 },
            "h3": { "fontFamily": "Arial", "fontSizePt": 15, "color": "#111827", "textFormat": "bold", "spaceBeforePt": 8, "spaceAfterPt": 5 },
            "h4": { "fontFamily": "Arial", "fontSizePt": 13, "color": "#111827", "textFormat": "bold", "spaceBeforePt": 6, "spaceAfterPt": 4 },
            "h5": { "fontFamily": "Arial", "fontSizePt": 12, "color": "#111827", "textFormat": "bold", "spaceBeforePt": 4, "spaceAfterPt": 3 },
            "h6": { "fontFamily": "Arial", "fontSizePt": 11, "color": "#111827", "textFormat": "bold", "spaceBeforePt": 3, "spaceAfterPt": 3 }
        },
        "code": { "fontFamily": "Consolas", "fontSizePt": 10, "color": "#111827", "textFormat": "normal" },
        "paragraph": { "lineSpacing": 1.25, "spaceBeforePt": 0, "spaceAfterPt": 6 },
        "document": { "includeTitle": false, "linkColor": "#D85A12", "horizontalRuleColor": "#E5E7EB", "diagramResolution": "medium" },
        "updatedAt": knownext_core::now_iso()
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    static GIT_REMOTE_TEST_LOCK: Mutex<()> = Mutex::new(());

    #[test]
    fn research_file_name_is_short_and_has_stable_suffix() {
        let topic = "investigación ".repeat(40);
        let file_name = safe_research_markdown_file_name(&topic, "research-1234567890abcdef");

        assert!(file_name.ends_with("90abcdef.md"));
        assert!(file_name.len() <= 100);
        assert!(!file_name.contains(':'));
        assert!(!file_name.contains('\\'));
    }

    #[test]
    fn research_runtime_fields_count_artifacts() {
        let mut job = json!({
            "sourceCandidates": [{ "id": "c1" }, { "id": "c2" }],
            "rankedSources": [{ "id": "r1" }],
            "sources": [{ "id": "s1" }],
            "sourceReads": [{ "status": "read" }, { "status": "unavailable" }],
            "evidence": [{ "sourceId": "s1" }, { "sourceId": "s2" }],
            "findings": [{ "id": "f1" }],
            "qualityReport": { "citedSourceCount": 2 },
            "draftMarkdown": "| A | B |\n| - | - |\n| 1 | 2 |\n\n```mermaid\ngraph TD\n```\n",
            "generatedImages": [{ "status": "completed" }, { "status": "blocked" }]
        });

        refresh_research_runtime_fields(&mut job);

        assert_eq!(job["artifactCounts"]["candidateSources"], 2);
        assert_eq!(job["artifactCounts"]["readSources"], 1);
        assert_eq!(job["artifactCounts"]["evidence"], 2);
        assert_eq!(job["artifactCounts"]["tables"], 1);
        assert_eq!(job["artifactCounts"]["diagrams"], 1);
        assert_eq!(job["artifactCounts"]["images"], 1);
    }

    #[test]
    fn research_source_reads_are_compacted_into_bounded_batches() {
        let long_content = "contenido ".repeat(2_000);
        let source_reads = (0..13)
            .map(|index| {
                json!({
                    "sourceId": format!("source-{index}"),
                    "title": format!("Fuente {index}"),
                    "url": format!("https://example.com/{index}"),
                    "path": null,
                    "kind": "web",
                    "status": "read",
                    "readAt": knownext_core::now_iso(),
                    "content": long_content,
                    "excerpt": "extracto ".repeat(500),
                    "objectiveIndex": index % 3,
                    "aspectIndex": index % 5
                })
            })
            .collect::<Vec<_>>();

        let batches = research_source_read_batches(&source_reads);

        assert_eq!(batches.len(), 3);
        assert!(batches.iter().all(|batch| batch.len() <= 6));
        assert!(batches.iter().flatten().all(|source| source["content"]
            .as_str()
            .unwrap()
            .chars()
            .count()
            <= 2_400));
        assert!(batches.iter().flatten().all(|source| source["excerpt"]
            .as_str()
            .unwrap()
            .chars()
            .count()
            <= 600));
    }

    #[test]
    fn research_writer_receives_only_referenced_compact_evidence() {
        let evidence = (0..5)
            .map(|index| {
                json!({
                    "id": format!("evidence-{index}"),
                    "sourceId": format!("source-{index}"),
                    "claim": format!("Afirmación {index}"),
                    "excerpt": "extracto largo ".repeat(200),
                    "confidence": "medium",
                    "objectiveIndex": index % 3,
                    "aspectIndex": index % 5,
                    "consultedAt": knownext_core::now_iso(),
                    "sourceKind": "web"
                })
            })
            .collect::<Vec<_>>();
        let findings = vec![json!({
            "id": "finding-1",
            "title": "Hallazgo",
            "summary": "Resumen",
            "evidenceIds": ["evidence-1", "evidence-3"]
        })];

        let compact = compact_research_evidence_for_findings(&evidence, &findings, 10, 120);

        assert_eq!(compact.len(), 2);
        assert_eq!(compact[0]["id"], "evidence-1");
        assert_eq!(compact[1]["id"], "evidence-3");
        assert!(compact
            .iter()
            .all(|item| item["excerpt"].as_str().unwrap().chars().count() <= 120));
    }

    #[test]
    fn research_context_sources_are_compacted_before_search() {
        let sources = json!((0..20)
            .map(|index| json!({
                "id": format!("ctx-{index}"),
                "title": format!("Contexto {index}"),
                "path": format!("docs/{index}.md"),
                "markdown": "contenido local ".repeat(500)
            }))
            .collect::<Vec<_>>());

        let compact = compact_research_context_sources(&sources);
        let items = compact.as_array().unwrap();

        assert_eq!(items.len(), 12);
        assert!(items
            .iter()
            .all(|item| item["excerpt"].as_str().unwrap().chars().count() <= 1_500));
    }

    fn api() -> LocalApi {
        let root = std::env::temp_dir().join(knownext_core::compact_id("knownext-test"));
        LocalApi::new(root, "2.0.4".to_string(), "desktop".to_string())
    }

    #[test]
    fn file_operations_reject_cross_project_identifiers_and_collisions() {
        let api = api(); let (project, root) = create_project(&api);
        let first = create_document(&api, &project, "first.md", "first");
        let second = create_document(&api, &project, "second.md", "second");
        assert!(api.rename_node(&project, &first, json!({"name":"second.md"})).is_err());
        assert!(api.delete_node(&project, "other::second.md").is_err());
        assert!(api.delete_node(&project, &format!("{project}::")).is_err());
        assert!(api.create_document(&project, json!({"name":"second.md","markdown":"overwritten"})).is_err());
        assert_eq!(std::fs::read_to_string(root.join("second.md")).unwrap(), "second");
        assert_eq!(api.get_document(&second).unwrap()["markdown"], "second");
        assert!(api.resolve_project_relative(&project, ".git/config").is_err());
    }

    #[test]
    fn layout_preferences_round_trip_without_overwriting_other_settings() {
        let api = api();
        api.update_config(json!({"layout":{"navigationVisible":false,"contextPinned":true,"contextKind":"properties"}})).unwrap();
        let config = api.read_config();
        assert_eq!(config["layout"]["navigationVisible"], false);
        assert_eq!(config["layout"]["contextPinned"], true);
        assert_eq!(config["layout"]["contextKind"],"properties");
        assert!(config["layout"]["sidebarWidth"].is_number());
        assert!(config["ai"].is_object());
    }
    #[test]
    fn active_document_selection_survives_config_reload_and_unrelated_updates() {
        let api = api();
        assert_eq!(api.read_config()["activeUtilityTab"], "notes");
        api.update_config(json!({"activeUtilityTab":null})).unwrap();
        assert!(api.read_config()["activeUtilityTab"].is_null());
        api.update_config(json!({"layout":{"firstUseDismissed":true}})).unwrap();
        let reopened = LocalApi::new(api.app_data_dir.clone(), api.version.clone(), api.profile.clone());
        assert!(reopened.read_config()["activeUtilityTab"].is_null());
        assert_eq!(reopened.read_config()["layout"]["firstUseDismissed"], true);
        let mut legacy = json!({"appearance":{"language":"es"}});
        normalize_config(&mut legacy);
        assert_eq!(legacy["activeUtilityTab"], "notes");
    }
    #[test]
    fn recovery_draft_identifiers_cannot_mix_distinct_documents() {
        let api = api(); let (project, _) = create_project(&api);
        let a = create_document(&api, &project, "a-b.md", "saved a");
        let b = create_document(&api, &project, "a_b.md", "saved b");
        api.save_draft(&a, json!({"markdown":"private draft a"})).unwrap();
        assert!(api.save_draft(&a, json!({})).is_err());
        assert_eq!(api.get_document(&b).unwrap()["markdown"], "saved b");
        api.save_draft(&b, json!({"markdown":"private draft b"})).unwrap();
        assert_eq!(api.get_document(&a).unwrap()["markdown"], "private draft a");
        assert_eq!(api.get_document(&b).unwrap()["markdown"], "private draft b");
        api.delete_draft(&a).unwrap();
        assert_eq!(api.get_document(&b).unwrap()["markdown"], "private draft b");
    }
    #[test]
    fn recovery_draft_reopen_preserves_the_original_base_after_external_change() {
        let api = api(); let (project, root) = create_project(&api);
        let id = create_document(&api, &project, "reopen.md", "original disk");
        let original = api.get_document(&id).unwrap();
        api.save_draft(&id, json!({"markdown":"local edits","baseFingerprint":original["baseFingerprint"],"baseContentHash":original["diskContentHash"]})).unwrap();
        std::fs::write(root.join("reopen.md"), "external edits").unwrap();
        let reopened = api.get_document(&id).unwrap();
        assert_eq!(reopened["markdown"], "local edits");
        assert_eq!(reopened["diskMarkdown"], "external edits");
        assert_eq!(reopened["baseFingerprint"], original["baseFingerprint"]);
        assert_eq!(reopened["diskChanged"], true);
        assert_eq!(reopened["conflictStatus"], "disk-changed");
        api.save_draft(&id, json!({"markdown":"local edits","baseFingerprint":api.fingerprint(&root.join("reopen.md")),"baseContentHash":reopened["diskContentHash"]})).unwrap();
        let still_conflicted = api.get_document(&id).unwrap();
        assert_eq!(still_conflicted["baseFingerprint"], original["baseFingerprint"]);
        assert_eq!(still_conflicted["savedContentHash"], original["diskContentHash"]);
        let response = api.handle("PUT", &format!("/api/documents/{}", child_id_for_path(&id)), json!({"markdown":"local edits","baseFingerprint":reopened["baseFingerprint"],"expectedDraftWriteRevision":api.draft_write_revision(&id).unwrap()}), vec![]).unwrap();
        assert_eq!(response.status, 409);
        assert_eq!(std::fs::read_to_string(root.join("reopen.md")).unwrap(), "external edits");
    }
    #[test]
    fn recovery_legacy_draft_without_a_base_requires_an_explicit_choice() {
        let api = api(); let (project, root) = create_project(&api);
        let id = create_document(&api, &project, "legacy.md", "disk content");
        let folder=api.app_data_dir.join("drafts");std::fs::create_dir_all(&folder).unwrap();
        std::fs::write(folder.join(format!("{}.json",safe_name(&id))),serde_json::to_vec(&json!({"documentId":id,"markdown":"legacy edits"})).unwrap()).unwrap();
        let loaded = api.get_document(&id).unwrap();assert_eq!(loaded["baseVerified"],false);
        api.save_draft(&id,json!({"markdown":"new edits","baseFingerprint":loaded["baseFingerprint"]})).unwrap();
        assert_eq!(api.get_document(&id).unwrap()["baseVerified"],false);
        let route=format!("/api/documents/{}",child_id_for_path(&id));
        let rejected=api.handle("PUT",&route,json!({"markdown":"new edits","baseFingerprint":loaded["baseFingerprint"],"expectedDraftWriteRevision":api.draft_write_revision(&id).unwrap()}),vec![]).unwrap();
        assert_eq!(rejected.status,409);assert_eq!(std::fs::read_to_string(root.join("legacy.md")).unwrap(),"disk content");
        let accepted=api.handle("PUT",&route,json!({"markdown":"new edits","force":true,"expectedDraftWriteRevision":api.draft_write_revision(&id).unwrap()}),vec![]).unwrap();
        assert_eq!(accepted.status,200);assert_eq!(accepted.body["baseVerified"],true);
    }
    #[test]
    fn recovery_restore_refuses_a_newly_occupied_destination_and_preserves_both_versions() {
        let api=api();let(project,root)=create_project(&api);let id=create_document(&api,&project,"restore.md","original");
        api.save_draft(&id,json!({"markdown":"local recovery"})).unwrap();std::fs::remove_file(root.join("restore.md")).unwrap();
        let list=api.orphan_drafts();let key=list[0]["draftKey"].as_str().unwrap();
        std::fs::write(root.join("restore.md"),"another program created this").unwrap();
        assert!(api.restore_orphan_draft(key).is_err());
        assert_eq!(std::fs::read_to_string(root.join("restore.md")).unwrap(),"another program created this");
        assert!(api.read_draft_key(key).unwrap().is_some());
        std::fs::remove_file(root.join("restore.md")).unwrap();
        let restored=api.restore_orphan_draft(key).unwrap();assert_eq!(restored["document"]["markdown"],"local recovery");
        assert!(api.read_draft_key(key).unwrap().is_none());
    }
    #[test]
    fn recovery_handwritten_draft_recreates_valid_ink_instead_of_an_empty_markdown_file() {
        let api=api();let(project,root)=create_project(&api);
        let created=api.create_handwritten_note(&project,json!({"name":"sketch.knote"})).unwrap();let id=created["node"]["id"].as_str().unwrap();
        let original=api.get_handwritten_note(id).unwrap();let mut content=original["content"].clone();content["title"]=json!("Recovered sketch");
        api.save_handwritten_note_draft(id,json!({"content":content,"baseFingerprint":original["baseFingerprint"]})).unwrap();
        assert!(api.save_handwritten_note_draft(id,json!({"content":{}})).is_err());
        std::fs::remove_file(root.join("sketch.knote")).unwrap();let list=api.orphan_drafts();assert_eq!(list[0]["kind"],"handwritten-note");
        let restored=api.restore_orphan_draft(list[0]["draftKey"].as_str().unwrap()).unwrap();
        assert_eq!(restored["note"]["content"]["title"],"Recovered sketch");assert!(restored["document"].is_null());
        let disk:Value=serde_json::from_slice(&std::fs::read(root.join("sketch.knote")).unwrap()).unwrap();assert!(disk["pages"].is_array());
    }
    #[test]
    fn recovery_contracts_never_write_a_different_document_format() {
        let api=api();let(project,root)=create_project(&api);let id=create_document(&api,&project,"document.md","original Markdown");
        std::fs::write(root.join("picture.png"),"original image bytes").unwrap();let image=doc_id(&project,"picture.png");
        assert!(api.save_document(&image,json!({"markdown":"replacement"})).is_err());
        assert!(api.save_draft(&image,json!({"markdown":"replacement"})).is_err());
        assert!(api.save_handwritten_note(&id,json!({"content":{"pages":[]}})).is_err());
        assert_eq!(std::fs::read_to_string(root.join("picture.png")).unwrap(),"original image bytes");
        assert_eq!(std::fs::read_to_string(root.join("document.md")).unwrap(),"original Markdown");
    }
    #[cfg(windows)]
    #[test]
    fn recovery_cleanup_failure_reports_committed_content_and_preserves_the_copy() {
        let api=api();let(project,root)=create_project(&api);let id=create_document(&api,&project,"readonly.md","original");
        api.save_draft(&id,json!({"markdown":"saved content"})).unwrap();let path=draft_store::path(&api.app_data_dir.join("drafts"),&id);
        let mut permissions=std::fs::metadata(&path).unwrap().permissions();permissions.set_readonly(true);std::fs::set_permissions(&path,permissions.clone()).unwrap();
        let saved=api.save_document(&id,json!({"markdown":"saved content"})).unwrap();
        assert_eq!(saved["markdown"],"saved content");assert_eq!(saved["hasDraft"],false);assert!(saved["recoveryWarning"].is_string());assert!(path.exists());
        assert_eq!(std::fs::read_to_string(root.join("readonly.md")).unwrap(),"saved content");
        permissions.set_readonly(false);std::fs::set_permissions(&path,permissions).unwrap();
    }
    #[test]
    fn configuration_write_failures_are_not_acknowledged_as_success() {
        let api = api();
        if api.config_path().is_file() { std::fs::remove_file(api.config_path()).unwrap(); }
        std::fs::create_dir_all(api.config_path()).unwrap();
        assert!(api.update_config(json!({"layout":{"navigationVisible":false}})).is_err());
        assert!(api.update_ai_config(default_ai_config()).is_err());
        std::fs::create_dir_all(api.export_template_path()).unwrap();
        assert!(api.update_export_template(json!({})).is_err());
        assert!(api.reset_export_template().is_err());
    }

    #[test]
    fn save_rejects_changed_base_and_preserves_disk_and_draft() {
        let api = api(); let (project, root) = create_project(&api);
        let id = create_document(&api, &project, "guarded.md", "original");
        let loaded = api.get_document(&id).unwrap();
        api.save_draft(&id, json!({"markdown":"local draft", "baseFingerprint":loaded["baseFingerprint"]})).unwrap();
        std::fs::write(root.join("guarded.md"), "external").unwrap();
        let response = api.handle("PUT", &format!("/api/documents/{}", child_id_for_path(&id)), json!({"markdown":"local draft", "baseFingerprint":loaded["baseFingerprint"],"expectedDraftWriteRevision":api.draft_write_revision(&id).unwrap()}), vec![]).unwrap();
        assert_eq!(response.status, 409);
        assert_eq!(std::fs::read_to_string(root.join("guarded.md")).unwrap(), "external");
        assert!(api.read_draft(&id).unwrap().is_some());
    }
    #[test]
    fn save_uses_current_base_and_does_not_erase_on_missing_markdown() {
        let api = api(); let (project, root) = create_project(&api);
        let id = create_document(&api, &project, "guarded.md", "original");
        let loaded = api.get_document(&id).unwrap();
        assert!(api.save_document(&id, json!({})).is_err());
        assert_eq!(std::fs::read_to_string(root.join("guarded.md")).unwrap(), "original");
        let response = api.handle("PUT", &format!("/api/documents/{}", child_id_for_path(&id)), json!({"markdown":"saved", "baseFingerprint":loaded["baseFingerprint"]}), vec![]).unwrap();
        assert_eq!(response.status, 200);
        assert_eq!(std::fs::read_to_string(root.join("guarded.md")).unwrap(), "saved");
    }
    #[test]
    fn personal_notes_do_not_report_success_when_persistence_fails() {
        let api = api();
        std::fs::create_dir_all(api.notes_path()).unwrap();
        assert!(api.write_notes("unsaved notes".to_string()).is_err());
    }

    #[test]
    fn recording_documents_are_idempotent_and_never_replace_existing_files() {
        let api = api();
        let (project, root) = create_project(&api);
        std::fs::write(root.join("Reunión.md"), "Original").unwrap();
        let text = "[knownext-recording:session-test]: #\n\n# Reunión\nTexto";
        let first = api
            .create_recording_document("session-test", &project, None, "Reunión.md", text)
            .unwrap();
        let again = api
            .create_recording_document("session-test", &project, None, "Reunión.md", text)
            .unwrap();
        assert_eq!(first, again);
        assert!(first.ends_with("Reunión (1).md"));
        assert_eq!(
            std::fs::read_to_string(root.join("Reunión.md")).unwrap(),
            "Original"
        );
        assert!(api
            .create_recording_document(
                "other",
                &project,
                Some(&format!("{project}::missing")),
                "Missing.md",
                text
            )
            .is_err());
        assert!(!root.join("missing").exists());
        assert!(api
            .create_recording_document("other", &project, None, "../escape.md", text)
            .is_err());
    }

    fn create_project(api: &LocalApi) -> (String, PathBuf) {
        let root = std::env::temp_dir().join(knownext_core::compact_id("knownext-project"));
        let created = api
            .handle(
                "POST",
                "/api/projects",
                json!({
                    "name": "Docs",
                    "folderPath": root.to_string_lossy(),
                    "icon": "folder",
                    "iconColor": "#F37021"
                }),
                vec![],
            )
            .unwrap();
        (created.body["id"].as_str().unwrap().to_string(), root)
    }

    #[test]
    fn reviewed_batch_normalizes_descendants_protects_changes_and_never_replays() {
        let api = api(); let (project, root) = create_project(&api);
        std::fs::create_dir_all(root.join("docs")).unwrap();
        std::fs::write(root.join("docs/a.md"), "original").unwrap();
        let payload = json!({"action":"trash","nodeIds":[doc_id(&project,"docs"),doc_id(&project,"docs/a.md")]});
        let plan = api.prepare_batch(&project,payload.clone()).unwrap();
        assert_eq!(plan["items"].as_array().unwrap().len(),1);
        std::fs::write(root.join("docs/a.md"), "external change").unwrap();
        assert!(api.execute_batch(&project,plan["id"].as_str().unwrap()).is_err());
        assert!(root.join("docs/a.md").exists());
        let plan = api.prepare_batch(&project,payload).unwrap();
        let id = plan["id"].as_str().unwrap();
        let done = api.execute_batch(&project,id).unwrap();
        assert_eq!(done["state"],"completed");
        let again = api.execute_batch(&project,id).unwrap();
        assert_eq!(again,done);
        assert_eq!(trash::list(&root,&project).unwrap().entries.len(),1);
        let entry = &trash::list(&root,&project).unwrap().entries[0];
        trash::restore(&root,&project,&entry.id).unwrap();
        assert_eq!(std::fs::read_to_string(root.join("docs/a.md")).unwrap(),"external change");
        assert!(api.prepare_batch(&project,json!({"action":"trash","nodeIds":["alien::a.md"]})).is_err());
    }

    #[test]
    fn reviewed_move_rejects_collisions_and_reports_every_applied_item() {
        let api = api(); let (project, root) = create_project(&api);
        std::fs::create_dir_all(root.join("target")).unwrap();
        let a = create_document(&api,&project,"a.md","a");
        let b = create_document(&api,&project,"b.md","b");
        let payload = json!({"action":"move","nodeIds":[a,b],"targetFolderId":doc_id(&project,"target")});
        let plan = api.prepare_batch(&project,payload.clone()).unwrap();
        std::fs::write(root.join("target/a.md"),"other").unwrap();
        assert!(api.execute_batch(&project,plan["id"].as_str().unwrap()).is_err());
        assert!(root.join("a.md").exists()); assert!(root.join("b.md").exists());
        std::fs::remove_file(root.join("target/a.md")).unwrap();
        let plan = api.prepare_batch(&project,payload).unwrap();
        let result = api.execute_batch(&project,plan["id"].as_str().unwrap()).unwrap();
        assert_eq!(result["state"],"completed");
        assert!(result["items"].as_array().unwrap().iter().all(|item| item["result"]["tree"].is_array()));
        assert_eq!(std::fs::read_to_string(root.join("target/b.md")).unwrap(),"b");
        assert!(api.prepare_batch(&project,json!({"action":"move","nodeIds":[doc_id(&project,"target")],"targetFolderId":doc_id(&project,"target")})).is_err());
    }

    #[test]
    fn reviewed_batch_moves_linked_documents_without_treating_its_reference_updates_as_external_changes() {
        let api=api();let (project,root)=create_project(&api);
        std::fs::create_dir(root.join("archive")).unwrap();
        let a=create_document(&api,&project,"a.md","# A\n\n[B](b.md)\n");
        let b=create_document(&api,&project,"b.md","# B\n\n[A](a.md)\n");
        let plan=api.prepare_batch(&project,json!({"action":"move","nodeIds":[a,b],"targetFolderId":doc_id(&project,"archive")})).unwrap();
        let done=api.execute_batch(&project,plan["id"].as_str().unwrap()).unwrap();
        assert_eq!(done["state"],"completed");
        assert_eq!(std::fs::read_to_string(root.join("archive/a.md")).unwrap(),"# A\n\n[B](b.md)\n");
        assert_eq!(std::fs::read_to_string(root.join("archive/b.md")).unwrap(),"# B\n\n[A](a.md)\n");
    }

    #[test]
    fn reviewed_batch_moves_an_image_and_its_referring_document_together() {
        let api=api();let (project,root)=create_project(&api);
        std::fs::create_dir(root.join("archive")).unwrap();
        std::fs::write(root.join("a.png"),[1,2,3]).unwrap();
        let document=create_document(&api,&project,"b.md","![x](a.png)\n");
        let plan=api.prepare_batch(&project,json!({"action":"move","nodeIds":[doc_id(&project,"a.png"),document],"targetFolderId":doc_id(&project,"archive")})).unwrap();
        let done=api.execute_batch(&project,plan["id"].as_str().unwrap()).unwrap();
        assert_eq!(done["state"],"completed");
        assert_eq!(std::fs::read_to_string(root.join("archive/b.md")).unwrap(),"![x](a.png)\n");
        assert!(root.join("archive/a.png").exists());
    }

    #[test]
    fn interrupted_batch_is_visible_after_restart_and_is_not_reexecuted() {
        let api = api(); let (project, root) = create_project(&api);
        let document = create_document(&api,&project,"a.md","original");
        let mut plan = api.prepare_batch(&project,json!({"action":"trash","nodeIds":[document]})).unwrap();
        let id = plan["id"].as_str().unwrap().to_owned();
        plan["state"] = json!("running"); plan["items"][0]["state"] = json!("running");
        atomic_io::write(&api.app_data_dir.join("file-batches").join(format!("{id}.json")),&serde_json::to_vec(&plan).unwrap()).unwrap();
        let restarted = LocalApi::new(api.app_data_dir.clone(),"2.6.0".into(),"desktop".into());
        let status = restarted.execute_batch(&project,&id).unwrap();
        assert_eq!(status["state"],"running"); assert!(root.join("a.md").exists());
        let snapshot = restarted.handle("GET",&format!("/api/projects/{project}/trash"),Value::Null,vec![]).unwrap();
        assert_eq!(snapshot.body["batches"][0]["id"],id);
        assert!(restarted.batch_status("alien",&id).is_err());
    }

    #[cfg(windows)]
    #[test]
    fn windows_junctions_are_not_traversed_by_tree_or_scanners() {
        let api = api(); let (project, root) = create_project(&api);
        let outside = api.app_data_dir.join("external-fixture");
        std::fs::create_dir_all(&outside).unwrap();
        std::fs::write(outside.join("external.md"),"outside").unwrap();
        let junction = root.join("linked");
        let result = Command::new("cmd").args(["/C","mklink","/J"]).arg(&junction).arg(&outside).output().unwrap();
        assert!(result.status.success(),"junction fixture could not be created");
        assert!(api.resolve_project_relative(&project,"linked/external.md").is_err());
        assert!(api.project_tree(&project).unwrap().is_empty());
        assert!(collect_project_files(&root).unwrap().is_empty());
        assert!(collect_project_sync_entries(&root).unwrap().is_empty());
        std::fs::remove_dir(junction).unwrap();
    }

    fn wait_for_research_status(
        api: &LocalApi,
        project_id: &str,
        job_id: &str,
        status: &str,
    ) -> Value {
        for _ in 0..40 {
            let job = api.ai_research_job(project_id, job_id).unwrap();
            if job["status"].as_str() == Some(status)
                && job["error"]["code"].as_str() != Some("not_found")
            {
                return job;
            }
            std::thread::sleep(std::time::Duration::from_millis(25));
        }
        api.ai_research_job(project_id, job_id).unwrap()
    }

    #[test]
    fn ai_conversation_retention_keeps_latest_events() {
        let mut events = (0..(AI_CONVERSATION_MAX_EVENTS + 5))
            .map(|index| json!({ "id": format!("event-{index}") }))
            .collect::<Vec<_>>();

        trim_ai_conversation_events(&mut events);

        assert_eq!(events.len(), AI_CONVERSATION_MAX_EVENTS);
        assert_eq!(events[0]["id"], "event-5");
        assert_eq!(
            events.last().unwrap()["id"],
            format!("event-{}", AI_CONVERSATION_MAX_EVENTS + 4)
        );
    }

    fn create_document(api: &LocalApi, project_id: &str, name: &str, markdown: &str) -> String {
        create_document_with_parent(api, project_id, "", name, markdown)
    }

    fn create_document_with_parent(
        api: &LocalApi,
        project_id: &str,
        parent_id: &str,
        name: &str,
        markdown: &str,
    ) -> String {
        let document = api.handle("POST", &format!("/api/projects/{project_id}/documents"), json!({
            "parentId": if parent_id.is_empty() { Value::Null } else { Value::from(parent_id) },
            "name": name,
            "markdown": markdown
        }), vec![]).unwrap();
        document.body["node"]["id"].as_str().unwrap().to_string()
    }

    fn authenticate_github(api: &LocalApi) {
        let _ = api.write_json(
            &api.auth_path(),
            &json!({
                "isAuthenticated": true,
                "provider": "github",
                "user": { "login": "octocat", "name": "Octocat", "avatarUrl": null },
                "scopes": ["repo"],
                "expiresAt": null
            }),
        );
        let _ = api.write_json(
            &api.credentials_path(),
            &json!({
                "github": {
                    "provider": "github",
                    "accessToken": "gho_contract_test",
                    "scopes": ["repo"],
                    "updatedAt": knownext_core::now_iso()
                }
            }),
        );
    }

    fn update_project_github_default_ref(api: &LocalApi, project_id: &str, branch: &str) {
        api.update_project_fields(project_id, |project| {
            project["githubRepository"]["defaultRef"] = Value::from(branch);
        })
        .unwrap();
    }

    fn child_id_for_path(id: &str) -> String {
        id.replace("::", "%3A%3A").replace('/', "%2F")
    }

    #[test]
    fn image_reference_uses_selection_as_context_but_respects_model_heading_placement() {
        let markdown = "# Historia\n\n## Introduccion\n\nTexto inicial.\n\n## Origenes antiguos\n\nLa cerveza nace como bebida fermentada.\n\n## Edad Media\n\nOtro apartado.";
        let reference = "![Cerveceria antigua](assets/cerveceria-antigua.png)";
        let next = insert_markdown_reference_near_focus(
            markdown,
            reference,
            Some(&json!({
                "type": "after_heading",
                "headingPath": ["Historia", "Edad Media"],
                "anchorExcerpt": null
            })),
            Some(&json!({
                "text": "La cerveza nace como bebida fermentada.",
                "nearTextBefore": "## Origenes antiguos"
            })),
        );

        assert!(next.contains("## Edad Media\n\n![Cerveceria antigua](assets/cerveceria-antigua.png)\n\nOtro apartado."));
        assert!(next.contains("La cerveza nace como bebida fermentada.\n\n## Edad Media"));
    }

    #[test]
    fn image_reference_can_follow_selected_context_when_model_chooses_selection_placement() {
        let markdown = "# Historia\r\n\r\n## Origenes antiguos\r\n\r\nParrafo seleccionado para contexto.\r\n\r\nCierre.";
        let reference = "![Mapa cervecero](assets/mapa.png)";
        let next = insert_markdown_reference_near_focus(
            markdown,
            reference,
            Some(&json!({
                "type": "after_selection",
                "headingPath": null,
                "anchorExcerpt": null
            })),
            Some(&json!({
                "text": "Parrafo seleccionado para contexto.",
                "nearTextBefore": "## Origenes antiguos"
            })),
        );

        assert_eq!(
            next,
            "# Historia\n\n## Origenes antiguos\n\nParrafo seleccionado para contexto.\n\n![Mapa cervecero](assets/mapa.png)\n\nCierre."
        );
    }

    #[test]
    fn image_reference_falls_back_to_document_end_without_reliable_placement() {
        let markdown = "# Documento\n\nContenido.";
        let reference = "![Apoyo visual](assets/apoyo.png)";
        let next = insert_markdown_reference_near_focus(
            markdown,
            reference,
            Some(&json!({
                "type": "after_heading",
                "headingPath": ["No existe"],
                "anchorExcerpt": null
            })),
            Some(&json!({ "text": "Contenido." })),
        );

        assert_eq!(
            next,
            "# Documento\n\nContenido.\n\n![Apoyo visual](assets/apoyo.png)\n"
        );
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
        assert_eq!(response.body["version"], "2.0.4");
        assert_eq!(response.body["profile"], "desktop");
        assert_eq!(response.body["endpoint"], "tauri://local-api");
    }

    #[test]
    fn project_capabilities_expose_local_git_and_github_device_flow() {
        let api = api();
        let response = api
            .handle("GET", "/api/projects/capabilities", Value::Null, vec![])
            .unwrap();

        assert_eq!(response.status, 200);
        assert_eq!(response.body["canCreateLocalProject"], true);
        assert_eq!(response.body["canOpenLocalFolder"], true);
        assert_eq!(response.body["canUseLocalGit"], true);
        assert_eq!(response.body["canConnectGithub"], true);
        assert_eq!(response.body["canUseGithubApi"], true);
        assert_eq!(response.body["requiresGithubLoginForVersioning"], false);
        assert_eq!(response.body["localGitReason"], Value::Null);
    }

    #[test]
    fn project_capabilities_do_not_confuse_an_invalid_git_folder_with_available_history() {
        let api=api();let (project,root)=create_project(&api);
        let status=api.versioning_status(&project);assert_eq!(status["available"],true);
        // Preserve the valid repository as a fixture; replace only its directory entry.
        std::fs::rename(root.join(".git"),root.join(".git-fixture-original")).unwrap();
        std::fs::create_dir(root.join(".git")).unwrap();
        let status=api.versioning_status(&project);
        assert_eq!(status["enabled"],true);assert_eq!(status["available"],false);
        assert!(status["reason"].as_str().unwrap().contains("conservan"));
    }

    #[test]
    fn git_diagnostics_reports_active_project_and_paused_github() {
        let api = api();
        let root = std::env::temp_dir().join(knownext_core::compact_id("knownext-git-diagnostics"));
        let created = api
            .handle(
                "POST",
                "/api/projects",
                json!({
                    "name": "Diagnostics docs",
                    "folderPath": root.to_string_lossy(),
                    "versioningMode": "local-git",
                    "syncMode": "auto-github",
                    "githubRepository": {
                        "owner": "knownext",
                        "repo": "docs",
                        "defaultRef": "main",
                        "permissions": ["pull"],
                        "rootPath": ""
                    }
                }),
                vec![],
            )
            .unwrap();
        let project_id = created.body["id"].as_str().unwrap();

        run_git(Command::new("git").arg("-C").arg(&root).arg("init"));

        let diagnostics = api
            .handle("GET", "/api/runtime/git", Value::Null, vec![])
            .unwrap();

        assert_eq!(diagnostics.status, 200);
        assert_eq!(diagnostics.body["projectId"], project_id);
        assert_eq!(diagnostics.body["projectName"], "Diagnostics docs");
        assert_eq!(diagnostics.body["folderExists"], true);
        assert_eq!(diagnostics.body["gitInitialized"], true);
        assert_eq!(diagnostics.body["githubConfigured"], true);
        assert_eq!(diagnostics.body["githubAuthenticated"], false);
        assert_eq!(diagnostics.body["remoteAccess"], "unauthenticated");
    }

    #[test]
    fn github_remote_errors_are_product_states() {
        let offline = classify_git_remote_error("fatal: unable to access 'https://github.com/org/repo/': Could not resolve host: github.com");
        assert_eq!(offline.access, "offline");
        assert_eq!(offline.state, "offline");

        let invalid_session = classify_git_remote_error(
            "fatal: Authentication failed for 'https://github.com/org/repo.git/'",
        );
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
        let created = api
            .handle(
                "POST",
                "/api/projects",
                json!({
                    "name": "GitHub docs",
                    "folderPath": root.to_string_lossy(),
                    "syncMode": "auto-github",
                    "githubRepository": {
                        "owner": "knownext",
                        "name": "docs",
                        "defaultBranch": "main"
                    }
                }),
                vec![],
            )
            .unwrap();
        let project_id = created.body["id"].as_str().unwrap();

        let paused = api
            .handle(
                "GET",
                &format!("/api/projects/{project_id}/sync/status"),
                Value::Null,
                vec![],
            )
            .unwrap();
        assert_eq!(paused.body["remoteAccess"], "unauthenticated");
        assert_eq!(paused.body["remotePaused"], true);
        assert_eq!(paused.body["state"], "local-history");

        let start = api
            .handle("POST", "/api/auth/github/device/start", Value::Null, vec![])
            .unwrap();
        assert_eq!(start.body["mock"], true);
        assert_eq!(start.body["status"], "error");
        assert_eq!(start.body["error"], "github_remote_not_configured");
        assert_eq!(start.body["deviceCode"], "");

        let login = api
            .handle(
                "POST",
                "/api/auth/github/device/poll",
                json!({ "deviceCode": "dev" }),
                vec![],
            )
            .unwrap();
        assert_eq!(login.body["status"], "error");
        assert_eq!(login.body["auth"]["isAuthenticated"], false);
        assert_eq!(login.body["error"], "github_remote_not_configured");

        let paused_again = api
            .handle(
                "GET",
                &format!("/api/projects/{project_id}/sync/status"),
                Value::Null,
                vec![],
            )
            .unwrap();
        assert_eq!(paused_again.body["remoteAccess"], "unauthenticated");
        assert_eq!(paused_again.body["remotePaused"], true);

        let _ = api.write_json(
            &api.auth_path(),
            &json!({
                "isAuthenticated": true,
                "provider": "github",
                "user": {
                    "login": "octocat",
                    "name": "Octocat",
                    "avatarUrl": null
                },
                "scopes": ["repo"],
                "expiresAt": null
            }),
        );

        let missing_credentials = api
            .handle(
                "GET",
                &format!("/api/projects/{project_id}/sync/status"),
                Value::Null,
                vec![],
            )
            .unwrap();
        assert_eq!(missing_credentials.body["remoteAccess"], "unauthenticated");
        assert_eq!(missing_credentials.body["remotePaused"], true);
        assert_eq!(missing_credentials.body["remoteAction"], "connect-github");
        assert_eq!(missing_credentials.body["label"], "GitHub pausado");
    }

    #[test]
    fn manual_sync_contracts_return_local_first_status_instead_of_legacy_404() {
        let api = api();
        let (project_id, _root) = create_project(&api);

        let push = api
            .handle(
                "POST",
                &format!("/api/projects/{project_id}/sync/push"),
                Value::Null,
                vec![],
            )
            .unwrap();
        let pull = api
            .handle(
                "POST",
                &format!("/api/projects/{project_id}/sync/pull"),
                Value::Null,
                vec![],
            )
            .unwrap();

        assert_eq!(push.status, 200);
        assert_eq!(pull.status, 200);
        assert_eq!(push.body["status"], "synced");
        assert_eq!(pull.body["status"], "synced");
        assert_eq!(push.body["remotePaused"], false);
        assert_eq!(pull.body["remotePaused"], false);
    }

    #[test]
    fn github_sync_pushes_and_pulls_through_configured_git_remote() {
        let _git_remote_test_lock = GIT_REMOTE_TEST_LOCK.lock().unwrap();
        let api = api();
        let root = std::env::temp_dir().join(knownext_core::compact_id("knownext-sync-local"));
        let remote =
            std::env::temp_dir().join(knownext_core::compact_id("knownext-sync-remote.git"));
        let remote_work =
            std::env::temp_dir().join(knownext_core::compact_id("knownext-sync-remote-work"));
        let created = api
            .handle(
                "POST",
                "/api/projects",
                json!({
                    "name": "Remote docs",
                    "folderPath": root.to_string_lossy(),
                    "versioningMode": "local-git",
                    "syncMode": "manual-local"
                }),
                vec![],
            )
            .unwrap();
        let project_id = created.body["id"].as_str().unwrap();

        std::fs::write(root.join("README.md"), "# Local\n").unwrap();
        git_add_path(&root, "README.md").unwrap();
        git_commit_all(&root, "Initial local version").unwrap();
        let branch = current_git_branch(&root).unwrap_or_else(|| "master".to_string());

        run_git(Command::new("git").arg("init").arg("--bare").arg(&remote));
        let connected = api
            .handle(
                "POST",
                &format!("/api/projects/{project_id}/github/connect"),
                json!({
                    "owner": "octocat",
                    "repo": "remote-docs",
                    "defaultRef": branch,
                    "rootPath": "",
                    "syncMode": "manual-github"
                }),
                vec![],
            )
            .unwrap();
        assert_eq!(connected.status, 200);
        run_git(
            Command::new("git")
                .arg("-C")
                .arg(&root)
                .args(["remote", "set-url", "origin"])
                .arg(&remote),
        );
        let _ = api.write_json(
            &api.auth_path(),
            &json!({
                "isAuthenticated": true,
                "provider": "github",
                "user": { "login": "octocat", "name": "Octocat", "avatarUrl": null },
                "scopes": ["repo"],
                "expiresAt": null
            }),
        );
        let _ = api.write_json(
            &api.credentials_path(),
            &json!({
                "github": {
                    "provider": "github",
                    "accessToken": "gho_contract_test",
                    "scopes": ["repo"],
                    "updatedAt": knownext_core::now_iso()
                }
            }),
        );

        let push = api
            .handle(
                "POST",
                &format!("/api/projects/{project_id}/sync/push"),
                Value::Null,
                vec![],
            )
            .unwrap();
        assert_eq!(push.body["status"], "synced");
        assert_eq!(push.body["message"], "Historial local subido a GitHub.");
        assert!(git_head_hash(&root).unwrap().is_some());

        run_git(
            Command::new("git")
                .arg("clone")
                .arg("--branch")
                .arg(&branch)
                .arg(&remote)
                .arg(&remote_work),
        );
        std::fs::write(remote_work.join("remote.md"), "# Remoto\n").unwrap();
        run_git(
            Command::new("git")
                .arg("-C")
                .arg(&remote_work)
                .args(["add", "remote.md"]),
        );
        run_git(Command::new("git").arg("-C").arg(&remote_work).args([
            "-c",
            "user.name=Remote",
            "-c",
            "user.email=remote@example.test",
            "commit",
            "-m",
            "Remote version",
        ]));
        run_git(
            Command::new("git")
                .arg("-C")
                .arg(&remote_work)
                .args(["push", "origin"])
                .arg(&branch),
        );

        let pull = api
            .handle(
                "POST",
                &format!("/api/projects/{project_id}/sync/pull"),
                Value::Null,
                vec![],
            )
            .unwrap();
        assert_eq!(pull.body["status"], "synced");
        assert_eq!(pull.body["message"], "Proyecto actualizado desde GitHub.");
        assert_eq!(
            normalize_markdown(&std::fs::read_to_string(root.join("remote.md")).unwrap()),
            "# Remoto"
        );
    }

    #[test]
    fn auto_run_pushes_local_versions_when_remote_is_clear() {
        let _git_remote_test_lock = GIT_REMOTE_TEST_LOCK.lock().unwrap();
        let api = api();
        let root = std::env::temp_dir().join(knownext_core::compact_id("knownext-auto-local"));
        let remote =
            std::env::temp_dir().join(knownext_core::compact_id("knownext-auto-remote.git"));
        let created = api
            .handle(
                "POST",
                "/api/projects",
                json!({
                    "name": "Auto docs",
                    "folderPath": root.to_string_lossy(),
                    "versioningMode": "local-git",
                    "syncMode": "auto-github",
                    "githubRepository": {
                        "owner": "octocat",
                        "repo": "auto-docs",
                        "defaultRef": "master",
                        "rootPath": "",
                        "permissions": ["pull", "push"]
                    }
                }),
                vec![],
            )
            .unwrap();
        let project_id = created.body["id"].as_str().unwrap();
        std::fs::write(root.join("plan.md"), "# Plan\n").unwrap();
        git_commit_paths(&root, "Initial local version", &["plan.md"]).unwrap();
        let branch = current_git_branch(&root).unwrap_or_else(|| "master".to_string());
        update_project_github_default_ref(&api, project_id, &branch);
        run_git(Command::new("git").arg("init").arg("--bare").arg(&remote));
        run_git(
            Command::new("git")
                .arg("-C")
                .arg(&root)
                .args(["remote", "set-url", "origin"])
                .arg(&remote),
        );
        authenticate_github(&api);

        let result = api
            .handle(
                "POST",
                &format!("/api/projects/{project_id}/sync/auto-run"),
                Value::Null,
                vec![],
            )
            .unwrap();

        assert_eq!(result.body["pendingPush"], false);
        assert_eq!(result.body["pendingPull"], false);
        assert_eq!(result.body["detail"], "Versiones locales subidas a GitHub.");
        let remote_hash = run_local_git(Command::new("git").arg("--git-dir").arg(&remote).args([
            "rev-parse",
            "--short=8",
            &branch,
        ]))
        .unwrap();
        assert!(remote_hash.status.success());
    }

    #[test]
    fn auto_run_pauses_when_remote_has_versions_to_review() {
        let _git_remote_test_lock = GIT_REMOTE_TEST_LOCK.lock().unwrap();
        let api = api();
        let root =
            std::env::temp_dir().join(knownext_core::compact_id("knownext-auto-remote-ahead"));
        let remote =
            std::env::temp_dir().join(knownext_core::compact_id("knownext-auto-remote-ahead.git"));
        let remote_work =
            std::env::temp_dir().join(knownext_core::compact_id("knownext-auto-remote-work"));
        let created = api
            .handle(
                "POST",
                "/api/projects",
                json!({
                    "name": "Auto docs",
                    "folderPath": root.to_string_lossy(),
                    "versioningMode": "local-git",
                    "syncMode": "auto-github",
                    "githubRepository": {
                        "owner": "octocat",
                        "repo": "auto-docs",
                        "defaultRef": "master",
                        "rootPath": "",
                        "permissions": ["pull", "push"]
                    }
                }),
                vec![],
            )
            .unwrap();
        let project_id = created.body["id"].as_str().unwrap();
        std::fs::write(root.join("plan.md"), "# Plan\n").unwrap();
        git_commit_paths(&root, "Initial local version", &["plan.md"]).unwrap();
        let branch = current_git_branch(&root).unwrap_or_else(|| "master".to_string());
        update_project_github_default_ref(&api, project_id, &branch);
        run_git(Command::new("git").arg("init").arg("--bare").arg(&remote));
        run_git(
            Command::new("git")
                .arg("-C")
                .arg(&root)
                .args(["remote", "set-url", "origin"])
                .arg(&remote),
        );
        authenticate_github(&api);
        assert_eq!(
            api.handle(
                "POST",
                &format!("/api/projects/{project_id}/sync/push"),
                Value::Null,
                vec![],
            )
            .unwrap()
            .body["status"],
            "synced"
        );
        run_git(
            Command::new("git")
                .arg("clone")
                .arg("--branch")
                .arg(&branch)
                .arg(&remote)
                .arg(&remote_work),
        );
        std::fs::write(remote_work.join("remote.md"), "# Remoto\n").unwrap();
        run_git(
            Command::new("git")
                .arg("-C")
                .arg(&remote_work)
                .args(["add", "remote.md"]),
        );
        run_git(Command::new("git").arg("-C").arg(&remote_work).args([
            "-c",
            "user.name=Remote",
            "-c",
            "user.email=remote@example.test",
            "commit",
            "-m",
            "Remote version",
        ]));
        run_git(
            Command::new("git")
                .arg("-C")
                .arg(&remote_work)
                .args(["push", "origin"])
                .arg(&branch),
        );

        let result = api
            .handle(
                "POST",
                &format!("/api/projects/{project_id}/sync/auto-run"),
                Value::Null,
                vec![],
            )
            .unwrap();

        assert_eq!(result.body["state"], "remote-available");
        assert_eq!(result.body["pendingPull"], true);
        assert_eq!(result.body["remoteAheadPaths"][0], "remote.md");
        assert!(!root.join("remote.md").exists());
    }

    #[test]
    fn auto_run_reports_diverged_history_without_pushing() {
        let _git_remote_test_lock = GIT_REMOTE_TEST_LOCK.lock().unwrap();
        let api = api();
        let root = std::env::temp_dir().join(knownext_core::compact_id("knownext-auto-diverged"));
        let remote =
            std::env::temp_dir().join(knownext_core::compact_id("knownext-auto-diverged.git"));
        let remote_work =
            std::env::temp_dir().join(knownext_core::compact_id("knownext-auto-diverged-work"));
        let created = api
            .handle(
                "POST",
                "/api/projects",
                json!({
                    "name": "Auto docs",
                    "folderPath": root.to_string_lossy(),
                    "versioningMode": "local-git",
                    "syncMode": "auto-github",
                    "githubRepository": {
                        "owner": "octocat",
                        "repo": "auto-docs",
                        "defaultRef": "master",
                        "rootPath": "",
                        "permissions": ["pull", "push"]
                    }
                }),
                vec![],
            )
            .unwrap();
        let project_id = created.body["id"].as_str().unwrap();
        std::fs::write(root.join("plan.md"), "# Plan\n").unwrap();
        git_commit_paths(&root, "Initial local version", &["plan.md"]).unwrap();
        let branch = current_git_branch(&root).unwrap_or_else(|| "master".to_string());
        update_project_github_default_ref(&api, project_id, &branch);
        run_git(Command::new("git").arg("init").arg("--bare").arg(&remote));
        run_git(
            Command::new("git")
                .arg("-C")
                .arg(&root)
                .args(["remote", "set-url", "origin"])
                .arg(&remote),
        );
        authenticate_github(&api);
        let _ = api.handle(
            "POST",
            &format!("/api/projects/{project_id}/sync/push"),
            Value::Null,
            vec![],
        );
        run_git(
            Command::new("git")
                .arg("clone")
                .arg("--branch")
                .arg(&branch)
                .arg(&remote)
                .arg(&remote_work),
        );
        std::fs::write(root.join("local.md"), "# Local\n").unwrap();
        git_commit_paths(&root, "Local version", &["local.md"]).unwrap();
        std::fs::write(remote_work.join("remote.md"), "# Remoto\n").unwrap();
        run_git(
            Command::new("git")
                .arg("-C")
                .arg(&remote_work)
                .args(["add", "remote.md"]),
        );
        run_git(Command::new("git").arg("-C").arg(&remote_work).args([
            "-c",
            "user.name=Remote",
            "-c",
            "user.email=remote@example.test",
            "commit",
            "-m",
            "Remote version",
        ]));
        run_git(
            Command::new("git")
                .arg("-C")
                .arg(&remote_work)
                .args(["push", "origin"])
                .arg(&branch),
        );

        let result = api
            .handle(
                "POST",
                &format!("/api/projects/{project_id}/sync/auto-run"),
                Value::Null,
                vec![],
            )
            .unwrap();

        assert_eq!(result.body["state"], "conflict");
        assert_eq!(result.body["diverged"], true);
        assert_eq!(result.body["pendingPush"], true);
        assert_eq!(result.body["pendingPull"], true);
    }

    #[test]
    fn project_history_and_github_connection_contracts_update_project_registry() {
        let api = api();
        let (project_id, _root) = create_project(&api);

        let history = api
            .handle(
                "POST",
                &format!("/api/projects/{project_id}/history/enable"),
                Value::Null,
                vec![],
            )
            .unwrap();
        assert_eq!(history.status, 200);

        let after_history = api
            .handle("GET", "/api/projects", Value::Null, vec![])
            .unwrap();
        assert_eq!(after_history.body[0]["versioningMode"], "local-git");
        assert_eq!(after_history.body[0]["syncMode"], "manual-local");

        let connected = api
            .handle(
                "POST",
                &format!("/api/projects/{project_id}/github/connect"),
                json!({
                    "owner": "octocat",
                    "repo": "docs",
                    "defaultRef": "main",
                    "rootPath": "docs",
                    "syncMode": "auto-github"
                }),
                vec![],
            )
            .unwrap();
        assert_eq!(connected.status, 200);
        assert_eq!(connected.body["remotePaused"], true);

        let projects = api
            .handle("GET", "/api/projects", Value::Null, vec![])
            .unwrap();
        assert_eq!(projects.body[0]["syncMode"], "auto-github");
        assert_eq!(projects.body[0]["githubRepository"]["owner"], "octocat");
        assert_eq!(projects.body[0]["githubRepository"]["repo"], "docs");
        assert_eq!(projects.body[0]["githubRepository"]["defaultRef"], "main");
        assert_eq!(projects.body[0]["githubRepository"]["rootPath"], "docs");

        let mode = api
            .handle(
                "PUT",
                &format!("/api/projects/{project_id}/sync-mode"),
                json!({
                    "syncMode": "manual-github"
                }),
                vec![],
            )
            .unwrap();
        assert_eq!(mode.body["mode"], "github-manual");
        assert_eq!(mode.body["state"], "local-history");
        let after_mode = api
            .handle("GET", "/api/projects", Value::Null, vec![])
            .unwrap();
        assert_eq!(after_mode.body[0]["syncMode"], "manual-github");
    }

    #[test]
    fn old_github_versioning_projects_are_returned_as_local_git_projects() {
        let api = api();
        let root = std::env::temp_dir().join(knownext_core::compact_id("knownext-old-github-mode"));
        std::fs::create_dir_all(&root).unwrap();
        ensure_git_repo(&root).unwrap();
        api.write_json(
            &api.registry_path(),
            &json!({
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
            }),
        )
        .unwrap();

        let projects = api
            .handle("GET", "/api/projects", Value::Null, vec![])
            .unwrap();
        assert_eq!(projects.body[0]["versioningMode"], "local-git");
        assert_eq!(projects.body[0]["storageMode"], "local-files");

        let active = api
            .handle("GET", "/api/projects/active", Value::Null, vec![])
            .unwrap();
        assert_eq!(active.body["versioningMode"], "local-git");
        assert_eq!(active.body["storageMode"], "local-files");

        let updated = api
            .handle(
                "PUT",
                "/api/projects/project-old-github",
                json!({
                    "name": "Normalized GitHub docs"
                }),
                vec![],
            )
            .unwrap();
        assert_eq!(updated.body["versioningMode"], "local-git");
        assert_eq!(updated.body["storageMode"], "local-files");
    }

    #[test]
    fn document_references_use_saved_files_preserve_scope_and_report_missing_targets() {
        let api=api();let (project,root)=create_project(&api);
        let a=create_document(&api,&project,"a.md","[B](b.md#part) [Missing](missing.md) [External](https://example.test/x)\n");
        create_document(&api,&project,"b.md","# B\n");
        create_document(&api,&project,"c.md","[A](a.md?q=1#part)\n\n`[example](a.md)`\n");
        api.save_draft(&a,json!({"markdown":"[Draft-only](private.md)"})).unwrap();
        let response=api.handle("GET",&format!("/api/documents/{a}/links"),Value::Null,vec![]).unwrap();
        let result=response.body;
        assert_eq!(result["scope"],"saved-markdown");assert_eq!(result["complete"],true);
        assert_eq!(result["outgoing"].as_array().unwrap().len(),2);
        assert_eq!(result["outgoing"][0]["target"]["path"],"b.md");
        assert_eq!(result["outgoing"][0]["target"]["status"],"available");
        assert_eq!(result["outgoing"][1]["target"]["status"],"missing");
        assert_eq!(result["incoming"].as_array().unwrap().len(),1);
        assert_eq!(result["incoming"][0]["target"]["path"],"c.md");
        assert_eq!(result["incoming"][0]["rawTarget"],"a.md?q=1#part");
        std::fs::write(root.join("bad.md"),[0xff]).unwrap();
        let partial=api.document_references(&a).unwrap();
        assert_eq!(partial["complete"],false);assert!(!partial["warnings"].as_array().unwrap().is_empty());
        assert!(LocalApi::is_independent_snapshot("GET",&format!("/api/documents/{a}/links")));
        assert!(!LocalApi::is_independent_snapshot("PUT",&format!("/api/documents/{a}/links")));
    }

    #[test]
    fn document_references_report_source_limits_and_keep_readable_incoming_links() {
        let api=api();let (project,root)=create_project(&api);
        let id=create_document(&api,&project,"large.md","# Large\n");
        create_document(&api,&project,"mention.md","[Large](large.md)\n");
        std::fs::write(root.join("large.md"),"x".repeat(2*1024*1024+1)).unwrap();
        let result=api.document_references(&id).unwrap();
        assert_eq!(result["sourceRead"],false);assert_eq!(result["complete"],false);
        assert_eq!(result["incoming"][0]["target"]["path"],"mention.md");
        assert!(!result["warnings"].as_array().unwrap().is_empty());
    }

    #[cfg(windows)]
    #[test]
    fn document_references_resolve_actual_file_case_for_incoming_links() {
        let api=api();let (project,_)=create_project(&api);
        let id=create_document(&api,&project,"Plan.md","# Plan\n");
        create_document(&api,&project,"mentions.md","[Plan](PLAN.MD)\n");
        let result=api.document_references(&id).unwrap();
        assert_eq!(result["incoming"][0]["target"]["path"],"mentions.md");
    }

    #[test]
    fn moved_references_keep_partial_snapshots_when_a_later_file_cannot_be_rewritten() {
        let api=api();let (project,root)=create_project(&api);
        std::fs::create_dir(root.join("folder")).unwrap();
        let source=create_document(&api,&project,"a.md","[Target](target.md)\n");
        create_document(&api,&project,"target.md","# Target\n");
        let broken=create_document(&api,&project,"z.md","[Source](a.md)\n");
        std::fs::create_dir_all(api.app_data_dir.join("drafts")).unwrap();
        std::fs::write(draft_store::path(&api.app_data_dir.join("drafts"),&broken),b"invalid JSON").unwrap();
        let result=api.move_node(&project,&source,json!({"targetFolderId":format!("{project}::folder")})).unwrap();
        assert_eq!(result["referencesPending"],true);
        assert!(!result["warnings"].as_array().unwrap().is_empty());
        assert!(root.join("folder/a.md").exists());
        let affected=result["affectedDocuments"].as_array().unwrap().iter().find(|item|item["oldId"]==source).unwrap();
        // The traversal's ordering may meet the unreadable file first; any applied rewrite must carry its snapshot.
        if std::fs::read_to_string(root.join("folder/a.md")).unwrap().contains("../target.md") {
            assert!(affected["document"]["markdown"].as_str().unwrap().contains("../target.md"));
        }
        assert_eq!(std::fs::read(draft_store::path(&api.app_data_dir.join("drafts"),&broken)).unwrap(),b"invalid JSON");
        assert!(api.rename_node(&project,&format!("{project}::folder/a.md"),json!({"name":"a.txt"})).is_err());
    }

    #[test]
    fn moved_references_update_disk_drafts_and_session_snapshots_without_advancing_stale_bases() {
        let api=api();let (project,root)=create_project(&api);
        std::fs::create_dir(root.join("folder")).unwrap();
        create_document(&api,&project,"target.md","# Target\n");
        let id=create_document(&api,&project,"source.md","[Target](target.md#part)\n");
        let pending="[Target](target.md#part)\n\nPending work\n";
        api.save_draft(&id,json!({"markdown":pending})).unwrap();
        let other=create_document(&api,&project,"other.md","[Source](source.md?q=1#part)\n");
        api.save_draft(&other,json!({"markdown":"[Source](source.md?q=1#part)\n\nMore work\n"})).unwrap();
        let result=api.move_node(&project,&id,json!({"targetFolderId":format!("{project}::folder")})).unwrap();
        assert_eq!(result["referencesPending"],false);
        let new=format!("{project}::folder/source.md");
        let record=api.get_document(&new).unwrap();
        assert_eq!(record["diskMarkdown"],"[Target](../target.md#part)\n");
        assert_eq!(record["markdown"],"[Target](../target.md#part)\n\nPending work\n");
        assert_eq!(record["diskChanged"],false);assert_eq!(record["hasDraft"],true);
        assert!(!api.save_base_changed(&new,&json!({"baseFingerprint":record["baseFingerprint"]})).unwrap());
        let affected=result["affectedDocuments"].as_array().unwrap().iter().find(|item|item["oldId"]==id).unwrap();
        assert_eq!(affected["previousMarkdown"],pending);assert_eq!(affected["document"]["markdown"],record["markdown"]);
        let other_record=api.get_document(&other).unwrap();
        assert!(other_record["markdown"].as_str().unwrap().contains("folder/source.md?q=1#part"));
        assert_eq!(other_record["diskChanged"],false);
        let stale=create_document(&api,&project,"stale.md","[Target](target.md)\n");
        api.save_draft(&stale,json!({"markdown":"[Target](target.md)\n\nLocal\n"})).unwrap();
        let original=api.read_draft(&stale).unwrap().unwrap()["baseFingerprint"].clone();
        std::fs::write(root.join("stale.md"),"[Target](target.md)\n\nExternal\n").unwrap();
        api.move_node(&project,&stale,json!({"targetFolderId":format!("{project}::folder")})).unwrap();
        let stale_new=format!("{project}::folder/stale.md");
        let record=api.get_document(&stale_new).unwrap();
        assert_eq!(record["baseFingerprint"],original);assert_eq!(record["diskChanged"],true);
        assert!(record["markdown"].as_str().unwrap().contains("../target.md"));
    }

    #[test]
    fn moved_drafts_follow_markdown_and_keep_the_original_base() {
        let api=api(); let (project,root)=create_project(&api);
        std::fs::create_dir(root.join("target")).unwrap();
        let old=create_document(&api,&project,"draft.md","# Saved\n");
        let base=api.get_document(&old).unwrap()["baseFingerprint"].clone();
        api.save_draft(&old,json!({"markdown":"# Pending\n","baseFingerprint":base})).unwrap();
        api.move_node(&project,&old,json!({"targetFolderId":format!("{project}::target")})).unwrap();
        let new=format!("{project}::target/draft.md");
        let record=api.get_document(&new).unwrap();
        assert_eq!(record["markdown"],"# Pending\n");
        assert_eq!(record["diskMarkdown"],"# Saved\n");
        assert_eq!(record["baseFingerprint"],base);
        assert_eq!(record["diskChanged"],false);
        assert!(api.read_draft(&old).unwrap().is_none());
        assert_eq!(api.read_draft(&new).unwrap().unwrap()["documentId"],new);
        assert!(!api.save_base_changed(&new,&json!({"baseFingerprint":base})).unwrap());
    }

    #[test]
    fn moved_drafts_reject_recovery_collisions_before_any_batch_mutation() {
        let api=api(); let (project,root)=create_project(&api);
        std::fs::create_dir(root.join("target")).unwrap();
        let a=create_document(&api,&project,"a.md","# A\n");
        let b=create_document(&api,&project,"b.md","# B\n");
        let occupied=format!("{project}::target/b.md");
        api.save_draft(&occupied,json!({"markdown":"# Orphaned target\n"})).unwrap();
        let plan=api.prepare_batch(&project,json!({"action":"move","nodeIds":[a,b],"targetFolderId":format!("{project}::target")})).unwrap();
        assert!(api.execute_batch(&project,plan["id"].as_str().unwrap()).is_err());
        assert!(root.join("a.md").exists() && root.join("b.md").exists());
        assert!(!root.join("target/a.md").exists());
        assert_eq!(api.read_draft(&occupied).unwrap().unwrap()["markdown"],"# Orphaned target\n");
    }

    #[test]
    fn moved_drafts_preserve_stale_bases_and_handwritten_content() {
        let api=api(); let (project,root)=create_project(&api);
        let id=create_document(&api,&project,"stale.md","# Original\n");
        let base=api.get_document(&id).unwrap()["baseFingerprint"].clone();
        api.save_draft(&id,json!({"markdown":"# Local\n","baseFingerprint":base})).unwrap();
        std::fs::write(root.join("stale.md"),"# External\n").unwrap();
        api.rename_node(&project,&id,json!({"name":"renamed.md"})).unwrap();
        let renamed=format!("{project}::renamed.md");
        let record=api.get_document(&renamed).unwrap();
        assert_eq!(record["baseFingerprint"],base);assert_eq!(record["diskChanged"],true);
        assert_eq!(record["markdown"],"# Local\n");
        let created=api.create_handwritten_note(&project,json!({"name":"Sketch.knote"})).unwrap();
        let note=created["node"]["id"].as_str().unwrap();
        let record=api.get_handwritten_note(note).unwrap();
        let mut content=record["content"].clone();content["title"]=json!("Pending ink");
        api.save_handwritten_note_draft(note,json!({"content":content,"baseFingerprint":record["baseFingerprint"]})).unwrap();
        api.rename_node(&project,note,json!({"name":"Renamed.knote"})).unwrap();
        let new=format!("{project}::Renamed.knote");
        let record=api.get_handwritten_note(&new).unwrap();
        assert_eq!(record["content"]["title"],"Pending ink");
        assert_eq!(record["hasDraft"],true);assert_eq!(record["diskChanged"],false);
        assert!(api.read_draft(note).unwrap().is_none());
    }

    #[cfg(windows)]
    #[test]
    fn moved_drafts_report_a_cleanup_failure_without_hiding_the_physical_move() {
        let api=api();let (project,root)=create_project(&api);
        let old=create_document(&api,&project,"before.md","# Saved\n");
        api.save_draft(&old,json!({"markdown":"# Pending\n"})).unwrap();
        let old_path=draft_store::path(&api.app_data_dir.join("drafts"),&old);
        let mut permissions=std::fs::metadata(&old_path).unwrap().permissions();permissions.set_readonly(true);
        std::fs::set_permissions(&old_path,permissions).unwrap();
        let result=api.rename_node(&project,&old,json!({"name":"after.md"})).unwrap();
        assert!(root.join("after.md").exists());assert!(!root.join("before.md").exists());
        assert_eq!(result["recoveryPending"],true);assert!(!result["warnings"].as_array().unwrap().is_empty());
        let new=format!("{project}::after.md");
        assert_eq!(api.get_document(&new).unwrap()["markdown"],"# Pending\n");
        assert!(api.read_draft(&old).unwrap().is_some());
        let mut permissions=std::fs::metadata(&old_path).unwrap().permissions();permissions.set_readonly(false);
        std::fs::set_permissions(&old_path,permissions).unwrap();
    }

    #[test]
    fn version_history_never_includes_unsaved_drafts() {
        let api = api();
        let (project, _) = create_project(&api);
        let id = create_document(&api, &project, "saved.md", "# Saved\n");
        api.save_draft(&id, json!({"markdown":"# Not committed\n"})).unwrap();
        let version = api.create_version(&project, json!({"documentId":id,"title":"Saved snapshot"})).unwrap();
        let content = api.version_content(&id, version["version"]["id"].as_str().unwrap()).unwrap();
        assert_eq!(content["markdown"], "# Saved\n");
        assert_eq!(api.get_document(&id).unwrap()["markdown"], "# Not committed\n");
    }

    #[test]
    fn version_history_does_not_mix_similar_file_names() {
        let api = api();
        let (project, _) = create_project(&api);
        let a = create_document(&api, &project, "a-b.md", "# First\n");
        let b = create_document(&api, &project, "a_b.md", "# Second\n");
        let version = api.create_version(&project, json!({"documentId":a,"title":"First"})).unwrap();
        assert!(api.version_content(&b, version["version"]["id"].as_str().unwrap()).is_err());
    }

    #[test]
    fn version_history_uses_git_after_external_commits_and_renames() {
        let api = api();
        let (project, root) = create_project(&api);
        let before = create_document(&api, &project, "before.md", "# Before\n");
        let first = api.create_version(&project, json!({"documentId":before,"title":"First"})).unwrap();
        std::fs::rename(root.join("before.md"), root.join("after.md")).unwrap();
        git_commit_paths(&root,"Rename", &["before.md","after.md"]).unwrap();
        std::fs::write(root.join("after.md"),"# After\n").unwrap();
        git_commit_paths(&root,"External update", &["after.md"]).unwrap();
        let after = format!("{project}::after.md");
        let history = api.list_versions(&after).unwrap();
        assert_eq!(history.len(),3);
        assert_eq!(history[0]["title"],"External update");
        assert_eq!(history[0]["current"],true);
        assert_eq!(history[1]["current"],false);
        assert_eq!(api.version_content(&after,first["version"]["id"].as_str().unwrap()).unwrap()["markdown"],"# Before\n");
        let repeated=api.create_version(&project,json!({"documentId":after,"title":"No change"})).unwrap();
        assert_eq!(repeated["version"]["id"],history[0]["id"]);
        assert_eq!(api.list_versions(&after).unwrap().len(),3);
    }

    #[test]
    fn version_history_rejects_a_document_from_another_project_before_committing() {
        let api = api();
        let (project, root) = create_project(&api);
        let (other, _) = create_project(&api);
        let id = create_document(&api,&project,"owned.md","# Owned\n");
        assert!(api.create_version(&other,json!({"documentId":id})).is_err());
        assert!(git_head_hash(&root).unwrap().is_none());
    }

    #[test]
    fn version_history_commits_handwritten_notes_without_reading_them_as_markdown() {
        let api=api();
        let (project, root)=create_project(&api);
        api.create_handwritten_note(&project,json!({"name":"Sketch.knote"})).unwrap();
        let id=format!("{project}::Sketch.knote");
        let created=api.create_version(&project,json!({"documentId":id,"title":"Sketch saved"})).unwrap();
        assert_eq!(created["version"]["hash"],git_head_hash(&root).unwrap().unwrap());
        assert!(git_status_items(&root).unwrap().is_empty());
    }

    #[test]
    fn version_history_restore_rejects_external_changes_and_reports_a_committed_file_when_git_fails() {
        let api=api();
        let (project,root)=create_project(&api);
        let id=create_document(&api,&project,"restore.md","# Historical\n");
        let version=api.create_version(&project,json!({"documentId":id})).unwrap();
        let version_id=version["version"]["id"].as_str().unwrap();
        let base=api.fingerprint(&root.join("restore.md"));
        std::fs::write(root.join("restore.md"),"# External\n").unwrap();
        let route=format!("/api/documents/{id}/versions/{version_id}/restore");
        let rejected=api.handle("POST",&route,json!({"baseFingerprint":base}),vec![]).unwrap();
        assert_eq!(rejected.status,409);
        assert_eq!(std::fs::read_to_string(root.join("restore.md")).unwrap(),"# External\n");
        assert_eq!(api.handle("POST",&route,Value::Null,vec![]).unwrap().status,400);
        let base=api.fingerprint(&root.join("restore.md"));
        std::fs::write(root.join(".git/index.lock"),"QA lock").unwrap();
        let restored=api.handle("POST",&route,json!({"baseFingerprint":base}),vec![]).unwrap();
        assert_eq!(restored.status,200);
        assert_eq!(restored.body["savedDocument"]["markdown"],"# Historical\n");
        assert_eq!(restored.body["version"],Value::Null);
        assert!(restored.body["historyWarning"].is_string());
        assert_eq!(std::fs::read_to_string(root.join("restore.md")).unwrap(),"# Historical\n");
        std::fs::remove_file(root.join(".git/index.lock")).unwrap();
    }

    #[test]
    fn creating_project_version_commits_document_changes_to_local_git() {
        let api = api();
        let (project_id, root) = create_project(&api);
        let document_id = create_document(&api, &project_id, "plan.md", "# Plan\n");

        let first_version = api
            .handle(
                "POST",
                &format!("/api/projects/{project_id}/versions"),
                json!({
                    "documentId": document_id,
                    "title": "Version inicial"
                }),
                vec![],
            )
            .unwrap();
        let first_hash = git_head_hash(&root).unwrap().unwrap();
        assert_eq!(first_version.body["version"]["hash"], first_hash);
        assert!(git_status_items(&root).unwrap().is_empty());

        let encoded_document_id = child_id_for_path(&document_id);
        let _saved = api
            .handle(
                "PUT",
                &format!("/api/documents/{encoded_document_id}"),
                json!({
                    "markdown": "# Plan\n\nActualizado.\n"
                }),
                vec![],
            )
            .unwrap();
        assert!(!git_status_items(&root).unwrap().is_empty());

        let second_version = api
            .handle(
                "POST",
                &format!("/api/projects/{project_id}/versions"),
                json!({
                    "documentId": document_id,
                    "title": "Actualiza plan.md"
                }),
                vec![],
            )
            .unwrap();
        let second_hash = git_head_hash(&root).unwrap().unwrap();
        assert_ne!(first_hash, second_hash);
        assert_eq!(second_version.body["version"]["hash"], second_hash);
        assert!(git_status_items(&root).unwrap().is_empty());
    }

    #[test]
    fn creating_project_version_commits_only_the_document_path() {
        let api = api();
        let (project_id, root) = create_project(&api);
        let document_id = create_document(&api, &project_id, "plan.md", "# Plan\n");
        std::fs::write(root.join("other.md"), "# Otro\n").unwrap();
        git_add_path(&root, "other.md").unwrap();

        let _version = api
            .handle(
                "POST",
                &format!("/api/projects/{project_id}/versions"),
                json!({
                    "documentId": document_id,
                    "title": "Version plan"
                }),
                vec![],
            )
            .unwrap();

        let output = run_local_git(Command::new("git").arg("-C").arg(&root).args([
            "diff-tree",
            "--root",
            "--no-commit-id",
            "--name-only",
            "-r",
            "HEAD",
        ]))
        .unwrap();
        assert!(output.status.success());
        let files = String::from_utf8_lossy(&output.stdout);
        assert!(files.lines().any(|line| line == "plan.md"));
        assert!(!files.lines().any(|line| line == "other.md"));
        assert!(git_status_items(&root)
            .unwrap()
            .iter()
            .any(|item| item["path"] == "other.md"));
    }

    #[test]
    fn restoring_version_creates_new_version_for_only_active_document() {
        let api = api();
        let (project_id, root) = create_project(&api);
        let document_id = create_document(&api, &project_id, "plan.md", "# Plan v1\n");
        std::fs::write(root.join("related.md"), "# Relacionado v1\n").unwrap();
        git_commit_paths(
            &root,
            "Initial multi file version",
            &["plan.md", "related.md"],
        )
        .unwrap();
        let first = api
            .handle(
                "POST",
                &format!("/api/projects/{project_id}/versions"),
                json!({
                    "documentId": document_id,
                    "title": "Version inicial"
                }),
                vec![],
            )
            .unwrap();
        let first_version_id = first.body["version"]["id"].as_str().unwrap().to_string();

        let encoded_document_id = child_id_for_path(&document_id);
        let _ = api.handle(
            "PUT",
            &format!("/api/documents/{encoded_document_id}"),
            json!({ "markdown": "# Plan v2\n" }),
            vec![],
        );
        std::fs::write(root.join("related.md"), "# Relacionado v2\n").unwrap();
        git_commit_paths(
            &root,
            "Second multi file version",
            &["plan.md", "related.md"],
        )
        .unwrap();

        let restored = api
            .handle(
                "POST",
                &format!(
                    "/api/documents/{encoded_document_id}/versions/{first_version_id}/restore"
                ),
                json!({"baseFingerprint":api.fingerprint(&root.join("plan.md"))}),
                vec![],
            )
            .unwrap();

        assert_eq!(restored.status, 200);
        assert_eq!(
            normalize_markdown(&std::fs::read_to_string(root.join("plan.md")).unwrap()),
            "# Plan v1"
        );
        assert_eq!(
            normalize_markdown(&std::fs::read_to_string(root.join("related.md")).unwrap()),
            "# Relacionado v2"
        );
        assert!(restored.body["version"]["title"]
            .as_str()
            .unwrap()
            .starts_with("Restaura plan.md desde"));
    }

    #[test]
    fn file_sync_overview_reports_clean_local_history_files() {
        let api = api();
        let (project_id, root) = create_project(&api);
        create_document(&api, &project_id, "plan.md", "# Plan\n");
        std::fs::create_dir_all(root.join("assets")).unwrap();
        api.handle(
            "POST",
            &format!("/api/projects/{project_id}/history/enable"),
            Value::Null,
            vec![],
        )
        .unwrap();
        git_add_path(&root, "plan.md").unwrap();
        git_commit_all(&root, "Baseline").unwrap();

        let overview = api
            .handle(
                "GET",
                &format!("/api/projects/{project_id}/file-sync-overview"),
                Value::Null,
                vec![],
            )
            .unwrap();

        assert_eq!(overview.status, 200);
        assert_eq!(overview.body["summary"]["total"], 2);
        assert_eq!(overview.body["summary"]["historyPending"], 0);
        let files = overview.body["files"].as_array().unwrap();
        let folder = files
            .iter()
            .find(|file| file["path"].as_str() == Some("assets"))
            .unwrap();
        let plan = files
            .iter()
            .find(|file| file["path"].as_str() == Some("plan.md"))
            .unwrap();
        assert_eq!(folder["kind"], "folder");
        assert_eq!(folder["localStatus"]["state"], "ok");
        assert_eq!(plan["localStatus"]["state"], "ok");
        assert_eq!(plan["historyStatus"]["state"], "ok");
        assert_eq!(plan["githubStatus"]["state"], "unavailable");
        assert!(plan["modifiedAt"].as_str().is_some());
    }

    #[test]
    fn file_sync_overview_reports_modified_and_omitted_git_items() {
        let api = api();
        let (project_id, root) = create_project(&api);
        create_document(&api, &project_id, "plan.md", "# Plan\n");
        api.handle(
            "POST",
            &format!("/api/projects/{project_id}/history/enable"),
            Value::Null,
            vec![],
        )
        .unwrap();
        git_add_path(&root, "plan.md").unwrap();
        git_commit_all(&root, "Baseline").unwrap();
        std::fs::write(root.join("plan.md"), "# Plan editado\n").unwrap();
        std::fs::write(root.join(".env"), "SECRET=value\n").unwrap();

        let overview = api
            .handle(
                "GET",
                &format!("/api/projects/{project_id}/file-sync-overview"),
                Value::Null,
                vec![],
            )
            .unwrap();
        let files = overview.body["files"].as_array().unwrap();
        let plan = files
            .iter()
            .find(|file| file["path"].as_str() == Some("plan.md"))
            .unwrap();
        let env = files
            .iter()
            .find(|file| file["path"].as_str() == Some(".env"))
            .unwrap();

        assert_eq!(overview.body["summary"]["historyPending"], 1);
        assert_eq!(overview.body["summary"]["omitted"], 1);
        assert_eq!(plan["historyStatus"]["state"], "pending");
        assert_eq!(plan["change"]["changeType"], "modified");
        assert_eq!(env["historyStatus"]["state"], "omitted");
        assert_eq!(env["kind"], "private");
    }

    #[test]
    fn file_sync_overview_preserves_utf8_file_names_from_git_status() {
        let api = api();
        let (project_id, root) = create_project(&api);
        api.handle(
            "POST",
            &format!("/api/projects/{project_id}/history/enable"),
            Value::Null,
            vec![],
        )
        .unwrap();
        let folder = root.join("assets").join("generated");
        std::fs::create_dir_all(&folder).unwrap();
        std::fs::write(
            folder.join("Cronología visual del Mazda MX-5.png"),
            b"image",
        )
        .unwrap();

        let overview = api
            .handle(
                "GET",
                &format!("/api/projects/{project_id}/file-sync-overview"),
                Value::Null,
                vec![],
            )
            .unwrap();
        let files = overview.body["files"].as_array().unwrap();
        let image_path = "assets/generated/Cronología visual del Mazda MX-5.png";
        let image = files
            .iter()
            .find(|file| file["path"].as_str() == Some(image_path))
            .unwrap();

        assert_eq!(image["name"], "Cronología visual del Mazda MX-5.png");
        assert_eq!(image["historyStatus"]["state"], "pending");
        assert!(files
            .iter()
            .all(|file| !file["path"].as_str().unwrap_or("").contains("Ã")));
    }

    #[test]
    fn git_status_path_removes_git_quotes_and_keeps_spaces() {
        assert_eq!(
            git_status_path("\"Prompt informe reuniones empresas.md\""),
            "Prompt informe reuniones empresas.md"
        );
        assert_eq!(
            git_status_path("\"Proyectos / SMC Training/Tareas.md\""),
            "Proyectos / SMC Training/Tareas.md"
        );
        assert_eq!(
            git_status_path("\"old name.md\" -> \"new folder/new name.md\""),
            "new folder/new name.md"
        );
        assert_eq!(
            git_status_path("\"docs/Norma \\\"155/22\\\".md\""),
            "docs/Norma \"155/22\".md"
        );
        assert_eq!(
            git_status_path("\"assets/generated/Cronolog\\303\\255a visual del Mazda MX-5.png\""),
            "assets/generated/Cronología visual del Mazda MX-5.png"
        );
        assert_eq!(
            git_status_path("\"assets/generated/Gu\\303\\255a de decisi\\303\\263n.png\""),
            "assets/generated/Guía de decisión.png"
        );
        assert_eq!(
            git_status_path("\"assets/generated/L\\303\\255nea temporal del Ni\\303\\261o.png\""),
            "assets/generated/Línea temporal del Niño.png"
        );
    }

    #[test]
    fn legacy_usage_never_becomes_verified_euros() {
        let api = api();
        std::fs::create_dir_all(api.app_data_dir.join("ai")).unwrap();
        api.write_json(&api.ai_usage_path(), &json!({"entries":[{"createdAt":"2026-06-08T10:00:00Z","model":"gpt-5.4-mini","capability":"document_ai","estimatedCost":99.0,"totalTokens":1500,"month":"2026-06"}]})).unwrap();
        let query = BTreeMap::from([("month".into(), "2026-06".into())]);
        let result = api.ai_usage_summary(&query).unwrap();
        assert_eq!(result["legacyEntries"], 1);
        assert_eq!(result["totalEstimatedCost"], 0.0);
        let stored = api.read_json(&api.ai_usage_path(), Value::Null);
        assert_eq!(stored["entries"][0]["estimatedCost"], 99.0);
        assert!(stored["entries"][0]["exchangeRate"].is_null());
    }

    #[test]
    fn ai_usage_summary_reads_recorded_monthly_provider_and_estimated_usage() {
        let api = api();
        std::fs::write(
            api.app_data_dir.join("eur-usd.json"),
            json!({"date":knownext_core::now_iso()[..10],"usdPerEur":1.25,"source":"https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml"})
                .to_string(),
        )
        .unwrap();
        api.record_ai_usage(json!({
            "createdAt": "2026-06-08T10:00:00Z",
            "projectId": "project",
            "interactionId": "interaction-text",
            "capability": "document_ai",
            "model": "gpt-5.4-mini",
            "inputTokens": 1000,
            "cachedInputTokens": 200,
            "outputTokens": 500,
            "reasoningTokens": 25,
            "embeddingTokens": 0,
            "totalTokens": 1500,
            "estimatedCost": text_estimated_cost("gpt-5.4-mini", 1000, 200, 500),
            "usageSource": "provider"
        }));
        api.record_ai_usage(json!({
            "createdAt": "2026-06-08T11:00:00Z",
            "projectId": "project",
            "interactionId": "interaction-image",
            "capability": "image_generation",
            "model": "gpt-image-2",
            "inputTokens": 0,
            "cachedInputTokens": 0,
            "outputTokens": 0,
            "reasoningTokens": 0,
            "embeddingTokens": 0,
            "totalTokens": 0,
            "providerUsage": {"input_tokens_details":{"text_tokens":100,"image_tokens":0},"output_tokens":1000},
            "usageSource": "estimated"
        }));
        api.record_ai_usage(json!({
            "createdAt": "2026-05-31T23:00:00Z",
            "projectId": "project",
            "interactionId": "old",
            "capability": "document_ai",
            "model": "gpt-5.4",
            "inputTokens": 999,
            "cachedInputTokens": 0,
            "outputTokens": 999,
            "reasoningTokens": 0,
            "embeddingTokens": 0,
            "totalTokens": 1998,
            "estimatedCost": 9,
            "usageSource": "provider"
        }));

        let summary = api
            .handle(
                "GET",
                "/api/ai/usage/summary?month=2026-06",
                Value::Null,
                vec![],
            )
            .unwrap();

        assert_eq!(summary.status, 200);
        assert_eq!(summary.body["month"], "2026-06");
        assert_eq!(summary.body["currency"], "EUR");
        assert_eq!(summary.body["models"].as_array().unwrap().len(), 2);
        assert!(summary.body["totalEstimatedCost"].as_f64().unwrap() > 0.0);
        let document_ai = summary.body["capabilities"]
            .as_array()
            .unwrap()
            .iter()
            .find(|item| item["capability"] == "document_ai")
            .unwrap();
        assert_eq!(document_ai["interactions"], 1);
        assert_eq!(document_ai["totalTokens"], 1500);
        assert_eq!(document_ai["usageSource"], "provider");
        let images = summary.body["capabilities"]
            .as_array()
            .unwrap()
            .iter()
            .find(|item| item["capability"] == "image_generation")
            .unwrap();
        assert_eq!(images["interactions"], 1);
        assert_eq!(images["usageSource"], "estimated");
        assert!(summary.body["models"]
            .as_array()
            .unwrap()
            .iter()
            .all(|item| item["model"] != "gpt-5.4"));
    }

    #[test]
    fn file_sync_overview_projects_paused_github_status_onto_files() {
        let api = api();
        let (project_id, root) = create_project(&api);
        create_document(&api, &project_id, "plan.md", "# Plan\n");
        api.handle(
            "POST",
            &format!("/api/projects/{project_id}/history/enable"),
            Value::Null,
            vec![],
        )
        .unwrap();
        git_add_path(&root, "plan.md").unwrap();
        git_commit_all(&root, "Baseline").unwrap();
        api.handle(
            "POST",
            &format!("/api/projects/{project_id}/github/connect"),
            json!({
                "owner": "octocat",
                "repo": "docs",
                "defaultRef": "main",
                "rootPath": "",
                "syncMode": "manual-github"
            }),
            vec![],
        )
        .unwrap();

        let overview = api
            .handle(
                "GET",
                &format!("/api/projects/{project_id}/file-sync-overview"),
                Value::Null,
                vec![],
            )
            .unwrap();

        assert_eq!(overview.body["summary"]["githubPending"], 1);
        assert_eq!(
            overview.body["files"][0]["githubStatus"]["state"],
            "waiting"
        );
        assert_eq!(
            overview.body["files"][0]["githubStatus"]["label"],
            "Pausado"
        );
    }

    #[test]
    fn versioning_status_respects_files_only_projects() {
        let api = api();
        let root = std::env::temp_dir().join(knownext_core::compact_id("knownext-files-only"));
        let created = api
            .handle(
                "POST",
                "/api/projects",
                json!({
                    "name": "Files only",
                    "folderPath": root.to_string_lossy(),
                    "versioningMode": "none",
                    "syncMode": "none"
                }),
                vec![],
            )
            .unwrap();
        let project_id = created.body["id"].as_str().unwrap();

        assert_eq!(created.body["isGitRepository"], false);
        assert!(!root.join(".git").exists());

        let status = api
            .handle(
                "GET",
                &format!("/api/projects/{project_id}/versioning/status"),
                Value::Null,
                vec![],
            )
            .unwrap();
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

        let clean_versioning = api
            .handle(
                "GET",
                &format!("/api/projects/{project_id}/versioning/status"),
                Value::Null,
                vec![],
            )
            .unwrap();
        assert_eq!(clean_versioning.body["available"], true);
        assert_eq!(clean_versioning.body["hasLocalChanges"], false);
        assert!(
            clean_versioning.body["lastVersionHash"]
                .as_str()
                .unwrap()
                .len()
                >= 7
        );

        std::fs::write(root.join("external.md"), "# Externo\n").unwrap();
        std::fs::write(root.join(".env"), "TOKEN=secret").unwrap();

        let dirty_versioning = api
            .handle(
                "GET",
                &format!("/api/projects/{project_id}/versioning/status"),
                Value::Null,
                vec![],
            )
            .unwrap();
        assert_eq!(dirty_versioning.body["hasLocalChanges"], true);

        let changes = api
            .handle(
                "GET",
                &format!("/api/projects/{project_id}/external-changes"),
                Value::Null,
                vec![],
            )
            .unwrap();
        assert_eq!(changes.status, 200);
        assert_eq!(changes.body["status"], "blocked");
        assert_eq!(changes.body["summary"]["total"], 2);
        assert_eq!(changes.body["summary"]["documents"], 1);
        assert_eq!(changes.body["summary"]["omitted"], 1);
        assert!(changes.body["items"]
            .as_array()
            .unwrap()
            .iter()
            .any(|item| item["path"].as_str() == Some("external.md")
                && item["decision"].as_str() == Some("include")));
        assert!(changes.body["items"]
            .as_array()
            .unwrap()
            .iter()
            .any(|item| item["path"].as_str() == Some(".env")
                && item["decision"].as_str() == Some("omit")));

        let external_id = changes.body["items"]
            .as_array()
            .unwrap()
            .iter()
            .find(|item| item["path"].as_str() == Some("external.md"))
            .and_then(|item| item["id"].as_str())
            .unwrap()
            .to_string();
        let imported = api
            .handle(
                "POST",
                &format!("/api/projects/{project_id}/external-changes/import"),
                json!({
                    "decisions": changes.body["items"].as_array().unwrap().iter().map(|item| json!({"itemId":item["id"],"decision":if item["id"]==external_id{"include"}else{"omit"}})).collect::<Vec<_>>(),
                    "revision": changes.body["revision"],
                    "syncRemote": false
                }),
                vec![],
            )
            .unwrap();
        assert_eq!(imported.body["status"], "synced");
        assert_eq!(imported.body["pendingRemoteSync"], false);
        assert!(imported.body["versionTitle"]
            .as_str()
            .unwrap()
            .contains("Cambios externos importados"));

        let after_import = api
            .handle(
                "GET",
                &format!("/api/projects/{project_id}/external-changes"),
                Value::Null,
                vec![],
            )
            .unwrap();
        assert_eq!(after_import.body["summary"]["total"], 1);
        assert_eq!(after_import.body["items"][0]["path"], ".env");
        assert_eq!(after_import.body["items"][0]["decision"], "omit");
        let after_import_versioning = api
            .handle(
                "GET",
                &format!("/api/projects/{project_id}/versioning/status"),
                Value::Null,
                vec![],
            )
            .unwrap();
        assert_eq!(after_import_versioning.body["hasLocalChanges"], true);
    }

    #[test]
    fn production_auth_status_clears_persisted_dev_github_account() {
        let api = api();
        let mock_name = ["KnowNext", "Dev"].join(" ");
        let _ = api.write_json(
            &api.auth_path(),
            &json!({
                "isAuthenticated": true,
                "provider": "github",
                "user": {
                    "login": mock_github_login(),
                    "name": mock_name,
                    "avatarUrl": null
                },
                "scopes": ["repo"],
                "expiresAt": null
            }),
        );

        let before = std::fs::read(api.auth_path()).unwrap();
        let auth = api
            .handle("GET", "/api/auth/status", Value::Null, vec![])
            .unwrap();

        assert_eq!(auth.body["isAuthenticated"], false);
        // GET is an observation: legacy bytes remain available for explicit recovery.
        assert_eq!(std::fs::read(api.auth_path()).unwrap(), before);
    }

    #[test]
    fn auth_status_never_exposes_persisted_github_tokens_to_frontend() {
        let api = api();
        let _ = api.write_json(
            &api.credentials_path(),
            &json!({
                "github": {
                    "provider": "github",
                    "accessToken": "gho_private_secret",
                    "scopes": ["repo"],
                    "updatedAt": knownext_core::now_iso()
                }
            }),
        );
        let _ = api.write_json(
            &api.auth_path(),
            &json!({
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
            }),
        );

        let before = std::fs::read(api.auth_path()).unwrap();
        let auth = api
            .handle("GET", "/api/auth/status", Value::Null, vec![])
            .unwrap();


        assert_eq!(auth.body["isAuthenticated"], true);
        assert!(auth.body.get("accessToken").is_none());
        assert!(auth.body.get("token").is_none());
        // Secrets never enter the public projection; GET must not rewrite their source.
        assert_eq!(std::fs::read(api.auth_path()).unwrap(), before);
    }

    #[test]
    fn auth_status_clears_github_account_when_private_credentials_are_missing() {
        let api = api();
        let _ = api.write_json(
            &api.auth_path(),
            &json!({
                "isAuthenticated": true,
                "provider": "github",
                "user": {
                    "login": "octocat",
                    "name": "Octocat",
                    "avatarUrl": null
                },
                "scopes": ["repo", "read:user"],
                "expiresAt": null
            }),
        );

        let before = std::fs::read(api.auth_path()).unwrap();
        let auth = api
            .handle("GET", "/api/auth/status", Value::Null, vec![])
            .unwrap();

        assert_eq!(auth.body["isAuthenticated"], false);
        // GET is an observation: legacy bytes remain available for explicit recovery.
        assert_eq!(std::fs::read(api.auth_path()).unwrap(), before);
    }

    #[test]
    fn runtime_logging_and_folder_contracts_are_local_runtime_backed() {
        let api = api();
        api.update_config(json!({"diagnostics":{"traceLoggingEnabled":true}})).unwrap();

        let status = api
            .handle("GET", "/api/runtime/logging", Value::Null, vec![])
            .unwrap();
        assert_eq!(status.status, 200);
        assert_eq!(status.body["enabled"], true);
        assert!(status.body["filePath"]
            .as_str()
            .unwrap()
            .ends_with("diagnostics-v1.json"));

        let recorded = api
            .handle(
                "POST",
                "/api/runtime/logging",
                json!({
                    "level": "info",
                    "source": "test.runtime",
                    "message": "Contrato runtime logging validado.",
                    "detail": "detalle"
                }),
                vec![],
            )
            .unwrap();
        assert_eq!(recorded.status, 200);
        assert!(api.logs_dir().join("diagnostics-v1.json").exists());

        let folder = api.app_data_dir.join("manual-open-folder");
        let opened = api
            .handle(
                "POST",
                "/api/runtime/open-folder",
                json!({
                    "folderPath": folder.to_string_lossy()
                }),
                vec![],
            )
            .unwrap();
        assert_eq!(opened.status, 200);
        assert_eq!(opened.body["opened"], true);
        assert!(folder.exists());
    }

    #[test]
    fn github_and_openai_credentials_are_preserved_independently() {
        let api = api();
        let _ = api.write_json(
            &api.credentials_path(),
            &json!({
                "github": {
                    "provider": "github",
                    "accessToken": "gho_secret",
                    "scopes": ["repo"],
                    "updatedAt": knownext_core::now_iso()
                }
            }),
        );

        let saved_key = api
            .handle(
                "PUT",
                "/api/credentials/openai-key",
                json!({ "apiKey": "sk-knownext-test-key" }),
                vec![],
            )
            .unwrap();
        let credentials_after_key = api.credentials();

        assert_eq!(saved_key.body["configured"], true);
        assert_eq!(credentials_after_key["openaiKey"], "sk-knownext-test-key");
        assert_eq!(credentials_after_key["github"]["accessToken"], "gho_secret");

        let _ = api
            .handle("POST", "/api/auth/logout", Value::Null, vec![])
            .unwrap();
        let credentials_after_logout = api.credentials();

        assert_eq!(
            credentials_after_logout["openaiKey"],
            "sk-knownext-test-key"
        );
        assert!(credentials_after_logout.get("github").is_none());

        let _ = api.write_json(
            &api.credentials_path(),
            &json!({
                "openaiKey": "sk-knownext-test-key",
                "github": {
                    "provider": "github",
                    "accessToken": "gho_secret",
                    "scopes": ["repo"]
                }
            }),
        );
        let _ = api
            .handle("DELETE", "/api/credentials/openai-key", Value::Null, vec![])
            .unwrap();
        let credentials_after_openai_delete = api.credentials();

        assert!(credentials_after_openai_delete.get("openaiKey").is_none());
        assert_eq!(
            credentials_after_openai_delete["github"]["accessToken"],
            "gho_secret"
        );
    }

    #[test]
    fn credential_mutations_preserve_corrupt_or_readonly_stores_and_report_failure() {
        let api=api();
        std::fs::write(api.credentials_path(),b"broken store").unwrap();
        assert!(api.save_openai_key(json!({"apiKey":"dummy-new-key"})).is_err());
        assert!(api.delete_openai_key().is_err());assert!(api.clear_auth_status().is_err());
        assert_eq!(std::fs::read(api.credentials_path()).unwrap(),b"broken store");
        assert!(!api.openai_key_status()["storageError"].is_null());
        std::fs::remove_file(api.credentials_path()).unwrap();
        api.save_openai_key(json!({"apiKey":"dummy-original-key"})).unwrap();
        let original=std::fs::read(api.credentials_path()).unwrap();
        let mut permissions=std::fs::metadata(api.credentials_path()).unwrap().permissions();
        permissions.set_readonly(true);std::fs::set_permissions(api.credentials_path(),permissions.clone()).unwrap();
        assert!(api.save_openai_key(json!({"apiKey":"dummy-replacement"})).is_err());
        assert_eq!(std::fs::read(api.credentials_path()).unwrap(),original);
        assert_eq!(api.openai_key().as_deref(),Some("dummy-original-key"));
        permissions.set_readonly(false);std::fs::set_permissions(api.credentials_path(),permissions).unwrap();
    }

    #[test]
    fn credential_status_handles_unicode_without_exposing_the_key() {
        let api=api();let key="áβ-dummy-key-último";
        api.save_openai_key(json!({"apiKey":key})).unwrap();
        let status=api.openai_key_status();
        assert_eq!(status["configured"],true);assert!(!status.to_string().contains(key));
        assert!(api.save_openai_key(json!({"apiKey":""})).is_err());
        assert_eq!(api.openai_key().as_deref(),Some(key));
    }

    #[test]
    fn unavailable_credential_store_does_not_erase_the_github_account_or_expose_legacy_secrets() {
        let api=api();
        let auth=json!({"isAuthenticated":true,"provider":"github","user":{"login":"fixture-user"},"scopes":[],"accessToken":"dummy-legacy-secret"});
        api.write_json(&api.auth_path(),&auth).unwrap();
        std::fs::write(api.credentials_path(),b"broken store").unwrap();
        let public=api.auth_status();
        assert_eq!(public["isAuthenticated"],false);assert!(!public["credentialStorageError"].is_null());
        assert!(!public.to_string().contains("dummy-legacy-secret"));
        assert_eq!(api.read_json(&api.auth_path(),Value::Null),auth);
    }

    #[test]
    fn creates_project_and_reads_markdown_document() {
        let api = api();
        let (project_id, _root) = create_project(&api);

        let document_id = create_document(&api, &project_id, "intro.md", "# Intro\n");
        let loaded = api
            .handle(
                "GET",
                &format!("/api/documents/{document_id}"),
                Value::Null,
                vec![],
            )
            .unwrap();

        assert_eq!(loaded.body["markdown"], "# Intro\n");
        assert_eq!(
            api.handle(
                "GET",
                &format!("/api/projects/{project_id}/tree"),
                Value::Null,
                vec![]
            )
            .unwrap()
            .body
            .as_array()
            .unwrap()
            .len(),
            1
        );
    }

    #[test]
    fn handwritten_notes_create_save_render_export_insert_and_index() {
        let api = api();
        let (project_id, root) = create_project(&api);

        let created = api
            .handle(
                "POST",
                &format!("/api/projects/{project_id}/handwritten-notes"),
                json!({
                    "parentId": null,
                    "name": "Boceto",
                    "background": "cornell"
                }),
                vec![],
            )
            .unwrap();
        let note_node = &created.body["node"];
        let note_id = note_node["id"].as_str().unwrap().to_string();
        assert_eq!(note_node["type"], "handwritten-note");
        assert_eq!(note_node["name"], "Boceto.knote");
        assert_eq!(
            note_node["mimeType"],
            "application/vnd.knownext.handwritten-note+json"
        );

        let loaded = api
            .handle(
                "GET",
                &format!("/api/handwritten-notes/{note_id}"),
                Value::Null,
                vec![],
            )
            .unwrap();
        assert_eq!(loaded.body["pageCount"], 1);
        assert_eq!(
            loaded.body["content"]["pages"][0]["background"]["type"],
            "cornell"
        );

        let mut content = loaded.body["content"].clone();
        content["ocr"] = json!({
            "status": "ready",
            "updatedAt": knownext_core::now_iso(),
            "textByPage": { "page-1": "Plan manuscrito con tareas pendientes" }
        });
        content["pages"][0]["strokes"] = json!([{
            "id": "stroke-1",
            "tool": "pen",
            "color": "#111827",
            "width": 4,
            "opacity": 1.0,
            "pressure": true,
            "points": [[100, 100, 0.5, 0], [180, 150, 0.9, 16]],
            "path": "M 100 100 L 180 150",
            "bounds": { "x": 96, "y": 96, "width": 88, "height": 58 }
        }]);
        let saved = api
            .handle(
                "PUT",
                &format!("/api/handwritten-notes/{note_id}"),
                json!({ "content": content }),
                vec![],
            )
            .unwrap();
        assert_eq!(saved.body["content"]["ocr"]["status"], "ready");

        let rendered = api
            .handle(
                "GET",
                &format!("/api/handwritten-notes/{note_id}/pages/page-1/render?format=svg"),
                Value::Null,
                vec![],
            )
            .unwrap();
        assert_eq!(rendered.body["contentType"], "image/svg+xml");
        assert!(rendered.body["dataUrl"]
            .as_str()
            .unwrap()
            .starts_with("data:image/svg+xml;base64,"));

        let png = api
            .content(
                &format!("/api/handwritten-notes/{note_id}/export/content"),
                json!({ "format": "png", "pageId": "page-1" }),
            )
            .unwrap();
        assert_eq!(png.content_type, "image/png");
        let png_bytes = base64::engine::general_purpose::STANDARD
            .decode(png.data_base64)
            .unwrap();
        assert!(png_bytes.starts_with(&[0x89, b'P', b'N', b'G']));

        let pdf_path = root.join("exports").join("boceto.pdf");
        std::fs::create_dir_all(pdf_path.parent().unwrap()).unwrap();
        api.handle(
            "POST",
            &format!("/api/handwritten-notes/{note_id}/export"),
            json!({ "format": "pdf", "outputPath": pdf_path.to_string_lossy() }),
            vec![],
        )
        .unwrap();
        assert!(std::fs::read(&pdf_path).unwrap().starts_with(b"%PDF"));

        let document_id = create_document(&api, &project_id, "plan.md", "# Plan\n");
        let inserted = api
            .handle(
                "POST",
                &format!("/api/handwritten-notes/{note_id}/pages/page-1/insert-markdown"),
                json!({ "documentId": document_id, "altText": "Boceto manuscrito" }),
                vec![],
            )
            .unwrap();
        let inserted_markdown = inserted.body["markdown"].as_str().unwrap();
        assert!(inserted_markdown.contains("assets/handwritten/"));
        assert!(inserted_markdown.contains("knownext-note:"));
        assert_eq!(inserted.body["asset"]["mimeType"], "image/png");

        let ai_source = api
            .handle(
                "POST",
                &format!("/api/projects/{project_id}/ai/context/handwritten-notes"),
                json!({ "noteId": note_id }),
                vec![],
            )
            .unwrap();
        assert_eq!(ai_source.body["kind"], "handwritten_note");

        let rebuilt = api
            .handle(
                "POST",
                &format!("/api/projects/{project_id}/ai/index/rebuild"),
                Value::Null,
                vec![],
            )
            .unwrap();
        // Enumeration also reports the exported PDF and inserted PNG; only two sources have text.
        assert_eq!(rebuilt.body["documentCount"], 4);
        assert_eq!(rebuilt.body["indexedDocumentCount"], 2);
    }

    #[test]
    fn ai_handwritten_drawing_applies_as_draft_without_saving_disk_note() {
        let api = api();
        let (project_id, _root) = create_project(&api);
        let created = api
            .handle(
                "POST",
                &format!("/api/projects/{project_id}/handwritten-notes"),
                json!({
                    "parentId": null,
                    "name": "Boceto IA",
                    "background": "blank"
                }),
                vec![],
            )
            .unwrap();
        let note_id = created.body["node"]["id"].as_str().unwrap().to_string();
        let loaded = api
            .handle(
                "GET",
                &format!("/api/handwritten-notes/{note_id}"),
                Value::Null,
                vec![],
            )
            .unwrap();
        let mut response = json!({
            "status": "completed",
            "answer": "He preparado el dibujo.",
            "drawingProposal": {},
            "conversationEvents": [{
                "id": "event",
                "projectId": project_id,
                "type": "handwritten_drawing_generated",
                "role": "assistant",
                "content": "He preparado el dibujo.",
                "createdAt": knownext_core::now_iso(),
                "documentId": note_id,
                "path": null,
                "paths": [],
                "summary": "Flujo IA"
            }],
            "operations": [{
                "type": "handwritten_drawing_generated",
                "status": "ready",
                "message": "Flujo IA",
                "summary": "Flujo IA",
                "documentId": note_id,
                "noteId": note_id,
                "nodeId": note_id,
                "path": null,
                "paths": [],
                "route": "precise_scene",
                "targetPageId": "page-1",
                "replacementPolicy": "append_only",
                "drawingBrief": { "goal": "flujo", "style": "professional_whiteboard" },
                "sceneSpec": {
                    "elements": [
                        { "id": "a", "type": "box", "text": "Alta", "role": "primary", "priority": 1, "from": null, "to": null },
                        { "id": "b", "type": "box", "text": "Activacion", "role": "primary", "priority": 2, "from": null, "to": null },
                        { "id": "ab", "type": "arrow", "text": null, "role": "connector", "priority": 3, "from": "a", "to": "b" }
                    ]
                }
            }]
        });
        let runtime_body = json!({
            "prompt": "Dibuja un flujo de onboarding.",
            "handwrittenNoteId": note_id,
            "activeHandwrittenPageId": "page-1",
            "activeHandwrittenContent": loaded.body["content"].clone(),
            "activeHandwrittenBaseFingerprint": loaded.body["baseFingerprint"].clone()
        });

        let drawings=ai_interaction::drawing_results_for_test(&api,&project_id,&runtime_body,&response);
        api.apply_ai_handwritten_drawings(&project_id, &runtime_body, &mut response, &drawings)
            .unwrap();

        assert_eq!(response["operations"][0]["type"], "handwritten_modified");
        assert_eq!(
            response["conversationEvents"][0]["type"],
            "handwritten_modified"
        );
        assert!(response["answer"]
            .as_str()
            .unwrap()
            .contains("He aplicado el dibujo como borrador"));
        assert_eq!(
            response["conversationEvents"][0]["content"],
            response["answer"]
        );
        assert!(response["drawingProposal"].is_null());
        assert_eq!(response["updatedHandwrittenNote"]["noteId"], note_id);
        assert!(
            response["updatedHandwrittenNote"]["content"]["pages"][0]["strokes"]
                .as_array()
                .unwrap()
                .len()
                > 4
        );
        assert!(
            !response["updatedHandwrittenNote"]["content"]["pages"][0]["generatedElements"]
                .as_array()
                .unwrap()
                .is_empty()
        );

        let after = api
            .handle(
                "GET",
                &format!("/api/handwritten-notes/{note_id}"),
                Value::Null,
                vec![],
            )
            .unwrap();
        assert_eq!(after.body["hasDraft"], true);
        assert!(
            after.body["content"]["pages"][0]["strokes"]
                .as_array()
                .unwrap()
                .len()
                > 4
        );
        let disk_note = api.read_json(&api.resolve_document_path(&note_id).unwrap(), Value::Null);
        assert!(disk_note["pages"][0]["strokes"]
            .as_array()
            .unwrap()
            .is_empty());
    }

    #[test]
    fn ai_handwritten_drawing_can_clean_active_page_as_draft() {
        let api = api();
        let (project_id, _root) = create_project(&api);
        let created = api
            .handle(
                "POST",
                &format!("/api/projects/{project_id}/handwritten-notes"),
                json!({
                    "parentId": null,
                    "name": "Hoja para limpiar",
                    "background": "blank"
                }),
                vec![],
            )
            .unwrap();
        let note_id = created.body["node"]["id"].as_str().unwrap().to_string();
        let loaded = api
            .handle(
                "GET",
                &format!("/api/handwritten-notes/{note_id}"),
                Value::Null,
                vec![],
            )
            .unwrap();
        let mut active_content = loaded.body["content"].clone();
        active_content["pages"][0]["strokes"] = json!([
            { "id": "manual-stroke", "toolId": "pencil-1", "tool":"pencil", "color":"#111827", "width":2, "opacity":1.0, "points": [[20,20,0.5,0],[40,40,0.5,16]] }
        ]);
        let mut response = json!({
            "status": "completed",
            "answer": "He preparado una propuesta para limpiar la hoja.",
            "drawingProposal": {},
            "conversationEvents": [{
                "id": "event",
                "projectId": project_id,
                "type": "handwritten_drawing_generated",
                "role": "assistant",
                "content": "He preparado una propuesta para limpiar la hoja.",
                "createdAt": knownext_core::now_iso(),
                "documentId": note_id,
                "path": null,
                "paths": [],
                "summary": "Cuatro formas geometricas"
            }],
            "operations": [{
                "type": "handwritten_drawing_generated",
                "status": "ready",
                "message": "Limpiar pagina",
                "summary": "Limpiar pagina",
                "documentId": note_id,
                "noteId": note_id,
                "nodeId": note_id,
                "path": null,
                "paths": [],
                "route": "precise_scene",
                "targetPageId": "page-1",
                "replacementPolicy": "clean_existing",
                "drawingBrief": { "goal": "limpiar pagina", "style": "professional_whiteboard" },
                "sceneSpec": { "elements": [] }
            }]
        });
        let runtime_body = json!({
            "prompt": "Limpia toda la pagina.",
            "handwrittenNoteId": note_id,
            "activeHandwrittenPageId": "page-1",
            "activeHandwrittenContent": active_content,
            "activeHandwrittenBaseFingerprint": loaded.body["baseFingerprint"].clone()
        });

        let drawings=ai_interaction::drawing_results_for_test(&api,&project_id,&runtime_body,&response);
        api.apply_ai_handwritten_drawings(&project_id, &runtime_body, &mut response, &drawings)
            .unwrap();

        assert_eq!(response["operations"][0]["type"], "handwritten_modified");
        assert!(response["answer"]
            .as_str()
            .unwrap()
            .contains("He limpiado la pagina activa"));
        let strokes = response["updatedHandwrittenNote"]["content"]["pages"][0]["strokes"]
            .as_array()
            .unwrap();
        assert!(strokes.is_empty());
        let disk_note = api.read_json(&api.resolve_document_path(&note_id).unwrap(), Value::Null);
        assert!(disk_note["pages"][0]["strokes"]
            .as_array()
            .unwrap()
            .is_empty());
    }

    #[test]
    fn folder_move_rename_and_delete_report_child_markdown_documents_as_affected() {
        let api = api();
        let (project_id, _root) = create_project(&api);

        let docs = api
            .handle(
                "POST",
                &format!("/api/projects/{project_id}/folders"),
                json!({
                    "parentId": null,
                    "name": "docs"
                }),
                vec![],
            )
            .unwrap();
        let docs_id = docs.body["node"]["id"].as_str().unwrap().to_string();
        let child_id =
            create_document_with_parent(&api, &project_id, &docs_id, "plan.md", "# Plan\n");
        let docs_id_path = child_id_for_path(&docs_id);

        let archive = api
            .handle(
                "POST",
                &format!("/api/projects/{project_id}/folders"),
                json!({
                    "parentId": null,
                    "name": "archive"
                }),
                vec![],
            )
            .unwrap();
        let archive_id = archive.body["node"]["id"].as_str().unwrap().to_string();
        let moved = api
            .handle(
                "PATCH",
                &format!("/api/projects/{project_id}/nodes/{docs_id_path}/move"),
                json!({
                    "targetFolderId": archive_id
                }),
                vec![],
            )
            .unwrap();

        let moved_child_id = doc_id(&project_id, "archive/docs/plan.md");
        assert!(moved.body["affectedDocuments"]
            .as_array()
            .unwrap()
            .iter()
            .any(|document| {
                document["oldId"] == child_id
                    && document["newId"] == moved_child_id
                    && document["path"] == "archive/docs/plan.md"
            }));

        let moved_docs_id = doc_id(&project_id, "archive/docs");
        let moved_docs_id_path = child_id_for_path(&moved_docs_id);
        let renamed = api
            .handle(
                "PATCH",
                &format!("/api/projects/{project_id}/nodes/{moved_docs_id_path}/rename"),
                json!({
                    "name": "current"
                }),
                vec![],
            )
            .unwrap();

        let renamed_child_id = doc_id(&project_id, "archive/current/plan.md");
        assert!(renamed.body["affectedDocuments"]
            .as_array()
            .unwrap()
            .iter()
            .any(|document| {
                document["oldId"] == moved_child_id
                    && document["newId"] == renamed_child_id
                    && document["path"] == "archive/current/plan.md"
            }));

        let renamed_docs_id = doc_id(&project_id, "archive/current");
        let renamed_docs_id_path = child_id_for_path(&renamed_docs_id);
        let deleted = api
            .handle(
                "DELETE",
                &format!("/api/projects/{project_id}/nodes/{renamed_docs_id_path}"),
                Value::Null,
                vec![],
            )
            .unwrap();

        assert!(deleted.body["affectedDocuments"]
            .as_array()
            .unwrap()
            .iter()
            .any(|document| {
                document["oldId"] == renamed_child_id
                    && document["newId"].is_null()
                    && document["path"] == "archive/current/plan.md"
            }));
    }

    #[test]
    fn drafts_reload_report_orphan_status_and_restore_without_legacy_404() {
        let api = api();
        let (project_id, root) = create_project(&api);
        let document_id = create_document(&api, &project_id, "drafted.md", "# Disco\n");
        let loaded = api
            .handle(
                "GET",
                &format!("/api/documents/{document_id}"),
                Value::Null,
                vec![],
            )
            .unwrap();
        let base_fingerprint = loaded.body["baseFingerprint"].clone();

        let draft = api
            .handle(
                "PUT",
                &format!("/api/documents/{document_id}/draft"),
                json!({
                    "markdown": "# Borrador recuperable\nContenido sin guardar.",
                    "baseFingerprint": base_fingerprint
                }),
                vec![],
            )
            .unwrap();
        assert_eq!(draft.status, 200);

        let reloaded = api
            .handle(
                "GET",
                &format!("/api/documents/{document_id}"),
                Value::Null,
                vec![],
            )
            .unwrap();
        assert_eq!(
            reloaded.body["markdown"],
            "# Borrador recuperable\nContenido sin guardar."
        );
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

        let orphans = api
            .handle("GET", "/api/drafts/orphans", Value::Null, vec![])
            .unwrap();
        assert_eq!(orphans.body.as_array().unwrap().len(), 1);
        assert_eq!(orphans.body[0]["documentId"], document_id);
        assert_eq!(orphans.body[0]["recoverable"], true);

        let draft_key = orphans.body[0]["draftKey"].as_str().unwrap();
        let restored = api
            .handle(
                "POST",
                &format!("/api/drafts/{draft_key}/restore"),
                json!({"documentId":document_id,"expectedFingerprint":orphans.body[0]["fingerprint"],"locationRevision":orphans.body[0]["locationRevision"]}),
                vec![],
            )
            .unwrap();
        assert_eq!(restored.status, 200);
        assert_eq!(
            restored.body["document"]["markdown"],
            "# Borrador recuperable\nContenido sin guardar."
        );
        assert_eq!(restored.body["document"]["hasDraft"], false);
        assert_eq!(
            std::fs::read_to_string(root.join("drafted.md")).unwrap(),
            "# Borrador recuperable\nContenido sin guardar."
        );

        let empty = api
            .handle("GET", "/api/drafts/orphans", Value::Null, vec![])
            .unwrap();
        assert_eq!(empty.body.as_array().unwrap().len(), 0);
    }

    #[test]
    fn identical_draft_is_discarded_and_does_not_mark_document_changed() {
        let api = api();
        let (project_id, _root) = create_project(&api);
        let document_id = create_document(&api, &project_id, "clean.md", "# Titulo\n\nTexto\n");
        let loaded = api
            .handle(
                "GET",
                &format!("/api/documents/{document_id}"),
                Value::Null,
                vec![],
            )
            .unwrap();
        let base_fingerprint = loaded.body["baseFingerprint"].clone();
        let disk_hash = loaded.body["diskContentHash"].as_str().unwrap().to_string();

        let dirty_draft = api
            .handle(
                "PUT",
                &format!("/api/documents/{document_id}/draft"),
                json!({
                    "markdown": "# Titulo\n\n**Texto**\n",
                    "baseFingerprint": base_fingerprint
                }),
                vec![],
            )
            .unwrap();
        assert_eq!(dirty_draft.body["isDirty"], true);
        assert_eq!(dirty_draft.body["hasDraft"], true);
        assert_ne!(
            dirty_draft.body["draftContentHash"].as_str().unwrap(),
            disk_hash
        );

        let clean_draft = api
            .handle(
                "PUT",
                &format!("/api/documents/{document_id}/draft"),
                json!({
                    "markdown": "# Titulo\n\nTexto\n\n",
                    "baseFingerprint": loaded.body["baseFingerprint"].clone(),
                    "expectedDraftWriteRevision": dirty_draft.body["draftWriteRevision"].clone()
                }),
                vec![],
            )
            .unwrap();
        assert_eq!(clean_draft.body["isDirty"], false);
        assert_eq!(clean_draft.body["hasDraft"], false);
        assert!(clean_draft.body["draftContentHash"].is_null());

        let reloaded = api
            .handle(
                "GET",
                &format!("/api/documents/{document_id}"),
                Value::Null,
                vec![],
            )
            .unwrap();
        assert_eq!(reloaded.body["markdown"], "# Titulo\n\nTexto\n");
        assert_eq!(reloaded.body["hasDraft"], false);
        assert_eq!(reloaded.body["isDirty"], false);

        let status = api
            .handle(
                "POST",
                "/api/documents/sync-status",
                json!({
                    "documents": [{ "documentId": document_id, "baseFingerprint": reloaded.body["baseFingerprint"].clone() }]
                }),
                vec![],
            )
            .unwrap();
        assert_eq!(status.body["documents"][0]["hasDraft"], false);
        assert_eq!(status.body["documents"][0]["localChanged"], false);
    }

    #[test]
    fn fingerprint_sha256_detects_same_size_external_edits() {
        let api = api();
        let (project_id, root) = create_project(&api);
        let document_id = create_document(&api, &project_id, "same-size.md", "abc\n");
        let loaded = api
            .handle(
                "GET",
                &format!("/api/documents/{document_id}"),
                Value::Null,
                vec![],
            )
            .unwrap();
        let base_fingerprint = loaded.body["baseFingerprint"].clone();

        std::fs::write(root.join("same-size.md"), "xyz\n").unwrap();
        let status = api
            .handle(
                "POST",
                "/api/documents/sync-status",
                json!({
                    "documents": [{ "documentId": document_id, "baseFingerprint": base_fingerprint }]
                }),
                vec![],
            )
            .unwrap();

        assert_eq!(status.body["documents"][0]["diskChanged"], true);
        assert_eq!(
            status.body["documents"][0]["conflictStatus"],
            "disk-changed"
        );
        assert_ne!(
            status.body["documents"][0]["currentFingerprint"]["sha256"],
            loaded.body["baseFingerprint"]["sha256"]
        );
    }

    #[test]
    fn notes_and_config_persist_as_local_json() {
        let api = api();
        let notes = api
            .handle(
                "PUT",
                "/api/notes",
                json!({ "markdown": "# Notas" }),
                vec![],
            )
            .unwrap();
        assert_eq!(notes.body["markdown"], "# Notas");
        assert_eq!(
            api.handle("GET", "/api/notes", Value::Null, vec![])
                .unwrap()
                .body["markdown"],
            "# Notas"
        );

        let config = api
            .handle(
                "PUT",
                "/api/config",
                json!({
                    "appearance": { "zoomPercent": 125 },
                    "activeUtilityTab": "notes",
                    "openUtilityTabs": ["notes", "release-notes"],
                    "ai": {
                        "rag": { "enabled": true, "vectorStoreId": "vs_legacy", "status": "ready" },
                        "imageGeneration": { "enabled": true, "model": "gpt-image-2", "size": "3840x2160" },
                        "diagrams": { "visualProfile": "compatible", "iconSet": "lucide", "imagePolicy": "external_confirm", "aiGenerationMode": "visual" },
                        "agentic": { "webResearchEnabled": true },
                        "permissions": {
                            "generateImages": true,
                            "createImageAssets": true,
                            "insertImagesIntoDocuments": true,
                            "useDocumentContextForImageGeneration": true
                        }
                    }
                }),
                vec![],
            )
            .unwrap();
        assert_eq!(config.body["schemaVersion"], 3);
        assert_eq!(config.body["layout"]["sidebarWidth"], 338);
        assert_eq!(config.body["appearance"]["zoomPercent"], 125);
        assert_eq!(config.body["openUtilityTabs"], json!(["release-notes"]));
        assert_eq!(config.body["ai"]["rag"]["enabled"], true);
        assert_eq!(config.body["ai"]["rag"]["vectorStoreId"], "vs_legacy");
        assert_eq!(config.body["ai"]["rag"]["status"], "updated");
        assert_eq!(config.body["ai"]["imageGeneration"]["enabled"], true);
        assert_eq!(config.body["ai"]["imageGeneration"]["model"], "gpt-image-2");
        assert_eq!(config.body["ai"]["imageGeneration"]["size"], "3840x2160");
        assert_eq!(config.body["ai"]["diagrams"]["visualProfile"], "compatible");
        assert_eq!(config.body["ai"]["diagrams"]["iconSet"], "none");
        assert_eq!(config.body["ai"]["diagrams"]["imagePolicy"], "disabled");
        assert_eq!(config.body["ai"]["diagrams"]["aiGenerationMode"], "safe");
        assert_eq!(config.body["ai"]["agentic"]["webResearchEnabled"], true);
        assert_eq!(config.body["ai"]["permissions"]["generateImages"], true);

        let ai_status = api
            .handle(
                "PUT",
                "/api/config/ai",
                json!({
                    "provider": "openai",
                    "model": "gpt-5.4-mini",
                    "rag": { "enabled": true, "vectorStoreId": "vs_legacy", "status": "ready" },
                    "imageGeneration": { "enabled": true, "model": "gpt-image-1.5", "size": "3840x2160" },
                    "diagrams": { "visualProfile": "advanced", "iconSet": "lucide", "imagePolicy": "external_confirm", "betaPolicy": "enabled" },
                    "agentic": { "webResearchEnabled": true },
                    "permissions": { "generateImages": true }
                }),
                vec![],
            )
            .unwrap();
        assert_eq!(ai_status.body["rag"]["enabled"], true);
        assert_eq!(ai_status.body["rag"]["vectorStoreId"], "vs_legacy");
        assert_eq!(ai_status.body["imageGeneration"]["enabled"], true);
        assert_eq!(ai_status.body["imageGeneration"]["model"], "gpt-image-1.5");
        assert_eq!(ai_status.body["imageGeneration"]["size"], "auto");
        assert_eq!(ai_status.body["diagrams"]["visualProfile"], "advanced");
        assert_eq!(
            ai_status.body["diagrams"]["imagePolicy"],
            "external_confirm"
        );
        assert_eq!(ai_status.body["diagrams"]["betaPolicy"], "enabled");
        assert_eq!(ai_status.body["agentic"]["webResearchEnabled"], true);

        api.write_json(
            &api.config_path(),
            &json!({
                "schemaVersion": 1,
                "appearance": { "language": "en" },
                "ai": {
                    "rag": { "enabled": true, "vectorStoreId": "vs_legacy", "status": "updated" },
                    "imageGeneration": { "enabled": true, "model": "gpt-image-2", "size": "2048x2048" },
                    "agentic": { "webResearchEnabled": true }
                }
            }),
        )
        .unwrap();
        let migrated = api
            .handle("GET", "/api/config", Value::Null, vec![])
            .unwrap();
        assert_eq!(migrated.body["schemaVersion"], 3);
        assert_eq!(migrated.body["layout"]["sidebarWidth"], 338);
        assert_eq!(migrated.body["diagnostics"]["traceLoggingEnabled"], false);
        assert_eq!(migrated.body["appearance"]["language"], "en");
        assert_eq!(migrated.body["ai"]["permissions"]["editDocuments"], true);
        assert_eq!(migrated.body["ai"]["vision"]["enabled"], true);
        assert_eq!(migrated.body["ai"]["transcription"]["enabled"], true);
        assert_eq!(migrated.body["ai"]["diagrams"]["enabled"], true);
        assert_eq!(
            migrated.body["ai"]["diagrams"]["visualProfile"],
            "visual_local"
        );
        assert_eq!(migrated.body["ai"]["rag"]["enabled"], true);
        assert_eq!(migrated.body["ai"]["rag"]["vectorStoreId"], "vs_legacy");
        assert_eq!(migrated.body["ai"]["imageGeneration"]["enabled"], true);
        assert_eq!(
            migrated.body["ai"]["imageGeneration"]["model"],
            "gpt-image-2"
        );
        assert_eq!(migrated.body["ai"]["imageGeneration"]["size"], "2048x2048");
        assert_eq!(migrated.body["ai"]["agentic"]["webResearchEnabled"], true);
        let persisted = api.read_json(&api.config_path(), json!({}));
        // GET normalizes the response only; the legacy source is retained.
        assert_eq!(persisted["schemaVersion"], 1);
        api.handle("PUT", "/api/config", json!({"layout":{"sidebarWidth":340}}), vec![]).unwrap();
        let persisted = api.read_json(&api.config_path(), json!({}));
        assert_eq!(persisted["schemaVersion"], 3);
        assert_eq!(persisted["ai"]["rag"]["enabled"], true);
    }

    #[test]
    fn internal_background_publication_blocks_relocation_without_provider_calls(){
        let api=api();let (project,_root)=create_project(&api);let other=tempfile::tempdir().unwrap();
        let before=std::fs::read(api.registry_path()).unwrap();
        let activity=api.background_work.enter();
        let error=api.update_project(&project,json!({"folderPath":other.path().to_string_lossy(),"locationReview":{}})).unwrap_err();
        assert!(error.contains("segundo plano"));assert_eq!(std::fs::read(api.registry_path()).unwrap(),before);
        drop(activity);assert!(!api.has_background_work());
        assert_eq!(api.update_project(&project,json!({"name":"Still available"})).unwrap()["name"],"Still available");
    }

    #[test]
    fn imports_previews_exports_and_versions_local_documents() {
        let api = api();
        let (project_id, root) = create_project(&api);
        let document_id = create_document(
            &api,
            &project_id,
            "release-notes.md",
            "# Release\nContenido local.",
        );

        let loaded=api.get_document(&document_id).unwrap();
        let draft = api
            .handle(
                "PUT",
                &format!("/api/documents/{document_id}/draft"),
                json!({
                    "markdown": "# Release\nBorrador local.",
                    "baseFingerprint": loaded["baseFingerprint"]
                }),
                vec![],
            )
            .unwrap();
        assert_eq!(draft.status, 200);
        assert_eq!(draft.body["isDirty"], true);

        let saved = api
            .handle(
                "PUT",
                &format!("/api/documents/{document_id}"),
                json!({
                    "markdown": "# Release\nContenido final local.",
                    "baseFingerprint":loaded["baseFingerprint"],
                    "expectedDraftWriteRevision":api.draft_write_revision(&document_id).unwrap()
                }),
                vec![],
            )
            .unwrap();
        assert_eq!(saved.status,200,"{}",saved.body);
        assert_eq!(saved.body["markdown"], "# Release\nContenido final local.");

        let version = api
            .handle(
                "POST",
                &format!("/api/projects/{project_id}/versions"),
                json!({
                    "documentId": document_id,
                    "title": "Validacion local"
                }),
                vec![],
            )
            .unwrap();
        let version_id = version.body["version"]["id"].as_str().unwrap();
        let version_content = api
            .handle(
                "GET",
                &format!("/api/documents/{document_id}/versions/{version_id}/content"),
                Value::Null,
                vec![],
            )
            .unwrap();
        assert_eq!(
            version_content.body["markdown"],
            "# Release\nContenido final local."
        );

        let md_output = root.join("release-export.md");
        let pdf_output = root.join("release-export.pdf");
        let docx_output = root.join("release-export.docx");
        for (format, output) in [
            ("md", &md_output),
            ("pdf", &pdf_output),
            ("docx", &docx_output),
        ] {
            let exported = api
                .handle(
                    "POST",
                    &format!("/api/documents/{document_id}/export"),
                    json!({
                        "format": format,
                        "outputPath": output.to_string_lossy()
                    }),
                    vec![],
                )
                .unwrap();
            assert_eq!(exported.body["format"], format);
            assert!(output.exists(), "{format} export should exist");
            assert!(
                std::fs::metadata(output).unwrap().len() > 0,
                "{format} export should not be empty"
            );
        }

        let file = LocalApiFile {
            field_name: "file".to_string(),
            name: "pixel.png".to_string(),
            mime_type: Some("image/png".to_string()),
            data_base64: {
                let mut png=Vec::new();
                image::ImageEncoder::write_image(image::codecs::png::PngEncoder::new(&mut png),&[0,0,0,255],1,1,image::ExtendedColorType::Rgba8).unwrap();
                base64::engine::general_purpose::STANDARD.encode(png)
            },
        };
        let imported = api
            .handle(
                "POST",
                &format!("/api/projects/{project_id}/assets/images"),
                Value::Null,
                vec![file],
            )
            .unwrap();
        assert_eq!(imported.body["asset"]["mimeType"], "image/png");
        let asset_id = imported.body["asset"]["id"].as_str().unwrap().to_string();

        let folder = api
            .handle(
                "POST",
                &format!("/api/projects/{project_id}/folders"),
                json!({
                    "parentId": null,
                    "name": "docs"
                }),
                vec![],
            )
            .unwrap();
        let folder_id = folder.body["node"]["id"].as_str().unwrap().to_string();
        let nested = api
            .handle(
                "POST",
                &format!("/api/projects/{project_id}/documents"),
                json!({
                    "parentId": folder_id,
                    "name": "visual.md",
                    "markdown": "# Visual\n"
                }),
                vec![],
            )
            .unwrap();
        let nested_document_id = nested.body["node"]["id"].as_str().unwrap().to_string();
        let nested_document_id_path = nested_document_id
            .replace("::", "%3A%3A")
            .replace('/', "%2F");
        let reference = api.handle("POST", &format!("/api/projects/{project_id}/documents/{nested_document_id_path}/image-reference"), json!({
            "assetId": asset_id,
            "altText": "Pixel"
        }), vec![]).unwrap();
        assert_eq!(reference.body["markdown"], "![Pixel](../pixel.png)");
        let literal_reference = api.handle("POST", &format!("/api/projects/{project_id}/documents/{nested_document_id_path}/image-reference"), json!({
            "assetId": asset_id,
            "altText": "Pixel [A] *literal* &amp;"
        }), vec![]).unwrap();
        assert_eq!(literal_reference.body["markdown"], r"![Pixel \[A\] \*literal\* \&amp\;](../pixel.png)");
        api.handle("PUT", &format!("/api/documents/{nested_document_id_path}"), json!({
            "markdown": format!("# Visual\n\n{}\n", reference.body["markdown"].as_str().unwrap()),
            "baseFingerprint":api.get_document(&nested_document_id).unwrap()["baseFingerprint"],
            "expectedDraftWriteRevision":api.draft_write_revision(&nested_document_id).unwrap()
        }), vec![]).unwrap();
        let usage = api
            .handle(
                "GET",
                &format!("/api/projects/{project_id}/assets/{asset_id}/usage"),
                Value::Null,
                vec![],
            )
            .unwrap();
        assert_eq!(usage.body["asset"]["usageCount"], 1);
        assert_eq!(
            usage.body["references"][0]["documentPath"],
            "docs/visual.md"
        );
        assert_eq!(
            usage.body["references"][0]["resolvedAssetPath"],
            "pixel.png"
        );
        let impact = api
            .handle(
                "GET",
                &format!(
                    "/api/projects/{project_id}/documents/{nested_document_id_path}/move-impact"
                ),
                Value::Null,
                vec![],
            )
            .unwrap();
        assert_eq!(impact.body["references"].as_array().unwrap().len(), 1);
        assert!(impact.body["message"]
            .as_str()
            .unwrap()
            .contains("referencias de imagen"));
        let image_index = api
            .handle(
                "POST",
                &format!("/api/projects/{project_id}/assets/reindex-images"),
                Value::Null,
                vec![],
            )
            .unwrap();
        assert_eq!(image_index.body["imageCount"], 1);
        assert_eq!(image_index.body["indexedImageCount"], 1);
        let indexed_asset = api
            .handle(
                "GET",
                &format!("/api/projects/{project_id}/assets/{asset_id}"),
                Value::Null,
                vec![],
            )
            .unwrap();
        assert_eq!(indexed_asset.body["indexed"], true);
        assert_eq!(indexed_asset.body["indexStatus"], "indexed");
        let moved_image = api
            .handle(
                "PATCH",
                &format!("/api/projects/{project_id}/nodes/{asset_id}/move"),
                json!({
                    "targetFolderId": folder_id
                }),
                vec![],
            )
            .unwrap();
        assert_eq!(moved_image.status, 200);
        let moved_asset_id = doc_id(&project_id, "docs/pixel.png");
        let nested_after_image_move = api
            .handle(
                "GET",
                &format!("/api/documents/{nested_document_id_path}"),
                Value::Null,
                vec![],
            )
            .unwrap();
        assert!(nested_after_image_move.body["markdown"]
            .as_str()
            .unwrap()
            .contains("![Pixel](pixel.png)"));
        let moved_asset_id_path = moved_asset_id.replace("::", "%3A%3A").replace('/', "%2F");
        let usage_after_image_move = api
            .handle(
                "GET",
                &format!("/api/projects/{project_id}/assets/{moved_asset_id_path}/usage"),
                Value::Null,
                vec![],
            )
            .unwrap();
        assert_eq!(
            usage_after_image_move.body["references"][0]["resolvedAssetPath"],
            "docs/pixel.png"
        );

        let moved_document = api
            .handle(
                "PATCH",
                &format!("/api/projects/{project_id}/nodes/{nested_document_id_path}/move"),
                json!({
                    "targetFolderId": null
                }),
                vec![],
            )
            .unwrap();
        assert_eq!(moved_document.status, 200);
        let root_visual_id = doc_id(&project_id, "visual.md");
        let root_visual_id_path = root_visual_id.replace("::", "%3A%3A").replace('/', "%2F");
        let root_visual = api
            .handle(
                "GET",
                &format!("/api/documents/{root_visual_id_path}"),
                Value::Null,
                vec![],
            )
            .unwrap();
        assert!(root_visual.body["markdown"]
            .as_str()
            .unwrap()
            .contains("![Pixel](docs/pixel.png)"));

        let pdf_path = root.join("reference.pdf");
        std::fs::write(
            &pdf_path,
            knownext_docs::minimal_pdf("reference", "Texto de referencia"),
        )
        .unwrap();
        let preview = api
            .handle(
                "POST",
                &format!("/api/projects/{project_id}/previews"),
                json!({ "path": "reference.pdf" }),
                vec![],
            )
            .unwrap();
        let preview_id = preview.body["id"].as_str().unwrap();
        assert_eq!(preview.body["format"], "pdf");
        let preview_text = api
            .handle(
                "GET",
                &format!("/api/projects/{project_id}/previews/{preview_id}/text"),
                Value::Null,
                vec![],
            )
            .unwrap();
        assert_eq!(preview_text.body["searchable"], true);

        let xlsx_path = root.join("budget.xlsx");
        knownext_docs::write_xlsx(
            &xlsx_path,
            "Presupuesto",
            &[
                vec!["Concepto".to_string(), "Importe".to_string()],
                vec!["Licencias".to_string(), "1200".to_string()],
            ],
        )
        .unwrap();
        let xlsx_preview = api
            .handle(
                "POST",
                &format!("/api/projects/{project_id}/previews"),
                json!({ "path": "budget.xlsx", "preferredMode": "spreadsheet" }),
                vec![],
            )
            .unwrap();
        let xlsx_preview_id = xlsx_preview.body["id"].as_str().unwrap();
        assert_eq!(xlsx_preview.body["format"], "xlsx");
        assert_eq!(xlsx_preview.body["sheets"][0]["name"], "Presupuesto");
        assert_eq!(xlsx_preview.body["sheets"][0]["rowCount"], 2);
        assert_eq!(xlsx_preview.body["sheets"][0]["columnCount"], 2);
        let sheets = api
            .handle(
                "GET",
                &format!("/api/projects/{project_id}/previews/{xlsx_preview_id}/sheets"),
                Value::Null,
                vec![],
            )
            .unwrap();
        let sheet_id = sheets.body["sheets"][0]["id"].as_str().unwrap();
        let sheet = api
            .handle(
                "GET",
                &format!("/api/projects/{project_id}/previews/{xlsx_preview_id}/sheets/{sheet_id}"),
                Value::Null,
                vec![],
            )
            .unwrap();
        assert_eq!(sheet.body["name"], "Presupuesto");
        assert!(sheet.body["cells"]
            .as_array()
            .unwrap()
            .iter()
            .any(|cell| cell["address"] == "A1" && cell["displayValue"] == "Concepto"));
        assert!(sheet.body["cells"]
            .as_array()
            .unwrap()
            .iter()
            .any(|cell| cell["address"] == "B2" && cell["displayValue"] == "1200"));

        let binary = api
            .content(
                &format!("/api/documents/{document_id}/export/content"),
                json!({ "format": "pdf" }),
            )
            .unwrap();
        assert_eq!(binary.status, 200);
        assert_eq!(binary.content_type, "application/pdf");
        assert!(!binary.data_base64.is_empty());
    }

    #[test]
    fn export_image_assets_resolves_relative_internal_and_data_images() {
        let api = api();
        let (project_id, root) = create_project(&api);
        let document_id =
            create_document_with_parent(&api, &project_id, "", "visual.md", "# Visual\n");
        let png = base64::engine::general_purpose::STANDARD
            .decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=")
            .unwrap();
        std::fs::create_dir_all(root.join("assets")).unwrap();
        std::fs::write(root.join("assets").join("pixel.png"), &png).unwrap();
        let markdown = format!(
            "![Relativa](assets/pixel.png)\n\n![Interna](http://knownext-asset.localhost/{}/assets%2Fpixel.png)\n\n![Embebida](data:image/png;base64,{})\n",
            project_id,
            base64::engine::general_purpose::STANDARD.encode(&png)
        );

        let assets = api.export_image_assets_checked(&document_id, &markdown).unwrap();

        assert_eq!(assets.len(), 3);
        assert!(assets.iter().any(|asset| asset.source == "assets/pixel.png"
            && asset.content_type == "image/png"
            && asset.alt.as_deref() == Some("Relativa")));
        assert!(assets.iter().any(|asset| asset
            .source
            .starts_with("http://knownext-asset.localhost/")
            && asset.alt.as_deref() == Some("Interna")));
        assert!(assets
            .iter()
            .any(|asset| asset.source.starts_with("data:image/png;base64,")
                && asset.alt.as_deref() == Some("Embebida")));
        assert_eq!(
            knownext_asset_url_relative(&format!(
                "http://knownext-asset.localhost/{}/assets%2Fpixel.png",
                project_id
            ))
            .as_deref(),
            Some("assets/pixel.png")
        );
    }

    #[test]
    fn ai_context_and_prompt_contracts_are_local_runtime_backed() {
        let api = api();
        let (project_id, root) = create_project(&api);
        let document_id = create_document(
            &api,
            &project_id,
            "context.md",
            "# Contexto\nBusca este contenido.",
        );

        let search = api
            .handle(
                "GET",
                &format!("/api/projects/{project_id}/ai/context/search?q=contenido"),
                Value::Null,
                vec![],
            )
            .unwrap();
        assert_eq!(search.status, 200);
        assert_eq!(
            search.body.as_array().unwrap()[0]["documentId"],
            document_id
        );

        let prompt = api
            .handle(
                "POST",
                &format!("/api/documents/{document_id}/ai/prompt"),
                json!({
                    "prompt": "Resume el documento activo"
                }),
                vec![],
            )
            .unwrap();
        assert_eq!(prompt.status, 200);
        assert_eq!(prompt.body["suggestedActions"][0], "Configurar OpenAI");
        assert!(prompt.body["answer"].as_str().unwrap().contains("OpenAI"));

        let source = api
            .handle(
                "POST",
                &format!("/api/projects/{project_id}/ai/context/project-documents"),
                json!({
                    "documentId": document_id
                }),
                vec![],
            )
            .unwrap();
        assert_eq!(source.body["id"], document_id);
        assert_eq!(source.body["kind"], "project_document");
        let sources = api
            .handle(
                "GET",
                &format!("/api/projects/{project_id}/ai/context/sources"),
                Value::Null,
                vec![],
            )
            .unwrap();
        assert_eq!(sources.body["sources"].as_array().unwrap().len(), 1);
        assert_eq!(sources.body["sources"][0]["id"], document_id);
        assert!(sources.body["sources"][0]["text"].is_null());

        let preview = api
            .handle(
                "GET",
                &format!("/api/projects/{project_id}/ai/context/sources/{document_id}/preview"),
                Value::Null,
                vec![],
            )
            .unwrap();
        assert!(preview.body["source"]["text"].is_null());
        assert!(preview.body["previewText"]
            .as_str()
            .unwrap()
            .contains("Busca este contenido"));

        let nested_folder = api
            .handle(
                "POST",
                &format!("/api/projects/{project_id}/folders"),
                json!({
                    "parentId": null,
                    "name": "nested"
                }),
                vec![],
            )
            .unwrap();
        let nested_folder_id = nested_folder.body["node"]["id"]
            .as_str()
            .unwrap()
            .to_string();
        let nested_document_id = create_document_with_parent(
            &api,
            &project_id,
            &nested_folder_id,
            "inside.md",
            "# Dentro\nContexto en subcarpeta.",
        );
        let nested_document_id_path = child_id_for_path(&nested_document_id);
        let nested_prompt = api
            .handle(
                "POST",
                &format!("/api/documents/{nested_document_id_path}/ai/prompt"),
                json!({
                    "prompt": "Resume el documento dentro de carpeta",
                    "markdown": "# Dentro\nContexto en subcarpeta."
                }),
                vec![],
            )
            .unwrap();
        assert_eq!(nested_prompt.status, 200);
        assert!(nested_prompt.body["answer"]
            .as_str()
            .unwrap()
            .contains("OpenAI"));

        let nested_source = api
            .handle(
                "POST",
                &format!("/api/projects/{project_id}/ai/context/project-documents"),
                json!({
                    "documentId": nested_document_id
                }),
                vec![],
            )
            .unwrap();
        assert_eq!(nested_source.body["id"], nested_document_id);
        let nested_preview = api.handle("GET", &format!("/api/projects/{project_id}/ai/context/sources/{nested_document_id_path}/preview"), Value::Null, vec![]).unwrap();
        assert_eq!(nested_preview.status, 200);
        assert!(nested_preview.body["previewText"]
            .as_str()
            .unwrap()
            .contains("Contexto en subcarpeta"));

        let uploaded_file = LocalApiFile {
            field_name: "files".to_string(),
            name: "brief.txt".to_string(),
            mime_type: Some("text/plain".to_string()),
            data_base64: base64::engine::general_purpose::STANDARD
                .encode("Contenido externo para convertir en documento."),
        };
        let uploaded = api
            .handle(
                "POST",
                &format!("/api/projects/{project_id}/ai/context/files"),
                Value::Null,
                vec![uploaded_file],
            )
            .unwrap();
        let uploaded_id = uploaded.body["sources"]
            .as_array()
            .unwrap()
            .iter()
            .find(|source| source["name"].as_str() == Some("brief.txt"))
            .and_then(|source| source["id"].as_str())
            .unwrap()
            .to_string();
        let local_context_path = root.join("local-context.md");
        std::fs::write(
            &local_context_path,
            "# Local\nArchivo elegido con picker nativo.",
        )
        .unwrap();
        let local_uploaded = api
            .handle(
                "POST",
                &format!("/api/projects/{project_id}/ai/context/local-files"),
                json!({
                    "paths": [local_context_path.to_string_lossy()]
                }),
                vec![],
            )
            .unwrap();
        assert_eq!(local_uploaded.status, 200);
        let local_source = local_uploaded.body["sources"]
            .as_array()
            .unwrap()
            .iter()
            .find(|source| source["name"].as_str() == Some("local-context.md"))
            .unwrap();
        assert_eq!(local_source["kind"], "external_file");
        assert!(local_source["text"].is_null());
        let local_uploaded_id = local_source["id"].as_str().unwrap();
        let local_preview = api
            .handle(
                "GET",
                &format!(
                    "/api/projects/{project_id}/ai/context/sources/{local_uploaded_id}/preview"
                ),
                Value::Null,
                vec![],
            )
            .unwrap();
        assert!(local_preview.body["previewText"]
            .as_str()
            .unwrap()
            .contains("Archivo elegido con picker nativo"));

        let added = api
            .handle(
                "POST",
                &format!(
                    "/api/projects/{project_id}/ai/context/sources/{uploaded_id}/add-to-project"
                ),
                json!({
                    "name": "brief.md",
                    "parentId": null
                }),
                vec![],
            )
            .unwrap();
        assert_eq!(added.status, 200);
        assert_eq!(added.body["path"], "brief.md");
        assert!(root.join("brief.md").exists());
        assert!(std::fs::read_to_string(root.join("brief.md"))
            .unwrap()
            .contains("Contenido externo para convertir en documento."));
        assert!(!added.body["tree"].as_array().unwrap().is_empty());

        let interaction = api
            .handle(
                "POST",
                &format!("/api/projects/{project_id}/ai/interactions"),
                json!({
                    "prompt": "Propón un siguiente paso",
                    "documentId": document_id,
                    "activeDocumentBaseFingerprint": api.fingerprint(&root.join("context.md")),
                    "clientMessageId": "client-test-message",
                    "contextSourceIds": [document_id]
                }),
                vec![],
            )
            .unwrap();
        assert_eq!(interaction.status, 200);
        assert_eq!(interaction.body["status"], "error");
        assert_eq!(
            interaction.body["operations"][0]["type"],
            "provider_unavailable"
        );
        assert_eq!(
            interaction.body["conversationEvents"][0]["id"],
            "client-test-message"
        );
        assert_eq!(
            interaction.body["conversationEvents"][0]["type"],
            "user_message"
        );
        assert_eq!(
            interaction.body["conversationEvents"][0]["content"],
            "Propón un siguiente paso"
        );
        assert_eq!(
            interaction.body["conversationEvents"][1]["type"],
            "provider_unavailable"
        );
        assert!(interaction.body["conversationEvents"][1]["sourcesUsed"][0]["text"].is_null());
        let conversation = api
            .handle(
                "GET",
                &format!("/api/projects/{project_id}/ai/conversation"),
                Value::Null,
                vec![],
            )
            .unwrap();
        assert_eq!(conversation.body["events"].as_array().unwrap().len(), 2);

        let transcription = api
            .handle(
                "POST",
                "/api/transcription",
                json!({ "language": "es" }),
                vec![],
            )
            .unwrap();
        assert_eq!(transcription.body["status"], "error");
        assert_eq!(transcription.body["error"], "missing_audio");

        let index = api
            .handle(
                "GET",
                &format!("/api/projects/{project_id}/ai/index/status"),
                Value::Null,
                vec![],
            )
            .unwrap();
        assert_eq!(index.body["localExactReady"], true);
        assert_eq!(index.body["enabled"], true);
        assert_eq!(index.body["status"], "not-indexed");
        assert!(index.body["vectorStoreId"].is_null());
        assert!(index.body["lastIndexedAt"].is_null());
        assert_eq!(index.body["documentCount"], 4);
        assert_eq!(index.body["indexedDocumentCount"], 0);

        let rebuilt = api
            .handle(
                "POST",
                &format!("/api/projects/{project_id}/ai/index/rebuild"),
                Value::Null,
                vec![],
            )
            .unwrap();
        assert_eq!(rebuilt.body["enabled"], true);
        assert_eq!(rebuilt.body["status"], "updated");
        assert_eq!(
            rebuilt.body["vectorStoreId"],
            format!("local-rag:{project_id}")
        );
        assert_eq!(rebuilt.body["documentCount"], 4);
        assert_eq!(rebuilt.body["indexedDocumentCount"], 4);
        assert!(rebuilt.body["lastIndexedAt"]
            .as_str()
            .unwrap()
            .starts_with("20"));
        let index_file = api.read_ai_index(&project_id).unwrap().unwrap().value;
        assert!(index_file["chunks"]
            .as_array()
            .unwrap()
            .iter()
            .any(|chunk| {
                chunk["text"]
                    .as_str()
                    .unwrap_or("")
                    .contains("Busca este contenido")
            }));

        let deleted = api
            .handle(
                "DELETE",
                &format!("/api/projects/{project_id}/ai/index"),
                json!({"revision":rebuilt.body["indexRevision"]}),
                vec![],
            )
            .unwrap();
        assert_eq!(deleted.body["enabled"], true);
        assert_eq!(deleted.body["status"], "not-indexed");
        assert_eq!(deleted.body["indexedDocumentCount"], 0);
    }

    #[test]
    fn ai_research_brief_and_failure_contracts_are_local_runtime_backed() {
        let api = api();
        let (project_id, _root) = create_project(&api);
        // Reach the missing-key branch with a supported, explicit local configuration.
        api.update_config(json!({"ai":{"agentic":{"webResearchEnabled":true}}})).unwrap();
        api.research_state_preflight(&project_id).unwrap();
        let document_id = create_document(
            &api,
            &project_id,
            "contexto.md",
            "# Contexto\nContenido local.",
        );
        let _source = api
            .handle(
                "POST",
                &format!("/api/projects/{project_id}/ai/context/project-documents"),
                json!({ "documentId": document_id }),
                vec![],
            )
            .unwrap();

        let brief = api
            .handle(
                "POST",
                &format!("/api/projects/{project_id}/ai/research/brief"),
                json!({
                    "prompt": "Investiga la normativa aplicable",
                    "contextSourceIds": [document_id]
                }),
                vec![],
            )
            .unwrap();
        assert_eq!(brief.status, 200);
        assert_eq!(brief.body["projectId"], project_id);
        assert_eq!(brief.body["depth"], "deep");
        assert_eq!(brief.body["sourceScope"], "web_project");
        assert_eq!(brief.body["resultTarget"], "new_document");
        assert_eq!(
            brief.body["plan"]["reportSkillId"],
            "knownext.research_report"
        );
        assert_eq!(brief.body["reportProfile"]["diagramsEnabled"], true);
        assert_eq!(brief.body["reportProfile"]["imagesEnabled"], true);
        assert!(brief.body["plan"]["auxiliarySkillIds"]
            .as_array()
            .unwrap()
            .iter()
            .any(|skill| skill == "knownext.markdown"));
        assert_eq!(
            brief.body["plan"]["secondaryObjectives"]
                .as_array()
                .unwrap()
                .len(),
            3
        );
        assert_eq!(
            brief.body["plan"]["researchAspects"]
                .as_array()
                .unwrap()
                .len(),
            5
        );
        assert_eq!(brief.body["questions"].as_array().unwrap().len(), 5);

        let missing_key_job = api
            .handle(
                "POST",
                &format!("/api/projects/{project_id}/ai/research/jobs"),
                json!({
                    "brief": brief.body,
                    "contextSourceIds": [document_id]
                }),
                vec![],
            )
            .unwrap();
        assert_eq!(missing_key_job.status, 200);
        assert_eq!(missing_key_job.body["status"], "planning");
        assert_eq!(missing_key_job.body["progress"], 5);
        let missing_key_job_id = missing_key_job.body["id"].as_str().unwrap();
        let failed_job = wait_for_research_status(&api, &project_id, missing_key_job_id, "failed");
        assert_eq!(failed_job["error"]["code"], "openai_key_missing", "{failed_job}");

        let list = api
            .handle(
                "GET",
                &format!("/api/projects/{project_id}/ai/research/jobs"),
                Value::Null,
                vec![],
            )
            .unwrap();
        assert!(list.body["jobs"]
            .as_array()
            .unwrap()
            .iter()
            .any(|job| job["id"] == failed_job["id"]));

        let retry = api
            .handle(
                "POST",
                &format!("/api/projects/{project_id}/ai/research/jobs/{missing_key_job_id}/retry"),
                Value::Null,
                vec![],
            )
            .unwrap();
        assert_eq!(retry.body["retryOfJobId"], missing_key_job_id);

        let cancel = api
            .handle(
                "POST",
                &format!(
                    "/api/projects/{project_id}/ai/research/jobs/{}/cancel",
                    retry.body["id"].as_str().unwrap()
                ),
                Value::Null,
                vec![],
            )
            .unwrap();
        assert_eq!(cancel.body["status"], "cancelled");

        let sources = api
            .handle(
                "GET",
                &format!(
                    "/api/projects/{project_id}/ai/research/jobs/{missing_key_job_id}/sources"
                ),
                Value::Null,
                vec![],
            )
            .unwrap();
        assert_eq!(sources.body["sources"].as_array().unwrap().len(), 0);
        let quality = api
            .handle(
                "GET",
                &format!(
                    "/api/projects/{project_id}/ai/research/jobs/{missing_key_job_id}/quality"
                ),
                Value::Null,
                vec![],
            )
            .unwrap();
        assert_eq!(quality.body["status"], "fail");
    }

    #[test]
    fn ai_research_job_blocks_web_when_research_web_is_disabled() {
        let api = api();
        let (project_id, _root) = create_project(&api);
        let config = api
            .handle(
                "PUT",
                "/api/config/ai",
                json!({
                    "provider": "openai",
                    "model": "gpt-5.4-mini",
                    "permissions": default_ai_config()["permissions"].clone(),
                    "rag": default_ai_config()["rag"].clone(),
                    "vision": default_ai_config()["vision"].clone(),
                    "imageGeneration": default_ai_config()["imageGeneration"].clone(),
                    "agentic": {
                        "depth": "guided",
                        "webResearchEnabled": false,
                        "confirmBeforeApplying": true,
                        "maxSteps": 4,
                        "maxDocuments": 6,
                        "maxEstimatedCostEur": 1,
                        "maxSources": 6,
                        "researchPresets": default_ai_config()["agentic"]["researchPresets"].clone()
                    },
                    "transcription": default_ai_config()["transcription"].clone(),
                    "diagrams": default_ai_config()["diagrams"].clone()
                }),
                vec![],
            )
            .unwrap();
        assert_eq!(config.body["agentic"]["webResearchEnabled"], false);
        let brief = api
            .handle(
                "POST",
                &format!("/api/projects/{project_id}/ai/research/brief"),
                json!({ "prompt": "Investiga fuentes online" }),
                vec![],
            )
            .unwrap();
        let job = api
            .handle(
                "POST",
                &format!("/api/projects/{project_id}/ai/research/jobs"),
                json!({ "brief": brief.body }),
                vec![],
            )
            .unwrap();
        let failed = wait_for_research_status(
            &api,
            &project_id,
            job.body["id"].as_str().unwrap(),
            "failed_provider",
        );
        assert_eq!(failed["error"]["code"], "web_research_disabled");
    }

    #[test]
    fn ai_research_brief_builds_reviewable_plan_with_sources_and_length() {
        let api = api();
        let (project_id, _root) = create_project(&api);

        let brief = api
            .handle(
                "POST",
                &format!("/api/projects/{project_id}/ai/research/brief"),
                json!({
                    "prompt": "Comprar un Mazda MX-5",
                    "intent": { "research": { "sourceScope": "web_project" } }
                }),
                vec![],
            )
            .unwrap();
        assert_eq!(brief.body["depth"], "deep");
        assert_eq!(brief.body["sourceScope"], "web_project");
        assert_eq!(brief.body["templateId"], "state_of_art");
        assert_eq!(brief.body["confirmBeforeCreating"], false);
        assert_eq!(brief.body["candidateSourceLimit"], 50);
        assert_eq!(brief.body["reportLength"], "brief");
        assert_eq!(brief.body["plan"]["sourceScope"], "web_project");
        assert_eq!(brief.body["plan"]["autoStartAfterSeconds"], 60);
        assert_eq!(brief.body["plan"]["proposedCandidateSourceLimit"], 50);
        assert_eq!(brief.body["plan"]["candidateSourceLimit"], 50);
        assert_eq!(brief.body["plan"]["proposedReportLength"], "brief");
        assert_eq!(brief.body["plan"]["reportLength"], "brief");
        assert!(brief.body["plan"]["planningRationale"]
            .as_str()
            .unwrap()
            .contains("50 fuentes candidatas"));
        assert_eq!(
            brief.body["plan"]["reportSkillId"],
            "knownext.research_report"
        );
        assert!(brief.body["plan"]["outputSummary"]
            .as_str()
            .unwrap()
            .contains("Web activa"));
        assert!(brief.body["plan"]["visualPlan"]
            .as_str()
            .unwrap()
            .contains("Diagramas"));
        assert_eq!(
            brief.body["plan"]["secondaryObjectives"]
                .as_array()
                .unwrap()
                .len(),
            3
        );
        assert_eq!(
            brief.body["plan"]["researchAspects"]
                .as_array()
                .unwrap()
                .len(),
            5
        );
        assert!(brief.body["plan"]["researchAspects"]
            .as_array()
            .unwrap()
            .iter()
            .any(|item| item
                .as_str()
                .unwrap_or("")
                .contains("Comprar un Mazda MX-5")));

        let edited = api
            .handle(
                "POST",
                &format!("/api/projects/{project_id}/ai/research/brief"),
                json!({
                    "prompt": "Necesito comparar muchas alternativas, riesgos, costes, mantenimiento, regulacion, mercado y recomendaciones para una decision de compra compleja",
                    "intent": { "research": { "candidateSourceLimit": 500, "reportLength": "exhaustive" } }
                }),
                vec![],
            )
            .unwrap();
        assert_eq!(edited.body["candidateSourceLimit"], 500);
        assert_eq!(edited.body["reportLength"], "exhaustive");
        assert_eq!(edited.body["plan"]["candidateSourceLimit"], 500);
        assert_eq!(edited.body["plan"]["reportLength"], "exhaustive");
    }

    #[test]
    fn ai_research_brief_records_user_request_in_conversation() {
        let api = api();
        let (project_id, _root) = create_project(&api);
        let document_id =
            create_document(&api, &project_id, "notas.md", "# Notas\nContenido base.");

        let brief = api
            .handle(
                "POST",
                &format!("/api/projects/{project_id}/ai/research/brief"),
                json!({
                    "prompt": "Investiga los puntos pendientes de estas notas",
                    "activeMarkdown": "# Notas\nContenido base.",
                    "documentId": document_id,
                    "clientMessageId": "client-research-notes",
                    "clientContext": {
                        "lastDocumentId": document_id,
                        "lastDocumentPath": "notas.md"
                    },
                    "intent": { "research": { "depth": "deep", "sourceScope": "web_project", "templateId": "state_of_art" } }
                }),
                vec![],
            )
            .unwrap();
        assert_eq!(brief.status, 200);

        let conversation = api
            .handle(
                "GET",
                &format!("/api/projects/{project_id}/ai/conversation"),
                Value::Null,
                vec![],
            )
            .unwrap();
        let events = conversation.body["events"].as_array().unwrap();
        let user_event = events
            .iter()
            .find(|event| event["id"] == "client-research-notes")
            .expect("research prompt should be stored as a user conversation event");
        assert_eq!(user_event["type"], "user_message");
        assert_eq!(user_event["role"], "user");
        assert_eq!(
            user_event["content"],
            "Investiga los puntos pendientes de estas notas"
        );
        assert_eq!(user_event["documentId"], document_id);
        assert_eq!(user_event["path"], "notas.md");
    }

    #[test]
    fn ai_research_brief_migrates_legacy_research_visual_config() {
        let api = api();
        let (project_id, _root) = create_project(&api);
        let mut config = default_ai_config();
        config["agentic"]["maxSources"] = Value::from(6);
        config["agentic"]["researchDiagramsEnabled"] = Value::Null;
        config["agentic"]["researchImagesEnabled"] = Value::Null;
        config["agentic"]["researchPresets"]["deep"]["sourceScope"] = Value::from("project");
        config["agentic"]["researchPresets"]["deep"]["candidateSourceLimit"] = Value::from(500);
        config["agentic"]["researchPresets"]["deep"]["estimatedDurationLabel"] =
            Value::from("20 min");
        config["agentic"]["researchPresets"]["deep"]["autoStartAfterSeconds"] = Value::from(5);
        config["agentic"]["researchPresets"]["deep"]["reportLength"] = Value::from("long");
        config["agentic"]["researchPresets"]["deep"]["reportStyle"] = Value::from("technical");
        config["agentic"]["researchPresets"]["deep"]["tables"] = Value::from("required");
        config["agentic"]["researchPresets"]["deep"]["diagrams"] = Value::from("required");
        config["agentic"]["researchPresets"]["deep"]["images"] = Value::from("existing_assets");
        config["agentic"]["researchPresets"]["deep"]["citationLevel"] = Value::from("strict");
        let saved = api.handle("PUT", "/api/config/ai", config, vec![]).unwrap();
        assert!(saved.body["agentic"]["researchPresets"]["deep"]["sourceScope"].is_null());
        assert_eq!(
            saved.body["agentic"]["researchPresets"]["deep"]["diagramsEnabled"],
            true
        );
        assert_eq!(
            saved.body["agentic"]["researchPresets"]["deep"]["imagesEnabled"],
            true
        );
        assert_eq!(saved.body["agentic"]["researchDiagramsEnabled"], true);
        assert_eq!(saved.body["agentic"]["researchImagesEnabled"], true);

        let brief = api
            .handle(
                "POST",
                &format!("/api/projects/{project_id}/ai/research/brief"),
                json!({
                    "prompt": "Investiga un contrato de mantenimiento",
                    "intent": { "research": { "depth": "deep", "sourceScope": "web_project", "templateId": "state_of_art" } }
                }),
                vec![],
            )
            .unwrap();

        assert_eq!(brief.body["depth"], "deep");
        assert_eq!(brief.body["sourceScope"], "web_project");
        assert_eq!(brief.body["maxSources"], 50);
        assert_eq!(brief.body["candidateSourceLimit"], 50);
        assert_eq!(brief.body["plan"]["sourceScope"], "web_project");
        assert_eq!(brief.body["plan"]["estimatedDurationLabel"], "4-10 min");
        assert_eq!(brief.body["plan"]["autoStartAfterSeconds"], 60);
        assert_eq!(brief.body["reportProfile"]["diagramsEnabled"], true);
        assert_eq!(brief.body["reportProfile"]["imagesEnabled"], true);
        assert_eq!(
            brief.body["plan"]["secondaryObjectives"]
                .as_array()
                .unwrap()
                .len(),
            3
        );
        assert_eq!(
            brief.body["plan"]["researchAspects"]
                .as_array()
                .unwrap()
                .len(),
            5
        );
    }

    #[test]
    fn ai_skills_contracts_are_global_and_readonly() {
        let api = api();

        let list = api
            .handle("GET", "/api/ai/skills", Value::Null, vec![])
            .unwrap();
        assert_eq!(list.status, 200);
        let skills = list.body["skills"].as_array().unwrap();
        assert!(skills.iter().any(|skill| skill["id"] == "knownext.mermaid"
            && skill["source"] == "base"
            && skill["visibility"] == "readonly"
            && skill["runtimeEnabled"] == true
            && skill["modes"]
                .as_array()
                .unwrap()
                .iter()
                .any(|mode| mode["id"] == "diagram_structure")));
        assert!(skills
            .iter()
            .any(|skill| skill["id"] == "knownext.research_report"
                && skill["source"] == "base"
                && skill["visibility"] == "readonly"
                && skill["runtimeEnabled"] == true
                && skill["modes"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .any(|mode| mode["id"] == "profundo")));

        let detail = api
            .handle(
                "GET",
                "/api/ai/skills/knownext.mermaid",
                Value::Null,
                vec![],
            )
            .unwrap();
        assert_eq!(detail.status, 200);
        assert_eq!(detail.body["manifest"]["id"], "knownext.mermaid");
        assert!(detail.body["mermaidCatalog"]
            .as_array()
            .unwrap()
            .iter()
            .any(|item| item["id"] == "architecture-beta"));
        assert!(detail.body["instructionsMarkdown"]
            .as_str()
            .unwrap()
            .contains("architecture-beta"));

        let research_detail = api
            .handle(
                "GET",
                "/api/ai/skills/knownext.research_report",
                Value::Null,
                vec![],
            )
            .unwrap();
        assert_eq!(research_detail.status, 200);
        assert_eq!(
            research_detail.body["manifest"]["id"],
            "knownext.research_report"
        );
        assert!(research_detail.body["manifest"]["orchestratesSkills"]
            .as_array()
            .unwrap()
            .iter()
            .any(|skill| skill == "knownext.markdown"));
        assert!(research_detail.body["instructionsMarkdown"]
            .as_str()
            .unwrap()
            .contains("Skills Auxiliares"));

        let validation = api
            .handle(
                "POST",
                "/api/ai/skills/knownext.mermaid/validate",
                Value::Null,
                vec![],
            )
            .unwrap();
        assert_eq!(validation.status, 200);
        assert_eq!(validation.body["status"], "valid");

        let preview = api
            .handle(
                "POST",
                "/api/ai/skills/selection-preview",
                json!({ "prompt": "Crea una tabla Markdown comparativa", "expectedAction": "answer" }),
                vec![],
            )
            .unwrap();
        assert_eq!(preview.status, 200);
        assert!(preview.body["candidateSkills"]
            .as_array()
            .unwrap()
            .iter()
            .any(|skill| skill["id"] == "knownext.markdown"));

        let missing = api
            .handle(
                "GET",
                "/api/ai/skills/knownext.missing",
                Value::Null,
                vec![],
            )
            .unwrap();
        assert_eq!(missing.status, 404);
    }

    #[test]
    fn ai_document_creation_operation_materializes_markdown_and_tree() {
        let api = api();
        let (project_id, root) = create_project(&api);
        let mut response = json!({
            "status": "completed",
            "answer": "He creado el documento.",
            "conversationEvents": [{
                "id": "event",
                "projectId": project_id,
                "type": "document_created",
                "role": "assistant",
                "content": "He creado el documento.",
                "createdAt": "2026-06-05T00:00:00Z",
                "documentId": null,
                "path": null,
                "paths": [],
                "summary": "Documento creado",
                "sourcesUsed": []
            }],
            "operations": [{
                "type": "document_created",
                "status": "ready",
                "message": "Documento creado",
                "documentId": null,
                "nodeId": null,
                "path": null,
                "paths": [],
                "summary": "Documento creado",
                "task": null,
                "confirmationId": null,
                "name": "plan.md",
                "markdown": "# Plan\n\nCreado por IA."
            }],
            "tree": null
        });

        api.apply_ai_document_creations(&project_id, &json!({}), &mut response)
            .unwrap();

        let document_id = doc_id(&project_id, "plan.md");
        assert_eq!(response["operations"][0]["status"], "completed");
        assert_eq!(response["operations"][0]["documentId"], document_id);
        assert_eq!(response["operations"][0]["path"], "plan.md");
        assert_eq!(response["conversationEvents"][0]["documentId"], document_id);
        assert_eq!(response["conversationEvents"][0]["path"], "plan.md");
        assert!(response["tree"]
            .as_array()
            .unwrap()
            .iter()
            .any(|node| node["id"] == document_id));
        assert_eq!(
            std::fs::read_to_string(root.join("plan.md")).unwrap(),
            "# Plan\n\nCreado por IA."
        );
    }

    #[test]
    fn ai_document_creation_uses_target_parent_context() {
        let api = api();
        let (project_id, root) = create_project(&api);
        let folder = api
            .handle(
                "POST",
                &format!("/api/projects/{project_id}/folders"),
                json!({ "parentId": null, "name": "IA" }),
                vec![],
            )
            .unwrap();
        let folder_id = folder.body["node"]["id"].as_str().unwrap();
        let mut response = json!({
            "status": "completed",
            "answer": "He creado el documento.",
            "conversationEvents": [{
                "id": "event",
                "projectId": project_id,
                "type": "document_created",
                "role": "assistant",
                "content": "He creado el documento.",
                "createdAt": "2026-06-05T00:00:00Z",
                "documentId": null,
                "path": null,
                "paths": [],
                "summary": "Documento creado",
                "sourcesUsed": []
            }],
            "operations": [{
                "type": "document_created",
                "status": "ready",
                "message": "Documento creado",
                "documentId": null,
                "nodeId": null,
                "path": null,
                "paths": [],
                "summary": "Documento creado",
                "task": null,
                "confirmationId": null,
                "name": "plan.md",
                "markdown": "# Plan en IA\n"
            }],
            "tree": null
        });

        api.apply_ai_document_creations(
            &project_id,
            &json!({ "clientContext": { "targetParentId": folder_id } }),
            &mut response,
        )
        .unwrap();

        let document_id = doc_id(&project_id, "IA/plan.md");
        assert_eq!(response["operations"][0]["documentId"], document_id);
        assert_eq!(response["operations"][0]["path"], "IA/plan.md");
        assert_eq!(response["conversationEvents"][0]["path"], "IA/plan.md");
        assert_eq!(
            std::fs::read_to_string(root.join("IA").join("plan.md")).unwrap(),
            "# Plan en IA\n"
        );
    }
}
pub mod currency;
mod api_routes;
mod ai_usage;
mod recovery_system;
pub use recovery_system::FrozenRecoveryCopy;
#[cfg(test)]
use ai_usage::text_estimated_cost;

pub fn is_recovery_lifecycle_work(method:&str,path:&str)->bool{let parts:Vec<_>=path.split('?').next().unwrap_or("").trim_matches('/').split('/').collect();matches!((method,parts.as_slice()),("POST",["api","recovery","families",_,_,"close"|"continue"]))}
