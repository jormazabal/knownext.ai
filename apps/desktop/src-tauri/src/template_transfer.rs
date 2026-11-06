//! Native file transport only; catalog rules and parsing remain in knownext-storage.
use super::{require_workspace_window, LocalApiState};
use serde_json::{json, Value};
use tauri::Manager;

#[tauri::command]
pub async fn pick_document_template(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
) -> Result<Value, String> {
    require_workspace_window(&window)?;
    let mut result = tauri::async_runtime::spawn_blocking(move || -> Result<Value, String> {
        #[cfg(target_os = "android")]
        {
            super::android_exports::pick_template(&app)
        }
        #[cfg(not(any(target_os = "android", target_os = "ios")))]
        {
            use tauri_plugin_dialog::DialogExt;
            let selected = app
                .dialog()
                .file()
                .set_title("Importar plantilla KnowNext")
                .add_filter("Plantilla KnowNext", &["json"])
                .blocking_pick_file();
            match selected {
                None => Ok(json!({"status":"cancelled"})),
                Some(file) => knownext_storage::read_transfer_file(
                    &file
                        .into_path()
                        .map_err(|_| "El selector no devolvió un archivo local")?,
                ),
            }
        }
        #[cfg(target_os = "ios")]
        {
            let _ = app;
            Err("La importación de plantillas no está disponible en este dispositivo".into())
        }
    })
    .await
    .map_err(|e| e.to_string())??;
    result["requestId"] = json!(knownext_core::compact_id("template-pick"));
    result["completedAt"] = json!(knownext_core::now_iso());
    Ok(result)
}

#[tauri::command]
pub async fn export_document_template(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    id: String,
    revision: String,
) -> Result<Value, String> {
    require_workspace_window(&window)?;
    tauri::async_runtime::spawn_blocking(move||{
        // Freeze the reviewed revision before waiting for a native destination. No catalog lock across a picker.
        let file=app.state::<LocalApiState>().0.lock().map_err(|e|e.to_string())?.export_document_template_transfer(&id,&revision)?;
        deliver(&app,file)
    }).await.map_err(|e|e.to_string())?
}

#[tauri::command]
pub async fn export_document_template_catalog(
    app:tauri::AppHandle,window:tauri::WebviewWindow,entries:Value,
)->Result<Value,String>{
    require_workspace_window(&window)?;
    tauri::async_runtime::spawn_blocking(move||{
        let file=app.state::<LocalApiState>().0.lock().map_err(|e|e.to_string())?.export_document_template_catalogue(json!({"entries":entries}))?;
        deliver(&app,file)
    }).await.map_err(|e|e.to_string())?
}

fn deliver(app:&tauri::AppHandle,file:Value)->Result<Value,String>{
        let filename=file["fileName"].as_str().unwrap_or("Plantilla KnowNext.json");
        #[cfg(target_os="android")]
        let mut result={
            let cache=app.path().app_cache_dir().map_err(|e|e.to_string())?;
            let staged=app.state::<LocalApiState>().1.stage_document_template_transfer(&file,&cache)?;
            super::android_exports::save(&app,&staged)?
        };
        #[cfg(not(any(target_os="android",target_os="ios")))]
        let mut result={
            use tauri_plugin_dialog::DialogExt;
            let selected=app.dialog().file().set_title("Exportar plantillas · elige un archivo nuevo").set_file_name(filename).add_filter("Plantillas KnowNext",&["json"]).blocking_save_file();
            match selected {
                None=>json!({"status":"cancelled"}),
                Some(selected)=>{
                    let path=selected.into_path().map_err(|_|"El selector no devolvió un destino local")?;
                    let bytes=app.state::<LocalApiState>().1.write_document_template_transfer(file["content"].as_str().ok_or("Falta el contenido portable")?,&path)?;
                    json!({"status":"saved","fileName":path.file_name().and_then(|s|s.to_str()).unwrap_or("Plantilla KnowNext.json"),"byteLength":bytes})
                }
            }
        };
        #[cfg(target_os="ios")]
        let mut result={let _=file;return Err("La entrega de plantillas no está disponible en este dispositivo".into());};
        if !matches!(result["status"].as_str(),Some("saved"|"cancelled")) {return Err("No se pudo confirmar la entrega de la plantilla".into());}
        result["requestId"]=json!(knownext_core::compact_id("template-export"));result["completedAt"]=json!(knownext_core::now_iso());Ok(result)
}
