use knownext_storage::{dispatch_project_transfer, LocalApi};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::Read,
    path::{Path, PathBuf},
    process::Command,
    sync::Mutex,
};

fn call(api: &LocalApi, method: &str, path: &str, body: Value) -> Value {
    let reply = api.handle(method, path, body, vec![]).unwrap();
    assert_eq!(reply.status, 200, "{}", reply.body);
    reply.body
}
fn work(api: &LocalApi, id: &str, action: &str, body: Value) -> Value {
    dispatch_project_transfer(
        &Mutex::new(api.clone()),
        api,
        &Mutex::new(()),
        &format!("/api/project-transfers/{id}/{action}"),
        body,
    )
    .unwrap()
    .body
}
fn git(root: &Path, args: &[&str]) {
    let result = Command::new("git")
        .arg("-C")
        .arg(root)
        .args(args)
        .output()
        .unwrap();
    assert!(
        result.status.success(),
        "{}",
        String::from_utf8_lossy(&result.stderr)
    );
}
fn sha(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}
fn payload(state: &Path, id: &str) -> PathBuf {
    state
        .join("project-transfers")
        .join(sha(id.as_bytes()))
        .join("payload.zip")
}
fn fixture() -> (tempfile::TempDir, LocalApi, Value, PathBuf) {
    let temp = tempfile::tempdir().unwrap();
    let api = LocalApi::new(temp.path().join("state"), "qa".into(), "test".into());
    let project = call(
        &api,
        "POST",
        "/api/projects",
        json!({"name":"Archivo fuente","versioningMode":"none","syncMode":"none"}),
    );
    let root = PathBuf::from(project["folderPath"].as_str().unwrap());
    fs::write(root.join("Acta.md"), b"Primera version\n").unwrap();
    (temp, api, project, root)
}

