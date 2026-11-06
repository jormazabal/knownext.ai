//! Runtime facade extracted without changing method bodies or public contracts.
use super::*;

impl LocalApi {
    pub(super) fn create_folder(&self, project_id: &str, payload: Value) -> Result<Value, String> {
        let _publication = self.project_write(project_id)?;
        let parent =
            self.node_relative(project_id, payload.get("parentId").and_then(Value::as_str))?;
        let name = payload
            .get("name")
            .and_then(Value::as_str)
            .unwrap_or("Carpeta");
        let relative = join_relative(parent.as_deref(), name);
        let path = self.resolve_project_relative(project_id, &relative)?;
        std::fs::create_dir(path).map_err(|error| error.to_string())?;
        self.file_result(project_id, Some(relative), vec![])
    }

    pub(super) fn create_document(&self, project_id: &str, payload: Value) -> Result<Value, String> {
        let _publication = self.project_write(project_id)?;
        let parent =
            self.node_relative(project_id, payload.get("parentId").and_then(Value::as_str))?;
        let name = payload
            .get("name")
            .and_then(Value::as_str)
            .unwrap_or("documento.md");
        let relative = join_relative(parent.as_deref(), name);
        let path = self.resolve_project_relative(project_id, &relative)?;
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }
        atomic_io::create(&path, payload.get("markdown").and_then(Value::as_str).unwrap_or("").as_bytes())
            .map_err(|error| error.to_string())?;
        self.file_result(project_id, Some(relative), vec![])
    }

    pub(super) fn create_handwritten_note(&self, project_id: &str, payload: Value) -> Result<Value, String> {
        let _publication = self.project_write(project_id)?;
        let parent =
            self.node_relative(project_id, payload.get("parentId").and_then(Value::as_str))?;
        let raw_name = payload
            .get("name")
            .and_then(Value::as_str)
            .unwrap_or("nota-a-mano.knote");
        let name = handwritten_file_name(raw_name);
        let relative = join_relative(parent.as_deref(), &name);
        let note_id = doc_id(project_id, &relative);
        let path = self.resolve_project_relative(project_id, &relative)?;
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }
        let title = name.trim_end_matches(".knote");
        let mut content = default_handwritten_note(&note_id, title);
        let background = payload
            .get("background")
            .and_then(Value::as_str)
            .filter(|value| matches!(*value, "blank" | "ruled" | "grid" | "dots" | "cornell"))
            .unwrap_or("blank");
        content["defaultPage"]["background"] = Value::from(background);
        if let Some(first_page) = content["pages"]
            .as_array_mut()
            .and_then(|pages| pages.first_mut())
        {
            first_page["background"]["type"] = Value::from(background);
        }
        atomic_io::create(&path, &serde_json::to_vec_pretty(&content).map_err(|error| error.to_string())?).map_err(|error| error.to_string())?;
        self.file_result(project_id, Some(relative), vec![])
    }

    pub(super) fn delete_node(&self, project_id: &str, node_id: &str) -> Result<Value, String> {
        let _publication = self.project_write(project_id)?;
        let relative = self.project_node_relative(project_id, node_id)?;
        let path = self.resolve_project_relative(project_id, &relative)?;
        let affected = deleted_markdown_affected_documents(
            project_id,
            &self.project_root(project_id)?,
            &path,
        )?;
        trash::put(&self.project_root(project_id)?, project_id, &relative)?;
        self.file_result(project_id, None, affected)
    }

    pub(super) fn duplicate_document(&self, project_id: &str, document_id: &str) -> Result<Value, String> {
        let _publication = self.project_write(project_id)?;
        let relative = self.project_node_relative(project_id, document_id)?;
        let path = self.resolve_project_relative(project_id, &relative)?;
        let stem = path
            .file_stem()
            .and_then(|value| value.to_str())
            .unwrap_or("documento");
        let ext = path
            .extension()
            .and_then(|value| value.to_str())
            .map(|value| format!(".{value}"))
            .unwrap_or_default();
        let new_name = format!("{stem} copia{ext}");
        let new_relative = relative
            .rsplit_once('/')
            .map(|(parent, _)| format!("{parent}/{new_name}"))
            .unwrap_or(new_name);
        let new_path = self.resolve_project_relative(project_id, &new_relative)?;
        let bytes = std::fs::read(path).map_err(|error| error.to_string())?;
        atomic_io::create(&new_path, &bytes).map_err(|error| error.to_string())?;
        self.file_result(project_id, Some(new_relative), vec![])
    }

    pub(super) fn node_relative(
        &self,
        project_id: &str,
        node_id: Option<&str>,
    ) -> Result<Option<String>, String> {
        match node_id.filter(|value| !value.is_empty()) {
            Some(id) => Ok(Some(self.project_node_relative(project_id, id)?)),
            None => Ok(None),
        }
    }

    pub(super) fn file_result(
        &self,
        project_id: &str,
        selected_relative: Option<String>,
        affected: Vec<Value>,
    ) -> Result<Value, String> {
        let node = selected_relative
            .as_ref()
            .and_then(|relative| self.node_for_relative(project_id, relative).ok());
        let mut result=json!({"node":node,"affectedDocuments":affected});self.attach_project_tree(project_id,&mut result);
        if let Some(message)=result["treeWarning"].as_str().map(str::to_owned){result["warnings"]=json!([message]);}
        Ok(result)
    }

    pub(super) fn node_for_relative(&self, project_id: &str, relative: &str) -> Result<Value, String> {
        let path = self.resolve_project_relative(project_id, relative)?;
        Ok(tree_node(
            project_id,
            &self.project_root(project_id)?,
            &path,
            relative,
        ))
    }

    pub(super) fn export_document(&self,id:&str,body:Value)->Result<Value,String> {
        self.prepare_export(export_execution::Kind::Markdown,id,body,true)?.render()?.publish(self)
    }
    pub(super) fn export_handwritten_note(&self,id:&str,body:Value)->Result<Value,String> {
        self.prepare_export(export_execution::Kind::Handwritten,id,body,true)?.render()?.publish(self)
    }
    pub(super) fn render_handwritten_note_page(
        &self,
        note_id: &str,
        page_id: &str,
        query: &BTreeMap<String, String>,
    ) -> Result<Value, String> {
        let record = self.get_handwritten_note(note_id)?;
        let content = record["content"].clone();
        let format = query.get("format").map(String::as_str).unwrap_or("png");
        let (content_type, data_base64) = if format == "svg" {
            let (_page_id, svg) = knownext_docs::handwritten_note_svg(&content, Some(page_id))?;
            (
                "image/svg+xml",
                base64::engine::general_purpose::STANDARD.encode(svg.as_bytes()),
            )
        } else {
            let (_page_id, png) =
                knownext_docs::handwritten_note_png(&content, Some(page_id), 0.5)?;
            (
                "image/png",
                base64::engine::general_purpose::STANDARD.encode(png),
            )
        };
        Ok(json!({
            "noteId": note_id,
            "pageId": page_id,
            "format": if format == "svg" { "svg" } else { "png" },
            "contentType": content_type,
            "dataUrl": format!("data:{content_type};base64,{data_base64}"),
            "renderedAt": knownext_core::now_iso()
        }))
    }

    pub(super) fn documents_sync_status(&self, body: Value) -> Result<Value, String> {
        let documents = body["documents"].as_array().cloned().unwrap_or_default().into_iter().map(|item| {
            let id = item["documentId"].as_str().unwrap_or("");
            let path = self.resolve_document_path(id).ok();
            let exists = path.as_ref().map(|path| path.exists()).unwrap_or(false);
            let current_fingerprint = path.as_ref().filter(|path| path.exists()).map(|path| self.fingerprint(path)).unwrap_or(Value::Null);
            let base_fingerprint = item.get("baseFingerprint").cloned().unwrap_or(Value::Null);
            let disk_markdown = path.as_ref().filter(|path| path.exists()).and_then(|path| std::fs::read_to_string(path).ok());
            let disk_content_hash = disk_markdown.as_deref().map(markdown_content_hash);
            let draft = self.read_draft(id)?;
            let draft_markdown = draft.as_ref().and_then(|value| value["markdown"].as_str());
            let draft_content_hash = draft_markdown.map(markdown_content_hash);
            let has_draft = if exists {
                draft_content_hash.as_ref().zip(disk_content_hash.as_ref()).map(|(draft_hash, disk_hash)| draft_hash != disk_hash).unwrap_or(false)
            } else {
                draft.is_some()
            };
            let orphaned = !exists && has_draft;
            let disk_changed = exists && !base_fingerprint.is_null() && current_fingerprint != base_fingerprint;
            let conflict_status = if orphaned {
                "orphaned"
            } else if has_draft {
                "draft"
            } else if disk_changed {
                "disk-changed"
            } else {
                "none"
            };
            Ok(json!({ "documentId": id, "exists": exists, "currentFingerprint": current_fingerprint, "diskChanged": disk_changed, "hasDraft": has_draft, "orphaned": orphaned, "conflictStatus": conflict_status, "versionState": "ok", "localChanged": has_draft || disk_changed, "remoteChanged": false, "localVersionHash": null, "remoteVersionHash": null, "message": null, "diskContentHash": disk_content_hash, "savedContentHash": disk_content_hash, "draftContentHash": if has_draft { draft_content_hash.map(Value::from).unwrap_or(Value::Null) } else { Value::Null } }))
        }).collect::<Result<Vec<_>, String>>()?;
        Ok(json!({ "documents": documents }))
    }

    pub(super) fn fingerprint(&self, path: &Path) -> Value {
        std::fs::read(path).map(|bytes|fingerprint_bytes(&bytes)).unwrap_or(Value::Null)
    }

}
