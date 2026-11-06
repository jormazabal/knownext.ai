//! Persistent admission for native history/sync while a working-file application is unfinished.
//! This is separate from process ownership; never reads or changes ownership lock files.
use super::*;
use std::{fs, io::Read};
const NAME: &str = "pending.json";
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Marker {
    pub format: u8,
    pub project_id: String,
    pub plan_id: String,
    pub record_sha256: String,
    pub store_sha256: String,
}
fn path(root: &Path) -> Result<PathBuf, String> {
    let dir = root.join(".knownext-mixed-work");
    match fs::symlink_metadata(&dir) {
        Ok(meta) if meta.is_dir() && !batch::linked(&meta) => {
            let mut count = 0;
            for entry in fs::read_dir(&dir)
                .map_err(|_| "No se puede comprobar la admisión de preparación")?
            {
                count += 1;
                if count > 2 {
                    return Err("La admisión contiene entradas desconocidas; se conserva".into());
                }
                let entry = entry.map_err(|_| "Entrada no comprobable")?;
                let name = entry.file_name();
                if name != ".gitignore" && name != NAME {
                    return Err("La admisión contiene entradas desconocidas; se conserva".into());
                }
                let meta =
                    fs::symlink_metadata(entry.path()).map_err(|_| "Entrada no comprobable")?;
                if !meta.is_file() || batch::linked(&meta) {
                    return Err("Entrada de admisión no regular; se conserva".into());
                }
                if name == ".gitignore"
                    && (meta.len() != 2
                        || fs::read(entry.path()).map_err(|_| "Admisión no legible")? != b"*\n")
                {
                    return Err("Formato de exclusión desconocido; se conserva".into());
                }
            }
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => (),
        _ => return Err("La admisión de preparación no es regular; se conserva".into()),
    }
    Ok(dir.join(NAME))
}
fn bytes(root: &Path) -> Result<Option<Vec<u8>>, String> {
    let path = path(root)?;
    let meta = match fs::symlink_metadata(&path) {
        Ok(meta) => meta,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        _ => return Err("No se puede comprobar una preparación pendiente; se conserva".into()),
    };
    if !meta.is_file() || batch::linked(&meta) || meta.len() > 4096 {
        return Err("Preparación pendiente no compatible; revisa sus copias antes de modificar el historial".into());
    }
    let mut raw = vec![];
    fs::File::open(path)
        .map_err(|_| "No se puede consultar la preparación pendiente")?
        .take(4097)
        .read_to_end(&mut raw)
        .map_err(|_| "No se pudo consultar la preparación completa")?;
    if raw.len() > 4096 {
        return Err("Preparación pendiente fuera de límites".into());
    }
    Ok(Some(raw))
}
fn encoded(marker: &Marker) -> Result<Vec<u8>, String> {
    serde_json::to_vec(marker).map_err(|_| "No se pudo identificar la preparación".into())
}
pub(crate) fn ensure(root: &Path) -> Result<(), String> {
    if bytes(root)?.is_some() {
        return Err("Hay una preparación de variantes pendiente. Consulta Preparación de archivos y complétala o ciérrala conservando sus copias antes de registrar o sincronizar versiones".into());
    }
    Ok(())
}
pub(crate) fn owns(root: &Path, marker: &Marker) -> bool {
    bytes(root).is_ok_and(|raw| {
        raw.is_some_and(|raw| encoded(marker).is_ok_and(|expected| raw == expected))
    })
}
pub(crate) fn reserve(root: &Path, marker: &Marker) -> Result<(), String> {
    let target = path(root)?;
    let expected = encoded(marker)?;
    if let Some(raw) = bytes(root)? {
        if raw == expected {
            return Ok(());
        }
        return Err(
            "Otra preparación conserva la admisión del proyecto; no se sustituye ni se aplica"
                .into(),
        );
    }
    let parent = target.parent().ok_or("Falta el destino de admisión")?;
    if !parent.exists() {
        fs::create_dir(parent).map_err(|_| "No se pudo reservar la admisión")?;
    }
    let ignore = parent.join(".gitignore");
    if !ignore.exists() {
        atomic_io::create(&ignore, b"*\n")
            .map_err(|_| "No se confirmó la exclusión privada de preparación")?;
    }
    path(root)?;
    atomic_io::create(&target, &expected).map_err(|_| {
        "No se confirmó la admisión de preparación; no se aplican archivos".to_string()
    })
}
pub(crate) fn can_release(root: &Path, marker: &Marker) -> Result<(), String> {
    if let Some(raw) = bytes(root)? {
        if raw != encoded(marker)? {
            return Err("La admisión pertenece a otra preparación o cambió; se conserva".into());
        }
    }
    Ok(())
}
pub(crate) fn release(root: &Path, marker: &Marker) -> Result<(), String> {
    can_release(root, marker)?;
    let path = path(root)?;
    match fs::symlink_metadata(&path) {
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Ok(meta) if meta.is_file() && !batch::linked(&meta) && !meta.permissions().readonly() => {
            can_release(root, marker)?;
            fs::remove_file(path).map_err(|_|"La confirmación se conserva pero no se liberó la admisión. Consulta para finalizar".into())
        }
        _ => Err("No se pudo liberar la admisión; se conserva para finalizar".into()),
    }
}
