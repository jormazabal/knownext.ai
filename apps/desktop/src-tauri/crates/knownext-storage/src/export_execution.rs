//! Capture under document authority, convert outside it, publish without replacing
//! a changed destination. This queue is independent from interactive AI work.
use super::*;
use std::{fs, io::Read, sync::Mutex};
const MAX_INPUT: u64 = 64 * 1024 * 1024;

#[derive(Clone, Copy)]
pub(super) enum Kind {
    Markdown,
    Handwritten,
}
fn route(path: &str, content: bool) -> Option<(Kind, String)> {
    let (path, _) = split_path(path);
    let parts: Vec<_> = path
        .trim_matches('/')
        .split('/')
        .map(knownext_core::percent_decode)
        .collect();
    let parts: Vec<_> = parts.iter().map(String::as_str).collect();
    let (collection, id) = match (parts.as_slice(), content) {
        (["api", collection, id, "export"], false) => (*collection, *id),
        (["api", collection, id, "export", "content"], true) => (*collection, *id),
        _ => return None,
    };
    let kind = match collection {
        "documents" => Kind::Markdown,
        "handwritten-notes" => Kind::Handwritten,
        _ => return None,
    };
    Some((kind, id.into()))
}
pub fn is_export_request(method: &str, path: &str) -> bool {
    method.eq_ignore_ascii_case("POST") && route(path, false).is_some()
}
pub fn is_export_content_request(method: &str, path: &str) -> bool {
    method.eq_ignore_ascii_case("POST") && route(path, true).is_some()
}

pub(super) fn bounded_read(path: &Path, limit: u64) -> Result<Vec<u8>, String> {
    let mut file =
        fs::File::open(path).map_err(|_| "No se puede abrir un recurso de exportación")?;
    let before = file
        .metadata()
        .map_err(|_| "No se puede comprobar el recurso")?;
    if !before.is_file() || before.len() > limit {
        return Err("El recurso no es un archivo regular dentro del límite de exportación".into());
    }
    let mut bytes = Vec::new();
    file.by_ref()
        .take(limit + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| "No se puede leer el recurso completo")?;
    let after = file
        .metadata()
        .map_err(|_| "No se puede verificar la lectura del recurso")?;
    if bytes.len() as u64 > limit
        || before.len() != after.len()
        || before.modified().ok() != after.modified().ok()
    {
        return Err(
            "El recurso cambió durante su lectura. Revisa la exportación antes de repetirla".into(),
        );
    }
    Ok(bytes)
}
struct Destination {
    path: PathBuf,
    parent: PathBuf,
    base: Option<String>,
}
fn destination_hash(path: &Path) -> Result<Option<String>, String> {
    match fs::symlink_metadata(path) {
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Ok(meta) if !meta.is_file() || batch::linked(&meta) => {
            Err("El destino no es un archivo regular; no se reemplaza".into())
        }
        Ok(_) => Ok(Some(sha256_hex(&bounded_read(path, MAX_INPUT)?))),
        Err(_) => Err("No se puede comprobar el destino de exportación".into()),
    }
}
fn destination(
    api: &LocalApi,
    source: &Path,
    root: &Path,
    format: &str,
    output: &str,
) -> Result<Destination, String> {
    let path = PathBuf::from(output);
    if !path.is_absolute()
        || !path
            .extension()
            .and_then(|ext| ext.to_str())
            .is_some_and(|ext| ext.eq_ignore_ascii_case(format))
    {
        return Err("Elige una ruta absoluta con la extensión del formato de exportación".into());
    }
    let parent = path
        .parent()
        .ok_or("El destino no tiene carpeta")?
        .canonicalize()
        .map_err(|_| "La carpeta de destino no está disponible")?;
    if !parent.is_dir() {
        return Err("El destino necesita una carpeta existente".into());
    }
    let name = path
        .file_name()
        .ok_or("Falta el nombre del archivo exportado")?;
    let target = parent.join(name);
    if let Ok(source) = source.canonicalize() {
        if target.canonicalize().ok().as_ref() == Some(&source) {
            return Err(
                "Exportar no puede reemplazar el documento de origen. Elige otro archivo".into(),
            );
        }
    }
    for project in api.list_projects() {
        if let Some(project_root) = project["folderPath"]
            .as_str()
            .and_then(|path| Path::new(path).canonicalize().ok())
        {
            if let Ok(relative) = target.strip_prefix(&project_root) {
                path_policy::resolve(
                    &project_root,
                    &relative.to_string_lossy().replace('\\', "/"),
                )?;
            }
        }
    }
    if let Ok(private) = api.app_data_dir.canonicalize() {
        if target.starts_with(private) && !target.starts_with(root) {
            return Err(
                "La exportación no puede escribir sobre el estado privado de la aplicación".into(),
            );
        }
    }
    Ok(Destination {
        base: destination_hash(&target)?,
        path: target,
        parent,
    })
}

