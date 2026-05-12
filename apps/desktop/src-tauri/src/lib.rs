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
const DEFAULT_BACKEND_PORT: u16 = 8765;
const AUTO_BACKEND_PORT_END: u16 = 8799;
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
    app: Option<String>,
    profile: Option<String>,
    port: Option<u16>,
    #[serde(rename = "managedBy")]
    managed_by: Option<String>,
    #[serde(rename = "instanceId")]
    instance_id: Option<String>,
    #[serde(rename = "startedAt")]
    started_at: Option<String>,
    #[serde(rename = "appDataDir")]
    app_data_dir: Option<String>,
}

#[cfg(desktop)]
#[derive(Clone, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct BackendPortConfig {
    mode: String,
    port: u16,
    auto_port_start: u16,
    auto_port_end: u16,
}

#[cfg(desktop)]
impl Default for BackendPortConfig {
    fn default() -> Self {
        Self {
            mode: "automatic".to_string(),
            port: DEFAULT_BACKEND_PORT,
            auto_port_start: DEFAULT_BACKEND_PORT,
            auto_port_end: AUTO_BACKEND_PORT_END,
        }
    }
}

#[cfg(desktop)]
struct BackendRuntime {
    port_config: BackendPortConfig,
    active_port: u16,
}

#[cfg(desktop)]
impl Default for BackendRuntime {
    fn default() -> Self {
        let port_config = BackendPortConfig::default();
        Self {
            active_port: port_config.port,
            port_config,
        }
    }
}

#[cfg(desktop)]
struct BackendRuntimeState(Mutex<BackendRuntime>);

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
    #[serde(rename = "expectedProfile")]
    expected_profile: String,
    profile: Option<String>,
    #[serde(rename = "expectedAppDataDir")]
    expected_app_data_dir: String,
    #[serde(rename = "appDataDir")]
    app_data_dir: Option<String>,
    port: Option<u16>,
    #[serde(rename = "managedBy")]
    managed_by: Option<String>,
    #[serde(rename = "instanceId")]
    instance_id: Option<String>,
    #[serde(rename = "startedAt")]
    started_at: Option<String>,
    #[serde(rename = "sidecarPath")]
    sidecar_path: Option<String>,
    #[serde(rename = "lastError")]
    last_error: Option<String>,
    #[serde(rename = "canRestart")]
    can_restart: bool,
    #[serde(rename = "canConfigurePort")]
    can_configure_port: bool,
    #[serde(rename = "portConfig")]
    port_config: Option<BackendPortConfig>,
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
fn backend_socket_addr(port: u16) -> Result<std::net::SocketAddr, String> {
    (BACKEND_HOST, port)
        .to_socket_addrs()
        .map_err(|error| error.to_string())?
        .next()
        .ok_or_else(|| "No backend socket address resolved.".to_string())
}

