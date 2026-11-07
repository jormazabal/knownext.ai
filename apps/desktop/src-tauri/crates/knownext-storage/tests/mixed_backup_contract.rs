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
fn full_backup_stages_zip_verifies_exact_output_and_carries_no_runtime_authority(){
 let f=mixed_fixture();let id="mixed-66666666666666666666666666666666";let route=selected(&f,id);let preview=request(&f.api,"POST",&format!("{route}/review"),Value::Null);request(&f.api,"POST",&route,json!({"revision":preview["revision"],"acknowledge":true}));let endpoint=format!("{route}/backup");let review=request(&f.api,"GET",&endpoint,Value::Null);assert_eq!(review["canDelete"],false);let revision=review["reviewRevision"].as_str().unwrap();let frozen=f.api.freeze_mixed_backup(&f.project,id,revision).unwrap();let destination=f._owned.path().join("variants.zip");f.api.write_system_recovery(&frozen,&destination).unwrap();assert!(f.api.write_system_recovery(&frozen,&destination).is_err());let cache=f._owned.path().join("cache");fs::create_dir(&cache).unwrap();let staged=frozen.stage(&cache).unwrap();assert_eq!(staged.content_type,"application/zip");assert_eq!(fs::read(&staged.path).unwrap(),fs::read(&destination).unwrap());assert_eq!(f.api.verify_mixed_backup(&f.project,id,revision,&destination).unwrap()["status"],"verified");
 let mut zip=zip::ZipArchive::new(fs::File::open(&destination).unwrap()).unwrap();let manifest:Value=serde_json::from_reader(zip.by_name("knownext-variants.json").unwrap()).unwrap();assert_eq!(manifest["format"],"knownext.variants");assert_eq!(manifest["stateIncluded"],false);assert_eq!(manifest["authorityIncluded"],false);assert_eq!(manifest["files"].as_array().unwrap().len(),4);let text=manifest.to_string();for field in ["localReference","origin","localCommit","planId","projectId","token","prompt"]{assert!(!text.contains(&format!("\"{field}\":")),"{field}");}use std::io::Read;let mut before=vec![];zip.by_name("Anterior/A.md").unwrap().read_to_end(&mut before).unwrap();assert_eq!(before,b"Local A");let mut after=vec![];zip.by_name("Elegida/A.md").unwrap().read_to_end(&mut after).unwrap();assert_eq!(after,b"Remote A");
 let project=request(&f.api,"POST","/api/projects",json!({"name":"Recovered archive data","versioningMode":"none","syncMode":"none"}));let recovered=PathBuf::from(project["folderPath"].as_str().unwrap());for(index,file)in manifest["files"].as_array().unwrap().iter().enumerate(){let name=file["path"].as_str().unwrap();assert!(!name.contains(".."));let output=recovered.join(name);fs::create_dir_all(output.parent().unwrap()).unwrap();let mut bytes=vec![];zip.by_name(name).unwrap().read_to_end(&mut bytes).unwrap();fs::write(&output,bytes).unwrap();assert!(index<4);}let doc=request(&f.api,"GET",&format!("/api/documents/{}::Anterior%2FA.md",project["id"].as_str().unwrap()),Value::Null);assert_eq!(doc["markdown"],"Local A");assert_eq!(fs::read(f.root.join("A.md")).unwrap(),b"Remote A");
 let mut corrupt=fs::read(&destination).unwrap();corrupt[40]^=1;let changed=f._owned.path().join("changed.zip");fs::write(&changed,&corrupt).unwrap();assert!(f.api.verify_mixed_backup(&f.project,id,revision,&changed).is_err());assert_eq!(fs::read(&changed).unwrap(),corrupt);assert!(f.api.freeze_mixed_backup(&f.project,id,&"0".repeat(64)).is_err());
}
