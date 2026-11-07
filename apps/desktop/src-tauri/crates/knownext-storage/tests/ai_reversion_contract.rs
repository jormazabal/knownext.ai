//! Real LocalApi admission; no providers or UI automation.
use knownext_storage::LocalApi;
use serde_json::{json, Value};
use std::{fs, path::PathBuf};
fn call(api: &LocalApi, method: &str, path: &str, body: Value) -> Value {
    let r = api.handle(method, path, body, vec![]).unwrap();
    assert_eq!(r.status, 200, "{}", r.body);
    r.body
}
fn rejected(api: &LocalApi, method: &str, path: &str, body: Value) {
    match api.handle(method, path, body, vec![]) {
        Err(_) => (),
        Ok(v) => assert!(v.status >= 400, "{}", v.body),
    }
}
fn fixture() -> (tempfile::TempDir, LocalApi, String, String, PathBuf) {
    let d = tempfile::tempdir().unwrap();
    let a = LocalApi::new(d.path().join("state"), "qa".into(), "test".into());
    let p = call(
        &a,
        "POST",
        "/api/projects",
        json!({"name":"AI route QA","versioningMode":"none","syncMode":"none"}),
    );
    let pid = p["id"].as_str().unwrap().to_owned();
    let root = PathBuf::from(p["folderPath"].as_str().unwrap());
    fs::write(root.join("a.md"), "# Original\n\nUser text\n").unwrap();
    let id = format!("{pid}::a.md");
    (d, a, pid, id, root)
}
fn prepare(api: &LocalApi, id: &str, before: &Value) -> Value {
    call(
        api,
        "POST",
        &format!("/api/documents/{id}/ai-changes/prepare"),
        json!({"interactionId":"interaction-owned","operationId":"operation-owned","summary":"Edición de prueba","beforeMarkdown":before["markdown"],"expectedDraftWriteRevision":before["draftWriteRevision"],"baseFingerprint":before["baseFingerprint"]}),
    )
}
#[test]
fn block5_ai_routes_prepare_apply_and_revert_use_real_project_admission() {
    let (_d, a, p, id, root) = fixture();
    let before = call(&a, "GET", &format!("/api/documents/{id}"), Value::Null);
    let prepared = prepare(&a, &id, &before);
    let after = "# Original\n\nAI text\n";
    let ack = call(
        &a,
        "POST",
        &format!("/api/documents/{id}/ai-changes/apply"),
        json!({"changeId":prepared["id"],"revision":prepared["revision"],"markdown":after}),
    );
    assert_eq!(ack["aiChange"]["phase"], "applied");
    assert_eq!(
        ack["aiChange"]["afterDraftWriteRevision"],
        ack["draftWriteRevision"]
    );
    let cid = prepared["id"].as_str().unwrap();
    let review = call(
        &a,
        "POST",
        &format!("/api/projects/{p}/ai-changes/{cid}/review"),
        json!({}),
    );
    assert_eq!(review["canRevert"], true);
    let request = json!({"reviewRevision":review["revision"],"selectedHunkIds":review["selectedHunkIds"],"acknowledge":true});
    let done = call(
        &a,
        "POST",
        &format!("/api/projects/{p}/ai-changes/{cid}/revert"),
        request.clone(),
    );
    assert_eq!(done["phase"], "reverted");
    rejected(
        &a,
        "POST",
        &format!("/api/projects/{p}/ai-changes/{cid}/revert"),
        request,
    );
    let result = call(&a, "GET", &format!("/api/documents/{id}"), Value::Null);
    assert_eq!(result["markdown"], before["markdown"]);
    assert_eq!(
        fs::read_to_string(root.join("a.md")).unwrap(),
        before["markdown"].as_str().unwrap()
    );
    let catalog = call(
        &a,
        "GET",
        &format!("/api/projects/{p}/ai-changes"),
        Value::Null,
    );
    assert_eq!(catalog["items"].as_array().unwrap().len(), 1);
}
#[test]
fn block5_ai_routes_read_only_and_revoked_edit_permission_preserve_native_sources() {
    let (_d, a, _p, id, root) = fixture();
    let before = call(&a, "GET", &format!("/api/documents/{id}"), Value::Null);
    let request = json!({"interactionId":"interaction-owned","operationId":"operation-owned","summary":"Readonly","beforeMarkdown":before["markdown"],"expectedDraftWriteRevision":null,"baseFingerprint":before["baseFingerprint"],"readOnly":true});
    rejected(
        &a,
        "POST",
        &format!("/api/documents/{id}/ai-changes/prepare"),
        request,
    );
    let prepared = prepare(&a, &id, &before);
    call(
        &a,
        "PUT",
        "/api/config/ai",
        json!({"permissions":{"editDocuments":false}}),
    );
    rejected(
        &a,
        "POST",
        &format!("/api/documents/{id}/ai-changes/apply"),
        json!({"changeId":prepared["id"],"revision":prepared["revision"],"markdown":"Forbidden"}),
    );
    assert_eq!(
        fs::read_to_string(root.join("a.md")).unwrap(),
        before["markdown"].as_str().unwrap()
    );
    assert_eq!(
        call(&a, "GET", &format!("/api/documents/{id}"), Value::Null)["hasDraft"],
        false
    );
}
#[test]
fn block5_ai_note_routes_inverse_only_the_reviewed_page_and_preview_the_frozen_copy() {
    let (_d, a, p, _id, _root) = fixture();
    call(
        &a,
        "PUT",
        "/api/config/ai",
        json!({"permissions":{"editHandwrittenNotes":true}}),
    );
    call(
        &a,
        "POST",
        &format!("/api/projects/{p}/handwritten-notes"),
        json!({"name":"note.knote"}),
    );
    let id = format!("{p}::note.knote");
    let record = call(
        &a,
        "GET",
        &format!("/api/handwritten-notes/{id}"),
        Value::Null,
    );
    let mut before = record["content"].clone();
    let mut second = before["pages"][0].clone();
    second["id"] = json!("page-2");
    before["pages"].as_array_mut().unwrap().push(second);
    let draft = call(
        &a,
        "PUT",
        &format!("/api/handwritten-notes/{id}/draft"),
        json!({"content":before,"baseFingerprint":record["baseFingerprint"],"expectedDraftWriteRevision":record["draftWriteRevision"]}),
    );
    let prepared = call(
        &a,
        "POST",
        &format!("/api/documents/{id}/ai-changes/prepare"),
        json!({"interactionId":"note-interaction","operationId":"note-operation","summary":"Página IA","beforeMarkdown":serde_json::to_string(&before).unwrap(),"expectedDraftWriteRevision":draft["draftWriteRevision"],"baseFingerprint":record["baseFingerprint"]}),
    );
    let mut after = before.clone();
    after["pages"][0]["background"]["type"] = json!("grid");
    let applied = call(
        &a,
        "POST",
        &format!("/api/documents/{id}/ai-changes/apply"),
        json!({"changeId":prepared["id"],"revision":prepared["revision"],"markdown":serde_json::to_string(&after).unwrap()}),
    );
    let cid = prepared["id"].as_str().unwrap();
    let image = call(
        &a,
        "POST",
        &format!("/api/projects/{p}/ai-changes/{cid}/page-preview"),
        json!({"revision":applied["aiChange"]["revision"],"side":"after","pageId":before["pages"][0]["id"]}),
    );
    assert_eq!(image["readOnly"], true);
    assert!(image["dataUrl"]
        .as_str()
        .unwrap()
        .starts_with("data:image/png;base64,"));
    let mut manual = after.clone();
    manual["pages"][1]["background"]["type"] = json!("dots");
    call(
        &a,
        "PUT",
        &format!("/api/handwritten-notes/{id}/draft"),
        json!({"content":manual,"expectedDraftWriteRevision":applied["draftWriteRevision"]}),
    );
    let review = call(
        &a,
        "POST",
        &format!("/api/projects/{p}/ai-changes/{cid}/review"),
        json!({}),
    );
    assert_eq!(review["canRevert"], true);
    call(
        &a,
        "POST",
        &format!("/api/projects/{p}/ai-changes/{cid}/revert"),
        json!({"reviewRevision":review["revision"],"selectedHunkIds":review["selectedHunkIds"],"acknowledge":true}),
    );
    let content = call(
        &a,
        "GET",
        &format!("/api/handwritten-notes/{id}"),
        Value::Null,
    )["content"]
        .clone();
    assert_eq!(content["pages"][0]["background"]["type"], "blank");
    assert_eq!(content["pages"][1]["background"]["type"], "dots");
}
