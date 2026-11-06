use knownext_storage::LocalApi;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{fs, path::PathBuf};
fn call(api: &LocalApi, method: &str, path: &str, body: Value) -> Value {
    let response = api.handle(method, path, body, vec![]).unwrap();
    assert_eq!(response.status, 200, "{}", response.body);
    response.body
}
#[test]
fn stale_ram_cannot_replace_a_draft_published_by_another_operation_even_when_disk_is_unchanged() {
    let owned = tempfile::tempdir().unwrap();
    let api = LocalApi::new(owned.path().join("state"), "qa".into(), "test".into());
    let project = call(
        &api,
        "POST",
        "/api/projects",
        json!({"name":"Owned stale RAM","versioningMode":"none","syncMode":"none"}),
    );
    let pid = project["id"].as_str().unwrap();
    let root = PathBuf::from(project["folderPath"].as_str().unwrap());
    let id = format!("{pid}::A.md");
    fs::write(root.join("A.md"), b"Disk\n").unwrap();
    call(
        &api,
        "PUT",
        &format!("/api/documents/{id}/draft"),
        json!({"markdown":"Old RAM\n"}),
    );
    let old = call(&api, "GET", &format!("/api/documents/{id}"), Value::Null);
    let review = call(
        &api,
        "GET",
        &format!("/api/documents/{id}/conflict"),
        Value::Null,
    );
    let merged = call(
        &api,
        "POST",
        &format!("/api/documents/{id}/conflict"),
        json!({"attemptId":"attempt-owned-stale-ram-0001","locationRevision":review["locationRevision"],"diskFingerprint":review["diskFingerprint"],"draftRevision":review["draftRevision"],"localMarkdown":"Old RAM\n","mergedMarkdown":"Combined by another operation\n"}),
    );
    assert_eq!(
        merged["document"]["markdown"],
        "Combined by another operation\n"
    );
    let stale=api.handle("PUT",&format!("/api/documents/{id}/draft"),json!({"markdown":"Old RAM\n","baseFingerprint":old["baseFingerprint"],"expectedDraftWriteRevision":old["draftContentHash"]}),vec![]).unwrap();
    assert_eq!(
        stale.status, 409,
        "A stale checkpoint must not replace the newer private draft"
    );
    assert_eq!(
        call(&api, "GET", &format!("/api/documents/{id}"), Value::Null)["markdown"],
        "Combined by another operation\n"
    );
    assert_eq!(fs::read(root.join("A.md")).unwrap(), b"Disk\n");
}

