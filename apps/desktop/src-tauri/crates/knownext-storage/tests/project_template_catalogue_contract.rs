use knownext_storage::{dispatch_project_transfer, LocalApi};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
};
fn req(a: &LocalApi, m: &str, p: &str, b: Value) -> Value {
    let r = a.handle(m, p, b, vec![]).unwrap();
    assert_eq!(r.status, 200, "{}", r.body);
    r.body
}
fn work(a: &LocalApi, id: &str, action: &str, b: Value) -> Result<Value, String> {
    dispatch_project_transfer(
        &Mutex::new(a.clone()),
        a,
        &Mutex::new(()),
        &format!("/api/project-transfers/{id}/{action}"),
        b,
    )
    .map(|r| r.body)
}
fn begin(a: &LocalApi, b: Value) -> String {
    req(a, "POST", "/api/project-transfers", b)["id"]
        .as_str()
        .unwrap()
        .into()
}
fn payload(state: &Path) -> PathBuf {
    fs::read_dir(state.join("project-transfers"))
        .unwrap()
        .next()
        .unwrap()
        .unwrap()
        .path()
        .join("payload.zip")
}
fn fixture() -> (tempfile::TempDir, LocalApi, Vec<Value>, String, Value) {
    let d = tempfile::tempdir().unwrap();
    let a = LocalApi::new(d.path().join("state"), "qa".into(), "test".into());
    let p = req(
        &a,
        "POST",
        "/api/projects",
        json!({"name":"Source","versioningMode":"none","syncMode":"none"}),
    );
    let root = PathBuf::from(p["folderPath"].as_str().unwrap());
    let mut templates = vec![];
    for index in 0..2 {
        fs::write(
            root.join("README.md"),
            format!("# Documentación {index}\n\n[Recurso](guia.txt)\n"),
        )
        .unwrap();
        fs::write(root.join("guia.txt"), format!("Recurso completo{index}")).unwrap();
        fs::write(root.join(".env"), "PRIVATE_MUST_NOT_TRAVEL=yes").unwrap();
        let id = begin(&a, json!({"kind":"export","projectId":p["id"]}));
        let ready = work(&a, &id, "prepare", Value::Null).unwrap();
        let template=work(&a,&id,"save-template",json!({"archiveSha256":ready["archiveSha256"],"name":format!("Kit {index}"),"description":format!("Descripción {index}")})).unwrap();
        templates.push(template);
        work(&a, &id, "discard", Value::Null).unwrap();
    }
    let selected = templates
        .iter()
        .map(|t| json!({"id":t["id"],"revision":t["revision"]}))
        .collect::<Vec<_>>();
    let group = begin(
        &a,
        json!({"kind":"export","templateCatalogue":true,"templateSelection":selected}),
    );
    let ready = work(&a, &group, "prepare", Value::Null).unwrap();
    assert_eq!(ready["phase"], "ready", "{ready}");
    (d, a, templates, group, ready)
}
fn receiver(root: &Path, source: &Path) -> (LocalApi, String, Value) {
    let a = LocalApi::new(root.to_path_buf(), "qa".into(), "test".into());
    let id = begin(&a, json!({"kind":"import","templateCatalogue":true}));
    a.reserve_project_transfer_source(&id).unwrap();
    a.copy_project_transfer_source(&id, source).unwrap();
    let ready = work(&a, &id, "prepare", Value::Null).unwrap();
    (a, id, ready)
}
fn inspect(a: &LocalApi, id: &str, ready: &Value, entries: Value) -> Value {
    work(
        a,
        id,
        "catalogue-review",
        json!({"archiveSha256":ready["archiveSha256"],"entries":entries}),
    )
    .unwrap()
}
fn commit(
    a: &LocalApi,
    id: &str,
    ready: &Value,
    v: &Value,
    entries: Value,
    attempt: &str,
) -> Result<Value, String> {
    work(
        a,
        id,
        "catalogue-commit",
        json!({"archiveSha256":ready["archiveSha256"],"entries":entries,"revision":v["revision"],"attemptId":attempt,"acknowledge":true}),
    )
}
#[test]
fn block7_project_catalogue_roundtrip_selection_keeps_sources_and_does_not_create_projects() {
    let (d, a, templates, group, ready) = fixture();
    let source = payload(&d.path().join("state"));
    let raw = fs::read(&source).unwrap();
    let (b, id, received) = receiver(&d.path().join("receiver"), &source);
    assert_eq!(
        received["catalogue"]["entries"].as_array().unwrap().len(),
        2
    );
    assert!(received["manifest"]["supplement"].is_null());
    let entries = json!([{"index":1,"name":"Kit elegido"}]);
    let v = inspect(&b, &id, &received, entries.clone());
    assert_eq!(v["canApply"], true);
    let done = commit(
        &b,
        &id,
        &received,
        &v,
        entries.clone(),
        "project-template-catalogue-owned",
    )
    .unwrap();
    assert_eq!(done["catalogueOutcome"]["phase"], "completed");
    let inventory = req(&b, "GET", "/api/project-templates", Value::Null);
    assert_eq!(inventory["templates"].as_array().unwrap().len(), 1);
    assert_eq!(inventory["templates"][0]["name"], "Kit elegido");
    assert_ne!(inventory["templates"][0]["id"], templates[1]["id"]);
    assert_eq!(
        inventory["templates"][0]["sourceArchiveSha256"],
        templates[1]["archiveSha256"]
    );
    assert_eq!(req(&b, "GET", "/api/projects", Value::Null), json!([]));
    assert!(commit(
        &b,
        &id,
        &received,
        &v,
        entries,
        "project-template-catalogue-again"
    )
    .is_err());
    assert!(work(
        &b,
        &id,
        "commit",
        json!({"archiveSha256":received["archiveSha256"],"name":"Must not create"})
    )
    .is_err());
    assert_eq!(fs::read(&source).unwrap(), raw);
    assert_eq!(
        req(&a, "GET", "/api/project-templates", Value::Null)["templates"]
            .as_array()
            .unwrap()
            .len(),
        2
    );
    work(&b, &id, "discard", Value::Null).unwrap();
    let ack = req(
        &b,
        "GET",
        "/api/project-templates/catalogue-attempts/project-template-catalogue-owned",
        Value::Null,
    );
    assert_eq!(ack["phase"], "completed");
    assert_eq!(ack["canReplay"], false);
    let (_other, _, _) = (&a, &group, &ready);
}
#[test]
fn block7_project_catalogue_collisions_retired_names_and_existing_content_require_review() {
    let (d, a, _t, group, ready) = fixture();
    let source = payload(&d.path().join("state"));
    let stored = d.path().join("group.knownext-project.zip");
    fs::copy(&source, &stored).unwrap();
    work(&a, &group, "discard", Value::Null).unwrap();
    let id = begin(&a, json!({"kind":"import","templateCatalogue":true}));
    a.reserve_project_transfer_source(&id).unwrap();
    a.copy_project_transfer_source(&id, &stored).unwrap();
    let incoming = work(&a, &id, "prepare", Value::Null).unwrap();
    let existing = inspect(&a, &id, &incoming, json!([{"index":0,"name":"Kit 0"}]));
    assert_eq!(existing["entries"][0]["status"], "existing");
    let conflict = inspect(&a, &id, &incoming, json!([{"index":0,"name":"Kit 1"}]));
    assert_eq!(conflict["canApply"], false);
    assert_eq!(conflict["entries"][0]["status"], "conflict");
    assert!(commit(
        &a,
        &id,
        &incoming,
        &conflict,
        json!([{"index":0,"name":"Kit 1"}]),
        "project-template-catalogue-conflict"
    )
    .is_err());
    let inventory = req(&a, "GET", "/api/project-templates", Value::Null);
    let current = &inventory["templates"][0];
    req(
        &a,
        "POST",
        &format!(
            "/api/project-templates/{}/retirement",
            current["id"].as_str().unwrap()
        ),
        json!({"revision":current["revision"],"retired":true}),
    );
    let retired = inspect(&a, &id, &incoming, json!([{"index":0,"name":"Kit 0"}]));
    assert_eq!(retired["entries"][0]["status"], "conflict");
    let renamed = inspect(
        &a,
        &id,
        &incoming,
        json!([{"index":0,"name":"Copia elegida"}]),
    );
    assert_eq!(renamed["canApply"], true);
    assert!(commit(
        &a,
        &id,
        &incoming,
        &existing,
        json!([{"index":0,"name":"Kit 0"}]),
        "project-template-catalogue-stale"
    )
    .is_err());
    let _ = ready;
}
fn future(source: &Path, target: &Path) {
    use std::io::{Read, Write};
    let mut zip = zip::ZipArchive::new(fs::File::open(source).unwrap()).unwrap();
    let mut files = vec![];
    for i in 0..zip.len() {
        let mut e = zip.by_index(i).unwrap();
        let name = e.name().to_owned();
        let dir = e.is_dir();
        let mut bytes = vec![];
        e.read_to_end(&mut bytes).unwrap();
        files.push((name, dir, bytes));
    }
    let index = files
        .iter_mut()
        .find(|(n, _, _)| n == "knownext-project-template-catalogue.json")
        .unwrap();
    let mut c: Value = serde_json::from_slice(&index.2).unwrap();
    c["schemaVersion"] = json!(99);
    index.2 = serde_json::to_vec(&c).unwrap();
    let hash = format!("{:x}", Sha256::digest(&index.2));
    let size = index.2.len();
    let manifest = files
        .iter_mut()
        .find(|(n, _, _)| n == "knownext-project.json")
        .unwrap();
    let mut m: Value = serde_json::from_slice(&manifest.2).unwrap();
    let file = m["files"]
        .as_array_mut()
        .unwrap()
        .iter_mut()
        .find(|e| e["path"] == "knownext-project-template-catalogue.json")
        .unwrap();
    file["sha256"] = json!(hash);
    file["size"] = json!(size);
    manifest.2 = serde_json::to_vec(&m).unwrap();
    let mut out = zip::ZipWriter::new(fs::File::create(target).unwrap());
    let options =
        zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored);
    for (name, dir, bytes) in files {
        if dir {
            out.add_directory(name, options).unwrap();
        } else {
            out.start_file(name, options).unwrap();
            out.write_all(&bytes).unwrap();
        }
    }
    out.finish().unwrap();
}
#[test]
fn block7_project_catalogue_future_index_and_legacy_project_path_are_rejected_without_adoption() {
    let (d, _a, _t, _g, _r) = fixture();
    let source = payload(&d.path().join("state"));
    let changed = d.path().join("future.knownext-project.zip");
    future(&source, &changed);
    let before = fs::read(&changed).unwrap();
    let (b, _id, ready) = receiver(&d.path().join("future-state"), &changed);
    assert_eq!(ready["phase"], "failed");
    assert_eq!(fs::read(&changed).unwrap(), before);
    assert_eq!(
        req(&b, "GET", "/api/project-templates", Value::Null)["templates"],
        json!([])
    );
    let c = LocalApi::new(d.path().join("legacy-state"), "qa".into(), "test".into());
    let id = begin(&c, json!({"kind":"import"}));
    c.reserve_project_transfer_source(&id).unwrap();
    c.copy_project_transfer_source(&id, &source).unwrap();
    assert_eq!(
        work(&c, &id, "prepare", Value::Null).unwrap()["phase"],
        "failed"
    );
    assert_eq!(req(&c, "GET", "/api/projects", Value::Null), json!([]));
}
#[test]
fn block7_project_catalogue_storage_admission_blocks_before_catalogue_publication() {
    let (d, _a, _t, _g, _r) = fixture();
    let source = payload(&d.path().join("state"));
    let state = d.path().join("budget-state");
    let (b, id, ready) = receiver(&state, &source);
    let entries = json!([{"index":0,"name":"Nuevo"}]);
    let reviewed = inspect(&b, &id, &ready, entries.clone());
    let dir = state.join("recordings");
    fs::create_dir_all(&dir).unwrap();
    fs::File::create(dir.join("owned-pad.bin"))
        .unwrap()
        .set_len(16 * 1024 * 1024)
        .unwrap();
    let budget = req(&b, "GET", "/api/recovery/storage", Value::Null);
    req(
        &b,
        "PUT",
        "/api/recovery/storage/policy",
        json!({"revision":budget["policy"]["revision"],"enabled":true,"maxBytes":16*1024*1024}),
    );
    assert!(commit(
        &b,
        &id,
        &ready,
        &reviewed,
        entries,
        "project-template-catalogue-budget"
    )
    .is_err());
    assert_eq!(
        req(&b, "GET", "/api/project-templates", Value::Null)["templates"],
        json!([])
    );
    assert!(!state.join("project-template-catalogues").exists());
}
#[test]
fn block7_project_catalogue_unconfirmed_receipt_is_observation_only_and_future_metadata_is_preserved(
) {
    let (d, _a, _t, _g, _r) = fixture();
    let source = payload(&d.path().join("state"));
    let state = d.path().join("receipt-state");
    let (b, id, ready) = receiver(&state, &source);
    let entries = json!([{"index":0,"name":"Conservado"}]);
    let v = inspect(&b, &id, &ready, entries.clone());
    commit(
        &b,
        &id,
        &ready,
        &v,
        entries,
        "project-template-catalogue-receipt",
    )
    .unwrap();
    let path = state.join("project-template-catalogues/project-template-catalogue-receipt.json");
    let mut r: Value = serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
    r["phase"] = json!("uncertain");
    r["entries"][0]["status"] = json!("unconfirmed");
    fs::write(&path, serde_json::to_vec(&r).unwrap()).unwrap();
    let before = fs::read(&path).unwrap();
    let got = req(
        &b,
        "GET",
        "/api/project-templates/catalogue-attempts/project-template-catalogue-receipt",
        Value::Null,
    );
    assert_eq!(got["phase"], "uncertain");
    assert_eq!(fs::read(&path).unwrap(), before);
    r["schemaVersion"] = json!(99);
    let raw = serde_json::to_vec(&r).unwrap();
    fs::write(&path, &raw).unwrap();
    assert!(b
        .handle(
            "GET",
            "/api/project-templates/catalogue-attempts/project-template-catalogue-receipt",
            Value::Null,
            vec![]
        )
        .is_err());
    assert_eq!(fs::read(&path).unwrap(), raw);
    assert_eq!(
        req(
            &b,
            "GET",
            "/api/project-templates/catalogue-attempts",
            Value::Null
        )["unavailable"],
        1
    );
    let original_job = payload(&state).parent().unwrap().to_path_buf();
    assert!(work(&b, &id, "discard", Value::Null).is_err());
    assert!(original_job.is_dir());
    fs::write(&path, &before).unwrap();
    let job_path = original_job.join("job.json");
    let mut interrupted: Value = serde_json::from_slice(&fs::read(&job_path).unwrap()).unwrap();
    interrupted["phase"] = json!("committing");
    fs::write(&job_path, serde_json::to_vec(&interrupted).unwrap()).unwrap();
    assert_eq!(
        work(&b, &id, "discard", Value::Null).unwrap()["discarded"],
        true
    );
    assert!(!original_job.exists());
    assert_eq!(
        req(
            &b,
            "GET",
            "/api/project-templates/catalogue-attempts/project-template-catalogue-receipt",
            Value::Null
        )["phase"],
        "uncertain"
    );
    assert_eq!(
        req(&b, "GET", "/api/project-templates", Value::Null)["templates"]
            .as_array()
            .unwrap()
            .len(),
        1
    );
}
