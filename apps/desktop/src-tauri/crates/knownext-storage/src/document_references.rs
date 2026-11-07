//! References between project files. Reads saved Markdown only; never recovery or providers.
use super::*;

const MAX_LINKS: usize = 200;
const MAX_TARGET: usize = 8192;

impl LocalApi {
    pub(super) fn document_references(&self, id: &str) -> Result<Value, String> {
        let (project, relative) = document_ref(id)?;
        let root = self.project_root(&project)?;
        self.resolve_document_path(id)?;
        let outgoing_supported = is_markdown_path(Path::new(&relative));
        let mut warnings = vec![];
        let mut outgoing = vec![];
        let mut outgoing_limited = false;
        let mut source_fingerprint = Value::Null;
        let mut source_read = !outgoing_supported;
        if outgoing_supported {
            match local_corpus::read_document(&root, &relative) {
                Ok(markdown) => {
                    source_read = true;
                    source_fingerprint = fingerprint_bytes(markdown.as_bytes());
                    for span in knownext_docs::markdown_destinations(&markdown) {
                        if let Some(target) = document_links::local_target(&relative, &span.target)
                        {
                            if span.target.len() > MAX_TARGET {
                                outgoing_limited = true;
                                warnings.push(format!("{relative}: un destino supera 8 KiB. Se conserva en el documento y no se incluye en esta consulta."));
                                if warnings.len() >= 50 {
                                    break;
                                }
                                continue;
                            }
                            outgoing.push(reference(
                                &project,
                                &root,
                                &target,
                                &markdown,
                                span.range.start,
                                &span.target,
                            ));
                            if outgoing.len() == MAX_LINKS {
                                outgoing_limited = true;
                                break;
                            }
                        }
                    }
                }
                Err(error) => warnings.push(format!("{relative}: {error}")),
            }
        }
        let mut incoming = vec![];
        let canonical_source = path_policy::resolve(&root, &relative)
            .ok()
            .and_then(|path| path.canonicalize().ok());
        let summary = local_corpus::visit(&root, |path, markdown| {
            if path == relative {
                return true;
            }
            for span in knownext_docs::markdown_destinations(markdown) {
                let Some(target) = document_links::local_target(path, &span.target) else {
                    continue;
                };
                if span.target.len() > MAX_TARGET {
                    warnings.push(format!(
                        "{path}: un destino supera 8 KiB y no se ha consultado."
                    ));
                    if warnings.len() >= 50 {
                        return false;
                    }
                    continue;
                }
                let matches = target == relative
                    || canonical_source.as_ref().is_some_and(|source| {
                        path_policy::resolve(&root, &target)
                            .ok()
                            .and_then(|path| path.canonicalize().ok())
                            .as_ref()
                            == Some(source)
                    });
                if matches {
                    incoming.push(reference(
                        &project,
                        &root,
                        path,
                        markdown,
                        span.range.start,
                        &span.target,
                    ));
                    if incoming.len() == MAX_LINKS {
                        return false;
                    }
                }
            }
            true
        })?;
        warnings.extend(summary.warnings);
        for entries in [&mut outgoing, &mut incoming] {
            entries.sort_by(|a, b| {
                a["target"]["path"]
                    .as_str()
                    .cmp(&b["target"]["path"].as_str())
                    .then(a["line"].as_u64().cmp(&b["line"].as_u64()))
            });
        }
        Ok(
            json!({"documentId":id,"projectId":project,"sourcePath":relative,"scope":"saved-markdown","queriedAt":knownext_core::now_iso(),"sourceFingerprint":source_fingerprint,"sourceRead":source_read,"outgoingSupported":outgoing_supported,"outgoing":outgoing,"incoming":incoming,"scannedDocuments":summary.scanned_documents,"limited":summary.limited || outgoing_limited,"complete":source_read && !summary.limited && !outgoing_limited && warnings.is_empty(),"warnings":warnings}),
        )
    }
}

