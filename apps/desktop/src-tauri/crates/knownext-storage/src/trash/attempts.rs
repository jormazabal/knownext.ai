//! Durable restore intent and readonly postcondition checks. Never replay a move.
use super::*;
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Record {
    format: u8,
    id: String,
    entry_id: String,
    project_id: String,
    original_path: String,
    created_at: String,
    phase: String,
    reviewed_revision: String,
    payload_fingerprint: String,
    location_revision: String,
    entry_revision: String,
    owner_revision: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Summary {
    id: String,
    entry_id: String,
    original_path: String,
    pub(super) created_at: String,
    phase: String,
}
pub(super) struct Attempt {
    record: Record,
    path: PathBuf,
    revision: String,
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Active {
    format: u8,
    attempt_id: String,
}
fn active(directory: &Path) -> Result<Option<Vec<u8>>, String> {
    let path = directory.join("restore-active.json");
    match fs::symlink_metadata(&path) {
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(_) => return Err("No se puede revisar el intento activo".into()),
        _ => {}
    }
    let bytes = bounded_file(&path, 4096)?;
    let value: Active = serde_json::from_slice(&bytes)
        .map_err(|_| "Marcador de restauración incompatible; se conserva")?;
    identity(&value.attempt_id)?;
    if value.format != 1 {
        return Err("Marcador de versión futura conservado".into());
    }
    Ok(Some(bytes))
}
fn hash(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}
fn digest(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(|b| b.is_ascii_hexdigit())
}
fn identity(id: &str) -> Result<(), String> {
    if id.len() != 40
        || !id.starts_with("attempt-")
        || !id[8..].bytes().all(|b| b.is_ascii_hexdigit())
    {
        return Err("Identidad de intento de restauración inválida".into());
    }
    Ok(())
}
fn path(storage: &Path, entry: &str, id: &str) -> Result<PathBuf, String> {
    identity(id)?;
    if !valid_id(entry) {
        return Err("Entrada de papelera inválida".into());
    }
    Ok(storage.join(entry).join(format!("restore-{id}.json")))
}
fn record(bytes: &[u8], entry: &str, project: &str, id: &str) -> Result<Record, String> {
    let value: Record = serde_json::from_slice(bytes)
        .map_err(|_| "Recibo de restauración incompatible; se conserva sin cambios")?;
    identity(&value.id)?;
    if value.format != 1
        || value.id != id
        || value.entry_id != entry
        || value.project_id != project
        || value.original_path.is_empty()
        || value.original_path.len() > 4096
        || !matches!(value.phase.as_str(), "applying" | "completed")
        || [
            &value.reviewed_revision,
            &value.payload_fingerprint,
            &value.location_revision,
            &value.entry_revision,
            &value.owner_revision,
        ]
        .iter()
        .any(|v| !digest(v))
        || time::OffsetDateTime::parse(
            &value.created_at,
            &time::format_description::well_known::Rfc3339,
        )
        .is_err()
    {
        return Err("El recibo no corresponde a este intento o formato; se conserva".into());
    }
    Ok(value)
}
pub(super) fn begin(
    root: &Path,
    project: &str,
    review: &Review,
    id: &str,
) -> Result<Attempt, String> {
    identity(id)?;
    let storage = storage(root, project, false)?;
    let directory = storage.join(&review.entry.id);
    let target = path(&storage, &review.entry.id, id)?;
    let previous = active(&directory)?;
    let mut count = 0;
    for (index, item) in fs::read_dir(&directory)
        .map_err(|_| "No se pueden revisar los recibos")?
        .enumerate()
    {
        if index >= 128 {
            return Err("La entrada alcanzó el límite de revisión. Los recibos se conservan; no comienza otra restauración".into());
        }
        let name = item
            .map_err(|_| "No se pueden revisar los recibos")?
            .file_name();
        let name = name.to_string_lossy();
        if name.starts_with("restore-attempt-") {
            count += 1;
        }
    }
    if count >= 32 {
        return Err("La entrada conserva32 intentos; revisa su estado antes de otra operación. No se eliminan recibos.".into());
    }
    let value = Record {
        format: 1,
        id: id.into(),
        entry_id: review.entry.id.clone(),
        project_id: project.into(),
        original_path: review.entry.original_path.clone(),
        created_at: knownext_core::now_iso(),
        phase: "applying".into(),
        reviewed_revision: review.revision.clone(),
        payload_fingerprint: review.payload_fingerprint.clone(),
        location_revision: review.location_revision.clone(),
        entry_revision: hash(&bounded_file(&directory.join("entry.json"), 16 * 1024)?),
        owner_revision: hash(&bounded_file(&storage.join("owner.json"), 4096)?),
    };
    let bytes = serde_json::to_vec(&value).map_err(|e| e.to_string())?;
    atomic_io::create(&target,&bytes).map_err(|_|"El intento ya existe o no se pudo conservar. Consulta su recibo; no se repite el movimiento")?;
    if active(&directory)? != previous {
        return Err("El intento activo cambió; conserva los recibos y vuelve a revisar".into());
    }
    let marker = serde_json::to_vec(&Active {
        format: 1,
        attempt_id: id.into(),
    })
    .map_err(|e| e.to_string())?;
    if previous.is_some() {
        atomic_io::write(&directory.join("restore-active.json"), &marker)
    } else {
        atomic_io::create(&directory.join("restore-active.json"), &marker)
    }
    .map_err(|_| "No se pudo confirmar el intento activo; el contenido no se mueve")?;
    Ok(Attempt {
        record: value,
        path: target,
        revision: hash(&bytes),
    })
}
impl Attempt {
    pub(super) fn complete(&mut self) -> Result<(), String> {
        if hash(&bounded_file(&self.path, 16 * 1024)?) != self.revision {
            return Err("El recibo cambió después de publicar. Consulta su estado; no se repite la restauración".into());
        }
        self.record.phase = "completed".into();
        let bytes = serde_json::to_vec(&self.record).map_err(|e| e.to_string())?;
        atomic_io::write(&self.path,&bytes).map_err(|_|"El contenido se publicó pero su recibo necesita revisión. Consulta el intento; no se repite".to_string())
    }
}
pub(crate) fn verify(
    root: &Path,
    project: &str,
    entry_id: &str,
    id: &str,
) -> Result<serde_json::Value, String> {
    let storage = storage(root, project, false)?;
    let file = path(&storage, entry_id, id)?;
    match fs::symlink_metadata(&file) {
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            return Ok(serde_json::json!({"attemptId":id,"entryId":entry_id,"status":"absent"}))
        }
        Err(_) => return Err("No se puede revisar el recibo conservado".into()),
        _ => {}
    }
    let bytes = bounded_file(&file, 16 * 1024)?;
    let receipt = record(&bytes, entry_id, project, id)?;
    let entry = read_entry(&storage, project, entry_id)?;
    let owner = bounded_file(&storage.join("owner.json"), 4096)?;
    let entry_bytes = bounded_file(&storage.join(entry_id).join("entry.json"), 16 * 1024)?;
    let active_bytes = active(&storage.join(entry_id))?;
    let is_active = active_bytes
        .as_ref()
        .and_then(|bytes| serde_json::from_slice::<Active>(bytes).ok())
        .is_some_and(|value| value.attempt_id == id);
    let location = root.canonicalize().map_err(|e| e.to_string())?;
    let unchanged = receipt.original_path == entry.original_path
        && receipt.entry_revision == hash(&entry_bytes)
        && receipt.owner_revision == hash(&owner)
        && receipt.location_revision == hash(location.to_string_lossy().as_bytes());
    let payload = storage.join(entry_id).join("payload");
    let absent =
        matches!(fs::symlink_metadata(&payload),Err(e) if e.kind()==std::io::ErrorKind::NotFound);
    let destination = path_policy::resolve(root, &entry.original_path)?;
    let status = if !unchanged || !is_active {
        "changed"
    } else if !absent {
        "pending"
    } else {
        match fs::symlink_metadata(&destination) {
            Ok(meta)
                if !crate::batch::linked(&meta)
                    && meta.is_dir() == entry.directory
                    && (meta.is_file() || meta.is_dir()) =>
            {
                if crate::batch::fingerprint(&destination)? == receipt.payload_fingerprint {
                    "confirmed"
                } else {
                    "changed"
                }
            }
            _ => "changed",
        }
    };
    if bytes != bounded_file(&file, 16 * 1024)?
        || owner != bounded_file(&storage.join("owner.json"), 4096)?
        || entry_bytes != bounded_file(&storage.join(entry_id).join("entry.json"), 16 * 1024)?
        || active_bytes != active(&storage.join(entry_id))?
        || location != root.canonicalize().map_err(|e| e.to_string())?
        || absent
            != matches!(fs::symlink_metadata(&payload),Err(e) if e.kind()==std::io::ErrorKind::NotFound)
    {
        return Err(
            "El estado cambió durante la consulta. Se conserva sin atribuir una confirmación"
                .into(),
        );
    }
    Ok(
        serde_json::json!({"attemptId":id,"entryId":entry_id,"status":status,"phase":receipt.phase,"createdAt":receipt.created_at,"originalPath":entry.original_path,"reviewedRevision":receipt.reviewed_revision,"canReplay":false}),
    )
}

pub(super) fn catalogue(
    storage: &Path,
    entry: &TrashEntry,
    rows: &mut Vec<Summary>,
    warnings: &mut Vec<String>,
    limited: &mut bool,
    started: Instant,
    scanned: &mut usize,
) {
    if let Err(error)=active(&storage.join(&entry.id)){*limited=true;if warnings.len()<20{warnings.push(error);}}
    let read = match fs::read_dir(storage.join(&entry.id)) {
        Ok(read) => read,
        Err(_) => {
            *limited = true;
            return;
        }
    };
    for (index, item) in read.enumerate() {
        if index >= 128 || rows.len() >= 1000 || started.elapsed() > Duration::from_secs(2) {
            *limited = true;
            return;
        }
        let item = match item {
            Ok(item) => item,
            Err(_) => {
                *limited = true;
                continue;
            }
        };
        let name = item.file_name();
        let name = name.to_string_lossy();
        if name == "restore-active.json" {
            continue;
        }
        if !name.starts_with("restore-") {
            continue;
        }
        if *scanned >= 1000 {
            *limited = true;
            return;
        }
        *scanned += 1;
        let result = (|| {
            let id = name
                .strip_prefix("restore-")
                .and_then(|v| v.strip_suffix(".json"))
                .ok_or("Recibo desconocido conservado")?;
            identity(id)?;
            let value = record(
                &bounded_file(&item.path(), 16 * 1024)?,
                &entry.id,
                &entry.project_id,
                id,
            )?;
            Ok::<_, String>(Summary {
                id: value.id,
                entry_id: value.entry_id,
                original_path: value.original_path,
                created_at: value.created_at,
                phase: value.phase,
            })
        })();
        match result {
            Ok(summary) => rows.push(summary),
            Err(error) => {
                *limited = true;
                if warnings.len() < 20 {
                    warnings.push(error)
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn setup() -> (tempfile::TempDir, TrashEntry, Review) {
        let temp = tempfile::tempdir().unwrap();
        fs::write(temp.path().join("A.md"), b"owned original\n").unwrap();
        let entry = put(temp.path(), "p", "A.md").unwrap();
        let reviewed = review(temp.path(), "p", &entry.id).unwrap();
        (temp, entry, reviewed)
    }
    fn id(n: u8) -> String {
        format!("attempt-{n:032x}")
    }
    #[test]
    fn cut_after_move_is_confirmed_readonly_and_matching_text_with_payload_is_not() {
        let (temp, entry, reviewed) = setup();
        let root = temp.path();
        let attempt = id(1);
        let _prepared = begin(root, "p", &reviewed, &attempt).unwrap();
        let directory = root.join(DIRECTORY).join(&entry.id);
        let receipt = path(&root.join(DIRECTORY), &entry.id, &attempt).unwrap();
        let before = fs::read(&receipt).unwrap();
        fs::write(root.join("A.md"), b"owned original\n").unwrap();
        assert_eq!(
            verify(root, "p", &entry.id, &attempt).unwrap()["status"],
            "pending"
        );
        fs::remove_file(root.join("A.md")).unwrap();
        atomic_io::rename_no_replace(&directory.join("payload"), &root.join("A.md")).unwrap();
        let reopened = verify(root, "p", &entry.id, &attempt).unwrap();
        assert_eq!(reopened["status"], "confirmed");
        assert_eq!(reopened["phase"], "applying");
        assert_eq!(fs::read(&receipt).unwrap(), before); // No phase repair on a query.
        let catalogue = list(root, "p").unwrap();
        assert_eq!(catalogue.restorations.len(), 1);
        assert!(catalogue.entries.is_empty());
        fs::write(root.join("A.md"), b"later edit\n").unwrap();
        assert_eq!(
            verify(root, "p", &entry.id, &attempt).unwrap()["status"],
            "changed"
        );
        assert_eq!(fs::read(&receipt).unwrap(), before);
    }
    #[test]
    fn a_later_attempt_cannot_confirm_an_earlier_unpublished_intent() {
        let (temp, entry, reviewed) = setup();
        let root = temp.path();
        let first = id(1);
        let second = id(2);
        let _old = begin(root, "p", &reviewed, &first).unwrap();
        let old_path = path(&root.join(DIRECTORY), &entry.id, &first).unwrap();
        let old_bytes = fs::read(&old_path).unwrap();
        let mut current = begin(root, "p", &reviewed, &second).unwrap();
        atomic_io::rename_no_replace(
            &root.join(DIRECTORY).join(&entry.id).join("payload"),
            &root.join("A.md"),
        )
        .unwrap();
        assert_eq!(
            verify(root, "p", &entry.id, &first).unwrap()["status"],
            "changed"
        );
        assert_eq!(
            verify(root, "p", &entry.id, &second).unwrap()["status"],
            "confirmed"
        );
        current.complete().unwrap();
        assert_eq!(
            verify(root, "p", &entry.id, &second).unwrap()["phase"],
            "completed"
        );
        assert_eq!(fs::read(old_path).unwrap(), old_bytes);
        assert!(begin(root, "p", &reviewed, &second).is_err());
    }
    #[test]
    fn future_receipts_and_markers_are_preserved_and_attempt_capacity_never_prunes() {
        let (temp, entry, reviewed) = setup();
        let root = temp.path();
        for n in 1..=32 {
            let _attempt = begin(root, "p", &reviewed, &id(n)).unwrap();
        }
        let directory = root.join(DIRECTORY).join(&entry.id);
        assert!(begin(root, "p", &reviewed, &id(33)).is_err());
        assert_eq!(fs::read_dir(&directory).unwrap().count(), 35);
        let file = path(&root.join(DIRECTORY), &entry.id, &id(1)).unwrap();
        let mut future: serde_json::Value =
            serde_json::from_slice(&fs::read(&file).unwrap()).unwrap();
        future["format"] = serde_json::json!(2);
        let bytes = serde_json::to_vec(&future).unwrap();
        fs::write(&file, &bytes).unwrap();
        assert!(verify(root, "p", &entry.id, &id(1)).is_err());
        assert_eq!(fs::read(&file).unwrap(), bytes);
        let partial = list(root, "p").unwrap();
        assert!(partial.limited);
        assert_eq!(partial.restorations.len(), 31);
        let marker = directory.join("restore-active.json");
        let future_marker =
            serde_json::to_vec(&serde_json::json!({"format":2,"attemptId":id(32)})).unwrap();
        fs::write(&marker, &future_marker).unwrap();
        assert!(verify(root, "p", &entry.id, &id(32)).is_err());
        assert!(list(root,"p").unwrap().limited);
        assert_eq!(fs::read(marker).unwrap(), future_marker);
        assert_eq!(
            fs::read(directory.join("payload")).unwrap(),
            b"owned original\n"
        );
        assert!(!root.join("A.md").exists());
    }
}
