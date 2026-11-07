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
fn mixed_fixture() -> Fixture {
    let mut f = fixture();
    for (name, text) in [
        ("A.md", "Local A"),
        ("B.md", "Local B"),
        ("C.md", "Local C"),
    ] {
        fs::write(f.root.join(name), text).unwrap();
    }
    git(&f.root, &["add", "--", "A.md", "B.md", "C.md"], None);
    git(&f.root, &["commit", "-m", "Owned local variants"], None);
    f.local = git(&f.root, &["rev-parse", "HEAD"], None);
    for (name, text) in [
        ("A.md", "Remote A"),
        ("B.md", "Remote B"),
        ("C.md", "Remote C"),
    ] {
        let blob = git(
            &f.root,
            &["hash-object", "-w", "--stdin"],
            Some(text.as_bytes()),
        );
        git(
            &f.root,
            &[
                "update-index",
                "--cacheinfo",
                &format!("100644,{blob},{name}"),
            ],
            None,
        );
    }
    let tree = git(&f.root, &["write-tree"], None);
    let remote = git(
        &f.root,
        &[
            "commit-tree",
            &tree,
            "-p",
            &f.base,
            "-m",
            "Owned remote variants",
        ],
        None,
    );
    git(&f.root, &["update-ref", &f.remote_ref, &remote], None);
    git(&f.root, &["read-tree", &f.local], None);
    f
}
fn selected(f: &Fixture, id: &str) -> String {
    let route = format!("/api/projects/{}/sync/mixed-selections", f.project);
    let overview = request(
        &f.api,
        "GET",
        &format!("/api/projects/{}/sync/remote-review", f.project),
        Value::Null,
    );
    request(
        &f.api,
        "POST",
        &route,
        json!({"id":id,"revision":overview["revision"],"choices":[{"path":"A.md","choice":"remote"},{"path":"B.md","choice":"local"},{"path":"C.md","choice":"remote"}]}),
    );
    format!("{route}/{id}/application")
}

