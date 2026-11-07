use knownext_storage::LocalApi;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    collections::BTreeMap,
    fs,
    path::{Path, PathBuf},
};
fn call(api: &LocalApi, method: &str, path: &str, body: Value) -> Value {
    let response = api.handle(method, path, body, vec![]).unwrap();
    assert_eq!(response.status, 200, "{}", response.body);
    response.body
}
fn files(root: &Path) -> BTreeMap<PathBuf, Vec<u8>> {
    fn walk(root: &Path, base: &Path, all: &mut BTreeMap<PathBuf, Vec<u8>>) {
        for entry in fs::read_dir(root).unwrap() {
            let entry = entry.unwrap();
            if matches!(
                entry.file_name().to_str(),
                Some("owner.lock" | "runtime-owner.lock" | "capture.lock")
            ) {
                continue;
            }
            let meta = fs::symlink_metadata(entry.path()).unwrap();
            if meta.is_dir() {
                walk(&entry.path(), base, all)
            } else {
                assert!(meta.is_file());
                all.insert(
                    entry.path().strip_prefix(base).unwrap().to_owned(),
                    fs::read(entry.path()).unwrap(),
                );
            }
        }
    }
    let mut all = BTreeMap::new();
    walk(root, root, &mut all);
    all
}
fn fixture() -> (tempfile::TempDir, LocalApi, String, String, Value) {
    let owned = tempfile::tempdir().unwrap();
    let api = LocalApi::new(owned.path().join("state"), "qa".into(), "test".into());
    let project = call(
        &api,
        "POST",
        "/api/projects",
        json!({"name":"Reopen receipts","versioningMode":"none","syncMode":"none"}),
    );
    let id = format!("{}::A.md", project["id"].as_str().unwrap());
    let root = PathBuf::from(project["folderPath"].as_str().unwrap());
    assert!(root.starts_with(owned.path()));
    fs::write(root.join("A.md"), b"Disk\n").unwrap();
    call(
        &api,
        "PUT",
        &format!("/api/documents/{id}/draft"),
        json!({"markdown":"Local\n"}),
    );
    let review = call(
        &api,
        "GET",
        &format!("/api/documents/{id}/conflict"),
        Value::Null,
    );
    let attempt = "attempt-owned-recovery-0001".to_string();
    let result = call(
        &api,
        "POST",
        &format!("/api/documents/{id}/conflict"),
        json!({"attemptId":attempt,"locationRevision":review["locationRevision"],"diskFingerprint":review["diskFingerprint"],"draftRevision":review["draftRevision"],"localMarkdown":"Local\n","mergedMarkdown":"Combined\n"}),
    );
    (owned, api, id, attempt, result)
}
#[test]
fn receipt_catalogue_and_copy_review_survive_reopen_without_request_registry_or_read_time_migration(
) {
    let (owned, _api, id, attempt, result) = fixture();
    let state = owned.path().join("state");
    let receipt = state
        .join("conflict-attempts")
        .join(format!("{attempt}.json"));
    let mut value: Value = serde_json::from_slice(&fs::read(&receipt).unwrap()).unwrap();
    value["phase"] = json!("applying");
    fs::write(&receipt, serde_json::to_vec(&value).unwrap()).unwrap();
    let current = state
        .join("drafts")
        .join(format!("v2_{:x}.json", Sha256::digest(id.as_bytes())));
    let legacy = state.join("drafts").join(format!(
        "{}.json",
        id.chars()
            .map(|c| if c.is_ascii_alphanumeric() { c } else { '_' })
            .collect::<String>()
    ));
    fs::rename(&current, &legacy).unwrap();
    fs::write(state.join("projects.json"), b"{ registry unavailable").unwrap();
    let reopened = LocalApi::new(state.clone(), "qa".into(), "test".into());
    let before = files(&state);
    let list = call(
        &reopened,
        "GET",
        "/api/recovery/conflict-attempts",
        Value::Null,
    );
    assert_eq!(list["items"][0]["id"], attempt);
    assert_eq!(list["items"][0]["phase"], "applying");
    let route = format!("/api/recovery/conflict-attempts/{attempt}");
    assert!(LocalApi::is_independent_snapshot("GET", &route));
    let detail = call(&reopened, "GET", &route, Value::Null);
    assert_eq!(detail["copiesVerified"], true);
    assert_eq!(detail["draftMatchesRecordedPublication"], true);
    assert_eq!(detail["fileStateReviewed"], false);
    assert_eq!(detail["remoteStateReviewed"], false);
    assert_eq!(detail["canReplay"], false);
    assert_eq!(detail["copies"].as_array().unwrap().len(), 3);
    let observed = detail["copies"]
        .as_array()
        .unwrap()
        .iter()
        .map(|copy| copy["key"].clone())
        .collect::<Vec<_>>();
    assert_eq!(
        observed,
        result["preservedCopies"].as_array().unwrap().to_vec()
    );
    assert!(detail.get("result").is_none());
    assert!(detail.get("sourceUnchanged").is_none());
    assert_eq!(files(&state), before);
    assert!(legacy.exists());
    assert!(!current.exists());
    let copy = &detail["copies"][0];
    let preview = call(
        &reopened,
        "POST",
        &format!(
            "/api/recovery/drafts/{}/preview",
            copy["key"].as_str().unwrap()
        ),
        json!({"fingerprint":copy["fingerprint"],"source":"archive"}),
    );
    assert_eq!(preview["text"], "Local\n");
    assert_eq!(files(&state), before);
}
#[test]
fn changed_draft_or_copy_is_reported_without_hiding_verified_variants_and_future_receipts_are_preserved(
) {
    let (owned, api, id, attempt, result) = fixture();
    let state = owned.path().join("state");
    let current = call(&api, "GET", &format!("/api/documents/{id}"), Value::Null);
    assert!(current["draftWriteRevision"].is_string());
    call(
        &api,
        "PUT",
        &format!("/api/documents/{id}/draft"),
        json!({"markdown":"Later work\n","expectedDraftWriteRevision":current["draftWriteRevision"]}),
    );
    let route = format!("/api/recovery/conflict-attempts/{attempt}");
    let detail = call(&api, "GET", &route, Value::Null);
    assert_eq!(detail["draftMatchesRecordedPublication"], false);
    assert_eq!(detail["copiesVerified"], true);
    let key = result["preservedCopies"][0].as_str().unwrap();
    fs::write(
        state.join("drafts-review").join(key).join("copy.json"),
        b"changed copy",
    )
    .unwrap();
    let before = files(&state);
    let detail = call(&api, "GET", &route, Value::Null);
    assert_eq!(detail["copiesVerified"], false);
    assert_eq!(detail["copies"].as_array().unwrap().len(), 2);
    assert!(!detail["warnings"].as_array().unwrap().is_empty());
    assert_eq!(files(&state), before);
    let receipt = state
        .join("conflict-attempts")
        .join(format!("{attempt}.json"));
    let mut future: Value = serde_json::from_slice(&fs::read(&receipt).unwrap()).unwrap();
    future["schemaVersion"] = json!(90);
    future["nextField"] = json!(true);
    fs::write(&receipt, serde_json::to_vec(&future).unwrap()).unwrap();
    let before = files(&state);
    let list = call(&api, "GET", "/api/recovery/conflict-attempts", Value::Null);
    assert_eq!(list["items"][0]["canReview"], false);
    assert!(!list["items"][0]["warning"].as_str().unwrap().is_empty());
    assert!(api.handle("GET", &route, Value::Null, vec![]).is_err());
    assert_eq!(files(&state), before);
}
#[test]
fn pending_receipt_has_no_inferred_publication_and_inventory_is_bounded_without_creating_or_pruning_state(
) {
    let owned = tempfile::tempdir().unwrap();
    let state = owned.path().join("state");
    fs::create_dir(&state).unwrap();
    let api = LocalApi::new(state.clone(), "qa".into(), "test".into());
    assert!(
        call(&api, "GET", "/api/recovery/conflict-attempts", Value::Null)["items"]
            .as_array()
            .unwrap()
            .is_empty()
    );
    assert!(!state.join("conflict-attempts").exists());
    let folder = state.join("conflict-attempts");
    fs::create_dir(&folder).unwrap();
    let attempt = "attempt-owned-pending-recovery";
    let pending = json!({"schemaVersion":1,"id":attempt,"documentId":"owned::A.md","kind":"markdown","operationId":"conflict-owned","requestHash":"a".repeat(64),"createdAt":"2026-11-02T00:00:00Z","phase":"preparing","copies":[],"targetPrepared":false,"afterDraftRevision":null});
    fs::write(
        folder.join(format!("{attempt}.json")),
        serde_json::to_vec(&pending).unwrap(),
    )
    .unwrap();
    let before = files(&state);
    let detail = call(
        &api,
        "GET",
        &format!("/api/recovery/conflict-attempts/{attempt}"),
        Value::Null,
    );
    assert!(detail["draftMatchesRecordedPublication"].is_null());
    assert_eq!(detail["copiesVerified"], false);
    assert_eq!(files(&state), before);
    for index in 0..1001 {
        fs::write(folder.join(format!("entry-unknown-{index}")), b"preserve").unwrap();
    }
    let before = files(&state);
    let list = call(&api, "GET", "/api/recovery/conflict-attempts", Value::Null);
    assert_eq!(list["scanned"], 1000);
    assert_eq!(list["limited"], true);
    assert_eq!(files(&state), before);
}

