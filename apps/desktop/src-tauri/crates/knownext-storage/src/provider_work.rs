//! Legacy prompt/audio requests only return a proposal and a usage receipt.
//! They do not need the document mutation authority while a provider responds.
use super::*;
pub fn is_provider_work(method: &str, path: &str) -> bool {
    if !method.eq_ignore_ascii_case("POST") {
        return false;
    }
    let (path, _) = split_path(path);
    let parts: Vec<_> = path.trim_matches('/').split('/').collect();
    matches!(
        parts.as_slice(),
        ["api", "transcription"]
            | ["api", "handwritten-notes", _, "ocr"]
            | ["api", "documents", _, "ai", "prompt"]
            | ["api", "projects", _, "ai", "prompt"]
            | ["api", "projects", _, "ai", "research", "brief"]
    )
}
