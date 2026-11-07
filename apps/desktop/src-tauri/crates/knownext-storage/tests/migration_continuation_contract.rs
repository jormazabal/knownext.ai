use knownext_storage::LocalApi;
use serde_json::{json, Value};
use std::{
    fs,
    path::{Path, PathBuf},
};
const FILES: [&str; 3] = ["config.json", "projects.json", "export-template.json"];
fn request(api: &LocalApi, method: &str, path: &str, body: Value) -> Value {
    let response = api.handle(method, path, body, vec![]).unwrap();
    assert!(response.status < 400, "{}", response.body);
    response.body
}
fn contents(state: &Path) -> Vec<Vec<u8>> {
    FILES
        .iter()
        .map(|file| fs::read(state.join(file)).unwrap())
        .collect()
}
fn fixture() -> (tempfile::TempDir, LocalApi, PathBuf) {
    let owned = tempfile::tempdir().unwrap();
    let state = owned.path().join("state");
    let api = LocalApi::new(state.clone(), "3.0-qa".into(), "test".into());
    request(
        &api,
        "POST",
        "/api/projects",
        json!({"name":"Owned migration continuation","versioningMode":"none","syncMode":"none"}),
    );
    let mut registry: Value =
        serde_json::from_slice(&fs::read(state.join("projects.json")).unwrap()).unwrap();
    registry["schemaVersion"] = json!(1);
    fs::write(
        state.join("projects.json"),
        serde_json::to_vec(&registry).unwrap(),
    )
    .unwrap();
    fs::write(state.join("config.json"),br#"{"schemaVersion":2,"appearance":{"theme":"dark"},"customPreserved":"owned preference"}"#).unwrap();
    fs::write(
        state.join("export-template.json"),
        br#"{"schemaVersion":1,"normal":{"fontSizePt":12}}"#,
    )
    .unwrap();
    (owned, api, state)
}
fn upgrade(api: &LocalApi) -> Value {
    let review = request(api, "GET", "/api/recovery/upgrade", Value::Null);
    request(
        api,
        "POST",
        "/api/recovery/upgrade",
        json!({"revision":review["revision"]}),
    )
}
fn review(api: &LocalApi, id: &str) -> Value {
    request(
        api,
        "GET",
        &format!("/api/recovery/upgrades/{id}"),
        Value::Null,
    )
}
fn action(api: &LocalApi, id: &str, kind: &str, revision: &Value) -> Value {
    request(
        api,
        "POST",
        &format!("/api/recovery/upgrades/{id}/{kind}"),
        json!({"revision":revision}),
    )
}
fn partial(api: &LocalApi, state: &Path) -> String {
    let path = state.join("projects.json");
    let permissions = fs::metadata(&path).unwrap().permissions();
    let mut locked = permissions.clone();
    locked.set_readonly(true);
    fs::set_permissions(&path, locked).unwrap();
    let result = upgrade(api);
    fs::set_permissions(&path, permissions).unwrap();
    assert_eq!(result["status"], "review-required");
    result["id"].as_str().unwrap().into()
}
#[test]
fn partial_upgrade_completes_in_place_and_originals_remain_exactly_recoverable() {
    let (_owned, api, state) = fixture();
    let original = contents(&state);
    let id = partial(&api, &state);
    let inspected = review(&api, &id);
    assert_eq!(inspected["canComplete"], true);
    assert_eq!(inspected["entries"][0]["status"], "applied");
    assert_eq!(inspected["entries"][1]["status"], "original");
    assert_eq!(
        action(&api, &id, "complete", &inspected["revision"])["status"],
        "completed"
    );
    let completed = contents(&state);
    let reopened = LocalApi::new(state.clone(), "3.0-qa".into(), "test".into());
    let current = review(&reopened, &id);
    assert_eq!(current["canComplete"], false);
    assert_eq!(current["canRestore"], true);
    assert_eq!(fs::read_dir(state.join("migrations")).unwrap().count(), 1);
    for (index, file) in FILES.iter().enumerate() {
        assert_eq!(
            fs::read(
                state
                    .join("migrations")
                    .join(&id)
                    .join(format!("{file}.original"))
            )
            .unwrap(),
            original[index]
        );
    }
    assert!(reopened
        .handle(
            "POST",
            &format!("/api/recovery/upgrades/{id}/complete"),
            json!({"revision":inspected["revision"]}),
            vec![]
        )
        .is_err());
    assert_eq!(contents(&state), completed);
    assert_eq!(
        action(&reopened, &id, "restore", &current["revision"])["status"],
        "restored"
    );
    assert_eq!(contents(&state), original);
}
#[test]
fn a_second_interruption_keeps_confirmed_steps_and_continuation_does_not_rewrite_them() {
    let (_owned, api, state) = fixture();
    let original = contents(&state);
    let id = partial(&api, &state);
    let path = state.join("export-template.json");
    let permissions = fs::metadata(&path).unwrap().permissions();
    let mut locked = permissions.clone();
    locked.set_readonly(true);
    fs::set_permissions(&path, locked).unwrap();
    let inspected = review(&api, &id);
    let result = action(&api, &id, "complete", &inspected["revision"]);
    fs::set_permissions(&path, permissions).unwrap();
    assert_eq!(result["status"], "review-required");
    let pending = review(&api, &id);
    assert_eq!(pending["entries"][1]["status"], "applied");
    assert_eq!(pending["entries"][2]["status"], "original");
    let path = state.join("projects.json");
    let permissions = fs::metadata(&path).unwrap().permissions();
    let mut locked = permissions.clone();
    locked.set_readonly(true);
    fs::set_permissions(&path, locked).unwrap();
    let result = action(&api, &id, "complete", &pending["revision"]);
    fs::set_permissions(&path, permissions).unwrap();
    assert_eq!(result["status"], "completed");
    let recovered = review(&api, &id);
    assert_eq!(
        action(&api, &id, "restore", &recovered["revision"])["status"],
        "restored"
    );
    assert_eq!(contents(&state), original);
}
#[test]
fn lost_final_journal_acknowledgement_can_be_completed_without_rewriting_current_states() {
    let (_owned, api, state) = fixture();
    let result = upgrade(&api);
    let id = result["id"].as_str().unwrap();
    let path = state.join("migrations").join(id).join("manifest.json");
    let mut manifest: Value = serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
    manifest["status"] = json!("applying");
    for entry in manifest["entries"].as_array_mut().unwrap() {
        entry["applied"] = json!(false);
    }
    let pending = serde_json::to_vec(&manifest).unwrap();
    fs::write(&path, &pending).unwrap();
    let before = contents(&state);
    let inspected = review(&api, id);
    assert_eq!(fs::read(&path).unwrap(), pending);
    assert_eq!(inspected["canComplete"], true);
    assert!(inspected["entries"]
        .as_array()
        .unwrap()
        .iter()
        .all(|entry| entry["status"] == "applied"));
    let permissions = FILES
        .iter()
        .map(|file| {
            let path = state.join(file);
            let permissions = fs::metadata(&path).unwrap().permissions();
            let mut locked = permissions.clone();
            locked.set_readonly(true);
            fs::set_permissions(path, locked).unwrap();
            permissions
        })
        .collect::<Vec<_>>();
    let result = action(&api, id, "complete", &inspected["revision"]);
    for (file, permissions) in FILES.iter().zip(permissions) {
        fs::set_permissions(state.join(file), permissions).unwrap();
    }
    assert_eq!(result["status"], "completed");
    assert_eq!(contents(&state), before);
}
#[test]
fn unknown_extended_or_malformed_journals_never_authorize_writes_and_preserve_exact_bytes() {
    let (_owned, api, state) = fixture();
    let result = upgrade(&api);
    let id = result["id"].as_str().unwrap();
    let path = state.join("migrations").join(id).join("manifest.json");
    let manifest: Value = serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
    let inspected = review(&api, id);
    let before = contents(&state);
    for variant in 0..7 {
        let mut future = manifest.clone();
        match variant {
            0 => future["futureInstruction"] = json!({"preserve":true}),
            1 => future["entries"][0]["future"] = json!(true),
            2 => future["entries"][0]["applied"] = json!("yes"),
            3 => future["status"] = json!("future-phase"),
            4 => future["createdAt"] = json!("invalid-date"),
            5 => future["trigger"] = json!("future-trigger"),
            _ => future["schemaVersion"] = json!(99),
        }
        let exact = serde_json::to_vec(&future).unwrap();
        fs::write(&path, &exact).unwrap();
        assert!(api
            .handle(
                "GET",
                &format!("/api/recovery/upgrades/{id}"),
                Value::Null,
                vec![]
            )
            .is_err());
        for kind in ["restore", "complete"] {
            assert!(api
                .handle(
                    "POST",
                    &format!("/api/recovery/upgrades/{id}/{kind}"),
                    json!({"revision":inspected["revision"]}),
                    vec![]
                )
                .is_err());
        }
        assert_eq!(
            request(&api, "GET", "/api/recovery/upgrades", Value::Null)["entries"][0]["canReview"],
            false
        );
        assert_eq!(fs::read(&path).unwrap(), exact);
        assert_eq!(contents(&state), before);
    }
}
#[test]
fn whole_cohort_and_copy_changes_invalidate_review_and_ordinary_intent_is_never_replayed() {
    let (_owned, api, state) = fixture();
    let id = partial(&api, &state);
    let path = state.join("migrations").join(&id).join("manifest.json");
    let original_manifest = fs::read(&path).unwrap();
    let mut manifest: Value = serde_json::from_slice(&original_manifest).unwrap();
    manifest["entries"].as_array_mut().unwrap().truncate(1);
    let exact = serde_json::to_vec(&manifest).unwrap();
    fs::write(&path, &exact).unwrap();
    let inspected = review(&api, &id);
    assert_eq!(inspected["canComplete"], true);
    let mut export: Value =
        serde_json::from_slice(&fs::read(state.join("export-template.json")).unwrap()).unwrap();
    export["normal"]["fontSizePt"] = json!(13);
    fs::write(
        state.join("export-template.json"),
        serde_json::to_vec(&export).unwrap(),
    )
    .unwrap();
    let before = contents(&state);
    for kind in ["restore", "complete"] {
        assert!(api
            .handle(
                "POST",
                &format!("/api/recovery/upgrades/{id}/{kind}"),
                json!({"revision":inspected["revision"]}),
                vec![]
            )
            .is_err());
    }
    assert_eq!(contents(&state), before);
    manifest["trigger"] = json!("ordinary-format-write");
    fs::write(&path, serde_json::to_vec(&manifest).unwrap()).unwrap();
    let ordinary = review(&api, &id);
    assert_eq!(ordinary["canComplete"], false);
    assert_eq!(ordinary["canRestore"], true);
    assert_eq!(contents(&state), before);
    fs::write(&path, &original_manifest).unwrap();
    let current = review(&api, &id);
    let backup = state
        .join("migrations")
        .join(&id)
        .join("config.json.original");
    fs::write(&backup, b"owned changed copy").unwrap();
    assert!(api
        .handle(
            "POST",
            &format!("/api/recovery/upgrades/{id}/restore"),
            json!({"revision":current["revision"]}),
            vec![]
        )
        .is_err());
    assert_eq!(contents(&state), before);
    assert_eq!(review(&api, &id)["canComplete"], false);
}

#[test]
fn already_current_stores_are_not_rewritten_and_unreconstructable_targets_remain_blocked() {
    let (_owned, api, state) = fixture();
    fs::write(
        state.join("config.json"),
        br#"{"schemaVersion":3,"appearance":{"theme":"dark"}}"#,
    )
    .unwrap();
    let original = contents(&state);
    let id = partial(&api, &state);
    let inspected = review(&api, &id);
    assert_eq!(inspected["canComplete"], true);
    assert_eq!(inspected["canRestore"], false);
    let path = state.join("config.json");
    let permissions = fs::metadata(&path).unwrap().permissions();
    let mut locked = permissions.clone();
    locked.set_readonly(true);
    fs::set_permissions(&path, locked).unwrap();
    let result = action(&api, &id, "complete", &inspected["revision"]);
    fs::set_permissions(&path, permissions).unwrap();
    assert_eq!(result["status"], "completed");
    assert_eq!(fs::read(&path).unwrap(), original[0]);
    let manifest_path = state.join("migrations").join(&id).join("manifest.json");
    let mut manifest: Value = serde_json::from_slice(&fs::read(&manifest_path).unwrap()).unwrap();
    manifest["status"] = json!("prepared");
    manifest["entries"][0]["after"] = json!("0".repeat(64));
    fs::write(&manifest_path, serde_json::to_vec(&manifest).unwrap()).unwrap();
    let before = contents(&state);
    let blocked = review(&api, &id);
    assert_eq!(blocked["canComplete"], false);
    assert_eq!(blocked["entries"][0]["targetVerified"], false);
    assert!(api
        .handle(
            "POST",
            &format!("/api/recovery/upgrades/{id}/complete"),
            json!({"revision":blocked["revision"]}),
            vec![]
        )
        .is_err());
    assert_eq!(contents(&state), before);
}
