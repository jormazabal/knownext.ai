//! Technical events only: free-form messages never enter this persisted format.
use super::*;
use std::{fs, io::Read, sync::Mutex};
const MAX_BYTES: u64 = 512 * 1024;
const MAX_EVENTS: usize = 1000;
const FILE: &str = "diagnostics-v1.json";
static WRITE: Mutex<()> = Mutex::new(());

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Store {
    schema_version: u32,
    events: Vec<Event>,
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Event {
    id: String,
    at: String,
    level: Level,
    operation: Operation,
    code: Code,
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
enum Level {
    Error,
    Info,
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
enum Operation {
    Startup,
    Document,
    Project,
    Ai,
    Settings,
    Runtime,
    Application,
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
enum Code {
    OperationFailed,
    OperationRecorded,
}

fn operation(source: &str) -> Operation {
    match source.split('.').nth(1).unwrap_or(source) {
        "startup" => Operation::Startup,
        "document" | "save" | "autosave" | "editor" => Operation::Document,
        "project" | "projects" => Operation::Project,
        "ai" => Operation::Ai,
        "settings" | "config" => Operation::Settings,
        "runtime" => Operation::Runtime,
        _ => Operation::Application,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture() -> (tempfile::TempDir, LocalApi) {
        let temp = tempfile::tempdir().unwrap();
        let api = LocalApi::new(
            temp.path().into(),
            "2.6.0".into(),
            "private-profile-not-for-export".into(),
        );
        (temp, api)
    }
    #[test]
    fn events_obey_disabled_recording_exclude_content_and_retain_only_the_bounded_ring() {
        let (_temp, api) = fixture();
        let secret = "private-document-prompt-api-key-canary";
        let disabled = api
            .record_safe_diagnostic(json!({"source":secret,"message":secret,"detail":secret}))
            .unwrap();
        assert_eq!(disabled["recorded"], false);
        assert!(!api.logs_dir().exists());
        api.update_config(json!({"diagnostics":{"traceLoggingEnabled":true}}))
            .unwrap();
        fs::create_dir(api.logs_dir()).unwrap();
        fs::write(api.logs_dir().join("knownext.log"), secret).unwrap();
        let receipt = api
            .record_safe_diagnostic(
                json!({"source":format!("app.document.{secret}"),"message":secret,"detail":secret}),
            )
            .unwrap();
        assert_eq!(receipt["recorded"], true);
        let report = api.safe_diagnostic_report().unwrap();
        assert_eq!(report["events"][0]["id"], receipt["eventId"]);
        assert_eq!(report["events"][0]["operation"], "document");
        let serialized = report.to_string();
        assert!(!serialized.contains(secret));
        assert!(!serialized.contains("private-profile"));
        assert!(!serialized.contains(&api.app_data_dir.to_string_lossy().to_string()));
        assert_eq!(
            fs::read_to_string(api.logs_dir().join("knownext.log")).unwrap(),
            secret
        );
        let events = (0..MAX_EVENTS)
            .map(|index| Event {
                id: format!("diagnostic-1-{index:x}"),
                at: knownext_core::now_iso(),
                level: Level::Info,
                operation: Operation::Runtime,
                code: Code::OperationRecorded,
            })
            .collect();
        fs::write(
            api.logs_dir().join(FILE),
            serde_json::to_vec(&Store {
                schema_version: 1,
                events,
            })
            .unwrap(),
        )
        .unwrap();
        let next = api
            .record_safe_diagnostic(json!({"level":"info","source":secret}))
            .unwrap();
        let report = api.safe_diagnostic_report().unwrap();
        let events = report["events"].as_array().unwrap();
        assert_eq!(events.len(), MAX_EVENTS);
        assert!(!events.iter().any(|event| event["id"] == "diagnostic-1-0"));
        assert_eq!(events.last().unwrap()["id"], next["eventId"]);
        assert_eq!(events.last().unwrap()["operation"], "application");
        assert!(fs::metadata(api.logs_dir().join(FILE)).unwrap().len() <= MAX_BYTES);
    }
    #[test]
    fn unreadable_future_and_failed_writes_preserve_diagnostic_bytes_without_exporting_unknown_fields(
    ) {
        let (_temp, api) = fixture();
        api.update_config(json!({"diagnostics":{"traceLoggingEnabled":true}}))
            .unwrap();
        fs::create_dir(api.logs_dir()).unwrap();
        let path = api.logs_dir().join(FILE);
        for bytes in [
            b"{\"schemaVersion\":99,\"events\":[],\"private\":\"keep\"}".as_slice(),
            b"not-json".as_slice(),
        ] {
            fs::write(&path, bytes).unwrap();
            assert!(api.safe_diagnostic_report().is_err());
            assert!(api.record_safe_diagnostic(json!({})).is_err());
            assert_eq!(fs::read(&path).unwrap(), bytes);
        }
        fs::write(&path, b"{\"schemaVersion\":1,\"events\":[]}").unwrap();
        let before = fs::read(&path).unwrap();
        let mut permissions = fs::metadata(&path).unwrap().permissions();
        permissions.set_readonly(true);
        fs::set_permissions(&path, permissions.clone()).unwrap();
        let failed = api.record_safe_diagnostic(json!({"source":"settings"}));
        permissions.set_readonly(false);
        fs::set_permissions(&path, permissions).unwrap();
        assert!(failed.is_err());
        assert_eq!(fs::read(&path).unwrap(), before);
    }
}
fn regular_directory(path: &Path) -> Result<(), String> {
    let meta = fs::symlink_metadata(path)
        .map_err(|_| "No se puede consultar la carpeta de diagnóstico")?;
    if !meta.is_dir() || batch::linked(&meta) {
        return Err("El diagnóstico necesita una carpeta regular; se conserva el almacén".into());
    }
    Ok(())
}
fn valid_id(id: &str) -> bool {
    let Some(rest) = id.strip_prefix("diagnostic-") else {
        return false;
    };
    let parts = rest.split('-').collect::<Vec<_>>();
    parts.len() == 2
        && parts.iter().all(|part| {
            !part.is_empty() && part.len() <= 32 && part.bytes().all(|b| b.is_ascii_hexdigit())
        })
}
fn read(root: &Path) -> Result<Store, String> {
    regular_directory(root)?;
    let folder = root.join("logs");
    match fs::symlink_metadata(&folder) {
        Ok(_) => regular_directory(&folder)?,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok(Store {
                schema_version: 1,
                events: vec![],
            })
        }
        Err(_) => return Err("No se puede consultar el diagnóstico local".into()),
    }
    let path = folder.join(FILE);
    let metadata = match fs::symlink_metadata(&path) {
        Ok(meta) => meta,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok(Store {
                schema_version: 1,
                events: vec![],
            })
        }
        Err(_) => return Err("No se puede consultar el diagnóstico local".into()),
    };
    if !metadata.is_file() || batch::linked(&metadata) || metadata.len() > MAX_BYTES {
        return Err("Diagnóstico no regular o fuera de 512 KiB; se conserva".into());
    }
    let mut bytes = vec![];
    fs::File::open(path)
        .map_err(|_| "No se puede abrir el diagnóstico")?
        .take(MAX_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| "No se puede leer el diagnóstico")?;
    if bytes.len() as u64 > MAX_BYTES {
        return Err("El diagnóstico supera 512 KiB; se conserva".into());
    }
    let store: Store = serde_json::from_slice(&bytes)
        .map_err(|_| "Diagnóstico dañado o de formato desconocido; se conserva")?;
    let mut ids = BTreeSet::new();
    if store.schema_version != 1
        || store.events.len() > MAX_EVENTS
        || store.events.iter().any(|event| {
            !valid_id(&event.id)
                || !ids.insert(&event.id)
                || OffsetDateTime::parse(&event.at, &Rfc3339).is_err()
        })
    {
        return Err("Diagnóstico no compatible; se conserva sin exportar".into());
    }
    Ok(store)
}

impl LocalApi {
    pub fn safe_diagnostic_status(&self) -> Result<Value, String> {
        let enabled = self.read_config_checked()?["diagnostics"]["traceLoggingEnabled"].as_bool()
            == Some(true);
        let folder = self.logs_dir();
        regular_directory(&self.app_data_dir)?;
        let exists = match fs::symlink_metadata(&folder) {
            Ok(_) => {
                regular_directory(&folder)?;
                true
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => false,
            Err(_) => return Err("No se puede consultar la carpeta de diagnóstico".into()),
        };
        Ok(
            json!({"enabled":enabled,"folderPath":folder.to_string_lossy(),"filePath":folder.join(FILE).to_string_lossy(),"directoryExists":exists,"format":"technical-events-v1","maximumEvents":MAX_EVENTS,"maximumBytes":MAX_BYTES,"legacyLogsExcluded":true}),
        )
    }
    pub fn record_safe_diagnostic(&self, body: Value) -> Result<Value, String> {
        let _guard = WRITE
            .lock()
            .map_err(|_| "No se puede registrar el diagnóstico")?;
        let mut status = self.safe_diagnostic_status()?;
        if status["enabled"] != true {
            status["recorded"] = json!(false);
            return Ok(status);
        }
        let mut store = read(&self.app_data_dir)?;
        let info = body["level"].as_str() == Some("info");
        let id = knownext_core::compact_id("diagnostic");
        store.events.push(Event {
            id: id.clone(),
            at: knownext_core::now_iso(),
            level: if info { Level::Info } else { Level::Error },
            operation: operation(body["source"].as_str().unwrap_or("application")),
            code: if info {
                Code::OperationRecorded
            } else {
                Code::OperationFailed
            },
        });
        if store.events.len() > MAX_EVENTS {
            store.events.drain(..store.events.len() - MAX_EVENTS);
        }
        let bytes =
            serde_json::to_vec(&store).map_err(|_| "No se puede preparar el diagnóstico")?;
        if bytes.len() as u64 > MAX_BYTES {
            return Err("El diagnóstico supera su límite; se conserva el anterior".into());
        }
        let folder = self.logs_dir();
        if !folder.exists() {
            fs::create_dir(&folder).map_err(|_| "No se puede crear la carpeta de diagnóstico")?;
        }
        regular_directory(&folder)?;
        atomic_io::write(&folder.join(FILE), &bytes)
            .map_err(|_| "No se ha podido confirmar el evento de diagnóstico")?;
        status["directoryExists"] = json!(true);
        status["recorded"] = json!(true);
        status["eventId"] = json!(id);
        Ok(status)
    }
    pub fn safe_diagnostic_report(&self) -> Result<Value, String> {
        let store = read(&self.app_data_dir)?;
        let version = if self.version.len() <= 64
            && self
                .version
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b".+-".contains(&b))
        {
            self.version.as_str()
        } else {
            "unknown"
        };
        let mut warnings = vec![];
        if fs::symlink_metadata(self.logs_dir().join("knownext.log")).is_ok() {
            warnings.push("legacy-logs-excluded");
        }
        let configuration = self.read_config_checked();
        if configuration.is_err() {
            warnings.push("configuration-unavailable");
        }
        Ok(
            json!({"schemaVersion":1,"generatedAt":knownext_core::now_iso(),"app":"KnowNext.ai","version":version,"platform":std::env::consts::OS,
            "recordingEnabled":configuration.as_ref().ok().is_some_and(|config|config["diagnostics"]["traceLoggingEnabled"]==true),
            "maximumEvents":MAX_EVENTS,"maximumBytes":MAX_BYTES,"events":store.events,"warnings":warnings,"includesPrivateContent":false,
            "performance":self.runtime_performance.snapshot()}),
        )
    }
}
