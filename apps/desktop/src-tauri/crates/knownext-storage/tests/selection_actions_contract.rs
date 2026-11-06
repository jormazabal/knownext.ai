use knownext_storage::LocalApi;
use serde_json::{json, Value};
use std::{fs, path::PathBuf};
fn setup() -> (tempfile::TempDir, LocalApi, String, PathBuf) {
    let temp = tempfile::tempdir().unwrap();
    let api = LocalApi::new(temp.path().join("state"), "qa".into(), "test".into());
    let p = api
        .handle(
            "POST",
            "/api/projects",
            json!({"name":"Own selection","versioningMode":"none","syncMode":"none"}),
            vec![],
        )
        .unwrap()
        .body;
    (
        temp,
        api,
        p["id"].as_str().unwrap().into(),
        PathBuf::from(p["folderPath"].as_str().unwrap()),
    )
}
fn plan(api: &LocalApi, p: &str, body: Value) -> Value {
    api.handle(
        "POST",
        &format!("/api/projects/{p}/nodes/batch/plan"),
        body,
        vec![],
    )
    .unwrap()
    .body
}
fn execute(api: &LocalApi, p: &str, review: &Value) -> Value {
    api.handle(
        "POST",
        &format!(
            "/api/projects/{p}/nodes/batch/{}/execute",
            review["id"].as_str().unwrap()
        ),
        Value::Null,
        vec![],
    )
    .unwrap()
    .body
}
#[test]
fn duplicate_mixed_scope_keeps_originals_chooses_reviewed_free_names_and_rejects_later_collisions()
{
    let (_t, api, p, root) = setup();
    fs::create_dir(root.join("Docs")).unwrap();
    fs::write(root.join("Docs/A.md"), b"# Own A\n").unwrap();
    fs::write(
        root.join("Ink.knote"),
        b"owned untouched unknown note bytes",
    )
    .unwrap();
    let body = json!({"action":"duplicate","nodeIds":[format!("{p}::Docs"),format!("{p}::Docs/A.md"),format!("{p}::Ink.knote")]});
    let review = plan(&api, &p, body.clone());
    assert_eq!(review["items"].as_array().unwrap().len(), 2);
    let done = execute(&api, &p, &review);
    assert_eq!(done["state"], "completed");
    assert_eq!(
        fs::read(root.join("Docs copia/A.md")).unwrap(),
        b"# Own A\n"
    );
    assert_eq!(
        fs::read(root.join("Ink copia.knote")).unwrap(),
        fs::read(root.join("Ink.knote")).unwrap()
    );
    assert_eq!(fs::read(root.join("Docs/A.md")).unwrap(), b"# Own A\n");
    let next = plan(&api, &p, body);
    let dest = next["items"][0]["destination"].as_str().unwrap();
    fs::create_dir(root.join(dest)).unwrap();
    assert!(api
        .handle(
            "POST",
            &format!(
                "/api/projects/{p}/nodes/batch/{}/execute",
                next["id"].as_str().unwrap()
            ),
            Value::Null,
            vec![]
        )
        .is_err());
    assert!(!root.join("Ink copia 2.knote").exists());
}
#[test]
fn renamed_group_preserves_pending_drafts_and_updates_its_links_only_after_all_moves() {
    let (_t, api, p, root) = setup();
    fs::write(root.join("A.md"), "# A\n[B](B.md)\n").unwrap();
    fs::write(root.join("B.md"), "# B\n[A](A.md)\n").unwrap();
    let a = format!("{p}::A.md");
    let b = format!("{p}::B.md");
    let record = api
        .handle("GET", &format!("/api/documents/{a}"), Value::Null, vec![])
        .unwrap()
        .body;
    api.handle(
        "PUT",
        &format!("/api/documents/{a}/draft"),
        json!({"markdown":"# Pending A\n[B](B.md)\n","baseFingerprint":record["baseFingerprint"]}),
        vec![],
    )
    .unwrap();
    let names = json!({a.clone():"A-new.md",b.clone():"B-new.md"});
    let review = plan(
        &api,
        &p,
        json!({"action":"rename","nodeIds":[a,b],"names":names}),
    );
    assert_eq!(execute(&api, &p, &review)["state"], "completed");
    assert!(!root.join("A.md").exists());
    assert!(fs::read_to_string(root.join("A-new.md"))
        .unwrap()
        .contains("B-new.md"));
    assert!(fs::read_to_string(root.join("B-new.md"))
        .unwrap()
        .contains("A-new.md"));
    let current = api
        .handle(
            "GET",
            &format!("/api/documents/{p}::A-new.md"),
            Value::Null,
            vec![],
        )
        .unwrap()
        .body;
    assert_eq!(current["hasDraft"], true);
    assert!(current["markdown"].as_str().unwrap().contains("Pending A"));
    assert_eq!(execute(&api, &p, &review)["state"], "completed");
}
#[test]
fn local_context_expands_visible_files_reports_empty_extraction_and_never_calls_a_provider() {
    let (t, api, p, root) = setup();
    fs::create_dir(root.join("Docs")).unwrap();
    fs::write(root.join("Docs/A.md"), "# Context\nOwn source\n").unwrap();
    fs::write(root.join("Docs/Empty.md"), "").unwrap();
    fs::write(root.join("Docs/.env"), "owned excluded private fixture").unwrap();
    let review = plan(
        &api,
        &p,
        json!({"action":"context","nodeIds":[format!("{p}::Docs")]}),
    );
    assert_eq!(review["items"].as_array().unwrap().len(), 2);
    let done = execute(&api, &p, &review);
    assert_eq!(done["state"], "attention");
    assert_eq!(done["items"][0]["state"], "applied");
    assert_eq!(done["items"][1]["state"], "attention");
    let sources = api
        .handle(
            "GET",
            &format!("/api/projects/{p}/ai/context/sources"),
            Value::Null,
            vec![],
        )
        .unwrap()
        .body;
    assert_eq!(sources["sources"].as_array().unwrap().len(), 1);
    assert!(!t.path().join("state/ai").exists());
    assert_eq!(
        fs::read_to_string(root.join("Docs/.env")).unwrap(),
        "owned excluded private fixture"
    );
}
#[test]
fn selected_export_keeps_only_selected_paths_and_originals() {
    let (_t, api, p, root) = setup();
    fs::create_dir(root.join("Docs")).unwrap();
    fs::write(root.join("Docs/A.md"), "# Selected\n").unwrap();
    fs::write(root.join("Unselected.md"), "Owned outside selection").unwrap();
    let started = api
        .handle(
            "POST",
            "/api/project-transfers",
            json!({"kind":"export","projectId":p,"nodeIds":[format!("{p}::Docs/A.md")]}),
            vec![],
        )
        .unwrap()
        .body;
    let prepared = api
        .prepare_project_transfer(started["id"].as_str().unwrap())
        .unwrap();
    assert_eq!(prepared["phase"], "ready");
    let files = prepared["manifest"]["files"].as_array().unwrap();
    assert_eq!(files.len(), 1);
    assert_eq!(files[0]["path"], "Docs/A.md");
    assert_eq!(
        fs::read_to_string(root.join("Unselected.md")).unwrap(),
        "Owned outside selection"
    );
    assert_eq!(
        fs::read_to_string(root.join("Docs/A.md")).unwrap(),
        "# Selected\n"
    );
}
