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
fn attempt(n: u8) -> String {
    format!("attempt-{n:032x}")
}
fn route(f: &Fixture) -> String {
    format!("/api/projects/{}/sync/graph-joins", f.project)
}
fn review(f: &Fixture) -> Value {
    request(
        &f.api,
        "GET",
        &format!("/api/projects/{}/sync/remote-review", f.project),
        Value::Null,
    )
}
fn receipt(f: &Fixture, id: &str) -> PathBuf {
    let entries = fs::read_dir(f._owned.path().join("state/graph-joins"))
        .unwrap()
        .collect::<Result<Vec<_>, _>>()
        .unwrap();
    assert_eq!(entries.len(), 1);
    entries[0].path().join(format!("{id}.json"))
}
#[test]
fn identical_trees_join_both_histories_without_rewriting_working_files_index_or_private_drafts() {
    let f = fixture();
    let document = format!("{}::Review.md", f.project);
    request(
        &f.api,
        "PUT",
        &format!("/api/documents/{document}/draft"),
        json!({"markdown":"# My private draft\n"}),
    );
    let draft = request(
        &f.api,
        "GET",
        &format!("/api/documents/{document}"),
        Value::Null,
    );
    let index = fs::read(f.root.join(".git/index")).unwrap();
    let file = fs::read(f.root.join("Review.md")).unwrap();
    let seen = review(&f);
    assert_eq!(seen["relation"], "diverged");
    assert_eq!(seen["graphJoin"]["canJoin"], true);
    let remote = seen["remoteCommit"].as_str().unwrap();
    let id = attempt(1);
    let body = json!({"revision":seen["revision"],"attemptId":id});
    // A repository hook must not run during the private reference transaction.
    let hook = f.root.join(".git/hooks/reference-transaction");
    fs::write(&hook, "#!/bin/sh\nprintf executed > hook-was-run\nexit 1\n").unwrap();
    let result = request(&f.api, "POST", &route(&f), body.clone());
    assert_eq!(result["status"], "confirmed");
    assert_eq!(result["attemptId"], id);
    assert_eq!(
        git(
            &f.root,
            &["show", "--no-patch", "--format=%P", "HEAD"],
            None
        ),
        format!("{} {remote}", f.local)
    );
    assert!(!f.root.join("hook-was-run").exists());
    assert_eq!(fs::read(f.root.join("Review.md")).unwrap(), file);
    assert_eq!(fs::read(f.root.join(".git/index")).unwrap(), index);
    let after = request(
        &f.api,
        "GET",
        &format!("/api/documents/{document}"),
        Value::Null,
    );
    assert_eq!(after["markdown"], draft["markdown"]);
    assert_eq!(after["draftWriteRevision"], draft["draftWriteRevision"]);
    let record = receipt(&f, &id);
    let bytes = fs::read(&record).unwrap();
    let fresh = LocalApi::new(f._owned.path().join("state"), "qa".into(), "test".into());
    assert_eq!(
        request(&fresh, "GET", &format!("{}/{}", route(&f), id), Value::Null)["status"],
        "confirmed"
    );
    assert!(f.api.handle("POST", &route(&f), body, vec![]).is_err());
    assert_eq!(fs::read(record).unwrap(), bytes);
    assert_eq!(
        review(&f)["graphJoins"]["items"].as_array().unwrap().len(),
        1
    );
}
#[test]
fn changed_revision_or_unsaved_files_cannot_publish_and_distinct_trees_are_not_joinable() {
    let f = fixture();
    let seen = review(&f);
    fs::write(f.root.join("Review.md"), b"# New uncommitted text\n").unwrap();
    assert_eq!(review(&f)["graphJoin"]["canJoin"], false);
    assert!(f
        .api
        .handle(
            "POST",
            &route(&f),
            json!({"revision":seen["revision"],"attemptId":attempt(2)}),
            vec![]
        )
        .is_err());
    assert_eq!(git(&f.root, &["rev-parse", "HEAD"], None), f.local);
    fs::write(f.root.join("Review.md"), b"# Same result\n").unwrap();
    let base_tree = git(
        &f.root,
        &["rev-parse", &format!("{}^{{tree}}", f.base)],
        None,
    );
    let different = git(
        &f.root,
        &[
            "commit-tree",
            &base_tree,
            "-p",
            &f.base,
            "-m",
            "Different remote",
        ],
        None,
    );
    git(&f.root, &["update-ref", &f.remote_ref, &different], None);
    assert_eq!(review(&f)["graphJoin"]["canJoin"], false);
    assert!(f
        .api
        .handle(
            "POST",
            &route(&f),
            json!({"revision":seen["revision"],"attemptId":attempt(3)}),
            vec![]
        )
        .is_err());
    assert_eq!(git(&f.root, &["rev-parse", "HEAD"], None), f.local);
    assert!(review(&f)["graphJoins"]["items"]
        .as_array()
        .unwrap()
        .is_empty());
}
#[test]
fn prepared_receipts_are_read_only_and_another_attempt_never_confirms_the_first_or_recycles_future_receipts(
) {
    let f = fixture();
    let seen = review(&f);
    let a = attempt(4);
    let first = request(
        &f.api,
        "POST",
        &route(&f),
        json!({"revision":seen["revision"],"attemptId":a}),
    );
    let file = receipt(&f, &a);
    let bytes = fs::read(&file).unwrap();
    // Owned fixture models a cut after intent, before publication. Reads do not resume.
    git(&f.root, &["update-ref", "HEAD", &f.local], None);
    let pending = request(&f.api, "GET", &format!("{}/{}", route(&f), a), Value::Null);
    assert_eq!(pending["status"], "pending");
    assert_eq!(pending["canReplay"], false);
    assert_eq!(fs::read(&file).unwrap(), bytes);
    assert_eq!(git(&f.root, &["rev-parse", "HEAD"], None), f.local);
    let b = attempt(5);
    let second = request(
        &f.api,
        "POST",
        &route(&f),
        json!({"revision":seen["revision"],"attemptId":b}),
    );
    assert_eq!(second["status"], "confirmed");
    assert_ne!(first["targetCommit"], second["targetCommit"]);
    assert_eq!(
        request(&f.api, "GET", &format!("{}/{}", route(&f), a), Value::Null)["status"],
        "changed"
    );
    let mut future: Value = serde_json::from_slice(&bytes).unwrap();
    future["format"] = json!(2);
    let future_bytes = serde_json::to_vec(&future).unwrap();
    fs::write(&file, &future_bytes).unwrap();
    assert!(f
        .api
        .handle("GET", &format!("{}/{}", route(&f), a), Value::Null, vec![])
        .is_err());
    assert!(f
        .api
        .handle(
            "POST",
            &route(&f),
            json!({"revision":seen["revision"],"attemptId":a}),
            vec![]
        )
        .is_err());
    assert_eq!(fs::read(file).unwrap(), future_bytes);
    assert_eq!(review(&f)["graphJoins"]["limited"], true);
}

