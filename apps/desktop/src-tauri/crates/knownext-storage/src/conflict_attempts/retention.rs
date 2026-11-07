//! Explicit lossless compaction. Reads never finish an interrupted representation change.
use super::*;
use crate::recovery_copy_storage as storage;
use std::sync::Arc;
// Opposite actions on a pair containing both representations must never unlink both.
// Runtime ownership already excludes another native process over this state directory.
type DomainLock = std::sync::Mutex<()>;
static LOCKS: std::sync::LazyLock<
    std::sync::Mutex<BTreeMap<PathBuf, std::sync::Weak<DomainLock>>>,
> = std::sync::LazyLock::new(|| std::sync::Mutex::new(BTreeMap::new()));
pub(super) fn with_mutation<T>(
    api: &LocalApi,
    work: impl FnOnce() -> Result<T, String>,
) -> Result<T, String> {
    let key = api
        .app_data_dir
        .canonicalize()
        .map_err(|_| "No se puede comprobar el almacén de copias")?;
    let lock = {
        let mut locks = LOCKS.lock().map_err(|_| "No se pudo reservar el almacén")?;
        locks.retain(|_, entry| entry.strong_count() > 0);
        if let Some(lock) = locks.get(&key).and_then(std::sync::Weak::upgrade) {
            lock
        } else {
            let lock = Arc::new(DomainLock::new(()));
            locks.insert(key, Arc::downgrade(&lock));
            lock
        }
    };
    let _guard = lock.try_lock().map_err(|_| {
        "Hay otra operación de conservación en este almacén. Consulta de nuevo antes de continuar"
    })?;
    work()
}
pub(super) struct Copy {
    pub(super) folder: PathBuf,
    pub(super) key: String,
    pub(super) raw: Vec<u8>,
    pub(super) packed: Vec<u8>,
    pub(super) plain: bool,
    pub(super) compact: bool,
    pub(super) can_compact: bool,
    pub(super) manifest_hash: String,
}
pub(super) struct Snapshot {
    pub(super) record: Record,
    pub(super) copies: Vec<Copy>,
    pub(super) review: Value,
    pub(super) generation: retention_generation::Token,
}
fn exists(path: &Path) -> Result<bool, String> {
    match fs::symlink_metadata(path) {
        Ok(meta) if meta.is_file() && !batch::linked(&meta) => Ok(true),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(false),
        _ => Err("Una representación no es un archivo regular; se conserva".into()),
    }
}
pub(super) fn snapshot(api: &LocalApi, id: &str) -> Result<Snapshot, String> {
    if super::retirement::present(api, id)? {
        return Err(
            "La retirada local ya está iniciada; consulta su estado sin compactar ni expandir"
                .into(),
        );
    }
    let record = read(api, id)?.ok_or("No se encontró el recibo")?;
    if record.phase != "completed" || record.archived_at.is_none() {
        return Err(
            "Archiva primero el recibo completado para gestionar sus copias conservadas".into(),
        );
    }
    // Counts compressed reads and expansions, including repeated integrity checks.
    let generation = retention_generation::read(api, &format!("conflict/{id}"))?;
    let mut budget = 256 * 1024 * 1024;
    let mut copies = vec![];
    let mut rows = vec![];
    let mut revision = record
        .revision
        .clone()
        .ok_or("No se pudo comprobar el recibo")?;
    revision.push_str(&generation.revision);
    let mut stored = 0u64;
    let mut expanded = 0u64;
    let mut compactable = 0;
    let mut expandable = 0;
    let mut savings = 0u64;
    let mut roles = BTreeSet::new();
    for proof in &record.copies {
        let (content, manifest_hash, _, manifest) = api.conflict_copy_bundle(
            &proof.key,
            &record.document_id,
            &record.operation_id,
            &mut budget,
        )?;
        if content != proof.content_hash || manifest_hash != proof.manifest_hash {
            return Err("Una copia no coincide con el recibo; se conserva".into());
        }
        let role = match manifest["reason"].as_str() {
            Some("conflict-local") => "local",
            Some("conflict-disk") => "disk",
            Some("conflict-proposed") => "proposal",
            Some(reason)
                if reason
                    .strip_prefix("conflict-remote-")
                    .is_some_and(version_history::is_commit_id) =>
            {
                "remote"
            }
            _ => return Err("Función de variante desconocida; se conserva".into()),
        };
        if !roles.insert(role) {
            return Err("Las variantes no tienen funciones únicas; se conservan".into());
        }
        let folder =
            recovery_review::archive_folder(&api.app_data_dir.join("drafts-review"), &proof.key)?;
        let mut count = 0;
        for entry in
            fs::read_dir(&folder).map_err(|_| "No se puede consultar la carpeta de la copia")?
        {
            count += 1;
            if count > 3 {
                return Err(
                    "La carpeta contiene entradas adicionales; se conserva sin compactar".into(),
                );
            }
            let entry = entry.map_err(|_| "No se pudo consultar una entrada")?;
            let name = entry.file_name();
            if !matches!(
                name.to_str(),
                Some("manifest.json" | "copy.json" | "copy.json.zip")
            ) {
                return Err("Hay entradas desconocidas; se conservan sin retirarlas".into());
            }
            if !exists(&entry.path())? {
                return Err("Una entrada dejó de estar disponible; actualiza la revisión".into());
            }
        }
        let plain = exists(&folder.join("copy.json"))?;
        let compact = exists(&folder.join("copy.json.zip"))?;
        let raw = storage::read(&folder, storage::LIMIT, &mut budget)?;
        if sha256_hex(&raw) != proof.content_hash {
            return Err("La copia cambió durante la revisión; se conserva".into());
        }
        let packed = if compact {
            let bytes = storage::regular(
                &folder.join("copy.json.zip"),
                storage::PACKED_LIMIT,
                &mut budget,
            )?;
            if storage::unpack(&bytes, &mut budget)? != raw {
                return Err("Las dos representaciones no coinciden; se conservan ambas".into());
            }
            bytes
        } else {
            storage::pack(&raw)?
        };
        // Keep later bounded recovery/package readers viable for four large variants.
        let can_compact = plain && packed.len().saturating_mul(10) <= raw.len().saturating_mul(9);
        let can_expand = compact;
        let current =
            (if plain { raw.len() } else { 0 }) + (if compact { packed.len() } else { 0 });
        stored += current as u64;
        expanded += raw.len() as u64;
        if can_compact {
            compactable += 1;
            savings += if compact {
                raw.len() as u64
            } else {
                (raw.len() - packed.len()) as u64
            };
        }
        if can_expand {
            expandable += 1;
        }
        let packed_hash = sha256_hex(&packed);
        revision.push_str(&format!("/{}/{plain}/{compact}/{packed_hash}", proof.key));
        rows.push(json!({"key":proof.key,"role":role,"representation":if plain&&compact{"both"}else if compact{"compact"}else{"plain"},"originalBytes":raw.len(),"storedBytes":current,"canCompact":can_compact,"canExpand":can_expand}));
        copies.push(Copy {
            folder,
            key: proof.key.clone(),
            raw,
            packed,
            plain,
            compact,
            can_compact,
            manifest_hash,
        });
    }
    if !roles.contains("local") || !roles.contains("disk") || !roles.contains("proposal") {
        return Err("El conjunto no confirma todas las variantes; se conserva".into());
    }
    let location = api
        .app_data_dir
        .canonicalize()
        .map_err(|_| "No se puede comprobar el almacén")?;
    let review = json!({"schemaVersion":1,"attemptId":id,"revision":sha256_hex(format!("retention-v1/{}/{revision}",location.to_string_lossy()).as_bytes()),"copies":rows,"storedBytes":stored,"originalBytes":expanded,"recoverableBytes":savings,"compactableCount":compactable,"expandableCount":expandable,"receiptsPreserved":true,"automaticExpiry":false,"checkedAt":knownext_core::now_iso()});
    Ok(Snapshot {
        record,
        copies,
        review,
        generation,
    })
}
fn check_before_remove(api: &LocalApi, record: &Record, copy: &Copy) -> Result<(), String> {
    if read(api, &record.id)?.and_then(|current| current.revision) != record.revision {
        return Err("El recibo cambió; revisa antes de continuar".into());
    }
    let mut budget = 32 * 1024 * 1024;
    if sha256_hex(&storage::regular(
        &copy.folder.join("manifest.json"),
        16 * 1024,
        &mut budget,
    )?) != copy.manifest_hash
    {
        return Err("El manifiesto cambió; se conservan ambas representaciones".into());
    }
    if storage::regular(&copy.folder.join("copy.json"), storage::LIMIT, &mut budget)? != copy.raw
        || storage::unpack(
            &storage::regular(
                &copy.folder.join("copy.json.zip"),
                storage::PACKED_LIMIT,
                &mut budget,
            )?,
            &mut budget,
        )? != copy.raw
    {
        return Err(
            "La copia cambió antes de retirar la representación redundante; se conservan ambas"
                .into(),
        );
    }
    Ok(())
}
fn remove(path: &Path) -> Result<(), String> {
    let meta = fs::symlink_metadata(path)
        .map_err(|_| "No se puede comprobar la representación redundante")?;
    if !meta.is_file() || batch::linked(&meta) || meta.permissions().readonly() {
        return Err("La representación no es regular o es de solo lectura; se conserva".into());
    }
    fs::remove_file(path).map_err(|_| {
        "No se confirmó la retirada de la representación redundante; revisa el estado".to_string()
    })
}
impl LocalApi {
    pub(crate) fn review_conflict_retention(&self, id: &str) -> Result<Value, String> {
        snapshot(self, id).map(|state| state.review)
    }
    pub(crate) fn change_conflict_retention(&self, id: &str, body: Value) -> Result<Value, String> {
        with_mutation(self, || {
            #[derive(Deserialize)]
            #[serde(rename_all = "camelCase", deny_unknown_fields)]
            struct Request {
                revision: String,
                action: String,
                acknowledge: bool,
            }
            let request: Request = serde_json::from_value(body)
                .map_err(|_| "Solicitud de conservación no compatible")?;
            if !request.acknowledge || !matches!(request.action.as_str(), "compact" | "expand") {
                return Err(
                    "Confirma la conservación sin pérdida antes de cambiar la representación"
                        .into(),
                );
            }
            let state = snapshot(self, id)?;
            if state.review["revision"] != request.revision {
                return Err(
                    "La revisión de conservación cambió; actualiza antes de continuar".into(),
                );
            }
            retention_generation::advance(self, &format!("conflict/{id}"), &state.generation)?;
            for copy in &state.copies {
                let compact = request.action == "compact";
                if compact && !copy.can_compact || !compact && !copy.compact {
                    continue;
                }
                let destination = copy.folder.join(if compact {
                    "copy.json.zip"
                } else {
                    "copy.json"
                });
                if compact && !copy.compact {
                    atomic_io::create(&destination, &copy.packed).map_err(|_| {
                        "No se confirmó la copia compactada; el original se conserva"
                    })?;
                }
                if !compact && !copy.plain {
                    atomic_io::create(&destination, &copy.raw).map_err(|_| {
                        "No se confirmó la expansión; la copia compactada se conserva"
                    })?;
                }
                check_before_remove(self, &state.record, copy)
                    .map_err(|error| format!("{}: {error}", copy.key))?;
                remove(&copy.folder.join(if compact {
                    "copy.json"
                } else {
                    "copy.json.zip"
                }))?;
            }
            self.review_conflict_retention(id)
        })
    }
}
