use std::io::{Read, Write};
#[cfg(all(desktop, not(debug_assertions)))]
use std::io::{BufRead, BufReader};
#[cfg(desktop)]
use std::net::{TcpStream, ToSocketAddrs};
#[cfg(all(desktop, not(debug_assertions)))]
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
#[cfg(all(desktop, not(debug_assertions)))]
use std::path::Path;
use std::path::PathBuf;
#[cfg(all(desktop, not(debug_assertions)))]
use std::process::{Child, Stdio};
use std::sync::Mutex;
#[cfg(desktop)]
use std::time::Duration;
use tauri::Manager;
use time::{format_description::well_known::Rfc3339, OffsetDateTime};

static TRACE_LOG_LOCK: Mutex<()> = Mutex::new(());
#[cfg(all(desktop, not(debug_assertions)))]
const BACKEND_SIDECAR_EXE: &str = "knownext-backend.exe";
#[cfg(all(desktop, not(debug_assertions)))]
const BACKEND_SIDECAR_TARGET_EXE: &str = "knownext-backend-x86_64-pc-windows-msvc.exe";
const BACKEND_HOST: &str = "127.0.0.1";
const BACKEND_PORT: u16 = 8765;
#[cfg(all(desktop, not(debug_assertions), target_os = "windows"))]
const CREATE_NO_WINDOW: u32 = 0x08000000;
#[cfg(desktop)]
const APP_VERSION: &str = env!("CARGO_PKG_VERSION");

#[cfg(all(desktop, not(debug_assertions)))]
struct BackendProcess(Mutex<Option<Child>>);

#[cfg(all(desktop, not(debug_assertions)))]
struct BackendStartLock(Mutex<()>);

#[cfg(desktop)]
#[derive(serde::Deserialize)]
struct BackendHealth {
    status: String,
    version: Option<String>,
    #[serde(rename = "appDataDir")]
    app_data_dir: Option<String>,
}

#[cfg(desktop)]
#[derive(serde::Serialize)]
struct RuntimeServicesStatus {
    services: Vec<RuntimeServiceStatus>,
    #[serde(rename = "checkedAt")]
    checked_at: String,
}

#[cfg(desktop)]
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
    #[serde(rename = "expectedAppDataDir")]
    expected_app_data_dir: String,
    #[serde(rename = "appDataDir")]
    app_data_dir: Option<String>,
    #[serde(rename = "sidecarPath")]
    sidecar_path: Option<String>,
    #[serde(rename = "lastError")]
    last_error: Option<String>,
    #[serde(rename = "canRestart")]
    can_restart: bool,
}

#[cfg(all(desktop, not(debug_assertions)))]
impl Drop for BackendProcess {
    fn drop(&mut self) {
        if let Ok(child_slot) = self.0.get_mut() {
            if let Some(mut child) = child_slot.take() {
                let _ = child.kill();
            }
        }
    }
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
    std::fs::create_dir_all(&folder_path).map_err(|error| error.to_string())?;

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(&folder_path)
            .spawn()
            .map_err(|error| error.to_string())?;
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&folder_path)
            .spawn()
            .map_err(|error| error.to_string())?;
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        std::process::Command::new("xdg-open")
            .arg(&folder_path)
            .spawn()
            .map_err(|error| error.to_string())?;
    }

    Ok(())
}

#[cfg(desktop)]
fn backend_socket_addr() -> Result<std::net::SocketAddr, String> {
    (BACKEND_HOST, BACKEND_PORT)
        .to_socket_addrs()
        .map_err(|error| error.to_string())?
        .next()
        .ok_or_else(|| "No backend socket address resolved.".to_string())
}

