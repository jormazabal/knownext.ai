//! Publish a stopped, retained copy. Interrupted/unknown identities are never overlaid.
use super::*;
use knownext_core::recording_portability::PortableRecording;
use std::io::Read;
const MAX_AUDIO: usize = 128 * 1024 * 1024;
fn quota(root: &Path, additional: u64) -> Result<(), String> {
    let started = Instant::now();
    let mut entries = 0usize;
    let mut slots = 0usize;
    let mut bytes = additional;
    let mut pending = vec![root.to_path_buf()];
    while let Some(folder) = pending.pop() {
        for entry in
            fs::read_dir(&folder).map_err(|_| "No se pudo medir el almacén de grabaciones")?
        {
            let entry = entry.map_err(|_| "Inventario de grabaciones incompleto")?;
            if matches!(
                entry
                    .file_name()
                    .to_string_lossy()
                    .to_ascii_lowercase()
                    .as_str(),
                "owner.lock" | "runtime-owner.lock" | "capture.lock"
            ) {
                continue;
            }
            entries += 1;
            if entries > 10000 || started.elapsed() > Duration::from_secs(2) {
                return Err(
                    "No se pudo medir todo el almacén; no se inicia otra copia de audio".into(),
                );
            }
            let meta =
                fs::symlink_metadata(entry.path()).map_err(|_| "No se pudo medir una grabación")?;
            if metadata::linked(&meta) {
                return Err("El almacén contiene enlaces; se conserva sin importar audio".into());
            }
            if meta.is_dir() {
                if folder == root {
                    slots += 1;
                    if slots >= 1000 {
                        return Err(
                            "El almacén alcanza1000 carpetas; las identidades se conservan".into(),
                        );
                    }
                }
                pending.push(entry.path());
            } else if meta.is_file() {
                bytes=bytes.checked_add(meta.len()).filter(|total|*total<=512*1024*1024).ok_or("La nueva copia superaría512MiB en Grabaciones; revisa el espacio sin retirar contenido automáticamente")?;
            } else {
                return Err("El almacén contiene entradas no regulares; se conserva".into());
            }
        }
    }
    Ok(())
}
fn hash_valid(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(|b| b.is_ascii_hexdigit())
}
fn create(path: &Path, raw: &[u8]) -> Result<(), String> {
    let mut file = OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(path)
        .map_err(|_| "La copia ya contiene una entrada; se conserva sin reemplazar")?;
    file.write_all(raw)
        .and_then(|_| file.sync_all())
        .map_err(|_| "Copia interrumpida; sus archivos permanecen para revisión")?;
    drop(file);
    let meta = fs::symlink_metadata(path).map_err(|_| "No se pudo comprobar la copia")?;
    if !meta.is_file() || metadata::linked(&meta) || meta.len() != raw.len() as u64 {
        return Err("La copia cambió; se conserva sin repetir".into());
    }
    let mut file = File::open(path).map_err(|_| "No se pudo comprobar la copia")?;
    let mut digest = sha2::Sha256::new();
    let mut size = 0usize;
    let mut buffer = [0; 65536];
    use sha2::Digest;
    loop {
        let n = file
            .read(&mut buffer)
            .map_err(|_| "La comprobación de la copia no terminó")?;
        if n == 0 {
            break;
        }
        size += n;
        if size > raw.len() {
            return Err("La copia cambió de tamaño; no se repite".into());
        }
        digest.update(&buffer[..n]);
    }
    if size != raw.len() || format!("{:x}", digest.finalize()) != metadata::hash(raw) {
        return Err("La copia no coincide; se conserva para revisión".into());
    }
    Ok(())
}
pub(super) fn publish(root: &Path, input: PortableRecording) -> Result<(Session, Vec<u8>), String> {
    if uuid::Uuid::parse_str(&input.id).is_err()
        || !input.origin.is_supported()
        || input.name.trim().is_empty()
        || input.name.len() > 240
        || input.name.chars().any(char::is_control)
    {
        return Err("Origen de audio no compatible; no se inicia la copia".into());
    }
    let mut total = 0usize;
    let mut samples = 0usize;
    for (track, expected) in [
        (&input.microphone, &input.origin.microphone_sha256),
        (&input.system, &input.origin.system_sha256),
    ] {
        match (track, expected) {
            (Some(raw), Some(hash))
                if !raw.is_empty()
                    && raw.len() % 2 == 0
                    && hash_valid(hash)
                    && metadata::hash(raw) == hash.to_ascii_lowercase() =>
            {
                total = total
                    .checked_add(raw.len())
                    .ok_or("Audio fuera de límites")?;
                samples = samples.max(raw.len() / 2);
            }
            (None, None) => (),
            _ => return Err("Las pistas no coinciden con el audio revisado".into()),
        }
    }
    if total == 0 || total > MAX_AUDIO {
        return Err("La copia requiere audio PCM de hasta128MiB".into());
    }
    metadata::directory(root)?;
    quota(root, total as u64 + 16384)?;
    let folder = root.join(&input.id);
    // Directory reservation is exclusive; metadata is published last. No repair/replay on failure.
    fs::create_dir(&folder).map_err(|_|"La identidad ya está reservada en Grabaciones. Revisa su estado; no se duplica ni sustituye".to_string())?;
    if let Some(raw) = &input.microphone {
        create(&folder.join("microphone.pcm"), raw)?;
    }
    if let Some(raw) = &input.system {
        create(&folder.join("system.pcm"), raw)?;
    }
    let settings = Settings {
        microphone: input.microphone.is_some(),
        system_audio: input.system.is_some(),
        microphone_device: None,
        output_device: None,
        retention_days: None,
        start_with_windows: false,
        ..Settings::default()
    };
    let mut session = Session::new(
        settings,
        Some(Destination {
            project_id: input.origin.project_id.clone(),
            folder_id: None,
            name: input.name,
        }),
    );
    session.id = input.id;
    session.status = Status::Attention;
    session.samples = samples as u64;
    session.bytes = total as u64;
    session.keep = true;
    session.recovered = true;
    session.portable_origin = Some(input.origin);
    session.error=Some("Audio traído del archivo portable. Revisa el destino y el audio antes de iniciar una transcripción. El original permanece.".into());
    let raw =
        serde_json::to_vec(&session).map_err(|_| "No se pudo preparar el registro de grabación")?;
    create(&folder.join("session.json"), &raw)?;
    Ok((session, raw))
}

