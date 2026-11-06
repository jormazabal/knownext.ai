use knownext_storage::LocalApi;
use serde_json::{json, Value};
use std::fs;
#[test]
fn future_unknown_oversized_and_foreign_plans_never_mutate_sources_and_known_legacy_can_be_observed_then_executed(
) {
    let temp = tempfile::tempdir().unwrap();
    let state = temp.path().join("state");
    let api = LocalApi::new(state.clone(), "qa".into(), "test".into());
    let project = api
        .handle(
            "POST",
            "/api/projects",
            json!({"name":"Own batch","versioningMode":"none","syncMode":"none"}),
            vec![],
        )
        .unwrap()
        .body;
    let owner = project["id"].as_str().unwrap();
    let source = std::path::Path::new(project["folderPath"].as_str().unwrap()).join("Source.md");
    fs::write(&source, b"# Preserve owned source\n").unwrap();
    let route = format!("/api/projects/{owner}/nodes/batch");
    assert!(api
        .handle("GET", &format!("{route}/batch-absent"), Value::Null, vec![])
        .is_err());
    assert!(!state.join("file-batches").exists());
    let plan = api
        .handle(
            "POST",
            &format!("{route}/plan"),
            json!({"action":"trash","nodeIds":[format!("{owner}::Source.md")]}),
            vec![],
        )
        .unwrap()
        .body;
    assert_eq!(plan["schemaVersion"], 1);
    let id = plan["id"].as_str().unwrap();
    let path = state.join("file-batches").join(format!("{id}.json"));
    let original = fs::read(&path).unwrap();
    let status_route = format!("{route}/{id}");
    let execute_route = format!("{status_route}/execute");
    let mut future = plan.clone();
    future["schemaVersion"] = json!(99);
    let mut extension = plan.clone();
    extension["futureRule"] = json!("owned");
    let mut item = plan.clone();
    item["items"][0]["futureAction"] = json!("owned");
    let mut foreign = plan.clone();
    foreign["projectId"] = json!("project-foreign");
    let mut duplicate = plan.clone();
    duplicate["items"]
        .as_array_mut()
        .unwrap()
        .push(plan["items"][0].clone());
    let mut unknown_state = plan.clone();
    unknown_state["state"] = json!("future-state");
    let mut injected = plan.clone();
    injected["movedFiles"] = json!([["Source.md", "Foreign.md"]]);
    for invalid in [
        future,
        extension,
        item,
        foreign,
        duplicate,
        unknown_state,
        injected,
    ] {
        let bytes = serde_json::to_vec_pretty(&invalid).unwrap();
        fs::write(&path, &bytes).unwrap();
        assert!(api
            .handle("GET", &status_route, Value::Null, vec![])
            .is_err());
        assert!(api
            .handle("POST", &execute_route, Value::Null, vec![])
            .is_err());
        let snapshot = api
            .handle(
                "GET",
                &format!("/api/projects/{owner}/trash"),
                Value::Null,
                vec![],
            )
            .unwrap()
            .body;
        assert!(!snapshot["warnings"].as_array().unwrap().is_empty());
        assert_eq!(fs::read(&path).unwrap(), bytes);
        assert_eq!(fs::read(&source).unwrap(), b"# Preserve owned source\n");
    }
    let file = fs::File::create(&path).unwrap();
    file.set_len(16 * 1024 * 1024 + 1).unwrap();
    drop(file);
    assert!(api
        .handle("GET", &status_route, Value::Null, vec![])
        .is_err());
    assert!(api
        .handle("POST", &execute_route, Value::Null, vec![])
        .is_err());
    assert_eq!(fs::metadata(&path).unwrap().len(), 16 * 1024 * 1024 + 1);
    assert!(source.exists());
    let mut legacy: Value = serde_json::from_slice(&original).unwrap();
    legacy.as_object_mut().unwrap().remove("schemaVersion");
    let bytes = serde_json::to_vec_pretty(&legacy).unwrap();
    fs::write(&path, &bytes).unwrap();
    assert!(api
        .handle("GET", &status_route, Value::Null, vec![])
        .is_ok());
    assert_eq!(fs::read(&path).unwrap(), bytes);
    let done = api
        .handle("POST", &execute_route, Value::Null, vec![])
        .unwrap()
        .body;
    assert_eq!(done["state"], "completed");
    assert!(!source.exists());
    assert!(done.get("schemaVersion").is_none());
    let persisted = fs::read(&path).unwrap();
    assert_eq!(
        api.handle("POST", &execute_route, Value::Null, vec![])
            .unwrap()
            .body,
        done
    );
    assert_eq!(fs::read(&path).unwrap(), persisted);
}
