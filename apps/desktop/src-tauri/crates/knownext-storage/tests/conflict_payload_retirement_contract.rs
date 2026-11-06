use knownext_storage::LocalApi;
use serde_json::{json, Value};
use std::{fs, io::Read, path::PathBuf};
fn call(api: &LocalApi, method: &str, path: &str, body: Value) -> Value {
    let r = api.handle(method, path, body, vec![]).unwrap();
    assert!(r.status < 400, "{}", r.body);
    r.body
}
#[test]
fn lifecycle_complete_conflict_backup_covers_raw_bytes_and_partial_retirement_never_replays_the_attempt() {
    let owned = tempfile::tempdir().unwrap();
    let state = owned.path().join("state");
    let api = LocalApi::new(state.clone(), "qa".into(), "test".into());
    let p = call(
        &api,
        "POST",
        "/api/projects",
        json!({"name":"Owned retirement","versioningMode":"none","syncMode":"none"}),
    );
    let project = p["id"].as_str().unwrap();
    let root = PathBuf::from(p["folderPath"].as_str().unwrap());
    let d = call(
        &api,
        "POST",
        &format!("/api/projects/{project}/documents"),
        json!({"name":"Plan.md","markdown":"Disk\n"}),
    );
    let doc = d["node"]["id"].as_str().unwrap();
    let route = format!("/api/documents/{doc}/conflict");
    let review = call(&api, "GET", &route, Value::Null);
    let id = "attempt-owned-retirement-one";
    let request = json!({"attemptId":id,"locationRevision":review["locationRevision"],"diskFingerprint":review["diskFingerprint"],"draftRevision":review["draftRevision"],"localMarkdown":"Local\n","mergedMarkdown":"Local\nDisk\n"});
    let merged = call(&api, "POST", &route, request.clone());
    let before = call(&api, "GET", &format!("/api/documents/{doc}"), Value::Null);
    let receipt = state.join("conflict-attempts").join(format!("{id}.json"));
    let lookup = format!("/api/recovery/conflict-attempts/{id}");
    let detail = call(&api, "GET", &lookup, Value::Null);
    call(
        &api,
        "POST",
        &format!("{lookup}/archive-state"),
        json!({"revision":detail["receipt"]["revision"],"action":"archive"}),
    );
    let receipt_bytes = fs::read(&receipt).unwrap();
    let endpoint = format!("{lookup}/payloads");
    let initial = call(&api, "GET", &endpoint, Value::Null);
    assert_eq!(initial["phase"], "available");
    let frozen = api
        .freeze_conflict_payload_backup(id, initial["revision"].as_str().unwrap())
        .unwrap();
    let zip = owned.path().join("complete.zip");
    api.write_system_recovery(&frozen, &zip).unwrap();
    let backup = fs::read(&zip).unwrap();
    let mut archive = zip::ZipArchive::new(std::io::Cursor::new(&backup)).unwrap();
    assert!(archive.by_name("Documentos.zip").is_ok());
    let keys = merged["preservedCopies"].as_array().unwrap();
    let mut original = vec![];
    let mut manifests = vec![];
    for (index, key) in keys.iter().enumerate() {
        let folder = state.join("drafts-review").join(key.as_str().unwrap());
        let raw = fs::read(folder.join("copy.json")).unwrap();
        let manifest = fs::read(folder.join("manifest.json")).unwrap();
        let mut bytes = vec![];
        archive
            .by_name(&format!("Copias/{index}/Contenido.json"))
            .unwrap()
            .read_to_end(&mut bytes)
            .unwrap();
        assert_eq!(bytes, raw);
        original.push(folder.join("copy.json"));
        manifests.push((folder.join("manifest.json"), manifest));
    }
    drop(archive);
    let wrong = owned.path().join("wrong.zip");
    fs::write(&wrong, b"wrong archive").unwrap();
    assert!(api
        .retire_conflict_payloads(id, initial["revision"].as_str().unwrap(), true, &wrong)
        .is_err());
    assert!(!state.join("conflict-retirements").exists());
    assert!(api
        .retire_conflict_payloads(id, initial["revision"].as_str().unwrap(), false, &zip)
        .is_err());
    let last = original.last().unwrap();
    let permissions = fs::metadata(last).unwrap().permissions();
    let mut readonly = permissions.clone();
    readonly.set_readonly(true);
    fs::set_permissions(last, readonly).unwrap();
    let result =
        api.retire_conflict_payloads(id, initial["revision"].as_str().unwrap(), true, &zip);
    fs::set_permissions(last, permissions).unwrap();
    assert!(result.is_err());
    assert!(!original[0].exists());
    assert!(last.exists());
    let partial = call(&api, "GET", &endpoint, Value::Null);
    assert_eq!(partial["phase"], "retiring");
    assert_eq!(partial["remainingFiles"], 1);
    assert_eq!(partial["canExport"], false);
    assert!(api
        .retire_conflict_payloads(id, initial["revision"].as_str().unwrap(), true, &zip)
        .is_err());
    assert!(last.exists());
    let recovered = call(&api, "GET", &lookup, Value::Null);
    assert_eq!(recovered["payloadRetirement"]["phase"], "retiring");
    assert_eq!(recovered["canReplay"], false);
    assert!(api
        .handle(
            "POST",
            &format!("{lookup}/archive-state"),
            json!({"revision":recovered["receipt"]["revision"],"action":"reopen"}),
            vec![]
        )
        .is_err());
    assert!(api
        .handle(
            "POST",
            &format!("{lookup}/retention"),
            json!({"revision":"a".repeat(64),"action":"compact"}),
            vec![]
        )
        .is_err());
    let journal = state
        .join("conflict-retirements")
        .join(format!("{id}.json"));
    let journal_bytes = fs::read(&journal).unwrap();
    fs::write(&journal, b"{\"format\":99}").unwrap();
    assert!(api.handle("GET", &endpoint, Value::Null, vec![]).is_err());
    assert_eq!(fs::read(&journal).unwrap(), b"{\"format\":99}");
    fs::write(&journal, &journal_bytes).unwrap();
    let extra = last.parent().unwrap().join("owned-extra.bin");
    fs::write(&extra, b"keep extra").unwrap();
    assert!(api
        .retire_conflict_payloads(id, partial["revision"].as_str().unwrap(), true, &zip)
        .is_err());
    assert!(last.exists());
    fs::remove_file(&extra).unwrap();
    let fresh = call(&api, "GET", &endpoint, Value::Null);
    let done = api
        .retire_conflict_payloads(id, fresh["revision"].as_str().unwrap(), true, &zip)
        .unwrap();
    assert_eq!(done["phase"], "retired");
    assert_eq!(done["remainingFiles"], 0);
    assert_eq!(fs::read(&journal).unwrap(), journal_bytes);
    assert_eq!(fs::read(&receipt).unwrap(), receipt_bytes);
    for (path, raw) in manifests {
        assert_eq!(fs::read(path).unwrap(), raw)
    }
    assert_eq!(fs::read(&zip).unwrap(), backup);
    assert_eq!(fs::read(root.join("Plan.md")).unwrap(), b"Disk\n");
    let after = call(&api, "GET", &format!("/api/documents/{doc}"), Value::Null);
    assert_eq!(after["markdown"], before["markdown"]);
    assert!(api.handle("POST", &route, request, vec![]).is_err());
    assert!(receipt.exists());
    assert_eq!(
        call(&api, "GET", &endpoint, Value::Null)["phase"],
        "retired"
    );

    let catalog = call(
        &api,
        "GET",
        "/api/recovery/families/conflict-attempts",
        Value::Null,
    );
    let key = catalog["items"]
        .as_array()
        .unwrap()
        .iter()
        .find(|r| r["name"] == format!("{id}.json"))
        .unwrap()["key"]
        .as_str()
        .unwrap();
    let unit = format!("/api/recovery/families/conflict-attempts/{key}");
    let reviewed = call(
        &api,
        "POST",
        &format!("{unit}/review"),
        json!({"archived":false}),
    );
    assert_eq!(reviewed["canClose"], true);
    call(
        &api,
        "POST",
        &format!("{unit}/close"),
        json!({"revision":reviewed["revision"],"acknowledge":true}),
    );
    assert!(!receipt.exists());
    assert!(api
        .handle("POST", &route, json!({"attemptId":id}), vec![])
        .is_err());
    assert!(zip.exists());
}
