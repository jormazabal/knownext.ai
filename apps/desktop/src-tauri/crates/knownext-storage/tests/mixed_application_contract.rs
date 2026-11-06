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
fn application_preserves_backups_index_and_history_then_reopens_without_replay() {
    let f = mixed_fixture();
    let id = "mixed-22222222222222222222222222222222";
    let route = selected(&f, id);
    let before_index = fs::read(f.root.join(".git/index")).unwrap();
    let preview = request(&f.api, "POST", &format!("{route}/review"), Value::Null);
    assert_eq!(preview["rows"].as_array().unwrap().len(), 2);
    assert_eq!(fs::read(f.root.join("A.md")).unwrap(), b"Local A");
    let done = request(
        &f.api,
        "POST",
        &route,
        json!({"revision":preview["revision"],"acknowledge":true}),
    );
    assert_eq!(done["phase"], "completed");
    assert_eq!(fs::read(f.root.join("A.md")).unwrap(), b"Remote A");
    assert_eq!(fs::read(f.root.join("C.md")).unwrap(), b"Remote C");
    assert_eq!(fs::read(f.root.join("B.md")).unwrap(), b"Local B");
    assert_eq!(fs::read(f.root.join(".git/index")).unwrap(), before_index);
    assert_eq!(git(&f.root, &["rev-parse", "HEAD"], None), f.local);
    let reopened = LocalApi::new(f._owned.path().join("state"), "qa".into(), "test".into());
    let observed = request(&reopened, "GET", &route, Value::Null);
    assert_eq!(observed["phase"], "completed");
    assert_eq!(observed["canContinue"], false);
    assert!(reopened
        .handle(
            "POST",
            &route,
            json!({"revision":preview["revision"],"acknowledge":true}),
            vec![]
        )
        .is_err());
    let copied = request(
        &reopened,
        "POST",
        &format!("{route}/copy"),
        json!({"revision":observed["revision"],"path":"A.md","side":"before","name":"Recovered.md"}),
    );
    assert_eq!(copied["name"], "Recovered.md");
    assert_eq!(fs::read(f.root.join("Recovered.md")).unwrap(), b"Local A");
    assert!(reopened.handle("POST",&format!("{route}/copy"),json!({"revision":observed["revision"],"path":"A.md","side":"before","name":"Recovered.md"}),vec![]).is_err());
    fs::write(f.root.join("A.md"), b"Later user work").unwrap();
    assert_eq!(
        request(&reopened, "GET", &route, Value::Null)["phase"],
        "changed"
    );
    assert_eq!(fs::read(f.root.join("A.md")).unwrap(), b"Later user work");
}
#[test]
fn changed_files_drafts_or_future_journals_never_authorize_blind_writes() {
    let f = mixed_fixture();
    let id = "mixed-33333333333333333333333333333333";
    let route = selected(&f, id);
    let preview = request(&f.api, "POST", &format!("{route}/review"), Value::Null);
    let draft_id = format!("{}::A.md", f.project);
    request(
        &f.api,
        "PUT",
        &format!("/api/documents/{draft_id}/draft"),
        json!({"markdown":"Private draft","expectedDraftWriteRevision":null}),
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
    assert_eq!(fs::read(f.root.join("A.md")).unwrap(), b"Local A");
    assert_eq!(
        request(&f.api, "GET", &route, Value::Null)["phase"],
        "absent"
    );
}

#[test]
fn bounded_application_reopens_a_partial_batch_and_blocks_history_until_completed_or_explicitly_closed(
) {
    let f = mixed_fixture();
    for index in 0..6 {
        fs::write(
            f.root.join(format!("R{index}.bin")),
            format!("Local resource {index}"),
        )
        .unwrap();
    }
    fs::write(f.root.join("Old.bin"), b"Local old resource").unwrap();
    git(
        &f.root,
        &[
            "add", "--", "R0.bin", "R1.bin", "R2.bin", "R3.bin", "R4.bin", "R5.bin", "Old.bin",
        ],
        None,
    );
    git(&f.root, &["commit", "-m", "Owned local resources"], None);
    let local = git(&f.root, &["rev-parse", "HEAD"], None);
    for index in 0..6 {
        let blob = git(
            &f.root,
            &["hash-object", "-w", "--stdin"],
            Some(format!("Remote resource {index}").as_bytes()),
        );
        git(
            &f.root,
            &[
                "update-index",
                "--cacheinfo",
                &format!("100644,{blob},R{index}.bin"),
            ],
            None,
        );
    }
    git(
        &f.root,
        &["update-index", "--force-remove", "--", "Old.bin"],
        None,
    );
    let blob = git(
        &f.root,
        &["hash-object", "-w", "--stdin"],
        Some(b"Remote new resource"),
    );
    git(
        &f.root,
        &[
            "update-index",
            "--add",
            "--cacheinfo",
            &format!("100644,{blob},New/Sub.bin"),
        ],
        None,
    );
    let tree = git(&f.root, &["write-tree"], None);
    let remote = git(
        &f.root,
        &[
            "commit-tree",
            &tree,
            "-p",
            &f.base,
            "-m",
            "Owned remote resources",
        ],
        None,
    );
    git(&f.root, &["update-ref", &f.remote_ref, &remote], None);
    git(&f.root, &["read-tree", &local], None);
    let overview = request(
        &f.api,
        "GET",
        &format!("/api/projects/{}/sync/remote-review", f.project),
        Value::Null,
    );
    let route = format!("/api/projects/{}/sync/mixed-selections", f.project);
    let candidate = request(
        &f.api,
        "POST",
        &format!("{route}/review"),
        json!({"revision":overview["revision"]}),
    );
    let choices:Vec<_>=candidate["rows"].as_array().unwrap().iter().map(|row|json!({"path":row["path"],"choice":if row["path"].as_str().unwrap().ends_with(".md"){"local"}else{"remote"}})).collect();
    let id = "mixed-44444444444444444444444444444444";
    request(
        &f.api,
        "POST",
        &route,
        json!({"id":id,"revision":overview["revision"],"choices":choices}),
    );
    let route = format!("{route}/{id}/application");
    let preview = request(&f.api, "POST", &format!("{route}/review"), Value::Null);
    let partial = request(
        &f.api,
        "POST",
        &route,
        json!({"revision":preview["revision"],"acknowledge":true}),
    );
    assert_eq!(partial["phase"], "partial");
    assert_eq!(partial["appliedCount"], 4);
    assert!(f.root.join(".knownext-mixed-work/pending.json").is_file());
    assert!(f
        .api
        .handle(
            "POST",
            &format!("/api/projects/{}/versions", f.project),
            json!({"documentId":format!("{}::A.md",f.project),"title":"Must not commit partial"}),
            vec![]
        )
        .is_err());
    let sync = request(
        &f.api,
        "POST",
        &format!("/api/projects/{}/sync/push", f.project),
        json!({}),
    );
    assert_eq!(sync["status"], "paused");
    let reopened = LocalApi::new(f._owned.path().join("state"), "qa".into(), "test".into());
    assert_eq!(
        request(&reopened, "GET", &route, Value::Null)["phase"],
        "partial"
    );
    fs::write(f.root.join("R5.bin"), b"Later user resource").unwrap();
    let blocked = request(&reopened, "GET", &route, Value::Null);
    assert_eq!(blocked["phase"], "blocked");
    assert!(reopened
        .handle(
            "POST",
            &format!("{route}/continue"),
            json!({"revision":blocked["revision"],"acknowledge":true}),
            vec![]
        )
        .is_err());
    fs::write(f.root.join("R5.bin"), b"Local resource 5").unwrap();
    let observed = request(&reopened, "GET", &route, Value::Null);
    let guard = f.root.join(".knownext-mixed-work/pending.json");
    let permissions = fs::metadata(&guard).unwrap().permissions();
    let mut readonly = permissions.clone();
    readonly.set_readonly(true);
    fs::set_permissions(&guard, readonly).unwrap();
    let finishing = reopened.handle(
        "POST",
        &format!("{route}/continue"),
        json!({"revision":observed["revision"],"acknowledge":true}),
        vec![],
    );
    fs::set_permissions(&guard, permissions).unwrap();
    assert!(finishing.is_err());
    let completed = request(&reopened, "GET", &route, Value::Null);
    assert_eq!(completed["phase"], "completed");
    assert_eq!(completed["canRelease"], true);
    let completed = request(
        &reopened,
        "POST",
        &format!("{route}/close"),
        json!({"revision":completed["revision"],"action":"release","acknowledge":true}),
    );
    assert_eq!(completed["phase"], "completed");
    assert!(!f.root.join("Old.bin").exists());
    assert_eq!(
        fs::read(f.root.join("New/Sub.bin")).unwrap(),
        b"Remote new resource"
    );
    assert!(!f.root.join(".knownext-mixed-work/pending.json").exists());
    assert_eq!(git(&f.root, &["rev-parse", "HEAD"], None), local);
    // The same durable copies remain available after the run; unknown metadata is never repaired.
    use sha2::{Digest, Sha256};
    let folder = f
        ._owned
        .path()
        .join("state/mixed-applications")
        .join(format!("{:x}", Sha256::digest(f.project.as_bytes())))
        .join(id);
    let marker = folder.join("completed.json");
    let completed_bytes = fs::read(&marker).unwrap();
    fs::remove_file(&marker).unwrap();
    let current = request(&reopened, "GET", &route, Value::Null);
    let abandoned = request(
        &reopened,
        "POST",
        &format!("{route}/close"),
        json!({"revision":current["revision"],"action":"abandon","acknowledge":true}),
    );
    assert_eq!(abandoned["phase"], "abandoned");
    assert_eq!(abandoned["canContinue"], false);
    let record = folder.join("record.json");
    let mut future: Value = serde_json::from_slice(&fs::read(&record).unwrap()).unwrap();
    future["format"] = json!(99);
    let raw = serde_json::to_vec(&future).unwrap();
    fs::write(&record, &raw).unwrap();
    assert!(reopened.handle("GET", &route, Value::Null, vec![]).is_err());
    assert_eq!(fs::read(&record).unwrap(), raw);
    assert!(!completed_bytes.is_empty());
}

#[test]
fn lifecycle_executable_content_application_preserves_mode_index_and_history() {
    let mut f = mixed_fixture();
    git(&f.root, &["update-index", "--chmod=+x", "--", "A.md"], None);
    git(
        &f.root,
        &["commit", "-m", "Owned local executable mode"],
        None,
    );
    f.local = git(&f.root, &["rev-parse", "HEAD"], None);
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(f.root.join("A.md"), fs::Permissions::from_mode(0o755)).unwrap();
    }
    let remote = git(&f.root, &["rev-parse", &f.remote_ref], None);
    git(&f.root, &["read-tree", &remote], None);
    let remote_blob = git(&f.root, &["rev-parse", &format!("{remote}:A.md")], None);
    git(
        &f.root,
        &[
            "update-index",
            "--cacheinfo",
            &format!("100755,{remote_blob},A.md"),
        ],
        None,
    );
    let tree = git(&f.root, &["write-tree"], None);
    let remote = git(
        &f.root,
        &[
            "commit-tree",
            &tree,
            "-p",
            &f.base,
            "-m",
            "Owned remote executable",
        ],
        None,
    );
    git(&f.root, &["update-ref", &f.remote_ref, &remote], None);
    git(&f.root, &["read-tree", &f.local], None);
    let route = selected(&f, "mixed-51515151515151515151515151515151");
    let index = fs::read(f.root.join(".git/index")).unwrap();
    let preview = request(&f.api, "POST", &format!("{route}/review"), Value::Null);
    let row = preview["rows"]
        .as_array()
        .unwrap()
        .iter()
        .find(|r| r["path"] == "A.md")
        .unwrap();
    assert_eq!(row["beforeMode"], "100755");
    assert_eq!(row["afterMode"], "100755");
    let done = request(
        &f.api,
        "POST",
        &route,
        json!({"revision":preview["revision"],"acknowledge":true}),
    );
    assert_eq!(done["phase"], "completed");
    assert_eq!(fs::read(f.root.join("A.md")).unwrap(), b"Remote A");
    assert_eq!(fs::read(f.root.join(".git/index")).unwrap(), index);
    assert_eq!(git(&f.root, &["rev-parse", "HEAD"], None), f.local);
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        assert_ne!(
            fs::metadata(f.root.join("A.md"))
                .unwrap()
                .permissions()
                .mode()
                & 0o111,
            0
        );
    }
}
#[test]
fn lifecycle_pre_receipt_repreparation_uses_fresh_identity_and_preserves_unknown_originals() {
    let f = mixed_fixture();
    let id = "mixed-61616161616161616161616161616161";
    let route = selected(&f, id);
    use sha2::{Digest, Sha256};
    let group = format!("{:x}", Sha256::digest(f.project.as_bytes()));
    let folder = f
        ._owned
        .path()
        .join("state/mixed-applications")
        .join(group)
        .join(id);
    fs::create_dir_all(&folder).unwrap();
    fs::write(folder.join("000-before.bin"), b"Owned pre-receipt bytes").unwrap();
    fs::write(
        folder.join("record.json"),
        b"{\"format\":99,\"ownedFuture\":true}",
    )
    .unwrap();
    let review = request(&f.api, "GET", &format!("{route}/copies"), Value::Null);
    assert_eq!(review["canReprepare"], true);
    let body = json!({"revision":review["revision"],"acknowledge":true});
    assert!(f
        .api
        .handle(
            "POST",
            &format!("{route}/reprepare"),
            json!({"revision":"stale","acknowledge":true}),
            vec![]
        )
        .is_err());
    let created = request(&f.api, "POST", &format!("{route}/reprepare"), body.clone());
    assert_ne!(created["planId"], id);
    assert_eq!(created["preservesOriginal"], true);
    assert_eq!(
        request(&f.api, "POST", &format!("{route}/reprepare"), body)["planId"],
        created["planId"]
    );
    assert_eq!(
        fs::read(folder.join("000-before.bin")).unwrap(),
        b"Owned pre-receipt bytes"
    );
    assert_eq!(
        fs::read(folder.join("record.json")).unwrap(),
        b"{\"format\":99,\"ownedFuture\":true}"
    );
    assert_eq!(fs::read(f.root.join("A.md")).unwrap(), b"Local A");
    let new_route = format!(
        "/api/projects/{}/sync/mixed-selections/{}/application/review",
        f.project,
        created["planId"].as_str().unwrap()
    );
    assert_eq!(
        request(&f.api, "POST", &new_route, Value::Null)["canStart"],
        true
    );
}

