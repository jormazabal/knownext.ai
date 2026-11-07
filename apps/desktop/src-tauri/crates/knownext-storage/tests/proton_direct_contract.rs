use knownext_storage::LocalApi;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{fs, path::PathBuf};

fn fixture() -> (tempfile::TempDir, LocalApi, String, PathBuf, PathBuf) {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().join("documents");
    let api = LocalApi::new(temp.path().join("state"), "qa".into(), "test".into());
    let row = api
        .handle(
            "POST",
            "/api/projects",
            json!({"name":"Synthetic","folderPath":root,"versioningMode":"none","syncMode":"none"}),
            vec![],
        )
        .unwrap()
        .body;
    let id = row["id"].as_str().unwrap().to_owned();
    let dir = temp
        .path()
        .join("state/proton-direct")
        .join(format!("{:x}", Sha256::digest(id.as_bytes())));
    (temp, api, id, root, dir)
}
fn state(id: &str) -> Value {
    json!({"schemaVersion":1,"projectId":id,"deviceId":"receiver","generation":1,
    "binding":{"accountId":"synthetic-account","remoteRootId":"remote","accountRootId":"account-root","logicalProjectId":"logical","generation":1},
    "review":null,"paused":false,"base":{},"basePublications":{},"heads":{},"seen":[],"causal":null,"lastSentStamp":null,"publishAttempt":null,"receiveAttempt":null,"conflicts":[],"choices":{},"lastSyncedAt":"past","verifiedCurrent":true})
}
fn call(
    api: &LocalApi,
    id: &str,
    method: &str,
    action: &str,
    body: Value,
) -> Result<knownext_storage::LocalApiResponse, String> {
    api.handle(
        method,
        &format!("/api/projects/{id}/proton-direct{action}"),
        body,
        vec![],
    )
}

#[test]
fn direct_routes_are_scoped_and_do_not_write_without_an_account() {
    let (_temp, api, id, root, dir) = fixture();
    fs::write(root.join("original.md"), "Original").unwrap();
    let missing = call(&api, "missing", "GET", "", json!(null)).unwrap();
    assert_eq!(missing.status, 404);
    assert!(call(&api, &id, "POST", "/review", json!({"accountId":"absent"})).is_err());
    assert_eq!(
        fs::read_to_string(root.join("original.md")).unwrap(),
        "Original"
    );
    assert!(!dir.exists());
}

#[test]
fn malformed_nested_state_is_preserved_without_poisoning_other_queries() {
    let (_temp, api, id, _root, dir) = fixture();
    fs::create_dir_all(&dir).unwrap();
    let mut invalid = state(&id);
    invalid["deviceId"] = json!(null);
    let bytes = serde_json::to_vec(&invalid).unwrap();
    fs::write(dir.join("state.json"), &bytes).unwrap();
    assert!(call(&api, &id, "GET", "", json!(null)).is_err());
    assert_eq!(fs::read(dir.join("state.json")).unwrap(), bytes);
    fs::write(
        dir.join("state.json"),
        serde_json::to_vec(&state(&id)).unwrap(),
    )
    .unwrap();
    assert_eq!(call(&api, &id, "GET", "", json!(null)).unwrap().status, 200);
}

#[test]
fn confirmed_local_save_invalidates_an_old_remote_acknowledgement() {
    let (_temp, api, id, root, dir) = fixture();
    fs::create_dir_all(&dir).unwrap();
    fs::write(
        dir.join("state.json"),
        serde_json::to_vec(&state(&id)).unwrap(),
    )
    .unwrap();
    // Project mutations are observed only AFTER success and perform no network.
    let result = api
        .handle(
            "POST",
            &format!("/api/projects/{id}/documents"),
            json!({"name":"Saved.md","content":"# Saved"}),
            vec![],
        )
        .unwrap();
    assert!(result.status < 400);
    let status = call(&api, &id, "GET", "", json!(null)).unwrap().body;
    assert_eq!(status["remoteConfirmed"], false);
    assert!(status["pendingOperations"].as_u64().unwrap() > 0);
    assert!(root.exists());
}

