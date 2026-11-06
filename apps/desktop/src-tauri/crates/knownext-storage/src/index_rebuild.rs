//! Bounded local calculation outside mutation authority, guarded publication.
use super::*;
use std::{fs, io::Read, sync::Mutex, time::Instant};

const MAX_FILE: u64 = 8 * 1024 * 1024;
const MAX_CORPUS: usize = 64 * 1024 * 1024;
const MAX_TEXT: usize = 16 * 1024 * 1024;
const MAX_ENTRIES: usize = 10_000;
const MAX_CHUNKS: usize = 20_000;

pub fn index_rebuild_project(method: &str, raw_path: &str) -> Option<String> {
    let (path, _) = split_path(raw_path);
    let parts = path
        .trim_matches('/')
        .split('/')
        .map(knownext_core::percent_decode)
        .collect::<Vec<_>>();
    match (
        method.to_ascii_uppercase().as_str(),
        parts
            .iter()
            .map(String::as_str)
            .collect::<Vec<_>>()
            .as_slice(),
    ) {
        ("POST", ["api", "projects", project, "ai", "index", "rebuild"]) => {
            Some((*project).to_owned())
        }
        _ => None,
    }
}

fn project_record(api: &LocalApi, project: &str) -> Result<Value, String> {
    api.registry_checked()?["projects"]
        .as_array()
        .and_then(|items| {
            items
                .iter()
                .find(|item| item["id"].as_str() == Some(project))
        })
        .cloned()
        .ok_or_else(|| "El proyecto ya no está registrado; se conserva el índice actual".into())
}

struct Prepared {
    project: String,
    association: Value,
    root: PathBuf,
    revision: Option<String>,
}
struct Calculated {
    prepared: Prepared,
    index: Value,
    document_count: usize,
}

impl Prepared {
    fn new(api: &LocalApi, project: &str) -> Result<Self, String> {
        let root = api
            .project_root(project)?
            .canonicalize()
            .map_err(|_| "No se puede leer la ubicación del proyecto")?;
        let association = project_record(api, project)?;
        let revision = api.read_ai_index(project)?.map(|stored| stored.revision);
        Ok(Self {
            project: project.into(),
            association,
            root,
            revision,
        })
    }

