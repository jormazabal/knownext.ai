//! Local backup routes only; no providers or native UI.
use knownext_storage::LocalApi;
use serde_json::{json, Value};
use std::{fs, path::PathBuf};
fn call(a: &LocalApi, m: &str, p: &str, b: Value) -> Value {
    let r = a.handle(m, p, b, vec![]).unwrap();
    assert_eq!(r.status, 200, "{}", r.body);
    r.body
}
fn fixture() -> (tempfile::TempDir, LocalApi, String, PathBuf, PathBuf) {
    let d = tempfile::tempdir().unwrap();
    let state = d.path().join("state");
    let a = LocalApi::new(state.clone(), "qa".into(), "backup".into());
    let p = call(
        &a,
        "POST",
        "/api/projects",
        json!({"name":"Backup QA","versioningMode":"none","syncMode":"none"}),
    );
    let id = p["id"].as_str().unwrap().into();
    let root = PathBuf::from(p["folderPath"].as_str().unwrap());
    fs::write(root.join("source.md"), "# Original\nContenido local").unwrap();
    (d, a, id, root, state)
}
fn route(p: &str) -> String {
    format!("/api/projects/{p}/scheduled-backups")
}
#[test]
fn block9_backup_default_reads_and_idle_tick_make_no_backup_state() {
    let (_d, a, p, _root, state) = fixture();
    assert!(!state.join("scheduled-backups").exists());
    let v = call(&a, "GET", &route(&p), Value::Null);
    assert_eq!(v["policy"]["enabled"], false);
    assert_eq!(v["nextGeneration"], 1);
    assert!(v["snapshots"].as_array().unwrap().is_empty());
    assert_eq!(a.run_due_scheduled_backups().unwrap()["didRun"], false);
    assert!(!state.join("scheduled-backups").exists());
}