#[test]
fn archive_and_reopen_only_mark_a_completed_receipt_preserving_all_copies_and_attempt_identity() {
    let (owned, api, id, attempt, _) = fixture();
    let state = owned.path().join("state");
    let file = state
        .join("conflict-attempts")
        .join(format!("{attempt}.json"));
    let original: Value = serde_json::from_slice(&fs::read(&file).unwrap()).unwrap();
    let mut before = files(&state);
    before.remove(file.strip_prefix(&state).unwrap());
    let route = format!("/api/recovery/conflict-attempts/{attempt}");
    let detail = call(&api, "GET", &route, Value::Null);
    let action = format!("{route}/archive-state");
    assert!(!LocalApi::is_independent_snapshot("POST", &action));
    call(
        &api,
        "POST",
        &action,
        json!({"revision":detail["receipt"]["revision"],"action":"archive"}),
    );
    let archived = call(&api, "GET", &route, Value::Null);
    assert!(archived["receipt"]["archivedAt"].is_string());
    let marked = fs::read(&file).unwrap();
    let mut semantic: Value = serde_json::from_slice(&marked).unwrap();
    assert!(semantic
        .as_object_mut()
        .unwrap()
        .remove("archivedAt")
        .is_some());
    assert_eq!(semantic, original);
    let mut after = files(&state);
    after.remove(file.strip_prefix(&state).unwrap());
    assert_eq!(before, after);
    assert!(
        call(&api, "GET", "/api/recovery/conflict-attempts", Value::Null)["items"]
            .as_array()
            .unwrap()
            .is_empty()
    );
    assert_eq!(
        call(
            &api,
            "GET",
            "/api/recovery/conflict-attempt-archives",
            Value::Null
        )["items"][0]["id"],
        attempt
    );
    let reopened = LocalApi::new(state.clone(), "qa".into(), "test".into());
    assert!(call(&reopened, "GET", &route, Value::Null)["receipt"]["archivedAt"].is_string());
    assert_eq!(fs::read(&file).unwrap(), marked);
    let review = call(
        &reopened,
        "GET",
        &format!("/api/documents/{id}/conflict"),
        Value::Null,
    );
    assert!(reopened.handle("POST",&format!("/api/documents/{id}/conflict"),json!({"attemptId":attempt,"locationRevision":review["locationRevision"],"diskFingerprint":review["diskFingerprint"],"draftRevision":review["draftRevision"],"localMarkdown":"Combined\n","mergedMarkdown":"Replay must not run\n"}),vec![]).is_err());
    assert_eq!(fs::read(&file).unwrap(), marked);
    call(
        &reopened,
        "POST",
        &action,
        json!({"revision":archived["receipt"]["revision"],"action":"archive"}),
    );
    assert_eq!(fs::read(&file).unwrap(), marked);
    call(
        &reopened,
        "POST",
        &action,
        json!({"revision":archived["receipt"]["revision"],"action":"reopen"}),
    );
    assert!(call(&reopened, "GET", &route, Value::Null)["receipt"]["archivedAt"].is_null());
    assert!(call(
        &reopened,
        "GET",
        "/api/recovery/conflict-attempt-archives",
        Value::Null
    )["items"]
        .as_array()
        .unwrap()
        .is_empty());
    let restored: Value = serde_json::from_slice(&fs::read(&file).unwrap()).unwrap();
    assert_eq!(restored, original);
    let mut after = files(&state);
    after.remove(file.strip_prefix(&state).unwrap());
    assert_eq!(before, after);
}

