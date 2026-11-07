//! Bounded, metadata-only accounting. No cleanup authority is derived from sizes.
use super::*;
use std::{fs, time::Instant};

const CATEGORIES: [&str; 9] = [
    "projects",
    "recovery",
    "recordings",
    "ai-work",
    "templates",
    "preparations",
    "indexes",
    "preferences",
    "other",
];
const MAX_LOCATIONS: usize = 256;
const MAX_SAFE_BYTES: u64 = 9_007_199_254_740_991;

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
struct Group {
    id: &'static str,
    files: usize,
    logical_bytes: u64,
}

struct Limits {
    entries: usize,
    duration: Duration,
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
struct Measurement {
    groups: Vec<Group>,
    logical_bytes: u64,
    files: usize,
    visited_entries: usize,
    skipped_links: usize,
    unreadable_entries: usize,
    limited: bool,
    complete: bool,
    duration_ms: u128,
}

fn category(relative: &Path) -> usize {
    let parts: Vec<_> = relative.components().map(|p| p.as_os_str()).collect();
    if parts.iter().any(|p| *p == ".knownext-trash") {
        return 1;
    }
    if parts.iter().any(|p|p.to_str().is_some_and(|part|part.starts_with(".knownext-history-copies")||part==".knownext-mixed-work")){return 1;}
    if parts.iter().any(|p| *p == "sessions-recovery" || *p == "settings-recovery") { return 1; }
    let first = parts.first().and_then(|p| p.to_str()).unwrap_or("");
    if first=="ai"&&parts.get(1).and_then(|part|part.to_str())==Some("usage-migrations"){return 1;}
    if first=="ai"&&parts.get(1).and_then(|part|part.to_str())==Some("usage-policy.json"){return 7;}
    match first {
        "projects" | "notes.json" | "history-groups" | "history-milestones" | "history-views" => 0,
        "scheduled-backups" | "project-template-catalogues" | "meeting-minutes" | "handwritten-ocr" | "history-restores" | "ai-changes" | "document-replacements" | "retention-generations" | "mixed-applications" | "mixed-reviews" | "graph-joins" | "conflict-attempts" | "file-batches" | "drafts" | "drafts-review" | "state-recovery" | "versions" | "recovery-archive" | "migrations" => 1,
        "recordings" | "recordings-dev" => 2,
        "ai" | "ai-results" | "ai-context" | "ai-research" => 3,
        "document-templates" | "document-templates-retired" | "project-templates" => 4,
        "project-transfers" | "export-batches" => 5,
        "ai-index" | "image-index" | "previews" => 6,
        "config.json"
        | "projects.json"
        | "retired-projects.json"
        | "export-template.json"
        | "export-profiles.json"
        | "credentials.json"
        | "auth.json"
        | "github-device.json" => 7,
        _ => 8,
    }
}

fn regular_directory(path: &Path, canonical_root: &Path) -> bool {
    fs::symlink_metadata(path).is_ok_and(|m| m.is_dir() && !batch::linked(&m))
        && path
            .canonicalize()
            .is_ok_and(|p| p.starts_with(canonical_root))
}

fn measure(root: &Path, limits: Limits) -> Result<Measurement, String> {
    let meta = fs::symlink_metadata(root).map_err(|_| "No se puede consultar el almacén local")?;
    if !meta.is_dir() || batch::linked(&meta) {
        return Err("El almacén debe ser una carpeta regular; no se siguen enlaces".into());
    }
    let canonical_root = root
        .canonicalize()
        .map_err(|_| "No se puede verificar el almacén local")?;
    let started = Instant::now();
    let mut result = Measurement {
        groups: CATEGORIES
            .iter()
            .map(|id| Group {
                id,
                ..Group::default()
            })
            .collect(),
        ..Measurement::default()
    };
    let mut pending = vec![root.to_path_buf()];
    'scan: while let Some(directory) = pending.pop() {
        if started.elapsed() >= limits.duration {
            result.limited = true;
            break;
        }
        if !regular_directory(&directory, &canonical_root) {
            result.unreadable_entries += 1;
            continue;
        }
        let entries = match fs::read_dir(&directory) {
            Ok(entries) => entries,
            Err(_) => {
                result.unreadable_entries += 1;
                continue;
            }
        };
        for entry in entries {
            if result.visited_entries >= limits.entries || started.elapsed() >= limits.duration {
                result.limited = true;
                break 'scan;
            }
            result.visited_entries += 1;
            let entry = match entry {
                Ok(entry) => entry,
                Err(_) => {
                    result.unreadable_entries += 1;
                    continue;
                }
            };
            let metadata = match fs::symlink_metadata(entry.path()) {
                Ok(metadata) => metadata,
                Err(_) => {
                    result.unreadable_entries += 1;
                    continue;
                }
            };
            if batch::linked(&metadata) {
                result.skipped_links += 1;
            } else if metadata.is_dir() {
                pending.push(entry.path());
            } else if metadata.is_file() {
                let Some(total) = result
                    .logical_bytes
                    .checked_add(metadata.len())
                    .filter(|v| *v <= MAX_SAFE_BYTES)
                else {
                    result.limited = true;
                    break 'scan;
                };
                let relative = entry.path();
                let group = &mut result.groups[category(
                    relative
                        .strip_prefix(root)
                        .map_err(|_| "Ubicación fuera del almacén")?,
                )];
                group.files += 1;
                group.logical_bytes += metadata.len();
                result.files += 1;
                result.logical_bytes = total;
            } else {
                result.unreadable_entries += 1;
            }
        }
    }
    result.complete =
        !result.limited && result.skipped_links == 0 && result.unreadable_entries == 0;
    result.duration_ms = started.elapsed().as_millis();
    Ok(result)
}

