//! Isolated Rust dispatcher checks; no native UI, providers or user profile.
use knownext_storage::LocalApi;
use serde_json::{json, Value};

fn performance(api: &LocalApi) -> Value {
    let response = api
        .handle("GET", "/api/runtime/diagnostics", Value::Null, vec![])
        .unwrap();
    assert_eq!(response.status, 200);
    response.body["performance"].clone()
}

#[test]
fn runtime_performance_is_session_local_shared_by_clones_and_read_only_to_observe() {
    let owned = tempfile::tempdir().unwrap();
    let api = LocalApi::new(
        owned.path().into(),
        "qa".into(),
        "private-profile-canary".into(),
    );
    assert_eq!(performance(&api)["observedRequests"], 0);
    assert_eq!(
        api.handle("GET", "/health", Value::Null, vec![])
            .unwrap()
            .status,
        200
    );
    assert_eq!(
        api.clone()
            .handle("GET", "/health", Value::Null, vec![])
            .unwrap()
            .status,
        200
    );
    let first = performance(&api);
    assert_eq!(first["observedRequests"], 2);
    assert_eq!(first["classes"][0]["operationClass"], "runtime");
    assert_eq!(first["classes"][0]["count"], 2);
    assert_eq!(first, performance(&api));
    assert_eq!(first["readOnly"], true);
    assert_eq!(first["persistent"], false);
    assert_eq!(first["includesStartup"], false);
    assert_eq!(first["startsProvider"], false);
    assert!(!owned.path().join("logs").exists());
    let restarted = LocalApi::new(
        owned.path().into(),
        "qa".into(),
        "private-profile-canary".into(),
    );
    assert_eq!(performance(&restarted)["observedRequests"], 0);
}

#[test]
fn runtime_performance_counts_rejections_without_exporting_private_inputs_or_error_text() {
    let owned = tempfile::tempdir().unwrap();
    let api = LocalApi::new(
        owned.path().into(),
        "qa".into(),
        "private-profile-canary".into(),
    );
    let canary = "private-document-prompt-key-canary";
    let missing = api
        .handle(
            "GET",
            &format!("/{canary}?query={canary}"),
            json!({"prompt":canary}),
            vec![],
        )
        .unwrap();
    assert!(missing.status >= 400);
    let invalid = api.handle(
        "POST",
        "/api/projects",
        json!({"name":canary,"folderPath":"relative-private-canary","versioningMode":"none","syncMode":"none","secret":canary}),
        vec![],
    );
    assert!(invalid.is_err() || invalid.as_ref().unwrap().status >= 400);
    let report = api
        .handle("GET", "/api/runtime/diagnostics", Value::Null, vec![])
        .unwrap()
        .body;
    let metrics = &report["performance"];
    assert_eq!(metrics["observedRequests"], 2);
    assert_eq!(metrics["errorCount"], 2);
    assert_eq!(metrics["maximumClasses"], 11);
    assert!(!report.to_string().contains(canary));
    assert!(!report.to_string().contains("private-profile-canary"));
    assert!(!report
        .to_string()
        .contains(&owned.path().to_string_lossy().to_string()));
    assert!(report["events"].as_array().unwrap().is_empty());
}

#[test]
fn runtime_performance_concurrent_clones_retain_only_128_recent_samples_per_class() {
    let owned = tempfile::tempdir().unwrap();
    let api = LocalApi::new(owned.path().into(), "qa".into(), "test".into());
    let workers = (0..4)
        .map(|_| {
            let clone = api.clone();
            std::thread::spawn(move || {
                for _ in 0..40 {
                    assert_eq!(
                        clone
                            .handle("GET", "/health", Value::Null, vec![])
                            .unwrap()
                            .status,
                        200
                    );
                }
            })
        })
        .collect::<Vec<_>>();
    for worker in workers {
        worker.join().unwrap();
    }
    let metrics = performance(&api);
    assert_eq!(metrics["observedRequests"], 160);
    assert_eq!(metrics["errorCount"], 0);
    assert_eq!(metrics["classes"].as_array().unwrap().len(), 1);
    let class = &metrics["classes"][0];
    assert_eq!(class["recentSamples"], 128);
    assert!(
        class["p95RecentDurationUs"].as_u64().unwrap() <= class["maxDurationUs"].as_u64().unwrap()
    );
    assert!(class["maxDurationUs"].as_u64().unwrap() <= class["totalDurationUs"].as_u64().unwrap());
}
