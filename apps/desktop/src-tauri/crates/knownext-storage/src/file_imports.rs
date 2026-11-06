//! Exclusive, bounded import of a user-selected file into a project.
use super::*;
use std::{collections::BTreeSet, fs, io::Cursor};

const MAX_FILE: usize = 32 * 1024 * 1024;
const MAX_NAMES: usize = 10_000;

pub(super) enum PublicationFailure { Io(std::io::Error), ContextChanged(String) }

fn reject(status: u16, code: &str, detail: &str) -> ApiResult {
    Ok(LocalApiResponse {
        status,
        body: json!({"code":code,"detail":detail,"scope":"project-import","checkedAt":knownext_core::now_iso()}),
    })
}

fn copy_name(name: &str, number: usize) -> Result<String, String> {
    let (stem, extension) = name
        .rsplit_once('.')
        .map(|(s, e)| (s, format!(".{e}")))
        .unwrap_or((name, String::new()));
    let suffix = format!(" ({number})");
    let limit = 240usize
        .checked_sub(suffix.len() + extension.len())
        .filter(|n| *n > 0)
        .ok_or("Elige un nombre de archivo más corto para conservar ambos")?;
    let mut end = stem.len().min(limit);
    while !stem.is_char_boundary(end) {
        end -= 1;
    }
    let candidate = format!("{}{}{}", &stem[..end], suffix, extension);
    portable_paths::component(&candidate)?;
    Ok(candidate)
}

fn dimensions(name: &str, bytes: &[u8], image_only: bool) -> Result<Option<(u32, u32)>, String> {
    let extension = Path::new(name)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    let raster = matches!(extension.as_str(), "png" | "jpg" | "jpeg" | "gif" | "webp");
    if image_only && !raster {
        return Err("Elige una imagen PNG, JPEG, GIF o WebP".into());
    }
    if !raster {
        return Ok(None);
    }
    let reader = image::ImageReader::new(Cursor::new(bytes))
        .with_guessed_format()
        .map_err(|_| "Cabecera de imagen no compatible")?;
    let expected = match extension.as_str() {
        "png" => image::ImageFormat::Png,
        "jpg" | "jpeg" => image::ImageFormat::Jpeg,
        "gif" => image::ImageFormat::Gif,
        _ => image::ImageFormat::WebP,
    };
    if reader.format() != Some(expected) {
        return Err("La cabecera de la imagen no corresponde a su extensión".into());
    }
    let (width, height) = reader
        .into_dimensions()
        .map_err(|_| "No se pueden consultar las dimensiones de la imagen")?;
    if width == 0
        || height == 0
        || width > 20_000
        || height > 20_000
        || u64::from(width) * u64::from(height) > 40_000_000
    {
        return Err("La imagen supera 20.000 píxeles por lado o 40 millones de píxeles".into());
    }
    Ok(Some((width, height)))
}

fn validate_content(
    name: &str,
    bytes: &[u8],
    image_only: bool,
) -> Result<Option<(u32, u32)>, String> {
    let image = dimensions(name, bytes, image_only)?;
    match Path::new(name)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase()
        .as_str()
    {
        "md" | "markdown" => {
            let text = std::str::from_utf8(bytes)
                .map_err(|_| "El documento Markdown necesita texto UTF-8 válido")?;
            if text.contains('\0') {
                return Err("El documento Markdown contiene datos binarios".into());
            }
        }
        "knote" => {
            let content: Value = serde_json::from_slice(bytes)
                .map_err(|_| "La nota manuscrita no contiene JSON válido")?;
            document_validation::handwritten(&content)?;
        }
        _ => (),
    }
    Ok(image)
}

