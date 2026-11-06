//! Native picker transport; discovery, reviewed bytes and output integrity are domain rules.
use super::{require_workspace_window, LocalApiState};
use serde_json::{json, Value};
use tauri::Manager;
#[tauri::command]
pub async fn export_incomplete_mixed(app:tauri::AppHandle,window:tauri::WebviewWindow,project_id:String,plan_id:String,revision:String,key:String,acknowledge_unverified:bool)->Result<Value,String>{
    require_workspace_window(&window)?;
    tauri::async_runtime::spawn_blocking(move||{
        let state=app.state::<LocalApiState>();let frozen=state.1.freeze_incomplete_mixed(&project_id,&plan_id,&revision,&key,acknowledge_unverified)?;
        #[cfg(target_os="android")]
        let mut result={let cache=app.path().app_cache_dir().map_err(|_|"No se puede preparar la copia")?;let staged=frozen.stage(&cache)?;super::android_exports::save(&app,&staged)?};
        #[cfg(not(any(target_os="android",target_os="ios")))]
        let mut result={use tauri_plugin_dialog::DialogExt;match app.dialog().file().set_title("Extraer copia legible · elige un ZIP nuevo").set_file_name(frozen.filename()).add_filter("Contenido conservado",&["zip"]).blocking_save_file(){None=>json!({"status":"cancelled"}),Some(file)=>{let path=file.into_path().map_err(|_|"El selector no devolvió un archivo local")?;let count=state.1.write_system_recovery(&frozen,&path)?;json!({"status":"saved","fileName":path.file_name().and_then(|n|n.to_str()).unwrap_or("Copia.zip"),"byteLength":count})}}};
        #[cfg(target_os="ios")]
        let mut result={return Err("La extracción no está disponible en este dispositivo".into());};
        if !matches!(result["status"].as_str(),Some("saved"|"cancelled")){return Err("No se confirmó la entrega; comprueba el destino antes de repetir".into());}
        result["schemaVersion"]=json!(1);result["projectId"]=json!(project_id);result["planId"]=json!(plan_id);result["reviewRevision"]=json!(revision);result["key"]=json!(key);result["archiveSha256"]=json!(frozen.sha256());result["canApply"]=json!(false);result["canDelete"]=json!(false);result["requestId"]=json!(knownext_core::compact_id("mixed-content"));result["completedAt"]=json!(knownext_core::now_iso());Ok(result)
    }).await.map_err(|_|"La entrega se interrumpió. Comprueba el destino; no se repite automáticamente")?
}
#[tauri::command]
pub async fn retire_mixed_payloads(app:tauri::AppHandle,window:tauri::WebviewWindow,project_id:String,plan_id:String,revision:String,acknowledge:bool)->Result<Value,String>{
    require_workspace_window(&window)?;
    if !acknowledge{return Err("Confirma la retirada permanente antes de elegir el respaldo".into());}
    tauri::async_runtime::spawn_blocking(move||{
        let state=app.state::<LocalApiState>();
        #[cfg(target_os="android")]
        let mut result={let cache=app.path().app_cache_dir().map_err(|_|"No se puede preparar la comprobación")?;let reserved=state.1.reserve_mixed_backup_inspection(&cache)?;let picked=super::android_exports::pick_recovery(&app,&reserved.path)?;if picked["status"]=="cancelled"{json!({"status":"cancelled"})}else if picked["status"]=="selected"{let review=state.1.retire_mixed_payloads(&project_id,&plan_id,&revision,acknowledge,&reserved.path)?;json!({"status":"completed","review":review})}else{return Err("No se confirmó el respaldo elegido; consulta sin repetir".into());}};
        #[cfg(not(any(target_os="android",target_os="ios")))]
        let mut result={use tauri_plugin_dialog::DialogExt;match app.dialog().file().set_title("Retirar copias locales · elige el respaldo completo que conservarás").add_filter("Respaldo ZIP",&["zip"]).blocking_pick_file(){None=>json!({"status":"cancelled"}),Some(file)=>{let path=file.into_path().map_err(|_|"El selector no devolvió un archivo local")?;let review=state.1.retire_mixed_payloads(&project_id,&plan_id,&revision,acknowledge,&path)?;json!({"status":"completed","review":review})}}};
        #[cfg(target_os="ios")]
        let mut result={return Err("La retirada no está disponible en este dispositivo".into());};
        result["schemaVersion"]=json!(1);result["projectId"]=json!(project_id);result["planId"]=json!(plan_id);result["requestRevision"]=json!(revision);result["requestId"]=json!(knownext_core::compact_id("variants-retirement"));result["completedAt"]=json!(knownext_core::now_iso());Ok(result)
    }).await.map_err(|_|"La retirada se interrumpió. Consulta el estado sin repetir la operación")?
}
#[tauri::command]
pub async fn export_mixed_backup(app:tauri::AppHandle,window:tauri::WebviewWindow,project_id:String,plan_id:String,revision:String)->Result<Value,String>{
    require_workspace_window(&window)?;
    tauri::async_runtime::spawn_blocking(move||{
        let state=app.state::<LocalApiState>();let frozen=state.1.freeze_mixed_backup(&project_id,&plan_id,&revision)?;
        #[cfg(target_os="android")]
        let mut result={let cache=app.path().app_cache_dir().map_err(|_|"No se puede preparar el respaldo")?;let staged=frozen.stage(&cache)?;super::android_exports::save(&app,&staged)?};
        #[cfg(not(any(target_os="android",target_os="ios")))]
        let mut result={use tauri_plugin_dialog::DialogExt;match app.dialog().file().set_title("Respaldar variantes · elige un ZIP nuevo").set_file_name(frozen.filename()).add_filter("Respaldo de variantes",&["zip"]).blocking_save_file(){None=>json!({"status":"cancelled"}),Some(file)=>{let path=file.into_path().map_err(|_|"El selector no devolvió un archivo local")?;let count=state.1.write_system_recovery(&frozen,&path)?;json!({"status":"saved","fileName":path.file_name().and_then(|n|n.to_str()).unwrap_or("Variantes.zip"),"byteLength":count})}}};
        #[cfg(target_os="ios")]
        let mut result={return Err("El respaldo no está disponible en este dispositivo".into());};
        if !matches!(result["status"].as_str(),Some("saved"|"cancelled")){return Err("No se confirmó el respaldo; comprueba el destino antes de repetir".into());}
        result["schemaVersion"]=json!(1);result["projectId"]=json!(project_id);result["planId"]=json!(plan_id);result["reviewRevision"]=json!(revision);result["archiveSha256"]=json!(frozen.sha256());if result["status"]=="saved"{result["byteLength"]=json!(frozen.byte_length());}result["canDelete"]=json!(false);result["requestId"]=json!(knownext_core::compact_id("variants-export"));result["completedAt"]=json!(knownext_core::now_iso());Ok(result)
    }).await.map_err(|_|"La entrega se interrumpió. Comprueba el destino; no se repite automáticamente")?
}
#[tauri::command]
pub async fn verify_mixed_backup(app:tauri::AppHandle,window:tauri::WebviewWindow,project_id:String,plan_id:String,revision:String)->Result<Value,String>{
    require_workspace_window(&window)?;
    tauri::async_runtime::spawn_blocking(move||{
        let state=app.state::<LocalApiState>();
        #[cfg(target_os="android")]
        let mut result={let cache=app.path().app_cache_dir().map_err(|_|"No se puede preparar la comprobación")?;let reserved=state.1.reserve_mixed_backup_inspection(&cache)?;let picked=super::android_exports::pick_recovery(&app,&reserved.path)?;if picked["status"]=="cancelled"{json!({"status":"cancelled"})}else if picked["status"]=="selected"{let mut result=state.1.verify_mixed_backup(&project_id,&plan_id,&revision,&reserved.path)?;result["fileName"]=picked["fileName"].clone();result}else{return Err("No se confirmó el archivo elegido; las copias locales permanecen".into());}};
        #[cfg(not(any(target_os="android",target_os="ios")))]
        let mut result={use tauri_plugin_dialog::DialogExt;match app.dialog().file().set_title("Comprobar respaldo completo de variantes").add_filter("Respaldo ZIP",&["zip"]).blocking_pick_file(){None=>json!({"status":"cancelled"}),Some(file)=>{let path=file.into_path().map_err(|_|"El selector no devolvió un archivo local")?;state.1.verify_mixed_backup(&project_id,&plan_id,&revision,&path)?}}};
        #[cfg(target_os="ios")]
        let mut result={return Err("La comprobación no está disponible en este dispositivo".into());};
        result["schemaVersion"]=json!(1);result["projectId"]=json!(project_id);result["planId"]=json!(plan_id);result["reviewRevision"]=json!(revision);result["canDelete"]=json!(false);result["requestId"]=json!(knownext_core::compact_id("variants-verify"));result["completedAt"]=json!(knownext_core::now_iso());Ok(result)
    }).await.map_err(|_|"La comprobación se interrumpió. El original y las copias permanecen")?
}
#[tauri::command]
pub async fn export_conflict_package(app:tauri::AppHandle,window:tauri::WebviewWindow,id:String,revision:String)->Result<Value,String>{
    require_workspace_window(&window)?;
    tauri::async_runtime::spawn_blocking(move||{
        let state=app.state::<LocalApiState>();
        let frozen=state.1.freeze_conflict_package(&id,&revision)?;
        #[cfg(target_os="android")]
        let mut result={let cache=app.path().app_cache_dir().map_err(|_|"No se puede preparar el paquete")?;let staged=frozen.stage(&cache)?;super::android_exports::save(&app,&staged)?};
        #[cfg(not(any(target_os="android",target_os="ios")))]
        let mut result={use tauri_plugin_dialog::DialogExt;match app.dialog().file().set_title("Compartir variantes · elige un ZIP nuevo").set_file_name(frozen.filename()).add_filter("Proyecto KnowNext",&["zip"]).blocking_save_file(){None=>json!({"status":"cancelled"}),Some(file)=>{let path=file.into_path().map_err(|_|"El selector no devolvió un archivo local")?;let count=state.1.write_system_recovery(&frozen,&path)?;json!({"status":"saved","fileName":path.file_name().and_then(|name|name.to_str()).unwrap_or("Variantes.zip"),"byteLength":count})}}};
        #[cfg(target_os="ios")]
        let mut result={return Err("Compartir variantes no está disponible en este dispositivo".into());};
        if !matches!(result["status"].as_str(),Some("saved"|"cancelled")){return Err("No se confirmó la entrega. Comprueba el destino antes de repetir".into());}
        result["attemptId"]=json!(id);result["reviewRevision"]=json!(revision);result["requestId"]=json!(knownext_core::compact_id("conflict-package"));result["completedAt"]=json!(knownext_core::now_iso());Ok(result)
    }).await.map_err(|_|"La entrega se interrumpió. Comprueba el destino; no se repite automáticamente")?
}
#[tauri::command]
pub async fn export_recovery_content(
    app:tauri::AppHandle,window:tauri::WebviewWindow,key:String,revision:String,acknowledge_unverified:bool,
)->Result<Value,String>{
    require_workspace_window(&window)?;
    tauri::async_runtime::spawn_blocking(move||{
        let state=app.state::<LocalApiState>();
        let frozen=state.1.freeze_incomplete_recovery(&key,&revision,acknowledge_unverified)?;
        #[cfg(target_os="android")]
        let mut result={let cache=app.path().app_cache_dir().map_err(|_|"No se puede preparar la extracción")?;let staged=frozen.stage(&cache)?;super::android_exports::save(&app,&staged)?};
        #[cfg(not(any(target_os="android",target_os="ios")))]
        let mut result={
            use tauri_plugin_dialog::DialogExt;
            match app.dialog().file().set_title("Extraer contenido · elige un archivo nuevo").set_file_name(frozen.filename()).add_filter("Contenido recuperado",&[frozen.extension()]).blocking_save_file(){
                None=>json!({"status":"cancelled"}),
                Some(file)=>{let path=file.into_path().map_err(|_|"El selector no devolvió un archivo local")?;let count=state.1.write_system_recovery(&frozen,&path)?;json!({"status":"saved","fileName":path.file_name().and_then(|name|name.to_str()).unwrap_or("Contenido recuperado"),"byteLength":count})}
            }
        };
        #[cfg(target_os="ios")]
        let mut result={return Err("La extracción no está disponible en este dispositivo".into());};
        if !matches!(result["status"].as_str(),Some("saved"|"cancelled")){return Err("No se confirmó la extracción. Comprueba el destino antes de repetir".into());}
        result["requestId"]=json!(knownext_core::compact_id("recovery-content-export"));result["completedAt"]=json!(knownext_core::now_iso());Ok(result)
    }).await.map_err(|_|"La extracción se interrumpió. Comprueba el destino; no se repite automáticamente")?
}
#[tauri::command]
pub async fn export_system_recovery(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    id: String,
    fingerprint: String,
) -> Result<Value, String> {
    require_workspace_window(&window)?;
    tauri::async_runtime::spawn_blocking(move||{
        let state=app.state::<LocalApiState>();
        let frozen=state.1.freeze_system_recovery(&id,&fingerprint)?;
        #[cfg(target_os="android")]
        let mut result={let cache=app.path().app_cache_dir().map_err(|_|"No se puede preparar la entrega")?;let staged=frozen.stage(&cache)?;super::android_exports::save(&app,&staged)?};
        #[cfg(not(any(target_os="android",target_os="ios")))]
        let mut result={
            use tauri_plugin_dialog::DialogExt;
            match app.dialog().file().set_title("Conservar copia de recuperación · elige un archivo nuevo").set_file_name(frozen.filename()).add_filter("Copia de recuperación",&["json"]).blocking_save_file(){
                None=>json!({"status":"cancelled"}),
                Some(file)=>{let path=file.into_path().map_err(|_|"El selector no devolvió un archivo local")?;let count=state.1.write_system_recovery(&frozen,&path)?;json!({"status":"saved","fileName":path.file_name().and_then(|name|name.to_str()).unwrap_or("Copia de recuperación.json"),"byteLength":count})}
            }
        };
        #[cfg(target_os="ios")]
        let mut result={return Err("La entrega de copias no está disponible en este dispositivo".into());};
        if !matches!(result["status"].as_str(),Some("saved"|"cancelled")){return Err("No se pudo confirmar la entrega. Comprueba el destino antes de repetir".into());}
        result["requestId"]=json!(knownext_core::compact_id("recovery-export"));result["completedAt"]=json!(knownext_core::now_iso());Ok(result)
    }).await.map_err(|_|"La entrega se interrumpió. Comprueba el destino; no se repite automáticamente")?
}

