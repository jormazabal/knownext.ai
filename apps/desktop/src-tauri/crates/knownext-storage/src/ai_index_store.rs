//! Private, bounded index storage. Invalid or unknown data is preserved.
use super::*;
use std::{fs, io::Read};

const MAX_BYTES: u64 = 64 * 1024 * 1024;
const MAX_ITEMS: usize = 100_000;

pub(super) struct StoredIndex {
    pub value: Value,
    pub revision: String,
    pub bytes: u64,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct CleanupRequest {
    revision: String,
}

fn regular_directory(path: &Path) -> Result<(), String> {
    let meta =
        fs::symlink_metadata(path).map_err(|_| "No se puede consultar la carpeta del índice")?;
    if !meta.is_dir() || batch::linked(&meta) {
        return Err("La carpeta del índice debe ser regular, sin enlaces; se conserva".into());
    }
    Ok(())
}

fn fields(value: &Value, allowed: &[&str]) -> Result<(), String> {
    let object = value
        .as_object()
        .ok_or("Índice no compatible; se conserva")?;
    if object.keys().any(|key| !allowed.contains(&key.as_str())) {
        return Err(
            "El índice contiene extensiones no compatibles; se conserva sin cambios".into(),
        );
    }
    Ok(())
}

fn text<'a>(value: &'a Value, key: &str) -> Result<&'a str, String> {
    value[key]
        .as_str()
        .filter(|v| !v.contains('\0'))
        .ok_or_else(|| "Índice incompleto o no compatible; se conserva".into())
}

fn relative(path: &str) -> bool {
    !path.is_empty()
        && !path.contains(['\\', ':'])
        && !Path::new(path).is_absolute()
        && !path
            .split('/')
            .any(|part| part.is_empty() || matches!(part, "." | ".."))
}

fn dated(value: &Value, key: &str) -> Result<(), String> {
    OffsetDateTime::parse(text(value, key)?, &Rfc3339)
        .map_err(|_| "Fecha de índice no compatible; se conserva")?;
    Ok(())
}

fn items<'a>(value: &'a Value, key: &str) -> Result<&'a Vec<Value>, String> {
    value[key]
        .as_array()
        .filter(|a| a.len() <= MAX_ITEMS)
        .ok_or_else(|| "Colección de índice no compatible o fuera de límites; se conserva".into())
}

fn validate(id: &str, value: &Value) -> Result<(), String> {
    fields(
        value,
        &[
            "schemaVersion",
            "projectId",
            "vectorStoreId",
            "indexedAt",
            "documents",
            "chunks",
            "failedDocuments",
        ],
    )?;
    if value
        .get("schemaVersion")
        .is_some_and(|version| version.as_u64() != Some(1))
    {
        return Err("Versión de índice no compatible; se conserva".into());
    }
    if text(value, "projectId")? != id || text(value, "vectorStoreId")? != format!("local-rag:{id}")
    {
        return Err("El índice pertenece a otra identidad o formato; se conserva".into());
    }
    dated(value, "indexedAt")?;
    let mut documents = BTreeMap::new();
    for doc in items(value, "documents")? {
        fields(
            doc,
            &[
                "id",
                "path",
                "name",
                "mimeType",
                "sizeBytes",
                "chunkCount",
                "indexedAt",
                "status",
            ],
        )?;
        let path = text(doc, "path")?;
        let document_id = text(doc, "id")?;
        if !relative(path)
            || document_id != doc_id(id, path)
            || documents.insert(document_id, path).is_some()
            || doc["sizeBytes"].as_u64().is_none()
            || doc["chunkCount"].as_u64().is_none()
            || doc["status"] != "indexed"
        {
            return Err("Documento de índice inconsistente; se conserva".into());
        }
        text(doc, "name")?;
        text(doc, "mimeType")?;
        dated(doc, "indexedAt")?;
    }
    let mut chunk_ids = BTreeSet::new();
    for chunk in items(value, "chunks")? {
        fields(
            chunk,
            &[
                "id",
                "documentId",
                "path",
                "name",
                "chunkIndex",
                "text",
                "indexedAt",
                "originProof",
            ],
        )?;
        let document_id = text(chunk, "documentId")?;
        let path = text(chunk, "path")?;
        let chunk_id = text(chunk, "id")?;
        let index = chunk["chunkIndex"]
            .as_u64()
            .ok_or("Fragmento de índice inconsistente; se conserva")?;
        if documents.get(document_id).copied() != Some(path)
            || index >= MAX_ITEMS as u64
            || chunk_id != format!("{document_id}#chunk-{}", index + 1)
            || !chunk_ids.insert(chunk_id)
        {
            return Err("Fragmento de índice inconsistente; se conserva".into());
        }
        text(chunk, "name")?;
        text(chunk, "text")?;
        if chunk.get("originProof").is_some(){ai_context_origin::validate_proof(chunk)?;}
        dated(chunk, "indexedAt")?;
    }
    for failed in items(value, "failedDocuments")? {
        fields(failed, &["id", "path", "name", "error"])?;
        let path = text(failed, "path")?;
        if !relative(path) || text(failed, "id")? != doc_id(id, path) {
            return Err("Documento fallido de índice inconsistente; se conserva".into());
        }
        text(failed, "name")?;
        text(failed, "error")?;
    }
    Ok(())
}

