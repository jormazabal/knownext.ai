#[cfg(all(desktop, not(debug_assertions)))]
use std::io::Read;
use std::io::Write;
#[cfg(all(desktop, not(debug_assertions)))]
use std::net::{TcpStream, ToSocketAddrs};
use std::path::PathBuf;
use std::sync::Mutex;
#[cfg(all(desktop, not(debug_assertions)))]
use std::time::Duration;
use tauri::Manager;
#[cfg(all(desktop, not(debug_assertions)))]
use tauri_plugin_shell::{
    process::{CommandChild, CommandEvent},
    ShellExt,
};
use time::{format_description::well_known::Rfc3339, OffsetDateTime};

static TRACE_LOG_LOCK: Mutex<()> = Mutex::new(());
#[cfg(all(desktop, not(debug_assertions)))]
const BACKEND_SIDECAR: &str = "binaries/knownext-backend";
#[cfg(all(desktop, not(debug_assertions)))]
const BACKEND_HOST: &str = "127.0.0.1";
#[cfg(all(desktop, not(debug_assertions)))]
const BACKEND_PORT: u16 = 8765;

#[cfg(all(desktop, not(debug_assertions)))]
struct BackendProcess(Mutex<Option<CommandChild>>);

#[cfg(all(desktop, not(debug_assertions)))]
impl Drop for BackendProcess {
    fn drop(&mut self) {
        if let Ok(child_slot) = self.0.get_mut() {
            if let Some(child) = child_slot.take() {
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

#[cfg(all(desktop, not(debug_assertions)))]
fn backend_socket_addr() -> Result<std::net::SocketAddr, String> {
    (BACKEND_HOST, BACKEND_PORT)
        .to_socket_addrs()
        .map_err(|error| error.to_string())?
        .next()
        .ok_or_else(|| "No backend socket address resolved.".to_string())
}

#[cfg(all(desktop, not(debug_assertions)))]
fn is_backend_healthy() -> bool {
    let Ok(address) = backend_socket_addr() else {
        return false;
    };
    let Ok(mut stream) = TcpStream::connect_timeout(&address, Duration::from_millis(350)) else {
        return false;
    };
    let _ = stream.set_read_timeout(Some(Duration::from_millis(700)));
    let _ = stream.set_write_timeout(Some(Duration::from_millis(700)));
    if stream
        .write_all(b"GET /health HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n")
        .is_err()
    {
        return false;
    }

    let mut response = String::new();
    stream.read_to_string(&mut response).is_ok() && response.contains("200 OK")
}

#[cfg(all(desktop, not(debug_assertions)))]
fn wait_for_backend(max_wait: Duration) -> bool {
    let started_at = std::time::Instant::now();
    while started_at.elapsed() < max_wait {
        if is_backend_healthy() {
            return true;
        }
        std::thread::sleep(Duration::from_millis(250));
    }

    false
}

#[cfg(all(desktop, not(debug_assertions)))]
fn start_backend_sidecar(app: &tauri::AppHandle) -> Result<(), String> {
    if is_backend_healthy() {
        let _ = append_trace_log(
            app,
            "info",
            "backend.sidecar",
            "Local API is already running on 127.0.0.1:8765.",
            None,
        );
        return Ok(());
    }

    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .to_string_lossy()
        .to_string();
    let command = app
        .shell()
        .sidecar(BACKEND_SIDECAR)
        .map_err(|error| error.to_string())?
        .env("KNOWNEXT_APP_DATA_DIR", &app_data_dir)
        .env("KNOWNEXT_API_HOST", BACKEND_HOST)
        .env("KNOWNEXT_API_PORT", BACKEND_PORT.to_string());
    let (mut events, child) = command.spawn().map_err(|error| error.to_string())?;

    let process_state = app.state::<BackendProcess>();
    *process_state.0.lock().map_err(|error| error.to_string())? = Some(child);

    let app_handle = app.clone();
    tauri::async_runtime::spawn(async move {
        while let Some(event) = events.recv().await {
            match event {
                CommandEvent::Stdout(bytes) => {
                    let message = String::from_utf8_lossy(&bytes).trim().to_string();
                    if !message.is_empty() {
                        let _ =
                            append_trace_log(&app_handle, "info", "backend.stdout", &message, None);
                    }
                }
                CommandEvent::Stderr(bytes) => {
                    let message = String::from_utf8_lossy(&bytes).trim().to_string();
                    if !message.is_empty() {
                        let _ = append_trace_log(
                            &app_handle,
                            "warning",
                            "backend.stderr",
                            &message,
                            None,
                        );
                    }
                }
                CommandEvent::Error(error) => {
                    let _ = append_trace_log(
                        &app_handle,
                        "error",
                        "backend.sidecar",
                        "Backend sidecar emitted an execution error.",
                        Some(&error),
                    );
                }
                CommandEvent::Terminated(payload) => {
                    let detail =
                        format!("exit_code={:?}; signal={:?}", payload.code, payload.signal);
                    let _ = append_trace_log(
                        &app_handle,
                        "error",
                        "backend.sidecar",
                        "Backend sidecar stopped.",
                        Some(&detail),
                    );
                    break;
                }
                _ => {}
            }
        }
    });

    if wait_for_backend(Duration::from_secs(12)) {
        append_trace_log(
            app,
            "info",
            "backend.sidecar",
            "Local API started and passed the /health check.",
            None,
        )?;
        Ok(())
    } else {
        append_trace_log(
            app,
            "error",
            "backend.sidecar",
            "Local API sidecar was started but did not pass the /health check before timeout.",
            Some("The UI can open, but API requests may fail until the backend becomes available."),
        )?;
        Ok(())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();
    #[cfg(all(desktop, not(debug_assertions)))]
    let builder = builder.manage(BackendProcess(Mutex::new(None)));

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

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_trace_log_status,
            record_trace_log,
            open_folder
        ])
        .run(tauri::generate_context!())
        .expect("error while running KnowNext.ai");
}