#[test]
fn receive_recovers_a_write_with_lost_ack_before_any_provider_request() {
    let (_temp, api, id, root, dir) = fixture();
    fs::create_dir_all(dir.join("content")).unwrap();
    let before = b"Previous";
    let after = b"Received";
    let previous = format!("{:x}", Sha256::digest(before));
    let incoming = format!("{:x}", Sha256::digest(after));
    fs::write(root.join("document.md"), after).unwrap();
    fs::write(dir.join("content").join(&previous), before).unwrap();
    fs::write(dir.join("content").join(&incoming), after).unwrap();
    let mut stored = state(&id);
    stored["base"]["document.md"] = json!(previous);
    stored["basePublications"]["document.md"] = json!("parent");
    stored["receiveAttempt"] = json!({"manifest":{"schemaVersion":1,"projectId":"logical","publicationId":"received","senderId":"sender","parentPublication":"parent","files":{"document.md":{"sha256":incoming,"bytes":after.len()}},"directories":[],"exclusions":[]},"ancestors":["parent"],"completed":[],"plan":[{"path":"document.md","action":"write","expected":previous,"remote":incoming}]});
    fs::write(dir.join("state.json"), serde_json::to_vec(&stored).unwrap()).unwrap();
    // The later account lookup fails, but local receipt recovery has committed.
    assert!(call(&api, &id, "POST", "/sync", json!({})).is_err());
    let recovered: Value =
        serde_json::from_slice(&fs::read(dir.join("state.json")).unwrap()).unwrap();
    assert!(recovered["receiveAttempt"].is_null());
    assert_eq!(recovered["base"]["document.md"], incoming);
    assert_eq!(fs::read(root.join("document.md")).unwrap(), after);
    assert_eq!(
        fs::read(dir.join("content").join(previous)).unwrap(),
        before
    );
    assert_eq!(
        call(&api, &id, "GET", "", json!(null)).unwrap().body["remoteConfirmed"],
        false
    );
}

#[test]
fn keeping_local_conflict_bytes_invalidates_the_previous_publication_stamp() {
    let (_temp, api, id, root, dir) = fixture();
    fs::create_dir_all(dir.join("content")).unwrap();
    let local = b"Local choice";
    let remote = b"Concurrent remote";
    let local_hash = format!("{:x}", Sha256::digest(local));
    let remote_hash = format!("{:x}", Sha256::digest(remote));
    fs::write(root.join("document.md"), local).unwrap();
    fs::write(dir.join("content").join(&remote_hash), remote).unwrap();
    let mut stored = state(&id);
    stored["lastSentStamp"] = json!("previous-local-stamp");
    stored["choices"]["received:document.md"] =
        json!({"resolution":"local","localHash":local_hash});
    stored["receiveAttempt"] = json!({"manifest":{"schemaVersion":1,"projectId":"logical","publicationId":"received","senderId":"sender","parentPublication":null,"files":{"document.md":{"sha256":remote_hash,"bytes":remote.len()}},"directories":[],"exclusions":[]},"ancestors":[],"completed":[],"plan":null});
    fs::write(dir.join("state.json"), serde_json::to_vec(&stored).unwrap()).unwrap();
    assert!(call(&api, &id, "POST", "/sync", json!({})).is_err());
    let recovered: Value =
        serde_json::from_slice(&fs::read(dir.join("state.json")).unwrap()).unwrap();
    assert!(recovered["lastSentStamp"].is_null());
    assert_eq!(recovered["causal"], "received");
    assert_eq!(fs::read(root.join("document.md")).unwrap(), local);
}

#[test]
fn verified_own_ancestor_prevents_a_false_conflict_on_a_returning_edit() {
    let (_temp, api, id, root, dir) = fixture();
    fs::create_dir_all(dir.join("content")).unwrap();
    let local = b"Already published";
    let remote = b"Edited on the other device";
    let lh = format!("{:x}", Sha256::digest(local));
    let rh = format!("{:x}", Sha256::digest(remote));
    fs::write(root.join("document.md"), local).unwrap();
    fs::write(dir.join("content").join(&rh), remote).unwrap();
    let mut stored = state(&id);
    stored["base"]["document.md"] = json!(format!("{:x}", Sha256::digest(b"Older base")));
    stored["basePublications"]["document.md"] = json!("old");
    stored["receiveAttempt"] = json!({"manifest":{"schemaVersion":1,"projectId":"logical","publicationId":"returned","senderId":"other","parentPublication":"own","files":{"document.md":{"sha256":rh,"bytes":remote.len()}},"directories":[],"exclusions":[]},"ancestors":["own","old"],"observedBase":{"document.md":{"publicationId":"own","sha256":lh}},"completed":[],"plan":null});
    fs::write(dir.join("state.json"), serde_json::to_vec(&stored).unwrap()).unwrap();
    assert!(call(&api, &id, "POST", "/sync", json!({})).is_err());
    let recovered: Value =
        serde_json::from_slice(&fs::read(dir.join("state.json")).unwrap()).unwrap();
    assert!(recovered["receiveAttempt"].is_null());
    assert!(recovered["conflicts"].as_array().unwrap().is_empty());
    assert_eq!(fs::read(root.join("document.md")).unwrap(), remote);
}

