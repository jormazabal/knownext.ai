use knownext_storage::LocalApi;
use serde_json::{json, Value};
use std::fs;
#[test]
fn known_legacy_archives_remain_byte_exact_and_future_or_inconsistent_manifests_never_authorize_recovery(
) {
    let temp = tempfile::tempdir().unwrap();
    let state = temp.path().join("state");
    let api = LocalApi::new(state.clone(), "qa".into(), "test".into());
    let project = api
        .handle(
            "POST",
            "/api/projects",
            json!({"name":"Own recovery","versioningMode":"none","syncMode":"none"}),
            vec![],
        )
        .unwrap()
        .body;
    fs::create_dir_all(state.join("drafts")).unwrap();
    let source = serde_json::to_vec(
        &json!({"documentId":"retired-own::Source.md","markdown":"# Own preserved recovery\n"}),
    )
    .unwrap();
    fs::write(state.join("drafts/owned_archive.json"), &source).unwrap();
    let listing = api
        .handle("GET", "/api/recovery/drafts", Value::Null, vec![])
        .unwrap()
        .body;
    let fingerprint = listing["items"][0]["fingerprint"].clone();
    let result = api
        .handle(
            "POST",
            "/api/recovery/drafts/owned_archive/archive",
            json!({"source":"active","fingerprint":fingerprint}),
            vec![],
        )
        .unwrap()
        .body;
    let key = result["archiveId"].as_str().unwrap();
    let folder = state.join("drafts-review").join(key);
    let manifest_path = folder.join("manifest.json");
    let original = fs::read(&manifest_path).unwrap();
    let mut known: Value = serde_json::from_slice(&original).unwrap();
    assert_eq!(known["schemaVersion"], 1);
    known.as_object_mut().unwrap().remove("schemaVersion");
    let legacy = serde_json::to_vec_pretty(&known).unwrap();
    fs::write(&manifest_path, &legacy).unwrap();
    let list = api
        .handle("GET", "/api/recovery/archives", Value::Null, vec![])
        .unwrap()
        .body;
    assert_eq!(list["items"][0]["canCopy"], true);
    assert_eq!(fs::read(&manifest_path).unwrap(), legacy);
    let preview_route = format!("/api/recovery/drafts/{key}/preview");
    let copy_route = format!("/api/recovery/drafts/{key}/copy");
    let payload = json!({"source":"archive","fingerprint":fingerprint,"projectId":project["id"],"name":"Must remain absent.md"});
    assert_eq!(
        api.handle("POST", &preview_route, payload.clone(), vec![])
            .unwrap()
            .body["text"],
        "Own preserved recovery\n"
    );
    let mut future = known.clone();
    future["schemaVersion"] = json!(99);
    let mut extension = known.clone();
    extension["futureRecoveryRule"] = json!({"keep":"owned"});
    let mut size = known.clone();
    size["bytes"] = json!(source.len() + 1);
    let mut owner = known.clone();
    owner["id"] = json!("recovery-foreign");
    let mut source_key = known.clone();
    source_key["sourceKey"] = json!("../foreign");
    let mut retention = known.clone();
    retention["retention"] = json!("future-rule");
    let mut date = known.clone();
    date["archivedAt"] = json!("invalid");
    let mut operation = known.clone();
    operation["operationId"] = json!("owned-incomplete");
    for invalid in [
        future, extension, size, owner, source_key, retention, date, operation,
    ] {
        let bytes = serde_json::to_vec_pretty(&invalid).unwrap();
        fs::write(&manifest_path, &bytes).unwrap();
        let list = api
            .handle("GET", "/api/recovery/archives", Value::Null, vec![])
            .unwrap()
            .body;
        assert_eq!(list["items"][0]["canCopy"], false);
        assert_eq!(list["items"][0]["state"], "unreadable");
        assert!(api
            .handle("POST", &preview_route, payload.clone(), vec![])
            .is_err());
        assert!(api
            .handle("POST", &copy_route, payload.clone(), vec![])
            .is_err());
        assert_eq!(fs::read(&manifest_path).unwrap(), bytes);
        assert_eq!(fs::read(folder.join("copy.json")).unwrap(), source);
        assert!(
            !std::path::Path::new(project["folderPath"].as_str().unwrap())
                .join("Must remain absent.md")
                .exists()
        );
    }
    fs::write(&manifest_path, &original).unwrap();
    assert!(api.handle("POST", &copy_route, payload, vec![]).is_ok());
    assert_eq!(fs::read(&manifest_path).unwrap(), original);
    assert_eq!(fs::read(folder.join("copy.json")).unwrap(), source);
}
