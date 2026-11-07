use knownext_storage::LocalApi;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{fs, path::PathBuf};

fn digest(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}
fn seal(mut value: Value) -> Value {
    value.as_object_mut().unwrap().remove("revision");
    value["revision"] = json!(digest(&serde_json::to_vec(&value).unwrap()));
    value
}
fn fixture() -> (
    tempfile::TempDir,
    LocalApi,
    String,
    PathBuf,
    PathBuf,
    PathBuf,
) {
    let temp = tempfile::tempdir().unwrap();
    let data = temp.path().join("state");
    let root = temp.path().join("documents");
    let api = LocalApi::new(data.clone(), "qa".into(), "test".into());
    let row = api
        .handle(
            "POST",
            "/api/projects",
            json!({"name":"Lifecycle","folderPath":root,"versioningMode":"none","syncMode":"none"}),
            vec![],
        )
        .unwrap()
        .body;
    let id = row["id"].as_str().unwrap().to_owned();
    let dir = data.join("proton-direct").join(digest(id.as_bytes()));
    fs::create_dir_all(dir.join("content")).unwrap();
    fs::write(root.join("Original.md"), b"Original content").unwrap();
    write_state(
        &dir,
        &json!({"schemaVersion":1,"projectId":id,"deviceId":"device","generation":1,"binding":null,"review":null,"paused":false,
        "base":{},"basePublications":{},"heads":{},"seen":[],"manifestStamps":{},"causal":null,"lastSentStamp":null,"publishAttempt":null,"receiveAttempt":null,"conflicts":[],"choices":{},"lastSyncedAt":null}),
    );
    (temp, api, id, root, data, dir)
}
fn load(dir: &std::path::Path) -> Value {
    serde_json::from_slice(&fs::read(dir.join("state.json")).unwrap()).unwrap()
}
fn write_state(dir: &std::path::Path, value: &Value) {
    fs::write(dir.join("state.json"), serde_json::to_vec(value).unwrap()).unwrap();
}
fn call(
    api: &LocalApi,
    id: &str,
    method: &str,
    suffix: &str,
    body: Value,
) -> Result<Value, String> {
    let result = api.handle(
        method,
        &format!("/api/projects/{id}/proton-direct/{suffix}"),
        body,
        vec![],
    )?;
    if result.status >= 400 {
        return Err(format!("status {}", result.status));
    }
    Ok(result.body)
}
fn request(value: &Value) -> Value {
    json!({"id":value["id"],"revision":value["revision"]})
}
fn attempt_request(value: &Value) -> Value {
    json!({"attemptId":value["id"],"revision":value["revision"]})
}

#[test]
fn retention_review_apply_survives_its_own_metadata_and_is_idempotent() {
    let (_temp, api, id, root, _data, dir) = fixture();
    let bytes = b"Original content";
    let sha = digest(bytes);
    fs::write(dir.join("content").join(&sha), bytes).unwrap();
    let review = call(&api, &id, "POST", "retention/review", json!({})).unwrap();
    assert_eq!(review["reclaimableBytes"], bytes.len());
    assert_eq!(review["candidates"].as_array().unwrap().len(), 1);
    let receipt = call(&api, &id, "POST", "retention/apply", request(&review)).unwrap();
    assert_eq!(receipt["state"], "complete");
    assert_eq!(receipt["reclaimedBytes"], bytes.len());
    assert!(!dir.join("content").join(&sha).exists());
    assert_eq!(fs::read(root.join("Original.md")).unwrap(), bytes);
    assert_eq!(
        call(&api, &id, "POST", "retention/apply", request(&review)).unwrap()["receiptId"],
        receipt["receiptId"]
    );
    let next = call(&api, &id, "POST", "retention/review", json!({})).unwrap();
    call(&api, &id, "POST", "retention/apply", request(&next)).unwrap();
    let persisted = load(&dir);
    let history = persisted["lifecycle"]["retentionHistory"]
        .as_array()
        .unwrap();
    assert_eq!(
        history
            .iter()
            .filter(|row| row["receipt"]["receiptId"] == receipt["receiptId"])
            .count(),
        1
    );
    assert!(call(&api, &id, "POST", "retention/apply", request(&review)).is_err());
}

