//! Optional direct SDK work while the native process is available.
use crate::runtime_dispatch::LocalApiState;
use tauri::Manager;
pub(crate) fn start(app: &tauri::AppHandle) {
    let api = app.state::<LocalApiState>().1.clone();
    let _ = std::thread::Builder::new()
        .name("knownext-proton-sync".into())
        .spawn(move || loop {
            let _ = api.run_due_proton_sync();
            std::thread::sleep(std::time::Duration::from_secs(20));
        });
}
