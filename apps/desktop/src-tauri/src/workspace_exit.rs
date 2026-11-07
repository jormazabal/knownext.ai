use std::sync::Mutex;
use tauri::{Emitter, Manager};
#[derive(Default)]
pub(crate) struct ExitRequest(Mutex<Option<String>>);

pub(crate) fn close_window(window: &tauri::Window) {
    let window = window.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let snapshot = window
            .state::<knownext_recording::RecordingService>()
            .request("snapshot", serde_json::json!({}));
        let keep = snapshot.as_ref().is_ok_and(|value| {
            value["settings"]["keepInTray"] == true
                || !value["captureOwner"].is_null()
                || value["sessions"].as_array().is_some_and(|sessions| {
                    sessions.iter().any(|session| {
                        session["status"] == "queued" || session["status"] == "transcribing"
                    })
                })
        });
        if window.label() == "recordings" || keep {
            let _ = window.hide();
            let _ = window
                .state::<knownext_recording::RecordingService>()
                .request("preview-stop", serde_json::json!({}));
        } else {
            let _ = request(window.app_handle());
        }
    });
}

pub(crate) fn request(app: &tauri::AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or("No está disponible el espacio principal para proteger el trabajo")?;
    let mut current = app
        .state::<ExitRequest>()
        .inner()
        .0
        .lock()
        .map_err(|_| "No se puede preparar el cierre")?;
    let nonce = current
        .get_or_insert_with(|| knownext_core::compact_id("exit"))
        .clone();
    window
        .emit("knownext-protect-exit", nonce)
        .map_err(|_| "No se pudo solicitar la protección del trabajo")?;
    #[cfg(desktop)]
    {
        let _ = window.show();
        let _ = window.set_focus();
    }
    Ok(())
}
#[tauri::command]
pub(crate) async fn confirm_workspace_exit(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    nonce: String,
) -> Result<(), String> {
    crate::require_workspace_window(&window)?;
    tauri::async_runtime::spawn_blocking(move || {
        let current = app
            .state::<ExitRequest>()
            .inner()
            .0
            .lock()
            .map_err(|_| "No se puede confirmar el cierre")?;
        if current.as_deref() != Some(nonce.as_str()) {
            return Err("La solicitud de cierre ya cambió; no se ha cerrado la aplicación".into());
        }
        let _location = crate::PROJECT_LOCATION_GATE
            .lock()
            .map_err(|_| "No se puede proteger el audio antes de salir")?;
        let mut restart = crate::restart::admission(&app)?;
        let service = app.state::<knownext_recording::RecordingService>();
        let snapshot = service.request("snapshot", serde_json::json!({}))?;
        if let Some(id) = snapshot["captureOwner"].as_str() {
            service.request("stop", serde_json::json!({"id":id}))?;
        }
        service.request("preview-stop", serde_json::json!({}))?;
        service.request("exit-hold", serde_json::json!({}))?;
        *restart = Some(nonce);
        app.exit(0);
        Ok(())
    })
    .await
    .map_err(|_| "No se pudo confirmar el cierre de la aplicación")?
}
#[tauri::command]
pub(crate) fn abort_workspace_exit(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    nonce: String,
) -> Result<(), String> {
    crate::require_workspace_window(&window)?;
    let mut current = app
        .state::<ExitRequest>()
        .inner()
        .0
        .lock()
        .map_err(|_| "No se puede devolver el espacio de trabajo")?;
    if current.as_deref() == Some(nonce.as_str()) {
        *current = None;
    }
    Ok(())
}