#[cfg(desktop)]
fn backend_health_result() -> Result<BackendHealth, String> {
    let address = backend_socket_addr()?;
    let mut stream = TcpStream::connect_timeout(&address, Duration::from_millis(350))
        .map_err(|error| format!("Could not connect to {BACKEND_HOST}:{BACKEND_PORT}: {error}"))?;
    let _ = stream.set_read_timeout(Some(Duration::from_millis(700)));
    let _ = stream.set_write_timeout(Some(Duration::from_millis(700)));
    stream
        .write_all(b"GET /health HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n")
        .map_err(|error| format!("Could not write /health request: {error}"))?;

    let mut response = String::new();
    stream
        .read_to_string(&mut response)
        .map_err(|error| format!("Could not read /health response: {error}"))?;
    if !response.contains("200 OK") {
        let status_line = response.lines().next().unwrap_or("empty response");
        return Err(format!("/health returned {status_line}"));
    }

    let (_, body) = response
        .split_once("\r\n\r\n")
        .ok_or_else(|| "/health response did not contain an HTTP body.".to_string())?;
    serde_json::from_str::<BackendHealth>(body.trim())
        .map_err(|error| format!("Could not parse /health response: {error}"))
}

#[cfg(all(desktop, not(debug_assertions)))]
fn backend_health() -> Option<BackendHealth> {
    backend_health_result().ok()
}

#[cfg(all(desktop, not(debug_assertions)))]
fn is_expected_backend_healthy(expected_app_data_dir: &str) -> bool {
    let Some(health) = backend_health() else {
        return false;
    };
    health.status == "ok"
        && health.version.as_deref() == Some(APP_VERSION)
        && health.app_data_dir.as_deref() == Some(expected_app_data_dir)
}

#[cfg(all(desktop, not(debug_assertions)))]
fn wait_for_backend(max_wait: Duration, expected_app_data_dir: &str) -> bool {
    let started_at = std::time::Instant::now();
    while started_at.elapsed() < max_wait {
        if is_expected_backend_healthy(expected_app_data_dir) {
            return true;
        }
        std::thread::sleep(Duration::from_millis(250));
    }

    false
}

#[cfg(all(desktop, not(debug_assertions)))]
fn incompatible_backend_detail(expected_app_data_dir: &str) -> String {
    match backend_health() {
        Some(health) => format!(
            "expectedVersion={}\nactualVersion={}\nexpectedAppDataDir={}\nactualAppDataDir={}",
            APP_VERSION,
            health.version.unwrap_or_else(|| "unknown".to_string()),
            expected_app_data_dir,
            health.app_data_dir.unwrap_or_else(|| "unknown".to_string())
        ),
        None => format!(
            "expectedVersion={}\nexpectedAppDataDir={}\nNo compatible /health response was available.",
            APP_VERSION, expected_app_data_dir
        ),
    }
}

#[cfg(desktop)]
fn expected_app_data_dir(app: &tauri::AppHandle) -> Result<String, String> {
    app.path()
        .app_data_dir()
        .map_err(|error| error.to_string())
        .map(|path| path.to_string_lossy().to_string())
}

#[cfg(all(desktop, not(debug_assertions)))]
fn backend_child_health_note(app: &tauri::AppHandle) -> Option<String> {
    let process_state = app.state::<BackendProcess>();
    let Ok(mut child_slot) = process_state.0.lock() else {
        return Some("Could not inspect the backend process state.".to_string());
    };
    let child = child_slot.as_mut()?;
    match child.try_wait() {
        Ok(Some(status)) => {
            *child_slot = None;
            Some(format!("Bundled backend process exited: {status}"))
        }
        Ok(None) => Some("Bundled backend process is running, but /health is not available.".to_string()),
        Err(error) => Some(format!("Could not inspect backend process: {error}")),
    }
}

#[cfg(any(not(desktop), debug_assertions))]
fn backend_child_health_note(_app: &tauri::AppHandle) -> Option<String> {
    None
}

#[cfg(all(desktop, not(debug_assertions)))]
fn resolved_sidecar_path_for_status(app: &tauri::AppHandle) -> Option<String> {
    resolve_backend_sidecar_path(app)
        .ok()
        .map(|path| path.to_string_lossy().to_string())
}

#[cfg(any(not(desktop), debug_assertions))]
fn resolved_sidecar_path_for_status(_app: &tauri::AppHandle) -> Option<String> {
    None
}

