use crate::{
    audio,
    model::{Chunk, Destination, Session, Status},
    RecordingService,
};
use serde_json::{json, Value};
use std::time::Duration;

// Called on a dedicated worker. Credential and document callbacks hold the app
// storage lock only for local operations; HTTP never runs under that lock.
pub fn drain(
    service: &RecordingService,
    key: impl Fn() -> Result<String, String>,
    document: impl Fn(&str, &Destination, &str) -> Result<String, String>,
) -> Result<(), String> {
    let Ok(_guard) = service.processing.try_lock() else {
        return Ok(());
    };
    loop {
        let value = service.request("claim", json!({}))?;
        if value.is_null() {
            return Ok(());
        }
        let mut session: Session = serde_json::from_value(value).map_err(|e| e.to_string())?;
        let _lease = JobLease(service, session.id.clone());
        if let Err(error) = process(service, &mut session, &key, &document, false) {
            service.request(
                "job-update",
                json!({"id":session.id,"error":error,"chunks":session.chunks}),
            )?;
        }
    }
}
pub fn one_fragment(
    service: &RecordingService,
    key: impl Fn() -> Result<String, String>,
    document: impl Fn(&str, &Destination, &str) -> Result<String, String>,
) -> Result<bool, String> {
    let Ok(_guard) = service.processing.try_lock() else {
        return Ok(true);
    };
    let value = service.request("claim", json!({}))?;
    if value.is_null() {
        return Ok(false);
    }
    let mut session: Session = serde_json::from_value(value).map_err(|e| e.to_string())?;
    let _lease = JobLease(service, session.id.clone());
    if let Err(error) = process(service, &mut session, &key, &document, true) {
        service.request(
            "job-update",
            json!({"id":session.id,"error":error,"chunks":session.chunks}),
        )?;
    }
    let snapshot = service.request("snapshot", json!({}))?;
    Ok(snapshot["sessions"]
        .as_array()
        .is_some_and(|a| a.iter().any(|s| s["status"] == "queued")))
}
fn running(service: &RecordingService, id: &str) -> Result<bool, String> {
    let snapshot = service.request("snapshot", json!({}))?;
    Ok(snapshot["sessions"]
        .as_array()
        .unwrap()
        .iter()
        .any(|s| s["id"] == id && s["status"] == "transcribing"))
}
fn process(
    service: &RecordingService,
    session: &mut Session,
    key: &impl Fn() -> Result<String, String>,
    document: &impl Fn(&str, &Destination, &str) -> Result<String, String>,
    one: bool,
) -> Result<(), String> {
    let credential = key()?;
    knownext_core::model_catalog::validate(&session.settings.model, "transcription")?;
    if session.settings.model != "gpt-transcribe" {
        return Err("El modelo del trabajo ya no es compatible".into());
    }
    let root = service.root.join(&session.id);
    if session.chunks.is_empty() {
        let mut start = 0;
        while start < session.samples {
            let count = (session.samples - start).min(audio::MAX_CHUNK_SAMPLES);
            let samples = audio::mix(&root, start, count)?;
            let length = audio::cut(&samples, start + count == session.samples) as u64;
            session.chunks.push(Chunk {
                sha256: Some(audio::checksum(&samples[..length as usize])),
                start,
                samples: length,
                status: "pending".into(),
                text: None,
                languages: vec![],
            });
            start += length;
        }
        service.request(
            "job-update",
            json!({"id":session.id,"chunks":session.chunks}),
        )?;
    }
    let client = knownext_core::http_client_builder()
        .connect_timeout(Duration::from_secs(15))
        .timeout(Duration::from_secs(120))
        .build()
        .map_err(|e| e.to_string())?;
    for index in 0..session.chunks.len() {
        if !running(service, &session.id)? {
            return Ok(());
        }
        if session.chunks[index].status == "completed" {
            continue;
        }
        session.chunks[index].status = "sending".into();
        service.request(
            "job-update",
            json!({"id":session.id,"chunks":session.chunks}),
        )?;
        let chunk = &session.chunks[index];
        let pcm = audio::mix(&root, chunk.start, chunk.samples)?;
        if chunk
            .sha256
            .as_ref()
            .is_some_and(|hash| *hash != audio::checksum(&pcm))
        {
            session.chunks[index].status = "pending".into();
            return Err(
                "El audio del fragmento ha cambiado o está incompleto. No se ha enviado.".into(),
            );
        }
        let bytes = audio::wav(&pcm);
        drop(pcm);
        let mut attempt = 0;
        let response = loop {
            if !running(service, &session.id)? {
                return Ok(());
            }
            let mut form = reqwest::blocking::multipart::Form::new()
                .text("model", session.settings.model.clone())
                .text("response_format", "json")
                .part(
                    "file",
                    reqwest::blocking::multipart::Part::bytes(bytes.clone())
                        .file_name("meeting.wav")
                        .mime_str("audio/wav")
                        .map_err(|e| e.to_string())?,
                );
            for language in &session.settings.languages {
                form = form.text("languages[]", language.clone());
            }
            let response = client
                .post("https://api.openai.com/v1/audio/transcriptions")
                .bearer_auth(&credential)
                .multipart(form)
                .send();
            let retryable = match &response {
                Err(e) => e.is_connect(),
                Ok(r) => r.status().as_u16() == 429,
            };
            if !retryable || attempt >= 2 {
                break response;
            }
            attempt += 1;
            // Only proven pre-send failures and explicit rate-limit rejection are safe.
            for _ in 0..(attempt * 10) {
                if !running(service, &session.id)? {
                    return Ok(());
                }
                std::thread::sleep(Duration::from_millis(100));
            }
        };
        let chunk = &mut session.chunks[index];
        match response {
            Err(error) => {
                chunk.status = if error.is_connect() {
                    "pending"
                } else {
                    "unknown"
                }
                .into();
                return Err(if error.is_connect() {
                    "No se ha podido conectar. El audio está guardado."
                } else {
                    "Resultado no confirmado tras enviar audio. Reintentar puede repetir consumo."
                }
                .into());
            }
            Ok(response) if !response.status().is_success() => {
                let status = response.status().as_u16();
                chunk.status = if status == 408 || status >= 500 {
                    "unknown"
                } else {
                    "pending"
                }
                .into();
                return Err(format!("OpenAI ha respondido HTTP {status}. Revisa conexión, acceso al modelo y credenciales."));
            }
            Ok(response) => {
                let body: Value = match response.json() {
                    Ok(v) => v,
                    Err(_) => {
                        chunk.status = "unknown".into();
                        return Err("Respuesta incompleta. El resultado no está confirmado; reintentar puede repetir consumo.".into());
                    }
                };
                let Some(text) = body["text"].as_str() else {
                    chunk.status = "unknown".into();
                    return Err("Respuesta sin transcripción confirmada".into());
                };
                chunk.text = Some(text.into());
                chunk.languages = body["languages"]
                    .as_array()
                    .map(|a| {
                        a.iter()
                            .filter_map(|v| v["code"].as_str().map(str::to_string))
                            .collect()
                    })
                    .unwrap_or_default();
                chunk.status = "completed".into();
            }
        }
        service.request(
            "job-update",
            json!({"id":session.id,"chunks":session.chunks}),
        )?;
        if one && session.chunks.iter().any(|c| c.status != "completed") {
            service.request("job-update", json!({"id":session.id,"requeue":true}))?;
            return Ok(());
        }
    }
    if !running(service, &session.id)? {
        return Ok(());
    }
    if session.chunks.iter().any(|c| c.status != "completed") {
        return Err("Faltan fragmentos por transcribir".into());
    }
    let destination = session.destination.as_ref().ok_or("Elige una carpeta")?;
    let text = session
        .chunks
        .iter()
        .map(|c| c.text.as_deref().unwrap_or(""))
        .collect::<Vec<_>>()
        .join("\n\n");
    let title = destination
        .name
        .trim_end_matches(".md")
        .replace(['\r', '\n'], " ");
    let markdown = format!(
        "[knownext-recording:{}]: #\n\n# {}\n\nFecha: {}\n\nDuración capturada: {} s\n\n{}\n",
        session.id,
        title,
        session.created_at,
        session.samples / audio::RATE,
        text
    );
    let id = document(&session.id, destination, &markdown)?;
    service.request("job-update", json!({"id":session.id,"documentId":id}))?;
    session.status = Status::Completed;
    Ok(())
}

struct JobLease<'a>(&'a RecordingService, String);
impl Drop for JobLease<'_> {
    fn drop(&mut self) {
        let _ = self.0.request("job-release", json!({"id":self.1}));
    }
}