#[tauri::command]
pub async fn export_conflict_payload_backup(app:tauri::AppHandle,window:tauri::WebviewWindow,id:String,revision:String)->Result<Value,String>{
    require_workspace_window(&window)?;
    tauri::async_runtime::spawn_blocking(move||{
        let state=app.state::<LocalApiState>();let frozen=state.1.freeze_conflict_payload_backup(&id,&revision)?;
        #[cfg(target_os="android")]
        let mut result={let cache=app.path().app_cache_dir().map_err(|_|"No se puede preparar el respaldo")?;let staged=frozen.stage(&cache)?;super::android_exports::save(&app,&staged)?};
        #[cfg(not(any(target_os="android",target_os="ios")))]
        let mut result={use tauri_plugin_dialog::DialogExt;match app.dialog().file().set_title("Respaldar conflicto · elige un ZIP nuevo").set_file_name(frozen.filename()).add_filter("Respaldo privado completo",&["zip"]).blocking_save_file(){None=>json!({"status":"cancelled"}),Some(file)=>{let path=file.into_path().map_err(|_|"El selector no devolvió un archivo local")?;let count=state.1.write_system_recovery(&frozen,&path)?;json!({"status":"saved","fileName":path.file_name().and_then(|n|n.to_str()).unwrap_or("Variantes.zip"),"byteLength":count})}}};
        #[cfg(target_os="ios")]
        let mut result={return Err("El respaldo no está disponible en este dispositivo".into());};
        if !matches!(result["status"].as_str(),Some("saved"|"cancelled")){return Err("No se confirmó el respaldo; comprueba el destino antes de repetir".into());}
        result["schemaVersion"]=json!(1);result["attemptId"]=json!(id);result["reviewRevision"]=json!(revision);result["archiveSha256"]=json!(frozen.sha256());if result["status"]=="saved"{result["byteLength"]=json!(frozen.byte_length());}result["canDelete"]=json!(false);result["requestId"]=json!(knownext_core::compact_id("variants-export"));result["completedAt"]=json!(knownext_core::now_iso());Ok(result)
    }).await.map_err(|_|"La entrega se interrumpió. Comprueba el destino; no se repite automáticamente")?
}
#[tauri::command]
pub async fn retire_conflict_payloads(app:tauri::AppHandle,window:tauri::WebviewWindow,id:String,revision:String,acknowledge:bool)->Result<Value,String>{
    require_workspace_window(&window)?;
    if !acknowledge{return Err("Confirma la retirada permanente antes de elegir el respaldo".into());}
    tauri::async_runtime::spawn_blocking(move||{
        let state=app.state::<LocalApiState>();
        #[cfg(target_os="android")]
        let mut result={let cache=app.path().app_cache_dir().map_err(|_|"No se puede preparar la comprobación")?;let reserved=state.1.reserve_mixed_backup_inspection(&cache)?;let picked=super::android_exports::pick_recovery(&app,&reserved.path)?;if picked["status"]=="cancelled"{json!({"status":"cancelled"})}else if picked["status"]=="selected"{let review=state.1.retire_conflict_payloads(&id,&revision,acknowledge,&reserved.path)?;json!({"status":"completed","review":review})}else{return Err("No se confirmó el respaldo elegido; consulta sin repetir".into());}};
        #[cfg(not(any(target_os="android",target_os="ios")))]
        let mut result={use tauri_plugin_dialog::DialogExt;match app.dialog().file().set_title("Retirar copias locales · elige el respaldo completo que conservarás").add_filter("Respaldo ZIP",&["zip"]).blocking_pick_file(){None=>json!({"status":"cancelled"}),Some(file)=>{let path=file.into_path().map_err(|_|"El selector no devolvió un archivo local")?;let review=state.1.retire_conflict_payloads(&id,&revision,acknowledge,&path)?;json!({"status":"completed","review":review})}}};
        #[cfg(target_os="ios")]
        let mut result={return Err("La retirada no está disponible en este dispositivo".into());};
        result["schemaVersion"]=json!(1);result["attemptId"]=json!(id);result["requestRevision"]=json!(revision);result["requestId"]=json!(knownext_core::compact_id("variants-retirement"));result["completedAt"]=json!(knownext_core::now_iso());Ok(result)
    }).await.map_err(|_|"La retirada se interrumpió. Consulta el estado sin repetir la operación")?
}

