//! Runtime facade extracted without changing method bodies or public contracts.
use super::*;

impl LocalApi {
    pub(super) fn registry(&self) -> Value {
        self.registry_checked().unwrap_or_else(|_| json!({ "schemaVersion": 2, "activeProjectId": null, "projects": [] }))
    }
    pub(super) fn registry_checked(&self) -> Result<Value, String> {
        local_state::read(&self.app_data_dir, local_state::Store::Projects)
    }

    pub(super) fn write_registry(&self, registry: &Value) -> Result<(), String> {
        self.write_json(&self.registry_path(), registry)
    }

    pub(super) fn list_projects(&self) -> Vec<Value> {
        self.registry()["projects"]
            .as_array()
            .cloned()
            .unwrap_or_default()
            .into_iter()
            .map(normalize_project_metadata)
            .collect()
    }

    pub(super) fn active_project(&self) -> ApiResult {
        let registry = self.registry();
        let active_id = registry["activeProjectId"].as_str().unwrap_or("");
        self.list_projects()
            .into_iter()
            .find(|project| project["id"].as_str() == Some(active_id))
            .map_or_else(|| bad(404, "No hay proyecto activo"), ok)
    }

    pub(super) fn create_project(&self, payload: Value) -> Result<Value, String> {
        let mut registry = self.registry_checked()?;
        let id = knownext_core::compact_id("project");
        let root = payload
            .get("folderPath")
            .and_then(Value::as_str)
            .filter(|value| !value.is_empty())
            .map(PathBuf::from)
            .unwrap_or_else(|| self.app_data_dir.join("projects").join(&id));
        let payload_versioning_mode = payload
            .get("versioningMode")
            .and_then(Value::as_str)
            .unwrap_or(if cfg!(target_os="android"){"none"}else{"local-git"});
        let versioning_mode = normalize_versioning_mode(payload_versioning_mode);
        let needs_git=versioning_mode!="none"||payload.get("syncMode").and_then(Value::as_str).is_some_and(|mode|mode!="none");
        if needs_git {project_capabilities::require_history_runtime()?;}
        if !root.is_absolute(){return Err("La carpeta del proyecto debe tener una ruta absoluta".into());}
        std::fs::create_dir_all(&root).map_err(|error| error.to_string())?;
        self.claim_project_root(&root)?;
        if needs_git {
            ensure_git_repo(&root)?;
        }
        if is_github_sync_mode(
            payload
                .get("syncMode")
                .and_then(Value::as_str)
                .unwrap_or("none"),
        ) {
            if let Some((owner, repo, _branch)) =
                github_repository_parts(payload.get("githubRepository").unwrap_or(&Value::Null))
            {
                ensure_github_remote(&root, &owner, &repo)?;
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
        registry["activeProjectId"] = project["id"].clone();
        let projects = registry["projects"]
            .as_array_mut()
            .ok_or("Registro de proyectos inválido")?;
        for existing in projects.iter_mut() {
            existing["active"] = Value::Bool(false);
        }
        projects.push(project.clone());
        self.write_registry(&registry)?;
        Ok(project)
    }

    pub(super) fn update_project(&self, project_id: &str, payload: Value) -> Result<Value, String> {
        self.update_project_after_location_admission(project_id, payload, || {})
    }
    pub(super) fn update_project_after_location_admission(
        &self, project_id: &str, payload: Value, after_admission: impl FnOnce(),
    ) -> Result<Value, String> {
        self.update_project_with_location_hooks(project_id, payload, || {}, after_admission)
    }
    pub(super) fn update_project_with_location_hooks(
        &self, project_id: &str, payload: Value, before_target_admission: impl FnOnce(), after_admission: impl FnOnce(),
    ) -> Result<Value, String> {
        let mut registry = self.registry_checked()?;
        let reviewed_registry = registry.clone();
        let previous=registry["projects"].as_array().and_then(|p|p.iter().find(|p|p["id"].as_str()==Some(project_id))).ok_or("Proyecto no encontrado")?.clone();
        let next_folder=payload.get("folderPath").map(|p|p.as_str().ok_or("Ubicación no válida")).transpose()?;
        let changes_location = next_folder.is_some_and(|folder|Some(folder)!=previous["folderPath"].as_str());
        if (changes_location || payload.get("syncMode").and_then(Value::as_str).is_some_and(is_github_sync_mode))
            && (self.proton_sync_is_connected(project_id)? || self.proton_direct_connected(project_id)?) {
            return Err("Desconecta primero la asociación Proton desde su panel antes de cambiar la ubicación o activar GitHub. Los documentos y el intercambio se conservan.".into());
        }
        if changes_location&&self.has_background_work(){return Err("Hay investigación en segundo plano. Espera a que termine antes de cambiar la ubicación del proyecto; no se ha cambiado el destino".into());}
        let relocated=next_folder.filter(|_|changes_location).map(|folder|self.reviewed_location(project_id,folder,&payload["locationReview"],&registry)).transpose()?;
        let original = PathBuf::from(previous["folderPath"].as_str().ok_or("Ubicación original no compatible")?);
        let (transaction, missing_original) = match self.project_transaction(project_id) {
            Ok(permit) => (vec![permit], false),
            Err(error) if relocated.is_some() => {
                if !std::fs::symlink_metadata(&original).is_err_and(|error|error.kind()==std::io::ErrorKind::NotFound) { return Err(error); }
                (self.missing_location_transaction(&original)?, true)
            },
            Err(error) => return Err(error),
        };
        let missing_identity = if missing_original { Some(self.missing_location_identity(&original)?) } else { None };
        let _transaction = transaction;
        let admission_before = relocated.as_deref().map(project_locations::admission_fingerprint).transpose()?;
        // Bind the immediate metadata snapshot back to the human-reviewed stamp;
        // never adopt a fresh destination baseline across the admission interval.
        if let Some(folder) = next_folder.filter(|_| changes_location) {
            self.reviewed_location(project_id,folder,&payload["locationReview"],&reviewed_registry)?;
        }
        before_target_admission();
        let _destination = relocated.as_deref().map(|root|self.location_target_transaction(root)).transpose()?;
        if let (Some(root), Some(before)) = (relocated.as_deref(), admission_before.as_ref()) {
            if project_locations::admission_fingerprint(root)? != *before {
                return Err("El destino cambió durante la admisión; revisa de nuevo la ubicación".into());
            }
        }
        after_admission();
        if relocated.is_none(){
            let current=normalize_project_metadata(previous.clone());
            let new_history=payload.get("versioningMode").and_then(Value::as_str).map(normalize_versioning_mode).is_some_and(|mode|mode!="none"&&current["versioningMode"].as_str()!=Some(mode));
            let new_sync=payload.get("syncMode").and_then(Value::as_str).is_some_and(|mode|mode!="none"&&current["syncMode"].as_str()!=Some(mode));
            if new_history||new_sync{project_capabilities::require_history_runtime()?;ensure_git_repo(&self.project_root(project_id)?)?;}
        }
        let projects = registry["projects"]
            .as_array_mut()
            .ok_or("Registro de proyectos inválido")?;
        let project = projects
            .iter_mut()
            .find(|project| project["id"].as_str() == Some(project_id))
            .ok_or("Proyecto no encontrado")?;
        normalize_project_metadata_in_place(project);
        for key in [
            "name",
            "folderPath",
            "icon",
            "iconColor",
            "storageMode",
            "versioningMode",
            "syncMode",
            "githubRepository",
        ] {
            if let Some(value) = payload.get(key) {
                project[key] = if key == "versioningMode" {
                    Value::from(normalize_versioning_mode(
                        value.as_str().unwrap_or("local-git"),
                    ))
                } else if key == "storageMode"
                    && is_old_github_versioning_mode(
                        payload.get("versioningMode").and_then(Value::as_str),
                    )
                {
                    Value::from("local-files")
                } else {
                    value.clone()
                };
            }
        }
        if let Some(root)=relocated.as_ref() {
            self.claim_project_root(&root)?;
            project["folderPath"]=json!(root.to_string_lossy());
            project["syncMode"]=json!("none");project["versioningMode"]=json!("none");
            project["githubRepository"]=previous["githubRepository"].clone();
            if let Some(mode)=previous.get("storageMode"){project["storageMode"]=mode.clone();}
            project["isGitRepository"]=json!(root.join(".git").exists());
        }
        let updated = project.clone();
        if self.registry_checked()? != reviewed_registry {
            return Err("El registro cambió durante la admisión; revisa de nuevo antes de asociar".into());
        }
        if let Some(identity) = missing_identity.as_ref() {
            if self.missing_location_identity(&original)? != *identity {
                return Err("La identidad de origen cambió durante la admisión; revisa la asociación".into());
            }
        }
        if let (Some(root), Some(before)) = (relocated.as_deref(), admission_before.as_ref()) {
            // Recheck admissible roots/overlap through the original review policy,
            // then require the pre-admission identity/listing, excluding coordination.
            self.review_project_location(project_id,json!({"folderPath":root}))?;
            if project_locations::admission_fingerprint(root)? != *before {
                return Err("El destino revisado cambió antes de publicar; se conserva la asociación".into());
            }
        }
        self.write_registry(&registry)?;
        Ok(updated)
    }

    pub(super) fn enable_project_history(&self, project_id: &str) -> Result<Value, String> {
        project_capabilities::require_history_runtime()?;
        let root = self.project_root(project_id)?;
        ensure_git_repo(&root)?;
        self.update_project_fields(project_id, |project| {
            project["versioningMode"] = Value::from("local-git");
            if project["syncMode"].as_str().unwrap_or("none") == "none" {
                project["syncMode"] = Value::from("manual-local");
            }
            project["isGitRepository"] = Value::Bool(root.join(".git").exists());
        })?;
        Ok(
            json!({ "status": "enabled", "message": "Historial local preparado desde Rust/Tauri.", "projectId": project_id }),
        )
    }

    pub(super) fn change_project_sync_mode_local(&self, project_id: &str, body: Value) -> Result<Value, String> {
        let sync_mode = body
            .get("syncMode")
            .and_then(Value::as_str)
            .unwrap_or("manual-local");
        if is_github_sync_mode(sync_mode) && (self.proton_sync_is_connected(project_id)? || self.proton_direct_connected(project_id)?) {
            return Err("El proyecto ya tiene una asociación Proton. Desconéctala desde su panel antes de activar GitHub.".into());
        }
        let repository_exists=if sync_mode!="none"{project_capabilities::require_history_runtime()?;let root=self.project_root(project_id)?;ensure_git_repo(&root)?;root.join(".git").exists()}else{false};
        self.update_project_fields(project_id, |project| {
            project["syncMode"] = Value::from(sync_mode);
            if sync_mode != "none" {
                project["versioningMode"] = Value::from("local-git");
                project["isGitRepository"] = Value::Bool(repository_exists);
            }
        })?;
        Ok(json!({"projectId":project_id,"configurationCommitted":true}))
    }

    pub(super) fn change_project_sync_mode(&self,project:&str,body:Value)->Result<Value,String>{self.change_project_sync_mode_local(project,body)?;Ok(self.sync_status(project))}

    pub(super) fn connect_project_github_local(
        &self,
        project_id: &str,
        body: Value,
        publishing: bool,
    ) -> Result<Value, String> {
        if self.proton_sync_is_connected(project_id)? || self.proton_direct_connected(project_id)? {
            return Err("El proyecto ya tiene una asociación Proton. Se conserva; no se ha conectado GitHub.".into());
        }
        let owner = body
            .get("owner")
            .and_then(Value::as_str)
            .unwrap_or("")
            .trim();
        let repo = body
            .get("repo")
            .and_then(Value::as_str)
            .unwrap_or("")
            .trim();
        if owner.is_empty() || repo.is_empty() {
            return Err("Falta repositorio GitHub".to_string());
        }
        let sync_mode = body
            .get("syncMode")
            .and_then(Value::as_str)
            .unwrap_or("manual-github");
        let permissions = if publishing {
            json!(["pull", "push"])
        } else {
            json!(["pull"])
        };
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
        Ok(json!({"projectId":project_id,"configurationCommitted":true}))
    }

    pub(super) fn connect_project_github(&self,project:&str,body:Value,publishing:bool)->Result<Value,String>{self.connect_project_github_local(project,body,publishing)?;Ok(self.sync_status(project))}
    pub(super) fn update_project_fields<F>(&self, project_id: &str, mut update: F) -> Result<Value, String>
    where
        F: FnMut(&mut Value),
    {
        let mut registry = self.registry();
        let projects = registry["projects"]
            .as_array_mut()
            .ok_or("Registro de proyectos inválido")?;
        let project = projects
            .iter_mut()
            .find(|project| project["id"].as_str() == Some(project_id))
            .ok_or("Proyecto no encontrado")?;
        update(project);
        let updated = project.clone();
        self.write_registry(&registry)?;
        Ok(updated)
    }

    pub(super) fn delete_project(&self, project_id: &str) -> Result<Vec<Value>, String> {
        self.retire_project(project_id)
    }

    pub(super) fn set_active_project(&self, project_id: &str) -> Result<Value, String> {
        let mut registry = self.registry();
        let mut selected = None;
        for project in registry["projects"]
            .as_array_mut()
            .ok_or("Registro de proyectos inválido")?
        {
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

    pub(super) fn project_root(&self, project_id: &str) -> Result<PathBuf, String> {
        let root=self.registered_project_root(project_id).map_err(|failure|
            failure.body["detail"].as_str().unwrap_or("Proyecto no disponible").to_string())?;
        self.claim_project_root(&root)
    }

    pub(super) fn project_tree(&self, project_id: &str) -> Result<Vec<Value>, String> {
        let root = self.project_root(project_id)?;
        let tree=project_tree::read(project_id,&root)?;
        if self.project_root(project_id)?!=root{return Err("La ubicación del proyecto cambió durante la consulta; no se sustituye la vista".into())}
        Ok(tree)
    }
    pub(super) fn attach_project_tree(&self,project_id:&str,result:&mut Value){
        match self.project_tree(project_id){
            Ok(tree)=>{result["tree"]=json!(tree);result["treeAvailable"]=json!(true);result["treeWarning"]=Value::Null;}
            Err(message)=>{result["tree"]=json!([]);result["treeAvailable"]=json!(false);result["treeWarning"]=json!(format!("Resultado conservado; no se pudo actualizar la estructura. {message}"));}
        }
    }
    pub(super) fn with_project_tree(&self,project_id:&str,mut result:Value)->Value{self.attach_project_tree(project_id,&mut result);result}

    pub(super) fn resolve_project_relative(&self, project_id: &str, relative: &str) -> Result<PathBuf, String> {
        path_policy::resolve(&self.project_root(project_id)?, relative)
    }

    pub(super) fn project_node_relative(&self, project_id: &str, node_id: &str) -> Result<String, String> {
        let (owner, relative) = document_ref(node_id)?;
        if owner != project_id || !std::path::Path::new(&relative).components().any(|part| matches!(part, std::path::Component::Normal(_))) {
            return Err("El elemento no pertenece al proyecto o representa su raiz".into());
        }
        Ok(relative)
    }

    pub(super) fn resolve_document_path(&self, document_id: &str) -> Result<PathBuf, String> {
        let (project_id, relative) = document_ref(document_id)?;
        self.resolve_project_relative(&project_id, &relative)
    }

    pub(super) fn resolve_markdown_path(&self, id: &str) -> Result<PathBuf, String> {
        let path = self.resolve_document_path(id)?;
        if !is_markdown_path(&path) { return Err("Esta operación requiere un documento Markdown".into()); }
        Ok(path)
    }

    pub(super) fn resolve_handwritten_path(&self, id: &str) -> Result<PathBuf, String> {
        let path = self.resolve_document_path(id)?;
        if !is_handwritten_note_path(&path) { return Err("Esta operación requiere una nota manuscrita".into()); }
        Ok(path)
    }

}