#[test]
fn external_edit_cannot_reuse_a_durable_remote_acknowledgement() {
    let (_temp, api, id, root, dir) = fixture();
    fs::create_dir_all(&dir).unwrap();
    let mut stored = state(&id);
    stored["lastSentStamp"] = json!("outdated-snapshot");
    fs::write(dir.join("state.json"), serde_json::to_vec(&stored).unwrap()).unwrap();
    fs::write(root.join("external.md"), "Changed outside KnowNext").unwrap();
    assert_eq!(
        call(&api, &id, "GET", "", json!(null)).unwrap().body["remoteConfirmed"],
        false
    );
}

#[test]
fn received_deletion_keeps_a_causal_tombstone_against_an_unrelated_writer() {
    let (_temp, api, id, root, dir) = fixture();
    fs::create_dir_all(dir.join("content")).unwrap();
    let content = b"Offline variant";
    let sha = format!("{:x}", Sha256::digest(content));
    fs::write(dir.join("content").join(&sha), content).unwrap();
    let mut stored = state(&id);
    stored["base"]["deleted.md"] = json!(sha);
    stored["basePublications"]["deleted.md"] = json!("old");
    stored["receiveAttempt"] = json!({"manifest":{"schemaVersion":1,"projectId":"logical","publicationId":"deleted","senderId":"sender","parentPublication":"old","files":{},"directories":[],"exclusions":[]},"ancestors":["old"],"completed":[],"plan":[{"path":"deleted.md","action":"delete","expected":sha,"remote":null}]});
    fs::write(dir.join("state.json"), serde_json::to_vec(&stored).unwrap()).unwrap();
    assert!(call(&api, &id, "POST", "/sync", json!({})).is_err());
    let mut recovered: Value =
        serde_json::from_slice(&fs::read(dir.join("state.json")).unwrap()).unwrap();
    assert_eq!(recovered["basePublications"]["deleted.md"], "deleted");
    recovered["receiveAttempt"] = json!({"manifest":{"schemaVersion":1,"projectId":"logical","publicationId":"foreign","senderId":"offline","parentPublication":"old","files":{"deleted.md":{"sha256":sha,"bytes":content.len()}},"directories":[],"exclusions":[]},"ancestors":["old"],"completed":[],"plan":null});
    fs::write(
        dir.join("state.json"),
        serde_json::to_vec(&recovered).unwrap(),
    )
    .unwrap();
    assert!(call(&api, &id, "POST", "/sync", json!({})).is_ok());
    let reviewed: Value =
        serde_json::from_slice(&fs::read(dir.join("state.json")).unwrap()).unwrap();
    assert_eq!(reviewed["conflicts"][0]["path"], "deleted.md");
    assert!(!root.join("deleted.md").exists());
}

#[test]
fn empty_dirty_directory_is_not_a_pending_operation_and_unreadable_accounting_is_explicit() {
    let (_temp, api, id, _root, dir) = fixture();
    fs::create_dir_all(dir.join("dirty")).unwrap();
    let mut verified = state(&id);
    verified["lastSentStamp"] = json!(digest(
        &serde_json::to_vec(&json!({"files":{},"directories":[]})).unwrap()
    ));
    fs::write(
        dir.join("state.json"),
        serde_json::to_vec(&verified).unwrap(),
    )
    .unwrap();
    let empty = call(&api, &id, "GET", "", json!(null)).unwrap().body;
    assert_eq!(empty["pendingOperations"], 0);
    assert_eq!(empty["pendingUnknown"], false);
    assert!(empty["statusIssue"].is_null());
    // This reproduced the old silent Err => one phantom queued operation.
    fs::write(dir.join("dirty/unrecognized"), "Preserve unknown bytes").unwrap();
    let unknown = call(&api, &id, "GET", "", json!(null)).unwrap().body;
    assert_eq!(unknown["pendingOperations"], 0);
    assert_eq!(unknown["pendingUnknown"], true);
    assert_eq!(unknown["state"], "needs-review");
    assert!(unknown["statusIssue"].is_string());
    assert_eq!(unknown["remoteConfirmed"], false);
    assert_eq!(
        fs::read_to_string(dir.join("dirty/unrecognized")).unwrap(),
        "Preserve unknown bytes"
    );
}

