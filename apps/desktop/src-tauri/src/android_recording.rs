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
    sync::{Mutex, OnceLock},
};
use tauri::{plugin::PluginHandle, Manager, Emitter};
static APP: OnceLock<tauri::AppHandle> = OnceLock::new();
static INIT_LOCK: Mutex<()> = Mutex::new(());
static RUNTIME: OnceLock<(RecordingService, Mutex<LocalApi>)> = OnceLock::new();
pub struct AndroidRecording(pub PluginHandle<tauri::Wry>);
pub fn init_runtime(root: PathBuf) -> Result<RecordingService, String> {
    let _guard = INIT_LOCK.lock().map_err(|e| e.to_string())?;
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
    Ok(service)
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
            || {
                api.lock()
                    .map_err(|e| e.to_string())?
                    .recording_credential()
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
