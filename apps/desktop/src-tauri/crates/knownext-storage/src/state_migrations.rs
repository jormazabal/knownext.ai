//! Reviewed, resumable-by-observation upgrade of the three critical stores.
//! Recovery never overwrites data edited since the recorded upgrade.
use super::*;
use std::{fs, io::Read};
mod recovery;
mod retention;

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture() -> (tempfile::TempDir, LocalApi, PathBuf) {
        let owned = tempfile::tempdir().unwrap();
        let api = LocalApi::new(owned.path().join("state"), "2.6.0".into(), "test".into());
        let project = api
            .create_project(
                json!({"name":"Owned migration QA","versioningMode":"none","syncMode":"none"}),
            )
            .unwrap();
        let root = api.project_root(project["id"].as_str().unwrap()).unwrap();
        fs::write(root.join("document.md"), "Owned original source").unwrap();
        fs::write(root.join("note.knote"), b"owned note bytes unchanged").unwrap();
        fs::create_dir(root.join(".git")).unwrap();
        fs::write(root.join(".git/HEAD"), "owned history sentinel").unwrap();
        let mut registry = api.registry_checked().unwrap();
        registry["schemaVersion"] = json!(1);
        fs::write(api.registry_path(), serde_json::to_vec(&registry).unwrap()).unwrap();
        fs::write(api.config_path(),br##"{"schemaVersion":2,"appearance":{"theme":"dark"},"layout":{"leftSidebarWidth":240},"customPreserved":"owned preference"}"##).unwrap();
        let mut export = default_export_template();
        export["schemaVersion"] = json!(1);
        export["normal"]["fontSizePt"] = json!(12);
        fs::write(
            api.export_template_path(),
            serde_json::to_vec(&export).unwrap(),
        )
        .unwrap();
        (owned, api, root)
    }
    fn originals(api: &LocalApi) -> Vec<Vec<u8>> {
        STORES
            .iter()
            .map(|(_, file, ..)| fs::read(api.app_data_dir.join(file)).unwrap())
            .collect()
    }

    #[test]
    fn legacy_cohort_migrates_and_reopens_idempotently_with_exact_recovery_and_untouched_sources() {
        let (_owned, api, root) = fixture();
        let original = originals(&api);
        let review = api.review_state_upgrade().unwrap();
        assert_eq!(originals(&api), original);
        assert!(!api.app_data_dir.join("migrations").exists());
        assert_eq!(review["canApply"], true);
        let result = api
            .apply_state_upgrade(json!({"revision":review["revision"]}))
            .unwrap();
        assert_eq!(result["status"], "completed");
        let id = result["id"].as_str().unwrap();
        let reopened = LocalApi::new(api.app_data_dir.clone(), "3.0.0".into(), "test".into());
        assert_eq!(
            reopened.read_config_checked().unwrap()["appearance"]["theme"],
            "dark"
        );
        assert_eq!(
            reopened.read_config_checked().unwrap()["customPreserved"],
            "owned preference"
        );
        assert_eq!(
            reopened.read_export_template_checked().unwrap()["normal"]["fontSizePt"],
            12
        );
        let current = reopened.review_state_upgrade().unwrap();
        assert_eq!(current["canApply"], false);
        assert_eq!(
            reopened
                .apply_state_upgrade(json!({"revision":current["revision"]}))
                .unwrap()["status"],
            "unchanged"
        );
        assert_eq!(
            reopened.list_upgrade_recoveries().unwrap()["entries"]
                .as_array()
                .unwrap()
                .len(),
            1
        );
        let recovery = reopened.review_upgrade_recovery(id).unwrap();
        assert_eq!(recovery["canRestore"], true);
        assert!(recovery["entries"]
            .as_array()
            .unwrap()
            .iter()
            .all(|e| e["backupVerified"] == true));
        assert_eq!(
            reopened
                .restore_upgrade_recovery(id, json!({"revision":recovery["revision"]}))
                .unwrap()["status"],
            "restored"
        );
        assert_eq!(originals(&reopened), original);
        assert_eq!(
            fs::read_to_string(root.join("document.md")).unwrap(),
            "Owned original source"
        );
        assert_eq!(
            fs::read(root.join("note.knote")).unwrap(),
            b"owned note bytes unchanged"
        );
        assert_eq!(
            fs::read_to_string(root.join(".git/HEAD")).unwrap(),
            "owned history sentinel"
        );
    }

    #[test]
    fn partial_upgrade_is_observable_and_recovery_never_overwrites_a_later_edit() {
        let (_owned, api, _) = fixture();
        let original = originals(&api);
        let review = api.review_state_upgrade().unwrap();
        let project_path = api.registry_path();
        let permissions = fs::metadata(&project_path).unwrap().permissions();
        let mut readonly = permissions.clone();
        readonly.set_readonly(true);
        fs::set_permissions(&project_path, readonly).unwrap();
        let result = api.apply_state_upgrade(json!({"revision":review["revision"]}));
        fs::set_permissions(&project_path, permissions).unwrap();
        let result = result.unwrap();
        assert_eq!(result["status"], "review-required");
        let id = result["id"].as_str().unwrap();
        let recovery = api.review_upgrade_recovery(id).unwrap();
        assert_eq!(recovery["entries"][0]["status"], "applied");
        assert_eq!(recovery["entries"][1]["status"], "original");
        fs::write(api.export_template_path(), b"owned later edit").unwrap();
        assert!(api
            .restore_upgrade_recovery(id, json!({"revision":recovery["revision"]}))
            .is_err());
        assert_eq!(
            fs::read(api.export_template_path()).unwrap(),
            b"owned later edit"
        );
        fs::write(api.export_template_path(), &original[2]).unwrap();
        let recovery = api.review_upgrade_recovery(id).unwrap();
        assert_eq!(
            api.restore_upgrade_recovery(id, json!({"revision":recovery["revision"]}))
                .unwrap()["status"],
            "restored"
        );
        assert_eq!(originals(&api), original);
    }

    #[test]
    fn stale_review_future_formats_and_plaintext_credentials_are_preserved_without_new_backups() {
        let (_owned, api, _) = fixture();
        let review = api.review_state_upgrade().unwrap();
        let path = api.config_path();
        for content in [
            br#"{"schemaVersion":2,"appearance":{"theme":"light"}}"#.as_slice(),
            br#"{"schemaVersion":99,"private":"future canary"}"#.as_slice(),
            br#"{"schemaVersion":2,"ai":{"apiKey":"owned secret canary"}}"#.as_slice(),
        ] {
            fs::write(&path, content).unwrap();
            assert!(api
                .apply_state_upgrade(json!({"revision":review["revision"]}))
                .is_err());
            assert_eq!(fs::read(&path).unwrap(), content);
            assert!(!api.app_data_dir.join("migrations").exists());
        }
    }
}