impl LocalApi {
    pub(super) fn require_ai_index_project(&self, id: &str) -> Result<(), String> {
        self.project_root(id).map(|_| ())
    }

    pub(super) fn ai_index_path(&self, id: &str) -> Result<PathBuf, String> {
        self.require_ai_index_project(id)?;
        regular_directory(&self.app_data_dir)?;
        let directory = self.app_data_dir.join("ai-index");
        match fs::symlink_metadata(&directory) {
            Ok(_) => regular_directory(&directory)?,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => (),
            Err(_) => return Err("No se puede consultar el directorio de índices".into()),
        }
        let path = directory.join(format!("{id}.json"));
        match fs::symlink_metadata(&path) {
            Ok(meta) if !meta.is_file() || batch::linked(&meta) => {
                return Err("El índice no es un archivo regular; se conserva".into())
            }
            Ok(_) => (),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => (),
            Err(_) => return Err("No se puede consultar el índice local".into()),
        }
        Ok(path)
    }

    pub(super) fn read_ai_index(&self, id: &str) -> Result<Option<StoredIndex>, String> {
        let path = self.ai_index_path(id)?;
        let meta = match fs::symlink_metadata(&path) {
            Ok(meta) => meta,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
            Err(_) => return Err("No se puede leer el índice local; se conserva".into()),
        };
        if !meta.is_file() || batch::linked(&meta) || meta.len() > MAX_BYTES {
            return Err("El índice no es regular o supera 64 MiB; se conserva".into());
        }
        let mut bytes = Vec::new();
        fs::File::open(&path)
            .map_err(|_| "No se puede leer el índice local")?
            .take(MAX_BYTES + 1)
            .read_to_end(&mut bytes)
            .map_err(|_| "No se pudo completar la lectura del índice")?;
        if bytes.len() as u64 > MAX_BYTES {
            return Err("El índice supera 64 MiB; se conserva".into());
        }
        let value: Value = serde_json::from_slice(&bytes)
            .map_err(|_| "Índice dañado o no compatible; se conserva sin cambios")?;
        validate(id, &value)?;
        Ok(Some(StoredIndex {
            value,
            revision: format!("{:x}", Sha256::digest(&bytes)),
            bytes: bytes.len() as u64,
        }))
    }

    pub(super) fn write_ai_index(&self, id: &str, value: &Value) -> Result<(String, u64), String> {
        validate(id, value)?;
        self.read_ai_index(id)?; // Never replace unknown or damaged cache as if it were empty.
        let bytes = serde_json::to_vec_pretty(value).map_err(|e| e.to_string())?;
        if bytes.len() as u64 > MAX_BYTES {
            return Err("El índice supera 64 MiB; se conserva el índice anterior".into());
        }
        let path = self.ai_index_path(id)?;
        let directory = path.parent().unwrap();
        if !directory.exists() {
            fs::create_dir(directory).map_err(|e| e.to_string())?;
        }
        regular_directory(directory)?;
        atomic_io::write(&path, &bytes)
            .map_err(|e| format!("No se pudo conservar el índice local: {e}"))?;
        Ok((format!("{:x}", Sha256::digest(&bytes)), bytes.len() as u64))
    }