impl LocalApi {
    pub(super) fn storage_usage(&self) -> Result<Value, String> {
        let measurement = measure(
            &self.app_data_dir,
            Limits {
                entries: 10_000,
                duration: Duration::from_secs(2),
            },
        )?;
        let mut locations = Vec::new();
        let mut locations_complete = true;
        let mut warnings = Vec::new();
        match self.registry_checked() {
            Ok(registry) => {
                for project in registry["projects"].as_array().unwrap() {
                    if locations.len() >= MAX_LOCATIONS {
                        locations_complete = false;
                        break;
                    }
                    locations.push(json!({"id":project["id"],"name":project["name"],"folderPath":project["folderPath"],"state":"registered"}));
                }
                match self.retired_projects() {
                    Ok(catalog) => {
                        for entry in catalog["entries"].as_array().unwrap() {
                            if entry["registered"] == true {
                                continue;
                            }
                            if locations.len() >= MAX_LOCATIONS {
                                locations_complete = false;
                                break;
                            }
                            locations.push(json!({"id":entry["id"],"name":entry["name"],"folderPath":entry["folderPath"],"state":"retired"}));
                        }
                    }
                    Err(_) => {
                        locations_complete = false;
                        warnings.push("retired-catalog-unavailable");
                    }
                }
            }
            Err(_) => {
                locations_complete = false;
                warnings.push("project-registry-unavailable");
            }
        }
        if !locations_complete && warnings.is_empty() {
            warnings.push("location-limit");
        }
        Ok(json!({
            "schemaVersion":1,"id":"local-storage-usage","checkedAt":knownext_core::now_iso(),
            "scope":"app-data-regular-files","appDataPath":self.app_data_dir.to_string_lossy(),
            "measurement":measurement,"locations":locations,"locationsComplete":locations_complete,
            "externalRootsMeasured":false,"cleanupAvailable":false,"warnings":warnings,
            "limits":{"entries":10_000,"milliseconds":2000,"locations":MAX_LOCATIONS},
        }))
    }
}

#[cfg(test)]
mod tests;
