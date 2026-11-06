//! Document snapshots, optimistic save bases and recoverable local drafts.
use super::*;

#[cfg(test)]
mod disk_replacement_tests {
    use super::*;

    #[test]
    fn unreadable_disk_preserves_drafts_and_success_returns_the_prepared_disk_record() {
        let owned=tempfile::tempdir().unwrap();
        let api=LocalApi::new(owned.path().join("app"),"qa".into(),"test".into());
        let project=api.create_project(json!({"name":"Owned disk QA","versioningMode":"none","syncMode":"none"})).unwrap();
        let project_id=project["id"].as_str().unwrap();let root=api.project_root(project_id).unwrap();
        let id=doc_id(project_id,"Review.md");let path=root.join("Review.md");
        std::fs::write(&path,"Original disk").unwrap();
        api.save_draft(&id,json!({"markdown":"Pending edit","baseFingerprint":api.fingerprint(&path)})).unwrap();
        let original=api.read_draft(&id).unwrap();
        std::fs::remove_file(&path).unwrap();
        assert!(api.discard_draft_and_read_disk(&id,false).is_err());assert_eq!(api.read_draft(&id).unwrap(),original);
        std::fs::write(&path,[0xff,0xfe]).unwrap();
        assert!(api.discard_draft_and_read_disk(&id,false).is_err());assert_eq!(api.read_draft(&id).unwrap(),original);
        std::fs::write(&path,"New disk").unwrap();
        let response=api.handle("POST",&format!("/api/documents/{id}/draft/discard-and-read"),json!({"expectedDraftWriteRevision":api.draft_write_revision(&id).unwrap()}),vec![]).unwrap();
        assert_eq!(response.body["markdown"],"New disk");assert_eq!(response.body["hasDraft"],false);
        assert_eq!(response.body["baseFingerprint"],api.fingerprint(&path));assert!(api.read_draft(&id).unwrap().is_none());
        assert_eq!(std::fs::read_to_string(&path).unwrap(),"New disk");

        let note_id=doc_id(project_id,"Sketch.knote");let note_path=root.join("Sketch.knote");
        let mut note=normalize_handwritten_note(json!({"version":1}),&note_id,"Original note");
        note["pages"][0]["strokes"]=json!([{"id":"owned-tilt-stroke","color":"#111827","width":2,"opacity":1,"points":[[10,20,0.7,0,45,-30],[20,30,0.8,16,35,-20]]}]);
        std::fs::write(&note_path,serde_json::to_vec(&note).unwrap()).unwrap();
        let mut edited=note.clone();edited["title"]=json!("Pending note");
        api.save_handwritten_note_draft(&note_id,json!({"content":edited,"baseFingerprint":api.fingerprint(&note_path)})).unwrap();
        let draft=api.read_draft(&note_id).unwrap();assert!(draft.is_some());
        std::fs::write(&note_path,"{ invalid JSON").unwrap();
        assert!(api.discard_draft_and_read_disk(&note_id,true).is_err());assert_eq!(api.read_draft(&note_id).unwrap(),draft);
        let mut future=note.clone();future["schemaVersion"]=json!(2);
        std::fs::write(&note_path,serde_json::to_vec(&future).unwrap()).unwrap();
        assert!(api.discard_draft_and_read_disk(&note_id,true).is_err());assert_eq!(api.read_draft(&note_id).unwrap(),draft);
        std::fs::write(&note_path,serde_json::to_vec(&note).unwrap()).unwrap();
        let response=api.handle("POST",&format!("/api/handwritten-notes/{note_id}/draft/discard-and-read"),json!({"expectedDraftWriteRevision":api.draft_write_revision(&note_id).unwrap()}),vec![]).unwrap();
        assert_eq!(response.body["hasDraft"],false);assert_eq!(response.body["content"]["title"],"Original note");assert!(api.read_draft(&note_id).unwrap().is_none());
        assert_eq!(serde_json::from_slice::<Value>(&std::fs::read(&note_path).unwrap()).unwrap(),note);
    }
}

impl LocalApi {
    /// Prepare the readable disk record before deleting recovery data. Return
    /// that snapshot, avoiding a fallible second read after the explicit discard.
    pub(super) fn discard_draft_and_read_disk(&self, id: &str, handwritten: bool) -> Result<Value, String> {
        let record = if handwritten { self.handwritten_record_checked(id, false, true)? } else { self.document_record(id, false)? };
        self.delete_draft(id)?;
        Ok(record)
    }