fn get(a: &LocalApi, p: &str) -> Value {
    call(a, "GET", &route(p), Value::Null)
}
fn policy(a: &LocalApi, p: &str, enabled: bool, keep: u8, private: bool, retention: bool) -> Value {
    let v = get(a, p);
    call(
        a,
        "PUT",
        &route(p),
        json!({"revision":v["revision"],"enabled":enabled,"keep":keep,"includeArchive":private,"ackRetention":retention,"ackBinding":true}),
    )
}
fn run(a: &LocalApi, p: &str) -> Value {
    let v = get(a, p);
    call(
        a,
        "POST",
        &format!("{}/run", route(p)),
        json!({"revision":v["revision"],"expectedGeneration":v["nextGeneration"],"acknowledge":true}),
    )
}
fn rejected(a: &LocalApi, m: &str, p: &str, b: Value) {
    match a.handle(m, p, b, vec![]) {
        Err(_) => (),
        Ok(r) => assert!(r.status >= 400, "unexpected success: {}", r.body),
    }
}
fn directory(state: &std::path::Path, p: &str) -> PathBuf {
    use sha2::{Digest, Sha256};
    state
        .join("scheduled-backups")
        .join(format!("{:x}", Sha256::digest(p.as_bytes())))
}
#[test]
fn block9_backup_manual_off_verified_cursor_rejects_replay() {
    let (_d, a, p, root, state) = fixture();
    let before = get(&a, &p);
    let request = json!({"revision":before["revision"],"expectedGeneration":1,"acknowledge":true});
    let v = call(&a, "POST", &format!("{}/run", route(&p)), request.clone());
    assert_eq!(v["receipt"]["phase"], "verified");
    assert_eq!(v["policy"]["enabled"], false);
    assert_eq!(v["nextGeneration"], 2);
    assert_eq!(v["receipt"]["archiveSha256"].as_str().unwrap().len(), 64);
    assert_eq!(
        fs::read_to_string(root.join("source.md")).unwrap(),
        "# Original\nContenido local"
    );
    assert!(directory(&state, &p).join("backup-1.zip").is_file());
    rejected(&a, "POST", &format!("{}/run", route(&p)), request);
    let proof = call(&a, "GET", &format!("{}/1", route(&p)), Value::Null);
    assert_eq!(proof["phase"], "verified");
    assert_eq!(proof["canReplay"], false);
}
#[test]
fn block9_backup_optin_daily_one_catchup_no_backfill() {
    use time::{format_description::well_known::Rfc3339, Duration, OffsetDateTime};
    let (_d, a, p, _root, _state) = fixture();
    let v = policy(&a, &p, true, 2, false, false);
    let due = OffsetDateTime::parse(v["nextDueAt"].as_str().unwrap(), &Rfc3339).unwrap();
    assert_eq!(
        a.run_due_scheduled_backups_at(due - Duration::seconds(1))
            .unwrap()["didRun"],
        false
    );
    let later = due + Duration::days(5);
    let tick = a.run_due_scheduled_backups_at(later).unwrap();
    assert_eq!(tick["didRun"], true);
    assert_eq!(tick["generation"], 1);
    assert_eq!(
        a.run_due_scheduled_backups_at(later).unwrap()["didRun"],
        false
    );
    let snap = get(&a, &p);
    let next = OffsetDateTime::parse(snap["nextDueAt"].as_str().unwrap(), &Rfc3339).unwrap();
    assert_eq!(next, later + Duration::hours(24));
    assert_eq!(snap["snapshots"].as_array().unwrap().len(), 1);
}
#[test]
fn block9_backup_retention_needs_consent_and_preserves_larger_scope() {
    let (_d, a, p, _root, state) = fixture();
    policy(&a, &p, false, 1, false, false);
    run(&a, &p);
    run(&a, &p);
    assert!(directory(&state, &p).join("backup-1.zip").is_file());
    policy(&a, &p, false, 1, false, true);
    let v = run(&a, &p);
    let retired = v["snapshots"]
        .as_array()
        .unwrap()
        .iter()
        .find(|r| r["generation"] == 1)
        .unwrap();
    assert_eq!(retired["phase"], "retired");
    assert!(!directory(&state, &p).join("backup-1.zip").exists());
    policy(&a, &p, false, 1, true, true);
    let private = run(&a, &p);
    assert_eq!(private["receipt"]["phase"], "verified");
    let generation = private["receipt"]["generation"].as_u64().unwrap();
    policy(&a, &p, false, 1, false, true);
    run(&a, &p);
    assert!(directory(&state, &p)
        .join(format!("backup-{generation}.zip"))
        .is_file());
    let receipt = call(
        &a,
        "GET",
        &format!("{}/{generation}", route(&p)),
        Value::Null,
    );
    assert_eq!(receipt["phase"], "verified");
}
#[test]
fn block9_backup_unplanned_exclusion_is_partial_no_retention() {
    let (_d, a, p, root, state) = fixture();
    policy(&a, &p, false, 1, false, true);
    run(&a, &p);
    fs::write(root.join("unhandled.bin"), b"do not discard").unwrap();
    let v = run(&a, &p);
    assert_eq!(v["receipt"]["phase"], "partial");
    assert_eq!(v["receipt"]["retentionEligible"], false);
    assert!(directory(&state, &p).join("backup-1.zip").is_file());
    let receipt = call(&a, "GET", &format!("{}/1", route(&p)), Value::Null);
    assert_eq!(receipt["phase"], "verified");
    assert_eq!(
        fs::read(root.join("unhandled.bin")).unwrap(),
        b"do not discard"
    );
}
#[test]
fn block9_backup_missing_source_still_restores_managed_zip_as_import() {
    let (_d, a, p, root, state) = fixture();
    let v = run(&a, &p);
    let hash = v["receipt"]["archiveSha256"].clone();
    drop(a);
    let preserved = root.with_file_name("source-preserved");
    fs::rename(&root, &preserved).unwrap();
    let a = LocalApi::new(state, "qa".into(), "backup".into());
    let snap = get(&a, &p);
    assert_eq!(snap["sourceAvailable"], false);
    assert_eq!(snap["bindingMatches"], false);
    assert_eq!(snap["policy"]["enabled"], false);
    let r = call(&a, "GET", &format!("{}/1", route(&p)), Value::Null);
    assert_eq!(r["phase"], "verified");
    let restored = call(
        &a,
        "POST",
        &format!("{}/1/restore", route(&p)),
        json!({"revision":snap["revision"],"archiveSha256":hash,"acknowledge":true,"ackBinding":true}),
    );
    assert_eq!(restored["transfer"]["kind"], "import");
    assert_eq!(restored["transfer"]["phase"], "ready");
    assert_eq!(restored["transfer"]["archiveSha256"], hash);
    assert!(restored["transfer"]["targetProjectId"].is_null());
    assert_eq!(restored["receipt"]["restoreStatus"], "ready");
    assert!(!root.exists());
    assert_eq!(
        fs::read_to_string(preserved.join("source.md")).unwrap(),
        "# Original\nContenido local"
    );
    let after = get(&a, &p);
    assert_eq!(after["policy"]["enabled"], false);
    rejected(
        &a,
        "POST",
        &format!("{}/1/restore", route(&p)),
        json!({"revision":after["revision"],"archiveSha256":hash,"acknowledge":true,"ackBinding":true}),
    );
}
#[test]
fn block9_backup_future_state_preserved_and_rejected() {
    let (_d, a, p, _root, state) = fixture();
    policy(&a, &p, false, 1, false, false);
    let path = directory(&state, &p).join("state.json");
    let mut v: Value = serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
    v["schemaVersion"] = json!(99);
    let bytes = serde_json::to_vec(&v).unwrap();
    fs::write(&path, &bytes).unwrap();
    rejected(&a, "GET", &route(&p), Value::Null);
    assert_eq!(a.run_due_scheduled_backups().unwrap()["didRun"], false);
    assert_eq!(fs::read(path).unwrap(), bytes);
}
#[test]
fn block9_backup_restart_observes_interruption_without_replay() {
    let (_d, a, p, _root, state) = fixture();
    run(&a, &p);
    let path = directory(&state, &p).join("state.json");
    let mut v: Value = serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
    v["receipts"][0]["phase"] = json!("preparing");
    v["receipts"][0]["ownerRuntime"] = json!("previous-runtime");
    v["receipts"][0]["archiveSha256"] = Value::Null;
    v["receipts"][0]["archiveBytes"] = json!(0);
    v["receipts"][0]["retentionEligible"] = json!(false);
    fs::write(&path, serde_json::to_vec(&v).unwrap()).unwrap();
    let snap = get(&a, &p);
    assert_eq!(snap["snapshots"][0]["phase"], "interrupted");
    assert_eq!(snap["nextGeneration"], 2);
    assert_eq!(a.run_due_scheduled_backups().unwrap()["didRun"], false);
    assert!(directory(&state, &p).join("backup-1.zip").is_file());
}

