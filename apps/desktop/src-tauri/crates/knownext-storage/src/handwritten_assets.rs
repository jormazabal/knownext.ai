//! Immutable derived images. Existing references never change when a page is inserted again.
use super::*;
use std::{fs,io::Read};
const PNG_LIMIT: u64 = 32 * 1024 * 1024;
fn same_existing(path: &Path, png: &[u8]) -> Result<bool, String> {
    let meta = match fs::symlink_metadata(path) {
        Ok(m) => m,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(false),
        Err(_) => return Err("No se puede comprobar la imagen conservada".into()),
    };
    if !meta.is_file()
        || batch::linked(&meta)
        || meta.len() != png.len() as u64
        || meta.len() > PNG_LIMIT
    {
        return Err(
            "El destino de imagen cambió o no es regular; se conserva sin sustituir".into(),
        );
    }
    let mut bytes = vec![];
    fs::File::open(path)
        .map_err(|_| "No se puede abrir la imagen conservada")?
        .take(PNG_LIMIT + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| "No se pudo comprobar la imagen completa")?;
    if bytes != png {
        return Err("La imagen conservada tiene otros bytes; no se sustituye".into());
    }
    Ok(true)
}
fn folder(root: &Path, name: &str) -> Result<(), String> {
    let path = root.join(name);
    match fs::symlink_metadata(&path) {
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => match fs::create_dir(&path) {
            Ok(()) => (),
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => (),
            Err(_) => return Err("No se pudo preparar la carpeta de imágenes".into()),
        },
        Ok(_) => (),
        Err(_) => return Err("No se puede comprobar la carpeta de imágenes".into()),
    }
    let meta = fs::symlink_metadata(&path).map_err(|_| "No se confirmó la carpeta de imágenes")?;
    if !meta.is_dir() || batch::linked(&meta) {
        return Err("La carpeta de imágenes no es regular; se conserva".into());
    }
    Ok(())
}
impl LocalApi {
    pub(super) fn insert_handwritten_page_markdown(
        &self,
        note_id: &str,
        page_id: &str,
        payload: Value,
    ) -> Result<Value, String> {
        let document_id = payload["documentId"].as_str().ok_or("Falta documentId")?;
        let (project, document_relative) = document_ref(document_id)?;
        if document_ref(note_id)?.0 != project {
            return Err("La nota y el documento deben pertenecer al mismo proyecto".into());
        }
        let _permit = self.project_transaction(&project)?;
        let root = self
            .project_root(&project)?
            .canonicalize()
            .map_err(|_| "Proyecto no disponible")?;
        let document = self.resolve_markdown_path(document_id)?;
        let meta = fs::symlink_metadata(&document)
            .map_err(|_| "El documento de destino no está disponible")?;
        if !meta.is_file() || batch::linked(&meta) {
            return Err("El documento de destino no es regular; se conserva".into());
        }
        let record = self.get_handwritten_note(note_id)?;
        let content = if payload.get("content").is_some_and(|value| !value.is_null()) {
            let content = document_validation::handwritten_payload(&payload)?;
            normalize_handwritten_note(
                content,
                note_id,
                record["name"].as_str().unwrap_or("Nota a mano"),
            )
        } else {
            record["content"].clone()
        };
        document_validation::handwritten(&content)?;
        let (_, png) = knownext_docs::handwritten_note_png(&content, Some(page_id), 1.5)?;
        if png.len() as u64 > PNG_LIMIT {
            return Err("La imagen supera32MiB; se conservan las fuentes sin publicar".into());
        }
        let digest = sha256_hex(&png);
        let note_name = record["name"].as_str().unwrap_or("nota-a-mano.knote");
        let stem = safe_name(note_name.trim_end_matches(".knote"))
            .chars()
            .take(24)
            .collect::<String>();
        let page = safe_name(page_id).chars().take(16).collect::<String>();
        let name = format!("{stem}-{page}-{digest}.png");
        let relative = join_relative(Some("assets/handwritten"), &name);
        if self.project_root(&project)?.canonicalize().ok().as_ref() != Some(&root) {
            return Err("La ubicación cambió; no se publica la imagen".into());
        }
        folder(&root, "assets")?;
        folder(&root, "assets/handwritten")?;
        let asset = self.resolve_project_relative(&project, &relative)?;
        let reused = same_existing(&asset, &png)?;
        if !reused {
            match atomic_io::create(&asset, &png) {
                Ok(()) => (),
                Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => {
                    if !same_existing(&asset, &png)? {
                        return Err("El destino cambió; se conserva sin sustituir".into());
                    }
                }
                Err(_) => {
                    return Err("No se confirmó la imagen completa; las fuentes permanecen".into())
                }
            }
        }
        if !same_existing(&asset, &png)? {
            return Err("No se pudo comprobar la imagen publicada".into());
        }
        let alt = payload["altText"]
            .as_str()
            .filter(|s| !s.trim().is_empty())
            .unwrap_or("Nota manuscrita");
        let target = relative_markdown_target(&document_relative, &relative);
        let markdown = format!(
            "![{}]({} \"knownext-note:{}#{}\")",
            markdown_alt_escape(alt),
            target,
            note_id,
            page_id
        );
        let asset = self.asset_metadata(&project, &doc_id(&project, &relative))?;
        Ok(
            json!({"markdown":markdown,"asset":asset,"noteId":note_id,"pageId":page_id,"snapshotSha256":digest,"snapshotReused":reused}),
        )
    }
}
