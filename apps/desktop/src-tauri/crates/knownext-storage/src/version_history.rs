use super::*;

pub(super) struct HistoryEntry {
    pub(super) version: Value,
    pub(super) path: String,
}

impl LocalApi {
    pub(super) fn git_document_history(&self, document_id: &str) -> Result<Vec<HistoryEntry>, String> {
        let (project, relative) = document_ref(document_id)?;
        self.resolve_document_path(document_id)?;
        let root = self.project_root(&project)?;
        if !root.join(".git").exists() || git_head_hash(&root)?.is_none() {
            return Ok(vec![]);
        }
        let tip=self.history_query_tip(&project)?;
        let output = run_local_git(local_git_command().arg("-C").arg(&root).args([
            "--no-pager",
            "log",
            "--follow",
            "--no-ext-diff",
            "--no-textconv",
            "--format=%H%x00%an%x00%aI%x00%s%x00",
            "--name-status",
            "-z",
            &tip,
            "--",
            &relative,
        ]))?;
        if !output.status.success() {
            return Err(
                "No se pudo consultar el historial Git del documento. Los archivos se conservan."
                    .into(),
            );
        }
        parse_history(&output.stdout, &relative)
    }

    pub(super) fn list_versions(&self, document_id: &str) -> Result<Vec<Value>, String> {
        Ok(self
            .git_document_history(document_id)?
            .into_iter()
            .map(|entry| entry.version)
            .collect())
    }

    pub(super) fn create_version(&self, project_id: &str, body: Value) -> Result<Value, String> {
        let _publication = self.project_transaction(project_id)?;
        let id = body["documentId"].as_str().ok_or("Falta documentId")?;
        let (owner, relative) = document_ref(id)?;
        if owner != project_id {
            return Err("El documento pertenece a otro proyecto".into());
        }
        let path = self.resolve_document_path(id)?;
        if !is_markdown_path(&path) && !is_handwritten_note_path(&path) {
            return Err("Este formato no admite versiones de documento".into());
        }
        let root = self.project_root(project_id)?;
        if !root.join(".git").exists() {
            return Err("Activa el historial local del proyecto antes de crear una versión".into());
        }
        let title = body["title"].as_str().unwrap_or("Versión local");
        git_commit_paths(&root, title, &[&relative])?;
        let version = self
            .list_versions(id)?
            .into_iter()
            .next()
            .ok_or("Git no contiene una versión de este documento")?;
        Ok(json!({"version": version}))
    }

    pub(super) fn version_content(
        &self,
        document_id: &str,
        version_id: &str,
    ) -> Result<Value, String> {
        self.resolve_markdown_path(document_id)?;
        let (project, _) = document_ref(document_id)?;
        let root = self.project_root(&project)?;
        let history = self.git_document_history(document_id)?;
        let legacy = if history
            .iter()
            .any(|entry| entry.version["id"] == version_id)
        {
            None
        } else {
            // Old IDs are accepted only if both their identity and their bytes can be proved in Git.
            // Lossy legacy filenames never establish ownership. No legacy file is rewritten or removed.
            let file = self
                .versions_dir()
                .join(safe_name(document_id))
                .with_extension("json");
            let value = self.read_json(&file, json!([]));
            value
                .as_array()
                .and_then(|items| {
                    items
                        .iter()
                        .find(|item| item["id"] == version_id && item["projectId"] == project)
                })
                .cloned()
        };
        let entry = history
            .iter()
            .find(|entry| {
                entry.version["id"] == version_id
                    || legacy.as_ref().is_some_and(|old| {
                        old["hash"].as_str().is_some_and(|hash| {
                            hash.len() >= 8
                                && hash.bytes().all(|byte| byte.is_ascii_hexdigit())
                                && entry.version["id"]
                                    .as_str()
                                    .is_some_and(|full| full.starts_with(hash))
                        })
                    })
            })
            .ok_or("Versión no encontrada en el historial de este documento")?;
        let hash = entry.version["id"]
            .as_str()
            .ok_or("Identificador de versión no válido")?;
        let output = run_local_git(local_git_command().arg("-C").arg(root).args([
            "--no-pager",
            "show",
            "--no-ext-diff",
            "--no-textconv",
            &format!("{hash}:{}", entry.path),
        ]))?;
        if !output.status.success() {
            return Err("No se pudo leer el contenido guardado en Git".into());
        }
        let markdown = String::from_utf8(output.stdout)
            .map_err(|_| "La versión no contiene Markdown UTF-8 válido")?;
        if legacy
            .as_ref()
            .is_some_and(|old| old["markdown"].as_str() != Some(markdown.as_str()))
        {
            return Err("La copia antigua no coincide con Git. Se conserva para revisión; abre la versión desde el historial actualizado.".into());
        }
        Ok(json!({"documentId":document_id,"versionId":version_id,"markdown":markdown}))
    }