    pub(super) fn get_document(&self, document_id: &str) -> Result<Value, String> {
        self.document_record(document_id, true)
    }

    pub(super) fn document_record(
        &self,
        document_id: &str,
        recover_draft: bool,
    ) -> Result<Value, String> {
        let path = self.resolve_markdown_path(document_id)?;
        let markdown = std::fs::read_to_string(&path).map_err(|error| error.to_string())?;
        let (project_id, relative) = document_ref(document_id)?;
        let disk_content_hash = markdown_content_hash(&markdown);
        let draft = if recover_draft {
            self.read_draft(document_id)?
        } else {
            None
        };
        draft_versions::ensure_kind(document_id,draft.as_ref())?;
        let draft_markdown = draft
            .as_ref()
            .and_then(|value| value["markdown"].as_str())
            .unwrap_or(&markdown);
        let draft_content_hash = draft
            .as_ref()
            .map(|_| markdown_content_hash(draft_markdown));
        let has_draft = draft_content_hash
            .as_ref()
            .map(|hash| hash != &disk_content_hash)
            .unwrap_or(false);
        let active_markdown = if has_draft { draft_markdown } else { &markdown };
        let draft_updated_at = draft
            .as_ref()
            .and_then(|value| value["draftUpdatedAt"].as_str())
            .map(Value::from)
            .unwrap_or(Value::Null);
        let current_fingerprint = fingerprint_bytes(markdown.as_bytes());
        let base_fingerprint = if has_draft {
            draft
                .as_ref()
                .and_then(|value| value.get("baseFingerprint"))
                .filter(|value| !value.is_null())
                .cloned()
                .unwrap_or_else(|| current_fingerprint.clone())
        } else {
            current_fingerprint.clone()
        };
        let base_verified = !has_draft || draft.as_ref().is_some_and(draft_base_is_verified);
        let disk_changed = has_draft && base_verified && base_fingerprint != current_fingerprint;
        let saved_content_hash = if has_draft {
            draft
                .as_ref()
                .and_then(|value| value.get("baseContentHash"))
                .filter(|value| !value.is_null())
                .cloned()
                .unwrap_or_else(|| json!(disk_content_hash))
        } else {
            json!(disk_content_hash)
        };
        Ok(json!({
            "id": document_id,
            "name": path.file_name().and_then(|value| value.to_str()).unwrap_or("documento.md"),
            "path": relative,
            "projectId": project_id,
            "markdown": active_markdown,
            "diskMarkdown": markdown,
            "wordCount": knownext_core::word_count(active_markdown),
            "updatedAt": knownext_core::now_iso(),
            "baseFingerprint": base_fingerprint,
            "baseVerified": base_verified,
            "recoveryWarning": if base_verified { Value::Null } else { json!("No se puede verificar la base original de este borrador. Revisa las versiones antes de reemplazar el archivo.") },
            "diskContentHash": disk_content_hash,
            "savedContentHash": saved_content_hash,
            "draftWriteRevision":draft_versions::revision(draft.as_ref())?,
            "draftContentHash": if has_draft { draft_content_hash.map(Value::from).unwrap_or(Value::Null) } else { Value::Null },
            "hasDraft": has_draft,
            "isDirty": has_draft,
            "diskChanged": disk_changed,
            "orphaned": false,
            "conflictStatus": if disk_changed { "disk-changed" } else if has_draft { "draft" } else { "none" },
            "draftUpdatedAt": if has_draft { draft_updated_at } else { Value::Null }
        }))
    }

    pub(super) fn save_base_changed(&self, id: &str, payload: &Value) -> Result<bool, String> {
        if payload["force"].as_bool() == Some(true) {
            return Ok(false);
        }
        if self
            .read_draft(id)?
            .as_ref()
            .is_some_and(|draft| !draft_base_is_verified(draft))
        {
            let path = self.resolve_document_path(id)?;
            if !path.exists() {
                return Ok(true);
            }
            let record = if is_handwritten_note_path(&path) {
                self.get_handwritten_note(id)?
            } else {
                self.get_document(id)?
            };
            if record["hasDraft"] == true {
                return Ok(true);
            }
        }
        let Some(base) = payload
            .get("baseFingerprint")
            .filter(|value| !value.is_null())
        else {
            return Ok(false);
        };
        let path = self.resolve_document_path(id)?;
        Ok(self.fingerprint(&path) != *base)
    }

