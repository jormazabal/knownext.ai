use knownext_storage::LocalApi;
use serde_json::{json, Value};
use std::fs;
const KEY: &str = "recovery-owned-incomplete-text-0001";
fn fixture() -> (tempfile::TempDir, LocalApi, std::path::PathBuf) {
    let owned = tempfile::tempdir().unwrap();
    let state = owned.path().join("state");
    let api = LocalApi::new(state.clone(), "qa".into(), "test".into());
    let folder = state.join("drafts-review").join(KEY);
    fs::create_dir_all(&folder).unwrap();
    (owned, api, folder)
}
fn review(api: &LocalApi) -> Value {
    let route = format!("/api/recovery/archives/{KEY}/content-review");
    assert!(LocalApi::is_independent_snapshot("GET", &route));
    let result = api.handle("GET", &route, Value::Null, vec![]).unwrap();
    assert_eq!(result.status, 200);
    result.body
}
#[test]
fn incomplete_pair_exports_only_reviewed_text_without_repair_or_identity_adoption() {
    let (owned, api, folder) = fixture();
    let text = "# Contenido recuperable\n\nTexto íntegro 📝\n";
    let raw=serde_json::to_vec_pretty(&json!({"documentId":"foreign::Untrusted.md","markdown":text,"schemaVersion":1,"openAiApiKey":"synthetic-metadata-not-for-export","draftUpdatedAt":"untrusted date"})).unwrap();
    fs::write(folder.join("copy.json"), &raw).unwrap();
    let inventory = api
        .handle("GET", "/api/recovery/archives", Value::Null, vec![])
        .unwrap()
        .body;
    assert_eq!(inventory["items"][0]["canCopy"], false);
    assert_eq!(inventory["items"][0]["canInspectUnverified"], true);
    let checked = review(&api);
    assert_eq!(checked["text"], text);
    assert_eq!(checked["provenanceVerified"], false);
    assert_eq!(checked["canRestore"], false);
    assert!(checked.get("documentId").is_none());
    assert!(checked.get("openAiApiKey").is_none());
    let revision = checked["revision"].as_str().unwrap();
    assert!(api
        .freeze_incomplete_recovery(KEY, revision, false)
        .is_err());
    let frozen = api.freeze_incomplete_recovery(KEY, revision, true).unwrap();
    assert_eq!(frozen.extension(), "md");
    let destination = owned.path().join("Recovered.md");
    api.write_system_recovery(&frozen, &destination).unwrap();
    assert_eq!(fs::read_to_string(&destination).unwrap(), text);
    assert!(api.write_system_recovery(&frozen, &destination).is_err());
    assert_eq!(fs::read(&folder.join("copy.json")).unwrap(), raw);
    assert!(!folder.join("manifest.json").exists());
    assert!(!owned.path().join("state/projects.json").exists());
    // A newly appearing counterpart invalidates the old review even with identical text.
    let future = b"{\"schemaVersion\":99,\"future\":true}";
    fs::write(folder.join("manifest.json"), future).unwrap();
    assert!(api.freeze_incomplete_recovery(KEY, revision, true).is_err());
    let next = review(&api);
    let frozen = api
        .freeze_incomplete_recovery(KEY, next["revision"].as_str().unwrap(), true)
        .unwrap();
    let second = owned.path().join("Reviewed again.md");
    api.write_system_recovery(&frozen, &second).unwrap();
    assert_eq!(fs::read_to_string(second).unwrap(), text);
    assert_eq!(fs::read(folder.join("manifest.json")).unwrap(), future);
    assert_eq!(fs::read(folder.join("copy.json")).unwrap(), raw);
}
#[test]
fn incomplete_note_extract_preserves_every_page_sample_and_content_extension_without_applying_it() {
    let (owned, api, folder) = fixture();
    let note = json!({"schemaVersion":1,"id":"foreign::Note.knote","title":"Owned pen fixture","createdAt":"2026-11-02T12:00:00Z","updatedAt":"2026-11-02T12:00:00Z","defaultPage":{"preset":"A4","orientation":"portrait","background":"grid"},"toolPresets":[],"pages":[{"id":"page-1","title":"Owned page","size":{"width":1190,"height":1684,"unit":"px","preset":"A4"},"background":{"type":"grid","spacing":32},"strokes":[{"id":"stroke-1","tool":"pen","color":"#111827","width":2,"opacity":1,"pressure":true,"textureSeed":"owned-texture","textureVersion":1,"points":[[10,20,0.5,1,20,-10],[30,40,0.8,2,30,-15]]}],"generatedElements":[{"id":"element-1","strokeIds":["stroke-1"],"kind":"shape","text":"Owned content"}],"updatedAt":"2026-11-02T12:00:00Z"}],"ocr":{"status":"updated","textByPage":{"page-1":"Owned recognized text"}},"customAnnotation":{"preserve":"document data"}});
    let raw=serde_json::to_vec_pretty(&json!({"schemaVersion":1,"documentId":"foreign::Note.knote","content":note,"privateEnvelope":"synthetic-not-for-export"})).unwrap();
    fs::write(folder.join("copy.json"), &raw).unwrap();
    let checked = review(&api);
    assert_eq!(checked["schemaVersion"], 2);
    assert_eq!(checked["kind"], "handwritten-note");
    assert_eq!(checked["pageCount"], 1);
    assert_eq!(checked["strokeCount"], 1);
    assert_eq!(checked["text"], "");
    assert!(checked.get("content").is_none());
    assert!(checked.get("documentId").is_none());
    let frozen = api
        .freeze_incomplete_recovery(KEY, checked["revision"].as_str().unwrap(), true)
        .unwrap();
    assert_eq!(frozen.extension(), "knote");
    let output = owned.path().join("Recovered.knote");
    api.write_system_recovery(&frozen, &output).unwrap();
    let restored: Value = serde_json::from_slice(&fs::read(&output).unwrap()).unwrap();
    assert_eq!(restored, note);
    assert!(restored.get("privateEnvelope").is_none());
    assert_eq!(fs::read(folder.join("copy.json")).unwrap(), raw);
    assert!(!folder.join("manifest.json").exists());
    assert!(api
        .write_system_recovery(&frozen, &owned.path().join("Wrong.md"))
        .is_err());
    let cache = owned.path().join("cache");
    fs::create_dir(&cache).unwrap();
    let staged = frozen.stage(&cache).unwrap();
    assert_eq!(
        serde_json::from_slice::<Value>(&fs::read(staged.path).unwrap()).unwrap(),
        note
    );
    let mut future = note;
    future["schemaVersion"] = json!(99);
    let raw = serde_json::to_vec(&json!({"content":future})).unwrap();
    fs::write(folder.join("copy.json"), &raw).unwrap();
    assert!(api
        .handle(
            "GET",
            &format!("/api/recovery/archives/{KEY}/content-review"),
            Value::Null,
            vec![]
        )
        .is_err());
    assert_eq!(fs::read(folder.join("copy.json")).unwrap(), raw);
}
#[test]
fn extraction_refuses_future_or_ambiguous_content_and_enforces_preview_and_byte_limits() {
    let (_owned, api, folder) = fixture();
    let route = format!("/api/recovery/archives/{KEY}/content-review");
    for value in [
        json!({"schemaVersion":2,"markdown":"future"}),
        json!({"markdown":"ambiguous","content":{}}),
        json!({"content":{"schemaVersion":1}}),
        json!({"markdown":"x".repeat(2*1024*1024+1)}),
    ] {
        let raw = serde_json::to_vec(&value).unwrap();
        fs::write(folder.join("copy.json"), &raw).unwrap();
        assert!(api.handle("GET", &route, Value::Null, vec![]).is_err());
        assert_eq!(fs::read(folder.join("copy.json")).unwrap(), raw);
    }
    let text = "📝".repeat(2100);
    fs::write(
        folder.join("copy.json"),
        serde_json::to_vec(&json!({"markdown":text})).unwrap(),
    )
    .unwrap();
    let checked = review(&api);
    assert_eq!(checked["text"].as_str().unwrap().chars().count(), 2000);
    assert_eq!(checked["previewTruncated"], true);
    assert_eq!(checked["byteLength"], 8400);
    let file = fs::File::create(folder.join("copy.json")).unwrap();
    file.set_len(8 * 1024 * 1024 + 1).unwrap();
    drop(file);
    assert!(api.handle("GET", &route, Value::Null, vec![]).is_err());
    assert_eq!(
        fs::metadata(folder.join("copy.json")).unwrap().len(),
        8 * 1024 * 1024 + 1
    );
    assert!(api
        .freeze_incomplete_recovery("../outside", &"a".repeat(64), true)
        .is_err());
}