#[test]
fn retention_preserves_bases_and_unknown_private_payloads() {
    let (_temp, api, id, _root, _data, dir) = fixture();
    let sha = digest(b"Original content");
    fs::write(dir.join("content").join(&sha), b"Original content").unwrap();
    let mut state = load(&dir);
    state["base"]["Original.md"] = json!(sha);
    write_state(&dir, &state);
    let review = call(&api, &id, "POST", "retention/review", json!({})).unwrap();
    assert_eq!(review["reclaimableBytes"], 0);
    state["base"] = json!({});
    write_state(&dir, &state);
    fs::write(dir.join("unknown-future.bin"), b"preserve").unwrap();
    let review = call(&api, &id, "POST", "retention/review", json!({})).unwrap();
    assert_eq!(review["reclaimableBytes"], 0);
    let storage = call(&api, &id, "GET", "storage", json!(null)).unwrap();
    assert_eq!(storage["limitBytes"], 1024u64 * 1024 * 1024);
    assert_eq!(storage["remoteQuotaKnown"], false);
    assert!(dir.join("content").join(sha).exists());
    assert_eq!(
        fs::read(dir.join("unknown-future.bin")).unwrap(),
        b"preserve"
    );
}

#[test]
fn retention_rejects_source_changes_after_review_without_deleting() {
    let (_temp, api, id, root, _data, dir) = fixture();
    let sha = digest(b"Original content");
    fs::write(dir.join("content").join(&sha), b"Original content").unwrap();
    let review = call(&api, &id, "POST", "retention/review", json!({})).unwrap();
    fs::write(root.join("Original.md"), b"New edit").unwrap();
    assert!(call(&api, &id, "POST", "retention/apply", request(&review)).is_err());
    assert!(dir.join("content").join(sha).exists());
}

#[test]
fn partial_cleanup_reopens_same_review_without_replaying_completed_deletion() {
    let (_temp, api, id, root, data, dir) = fixture();
    fs::write(root.join("Other.md"), b"Other").unwrap();
    let first = digest(b"Original content");
    let second = digest(b"Other");
    fs::write(dir.join("content").join(&first), b"Original content").unwrap();
    fs::write(dir.join("content").join(&second), b"Other").unwrap();
    let review = call(&api, &id, "POST", "retention/review", json!({})).unwrap();
    let mut state = load(&dir);
    fs::remove_file(dir.join("content").join(&first)).unwrap();
    state["lifecycle"]["retentionAttempt"] = json!({"receiptId":"cleanup","reviewId":review["id"],"state":"pending","completed":[first],"reclaimedBytes":16});
    write_state(&dir, &state);
    drop(api);
    let reopened = LocalApi::new(data, "qa".into(), "test".into());
    let recovered = call(&reopened, &id, "POST", "retention/review", json!({})).unwrap();
    assert_eq!(recovered["id"], review["id"]);
    assert_eq!(recovered["revision"], review["revision"]);
    assert_eq!(recovered["resume"], true);
    let receipt = call(
        &reopened,
        &id,
        "POST",
        "retention/apply",
        request(&recovered),
    )
    .unwrap();
    assert_eq!(receipt["state"], "complete");
    assert_eq!(receipt["reclaimedBytes"], 21);
    assert!(!dir.join("content").join(second).exists());
    assert!(root.join("Original.md").exists());
    assert!(root.join("Other.md").exists());
}

