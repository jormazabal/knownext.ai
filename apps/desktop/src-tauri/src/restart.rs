//! A restart reservation is shared by all windows; it does not stop active work.
use crate::{runtime_dispatch::LocalApiState, PROJECT_LOCATION_GATE};
use knownext_core::operations::{Operations, Phase};
use std::sync::{Mutex, MutexGuard};
use tauri::Manager;

#[derive(Default)]
pub(crate) struct RestartFence(Mutex<Option<String>>);
pub(crate) fn admission(app: &tauri::AppHandle) -> Result<MutexGuard<'_, Option<String>>, String> {
    let guard = app
        .state::<RestartFence>()
        .inner()
        .0
        .lock()
        .map_err(|_| "No se puede comprobar la preparación de la actualización")?;
    if guard.is_some() {
        return Err("runtime-restart-reserved".into());
    }
    Ok(guard)
}
#[tauri::command]
pub(crate) async fn prepare_runtime_restart(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
) -> Result<String, String> {
    crate::require_workspace_window(&window)?;
    tauri::async_runtime::spawn_blocking(move||{
        let _location=PROJECT_LOCATION_GATE.lock().map_err(|_|"No se puede revisar la actividad de audio")?;
        let mut fence=app.state::<RestartFence>().inner().0.lock().map_err(|_|"No se puede preparar la actualización")?;
        if fence.is_some(){return Err("Ya hay una actualización preparada".into());}
        let snapshots=app.state::<Operations>().snapshots().map_err(str::to_string)?;
        if snapshots.iter().any(|entry|matches!(entry.phase,Phase::Queued|Phase::Running))||app.state::<LocalApiState>().1.has_background_work(){return Err("Hay trabajos en curso. Espera a que terminen antes de instalar; no se han cancelado ni repetido".into());}
        app.state::<knownext_recording::RecordingService>().request("restart-hold",serde_json::json!({}))?;
        let token=knownext_core::compact_id("restart");*fence=Some(token.clone());Ok(token)
    }).await.map_err(|_|"No se pudo comprobar la preparación de la actualización")?
}
#[tauri::command]
pub(crate) async fn release_runtime_restart(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    token: String,
) -> Result<(), String> {
    crate::require_workspace_window(&window)?;
    tauri::async_runtime::spawn_blocking(move || {
        let _location = PROJECT_LOCATION_GATE
            .lock()
            .map_err(|_| "No se puede revisar la actividad de audio")?;
        let mut fence = app
            .state::<RestartFence>()
            .inner()
            .0
            .lock()
            .map_err(|_| "No se puede devolver el espacio de trabajo")?;
        if fence.as_deref() != Some(token.as_str()) {
            return Err(
                "La preparación de la actualización ya cambió; vuelve a comprobar su estado".into(),
            );
        }
        app.state::<knownext_recording::RecordingService>()
            .request("restart-release", serde_json::json!({}))?;
        *fence = None;
        Ok(())
    })
    .await
    .map_err(|_| "No se pudo devolver el espacio de trabajo")?
}
