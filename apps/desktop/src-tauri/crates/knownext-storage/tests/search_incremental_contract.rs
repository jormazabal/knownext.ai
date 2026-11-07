use knownext_storage::LocalApi;
use serde_json::{json, Value};
use std::{
    fs,
    io::{Cursor, Write},
    path::PathBuf,
};
fn search(api: &LocalApi, p: &str, query: &str) -> Value {
    api.handle(
        "POST",
        &format!("/api/projects/{p}/search/content"),
        json!({"query":query}),
        vec![],
    )
    .unwrap()
    .body
}
fn package() -> Vec<u8> {
    let mut zip = zip::ZipWriter::new(Cursor::new(vec![]));
    zip.start_file(
        "word/document.xml",
        zip::write::SimpleFileOptions::default(),
    )
    .unwrap();
    zip.write_all(
        b"<w:document xmlns:w='urn:word'><w:p><w:t>Acuerdo documental</w:t></w:p></w:document>",
    )
    .unwrap();
    zip.start_file(
        "docProps/core.xml",
        zip::write::SimpleFileOptions::default(),
    )
    .unwrap();
    zip.write_all(b"<private>MetadataOnlyCanary</private>")
        .unwrap();
    zip.finish().unwrap().into_inner()
}
#[test]
fn verified_incremental_search_refreshes_changed_bytes_moves_deletions_and_attachments() {
    let owned = tempfile::tempdir().unwrap();
    let api = LocalApi::new(owned.path().join("state"), "qa".into(), "test".into());
    let p = api
        .handle(
            "POST",
            "/api/projects",
            json!({"name":"Owned search","versioningMode":"none","syncMode":"none"}),
            vec![],
        )
        .unwrap()
        .body;
    let id = p["id"].as_str().unwrap();
    let root = PathBuf::from(p["folderPath"].as_str().unwrap());
    fs::write(root.join("A.md"), "Acuerdo primero").unwrap();
    fs::write(root.join("B.txt"), "Acuerdo externo").unwrap();
    fs::write(root.join("C.csv"), "tema,valor\nAcuerdo,1").unwrap();
    fs::write(root.join("D.docx"), package()).unwrap();
    fs::write(root.join("Empty.txt"), "").unwrap();
    fs::write(root.join("Reference.pdf"), b"%PDF-1.4 Acuerdo invisible").unwrap();
    fs::create_dir(root.join(".private")).unwrap();
    fs::write(root.join(".private/hidden.md"), "Acuerdo privado").unwrap();
    let first = search(&api, id, "Acuerdo");
    assert_eq!(first["results"].as_array().unwrap().len(), 4);
    assert_eq!(first["index"]["updatedDocuments"], 6);
    assert_eq!(first["attachmentsWithoutText"], 1);
    assert!(first["warnings"].to_string().contains("PDF"));
    let warm = search(&api, id, "Acuerdo");
    assert_eq!(warm["index"]["updatedDocuments"], 0);
    assert_eq!(warm["index"]["reusedDocuments"], 6);
    assert!(search(&api, id, "MetadataOnlyCanary")["results"]
        .as_array()
        .unwrap()
        .is_empty());
    // Same byte length AND original timestamp: metadata alone must never authorize a cached extraction.
    let file = fs::OpenOptions::new()
        .write(true)
        .open(root.join("A.md"))
        .unwrap();
    let old = file.metadata().unwrap().modified().unwrap();
    fs::write(root.join("A.md"), "Cambio! primero").unwrap();
    file.set_times(fs::FileTimes::new().set_modified(old))
        .unwrap();
    fs::rename(root.join("B.txt"), root.join("Renamed.txt")).unwrap();
    fs::remove_file(root.join("C.csv")).unwrap();
    let changed = search(&api, id, "Acuerdo");
    let results = changed["results"].as_array().unwrap();
    assert_eq!(results.len(), 2);
    assert!(results
        .iter()
        .any(|v| v["path"] == "Renamed.txt" && v["kind"] == "attachment"));
    assert!(results
        .iter()
        .all(|v| v["path"] != "A.md" && v["path"] != "B.txt" && v["path"] != "C.csv"));
    assert_eq!(changed["index"]["updatedDocuments"], 2);
    assert_eq!(changed["index"]["reusedDocuments"], 3);
    assert_eq!(
        fs::read(root.join("Reference.pdf")).unwrap(),
        b"%PDF-1.4 Acuerdo invisible"
    );
    assert!(!root.join("search-index").exists());
    for i in 0..1000 {
        fs::write(
            root.join(format!("corpus-{i:04}.md")),
            format!(
                "# Archivo {i}\n{}",
                "Texto de consulta local sin red.\n".repeat(20)
            ),
        )
        .unwrap();
    }
    let cold = search(&api, id, "sin coincidencia");
    let warm = search(&api, id, "sin coincidencia");
    println!(
        "synthetic1000 cold={} warm={} documents={} limited={}",
        cold["index"], warm["index"], warm["scannedDocuments"], warm["limited"]
    );
    let scanned=warm["scannedDocuments"].as_u64().unwrap();
    assert!(scanned<=1005); // Malformed PDF is now reviewed and cached too.
    assert_eq!(warm["index"]["updatedDocuments"].as_u64().unwrap()+warm["index"]["reusedDocuments"].as_u64().unwrap(),scanned);
    if warm["limited"]==false {assert_eq!(scanned,1005);}
    if warm["limited"]==false && cold["limited"]==false {assert_eq!(warm["index"]["updatedDocuments"],0);}
    assert!(warm["index"]["readBytes"].as_u64().unwrap()<=64*1024*1024);
}
