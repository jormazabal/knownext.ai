use knownext_storage::{is_portable_history_work, LocalApi};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    fs,
    path::{Path, PathBuf},
    process::Command,
};
fn git(root: &Path, args: &[&str]) -> String {
    let output = Command::new("git")
        .arg("-C")
        .arg(root)
        .args([
            "-c",
            "core.hooksPath=",
            "-c",
            "user.name=Owned QA",
            "-c",
            "user.email=qa@knownext.local",
            "-c",
            "core.autocrlf=false",
        ])
        .args(args)
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    String::from_utf8(output.stdout).unwrap().trim().into()
}
fn call(api: &LocalApi, method: &str, path: &str, body: Value) -> Value {
    let result = api.handle(method, path, body, vec![]).unwrap();
    assert_eq!(result.status, 200, "{}", result.body);
    result.body
}
fn failure(api: &LocalApi, method: &str, path: &str, body: Value) {
    let result = api.handle(method, path, body, vec![]);
    assert!(result.is_err() || result.unwrap().status >= 400);
}
fn fixture() -> (tempfile::TempDir, LocalApi, String, PathBuf, String, String) {
    let owned = tempfile::tempdir().unwrap();
    let source = owned.path().join("source");
    fs::create_dir(&source).unwrap();
    git(
        &source,
        &["init", "--template=", "-b", "source-private-name"],
    );
    fs::write(source.join("Acta.md"), "Primera versión\n").unwrap();
    git(&source, &["add", "Acta.md"]);
    git(&source, &["commit", "-m", "Primera entrega"]);
    let first = git(&source, &["rev-parse", "HEAD"]);
    fs::write(source.join("Acta.md"), "Segunda versión\n").unwrap();
    git(&source, &["add", "Acta.md"]);
    git(&source, &["commit", "-m", "Segunda entrega"]);
    let second = git(&source, &["rev-parse", "HEAD"]);
    git(&source, &["branch", "private-old-point", &first]);
    git(
        &source,
        &[
            "remote",
            "add",
            "origin",
            "https://invalid.example/never-contact",
        ],
    );
    let bundle = owned.path().join("history.bundle");
    git(
        &source,
        &["bundle", "create", bundle.to_str().unwrap(), "--all"],
    );
    let raw = fs::read(bundle).unwrap();
    let sha = format!("{:x}", Sha256::digest(&raw));
    let api = LocalApi::new(owned.path().join("state"), "qa".into(), "test".into());
    let project = call(
        &api,
        "POST",
        "/api/projects",
        json!({"name":"Receptor","versioningMode":"none","syncMode":"none"}),
    );
    let p = project["id"].as_str().unwrap().into();
    let root = PathBuf::from(project["folderPath"].as_str().unwrap());
    fs::write(
        root.join("Acta.md"),
        "Trabajo guardado posterior al traslado\n",
    )
    .unwrap();
    fs::create_dir_all(root.join("Archivo KnowNext/Historial")).unwrap();
    fs::write(root.join("Archivo KnowNext/Historial/Parte-1.bin"), &raw).unwrap();
    let index = json!({"format":"knownext.project-archive","schemaVersion":1,"dataOnly":true,"items":[{"kind":"history","bundle":{"bytes":raw.len(),"sha256":sha,"parts":[{"path":"Historial/Parte-1.bin","payloadBytes":raw.len(),"skipBytes":0}]},"reachableHistoryOnly":true,"active":false}]});
    fs::write(
        root.join("Archivo KnowNext/Inventario.json"),
        serde_json::to_vec(&index).unwrap(),
    )
    .unwrap();
    (owned, api, p, root, first, second)
}
fn review(api: &LocalApi, p: &str) -> Value {
    let catalog = call(
        api,
        "GET",
        &format!("/api/projects/{p}/portable-history"),
        Value::Null,
    );
    call(
        api,
        "POST",
        &format!(
            "/api/projects/{p}/portable-history/{}/review",
            catalog["items"][0]["id"].as_str().unwrap()
        ),
        json!({"catalogRevision":catalog["revision"]}),
    )
}
#[test]
fn adopted_history_is_consultable_without_checkout_settings_network_or_replacing_drafts_and_keeps_all_source_tips(
) {
    assert!(is_portable_history_work(
        "POST",
        "/api/projects/p/portable-history/e/adopt"
    ));
    assert!(is_portable_history_work(
        "POST",
        "/api/projects/p/portable-history/e/review"
    ));
    assert!(LocalApi::is_independent_snapshot(
        "POST",
        "/api/projects/p/portable-history/e/review"
    ));
    let (owned, api, p, root, first, second) = fixture();
    let before = fs::read(root.join("Acta.md")).unwrap();
    let registry = fs::read(owned.path().join("state/projects.json")).unwrap();
    let drafts = owned.path().join("state/drafts");
    fs::create_dir_all(&drafts).unwrap();
    fs::write(drafts.join("opaque.json"), b"future-draft-sentinel").unwrap();
    let index = fs::read(root.join("Archivo KnowNext/Inventario.json")).unwrap();
    let payload = fs::read(root.join("Archivo KnowNext/Historial/Parte-1.bin")).unwrap();
    let reviewed = review(&api, &p);
    assert_eq!(reviewed["canAdopt"], true);
    assert_eq!(reviewed["tips"].as_array().unwrap().len(), 2);
    assert!(!reviewed.to_string().contains("source-private-name"));
    assert!(!root.join(".git").exists());
    let route = format!(
        "/api/projects/{p}/portable-history/{}/adopt",
        reviewed["entryId"].as_str().unwrap()
    );
    let request = json!({"revision":reviewed["revision"],"tip":second,"acknowledge":true});
    let result = call(&api, "POST", &route, request.clone());
    assert_eq!(result["status"], "adopted");
    assert_eq!(git(&root, &["rev-parse", "HEAD"]), second);
    assert_eq!(
        git(&root, &["show", &format!("{first}:Acta.md")]),
        "Primera versión"
    );
    assert_eq!(
        git(&root, &["show", &format!("{second}:Acta.md")]),
        "Segunda versión"
    );
    assert!(git(&root, &["remote"]).is_empty());
    assert!(git(&root, &["status", "--porcelain", "--", "Archivo KnowNext"]).is_empty());
    assert_eq!(fs::read(root.join("Acta.md")).unwrap(), before);
    assert_eq!(
        fs::read(drafts.join("opaque.json")).unwrap(),
        b"future-draft-sentinel"
    );
    assert_eq!(
        fs::read(owned.path().join("state/projects.json")).unwrap(),
        registry
    );
    assert_eq!(
        fs::read(root.join("Archivo KnowNext/Inventario.json")).unwrap(),
        index
    );
    assert_eq!(
        fs::read(root.join("Archivo KnowNext/Historial/Parte-1.bin")).unwrap(),
        payload
    );
    let versions = call(
        &api,
        "GET",
        &format!("/api/documents/{p}::Acta.md/versions"),
        Value::Null,
    );
    assert_eq!(versions.as_array().unwrap().len(), 2, "{versions}");
    let capability = call(
        &api,
        "GET",
        &format!("/api/documents/{p}::Acta.md/history"),
        Value::Null,
    );
    assert_eq!(capability["history"]["status"], "ready");
    assert_eq!(capability["history"]["recordingEnabled"], false);
    let storage = call(&api, "GET", "/api/recovery/storage", Value::Null);
    let prepared = storage["items"]
        .as_array()
        .unwrap()
        .iter()
        .find(|row| row["family"] == "project-history-import")
        .unwrap();
    assert_eq!(prepared["projectId"], p);
    assert!(prepared["bytes"].as_u64().unwrap() > 0);
    assert_eq!(prepared["canReviewKnownBytes"], false);
    assert!(!root.join(".knownext-history-import/repository").exists());
    let after = review(&api, &p);
    assert_eq!(after["nativeState"], "occupied");
    assert_eq!(after["canAdopt"], false);
    failure(&api, "POST", &route, request);
    assert_eq!(git(&root, &["rev-parse", "HEAD"]), second);
}
#[test]
fn existing_future_history_corrupt_parts_changed_index_and_unconfirmed_choice_preserve_both_sides()
{
    let (_owned, api, p, root, _first, second) = fixture();
    let reviewed = review(&api, &p);
    let route = format!(
        "/api/projects/{p}/portable-history/{}/adopt",
        reviewed["entryId"].as_str().unwrap()
    );
    failure(
        &api,
        "POST",
        &route,
        json!({"revision":reviewed["revision"],"tip":second,"acknowledge":false}),
    );
    failure(
        &api,
        "POST",
        &route,
        json!({"revision":reviewed["revision"],"tip":"a".repeat(40),"acknowledge":true}),
    );
    assert!(!root.join(".git").exists());
    let part = root.join("Archivo KnowNext/Historial/Parte-1.bin");
    let original = fs::read(&part).unwrap();
    let mut corrupt = original.clone();
    corrupt[0] ^= 1;
    fs::write(&part, &corrupt).unwrap();
    failure(
        &api,
        "POST",
        &route,
        json!({"revision":reviewed["revision"],"tip":second,"acknowledge":true}),
    );
    assert_eq!(fs::read(&part).unwrap(), corrupt);
    assert!(!root.join(".git").exists());
    fs::write(&part, &original).unwrap();
    fs::create_dir(root.join(".knownext-history-import")).unwrap();
    fs::write(
        root.join(".knownext-history-import/future.json"),
        b"future-preparation",
    )
    .unwrap();
    failure(
        &api,
        "POST",
        &route,
        json!({"revision":reviewed["revision"],"tip":second,"acknowledge":true}),
    );
    assert!(!root.join(".git").exists());
    assert_eq!(
        fs::read(root.join(".knownext-history-import/future.json")).unwrap(),
        b"future-preparation"
    );
    fs::create_dir(root.join(".git")).unwrap();
    fs::write(root.join(".git/future.json"), b"future-native-sentinel").unwrap();
    failure(
        &api,
        "POST",
        &route,
        json!({"revision":reviewed["revision"],"tip":second,"acknowledge":true}),
    );
    assert_eq!(
        fs::read(root.join(".git/future.json")).unwrap(),
        b"future-native-sentinel"
    );
    let index = root.join("Archivo KnowNext/Inventario.json");
    fs::write(&index,b"{\"format\":\"knownext.project-archive\",\"schemaVersion\":99,\"dataOnly\":true,\"items\":[]}").unwrap();
    let future = fs::read(&index).unwrap();
    failure(
        &api,
        "GET",
        &format!("/api/projects/{p}/portable-history"),
        Value::Null,
    );
    assert_eq!(fs::read(&index).unwrap(), future);
    assert_eq!(fs::read(&part).unwrap(), original);
}
