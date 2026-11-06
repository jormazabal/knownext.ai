use super::*;

pub(super) fn require_history_runtime() -> Result<(), String> {
    if local_history_available() {
        Ok(())
    } else {
        Err("Git local no está disponible en este dispositivo. Se conservan archivos, borradores y ajustes; no se ha activado el historial ni la sincronización.".into())
    }
}

impl LocalApi {
    pub(super) fn document_history_capability(&self, project_id: &str) -> Result<Value, String> {
        let registry = self.registry_checked()?;
        let project = registry["projects"]
            .as_array()
            .and_then(|projects| {
                projects
                    .iter()
                    .find(|project| project["id"].as_str() == Some(project_id))
            })
            .ok_or("Proyecto no registrado")?;
        let root = self.project_root(project_id)?;
        let enabled = project["versioningMode"]
            .as_str()
            .is_some_and(|mode| mode != "none");
        Ok(history_capability(
            root.join(".git").exists(),
            enabled,
            local_history_available(),
        ))
    }
    pub(super) fn project_capabilities(&self) -> Value {
        let git = local_history_available();
        json!({
            "canCreateLocalProject":true,
            "canOpenLocalFolder":true,
            "canUseLocalGit":git,
            "localGitReason":if git {Value::Null} else {json!("El historial local no está disponible en este dispositivo. Puedes trabajar con archivos y borradores sin conexión.")},
            "canConnectGithub":github_client_id().is_some(),
            "canUseGithubApi":github_client_id().is_some(),
            "requiresGithubLoginForVersioning":false
        })
    }
}

fn history_capability(
    repository_exists: bool,
    recording_enabled: bool,
    platform_available: bool,
) -> Value {
    let (status, reason) = if !platform_available {
        ("unavailable", Some("El historial local no está disponible en este dispositivo. Tus archivos y borradores siguen disponibles sin conexión."))
    } else if repository_exists {
        (
            "ready",
            if recording_enabled {
                None
            } else {
                Some("Puedes consultar el historial existente. Los guardados normales no crean versiones mientras el historial automático esté desactivado.")
            },
        )
    } else if recording_enabled {
        ("not-initialized", Some("El historial está configurado, pero su repositorio local no está disponible. Revisa los ajustes del proyecto; los archivos y borradores se conservan."))
    } else {
        ("disabled", Some("Este proyecto trabaja con archivos y borradores sin crear versiones automáticamente. Puedes revisar el historial en los ajustes del proyecto."))
    };
    json!({"status":status,"recordingEnabled":recording_enabled,"reason":reason,"canConfigure":platform_available&&status!="ready"})
}

#[cfg(test)]
mod history_capability_tests {
    use super::*;
    #[test]
    fn failed_history_preparation_never_acknowledges_activation_or_replaces_registry() {
        let folder = tempfile::tempdir().unwrap();
        let api = LocalApi::new(folder.path().join("app"), "qa".into(), "test".into());
        let project = api
            .create_project(
                json!({"name":"Owned capability QA","versioningMode":"none","syncMode":"none"}),
            )
            .unwrap();
        let id = project["id"].as_str().unwrap();
        let root = api.project_root(id).unwrap();
        // Relocate the complete fixture after releasing its lease; retain coordination bytes.
        api.project_owners.lock().unwrap().clear();
        let parked = folder.path().join("parked-project");
        std::fs::rename(&root, &parked).unwrap();
        std::fs::write(&root, b"owned unavailable-directory sentinel").unwrap();
        let before = std::fs::read(api.registry_path()).unwrap();
        assert!(api.enable_project_history(id).is_err());
        assert_eq!(std::fs::read(api.registry_path()).unwrap(), before);
        assert!(api
            .update_project(id, json!({"versioningMode":"local-git"}))
            .is_err());
        assert_eq!(std::fs::read(api.registry_path()).unwrap(), before);
        assert!(api
            .change_project_sync_mode(id, json!({"syncMode":"manual-local"}))
            .is_err());
        assert_eq!(std::fs::read(api.registry_path()).unwrap(), before);
        // The failure left both the registry and unavailable source sentinel intact.
        // Restore the complete regular folder for the separate legacy-repository scenario.
        let sentinel = folder.path().join("unavailable-source-sentinel");
        std::fs::rename(&root, &sentinel).unwrap();
        std::fs::rename(&parked, &root).unwrap();
        // A legacy association on a regular source remains editable without creating Git.
        api.update_project_fields(id, |p| {
            p["versioningMode"] = json!("local-git");
            p["syncMode"] = json!("manual-local");
        })
        .unwrap();
        let renamed=api.update_project(id,json!({"name":"Renamed legacy entry","versioningMode":"local-git","syncMode":"manual-local"})).unwrap();
        assert_eq!(renamed["name"], "Renamed legacy entry");
        api.change_project_sync_mode(id, json!({"syncMode":"none"}))
            .unwrap();
        assert_eq!(
            std::fs::read(sentinel).unwrap(),
            b"owned unavailable-directory sentinel"
        );
        assert!(!root.join(".git").exists());
    }
    #[test]
    fn history_distinguishes_platform_configuration_and_preserves_existing_read_access() {
        assert_eq!(
            history_capability(true, true, false)["status"],
            "unavailable"
        );
        assert_eq!(history_capability(false, false, true)["status"], "disabled");
        assert_eq!(
            history_capability(false, true, true)["status"],
            "not-initialized"
        );
        let existing = history_capability(true, false, true);
        assert_eq!(existing["status"], "ready");
        assert_eq!(existing["recordingEnabled"], false);
        assert_eq!(
            history_capability(false, true, false)["canConfigure"],
            false
        );
    }
}

// The Android package has no in-process Git implementation yet. Never offer a
// workflow that would depend on an external executable absent from the app.
#[cfg(target_os = "android")]
fn local_history_available() -> bool {
    false
}

#[cfg(not(target_os = "android"))]
fn local_history_available() -> bool {
    use std::process::Stdio;
    let mut command = local_git_command();
    let Ok(mut child) = command
        .arg("--version")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
    else {
        return false;
    };
    let started = std::time::Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(status)) => return status.success(),
            Ok(None) if started.elapsed() < Duration::from_millis(1500) => {
                thread::sleep(Duration::from_millis(20))
            }
            _ => {
                let _ = child.kill();
                let _ = child.wait();
                return false;
            }
        }
    }
}

impl LocalApi {
    pub(super) fn versioning_status(&self, project_id: &str) -> Value {
        let project = self
            .list_projects()
            .into_iter()
            .find(|project| project["id"].as_str() == Some(project_id))
            .unwrap_or_default();
        let versioning_mode = project["versioningMode"].as_str().unwrap_or("none");
        let root = project["folderPath"].as_str().map(PathBuf::from);
        let enabled = versioning_mode != "none";
        let repository_exists = root.as_ref().is_some_and(|root| root.join(".git").exists());
        let git_status = if enabled && repository_exists && !cfg!(target_os = "android") {
            root.as_ref().and_then(|root| git_status_items(root).ok())
        } else {
            None
        };
        let available = enabled && git_status.is_some();
        let local_changes = git_status.as_ref().is_some_and(|items| !items.is_empty());
        let last_hash = root
            .as_ref()
            .filter(|_| available)
            .and_then(|root| git_head_hash(root).ok())
            .flatten();
        let reason = if !enabled {
            Value::from("Historial no disponible en proyectos de archivos locales")
        } else if !repository_exists {
            Value::from("Git local no está inicializado para este proyecto")
        } else if !available {
            Value::from("No se puede consultar el historial local en este dispositivo. Tus archivos y borradores se conservan.")
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
}
