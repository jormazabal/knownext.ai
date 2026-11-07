use super::*;
use std::{fs, io::{Read,Write}};
pub(super) fn check_copy(
    source: &Path,
    entries: &mut usize,
    bytes: &mut u64,
) -> Result<(), String> {
    fn visit(source:&Path,entries:&mut usize,bytes:&mut u64,depth:usize,started:std::time::Instant)->Result<(),String>{
    if depth>fingerprint::MAX_DEPTH||started.elapsed()>fingerprint::MAX_TIME{return Err("La revisión de copia supera profundidad o tiempo; reduce la selección. Los originales se conservan".into());}
    *entries += 1;
    let meta =
        fs::symlink_metadata(source).map_err(|_| "No se puede revisar la fuente de copia")?;
    if *entries > 10_000 || linked(&meta) {
        return Err(
            "La selección supera10.000 entradas o contiene enlaces; no se ha iniciado la copia"
                .into(),
        );
    }
    if meta.is_dir() {
        for entry in fs::read_dir(source).map_err(|_| "No se puede revisar una carpeta")? {
            let entry = entry.map_err(|_| "No se puede revisar una entrada")?;
            portable_paths::component(entry.file_name().to_str().ok_or("Nombre no portable")?)?;
            visit(&entry.path(),entries,bytes,depth+1,started)?;
        }
    } else if meta.is_file() {
        *bytes = bytes
            .checked_add(meta.len())
            .ok_or("Selección demasiado grande")?;
        if *bytes > 128 * 1024 * 1024 {
            return Err("La selección supera128MiB; reduce su alcance antes de duplicar".into());
        }
    } else {
        return Err("La selección contiene entradas no regulares".into());
    }
    Ok(())
    }
    visit(source,entries,bytes,0,std::time::Instant::now())
}
pub(super) fn context_paths(
    api: &LocalApi,
    project: &str,
    roots: &[String],
) -> Result<Vec<String>, String> {
    fn visit(
        api: &LocalApi,
        project: &str,
        path: &str,
        out: &mut Vec<String>,
        seen: &mut usize,
        depth:usize,started:std::time::Instant,
    ) -> Result<(), String> {
        if depth>fingerprint::MAX_DEPTH||started.elapsed()>fingerprint::MAX_TIME{return Err("La revisión de contexto supera profundidad o tiempo; reduce la selección".into());}
        *seen += 1;
        if *seen > 10_000 {
            return Err("La selección supera10.000 entradas; reduce su alcance".into());
        }
        let full = api.resolve_project_relative(project, path)?;
        let meta = fs::symlink_metadata(&full)
            .map_err(|_| "Un archivo seleccionado no está disponible")?;
        if linked(&meta) {
            return Err("No se añade contexto desde enlaces".into());
        }
        if meta.is_dir() {
            for entry in
                fs::read_dir(full).map_err(|_| "No se puede leer una carpeta seleccionada")?
            {
                let name = entry
                    .map_err(|_| "No se puede leer un elemento")?
                    .file_name()
                    .to_string_lossy()
                    .into_owned();
                if name.starts_with('.') {
                    continue;
                }
                visit(api, project, &format!("{path}/{name}"), out,seen,depth+1,started)?;
            }
        } else if meta.is_file() {
            out.push(path.into());
            if out.len() > 500 {
                return Err("La selección contiene más de500 archivos; reduce su alcance".into());
            }
        }
        Ok(())
    }
    let mut out = vec![];
    let mut seen = 0;
    let started=std::time::Instant::now();
    for path in roots {
        visit(api,project,path,&mut out,&mut seen,0,started)?;
    }
    out.sort();
    out.dedup();
    if out.is_empty() {
        return Err("La selección no contiene archivos visibles".into());
    }
    Ok(out)
}
pub(super) fn add_context(api: &LocalApi, project: &str, item: &Item) -> Result<Value, String> {
    let path = api.resolve_project_relative(project, &item.path)?;
    let meta = fs::symlink_metadata(&path).map_err(|_| "La fuente no está disponible")?;
    if !meta.is_file() || linked(&meta) || meta.len() > 32 * 1024 * 1024 {
        return Err("Contexto local requiere archivos regulares de hasta32MiB".into());
    }
    if is_handwritten_note_path(&path) {
        document_validation::handwritten_source(&path)?;
    }
    let kind = if is_handwritten_note_path(&path) {
        "handwritten_note"
    } else if is_markdown_path(&path) {
        "project_document"
    } else if matches!(
        path.extension()
            .and_then(|v| v.to_str())
            .unwrap_or("")
            .to_ascii_lowercase()
            .as_str(),
        "png" | "jpg" | "jpeg" | "webp" | "gif"
    ) {
        "image"
    } else {
        "external_file"
    };
    let mut source = api.build_ai_source(project, &item.node_id, kind, &knownext_core::now_iso());
    let text = source["text"].as_str().unwrap_or("");
    if kind != "image" && text.trim().is_empty() {
        return Err(
            "No se obtuvo texto local utilizable. Revisa el archivo u OCR antes de añadirlo".into(),
        );
    }
    if text.chars().count() > 200_000 {
        source["text"] = json!(text.chars().take(200_000).collect::<String>());
        ai_context_origin::bind_current_text(&mut source);
        source["warning"] = json!("Extracto local limitado a200.000 caracteres");
    }
    if fingerprint(&path)? != item.fingerprint {
        return Err("La fuente cambió durante la lectura; vuelve a revisarla".into());
    }
    let mut store = api.context_checked(project)?;
    let sources = store["sources"]
        .as_array_mut()
        .ok_or("Contexto no disponible")?;
    sources.retain(|entry| entry["id"] != item.node_id);
    sources.push(source);
    api.write_json(&api.context_sources_path(project), &store)?;
    api.file_result(project, None, vec![])
}
pub(super) fn duplicate_destination(
    api: &LocalApi,
    project: &str,
    relative: &str,
    reserved: &mut BTreeSet<String>,
) -> Result<String, String> {
    let source = api.resolve_project_relative(project, relative)?;
    let name = source
        .file_name()
        .and_then(|v| v.to_str())
        .ok_or("Nombre no compatible")?;
    let (stem, extension) = if source.is_dir() {
        (name.to_string(), String::new())
    } else {
        (
            source
                .file_stem()
                .and_then(|v| v.to_str())
                .unwrap_or(name)
                .into(),
            source
                .extension()
                .and_then(|v| v.to_str())
                .map(|v| format!(".{v}"))
                .unwrap_or_default(),
        )
    };
    for index in 1..=1000 {
        let name = format!(
            "{stem} copia{}{extension}",
            if index == 1 {
                String::new()
            } else {
                format!(" {index}")
            }
        );
        portable_paths::component(&name)?;
        let dest = relative
            .rsplit_once('/')
            .map(|(parent, _)| format!("{parent}/{name}"))
            .unwrap_or(name);
        if !api.resolve_project_relative(project, &dest)?.exists()
            && reserved.insert(dest.to_lowercase())
        {
            return Ok(dest);
        }
    }
    Err("No se encontró un nombre libre para duplicar".into())
}
pub(super) fn copy(source: &Path, target: &Path) -> Result<(), String> {
    fn visit(
        source: &Path,
        target: &Path,
        entries: &mut usize,
        bytes: &mut u64,
        depth:usize,started:std::time::Instant,buffer:&mut [u8],
    ) -> Result<(), String> {
        if depth>fingerprint::MAX_DEPTH||started.elapsed()>fingerprint::MAX_TIME{return Err("La copia agotó profundidad o tiempo. Los originales se conservan; revisa el destino parcial".into());}
        *entries += 1;
        if *entries > 10_000 {
            return Err("La copia supera10.000 entradas. Los originales se conservan; revisa el destino parcial".into());
        }
        let meta =
            fs::symlink_metadata(source).map_err(|_| "La fuente de la copia no está disponible")?;
        if linked(&meta) {
            return Err("No se duplican enlaces; el original se conserva".into());
        }
        if meta.is_dir() {
            fs::create_dir(target)
                .map_err(|_| "El destino de la copia ya existe o no se puede crear")?;
            for entry in
                fs::read_dir(source).map_err(|_| "No se puede leer una carpeta de origen")?
            {
                let entry = entry.map_err(|_| "No se puede leer un elemento de origen")?;
                let name = entry.file_name();
                portable_paths::component(name.to_str().ok_or("Nombre no portable")?)?;
                visit(&entry.path(),&target.join(name),entries,bytes,depth+1,started,buffer)?;
            }
        } else if meta.is_file() {
            if meta.len() > 128 * 1024 * 1024u64 - *bytes {
                return Err(
                    "La copia supera128MiB. Los originales se conservan; revisa el destino parcial"
                        .into(),
                );
            }
            let mut input = fs::File::open(source).map_err(|_| "No se puede leer el original")?;
            let mut output = fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(target)
                .map_err(|_| "El destino ya existe o no se puede crear; no se reemplaza")?;
            loop {
                if started.elapsed()>fingerprint::MAX_TIME{return Err("La copia agotó el tiempo; los originales se conservan y el destino parcial requiere revisión".into());}
                let n = input
                    .read(buffer)
                    .map_err(|_| "La lectura de la copia se interrumpió")?;
                if n == 0 {
                    break;
                }
                *bytes += n as u64;
                if *bytes > 128 * 1024 * 1024 {
                    return Err("La fuente creció y supera128MiB; revisa la copia parcial".into());
                }
                output
                    .write_all(&buffer[..n])
                    .map_err(|_| "La copia no se completó; el original se conserva")?;
            }
            output
                .sync_all()
                .map_err(|_| "No se pudo confirmar la copia; revisa su destino")?;
        } else {
            return Err("Solo se duplican archivos y carpetas regulares".into());
        }
        Ok(())
    }
    let mut buffer=vec![0u8;65536];
    visit(source,target,&mut 0,&mut 0,0,std::time::Instant::now(),&mut buffer)
}
