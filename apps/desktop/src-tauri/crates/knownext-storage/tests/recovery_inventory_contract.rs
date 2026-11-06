use knownext_storage::LocalApi;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{fs, path::PathBuf};
fn call(api: &LocalApi, method: &str, path: &str, body: Value) -> Value {
    let r = api.handle(method, path, body, vec![]).unwrap();
    assert!(r.status < 400, "{}", r.body);
    r.body
}
fn view(api: &LocalApi) -> Value {
    call(api, "GET", "/api/recovery/storage", Value::Null)
}
fn budget(api: &LocalApi, review: &Value, enabled: bool, mib: u64) -> Value {
    call(
        api,
        "PUT",
        "/api/recovery/storage/policy",
        json!({"revision":review["policy"]["revision"],"enabled":enabled,"maxBytes":mib*1024*1024}),
    )
}

#[test]
fn budget_inventory_includes_external_stores_and_packages_without_double_counting_nested_registry_aliases(
) {
    let owned = tempfile::tempdir().unwrap();
    let state = owned.path().join("state");
    let external = owned.path().join("external");
    let api = LocalApi::new(state.clone(), "qa".into(), "test".into());
    let project = call(
        &api,
        "POST",
        "/api/projects",
        json!({"name":"Fuera del perfil","folderPath":external,"versioningMode":"none","syncMode":"none"}),
    );
    for (relative, size) in [
        (".knownext-trash/data.bin", 3),
        (".knownext-history-copies/data.bin", 5),
        (".knownext-trash/nested/.knownext-trash/data.bin", 7),
    ] {
        let path = external.join(relative);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, vec![1u8; size]).unwrap();
    }
    for (relative, size) in [
        ("project-transfers/incomplete/payload.zip", 11),
        ("project-templates/incomplete/payload.zip", 13),
        ("recordings/session/microphone.pcm", 17),
        ("recordings-dev/session/system.pcm", 19),
    ] {
        let path = state.join(relative);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, vec![2u8; size]).unwrap();
    }
    let mut registry: Value =
        serde_json::from_slice(&fs::read(state.join("projects.json")).unwrap()).unwrap();
    let mut alias = project.clone();
    alias["id"] = json!("project-owned-alias");
    alias["folderPath"] = json!(external.join(".knownext-trash/nested"));
    registry["projects"]
        .as_array_mut()
        .unwrap()
        .insert(0, alias);
    let registry_bytes = serde_json::to_vec(&registry).unwrap();
    fs::write(state.join("projects.json"), &registry_bytes).unwrap();
    let result = view(&api);
    assert_eq!(result["complete"], true, "{result}");
    assert_eq!(result["bytes"], 75);
    assert_eq!(result["files"], 7);
    let rows = result["items"].as_array().unwrap();
    assert_eq!(
        rows.iter()
            .filter(|row| row["family"] == "project-trash")
            .count(),
        1
    );
    let trash = rows
        .iter()
        .find(|row| row["family"] == "project-trash")
        .unwrap();
    assert_eq!(trash["projectId"], project["id"]);
    assert_eq!(trash["bytes"], 10);
    assert_eq!(trash["contentsVerified"], false);
    assert_eq!(trash["canReviewKnownBytes"], false);
    assert_eq!(
        fs::read(state.join("projects.json")).unwrap(),
        registry_bytes
    );
    assert_eq!(
        fs::read(external.join(".knownext-trash/data.bin")).unwrap(),
        [1u8; 3]
    );
    fs::remove_dir_all(external.join(".knownext-trash/nested")).unwrap();
    let missing = view(&api);
    assert_eq!(missing["complete"], false);
    assert!(missing["unavailable"].as_u64().unwrap() > 0);
}
#[test]
fn metadata_inventory_finds_pre_receipt_payloads_and_preserves_unknown_policy_and_originals() {
    let owned = tempfile::tempdir().unwrap();
    let state = owned.path().join("state");
    let api = LocalApi::new(state.clone(), "qa".into(), "test".into());
    let project = call(
        &api,
        "POST",
        "/api/projects",
        json!({"name":"Owned inventory","versioningMode":"none","syncMode":"none"}),
    );
    let p = project["id"].as_str().unwrap();
    let plan = format!("mixed-{}", "a".repeat(32));
    let folder = state
        .join("mixed-applications")
        .join(format!("{:x}", Sha256::digest(p.as_bytes())))
        .join(&plan);
    fs::create_dir_all(&folder).unwrap();
    fs::write(
        folder.join("000-before.bin"),
        b"owned incomplete binary\0\xff",
    )
    .unwrap();
    let unknown = state.join("conflict-attempts");
    fs::create_dir_all(&unknown).unwrap();
    fs::write(
        unknown.join("future-format.json"),
        b"{\"schemaVersion\":99}",
    )
    .unwrap();
    let first = view(&api);
    assert_eq!(first["complete"], true);
    assert_eq!(first["files"], 2);
    assert_eq!(first["policy"]["enabled"], false);
    let row = first["items"]
        .as_array()
        .unwrap()
        .iter()
        .find(|r| r["planId"] == plan)
        .unwrap();
    assert_eq!(row["projectId"], p);
    assert_eq!(row["canReviewKnownBytes"], true);
    assert_eq!(row["contentsVerified"], false);
    assert!(!folder.join("record.json").exists());
    let recovered = call(
        &api,
        "GET",
        &format!("/api/projects/{p}/sync/mixed-selections/{plan}/application/copies"),
        Value::Null,
    );
    assert_eq!(recovered["recordState"], "missing");
    assert_eq!(recovered["rows"][0]["status"], "readable");
    assert_eq!(recovered["canApply"], false);
    assert_eq!(recovered["canDelete"], false);

    let changed = budget(&api, &first, true, 16);
    let newer = budget(&api, &changed, true, 32);
    let bytes = fs::read(state.join("recovery-policy.json")).unwrap();
    assert!(api
        .handle(
            "PUT",
            "/api/recovery/storage/policy",
            json!({"revision":first["policy"]["revision"],"enabled":false,"maxBytes":16*1024*1024}),
            vec![]
        )
        .is_err());
    assert_eq!(fs::read(state.join("recovery-policy.json")).unwrap(), bytes);
    assert_ne!(changed["policy"]["revision"], newer["policy"]["revision"]);
    fs::write(
        state.join("recovery-policy.json"),
        b"{\"schemaVersion\":99}",
    )
    .unwrap();
    let future = view(&api);
    assert_eq!(future["policy"]["supported"], false);
    assert_eq!(future["files"], 2);
    assert!(api
        .handle(
            "PUT",
            "/api/recovery/storage/policy",
            json!({"revision":newer["policy"]["revision"],"enabled":false,"maxBytes":16*1024*1024}),
            vec![]
        )
        .is_err());
    assert_eq!(
        fs::read(state.join("recovery-policy.json")).unwrap(),
        b"{\"schemaVersion\":99}"
    );
    assert_eq!(
        fs::read(folder.join("000-before.bin")).unwrap(),
        b"owned incomplete binary\0\xff"
    );
    assert_eq!(
        fs::read(unknown.join("future-format.json")).unwrap(),
        b"{\"schemaVersion\":99}"
    );
}
#[test]
fn enabled_global_budget_admits_a_small_merge_then_refuses_new_work_without_losing_open_edits() {
    let owned = tempfile::tempdir().unwrap();
    let state = owned.path().join("state");
    let api = LocalApi::new(state.clone(), "qa".into(), "test".into());
    let p = call(
        &api,
        "POST",
        "/api/projects",
        json!({"name":"Owned budget","versioningMode":"none","syncMode":"none"}),
    );
    let id = p["id"].as_str().unwrap();
    let root = PathBuf::from(p["folderPath"].as_str().unwrap());
    let doc = call(
        &api,
        "POST",
        &format!("/api/projects/{id}/documents"),
        json!({"name":"Plan.md","markdown":"Disk\n"}),
    );
    let d = doc["node"]["id"].as_str().unwrap();
    budget(&api, &view(&api), true, 16);
    let route = format!("/api/documents/{d}/conflict");
    let request = |r: &Value, attempt: &str| json!({"attemptId":attempt,"locationRevision":r["locationRevision"],"diskFingerprint":r["diskFingerprint"],"draftRevision":r["draftRevision"],"localMarkdown":"Local\n","mergedMarkdown":"Local\nDisk\n"});
    let review = call(&api, "GET", &route, Value::Null);
    let merged = call(
        &api,
        "POST",
        &route,
        request(&review, "attempt-owned-budget-one"),
    );
    assert_eq!(merged["sourceUnchanged"], true);
    assert_eq!(fs::read(root.join("Plan.md")).unwrap(), b"Disk\n");
    let pad = state.join("drafts-review").join("owned-pad.bin");
    fs::File::create(&pad)
        .unwrap()
        .set_len(16 * 1024 * 1024)
        .unwrap();
    let previous = call(&api, "GET", &format!("/api/documents/{d}"), Value::Null);
    let review = call(&api, "GET", &route, Value::Null);
    assert!(api
        .handle(
            "POST",
            &route,
            request(&review, "attempt-owned-budget-two"),
            vec![]
        )
        .is_err());
    assert!(!state
        .join("conflict-attempts/attempt-owned-budget-two.json")
        .exists());
    let after = call(&api, "GET", &format!("/api/documents/{d}"), Value::Null);
    assert_eq!(after["markdown"], previous["markdown"]);
    assert_eq!(fs::read(root.join("Plan.md")).unwrap(), b"Disk\n");
    // Saving a separate existing document is not gated by recovery preparation capacity.
    let ordinary = call(
        &api,
        "POST",
        &format!("/api/projects/{id}/documents"),
        json!({"name":"Trabajo.md","markdown":"Original\n"}),
    );
    let oid = ordinary["node"]["id"].as_str().unwrap();
    let loaded = call(&api, "GET", &format!("/api/documents/{oid}"), Value::Null);
    let saved = call(
        &api,
        "PUT",
        &format!("/api/documents/{oid}"),
        json!({"markdown":"Edición conservada\n","baseFingerprint":loaded["baseFingerprint"]}),
    );
    assert!(saved.to_string().contains("Edición conservada"));
    assert_eq!(
        fs::read(root.join("Trabajo.md")).unwrap(),
        "Edición conservada\n".as_bytes()
    );
    budget(&api, &view(&api), true, 32);
    let fresh = call(&api, "GET", &route, Value::Null);
    let resumed = call(
        &api,
        "POST",
        &route,
        request(&fresh, "attempt-owned-budget-two"),
    );
    assert_eq!(resumed["sourceUnchanged"], true);
    assert_eq!(fs::metadata(&pad).unwrap().len(), 16 * 1024 * 1024);
}
