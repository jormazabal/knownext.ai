use knownext_storage::LocalApi;
use serde_json::{json, Value};
use std::{
    fs,
    path::{Path, PathBuf},
    process::Command,
};
fn git(root: &Path, args: &[&str]) -> Vec<u8> {
    let out = Command::new("git")
        .arg("-C")
        .arg(root)
        .args(args)
        .output()
        .unwrap();
    assert!(
        out.status.success(),
        "{}",
        String::from_utf8_lossy(&out.stderr)
    );
    out.stdout
}
fn call(api: &LocalApi, method: &str, path: &str, body: Value) -> Value {
    let r = api.handle(method, path, body, vec![]).unwrap();
    assert!(r.status < 400, "{}", r.body);
    r.body
}
fn payload(review: &Value) -> Value {
    json!({"revision":review["revision"],"decisions":review["items"].as_array().unwrap().iter().map(|item|json!({"itemId":item["id"],"decision":if item["risk"]=="blocked"{"omit"}else{"include"}})).collect::<Vec<_>>(),"syncRemote":false})
}
fn refused(api: &LocalApi, root: &Path, route: &str, request: Value) {
    let head = git(root, &["rev-parse", "HEAD"]);
    let index = fs::read(root.join(".git/index")).unwrap();
    assert!(api.handle("POST", route, request, vec![]).is_err());
    assert_eq!(git(root, &["rev-parse", "HEAD"]), head);
    assert_eq!(fs::read(root.join(".git/index")).unwrap(), index);
}
#[test]
fn reviewed_external_publication_binds_bytes_and_retains_unrelated_staging_and_live_files() {
    let owned = tempfile::tempdir().unwrap();
    let api = LocalApi::new(owned.path().join("state"), "qa".into(), "test".into());
    let p = call(
        &api,
        "POST",
        "/api/projects",
        json!({"name":"Owned external review","versioningMode":"local-git","syncMode":"none"}),
    );
    let id = p["id"].as_str().unwrap();
    let root = PathBuf::from(p["folderPath"].as_str().unwrap());
    git(&root, &["config", "user.name", "Owned QA"]);
    git(&root, &["config", "user.email", "owned@example.invalid"]);
    git(&root, &["config", "core.autocrlf", "false"]);
    fs::write(root.join("Base.md"), b"first\n").unwrap();
    fs::write(root.join("Baja.md"), b"delete\n").unwrap();
    fs::write(root.join("Preparado.md"), b"initial staging\n").unwrap();
    git(&root, &["add", "--all"]);
    git(&root, &["commit", "-m", "Owned baseline"]);
    fs::write(root.join("Preparado.md"), b"prepared elsewhere\n").unwrap();
    git(&root, &["add", "--", "Preparado.md"]);
    fs::write(root.join("Preparado.md"), b"later live staging edit\n").unwrap();
    fs::write(root.join("Base.md"), b"second\n").unwrap();
    fs::remove_file(root.join("Baja.md")).unwrap();
    fs::write(root.join("a b.md"), b"one\n").unwrap();
    fs::write(root.join("a-b.md"), b"two\n").unwrap();
    let unicode = "Cuaderno á → ejemplo.md";
    fs::write(root.join(unicode), b"unicode\r\nexact\r\n").unwrap();
    fs::write(root.join(".env"), b"owned private sentinel").unwrap();
    let get = format!("/api/projects/{id}/external-changes");
    let post = format!("{get}/import");
    let review = call(&api, "GET", &get, Value::Null);
    assert!(review["revision"].as_str().unwrap().len() == 64);
    let rows = review["items"].as_array().unwrap();
    let by = |path: &str| rows.iter().find(|r| r["path"] == path).unwrap();
    assert_ne!(by("a b.md")["id"], by("a-b.md")["id"]);
    assert_eq!(by(unicode)["path"], unicode);
    assert_eq!(by("Baja.md")["changeType"], "deleted");
    assert_eq!(by("Preparado.md")["risk"], "blocked");
    assert_eq!(by(".env")["risk"], "blocked");
    let request = payload(&review);
    let mut missing = request.clone();
    missing.as_object_mut().unwrap().remove("revision");
    refused(&api, &root, &post, missing);
    let mut duplicate = request.clone();
    duplicate["decisions"][0] = duplicate["decisions"][1].clone();
    refused(&api, &root, &post, duplicate);
    let mut forced = request.clone();
    let pos = rows.iter().position(|r| r["path"] == ".env").unwrap();
    forced["decisions"][pos]["decision"] = json!("include");
    refused(&api, &root, &post, forced);
    let mut unknown = request.clone();
    unknown["decisions"][0]["itemId"] = json!("unknown-reviewed-file");
    refused(&api, &root, &post, unknown);
    fs::write(root.join("Base.md"), b"third!\n").unwrap();
    refused(&api, &root, &post, request);
    assert_eq!(fs::read(root.join("Base.md")).unwrap(), b"third!\n");
    let current = call(&api, "GET", &get, Value::Null);
    assert_ne!(current["revision"], review["revision"]);
    assert_eq!(
        current["revision"],
        call(&api, "GET", &get, Value::Null)["revision"]
    );
    // Global CRLF conversion must not transform the captured bytes; hooks must not run.
    git(&root, &["config", "core.autocrlf", "true"]);
    let hooks = owned.path().join("hooks");
    fs::create_dir(&hooks).unwrap();
    fs::write(hooks.join("pre-commit"), "#!/bin/sh\nexit 97\n").unwrap();
    git(
        &root,
        &["config", "core.hooksPath", hooks.to_str().unwrap()],
    );
    let current = call(&api, "GET", &get, Value::Null);
    let result = call(&api, "POST", &post, payload(&current));
    assert_eq!(result["status"], "synced");
    assert_eq!(git(&root, &["show", "HEAD:Base.md"]), b"third!\n");
    assert_eq!(
        git(&root, &["show", &format!("HEAD:{unicode}")]),
        b"unicode\r\nexact\r\n"
    );
    assert_eq!(
        git(&root, &["show", ":Preparado.md"]),
        b"prepared elsewhere\n"
    );
    assert_eq!(
        git(&root, &["show", "HEAD:Preparado.md"]),
        b"initial staging\n"
    );
    assert_eq!(
        fs::read(root.join("Preparado.md")).unwrap(),
        b"later live staging edit\n"
    );
    assert_eq!(
        fs::read(root.join(".env")).unwrap(),
        b"owned private sentinel"
    );
    assert!(!root.join("Baja.md").exists());
    let changed = String::from_utf8(git(
        &root,
        &[
            "-c",
            "core.quotepath=false",
            "diff-tree",
            "--no-commit-id",
            "--name-only",
            "-r",
            "HEAD",
        ],
    ))
    .unwrap();
    for name in ["Base.md", "Baja.md", "a b.md", "a-b.md", unicode] {
        assert!(changed.lines().any(|line| line == name), "{changed}");
    }
    assert!(!changed.contains("Preparado.md"));
    assert!(!changed.contains(".env"));
    // Effective attributes cannot silently rewrite a reviewed document.
    fs::write(root.join(".gitattributes"), b"*.md text\n").unwrap();
    fs::write(root.join("Atributos.md"), b"leave intact\r\n").unwrap();
    let attrs = call(&api, "GET", &get, Value::Null);
    let mut req = payload(&attrs);
    for d in req["decisions"].as_array_mut().unwrap() {
        if d["itemId"]
            != attrs["items"]
                .as_array()
                .unwrap()
                .iter()
                .find(|r| r["path"] == "Atributos.md")
                .unwrap()["id"]
        {
            d["decision"] = json!("omit");
        }
    }
    refused(&api, &root, &post, req);
    assert_eq!(
        fs::read(root.join("Atributos.md")).unwrap(),
        b"leave intact\r\n"
    );
}
