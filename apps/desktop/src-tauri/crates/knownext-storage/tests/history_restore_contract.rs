use knownext_storage::LocalApi;
use serde_json::{json, Value};
use std::{fs, path::PathBuf, process::Command};
fn call(a: &LocalApi, m: &str, p: &str, b: Value) -> Value {
    let r = a.handle(m, p, b, vec![]).unwrap();
    assert!(r.status < 400, "{}", r.body);
    r.body
}
// Document identity is a single encoded URI segment, exactly as in the frontend SDK.
fn encoded(id: &str) -> String {
    let mut result = String::new();
    for b in id.bytes() {
        if b.is_ascii_alphanumeric() || b"-_.~".contains(&b) {
            result.push(b as char);
        } else {
            result.push_str(&format!("%{b:02X}"));
        }
    }
    result
}
fn git(root: &std::path::Path, args: &[&str]) -> String {
    let out = Command::new("git")
        .arg("-C")
        .arg(root)
        .args([
            "-c",
            "user.name=Owned QA",
            "-c",
            "user.email=qa@example.invalid",
            "-c",
            "core.hooksPath=/dev/null",
            "-c",
            "commit.gpgsign=false",
        ])
        .args(args)
        .output()
        .unwrap();
    assert!(
        out.status.success(),
        "{}",
        String::from_utf8_lossy(&out.stderr)
    );
    String::from_utf8(out.stdout).unwrap().trim().into()
}
struct Fixture {
    _temp: tempfile::TempDir,
    api: LocalApi,
    p: String,
    root: PathBuf,
    source: String,
    id: String,
}
fn fixture(path: &str, first: &[u8], current: &[u8]) -> Fixture {
    let d = tempfile::tempdir().unwrap();
    let a = LocalApi::new(d.path().join("state"), "qa".into(), "test".into());
    let p = call(
        &a,
        "POST",
        "/api/projects",
        json!({"name":"Owned historical restore","versioningMode":"local-git","syncMode":"none"}),
    );
    let root = PathBuf::from(p["folderPath"].as_str().unwrap());
    let p = p["id"].as_str().unwrap().to_owned();
    let target = root.join(path);
    fs::create_dir_all(target.parent().unwrap()).unwrap();
    fs::write(&target, first).unwrap();
    git(&root, &["add", "--", path]);
    git(&root, &["commit", "-m", "First owned bytes"]);
    let source = git(&root, &["rev-parse", "HEAD"]);
    fs::write(&target, current).unwrap();
    git(&root, &["add", "--", path]);
    git(&root, &["commit", "-m", "Current owned bytes"]);
    Fixture {
        _temp: d,
        api: a,
        p: p.clone(),
        root,
        source,
        id: format!("{p}::{path}"),
    }
}
fn route(f: &Fixture) -> String {
    format!("/api/projects/{}/history-restores", f.p)
}
fn review(f: &Fixture) -> Value {
    call(
        &f.api,
        "POST",
        &format!("{}/review", route(f)),
        json!({"documentId":f.id,"versionId":f.source}),
    )
}
fn request(f: &Fixture, v: &Value, n: u8) -> Value {
    json!({"documentId":f.id,"versionId":f.source,"revision":v["revision"],"attemptId":format!("history-restore-{n:032x}"),"acknowledge":true})
}
#[test]
fn block5_history_restore_binary_same_path_creates_child_and_keeps_index_sources_and_receipt() {
    let old = b"%PDF-owned\0historical\xff";
    let f = fixture("Docs/old.pdf", old, b"current bytes");
    fs::write(f.root.join("Unrelated.md"), b"keep staged text").unwrap();
    git(&f.root, &["add", "Unrelated.md"]);
    let index = fs::read(f.root.join(".git/index")).unwrap();
    let before_head = git(&f.root, &["rev-parse", "HEAD"]);
    let v = review(&f);
    assert_eq!(v["kind"], "pdf");
    let preview = call(
        &f.api,
        "POST",
        &format!("{}/preview", route(&f)),
        json!({"documentId":f.id,"versionId":f.source}),
    );
    assert!(preview["base64"].is_string());
    let q = request(&f, &v, 1);
    let result = call(&f.api, "POST", &route(&f), q.clone());
    assert_eq!(result["confirmed"], true);
    let new = result["newVersion"].as_str().unwrap();
    assert_ne!(new, f.source);
    assert_eq!(
        git(&f.root, &["rev-parse", &format!("{new}^")]),
        before_head
    );
    assert_eq!(fs::read(f.root.join("Docs/old.pdf")).unwrap(), old);
    assert_eq!(fs::read(f.root.join(".git/index")).unwrap(), index);
    assert_eq!(
        fs::read(f.root.join("Unrelated.md")).unwrap(),
        b"keep staged text"
    );
    assert!(f.api.handle("POST", &route(&f), q, vec![]).is_err());
    let receipt = call(
        &f.api,
        "GET",
        &format!("{}/history-restore-{:032x}", route(&f), 1),
        Value::Null,
    );
    assert_eq!(receipt["confirmed"], true);
    assert_eq!(receipt["canReplay"], false);
    let catalog = call(&f.api, "GET", &route(&f), Value::Null);
    assert_eq!(catalog["items"].as_array().unwrap().len(), 1);
    assert_eq!(
        catalog["items"][0]["attemptId"],
        format!("history-restore-{:032x}", 1)
    );
    assert_eq!(catalog["canReplay"], false);
}
#[test]
fn block5_history_restore_stale_disk_index_and_draft_never_replace_current_work() {
    for variant in ["disk", "index", "draft"] {
        let f = fixture("Review.md", b"# Old", b"# Current");
        let v = review(&f);
        let before_head = git(&f.root, &["rev-parse", "HEAD"]);
        match variant {
            "disk" => fs::write(f.root.join("Review.md"), "New manual edit").unwrap(),
            "index" => {
                fs::write(f.root.join("Other.md"), "Other staged").unwrap();
                git(&f.root, &["add", "Other.md"]);
            }
            _ => {
                let doc = call(
                    &f.api,
                    "GET",
                    &format!("/api/documents/{}", encoded(&f.id)),
                    Value::Null,
                );
                call(
                    &f.api,
                    "PUT",
                    &format!("/api/documents/{}/draft", encoded(&f.id)),
                    json!({"markdown":"Private manual draft","baseFingerprint":doc["baseFingerprint"],"expectedDraftWriteRevision":doc["draftWriteRevision"]}),
                );
            }
        }
        let bytes = fs::read(f.root.join("Review.md")).unwrap();
        let index = fs::read(f.root.join(".git/index")).unwrap();
        assert!(f
            .api
            .handle("POST", &route(&f), request(&f, &v, 2), vec![])
            .is_err());
        assert_eq!(fs::read(f.root.join("Review.md")).unwrap(), bytes);
        assert_eq!(fs::read(f.root.join(".git/index")).unwrap(), index);
        assert_eq!(git(&f.root, &["rev-parse", "HEAD"]), before_head);
    }
}
#[test]
fn block5_history_restore_markdown_keeps_private_draft_and_recreates_deleted_parent() {
    let f = fixture(
        "Docs/Review.md",
        b"# Original\n\nHistorical body",
        b"# Current",
    );
    let doc = call(
        &f.api,
        "GET",
        &format!("/api/documents/{}", encoded(&f.id)),
        Value::Null,
    );
    call(
        &f.api,
        "PUT",
        &format!("/api/documents/{}/draft", encoded(&f.id)),
        json!({"markdown":"# Manual draft remains","baseFingerprint":doc["baseFingerprint"],"expectedDraftWriteRevision":doc["draftWriteRevision"]}),
    );
    fs::remove_file(f.root.join("Docs/Review.md")).unwrap();
    fs::remove_dir(f.root.join("Docs")).unwrap();
    git(&f.root, &["add", "-u"]);
    git(&f.root, &["commit", "-m", "Delete owned file"]);
    let v = review(&f);
    assert_eq!(v["hasDraft"], true);
    let r = call(&f.api, "POST", &route(&f), request(&f, &v, 3));
    assert_eq!(r["confirmed"], true);
    assert_eq!(
        fs::read_to_string(f.root.join("Docs/Review.md")).unwrap(),
        "# Original\n\nHistorical body"
    );
    let doc = call(
        &f.api,
        "GET",
        &format!("/api/documents/{}", encoded(&f.id)),
        Value::Null,
    );
    assert_eq!(doc["markdown"], "# Manual draft remains");
}
#[test]
fn block5_history_restore_future_receipt_and_foreign_source_preserve_both_sides() {
    let f = fixture("Review.md", b"Old", b"Current");
    let v = review(&f);
    let q = request(&f, &v, 4);
    let mut foreign = q.clone();
    foreign["documentId"] = json!("foreign::Review.md");
    assert!(f.api.handle("POST", &route(&f), foreign, vec![]).is_err());
    let state = PathBuf::from(f._temp.path()).join("state/history-restores");
    use sha2::{Digest, Sha256};
    let group = format!("{:x}", Sha256::digest(f.p.as_bytes()));
    let dir = state
        .join(group)
        .join("history-restore-00000000000000000000000000000004");
    fs::create_dir_all(&dir).unwrap();
    let future = b"{\"schemaVersion\":99,\"doNotExecute\":true}";
    fs::write(dir.join("receipt.json"), future).unwrap();
    assert!(f.api.handle("POST", &route(&f), q, vec![]).is_err());
    assert!(f
        .api
        .handle(
            "GET",
            &format!("{}/history-restore-{:032x}", route(&f), 4),
            Value::Null,
            vec![]
        )
        .is_err());
    assert_eq!(fs::read(dir.join("receipt.json")).unwrap(), future);
    assert_eq!(fs::read(f.root.join("Review.md")).unwrap(), b"Current");
}