    pub(super) fn delete_ai_index(&self, id: &str, body: Value) -> Result<Value, String> {
        // Resolve identity before interpreting an optional legacy caller's payload.
        let path = self.ai_index_path(id)?;
        let request: CleanupRequest = serde_json::from_value(body)
            .map_err(|_| "Actualiza la revisión del índice antes de limpiarlo")?;
        if request.revision.len() != 64 || !request.revision.bytes().all(|c| c.is_ascii_hexdigit())
        {
            return Err("Revisión de índice no válida".into());
        }
        let mut config = self.read_config_checked()?;
        if let Some(stored) = self.read_ai_index(id)? {
            if stored.revision != request.revision {
                return Err(
                    "El índice ha cambiado. Actualiza su revisión antes de limpiarlo".into(),
                );
            }
            if fs::metadata(&path)
                .map_err(|e| e.to_string())?
                .permissions()
                .readonly()
            {
                return Err("El índice es de solo lectura; se conserva".into());
            }
            fs::remove_file(&path)
                .map_err(|e| format!("No se pudo retirar el índice local: {e}"))?;
        }
        if config["ai"]["rag"]["vectorStoreId"].as_str() == Some(&format!("local-rag:{id}")) {
            merge(
                &mut config["ai"]["rag"],
                &json!({"vectorStoreId":null,"lastIndexedAt":null,"status":"not-indexed","error":null}),
            );
            normalize_config(&mut config);
            config["updatedAt"] = json!(knownext_core::now_iso());
            self.write_json(&self.config_path(), &config).map_err(|_| "El índice local ya se ha retirado, pero no se pudieron actualizar las preferencias. Consulta el estado antes de reintentar".to_string())?;
        }
        self.ai_index_status(id)
    }
}

#[cfg(test)]
mod tests {
    use super::super::*;
    use super::{StoredIndex, MAX_BYTES};
    use std::fs;

    fn fixture() -> (tempfile::TempDir, LocalApi, String) {
        let root = tempfile::tempdir().unwrap();
        let id = "project-a".to_string();
        let source = root.path().join("projects").join(&id);
        fs::create_dir_all(&source).unwrap();
        fs::write(source.join("original.md"), b"original source").unwrap();
        fs::write(root.path().join("projects.json"), json!({"schemaVersion":2,"activeProjectId":id,"projects":[{"id":id,"name":"QA index","folderPath":source.to_string_lossy()}]}).to_string()).unwrap();
        let api = LocalApi::new(root.path().into(), "qa".into(), "test".into());
        api.update_config(json!({"ai":{"rag":{"enabled":false,"vectorStoreId":format!("local-rag:{id}"),"lastIndexedAt":knownext_core::now_iso(),"status":"updated"}}})).unwrap();
        (root, api, id)
    }

    fn legacy(id: &str) -> Value {
        json!({"projectId":id,"vectorStoreId":format!("local-rag:{id}"),"indexedAt":"2026-10-31T20:00:00Z","documents":[],"chunks":[],"failedDocuments":[]})
    }

    fn index(api: &LocalApi, id: &str) -> StoredIndex {
        api.read_ai_index(id).unwrap().unwrap()
    }

    #[test]
    fn legacy_bytes_are_read_without_rewrite_and_cleanup_requires_their_revision() {
        let (root, api, id) = fixture();
        fs::create_dir(root.path().join("ai-index")).unwrap();
        let path = root.path().join("ai-index").join(format!("{id}.json"));
        let original = legacy(&id).to_string().into_bytes();
        fs::write(&path, &original).unwrap();
        let stored = index(&api, &id);
        assert_eq!(stored.bytes, original.len() as u64);
        assert_eq!(
            api.ai_index_status(&id).unwrap()["indexRevision"],
            stored.revision
        );
        assert_eq!(fs::read(&path).unwrap(), original);
        assert!(api.delete_ai_index(&id, Value::Null).is_err());
        assert!(path.exists());
        let receipt = api
            .delete_ai_index(&id, json!({"revision":stored.revision}))
            .unwrap();
        assert_eq!(receipt["status"], "not-indexed");
        assert_eq!(receipt["enabled"], false);
        assert_eq!(receipt["indexRevision"], Value::Null);
        assert!(!path.exists());
        assert_eq!(
            fs::read(root.path().join("projects").join(&id).join("original.md")).unwrap(),
            b"original source"
        );
    }