    pub(super) fn save_document(&self, document_id: &str, payload: Value) -> Result<Value, String> {
        let path = self.resolve_markdown_path(document_id)?;
        let before=self.read_draft(document_id)?;draft_versions::ensure_kind(document_id,before.as_ref())?;
        let markdown = payload
            .get("markdown")
            .and_then(Value::as_str)
            .ok_or("Falta el contenido Markdown del documento")?;
        write_string_atomic(&path, markdown)?;
        let warning = self.clear_unchanged_draft(document_id,&before).err();
        let mut record = self.document_record(document_id, false)?;
        if warning.is_some(){record["draftWriteConflict"]=json!(true);record.as_object_mut().unwrap().remove("draftWriteRevision");}
        record["recoveryWarning"] = warning.map(Value::from).unwrap_or(Value::Null);
        Ok(record)
    }

    pub(super) fn get_handwritten_note(&self, note_id: &str) -> Result<Value, String> {
        self.handwritten_record(note_id, true)
    }

    pub(super) fn handwritten_record(
        &self,
        note_id: &str,
        recover_draft: bool,
    ) -> Result<Value, String> {
        self.handwritten_record_checked(note_id, recover_draft, false)
    }

    fn handwritten_record_checked(&self, note_id: &str, recover_draft: bool, require_supported_disk: bool) -> Result<Value, String> {
        let path = self.resolve_handwritten_path(note_id)?;
        let source=document_validation::handwritten_source(&path);
        let missing=matches!(&source,Ok(None));
        let (disk_content,disk_bytes)=match source{Ok(Some(value))=>value,other=>{
            let message=other.err().unwrap_or_else(||"La nota del disco ya no existe".into());
            if recover_draft&&!require_supported_disk {if let Some(draft)=self.read_draft(note_id)?{draft_versions::ensure_kind(note_id,Some(&draft))?;let write_revision=draft_versions::revision(Some(&draft))?;let content=draft.get("content").ok_or("El borrador no contiene una nota conocida")?.clone();document_validation::handwritten(&content)?;let content=normalize_handwritten_note(content,note_id,path.file_stem().and_then(|n|n.to_str()).unwrap_or("Nota"));let (project,relative)=document_ref(note_id)?;
                return Ok(json!({"id":note_id,"projectId":project,"path":relative,"name":path.file_name().and_then(|n|n.to_str()).unwrap_or("Nota.knote"),"content":content,"diskContent":null,"pageCount":content["pages"].as_array().unwrap().len(),"updatedAt":knownext_core::now_iso(),"baseFingerprint":draft["baseFingerprint"],"baseVerified":false,"recoveryWarning":format!("{message}. El borrador local se conserva; puedes recuperarlo como otra nota desde Recuperación."),"sourceUnavailable":!missing,"draftWriteRevision":write_revision,"diskContentHash":null,"savedContentHash":draft["baseContentHash"],"draftContentHash":handwritten_content_hash(&content),"hasDraft":true,"isDirty":true,"diskChanged":!missing,"orphaned":missing,"conflictStatus":if missing{"orphaned"}else{"disk-changed"},"draftUpdatedAt":draft["draftUpdatedAt"]}));
            }}return Err(message);
        }};
        let (project_id, relative) = document_ref(note_id)?;
        let normalized_disk = normalize_handwritten_note(
            disk_content,
            note_id,
            path.file_stem()
                .and_then(|value| value.to_str())
                .unwrap_or("Nota a mano"),
        );
        let disk_content_hash = handwritten_content_hash(&normalized_disk);
        let draft = if recover_draft {
            self.read_draft(note_id)?
        } else {
            None
        };
        draft_versions::ensure_kind(note_id,draft.as_ref())?;
        let draft_content = draft
            .as_ref()
            .and_then(|value| value.get("content").cloned())
            .map(|content| {
                normalize_handwritten_note(
                    content,
                    note_id,
                    normalized_disk["title"].as_str().unwrap_or("Nota a mano"),
                )
            })
            .unwrap_or_else(|| normalized_disk.clone());
        let draft_content_hash = draft
            .as_ref()
            .map(|_| handwritten_content_hash(&draft_content));
        let has_draft = draft_content_hash
            .as_ref()
            .map(|hash| hash != &disk_content_hash)
            .unwrap_or(false);
        let active_content = if has_draft {
            draft_content
        } else {
            normalized_disk.clone()
        };
        let page_count = active_content["pages"]
            .as_array()
            .map(Vec::len)
            .unwrap_or(0);
        let current_fingerprint = fingerprint_bytes(&disk_bytes);
        let base_fingerprint = if has_draft {
            draft
                .as_ref()
                .and_then(|value| value.get("baseFingerprint"))
                .filter(|value| !value.is_null())
                .cloned()
                .unwrap_or_else(|| current_fingerprint.clone())
        } else {
            current_fingerprint.clone()
        };
        let base_verified = !has_draft || draft.as_ref().is_some_and(draft_base_is_verified);
        let disk_changed = has_draft && base_verified && base_fingerprint != current_fingerprint;
        let saved_content_hash = if has_draft {
            draft
                .as_ref()
                .and_then(|value| value.get("baseContentHash"))
                .filter(|value| !value.is_null())
                .cloned()
                .unwrap_or_else(|| json!(disk_content_hash))
        } else {
            json!(disk_content_hash)
        };
        let draft_updated_at = draft
            .as_ref()
            .and_then(|value| value["draftUpdatedAt"].as_str())
            .map(Value::from)
            .unwrap_or(Value::Null);
        Ok(json!({
            "id": note_id,
            "name": path.file_name().and_then(|value| value.to_str()).unwrap_or("nota-a-mano.knote"),
            "path": relative,
            "projectId": project_id,
            "content": active_content,
            "diskContent": normalized_disk,
            "pageCount": page_count,
            "updatedAt": knownext_core::now_iso(),
            "baseFingerprint": base_fingerprint,
            "baseVerified": base_verified,
            "recoveryWarning": if base_verified { Value::Null } else { json!("No se puede verificar la base original de este borrador. Revisa las versiones antes de reemplazar el archivo.") },
            "diskContentHash": disk_content_hash,
            "savedContentHash": saved_content_hash,
            "draftWriteRevision":draft_versions::revision(draft.as_ref())?,
            "draftContentHash": if has_draft { draft_content_hash.map(Value::from).unwrap_or(Value::Null) } else { Value::Null },
            "hasDraft": has_draft,
            "isDirty": has_draft,
            "diskChanged": disk_changed,
            "orphaned": false,
            "conflictStatus": if disk_changed { "disk-changed" } else if has_draft { "draft" } else { "none" },
            "draftUpdatedAt": if has_draft { draft_updated_at } else { Value::Null }
        }))
    }

