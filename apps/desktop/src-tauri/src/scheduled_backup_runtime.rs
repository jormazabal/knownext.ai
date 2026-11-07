//! In-process scheduling. No OS task, service, or WebView lifetime dependency.
use crate::runtime_dispatch::LocalApiState;
use tauri::Manager;

pub(crate) fn start(app: &tauri::AppHandle) {
    let api = app.state::<LocalApiState>().1.clone();
    let _ = std::thread::Builder::new()
        .name("knownext-scheduled-backups".into())
        .spawn(move || loop {
            // Disabled policies perform no writes. The domain service admits at most
            // one catch-up per project and coordinates with restart/private work.
            let _ = api.run_due_scheduled_backups();
            std::thread::sleep(std::time::Duration::from_secs(60));
        });
}
