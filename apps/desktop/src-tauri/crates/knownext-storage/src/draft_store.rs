//! Private recovery files are keyed by the complete document identity.
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::Read,
    path::{Path, PathBuf},
};

const MAX_BYTES: u64 = 64 * 1024 * 1024;

pub(super) fn path(root: &Path, id: &str) -> PathBuf {
    root.join(format!("v2_{:x}.json", Sha256::digest(id.as_bytes())))
}

fn legacy_path(root: &Path, id: &str) -> PathBuf {
    root.join(format!("{}.json", super::safe_name(id)))
}

fn load(path: &Path) -> Result<Option<(Value, Vec<u8>)>, String> {
    let metadata = match fs::symlink_metadata(path) {
        Ok(value) => value,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(_) => return Err("No se puede consultar el borrador. Se conserva sin cambios.".into()),
    };
    if !metadata.is_file() || super::batch::linked(&metadata) || metadata.len() > MAX_BYTES {
        return Err("El borrador no es un archivo regular permitido o supera 64 MiB. Se conserva sin cambios.".into());
    }
    let mut bytes = Vec::new();
    fs::File::open(path)
        .map_err(|_| "No se puede leer el borrador. Se conserva sin cambios.")?
        .take(MAX_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| "No se puede leer el borrador. Se conserva sin cambios.")?;
    if bytes.len() as u64 > MAX_BYTES {
        return Err("El borrador supera 64 MiB. Se conserva sin cambios.".into());
    }
    let value: Value = serde_json::from_slice(&bytes)
        .map_err(|_| "El borrador contiene datos dañados. Se conserva para revisión.")?;
    if !value.is_object() || value["documentId"].as_str().is_none_or(str::is_empty) {
        return Err(
            "No se puede identificar el propietario del borrador. Se conserva para revisión."
                .into(),
        );
    }
    Ok(Some((value, bytes)))
}

fn validate_content(value: &Value) -> Result<(), String> {
    if value.get("schemaVersion").is_some_and(|version|version.as_u64()!=Some(1)) {
        return Err("Versión de borrador no compatible. Se conserva sin migrar, sustituir ni eliminar.".into());
    }
    if let Some(content)=value.get("content") {
        super::document_validation::handwritten(content).map_err(|_|"El borrador de nota tiene un formato no compatible; se conserva sin normalizar")?;
        Ok(())
    } else if value["markdown"].is_string() {
        Ok(())
    } else {
        Err("El borrador no contiene texto o trazos válidos. Se conserva para revisión.".into())
    }
}

pub(super) fn read(root: &Path, id: &str) -> Result<Option<Value>, String> {
    if id.is_empty() {
        return Err("Identidad de borrador no válida".into());
    }
    let current_path = path(root, id);
    let current = load(&current_path)?;
    if current
        .as_ref()
        .is_some_and(|(value, _)| value["documentId"] != id)
    {
        return Err("La identidad del borrador no coincide. No se ha modificado.".into());
    }
    let legacy_path = legacy_path(root, id);
    let legacy = load(&legacy_path)?.filter(|(value, _)| value["documentId"] == id);
    if let Some((legacy, bytes)) = legacy {
        validate_content(&legacy)?;
        if let Some((current, _)) = &current {
            if *current != legacy {
                return Err("Existen dos borradores distintos para este documento. Se conservan ambos para revisión.".into());
            }
        } else {
            fs::create_dir_all(root)
                .map_err(|_| "No se puede preparar el almacén de borradores")?;
            super::atomic_io::create(&current_path, &bytes).map_err(|_| {
                "No se pudo migrar el borrador sin reemplazar archivos. Se conserva el original."
            })?;
            if fs::read(&current_path)
                .map_err(|_| "No se pudo comprobar la migración del borrador")?
                != bytes
            {
                return Err(
                    "No se ha verificado la migración del borrador. Se conserva el original."
                        .into(),
                );
            }
        }
        // The new copy is durable and verified. Do not remove a concurrent revision.
        if fs::read(&legacy_path).map_err(|_| "No se puede comprobar el borrador original")?
            != bytes
        {
            return Err(
                "El borrador original cambió durante la migración. Se conservan ambas copias."
                    .into(),
            );
        }
        remove_regular_file(&legacy_path)?;
        return Ok(Some(legacy));
    }
    if let Some((value, _)) = &current {
        validate_content(value)?;
    }
    Ok(current.map(|(value, _)| value))
}

