use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum Status {
    Recording,
    Paused,
    PendingDestination,
    Ready,
    Queued,
    Transcribing,
    Attention,
    Completed,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Destination {
    pub project_id: String,
    pub folder_id: Option<String>,
    pub name: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub microphone: bool,
    pub system_audio: bool,
    pub microphone_device: Option<String>,
    pub output_device: Option<String>,
    pub languages: Vec<String>,
    pub model: String,
    pub retention_days: Option<u32>,
    pub start_with_windows: bool,
    pub keep_in_tray: bool,
}
impl Default for Settings {
    fn default() -> Self {
        Self {
            microphone: true,
            system_audio: cfg!(windows),
            microphone_device: None,
            output_device: None,
            languages: vec![],
            model: "gpt-transcribe".into(),
            retention_days: Some(7),
            start_with_windows: !cfg!(debug_assertions),
            keep_in_tray: true,
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Chunk {
    #[serde(default)]
    pub sha256: Option<String>,
    pub start: u64,
    pub samples: u64,
    pub status: String,
    pub text: Option<String>,
    pub languages: Vec<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    pub id: String,
    pub revision: u64,
    pub created_at: String,
    pub status: Status,
    pub settings: Settings,
    pub destination: Option<Destination>,
    pub samples: u64,
    pub bytes: u64,
    pub error: Option<String>,
    pub chunks: Vec<Chunk>,
    pub document_id: Option<String>,
    pub completed_at: Option<i64>,
    pub keep: bool,
    pub audio_deleted: bool,
    pub recovered: bool,
    #[serde(default)]
    pub cost: serde_json::Value,
}
impl Session {
    pub fn new(settings: Settings, destination: Option<Destination>) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            revision: 1,
            created_at: time::OffsetDateTime::now_utc()
                .format(&time::format_description::well_known::Rfc3339)
                .unwrap(),
            status: Status::Recording,
            settings,
            destination,
            samples: 0,
            bytes: 0,
            error: None,
            chunks: vec![],
            document_id: None,
            completed_at: None,
            keep: false,
            audio_deleted: false,
            recovered: false,
            cost: serde_json::Value::Null,
        }
    }
    pub fn expires_at(&self) -> Option<i64> {
        if self.keep || self.document_id.is_none() {
            return None;
        }
        self.completed_at
            .zip(self.settings.retention_days)
            .map(|(date, days)| date + days as i64 * 86400)
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Device {
    pub id: String,
    pub name: String,
    pub kind: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub revision: u64,
    pub sessions: Vec<Session>,
    pub settings: Settings,
    pub levels: [f32; 2],
    pub preview: bool,
    pub capture_owner: Option<String>,
    pub warning: Option<String>,
    pub devices: Vec<Device>,
}
