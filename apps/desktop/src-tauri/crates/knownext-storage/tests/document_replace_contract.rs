use knownext_storage::LocalApi;
use serde_json::{json, Value};
use std::{fs, path::PathBuf};
fn call(a: &LocalApi, m: &str, p: &str, b: Value) -> Value {
    let r = a.handle(m, p, b, vec![]).unwrap();
    assert_eq!(r.status, 200, "{}", r.body);
    r.body
}
fn fixture() -> (tempfile::TempDir, LocalApi, String, PathBuf) {
    let d = tempfile::tempdir().unwrap();
    let a = LocalApi::new(d.path().join("state"), "qa".into(), "test".into());
    let p = call(
        &a,
        "POST",
        "/api/projects",
        json!({"name":"Replace QA","versioningMode":"none","syncMode":"none"}),
    );
    let id = p["id"].as_str().unwrap().to_owned();
    let root = PathBuf::from(p["folderPath"].as_str().unwrap());
    fs::write(
        root.join("a.md"),
        "---\ntitle: reunión\n---\n# Café\n\nCafé y café.\n",
    )
    .unwrap();
    fs::write(root.join("b.md"), "# Café\n\nManual conservado\n").unwrap();
    (d, a, id, root)
}
fn base(p: &str) -> String {
    format!("/api/projects/{p}/document-replacements")
}
fn selection(p: &str) -> Value {
    json!({"documentIds":[format!("{p}::a.md"),format!("{p}::b.md")],"query":"Café","replacement":"Taller"})
}
#[test]
fn block5_reviewed_exact_unicode_replacement_and_one_undo_preserve_files_metadata_and_private_drafts(
) {
    let (_d, a, p, root) = fixture();
    let original = fs::read(root.join("a.md")).unwrap();
    let s = selection(&p);
    let review = call(&a, "POST", &(base(&p) + "/review"), s.clone());
    assert_eq!(review["documents"][0]["matches"], 2);
    assert!(review["documents"][0]["after"]
        .as_str()
        .unwrap()
        .contains("title: reunión"));
    let v = call(
        &a,
        "POST",
        &base(&p),
        json!({"selection":s,"revision":review["revision"],"attemptId":"replace-owned","acknowledge":true}),
    );
    assert_eq!(v["phase"], "completed");
    assert_eq!(fs::read(root.join("a.md")).unwrap(), original);
    let got = call(&a, "GET", &format!("/api/documents/{p}::a.md"), Value::Null);
    assert!(got["markdown"].as_str().unwrap().contains("Taller y café"));
    let undo = call(
        &a,
        "POST",
        &(base(&p) + "/replace-owned/undo"),
        json!({"revision":v["revision"],"attemptId":"replace-undo-owned","acknowledge":true}),
    );
    assert_eq!(undo["phase"], "completed");
    assert_eq!(
        call(&a, "GET", &format!("/api/documents/{p}::a.md"), Value::Null)["markdown"],
        String::from_utf8(original.clone()).unwrap()
    );
    assert!(a
        .handle(
            "POST",
            &(base(&p) + "/replace-owned/undo"),
            json!({"revision":v["revision"],"attemptId":"replace-second-undo","acknowledge":true}),
            vec![]
        )
        .is_err());
    assert_eq!(fs::read(root.join("a.md")).unwrap(), original);
}
#[test]
fn block5_stale_disk_or_scope_blocks_before_an_effect_and_unknown_receipts_are_preserved() {
    let (d, a, p, root) = fixture();
    let s = selection(&p);
    let review = call(&a, "POST", &(base(&p) + "/review"), s.clone());
    fs::write(root.join("b.md"), "External manual edit").unwrap();
    assert!(a.handle("POST",&base(&p),json!({"selection":s,"revision":review["revision"],"attemptId":"replace-stale","acknowledge":true}),vec![]).is_err());
    assert_eq!(
        call(&a, "GET", &format!("/api/documents/{p}::a.md"), Value::Null)["hasDraft"],
        false
    );
    assert_eq!(
        fs::read_to_string(root.join("b.md")).unwrap(),
        "External manual edit"
    );
    let wrong = json!({"documentIds":["other::a.md"],"query":"Café","replacement":"Wrong"});
    assert!(a
        .handle("POST", &(base(&p) + "/review"), wrong, vec![])
        .is_err());
    let _ = d;
}
#[test]
fn block5_later_manual_content_prevents_group_undo_and_ack_is_queried_without_replay() {
    let (_d, a, p, root) = fixture();
    let s = selection(&p);
    let review = call(&a, "POST", &(base(&p) + "/review"), s.clone());
    let v = call(
        &a,
        "POST",
        &base(&p),
        json!({"selection":s,"revision":review["revision"],"attemptId":"replace-later","acknowledge":true}),
    );
    let query = call(&a, "GET", &(base(&p) + "/replace-later"), Value::Null);
    assert_eq!(query["phase"], "completed");
    fs::write(root.join("a.md"), "Later disk edit").unwrap();
    assert!(a
        .handle(
            "POST",
            &(base(&p) + "/replace-later/undo"),
            json!({"revision":v["revision"],"attemptId":"replace-undo-later","acknowledge":true}),
            vec![]
        )
        .is_err());
    assert_eq!(
        fs::read_to_string(root.join("a.md")).unwrap(),
        "Later disk edit"
    );
    assert_eq!(
        call(&a, "GET", &(base(&p) + "/replace-later"), Value::Null)["undoId"],
        Value::Null
    );
}