#[test]
fn lifecycle_corrupt_payload_can_be_closed_without_repair_undo_or_replay() {
    use sha2::{Digest, Sha256};
    let f = mixed_fixture();
    let id = "mixed-71717171717171717171717171717171";
    let route = selected(&f, id);
    let preview = request(&f.api, "POST", &format!("{route}/review"), Value::Null);
    request(
        &f.api,
        "POST",
        &route,
        json!({"revision":preview["revision"],"acknowledge":true}),
    );
    let state = f._owned.path().join("state");
    let folder = state
        .join("mixed-applications")
        .join(format!("{:x}", Sha256::digest(f.project.as_bytes())))
        .join(id);
    let raw = fs::read(folder.join("record.json")).unwrap();
    fs::remove_file(folder.join("completed.json")).unwrap();
    fs::write(
        folder.join("000-before.bin"),
        b"Owned unreadable original payload",
    )
    .unwrap();
    #[derive(serde::Serialize)]
    #[serde(rename_all = "camelCase")]
    struct OwnedMarker<'a> {
        format: u8,
        project_id: &'a str,
        plan_id: &'a str,
        record_sha256: String,
        store_sha256: String,
    }
    let marker = OwnedMarker {
        format: 1,
        project_id: &f.project,
        plan_id: id,
        record_sha256: format!("{:x}", Sha256::digest(&raw)),
        store_sha256: format!(
            "{:x}",
            Sha256::digest(state.canonicalize().unwrap().to_string_lossy().as_bytes())
        ),
    };
    fs::write(
        f.root.join(".knownext-mixed-work/pending.json"),
        serde_json::to_vec(&marker).unwrap(),
    )
    .unwrap();
    let working = fs::read(f.root.join("A.md")).unwrap();
    let observed = request(&f.api, "GET", &format!("{route}/copies"), Value::Null);
    assert_eq!(observed["canAbandon"], true);
    assert!(f
        .api
        .handle(
            "POST",
            &format!("{route}/abandon-incomplete"),
            json!({"revision":"stale","acknowledge":true}),
            vec![]
        )
        .is_err());
    let closed = request(
        &f.api,
        "POST",
        &format!("{route}/abandon-incomplete"),
        json!({"revision":observed["revision"],"acknowledge":true}),
    );
    assert_eq!(closed["closed"], true);
    assert_eq!(closed["changesWorkingFiles"], false);
    assert!(!f.root.join(".knownext-mixed-work/pending.json").exists());
    assert_eq!(fs::read(folder.join("record.json")).unwrap(), raw);
    assert_eq!(
        fs::read(folder.join("000-before.bin")).unwrap(),
        b"Owned unreadable original payload"
    );
    assert_eq!(fs::read(f.root.join("A.md")).unwrap(), working);
    assert_eq!(
        request(&f.api, "GET", &format!("{route}/copies"), Value::Null)["canAbandon"],
        false
    );
    assert!(f
        .api
        .handle(
            "POST",
            &format!("{route}/continue"),
            json!({"revision":preview["revision"],"acknowledge":true}),
            vec![]
        )
        .is_err());
}
