//! Read-only source references. Fragment ranges are capture ranges, never word timestamps.
use crate::{audio, metadata, model::Status};
use serde_json::{json, Value};
use std::path::Path;

pub fn transcript_source(root: &Path, id: &str) -> Result<Value, String> {
    metadata::directory(root)?;
    let (session, raw) = metadata::session(root, id)?
        .ok_or("La sesión ya no está disponible; no se inicia ningún envío")?;
    if matches!(
        session.status,
        Status::Recording | Status::Paused | Status::Queued | Status::Transcribing
    ) {
        return Err("Detén la captura o el procesamiento antes de revisar sus fuentes".into());
    }
    if session.chunks.len() > 2048 {
        return Err(
            "La transcripción supera2048fragmentos; se conserva completa sin una vista abreviada"
                .into(),
        );
    }
    let mut segments = vec![];
    let mut total = 0usize;
    let mut end = 0u64;
    let mut unconfirmed = 0;
    for (index, chunk) in session.chunks.iter().enumerate() {
        let next = chunk
            .start
            .checked_add(chunk.samples)
            .ok_or("Intervalo de audio no representable")?;
        if chunk.samples == 0 || chunk.start != end || next > session.samples {
            return Err("Los intervalos de la transcripción no corresponden al audio; se conserva la fuente".into());
        }
        end = next;
        if chunk.status != "completed" {
            unconfirmed += 1;
            continue;
        }
        let text = chunk
            .text
            .as_deref()
            .ok_or("Fragmento confirmado sin texto; se conserva sin inferir una transcripción")?;
        total = total
            .checked_add(text.len())
            .ok_or("Transcripción fuera de límites")?;
        if total > 2 * 1024 * 1024 {
            return Err("La transcripción supera2MiB; no se entrega una fuente truncada".into());
        }
        segments.push(json!({"id":format!("fragment-{}",index+1),"start":chunk.start,"samples":chunk.samples,"text":text,"speaker":null,"timing":"fragment"}));
    }
    if !session.chunks.is_empty() && end != session.samples {
        return Err("Los fragmentos no cubren el audio declarado; se conserva la fuente".into());
    }
    let audio_available = !session.audio_deleted
        && ["microphone.pcm", "system.pcm"].iter().any(|name| {
            std::fs::symlink_metadata(root.join(id).join(name))
                .ok()
                .is_some_and(|m| m.is_file() && !metadata::linked(&m) && m.len() > 0)
        });
    let destination = session.destination.as_ref();
    Ok(
        json!({"schemaVersion":1,"sessionId":id,"revision":session.revision,"sourceRevision":metadata::hash(&raw),"createdAt":session.created_at,"title":destination.map(|d|d.name.as_str()).unwrap_or("Reunión sin destino"),"projectId":destination.map(|d|d.project_id.as_str()),"status":session.status,"samples":session.samples,"sampleRate":audio::RATE,"audioAvailable":audio_available,"segments":segments,"unconfirmedCount":unconfirmed,"wordTimingAvailable":false,"diarizationAvailable":false,"readOnly":true,"startsProvider":false,"checkedAt":knownext_core::now_iso()}),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{Chunk, Session, Settings};
    fn fixture(root: &Path) -> Session {
        let mut s = Session::new(Settings::default(), None);
        s.status = Status::Attention;
        s.samples = 72000;
        s.chunks = vec![
            Chunk {
                usage_receipt: None,
                usage_recorded: false,
                sha256: None,
                start: 0,
                samples: 48000,
                status: "completed".into(),
                text: Some("Texto original sin responsable atribuido".into()),
                languages: vec![],
            },
            Chunk {
                usage_receipt: None,
                usage_recorded: false,
                sha256: None,
                start: 48000,
                samples: 24000,
                status: "unknown".into(),
                text: None,
                languages: vec![],
            },
        ];
        std::fs::create_dir(root.join(&s.id)).unwrap();
        crate::atomic_json(&root.join(&s.id).join("session.json"), &s).unwrap();
        s
    }
    #[test]
    fn block6_recording_source_preserves_confirmed_text_and_capture_ranges_without_inventing_speakers(
    ) {
        let dir = tempfile::tempdir().unwrap();
        let s = fixture(dir.path());
        let path = dir.path().join(&s.id).join("session.json");
        let before = std::fs::read(&path).unwrap();
        let v = transcript_source(dir.path(), &s.id).unwrap();
        assert_eq!(v["segments"].as_array().unwrap().len(), 1);
        assert_eq!(v["segments"][0]["samples"], 48000);
        assert_eq!(
            v["segments"][0]["text"],
            "Texto original sin responsable atribuido"
        );
        assert!(v["segments"][0]["speaker"].is_null());
        assert_eq!(v["unconfirmedCount"], 1);
        assert_eq!(v["startsProvider"], false);
        assert_eq!(std::fs::read(path).unwrap(), before);
    }
    #[test]
    fn block6_recording_source_rejects_inconsistent_ranges_and_active_work_without_repair() {
        let dir = tempfile::tempdir().unwrap();
        let mut s = fixture(dir.path());
        s.chunks[1].start = 24000;
        let path = dir.path().join(&s.id).join("session.json");
        crate::atomic_json(&path, &s).unwrap();
        let bytes = std::fs::read(&path).unwrap();
        assert!(transcript_source(dir.path(), &s.id).is_err());
        assert_eq!(std::fs::read(&path).unwrap(), bytes);
        s.chunks[1].start = 48000;
        s.status = Status::Transcribing;
        crate::atomic_json(&path, &s).unwrap();
        assert!(transcript_source(dir.path(), &s.id).is_err());
        assert!(transcript_source(dir.path(), "../other").is_err());
    }
    #[test]
    fn block6_recording_source_remains_consultable_after_audio_retirement_and_revision_changes() {
        let dir = tempfile::tempdir().unwrap();
        let mut s = fixture(dir.path());
        let first = transcript_source(dir.path(), &s.id).unwrap();
        s.audio_deleted = true;
        s.revision += 1;
        crate::atomic_json(&dir.path().join(&s.id).join("session.json"), &s).unwrap();
        let next = transcript_source(dir.path(), &s.id).unwrap();
        assert_eq!(next["audioAvailable"], false);
        assert_eq!(next["segments"], first["segments"]);
        assert_ne!(next["sourceRevision"], first["sourceRevision"]);
    }
}