    fn calculate(self) -> Result<Calculated, String> {
        let started = Instant::now();
        let files = bounded_files(&self.root, started)?;
        let document_count = files.len();
        let indexed_at = knownext_core::now_iso();
        let location_revision=sha256_hex(self.root.to_string_lossy().as_bytes());
        let mut documents = Vec::new();
        let mut chunks = Vec::new();
        let mut read_bytes = 0usize;
        let mut text_bytes = 0usize;
        for path in files {
            check_time(started)?;
            let extension = path
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("")
                .to_ascii_lowercase();
            if !is_markdown_path(&path)
                && !is_handwritten_note_path(&path)
                && !is_text_context_path(&path)
                && !matches!(extension.as_str(), "docx" | "xlsx")
            {
                continue;
            }
            let relative = relative_from_root(&self.root, &path);
            let path = path_policy::resolve(&self.root, &relative)?;
            let mut file = fs::File::open(&path).map_err(|_| {
                format!("{relative}: no se pudo leer; se conserva el índice anterior")
            })?;
            let before = file
                .metadata()
                .map_err(|_| "No se pudo verificar una fuente del índice")?;
            if !before.is_file() || before.len() > MAX_FILE {
                return Err(format!("{relative}: supera el límite de 8 MiB por fuente del índice; se conserva el índice anterior"));
            }
            if read_bytes.saturating_add(before.len() as usize) > MAX_CORPUS {
                return Err("El corpus supera 64 MiB; se conserva el índice anterior".into());
            }
            let mut bytes = Vec::new();
            (&mut file)
                .take(MAX_FILE + 1)
                .read_to_end(&mut bytes)
                .map_err(|_| "No se pudo completar una lectura del índice")?;
            if bytes.len() as u64 > MAX_FILE || read_bytes.saturating_add(bytes.len()) > MAX_CORPUS
            {
                return Err(
                    "El corpus creció fuera de sus límites; se conserva el índice anterior".into(),
                );
            }
            let after = file
                .metadata()
                .map_err(|_| "No se pudo comprobar la lectura del índice")?;
            if before.len() != after.len()
                || before.modified().ok() != after.modified().ok()
                || after.len() != bytes.len() as u64
            {
                return Err(
                    "Una fuente cambió durante su lectura. Revisa el estado antes de reconstruir"
                        .into(),
                );
            }
            read_bytes += bytes.len();
            let file_revision=sha256_hex(&bytes);
            let text = if matches!(extension.as_str(), "docx" | "xlsx") {
                knownext_docs::extract_office_body_text_bounded(
                    &bytes,
                    MAX_TEXT.saturating_sub(text_bytes),
                )?
            } else if is_handwritten_note_path(&path) {
                let content: Value = serde_json::from_slice(&bytes).map_err(|_| {
                    "Una nota del índice no contiene JSON válido; se conserva el índice anterior"
                })?;
                document_validation::handwritten(&content)?;
                knownext_docs::handwritten_note_text(&content)
            } else {
                String::from_utf8(bytes)
                    .map_err(|_| "Una fuente textual no es UTF-8; se conserva el índice anterior")?
            };
            let text = text.trim();
            if text.is_empty() {
                continue;
            }
            text_bytes = text_bytes.saturating_add(text.len());
            if text_bytes > MAX_TEXT {
                return Err(
                    "El texto del corpus supera 16 MiB; se conserva el índice anterior".into(),
                );
            }
            let file_chunks = chunk_text(text, 1400, 220);
            if chunks.len().saturating_add(file_chunks.len()) > MAX_CHUNKS {
                return Err(
                    "El índice supera 20.000 fragmentos; se conserva el índice anterior".into(),
                );
            }
            let id = doc_id(&self.project, &relative);
            let name = path
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or("documento");
            let count = file_chunks.len();
            for (index, text) in file_chunks.into_iter().enumerate() {
                chunks.push(json!({"id":format!("{id}#chunk-{}",index+1),"documentId":id,"path":relative,"name":name,"chunkIndex":index,"text":text,"indexedAt":indexed_at,"originProof":ai_context_origin::known_file_proof(&id,&location_revision,&file_revision,&text)}));
            }
            documents.push(json!({"id":id,"path":relative,"name":name,"mimeType":mime_for_path(&path),"sizeBytes":after.len(),"chunkCount":count,"indexedAt":indexed_at,"status":"indexed"}));
        }
        check_time(started)?;
        documents.sort_by(|a, b| a["path"].as_str().cmp(&b["path"].as_str()));
        let index = json!({"schemaVersion":1,"projectId":self.project,"vectorStoreId":format!("local-rag:{}",self.project),"indexedAt":indexed_at,"documents":documents,"chunks":chunks,"failedDocuments":[]});
        Ok(Calculated {
            prepared: self,
            index,
            document_count,
        })
    }
}

impl Calculated {
    fn publish(self, api: &LocalApi) -> Result<Value, String> {
        let prepared = self.prepared;
        if project_record(api, &prepared.project)? != prepared.association
            || api
                .project_root(&prepared.project)?
                .canonicalize()
                .ok()
                .as_ref()
                != Some(&prepared.root)
            || api
                .read_ai_index(&prepared.project)?
                .map(|stored| stored.revision)
                != prepared.revision
        {
            return Err("El proyecto o el índice cambiaron durante el cálculo. Se conserva el estado actual; consulta su revisión".into());
        }
        let enabled = api.read_config_checked()?["ai"]["rag"]["enabled"]
            .as_bool()
            .unwrap_or(false);
        let (revision, bytes) = api.write_ai_index(&prepared.project, &self.index)?;
        api.update_ai_rag_config(json!({"vectorStoreId":self.index["vectorStoreId"],"lastIndexedAt":self.index["indexedAt"],"status":"updated","error":null}))
            .map_err(|_| "El índice local se ha reconstruido, pero no se pudieron actualizar las preferencias. Consulta el estado antes de repetir")?;
        let indexed = self.index["documents"]
            .as_array()
            .map(Vec::len)
            .unwrap_or(0);
        Ok(
            json!({"projectId":prepared.project,"enabled":enabled,"status":"updated","vectorStoreId":self.index["vectorStoreId"],"lastIndexedAt":self.index["indexedAt"],"error":null,
            "documentCount":self.document_count,"indexedDocumentCount":indexed,"pendingDocumentCount":self.document_count.saturating_sub(indexed),"failedDocumentCount":0,"deletedDocumentCount":0,
            "localExactReady":true,"indexRevision":revision,"indexSizeBytes":bytes,"indexReadable":true,"documentCountKnown":true,"checkedAt":knownext_core::now_iso()}),
        )
    }
}

