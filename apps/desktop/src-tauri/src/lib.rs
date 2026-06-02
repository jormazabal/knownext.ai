use knownext_storage::{LocalApi, LocalApiContentResponse, LocalApiFile, LocalApiResponse};
use std::io::Write;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::Manager;
use time::{format_description::well_known::Rfc3339, OffsetDateTime};

static TRACE_LOG_LOCK: Mutex<()> = Mutex::new(());

struct LocalApiState(Mutex<LocalApi>);

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct LocalApiRequest {
    method: String,
    path: String,
    body: Option<serde_json::Value>,
    files: Option<Vec<LocalApiFile>>,
}

#[derive(serde::Serialize)]
struct RuntimeServicesStatus {
    services: Vec<RuntimeServiceStatus>,
    #[serde(rename = "checkedAt")]
    checked_at: String,
}

#[derive(serde::Serialize)]
struct RuntimeServiceStatus {
    id: String,
    name: String,
    status: String,
    #[serde(rename = "statusLabel")]
    status_label: String,
    description: String,
    endpoint: String,
    #[serde(rename = "expectedVersion")]
    expected_version: String,
    version: Option<String>,
    #[serde(rename = "expectedProfile")]
    expected_profile: String,
    profile: Option<String>,
    #[serde(rename = "expectedAppDataDir")]
    expected_app_data_dir: String,
    #[serde(rename = "appDataDir")]
    app_data_dir: Option<String>,
    #[serde(rename = "managedBy")]
    managed_by: Option<String>,
    #[serde(rename = "instanceId")]
    instance_id: Option<String>,
    #[serde(rename = "startedAt")]
    started_at: Option<String>,
    #[serde(rename = "lastError")]
    last_error: Option<String>,
}

#[derive(serde::Serialize)]
struct TraceLogStatus {
    enabled: bool,
    #[serde(rename = "folderPath")]
    folder_path: String,
    #[serde(rename = "filePath")]
    file_path: String,
}

fn trace_log_paths(app: &tauri::AppHandle) -> Result<(PathBuf, PathBuf), String> {
    let log_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("logs");
    let log_file = log_dir.join("knownext.log");
    Ok((log_dir, log_file))
}

fn trace_log_status(app: &tauri::AppHandle, enabled: bool) -> Result<TraceLogStatus, String> {
    let (log_dir, log_file) = trace_log_paths(app)?;
    std::fs::create_dir_all(&log_dir).map_err(|error| error.to_string())?;
    Ok(TraceLogStatus {
        enabled,
        folder_path: log_dir.to_string_lossy().to_string(),
        file_path: log_file.to_string_lossy().to_string(),
    })
}

fn trace_timestamp() -> String {
    OffsetDateTime::now_utc()
        .format(&Rfc3339)
        .unwrap_or_else(|_| "unknown-time".to_string())
}

fn append_trace_log(
    app: &tauri::AppHandle,
    level: &str,
    source: &str,
    message: &str,
    detail: Option<&str>,
) -> Result<TraceLogStatus, String> {
    let (log_dir, log_file) = trace_log_paths(app)?;
    std::fs::create_dir_all(&log_dir).map_err(|error| error.to_string())?;
    let _guard = TRACE_LOG_LOCK.lock().map_err(|error| error.to_string())?;
    let normalized_level = if level.is_empty() { "error" } else { level };
    let mut entry = format!(
        "{} [{}] {}\nMessage: {}\n",
        trace_timestamp(),
        normalized_level.to_uppercase(),
        source,
        message
    );
    if let Some(detail) = detail.filter(|value| !value.trim().is_empty()) {
        entry.push_str("Detail:\n");
        entry.push_str(detail.trim_end());
        entry.push('\n');
    }
    entry.push_str("---\n");

    let mut file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_file)
        .map_err(|error| error.to_string())?;
    file.write_all(entry.as_bytes())
        .map_err(|error| error.to_string())?;

    trace_log_status(app, true)
}

#[tauri::command]
fn local_api_request(
    app: tauri::AppHandle,
    request: LocalApiRequest,
) -> Result<LocalApiResponse, String> {
    let api = app.state::<LocalApiState>();
    let api = api.0.lock().map_err(|error| error.to_string())?;
    api.handle(
        &request.method,
        &request.path,
        request.body.unwrap_or(serde_json::Value::Null),
        request.files.unwrap_or_default(),
    )
}

