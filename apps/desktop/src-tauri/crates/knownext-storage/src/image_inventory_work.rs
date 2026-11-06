//! A bounded image inventory reads each Markdown source once, then publishes a snapshot.
use super::*;
use asset_work::ProjectSnapshot;
use std::{
    fs,
    io::Read,
    sync::Mutex,
    time::{Instant, SystemTime},
};
const MAX_ENTRIES: usize = 10_000;
const MAX_SOURCE: u64 = 8 * 1024 * 1024;
const MAX_CORPUS: usize = 64 * 1024 * 1024;

#[derive(Clone, PartialEq, Eq)]
struct Stamp {
    bytes: u64,
    modified: SystemTime,
    directory: bool,
}
fn stamp(path: &Path) -> Result<Stamp, String> {
    let meta = fs::symlink_metadata(path)
        .map_err(|_| "No se pudo comprobar una fuente; se conserva el índice anterior")?;
    if batch::linked(&meta) || !meta.is_file() && !meta.is_dir() {
        return Err("Una fuente cambió de tipo; se conserva el índice anterior".into());
    }
    Ok(Stamp {
        bytes: meta.len(),
        modified: meta
            .modified()
            .map_err(|_| "No se pudo comprobar la revisión de una fuente")?,
        directory: meta.is_dir(),
    })
}
fn time(started: Instant) -> Result<(), String> {
    if started.elapsed() > Duration::from_secs(15) {
        Err("El inventario alcanzó15 segundos de presupuesto cooperativo; se conserva el índice anterior".into())
    } else {
        Ok(())
    }
}
struct Calculated {
    snapshot: ProjectSnapshot,
    previous: Value,
    index: Value,
    sources: BTreeMap<PathBuf, Stamp>,
}
impl Calculated {
    fn calculate(api: &LocalApi, snapshot: ProjectSnapshot) -> Result<Self, String> {
        let previous = api.read_image_inventory(&snapshot.project)?;
        let started = Instant::now();
        let mut sources = BTreeMap::new();
        let mut pending = vec![snapshot.root.clone()];
        let mut images = Vec::new();
        let mut markdown = Vec::new();
        let mut entries = 0usize;
        while let Some(directory) = pending.pop() {
            knownext_core::operations::checkpoint(knownext_core::operations::Stage::Validating)?;
            time(started)?;
            sources.insert(directory.clone(), stamp(&directory)?);
            for entry in fs::read_dir(directory)
                .map_err(|_| "No se pudo recorrer el proyecto; se conserva el índice anterior")?
            {
                knownext_core::operations::checkpoint(
                    knownext_core::operations::Stage::Validating,
                )?;
                time(started)?;
                entries += 1;
                if entries > MAX_ENTRIES {
                    return Err(
                        "El inventario supera10.000 entradas; se conserva el índice anterior"
                            .into(),
                    );
                }
                let entry = entry.map_err(|_| "No se pudo comprobar una entrada del proyecto")?;
                let name = entry.file_name();
                let name = name.to_string_lossy();
                // Coordination files are excluded before metadata or content access.
                if name.starts_with('.')
                    || matches!(
                        name.as_ref(),
                        "owner.lock"
                            | "runtime-owner.lock"
                            | "capture.lock"
                            | "node_modules"
                            | "target"
                            | "dist"
                    )
                {
                    continue;
                }
                let path = entry.path();
                let meta = fs::symlink_metadata(&path)
                    .map_err(|_| "No se pudo comprobar una entrada del inventario")?;
                if batch::linked(&meta) {
                    continue;
                }
                if meta.is_dir() {
                    pending.push(path);
                } else if meta.is_file() && (is_image_path(&path) || is_markdown_path(&path)) {
                    let current = stamp(&path)?;
                    sources.insert(path.clone(), current.clone());
                    if is_image_path(&path) {
                        images.push((path, current.bytes));
                    } else {
                        markdown.push(path);
                    }
                }
            }
        }
        let mut usage: BTreeMap<String, usize> = BTreeMap::new();
        let mut bytes = 0usize;
        let mut references = 0usize;
        for path in markdown {
            knownext_core::operations::checkpoint(knownext_core::operations::Stage::Validating)?;
            time(started)?;
            let expected = sources
                .get(&path)
                .ok_or("Falta la revisión de una fuente")?;
            if expected.bytes > MAX_SOURCE {
                return Err(
                    "Una fuente Markdown supera8MiB; se conserva el índice anterior".into(),
                );
            }
            let relative = relative_from_root(&snapshot.root, &path);
            let checked = path_policy::resolve(&snapshot.root, &relative)?;
            let mut data = Vec::new();
            fs::File::open(&checked)
                .map_err(|_| "No se pudo abrir una fuente Markdown")?
                .take(MAX_SOURCE + 1)
                .read_to_end(&mut data)
                .map_err(|_| "No se pudo completar una lectura Markdown")?;
            bytes = bytes.saturating_add(data.len());
            if data.len() as u64 > MAX_SOURCE || bytes > MAX_CORPUS {
                return Err("Las fuentes superan64MiB de corpus o8MiB por archivo; se conserva el índice anterior".into());
            }
            if &stamp(&path)? != expected {
                return Err(
                    "Una fuente cambió durante la lectura; vuelve a revisar el inventario".into(),
                );
            }
            let text = String::from_utf8(data)
                .map_err(|_| "Una fuente Markdown no es UTF-8; se conserva el índice anterior")?;
            if text.matches("![").count() > 20_000 {
                return Err(
                    "Una fuente supera20.000 referencias de imagen; se conserva el índice anterior"
                        .into(),
                );
            }
            let relative = relative_from_root(&snapshot.root, &path);
            let id = doc_id(&snapshot.project, &relative);
            let name = path
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or("documento.md");
            for reference in
                markdown_image_references(&text, &snapshot.project, &id, name, &relative)
            {
                references += 1;
                if references > 100_000 {
                    return Err(
                        "El inventario supera100.000 referencias; se conserva el índice anterior"
                            .into(),
                    );
                }
                if let Some(asset) = reference["resolvedAssetPath"].as_str() {
                    *usage.entry(asset.into()).or_default() += 1;
                }
            }
        }
        let indexed_at = knownext_core::now_iso();
        let mut records = Vec::new();
        for (path, bytes) in images {
            let relative = relative_from_root(&snapshot.root, &path);
            records.push(json!({"id":doc_id(&snapshot.project,&relative),"path":relative,"name":path.file_name().and_then(|name|name.to_str()).unwrap_or("image"),"mimeType":mime_for_path(&path),"sizeBytes":bytes,"usageCount":usage.get(&relative).copied().unwrap_or(0),"indexedAt":indexed_at,"status":"indexed"}));
        }
        records.sort_by(|a, b| a["path"].as_str().cmp(&b["path"].as_str()));
        time(started)?;
        let index = json!({"projectId":snapshot.project,"indexedAt":indexed_at,"images":records});
        if serde_json::to_vec(&index)
            .map_err(|_| "No se pudo preparar el índice")?
            .len()
            > 32 * 1024 * 1024
        {
            return Err("El índice supera32MiB; se conserva el anterior".into());
        }
        Ok(Self {
            snapshot,
            previous,
            index,
            sources,
        })
    }
    fn publish(self, api: &LocalApi) -> Result<Value, String> {
        self.snapshot.check(api)?;
        let _publication = api.project_transaction(&self.snapshot.project)?;
        if api.read_image_inventory(&self.snapshot.project)? != self.previous {
            return Err(
                "El índice de imágenes cambió durante el cálculo; se conserva su revisión actual"
                    .into(),
            );
        }
        let started = Instant::now();
        for (path, expected) in self.sources {
            if started.elapsed() > Duration::from_secs(1) {
                return Err(
                    "La comprobación final supera su presupuesto; se conserva el índice anterior"
                        .into(),
                );
            }
            if stamp(&path)? != expected {
                return Err("El proyecto cambió durante el cálculo; vuelve a revisar el inventario. No se sustituyó el índice".into());
            }
        }
        api.write_json(&api.image_index_path(&self.snapshot.project), &self.index)?;
        let count = self.index["images"].as_array().map_or(0, Vec::len);
        Ok(
            json!({"projectId":self.snapshot.project,"imageCount":count,"indexedImageCount":count,"status":"updated","indexedAt":self.index["indexedAt"]}),
        )
    }
}
pub(super) fn rebuild(
    mutations: &Mutex<LocalApi>,
    source: &LocalApi,
    snapshot: ProjectSnapshot,
) -> ApiResult {
    let calculated = Calculated::calculate(source, snapshot)?;
    knownext_core::operations::checkpoint(knownext_core::operations::Stage::Publishing)?;
    let api = mutations
        .lock()
        .map_err(|_| "No se puede publicar el inventario")?;
    ok(calculated.publish(&api)?)
}
impl LocalApi {
    fn read_image_inventory(&self, project: &str) -> Result<Value, String> {
        ancillary_state::read(
            &self.app_data_dir,
            &self.image_index_path(project),
            ancillary_state::Store::Images,
            Some(project),
            json!({"images":[]}),
        )
    }
    pub(super) fn rebuild_image_inventory(&self, project: &str) -> Result<Value, String> {
        Calculated::calculate(self, ProjectSnapshot::new(self, project)?)?.publish(self)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture() -> (tempfile::TempDir, LocalApi, String, PathBuf) {
        let dir = tempfile::tempdir().unwrap();
        let api = LocalApi::new(dir.path().join("profile"), "qa".into(), "test".into());
        let project = api
            .create_project(
                json!({"name":"Image pipeline","versioningMode":"none","syncMode":"none"}),
            )
            .unwrap();
        let id = project["id"].as_str().unwrap().to_string();
        let root = api.project_root(&id).unwrap();
        (dir, api, id, root)
    }
    #[test]
    fn runtime_block_cancelled_inventory_preserves_the_previous_index() {
        use knownext_core::operations::{Lane, Operations};
        let (_dir, api, id, root) = fixture();
        fs::write(root.join("doc.md"), "Owned source").unwrap();
        api.rebuild_image_inventory(&id).unwrap();
        let before = fs::read(api.image_index_path(&id)).unwrap();
        let ops = Operations::default();
        let operation = "operation-cancel-index-owned";
        ops.submit_scoped(operation, Lane::Index, 1, None, true)
            .unwrap();
        let work = ops.wait(operation, Duration::from_secs(1)).unwrap();
        let _scope = work.bind();
        ops.cancel(operation).unwrap();
        assert_eq!(
            api.rebuild_image_inventory(&id).unwrap_err(),
            "operation-stopped-before-publication"
        );
        assert_eq!(fs::read(api.image_index_path(&id)).unwrap(), before);
    }
    #[test]
    fn asset_pipeline_image_inventory_counts_references_once_and_preserves_documents() {
        let (_dir, api, id, root) = fixture();
        fs::create_dir(root.join("docs")).unwrap();
        fs::write(root.join("picture.png"), b"owned bytes").unwrap();
        let markdown = "![A](../picture.png)\n![B](../picture.png)";
        fs::write(root.join("docs/note.md"), markdown).unwrap();
        let result = api.rebuild_image_inventory(&id).unwrap();
        assert_eq!(result["imageCount"], 1);
        let index = api.read_image_inventory(&id).unwrap();
        assert_eq!(index["images"][0]["usageCount"], 2);
        assert_eq!(
            fs::read_to_string(root.join("docs/note.md")).unwrap(),
            markdown
        );
    }
    #[test]
    fn asset_pipeline_image_publication_rejects_changed_sources_or_newer_cache() {
        for change_cache in [false, true] {
            let (_dir, api, id, root) = fixture();
            fs::write(root.join("picture.png"), b"owned").unwrap();
            fs::write(root.join("note.md"), "![A](picture.png)").unwrap();
            api.rebuild_image_inventory(&id).unwrap();
            let pending =
                Calculated::calculate(&api, ProjectSnapshot::new(&api, &id).unwrap()).unwrap();
            if change_cache {
                let mut value = api.read_image_inventory(&id).unwrap();
                value["indexedAt"] = json!("2026-11-05T12:00:00Z");
                api.write_json(&api.image_index_path(&id), &value).unwrap();
            } else {
                fs::write(root.join("note.md"), "different document and size").unwrap();
            }
            let expected = fs::read(api.image_index_path(&id)).unwrap();
            assert!(pending.publish(&api).is_err());
            assert_eq!(fs::read(api.image_index_path(&id)).unwrap(), expected);
        }
    }
    #[test]
    fn asset_pipeline_image_failures_preserve_cache_without_becoming_empty_success() {
        let (_dir, api, id, root) = fixture();
        fs::write(root.join("picture.png"), b"owned").unwrap();
        api.rebuild_image_inventory(&id).unwrap();
        let previous = fs::read(api.image_index_path(&id)).unwrap();
        fs::write(root.join("invalid.md"), [0xff, 0xfe]).unwrap();
        assert!(api.rebuild_image_inventory(&id).is_err());
        assert_eq!(fs::read(api.image_index_path(&id)).unwrap(), previous);
        fs::remove_file(root.join("invalid.md")).unwrap();
        let future = br#"{"schemaVersion":99,"projectId":"future","images":[]}"#;
        fs::write(api.image_index_path(&id), future).unwrap();
        assert!(api.rebuild_image_inventory(&id).is_err());
        assert_eq!(fs::read(api.image_index_path(&id)).unwrap(), future);
    }
}