#[test]
fn lifecycle_retirement_requires_exact_backup_survives_cut_and_keeps_receipts_and_non_replay_identity() {
    use sha2::{Digest, Sha256};
    let f = mixed_fixture();
    let id = "mixed-77777777777777777777777777777777";
    let route = selected(&f, id);
    let preview = request(&f.api, "POST", &format!("{route}/review"), Value::Null);
    request(
        &f.api,
        "POST",
        &route,
        json!({"revision":preview["revision"],"acknowledge":true}),
    );
    let folder = f
        ._owned
        .path()
        .join("state/mixed-applications")
        .join(format!("{:x}", Sha256::digest(f.project.as_bytes())))
        .join(id);
    // A valid compact representation coexists with its exact original after a simulated cut.
    let mut writer = zip::ZipWriter::new(std::io::Cursor::new(Vec::new()));
    writer
        .start_file(
            "payload.bin",
            zip::write::SimpleFileOptions::default()
                .compression_method(zip::CompressionMethod::Deflated),
        )
        .unwrap();
    writer
        .write_all(&fs::read(folder.join("000-before.bin")).unwrap())
        .unwrap();
    fs::write(
        folder.join("000-before.bin.zip"),
        writer.finish().unwrap().into_inner(),
    )
    .unwrap();
    let record = fs::read(folder.join("record.json")).unwrap();
    let completion = fs::read(folder.join("completed.json")).unwrap();
    let index = fs::read(f.root.join(".git/index")).unwrap();
    let head = git(&f.root, &["rev-parse", "HEAD"], None);
    let working = fs::read(f.root.join("A.md")).unwrap();
    let backup = request(&f.api, "GET", &format!("{route}/backup"), Value::Null);
    let frozen = f
        .api
        .freeze_mixed_backup(&f.project, id, backup["reviewRevision"].as_str().unwrap())
        .unwrap();
    let external = f._owned.path().join("external.zip");
    f.api.write_system_recovery(&frozen, &external).unwrap();
    let archive = fs::read(&external).unwrap();
    let endpoint = format!("{route}/retirement");
    let initial = request(&f.api, "GET", &endpoint, Value::Null);
    assert_eq!(initial["totalCount"], 5);
    let revision = initial["revision"].as_str().unwrap();
    let wrong = f._owned.path().join("wrong.zip");
    fs::write(&wrong, b"wrong").unwrap();
    assert!(f
        .api
        .retire_mixed_payloads(&f.project, id, revision, true, &wrong)
        .is_err());
    assert!(f
        .api
        .retire_mixed_payloads(&f.project, id, revision, false, &external)
        .is_err());
    assert!(!folder.join("retirement.json").exists());
    fs::write(folder.join("retirement.json"), b"{\"format\":99}").unwrap();
    assert!(f.api.handle("GET", &endpoint, Value::Null, vec![]).is_err());
    assert_eq!(
        fs::read(folder.join("retirement.json")).unwrap(),
        b"{\"format\":99}"
    );
    fs::remove_file(folder.join("retirement.json")).unwrap();
    let blocked = folder.join("001-before.bin");
    let permissions = fs::metadata(&blocked).unwrap().permissions();
    let mut readonly = permissions.clone();
    readonly.set_readonly(true);
    fs::set_permissions(&blocked, readonly).unwrap();
    let interrupted = f
        .api
        .retire_mixed_payloads(&f.project, id, revision, true, &external);
    fs::set_permissions(&blocked, permissions).unwrap();
    assert!(interrupted.is_err());
    assert!(folder.join("retirement.json").exists());
    let journal = fs::read(folder.join("retirement.json")).unwrap();
    let partial = request(&f.api, "GET", &endpoint, Value::Null);
    assert_eq!(partial["phase"], "partial");
    assert_eq!(partial["remainingCount"], 1);
    assert_eq!(fs::read(folder.join("retirement.json")).unwrap(), journal);
    assert_eq!(
        request(&f.api, "GET", &route, Value::Null)["phase"],
        "retiring"
    );
    assert!(f
        .api
        .retire_mixed_payloads(&f.project, id, revision, true, &external)
        .is_err());
    // Another process/session only observes. No GET completes the removal.
    let reopened = LocalApi::new(f._owned.path().join("state"), "qa".into(), "test".into());
    assert_eq!(
        request(&reopened, "GET", &endpoint, Value::Null)["remainingCount"],
        1
    );
    assert!(blocked.exists());
    fs::write(folder.join("unexpected.bin"), b"keep").unwrap();
    assert!(f.api.handle("GET", &endpoint, Value::Null, vec![]).is_err());
    assert_eq!(fs::read(folder.join("unexpected.bin")).unwrap(), b"keep");
    fs::remove_file(folder.join("unexpected.bin")).unwrap();
    let current = fs::read(&blocked).unwrap();
    fs::write(&blocked, b"newer content").unwrap();
    assert!(f.api.handle("GET", &endpoint, Value::Null, vec![]).is_err());
    assert_eq!(fs::read(&blocked).unwrap(), b"newer content");
    fs::write(&blocked, current).unwrap();
    let fresh = request(&f.api, "GET", &endpoint, Value::Null);
    let finished = f
        .api
        .retire_mixed_payloads(
            &f.project,
            id,
            fresh["revision"].as_str().unwrap(),
            true,
            &external,
        )
        .unwrap();
    assert_eq!(finished["phase"], "retired");
    assert_eq!(finished["remainingBytes"], 0);
    assert_eq!(finished["canRetire"], false);
    assert_eq!(
        request(&f.api, "GET", &route, Value::Null)["phase"],
        "retired"
    );
    assert!(f
        .api
        .retire_mixed_payloads(
            &f.project,
            id,
            fresh["revision"].as_str().unwrap(),
            true,
            &external
        )
        .is_err());
    assert!(f
        .api
        .handle(
            "POST",
            &route,
            json!({"revision":preview["revision"],"acknowledge":true}),
            vec![]
        )
        .is_err());
    assert!(f
        .api
        .handle(
            "POST",
            &format!("{route}/continue"),
            json!({"revision":preview["revision"],"acknowledge":true}),
            vec![]
        )
        .is_err());
    assert_eq!(fs::read(folder.join("record.json")).unwrap(), record);
    assert_eq!(fs::read(folder.join("completed.json")).unwrap(), completion);
    assert_eq!(fs::read(folder.join("retirement.json")).unwrap(), journal);
    assert_eq!(fs::read(f.root.join(".git/index")).unwrap(), index);
    assert_eq!(git(&f.root, &["rev-parse", "HEAD"], None), head);
    assert_eq!(fs::read(f.root.join("A.md")).unwrap(), working);
    assert_eq!(fs::read(&external).unwrap(), archive);
    let mut zip = zip::ZipArchive::new(std::io::Cursor::new(archive)).unwrap();
    use std::io::Read;
    let mut recovered = vec![];
    zip.by_name("Anterior/A.md")
        .unwrap()
        .read_to_end(&mut recovered)
        .unwrap();
    assert_eq!(recovered, b"Local A");

    let catalog = request(
        &f.api,
        "GET",
        "/api/recovery/families/mixed-applications",
        Value::Null,
    );
    let key = catalog["items"]
        .as_array()
        .unwrap()
        .iter()
        .find(|r| r["name"] == id)
        .unwrap()["key"]
        .as_str()
        .unwrap();
    let review_path = format!("/api/recovery/families/mixed-applications/{key}");
    let conserved = request(
        &f.api,
        "POST",
        &format!("{review_path}/review"),
        json!({"archived":false}),
    );
    assert_eq!(conserved["canClose"], true);
    request(
        &f.api,
        "POST",
        &format!("{review_path}/close"),
        json!({"revision":conserved["revision"],"acknowledge":true}),
    );
    let plans = request(
        &f.api,
        "GET",
        "/api/recovery/families/mixed-reviews",
        Value::Null,
    );
    let key = plans["items"]
        .as_array()
        .unwrap()
        .iter()
        .find(|r| r["name"] == format!("{id}.json"))
        .unwrap()["key"]
        .as_str()
        .unwrap();
    let plan_path = format!("/api/recovery/families/mixed-reviews/{key}");
    let plan = request(
        &f.api,
        "POST",
        &format!("{plan_path}/review"),
        json!({"archived":false}),
    );
    assert_eq!(plan["canClose"], true);
    request(
        &f.api,
        "POST",
        &format!("{plan_path}/close"),
        json!({"revision":plan["revision"],"acknowledge":true}),
    );
    assert!(f
        .api
        .handle(
            "POST",
            &route,
            json!({"revision":preview["revision"],"acknowledge":true}),
            vec![]
        )
        .is_err());
    assert!(external.exists());
}
