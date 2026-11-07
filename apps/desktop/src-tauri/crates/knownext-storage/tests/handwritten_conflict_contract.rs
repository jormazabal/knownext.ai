use knownext_storage::LocalApi;
use serde_json::{json, Value};
use std::fs;
fn setup() -> (
    tempfile::TempDir,
    LocalApi,
    String,
    std::path::PathBuf,
    Value,
) {
    let temp = tempfile::tempdir().unwrap();
    let api = LocalApi::new(temp.path().join("state"), "qa".into(), "test".into());
    let project = api
        .handle(
            "POST",
            "/api/projects",
            json!({"name":"Owned note conflict","versioningMode":"none","syncMode":"none"}),
            vec![],
        )
        .unwrap()
        .body;
    let route = format!(
        "/api/projects/{}/handwritten-notes",
        project["id"].as_str().unwrap()
    );
    let created = api
        .handle("POST", &route, json!({"name":"Owned.knote"}), vec![])
        .unwrap()
        .body;
    let id = created["node"]["id"].as_str().unwrap().to_string();
    let record = api
        .handle(
            "GET",
            &format!("/api/handwritten-notes/{id}"),
            Value::Null,
            vec![],
        )
        .unwrap()
        .body;
    let path =
        std::path::PathBuf::from(project["folderPath"].as_str().unwrap()).join("Owned.knote");
    (temp, api, id, path, record)
}
#[test]
fn note_merge_preserves_pages_points_three_copies_and_source_until_explicit_save() {
    let (temp, api, id, path, record) = setup();
    let mut local = record["content"].clone();
    local["pages"][0]["strokes"] = json!([{"id":"owned-ink","color":"#111827","width":2,"opacity":1,"tool":"pen","pressure":true,"points":[[10,20,0.7,0,45,-30],[20,30,0.8,16,35,-20]]}]);
    api.handle(
        "PUT",
        &format!("/api/handwritten-notes/{id}/draft"),
        json!({"content":local,"baseFingerprint":record["baseFingerprint"]}),
        vec![],
    )
    .unwrap();
    let mut disk = record["content"].clone();
    disk["title"] = json!("External title");
    let original = serde_json::to_vec_pretty(&disk).unwrap();
    fs::write(&path, &original).unwrap();
    let route = format!("/api/handwritten-notes/{id}/conflict");
    let review = api.handle("GET", &route, Value::Null, vec![]).unwrap().body;
    let mut merged = local.clone();
    let mut second = disk["pages"][0].clone();
    second["id"] = json!("merged-page-copy");
    merged["pages"].as_array_mut().unwrap().push(second);
    let payload = json!({"locationRevision":review["locationRevision"],"diskFingerprint":review["diskFingerprint"],"draftRevision":review["draftRevision"],"localContent":local,"mergedContent":merged});
    let response = api
        .handle("POST", &route, payload.clone(), vec![])
        .unwrap()
        .body;
    assert_eq!(fs::read(&path).unwrap(), original);
    assert_eq!(response["note"]["content"], merged);
    assert_eq!(response["note"]["diskChanged"], false);
    assert_eq!(response["preservedCopies"].as_array().unwrap().len(), 3);
    for key in response["preservedCopies"].as_array().unwrap() {
        let copy: Value = serde_json::from_slice(
            &fs::read(
                temp.path()
                    .join("state/drafts-review")
                    .join(key.as_str().unwrap())
                    .join("copy.json"),
            )
            .unwrap(),
        )
        .unwrap();
        assert_eq!(copy["documentId"], id);
        assert!(copy["content"]["pages"].is_array());
    }
    let archives = api
        .handle("GET", "/api/recovery/archives", Value::Null, vec![])
        .unwrap()
        .body;
    assert!(archives["items"]
        .as_array()
        .unwrap()
        .iter()
        .all(|item| item["kind"] == "handwritten-note" && item["canCopy"] == true));
    assert!(api.handle("POST", &route, payload, vec![]).is_err());
    let unreviewed = api
        .handle(
            "PUT",
            &format!("/api/handwritten-notes/{id}"),
            json!({"content":merged,"baseFingerprint":response["note"]["baseFingerprint"]}),
            vec![],
        )
        .unwrap();
    assert_eq!(unreviewed.status, 428);
    assert_eq!(unreviewed.body["code"], "draft_revision_required");
    assert_eq!(unreviewed.body["operationOutcome"], "not-started");
    assert_eq!(fs::read(&path).unwrap(), original);
    assert_eq!(
        response["note"]["draftWriteRevision"]
            .as_str()
            .unwrap()
            .len(),
        64
    );
    let saved=api.handle("PUT",&format!("/api/handwritten-notes/{id}"),json!({"content":merged,"baseFingerprint":response["note"]["baseFingerprint"],"expectedDraftWriteRevision":response["note"]["draftWriteRevision"]}),vec![]).unwrap();
    assert_eq!(saved.status, 200);
    assert_eq!(saved.body["content"]["pages"], merged["pages"]);
    assert_eq!(saved.body["hasDraft"], false);
}
#[test]
fn future_sources_stale_drafts_and_failed_draft_writes_never_replace_the_note() {
    let (temp, api, id, path, record) = setup();
    let mut local = record["content"].clone();
    local["title"] = json!("Pending local");
    api.handle(
        "PUT",
        &format!("/api/handwritten-notes/{id}/draft"),
        json!({"content":local,"baseFingerprint":record["baseFingerprint"]}),
        vec![],
    )
    .unwrap();
    let route = format!("/api/handwritten-notes/{id}/conflict");
    let review = api.handle("GET", &route, Value::Null, vec![]).unwrap().body;
    let payload = json!({"locationRevision":review["locationRevision"],"diskFingerprint":review["diskFingerprint"],"draftRevision":review["draftRevision"],"localContent":local,"mergedContent":local});
    let draft = fs::read_dir(temp.path().join("state/drafts"))
        .unwrap()
        .next()
        .unwrap()
        .unwrap()
        .path();
    let original_draft = fs::read(&draft).unwrap();
    let original_source = fs::read(&path).unwrap();
    let permissions = fs::metadata(&draft).unwrap().permissions();
    let mut readonly = permissions.clone();
    readonly.set_readonly(true);
    fs::set_permissions(&draft, readonly).unwrap();
    let result = api.handle("POST", &route, payload.clone(), vec![]);
    fs::set_permissions(&draft, permissions).unwrap();
    assert!(result.is_err());
    assert_eq!(fs::read(&draft).unwrap(), original_draft);
    assert_eq!(fs::read(&path).unwrap(), original_source);
    let mut future = record["content"].clone();
    future["schemaVersion"] = json!(99);
    let bytes = serde_json::to_vec(&future).unwrap();
    fs::write(&path, &bytes).unwrap();
    assert!(api.handle("GET", &route, Value::Null, vec![]).is_err());
    assert!(api.handle("POST", &route, payload, vec![]).is_err());
    assert_eq!(fs::read(&path).unwrap(), bytes);
    assert_eq!(fs::read(&draft).unwrap(), original_draft);
}
