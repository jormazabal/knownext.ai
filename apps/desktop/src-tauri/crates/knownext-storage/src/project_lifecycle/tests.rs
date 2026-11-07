use super::*;

fn setup() -> (tempfile::TempDir, LocalApi, Value) {
    let root = tempfile::tempdir().unwrap();
    let api = LocalApi::new(root.path().join("state"), "test".into(), "test".into());
    let project = api.create_project(json!({"name":"Original","folderPath":root.path().join("documents"),"versioningMode":"none","syncMode":"none"})).unwrap();
    (root, api, project)
}

fn request(api: &LocalApi, method: &str, path: &str, body: Value) -> Value {
    api.handle(method, path, body, vec![]).unwrap().body
}

fn token(api: &LocalApi) -> Value {
    api.retired_projects().unwrap()["entries"][0]["revision"].clone()
}

#[test]
fn retirement_recovery_preserves_identity_files_draft_and_config_without_git_or_activation() {
    let (_root, api, project) = setup();
    let id = project["id"].as_str().unwrap();
    let created = request(
        &api,
        "POST",
        &format!("/api/projects/{id}/documents"),
        json!({"name":"Doc.md","parentId":null,"markdown":"# Guardado\n"}),
    );
    let document = created["node"]["id"].as_str().unwrap();
    let loaded = request(
        &api,
        "GET",
        &format!("/api/documents/{document}"),
        Value::Null,
    );
    request(
        &api,
        "PUT",
        &format!("/api/documents/{document}/draft"),
        json!({"markdown":"# Pendiente\n","baseFingerprint":loaded["baseFingerprint"],"baseContentHash":loaded["savedContentHash"]}),
    );
    request(
        &api,
        "PUT",
        "/api/config",
        json!({"tabsByProject":{id:{"openTabs":[created["node"]],"activeDocumentId":document}},"treeOpenPathsByProject":{id:["Docs"]}}),
    );
    let config_bytes = fs::read(api.config_path()).unwrap();
    let draft_path = draft_store::path(&api.app_data_dir.join("drafts"), document);
    let draft_bytes = fs::read(&draft_path).unwrap();
    let path = Path::new(project["folderPath"].as_str().unwrap()).join("Doc.md");
    let disk = fs::read(&path).unwrap();

    assert!(request(
        &api,
        "POST",
        &format!("/api/projects/{id}/retire"),
        json!({})
    )
    .as_array()
    .unwrap()
    .is_empty());
    assert_eq!(fs::read(&path).unwrap(), disk);
    assert_eq!(fs::read(&draft_path).unwrap(), draft_bytes);
    assert_eq!(fs::read(api.config_path()).unwrap(), config_bytes);
    assert_eq!(
        api.retired_projects().unwrap()["entries"][0]["registered"],
        false
    );
    let restored = request(
        &api,
        "POST",
        &format!("/api/retired-projects/{id}/restore"),
        json!({"revision":token(&api),"name":"Reincorporado"}),
    );
    assert_eq!(restored["project"]["id"], id);
    assert_eq!(restored["project"]["active"], false);
    assert_eq!(restored["project"]["syncMode"], "none");
    assert!(!Path::new(project["folderPath"].as_str().unwrap())
        .join(".git")
        .exists());
    assert_eq!(fs::read(&draft_path).unwrap(), draft_bytes);
    assert_eq!(fs::read(api.config_path()).unwrap(), config_bytes);
    let reopened = request(
        &api,
        "GET",
        &format!("/api/documents/{document}"),
        Value::Null,
    );
    assert_eq!(reopened["markdown"], "# Pendiente\n");
    assert_eq!(reopened["diskMarkdown"], "# Guardado\n");
    assert_eq!(fs::read(path).unwrap(), disk);
}

#[test]
fn failed_registry_commit_keeps_original_and_retained_record_then_restart_can_retry() {
    let (_root, api, project) = setup();
    let id = project["id"].as_str().unwrap();
    let original_registry = fs::read(api.registry_path()).unwrap();
    assert!(api
        .retire_project_using(id, |_| Err("QA denied registry write".into()))
        .is_err());
    assert_eq!(fs::read(api.registry_path()).unwrap(), original_registry);
    assert_eq!(
        api.retired_projects().unwrap()["entries"][0]["registered"],
        true
    );
    let restarted = LocalApi::new(api.app_data_dir.clone(), "test".into(), "test".into());
    assert!(restarted.retire_project(id).unwrap().is_empty());
    assert!(restarted.retire_project(id).unwrap().is_empty());
    assert_eq!(
        restarted.retired_projects().unwrap()["entries"]
            .as_array()
            .unwrap()
            .len(),
        1
    );
}

