use knownext_recording::model::{Chunk, Destination, Session, Settings, Status};
use knownext_storage::LocalApi;
use serde_json::{json, Value};
use std::{fs, path::PathBuf};
fn call(a: &LocalApi, m: &str, p: &str, b: Value) -> Value {
    let r = a.handle(m, p, b, vec![]).unwrap();
    assert_eq!(r.status, 200, "{}", r.body);
    r.body
}
fn fixture() -> (tempfile::TempDir, LocalApi, String, PathBuf, Session) {
    let temp = tempfile::tempdir().unwrap();
    let state = temp.path().join("state");
    let a = LocalApi::new(state.clone(), "qa".into(), "test".into());
    let p = call(
        &a,
        "POST",
        "/api/projects",
        json!({"name":"Minutes QA","versioningMode":"none","syncMode":"none"}),
    );
    let id = p["id"].as_str().unwrap().to_owned();
    let root = PathBuf::from(p["folderPath"].as_str().unwrap());
    let mut s = Session::new(
        Settings::default(),
        Some(Destination {
            project_id: id.clone(),
            folder_id: None,
            name: "Reunión del producto".into(),
        }),
    );
    s.status = Status::Completed;
    s.samples = 72000;
    s.document_id = Some(format!("{id}::transcripcion.md"));
    s.chunks = vec![
        Chunk {
            usage_receipt: None,
            usage_recorded: false,
            sha256: None,
            start: 0,
            samples: 48000,
            status: "completed".into(),
            text: Some("Decisión literal, sin asignar responsable.".into()),
            languages: vec![],
        },
        Chunk {
            usage_receipt: None,
            usage_recorded: false,
            sha256: None,
            start: 48000,
            samples: 24000,
            status: "unknown".into(),
            text: None,
            languages: vec![],
        },
    ];
    let folder = state
        .join(if cfg!(debug_assertions) {
            "recordings-dev"
        } else {
            "recordings"
        })
        .join(&s.id);
    fs::create_dir_all(&folder).unwrap();
    fs::write(folder.join("session.json"), serde_json::to_vec(&s).unwrap()).unwrap();
    fs::write(
        root.join("transcripcion.md"),
        "Transcripción publicada original",
    )
    .unwrap();
    (temp, a, id, root, s)
}
fn base(p: &str) -> String {
    format!("/api/projects/{p}/meeting-minutes")
}
fn review(a: &LocalApi, p: &str, s: &Session) -> Value {
    call(
        a,
        "POST",
        &(base(p) + "/review"),
        json!({"sessionId":s.id,"draft":null}),
    )
}
#[test]
fn block6_minutes_review_human_sources_create_new_and_receipt_never_replays() {
    let (temp, a, p, root, s) = fixture();
    let source = temp
        .path()
        .join("state/recordings-dev")
        .join(&s.id)
        .join("session.json");
    let before = fs::read(&source).unwrap();
    let initial = review(&a, &p, &s);
    assert_eq!(initial["startsAi"], false);
    assert_eq!(initial["draft"]["actions"], json!([]));
    let mut draft = initial["draft"].clone();
    draft["summary"] = json!("Resumen corregido por el equipo");
    draft["actions"] = json!([{"text":"Revisar la propuesta","owner":null,"dueDate":null,"sourceIds":["fragment-1"]}]);
    let reviewed = call(
        &a,
        "POST",
        &(base(&p) + "/review"),
        json!({"sessionId":s.id,"draft":draft}),
    );
    assert!(reviewed["markdown"]
        .as_str()
        .unwrap()
        .contains("Responsable: Por confirmar"));
    let request = json!({"sessionId":s.id,"draft":reviewed["draft"],"revision":reviewed["revision"],"attemptId":"minutes-owned","acknowledge":true});
    let created = call(&a, "POST", &base(&p), request.clone());
    assert_eq!(created["confirmed"], true);
    let bytes = fs::read(root.join("Acta de reunión.md")).unwrap();
    let text = String::from_utf8(bytes.clone()).unwrap();
    assert!(text.contains("Decisión literal, sin asignar responsable."));
    assert!(
        text.contains("fuente es parcial")
            || text.contains("no representa una transcripción completa")
    );
    assert_eq!(fs::read(&source).unwrap(), before);
    assert_eq!(
        fs::read_to_string(root.join("transcripcion.md")).unwrap(),
        "Transcripción publicada original"
    );
    assert_eq!(
        call(&a, "GET", &(base(&p) + "/minutes-owned"), Value::Null)["confirmed"],
        true
    );
    assert!(a.handle("POST", &base(&p), request, vec![]).is_err());
    assert_eq!(fs::read(root.join("Acta de reunión.md")).unwrap(), bytes);
}
#[test]
fn block6_minutes_rejects_stale_foreign_or_invented_sources_before_publication() {
    let (temp, a, p, root, s) = fixture();
    let v = review(&a, &p, &s);
    let mut bad = v["draft"].clone();
    bad["decisions"] = json!([{"text":"Inventado","sourceIds":["missing"]}]);
    assert!(a
        .handle(
            "POST",
            &(base(&p) + "/review"),
            json!({"sessionId":s.id,"draft":bad}),
            vec![]
        )
        .is_err());
    let path = temp
        .path()
        .join("state/recordings-dev")
        .join(&s.id)
        .join("session.json");
    let mut changed = serde_json::to_value(&s).unwrap();
    changed["revision"] = json!(2);
    fs::write(&path, serde_json::to_vec(&changed).unwrap()).unwrap();
    assert!(a.handle("POST",&base(&p),json!({"sessionId":s.id,"draft":v["draft"],"revision":v["revision"],"attemptId":"minutes-stale","acknowledge":true}),vec![]).is_err());
    assert!(!root.join("Acta de reunión.md").exists());
    changed["destination"]["projectId"] = json!("foreign");
    fs::write(&path, serde_json::to_vec(&changed).unwrap()).unwrap();
    assert!(a
        .handle(
            "POST",
            &(base(&p) + "/review"),
            json!({"sessionId":s.id}),
            vec![]
        )
        .is_err());
}
#[test]
fn block6_minutes_occupied_target_and_future_record_preserve_originals() {
    let (temp, a, p, root, s) = fixture();
    let v = review(&a, &p, &s);
    fs::write(root.join("Acta de reunión.md"), "Trabajo manual").unwrap();
    let request = json!({"sessionId":s.id,"draft":v["draft"],"revision":v["revision"],"attemptId":"minutes-collision","acknowledge":true});
    assert!(a.handle("POST", &base(&p), request, vec![]).is_err());
    assert_eq!(
        fs::read_to_string(root.join("Acta de reunión.md")).unwrap(),
        "Trabajo manual"
    );
    let folder = temp.path().join("state/meeting-minutes");
    let scope = std::fs::read_dir(&folder)
        .ok()
        .and_then(|mut it| it.next())
        .and_then(|e| e.ok());
    assert!(scope.is_none());
    let _ = temp;
}
#[test]
fn block6_minutes_receipt_catalog_keeps_unknown_and_does_not_infer_ack_from_existing_text() {
    let (temp, a, p, root, s) = fixture();
    let v = review(&a, &p, &s);
    call(
        &a,
        "POST",
        &base(&p),
        json!({"sessionId":s.id,"draft":v["draft"],"revision":v["revision"],"attemptId":"minutes-receipt","acknowledge":true}),
    );
    let folder = fs::read_dir(temp.path().join("state/meeting-minutes"))
        .unwrap()
        .next()
        .unwrap()
        .unwrap()
        .path();
    let receipt = folder.join("minutes-receipt.json");
    let mut r: Value = serde_json::from_slice(&fs::read(&receipt).unwrap()).unwrap();
    r["phase"] = json!("prepared");
    fs::write(&receipt, serde_json::to_vec(&r).unwrap()).unwrap();
    let before = fs::read(&receipt).unwrap();
    assert_eq!(
        call(&a, "GET", &(base(&p) + "/minutes-receipt"), Value::Null)["confirmed"],
        false
    );
    assert_eq!(fs::read(&receipt).unwrap(), before);
    r["schemaVersion"] = json!(99);
    let raw = serde_json::to_vec(&r).unwrap();
    fs::write(&receipt, &raw).unwrap();
    assert!(a
        .handle("GET", &(base(&p) + "/minutes-receipt"), Value::Null, vec![])
        .is_err());
    let catalog = call(&a, "GET", &base(&p), Value::Null);
    assert_eq!(catalog["unavailable"], 1);
    assert_eq!(fs::read(&receipt).unwrap(), raw);
    assert!(root.join("Acta de reunión.md").exists());
}
