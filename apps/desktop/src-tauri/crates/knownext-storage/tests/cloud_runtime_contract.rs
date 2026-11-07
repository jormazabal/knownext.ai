use knownext_storage::{is_slow_runtime_work, runtime_resource, LocalApi};
use serde_json::json;

#[test]
fn cloud_capabilities_are_public_but_project_routes_require_registered_scope() {
    let dir = tempfile::tempdir().unwrap();
    let api = LocalApi::new(dir.path().to_path_buf(), "qa".into(), "test".into());
    let capabilities = api.handle("GET", "/api/cloud-sync/capabilities", json!(null), vec![]).unwrap();
    assert_eq!(capabilities.status, 200);
    assert!(capabilities.body["providers"].is_array());
    let proton = capabilities.body["providers"].as_array().unwrap().iter().find(|p|p["id"]=="proton-drive").unwrap();
    assert_eq!(proton["available"], false);
    assert_eq!(proton["confirmationLevel"], "remote-revision");
    assert_eq!(proton["canAuthenticate"], false);
    for suffix in ["", "/review", "/apply", "/cancel"] {
        let method = if suffix.is_empty() { "GET" } else { "POST" };
        let result = api.handle(method, &format!("/api/projects/missing/cloud-sync{suffix}"), json!({}), vec![]).unwrap();
        assert_eq!(result.status, 404);
    }
}

#[test]
fn cloud_review_runs_off_editor_mutex_without_exclusive_project_admission() {
    for action in ["review", "apply", "cancel"] {
        let path = format!("/api/projects/p1/cloud-sync/{action}");
        assert!(is_slow_runtime_work("POST", &path));
        let resource = runtime_resource("POST", &path).unwrap();
        assert!(!resource.exclusive_group);
        assert_ne!(resource.key, runtime_resource("POST", "/api/projects/p1/sync/push").unwrap().key);
    }
    assert!(!is_slow_runtime_work("GET", "/api/cloud-sync/capabilities"));
    assert!(is_slow_runtime_work("GET", "/api/projects/p1/cloud-sync"));
    for (method, suffix) in [("GET", ""), ("GET", "/inbox"), ("POST", "/publish"), ("POST", "/receive/apply")] {
        let path=format!("/api/projects/p1/proton-sync{suffix}");
        assert!(is_slow_runtime_work(method, &path));
        assert!(!runtime_resource(method, &path).unwrap().exclusive_group);
    }
}


#[test]
fn retired_folder_endpoints_preserve_project_and_do_not_create_sync_state() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().join("documents");
    let state = dir.path().join("state");
    let api = LocalApi::new(state.clone(), "qa".into(), "test".into());
    let project = api.handle("POST", "/api/projects", json!({"name":"Local","folderPath":root,"versioningMode":"none","syncMode":"none"}), vec![]).unwrap().body;
    let id = project["id"].as_str().unwrap();
    std::fs::write(root.join("original.md"), "Keep original").unwrap();
    for suffix in ["review", "connect", "publish", "receive/apply"] {
        let response = api.handle("POST", &format!("/api/projects/{id}/proton-sync/{suffix}"), json!({"folderPath":dir.path().join("exchange")}), vec![]).unwrap();
        assert_eq!(response.status, 409);
        assert_eq!(response.body["code"], "proton-folder-retired");
    }
    assert_eq!(std::fs::read_to_string(root.join("original.md")).unwrap(), "Keep original");
    assert!(!state.join("proton-sync").exists());
    assert!(!dir.path().join("exchange").exists());
    let status = api.handle("GET", &format!("/api/projects/{id}/proton-sync"), json!(null), vec![]).unwrap().body;
    assert_eq!(status["connected"], false);
}

#[test]
fn legacy_folder_state_remains_readable_and_pending_attempts_prevent_disconnect() {
    use sha2::{Digest, Sha256};
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().join("documents");
    let data = dir.path().join("state");
    let api = LocalApi::new(data.clone(), "qa".into(), "test".into());
    let project = api.handle("POST", "/api/projects", json!({"name":"Legacy","folderPath":root,"versioningMode":"none","syncMode":"none"}), vec![]).unwrap().body;
    let id = project["id"].as_str().unwrap();
    let private = data.join("proton-sync").join(format!("{:x}", Sha256::digest(id.as_bytes())));
    std::fs::create_dir_all(private.join("recovery")).unwrap();
    std::fs::create_dir_all(private.join("outbox")).unwrap();
    std::fs::write(private.join("recovery/copy.md"), "Previous content").unwrap();
    std::fs::write(private.join("outbox/copy.md"), "Pending content").unwrap();
    std::fs::write(root.join("original.md"), "Original").unwrap();
    let exchange = dir.path().join("legacy-exchange");
    std::fs::create_dir(&exchange).unwrap();
    let mut fixture = json!({"schemaVersion":1,"projectId":id,"generation":1,"binding":{"folderPath":exchange,"logicalProjectId":"logical","deviceId":"device","generation":1},"connectReview":null,"receiveReview":null,"publishAttempt":null,"receiveAttempt":null,"lastPublication":null,"causalPublication":null,"lastReceipt":null,"base":{},"basePublications":{},"remoteHeads":{},"seenPublications":[]});
    let route = format!("/api/projects/{id}/proton-sync");
    for field in ["receiveAttempt", "publishAttempt"] {
        fixture[field] = json!({"publicationId":"pending","status":"applying"});
        let bytes = serde_json::to_vec(&fixture).unwrap();
        std::fs::write(private.join("state.json"), &bytes).unwrap();
        let status = api.handle("GET", &route, json!(null), vec![]).unwrap().body;
        assert_eq!(status["connected"], true);
        let result = api.handle("POST", &format!("{route}/disconnect"), json!({"generation":1}), vec![]);
        assert!(result.is_err() || result.unwrap().status >= 400);
        assert_eq!(std::fs::read(private.join("state.json")).unwrap(), bytes);
        fixture[field] = json!(null);
    }
    std::fs::write(private.join("state.json"), serde_json::to_vec(&fixture).unwrap()).unwrap();
    let stale = api.handle("POST", &format!("{route}/disconnect"), json!({"generation":0}), vec![]);
    assert!(stale.is_err() || stale.unwrap().status >= 400);
    let result = api.handle("POST", &format!("{route}/disconnect"), json!({"generation":1}), vec![]).unwrap().body;
    assert_eq!(result["status"], "disconnected-local");
    assert_eq!(std::fs::read_to_string(root.join("original.md")).unwrap(), "Original");
    assert_eq!(std::fs::read_to_string(private.join("recovery/copy.md")).unwrap(), "Previous content");
    assert_eq!(std::fs::read_to_string(private.join("outbox/copy.md")).unwrap(), "Pending content");
}