    pub(super) fn save_handwritten_note(
        &self,
        note_id: &str,
        payload: Value,
    ) -> Result<Value, String> {
        let path = self.resolve_handwritten_path(note_id)?;
        let before=self.read_draft(note_id)?;draft_versions::ensure_kind(note_id,before.as_ref())?;
        let source=document_validation::handwritten_source(&path)?;
        let title = path
            .file_stem()
            .and_then(|value| value.to_str())
            .unwrap_or("Nota a mano");
        let mut content = normalize_handwritten_note(
            document_validation::handwritten_payload(&payload)?,
            note_id,
            title,
        );
        content["updatedAt"] = Value::from(knownext_core::now_iso());
        let bytes=serde_json::to_vec_pretty(&content).map_err(|_|"No se pudo preparar la nota")?;
        if bytes.len() as u64>document_validation::NOTE_BYTES{return Err("La nota preparada supera64MiB; se conserva el original".into())}
        if document_validation::handwritten_source(&path)?.as_ref().map(|(_,bytes)|bytes)!=source.as_ref().map(|(_,bytes)|bytes){return Err("La fuente cambió durante el guardado de la nota; se conservan sus versiones".into())}
        if let Some(parent)=path.parent(){std::fs::create_dir_all(parent).map_err(|_|"No se pudo preparar la carpeta de la nota")?;}
        if source.is_none(){atomic_io::create(&path,&bytes)}else{atomic_io::write(&path,&bytes)}.map_err(|_|"No se confirmó el guardado de la nota; conserva el borrador y revisa el archivo")?;
        let warning = self.clear_unchanged_draft(note_id,&before).err();
        let (project,relative)=document_ref(note_id)?;let hash=handwritten_content_hash(&content);
        let mut record=json!({"id":note_id,"projectId":project,"path":relative,"name":path.file_name().and_then(|n|n.to_str()).unwrap_or("Nota.knote"),"content":content,"diskContent":content,"pageCount":content["pages"].as_array().unwrap().len(),"updatedAt":knownext_core::now_iso(),"baseFingerprint":fingerprint_bytes(&bytes),"baseVerified":true,"recoveryWarning":warning,"diskContentHash":hash,"savedContentHash":hash,"draftContentHash":null,"draftWriteRevision":null,"hasDraft":false,"isDirty":false,"diskChanged":false,"orphaned":false,"conflictStatus":"none","draftUpdatedAt":null});
        if warning.is_some(){record["draftWriteConflict"]=json!(true);record.as_object_mut().unwrap().remove("draftWriteRevision");}Ok(record)
    }