impl LocalApi {
    pub(super) fn import_file(
        &self,
        project_id: &str,
        query: &std::collections::BTreeMap<String, String>,
        files: Vec<LocalApiFile>,
        image_only: bool,
    ) -> ApiResult {
        self.import_file_with_publication(project_id,query,files,image_only,|path,bytes|atomic_io::create(path,bytes).map_err(PublicationFailure::Io))
    }
    pub(super) fn import_file_with_publication(
        &self,project_id:&str,query:&BTreeMap<String,String>,mut files:Vec<LocalApiFile>,image_only:bool,
        mut publish:impl FnMut(&Path,&[u8])->Result<(),PublicationFailure>,
    )->ApiResult {
        if files.len() != 1 || files[0].field_name != "file" {
            return reject(
                400,
                "import_file_required",
                "Elige un único archivo para esta importación",
            );
        }
        let file = files.remove(0);
        if let Err(detail) = portable_paths::component(&file.name) {
            return reject(400, "import_name_invalid", &detail);
        }
        let keep_both = match query.get("collision").map(String::as_str) {
            None | Some("reject") => false,
            Some("keep-both") => true,
            _ => {
                return reject(
                    400,
                    "import_collision_policy_invalid",
                    "Política de colisión no compatible",
                )
            }
        };
        if file.data_base64.len() > MAX_FILE.div_ceil(3) * 4 {
            return reject(
                413,
                "import_too_large",
                "El archivo supera el límite de 32 MiB",
            );
        }
        let bytes = match base64::engine::general_purpose::STANDARD.decode(file.data_base64) {
            Ok(bytes) if bytes.len() <= MAX_FILE => bytes,
            Ok(_) => {
                return reject(
                    413,
                    "import_too_large",
                    "El archivo supera el límite de 32 MiB",
                )
            }
            Err(_) => {
                return reject(
                    400,
                    "import_encoding_invalid",
                    "No se pudo leer el contenido del archivo elegido",
                )
            }
        };
        let dimensions = match validate_content(&file.name, &bytes, image_only) {
            Ok(size) => size,
            Err(detail) => return reject(415, "import_content_invalid", &detail),
        };
        let parent_relative =
            match self.node_relative(project_id, query.get("parentId").map(String::as_str)) {
                Ok(relative) => relative,
                Err(_) => {
                    return reject(
                        400,
                        "import_destination_invalid",
                        "La carpeta elegida no pertenece al proyecto",
                    )
                }
            };
        let parent = match self
            .resolve_project_relative(project_id, parent_relative.as_deref().unwrap_or(""))
        {
            Ok(path) => path,
            Err(_) => {
                return reject(
                    400,
                    "import_destination_invalid",
                    "La carpeta de destino no está disponible en el proyecto",
                )
            }
        };
        if !fs::metadata(&parent).is_ok_and(|m| m.is_dir()) {
            return reject(
                400,
                "import_destination_unavailable",
                "La carpeta de destino ya no está disponible; vuelve a elegirla",
            );
        }
        let entries = match fs::read_dir(&parent) {
            Ok(entries) => entries,
            Err(_) => {
                return reject(
                    403,
                    "import_destination_unreadable",
                    "No se puede comprobar el destino; no se ha importado el archivo",
                )
            }
        };
        let mut names = BTreeSet::new();
        for (index, entry) in entries.enumerate() {
            if index >= MAX_NAMES {
                return reject(
                    413,
                    "import_destination_limit",
                    "La carpeta supera 10.000 entradas; elige una subcarpeta",
                );
            }
            let name = match entry.ok().and_then(|e| e.file_name().into_string().ok()) {
                Some(name) => name,
                None => return reject(
                    400,
                    "import_destination_unknown",
                    "No se puede comprobar un nombre del destino; no se ha importado el archivo",
                ),
            };
            names.insert(portable_paths::key(&name));
        }
        for number in 1..=100 {
            let name = if number == 1 {
                file.name.clone()
            } else {
                match copy_name(&file.name, number) {
                    Ok(name) => name,
                    Err(detail) => return reject(400, "import_name_too_long", &detail),
                }
            };
            if names.contains(&portable_paths::key(&name)) {
                if keep_both {
                    continue;
                }
                return reject(
                    409,
                    "import_name_collision",
                    "Ya existe un archivo o carpeta con ese nombre. Se conserva sin cambios",
                );
            }
            let relative = join_relative(parent_relative.as_deref(), &name);
            let path = match self.resolve_project_relative(project_id, &relative) {
                Ok(path) => path,
                Err(_) => {
                    return reject(
                        400,
                        "import_destination_invalid",
                        "El destino cambió; no se ha importado el archivo",
                    )
                }
            };
            match publish(&path,&bytes){
                Ok(())=>{
                    let tree=self.project_tree(project_id);
                    return ok(self.import_receipt(project_id,&file.name,&name,&relative,&path,&bytes,dimensions,tree));
                }
                Err(PublicationFailure::Io(error))if error.kind()==std::io::ErrorKind::AlreadyExists=>{
                    if !keep_both{return reject(409,"import_name_collision","El nombre acaba de ocuparse; el archivo existente se conserva");}
                    names.insert(portable_paths::key(&name));
                }
                Err(PublicationFailure::ContextChanged(detail))=>{let mut response=reject(409,"import_context_changed",&detail)?;response.body["operationOutcome"]=json!("not-started");return Ok(response);},
                Err(PublicationFailure::Io(_))=>return reject(500,"import_write_failed","No se pudo completar la importación. Los archivos existentes se conservan; revisa permisos y espacio disponible"),
            }
        }
        reject(
            409,
            "import_names_exhausted",
            "No se encontró un nombre libre en 100 intentos; elige un nombre diferente",
        )
    }

