use super::*;

fn limits(entries: usize) -> Limits {
    Limits {
        entries,
        duration: Duration::from_secs(10),
    }
}

#[test]
fn counts_logical_bytes_without_reading_content_or_changing_sources() {
    let root = tempfile::tempdir().unwrap();
    let examples = [
        ("projects/p/docs/a.md", 0),
        ("projects/p/.git/objects/item", 0),
        ("projects/p/.knownext-trash/t/a.md", 1),
        ("drafts/a.json", 1),
        ("migrations/owned/config.json.original", 1),
        ("recordings-dev/session/audio.wav", 2),
        ("ai-results/result.json", 3),
        ("document-templates/t.json", 4),
        ("project-transfers/p/staged.zip", 5),
        ("ai-index/p.json", 6),
        ("previews/view.json", 6),
        ("credentials.json", 7),
        ("unknown-future/data.bin", 8),
    ];
    let private = b"private-storage-sentinel";
    for (path, _) in examples {
        fs::create_dir_all(root.path().join(path).parent().unwrap()).unwrap();
        fs::write(root.path().join(path), private).unwrap();
    }
    let report = measure(root.path(), limits(1000)).unwrap();
    assert!(report.complete);
    assert_eq!(report.files, examples.len());
    assert_eq!(
        report.logical_bytes,
        (private.len() * examples.len()) as u64
    );
    for id in 0..9 {
        assert_eq!(
            report.groups[id].files,
            examples.iter().filter(|(_, group)| *group == id).count()
        );
    }
    assert!(!serde_json::to_string(&report)
        .unwrap()
        .contains("private-storage-sentinel"));
    for (path, _) in examples {
        assert_eq!(fs::read(root.path().join(path)).unwrap(), private);
    }
}

#[test]
fn entry_and_time_budgets_are_explicit_partial_results_not_empty_complete_usage() {
    let root = tempfile::tempdir().unwrap();
    for name in ["a", "b", "c"] {
        fs::write(root.path().join(name), b"12345").unwrap();
    }
    let report = measure(root.path(), limits(1)).unwrap();
    assert_eq!(report.files, 1);
    assert_eq!(report.logical_bytes, 5);
    assert_eq!(report.visited_entries, 1);
    assert!(report.limited && !report.complete);
    let report = measure(
        root.path(),
        Limits {
            entries: 100,
            duration: Duration::ZERO,
        },
    )
    .unwrap();
    assert!(report.limited && !report.complete);
    assert_eq!(report.files, 0);
    let file = root.path().join("a");
    assert!(measure(&file, limits(100)).is_err());
}

#[test]
fn native_read_route_is_independent_and_corrupt_catalogs_are_not_silently_empty_or_modified() {
    let root = tempfile::tempdir().unwrap();
    fs::write(root.path().join("config.json"), b"future-private").unwrap();
    fs::write(
        root.path().join("credentials.json"),
        b"secret-never-in-report",
    )
    .unwrap();
    fs::write(root.path().join("projects.json"), b"damaged registry").unwrap();
    let api = LocalApi::new(root.path().into(), "qa".into(), "test".into());
    let response = api
        .handle("GET", "/api/storage/usage", Value::Null, vec![])
        .unwrap();
    assert_eq!(response.status, 200);
    assert!(LocalApi::is_independent_snapshot(
        "GET",
        "/api/storage/usage?refresh=1"
    ));
    assert!(!LocalApi::is_independent_snapshot(
        "POST",
        "/api/storage/usage"
    ));
    assert_eq!(response.body["measurement"]["files"], 3);
    assert_eq!(response.body["locationsComplete"], false);
    assert_eq!(
        response.body["warnings"],
        json!(["project-registry-unavailable"])
    );
    assert_eq!(response.body["externalRootsMeasured"], false);
    assert_eq!(response.body["cleanupAvailable"], false);
    assert!(!response.body.to_string().contains("secret-never-in-report"));
    assert_eq!(
        fs::read(root.path().join("projects.json")).unwrap(),
        b"damaged registry"
    );
    assert_eq!(fs::read_dir(root.path()).unwrap().count(), 3);
}

