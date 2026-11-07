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
fn fixture() -> (tempfile::TempDir, LocalApi, PathBuf, String, String, String) {
    let owned = tempfile::tempdir().unwrap();
    let api = LocalApi::new(owned.path().join("state"), "qa".into(), "test".into());
    let project = request(
        &api,
        "POST",
        "/api/projects",
        json!({"name":"Owned remote review","versioningMode":"local-git","syncMode":"none"}),
    );
    let root = PathBuf::from(project["folderPath"].as_str().unwrap());
    let pid = project["id"].as_str().unwrap();
    fs::write(root.join("Review.md"), "# Base\n\nShared\n").unwrap();
    git(&root, &["add", "--", "Review.md"], None);
    git(&root, &["commit", "-m", "Owned base"], None);
    let base = git(&root, &["rev-parse", "HEAD"], None);
    fs::write(root.join("Review.md"), "# Local\n\nShared\n").unwrap();
    git(&root, &["add", "--", "Review.md"], None);
    git(&root, &["commit", "-m", "Owned local"], None);
    let blob = git(
        &root,
        &["hash-object", "-w", "--stdin"],
        Some(b"# Remote\n\nShared\n"),
    );
    let tree = git(
        &root,
        &["mktree"],
        Some(format!("100644 blob {blob}\tReview.md\n").as_bytes()),
    );
    let remote = git(
        &root,
        &["commit-tree", &tree, "-p", &base, "-m", "Owned remote"],
        None,
    );
    let branch = git(&root, &["branch", "--show-current"], None);
    let reference = format!("refs/remotes/origin/{branch}");
    git(&root, &["update-ref", &reference, &remote], None);
    // Deliberately unavailable local origin: review cannot fetch or depend on a service.
    git(
        &root,
        &[
            "remote",
            "add",
            "origin",
            owned.path().join("no-remote-service").to_str().unwrap(),
        ],
        None,
    );
    let id = format!("{pid}::Review.md");
    request(
        &api,
        "PUT",
        &format!("/api/documents/{id}/draft"),
        json!({"markdown":"# My draft\n\nShared\n"}),
    );
    (owned, api, root, id, reference, remote)
}
fn payload(review: &Value) -> Value {
    let mut source = review["remoteSource"].clone();
    source.as_object_mut().unwrap().remove("markdown");
    json!({"locationRevision":review["locationRevision"],"diskFingerprint":review["diskFingerprint"],"draftRevision":review["draftRevision"],"localMarkdown":"# My draft\n\nShared\n","mergedMarkdown":"# Combined\n\nShared\n","remoteSource":source})
}
#[test]
fn remote_attempt_receipt_confirms_four_copies_and_rejects_a_later_reference_without_rewriting_anything(){
    let(owned,api,root,id,reference,_remote)=fixture();let review=request(&api,"GET",&format!("/api/documents/{id}/remote-conflict"),Value::Null);let mut body=payload(&review);let attempt="attempt-owned-remote-0007";body["attemptId"]=json!(attempt);
    let head=git(&root,&["rev-parse","HEAD"],None);let index=fs::read(root.join(".git/index")).unwrap();let disk=fs::read(root.join("Review.md")).unwrap();
    let result=request(&api,"POST",&format!("/api/documents/{id}/conflict"),body.clone());assert_eq!(result["preservedCopies"].as_array().unwrap().len(),4);
    let file=owned.path().join("state/conflict-attempts").join(format!("{attempt}.json"));let bytes=fs::read(&file).unwrap();let route=format!("/api/documents/{id}/conflict-attempts/{attempt}/review");
    let proof=request(&api,"POST",&route,body.clone());assert_eq!(proof["status"],"confirmed");assert_eq!(proof["result"]["remoteSource"],body["remoteSource"]);assert_eq!(proof["result"]["preservedCopies"],result["preservedCopies"]);assert_eq!(fs::read(&file).unwrap(),bytes);
    git(&root,&["update-ref",&reference,&head],None);assert!(api.handle("POST",&route,body,vec![]).is_err());assert_eq!(fs::read(&file).unwrap(),bytes);assert_eq!(git(&root,&["rev-parse","HEAD"],None),head);assert_eq!(fs::read(root.join(".git/index")).unwrap(),index);assert_eq!(fs::read(root.join("Review.md")).unwrap(),disk);
}

