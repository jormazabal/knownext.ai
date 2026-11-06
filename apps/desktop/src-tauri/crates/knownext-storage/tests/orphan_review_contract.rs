use knownext_storage::LocalApi;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{fs, path::PathBuf};
fn call(api: &LocalApi, method: &str, path: &str, body: Value) -> Value {
    let response = api.handle(method, path, body, vec![]).unwrap();
    assert!(
        response.status == 200 || method == "DELETE" && response.status == 204,
        "{}",
        response.body
    );
    response.body
}
#[test]
fn stale_missing_file_selection_cannot_delete_a_newer_private_draft() {
    let owned = tempfile::tempdir().unwrap();
    let api = LocalApi::new(owned.path().join("state"), "qa".into(), "test".into());
    let project = call(
        &api,
        "POST",
        "/api/projects",
        json!({"name":"Owned missing-file review","versioningMode":"none","syncMode":"none"}),
    );
    let root = PathBuf::from(project["folderPath"].as_str().unwrap());
    let id = format!("{}::A.md", project["id"].as_str().unwrap());
    fs::write(root.join("A.md"), b"Disk\n").unwrap();
    let reviewed = call(
        &api,
        "PUT",
        &format!("/api/documents/{id}/draft"),
        json!({"markdown":"Reviewed older draft\n"}),
    );
    assert_eq!(reviewed["draftWriteRevision"].as_str().unwrap().len(), 64);
    fs::remove_file(root.join("A.md")).unwrap();
    let rows = call(&api, "GET", "/api/drafts/orphans", Value::Null);
    let selected = &rows[0];
    call(
        &api,
        "PUT",
        &format!("/api/documents/{id}/draft"),
        json!({"markdown":"New private work\n","expectedDraftWriteRevision":reviewed["draftWriteRevision"]}),
    );
    let response=api.handle("DELETE",&format!("/api/drafts/{}",selected["draftKey"].as_str().unwrap()),json!({"documentId":id,"expectedFingerprint":selected["fingerprint"],"locationRevision":selected["locationRevision"]}),vec![]);
    assert!(
        response.is_err()
            || response
                .as_ref()
                .is_ok_and(|response| response.status >= 400),
        "An old missing-file selection must not delete the newer private work"
    );
    let draft: Value = serde_json::from_slice(
        &fs::read(
            owned
                .path()
                .join("state/drafts")
                .join(format!("v2_{:x}.json", Sha256::digest(id.as_bytes()))),
        )
        .unwrap(),
    )
    .unwrap();
    assert_eq!(draft["markdown"], "New private work\n");
    assert!(!root.join("A.md").exists());
}

fn proof(row: &Value) -> Value {
    json!({"documentId":row["documentId"],"expectedFingerprint":row["fingerprint"],"locationRevision":row["locationRevision"]})
}
fn private_file(state: &std::path::Path, id: &str) -> PathBuf {
    state
        .join("drafts")
        .join(format!("v2_{:x}.json", Sha256::digest(id.as_bytes())))
}
fn rejected(result: Result<knownext_storage::LocalApiResponse, String>) {
    assert!(
        result.is_err() || result.as_ref().is_ok_and(|response| response.status >= 400),
        "The reviewed action must be refused without changing the copy"
    );
}

#[test]
fn reviewed_missing_file_recovery_recreates_markdown_and_all_note_points_without_discarding_unseen_state(
) {
    let owned = tempfile::tempdir().unwrap();
    let state = owned.path().join("state");
    let api = LocalApi::new(state.clone(), "qa".into(), "test".into());
    let project = call(
        &api,
        "POST",
        "/api/projects",
        json!({"name":"Reviewed recovery","versioningMode":"none","syncMode":"none"}),
    );
    let pid = project["id"].as_str().unwrap();
    let root = PathBuf::from(project["folderPath"].as_str().unwrap());
    let markdown = format!("{pid}::A.md");
    fs::write(root.join("A.md"), "Disk\n").unwrap();
    call(
        &api,
        "PUT",
        &format!("/api/documents/{markdown}/draft"),
        json!({"markdown":"Recovered paragraph\n"}),
    );
    fs::remove_file(root.join("A.md")).unwrap();
    call(
        &api,
        "POST",
        &format!("/api/projects/{pid}/handwritten-notes"),
        json!({"name":"Sketch.knote"}),
    );
    let note = format!("{pid}::Sketch.knote");
    let mut content = call(
        &api,
        "GET",
        &format!("/api/handwritten-notes/{note}"),
        Value::Null,
    )["content"]
        .clone();
    content["pages"][0]["strokes"] = json!([{"id":"owned-stroke","color":"#111827","width":2,"opacity":1,"points":[[10,20,0.7,0,45,-30],[20,30,0.8,16,35,-20]]}]);
    call(
        &api,
        "PUT",
        &format!("/api/handwritten-notes/{note}/draft"),
        json!({"content":content}),
    );
    fs::remove_file(root.join("Sketch.knote")).unwrap();
    let inventory = call(&api, "GET", "/api/recovery/orphans", Value::Null);
    assert_eq!(inventory["schemaVersion"], 1);
    assert_eq!(inventory["limited"], false);
    assert_eq!(inventory["items"].as_array().unwrap().len(), 2);
    for row in inventory["items"].as_array().unwrap() {
        assert_eq!(row["fingerprint"].as_str().unwrap().len(), 64);
        assert_eq!(row["locationRevision"].as_str().unwrap().len(), 64);
        let result = call(
            &api,
            "POST",
            &format!("/api/drafts/{}/restore", row["draftKey"].as_str().unwrap()),
            proof(row),
        );
        let record = if row["kind"] == "document" {
            &result["document"]
        } else {
            &result["note"]
        };
        assert!(record["draftWriteRevision"].is_null());
        assert_ne!(record["draftWriteConflict"], true);
        assert!(!private_file(&state, row["documentId"].as_str().unwrap()).exists());
    }
    assert_eq!(
        fs::read_to_string(root.join("A.md")).unwrap(),
        "Recovered paragraph\n"
    );
    let restored: Value =
        serde_json::from_slice(&fs::read(root.join("Sketch.knote")).unwrap()).unwrap();
    assert_eq!(
        restored["pages"][0]["strokes"][0]["points"],
        content["pages"][0]["strokes"][0]["points"]
    );
    assert!(
        call(&api, "GET", "/api/recovery/orphans", Value::Null)["items"]
            .as_array()
            .unwrap()
            .is_empty()
    );
}

