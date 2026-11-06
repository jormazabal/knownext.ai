use knownext_storage::LocalApi;
use serde_json::{json, Value};
use std::{fs, io::Write, path::PathBuf};
fn call(api: &LocalApi, method: &str, path: &str, body: Value) -> Value {
    let r = api.handle(method, path, body, vec![]).unwrap();
    assert!(r.status < 400, "{path}: {}", r.body);
    r.body
}
fn post(api: &LocalApi, path: &str, body: Value) -> Value {
    call(api, "POST", path, body)
}
fn fixture() -> (tempfile::TempDir, LocalApi, String, PathBuf) {
    let t = tempfile::tempdir().unwrap();
    let a = LocalApi::new(t.path().join("state"), "qa".into(), "test".into());
    let p = post(
        &a,
        "/api/projects",
        json!({"name":"Owned attachments","versioningMode":"none","syncMode":"none"}),
    );
    let root = PathBuf::from(p["folderPath"].as_str().unwrap());
    (t, a, p["id"].as_str().unwrap().into(), root)
}
fn prepare(a: &LocalApi, p: &str, root: &std::path::Path, markdown: &str) -> Value {
    fs::write(root.join("Base.md"), markdown).unwrap();
    post(
        a,
        "/api/document-templates/source/prepare",
        json!({"documentId":format!("{p}::Base.md"),"markdown":markdown}),
    )
}
fn save(a: &LocalApi, prepared: &Value) -> Value {
    post(
        a,
        "/api/document-templates",
        json!({"name":"Owned portable attachments","markdown":prepared["markdown"],"resources":prepared["attachments"],"reviewedResources":true}),
    )
}
fn office(kind: &str, macros: bool) -> Vec<u8> {
    let mut zip = zip::ZipWriter::new(std::io::Cursor::new(vec![]));
    zip.start_file(
        if kind == "docx" {
            "word/document.xml"
        } else {
            "xl/workbook.xml"
        },
        zip::write::SimpleFileOptions::default(),
    )
    .unwrap();
    zip.write_all(b"<document>Owned package</document>")
        .unwrap();
    if macros {
        zip.start_file(
            "word/vbaProject.bin",
            zip::write::SimpleFileOptions::default(),
        )
        .unwrap();
        zip.write_all(b"owned").unwrap();
    }
    zip.finish().unwrap().into_inner()
}
#[test]
fn block7_document_template_attachments_survive_source_change_transfer_and_nested_creation() {
    let (t, a, p, root) = fixture();
    fs::create_dir(root.join("assets")).unwrap();
    let files = vec![
        (
            "Ficha técnica.pdf",
            b"%PDF-1.7\nOwned PDF bytes\n%%EOF".to_vec(),
        ),
        ("Memo.txt", vec![b'a'; 1024 * 1024]),
        ("Listado.csv", vec![b'b'; 1024 * 1024]),
        ("Base.docx", office("docx", false)),
        ("Base.xlsx", office("xlsx", false)),
    ];
    for (name, bytes) in &files {
        fs::write(root.join("assets").join(name), bytes).unwrap();
    }
    image::RgbaImage::new(2, 2)
        .save(root.join("assets/logo.png"))
        .unwrap();
    let md="# {{titulo}}\n\n[PDF](assets/Ficha%20t%C3%A9cnica.pdf#page=2) · [Texto](assets/Memo.txt) · [CSV](assets/Listado.csv) · [Word](assets/Base.docx) · [Excel](assets/Base.xlsx)\n\n[Referencia][ficha]\n\n[ficha]: assets/Ficha%20t%C3%A9cnica.pdf?download=1#page=3\n\n<a href=\"assets/Ficha%20t%C3%A9cnica.pdf?view=fit#page=4\">Memo HTML</a>\n\n![Marca](assets/logo.png)\n";
    let snap = prepare(&a, &p, &root, md);
    assert_eq!(snap["attachments"].as_array().unwrap().len(), 5);
    assert_eq!(snap["resources"].as_array().unwrap().len(), 1);
    assert_eq!(fs::read_to_string(root.join("Base.md")).unwrap(), md);
    let saved = save(&a, &snap);
    assert_eq!(saved["schemaVersion"], 2);
    let id = saved["id"].as_str().unwrap();
    let archive = post(
        &a,
        &format!("/api/document-templates/{id}/transfer"),
        json!({"revision":saved["revision"]}),
    );
    assert!(archive["byteLength"].as_u64().unwrap() > 2 * 1024 * 1024);
    let portable: Value = serde_json::from_str(archive["content"].as_str().unwrap()).unwrap();
    assert_eq!(portable["schemaVersion"], 2);
    assert!(portable.get("id").is_none());
    assert!(portable.get("createdAt").is_none());
    for (name, _) in &files {
        fs::write(
            root.join("assets").join(name),
            b"changed after reviewed snapshot",
        )
        .unwrap();
    }
    let b = LocalApi::new(t.path().join("second"), "qa".into(), "test".into());
    let inspected = b
        .inspect_document_template_transfer(archive["content"].as_str().unwrap())
        .unwrap();
    assert_eq!(inspected["resources"].as_array().unwrap().len(), 5);
    assert!(b
        .handle(
            "POST",
            "/api/document-templates/transfer/import",
            json!({"name":"Must review","content":archive["content"],"digest":inspected["digest"]}),
            vec![]
        )
        .is_err());
    let imported = post(
        &b,
        "/api/document-templates/transfer/import",
        json!({"name":"Received attachments","content":archive["content"],"digest":inspected["digest"],"reviewedResources":true}),
    );
    let destination = post(
        &b,
        "/api/projects",
        json!({"name":"Receiver","versioningMode":"none","syncMode":"none"}),
    );
    let dp = destination["id"].as_str().unwrap();
    let dr = PathBuf::from(destination["folderPath"].as_str().unwrap());
    fs::create_dir(dr.join("Docs")).unwrap();
    let mut body = json!({"projectId":dp,"parentId":format!("{dp}::Docs"),"name":"New.md","revision":imported["revision"],"values":{}});
    let endpoint = format!(
        "/api/document-templates/{}",
        imported["id"].as_str().unwrap()
    );
    let preview = post(&b, &format!("{endpoint}/preview"), body.clone());
    body["projectRootHash"] = preview["projectRootHash"].clone();
    post(&b, &format!("{endpoint}/create"), body.clone());
    let result = fs::read_to_string(dr.join("Docs/New.md")).unwrap();
    assert_eq!(result, preview["markdown"].as_str().unwrap());
    assert!(!result.contains("knownext-template-resource:"));
    assert!(result.contains("Ficha%20t%C3%A9cnica.pdf#page=2"));
    assert!(result.contains("Ficha%20t%C3%A9cnica.pdf?download=1#page=3"));
    assert!(result.contains("Ficha%20t%C3%A9cnica.pdf?view=fit#page=4"));
    assert!(result.contains("data:image/png;base64,"));
    for resource in imported["resources"].as_array().unwrap() {
        let name = resource["name"].as_str().unwrap();
        let copy = dr
            .join("Docs/_template-resources")
            .join(resource["sha256"].as_str().unwrap())
            .join(name);
        assert_eq!(
            fs::read(copy).unwrap(),
            files.iter().find(|(n, _)| *n == name).unwrap().1
        );
        assert!(result.contains(&format!(
            "_template-resources/{}/",
            resource["sha256"].as_str().unwrap()
        )));
    }
    assert!(b
        .handle("POST", &format!("{endpoint}/create"), body, vec![])
        .is_err());
    let catalogue = post(
        &a,
        "/api/document-templates/transfer/catalog/export",
        json!({"entries":[{"id":id,"revision":saved["revision"]}]}),
    );
    let parsed: Value = serde_json::from_str(catalogue["content"].as_str().unwrap()).unwrap();
    assert_eq!(parsed["schemaVersion"], 2);
    assert_eq!(parsed["templates"][0]["resources"], saved["resources"]);
    let inspection = b
        .inspect_document_template_transfer(catalogue["content"].as_str().unwrap())
        .unwrap();
    let mut request = json!({"content":catalogue["content"],"digest":inspection["digest"],"entries":[{"index":0,"name":"Second reviewed copy"}]});
    post(
        &b,
        "/api/document-templates/transfer/catalog/review",
        request.clone(),
    );
    assert!(b
        .handle(
            "POST",
            "/api/document-templates/transfer/catalog/import",
            request.clone(),
            vec![]
        )
        .is_err());
    request["reviewedResources"] = json!(true);
    let applied = post(
        &b,
        "/api/document-templates/transfer/catalog/import",
        request,
    );
    assert_eq!(applied["outcomes"][0]["status"], "imported");
    assert_eq!(
        applied["outcomes"][0]["template"]["resources"],
        saved["resources"]
    );
}
#[test]
fn block7_document_template_preflight_never_replaces_documents_or_occupied_attachment_bytes() {
    let (_t, a, p, root) = fixture();
    fs::write(root.join("Memo.txt"), b"owned text").unwrap();
    let snap = prepare(&a, &p, &root, "[Memo](Memo.txt)");
    let saved = save(&a, &snap);
    let endpoint = format!("/api/document-templates/{}", saved["id"].as_str().unwrap());
    let mut body =
        json!({"projectId":p,"name":"Occupied.md","revision":saved["revision"],"values":{}});
    let preview = post(&a, &format!("{endpoint}/preview"), body.clone());
    body["projectRootHash"] = preview["projectRootHash"].clone();
    fs::write(root.join("Occupied.md"), b"manual document").unwrap();
    assert!(a
        .handle("POST", &format!("{endpoint}/create"), body.clone(), vec![])
        .is_err());
    assert!(!root.join("_template-resources").exists());
    assert_eq!(
        fs::read(root.join("Occupied.md")).unwrap(),
        b"manual document"
    );
    body["name"] = json!("New.md");
    let r = &saved["resources"][0];
    let folder = root
        .join("_template-resources")
        .join(r["sha256"].as_str().unwrap());
    fs::create_dir_all(&folder).unwrap();
    fs::write(folder.join("Memo.txt"), b"occupied foreign bytes").unwrap();
    assert!(a
        .handle("POST", &format!("{endpoint}/create"), body.clone(), vec![])
        .is_err());
    assert!(!root.join("New.md").exists());
    assert_eq!(
        fs::read(folder.join("Memo.txt")).unwrap(),
        b"occupied foreign bytes"
    );
    body["revision"] = json!("obsolete");
    assert!(a
        .handle("POST", &format!("{endpoint}/create"), body, vec![])
        .is_err());
}
#[test]
fn block7_document_template_rejects_unsupported_sources_unreviewed_payloads_and_hash_tampering() {
    let (_t, a, p, root) = fixture();
    let markdown = "[Config](settings.json)";
    fs::write(
        root.join("settings.json"),
        b"{\"ownedSyntheticSecret\":true}",
    )
    .unwrap();
    fs::write(root.join("Base.md"), markdown).unwrap();
    assert!(a
        .handle(
            "POST",
            "/api/document-templates/source/prepare",
            json!({"documentId":format!("{p}::Base.md"),"markdown":markdown}),
            vec![]
        )
        .is_err());
    assert!(a
        .handle(
            "POST",
            "/api/document-templates/source/prepare",
            json!({"documentId":format!("{p}::Base.md"),"markdown":"[Outside](../outside.txt)"}),
            vec![]
        )
        .is_err());
    fs::write(root.join("Memo.txt"), b"owned").unwrap();
    let snap = prepare(&a, &p, &root, "[Memo](Memo.txt)");
    assert!(a.handle("POST","/api/document-templates",json!({"name":"Missing review","markdown":snap["markdown"],"resources":snap["attachments"]}),vec![]).is_err());
    let saved = save(&a, &snap);
    let export = post(
        &a,
        &format!(
            "/api/document-templates/{}/transfer",
            saved["id"].as_str().unwrap()
        ),
        json!({"revision":saved["revision"]}),
    );
    let mut invalid: Value = serde_json::from_str(export["content"].as_str().unwrap()).unwrap();
    invalid["resources"][0]["sha256"] = json!("b".repeat(64));
    assert!(a
        .inspect_document_template_transfer(&invalid.to_string())
        .is_err());
    let portable: Value = serde_json::from_str(export["content"].as_str().unwrap()).unwrap();
    let path = portable["resources"][0]["path"]
        .as_str()
        .unwrap()
        .to_owned();
    let mut alias = portable.clone();
    alias["markdown"] = json!(format!("[Alias]({path}-not-the-same#page=2)"));
    assert!(a
        .inspect_document_template_transfer(&alias.to_string())
        .is_err());
    let mut suffix = portable;
    suffix["markdown"] = json!(format!("[Bad]({path}?page=%ZZ)"));
    assert!(a
        .inspect_document_template_transfer(&suffix.to_string())
        .is_err());
    invalid["schemaVersion"] = json!(99);
    assert!(a
        .inspect_document_template_transfer(&invalid.to_string())
        .is_err());
    assert_eq!(
        fs::read(root.join("settings.json")).unwrap(),
        b"{\"ownedSyntheticSecret\":true}"
    );
}
#[test]
fn block7_document_template_attachment_limits_and_macro_office_are_explicit() {
    let (_t, a, p, root) = fixture();
    fs::write(root.join("TooBig.txt"), vec![b'a'; 1024 * 1024 + 1]).unwrap();
    fs::write(root.join("Macros.docx"), office("docx", true)).unwrap();
    for markdown in ["[Big](TooBig.txt)", "[Macros](Macros.docx)"] {
        fs::write(root.join("Base.md"), markdown).unwrap();
        assert!(a
            .handle(
                "POST",
                "/api/document-templates/source/prepare",
                json!({"documentId":format!("{p}::Base.md"),"markdown":markdown}),
                vec![]
            )
            .is_err());
    }
    assert!(!root.join("_template-resources").exists());
    assert_eq!(
        fs::metadata(root.join("TooBig.txt")).unwrap().len(),
        1024 * 1024 + 1
    );
}