#[test]
fn now_protected_cleanup_can_cancel_and_review_again_after_restart() {
    let (_temp, api, id, _root, data, dir) = fixture();
    let sha = digest(b"Original content");
    fs::write(dir.join("content").join(&sha), b"Original content").unwrap();
    let review = call(&api, &id, "POST", "retention/review", json!({})).unwrap();
    let mut state = load(&dir);
    state["lifecycle"]["retentionAttempt"] = json!({"receiptId":"cleanup","reviewId":review["id"],"state":"pending","completed":[],"reclaimedBytes":0});
    state["base"]["Original.md"] = json!(sha);
    write_state(&dir, &state);
    drop(api);
    let reopened = LocalApi::new(data, "qa".into(), "test".into());
    let recovered = call(&reopened, &id, "POST", "retention/review", json!({})).unwrap();
    assert_eq!(recovered["id"], review["id"]);
    assert!(call(
        &reopened,
        &id,
        "POST",
        "retention/apply",
        request(&recovered)
    )
    .is_err());
    let cancelled = call(
        &reopened,
        &id,
        "POST",
        "retention/cancel",
        request(&recovered),
    )
    .unwrap();
    assert_eq!(cancelled["state"], "cancelled");
    assert_eq!(
        call(
            &reopened,
            &id,
            "POST",
            "retention/cancel",
            request(&recovered)
        )
        .unwrap()["receiptId"],
        cancelled["receiptId"]
    );
    let next = call(&reopened, &id, "POST", "retention/review", json!({})).unwrap();
    assert_ne!(next["id"], review["id"]);
    assert_eq!(next["reclaimableBytes"], 0);
    assert!(dir.join("content").join(sha).exists());
}

fn ready_local_recovery(api: &LocalApi, id: &str, dir: &std::path::Path) -> Value {
    let mut state = load(dir);
    state["binding"] = json!({"accountId":"synthetic","remoteRootId":"remote","accountRootId":"account","logicalProjectId":"logical","generation":1});
    write_state(dir, &state);
    let review = call(
        api,
        id,
        "POST",
        "migration/review",
        json!({"target":"local","allowLocalRecovery":true}),
    )
    .unwrap();
    assert_eq!(review["canStart"], true);
    let started = call(api, id, "POST", "migration/start", request(&review)).unwrap();
    assert_eq!(started["phase"], "ready");
    started
}

#[test]
fn explicit_local_recovery_changes_binding_only_after_ack_and_preserves_identity_and_history() {
    let (_temp, api, id, root, data, dir) = fixture();
    fs::create_dir(root.join(".git")).unwrap();
    fs::write(root.join(".git/history"), b"Retain local history").unwrap();
    let ready = ready_local_recovery(&api, &id, &dir);
    assert!(load(&dir)["binding"].is_object());
    let handoff = api
        .prepare_proton_migration_ack(&id, attempt_request(&ready))
        .unwrap();
    assert_eq!(
        call(&api, &id, "POST", "migration/ack", handoff).unwrap()["phase"],
        "switching"
    );
    let receipt = api
        .finalize_proton_migration_ack(&id, json!({"attemptId":ready["id"]}))
        .unwrap();
    assert_eq!(receipt["phase"], "complete");
    assert_eq!(receipt["fullyMigrated"], false);
    assert_eq!(receipt["localRecovery"], true);
    assert!(load(&dir)["binding"].is_null());
    let registry: Value =
        serde_json::from_slice(&fs::read(data.join("projects.json")).unwrap()).unwrap();
    assert_eq!(registry["projects"][0]["id"], id);
    assert_eq!(
        PathBuf::from(registry["projects"][0]["folderPath"].as_str().unwrap())
            .canonicalize()
            .unwrap(),
        root.canonicalize().unwrap()
    );
    assert_eq!(
        fs::read(root.join(".git/history")).unwrap(),
        b"Retain local history"
    );
    assert_eq!(
        fs::read(root.join("Original.md")).unwrap(),
        b"Original content"
    );
}

#[test]
fn edits_after_review_require_new_review_and_cancel_restores_original_association() {
    let (_temp, api, id, root, _data, dir) = fixture();
    let review = call(
        &api,
        &id,
        "POST",
        "migration/review",
        json!({"target":"local"}),
    )
    .unwrap();
    fs::write(root.join("Original.md"), b"New local content").unwrap();
    assert!(call(&api, &id, "POST", "migration/start", request(&review)).is_err());
    let cancelled = call(
        &api,
        &id,
        "POST",
        "migration/cancel",
        attempt_request(&review),
    )
    .unwrap();
    assert_eq!(cancelled["phase"], "cancelled");
    assert!(load(&dir)["binding"].is_null());
    assert_eq!(
        fs::read(root.join("Original.md")).unwrap(),
        b"New local content"
    );
}