#[test]
fn project_graph_review_reports_committed_renames_resources_and_overlap_without_touching_sources_or_claiming_resolution() {
    let (owned,api,root,id,reference,remote)=fixture();
    let project=id.split("::").next().unwrap();
    let base=git(&root,&["merge-base","HEAD",&remote],None);
    fs::write(root.join("LocalOnly.md"),b"Owned local addition").unwrap();
    git(&root,&["add","--","LocalOnly.md"],None);git(&root,&["commit","-m","Own addition"],None);
    let base_blob=git(&root,&["rev-parse",&format!("{base}:Review.md")],None);
    let binary=git(&root,&["hash-object","-w","--stdin"],Some(&[0,1,2,3]));
    let link=git(&root,&["hash-object","-w","--stdin"],Some(b"../outside.md"));
    let tree=git(&root,&["mktree"],Some(format!("100644 blob {base_blob}\tRemote.md\n100644 blob {binary}\tAsset.bin\n120000 blob {link}\tLink.md\n").as_bytes()));
    let renamed=git(&root,&["commit-tree",&tree,"-p",&base,"-m","Known remote rename"],None);
    git(&root,&["update-ref",&reference,&renamed],None);
    let head=git(&root,&["rev-parse","HEAD"],None);let index=fs::read(root.join(".git/index")).unwrap();let disk=fs::read(root.join("Review.md")).unwrap();
    let drafts=fs::read_dir(owned.path().join("state/drafts")).unwrap().map(|entry|{let path=entry.unwrap().path();(path.clone(),fs::read(path).unwrap())}).collect::<Vec<_>>();
    let route=format!("/api/projects/{project}/sync/remote-review");assert!(LocalApi::is_independent_snapshot("GET",&route));
    let review=request(&api,"GET",&route,Value::Null);
    assert_eq!(review["relation"],"diverged");assert_eq!(review["baseCommit"],base);assert_eq!(review["local"].as_array().unwrap().len(),2);
    let remote_changes=review["remote"].as_array().unwrap();assert_eq!(remote_changes.len(),3);
    let rename=remote_changes.iter().find(|item|item["path"]=="Remote.md").unwrap();assert_eq!(rename["change"],"renamed");assert_eq!(rename["previousPath"],"Review.md");assert_eq!(rename["overlap"],true);assert_eq!(rename["identical"],false);assert_eq!(rename["canOpen"],false);
    assert_eq!(remote_changes.iter().find(|item|item["path"]=="Asset.bin").unwrap()["kind"],"resource");
    assert_eq!(remote_changes.iter().find(|item|item["path"]=="Link.md").unwrap()["kind"],"unsupported");
    assert!(!review.to_string().contains("no-remote-service"));
    for resolution in ["keep-local","take-remote","save-local-copy-and-take-remote","manual-resolved"] {
        let response=api.handle("POST",&format!("/api/projects/{project}/sync/conflicts/{project}:history-diverged/resolve"),json!({"resolution":resolution}),vec![]).unwrap();
        assert_eq!(response.status,409);assert!(response.body.to_string().contains("No se ha fusionado"));
    }
    assert_eq!(git(&root,&["rev-parse","HEAD"],None),head);assert_eq!(git(&root,&["rev-parse",&reference],None),renamed);assert_eq!(fs::read(root.join(".git/index")).unwrap(),index);assert_eq!(fs::read(root.join("Review.md")).unwrap(),disk);
    for (path,bytes) in drafts {assert_eq!(fs::read(path).unwrap(),bytes);}
    git(&root,&["update-ref",&reference,&head],None);
    let current=request(&api,"GET",&route,Value::Null);assert_eq!(current["relation"],"up-to-date");assert_ne!(review["revision"],current["revision"]);assert_eq!(current["local"],json!([]));assert_eq!(current["remote"],json!([]));
}

