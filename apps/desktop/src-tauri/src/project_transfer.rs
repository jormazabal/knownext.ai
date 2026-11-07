//! Native transport has file authority. The WebView receives only the verified job receipt.
use super::{require_workspace_window, LocalApiState};
use serde_json::{json, Value};
use tauri::Manager;

#[tauri::command]
pub async fn pick_project_package(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    id: String,
) -> Result<Value, String> {
    require_workspace_window(&window)?;
    tauri::async_runtime::spawn_blocking(move||{
        let state=app.state::<LocalApiState>();
        let _queue=state.3.lock().map_err(|_| "No se puede reservar la importación")?;
        let _reserved_source=state.1.reserve_project_transfer_source(&id)?;
        let selection=(||->Result<Value,String>{
            #[cfg(target_os="android")]
            {super::android_exports::pick_project(&app,&_reserved_source)}
            #[cfg(not(any(target_os="android",target_os="ios")))]
            {
                use tauri_plugin_dialog::DialogExt;
                match app.dialog().file().set_title("Importar proyecto KnowNext").add_filter("Proyecto KnowNext",&["zip"]).blocking_pick_file(){
                    None=>Ok(json!({"status":"cancelled"})),
                    Some(file)=>{let source=file.into_path().map_err(|_| "El selector no devolvió un archivo local")?;state.1.copy_project_transfer_source(&id,&source)?;Ok(json!({"status":"selected","fileName":source.file_name().and_then(|s|s.to_str()).unwrap_or("Proyecto.knownext-project.zip")}))},
                }
            }
            #[cfg(target_os="ios")]
            {Err("La importación de proyectos no está disponible en este dispositivo".into())}
        })();
        match selection {
            Ok(result) if result["status"].as_str()==Some("selected")=>state.1.record_project_transfer_source(&id,result["fileName"].as_str()),
            Ok(result) if result["status"].as_str()==Some("cancelled")=>state.1.fail_project_transfer_source(&id,None),
            _=>state.1.fail_project_transfer_source(&id,Some("No se pudo leer el paquete completo. El archivo original se conserva; puedes descartar esta preparación y elegirlo de nuevo".into())),
        }
    }).await.map_err(|e|e.to_string())?
}

#[tauri::command]
pub async fn export_project_package(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    id: String,
    archive_sha256: String,
) -> Result<Value, String> {
    require_workspace_window(&window)?;
    tauri::async_runtime::spawn_blocking(move||{
        let state=app.state::<LocalApiState>();
        let _queue=state.3.lock().map_err(|_| "No se puede reservar la entrega del proyecto")?;
        let cache=app.path().app_cache_dir().map_err(|_| "No se puede preparar la entrega local")?;
        let staged=state.1.begin_project_transfer_delivery(&id,&archive_sha256,&cache,Some(&state.0))?;
        let result=(||->Result<Value,String>{
            #[cfg(target_os="android")]
            {super::android_exports::save(&app,&staged)}
            #[cfg(not(any(target_os="android",target_os="ios")))]
            {
                use tauri_plugin_dialog::DialogExt;
                match app.dialog().file().set_title("Exportar proyecto · elige un archivo nuevo").set_file_name(&staged.filename).add_filter("Proyecto KnowNext",&["zip"]).blocking_save_file(){
                    None=>Ok(json!({"status":"cancelled"})),
                    Some(file)=>{let path=file.into_path().map_err(|_| "El selector no devolvió un destino local")?;let bytes=state.1.deliver_project_transfer_file(&staged.path,&path)?;Ok(json!({"status":"saved","fileName":path.file_name().and_then(|s|s.to_str()).unwrap_or("Proyecto.knownext-project.zip"),"byteLength":bytes}))},
                }
            }
            #[cfg(target_os="ios")]
            {Err("La entrega de proyectos no está disponible en este dispositivo".into())}
        })();
        state.1.finish_project_transfer_delivery(&id,result)
    }).await.map_err(|e|e.to_string())?
}

/// Reviewed batch uses the same exclusive Windows destination and Android SAF transport.
pub async fn export_document_batch(app:tauri::AppHandle,window:tauri::WebviewWindow,id:String,revision:String)->Result<Value,String>{require_workspace_window(&window)?;tauri::async_runtime::spawn_blocking(move||{let state=app.state::<LocalApiState>();let _queue=state.3.lock().map_err(|_|"No se puede reservar la entrega")?;let cache=app.path().app_cache_dir().map_err(|_|"No se puede preparar la entrega")?;let delivery=state.1.begin_export_batch_delivery(&id,&revision,&cache)?;let staged=&delivery.staged;let result=(||->Result<Value,String>{#[cfg(target_os="android")]{super::android_exports::save(&app,&staged)}#[cfg(not(any(target_os="android",target_os="ios")))]{use tauri_plugin_dialog::DialogExt;match app.dialog().file().set_title("Exportar documentos · archivo nuevo").set_file_name(&staged.filename).add_filter("Documentos",&["zip"]).blocking_save_file(){None=>Ok(json!({"status":"cancelled"})),Some(file)=>{let path=file.into_path().map_err(|_|"Destino no local")?;let count=state.1.deliver_export_batch_file(&staged.path,&path)?;Ok(json!({"status":"saved","byteLength":count,"fileName":path.file_name().and_then(|s|s.to_str()).unwrap_or("Documentos-knownext.zip")}))}}}#[cfg(target_os="ios")]{Err("Entrega no disponible".into())}})();state.1.finish_export_batch_delivery(&id,result)}).await.map_err(|_|"La entrega no está confirmada; consulta sin repetir")?}
