//! Runtime facade extracted without changing method bodies or public contracts.
use super::*;

impl LocalApi {
    pub(super) fn registry_path(&self) -> PathBuf {
        self.app_data_dir.join("projects.json")
    }
    pub(super) fn config_path(&self) -> PathBuf {
        self.app_data_dir.join("config.json")
    }
    pub(super) fn notes_path(&self) -> PathBuf {
        self.app_data_dir.join("notes.json")
    }
    pub(super) fn export_template_path(&self) -> PathBuf {
        self.app_data_dir.join("export-template.json")
    }
    pub(super) fn auth_path(&self) -> PathBuf {
        self.app_data_dir.join("auth.json")
    }
    pub(super) fn github_device_path(&self) -> PathBuf {
        self.app_data_dir.join("github-device.json")
    }
    pub(super) fn credentials_path(&self) -> PathBuf {
        self.app_data_dir.join("credentials.json")
    }
    pub(super) fn logs_dir(&self) -> PathBuf {
        self.app_data_dir.join("logs")
    }
    pub(super) fn previews_dir(&self) -> PathBuf {
        self.app_data_dir.join("previews")
    }
    pub(super) fn versions_dir(&self) -> PathBuf {
        self.app_data_dir.join("versions")
    }
    pub(super) fn conversation_path(&self, project_id: &str) -> PathBuf {
        self.app_data_dir
            .join("ai")
            .join(format!("{project_id}.json"))
    }
    pub(super) fn ai_usage_path(&self) -> PathBuf {
        self.app_data_dir.join("ai").join("usage.json")
    }
    pub(super) fn context_sources_path(&self, project_id: &str) -> PathBuf {
        self.app_data_dir
            .join("ai-context")
            .join(format!("{project_id}.json"))
    }
    pub(super) fn research_jobs_path(&self, project_id: &str) -> PathBuf {
        self.app_data_dir
            .join("ai-research")
            .join(format!("{project_id}.json"))
    }
    pub(super) fn research_policy_path(&self, project_id: &str) -> PathBuf {
        self.app_data_dir
            .join("ai-research")
            .join(format!("{project_id}.policy.json"))
    }
    pub(super) fn image_index_path(&self, project_id: &str) -> PathBuf {
        self.app_data_dir
            .join("image-index")
            .join(format!("{project_id}.json"))
    }

    pub(super) fn read_json(&self, path: &Path, default: Value) -> Value {
        std::fs::read_to_string(path)
            .ok()
            .and_then(|text| serde_json::from_str(&text).ok())
            .unwrap_or(default)
    }

    pub(super) fn write_json(&self, path: &Path, value: &Value) -> Result<(), String> {
        static WRITES:std::sync::Mutex<()>=std::sync::Mutex::new(());
        let _write=WRITES.lock().map_err(|_|"No se puede coordinar la escritura local")?;
        recovery_lifecycle::ensure_open(self,path)?;
        local_state::before_write(&self.app_data_dir, path, value)?;
        ai_private_state::before_write(&self.app_data_dir, path, value)?;
        ai_operational_state::before_write(&self.app_data_dir, path, value)?;
        ancillary_state::before_write(&self.app_data_dir, path, value)?;
        if self.write_format_transition(path,value)? { return Ok(()); }
        self.preserve_auxiliary_format_transition(path,value)?;
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }
        let content = serde_json::to_vec_pretty(value).map_err(|error| error.to_string())?;
        atomic_io::write(path, &content).map_err(|error| error.to_string())
    }

    pub(super) fn write_json_atomic(&self, path: &Path, value: &Value) -> Result<(), String> {
        self.write_json(path, value)
    }

    pub(super) fn runtime_logging_status(&self) -> Result<Value, String> {self.safe_diagnostic_status()}
    pub(super) fn record_runtime_log(&self, body: Value) -> Result<Value, String> {self.record_safe_diagnostic(body)}

    pub(super) fn open_runtime_folder(&self, body: Value) -> Result<Value, String> {
        let folder_path = body.get("folderPath").and_then(Value::as_str).unwrap_or("");
        if folder_path.trim().is_empty() {
            return Ok(json!({ "opened": false, "message": "No se indicó carpeta local." }));
        }
        std::fs::create_dir_all(folder_path).map_err(|error| error.to_string())?;
        Ok(json!({ "opened": true, "folderPath": folder_path }))
    }

}