#[test]
fn lists_external_locations_without_measuring_them_and_preserves_unreadable_retired_catalog() {
    let root = tempfile::tempdir().unwrap();
    let external = tempfile::tempdir().unwrap();
    fs::write(external.path().join("source.md"), vec![b'x'; 4096]).unwrap();
    let registry = json!({"schemaVersion":2,"activeProjectId":"p","projects":[{"id":"p","name":"External","folderPath":external.path().to_string_lossy()}]});
    fs::write(root.path().join("projects.json"), registry.to_string()).unwrap();
    let future = br#"{"schemaVersion":99,"entries":[]}"#;
    fs::write(root.path().join("retired-projects.json"), future).unwrap();
    let api = LocalApi::new(root.path().into(), "qa".into(), "test".into());
    let report = api.storage_usage().unwrap();
    assert_eq!(report["locations"][0]["id"], "p");
    assert_eq!(
        report["locations"][0]["folderPath"],
        external.path().to_string_lossy().as_ref()
    );
    assert_eq!(report["measurement"]["files"], 2);
    assert_eq!(report["warnings"], json!(["retired-catalog-unavailable"]));
    assert_eq!(report["locationsComplete"], false);
    assert_eq!(
        fs::read(root.path().join("retired-projects.json")).unwrap(),
        future
    );
    assert_eq!(
        fs::metadata(external.path().join("source.md"))
            .unwrap()
            .len(),
        4096
    );
}

#[cfg(unix)]
#[test]
fn skips_symlink_files_and_directories_and_rejects_an_aliased_store() {
    let root = tempfile::tempdir().unwrap();
    let external = tempfile::tempdir().unwrap();
    fs::write(external.path().join("private.md"), b"outside").unwrap();
    std::os::unix::fs::symlink(external.path(), root.path().join("alias")).unwrap();
    std::os::unix::fs::symlink(external.path().join("private.md"), root.path().join("file"))
        .unwrap();
    let report = measure(root.path(), limits(100)).unwrap();
    assert_eq!(report.files, 0);
    assert_eq!(report.skipped_links, 2);
    assert!(!report.complete);
    assert!(measure(&root.path().join("alias"), limits(100)).is_err());
}

#[test]
fn location_limit_is_explicit_and_does_not_visit_any_project_root() {
    let root = tempfile::tempdir().unwrap();
    let missing = root.path().join("never-created");
    let projects: Vec<_> = (0..257).map(|index| json!({"id":format!("p-{index}"),"name":format!("Project {index}"),"folderPath":missing.to_string_lossy()})).collect();
    fs::write(
        root.path().join("projects.json"),
        json!({"schemaVersion":2,"activeProjectId":"p-0","projects":projects}).to_string(),
    )
    .unwrap();
    let api = LocalApi::new(root.path().into(), "qa".into(), "test".into());
    let report = api.storage_usage().unwrap();
    assert_eq!(report["locations"].as_array().unwrap().len(), 256);
    assert_eq!(report["locationsComplete"], false);
    assert_eq!(report["warnings"], json!(["location-limit"]));
    assert!(!missing.exists());
    assert_eq!(fs::read_dir(root.path()).unwrap().count(), 1);
}

#[test]
fn retired_locations_remain_visible_without_recreating_a_missing_folder() {
    let root = tempfile::tempdir().unwrap();
    let missing = root.path().join("original-now-unavailable");
    let api = LocalApi::new(root.path().into(), "qa".into(), "test".into());
    let project =
        json!({"id":"p","name":"Retained project","folderPath":missing.to_string_lossy()});
    fs::write(
        root.path().join("projects.json"),
        json!({"schemaVersion":2,"activeProjectId":"p","projects":[project]}).to_string(),
    )
    .unwrap();
    api.retire_project("p").unwrap();
    let catalog_before = fs::read(root.path().join("retired-projects.json")).unwrap();
    let report = api.storage_usage().unwrap();
    assert_eq!(report["locations"][0]["state"], "retired");
    assert_eq!(report["locationsComplete"], true);
    assert_eq!(report["measurement"]["files"], 2);
    assert!(!missing.exists());
    assert_eq!(
        fs::read(root.path().join("retired-projects.json")).unwrap(),
        catalog_before
    );
}

#[cfg(windows)]
#[test]
fn skips_a_real_windows_junction_and_rejects_it_as_the_store_root() {
    let root = tempfile::tempdir().unwrap();
    let target = tempfile::tempdir().unwrap();
    fs::write(target.path().join("original.md"), b"original preserved").unwrap();
    let junction = root.path().join("outside-junction");
    let output = Command::new("cmd")
        .args(["/C", "mklink", "/J"])
        .arg(&junction)
        .arg(target.path())
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "Could not create the isolated QA junction"
    );
    let result = measure(root.path(), limits(100));
    let alias_rejected = measure(&junction, limits(100)).is_err();
    // Unlink only the owned junction; the target remains independent.
    fs::remove_dir(&junction).unwrap();
    let report = result.unwrap();
    assert_eq!(report.skipped_links, 1);
    assert_eq!(report.files, 0);
    assert!(!report.complete);
    assert!(alias_rejected);
    assert_eq!(
        fs::read(target.path().join("original.md")).unwrap(),
        b"original preserved"
    );
}
