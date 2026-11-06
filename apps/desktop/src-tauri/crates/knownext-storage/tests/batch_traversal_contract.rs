// Compile the exact owner module with small budgets; no duplicated traversal.
#[path = "../src/batch/fingerprint.rs"]
mod fingerprint;
use fingerprint::{fingerprint, fingerprint_with_budget, Budget, Limits};
use knownext_storage::LocalApi;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{fs, time::Duration};
#[test]
fn known_hashes_are_unchanged_and_entry_depth_byte_time_budgets_stop_without_writes() {
    let owned = tempfile::tempdir().unwrap();
    let path = owned.path().join("file.md");
    fs::write(&path, b"Known bytes").unwrap();
    let mut old = Sha256::new();
    old.update(b"file\0");
    old.update(11u64.to_le_bytes());
    old.update(b"Known bytes");
    assert_eq!(fingerprint(&path).unwrap(), format!("{:x}", old.finalize()));
    let limits = Limits {
        entries: 20,
        bytes: 100,
        depth: 2,
        duration: Duration::from_secs(30),
    };
    let mut budget = Budget::new(Limits {
        bytes: 15,
        ..limits
    });
    fingerprint_with_budget(&path, &mut budget).unwrap();
    assert!(fingerprint_with_budget(&path, &mut budget)
        .unwrap_err()
        .contains("bytes"));
    assert!(fingerprint_with_budget(
        &path,
        &mut Budget::new(Limits {
            duration: Duration::ZERO,
            ..limits
        })
    )
    .unwrap_err()
    .contains("tiempo"));
    let root = owned.path().join("folder");
    fs::create_dir_all(root.join("a/b/c")).unwrap();
    fs::write(root.join("one.md"), b"one").unwrap();
    fs::write(root.join("two.md"), b"two").unwrap();
    assert!(fingerprint_with_budget(&root, &mut Budget::new(limits))
        .unwrap_err()
        .contains("profundidad"));
    assert!(fingerprint_with_budget(
        &root,
        &mut Budget::new(Limits {
            entries: 2,
            depth: 20,
            ..limits
        })
    )
    .unwrap_err()
    .contains("entradas"));
    assert_eq!(fs::read(&path).unwrap(), b"Known bytes");
    assert_eq!(fs::read(root.join("one.md")).unwrap(), b"one");
}
#[test]
fn public_batch_review_rejects_deep_sources_without_creating_jobs_or_mutating_documents() {
    let owned = tempfile::tempdir().unwrap();
    let state = owned.path().join("state");
    let api = LocalApi::new(state.clone(), "qa".into(), "test".into());
    let project = api
        .handle(
            "POST",
            "/api/projects",
            json!({"name":"Owned bounded review","versioningMode":"none","syncMode":"none"}),
            vec![],
        )
        .unwrap()
        .body;
    let pid = project["id"].as_str().unwrap();
    let root = std::path::PathBuf::from(project["folderPath"].as_str().unwrap());
    let mut deep = root.join("Deep");
    for _ in 0..65 {
        deep = deep.join("d");
    }
    fs::create_dir_all(&deep).unwrap();
    fs::write(deep.join("source.md"), b"Source intact").unwrap();
    for action in ["trash", "duplicate", "context"] {
        let result = api.handle(
            "POST",
            &format!("/api/projects/{pid}/nodes/batch/plan"),
            json!({"action":action,"nodeIds":[format!("{pid}::Deep")]}),
            vec![],
        );
        assert!(result.is_err());
        assert_eq!(fs::read(deep.join("source.md")).unwrap(), b"Source intact");
        assert!(!state.join("file-batches").exists());
    }
    // Keep the oversized source intact outside this project's normal-tree scenario.
    // Leaving it here would correctly make the later refreshed tree unavailable.
    let parked = owned.path().join("parked-deep");
    assert!(root
        .join("Deep")
        .canonicalize()
        .unwrap()
        .starts_with(owned.path().canonicalize().unwrap()));
    assert!(parked.is_absolute() && parked.starts_with(owned.path()));
    fs::rename(root.join("Deep"), &parked).unwrap();
    assert_eq!(
        fs::read(
            parked
                .join(deep.strip_prefix(root.join("Deep")).unwrap())
                .join("source.md")
        )
        .unwrap(),
        b"Source intact"
    );
    // Normal review still produces the historical digest/plan format and can execute.
    fs::write(root.join("Normal.md"), b"Normal").unwrap();
    fs::create_dir(root.join("Folder")).unwrap();
    fs::write(root.join("Folder/Child.md"), b"Child").unwrap();
    let prepared = api
        .handle(
            "POST",
            &format!("/api/projects/{pid}/nodes/batch/plan"),
            json!({"action":"duplicate","nodeIds":[format!("{pid}::Normal.md"),format!("{pid}::Folder")]}),
            vec![],
        )
        .unwrap()
        .body;
    assert_eq!(prepared["schemaVersion"], 1);
    let mut hash = Sha256::new();
    hash.update(b"file\0");
    hash.update(6u64.to_le_bytes());
    hash.update(b"Normal");
    assert_eq!(
        prepared["items"]
            .as_array()
            .unwrap()
            .iter()
            .find(|item| item["path"] == "Normal.md")
            .unwrap()["fingerprint"],
        format!("{:x}", hash.finalize())
    );
    let id = prepared["id"].as_str().unwrap();
    let result = api
        .handle(
            "POST",
            &format!("/api/projects/{pid}/nodes/batch/{id}/execute"),
            Value::Null,
            vec![],
        )
        .unwrap()
        .body;
    assert_eq!(result["state"], "completed");
    assert_eq!(fs::read(root.join("Normal.md")).unwrap(), b"Normal");
    assert_eq!(fs::read(root.join("Normal copia.md")).unwrap(), b"Normal");
    assert_eq!(
        fs::read(root.join("Folder copia/Child.md")).unwrap(),
        b"Child"
    );
    assert_eq!(result["result"]["treeAvailable"], true);
    let job = state.join("file-batches").join(format!("{id}.json"));
    let saved = fs::read(&job).unwrap();
    let receipt: Value = serde_json::from_slice(&saved).unwrap();
    assert!(saved.len() < 16_000);
    assert_eq!(receipt["result"]["tree"], json!([]));
    for item in receipt["items"].as_array().unwrap() {
        assert_eq!(item["result"]["treeAvailable"], false);
        assert_eq!(item["result"]["tree"], json!([]));
        assert!(item["result"]["node"].get("children").is_none());
    }
    // Observation rebuilds the current view without rewriting receipts or replaying effects.
    fs::write(root.join("Later.md"), b"Later").unwrap();
    let reopened = LocalApi::new(state.clone(), "qa".into(), "test".into());
    let observed = reopened
        .handle(
            "GET",
            &format!("/api/projects/{pid}/nodes/batch/{id}"),
            Value::Null,
            vec![],
        )
        .unwrap()
        .body;
    assert!(observed["result"]["tree"]
        .as_array()
        .unwrap()
        .iter()
        .any(|node| node["name"] == "Later.md"));
    assert_eq!(fs::read(&job).unwrap(), saved);
    let repeated = reopened
        .handle(
            "POST",
            &format!("/api/projects/{pid}/nodes/batch/{id}/execute"),
            Value::Null,
            vec![],
        )
        .unwrap()
        .body;
    assert_eq!(observed, repeated);
    assert!(!root.join("Normal copia 2.md").exists());
    assert_eq!(fs::read(&job).unwrap(), saved);
}
