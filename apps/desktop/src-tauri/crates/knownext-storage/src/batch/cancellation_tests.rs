use super::*;
use std::{fs, sync::mpsc};
#[test]
fn stop_signal_bypasses_execution_and_keeps_completed_items_without_replay() {
    let owned = tempfile::tempdir().unwrap();
    let api = LocalApi::new(owned.path().join("state"), "qa".into(), "test".into());
    let p = api
        .handle(
            "POST",
            "/api/projects",
            json!({"name":"Owned stop","versioningMode":"none","syncMode":"none"}),
            vec![],
        )
        .unwrap()
        .body;
    let project = p["id"].as_str().unwrap().to_string();
    let root = PathBuf::from(p["folderPath"].as_str().unwrap());
    for name in ["A.md", "B.md", "C.md"] {
        fs::write(root.join(name), name).unwrap();
    }
    let review=api.prepare_batch(&project,json!({"action":"duplicate","nodeIds":[doc_id(&project,"A.md"),doc_id(&project,"B.md"),doc_id(&project,"C.md")]})).unwrap();
    let id = review["id"].as_str().unwrap().to_string();
    let queued_review=api.prepare_batch(&project,json!({"action":"duplicate","nodeIds":[doc_id(&project,"B.md"),doc_id(&project,"C.md")]})).unwrap();
    let queued_id = queued_review["id"].as_str().unwrap().to_string();
    assert_eq!(api.cancel_batch(&project, &id).unwrap()["requested"], false);
    let (entered, ready) = mpsc::channel();
    let (release, resume) = mpsc::channel();
    let worker = api.clone();
    let worker_project = project.clone();
    let worker_id = id.clone();
    let execution = std::thread::spawn(move || {
        worker.execute_batch_with(&worker_project, &worker_id, |i| {
            if i == 1 {
                entered.send(()).unwrap();
                resume.recv_timeout(Duration::from_secs(5)).unwrap();
            }
        })
    });
    ready.recv_timeout(Duration::from_secs(5)).unwrap();
    let queued_api = api.clone();
    let queued_project = project.clone();
    let queued_worker_id = queued_id.clone();
    let queued =
        std::thread::spawn(move || queued_api.execute_batch(&queued_project, &queued_worker_id));
    let started = std::time::Instant::now();
    while api.cancel_batch(&project, &queued_id).unwrap()["requested"] != true {
        assert!(
            started.elapsed() < Duration::from_secs(2),
            "queued execution was not observable"
        );
        std::thread::sleep(Duration::from_millis(1));
    }
    let path = format!("/api/projects/{project}/nodes/batch/{id}/cancel");
    assert!(LocalApi::is_independent_snapshot("POST", &path));
    let ack = api.handle("POST", &path, Value::Null, vec![]).unwrap();
    assert_eq!(ack.body["requested"], true);
    assert!(api.cancel_batch("another-project", &id).is_err());
    release.send(()).unwrap();
    let result = execution.join().unwrap().unwrap();
    let queued_result = queued.join().unwrap().unwrap();
    assert_eq!(queued_result["state"], "attention");
    assert!(queued_result["items"]
        .as_array()
        .unwrap()
        .iter()
        .all(|item| item["state"] == "pending"));
    assert_eq!(result["state"], "attention");
    assert_eq!(result["items"][0]["state"], "applied");
    assert_eq!(result["items"][1]["state"], "pending");
    assert_eq!(result["items"][2]["state"], "pending");
    assert!(result["error"].as_str().unwrap().contains("detenido"));
    assert_eq!(fs::read(root.join("A copia.md")).unwrap(), b"A.md");
    assert!(!root.join("B copia.md").exists());
    assert!(!root.join("C copia.md").exists());
    for name in ["A.md", "B.md", "C.md"] {
        assert_eq!(fs::read(root.join(name)).unwrap(), name.as_bytes());
    }
    assert_eq!(
        api.execute_batch(&project, &id).unwrap()["state"],
        "attention"
    );
    assert!(!root.join("A copia2.md").exists());
    assert_eq!(api.cancel_batch(&project, &id).unwrap()["requested"], false);
}
