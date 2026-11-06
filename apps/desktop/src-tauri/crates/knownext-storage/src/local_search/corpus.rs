//! Reusable extraction, keyed by the bytes read on this query. No private index on disk.
use super::*;
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::Read,
    sync::{Arc, Mutex, OnceLock},
    time::Instant,
};

const MAX_ENTRIES: usize = 10_000;
const MAX_READ: u64 = 64 * 1024 * 1024;
const MAX_CACHE: usize = 32 * 1024 * 1024;
const MAX_TEXT: usize = 2 * 1024 * 1024;
type Pages = Vec<(Option<(usize, Option<String>)>, String)>;
pub(super) struct Extracted {
    pub pages: Pages,
    pub warning: Option<String>,
    pub no_text: bool,
}
impl Extracted {
    fn bytes(&self) -> usize {
        self.pages.iter().map(|(_, text)| text.len()).sum()
    }
}
#[derive(Clone)]
struct Cached {
    hash: [u8; 32],
    document: Arc<Extracted>,
}
#[derive(Default)]
struct Cache {
    root: PathBuf,
    documents: BTreeMap<String, Cached>,
}
static CACHE: OnceLock<Mutex<Cache>> = OnceLock::new();
pub(super) struct Corpus {
    pub documents: Vec<(String, Arc<Extracted>)>,
    pub warnings: Vec<String>,
    pub limited: bool,
    pub read_bytes: u64,
    pub reused: usize,
    pub updated: usize,
    pub elapsed_ms: u128,
}

fn extract(extension: &str, bytes: &[u8]) -> Extracted {
    let result = match extension {
        "knote" => std::str::from_utf8(bytes)
            .map_err(|_| "nota no legible; se conserva sin consultar".to_string())
            .and_then(|text| {
                note_text_pages(text)
                    .map(|pages| {
                        pages
                            .into_iter()
                            .map(|(number, id, text)| (Some((number, Some(id))), text))
                            .collect()
                    })
                    .map_err(str::to_string)
            }),
        "docx" | "xlsx" => knownext_docs::extract_office_body_text_bounded(bytes, MAX_TEXT)
            .map(|text| vec![(None, text)]),
        "pdf" => knownext_docs::extract_pdf_pages_bounded(bytes, MAX_TEXT).map(|pages| {
            pages
                .into_iter()
                .map(|(number, text)| (Some((number, None)), text))
                .collect()
        }),
        _ => String::from_utf8(bytes.to_vec())
            .map(|text| vec![(None, text)])
            .map_err(|_| "no se pudo leer como UTF-8".to_string()),
    };
    match result {
        Ok(pages) => {
            let no_text = pages.iter().all(|(_, text)| text.trim().is_empty());
            Extracted {
                pages,
                warning: None,
                no_text,
            }
        }
        Err(warning) => Extracted {
            pages: vec![],
            warning: Some(warning),
            no_text: false,
        },
    }
}