#[test]
fn block5_duplicate_completed_receipt_is_preserved_without_creating_an_undo() {
    use sha2::{Digest, Sha256};
    let (d, a, p, root) = fixture();
    let s = selection(&p);
    let v = call(&a, "POST", &(base(&p) + "/review"), s.clone());
    let result = call(
        &a,
        "POST",
        &base(&p),
        json!({"selection":s,"revision":v["revision"],"attemptId":"replace-duplicate","acknowledge":true}),
    );
    let file = d
        .path()
        .join("state/document-replacements")
        .join(format!("{:x}", Sha256::digest(p.as_bytes())))
        .join("replace-duplicate.json");
    let mut raw: Value = serde_json::from_slice(&fs::read(&file).unwrap()).unwrap();
    let row = raw["rows"][0].clone();
    raw["rows"].as_array_mut().unwrap().push(row);
    let bytes = serde_json::to_vec(&raw).unwrap();
    fs::write(&file, &bytes).unwrap();
    assert!(a.handle("POST",&(base(&p)+"/replace-duplicate/undo"),json!({"revision":result["revision"],"attemptId":"replace-bad-undo","acknowledge":true}),vec![]).is_err());
    assert_eq!(fs::read(&file).unwrap(), bytes);
    assert!(fs::read_to_string(root.join("a.md"))
        .unwrap()
        .contains("Café"));
}
#[test]
fn block5_editing_receipts_travel_only_as_private_data() {
    use sha2::{Digest, Sha256};
    use std::io::Read;
    use std::sync::Mutex;
    let (d, a, p, _root) = fixture();
    let s = selection(&p);
    let v = call(&a, "POST", &(base(&p) + "/review"), s.clone());
    call(
        &a,
        "POST",
        &base(&p),
        json!({"selection":s,"revision":v["revision"],"attemptId":"replace-portable","acknowledge":true}),
    );
    let job = call(
        &a,
        "POST",
        "/api/project-transfers",
        json!({"kind":"export","projectId":p,"includeArchive":true}),
    );
    let id = job["id"].as_str().unwrap();
    let ready = knownext_storage::dispatch_project_transfer(
        &Mutex::new(a.clone()),
        &a,
        &Mutex::new(()),
        &format!("/api/project-transfers/{id}/prepare"),
        Value::Null,
    )
    .unwrap()
    .body;
    assert_eq!(ready["phase"], "ready", "{ready}");
    let file = d
        .path()
        .join("state/project-transfers")
        .join(format!("{:x}", Sha256::digest(id.as_bytes())))
        .join("payload.zip");
    let mut zip = zip::ZipArchive::new(fs::File::open(file).unwrap()).unwrap();
    let mut raw = String::new();
    zip.by_name("Archivo KnowNext/Edicion/LEEME.json")
        .unwrap()
        .read_to_string(&mut raw)
        .unwrap();
    let copy: Value = serde_json::from_str(&raw).unwrap();
    assert_eq!(copy["dataOnly"], true);
    assert_eq!(copy["runtimeAdoption"], false);
    assert_eq!(copy["files"].as_array().unwrap().len(), 1);
    let mut payload = String::new();
    zip.by_name("Archivo KnowNext/Edicion/0000.bin")
        .unwrap()
        .read_to_string(&mut payload)
        .unwrap();
    assert!(payload.contains("replace-portable"));
    assert!(payload.contains("before"));
}
