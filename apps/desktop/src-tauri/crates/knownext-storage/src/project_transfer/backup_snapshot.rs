//! Backup snapshots reuse the verified portable format without creating a transfer identity per copy.
use super::*;
use std::{
    fs,
    io::{Read, Write},
};
fn short(value: &str) -> String {
    let mut out = String::new();
    for c in value.chars() {
        if out.len() + c.len_utf8() > 990 {
            out.push_str("…");
            break;
        }
        out.push(c)
    }
    out
}
pub(crate) fn create_scheduled_backup_archive(
    api: &LocalApi,
    p: &str,
    source: &Path,
    parent: &Path,
    output: &Path,
    private: bool,
    check: &dyn Fn() -> Result<(), String>,
) -> Result<Value, String> {
    let name = api.registry_checked()?["projects"]
        .as_array()
        .and_then(|rows| rows.iter().find(|row| row["id"] == p))
        .and_then(|row| row["name"].as_str())
        .unwrap_or("Proyecto")
        .to_owned();
    let mut snapshot = snapshot::prepare_backup(source, parent, &name, check)?;
    if private {
        supplement::append(api, p, source, parent, &mut snapshot, check)?;
    } else {
        snapshot::adapt_references(snapshot.directory.path(), &mut snapshot.manifest, check)?;
    }
    check()?;
    archive::write(snapshot.directory.path(), &snapshot.manifest, output)?;
    check()?;
    let summary = verify_scheduled_backup_archive(output)?;
    let mut warnings = snapshot
        .manifest
        .exclusions
        .iter()
        .map(|e| short(&format!("{}: {}", e.path, e.reason)))
        .take(14)
        .collect::<Vec<_>>();
    if snapshot.unplanned_exclusions > 0 {
        warnings.insert(0,format!("{} omisiones no previstas; copia parcial sin autorización para retirar copias anteriores",snapshot.unplanned_exclusions));
    }
    warnings.push("Paquete portable: las referencias pueden adaptarse para restaurar como proyecto nuevo; los archivos del origen permanecen.".into());
    Ok(
        json!({"archiveSha256":summary["archiveSha256"],"archiveBytes":summary["archiveBytes"],"retentionEligible":snapshot.unplanned_exclusions==0,"unplannedExclusions":snapshot.unplanned_exclusions,"warnings":warnings}),
    )
}
pub(crate) fn verify_scheduled_backup_archive(path: &Path) -> Result<Value, String> {
    let manifest = archive::inspect(path)?;
    let (bytes, hash) = worker::file_hash(path, &|| Ok(()))?;
    Ok(
        json!({"archiveSha256":hash,"archiveBytes":bytes,"files":manifest.files.len(),"directories":manifest.directories.len()}),
    )
}
pub(crate) fn publish_scheduled_backup_archive(
    source: &Path,
    target: &Path,
    expected: &str,
    check: &dyn Fn() -> Result<(), String>,
) -> Result<(), String> {
    let (_, hash) = worker::file_hash(source, check)?;
    if hash != expected {
        return Err(
            "El paquete preparado cambió; se conserva el intento sin publicar otra copia".into(),
        );
    }
    let mut input = fs::File::open(source)
        .map_err(|_| "No se pudo abrir la copia preparada")?
        .take(MAX_ARCHIVE + 1);
    let mut output = fs::OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(target)
        .map_err(|_| "El destino ya existe o no se puede reservar; no se sustituye")?;
    let mut count = 0u64;
    let mut buffer = [0u8; 65536];
    loop {
        check()?;
        let n = input.read(&mut buffer).map_err(|_| "Copia incompleta")?;
        if n == 0 {
            break;
        }
        count += n as u64;
        if count > MAX_ARCHIVE {
            return Err("La copia supera512MiB".into());
        }
        output
            .write_all(&buffer[..n])
            .map_err(|_| "No se pudo escribir toda la copia; consulta el intento")?;
    }
    output
        .sync_all()
        .map_err(|_| "No se pudo confirmar la copia")?;
    drop(output);
    let summary = verify_scheduled_backup_archive(target)?;
    if summary["archiveSha256"] != expected {
        return Err("La copia publicada no coincide con su huella; se conserva como resultado sin confirmar".into());
    }
    Ok(())
}
pub(crate) fn create_scheduled_backup_import(
    api: &LocalApi,
    id: &str,
    source: &Path,
    before_create: &dyn Fn() -> Result<(), String>,
) -> Result<Value, String> {
    api.begin_backup_import(id, before_create)?;
    api.reserve_project_transfer_source(id)?;
    api.copy_project_transfer_source(id, source)?;
    api.record_project_transfer_source(id, Some("Copia local verificada de KnowNext"))
}
pub(crate) fn scheduled_backup_import_status(api: &LocalApi, id: &str) -> Result<Value, String> {
    let job = jobs::read(api, id)?;
    Ok(jobs::public(api, &job))
}

pub(crate) fn backup_snapshot_coordinate(name: &str) -> bool {
    paths::coordination(name)
}