    pub(super) fn save_handwritten_note_draft(
        &self,
        note_id: &str,
        payload: Value,
    ) -> Result<Value, String> {
        let note_path = self.resolve_handwritten_path(note_id)?;
        let existing=self.read_draft(note_id)?;draft_versions::ensure_kind(note_id,existing.as_ref())?;
        let title = note_path
            .file_stem()
            .and_then(|value| value.to_str())
            .unwrap_or("Nota a mano");
        let mut content = normalize_handwritten_note(
            document_validation::handwritten_payload(&payload)?,
            note_id,
            title,
        );
        content["updatedAt"] = Value::from(knownext_core::now_iso());
        let draft_content_hash = handwritten_content_hash(&content);
        let source=document_validation::handwritten_source(&note_path);
        let source_warning=source.as_ref().err().cloned();
        let source=source.ok().flatten();
        let disk_content_hash=source.as_ref().map(|(value,_)|handwritten_content_hash(&normalize_handwritten_note(value.clone(),note_id,title)));
        if disk_content_hash
            .as_ref()
            .map(|hash| hash == &draft_content_hash)
            .unwrap_or(false)
        {
            self.delete_draft(note_id)?;
            return ok_value(json!({
                "noteId": note_id,
                "draftUpdatedAt": Value::Null,
                "isDirty": false,
                "hasDraft": false,
                "diskContentHash": disk_content_hash,
                "savedContentHash": disk_content_hash,
                "draftWriteRevision":null,
                "draftContentHash": Value::Null
            }));
        }
        let continuing = existing.as_ref().is_some_and(|draft| {
            draft.get("content").map(|value| {
                handwritten_content_hash(&normalize_handwritten_note(value.clone(), note_id, title))
            }) != disk_content_hash
        });
        let base_fingerprint = if continuing {
            existing
                .as_ref()
                .and_then(|draft| draft.get("baseFingerprint"))
                .cloned()
                .unwrap_or(Value::Null)
        } else {
            payload
                .get("baseFingerprint")
                .filter(|value| !value.is_null())
                .cloned()
                .unwrap_or_else(|| source.as_ref().map(|(_,bytes)|fingerprint_bytes(bytes)).unwrap_or(Value::Null))
        };
        let base_content_hash = if continuing {
            existing
                .as_ref()
                .and_then(|draft| draft.get("baseContentHash"))
                .cloned()
                .unwrap_or(Value::Null)
        } else {
            payload
                .get("baseContentHash")
                .filter(|value| !value.is_null())
                .cloned()
                .unwrap_or_else(|| {
                    disk_content_hash
                        .clone()
                        .map(Value::from)
                        .unwrap_or(Value::Null)
                })
        };
        let draft_updated_at = knownext_core::now_iso();
        let owned=json!({
                "documentId": note_id,
                "content": content,
                "sourceUnavailable":source_warning.is_some(),
                "baseFingerprint": base_fingerprint,
                "baseContentHash": base_content_hash,
                "diskContentHash": disk_content_hash,
                "savedContentHash": base_content_hash,
                "draftContentHash": draft_content_hash,
                "draftUpdatedAt": draft_updated_at
            });
        let mut next=existing.unwrap_or_else(||json!({}));if let Value::Object(fields)=owned{next.as_object_mut().ok_or("El borrador no contiene metadatos compatibles")?.extend(fields);}
        let write_revision=draft_versions::revision(Some(&next))?;
        draft_store::write(
            &self.app_data_dir.join("drafts"),
            note_id,
            &next,
        )?;
        ok_value(json!({
            "noteId": note_id,
            "sourceWarning":source_warning,
            "draftWriteRevision":write_revision,
            "draftUpdatedAt": draft_updated_at,
            "isDirty": true,
            "hasDraft": true,
            "diskContentHash": disk_content_hash,
            "savedContentHash": base_content_hash,
            "draftContentHash": draft_content_hash
        }))
    }

