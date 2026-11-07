use super::*;
use std::{fs, sync::mpsc, time::Duration};
fn fixture() -> (tempfile::TempDir, LocalApi, String, PathBuf) {
    let temp = tempfile::tempdir().unwrap();
    let api = LocalApi::new(temp.path().join("state"), "qa".into(), "test".into());
    let project = api
        .handle(
            "POST",
            "/api/projects",
            json!({"name":"Owned admission","versioningMode":"none","syncMode":"none"}),
            vec![],
        )
        .unwrap()
        .body;
    let id = project["id"].as_str().unwrap().to_owned();
    let root = PathBuf::from(project["folderPath"].as_str().unwrap());
    fs::write(root.join("A.md"), b"Saved source").unwrap();
    (temp, api, id, root)
}
#[test]
fn project_mutation_fence_blocks_foreign_writers_and_recording_but_keeps_reads_and_other_projects_available(
) {
    let (_temp, api, project, root) = fixture();
    let id = doc_id(&project, "A.md");
    let other = api
        .handle(
            "POST",
            "/api/projects",
            json!({"name":"Other owned project","versioningMode":"none","syncMode":"none"}),
            vec![],
        )
        .unwrap()
        .body["id"]
        .as_str()
        .unwrap()
        .to_owned();
    let transaction = api.project_transaction(&project).unwrap();
    // Nested application on the owning thread remains possible.
    let nested = api.project_write(&project).unwrap();
    drop(nested);
    let worker = api.clone();
    let owner = project.clone();
    let other_worker = other.clone();
    let document = id.clone();
    let result = std::thread::spawn(move || {
        assert!(worker
            .handle(
                "GET",
                &format!("/api/documents/{document}"),
                Value::Null,
                vec![]
            )
            .is_ok());
        let blocked = worker
            .handle(
                "PUT",
                &format!("/api/documents/{document}/draft"),
                json!({"markdown":"Unsent draft"}),
                vec![],
            )
            .unwrap();
        assert_eq!(blocked.status,409);
        assert_eq!(blocked.body["operationOutcome"],"not-started");
        assert!(blocked.body["detail"].as_str().unwrap().contains("integridad en curso"));
        assert!(worker
            .create_recording_document("owned-session", &owner, None, "Meeting", "Owned transcript")
            .is_err());
        assert!(worker
            .handle(
                "POST",
                &format!("/api/projects/{owner}/documents"),
                json!({"name":"Blocked.md","markdown":"Blocked"}),
                vec![]
            )
            .unwrap().status==409);
        assert!(worker
            .handle(
                "POST",
                &format!("/api/projects/{other_worker}/documents"),
                json!({"name":"Independent.md","markdown":"Other project"}),
                vec![]
            )
            .is_ok());
        assert!(worker
            .handle(
                "POST",
                &format!("/api/projects/{owner}/nodes/batch/batch-not-active/cancel"),
                Value::Null,
                vec![]
            )
            .err()
            .is_some_and(|error| !error.contains("integridad en curso")));
        blocked
    })
    .join()
    .unwrap();
    assert_eq!(result.body["code"],"project_write_not_started");
    assert_eq!(fs::read(root.join("A.md")).unwrap(), b"Saved source");
    assert!(!root.join("Meeting.md").exists());
    assert!(!root.join("Blocked.md").exists());
    assert!(!api.app_data_dir.join("drafts").exists());
    drop(transaction);
    // Release does not replay anything. A fresh explicit request can proceed.
    assert!(!root.join("Meeting.md").exists());
    api.handle(
        "PUT",
        &format!("/api/documents/{id}/draft"),
        json!({"markdown":"Explicit new draft"}),
        vec![],
    )
    .unwrap();
    assert_eq!(
        api.handle("GET", &format!("/api/documents/{id}"), Value::Null, vec![])
            .unwrap()
            .body["markdown"],
        "Explicit new draft"
    );
    api.create_recording_document(
        "owned-session",
        &project,
        None,
        "Meeting",
        "Owned transcript",
    )
    .unwrap();
    assert_eq!(
        fs::read(root.join("Meeting.md")).unwrap(),
        b"Owned transcript"
    );
}
#[test]
fn project_mutation_fence_has_no_lock_upgrade_wait_and_nested_release_cannot_unlock_an_active_child(
) {
    let (temp, api, project, _root) = fixture();
    let writer = api.project_write(&project).unwrap();
    assert!(api.project_transaction(&project).is_err());
    drop(writer);
    let transaction = api.project_transaction(&project).unwrap();
    let child = api.project_write(&project).unwrap();
    drop(transaction);
    let worker = LocalApi::new(temp.path().join("state"), "qa".into(), "test".into());
    let owner = project.clone();
    assert!(
        std::thread::spawn(move || worker.project_write(&owner).is_err())
            .join()
            .unwrap()
    );
    drop(child);
    let (entered, ready) = mpsc::channel();
    let (release, resume) = mpsc::channel();
    let worker = api.clone();
    let owner = project.clone();
    let active = std::thread::spawn(move || {
        let _write = worker.project_write(&owner).unwrap();
        entered.send(()).unwrap();
        resume.recv_timeout(Duration::from_secs(5)).unwrap();
    });
    ready.recv_timeout(Duration::from_secs(5)).unwrap();
    assert!(api.project_transaction(&project).is_err());
    release.send(()).unwrap();
    active.join().unwrap();
    let _transaction = api.project_transaction(&project).unwrap();
}