fn check_time(started: Instant) -> Result<(), String> {
    if started.elapsed() > Duration::from_secs(15) {
        Err("El cálculo del índice alcanzó 15 segundos de presupuesto cooperativo; se conserva el índice anterior".into())
    } else {
        Ok(())
    }
}

fn bounded_files(root: &Path, started: Instant) -> Result<Vec<PathBuf>, String> {
    let mut directories = vec![root.to_path_buf()];
    let mut files = Vec::new();
    let mut visited = 0usize;
    while let Some(directory) = directories.pop() {
        check_time(started)?;
        for entry in fs::read_dir(directory)
            .map_err(|_| "No se pudo recorrer todo el corpus; se conserva el índice anterior")?
        {
            check_time(started)?;
            visited += 1;
            if visited > MAX_ENTRIES {
                return Err("El recorrido del índice supera 10.000 entradas; se conserva el índice anterior".into());
            }
            let entry = entry.map_err(|_| "No se pudo consultar una entrada del corpus")?;
            let name = entry.file_name().to_string_lossy().to_string();
            if name.starts_with('.') || matches!(name.as_str(), "node_modules" | "target" | "dist")
            {
                continue;
            }
            let path = entry.path();
            let metadata = fs::symlink_metadata(&path)
                .map_err(|_| "No se pudo verificar una entrada del corpus")?;
            if batch::linked(&metadata) {
                continue;
            }
            if metadata.is_dir() {
                directories.push(path);
            } else if metadata.is_file() {
                files.push(path);
            }
        }
    }
    files.sort();
    Ok(files)
}

pub fn dispatch_index_rebuild(
    mutations: &Mutex<LocalApi>,
    queue: &Mutex<()>,
    project: &str,
) -> ApiResult {
    let _private=mutations.lock().map_err(|_|"No se puede revisar el trabajo de índice")?.private_work()?;
    dispatch_with(mutations, queue, project, Prepared::calculate)
}

fn dispatch_with(
    mutations: &Mutex<LocalApi>,
    queue: &Mutex<()>,
    project: &str,
    calculate: impl FnOnce(Prepared) -> Result<Calculated, String>,
) -> ApiResult {
    let _queue = queue
        .lock()
        .map_err(|_| "La cola del índice no está disponible")?;
    let prepared = {
        let api = mutations
            .lock()
            .map_err(|_| "No se puede preparar el índice")?;
        Prepared::new(&api, project)?
    };
    let calculated = calculate(prepared)?;
    let api = mutations
        .lock()
        .map_err(|_| "No se puede publicar el índice")?;
    ok(calculated.publish(&api)?)
}

