use knownext_storage::LocalApi;
use serde_json::{json, Value};
use std::{fs, path::PathBuf};
fn call(api: &LocalApi, method: &str, path: &str, body: Value) -> Value {
    let response = api.handle(method, path, body, vec![]).unwrap();
    assert_eq!(response.status, 200, "{}", response.body);
    response.body
}
fn fixture() -> (tempfile::TempDir, LocalApi, String, PathBuf, String) {
    let owned = tempfile::tempdir().unwrap();
    let api = LocalApi::new(owned.path().join("state"), "qa".into(), "test".into());
    let project = call(
        &api,
        "POST",
        "/api/projects",
        json!({"name":"Owned context revision","versioningMode":"none","syncMode":"none"}),
    );
    let id = project["id"].as_str().unwrap().to_string();
    let root = PathBuf::from(project["folderPath"].as_str().unwrap());
    fs::write(root.join("A.md"), b"alpha body\n").unwrap();
    let doc = format!("{id}::A.md");
    call(
        &api,
        "POST",
        &format!("/api/projects/{id}/ai/context/project-documents"),
        json!({"documentId":doc}),
    );
    (owned, api, id, root, doc)
}
#[test]
fn changed_explicit_context_is_reported_without_mutating_the_cache_and_blocks_prompt_before_provider(
) {
    let (owned, api, project, root, id) = fixture();
    let context_path = owned
        .path()
        .join("state/ai-context")
        .join(format!("{project}.json"));
    let bytes = fs::read(&context_path).unwrap();
    let list = call(
        &api,
        "GET",
        &format!("/api/projects/{project}/ai/context/sources"),
        Value::Null,
    );
    let source = &list["sources"][0];
    assert_eq!(source["sourceOrigin"], "file");
    assert_eq!(source["requiresReview"], false);
    assert!(source.get("text").is_none());
    assert!(source.get("originProof").is_none());
    fs::write(root.join("A.md"), b"bravo body\n").unwrap();
    let preview = call(
        &api,
        "GET",
        &format!("/api/projects/{project}/ai/context/sources/{id}/preview"),
        Value::Null,
    );
    assert_eq!(preview["originReview"]["status"], "changed");
    assert_eq!(preview["source"]["requiresReview"], true);
    assert_eq!(preview["previewText"], "alpha body\n");
    assert_eq!(fs::read(&context_path).unwrap(), bytes);
    let rejected = api.handle(
        "POST",
        &format!("/api/projects/{project}/ai/prompt"),
        json!({"prompt":"Summarize selected source","contextSourceIds":[id]}),
        vec![],
    );
    assert!(rejected.is_err());
    assert!(rejected.err().unwrap().contains("cambió"));
    assert_eq!(fs::read(&context_path).unwrap(), bytes);
    assert_eq!(fs::read(root.join("A.md")).unwrap(), b"bravo body\n");
}
#[test]
fn source_refresh_returns_a_bound_receipt_and_readonly_preview_survives_runtime_reopen() {
    let (owned, api, project, root, id) = fixture();
    fs::write(root.join("A.md"), b"bravo body\n").unwrap();
    let route = format!("/api/projects/{project}/ai/context/sources/{id}");
    let review = call(&api, "GET", &format!("{route}/review"), Value::Null);
    let attempt = "attempt-".to_string() + &"1".repeat(32);
    let expected = json!({"attemptId":attempt,"sourceRevision":review["sourceRevision"],"fileRevision":review["fileRevision"],"locationRevision":review["locationRevision"]});
    let result = call(&api, "POST", &format!("{route}/refresh"), expected.clone());
    assert_eq!(result["previewText"], "bravo body\n");
    assert_eq!(result["source"]["requiresReview"], false);
    assert!(result["source"].get("originProof").is_none());
    assert!(result["source"].get("lastRefresh").is_none());
    assert_eq!(result["originReview"]["publicationReviewed"], true);
    assert_eq!(result["originReview"]["lastRefresh"]["attemptId"], attempt);
    assert_eq!(
        result["originReview"]["lastRefresh"]["previousSourceRevision"],
        review["sourceRevision"]
    );
    let context_path = owned
        .path()
        .join("state/ai-context")
        .join(format!("{project}.json"));
    let bytes = fs::read(&context_path).unwrap();
    drop(api);
    let reopened = LocalApi::new(owned.path().join("state"), "qa".into(), "test".into());
    let observed = call(&reopened, "GET", &format!("{route}/preview"), Value::Null);
    assert_eq!(observed["originReview"]["publicationReviewed"], true);
    assert_eq!(
        observed["originReview"]["lastRefresh"]["attemptId"],
        attempt
    );
    assert_eq!(fs::read(&context_path).unwrap(), bytes);
    assert!(reopened
        .handle("POST", &format!("{route}/refresh"), expected, vec![])
        .is_err());
    assert_eq!(fs::read(context_path).unwrap(), bytes);
    assert_eq!(fs::read(root.join("A.md")).unwrap(), b"bravo body\n");
}
