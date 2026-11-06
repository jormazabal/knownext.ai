//! Durable billing receipt: deliberately contains neither credentials nor transcript.
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RecordingUsageReceipt {
    pub id: String,
    pub started_at: String,
    pub project_id: String,
    pub model: String,
    pub samples: u64,
    pub exchange_rate: serde_json::Value,
    pub confirmed: bool,
}