#[test]
fn project_graph_review_rejects_nonportable_paths_without_mutating_head_index_or_documents(){
    let (_owned,api,root,id,reference,remote)=fixture();let project=id.split("::").next().unwrap();
    let base=git(&root,&["merge-base","HEAD",&remote],None);let blob=git(&root,&["hash-object","-w","--stdin"],Some(b"Owned remote bytes"));
    let tree=git(&root,&["mktree"],Some(format!("100644 blob {blob}\tCON.md\n").as_bytes()));
    let tip=git(&root,&["commit-tree",&tree,"-p",&base,"-m","Nonportable known path"],None);git(&root,&["update-ref",&reference,&tip],None);
    let index=fs::read(root.join(".git/index")).unwrap();let head=git(&root,&["rev-parse","HEAD"],None);let disk=fs::read(root.join("Review.md")).unwrap();
    assert!(api.handle("GET",&format!("/api/projects/{project}/sync/remote-review"),Value::Null,vec![]).is_err());
    assert_eq!(fs::read(root.join(".git/index")).unwrap(),index);assert_eq!(git(&root,&["rev-parse","HEAD"],None),head);assert_eq!(fs::read(root.join("Review.md")).unwrap(),disk);
}

#[test]
fn known_remote_review_prepares_only_a_draft_and_preserves_four_exact_versions() {
    let (owned, api, root, id, _, remote) = fixture();
    let route = format!("/api/documents/{id}/remote-conflict");
    assert!(LocalApi::is_independent_snapshot("GET", &route));
    let before_head = git(&root, &["rev-parse", "HEAD"], None);
    let before_index = fs::read(root.join(".git/index")).unwrap();
    let source = fs::read(root.join("Review.md")).unwrap();
    let review = request(&api, "GET", &route, Value::Null);
    assert_eq!(review["remoteSource"]["remoteCommit"], remote);
    assert_eq!(review["remoteSource"]["markdown"], "# Remote\n\nShared\n");
    assert_ne!(review["remoteSource"]["localCommit"], remote);
    assert!(!review.to_string().contains("no-remote-service"));
    let result = request(
        &api,
        "POST",
        &format!("/api/documents/{id}/conflict"),
        payload(&review),
    );
    assert_eq!(result["document"]["markdown"], "# Combined\n\nShared\n");
    assert_eq!(
        result["document"]["baseFingerprint"],
        review["diskFingerprint"]
    );
    assert_eq!(result["remoteSource"]["remoteCommit"], remote);
    assert_eq!(result["sourceUnchanged"], true);
    let copies = result["preservedCopies"].as_array().unwrap();
    assert_eq!(copies.len(), 4);
    let mut texts = vec![];
    for copy in copies {
        let folder = owned
            .path()
            .join("state/drafts-review")
            .join(copy.as_str().unwrap());
        let value: Value =
            serde_json::from_slice(&fs::read(folder.join("copy.json")).unwrap()).unwrap();
        texts.push(value["markdown"].as_str().unwrap().to_string());
        let manifest: Value =
            serde_json::from_slice(&fs::read(folder.join("manifest.json")).unwrap()).unwrap();
        assert_eq!(manifest["operationId"], result["id"]);
    }
    for expected in [
        "# My draft\n\nShared\n",
        "# Local\n\nShared\n",
        "# Combined\n\nShared\n",
        "# Remote\n\nShared\n",
    ] {
        assert!(texts.contains(&expected.into()));
    }
    assert_eq!(fs::read(root.join("Review.md")).unwrap(), source);
    assert_eq!(fs::read(root.join(".git/index")).unwrap(), before_index);
    assert_eq!(git(&root, &["rev-parse", "HEAD"], None), before_head);
}

