use crate::{require_workspace_window, runtime_dispatch::LocalApiRequest};
use knownext_core::operations::{Lane, Operations, Running, Snapshot};
use knownext_storage::LocalApi;
use tauri::Manager;

fn lane(request: &LocalApiRequest) -> (Lane, u8) {
    let method = request.method.as_str();
    let path = request.path.as_str();
    let parts: Vec<_> = path
        .split('?')
        .next()
        .unwrap_or("")
        .trim_matches('/')
        .split('/')
        .collect();
    if matches!(
        (method, parts.as_slice()),
        ("GET", ["health"])
            | (
                "POST",
                ["api", "projects", _, "nodes", "batch", _, "cancel"]
            )
            | ("GET", ["api", "runtime", "diagnostics"])
    ) {
        return (Lane::Control, 0);
    }
    if knownext_storage::is_scheduled_backup_work(method,path){return (Lane::Transfer,2);}
    if knownext_storage::is_export_batch_work(method,path){return (Lane::Transfer,2);}
    if knownext_storage::is_slow_runtime_work(method,path){return (Lane::Background,1);}
    if let Some((_,kind))=knownext_storage::asset_work_request(method,path){return (if kind==knownext_storage::AssetWorkKind::Images{Lane::Index}else{Lane::Transfer},2);}
    if knownext_storage::interaction_project_id(method, path).is_some()
        || knownext_storage::is_provider_work(method, path)
    {
        return (Lane::Ai, 1);
    }
    if knownext_storage::is_recovery_lifecycle_work(method,path){return (Lane::Transfer,2);}
    if knownext_storage::is_project_transfer_work(method, path)
        || knownext_storage::is_portable_history_work(method, path)
        || knownext_storage::is_export_request(method, path)
    {
        return (Lane::Transfer, 2);
    }
    if knownext_storage::index_rebuild_project(method, path).is_some() {
        return (Lane::Index, 2);
    }
    if LocalApi::is_independent_snapshot(method, path) {
        return (Lane::Query, 1);
    }
    let critical = matches!(
        (method, parts.as_slice()),
        ("PUT", ["api", "documents", _])
            | ("PUT", ["api", "documents", _, "draft"])
            | ("PUT", ["api", "handwritten-notes", _])
            | ("PUT", ["api", "handwritten-notes", _, "draft"])
            | ("PUT", ["api", "notes"])
            | ("PUT", ["api", "config"])
            | ("PUT", ["api", "config", "ai" | "export-template"])
    );
    (
        Lane::Mutation,
        if critical {
            0
        } else if method == "GET" {
            1
        } else {
            2
        },
    )
}
fn validate(request:&LocalApiRequest)->Result<(),String>{if !matches!(request.method.as_str(),"GET"|"POST"|"PUT"|"PATCH"|"DELETE")||request.path.len()>8192||!request.path.starts_with('/')||request.path.chars().any(char::is_control){return Err("invalid-runtime-request".into());}Ok(())}
pub(crate) fn admit(
    app: &tauri::AppHandle,
    request: &LocalApiRequest,
    id: Option<String>,
) -> Result<String, String> {
    validate(request)?;
    let _restart = crate::restart::admission(app)?;
    let id = id.unwrap_or_else(|| knownext_core::compact_id("operation"));
    let (lane, priority) = lane(request);
    app.state::<Operations>()
        .submit_scoped(&id, lane, priority,knownext_storage::runtime_resource(&request.method,&request.path),knownext_storage::cooperative_runtime_work(&request.method,&request.path))
        .map_err(str::to_string)?;
    Ok(id)
}
pub(crate) fn admit_content(
    app: &tauri::AppHandle,
    request: &LocalApiRequest,
    id: Option<String>,
) -> Result<String, String> {
    validate(request)?;
    let _restart = crate::restart::admission(app)?;
    let id = id.unwrap_or_else(|| knownext_core::compact_id("operation"));
    let lane = if knownext_storage::is_export_content_request(&request.method, &request.path) {
        Lane::Transfer
    } else {
        Lane::Query
    };
    app.state::<Operations>()
        .submit(&id, lane, 2)
        .map_err(str::to_string)?;
    Ok(id)
}
pub(crate) fn start(app: &tauri::AppHandle, id: &str) -> Result<Running, String> {
    app.state::<Operations>()
        .inner()
        .wait(id, std::time::Duration::from_secs(120))
        .map_err(str::to_string)
}
pub(crate) fn finish(running: Running, result: Option<bool>) {
    if let Some(succeeded) = result {
        running.finish(succeeded);
    }
}