#[cfg(test)]
mod tests {
    use super::*;
    use knownext_core::recording_portability::PortableRecordingOrigin;
    fn input() -> PortableRecording {
        let pcm = vec![1, 0, 2, 0, 3, 0];
        PortableRecording {
            id: "6238fdb1-f75f-538b-9f11-c1fa304f8dd5".into(),
            origin: PortableRecordingOrigin {
                schema_version: 1,
                identity: "a".repeat(64),
                project_id: "owned-project".into(),
                source_sha256: "b".repeat(64),
                microphone_sha256: Some(metadata::hash(&pcm)),
                system_sha256: None,
            },
            name: "Grabación conservada".into(),
            microphone: Some(pcm),
            system: None,
        }
    }
    #[test]
    fn retained_native_copy_preserves_exact_pcm_without_queue_cost_or_automatic_expiry() {
        let root = tempfile::tempdir().unwrap();
        let (session, raw) = publish(root.path(), input()).unwrap();
        assert_eq!(session.status, Status::Attention);
        assert!(session.chunks.is_empty());
        assert!(session.cost.is_null());
        assert!(session.document_id.is_none());
        assert_eq!(session.expires_at(), None);
        assert!(session.keep);
        assert_eq!(session.samples, 3);
        assert_eq!(
            fs::read(root.path().join(&session.id).join("microphone.pcm")).unwrap(),
            vec![1, 0, 2, 0, 3, 0]
        );
        assert_eq!(
            fs::read(root.path().join(&session.id).join("session.json")).unwrap(),
            raw
        );
        let decoded: Session = serde_json::from_slice(&raw).unwrap();
        assert_eq!(decoded.portable_origin, session.portable_origin);
        assert!(publish(root.path(), input()).is_err());
        assert_eq!(
            fs::read(root.path().join(&session.id).join("session.json")).unwrap(),
            raw
        );
    }
    #[test]
    fn future_or_interrupted_identity_and_bad_pcm_are_preserved_without_publication() {
        let root = tempfile::tempdir().unwrap();
        let mut bad = input();
        bad.microphone.as_mut().unwrap().push(0);
        assert!(publish(root.path(), bad).is_err());
        assert_eq!(fs::read_dir(root.path()).unwrap().count(), 0);
        let id = input().id;
        fs::create_dir(root.path().join(&id)).unwrap();
        let sentinel = b"{\"schemaVersion\":99}";
        fs::write(root.path().join(&id).join("session.json"), sentinel).unwrap();
        assert!(publish(root.path(), input()).is_err());
        assert_eq!(
            fs::read(root.path().join(&id).join("session.json")).unwrap(),
            sentinel
        );
        assert!(!root.path().join(&id).join("microphone.pcm").exists());
    }
    #[test]
    fn new_import_observes_shared_store_bytes_without_pruning_or_reading_payloads() {
        let root = tempfile::tempdir().unwrap();
        let payload = root.path().join("retained-opaque.bin");
        File::create(&payload)
            .unwrap()
            .set_len(512 * 1024 * 1024)
            .unwrap();
        assert!(publish(root.path(), input()).is_err());
        assert_eq!(fs::metadata(&payload).unwrap().len(), 512 * 1024 * 1024);
        assert!(!root.path().join(input().id).exists());
    }
}
