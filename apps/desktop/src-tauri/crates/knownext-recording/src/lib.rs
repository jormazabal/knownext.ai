pub mod audio;
pub mod model;
mod native;
pub mod transcription;

use model::*;
#[cfg(test)]
use serde_json::json;
use serde_json::Value;
use std::{
    collections::{HashMap, HashSet},
    fs::{self, File, OpenOptions},
    io::{Seek, SeekFrom, Write},
    path::{Path, PathBuf},
    sync::{mpsc, Arc, Mutex},
    time::{Duration, Instant},
};

type Reply = mpsc::Sender<Result<Value, String>>;
#[derive(Clone)]
pub struct RecordingService {
    sender: mpsc::Sender<(String, Value, Reply)>,
    pub root: PathBuf,
    pub processing: Arc<Mutex<()>>,
}
struct Engine {
    root: PathBuf,
    _lock: File,
    settings: Settings,
    sessions: Vec<Session>,
    revision: u64,
    sources: Vec<native::Source>,
    tracks: [Option<File>; 2],
    written_ends: [u64; 2],
    active: Option<String>,
    preview: bool,
    dictation: bool,
    dictation_owner: Option<String>,
    levels: [f32; 2],
    warning: Option<String>,
    segment_start: Instant,
    segment_offset: u64,
    epoch: Option<u64>,
    checkpoint: Instant,
    last_tick: Instant,
    leases: HashMap<String, Instant>,
    in_flight: HashSet<String>,
}
pub fn atomic_json<T: serde::Serialize>(path: &Path, data: &T) -> Result<(), String> {
    let mut temp = tempfile::NamedTempFile::new_in(path.parent().ok_or("Ruta inválida")?)
        .map_err(|e| e.to_string())?;
    serde_json::to_writer(&mut temp, data).map_err(|e| e.to_string())?;
    temp.as_file().sync_all().map_err(|e| e.to_string())?;
    temp.persist(path).map_err(|e| e.to_string())?;
    Ok(())
}
impl RecordingService {
    pub fn new(root: PathBuf) -> Result<Self, String> {
        fs::create_dir_all(&root).map_err(|e| e.to_string())?;
        let lock = OpenOptions::new()
            .create(true)
            .truncate(false)
            .read(true)
            .write(true)
            .open(root.join("capture.lock"))
            .map_err(|e| e.to_string())?;
        fs2::FileExt::try_lock_exclusive(&lock)
            .map_err(|_| "Ya existe una instancia que utiliza este perfil".to_string())?;
        let settings = fs::read(root.join("settings.json"))
            .ok()
            .and_then(|b| serde_json::from_slice(&b).ok())
            .unwrap_or_default();
        let mut sessions: Vec<Session> = vec![];
        for entry in fs::read_dir(&root).map_err(|e| e.to_string())?.flatten() {
            let path = entry.path().join("session.json");
            if let Ok(bytes) = fs::read(&path) {
                if let Ok(mut s) = serde_json::from_slice::<Session>(&bytes) {
                    if entry.file_name().to_string_lossy() != s.id {
                        continue;
                    }
                    if matches!(s.status, Status::Recording | Status::Paused) {
                        let mut recovered = 0;
                        for name in ["microphone.pcm", "system.pcm"] {
                            if let Ok(file) =
                                OpenOptions::new().write(true).open(entry.path().join(name))
                            {
                                let length = file.metadata().map_err(|e| e.to_string())?.len();
                                file.set_len(length - length % 2)
                                    .map_err(|e| e.to_string())?;
                                recovered = recovered.max(length / 2);
                            }
                        }
                        s.samples = recovered;
                        s.recovered = true;
                        s.status = Status::Attention;
                        s.error = Some("Grabación interrumpida. Se ha recuperado el audio disponible; revisa el final.".into());
                    }
                    // Cancellation may have left an HTTP request in flight when the app closed.
                    if s.chunks.iter().any(|c| c.status == "sending")
                        && s.status != Status::Completed
                    {
                        for c in &mut s.chunks {
                            if c.status == "sending" {
                                c.status = "unknown".into();
                            }
                        }
                        s.status = Status::Attention;
                        s.error=Some("Hay un envío sin resultado confirmado. Reintentar puede repetir consumo.".into());
                    }
                    if s.status == Status::Transcribing {
                        for chunk in &mut s.chunks {
                            if chunk.status == "sending" {
                                chunk.status = "unknown".into();
                            }
                        }
                        if s.chunks.iter().any(|c| c.status == "unknown") {
                            s.status = Status::Attention;
                            s.error = Some("Procesamiento interrumpido. Revisa los fragmentos antes de reintentar.".into());
                        } else {
                            s.status = Status::Queued;
                        }
                    }
                    s.revision += 1;
                    atomic_json(&path, &s)?;
                    sessions.push(s);
                }
            }
        }
        let (sender, receiver) = mpsc::channel::<(String, Value, Reply)>();
        let engine_root = root.clone();
        std::thread::Builder::new()
            .name("knownext-capture".into())
            .spawn(move || {
                let mut engine = Engine {
                    root: engine_root,
                    _lock: lock,
                    settings,
                    sessions,
                    revision: 1,
                    sources: vec![],
                    tracks: [None, None],
                    written_ends: [0; 2],
                    active: None,
                    preview: false,
                    dictation: false,
                    dictation_owner: None,
                    levels: [0.0; 2],
                    warning: None,
                    segment_start: Instant::now(),
                    segment_offset: 0,
                    epoch: None,
                    checkpoint: Instant::now(),
                    last_tick: Instant::now(),
                    leases: HashMap::new(),
                    in_flight: HashSet::new(),
                };
                engine.cleanup();
                loop {
                    match receiver.recv_timeout(Duration::from_millis(20)) {
                        Ok((action, payload, reply)) => {
                            let result = engine.command(&action, payload);
                            let _ = reply.send(result);
                        }
                        Err(mpsc::RecvTimeoutError::Timeout) => {}
                        Err(_) => {
                            let _ = engine.pause();
                            break;
                        }
                    }
                    if let Err(error) = engine.tick() {
                        let _ = engine.pause();
                        engine.warning = Some(error.clone());
                        if let Some(id) = engine.active.clone() {
                            if let Ok(s) = engine.session_mut(&id) {
                                s.error = Some(error);
                            }
                            let _ = engine.save(&id);
                        }
                    }
                }
            })
            .map_err(|e| e.to_string())?;
        Ok(Self {
            sender,
            root,
            processing: Arc::new(Mutex::new(())),
        })
    }
    pub fn request(&self, action: &str, payload: Value) -> Result<Value, String> {
        let (tx, rx) = mpsc::channel();
        self.sender
            .send((action.into(), payload, tx))
            .map_err(|e| e.to_string())?;
        rx.recv().map_err(|e| e.to_string())?
    }
}
impl Engine {
    fn session_mut(&mut self, id: &str) -> Result<&mut Session, String> {
        self.sessions
            .iter_mut()
            .find(|s| s.id == id)
            .ok_or_else(|| "Grabación no encontrada".into())
    }
    fn save(&mut self, id: &str) -> Result<(), String> {
        self.revision += 1;
        let path = self.root.join(id).join("session.json");
        let s = self.session_mut(id)?;
        s.revision += 1;
        atomic_json(&path, s)
    }
    fn snapshot(&self) -> Value {
        serde_json::to_value(Snapshot {
            revision: self.revision,
            sessions: self
                .sessions
                .iter()
                .map(|s| {
                    let mut s = s.clone();
                    for c in &mut s.chunks {
                        c.text = None;
                    }
                    s
                })
                .collect(),
            settings: self.settings.clone(),
            levels: self.levels,
            preview: self.preview,
            capture_owner: if self.dictation {
                Some("dictation".into())
            } else {
                self.active.clone()
            },
            warning: self.warning.clone(),
            devices: vec![],
        })
        .unwrap()
    }
    fn open_capture(&mut self, settings: &Settings) -> Result<(), String> {
        self.sources = native::open(settings)?;
        self.segment_start = Instant::now();
        self.epoch = None;
        self.levels = [0.0; 2];
        Ok(())
    }
    fn pause(&mut self) -> Result<(), String> {
        self.sources.clear();
        self.preview = false;
        self.levels = [0.0; 2];
        for file in self.tracks.iter().flatten() {
            file.sync_all().map_err(|e| e.to_string())?;
        }
        self.tracks = [None, None];
        if let Some(id) = self.active.clone() {
            self.session_mut(&id)?.status = Status::Paused;
            self.save(&id)?;
        }
        Ok(())
    }
    fn start_tracks(&mut self, id: &str) -> Result<(), String> {
        let s = self.session_mut(id)?.clone();
        if !s.settings.microphone && !s.settings.system_audio {
            return Err("Activa una entrada antes de continuar".into());
        }
        self.open_capture(&s.settings)?;
        self.segment_offset = s.samples;
        self.written_ends = [s.samples; 2];
        for index in 0..2 {
            let name = if index == 0 {
                "microphone.pcm"
            } else {
                "system.pcm"
            };
            if (cfg!(target_os = "android") && index == 0)
                || self.sources.iter().any(|s| s.index == index)
                || self.root.join(id).join(name).exists()
            {
                let f = OpenOptions::new()
                    .create(true)
                    .truncate(false)
                    .write(true)
                    .read(true)
                    .open(self.root.join(id).join(name))
                    .map_err(|e| e.to_string())?;
                f.set_len(s.samples * 2).map_err(|e| e.to_string())?;
                self.tracks[index] = Some(f);
            }
        }
        self.session_mut(id)?.status = Status::Recording;
        self.save(id)
    }
    fn command(&mut self, action: &str, p: Value) -> Result<Value, String> {
        let id = p["id"].as_str().unwrap_or("").to_string();
        match action {
            "external-pcm" => {
                let bytes: Vec<u8> =
                    serde_json::from_value(p["bytes"].clone()).map_err(|e| e.to_string())?;
                if bytes.len() > 32_000 || bytes.len() % 2 != 0 {
                    return Err("Paquete PCM inválido".into());
                }
                if self.preview {
                    self.levels[0] = bytes
                        .chunks_exact(2)
                        .map(|s| i16::from_le_bytes([s[0], s[1]]).unsigned_abs() as f32 / 32768.0)
                        .fold(0.0, f32::max);
                    return Ok(Value::Null);
                }
                if self.active.as_deref() != Some(&id)
                    || self.session_mut(&id)?.status != Status::Recording
                {
                    return Ok(Value::Null);
                }
                let samples = self.session_mut(&id)?.samples;
                if let Some(file) = &mut self.tracks[0] {
                    file.seek(SeekFrom::Start(samples * 2))
                        .map_err(|e| e.to_string())?;
                    file.write_all(&bytes).map_err(|e| e.to_string())?;
                }
                let s = self.session_mut(&id)?;
                s.samples += bytes.len() as u64 / 2;
                s.bytes = s.samples * 2;
                self.levels[0] = bytes
                    .chunks_exact(2)
                    .map(|s| i16::from_le_bytes([s[0], s[1]]).unsigned_abs() as f32 / 32768.0)
                    .fold(0.0, f32::max);
                if self.checkpoint.elapsed() >= Duration::from_secs(2) {
                    for f in self.tracks.iter().flatten() {
                        f.sync_data().map_err(|e| e.to_string())?;
                    }
                    self.save(&id)?;
                    self.checkpoint = Instant::now();
                    let free = fs2::available_space(&self.root).map_err(|e| e.to_string())?;
                    self.warning =
                        (free < 1024 * 1024 * 1024).then(|| "Queda menos de 1 GiB libre".into());
                    if free < 100 * 1024 * 1024 {
                        self.pause()?;
                        self.active = None;
                        let s = self.session_mut(&id)?;
                        s.status = Status::Attention;
                        s.error = Some("Grabación finalizada: menos de 100 MiB libres".into());
                        self.save(&id)?;
                        return Err(
                            "Espacio insuficiente. Grabación finalizada y conservada.".into()
                        );
                    }
                }
                return Ok(Value::Null);
            }
            "snapshot" => return Ok(self.snapshot()),
            "warning" => self.warning = p["message"].as_str().map(str::to_string),
            "devices" => {
                return serde_json::to_value(native::devices()?).map_err(|e| e.to_string())
            }
            "settings" => {
                let settings: Settings = serde_json::from_value(p).map_err(|e| e.to_string())?;
                validate_settings(&settings)?;
                atomic_json(&self.root.join("settings.json"), &settings)?;
                self.settings = settings;
                self.revision += 1;
            }
            "dictation-acquire" => {
                if self.active.is_some() || self.preview || self.dictation {
                    return Err("El micrófono está ocupado por otra grabación".into());
                }
                self.dictation = true;
                self.dictation_owner = Some(p["owner"].as_str().unwrap_or("default").into());
            }
            "dictation-release" => {
                if self.dictation_owner.as_deref() == Some(p["owner"].as_str().unwrap_or("default"))
                {
                    self.dictation = false;
                    self.dictation_owner = None;
                }
            }
            "preview" => {
                if self.active.is_some() || self.dictation {
                    return Err("Ya hay una captura activa".into());
                }
                self.sources.clear();
                let settings: Settings =
                    serde_json::from_value(p["settings"].clone()).map_err(|e| e.to_string())?;
                self.open_capture(&settings)?;
                self.preview = true;
            }
            "preview-stop" => {
                if self.preview {
                    self.sources.clear();
                    self.preview = false;
                    self.levels = [0.0; 2];
                }
            }
            "start" => {
                if self.active.is_some() || self.dictation {
                    return Err("Ya hay una captura activa".into());
                }
                self.sources.clear();
                self.preview = false;
                let mut settings: Settings = if p["settings"].is_object() {
                    serde_json::from_value(p["settings"].clone()).map_err(|e| e.to_string())?
                } else {
                    self.settings.clone()
                };
                validate_settings(&settings)?;
                native::resolve(&mut settings)?;
                let destination =
                    serde_json::from_value(p["destination"].clone()).map_err(|e| e.to_string())?;
                let s = Session::new(settings, destination);
                let id = s.id.clone();
                fs::create_dir_all(self.root.join(&id)).map_err(|e| e.to_string())?;
                self.sessions.insert(0, s);
                self.active = Some(id.clone());
                if let Err(e) = self.start_tracks(&id) {
                    self.pause()?;
                    self.session_mut(&id)?.error = Some(e.clone());
                    self.save(&id)?;
                    return Err(e);
                }
            }
            "pause" => {
                if self.active.as_deref() != Some(&id) {
                    return Err("Esta sesión no está activa".into());
                }
                self.pause()?;
            }
            "resume" => {
                if self.active.as_deref() != Some(&id) {
                    return Err("Esta sesión no está activa".into());
                }
                if self.session_mut(&id)?.status != Status::Recording {
                    self.start_tracks(&id)?;
                }
            }
            "inputs" => {
                if self.active.as_deref() != Some(&id) {
                    return Err("Esta sesión no está activa".into());
                }
                let settings: Settings =
                    serde_json::from_value(p["settings"].clone()).map_err(|e| e.to_string())?;
                let s = self.session_mut(&id)?;
                if s.status == Status::Recording
                    && (s.settings.microphone_device != settings.microphone_device
                        || s.settings.output_device != settings.output_device)
                {
                    return Err("Pausa antes de cambiar de dispositivo".into());
                }
                let resume =
                    s.status == Status::Recording && (settings.microphone || settings.system_audio);
                self.pause()?;
                let current = &mut self.session_mut(&id)?.settings;
                current.microphone = settings.microphone;
                current.system_audio = settings.system_audio;
                current.microphone_device = settings.microphone_device;
                current.output_device = settings.output_device;
                if resume {
                    self.start_tracks(&id)?;
                }
                self.save(&id)?;
            }
            "discard" => {
                if p["confirmed"] != true {
                    return Err("Confirma el descarte del audio".into());
                }
                if self.active.as_deref() == Some(&id) {
                    self.pause()?;
                    self.active = None;
                }
                self.delete_audio(&id)?;
                let s = self.session_mut(&id)?;
                s.status = Status::Attention;
                s.error = Some("Audio descartado".into());
                self.save(&id)?;
            }
            "stop" => {
                if self.active.as_deref() == Some(&id) {
                    self.pause()?;
                    self.active = None;
                    let s = self.session_mut(&id)?;
                    s.status = if s.destination.is_some() {
                        Status::Ready
                    } else {
                        Status::PendingDestination
                    };
                    self.save(&id)?;
                }
            }
            "destination" => {
                if self.active.as_deref() == Some(&id) {
                    return Err("Finaliza la grabación antes de elegir destino".into());
                }
                let s = self.session_mut(&id)?;
                if s.status == Status::Transcribing || s.document_id.is_some() {
                    return Err("El destino ya está en uso".into());
                }
                s.destination = Some(
                    serde_json::from_value(p["destination"].clone()).map_err(|e| e.to_string())?,
                );
                s.status = Status::Ready;
                self.save(&id)?;
            }
            "keep" => {
                self.session_mut(&id)?.keep = p["keep"].as_bool().unwrap_or(true);
                self.save(&id)?;
            }
            "lease" => {
                if self.session_mut(&id)?.audio_deleted {
                    return Err("Audio eliminado".into());
                }
                self.leases.insert(
                    format!("{id}:{}", p["owner"].as_str().unwrap_or("default")),
                    Instant::now(),
                );
            }
            "release" => {
                self.leases.remove(&format!(
                    "{id}:{}",
                    p["owner"].as_str().unwrap_or("default")
                ));
            }
            "delete-audio" => {
                self.delete_audio(&id)?;
            }
            "queue" => {
                let rate = self
                    .root
                    .parent()
                    .and_then(|p| fs::read(p.join("eur-usd.json")).ok())
                    .and_then(|b| serde_json::from_slice::<Value>(&b).ok())
                    .unwrap_or(Value::Null);
                if self.active.as_deref() == Some(&id) {
                    return Err("Finaliza la grabación primero".into());
                }
                let s = self.session_mut(&id)?;
                if s.audio_deleted
                    || s.samples == 0
                    || s.destination.is_none()
                    || s.document_id.is_some()
                {
                    return Err("Se requiere audio y una carpeta de destino".into());
                }
                if s.chunks.iter().any(|c| c.status == "unknown")
                    && !p["confirmUnknown"].as_bool().unwrap_or(false)
                {
                    return Err("Resultado no confirmado. Reintentar puede repetir consumo; confirma el reintento.".into());
                }
                if matches!(s.status, Status::Queued | Status::Transcribing) {
                    return Ok(self.snapshot());
                }
                if s.cost.is_null() {
                    let tariff =
                        knownext_core::model_catalog::validate(&s.settings.model, "transcription")?
                            ["pricing"]
                            .clone();
                    let usd = s.samples as f64 / audio::RATE as f64 / 60.0
                        * tariff["input"].as_f64().ok_or("Tarifa no disponible")?;
                    let eur = rate["usdPerEur"]
                        .as_f64()
                        .filter(|r| r.is_finite() && *r > 0.0)
                        .map(|r| usd / r);
                    s.cost = serde_json::json!({"estimatedCostUsd":usd,"estimatedCostEur":eur,"exchangeRate":rate,"tariff":tariff,"catalogVersion":knownext_core::model_catalog::catalog()["version"],"estimate":true});
                }
                s.status = Status::Queued;
                s.error = None;
                self.save(&id)?;
            }
            "cancel-job" => {
                let s = self.session_mut(&id)?;
                if matches!(s.status, Status::Queued | Status::Transcribing) {
                    s.status = Status::Attention;
                    s.error = Some(
                        "Procesamiento detenido. Se conservan los fragmentos recibidos.".into(),
                    );
                    self.save(&id)?;
                }
            }
            "claim" => {
                let s = self
                    .sessions
                    .iter_mut()
                    .find(|s| s.status == Status::Queued);
                if let Some(s) = s {
                    s.status = Status::Transcribing;
                    let id = s.id.clone();
                    self.in_flight.insert(id.clone());
                    self.save(&id)?;
                    return Ok(serde_json::to_value(self.session_mut(&id)?.clone()).unwrap());
                }
                return Ok(Value::Null);
            }
            "job-release" => {
                self.in_flight.remove(&id);
            }
            "job-update" => {
                let s = self.session_mut(&id)?;
                if let Some(chunks) = p.get("chunks") {
                    s.chunks = serde_json::from_value(chunks.clone()).map_err(|e| e.to_string())?;
                }
                if let Some(error) = p["error"].as_str() {
                    s.status = Status::Attention;
                    s.error = Some(error.into());
                }
                if p["requeue"] == true && s.status == Status::Transcribing {
                    s.status = Status::Queued;
                }
                if let Some(document_id) = p["documentId"].as_str() {
                    s.document_id = Some(document_id.into());
                    s.completed_at = Some(time::OffsetDateTime::now_utc().unix_timestamp());
                    s.status = Status::Completed;
                    s.error = None;
                }
                self.save(&id)?;
            }
            _ => return Err("Acción de grabación no reconocida".into()),
        }
        Ok(self.snapshot())
    }
    fn tick(&mut self) -> Result<(), String> {
        let gap = self.last_tick.elapsed();
        self.last_tick = Instant::now();
        if gap > Duration::from_secs(5) && !self.sources.is_empty() {
            return Err("Captura interrumpida por suspensión o bloqueo del sistema. Continúa cuando estés preparado.".into());
        }
        if !cfg!(target_os = "android") {
            self.levels = [0.0; 2];
        }
        for source in &self.sources {
            while let Some((timestamp, bytes)) = source.read()? {
                let level = bytes
                    .chunks_exact(2)
                    .map(|s| i16::from_le_bytes([s[0], s[1]]).unsigned_abs() as f32 / 32768.0)
                    .fold(0.0, f32::max);
                self.levels[source.index] = self.levels[source.index].max(level);
                if self.preview {
                    continue;
                }
                let epoch =
                    *self
                        .epoch
                        .get_or_insert(timestamp.saturating_sub(
                            (self.segment_start.elapsed().as_nanos() / 100) as u64,
                        ));
                let position = self.segment_offset
                    + timestamp.saturating_sub(epoch) * audio::RATE / 10_000_000;
                if let Some(file) = &mut self.tracks[source.index] {
                    // Packet timestamps share the Windows performance clock. Align sources;
                    // clamp small clock overlaps, retain silence gaps as sparse PCM zeros.
                    let position = position.max(self.written_ends[source.index]);
                    file.seek(SeekFrom::Start(position * 2))
                        .map_err(|e| e.to_string())?;
                    file.write_all(&bytes).map_err(|e| e.to_string())?;
                    self.written_ends[source.index] = position + bytes.len() as u64 / 2;
                }
            }
        }
        if !self.sources.is_empty() && !self.preview {
            if let Some(id) = self.active.clone() {
                let samples = (self.segment_offset
                    + (self.segment_start.elapsed().as_secs_f64() * audio::RATE as f64) as u64)
                    .max(*self.written_ends.iter().max().unwrap());
                let mut bytes = 0;
                for file in self.tracks.iter().flatten() {
                    let len = file.metadata().map_err(|e| e.to_string())?.len();
                    file.set_len(len.max(samples * 2))
                        .map_err(|e| e.to_string())?;
                    bytes += len.max(samples * 2);
                }
                let s = self.session_mut(&id)?;
                s.samples = samples;
                s.bytes = bytes;
                if self.checkpoint.elapsed() >= Duration::from_secs(2) {
                    for file in self.tracks.iter().flatten() {
                        file.sync_data().map_err(|e| e.to_string())?;
                    }
                    self.save(&id)?;
                    let free = fs2::available_space(&self.root).map_err(|e| e.to_string())?;
                    if free < 100 * 1024 * 1024 {
                        self.pause()?;
                        self.active = None;
                        let s = self.session_mut(&id)?;
                        s.status = Status::Attention;
                        s.error =
                            Some("Grabación finalizada: queda menos de 100 MiB libres".into());
                        self.save(&id)?;
                    }
                    self.warning =
                        (free < 1024 * 1024 * 1024).then(|| "Queda menos de 1 GiB libre".into());
                    self.checkpoint = Instant::now();
                }
            }
        } else if self.checkpoint.elapsed() > Duration::from_secs(60) {
            self.cleanup();
            self.checkpoint = Instant::now();
        }
        Ok(())
    }
    fn delete_audio(&mut self, id: &str) -> Result<(), String> {
        if self.active.as_deref() == Some(id)
            || self.in_flight.contains(id)
            || self.leases.iter().any(|(key, t)| {
                key.starts_with(&format!("{id}:")) && t.elapsed() < Duration::from_secs(60)
            })
        {
            return Err("El audio se está utilizando".into());
        }
        let s = self.session_mut(id)?;
        if matches!(s.status, Status::Queued | Status::Transcribing) {
            return Err("El audio se está procesando".into());
        }
        for name in ["microphone.pcm", "system.pcm"] {
            let path = self.root.join(id).join(name);
            if path.exists() {
                fs::remove_file(path).map_err(|e| e.to_string())?;
            }
        }
        let s = self.session_mut(id)?;
        s.audio_deleted = true;
        s.bytes = 0;
        self.save(id)
    }
    fn cleanup(&mut self) {
        let now = time::OffsetDateTime::now_utc().unix_timestamp();
        let expired: Vec<_> = self
            .sessions
            .iter()
            .filter(|s| !s.audio_deleted && s.expires_at().is_some_and(|t| t <= now))
            .map(|s| s.id.clone())
            .collect();
        for id in expired {
            let _ = self.delete_audio(&id);
        }
    }
}
fn validate_settings(s: &Settings) -> Result<(), String> {
    if cfg!(target_os = "android") && s.system_audio {
        return Err("Android solo permite el micrófono en reuniones".into());
    }
    if s.model != "gpt-transcribe" {
        return Err("Modelo de reuniones no compatible".into());
    }
    if s.languages
        .iter()
        .any(|l| l.len() != 2 || !l.bytes().all(|c| c.is_ascii_lowercase()))
    {
        return Err("Código de idioma inválido".into());
    }
    if !matches!(s.retention_days, None | Some(0) | Some(7)) {
        return Err("Conservación inválida".into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn engine(root: &Path) -> Engine {
        let s = Session::new(Settings::default(), None);
        let id = s.id.clone();
        fs::create_dir_all(root.join(&id)).unwrap();
        let file = OpenOptions::new()
            .create(true)
            .truncate(true)
            .read(true)
            .write(true)
            .open(root.join(&id).join("microphone.pcm"))
            .unwrap();
        Engine {
            root: root.into(),
            _lock: File::create(root.join("lock")).unwrap(),
            settings: Settings::default(),
            sessions: vec![s],
            revision: 1,
            sources: vec![],
            tracks: [Some(file), None],
            written_ends: [0; 2],
            active: Some(id),
            preview: false,
            dictation: false,
            dictation_owner: None,
            levels: [0.0; 2],
            warning: None,
            segment_start: Instant::now(),
            segment_offset: 0,
            epoch: None,
            checkpoint: Instant::now(),
            last_tick: Instant::now(),
            leases: HashMap::new(),
            in_flight: HashSet::new(),
        }
    }
    #[test]
    fn confirmed_pause_rejects_late_samples_and_duplicate_stop_is_safe() {
        let dir = tempfile::tempdir().unwrap();
        let mut e = engine(dir.path());
        let id = e.active.clone().unwrap();
        e.command("external-pcm", json!({"id":id,"bytes":[1,0,2,0]}))
            .unwrap();
        e.command("pause", json!({"id":id})).unwrap();
        e.command("external-pcm", json!({"id":id,"bytes":[3,0]}))
            .unwrap();
        assert_eq!(
            fs::read(dir.path().join(&id).join("microphone.pcm")).unwrap(),
            vec![1, 0, 2, 0]
        );
        assert_eq!(e.sessions[0].samples, 2);
        e.command("stop", json!({"id":id})).unwrap();
        e.command("stop", json!({"id":id})).unwrap();
        assert_eq!(e.sessions[0].status, Status::PendingDestination);
    }
    #[test]
    fn last_input_off_pauses_and_does_not_discard() {
        let dir = tempfile::tempdir().unwrap();
        let mut e = engine(dir.path());
        let id = e.active.clone().unwrap();
        let mut s = e.settings.clone();
        s.microphone = false;
        s.system_audio = false;
        e.command("inputs", json!({"id":id,"settings":s})).unwrap();
        assert_eq!(e.sessions[0].status, Status::Paused);
        assert!(dir.path().join(id).join("microphone.pcm").exists());
    }
    #[test]
    fn ambiguous_retry_requires_confirmation_and_retains_completed_chunks() {
        let dir = tempfile::tempdir().unwrap();
        let mut e = engine(dir.path());
        let id = e.active.clone().unwrap();
        e.command("stop", json!({"id":id})).unwrap();
        let s = e.session_mut(&id).unwrap();
        s.samples = 100;
        s.destination = Some(Destination {
            project_id: "p".into(),
            folder_id: None,
            name: "Reunión.md".into(),
        });
        s.chunks = vec![
            Chunk {
                sha256: None,
                start: 0,
                samples: 50,
                status: "completed".into(),
                text: Some("Confirmado".into()),
                languages: vec!["eu".into()],
            },
            Chunk {
                sha256: None,
                start: 50,
                samples: 50,
                status: "unknown".into(),
                text: None,
                languages: vec![],
            },
        ];
        assert!(e.command("queue", json!({"id":id})).is_err());
        e.command("queue", json!({"id":id,"confirmUnknown":true}))
            .unwrap();
        assert_eq!(e.sessions[0].chunks[0].text.as_deref(), Some("Confirmado"));
    }
    #[test]
    fn cancelled_network_work_and_playback_protect_audio() {
        let dir = tempfile::tempdir().unwrap();
        let mut e = engine(dir.path());
        let id = e.active.clone().unwrap();
        e.command("stop", json!({"id":id})).unwrap();
        e.in_flight.insert(id.clone());
        assert!(e.delete_audio(&id).is_err());
        e.command("job-release", json!({"id":id})).unwrap();
        e.command("lease", json!({"id":id,"owner":"a"})).unwrap();
        e.command("lease", json!({"id":id,"owner":"b"})).unwrap();
        e.command("release", json!({"id":id,"owner":"a"})).unwrap();
        assert!(e.delete_audio(&id).is_err());
        e.command("release", json!({"id":id,"owner":"b"})).unwrap();
        e.delete_audio(&id).unwrap();
        assert!(e.sessions[0].audio_deleted);
    }
    #[test]
    fn cleanup_ignores_pending_and_pinned_audio() {
        let dir = tempfile::tempdir().unwrap();
        let mut e = engine(dir.path());
        let id = e.active.clone().unwrap();
        e.command("stop", json!({"id":id})).unwrap();
        e.cleanup();
        assert!(!e.sessions[0].audio_deleted);
        let s = &mut e.sessions[0];
        s.completed_at = Some(0);
        s.document_id = Some("doc".into());
        s.keep = true;
        e.cleanup();
        assert!(!e.sessions[0].audio_deleted);
        e.sessions[0].keep = false;
        e.cleanup();
        assert!(e.sessions[0].audio_deleted);
        assert_eq!(e.sessions[0].document_id.as_deref(), Some("doc"));
    }
    #[test]
    fn pending_never_expires() {
        let mut s = Session::new(Settings::default(), None);
        s.completed_at = Some(0);
        assert_eq!(s.expires_at(), None);
        s.document_id = Some("doc".into());
        assert_eq!(s.expires_at(), Some(604800));
        s.keep = true;
        assert_eq!(s.expires_at(), None);
    }
    #[test]
    fn recovery_never_resumes_and_repairs_pcm() {
        let temp = tempfile::tempdir().unwrap();
        let s = Session::new(Settings::default(), None);
        fs::create_dir(temp.path().join(&s.id)).unwrap();
        atomic_json(&temp.path().join(&s.id).join("session.json"), &s).unwrap();
        fs::write(temp.path().join(&s.id).join("microphone.pcm"), [0, 1, 2]).unwrap();
        let service = RecordingService::new(temp.path().into()).unwrap();
        let snap = service.request("snapshot", json!({})).unwrap();
        assert_eq!(snap["sessions"][0]["status"], "attention");
        assert_eq!(snap["sessions"][0]["samples"], 1);
        assert!(snap["captureOwner"].is_null());
    }
    #[test]
    fn silence_cut_preserves_all_samples() {
        let data = vec![0i16; audio::MAX_CHUNK_SAMPLES as usize];
        let cut = audio::cut(&data, false);
        assert!(cut > 0 && cut <= data.len());
        assert_eq!(audio::wav(&data[..cut]).len(), cut * 2 + 44);
    }
    #[test]
    fn exclusive_profile_and_microphone() {
        let temp = tempfile::tempdir().unwrap();
        let service = RecordingService::new(temp.path().into()).unwrap();
        assert!(RecordingService::new(temp.path().into()).is_err());
        service.request("dictation-acquire", json!({})).unwrap();
        assert!(service.request("dictation-acquire", json!({})).is_err());
        service.request("dictation-release", json!({})).unwrap();
        service.request("dictation-acquire", json!({})).unwrap();
    }
}