#[test]
fn block9_backup_restore_admission_rejection_does_not_consume_receipt() {
    let (_d, a, p, _root, _state) = fixture();
    let v = run(&a, &p);
    let hash = v["receipt"]["archiveSha256"].clone();
    let active = call(
        &a,
        "POST",
        "/api/project-transfers",
        json!({"kind":"import"}),
    );
    let snap = get(&a, &p);
    rejected(
        &a,
        "POST",
        &format!("{}/1/restore", route(&p)),
        json!({"revision":snap["revision"],"archiveSha256":hash,"acknowledge":true}),
    );
    let receipt = call(&a, "GET", &format!("{}/1", route(&p)), Value::Null);
    assert!(receipt["restoreTransferId"].is_null());
    assert_eq!(receipt["restoreStatus"], "none");
    let list = call(&a, "GET", "/api/project-transfers", Value::Null);
    assert_eq!(list["jobs"][0]["id"], active["id"]);
}
#[test]
fn block9_backup_corrupt_prior_payload_is_preserved_without_pruning() {
    let (_d, a, p, _root, state) = fixture();
    policy(&a, &p, false, 1, false, true);
    run(&a, &p);
    let path = directory(&state, &p).join("backup-1.zip");
    let mut changed = fs::read(&path).unwrap();
    changed[0] ^= 0xff;
    fs::write(&path, &changed).unwrap();
    let next = run(&a, &p);
    assert_eq!(next["receipt"]["phase"], "verified");
    assert_eq!(fs::read(&path).unwrap(), changed);
    let receipt = call(&a, "GET", &format!("{}/1", route(&p)), Value::Null);
    assert_ne!(receipt["phase"], "retired");
}

