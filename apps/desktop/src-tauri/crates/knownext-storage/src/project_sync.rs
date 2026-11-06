//! Domain services extracted without changing their bodies or JSON contracts.
use super::*;
impl LocalApi {
    pub(super) fn sync_status(&self, project_id: &str) -> Value {
        let project = self
            .list_projects()
            .into_iter()
            .find(|project| project["id"].as_str() == Some(project_id))
            .unwrap_or_default();
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
            let mode = if sync_mode == "auto-github" {
                "github-auto"
            } else {
                "github-manual"
            };
            let authenticated = self.auth_status()["isAuthenticated"]
                .as_bool()
                .unwrap_or(false);
            if authenticated {
                let Some(root) = root.as_ref() else {
                    return github_remote_status(
                        project_id,
                        mode,
                        "error",
                        "Proyecto sin carpeta local",
                        "La carpeta local del proyecto no está disponible.",
                        "missing-local-folder",
                        true,
                        local_changes,
                        local_hash.clone(),
                        None,
                        false,
                        false,
                    );
                };
                if !root.join(".git").exists() {
                    return github_remote_status(
                        project_id,
                        mode,
                        "local-history",
                        "Git local no inicializado",
                        "Inicializa el historial local antes de sincronizar con GitHub.",
                        "missing-local-git",
                        true,
                        local_changes,
                        local_hash.clone(),
                        None,
                        false,
                        false,
                    );
                }
                let Some((owner, repo, default_branch)) = github_repository_parts(
                    project.get("githubRepository").unwrap_or(&Value::Null),
                ) else {
                    return github_remote_status(
                        project_id,
                        mode,
                        "local-history",
                        "Repositorio GitHub incompleto",
                        "Configura owner/repo para activar la sincronización remota.",
                        "missing-remote-config",
                        true,
                        local_changes,
                        local_hash.clone(),
                        None,
                        local_hash.is_some(),
                        false,
                    );
                };
                let branch = default_branch.unwrap_or_else(|| {
                    current_git_branch(root).unwrap_or_else(|| "main".to_string())
                });
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
                        return github_remote_status(
                            project_id,
                            mode,
                            remote.state,
                            remote.label,
                            &remote.detail,
                            remote.access,
                            true,
                            local_changes,
                            local_hash.clone(),
                            None,
                            local_hash.is_some() || local_changes,
                            false,
                        );
                    }
                };
                let delta = match git_remote_delta(root, &token, &branch, remote_hash.is_some()) {
                    Ok(delta) => delta,
                    Err(message) => {
                        let remote = classify_git_remote_error(&message);
                        return github_remote_status(
                            project_id,
                            mode,
                            remote.state,
                            remote.label,
                            &remote.detail,
                            remote.access,
                            true,
                            local_changes,
                            local_hash.clone(),
                            remote_hash.clone(),
                            local_hash.is_some() || local_changes,
                            false,
                        );
                    }
                };
                let initial_remote_push = remote_hash.is_none() && local_hash.is_some();
                let pending_push = delta.local_ahead_count > 0 || initial_remote_push;
                let pending_pull = delta.remote_ahead_count > 0;
                let diverged = delta.local_ahead_count > 0 && delta.remote_ahead_count > 0;
                let state = if diverged {
                    "conflict"
                } else if local_changes || pending_push {
                    "local-pending"
                } else if pending_pull {
                    "remote-available"
                } else {
                    "local-history"
                };
                let detail = if diverged {
                    "El historial local y GitHub tienen versiones distintas. Revisa antes de sincronizar."
                } else if local_changes {
                    "Hay cambios locales sin guardar en historial. GitHub esperará."
                } else if pending_push {
                    "Hay versiones locales pendientes de subir a GitHub."
                } else if pending_pull {
                    "GitHub tiene versiones pendientes de revisar."
                } else {
                    "El historial local está activo y la sincronización remota está disponible."
                };
                return json!({
                    "projectId": project_id,
                    "mode": mode,
                    "state": state,
                    "label": "GitHub conectado",
                    "detail": detail,
                    "remoteAccess": "available",
                    "remotePaused": false,
                    "remoteReason": null,
                    "remoteAction": if diverged { Value::from("review-conflicts") } else { Value::Null },
                    "localState": if local_changes { "dirty" } else if pending_push { "pending-push" } else { "clean" },
                    "pendingPush": pending_push,
                    "pendingPull": pending_pull,
                    "hasConflicts": diverged,
                    "lastSyncAt": null,
                    "lastLocalVersionHash": local_hash,
                    "lastRemoteHash": remote_hash,
                    "localAheadCount": if initial_remote_push && delta.local_ahead_count == 0 { 1 } else { delta.local_ahead_count },
                    "remoteAheadCount": delta.remote_ahead_count,
                    "localAheadPaths": delta.local_ahead_paths,
                    "remoteAheadPaths": delta.remote_ahead_paths,
                    "diverged": diverged,
                    "conflicts": if diverged { json!([{
                        "id": format!("{project_id}:history-diverged"),
                        "projectId": project_id,
                        "path": "",
                        "type": "diverged_history",
                        "status": "open",
                        "localHash": local_hash,
                        "remoteHash": remote_hash,
                        "message": "El historial local y GitHub tienen versiones distintas.",
                        "createdAt": knownext_core::now_iso(),
                        "updatedAt": knownext_core::now_iso()
                    }]) } else { json!([]) }
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
                "localAheadCount": if local_hash.is_some() { 1 } else { 0 },
                "remoteAheadCount": 0,
                "localAheadPaths": [],
                "remoteAheadPaths": [],
                "diverged": false,
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
            "localAheadCount": 0,
            "remoteAheadCount": 0,
            "localAheadPaths": [],
            "remoteAheadPaths": [],
            "diverged": false,
            "conflicts": []
        })
    }

    pub(super) fn sync_auto_run(&self, project_id: &str) -> Value {
        if let Err(message)=self.project_root(project_id).and_then(|root|mixed_application_guard::ensure(&root)){return json!({"projectId":project_id,"status":"paused","remotePaused":true,"detail":message});}
        let project = self
            .list_projects()
            .into_iter()
            .find(|project| project["id"].as_str() == Some(project_id))
            .unwrap_or_default();
        if project["syncMode"].as_str() != Some("auto-github") {
            return self.sync_status(project_id);
        }

        let status = self.sync_status(project_id);
        if status["remotePaused"].as_bool().unwrap_or(false)
            || status["hasConflicts"].as_bool().unwrap_or(false)
            || status["pendingPull"].as_bool().unwrap_or(false)
            || status["localState"].as_str() == Some("dirty")
        {
            return status;
        }
        if !status["pendingPush"].as_bool().unwrap_or(false) {
            return status;
        }

        let pushed = self.sync_operation(project_id, "push");
        if pushed["status"].as_str() == Some("synced") {
            let mut next = self.sync_status(project_id);
            next["lastSyncAt"] = Value::from(knownext_core::now_iso());
            next["detail"] = Value::from("Versiones locales subidas a GitHub.");
            next
        } else {
            self.sync_status(project_id)
        }
    }

    pub(super) fn file_sync_overview(&self, project_id: &str) -> Result<Value, String> {
        let root = self.project_root(project_id)?;
        let project = self
            .list_projects()
            .into_iter()
            .find(|project| project["id"].as_str() == Some(project_id))
            .unwrap_or_default();
        let has_git = root.join(".git").exists();
        let sync_status = self.sync_status(project_id);
        let has_github = is_github_sync_mode(project["syncMode"].as_str().unwrap_or("none"))
            || project
                .get("githubRepository")
                .is_some_and(|repository| !repository.is_null());
        let local_ahead_paths = json_string_set(sync_status.get("localAheadPaths"));
        let remote_ahead_paths = json_string_set(sync_status.get("remoteAheadPaths"));
        let status_items = if has_git {
            git_status_items(&root)?
        } else {
            Vec::new()
        };
        let mut status_by_path = BTreeMap::<String, Value>::new();
        let mut paths = BTreeSet::<String>::new();

        for path in collect_project_sync_entries(&root)? {
            paths.insert(relative_from_root(&root, &path));
        }
        for item in status_items {
            if let Some(path) = item["path"].as_str() {
                paths.insert(path.to_string());
                status_by_path.insert(path.to_string(), item);
            }
        }

        let mut files = Vec::new();
        for path in paths {
            let full_path = root.join(path.replace('/', std::path::MAIN_SEPARATOR_STR));
            let metadata = std::fs::metadata(&full_path).ok();
            let status_item = status_by_path.get(&path);
            let change_type = status_item.and_then(|item| item["changeType"].as_str());
            let risk = status_item.and_then(|item| item["risk"].as_str());
            let kind = status_item
                .and_then(|item| item["kind"].as_str())
                .map(str::to_string)
                .unwrap_or_else(|| file_sync_kind(&full_path).to_string());
            let name = path.rsplit('/').next().unwrap_or(&path).to_string();
            let local_status = if change_type == Some("deleted") {
                phase_status(
                    "pending",
                    "Eliminado en disco",
                    Some("El archivo ya no existe en la carpeta local."),
                )
            } else {
                phase_status(
                    "ok",
                    "Guardado local",
                    Some("El archivo existe en la carpeta local."),
                )
            };
            let history_status = if !has_git {
                phase_status(
                    "unavailable",
                    "Sin historial",
                    Some("Este proyecto no tiene historial Git local inicializado."),
                )
            } else if let Some(item) = status_item {
                if risk == Some("blocked") {
                    phase_status(
                        "omitted",
                        "Omitido",
                        item["reason"]
                            .as_str()
                            .or(Some("Este archivo queda fuera del historial.")),
                    )
                } else if risk == Some("review") {
                    phase_status(
                        "pending",
                        "Revisión",
                        item["reason"]
                            .as_str()
                            .or(Some("Revisa si debe entrar en el historial local.")),
                    )
                } else {
                    phase_status(
                        "pending",
                        "Pendiente",
                        Some("Guárdalo en el historial local para crear una versión."),
                    )
                }
            } else {
                phase_status(
                    "ok",
                    "En historial",
                    Some("No hay cambios locales pendientes."),
                )
            };
            let conflict = sync_status["conflicts"].as_array().and_then(|conflicts| {
                conflicts.iter().find(|conflict| {
                    conflict["status"].as_str() == Some("open")
                        && conflict["path"].as_str() == Some(path.as_str())
                })
            });
            let github_status = if !has_github {
                phase_status(
                    "unavailable",
                    "No conectado",
                    Some("Este proyecto no usa GitHub."),
                )
            } else if sync_status["remotePaused"].as_bool().unwrap_or(false) {
                phase_status(
                    "waiting",
                    "Pausado",
                    sync_status["detail"]
                        .as_str()
                        .or(Some("GitHub está pausado.")),
                )
            } else if conflict.is_some()
                || (sync_status["state"].as_str() == Some("conflict")
                    && sync_status["conflicts"]
                        .as_array()
                        .map_or(true, Vec::is_empty))
            {
                phase_status(
                    "conflict",
                    "Conflicto",
                    Some("Elige si conservar este equipo o la versión de GitHub."),
                )
            } else if status_item.is_some() && history_status["state"].as_str() == Some("pending") {
                phase_status(
                    "waiting",
                    "Esperando historial",
                    Some("Primero guarda el cambio en el historial local."),
                )
            } else if local_ahead_paths.contains(&path) {
                phase_status(
                    "pending",
                    "Pendiente",
                    Some("Este archivo está en una versión local pendiente de subir."),
                )
            } else if remote_ahead_paths.contains(&path) {
                phase_status(
                    "pending",
                    "GitHub tiene cambios",
                    Some("Este archivo está en una versión remota pendiente de revisar."),
                )
            } else {
                phase_status("ok", "Sincronizado", Some("GitHub está al día."))
            };

            files.push(json!({
                "id": doc_id(project_id, &path),
                "projectId": project_id,
                "path": path,
                "name": name,
                "kind": kind,
                "modifiedAt": metadata.as_ref().and_then(|metadata| metadata.modified().ok()).and_then(system_time_iso),
                "sizeBytes": metadata.map(|metadata| Value::from(metadata.len())).unwrap_or(Value::Null),
                "localStatus": local_status,
                "historyStatus": history_status,
                "githubStatus": github_status,
                "change": status_item.map(|item| json!({
                    "itemId": item["id"],
                    "changeType": item["changeType"],
                    "risk": item["risk"],
                    "decision": item["decision"]
                })).unwrap_or(Value::Null),
                "conflictId": conflict.map(|conflict| conflict["id"].clone()).unwrap_or(Value::Null)
            }));
        }

        files.sort_by(|left, right| {
            right["modifiedAt"]
                .as_str()
                .unwrap_or("")
                .cmp(left["modifiedAt"].as_str().unwrap_or(""))
                .then_with(|| {
                    left["path"]
                        .as_str()
                        .unwrap_or("")
                        .cmp(right["path"].as_str().unwrap_or(""))
                })
        });

        let mut attention = 0;
        let mut history_pending = 0;
        let mut github_pending = 0;
        let mut conflicts = 0;
        let mut omitted = 0;
        for file in &files {
            let history_state = file["historyStatus"]["state"].as_str().unwrap_or("ok");
            let github_state = file["githubStatus"]["state"].as_str().unwrap_or("ok");
            let local_state = file["localStatus"]["state"].as_str().unwrap_or("ok");
            if matches!(history_state, "pending" | "omitted" | "blocked")
                || matches!(github_state, "pending" | "waiting" | "conflict" | "error")
                || matches!(local_state, "pending" | "draft" | "conflict" | "error")
            {
                attention += 1;
            }
            if history_state == "pending" {
                history_pending += 1;
            }
            if matches!(github_state, "pending" | "waiting") {
                github_pending += 1;
            }
            if matches!(history_state, "conflict" | "error")
                || matches!(github_state, "conflict" | "error")
            {
                conflicts += 1;
            }
            if history_state == "omitted" {
                omitted += 1;
            }
        }

        Ok(json!({
            "projectId": project_id,
            "generatedAt": knownext_core::now_iso(),
            "summary": {
                "total": files.len(),
                "attention": attention,
                "historyPending": history_pending,
                "githubPending": github_pending,
                "conflicts": conflicts,
                "omitted": omitted
            },
            "files": files
        }))
    }

    pub(super) fn sync_operation(&self, project_id: &str, direction: &str) -> Value {
        if let Err(message)=self.project_root(project_id).and_then(|root|mixed_application_guard::ensure(&root)){return json!({"projectId":project_id,"direction":direction,"status":"paused","remotePaused":true,"message":message});}
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
        let project = self
            .list_projects()
            .into_iter()
            .find(|project| project["id"].as_str() == Some(project_id))
            .unwrap_or_default();
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
                if let Some((owner, repo, _branch)) =
                    github_repository_parts(project.get("githubRepository").unwrap_or(&Value::Null))
                {
                    let _ = ensure_github_remote(&root, &owner, &repo);
                }
            }
            let branch =
                github_repository_parts(project.get("githubRepository").unwrap_or(&Value::Null))
                    .and_then(|(_, _, branch)| branch)
                    .or_else(|| current_git_branch(&root))
                    .unwrap_or_else(|| "main".to_string());
            if direction == "push" {
                if status["hasConflicts"].as_bool().unwrap_or(false) {
                    return json!({ "status": "conflict", "message": "El historial local y GitHub tienen versiones distintas. Revisa antes de subir.", "projectId": project_id, "direction": direction, "remoteAccess": "available", "remotePaused": false });
                }
                if status["pendingPull"].as_bool().unwrap_or(false)
                    && !status["pendingPush"].as_bool().unwrap_or(false)
                {
                    return json!({ "status": "remote-available", "message": "GitHub tiene versiones pendientes de revisar antes de subir.", "projectId": project_id, "direction": direction, "remoteAccess": "available", "remotePaused": false });
                }
                if !git_status_items(&root).unwrap_or_default().is_empty() {
                    return json!({ "status": "local-pending", "message": "Guarda primero los cambios en el historial local antes de subir a GitHub.", "projectId": project_id, "direction": direction, "remoteAccess": "available", "remotePaused": false });
                }
                if git_head_hash(&root).ok().flatten().is_none() {
                    return json!({ "status": "local-pending", "message": "No hay ninguna versión local que subir a GitHub.", "projectId": project_id, "direction": direction, "remoteAccess": "available", "remotePaused": false });
                }
                return match git_push_origin(&root, &token, &branch) {
                    Ok(()) => {
                        json!({ "status": "synced", "message": "Historial local subido a GitHub.", "projectId": project_id, "direction": direction, "remoteAccess": "available", "remotePaused": false })
                    }
                    Err(message) => {
                        let remote = classify_git_remote_error(&message);
                        json!({ "status": "paused", "message": remote.detail, "projectId": project_id, "direction": direction, "remoteAccess": remote.access, "remotePaused": true })
                    }
                };
            }
            if direction == "pull" {
                if !git_status_items(&root).unwrap_or_default().is_empty() {
                    return json!({ "status": "local-pending", "message": "Guarda o descarta primero los cambios locales antes de traer cambios de GitHub.", "projectId": project_id, "direction": direction, "remoteAccess": "available", "remotePaused": false });
                }
                return match git_pull_ff_only(&root, &token, &branch) {
                    Ok(()) => {
                        json!({ "status": "synced", "message": "Proyecto actualizado desde GitHub.", "projectId": project_id, "direction": direction, "remoteAccess": "available", "remotePaused": false })
                    }
                    Err(message) => {
                        let remote = classify_git_remote_error(&message);
                        json!({ "status": "paused", "message": remote.detail, "projectId": project_id, "direction": direction, "remoteAccess": remote.access, "remotePaused": true })
                    }
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
}
