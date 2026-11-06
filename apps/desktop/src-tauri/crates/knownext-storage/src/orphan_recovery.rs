//! A missing-file recovery action owns a reviewed private snapshot and project location.
use super::*;
use std::{fs, io::Read};
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Review {
    document_id: String,
    expected_fingerprint: String,
    location_revision: String,
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn newer_or_future_copy_after_source_publication_is_never_retired_or_acknowledged_as_seen() {
        for future in [false, true] {
            let owned = tempfile::tempdir().unwrap();
            let api = LocalApi::new(owned.path().join("state"), "qa".into(), "test".into());
            let project = api
                .create_project(
                    json!({"name":"Publication race","versioningMode":"none","syncMode":"none"}),
                )
                .unwrap();
            let pid = project["id"].as_str().unwrap();
            let root = api.project_root(pid).unwrap();
            let id = doc_id(pid, "A.md");
            let source = root.join("A.md");
            fs::write(&source, "Disk\n").unwrap();
            api.save_draft(&id, json!({"markdown":"Reviewed copy\n"}))
                .unwrap();
            fs::remove_file(&source).unwrap();
            let inventory = api.orphan_draft_inventory().unwrap();
            let row = &inventory["items"][0];
            let key = row["draftKey"].as_str().unwrap();
            let(snapshot,path)=api.checked_orphan_snapshot(key,json!({"documentId":id,"expectedFingerprint":row["fingerprint"],"locationRevision":row["locationRevision"]})).unwrap();
            let file = draft_store::path(&api.app_data_dir.join("drafts"), &id);
            let mut next = snapshot.value.clone();
            next["markdown"] = json!("Later private work\n");
            if future {
                next["schemaVersion"] = json!(99);
            }
            let next = serde_json::to_vec(&next).unwrap();
            let result = api
                .restore_orphan_snapshot_with(key, snapshot, path, || {
                    fs::write(&file, &next).unwrap()
                })
                .unwrap();
            assert_eq!(fs::read_to_string(&source).unwrap(), "Reviewed copy\n");
            assert_eq!(fs::read(&file).unwrap(), next);
            assert_eq!(result["document"]["markdown"], "Reviewed copy\n");
            assert_eq!(result["document"]["draftWriteConflict"], true);
            assert!(result["document"].get("draftWriteRevision").is_none());
            assert!(result["recoveryWarning"].is_string());
        }
    }
}
impl LocalApi {
    pub(crate) fn orphan_draft_inventory(&self) -> Result<Value, String> {
        let start = std::time::Instant::now();
        let inventory = self.recovery_drafts()?;
        let mut items = vec![];
        let mut limited = inventory["limited"] == true;
        let mut locations = BTreeMap::new();
        let mut warnings = inventory["warnings"]
            .as_array()
            .cloned()
            .unwrap_or_default();
        for row in inventory["items"].as_array().into_iter().flatten() {
            if start.elapsed() > Duration::from_secs(2) {
                limited = true;
                break;
            }
            if !matches!(row["state"].as_str(), Some("orphan" | "unavailable")) {
                continue;
            }
            let Some(id) = row["documentId"].as_str() else {
                continue;
            };
            let (project, relative) = document_ref(id)?;
            let location = locations
                .entry(project.clone())
                .or_insert_with(|| self.orphan_location(id).ok());
            let recoverable =
                row["state"] == "orphan" && location.is_some() && row["fingerprint"].is_string();
            items.push(json!({"draftKey":row["key"],"fingerprint":row["fingerprint"],"locationRevision":location,"documentId":id,"projectId":project,"projectName":row["projectName"],"path":relative,"name":row["name"],"kind":row["kind"],"pageCount":row["pageCount"],"wordCount":row["wordCount"],"createdAt":row["updatedAt"],"draftUpdatedAt":row["updatedAt"],"recoverable":recoverable,"reason":if recoverable{Value::Null}else{json!("No se puede comprobar la ubicación de origen. La copia se conserva para revisión.")}}));
        }
        if limited {
            warnings.push(json!("La revisión de archivos ausentes es parcial por presupuesto. Las copias restantes se conservan; consulta Recuperación para ampliar la revisión."));
        }
        Ok(
            json!({"schemaVersion":1,"items":items,"limited":limited,"warnings":warnings,"queriedAt":knownext_core::now_iso()}),
        )
    }
    fn orphan_location(&self, id: &str) -> Result<String, String> {
        let (project, _) = document_ref(id)?;
        let root = self
            .project_root(&project)?
            .canonicalize()
            .map_err(|_| "La ubicación del proyecto ya no está disponible")?;
        Ok(sha256_hex(root.to_string_lossy().as_bytes()))
    }
    fn checked_orphan_snapshot(
        &self,
        key: &str,
        body: Value,
    ) -> Result<(draft_store::KeySnapshot, PathBuf), String> {
        let review: Review = serde_json::from_value(body).map_err(|_| {
            "Actualiza la lista: falta una revisión completa de la copia y su ubicación"
        })?;
        if [&review.expected_fingerprint, &review.location_revision]
            .iter()
            .any(|hash| hash.len() != 64 || !hash.bytes().all(|b| b.is_ascii_hexdigit()))
        {
            return Err(
                "La revisión de la copia no es válida; actualiza antes de modificarla".into(),
            );
        }
        let snapshot = draft_store::snapshot_key(&self.app_data_dir.join("drafts"), key)?
            .ok_or("La copia ya no está disponible; actualiza la lista")?;
        if snapshot.value["documentId"] != review.document_id
            || snapshot.fingerprint != review.expected_fingerprint
        {
            return Err("La copia cambió desde la revisión. Se conserva sin restaurar ni descartar; actualiza la lista.".into());
        }
        if self.orphan_location(&review.document_id)? != review.location_revision {
            return Err(
                "La ubicación del proyecto cambió. Revisa de nuevo la copia antes de continuar."
                    .into(),
            );
        }
        let path = self.resolve_document_path(&review.document_id)?;
        match fs::symlink_metadata(&path){Err(e) if e.kind()==std::io::ErrorKind::NotFound=>{},_=>return Err("El archivo volvió a estar disponible o no se puede comprobar su ausencia. El borrador activo se conserva; revisa el documento.".into())}
        Ok((snapshot, path))
    }
    pub(crate) fn restore_reviewed_orphan(&self, key: &str, body: Value) -> Result<Value, String> {
        let (snapshot, path) = self.checked_orphan_snapshot(key, body)?;
        self.restore_orphan_snapshot(key, snapshot, path)
    }
    pub(crate) fn discard_reviewed_orphan(&self, key: &str, body: Value) -> Result<(), String> {
        let (snapshot, _) = self.checked_orphan_snapshot(key, body)?;
        draft_store::remove_snapshot_key(&self.app_data_dir.join("drafts"), key, &snapshot)
    }
    #[cfg(test)]
    pub(super) fn restore_orphan_draft(&self, key: &str) -> Result<Value, String> {
        let snapshot = draft_store::snapshot_key(&self.app_data_dir.join("drafts"), key)?
            .ok_or("Borrador no disponible")?;
        let path = self.resolve_document_path(
            snapshot.value["documentId"]
                .as_str()
                .ok_or("Borrador sin identidad")?,
        )?;
        self.restore_orphan_snapshot(key, snapshot, path)
    }
    fn restore_orphan_snapshot(
        &self,
        key: &str,
        snapshot: draft_store::KeySnapshot,
        path: PathBuf,
    ) -> Result<Value, String> {
        self.restore_orphan_snapshot_with(key, snapshot, path, || {})
    }
    fn restore_orphan_snapshot_with(
        &self,
        key: &str,
        snapshot: draft_store::KeySnapshot,
        path: PathBuf,
        after_source: impl FnOnce(),
    ) -> Result<Value, String> {
        let draft = &snapshot.value;
        let id = draft["documentId"]
            .as_str()
            .ok_or("Borrador sin identidad")?;
        let location = self.orphan_location(id)?;
        let handwritten = is_handwritten_note_path(&path);
        let bytes = if handwritten {
            let title = path
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("Nota recuperada");
            serde_json::to_vec_pretty(&normalize_handwritten_note(
                draft["content"].clone(),
                id,
                title,
            ))
            .map_err(|e| e.to_string())?
        } else if is_markdown_path(&path) {
            draft["markdown"]
                .as_str()
                .ok_or("El borrador no contiene Markdown")?
                .as_bytes()
                .to_vec()
        } else {
            return Err("Este tipo de archivo no admite recuperación".into());
        };
        if bytes.len() as u64>document_validation::NOTE_BYTES{return Err("El contenido preparado supera64MiB; no se ha recreado el archivo y el borrador se conserva.".into());}
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        atomic_io::create(&path,&bytes).map_err(|_|"No se pudo recrear en un destino libre. El archivo existente y el borrador se conservan.")?;
        after_source();
        // Prepare the acknowledged source before retiring any recovery data.
        let mut record = if handwritten {
            self.handwritten_record(id, false)?
        } else {
            self.document_record(id, false)?
        };
        if record["baseFingerprint"] != fingerprint_bytes(&bytes)
            || self.orphan_location(id)? != location
        {
            return Err("El archivo o la ubicación cambiaron tras recrearlo. El borrador se conserva para revisión; no se repite la recuperación.".into());
        }
        let mut warning = (|| {
            let meta = fs::symlink_metadata(&path)
                .map_err(|_| "No se pudo confirmar el archivo recreado; borrador conservado")?;
            if !meta.is_file() || batch::linked(&meta) || meta.len() != bytes.len() as u64 {
                return Err("El archivo cambió tras recrearlo. El borrador se conserva.".into());
            }
            let mut observed = Vec::new();
            fs::File::open(&path)
                .map_err(|_| "No se pudo confirmar el archivo recreado")?
                .take(bytes.len() as u64 + 1)
                .read_to_end(&mut observed)
                .map_err(|_| "No se pudo confirmar el archivo recreado")?;
            if observed != bytes {
                return Err("El archivo cambió tras recrearlo. El borrador se conserva.".into());
            }
            draft_store::remove_snapshot_key(&self.app_data_dir.join("drafts"), key, &snapshot)
        })()
        .err();
        let revision = (|| {
            let current = draft_store::inspect(&self.app_data_dir.join("drafts"), id)?;
            draft_versions::ensure_kind(id, current.as_ref())?;
            let revision = draft_versions::revision(current.as_ref())?;
            if revision.is_some() && revision != draft_versions::revision(Some(&snapshot.value))? {
                return Err("Existe otro borrador conservado después de recrear el archivo. Revísalo antes de guardar.".into());
            }
            Ok::<_, String>(revision)
        })();
        match revision {
            Ok(revision) => {
                record["draftWriteRevision"] = json!(revision);
            }
            Err(message) => {
                warning = Some(message);
            }
        }
        if let Some(message) = &warning {
            record["draftWriteConflict"] = json!(true);
            record["recoveryWarning"] = json!(message);
            record.as_object_mut().unwrap().remove("draftWriteRevision");
        }
        Ok(if handwritten {
            json!({"kind":"handwritten-note","note":record,"recoveryWarning":warning})
        } else {
            json!({"kind":"document","document":record,"recoveryWarning":warning})
        })
    }
}
