use knownext_storage::LocalApi;
use serde_json::{json, Value};
use std::{
    fs,
    path::{Path, PathBuf},
};
struct Replica {
    api: LocalApi,
    id: String,
    root: PathBuf,
}
fn replica(base: &Path, name: &str) -> Replica {
    let root = base.join(format!("{name}-documents"));
    let api = LocalApi::new(
        base.join(format!("{name}-state")),
        "qa".into(),
        "test".into(),
    );
    let project = api
        .handle(
            "POST",
            "/api/projects",
            json!({"name":name,"folderPath":root,"versioningMode":"none","syncMode":"none"}),
            vec![],
        )
        .unwrap()
        .body;
    Replica {
        api,
        id: project["id"].as_str().unwrap().into(),
        root,
    }
}
fn call(r: &Replica, method: &str, tail: &str, body: Value) -> Value {
    r.api
        .handle(
            method,
            &format!("/api/projects/{}/proton-sync{}", r.id, tail),
            body,
            vec![],
        )
        .unwrap()
        .body
}
fn connect(r: &Replica, folder: &Path) {
    let review = call(r, "POST", "/review", json!({"folderPath":folder}));
    let receipt = call(
        r,
        "POST",
        "/connect",
        json!({"id":review["id"],"revision":review["revision"]}),
    );
    assert_eq!(receipt["status"], "connected-local");
}
fn publish(r: &Replica) -> String {
    let receipt = call(r, "POST", "/publish", json!({}));
    assert_eq!(receipt["status"], "handed-off");
    assert_eq!(receipt["remoteConfirmed"], false);
    receipt["publicationId"].as_str().unwrap().into()
}

