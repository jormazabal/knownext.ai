use knownext_storage::LocalApi;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::fs;
fn hash(value: &str) -> String {
    format!("{:x}", Sha256::digest(value.as_bytes()))
}
fn view(api: &LocalApi) -> Value {
    let result = api
        .handle("GET", "/api/recovery/storage/quotas", Value::Null, vec![])
        .unwrap();
    assert_eq!(result.status, 200, "{}", result.body);
    result.body
}
#[test]
fn block9_backup_capacity_reports_project_scope_without_reading_payloads() {
    let owned = tempfile::tempdir().unwrap();
    let state = owned.path().join("state");
    let api = LocalApi::new(state.clone(), "qa".into(), "test".into());
    let response = api
        .handle(
            "POST",
            "/api/projects",
            json!({"name":"Backup quota","versioningMode":"none","syncMode":"none"}),
            vec![],
        )
        .unwrap();
    assert_eq!(response.status, 200);
    let project = response.body["id"].as_str().unwrap();
    let root = state.join("scheduled-backups").join(hash(project));
    fs::create_dir_all(&root).unwrap();
    let future = b"{\"schemaVersion\":99,\"private\":\"BACKUP_CONTENT_SENTINEL\"}";
    fs::write(root.join("state.json"), future).unwrap();
    fs::write(root.join("unknown.zip"), [7u8; 9]).unwrap();
    let inventory = view(&api);
    let row = inventory["items"]
        .as_array()
        .unwrap()
        .iter()
        .find(|r| r["family"] == "scheduled-backups")
        .unwrap();
    assert_eq!(row["scope"], "project");
    assert_eq!(row["projectId"], project);
    assert_eq!(row["entries"], 2);
    assert_eq!(row["maxEntries"], 65);
    assert_eq!(row["maxBytes"], 10u64 * 1024 * 1024 * 1024);
    assert_eq!(row["contentsVerified"], false);
    assert!(!inventory.to_string().contains("BACKUP_CONTENT_SENTINEL"));
    assert_eq!(fs::read(root.join("state.json")).unwrap(), future);
}
#[test]
fn metadata_capacity_keeps_full_id_scopes_after_payload_retirement_and_never_reads_unknown_records()
{
    assert!(LocalApi::is_independent_snapshot(
        "GET",
        "/api/recovery/storage/quotas"
    ));
    let owned = tempfile::tempdir().unwrap();
    let state = owned.path().join("state");
    let api = LocalApi::new(state.clone(), "qa".into(), "test".into());
    let response = api
        .handle(
            "POST",
            "/api/projects",
            json!({"name":"Quota project","versioningMode":"none","syncMode":"none"}),
            vec![],
        )
        .unwrap();
    assert_eq!(response.status, 200);
    let project = response.body["id"].as_str().unwrap();
    let key = hash(project);
    for family in ["mixed-reviews", "mixed-applications", "graph-joins"] {
        fs::create_dir_all(state.join(family).join(&key)).unwrap();
    }
    let future = b"{\"schemaVersion\":99,\"privateSentinel\":\"DO_NOT_READ_OR_EXPORT\"}";
    for i in 0..64 {
        fs::write(
            state
                .join("mixed-reviews")
                .join(&key)
                .join(format!("unknown-{i}.json")),
            future,
        )
        .unwrap();
    }
    let application = state
        .join("mixed-applications")
        .join(&key)
        .join("mixed-retired");
    fs::create_dir(&application).unwrap();
    fs::write(application.join("record.json"), future).unwrap();
    fs::write(
        state.join("graph-joins").join(&key).join("join.json"),
        future,
    )
    .unwrap();
    fs::create_dir_all(state.join("project-transfers/interrupted")).unwrap();
    fs::write(state.join("project-transfers/interrupted/job.json"), future).unwrap();
    let registry = fs::read(state.join("projects.json")).unwrap();
    let inventory = view(&api);
    assert_eq!(inventory["complete"], true, "{inventory}");
    assert_eq!(inventory["cleanupAvailable"], false);
    assert_eq!(inventory["items"].as_array().unwrap().len(), 10);
    let find = |family: &str| {
        inventory["items"]
            .as_array()
            .unwrap()
            .iter()
            .find(|r| r["family"] == family)
            .unwrap()
    };
    let plans = find("mixed-reviews");
    assert_eq!(plans["entries"], 64);
    assert_eq!(plans["maxEntries"], 64);
    assert_eq!(plans["status"], "full");
    assert_eq!(plans["projectId"], project);
    assert_eq!(plans["idsRetainedOnPayloadRetirement"], true);
    assert_eq!(plans["contentsVerified"], false);
    assert_eq!(find("mixed-applications")["entries"], 1);
    assert_eq!(find("mixed-applications")["bytes"], future.len());
    assert_eq!(find("mixed-applications")["maxBytes"], 256 * 1024 * 1024);
    assert_eq!(find("graph-joins")["maxBytes"], 1024 * 1024);
    assert_eq!(find("conflict-attempts")["maxEntries"], 1000);
    assert_eq!(find("project-templates")["maxEntries"], 50);
    assert_eq!(find("project-transfers")["status"], "full");
    assert!(!inventory.to_string().contains("DO_NOT_READ_OR_EXPORT"));
    assert_eq!(fs::read(state.join("projects.json")).unwrap(), registry);
    assert_eq!(fs::read(application.join("record.json")).unwrap(), future);
    // Removing a payload does not remove the durable application record or its identity slot.
    fs::write(application.join("before.bin"), [1u8; 100]).unwrap();
    let before = view(&api);
    fs::remove_file(application.join("before.bin")).unwrap();
    let after = view(&api);
    let row = |v: Value| {
        v["items"]
            .as_array()
            .unwrap()
            .iter()
            .find(|r| r["family"] == "mixed-applications")
            .unwrap()
            .clone()
    };
    let (before, after) = (row(before), row(after));
    assert_eq!(before["entries"], after["entries"]);
    assert_eq!(
        before["bytes"].as_u64().unwrap() - after["bytes"].as_u64().unwrap(),
        100
    );
}
#[test]
fn scopes_are_bounded_and_unassociated_or_nonregular_metadata_never_becomes_empty_or_writable() {
    let owned = tempfile::tempdir().unwrap();
    let state = owned.path().join("state");
    let api = LocalApi::new(state.clone(), "qa".into(), "test".into());
    fs::create_dir_all(state.join("mixed-applications/unassociated/mixed-one")).unwrap();
    fs::write(
        state.join("mixed-applications/unassociated/mixed-one/record.json"),
        b"future",
    )
    .unwrap();
    fs::create_dir_all(state.join("conflict-attempts/not-a-record")).unwrap();
    fs::write(
        state.join("conflict-attempts/not-a-record/payload.bin"),
        [7u8; 3],
    )
    .unwrap();
    fs::write(state.join("projects.json"), b"{\"schemaVersion\":99}").unwrap();
    let result = view(&api);
    assert_eq!(result["projectMappingComplete"], false);
    assert_eq!(result["complete"], false);
    let rows = result["items"].as_array().unwrap();
    let unknown = rows
        .iter()
        .find(|r| r["family"] == "mixed-applications")
        .unwrap();
    assert!(unknown["projectId"].is_null());
    assert_eq!(unknown["entries"], 1);
    let invalid = rows
        .iter()
        .find(|r| r["family"] == "conflict-attempts")
        .unwrap();
    assert_eq!(invalid["status"], "partial");
    assert_eq!(invalid["bytes"], 3);
    assert_eq!(
        fs::read(state.join("projects.json")).unwrap(),
        b"{\"schemaVersion\":99}"
    );
    for i in 0..205 {
        fs::create_dir_all(state.join("mixed-reviews").join(format!("scope-{i}"))).unwrap();
    }
    let result = view(&api);
    assert_eq!(result["limited"], true);
    assert_eq!(result["complete"], false);
    assert!(result["items"].as_array().unwrap().len() <= 200);
    assert!(state
        .join("mixed-applications/unassociated/mixed-one/record.json")
        .exists());
}
