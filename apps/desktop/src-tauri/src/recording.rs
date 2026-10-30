use crate::LocalApiState;
use knownext_recording::RecordingService;
use serde_json::{json, Value};
use tauri::{Emitter, Manager};

#[tauri::command]
pub async fn openai_model_access(app: tauri::AppHandle, model: String) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let key = app
            .state::<LocalApiState>()
            .0
            .lock()
            .map_err(|e| e.to_string())?
            .recording_credential()?;
        knownext_storage::LocalApi::model_access(&key, &model)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn recording_request(
    app: tauri::AppHandle,
    action: String,
    payload: Value,
) -> Result<Value, String> {
    if ![
        "snapshot",
        "devices",
        "settings",
        "dictation-acquire",
        "dictation-release",
        "preview",
        "preview-stop",
        "start",
        "pause",
        "resume",
        "inputs",
        "stop",
        "discard",
        "destination",
        "keep",
        "lease",
        "release",
        "delete-audio",
        "queue",
        "cancel-job",
    ]
    .contains(&action.as_str())
    {
        return Err("Acción no permitida".into());
    }
    let notify = !["snapshot", "devices", "lease", "release"].contains(&action.as_str());
    let service = app.state::<RecordingService>().inner().clone();
    let worker_app = app.clone();
    let result=tauri::async_runtime::spawn_blocking(move || {
        #[cfg(target_os="android")]
        if ["start","pause","resume","inputs","stop","discard","preview","preview-stop","queue"].contains(&action.as_str()) {
            return worker_app.state::<crate::android_recording::AndroidRecording>().0.run_mobile_plugin::<Value>("control",json!({"action":action,"payload":payload,"root":worker_app.path().app_data_dir().map_err(|e|e.to_string())?})).map_err(|e|e.to_string());
        }
        #[cfg(desktop)]
        if action=="settings" && !cfg!(debug_assertions) {
            use tauri_plugin_autostart::ManagerExt;
            if payload["startWithWindows"].as_bool().unwrap_or(false) { worker_app.autolaunch().enable().map_err(|e|e.to_string())?; }
            else { worker_app.autolaunch().disable().map_err(|e|e.to_string())?; }
        }
        let result=service.request(&action,payload.clone())?;
        if action=="queue" || (action=="stop" && result["sessions"].as_array().is_some_and(|a|a.iter().any(|s|s["id"]==payload["id"] && s["status"]=="ready"))) {
            if action=="stop" { service.request("queue",payload)?; }
            start_worker(&worker_app);
        }
        Ok::<_,String>(result)
    }).await.map_err(|e|e.to_string())??;
    if notify {
        let _ = app.emit("recording-changed", ());
    }
    Ok(result)
}

#[tauri::command]
pub async fn recording_audio(
    app: tauri::AppHandle,
    id: String,
    start: u64,
    samples: u64,
) -> Result<String, String> {
    let service = app.state::<RecordingService>().inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        use base64::Engine;
        // IDs are resolved from the manifest; never accept a caller supplied path.
        let snapshot = service.request("snapshot", json!({}))?;
        let session = snapshot["sessions"]
            .as_array()
            .and_then(|a| a.iter().find(|s| s["id"] == id))
            .ok_or("Grabación no encontrada")?;
        if session["audioDeleted"] == true || samples > 24_000 * 30 {
            return Err("Audio no disponible".into());
        }

        let count = samples.min(
            session["samples"]
                .as_u64()
                .unwrap_or(0)
                .saturating_sub(start),
        );
        let audio = knownext_recording::audio::mix(&service.root.join(&id), start, count)?;
        Ok(
            base64::engine::general_purpose::STANDARD
                .encode(knownext_recording::audio::wav(&audio)),
        )
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(desktop)]
pub fn show_window(app: &tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("recordings") {
        window.show().map_err(|e| e.to_string())?;
        window.set_focus().map_err(|e| e.to_string())?;
        return Ok(());
    }
    let window = tauri::WebviewWindowBuilder::new(
        app,
        "recordings",
        tauri::WebviewUrl::App("index.html?recording=true".into()),
    )
    .title("Grabaciones · KnowNext.ai")
    .inner_size(460.0, 680.0)
    .min_inner_size(360.0, 480.0)
    .resizable(true)
    .build()
    .map_err(|e| e.to_string())?;
    if let Some(monitor) = window.current_monitor().map_err(|e| e.to_string())? {
        let area = monitor.work_area();
        let size = window.outer_size().map_err(|e| e.to_string())?;
        let x = area.position.x + (area.size.width.saturating_sub(size.width)) as i32;
        let y = area.position.y + (area.size.height.saturating_sub(size.height)) as i32;
        let _ = window.set_position(tauri::PhysicalPosition::new(x, y));
    }
    Ok(())
}

