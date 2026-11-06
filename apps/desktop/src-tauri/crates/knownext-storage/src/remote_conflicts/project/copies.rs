//! Recover an immutable historical regular file as a new root-level file.
//! A retained hard-link anchor and native file identity distinguish our publication
//! from an unrelated file with identical bytes. There is no copy/replace fallback.
use super::*;
use sha2::{Digest, Sha256};
use std::{
    fs,
    time::{Duration, Instant},
};
const MAX_FILE: u64 = 32 * 1024 * 1024;
const MAX_RECORD: u64 = 16 * 1024;
const MAX_TOTAL: u64 = 128 * 1024 * 1024;
const MAX_COPIES: usize = 64;
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SourceRequest {
    revision: String,
    side: String,
    path: String,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CopyRequest {
    source: SourceRequest,
    source_revision: String,
    attempt_id: String,
    name: String,
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Record {
    format: u8,
    project_id: String,
    attempt_id: String,
    created_at: String,
    source: SourceRequest,
    source_revision: String,
    location_revision: String,
    source_commit: String,
    blob: String,
    sha256: String,
    size_bytes: u64,
    name: String,
    anchor_identity: String,
}
struct Source {
    context: Context,
    request: SourceRequest,
    revision: String,
    commit: String,
    blob: String,
    bytes: Vec<u8>,
    sha: String,
    can_copy: bool,
    before_deletion: bool,
}
fn attempt(value: &str) -> bool {
    value
        .strip_prefix("attempt-")
        .is_some_and(|v| v.len() == 32 && v.bytes().all(|c| c.is_ascii_hexdigit()))
}
fn sha(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(|c| c.is_ascii_hexdigit())
}
fn directory(path: &Path) -> Result<bool, String> {
    match fs::symlink_metadata(path) {
        Ok(meta) if meta.is_dir() && !batch::linked(&meta) => Ok(true),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(false),
        _ => Err("El almacén de copias históricas no es una carpeta regular; se conserva".into()),
    }
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Owner {
    format: u8,
    project_id: String,
}
fn folder(api: &LocalApi, project: &str, create: bool) -> Result<(PathBuf, PathBuf), String> {
    let root = api
        .project_root(project)?
        .canonicalize()
        .map_err(|_| "Ubicación de proyecto no comprobable")?;
    let copies = root.join(".knownext-history-copies");
    if !directory(&copies)? {
        if !create {
            return Ok((root, copies));
        }
        let stage = root.join(format!(
            ".knownext-history-copies.{}",
            knownext_core::compact_id("prepare")
        ));
        fs::create_dir(&stage).map_err(|_| "No se pudo preparar el almacén de copias")?;
        // Publish a complete owner/ignore pair. A failed preparation remains private;
        // never repair or recursively remove an unknown/partially prepared folder.
        atomic_io::create(&stage.join(".gitignore"), b"*\n")
            .map_err(|_| "Preparación de almacén no confirmada; se conserva sin publicar")?;
        let owner = serde_json::to_vec(&json!({"format":1,"projectId":project}))
            .map_err(|_| "Propietario no comprobable")?;
        atomic_io::create(&stage.join("owner.json"), &owner)
            .map_err(|_| "Preparación de propietario no confirmada; se conserva")?;
        atomic_io::rename_no_replace(&stage, &copies).map_err(|_| {
            "El nombre del almacén dejó de estar libre; ambas carpetas se conservan"
        })?;
    }
    if !directory(&copies)? {
        return Err("Almacén de copias no disponible".into());
    }
    let (owner_bytes, _) = read_file(&copies.join("owner.json"), 4096)?;
    let owner: Owner = serde_json::from_slice(&owner_bytes)
        .map_err(|_| "Propietario de copias no compatible; se conserva")?;
    if owner.format != 1
        || owner.project_id != project
        || read_file(&copies.join(".gitignore"), 16)?.0 != b"*\n"
    {
        return Err("Almacén de copias de otro proyecto o formato; se conserva sin reparar".into());
    }
    Ok((root, copies))
}
fn read_file(path: &Path, limit: u64) -> Result<(Vec<u8>, String), String> {
    let meta = fs::symlink_metadata(path).map_err(|_| "Archivo conservado no disponible")?;
    if !meta.is_file() || batch::linked(&meta) || meta.len() > limit {
        return Err("Archivo no regular o fuera de límites; se conserva".into());
    }
    let file = fs::File::open(path).map_err(|_| "No se puede leer el archivo conservado")?;
    let identity = local_file_identity::identity(&file).map_err(|_| {
        "El sistema de archivos no proporciona una identidad verificable para esta copia"
    })?;
    let before = file.metadata().map_err(|_| "Archivo no comprobable")?;
    let mut bytes = vec![];
    file.take(limit + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| "No se pudo leer la copia completa")?;
    let after = fs::symlink_metadata(path).map_err(|_| "La copia cambió durante la lectura")?;
    let reopened = fs::File::open(path).map_err(|_| "La copia dejó de estar disponible")?;
    if bytes.len() as u64 > limit
        || bytes.len() as u64 != before.len()
        || !after.is_file()
        || batch::linked(&after)
        || before.len() != after.len()
        || before.modified().ok() != after.modified().ok()
        || local_file_identity::identity(&reopened).ok().as_deref() != Some(&identity)
    {
        return Err("La copia cambió durante la lectura; no se confirma ni repite".into());
    }
    Ok((bytes, identity))
}
fn inspect_file(path: &Path) -> Result<(String, String, u64), String> {
    let meta = fs::symlink_metadata(path).map_err(|_| "Copia no disponible")?;
    if !meta.is_file() || batch::linked(&meta) || meta.len() > MAX_FILE {
        return Err("Copia no regular o fuera de límites".into());
    }
    let mut file = fs::File::open(path).map_err(|_| "Copia no legible")?;
    let identity =
        local_file_identity::identity(&file).map_err(|_| "Identidad de copia no comprobable")?;
    let before = file.metadata().map_err(|_| "Copia no comprobable")?;
    let start = Instant::now();
    let mut size = 0u64;
    let mut hash = Sha256::new();
    let mut buffer = vec![0u8; 64 * 1024];
    loop {
        if start.elapsed() > Duration::from_secs(5) {
            return Err(
                "Lectura fuera del presupuesto cooperativo; se conserva sin confirmar".into(),
            );
        }
        let count = file
            .read(&mut buffer)
            .map_err(|_| "No se pudo comprobar la copia")?;
        if count == 0 {
            break;
        }
        size = size.saturating_add(count as u64);
        if size > MAX_FILE {
            return Err("La copia supera32MiB; se conserva".into());
        }
        hash.update(&buffer[..count]);
    }
    let after = fs::symlink_metadata(path).map_err(|_| "Copia no disponible")?;
    let reopened = fs::File::open(path).map_err(|_| "Copia no comprobable")?;
    if !after.is_file()
        || batch::linked(&after)
        || size != before.len()
        || before.len() != after.len()
        || before.modified().ok() != after.modified().ok()
        || local_file_identity::identity(&reopened).ok().as_deref() != Some(&identity)
    {
        return Err("La copia cambió durante la comprobación".into());
    }
    Ok((format!("{:x}", hash.finalize()), identity, size))
}
fn validate(record: &Record, project: &str, id: &str) -> Result<(), String> {
    if record.format != 1
        || record.project_id != project
        || record.attempt_id != id
        || !attempt(id)
        || !sha(&record.source_revision)
        || !sha(&record.location_revision)
        || !sha(&record.sha256)
        || !sha(&record.source.revision)
        || !matches!(record.source.side.as_str(), "local" | "remote")
        || path(record.source.path.as_bytes()).is_err()
        || !version_history::is_commit_id(&record.source_commit)
        || !version_history::is_commit_id(&record.blob)
        || record.size_bytes > MAX_FILE
        || portable_paths::component(&record.name).is_err()
        || record.anchor_identity.is_empty()
        || record.anchor_identity.len() > 128
        || OffsetDateTime::parse(&record.created_at, &Rfc3339).is_err()
    {
        return Err("Recibo de copia no compatible; se conserva sin repetir".into());
    }
    Ok(())
}
fn read_record(path: &Path, project: &str, id: &str) -> Result<(Record, Vec<u8>), String> {
    let (bytes, _) = read_file(path, MAX_RECORD)?;
    let record: Record =
        serde_json::from_slice(&bytes).map_err(|_| "Recibo no compatible; se conserva")?;
    validate(&record, project, id)?;
    Ok((record, bytes))
}
fn source(api: &LocalApi, project: &str, request: SourceRequest) -> Result<Source, String> {
    if !sha(&request.revision) || !matches!(request.side.as_str(), "local" | "remote") {
        return Err("Revisa primero la variante histórica seleccionada".into());
    }
    path(request.path.as_bytes())?;
    let review = api.review_remote_project(project)?;
    let snapshot = context(api, project)?;
    if review["revision"] != request.revision || snapshot.revision != request.revision {
        return Err(
            "La revisión histórica cambió. Vuelve a consultar; los archivos se conservan".into(),
        );
    }
    let selected = review[&request.side]
        .as_array()
        .and_then(|rows| rows.iter().find(|row| row["path"] == request.path))
        .ok_or("La ruta no pertenece a esta revisión")?;
    if selected["canRecover"] != true {
        return Err("Esta entrada histórica no es un archivo regular recuperable".into());
    }
    let before_deletion = selected["change"] == "deleted";
    let commit = if before_deletion {
        review["baseCommit"].as_str()
    } else if request.side == "remote" {
        Some(snapshot.remote.as_str())
    } else {
        Some(snapshot.local.as_str())
    }
    .ok_or("Versión histórica no comprobable")?
    .to_string();
    let listing = read_git(
        &snapshot.root,
        &["ls-tree", "--full-tree", "-z", &commit, "--", &request.path],
    )?;
    let fields = listing
        .strip_suffix(&[0])
        .ok_or("Entrada histórica no compatible")?;
    let tab = fields
        .iter()
        .position(|b| *b == b'\t')
        .ok_or("Entrada histórica incompleta")?;
    let header = std::str::from_utf8(&fields[..tab])
        .map_err(|_| "Entrada histórica no compatible")?
        .split(' ')
        .collect::<Vec<_>>();
    if header.len() != 3
        || !matches!(header[0], "100644" | "100755")
        || header[1] != "blob"
        || !version_history::is_commit_id(header[2])
        || fields[tab + 1..] != *request.path.as_bytes()
    {
        return Err("La entrada no identifica un archivo regular de esta ruta".into());
    }
    let blob = header[2].to_string();
    let size = read_git(&snapshot.root, &["cat-file", "-s", &blob])?;
    let size = std::str::from_utf8(&size)
        .ok()
        .and_then(|v| v.trim().parse::<u64>().ok())
        .filter(|size| *size <= MAX_FILE)
        .ok_or("El recurso supera32MiB o no se puede leer completo")?;
    let bytes = read_git_bounded(&snapshot.root, &["cat-file", "blob", &blob], MAX_FILE)?;
    if bytes.len() as u64 != size || context(api, project)? != snapshot {
        return Err("La fuente histórica cambió durante la lectura; vuelve a revisar".into());
    }
    let hash = sha256_hex(&bytes);
    let revision=sha256_hex(&serde_json::to_vec(&json!({"projectId":project,"request":request,"commit":commit,"blob":blob,"sha256":hash})).map_err(|_|"No se pudo identificar la fuente")?);
    let inventory = &review["historyCopies"];
    let can_copy = inventory["limited"] != true
        && inventory["items"]
            .as_array()
            .is_some_and(|items| items.len() < MAX_COPIES)
        && inventory["retainedBytes"].as_u64().is_some_and(|used| {
            used.saturating_add(bytes.len() as u64)
                .saturating_add(MAX_RECORD)
                <= MAX_TOTAL
        });
    Ok(Source {
        context: snapshot,
        request,
        revision,
        commit,
        blob,
        bytes,
        sha: hash,
        can_copy,
        before_deletion,
    })
}
fn destination_free(root: &Path, name: &str) -> Result<(), String> {
    portable_paths::component(name)?;
    let start = Instant::now();
    for (index, entry) in fs::read_dir(root)
        .map_err(|_| "No se puede revisar el destino")?
        .enumerate()
    {
        if index >= 10_000 || start.elapsed() > Duration::from_secs(2) {
            return Err(
                "No se puede comprobar por completo el nombre de destino; se conserva sin crear"
                    .into(),
            );
        }
        let entry = entry.map_err(|_| "Destino no comprobable")?;
        let filename = entry.file_name();
        let existing = filename
            .to_str()
            .ok_or("Hay un nombre no compatible en el destino")?;
        if portable_paths::key(existing) == portable_paths::key(name) {
            return Err("Ya existe ese nombre en la raíz del proyecto. Elige otro; no se reemplaza ningún archivo".into());
        }
    }
    Ok(())
}
impl LocalApi {
    pub(crate) fn review_historical_copy_source(
        &self,
        project: &str,
        body: Value,
    ) -> Result<Value, String> {
        let request: SourceRequest =
            serde_json::from_value(body).map_err(|_| "Selección histórica no compatible")?;
        let source = source(self, project, request)?;
        let filename = Path::new(&source.request.path)
            .file_name()
            .and_then(|n| n.to_str())
            .ok_or("Nombre histórico no compatible")?;
        let ext = Path::new(filename)
            .extension()
            .and_then(|v| v.to_str())
            .unwrap_or("");
        let stem = Path::new(filename)
            .file_stem()
            .and_then(|v| v.to_str())
            .unwrap_or("Recurso");
        let suffix = format!(
            " (histórico){}",
            if ext.is_empty() {
                String::new()
            } else {
                format!(".{ext}")
            }
        );
        let budget = 240usize.saturating_sub(suffix.len());
        let mut retained = String::new();
        for c in stem.chars() {
            if retained.len() + c.len_utf8() > budget {
                break;
            }
            retained.push(c)
        }
        let default_name = if retained.is_empty() {
            filename.to_string()
        } else {
            format!("{retained}{suffix}")
        };
        let text = matches!(
            ext.to_ascii_lowercase().as_str(),
            "md" | "markdown" | "txt" | "csv"
        )
        .then(|| std::str::from_utf8(&source.bytes).ok())
        .flatten();
        let preview = text.map(|t| t.chars().take(4000).collect::<String>());
        let truncated = text.is_some_and(|t| t.chars().count() > 4000);
        Ok(
            json!({"schemaVersion":1,"projectId":project,"source":source.request,"sourceRevision":source.revision,"sourceCommit":source.commit,"blob":source.blob,"sha256":source.sha,"sizeBytes":source.bytes.len(),"defaultName":default_name,"canCopy":source.can_copy,"beforeDeletion":source.before_deletion,"previewText":preview,"previewTruncated":truncated,"checkedAt":knownext_core::now_iso(),"message":if source.can_copy{"Se creará un archivo nuevo en la raíz del proyecto; después puedes moverlo. La variante original y tus borradores se conservan."}else{"Catálogo parcial o capacidad de copias alcanzada; la fuente se puede revisar, pero no se permite otra publicación ni se poda contenido automáticamente."}}),
        )
    }
    pub(crate) fn list_historical_copies(&self, project: &str) -> Result<Value, String> {
        let (_, root) = folder(self, project, false)?;
        if !directory(&root)? {
            return Ok(json!({"items":[],"limited":false,"warnings":[],"retainedBytes":0}));
        }
        let mut items = vec![];
        let mut warnings = vec![];
        let mut limited = false;
        let mut total = 0u64;
        let start = Instant::now();
        for (index, entry) in fs::read_dir(&root)
            .map_err(|_| "No se puede consultar el catálogo de copias")?
            .enumerate()
        {
            if index >= MAX_COPIES * 2 + 2 || start.elapsed() > Duration::from_secs(2) {
                limited = true;
                break;
            }
            let result = (|| -> Result<Option<Value>, String> {
                let entry = entry.map_err(|_| "Entrada no legible")?;
                let name = entry
                    .file_name()
                    .to_str()
                    .ok_or("Nombre no compatible")?
                    .to_string();
                let meta =
                    fs::symlink_metadata(entry.path()).map_err(|_| "Entrada no comprobable")?;
                if !meta.is_file() || batch::linked(&meta) {
                    return Err("Entrada no regular conservada".into());
                }
                total = total.saturating_add(meta.len());
                if total > MAX_TOTAL {
                    return Err("El catálogo alcanza128MiB; se conserva completo".into());
                }
                if name == "owner.json" || name == ".gitignore" {
                    return Ok(None);
                }
                if let Some(id) = name.strip_suffix(".data").filter(|id| attempt(id)) {
                    if meta.len() > MAX_FILE
                        || !root
                            .join(format!("{id}.json"))
                            .try_exists()
                            .map_err(|_| "Pareja no comprobable")?
                    {
                        return Err(
                            "Contenido sin recibo compatible conservado para revisión".into()
                        );
                    }
                    return Ok(None);
                }
                let id = name
                    .strip_suffix(".json")
                    .filter(|id| attempt(id))
                    .ok_or("Entrada desconocida conservada")?;
                let (record, _) = read_record(&entry.path(), project, id)?;
                let anchor = fs::symlink_metadata(root.join(format!("{id}.data")))
                    .map_err(|_| "Falta contenido de una copia conservada")?;
                if !anchor.is_file() || batch::linked(&anchor) || anchor.len() > MAX_FILE {
                    return Err("Contenido conservado no compatible".into());
                }
                Ok(Some(
                    json!({"attemptId":record.attempt_id,"createdAt":record.created_at,"name":record.name,"sourcePath":record.source.path,"sourceSide":record.source.side,"sourceRevision":record.source_revision,"sha256":record.sha256,"sizeBytes":record.size_bytes}),
                ))
            })();
            match result {
                Ok(Some(item)) => items.push(item),
                Ok(None) => (),
                Err(message) => {
                    limited = true;
                    if warnings.len() < 10 {
                        warnings.push(message)
                    }
                }
            }
        }
        items.sort_by(|a, b| b["createdAt"].as_str().cmp(&a["createdAt"].as_str()));
        Ok(json!({"items":items,"limited":limited,"warnings":warnings,"retainedBytes":total}))
    }
    pub(crate) fn review_historical_copy(&self, project: &str, id: &str) -> Result<Value, String> {
        if !attempt(id) {
            return Err("Identidad de copia no válida".into());
        }
        let (root, private) = folder(self, project, false)?;
        let path = private.join(format!("{id}.json"));
        if !directory(&private)?
            || !path
                .try_exists()
                .map_err(|_| "No se pudo comprobar el recibo")?
        {
            return Ok(
                json!({"schemaVersion":1,"projectId":project,"attemptId":id,"status":"absent","canReplay":false,"checkedAt":knownext_core::now_iso()}),
            );
        }
        let (record, raw) = read_record(&path, project, id)?;
        let anchor = private.join(format!("{id}.data"));
        let target = self.resolve_project_relative(project, &record.name)?;
        let same_root = sha256_hex(root.to_string_lossy().as_bytes()) == record.location_revision;
        let state = if !same_root {
            "changed"
        } else {
            match inspect_file(&anchor) {
                Err(_) => "unavailable",
                Ok((hash, identity, size))
                    if hash != record.sha256
                        || identity != record.anchor_identity
                        || size != record.size_bytes =>
                {
                    "changed"
                }
                Ok((_, identity, _)) => {
                    if !target.try_exists().map_err(|_| "Destino no comprobable")? {
                        "pending"
                    } else {
                        match inspect_file(&target) {
                            Err(_) => "unavailable",
                            Ok((hash, target_identity, size))
                                if hash == record.sha256
                                    && identity == target_identity
                                    && size == record.size_bytes =>
                            {
                                "confirmed"
                            }
                            _ => "changed",
                        }
                    }
                }
            }
        };
        if read_record(&path, project, id)?.1 != raw
            || self.project_root(project)?.canonicalize().ok().as_ref() != Some(&root)
        {
            return Err("El recibo o ubicación cambió; no se confirma ni repite".into());
        }
        let tree = if state == "confirmed" {
            self.project_tree(project).ok()
        } else {
            None
        };
        Ok(
            json!({"schemaVersion":1,"projectId":project,"attemptId":id,"sourceRevision":record.source_revision,"name":record.name,"documentId":doc_id(project,&record.name),"sha256":record.sha256,"sizeBytes":record.size_bytes,"status":state,"canReplay":false,"treeAvailable":tree.is_some(),"tree":tree,"checkedAt":knownext_core::now_iso(),"message":match state{"confirmed"=>"Copia local comprobada. El archivo original y los borradores no se han reemplazado.","pending"=>"Preparación conservada sin publicación comprobada. Consultar no reanuda ni repite la copia.","unavailable"=>"No se puede comprobar la copia actual dentro de los límites. Se conserva sin confirmar ni repetir.",_=>"La copia, el destino o la ubicación cambiaron. Se conservan sin repetir ni sustituir archivos."}}),
        )
    }
    pub(crate) fn copy_historical_resource(
        &self,
        project: &str,
        body: Value,
    ) -> Result<Value, String> {
        let request: CopyRequest =
            serde_json::from_value(body).map_err(|_| "Solicitud de copia no compatible")?;
        if !attempt(&request.attempt_id) || !sha(&request.source_revision) {
            return Err("Revisa primero el recurso y el nombre de la copia".into());
        }
        portable_paths::component(&request.name)?;
        let _permit = self.project_transaction(project)?;
        let (root, private) = folder(self, project, true)?;
        let receipt = private.join(format!("{}.json", request.attempt_id));
        let anchor = private.join(format!("{}.data", request.attempt_id));
        if receipt.try_exists().map_err(|_| "Recibo no comprobable")?
            || anchor
                .try_exists()
                .map_err(|_| "Preparación no comprobable")?
        {
            return Err("Este intento ya está conservado. Consulta su recibo; no se repite".into());
        }
        let inventory = self.list_historical_copies(project)?;
        if inventory["limited"] == true
            || inventory["items"]
                .as_array()
                .is_none_or(|items| items.len() >= MAX_COPIES)
        {
            return Err("Catálogo de copias parcial o con64 recibos; se conserva sin podar ni reciclar identidades".into());
        }
        let source = source(self, project, request.source)?;
        if source.revision != request.source_revision || !source.can_copy {
            return Err("La fuente ya no corresponde a la revisión seleccionada".into());
        }
        if Path::new(&source.request.path)
            .extension()
            .map(|v| v.to_ascii_lowercase())
            != Path::new(&request.name)
                .extension()
                .map(|v| v.to_ascii_lowercase())
        {
            return Err(
                "Conserva la extensión del recurso original; esta acción no convierte formatos"
                    .into(),
            );
        }
        destination_free(&root, &request.name)?;
        let mut total = source.bytes.len() as u64;
        let quota_start = Instant::now();
        for (index, entry) in fs::read_dir(&private)
            .map_err(|_| "No se pudo comprobar la capacidad")?
            .enumerate()
        {
            if index >= MAX_COPIES * 2 + 2 || quota_start.elapsed() > Duration::from_secs(2) {
                return Err(
                    "Capacidad no revisable dentro del presupuesto; se conserva sin publicar"
                        .into(),
                );
            }
            let meta = fs::symlink_metadata(entry.map_err(|_| "Capacidad no comprobable")?.path())
                .map_err(|_| "Capacidad no comprobable")?;
            if !meta.is_file() || batch::linked(&meta) {
                return Err("Entrada no regular conservada; no se publica otra copia".into());
            }
            total = total.saturating_add(meta.len());
            if total + MAX_RECORD > MAX_TOTAL {
                return Err("Se alcanza el límite128MiB de copias conservadas. No se elimina contenido para continuar".into());
            }
        }
        let _budget = recovery_inventory::admit(self, source.bytes.len() as u64 + MAX_RECORD)?;
        atomic_io::create(&anchor, &source.bytes).map_err(|_| {
            "No se pudo conservar la preparación; no se ha creado un archivo público"
        })?;
        let (hash, identity, size) = inspect_file(&anchor)?;
        if hash != source.sha || size != source.bytes.len() as u64 {
            return Err("Preparación no comprobable; se conserva sin publicar".into());
        }
        let record = Record {
            format: 1,
            project_id: project.into(),
            attempt_id: request.attempt_id,
            created_at: knownext_core::now_iso(),
            source: source.request,
            source_revision: source.revision,
            location_revision: sha256_hex(root.to_string_lossy().as_bytes()),
            source_commit: source.commit,
            blob: source.blob,
            sha256: source.sha,
            size_bytes: source.bytes.len() as u64,
            name: request.name,
            anchor_identity: identity,
        };
        validate(&record, project, &record.attempt_id)?;
        let raw = serde_json::to_vec(&record).map_err(|_| "No se pudo preparar el recibo")?;
        if raw.len() as u64 > MAX_RECORD {
            return Err("Recibo fuera de límites; se conserva la preparación sin publicar".into());
        }
        atomic_io::create(&receipt, &raw)
            .map_err(|_| "No se pudo conservar el recibo; no se publica la copia")?;
        if read_record(&receipt, project, &record.attempt_id)?.1 != raw
            || context(self, project)? != source.context
        {
            return Err(
                "El recibo o revisión cambió; se conserva la preparación sin publicar".into(),
            );
        }
        destination_free(&root, &record.name)?;
        let target = self.resolve_project_relative(project, &record.name)?;
        fs::hard_link(&anchor,&target).map_err(|_|"No se pudo publicar la copia sin reemplazar archivos. Puede estar ocupado el nombre o no admitir enlaces este sistema de archivos. La preparación se conserva; consulta el recibo sin repetir")?;
        drop(_budget);
        self.review_historical_copy(project, &record.attempt_id)
    }
}