    fn import_receipt(
        &self,
        project_id: &str,
        requested: &str,
        name: &str,
        relative: &str,
        path: &Path,
        bytes: &[u8],
        dimensions: Option<(u32, u32)>,
        tree: Result<Vec<Value>, String>,
    ) -> Value {
        let tree_available = tree.is_ok();
        let checked_at = knownext_core::now_iso();
        let mut warnings = Vec::new();
        if name != requested {
            warnings.push(format!(
                "Importado como {name}; el archivo existente se ha conservado"
            ));
        }
        if !tree_available {
            warnings.push("El archivo se ha importado, pero no se pudo actualizar la biblioteca. Actualiza su vista; no repitas la importación".into());
        }
        let node = tree_node(project_id, path.parent().unwrap_or(path), path, relative);
        let asset = json!({"id":doc_id(project_id,relative),"projectId":project_id,"name":name,"path":relative,"mimeType":mime_for_path(path),"sizeBytes":bytes.len(),"width":dimensions.map(|s|s.0),"height":dimensions.map(|s|s.1),"colorDepthBits":null,"updatedAt":checked_at,"usageCount":null,"indexed":false,"indexStatus":"not-indexed","visualDescription":null});
        json!({"tree":tree.unwrap_or_default(),"treeAvailable":tree_available,"treeWarning":if tree_available{Value::Null}else{json!("El archivo se ha importado, pero no se pudo actualizar la vista. No repitas la importación.")},"node":node,"asset":asset,"affectedDocuments":[],"warnings":warnings,"importReceipt":{"id":knownext_core::compact_id("import"),"projectId":project_id,"requestedName":requested,"storedName":name,"path":relative,"renamed":name!=requested,"committed":true,"bytes":bytes.len(),"sha256":format!("{:x}",Sha256::digest(bytes)),"treeAvailable":tree_available,"checkedAt":checked_at}})
    }
}
#[cfg(test)]
mod tests {
    use super::super::*;
    fn fixture() -> (tempfile::TempDir, LocalApi, String) {
        let root = tempfile::tempdir().unwrap();
        let api = LocalApi::new(root.path().into(), "qa".into(), "test".into());
        let project = api
            .create_project(json!({"name":"Import QA","versioningMode":"none"}))
            .unwrap();
        let id = project["id"].as_str().unwrap().to_string();
        (root, api, id)
    }
    fn file(name: &str, bytes: &[u8]) -> LocalApiFile {
        LocalApiFile {
            field_name: "file".into(),
            name: name.into(),
            mime_type: None,
            data_base64: base64::engine::general_purpose::STANDARD.encode(bytes),
        }
    }
    #[test]
    fn import_never_replaces_owned_existing_document() {
        let root = tempfile::tempdir().unwrap();
        let api = LocalApi::new(root.path().into(), "qa".into(), "test".into());
        let project = api
            .create_project(json!({"name":"Import QA","versioningMode":"none"}))
            .unwrap();
        let id = project["id"].as_str().unwrap();
        let path = api.project_root(id).unwrap().join("document.md");
        std::fs::write(&path, b"# Original owned source").unwrap();
        let result = api.handle(
            "POST",
            &format!("/api/projects/{id}/attachments"),
            Value::Null,
            vec![LocalApiFile {
                field_name: "file".into(),
                name: "document.md".into(),
                mime_type: Some("text/markdown".into()),
                data_base64: base64::engine::general_purpose::STANDARD
                    .encode(b"# Imported owned source"),
            }],
        );
        assert_eq!(
            std::fs::read(path).unwrap(),
            b"# Original owned source",
            "import overwrote an existing document"
        );
        assert!(result.is_err() || result.unwrap().status >= 400);
    }