enum Input {
    Markdown {
        markdown: String,
        diagrams: Vec<knownext_docs::DiagramAsset>,
        images: Vec<knownext_docs::ExportImageAsset>,
        template: Value,
    },
    Handwritten {
        content: Value,
        page_id: Option<String>,
    },
}
pub(super) struct PreparedExport {
    kind: Kind,
    id: String,
    project: String,
    root: PathBuf,
    source: PathBuf,
    name: String,
    format: String,
    input: Input,
    destination: Option<Destination>,
}
pub(super) struct CompletedExport {
    prepared: PreparedExport,
    content_type: String,
    filename: String,
    bytes: Vec<u8>,
}
impl LocalApi {
    pub(super) fn prepare_export(
        &self,
        kind: Kind,
        id: &str,
        body: Value,
        to_file: bool,
    ) -> Result<PreparedExport, String> {
        let profile=self.export_profile(body["profileId"].as_str())?;
        let (project, relative) = document_ref(id)?;
        let root = self
            .project_root(&project)?
            .canonicalize()
            .map_err(|_| "El proyecto de origen no está disponible")?;
        let source = self.resolve_project_relative(&project, &relative)?;
        let name = source
            .file_name()
            .and_then(|name| name.to_str())
            .ok_or("Nombre de documento no válido")?
            .to_string();
        let format = body["format"]
            .as_str()
            .unwrap_or(if to_file && matches!(kind, Kind::Markdown) {
                "md"
            } else {
                "pdf"
            })
            .to_string();
        let input = match kind {
            Kind::Markdown => {
                if !is_markdown_path(&source) || !matches!(format.as_str(), "md" | "pdf" | "docx") {
                    return Err(
                        "Formato o documento Markdown no compatible con la exportación".into(),
                    );
                }
                let mut markdown = if let Some(text) = body["markdown"].as_str() {
                    text.to_string()
                } else {
                    let disk = String::from_utf8(bounded_read(&source, MAX_INPUT)?)
                        .map_err(|_| "El documento no es texto UTF-8")?;
                    self.read_draft(id)?
                        .and_then(|draft| draft["markdown"].as_str().map(str::to_string))
                        .unwrap_or(disk)
                };
                if markdown.len() as u64 > MAX_INPUT {
                    return Err("El texto de exportación supera 64 MiB".into());
                }
                let images = if format == "md" {
                    Vec::new()
                } else {
                    self.export_image_assets_checked(id, &markdown)?
                };
                if let Some(assets) = body["diagramAssets"].as_array() {
                    let mut total = 0usize;
                    if assets.len() > 128 {
                        return Err("Demasiados diagramas en la exportación".into());
                    }
                    for asset in assets {
                        total = total.saturating_add(asset.to_string().len());
                        if total > 64 * 1024 * 1024 {
                            return Err("Los diagramas de exportación superan 64 MiB".into());
                        }
                    }
                }
                let mut template=profile.as_ref().map(|p|p.style.clone()).unwrap_or(self.read_export_template_checked()?);
                if let Some(profile)=&profile{markdown=export_profiles::decorate(&name,&markdown,profile);if profile.cover{template["document"]["includeTitle"]=json!(false);}}
                Input::Markdown {
                    markdown,
                    diagrams: knownext_docs::diagram_assets_from_json(body.get("diagramAssets")),
                    images,
                    template,
                }
            }
            Kind::Handwritten => {
                if !is_handwritten_note_path(&source)
                    || !matches!(format.as_str(), "knote" | "pdf" | "png" | "svg")
                {
                    return Err("Formato o nota a mano no compatible con la exportación".into());
                }
                let content = if body["content"].is_object() {
                    body["content"].clone()
                } else {
                    let disk: Value = serde_json::from_slice(&bounded_read(&source, MAX_INPUT)?)
                        .map_err(|_| "La nota no contiene JSON válido")?;
                    self.read_draft(id)?
                        .and_then(|draft| draft.get("content").cloned())
                        .unwrap_or(disk)
                };
                if serde_json::to_vec(&content)
                    .map_err(|_| "No se puede comprobar la nota")?
                    .len() as u64
                    > MAX_INPUT
                {
                    return Err("La nota de exportación supera 64 MiB".into());
                }
                let content = normalize_handwritten_note(content, id, &name);
                ai_results::validate_handwritten(&content)?;
                Input::Handwritten {
                    content,
                    page_id: body["pageId"].as_str().map(str::to_string),
                }
            }
        };
        let output = if to_file {
            Some(destination(
                self,
                &source,
                &root,
                &format,
                body["outputPath"].as_str().ok_or("Falta outputPath")?,
            )?)
        } else {
            None
        };
        Ok(PreparedExport {
            kind,
            id: id.into(),
            project,
            root,
            source,
            name,
            format,
            input,
            destination: output,
        })
    }
    pub(super) fn export_image_assets_checked(
        &self,
        id: &str,
        markdown: &str,
    ) -> Result<Vec<knownext_docs::ExportImageAsset>, String> {
        let (project, relative) = document_ref(id)?;
        let references = markdown_image_references(markdown, &project, id, &relative, &relative);
        let mut assets = Vec::new();
        let mut seen = BTreeSet::new();
        let mut budget = MAX_INPUT;
        for reference in references {
            let source = reference["rawTarget"].as_str().unwrap_or("").trim();
            if source.is_empty() || !seen.insert(source.to_string()) {
                continue;
            }
            if seen.len() > 128 {
                return Err("La exportación admite hasta 128 recursos raster distintos".into());
            }
            let (content_type, bytes) = if source.starts_with("data:") {
                if source.len() > 16 * 1024 * 1024 {
                    return Err("Una imagen incrustada supera el límite de exportación".into());
                }
                image_data_url_bytes(source)
                    .ok_or("La imagen incrustada no tiene un formato raster compatible")?
            } else {
                let relative = reference["resolvedAssetPath"].as_str().ok_or_else(|| {
                    format!("La imagen no está disponible como recurso local: {source}")
                })?;
                let path = self.resolve_project_relative(&project, relative)?;
                if !is_exportable_raster_image_path(&path) {
                    return Err("El recurso no es una imagen raster compatible".into());
                }
                (
                    image_content_type(&path).to_string(),
                    bounded_read(&path, budget.min(12 * 1024 * 1024))?,
                )
            };
            if bytes.len() as u64 > budget {
                return Err("Los recursos de exportación superan 64 MiB".into());
            }
            budget -= bytes.len() as u64;
            assets.push(knownext_docs::ExportImageAsset {
                source: source.into(),
                alt: reference["altText"].as_str().map(str::to_string),
                content_type,
                bytes,
            });
        }
        Ok(assets)
    }
}
impl PreparedExport {
    pub(super) fn render(self) -> Result<CompletedExport, String> {
        let (content_type, filename, bytes) = match &self.input {
            Input::Markdown {
                markdown,
                diagrams,
                images,
                template,
            } => {
                if self.format != "md" {
                    knownext_docs::validate_export_image_layout(markdown, images)?;
                }
                export_bytes(
                    &self.name,
                    markdown,
                    &self.format,
                    diagrams,
                    images,
                    template,
                )?
            }
            Input::Handwritten { content, page_id } => match self.format.as_str() {
                "knote" => (
                    "application/vnd.knownext.handwritten-note+json".into(),
                    with_extension(&self.name, "knote"),
                    serde_json::to_vec_pretty(content).map_err(|error| error.to_string())?,
                ),
                "pdf" => (
                    "application/pdf".into(),
                    with_extension(&self.name, "pdf"),
                    knownext_docs::handwritten_note_pdf(content)?,
                ),
                "png" => (
                    "image/png".into(),
                    with_extension(&self.name, "png"),
                    knownext_docs::handwritten_note_png(content, page_id.as_deref(), 1.5)?.1,
                ),
                "svg" => (
                    "image/svg+xml".into(),
                    with_extension(&self.name, "svg"),
                    knownext_docs::handwritten_note_svg(content, page_id.as_deref())?
                        .1
                        .into_bytes(),
                ),
                _ => return Err("Formato de nota a mano no soportado".into()),
            },
        };
        Ok(CompletedExport {
            prepared: self,
            content_type,
            filename,
            bytes,
        })
    }
}
impl CompletedExport {
    pub(super) fn content(self) -> LocalApiContentResponse {
        binary(200, self.content_type, Some(self.filename), self.bytes)
    }
    pub(super) fn publish(self, api: &LocalApi) -> Result<Value, String> {
        let work = self.prepared;
        let target = work
            .destination
            .ok_or("La exportación no tiene destino de archivo")?;
        if api
            .project_root(&work.project)?
            .canonicalize()
            .ok()
            .as_ref()
            != Some(&work.root)
        {
            return Err("La ubicación del proyecto cambió durante la exportación; no se ha escrito el archivo".into());
        }
        let checked = destination(
            api,
            &work.source,
            &work.root,
            &work.format,
            &target.path.to_string_lossy(),
        )?;
        if checked.parent != target.parent || checked.base != target.base {
            return Err("El destino cambió mientras se convertía el documento. Se conserva sin sobrescribir".into());
        }
        match target.base {
            Some(_) => atomic_io::write(&target.path, &self.bytes),
            None => atomic_io::create(&target.path, &self.bytes),
        }
        .map_err(|error| format!("No se pudo publicar la exportación: {error}"))?;
        Ok(
            json!({"documentId":if matches!(work.kind,Kind::Markdown){Some(&work.id)}else{None},"noteId":if matches!(work.kind,Kind::Handwritten){Some(&work.id)}else{None},"format":work.format,"outputPath":target.path,"exportedAt":knownext_core::now_iso()}),
        )
    }
}
pub fn dispatch_export(
    mutations: &Mutex<LocalApi>,
    queue: &Mutex<()>,
    path: &str,
    body: Value,
) -> ApiResult {
    dispatch_export_with(mutations, queue, path, body, PreparedExport::render)
}
fn dispatch_export_with(
    mutations: &Mutex<LocalApi>,
    queue: &Mutex<()>,
    path: &str,
    body: Value,
    render: impl FnOnce(PreparedExport) -> Result<CompletedExport, String>,
) -> ApiResult {
    let _work = queue
        .lock()
        .map_err(|_| "La cola de exportación no está disponible")?;
    let (kind, id) = route(path, false).ok_or("Ruta de exportación no válida")?;
    let work = mutations
        .lock()
        .map_err(|_| "No se puede preparar la exportación")?
        .prepare_export(kind, &id, body, true)?;
    let completed = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| render(work)))
        .map_err(|_| "La conversión se interrumpió; el destino no se ha sustituido")??;
    let api = mutations
        .lock()
        .map_err(|_| "No se puede publicar la exportación")?;
    ok(completed.publish(&api)?)
}
pub fn dispatch_export_content(
    mutations: &Mutex<LocalApi>,
    queue: &Mutex<()>,
    path: &str,
    body: Value,
) -> Result<LocalApiContentResponse, String> {
    let _work = queue
        .lock()
        .map_err(|_| "La cola de exportación no está disponible")?;
    let (kind, id) = route(path, true).ok_or("Ruta de contenido de exportación no válida")?;
    let work = mutations
        .lock()
        .map_err(|_| "No se puede preparar el contenido de exportación")?
        .prepare_export(kind, &id, body, false)?;
    Ok(
        std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| work.render()))
            .map_err(|_| "La conversión se interrumpió sin producir un archivo exportado")??
            .content(),
    )
}

