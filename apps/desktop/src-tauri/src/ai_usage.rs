//! Thin native transport for the explicit exchange-reference refresh.
use tauri::Manager;
#[tauri::command]
pub async fn refresh_ai_exchange_rate(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
) -> Result<serde_json::Value, String> {
    super::require_workspace_window(&window)?;
    let root = app
        .path()
        .app_data_dir()
        .map_err(|_| "No se puede localizar el perfil local")?;
    tauri::async_runtime::spawn_blocking(move || knownext_storage::currency::refresh_now(&root))
        .await
        .map_err(|_| "La consulta del cambio se interrumpió; se conserva la referencia anterior")?
}