fn fill_history(a: &LocalApi, p: &str, state: &std::path::Path) {
    run(a, p);
    let dir = directory(state, p);
    let path = dir.join("state.json");
    let mut v: Value = serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
    let original = v["receipts"][0].clone();
    let mut rows = vec![];
    for generation in 1..=64 {
        let mut row = original.clone();
        row["generation"] = json!(generation);
        rows.push(row);
        if generation > 1 {
            fs::copy(
                dir.join("backup-1.zip"),
                dir.join(format!("backup-{generation}.zip")),
            )
            .unwrap();
        }
    }
    v["latestGeneration"] = json!(64);
    v["receipts"] = json!(rows);
    fs::write(path, serde_json::to_vec(&v).unwrap()).unwrap();
}
#[test]
fn block9_backup_full_history_explicit_retention_admits_next_generation() {
    let (_d, a, p, _root, state) = fixture();
    fill_history(&a, &p, &state);
    policy(&a, &p, false, 2, false, true);
    let v = run(&a, &p);
    assert_eq!(v["latestGeneration"], 65);
    assert_eq!(v["receipt"]["phase"], "verified");
    assert_eq!(v["snapshots"].as_array().unwrap().len(), 64);
    let anchor = call(&a, "GET", &format!("{}/64", route(&p)), Value::Null);
    assert_eq!(anchor["phase"], "verified");
    assert!(directory(&state, &p).join("backup-64.zip").is_file());
    assert!(!directory(&state, &p).join("backup-1.zip").exists());
}
#[test]
fn block9_backup_full_history_changed_anchor_preserves_all_and_cursor() {
    let (_d, a, p, _root, state) = fixture();
    fill_history(&a, &p, &state);
    policy(&a, &p, false, 1, false, true);
    let dir = directory(&state, &p);
    let anchor = dir.join("backup-64.zip");
    let mut bytes = fs::read(&anchor).unwrap();
    bytes[0] ^= 0xff;
    fs::write(&anchor, &bytes).unwrap();
    let before = get(&a, &p);
    let state_before = fs::read(dir.join("state.json")).unwrap();
    rejected(
        &a,
        "POST",
        &format!("{}/run", route(&p)),
        json!({"revision":before["revision"],"expectedGeneration":65,"acknowledge":true}),
    );
    assert_eq!(fs::read(dir.join("state.json")).unwrap(), state_before);
    assert!(dir.join("backup-1.zip").is_file());
    assert_eq!(fs::read(&anchor).unwrap(), bytes);
    assert!(!dir.join("backup-65.zip").exists());
    let after = get(&a, &p);
    assert_eq!(after["latestGeneration"], 64);
    assert_eq!(after["nextGeneration"], 65);
}

#[test]
fn block11_backup_round_robin_reaches_projects_beyond_first_two_hundred_and_shares_cursor() {
    use time::{format_description::well_known::Rfc3339, OffsetDateTime};
    let (_d, a, p, root, state) = fixture();
    let enabled = policy(&a, &p, true, 2, false, false);
    let due = OffsetDateTime::parse(enabled["nextDueAt"].as_str().unwrap(), &Rfc3339).unwrap();
    let registry_path = state.join("projects.json");
    let mut registry: Value = serde_json::from_slice(&fs::read(&registry_path).unwrap()).unwrap();
    let own = registry["projects"]
        .as_array()
        .unwrap()
        .iter()
        .find(|row| row["id"] == p)
        .unwrap()
        .clone();
    let mut rows = Vec::new();
    for index in 0..200 {
        let mut row = own.clone();
        row["id"] = json!(format!("missing-source-{index}"));
        row["name"] = json!(format!("Missing source {index}"));
        row["folderPath"] = json!(root.join(format!("unavailable-{index}")).to_string_lossy());
        rows.push(row);
    }
    rows.push(own);
    registry["projects"] = json!(rows);
    fs::write(&registry_path, serde_json::to_vec(&registry).unwrap()).unwrap();
    assert_eq!(
        a.run_due_scheduled_backups_at(due).unwrap()["didRun"],
        false
    );
    assert_eq!(get(&a, &p)["latestGeneration"], 0);
    let observed = a.clone().run_due_scheduled_backups_at(due).unwrap();
    assert_eq!(observed["didRun"], true);
    assert_eq!(observed["projectId"], p);
    assert_eq!(observed["generation"], 1);
    assert_eq!(
        fs::read(&registry_path).unwrap(),
        serde_json::to_vec(&registry).unwrap()
    );
}