#[test]
fn complete_private_archive_roundtrips_without_adopting_runtime_authority_or_credentials() {
    let (temp, api, project, root) = fixture();
    let project_id = project["id"].as_str().unwrap();
    git(&root, &["init", "-q"]);
    git(&root, &["config", "user.name", "Owned QA"]);
    git(&root, &["config", "user.email", "qa@example.invalid"]);
    git(&root, &["add", "Acta.md"]);
    git(&root, &["commit", "-qm", "Primera"]);
    fs::write(root.join("Acta.md"), b"Segunda version\n").unwrap();
    git(&root, &["add", "Acta.md"]);
    git(&root, &["commit", "-qm", "Segunda"]);
    git(
        &root,
        &["config", "private.neverExport", "credential-sentinel-owned"],
    );
    call(
        &api,
        "PUT",
        &format!("/api/documents/{project_id}::Acta.md/draft"),
        json!({"markdown":"Borrador distinto\n"}),
    );
    call(
        &api,
        "PUT",
        "/api/config",
        json!({"appearance":{"zoomPercent":125,"themeMode":"light"},"layout":{"sidebarWidth":300},"ai":{"privateSentinel":"credential-sentinel-owned"}}),
    );
    let recordings = temp
        .path()
        .join("state/recordings/01234567-0123-0123-0123-0123456789ab");
    fs::create_dir_all(&recordings).unwrap();
    let session = json!({"id":"01234567-0123-0123-0123-0123456789ab","status":"queued","destination":{"projectId":project_id,"name":"Acta de audio"},"chunks":[{"status":"pending","text":"Texto conservado"}],"samples":8388609,"audioDeleted":false});
    let original = serde_json::to_vec(&session).unwrap();
    fs::write(recordings.join("session.json"), &original).unwrap();
    let pcm = vec![42u8; 16 * 1024 * 1024 + 2];
    fs::write(recordings.join("microphone.pcm"), &pcm).unwrap();
    let started = call(
        &api,
        "POST",
        "/api/project-transfers",
        json!({"kind":"export","projectId":project_id,"includeArchive":true}),
    );
    let id = started["id"].as_str().unwrap();
    let ready = work(&api, id, "prepare", Value::Null);
    assert_eq!(ready["phase"], "ready", "{ready}");
    assert_eq!(ready["manifest"]["schemaVersion"], 2);
    assert_eq!(ready["manifest"]["supplement"]["drafts"], 1);
    assert_eq!(ready["manifest"]["supplement"]["recordingSessions"], 1);
    assert_eq!(ready["manifest"]["supplement"]["history"], true);
    let archive = payload(&temp.path().join("state"), id);
    let archive_bytes = fs::read(&archive).unwrap();
    assert!(!archive_bytes
        .windows(b"credential-sentinel-owned".len())
        .any(|w| w == b"credential-sentinel-owned"));
    let receiver = LocalApi::new(temp.path().join("receiver"), "qa".into(), "test".into());
    let received = call(
        &receiver,
        "POST",
        "/api/project-transfers",
        json!({"kind":"import"}),
    );
    let received_id = received["id"].as_str().unwrap();
    receiver
        .reserve_project_transfer_source(received_id)
        .unwrap();
    receiver
        .copy_project_transfer_source(received_id, &archive)
        .unwrap();
    let review = work(&receiver, received_id, "prepare", Value::Null);
    assert_eq!(review["phase"], "ready", "{review}");
    assert_eq!(review["manifest"], ready["manifest"]);
    let done = work(
        &receiver,
        received_id,
        "commit",
        json!({"archiveSha256":review["archiveSha256"],"name":"Archivo recibido"}),
    );
    assert_eq!(done["phase"], "completed", "{done}");
    let projects = call(&receiver, "GET", "/api/projects", Value::Null);
    let target = &projects
        .as_array()
        .unwrap()
        .iter()
        .find(|p| p["id"] == done["targetProjectId"])
        .unwrap();
    assert_eq!(target["versioningMode"], "none");
    assert_eq!(target["syncMode"], "none");
    let imported = PathBuf::from(target["folderPath"].as_str().unwrap());
    assert_eq!(
        fs::read(imported.join("Acta.md")).unwrap(),
        b"Segunda version\n"
    );
    assert!(!imported.join(".git").exists());
    assert!(!temp.path().join("receiver/drafts").exists());
    assert!(!temp.path().join("receiver/recordings").exists());
    let inventory: Value = serde_json::from_slice(
        &fs::read(imported.join("Archivo KnowNext/Inventario.json")).unwrap(),
    )
    .unwrap();
    let items = inventory["items"].as_array().unwrap();
    let draft = items.iter().find(|i| i["kind"] == "draft").unwrap();
    assert_eq!(
        fs::read(
            imported
                .join("Archivo KnowNext")
                .join(draft["editable"].as_str().unwrap())
        )
        .unwrap(),
        b"Borrador distinto\n"
    );
    let recording = items.iter().find(|i| i["kind"] == "recording").unwrap();
    let parts = recording["tracks"][0]["audio"]["parts"].as_array().unwrap();
    assert_eq!(parts.len(), 2);
    let mut restored = vec![];
    for part in parts {
        let bytes = fs::read(
            imported
                .join("Archivo KnowNext")
                .join(part["path"].as_str().unwrap()),
        )
        .unwrap();
        assert_eq!(&bytes[..4], b"RIFF");
        restored.extend_from_slice(&bytes[44..]);
    }
    assert_eq!(restored, pcm);
    let history = items.iter().find(|i| i["kind"] == "history").unwrap();
    let mut bundle = vec![];
    for part in history["bundle"]["parts"].as_array().unwrap() {
        fs::File::open(
            imported
                .join("Archivo KnowNext")
                .join(part["path"].as_str().unwrap()),
        )
        .unwrap()
        .read_to_end(&mut bundle)
        .unwrap();
    }
    assert_eq!(sha(&bundle), history["bundle"]["sha256"].as_str().unwrap());
    let bundle_path = temp.path().join("received.bundle");
    fs::write(&bundle_path, bundle).unwrap();
    let restored_history = temp.path().join("restored-history");
    let clone = Command::new("git")
        .args(["clone", "--bare"])
        .arg(&bundle_path)
        .arg(&restored_history)
        .output()
        .unwrap();
    assert!(clone.status.success());
    let log = Command::new("git")
        .arg("--git-dir")
        .arg(&restored_history)
        .args(["rev-list", "--count", "--all"])
        .output()
        .unwrap();
    assert_eq!(String::from_utf8(log.stdout).unwrap().trim(), "2");
    let prefs: Value = serde_json::from_slice(
        &fs::read(imported.join("Archivo KnowNext/Preferencias.json")).unwrap(),
    )
    .unwrap();
    assert_eq!(prefs["appearance"]["zoomPercent"], 125);
    assert!(prefs.get("ai").is_none());
    assert_eq!(prefs["applyAutomatically"], false);
    assert_eq!(fs::read(recordings.join("session.json")).unwrap(), original);
    assert_eq!(fs::read(recordings.join("microphone.pcm")).unwrap(), pcm);
    fs::write(imported.join("Acta.md"), b"Edicion posterior\n").unwrap();
    let again = work(
        &receiver,
        received_id,
        "commit",
        json!({"archiveSha256":review["archiveSha256"],"name":"Otro nombre"}),
    );
    assert_eq!(again["phase"], "completed");
    assert_eq!(
        fs::read(imported.join("Acta.md")).unwrap(),
        b"Edicion posterior\n"
    );
    let denied = dispatch_project_transfer(
        &Mutex::new(api.clone()),
        &api,
        &Mutex::new(()),
        &format!("/api/project-transfers/{id}/save-template"),
        json!({"name":"No compartir","archiveSha256":ready["archiveSha256"]}),
    );
    assert!(denied.unwrap_err().contains("no se convierte en plantilla"));
}