#[test]
fn commit_recovery_after_registry_write_preserves_new_edit_and_records_it_pending() {
    let (_temp, api, id, root, data, dir) = fixture();
    let ready = ready_local_recovery(&api, &id, &dir);
    let _ = api
        .prepare_proton_migration_ack(&id, attempt_request(&ready))
        .unwrap();
    let mut state = load(&dir);
    let mut attempt = state["lifecycle"]["migration"].clone();
    let mut registry: Value =
        serde_json::from_slice(&fs::read(data.join("projects.json")).unwrap()).unwrap();
    let before = registry["projects"][0].clone();
    let mut after = before.clone();
    after["syncMigrationId"] = attempt["id"].clone();
    after["syncMode"] = json!("none");
    let mut target = state.clone();
    target.as_object_mut().unwrap().remove("lifecycle");
    target["binding"] = Value::Null;
    target["generation"] = json!(2);
    target["verifiedCurrent"] = json!(false);
    attempt["phase"] = json!("switching");
    attempt["switch"] = json!({"beforeRegistry":before,"afterRegistry":after,"afterEngine":target,"committed":false});
    attempt = seal(attempt);
    state["lifecycle"]["migration"] = attempt.clone();
    write_state(&dir, &state);
    registry["projects"][0] = after;
    fs::write(
        data.join("projects.json"),
        serde_json::to_vec(&registry).unwrap(),
    )
    .unwrap();
    fs::write(
        root.join("Original.md"),
        b"Edit after interrupted registry commit",
    )
    .unwrap();
    drop(api);
    let reopened = LocalApi::new(data, "qa".into(), "test".into());
    let query = call(&reopened, &id, "GET", "migration", json!(null)).unwrap();
    assert_eq!(query["attempt"]["phase"], "switching");
    assert_eq!(query["attempt"]["canAcknowledge"], true);
    let handoff = reopened
        .prepare_proton_migration_ack(&id, attempt_request(&query["attempt"]))
        .unwrap();
    let switched = call(&reopened, &id, "POST", "migration/ack", handoff).unwrap();
    assert_eq!(switched["pendingLocalChanges"], true);
    let done = reopened
        .finalize_proton_migration_ack(&id, json!({"attemptId":attempt["id"]}))
        .unwrap();
    assert_eq!(done["fullyMigrated"], false);
    assert!(load(&dir)["binding"].is_null());
    assert_eq!(load(&dir)["verifiedCurrent"], false);
    assert!(fs::read_dir(dir.join("dirty")).unwrap().next().is_some());
    assert_eq!(
        fs::read(root.join("Original.md")).unwrap(),
        b"Edit after interrupted registry commit"
    );
}

#[test]
fn future_lifecycle_is_preserved_and_source_hold_pauses_github_without_authentication() {
    let (_temp, api, id, _root, data, dir) = fixture();
    let mut state = load(&dir);
    state["lifecycle"] = json!({"schemaVersion":999,"future":true});
    let original = serde_json::to_vec(&state).unwrap();
    fs::write(dir.join("state.json"), &original).unwrap();
    assert!(call(&api, &id, "GET", "migration", json!(null)).is_err());
    assert_eq!(fs::read(dir.join("state.json")).unwrap(), original);
    state["lifecycle"] = json!({"schemaVersion":1,"retentionReview":null,"retentionAttempt":null,"migration":{"id":"attempt","phase":"staging"},"receipts":[]});
    write_state(&dir, &state);
    let mut registry: Value =
        serde_json::from_slice(&fs::read(data.join("projects.json")).unwrap()).unwrap();
    registry["projects"][0]["syncMode"] = json!("auto-github");
    fs::write(
        data.join("projects.json"),
        serde_json::to_vec(&registry).unwrap(),
    )
    .unwrap();
    let status = api
        .handle(
            "GET",
            &format!("/api/projects/{id}/sync/status"),
            json!(null),
            vec![],
        )
        .unwrap();
    assert_eq!(status.status, 200);
    assert_eq!(status.body["remotePaused"], true);
}

