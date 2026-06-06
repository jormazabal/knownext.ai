use std::sync::atomic::{AtomicU64, Ordering};
use time::{format_description::well_known::Rfc3339, OffsetDateTime};

static NEXT_ID: AtomicU64 = AtomicU64::new(1);

pub fn now_iso() -> String {
    OffsetDateTime::now_utc()
        .format(&Rfc3339)
        .unwrap_or_else(|_| "1970-01-01T00:00:00Z".to_string())
}

pub fn compact_id(prefix: &str) -> String {
    let tick = OffsetDateTime::now_utc().unix_timestamp_nanos();
    let seq = NEXT_ID.fetch_add(1, Ordering::Relaxed);
    format!("{prefix}-{tick:x}-{seq:x}")
}

pub fn word_count(markdown: &str) -> usize {
    markdown
        .split_whitespace()
        .filter(|word| !word.trim().is_empty())
        .count()
}

pub fn percent_decode(value: &str) -> String {
    let bytes = value.as_bytes();
    let mut output = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' && index + 2 < bytes.len() {
            if let (Some(high), Some(low)) = (hex(bytes[index + 1]), hex(bytes[index + 2])) {
                output.push(high * 16 + low);
                index += 3;
                continue;
            }
        }
        output.push(if bytes[index] == b'+' {
            b' '
        } else {
            bytes[index]
        });
        index += 1;
    }
    String::from_utf8_lossy(&output).to_string()
}

fn hex(value: u8) -> Option<u8> {
    match value {
        b'0'..=b'9' => Some(value - b'0'),
        b'a'..=b'f' => Some(value - b'a' + 10),
        b'A'..=b'F' => Some(value - b'A' + 10),
        _ => None,
    }
}