    #[test]
    fn obsolete_revision_never_removes_a_new_generation_and_absent_retry_is_idempotent() {
        let (_root, api, id) = fixture();
        let (old_revision, _) = api.write_ai_index(&id, &legacy(&id)).unwrap();
        let mut newer = legacy(&id);
        newer["indexedAt"] = json!("2026-10-31T21:00:00Z");
        let (new_revision, _) = api.write_ai_index(&id, &newer).unwrap();
        assert!(api
            .delete_ai_index(&id, json!({"revision":old_revision}))
            .is_err());
        assert_eq!(index(&api, &id).revision, new_revision);
        api.delete_ai_index(&id, json!({"revision":new_revision}))
            .unwrap();
        assert_eq!(
            api.delete_ai_index(&id, json!({"revision":new_revision}))
                .unwrap()["status"],
            "not-indexed"
        );
    }

    #[test]
    fn unknown_corrupt_or_wrong_owner_indexes_are_preserved_and_reported_as_unreadable() {
        let (root, api, id) = fixture();
        fs::create_dir(root.path().join("ai-index")).unwrap();
        let path = api.ai_index_path(&id).unwrap();
        let mut future = legacy(&id);
        future["schemaVersion"] = json!(99);
        let mut extra = legacy(&id);
        extra["futurePrivateField"] = json!("retain");
        let mut wrong_owner = legacy(&id);
        wrong_owner["projectId"] = json!("project-other");
        for bytes in [
            b"damaged index".to_vec(),
            future.to_string().into_bytes(),
            extra.to_string().into_bytes(),
            wrong_owner.to_string().into_bytes(),
        ] {
            fs::write(&path, &bytes).unwrap();
            assert!(api.read_ai_index(&id).is_err());
            assert!(api.write_ai_index(&id, &legacy(&id)).is_err());
            assert!(api
                .delete_ai_index(&id, json!({"revision":"a".repeat(64)}))
                .is_err());
            assert!(api.rebuild_ai_index(&id).is_err());
            let status = api.ai_index_status(&id).unwrap();
            assert_eq!(status["status"], "error");
            assert_eq!(status["indexReadable"], false);
            assert_eq!(status["indexSizeBytes"], Value::Null);
            assert_eq!(fs::read(&path).unwrap(), bytes);
        }
    }

    #[test]
    fn oversized_and_non_file_indexes_are_not_loaded_replaced_or_removed() {
        let (root, api, id) = fixture();
        fs::create_dir(root.path().join("ai-index")).unwrap();
        let path = api.ai_index_path(&id).unwrap();
        fs::File::create(&path)
            .unwrap()
            .set_len(MAX_BYTES + 1)
            .unwrap();
        assert!(api.read_ai_index(&id).is_err());
        assert!(api
            .delete_ai_index(&id, json!({"revision":"a".repeat(64)}))
            .is_err());
        assert_eq!(fs::metadata(&path).unwrap().len(), MAX_BYTES + 1);
        fs::remove_file(&path).unwrap();
        fs::create_dir(&path).unwrap();
        fs::write(path.join("retained"), b"retain").unwrap();
        assert!(api.read_ai_index(&id).is_err());
        assert!(api.write_ai_index(&id, &legacy(&id)).is_err());
        assert!(api
            .delete_ai_index(&id, json!({"revision":"a".repeat(64)}))
            .is_err());
        assert_eq!(fs::read(path.join("retained")).unwrap(), b"retain");
    }

    #[test]
    fn permission_failures_are_not_false_success_and_partial_preference_failure_is_explicit() {
        let (_root, api, id) = fixture();
        let (revision, _) = api.write_ai_index(&id, &legacy(&id)).unwrap();
        let path = api.ai_index_path(&id).unwrap();
        let original_permissions = fs::metadata(&path).unwrap().permissions();
        let mut readonly = original_permissions.clone();
        readonly.set_readonly(true);
        fs::set_permissions(&path, readonly).unwrap();
        let config_before = fs::read(api.config_path()).unwrap();
        assert!(api
            .delete_ai_index(&id, json!({"revision":revision}))
            .is_err());
        assert!(path.exists());
        assert_eq!(fs::read(api.config_path()).unwrap(), config_before);
        fs::set_permissions(&path, original_permissions).unwrap();
        let config_permissions = fs::metadata(api.config_path()).unwrap().permissions();
        let mut readonly = config_permissions.clone();
        readonly.set_readonly(true);
        fs::set_permissions(api.config_path(), readonly).unwrap();
        let error = api
            .delete_ai_index(&id, json!({"revision":revision}))
            .unwrap_err();
        fs::set_permissions(api.config_path(), config_permissions).unwrap();
        assert!(error.contains("ya se ha retirado"));
        assert!(!path.exists());
        assert_eq!(fs::read(api.config_path()).unwrap(), config_before);
        assert_eq!(
            api.delete_ai_index(&id, json!({"revision":revision}))
                .unwrap()["enabled"],
            false
        );
    }