#[test]
fn guarded_save_force_discard_and_disk_reload_preserve_the_unseen_draft_and_unknown_state() {
    let owned = tempfile::tempdir().unwrap();
    let state = owned.path().join("state");
    let api = LocalApi::new(state.clone(), "qa".into(), "test".into());
    let project = call(
        &api,
        "POST",
        "/api/projects",
        json!({"name":"Guarded writes","versioningMode":"none","syncMode":"none"}),
    );
    let pid = project["id"].as_str().unwrap();
    let root = PathBuf::from(project["folderPath"].as_str().unwrap());
    let id = format!("{pid}::A.md");
    fs::write(root.join("A.md"), b"Disk\n").unwrap();
    let initial = call(&api, "GET", &format!("/api/documents/{id}"), Value::Null);
    assert!(initial["draftWriteRevision"].is_null());
    let first = call(
        &api,
        "PUT",
        &format!("/api/documents/{id}/draft"),
        json!({"markdown":"First\n","expectedDraftWriteRevision":null}),
    );
    let second = call(
        &api,
        "PUT",
        &format!("/api/documents/{id}/draft"),
        json!({"markdown":"Second\n","expectedDraftWriteRevision":first["draftWriteRevision"]}),
    );
    let file = state
        .join("drafts")
        .join(format!("v2_{:x}.json", Sha256::digest(id.as_bytes())));
    let before = fs::read(&file).unwrap();
    for (method, suffix, body) in [
        ("PUT", "", json!({"markdown":"stale","force":true})),
        ("DELETE", "/draft", json!({})),
        ("POST", "/draft/discard-and-read", json!({})),
    ] {
        let mut body = body;
        body["expectedDraftWriteRevision"] = first["draftWriteRevision"].clone();
        let result = api
            .handle(
                method,
                &format!("/api/documents/{id}{suffix}"),
                body,
                vec![],
            )
            .unwrap();
        assert_eq!(result.status, 409);
        assert_eq!(result.body["code"], "draft_write_conflict");
        assert_eq!(result.body["operationOutcome"], "not-started");
        assert_eq!(fs::read(&file).unwrap(), before);
        assert_eq!(fs::read(root.join("A.md")).unwrap(), b"Disk\n");
    }
    let mut future: Value = serde_json::from_slice(&before).unwrap();
    future["schemaVersion"] = json!(8);
    fs::write(&file, serde_json::to_vec(&future).unwrap()).unwrap();
    let future_raw = fs::read(&file).unwrap();
    let blocked = api
        .handle(
            "PUT",
            &format!("/api/documents/{id}/draft"),
            json!({"markdown":"stale","expectedDraftWriteRevision":second["draftWriteRevision"]}),
            vec![],
        )
        .unwrap();
    assert_eq!(blocked.status, 503);
    assert_eq!(fs::read(&file).unwrap(), future_raw);
    fs::write(&file, &before).unwrap();
    let mut compatible: Value = serde_json::from_slice(&before).unwrap();
    compatible["inertMetadata"] = json!({"keep":"exact"});
    fs::write(&file, serde_json::to_vec(&compatible).unwrap()).unwrap();
    let ack = call(
        &api,
        "PUT",
        &format!("/api/documents/{id}/draft"),
        json!({"markdown":"Third\n","expectedDraftWriteRevision":second["draftWriteRevision"]}),
    );
    let persisted: Value = serde_json::from_slice(&fs::read(&file).unwrap()).unwrap();
    assert_eq!(persisted["inertMetadata"], compatible["inertMetadata"]);
    let saved = call(
        &api,
        "PUT",
        &format!("/api/documents/{id}"),
        json!({"markdown":"Third\n","baseFingerprint":initial["baseFingerprint"],"expectedDraftWriteRevision":ack["draftWriteRevision"]}),
    );
    assert!(saved["draftWriteRevision"].is_null());
    assert!(!file.exists());
    assert_eq!(fs::read(root.join("A.md")).unwrap(), b"Third\n");
}