#[cfg(desktop)]
fn backend_service_status(app: &tauri::AppHandle) -> Result<RuntimeServiceStatus, String> {
    let expected_app_data_dir = expected_app_data_dir(app)?;
    let health_result = backend_health_result();
    let sidecar_path = resolved_sidecar_path_for_status(app);
    let mut version = None;
    let mut app_data_dir = None;
    let mut last_error = None;

    let (status, status_label, description) = match health_result {
        Ok(health) => {
            version = health.version.clone();
            app_data_dir = health.app_data_dir.clone();
            if health.status == "ok"
                && health.version.as_deref() == Some(APP_VERSION)
                && health.app_data_dir.as_deref() == Some(expected_app_data_dir.as_str())
            {
                (
                    "running".to_string(),
                    "Operativo".to_string(),
                    "La API local responde y coincide con esta instalación.".to_string(),
                )
            } else {
                last_error = Some(format!(
                    "expectedVersion={}\nactualVersion={}\nexpectedAppDataDir={}\nactualAppDataDir={}",
                    APP_VERSION,
                    health.version.unwrap_or_else(|| "unknown".to_string()),
                    expected_app_data_dir,
                    health.app_data_dir.unwrap_or_else(|| "unknown".to_string())
                ));
                (
                    "degraded".to_string(),
                    "Incompatible".to_string(),
                    "Hay una API local en el puerto esperado, pero no corresponde con esta versión o perfil.".to_string(),
                )
            }
        }
        Err(error) => {
            let process_note = backend_child_health_note(app);
            last_error = Some(match process_note {
                Some(note) => format!("{error}\n{note}"),
                None => error,
            });
            (
                "unavailable".to_string(),
                "No disponible".to_string(),
                "La API local no responde al chequeo de salud.".to_string(),
            )
        }
    };

    Ok(RuntimeServiceStatus {
        id: "backend".to_string(),
        name: "Backend local".to_string(),
        status,
        status_label,
        description,
        endpoint: format!("http://{BACKEND_HOST}:{BACKEND_PORT}/health"),
        expected_version: APP_VERSION.to_string(),
        version,
        expected_app_data_dir,
        app_data_dir,
        sidecar_path,
        last_error,
        can_restart: cfg!(all(desktop, not(debug_assertions))),
    })
}

#[cfg(desktop)]
#[tauri::command]
fn get_runtime_service_status(app: tauri::AppHandle) -> Result<RuntimeServicesStatus, String> {
    Ok(RuntimeServicesStatus {
        services: vec![backend_service_status(&app)?],
        checked_at: trace_timestamp(),
    })
}

