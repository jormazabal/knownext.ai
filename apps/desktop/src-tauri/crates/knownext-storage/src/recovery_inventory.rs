//! Metadata inventory and optional admission budget. Never derives deletion or restore authority.
use super::*;
use std::{
    fs,
    io::Read,
    sync::{Mutex, MutexGuard},
    time::Instant,
};
const FAMILIES: [&str; 30] = [
    "recovery-vault",
    "recovery-closures",
    "drafts",
    "drafts-review",
    "conflict-attempts",
    "conflict-retirements",
    "mixed-reviews",
    "mixed-applications",
    "graph-joins",
    "state-recovery",
    "versions",
    "recovery-archive",
    "migrations",
    "file-batches",
    "retention-generations",
    "sessions-recovery",
    "settings-recovery",
    "ai/usage-migrations",
    "project-transfers",
    "export-batches",
    "history-restores",
    "ai-changes",
    "document-replacements",
    "meeting-minutes",
    "handwritten-ocr",
    "project-template-catalogues",
    "scheduled-backups",
    "project-templates",
    "recordings",
    "recordings-dev",
];
const MAX_ENTRIES: usize = 50_000;
const MAX_ROWS: usize = 2_000;
const MAX_BYTES: u64 = 9_007_199_254_740_991;
static ADMISSION: Mutex<()> = Mutex::new(());
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Policy {
    schema_version: u8,
    generation: u64,
    enabled: bool,
    max_bytes: u64,
}
impl Default for Policy {
    fn default() -> Self {
        Self {
            schema_version: 1,
            generation: 0,
            enabled: false,
            max_bytes: 1024 * 1024 * 1024,
        }
    }
}
fn directory(path: &Path) -> Result<bool, String> {
    match fs::symlink_metadata(path) {
        Ok(m) if m.is_dir() && !batch::linked(&m) => Ok(true),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(false),
        _ => Err("El inventario contiene una carpeta no regular; se conserva".into()),
    }
}
fn policy(api: &LocalApi) -> Result<(Policy, String), String> {
    if !directory(&api.app_data_dir)? {
        return Err("Almacén local no disponible".into());
    }
    let path = api.app_data_dir.join("recovery-policy.json");
    let meta = match fs::symlink_metadata(&path) {
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            return Ok((Policy::default(), sha256_hex(b"recovery-policy-default-v1")))
        }
        Ok(m) => m,
        Err(_) => return Err("No se puede consultar el presupuesto".into()),
    };
    if !meta.is_file() || batch::linked(&meta) || meta.len() > 4096 {
        return Err("Política no regular o fuera de límites; se conserva".into());
    }
    let mut raw = vec![];
    fs::File::open(path)
        .map_err(|_| "No se puede abrir la política")?
        .take(4097)
        .read_to_end(&mut raw)
        .map_err(|_| "No se pudo leer la política")?;
    let p: Policy = serde_json::from_slice(&raw)
        .map_err(|_| "Formato de presupuesto desconocido; se conserva sin sustituir")?;
    if raw.len() > 4096
        || p.schema_version != 1
        || p.generation > MAX_BYTES
        || !(16 * 1024 * 1024..=8 * 1024 * 1024 * 1024).contains(&p.max_bytes)
    {
        return Err("Política no compatible; se conserva sin sustituir".into());
    }
    Ok((p, sha256_hex(&raw)))
}
fn coordination(name: &str) -> bool {
    matches!(
        name.to_ascii_lowercase().as_str(),
        "owner.lock" | "runtime-owner.lock" | "capture.lock"
    )
}
#[derive(Default)]
struct Scan {
    entries: usize,
    bytes: u64,
    files: usize,
    links: usize,
    unavailable: usize,
    limited: bool,
    rows: Vec<Value>,
}
impl Scan {
    fn complete(&self) -> bool {
        !self.limited && self.links == 0 && self.unavailable == 0
    }
}
fn tree(path: &Path, canonical: &Path, row: &mut Value, scan: &mut Scan, start: Instant) {
    let mut pending = vec![path.to_path_buf()];
    let mut bytes = 0u64;
    let mut files = 0;
    let links = scan.links;
    let unavailable = scan.unavailable;
    while let Some(path) = pending.pop() {
        if scan.entries >= MAX_ENTRIES || start.elapsed() > Duration::from_secs(3) {
            scan.limited = true;
            break;
        }
        scan.entries += 1;
        if !path.canonicalize().is_ok_and(|p| p.starts_with(canonical)) {
            scan.unavailable += 1;
            continue;
        }
        let m = match fs::symlink_metadata(&path) {
            Ok(m) => m,
            Err(_) => {
                scan.unavailable += 1;
                continue;
            }
        };
        if batch::linked(&m) {
            scan.links += 1;
            continue;
        }
        if m.is_file() {
            if scan
                .bytes
                .checked_add(m.len())
                .is_none_or(|n| n > MAX_BYTES)
            {
                scan.limited = true;
                break;
            }
            scan.bytes += m.len();
            scan.files += 1;
            bytes += m.len();
            files += 1;
        } else if m.is_dir() {
            match fs::read_dir(&path) {
                Ok(entries) => {
                    for entry in entries {
                        if scan.entries + pending.len() >= MAX_ENTRIES
                            || start.elapsed() > Duration::from_secs(3)
                        {
                            scan.limited = true;
                            break;
                        }
                        match entry {
                            Ok(e) if !coordination(&e.file_name().to_string_lossy()) => {
                                pending.push(e.path())
                            }
                            Ok(_) => (),
                            Err(_) => scan.unavailable += 1,
                        }
                    }
                }
                Err(_) => scan.unavailable += 1,
            }
        } else {
            scan.unavailable += 1
        }
    }
    row["bytes"] = json!(bytes);
    row["files"] = json!(files);
    row["complete"] =
        json!(!scan.limited && links == scan.links && unavailable == scan.unavailable);
}
fn scan(api: &LocalApi) -> Result<(Scan, bool), String> {
    if !directory(&api.app_data_dir)? {
        return Err("Almacén no disponible".into());
    }
    let mut projects = BTreeMap::new();
    let mut mapping_complete = true;
    let mut locations = vec![];
    match api.registry_checked() {
        Ok(registry) => {
            for p in registry["projects"].as_array().into_iter().flatten() {
                if let (Some(id), Some(name)) = (p["id"].as_str(), p["name"].as_str()) {
                    projects.insert(sha256_hex(id.as_bytes()), (id.to_owned(), name.to_owned()));
                    if let Some(path) = p["folderPath"].as_str() {
                        locations.push((
                            id.to_owned(),
                            name.to_owned(),
                            PathBuf::from(path),
                            "registered",
                        ));
                    } else {
                        mapping_complete = false;
                    }
                }
            }
        }
        Err(_) => mapping_complete = false,
    }
    match api.retired_projects() {
        Ok(catalog) => {
            for entry in catalog["entries"].as_array().into_iter().flatten() {
                if let (Some(id), Some(name), Some(path)) = (
                    entry["id"].as_str(),
                    entry["name"].as_str(),
                    entry["folderPath"].as_str(),
                ) {
                    locations.push((
                        id.into(),
                        name.into(),
                        PathBuf::from(path),
                        if entry["registered"] == true {
                            "retained"
                        } else {
                            "retired"
                        },
                    ));
                } else {
                    mapping_complete = false;
                }
            }
        }
        Err(_) => mapping_complete = false,
    }
    let canonical = api
        .app_data_dir
        .canonicalize()
        .map_err(|_| "No se puede comprobar el almacén")?;
    let start = Instant::now();
    let mut s = Scan::default();
    if !mapping_complete {
        s.unavailable += 1;
    }
    'families: for family in FAMILIES {
        let root = api.app_data_dir.join(family);
        match directory(&root) {
            Ok(false) => continue,
            Err(_) => {
                s.unavailable += 1;
                continue;
            }
            _ => (),
        }
        if !root.canonicalize().is_ok_and(|p| p.starts_with(&canonical)) {
            s.unavailable += 1;
            continue;
        }
        let groups = match fs::read_dir(&root) {
            Ok(e) => e,
            Err(_) => {
                s.unavailable += 1;
                continue;
            }
        };
        for entry in groups {
            if start.elapsed() > Duration::from_secs(3)
                || s.entries >= MAX_ENTRIES
                || s.rows.len() >= MAX_ROWS
            {
                s.limited = true;
                break 'families;
            }
            s.entries += 1;
            let entry = match entry {
                Ok(e) => e,
                Err(_) => {
                    s.unavailable += 1;
                    continue;
                }
            };
            let name = entry.file_name().to_string_lossy().into_owned();
            if coordination(&name) {
                continue;
            }
            let grouped = matches!(family, "scheduled-backups" | "mixed-applications" | "mixed-reviews" | "history-restores" | "document-replacements" | "meeting-minutes");
            let children: Box<dyn Iterator<Item = std::io::Result<PathBuf>>> =
                if grouped && directory(&entry.path()).unwrap_or(false) {
                    match fs::read_dir(entry.path()) {
                        Ok(entries) => Box::new(entries.map(|e| e.map(|v| v.path()))),
                        Err(_) => {
                            s.unavailable += 1;
                            continue;
                        }
                    }
                } else {
                    Box::new(std::iter::once(Ok(entry.path())))
                };
            for child in children {
                if s.rows.len() >= MAX_ROWS
                    || s.entries >= MAX_ENTRIES
                    || start.elapsed() > Duration::from_secs(3)
                {
                    s.limited = true;
                    break 'families;
                }
                let child = match child {
                    Ok(v) => v,
                    Err(_) => {
                        s.unavailable += 1;
                        continue;
                    }
                };
                let leaf = child
                    .file_name()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .into_owned();
                if coordination(&leaf) {
                    continue;
                }
                let project = if grouped { projects.get(&name) } else { None };
                let plan = leaf
                    .strip_prefix("mixed-")
                    .filter(|id| id.len() == 32 && id.bytes().all(|b| b.is_ascii_hexdigit()))
                    .map(|_| leaf.clone());
                let extraction = family == "mixed-applications"
                    && project.is_some()
                    && plan.is_some()
                    && directory(&child).unwrap_or(false);
                let relative = child
                    .strip_prefix(&api.app_data_dir)
                    .map_err(|_| "Entrada fuera del almacén")?;
                let mut row = json!({"id":sha256_hex(format!("{relative:?}").as_bytes()),"family":family,"name":leaf,"projectId":project.map(|p|&p.0),"projectName":project.map(|p|&p.1),"planId":if extraction{plan}else{None},"canReviewKnownBytes":extraction,"contentsVerified":false});
                tree(&child, &canonical, &mut row, &mut s, start);
                s.rows.push(row);
            }
        }
    }
    // Known project-local stores are measured without interpreting owner records or payloads.
    // A shared/overlapping registered location contributes logical bytes only once.
    let mut measured: Vec<PathBuf> = FAMILIES
        .iter()
        .filter_map(|family| {
            let path = api.app_data_dir.join(family);
            if directory(&path).ok() == Some(true) {
                path.canonicalize()
                    .ok()
                    .filter(|p| p.starts_with(&canonical))
            } else {
                None
            }
        })
        .collect();
    let mut candidates = vec![];
    'projects: for (project_id, project_name, root, project_state) in locations {
        if start.elapsed() > Duration::from_secs(3)
            || s.entries >= MAX_ENTRIES
            || candidates.len() >= MAX_ROWS
        {
            s.limited = true;
            break;
        }
        s.entries += 1;
        let project_root = match directory(&root).and_then(|exists| {
            if exists && root.is_absolute() {
                root.canonicalize()
                    .map_err(|_| "Ubicación de proyecto no comprobable".into())
            } else {
                Err("Ubicación de proyecto no disponible".into())
            }
        }) {
            Ok(root) => root,
            Err(_) => {
                s.unavailable += 1;
                continue;
            }
        };
        for (folder, family, title) in [
            (".knownext-trash", "project-trash", "Papelera local"),
            (".knownext-history-import", "project-history-import", "Preparación de historial portable"),
            (
                ".knownext-history-copies",
                "project-history-copies",
                "Copias históricas",
            ),
            (
                ".knownext-mixed-work",
                "project-mixed-work",
                "Preparación de archivos",
            ),
        ] {
            if start.elapsed() > Duration::from_secs(3)
                || s.entries >= MAX_ENTRIES
                || candidates.len() >= MAX_ROWS
            {
                s.limited = true;
                break 'projects;
            }
            let path = project_root.join(folder);
            match directory(&path) {
                Ok(false) => continue,
                Err(_) => {
                    s.unavailable += 1;
                    continue;
                }
                _ => (),
            }
            let resolved = match path.canonicalize() {
                Ok(value) if value.starts_with(&project_root) => value,
                _ => {
                    s.unavailable += 1;
                    continue;
                }
            };
            candidates.push((
                resolved,
                project_root.clone(),
                project_id.clone(),
                project_name.clone(),
                folder,
                family,
                title,
                project_state,
            ));
        }
    }
    // Parent stores precede nested aliases, independently of registry ordering.
    candidates.sort_by(|a, b| {
        a.0.components()
            .count()
            .cmp(&b.0.components().count())
            .then_with(|| a.0.cmp(&b.0))
            .then_with(|| {
                (if a.7 == "registered" { 0 } else { 1 })
                    .cmp(&(if b.7 == "registered" { 0 } else { 1 }))
            })
            .then_with(|| a.2.cmp(&b.2))
    });
    for (path, project_root, project_id, project_name, folder, family, title, project_state) in
        candidates
    {
        if start.elapsed() > Duration::from_secs(3)
            || s.entries >= MAX_ENTRIES
            || s.rows.len() >= MAX_ROWS
        {
            s.limited = true;
            break;
        }
        if measured.iter().any(|previous| path.starts_with(previous)) {
            continue;
        }
        measured.push(path.clone());
        let mut row = json!({"id":sha256_hex(format!("project-store/{project_id}/{folder}/{path:?}").as_bytes()),"family":family,"name":title,"projectId":project_id,"projectName":project_name,"projectState":project_state,"planId":null,"canReviewKnownBytes":false,"contentsVerified":false});
        tree(&path, &project_root, &mut row, &mut s, start);
        s.rows.push(row);
    }
    s.rows.sort_by(|a, b| {
        a["family"]
            .as_str()
            .cmp(&b["family"].as_str())
            .then_with(|| a["name"].as_str().cmp(&b["name"].as_str()))
            .then_with(|| a["id"].as_str().cmp(&b["id"].as_str()))
    });
    Ok((s, mapping_complete))
}
// Held only across local preparation publication. Editing/continuation never calls this gate.
pub(crate) fn admit(api: &LocalApi, additional: u64) -> Result<MutexGuard<'static, ()>, String> {
    let guard = ADMISSION
        .lock()
        .map_err(|_| "No se pudo revisar el presupuesto")?;
    let (p, _) = policy(api)?;
    if p.enabled {
        let (s, _) = scan(api)?;
        if !s.complete() {
            return Err("No se pudo medir todo el almacén de recuperación. Revisa su cobertura antes de iniciar otra preparación; las copias y el trabajo abierto permanecen".into());
        }
        if s.bytes
            .checked_add(additional)
            .is_none_or(|bytes| bytes > p.max_bytes)
        {
            return Err("El presupuesto de nuevas preparaciones no tiene espacio suficiente. Revisa las copias o amplía el presupuesto; no se ha retirado contenido".into());
        }
    }
    Ok(guard)
}
impl LocalApi {
    pub(super) fn recovery_storage_inventory(&self) -> Result<Value, String> {
        let (s, mapping) = scan(self)?;
        let complete = s.complete();
        let p = match policy(self) {
            Ok((p, revision)) => {
                json!({"supported":true,"revision":revision,"enabled":p.enabled,"maxBytes":p.max_bytes})
            }
            Err(error) => json!({"supported":false,"message":error}),
        };
        Ok(
            json!({"schemaVersion":1,"id":"recovery-storage-inventory","checkedAt":knownext_core::now_iso(),"bytes":s.bytes,"files":s.files,"complete":complete,"limited":s.limited,"skippedLinks":s.links,"unavailable":s.unavailable,"projectMappingComplete":mapping,"items":s.rows,"policy":p,"scope":"known-recovery-families-metadata","cleanupAvailable":false,"limits":{"entries":MAX_ENTRIES,"rows":MAX_ROWS,"milliseconds":3000}}),
        )
    }
    pub(super) fn update_recovery_budget(&self, body: Value) -> Result<Value, String> {
        #[derive(Deserialize)]
        #[serde(rename_all = "camelCase", deny_unknown_fields)]
        struct Request {
            revision: String,
            enabled: bool,
            max_bytes: u64,
        }
        let request: Request =
            serde_json::from_value(body).map_err(|_| "Revisa el presupuesto antes de cambiarlo")?;
        if !(16 * 1024 * 1024..=8 * 1024 * 1024 * 1024).contains(&request.max_bytes) {
            return Err("Presupuesto permitido: entre16MiB y8GiB".into());
        }
        {
            let _guard = ADMISSION
                .lock()
                .map_err(|_| "No se pudo reservar el cambio de presupuesto")?;
            let (previous, revision) = policy(self)?;
            if request.revision != revision {
                return Err("El presupuesto cambió. Consulta de nuevo antes de modificarlo".into());
            }
            let p = Policy {
                schema_version: 1,
                generation: previous
                    .generation
                    .checked_add(1)
                    .filter(|v| *v <= MAX_BYTES)
                    .ok_or("No se puede avanzar esta revisión")?,
                enabled: request.enabled,
                max_bytes: request.max_bytes,
            };
            let path = self.app_data_dir.join("recovery-policy.json");
            let raw = serde_json::to_vec(&p).map_err(|_| "No se pudo preparar el presupuesto")?;
            atomic_io::write(&path, &raw).map_err(|_| {
                "No se confirmó el presupuesto. Consulta su estado antes de repetir"
            })?;
        }
        self.recovery_storage_inventory()
    }
}

impl LocalApi { pub fn admit_recording_start(&self)->Result<std::sync::MutexGuard<'static,()>,String>{admit(self,32*1024*1024)} }