#[test]
fn real_dirty_marker_remains_pending_without_an_accounting_error() {
    let (_temp, api, id, _root, dir) = fixture();
    fs::create_dir_all(dir.join("dirty")).unwrap();
    fs::write(
        dir.join("state.json"),
        serde_json::to_vec(&state(&id)).unwrap(),
    )
    .unwrap();
    fs::write(
        dir.join("dirty").join(format!("{}.dirty", "a".repeat(64))),
        b"knownext-proton-dirty/v1",
    )
    .unwrap();
    let status = call(&api, &id, "GET", "", json!(null)).unwrap().body;
    assert_eq!(status["state"], "pending");
    assert_eq!(status["pendingOperations"], 1);
    assert_eq!(status["pendingUnknown"], false);
}

fn incoming(files: Value, directories: Value) -> Value {
    json!({"schemaVersion":1,"projectId":"logical","publicationId":"received","senderId":"sender","parentPublication":"parent","files":files,"directories":directories,"exclusions":[]})
}
fn save_state(dir: &std::path::Path, value: &Value) {
    fs::create_dir_all(dir).unwrap();
    fs::write(dir.join("state.json"), serde_json::to_vec(value).unwrap()).unwrap();
}
fn load_state(dir: &std::path::Path) -> Value {
    serde_json::from_slice(&fs::read(dir.join("state.json")).unwrap()).unwrap()
}
fn digest(content: &[u8]) -> String {
    format!("{:x}", Sha256::digest(content))
}

#[test]
fn partial_receive_replans_only_unfinished_files_into_a_reviewable_conflict() {
    let (_temp, api, id, root, dir) = fixture();
    fs::create_dir_all(dir.join("content")).unwrap();
    let old = digest(b"Old");
    let remote_a = digest(b"Remote A");
    let remote_b = digest(b"Remote B");
    let local_b = digest(b"New local B");
    for (hash, content) in [
        (&old, b"Old".as_slice()),
        (&remote_a, b"Remote A".as_slice()),
        (&remote_b, b"Remote B".as_slice()),
    ] {
        fs::write(dir.join("content").join(hash), content).unwrap();
    }
    fs::write(root.join("a.md"), b"Remote A").unwrap();
    fs::write(root.join("b.md"), b"New local B").unwrap();
    let mut stored = state(&id);
    stored["lastSentStamp"] = json!("prior");
    for path in ["a.md", "b.md"] {
        stored["base"][path] = json!(old);
        stored["basePublications"][path] = json!("parent");
    }
    stored["receiveAttempt"] = json!({"manifest":incoming(json!({"a.md":{"sha256":remote_a,"bytes":8},"b.md":{"sha256":remote_b,"bytes":8}}),json!([])),"ancestors":["parent"],"completed":["a.md"],"plan":[{"path":"a.md","action":"write","expected":old,"remote":remote_a},{"path":"b.md","action":"write","expected":old,"remote":remote_b}]});
    save_state(&dir, &stored);
    assert!(call(&api, &id, "POST", "/sync", json!({})).is_ok());
    let reviewed = load_state(&dir);
    assert_eq!(reviewed["receiveAttempt"]["completed"], json!(["a.md"]));
    let conflict = &reviewed["conflicts"][0];
    assert_eq!(conflict["path"], "b.md");
    assert_eq!(conflict["localHash"], local_b);
    assert_eq!(fs::read(root.join("a.md")).unwrap(), b"Remote A");
    assert_eq!(fs::read(root.join("b.md")).unwrap(), b"New local B");
    call(
        &api,
        &id,
        "POST",
        "/conflicts/resolve",
        json!({"conflictId":conflict["id"],"revision":conflict["revision"],"resolution":"local"}),
    )
    .unwrap();
    // Provider is intentionally absent; the local receipt must finish first.
    assert!(call(&api, &id, "POST", "/sync", json!({})).is_err());
    let recovered = load_state(&dir);
    assert!(recovered["receiveAttempt"].is_null());
    assert!(recovered["lastSentStamp"].is_null());
    assert_eq!(fs::read(root.join("b.md")).unwrap(), b"New local B");
    assert_eq!(fs::read(dir.join("content").join(old)).unwrap(), b"Old");
}

