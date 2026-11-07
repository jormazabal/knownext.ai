use knownext_storage::LocalApi;
use serde_json::{json, Value};
use std::{fs, path::PathBuf};
fn call(api: &LocalApi, method: &str, path: &str, body: Value) -> Value {
    let result = api.handle(method, path, body, vec![]).unwrap();
    assert_eq!(result.status, 200, "{}", result.body);
    result.body
}

#[test]
fn retained_and_current_locations_have_distinct_ids_and_inventory_never_claims_the_new_root(){
 let owned=tempfile::tempdir().unwrap();let state=owned.path().join("state");let api=LocalApi::new(state.clone(),"qa".into(),"test".into());let project=call(&api,"POST","/api/projects",json!({"name":"Moved registry","versioningMode":"none","syncMode":"none"}));let p=project["id"].as_str().unwrap();let original=PathBuf::from(project["folderPath"].as_str().unwrap());fs::create_dir(original.join(".knownext-trash")).unwrap();fs::write(original.join(".knownext-trash/owned.bin"),[1u8;3]).unwrap();
 call(&api,"POST",&format!("/api/projects/{p}/retire"),json!({}));let catalog=call(&api,"GET","/api/retired-projects",Value::Null);call(&api,"POST",&format!("/api/retired-projects/{p}/restore"),json!({"revision":catalog["entries"][0]["revision"]}));
 let current=owned.path().join("current-location");fs::create_dir_all(current.join(".knownext-trash")).unwrap();fs::write(current.join(".knownext-trash/owned.bin"),[2u8;5]).unwrap();let mut registry:Value=serde_json::from_slice(&fs::read(state.join("projects.json")).unwrap()).unwrap();let row=registry["projects"].as_array_mut().unwrap().iter_mut().find(|row|row["id"]==p).unwrap();row["folderPath"]=json!(current);let registry_bytes=serde_json::to_vec(&registry).unwrap();fs::write(state.join("projects.json"),&registry_bytes).unwrap();assert!(!current.join(".knownext-runtime").exists());
 let inventory=view(&api);assert_eq!(inventory["complete"],true,"{inventory}");assert_eq!(inventory["bytes"],8);let rows=inventory["items"].as_array().unwrap();assert_eq!(rows.len(),2);assert_ne!(rows[0]["id"],rows[1]["id"]);assert!(rows.iter().any(|row|row["projectState"]=="retained"&&row["bytes"]==3));assert!(rows.iter().any(|row|row["projectState"]=="registered"&&row["bytes"]==5));assert_eq!(fs::read(state.join("projects.json")).unwrap(),registry_bytes);assert!(!current.join(".knownext-runtime").exists());
}
fn view(api: &LocalApi) -> Value {
    call(api, "GET", "/api/recovery/storage", Value::Null)
}
#[test]
fn retired_project_stores_remain_measured_and_future_catalog_never_means_empty() {
    assert!(LocalApi::is_independent_snapshot("GET","/api/recovery/storage"));
    assert!(LocalApi::is_independent_snapshot("GET","/api/projects/project-owned/portable-preferences"));
    assert!(LocalApi::is_independent_snapshot("GET","/api/recovery/conflict-attempts/attempt-owned-01/payloads"));
    assert!(!LocalApi::is_independent_snapshot("POST","/api/projects/project-owned/portable-preferences"));
    assert!(!LocalApi::is_independent_snapshot("PUT","/api/recovery/storage/policy"));
    let owned = tempfile::tempdir().unwrap();
    let state = owned.path().join("state");
    let external = owned.path().join("external");
    let api = LocalApi::new(state.clone(), "qa".into(), "test".into());
    let project = call(
        &api,
        "POST",
        "/api/projects",
        json!({"name":"Proyecto conservado","folderPath":external,"versioningMode":"none","syncMode":"none"}),
    );
    let p = project["id"].as_str().unwrap();
    let folder = external.join(".knownext-trash");
    fs::create_dir_all(&folder).unwrap();
    let payload = folder.join("owned.bin");
    fs::File::create(&payload)
        .unwrap()
        .set_len(16 * 1024 * 1024)
        .unwrap();
    let first = view(&api);
    assert_eq!(first["bytes"], 16 * 1024 * 1024);
    assert_eq!(first["items"][0]["projectState"], "registered");
    let policy = call(
        &api,
        "PUT",
        "/api/recovery/storage/policy",
        json!({"revision":first["policy"]["revision"],"enabled":true,"maxBytes":16*1024*1024}),
    );
    let policy_bytes = fs::read(state.join("recovery-policy.json")).unwrap();
    call(
        &api,
        "POST",
        &format!("/api/projects/{p}/retire"),
        json!({}),
    );
    let retired_bytes = fs::read(state.join("retired-projects.json")).unwrap();
    let after = view(&api);
    assert_eq!(after["complete"], true, "{after}");
    assert_eq!(after["bytes"], first["bytes"]);
    assert_eq!(after["items"][0]["projectState"], "retired");
    assert_eq!(after["items"][0]["projectId"], p);
    assert_eq!(after["items"][0]["canReviewKnownBytes"], false);
    assert_eq!(after["policy"]["revision"], policy["policy"]["revision"]);
    assert!(call(&api, "GET", "/api/projects", Value::Null)
        .as_array()
        .unwrap()
        .is_empty());
    assert_eq!(fs::metadata(&payload).unwrap().len(), 16 * 1024 * 1024);
    assert_eq!(
        fs::read(state.join("retired-projects.json")).unwrap(),
        retired_bytes
    );
    let other = call(
        &api,
        "POST",
        "/api/projects",
        json!({"name":"Current work","versioningMode":"none","syncMode":"none"}),
    );
    let root = PathBuf::from(other["folderPath"].as_str().unwrap());
    fs::write(root.join("Acta.md"), b"Disco\n").unwrap();
    let id = format!("{}::Acta.md", other["id"].as_str().unwrap());
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
    let denied=api.handle("POST",&format!("/api/documents/{id}/conflict"),json!({"attemptId":"attempt-retired-budget-owned-01","locationRevision":review["locationRevision"],"diskFingerprint":review["diskFingerprint"],"draftRevision":review["draftRevision"],"localMarkdown":"Local\n","mergedMarkdown":"Combinado\n"}),vec![]);
    assert!(denied.is_err());
    assert_eq!(fs::read(root.join("Acta.md")).unwrap(), b"Disco\n");
    fs::write(
        state.join("retired-projects.json"),
        b"{\"schemaVersion\":99,\"entries\":[]}",
    )
    .unwrap();
    let future = view(&api);
    assert_eq!(future["complete"], false);
    assert_eq!(future["projectMappingComplete"], false);
    assert_eq!(
        fs::read(state.join("retired-projects.json")).unwrap(),
        b"{\"schemaVersion\":99,\"entries\":[]}"
    );
    assert_eq!(
        fs::read(state.join("recovery-policy.json")).unwrap(),
        policy_bytes
    );
    assert_eq!(fs::metadata(payload).unwrap().len(), 16 * 1024 * 1024);
}
