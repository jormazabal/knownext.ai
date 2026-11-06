//! Read-only occupancy of existing admission scopes. Metadata is not format authority.
use super::*;
use std::{fs, time::Instant};

pub(crate) const CONFLICT_RECORDS: usize = 1000;
pub(crate) const CONFLICT_BYTES: u64 = 16 * 1024 * 1024;
pub(crate) const MIXED_RECORDS: usize = 64;
pub(crate) const MIXED_BYTES: u64 = 16 * 1024 * 1024;
pub(crate) const APPLICATION_RECORDS: usize = 64;
pub(crate) const APPLICATION_BYTES: u64 = 256 * 1024 * 1024;
pub(crate) const JOIN_RECORDS: usize = 64;
pub(crate) const JOIN_BYTES: u64 = 1024 * 1024;
pub(crate) const TEMPLATE_RECORDS: usize = 50;
pub(crate) const TEMPLATE_BYTES: u64 = 256 * 1024 * 1024;
pub(crate) const TRANSFER_RECORDS: usize = 1;
pub(crate) const TRANSFER_BYTES: u64 = 2 * 1024 * 1024 * 1024;
pub(crate) const EXPORT_BATCH_RECORDS: usize = 2048;
pub(crate) const EXPORT_BATCH_BYTES: u64 = 1024 * 1024 * 1024;
const MAX_SCOPES: usize = 200;
const MAX_ENTRIES: usize = 10_000;

struct Meter {
    started: Instant,
    entries: usize,
    limited: bool,
}
impl Meter {
    fn step(&mut self) -> bool {
        if self.entries >= MAX_ENTRIES || self.started.elapsed() > Duration::from_secs(2) {
            self.limited = true;
            return false;
        }
        self.entries += 1;
        true
    }
}
fn coordination(name: &str) -> bool {
    matches!(
        name.to_ascii_lowercase().as_str(),
        "owner.lock" | "runtime-owner.lock" | "capture.lock"
    )
}
fn regular(path: &Path) -> Result<bool, ()> {
    match fs::symlink_metadata(path) {
        Ok(meta) if meta.is_dir() && !batch::linked(&meta) => Ok(true),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(false),
        _ => Err(()),
    }
}
fn children(path: &Path, meter: &mut Meter) -> (Vec<PathBuf>, bool) {
    match regular(path) {
        Ok(false) => return (vec![], true),
        Err(_) => return (vec![], false),
        _ => (),
    }
    let mut items = vec![];
    let mut complete = true;
    match fs::read_dir(path) {
        Ok(entries) => {
            for entry in entries {
                if !meter.step() {
                    complete = false;
                    break;
                }
                match entry {
                    Ok(entry) if !coordination(&entry.file_name().to_string_lossy()) => {
                        items.push(entry.path())
                    }
                    Ok(_) => (),
                    Err(_) => complete = false,
                }
            }
        }
        Err(_) => complete = false,
    }
    items.sort();
    (items, complete)
}
fn occupancy(path: &Path, files_only: bool, meter: &mut Meter) -> (usize, u64, bool) {
    let (items, mut complete) = children(path, meter);
    let count = items.len();
    let mut bytes = 0u64;
    let mut pending: Vec<_> = items.into_iter().map(|p| (p, true)).collect();
    while let Some((path, immediate)) = pending.pop() {
        if !meter.step() {
            complete = false;
            break;
        }
        match fs::symlink_metadata(&path) {
            Ok(meta) if batch::linked(&meta) => complete = false,
            Ok(meta) if meta.is_file() => {
                if immediate && !files_only {
                    complete = false;
                }
                match bytes
                    .checked_add(meta.len())
                    .filter(|v| *v <= 9_007_199_254_740_991)
                {
                    Some(total) => bytes = total,
                    None => complete = false,
                }
            }
            Ok(meta) if meta.is_dir() => {
                if immediate && files_only {
                    complete = false;
                }
                let (nested, valid) = children(&path, meter);
                complete &= valid;
                pending.extend(nested.into_iter().map(|p| (p, false)));
            }
            _ => complete = false,
        }
    }
    (count, bytes, complete)
}