    pub(super) fn save_draft(&self, document_id: &str, payload: Value) -> Result<Value, String> {
        let document_path = self.resolve_markdown_path(document_id)?;
        let existing=self.read_draft(document_id)?;draft_versions::ensure_kind(document_id,existing.as_ref())?;
        let markdown = payload
            .get("markdown")
            .and_then(Value::as_str)
            .ok_or("Falta el contenido Markdown del borrador")?;
        let draft_content_hash = markdown_content_hash(markdown);
        let disk_markdown = std::fs::read_to_string(&document_path).ok();
        let disk_content_hash = disk_markdown.as_deref().map(markdown_content_hash);
        if disk_content_hash
            .as_ref()
            .map(|hash| hash == &draft_content_hash)
            .unwrap_or(false)
        {
            self.delete_draft(document_id)?;
            return ok_value(json!({
                "documentId": document_id,
                "draftWriteRevision":null,
                "draftUpdatedAt": Value::Null,
                "isDirty": false,
                "hasDraft": false,
                "diskContentHash": disk_content_hash,
                "savedContentHash": disk_content_hash,
                "draftContentHash": Value::Null
            }));
        }
        let continuing = existing.as_ref().is_some_and(|draft| {
            draft["markdown"].as_str().map(markdown_content_hash) != disk_content_hash
        });
        let base_fingerprint = if continuing {
            existing
                .as_ref()
                .and_then(|draft| draft.get("baseFingerprint"))
                .cloned()
                .unwrap_or(Value::Null)
        } else {
            payload
                .get("baseFingerprint")
                .filter(|value| !value.is_null())
                .cloned()
                .unwrap_or_else(|| {
                    disk_markdown
                        .as_ref()
                        .map(|text| fingerprint_bytes(text.as_bytes()))
                        .unwrap_or(Value::Null)
                })
        };
        let base_content_hash = if continuing {
            existing
                .as_ref()
                .and_then(|draft| draft.get("baseContentHash"))
                .cloned()
                .unwrap_or(Value::Null)
        } else {
            payload
                .get("baseContentHash")
                .filter(|value| !value.is_null())
                .cloned()
                .unwrap_or_else(|| {
                    disk_content_hash
                        .clone()
                        .map(Value::from)
                        .unwrap_or(Value::Null)
                })
        };
        let draft_updated_at = knownext_core::now_iso();
        let owned=json!({
                "documentId": document_id,
                "markdown": markdown,
                "baseFingerprint": base_fingerprint,
                "baseContentHash": base_content_hash,
                "diskContentHash": disk_content_hash,
                "savedContentHash": base_content_hash,
                "draftContentHash": draft_content_hash,
                "draftUpdatedAt": draft_updated_at
            });
        let mut next=existing.unwrap_or_else(||json!({}));if let Value::Object(fields)=owned{next.as_object_mut().ok_or("El borrador no contiene metadatos compatibles")?.extend(fields);}
        let write_revision=draft_versions::revision(Some(&next))?;
        draft_store::write(
            &self.app_data_dir.join("drafts"),
            document_id,
            &next,
        )?;
        ok_value(json!({
            "documentId": document_id,
            "draftWriteRevision":write_revision,
            "draftUpdatedAt": draft_updated_at,
            "isDirty": true,
            "hasDraft": true,
            "diskContentHash": disk_content_hash,
            "savedContentHash": base_content_hash,
            "draftContentHash": draft_content_hash
        }))
    }

    pub(super) fn delete_draft(&self, document_id: &str) -> Result<(), String> {
        draft_store::delete(&self.app_data_dir.join("drafts"), document_id)
    }

    pub(super) fn read_draft(&self, document_id: &str) -> Result<Option<Value>, String> {
        draft_store::read(&self.app_data_dir.join("drafts"), document_id)
    }

    #[cfg(test)]
    pub(super) fn read_draft_key(&self, draft_key: &str) -> Result<Option<Value>, String> {
        draft_store::read_key(&self.app_data_dir.join("drafts"), draft_key)
    }

    pub(super) fn orphan_drafts(&self) -> Value {
        self.orphan_draft_inventory().map(|review|review["items"].clone()).unwrap_or_else(|_|json!([]))
    }
}