#[test]
fn a_draft_appearing_after_receive_plan_becomes_a_conflict_without_overwriting_it() {
    let (temp, api, id, root, dir) = fixture();
    fs::create_dir_all(dir.join("content")).unwrap();
    let before = digest(b"Old");
    let after = digest(b"Remote");
    fs::write(root.join("a.md"), b"Old").unwrap();
    fs::write(dir.join("content").join(&after), b"Remote").unwrap();
    let mut stored = state(&id);
    stored["base"]["a.md"] = json!(before);
    stored["basePublications"]["a.md"] = json!("parent");
    stored["receiveAttempt"] = json!({"manifest":incoming(json!({"a.md":{"sha256":after,"bytes":6}}),json!([])),"ancestors":["parent"],"completed":[],"plan":[{"path":"a.md","action":"write","expected":before,"remote":after}]});
    save_state(&dir, &stored);
    let drafts = temp.path().join("state/drafts");
    fs::create_dir_all(&drafts).unwrap();
    let document = format!("{id}::a.md");
    let path = drafts.join(format!("v2_{}.json", digest(document.as_bytes())));
    let draft = json!({"schemaVersion":1,"documentId":document,"markdown":"Unsaved draft"});
    fs::write(&path, serde_json::to_vec(&draft).unwrap()).unwrap();
    assert!(call(&api, &id, "POST", "/sync", json!({})).is_ok());
    let result = load_state(&dir);
    assert_eq!(result["conflicts"][0]["path"], "a.md");
    assert!(result["conflicts"][0]["reason"]
        .as_str()
        .unwrap()
        .contains("borrador"));
    assert_eq!(fs::read(root.join("a.md")).unwrap(), b"Old");
    assert_eq!(
        serde_json::from_slice::<Value>(&fs::read(path).unwrap()).unwrap(),
        draft
    );
}

// Establish the positive base through the actual local receipt, rather
// than fabricating the private platform identity used by the engine.
fn establish_directory_base(api: &LocalApi, id: &str, dir: &std::path::Path, path: &str) -> Value {
    let mut stored = state(id);
    stored["receiveAttempt"] = json!({"manifest":incoming(json!({}),json!([path])),"ancestors":["parent"],"completed":[],"plan":null});
    save_state(dir, &stored);
    assert!(call(api, id, "POST", "/sync", json!({})).is_err());
    let established = load_state(dir);
    assert!(established["baseDirectoryStamps"][path].is_string());
    established["baseDirectoryStamps"][path].clone()
}

#[test]
fn reincarnated_empty_directory_between_receipts_is_preserved_and_legacy_base_is_safe() {
    let (temp, api, id, root, dir) = fixture();
    fs::create_dir(root.join("shared")).unwrap();
    let stamp = establish_directory_base(&api, &id, &dir, "shared");
    // Keep the former object alive outside the workspace to exclude inode/file
    // ID recycling and prove this is a different directory at the same path.
    fs::rename(root.join("shared"), temp.path().join("former-shared")).unwrap();
    fs::create_dir(root.join("shared")).unwrap();
    let mut stored = load_state(&dir);
    let mut deletion = incoming(json!({}), json!([]));
    deletion["publicationId"] = json!("deleted");
    stored["receiveAttempt"] =
        json!({"manifest":deletion,"ancestors":["received","parent"],"completed":[],"plan":null});
    save_state(&dir, &stored);
    assert!(call(&api, &id, "POST", "/sync", json!({})).is_err());
    assert!(root.join("shared").is_dir());
    let received = load_state(&dir);
    assert!(received["baseDirectoryStamps"]["shared"].is_null());
    assert!(received["lastSentStamp"].is_null());
    assert!(stamp.is_string());

    // A pre-upgrade base contains no identity proof; do not infer safe removal.
    let mut legacy = state(&id);
    legacy["baseDirectories"] = json!({"shared":true});
    legacy["baseDirectoryPublications"] = json!({"shared":"parent"});
    legacy["receiveAttempt"] = json!({"manifest":incoming(json!({}),json!([])),"ancestors":["parent"],"completed":[],"plan":null});
    save_state(&dir, &legacy);
    assert!(call(&api, &id, "POST", "/sync", json!({})).is_err());
    assert!(root.join("shared").is_dir());
}

