//! Review two versions, preserve both, then rebase only the local draft.
use super::*;
use std::{fs, io::Read};

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture()->(tempfile::TempDir,LocalApi,String,PathBuf){
        let owned=tempfile::tempdir().unwrap();let api=LocalApi::new(owned.path().join("state"),"qa".into(),"test".into());let project=api.create_project(json!({"name":"Owned conflict QA","versioningMode":"none"})).unwrap();let root=api.project_root(project["id"].as_str().unwrap()).unwrap();let id=doc_id(project["id"].as_str().unwrap(),"review.md");let path=root.join("review.md");fs::write(&path,"Base\n").unwrap();api.save_draft(&id,json!({"markdown":"Local\n","baseFingerprint":api.fingerprint(&path)})).unwrap();fs::write(&path,"Disk\n").unwrap();(owned,api,id,path)
    }
    fn payload(review:&Value)->Value{json!({"locationRevision":review["locationRevision"],"diskFingerprint":review["diskFingerprint"],"draftRevision":review["draftRevision"],"localMarkdown":"Local\n","mergedMarkdown":"Local\nDisk\n"})}

    #[test]
    fn merged_draft_preserves_both_versions_rebases_to_reviewed_disk_and_rejects_later_changes(){
        let (_owned,api,id,path)=fixture();let review=api.review_document_conflict(&id).unwrap();let source=fs::read(&path).unwrap();let result=api.apply_document_conflict(&id,payload(&review)).unwrap();
        assert_eq!(fs::read(&path).unwrap(),source);assert_eq!(result["document"]["markdown"],"Local\nDisk\n");assert_eq!(result["document"]["baseFingerprint"],review["diskFingerprint"]);assert_eq!(result["document"]["diskChanged"],false);
        let copies=api.archived_drafts().unwrap();assert_eq!(copies["items"].as_array().unwrap().len(),3);assert!(copies["items"].as_array().unwrap().iter().all(|copy|copy["canCopy"]==true));
        let original_copies=result["preservedCopies"].as_array().unwrap().iter().map(|copy|{let value:Value=serde_json::from_slice(&fs::read(api.app_data_dir.join("drafts-review").join(copy.as_str().unwrap()).join("copy.json")).unwrap()).unwrap();value["markdown"].as_str().unwrap().to_string()}).collect::<BTreeSet<_>>();assert_eq!(original_copies,BTreeSet::from(["Local\n".into(),"Disk\n".into(),"Local\nDisk\n".into()]));
        fs::write(&path,"Later disk\n").unwrap();assert!(api.apply_document_conflict(&id,payload(&review)).is_err());let saved=api.handle("PUT",&format!("/api/documents/{id}"),json!({"markdown":"Local\nDisk\n","baseFingerprint":result["document"]["baseFingerprint"],"expectedDraftWriteRevision":result["document"]["draftWriteRevision"]}),vec![]).unwrap();assert_eq!(saved.status,409);assert_eq!(fs::read_to_string(&path).unwrap(),"Later disk\n");
        let next=api.review_document_conflict(&id).unwrap();api.save_draft(&id,json!({"markdown":"New draft\n"})).unwrap();assert!(api.apply_document_conflict(&id,payload(&next)).is_err());assert_eq!(api.read_draft(&id).unwrap().unwrap()["markdown"],"New draft\n");assert_eq!(api.archived_drafts().unwrap()["items"].as_array().unwrap().len(),3);
    }

    #[test]
    fn failed_merge_write_and_future_draft_keep_originals_and_verified_recovery(){
        let (_owned,api,id,path)=fixture();let review=api.review_document_conflict(&id).unwrap();let active=draft_store::path(&api.app_data_dir.join("drafts"),&id);let original=fs::read(&active).unwrap();let permissions=fs::metadata(&active).unwrap().permissions();let mut readonly=permissions.clone();readonly.set_readonly(true);fs::set_permissions(&active,readonly).unwrap();let result=api.apply_document_conflict(&id,payload(&review));fs::set_permissions(&active,permissions).unwrap();assert!(result.is_err());assert_eq!(fs::read(&active).unwrap(),original);assert_eq!(fs::read_to_string(&path).unwrap(),"Disk\n");assert_eq!(api.archived_drafts().unwrap()["items"].as_array().unwrap().len(),3);
        let mut future:Value=serde_json::from_slice(&original).unwrap();future["schemaVersion"]=json!(99);let future=serde_json::to_vec(&future).unwrap();fs::write(&active,&future).unwrap();assert!(api.apply_document_conflict(&id,payload(&review)).is_err());assert!(api.delete_draft(&id).is_err());assert_eq!(fs::read(&active).unwrap(),future);
    }
}
const MAX_TEXT: usize = 2 * 1024 * 1024;

