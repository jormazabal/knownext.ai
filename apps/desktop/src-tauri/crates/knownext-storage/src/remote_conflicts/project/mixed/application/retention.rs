//! Representation changes of closed application payloads, never of working files or receipts.
use super::*;
struct Item {
    path: PathBuf,
    raw: Vec<u8>,
    packed: Vec<u8>,
    plain: bool,
    compact: bool,
    can_compact: bool,
}
struct Snapshot {
    record_hash: String,
    completion_hash: String,
    folder: PathBuf,
    items: Vec<Item>,
    review: Value,
    generation: retention_generation::Token,
}
fn exists(path: &Path) -> Result<bool, String> {
    match fs::symlink_metadata(path) {
        Ok(meta) if meta.is_file() && !batch::linked(&meta) => Ok(true),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(false),
        _ => Err("Una representación no es regular; se conserva".into()),
    }
}
fn snapshot(api: &LocalApi, project: &str, id: &str) -> Result<Snapshot, String> {
    let (record, record_hash, folder) =
        load(api, project, id)?.ok_or("Preparación no disponible")?;
    let mut budget = 256 * 1024 * 1024;
    let completed = bounded(&folder.join("completed.json"), 4096, &mut budget)?;
    let marker: Completed = serde_json::from_slice(&completed)
        .map_err(|_| "La confirmación no tiene un formato conocido; se conserva")?;
    if marker.format != 1
        || marker.record_sha256 != record_hash
        || !matches!(marker.outcome.as_str(), "applied" | "abandoned")
        || OffsetDateTime::parse(&marker.completed_at, &Rfc3339).is_err()
    {
        return Err(
            "Cierra primero la preparación para gestionar sus copias; los originales se conservan"
                .into(),
        );
    }
    let completion_hash = sha256_hex(&completed);
    let generation = retention_generation::read(api, &format!("mixed/{project}/{id}"))?;
    let mut items = vec![];
    let mut files = vec![];
    let mut stored = 0u64;
    let mut original = 0u64;
    let mut savings = 0u64;
    let mut compactable = 0;
    let mut expandable = 0;
    let mut basis = format!(
        "payload-retention-v1/{record_hash}/{completion_hash}/{}",
        api.app_data_dir
            .canonicalize()
            .map_err(|_| "Almacén no comprobable")?
            .to_string_lossy()
    );
    basis.push_str(&generation.revision);
    for (index, row) in record.rows.iter().enumerate() {
        for (side, proof) in [("before", &row.before), ("after", &row.after)] {
            let Some(proof) = proof else { continue };
            let path = payload_path(&folder, index, side);
            let packed_path = path.with_extension("bin.zip");
            let plain = exists(&path)?;
            let compact = exists(&packed_path)?;
            let raw = payload_bytes(&path, &mut budget)?;
            if raw.len() as u64 != proof.bytes || sha256_hex(&raw) != proof.sha256 {
                return Err("Una copia cambió; se conserva sin compactar".into());
            }
            let packed = if compact {
                let bytes = bounded(
                    &packed_path,
                    recovery_copy_storage::PACKED_LIMIT,
                    &mut budget,
                )?;
                if recovery_copy_storage::unpack_resource(&bytes, &mut budget)? != raw {
                    return Err("Las representaciones no coinciden; se conservan ambas".into());
                }
                bytes
            } else {
                recovery_copy_storage::pack_resource(&raw)?
            };
            let can_compact =
                plain && packed.len().saturating_mul(10) <= raw.len().saturating_mul(9);
            let size =
                (if plain { raw.len() } else { 0 }) + (if compact { packed.len() } else { 0 });
            stored += size as u64;
            original += raw.len() as u64;
            if can_compact {
                compactable += 1;
                savings += if compact {
                    raw.len() as u64
                } else {
                    (raw.len() - packed.len()) as u64
                };
            }
            if compact {
                expandable += 1;
            }
            basis.push_str(&format!(
                "/{index}/{side}/{plain}/{compact}/{}",
                sha256_hex(&packed)
            ));
            files.push(json!({"path":row.path,"side":side,"representation":if plain&&compact{"both"}else if compact{"compact"}else{"plain"},"originalBytes":raw.len(),"storedBytes":size,"canCompact":can_compact,"canExpand":compact}));
            items.push(Item {
                path,
                raw,
                packed,
                plain,
                compact,
                can_compact,
            });
        }
    }
    let review = json!({"schemaVersion":1,"projectId":project,"planId":id,"revision":sha256_hex(basis.as_bytes()),"files":files,"storedBytes":stored,"originalBytes":original,"recoverableBytes":savings,"compactableCount":compactable,"expandableCount":expandable,"receiptsPreserved":true,"automaticExpiry":false,"checkedAt":knownext_core::now_iso()});
    Ok(Snapshot {
        record_hash,
        completion_hash,
        folder,
        items,
        review,
        generation,
    })
}
fn verify(state: &Snapshot, item: &Item) -> Result<(), String> {
    let mut budget = 32 * 1024 * 1024;
    if sha256_hex(&bounded(
        &state.folder.join("record.json"),
        RECORD_LIMIT,
        &mut budget,
    )?) != state.record_hash
        || sha256_hex(&bounded(
            &state.folder.join("completed.json"),
            4096,
            &mut budget,
        )?) != state.completion_hash
    {
        return Err("El recibo cambió; se conservan ambas representaciones".into());
    }
    if bounded(&item.path, FILE_LIMIT, &mut budget)? != item.raw
        || recovery_copy_storage::unpack_resource(
            &bounded(
                &item.path.with_extension("bin.zip"),
                recovery_copy_storage::PACKED_LIMIT,
                &mut budget,
            )?,
            &mut budget,
        )? != item.raw
    {
        return Err("Las copias cambiaron antes de retirar redundancia; se conservan".into());
    }
    Ok(())
}
impl LocalApi {
    pub(crate) fn review_mixed_payload_retention(
        &self,
        project: &str,
        id: &str,
    ) -> Result<Value, String> {
        snapshot(self, project, id).map(|s| s.review)
    }
    pub(crate) fn change_mixed_payload_retention(
        &self,
        project: &str,
        id: &str,
        body: Value,
    ) -> Result<Value, String> {
        #[derive(Deserialize)]
        #[serde(deny_unknown_fields)]
        struct Request {
            revision: String,
            action: String,
            acknowledge: bool,
        }
        let request: Request =
            serde_json::from_value(body).map_err(|_| "Solicitud de conservación no compatible")?;
        if !request.acknowledge || !matches!(request.action.as_str(), "compact" | "expand") {
            return Err("Confirma el cambio de representación sin pérdida".into());
        }
        let _permit = self.project_transaction(project)?;
        let state = snapshot(self, project, id)?;
        if state.review["revision"] != request.revision {
            return Err("La conservación cambió; revisa antes de continuar".into());
        }
        retention_generation::advance(self, &format!("mixed/{project}/{id}"), &state.generation)?;
        for item in &state.items {
            let compact = request.action == "compact";
            if compact && !item.can_compact || !compact && !item.compact {
                continue;
            }
            let packed = item.path.with_extension("bin.zip");
            if compact && !item.compact {
                atomic_io::create(&packed, &item.packed)
                    .map_err(|_| "No se confirmó la compactación; el original permanece")?;
            }
            if !compact && !item.plain {
                atomic_io::create(&item.path, &item.raw)
                    .map_err(|_| "No se confirmó la expansión; el compacto permanece")?;
            }
            verify(&state, item)?;
            let redundant = if compact { &item.path } else { &packed };
            let meta = fs::symlink_metadata(redundant)
                .map_err(|_| "No se puede comprobar la representación redundante")?;
            if !meta.is_file() || batch::linked(&meta) || meta.permissions().readonly() {
                return Err("La representación redundante no es regular o es de solo lectura; se conservan ambas".into());
            }
            fs::remove_file(redundant).map_err(|_| {
                "No se confirmó la retirada de redundancia; consulta antes de continuar"
            })?;
        }
        self.review_mixed_payload_retention(project, id)
    }
}
