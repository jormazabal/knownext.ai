//! Read-only public contracts: no providers, preview preparation or file reorganization.
use knownext_storage::LocalApi;
use serde_json::{json, Value};
use std::{fs, path::PathBuf};
fn call(a: &LocalApi, m: &str, p: &str, b: Value) -> Value {
    let r = a.handle(m, p, b, vec![]).unwrap();
    assert_eq!(r.status, 200, "{}", r.body);
    r.body
}
fn enc(s: &str) -> String {
    s.bytes()
        .map(|b| {
            if b.is_ascii_alphanumeric() || b"-_.~".contains(&b) {
                (b as char).to_string()
            } else {
                format!("%{b:02X}")
            }
        })
        .collect()
}
fn fixture() -> (tempfile::TempDir, LocalApi, String, PathBuf) {
    let d = tempfile::tempdir().unwrap();
    let a = LocalApi::new(d.path().join("state"), "qa".into(), "catalogue".into());
    let p = call(
        &a,
        "POST",
        "/api/projects",
        json!({"name":"Assets QA","versioningMode":"none","syncMode":"none"}),
    );
    let id = p["id"].as_str().unwrap().to_owned();
    let root = PathBuf::from(p["folderPath"].as_str().unwrap());
    (d, a, id, root)
}
#[test]
fn block7_assets_catalogue_connects_files_missing_references_folders_and_real_parser() {
    let (_d, a, p, root) = fixture();
    fs::create_dir(root.join("Docs")).unwrap();
    fs::create_dir(root.join(".private")).unwrap();
    fs::write(root.join(".private/hidden.txt"), "never catalogue").unwrap();
    fs::write(root.join("Docs/source.md"),"# Fuente

[Dato](../data.csv) [Falta](../missing.pdf) ![Imagen](../picture.png) [Sitio](https://example.test/a)

`[no](../code.md)`

```md
[no](../fenced.md)
```

[referencia][r]

[r]: ../data.csv
").unwrap();
    fs::write(
        root.join("data.csv"),
        "nombre,valor
a,1
",
    )
    .unwrap();
    fs::write(
        root.join("picture.png"),
        b"owned fixture, not opened by the catalogue",
    )
    .unwrap();
    let v = call(
        &a,
        "GET",
        &format!("/api/projects/{p}/asset-catalog"),
        Value::Null,
    );
    assert_eq!(v["readOnly"], true);
    assert_eq!(v["complete"], true);
    let items = v["items"].as_array().unwrap();
    assert!(items
        .iter()
        .any(|i| i["target"]["path"] == "missing.pdf" && i["target"]["status"] == "missing"));
    assert!(!items.iter().any(|i| i["target"]["path"] == "code.md"
        || i["target"]["path"] == "fenced.md"
        || i["target"]["path"] == ".private/hidden.txt"));
    let data = items
        .iter()
        .find(|i| i["target"]["path"] == "data.csv")
        .unwrap();
    assert_eq!(data["incomingCount"], 2);
    let links = call(
        &a,
        "GET",
        &format!(
            "/api/projects/{p}/asset-catalog/{}/links",
            enc(&format!("{p}::Docs/source.md"))
        ),
        Value::Null,
    );
    assert!(links["outgoing"]
        .as_array()
        .unwrap()
        .iter()
        .any(|r| r["external"] == true && r["target"].is_null()));
    let folder = call(
        &a,
        "GET",
        &format!(
            "/api/projects/{p}/asset-catalog/{}/links",
            enc(&format!("{p}::Docs"))
        ),
        Value::Null,
    );
    assert_eq!(folder["includesDescendants"], true);
    assert_eq!(folder["outgoing"], links["outgoing"]);
    assert_eq!(
        fs::read_to_string(root.join("data.csv")).unwrap(),
        "nombre,valor
a,1
"
    );
}
#[test]
fn block7_assets_text_snapshot_is_hashed_empty_and_unreadable_are_not_confused() {
    let (_d, a, p, root) = fixture();
    fs::write(
        root.join("empty.txt"),
        " \n\t",
    )
    .unwrap();
    fs::write(root.join("bad.txt"), [0xff, 0xfe]).unwrap();
    fs::write(root.join("image.png"), b"not inspected").unwrap();
    knownext_docs::write_docx(
        &root.join("Reference.docx"),
        "# Body

Contenido verificable",
    )
    .unwrap();
    fs::write(
        root.join("Reference.pdf"),
        knownext_docs::minimal_pdf("Referencia", "Contenido PDF verificable"),
    )
    .unwrap();
    for (name, status) in [
        ("empty.txt", "no-text"),
        ("bad.txt", "unavailable"),
        ("image.png", "unsupported"),
        ("Reference.docx", "available"),
        ("Reference.pdf", "available"),
    ] {
        let path = root.join(name);
        let original = fs::read(&path).unwrap();
        let v = call(
            &a,
            "GET",
            &format!(
                "/api/projects/{p}/asset-catalog/{}/text",
                enc(&format!("{p}::{name}"))
            ),
            Value::Null,
        );
        assert_eq!(v["status"], status, "{name}: {v}");
        assert_eq!(fs::read(&path).unwrap(), original);
        if status == "available" {
            assert_eq!(v["sourceSha256"].as_str().unwrap().len(), 64);
            assert!(v["text"].as_str().unwrap().contains("Contenido"));
        }
    }
}
#[test]
fn block7_assets_foreign_scope_and_partial_sources_never_become_false_no_impact() {
    let (_d, a, p, root) = fixture();
    fs::write(root.join("bad.md"), [0xff]).unwrap();
    let huge = fs::File::create(root.join("large.md")).unwrap();
    huge.set_len(2 * 1024 * 1024 + 1).unwrap();
    let v = call(
        &a,
        "GET",
        &format!("/api/projects/{p}/asset-catalog"),
        Value::Null,
    );
    assert_eq!(v["complete"], false);
    assert!(v["warnings"].as_array().unwrap().len() >= 2);
    for id in ["other::outside.md", "../outside.md", ".private/hidden.txt"] {
        match a.handle(
            "GET",
            &format!("/api/projects/{p}/asset-catalog/{}/links", enc(id)),
            Value::Null,
            vec![],
        ) {
            Err(_) => (),
            Ok(v) => assert!(v.status >= 400, "{id}: {}", v.body),
        }
    }
}