#[derive(Serialize,Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Apply {
    #[serde(default,skip_serializing_if="Option::is_none")]
    attempt_id:Option<String>,
    #[serde(default)]
    remote_source:Option<remote_conflicts::RemoteSource>,
    #[serde(default)]
    history_source:Option<HistorySource>,
    location_revision:String,
    disk_fingerprint: Value,
    draft_revision: Option<String>,
    local_markdown: String,
    merged_markdown: String,
}
#[derive(Serialize,Deserialize)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
struct HistorySource{version_id:String,markdown_sha256:String}

fn directory(path: &Path) -> Result<(), String> {
    match fs::symlink_metadata(path) {
        Ok(meta) if !meta.is_dir() || batch::linked(&meta) => {
            Err("El archivo de recuperación no es una carpeta regular".into())
        }
        Ok(_) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(_) => Err("No se puede consultar la recuperación".into()),
    }
}
pub(super) fn draft_revision(draft: &Option<Value>) -> Result<Option<String>, String> {
    draft
        .as_ref()
        .map(|value| {
            serde_json::to_vec(value)
                .map(|b| sha256_hex(&b))
                .map_err(|_| "No se pudo revisar el borrador".into())
        })
        .transpose()
}
fn checked_text(value: &str) -> Result<(), String> {
    if value.len() > MAX_TEXT {
        return Err(
            "Esta revisión admite hasta2MiB por versión. Las fuentes se conservan sin cambios"
                .into(),
        );
    }
    Ok(())
}

