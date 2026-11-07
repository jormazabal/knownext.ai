//! Permanent local payload retirement, only after an exact external backup is chosen again.
//! Receipt/manifests/identity remain. Reading never continues an interrupted deletion.
use super::*;
use std::io::{Cursor, Write};
const ZIP_LIMIT: u64 = 40 * 1024 * 1024;
const DATA_LIMIT: u64 = 32 * 1024 * 1024;
#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Representation {
    name: String,
    bytes: u64,
    sha256: String,
}
#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Copy {
    key: String,
    manifest_sha256: String,
    representations: Vec<Representation>,
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Journal {
    format: u8,
    receipt_sha256: String,
    archive_sha256: String,
    archive_bytes: u64,
    created_at: String,
    copies: Vec<Copy>,
}
struct Snapshot {
    journal: Journal,
    journal_hash: Option<String>,
    remaining: Vec<(PathBuf, Representation)>,
    revision: String,
    archive: Option<Vec<u8>>,
    generation: retention_generation::Token,
}
fn bounded(path: &Path, limit: u64) -> Result<Vec<u8>, String> {
    let m =
        fs::symlink_metadata(path).map_err(|_| "No se puede comprobar un archivo conservado")?;
    if !m.is_file() || batch::linked(&m) || m.len() > limit {
        return Err("Archivo no regular o fuera de límites; se conserva".into());
    }
    let mut raw = vec![];
    fs::File::open(path)
        .map_err(|_| "No se puede abrir un archivo conservado")?
        .take(limit + 1)
        .read_to_end(&mut raw)
        .map_err(|_| "No se pudo comprobar el archivo completo")?;
    if raw.len() as u64 > limit {
        return Err("El archivo creció durante la revisión".into());
    }
    Ok(raw)
}
fn journal_path(api: &LocalApi, id: &str) -> Result<PathBuf, String> {
    identity(id)?;
    directory(&api.app_data_dir)?;
    let root = api.app_data_dir.join("conflict-retirements");
    directory(&root)?;
    Ok(root.join(format!("{id}.json")))
}
pub(super) fn present(api: &LocalApi, id: &str) -> Result<bool, String> {
    match fs::symlink_metadata(journal_path(api, id)?) {
        Ok(_) => Ok(true),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(_) => Err("No se puede comprobar la retirada; se conserva".into()),
    }
}
fn representation(path: &Path, name: &str) -> Result<Option<Representation>, String> {
    match fs::symlink_metadata(path) {
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Ok(_) => {
            let bytes = bounded(path, 64 * 1024 * 1024)?;
            Ok(Some(Representation {
                name: name.into(),
                bytes: bytes.len() as u64,
                sha256: sha256_hex(&bytes),
            }))
        }
        Err(_) => Err("No se puede comprobar una representación; se conserva".into()),
    }
}
fn metadata(api: &LocalApi, id: &str, j: &Journal) -> Result<(), String> {
    let raw = bounded(&path(api, id)?, MAX_RECORD)?;
    if sha256_hex(&raw) != j.receipt_sha256 {
        return Err("El recibo cambió; se conserva lo restante sin continuar".into());
    }
    for copy in &j.copies {
        let folder =
            recovery_review::archive_folder(&api.app_data_dir.join("drafts-review"), &copy.key)?;
        if sha256_hex(&bounded(&folder.join("manifest.json"), MAX_RECORD)?) != copy.manifest_sha256
        {
            return Err("Un manifiesto cambió; se conserva lo restante".into());
        }
    }
    Ok(())
}
fn pack(files: &[(String, Vec<u8>)]) -> Result<Vec<u8>, String> {
    let metadata = json!({"format":"knownext.conflict-backup","schemaVersion":1,"dataOnly":true,"containsLocalMetadata":true,"canReplay":false,"files":files.iter().map(|(path,raw)|json!({"path":path,"bytes":raw.len(),"sha256":sha256_hex(raw)})).collect::<Vec<_>>()});
    let metadata =
        serde_json::to_vec_pretty(&metadata).map_err(|_| "No se pudo preparar el respaldo")?;
    let mut writer = zip::ZipWriter::new(Cursor::new(Vec::new()));
    let options = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Stored)
        .last_modified_time(
            zip::DateTime::from_date_and_time(1980, 1, 1, 0, 0, 0)
                .map_err(|_| "Fecha ZIP no compatible")?,
        )
        .unix_permissions(0o644);
    writer
        .start_file("knownext-conflict-backup.json", options)
        .map_err(|_| "No se pudo preparar el manifiesto")?;
    writer
        .write_all(&metadata)
        .map_err(|_| "No se pudo conservar el manifiesto")?;
    for (name, bytes) in files {
        writer
            .start_file(name, options)
            .map_err(|_| "No se pudo reservar una copia")?;
        writer
            .write_all(bytes)
            .map_err(|_| "No se pudo incluir una copia completa")?;
    }
    let raw = writer
        .finish()
        .map_err(|_| "No se pudo completar el respaldo")?
        .into_inner();
    if raw.len() as u64 > ZIP_LIMIT {
        return Err("El respaldo supera40MiB; se conservan los originales".into());
    }
    Ok(raw)
}
fn snapshot(api: &LocalApi, id: &str) -> Result<Snapshot, String> {
    let record = read(api, id)?.ok_or("No se encontró el recibo")?;
    if record.phase != "completed" || record.archived_at.is_none() {
        return Err("Archiva primero el recibo completado para gestionar la retirada".into());
    }
    let generation = retention_generation::read(api, &format!("conflict/{id}"))?;
    let saved = if present(api, id)? {
        Some(bounded(&journal_path(api, id)?, MAX_RECORD)?)
    } else {
        None
    };
    let mut archive = None;
    let journal: Journal = if let Some(raw) = &saved {
        serde_json::from_slice(raw)
            .map_err(|_| "Registro de retirada desconocido; se conserva sin continuar")?
    } else {
        let verified = retention::snapshot(api, id)?;
        let (_, documents) = portable::build(api, id)?;
        let mut files = vec![("Documentos.zip".into(), documents)];
        let mut total = files[0].1.len() as u64;
        let mut copies = vec![];
        for (index, copy) in verified.copies.iter().enumerate() {
            let manifest = bounded(&copy.folder.join("manifest.json"), MAX_RECORD)?;
            if sha256_hex(&manifest) != copy.manifest_hash {
                return Err("Una copia cambió durante el respaldo".into());
            }
            total = total
                .checked_add(copy.raw.len() as u64 + manifest.len() as u64)
                .ok_or("Respaldo fuera de límites")?;
            if total > DATA_LIMIT {
                return Err("Las copias completas superan32MiB; no se retiran ni se entrega un conjunto parcial".into());
            }
            files.push((format!("Copias/{index}/Contenido.json"), copy.raw.clone()));
            files.push((format!("Copias/{index}/Registro.json"), manifest));
            let mut representations = vec![];
            for name in ["copy.json", "copy.json.zip"] {
                if let Some(rep) = representation(&copy.folder.join(name), name)? {
                    representations.push(rep)
                }
            }
            copies.push(Copy {
                key: copy.key.clone(),
                manifest_sha256: copy.manifest_hash.clone(),
                representations,
            });
        }
        let bytes = pack(&files)?;
        let journal = Journal {
            format: 1,
            receipt_sha256: record.revision.clone().ok_or("Recibo sin revisión")?,
            archive_sha256: sha256_hex(&bytes),
            archive_bytes: bytes.len() as u64,
            created_at: knownext_core::now_iso(),
            copies,
        };
        archive = Some(bytes);
        journal
    };
    if journal.format != 1
        || !hash(&journal.receipt_sha256)
        || !hash(&journal.archive_sha256)
        || journal.archive_bytes == 0
        || journal.archive_bytes > ZIP_LIMIT
        || OffsetDateTime::parse(&journal.created_at, &Rfc3339).is_err()
        || journal.copies.len() != record.copies.len()
        || journal.copies.is_empty()
        || journal.copies.len() > 4
    {
        return Err("Registro de retirada no compatible; se conserva".into());
    }
    metadata(api, id, &journal)?;
    let mut remaining = vec![];
    let mut state = String::new();
    let mut budget = 256 * 1024 * 1024u64;
    for (copy, proof) in journal.copies.iter().zip(&record.copies) {
        if copy.key != proof.key
            || copy.manifest_sha256 != proof.manifest_hash
            || copy.representations.is_empty()
            || copy.representations.len() > 2
        {
            return Err("El registro no identifica estas copias; se conserva".into());
        }
        let folder =
            recovery_review::archive_folder(&api.app_data_dir.join("drafts-review"), &copy.key)?;
        let mut names = BTreeSet::new();
        for r in &copy.representations {
            if !matches!(r.name.as_str(), "copy.json" | "copy.json.zip")
                || !names.insert(&r.name)
                || r.bytes > 64 * 1024 * 1024
                || !hash(&r.sha256)
            {
                return Err("Representación de retirada no compatible".into());
            }
        }
        let mut count = 0;
        for entry in
            fs::read_dir(&folder).map_err(|_| "No se puede comprobar la carpeta de una copia")?
        {
            count += 1;
            if count > 3 {
                return Err("Entradas adicionales; se conserva sin retirar".into());
            }
            let e = entry.map_err(|_| "No se puede comprobar una entrada")?;
            let name = e.file_name();
            if name != "manifest.json" && !names.iter().any(|n| name == n.as_str()) {
                return Err("Una entrada no pertenece a la retirada revisada; se conserva".into());
            }
        }
        for r in &copy.representations {
            let path = folder.join(&r.name);
            match fs::symlink_metadata(&path) {
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                    if saved.is_none() {
                        return Err("Una copia desapareció durante la revisión".into());
                    }
                    state.push_str("/missing");
                }
                Ok(m) => {
                    if m.len() > budget {
                        return Err(
                            "La revisión supera su presupuesto de lectura; se conserva".into()
                        );
                    }
                    budget = budget.saturating_sub(m.len());
                    let bytes = bounded(&path, 64 * 1024 * 1024)?;
                    if bytes.len() as u64 != r.bytes || sha256_hex(&bytes) != r.sha256 {
                        return Err("Una copia cambió; se conserva sin retirar".into());
                    }
                    state.push_str(&format!("/{}/{}/{}", copy.key, r.name, r.sha256));
                    remaining.push((path, r.clone()));
                }
                Err(_) => {
                    return Err("No se puede comprobar una representación; se conserva".into())
                }
            }
        }
    }
    metadata(api, id, &journal)?;
    // Unsaved review timestamps must not make the same source cohort unstable.
    let revision = sha256_hex(
        format!(
            "conflict-payloads-v1/{id}/{}/{}/{}/{}/{}/{state}",
            journal.receipt_sha256,
            journal.archive_sha256,
            generation.revision,
            saved.as_ref().map(|b| sha256_hex(b)).unwrap_or_default(),
            api.app_data_dir.to_string_lossy()
        )
        .as_bytes(),
    );
    Ok(Snapshot {
        journal,
        journal_hash: saved.map(|b| sha256_hex(&b)),
        remaining,
        revision,
        archive,
        generation,
    })
}
fn public(id: &str, s: &Snapshot) -> Value {
    json!({"schemaVersion":1,"attemptId":id,"revision":s.revision,"phase":if s.journal_hash.is_none(){"available"}else if s.remaining.is_empty(){"retired"}else{"retiring"},"remainingFiles":s.remaining.len(),"remainingBytes":s.remaining.iter().map(|(_,r)|r.bytes).sum::<u64>(),"archiveSha256":s.journal.archive_sha256,"archiveBytes":s.journal.archive_bytes,"fileName":format!("Conflicto-{}.knownext-conflict-backup.zip",id.trim_start_matches("attempt-")),"canExport":s.archive.is_some(),"canRetire":!s.remaining.is_empty(),"receiptPreserved":true,"identityPreserved":true,"containsLocalMetadata":true,"canReplay":false,"checkedAt":knownext_core::now_iso()})
}
impl LocalApi {
    pub(crate) fn review_conflict_payloads(&self, id: &str) -> Result<Value, String> {
        retention::with_mutation(self, || snapshot(self, id).map(|s| public(id, &s)))
    }
    pub fn freeze_conflict_payload_backup(
        &self,
        id: &str,
        revision: &str,
    ) -> Result<crate::FrozenRecoveryCopy, String> {
        retention::with_mutation(self, || {
            let s = snapshot(self, id)?;
            if s.revision != revision {
                return Err("Cambió el conjunto; revisa antes de respaldar".into());
            }
            let name = public(id, &s)["fileName"]
                .as_str()
                .ok_or("Falta el nombre de respaldo")?
                .to_owned();
            Ok(recovery_system::FrozenRecoveryCopy::project_package(name,s.archive.ok_or("El respaldo ya no puede reconstruirse desde las copias locales; conserva el ZIP externo")?))
        })
    }
    pub fn retire_conflict_payloads(
        &self,
        id: &str,
        revision: &str,
        ack: bool,
        backup: &Path,
    ) -> Result<Value, String> {
        retention::with_mutation(self, || {
            if !ack {
                return Err("Confirma la retirada de copias locales".into());
            }
            let s = snapshot(self, id)?;
            if s.revision != revision || s.remaining.is_empty() {
                return Err(
                    "La revisión cambió o la retirada terminó. Consulta sin repetir".into(),
                );
            }
            let archive = bounded(backup, ZIP_LIMIT)?;
            if archive.len() as u64 != s.journal.archive_bytes
                || sha256_hex(&archive) != s.journal.archive_sha256
            {
                return Err(
                    "El ZIP elegido no es el respaldo completo de estas copias; se conservan"
                        .into(),
                );
            }
            metadata(self, id, &s.journal)?;
            retention_generation::advance(self, &format!("conflict/{id}"), &s.generation)?;
            let journal_path = journal_path(self, id)?;
            if let Some(hash) = &s.journal_hash {
                if sha256_hex(&bounded(&journal_path, MAX_RECORD)?) != *hash {
                    return Err("El registro de retirada cambió; se conserva lo restante".into());
                }
            } else {
                let root = journal_path
                    .parent()
                    .ok_or("Falta el almacén de retiradas")?;
                if !root.exists() {
                    fs::create_dir(root)
                        .map_err(|_| "No se pudo preparar el registro de retirada")?;
                }
                directory(root)?;
                atomic_io::create(
                    &journal_path,
                    &serde_json::to_vec(&s.journal)
                        .map_err(|_| "No se pudo preparar el registro")?,
                )
                .map_err(|_| "No se confirmó el registro previo; consulta sin repetir")?;
            }
            for (path, rep) in &s.remaining {
                metadata(self, id, &s.journal)?;
                let raw = bounded(path, 64 * 1024 * 1024)?;
                if raw.len() as u64 != rep.bytes || sha256_hex(&raw) != rep.sha256 {
                    return Err(
                        "Una copia cambió antes de retirarla; se conserva lo restante".into(),
                    );
                }
                let m = fs::symlink_metadata(path)
                    .map_err(|_| "No se pudo volver a comprobar una copia")?;
                if m.permissions().readonly() {
                    return Err(
                    "Una copia es de solo lectura; consulta la retirada parcial antes de continuar"
                        .into(),
                );
                }
                fs::remove_file(path)
                    .map_err(|_| "Retirada interrumpida; consulta el estado sin repetir")?;
            }
            snapshot(self, id).map(|s| public(id, &s))
        })
    }
}
