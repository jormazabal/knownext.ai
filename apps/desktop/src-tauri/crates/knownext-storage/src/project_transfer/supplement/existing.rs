//! Preserve an earlier private archive, including its original metadata, before adding current data.
use super::*;
type References = std::collections::HashSet<unicase::UniCase<String>>;
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Parts {
    bytes: u64,
    sha256: String,
    parts: Vec<Part>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Part {
    path: String,
    payload_bytes: u64,
    skip_bytes: u8,
}
#[derive(Default)]
pub(super) struct Previous {
    pub files: usize,
    pub drafts: usize,
    pub recordings: usize,
    pub history: bool,
    pub metadata: Vec<Value>,
}
fn source(root: &Path, path: &str, builder: &mut Builder<'_>) -> Result<Vec<u8>, String> {
    paths::validate(path)?;
    builder.read(root, &format!("{DIRECTORY}/{path}"), MAX_FILE)
}
fn hash_matches(bytes: &[u8], expected: &str) -> bool {
    expected.len() == 64
        && expected.bytes().all(|b| b.is_ascii_hexdigit())
        && sha256_hex(bytes) == expected.to_ascii_lowercase()
}
fn string<'a>(item: &'a Value, key: &str) -> Result<&'a str, String> {
    item[key].as_str().ok_or_else(|| {
        format!("El archivo anterior no declara {key}; se conserva sin entregar una copia parcial")
    })
}
fn parts(
    root: &Path,
    value: &Value,
    wav: bool,
    builder: &mut Builder<'_>,
    references: &mut References,
) -> Result<(), String> {
    let value: Parts = serde_json::from_value(value.clone())
        .map_err(|_| "Partes del archivo anterior no compatibles")?;
    if value.bytes > MAX_CONTENT || value.parts.len() > MAX_ENTRIES || !wav && value.bytes == 0 {
        return Err("Partes del archivo anterior fuera de límites".into());
    }
    let mut digest = Sha256::new();
    let mut total = 0u64;
    for part in value.parts {
        paths::validate(&part.path)?;
        if !references.insert(paths::key(&part.path))
            || part.skip_bytes != if wav { 44 } else { 0 }
            || part.payload_bytes == 0
        {
            return Err("Orden o representación de partes no compatible".into());
        }
        let raw = source(root, &part.path, builder)?;
        if raw.len() as u64 != part.payload_bytes + part.skip_bytes as u64 {
            return Err("Una parte anterior cambió de tamaño".into());
        }
        if wav
            && (part.payload_bytes % 2 != 0
                || raw.len() < 44
                || &raw[..4] != b"RIFF"
                || &raw[8..16] != b"WAVEfmt "
                || raw[16..20] != 16u32.to_le_bytes()
                || raw[20..22] != 1u16.to_le_bytes()
                || raw[22..24] != 1u16.to_le_bytes()
                || raw[24..28] != 24000u32.to_le_bytes()
                || raw[28..32] != 48000u32.to_le_bytes()
                || raw[32..34] != 2u16.to_le_bytes()
                || raw[34..36] != 16u16.to_le_bytes()
                || &raw[36..40] != b"data"
                || raw[40..44] != (part.payload_bytes as u32).to_le_bytes()
                || raw[4..8] != (part.payload_bytes as u32 + 36).to_le_bytes())
        {
            return Err("Una parte WAV anterior no conserva el PCM esperado".into());
        }
        total = total
            .checked_add(part.payload_bytes)
            .filter(|v| *v <= MAX_CONTENT)
            .ok_or("Partes anteriores fuera de presupuesto")?;
        digest.update(&raw[part.skip_bytes as usize..]);
    }
    if total != value.bytes
        || value.sha256.len() != 64
        || format!("{:x}", digest.finalize()) != value.sha256.to_ascii_lowercase()
    {
        return Err("La huella del audio o historial anterior no coincide; no se entrega un archivo parcial".into());
    }
    Ok(())
}
pub(super) fn append(root: &Path, builder: &mut Builder<'_>) -> Result<Previous, String> {
    let folder = root.join(DIRECTORY);
    match fs::symlink_metadata(&folder) {
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok(Previous::default())
        }
        Err(_) => return Err("No se puede revisar el archivo privado anterior".into()),
        Ok(_) => jobs::regular_directory(&folder)?,
    }
    let raw = source(root, "Inventario.json", builder)?;
    if raw.len() as u64 > MAX_MANIFEST {
        return Err("El inventario anterior supera8MiB".into());
    }
    let mut inventory = crate::project_transfer::archive_index::parse(&raw)?;
    let generation = format!("Anteriores/{}", &sha256_hex(&raw)[..24]);
    let mut previous = Previous::default();
    let mut snapshots = References::new();
    for snapshot in &inventory.metadata_snapshots {
        paths::validate(&snapshot.path)?;
        if !snapshots.insert(paths::key(&snapshot.path)) {
            return Err("El inventario anterior repite un metadato original".into());
        }
        let raw = source(root, &snapshot.path, builder)?;
        if !snapshot.path.starts_with("Anteriores/")
            || !matches!(
                snapshot.name.as_str(),
                "Inventario.json" | "Preferencias.json" | "LEEME.md"
            )
            || raw.len() as u64 != snapshot.bytes
            || !hash_matches(&raw, &snapshot.sha256)
        {
            return Err("Un metadato original anterior no coincide".into());
        }
    }
    let mut references = References::new();
    for item in &mut inventory.items {
        if item["active"] != false {
            return Err("El archivo anterior no confirma datos sin ejecución".into());
        }
        let fields: &[&str] = match item["kind"].as_str() {
            Some("draft") => &["original", "editable"],
            Some("recording") => &["original", "transcript"],
            Some("preferences"|"workspace") => &["path"],
            Some("personal-data") => &[],
            _ => &[],
        };
        for field in fields {
            let path = string(item, field)?;
            paths::validate(path)?;
            if !references.insert(paths::key(path)) {
                return Err(
                    "El inventario anterior repite un payload o lo atribuye a varias copias".into(),
                );
            }
        }
        match item["kind"].as_str() {
            Some("draft") => {
                let raw = source(root, string(item, "original")?, builder)?;
                if !hash_matches(&raw, string(item, "sha256")?) {
                    return Err("Un borrador anterior no coincide con su huella".into());
                }
                source(root, string(item, "editable")?, builder)?;
                previous.drafts += 1;
            }
            Some("recording") => {
                source(root, string(item, "original")?, builder)?;
                source(root, string(item, "transcript")?, builder)?;
                if item["sampleRate"] != 24000
                    || item["channels"] != 1
                    || item["bitsPerSample"] != 16
                {
                    return Err("Formato de audio anterior no compatible".into());
                }
                let tracks = item["tracks"]
                    .as_array()
                    .filter(|v| v.len() <= 2)
                    .ok_or("Pistas anteriores no compatibles")?;
                for track in tracks {
                    parts(root, &track["audio"], true, builder, &mut references)?;
                }
                previous.recordings += 1;
            }
            Some("history") => {
                parts(root, &item["bundle"], false, builder, &mut references)?;
                previous.history = true;
            }
            Some("workspace")=>{source(root,string(item,"path")?,builder)?;},
            Some("personal-data")=>{let files=item["files"].as_array().filter(|a|a.len()<=512).ok_or("Inventario de datos privados no compatible")?;for file in files{let path=file.as_str().ok_or("Ruta de datos privados no válida")?;if !references.insert(paths::key(path)){return Err("Datos privados repetidos".into());}source(root,path,builder)?;}},
            Some("preferences") => {
                let path = string(item, "path")?.to_owned();
                source(root, &path, builder)?;
                if path == "Preferencias.json" {
                    item["path"] = json!(format!("{generation}/Preferencias.json"));
                }
            }
            _ => {
                return Err(
                    "El archivo anterior contiene una familia futura; se conserva sin normalizar"
                        .into(),
                )
            }
        }
    }
    let mut folders = vec![String::new()];
    while let Some(relative) = folders.pop() {
        let path = if relative.is_empty() {
            folder.clone()
        } else {
            folder.join(&relative)
        };
        builder.empty_directory(&relative)?;
        for name in builder.scan(&path)? {
            let relative = if relative.is_empty() {
                name
            } else {
                format!("{relative}/{name}")
            };
            paths::validate(&relative)?;
            let path = path_policy::resolve(root, &format!("{DIRECTORY}/{relative}"))?;
            let meta = fs::symlink_metadata(&path)
                .map_err(|_| "Una entrada anterior no está disponible")?;
            if batch::linked(&meta) {
                return Err(
                    "El archivo anterior contiene un enlace; se conserva sin seguirlo".into(),
                );
            }
            if meta.is_dir() {
                folders.push(relative);
                continue;
            }
            if !meta.is_file()
                || paths::kind(&relative).is_none()
                    && !matches!(relative.rsplit('.').next(), Some("json" | "bin" | "wav"))
            {
                return Err("El archivo anterior contiene un formato no portable; no se entrega parcialmente".into());
            }
            let raw = source(root, &relative, builder)?;
            let destination = if matches!(
                relative.as_str(),
                "Inventario.json" | "Preferencias.json" | "LEEME.md"
            ) {
                let target = format!("{generation}/{relative}");
                previous.metadata.push(json!({"name":relative,"path":target,"sha256":sha256_hex(&raw),"bytes":raw.len()}));
                target
            } else {
                relative
            };
            builder.put(&destination, &raw)?;
            previous.files += 1;
        }
    }
    if !previous
        .metadata
        .iter()
        .any(|entry| entry["name"] == "LEEME.md")
        || !previous
            .metadata
            .iter()
            .any(|entry| entry["name"] == "Preferencias.json")
    {
        return Err("Faltan metadatos del archivo anterior; no se entrega parcialmente".into());
    }
    for metadata in inventory.metadata_snapshots {
        previous.metadata.push(
            serde_json::to_value(metadata).map_err(|_| "Metadato anterior no representable")?,
        );
    }
    builder.items.extend(inventory.items);
    Ok(previous)
}
