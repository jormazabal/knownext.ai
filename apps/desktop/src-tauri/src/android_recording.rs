use jni::{
    objects::{JByteArray, JClass, JString},
    sys::jstring,
    JNIEnv,
};
use knownext_recording::RecordingService;
use knownext_storage::LocalApi;
use serde_json::{json, Value};
use std::{
    path::PathBuf,
    sync::{Arc,Mutex, OnceLock},
};
use tauri::{plugin::PluginHandle, Manager, Emitter};
static APP: OnceLock<tauri::AppHandle> = OnceLock::new();
static INIT_LOCK: Mutex<()> = Mutex::new(());
static STATE_OWNER:Mutex<Option<(PathBuf,Arc<knownext_storage::RuntimeOwner>)>>=Mutex::new(None);
pub fn state_owner(root:&std::path::Path)->Result<Arc<knownext_storage::RuntimeOwner>,String>{
    let canonical=root.canonicalize().map_err(|_|"No se puede verificar el estado local de Android")?;
    let mut owner=STATE_OWNER.lock().map_err(|_|"No se puede coordinar el estado local de Android")?;
    if let Some((path,lease))=&*owner{return if path==&canonical{Ok(lease.clone())}else{Err("El proceso ya utiliza otro estado local".into())};}
    let lease=Arc::new(knownext_storage::acquire_runtime_owner(root)?);*owner=Some((canonical,lease.clone()));Ok(lease)
}
static RUNTIME: OnceLock<(RecordingService, Mutex<LocalApi>)> = OnceLock::new();
pub struct AndroidRecording(pub PluginHandle<tauri::Wry>);
pub fn init_runtime(root: PathBuf) -> Result<RecordingService, String> {
    let _guard = INIT_LOCK.lock().map_err(|e| e.to_string())?;
    state_owner(&root)?;
    let _ = rustls::crypto::ring::default_provider().install_default();
    if let Some((s, _)) = RUNTIME.get() {
        return Ok(s.clone());
    }
    let service = RecordingService::new(root.join(if cfg!(debug_assertions) {
        "recordings-dev"
    } else {
        "recordings"
    }))?;
    let api = LocalApi::new(root, env!("CARGO_PKG_VERSION").into(), "mobile".into());
    let _ = RUNTIME.set((service.clone(), Mutex::new(api)));
    let receipts_service=service.clone();
    std::thread::spawn(move||{
        let _=knownext_recording::transcription::reconcile_usage(&receipts_service,|receipt|{
            RUNTIME.get().ok_or("Runtime no inicializado")?.1.lock().map_err(|_|"No se puede revisar el consumo de audio")?.record_recording_usage(receipt)
        });
    });
    Ok(service)
}
/// The foreground and background worker share all domain gates, including usage.
pub fn local_api()->Result<LocalApi,String>{
    Ok(RUNTIME.get().ok_or("Runtime no inicializado")?.1.lock().map_err(|_|"No se puede consultar el runtime Android")?.clone())
}
pub fn plugin() -> tauri::plugin::TauriPlugin<tauri::Wry> {
    tauri::plugin::Builder::new("recording")
        .setup(|app, api| {
            let _=APP.set(app.clone());
            let handle = api.register_android_plugin("ai.knownext.mobile", "RecordingPlugin")?;
            app.manage(AndroidRecording(handle));
            Ok(())
        })
        .build()
}
fn result(env: &mut JNIEnv, result: Result<Value, String>) -> jstring {
    let value = match result {
        Ok(value) => json!({"ok":true,"value":value}),
        Err(error) => json!({"ok":false,"error":error}),
    };
    env.new_string(value.to_string())
        .map(|s| s.into_raw())
        .unwrap_or(std::ptr::null_mut())
}
#[no_mangle]
pub extern "system" fn Java_ai_knownext_mobile_RecordingBridge_nativeInit(
    mut env: JNIEnv,
    _: JClass,
    root: JString,
) -> jstring {
    let res = (|| {
        let root: String = env.get_string(&root).map_err(|e| e.to_string())?.into();
        init_runtime(PathBuf::from(root))?;
        Ok(Value::Null)
    })();
    result(&mut env, res)
}
#[no_mangle]
pub extern "system" fn Java_ai_knownext_mobile_RecordingBridge_nativeCommand(
    mut env: JNIEnv,
    _: JClass,
    action: JString,
    payload: JString,
) -> jstring {
    let res = (|| {
        let action: String = env.get_string(&action).map_err(|e| e.to_string())?.into();
        let payload: String = env.get_string(&payload).map_err(|e| e.to_string())?.into();
        RUNTIME.get().ok_or("Runtime no inicializado")?.0.request(
            &action,
            serde_json::from_str(&payload).map_err(|e| e.to_string())?,
        )
    })();
    result(&mut env, res)
}
#[no_mangle]
pub extern "system" fn Java_ai_knownext_mobile_RecordingBridge_nativeSamples(
    mut env: JNIEnv,
    _: JClass,
    id: JString,
    data: JByteArray,
) -> jstring {
    let res = (|| {
        let id: String = env.get_string(&id).map_err(|e| e.to_string())?.into();
        let bytes = env.convert_byte_array(data).map_err(|e| e.to_string())?;
        RUNTIME
            .get()
            .ok_or("Runtime no inicializado")?
            .0
            .request("external-pcm", json!({"id":id,"bytes":bytes}))
    })();
    result(&mut env, res)
}
#[no_mangle]
pub extern "system" fn Java_ai_knownext_mobile_RecordingBridge_nativeWork(
    mut env: JNIEnv,
    _: JClass,
) -> jstring {
    let res = (|| {
        let (s, api) = RUNTIME.get().ok_or("Runtime no inicializado")?;
        let more = knownext_recording::transcription::one_fragment(
            s,
            |project| {
                let status=api.lock().map_err(|e|e.to_string())?.ai_spend_assessment(Some(project))?;
                if status["checks"].as_array().is_some_and(|checks|checks.iter().any(|check|check["state"]!="ok")) { if let Some(app)=APP.get(){let _=app.emit("ai-budget-warning", &status);} }
                api.lock()
                    .map_err(|e| e.to_string())?
                    .recording_transcription_credential(project)
            },
            |receipt| {
                api.lock().map_err(|e|e.to_string())?.record_recording_usage(receipt)
            },
            |id, d, t| {
                let document=api.lock().map_err(|e|e.to_string())?.create_recording_document(id,&d.project_id,d.folder_id.as_deref(),&d.name,t)?;
                if let Some(app)=APP.get() { let _=app.emit("recording-document-created",json!({"id":document,"projectId":d.project_id})); }
                Ok(document)
            },
        )?;
        Ok(json!({"more":more}))
    })();
    result(&mut env, res)
}