#[test]
fn reviewed_actions_preserve_copies_when_file_reappears_location_changes_or_payload_is_missing_future_or_mismatched(
) {
    let owned = tempfile::tempdir().unwrap();
    let state = owned.path().join("state");
    let api = LocalApi::new(state.clone(), "qa".into(), "test".into());
    let project = call(
        &api,
        "POST",
        "/api/projects",
        json!({"name":"Refused missing-file actions","versioningMode":"none","syncMode":"none"}),
    );
    let pid = project["id"].as_str().unwrap();
    let root = PathBuf::from(project["folderPath"].as_str().unwrap());
    let id = format!("{pid}::A.md");
    fs::write(root.join("A.md"), "Disk\n").unwrap();
    call(
        &api,
        "PUT",
        &format!("/api/documents/{id}/draft"),
        json!({"markdown":"Keep this copy\n"}),
    );
    fs::remove_file(root.join("A.md")).unwrap();
    let inventory = call(&api, "GET", "/api/recovery/orphans", Value::Null);
    let row = &inventory["items"][0];
    let copy = private_file(&state, &id);
    let before = fs::read(&copy).unwrap();
    let key = row["draftKey"].as_str().unwrap();
    for (method, suffix) in [("DELETE", ""), ("POST", "/restore")] {
        rejected(api.handle(
            method,
            &format!("/api/drafts/{key}{suffix}"),
            Value::Null,
            vec![],
        ));
        assert_eq!(fs::read(&copy).unwrap(), before);
    }
    fs::write(root.join("A.md"), "External file came back\n").unwrap();
    for (method, suffix) in [("DELETE", ""), ("POST", "/restore")] {
        rejected(api.handle(
            method,
            &format!("/api/drafts/{key}{suffix}"),
            proof(row),
            vec![],
        ));
        assert_eq!(fs::read(&copy).unwrap(), before);
        assert_eq!(
            fs::read_to_string(root.join("A.md")).unwrap(),
            "External file came back\n"
        );
    }
    fs::remove_file(root.join("A.md")).unwrap();
    let mut wrong = proof(row);
    wrong["documentId"] = json!(format!("{pid}::Other.md"));
    rejected(api.handle("DELETE", &format!("/api/drafts/{key}"), wrong, vec![]));
    assert_eq!(fs::read(&copy).unwrap(), before);
    let registry_path = state.join("projects.json");
    let registry_before = fs::read(&registry_path).unwrap();
    let mut registry: Value = serde_json::from_slice(&registry_before).unwrap();
    let target = owned.path().join("other-owned-root");
    fs::create_dir(&target).unwrap();
    for project in registry["projects"].as_array_mut().unwrap() {
        if project["id"] == pid {
            project["folderPath"] = json!(target.to_string_lossy());
        }
    }
    fs::write(&registry_path, serde_json::to_vec(&registry).unwrap()).unwrap();
    rejected(api.handle(
        "POST",
        &format!("/api/drafts/{key}/restore"),
        proof(row),
        vec![],
    ));
    assert!(!target.join("A.md").exists());
    assert!(!root.join("A.md").exists());
    assert_eq!(fs::read(&copy).unwrap(), before);
    fs::write(&registry_path, &registry_before).unwrap();
    let mut future: Value = serde_json::from_slice(&before).unwrap();
    future["schemaVersion"] = json!(90);
    fs::write(&copy, serde_json::to_vec(&future).unwrap()).unwrap();
    let future_raw = fs::read(&copy).unwrap();
    let mut reviewed_future = proof(row);
    reviewed_future["expectedFingerprint"] = json!(format!("{:x}", Sha256::digest(&future_raw)));
    rejected(api.handle(
        "DELETE",
        &format!("/api/drafts/{key}"),
        reviewed_future,
        vec![],
    ));
    assert_eq!(fs::read(&copy).unwrap(), future_raw);
    fs::write(&copy, &before).unwrap();
    call(&api, "DELETE", &format!("/api/drafts/{key}"), proof(row));
    assert!(!copy.exists());
    assert!(!root.join("A.md").exists());
}