impl LocalApi {
    pub(super) fn rebuild_ai_index(&self, project: &str) -> Result<Value, String> {
        Prepared::new(self, project)?.calculate()?.publish(self)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{mpsc, Arc};

    fn fixture() -> (tempfile::TempDir, LocalApi, String, PathBuf) {
        let owned = tempfile::tempdir().unwrap();
        let api = LocalApi::new(owned.path().join("app"), "qa".into(), "test".into());
        let project = api
            .create_project(
                json!({"name":"Owned index QA","versioningMode":"none","syncMode":"none"}),
            )
            .unwrap();
        let id = project["id"].as_str().unwrap().to_string();
        let root = api.project_root(&id).unwrap();
        fs::write(root.join("Review.md"), "Original disk").unwrap();
        (owned, api, id, root)
    }

    #[test]
    fn calculation_does_not_hold_mutations_and_rebuilds_remain_serialized() {
        let (_owned, api, project, root) = fixture();
        api.update_ai_rag_config(json!({"enabled":true})).unwrap();
        let mutations = Arc::new(Mutex::new(api));
        let queue = Arc::new(Mutex::new(()));
        let (entered, received) = mpsc::channel();
        let (release, wait) = mpsc::channel();
        let worker_mutations = mutations.clone();
        let worker_queue = queue.clone();
        let worker_project = project.clone();
        let first = std::thread::spawn(move || {
            dispatch_with(
                &worker_mutations,
                &worker_queue,
                &worker_project,
                |prepared| {
                    entered.send(()).unwrap();
                    wait.recv_timeout(Duration::from_secs(3)).unwrap();
                    prepared.calculate()
                },
            )
        });
        received
            .recv_timeout(Duration::from_secs(3))
            .expect("calculation did not start");
        let (entered_second, received_second) = mpsc::channel();
        let worker_mutations = mutations.clone();
        let worker_queue = queue.clone();
        let worker_project = project.clone();
        let second = std::thread::spawn(move || {
            dispatch_with(
                &worker_mutations,
                &worker_queue,
                &worker_project,
                |prepared| {
                    entered_second.send(()).unwrap();
                    prepared.calculate()
                },
            )
        });
        assert!(received_second
            .recv_timeout(Duration::from_millis(100))
            .is_err());
        {
            let api = mutations
                .try_lock()
                .expect("calculation monopolized document mutation authority");
            let id = doc_id(&project, "Review.md");
            let result=api.handle("PUT",&format!("/api/documents/{id}"),json!({"markdown":"Saved while index calculation is waiting","baseFingerprint":api.fingerprint(&root.join("Review.md"))}),vec![]).unwrap();
            assert_eq!(result.status, 200);
            api.update_ai_rag_config(json!({"enabled":false})).unwrap();
        }
        release.send(()).unwrap();
        let result = first.join().unwrap().unwrap();
        assert_eq!(result.body["enabled"], false);
        received_second
            .recv_timeout(Duration::from_secs(3))
            .expect("second rebuild never resumed");
        assert_eq!(second.join().unwrap().unwrap().status, 200);
        let api = mutations.lock().unwrap();
        let index = api.read_ai_index(&project).unwrap().unwrap();
        assert!(index.value["chunks"][0]["text"]
            .as_str()
            .unwrap()
            .contains("Saved while index"));
        assert_eq!(
            fs::read_to_string(root.join("Review.md")).unwrap(),
            "Saved while index calculation is waiting"
        );
        assert_eq!(
            index_rebuild_project(
                "post",
                &format!("/api/projects/{project}/ai/index/rebuild?review=1")
            ),
            Some(project)
        );
        assert!(index_rebuild_project("GET", "/api/projects/other/ai/index/rebuild").is_none());
    }

    #[test]
    fn changed_index_association_and_budget_failures_preserve_the_current_state() {
        let (_owned, api, project, root) = fixture();
        api.rebuild_ai_index(&project).unwrap();
        let calculated = Prepared::new(&api, &project).unwrap().calculate().unwrap();
        fs::write(root.join("Review.md"), "New source version").unwrap();
        let newer = api.rebuild_ai_index(&project).unwrap();
        let path = api.ai_index_path(&project).unwrap();
        let bytes = fs::read(&path).unwrap();
        assert!(calculated.publish(&api).is_err());
        assert_eq!(fs::read(&path).unwrap(), bytes);
        let calculated = Prepared::new(&api, &project).unwrap().calculate().unwrap();
        api.delete_ai_index(&project, json!({"revision":newer["indexRevision"]}))
            .unwrap();
        assert!(calculated.publish(&api).is_err());
        assert!(!path.exists());
        api.rebuild_ai_index(&project).unwrap();
        let calculated = Prepared::new(&api, &project).unwrap().calculate().unwrap();
        api.update_project(&project, json!({"name":"Reviewed identity"}))
            .unwrap();
        let bytes = fs::read(&path).unwrap();
        assert!(calculated.publish(&api).is_err());
        assert_eq!(fs::read(&path).unwrap(), bytes);
        fs::File::create(root.join("Too large.md"))
            .unwrap()
            .set_len(MAX_FILE + 1)
            .unwrap();
        let config = fs::read(api.config_path()).unwrap();
        assert!(api
            .rebuild_ai_index(&project)
            .unwrap_err()
            .contains("8 MiB"));
        assert_eq!(fs::read(&path).unwrap(), bytes);
        assert_eq!(fs::read(api.config_path()).unwrap(), config);
        assert_eq!(
            fs::read_to_string(root.join("Review.md")).unwrap(),
            "New source version"
        );
    }
}
