//! Explicit local QA: copy only six known stores into an owned temporary root.
//! Never invoke project, provider, credential or original-state mutations.
use knownext_storage::LocalApi;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    collections::BTreeMap,
    fs,
    path::{Path, PathBuf},
};
const FILES: [&str; 6] = [
    "config.json",
    "projects.json",
    "export-template.json",
    "notes.json",
    "ai/usage.json",
    "eur-usd.json",
];
fn hash(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}
fn require(condition: bool, stage: &str) -> Result<(), String> {
    if condition {
        Ok(())
    } else {
        Err(stage.into())
    }
}
fn secret(value: &Value) -> bool {
    match value {
        Value::Object(fields) => fields.iter().any(|(key, value)| {
            matches!(
                key.to_ascii_lowercase().as_str(),
                "apikey"
                    | "openaikey"
                    | "githubtoken"
                    | "githubaccesstoken"
                    | "openaiapikey"
                    | "openai_key"
                    | "accesstoken"
                    | "refreshtoken"
                    | "password"
                    | "clientsecret"
            ) && value.as_str().is_some_and(|text| !text.is_empty())
                || secret(value)
        }),
        Value::Array(items) => items.iter().any(secret),
        _ => false,
    }
}
fn read(path: &Path) -> Result<Vec<u8>, String> {
    let meta = fs::symlink_metadata(path).map_err(|_| "source-metadata")?;
    require(
        meta.is_file() && !meta.file_type().is_symlink() && meta.len() <= 8 * 1024 * 1024,
        "source-not-regular-or-too-large",
    )?;
    let bytes = fs::read(path).map_err(|_| "source-read")?;
    require(
        bytes.len() as u64 == meta.len(),
        "source-changed-during-read",
    )?;
    Ok(bytes)
}
fn api(
    api: &LocalApi,
    method: &str,
    path: &str,
    body: Value,
    stage: &str,
) -> Result<Value, String> {
    let response = api
        .handle(method, path, body, vec![])
        .map_err(|_| stage.to_string())?;
    require(response.status < 400, stage)?;
    Ok(response.body)
}
fn run() -> Result<Value, String> {
    let args = std::env::args().skip(1).collect::<Vec<_>>();
    require(args.len() == 2, "usage-source-directory-and-report")?;
    let source = PathBuf::from(&args[0]);
    let destination = PathBuf::from(&args[1]);
    let metadata = fs::symlink_metadata(&source).map_err(|_| "source-root")?;
    require(
        metadata.is_dir() && !metadata.file_type().is_symlink(),
        "source-root-not-regular",
    )?;
    let mut originals = BTreeMap::new();
    let mut files = vec![];
    for name in FILES {
        let bytes = read(&source.join(name))?;
        let value: Value = serde_json::from_slice(&bytes).map_err(|_| "source-json")?;
        require(
            !secret(&value),
            "source-legacy-credential-present-not-copied",
        )?;
        if name == "config.json" {
            require(
                value["lastRunAppVersion"] == "2.6.0",
                "source-not-labelled-2.6.0",
            )?;
        }
        files.push(json!({"file":name,"sourceSchemaVersion":value["schemaVersion"],"bytes":bytes.len(),"sha256":hash(&bytes)}));
        originals.insert(name.to_string(), bytes);
    }
    let private = tempfile::Builder::new()
        .prefix("knownext-migration-pilot-")
        .tempdir()
        .map_err(|_| "private-temp-create")?;
    let state = private.path().join("state");
    fs::create_dir(&state).map_err(|_| "private-state-create")?;
    for (name, bytes) in &originals {
        let path = state.join(name);
        fs::create_dir_all(path.parent().ok_or("private-parent")?)
            .map_err(|_| "private-parent-create")?;
        fs::write(path, bytes).map_err(|_| "private-copy")?;
    }
    for (name, bytes) in &originals {
        require(
            read(&source.join(name))? == *bytes,
            "source-changed-during-snapshot",
        )?;
    }
    let runtime = LocalApi::new(
        state.clone(),
        "3.0-pilot".into(),
        "isolated-profile-pilot".into(),
    );
    let review = api(
        &runtime,
        "GET",
        "/api/recovery/upgrade",
        Value::Null,
        "critical-review",
    )?;
    let usage = api(
        &runtime,
        "GET",
        "/api/ai/usage/ledger",
        Value::Null,
        "ledger-review",
    )?;
    api(&runtime, "GET", "/api/notes", Value::Null, "notes-read")?;
    for (name, bytes) in &originals {
        require(
            read(&state.join(name))? == *bytes,
            "review-mutated-private-snapshot",
        )?;
    }
    let upgraded = api(
        &runtime,
        "POST",
        "/api/recovery/upgrade",
        json!({"revision":review["revision"]}),
        "critical-upgrade",
    )?;
    require(
        matches!(upgraded["status"].as_str(), Some("completed" | "unchanged")),
        "critical-upgrade-not-complete",
    )?;
    if upgraded["status"] == "completed" {
        let point = upgraded["id"].as_str().ok_or("critical-point-id")?;
        for name in FILES.into_iter().take(3) {
            require(
                read(
                    &state
                        .join("migrations")
                        .join(point)
                        .join(format!("{name}.original")),
                )? == originals[name],
                "critical-original-copy",
            )?;
        }
    }
    let upgraded_usage = if usage["needsUpgrade"] == true {
        api(
            &runtime,
            "POST",
            "/api/ai/usage/ledger/upgrade",
            json!({"revision":usage["revision"]}),
            "ledger-upgrade",
        )?
    } else {
        usage.clone()
    };
    require(upgraded_usage["schemaVersion"] == 2, "ledger-version")?;
    require(
        upgraded_usage["originalCopyPreserved"] == true,
        "ledger-original-copy",
    )?;
    let ledger = read(&state.join("ai/usage.json"))?;
    let reopened = LocalApi::new(
        state.clone(),
        "3.0-pilot".into(),
        "isolated-profile-pilot".into(),
    );
    let ledger_observed = api(
        &reopened,
        "GET",
        "/api/ai/usage/ledger",
        Value::Null,
        "ledger-reopen",
    )?;
    require(
        ledger_observed["schemaVersion"] == 2 && read(&state.join("ai/usage.json"))? == ledger,
        "ledger-reopen-byte-equality",
    )?;
    let unchanged = api(
        &reopened,
        "GET",
        "/api/recovery/upgrade",
        Value::Null,
        "critical-reopen",
    )?;
    require(
        unchanged["canApply"] == false,
        "critical-reopen-compatibility",
    )?;
    let second = api(
        &reopened,
        "POST",
        "/api/ai/usage/ledger/upgrade",
        json!({"revision":ledger_observed["revision"]}),
        "ledger-repeat",
    )?;
    require(
        second["schemaVersion"] == 2 && read(&state.join("ai/usage.json"))? == ledger,
        "ledger-idempotence",
    )?;
    if upgraded["status"] == "completed" {
        let point = upgraded["id"].as_str().ok_or("restore-point-id")?;
        let recovery = api(
            &reopened,
            "GET",
            &format!("/api/recovery/upgrades/{point}"),
            Value::Null,
            "critical-recovery-review",
        )?;
        require(
            recovery["canRestore"] == true,
            "critical-recovery-unavailable",
        )?;
        let restored = api(
            &reopened,
            "POST",
            &format!("/api/recovery/upgrades/{point}/restore"),
            json!({"revision":recovery["revision"]}),
            "critical-restore",
        )?;
        require(restored["status"] == "restored", "critical-restore-result")?;
    }
    for name in FILES.into_iter().take(3) {
        require(
            read(&state.join(name))? == originals[name],
            "critical-restored-byte-equality",
        )?;
    }
    require(
        read(&state.join("ai/usage.json"))? == ledger,
        "critical-restore-replaced-new-ledger",
    )?;
    for name in ["notes.json", "eur-usd.json"] {
        require(
            read(&state.join(name))? == originals[name],
            "auxiliary-source-not-preserved",
        )?;
    }
    for (name, bytes) in &originals {
        require(
            read(&source.join(name))? == *bytes,
            "source-changed-independently-pilot-not-stable",
        )?;
    }
    let temp_root = std::env::temp_dir()
        .canonicalize()
        .map_err(|_| "temp-root-check")?;
    let private_path = private
        .path()
        .canonicalize()
        .map_err(|_| "private-path-check")?;
    require(
        private_path.starts_with(&temp_root)
            && private_path
                .file_name()
                .and_then(|name| name.to_str())
                .is_some_and(|name| name.starts_with("knownext-migration-pilot-")),
        "private-cleanup-scope",
    )?;
    private.close().map_err(|_| "private-cleanup")?;
    let report = json!({"status":"passed","source":"real-profile-labelled-2.6.0","scope":"six known stores copied to an owned temporary root; no project access","files":files,"criticalUpgradeStatus":upgraded["status"],"criticalOriginalCopiesExact":true,"criticalRestoreExact":true,"newLedgerSurvivesCriticalRestore":true,"ledger":{"sourceSchemaVersion":usage["schemaVersion"],"schemaVersion":upgraded_usage["schemaVersion"],"recentEntries":upgraded_usage["recentEntries"],"recordedEntries":upgraded_usage["recordedEntries"],"periodGroups":upgraded_usage["periodGroups"],"originalCopyPreserved":upgraded_usage["originalCopyPreserved"]},"notesAndExchangeBytesExact":true,"originalSourceBytesUnchanged":true,"privateCopyRemoved":true,"providersInvoked":false,"nativeUiOrInstallationAcceptance":false});
    require(!destination.exists(), "report-already-exists")?;
    fs::write(
        destination,
        serde_json::to_vec_pretty(&report).map_err(|_| "report-json")?,
    )
    .map_err(|_| "report-write")?;
    Ok(report)
}
fn main() {
    match run() {
        Ok(report) => println!(
            "{}",
            json!({"status":report["status"],"criticalUpgradeStatus":report["criticalUpgradeStatus"],"sourceUnchanged":report["originalSourceBytesUnchanged"],"privateCopyRemoved":report["privateCopyRemoved"],"providerCalls":0})
        ),
        Err(stage) => {
            eprintln!("Isolated profile pilot did not pass: {stage}");
            std::process::exit(1);
        }
    }
}
