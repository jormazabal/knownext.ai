//! A reviewed, self-contained image snapshot. No source or catalog writes.
use super::*;
use std::io::Cursor;

const MAX_IMAGE: u64 = 512 * 1024;
const MAX_IMAGES: usize = 16;
const MAX_PIXELS: u64 = 16_000_000;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Source {
    document_id: String,
    markdown: String,
}

fn image_bytes(path: &Path) -> Result<Vec<u8>, String> {
    let metadata = fs::symlink_metadata(path)
        .map_err(|_| "No se puede consultar una imagen local; se conserva el documento")?;
    if !metadata.is_file() || batch::linked(&metadata) || metadata.len() > MAX_IMAGE {
        return Err(
            "Cada imagen debe ser un archivo regular de hasta 512 KiB; no se siguen enlaces".into(),
        );
    }
    let mut bytes = Vec::new();
    fs::File::open(path)
        .map_err(|_| "No se puede abrir una imagen local")?
        .take(MAX_IMAGE + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| "No se pudo leer una imagen completa")?;
    if bytes.len() as u64 != metadata.len() || bytes.len() as u64 > MAX_IMAGE {
        return Err("La imagen cambió durante la lectura; vuelve a prepararla".into());
    }
    Ok(bytes)
}

impl LocalApi {
    pub(crate) fn prepare_document_template_source(&self, body: Value) -> Result<Value, String> {
        let source: Source = serde_json::from_value(body)
            .map_err(|_| "La preparación necesita documento y contenido, sin estado adicional")?;
        if source.markdown.len() > MAX_MARKDOWN {
            return Err("El contenido de la plantilla supera 1 MiB".into());
        }
        let (project, relative) = document_ref(&source.document_id)?;
        let source_path = self.resolve_markdown_path(&source.document_id)?;
        let metadata = fs::symlink_metadata(&source_path).map_err(|_| {
            "El documento original no está disponible; se conserva la captura en el editor"
        })?;
        if !metadata.is_file() || batch::linked(&metadata) {
            return Err("El documento original debe ser un archivo regular".into());
        }
        let root = self.project_root(&project)?;
        let mut resources = BTreeMap::<String, (String, Value)>::new();
        let mut replacements = Vec::new();
        let mut projected_size = source.markdown.len();
        for destination in knownext_docs::markdown_destinations(&source.markdown) {
            if !destination.is_image {
                continue;
            }
            let target = destination.target.trim();
            if target.starts_with("data:image/")
                || placeholders(target)
                    .iter()
                    .any(|(from, to, _)| *from == 0 && *to == target.len())
            {
                continue;
            }
            if target.starts_with("http:") || target.starts_with("https:") || target.contains("://")
            {
                return Err("La imagen es remota o pertenece a una vista interna. No se descarga; prepara una copia local antes de crear la plantilla".into());
            }
            let resolved = resolve_markdown_asset_target(&relative, target)
                .ok_or("Una imagen no tiene ruta local válida dentro del proyecto")?;
            if !resources.contains_key(&resolved) {
                if resources.len() >= MAX_IMAGES {
                    return Err("La preparación admite hasta 16 imágenes locales diferentes".into());
                }
                let path = self.resolve_project_relative(&project, &resolved)?;
                let bytes = image_bytes(&path)?;
                let format = image::guess_format(&bytes)
                    .map_err(|_| "La imagen local no tiene un formato reconocible")?;
                let mime=match format {image::ImageFormat::Png=>"image/png",image::ImageFormat::Jpeg=>"image/jpeg",image::ImageFormat::WebP=>"image/webp",_=>return Err("Para embeber imágenes se admiten PNG, JPEG y WebP; se conserva el recurso original".into())};
                let (width, height) = image::ImageReader::with_format(Cursor::new(&bytes), format)
                    .into_dimensions()
                    .map_err(|_| "No se pueden comprobar las dimensiones de la imagen")?;
                if width == 0 || height == 0 || u64::from(width) * u64::from(height) > MAX_PIXELS {
                    return Err(
                        "La imagen supera 16 millones de píxeles; prepara una copia más pequeña"
                            .into(),
                    );
                }
                let mut reader = image::ImageReader::with_format(Cursor::new(&bytes), format);
                let mut limits = image::Limits::default();
                limits.max_alloc = Some(128 * 1024 * 1024);
                reader.limits(limits);
                // A correct header alone must not turn a truncated payload into a reviewed image.
                reader.decode().map_err(|_|"La imagen no se puede decodificar completa dentro del límite; se conserva el original")?;
                // Re-resolve ownership and compare bytes; never publish a mixed/torn read.
                if self.project_root(&project)? != root
                    || self.resolve_project_relative(&project, &resolved)? != path
                    || image_bytes(&path)? != bytes
                {
                    return Err("Cambió una imagen o su ubicación durante la preparación; vuelve a revisarla".into());
                }
                let uri = format!(
                    "data:{mime};base64,{}",
                    base64::engine::general_purpose::STANDARD.encode(&bytes)
                );
                let view = json!({"path":resolved,"bytes":bytes.len(),"sha256":sha256_hex(&bytes),"mimeType":mime,"width":width,"height":height});
                resources.insert(resolved.clone(), (uri, view));
            }
            let uri = &resources[&resolved].0;
            projected_size = projected_size
                .saturating_sub(destination.range.len())
                .saturating_add(uri.len());
            if projected_size > MAX_MARKDOWN {
                return Err("Texto e imágenes embebidas superan 1 MiB; reduce las imágenes o usa una plantilla de proyecto".into());
            }
            replacements.push((destination.range, uri.clone()));
        }
        let mut markdown = source.markdown;
        for (range, uri) in replacements.into_iter().rev() {
            if markdown
                .len()
                .saturating_sub(range.len())
                .saturating_add(uri.len())
                > MAX_MARKDOWN
            {
                return Err("Texto e imágenes embebidas superan 1 MiB; reduce las imágenes o usa una plantilla de proyecto".into());
            }
            markdown.replace_range(range, &uri);
        }
        let (markdown, attachments) = attachments::capture(self, &project, &relative, &markdown)?;
        portable_with_resources(&markdown, true, &attachments)?;
        if markdown.len() > MAX_MARKDOWN {
            return Err("Texto y referencias de recursos superan1MiB; reduce la plantilla sin truncar contenido".into());
        }
        variables(&markdown)?;
        Ok(
            json!({"markdown":markdown,"digest":sha256_hex(markdown.as_bytes()),"attachments":attachments,"resources":resources.into_values().map(|(_,view)|view).collect::<Vec<_>>(),"preparedAt":knownext_core::now_iso(),"limits":{"imageBytes":MAX_IMAGE,"images":MAX_IMAGES,"markdownBytes":MAX_MARKDOWN,"pixels":MAX_PIXELS,"attachmentBytes":attachments::MAX_ATTACHMENT,"attachments":attachments::MAX_ATTACHMENTS,"transferBytes":MAX_FILE}}),
        )
    }
}