const LIMIT: u64 = 8 * 1024 * 1024;
const MANIFEST_LIMIT: u64 = 64 * 1024;
const STORES: [(&str, &str, local_state::Store, u64); 3] = [
    ("config", "config.json", local_state::Store::Config, 3),
    ("projects", "projects.json", local_state::Store::Projects, 2),
    (
        "export",
        "export-template.json",
        local_state::Store::Export,
        2,
    ),
];

struct Prepared {
    key: String,
    filename: String,
    source: Vec<u8>,
    target: Vec<u8>,
    legacy: bool,
    source_version: Option<u64>,
}
struct Bundle {
    review: Value,
    files: Vec<Prepared>,
}

fn directory(path: &Path, optional: bool) -> Result<(), String> {
    match fs::symlink_metadata(path) {
        Ok(meta) if meta.is_dir() && !batch::linked(&meta) => Ok(()),
        Err(error) if optional && error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        _ => Err("La carpeta de migración no es regular o no está disponible".into()),
    }
}
fn bytes(path: &Path, maximum: u64) -> Result<Option<Vec<u8>>, String> {
    let meta = match fs::symlink_metadata(path) {
        Ok(meta) => meta,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(_) => return Err("No se puede consultar un archivo de migración".into()),
    };
    if !meta.is_file() || batch::linked(&meta) || meta.len() > maximum {
        return Err("Archivo de migración no regular o fuera de límites; se conserva".into());
    }
    let mut bytes = Vec::new();
    fs::File::open(path)
        .map_err(|_| "No se puede abrir un archivo de migración")?
        .take(maximum + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| "No se pudo completar una lectura de migración")?;
    if bytes.len() as u64 > maximum {
        return Err("El archivo creció fuera de los límites de migración".into());
    }
    Ok(Some(bytes))
}
fn secret_fields(value: &Value) -> bool {
    match value {
        Value::Object(object) => object.iter().any(|(key, value)| {
            (matches!(
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
            ) && value.as_str().is_some_and(|s| !s.is_empty()))
                || secret_fields(value)
        }),
        Value::Array(items) => items.iter().any(secret_fields),
        _ => false,
    }
}
fn prepare(
    key: &str,
    filename: &str,
    store: local_state::Store,
    current: u64,
    source: Vec<u8>,
) -> Result<Prepared, String> {
    let mut value = local_state::decode(store, &source)?;
    if secret_fields(&value) {
        return Err("Este estado contiene credenciales antiguas. Debe revisarse su migración al almacén nativo antes de conservar una copia".into());
    }
    let version = value["schemaVersion"].as_u64();
    let legacy = version != Some(current);
    if legacy {
        let had_updated_at = value.get("updatedAt").is_some();
        match key {
            "config" => normalize_config(&mut value),
            "projects" => {
                if let Some(projects) = value["projects"].as_array_mut() {
                    for project in projects {
                        normalize_project_metadata_in_place(project);
                    }
                }
            }
            "export" => {
                let mut defaults = default_export_template();
                merge(&mut defaults, &value);
                value = defaults;
            }
            _ => unreachable!(),
        }
        // Config and export defaults include the current time. A format upgrade
        // preserves missing metadata instead of inventing a preference edit.
        if !had_updated_at {
            value.as_object_mut().unwrap().remove("updatedAt");
        }
        value["schemaVersion"] = json!(current);
    }
    let target = if legacy {
        serde_json::to_vec_pretty(&value)
            .map_err(|_| "No se pudo preparar el estado actualizado")?
    } else {
        source.clone()
    };
    if target.len() as u64 > LIMIT {
        return Err("El estado actualizado supera8MiB; se conserva el original".into());
    }
    local_state::decode(store, &target)?;
    Ok(Prepared {
        key: key.into(),
        filename: filename.into(),
        source,
        target,
        legacy,
        source_version: version,
    })
}
fn bundle(api: &LocalApi) -> Result<Bundle, String> {
    directory(&api.app_data_dir, false)?;
    let mut entries = vec![];
    let mut files = vec![];
    for (key, filename, store, current) in STORES {
        let read = bytes(&api.app_data_dir.join(filename), LIMIT);
        let mut entry = json!({"id":key,"filename":filename,"status":"missing","sourceVersion":null,"targetVersion":current,"fingerprint":null,"message":null});
        match read {
            Ok(Some(source)) => {
                entry["fingerprint"] = json!(sha256_hex(&source));
                let prepared = prepare(key, filename, store, current, source);
                match prepared {
                    Ok(file) => {
                        entry["sourceVersion"] = json!(file.source_version);
                        entry["status"] = json!(if file.legacy { "legacy" } else { "compatible" });
                        files.push(file);
                    }
                    Err(error) => {
                        entry["status"] = json!("blocked");
                        entry["message"] = json!(error);
                    }
                }
            }
            Ok(None) => (),
            Err(error) => {
                entry["status"] = json!("blocked");
                entry["message"] = json!(error);
            }
        }
        entries.push(entry);
    }
    let revision =
        sha256_hex(&serde_json::to_vec(&entries).map_err(|_| "No se pudo preparar la revisión")?);
    let can_apply = entries.iter().any(|e| e["status"] == "legacy")
        && !entries.iter().any(|e| e["status"] == "blocked");
    Ok(Bundle {
        review: json!({"schemaVersion":1,"id":"critical-state-upgrade","target":"3.0","checkedAt":knownext_core::now_iso(),"revision":revision,"entries":entries,"canApply":can_apply,"scope":"critical-state-only"}),
        files,
    })
}

