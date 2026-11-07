use knownext_storage::{dispatch_project_transfer, LocalApi};
use serde_json::{json, Value};
use std::{fs, path::PathBuf, sync::Mutex};
fn request(api: &LocalApi, method: &str, path: &str, body: Value) -> Value {
    api.handle(method, path, body, vec![]).unwrap().body
}
fn work(api: &LocalApi, id: &str, action: &str, body: Value) -> Result<Value, String> {
    dispatch_project_transfer(
        &Mutex::new(api.clone()),
        api,
        &Mutex::new(()),
        &format!("/api/project-transfers/{id}/{action}"),
        body,
    )
    .map(|result| result.body)
}
fn begin(api: &LocalApi, body: Value) -> String {
    request(api, "POST", "/api/project-transfers", body)["id"]
        .as_str()
        .unwrap()
        .into()
}

#[test]
fn budget_project_template_refuses_new_payload_until_capacity_is_reviewed_and_raised() {
    let owned = tempfile::tempdir().unwrap();
    let state = owned.path().join("state");
    let api = LocalApi::new(state.clone(), "qa".into(), "test".into());
    let project = request(
        &api,
        "POST",
        "/api/projects",
        json!({"name":"Quota source","versioningMode":"none","syncMode":"none"}),
    );
    let root = PathBuf::from(project["folderPath"].as_str().unwrap());
    fs::write(root.join("Acta.md"), b"Documento conservado\n").unwrap();
    let transfer = begin(&api, json!({"kind":"export","projectId":project["id"]}));
    let ready = work(&api, &transfer, "prepare", Value::Null).unwrap();
    assert_eq!(ready["phase"], "ready");
    let recordings = state.join("recordings");
    fs::create_dir_all(&recordings).unwrap();
    let pad = recordings.join("owned-capacity.bin");
    fs::File::create(&pad)
        .unwrap()
        .set_len(16 * 1024 * 1024)
        .unwrap();
    let review = request(&api, "GET", "/api/recovery/storage", Value::Null);
    let limited = request(
        &api,
        "PUT",
        "/api/recovery/storage/policy",
        json!({"revision":review["policy"]["revision"],"enabled":true,"maxBytes":16*1024*1024}),
    );
    let save = json!({"archiveSha256":ready["archiveSha256"],"name":"Kit revisado"});
    assert!(work(&api, &transfer, "save-template", save.clone())
        .unwrap_err()
        .contains("presupuesto"));
    assert!(!state.join("project-templates").exists());
    request(
        &api,
        "PUT",
        "/api/recovery/storage/policy",
        json!({"revision":limited["policy"]["revision"],"enabled":true,"maxBytes":32*1024*1024}),
    );
    let template = work(&api, &transfer, "save-template", save).unwrap();
    assert_eq!(template["name"], "Kit revisado");
    assert_eq!(fs::metadata(pad).unwrap().len(), 16 * 1024 * 1024);
    assert_eq!(
        fs::read(root.join("Acta.md")).unwrap(),
        b"Documento conservado\n"
    );
}
#[test]
fn project_template_keeps_assets_creates_independent_projects_and_distributes_reviewed_metadata() {
    let owned = tempfile::tempdir().unwrap();
    let state = owned.path().join("state");
    let api = LocalApi::new(state.clone(), "qa".into(), "test".into());
    let project = request(
        &api,
        "POST",
        "/api/projects",
        json!({"name":"Owned source","versioningMode":"none","syncMode":"none"}),
    );
    let id = project["id"].as_str().unwrap();
    let root = PathBuf::from(project["folderPath"].as_str().unwrap());
    fs::create_dir(root.join("assets")).unwrap();
    fs::create_dir(root.join("Empty")).unwrap();
    image::RgbaImage::new(2, 2)
        .save(root.join("assets/logo.png"))
        .unwrap();
    let markdown = b"# {{proyecto}}\n\n![Marca](assets/logo.png)\n";
    fs::write(root.join("README.md"), markdown).unwrap();
    fs::write(root.join(".env"), b"OWNED_PRIVATE=excluded").unwrap();
    let logo = fs::read(root.join("assets/logo.png")).unwrap();
    let transfer = begin(&api, json!({"kind":"export","projectId":id}));
    let prepared = work(&api, &transfer, "prepare", Value::Null).unwrap();
    assert_eq!(prepared["phase"], "ready");
    let save = json!({"archiveSha256":prepared["archiveSha256"],"name":"Kit de proyecto","description":"Documentos y marca para el equipo"});
    let template = work(&api, &transfer, "save-template", save.clone()).unwrap();
    assert_eq!(
        work(&api, &transfer, "save-template", save).unwrap()["id"],
        template["id"]
    );
    assert!(work(&api,&transfer,"save-template",json!({"archiveSha256":prepared["archiveSha256"],"name":"Kit de proyecto","description":"Otra descripción"})).is_err());
    assert_eq!(
        request(&api, "GET", "/api/project-templates", Value::Null)["templates"]
            .as_array()
            .unwrap()
            .len(),
        1
    );
    work(&api, &transfer, "discard", Value::Null).unwrap();
    fs::write(root.join("README.md"), b"Changed original after capture").unwrap();
    let imported = begin(
        &api,
        json!({"kind":"import","templateId":template["id"],"templateRevision":template["revision"]}),
    );
    let review = work(&api, &imported, "prepare", Value::Null).unwrap();
    assert_eq!(review["phase"], "ready");
    assert_eq!(review["templateId"], template["id"]);
    assert_eq!(review["manifest"]["projectName"], "Kit de proyecto");
    assert_eq!(
        review["manifest"]["templateDescription"],
        "Documentos y marca para el equipo"
    );
    let completed = work(
        &api,
        &imported,
        "commit",
        json!({"archiveSha256":review["archiveSha256"],"name":"Nuevo desde kit"}),
    )
    .unwrap();
    assert_eq!(completed["phase"], "completed");
    let projects = request(&api, "GET", "/api/projects", Value::Null);
    let received = projects
        .as_array()
        .unwrap()
        .iter()
        .find(|p| p["id"] == completed["targetProjectId"])
        .unwrap();
    let destination = PathBuf::from(received["folderPath"].as_str().unwrap());
    assert_eq!(fs::read(destination.join("README.md")).unwrap(), markdown);
    assert_eq!(fs::read(destination.join("assets/logo.png")).unwrap(), logo);
    assert!(destination.join("Empty").is_dir());
    assert!(!destination.join(".env").exists());
    assert_eq!(
        fs::read(root.join("README.md")).unwrap(),
        b"Changed original after capture"
    );
    fs::write(destination.join("README.md"), b"Later own edit").unwrap();
    work(
        &api,
        &imported,
        "commit",
        json!({"archiveSha256":review["archiveSha256"],"name":"Nuevo desde kit"}),
    )
    .unwrap();
    assert_eq!(
        fs::read(destination.join("README.md")).unwrap(),
        b"Later own edit"
    );
    work(&api, &imported, "discard", Value::Null).unwrap();
    let share = begin(
        &api,
        json!({"kind":"export","templateId":template["id"],"templateRevision":template["revision"]}),
    );
    let shared = work(&api, &share, "prepare", Value::Null).unwrap();
    assert_eq!(shared["phase"], "ready");
    assert_eq!(shared["archiveSha256"], template["archiveSha256"]);
    assert_eq!(shared["projectId"], Value::Null);
    assert_eq!(shared["manifest"], review["manifest"]);
    let other = LocalApi::new(owned.path().join("other-state"), "qa".into(), "test".into());
    let receive = begin(&other, json!({"kind":"import"}));
    other.reserve_project_transfer_source(&receive).unwrap();
    let payload = fs::read_dir(state.join("project-transfers"))
        .unwrap()
        .next()
        .unwrap()
        .unwrap()
        .path()
        .join("payload.zip");
    other
        .copy_project_transfer_source(&receive, &payload)
        .unwrap();
    let received_review = work(&other, &receive, "prepare", Value::Null).unwrap();
    let received_template=work(&other,&receive,"save-template",json!({"archiveSha256":received_review["archiveSha256"],"name":received_review["manifest"]["projectName"],"description":received_review["manifest"]["templateDescription"]})).unwrap();
    assert_eq!(received_template["name"], "Kit de proyecto");
    assert_eq!(received_template["description"], template["description"]);
    assert_eq!(
        received_template["archiveSha256"],
        template["archiveSha256"]
    );
    let staged = api
        .begin_project_transfer_delivery(
            &share,
            shared["archiveSha256"].as_str().unwrap(),
            &owned.path().join("delivery-cache"),
            None,
        )
        .unwrap();
    assert!(staged.path.is_file());
    let cancelled = api
        .finish_project_transfer_delivery(&share, Ok(json!({"status":"cancelled"})))
        .unwrap();
    assert_eq!(cancelled["phase"], "ready");
    work(&api, &share, "discard", Value::Null).unwrap();
    let retire_path = format!(
        "/api/project-templates/{}/retirement",
        template["id"].as_str().unwrap()
    );
    let retired = request(
        &api,
        "POST",
        &retire_path,
        json!({"revision":template["revision"],"retired":true}),
    );
    assert!(api.handle("POST","/api/project-transfers",json!({"kind":"import","templateId":template["id"],"templateRevision":template["revision"]}),vec![]).is_err());
    let restored = request(
        &api,
        "POST",
        &retire_path,
        json!({"revision":retired["revision"],"retired":false}),
    );
    assert_eq!(restored["archiveSha256"], template["archiveSha256"]);
    let entry = fs::read_dir(state.join("project-templates"))
        .unwrap()
        .next()
        .unwrap()
        .unwrap()
        .path();
    let record = entry.join("record.json");
    let mut future: Value = serde_json::from_slice(&fs::read(&record).unwrap()).unwrap();
    future["schemaVersion"] = json!(99);
    let future = serde_json::to_vec(&future).unwrap();
    fs::write(&record, &future).unwrap();
    let inventory = request(&api, "GET", "/api/project-templates", Value::Null);
    assert_eq!(inventory["complete"], false);
    assert!(inventory["templates"].as_array().unwrap().is_empty());
    assert_eq!(fs::read(record).unwrap(), future);
}
