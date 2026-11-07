//! Read-only, deterministic document projections. Never export the private state envelope.
use super::*;
const CONTENT_LIMIT: usize = 8 * 1024 * 1024;
const TOTAL_LIMIT: usize = 31 * 1024 * 1024;

pub(super) fn build(api: &LocalApi, id: &str) -> Result<(Value, Vec<u8>), String> {
    let record = read(api, id)?.ok_or("No se encontró el recibo de combinación")?;
    if record.phase != "completed" {
        return Err("Solo se pueden reunir las variantes de un intento completado".into());
    }
    let revision = record
        .revision
        .clone()
        .ok_or("No se pudo verificar el recibo")?;
    let mut budget = COPY_BUDGET;
    let mut files = vec![];
    let mut rows = vec![];
    let mut roles = BTreeSet::new();
    let mut total = 0usize;
    for copy in &record.copies {
        let (content, manifest_hash, value, manifest) = api.conflict_copy_bundle(
            &copy.key,
            &record.document_id,
            &record.operation_id,
            &mut budget,
        )?;
        if content != copy.content_hash || manifest_hash != copy.manifest_hash {
            return Err("Una variante cambió desde el recibo; se conservan los originales".into());
        }
        let role = match manifest["reason"].as_str() {
            Some("conflict-local") => "Equipo",
            Some("conflict-disk") => "Disco",
            Some("conflict-proposed") => "Propuesta",
            Some(reason)
                if reason
                    .strip_prefix("conflict-remote-")
                    .is_some_and(version_history::is_commit_id) =>
            {
                "Remoto"
            }
            _ => return Err("Una variante no acredita su función en el conflicto".into()),
        };
        if !roles.insert(role) {
            return Err("El conjunto repite una variante; se conserva para revisión".into());
        }
        let (extension, bytes) = if record.kind == "markdown" {
            (
                "md",
                value["markdown"]
                    .as_str()
                    .ok_or("Una variante no contiene Markdown revisable")?
                    .as_bytes()
                    .to_vec(),
            )
        } else {
            let note = &value["content"];
            document_validation::handwritten(note)?;
            (
                "knote",
                serde_json::to_vec_pretty(note)
                    .map_err(|_| "No se pudo preparar la nota completa")?,
            )
        };
        add_file(
            &mut files,
            &mut rows,
            &mut total,
            format!("Variantes/{role}.{extension}"),
            bytes,
            role,
        )?;
        if let Some(history) = value
            .get("historySource")
            .filter(|v| role == "Propuesta" && !v.is_null())
        {
            let markdown = history["markdown"]
                .as_str()
                .ok_or("La fuente histórica está incompleta; se conserva")?;
            if record.kind != "markdown"
                || role != "Propuesta"
                || !history["versionId"]
                    .as_str()
                    .is_some_and(version_history::is_commit_id)
                || history["markdownSha256"] != sha256_hex(markdown.as_bytes())
            {
                return Err("La fuente histórica no confirma su contenido; se conserva".into());
            }
            add_file(
                &mut files,
                &mut rows,
                &mut total,
                "Fuentes/Historico.md".into(),
                markdown.as_bytes().to_vec(),
                "Fuente histórica",
            )?;
        }
    }
    if !roles.contains("Equipo") || !roles.contains("Disco") || !roles.contains("Propuesta") {
        return Err("Faltan variantes obligatorias; no se entrega un conjunto parcial".into());
    }
    let bytes = project_transfer::recovery_package(&record.created_at, &files)?;
    if read(api, id)?
        .and_then(|current| current.revision)
        .as_deref()
        != Some(&revision)
    {
        return Err("El recibo cambió durante la preparación; vuelve a revisarlo".into());
    }
    let package_hash = sha256_hex(&bytes);
    let review_revision =
        sha256_hex(format!("conflict-package-v1/{id}/{revision}/{package_hash}").as_bytes());
    Ok((
        json!({"schemaVersion":1,"attemptId":id,"reviewRevision":review_revision,"packageSha256":package_hash,"byteLength":bytes.len(),"fileName":format!("Variantes-{}.zip",id.trim_start_matches("attempt-")),"files":rows,"warnings":["Solo se incluye el contenido de las variantes verificadas. No es una copia completa del proyecto ni de su estado de recuperación.","Los recursos y enlaces relativos no se incluyen ni se adaptan. Importa el ZIP desde Importar proyecto para crear otro proyecto."],"originalsPreserved":true,"canExport":true,"checkedAt":knownext_core::now_iso()}),
        bytes,
    ))
}
fn add_file(
    files: &mut Vec<(String, Vec<u8>)>,
    rows: &mut Vec<Value>,
    total: &mut usize,
    path: String,
    bytes: Vec<u8>,
    role: &str,
) -> Result<(), String> {
    if bytes.len() > CONTENT_LIMIT || total.saturating_add(bytes.len()) > TOTAL_LIMIT {
        return Err(
            "Una variante supera 8 MiB o el conjunto supera 31 MiB; se conservan los originales"
                .into(),
        );
    }
    *total += bytes.len();
    rows.push(
        json!({"path":path,"role":role,"byteLength":bytes.len(),"sha256":sha256_hex(&bytes)}),
    );
    files.push((path, bytes));
    Ok(())
}
impl LocalApi {
    pub(crate) fn review_conflict_package(&self, id: &str) -> Result<Value, String> {
        build(self, id).map(|(review, _)| review)
    }
    pub fn freeze_conflict_package(
        &self,
        id: &str,
        revision: &str,
    ) -> Result<crate::FrozenRecoveryCopy, String> {
        let (review, bytes) = build(self, id)?;
        if review["reviewRevision"] != revision {
            return Err(
                "El conjunto cambió desde la revisión; consulta de nuevo antes de compartir".into(),
            );
        }
        Ok(recovery_system::FrozenRecoveryCopy::project_package(
            review["fileName"]
                .as_str()
                .ok_or("Falta el nombre de entrega")?
                .into(),
            bytes,
        ))
    }
}
