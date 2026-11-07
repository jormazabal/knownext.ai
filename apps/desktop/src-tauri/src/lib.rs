use base64::Engine;
use knownext_storage::{LocalApi, LocalApiResponse};
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::http::{header, Response, StatusCode, Uri};
use tauri::Manager;
#[cfg(target_os = "android")]
mod android_recording;
#[cfg(target_os = "android")]
mod android_credentials;
#[cfg(target_os = "android")]
mod android_exports;
mod recording;
mod template_transfer;
mod ai_usage;
mod recovery;
mod project_transfer;
use time::{format_description::well_known::Rfc3339, OffsetDateTime};


mod runtime_dispatch;
mod scheduled_backup_runtime;
mod proton_sync_runtime;
mod navigation_policy;
mod operations;
mod managed_native;
mod restart;
mod workspace_exit;
mod runtime_services;
use runtime_dispatch::{LocalApiRequest, LocalApiState};
static PROJECT_LOCATION_GATE:Mutex<()> = Mutex::new(());

fn require_workspace_window(window:&tauri::WebviewWindow)->Result<(),String> {
    if knownext_core::window_policy::allows_workspace_command(window.label()) {Ok(())} else {Err("Esta operación requiere el espacio principal".into())}
}

fn trace_timestamp() -> String {
    OffsetDateTime::now_utc()
        .format(&Rfc3339)
        .unwrap_or_else(|_| "unknown-time".to_string())
}

fn runtime_reply<T:serde::Serialize>(id:&str,result:Result<T,String>)->Result<serde_json::Value,String>{let mut value=serde_json::to_value(result?).map_err(|_|"invalid-runtime-response")?;let object=value.as_object_mut().ok_or("invalid-runtime-response")?;object.insert("protocolVersion".into(),serde_json::json!(1));object.insert("operationId".into(),serde_json::json!(id));object.insert("completedAt".into(),serde_json::json!(knownext_core::now_iso()));Ok(value)}

