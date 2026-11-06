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
fn selected(f:&Fixture,id:&str)->String {let route=format!("/api/projects/{}/sync/mixed-selections",f.project);let overview=request(&f.api,"GET",&format!("/api/projects/{}/sync/remote-review",f.project),Value::Null);request(&f.api,"POST",&route,json!({"id":id,"revision":overview["revision"],"choices":[{"path":"A.md","choice":"remote"},{"path":"B.md","choice":"local"},{"path":"C.md","choice":"remote"}]}));format!("{route}/{id}/application")}

#[test]
fn closed_application_payloads_compact_expand_and_recover_without_touching_working_files_or_receipts(){
 use sha2::{Digest,Sha256};let f=mixed_fixture();let id="mixed-55555555555555555555555555555555";let route=selected(&f,id);let preview=request(&f.api,"POST",&format!("{route}/review"),Value::Null);request(&f.api,"POST",&route,json!({"revision":preview["revision"],"acknowledge":true}));let folder=f._owned.path().join("state/mixed-applications").join(format!("{:x}",Sha256::digest(f.project.as_bytes()))).join(id);
 // Synthetic private payload cohort: binary bytes, including NUL, with explicit updated proof.
 let file=folder.join("record.json");let mut record:Value=serde_json::from_slice(&fs::read(&file).unwrap()).unwrap();let mut original=vec![];for(index,row)in record["rows"].as_array_mut().unwrap().iter_mut().enumerate(){row["path"]=json!(format!("Assets/Proof{index}.bin"));for side in ["before","after"]{let path=folder.join(format!("{index:03}-{side}.bin"));let bytes=if side=="before"{b"owned binary\0before\n".repeat(2000)}else{b"owned binary\0after\n".repeat(2000)};row[side]["sha256"]=json!(format!("{:x}",Sha256::digest(&bytes)));row[side]["bytes"]=json!(bytes.len());fs::write(&path,&bytes).unwrap();original.push((path,bytes));}}let raw_record=serde_json::to_vec(&record).unwrap();fs::write(&file,&raw_record).unwrap();let completion=folder.join("completed.json");let mut marker:Value=serde_json::from_slice(&fs::read(&completion).unwrap()).unwrap();marker["recordSha256"]=json!(format!("{:x}",Sha256::digest(&raw_record)));let raw_marker=serde_json::to_vec(&marker).unwrap();fs::write(&completion,&raw_marker).unwrap();
 let before_index=fs::read(f.root.join(".git/index")).unwrap();let before_a=fs::read(f.root.join("A.md")).unwrap();let endpoint=format!("{route}/retention");let first=request(&f.api,"GET",&endpoint,Value::Null);assert_eq!(first["compactableCount"],4);let compact=request(&f.api,"POST",&endpoint,json!({"revision":first["revision"],"action":"compact","acknowledge":true}));assert_eq!(compact["expandableCount"],4);assert!(compact["storedBytes"].as_u64().unwrap()<first["storedBytes"].as_u64().unwrap());let observed=request(&f.api,"GET",&route,Value::Null);assert_eq!(observed["copiesPreserved"],true);
 let copied=request(&f.api,"POST",&format!("{route}/copy"),json!({"revision":observed["revision"],"path":"Assets/Proof0.bin","side":"before","name":"Binary-copy.bin"}));assert_eq!(copied["bytes"],original[0].1.len());assert_eq!(fs::read(f.root.join("Binary-copy.bin")).unwrap(),original[0].1);assert!(f.api.handle("POST",&endpoint,json!({"revision":first["revision"],"action":"expand","acknowledge":true}),vec![]).is_err());
 let expanded=request(&f.api,"POST",&endpoint,json!({"revision":compact["revision"],"action":"expand","acknowledge":true}));assert_eq!(expanded["expandableCount"],0);assert!(f.api.handle("POST",&endpoint,json!({"revision":first["revision"],"action":"compact","acknowledge":true}),vec![]).is_err());for(path,bytes)in &original{assert_eq!(fs::read(path).unwrap(),*bytes);assert!(!path.with_extension("bin.zip").exists());}
 let payload=&original[0].0;let permissions=fs::metadata(payload).unwrap().permissions();let mut readonly=permissions.clone();readonly.set_readonly(true);fs::set_permissions(payload,readonly).unwrap();let first=request(&f.api,"GET",&endpoint,Value::Null);let cut=f.api.handle("POST",&endpoint,json!({"revision":first["revision"],"action":"compact","acknowledge":true}),vec![]);fs::set_permissions(payload,permissions).unwrap();assert!(cut.is_err());assert!(payload.exists()&&payload.with_extension("bin.zip").exists());let packed=fs::read(payload.with_extension("bin.zip")).unwrap();let state=request(&f.api,"GET",&endpoint,Value::Null);assert_eq!(state["files"][0]["representation"],"both");assert_eq!(fs::read(payload).unwrap(),original[0].1);let current=request(&f.api,"GET",&route,Value::Null);assert_eq!(current["copiesPreserved"],true);
 fs::write(payload.with_extension("bin.zip"),b"owned-future-container").unwrap();assert!(f.api.handle("GET",&endpoint,Value::Null,vec![]).is_err());assert_eq!(fs::read(payload.with_extension("bin.zip")).unwrap(),b"owned-future-container");assert_eq!(fs::read(payload).unwrap(),original[0].1);fs::write(payload.with_extension("bin.zip"),packed).unwrap();let state=request(&f.api,"GET",&endpoint,Value::Null);request(&f.api,"POST",&endpoint,json!({"revision":state["revision"],"action":"expand","acknowledge":true}));
assert_eq!(fs::read(&file).unwrap(),raw_record);assert_eq!(fs::read(&completion).unwrap(),raw_marker);assert_eq!(fs::read(f.root.join(".git/index")).unwrap(),before_index);assert_eq!(fs::read(f.root.join("A.md")).unwrap(),before_a);
 let token=f._owned.path().join("state/retention-generations").join(format!("{:x}.json",Sha256::digest(format!("mixed/{}/{id}",f.project).as_bytes())));let mut future:Value=serde_json::from_slice(&fs::read(&token).unwrap()).unwrap();future["format"]=json!(99);let raw=serde_json::to_vec(&future).unwrap();fs::write(&token,&raw).unwrap();assert!(f.api.handle("GET",&endpoint,Value::Null,vec![]).is_err());assert_eq!(fs::read(&token).unwrap(),raw);assert_eq!(request(&f.api,"GET",&route,Value::Null)["copiesPreserved"],true);

}