#[test]
fn note_revision_survives_root_timestamps_and_rename_but_protects_every_point() {
    let owned = tempfile::tempdir().unwrap();
    let state = owned.path().join("state");
    let api = LocalApi::new(state.clone(), "qa".into(), "test".into());
    let project = call(
        &api,
        "POST",
        "/api/projects",
        json!({"name":"Note revision","versioningMode":"none","syncMode":"none"}),
    );
    let pid = project["id"].as_str().unwrap();
    call(
        &api,
        "POST",
        &format!("/api/projects/{pid}/handwritten-notes"),
        json!({"name":"A.knote"}),
    );
    let id = format!("{pid}::A.knote");
    let original = call(
        &api,
        "GET",
        &format!("/api/handwritten-notes/{id}"),
        Value::Null,
    );
    let mut content = original["content"].clone();
    content["pages"][0]["strokes"] = json!([{"id":"stroke-a","color":"#111827","width":2,"opacity":1,"points":[[10,20,0.7,0,45,-30],[20,30,0.8,16,35,-20]]}]);
    let ack = call(
        &api,
        "PUT",
        &format!("/api/handwritten-notes/{id}/draft"),
        json!({"content":content,"expectedDraftWriteRevision":null}),
    );
    let file = state
        .join("drafts")
        .join(format!("v2_{:x}.json", Sha256::digest(id.as_bytes())));
    let mut draft: Value = serde_json::from_slice(&fs::read(&file).unwrap()).unwrap();
    draft["content"]["updatedAt"] = json!("2026-11-02T20:00:00Z");
    draft["content"]["id"] = json!("old-root-identity");
    fs::write(&file, serde_json::to_vec(&draft).unwrap()).unwrap();
    assert_eq!(
        call(
            &api,
            "GET",
            &format!("/api/handwritten-notes/{id}"),
            Value::Null
        )["draftWriteRevision"],
        ack["draftWriteRevision"]
    );
    call(
        &api,
        "PATCH",
        &format!("/api/projects/{pid}/nodes/{id}/rename"),
        json!({"name":"B.knote"}),
    );
    let moved = format!("{pid}::B.knote");
    let record = call(
        &api,
        "GET",
        &format!("/api/handwritten-notes/{moved}"),
        Value::Null,
    );
    assert_eq!(record["draftWriteRevision"], ack["draftWriteRevision"]);
    let mut changed = record["content"].clone();
    changed["pages"][0]["strokes"][0]["points"][1][5] = json!(-15);
    let next = call(
        &api,
        "PUT",
        &format!("/api/handwritten-notes/{moved}/draft"),
        json!({"content":changed,"expectedDraftWriteRevision":ack["draftWriteRevision"]}),
    );
    assert_ne!(next["draftWriteRevision"], ack["draftWriteRevision"]);
    let rejected = api
        .handle(
            "DELETE",
            &format!("/api/handwritten-notes/{moved}/draft"),
            json!({"expectedDraftWriteRevision":ack["draftWriteRevision"]}),
            vec![],
        )
        .unwrap();
    assert_eq!(rejected.status, 409);
    assert_eq!(
        call(
            &api,
            "GET",
            &format!("/api/handwritten-notes/{moved}"),
            Value::Null
        )["content"]["pages"][0]["strokes"][0]["points"][1][5],
        -15
    );
}

#[test]
fn independent_editor_copy_is_verifiable_after_reopen_and_never_changes_or_replays_the_active_draft(
) {
    let owned = tempfile::tempdir().unwrap();
    let state = owned.path().join("state");
    let api = LocalApi::new(state.clone(), "qa".into(), "test".into());
    let project = call(
        &api,
        "POST",
        "/api/projects",
        json!({"name":"Local RAM copy","versioningMode":"none","syncMode":"none"}),
    );
    let pid = project["id"].as_str().unwrap();
    let root = PathBuf::from(project["folderPath"].as_str().unwrap());
    let id = format!("{pid}::A.md");
    fs::write(root.join("A.md"), "Disk\n").unwrap();
    call(
        &api,
        "PUT",
        &format!("/api/documents/{id}/draft"),
        json!({"markdown":"Other private draft\n"}),
    );
    let active = state
        .join("drafts")
        .join(format!("v2_{:x}.json", Sha256::digest(id.as_bytes())));
    let before = fs::read(&active).unwrap();
    let key = "recovery-0123456789abcdef0123456789abcdef";
    let path = format!("/api/recovery/local-edits/{key}");
    let body = json!({"documentId":id,"markdown":"RAM to conserve\n","baseFingerprint":null});
    assert!(LocalApi::is_independent_snapshot(
        "POST",
        &format!("{path}/review")
    ));
    assert_eq!(
        call(&api, "POST", &format!("{path}/review"), body.clone())["status"],
        "absent"
    );
    assert!(!state.join("drafts-review").exists());
    let proof = call(&api, "POST", &path, body.clone());
    assert_eq!(proof["status"], "verified");
    let inventory=call(&api,"GET","/api/recovery/archives",Value::Null);
    assert!(inventory["items"].as_array().unwrap().iter().any(|row|row["key"]==key&&row["reason"].as_str().is_some_and(|s|s.contains("Edición abierta conservada"))));
    let folder = state.join("drafts-review").join(key);
    let copy = fs::read(folder.join("copy.json")).unwrap();
    let manifest = fs::read(folder.join("manifest.json")).unwrap();
    let reopened = LocalApi::new(state.clone(), "qa".into(), "test".into());
    assert_eq!(
        call(&reopened, "POST", &format!("{path}/review"), body.clone())["copy"],
        proof["copy"]
    );
    assert_eq!(fs::read(folder.join("copy.json")).unwrap(), copy);
    assert_eq!(fs::read(folder.join("manifest.json")).unwrap(), manifest);
    assert_eq!(fs::read(&active).unwrap(), before);
    assert!(reopened
        .handle(
            "POST",
            &path,
            json!({"documentId":id,"markdown":"Different RAM"}),
            vec![]
        )
        .is_err());
    assert_eq!(fs::read(folder.join("copy.json")).unwrap(), copy);
    let recovered = call(
        &api,
        "POST",
        &format!("/api/recovery/drafts/{key}/copy"),
        json!({"fingerprint":proof["copy"]["fingerprint"],"source":"archive","projectId":pid,"name":"Recovered.md"}),
    );
    assert!(recovered.is_object());
    assert_eq!(
        fs::read_to_string(root.join("Recovered.md")).unwrap(),
        "RAM to conserve\n"
    );
    assert_eq!(fs::read(&active).unwrap(), before);
    let mut future: Value = serde_json::from_slice(&manifest).unwrap();
    future["schemaVersion"] = json!(9);
    fs::write(
        folder.join("manifest.json"),
        serde_json::to_vec(&future).unwrap(),
    )
    .unwrap();
    let unknown = fs::read(folder.join("manifest.json")).unwrap();
    assert!(api
        .handle("POST", &format!("{path}/review"), body.clone(), vec![])
        .is_err());
    assert!(api.handle("POST", &path, body, vec![]).is_err());
    assert_eq!(fs::read(folder.join("manifest.json")).unwrap(), unknown);
    assert_eq!(fs::read(&active).unwrap(), before);
}

