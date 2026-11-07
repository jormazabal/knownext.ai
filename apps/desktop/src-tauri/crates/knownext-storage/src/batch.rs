//! Reviewed, durable batches. A started operation is never replayed automatically.
use super::*;
use std::sync::Mutex;
mod state;
mod actions;
mod cancellation;
#[cfg(test)]
mod cancellation_tests;

static EXECUTION: Mutex<()> = Mutex::new(());

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Item {
    node_id: String,
    path: String,
    destination: Option<String>,
    fingerprint: String,
    state: String,
    error: Option<String>,
    result: Option<Value>,
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Plan {
    #[serde(default,skip_serializing_if="Option::is_none")]
    schema_version:Option<u8>,
    #[serde(skip)]
    source_revision:Option<String>,
    #[serde(default)]
    moved_files: Vec<(String, String)>,
    #[serde(default)]
    references_pending: bool,
    #[serde(default)]
    error: Option<String>,
    id: String,
    project_id: String,
    root: String,
    action: String,
    target_folder_id: Option<String>,
    created_at: String,
    state: String,
    selected_count: usize,
    items: Vec<Item>,
    result: Option<Value>,
}

mod fingerprint;
pub(super) use fingerprint::linked;
pub(super) use fingerprint::fingerprint;
use fingerprint::{fingerprint_with_budget,Budget,Limits};

// Durable receipts describe effects; the current project tree is a read-only view.
// Never repeat a recursive tree in every item or publish it in the operation log.
fn effect_receipt(mut result: Value) -> Value {
    if let Some(object) = result.as_object_mut() {
        object.insert("tree".into(), json!([]));
        object.insert("treeAvailable".into(), json!(false));
        if let Some(node) = object.get_mut("node").and_then(Value::as_object_mut) {
            node.remove("children");
        }
    }
    result
}

impl LocalApi {
    fn batch_response(&self, mut plan: Plan) -> Result<Value, String> {
        for item in &mut plan.items {
            if let Some(result) = item.result.take() { item.result = Some(effect_receipt(result)); }
        }
        if plan.items.iter().any(|item| item.result.is_some()) {
            let mut result = effect_receipt(plan.result.take().unwrap_or_else(|| json!({"affectedDocuments":[]})));
            match self.project_tree(&plan.project_id) {
                Ok(tree) => { result["tree"] = Value::Array(tree); result["treeAvailable"] = json!(true); }
                Err(_) => {
                    let mut warnings = result["warnings"].as_array().cloned().unwrap_or_default();
                    warnings.push(json!("Los efectos registrados se conservan. No se pudo actualizar el árbol; consulta el proyecto sin repetir el lote."));
                    result["warnings"] = json!(warnings);
                }
            }
            plan.result = Some(result);
        }
        serde_json::to_value(plan).map_err(|e| e.to_string())
    }
    pub(super) fn batch_status(&self, project: &str, id: &str) -> Result<Value, String> {
        let plan=state::read(self,id)?;
        if plan.project_id != project || plan.id != id {
            return Err("El lote pertenece a otro proyecto".into());
        }
        self.batch_response(plan)
    }
    pub(super) fn batch_recovery(&self, project: &str) -> (Vec<Value>, Vec<String>) {
        let mut batches = vec![];
        let mut warnings = vec![];
        let started=std::time::Instant::now();let mut budget=64*1024*1024u64;
        let dir = self.app_data_dir.join("file-batches");
        match std::fs::symlink_metadata(&dir){
            Err(e) if e.kind()==std::io::ErrorKind::NotFound=>return (batches,warnings),
            Ok(meta) if meta.is_dir()&&!linked(&meta)=>{},
            _=>{warnings.push("El registro de lotes no es una carpeta regular accesible; se conserva sin cambios.".into());return (batches,warnings);}
        }
        match std::fs::read_dir(&dir) {
            Ok(entries) => {
                for (index,entry) in entries.take(1001).enumerate() {
                    if index==1000||warnings.len()>=50||budget==0||started.elapsed()>Duration::from_secs(2){warnings.push("Revisión de lotes parcial por límite de entradas, bytes, tiempo o incidencias; los registros restantes se conservan.".into());break;}
                    let result = entry
                        .map_err(|_|"No se puede consultar una entrada de lote".to_string())
                        .and_then(|entry|{let name=entry.file_name().to_string_lossy().into_owned();let id=name.strip_suffix(".json").ok_or("Entrada de lote no reconocida")?;state::read_limited(self,id,&mut budget)});
                    match result {
                    Ok(plan) if plan.project_id == project && matches!(plan.state.as_str(), "running" | "attention") => if let Ok(value) = serde_json::to_value(plan) { batches.push(value); },
                    Ok(_) => {},
                    Err(_) => warnings.push("Un registro de operaciones no se ha podido leer; se conserva para revisión.".into()),
                }
                }
            }
            Err(_) => warnings.push("No se ha podido consultar el registro de operaciones.".into()),
        }
        (batches, warnings)
    }
    fn batch_path(&self, id: &str) -> Result<PathBuf, String> {
        if id.len()>160 || !id.starts_with("batch-") || !id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-')
        {
            return Err("Identificador de lote inválido".into());
        }
        let dir = self.app_data_dir.join("file-batches");
        Ok(dir.join(format!("{id}.json")))
    }
    fn save_batch(&self, plan: &mut Plan) -> Result<(), String> {state::save(self,plan)}
    pub(super) fn prepare_batch(&self, project: &str, payload: Value) -> Result<Value, String> {
        let action = payload["action"].as_str().ok_or("Falta la acción")?;
        if !matches!(action, "move" | "trash" | "duplicate" | "rename" | "context") {
            return Err("Acción de lote no admitida".into());
        }
        let ids = payload["nodeIds"]
            .as_array()
            .filter(|ids| !ids.is_empty() && ids.len() <= 500)
            .ok_or("Selecciona entre 1 y 500 elementos")?;
        let root = self
            .project_root(project)?
            .canonicalize()
            .map_err(|e| e.to_string())?;
        let target_id = payload["targetFolderId"].as_str().map(str::to_owned);
        let target = self
            .node_relative(project, target_id.as_deref())?
            .unwrap_or_default();
        if action == "move" && !self.resolve_project_relative(project, &target)?.is_dir() {
            return Err("El destino debe ser una carpeta existente".into());
        }
        let mut paths = BTreeSet::new();
        for id in ids {
            paths.insert(
                self.project_node_relative(project, id.as_str().ok_or("Identificador inválido")?)?,
            );
        }
        let mut paths: Vec<_> = paths
            .iter()
            .filter(|path| {
                !paths
                    .iter()
                    .any(|parent| *path != parent && path.starts_with(&format!("{parent}/")))
            })
            .cloned()
            .collect();
        if action=="context"{paths=actions::context_paths(self,project,&paths)?;}
        let mut destinations = BTreeSet::new();
        let mut items = vec![];
        let mut copy_entries=0;let mut copy_bytes=0;
        let mut review_budget=Budget::new(Limits::default());
        for path in paths {
            let source = self.resolve_project_relative(project, &path)?;
            if action=="duplicate"{actions::check_copy(&source,&mut copy_entries,&mut copy_bytes)?;}
            let destination = if action=="duplicate" {Some(actions::duplicate_destination(self,project,&path,&mut destinations)?)}else if action=="rename"{
                let name=payload["names"].get(doc_id(project,&path)).and_then(Value::as_str).ok_or("Indica un nombre para cada elemento")?;portable_paths::component(name)?;
                let dest=path.rsplit_once('/').map(|(parent,_)|format!("{parent}/{name}")).unwrap_or(name.into());
                if dest==path{continue;}
                if !destinations.insert(dest.to_lowercase())||self.resolve_project_relative(project,&dest)?.exists(){return Err(format!("Nombre repetido u ocupado: {name}"));}
                if source.is_file()&&((is_markdown_path(&source)&&!is_markdown_path(Path::new(&dest)))||(is_handwritten_note_path(&source)&&!is_handwritten_note_path(Path::new(&dest)))){return Err("Conserva la extensión de los documentos al renombrar".into());}Some(dest)
            } else if action == "move" {
                if target == path || target.starts_with(&format!("{path}/")) {
                    return Err("No puedes mover una carpeta dentro de sí misma".into());
                }
                let destination = join_relative(Some(&target), path.rsplit('/').next().unwrap());
                // Windows destinations are case insensitive; use the conservative rule on every platform.
                if destination == path
                    || !destinations.insert(destination.to_lowercase())
                    || self
                        .resolve_project_relative(project, &destination)?
                        .exists()
                {
                    return Err(format!("Destino ocupado o repetido: {destination}"));
                }
                Some(destination)
            } else {
                None
            };
            items.push(Item {
                node_id: doc_id(project, &path),
                fingerprint: fingerprint_with_budget(&source,&mut review_budget)?,
                path,
                destination,
                state: "pending".into(),
                error: None,
                result: None,
            });
        }
        if items.is_empty(){return Err("No hay cambios que aplicar a la selección".into());}
        let mut plan = Plan {
            schema_version:Some(1),source_revision:None,
            moved_files: vec![],
            references_pending: false,
            error: None,
            id: knownext_core::compact_id("batch"),
            project_id: project.into(),
            root: root.to_string_lossy().into(),
            action: action.into(),
            target_folder_id: target_id,
            created_at: knownext_core::now_iso(),
            state: "prepared".into(),
            selected_count: ids.len(),
            items,
            result: None,
        };
        self.save_batch(&mut plan)?;
        serde_json::to_value(plan).map_err(|e| e.to_string())
    }
    pub(super) fn execute_batch(&self, project: &str, id: &str) -> Result<Value, String> {
        self.execute_batch_with(project,id,|_|{})
    }
    pub(super) fn cancel_batch(&self,project:&str,id:&str)->Result<Value,String>{cancellation::request(self,project,id)}
    fn execute_batch_with(&self, project: &str, id: &str, mut before_item:impl FnMut(usize)) -> Result<Value, String> {
        let mut plan=state::read(self,id)?;
        if plan.id != id
            || plan.project_id != project
            || self
                .project_root(project)?
                .canonicalize()
                .map_err(|e| e.to_string())?
                .to_string_lossy()
                != plan.root
        {
            return Err("El proyecto del lote ha cambiado".into());
        }
        if plan.state != "prepared" {
            return self.batch_response(plan);
        }
        let execution=cancellation::Active::begin(self,id)?;
        let _guard = EXECUTION.lock().map_err(|_|"Hay un lote pendiente de revisión tras una interrupción")?;
        if state::read(self,id)?.source_revision!=plan.source_revision {
            return Err("El registro del lote cambió mientras esperaba. Revisa el estado sin repetirlo.".into());
        }
        if !matches!(plan.action.as_str(), "move" | "trash" | "duplicate" | "rename" | "context")
            || plan.items.is_empty()
            || plan.items.len() > 500
        {
            return Err("El registro del lote no es válido. Se conserva para revisión.".into());
        }
        let target = self
            .node_relative(project, plan.target_folder_id.as_deref())?
            .unwrap_or_default();
        let mut destinations = BTreeSet::new();
        let mut review_budget=Budget::new(Limits::default());
        if plan.action == "move" {
            let target = self
                .node_relative(project, plan.target_folder_id.as_deref())?
                .unwrap_or_default();
            if !self.resolve_project_relative(project, &target)?.is_dir() {
                return Err("La carpeta de destino ya no está disponible".into());
            }
        }
        // Revalidate the entire scope before the first mutation.
        let mut copy_entries=0;let mut copy_bytes=0;
        for item in &plan.items {
            if execution.requested(){plan.state="attention".into();plan.error=Some("Lote detenido antes de iniciar cambios. Los archivos se conservan.".into());self.save_batch(&mut plan)?;return serde_json::to_value(plan).map_err(|e|e.to_string());}
            if plan.action=="duplicate"{actions::check_copy(&self.resolve_project_relative(project,&item.path)?,&mut copy_entries,&mut copy_bytes)?;}
            if plan.action=="rename"{let source=self.resolve_project_relative(project,&item.path)?;let dest=Path::new(item.destination.as_deref().ok_or("Falta el destino")?);if source.is_file()&&((is_markdown_path(&source)&&!is_markdown_path(dest))||(is_handwritten_note_path(&source)&&!is_handwritten_note_path(dest))){return Err("Conserva la extensión de los documentos".into());}}
            if item.node_id != doc_id(project, &item.path) || item.state != "pending" {
                return Err("El registro del lote ha cambiado. Revisa la selección.".into());
            }
            let expected_destination = if matches!(plan.action.as_str(),"rename"|"duplicate") {
                let dest=item.destination.as_deref().ok_or("Falta el destino revisado")?;
                if dest==item.path||Path::new(dest).parent()!=Path::new(&item.path).parent(){return Err("La copia o el nuevo nombre debe permanecer en la carpeta de origen".into());}
                Some(dest.into())
            }else if plan.action == "move" {
                Some(join_relative(
                    Some(&target),
                    item.path.rsplit('/').next().unwrap_or(""),
                ))
            } else {
                None
            };
            if item.destination != expected_destination
                || item
                    .destination
                    .as_ref()
                    .is_some_and(|path| !destinations.insert(path.to_lowercase()))
            {
                return Err("El destino registrado no coincide con la operación revisada".into());
            }
            if fingerprint_with_budget(&self.resolve_project_relative(project, &item.path)?,&mut review_budget)?
                != item.fingerprint
            {
                return Err(format!(
                    "Ha cambiado {}. Revisa de nuevo la selección.",
                    item.path
                ));
            }
            if let Some(destination) = &item.destination {
                if self
                    .resolve_project_relative(project, destination)?
                    .exists()
                {
                    return Err(format!("El destino se ha ocupado: {destination}"));
                }
                let mappings = if plan.action=="duplicate"{vec![]}else{moved_file_mappings(
                    &self.project_root(project)?,
                    &self.resolve_project_relative(project, &item.path)?,
                    &item.path,
                    destination,
                )?};
                self.check_draft_moves(project, &mappings)?;
            }
        }
        plan.state = "running".into();
        plan.references_pending = matches!(plan.action.as_str(),"move"|"rename");
        self.save_batch(&mut plan)?;
        let mut affected = vec![];
        for i in 0..plan.items.len() {
            before_item(i);
            if execution.requested(){plan.error=Some("Lote detenido. Se conservan los cambios aplicados; los elementos pendientes no se han ejecutado.".into());break;}
            plan.items[i].state = "running".into();
            self.save_batch(&mut plan)?;
            let item = &plan.items[i];
            let mut mappings = vec![];
            let result = (|| {
                if fingerprint(&self.resolve_project_relative(project, &item.path)?)?
                    != item.fingerprint
                {
                    return Err("El elemento cambió durante el lote".into());
                }
                if plan.action == "trash" {
                    self.delete_node(project, &item.node_id)
                } else if plan.action=="context"{actions::add_context(self,project,item)
                }else if plan.action=="duplicate"{
                    let dest=item.destination.as_deref().ok_or("Falta el destino de copia")?;let source=self.resolve_project_relative(project,&item.path)?;let target=self.resolve_project_relative(project,dest)?;
                    actions::copy(&source,&target)?;
                    if fingerprint(&source)?!=item.fingerprint||fingerprint(&target)?!=item.fingerprint{return Err("La copia o la fuente cambiaron; los originales se conservan y el destino necesita revisión".into());}
                    self.file_result(project,Some(dest.into()),vec![])
                }else {
                    let moved = if plan.action=="rename"{self.rename_node_files(project,&item.node_id,json!({"name":Path::new(item.destination.as_deref().ok_or("Falta el nuevo nombre")?).file_name().and_then(|v|v.to_str()).ok_or("Nombre no válido")?}))?}else{self.move_node_files(
                        project,
                        &item.node_id,
                        json!({"targetFolderId":plan.target_folder_id}),
                    )?};
                    mappings = moved.mappings;
                    let mut result = self.file_result(
                        project,
                        Some(moved.selected),
                        moved_markdown_affected_documents(project, &mappings),
                    )?;
                    if !moved.warnings.is_empty() {
                        plan.error = Some(moved.warnings.join("\n"));
                        result["warnings"] = json!(moved.warnings);
                        result["recoveryPending"] = json!(true);
                    }
                    Ok(result)
                }
            })();
            plan.moved_files.extend(mappings);
            match result {
                Ok(result) => {
                    affected.extend(
                        result["affectedDocuments"]
                            .as_array()
                            .cloned()
                            .unwrap_or_default(),
                    );
                    plan.items[i].state = "applied".into();
                    plan.items[i].result = Some(effect_receipt(result));
                }
                Err(error) => {
                    plan.items[i].state = "attention".into();
                    plan.items[i].error = Some(error);
                }
            }
            self.save_batch(&mut plan)?;
            // Stop on uncertainty; remaining items retain their pending state.
            if (plan.items[i].state == "attention"&&plan.action!="context") || plan.error.is_some() {
                break;
            }
        }
        plan.state = if plan.items.iter().all(|i| i.state == "applied") && plan.error.is_none() {
            "completed"
        } else {
            "attention"
        }
        .into();
        if plan.state == "completed" && plan.references_pending {
            match self.apply_reference_updates_after_move(project, &plan.moved_files) {
                Ok(updates) => {
                    if let Some(result) =
                        plan.items.last_mut().and_then(|item| item.result.as_mut())
                    {
                        let mut changes = result["affectedDocuments"]
                            .as_array()
                            .cloned()
                            .unwrap_or_default();
                        changes.extend(updates.affected.clone());
                        result["affectedDocuments"] = json!(dedupe_affected_documents(changes));
                    }
                    affected.extend(updates.affected);
                    plan.references_pending = !updates.warnings.is_empty();
                    if plan.references_pending {
                        plan.state = "attention".into();
                        plan.error = Some(updates.warnings.join("\n"));
                    }
                }
                Err(error) => {
                    plan.state = "attention".into();
                    plan.error = Some(format!(
                        "Los movimientos requieren revisión de referencias: {error}"
                    ));
                }
            }
        }
        let favorite_warning = self.remap_favorites(project, &plan.moved_files).err();
        if let Some(error) = &favorite_warning {
            plan.state = "attention".into();
            let previous = plan.error.take().unwrap_or_default();
            plan.error = Some(format!("{previous}\nLos archivos trasladados se conservan; hay favoritos pendientes de revisar: {error}"));
        }
        plan.result = Some(json!({"tree":[],"treeAvailable":false,"affectedDocuments":affected}));
        if let Some(error) = favorite_warning {
            if let Some(result) = &mut plan.result { result["favoritesPending"] = json!(true); result["warnings"] = json!([format!("Favoritos pendientes: {error}")]); }
        }
        self.save_batch(&mut plan)?;
        self.batch_response(plan)
    }
}
