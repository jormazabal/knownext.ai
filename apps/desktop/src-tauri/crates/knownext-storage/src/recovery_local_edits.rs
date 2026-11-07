//! Preserve an editor snapshot independently of the current private draft.
use super::*;
use std::{fs, time::Instant};

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Snapshot {
    document_id: String,
    markdown: Option<String>,
    content: Option<Value>,
    base_fingerprint: Option<Value>,
}

impl Snapshot {
    fn checked(body: Value) -> Result<Self, String> {
        let value: Self =
            serde_json::from_value(body).map_err(|_| "La edición no tiene un formato conocido")?;
        if value.document_id.len() > 1024 {
            return Err("La identidad de la edición supera el límite".into());
        }
        let (_, path) = document_ref(&value.document_id)?;
        match (&value.markdown, &value.content) {
            (Some(markdown), None)
                if is_markdown_path(Path::new(&path)) && markdown.len() <= 2 * 1024 * 1024 => {}
            (None, Some(content)) if is_handwritten_note_path(Path::new(&path)) => {
                document_validation::handwritten(content)?;
            }
            _ => {
                return Err(
                    "La edición no corresponde al tipo de documento o supera el límite".into(),
                )
            }
        }
        if let Some(base) = &value.base_fingerprint {
            if !base.is_null()
                && (!base["sha256"]
                    .as_str()
                    .is_some_and(|s| s.len() == 64 && s.bytes().all(|b| b.is_ascii_hexdigit()))
                    || base["size"].as_u64().is_none()
                    || serde_json::to_vec(base).map_err(|e| e.to_string())?.len() > 1024)
            {
                return Err("La base de la edición no es válida".into());
            }
        }
        Ok(value)
    }
    fn matches(&self, value: &Value) -> bool {
        value.as_object().is_some_and(|fields| {
            fields.keys().all(|key| {
                [
                    "schemaVersion",
                    "documentId",
                    "markdown",
                    "content",
                    "baseFingerprint",
                    "draftUpdatedAt",
                ]
                .contains(&key.as_str())
            })
        }) && value["schemaVersion"] == 1
            && value["documentId"] == self.document_id
            && value.get("markdown").and_then(Value::as_str) == self.markdown.as_deref()
            && value.get("content") == self.content.as_ref()
            && value.get("baseFingerprint").filter(|v| !v.is_null())
                == self.base_fingerprint.as_ref().filter(|v| !v.is_null())
    }
}

