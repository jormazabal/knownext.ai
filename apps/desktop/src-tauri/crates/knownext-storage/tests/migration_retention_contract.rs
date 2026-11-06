use knownext_storage::LocalApi;
use serde_json::{json, Value};
use std::{
    fs,
    path::{Path, PathBuf},
};
const FILES: [&str; 3] = ["config.json", "projects.json", "export-template.json"];
fn request(api: &LocalApi, method: &str, path: &str, body: Value) -> Value {
    let result = api.handle(method, path, body, vec![]).unwrap();
    assert!(result.status < 400, "{}", result.body);
    result.body
}
fn current(state: &Path) -> Vec<Vec<u8>> {
    FILES
        .iter()
        .map(|file| fs::read(state.join(file)).unwrap())
        .collect()
}
fn fixture() -> (tempfile::TempDir, LocalApi, PathBuf, String) {
    let owned = tempfile::tempdir().unwrap();
    let state = owned.path().join("state");
    let api = LocalApi::new(state.clone(), "qa".into(), "test".into());
    request(
        &api,
        "POST",
        "/api/projects",
        json!({"name":"Owned retention","versioningMode":"none","syncMode":"none"}),
    );
    let mut projects: Value =
        serde_json::from_slice(&fs::read(state.join("projects.json")).unwrap()).unwrap();
    projects["schemaVersion"] = json!(1);
    fs::write(
        state.join("projects.json"),
        serde_json::to_vec(&projects).unwrap(),
    )
    .unwrap();
    fs::write(
        state.join("config.json"),
        br#"{"schemaVersion":2,"appearance":{"theme":"dark"}}"#,
    )
    .unwrap();
    fs::write(
        state.join("export-template.json"),
        br#"{"schemaVersion":1,"normal":{"fontSizePt":12}}"#,
    )
    .unwrap();
    let review = request(&api, "GET", "/api/recovery/upgrade", Value::Null);
    let result = request(
        &api,
        "POST",
        "/api/recovery/upgrade",
        json!({"revision":review["revision"]}),
    );
    let id = result["id"].as_str().unwrap().into();
    (owned, api, state, id)
}
fn review(api: &LocalApi, id: &str) -> Value {
    assert!(LocalApi::is_independent_snapshot(
        "GET",
        &format!("/api/recovery/upgrades/{id}/retention")
    ));
    assert!(!LocalApi::is_independent_snapshot(
        "POST",
        &format!("/api/recovery/upgrades/{id}/retention")
    ));
    request(
        api,
        "GET",
        &format!("/api/recovery/upgrades/{id}/retention"),
        Value::Null,
    )
}
fn action(api: &LocalApi, id: &str, review: &Value, action: &str) -> Value {
    request(
        api,
        "POST",
        &format!("/api/recovery/upgrades/{id}/retention"),
        json!({"revision":review["revision"],"action":action,"confirmDelete":action=="delete"}),
    )
}
#[test]
fn archive_reopen_and_explicit_delete_preserve_active_data_and_other_points() {
    let (_owned, api, state, id) = fixture();
    let before = current(&state);
    let folder = state.join("migrations").join(&id);
    let originals = FILES
        .iter()
        .map(|file| fs::read(folder.join(format!("{file}.original"))).unwrap())
        .collect::<Vec<_>>();
    let known = review(&api, &id);
    assert_eq!(known["canArchive"], true);
    assert_eq!(action(&api, &id, &known, "archive")["status"], "archived");
    let recovery = request(
        &api,
        "GET",
        &format!("/api/recovery/upgrades/{id}"),
        Value::Null,
    );
    assert_eq!(recovery["canRestore"], false);
    assert!(api
        .handle(
            "POST",
            &format!("/api/recovery/upgrades/{id}/restore"),
            json!({"revision":recovery["revision"]}),
            vec![]
        )
        .is_err());
    let archived = review(&api, &id);
    assert_eq!(archived["canReopen"], true);
    assert_eq!(action(&api, &id, &archived, "reopen")["status"], "active");
    assert_eq!(
        request(
            &api,
            "GET",
            &format!("/api/recovery/upgrades/{id}"),
            Value::Null
        )["canRestore"],
        true
    );
    for (index, file) in FILES.iter().enumerate() {
        assert_eq!(
            fs::read(folder.join(format!("{file}.original"))).unwrap(),
            originals[index]
        );
    }
    assert_eq!(current(&state), before);
    action(&api, &id, &review(&api, &id), "archive");
    let archived = review(&api, &id);
    assert!(api
        .handle(
            "POST",
            &format!("/api/recovery/upgrades/{id}/retention"),
            json!({"revision":archived["revision"],"action":"delete","confirmDelete":false}),
            vec![]
        )
        .is_err());
    assert!(folder.exists());
    let other = state.join("migrations/migration-owned-other");
    fs::create_dir(&other).unwrap();
    fs::write(
        other.join("unknown-future.bin"),
        b"preserved unrelated point",
    )
    .unwrap();
    assert_eq!(action(&api, &id, &archived, "delete")["status"], "deleted");
    assert!(!folder.exists());
    assert_eq!(
        fs::read(other.join("unknown-future.bin")).unwrap(),
        b"preserved unrelated point"
    );
    assert_eq!(current(&state), before);
    assert_eq!(review(&api, &id)["phase"], "absent");
}
#[test]
fn interrupted_deletion_is_observed_without_replay_and_can_finish_only_after_explicit_review() {
    let (_owned, api, state, id) = fixture();
    let before = current(&state);
    action(&api, &id, &review(&api, &id), "archive");
    let folder = state.join("migrations").join(&id);
    let locked = folder.join("export-template.json.original");
    let permissions = fs::metadata(&locked).unwrap().permissions();
    let mut readonly = permissions.clone();
    readonly.set_readonly(true);
    fs::set_permissions(&locked, readonly).unwrap();
    let result = action(&api, &id, &review(&api, &id), "delete");
    fs::set_permissions(&locked, permissions).unwrap();
    assert_eq!(result["status"], "review-required");
    assert!(!folder.join("config.json.original").exists());
    assert!(folder.join("manifest.json").exists());
    let remaining = fs::read_dir(&folder).unwrap().count();
    let reopened = LocalApi::new(state.clone(), "qa".into(), "test".into());
    let pending = review(&reopened, &id);
    assert_eq!(pending["phase"], "deleting");
    assert_eq!(pending["canReopen"], false);
    assert_eq!(fs::read_dir(&folder).unwrap().count(), remaining);
    assert_eq!(current(&state), before);
    fs::write(folder.join("unexpected-new.bin"), b"preserve this too").unwrap();
    let blocked = review(&api, &id);
    assert_eq!(blocked["canDelete"], false);
    assert!(api
        .handle(
            "POST",
            &format!("/api/recovery/upgrades/{id}/retention"),
            json!({"revision":pending["revision"],"action":"delete","confirmDelete":true}),
            vec![]
        )
        .is_err());
    assert_eq!(
        fs::read(folder.join("unexpected-new.bin")).unwrap(),
        b"preserve this too"
    );
    fs::remove_file(folder.join("unexpected-new.bin")).unwrap();
    assert_eq!(
        action(&api, &id, &review(&api, &id), "delete")["status"],
        "deleted"
    );
    assert_eq!(current(&state), before);
}
#[test]
fn unknown_retention_and_changed_originals_preserve_all_bytes_and_never_authorize_cleanup() {
    let (_owned, api, state, id) = fixture();
    let before = current(&state);
    let folder = state.join("migrations").join(&id);
    let known = review(&api, &id);
    action(&api, &id, &known, "archive");
    let flag = folder.join("retention.json");
    let exact = fs::read(&flag).unwrap();
    let mut future: Value = serde_json::from_slice(&exact).unwrap();
    future["futureInstruction"] = json!(true);
    let future = serde_json::to_vec(&future).unwrap();
    fs::write(&flag, &future).unwrap();
    for action in ["archive", "reopen", "delete"] {
        assert!(api
            .handle(
                "POST",
                &format!("/api/recovery/upgrades/{id}/retention"),
                json!({"revision":known["revision"],"action":action,"confirmDelete":true}),
                vec![]
            )
            .is_err());
    }
    assert!(api
        .handle(
            "GET",
            &format!("/api/recovery/upgrades/{id}"),
            Value::Null,
            vec![]
        )
        .is_err());
    assert_eq!(fs::read(&flag).unwrap(), future);
    assert_eq!(current(&state), before);
    fs::write(&flag, &exact).unwrap();
    let archived = review(&api, &id);
    fs::write(folder.join("config.json.original"), b"owned later change").unwrap();
    assert_eq!(review(&api, &id)["canDelete"], false);
    assert!(api
        .handle(
            "POST",
            &format!("/api/recovery/upgrades/{id}/retention"),
            json!({"revision":archived["revision"],"action":"delete","confirmDelete":true}),
            vec![]
        )
        .is_err());
    assert_eq!(
        fs::read(folder.join("config.json.original")).unwrap(),
        b"owned later change"
    );
    assert_eq!(current(&state), before);
}
