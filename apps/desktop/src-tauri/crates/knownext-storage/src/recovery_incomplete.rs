//! Extract known document content from an unverified recovery pair without adopting its identity.
//! The original pair, receipt and active state are never repaired or changed.
use super::*;
use std::{fs, io::Read};
const COPY_LIMIT: u64 = 8 * 1024 * 1024;
const MANIFEST_LIMIT: u64 = 16 * 1024;
const TEXT_LIMIT: usize = 2 * 1024 * 1024;

fn regular_read(path: &Path, limit: u64) -> Result<Vec<u8>, String> {
    let metadata = fs::symlink_metadata(path)
        .map_err(|_| "El contenido o registro no está disponible; se conserva sin reparar")?;
    if !metadata.is_file() || batch::linked(&metadata) || metadata.len() > limit {
        return Err("El contenido o registro no es regular o supera el límite de esta extracción; se conserva".into());
    }
    let mut bytes = Vec::new();
    fs::File::open(path)
        .map_err(|_| "No se pudo abrir el contenido conservado")?
        .take(limit + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| "No se pudo leer el contenido completo")?;
    if bytes.len() as u64 > limit {
        return Err("El contenido creció fuera del límite; se conserva".into());
    }
    Ok(bytes)
}
fn marker(path: &Path) -> Result<Option<String>, String> {
    match fs::symlink_metadata(path) {
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        _ => regular_read(path, MANIFEST_LIMIT).map(|bytes| Some(sha256_hex(&bytes))),
    }
}
fn directory(path: &Path) -> Result<(), String> {
    let meta =
        fs::symlink_metadata(path).map_err(|_| "La carpeta de recuperación no está disponible")?;
    if !meta.is_dir() || batch::linked(&meta) {
        return Err("La carpeta de recuperación no es regular; se conserva sin recorrerla".into());
    }
    Ok(())
}
struct Extract {
    revision: String,
    copy_hash: String,
    text: String,
    payload: Vec<u8>,
    kind: &'static str,
    page_count: usize,
    stroke_count: usize,
    file_name: String,
}
fn read_payload(folder: &Path) -> Result<Vec<u8>, String> {
    let mut budget = COPY_LIMIT + recovery_copy_storage::PACKED_LIMIT;
    recovery_copy_storage::read(folder, COPY_LIMIT, &mut budget)
}
fn inspect(api: &LocalApi, key: &str) -> Result<Extract, String> {
    directory(&api.app_data_dir)?;
    let root = api.app_data_dir.join("drafts-review");
    directory(&root)?;
    let folder = recovery_review::archive_folder(&root, key)?;
    directory(&folder)?;
    let canonical = folder
        .canonicalize()
        .map_err(|_| "No se puede comprobar la ubicación de la copia")?;
    let manifest = marker(&folder.join("manifest.json"))?;
    let bytes = read_payload(&folder)?;
    let copy_hash = sha256_hex(&bytes);
    let value: Value = serde_json::from_slice(&bytes)
        .map_err(|_| "El contenido no tiene JSON legible; no se intenta reparar y se conserva")?;
    if !value.is_object()
        || value
            .get("schemaVersion")
            .is_some_and(|v| v.as_u64() != Some(1))
    {
        return Err(
            "El formato de la copia no es conocido; se conserva sin normalizar ni extraer".into(),
        );
    }
    let (text, payload, kind, page_count, stroke_count, extension) = match (
        value.get("markdown").filter(|v| !v.is_null()),
        value.get("content").filter(|v| !v.is_null()),
    ) {
        (Some(markdown), None) => {
            let text = markdown
                .as_str()
                .filter(|text| text.len() <= TEXT_LIMIT)
                .ok_or("No hay Markdown conocido de hasta 2 MiB; se conserva el original")?
                .to_owned();
            let payload = text.as_bytes().to_vec();
            (text, payload, "document", 0, 0, "md")
        }
        (None, Some(content)) => {
            document_validation::handwritten(content)?;
            let payload = serde_json::to_vec(content)
                .map_err(|_| "No se pudo conservar el contenido completo de la nota")?;
            if payload.len() as u64 > COPY_LIMIT {
                return Err("El contenido de nota supera 8 MiB; se conserva sin extraer".into());
            }
            let pages = content["pages"]
                .as_array()
                .ok_or("Páginas no comprobables")?;
            let strokes = pages
                .iter()
                .map(|page| page["strokes"].as_array().map_or(0, Vec::len))
                .sum();
            (
                String::new(),
                payload,
                "handwritten-note",
                pages.len(),
                strokes,
                "knote",
            )
        }
        _ => {
            return Err(
                "El contenido contiene tipos ambiguos o desconocidos; se conserva sin extraer"
                    .into(),
            )
        }
    };
    // Check the pair again. A counterpart that appears/disappears invalidates the
    // review even when the recoverable text happens to remain identical.
    if marker(&folder.join("manifest.json"))? != manifest
        || sha256_hex(&read_payload(&folder)?) != copy_hash
        || folder.canonicalize().ok().as_ref() != Some(&canonical)
    {
        return Err("La copia o su registro cambiaron durante la lectura. Revisa de nuevo; los originales se conservan".into());
    }
    directory(&root)?;
    directory(&folder)?;
    let revision=sha256_hex(&serde_json::to_vec(&json!({"format":1,"folder":canonical.to_str().ok_or("Ubicación no representable")?,"key":key,"copy":copy_hash,"manifest":manifest})).map_err(|_|"No se pudo identificar la revisión")?);
    Ok(Extract {
        revision,
        copy_hash,
        text,
        payload,
        kind,
        page_count,
        stroke_count,
        file_name: format!(
            "KnowNext-contenido-recuperado-{}.{extension}",
            &key[key.len().saturating_sub(16)..]
        ),
    })
}
impl LocalApi {
    pub(crate) fn review_incomplete_recovery(&self, key: &str) -> Result<Value, String> {
        let source = inspect(self, key)?;
        let text = source.text.chars().take(2000).collect::<String>();
        Ok(
            json!({"schemaVersion":if source.kind=="document"{1}else{2},"key":key,"revision":source.revision,"copySha256":source.copy_hash,"kind":source.kind,"pageCount":source.page_count,"strokeCount":source.stroke_count,"fileName":source.file_name,"byteLength":source.payload.len(),"previewTruncated":text.len()<source.text.len(),"text":text,"canExport":true,"canRestore":false,"provenanceVerified":false,"checkedAt":knownext_core::now_iso()}),
        )
    }
    pub fn freeze_incomplete_recovery(
        &self,
        key: &str,
        revision: &str,
        acknowledge_unverified: bool,
    ) -> Result<FrozenRecoveryCopy, String> {
        if !acknowledge_unverified
            || revision.len() != 64
            || !revision.bytes().all(|b| b.is_ascii_hexdigit())
        {
            return Err("Revisa el contenido y confirma que su procedencia no está comprobada antes de extraerlo".into());
        }
        let source = inspect(self, key)?;
        if source.revision != revision {
            return Err("La copia o su registro cambió desde la revisión. No se extrae otro contenido; revisa de nuevo".into());
        }
        Ok(if source.kind == "document" {
            FrozenRecoveryCopy::markdown(source.file_name, source.payload)
        } else {
            FrozenRecoveryCopy::handwritten(source.file_name, source.payload)
        })
    }
}
