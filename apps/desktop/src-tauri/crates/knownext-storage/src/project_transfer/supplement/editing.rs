//! Editing provenance travels only as private data, never as a re-executable receipt.
use super::*;
pub(super) fn append(api: &LocalApi, project: &str, b: &mut Builder<'_>) -> Result<(), String> {
    let mut sources = vec![];
    let scope = sha256_hex(project.as_bytes());
    for family in [
        "history-restores",
        "document-replacements",
        "meeting-minutes",
    ] {
        let base = api.app_data_dir.join(family).join(&scope);
        let mut folders = vec![base.clone()];
        while let Some(dir) = folders.pop() {
            for name in b.scan(&dir)? {
                let path = dir.join(&name);
                let meta =
                    fs::symlink_metadata(&path).map_err(|_| "La procedencia editorial cambió")?;
                if batch::linked(&meta) {
                    return Err("La procedencia editorial contiene un enlace; se conserva".into());
                }
                if meta.is_dir() {
                    folders.push(path);
                } else if meta.is_file() {
                    sources.push((
                        path,
                        format!(
                            "{family}/{}",
                            dir.strip_prefix(&base)
                                .map_err(|_| "Procedencia fuera de ámbito")?
                                .join(name)
                                .to_string_lossy()
                                .replace('\\', "/")
                        ),
                    ));
                } else {
                    return Err("Procedencia editorial no regular".into());
                }
            }
        }
    }
    let catalog = api.ai_change_catalog(project)?;
    for item in catalog["items"]
        .as_array()
        .ok_or("Catálogo de cambios no compatible")?
    {
        let id = item["id"]
            .as_str()
            .filter(|s| s.starts_with("ai-change-") && request_scope::portable_id(s))
            .ok_or("Cambio IA no identificado")?;
        sources.push((
            api.app_data_dir
                .join("ai-changes")
                .join(format!("{id}.json")),
            format!("ai-changes/{id}.json"),
        ));
    }
    let ocr = api.handwritten_ocr_catalog(project)?;
    for item in ocr["items"]
        .as_array()
        .ok_or("Catálogo OCR no compatible")?
    {
        let id = item["attemptId"]
            .as_str()
            .filter(|s| s.starts_with("handwritten-ocr-") && request_scope::portable_id(s))
            .ok_or("Intento OCR no identificado")?;
        sources.push((
            api.app_data_dir
                .join("handwritten-ocr")
                .join(format!("{id}.json")),
            format!("handwritten-ocr/{id}.json"),
        ));
    }
    let mut files = vec![];
    let mut mapping = vec![];
    for (index, (path, name)) in sources.into_iter().enumerate() {
        let relative = path
            .strip_prefix(&api.app_data_dir)
            .map_err(|_| "Copia editorial fuera de ámbito")?
            .to_string_lossy()
            .replace('\\', "/");
        let bytes = b.read(&api.app_data_dir, &relative, MAX_FILE)?;
        let target = format!("Edicion/{index:04}.bin");
        b.put(&target, &bytes)?;
        let destination = b.relative(&target);
        mapping.push(json!({"source":name,"path":destination,"sha256":sha256_hex(&bytes)}));
        files.push(destination);
    }
    if !files.is_empty() {
        let path = "Edicion/LEEME.json";
        b.json(path,&json!({"schemaVersion":1,"dataOnly":true,"runtimeAdoption":false,"files":mapping,"note":"Copias de procedencia y recuperación. No se activan como operaciones, permisos ni recibos del receptor."}))?;
        files.push(b.relative(path));
        for chunk in files.chunks(512) {
            b.items.push(json!({"kind":"personal-data","files":chunk,"active":false,"runtimeAdoption":false}));
        }
    }
    Ok(())
}