#[cfg(all(desktop, not(debug_assertions)))]
#[tauri::command]
fn restart_backend_service(app: tauri::AppHandle) -> Result<RuntimeServicesStatus, String> {
    append_trace_log(
        &app,
        "warning",
        "backend.sidecar",
        "Manual backend restart requested from application settings.",
        None,
    )?;

    {
        let process_state = app.state::<BackendProcess>();
        let mut child_slot = process_state.0.lock().map_err(|error| error.to_string())?;
        if let Some(mut child) = child_slot.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
    stop_backend_processes_on_port(&app);
    start_backend_sidecar(&app)?;
    get_runtime_service_status(app)
}

#[cfg(all(desktop, debug_assertions))]
#[tauri::command]
fn restart_backend_service(app: tauri::AppHandle) -> Result<RuntimeServicesStatus, String> {
    let _ = append_trace_log(
        &app,
        "warning",
        "backend.sidecar",
        "Manual backend restart requested, but sidecar supervision is only active in packaged desktop builds.",
        None,
    );
    Err("El reinicio automático del backend solo está disponible en la aplicación instalada.".to_string())
}

#[cfg(all(desktop, not(debug_assertions), target_os = "windows"))]
fn stop_backend_processes_on_port(app: &tauri::AppHandle) {
    let output = std::process::Command::new("netstat")
        .args(["-ano", "-p", "tcp"])
        .output();
    let Ok(output) = output else {
        return;
    };
    let text = String::from_utf8_lossy(&output.stdout);
    let mut pids = std::collections::BTreeSet::new();
    let local_port = format!(":{BACKEND_PORT}");
    for line in text.lines() {
        let normalized = line.split_whitespace().collect::<Vec<_>>();
        if normalized.len() < 5 {
            continue;
        }
        if normalized[0] != "TCP" || normalized[3] != "LISTENING" {
            continue;
        }
        if normalized[1].ends_with(&local_port) {
            pids.insert(normalized[4].to_string());
        }
    }

    for pid in pids {
        let _ = append_trace_log(
            app,
            "warning",
            "backend.sidecar",
            "Stopping incompatible local API process before starting the bundled backend.",
            Some(&format!("pid={pid}")),
        );
        let _ = std::process::Command::new("taskkill")
            .args(["/PID", &pid, "/F"])
            .creation_flags(CREATE_NO_WINDOW)
            .output();
    }
}

#[cfg(all(desktop, not(debug_assertions), not(target_os = "windows")))]
fn stop_backend_processes_on_port(_app: &tauri::AppHandle) {}

#[cfg(all(desktop, not(debug_assertions)))]
fn push_sidecar_candidates_from_dir(candidates: &mut Vec<PathBuf>, directory: &Path) {
    candidates.push(directory.join(BACKEND_SIDECAR_EXE));
    candidates.push(directory.join("binaries").join(BACKEND_SIDECAR_EXE));
    candidates.push(directory.join(BACKEND_SIDECAR_TARGET_EXE));
    candidates.push(directory.join("binaries").join(BACKEND_SIDECAR_TARGET_EXE));
}

#[cfg(all(desktop, not(debug_assertions)))]
fn backend_sidecar_candidates(app: &tauri::AppHandle) -> Vec<PathBuf> {
    let mut candidates = Vec::new();

    if let Ok(explicit_path) = std::env::var("KNOWNEXT_BACKEND_SIDECAR") {
        if !explicit_path.trim().is_empty() {
            candidates.push(PathBuf::from(explicit_path));
        }
    }

    if let Ok(current_exe) = std::env::current_exe() {
        if let Some(directory) = current_exe.parent() {
            push_sidecar_candidates_from_dir(&mut candidates, directory);
        }
    }

    if let Ok(resource_dir) = app.path().resource_dir() {
        push_sidecar_candidates_from_dir(&mut candidates, &resource_dir);
    }

    candidates
}

#[cfg(all(desktop, not(debug_assertions)))]
fn resolve_backend_sidecar_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let candidates = backend_sidecar_candidates(app);
    candidates
        .iter()
        .find(|candidate| candidate.is_file())
        .cloned()
        .ok_or_else(|| {
            let checked_paths = candidates
                .iter()
                .map(|candidate| format!("- {}", candidate.display()))
                .collect::<Vec<_>>()
                .join("\n");
            format!("Backend sidecar executable was not found. Checked:\n{checked_paths}")
        })
}