#[test]
fn observed_empty_directory_move_removes_only_the_old_empty_directory() {
    let (_temp, api, id, root, dir) = fixture();
    fs::create_dir(root.join("old")).unwrap();
    fs::create_dir(root.join("local-only")).unwrap();
    let base_stamp = establish_directory_base(&api, &id, &dir, "old");
    let mut stored = state(&id);
    stored["baseDirectories"] = json!({"old":true});
    stored["baseDirectoryStamps"] = json!({"old":base_stamp});
    stored["baseDirectoryPublications"] = json!({"old":"parent"});
    stored["receiveAttempt"] = json!({"manifest":incoming(json!({}),json!(["new"])),"ancestors":["parent"],"completed":[],"plan":null});
    save_state(&dir, &stored);
    assert!(call(&api, &id, "POST", "/sync", json!({})).is_err());
    let received = load_state(&dir);
    assert!(!root.join("old").exists());
    assert!(root.join("new").is_dir());
    assert!(root.join("local-only").is_dir());
    assert_eq!(received["baseDirectories"]["old"], false);
    assert_eq!(received["baseDirectoryPublications"]["old"], "received");
}

#[test]
fn remote_directory_deletion_preserves_new_local_contents_and_requires_publication() {
    let (_temp, api, id, root, dir) = fixture();
    fs::create_dir(root.join("shared")).unwrap();
    fs::write(root.join("shared/local.md"), b"Keep new local").unwrap();
    let mut stored = state(&id);
    stored["lastSentStamp"] = json!("old");
    stored["baseDirectories"] = json!({"shared":true});
    stored["baseDirectoryPublications"] = json!({"shared":"parent"});
    stored["receiveAttempt"] = json!({"manifest":incoming(json!({}),json!([])),"ancestors":["parent"],"completed":[],"plan":null});
    save_state(&dir, &stored);
    assert!(call(&api, &id, "POST", "/sync", json!({})).is_err());
    let received = load_state(&dir);
    assert_eq!(
        fs::read(root.join("shared/local.md")).unwrap(),
        b"Keep new local"
    );
    assert!(received["lastSentStamp"].is_null());
    assert_eq!(received["baseDirectories"]["shared"], false);
}

#[test]
fn an_unobserved_directory_tombstone_cannot_recreate_a_locally_deleted_folder() {
    let (_temp, api, id, root, dir) = fixture();
    let mut stored = state(&id);
    stored["baseDirectories"] = json!({"shared":false});
    stored["baseDirectoryPublications"] = json!({"shared":"deleted"});
    stored["receiveAttempt"] = json!({"manifest":incoming(json!({}),json!(["shared"])),"ancestors":["parent"],"completed":[],"plan":null});
    save_state(&dir, &stored);
    assert!(call(&api, &id, "POST", "/sync", json!({})).is_err());
    assert!(!root.join("shared").exists());
}

#[test]
fn moving_the_last_file_retires_only_its_observed_now_empty_parent() {
    let (_temp, api, id, root, dir) = fixture();
    fs::create_dir(root.join("old")).unwrap();
    fs::write(root.join("old/a.md"), b"Content").unwrap();
    let sha = digest(b"Content");
    fs::create_dir_all(dir.join("content")).unwrap();
    fs::write(dir.join("content").join(&sha), b"Content").unwrap();
    let base_stamp = establish_directory_base(&api, &id, &dir, "old");
    let mut stored = state(&id);
    stored["base"]["old/a.md"] = json!(sha);
    stored["basePublications"]["old/a.md"] = json!("parent");
    stored["baseDirectories"] = json!({"old":true});
    stored["baseDirectoryStamps"] = json!({"old":base_stamp});
    stored["baseDirectoryPublications"] = json!({"old":"parent"});
    stored["receiveAttempt"] = json!({"manifest":incoming(json!({"new/a.md":{"sha256":sha,"bytes":7}}),json!(["new"])),"ancestors":["parent"],"completed":[],"plan":null});
    save_state(&dir, &stored);
    assert!(call(&api, &id, "POST", "/sync", json!({})).is_err());
    assert!(!root.join("old").exists());
    assert_eq!(fs::read(root.join("new/a.md")).unwrap(), b"Content");
}

