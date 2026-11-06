use knownext_storage::LocalApi;
use serde_json::{json, Value};
use std::fs;
#[test]
fn notes_and_activity_distinguish_missing_corrupt_future_and_foreign_owners_before_any_write() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().join("state");
    let api = LocalApi::new(root.clone(), "qa".into(), "test".into());
    let project = api
        .handle(
            "POST",
            "/api/projects",
            json!({"name":"Owned ancillary integrity","versioningMode":"none"}),
            vec![],
        )
        .unwrap()
        .body;
    let id = project["id"].as_str().unwrap();
    let route = format!("/api/projects/{id}/activity");
    let notes = root.join("notes.json");
    api.handle("GET", "/api/notes", Value::Null, vec![])
        .unwrap();
    assert!(!notes.exists());
    api.handle(
        "PUT",
        "/api/notes",
        json!({"markdown":"Owned original"}),
        vec![],
    )
    .unwrap();
    let original = fs::read(&notes).unwrap();
    assert!(api.handle("PUT", "/api/notes", json!({}), vec![]).is_err());
    assert_eq!(fs::read(&notes).unwrap(), original);
    for bytes in [
        b"{broken".as_slice(),
        br#"{"schemaVersion":99,"markdown":"Owned future"}"#,
    ] {
        fs::write(&notes, bytes).unwrap();
        assert!(api
            .handle("GET", "/api/notes", Value::Null, vec![])
            .is_err());
        assert!(api
            .handle(
                "PUT",
                "/api/notes",
                json!({"markdown":"Replacement"}),
                vec![]
            )
            .is_err());
        assert_eq!(fs::read(&notes).unwrap(), bytes);
    }
    api.handle("POST", &route, json!({"title":"Owned valid event"}), vec![])
        .unwrap();
    assert_eq!(
        api.handle("GET", &route, Value::Null, vec![]).unwrap().body["events"]
            .as_array()
            .unwrap()
            .len(),
        1
    );
    let safe_id: String = id
        .chars()
        .map(|ch| if ch.is_ascii_alphanumeric() { ch } else { '_' })
        .collect();
    let activity = root.join("activity").join(format!("{safe_id}.json"));
    fs::create_dir_all(activity.parent().unwrap()).unwrap();
    for value in [
        json!({"schemaVersion":99,"projectId":id,"events":[]}),
        json!({"projectId":"someone-else","events":[]}),
        json!({"projectId":id,"events":{}}),
    ] {
        let bytes = serde_json::to_vec(&value).unwrap();
        fs::write(&activity, &bytes).unwrap();
        assert!(api.handle("GET", &route, Value::Null, vec![]).is_err());
        assert!(api
            .handle("POST", &route, json!({"title":"Do not replace"}), vec![])
            .is_err());
        assert_eq!(fs::read(&activity).unwrap(), bytes);
    }
}
#[test]
fn incompatible_auth_and_device_state_never_exposes_secrets_or_deletes_stores_during_status_start_or_logout(
) {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().join("state");
    let api = LocalApi::new(root.clone(), "qa".into(), "test".into());
    let auth = root.join("auth.json");
    let device = root.join("github-device.json");
    let auth_bytes=serde_json::to_vec(&json!({"schemaVersion":99,"isAuthenticated":true,"scopes":[],"accessToken":"owned-secret-sentinel"})).unwrap();
    let device_bytes=serde_json::to_vec(&json!({"schemaVersion":99,"deviceCode":"owned-device-sentinel","interval":5,"expiresAtEpochSeconds":0})).unwrap();
    fs::write(&auth, &auth_bytes).unwrap();
    fs::write(&device, &device_bytes).unwrap();
    let status = api
        .handle("GET", "/api/auth/status", Value::Null, vec![])
        .unwrap()
        .body;
    assert_eq!(status["isAuthenticated"], false);
    assert!(status["storageError"].is_string());
    assert!(!status.to_string().contains("owned-secret-sentinel"));
    for action in ["start", "poll"] {
        let result = api
            .handle(
                "POST",
                &format!("/api/auth/github/device/{action}"),
                Value::Null,
                vec![],
            )
            .unwrap()
            .body;
        assert_eq!(result["status"], "error");
        assert_eq!(result["error"], status["storageError"]);
        assert_eq!(fs::read(&auth).unwrap(), auth_bytes);
        assert_eq!(fs::read(&device).unwrap(), device_bytes);
        assert!(!result.to_string().contains("owned-device-sentinel"));
    }
    assert!(api
        .handle("POST", "/api/auth/logout", Value::Null, vec![])
        .is_err());
    assert_eq!(fs::read(&auth).unwrap(), auth_bytes);
    assert_eq!(fs::read(&device).unwrap(), device_bytes);
    assert!(!root.join("credentials.json").exists());
}
