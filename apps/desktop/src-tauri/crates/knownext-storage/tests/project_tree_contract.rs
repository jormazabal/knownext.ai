use knownext_storage::LocalApi;
use serde_json::{json, Value};
use std::{fs, path::PathBuf};

fn call(api: &LocalApi, method: &str, route: &str, body: Value) -> Value {
    let response = api.handle(method, route, body, vec![]).unwrap();
    assert!(response.status < 400, "{}", response.body);
    response.body
}
fn fixture() -> (tempfile::TempDir, LocalApi, String, PathBuf) {
    let owned = tempfile::tempdir().unwrap();
    let api = LocalApi::new(owned.path().join("state"), "qa".into(), "test".into());
    let project = call(
        &api,
        "POST",
        "/api/projects",
        json!({"name":"Owned tree", "versioningMode":"none", "syncMode":"none"}),
    );
    let root = PathBuf::from(project["folderPath"].as_str().unwrap());
    (owned, api, project["id"].as_str().unwrap().into(), root)
}

#[test]
fn bounded_tree_keeps_supported_depth_serializable_and_rejects_partial_views() {
    let (_owned, api, project, root) = fixture();
    fs::write(root.join("Keep.md"), b"untouched").unwrap();
    let mut nested = root.clone();
    for _ in 0..48 {
        nested.push("d");
        fs::create_dir(&nested).unwrap();
    }
    fs::write(nested.join("Deep.md"), b"deep").unwrap();
    let route = format!("/api/projects/{project}/tree");
    assert!(LocalApi::is_independent_snapshot("GET", &route));
    let tree = call(&api, "GET", &route, Value::Null);
    let wire = serde_json::to_vec(&json!({"body":tree})).unwrap();
    let decoded: Value = serde_json::from_slice(&wire).unwrap();
    assert!(decoded["body"].is_array());
    nested.push("d");
    fs::create_dir(&nested).unwrap();
    let error = api.handle("GET", &route, Value::Null, vec![]).unwrap_err();
    assert!(error.contains("48 niveles"), "{error}");
    assert_eq!(fs::read(root.join("Keep.md")).unwrap(), b"untouched");
    assert!(nested.parent().unwrap().join("Deep.md").is_file());
}

#[test]
fn completed_creation_survives_unavailable_tree_and_does_not_replace_existing_items() {
    let (_owned, api, project, root) = fixture();
    let mut nested = root.clone();
    for _ in 0..49 {
        nested.push("d");
        fs::create_dir(&nested).unwrap();
    }
    fs::write(root.join("Keep.md"), b"original").unwrap();
    let route = format!("/api/projects/{project}/documents");
    let result = call(
        &api,
        "POST",
        &route,
        json!({"name":"New.md","markdown":"new bytes"}),
    );
    assert_eq!(result["treeAvailable"], false);
    assert!(result["treeWarning"]
        .as_str()
        .unwrap()
        .contains("48 niveles"));
    assert_eq!(result["node"]["id"], format!("{project}::New.md"));
    assert_eq!(fs::read(root.join("New.md")).unwrap(), b"new bytes");
    assert_eq!(fs::read(root.join("Keep.md")).unwrap(), b"original");
    let document = call(
        &api,
        "GET",
        &format!("/api/documents/{project}::New.md"),
        Value::Null,
    );
    assert_eq!(document["markdown"], "new bytes");
    assert!(api
        .handle(
            "POST",
            &route,
            json!({"name":"New.md","markdown":"replacement"}),
            vec![]
        )
        .is_err());
    assert_eq!(fs::read(root.join("New.md")).unwrap(), b"new bytes");
    let folders = format!("/api/projects/{project}/folders");
    let result = call(&api, "POST", &folders, json!({"name":"Created"}));
    assert_eq!(result["treeAvailable"], false);
    assert!(root.join("Created").is_dir());
    fs::write(root.join("Created/Keep.txt"), b"kept").unwrap();
    assert!(api
        .handle("POST", &folders, json!({"name":"Created"}), vec![])
        .is_err());
    assert_eq!(fs::read(root.join("Created/Keep.txt")).unwrap(), b"kept");
}