    #[test]
    fn cleaning_one_project_does_not_reset_another_project_preferences() {
        let (_root, api, id) = fixture();
        let (revision, _) = api.write_ai_index(&id, &legacy(&id)).unwrap();
        api.update_config(json!({"ai":{"rag":{"vectorStoreId":"local-rag:project-other","lastIndexedAt":"2026-10-31T21:00:00Z","status":"error","error":"belongs to another project","enabled":false}}})).unwrap();
        let before = fs::read(api.config_path()).unwrap();
        let present = api.ai_index_status(&id).unwrap();
        assert_eq!(present["status"], "updated");
        assert_eq!(present["error"], Value::Null);
        assert!(present["checkedAt"].as_str().unwrap().starts_with("20"));
        let receipt = api
            .delete_ai_index(&id, json!({"revision":revision}))
            .unwrap();
        assert_eq!(receipt["status"], "not-indexed");
        assert_eq!(receipt["vectorStoreId"], Value::Null);
        assert_eq!(fs::read(api.config_path()).unwrap(), before);
    }

    #[test]
    fn rebuild_reports_a_partial_preference_failure_without_losing_its_new_index_or_enabling_rag() {
        let (root, api, id) = fixture();
        api.update_config(json!({"ai":{"rag":{"vectorStoreId":null,"lastIndexedAt":null,"status":"not-indexed"}}})).unwrap();
        let before = fs::read(api.config_path()).unwrap();
        let permissions = fs::metadata(api.config_path()).unwrap().permissions();
        let mut readonly = permissions.clone();
        readonly.set_readonly(true);
        fs::set_permissions(api.config_path(), readonly).unwrap();
        let result = api.rebuild_ai_index(&id);
        fs::set_permissions(api.config_path(), permissions).unwrap();
        assert!(result.unwrap_err().contains("se ha reconstruido"));
        let stored = index(&api, &id);
        assert_eq!(stored.value["documents"].as_array().unwrap().len(), 1);
        assert_eq!(api.ai_index_status(&id).unwrap()["enabled"], false);
        assert_eq!(api.ai_index_status(&id).unwrap()["status"], "updated");
        assert_eq!(fs::read(api.config_path()).unwrap(), before);
        assert_eq!(
            fs::read(root.path().join("projects").join(&id).join("original.md")).unwrap(),
            b"original source"
        );
    }

    #[cfg(windows)]
    #[test]
    fn a_junction_cannot_redirect_index_read_write_or_cleanup() {
        let (root, api, id) = fixture();
        let target = tempfile::tempdir().unwrap();
        let original = target.path().join(format!("{id}.json"));
        fs::write(&original, b"independent source").unwrap();
        let junction = root.path().join("ai-index");
        let output = Command::new("cmd")
            .args(["/C", "mklink", "/J"])
            .arg(&junction)
            .arg(target.path())
            .output()
            .unwrap();
        assert!(output.status.success());
        let read = api.read_ai_index(&id);
        let write = api.write_ai_index(&id, &legacy(&id));
        let clear = api.delete_ai_index(&id, json!({"revision":"a".repeat(64)}));
        fs::remove_dir(&junction).unwrap();
        assert!(read.is_err() && write.is_err() && clear.is_err());
        assert_eq!(fs::read(&original).unwrap(), b"independent source");
    }

    #[test]
    fn malformed_or_unregistered_index_identity_never_removes_a_sibling_file() {
        let root = tempfile::tempdir().unwrap();
        fs::create_dir(root.path().join("ai-index")).unwrap();
        let sentinel = root.path().join("owned-sentinel.json");
        fs::write(&sentinel, b"owned recovery copy").unwrap();
        let api = LocalApi::new(root.path().into(), "qa".into(), "test".into());
        for id in ["..%2Fowned-sentinel", "unknown-project"] {
            let result = api.handle(
                "DELETE",
                &format!("/api/projects/{id}/ai/index"),
                json!({"revision":"a".repeat(64)}),
                vec![],
            );
            assert_eq!(
                fs::read(&sentinel).ok().as_deref(),
                Some(b"owned recovery copy".as_slice()),
                "index deletion escaped its directory"
            );
            assert!(
                result.is_err() || result.unwrap().status >= 400,
                "unregistered identity was acknowledged"
            );
        }
    }
}
