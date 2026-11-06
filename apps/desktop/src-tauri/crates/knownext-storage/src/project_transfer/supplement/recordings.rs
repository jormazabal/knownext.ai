use super::*;

pub(super) fn append(
    api: &LocalApi,
    project: &str,
    builder: &mut Builder<'_>,
) -> Result<usize, String> {
    let mut count = 0;
    for root_name in ["recordings", "recordings-dev"] {
        let root = api.app_data_dir.join(root_name);
        for name in builder.scan(&root)? {
            // Settings and recovery directories are profile data, not project sessions.
            if matches!(
                name.as_str(),
                "settings.json" | "sessions-recovery" | "settings-recovery"
            ) {
                continue;
            }
            if name.len() != 36
                || !name.bytes().enumerate().all(|(i, b)| {
                    if [8, 13, 18, 23].contains(&i) {
                        b == b'-'
                    } else {
                        b.is_ascii_hexdigit()
                    }
                })
            {
                return Err(
                    "Hay una entrada de grabación no atribuible; revísala antes de archivar".into(),
                );
            }
            let folder = root.join(&name);
            let files = builder.scan(&folder)?;
            if !files.iter().any(|f| f == "session.json") {
                return Err("Una sesión carece de metadatos; no se puede atribuir su audio".into());
            }
            let relative = format!("{root_name}/{name}/session.json");
            let raw = builder.read(&api.app_data_dir, &relative, 4 * 1024 * 1024)?;
            let session: Value = serde_json::from_slice(&raw)
                .map_err(|_| "Metadatos de sesión dañados; se conservan")?;
            if session["id"] != name {
                return Err("La sesión no corresponde a su carpeta".into());
            }
            if session["destination"]["projectId"].as_str() != Some(project) {
                continue;
            }
            if !matches!(
                session["status"].as_str(),
                Some("pendingDestination" | "ready" | "queued" | "attention" | "completed")
            ) {
                return Err(
                    "Detén la grabación o espera al envío activo antes de crear el archivo privado"
                        .into(),
                );
            }
            if session["chunks"]
                .as_array()
                .is_none_or(|chunks| chunks.iter().any(|c| c["status"] == "sending"))
            {
                return Err(
                    "La sesión tiene un envío activo o un formato desconocido; se conserva".into(),
                );
            }
            if files
                .iter()
                .any(|f| !matches!(f.as_str(), "session.json" | "microphone.pcm" | "system.pcm"))
            {
                return Err(
                    "La sesión contiene archivos no reconocidos; no se prepara una copia parcial"
                        .into(),
                );
            }
            let identity = sha256_hex(format!("{root_name}/{name}").as_bytes());
            let prefix = format!("Grabaciones/{}", &identity[..24]);
            // Preserve the exact envelope as inert data. It is never copied into the active recording store.
            builder.put(&format!("{prefix}/Original.json"), &raw)?;
            let mut tracks = vec![];
            for (file, label) in [("microphone.pcm", "Microfono"), ("system.pcm", "Sistema")] {
                if files.iter().any(|f| f == file) {
                    let parts = builder.parts(
                        &api.app_data_dir,
                        &format!("{root_name}/{name}/{file}"),
                        &format!("{prefix}/{label}"),
                        true,
                    )?;
                    tracks.push(json!({"source":file,"audio":parts}));
                }
            }
            if tracks.is_empty()
                && session["audioDeleted"].as_bool() != Some(true)
                && session["samples"].as_u64().unwrap_or(1) > 0
            {
                return Err("Falta audio que la sesión declara conservado; no se entrega un archivo parcial".into());
            }
            let mut text =
                String::from("# Transcripción conservada\n\nCopia de datos; no inicia envíos.\n\n");
            for chunk in session["chunks"]
                .as_array()
                .ok_or("Sesión sin fragmentos compatibles")?
            {
                if let Some(value) = chunk["text"].as_str() {
                    text.push_str(value);
                    text.push_str("\n\n");
                }
            }
            builder.put(&format!("{prefix}/Transcripcion.md"), text.as_bytes())?;
            builder.items.push(json!({"kind":"recording","original":builder.relative(&format!("{prefix}/Original.json")),"transcript":builder.relative(&format!("{prefix}/Transcripcion.md")),"tracks":tracks,"sampleRate":24000,"channels":1,"bitsPerSample":16,"active":false,"audioDeletedAtSource":session["audioDeleted"]}));
            count += 1;
        }
    }
    Ok(count)
}