impl LocalApi {
    pub(crate) fn recovery_quota_inventory(&self) -> Result<Value, String> {
        if regular(&self.app_data_dir) != Ok(true) {
            return Err("Almacén de recuperación no disponible".into());
        }
        let mut meter = Meter {
            started: Instant::now(),
            entries: 0,
            limited: false,
        };
        let mut projects = BTreeMap::new();
        let mapping = match self.registry_checked() {
            Ok(registry) => {
                for project in registry["projects"].as_array().into_iter().flatten() {
                    if let (Some(id),Some(name))=(project["id"].as_str(),project["name"].as_str()) {
                        projects.insert(sha256_hex(id.as_bytes()),(id.to_owned(),name.to_owned()));
                    }
                }
                true
            }
            Err(_) => false,
        };
        let mut rows = vec![];
        let mut complete = true;
        for (family, grouped, files_only, max_entries, max_bytes, retains_ids) in [
            (
                "conflict-attempts",
                false,
                true,
                CONFLICT_RECORDS,
                CONFLICT_BYTES,
                true,
            ),
            (
                "mixed-reviews",
                true,
                true,
                MIXED_RECORDS,
                MIXED_BYTES,
                true,
            ),
            (
                "mixed-applications",
                true,
                false,
                APPLICATION_RECORDS,
                APPLICATION_BYTES,
                true,
            ),
            ("graph-joins", true, true, JOIN_RECORDS, JOIN_BYTES, true),
            (
                "project-templates",
                false,
                false,
                TEMPLATE_RECORDS,
                TEMPLATE_BYTES,
                false,
            ),
            ("history-restores",true,false,64,256*1024*1024,true),
            ("ai-changes",false,true,2048,128*1024*1024,true),
            ("document-replacements",true,true,64,128*1024*1024,true),
            ("meeting-minutes",true,true,64,128*1024*1024,true),
            ("handwritten-ocr",false,true,64,64*1024*1024,true),
            ("project-template-catalogues",false,true,2048,64*1024*1024,true),
            ("scheduled-backups",true,false,65,10*1024*1024*1024,true),
            ("export-batches",false,false,EXPORT_BATCH_RECORDS,EXPORT_BATCH_BYTES,true),
            (
                "project-transfers",
                false,
                false,
                TRANSFER_RECORDS,
                TRANSFER_BYTES,
                false,
            ),
        ] {
            let root = self.app_data_dir.join(family);
            let (scopes, valid) = if grouped {
                children(&root, &mut meter)
            } else {
                (vec![root.clone()], true)
            };
            complete &= valid;
            for path in scopes {
                if rows.len() >= MAX_SCOPES || meter.limited {
                    complete = false;
                    meter.limited = true;
                    break;
                }
                let scope = if grouped {
                    path.file_name()
                        .unwrap_or_default()
                        .to_string_lossy()
                        .into_owned()
                } else {
                    String::new()
                };
                let project = if grouped { projects.get(&scope) } else { None };
                let (entries, bytes, valid) = occupancy(&path, files_only, &mut meter);
                complete &= valid;
                // A partial count is a lower bound. It never certifies that creation is available.
                let full = entries >= max_entries || bytes >= max_bytes;
                rows.push(json!({"id":sha256_hex(format!("quota/{family}/{scope}").as_bytes()),"family":family,"scope":if grouped{"project"}else{"profile"},"projectId":project.map(|p|&p.0),"projectName":project.map(|p|&p.1),"entries":entries,"bytes":bytes,"maxEntries":max_entries,"maxBytes":max_bytes,"complete":valid,"status":if full{"full"}else if valid{"observed"}else{"partial"},"contentsVerified":false,"idsRetainedOnPayloadRetirement":retains_ids}));
            }
        }
        rows.sort_by(|a, b| {
            a["family"]
                .as_str()
                .cmp(&b["family"].as_str())
                .then_with(|| a["id"].as_str().cmp(&b["id"].as_str()))
        });
        Ok(
            json!({"schemaVersion":1,"checkedAt":knownext_core::now_iso(),"scope":"known-admission-scopes-metadata","complete":complete&&!meter.limited,"limited":meter.limited,"projectMappingComplete":mapping,"items":rows,"cleanupAvailable":false,"limits":{"entries":MAX_ENTRIES,"scopes":MAX_SCOPES,"milliseconds":2000}}),
        )
    }
}
