//! Explicit bounded attachment snapshots. Only explicitly named document formats, never profile state.
use super::*;
use base64::Engine;
pub(super) const MAX_ATTACHMENT: u64 = 1024 * 1024;
pub(super) const MAX_ATTACHMENTS: usize = 8;
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Attachment {
    pub path: String,
    pub name: String,
    pub mime_type: String,
    pub sha256: String,
    pub byte_length: u64,
    pub data_base64: String,
}
fn kind(name: &str) -> Result<&'static str, String> {
    let stem = name.split('.').next().unwrap_or("").to_ascii_lowercase();
    if name.is_empty()
        || name.len() > 160
        || name != name.trim()
        || name.ends_with('.')
        || name.contains(['/', '\\', ':', '<', '>', '"', '|', '?', '*'])
        || name.chars().any(char::is_control)
        || [
            "con", "prn", "aux", "nul", "com1", "com2", "com3", "com4", "com5", "com6", "com7",
            "com8", "com9", "lpt1", "lpt2", "lpt3", "lpt4", "lpt5", "lpt6", "lpt7", "lpt8", "lpt9",
        ]
        .contains(&stem.as_str())
    {
        return Err("Nombre de adjunto no portable; no se copia".into());
    }
    match name.rsplit('.').next().unwrap_or("").to_ascii_lowercase().as_str(){"pdf"=>Ok("application/pdf"),"docx"=>Ok("application/vnd.openxmlformats-officedocument.wordprocessingml.document"),"xlsx"=>Ok("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),"txt"=>Ok("text/plain"),"csv"=>Ok("text/csv"),_=>Err("Adjunto local no admitido. Se conservan PDF, DOCX, XLSX, TXT y CSV explícitos; no configuración, ejecutables ni archivos implícitos".into())}
}
fn contents(name: &str, bytes: &[u8]) -> Result<(), String> {
    match name
        .rsplit('.')
        .next()
        .unwrap_or("")
        .to_ascii_lowercase()
        .as_str()
    {
        "txt" | "csv" => {
            let value = std::str::from_utf8(bytes)
                .map_err(|_| "El adjunto de texto necesita UTF-8 válido")?;
            if value.contains('\0') {
                return Err("El adjunto contiene datos binarios incompatibles con texto".into());
            }
        }
        "pdf" => {
            if !bytes.starts_with(b"%PDF-") {
                return Err("El adjunto PDF no tiene cabecera compatible".into());
            }
        }
        "docx" | "xlsx" => {
            let mut archive = zip::ZipArchive::new(std::io::Cursor::new(bytes))
                .map_err(|_| "El adjunto Office no tiene un contenedor válido")?;
            if archive.len() > 10000 {
                return Err("El contenedor Office supera10000entradas".into());
            }
            let required = if name.to_ascii_lowercase().ends_with(".docx") {
                "word/document.xml"
            } else {
                "xl/workbook.xml"
            };
            archive
                .by_name(required)
                .map_err(|_| "El adjunto no contiene el documento Office esperado")?;
            let mut total = 0u64;
            for index in 0..archive.len() {
                let file = archive
                    .by_index(index)
                    .map_err(|_| "No se puede revisar el contenedor Office")?;
                total = total
                    .checked_add(file.size())
                    .ok_or("Tamaño Office no representable")?;
                if total > 64 * 1024 * 1024
                    || file.name().to_ascii_lowercase().ends_with("vbaproject.bin")
                {
                    return Err(
                        "Adjunto Office fuera de límites o con macros; se conserva sin copiar"
                            .into(),
                    );
                }
            }
        }
        _ => return Err("Tipo de adjunto no admitido".into()),
    }
    Ok(())
}
fn encoded_segment(value: &str) -> String {
    let mut output = String::new();
    for byte in value.as_bytes() {
        if byte.is_ascii_alphanumeric() || matches!(*byte, b'-' | b'_' | b'.' | b'~') {
            output.push(*byte as char);
        } else {
            output.push_str(&format!("%{byte:02X}"));
        }
    }
    output
}
fn token(sha: &str, name: &str) -> String {
    format!("knownext-template-resource:{sha}/{}", encoded_segment(name))
}
fn target_parts(value: &str) -> (&str, &str) {
    let end = value.find(['?', '#']).unwrap_or(value.len());
    value.split_at(end)
}
fn validate_suffix(suffix: &str) -> Result<(), String> {
    if suffix.len() > 4096
        || suffix
            .chars()
            .any(|c| c.is_control() || c.is_whitespace() || matches!(c, '<' | '>' | '"' | '\\'))
    {
        return Err(
            "El fragmento o consulta del adjunto no es una URL válida; se conserva sin alterar"
                .into(),
        );
    }
    let bytes = suffix.as_bytes();
    let mut at = 0;
    while at < bytes.len() {
        if bytes[at] == b'%' {
            if at + 2 >= bytes.len()
                || !bytes[at + 1].is_ascii_hexdigit()
                || !bytes[at + 2].is_ascii_hexdigit()
            {
                return Err("La consulta del adjunto contiene una codificación incompleta; se conserva el original".into());
            }
            at += 3;
        } else {
            at += 1;
        }
    }
    Ok(())
}
pub(super) fn matches_target(resource: &Attachment, target: &str) -> Result<bool, String> {
    let (base, suffix) = target_parts(target);
    if base != resource.path {
        return Ok(false);
    }
    validate_suffix(suffix)?;
    Ok(true)
}
pub(super) fn summary(r: &Attachment) -> Value {
    json!({"path":r.path,"name":r.name,"mimeType":r.mime_type,"sha256":r.sha256,"bytes":r.byte_length})
}
pub(super) fn validate(resources: &[Attachment], markdown: &str) -> Result<(), String> {
    if resources.len() > MAX_ATTACHMENTS {
        return Err("Una plantilla admite hasta8adjuntos de1MiB".into());
    }
    let mut paths = BTreeSet::new();
    let mut total = 0u64;
    for r in resources {
        if r.byte_length > MAX_ATTACHMENT
            || r.byte_length == 0
            || r.data_base64.len() > ((MAX_ATTACHMENT + 2) / 3 * 4) as usize
            || r.path != token(&r.sha256, &r.name)
            || !paths.insert(&r.path)
            || r.mime_type != kind(&r.name)?
        {
            return Err("Manifestación de adjunto incoherente o fuera de límites".into());
        }
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(&r.data_base64)
            .map_err(|_| "Adjunto ilegible")?;
        if bytes.len() as u64 != r.byte_length || sha256_hex(&bytes) != r.sha256 {
            return Err("La huella o el tamaño del adjunto no coincide".into());
        }
        contents(&r.name, &bytes)?;
        total += r.byte_length;
    }
    if total > 8 * MAX_ATTACHMENT {
        return Err("Los adjuntos superan8MiB".into());
    }
    let destinations = knownext_docs::markdown_destinations(markdown);
    for r in resources {
        let mut linked = false;
        for destination in &destinations {
            if !destination.is_image && matches_target(r, &destination.target)? {
                linked = true;
            }
        }
        if !linked {
            return Err(
                "El inventario contiene un adjunto sin enlace explícito en el documento".into(),
            );
        }
    }
    Ok(())
}
fn source_bytes(root: &Path, path: &Path) -> Result<Vec<u8>, String> {
    let mut ancestor = path;
    while ancestor != root {
        let meta = fs::symlink_metadata(ancestor)
            .map_err(|_| "Un adjunto local o su carpeta no está disponible")?;
        if batch::linked(&meta) {
            return Err("No se siguen enlaces al capturar adjuntos".into());
        }
        ancestor = ancestor.parent().ok_or("Adjunto fuera del proyecto")?;
    }
    let meta = fs::symlink_metadata(path).map_err(|_| "Adjunto no disponible")?;
    if !meta.is_file() || meta.len() > MAX_ATTACHMENT || meta.len() == 0 {
        return Err("Cada adjunto debe ser un archivo regular de1byte a1MiB".into());
    }
    let mut bytes = vec![];
    fs::File::open(path)
        .map_err(|_| "No se puede abrir el adjunto")?
        .take(MAX_ATTACHMENT + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| "No se puede leer el adjunto")?;
    if bytes.len() as u64 != meta.len() {
        return Err("El adjunto cambió durante la lectura".into());
    }
    Ok(bytes)
}
pub(super) fn capture(
    api: &LocalApi,
    project: &str,
    document: &str,
    markdown: &str,
) -> Result<(String, Vec<Attachment>), String> {
    let root = api.project_root(project)?;
    let mut resources = BTreeMap::<String, Attachment>::new();
    let mut replacements = vec![];
    for destination in knownext_docs::markdown_destinations(markdown) {
        if destination.is_image {
            continue;
        }
        let target = destination.target.trim();
        let lower = target.to_ascii_lowercase();
        if target.starts_with('#')
            || lower.starts_with("https://")
            || lower.starts_with("http://")
            || lower.starts_with("mailto:")
            || lower.starts_with("data:image/")
            || placeholders(target)
                .iter()
                .any(|(a, b, _)| *a == 0 && *b == target.len())
        {
            continue;
        }
        let (base, suffix) = target_parts(target);
        validate_suffix(suffix)?;
        let relative = resolve_markdown_asset_target(document, base)
            .ok_or("Un enlace local no tiene una ruta válida dentro del proyecto")?;
        let path = api.resolve_project_relative(project, &relative)?;
        let name = path
            .file_name()
            .and_then(|s| s.to_str())
            .ok_or("Nombre de adjunto no compatible")?;
        let mime = kind(name)?;
        let bytes = source_bytes(&root, &path)?;
        contents(name, &bytes)?;
        let sha = sha256_hex(&bytes);
        let key = token(&sha, name);
        if !resources.contains_key(&key) {
            if resources.len() >= MAX_ATTACHMENTS {
                return Err("La preparación admite hasta8adjuntos locales".into());
            }
            if api.project_root(project)? != root
                || api.resolve_project_relative(project, &relative)? != path
                || source_bytes(&root, &path)? != bytes
            {
                return Err("Un adjunto o su ubicación cambió; revisa de nuevo".into());
            }
            resources.insert(
                key.clone(),
                Attachment {
                    path: key.clone(),
                    name: name.into(),
                    mime_type: mime.into(),
                    sha256: sha,
                    byte_length: bytes.len() as u64,
                    data_base64: base64::engine::general_purpose::STANDARD.encode(bytes),
                },
            );
        }
        replacements.push((destination.range, format!("{key}{suffix}")));
    }
    let mut rendered = markdown.to_owned();
    for (range, target) in replacements.into_iter().rev() {
        rendered.replace_range(range, &target);
    }
    let values = resources.into_values().collect::<Vec<_>>();
    validate(&values, &rendered)?;
    Ok((rendered, values))
}
fn relative(r: &Attachment) -> String {
    format!(
        "_template-resources/{}/{}",
        r.sha256,
        encoded_segment(&r.name)
    )
}
pub(super) fn render_links(markdown: &str, resources: &[Attachment]) -> Result<String, String> {
    let mut value = markdown.to_owned();
    let mut replacements = vec![];
    for d in knownext_docs::markdown_destinations(markdown) {
        if d.is_image {
            continue;
        }
        let (base, suffix) = target_parts(&d.target);
        if let Some(r) = resources.iter().find(|r| r.path == base) {
            validate_suffix(suffix)?;
            replacements.push((d.range, format!("{}{suffix}", relative(r))));
        }
    }
    for (range, target) in replacements.into_iter().rev() {
        value.replace_range(range, &target);
    }
    Ok(value)
}
fn directories(root: &Path, relative: &Path, create: bool) -> Result<(), String> {
    let mut current = root.to_path_buf();
    for component in relative.components() {
        let std::path::Component::Normal(name) = component else {
            return Err("Destino de adjunto no relativo".into());
        };
        current.push(name);
        match fs::symlink_metadata(&current) {
            Ok(m) if m.is_dir() && !batch::linked(&m) => (),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                if create {
                    fs::create_dir(&current)
                        .map_err(|_| "No se puede preparar la carpeta de adjuntos")?;
                }
            }
            _ => return Err("Carpeta de adjuntos ocupada o enlazada; se conserva".into()),
        }
    }
    Ok(())
}
pub(super) fn publish(
    api: &LocalApi,
    project: &str,
    parent: Option<&str>,
    name: &str,
    resources: &[Attachment],
) -> Result<(), String> {
    if resources.is_empty() {
        return Ok(());
    }
    let root = api.project_root(project)?;
    let folder = api.node_relative(project, parent)?.unwrap_or_default();
    let document = api.resolve_project_relative(project, &join_relative(Some(&folder), name))?;
    if fs::symlink_metadata(&document).is_ok() {
        return Err(
            "El documento de destino ya existe; no se copian adjuntos ni se sobrescribe".into(),
        );
    }
    let mut plans = vec![];
    for r in resources {
        let raw_relative = format!("_template-resources/{}/{}", r.sha256, r.name);
        let relative = join_relative(Some(&folder), &raw_relative);
        let path = api.resolve_project_relative(project, &relative)?;
        let parent = path.parent().ok_or("Destino de adjunto inválido")?;
        directories(
            &root,
            parent
                .strip_prefix(&root)
                .map_err(|_| "Adjunto fuera del proyecto")?,
            false,
        )?;
        match fs::symlink_metadata(&path) {
            Ok(m) if m.is_file() && !batch::linked(&m) => {
                if source_bytes(&root, &path)?
                    != base64::engine::general_purpose::STANDARD
                        .decode(&r.data_base64)
                        .map_err(|_| "Copia no compatible")?
                {
                    return Err(
                        "Un destino de adjunto pertenece a otro contenido; se conserva".into(),
                    );
                }
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => (),
            _ => return Err("Destino de adjunto no regular; se conserva".into()),
        }
        plans.push((path, r));
    }
    for (path, r) in plans {
        let parent = path.parent().ok_or("Destino de adjunto inválido")?;
        directories(
            &root,
            parent
                .strip_prefix(&root)
                .map_err(|_| "Adjunto fuera del proyecto")?,
            true,
        )?;
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(&r.data_base64)
            .map_err(|_| "Copia no compatible")?;
        match fs::symlink_metadata(&path){Err(e)if e.kind()==std::io::ErrorKind::NotFound=>atomic_io::create(&path,&bytes).map_err(|_|"La copia de adjuntos quedó parcial o sin confirmar; conserva sus archivos y revisa antes de repetir")?,Ok(m)if m.is_file()&&!batch::linked(&m)&&source_bytes(&root,&path)?==bytes=>(),_=>return Err("El destino cambió durante la copia; se conservan los adjuntos ya publicados".into())}
    }
    Ok(())
}