#[cfg(desktop)]
pub fn setup_tray(app: &tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    use tauri::{
        menu::{Menu, MenuItem},
        tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    };
    let open = MenuItem::with_id(app, "recordings", "Grabaciones", true, None::<&str>)?;
    let main = MenuItem::with_id(app, "main", "Abrir KnowNext.ai", true, None::<&str>)?;
    let exit = MenuItem::with_id(app, "exit", "Salir…", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &main, &exit])?;
    TrayIconBuilder::with_id("recording").icon(icon(false,false)).tooltip("KnowNext.ai · Sin grabar").menu(&menu).show_menu_on_left_click(false)
        .on_tray_icon_event(|tray,event| {if matches!(event,TrayIconEvent::Click{button:MouseButton::Left,button_state:MouseButtonState::Up,..}) {let _=show_window(tray.app_handle());}})
        .on_menu_event(|app,event|match event.id.as_ref() {
            "recordings"=>{let _=show_window(app);},
            "main"=>{if let Some(w)=app.get_webview_window("main"){let _=w.show();let _=w.set_focus();}},
            "exit"=>{
                use tauri_plugin_dialog::{DialogExt,MessageDialogButtons};
                let app=app.clone();
                app.clone().dialog().message("Se finalizará la captura activa y se conservarán el audio y los fragmentos recibidos. Un envío sin respuesta quedará pendiente de revisión.")
                    .title("Salir de KnowNext.ai")
                    .buttons(MessageDialogButtons::OkCancelCustom("Conservar y salir".into(),"Volver".into()))
                    .show(move |confirmed| {if confirmed {let service=app.state::<RecordingService>();if let Ok(snapshot)=service.request("snapshot",json!({})){if let Some(id)=snapshot["captureOwner"].as_str(){let _=service.request("stop",json!({"id":id}));}}app.exit(0);}});
            }, _=>{}
        }).build(app)?;
    let app = app.clone();
    std::thread::spawn(move || {
        let mut previous = String::new();
        loop {
            std::thread::sleep(std::time::Duration::from_secs(1));
            let Ok(snapshot) = app
                .state::<RecordingService>()
                .request("snapshot", json!({}))
            else {
                break;
            };
            let active = snapshot["sessions"]
                .as_array()
                .and_then(|a| a.iter().find(|s| s["id"] == snapshot["captureOwner"]));
            let recording = active.is_some_and(|s| s["status"] == "recording");
            let paused = active.is_some_and(|s| s["status"] == "paused");
            let seconds = active.and_then(|s| s["samples"].as_u64()).unwrap_or(0) / 24000;
            let label = format!(
                "KnowNext.ai · {} · {:02}:{:02}",
                if recording {
                    "Grabando"
                } else if paused {
                    "En pausa"
                } else {
                    "Sin grabar"
                },
                seconds / 60,
                seconds % 60
            );
            if label != previous {
                if let Some(tray) = app.tray_by_id("recording") {
                    let _ = tray.set_icon(Some(icon(recording, paused)));
                    let _ = tray.set_tooltip(Some(&label));
                }
                previous = label;
            }
        }
    });
    Ok(())
}
#[cfg(desktop)]
fn icon(recording: bool, paused: bool) -> tauri::image::Image<'static> {
    let mut pixels = vec![0; 32 * 32 * 4];
    let color = if recording {
        [243, 112, 33, 255]
    } else {
        [107, 114, 128, 255]
    };
    for y in 3..29 {
        for x in 3..29 {
            let draw = if paused {
                (10..14).contains(&x) || (18..22).contains(&x)
            } else {
                (x as i32 - 16).pow(2) + (y as i32 - 16).pow(2) < 140
            };
            if draw {
                pixels[(y * 32 + x) * 4..(y * 32 + x) * 4 + 4].copy_from_slice(&color);
            }
        }
    }
    tauri::image::Image::new_owned(pixels, 32, 32)
}

#[cfg(desktop)]
pub fn initialize(app: &tauri::AppHandle) {
    use tauri_plugin_autostart::ManagerExt;
    let service = app.state::<RecordingService>();
    if let Ok(snapshot) = service.request("snapshot", json!({})) {
        let mut settings = snapshot["settings"].clone();
        let desired = settings["startWithWindows"] == true && !cfg!(debug_assertions);
        let applied = if desired {
            app.autolaunch().enable()
        } else if cfg!(debug_assertions) {
            Ok(())
        } else {
            app.autolaunch().disable()
        };
        if let Err(error) = applied {
            settings["startWithWindows"] = json!(false);
            let _ = service.request("settings", settings);
            let _ = service.request(
                "warning",
                json!({"message":format!("No se pudo registrar el inicio con Windows: {error}")}),
            );
        }
    }
    start_worker(app);
}
pub fn start_worker(app: &tauri::AppHandle) {
    let app = app.clone();
    let service = app.state::<RecordingService>().inner().clone();
    std::thread::spawn(move || {
        let _ = knownext_recording::transcription::drain(
            &service,
            || {
                app.state::<LocalApiState>()
                    .0
                    .lock()
                    .map_err(|e| e.to_string())?
                    .recording_credential()
            },
            |id, dest, text| {
                let document = app
                    .state::<LocalApiState>()
                    .0
                    .lock()
                    .map_err(|e| e.to_string())?
                    .create_recording_document(
                        id,
                        &dest.project_id,
                        dest.folder_id.as_deref(),
                        &dest.name,
                        text,
                    )?;
                let _ = app.emit(
                    "recording-document-created",
                    json!({"id":document,"projectId":dest.project_id}),
                );
                Ok(document)
            },
        );
        let _ = app.emit("recording-changed", ());
    });
}