#[test]
fn receipt_capacity_is_visible_before_a_new_decision_and_never_prunes_or_recycles_ids() {
    let f = fixture();
    let seen = review(&f);
    let first = attempt(1);
    request(
        &f.api,
        "POST",
        &route(&f),
        json!({"revision":seen["revision"],"attemptId":first}),
    );
    let path = receipt(&f, &first);
    let bytes = fs::read(&path).unwrap();
    git(&f.root, &["update-ref", "HEAD", &f.local], None);
    let original: Value = serde_json::from_slice(&bytes).unwrap();
    for n in 2..=64 {
        let mut record = original.clone();
        record["attemptId"] = json!(attempt(n));
        fs::write(
            path.parent().unwrap().join(format!("{}.json", attempt(n))),
            serde_json::to_vec(&record).unwrap(),
        )
        .unwrap();
    }
    let at_capacity = review(&f);
    assert_eq!(
        at_capacity["graphJoins"]["items"].as_array().unwrap().len(),
        64
    );
    assert_eq!(at_capacity["graphJoin"]["canJoin"], false);
    assert!(f
        .api
        .handle(
            "POST",
            &route(&f),
            json!({"revision":at_capacity["revision"],"attemptId":attempt(65)}),
            vec![]
        )
        .is_err());
    assert_eq!(fs::read(path).unwrap(), bytes);
    assert_eq!(git(&f.root, &["rev-parse", "HEAD"], None), f.local);
}