#[tauri::command]
fn local_api_content(
    app: tauri::AppHandle,
    request: LocalApiRequest,
) -> Result<LocalApiContentResponse, String> {
    let api = app.state::<LocalApiState>();
    let api = api.0.lock().map_err(|error| error.to_string())?;
    api.content(
        &request.path,
        request.body.unwrap_or(serde_json::Value::Null),
    )
}

#[tauri::command]
fn get_trace_log_status(app: tauri::AppHandle) -> Result<TraceLogStatus, String> {
    trace_log_status(&app, true)
}

#[tauri::command]
fn record_trace_log(
    app: tauri::AppHandle,
    level: String,
    source: String,
    message: String,
    detail: Option<String>,
) -> Result<TraceLogStatus, String> {
    append_trace_log(&app, &level, &source, &message, detail.as_deref())
}

#[tauri::command]
fn open_folder(folder_path: String) -> Result<(), String> {
    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        let _ = folder_path;
        Err("Abrir carpetas del sistema no está disponible en la app móvil.".to_string())
    }

    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        std::fs::create_dir_all(&folder_path).map_err(|error| error.to_string())?;

        #[cfg(target_os = "windows")]
        std::process::Command::new("explorer")
            .arg(&folder_path)
            .spawn()
            .map_err(|error| error.to_string())?;

        #[cfg(target_os = "macos")]
        std::process::Command::new("open")
            .arg(&folder_path)
            .spawn()
            .map_err(|error| error.to_string())?;

        #[cfg(all(unix, not(target_os = "macos"), not(target_os = "android")))]
        std::process::Command::new("xdg-open")
            .arg(&folder_path)
            .spawn()
            .map_err(|error| error.to_string())?;

        Ok(())
    }
}

#[tauri::command]
fn get_runtime_service_status(app: tauri::AppHandle) -> Result<RuntimeServicesStatus, String> {
    let api = app.state::<LocalApiState>();
    let api = api.0.lock().map_err(|error| error.to_string())?;
    let health = api.health();
    let app_data_dir = health["appDataDir"].as_str().unwrap_or("").to_string();
    Ok(RuntimeServicesStatus {
        services: vec![RuntimeServiceStatus {
            id: "local-runtime".to_string(),
            name: "Runtime local Rust".to_string(),
            status: "running".to_string(),
            status_label: "Operativo".to_string(),
            description: "La aplicación usa comandos Tauri y persistencia local Rust.".to_string(),
            endpoint: "tauri://local-api/health".to_string(),
            expected_version: env!("CARGO_PKG_VERSION").to_string(),
            version: health["version"].as_str().map(ToString::to_string),
            expected_profile: runtime_profile().to_string(),
            profile: health["profile"].as_str().map(ToString::to_string),
            expected_app_data_dir: app_data_dir.clone(),
            app_data_dir: Some(app_data_dir),
            managed_by: Some("tauri".to_string()),
            instance_id: health["instanceId"].as_str().map(ToString::to_string),
            started_at: health["startedAt"].as_str().map(ToString::to_string),
            last_error: None,
        }],
        checked_at: trace_timestamp(),
    })
}

#[cfg(any(target_os = "android", target_os = "ios"))]
fn install_mobile_crypto_provider() {
    let _ = rustls::crypto::ring::default_provider().install_default();
}

fn runtime_profile() -> &'static str {
    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        "mobile"
    }

    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        "desktop"
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(any(target_os = "android", target_os = "ios"))]
    install_mobile_crypto_provider();

    let builder = tauri::Builder::default();

    builder
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            #[cfg(desktop)]
            app.handle().plugin(tauri_plugin_process::init())?;

            #[cfg(desktop)]
            app.handle()
                .plugin(tauri_plugin_updater::Builder::new().build())?;

            let app_data_dir = app.path().app_data_dir()?;
            let api = LocalApi::new(
                app_data_dir,
                env!("CARGO_PKG_VERSION").to_string(),
                runtime_profile().to_string(),
            );
            app.manage(LocalApiState(Mutex::new(api)));

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            local_api_request,
            local_api_content,
            get_trace_log_status,
            record_trace_log,
            open_folder,
            get_runtime_service_status
        ])
        .run(tauri::generate_context!())
        .expect("error while running KnowNext.ai");
}
