//! Bind an explicitly incorporated context snapshot to the bytes that produced it.
//! Reads never upgrade legacy snapshots or silently replace their cached text.
use super::*;
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::Read,
    time::{Duration, Instant},
};
const MAX_FILE: u64 = 32 * 1024 * 1024;
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Proof {
    format: u8,
    mode: String,
    document_id: Option<String>,
    location_revision: Option<String>,
    file_revision: String,
    text_revision: String,
}
fn hash(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}
fn digest(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(|c| c.is_ascii_hexdigit())
}
pub(super) struct Captured {
    pub bytes: Vec<u8>,
    pub file_revision: String,
    pub location_revision: String,
    pub path: PathBuf,
}
impl LocalApi {
    pub(super) fn capture_context_file(&self, project: &str, id: &str) -> Result<Captured, String> {
        self.capture_context_file_bounded(project, id, MAX_FILE)
    }
    fn capture_context_file_bounded(
        &self,
        project: &str,
        id: &str,
        limit: u64,
    ) -> Result<Captured, String> {
        let maximum = MAX_FILE.min(limit);
        let (owner, relative) = document_ref(id)?;
        if owner != project {
            return Err("La fuente pertenece a otro proyecto".into());
        }
        let root = self
            .project_root(project)?
            .canonicalize()
            .map_err(|_| "No se puede revisar la ubicación del proyecto")?;
        let path = self.resolve_project_relative(project, &relative)?;
        let meta = fs::symlink_metadata(&path).map_err(|_| "La fuente ya no está disponible")?;
        if !meta.is_file() || batch::linked(&meta) || meta.len() > maximum {
            return Err("La fuente supera el presupuesto de lectura o no es regular; no se modifica la copia conservada".into());
        }
        let mut bytes = Vec::new();
        fs::File::open(&path)
            .map_err(|_| "No se puede leer la fuente")?
            .take(maximum + 1)
            .read_to_end(&mut bytes)
            .map_err(|_| "No se pudo completar la lectura de la fuente")?;
        let after =
            fs::symlink_metadata(&path).map_err(|_| "La fuente dejó de estar disponible")?;
        if bytes.len() as u64 > maximum
            || bytes.len() as u64 != meta.len()
            || !after.is_file()
            || after.len() != meta.len()
            || after.modified().ok() != meta.modified().ok()
            || batch::linked(&after)
            || root
                != self
                    .project_root(project)?
                    .canonicalize()
                    .map_err(|_| "Ubicación no comprobable")?
        {
            return Err(
                "La fuente cambió durante la lectura; conserva y revisa el contexto".into(),
            );
        }
        Ok(Captured {
            file_revision: hash(&bytes),
            location_revision: hash(root.to_string_lossy().as_bytes()),
            bytes,
            path,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture() -> (tempfile::TempDir, LocalApi, String, PathBuf, String) {
        let owned = tempfile::tempdir().unwrap();
        let api = LocalApi::new(owned.path().join("state"), "qa".into(), "test".into());
        let project = api
            .create_project(
                json!({"name":"Owned context origin","versioningMode":"none","syncMode":"none"}),
            )
            .unwrap();
        let project = project["id"].as_str().unwrap().to_string();
        let root = api.project_root(&project).unwrap();
        fs::write(root.join("A.md"), b"alpha body\n").unwrap();
        let id = doc_id(&project, "A.md");
        (owned, api, project, root, id)
    }
    fn body(review: &Value, n: u8) -> Value {
        json!({"sourceRevision":review["sourceRevision"],"fileRevision":review["fileRevision"],"locationRevision":review["locationRevision"],"attemptId":format!("attempt-{n:032x}")})
    }
    #[test]
    fn origin_reads_detect_same_metadata_edits_and_refresh_only_the_explicitly_reviewed_cache() {
        let (_owned, api, project, root, id) = fixture();
        api.ai_source(&project, &id, "project_document").unwrap();
        let path = api.context_sources_path(&project);
        let original = fs::read(&path).unwrap();
        let current = api.review_context_source(&project, &id).unwrap();
        assert_eq!(current["status"], "current");
        assert_eq!(current["source"]["requiresReview"], false);
        assert!(current["source"].get("text").is_none());
        assert!(current["source"].get("originProof").is_none());
        let file = fs::OpenOptions::new()
            .write(true)
            .open(root.join("A.md"))
            .unwrap();
        let date = file.metadata().unwrap().modified().unwrap();
        fs::write(root.join("A.md"), b"bravo body\n").unwrap();
        file.set_times(fs::FileTimes::new().set_modified(date))
            .unwrap();
        let changed = api.preview_context_source_checked(&project, &id).unwrap();
        assert_eq!(changed["originReview"]["status"], "changed");
        assert_eq!(changed["source"]["requiresReview"], true);
        assert_eq!(changed["previewText"], "alpha body\n");
        assert!(api
            .resolve_ai_context_sources(&project, &json!({"contextSourceIds":[id]}))
            .is_err());
        assert_eq!(fs::read(&path).unwrap(), original);
        let stale = body(&current, 1);
        assert!(api.refresh_context_source(&project, &id, stale).is_err());
        assert_eq!(fs::read(&path).unwrap(), original);
        let expected = body(&changed["originReview"], 2);
        let refreshed = api
            .refresh_context_source(&project, &id, expected.clone())
            .unwrap();
        assert_eq!(refreshed["status"], "current");
        assert_eq!(refreshed["publicationReviewed"], true);
        assert_eq!(refreshed["lastRefresh"]["attemptId"], expected["attemptId"]);
        let stored = fs::read(&path).unwrap();
        assert!(api.refresh_context_source(&project, &id, expected).is_err());
        assert_eq!(fs::read(&path).unwrap(), stored);
        assert_eq!(
            api.preview_context_source_checked(&project, &id).unwrap()["previewText"],
            "bravo body\n"
        );
        assert_eq!(fs::read(root.join("A.md")).unwrap(), b"bravo body\n");
        fs::write(root.join("A.md"), b"").unwrap();
        let empty = api.review_context_source(&project, &id).unwrap();
        assert!(api
            .refresh_context_source(&project, &id, body(&empty, 3))
            .is_err());
        assert!(api.ai_source(&project, &id, "project_document").is_err());
        assert_eq!(fs::read(&path).unwrap(), stored);
    }
    #[test]
    fn legacy_and_future_origins_are_preserved_without_implicit_migration_and_row_extensions_survive_refresh(
    ) {
        let (_owned, api, project, _root, id) = fixture();
        api.ai_source(&project, &id, "project_document").unwrap();
        let path = api.context_sources_path(&project);
        let mut legacy = api.context_checked(&project).unwrap();
        legacy["sources"][0]
            .as_object_mut()
            .unwrap()
            .remove("originProof");
        legacy["sources"][0]["privateExtension"] = json!({"preserve":true});
        api.write_json(&path, &legacy).unwrap();
        let bytes = fs::read(&path).unwrap();
        let review = api.review_context_source(&project, &id).unwrap();
        assert_eq!(review["status"], "unverified");
        assert_eq!(review["canRefresh"], true);
        assert!(api
            .resolve_ai_context_sources(&project, &json!({"contextSourceIds":[id]}))
            .is_err());
        assert_eq!(fs::read(&path).unwrap(), bytes);
        api.refresh_context_source(&project, &id, body(&review, 1))
            .unwrap();
        let stored = api.context_checked(&project).unwrap();
        assert_eq!(
            stored["sources"][0]["privateExtension"],
            json!({"preserve":true})
        );
        assert_eq!(
            stored["sources"][0]["createdAt"],
            legacy["sources"][0]["createdAt"]
        );
        let outgoing = api
            .resolve_ai_context_sources(&project, &json!({"contextSourceIds":[id]}))
            .unwrap();
        assert!(outgoing[0].get("privateExtension").is_none());
        assert!(outgoing[0].get("originProof").is_none());
        assert!(outgoing[0].get("lastRefresh").is_none());
        assert!(public(stored["sources"][0].clone())
            .get("privateExtension")
            .is_none());
        let mut future = stored.clone();
        future["sources"][0]["originProof"]["format"] = json!(2);
        api.write_json(&path, &future).unwrap();
        let future_bytes = fs::read(&path).unwrap();
        let review = api.review_context_source(&project, &id).unwrap();
        assert_eq!(review["status"], "unsupported");
        assert_eq!(review["canRefresh"], false);
        assert!(api.ai_source(&project, &id, "project_document").is_err());
        assert_eq!(fs::read(&path).unwrap(), future_bytes);
    }
    #[test]
    fn uploaded_snapshots_bind_text_and_duplicate_or_missing_identities_never_silently_drop_context(
    ) {
        let (_owned, api, project, _root, id) = fixture();
        api.ai_source(&project, &id, "project_document").unwrap();
        let mut snapshot = json!({"id":"upload-owned","projectId":project,"kind":"external_file","path":null,"status":"ready","text":"uploaded snapshot","originProof":snapshot_proof(b"original uploaded bytes","uploaded snapshot")});
        let mut budget = ReviewBudget::new();
        verify(&api, &project, &snapshot, &mut budget).unwrap();
        assert!(budget.files.is_empty());
        assert_eq!(public(snapshot.clone())["requiresReview"], false);
        snapshot["text"] = json!("different cache");
        assert!(verify(&api, &project, &snapshot, &mut budget).is_err());
        assert!(api
            .resolve_ai_context_sources(&project, &json!({"contextSourceIds":["missing"]}))
            .is_err());
        let path = api.context_sources_path(&project);
        let mut stored = api.context_checked(&project).unwrap();
        let duplicate = stored["sources"][0].clone();
        stored["sources"].as_array_mut().unwrap().push(duplicate);
        api.write_json(&path, &stored).unwrap();
        let bytes = fs::read(&path).unwrap();
        assert!(api
            .resolve_ai_context_sources(&project, &json!({"contextSourceIds":[id]}))
            .is_err());
        assert_eq!(fs::read(path).unwrap(), bytes);
    }
    #[test]
    fn indexed_chunks_share_one_file_review_and_old_indexes_are_not_rebound_on_read() {
        let (_owned, api, project, root, id) = fixture();
        fs::write(root.join("A.md"), b"alpha body\nalpha section\n").unwrap();
        let captured = api.capture_context_file(&project, &id).unwrap();
        let now = knownext_core::now_iso();
        let chunks=["alpha body","alpha section"].iter().enumerate().map(|(i,text)|json!({"id":format!("{id}#chunk-{}",i+1),"documentId":id,"path":"A.md","name":"A.md","chunkIndex":i,"text":text,"indexedAt":now,"originProof":file_proof(&id,&captured,text)})).collect::<Vec<_>>();
        let index = json!({"schemaVersion":1,"projectId":project,"vectorStoreId":format!("local-rag:{project}"),"indexedAt":now,"documents":[{"id":id,"path":"A.md","name":"A.md","mimeType":"text/markdown","sizeBytes":captured.bytes.len(),"chunkCount":2,"indexedAt":now,"status":"indexed"}],"chunks":chunks,"failedDocuments":[]});
        api.write_ai_index(&project, &index).unwrap();
        api.update_ai_rag_config(json!({"enabled":true})).unwrap();
        let resolved = api
            .resolve_ai_context_sources(&project, &json!({"prompt":"alpha"}))
            .unwrap();
        assert_eq!(resolved.as_array().unwrap().len(), 2);
        assert!(resolved
            .as_array()
            .unwrap()
            .iter()
            .all(|source| source.get("originProof").is_none() && source["sourceOrigin"] == "file"));
        let mut budget = ReviewBudget::new();
        for chunk in index["chunks"].as_array().unwrap() {
            let mut source = chunk.clone();
            source["id"] = json!(format!("rag:{}", chunk["id"].as_str().unwrap()));
            source["projectId"] = json!(project);
            source["kind"] = json!("project_document");
            source["status"] = json!("ready");
            verify(&api, &project, &source, &mut budget).unwrap();
        }
        assert_eq!(budget.files.len(), 1);
        assert_eq!(
            budget.remaining,
            64 * 1024 * 1024 - captured.bytes.len() as u64
        );
        fs::write(root.join("A.md"), b"later body\nlater section\n").unwrap();
        let revision = api.read_ai_index(&project).unwrap().unwrap().revision;
        assert!(api
            .resolve_ai_context_sources(&project, &json!({"prompt":"alpha"}))
            .is_err());
        assert_eq!(
            api.read_ai_index(&project).unwrap().unwrap().revision,
            revision
        );
        let mut legacy = index;
        for chunk in legacy["chunks"].as_array_mut().unwrap() {
            chunk.as_object_mut().unwrap().remove("originProof");
        }
        api.write_ai_index(&project, &legacy).unwrap();
        let revision = api.read_ai_index(&project).unwrap().unwrap().revision;
        assert!(api
            .resolve_ai_context_sources(&project, &json!({"prompt":"alpha"}))
            .is_err());
        assert_eq!(
            api.read_ai_index(&project).unwrap().unwrap().revision,
            revision
        );
        let index_path = api.ai_index_path(&project).unwrap();
        let mut future = legacy;
        future["schemaVersion"] = json!(2);
        let future_bytes = serde_json::to_vec(&future).unwrap();
        fs::write(&index_path, &future_bytes).unwrap();
        assert!(api
            .resolve_ai_context_sources(&project, &json!({"prompt":"alpha"}))
            .is_err());
        assert_eq!(fs::read(index_path).unwrap(), future_bytes);
    }
}
pub(super) fn file_proof(id: &str, captured: &Captured, text: &str) -> Value {
    known_file_proof(
        id,
        &captured.location_revision,
        &captured.file_revision,
        text,
    )
}
pub(super) fn known_file_proof(
    id: &str,
    location_revision: &str,
    file_revision: &str,
    text: &str,
) -> Value {
    json!({"format":1,"mode":"file","documentId":id,"locationRevision":location_revision,"fileRevision":file_revision,"textRevision":hash(text.as_bytes())})
}
pub(super) fn snapshot_proof(bytes: &[u8], text: &str) -> Value {
    json!({"format":1,"mode":"snapshot","documentId":null,"locationRevision":null,"fileRevision":hash(bytes),"textRevision":hash(text.as_bytes())})
}
fn parse(source: &Value) -> Result<Proof, String> {
    let proof:Proof=serde_json::from_value(source["originProof"].clone()).map_err(|_|"La copia de contexto no tiene una revisión de origen compatible. Vuelve a incorporarla explícitamente")?;
    if proof.format != 1
        || !matches!(proof.mode.as_str(), "file" | "snapshot")
        || !digest(&proof.file_revision)
        || !digest(&proof.text_revision)
        || proof.text_revision != hash(source["text"].as_str().unwrap_or("").as_bytes())
        || proof.mode == "file"
            && (proof.document_id.is_none()
                || !proof.location_revision.as_deref().is_some_and(digest))
        || proof.mode == "snapshot"
            && (proof.document_id.is_some() || proof.location_revision.is_some())
    {
        return Err(
            "La revisión de origen o de texto no es compatible; la copia se conserva sin usarla"
                .into(),
        );
    }
    Ok(proof)
}
pub(super) fn validate_proof(source: &Value) -> Result<(), String> {
    parse(source).map(|_| ())
}
pub(super) struct ReviewBudget {
    remaining: u64,
    started: Instant,
    files: BTreeMap<String, (String, String)>,
}
impl ReviewBudget {
    pub(super) fn new() -> Self {
        Self {
            remaining: 64 * 1024 * 1024,
            started: Instant::now(),
            files: BTreeMap::new(),
        }
    }
}
pub(super) fn verify(
    api: &LocalApi,
    project: &str,
    source: &Value,
    budget: &mut ReviewBudget,
) -> Result<(), String> {
    if source["projectId"].as_str() != Some(project)
        || !matches!(
            source["status"].as_str(),
            Some("ready" | "warning" | "expiring")
        )
        || !matches!(
            source["kind"].as_str(),
            Some("project_document" | "handwritten_note" | "external_file" | "image")
        )
    {
        return Err(
            "Hay una fuente no disponible para este contexto. Revísala antes de enviar".into(),
        );
    }
    let proof = parse(source)?;
    receipt(source)?;
    if source["kind"] != "image"
        && source["text"]
            .as_str()
            .is_none_or(|text| text.trim().is_empty())
    {
        return Err(
            "Una fuente no tiene texto utilizable. Revísala o quítala del contexto antes de enviar"
                .into(),
        );
    }
    if proof.mode == "snapshot" {
        return Ok(());
    }
    if budget.started.elapsed() > Duration::from_secs(2) {
        return Err(
            "La revisión del contexto agotó su presupuesto; reduce la selección y vuelve a revisar"
                .into(),
        );
    }
    let id = proof
        .document_id
        .as_deref()
        .ok_or("Falta el origen de la copia")?;
    let (owner, relative) = document_ref(id)?;
    if owner != project
        || source["path"].as_str() != Some(relative.as_str())
        || source["documentId"]
            .as_str()
            .or_else(|| source["id"].as_str())
            != Some(id)
    {
        return Err("La identidad de la fuente no corresponde a su revisión conservada".into());
    }
    if let Some((file_revision, location_revision)) = budget.files.get(id) {
        if file_revision == &proof.file_revision
            && Some(location_revision.as_str()) == proof.location_revision.as_deref()
        {
            return Ok(());
        }
        return Err("Hay revisiones incompatibles de un mismo archivo en el contexto. Actualiza las copias o el índice".into());
    }
    let path = api.resolve_project_relative(project, &relative)?;
    if fs::symlink_metadata(&path)
        .map_err(|_| "La fuente dejó de estar disponible")?
        .len()
        > budget.remaining
    {
        return Err("La selección supera64MiB de revisión de contexto. Reduce las fuentes; las copias se conservan".into());
    }
    let captured = api.capture_context_file_bounded(project, id, budget.remaining)?;
    budget.remaining = budget.remaining.saturating_sub(captured.bytes.len() as u64);
    if captured.file_revision != proof.file_revision
        || Some(captured.location_revision.as_str()) != proof.location_revision.as_deref()
    {
        return Err("Una fuente de contexto cambió de contenido o ubicación. Actualiza su copia explícitamente antes de enviar; el documento original se conserva".into());
    }
    budget.files.insert(
        id.to_string(),
        (captured.file_revision, captured.location_revision),
    );
    Ok(())
}
pub(super) fn build_source(
    api: &LocalApi,
    project: &str,
    id: &str,
    kind: &str,
    now: &str,
) -> Value {
    let path = document_ref(id)
        .ok()
        .filter(|(owner, _)| owner == project)
        .map(|(_, path)| path);
    let name = path
        .as_deref()
        .and_then(|path| path.rsplit('/').next())
        .unwrap_or(id);
    let mut size = 0usize;
    let mut warning: Option<String> = None;
    let mut failed = false;
    let mut proof = Value::Null;
    let text = match api.capture_context_file(project, id) {
        Ok(captured) => {
            size = captured.bytes.len();
            let extension = captured
                .path
                .extension()
                .and_then(|ext| ext.to_str())
                .unwrap_or("")
                .to_ascii_lowercase();
            let extracted = match extension.as_str() {
                "pdf" => knownext_docs::extract_pdf_text_bounded(&captured.bytes, 2 * 1024 * 1024),
                "docx" | "xlsx" => knownext_docs::extract_office_body_text_bounded(
                    &captured.bytes,
                    2 * 1024 * 1024,
                ),
                "md" | "txt" | "csv" if captured.bytes.len() <= 2 * 1024 * 1024 => {
                    String::from_utf8(captured.bytes.clone())
                        .map_err(|_| "La fuente textual no es UTF-8".into())
                }
                "knote" => serde_json::from_slice::<Value>(&captured.bytes)
                    .map_err(|_| "Nota no legible".to_string())
                    .and_then(|note| {
                        document_validation::handwritten(&note)?;
                        Ok(knownext_docs::handwritten_note_text(&note))
                    }),
                _ if kind == "image" => Ok(String::new()),
                _ => Err("El formato o tamaño no permite texto local revisable".into()),
            };
            match extracted {
                Ok(text) if text.len() <= 2 * 1024 * 1024 => {
                    if text.trim().is_empty() && kind != "image" {
                        warning = Some("Sin texto local extraíble; no se ha ejecutado OCR".into());
                    }
                    proof = file_proof(id, &captured, &text);
                    text
                }
                Ok(_) => {
                    failed = true;
                    warning = Some("El texto supera2MiB de contexto local".into());
                    String::new()
                }
                Err(error) => {
                    failed = true;
                    warning = Some(error);
                    String::new()
                }
            }
        }
        Err(error) => {
            failed = true;
            warning = Some(error);
            String::new()
        }
    };
    json!({"id":id,"projectId":project,"kind":kind,"name":name,"path":path,"mimeType":path.as_deref().map(|path|mime_for_path(Path::new(path))),"sizeBytes":size,"status":if failed{"error"}else if warning.is_some(){"warning"}else{"ready"},"weight":if size>500_000{"high"}else{"medium"},"warning":warning,"error":if failed{Some("Revisa la fuente antes de incorporarla al contexto")}else{None},"createdAt":now,"updatedAt":now,"lastUsedAt":null,"expiresAt":null,"text":text,"originProof":proof})
}
pub(super) fn bind_current_text(source: &mut Value) {
    let revision = hash(source["text"].as_str().unwrap_or("").as_bytes());
    if source["originProof"]["format"] == 1 {
        source["originProof"]["textRevision"] = json!(revision);
    }
}

pub(super) fn replacement(mut original: Value, new: &Value) -> Result<Value, String> {
    receipt(&original)?;
    if original
        .get("originProof")
        .is_some_and(|proof| !proof.is_null())
    {
        validate_proof(&original)?;
    }
    if new["status"] == "error"
        || (new["kind"] != "image"
            && new["text"]
                .as_str()
                .is_none_or(|text| text.trim().is_empty())
            && original["text"]
                .as_str()
                .is_some_and(|text| !text.trim().is_empty()))
    {
        return Err("No se pudo obtener texto utilizable del archivo. La copia anterior se conserva sin reemplazarla".into());
    }
    let created = original["createdAt"].clone();
    let used = original["lastUsedAt"].clone();
    for (key, value) in new.as_object().ok_or("Copia no compatible")? {
        original[key] = value.clone();
    }
    original["createdAt"] = created;
    original["lastUsedAt"] = used;
    if let Some(object) = original.as_object_mut() {
        object.remove("lastRefresh");
    }
    Ok(original)
}
fn revision(source: &Value) -> Result<String, String> {
    Ok(hash(
        &serde_json::to_vec(source).map_err(|_| "No se puede revisar la copia de contexto")?,
    ))
}
fn stored_source<'a>(store: &'a Value, id: &str) -> Result<&'a Value, String> {
    let matching = store["sources"]
        .as_array()
        .ok_or("Contexto no revisable")?
        .iter()
        .filter(|source| source["id"].as_str() == Some(id))
        .collect::<Vec<_>>();
    if matching.len() != 1 {
        return Err("Fuente ausente o de identidad ambigua; se conserva el contexto".into());
    }
    Ok(matching[0])
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RefreshReceipt {
    format: u8,
    attempt_id: String,
    previous_source_revision: String,
    file_revision: String,
    location_revision: String,
}
fn attempt_id(id: &str) -> bool {
    id.len() == 40
        && id.starts_with("attempt-")
        && id[8..].bytes().all(|byte| byte.is_ascii_hexdigit())
}
fn receipt(source: &Value) -> Result<Option<RefreshReceipt>, String> {
    let Some(value) = source.get("lastRefresh") else {
        return Ok(None);
    };
    let value: RefreshReceipt = serde_json::from_value(value.clone())
        .map_err(|_| "Recibo de fuente incompatible; se conserva")?;
    if value.format != 1
        || !attempt_id(&value.attempt_id)
        || [
            &value.previous_source_revision,
            &value.file_revision,
            &value.location_revision,
        ]
        .iter()
        .any(|v| !digest(v))
    {
        return Err("Recibo de fuente futuro o no compatible; se conserva".into());
    }
    Ok(Some(value))
}
impl LocalApi {
    pub(super) fn review_context_source(&self, project: &str, id: &str) -> Result<Value, String> {
        let store = self.context_checked(project)?;
        let source = stored_source(&store, id)?;
        let source_revision = revision(source)?;
        let mut result = json!({"source":public(source.clone()),"sourceRevision":source_revision,"status":"unverified","canRefresh":false,"fileRevision":null,"locationRevision":null,"checkedAt":knownext_core::now_iso(),"lastRefresh":null,"publicationReviewed":false});
        match receipt(source) {
            Ok(Some(receipt)) => {
                result["lastRefresh"] = serde_json::to_value(receipt).map_err(|e| e.to_string())?
            }
            Ok(None) => {}
            Err(error) => {
                result["status"] = json!("unsupported");
                result["message"] = json!(error);
                return Ok(result);
            }
        }
        let legacy = source.get("originProof").is_none_or(Value::is_null);
        let proof = if legacy {
            None
        } else {
            match parse(source) {
                Ok(proof) => Some(proof),
                Err(error) => {
                    result["status"] = json!("unsupported");
                    result["message"] = json!(error);
                    return Ok(result);
                }
            }
        };
        if let (Some(proof), Some(receipt)) = (&proof, receipt(source)?) {
            result["publicationReviewed"] = json!(
                proof.mode == "file"
                    && proof.document_id.as_deref() == Some(id)
                    && proof.file_revision == receipt.file_revision
                    && proof.location_revision.as_deref()
                        == Some(receipt.location_revision.as_str())
            );
        }
        if proof.as_ref().is_some_and(|proof| proof.mode == "snapshot") {
            result["status"] = json!("snapshot");
            result["message"]=json!("Instantánea incorporada: no se comprueba un archivo de origen. Para sustituirla, vuelve a adjuntar el archivo.");
            return Ok(result);
        }
        if source["path"].as_str().is_none() {
            result["message"]=json!("Esta copia no tiene un archivo de origen verificable. Consérvala o vuelve a adjuntar el original.");
            return Ok(result);
        }
        match self.capture_context_file(project, id) {
            Ok(current) => {
                let status = if legacy {
                    "unverified"
                } else if proof.as_ref().is_some_and(|proof| {
                    proof.file_revision == current.file_revision
                        && proof.location_revision.as_deref()
                            == Some(current.location_revision.as_str())
                }) {
                    "current"
                } else {
                    "changed"
                };
                result["status"] = json!(status);
                result["canRefresh"] = json!(true);
                result["fileRevision"] = json!(current.file_revision);
                result["locationRevision"] = json!(current.location_revision);
                result["message"]=json!(match status{"current"=>"La copia coincide con el archivo guardado revisado. No incluye edición sin guardar.","changed"=>"El archivo o su ubicación cambió. La previsualización conserva la copia anterior; actualízala explícitamente antes de enviarla.",_=>"Copia anterior sin prueba de origen. Se conserva y no se envía hasta incorporarla de nuevo explícitamente."});
            }
            Err(error) => {
                result["status"] = json!("unavailable");
                result["message"] = json!(error)
            }
        }
        let latest = self.context_checked(project)?;
        if revision(stored_source(&latest, id)?)? != source_revision {
            return Err("La copia cambió durante la consulta; vuelve a revisar".into());
        }
        if !matches!(result["status"].as_str(), Some("current" | "snapshot")) {
            result["source"]["requiresReview"] = json!(true);
            if let Some(message) = result["message"].as_str().map(str::to_string) {
                result["source"]["warning"] = json!(message);
            }
        }
        Ok(result)
    }
    pub(super) fn preview_context_source_checked(
        &self,
        project: &str,
        id: &str,
    ) -> Result<Value, String> {
        let review = self.review_context_source(project, id)?;
        self.preview_context_source_from_review(project, id, review)
    }
    pub(super) fn preview_context_source_from_review(
        &self,
        project: &str,
        id: &str,
        review: Value,
    ) -> Result<Value, String> {
        let store = self.context_checked(project)?;
        let source = stored_source(&store, id)?;
        if revision(source)? != review["sourceRevision"] {
            return Err("La copia cambió durante su vista previa; vuelve a revisar".into());
        }
        let text = source["text"]
            .as_str()
            .unwrap_or("")
            .chars()
            .take(4000)
            .collect::<String>();
        Ok(
            json!({"source":review["source"].clone(),"previewText":text,"metadata":{},"originReview":review}),
        )
    }
    pub(super) fn refresh_context_source(
        &self,
        project: &str,
        id: &str,
        body: Value,
    ) -> Result<Value, String> {
        #[derive(Deserialize)]
        #[serde(rename_all = "camelCase", deny_unknown_fields)]
        struct Expected {
            source_revision: String,
            file_revision: String,
            location_revision: String,
            attempt_id: String,
        }
        let expected: Expected = serde_json::from_value(body)
            .map_err(|_| "Falta la revisión de copia y archivo antes de actualizar el contexto")?;
        if !attempt_id(&expected.attempt_id)
            || [
                &expected.source_revision,
                &expected.file_revision,
                &expected.location_revision,
            ]
            .iter()
            .any(|v| !digest(v))
        {
            return Err("Prueba de actualización inválida".into());
        }
        let reviewed = self.review_context_source(project, id)?;
        if reviewed["canRefresh"] != true
            || reviewed["sourceRevision"] != expected.source_revision
            || reviewed["fileRevision"] != expected.file_revision
            || reviewed["locationRevision"] != expected.location_revision
        {
            return Err("La copia o el archivo cambió desde la revisión. Actualiza la consulta antes de otra decisión".into());
        }
        let store = self.context_checked(project)?;
        let original = stored_source(&store, id)?.clone();
        if receipt(&original)?.is_some_and(|receipt| receipt.attempt_id == expected.attempt_id) {
            return Err(
                "El intento ya está conservado; consulta la copia sin repetir su actualización"
                    .into(),
            );
        }
        if revision(&original)? != expected.source_revision {
            return Err("La copia cambió antes de preparar la actualización".into());
        }
        let kind = original["kind"]
            .as_str()
            .filter(|kind| {
                matches!(
                    *kind,
                    "project_document" | "handwritten_note" | "external_file" | "image"
                )
            })
            .ok_or("Tipo de fuente no compatible; se conserva")?;
        let replacement = build_source(self, project, id, kind, &knownext_core::now_iso());
        if replacement["status"] == "error"
            || (kind != "image"
                && replacement["text"]
                    .as_str()
                    .is_none_or(|text| text.trim().is_empty()))
            || replacement["originProof"]["fileRevision"] != expected.file_revision
            || replacement["originProof"]["locationRevision"] != expected.location_revision
        {
            return Err("No se pudo preparar una copia del archivo revisado. El contexto anterior se conserva".into());
        }
        let current = self.capture_context_file(project, id)?;
        if current.file_revision != expected.file_revision
            || current.location_revision != expected.location_revision
        {
            return Err(
                "El archivo cambió durante la extracción; la copia anterior se conserva".into(),
            );
        }
        let mut store = self.context_checked(project)?;
        if revision(stored_source(&store, id)?)? != expected.source_revision {
            return Err("Otra operación cambió la copia; vuelve a revisar sin reemplazarla".into());
        }
        let source = store["sources"]
            .as_array_mut()
            .ok_or("Contexto no disponible")?
            .iter_mut()
            .find(|source| source["id"] == id)
            .ok_or("Fuente no disponible")?;
        let created = source["createdAt"].clone();
        let last_used = source["lastUsedAt"].clone();
        // Preserve unknown row extensions rather than erasing them on an explicit refresh.
        for (key, value) in replacement.as_object().ok_or("Copia no válida")? {
            source[key] = value.clone();
        }
        source["createdAt"] = created;
        source["lastUsedAt"] = last_used;
        source["lastRefresh"] = serde_json::to_value(RefreshReceipt {
            format: 1,
            attempt_id: expected.attempt_id,
            previous_source_revision: expected.source_revision,
            file_revision: expected.file_revision,
            location_revision: expected.location_revision,
        })
        .map_err(|e| e.to_string())?;
        if let Some(expired) = store["expiredSourceIds"].as_array_mut() {
            expired.retain(|value| value.as_str() != Some(id));
        }
        self.write_json(&self.context_sources_path(project), &store)?;
        self.review_context_source(project, id)
    }
}
pub(super) fn public(mut source: Value) -> Value {
    let origin = parse(&source)
        .map(|proof| proof.mode)
        .unwrap_or_else(|_| "unverified".into());
    let requires_review = origin == "unverified"
        || receipt(&source).is_err()
        || !matches!(
            source["status"].as_str(),
            Some("ready" | "warning" | "expiring")
        )
        || (source["kind"] != "image"
            && source["text"]
                .as_str()
                .is_none_or(|text| text.trim().is_empty()));
    source = provider_view(source);
    if let Some(object) = source.as_object_mut() {
        object.remove("text");
        object.remove("originProof");
        object.remove("lastRefresh");
        object.insert("sourceOrigin".into(), json!(origin));
        object.insert("requiresReview".into(), json!(requires_review));
    }
    source
}
pub(super) fn provider_view(mut source: Value) -> Value {
    const FIELDS: &[&str] = &[
        "id",
        "projectId",
        "kind",
        "name",
        "path",
        "mimeType",
        "sizeBytes",
        "status",
        "weight",
        "warning",
        "error",
        "createdAt",
        "updatedAt",
        "lastUsedAt",
        "expiresAt",
        "text",
        "documentId",
        "sourceOrigin",
    ];
    if let Some(object) = source.as_object_mut() {
        object.retain(|field, _| FIELDS.contains(&field.as_str()));
    }
    source
}