#[test]
fn active_recording_reserved_collisions_and_selection_refuse_without_touching_sources() {
    let (temp, api, project, root) = fixture();
    let project_id = project["id"].as_str().unwrap();
    let invalid=api.handle("POST","/api/project-transfers",json!({"kind":"export","projectId":project_id,"nodeIds":[format!("{project_id}::Acta.md")],"includeArchive":true}),vec![]);
    assert!(invalid.is_err());
    assert!(!temp.path().join("state/project-transfers").exists());
    let folder = temp
        .path()
        .join("state/recordings/01234567-0123-0123-0123-0123456789ab");
    fs::create_dir_all(&folder).unwrap();
    let original=serde_json::to_vec(&json!({"id":"01234567-0123-0123-0123-0123456789ab","status":"paused","destination":{"projectId":project_id},"chunks":[]})).unwrap();
    fs::write(folder.join("session.json"), &original).unwrap();
    let job = call(
        &api,
        "POST",
        "/api/project-transfers",
        json!({"kind":"export","projectId":project_id,"includeArchive":true}),
    );
    let id = job["id"].as_str().unwrap();
    let failed = work(&api, id, "prepare", Value::Null);
    assert_eq!(failed["phase"], "failed");
    assert!(!payload(&temp.path().join("state"), id).exists());
    assert_eq!(fs::read(folder.join("session.json")).unwrap(), original);
    assert_eq!(work(&api, id, "discard", json!({}))["discarded"], true);
    fs::create_dir(root.join("Archivo KnowNext")).unwrap();
    fs::write(root.join("Archivo KnowNext/Conservar.md"), b"Original").unwrap();
    let job = call(
        &api,
        "POST",
        "/api/project-transfers",
        json!({"kind":"export","projectId":project_id,"includeArchive":true}),
    );
    let failed = work(&api, job["id"].as_str().unwrap(), "prepare", Value::Null);
    assert_eq!(failed["phase"], "failed");
    assert_eq!(
        fs::read(root.join("Archivo KnowNext/Conservar.md")).unwrap(),
        b"Original"
    );
}