impl LocalApi {
    fn local_edit_proof(&self, key: &str, snapshot: &Snapshot) -> Result<Value, String> {
        let mut budget = 2 * (64 * 1024 * 1024 + 16 * 1024 + 1);
        let (bytes, manifest) = recovery_review::archive_bundle_budgeted(
            &self.app_data_dir.join("drafts-review"),
            key,
            &mut budget,
        )?;
        let value: Value = serde_json::from_slice(&bytes)
            .map_err(|_| "La copia de la edición no se puede leer")?;
        if !snapshot.matches(&value)
            || manifest["reason"] != "concurrent-draft-local"
            || manifest["operationId"] != format!("localedit-{key}")
            || manifest["sourceKey"]
                != format!("v2_{}", sha256_hex(snapshot.document_id.as_bytes()))
        {
            return Err("La copia no confirma esta edición. Se conserva sin sustituir.".into());
        }
        let (_, path) = document_ref(&snapshot.document_id)?;
        Ok(
            json!({"status":"verified","checkedAt":knownext_core::now_iso(),"copy":{
                "key":key,"source":"archive","fingerprint":sha256_hex(&bytes),"bytes":bytes.len(),
                "documentId":snapshot.document_id,"name":path.rsplit('/').next(),"path":path,"projectName":null,
                "kind":if snapshot.markdown.is_some(){"document"}else{"handwritten-note"},"state":"archived",
                "reason":"Edición abierta conservada porque el borrador guardado cambió. Recuperar como otro archivo mantiene ambas versiones.",
                "canCopy":true,"canArchive":false,"updatedAt":value["draftUpdatedAt"]
            }}),
        )
    }
    pub(crate) fn preserve_local_edit(
        &self,
        key: &str,
        body: Value,
        review_only: bool,
    ) -> Result<Value, String> {
        let snapshot = Snapshot::checked(body)?;
        if key.len() != 41
            || !key.starts_with("recovery-")
            || !key[9..].bytes().all(|b| b.is_ascii_hexdigit())
        {
            return Err("Identificador de conservación no válido".into());
        }
        let root = self.app_data_dir.join("drafts-review");
        let folder = recovery_review::archive_folder(&root, key)?;
        if folder
            .try_exists()
            .map_err(|_| "No se puede consultar la conservación")?
        {
            return self.local_edit_proof(key, &snapshot);
        }
        if review_only {
            return Ok(json!({"status":"absent","checkedAt":knownext_core::now_iso()}));
        }
        let mut copy = json!({"schemaVersion":1,"documentId":snapshot.document_id,"baseFingerprint":snapshot.base_fingerprint,"draftUpdatedAt":knownext_core::now_iso()});
        if let Some(markdown) = &snapshot.markdown {
            copy["markdown"] = json!(markdown);
        }
        if let Some(content) = &snapshot.content {
            copy["content"] = content.clone();
        }
        let bytes = serde_json::to_vec_pretty(&copy).map_err(|e| e.to_string())?;
        if bytes.len() > 64 * 1024 * 1024 {
            return Err("La edición supera el límite de conservación".into());
        }
        // Never prune an older copy to make room. Include incomplete/unknown entries.
        let start = Instant::now();
        let mut entries = 0usize;
        let mut total = bytes.len() as u64;
        match fs::read_dir(&root) {
            Ok(items) => {
                for entry in items {
                    entries += 1;
                    if entries >= 1000 || start.elapsed() > Duration::from_secs(2) {
                        return Err("El archivo de recuperación requiere revisión antes de conservar más ediciones".into());
                    }
                    let entry =
                        entry.map_err(|_| "No se puede revisar el archivo de recuperación")?;
                    let meta = fs::symlink_metadata(entry.path())
                        .map_err(|_| "No se puede revisar una copia")?;
                    if !meta.is_dir() || batch::linked(&meta) {
                        return Err("Hay una entrada de recuperación no compatible; se conserva sin cambios".into());
                    }
                    for child in
                        fs::read_dir(entry.path()).map_err(|_| "No se puede revisar una copia")?
                    {
                        let child = child.map_err(|_| "No se puede revisar una copia")?;
                        let meta = fs::symlink_metadata(child.path())
                            .map_err(|_| "No se puede medir una copia")?;
                        if !meta.is_file() || batch::linked(&meta) {
                            return Err("Hay una copia de recuperación no compatible".into());
                        }
                        total = total.saturating_add(meta.len());
                        if total > 128 * 1024 * 1024 || start.elapsed() > Duration::from_secs(2) {
                            return Err("El archivo de recuperación supera el presupuesto de conservación; las copias existentes se mantienen".into());
                        }
                    }
                }
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(_) => return Err("No se puede revisar el archivo de recuperación".into()),
        }
        fs::create_dir_all(&root).map_err(|_| "No se puede preparar el archivo de recuperación")?;
        fs::create_dir(&folder)
            .map_err(|_| "El identificador de conservación ya existe o no se puede reservar")?;
        write_new_file(&folder.join("copy.json"), &bytes)?;
        let manifest = json!({"schemaVersion":1,"id":key,"sourceKey":format!("v2_{}",sha256_hex(snapshot.document_id.as_bytes())),"fingerprint":sha256_hex(&bytes),"bytes":bytes.len(),"archivedAt":knownext_core::now_iso(),"retention":"manual-no-auto-expiry","operationId":format!("localedit-{key}"),"reason":"concurrent-draft-local"});
        write_new_file(
            &folder.join("manifest.json"),
            &serde_json::to_vec_pretty(&manifest).map_err(|e| e.to_string())?,
        )?;
        self.local_edit_proof(key, &snapshot)
    }
}

fn write_new_file(path: &Path, bytes: &[u8]) -> Result<(), String> {
    use std::io::Write;
    let mut file = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)
        .map_err(|_| "No se puede crear la copia; cualquier parte existente se conserva")?;
    file.write_all(bytes)
        .and_then(|_| file.sync_all())
        .map_err(|_| {
            "No se confirmó la escritura de la copia; consulta el intento sin repetirlo".into()
        })
}
