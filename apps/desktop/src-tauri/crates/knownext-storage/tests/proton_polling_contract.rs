use knownext_storage::{LocalApi, LocalApiFile};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{fs, path::PathBuf};

fn fixture() -> (tempfile::TempDir, LocalApi, String, PathBuf, PathBuf) {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().join("documents");
    let api = LocalApi::new(temp.path().join("state"), "qa".into(), "test".into());
    let project=api.handle("POST","/api/projects",json!({"name":"Polling QA","folderPath":root,"versioningMode":"none","syncMode":"none"}),vec![]).unwrap().body;
    let id = project["id"].as_str().unwrap().to_owned();
    fs::write(root.join("Original.md"), b"# Original\n").unwrap();
    fs::write(root.join("Reference.pdf"), b"%PDF-1.4\n%%EOF\n").unwrap();
    let dir = temp
        .path()
        .join("state/proton-direct")
        .join(format!("{:x}", Sha256::digest(id.as_bytes())));
    fs::create_dir_all(&dir).unwrap();
    let snapshot =
        knownext_sync_folder::capture(&root, "logical", "publication", "receiver", None).unwrap();
    let stamp=format!("{:x}",Sha256::digest(serde_json::to_vec(&json!({"files":snapshot.manifest.files,"directories":snapshot.manifest.directories})).unwrap()));
    let state = json!({"schemaVersion":1,"projectId":id,"deviceId":"receiver","generation":1,
        "binding":{"accountId":"synthetic","accountRootId":"account-root","remoteRootId":"remote","logicalProjectId":"logical","generation":1},
        "review":null,"paused":false,"base":{},"basePublications":{},"heads":{},"seen":[],"causal":null,"lastSentStamp":stamp,
        "publishAttempt":null,"receiveAttempt":null,"conflicts":[],"choices":{},"lastSyncedAt":"2026-11-06T00:00:00Z","verifiedCurrent":true});
    fs::write(dir.join("state.json"), serde_json::to_vec(&state).unwrap()).unwrap();
    (temp, api, id, root, dir)
}
fn status(api: &LocalApi, id: &str) -> Value {
    let response = api
        .handle(
            "GET",
            &format!("/api/projects/{id}/proton-direct"),
            json!(null),
            vec![],
        )
        .unwrap();
    assert_eq!(response.status, 200);
    response.body
}
#[test]
fn read_only_status_polls_and_project_selection_do_not_create_proton_changes() {
    let (_temp, api, id, root, dir) = fixture();
    assert_eq!(status(&api, &id)["pendingOperations"], 0);
    for path in [
        "sync/scan",
        "%73ync/scan",
        "sync/auto-run",
        "github/verify-connection",
        "external-changes/scan",
        "external-changes/%73can?source=manual",
        "active",
    ] {
        let response = api
            .handle(
                if path == "active" { "PUT" } else { "POST" },
                &format!("/api/projects/{id}/{path}"),
                json!({"openDocuments":[],"allowAutoApply":false}),
                vec![],
            )
            .unwrap();
        assert_eq!(response.status, 200, "{path}");
        let observed = status(&api, &id);
        assert_eq!(observed["pendingOperations"], 0, "{path}");
        assert_eq!(observed["remoteConfirmed"], true, "{path}");
        assert!(!dir.join("dirty").exists(), "{path}");
        assert_eq!(fs::read(root.join("Original.md")).unwrap(), b"# Original\n");
    }
}

#[test]
fn previews_search_reviews_and_private_metadata_leave_content_acknowledged() {
    let (_temp, api, id, root, dir) = fixture();
    let preview = api.handle("POST", &format!("/api/projects/{id}/previews"),
        json!({"path":"Reference.pdf"}), vec![]).unwrap();
    assert_eq!(preview.status, 200);
    let preview_id=preview.body["id"].as_str().unwrap();
    let original = fs::read(root.join("Reference.pdf")).unwrap();
    for (path, body) in [
        (format!("previews/{preview_id}/refresh"), json!({})),
        ("search/content".into(), json!({"query":"Original"})),
        ("external-changes/scan".into(), json!({})),
        ("nodes/batch/plan".into(), json!({"action":"trash","nodeIds":[format!("{id}::Original.md")]})),
        ("activity".into(), json!({"type":"viewed","documentId":format!("{id}::Original.md")})),
    ] {
        let response=api.handle("POST", &format!("/api/projects/{id}/{path}"),body,vec![]).unwrap();
        assert!(response.status < 300, "{path}: {}",response.body);
        let observed=status(&api,&id);
        assert_eq!(observed["pendingOperations"],0,"{path}");
        assert_eq!(observed["remoteConfirmed"],true,"{path}");
        assert!(!dir.join("dirty").exists(),"{path}");
        assert_eq!(fs::read(root.join("Reference.pdf")).unwrap(),original);
        assert_eq!(fs::read(root.join("Original.md")).unwrap(),b"# Original\n");
    }
}

#[test]
fn outside_edits_are_detected_even_when_read_only_scan_creates_no_marker() {
    let (_temp,api,id,root,dir)=fixture();
    fs::write(root.join("Original.md"),b"# External edit\n").unwrap();
    let response=api.handle("POST",&format!("/api/projects/{id}/external-changes/scan"),json!({}),vec![]).unwrap();
    assert_eq!(response.status,200);
    assert!(!dir.join("dirty").exists());
    let observed=status(&api,&id);
    assert_eq!(observed["remoteConfirmed"],false);
    assert!(observed["pendingOperations"].as_u64().unwrap()>0);
    assert_eq!(fs::read(root.join("Original.md")).unwrap(),b"# External edit\n");
}
#[test]
fn actual_document_creation_still_records_a_durable_change() {
    let (_temp, api, id, root, dir) = fixture();
    let response = api
        .handle(
            "POST",
            &format!("/api/projects/{id}/documents"),
            json!({"name":"Saved.md","content":"# Saved"}),
            vec![],
        )
        .unwrap();
    assert!(response.status < 300);
    assert!(root.join("Saved.md").is_file());
    assert_eq!(fs::read_dir(dir.join("dirty")).unwrap().count(), 1);
    let observed = status(&api, &id);
    assert_eq!(observed["remoteConfirmed"], false);
    assert!(observed["pendingOperations"].as_u64().unwrap() > 0);
}

#[test]
fn folders_notes_node_changes_and_imports_keep_durable_change_markers() {
    for (method,suffix,body,import) in [
        ("POST","folders",json!({"name":"Created"}),false),
        ("POST","handwritten-notes",json!({"name":"Sketch.knote"}),false),
        ("PATCH","nodes/PROJECT::Original.md/rename",json!({"name":"Renamed.md"}),false),
        ("DELETE","nodes/PROJECT::Original.md",json!({}),false),
        ("POST","attachments",json!({}),true),
    ] {
        let (_temp,api,id,_root,dir)=fixture();
        let path=format!("/api/projects/{id}/{}",suffix.replace("PROJECT",&id));
        let files=if import {vec![LocalApiFile{field_name:"file".into(),name:"sample.bin".into(),mime_type:Some("application/octet-stream".into()),data_base64:"AQID".into()}]} else {vec![]};
        let response=api.handle(method,&path,body,files).unwrap();
        assert!(response.status<300,"{suffix}: {}",response.body);
        assert_eq!(fs::read_dir(dir.join("dirty")).unwrap().count(),1,"{suffix}");
        assert_eq!(status(&api,&id)["remoteConfirmed"],false,"{suffix}");
    }
}
