use crate::{atomic_io, path_policy};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use std::{
    fs,
    io::Read,
    time::{Duration, Instant},
};

const DIRECTORY: &str = ".knownext-trash";
mod attempts;
pub(crate) use attempts::verify as verify_attempt;
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct TrashEntry {
    pub id: String,
    pub project_id: String,
    pub original_path: String,
    pub deleted_at: String,
    pub directory: bool,
    pub status: String,
}
#[derive(Serialize)]
pub(crate) struct Snapshot {
    pub entries: Vec<TrashEntry>,
    pub warnings: Vec<String>,
    pub limited: bool,
    #[serde(rename = "queriedAt")]
    pub queried_at: String,
    pub restorations: Vec<attempts::Summary>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Owner {
    format: u32,
    project_id: String,
}

fn regular_directory(path: &Path) -> Result<(), String> {
    let meta =
        fs::symlink_metadata(path).map_err(|_| "No se puede revisar la carpeta de papelera")?;
    if !meta.is_dir() || crate::batch::linked(&meta) {
        return Err(
            "La papelera contiene una carpeta enlazada o incompatible; se conserva sin cambios"
                .into(),
        );
    }
    Ok(())
}
fn bounded_file(path: &Path, max: u64) -> Result<Vec<u8>, String> {
    let meta =
        fs::symlink_metadata(path).map_err(|_| "No se puede leer el registro de papelera")?;
    if !meta.is_file() || crate::batch::linked(&meta) || meta.len() > max {
        return Err(
            "Registro de papelera incompatible o demasiado grande; se conserva sin cambios".into(),
        );
    }
    let mut bytes = Vec::new();
    fs::File::open(path)
        .map_err(|e| e.to_string())?
        .take(max + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    if bytes.len() as u64 > max {
        return Err("El registro creció durante su revisión; se conserva".into());
    }
    Ok(bytes)
}

fn storage(root: &Path, project: &str, create: bool) -> Result<PathBuf, String> {
    let directory = root.join(DIRECTORY);
    if !directory.exists() && !create {
        return Ok(directory);
    }
    if !directory.exists() {
        std::fs::create_dir(&directory).map_err(|e| e.to_string())?;
        atomic_io::create(&directory.join(".gitignore"), b"*\n").map_err(|e| e.to_string())?;
        atomic_io::create(
            &directory.join("owner.json"),
            &serde_json::to_vec(&serde_json::json!({"format":1,"projectId":project}))
                .map_err(|e| e.to_string())?,
        )
        .map_err(|e| e.to_string())?;
    }
    regular_directory(&directory)?;
    let canonical_root = root.canonicalize().map_err(|e| e.to_string())?;
    let canonical = directory.canonicalize().map_err(|e| e.to_string())?;
    if !canonical.starts_with(&canonical_root) || canonical == canonical_root {
        return Err("La papelera enlazada no pertenece al proyecto".into());
    }
    let owner: Owner = serde_json::from_slice(&bounded_file(&directory.join("owner.json"), 4096)?)
        .map_err(|e| e.to_string())?;
    if owner.format != 1 || owner.project_id != project {
        return Err("La papelera pertenece a otro proyecto o formato".into());
    }
    if create {
        atomic_io::write(&directory.join(".gitignore"), b"*\n").map_err(|e| e.to_string())?;
    }
    Ok(directory)
}

fn valid_id(id: &str) -> bool {
    id.len() > 6
        && id.len() <= 128
        && id.starts_with("trash-")
        && id.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'-')
}
fn read_entry(storage: &Path, project: &str, id: &str) -> Result<TrashEntry, String> {
    if !valid_id(id) {
        return Err("Identificador de papelera invalido".into());
    }
    let directory = storage.join(id);
    regular_directory(&directory)?;
    if !directory
        .canonicalize()
        .map_err(|e| e.to_string())?
        .starts_with(storage.canonicalize().map_err(|e| e.to_string())?)
    {
        return Err("Entrada de papelera fuera de su ubicacion".into());
    }
    let entry: TrashEntry =
        serde_json::from_slice(&bounded_file(&directory.join("entry.json"), 16 * 1024)?)
            .map_err(|e| e.to_string())?;
    if entry.id != id
        || entry.project_id != project
        || entry.original_path.is_empty()
        || entry.original_path.len() > 4096
        || entry.status != "stored"
        || time::OffsetDateTime::parse(
            &entry.deleted_at,
            &time::format_description::well_known::Rfc3339,
        )
        .is_err()
    {
        return Err("Entrada de otro proyecto".into());
    }
    Ok(entry)
}

pub(crate) fn put(root: &Path, project: &str, relative: &str) -> Result<TrashEntry, String> {
    let source = path_policy::resolve(root, relative)?;
    if source.canonicalize().map_err(|e| e.to_string())?
        == root.canonicalize().map_err(|e| e.to_string())?
    {
        return Err("No se puede enviar la raiz a la papelera".into());
    }
    let metadata = std::fs::symlink_metadata(&source).map_err(|e| e.to_string())?;
    if crate::batch::linked(&metadata) {
        return Err("Resuelve el enlace antes de enviar a la papelera".into());
    }
    let storage = storage(root, project, true)?;
    let entry = TrashEntry {
        id: knownext_core::compact_id("trash"),
        project_id: project.into(),
        original_path: relative.into(),
        deleted_at: knownext_core::now_iso(),
        directory: metadata.is_dir(),
        status: "stored".into(),
    };
    let directory = storage.join(&entry.id);
    std::fs::create_dir(&directory).map_err(|e| e.to_string())?;
    // If preparation fails the source is untouched. After a crash, payload presence
    // reconciles the outcome without executing the move a second time.
    atomic_io::create(
        &directory.join("entry.json"),
        &serde_json::to_vec(&entry).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    atomic_io::rename_no_replace(&source, &directory.join("payload")).map_err(|_| {
        "No se pudo apartar sin reemplazar contenido. Revisa ambas ubicaciones.".to_string()
    })?;
    Ok(entry)
}

pub(crate) fn list(root: &Path, project: &str) -> Result<Snapshot, String> {
    let started = Instant::now();
    let storage = storage(root, project, false)?;
    let mut result = Snapshot {
        entries: vec![],
        warnings: vec![],
        limited: false,
        queried_at: knownext_core::now_iso(),
        restorations: vec![],
    };
    if !storage.exists() {
        return Ok(result);
    }
    let mut restore_scanned = 0;
    for (count, item) in std::fs::read_dir(&storage)
        .map_err(|e| e.to_string())?
        .enumerate()
    {
        if count >= 1000 || started.elapsed() > Duration::from_secs(2) {
            result.limited = true;
            result.warnings.push(
                "Inventario parcial: límite de entradas o tiempo. No se ha retirado contenido."
                    .into(),
            );
            break;
        }
        let item = match item {
            Ok(item) => item,
            Err(e) => {
                result.limited = true;
                if result.warnings.len() < 20 {
                    result.warnings.push(e.to_string());
                }
                continue;
            }
        };
        let id = item.file_name().to_string_lossy().to_string();
        if !valid_id(&id) {
            if id != "owner.json" && id != ".gitignore" {
                result.limited = true;
                if result.warnings.len() < 20 {
                    result
                        .warnings
                        .push("Hay entradas desconocidas conservadas sin interpretar.".into());
                }
            }
            continue;
        }
        match read_entry(&storage, project, &id) {
            Ok(mut entry) => {
                attempts::catalogue(
                    &storage,
                    &entry,
                    &mut result.restorations,
                    &mut result.warnings,
                    &mut result.limited,
                    started,
                    &mut restore_scanned,
                );
                let original = match path_policy::resolve(root, &entry.original_path) {
                    Ok(path) => path,
                    Err(error) => {
                        result.limited = true;
                        if result.warnings.len() < 20 {
                            result.warnings.push(format!("{id}: {error}"));
                        }
                        continue;
                    }
                };
                if let Ok(meta) = fs::symlink_metadata(storage.join(&id).join("payload")) {
                    if crate::batch::linked(&meta)
                        || meta.is_dir() != entry.directory
                        || (!meta.is_dir() && !meta.is_file())
                    {
                        entry.status = "attention".into();
                        result.limited = true;
                    }
                    result.entries.push(entry);
                } else if !original.exists() {
                    entry.status = "attention".into();
                    result.limited = true;
                    result.entries.push(entry);
                }
            }
            Err(error) => {
                result.limited = true;
                if result.warnings.len() < 20 {
                    result.warnings.push(format!("{id}: {error}"));
                }
            }
        }
    }
    result
        .entries
        .sort_by(|a, b| b.deleted_at.cmp(&a.deleted_at));
    result
        .restorations
        .sort_by(|a, b| b.created_at.cmp(&a.created_at));
    Ok(result)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Review {
    pub entry: TrashEntry,
    pub revision: String,
    pub payload_fingerprint: String,
    pub location_revision: String,
}
pub(crate) fn review(root: &Path, project: &str, id: &str) -> Result<Review, String> {
    let storage = storage(root, project, false)?;
    let entry = read_entry(&storage, project, id)?;
    let entry_bytes = bounded_file(&storage.join(id).join("entry.json"), 16 * 1024)?;
    // Bind the parsed identity to those same exact bytes, including future fields.
    let parsed: TrashEntry = serde_json::from_slice(&entry_bytes)
        .map_err(|_| "Registro incompatible; vuelve a revisar")?;
    if serde_json::to_value(&parsed).map_err(|e| e.to_string())?
        != serde_json::to_value(&entry).map_err(|e| e.to_string())?
    {
        return Err("El registro cambió; vuelve a revisar".into());
    }
    let owner = bounded_file(&storage.join("owner.json"), 4096)?;
    let owner_value: Owner =
        serde_json::from_slice(&owner).map_err(|_| "Registro de propietario incompatible")?;
    if owner_value.format != 1 || owner_value.project_id != project {
        return Err("Propietario de papelera cambiado; vuelve a revisar".into());
    }
    let destination = path_policy::resolve(root, &entry.original_path)?;
    match fs::symlink_metadata(&destination) {
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
        _ => {
            return Err("Ya existe un elemento en el destino. Muevelo o renombralo antes de restaurar; no se ha reemplazado nada.".into());
        }
    }
    let payload = storage.join(id).join("payload");
    let meta =
        fs::symlink_metadata(&payload).map_err(|_| "No se localiza el contenido conservado")?;
    if crate::batch::linked(&meta)
        || meta.is_dir() != entry.directory
        || (!meta.is_dir() && !meta.is_file())
    {
        return Err("Contenido enlazado o incompatible; se conserva sin cambios".into());
    }
    let location = root.canonicalize().map_err(|e| e.to_string())?;
    let location_revision = format!(
        "{:x}",
        Sha256::digest(location.to_string_lossy().as_bytes())
    );
    let payload_fingerprint = crate::batch::fingerprint(&payload)?;
    if entry_bytes != bounded_file(&storage.join(id).join("entry.json"), 16 * 1024)?
        || owner != bounded_file(&storage.join("owner.json"), 4096)?
        || location != root.canonicalize().map_err(|e| e.to_string())?
    {
        return Err("La papelera cambió durante la revisión; vuelve a consultar".into());
    }
    let revision = format!(
        "{:x}",
        Sha256::digest(
            serde_json::to_vec(&(
                &location_revision,
                &entry_bytes,
                &owner,
                &payload_fingerprint
            ))
            .map_err(|e| e.to_string())?
        )
    );
    Ok(Review {
        entry,
        revision,
        payload_fingerprint,
        location_revision,
    })
}

pub(crate) struct Restoration {
    pub entry: TrashEntry,
    pub attempt_id: String,
    pub reviewed_revision: String,
}
pub(crate) fn restore_reviewed(
    root: &Path,
    project: &str,
    id: &str,
    body: serde_json::Value,
) -> Result<Restoration, String> {
    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase", deny_unknown_fields)]
    struct Expected {
        revision: String,
        attempt_id: String,
    }
    let expected: Expected =
        serde_json::from_value(body).map_err(|_| "Revisa el contenido antes de restaurarlo")?;
    if expected.revision.len() != 64 || !expected.revision.bytes().all(|b| b.is_ascii_hexdigit()) {
        return Err("Revisión de papelera inválida".into());
    }
    let reviewed = review(root, project, id)?;
    if reviewed.revision != expected.revision {
        return Err("El contenido o la ubicación cambió. Actualiza y revisa antes de restaurar; ambas ubicaciones se conservan.".into());
    }
    let storage = storage(root, project, false)?;
    let mut attempt = attempts::begin(root, project, &reviewed, &expected.attempt_id)?;
    let entry = reviewed.entry;
    let destination = path_policy::resolve(root, &entry.original_path)?;
    let payload = storage.join(id).join("payload");
    if let Some(parent) = destination.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    path_policy::resolve(root, &entry.original_path)?;
    atomic_io::rename_no_replace(&payload, &destination).map_err(|_| {
        "No se pudo restaurar sin reemplazar el destino. Revisa ambas ubicaciones.".to_string()
    })?;
    let proof = attempts::verify(root, project, id, &expected.attempt_id)?;
    if proof["status"] != "confirmed" {
        return Err(
            "La publicación necesita revisión. Consulta el intento sin repetir el movimiento"
                .into(),
        );
    }
    attempt.complete()?;
    Ok(Restoration {
        entry,
        attempt_id: expected.attempt_id,
        reviewed_revision: reviewed.revision,
    })
}

#[cfg(test)]
pub(crate) fn restore(root: &Path, project: &str, id: &str) -> Result<TrashEntry, String> {
    let reviewed = review(root, project, id)?;
    restore_reviewed(
        root,
        project,
        id,
        serde_json::json!({"revision":reviewed.revision,"attemptId":format!("attempt-{}",&format!("{:x}",Sha256::digest(knownext_core::compact_id("test").as_bytes()))[..32])}),
    ).map(|result|result.entry)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn private_payload_is_ignored_by_git_and_bad_metadata_does_not_hide_other_entries() {
        let root = std::env::temp_dir().join(knownext_core::compact_id("knownext-trash-test"));
        std::fs::create_dir_all(&root).unwrap();
        assert!(std::process::Command::new("git")
            .args(["init", "--quiet"])
            .current_dir(&root)
            .status()
            .unwrap()
            .success());
        std::fs::write(root.join("a.md"), "private payload").unwrap();
        let entry = put(&root, "p", "a.md").unwrap();
        let output = std::process::Command::new("git")
            .args(["status", "--porcelain", "--untracked-files=all"])
            .current_dir(&root)
            .output()
            .unwrap();
        assert!(output.status.success());
        assert!(output.stdout.is_empty());
        let bad = root.join(DIRECTORY).join("trash-invalid");
        std::fs::create_dir(&bad).unwrap();
        std::fs::write(bad.join("entry.json"), b"broken json").unwrap();
        let snapshot = list(&root, "p").unwrap();
        assert_eq!(snapshot.entries[0].id, entry.id);
        assert_eq!(snapshot.warnings.len(), 1);
        restore(&root, "p", &entry.id).unwrap();
        std::fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn folder_round_trip_preserves_documents_and_assets_without_git() {
        let root = std::env::temp_dir().join(knownext_core::compact_id("knownext-trash-test"));
        std::fs::create_dir_all(root.join("docs/assets")).unwrap();
        std::fs::write(root.join("docs/plan.md"), "![image](assets/a.png)").unwrap();
        std::fs::write(root.join("docs/assets/a.png"), [1, 2, 3, 4]).unwrap();
        let entry = put(&root, "p", "docs").unwrap();
        assert!(!root.join("docs").exists());
        assert_eq!(list(&root, "p").unwrap().entries.len(), 1);
        restore(&root, "p", &entry.id).unwrap();
        assert_eq!(
            std::fs::read(root.join("docs/assets/a.png")).unwrap(),
            [1, 2, 3, 4]
        );
        assert_eq!(
            std::fs::read_to_string(root.join("docs/plan.md")).unwrap(),
            "![image](assets/a.png)"
        );
        assert!(list(&root, "p").unwrap().entries.is_empty());
        std::fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn restore_refuses_collision_and_keeps_recovery_payload() {
        let root = std::env::temp_dir().join(knownext_core::compact_id("knownext-trash-test"));
        std::fs::create_dir_all(&root).unwrap();
        std::fs::write(root.join("a.md"), "original").unwrap();
        let entry = put(&root, "p", "a.md").unwrap();
        std::fs::write(root.join("a.md"), "new document").unwrap();
        assert!(restore(&root, "p", &entry.id).is_err());
        assert_eq!(
            std::fs::read_to_string(root.join("a.md")).unwrap(),
            "new document"
        );
        assert_eq!(list(&root, "p").unwrap().entries.len(), 1);
        assert!(restore(&root, "p", "../escape").is_err());
        std::fs::remove_dir_all(root).unwrap();
    }
}
