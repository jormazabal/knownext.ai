use super::*;

pub(super) struct FileMove {
    pub selected: String,
    pub mappings: Vec<(String, String)>,
    pub warnings: Vec<String>,
}

impl LocalApi {
    pub(super) fn rename_node(
        &self, project_id:&str,node_id:&str,payload:Value,
    )->Result<Value,String>{
        let moved=self.rename_node_files(project_id,node_id,payload)?;
        self.finish_file_move(project_id,moved)
    }
    pub(super) fn rename_node_files(
        &self,
        project_id: &str,
        node_id: &str,
        payload: Value,
    ) -> Result<FileMove, String> {
        let old_relative = self.project_node_relative(project_id, node_id)?;
        let old_path = self.resolve_project_relative(project_id, &old_relative)?;
        let new_name = payload
            .get("name")
            .and_then(Value::as_str)
            .unwrap_or("renombrado.md");
        let new_relative = old_relative
            .rsplit_once('/')
            .map(|(parent, _)| format!("{parent}/{new_name}"))
            .unwrap_or_else(|| new_name.to_string());
        let new_path = self.resolve_project_relative(project_id, &new_relative)?;
        if old_path.is_file()
            && ((is_markdown_path(&old_path) && !is_markdown_path(&new_path))
                || (is_handwritten_note_path(&old_path) && !is_handwritten_note_path(&new_path)))
        {
            return Err("Conserva la extensión del documento al renombrarlo. Usa Exportar para cambiar su formato.".into());
        }
        if new_path.exists() {
            let source = old_path.canonicalize().map_err(|error| error.to_string())?;
            let destination = new_path.canonicalize().map_err(|error| error.to_string())?;
            if source != destination {
                return Err("Ya existe un elemento en el destino. No se ha reemplazado.".into());
            }
        }
        let moved_files = moved_file_mappings(
            &self.project_root(project_id)?,
            &old_path,
            &old_relative,
            &new_relative,
        )?;
        self.check_draft_moves(project_id, &moved_files)?;
        if old_path != new_path {
            atomic_io::rename_no_replace(&old_path, &new_path)
                .map_err(|_| "No se pudo renombrar sin reemplazar el destino. Revisa ambas ubicaciones.".to_string())?;
        }
        let warnings = self.migrate_moved_drafts(project_id, &moved_files);
        Ok(FileMove {
                selected: new_relative,
                mappings: moved_files,
                warnings,
            })
    }

    pub(super) fn move_node(
        &self,
        project_id: &str,
        node_id: &str,
        payload: Value,
    ) -> Result<Value, String> {
        let moved = self.move_node_files(project_id, node_id, payload)?;
        self.finish_file_move(project_id, moved)
    }

    pub(super) fn move_node_files(
        &self,
        project_id: &str,
        node_id: &str,
        payload: Value,
    ) -> Result<FileMove, String> {
        let old_relative = self.project_node_relative(project_id, node_id)?;
        let name = old_relative
            .rsplit('/')
            .next()
            .unwrap_or(&old_relative)
            .to_string();
        let target = self.node_relative(
            project_id,
            payload.get("targetFolderId").and_then(Value::as_str),
        )?;
        if target.as_deref().is_some_and(|path| {
            path == old_relative || path.starts_with(&format!("{old_relative}/"))
        }) {
            return Err("No se puede mover una carpeta dentro de si misma".into());
        }
        let new_relative = join_relative(target.as_deref(), &name);
        let old_path = self.resolve_project_relative(project_id, &old_relative)?;
        let new_path = self.resolve_project_relative(project_id, &new_relative)?;
        if !self
            .resolve_project_relative(project_id, target.as_deref().unwrap_or(""))?
            .is_dir()
        {
            return Err("La carpeta de destino no esta disponible".into());
        }
        if new_path.exists() {
            let source = old_path.canonicalize().map_err(|error| error.to_string())?;
            let destination = new_path.canonicalize().map_err(|error| error.to_string())?;
            if source != destination {
                return Err("Ya existe un elemento en el destino. No se ha reemplazado.".into());
            }
        }
        let moved_files = moved_file_mappings(
            &self.project_root(project_id)?,
            &old_path,
            &old_relative,
            &new_relative,
        )?;
        self.check_draft_moves(project_id, &moved_files)?;
        if old_path != new_path {
            atomic_io::rename_no_replace(&old_path, &new_path)
                .map_err(|_| "No se pudo mover sin reemplazar el destino. Revisa ambas ubicaciones.".to_string())?;
        }
        let warnings = self.migrate_moved_drafts(project_id, &moved_files);
        Ok(FileMove {
            selected: new_relative,
            mappings: moved_files,
            warnings,
        })
    }

    pub(super) fn check_draft_moves(
        &self,
        project: &str,
        mappings: &[(String, String)],
    ) -> Result<(), String> {
        for (old, new) in mappings {
            if is_markdown_path(Path::new(old)) || is_handwritten_note_path(Path::new(old)) {
                draft_store::check_move(
                    &self.app_data_dir.join("drafts"),
                    &doc_id(project, old),
                    &doc_id(project, new),
                )?;
            }
        }
        Ok(())
    }

    fn migrate_moved_drafts(&self, project: &str, mappings: &[(String, String)]) -> Vec<String> {
        mappings
            .iter()
            .filter(|(old, _)| {
                is_markdown_path(Path::new(old)) || is_handwritten_note_path(Path::new(old))
            })
            .filter_map(|(old, new)| {
                draft_store::move_identity(
                    &self.app_data_dir.join("drafts"),
                    &doc_id(project, old),
                    &doc_id(project, new),
                )
                .err()
                .map(|error| format!("{old} → {new}: {error}"))
            })
            .collect()
    }

    fn finish_file_move(&self, project: &str, mut moved: FileMove) -> Result<Value, String> {
        let recovery_pending = !moved.warnings.is_empty();
        let favorites_pending = if let Err(error) = self.remap_favorites(project, &moved.mappings) {
            moved.warnings.push(format!("El traslado está confirmado; hay favoritos pendientes de revisar: {error}")); true
        } else {false};
        let mut affected = moved_markdown_affected_documents(project, &moved.mappings);
        let references_pending =
            match self.apply_reference_updates_after_move(project, &moved.mappings) {
                Ok(updates) => {
                    affected.extend(updates.affected);
                    let pending = !updates.warnings.is_empty();
                    moved.warnings.extend(updates.warnings);
                    pending
                }
                Err(error) => {
                    moved.warnings.push(format!(
                    "El archivo se ha trasladado; hay referencias pendientes de revisar: {error}"
                ));
                    true
                }
            };
        let mut result = self.file_result(
            project,
            Some(moved.selected),
            dedupe_affected_documents(affected),
        )?;
        result["favoritesPending"] = json!(favorites_pending);
        result["warnings"] = json!(moved.warnings);
        result["recoveryPending"] = json!(recovery_pending);
        result["referencesPending"] = json!(references_pending);
        Ok(result)
    }
}
