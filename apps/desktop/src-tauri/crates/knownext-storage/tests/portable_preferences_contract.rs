use knownext_storage::LocalApi;
use serde_json::{json, Value};
use std::{fs, path::PathBuf};
fn call(api: &LocalApi, method: &str, path: &str, body: Value) -> Value {
    let result = api.handle(method, path, body, vec![]).unwrap();
    assert_eq!(result.status, 200, "{}", result.body);
    result.body
}
fn fixture() -> (tempfile::TempDir, LocalApi, String, PathBuf) {
    let owned = tempfile::tempdir().unwrap();
    let api = LocalApi::new(owned.path().join("state"), "qa".into(), "test".into());
    let p = call(
        &api,
        "POST",
        "/api/projects",
        json!({"name":"Received archive","versioningMode":"none","syncMode":"none"}),
    );
    let root = PathBuf::from(p["folderPath"].as_str().unwrap());
    fs::create_dir(root.join("Archivo KnowNext")).unwrap();
    fs::write(root.join("Archivo KnowNext/Preferencias.json"),serde_json::to_vec(&json!({"format":"knownext.portable-preferences","schemaVersion":1,"appearance":{"language":"eu","themeMode":"dark","zoomPercent":125},"layout":{"sidebarWidth":280,"historyWidth":300},"applyAutomatically":false})).unwrap()).unwrap();
    call(
        &api,
        "PUT",
        "/api/config",
        json!({"appearance":{"language":"es","themeMode":"light","zoomPercent":100},"layout":{"sidebarWidth":350,"historyWidth":400},"ai":{"privateSentinel":"preserve-owned"},"customOwned":{"preserved":true}}),
    );
    (owned, api, p["id"].as_str().unwrap().into(), root)
}
fn route(id: &str) -> String {
    format!("/api/projects/{id}/portable-preferences")
}
#[test]
fn selected_visual_group_preserves_unselected_fields_and_repeated_review_does_not_write_again() {
    let (owned, api, id, root) = fixture();
    let config = owned.path().join("state/config.json");
    let before_raw = fs::read(&config).unwrap();
    let before: Value = serde_json::from_slice(&before_raw).unwrap();
    let source = fs::read(root.join("Archivo KnowNext/Preferencias.json")).unwrap();
    let review = call(&api, "GET", &route(&id), Value::Null);
    assert_eq!(review["observed"]["appearance"]["language"], "es");
    assert_eq!(fs::read(&config).unwrap(), before_raw);
    let result = call(
        &api,
        "POST",
        &route(&id),
        json!({"revision":review["revision"],"appearance":true,"layout":false,"acknowledge":true}),
    );
    assert_eq!(result["status"], "applied");
    let current: Value = serde_json::from_slice(&fs::read(&config).unwrap()).unwrap();
    assert_eq!(current["appearance"]["language"], "eu");
    assert_eq!(current["appearance"]["zoomPercent"], 125);
    assert_eq!(current["layout"], before["layout"]);
    assert_eq!(current["ai"], before["ai"]);
    assert_eq!(current["customOwned"], before["customOwned"]);
    assert_eq!(current["tabsByProject"], before["tabsByProject"]);
    let bytes = fs::read(&config).unwrap();
    assert!(api.handle("POST",&route(&id),json!({"revision":review["revision"],"appearance":true,"layout":false,"acknowledge":true}),vec![]).is_err());
    assert_eq!(fs::read(&config).unwrap(), bytes);
    let review = call(&api, "GET", &route(&id), Value::Null);
    let unchanged = call(
        &api,
        "POST",
        &route(&id),
        json!({"revision":review["revision"],"appearance":true,"layout":false,"acknowledge":true}),
    );
    assert_eq!(unchanged["status"], "unchanged");
    assert_eq!(fs::read(&config).unwrap(), bytes);
    assert_eq!(
        fs::read(root.join("Archivo KnowNext/Preferencias.json")).unwrap(),
        source
    );
}
#[test]
fn changed_config_source_future_and_extra_fields_never_become_writable_defaults() {
    let (owned, api, id, root) = fixture();
    let config = owned.path().join("state/config.json");
    let source = root.join("Archivo KnowNext/Preferencias.json");
    let review = call(&api, "GET", &route(&id), Value::Null);
    let body =
        json!({"revision":review["revision"],"appearance":false,"layout":true,"acknowledge":true});
    call(
        &api,
        "PUT",
        "/api/config",
        json!({"layout":{"sidebarWidth":333}}),
    );
    let bytes = fs::read(&config).unwrap();
    assert!(api.handle("POST", &route(&id), body, vec![]).is_err());
    assert_eq!(fs::read(&config).unwrap(), bytes);
    let original = fs::read(&source).unwrap();
    for patch in [
        json!({"schemaVersion":99}),
        json!({"ai":{"apiKey":"never-adopt"}}),
        json!({"applyAutomatically":true}),
        json!({"appearance":{"language":"es","provider":"never-adopt"}}),
    ] {
        let mut value: Value = serde_json::from_slice(&original).unwrap();
        for (key, item) in patch.as_object().unwrap() {
            value[key] = item.clone();
        }
        let raw = serde_json::to_vec(&value).unwrap();
        fs::write(&source, &raw).unwrap();
        assert!(api.handle("GET", &route(&id), Value::Null, vec![]).is_err());
        assert_eq!(fs::read(&source).unwrap(), raw);
        assert_eq!(fs::read(&config).unwrap(), bytes);
    }
    fs::write(&source, &original).unwrap();
    fs::write(&config, b"{\"schemaVersion\":99}").unwrap();
    assert!(api.handle("GET", &route(&id), Value::Null, vec![]).is_err());
    assert_eq!(fs::read(&config).unwrap(), b"{\"schemaVersion\":99}");
}
#[test]
fn layout_only_requires_confirmation_and_does_not_change_appearance() {
    let (owned, api, id, root) = fixture();
    let config = owned.path().join("state/config.json");
    let bytes = fs::read(&config).unwrap();
    let before: Value = serde_json::from_slice(&bytes).unwrap();
    let review = call(&api, "GET", &route(&id), Value::Null);
    for (appearance, layout, ack) in [(false, false, true), (false, true, false)] {
        assert!(api.handle("POST",&route(&id),json!({"revision":review["revision"],"appearance":appearance,"layout":layout,"acknowledge":ack}),vec![]).is_err());
        assert_eq!(fs::read(&config).unwrap(), bytes);
    }
    let mut changed: Value =
        serde_json::from_slice(&fs::read(root.join("Archivo KnowNext/Preferencias.json")).unwrap())
            .unwrap();
    changed["layout"]["sidebarWidth"] = json!(290);
    fs::write(
        root.join("Archivo KnowNext/Preferencias.json"),
        serde_json::to_vec(&changed).unwrap(),
    )
    .unwrap();
    assert!(api.handle("POST",&route(&id),json!({"revision":review["revision"],"appearance":false,"layout":true,"acknowledge":true}),vec![]).is_err());
    let review = call(&api, "GET", &route(&id), Value::Null);
    let done = call(
        &api,
        "POST",
        &route(&id),
        json!({"revision":review["revision"],"appearance":false,"layout":true,"acknowledge":true}),
    );
    assert_eq!(done["status"], "applied");
    let current: Value = serde_json::from_slice(&fs::read(config).unwrap()).unwrap();
    assert_eq!(current["appearance"], before["appearance"]);
    assert_eq!(current["layout"]["sidebarWidth"], 290);
}