impl LocalApi {
    fn checked_history_source(&self,id:&str,source:&HistorySource)->Result<Value,String>{
        if !version_history::is_commit_id(&source.version_id){return Err("Selecciona una versión del historial actual de este documento".into())}
        let content=self.version_content(id,&source.version_id)?;let markdown=content["markdown"].as_str().ok_or("La versión no contiene Markdown")?;checked_text(markdown)?;
        if sha256_hex(markdown.as_bytes())!=source.markdown_sha256{return Err("El contenido histórico no coincide con la revisión; vuelve a revisarlo".into())}
        Ok(json!({"versionId":source.version_id,"markdownSha256":source.markdown_sha256,"markdown":markdown}))
    }
    pub(super) fn review_version_draft(&self,id:&str,version:&str)->Result<Value,String>{
        if !version_history::is_commit_id(version){return Err("Selecciona una versión del historial actual de este documento".into())}
        let content=self.version_content(id,version)?;let markdown=content["markdown"].as_str().ok_or("La versión no contiene Markdown")?;checked_text(markdown)?;
        let mut review=self.review_document_conflict(id)?;review["historySource"]=json!({"versionId":version,"markdownSha256":sha256_hex(markdown.as_bytes()),"markdown":markdown});Ok(review)
    }
    pub(super) fn review_document_conflict(&self, id: &str) -> Result<Value, String> {
        let path = self.resolve_markdown_path(id)?;
        let meta =
            fs::symlink_metadata(&path).map_err(|_| "No se puede consultar la fuente actual")?;
        if !meta.is_file() || batch::linked(&meta) || meta.len() as usize > MAX_TEXT {
            return Err(
                "Fuente no regular o mayor de2MiB; se conserva el contenido abierto".into(),
            );
        }
        let mut text = String::new();
        fs::File::open(&path)
            .map_err(|_| "No se puede abrir la fuente actual")?
            .take(MAX_TEXT as u64 + 1)
            .read_to_string(&mut text)
            .map_err(|_| "No se puede leer la fuente actual como UTF-8")?;
        checked_text(&text)?;
        let draft = self.read_draft(id)?;draft_versions::ensure_kind(id,draft.as_ref())?;
        let (project,_)=document_ref(id)?;
        let location=self.project_root(&project)?.canonicalize().map_err(|_|"No se puede verificar la ubicación del proyecto")?;
        Ok(json!({"documentId":id,"locationRevision":sha256_hex(location.to_string_lossy().as_bytes()),"diskMarkdown":text,"diskFingerprint":fingerprint_bytes(text.as_bytes()),"draftRevision":draft_revision(&draft)?,"checkedAt":knownext_core::now_iso()}))
    }
    fn preserve_conflict_version(
        &self,
        id: &str,
        markdown: &str,
        base: Value,
        operation: &str,
        side: &str,
    ) -> Result<String, String> {
        self.preserve_conflict_copy(id,json!({"markdown":markdown}),base,operation,side)
    }
    pub(super) fn preserve_conflict_copy(&self,id:&str,mut value:Value,base:Value,operation:&str,side:&str)->Result<String,String>{
        directory(&self.app_data_dir)?;
        let root = self.app_data_dir.join("drafts-review");
        directory(&root)?;
        if !root.exists() {
            fs::create_dir(&root)
                .map_err(|_| "No se pudo preparar la conservación del conflicto")?;
        }
        directory(&root)?;
        let archive = knownext_core::compact_id("recovery");
        let folder = root.join(&archive);
        value["documentId"]=json!(id);value["baseFingerprint"]=base;value["draftUpdatedAt"]=json!(knownext_core::now_iso());
        let content =
            serde_json::to_vec(&value).map_err(|_| "No se pudo preparar una copia de conflicto")?;
        let _budget=recovery_inventory::admit(self,content.len() as u64+4096)?;
        fs::create_dir(&folder).map_err(|_| "No se pudo conservar una versión del conflicto")?;
        atomic_io::create(&folder.join("copy.json"), &content).map_err(|_| {
            "No se pudo conservar una versión. Fuente y borrador no se han sustituido"
        })?;
        if fs::read(folder.join("copy.json"))
            .map_err(|_| "No se pudo comprobar la copia del conflicto")?
            != content
        {
            return Err(
                "La copia de conflicto no coincide; no se ha sustituido el borrador".into(),
            );
        }
        let manifest = json!({"schemaVersion":1,"id":archive,"sourceKey":format!("v2_{}",sha256_hex(id.as_bytes())),"fingerprint":sha256_hex(&content),"bytes":content.len(),"archivedAt":knownext_core::now_iso(),"operationId":operation,"reason":side,"retention":"manual-no-auto-expiry"});
        atomic_io::create(&folder.join("manifest.json"),&serde_json::to_vec(&manifest).map_err(|_|"No se pudo preparar el registro de conflicto")?).map_err(|_|"La copia está conservada, pero su registro no se confirmó. No se ha sustituido el borrador")?;
        Ok(archive)
    }
    pub(super) fn apply_document_conflict(
        &self,
        id: &str,
        payload: Value,
    ) -> Result<Value, String> {
        let _transaction=self.project_transaction(&document_ref(id)?.0)?;
        let request: Apply = serde_json::from_value(payload)
            .map_err(|_| "La combinación necesita una revisión completa")?;
        checked_text(&request.local_markdown)?;
        checked_text(&request.merged_markdown)?;
        if request.history_source.is_some()&&request.remote_source.is_some(){return Err("Elige un único origen histórico o remoto para esta combinación".into());}
        let remote=request.remote_source.as_ref().map(|source|self.checked_remote_source(id,source)).transpose()?;
        let history=request.history_source.as_ref().map(|source|self.checked_history_source(id,source)).transpose()?;
        let reviewed = self.review_document_conflict(id)?;
        if reviewed["locationRevision"]!=request.location_revision||reviewed["diskFingerprint"] != request.disk_fingerprint
            || reviewed["draftRevision"] != json!(request.draft_revision)
        {
            return Err("La fuente o el borrador cambiaron. Revisa de nuevo; no se ha sustituido ninguna versión".into());
        }
        let request_value=serde_json::to_value(&request).map_err(|_|"No se pudo identificar la combinación")?;
        let mut attempt=conflict_attempts::begin(self,id,"markdown",&request_value)?;
        let operation = attempt.as_ref().map(|attempt|attempt.operation_id().to_owned()).unwrap_or_else(||knownext_core::compact_id("conflict"));
        let old = self.read_draft(id)?;
        let local = self.preserve_conflict_version(
            id,
            &request.local_markdown,
            old.as_ref()
                .and_then(|d| d.get("baseFingerprint"))
                .cloned()
                .unwrap_or(Value::Null),
            &operation,
            "conflict-local",
        )?;
        let disk = reviewed["diskMarkdown"]
            .as_str()
            .ok_or("Falta la versión del disco")?;
        let saved_disk = self.preserve_conflict_version(
            id,
            disk,
            reviewed["diskFingerprint"].clone(),
            &operation,
            "conflict-disk",
        )?;
        let proposed=self.preserve_conflict_copy(id,json!({"markdown":request.merged_markdown,"historySource":history}),reviewed["diskFingerprint"].clone(),&operation,"conflict-proposed")?;
        let saved_remote=if let Some(source)=&remote {Some(self.preserve_conflict_copy(id,json!({"markdown":source["markdown"]}),reviewed["diskFingerprint"].clone(),&operation,&format!("conflict-remote-{}",source["remoteCommit"].as_str().unwrap_or("unknown")))?)}else{None};
        let mut copies=vec![local.clone(),saved_disk.clone(),proposed];if let Some(copy)=saved_remote{copies.push(copy);}
        if let Some(attempt)=&mut attempt{attempt.ready(self,&copies)?;}
        let current = self.review_document_conflict(id)?;
        if current["locationRevision"]!=reviewed["locationRevision"]||current["diskFingerprint"] != reviewed["diskFingerprint"]
            || current["draftRevision"] != reviewed["draftRevision"]
        {
            return Err("Una versión cambió durante la conservación. Las copias siguen disponibles; revisa de nuevo antes de combinar".into());
        }
        if let Some(source)=request.history_source.as_ref(){self.checked_history_source(id,source)?;}
        if let Some(source)=request.remote_source.as_ref(){self.checked_remote_source(id,source)?;}
        let now = knownext_core::now_iso();
        let disk_hash = markdown_content_hash(disk);
        let merged_hash = markdown_content_hash(&request.merged_markdown);
        let dirty = merged_hash != disk_hash;
        let target=if dirty {
            let mut merged = old.unwrap_or_else(|| json!({}));
            merged["documentId"] = json!(id);
            merged["markdown"] = json!(request.merged_markdown);
            merged["baseFingerprint"] = reviewed["diskFingerprint"].clone();
            merged["baseContentHash"] = json!(disk_hash);
            merged["savedContentHash"] = json!(disk_hash);
            merged["diskContentHash"] = json!(disk_hash);
            merged["draftContentHash"] = json!(merged_hash);
            merged["draftUpdatedAt"] = json!(now);
            Some(merged)
        } else {None};
        if let Some(attempt)=&mut attempt{attempt.applying(self,&target)?;}
        let write_revision=draft_versions::revision(target.as_ref())?;
        if let Some(merged)=target{draft_store::write(&self.app_data_dir.join("drafts"),id,&merged).map_err(|_|format!("No se confirmó el borrador combinado. Las copias {local} y {saved_disk} se conservan; revisa el estado antes de otra acción"))?;}else{self.delete_draft(id)?;}
        if let Some(attempt)=&mut attempt{attempt.complete(self)?;}
        let (project, relative) = document_ref(id)?;
        let record = json!({"id":id,"projectId":project,"path":relative,"name":Path::new(&relative).file_name().and_then(|n|n.to_str()).unwrap_or("Documento"),"markdown":request.merged_markdown,"diskMarkdown":disk,"wordCount":knownext_core::word_count(&request.merged_markdown),"updatedAt":now,"baseFingerprint":reviewed["diskFingerprint"],"baseVerified":true,"diskContentHash":disk_hash,"savedContentHash":disk_hash,"draftWriteRevision":write_revision,"draftContentHash":if dirty{json!(merged_hash)}else{Value::Null},"hasDraft":dirty,"isDirty":dirty,"diskChanged":false,"orphaned":false,"conflictStatus":if dirty{"draft"}else{"none"},"draftUpdatedAt":if dirty{json!(now)}else{Value::Null}});
        Ok(json!({"id":operation,"attemptId":request.attempt_id,"document":record,"preservedCopies":copies,"sourceUnchanged":true,"historySource":history.as_ref().map(|source|json!({"versionId":source["versionId"],"markdownSha256":source["markdownSha256"]})),"remoteSource":request.remote_source,"checkedAt":knownext_core::now_iso()}))
    }
    pub(crate) fn review_document_conflict_attempt(&self,id:&str,attempt:&str,payload:Value)->Result<Value,String>{
        let request:Apply=serde_json::from_value(payload).map_err(|_|"La consulta necesita el intento y revisión originales")?;
        if request.attempt_id.as_deref()!=Some(attempt){return Err("La consulta no corresponde al intento elegido".into());}
        checked_text(&request.local_markdown)?;checked_text(&request.merged_markdown)?;
        if let Some(source)=&request.history_source{self.checked_history_source(id,source)?;}
        if let Some(source)=&request.remote_source{self.checked_remote_source(id,source)?;}
        let current=self.review_document_conflict(id)?;let value=serde_json::to_value(&request).map_err(|_|"No se pudo identificar el intento")?;
        conflict_attempts::observe(self,id,"markdown",attempt,&value,&current)
    }
}
