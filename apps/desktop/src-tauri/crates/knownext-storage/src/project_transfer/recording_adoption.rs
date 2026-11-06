//! Review portable audio as inert data; native publication is supplied by the recording service.
use super::*;
use knownext_core::recording_portability::{PortableRecording, PortableRecordingOrigin};
use std::{fs, io::Read};
const DIRECTORY: &str = "Archivo KnowNext";
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Parts {
    bytes: u64,
    sha256: String,
    parts: Vec<Part>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Part {
    path: String,
    payload_bytes: u64,
    skip_bytes: u8,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Track {
    source: String,
    audio: Parts,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Entry {
    kind: String,
    original: String,
    transcript: String,
    tracks: Vec<Track>,
    sample_rate: u32,
    channels: u8,
    bits_per_sample: u8,
    active: bool,
    audio_deleted_at_source: bool,
}
struct Catalog {
    root: PathBuf,
    revision: String,
    items: Vec<(String, Entry)>,
    unavailable: usize,
    limited: bool,
}
struct Reviewed {
    catalog: Catalog,
    entry_id: String,
    revision: String,
    input: PortableRecording,
    state: &'static str,
    parts: usize,
    source_created_at: Option<String>,
}
fn hash(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(|b| b.is_ascii_hexdigit())
}
fn path(value: &str, suffix: &str) -> Result<(), String> {
    paths::validate(value)?;
    if !value.ends_with(suffix)
        || value.split('/').any(|part| {
            matches!(
                part.to_ascii_lowercase().as_str(),
                "owner.lock" | "runtime-owner.lock" | "capture.lock"
            )
        })
    {
        return Err("Ruta de audio portable no compatible".into());
    }
    Ok(())
}
fn read(root: &Path, relative: &str, maximum: u64) -> Result<Vec<u8>, String> {
    let source = path_policy::resolve(root, &format!("{DIRECTORY}/{relative}"))?;
    let meta = fs::symlink_metadata(&source)
        .map_err(|_| "Falta una parte del audio portable; el original se conserva")?;
    if !meta.is_file() || batch::linked(&meta) || meta.len() > maximum {
        return Err("Parte de audio no regular o fuera de límites".into());
    }
    let mut raw = vec![];
    fs::File::open(source)
        .map_err(|_| "No se puede abrir el audio portable")?
        .take(maximum + 1)
        .read_to_end(&mut raw)
        .map_err(|_| "No se completó la lectura de audio")?;
    if raw.len() as u64 != meta.len() || raw.len() as u64 > maximum {
        return Err("El audio cambió durante la lectura; vuelve a revisar".into());
    }
    Ok(raw)
}
fn catalog(api: &LocalApi, project: &str) -> Result<Catalog, String> {
    let root = api
        .project_root(project)?
        .canonicalize()
        .map_err(|_| "La ubicación del proyecto no está disponible")?;
    let raw = read(&root, "Inventario.json", MAX_MANIFEST)?;
    let inventory = archive_index::parse(&raw)?;
    let revision = sha256_hex(
        &serde_json::to_vec(&json!([project, root, sha256_hex(&raw)]))
            .map_err(|_| "Ámbito de audio no representable")?,
    );
    let mut items = vec![];
    let mut unavailable = 0;
    let mut limited = false;
    let mut seen = BTreeSet::new();
    for value in inventory
        .items
        .into_iter()
        .filter(|item| item["kind"] == "recording")
    {
        let parsed = (|| -> Result<(String, Entry), String> {
            let item: Entry = serde_json::from_value(value)
                .map_err(|_| "Entrada de audio futura o incompatible")?;
            path(&item.original, "/Original.json")?;
            path(&item.transcript, "/Transcripcion.md")?;
            if item.kind != "recording"
                || item.active
                || item.sample_rate != 24000
                || item.channels != 1
                || item.bits_per_sample != 16
                || item.tracks.len() > 2
                || item.audio_deleted_at_source && !item.tracks.is_empty()
            {
                return Err("El audio no confirma datos detenidos y compatibles".into());
            }
            let id = sha256_hex(
                &serde_json::to_vec(&json!([project, root, item]))
                    .map_err(|_| "Entrada no representable")?,
            );
            Ok((id, item))
        })();
        match parsed {
            Ok(value) if seen.insert(value.0.clone()) => {
                if items.len() >= 2000 {
                    limited = true;
                    break;
                }
                items.push(value);
            }
            _ => {
                unavailable += 1;
                limited = true;
            }
        }
    }
    items.sort_by(|a, b| a.1.original.cmp(&b.1.original));
    Ok(Catalog {
        root,
        revision,
        items,
        unavailable,
        limited,
    })
}
fn pcm(
    root: &Path,
    parts: &Parts,
    seen: &mut std::collections::HashSet<unicase::UniCase<String>>,
    total: &mut u64,
) -> Result<Vec<u8>, String> {
    if parts.bytes == 0
        || parts.bytes > 128 * 1024 * 1024
        || parts.bytes % 2 != 0
        || !hash(&parts.sha256)
        || parts.parts.is_empty()
        || parts.parts.len() > 1000
    {
        return Err("Partes de audio fuera de límites".into());
    }
    let mut output = vec![];
    let mut digest = Sha256::new();
    for part in &parts.parts {
        path(&part.path, ".wav")?;
        if !seen.insert(portable_paths::key(&part.path))
            || part.skip_bytes != 44
            || part.payload_bytes == 0
            || part.payload_bytes % 2 != 0
            || part.payload_bytes > 16 * 1024 * 1024
        {
            return Err("Orden o tamaño de partes de audio no compatible".into());
        }
        *total = total
            .checked_add(part.payload_bytes)
            .filter(|n| *n <= 128 * 1024 * 1024)
            .ok_or("El audio supera 128 MiB")?;
        let raw = read(root, &part.path, MAX_FILE)?;
        if raw.len() as u64 != part.payload_bytes + 44
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
            || raw[4..8] != (part.payload_bytes as u32 + 36).to_le_bytes()
        {
            return Err("La parte WAV no conserva el PCM revisable".into());
        }
        digest.update(&raw[44..]);
        output.extend_from_slice(&raw[44..]);
        if output.len() as u64 > parts.bytes {
            return Err("Las partes exceden el tamaño declarado".into());
        }
    }
    if output.len() as u64 != parts.bytes
        || format!("{:x}", digest.finalize()) != parts.sha256.to_ascii_lowercase()
    {
        return Err("El audio no coincide con su huella; no se copia parcialmente".into());
    }
    Ok(output)
}
fn recording_root(api: &LocalApi) -> PathBuf {
    api.app_data_dir.join(if cfg!(debug_assertions) {
        "recordings-dev"
    } else {
        "recordings"
    })
}
fn state(api: &LocalApi, id: &str) -> &'static str {
    let root = recording_root(api);
    match fs::symlink_metadata(&root) {
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return "absent",
        Ok(meta) if meta.is_dir() && !batch::linked(&meta) => (),
        _ => return "unavailable",
    }
    match fs::symlink_metadata(root.join(id)) {
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => "absent",
        Ok(_) => "occupied",
        Err(_) => "unavailable",
    }
}
fn review(
    api: &LocalApi,
    project: &str,
    id: &str,
    expected: Option<&str>,
) -> Result<Reviewed, String> {
    let catalog = catalog(api, project)?;
    if expected.is_some_and(|revision| revision != catalog.revision) {
        return Err("El archivo cambió. Actualiza la lista antes de revisar".into());
    }
    let entry = catalog
        .items
        .iter()
        .find(|item| item.0 == id)
        .map(|item| item.1.clone())
        .ok_or("La grabación no pertenece al catálogo revisado")?;
    let original = read(&catalog.root, &entry.original, 4 * 1024 * 1024)?;
    let source: Value =
        serde_json::from_slice(&original).map_err(|_| "Original de sesión no compatible")?;
    if source
        .get("schemaVersion")
        .is_some_and(|version| version != 1)
        || !matches!(
            source["status"].as_str(),
            Some("pendingDestination" | "ready" | "queued" | "attention" | "completed")
        )
        || source["chunks"].as_array().is_none_or(|chunks| {
            chunks.len() > 10000 || chunks.iter().any(|chunk| chunk["status"] == "sending")
        })
    {
        return Err(
            "La sesión original no confirma audio detenido; se conserva sin activar".into(),
        );
    }
    let source_created_at = source["createdAt"]
        .as_str()
        .filter(|value| OffsetDateTime::parse(value, &Rfc3339).is_ok())
        .map(str::to_owned);
    let name = source["destination"]["name"]
        .as_str()
        .filter(|name| {
            !name.trim().is_empty() && name.len() <= 220 && !name.chars().any(char::is_control)
        })
        .unwrap_or("Grabación portable")
        .to_owned();
    let mut microphone = None;
    let mut system = None;
    let mut seen = std::collections::HashSet::new();
    let mut total = 0;
    let mut parts = 0;
    for track in &entry.tracks {
        let output = pcm(&catalog.root, &track.audio, &mut seen, &mut total)?;
        parts += track.audio.parts.len();
        match track.source.as_str() {
            "microphone.pcm" if microphone.is_none() => microphone = Some(output),
            "system.pcm" if system.is_none() => system = Some(output),
            _ => return Err("Pista repetida o desconocida; no se prepara audio parcial".into()),
        }
    }
    if total == 0 {
        return Err(
            "El archivo conserva la sesión o su texto, pero no tiene audio recuperable".into(),
        );
    }
    let source_sha256 = sha256_hex(&original);
    let microphone_sha256 = microphone.as_ref().map(|raw| sha256_hex(raw));
    let system_sha256 = system.as_ref().map(|raw| sha256_hex(raw));
    let identity = sha256_hex(
        &serde_json::to_vec(&json!([
            project,
            catalog.root,
            entry.original,
            source_sha256,
            microphone_sha256,
            system_sha256
        ]))
        .map_err(|_| "Identidad de audio no representable")?,
    );
    let session_id = format!(
        "{}-{}-5{}-8{}-{}",
        &identity[..8],
        &identity[8..12],
        &identity[13..16],
        &identity[17..20],
        &identity[20..32]
    );
    let origin = PortableRecordingOrigin {
        schema_version: 1,
        identity,
        project_id: project.into(),
        source_sha256,
        microphone_sha256,
        system_sha256,
    };
    let native_state = state(api, &session_id);
    let revision = sha256_hex(
        &serde_json::to_vec(&json!([catalog.revision, id, origin, native_state]))
            .map_err(|_| "Revisión no representable")?,
    );
    let input = PortableRecording {
        id: session_id,
        origin,
        name,
        microphone,
        system,
    };
    Ok(Reviewed {
        catalog,
        entry_id: id.into(),
        revision,
        input,
        state: native_state,
        parts,
        source_created_at,
    })
}
fn public(project: &str, value: &Reviewed) -> Value {
    let bytes = value.input.microphone.as_ref().map_or(0, Vec::len)
        + value.input.system.as_ref().map_or(0, Vec::len);
    let samples = value
        .input
        .microphone
        .as_ref()
        .map_or(0, Vec::len)
        .max(value.input.system.as_ref().map_or(0, Vec::len))
        / 2;
    json!({"schemaVersion":1,"projectId":project,"entryId":value.entry_id,"catalogRevision":value.catalog.revision,"revision":value.revision,"checkedAt":knownext_core::now_iso(),"name":value.input.name,"sourceCreatedAt":value.source_created_at,"sourceSha256":value.input.origin.source_sha256,"sessionId":value.input.id,"seconds":samples as f64/24000.0,"bytes":bytes,"parts":value.parts,"microphone":value.input.microphone.is_some(),"systemAudio":value.input.system.is_some(),"nativeState":value.state,"canImport":value.state=="absent","importSupported":true,"preservesSource":true,"startsAi":false,"retained":true})
}
impl LocalApi {
    pub(crate) fn portable_recording_catalog(&self, project: &str) -> Result<Value, String> {
        let value = catalog(self, project)?;
        Ok(
            json!({"schemaVersion":1,"projectId":project,"revision":value.revision,"checkedAt":knownext_core::now_iso(),"items":value.items.iter().enumerate().map(|(index,(id,item))|json!({"id":id,"label":format!("Grabación {}",index+1),"source":item.original,"hasAudio":!item.tracks.is_empty()})).collect::<Vec<_>>(),"unavailable":value.unavailable,"limited":value.limited,"scope":"portable-recordings-only"}),
        )
    }
    pub(crate) fn review_portable_recording(
        &self,
        project: &str,
        id: &str,
        body: Value,
    ) -> Result<Value, String> {
        #[derive(Deserialize)]
        #[serde(rename_all = "camelCase", deny_unknown_fields)]
        struct Input {
            catalog_revision: String,
        }
        let input: Input = serde_json::from_value(body)
            .map_err(|_| "Actualiza la lista de grabaciones antes de revisar")?;
        Ok(public(
            project,
            &review(self, project, id, Some(&input.catalog_revision))?,
        ))
    }
    pub fn import_portable_recording<T>(
        &self,
        project: &str,
        id: &str,
        revision: &str,
        work: impl FnOnce(PortableRecording) -> Result<T, String>,
    ) -> Result<T, String> {
        let _transaction = self.project_transaction(project)?;
        let value = review(self, project, id, None)?;
        if value.revision != revision || value.state != "absent" {
            return Err("El audio, la ubicación o el destino cambiaron. Revisa otra vez; no se repite la copia".into());
        }
        let bytes = value.input.microphone.as_ref().map_or(0, Vec::len)
            + value.input.system.as_ref().map_or(0, Vec::len);
        let _budget = recovery_inventory::admit(self, bytes as u64 + 16384)?;
        // Re-read under project and budget authority before publishing; PCM never crosses the UI bridge.
        let expected_revision = value.revision.clone();
        drop(value);
        let current = review(self, project, id, None)?;
        if current.revision != expected_revision {
            return Err("Las fuentes cambiaron antes de copiar. Revisa de nuevo".into());
        }
        work(current.input)
    }
}
