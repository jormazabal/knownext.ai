//! Bounded saved-file catalogue and connected references. No index, provider or mutation.
use super::*;
use std::{fs, io::Read, time::Instant};
const MAX_ENTRIES: usize = 10_000;
const MAX_ITEMS: usize = 2_000;
const MAX_LINKS: usize = 10_000;
const MAX_MARKDOWN: u64 = 2 * 1024 * 1024;
const MAX_READ: u64 = 64 * 1024 * 1024;
const MAX_TEXT: usize = 2 * 1024 * 1024;
const MAX_DETAILS: usize = 200;
const MAX_PATH: usize = 4096;
fn private_name(name: &str) -> bool {
    let name = name.trim_end_matches(['.', ' ']).to_ascii_lowercase();
    name.starts_with('.')
        || matches!(
            name.as_str(),
            "owner.lock"
                | "runtime-owner.lock"
                | "capture.lock"
                | "node_modules"
                | "target"
                | "dist"
        )
}
fn private_path(relative: &str) -> bool {
    relative.len() > MAX_PATH || relative.replace('\\', "/").split('/').any(private_name)
}
fn safe_path(root: &Path, relative: &str) -> Result<PathBuf, String> {
    if relative.is_empty() || private_path(relative) {
        return Err("Ruta privada o fuera de límite; no se consulta".into());
    }
    let lexical = PathBuf::from(relative.replace('/', std::path::MAIN_SEPARATOR_STR));
    if lexical.is_absolute()
        || lexical
            .components()
            .any(|c| !matches!(c, std::path::Component::Normal(_)))
    {
        return Err("La ruta no pertenece al catálogo del proyecto".into());
    }
    let mut current = root.to_path_buf();
    for part in lexical.components() {
        current.push(part);
        match fs::symlink_metadata(&current) {
            Ok(m) if batch::linked(&m) => return Err("La ruta enlazada no se consulta".into()),
            Ok(_) => (),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => break,
            Err(_) => return Err("La ruta no es accesible".into()),
        }
    }
    path_policy::resolve(root, relative)
}
// Existing paths use filesystem spelling rather than case folding (Linux can contain distinct files).
fn existing_relative(root: &Path, relative: &str) -> Result<String, String> {
    let path = safe_path(root, relative)?;
    let canonical = match path.canonicalize() {
        Ok(path) => path,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(relative.into()),
        Err(_) => return Err("No se puede verificar la identidad del recurso".into()),
    };
    let base = root.canonicalize().map_err(|_| "Proyecto no disponible")?;
    let relative = canonical
        .strip_prefix(&base)
        .map_err(|_| "Recurso fuera del proyecto")?
        .to_string_lossy()
        .replace('\\', "/");
    if private_path(&relative) {
        return Err("Ruta privada excluida".into());
    }
    Ok(relative)
}
fn kind(path: &str, folder: bool) -> &'static str {
    if folder {
        "folder"
    } else if is_markdown_path(Path::new(path)) {
        "document"
    } else if is_handwritten_note_path(Path::new(path)) {
        "handwritten-note"
    } else if is_image_path(Path::new(path)) {
        "image"
    } else if matches!(extension(path).as_str(), "pdf" | "docx" | "xlsx") {
        "reference-document"
    } else {
        "attachment"
    }
}
fn extension(path: &str) -> String {
    Path::new(path)
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_ascii_lowercase()
}
fn capability(path: &str) -> &'static str {
    match extension(path).as_str() {
        "md" | "markdown" | "txt" | "csv" | "tsv" | "json" | "yaml" | "yml" | "log" => "plain",
        "pdf" => "pdf",
        "docx" | "xlsx" => "office",
        "knote" => "note",
        _ => "none",
    }
}
fn target(p: &str, root: &Path, relative: &str) -> Value {
    let path = safe_path(root, relative);
    let metadata = path
        .as_ref()
        .ok()
        .and_then(|p| fs::symlink_metadata(p).ok());
    let status = match &path {
        Err(_) => "blocked",
        Ok(_) if metadata.as_ref().is_some_and(|m| m.is_file() || m.is_dir()) => "available",
        _ => "missing",
    };
    json!({"id":doc_id(p,relative),"projectId":p,"name":relative.rsplit('/').next().unwrap_or(relative),"path":relative,"kind":kind(relative,metadata.as_ref().is_some_and(|m|m.is_dir())),"status":status})
}
fn bounded(path: &Path, max: u64) -> Result<Vec<u8>, String> {
    let meta = fs::symlink_metadata(path).map_err(|_| "Archivo no disponible")?;
    if !meta.is_file() || batch::linked(&meta) || meta.len() > max {
        return Err(format!(
            "Archivo no regular o mayor de{}MiB",
            max / (1024 * 1024)
        ));
    }
    let mut bytes = vec![];
    fs::File::open(path)
        .map_err(|_| "No se pudo leer el archivo")?
        .take(max + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| "Lectura incompleta")?;
    if bytes.len() as u64 > max {
        return Err("El archivo creció fuera del límite; no se trunca".into());
    }
    Ok(bytes)
}
struct Graph {
    items: BTreeMap<String, Value>,
    links: Vec<Value>,
    warnings: Vec<String>,
    limited: bool,
    visited: usize,
    read: u64,
    documents: usize,
}
impl Graph {
    fn warn(&mut self, message: String) {
        if self.warnings.len() < 50 {
            self.warnings.push(message)
        } else {
            self.limited = true;
        }
    }
}
fn external(raw: &str) -> bool {
    let l = raw.to_ascii_lowercase();
    l.starts_with("http://") || l.starts_with("https://")
}
fn resolved(p: &str, source: &str, raw: &str) -> Option<String> {
    if raw.starts_with('#') {
        return Some(source.into());
    }
    if let Some(rest) = raw
        .strip_prefix("http://knownext-asset.localhost/")
        .or_else(|| raw.strip_prefix("https://knownext-asset.localhost/"))
    {
        let (owner, asset) = rest.split_once('/')?;
        if knownext_core::percent_decode(owner) != p {
            return None;
        }
        let decoded =
            knownext_core::percent_decode(asset.split(['?', '#']).next().unwrap_or(asset));
        return Some(
            decoded
                .strip_prefix(&format!("{p}::"))
                .unwrap_or(&decoded)
                .replace('\\', "/"),
        );
    }
    document_links::local_target(source, raw)
}
fn graph(api: &LocalApi, p: &str) -> Result<Graph, String> {
    let root = api
        .project_root(p)?
        .canonicalize()
        .map_err(|_| "Proyecto no disponible")?;
    let mut g = Graph {
        items: BTreeMap::new(),
        links: vec![],
        warnings: vec![],
        limited: false,
        visited: 0,
        read: 0,
        documents: 0,
    };
    let mut dirs = vec![root.clone()];
    let started = Instant::now();
    let mut link_bytes = 0usize;
    'walk: while let Some(dir) = dirs.pop() {
        if started.elapsed() > Duration::from_secs(2) {
            g.limited = true;
            break;
        }
        let entries = match fs::read_dir(&dir) {
            Ok(v) => v,
            Err(_) => {
                g.warn(format!(
                    "{}: carpeta no accesible",
                    relative_from_root(&root, &dir)
                ));
                continue;
            }
        };
        for entry in entries {
            g.visited += 1;
            if g.visited > MAX_ENTRIES
                || g.items.len() >= MAX_ITEMS
                || started.elapsed() > Duration::from_secs(2)
            {
                g.limited = true;
                break 'walk;
            }
            let e = match entry {
                Ok(v) => v,
                Err(_) => {
                    g.warn("Entrada no consultable".into());
                    continue;
                }
            };
            let name = e.file_name().to_string_lossy().into_owned();
            if private_name(&name) {
                continue;
            }
            let path = e.path();
            let relative = relative_from_root(&root, &path);
            if relative.len() > MAX_PATH {
                g.warn("Una ruta supera4096bytes y permanece fuera de la consulta".into());
                continue;
            }
            let meta = match fs::symlink_metadata(&path) {
                Ok(m) => m,
                Err(_) => {
                    g.warn(format!("{relative}: no accesible"));
                    continue;
                }
            };
            if batch::linked(&meta) {
                g.warn(format!("{relative}: enlace de sistema excluido"));
                continue;
            }
            if meta.is_dir() {
                dirs.push(path);
                continue;
            }
            if !meta.is_file() {
                continue;
            }
            let t = target(p, &root, &relative);
            g.items.insert(relative.clone(),json!({"target":t,"extension":extension(&relative),"sizeBytes":meta.len(),"textCapability":capability(&relative),"incomingCount":0,"outgoingCount":0}));
            if !is_markdown_path(&path) {
                continue;
            }
            if meta.len() > MAX_MARKDOWN {
                g.warn(format!(
                    "{relative}: Markdown supera2MiB, enlaces no revisados"
                ));
                continue;
            }
            if g.read + meta.len() > MAX_READ {
                g.limited = true;
                continue;
            }
            let validated = match safe_path(&root, &relative) {
                Ok(path) => path,
                Err(message) => {
                    g.warn(format!("{relative}: {message}"));
                    continue;
                }
            };
            let raw = match bounded(&validated, MAX_MARKDOWN) {
                Ok(v) => v,
                Err(e) => {
                    g.warn(format!("{relative}: {e}"));
                    continue;
                }
            };
            g.read += raw.len() as u64;
            if g.read > MAX_READ {
                g.limited = true;
                continue;
            }
            let text = match String::from_utf8(raw) {
                Ok(v) => v,
                Err(_) => {
                    g.warn(format!(
                        "{relative}: UTF-8 no legible; no se interpreta como documento sin enlaces"
                    ));
                    continue;
                }
            };
            g.documents += 1;
            let source = target(p, &root, &relative);
            let (mut cursor, mut line, mut column) = (0usize, 1usize, 1usize);
            for span in knownext_docs::markdown_destinations(&text) {
                if g.links.len() >= MAX_LINKS || started.elapsed() > Duration::from_secs(2) {
                    g.limited = true;
                    break;
                }
                if span.target.len() > 8192 {
                    g.warn(format!("{relative}: destino de más de8KiB excluido"));
                    continue;
                }
                link_bytes = link_bytes.saturating_add(span.target.len() + relative.len());
                if link_bytes > 8 * 1024 * 1024 {
                    g.limited = true;
                    break;
                }
                let dest = resolved(p, &relative, &span.target)
                    .map(|relative| existing_relative(&root, &relative).unwrap_or(relative));
                let target = dest.as_ref().map(|d| target(p, &root, d));
                let external = target.is_none()
                    && external(&span.target)
                    && !span
                        .target
                        .to_ascii_lowercase()
                        .contains("knownext-asset.localhost");
                for ch in text[cursor..span.range.start].chars() {
                    if ch == '\n' {
                        line += 1;
                        column = 1;
                    } else {
                        column += 1;
                    }
                }
                cursor = span.range.start;
                g.links.push(json!({"source":source,"target":target,"rawTarget":span.target,"line":line,"column":column,"external":external,"image":span.is_image}));
            }
        }
    }
    let targets = g
        .links
        .iter()
        .filter_map(|r| r["target"]["path"].as_str().map(str::to_owned))
        .collect::<BTreeSet<_>>();
    for relative in targets {
        if started.elapsed() > Duration::from_secs(2) {
            g.limited = true;
            break;
        }
        if !g.items.contains_key(&relative) {
            if g.items.len() >= MAX_ITEMS {
                g.limited = true;
                break;
            }
            let t = target(p, &root, &relative);
            g.items.insert(relative.clone(),json!({"target":t,"extension":extension(&relative),"sizeBytes":null,"textCapability":capability(&relative),"incomingCount":0,"outgoingCount":0}));
        }
    }
    for link in &g.links {
        if let Some(item) = g
            .items
            .get_mut(link["source"]["path"].as_str().unwrap_or(""))
        {
            item["outgoingCount"] = json!(item["outgoingCount"].as_u64().unwrap_or(0) + 1)
        }
        if let Some(item) = g
            .items
            .get_mut(link["target"]["path"].as_str().unwrap_or(""))
        {
            item["incomingCount"] = json!(item["incomingCount"].as_u64().unwrap_or(0) + 1)
        }
    }
    if api
        .project_root(p)?
        .canonicalize()
        .map_err(|_| "La ubicación cambió durante la consulta")?
        != root
    {
        return Err(
            "La ubicación del proyecto cambió durante la consulta; vuelve a revisar".into(),
        );
    }
    Ok(g)
}
fn owner_relative(p: &str, id: &str) -> Result<String, String> {
    let relative = if id.contains("::") {
        let (owner, path) = document_ref(id)?;
        if owner != p {
            return Err("El recurso pertenece a otro proyecto".into());
        }
        path
    } else {
        id.into()
    };
    if private_path(&relative) || relative.is_empty() {
        return Err("El recurso no pertenece al catálogo público del proyecto".into());
    }
    Ok(relative)
}
impl LocalApi {
    pub(crate) fn project_asset_catalog(&self, p: &str) -> Result<Value, String> {
        let g = graph(self, p)?;
        Ok(
            json!({"schemaVersion":1,"projectId":p,"scope":"saved-files","items":g.items.values().collect::<Vec<_>>(),"complete":!g.limited&&g.warnings.is_empty(),"limited":g.limited,"warnings":g.warnings,"queriedAt":knownext_core::now_iso(),"visitedEntries":g.visited,"scannedDocuments":g.documents,"readBytes":g.read,"startsAi":false,"readOnly":true}),
        )
    }
    pub(crate) fn project_asset_links(&self, p: &str, id: &str) -> Result<Value, String> {
        let relative = owner_relative(p, id)?;
        let root = self.project_root(p)?;
        safe_path(&root, &relative)?;
        let asset = target(p, &root, &relative);
        let folder = asset["kind"] == "folder";
        let identity = existing_relative(&root, &relative)?;
        let prefix = format!("{identity}/");
        let g = graph(self, p)?;
        let incoming = g
            .links
            .iter()
            .filter(|r| {
                r["target"]["path"] == identity
                    || folder
                        && r["target"]["path"]
                            .as_str()
                            .is_some_and(|path| path.starts_with(&prefix))
            })
            .take(MAX_DETAILS + 1)
            .cloned()
            .collect::<Vec<_>>();
        let outgoing = g
            .links
            .iter()
            .filter(|r| {
                r["source"]["path"] == identity
                    || folder
                        && r["source"]["path"]
                            .as_str()
                            .is_some_and(|path| path.starts_with(&prefix))
            })
            .take(MAX_DETAILS + 1)
            .cloned()
            .collect::<Vec<_>>();
        let capped = incoming.len() > MAX_DETAILS || outgoing.len() > MAX_DETAILS;
        Ok(
            json!({"schemaVersion":1,"projectId":p,"asset":asset,"canonicalPath":identity,"includesDescendants":folder,"scope":"saved-markdown","incoming":incoming.into_iter().take(MAX_DETAILS).collect::<Vec<_>>(),"outgoing":outgoing.into_iter().take(MAX_DETAILS).collect::<Vec<_>>(),"complete":!g.limited&&!capped&&g.warnings.is_empty(),"limited":g.limited||capped,"warnings":g.warnings,"queriedAt":knownext_core::now_iso(),"readOnly":true,"startsAi":false}),
        )
    }
    pub(crate) fn project_asset_text(&self, p: &str, id: &str) -> Result<Value, String> {
        let relative = owner_relative(p, id)?;
        let root = self
            .project_root(p)?
            .canonicalize()
            .map_err(|_| "Proyecto no disponible")?;
        let path = safe_path(&root, &relative)?;
        let mut out = json!({"schemaVersion":1,"projectId":p,"asset":target(p,&root,&relative),"scope":"saved-file","status":"unsupported","text":"","pages":[],"sourceSha256":null,"sourceBytes":null,"warnings":[],"queriedAt":knownext_core::now_iso(),"readOnly":true,"startsAi":false});
        let cap = capability(&relative);
        if cap == "none" {
            out["warnings"] = json!([
                "Este formato no tiene extracción de texto integrada; no se ha ejecutado OCR"
            ]);
            return Ok(out);
        }
        let bytes = match bounded(&path, MAX_READ) {
            Ok(v) => v,
            Err(e) => {
                out["status"] = json!("unavailable");
                out["warnings"] = json!([e]);
                return Ok(out);
            }
        };
        let digest = sha256_hex(&bytes);
        out["sourceSha256"] = json!(digest);
        out["sourceBytes"] = json!(bytes.len());
        let extracted: Result<Vec<Value>, String> = match cap {
            "plain" => {
                if bytes.len() > MAX_TEXT {
                    Err("Texto supera2MiB; no se devuelve una versión truncada".into())
                } else {
                    String::from_utf8(bytes.clone())
                        .map(|text| vec![json!({"number":null,"pageId":null,"text":text})])
                        .map_err(|_| "No se pudo extraer como UTF-8".into())
                }
            }
            "office" => knownext_docs::extract_office_body_text_bounded(&bytes, MAX_TEXT)
                .map(|text| vec![json!({"number":null,"pageId":null,"text":text})]),
            "pdf" => knownext_docs::extract_pdf_pages_bounded(&bytes, MAX_TEXT).map(|pages| {
                pages
                    .into_iter()
                    .map(|(number, text)| json!({"number":number,"pageId":null,"text":text}))
                    .collect()
            }),
            "note" => (|| {
                if bytes.len() > MAX_TEXT {
                    return Err("Nota supera2MiB".into());
                }
                let note: Value = serde_json::from_slice(&bytes).map_err(|_| "Nota no legible")?;
                document_validation::handwritten(&note)?;
                let pages=note["pages"].as_array().unwrap().iter().enumerate().map(|(i,page)|json!({"number":i+1,"pageId":page["id"],"text":note["ocr"]["textByPage"][page["id"].as_str().unwrap()].as_str().unwrap_or("")})).collect::<Vec<_>>();
                if pages
                    .iter()
                    .map(|p| p["text"].as_str().unwrap().len())
                    .sum::<usize>()
                    > MAX_TEXT
                {
                    return Err("Texto reconocido supera2MiB".into());
                }
                Ok(pages)
            })(),
            _ => unreachable!(),
        };
        match extracted {
            Ok(pages) => {
                let text = pages
                    .iter()
                    .filter_map(|p| p["text"].as_str())
                    .collect::<Vec<_>>()
                    .join("\n\n");
                if text.len() > MAX_TEXT {
                    out["status"] = json!("limited");
                    out["warnings"] =
                        json!(["El texto agregado supera2MiB; se conserva el original sin truncar"])
                } else {
                    out["status"] = json!(if text.trim().is_empty() {
                        "no-text"
                    } else {
                        "available"
                    });
                    out["text"] = json!(text);
                    out["pages"] = json!(pages);
                    if out["status"] == "no-text" {
                        out["warnings"] = json!([if cap == "note" {
                            "No hay texto OCR revisado en estas páginas; los trazos permanecen"
                        } else {
                            "No se encontró texto extraíble; no se ha ejecutado OCR"
                        }]);
                    }
                }
            }
            Err(e) => {
                out["status"] = json!("unavailable");
                out["warnings"] = json!([e]);
            }
        }
        // The extraction is a snapshot of exact bytes, not permission to serve a stale file as current.
        if root
            != self
                .project_root(p)?
                .canonicalize()
                .map_err(|_| "El proyecto cambió")?
            || bounded(&path, MAX_READ)
                .map(|now| sha256_hex(&now) != digest)
                .unwrap_or(true)
        {
            out["status"] = json!("unavailable");
            out["text"] = json!("");
            out["pages"] = json!([]);
            out["warnings"] = json!(["La fuente cambió durante la extracción; vuelve a consultar"]);
        }
        Ok(out)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn block7_assets_reserved_names_are_rejected_before_metadata() {
        let d = tempfile::tempdir().unwrap();
        for name in [
            "owner.lock",
            "OWNER.LOCK ",
            "runtime-owner.lock",
            "capture.lock",
            ".git/config",
            "target/a.txt",
            "docs/.private/a.txt",
        ] {
            assert!(private_path(name), "{name}");
            assert!(safe_path(d.path(), name).is_err(), "{name}");
        }
        assert!(safe_path(d.path(), "allowed.txt").is_ok());
    }
    #[test]
    fn block7_assets_item_limit_reports_partial_without_deleting_sources() {
        let d = tempfile::tempdir().unwrap();
        let a = LocalApi::new(d.path().join("state"), "qa".into(), "catalogue".into());
        let p = a
            .handle(
                "POST",
                "/api/projects",
                json!({"name":"Limit","versioningMode":"none","syncMode":"none"}),
                vec![],
            )
            .unwrap()
            .body;
        let id = p["id"].as_str().unwrap();
        let root = PathBuf::from(p["folderPath"].as_str().unwrap());
        for n in 0..2001 {
            fs::write(root.join(format!("file-{n:04}.bin")), b"").unwrap()
        }
        let v = a.project_asset_catalog(id).unwrap();
        assert_eq!(v["limited"], true);
        assert_eq!(v["complete"], false);
        assert!(v["items"].as_array().unwrap().len() <= MAX_ITEMS);
        assert!(root.join("file-2000.bin").exists());
    }
    #[test]
    fn block7_assets_future_note_is_not_normalized_or_reported_as_empty() {
        let d = tempfile::tempdir().unwrap();
        let a = LocalApi::new(d.path().join("state"), "qa".into(), "catalogue".into());
        let p = a
            .handle(
                "POST",
                "/api/projects",
                json!({"name":"Future","versioningMode":"none","syncMode":"none"}),
                vec![],
            )
            .unwrap()
            .body;
        let id = p["id"].as_str().unwrap();
        let root = PathBuf::from(p["folderPath"].as_str().unwrap());
        let raw = br#"{"schemaVersion":99,"pages":[],"future":"keep"}"#;
        fs::write(root.join("future.knote"), raw).unwrap();
        let v = a
            .project_asset_text(id, &format!("{id}::future.knote"))
            .unwrap();
        assert_eq!(v["status"], "unavailable");
        assert_eq!(fs::read(root.join("future.knote")).unwrap(), raw);
    }
    #[cfg(windows)]
    #[test]
    fn block7_assets_windows_existing_case_alias_is_one_resource_and_has_real_impact() {
        let d = tempfile::tempdir().unwrap();
        let a = LocalApi::new(d.path().join("state"), "qa".into(), "case".into());
        let p = a
            .handle(
                "POST",
                "/api/projects",
                json!({"name":"Case","versioningMode":"none","syncMode":"none"}),
                vec![],
            )
            .unwrap()
            .body;
        let id = p["id"].as_str().unwrap();
        let root = PathBuf::from(p["folderPath"].as_str().unwrap());
        fs::create_dir(root.join("Docs")).unwrap();
        fs::write(root.join("Docs/A.pdf"), b"owned").unwrap();
        fs::write(
            root.join("source.md"),
            "[lower](docs/a.pdf) [upper](Docs/A.pdf)",
        )
        .unwrap();
        let v = a.project_asset_catalog(id).unwrap();
        let resources = v["items"]
            .as_array()
            .unwrap()
            .iter()
            .filter(|item| {
                item["target"]["path"]
                    .as_str()
                    .unwrap()
                    .eq_ignore_ascii_case("Docs/A.pdf")
            })
            .collect::<Vec<_>>();
        assert_eq!(resources.len(), 1, "{v}");
        assert_eq!(resources[0]["incomingCount"], 2);
        for path in ["Docs/A.pdf", "docs/a.pdf"] {
            let links = a.project_asset_links(id, &format!("{id}::{path}")).unwrap();
            assert_eq!(links["incoming"].as_array().unwrap().len(), 2, "{links}");
            assert_eq!(links["asset"]["id"], format!("{id}::{path}"));
            assert_eq!(links["complete"], true);
        }
        assert_eq!(
            a.project_asset_links(id, &format!("{id}::docs")).unwrap()["incoming"]
                .as_array()
                .unwrap()
                .len(),
            2
        );
    }
}
