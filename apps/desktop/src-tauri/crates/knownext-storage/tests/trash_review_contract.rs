use knownext_storage::LocalApi;
use serde_json::{json, Value};
use std::{fs, path::PathBuf};

fn request(api: &LocalApi, method: &str, path: &str, body: Value) -> Value {
    let response = api.handle(method, path, body, vec![]).unwrap();
    assert!(response.status < 300, "{}", response.body);
    response.body
}
fn fixture() -> (tempfile::TempDir, LocalApi, String, PathBuf) {
    let owned = tempfile::tempdir().unwrap();
    let api = LocalApi::new(owned.path().join("state"), "qa".into(), "test".into());
    let project = request(
        &api,
        "POST",
        "/api/projects",
        json!({"name":"Owned trash review","versioningMode":"none","syncMode":"none"}),
    );
    let root = PathBuf::from(project["folderPath"].as_str().unwrap());
    (owned, api, project["id"].as_str().unwrap().into(), root)
}
fn apart(api: &LocalApi, project: &str, relative: &str) -> String {
    request(
        api,
        "DELETE",
        &format!("/api/projects/{project}/nodes/{project}::{relative}"),
        Value::Null,
    );
    let snapshot = request(
        api,
        "GET",
        &format!("/api/projects/{project}/trash"),
        Value::Null,
    );
    snapshot["entries"]
        .as_array()
        .unwrap()
        .iter()
        .find(|row| row["originalPath"] == relative)
        .unwrap()["id"]
        .as_str()
        .unwrap()
        .into()
}
fn refused(api: &LocalApi, path: &str, body: Value) {
    assert!(match api.handle("POST", path, body, vec![]) {
        Err(_) => true,
        Ok(r) => r.status >= 400,
    });
}

#[test]
fn stale_payload_review_and_missing_proof_never_restore_changed_content() {
    let (_owned, api, project, root) = fixture();
    fs::write(root.join("A.md"), b"selected original\n").unwrap();
    let id = apart(&api, &project, "A.md");
    let review_path = format!("/api/projects/{project}/trash/{id}/review");
    let restore_path = format!("/api/projects/{project}/trash/{id}/restore");
    let entry_path = root.join(".knownext-trash").join(&id).join("entry.json");
    let payload = entry_path.parent().unwrap().join("payload");
    let original_metadata = fs::read(&entry_path).unwrap();
    let selected = request(&api, "GET", &review_path, Value::Null);
    assert_eq!(fs::read(&entry_path).unwrap(), original_metadata);
    refused(&api, &restore_path, Value::Null);
    fs::write(&payload, b"newer private content\n").unwrap();
    refused(&api, &restore_path, review_body(&selected));
    assert!(!root.join("A.md").exists());
    assert_eq!(fs::read(&payload).unwrap(), b"newer private content\n");
    assert_eq!(fs::read(&entry_path).unwrap(), original_metadata);
    let fresh = request(&api, "GET", &review_path, Value::Null);
    assert_ne!(fresh["revision"], selected["revision"]);
    fs::write(root.join("A.md"), b"another creator\n").unwrap();
    refused(&api, &restore_path, review_body(&fresh));
    assert_eq!(fs::read(root.join("A.md")).unwrap(), b"another creator\n");
    assert_eq!(fs::read(&payload).unwrap(), b"newer private content\n");
    // Remove only this fixture's known collision, then make a new explicit review.
    fs::remove_file(root.join("A.md")).unwrap();
    let fresh = request(&api, "GET", &review_path, Value::Null);
    request(&api, "POST", &restore_path, review_body(&fresh));
    assert_eq!(
        fs::read(root.join("A.md")).unwrap(),
        b"newer private content\n"
    );
    assert!(!payload.exists());
    assert_eq!(fs::read(&entry_path).unwrap(), original_metadata);
}