    #[test]
    fn import_keeps_both_with_portable_aliases_and_reports_the_actual_file() {
        let (_root, api, id) = fixture();
        let root = api.project_root(&id).unwrap();
        std::fs::write(root.join("Plan.md"), b"original").unwrap();
        std::fs::write(root.join("plan (2).md"), b"existing second").unwrap();
        let result = api
            .handle(
                "POST",
                &format!("/api/projects/{id}/attachments?collision=keep-both"),
                Value::Null,
                vec![file("plan.md", b"incoming")],
            )
            .unwrap();
        assert_eq!(result.status, 200);
        assert_eq!(result.body["importReceipt"]["storedName"], "plan (3).md");
        assert_eq!(result.body["importReceipt"]["committed"], true);
        assert_eq!(
            result.body["importReceipt"]["sha256"],
            format!("{:x}", Sha256::digest(b"incoming"))
        );
        assert_eq!(std::fs::read(root.join("Plan.md")).unwrap(), b"original");
        assert_eq!(
            std::fs::read(root.join("plan (2).md")).unwrap(),
            b"existing second"
        );
        assert_eq!(
            std::fs::read(root.join("plan (3).md")).unwrap(),
            b"incoming"
        );
        std::fs::write(root.join("Café.md"), b"NFC original").unwrap();
        let result = api
            .handle(
                "POST",
                &format!("/api/projects/{id}/attachments?collision=keep-both"),
                Value::Null,
                vec![file("Cafe\u{301}.md", b"NFD incoming")],
            )
            .unwrap();
        assert_eq!(result.status, 200);
        assert!(result.body["importReceipt"]["renamed"].as_bool().unwrap());
        assert_eq!(
            std::fs::read(root.join("Café.md")).unwrap(),
            b"NFC original"
        );
    }

    #[test]
    fn import_rejects_bad_names_encoding_content_and_size_before_writing() {
        let (_root, api, id) = fixture();
        let root = api.project_root(&id).unwrap();
        let original_names=std::fs::read_dir(&root).unwrap().map(|e|e.unwrap().file_name()).collect::<BTreeSet<_>>();
        let route = format!("/api/projects/{id}/attachments");
        for name in [
            "../escape.md",
            "a/b.md",
            "a\\b.md",
            "CON.md",
            "LPT¹.txt",
            "note.md ",
            ".env",
        ] {
            assert_eq!(
                api.handle("POST", &route, Value::Null, vec![file(name, b"text")])
                    .unwrap()
                    .status,
                400
            );
        }
        for input in [
            file("invalid.md", &[0xff]),
            file("future.knote", br#"{"schemaVersion":99}"#),
            LocalApiFile {
                data_base64: "!invalid".into(),
                ..file("note.md", b"text")
            },
            LocalApiFile {
                data_base64: "A".repeat(super::MAX_FILE.div_ceil(3) * 4 + 1),
                ..file("large.bin", b"")
            },
        ] {
            assert!(
                api.handle("POST", &route, Value::Null, vec![input])
                    .unwrap()
                    .status
                    >= 400
            );
        }
        assert_eq!(std::fs::read_dir(root).unwrap().map(|e|e.unwrap().file_name()).collect::<BTreeSet<_>>(),original_names);
    }

    #[test]
    fn image_import_checks_headers_dimensions_and_does_not_trust_the_name() {
        let (_root, api, id) = fixture();
        let route = format!("/api/projects/{id}/assets/images");
        assert_eq!(
            api.handle(
                "POST",
                &route,
                Value::Null,
                vec![file("bad.png", b"not a PNG")]
            )
            .unwrap()
            .status,
            415
        );
        let mut bytes = Vec::new();
        image::ImageEncoder::write_image(
            image::codecs::png::PngEncoder::new(&mut bytes),
            &[10, 20, 30, 255],
            1,
            1,
            image::ExtendedColorType::Rgba8,
        )
        .unwrap();
        let result = api
            .handle("POST", &route, Value::Null, vec![file("pixel.png", &bytes)])
            .unwrap();
        assert_eq!(result.status, 200);
        assert_eq!(result.body["asset"]["width"], 1);
        assert_eq!(result.body["asset"]["usageCount"], Value::Null);
        assert_eq!(
            api.handle(
                "POST",
                &route,
                Value::Null,
                vec![file("mismatch.jpg", &bytes)]
            )
            .unwrap()
            .status,
            415
        );
        assert_eq!(
            std::fs::read(api.project_root(&id).unwrap().join("pixel.png")).unwrap(),
            bytes
        );
    }

    #[test]
    fn committed_import_receipt_survives_an_unavailable_tree_without_claiming_it_is_empty() {
        let (_root, api, id) = fixture();
        let root = api.project_root(&id).unwrap();
        let path = root.join("owned.txt");
        std::fs::write(&path, b"confirmed").unwrap();
        let result = api.import_receipt(
            &id,
            "owned.txt",
            "owned.txt",
            "owned.txt",
            &path,
            b"confirmed",
            None,
            Err("injected snapshot failure".into()),
        );
        assert_eq!(result["importReceipt"]["committed"], true);
        assert_eq!(result["importReceipt"]["treeAvailable"], false);
        assert_eq!(result["treeAvailable"],false);
        assert!(result["treeWarning"].as_str().unwrap().contains("No repitas"));
        assert!(result["warnings"][0]
            .as_str()
            .unwrap()
            .contains("no repitas"));
        assert_eq!(std::fs::read(path).unwrap(), b"confirmed");
    }
}