pub async fn export_recovery_unit(app:tauri::AppHandle,window:tauri::WebviewWindow,family:String,key:String,revision:String,archived:bool)->Result<Value,String>{
    require_workspace_window(&window)?;
    tauri::async_runtime::spawn_blocking(move||{
        let location=crate::PROJECT_LOCATION_GATE.lock().map_err(|_|"No se pudo comprobar la actividad de audio")?;
        let state=app.state::<LocalApiState>();
        if matches!(family.as_str(),"recordings"|"recordings-dev"){app.state::<knownext_recording::RecordingService>().request("portable-ready",json!({}))?;}
        let frozen=state.1.freeze_recovery_unit(&family,&key,&revision,archived)?;
        drop(location);
        #[cfg(target_os="android")]
        let mut result={let cache=app.path().app_cache_dir().map_err(|_|"No se pudo preparar el respaldo")?;let staged=frozen.stage(&cache)?;super::android_exports::save(&app,&staged)?};
        #[cfg(not(any(target_os="android",target_os="ios")))]
        let mut result={use tauri_plugin_dialog::DialogExt;match app.dialog().file().set_title("Conservar respaldo privado · elige un ZIP nuevo").set_file_name(frozen.filename()).add_filter("Respaldo privado",&["zip"]).blocking_save_file(){None=>json!({"status":"cancelled"}),Some(file)=>{let path=file.into_path().map_err(|_|"El selector no devolvió un archivo local")?;let count=state.1.write_system_recovery(&frozen,&path)?;json!({"status":"saved","fileName":path.file_name().and_then(|n|n.to_str()).unwrap_or("Recuperacion.zip"),"byteLength":count})}}};
        #[cfg(target_os="ios")]
        let mut result={return Err("El respaldo no está disponible en este dispositivo".into());};
        if !matches!(result["status"].as_str(),Some("saved"|"cancelled")){return Err("Entrega sin confirmar. Comprueba el destino antes de repetir".into());}
        result["requestId"]=json!(knownext_core::compact_id("recovery-unit"));result["completedAt"]=json!(knownext_core::now_iso());result["archiveSha256"]=json!(frozen.sha256());Ok(result)
    }).await.map_err(|_|"Entrega interrumpida. Comprueba el destino antes de repetir")?
}