#[test]
fn stale_remote_history_and_unsupported_objects_preserve_current_sources_and_draft() {
    let (owned, api, root, id, reference, remote) = fixture();
    let route = format!("/api/documents/{id}/remote-conflict");
    let review = request(&api, "GET", &route, Value::Null);
    let before = request(&api, "GET", &format!("/api/documents/{id}"), Value::Null);
    let head = git(&root, &["rev-parse", "HEAD"], None);
    let source = fs::read(root.join("Review.md")).unwrap();
    git(&root, &["update-ref", &reference, &head], None);
    assert!(api
        .handle(
            "POST",
            &format!("/api/documents/{id}/conflict"),
            payload(&review),
            vec![]
        )
        .is_err());
    assert!(!owned.path().join("state/drafts-review").exists());
    git(&root, &["update-ref", &reference, &remote], None);
    let mut forged = payload(&review);
    forged["remoteSource"]["revision"] = json!("foreign");
    assert!(api
        .handle(
            "POST",
            &format!("/api/documents/{id}/conflict"),
            forged,
            vec![]
        )
        .is_err());
    let base = git(&root, &["rev-parse", "HEAD^"], None);
    git(&root, &["update-ref", "HEAD", &base], None);
    assert!(api
        .handle(
            "POST",
            &format!("/api/documents/{id}/conflict"),
            payload(&review),
            vec![]
        )
        .is_err());
    git(&root, &["update-ref", "HEAD", &head], None);
    let objects = [
        ("120000", b"elsewhere".to_vec()),
        ("100644", vec![0xff]),
        ("100644", vec![0]),
        ("100644", vec![b'x'; 2 * 1024 * 1024 + 1]),
    ];
    for (mode, bytes) in objects {
        let blob = git(&root, &["hash-object", "-w", "--stdin"], Some(&bytes));
        let tree = git(
            &root,
            &["mktree"],
            Some(format!("{mode} blob {blob}\tReview.md\n").as_bytes()),
        );
        let commit = git(
            &root,
            &["commit-tree", &tree, "-p", &base, "-m", "Owned unsupported"],
            None,
        );
        git(&root, &["update-ref", &reference, &commit], None);
        assert!(api.handle("GET", &route, Value::Null, vec![]).is_err());
    }
    git(&root, &["update-ref", &reference, &remote], None);
    assert_eq!(
        request(&api, "GET", &format!("/api/documents/{id}"), Value::Null)["markdown"],
        before["markdown"]
    );
    assert_eq!(fs::read(root.join("Review.md")).unwrap(), source);
    assert_eq!(git(&root, &["rev-parse", "HEAD"], None), head);
}

#[test]
fn remote_document_names_are_literal_and_a_new_draft_invalidates_the_review() {
    let (_owned, api, root, id, reference, _) = fixture();
    let pid = id.split_once("::").unwrap().0;
    let special = format!("{pid}::[Review].md");
    fs::write(root.join("[Review].md"), "# Special local\n").unwrap();
    let blob = git(
        &root,
        &["hash-object", "-w", "--stdin"],
        Some(b"# Special remote\n"),
    );
    let tree = git(
        &root,
        &["mktree"],
        Some(format!("100644 blob {blob}\t[Review].md\n").as_bytes()),
    );
    let commit = git(
        &root,
        &["commit-tree", &tree, "-p", "HEAD", "-m", "Owned literal"],
        None,
    );
    git(&root, &["update-ref", &reference, &commit], None);
    let review = request(
        &api,
        "GET",
        &format!("/api/documents/{special}/remote-conflict"),
        Value::Null,
    );
    assert_eq!(review["remoteSource"]["markdown"], "# Special remote\n");
    request(
        &api,
        "PUT",
        &format!("/api/documents/{special}/draft"),
        json!({"markdown":"# New draft after review\n"}),
    );
    assert!(api
        .handle(
            "POST",
            &format!("/api/documents/{special}/conflict"),
            payload(&review),
            vec![]
        )
        .is_err());
    assert_eq!(
        fs::read_to_string(root.join("[Review].md")).unwrap(),
        "# Special local\n"
    );
    assert_eq!(
        request(
            &api,
            "GET",
            &format!("/api/documents/{special}"),
            Value::Null
        )["markdown"],
        "# New draft after review\n"
    );
}

