//! Bounded saved text sources. Reference consumers opt into Markdown only.
use super::*;
use std::io::Read;

const MAX_FILE: u64 = 2 * 1024 * 1024;
const MAX_BYTES: u64 = 64 * 1024 * 1024;
const MAX_ENTRIES: usize = 10_000;

pub(super) fn read_document(root: &Path, relative: &str) -> Result<String, String> {
    let path = path_policy::resolve(root, relative)?;
    let mut content = String::new();
    let size = std::fs::File::open(path)
        .and_then(|file| file.take(MAX_FILE + 1).read_to_string(&mut content))
        .map_err(|_| "No se pudo leer el archivo guardado como Markdown UTF-8")?;
    if size as u64 > MAX_FILE {
        return Err("El archivo supera el límite de 2 MiB de esta consulta".into());
    }
    Ok(content)
}

#[derive(Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct ScanSummary {
    pub scanned_documents: usize,
    pub visited_entries: usize,
    pub read_bytes: u64,
    pub limited: bool,
    pub warnings: Vec<String>,
}

pub(super) fn visit(
    root: &Path,
    mut document: impl FnMut(&str, &str) -> bool,
) -> Result<ScanSummary, String> {
    let root = path_policy::resolve(root, "")?;
    let mut directories = vec![root.clone()];
    let mut summary = ScanSummary::default();
    let started = std::time::Instant::now();
    'scan: while let Some(directory) = directories.pop() {
        if started.elapsed() > Duration::from_secs(2) || summary.warnings.len() >= 50 {
            summary.limited = true;
            break;
        }
        let entries = match std::fs::read_dir(&directory) {
            Ok(entries) => entries,
            Err(_) => {
                summary.warnings.push(format!(
                    "No se puede leer {}",
                    relative_from_root(&root, &directory)
                ));
                continue;
            }
        };
        for entry in entries {
            summary.visited_entries += 1;
            if summary.visited_entries > MAX_ENTRIES
                || started.elapsed() > Duration::from_secs(2)
                || summary.warnings.len() >= 50
            {
                summary.limited = true;
                break 'scan;
            }
            let entry = match entry {
                Ok(entry) => entry,
                Err(_) => {
                    summary
                        .warnings
                        .push("No se pudo consultar un elemento del proyecto".into());
                    continue;
                }
            };
            let path = entry.path();
            let name = entry.file_name().to_string_lossy().to_string();
            if name.starts_with('.') || matches!(name.as_str(), "node_modules" | "target" | "dist")
            {
                continue;
            }
            let metadata = match std::fs::symlink_metadata(&path) {
                Ok(metadata) => metadata,
                Err(_) => {
                    summary
                        .warnings
                        .push(format!("No se puede consultar {name}"));
                    continue;
                }
            };
            if batch::linked(&metadata) {
                continue;
            }
            if metadata.is_dir() {
                directories.push(path);
                continue;
            }
            if !metadata.is_file()
                || !is_markdown_path(&path)
            {
                continue;
            }
            let relative = relative_from_root(&root, &path);
            if metadata.len() > MAX_FILE {
                summary.warnings.push(format!(
                    "{relative}: supera el límite de 2 MiB por documento"
                ));
                continue;
            }
            if summary.read_bytes + metadata.len() > MAX_BYTES {
                summary.limited = true;
                break 'scan;
            }
            let path = match path_policy::resolve(&root, &relative) {
                Ok(path) => path,
                Err(_) => {
                    summary.warnings.push(format!(
                        "{relative}: la ruta dejó de pertenecer al proyecto"
                    ));
                    continue;
                }
            };
            let mut content = String::new();
            let size = match std::fs::File::open(path)
                .and_then(|file| file.take(MAX_FILE + 1).read_to_string(&mut content))
            {
                Ok(size) if size as u64 <= MAX_FILE => size as u64,
                _ => {
                    summary
                        .warnings
                        .push(format!("{relative}: no se pudo leer como UTF-8"));
                    continue;
                }
            };
            if summary.read_bytes + size > MAX_BYTES {
                summary.limited = true;
                break 'scan;
            }
            summary.read_bytes += size;
            summary.scanned_documents += 1;
            if !document(&relative, &content) {
                summary.limited = true;
                break 'scan;
            }
        }
    }
    Ok(summary)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn saved_corpus_skips_private_data_and_reports_unreadable_documents() {
        let root = tempfile::tempdir().unwrap();
        std::fs::create_dir(root.path().join(".private")).unwrap();
        std::fs::write(root.path().join(".private/secret.md"), "Not in corpus").unwrap();
        std::fs::write(root.path().join("valid.md"), "# Saved").unwrap();
        std::fs::write(root.path().join("bad.md"), [0xff]).unwrap();
        let mut docs = vec![];
        let summary = visit(root.path(), |path, text| {
            docs.push((path.to_string(), text.to_string()));
            true
        })
        .unwrap();
        assert_eq!(docs, vec![("valid.md".to_string(), "# Saved".to_string())]);
        assert_eq!(summary.scanned_documents, 1);
        assert!(!summary.warnings.is_empty());
    }
    #[test]
    fn saved_corpus_marks_a_stopped_query_as_incomplete() {
        let root = tempfile::tempdir().unwrap();
        std::fs::write(root.path().join("one.md"), "# One").unwrap();
        std::fs::write(root.path().join("two.md"), "# Two").unwrap();
        let summary = visit(root.path(), |_, _| false).unwrap();
        assert!(summary.limited);
        assert_eq!(summary.scanned_documents, 1);
    }
}