#[test]
fn legacy_partial_receipt_cannot_be_labelled_as_a_clean_local_migration() {
    let (_temp, api, id, root, data, _dir) = fixture();
    let legacy = data.join("proton-sync").join(digest(id.as_bytes()));
    fs::create_dir_all(&legacy).unwrap();
    let original=serde_json::to_vec(&json!({"schemaVersion":1,"projectId":id,"generation":1,"binding":null,"receiveAttempt":{"status":"applying"},"publishAttempt":null,"base":{},"basePublications":{},"remoteHeads":{},"seenPublications":[]})).unwrap();
    fs::write(legacy.join("state.json"), &original).unwrap();
    let result = call(
        &api,
        &id,
        "POST",
        "migration/review",
        json!({"target":"local"}),
    );
    assert!(result.is_err() || result.unwrap()["canStart"] == false);
    assert_eq!(fs::read(legacy.join("state.json")).unwrap(), original);
    assert_eq!(
        fs::read(root.join("Original.md")).unwrap(),
        b"Original content"
    );
}

#[test]
fn reviewed_migration_reopens_its_saved_destination_scope_and_can_prepare_same_review() {
    let (_temp, api, id, _root, data, _dir) = fixture();
    let review = call(
        &api,
        &id,
        "POST",
        "migration/review",
        json!({"target":"local"}),
    )
    .unwrap();
    drop(api);
    let reopened = LocalApi::new(data, "qa".into(), "test".into());
    let query = call(&reopened, &id, "GET", "migration", json!(null)).unwrap();
    assert_eq!(query["attempt"]["id"], review["id"]);
    assert_eq!(query["attempt"]["target"], "local");
    assert_eq!(query["attempt"]["summary"], json!({"files":1,"bytes":16}));
    assert_eq!(query["attempt"]["canStart"], true);
    assert!(query["attempt"]["destinationAccountId"].is_null());
    assert_eq!(query["review"]["id"], review["id"]);
    assert_eq!(query["review"]["revision"], review["revision"]);
    let started = call(
        &reopened,
        &id,
        "POST",
        "migration/start",
        request(&query["review"]),
    )
    .unwrap();
    assert_eq!(started["id"], review["id"]);
    assert_eq!(started["phase"], "ready");
    assert_eq!(started["summary"], json!({"files":1,"bytes":16}));

    // A persisted provider-review fixture verifies projection only: querying
    // must preserve this account/root instead of a form's default local target.
    // It never authenticates, contacts Proton or executes this fixture's start.
    let (_other, other_api, other_id, _other_root, other_data, other_dir) = fixture();
    call(
        &other_api,
        &other_id,
        "POST",
        "migration/review",
        json!({"target":"local"}),
    )
    .unwrap();
    let mut state = load(&other_dir);
    let mut persisted = state["lifecycle"]["migration"].clone();
    persisted["target"] = json!("proton");
    persisted["destination"]["accountId"] = json!("reviewed-account");
    persisted["destination"]["remoteRootId"] = json!("reviewed-root");
    persisted["remoteProjects"] = json!([{"id":"reviewed-root","name":"Origen conservado de QA","logicalProjectId":persisted["logicalProjectId"]}]);
    persisted = seal(persisted);
    state["lifecycle"]["migration"] = persisted.clone();
    write_state(&other_dir, &state);
    drop(other_api);
    let other_reopened = LocalApi::new(other_data, "qa".into(), "test".into());
    let recovered = call(&other_reopened, &other_id, "GET", "migration", json!(null)).unwrap();
    assert_eq!(recovered["attempt"]["id"], persisted["id"]);
    assert_eq!(recovered["attempt"]["target"], "proton");
    assert_eq!(recovered["attempt"]["destination"], "Proton Drive");
    assert_eq!(
        recovered["attempt"]["destinationAccountId"],
        "reviewed-account"
    );
    assert_eq!(
        recovered["attempt"]["destinationName"],
        "Origen conservado de QA"
    );
    assert_eq!(recovered["review"]["revision"], persisted["revision"]);
    assert_eq!(
        recovered["review"]["summary"],
        json!({"files":1,"bytes":16})
    );
    assert_eq!(recovered["review"]["canStart"], true);
}