/// Recovery inspection must not migrate or retire a legacy file while reading it.
pub(super) fn inspect(root:&Path,id:&str)->Result<Option<Value>,String>{
    match fs::symlink_metadata(root){Ok(meta) if !meta.is_dir()||super::batch::linked(&meta)=>return Err("El almacén de borradores no es una carpeta regular; se conserva".into()),Err(e) if e.kind()!=std::io::ErrorKind::NotFound=>return Err("No se puede revisar el almacén de borradores".into()),_=>{}}
    let current=load(&path(root,id))?;
    if current.as_ref().is_some_and(|(value,_)|value["documentId"]!=id){return Err("La identidad del borrador no coincide; se conserva".into());}
    let legacy=load(&legacy_path(root,id))?.filter(|(value,_)|value["documentId"]==id);
    if let Some((value,_))=&current{validate_content(value)?;}
    if let Some((value,_))=&legacy{validate_content(value)?;}
    if let(Some((current,_)),Some((legacy,_)))=(&current,&legacy){if current!=legacy{return Err("Existen dos borradores distintos; se conservan ambos".into());}}
    Ok(current.or(legacy).map(|(value,_)|value))
}

pub(super) fn write(root: &Path, id: &str, value: &Value) -> Result<(), String> {
    if value["documentId"] != id {
        return Err("La identidad del borrador no coincide".into());
    }
    validate_content(value)?;
    read(root, id)?; // Never replace corrupt or ambiguously owned recovery data.
    let bytes = serde_json::to_vec(value).map_err(|_| "No se pudo preparar el borrador")?;
    if bytes.len() as u64 > MAX_BYTES {
        return Err("El borrador supera 64 MiB. Se conserva la versión anterior.".into());
    }
    fs::create_dir_all(root).map_err(|_| "No se puede preparar el almacén de borradores")?;
    super::atomic_io::write(&path(root, id), &bytes)
        .map_err(|_| "No se pudo guardar el borrador. Se conserva la versión anterior.".into())
}

pub(super) fn delete(root: &Path, id: &str) -> Result<(), String> {
    if read(root, id)?.is_some() {
        remove_regular_file(&path(root, id))?;
    }
    Ok(())
}

pub(super) fn check_move(root: &Path, old: &str, new: &str) -> Result<(), String> {
    if old == new {
        return Ok(());
    }
    read(root, old)?;
    if read(root, new)?.is_some() {
        return Err("El destino tiene una copia de recuperación. Revísala antes de mover o renombrar; se conservan ambos contenidos.".into());
    }
    Ok(())
}

pub(super) fn move_identity(root: &Path, old: &str, new: &str) -> Result<(), String> {
    if old == new {
        return Ok(());
    }
    let Some(original) = read(root, old)? else {
        return Ok(());
    };
    if read(root, new)?.is_some() {
        return Err(
            "El destino recibió otro borrador. Se conserva la copia original para revisión.".into(),
        );
    }
    let mut moved = original.clone();
    moved["documentId"] = Value::from(new);
    let bytes =
        serde_json::to_vec(&moved).map_err(|_| "No se pudo preparar la copia del borrador")?;
    if bytes.len() as u64 > MAX_BYTES {
        return Err(
            "La nueva identidad supera el límite de la copia. Se conserva el borrador original."
                .into(),
        );
    }
    super::atomic_io::create(&path(root, new), &bytes).map_err(|_| {
        "No se pudo trasladar la copia de recuperación. El borrador original sigue disponible."
    })?;
    if fs::read(path(root, new)).map_err(|_| "No se pudo verificar la copia del borrador")? != bytes
    {
        return Err("No se pudo verificar la copia de recuperación. Se conservan los archivos para revisión.".into());
    }
    if read(root, old)?.as_ref() != Some(&original) {
        return Err(
            "El borrador original cambió durante el traslado. Se conservan ambas copias.".into(),
        );
    }
    delete(root, old)
}

fn key_path(root: &Path, key: &str) -> Result<PathBuf, String> {
    if key.is_empty()
        || key.len() > 255
        || !key
            .bytes()
            .all(|ch| ch.is_ascii_alphanumeric() || ch == b'_')
    {
        return Err("Identificador de recuperación no válido".into());
    }
    Ok(root.join(key).with_extension("json"))
}

#[cfg(test)]
pub(super) fn read_key(root: &Path, key: &str) -> Result<Option<Value>, String> {
    let value = load(&key_path(root, key)?)?.map(|(value, _)| value);
    if let Some(value) = &value {
        validate_content(value)?;
    }
    Ok(value)
}

pub(super) struct KeySnapshot{pub(super) value:Value,pub(super) fingerprint:String}
pub(super) fn snapshot_key(root:&Path,key:&str)->Result<Option<KeySnapshot>,String>{
    match fs::symlink_metadata(root){Ok(meta) if !meta.is_dir()||super::batch::linked(&meta)=>return Err("El almacén de borradores no es una carpeta regular; se conserva".into()),Err(e) if e.kind()!=std::io::ErrorKind::NotFound=>return Err("No se puede revisar el almacén de borradores".into()),_=>{}}
    let Some((value,raw))=load(&key_path(root,key)?)? else{return Ok(None)};
    validate_content(&value)?;let id=value["documentId"].as_str().ok_or("La copia no tiene identidad")?;
    super::document_ref(id)?;super::draft_versions::ensure_kind(id,Some(&value))?;
    let canonical=path(root,id);let canonical=canonical.file_stem().and_then(|s|s.to_str()).ok_or("No se puede identificar la copia")?;
    if key!=canonical&&key!=super::safe_name(id){return Err("La clave de la copia no coincide con su documento; se conserva sin modificar".into());}
    Ok(Some(KeySnapshot{value,fingerprint:format!("{:x}",Sha256::digest(raw))}))
}
pub(super) fn remove_snapshot_key(root:&Path,key:&str,expected:&KeySnapshot)->Result<(),String>{
    let current=snapshot_key(root,key)?.ok_or("La copia ya no está disponible; actualiza la revisión")?;
    if current.fingerprint!=expected.fingerprint||current.value["documentId"]!=expected.value["documentId"]{return Err("El borrador cambió después de la revisión. Se conserva sin descartar.".into());}
    remove_regular_file(&key_path(root,key)?)
}