#[cfg(all(desktop, not(debug_assertions)))]
fn backend_log_level(default_level: &'static str, message: &str) -> &'static str {
    if message.starts_with("ERROR:") || message.starts_with("CRITICAL:") {
        "error"
    } else if message.starts_with("WARNING:") {
        "warning"
    } else if message.starts_with("INFO:") {
        "info"
    } else {
        default_level
    }
}

#[cfg(all(desktop, not(debug_assertions)))]
fn spawn_backend_log_reader<R>(
    app: tauri::AppHandle,
    level: &'static str,
    source: &'static str,
    stream: R,
) where
    R: Read + Send + 'static,
{
    std::thread::spawn(move || {
        let reader = BufReader::new(stream);
        for line in reader.lines().map_while(Result::ok) {
            let message = line.trim();
            if !message.is_empty() {
                let _ = append_trace_log(
                    &app,
                    backend_log_level(level, message),
                    source,
                    message,
                    None,
                );
            }
        }
    });
}

#[cfg(all(desktop, not(debug_assertions)))]
fn start_backend_sidecar(app: &tauri::AppHandle) -> Result<(), String> {
    let start_lock = app.state::<BackendStartLock>();
    let _guard = start_lock.0.lock().map_err(|error| error.to_string())?;
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .to_string_lossy()
        .to_string();
    if is_expected_backend_healthy(&app_data_dir) {
        let _ = append_trace_log(
            app,
            "info",
            "backend.sidecar",
            "Compatible local API is already running on 127.0.0.1:8765.",
            Some(&format!("version={APP_VERSION}\nappDataDir={app_data_dir}")),
        );
        return Ok(());
    }

    if backend_health().is_some() {
        let detail = incompatible_backend_detail(&app_data_dir);
        let _ = append_trace_log(
            app,
            "warning",
            "backend.sidecar",
            "A local API is already running, but it does not match this app version or profile.",
            Some(&detail),
        );
        stop_backend_processes_on_port(app);
        std::thread::sleep(Duration::from_millis(500));
    }

    let sidecar_path = resolve_backend_sidecar_path(app)?;
    let mut command = std::process::Command::new(&sidecar_path);
    #[cfg(target_os = "windows")]
    command.creation_flags(CREATE_NO_WINDOW);
    let mut child = command
        .env("KNOWNEXT_APP_DATA_DIR", &app_data_dir)
        .env("KNOWNEXT_API_HOST", BACKEND_HOST)
        .env("KNOWNEXT_API_PORT", BACKEND_PORT.to_string())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| {
            format!(
                "Failed to spawn backend sidecar at {}: {}",
                sidecar_path.display(),
                error
            )
        })?;

    if let Some(stdout) = child.stdout.take() {
        spawn_backend_log_reader(app.clone(), "info", "backend.stdout", stdout);
    }
    if let Some(stderr) = child.stderr.take() {
        spawn_backend_log_reader(app.clone(), "warning", "backend.stderr", stderr);
    }

    let process_state = app.state::<BackendProcess>();
    *process_state.0.lock().map_err(|error| error.to_string())? = Some(child);

    if wait_for_backend(Duration::from_secs(45), &app_data_dir) {
        let detail = format!("path={}\nversion={APP_VERSION}\nappDataDir={app_data_dir}", sidecar_path.display());
        append_trace_log(
            app,
            "info",
            "backend.sidecar",
            "Local API started and passed the /health check.",
            Some(&detail),
        )?;
        Ok(())
    } else {
        let detail = format!(
            "path={}\nversion={APP_VERSION}\nappDataDir={app_data_dir}\nThe UI can open, but API requests may fail until the backend becomes available.",
            sidecar_path.display(),
        );
        append_trace_log(
            app,
            "error",
            "backend.sidecar",
            "Local API sidecar was started but did not pass the /health check before timeout.",
            Some(&detail),
        )?;
        Ok(())
    }
}

#[cfg(all(desktop, not(debug_assertions)))]
fn spawn_backend_monitor(app: tauri::AppHandle) {
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_secs(15));
        let Ok(app_data_dir) = expected_app_data_dir(&app) else {
            continue;
        };
        if is_expected_backend_healthy(&app_data_dir) {
            continue;
        }

        let detail = incompatible_backend_detail(&app_data_dir);
        let _ = append_trace_log(
            &app,
            "error",
            "backend.sidecar",
            "Backend health check failed. The supervisor will try to restart the local API.",
            Some(&detail),
        );
        if let Err(error) = start_backend_sidecar(&app) {
            let _ = append_trace_log(
                &app,
                "error",
                "backend.sidecar",
                "Backend supervisor could not restart the local API.",
                Some(&error),
            );
        }
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();
    #[cfg(all(desktop, not(debug_assertions)))]
    let builder = builder
        .manage(BackendProcess(Mutex::new(None)))
        .manage(BackendStartLock(Mutex::new(())));

    builder
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            #[cfg(desktop)]
            app.handle()
                .plugin(tauri_plugin_updater::Builder::new().build())?;

            #[cfg(all(desktop, not(debug_assertions)))]
            if let Err(error) = start_backend_sidecar(app.handle()) {
                let _ = append_trace_log(
                    app.handle(),
                    "error",
                    "backend.sidecar",
                    "Could not start the local API sidecar.",
                    Some(&error),
                );
            }
            #[cfg(all(desktop, not(debug_assertions)))]
            spawn_backend_monitor(app.handle().clone());

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_trace_log_status,
            record_trace_log,
            open_folder,
            get_runtime_service_status,
            restart_backend_service
        ])
        .run(tauri::generate_context!())
        .expect("error while running KnowNext.ai");
}
