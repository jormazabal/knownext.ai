//! Public runtime route, provider unavailable; never performs a paid call.
use knownext_storage::LocalApi;
use serde_json::{json, Value};
#[test]
fn block6_ocr_public_catalog_and_missing_attempt_do_not_send_or_modify() {
    let d = tempfile::tempdir().unwrap();
    let a = LocalApi::new(d.path().join("state"), "qa".into(), "ocr".into());
    let project = a
        .handle(
            "POST",
            "/api/projects",
            json!({"name":"OCR route","versioningMode":"none","syncMode":"none"}),
            vec![],
        )
        .unwrap()
        .body;
    let p = project["id"].as_str().unwrap();
    let note = a
        .handle(
            "POST",
            &format!("/api/projects/{p}/handwritten-notes"),
            json!({"name":"note.knote"}),
            vec![],
        )
        .unwrap()
        .body;
    let id = note["node"]["id"]
        .as_str()
        .expect("create note returns a tree node");
    let catalog = a
        .handle(
            "GET",
            &format!("/api/handwritten-notes/{id}/ocr"),
            Value::Null,
            vec![],
        )
        .unwrap();
    assert_eq!(catalog.status, 200, "{}", catalog.body);
    assert!(catalog.body["items"].as_array().unwrap().is_empty());
    assert_eq!(catalog.body["canReplay"], false);
    match a.handle(
        "GET",
        &format!("/api/handwritten-notes/{id}/ocr/handwritten-ocr-missing"),
        Value::Null,
        vec![],
    ) {
        Err(_) => (),
        Ok(v) => assert!(v.status >= 400),
    }
    let after = a
        .handle(
            "GET",
            &format!("/api/handwritten-notes/{id}"),
            Value::Null,
            vec![],
        )
        .unwrap()
        .body;
    assert_eq!(after["hasDraft"], false);
}
