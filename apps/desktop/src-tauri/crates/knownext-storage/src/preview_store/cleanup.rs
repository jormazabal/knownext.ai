//! Explicit cleanup of known preview receipts, never their source documents.
use super::*;
use std::sync::Mutex;

static CLEANUP: Mutex<()> = Mutex::new(());
const MAX_ENTRIES: usize = 256;
const MAX_SCAN_BYTES: u64 = 16 * 1024 * 1024;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Selection {
    entries: Vec<Selected>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Selected {
    id: String,
    revision: String,
}

struct Candidate {
    descriptor: Preview,
    revision: String,
    bytes: u64,
}

impl LocalApi {
    fn cleanup_receipt(&self, id: &str, remaining: u64) -> Result<Candidate, String> {
        if !preview_id(id) {
            return Err("Identidad no compatible; se conserva".into());
        }
        directory(&self.app_data_dir)?;
        directory(&self.previews_dir())?;
        let path = self.previews_dir().join(format!("{id}.json"));
        let metadata = fs::symlink_metadata(&path).map_err(|_| "Recibo no disponible")?;
        if !metadata.is_file()
            || batch::linked(&metadata)
            || metadata.permissions().readonly()
            || metadata.len() > MAX_BYTES
            || metadata.len() > remaining
        {
            return Err("Recibo no regular, protegido o fuera de límites; se conserva".into());
        }
        let mut bytes = vec![];
        fs::File::open(&path)
            .map_err(|_| "No se puede abrir el recibo")?
            .take(metadata.len() + 1)
            .read_to_end(&mut bytes)
            .map_err(|_| "No se puede leer el recibo")?;
        if bytes.len() as u64 != metadata.len() {
            return Err("El recibo cambió durante la lectura; se conserva".into());
        }
        let descriptor: Preview =
            serde_json::from_slice(&bytes).map_err(|_| "Formato no compatible; se conserva")?;
        let raw: Value = serde_json::from_slice(&bytes).map_err(|_| "Formato no compatible")?;
        if raw
            .get("schemaVersion")
            .is_some_and(|v| v.as_u64() != Some(1))
        {
            return Err("Versión no compatible; se conserva".into());
        }
        self.registered_project_root(&descriptor.project_id)
            .map_err(|_| "Proyecto no registrado; se conserva")?;
        self.validate_preview(&descriptor.project_id, id, &descriptor)?;
        Ok(Candidate {
            descriptor,
            revision: format!("{:x}", Sha256::digest(&bytes)),
            bytes: bytes.len() as u64,
        })
    }

    pub(crate) fn preview_cleanup_inventory(&self) -> Result<Value, String> {
        let _guard = CLEANUP
            .lock()
            .map_err(|_| "La revisión de vistas no está disponible")?;
        directory(&self.app_data_dir)?;
        let folder = self.previews_dir();
        let mut entries = vec![];
        let mut skipped = 0usize;
        let mut visited = 0usize;
        let mut scanned_bytes = 0u64;
        let mut limited = false;
        let started = std::time::Instant::now();
        let registry = self.registry_checked().ok();
        match fs::symlink_metadata(&folder) {
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => (),
            Err(_) => return Err("No se puede consultar la carpeta de vistas".into()),
            Ok(_) => {
                directory(&folder)?;
                for entry in fs::read_dir(&folder).map_err(|_| "No se pueden revisar las vistas")? {
                    if visited >= MAX_ENTRIES
                        || scanned_bytes >= MAX_SCAN_BYTES
                        || started.elapsed() > Duration::from_secs(2)
                    {
                        limited = true;
                        break;
                    }
                    visited += 1;
                    let entry = match entry {
                        Ok(e) => e,
                        Err(_) => {
                            skipped += 1;
                            continue;
                        }
                    };
                    let path = entry.path();
                    // Charge all regular receipt bytes, including unsupported formats.
                    let size = fs::symlink_metadata(&path)
                        .ok()
                        .filter(|m| m.is_file() && !batch::linked(m))
                        .map(|m| m.len())
                        .unwrap_or(0);
                    if size > MAX_SCAN_BYTES - scanned_bytes {
                        skipped += 1;
                        limited = true;
                        continue;
                    }
                    let candidate = path
                        .extension()
                        .filter(|e| *e == "json")
                        .and_then(|_| path.file_stem())
                        .and_then(|s| s.to_str())
                        .and_then(|id| self.cleanup_receipt(id, size).ok());
                    scanned_bytes += size;
                    match candidate {
                        Some(c) => {
                            let project_name = registry
                                .as_ref()
                                .and_then(|r| r["projects"].as_array())
                                .and_then(|projects| {
                                    projects.iter().find(|p| p["id"] == c.descriptor.project_id)
                                })
                                .and_then(|p| p["name"].as_str())
                                .unwrap_or("Proyecto");
                            entries.push(json!({"id":c.descriptor.id,"revision":c.revision,"projectId":c.descriptor.project_id,"projectName":project_name,"path":c.descriptor.path,"name":c.descriptor.name,"bytes":c.bytes,"generatedAt":c.descriptor.generated_at}));
                        }
                        None => skipped += 1,
                    }
                }
            }
        }
        entries.sort_by(|a, b| {
            a["projectId"]
                .as_str()
                .cmp(&b["projectId"].as_str())
                .then(a["path"].as_str().cmp(&b["path"].as_str()))
                .then(a["id"].as_str().cmp(&b["id"].as_str()))
        });
        Ok(
            json!({"schemaVersion":1,"id":"preview-receipt-cleanup","checkedAt":knownext_core::now_iso(),"scope":"preview-receipts-only","entries":entries,"skipped":skipped,"limited":limited,"limits":{"entries":MAX_ENTRIES,"bytes":MAX_SCAN_BYTES,"milliseconds":2000,"selection":64}}),
        )
    }

    pub(crate) fn cleanup_preview_receipts(&self, body: Value) -> Result<Value, String> {
        let selection: Selection =
            serde_json::from_value(body).map_err(|_| "Selección de vistas no válida")?;
        let mut ids = BTreeSet::new();
        if selection.entries.is_empty()
            || selection.entries.len() > 64
            || selection.entries.iter().any(|e| {
                !preview_id(&e.id)
                    || !ids.insert(e.id.clone())
                    || e.revision.len() != 64
                    || !e.revision.bytes().all(|b| b.is_ascii_hexdigit())
            })
        {
            return Err("Selecciona entre 1 y 64 recibos distintos con su revisión".into());
        }
        let _guard = CLEANUP
            .lock()
            .map_err(|_| "La limpieza de vistas no está disponible")?;
        let mut outcomes = vec![];
        let mut deleted_bytes = 0u64;
        let mut read_bytes = 0u64;
        let started = std::time::Instant::now();
        for entry in selection.entries {
            let status = if read_bytes >= MAX_SCAN_BYTES
                || started.elapsed() > Duration::from_secs(2)
            {
                "budget-exceeded"
            } else {
                let size =
                    fs::symlink_metadata(self.previews_dir().join(format!("{}.json", entry.id)))
                        .ok()
                        .filter(|m| m.is_file() && !batch::linked(m))
                        .map(|m| m.len())
                        .unwrap_or(0);
                let allowance = size.min(MAX_SCAN_BYTES - read_bytes);
                read_bytes = read_bytes.saturating_add(allowance);
                match self.cleanup_receipt(&entry.id, allowance) {
                    Ok(candidate) => {
                        if candidate.revision != entry.revision {
                            "changed"
                        } else if fs::remove_file(
                            self.previews_dir().join(format!("{}.json", entry.id)),
                        )
                        .is_ok()
                        {
                            deleted_bytes += candidate.bytes;
                            "deleted"
                        } else {
                            "preserved"
                        }
                    }
                    Err(_) => "unavailable",
                }
            };
            outcomes.push(json!({"id":entry.id,"status":status}));
        }
        Ok(
            json!({"id":knownext_core::compact_id("preview-cleanup"),"checkedAt":knownext_core::now_iso(),"scope":"preview-receipts-only","outcomes":outcomes,"deletedBytes":deleted_bytes}),
        )
    }
}
