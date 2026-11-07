use knownext_storage::LocalApi;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{fs, path::PathBuf};

fn fixture() -> (tempfile::TempDir, LocalApi, String, String, PathBuf) {
    let temp = tempfile::tempdir().unwrap();
    let state = temp.path().join("state");
    let api = LocalApi::new(state, "qa".into(), "test".into());
    let project = api
        .handle(
            "POST",
            "/api/projects",
            json!({"name":"Owned merge contract","versioningMode":"none","syncMode":"none"}),
            vec![],
        )
        .unwrap()
        .body;
    let project_id = project["id"].as_str().unwrap().to_string();
    let root = PathBuf::from(project["folderPath"].as_str().unwrap());
    let id = format!("{project_id}::review.md");
    fs::write(root.join("review.md"), "Base\n").unwrap();
    let original = api
        .handle("GET", &format!("/api/documents/{id}"), Value::Null, vec![])
        .unwrap()
        .body;
    api.handle(
        "PUT",
        &format!("/api/documents/{id}/draft"),
        json!({"markdown":"Local\n","baseFingerprint":original["baseFingerprint"]}),
        vec![],
    )
    .unwrap();
    fs::write(root.join("review.md"), "Disk\n").unwrap();
    (temp, api, project_id, id, root)
}
fn request(review: &Value) -> Value {
    json!({"locationRevision":review["locationRevision"],"diskFingerprint":review["diskFingerprint"],"draftRevision":review["draftRevision"],"localMarkdown":"Local\n","mergedMarkdown":"Local\nDisk\n"})
}
fn review(api: &LocalApi, id: &str) -> Value {
    api.handle(
        "GET",
        &format!("/api/documents/{id}/conflict"),
        Value::Null,
        vec![],
    )
    .unwrap()
    .body
}

#[test]
fn merge_contract_binds_location_and_preserves_sources_and_all_three_recovery_versions() {
    let (temp, api, project, id, root) = fixture();
    let snapshot = review(&api, &id);
    let registry_path = temp.path().join("state/projects.json");
    let original = fs::read(&registry_path).unwrap();
    let other = temp.path().join("other");
    fs::create_dir(&other).unwrap();
    fs::write(other.join("review.md"), "Disk\n").unwrap();
    let mut registry: Value = serde_json::from_slice(&original).unwrap();
    registry["projects"]
        .as_array_mut()
        .unwrap()
        .iter_mut()
        .find(|item| item["id"] == project)
        .unwrap()["folderPath"] = json!(other);
    fs::write(&registry_path, serde_json::to_vec(&registry).unwrap()).unwrap();
    assert!(api
        .handle(
            "POST",
            &format!("/api/documents/{id}/conflict"),
            request(&snapshot),
            vec![]
        )
        .is_err());
    assert!(!temp.path().join("state/drafts-review").exists());
    fs::write(&registry_path, original).unwrap();
    let result = api
        .handle(
            "POST",
            &format!("/api/documents/{id}/conflict"),
            request(&snapshot),
            vec![],
        )
        .unwrap()
        .body;
    assert_eq!(result["document"]["markdown"], "Local\nDisk\n");
    assert_eq!(result["preservedCopies"].as_array().unwrap().len(), 3);
    assert_eq!(
        fs::read_to_string(root.join("review.md")).unwrap(),
        "Disk\n"
    );
    assert_eq!(
        fs::read_to_string(other.join("review.md")).unwrap(),
        "Disk\n"
    );
    let archives = api
        .handle("GET", "/api/recovery/archives", Value::Null, vec![])
        .unwrap()
        .body;
    assert_eq!(archives["items"].as_array().unwrap().len(), 3);
    assert!(archives["items"]
        .as_array()
        .unwrap()
        .iter()
        .all(|copy| copy["canCopy"] == true));
    assert!(api
        .handle(
            "POST",
            &format!("/api/documents/{id}/conflict"),
            request(&snapshot),
            vec![]
        )
        .is_err());
}

#[test]
fn write_failure_and_unknown_draft_version_keep_data_and_do_not_acknowledge_a_merge() {
    let (temp, api, _project, id, root) = fixture();
    let snapshot = review(&api, &id);
    let draft = temp
        .path()
        .join("state/drafts")
        .join(format!("v2_{:x}.json", Sha256::digest(id.as_bytes())));
    let original = fs::read(&draft).unwrap();
    let permissions = fs::metadata(&draft).unwrap().permissions();
    let mut readonly = permissions.clone();
    readonly.set_readonly(true);
    fs::set_permissions(&draft, readonly).unwrap();
    let result = api.handle(
        "POST",
        &format!("/api/documents/{id}/conflict"),
        request(&snapshot),
        vec![],
    );
    fs::set_permissions(&draft, permissions).unwrap();
    assert!(result.is_err());
    assert_eq!(fs::read(&draft).unwrap(), original);
    assert_eq!(
        fs::read_to_string(root.join("review.md")).unwrap(),
        "Disk\n"
    );
    let mut future: Value = serde_json::from_slice(&original).unwrap();
    future["schemaVersion"] = json!(99);
    let future = serde_json::to_vec(&future).unwrap();
    fs::write(&draft, &future).unwrap();
    assert!(api
        .handle(
            "GET",
            &format!("/api/documents/{id}/conflict"),
            Value::Null,
            vec![]
        )
        .is_err());
    let blocked = api
        .handle(
            "DELETE",
            &format!("/api/documents/{id}/draft"),
            Value::Null,
            vec![],
        )
        .unwrap();
    assert_eq!(blocked.status, 503);
    assert_eq!(blocked.body["code"], "draft_state_unavailable");
    assert_eq!(blocked.body["operationOutcome"], "not-started");
    assert_eq!(fs::read(&draft).unwrap(), future);
    assert_eq!(
        fs::read_to_string(root.join("review.md")).unwrap(),
        "Disk\n"
    );
}
