use super::*;

pub(super) struct ReferenceUpdates {
    pub affected: Vec<Value>,
    pub warnings: Vec<String>,
}

impl LocalApi {
    pub(super) fn apply_reference_updates_after_move(
        &self,
        project: &str,
        moved: &[(String, String)],
    ) -> Result<ReferenceUpdates, String> {
        let root = self.project_root(project)?;
        let mappings = moved.iter().cloned().collect::<BTreeMap<_, _>>();
        let old_by_new = moved
            .iter()
            .map(|(old, new)| (new.clone(), old.clone()))
            .collect::<BTreeMap<_, _>>();
        let mut result = ReferenceUpdates {
            affected: vec![],
            warnings: vec![],
        };
        for path in collect_project_files(&root)? {
            if !is_markdown_path(&path) {
                continue;
            }
            let relative = relative_from_root(&root, &path);
            let old = old_by_new.get(&relative).unwrap_or(&relative);
            let id = doc_id(project, &relative);
            let before = match self.get_document(&id) {
                Ok(record) => record,
                Err(error) => {
                    result.warnings.push(format!("{relative}: {error}"));
                    break;
                }
            };
            let disk = before["diskMarkdown"]
                .as_str()
                .ok_or("No se pudo leer la base guardada de las referencias")?;
            let draft = match self.read_draft(&id) {
                Ok(draft) => draft,
                Err(error) => {
                    result.warnings.push(format!("{relative}: {error}"));
                    break;
                }
            };
            let disk_after = document_links::rewrite(disk, old, &relative, &mappings);
            let text = draft.as_ref().and_then(|draft| draft["markdown"].as_str());
            let draft_after =
                text.map(|text| document_links::rewrite(text, old, &relative, &mappings));
            if disk_after == disk && draft_after.as_deref() == text {
                continue;
            }
            let applied = (|| {
                if std::fs::read_to_string(&path).map_err(|error| error.to_string())? != disk
                    || self.read_draft(&id)? != draft
                {
                    return Err("El contenido cambió mientras se revisaban sus referencias. Se conservan los cambios para revisión.".into());
                }
                let mut next_draft = draft.clone();
                if let (Some(value), Some(text)) = (&mut next_draft, &draft_after) {
                    value["markdown"] = json!(text);
                    value["draftContentHash"] = json!(markdown_content_hash(text));
                    if Some(&*value) != draft.as_ref() {
                        draft_store::write(&self.app_data_dir.join("drafts"), &id, value)?;
                    }
                }
                if disk_after != disk {
                    if std::fs::read_to_string(&path).map_err(|error| error.to_string())? != disk {
                        return Err("El archivo cambió antes de actualizar sus referencias".into());
                    }
                    atomic_io::write(&path, disk_after.as_bytes())
                        .map_err(|error| error.to_string())?;
                    // Advance only a base that matched the exact pre-rewrite disk. Stale/unknown bases stay stale.
                    if let Some(value) = &mut next_draft {
                        if draft.as_ref().is_some_and(|old| {
                            draft_base_is_verified(old)
                                && old["baseFingerprint"] == fingerprint_bytes(disk.as_bytes())
                        }) {
                            if self.read_draft(&id)?.as_ref() != Some(value) {
                                return Err("Llegó otro borrador después de actualizar el archivo. Se conserva para revisión.".into());
                            }
                            value["baseFingerprint"] = fingerprint_bytes(disk_after.as_bytes());
                            value["baseContentHash"] = json!(markdown_content_hash(&disk_after));
                            value["savedContentHash"] = value["baseContentHash"].clone();
                            value["diskContentHash"] = value["baseContentHash"].clone();
                            draft_store::write(&self.app_data_dir.join("drafts"), &id, value)?;
                        }
                    }
                }
                Ok::<_, String>(())
            })();
            match self.get_document(&id) {
                Ok(record)=>result.affected.push(json!({"oldId":doc_id(project,old),"newId":id,"name":record["name"],"path":relative,"referenceUpdated":true,"previousMarkdown":before["markdown"],"document":record})),
                Err(error)=>result.warnings.push(format!("{relative}: no se pudo actualizar su vista: {error}")),
            }
            if let Err(error) = applied {
                result.warnings.push(format!("{relative}: {error}"));
                break;
            }
        }
        if moved
            .iter()
            .any(|(old, new)| is_image_path(Path::new(old)) || is_image_path(Path::new(new)))
        {
            let _ = self.reindex_project_images(project);
        }
        Ok(result)
    }
}