fn renamed_remote(root: &Path, reference: &str, name: &str) -> String {
    let base = git(root, &["rev-list", "--max-parents=0", "HEAD"], None);
    let blob = git(
        root,
        &["hash-object", "-w", "--stdin"],
        Some(b"# Base\n\nShared\n"),
    );
    let tree = git(
        root,
        &["mktree"],
        Some(format!("100644 blob {blob}\t{name}\n").as_bytes()),
    );
    let remote = git(
        root,
        &[
            "commit-tree",
            &tree,
            "-p",
            &base,
            "-m",
            "Owned remote rename",
        ],
        None,
    );
    git(root, &["update-ref", reference, &remote], None);
    remote
}
#[test]
fn known_remote_rename_is_reviewed_without_renaming_or_overwriting_local_sources() {
    let (_owned, api, root, id, reference, _) = fixture();
    let remote = renamed_remote(&root, &reference, "Remote-renamed.md");
    let before = fs::read(root.join("Review.md")).unwrap();
    let head = git(&root, &["rev-parse", "HEAD"], None);
    let index = fs::read(root.join(".git/index")).unwrap();
    let route = format!("/api/documents/{id}/remote-conflict");
    let inspected = request(&api, "GET", &route, Value::Null);
    assert_eq!(inspected["remoteSource"]["sourcePath"], "Remote-renamed.md");
    assert_eq!(inspected["remotePathChanged"], true);
    assert_eq!(inspected["remoteSource"]["remoteCommit"], remote);
    let mut forged = payload(&inspected);
    forged["remoteSource"]["sourcePath"] = json!("other.md");
    assert!(api
        .handle(
            "POST",
            &format!("/api/documents/{id}/conflict"),
            forged,
            vec![]
        )
        .is_err());
    let result = request(
        &api,
        "POST",
        &format!("/api/documents/{id}/conflict"),
        payload(&inspected),
    );
    assert_eq!(result["preservedCopies"].as_array().unwrap().len(), 4);
    assert_eq!(result["remoteSource"]["sourcePath"], "Remote-renamed.md");
    assert_eq!(fs::read(root.join("Review.md")).unwrap(), before);
    assert!(!root.join("Remote-renamed.md").exists());
    assert_eq!(git(&root, &["rev-parse", "HEAD"], None), head);
    assert_eq!(fs::read(root.join(".git/index")).unwrap(), index);
}
#[test]
fn local_and_remote_renames_follow_a_common_ancestor_and_a_later_remote_name_invalidates_review() {
    let (_owned, api, root, id, reference, _) = fixture();
    git(&root, &["mv", "--", "Review.md", "Local-renamed.md"], None);
    git(&root, &["commit", "-m", "Owned local rename"], None);
    let local_id = format!("{}::Local-renamed.md", id.split_once("::").unwrap().0);
    request(
        &api,
        "PUT",
        &format!("/api/documents/{local_id}/draft"),
        json!({"markdown":"# My draft\n\nShared\n"}),
    );
    renamed_remote(&root, &reference, "Remote-renamed.md");
    let route = format!("/api/documents/{local_id}/remote-conflict");
    let inspected = request(&api, "GET", &route, Value::Null);
    assert_eq!(inspected["remoteSource"]["sourcePath"], "Remote-renamed.md");
    let before = fs::read(root.join("Local-renamed.md")).unwrap();
    renamed_remote(&root, &reference, "Remote-later.md");
    assert!(api
        .handle(
            "POST",
            &format!("/api/documents/{local_id}/conflict"),
            payload(&inspected),
            vec![]
        )
        .is_err());
    assert_eq!(fs::read(root.join("Local-renamed.md")).unwrap(), before);
    assert_eq!(
        request(&api, "GET", &route, Value::Null)["remoteSource"]["sourcePath"],
        "Remote-later.md"
    );
    // Only the local side renamed: the remote ancestor path remains the source.
    renamed_remote(&root, &reference, "Review.md");
    assert_eq!(
        request(&api, "GET", &route, Value::Null)["remoteSource"]["sourcePath"],
        "Review.md"
    );
}
