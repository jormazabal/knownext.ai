//! Native-only transfer of verified PCM. No caller paths or provider state.
use serde::{Deserialize, Serialize};
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PortableRecordingOrigin {
    pub schema_version: u8,
    pub identity: String,
    pub project_id: String,
    pub source_sha256: String,
    pub microphone_sha256: Option<String>,
    pub system_sha256: Option<String>,
}
impl PortableRecordingOrigin {
    pub fn is_supported(&self) -> bool {
        let hash = |value: &str| value.len() == 64 && value.bytes().all(|b| b.is_ascii_hexdigit());
        self.schema_version == 1
            && hash(&self.identity)
            && hash(&self.source_sha256)
            && !self.project_id.is_empty()
            && self.project_id.len() <= 512
            && !self.project_id.chars().any(char::is_control)
            && self
                .microphone_sha256
                .iter()
                .chain(self.system_sha256.iter())
                .all(|value| hash(value))
            && (self.microphone_sha256.is_some() || self.system_sha256.is_some())
    }
}
pub struct PortableRecording {
    pub id: String,
    pub origin: PortableRecordingOrigin,
    pub name: String,
    pub microphone: Option<Vec<u8>>,
    pub system: Option<Vec<u8>>,
}