#[test]
fn lost_restore_ack_and_later_edits_never_duplicate_or_overwrite_current_project() {
    let (_root, api, project) = setup();
    let id = project["id"].as_str().unwrap();
    api.retire_project(id).unwrap();
    let payload = json!({"revision":token(&api)});
    assert!(api
        .restore_project_using(id, payload.clone(), |registry| {
            api.write_registry(registry)?;
            Err("QA lost ACK".into())
        })
        .is_err());
    let path = Path::new(project["folderPath"].as_str().unwrap()).join("After.md");
    fs::write(&path, b"New work after restore").unwrap();
    let mut registry = api.registry_checked().unwrap();
    registry["projects"][0]["name"] = json!("Edited after restore");
    api.write_registry(&registry).unwrap();
    let before_retry = fs::read(api.registry_path()).unwrap();
    let restarted = LocalApi::new(api.app_data_dir.clone(), "test".into(), "test".into());
    let result = restarted.restore_retired_project(id, payload).unwrap();
    assert_eq!(result["alreadyRegistered"], true);
    assert_eq!(result["project"]["name"], "Edited after restore");
    assert_eq!(fs::read(api.registry_path()).unwrap(), before_retry);
    assert_eq!(fs::read(path).unwrap(), b"New work after restore");
}

#[test]
fn corrupt_future_oversized_and_non_file_catalogs_never_remove_a_registered_project() {
    let (_root, api, project) = setup();
    let id = project["id"].as_str().unwrap();
    let registry = fs::read(api.registry_path()).unwrap();
    let path = api.app_data_dir.join(FILE_NAME);
    for bytes in [
        b"{broken".to_vec(),
        br#"{"schemaVersion":2,"entries":[]}"#.to_vec(),
        br#"{"schemaVersion":1,"entries":[],"future":true}"#.to_vec(),
        vec![b' '; MAX_BYTES as usize + 1],
    ] {
        fs::write(&path, &bytes).unwrap();
        assert!(api.retire_project(id).is_err());
        assert_eq!(fs::read(&path).unwrap(), bytes);
        assert_eq!(fs::read(api.registry_path()).unwrap(), registry);
    }
    fs::remove_file(&path).unwrap();
    fs::create_dir(&path).unwrap();
    assert!(api.retire_project(id).is_err());
    assert_eq!(fs::read(api.registry_path()).unwrap(), registry);
}

#[test]
fn unknown_project_metadata_is_not_copied_and_capacity_does_not_destroy_the_association() {
    let (_root, api, project) = setup();
    let id = project["id"].as_str().unwrap();
    let mut registry = api.registry_checked().unwrap();
    registry["projects"][0]["unexpectedCredential"] = json!("synthetic-never-copy");
    api.write_registry(&registry).unwrap();
    assert!(api.retire_project(id).is_err());
    assert!(!api.app_data_dir.join(FILE_NAME).exists());
    registry["projects"][0]
        .as_object_mut()
        .unwrap()
        .remove("unexpectedCredential");
    api.write_registry(&registry).unwrap();
    let mut catalog = Catalog {
        schema_version: 1,
        entries: Vec::new(),
    };
    for index in 0..MAX_ENTRIES {
        let mut stored = project.clone();
        stored["id"] = json!(format!("project-QA-{index}"));
        catalog.entries.push(Record {
            id: stored["id"].as_str().unwrap().into(),
            retired_at: timestamp(),
            original_root: None,
            project: stored,
        });
    }
    write(&api.app_data_dir, &catalog).unwrap();
    let before = fs::read(api.app_data_dir.join(FILE_NAME)).unwrap();
    assert!(api.retire_project(id).is_err());
    assert_eq!(fs::read(api.app_data_dir.join(FILE_NAME)).unwrap(), before);
    assert_eq!(api.registry_checked().unwrap(), registry);
}