#[test]
#[ignore = "Historical folder-exchange contract: public writes retired by corrected direct-SDK scope"]
fn proton_binding_is_visible_and_prevents_a_second_sync_authority() {
    let temp = tempfile::tempdir().unwrap();
    let r = replica(temp.path(), "authority");
    let folder = temp.path().join("exchange");
    fs::create_dir(&folder).unwrap();
    connect(&r, &folder);
    let before = r.api.handle("GET", "/api/projects", json!(null), vec![]).unwrap().body;
    let status = r.api.handle("GET", &format!("/api/projects/{}/cloud-sync", r.id), json!(null), vec![]).unwrap().body;
    assert_eq!(status["provider"], "proton-drive");
    let review = r.api.handle("POST", &format!("/api/projects/{}/cloud-sync/review", r.id), json!({"provider":"none"}), vec![]).unwrap().body;
    assert_eq!(review["canApply"], false);
    for (method, suffix, payload) in [
        ("PUT", "/sync-mode", json!({"syncMode":"manual-github"})),
        ("POST", "/github/connect", json!({"owner":"synthetic-owner","repo":"synthetic-repo"})),
    ] {
        let result = r.api.handle(method, &format!("/api/projects/{}{suffix}", r.id), payload, vec![]);
        assert!(result.is_err() || result.unwrap().status >= 400);
    }
    assert_eq!(r.api.handle("GET", "/api/projects", json!(null), vec![]).unwrap().body, before);
    assert_eq!(call(&r, "GET", "", json!(null))["connected"], true);
}
fn review(r: &Replica, publication: &str) -> Value {
    call(
        r,
        "POST",
        "/receive/review",
        json!({"publicationId":publication}),
    )
}
fn receive(r: &Replica, publication: &str) -> Value {
    let review = review(r, publication);
    assert_eq!(review["canApply"], true, "{review}");
    call(
        r,
        "POST",
        "/receive/apply",
        json!({"id":review["id"],"revision":review["revision"]}),
    )
}
#[test]
#[ignore = "Historical folder-exchange contract: public writes retired by corrected direct-SDK scope"]
fn proton_sync_two_local_replicas_add_update_preserve_previous_and_block_old_publication() {
    let temp = tempfile::tempdir().unwrap();
    let folder = temp.path().join("exchange");
    fs::create_dir(&folder).unwrap();
    let a = replica(temp.path(), "a");
    let b = replica(temp.path(), "b");
    fs::write(a.root.join("Note.md"), b"# Original").unwrap();
    fs::create_dir(a.root.join("Empty")).unwrap();
    connect(&a, &folder);
    let first = publish(&a);
    connect(&b, &folder);
    receive(&b, &first);
    assert_eq!(fs::read(b.root.join("Note.md")).unwrap(), b"# Original");
    assert!(b.root.join("Empty").is_dir());
    fs::write(a.root.join("Note.md"), b"# Updated from A").unwrap();
    let second = publish(&a);
    let incoming = review(&b, &second);
    assert_eq!(incoming["updates"], json!(["Note.md"]));
    receive(&b, &second);
    assert_eq!(
        fs::read(b.root.join("Note.md")).unwrap(),
        b"# Updated from A"
    );
    let copy = temp
        .path()
        .join("b-state")
        .join("proton-sync")
        .join(knownext_sync_folder::sha256(b.id.as_bytes()))
        .join("recovery")
        .join(&second)
        .join("Note.md");
    assert_eq!(fs::read(copy).unwrap(), b"# Original");
    assert!(b
        .api
        .handle(
            "POST",
            &format!("/api/projects/{}/proton-sync/receive/review", b.id),
            json!({"publicationId":first}),
            vec![]
        )
        .is_err());
    assert_eq!(
        fs::read(b.root.join("Note.md")).unwrap(),
        b"# Updated from A"
    );
}
#[test]
#[ignore = "Historical folder-exchange contract: public writes retired by corrected direct-SDK scope"]
fn proton_sync_concurrent_published_edits_do_not_advance_the_common_base() {
    let temp = tempfile::tempdir().unwrap();
    let folder = temp.path().join("exchange");
    fs::create_dir(&folder).unwrap();
    let a = replica(temp.path(), "a");
    let b = replica(temp.path(), "b");
    fs::write(a.root.join("Note.md"), b"base").unwrap();
    connect(&a, &folder);
    let first = publish(&a);
    connect(&b, &folder);
    receive(&b, &first);
    fs::write(a.root.join("Note.md"), b"local a").unwrap();
    let pa = publish(&a);
    fs::write(b.root.join("Note.md"), b"local b").unwrap();
    let pb = publish(&b);
    assert_eq!(review(&a, &pb)["canApply"], false);
    assert_eq!(review(&b, &pa)["canApply"], false);
    assert_eq!(fs::read(a.root.join("Note.md")).unwrap(), b"local a");
    assert_eq!(fs::read(b.root.join("Note.md")).unwrap(), b"local b");
}
#[test]
#[ignore = "Historical folder-exchange contract: public writes retired by corrected direct-SDK scope"]
fn proton_sync_third_replica_cannot_overwrite_an_unseen_received_branch() {
    let temp = tempfile::tempdir().unwrap();
    let folder = temp.path().join("exchange");
    fs::create_dir(&folder).unwrap();
    let a = replica(temp.path(), "a");
    let b = replica(temp.path(), "b");
    let c = replica(temp.path(), "c");
    fs::write(a.root.join("Note.md"), b"base").unwrap();
    connect(&a, &folder);
    let first = publish(&a);
    connect(&b, &folder);
    receive(&b, &first);
    connect(&c, &folder);
    receive(&c, &first);
    fs::write(b.root.join("Note.md"), b"branch b").unwrap();
    let pb = publish(&b);
    receive(&a, &pb);
    fs::write(c.root.join("Note.md"), b"branch c").unwrap();
    let pc = publish(&c);
    let attempt = review(&a, &pc);
    assert_eq!(attempt["canApply"], false);
    assert_eq!(attempt["conflicts"], json!(["Note.md"]));
    assert_eq!(fs::read(a.root.join("Note.md")).unwrap(), b"branch b");
}
#[test]
#[ignore = "Historical folder-exchange contract: public writes retired by corrected direct-SDK scope"]
fn proton_sync_stale_receive_and_overlap_do_not_replace_documents() {
    let temp = tempfile::tempdir().unwrap();
    let folder = temp.path().join("exchange");
    fs::create_dir(&folder).unwrap();
    let a = replica(temp.path(), "a");
    let b = replica(temp.path(), "b");
    fs::write(a.root.join("Note.md"), b"base").unwrap();
    connect(&a, &folder);
    let first = publish(&a);
    connect(&b, &folder);
    let checked = review(&b, &first);
    fs::write(b.root.join("Note.md"), b"new local").unwrap();
    assert!(b
        .api
        .handle(
            "POST",
            &format!("/api/projects/{}/proton-sync/receive/apply", b.id),
            json!({"id":checked["id"],"revision":checked["revision"]}),
            vec![]
        )
        .is_err());
    assert_eq!(fs::read(b.root.join("Note.md")).unwrap(), b"new local");
    let nested = a.root.join("nested-exchange");
    fs::create_dir(&nested).unwrap();
    assert!(a
        .api
        .handle(
            "POST",
            &format!("/api/projects/{}/proton-sync/review", a.id),
            json!({"folderPath":nested}),
            vec![]
        )
        .is_err());
}
#[test]
#[ignore = "Historical folder-exchange contract: public writes retired by corrected direct-SDK scope"]
fn proton_sync_receive_protects_persisted_drafts_and_unknown_future_state() {
    let temp = tempfile::tempdir().unwrap();
    let folder = temp.path().join("exchange");
    fs::create_dir(&folder).unwrap();
    let a = replica(temp.path(), "a");
    let b = replica(temp.path(), "b");
    fs::write(a.root.join("Note.md"), b"base").unwrap();
    connect(&a, &folder);
    let first = publish(&a);
    connect(&b, &folder);
    receive(&b, &first);
    fs::write(a.root.join("Note.md"), b"remote update").unwrap();
    let second = publish(&a);
    let drafts = temp.path().join("b-state/drafts");
    fs::create_dir_all(&drafts).unwrap();
    let document_id = format!("{}::Note.md", b.id);
    let draft = drafts.join(format!(
        "v2_{}.json",
        knownext_sync_folder::sha256(document_id.as_bytes())
    ));
    fs::write(
        &draft,
        serde_json::to_vec(
            &json!({"schemaVersion":1,"documentId":document_id,"markdown":"unsaved user work"}),
        )
        .unwrap(),
    )
    .unwrap();
    let incoming = review(&b, &second);
    assert_eq!(incoming["canApply"], false);
    assert_eq!(incoming["conflicts"], json!(["Note.md"]));
    assert_eq!(fs::read(b.root.join("Note.md")).unwrap(), b"base");
    assert!(fs::read_to_string(draft)
        .unwrap()
        .contains("unsaved user work"));
    let status_path = temp
        .path()
        .join("b-state/proton-sync")
        .join(knownext_sync_folder::sha256(b.id.as_bytes()))
        .join("state.json");
    let bytes = br#"{"schemaVersion":999,"future":"preserve"}"#;
    fs::write(&status_path, bytes).unwrap();
    assert!(b
        .api
        .handle(
            "GET",
            &format!("/api/projects/{}/proton-sync", b.id),
            Value::Null,
            vec![]
        )
        .is_err());
    assert_eq!(fs::read(status_path).unwrap(), bytes);
}
#[test]
#[ignore = "Historical folder-exchange contract: public writes retired by corrected direct-SDK scope"]
fn proton_sync_offline_replica_can_receive_a_proven_descendant_without_applying_each_intermediate()
{
    let temp = tempfile::tempdir().unwrap();
    let folder = temp.path().join("exchange");
    fs::create_dir(&folder).unwrap();
    let a = replica(temp.path(), "a");
    let b = replica(temp.path(), "b");
    fs::write(a.root.join("Note.md"), b"one").unwrap();
    connect(&a, &folder);
    let first = publish(&a);
    connect(&b, &folder);
    receive(&b, &first);
    fs::write(a.root.join("Note.md"), b"two").unwrap();
    let second = publish(&a);
    fs::write(a.root.join("Note.md"), b"three").unwrap();
    let third = publish(&a);
    assert_eq!(review(&b, &third)["canApply"], true);
    receive(&b, &third);
    assert_eq!(fs::read(b.root.join("Note.md")).unwrap(), b"three");
    assert!(b
        .api
        .handle(
            "POST",
            &format!("/api/projects/{}/proton-sync/receive/review", b.id),
            json!({"publicationId":second}),
            vec![]
        )
        .is_err());
    assert_eq!(fs::read(b.root.join("Note.md")).unwrap(), b"three");
}