#[cfg(desktop)]
fn backend_health_result(port: u16) -> Result<BackendHealth, String> {
    let address = backend_socket_addr(port)?;
    let mut stream = TcpStream::connect_timeout(&address, Duration::from_millis(350))
        .map_err(|error| format!("Could not connect to {BACKEND_HOST}:{port}: {error}"))?;
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
fn backend_health(port: u16) -> Option<BackendHealth> {
    backend_health_result(port).ok()
}

#[cfg(all(desktop, not(debug_assertions)))]
fn backend_port_accepts_connections(port: u16) -> bool {
    match backend_socket_addr(port) {
        Ok(address) => TcpStream::connect_timeout(&address, Duration::from_millis(250)).is_ok(),
        Err(_) => false,
    }
}

#[cfg(all(desktop, not(debug_assertions)))]
fn is_expected_backend_healthy(port: u16, expected_app_data_dir: &str) -> bool {
    let Some(health) = backend_health(port) else {
        return false;
    };
    health.status == "ok"
        && health.app.as_deref() == Some("knownext")
        && health.profile.as_deref() == Some("desktop")
        && health.version.as_deref() == Some(APP_VERSION)
        && health.app_data_dir.as_deref() == Some(expected_app_data_dir)
}

#[cfg(all(desktop, not(debug_assertions)))]
fn wait_for_backend(port: u16, max_wait: Duration, expected_app_data_dir: &str) -> bool {
    let started_at = std::time::Instant::now();
    while started_at.elapsed() < max_wait {
        if is_expected_backend_healthy(port, expected_app_data_dir) {
            return true;
        }
        std::thread::sleep(Duration::from_millis(250));
    }

    false
}

#[cfg(all(desktop, not(debug_assertions)))]
fn incompatible_backend_detail(port: u16, expected_app_data_dir: &str) -> String {
    match backend_health(port) {
        Some(health) => format!(
            "expectedVersion={}\nactualVersion={}\nexpectedProfile=desktop\nactualProfile={}\nexpectedAppDataDir={}\nactualAppDataDir={}\nport={}",
            APP_VERSION,
            health.version.unwrap_or_else(|| "unknown".to_string()),
            health.profile.unwrap_or_else(|| "unknown".to_string()),
            expected_app_data_dir,
            health.app_data_dir.unwrap_or_else(|| "unknown".to_string()),
            port
        ),
        None => format!(
            "expectedVersion={}\nexpectedProfile=desktop\nexpectedAppDataDir={}\nport={}\nNo compatible /health response was available.",
            APP_VERSION, expected_app_data_dir, port
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

#[cfg(desktop)]
fn runtime_config_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("runtime.json"))
}

#[cfg(desktop)]
fn normalize_backend_port_config(config: BackendPortConfig) -> BackendPortConfig {
    let default = BackendPortConfig::default();
    let mode = if config.mode == "fixed" { "fixed" } else { "automatic" }.to_string();
    let port = if (1024..=65535).contains(&config.port) {
        config.port
    } else {
        default.port
    };
    let auto_port_start = if (1024..=65535).contains(&config.auto_port_start) {
        config.auto_port_start
    } else {
        default.auto_port_start
    };
    let auto_port_end = if (1024..=65535).contains(&config.auto_port_end) && config.auto_port_end >= auto_port_start {
        config.auto_port_end
    } else {
        default.auto_port_end
    };

    BackendPortConfig {
        mode,
        port,
        auto_port_start,
        auto_port_end,
    }
}

#[cfg(desktop)]
fn read_backend_port_config(app: &tauri::AppHandle) -> BackendPortConfig {
    let Ok(path) = runtime_config_path(app) else {
        return BackendPortConfig::default();
    };
    let Ok(text) = std::fs::read_to_string(path) else {
        return BackendPortConfig::default();
    };
    let Ok(value) = serde_json::from_str::<serde_json::Value>(&text) else {
        return BackendPortConfig::default();
    };
    let port_config = value
        .get("backend")
        .and_then(|backend| backend.get("port"))
        .cloned()
        .or_else(|| value.get("backendPort").cloned());
    match port_config.and_then(|config| serde_json::from_value::<BackendPortConfig>(config).ok()) {
        Some(config) => normalize_backend_port_config(config),
        None => BackendPortConfig::default(),
    }
}

#[cfg(desktop)]
fn write_backend_port_config(app: &tauri::AppHandle, config: &BackendPortConfig) -> Result<(), String> {
    let path = runtime_config_path(app)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let data = serde_json::json!({
        "schemaVersion": 1,
        "backend": {
            "port": config,
        },
    });
    std::fs::write(path, serde_json::to_string_pretty(&data).map_err(|error| error.to_string())?)
        .map_err(|error| error.to_string())
}

#[cfg(desktop)]
fn runtime_active_port(app: &tauri::AppHandle) -> u16 {
    let runtime_state = app.state::<BackendRuntimeState>();
    runtime_state
        .0
        .lock()
        .map(|runtime| runtime.active_port)
        .unwrap_or(DEFAULT_BACKEND_PORT)
}

#[cfg(desktop)]
fn set_runtime_port(app: &tauri::AppHandle, config: BackendPortConfig, active_port: u16) -> Result<(), String> {
    let runtime_state = app.state::<BackendRuntimeState>();
    let mut runtime = runtime_state.0.lock().map_err(|error| error.to_string())?;
    runtime.port_config = config;
    runtime.active_port = active_port;
    Ok(())
}

#[cfg(desktop)]
fn get_runtime_port_config(app: &tauri::AppHandle) -> BackendPortConfig {
    let runtime_state = app.state::<BackendRuntimeState>();
    runtime_state
        .0
        .lock()
        .map(|runtime| runtime.port_config.clone())
        .unwrap_or_else(|_| BackendPortConfig::default())
}

#[cfg(all(desktop, not(debug_assertions)))]
fn choose_backend_port(app: &tauri::AppHandle, expected_app_data_dir: &str) -> Result<(BackendPortConfig, u16), String> {
    let config = normalize_backend_port_config(read_backend_port_config(app));
    if config.mode == "fixed" {
        if let Some(health) = backend_health(config.port) {
            if is_expected_backend_healthy(config.port, expected_app_data_dir) {
                return Ok((config.clone(), config.port));
            }
            return Err(format!(
                "El puerto fijo {} está ocupado por un backend incompatible. expectedProfile=desktop actualProfile={} expectedVersion={} actualVersion={}",
                config.port,
                health.profile.unwrap_or_else(|| "unknown".to_string()),
                APP_VERSION,
                health.version.unwrap_or_else(|| "unknown".to_string())
            ));
        }
        if backend_port_accepts_connections(config.port) {
            return Err(format!("El puerto fijo {} está ocupado por otro servicio.", config.port));
        }
        return Ok((config.clone(), config.port));
    }

    let mut candidates = vec![config.port, DEFAULT_BACKEND_PORT];
    for port in config.auto_port_start..=config.auto_port_end {
        if !candidates.contains(&port) {
            candidates.push(port);
        }
    }

    for port in candidates {
        if is_expected_backend_healthy(port, expected_app_data_dir) {
            return Ok((config.clone(), port));
        }
        if backend_health(port).is_none() && !backend_port_accepts_connections(port) {
            return Ok((config.clone(), port));
        }
    }

    Err(format!(
        "No hay puertos disponibles en el rango automático {}-{}.",
        config.auto_port_start, config.auto_port_end
    ))
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
    let port = runtime_active_port(app);
    let port_config = get_runtime_port_config(app);
    let health_result = backend_health_result(port);
    let sidecar_path = resolved_sidecar_path_for_status(app);
    let mut version = None;
    let mut profile = None;
    let mut app_data_dir = None;
    let mut managed_by = None;
    let mut instance_id = None;
    let mut started_at = None;
    let mut health_port = None;
    let mut last_error = None;

    let (status, status_label, description) = match health_result {
        Ok(health) => {
            version = health.version.clone();
            profile = health.profile.clone();
            app_data_dir = health.app_data_dir.clone();
            managed_by = health.managed_by.clone();
            instance_id = health.instance_id.clone();
            started_at = health.started_at.clone();
            health_port = health.port;
            if health.status == "ok"
                && health.app.as_deref() == Some("knownext")
                && health.profile.as_deref() == Some("desktop")
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
                    "expectedVersion={}\nactualVersion={}\nexpectedProfile=desktop\nactualProfile={}\nexpectedAppDataDir={}\nactualAppDataDir={}\nport={}",
                    APP_VERSION,
                    health.version.unwrap_or_else(|| "unknown".to_string()),
                    health.profile.unwrap_or_else(|| "unknown".to_string()),
                    expected_app_data_dir,
                    health.app_data_dir.unwrap_or_else(|| "unknown".to_string()),
                    port
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
        endpoint: format!("http://{BACKEND_HOST}:{port}/health"),
        expected_version: APP_VERSION.to_string(),
        version,
        expected_profile: "desktop".to_string(),
        profile,
        expected_app_data_dir,
        app_data_dir,
        port: health_port.or(Some(port)),
        managed_by,
        instance_id,
        started_at,
        sidecar_path,
        last_error,
        can_restart: cfg!(all(desktop, not(debug_assertions))),
        can_configure_port: cfg!(all(desktop, not(debug_assertions))),
        port_config: Some(port_config),
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

#[cfg(desktop)]
#[tauri::command]
fn get_runtime_api_base_url(app: tauri::AppHandle) -> Result<String, String> {
    Ok(format!("http://{BACKEND_HOST}:{}", runtime_active_port(&app)))
}

#[cfg(desktop)]
#[tauri::command]
fn update_backend_port_config(app: tauri::AppHandle, config: BackendPortConfig) -> Result<RuntimeServicesStatus, String> {
    let config = normalize_backend_port_config(config);
    #[cfg(all(desktop, not(debug_assertions)))]
    let previous_config = get_runtime_port_config(&app);
    #[cfg(all(desktop, not(debug_assertions)))]
    let previous_port = runtime_active_port(&app);
    write_backend_port_config(&app, &config)?;
    append_trace_log(
        &app,
        "warning",
        "backend.sidecar",
        "Backend port configuration changed from application settings.",
        Some(&format!(
            "mode={}\nport={}\nautoPortStart={}\nautoPortEnd={}",
            config.mode, config.port, config.auto_port_start, config.auto_port_end
        )),
    )?;

    #[cfg(all(desktop, not(debug_assertions)))]
    {
        let process_state = app.state::<BackendProcess>();
        let mut child_slot = process_state.0.lock().map_err(|error| error.to_string())?;
        if let Some(mut child) = child_slot.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
        drop(child_slot);
        if let Err(error) = start_backend_sidecar(&app) {
            let _ = write_backend_port_config(&app, &previous_config);
            let _ = set_runtime_port(&app, previous_config, previous_port);
            let _ = append_trace_log(
                &app,
                "error",
                "backend.sidecar",
                "Backend port configuration failed. Restoring previous runtime configuration.",
                Some(&error),
            );
            let _ = start_backend_sidecar(&app);
            return Err(error);
        }
    }

    #[cfg(any(not(desktop), debug_assertions))]
    {
        set_runtime_port(&app, config.clone(), config.port)?;
    }

    get_runtime_service_status(app)
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
fn stop_backend_processes_on_port(app: &tauri::AppHandle, port: u16) {
    let output = std::process::Command::new("netstat")
        .args(["-ano", "-p", "tcp"])
        .output();
    let Ok(output) = output else {
        return;
    };
    let text = String::from_utf8_lossy(&output.stdout);
    let mut pids = std::collections::BTreeSet::new();
    let local_port = format!(":{port}");
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
fn stop_backend_processes_on_port(_app: &tauri::AppHandle, _port: u16) {}

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
    let (port_config, active_port) = choose_backend_port(app, &app_data_dir)?;
    set_runtime_port(app, port_config.clone(), active_port)?;

    if is_expected_backend_healthy(active_port, &app_data_dir) {
        let _ = append_trace_log(
            app,
            "info",
            "backend.sidecar",
            "Compatible local API is already running.",
            Some(&format!("version={APP_VERSION}\nappDataDir={app_data_dir}\nport={active_port}")),
        );
        return Ok(());
    }

    if backend_health(active_port).is_some() {
        let detail = incompatible_backend_detail(active_port, &app_data_dir);
        let _ = append_trace_log(
            app,
            "warning",
            "backend.sidecar",
            "A local API is already running on the selected port, but it does not match this app version or profile.",
            Some(&detail),
        );
        if port_config.mode == "fixed" {
            return Err(detail);
        }
        stop_backend_processes_on_port(app, active_port);
        std::thread::sleep(Duration::from_millis(500));
    }

    let sidecar_path = resolve_backend_sidecar_path(app)?;
    let mut command = std::process::Command::new(&sidecar_path);
    #[cfg(target_os = "windows")]
    command.creation_flags(CREATE_NO_WINDOW);
    let mut child = command
        .env("KNOWNEXT_APP_DATA_DIR", &app_data_dir)
        .env("KNOWNEXT_API_HOST", BACKEND_HOST)
        .env("KNOWNEXT_API_PORT", active_port.to_string())
        .env("KNOWNEXT_RUNTIME_PROFILE", "desktop")
        .env("KNOWNEXT_MANAGED_BY", "tauri")
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

    if wait_for_backend(active_port, Duration::from_secs(45), &app_data_dir) {
        let detail = format!("path={}\nversion={APP_VERSION}\nappDataDir={app_data_dir}\nport={active_port}", sidecar_path.display());
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
            "path={}\nversion={APP_VERSION}\nappDataDir={app_data_dir}\nport={active_port}\nThe UI can open, but API requests may fail until the backend becomes available.",
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
        let active_port = runtime_active_port(&app);
        if is_expected_backend_healthy(active_port, &app_data_dir) {
            continue;
        }

        let detail = incompatible_backend_detail(active_port, &app_data_dir);
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
    #[cfg(desktop)]
    let builder = builder.manage(BackendRuntimeState(Mutex::new(BackendRuntime::default())));
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

            #[cfg(desktop)]
            {
                let config = normalize_backend_port_config(read_backend_port_config(app.handle()));
                let _ = set_runtime_port(app.handle(), config.clone(), config.port);
            }

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
            get_runtime_api_base_url,
            restart_backend_service,
            update_backend_port_config
        ])
        .run(tauri::generate_context!())
        .expect("error while running KnowNext.ai");
}