fn excluded_name(name: &str) -> bool {
    project_transfer::backup_snapshot_coordinate(name)
        || name.starts_with('.')
        || matches!(name, "node_modules" | "target" | "dist")
}
pub(super) fn load(root: &Path) -> Result<Corpus, String> {
    let root = path_policy::resolve(root, "")?
        .canonicalize()
        .map_err(|_| "No se puede consultar el proyecto")?;
    let previous = {
        let cache = CACHE
            .get_or_init(Default::default)
            .lock()
            .map_err(|_| "El índice local no está disponible")?;
        if cache.root == root {
            cache.documents.clone()
        } else {
            BTreeMap::new()
        }
    };
    let started = Instant::now();
    let mut out = Corpus {
        documents: vec![],
        warnings: vec![],
        limited: false,
        read_bytes: 0,
        reused: 0,
        updated: 0,
        elapsed_ms: 0,
    };
    let mut directories = vec![root.clone()];
    let mut visited = 0;
    let mut cache_bytes = 0usize;
    let mut next = BTreeMap::new();
    'scan: while let Some(directory) = directories.pop() {
        if started.elapsed() > Duration::from_secs(2) || out.warnings.len() >= 50 {
            out.limited = true;
            break;
        }
        let entries = match fs::read_dir(&directory) {
            Ok(entries) => entries,
            Err(_) => {
                out.warnings.push(format!(
                    "{}: carpeta no accesible",
                    relative_from_root(&root, &directory)
                ));
                continue;
            }
        };
        for entry in entries {
            visited += 1;
            if visited > MAX_ENTRIES
                || started.elapsed() > Duration::from_secs(2)
                || out.warnings.len() >= 50
            {
                out.limited = true;
                break 'scan;
            }
            let entry = match entry {
                Ok(entry) => entry,
                Err(_) => {
                    out.warnings
                        .push("No se pudo consultar una entrada del proyecto".into());
                    continue;
                }
            };
            let name = entry.file_name().to_string_lossy().into_owned();
            if excluded_name(&name) {
                continue;
            }
            let path = entry.path();
            let relative = relative_from_root(&root, &path);
            let meta = match fs::symlink_metadata(&path) {
                Ok(meta) => meta,
                Err(_) => {
                    out.warnings.push(format!("{relative}: no accesible"));
                    continue;
                }
            };
            if batch::linked(&meta) {
                continue;
            }
            if meta.is_dir() {
                directories.push(path);
                continue;
            }
            if !meta.is_file() {
                continue;
            }
            let extension = path
                .extension()
                .and_then(|x| x.to_str())
                .unwrap_or("")
                .to_ascii_lowercase();
            if !matches!(
                extension.as_str(),
                "md" | "knote" | "txt" | "csv" | "docx" | "xlsx" | "pdf"
            ) {
                continue;
            }
            let maximum = if matches!(extension.as_str(), "docx" | "xlsx" | "pdf") {
                8 * 1024 * 1024
            } else {
                MAX_TEXT as u64
            };
            if meta.len() > maximum {
                out.warnings.push(format!(
                    "{relative}: supera el límite local de {} MiB",
                    maximum / 1024 / 1024
                ));
                continue;
            }
            if out.read_bytes.saturating_add(meta.len()) > MAX_READ {
                out.limited = true;
                break 'scan;
            }
            let resolved = match path_policy::resolve(&root, &relative) {
                Ok(path) => path,
                Err(_) => {
                    out.warnings.push(format!("{relative}: ruta no disponible"));
                    continue;
                }
            };
            let mut bytes = Vec::new();
            if fs::File::open(&resolved)
                .and_then(|file| file.take(maximum + 1).read_to_end(&mut bytes))
                .is_err()
                || bytes.len() as u64 > maximum
            {
                out.warnings.push(format!(
                    "{relative}: no se pudo leer dentro del límite local"
                ));
                continue;
            }
            out.read_bytes += bytes.len() as u64;
            if out.read_bytes > MAX_READ {
                out.limited = true;
                break 'scan;
            }
            let after = fs::symlink_metadata(&resolved).ok();
            if after.as_ref().is_none_or(|after| {
                batch::linked(after)
                    || !after.is_file()
                    || after.len() != meta.len()
                    || after.modified().ok() != meta.modified().ok()
            }) || path_policy::resolve(&root, &relative).is_err()
            {
                out.warnings.push(format!(
                    "{relative}: cambió durante la consulta; vuelve a buscar"
                ));
                continue;
            }
            let hash: [u8; 32] = Sha256::digest(&bytes).into();
            let document = if let Some(cached) =
                previous.get(&relative).filter(|cached| cached.hash == hash)
            {
                out.reused += 1;
                cached.document.clone()
            } else {
                out.updated += 1;
                Arc::new(extract(&extension, &bytes))
            };
            if cache_bytes.saturating_add(document.bytes()) > MAX_CACHE {
                out.limited = true;
                out.warnings.push("El texto extraído alcanzó el presupuesto local de32MiB; consulta parcial, originales conservados".into());
                break 'scan;
            } else {
                cache_bytes += document.bytes();
                next.insert(
                    relative.clone(),
                    Cached {
                        hash,
                        document: document.clone(),
                    },
                );
            }
            out.documents.push((relative, document));
        }
    }
    out.documents.sort_by(|a, b| a.0.cmp(&b.0));
    *CACHE
        .get()
        .unwrap()
        .lock()
        .map_err(|_| "No se puede actualizar el índice local")? = Cache {
        root,
        documents: next,
    };
    out.limited |= !out.warnings.is_empty();
    out.elapsed_ms = started.elapsed().as_millis();
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn block11_search_coordination_exclusion_is_decided_from_names_without_filesystem_access() {
        for name in [
            "owner.lock",
            "runtime-owner.lock",
            "capture.lock",
            "OWNER.LOCK ",
            ".private",
            "node_modules",
            "target",
            "dist",
        ] {
            assert!(excluded_name(name), "{name}");
        }
        assert!(!excluded_name("Project.md"));
    }
    #[test]
    fn retained_extracted_text_is_bounded_even_when_the_input_budget_would_allow_more() {
        let owned = tempfile::tempdir().unwrap();
        let text = vec![b'x'; MAX_TEXT];
        for index in 0..18 {
            fs::write(owned.path().join(format!("body-{index}.txt")), &text).unwrap();
        }
        let corpus = load(owned.path()).unwrap();
        assert!(corpus.limited);
        assert!(corpus.documents.len() <= 16);
        assert!(
            corpus
                .documents
                .iter()
                .map(|(_, document)| document.bytes())
                .sum::<usize>()
                <= MAX_CACHE
        );
        assert_eq!(fs::read_dir(owned.path()).unwrap().count(), 18);
    }
}
