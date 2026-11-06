//! Reviewed conservation. Identities are permanent; payload retirement requires a verified external backup.
mod retirement;
use super::*;
use std::{
    fs,
    io::{Cursor, Read, Write},
    time::Instant,
};
const VAULT: &str = "recovery-vault";
const CLOSURES: &str = "recovery-closures";
const LIMIT: u64 = 128 * 1024 * 1024;
const ENTRIES: usize = 10_000;
pub(crate) const FAMILIES: &[&str] = &[
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
    "project-templates",
    "recordings",
    "recordings-dev",
];
fn coordination(name: &str) -> bool {
    matches!(
        name.to_ascii_lowercase().as_str(),
        "owner.lock" | "runtime-owner.lock" | "capture.lock"
    )
}
fn folder(path: &Path) -> Result<bool, String> {
    match fs::symlink_metadata(path) {
        Ok(m) if m.is_dir() && !batch::linked(&m) => Ok(true),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(false),
        _ => Err("Carpeta de conservación no regular; se conserva sin modificar".into()),
    }
}
fn read(path: &Path, limit: u64) -> Result<Vec<u8>, String> {
    if path
        .components()
        .any(|p| coordination(&p.as_os_str().to_string_lossy()))
    {
        return Err("Archivo de coordinación protegido".into());
    }
    let m =
        fs::symlink_metadata(path).map_err(|_| "No se puede comprobar el archivo conservado")?;
    if !m.is_file() || batch::linked(&m) || m.len() > limit {
        return Err("Archivo no regular o fuera del límite; se conserva".into());
    }
    let mut bytes = vec![];
    fs::File::open(path)
        .map_err(|_| "No se puede abrir la copia")?
        .take(limit + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| "Lectura incompleta; se conserva la copia")?;
    if bytes.len() as u64 > limit {
        return Err("La copia creció fuera del límite".into());
    }
    Ok(bytes)
}
fn hash(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(|b| b.is_ascii_hexdigit())
}
fn safe_path(api: &LocalApi, path: &Path) -> Result<(), String> {
    let rel = path
        .strip_prefix(&api.app_data_dir)
        .map_err(|_| "La ubicación no pertenece al almacén")?;
    folder(&api.app_data_dir)?;
    let mut cursor = api.app_data_dir.clone();
    for part in rel.components() {
        let std::path::Component::Normal(name) = part else {
            return Err("Ubicación no compatible".into());
        };
        if coordination(&name.to_string_lossy()) {
            return Err("Archivo de coordinación protegido".into());
        }
        cursor.push(name);
        match fs::symlink_metadata(&cursor) {
            Ok(m) if batch::linked(&m) => {
                return Err("La ubicación contiene enlaces; se conserva".into())
            }
            Ok(_) => (),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => break,
            Err(_) => return Err("No se pudo comprobar la ubicación".into()),
        }
    }
    Ok(())
}
fn relative(api: &LocalApi, path: &Path) -> Option<String> {
    path.strip_prefix(&api.app_data_dir)
        .ok()
        .map(|p| p.to_string_lossy().replace('\\', "/"))
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct FileProof {
    path: String,
    bytes: u64,
    sha256: String,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Closure {
    format: u8,
    key: String,
    family: String,
    source: String,
    created_at: String,
    directory: bool,
    #[serde(default)]
    directories: Vec<String>,
    files: Vec<FileProof>,
}
fn closure_path(api: &LocalApi, key: &str) -> Result<PathBuf, String> {
    if !hash(key) {
        return Err("Identidad de conservación no válida".into());
    }
    folder(&api.app_data_dir)?;
    let base = api.app_data_dir.join(CLOSURES);
    folder(&base)?;
    Ok(base.join(format!("{key}.json")))
}
fn closure(api: &LocalApi, key: &str) -> Result<Option<Closure>, String> {
    let path = closure_path(api, key)?;
    safe_path(api, &path)?;
    match fs::symlink_metadata(&path) {
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(_) => {
            return Err("No se puede comprobar el cierre; no se modifica la identidad".into())
        }
        _ => (),
    }
    let value: Closure = serde_json::from_slice(&read(&path, 2 * 1024 * 1024)?)
        .map_err(|_| "Registro de cierre incompatible; se conserva")?;
    if value.directories.len() > ENTRIES
        || value.directories.iter().any(|p| {
            p.split('/').any(|s| {
                s.is_empty() || s == ".." || s.contains('\\') || s.contains(':') || coordination(s)
            })
        })
        || value.format != 1
        || value.key != key
        || sha256_hex(value.source.as_bytes()) != key
        || !FAMILIES.contains(&value.family.as_str())
        || value.files.len() > ENTRIES
        || !value.source.starts_with(&format!("{}/", value.family))
        || value
            .source
            .split('/')
            .any(|s| s == ".." || s.is_empty() || s.contains('\\') || s.contains(':'))
        || OffsetDateTime::parse(&value.created_at, &Rfc3339).is_err()
    {
        return Err("Identidad o formato de cierre incompatible; se conserva".into());
    }
    let mut names = BTreeSet::new();
    let mut total = 0u64;
    for file in &value.files {
        total = total
            .checked_add(file.bytes)
            .filter(|n| *n <= LIMIT)
            .ok_or("Contenido de conservación fuera de límites")?;
        if !hash(&file.sha256)
            || file.bytes > LIMIT
            || !names.insert(&file.path)
            || file.path.split('/').any(|p| {
                p == ".." || p.is_empty() || p.contains('\\') || p.contains(':') || coordination(p)
            })
        {
            return Err("Contenido de cierre no compatible; se conserva".into());
        }
    }
    Ok(Some(value))
}
pub(crate) fn is_closed(api: &LocalApi, path: &Path) -> Result<bool, String> {
    let Some(source) = relative(api, path) else {
        return Ok(false);
    };
    Ok(closure(api, &sha256_hex(source.as_bytes()))?.is_some())
}
/// Used before creation AND writes: an absent old filename is not a free identity.
pub(crate) fn ensure_open(api: &LocalApi, path: &Path) -> Result<(), String> {
    if !folder(&api.app_data_dir.join(CLOSURES))? {
        return Ok(());
    }
    let Some(mut rel) = relative(api, path) else {
        return Ok(());
    };
    if !FAMILIES
        .iter()
        .any(|family| rel.starts_with(&format!("{family}/")))
    {
        return Ok(());
    }
    loop {
        let key = sha256_hex(rel.as_bytes());
        if closure(api, &key)?.is_some() {
            return Err(format!("Este registro está cerrado y conservado en Recuperación integral ({}) y no se vuelve a ejecutar ni se reutiliza su identidad",&key[..8]));
        }
        if let Some((parent, _)) = rel.rsplit_once('/') {
            rel = parent.into();
        } else {
            break;
        }
    }
    Ok(())
}
fn candidates(api: &LocalApi, family: &str) -> Result<Vec<PathBuf>, String> {
    if !FAMILIES.contains(&family) {
        return Err("Familia de recuperación no compatible".into());
    }
    let root = api.app_data_dir.join(family);
    safe_path(api, &root)?;
    if !folder(&root)? {
        return Ok(vec![]);
    }
    let grouped = matches!(
        family,
        "mixed-reviews" | "mixed-applications" | "graph-joins"
    );
    let mut paths = vec![];
    let mut count = 0;
    let start = Instant::now();
    for entry in fs::read_dir(root).map_err(|_| "No se puede consultar la familia")? {
        count += 1;
        if count > ENTRIES || start.elapsed() > Duration::from_secs(3) {
            return Err(
                "La familia supera el presupuesto de consulta; conserva sus archivos".into(),
            );
        }
        let entry = entry.map_err(|_| "Entrada de recuperación no comprobable")?;
        if coordination(&entry.file_name().to_string_lossy()) {
            continue;
        }
        if grouped
            && fs::symlink_metadata(entry.path()).is_ok_and(|m| m.is_dir() && !batch::linked(&m))
        {
            for child in fs::read_dir(entry.path()).map_err(|_| "Grupo no comprobable")? {
                count += 1;
                if count > ENTRIES {
                    return Err("La familia supera10.000 entradas".into());
                }
                let child = child.map_err(|_| "Registro no comprobable")?;
                if !coordination(&child.file_name().to_string_lossy()) {
                    paths.push(child.path());
                }
            }
        } else {
            paths.push(entry.path());
        }
    }
    paths.sort();
    Ok(paths)
}
struct Snapshot {
    record: Closure,
    data: BTreeMap<String, Vec<u8>>,
    revision: String,
    source: PathBuf,
    archived: bool,
}
fn contents(path: &Path) -> Result<(bool, BTreeMap<String, Vec<u8>>, Vec<String>), String> {
    let meta = fs::symlink_metadata(path).map_err(|_| "No se puede revisar la copia")?;
    if batch::linked(&meta) {
        return Err("La copia es un enlace; se conserva sin abrir".into());
    }
    let directory = meta.is_dir();
    let mut directories = vec![];
    let mut data = BTreeMap::new();
    let mut pending = vec![(path.to_owned(), String::new())];
    let mut total = 0u64;
    let start = Instant::now();
    let mut count = 0;
    while let Some((path, rel)) = pending.pop() {
        count += 1;
        if count > ENTRIES || start.elapsed() > Duration::from_secs(15) {
            return Err(
                "La revisión supera su presupuesto; no se devuelve una copia parcial".into(),
            );
        }
        let m = fs::symlink_metadata(&path).map_err(|_| "Entrada no comprobable")?;
        if batch::linked(&m) {
            return Err("La copia contiene enlaces; se conserva sin modificar".into());
        }
        if m.is_dir() {
            if !rel.is_empty() {
                directories.push(rel.clone());
            }
            for entry in fs::read_dir(&path).map_err(|_| "No se puede revisar una carpeta")? {
                let entry = entry.map_err(|_| "Entrada no comprobable")?;
                let name = entry
                    .file_name()
                    .into_string()
                    .map_err(|_| "Nombre no compatible")?;
                if coordination(&name) {
                    continue;
                }
                portable_paths::component(&name)?;
                pending.push((
                    entry.path(),
                    if rel.is_empty() {
                        name
                    } else {
                        format!("{rel}/{name}")
                    },
                ));
            }
        } else if m.is_file() {
            if m.len() > LIMIT - total {
                return Err(
                    "La copia supera128MiB; se conserva y no se entrega un conjunto parcial".into(),
                );
            }
            let bytes = read(&path, LIMIT - total)?;
            total += bytes.len() as u64;
            data.insert(if directory { rel } else { "payload".into() }, bytes);
        } else {
            return Err("Entrada no regular; se conserva".into());
        }
    }
    directories.sort();
    Ok((directory, data, directories))
}
fn proofs(data: &BTreeMap<String, Vec<u8>>) -> Vec<FileProof> {
    data.iter()
        .map(|(path, bytes)| FileProof {
            path: path.clone(),
            bytes: bytes.len() as u64,
            sha256: sha256_hex(bytes),
        })
        .collect()
}
fn revision(record: &Closure) -> Result<String, String> {
    Ok(sha256_hex(
        &serde_json::to_vec(record).map_err(|_| "No se pudo preparar la revisión")?,
    ))
}
fn snapshot(api: &LocalApi, family: &str, key: &str, archived: bool) -> Result<Snapshot, String> {
    if !hash(key) {
        return Err("Identidad de recuperación no válida".into());
    }
    if archived {
        let record = closure(api, key)?.ok_or("No existe el registro conservado")?;
        if record.family != family {
            return Err("La copia pertenece a otra familia".into());
        }
        let source = api.app_data_dir.join(VAULT).join(key).join("data");
        safe_path(api, &source)?;
        let (directory, data, directories) = contents(&source)?;
        if directory != record.directory
            || directories != record.directories
            || serde_json::to_value(proofs(&data)).ok() != serde_json::to_value(&record.files).ok()
        {
            return Err("La conservación está incompleta o cambió; consulta sus archivos sin reparar ni repetir".into());
        }
        let revision = revision(&record)?;
        return Ok(Snapshot {
            record,
            data,
            revision,
            source,
            archived: true,
        });
    }
    if closure(api, key)?.is_some() {
        return Err(
            "El registro ya está conservado; consulta Archivo en lugar de repetir el cierre".into(),
        );
    }
    let source = candidates(api, family)?
        .into_iter()
        .find(|p| relative(api, p).is_some_and(|r| sha256_hex(r.as_bytes()) == key))
        .ok_or("El registro ya no está en esta familia")?;
    let rel = relative(api, &source).ok_or("Ubicación no válida")?;
    let (directory, data, directories) = contents(&source)?;
    // Creation time is deliberately stable across reviews; source state defines the token.
    let record = Closure {
        format: 1,
        key: key.into(),
        family: family.into(),
        source: rel,
        created_at: "1970-01-01T00:00:00Z".into(),
        directory,
        directories,
        files: proofs(&data),
    };
    let revision = revision(&record)?;
    Ok(Snapshot {
        record,
        data,
        revision,
        source,
        archived: false,
    })
}
fn known_version(value: &Value) -> bool {
    value.is_object()
        && value.get("schemaVersion").is_none_or(|v| v == 1)
        && value.get("format").is_none_or(|v| v == 1)
}
fn closeable(api: &LocalApi, snapshot: &Snapshot) -> bool {
    if snapshot.archived {
        return false;
    }
    let primary = if snapshot.record.directory {
        match snapshot.record.family.as_str() {
            "mixed-applications" => "record.json",
            "project-transfers" => "job.json",
            "project-templates" => "record.json",
            _ => return false,
        }
    } else {
        "payload"
    };
    let Some(raw) = snapshot.data.get(primary) else {
        return false;
    };
    if raw.len() > 256 * 1024 {
        return false;
    }
    let Ok(value) = serde_json::from_slice::<Value>(raw) else {
        return false;
    };
    if !matches!(
        snapshot.record.family.as_str(),
        "graph-joins" | "mixed-applications"
    ) && !known_version(&value)
    {
        return false;
    }
    let tail = Path::new(&snapshot.record.source)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("");
    let identity = match snapshot.record.family.as_str() {
        "conflict-attempts" => value["id"].as_str().map(|v| format!("{v}.json")),
        "mixed-reviews" => value["id"].as_str().map(|v| format!("{v}.json")),
        "graph-joins" => value["attemptId"].as_str().map(|v| format!("{v}.json")),
        "mixed-applications" => value["planId"].as_str().map(str::to_owned),
        "project-transfers" | "project-templates" => {
            value["id"].as_str().map(|v| sha256_hex(v.as_bytes()))
        }
        _ => None,
    };
    if identity.as_deref() != Some(tail) {
        return false;
    }
    match snapshot.record.family.as_str() {
        "conflict-attempts" => api.lifecycle_conflict_record(raw),
        "mixed-reviews" => {
            api.lifecycle_mixed_record(raw)
                && value["format"] == 1
                && value["rows"].is_array()
                && value["id"]
                    .as_str()
                    .is_some_and(|id| snapshot.record.source.ends_with(&format!("/{id}.json")))
        }
        "graph-joins" => {
            api.lifecycle_join_record(raw)
                && value["targetCommit"].is_string()
                && value["attemptId"].is_string()
        }
        "mixed-applications" => snapshot
            .data
            .get("completed.json")
            .is_some_and(|done| api.lifecycle_application_record(raw, done)),
        "project-transfers" => {
            api.lifecycle_transfer_record(raw)
                && value["schemaVersion"] == 1
                && matches!(
                    value["phase"].as_str(),
                    Some("completed" | "cancelled" | "failed")
                )
        }
        "project-templates" => {
            api.lifecycle_template_record(raw)
                && value["schemaVersion"] == 1
                && value["retired"] == true
        }
        _ => false,
    }
}
fn unit_project(s: &Snapshot) -> Option<String> {
    let primary = if s.record.directory {
        match s.record.family.as_str() {
            "mixed-applications" => "record.json",
            "project-transfers" => "job.json",
            _ => return None,
        }
    } else {
        "payload"
    };
    let v: Value = serde_json::from_slice(s.data.get(primary)?).ok()?;
    v["projectId"].as_str().map(str::to_owned).or_else(|| {
        v["documentId"]
            .as_str()
            .and_then(|id| document_ref(id).ok().map(|(p, _)| p))
    })
}
fn protects_project(api: &LocalApi, source: &Path) -> Result<bool, String> {
    let source = source
        .canonicalize()
        .map_err(|_| "No se pudo comprobar la ubicación")?;
    let registry = api.registry_checked()?;
    let retired = api.retired_projects()?;
    for record in registry["projects"]
        .as_array()
        .into_iter()
        .flatten()
        .chain(retired["entries"].as_array().into_iter().flatten())
    {
        let path = record["folderPath"]
            .as_str()
            .ok_or("Ubicación de proyecto no comprobable")?;
        // Canonicalize an existing root; lexical overlap also protects missing retained roots.
        let path = PathBuf::from(path);
        let path = path.canonicalize().unwrap_or(path);
        if source.starts_with(&path) || path.starts_with(&source) {
            return Ok(true);
        }
    }
    Ok(false)
}
impl LocalApi {
    pub(super) fn recovery_family_catalog(
        &self,
        family: Option<&str>,
        offset: usize,
    ) -> Result<Value, String> {
        if family.is_none() {
            return Ok(
                json!({"schemaVersion":1,"families":FAMILIES,"scope":"profile-recovery-families","automaticActions":false}),
            );
        }
        let family = family.unwrap();
        if offset > 20_000 {
            return Err("Página fuera del límite de consulta".into());
        }
        let paths = candidates(self, family)?;
        let count = paths.len();
        let mut items = vec![];
        for path in paths.into_iter().skip(offset).take(50) {
            let rel = relative(self, &path).ok_or("Ubicación no comprobable")?;
            let key = sha256_hex(rel.as_bytes());
            let meta = fs::symlink_metadata(&path);
            items.push(json!({"key":key,"name":path.file_name().and_then(|n|n.to_str()).unwrap_or("Registro"),"directory":meta.as_ref().is_ok_and(|m|m.is_dir()),"regular":meta.as_ref().is_ok_and(|m|!batch::linked(m)&&(m.is_file()||m.is_dir()))}));
        }
        let mut archived = vec![];
        let store = self.app_data_dir.join(CLOSURES);
        safe_path(self, &store)?;
        let started = Instant::now();
        if folder(&store)? {
            for (n, entry) in fs::read_dir(store)
                .map_err(|_| "No se puede consultar el archivo")?
                .enumerate()
            {
                if n >= 20_000 || started.elapsed() > Duration::from_secs(3) {
                    return Err("El archivo supera el presupuesto de consulta; se conserva".into());
                }
                let entry = entry.map_err(|_| "Registro no comprobable")?;
                let name = entry
                    .file_name()
                    .into_string()
                    .map_err(|_| "Registro no compatible")?;
                if coordination(&name) {
                    continue;
                }
                let key = name
                    .strip_suffix(".json")
                    .ok_or("Registro de archivo desconocido")?;
                if let Some(record) = closure(self, key)? {
                    if record.family == family {
                        archived.push(json!({"key":key,"name":Path::new(&record.source).file_name().and_then(|n|n.to_str()).unwrap_or("Registro"),"archivedAt":record.created_at,"phase":if retirement::present(self,key)?{"retirement"}else if fs::symlink_metadata(self.app_data_dir.join(VAULT).join(key).join("data")).is_ok(){"closed"}else{"closing"},"revision":revision(&record)?,"files":record.files.len(),"bytes":record.files.iter().map(|f|f.bytes).sum::<u64>()}));
                    }
                }
            }
        }
        archived.sort_by(|a, b| a["key"].as_str().cmp(&b["key"].as_str()));
        let archived_total = archived.len();
        let archived: Vec<_> = archived.into_iter().skip(offset).take(50).collect();
        Ok(
            json!({"schemaVersion":1,"family":family,"archivedTotal":archived_total,"items":items,"offset":offset,"nextOffset":if offset+50<count.max(archived_total){Some(offset+50)}else{None},"total":count,"archived":archived,"scope":"this-profile","automaticActions":false}),
        )
    }
    pub(super) fn review_recovery_unit(
        &self,
        family: &str,
        key: &str,
        archived: bool,
    ) -> Result<Value, String> {
        if archived && retirement::present(self, key)? {
            return retirement::review(self, family, key);
        }
        let s = snapshot(self, family, key, archived)?;
        let safe = closeable(self, &s) && !protects_project(self, &s.source)?;
        Ok(
            json!({"schemaVersion":1,"family":family,"key":key,"revision":s.revision,"archived":archived,"files":s.record.files,"bytes":s.data.values().map(|v|v.len()as u64).sum::<u64>(),"canClose":safe,"canExport":true,"canRetire":archived,"affectsWorkingFiles":false,"message":if archived{"Identidad conservada: no se reabre ni se repite su operación."}else if safe{"Puede cerrarse y conservarse fuera del cupo activo. No libera el tamaño de sus datos ni revierte efectos ya aplicados."}else{"Contenido activo, parcial, no compatible o con dependencias pendientes: se conserva en su ubicación. Puede respaldarse sin reparar ni repetir su operación."}}),
        )
    }
    pub(super) fn close_recovery_unit(
        &self,
        family: &str,
        key: &str,
        body: Value,
    ) -> Result<Value, String> {
        #[derive(Deserialize)]
        #[serde(rename_all = "camelCase", deny_unknown_fields)]
        struct Request {
            revision: String,
            acknowledge: bool,
        }
        let request: Request =
            serde_json::from_value(body).map_err(|_| "Confirmación no válida")?;
        if !request.acknowledge {
            return Err("Confirma el cierre y conservación del registro".into());
        }
        let s = snapshot(self, family, key, false)?;
        let _project = unit_project(&s)
            .map(|p| self.project_transaction(&p))
            .transpose()?;
        if s.revision != request.revision
            || !closeable(self, &s)
            || protects_project(self, &s.source)?
        {
            return Err(
                "El registro cambió, está protegido o no admite cierre; revisa de nuevo".into(),
            );
        }
        // Moving existing data is maintenance, not a new preparation.
        let vault = self.app_data_dir.join(VAULT);
        let index = self.app_data_dir.join(CLOSURES);
        for path in [&vault, &index] {
            safe_path(self, path)?;
            if !folder(path)? {
                fs::create_dir(path).map_err(|_| "No se pudo preparar la conservación")?;
            }
        }
        let destination = vault.join(key);
        safe_path(self, &destination)?;
        if !folder(&destination)? {
            fs::create_dir(&destination).map_err(|_| "No se pudo reservar el archivo")?;
        }
        folder(&destination)?;
        if fs::symlink_metadata(destination.join("data")).is_ok() {
            return Err("El destino ya está ocupado; consulta la conservación sin repetir".into());
        }
        let mut record = s.record;
        record.created_at = knownext_core::now_iso();
        let raw = serde_json::to_vec(&record)
            .map_err(|_| "No se pudo preparar la identidad de cierre")?;
        if snapshot(self, family, key, false)?.revision != request.revision {
            return Err("La copia cambió antes de cerrar su identidad; se conserva".into());
        }
        if raw.len()>2*1024*1024{return Err("El manifiesto supera el límite de conservación; el original permanece sin cerrar su identidad".into());}
        // Publish the permanent identity before moving bytes. A crash cannot make an old ID reusable.
        atomic_io::create(&closure_path(self, key)?, &raw)
            .map_err(|_| "No se confirmó la identidad de cierre; consulta antes de continuar")?;
        atomic_io::rename_no_replace(&s.source,&destination.join("data")).map_err(|_|"Identidad reservada, contenido aún conservado en origen. Consulta y continúa explícitamente el cierre")?;
        self.review_recovery_unit(family, key, true)
    }
    pub(super) fn continue_recovery_unit_close(
        &self,
        family: &str,
        key: &str,
        body: Value,
    ) -> Result<Value, String> {
        #[derive(Deserialize)]
        #[serde(rename_all = "camelCase", deny_unknown_fields)]
        struct Request {
            revision: String,
            acknowledge: bool,
        }
        let request: Request =
            serde_json::from_value(body).map_err(|_| "Confirmación no válida")?;
        let record = closure(self, key)?.ok_or("No existe una conservación iniciada")?;
        if record.family != family || !request.acknowledge || request.revision != revision(&record)?
        {
            return Err("Vuelve a revisar la conservación antes de continuar".into());
        }
        let destination = self.app_data_dir.join(VAULT).join(key).join("data");
        if fs::symlink_metadata(&destination).is_ok() {
            return self.review_recovery_unit(family, key, true);
        }
        let source = self.app_data_dir.join(&record.source);
        safe_path(self, &source)?;
        safe_path(self, &destination)?;
        let (directory, data, directories) = contents(&source)?;
        if directory != record.directory
            || directories != record.directories
            || serde_json::to_value(proofs(&data)).ok() != serde_json::to_value(&record.files).ok()
            || protects_project(self, &source)?
        {
            return Err(
                "El origen cambió; se conservan ambos lugares sin sustituir ni repetir efectos"
                    .into(),
            );
        }
        atomic_io::rename_no_replace(&source, &destination)
            .map_err(|_| "No se confirmó la conservación; consulta antes de continuar")?;
        self.review_recovery_unit(family, key, true)
    }
    pub fn freeze_recovery_unit(
        &self,
        family: &str,
        key: &str,
        expected: &str,
        archived: bool,
    ) -> Result<crate::recovery_system::FrozenRecoveryCopy, String> {
        if archived && retirement::present(self, key)? {
            return Err("La retirada ya está registrada. Revisa el respaldo externo; no se reconstruye una copia parcial".into());
        }
        let s = snapshot(self, family, key, archived)?;
        if s.revision != expected {
            return Err("La copia cambió; vuelve a revisar antes de exportar".into());
        }
        let mut writer = zip::ZipWriter::new(Cursor::new(Vec::new()));
        let options = zip::write::SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Deflated)
            .unix_permissions(0o600);
        writer
            .start_file("knownext-recovery.json", options)
            .map_err(|_| "No se pudo preparar el respaldo")?;
        writer
            .write_all(
                &serde_json::to_vec(&s.record).map_err(|_| "No se pudo preparar el manifiesto")?,
            )
            .map_err(|_| "No se pudo escribir el manifiesto")?;
        for directory in &s.record.directories {
            writer
                .add_directory(format!("Contenido/{directory}/"), options)
                .map_err(|_| "No se pudo conservar una carpeta")?;
        }
        for (path, bytes) in &s.data {
            writer
                .start_file(format!("Contenido/{path}"), options)
                .map_err(|_| "No se pudo preparar una entrada")?;
            writer
                .write_all(bytes)
                .map_err(|_| "No se pudo congelar una entrada")?;
        }
        let bytes = writer
            .finish()
            .map_err(|_| "No se pudo completar el respaldo")?
            .into_inner();
        if bytes.len() as u64 > LIMIT + 1024 * 1024 {
            return Err("El respaldo supera su límite; no se entrega un conjunto parcial".into());
        }
        if snapshot(self, family, key, archived)?.revision != expected {
            return Err(
                "El origen cambió durante el respaldo; no se entrega una copia obsoleta".into(),
            );
        }
        Ok(crate::recovery_system::FrozenRecoveryCopy::project_package(
            format!(
                "KnowNext-recuperacion-{}-{}.zip",
                family.replace('/', "-"),
                &key[..8]
            ),
            bytes,
        ))
    }
}

#[cfg(test)]
mod lifecycle_tests {
    use super::*;
    fn fixture() -> (tempfile::TempDir, LocalApi, PathBuf, String) {
        let owned = tempfile::tempdir().unwrap();
        let api = LocalApi::new(owned.path().join("state"), "2.6.0".into(), "test".into());
        let id = "project-template-owned-lifecycle";
        let folder = api
            .app_data_dir
            .join("project-templates")
            .join(sha256_hex(id.as_bytes()));
        fs::create_dir_all(&folder).unwrap();
        let raw = json!({"schemaVersion":1,"id":id,"name":"Owned QA","description":"","createdAt":knownext_core::now_iso(),"archiveSha256":"a".repeat(64),"sourceArchiveSha256":"b".repeat(64),"archiveBytes":5,"fileCount":1,"directoryCount":1,"retired":true});
        fs::write(
            folder.join("record.json"),
            serde_json::to_vec(&raw).unwrap(),
        )
        .unwrap();
        fs::write(folder.join("archive.zip"), b"owned").unwrap();
        fs::create_dir(folder.join("empty")).unwrap();
        let key = sha256_hex(relative(&api, &folder).unwrap().as_bytes());
        (owned, api, folder, key)
    }
    #[test]
    fn lifecycle_closure_preserves_bytes_and_empty_folders_and_blocks_old_identity() {
        let (_owned, api, folder, key) = fixture();
        let review = api
            .review_recovery_unit("project-templates", &key, false)
            .unwrap();
        assert_eq!(review["canClose"], true);
        let closed = api
            .close_recovery_unit(
                "project-templates",
                &key,
                json!({"revision":review["revision"],"acknowledge":true}),
            )
            .unwrap();
        assert_eq!(closed["archived"], true);
        assert!(!folder.exists());
        assert!(ensure_open(&api, &folder.join("record.json")).is_err());
        assert_eq!(
            fs::read(
                api.app_data_dir
                    .join(VAULT)
                    .join(&key)
                    .join("data/archive.zip")
            )
            .unwrap(),
            b"owned"
        );
        let frozen = api
            .freeze_recovery_unit(
                "project-templates",
                &key,
                closed["revision"].as_str().unwrap(),
                true,
            )
            .unwrap();
        let target = _owned.path().join("owned-backup.zip");
        api.write_system_recovery(&frozen, &target).unwrap();
        let mut archive = zip::ZipArchive::new(fs::File::open(target).unwrap()).unwrap();
        assert!(archive.by_name("Contenido/empty/").unwrap().is_dir());
        assert!(archive.by_name("Contenido/archive.zip").is_ok());
        let inventory = api.recovery_storage_inventory().unwrap();
        assert!(inventory["items"]
            .as_array()
            .unwrap()
            .iter()
            .any(|r| r["family"] == VAULT));
        assert_eq!(
            api.recovery_family_catalog(Some("project-templates"), 0)
                .unwrap()["total"],
            0
        );
    }
    #[test]
    fn lifecycle_stale_unknown_active_and_wrong_identity_are_never_closed() {
        let (_owned, api, folder, key) = fixture();
        let first = api
            .review_recovery_unit("project-templates", &key, false)
            .unwrap();
        fs::write(folder.join("archive.zip"), b"changed").unwrap();
        assert!(api
            .close_recovery_unit(
                "project-templates",
                &key,
                json!({"revision":first["revision"],"acknowledge":true})
            )
            .is_err());
        for change in [
            json!({"schemaVersion":99}),
            json!({"retired":false}),
            json!({"id":"project-template-another-identity"}),
            json!({"future":true}),
        ] {
            let mut value: Value =
                serde_json::from_slice(&fs::read(folder.join("record.json")).unwrap()).unwrap();
            for (k, v) in change.as_object().unwrap() {
                value[k] = v.clone();
            }
            fs::write(
                folder.join("record.json"),
                serde_json::to_vec(&value).unwrap(),
            )
            .unwrap();
            let review = api
                .review_recovery_unit("project-templates", &key, false)
                .unwrap();
            assert_eq!(review["canClose"], false);
            assert_eq!(review["canExport"], true);
            assert!(folder.exists());
        }
    }
    #[test]
    fn lifecycle_interrupted_closure_requires_explicit_matching_continuation() {
        let (_owned, api, folder, key) = fixture();
        let mut snap = snapshot(&api, "project-templates", &key, false).unwrap();
        snap.record.created_at = knownext_core::now_iso();
        fs::create_dir_all(api.app_data_dir.join(VAULT).join(&key)).unwrap();
        fs::create_dir(api.app_data_dir.join(CLOSURES)).unwrap();
        fs::write(
            closure_path(&api, &key).unwrap(),
            serde_json::to_vec(&snap.record).unwrap(),
        )
        .unwrap();
        assert!(ensure_open(&api, &folder).is_err());
        let list = api
            .recovery_family_catalog(Some("project-templates"), 0)
            .unwrap();
        assert_eq!(list["archived"][0]["phase"], "closing");
        assert!(folder.exists());
        assert!(api
            .continue_recovery_unit_close(
                "project-templates",
                &key,
                json!({"revision":"stale","acknowledge":true})
            )
            .is_err());
        let body = json!({"revision":list["archived"][0]["revision"],"acknowledge":true});
        let closed = api
            .continue_recovery_unit_close("project-templates", &key, body.clone())
            .unwrap();
        assert_eq!(closed["archived"], true);
        assert!(api
            .continue_recovery_unit_close("project-templates", &key, body)
            .is_ok());
        assert!(!folder.exists());
    }
    #[test]
    fn lifecycle_partial_bytes_are_exportable_without_a_domain_receipt() {
        let (_owned, api, _, _) = fixture();
        let source = api
            .app_data_dir
            .join("mixed-applications")
            .join("owned-group")
            .join("partial");
        fs::create_dir_all(&source).unwrap();
        fs::write(source.join("before-0.bin"), b"known partial bytes").unwrap();
        // No coordination entry is opened or inspected by content discovery.
        fs::create_dir(source.join("capture.lock")).unwrap();
        let list = api
            .recovery_family_catalog(Some("mixed-applications"), 0)
            .unwrap();
        let key = list["items"][0]["key"].as_str().unwrap();
        let review = api
            .review_recovery_unit("mixed-applications", key, false)
            .unwrap();
        assert_eq!(review["canClose"], false);
        assert_eq!(review["files"].as_array().unwrap().len(), 1);
        assert!(api
            .freeze_recovery_unit(
                "mixed-applications",
                key,
                review["revision"].as_str().unwrap(),
                false
            )
            .is_ok());
        assert!(source.exists());
    }
    #[test]
    fn lifecycle_root_overlap_and_changed_interruption_remain_protected() {
        let (_owned, api, folder, key) = fixture();
        let project = api
            .create_project(json!({"name":"Owned root","versioningMode":"none","syncMode":"none"}))
            .unwrap();
        let mut registry = api.registry_checked().unwrap();
        registry["projects"][0]["folderPath"] = json!(folder.to_string_lossy());
        api.write_json(&api.registry_path(), &registry).unwrap();
        let _ = project;
        assert_eq!(
            api.review_recovery_unit("project-templates", &key, false)
                .unwrap()["canClose"],
            false
        );
    }
    #[test]
    fn lifecycle_retirement_requires_external_exact_backup_and_keeps_identity_after_partial_removal(
    ) {
        let (owned, api, folder, key) = fixture();
        for n in 0..20 {
            fs::write(folder.join(format!("part-{n:02}")), format!("Owned {n}")).unwrap();
        }
        let review = api
            .review_recovery_unit("project-templates", &key, false)
            .unwrap();
        let closed = api
            .close_recovery_unit(
                "project-templates",
                &key,
                json!({"revision":review["revision"],"acknowledge":true}),
            )
            .unwrap();
        let token = closed["revision"].as_str().unwrap();
        let frozen = api
            .freeze_recovery_unit("project-templates", &key, token, true)
            .unwrap();
        let backup = owned.path().join("owned-external.zip");
        api.write_system_recovery(&frozen, &backup).unwrap();
        let bad = owned.path().join("owned-bad.zip");
        fs::write(&bad, b"not the reviewed backup").unwrap();
        assert!(api
            .retire_recovery_unit("project-templates", &key, token, true, &bad)
            .is_err());
        assert!(!retirement::present(&api, &key).unwrap());
        let partial = api
            .retire_recovery_unit("project-templates", &key, token, true, &backup)
            .unwrap();
        assert_eq!(partial["phase"], "retiring");
        assert_eq!(partial["canExport"], false);
        let left = partial["remainingFiles"].as_u64().unwrap();
        assert!(left > 0 && left < 22);
        let observed = api
            .review_recovery_unit("project-templates", &key, true)
            .unwrap();
        assert_eq!(observed["remainingFiles"], left);
        assert!(api
            .retire_recovery_unit("project-templates", &key, token, true, &backup)
            .is_err());
        assert!(ensure_open(&api, &folder).is_err());
        let done = api
            .retire_recovery_unit(
                "project-templates",
                &key,
                observed["revision"].as_str().unwrap(),
                true,
                &backup,
            )
            .unwrap();
        assert_eq!(done["phase"], "retired");
        assert_eq!(done["bytes"], 0);
        assert_eq!(done["canRetire"], false);
        assert!(backup.exists());
        assert!(ensure_open(&api, &folder.join("record.json")).is_err());
        assert!(api
            .freeze_recovery_unit(
                "project-templates",
                &key,
                done["revision"].as_str().unwrap(),
                true
            )
            .is_err());
    }
    #[test]
    fn lifecycle_internal_producers_respect_another_threads_integrity_reservation() {
        let (_owned, api, _, _) = fixture();
        let p = api
            .create_project(
                json!({"name":"Owned producers","versioningMode":"local-git","syncMode":"none"}),
            )
            .unwrap();
        let id = p["id"].as_str().unwrap().to_owned();
        let root = api.project_root(&id).unwrap();
        fs::write(root.join("Existing.md"), "Owned original").unwrap();
        let doc = doc_id(&id, "Existing.md");
        let _reservation = api.project_transaction(&id).unwrap();
        let worker = api.clone();
        let id2 = id.clone();
        std::thread::spawn(move || {
            assert!(worker
                .create_document(&id2, json!({"name":"Unsafe.md"}))
                .is_err());
            assert!(worker
                .create_folder(&id2, json!({"name":"Unsafe"}))
                .is_err());
            assert!(worker
                .create_version(&id2, json!({"documentId":doc}))
                .is_err());
            let mut response = json!({"status":"completed","operations":[]});
            assert!(worker
                .apply_ai_document_creations(&id2, &json!({}), &mut response)
                .is_err());
        })
        .join()
        .unwrap();
        assert!(!root.join("Unsafe.md").exists());
        assert!(!root.join("Unsafe").exists());
        assert_eq!(
            fs::read(root.join("Existing.md")).unwrap(),
            b"Owned original"
        );
    }
    #[test]
    fn lifecycle_capture_and_transfer_admission_precede_new_work_without_blocking_reads() {
        let (_owned, api, _, _) = fixture();
        let policy = api.recovery_storage_inventory().unwrap();
        api.update_recovery_budget(
            json!({"revision":policy["policy"]["revision"],"enabled":true,"maxBytes":16*1024*1024}),
        )
        .unwrap();
        assert!(api.admit_recording_start().is_err());
        assert!(api
            .begin_project_transfer(json!({"kind":"import"}))
            .is_err());
        assert!(!api.app_data_dir.join("project-transfers").exists());
        assert!(api.recovery_storage_inventory().is_ok());
    }
    #[test]
    fn lifecycle_version_api_and_restore_use_one_reentrant_integrity_reservation() {
        let (_owned, api, _, _) = fixture();
        let p = api
            .create_project(
                json!({"name":"Owned version API","versioningMode":"local-git","syncMode":"none"}),
            )
            .unwrap();
        let id = p["id"].as_str().unwrap();
        let root = api.project_root(id).unwrap();
        fs::write(root.join("Owned.md"), "Owned saved version").unwrap();
        let doc = doc_id(id, "Owned.md");
        let result = api
            .handle(
                "POST",
                &format!("/api/projects/{id}/versions"),
                json!({"documentId":doc,"title":"Owned version"}),
                vec![],
            )
            .unwrap();
        assert_eq!(result.status, 200);
        assert!(result.body["version"]["id"].is_string());
    }
    #[test]
    fn lifecycle_catalog_exposes_all_twenty_families_and_bounds_offset() {
        let (_owned, api, _, _) = fixture();
        assert_eq!(
            api.recovery_family_catalog(None, 0).unwrap()["families"]
                .as_array()
                .unwrap()
                .len(),
            20
        );
        assert!(api.recovery_family_catalog(Some("../outside"), 0).is_err());
        assert!(api
            .recovery_family_catalog(Some("drafts"), usize::MAX)
            .is_err());
    }
}