#[tauri::command]
async fn local_api_request(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    request: LocalApiRequest,
    operation_id: Option<String>,
) -> Result<serde_json::Value, String> {
    if !knownext_core::window_policy::allows_local_api(window.label(),&request.method,&request.path) {
        return Err("Esta operación no está disponible desde esta ventana".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let operation_id=operations::admit(&app,&request,operation_id)?;
        let api = app.state::<LocalApiState>();
        let running=operations::start(&app,&operation_id)?;
        let _context=running.bind();
        let result=(|| {
        let owner=knownext_storage::reviewed_location_owner(&request.method,&request.path,request.body.as_ref().unwrap_or(&serde_json::Value::Null));
        let _location_guard=if owner.is_some(){Some(PROJECT_LOCATION_GATE.lock().map_err(|_|"No se puede revisar la actividad del proyecto")?)}else{None};
        if let Some(owner)=owner {
            let snapshot=app.state::<knownext_recording::RecordingService>().request("snapshot",serde_json::json!({}))?;
            if knownext_storage::location_recording_blocker(&snapshot,&owner){return Err("El proyecto tiene grabaciones pendientes o en curso. Finalízalas o cambia su destino antes de revincularlo".into());}
        }
        api.request(request)
        })();
        operations::finish(running,result.as_ref().ok().map(|response|response.status<400));
        runtime_reply(&operation_id,result)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn local_api_content(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    request: LocalApiRequest,
    operation_id: Option<String>,
) -> Result<serde_json::Value, String> {
    if !knownext_core::window_policy::allows_workspace_command(window.label()) {return Err("El contenido documental solo está disponible en el espacio principal".into());}
    tauri::async_runtime::spawn_blocking(move || {
        let operation_id=operations::admit_content(&app,&request,operation_id)?;
        let api = app.state::<LocalApiState>();
        let running=operations::start(&app,&operation_id)?;
        let _context=running.bind();
        let result=(|| {
        if knownext_storage::is_export_content_request(&request.method,&request.path) {
            return knownext_storage::dispatch_export_content(&api.0,&api.3,&request.path,request.body.unwrap_or(serde_json::Value::Null));
        }
        // Remaining content routes only read assets or render a preview from a
        // snapshot. Neither needs to hold the document mutation authority.
        api.1.content(
            &request.path,
            request.body.unwrap_or(serde_json::Value::Null),
        )
        })();
        operations::finish(running,result.as_ref().ok().map(|response|response.status<400));
        runtime_reply(&operation_id,result)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn export_document_mobile(app:tauri::AppHandle,window:tauri::WebviewWindow,request:LocalApiRequest)->Result<serde_json::Value,String> {
    require_workspace_window(&window)?;
    if !knownext_storage::is_export_content_request(&request.method,&request.path){return Err("La entrega móvil necesita una exportación documental válida".into());}
    #[cfg(target_os="android")]
    return tauri::async_runtime::spawn_blocking(move||{
        let request_id=knownext_core::compact_id("export");
        let cache=app.path().app_cache_dir().map_err(|error|error.to_string())?;
        let api=app.state::<LocalApiState>();
        let staged=knownext_storage::stage_export_content(&api.0,&api.3,&request.path,request.body.unwrap_or(serde_json::Value::Null),&cache)?;
        let mut result=android_exports::save(&app,&staged)?;
        if !matches!(result["status"].as_str(),Some("saved"|"cancelled")){return Err("No se pudo confirmar el resultado de la entrega".into());}
        result["requestId"]=serde_json::json!(request_id);result["completedAt"]=serde_json::json!(knownext_core::now_iso());Ok(result)
    }).await.map_err(|error|error.to_string())?;
    #[cfg(not(target_os="android"))]
    {let _=(app,request);Err("La entrega móvil solo está disponible en Android".into())}
}
#[tauri::command]
async fn open_mobile_export(app:tauri::AppHandle,window:tauri::WebviewWindow,export_id:String)->Result<serde_json::Value,String> {
    require_workspace_window(&window)?;
    #[cfg(target_os="android")]
    return tauri::async_runtime::spawn_blocking(move||{
        let mut result=android_exports::open(&app,&export_id)?;
        result["exportId"]=serde_json::json!(export_id);result["completedAt"]=serde_json::json!(knownext_core::now_iso());Ok(result)
    }).await.map_err(|error|error.to_string())?;
    #[cfg(not(target_os="android"))]
    {let _=(app,export_id);Err("La entrega móvil solo está disponible en Android".into())}
}

#[tauri::command]
async fn get_trace_log_status(app: tauri::AppHandle, window: tauri::WebviewWindow) -> Result<serde_json::Value, String> {
    require_workspace_window(&window)?;
    tauri::async_runtime::spawn_blocking(move||app.state::<LocalApiState>().1.safe_diagnostic_status()).await.map_err(|_|"No se pudo consultar el diagnóstico")?
}

#[tauri::command]
async fn record_trace_log(app: tauri::AppHandle, window: tauri::WebviewWindow, level: String, source: String, message: Option<String>, detail: Option<String>) -> Result<serde_json::Value, String> {
    require_workspace_window(&window)?;
    // Old clients may still send these fields; neither enters the event store.
    let _=(message,detail);
    tauri::async_runtime::spawn_blocking(move||app.state::<LocalApiState>().1.record_safe_diagnostic(serde_json::json!({"level":level,"source":source}))).await.map_err(|_|"No se pudo registrar el diagnóstico")?
}

#[tauri::command]
fn open_folder(window: tauri::WebviewWindow, folder_path: String) -> Result<(), String> {
    require_workspace_window(&window)?;
    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        let _ = folder_path;
        Err("Abrir carpetas del sistema no está disponible en la app móvil.".to_string())
    }

    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        std::fs::create_dir_all(&folder_path).map_err(|error| error.to_string())?;

        #[cfg(target_os = "windows")]
        std::process::Command::new("explorer")
            .arg(&folder_path)
            .spawn()
            .map_err(|error| error.to_string())?;

        #[cfg(target_os = "macos")]
        std::process::Command::new("open")
            .arg(&folder_path)
            .spawn()
            .map_err(|error| error.to_string())?;

        #[cfg(all(unix, not(target_os = "macos"), not(target_os = "android")))]
        std::process::Command::new("xdg-open")
            .arg(&folder_path)
            .spawn()
            .map_err(|error| error.to_string())?;

        Ok(())
    }
}

#[cfg(any(target_os = "android", target_os = "ios"))]
fn install_mobile_crypto_provider() {
    let _ = rustls::crypto::ring::default_provider().install_default();
}

fn runtime_profile() -> &'static str {
    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        "mobile"
    }

    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        "desktop"
    }
}

fn knownext_asset_response(api: &LocalApi, uri: &Uri) -> Response<Vec<u8>> {
    let Some((project_id, asset_id)) = parse_knownext_asset_uri(uri) else {
        return text_response(
            StatusCode::BAD_REQUEST,
            "Referencia de imagen de proyecto no valida.",
        );
    };
    let content_path = format!("/api/projects/{project_id}/assets/{asset_id}/content");
    match api.content(&content_path, serde_json::Value::Null) {
        Ok(content) if content.status == 200 => {
            let bytes = match base64::engine::general_purpose::STANDARD.decode(content.data_base64)
            {
                Ok(bytes) => bytes,
                Err(error) => {
                    return text_response(
                        StatusCode::INTERNAL_SERVER_ERROR,
                        &format!("No se pudo decodificar la imagen: {error}"),
                    )
                }
            };
            Response::builder()
                .status(StatusCode::OK)
                .header(header::CONTENT_TYPE, content.content_type)
                .header(header::CACHE_CONTROL, "no-store")
                .body(bytes)
                .unwrap_or_else(|_| {
                    text_response(
                        StatusCode::INTERNAL_SERVER_ERROR,
                        "Respuesta de imagen no valida.",
                    )
                })
        }
        Ok(content) => text_response(
            StatusCode::from_u16(content.status).unwrap_or(StatusCode::BAD_REQUEST),
            "No se pudo cargar la imagen del proyecto.",
        ),
        Err(error) => text_response(StatusCode::NOT_FOUND, &error),
    }
}

fn parse_knownext_asset_uri(uri: &Uri) -> Option<(String, String)> {
    let host = uri.host();
    let path = uri.path().trim_start_matches('/');
    if let Some(project_id) = host.filter(|value| {
        !value.is_empty() && *value != "localhost" && !value.ends_with(".localhost")
    }) {
        let asset_id = path.split('/').next().filter(|value| !value.is_empty())?;
        return Some((project_id.to_string(), asset_id.to_string()));
    }
    let mut parts = path.split('/');
    let project_id = parts.next().filter(|value| !value.is_empty())?;
    let asset_id = parts.next().filter(|value| !value.is_empty())?;
    Some((project_id.to_string(), asset_id.to_string()))
}

fn text_response(status: StatusCode, message: &str) -> Response<Vec<u8>> {
    Response::builder()
        .status(status)
        .header(header::CONTENT_TYPE, "text/plain; charset=utf-8")
        .body(message.as_bytes().to_vec())
        .unwrap()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // A separate WebView profile lets the installed app and development build coexist.
    #[cfg(all(windows, debug_assertions))]
    if std::env::var_os("WEBVIEW2_USER_DATA_FOLDER").is_none() {
        if let Some(local)=std::env::var_os("LOCALAPPDATA") {
            std::env::set_var("WEBVIEW2_USER_DATA_FOLDER",PathBuf::from(local).join("ai.knownext.desktop").join("webview-recording-dev"));
        }
    }
    #[cfg(any(target_os = "android", target_os = "ios"))]
    install_mobile_crypto_provider();

    let builder = tauri::Builder::default()
        .plugin(tauri::plugin::Builder::<tauri::Wry>::new("navigation-policy").on_navigation(|_,url|navigation_policy::allowed(url,cfg!(debug_assertions))).build());
    #[cfg(target_os = "android")]
    let builder = builder.plugin(android_recording::plugin()).plugin(android_exports::plugin());
    #[cfg(all(desktop, not(debug_assertions)))]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, _, _| {
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.show();
            let _ = window.set_focus();
        }
    }));
    #[cfg(desktop)]
    let builder = builder.plugin(
        tauri_plugin_autostart::Builder::new()
            .args(["--background"])
            .build(),
    );

    builder
        .register_asynchronous_uri_scheme_protocol("knownext-asset", |ctx, request, responder| {
            if !knownext_core::window_policy::allows_workspace_command(ctx.webview_label()) {responder.respond(text_response(StatusCode::FORBIDDEN,"Recurso documental no disponible desde esta ventana"));return;}
            let api=ctx.app_handle().state::<LocalApiState>().1.clone();
            tauri::async_runtime::spawn_blocking(move||responder.respond(knownext_asset_response(&api,request.uri())));
        })
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            #[cfg(desktop)]
            app.handle().plugin(tauri_plugin_process::init())?;

            #[cfg(desktop)]
            app.handle()
                .plugin(tauri_plugin_updater::Builder::new().build())?;

            let app_data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&app_data_dir)?;
            #[cfg(not(target_os="android"))]
            let state_owner=knownext_storage::acquire_runtime_owner(&app_data_dir).map_err(std::io::Error::other)?;
            #[cfg(target_os="android")]
            let state_owner=android_recording::state_owner(&app_data_dir).map_err(std::io::Error::other)?;
            app.manage(state_owner);
            let currency_root = app_data_dir.clone();
            std::thread::spawn(move || loop {
                let _ = knownext_storage::currency::refresh(&currency_root);
                std::thread::sleep(std::time::Duration::from_secs(3600));
            });
            let recording_root = app_data_dir.join(if cfg!(debug_assertions) {
                "recordings-dev"
            } else {
                "recordings"
            });
            #[cfg(not(target_os = "android"))]
            let recordings = knownext_recording::RecordingService::new(recording_root)
                .map_err(std::io::Error::other)?;
            #[cfg(target_os = "android")]
            let recordings = android_recording::init_runtime(app_data_dir.clone())
                .map_err(std::io::Error::other)?;
            app.manage(recordings);
            #[cfg(not(target_os = "android"))]
            let api = LocalApi::new(
                app_data_dir,
                env!("CARGO_PKG_VERSION").to_string(),
                runtime_profile().to_string(),
            );
            #[cfg(target_os = "android")]
            let api=android_recording::local_api().map_err(std::io::Error::other)?;
            // The Proton URL contains an ephemeral fragment key: open natively.
            let browser_app=app.handle().clone();
            knownext_storage::initialize_proton_browser(Box::new(move |url| {
                use tauri_plugin_shell::ShellExt;
                #[allow(deprecated)]
                browser_app.shell().open(url, None).map_err(|_|"No se pudo abrir el navegador de Proton".to_string())
            }));
            #[cfg(not(target_os="android"))]
            if let Ok(resources)=app.path().resource_dir() {
                knownext_storage::initialize_proton_library(resources.join("resources").join("proton").join("windows").join("knownext_proton.dll"));
            }
            app.manage(api.runtime_operations());
            app.manage(restart::RestartFence::default());
            app.manage(workspace_exit::ExitRequest::default());
            app.manage(LocalApiState(Mutex::new(api.clone()), api, Mutex::new(()),Mutex::new(()),Mutex::new(())));
            scheduled_backup_runtime::start(app.handle());
            proton_sync_runtime::start(app.handle());
            #[cfg(desktop)]
            {
                recording::setup_tray(app.handle())?;
                recording::initialize(app.handle());
                if std::env::args().any(|a| a == "--background") {
                    if let Some(w) = app.get_webview_window("main") {
                        let _ = w.hide();
                    }
                }
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            local_api_request,
            managed_native::managed_native_request,
            restart::prepare_runtime_restart,
            restart::release_runtime_restart,
            workspace_exit::confirm_workspace_exit,
            workspace_exit::abort_workspace_exit,
            operations::local_operation_status,
            operations::local_operation_continuity,
            operations::cancel_local_operation,
            local_api_content,
            get_trace_log_status,
            record_trace_log,
            open_folder,
            runtime_services::get_runtime_service_status,
            recording::recording_request,
            recording::recording_audio,
        ])
        .on_window_event(|window, event| {
            #[cfg(desktop)]
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if matches!(window.label(),"main"|"recordings") {
                    api.prevent_close();workspace_exit::close_window(window);
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running KnowNext.ai");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn saved_search_does_not_wait_for_the_mutation_queue() {
        let dir=std::env::temp_dir().join(knownext_core::compact_id("knownext-runtime-concurrency"));
        let api=LocalApi::new(dir.join("state"),"2.6.0".into(),"desktop".into());
        let root=dir.join("project");
        let project=api.handle("POST","/api/projects",serde_json::json!({"name":"Concurrency","folderPath":root.to_string_lossy()}),vec![]).unwrap();
        std::fs::write(root.join("a.md"),"local result").unwrap();
        let project_id=project.body["id"].as_str().unwrap().to_owned();
        let state=std::sync::Arc::new(LocalApiState(Mutex::new(api.clone()),api,Mutex::new(()),Mutex::new(()),Mutex::new(())));
        let guard=state.0.lock().unwrap();
        let worker_state=state.clone();
        let (sender,receiver)=std::sync::mpsc::channel();
        let worker=std::thread::spawn(move||{
            let result=worker_state.request(LocalApiRequest{method:"POST".into(),path:format!("/api/projects/{project_id}/search/content"),body:Some(serde_json::json!({"query":"local"})),files:None});
            for path in ["/api/recovery/drafts", "/api/recovery/archives", "/api/drafts/orphans"] {
                let snapshot=worker_state.request(LocalApiRequest{method:"GET".into(),path:path.into(),body:None,files:None}).unwrap();
                assert_eq!(snapshot.status,200,"read snapshot {path} waited for mutation authority");
            }
            sender.send(result).unwrap();
        });
        let result=receiver.recv_timeout(std::time::Duration::from_secs(3)).expect("search waited for the mutation queue").unwrap();
        assert_eq!(result.body["results"][0]["name"],"a.md");
        drop(guard);worker.join().unwrap();std::fs::remove_dir_all(dir).unwrap();
        assert!(LocalApi::is_independent_snapshot("GET","/api/projects/p/nodes/batch/batch-1"));
        assert!(!LocalApi::is_independent_snapshot("POST","/api/projects/p/nodes/batch/batch-1/execute"));
        assert!(!LocalApi::is_independent_snapshot("PUT","/api/documents/p%3A%3Aa.md"));
        assert!(!LocalApi::is_independent_snapshot("GET","/api/config"));
        assert!(!LocalApi::is_independent_snapshot("POST","/api/recovery/drafts/copy/archive"));
        assert!(!LocalApi::is_independent_snapshot("POST","/api/recovery/drafts/copy/copy"));
    }

    #[test]
    fn independent_audio_validation_does_not_wait_for_mutations_or_contact_a_provider(){
        let root=std::env::temp_dir().join(knownext_core::compact_id("knownext-provider-queue"));
        let api=LocalApi::new(root.clone(),"2.6.0".into(),"test".into());
        let state=std::sync::Arc::new(LocalApiState(Mutex::new(api.clone()),api,Mutex::new(()),Mutex::new(()),Mutex::new(())));
        let gate=state.0.lock().unwrap();let worker=state.clone();let (send,receive)=std::sync::mpsc::channel();
        let thread=std::thread::spawn(move||{send.send(worker.request(LocalApiRequest{method:"POST".into(),path:"/api/transcription".into(),body:None,files:Some(vec![])})).unwrap();});
        let response=receive.recv_timeout(std::time::Duration::from_secs(2)).expect("audio validation must not wait for the document gate").unwrap();assert_eq!(response.body["error"],"missing_audio");
        drop(gate);thread.join().unwrap();std::fs::remove_dir_all(root).unwrap();
        assert!(knownext_storage::is_provider_work("POST","/api/documents/p%3A%3Aa.md/ai/prompt"));assert!(!knownext_storage::is_provider_work("PUT","/api/documents/p%3A%3Aa.md"));
    }

    #[test]
    fn parses_knownext_asset_uri_with_project_host() {
        let uri: Uri = "knownext-asset://knownext-lks/knownext-lks%3A%3Aassets%2Fimage.png"
            .parse()
            .unwrap();

        assert_eq!(
            parse_knownext_asset_uri(&uri),
            Some((
                "knownext-lks".to_string(),
                "knownext-lks%3A%3Aassets%2Fimage.png".to_string()
            ))
        );
    }

    #[test]
    fn parses_knownext_asset_uri_with_project_path() {
        let uri: Uri = "http://knownext-asset.localhost/knownext-lks/assets%2Fimage.png"
            .parse()
            .unwrap();

        assert_eq!(
            parse_knownext_asset_uri(&uri),
            Some(("knownext-lks".to_string(), "assets%2Fimage.png".to_string()))
        );
    }
}

#[cfg(test)]mod runtime_block_contract_tests{
 use super::*;
 #[test]fn runtime_block_wire_envelope_is_correlated_and_future_arguments_are_rejected(){let value=runtime_reply("operation-owned-contract",Ok(LocalApiResponse{status:200,body:serde_json::json!({"owned":true})})).unwrap();assert_eq!(value["protocolVersion"],1);assert_eq!(value["operationId"],"operation-owned-contract");assert_eq!(value["body"]["owned"],true);assert!(OffsetDateTime::parse(value["completedAt"].as_str().unwrap(),&Rfc3339).is_ok());assert!(serde_json::from_value::<LocalApiRequest>(serde_json::json!({"method":"GET","path":"/health","futureExecution":true})).is_err());}
 #[test]fn runtime_block_authentication_dispatch_does_not_wait_for_document_mutations(){let root=std::env::temp_dir().join(knownext_core::compact_id("knownext-runtime-contract"));let api=LocalApi::new(root.join("state"),"qa".into(),"test".into());let state=std::sync::Arc::new(LocalApiState(Mutex::new(api.clone()),api,Mutex::new(()),Mutex::new(()),Mutex::new(())));let _busy=state.0.lock().unwrap();let worker=state.clone();let(tx,rx)=std::sync::mpsc::channel();let thread=std::thread::spawn(move||{let result=worker.request(LocalApiRequest{method:"POST".into(),path:"/api/auth/github/device/start".into(),body:None,files:None});tx.send(result.is_ok()).unwrap();});assert!(rx.recv_timeout(std::time::Duration::from_secs(3)).unwrap());thread.join().unwrap();}
}
