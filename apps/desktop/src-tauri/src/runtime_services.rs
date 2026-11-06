use knownext_storage::LocalApi;
use crate::runtime_profile;
use tauri::Manager;

#[derive(serde::Serialize)]
pub(crate) struct RuntimeServicesStatus {
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

#[tauri::command]
pub(crate) async fn get_runtime_service_status(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
) -> Result<RuntimeServicesStatus, String> {
    crate::require_workspace_window(&window)?;
    let api = app
        .state::<crate::runtime_dispatch::LocalApiState>()
        .1
        .clone();
    tauri::async_runtime::spawn_blocking(move || inspect(&api))
        .await
        .map_err(|_| "No se pudo revisar el entorno local")?
}
fn inspect(api: &LocalApi) -> Result<RuntimeServicesStatus, String> {
    let health = api.health();
    let git = api.git_diagnostics();
    let app_data_dir = health["appDataDir"].as_str().unwrap_or("").to_string();
    let git_available = git["gitAvailable"].as_bool().unwrap_or(false);
    let git_initialized = git["gitInitialized"].as_bool().unwrap_or(false);
    let github_configured = git["githubConfigured"].as_bool().unwrap_or(false);
    let github_authenticated = git["githubAuthenticated"].as_bool().unwrap_or(false);
    let remote_access = git["remoteAccess"].as_str().unwrap_or("unknown");
    let git_status = if git_available
        && (!github_configured || github_authenticated || remote_access == "unauthenticated")
    {
        "running"
    } else if git_available {
        "degraded"
    } else {
        "unavailable"
    };
    let git_status_label = if !git_available {
        "Git no disponible"
    } else if github_configured && !github_authenticated {
        "Local activo · GitHub pausado"
    } else if git_initialized {
        "Historial local activo"
    } else {
        "Git disponible"
    };
    let git_description = if !git_available {
        "Git no está disponible para el runtime local."
    } else if github_configured && !github_authenticated {
        "El historial local puede usarse sin terminales visibles; GitHub queda pausado hasta conectar la cuenta."
    } else if git_initialized {
        "El runtime ejecuta Git de forma local, no interactiva y silenciosa."
    } else {
        "Git está instalado; el proyecto activo aún no tiene historial local inicializado."
    };
    let git_last_error = git["lastError"].as_str().map(ToString::to_string).or_else(|| {
        if github_configured && !github_authenticated {
            Some("GitHub remoto pausado: sin cuenta GitHub conectada. El trabajo local sigue disponible.".to_string())
        } else {
            None
        }
    });
    Ok(RuntimeServicesStatus {
        services: vec![
            RuntimeServiceStatus {
                id: "local-runtime".to_string(),
                name: "Runtime local Rust".to_string(),
                status: "running".to_string(),
                status_label: "Operativo".to_string(),
                description: "La aplicación usa comandos Tauri y persistencia local Rust."
                    .to_string(),
                endpoint: "tauri://local-api/health".to_string(),
                expected_version: env!("CARGO_PKG_VERSION").to_string(),
                version: health["version"].as_str().map(ToString::to_string),
                expected_profile: runtime_profile().to_string(),
                profile: health["profile"].as_str().map(ToString::to_string),
                expected_app_data_dir: app_data_dir.clone(),
                app_data_dir: Some(app_data_dir.clone()),
                managed_by: Some("tauri".to_string()),
                instance_id: health["instanceId"].as_str().map(ToString::to_string),
                started_at: health["startedAt"].as_str().map(ToString::to_string),
                last_error: None,
            },
            RuntimeServiceStatus {
                id: "git-runtime".to_string(),
                name: "Git local y GitHub".to_string(),
                status: git_status.to_string(),
                status_label: git_status_label.to_string(),
                description: git_description.to_string(),
                endpoint: "tauri://local-api/api/runtime/git".to_string(),
                expected_version: "git".to_string(),
                version: git["gitVersion"].as_str().map(ToString::to_string),
                expected_profile: runtime_profile().to_string(),
                profile: git["remoteAccess"].as_str().map(ToString::to_string),
                expected_app_data_dir: git["folderPath"].as_str().unwrap_or("").to_string(),
                app_data_dir: git["origin"].as_str().map(ToString::to_string),
                managed_by: Some(
                    if github_configured {
                        "local-git+github"
                    } else {
                        "local-git"
                    }
                    .to_string(),
                ),
                instance_id: git["projectName"].as_str().map(ToString::to_string),
                started_at: git["checkedAt"].as_str().map(ToString::to_string),
                last_error: git_last_error,
            },
        ],
        checked_at: crate::trace_timestamp(),
    })
}