#[tauri::command]
pub(crate) fn local_operation_status(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
) -> Result<Vec<Snapshot>, String> {
    require_workspace_window(&window)?;
    app.state::<Operations>()
        .snapshots()
        .map_err(str::to_string)
}
#[tauri::command]
pub(crate) async fn cancel_local_operation(app:tauri::AppHandle,window:tauri::WebviewWindow,operation_id:String)->Result<Option<Snapshot>,String>{require_workspace_window(&window)?;tauri::async_runtime::spawn_blocking(move||app.state::<Operations>().cancel(&operation_id).map_err(str::to_string)).await.map_err(|_|"No se pudo solicitar la detención")?}
#[tauri::command]
pub(crate) fn local_operation_continuity(app:tauri::AppHandle,window:tauri::WebviewWindow)->Result<serde_json::Value,String>{require_workspace_window(&window)?;let work=app.state::<Operations>();Ok(serde_json::json!({"schemaVersion":1,"persistenceAvailable":work.continuity_available(),"previousSessionCount":work.snapshots().map_err(str::to_string)?.iter().filter(|s|s.recovered).count(),"checkedAt":knownext_core::now_iso(),"maximumEntries":384,"includesPrivateContent":false}))}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn block9_backup_work_preserves_save_admission() {
        for path in ["/api/projects/p/scheduled-backups/run", "/api/projects/p/scheduled-backups/2/restore"] {
            assert_eq!(lane(&request("POST",path)),(Lane::Transfer,2));
            assert!(knownext_storage::runtime_resource("POST",path).is_none());
        }
        assert_eq!(lane(&request("GET","/api/projects/p/scheduled-backups")),(Lane::Query,1));
        assert_eq!(lane(&request("PUT","/api/documents/p%3A%3Aa.md")),(Lane::Mutation,0));
    }
    fn request(method: &str, path: &str) -> LocalApiRequest {
        LocalApiRequest {
            method: method.into(),
            path: path.into(),
            body: None,
            files: None,
        }
    }
    #[test]fn runtime_block_slow_routes_and_resources_preserve_save_admission(){assert_eq!(lane(&request("POST","/api/auth/github/device/poll")),(Lane::Background,1));assert_eq!(lane(&request("GET","/api/projects/owned/sync/status")),(Lane::Background,1));assert_eq!(lane(&request("PUT","/api/documents/owned%3A%3Adoc.md")),(Lane::Mutation,0));assert!(knownext_storage::runtime_resource("POST","/api/projects/owned/ai/interactions").is_none());assert!(knownext_storage::runtime_resource("POST","/api/projects/owned/assets/images").is_none());assert!(validate(&request("POST","/api/config\n")).is_err());}
    #[test]
    fn lifecycle_review_and_conservation_do_not_occupy_the_save_lane(){assert_eq!(lane(&request("POST","/api/recovery/families/mixed-reviews/key/review")),(Lane::Query,1));assert_eq!(lane(&request("POST","/api/recovery/families/mixed-reviews/key/close")),(Lane::Transfer,2));assert_eq!(lane(&request("GET","/api/recovery/formats")),(Lane::Query,1));assert_eq!(lane(&request("PUT","/api/documents/p%3A%3Aa.md")),(Lane::Mutation,0));}
    #[test]
    fn asset_pipeline_jobs_do_not_occupy_the_save_lane(){
        assert_eq!(lane(&request("POST","/api/projects/p/attachments")),(Lane::Transfer,2));
        assert_eq!(lane(&request("POST","/api/projects/p/assets/images")),(Lane::Transfer,2));
        assert_eq!(lane(&request("POST","/api/projects/p/assets/reindex-images")),(Lane::Index,2));
        assert_eq!(lane(&request("PUT","/api/documents/p%3A%3Aa.md")),(Lane::Mutation,0));
    }
    #[test]
    fn priorities_are_deterministic_and_only_audited_snapshots_bypass_writes() {
        for path in ["/api/notes","/api/handwritten-notes/p%3A%3An.knote/draft","/api/config/ai","/api/config/export-template"] {
            assert_eq!(lane(&request("PUT",path)),(Lane::Mutation,0));
        }
        assert_eq!(
            lane(&request("PUT", "/api/documents/p%3A%3Aa.md")),
            (Lane::Mutation, 0)
        );
        assert_eq!(
            lane(&request("PUT", "/api/documents/p%3A%3Aa.md/draft")),
            (Lane::Mutation, 0)
        );
        assert_eq!(
            lane(&request("POST", "/api/projects/p/nodes/batch/b/cancel")),
            (Lane::Control, 0)
        );
        assert_eq!(
            lane(&request("GET", "/api/projects/p/tree")),
            (Lane::Query, 1)
        );
        assert_eq!(lane(&request("POST", "/api/transcription")), (Lane::Ai, 1));
        assert_eq!(
            lane(&request("POST", "/api/projects/p/unknown")),
            (Lane::Mutation, 2)
        );
    }
    #[test]
    fn block7_native_patch_move_and_rename_follow_the_existing_runtime_contract() {
        for path in ["/api/projects/p/nodes/p%3A%3Aa.md/move","/api/projects/p/nodes/p%3A%3Aa.md/rename"] {
            let value=request("PATCH",path);assert!(validate(&value).is_ok());assert_eq!(lane(&value),(Lane::Mutation,2));
        }
        assert!(validate(&request("TRACE","/api/projects/p")).is_err());
    }

    #[test]
    fn block8_research_evidence_review_stays_outside_provider_work() {
        let get=request("GET","/api/projects/p/research-evidence/job");
        let prepare=request("POST","/api/projects/p/research-evidence/job/prepare");
        let apply=request("POST","/api/projects/p/research-evidence/job/apply");
        for value in [&get,&prepare,&apply] { assert!(!knownext_storage::is_provider_work(&value.method,&value.path)); }
        assert_eq!(lane(&get),(Lane::Query,1));assert_eq!(lane(&prepare),(Lane::Query,1));assert_eq!(lane(&apply),(Lane::Mutation,2));
    }

}