/// A private conversion result retained until the platform picker/write finishes.
/// This is not serialized to React; no URI or arbitrary source path is accepted.
pub struct StagedUserExport {
    pub path: PathBuf,
    pub filename: String,
    pub content_type: String,
    _temporary: tempfile::TempDir,
}
pub fn stage_export_content(
    mutations: &Mutex<LocalApi>,
    queue: &Mutex<()>,
    path: &str,
    body: Value,
    cache: &Path,
) -> Result<StagedUserExport, String> {
    let converted = dispatch_export_content(mutations, queue, path, body)?;
    stage_user_export(converted, cache)
}
pub(crate) fn stage_user_export(converted: LocalApiContentResponse, cache: &Path) -> Result<StagedUserExport, String> {
    if converted.data_base64.len() > 180 * 1024 * 1024 {
        return Err("La exportación supera el presupuesto de entrega de 128 MiB".into());
    }
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(converted.data_base64)
        .map_err(|_| "No se puede preparar la entrega del archivo")?;
    if bytes.len() > 128 * 1024 * 1024 {
        return Err(
            "La exportación supera 128 MiB; conserva el documento original y reduce sus recursos"
                .into(),
        );
    }
    stage_user_export_bytes(&bytes,converted.filename.ok_or("La exportación no incluye nombre de archivo")?,converted.content_type,cache)
}
/// Rust-owned bytes are staged directly; recovery archives need no base64 roundtrip.
pub(crate) fn stage_user_export_bytes(bytes:&[u8],filename:String,content_type:String,cache:&Path)->Result<StagedUserExport,String>{
    if bytes.len()>128*1024*1024{return Err("La entrega supera128MiB; se conserva el origen".into());}
    let root = cache.join("knownext-exports");
    for folder in [cache, &root] {
        if let Ok(meta) = fs::symlink_metadata(folder) {
            if !meta.is_dir() || batch::linked(&meta) {
                return Err("La carpeta temporal de exportación no es segura".into());
            }
        }
    }
    fs::create_dir_all(&root).map_err(|_| "No se puede conservar temporalmente la exportación")?;
    let temporary = tempfile::Builder::new()
        .prefix("job-")
        .tempdir_in(root)
        .map_err(|_| "No se puede preparar un destino temporal exclusivo")?;
    if Path::new(&filename).file_name().and_then(|name|name.to_str())!=Some(filename.as_str())||filename.contains(['/','\\']){return Err("El nombre de entrega no es compatible".into());}
    let extension = Path::new(&filename)
        .extension()
        .and_then(|ext| ext.to_str())
        .ok_or("La exportación no incluye formato de archivo")?;
    if !matches!(extension, "pdf" | "md" | "docx" | "knote" | "png" | "svg" | "json" | "zip") {
        return Err("Formato de entrega no compatible".into());
    }
    let path = temporary.path().join(format!("payload.{extension}"));
    atomic_io::create(&path, bytes)
        .map_err(|_| "No se pudo conservar el resultado convertido para su entrega")?;
    Ok(StagedUserExport {
        path,
        filename,
        content_type,
        _temporary: temporary,
    })
}

