fn main() {
    let target_triple =
        std::env::var("TARGET").unwrap_or_else(|_| "x86_64-pc-windows-msvc".to_string());
    let extension = if target_triple.contains("windows") {
        ".exe"
    } else {
        ""
    };
    let sidecar_path = std::path::PathBuf::from("binaries")
        .join(format!("knownext-backend-{target_triple}{extension}"));

    if !sidecar_path.exists() {
        if std::env::var("PROFILE").as_deref() == Ok("debug") {
            if let Some(parent) = sidecar_path.parent() {
                std::fs::create_dir_all(parent).expect("failed to create debug sidecar directory");
            }
            std::fs::write(&sidecar_path, []).expect("failed to create debug sidecar placeholder");
        } else {
            panic!(
                "backend sidecar is missing at {}. Run scripts/build-backend-sidecar.ps1 before building a release bundle.",
                sidecar_path.display()
            );
        }
    }

    tauri_build::build()
}
