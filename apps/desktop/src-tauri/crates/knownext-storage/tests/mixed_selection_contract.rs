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
fn mixed_body(review: &Value, id: &str) -> Value {
    json!({"id":id,"revision":review["revision"],"choices":[{"path":"A.md","choice":"remote"},{"path":"B.md","choice":"local"},{"path":"C.md","choice":"combined"}]})
}
fn prepare_mixture(f: &Fixture) {
    fs::write(f.root.join("A.md"), "Remote A").unwrap();
    fs::write(f.root.join("C.md"), "Combined C reviewed by user").unwrap();
    git(&f.root, &["add", "--", "A.md", "C.md"], None);
    git(&f.root, &["commit", "-m", "Owned prepared mixture"], None);
}
fn mixed_join(review: &Value, id: &str) -> Value {
    json!({"revision":review["revision"],"attemptId":id,"resolution":"mixed","mixedPlanId":review["id"],"mixedPlanRevision":review["planRevision"],"acknowledgePreparedCombination":true})
}
#[test]
fn saved_mixture_reopens_and_publishes_both_parents_without_changing_files_index_or_drafts() {
    let f = mixed_fixture();
    let review = request(
        &f.api,
        "GET",
        &format!("/api/projects/{}/sync/remote-review", f.project),
        Value::Null,
    );
    let route = format!("/api/projects/{}/sync/mixed-selections", f.project);
    let id = "mixed-11111111111111111111111111111111";
    let candidate = request(
        &f.api,
        "POST",
        &format!("{route}/review"),
        json!({"revision":review["revision"]}),
    );
    assert_eq!(candidate["rows"].as_array().unwrap().len(), 3);
    let original_index = fs::read(f.root.join(".git/index")).unwrap();
    let first = request(&f.api, "POST", &route, mixed_body(&review, id));
    assert_eq!(first["ready"], false);
    assert_eq!(fs::read_to_string(f.root.join("A.md")).unwrap(), "Local A");
    assert_eq!(fs::read(f.root.join(".git/index")).unwrap(), original_index);
    let document = format!("{}::B.md", f.project);
    let draft = request(
        &f.api,
        "PUT",
        &format!("/api/documents/{document}/draft"),
        json!({"markdown":"Private pending B","expectedDraftWriteRevision":null}),
    );
    prepare_mixture(&f);
    let reopened = LocalApi::new(f._owned.path().join("state"), "qa".into(), "test".into());
    let ready = request(&reopened, "GET", &format!("{route}/{id}"), Value::Null);
    assert_eq!(ready["ready"], true);
    assert_eq!(ready["proof"]["localChoices"], 1);
    assert_eq!(ready["proof"]["remoteChoices"], 1);
    assert_eq!(ready["proof"]["combinedChoices"], 1);
    let local = git(&f.root, &["rev-parse", "HEAD"], None);
    let remote = git(&f.root, &["rev-parse", &f.remote_ref], None);
    let index = fs::read(f.root.join(".git/index")).unwrap();
    let files = ["A.md", "B.md", "C.md"].map(|name| fs::read(f.root.join(name)).unwrap());
    let attempt = attempt(71);
    let body = mixed_join(&ready, &attempt);
    let proof = request(
        &reopened,
        "POST",
        &format!("/api/projects/{}/sync/graph-joins", f.project),
        body.clone(),
    );
    assert_eq!(proof["status"], "confirmed");
    assert_eq!(proof["resolution"], "mixed");
    assert_eq!(proof["mixedSelection"]["planId"], id);
    let head = git(&f.root, &["rev-parse", "HEAD"], None);
    assert_eq!(
        git(&f.root, &["show", "-s", "--format=%P", &head], None),
        format!("{local} {remote}")
    );
    assert_eq!(fs::read(f.root.join(".git/index")).unwrap(), index);
    assert_eq!(
        ["A.md", "B.md", "C.md"].map(|name| fs::read(f.root.join(name)).unwrap()),
        files
    );
    assert_eq!(
        request(
            &reopened,
            "GET",
            &format!("/api/documents/{document}"),
            Value::Null
        )["draftWriteRevision"],
        draft["draftWriteRevision"]
    );
    assert!(reopened
        .handle(
            "POST",
            &format!("/api/projects/{}/sync/graph-joins", f.project),
            body,
            vec![]
        )
        .is_err());
    assert_eq!(
        request(
            &reopened,
            "GET",
            &format!("/api/projects/{}/sync/graph-joins/{attempt}", f.project),
            Value::Null
        )["status"],
        "confirmed"
    );
}
#[test]
fn mixed_selection_rejects_missing_paths_outside_changes_remote_drift_and_future_plan_without_publication(
) {
    let f = mixed_fixture();
    let review = request(
        &f.api,
        "GET",
        &format!("/api/projects/{}/sync/remote-review", f.project),
        Value::Null,
    );
    let route = format!("/api/projects/{}/sync/mixed-selections", f.project);
    let id = "mixed-22222222222222222222222222222222";
    let body = mixed_body(&review, id);
    let mut incomplete = body.clone();
    incomplete["choices"].as_array_mut().unwrap().pop();
    assert!(f.api.handle("POST", &route, incomplete, vec![]).is_err());
    request(&f.api, "POST", &route, body);
    prepare_mixture(&f);
    fs::write(f.root.join("Extra.md"), "Independent saved work").unwrap();
    git(&f.root, &["add", "--", "Extra.md"], None);
    git(&f.root, &["commit", "-m", "Owned outside work"], None);
    let state = request(&f.api, "GET", &format!("{route}/{id}"), Value::Null);
    assert_eq!(state["ready"], false);
    assert_eq!(state["additionalCount"], 1);
    let before = git(&f.root, &["rev-parse", "HEAD"], None);
    assert!(f
        .api
        .handle(
            "POST",
            &format!("/api/projects/{}/sync/graph-joins", f.project),
            mixed_join(&state, &attempt(72)),
            vec![]
        )
        .is_err());
    assert_eq!(git(&f.root, &["rev-parse", "HEAD"], None), before);
    assert_eq!(
        fs::read_to_string(f.root.join("Extra.md")).unwrap(),
        "Independent saved work"
    );
    let raw_plan = f
        ._owned
        .path()
        .join("state/mixed-reviews")
        .join({
            use sha2::{Digest, Sha256};
            format!("{:x}", Sha256::digest(f.project.as_bytes()))
        })
        .join(format!("{id}.json"));
    let raw = fs::read(&raw_plan).unwrap();
    git(&f.root, &["update-ref", &f.remote_ref, &f.local], None);
    assert!(f
        .api
        .handle("GET", &format!("{route}/{id}"), Value::Null, vec![])
        .is_err());
    assert_eq!(fs::read(&raw_plan).unwrap(), raw);
    let mut future: Value = serde_json::from_slice(&raw).unwrap();
    future["format"] = json!(99);
    let future = serde_json::to_vec(&future).unwrap();
    fs::write(&raw_plan, &future).unwrap();
    assert!(f
        .api
        .handle("GET", &format!("{route}/{id}"), Value::Null, vec![])
        .is_err());
    let inventory = request(
        &f.api,
        "GET",
        &format!("/api/projects/{}/sync/remote-review", f.project),
        Value::Null,
    );
    assert_eq!(inventory["mixedSelections"]["limited"], true);
    assert_eq!(fs::read(&raw_plan).unwrap(), future);
}