#[test]
fn future_or_contradictory_archive_metadata_never_registers_a_project() {
    use std::io::{Cursor, Write};
    use zip::{write::SimpleFileOptions, ZipArchive, ZipWriter};
    let (temp, api, project, _root) = fixture();
    let job = call(
        &api,
        "POST",
        "/api/project-transfers",
        json!({"kind":"export","projectId":project["id"],"includeArchive":true}),
    );
    let id = job["id"].as_str().unwrap();
    let ready = work(&api, id, "prepare", Value::Null);
    assert_eq!(ready["phase"], "ready", "{ready}");
    let original = fs::read(payload(&temp.path().join("state"), id)).unwrap();
    for variant in 0..5 {
        let mut source = ZipArchive::new(Cursor::new(&original)).unwrap();
        let mut writer = ZipWriter::new(Cursor::new(vec![]));
        for index in 0..source.len() {
            let mut entry = source.by_index(index).unwrap();
            let mut raw = vec![];
            entry.read_to_end(&mut raw).unwrap();
            let mut name = entry.name().to_owned();
            if name == "knownext-project.json" {
                let mut manifest: Value = serde_json::from_slice(&raw).unwrap();
                match variant {
                    0 => manifest["schemaVersion"] = json!(99),
                    1 => manifest["supplement"]["dataOnly"] = json!(false),
                    2 => {
                        for file in manifest["files"].as_array_mut().unwrap() {
                            if file["path"] == "Archivo KnowNext/Preferencias.json" {
                                file["path"] = json!("Preferencias.json");
                            }
                        }
                    }
                    3 => manifest["supplement"]["recordingSessions"] = json!(2001),
                    _ => {
                        manifest["schemaVersion"] = json!(3);
                        manifest["supplement"]["retainedFiles"] = json!(9999);
                    }
                }
                raw = serde_json::to_vec(&manifest).unwrap();
            }
            if variant == 2 && name == "Archivo KnowNext/Preferencias.json" {
                name = "Preferencias.json".into();
            }
            let options =
                SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored);
            if entry.is_dir() {
                writer.add_directory(name, options).unwrap();
            } else {
                writer.start_file(name, options).unwrap();
                writer.write_all(&raw).unwrap();
            }
        }
        let path = temp.path().join(format!("future-{variant}.zip"));
        fs::write(&path, writer.finish().unwrap().into_inner()).unwrap();
        let receiver = LocalApi::new(
            temp.path().join(format!("receiver-{variant}")),
            "qa".into(),
            "test".into(),
        );
        let received = call(
            &receiver,
            "POST",
            "/api/project-transfers",
            json!({"kind":"import"}),
        );
        let received_id = received["id"].as_str().unwrap();
        receiver
            .reserve_project_transfer_source(received_id)
            .unwrap();
        receiver
            .copy_project_transfer_source(received_id, &path)
            .unwrap();
        let failed = work(&receiver, received_id, "prepare", Value::Null);
        assert_eq!(failed["phase"], "failed", "{failed}");
        assert!(call(&receiver, "GET", "/api/projects", Value::Null)
            .as_array()
            .unwrap()
            .is_empty());
        assert!(path.exists());
    }
    assert_eq!(
        fs::read(payload(&temp.path().join("state"), id)).unwrap(),
        original
    );
}