#[test]
fn recreated_empty_directory_identity_is_preserved_after_a_partial_receipt() {
    let (_temp, api, id, root, dir) = fixture();
    fs::create_dir(root.join("shared")).unwrap();
    let mut stored = state(&id);
    stored["baseDirectories"] = json!({"shared":true});
    stored["baseDirectoryPublications"] = json!({"shared":"parent"});
    stored["receiveAttempt"] = json!({"manifest":incoming(json!({}),json!([])),"ancestors":["parent"],"completed":[],"plan":[],"directoryPlan":[{"path":"shared","action":"remove-if-empty","expectedStamp":"a".repeat(64),"remote":false}],"directoriesCompleted":[],"keptDirectories":false});
    save_state(&dir, &stored);
    assert!(call(&api, &id, "POST", "/sync", json!({})).is_err());
    assert!(root.join("shared").is_dir());
    let received = load_state(&dir);
    assert!(received["lastSentStamp"].is_null());
    assert!(received["receiveAttempt"].is_null());
}

#[test]
fn later_edit_to_an_already_completed_file_is_preserved_and_republished_causally() {
    let (_temp, api, id, root, dir) = fixture();
    fs::create_dir_all(dir.join("content")).unwrap();
    let remote = digest(b"Received");
    let old = digest(b"Old");
    fs::write(dir.join("content").join(&remote), b"Received").unwrap();
    fs::write(root.join("a.md"), b"New edit after completed write").unwrap();
    let mut stored = state(&id);
    stored["lastSentStamp"] = json!("prior");
    stored["base"]["a.md"] = json!(old);
    stored["basePublications"]["a.md"] = json!("parent");
    stored["receiveAttempt"] = json!({"manifest":incoming(json!({"a.md":{"sha256":remote,"bytes":8}}),json!([])),"ancestors":["parent"],"completed":["a.md"],"plan":[{"path":"a.md","action":"write","expected":old,"remote":remote}]});
    save_state(&dir, &stored);
    assert!(call(&api, &id, "POST", "/sync", json!({})).is_err());
    let received = load_state(&dir);
    assert!(received["receiveAttempt"].is_null());
    assert!(received["lastSentStamp"].is_null());
    assert_eq!(
        fs::read(root.join("a.md")).unwrap(),
        b"New edit after completed write"
    );
}

#[test]
fn deleting_a_received_parent_before_unfinished_files_needs_a_review_before_recreation() {
    let (_temp, api, id, root, dir) = fixture();
    fs::create_dir_all(dir.join("content")).unwrap();
    let remote = digest(b"Received");
    fs::write(dir.join("content").join(&remote), b"Received").unwrap();
    let mut stored = state(&id);
    stored["receiveAttempt"] = json!({"manifest":incoming(json!({"new/a.md":{"sha256":remote,"bytes":8}}),json!(["new"])),"ancestors":["parent"],"completed":[],"plan":[],"directoryPlan":[{"path":"new","action":"create","expectedStamp":null,"remote":true}],"directoriesCompleted":["new"],"keptDirectories":false});
    save_state(&dir, &stored);
    assert!(call(&api, &id, "POST", "/sync", json!({})).is_ok());
    let reviewed = load_state(&dir);
    let conflict = &reviewed["conflicts"][0];
    assert_eq!(conflict["path"], "new/a.md");
    assert!(!root.join("new").exists());
    call(
        &api,
        &id,
        "POST",
        "/conflicts/resolve",
        json!({"conflictId":conflict["id"],"revision":conflict["revision"],"resolution":"local"}),
    )
    .unwrap();
    assert!(call(&api, &id, "POST", "/sync", json!({})).is_err());
    assert!(!root.join("new").exists());
    assert!(load_state(&dir)["receiveAttempt"].is_null());
}
