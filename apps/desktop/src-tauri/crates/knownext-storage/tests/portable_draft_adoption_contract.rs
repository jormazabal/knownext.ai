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
fn fixture() -> (tempfile::TempDir, LocalApi, String, PathBuf, Vec<u8>) {
    let owned = tempfile::tempdir().unwrap();
    let api = LocalApi::new(owned.path().join("state"), "qa".into(), "test".into());
    let project = call(
        &api,
        "POST",
        "/api/projects",
        json!({"name":"Proyecto receptor","versioningMode":"none","syncMode":"none"}),
    );
    let id = project["id"].as_str().unwrap().to_owned();
    let root = PathBuf::from(project["folderPath"].as_str().unwrap());
    let base = b"Documento base\n";
    fs::write(root.join("Acta.md"), base).unwrap();
    let original=serde_json::to_vec(&json!({"schemaVersion":1,"documentId":"project-origin::Acta.md","markdown":"Borrador portable\n","baseFingerprint":{"mtimeNs":"old-device","size":base.len(),"sha256":sha(base)},"draftUpdatedAt":"2026-11-01T12:00:00Z","historySource":{"neverAdoptAuthority":true}})).unwrap();
    write_archive(&root, "Acta.md", &original);
    (owned, api, id, root, original)
}
fn write_archive(root: &std::path::Path, path: &str, original: &[u8]) {
    let folder = root.join("Archivo KnowNext/Borradores/owned");
    fs::create_dir_all(&folder).unwrap();
    fs::write(folder.join("Original.json"), original).unwrap();
    let index = json!({"format":"knownext.project-archive","schemaVersion":1,"dataOnly":true,"items":[{"kind":"draft","documentPath":path,"original":"Borradores/owned/Original.json","editable":"Borradores/owned/Borrador.md","sha256":sha(original),"active":false}]});
    fs::write(
        root.join("Archivo KnowNext/Inventario.json"),
        serde_json::to_vec(&index).unwrap(),
    )
    .unwrap();
}
fn catalog(api: &LocalApi, p: &str) -> Value {
    call(
        api,
        "GET",
        &format!("/api/projects/{p}/portable-drafts"),
        Value::Null,
    )
}
fn review(api: &LocalApi, p: &str) -> Value {
    let c = catalog(api, p);
    let key = c["items"][0]["id"].as_str().unwrap();
    call(
        api,
        "POST",
        &format!("/api/projects/{p}/portable-drafts/{key}/review"),
        json!({"catalogRevision":c["revision"]}),
    )
}
fn adopt(
    api: &LocalApi,
    p: &str,
    r: &Value,
    mode: &str,
) -> Result<knownext_storage::LocalApiResponse, String> {
    api.handle(
        "POST",
        &format!(
            "/api/projects/{p}/portable-drafts/{}",
            r["entryId"].as_str().unwrap()
        ),
        json!({"revision":r["revision"],"mode":mode,"acknowledge":true}),
        vec![],
    )
}
#[test]
fn reviewed_copy_then_continuation_preserves_sources_and_never_duplicates_or_replaces_work() {
    let (owned, api, p, root, original) = fixture();
    let registry = fs::read(owned.path().join("state/projects.json")).unwrap();
    let first = review(&api, &p);
    assert_eq!(first["canCopy"], true);
    assert_eq!(first["canResume"], true);
    assert!(!owned.path().join("state/drafts-review").exists());
    let copied = adopt(&api, &p, &first, "copy").unwrap().body;
    assert_eq!(copied["status"], "copied");
    let key = copied["copy"]["key"].as_str().unwrap();
    let folder = owned.path().join("state/drafts-review").join(key);
    let payload = fs::read(folder.join("copy.json")).unwrap();
    let value: Value = serde_json::from_slice(&payload).unwrap();
    assert_eq!(value["documentId"], format!("{p}::Acta.md"));
    assert_eq!(value["baseFingerprint"], Value::Null);
    assert!(value.get("historySource").is_none());
    assert!(!owned.path().join("state/drafts").exists());
    assert!(adopt(&api, &p, &first, "copy").is_err());
    let current = review(&api, &p);
    assert_eq!(current["copyState"], "present");
    assert_eq!(current["canResume"], true);
    let ready = adopt(&api, &p, &current, "resume").unwrap().body;
    assert_eq!(ready["status"], "draft_ready");
    assert_eq!(ready["copy"]["key"], key);
    let document = call(
        &api,
        "GET",
        &format!("/api/documents/{p}::Acta.md"),
        Value::Null,
    );
    assert_eq!(document["markdown"], "Borrador portable\n");
    assert_eq!(document["diskMarkdown"], "Documento base\n");
    assert_eq!(document["hasDraft"], true);
    assert_eq!(document["diskChanged"], false);
    assert_eq!(fs::read(root.join("Acta.md")).unwrap(), b"Documento base\n");
    assert_eq!(
        fs::read(root.join("Archivo KnowNext/Borradores/owned/Original.json")).unwrap(),
        original
    );
    assert_eq!(fs::read(folder.join("copy.json")).unwrap(), payload);
    assert_eq!(
        fs::read(owned.path().join("state/projects.json")).unwrap(),
        registry
    );
    let draft_path = owned.path().join("state/drafts").join(format!(
        "v2_{}.json",
        sha(format!("{p}::Acta.md").as_bytes())
    ));
    let draft = fs::read(&draft_path).unwrap();
    assert!(adopt(&api, &p, &current, "resume").is_err());
    assert_eq!(fs::read(&draft_path).unwrap(), draft);
    assert_eq!(
        fs::read_dir(owned.path().join("state/drafts-review"))
            .unwrap()
            .count(),
        1
    );
    let archives = call(&api, "GET", "/api/recovery/archives", Value::Null);
    assert!(archives["items"]
        .as_array()
        .unwrap()
        .iter()
        .any(|copy| copy["key"] == key && copy["canCopy"] == true));
}
#[test]
fn current_drafts_changed_bases_and_future_or_partial_sources_are_preserved() {
    let (owned, api, p, root, original) = fixture();
    call(
        &api,
        "PUT",
        &format!("/api/documents/{p}::Acta.md/draft"),
        json!({"markdown":"Trabajo local distinto\n"}),
    );
    let value = review(&api, &p);
    assert_eq!(value["canCopy"], true);
    assert_eq!(value["canResume"], false);
    assert!(adopt(&api, &p, &value, "resume").is_err());
    let copied = adopt(&api, &p, &value, "copy").unwrap().body;
    assert_eq!(copied["status"], "copied");
    assert_eq!(
        call(
            &api,
            "GET",
            &format!("/api/documents/{p}::Acta.md"),
            Value::Null
        )["markdown"],
        "Trabajo local distinto\n"
    );
    let source = root.join("Archivo KnowNext/Borradores/owned/Original.json");
    fs::write(&source, b"changed-source").unwrap();
    let stale = api.handle(
        "POST",
        &format!(
            "/api/projects/{p}/portable-drafts/{}/review",
            value["entryId"].as_str().unwrap()
        ),
        json!({"catalogRevision":value["catalogRevision"]}),
        vec![],
    );
    assert!(stale.is_err());
    assert_eq!(fs::read(&source).unwrap(), b"changed-source");
    fs::write(&source, &original).unwrap();
    let index = root.join("Archivo KnowNext/Inventario.json");
    let future=b"{\"format\":\"knownext.project-archive\",\"schemaVersion\":99,\"dataOnly\":true,\"items\":[]}";
    fs::write(&index, future).unwrap();
    assert!(api
        .handle(
            "GET",
            &format!("/api/projects/{p}/portable-drafts"),
            Value::Null,
            vec![]
        )
        .is_err());
    assert_eq!(fs::read(index).unwrap(), future);
    assert_eq!(
        fs::read_dir(owned.path().join("state/drafts-review"))
            .unwrap()
            .count(),
        1
    );
    let (_other, other, p, root, _) = fixture();
    fs::write(root.join("Acta.md"), b"Base cambiada\n").unwrap();
    let value = review(&other, &p);
    assert_eq!(value["baseMatches"], false);
    assert_eq!(value["canCopy"], true);
    assert_eq!(value["canResume"], false);
    assert!(adopt(&other, &p, &value, "resume").is_err());
}
#[test]
fn budget_and_unknown_native_copy_block_publication_without_overwriting_any_source() {
    let (owned, api, p, root, original) = fixture();
    let first = review(&api, &p);
    let folder = owned
        .path()
        .join("state/drafts-review")
        .join(first["copyKey"].as_str().unwrap());
    fs::create_dir_all(&folder).unwrap();
    fs::write(folder.join("copy.json"), b"{}").unwrap();
    let future = b"{\"schemaVersion\":99}";
    fs::write(folder.join("manifest.json"), future).unwrap();
    let blocked = review(&api, &p);
    assert_eq!(blocked["canCopy"], false);
    assert_eq!(blocked["canResume"], false);
    assert!(adopt(&api, &p, &first, "copy").is_err());
    assert_eq!(fs::read(folder.join("manifest.json")).unwrap(), future);
    assert_eq!(
        fs::read(root.join("Archivo KnowNext/Borradores/owned/Original.json")).unwrap(),
        original
    );
    let (owned, api, p, _root, _) = fixture();
    let state = owned.path().join("state");
    fs::create_dir_all(state.join("recordings")).unwrap();
    fs::File::create(state.join("recordings/owned-capacity.bin"))
        .unwrap()
        .set_len(16 * 1024 * 1024)
        .unwrap();
    let inventory = call(&api, "GET", "/api/recovery/storage", Value::Null);
    let limited = call(
        &api,
        "PUT",
        "/api/recovery/storage/policy",
        json!({"revision":inventory["policy"]["revision"],"enabled":true,"maxBytes":16*1024*1024}),
    );
    let value = review(&api, &p);
    assert!(adopt(&api, &p, &value, "copy").is_err());
    assert!(!state.join("drafts-review").exists());
    call(
        &api,
        "PUT",
        "/api/recovery/storage/policy",
        json!({"revision":limited["policy"]["revision"],"enabled":true,"maxBytes":32*1024*1024}),
    );
    let fresh = review(&api, &p);
    assert_eq!(
        adopt(&api, &p, &fresh, "copy").unwrap().body["status"],
        "copied"
    );
}

