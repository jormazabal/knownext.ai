use knownext_storage::LocalApi;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{collections::BTreeMap, fs, path::Path};
fn snapshot(root: &Path) -> BTreeMap<String, String> {
    fn visit(base: &Path, path: &Path, rows: &mut BTreeMap<String, String>) {
        for entry in fs::read_dir(path).unwrap() {
            let entry = entry.unwrap();
            let path = entry.path();
            let meta = fs::symlink_metadata(&path).unwrap();
            assert!(!meta.file_type().is_symlink());
            if meta.is_dir() {
                visit(base, &path, rows)
            } else {
                rows.insert(
                    path.strip_prefix(base)
                        .unwrap()
                        .to_string_lossy()
                        .replace('\\', "/"),
                    format!("{:x}", Sha256::digest(if path.strip_prefix(base).unwrap()==Path::new(".knownext-runtime/owner.lock") {assert_eq!(meta.len(),0);Vec::new()}else{fs::read(path).unwrap()})),
                );
            }
        }
    }
    let mut rows = BTreeMap::new();
    visit(root, root, &mut rows);
    rows
}
#[test]
fn synthetic_26_upgrade_reopens_real_history_pending_markdown_and_ink_drafts_without_changing_their_bytes(
) {
    let temp = tempfile::tempdir().unwrap();
    let state = temp.path().join("state");
    let legacy = LocalApi::new(state.clone(), "2.6.0".into(), "test".into());
    let project=legacy.handle("POST","/api/projects",json!({"name":"Owned representative upgrade","versioningMode":"local-git","syncMode":"none"}),vec![]).unwrap().body;
    let owner = project["id"].as_str().unwrap();
    let root = Path::new(project["folderPath"].as_str().unwrap());
    let md_id = format!("{owner}::Document.md");
    let md_route = format!("/api/documents/{md_id}");
    let versions = format!("/api/projects/{owner}/versions");
    let first_text = "# Own document\n\nFirst version.\n";
    let disk_text = "# Own document\n\nSecond version.\n";
    let draft_text = "# Own document\n\nPending local work.\n";
    let mut commits = vec![];
    for text in [first_text, disk_text] {
        fs::write(root.join("Document.md"), text).unwrap();
        let response = legacy
            .handle(
                "POST",
                &versions,
                json!({"documentId":md_id,"title":"Own upgrade fixture"}),
                vec![],
            )
            .unwrap()
            .body;
        commits.push(response["version"]["id"].as_str().unwrap().to_string());
    }
    assert_ne!(commits[0], commits[1]);
    let md = legacy
        .handle("GET", &md_route, Value::Null, vec![])
        .unwrap()
        .body;
    legacy
        .handle(
            "PUT",
            &format!("{md_route}/draft"),
            json!({"markdown":draft_text,"baseFingerprint":md["baseFingerprint"]}),
            vec![],
        )
        .unwrap();
    let created = legacy
        .handle(
            "POST",
            &format!("/api/projects/{owner}/handwritten-notes"),
            json!({"name":"Ink.knote"}),
            vec![],
        )
        .unwrap()
        .body;
    let note_id = created["node"]["id"].as_str().unwrap();
    let note_route = format!("/api/handwritten-notes/{note_id}");
    let note = legacy
        .handle("GET", &note_route, Value::Null, vec![])
        .unwrap()
        .body;
    let mut ink = note["content"].clone();
    ink["pages"][0]["strokes"] = json!([{"id":"owned-pressure-tilt","tool":"pen","color":"#111827","width":2,"opacity":1,"points":[[10,20,0.7,0,45,-30],[30,40,0.8,10,46,-29]]}]);
    let saved = legacy
        .handle(
            "PUT",
            &note_route,
            json!({"content":ink,"baseFingerprint":note["baseFingerprint"]}),
            vec![],
        )
        .unwrap()
        .body;
    let mut pending_ink = saved["content"].clone();
    pending_ink["title"] = json!("Pending local ink");
    pending_ink["pages"][0]["strokes"][0]["points"][1] = json!([35, 45, 0.9, 12, 47, -28]);
    legacy
        .handle(
            "PUT",
            &format!("{note_route}/draft"),
            json!({"content":pending_ink,"baseFingerprint":saved["baseFingerprint"]}),
            vec![],
        )
        .unwrap();
    let mut registry: Value =
        serde_json::from_slice(&fs::read(state.join("projects.json")).unwrap()).unwrap();
    registry["schemaVersion"] = json!(1);
    fs::write(
        state.join("projects.json"),
        serde_json::to_vec_pretty(&registry).unwrap(),
    )
    .unwrap();
    let config = json!({"schemaVersion":2,"appearance":{"theme":"dark"},"layout":{"leftSidebarWidth":288},"customPreserved":"owned legacy preference"});
    fs::write(
        state.join("config.json"),
        serde_json::to_vec_pretty(&config).unwrap(),
    )
    .unwrap();
    let mut export = legacy
        .handle("GET", "/api/config/export-template", Value::Null, vec![])
        .unwrap()
        .body;
    export["schemaVersion"] = json!(1);
    export["normal"]["fontSizePt"] = json!(12);
    fs::write(
        state.join("export-template.json"),
        serde_json::to_vec_pretty(&export).unwrap(),
    )
    .unwrap();
    let core = ["config.json", "projects.json", "export-template.json"];
    let originals: Vec<_> = core
        .iter()
        .map(|name| fs::read(state.join(name)).unwrap())
        .collect();
    let sources = snapshot(root);
    let drafts = snapshot(&state.join("drafts"));
    let review = legacy
        .handle("GET", "/api/recovery/upgrade", Value::Null, vec![])
        .unwrap()
        .body;
    assert_eq!(review["canApply"], true);
    let applied = legacy
        .handle(
            "POST",
            "/api/recovery/upgrade",
            json!({"revision":review["revision"]}),
            vec![],
        )
        .unwrap()
        .body;
    assert_eq!(applied["status"], "completed");
    let migration = applied["id"].as_str().unwrap();
    assert_eq!(snapshot(root), sources);
    assert_eq!(snapshot(&state.join("drafts")), drafts);
    let current = LocalApi::new(state.clone(), "3.0.0".into(), "test".into());
    let reopened_md = current
        .handle("GET", &md_route, Value::Null, vec![])
        .unwrap()
        .body;
    assert_eq!(reopened_md["markdown"], draft_text);
    assert_eq!(reopened_md["hasDraft"], true);
    let reopened_note = current
        .handle("GET", &note_route, Value::Null, vec![])
        .unwrap()
        .body;
    assert_eq!(reopened_note["content"]["pages"], pending_ink["pages"]);
    assert_eq!(reopened_note["content"]["title"], "Pending local ink");
    assert_eq!(reopened_note["hasDraft"], true);
    let config = current
        .handle("GET", "/api/config", Value::Null, vec![])
        .unwrap()
        .body;
    assert_eq!(config["appearance"]["theme"], "dark");
    assert_eq!(config["layout"]["leftSidebarWidth"], 288);
    assert_eq!(config["customPreserved"], "owned legacy preference");
    assert_eq!(
        current
            .handle("GET", "/api/config/export-template", Value::Null, vec![])
            .unwrap()
            .body["normal"]["fontSizePt"],
        12
    );
    for (commit, text) in commits.iter().zip([first_text, disk_text]) {
        assert_eq!(
            current
                .handle(
                    "GET",
                    &format!("{md_route}/versions/{commit}/content"),
                    Value::Null,
                    vec![]
                )
                .unwrap()
                .body["markdown"],
            text
        );
    }
    assert_eq!(snapshot(root), sources);
    assert_eq!(snapshot(&state.join("drafts")), drafts);
    let again = current
        .handle("GET", "/api/recovery/upgrade", Value::Null, vec![])
        .unwrap()
        .body;
    assert_eq!(again["canApply"], false);
    assert_eq!(
        current
            .handle(
                "POST",
                "/api/recovery/upgrade",
                json!({"revision":again["revision"]}),
                vec![]
            )
            .unwrap()
            .body["status"],
        "unchanged"
    );
    let recovery_route = format!("/api/recovery/upgrades/{migration}");
    let recovery = current
        .handle("GET", &recovery_route, Value::Null, vec![])
        .unwrap()
        .body;
    assert_eq!(recovery["canRestore"], true);
    assert!(recovery["entries"]
        .as_array()
        .unwrap()
        .iter()
        .all(|entry| entry["backupVerified"] == true));
    assert_eq!(
        current
            .handle(
                "POST",
                &format!("{recovery_route}/restore"),
                json!({"revision":recovery["revision"]}),
                vec![]
            )
            .unwrap()
            .body["status"],
        "restored"
    );
    for (name, bytes) in core.iter().zip(originals) {
        assert_eq!(fs::read(state.join(name)).unwrap(), bytes);
    }
    assert_eq!(snapshot(root), sources);
    assert_eq!(snapshot(&state.join("drafts")), drafts);
}
