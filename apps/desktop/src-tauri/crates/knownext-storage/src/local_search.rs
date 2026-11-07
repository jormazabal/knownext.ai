//! Explicit local search over saved documents, with bounded work and no provider calls.
use super::*;
use unicode_normalization::{
    char::{canonical_combining_class, compose},
    UnicodeNormalization,
};
mod corpus;
const MAX_RESULTS: usize = 50;

pub(super) fn search(project: &str, root: &Path, query: &str) -> Result<Value, String> {
    let query = query.trim();
    if query.chars().count() < 2 || query.chars().count() > 200 {
        return Err("Escribe entre 2 y 200 caracteres para buscar contenido".into());
    }
    let needle = normalized(query);
    let mut results = vec![];
    let corpus = corpus::load(root)?;
    let mut warnings = corpus.warnings;
    let mut notes_without_text = 0;
    let mut attachments_without_text = 0;
    let mut limited = corpus.limited;
    let mut results_limited = false;
    for (relative, document) in &corpus.documents {
        let name = relative.rsplit('/').next().unwrap_or(relative);
        let kind = if is_handwritten_note_path(Path::new(relative)) {
            "handwritten-note"
        } else if is_markdown_path(Path::new(relative)) {
            "document"
        } else {
            "attachment"
        };
        if let Some(reason) = &document.warning {
            limited = true;
            warnings.push(format!("{relative}: {reason}"));
            continue;
        }
        if document.no_text {
            if kind == "handwritten-note" {
                notes_without_text += 1;
            } else if kind == "attachment" {
                attachments_without_text += 1;
            }
        }
        if results_limited {
            continue;
        }
        'document: for (page, text) in &document.pages {
            for (line_index, line) in text.lines().enumerate() {
                if let Some(excerpt) = matched_excerpt(line, &needle) {
                    if results.len() >= MAX_RESULTS {
                        limited = true;
                        results_limited = true;
                        break 'document;
                    }
                    let mut result = json!({"documentId":doc_id(project,relative),"name":name,"path":relative,"kind":kind,"line":line_index+1,"excerpt":excerpt});
                    if let Some((number, id)) = page {
                        if let Some(id) = id {
                            result["pageId"] = json!(id);
                        }
                        result["pageNumber"] = json!(number);
                    }
                    results.push(result);
                }
            }
        }
    }
    warnings.truncate(50);
    Ok(
        json!({"projectId":project,"query":query,"searchedAt":knownext_core::now_iso(),"results":results,"scannedDocuments":corpus.documents.len(),"limited":limited,"warnings":warnings,"notesWithoutText":notes_without_text,"attachmentsWithoutText":attachments_without_text,"index":{"mode":"verified-memory","reusedDocuments":corpus.reused,"updatedDocuments":corpus.updated,"readBytes":corpus.read_bytes,"elapsedMs":corpus.elapsed_ms}}),
    )
}

fn normalized(text: &str) -> String {
    if text.is_ascii() {
        text.to_ascii_lowercase()
    } else {
        text.nfkc().flat_map(char::to_lowercase).collect()
    }
}
// Normalize canonical combining groups, retaining their original character start.
// A normalized byte offset must never be used to slice the source string.
fn original_match_character(line: &str, at: usize) -> usize {
    if line.is_ascii() {
        return at;
    }
    let mut cluster = String::new();
    let mut cluster_start = 0;
    let mut original_index = 0;
    let mut normalized_bytes = 0;
    for character in line.chars() {
        let mut encoded = [0u8; 4];
        let source = character.encode_utf8(&mut encoded);
        let first = source.nfkc().next().unwrap_or(character);
        let boundary = !cluster.is_empty() && canonical_combining_class(first) == 0;
        let joins = boundary
            && cluster
                .nfkc()
                .last()
                .and_then(|last| compose(last, first))
                .is_some();
        if boundary && !joins {
            let length = cluster
                .nfkc()
                .flat_map(char::to_lowercase)
                .map(char::len_utf8)
                .sum::<usize>();
            if normalized_bytes + length > at {
                return cluster_start;
            }
            normalized_bytes += length;
            cluster.clear();
            cluster_start = original_index;
        }
        cluster.push(character);
        original_index += 1;
    }
    cluster_start
}
fn matched_excerpt(line: &str, needle: &str) -> Option<String> {
    let lower = normalized(line);
    let at = lower.find(needle)?;
    let original_index = original_match_character(line, at);
    Some(
        line.chars()
            .skip(original_index.saturating_sub(60))
            .take(240)
            .collect(),
    )
}