    pub(super) fn restore_version(
        &self,
        document_id: &str,
        version_id: &str,
        body: Value,
    ) -> Result<Value, String> {
        let path=self.resolve_markdown_path(document_id)?;
        let content = self.version_content(document_id, version_id)?;
        // Git history/content reads can take time. Recheck the user's actual
        // bases immediately before publication, without adopting a later draft.
        if self.resolve_markdown_path(document_id)?!=path
            || body["baseFingerprint"].is_null()
            || self.fingerprint(&path)!=body["baseFingerprint"]
            || json!(self.draft_write_revision(document_id)?)!=body.get("expectedDraftWriteRevision").cloned().unwrap_or(Value::Null)
        {return Err("El archivo, su ubicación o el borrador cambiaron mientras se leía la versión. No se ha restaurado; conserva la edición abierta y revisa de nuevo.".into());}
        let saved = self.save_document(document_id, json!({"markdown":content["markdown"]}))?;
        let (project, relative) = document_ref(document_id)?;
        let name = relative.rsplit('/').next().unwrap_or(&relative);
        let mut result = self.create_version(&project, json!({"documentId":document_id,"title":format!("Restaura {name} desde {}",version_id.chars().take(8).collect::<String>())}))
            .unwrap_or_else(|_|json!({"version":null,"historyWarning":"El contenido se ha restaurado en disco, pero no se pudo registrar su versión local. Conserva el archivo y vuelve a guardar cuando el historial esté disponible."}));
        result["recoveryWarning"] = saved["recoveryWarning"].clone();
        result["savedDocument"] = saved;
        Ok(result)
    }
}