#[test]
fn archive_refuses_pending_stale_future_and_delete_requests_without_touching_receipt_or_copies() {
    let (owned, api, _, attempt, _) = fixture();
    let state = owned.path().join("state");
    let file = state
        .join("conflict-attempts")
        .join(format!("{attempt}.json"));
    let original = fs::read(&file).unwrap();
    let route = format!("/api/recovery/conflict-attempts/{attempt}");
    let action = format!("{route}/archive-state");
    for payload in [
        json!({"revision":"f".repeat(64),"action":"archive"}),
        json!({"revision":"f".repeat(64),"action":"delete"}),
    ] {
        let before = files(&state);
        assert!(api.handle("POST", &action, payload, vec![]).is_err());
        assert_eq!(files(&state), before);
    }
    let mut pending: Value = serde_json::from_slice(&original).unwrap();
    pending["phase"] = json!("applying");
    fs::write(&file, serde_json::to_vec(&pending).unwrap()).unwrap();
    let detail = call(&api, "GET", &route, Value::Null);
    let before = files(&state);
    assert!(api
        .handle(
            "POST",
            &action,
            json!({"revision":detail["receipt"]["revision"],"action":"archive"}),
            vec![]
        )
        .is_err());
    assert_eq!(files(&state), before);
    let mut future: Value = serde_json::from_slice(&original).unwrap();
    future["schemaVersion"] = json!(7);
    fs::write(&file, serde_json::to_vec(&future).unwrap()).unwrap();
    let before = files(&state);
    assert!(api
        .handle(
            "POST",
            &action,
            json!({"revision":"a".repeat(64),"action":"archive"}),
            vec![]
        )
        .is_err());
    assert_eq!(files(&state), before);
}