/// File-based delivery avoids a base64 copy of project archives in the WebView.
pub(crate) fn stage_user_export_file(source: &Path, filename: String, cache: &Path) -> Result<StagedUserExport,String> {
    let root=cache.join("knownext-exports");
    for folder in [cache,&root] {if let Ok(meta)=fs::symlink_metadata(folder){if !meta.is_dir()||batch::linked(&meta){return Err("La carpeta temporal de entrega no es regular".into());}}}
    fs::create_dir_all(&root).map_err(|_| "No se puede preparar la entrega privada")?;
    let temporary=tempfile::Builder::new().prefix("job-").tempdir_in(root).map_err(|_| "No se puede reservar una entrega exclusiva")?;
    let path=temporary.path().join("payload.zip");
    let meta=fs::symlink_metadata(source).map_err(|_| "El paquete preparado no está disponible")?;
    if !meta.is_file()||batch::linked(&meta)||meta.len()>512*1024*1024{return Err("El paquete preparado no es regular o supera 512 MiB".into());}
    let mut input=fs::File::open(source).map_err(|_| "No se puede leer el paquete preparado")?.take(512*1024*1024+1);
    let mut output=fs::OpenOptions::new().write(true).create_new(true).open(&path).map_err(|_| "No se puede reservar el archivo de entrega")?;
    let count=std::io::copy(&mut input,&mut output).map_err(|_| "No se pudo preparar el paquete completo")?;
    if count!=meta.len(){return Err("El paquete cambió al preparar la entrega".into());}
    output.sync_all().map_err(|_| "No se pudo confirmar la preparación de entrega")?;
    Ok(StagedUserExport{path,filename,content_type:"application/zip".into(),_temporary:temporary})
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{mpsc, Arc};
    struct Fixture {
        _dir: tempfile::TempDir,
        api: LocalApi,
        project: String,
        id: String,
        root: PathBuf,
        output: PathBuf,
    }
    fn fixture() -> Fixture {
        let dir = tempfile::tempdir().unwrap();
        let api = LocalApi::new(dir.path().join("state"), "test".into(), "test".into());
        let root = dir.path().join("project");
        let project = api
            .create_project(json!({"name":"Export QA","folderPath":root,"versioningMode":"none"}))
            .unwrap()["id"]
            .as_str()
            .unwrap()
            .to_string();
        fs::write(root.join("a.md"), "# Source\nOriginal").unwrap();
        fs::write(root.join("b.md"), "# Other").unwrap();
        let id = doc_id(&project, "a.md");
        let output = dir.path().join("copy.md");
        Fixture {
            _dir: dir,
            api,
            project,
            id,
            root,
            output,
        }
    }
    #[test]
    fn conversion_does_not_hold_document_authority_and_captures_the_clicked_snapshot() {
        let f = fixture();
        let mutations = Arc::new(Mutex::new(f.api.clone()));
        let queue = Arc::new(Mutex::new(()));
        let path = format!("/api/documents/{}/export", f.id);
        let (started_tx, started_rx) = mpsc::channel();
        let (release_tx, release_rx) = mpsc::channel();
        let worker_api = mutations.clone();
        let worker_queue = queue.clone();
        let output = f.output.clone();
        let worker = thread::spawn(move || {
            dispatch_export_with(
                &worker_api,
                &worker_queue,
                &path,
                json!({"format":"md","outputPath":output,"markdown":"# Clicked RAM snapshot"}),
                |work| {
                    started_tx.send(()).unwrap();
                    release_rx.recv_timeout(Duration::from_secs(5)).unwrap();
                    work.render()
                },
            )
        });
        started_rx.recv_timeout(Duration::from_secs(5)).unwrap();
        let api = mutations
            .try_lock()
            .expect("conversion retained mutation authority");
        let id = doc_id(&f.project, "b.md");
        api.handle("PUT",&format!("/api/documents/{id}"),json!({"markdown":"# Saved during conversion","baseFingerprint":api.fingerprint(&f.root.join("b.md"))}),vec![]).unwrap();
        drop(api);
        release_tx.send(()).unwrap();
        assert_eq!(worker.join().unwrap().unwrap().status, 200);
        assert_eq!(
            fs::read_to_string(f.output).unwrap(),
            "# Clicked RAM snapshot"
        );
        assert_eq!(
            fs::read_to_string(f.root.join("a.md")).unwrap(),
            "# Source\nOriginal"
        );
    }
    #[test]
    fn changed_new_and_existing_destinations_are_never_overwritten() {
        let f = fixture();
        for existing in [false, true] {
            if existing {
                fs::write(&f.output, "Old export").unwrap();
            } else {
                let _ = fs::remove_file(&f.output);
            }
            let work = f
                .api
                .prepare_export(
                    Kind::Markdown,
                    &f.id,
                    json!({"format":"md","outputPath":f.output,"markdown":"Export snapshot"}),
                    true,
                )
                .unwrap();
            let completed = work.render().unwrap();
            fs::write(&f.output, "New work at destination").unwrap();
            assert!(completed.publish(&f.api).is_err());
            assert_eq!(
                fs::read_to_string(&f.output).unwrap(),
                "New work at destination"
            );
        }
    }
    #[test]
    fn invalid_format_source_destination_and_private_state_are_rejected_before_conversion() {
        let f = fixture();
        for body in [
            json!({"format":"md","outputPath":f.root.join("a.md")}),
            json!({"format":"invalid","outputPath":f.output}),
            json!({"format":"pdf","outputPath":f.output}),
            json!({"format":"md","outputPath":f.api.app_data_dir.join("state.md")}),
            json!({"format":"md","outputPath":f.root.join(".git/hidden.md")}),
        ] {
            assert!(f
                .api
                .prepare_export(Kind::Markdown, &f.id, body, true)
                .is_err());
        }
        assert!(f
            .api
            .prepare_export(Kind::Handwritten, &f.id, json!({"format":"pdf"}), false)
            .is_err());
        assert_eq!(
            fs::read_to_string(f.root.join("a.md")).unwrap(),
            "# Source\nOriginal"
        );
    }
    #[test]
    fn render_failure_or_project_repointing_keeps_the_destination_and_queue_usable() {
        let f = fixture();
        fs::write(&f.output, "Keep previous export").unwrap();
        let mutations = Mutex::new(f.api.clone());
        let queue = Mutex::new(());
        let result = dispatch_export_with(
            &mutations,
            &queue,
            &format!("/api/documents/{}/export", f.id),
            json!({"format":"md","outputPath":f.output}),
            |_| panic!("Controlled conversion interruption"),
        );
        assert!(result.is_err());
        assert!(queue.try_lock().is_ok());
        assert!(mutations.try_lock().is_ok());
        assert_eq!(
            fs::read_to_string(&f.output).unwrap(),
            "Keep previous export"
        );
        let completed = f
            .api
            .prepare_export(
                Kind::Markdown,
                &f.id,
                json!({"format":"md","outputPath":f.output}),
                true,
            )
            .unwrap()
            .render()
            .unwrap();
        f.api.delete_project(&f.project).unwrap();
        assert!(completed.publish(&f.api).is_err());
        assert_eq!(
            fs::read_to_string(f.output).unwrap(),
            "Keep previous export"
        );
    }
    #[test]
    fn missing_images_and_oversized_inputs_fail_without_an_abbreviated_export() {
        let f = fixture();
        fs::write(&f.output, "Keep previous export").unwrap();
        assert!(f
            .api
            .prepare_export(
                Kind::Markdown,
                &f.id,
                json!({"format":"pdf","markdown":"# Source\n\n![Missing](missing.png)"}),
                false
            )
            .is_err());
        assert!(f.api.prepare_export(Kind::Markdown,&f.id,json!({"format":"docx","markdown":"![External](https://example.invalid/image.png)"}),false).is_err());
        let huge = f.root.join("huge.png");
        fs::File::create(&huge)
            .unwrap()
            .set_len(12 * 1024 * 1024 + 1)
            .unwrap();
        assert!(f
            .api
            .prepare_export(
                Kind::Markdown,
                &f.id,
                json!({"format":"pdf","markdown":"![Huge](huge.png)"}),
                false
            )
            .is_err());
        assert_eq!(
            fs::read_to_string(f.output).unwrap(),
            "Keep previous export"
        );
    }
    #[test]
    fn checked_content_exports_markdown_pdf_and_handwritten_without_writing_a_target() {
        let f = fixture();
        let md = dispatch_export_content(
            &Mutex::new(f.api.clone()),
            &Mutex::new(()),
            &format!("/api/documents/{}/export/content", f.id),
            json!({"format":"md","markdown":"# RAM snapshot"}),
        )
        .unwrap();
        assert_eq!(
            base64::engine::general_purpose::STANDARD
                .decode(md.data_base64)
                .unwrap(),
            b"# RAM snapshot"
        );
        let pdf = f
            .api
            .prepare_export(
                Kind::Markdown,
                &f.id,
                json!({"format":"pdf","markdown":"# Inicio\n\nÚltima línea completa."}),
                false,
            )
            .unwrap()
            .render()
            .unwrap()
            .content();
        assert_eq!(pdf.content_type, "application/pdf");
        assert!(
            base64::engine::general_purpose::STANDARD
                .decode(pdf.data_base64)
                .unwrap()
                .len()
                > 2000
        );
        let created = f
            .api
            .create_handwritten_note(&f.project, json!({"name":"export.knote"}))
            .unwrap();
        let id = created["node"]["id"].as_str().unwrap();
        let knote = f
            .api
            .prepare_export(Kind::Handwritten, id, json!({"format":"knote"}), false)
            .unwrap()
            .render()
            .unwrap()
            .content();
        assert!(knote.content_type.contains("handwritten-note"));
        assert!(!f.output.exists());
    }
    #[test]
    fn platform_delivery_keeps_private_staging_until_ack_and_cleans_it_afterwards() {
        let f = fixture();
        let mutations = Mutex::new(f.api.clone());
        let queue = Mutex::new(());
        let cache = f._dir.path().join("cache");
        let staged = stage_export_content(
            &mutations,
            &queue,
            &format!("/api/documents/{}/export/content", f.id),
            json!({"format":"md","markdown":"# Native delivery snapshot"}),
            &cache,
        )
        .unwrap();
        let path = staged.path.clone();
        assert!(path.starts_with(cache.join("knownext-exports")));
        assert_eq!(
            fs::read_to_string(&path).unwrap(),
            "# Native delivery snapshot"
        );
        assert_eq!(staged.filename, "a.md");
        drop(staged);
        assert!(!path.exists());
        assert_eq!(
            fs::read_to_string(f.root.join("a.md")).unwrap(),
            "# Source\nOriginal"
        );
        assert!(
            stage_export_content(&mutations, &queue, "/api/config", json!({}), &cache).is_err()
        );
    }
}

impl CompletedExport{pub(super) fn batch_payload(self)->(String,String,Vec<u8>){(self.filename,self.content_type,self.bytes)}}

impl PreparedExport{pub(super) fn batch_markdown(&self)->Option<&str>{if let Input::Markdown{markdown,..}=&self.input{Some(markdown)}else{None}}}

impl PreparedExport{pub(super) fn batch_footprint(&self)->Result<u64,String>{Ok(match &self.input{Input::Markdown{markdown,diagrams,images,..}=>{if self.format!="md"&&knownext_docs::export_diagram_count(markdown)!=diagrams.len(){return Err("Faltan diagramas renderizados; no se prepara un lote incompleto".into());}markdown.len()as u64+diagrams.iter().map(|d|d.png.len()as u64).sum::<u64>()+images.iter().map(|d|d.bytes.len()as u64).sum::<u64>()},Input::Handwritten{content,..}=>serde_json::to_vec(content).map_err(|_|"Nota no representable")?.len()as u64})}}
