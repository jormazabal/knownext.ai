use knownext_storage::LocalApi;
use serde_json::{json, Value};
use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
    process::{Command, Stdio},
};

fn git(root: &Path, args: &[&str], input: Option<&[u8]>) -> String {
    let hooks = root.join(".git/owned-empty-hooks");
    fs::create_dir_all(&hooks).unwrap();
    let mut child = Command::new("git")
        .arg("-C")
        .arg(root)
        .args([
            "-c",
            "user.name=Owned QA",
            "-c",
            "user.email=qa@example.invalid",
            "-c",
        ])
        .arg(format!("core.hooksPath={}", hooks.display()))
        .args(args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    if let Some(bytes) = input {
        child.stdin.take().unwrap().write_all(bytes).unwrap();
    } else {
        drop(child.stdin.take());
    }
    let output = child.wait_with_output().unwrap();
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    String::from_utf8(output.stdout).unwrap().trim().into()
}
fn request(api: &LocalApi, method: &str, path: &str, body: Value) -> Value {
    let response = api.handle(method, path, body, vec![]).unwrap();
    assert!(response.status < 400, "{}", response.body);
    response.body
}
struct Fixture {
    _owned: tempfile::TempDir,
    api: LocalApi,
    root: PathBuf,
    project: String,
    base: String,
    local: String,
    remote_ref: String,
}
fn fixture() -> Fixture {
    let owned = tempfile::tempdir().unwrap();
    let api = LocalApi::new(owned.path().join("state"), "qa".into(), "test".into());
    let project = request(
        &api,
        "POST",
        "/api/projects",
        json!({"name":"Owned graph join","versioningMode":"local-git","syncMode":"none"}),
    );
    let root = PathBuf::from(project["folderPath"].as_str().unwrap());
    let project = project["id"].as_str().unwrap().to_string();
    fs::write(root.join("Review.md"), b"# Base\n").unwrap();
    git(&root, &["add", "--", "Review.md"], None);
    git(&root, &["commit", "-m", "Owned base"], None);
    let base = git(&root, &["rev-parse", "HEAD"], None);
    fs::write(root.join("Review.md"), b"# Same result\n").unwrap();
    git(&root, &["add", "--", "Review.md"], None);
    git(&root, &["commit", "-m", "Owned local"], None);
    let local = git(&root, &["rev-parse", "HEAD"], None);
    let tree = git(&root, &["rev-parse", "HEAD^{tree}"], None);
    let remote = git(
        &root,
        &[
            "commit-tree",
            &tree,
            "-p",
            &base,
            "-m",
            "Owned remote same tree",
        ],
        None,
    );
    let remote_ref = format!(
        "refs/remotes/origin/{}",
        git(&root, &["branch", "--show-current"], None)
    );
    git(&root, &["update-ref", &remote_ref, &remote], None);
    git(
        &root,
        &[
            "remote",
            "add",
            "origin",
            owned.path().join("nonexistent-remote").to_str().unwrap(),
        ],
        None,
    );
    Fixture {
        _owned: owned,
        api,
        root,
        project,
        base,
        local,
        remote_ref,
    }
}
fn route(f: &Fixture) -> String {
    format!("/api/projects/{}/sync/history-copies", f.project)
}
fn id(n: u8) -> String {
    format!("attempt-{n:032x}")
}
fn resource(f: &Fixture) -> Vec<u8> {
    let bytes = b"%PDF-owned-synthetic\0binary\xff\noriginal resource".to_vec();
    let blob = git(&f.root, &["hash-object", "-w", "--stdin"], Some(&bytes));
    let tree = git(
        &f.root,
        &["mktree"],
        Some(format!("100644 blob {blob}\tRemote.pdf\n").as_bytes()),
    );
    let remote = git(
        &f.root,
        &[
            "commit-tree",
            &tree,
            "-p",
            &f.base,
            "-m",
            "Owned binary remote",
        ],
        None,
    );
    git(&f.root, &["update-ref", &f.remote_ref, &remote], None);
    bytes
}
fn source_review(f: &Fixture) -> Value {
    let review = request(
        &f.api,
        "GET",
        &format!("/api/projects/{}/sync/remote-review", f.project),
        Value::Null,
    );
    request(
        &f.api,
        "POST",
        &format!("{}/review", route(f)),
        json!({"revision":review["revision"],"side":"remote","path":"Remote.pdf"}),
    )
}
fn body(review: &Value, id: &str, name: &str) -> Value {
    json!({"source":review["source"],"sourceRevision":review["sourceRevision"],"attemptId":id,"name":name})
}

#[test]
fn budget_historical_copy_preserves_sources_and_identity_capacity_before_a_payload_is_published() {
    let f = fixture();
    let bytes = resource(&f);
    let source = source_review(&f);
    let state = f._owned.path().join("state");
    let folder = state.join("recordings");
    fs::create_dir_all(&folder).unwrap();
    let pad = folder.join("owned-capacity.bin");
    fs::File::create(&pad)
        .unwrap()
        .set_len(16 * 1024 * 1024)
        .unwrap();
    let review = request(&f.api, "GET", "/api/recovery/storage", Value::Null);
    let limited = request(
        &f.api,
        "PUT",
        "/api/recovery/storage/policy",
        json!({"revision":review["policy"]["revision"],"enabled":true,"maxBytes":16*1024*1024}),
    );
    let attempt = id(90);
    let refused = f.api.handle(
        "POST",
        &route(&f),
        body(&source, &attempt, "Copia.pdf"),
        vec![],
    );
    assert!(refused.is_err());
    assert!(!f.root.join("Copia.pdf").exists());
    assert!(!f
        .root
        .join(".knownext-history-copies")
        .join(format!("{attempt}.data"))
        .exists());
    assert!(!f
        .root
        .join(".knownext-history-copies")
        .join(format!("{attempt}.json"))
        .exists());
    request(
        &f.api,
        "PUT",
        "/api/recovery/storage/policy",
        json!({"revision":limited["policy"]["revision"],"enabled":true,"maxBytes":32*1024*1024}),
    );
    let done = request(
        &f.api,
        "POST",
        &route(&f),
        body(&source, &attempt, "Copia.pdf"),
    );
    assert_eq!(done["status"], "confirmed");
    assert_eq!(fs::read(f.root.join("Copia.pdf")).unwrap(), bytes);
    assert_eq!(fs::metadata(pad).unwrap().len(), 16 * 1024 * 1024);
}
#[test]
fn a_historical_binary_is_created_once_without_replacing_local_files_index_drafts_or_history() {
    let f = fixture();
    let bytes = resource(&f);
    let document = format!("{}::Review.md", f.project);
    request(
        &f.api,
        "PUT",
        &format!("/api/documents/{document}/draft"),
        json!({"markdown":"Private ongoing work"}),
    );
    let draft = request(
        &f.api,
        "GET",
        &format!("/api/documents/{document}"),
        Value::Null,
    );
    let index = fs::read(f.root.join(".git/index")).unwrap();
    let original = fs::read(f.root.join("Review.md")).unwrap();
    assert!(LocalApi::is_independent_snapshot(
        "POST",
        &format!("{}/review", route(&f))
    ));
    let review = source_review(&f);
    assert_eq!(review["canCopy"], true);
    assert_eq!(review["previewText"], Value::Null);
    assert_eq!(review["sizeBytes"], bytes.len());
    assert!(!f.root.join("Remote.pdf").exists());
    let attempt = id(81);
    let payload = body(&review, &attempt, "Recurso recuperado.pdf");
    let result = request(&f.api, "POST", &route(&f), payload.clone());
    assert_eq!(result["status"], "confirmed");
    assert_eq!(result["name"], "Recurso recuperado.pdf");
    assert_eq!(
        fs::read(f.root.join("Recurso recuperado.pdf")).unwrap(),
        bytes
    );
    assert_eq!(fs::read(f.root.join("Review.md")).unwrap(), original);
    assert_eq!(fs::read(f.root.join(".git/index")).unwrap(), index);
    assert!(!git(&f.root, &["status", "--porcelain"], None).contains(".knownext-history-copies"));
    for relative in [
        ".knownext-history-copies/never.md",
        ".KNOWNEXT-HISTORY-COPIES /never.md",
        ".knownext-history-copies.prepare-owned/never.md",
    ] {
        let encoded = format!("{}::{relative}", f.project)
            .replace(':', "%3A")
            .replace('/', "%2F")
            .replace(' ', "%20");
        let failure = f
            .api
            .handle(
                "GET",
                &format!("/api/documents/{encoded}"),
                Value::Null,
                vec![],
            )
            .unwrap_err();
        assert!(failure.contains("reservada"), "{failure}");
    }
    assert_eq!(git(&f.root, &["rev-parse", "HEAD"], None), f.local);
    assert_eq!(
        request(
            &f.api,
            "GET",
            &format!("/api/documents/{document}"),
            Value::Null
        )["draftWriteRevision"],
        draft["draftWriteRevision"]
    );
    let file = f
        .root
        .join(".knownext-history-copies")
        .join(format!("{attempt}.json"));
    let before = fs::read(&file).unwrap();
    let reopened = LocalApi::new(f._owned.path().join("state"), "qa".into(), "test".into());
    assert_eq!(
        request(
            &reopened,
            "GET",
            &format!("{}/{}", route(&f), attempt),
            Value::Null
        )["status"],
        "confirmed"
    );
    assert_eq!(fs::read(&file).unwrap(), before);
    assert!(f.api.handle("POST", &route(&f), payload, vec![]).is_err());
    assert_eq!(fs::read(file).unwrap(), before);
    assert_eq!(
        request(
            &f.api,
            "GET",
            &format!("/api/projects/{}/sync/remote-review", f.project),
            Value::Null
        )["historyCopies"]["items"]
            .as_array()
            .unwrap()
            .len(),
        1
    );
}
#[test]
fn receipt_checks_distinguish_a_cut_an_unrelated_equal_file_and_a_later_copy_and_preserve_future_data(
) {
    let f = fixture();
    let bytes = resource(&f);
    let review = source_review(&f);
    let a = id(82);
    let payload = body(&review, &a, "Recuperado.pdf");
    request(&f.api, "POST", &route(&f), payload.clone());
    let directory = f.root.join(".knownext-history-copies");
    let file = directory.join(format!("{a}.json"));
    let raw = fs::read(&file).unwrap();
    // The private anchor remains alive: an independently created file with equal
    // bytes has another native identity and cannot confirm this publication.
    fs::remove_file(f.root.join("Recuperado.pdf")).unwrap();
    assert_eq!(
        request(&f.api, "GET", &format!("{}/{}", route(&f), a), Value::Null)["status"],
        "pending"
    );
    assert!(!f.root.join("Recuperado.pdf").exists());
    assert_eq!(fs::read(&file).unwrap(), raw);
    fs::write(f.root.join("Recuperado.pdf"), &bytes).unwrap();
    assert_eq!(
        request(&f.api, "GET", &format!("{}/{}", route(&f), a), Value::Null)["status"],
        "changed"
    );
    assert!(f
        .api
        .handle(
            "POST",
            &route(&f),
            body(&review, &id(83), "Recuperado.pdf"),
            vec![]
        )
        .is_err());
    assert_eq!(fs::read(f.root.join("Recuperado.pdf")).unwrap(), bytes);
    fs::remove_file(f.root.join("Recuperado.pdf")).unwrap();
    let b = id(84);
    assert_eq!(
        request(
            &f.api,
            "POST",
            &route(&f),
            body(&review, &b, "Recuperado.pdf")
        )["status"],
        "confirmed"
    );
    assert_eq!(
        request(&f.api, "GET", &format!("{}/{}", route(&f), a), Value::Null)["status"],
        "changed"
    );
    assert_eq!(fs::read(&file).unwrap(), raw);
    let mut future: Value = serde_json::from_slice(&raw).unwrap();
    future["format"] = json!(2);
    let future_bytes = serde_json::to_vec(&future).unwrap();
    fs::write(&file, &future_bytes).unwrap();
    assert!(f
        .api
        .handle("GET", &format!("{}/{}", route(&f), a), Value::Null, vec![])
        .is_err());
    assert!(f.api.handle("POST", &route(&f), payload, vec![]).is_err());
    assert_eq!(fs::read(&file).unwrap(), future_bytes);
    let blocked = source_review(&f);
    assert_eq!(blocked["canCopy"], false);
    assert_eq!(fs::read(&file).unwrap(), future_bytes);
}

#[test]
fn recovering_a_deleted_entry_uses_the_reviewed_common_base_and_keeps_the_current_variant() {
    let f = fixture();
    resource(&f);
    let graph = request(
        &f.api,
        "GET",
        &format!("/api/projects/{}/sync/remote-review", f.project),
        Value::Null,
    );
    let source = request(
        &f.api,
        "POST",
        &format!("{}/review", route(&f)),
        json!({"revision":graph["revision"],"side":"remote","path":"Review.md"}),
    );
    assert_eq!(source["beforeDeletion"], true);
    assert_eq!(source["sourceCommit"], f.base);
    assert_eq!(source["previewText"], "# Base\n");
    let recovered = request(
        &f.api,
        "POST",
        &route(&f),
        body(&source, &id(85), "Versión anterior.md"),
    );
    assert_eq!(recovered["status"], "confirmed");
    assert_eq!(
        fs::read(f.root.join("Versión anterior.md")).unwrap(),
        b"# Base\n"
    );
    assert_eq!(
        fs::read(f.root.join("Review.md")).unwrap(),
        b"# Same result\n"
    );
    assert_eq!(git(&f.root, &["rev-parse", "HEAD"], None), f.local);
}
