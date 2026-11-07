use serde_json::{json, Value};
use tauri::{plugin::PluginHandle, Manager};
pub struct AndroidExports(PluginHandle<tauri::Wry>);
pub fn plugin() -> tauri::plugin::TauriPlugin<tauri::Wry> {
    tauri::plugin::Builder::new("knownext-exports")
        .setup(|app, api| {
            let handle = api.register_android_plugin("ai.knownext.mobile", "ExportPlugin")?;
            app.manage(AndroidExports(handle));
            Ok(())
        })
        .build()
}
pub fn save(
    app: &tauri::AppHandle,
    source: &knownext_storage::StagedUserExport,
) -> Result<Value, String> {
    app.state::<AndroidExports>().0.run_mobile_plugin("saveFile",json!({"sourcePath":source.path,"fileName":source.filename,"mimeType":source.content_type})).map_err(|error|error.to_string())
}
pub fn open(app: &tauri::AppHandle, id: &str) -> Result<Value, String> {
    app.state::<AndroidExports>()
        .0
        .run_mobile_plugin("openSaved", json!({"exportId":id}))
        .map_err(|error| error.to_string())
}
pub fn pick_template(app: &tauri::AppHandle) -> Result<Value, String> {
    app.state::<AndroidExports>()
        .0
        .run_mobile_plugin("pickTemplate", json!({}))
        .map_err(|e| e.to_string())
}
pub fn pick_project(app:&tauri::AppHandle,destination:&std::path::Path)->Result<Value,String>{
    app.state::<AndroidExports>().0.run_mobile_plugin("pickProject",json!({"destinationPath":destination})).map_err(|_| "No se pudo leer el paquete elegido".into())
}
pub fn pick_recovery(app:&tauri::AppHandle,destination:&std::path::Path)->Result<Value,String>{app.state::<AndroidExports>().0.run_mobile_plugin("pickRecoveryArchive",json!({"destinationPath":destination})).map_err(|_|"No se pudo leer el respaldo elegido".into())}