fn reference(
    project: &str,
    root: &Path,
    path: &str,
    markdown: &str,
    offset: usize,
    raw: &str,
) -> Value {
    let resolved = path_policy::resolve(root, path);
    let linked = resolved
        .as_ref()
        .ok()
        .is_some_and(|candidate| blocked_tree_path(root, candidate));
    let metadata = resolved
        .as_ref()
        .ok()
        .filter(|_| !linked)
        .and_then(|path| std::fs::symlink_metadata(path).ok());
    let directory = metadata
        .as_ref()
        .is_some_and(|meta| meta.is_dir() && !batch::linked(meta));
    let status = match &resolved {
        Ok(_) if linked => "blocked",
        Ok(_)
            if metadata
                .as_ref()
                .is_some_and(|meta| !batch::linked(meta) && (meta.is_file() || meta.is_dir())) =>
        {
            "available"
        }
        Ok(_) => "missing",
        Err(_) => "blocked",
    };
    let kind = if directory {
        "folder"
    } else if is_markdown_path(Path::new(path)) {
        "document"
    } else if is_handwritten_note_path(Path::new(path)) {
        "handwritten-note"
    } else if is_image_path(Path::new(path)) {
        "image"
    } else if matches!(
        Path::new(path)
            .extension()
            .and_then(|value| value.to_str())
            .map(str::to_ascii_lowercase)
            .as_deref(),
        Some("pdf" | "docx" | "xlsx")
    ) {
        "reference-document"
    } else {
        "attachment"
    };
    let prefix = &markdown[..offset];
    let line = prefix.bytes().filter(|byte| *byte == b'\n').count() + 1;
    let column = prefix.rsplit('\n').next().unwrap_or("").chars().count() + 1;
    json!({"target":{"id":doc_id(project,path),"projectId":project,"name":path.rsplit('/').next().unwrap_or(path),"path":path,"kind":kind,"status":status},"line":line,"column":column,"rawTarget":raw})
}

fn blocked_tree_path(root: &Path, candidate: &Path) -> bool {
    let Ok(relative) = candidate.strip_prefix(root) else {
        return true;
    };
    let mut current = root.to_path_buf();
    for (index, component) in relative.components().enumerate() {
        if index >= 256 {
            return true;
        }
        current.push(component);
        match std::fs::symlink_metadata(&current) {
            Ok(metadata) if batch::linked(&metadata) => return true,
            Ok(_) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return false,
            Err(_) => return true,
        }
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn directories_are_available_even_with_document_extensions_and_missing_paths_never_open() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path();
        std::fs::create_dir(root.join("Vacía")).unwrap();
        std::fs::create_dir(root.join("Carpeta.md")).unwrap();
        std::fs::write(root.join("Documento.md"), b"# Texto").unwrap();
        for path in ["Vacía", "Carpeta.md"] {
            let result = reference("project-qa", root, path, "", 0, path);
            assert_eq!(result["target"]["kind"], "folder");
            assert_eq!(result["target"]["status"], "available");
        }
        assert_eq!(
            reference("project-qa", root, "Documento.md", "", 0, "")["target"]["kind"],
            "document"
        );
        assert_eq!(
            reference("project-qa", root, "Ausente", "", 0, "")["target"]["status"],
            "missing"
        );
        assert_eq!(
            reference("project-qa", root, "../Exterior", "", 0, "")["target"]["status"],
            "blocked"
        );
    }
    #[cfg(unix)]
    #[test]
    fn internal_and_external_linked_folders_do_not_gain_navigation_authority() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().join("root");
        std::fs::create_dir(&root).unwrap();
        std::fs::create_dir(root.join("real")).unwrap();
        std::fs::create_dir(root.join("real/child")).unwrap();
        std::os::unix::fs::symlink(root.join("real"), root.join("linked")).unwrap();
        std::os::unix::fs::symlink(temp.path(), root.join("outside")).unwrap();
        for path in ["linked", "linked/child", "outside"] {
            assert_eq!(
                reference("project-qa", &root, path, "", 0, "")["target"]["status"],
                "blocked"
            );
        }
    }
}
