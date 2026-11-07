//! Portable data archive. No original command IDs, refs, configuration or execution authority travel.
use super::*;
use std::io::{Cursor, Write};
const ARCHIVE_LIMIT: u64 = 40 * 1024 * 1024;
const MANIFEST_LIMIT: usize = 1024 * 1024;
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct File {
    path: String,
    original_path: String,
    side: String,
    bytes: u64,
    sha256: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Manifest {
    format: &'static str,
    schema_version: u8,
    created_at: String,
    files: Vec<File>,
    state_included: bool,
    authority_included: bool,
}
pub(super) fn build(api: &LocalApi, project: &str, id: &str) -> Result<(Value, Vec<u8>), String> {
    let (record, record_hash, folder) =
        load(api, project, id)?.ok_or("Preparación no disponible")?;
    let completion = bounded(&folder.join("completed.json"), 4096, &mut 4096)?;
    let marker: Completed = serde_json::from_slice(&completion)
        .map_err(|_| "Confirmación de preparación no compatible; se conserva")?;
    if marker.format != 1
        || marker.record_sha256 != record_hash
        || !matches!(marker.outcome.as_str(), "applied" | "abandoned")
        || OffsetDateTime::parse(&marker.completed_at, &Rfc3339).is_err()
    {
        return Err("Cierra primero la preparación para respaldar todas sus copias".into());
    }
    let mut files = vec![];
    let mut payloads = vec![];
    let mut budget = 64 * 1024 * 1024;
    for (index, row) in record.rows.iter().enumerate() {
        for (side, expected) in [("before", &row.before), ("after", &row.after)] {
            let Some(expected) = expected else { continue };
            let path = format!(
                "{}/{}",
                if side == "before" {
                    "Anterior"
                } else {
                    "Elegida"
                },
                row.path
            );
            super::path(path.as_bytes())?;
            let raw = payload_bytes(&payload_path(&folder, index, side), &mut budget)?;
            if raw.len() as u64 != expected.bytes || sha256_hex(&raw) != expected.sha256 {
                return Err(
                    "Una variante cambió durante el respaldo; se conserva sin entregar".into(),
                );
            }
            files.push(File {
                path,
                original_path: row.path.clone(),
                side: side.into(),
                bytes: raw.len() as u64,
                sha256: expected.sha256.clone(),
            });
            payloads.push(raw);
        }
    }
    let manifest = Manifest {
        format: "knownext.variants",
        schema_version: 1,
        created_at: record.created_at.clone(),
        files,
        state_included: false,
        authority_included: false,
    };
    let metadata =
        serde_json::to_vec_pretty(&manifest).map_err(|_| "No se pudo preparar el manifiesto")?;
    if metadata.len() > MANIFEST_LIMIT {
        return Err("El manifiesto supera1MiB; se conserva sin entregar".into());
    }
    let mut writer = zip::ZipWriter::new(Cursor::new(Vec::new()));
    let date = zip::DateTime::from_date_and_time(1980, 1, 1, 0, 0, 0)
        .map_err(|_| "Fecha de respaldo no compatible")?;
    let options = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Stored)
        .last_modified_time(date)
        .unix_permissions(0o644);
    writer
        .start_file("knownext-variants.json", options)
        .map_err(|_| "No se pudo reservar el manifiesto")?;
    writer
        .write_all(&metadata)
        .map_err(|_| "No se pudo conservar el manifiesto completo")?;
    for (file, bytes) in manifest.files.iter().zip(&payloads) {
        writer
            .start_file(&file.path, options)
            .map_err(|_| "No se pudo preparar una variante")?;
        writer
            .write_all(bytes)
            .map_err(|_| "No se pudo incluir una variante completa")?;
    }
    let bytes = writer
        .finish()
        .map_err(|_| "No se pudo completar el respaldo")?
        .into_inner();
    if bytes.len() as u64 > ARCHIVE_LIMIT {
        return Err("El respaldo supera40MiB; las copias permanecen locales".into());
    }
    if sha256_hex(&bounded(
        &folder.join("record.json"),
        RECORD_LIMIT,
        &mut RECORD_LIMIT.clone(),
    )?) != record_hash
        || bounded(&folder.join("completed.json"), 4096, &mut 4096)? != completion
    {
        return Err("El recibo cambió durante el respaldo; revisa antes de entregar".into());
    }
    let archive_hash = sha256_hex(&bytes);
    let revision = sha256_hex(
        format!(
            "variants-export-v1/{project}/{id}/{record_hash}/{}/{archive_hash}/{}",
            sha256_hex(&completion),
            api.app_data_dir
                .canonicalize()
                .map_err(|_| "Estado privado no comprobable")?
                .to_string_lossy()
        )
        .as_bytes(),
    );
    Ok((
        json!({"schemaVersion":1,"projectId":project,"planId":id,"reviewRevision":revision,"archiveSha256":archive_hash,"byteLength":bytes.len(),"fileName":format!("Variantes-{}.knownext-variants.zip",id.trim_start_matches("mixed-")),"files":manifest.files,"stateIncluded":false,"authorityIncluded":false,"originalsPreserved":true,"canDelete":false,"checkedAt":knownext_core::now_iso()}),
        bytes,
    ))
}
impl LocalApi {
    pub fn reserve_mixed_backup_inspection(
        &self,
        cache: &Path,
    ) -> Result<crate::StagedUserExport, String> {
        export_execution::stage_user_export_bytes(
            &[],
            "Inspeccion.zip".into(),
            "application/zip".into(),
            cache,
        )
    }
    pub(crate) fn review_mixed_backup(&self, project: &str, id: &str) -> Result<Value, String> {
        build(self, project, id).map(|(review, _)| review)
    }
    pub fn freeze_mixed_backup(
        &self,
        project: &str,
        id: &str,
        revision: &str,
    ) -> Result<crate::FrozenRecoveryCopy, String> {
        let (review, bytes) = build(self, project, id)?;
        if review["reviewRevision"] != revision {
            return Err("El conjunto cambió; revisa de nuevo antes de respaldar".into());
        }
        Ok(recovery_system::FrozenRecoveryCopy::project_package(
            review["fileName"]
                .as_str()
                .ok_or("Falta el nombre de respaldo")?
                .into(),
            bytes,
        ))
    }
    pub fn verify_mixed_backup(
        &self,
        project: &str,
        id: &str,
        revision: &str,
        source: &Path,
    ) -> Result<Value, String> {
        let (review, _) = build(self, project, id)?;
        if review["reviewRevision"] != revision {
            return Err(
                "La revisión cambió; comprueba el conjunto antes de verificar otro archivo".into(),
            );
        }
        let raw = bounded(source, ARCHIVE_LIMIT, &mut ARCHIVE_LIMIT.clone())?;
        if raw.len() as u64
            != review["byteLength"]
                .as_u64()
                .ok_or("Falta el tamaño revisado")?
            || sha256_hex(&raw) != review["archiveSha256"]
        {
            return Err("El archivo elegido no coincide con este respaldo completo; se conservan las copias locales".into());
        }
        Ok(
            json!({"schemaVersion":1,"status":"verified","projectId":project,"planId":id,"reviewRevision":revision,"archiveSha256":review["archiveSha256"],"byteLength":raw.len(),"fileName":source.file_name().and_then(|s|s.to_str()).unwrap_or("Respaldo.zip"),"canDelete":false,"checkedAt":knownext_core::now_iso()}),
        )
    }
}