#[test]
fn local_editor_preservation_is_independent_bounded_and_preserves_incomplete_pairs(){
    let owned=tempfile::tempdir().unwrap();let state=owned.path().join("state");let api=LocalApi::new(state.clone(),"qa".into(),"test".into());fs::create_dir_all(&state).unwrap();fs::write(state.join("projects.json"),b"{ unknown registry").unwrap();
    let id="owned::Missing.md";let body=json!({"documentId":id,"markdown":"Preserve even without a readable project registry"});let key="recovery-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";let path=format!("/api/recovery/local-edits/{key}");
    assert_eq!(call(&api,"POST",&path,body.clone())["status"],"verified");assert_eq!(fs::read(state.join("projects.json")).unwrap(),b"{ unknown registry");
    let root=state.join("drafts-review");let partial="recovery-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";let folder=root.join(partial);fs::create_dir(&folder).unwrap();fs::write(folder.join("copy.json"),b"incomplete original").unwrap();
    for suffix in ["","/review"]{assert!(api.handle("POST",&format!("/api/recovery/local-edits/{partial}{suffix}"),body.clone(),vec![]).is_err());}assert_eq!(fs::read(folder.join("copy.json")).unwrap(),b"incomplete original");assert!(!folder.join("manifest.json").exists());
    let fresh="recovery-cccccccccccccccccccccccccccccccc";
    assert!(api.handle("POST",&format!("/api/recovery/local-edits/{fresh}"),json!({"documentId":id,"markdown":"x".repeat(2*1024*1024+1)}),vec![]).is_err());assert!(!root.join(fresh).exists());
    for index in 0..998{fs::create_dir(root.join(format!("unknown-preserved-{index}"))).unwrap();}
    assert!(api.handle("POST",&format!("/api/recovery/local-edits/{fresh}"),body,vec![]).is_err());assert!(!root.join(fresh).exists());assert_eq!(fs::read_dir(&root).unwrap().count(),1000);assert_eq!(fs::read(folder.join("copy.json")).unwrap(),b"incomplete original");
}