#[test]
fn unknown_trash_metadata_is_preserved_and_cannot_authorize_publication() {
    let (_owned, api, project, root) = fixture();
    fs::write(root.join("A.md"), b"kept\n").unwrap();
    let id = apart(&api, &project, "A.md");
    let storage = root.join(".knownext-trash");
    let entry = storage.join(&id).join("entry.json");
    let restore = format!("/api/projects/{project}/trash/{id}/restore");
    let review = request(
        &api,
        "GET",
        &format!("/api/projects/{project}/trash/{id}/review"),
        Value::Null,
    );
    let original = fs::read(&entry).unwrap();
    let mut future: Value = serde_json::from_slice(&original).unwrap();
    future["format"] = json!(2);
    let future_bytes = serde_json::to_vec(&future).unwrap();
    fs::write(&entry, &future_bytes).unwrap();
    let snapshot = request(
        &api,
        "GET",
        &format!("/api/projects/{project}/trash"),
        Value::Null,
    );
    assert_eq!(snapshot["limited"], true);
    assert_eq!(snapshot["entries"].as_array().unwrap().len(), 0);
    refused(&api, &restore, review_body(&review));
    assert_eq!(fs::read(&entry).unwrap(), future_bytes);
    assert!(!root.join("A.md").exists());
    fs::write(&entry, &original).unwrap();
    let owner = storage.join("owner.json");
    let old = fs::read(&owner).unwrap();
    let future_owner =
        serde_json::to_vec(&json!({"format":1,"projectId":project,"futureMeaning":true})).unwrap();
    fs::write(&owner, &future_owner).unwrap();
    refused(&api, &restore, review_body(&review));
    assert_eq!(fs::read(&owner).unwrap(), future_owner);
    assert_eq!(
        fs::read(storage.join(&id).join("payload")).unwrap(),
        b"kept\n"
    );
    fs::write(owner, old).unwrap();
}

#[test]
fn folder_review_binds_descendants_and_inventory_reports_its_entry_limit() {
    let (_owned, api, project, root) = fixture();
    fs::create_dir_all(root.join("docs/assets")).unwrap();
    fs::write(root.join("docs/A.md"), b"document\n").unwrap();
    fs::write(root.join("docs/assets/image.png"), [1, 2, 3, 4]).unwrap();
    let id = apart(&api, &project, "docs");
    let path = format!("/api/projects/{project}/trash/{id}");
    let selected = request(&api, "GET", &format!("{path}/review"), Value::Null);
    let payload = root.join(".knownext-trash").join(&id).join("payload");
    fs::write(payload.join("assets/image.png"), [5, 6, 7, 8]).unwrap();
    refused(&api, &format!("{path}/restore"), review_body(&selected));
    assert!(!root.join("docs").exists());
    let fresh = request(&api, "GET", &format!("{path}/review"), Value::Null);
    request(
        &api,
        "POST",
        &format!("{path}/restore"),
        review_body(&fresh),
    );
    assert_eq!(
        fs::read(root.join("docs/assets/image.png")).unwrap(),
        [5, 6, 7, 8]
    );
    for i in 0..1001 {
        fs::write(
            root.join(".knownext-trash").join(format!("unknown-{i}")),
            b"preserved",
        )
        .unwrap();
    }
    let limited = request(
        &api,
        "GET",
        &format!("/api/projects/{project}/trash"),
        Value::Null,
    );
    assert_eq!(limited["limited"], true);
    assert!(limited["warnings"].as_array().unwrap().len() <= 21);
    assert_eq!(
        fs::read_dir(root.join(".knownext-trash")).unwrap().count(),
        1004
    );
}

fn review_body(review: &Value) -> Value {
    static NEXT: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(1);
    json!({"revision":review["revision"],"attemptId":format!("attempt-{:032x}",NEXT.fetch_add(1,std::sync::atomic::Ordering::Relaxed))})
}

#[test]
fn restore_receipt_survives_runtime_reopen_and_queries_do_not_replay_the_move() {
    let (owned, api, project, root) = fixture();
    fs::write(root.join("A.md"), b"owned original\n").unwrap();
    let entry = apart(&api, &project, "A.md");
    let route = format!("/api/projects/{project}/trash/{entry}");
    let selected = request(&api, "GET", &format!("{route}/review"), Value::Null);
    let body = review_body(&selected);
    let id = body["attemptId"].as_str().unwrap().to_string();
    let result = request(&api, "POST", &format!("{route}/restore"), body.clone());
    assert_eq!(result["restoreAttemptId"], id);
    assert_eq!(result["restoredRevision"], selected["revision"]);
    let receipt_path = root
        .join(".knownext-trash")
        .join(&entry)
        .join(format!("restore-{id}.json"));
    let before = fs::read(&receipt_path).unwrap();
    drop(api);
    let reopened = LocalApi::new(owned.path().join("state"), "qa".into(), "test".into());
    let proof = request(
        &reopened,
        "GET",
        &format!("{route}/restores/{id}"),
        Value::Null,
    );
    assert_eq!(proof["status"], "confirmed");
    assert_eq!(proof["canReplay"], false);
    assert!(proof["result"]["tree"].is_array());
    assert_eq!(fs::read(&receipt_path).unwrap(), before);
    refused(&reopened, &format!("{route}/restore"), body);
    assert_eq!(fs::read(&receipt_path).unwrap(), before);
    assert_eq!(fs::read(root.join("A.md")).unwrap(), b"owned original\n");
    let catalogue = request(
        &reopened,
        "GET",
        &format!("/api/projects/{project}/trash"),
        Value::Null,
    );
    assert_eq!(catalogue["restorations"][0]["id"], id);
}
