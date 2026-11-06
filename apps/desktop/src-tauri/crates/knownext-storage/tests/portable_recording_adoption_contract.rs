use knownext_storage::LocalApi;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{fs, path::PathBuf};
fn sha(raw: &[u8]) -> String {
    format!("{:x}", Sha256::digest(raw))
}
fn call(api: &LocalApi, method: &str, path: &str, body: Value) -> Value {
    let result = api.handle(method, path, body, vec![]).unwrap();
    assert_eq!(result.status, 200, "{}", result.body);
    result.body
}
fn wav(pcm: &[u8]) -> Vec<u8> {
    let mut out = vec![];
    out.extend(b"RIFF");
    out.extend((pcm.len() as u32 + 36).to_le_bytes());
    out.extend(b"WAVEfmt ");
    out.extend(16u32.to_le_bytes());
    out.extend(1u16.to_le_bytes());
    out.extend(1u16.to_le_bytes());
    out.extend(24000u32.to_le_bytes());
    out.extend(48000u32.to_le_bytes());
    out.extend(2u16.to_le_bytes());
    out.extend(16u16.to_le_bytes());
    out.extend(b"data");
    out.extend((pcm.len() as u32).to_le_bytes());
    out.extend(pcm);
    out
}
fn fixture() -> (tempfile::TempDir, LocalApi, String, PathBuf, Vec<u8>) {
    let owned = tempfile::tempdir().unwrap();
    let api = LocalApi::new(owned.path().join("state"), "qa".into(), "test".into());
    let project = call(
        &api,
        "POST",
        "/api/projects",
        json!({"name":"Audio receptor","versioningMode":"none","syncMode":"none"}),
    );
    let id = project["id"].as_str().unwrap().to_string();
    let root = PathBuf::from(project["folderPath"].as_str().unwrap());
    let folder = root.join("Archivo KnowNext/Grabaciones/source");
    fs::create_dir_all(&folder).unwrap();
    let original=serde_json::to_vec(&json!({"id":"source-session","status":"queued","createdAt":"2026-11-01T12:00:00Z","destination":{"projectId":"origin-project","name":"Reunión trasladada"},"samples":3,"audioDeleted":false,"chunks":[{"status":"completed","text":"Texto que permanece en el archivo","usageReceipt":{"privateSentinel":"DO_NOT_ADOPT_PROVIDER_STATE"}}],"cost":{"privateSentinel":"DO_NOT_ADOPT_PROVIDER_STATE"}})).unwrap();
    fs::write(folder.join("Original.json"), &original).unwrap();
    fs::write(folder.join("Transcripcion.md"), "Texto original").unwrap();
    let mic = vec![1, 0, 2, 0, 3, 0];
    let system = vec![4, 0, 5, 0, 6, 0];
    fs::write(folder.join("mic-1.wav"), wav(&mic[..2])).unwrap();
    fs::write(folder.join("mic-2.wav"), wav(&mic[2..])).unwrap();
    fs::write(folder.join("system.wav"), wav(&system)).unwrap();
    let prefix = "Grabaciones/source";
    let item = json!({"kind":"recording","original":format!("{prefix}/Original.json"),"transcript":format!("{prefix}/Transcripcion.md"),"tracks":[{"source":"microphone.pcm","audio":{"bytes":6,"sha256":sha(&mic),"parts":[{"path":format!("{prefix}/mic-1.wav"),"payloadBytes":2,"skipBytes":44},{"path":format!("{prefix}/mic-2.wav"),"payloadBytes":4,"skipBytes":44}]}},{"source":"system.pcm","audio":{"bytes":6,"sha256":sha(&system),"parts":[{"path":format!("{prefix}/system.wav"),"payloadBytes":6,"skipBytes":44}]}}],"sampleRate":24000,"channels":1,"bitsPerSample":16,"active":false,"audioDeletedAtSource":false});
    fs::write(root.join("Archivo KnowNext/Inventario.json"),serde_json::to_vec(&json!({"format":"knownext.project-archive","schemaVersion":1,"dataOnly":true,"items":[item]})).unwrap()).unwrap();
    (owned, api, id, root, original)
}
fn review(api: &LocalApi, p: &str) -> Value {
    let cat = call(
        api,
        "GET",
        &format!("/api/projects/{p}/portable-recordings"),
        Value::Null,
    );
    call(
        api,
        "POST",
        &format!(
            "/api/projects/{p}/portable-recordings/{}/review",
            cat["items"][0]["id"].as_str().unwrap()
        ),
        json!({"catalogRevision":cat["revision"]}),
    )
}
#[test]
fn native_input_contains_exact_ordered_pcm_and_receiver_identity_without_provider_state_and_occupied_ids_never_replay(
) {
    assert!(LocalApi::is_independent_snapshot(
        "POST",
        "/api/projects/p/portable-recordings/key/review"
    ));
    let (owned, api, p, root, original) = fixture();
    let viewed = review(&api, &p);
    assert_eq!(viewed["canImport"], true);
    assert_eq!(viewed["parts"], 3);
    assert_eq!(viewed["bytes"], 12);
    assert_eq!(viewed["microphone"], true);
    assert_eq!(viewed["systemAudio"], true);
    assert_eq!(viewed["startsAi"], false);
    let key = viewed["entryId"].as_str().unwrap();
    let revision = viewed["revision"].as_str().unwrap();
    let registry = fs::read(owned.path().join("state/projects.json")).unwrap();
    let id = api
        .import_portable_recording(&p, key, revision, |input| {
            assert_eq!(input.microphone, Some(vec![1, 0, 2, 0, 3, 0]));
            assert_eq!(input.system, Some(vec![4, 0, 5, 0, 6, 0]));
            assert_eq!(input.origin.project_id, p);
            assert_eq!(input.origin.source_sha256, sha(&original));
            assert_eq!(input.name, "Reunión trasladada");
            assert!(!serde_json::to_string(&input.origin)
                .unwrap()
                .contains("DO_NOT_ADOPT"));
            let folder = owned.path().join("state/recordings-dev").join(&input.id);
            fs::create_dir_all(&folder).unwrap();
            fs::write(folder.join("session.json"), b"{\"schemaVersion\":99}").unwrap();
            Ok(input.id)
        })
        .unwrap();
    assert_eq!(viewed["sessionId"], id);
    let occupied = review(&api, &p);
    assert_eq!(occupied["nativeState"], "occupied");
    assert_eq!(occupied["canImport"], false);
    assert_ne!(occupied["revision"], revision);
    assert!(api
        .import_portable_recording::<()>(&p, key, revision, |_| panic!("must not repeat"))
        .is_err());
    assert_eq!(
        fs::read(
            owned
                .path()
                .join("state/recordings-dev")
                .join(&id)
                .join("session.json")
        )
        .unwrap(),
        b"{\"schemaVersion\":99}"
    );
    assert_eq!(
        fs::read(root.join("Archivo KnowNext/Grabaciones/source/Original.json")).unwrap(),
        original
    );
    assert_eq!(
        fs::read(owned.path().join("state/projects.json")).unwrap(),
        registry
    );
}
#[test]
fn changed_parts_future_catalog_and_budget_stop_before_native_publication_with_sources_preserved() {
    let (owned, api, p, root, original) = fixture();
    let viewed = review(&api, &p);
    let key = viewed["entryId"].as_str().unwrap();
    let revision = viewed["revision"].as_str().unwrap();
    let part = root.join("Archivo KnowNext/Grabaciones/source/mic-2.wav");
    let raw = fs::read(&part).unwrap();
    let mut bad = raw.clone();
    bad[44] ^= 1;
    fs::write(&part, &bad).unwrap();
    assert!(api
        .import_portable_recording::<()>(&p, key, revision, |_| panic!("altered audio"))
        .is_err());
    assert_eq!(fs::read(&part).unwrap(), bad);
    fs::write(&part, &raw).unwrap();
    let occupancy = owned.path().join("state/drafts");
    fs::create_dir_all(&occupancy).unwrap();
    fs::File::create(occupancy.join("opaque.json"))
        .unwrap()
        .set_len(16 * 1024 * 1024)
        .unwrap();
    let inventory = call(&api, "GET", "/api/recovery/storage", Value::Null);
    call(
        &api,
        "PUT",
        "/api/recovery/storage/policy",
        json!({"revision":inventory["policy"]["revision"],"enabled":true,"maxBytes":16*1024*1024}),
    );
    assert!(api
        .import_portable_recording::<()>(&p, key, revision, |_| panic!("budget exceeded"))
        .is_err());
    assert!(!owned.path().join("state/recordings-dev").exists());
    let index = root.join("Archivo KnowNext/Inventario.json");
    let source = fs::read(&index).unwrap();
    let mut duplicate: Value = serde_json::from_slice(&source).unwrap();
    duplicate["items"][0]["tracks"][1]["audio"] =
        duplicate["items"][0]["tracks"][0]["audio"].clone();
    fs::write(&index, serde_json::to_vec(&duplicate).unwrap()).unwrap();
    let catalog = call(
        &api,
        "GET",
        &format!("/api/projects/{p}/portable-recordings"),
        Value::Null,
    );
    let result = api.handle(
        "POST",
        &format!(
            "/api/projects/{p}/portable-recordings/{}/review",
            catalog["items"][0]["id"].as_str().unwrap()
        ),
        json!({"catalogRevision":catalog["revision"]}),
        vec![],
    );
    assert!(result.is_err() || result.unwrap().status >= 400);
    fs::write(&index,b"{\"format\":\"knownext.project-archive\",\"schemaVersion\":99,\"dataOnly\":true,\"items\":[]}").unwrap();
    let future = fs::read(&index).unwrap();
    let result = api.handle(
        "GET",
        &format!("/api/projects/{p}/portable-recordings"),
        Value::Null,
        vec![],
    );
    assert!(result.is_err() || result.unwrap().status >= 400);
    assert_eq!(fs::read(&index).unwrap(), future);
    assert_eq!(
        fs::read(root.join("Archivo KnowNext/Grabaciones/source/Original.json")).unwrap(),
        original
    );
}