fn note_text_pages(content: &str) -> Result<Vec<(usize, String, String)>, &'static str> {
    let note: Value =
        serde_json::from_str(content).map_err(|_| "nota no legible; se conserva sin consultar")?;
    document_validation::handwritten(&note)
        .map_err(|_| "formato de nota no compatible; se conserva sin consultar")?;
    let pages = note["pages"].as_array().unwrap();
    let mut ids = BTreeSet::new();
    let mut result = vec![];
    for (index, page) in pages.iter().enumerate() {
        let id = page["id"].as_str().unwrap();
        if id.is_empty()
            || id.len() > 200
            || id.chars().any(char::is_control)
            || matches!(id, "__proto__" | "constructor" | "prototype")
            || !ids.insert(id)
        {
            return Err("identidad de páginas ambigua; se conserva sin consultar");
        }
        if let Some(text) = note["ocr"]["textByPage"]
            .get(id)
            .and_then(Value::as_str)
            .filter(|text| !text.trim().is_empty())
        {
            result.push((index + 1, id.to_string(), text.to_string()));
        }
    }
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn transcription_search_is_page_scoped_fresh_and_never_enters_markdown_reference_corpus() {
        let root = tempfile::tempdir().unwrap();
        let mut note = default_handwritten_note("note-qa", "Metadata-only-canary");
        note["pages"]
            .as_array_mut()
            .unwrap()
            .push(default_handwritten_page("page-2", "blank"));
        note["ocr"]["textByPage"] = json!({"page-2":"Primera línea\nDecisión de diseño","removed-page":"orphan-only-canary"});
        let bytes = serde_json::to_vec(&note).unwrap();
        let path = root.path().join("Sketch.knote");
        std::fs::write(&path, &bytes).unwrap();
        std::fs::write(root.path().join("a.md"), "Decisión compartida").unwrap();
        let result = search("p", root.path(), "DECISIÓN").unwrap();
        let found = result["results"]
            .as_array()
            .unwrap()
            .iter()
            .find(|item| item["kind"] == "handwritten-note")
            .unwrap();
        assert_eq!(found["pageId"], "page-2");
        assert_eq!(found["pageNumber"], 2);
        assert_eq!(found["line"], 2);
        assert_eq!(result["results"].as_array().unwrap().len(), 2);
        for query in ["orphan-only-canary", "Metadata-only-canary"] {
            assert!(search("p", root.path(), query).unwrap()["results"]
                .as_array()
                .unwrap()
                .is_empty());
        }
        let mut reference_paths = vec![];
        local_corpus::visit(root.path(), |path, _| {
            reference_paths.push(path.to_string());
            true
        })
        .unwrap();
        assert_eq!(reference_paths, vec!["a.md"]);
        assert_eq!(std::fs::read(&path).unwrap(), bytes);
        note["ocr"]["textByPage"]["page-2"] = json!("Texto corregido");
        std::fs::write(&path, serde_json::to_vec(&note).unwrap()).unwrap();
        assert!(search("p", root.path(), "decisión").unwrap()["results"]
            .as_array()
            .unwrap()
            .iter()
            .all(|item| item["kind"] == "document"));
    }
    #[test]
    fn transcription_search_explains_missing_text_preserves_future_files_and_maps_expanded_case_correctly(
    ) {
        let root = tempfile::tempdir().unwrap();
        let note = default_handwritten_note("note-qa", "None");
        std::fs::write(
            root.path().join("NoText.knote"),
            serde_json::to_vec(&note).unwrap(),
        )
        .unwrap();
        let future = b"{\"schemaVersion\":2,\"private\":\"unknown-text-canary\"}";
        std::fs::write(root.path().join("Future.knote"), future).unwrap();
        let result = search("p", root.path(), "canary").unwrap();
        assert!(result["results"].as_array().unwrap().is_empty());
        assert_eq!(result["notesWithoutText"], 1);
        assert_eq!(result["warnings"].as_array().unwrap().len(), 1);
        assert!(!result.to_string().contains("unknown-text-canary"));
        assert_eq!(
            std::fs::read(root.path().join("Future.knote")).unwrap(),
            future
        );
        assert!(
            matched_excerpt(&format!("{}Needle", "İ".repeat(300)), "needle")
                .unwrap()
                .contains("Needle")
        );
    }
    #[test]
    fn saved_search_reflects_external_edits_moves_and_trash_without_stale_results() {
        let root = std::env::temp_dir().join(knownext_core::compact_id("knownext-search-test"));
        std::fs::create_dir_all(&root).unwrap();
        std::fs::write(root.join("a.md"), "# Proyecto\nDecisión importante\n").unwrap();
        let result = search("p", &root, "DECISIÓN").unwrap();
        assert_eq!(result["results"][0]["line"], 2);
        std::fs::rename(root.join("a.md"), root.join("b.md")).unwrap();
        assert_eq!(
            search("p", &root, "decisión").unwrap()["results"][0]["path"],
            "b.md"
        );
        std::fs::write(root.join("b.md"), "new content").unwrap();
        assert!(search("p", &root, "decisión").unwrap()["results"]
            .as_array()
            .unwrap()
            .is_empty());
        crate::trash::put(&root, "p", "b.md").unwrap();
        assert!(search("p", &root, "new").unwrap()["results"]
            .as_array()
            .unwrap()
            .is_empty());
        std::fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn search_reports_limits_and_rejects_unbounded_queries() {
        let root = std::env::temp_dir().join(knownext_core::compact_id("knownext-search-test"));
        std::fs::create_dir_all(&root).unwrap();
        std::fs::write(root.join("a.md"), "match\n".repeat(100)).unwrap();
        let result = search("p", &root, "match").unwrap();
        assert_eq!(result["results"].as_array().unwrap().len(), 50);
        assert_eq!(result["limited"], true);
        assert!(search("p", &root, "a").is_err());
        std::fs::remove_dir_all(root).unwrap();
    }
}