#[test]
fn missing_folder_collisions_and_stale_revision_require_review_without_creating_or_merging() {
    let (root, api, project) = setup();
    let id = project["id"].as_str().unwrap();
    let original = Path::new(project["folderPath"].as_str().unwrap());
    api.retire_project(id).unwrap();
    let revision = token(&api);
    let moved = root.path().join("moved");
    api.project_owners.lock().unwrap().clear();
    fs::rename(original, &moved).unwrap();
    assert!(api
        .restore_retired_project(id, json!({"revision":revision}))
        .is_err());
    assert!(!original.exists());
    fs::rename(&moved, original).unwrap();
    let other = api.create_project(json!({"name":"ORIGINAL","folderPath":root.path().join("other"),"versioningMode":"none"})).unwrap();
    assert!(api
        .restore_retired_project(id, json!({"revision":revision}))
        .is_err());
    assert_eq!(api.list_projects().len(), 1);
    let restored = api
        .restore_retired_project(id, json!({"revision":revision,"name":"Different name"}))
        .unwrap();
    assert_eq!(restored["project"]["id"], id);
    assert_eq!(
        api.registry_checked().unwrap()["activeProjectId"],
        other["id"]
    );
    api.retire_project(id).unwrap();
    assert!(api
        .restore_retired_project(id, json!({"revision":revision}))
        .is_err());
    let new_token = token(&api);
    let mut registry = api.registry_checked().unwrap();
    registry["projects"][0]["folderPath"] = json!(original);
    api.write_registry(&registry).unwrap();
    assert!(api
        .restore_retired_project(
            id,
            json!({"revision":new_token,"name":"No duplicate folder"})
        )
        .is_err());
    assert_eq!(api.list_projects().len(), 1);
}

#[test]
fn preflight_does_not_own_mutations_and_cannot_commit_over_another_registry_change() {
    let (root, api, project) = setup();
    let id = project["id"].as_str().unwrap().to_string();
    api.retire_project(&id).unwrap();
    let payload = json!({"revision":token(&api)});
    let mutations = std::sync::Arc::new(Mutex::new(api.clone()));
    let worker_mutations = mutations.clone();
    let source = api.clone();
    let (prepared_tx, prepared_rx) = std::sync::mpsc::channel();
    let (resume_tx, resume_rx) = std::sync::mpsc::channel();
    let worker = std::thread::spawn(move || {
        dispatch_with(&worker_mutations, &source, |api| {
            let prepared = PreparedWork::Restore(api.prepare_restoration(&id, payload)?);
            prepared_tx.send(()).unwrap();
            resume_rx.recv().unwrap();
            Ok(prepared)
        })
    });
    prepared_rx
        .recv_timeout(std::time::Duration::from_secs(5))
        .unwrap();
    let guard = mutations
        .try_lock()
        .expect("Source checks must not own mutation authority");
    let other=guard.create_project(json!({"name":"Unrelated","folderPath":root.path().join("other"),"versioningMode":"none"})).unwrap();
    drop(guard);
    resume_tx.send(()).unwrap();
    assert!(worker.join().unwrap().unwrap_err().contains("han cambiado"));
    assert_eq!(api.list_projects().len(), 1);
    assert_eq!(api.list_projects()[0]["id"], other["id"]);
    assert_eq!(
        api.retired_projects().unwrap()["entries"][0]["registered"],
        false
    );
    assert!(is_project_lifecycle_work(
        "POST",
        "/api/retired-projects/p/restore"
    ));
    assert!(is_project_lifecycle_work("DELETE", "/api/projects/p"));
    assert!(!is_project_lifecycle_work("GET", "/api/retired-projects"));
}

#[test]
fn name_collisions_follow_unicode_normalization_and_case_before_restoring_identity() {
    let (root, api, project) = setup();
    let id = project["id"].as_str().unwrap();
    api.update_project(id, json!({"name":"Área"})).unwrap();
    api.retire_project(id).unwrap();
    api.create_project(json!({"name":"A\u{301}REA","folderPath":root.path().join("other"),"versioningMode":"none"})).unwrap();
    assert!(api
        .restore_retired_project(id, json!({"revision":token(&api)}))
        .unwrap_err()
        .contains("nombre"));
    assert_eq!(
        api.restore_retired_project(id, json!({"revision":token(&api),"name":"Área revisada"}))
            .unwrap()["project"]["id"],
        id
    );
}