pub async fn retire_recovery_unit(app:tauri::AppHandle,window:tauri::WebviewWindow,family:String,key:String,revision:String,acknowledge:bool)->Result<Value,String>{
 require_workspace_window(&window)?;if !acknowledge{return Err("Confirma la retirada permanente antes de elegir el respaldo".into());}
 tauri::async_runtime::spawn_blocking(move||{
 let state=app.state::<LocalApiState>();
 #[cfg(target_os="android")]
 let mut result={let cache=app.path().app_cache_dir().map_err(|_|"No se pudo preparar la comprobación")?;let reserved=state.1.reserve_mixed_backup_inspection(&cache)?;let picked=super::android_exports::pick_recovery(&app,&reserved.path)?;if picked["status"]=="cancelled"{json!({"status":"cancelled"})}else if picked["status"]=="selected"{let review=state.1.retire_recovery_unit(&family,&key,&revision,acknowledge,&reserved.path)?;json!({"status":"completed","review":review})}else{return Err("El respaldo elegido no está confirmado; consulta sin repetir".into());}};
 #[cfg(not(any(target_os="android",target_os="ios")))]
 let mut result={use tauri_plugin_dialog::DialogExt;match app.dialog().file().set_title("Retirar bytes locales · elige el respaldo privado completo").add_filter("Respaldo privado ZIP",&["zip"]).blocking_pick_file(){None=>json!({"status":"cancelled"}),Some(file)=>{let path=file.into_path().map_err(|_|"El selector no devolvió un archivo local")?;let review=state.1.retire_recovery_unit(&family,&key,&revision,acknowledge,&path)?;json!({"status":"completed","review":review})}}};
 #[cfg(target_os="ios")]
 let mut result={return Err("Retirada no disponible en este dispositivo".into());};
 result["requestId"]=json!(knownext_core::compact_id("recovery-retirement"));result["completedAt"]=json!(knownext_core::now_iso());Ok(result)
 }).await.map_err(|_|"La retirada se interrumpió. Consulta sin repetir")?
}
