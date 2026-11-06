//! Slow remote/Git services run outside document mutation authority.
use super::*;
use knownext_core::operations::{checkpoint, Resource, Stage};
use std::sync::Mutex;
fn parts(path: &str) -> Vec<String> {
    path.split('?')
        .next()
        .unwrap_or("")
        .trim_matches('/')
        .split('/')
        .map(knownext_core::percent_decode)
        .collect()
}
pub fn is_slow_runtime_work(method: &str, path: &str) -> bool {
    let p = parts(path);
    let p = p.iter().map(String::as_str).collect::<Vec<_>>();
    matches!(
        (method, p.as_slice()),
        (
            "POST",
            ["api", "auth", "github", "device", "start" | "poll"]
        ) | ("GET", ["api", "github", "repositories"])
            | ("GET", ["api", "projects", _, "sync"])
            | ("GET", ["api", "projects", _, "sync", "status"])
            | ("PUT", ["api", "projects", _, "sync-mode"])
            | (
                "POST",
                [
                    "api",
                    "projects",
                    _,
                    "sync",
                    "scan" | "push" | "pull" | "auto-run"
                ]
            )
            | (
                "POST",
                [
                    "api",
                    "projects",
                    _,
                    "github",
                    "connect" | "publish" | "verify-connection"
                ]
            )
            | ("POST", ["api", "projects", _, "versions"])
            | ("POST", ["api", "documents", _, "versions", _, "restore"])
    )
}
pub fn cooperative_runtime_work(method: &str, path: &str) -> bool {
    let p = parts(path);
    let p = p.iter().map(String::as_str).collect::<Vec<_>>();
    matches!(
        (method, p.as_slice()),
        ("POST", ["api", "auth", "github", "device", _])
            | ("GET", ["api", "github", "repositories"])
    ) || index_rebuild_project(method, path).is_some()
}
pub fn runtime_resource(method: &str, path: &str) -> Option<Resource> {
    if is_scheduled_backup_work(method, path)
        || interaction_project_id(method, path).is_some()
        || is_provider_work(method, path)
        || asset_work_request(method, path).is_some()
        || is_export_request(method, path)
        || is_portable_history_work(method, path)
    {
        return None;
    }
    let p = parts(path);
    let p = p.iter().map(String::as_str).collect::<Vec<_>>();
    if matches!(
        p.as_slice(),
        ["api", "auth", "github", ..] | ["api", "github", "repositories"]
    ) {
        return Some(Resource {
            group: "authentication".into(),
            key: "authentication".into(),
            exclusive_group: true,
        });
    }
    let (project, key, exclusive) = match p.as_slice() {
        ["api", "projects", project, "sync" | "github" | "versions", ..] => (
            *project,
            "git".to_owned(),
            method != "GET" && !matches!(p.last(), Some(&"scan" | &"verify-connection")),
        ),
        ["api", "projects", project, ..] => (*project, "structure".to_owned(), method != "GET"),
        ["api", "documents" | "handwritten-notes", id, tail @ ..] => {
            let (project, _) = id.split_once("::")?;
            (
                project,
                if tail.first() == Some(&"versions") {
                    "git".into()
                } else {
                    id.to_string()
                },
                tail.first() == Some(&"versions"),
            )
        }
        _ => return None,
    };
    Some(Resource {
        group: sha256_hex(project.as_bytes()),
        key: sha256_hex(key.as_bytes()),
        exclusive_group: exclusive,
    })
}
pub fn dispatch_slow_runtime(
    mutations: &Mutex<LocalApi>,
    source: &LocalApi,
    method: &str,
    path: &str,
    body: Value,
) -> ApiResult {
    if let Some(failure) = source.request_scope_failure(method, path) {
        return Ok(failure);
    }
    let p = parts(path);
    let p = p.iter().map(String::as_str).collect::<Vec<_>>();
    if matches!(
        p.as_slice(),
        ["api", "auth", ..] | ["api", "github", "repositories"]
    ) {
        checkpoint(Stage::Preparing)?;
        let response = source.handle(method, path, body, vec![])?;
        if let Some(code) = response.body["error"].as_str().filter(|code| {
            matches!(
                *code,
                "operation-stopped-before-publication"
                    | "github-session-changed"
                    | "auth-state-unavailable"
                    | "github-repositories-unavailable"
                    | "github-response-invalid"
            )
        }) {
            return Err(code.into());
        }
        checkpoint(Stage::Publishing)?;
        checkpoint(Stage::Observing)?;
        return Ok(response);
    }
    let project = match p.as_slice() {
        ["api", "projects", project, ..] => project.to_string(),
        ["api", "documents", id, ..] => document_ref(id)?.0,
        _ => return Err("slow-runtime-scope-invalid".into()),
    };
    let _permit = if method == "GET" || matches!(p.last(), Some(&"scan" | &"verify-connection")) {
        source.project_write(&project)?
    } else {
        source.project_transaction(&project)?
    };
    if let ["api", "projects", _, "sync-mode"] = p.as_slice() {
        mutations
            .lock()
            .map_err(|_| "runtime-publication-unavailable")?
            .change_project_sync_mode_local(&project, body)?;
        return ok(source.sync_status(&project));
    }
    if let ["api", "projects", _, "github", action @ ("connect" | "publish")] = p.as_slice() {
        mutations
            .lock()
            .map_err(|_| "runtime-publication-unavailable")?
            .connect_project_github_local(&project, body, *action == "publish")?;
        return ok(source.sync_status(&project));
    }
    source.handle(method, path, body, vec![])
}
