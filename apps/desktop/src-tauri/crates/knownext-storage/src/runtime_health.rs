//! Runtime facade extracted without changing method bodies or public contracts.
use super::*;

impl LocalApi {
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

    pub fn git_diagnostics(&self) -> Value {
        let git = git_version();
        let git_available = git.is_ok();
        let git_version = git.as_ref().ok().cloned();
        let git_error = git.err();
        let registry = self.registry();
        let active_project_id = registry.get("activeProjectId").and_then(Value::as_str);
        let active_project = self.list_projects().into_iter().find(|project| {
            project["id"].as_str() == active_project_id
                || project["active"].as_bool().unwrap_or(false)
        });
        let folder_path = active_project
            .as_ref()
            .and_then(|project| project["folderPath"].as_str())
            .map(str::to_string);
        let root = folder_path.as_ref().map(PathBuf::from);
        let root_exists = root.as_ref().map(|path| path.exists()).unwrap_or(false);
        let git_initialized = root
            .as_ref()
            .map(|path| path.join(".git").exists())
            .unwrap_or(false);
        let origin = root
            .as_ref()
            .filter(|_| git_initialized)
            .and_then(|path| git_remote_url(path, "origin").ok().flatten());
        let sync_mode = active_project
            .as_ref()
            .and_then(|project| project["syncMode"].as_str())
            .unwrap_or("none");
        let is_github = is_github_sync_mode(sync_mode);
        let auth = self.auth_status();
        let authenticated = auth["isAuthenticated"].as_bool().unwrap_or(false);
        let remote_access = if !is_github {
            "not-configured"
        } else if !authenticated {
            "unauthenticated"
        } else if origin.is_none() {
            "unknown"
        } else {
            "available"
        };
        json!({
            "gitAvailable": git_available,
            "gitVersion": git_version,
            "lastError": git_error,
            "projectId": active_project.as_ref().and_then(|project| project["id"].as_str()),
            "projectName": active_project.as_ref().and_then(|project| project["name"].as_str()),
            "folderPath": folder_path,
            "folderExists": root_exists,
            "gitInitialized": git_initialized,
            "origin": origin,
            "syncMode": sync_mode,
            "versioningMode": active_project.as_ref().and_then(|project| project["versioningMode"].as_str()),
            "githubConfigured": is_github,
            "githubAuthenticated": authenticated,
            "remoteAccess": remote_access,
            "checkedAt": knownext_core::now_iso()
        })
    }

}