#[test]
fn successive_private_transfers_preserve_prior_payloads_metadata_and_current_drafts_without_leaking_them_into_simple_packages(
) {
    let (temp, api, project, root) = fixture();
    let source_id = project["id"].as_str().unwrap();
    git(&root, &["init", "-q"]);
    git(&root, &["config", "core.hooksPath", ""]);
    git(&root, &["config", "user.name", "Owned QA"]);
    git(&root, &["config", "user.email", "qa@example.invalid"]);
    git(&root, &["add", "Acta.md"]);
    git(&root, &["commit", "-qm", "Historial conservado"]);
    call(
        &api,
        "PUT",
        &format!("/api/documents/{source_id}::Acta.md/draft"),
        json!({"markdown":"Borrador original privado\n"}),
    );
    let recording = temp
        .path()
        .join("state/recordings/01234567-0123-0123-0123-0123456789ab");
    fs::create_dir_all(&recording).unwrap();
    fs::write(recording.join("session.json"),serde_json::to_vec(&json!({"id":"01234567-0123-0123-0123-0123456789ab","status":"completed","destination":{"projectId":source_id},"chunks":[{"status":"completed","text":"Audio original"}],"samples":4,"audioDeleted":false})).unwrap()).unwrap();
    fs::write(recording.join("microphone.pcm"), [1u8, 0, 2, 0, 3, 0, 4, 0]).unwrap();
    let export = |api: &LocalApi, project: &str, private: bool| {
        let job = call(
            api,
            "POST",
            "/api/project-transfers",
            json!({"kind":"export","projectId":project,"includeArchive":private}),
        );
        let id = job["id"].as_str().unwrap().to_owned();
        let ready = work(api, &id, "prepare", Value::Null);
        (id, ready)
    };
    let import = |state: &Path, source: &Path, name: &str| {
        let api = LocalApi::new(state.into(), "qa".into(), "test".into());
        let job = call(
            &api,
            "POST",
            "/api/project-transfers",
            json!({"kind":"import"}),
        );
        let id = job["id"].as_str().unwrap();
        api.reserve_project_transfer_source(id).unwrap();
        api.copy_project_transfer_source(id, source).unwrap();
        let ready = work(&api, id, "prepare", Value::Null);
        assert_eq!(ready["phase"], "ready", "{ready}");
        let done = work(
            &api,
            id,
            "commit",
            json!({"archiveSha256":ready["archiveSha256"],"name":name}),
        );
        assert_eq!(done["phase"], "completed");
        let projects = call(&api, "GET", "/api/projects", Value::Null);
        let p = projects
            .as_array()
            .unwrap()
            .iter()
            .find(|p| p["id"] == done["targetProjectId"])
            .unwrap();
        let root = PathBuf::from(p["folderPath"].as_str().unwrap());
        let project = p["id"].as_str().unwrap().to_owned();
        work(&api, id, "discard", Value::Null);
        (api, project, root)
    };
    let (first_id, first) = export(&api, source_id, true);
    assert_eq!(first["phase"], "ready", "{first}");
    let receiver_state = temp.path().join("receiver-hop-one");
    let (receiver, receiver_id, received) = import(
        &receiver_state,
        &payload(&temp.path().join("state"), &first_id),
        "Primer traslado",
    );
    let old_files: Vec<_> = first["manifest"]["files"]
        .as_array()
        .unwrap()
        .iter()
        .filter_map(|file| file["path"].as_str())
        .filter(|path| path.starts_with("Archivo KnowNext/"))
        .map(|path| (path.to_owned(), fs::read(received.join(path)).unwrap()))
        .collect();
    let old_index: Value = serde_json::from_slice(
        &fs::read(received.join("Archivo KnowNext/Inventario.json")).unwrap(),
    )
    .unwrap();
    let old_draft = old_index["items"]
        .as_array()
        .unwrap()
        .iter()
        .find(|item| item["kind"] == "draft")
        .unwrap();
    fs::write(
        received.join("Acta.md"),
        format!(
            "Documento actual\n\n[Copia conservada](<Archivo KnowNext/{}>)\n",
            old_draft["editable"].as_str().unwrap()
        ),
    )
    .unwrap();
    call(
        &receiver,
        "PUT",
        &format!("/api/documents/{receiver_id}::Acta.md/draft"),
        json!({"markdown":"Borrador nuevo del receptor\n"}),
    );
    let (simple_id, simple) = export(&receiver, &receiver_id, false);
    assert_eq!(simple["phase"], "ready", "{simple}");
    assert_eq!(simple["manifest"]["schemaVersion"], 1);
    assert!(simple["manifest"]["files"]
        .as_array()
        .unwrap()
        .iter()
        .all(|file| !file["path"]
            .as_str()
            .unwrap()
            .starts_with("Archivo KnowNext/")));
    assert!(simple["manifest"]["exclusions"]
        .as_array()
        .unwrap()
        .iter()
        .any(|entry| entry["path"] == "Archivo KnowNext"));
    work(&receiver, &simple_id, "discard", Value::Null);
    let (second_id, second) = export(&receiver, &receiver_id, true);
    assert_eq!(second["phase"], "ready", "{second}");
    assert_eq!(second["manifest"]["schemaVersion"], 3);
    assert_eq!(
        second["manifest"]["supplement"]["retainedFiles"],
        old_files.len()
    );
    assert_eq!(second["manifest"]["supplement"]["drafts"], 2);
    assert_eq!(second["manifest"]["supplement"]["recordingSessions"], 1);
    assert_eq!(second["manifest"]["supplement"]["history"], true);
    assert!(second["manifest"]["referenceWarnings"]
        .as_array()
        .unwrap()
        .iter()
        .all(|entry| entry["path"] != "Acta.md"));
    let (final_api, final_id, final_root) = import(
        &temp.path().join("receiver-hop-two"),
        &payload(&receiver_state, &second_id),
        "Segundo traslado",
    );
    let index: Value = serde_json::from_slice(
        &fs::read(final_root.join("Archivo KnowNext/Inventario.json")).unwrap(),
    )
    .unwrap();
    assert_eq!(index["schemaVersion"], 2);
    assert_eq!(index["metadataSnapshots"].as_array().unwrap().len(), 3);
    for (path, raw) in &old_files {
        let relative = path.strip_prefix("Archivo KnowNext/").unwrap();
        let destination =
            if ["Inventario.json", "Preferencias.json", "LEEME.md"].contains(&relative) {
                index["metadataSnapshots"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .find(|entry| entry["name"] == relative && entry["sha256"] == sha(raw))
                    .unwrap()["path"]
                    .as_str()
                    .unwrap()
                    .to_owned()
            } else {
                relative.into()
            };
        assert_eq!(
            fs::read(final_root.join("Archivo KnowNext").join(destination)).unwrap(),
            *raw
        );
        assert_eq!(fs::read(received.join(path)).unwrap(), *raw);
    }
    let fresh = index["items"]
        .as_array()
        .unwrap()
        .iter()
        .find(|item| {
            item["kind"] == "draft" && item["editable"].as_str().unwrap().starts_with("Actual-")
        })
        .unwrap();
    assert_eq!(
        fs::read(
            final_root
                .join("Archivo KnowNext")
                .join(fresh["editable"].as_str().unwrap())
        )
        .unwrap(),
        b"Borrador nuevo del receptor\n"
    );
    assert!(!final_root.join(".git").exists());
    assert!(!temp.path().join("receiver-hop-two/recordings").exists());
    let (_, third) = export(&final_api, &final_id, true);
    assert_eq!(third["phase"], "ready", "{third}");
    assert_eq!(third["manifest"]["supplement"]["drafts"], 2);
    assert_eq!(third["manifest"]["supplement"]["recordingSessions"], 1);
    work(&receiver, &second_id, "discard", Value::Null);
    let wav = old_files
        .iter()
        .find(|(path, _)| path.ends_with(".wav"))
        .unwrap();
    let mut corrupted = wav.1.clone();
    corrupted[44] ^= 1;
    fs::write(received.join(&wav.0), &corrupted).unwrap();
    let (failed_id, failed) = export(&receiver, &receiver_id, true);
    assert_eq!(failed["phase"], "failed");
    assert!(!payload(&receiver_state, &failed_id).exists());
    assert_eq!(fs::read(received.join(&wav.0)).unwrap(), corrupted);
    work(&receiver, &failed_id, "discard", Value::Null);
    fs::write(received.join(&wav.0), &wav.1).unwrap();
    let mut repeated = old_index.clone();
    let duplicate = repeated["items"]
        .as_array()
        .unwrap()
        .iter()
        .find(|item| item["kind"] == "recording")
        .unwrap()
        .clone();
    repeated["items"].as_array_mut().unwrap().push(duplicate);
    let repeated_raw = serde_json::to_vec(&repeated).unwrap();
    fs::write(
        received.join("Archivo KnowNext/Inventario.json"),
        &repeated_raw,
    )
    .unwrap();
    let (repeated_id, repeated_result) = export(&receiver, &receiver_id, true);
    assert_eq!(repeated_result["phase"], "failed");
    assert!(!payload(&receiver_state, &repeated_id).exists());
    assert_eq!(
        fs::read(received.join("Archivo KnowNext/Inventario.json")).unwrap(),
        repeated_raw
    );
    work(&receiver, &repeated_id, "discard", Value::Null);
    let mut future = old_index.clone();
    future["schemaVersion"] = json!(99);
    let future_raw = serde_json::to_vec(&future).unwrap();
    fs::write(
        received.join("Archivo KnowNext/Inventario.json"),
        &future_raw,
    )
    .unwrap();
    let (future_id, future_result) = export(&receiver, &receiver_id, true);
    assert_eq!(future_result["phase"], "failed");
    assert!(!payload(&receiver_state, &future_id).exists());
    assert_eq!(
        fs::read(received.join("Archivo KnowNext/Inventario.json")).unwrap(),
        future_raw
    );
    assert_eq!(
        fs::read(root.join("Acta.md")).unwrap(),
        b"Primera version\n"
    );
}