#[test]
fn handwritten_continuation_rebinds_identity_and_preserves_all_ink_and_the_saved_note(){
 let(owned,api,p,root,_)=fixture();let created=call(&api,"POST",&format!("/api/projects/{p}/handwritten-notes"),json!({"name":"Nota.knote"}));let note=created["node"]["id"].as_str().unwrap();let record=call(&api,"GET",&format!("/api/handwritten-notes/{note}"),Value::Null);let source=fs::read(root.join("Nota.knote")).unwrap();let mut content=record["content"].clone();content["id"]=json!("project-origin::Nota.knote");content["title"]=json!("Nota portable");let strokes=json!([{"id":"portable-ink","color":"#111827","width":2,"opacity":1,"tool":"pen","pressure":true,"points":[[10,20,0.7,0,45,-30],[20,30,0.8,16,35,-20]]}]);content["pages"][0]["strokes"]=strokes.clone();let original=serde_json::to_vec(&json!({"schemaVersion":1,"documentId":"project-origin::Nota.knote","content":content,"baseFingerprint":{"mtimeNs":"origin","size":source.len(),"sha256":sha(&source)}})).unwrap();write_archive(&root,"Nota.knote",&original);let reviewed=review(&api,&p);assert_eq!(reviewed["kind"],"handwritten-note");assert_eq!(reviewed["canResume"],true,"{reviewed}");let done=adopt(&api,&p,&reviewed,"resume").unwrap().body;assert_eq!(done["status"],"draft_ready");let current=call(&api,"GET",&format!("/api/handwritten-notes/{note}"),Value::Null);assert_eq!(current["content"]["id"],note);assert_eq!(current["content"]["title"],"Nota portable");assert_eq!(current["content"]["pages"][0]["strokes"],strokes);assert_eq!(current["hasDraft"],true);assert_eq!(current["diskChanged"],false);assert_eq!(fs::read(root.join("Nota.knote")).unwrap(),source);assert_eq!(fs::read(root.join("Archivo KnowNext/Borradores/owned/Original.json")).unwrap(),original);assert_eq!(fs::read_dir(owned.path().join("state/drafts-review")).unwrap().count(),1);
}
