//! Explicit payload retirement. The immutable journal and original receipts retain the identity.
use super::*;
const JOURNAL: &str = "retirement.json";
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Representation {
    name: String,
    bytes: u64,
    sha256: String,
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Journal {
    format: u8,
    record_sha256: String,
    completion_sha256: String,
    archive_sha256: String,
    archive_bytes: u64,
    created_at: String,
    representations: Vec<Representation>,
}
struct Snapshot {
    folder: PathBuf,
    journal: Journal,
    journal_hash: Option<String>,
    remaining: Vec<Representation>,
    review: Value,
    generation: retention_generation::Token,
}
pub(super) fn present(folder: &Path) -> Result<bool, String> {
    match fs::symlink_metadata(folder.join(JOURNAL)) {
        Ok(_) => Ok(true),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(false),
        _ => Err("No se puede comprobar la retirada; se conserva".into()),
    }
}
fn regular_exists(path: &Path) -> Result<bool, String> {
    match fs::symlink_metadata(path) {
        Ok(meta) if meta.is_file() && !batch::linked(&meta) => Ok(true),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(false),
        _ => Err("Representación no regular; se conserva sin retirar".into()),
    }
}
fn metadata_unchanged(s: &Snapshot) -> Result<(), String> {
    let mut budget = RECORD_LIMIT + 4096 + RECORD_LIMIT;
    if sha256_hex(&bounded(
        &s.folder.join("record.json"),
        RECORD_LIMIT,
        &mut budget,
    )?) != s.journal.record_sha256
        || sha256_hex(&bounded(
            &s.folder.join("completed.json"),
            4096,
            &mut budget,
        )?) != s.journal.completion_sha256
    {
        return Err("Los recibos cambiaron; se conserva lo restante".into());
    }
    if let Some(expected) = &s.journal_hash {
        if sha256_hex(&bounded(
            &s.folder.join(JOURNAL),
            RECORD_LIMIT,
            &mut budget,
        )?) != *expected
        {
            return Err("El registro de retirada cambió; se conserva lo restante".into());
        }
    }
    Ok(())
}
fn snapshot(api: &LocalApi, project: &str, id: &str) -> Result<Snapshot, String> {
    let (record, record_hash, folder) =
        load_inner(api, project, id, false)?.ok_or("Preparación no disponible")?;
    let complete = bounded(&folder.join("completed.json"), 4096, &mut 4096)?;
    let completion: Completed =
        serde_json::from_slice(&complete).map_err(|_| "Confirmación desconocida; se conserva")?;
    if completion.format != 1
        || completion.record_sha256 != record_hash
        || !matches!(completion.outcome.as_str(), "applied" | "abandoned")
        || OffsetDateTime::parse(&completion.completed_at, &Rfc3339).is_err()
    {
        return Err("Cierra la preparación antes de retirar sus copias".into());
    }
    let completion_hash = sha256_hex(&complete);
    let mut allowed = std::collections::BTreeMap::new();
    let mut logical = vec![];
    for (index, row) in record.rows.iter().enumerate() {
        for (side, proof) in [("before", &row.before), ("after", &row.after)] {
            let Some(proof) = proof else { continue };
            let plain = payload_path(&folder, index, side)
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .into_owned();
            let compact = format!("{plain}.zip");
            allowed.insert(plain.clone(), (proof.clone(), false));
            allowed.insert(compact.clone(), (proof.clone(), true));
            logical.push((plain, compact));
        }
    }
    let (journal, journal_hash) = if present(&folder)? {
        let raw = bounded(
            &folder.join(JOURNAL),
            RECORD_LIMIT,
            &mut RECORD_LIMIT.clone(),
        )?;
        let j: Journal = serde_json::from_slice(&raw)
            .map_err(|_| "Registro de retirada desconocido; se conserva")?;
        (j, Some(sha256_hex(&raw)))
    } else {
        // The entire cohort is verified before making an irreversible journal.
        let (backup, _) = backup::build(api, project, id)?;
        let mut representations = vec![];
        let mut budget = 256 * 1024 * 1024;
        for (name, (proof, packed)) in &allowed {
            let path = folder.join(name);
            if !regular_exists(&path)? {
                continue;
            }
            let raw = bounded(
                &path,
                if *packed {
                    recovery_copy_storage::PACKED_LIMIT
                } else {
                    FILE_LIMIT
                },
                &mut budget,
            )?;
            let bytes = if *packed {
                recovery_copy_storage::unpack_resource(&raw, &mut budget)?
            } else {
                raw.clone()
            };
            if bytes.len() as u64 != proof.bytes || sha256_hex(&bytes) != proof.sha256 {
                return Err("Una representación no coincide; se conservan todas".into());
            }
            representations.push(Representation {
                name: name.clone(),
                bytes: raw.len() as u64,
                sha256: sha256_hex(&raw),
            });
        }
        (
            Journal {
                format: 1,
                record_sha256: record_hash.clone(),
                completion_sha256: completion_hash.clone(),
                archive_sha256: backup["archiveSha256"]
                    .as_str()
                    .ok_or("Falta SHA del respaldo")?
                    .into(),
                archive_bytes: backup["byteLength"]
                    .as_u64()
                    .ok_or("Falta tamaño del respaldo")?,
                created_at: knownext_core::now_iso(),
                representations,
            },
            None,
        )
    };
    if journal.format != 1
        || journal.record_sha256 != record_hash
        || journal.completion_sha256 != completion_hash
        || !hash(&journal.archive_sha256)
        || journal.archive_bytes > 40 * 1024 * 1024
        || journal.archive_bytes == 0
        || journal.representations.is_empty()
        || journal.representations.len() > 1024
        || OffsetDateTime::parse(&journal.created_at, &Rfc3339).is_err()
    {
        return Err("Registro de retirada no compatible; se conserva sin continuar".into());
    }
    let mut seen = BTreeSet::new();
    let mut budget = 256 * 1024 * 1024;
    let mut remaining = vec![];
    let mut remaining_bytes = 0u64;
    for item in &journal.representations {
        let (proof, packed) = allowed
            .get(&item.name)
            .ok_or("Nombre de retirada desconocido; se conserva")?;
        if !seen.insert(item.name.clone())
            || !hash(&item.sha256)
            || item.bytes
                > if *packed {
                    recovery_copy_storage::PACKED_LIMIT
                } else {
                    FILE_LIMIT
                }
            || (!*packed && (item.bytes != proof.bytes || item.sha256 != proof.sha256))
        {
            return Err("Huella de retirada no compatible; se conserva".into());
        }
        let file = folder.join(&item.name);
        if regular_exists(&file)? {
            let raw = bounded(&file, item.bytes, &mut budget)?;
            if raw.len() as u64 != item.bytes || sha256_hex(&raw) != item.sha256 {
                return Err("Una copia cambió después de revisar; se conserva".into());
            }
            let decoded = if *packed {
                recovery_copy_storage::unpack_resource(&raw, &mut budget)?
            } else {
                raw
            };
            if decoded.len() as u64 != proof.bytes || sha256_hex(&decoded) != proof.sha256 {
                return Err("Contenido de retirada discordante; se conserva".into());
            }
            remaining_bytes = remaining_bytes.saturating_add(item.bytes);
            remaining.push(item.clone());
        } else if journal_hash.is_none() {
            return Err("Falta una copia antes de registrar la retirada; se conserva".into());
        }
    }
    for (plain, compact) in logical {
        if !seen.contains(&plain) && !seen.contains(&compact) {
            return Err("Retirada incompleta sin representación declarada; se conserva".into());
        }
    }
    // No newly appeared representation can be removed, ignored or silently adopted.
    for name in allowed.keys() {
        if regular_exists(&folder.join(name))? && !seen.contains(name) {
            return Err("Apareció otra representación; se conserva sin retirar".into());
        }
    }
    let generation = retention_generation::read(api, &format!("mixed/{project}/{id}"))?;
    let basis = json!({"record":record_hash,"completion":completion_hash,"journal":journal_hash,"remaining":remaining,"archive":journal.archive_sha256,"generation":generation.revision,"location":api.app_data_dir.canonicalize().map_err(|_|"Almacén no comprobable")?.to_string_lossy()});
    let revision =
        sha256_hex(&serde_json::to_vec(&basis).map_err(|_| "No se pudo identificar la retirada")?);
    let phase = if journal_hash.is_none() {
        "available"
    } else if remaining.is_empty() {
        "retired"
    } else {
        "partial"
    };
    let review = json!({"schemaVersion":1,"projectId":project,"planId":id,"revision":revision,"phase":phase,"archiveSha256":journal.archive_sha256,"archiveBytes":journal.archive_bytes,"remainingCount":remaining.len(),"totalCount":journal.representations.len(),"remainingBytes":remaining_bytes,"canRetire":!remaining.is_empty(),"receiptsPreserved":true,"identitiesPreserved":true,"projectFilesUnchanged":true,"checkedAt":knownext_core::now_iso()});
    let snapshot = Snapshot {
        folder,
        journal,
        journal_hash,
        remaining,
        review,
        generation,
    };
    metadata_unchanged(&snapshot)?;
    Ok(snapshot)
}
pub(super) fn application_review(api: &LocalApi, project: &str, id: &str) -> Result<Value, String> {
    let s = snapshot(api, project, id)?;
    Ok(
        json!({"schemaVersion":1,"projectId":project,"planId":id,"revision":s.review["revision"],"phase":if s.remaining.is_empty(){"retired"}else{"retiring"},"canContinue":false,"canRelease":false,"canAbandon":false,"canReplay":false,"copiesPreserved":false,"rows":[],"checkedAt":knownext_core::now_iso(),"message":if s.remaining.is_empty(){"Copias locales retiradas. El recibo y la identidad permanecen; recupera los contenidos desde el respaldo externo."}else{"Retirada parcial registrada. Los recibos y las copias restantes permanecen. Consulta la retirada y vuelve a elegir el respaldo antes de continuar."}}),
    )
}
impl LocalApi {
    pub(crate) fn review_mixed_retirement(&self, project: &str, id: &str) -> Result<Value, String> {
        snapshot(self, project, id).map(|s| s.review)
    }
    pub fn retire_mixed_payloads(
        &self,
        project: &str,
        id: &str,
        revision: &str,
        acknowledge: bool,
        backup: &Path,
    ) -> Result<Value, String> {
        if !acknowledge {
            return Err(
                "Confirma que la retirada local es permanente y conserva el respaldo".into(),
            );
        }
        let _permit = self.project_transaction(project)?;
        let mut s = snapshot(self, project, id)?;
        if s.review["revision"] != revision || s.remaining.is_empty() {
            return Err("La retirada cambió o ya terminó; consulta sin repetir".into());
        }
        let root = self
            .project_root(project)?
            .canonicalize()
            .map_err(|_| "Proyecto no comprobable")?;
        mixed_application_guard::ensure(&root)?;
        let bytes = bounded(backup, 40 * 1024 * 1024, &mut (40 * 1024 * 1024))?;
        if bytes.len() as u64 != s.journal.archive_bytes
            || sha256_hex(&bytes) != s.journal.archive_sha256
        {
            return Err(
                "El ZIP elegido no es el respaldo completo revisado; no se retira ninguna copia"
                    .into(),
            );
        }
        metadata_unchanged(&s)?;
        retention_generation::advance(self, &format!("mixed/{project}/{id}"), &s.generation)?;
        if s.journal_hash.is_none() {
            let raw = serde_json::to_vec_pretty(&s.journal)
                .map_err(|_| "No se pudo preparar la retirada")?;
            if raw.len() as u64 > RECORD_LIMIT {
                return Err("Registro de retirada fuera de límite; se conserva".into());
            }
            atomic_io::create(&s.folder.join(JOURNAL), &raw)
                .map_err(|_| "No se confirmó la intención de retirada; consulta sin repetir")?;
            s.journal_hash = Some(sha256_hex(&raw));
            metadata_unchanged(&s)?;
        }
        let mut budget = 256 * 1024 * 1024;
        for item in &s.remaining {
            metadata_unchanged(&s)?;
            let path = s.folder.join(&item.name);
            let current = bounded(&path, item.bytes, &mut budget)?;
            let meta = fs::symlink_metadata(&path)
                .map_err(|_| "No se confirmó una copia; consulta sin repetir")?;
            if current.len() as u64 != item.bytes
                || sha256_hex(&current) != item.sha256
                || !meta.is_file()
                || batch::linked(&meta)
                || meta.permissions().readonly()
            {
                return Err("Una copia cambió o no permite retirada. Se conservan recibos y lo restante; consulta antes de continuar".into());
            }
            fs::remove_file(&path).map_err(|_| {
                "Retirada no confirmada. Se conserva el registro; consulta antes de continuar"
            })?;
        }
        self.review_mixed_retirement(project, id)
    }
}