#[cfg(test)]
mod publication_guard_tests {
    use super::*;
    #[test]
    fn restore_publication_rechecks_reviewed_disk_and_private_draft_after_reading_history() {
        let owned=tempfile::tempdir().unwrap();
        let api=LocalApi::new(owned.path().join("state"),"qa".into(),"test".into());
        let project=api.create_project(json!({"name":"Owned restore publication","versioningMode":"local-git","syncMode":"none"})).unwrap();
        let project=project["id"].as_str().unwrap();let root=api.project_root(project).unwrap();let path=root.join("Review.md");let id=doc_id(project,"Review.md");
        std::fs::write(&path,"Historical").unwrap();
        let first=api.create_version(project,json!({"documentId":id,"title":"Owned historical"})).unwrap()["version"]["id"].as_str().unwrap().to_string();
        std::fs::write(&path,"Current").unwrap();api.create_version(project,json!({"documentId":id,"title":"Owned current"})).unwrap();
        let seen=api.get_document(&id).unwrap();let body=json!({"baseFingerprint":seen["baseFingerprint"],"expectedDraftWriteRevision":seen["draftWriteRevision"]});
        std::fs::write(&path,"Changed after review").unwrap();
        assert!(api.restore_version(&id,&first,body).is_err());assert_eq!(std::fs::read_to_string(&path).unwrap(),"Changed after review");assert_eq!(api.list_versions(&id).unwrap().len(),2);
        std::fs::write(&path,"Current").unwrap();api.save_draft(&id,json!({"markdown":"Known draft"})).unwrap();let seen=api.get_document(&id).unwrap();let body=json!({"baseFingerprint":seen["baseFingerprint"],"expectedDraftWriteRevision":seen["draftWriteRevision"]});
        api.save_draft(&id,json!({"markdown":"Later draft"})).unwrap();assert!(api.restore_version(&id,&first,body).is_err());assert_eq!(api.get_document(&id).unwrap()["markdown"],"Later draft");assert_eq!(std::fs::read_to_string(&path).unwrap(),"Current");assert_eq!(api.list_versions(&id).unwrap().len(),2);
        let seen=api.get_document(&id).unwrap();let result=api.handle("POST",&format!("/api/documents/{id}/versions/{first}/restore"),json!({"baseFingerprint":seen["baseFingerprint"],"expectedDraftWriteRevision":seen["draftWriteRevision"]}),vec![]).unwrap();assert_eq!(result.status,200,"{}",result.body);assert_eq!(std::fs::read_to_string(&path).unwrap(),"Historical");assert_eq!(api.list_versions(&id).unwrap().len(),3);assert_eq!(api.version_content(&id,&first).unwrap()["markdown"],"Historical");
    }
}

pub(super) fn is_commit_id(value: &str) -> bool {
    matches!(value.len(), 40 | 64) && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn parse_history(bytes: &[u8], relative: &str) -> Result<Vec<HistoryEntry>, String> {
    let tokens = bytes
        .split(|byte| *byte == 0)
        .map(|part| {
            std::str::from_utf8(part)
                .map_err(|_| "El historial contiene nombres o metadatos que no son UTF-8")
        })
        .collect::<Result<Vec<_>, _>>()?;
    let mut index = 0;
    let mut path = relative.to_string();
    let mut entries = vec![];
    while index < tokens.len() {
        while index < tokens.len() && tokens[index].trim_matches('\n').is_empty() {
            index += 1;
        }
        if index == tokens.len() {
            break;
        }
        let hash = tokens[index].trim_start_matches('\n');
        if !is_commit_id(hash) || index + 3 >= tokens.len() {
            return Err("No se pudo interpretar el historial Git sin ambigüedad".into());
        }
        let author = tokens[index + 1];
        let date = tokens[index + 2];
        let title = tokens[index + 3];
        index += 4;
        let mut commit_path = None;
        while index < tokens.len() {
            let status = tokens[index].trim_start_matches('\n');
            if is_commit_id(status) {
                break;
            }
            index += 1;
            if status.is_empty() {
                continue;
            }
            let code = status.as_bytes()[0];
            if !b"AMDTUXBRC".contains(&code) || index >= tokens.len() {
                return Err("El historial Git contiene un cambio no reconocido".into());
            }
            let old = tokens[index];
            index += 1;
            let new = if matches!(code, b'R' | b'C') {
                let next = *tokens.get(index).ok_or("Renombrado Git incompleto")?;
                index += 1;
                next
            } else {
                old
            };
            if new == path {
                if code != b'D' {
                    commit_path = Some(path.clone());
                }
                if code == b'R' {
                    path = old.to_string();
                }
            }
        }
        if let Some(commit_path) = commit_path {
            let initials = author
                .split_whitespace()
                .filter_map(|word| word.chars().next())
                .take(2)
                .collect::<String>()
                .to_uppercase();
            entries.push(HistoryEntry{path:commit_path,version:json!({"id":hash,"hash":&hash[..8],"title":title,"author":author,"authorInitials":initials,"createdAt":date,"relativeTime":"","current":entries.is_empty()})});
        }
    }
    Ok(entries)
}
