use knownext_storage::LocalApi;
use serde_json::{json, Value};
use std::{
    fs,
    path::PathBuf,
    sync::{Arc, Barrier},
};
fn call(api: &LocalApi, method: &str, path: &str, body: Value) -> Value {
    let result = api.handle(method, path, body, vec![]).unwrap();
    assert_eq!(result.status, 200, "{}", result.body);
    result.body
}
fn fixture() -> (tempfile::TempDir, LocalApi, String, PathBuf) {
    let owned = tempfile::tempdir().unwrap();
    let api = LocalApi::new(owned.path().join("state"), "qa".into(), "test".into());
    let project = call(
        &api,
        "POST",
        "/api/projects",
        json!({"name":"Owned legacy guard","versioningMode":"none","syncMode":"none"}),
    );
    let root = PathBuf::from(project["folderPath"].as_str().unwrap());
    let id = format!("{}::A.md", project["id"].as_str().unwrap());
    fs::write(root.join("A.md"), b"Disk").unwrap();
    (owned, api, id, root)
}
#[test]
fn unversioned_public_mutations_cannot_replace_save_discard_or_restore_an_existing_draft() {
    let (_owned, api, id, root) = fixture();
    let route = format!("/api/documents/{id}");
    let first = call(
        &api,
        "PUT",
        &format!("{route}/draft"),
        json!({"markdown":"Protected private draft"}),
    );
    for (method, suffix, body) in [
        ("PUT", "/draft", json!({"markdown":"Blind checkpoint"})),
        ("PUT", "", json!({"markdown":"Blind save","force":true})),
        ("DELETE", "/draft", json!({})),
        ("POST", "/draft/discard-and-read", json!({})),
        (
            "POST",
            "/versions/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/restore",
            json!({"baseFingerprint":{"sha256":"fake"}}),
        ),
    ] {
        let result = api
            .handle(method, &format!("{route}{suffix}"), body, vec![])
            .unwrap();
        assert_eq!(result.status, 428, "{}", result.body);
        assert_eq!(result.body["code"], "draft_revision_required");
        assert_eq!(result.body["operationOutcome"], "not-started");
        assert_eq!(
            call(&api, "GET", &route, Value::Null)["markdown"],
            "Protected private draft"
        );
        assert_eq!(fs::read(root.join("A.md")).unwrap(), b"Disk");
    }
    let updated = call(
        &api,
        "PUT",
        &format!("{route}/draft"),
        json!({"markdown":"Reviewed next edit","expectedDraftWriteRevision":first["draftWriteRevision"]}),
    );
    assert_ne!(updated["draftWriteRevision"], first["draftWriteRevision"]);
}
#[test]
fn simultaneous_unversioned_first_writes_admit_at_most_one_without_losing_the_winner() {
    let (_owned, api, id, root) = fixture();
    let api = Arc::new(api);
    let barrier = Arc::new(Barrier::new(3));
    let mut handles = vec![];
    for text in ["A".repeat(100_000), "B".repeat(100_000)] {
        let api = api.clone();
        let barrier = barrier.clone();
        let route = format!("/api/documents/{id}/draft");
        handles.push(std::thread::spawn(move || {
            barrier.wait();
            let result = api
                .handle("PUT", &route, json!({"markdown":text}), vec![])
                .unwrap();
            (text, result)
        }));
    }
    barrier.wait();
    let results = handles
        .into_iter()
        .map(|thread| thread.join().unwrap())
        .collect::<Vec<_>>();
    let successes = results
        .iter()
        .filter(|(_, result)| result.status == 200)
        .collect::<Vec<_>>();
    assert_eq!(successes.len(), 1);
    for (_, result) in &results {
        if result.status != 200 {
            assert!(matches!(result.status, 409 | 428));
            assert_eq!(result.body["operationOutcome"], "not-started");
        }
    }
    assert_eq!(
        call(&api, "GET", &format!("/api/documents/{id}"), Value::Null)["markdown"],
        successes[0].0
    );
    assert_eq!(fs::read(root.join("A.md")).unwrap(), b"Disk");
}
#[test]
fn unversioned_ink_mutations_keep_the_private_note_and_unreadable_state_fails_closed() {
    let (owned, api, id, root) = fixture();
    let project = id.split("::").next().unwrap();
    let created = call(
        &api,
        "POST",
        &format!("/api/projects/{project}/handwritten-notes"),
        json!({"name":"Note.knote"}),
    );
    let note = created["node"]["id"].as_str().unwrap();
    let route = format!("/api/handwritten-notes/{note}");
    let mut content = call(&api, "GET", &route, Value::Null)["content"].clone();
    content["title"] = json!("Private note title");
    let first = call(
        &api,
        "PUT",
        &format!("{route}/draft"),
        json!({"content":content}),
    );
    let disk = fs::read(root.join("Note.knote")).unwrap();
    for (method, suffix, body) in [
        ("PUT", "/draft", json!({"content":content})),
        ("PUT", "", json!({"content":content,"force":true})),
        ("DELETE", "/draft", json!({})),
        ("POST", "/draft/discard-and-read", json!({})),
    ] {
        let result = api
            .handle(method, &format!("{route}{suffix}"), body, vec![])
            .unwrap();
        assert_eq!(result.status, 428);
        assert_eq!(result.body["operationOutcome"], "not-started");
        assert_eq!(
            call(&api, "GET", &route, Value::Null)["draftWriteRevision"],
            first["draftWriteRevision"]
        );
        assert_eq!(fs::read(root.join("Note.knote")).unwrap(), disk);
    }
    // A malformed private state is not interpreted as absence for legacy requests.
    let drafts = owned.path().join("state/drafts");
    let file = fs::read_dir(&drafts)
        .unwrap()
        .map(Result::unwrap)
        .find(|entry| entry.path().extension().is_some_and(|ext| ext == "json"))
        .unwrap()
        .path();
    fs::write(&file, b"future or damaged private state").unwrap();
    let result = api
        .handle("DELETE", &format!("{route}/draft"), Value::Null, vec![])
        .unwrap();
    assert_eq!(result.status, 503);
    assert_eq!(result.body["operationOutcome"], "not-started");
    assert_eq!(fs::read(file).unwrap(), b"future or damaged private state");
}