pub(super) fn discard_key(root: &Path, key: &str) -> Result<(), String> {
    let path = key_path(root, key)?;
    remove_regular_file(&path)
}

fn remove_regular_file(path: &Path) -> Result<(), String> {
    match fs::symlink_metadata(path) {
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(_) => return Err("No se puede consultar el borrador".into()),
        Ok(metadata) if !metadata.is_file() || super::batch::linked(&metadata) || metadata.permissions().readonly() => {
            return Err("No se pudo retirar el borrador: archivo no permitido o de solo lectura. Se conserva para revisión.".into())
        }
        _ => {}
    }
    fs::remove_file(path)
        .map_err(|_| "No se pudo retirar el borrador. Se conserva para revisión.".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn legacy_migration_checks_ownership_and_keeps_colliding_documents_independent() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        let a = "project::a-b.md";
        let b = "project::a_b.md";
        let first = json!({"documentId":a,"markdown":"first draft","draftUpdatedAt":"2026-10-31T00:00:00Z"});
        let legacy = legacy_path(root, a);
        fs::write(&legacy, serde_json::to_vec(&first).unwrap()).unwrap();
        assert_eq!(read(root, b).unwrap(), None);
        assert!(legacy.exists());
        let second = json!({"documentId":b,"markdown":"second draft"});
        write(root, b, &second).unwrap();
        assert_eq!(read(root, a).unwrap(), Some(first));
        assert!(!legacy.exists());
        assert_eq!(read(root, b).unwrap(), Some(second.clone()));
        delete(root, a).unwrap();
        assert_eq!(read(root, b).unwrap(), Some(second));
        assert_ne!(path(root, "project::á.md"), path(root, "project::é.md"));
    }

    #[test]
    fn corrupt_or_ambiguously_owned_data_is_never_overwritten_or_deleted() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        let id = "project::document.md";
        let target = path(root, id);
        fs::write(&target, b"corrupt").unwrap();
        assert!(read(root, id).is_err());
        assert!(write(root, id, &json!({"documentId":id,"markdown":"replacement"})).is_err());
        assert!(delete(root, id).is_err());
        assert_eq!(fs::read(&target).unwrap(), b"corrupt");
        fs::write(
            &target,
            serde_json::to_vec(&json!({"documentId":"different","markdown":"owned elsewhere"}))
                .unwrap(),
        )
        .unwrap();
        assert!(read(root, id).is_err());
        assert!(delete(root, id).is_err());
    }

    #[test]
    fn two_distinct_recovery_variants_require_review_and_keep_both() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        let id = "project::document.md";
        let legacy = serde_json::to_vec(&json!({"documentId":id,"markdown":"legacy"})).unwrap();
        let current = serde_json::to_vec(&json!({"documentId":id,"markdown":"newer"})).unwrap();
        fs::write(legacy_path(root, id), &legacy).unwrap();
        fs::write(path(root, id), &current).unwrap();
        assert!(read(root, id).is_err());
        assert_eq!(fs::read(legacy_path(root, id)).unwrap(), legacy);
        assert_eq!(fs::read(path(root, id)).unwrap(), current);
        assert!(read_key(root, "../document").is_err());
        assert!(discard_key(root, "../document").is_err());
    }

    #[cfg(windows)]
    #[test]
    fn failed_legacy_cleanup_preserves_both_verified_copies() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        let id = "project::readonly.md";
        let bytes = serde_json::to_vec(&json!({"documentId":id,"markdown":"recover me"})).unwrap();
        let legacy = legacy_path(root, id);
        fs::write(&legacy, &bytes).unwrap();
        let mut permissions = fs::metadata(&legacy).unwrap().permissions();
        permissions.set_readonly(true);
        fs::set_permissions(&legacy, permissions.clone()).unwrap();
        assert!(read(root, id).is_err());
        assert_eq!(fs::read(&legacy).unwrap(), bytes);
        assert_eq!(fs::read(path(root, id)).unwrap(), bytes);
        assert!(write(root, id, &json!({"documentId":id,"markdown":"replacement"})).is_err());
        permissions.set_readonly(false);
        fs::set_permissions(&legacy, permissions).unwrap();
        assert_eq!(read(root, id).unwrap().unwrap()["markdown"], "recover me");
    }
}