#[test]
fn explicit_local_choice_keeps_the_complete_recorded_tree_and_both_histories_with_versioned_receipts(
) {
    let f = fixture();
    fs::rename(f.root.join("Review.md"), f.root.join("Version local.md")).unwrap();
    fs::create_dir(f.root.join("Anexos")).unwrap();
    fs::write(f.root.join("Anexos/Local.txt"), b"Local resource").unwrap();
    git(&f.root, &["add", "--all"], None);
    git(
        &f.root,
        &["commit", "-m", "Owned local rename and resource"],
        None,
    );
    let local = git(&f.root, &["rev-parse", "HEAD"], None);
    let local_tree = git(&f.root, &["rev-parse", "HEAD^{tree}"], None);
    let blob = git(
        &f.root,
        &["hash-object", "-w", "--stdin"],
        Some(b"Remote changed content"),
    );
    let remote_tree = git(
        &f.root,
        &["mktree"],
        Some(format!("100644 blob {blob}\tRemoto.txt\n100644 blob {blob}\tReview.md\n").as_bytes()),
    );
    let remote = git(
        &f.root,
        &[
            "commit-tree",
            &remote_tree,
            "-p",
            &f.base,
            "-m",
            "Owned remote different resources",
        ],
        None,
    );
    git(&f.root, &["update-ref", &f.remote_ref, &remote], None);
    let document = format!("{}::Version local.md", f.project);
    request(
        &f.api,
        "PUT",
        &format!("/api/documents/{document}/draft"),
        json!({"markdown":"Private work still pending"}),
    );
    let draft = request(
        &f.api,
        "GET",
        &format!("/api/documents/{document}"),
        Value::Null,
    );
    let index = fs::read(f.root.join(".git/index")).unwrap();
    let seen = review(&f);
    assert_eq!(seen["graphJoin"]["canJoin"], false);
    assert_eq!(seen["graphJoin"]["canKeepLocal"], true);
    let id = attempt(70);
    let mut body = json!({"revision":seen["revision"],"attemptId":id,"resolution":"keep-local"});
    assert!(f
        .api
        .handle("POST", &route(&f), body.clone(), vec![])
        .is_err());
    assert_eq!(git(&f.root, &["rev-parse", "HEAD"], None), local);
    body["acknowledgeRemoteHistoryOnly"] = json!(true);
    let result = request(&f.api, "POST", &route(&f), body.clone());
    assert_eq!(result["status"], "confirmed");
    assert_eq!(result["resolution"], "keep-local");
    assert_eq!(
        git(&f.root, &["rev-parse", "HEAD^{tree}"], None),
        local_tree
    );
    assert_eq!(
        git(
            &f.root,
            &["show", "--no-patch", "--format=%P", "HEAD"],
            None
        ),
        format!("{local} {remote}")
    );
    git(
        &f.root,
        &["merge-base", "--is-ancestor", &remote, "HEAD"],
        None,
    );
    assert_eq!(
        fs::read(f.root.join("Anexos/Local.txt")).unwrap(),
        b"Local resource"
    );
    assert_eq!(
        fs::read(f.root.join("Version local.md")).unwrap(),
        b"# Same result\n"
    );
    assert!(!f.root.join("Review.md").exists());
    assert!(!f.root.join("Remoto.txt").exists());
    assert_eq!(fs::read(f.root.join(".git/index")).unwrap(), index);
    assert_eq!(
        request(
            &f.api,
            "GET",
            &format!("/api/documents/{document}"),
            Value::Null
        )["draftWriteRevision"],
        draft["draftWriteRevision"]
    );
    let path = receipt(&f, &id);
    let bytes = fs::read(&path).unwrap();
    let record: Value = serde_json::from_slice(&bytes).unwrap();
    assert_eq!(record["format"], 2);
    assert_eq!(record["resolution"], "keep-local");
    let reopened = LocalApi::new(f._owned.path().join("state"), "qa".into(), "test".into());
    assert_eq!(
        request(
            &reopened,
            "GET",
            &format!("{}/{}", route(&f), id),
            Value::Null
        )["resolution"],
        "keep-local"
    );
    assert_eq!(fs::read(&path).unwrap(), bytes);
    let mut future = record;
    future["resolution"] = json!("keep-remote");
    let future_bytes = serde_json::to_vec(&future).unwrap();
    fs::write(&path, &future_bytes).unwrap();
    assert!(f
        .api
        .handle("GET", &format!("{}/{}", route(&f), id), Value::Null, vec![])
        .is_err());
    assert!(f.api.handle("POST", &route(&f), body, vec![]).is_err());
    assert_eq!(fs::read(path).unwrap(), future_bytes);
}