fn folder(api: &LocalApi, id: &str) -> Result<PathBuf, String> {
    if !id.starts_with("migration-") || !request_scope::portable_id(id) {
        return Err("Identidad de migración no válida".into());
    }
    directory(&api.app_data_dir, false)?;
    let root = api.app_data_dir.join("migrations");
    directory(&root, false)?;
    let path = root.join(id);
    directory(&path, false)?;
    Ok(path)
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Journal {
    schema_version: u64,
    id: String,
    target: String,
    created_at: String,
    status: String,
    trigger: Option<String>,
    entries: Vec<JournalEntry>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct JournalEntry {
    id: String,
    before: String,
    after: String,
    applied: bool,
}
fn valid_manifest(value: &Value, id: &str) -> Result<(), String> {
    let manifest: Journal = serde_json::from_value(value.clone()).map_err(|_| {
        "Diario de migración desconocido o incompleto; se conserva sin autorizar cambios"
    })?;
    let hash =
        |value: &str| value.len() == 64 && value.bytes().all(|byte| byte.is_ascii_hexdigit());
    if manifest.schema_version != 1
        || manifest.id != id
        || manifest.target != "3.0"
        || !request_scope::portable_id(id)
        || !id.starts_with("migration-")
        || OffsetDateTime::parse(&manifest.created_at, &Rfc3339).is_err()
        || !matches!(
            manifest.status.as_str(),
            "preparing" | "prepared" | "applying" | "completed" | "restored"
        )
        || manifest
            .trigger
            .as_ref()
            .is_some_and(|value| value != "ordinary-format-write")
        || manifest.entries.is_empty()
        || manifest.entries.len() > 3
    {
        return Err("Diario de migración no compatible; se conserva sin autorizar cambios".into());
    }
    let mut ids = BTreeSet::new();
    for entry in manifest.entries {
        if !STORES.iter().any(|(key, ..)| *key == entry.id)
            || !ids.insert(entry.id)
            || !hash(&entry.before)
            || !hash(&entry.after)
        {
            return Err("Entrada de migración no compatible; se conserva".into());
        }
        let _ = entry.applied;
    }
    Ok(())
}
fn journal(api: &LocalApi, id: &str) -> Result<(PathBuf, Value, String), String> {
    let path = folder(api, id)?;
    let content = bytes(&path.join("manifest.json"), MANIFEST_LIMIT)?
        .ok_or("No se conservó un diario completo; no se reanuda automáticamente")?;
    let value: Value = serde_json::from_slice(&content)
        .map_err(|_| "Diario de migración ilegible; se conserva")?;
    valid_manifest(&value, id)?;
    Ok((path, value, sha256_hex(&content)))
}
fn write_journal(path: &Path, value: &Value, expected: Option<&str>) -> Result<String, String> {
    valid_manifest(value, value["id"].as_str().unwrap_or(""))?;
    directory(path, false)?;
    let content = serde_json::to_vec_pretty(value).map_err(|_| "No se pudo preparar el diario")?;
    if content.len() as u64 > MANIFEST_LIMIT {
        return Err("Diario fuera de límites".into());
    }
    let destination = path.join("manifest.json");
    let existing = bytes(&destination, MANIFEST_LIMIT)?;
    match (expected, existing.as_deref()) {
        (None, None) => atomic_io::create(&destination, &content),
        (Some(hash), Some(previous)) if sha256_hex(previous) == hash => {
            atomic_io::write(&destination, &content)
        }
        _ => {
            return Err(
                "El diario cambió desde su revisión; se conservan sus bytes y los estados actuales"
                    .into(),
            )
        }
    }
    .map_err(|_| "No se pudo confirmar el diario de migración")?;
    if bytes(&destination, MANIFEST_LIMIT)?.as_deref() != Some(content.as_slice()) {
        return Err("No se confirmó la revisión del diario escrito; consulta el estado antes de otra acción".into());
    }
    Ok(sha256_hex(&content))
}
fn state_matches(
    api: &LocalApi,
    expected: &BTreeMap<String, Option<String>>,
) -> Result<(), String> {
    for (key, filename, ..) in STORES {
        if bytes(&api.app_data_dir.join(filename), LIMIT)?.map(|value| sha256_hex(&value))
            != expected.get(key).cloned().unwrap_or(None)
        {
            return Err("Una entrada de la cohorte cambió; se conservan todos los estados actuales y se requiere otra revisión".into());
        }
    }
    Ok(())
}
fn unchanged_journal(api: &LocalApi, id: &str, expected: &str) -> Result<(), String> {
    retention::ensure_active(api, id)?;
    if journal(api, id)?.2 != expected {
        return Err(
            "El diario cambió durante la operación; se conserva y se requiere otra revisión".into(),
        );
    }
    Ok(())
}
fn original_copies_match(path: &Path, files: &[Prepared]) -> Result<(), String> {
    for file in files {
        if bytes(&path.join(format!("{}.original", file.filename)), LIMIT)?.as_deref()
            != Some(file.source.as_slice())
        {
            return Err(
                "Una copia original cambió; se conservan los estados y se requiere revisión".into(),
            );
        }
    }
    Ok(())
}
fn result(id: &str, status: &str, message: &str, can_review: bool) -> Value {
    json!({"id":id,"status":status,"message":message,"canReview":can_review,"checkedAt":knownext_core::now_iso()})
}

impl LocalApi {
    /// Ordinary preference saves may normalize a legacy format too. They use the
    /// same recoverable journal as an explicit upgrade, before replacing bytes.
    pub(super) fn write_format_transition(
        &self,
        destination: &Path,
        value: &Value,
    ) -> Result<bool, String> {
        let Some((key, filename, store, current)) = STORES
            .iter()
            .find(|(_, filename, ..)| destination == self.app_data_dir.join(filename))
        else {
            return Ok(false);
        };
        let Some(source) = bytes(destination, LIMIT)? else {
            return Ok(false);
        };
        let original = local_state::decode(*store, &source)?;
        if original["schemaVersion"].as_u64() == Some(*current)
            || value["schemaVersion"].as_u64() != Some(*current)
        {
            return Ok(false);
        }
        if secret_fields(&original) {
            return Err("Hay credenciales legadas en este estado. Debe revisarse su protección nativa antes de actualizar el formato".into());
        }
        let target = serde_json::to_vec_pretty(value)
            .map_err(|_| "No se pudo preparar el formato actualizado")?;
        if target.len() as u64 > LIMIT {
            return Err("El formato actualizado supera el límite de conservación".into());
        }
        let root = self.app_data_dir.join("migrations");
        directory(&root, true)?;
        if !root.exists() {
            fs::create_dir(&root).map_err(|_| "No se puede conservar el formato original")?;
        }
        directory(&root, false)?;
        let id = knownext_core::compact_id("migration");
        let path = root.join(&id);
        fs::create_dir(&path).map_err(|_| "No se puede preparar la recuperación del formato")?;
        let backup = path.join(format!("{filename}.original"));
        atomic_io::create(&backup, &source)
            .map_err(|_| "No se confirmó la copia original; no se ha actualizado el formato")?;
        if bytes(&backup, LIMIT)?.as_deref() != Some(source.as_slice()) {
            return Err(
                "La copia original no se pudo verificar; no se ha actualizado el formato".into(),
            );
        }
        let mut manifest = json!({"schemaVersion":1,"id":id,"target":"3.0","createdAt":knownext_core::now_iso(),"status":"prepared","trigger":"ordinary-format-write","entries":[{"id":key,"before":sha256_hex(&source),"after":sha256_hex(&target),"applied":false}]});
        let revision = write_journal(&path, &manifest, None)?;
        if bytes(destination, LIMIT)?.as_deref() != Some(source.as_slice()) {
            return Err("El original cambió durante la conservación; se mantienen las copias y el estado actual".into());
        }
        atomic_io::write(destination, &target).map_err(|_| {
            "No se confirmó la actualización del formato; se conserva la copia original"
        })?;
        manifest["entries"][0]["applied"] = json!(true);
        manifest["status"] = json!("completed");
        write_journal(&path,&manifest,Some(&revision)).map_err(|_|"El formato cambió y su original está conservado; revisa Recuperación antes de repetir la acción")?;
        Ok(true)
    }
    pub(super) fn list_upgrade_recoveries(&self) -> Result<Value, String> {
        directory(&self.app_data_dir, false)?;
        let root = self.app_data_dir.join("migrations");
        directory(&root, true)?;
        if !root.exists() {
            return Ok(json!({"entries":[],"limited":false,"checkedAt":knownext_core::now_iso()}));
        }
        let started = std::time::Instant::now();
        let mut entries = vec![];
        let mut limited = false;
        for item in fs::read_dir(root).map_err(|_| "No se pueden consultar las migraciones")? {
            if entries.len() >= 128 || started.elapsed() > Duration::from_secs(2) {
                limited = true;
                break;
            }
            let item = item.map_err(|_| "No se pudo consultar una entrada de migración")?;
            let meta = fs::symlink_metadata(item.path())
                .map_err(|_| "No se pudo verificar una migración")?;
            let id = item.file_name().to_string_lossy().into_owned();
            if !meta.is_dir() || batch::linked(&meta) || !id.starts_with("migration-") {
                continue;
            }
            let entry = match journal(self, &id) {
                Ok((_, manifest, _)) => {
                    json!({"id":id,"createdAt":manifest["createdAt"],"status":manifest["status"],"canReview":true})
                }
                Err(_) => {
                    json!({"id":id,"createdAt":null,"status":"unavailable","canReview":false})
                }
            };
            let mut entry = entry;
            entry["retentionStatus"] =
                json!(retention::status(self, &id).unwrap_or_else(|_| "unavailable".into()));
            entry["canManage"] = json!(true);
            entries.push(entry);
        }
        entries.sort_by(|a, b| b["id"].as_str().cmp(&a["id"].as_str()));
        Ok(json!({"entries":entries,"limited":limited,"checkedAt":knownext_core::now_iso()}))
    }
    pub(super) fn review_state_upgrade(&self) -> Result<Value, String> {
        Ok(bundle(self)?.review)
    }
    pub(super) fn apply_state_upgrade(&self, payload: Value) -> Result<Value, String> {
        let prepared = bundle(self)?;
        if payload["revision"] != prepared.review["revision"] {
            return Err(
                "El estado cambió. Revisa de nuevo antes de actualizar; no se ha escrito".into(),
            );
        }
        if prepared.review["entries"]
            .as_array()
            .unwrap()
            .iter()
            .any(|e| e["status"] == "blocked")
        {
            return Err("Hay estados no compatibles. Se conservan sin cambios".into());
        }
        if prepared.review["canApply"] != true {
            return Ok(result(
                "critical-state-upgrade",
                "unchanged",
                "Los formatos revisados no requieren actualización",
                false,
            ));
        }
        let root = self.app_data_dir.join("migrations");
        directory(&root, true)?;
        if !root.exists() {
            fs::create_dir(&root).map_err(|_| "No se puede preparar la conservación privada")?;
        }
        directory(&root, false)?;
        let id = knownext_core::compact_id("migration");
        let path = root.join(&id);
        fs::create_dir(&path).map_err(|_| "No se puede preparar el punto de recuperación")?;
        let mut manifest = json!({"schemaVersion":1,"id":id,"target":"3.0","createdAt":knownext_core::now_iso(),"status":"preparing","entries":prepared.files.iter().map(|file|json!({"id":file.key,"before":sha256_hex(&file.source),"after":sha256_hex(&file.target),"applied":false})).collect::<Vec<_>>()});
        for file in &prepared.files {
            let backup = path.join(format!("{}.original", file.filename));
            if atomic_io::create(&backup, &file.source).is_err()
                || bytes(&backup, LIMIT)?.as_deref() != Some(file.source.as_slice())
            {
                return Ok(result(
                    &id,
                    "preparation-failed",
                    "No se confirmó una copia completa. No se ha sustituido ningún estado",
                    false,
                ));
            }
        }
        manifest["status"] = json!("prepared");
        let mut manifest_revision = match write_journal(&path, &manifest, None) {
            Ok(revision) => revision,
            Err(_) => {
                return Ok(result(&id,"preparation-failed","Las copias se conservan; no se pudo confirmar el diario. Ningún original se ha sustituido",false));
            }
        };
        if bundle(self)?.review["revision"] != prepared.review["revision"] {
            return Ok(result(&id,"review-required","El estado cambió durante la conservación. Se mantienen las copias y los originales actuales",true));
        }
        let mut expected: BTreeMap<String, Option<String>> = prepared.review["entries"]
            .as_array()
            .unwrap()
            .iter()
            .map(|entry| {
                (
                    entry["id"].as_str().unwrap().to_string(),
                    entry["fingerprint"].as_str().map(str::to_string),
                )
            })
            .collect();
        for (index, file) in prepared.files.iter().enumerate() {
            if !file.legacy {
                continue;
            }
            if state_matches(self, &expected)
                .and_then(|_| unchanged_journal(self, &id, &manifest_revision))
                .and_then(|_| original_copies_match(&path, &prepared.files))
                .is_err()
            {
                return Ok(result(
                    &id,
                    "review-required",
                    "Cambió el conjunto revisado o su diario. Se conservan los pasos y originales",
                    true,
                ));
            }
            let source = self.app_data_dir.join(&file.filename);
            if bytes(&source, LIMIT)?.as_deref() != Some(file.source.as_slice()) {
                return Ok(result(&id,"review-required","Una entrada cambió. Se conservan los pasos confirmados y las copias; revisa el resultado",true));
            }
            if atomic_io::write(&source, &file.target).is_err() {
                return Ok(result(&id,"review-required","No se pudo completar una escritura. Se conservan los pasos confirmados y las copias; revisa el resultado",true));
            }
            expected.insert(file.key.clone(), Some(sha256_hex(&file.target)));
            manifest["entries"][index]["applied"] = json!(true);
            manifest["status"] = json!("applying");
            match write_journal(&path, &manifest, Some(&manifest_revision)) {
                Ok(revision) => manifest_revision = revision,
                Err(_) => {
                    return Ok(result(&id,"review-required","Hubo un cambio de estado, pero el diario no quedó confirmado. Revisa los hashes reales antes de otra acción",true));
                }
            }
        }
        if state_matches(self, &expected)
            .and_then(|_| unchanged_journal(self, &id, &manifest_revision))
            .and_then(|_| original_copies_match(&path, &prepared.files))
            .is_err()
        {
            return Ok(result(
                &id,
                "review-required",
                "Cambió el conjunto al terminar; consulta los estados observados",
                true,
            ));
        }
        manifest["status"] = json!("completed");
        if write_journal(&path, &manifest, Some(&manifest_revision)).is_err() {
            return Ok(result(&id,"review-required","Los cambios se completaron; no se confirmó el último acuse del diario. Revisa el resultado",true));
        }
        Ok(result(
            &id,
            "completed",
            "Estado crítico actualizado; copias originales verificadas y conservadas",
            true,
        ))
    }
}
