//! Lossless local representation; original manifest hashes always refer to expanded bytes.
use super::*;
use std::{
    fs,
    io::{Cursor, Read, Write},
};
pub(crate) const LIMIT: u64 = 8 * 1024 * 1024;
pub(crate) const PACKED_LIMIT: u64 = LIMIT + 64 * 1024;
pub(crate) fn regular(path: &Path, limit: u64, budget: &mut u64) -> Result<Vec<u8>, String> {
    let meta = fs::symlink_metadata(path)
        .map_err(|_| "No se puede leer una representación de la copia")?;
    if !meta.is_file() || batch::linked(&meta) || meta.len() > limit || meta.len() > *budget {
        return Err("La copia no es regular o supera el presupuesto; se conserva".into());
    }
    let mut bytes = vec![];
    fs::File::open(path)
        .map_err(|_| "No se puede abrir la copia")?
        .take(limit.min(*budget) + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| "No se pudo completar la lectura de la copia")?;
    let count = bytes.len() as u64;
    let exhausted = count > *budget;
    *budget = budget.saturating_sub(count);
    if count > limit || exhausted {
        return Err("La copia creció fuera del presupuesto; se conserva".into());
    }
    Ok(bytes)
}
pub(crate) fn unpack(bytes: &[u8], budget: &mut u64) -> Result<Vec<u8>, String> {
    unpack_named(bytes, budget, "copy.json")
}
pub(crate) fn unpack_resource(bytes: &[u8], budget: &mut u64) -> Result<Vec<u8>, String> {
    unpack_named(bytes, budget, "payload.bin")
}
fn unpack_named(bytes: &[u8], budget: &mut u64, name: &str) -> Result<Vec<u8>, String> {
    // Our small single-entry ZIP never needs ZIP64, split volumes or comments.
    // Check the declared cohort before the archive reader allocates its directory.
    let end = bytes
        .len()
        .checked_sub(22)
        .and_then(|start| bytes.get(start..))
        .ok_or("La copia compactada está incompleta")?;
    if &end[..4] != b"PK\x05\x06"
        || end[4..8] != [0, 0, 0, 0]
        || end[8..12] != [1, 0, 1, 0]
        || end[20..22] != [0, 0]
    {
        return Err("La copia compactada contiene un directorio no compatible; se conserva".into());
    }
    let mut zip = zip::ZipArchive::new(Cursor::new(bytes))
        .map_err(|_| "La copia compactada no contiene un formato conocido; se conserva")?;
    if zip.len() != 1 || !zip.comment().is_empty() {
        return Err("La copia compactada contiene entradas desconocidas; se conserva".into());
    }
    let mut file = zip
        .by_index(0)
        .map_err(|_| "No se puede abrir la copia compactada")?;
    if file.name() != name
        || file.is_dir()
        || file.size() > LIMIT
        || file.size() > *budget
        || file
            .unix_mode()
            .is_some_and(|mode| mode & 0o170000 != 0 && mode & 0o170000 != 0o100000)
    {
        return Err("Contenido compactado incompatible o fuera de presupuesto; se conserva".into());
    }
    let mut output = vec![];
    let limit = LIMIT.min(*budget);
    file.by_ref()
        .take(limit + 1)
        .read_to_end(&mut output)
        .map_err(|_| "La copia compactada no confirma su integridad")?;
    let count = output.len() as u64;
    let exhausted = count > *budget;
    *budget = budget.saturating_sub(count);
    if count > LIMIT || exhausted {
        return Err("La expansión supera el presupuesto; se conserva".into());
    }
    Ok(output)
}
pub(crate) fn pack(bytes: &[u8]) -> Result<Vec<u8>, String> {
    pack_named(bytes, "copy.json")
}
pub(crate) fn pack_resource(bytes: &[u8]) -> Result<Vec<u8>, String> {
    pack_named(bytes, "payload.bin")
}
fn pack_named(bytes: &[u8], name: &str) -> Result<Vec<u8>, String> {
    if bytes.len() as u64 > LIMIT {
        return Err("La compactación admite copias de hasta8MiB; el original se conserva".into());
    }
    let mut writer = zip::ZipWriter::new(Cursor::new(Vec::new()));
    writer
        .start_file(
            name,
            zip::write::SimpleFileOptions::default()
                .compression_method(zip::CompressionMethod::Deflated),
        )
        .map_err(|_| "No se puede preparar la compactación")?;
    writer
        .write_all(bytes)
        .map_err(|_| "No se pudo compactar la copia completa")?;
    let packed = writer
        .finish()
        .map_err(|_| "No se pudo finalizar la compactación")?
        .into_inner();
    if packed.len() as u64 > PACKED_LIMIT {
        return Err(
            "La representación compactada supera su límite; se conserva el original".into(),
        );
    }
    Ok(packed)
}
pub(crate) fn read(folder: &Path, limit: u64, budget: &mut u64) -> Result<Vec<u8>, String> {
    let original = folder.join("copy.json");
    match fs::symlink_metadata(&original) {
        Ok(_) => regular(&original, limit, budget),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            let packed = regular(&folder.join("copy.json.zip"), PACKED_LIMIT, budget)?;
            let bytes = unpack(&packed, budget)?;
            if bytes.len() as u64 > limit {
                return Err("La copia expandida supera el límite de esta revisión".into());
            }
            Ok(bytes)
        }
        Err(_) => Err("No se puede consultar la copia; se conserva".into()),
    }
}
