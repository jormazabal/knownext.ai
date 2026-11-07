//! A recoverable working-file application. Git history/index and private drafts stay separate.
use super::*;
mod backup;
mod incomplete;
mod retention;
mod retirement;
use std::io::Read;
const FILE_LIMIT: u64 = 8 * 1024 * 1024;
const TOTAL_LIMIT: u64 = 32 * 1024 * 1024;
const RECORD_LIMIT: u64 = 256 * 1024;
const MAX_APPLICATIONS: usize = recovery_quotas::APPLICATION_RECORDS;
const MAX_STORED: u64 = recovery_quotas::APPLICATION_BYTES;
const CHUNK: usize = 4;
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Payload {
    sha256: String,
    bytes: u64,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct FileRow {
    path: String,
    before: Option<Payload>,
    after: Option<Payload>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    before_mode: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    after_mode: Option<String>,
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Record {
    format: u8,
    project_id: String,
    plan_id: String,
    plan_revision: String,
    created_at: String,
    location: String,
    origin: String,
    local_reference: String,
    remote_reference: String,
    local_commit: String,
    remote_commit: String,
    unchanged_count: usize,
    rows: Vec<FileRow>,
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Completed {
    format: u8,
    record_sha256: String,
    completed_at: String,
    outcome: String,
}
struct Prepared {
    record: Record,
    revision: String,
    bytes: Vec<(Option<Vec<u8>>, Option<Vec<u8>>)>,
}
fn bounded(path: &Path, limit: u64, budget: &mut u64) -> Result<Vec<u8>, String> {
    let meta =
        fs::symlink_metadata(path).map_err(|_| "No se puede comprobar un archivo conservado")?;
    if !meta.is_file() || batch::linked(&meta) || meta.len() > limit || meta.len() > *budget {
        return Err("Archivo no regular o fuera del presupuesto; se conserva sin aplicar".into());
    }
    let mut bytes = vec![];
    fs::File::open(path)
        .map_err(|_| "No se puede abrir el archivo conservado")?
        .take(limit.min(*budget) + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| "No se pudo leer el archivo completo")?;
    let count = bytes.len() as u64;
    let exhausted = count > *budget;
    *budget = budget.saturating_sub(count);
    if exhausted || count > limit {
        return Err("El archivo creció fuera de los límites; se conserva".into());
    }
    Ok(bytes)
}
fn store(api: &LocalApi, project: &str, id: &str, create: bool) -> Result<PathBuf, String> {
    if !identity(id) || !request_scope::portable_id(project) {
        return Err("Identidad de preparación no compatible".into());
    }
    let parent = api.app_data_dir.join("mixed-applications");
    let group = parent.join(sha256_hex(project.as_bytes()));
    let target = group.join(id);
    recovery_lifecycle::ensure_open(api, &target)?;
    for p in [&api.app_data_dir, &parent, &group] {
        if !directory(p)? && create {
            fs::create_dir(p).map_err(|_| "No se puede reservar la preparación")?;
            directory(p)?;
        }
    }
    directory(&target)?;
    Ok(target)
}
fn quota(group: &Path, additional: u64) -> Result<(), String> {
    let mut total = additional;
    let mut count = 0;
    for entry in fs::read_dir(group).map_err(|_| "No se puede revisar la cuota de preparaciones")? {
        count += 1;
        if count >= MAX_APPLICATIONS {
            return Err("El almacén de preparaciones está lleno; no se podan identidades".into());
        }
        let path = entry.map_err(|_| "Entrada no legible")?.path();
        if !directory(&path)? {
            return Err("Preparación no compatible conservada".into());
        }
        let mut entries = 0;
        for item in fs::read_dir(path).map_err(|_| "No se puede consultar una preparación")? {
            entries += 1;
            if entries > 1027 {
                return Err("Preparación fuera de límites conservada".into());
            }
            let item = item.map_err(|_| "Entrada no legible")?;
            let meta = fs::symlink_metadata(item.path()).map_err(|_| "Entrada no comprobable")?;
            if !meta.is_file() || batch::linked(&meta) {
                return Err("Entrada desconocida conservada; no se inicia otra preparación".into());
            }
            total = total.saturating_add(meta.len());
            if total > MAX_STORED {
                return Err("Las preparaciones superan256MiB; se conservan sin podar".into());
            }
        }
    }
    Ok(())
}
fn target(
    api: &LocalApi,
    project: &str,
    root: &Path,
    name: &str,
    create: bool,
) -> Result<PathBuf, String> {
    path(name.as_bytes())?;
    api.resolve_project_relative(project, name)?;
    if api.project_root(project)?.canonicalize().ok().as_deref() != Some(root) {
        return Err("La ubicación del proyecto cambió".into());
    }
    let resolved = path_policy::resolve(root, name)?;
    let mut parent = root.to_path_buf();
    let parts = name.split('/').collect::<Vec<_>>();
    for part in &parts[..parts.len() - 1] {
        parent.push(part);
        match fs::symlink_metadata(&parent) {
            Ok(meta) if meta.is_dir() && !batch::linked(&meta) => (),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                if create {
                    fs::create_dir(&parent)
                        .map_err(|_| "No se pudo crear una carpeta de destino")?;
                    if !directory(&parent)? {
                        return Err("La carpeta de destino cambió".into());
                    }
                }
            }
            _ => return Err("Una carpeta no es regular; no se sustituyen archivos".into()),
        }
    }
    if resolved != root.join(name.replace('/', std::path::MAIN_SEPARATOR_STR)) {
        return Err("La ruta cambió de ubicación; no se aplica".into());
    }
    Ok(resolved)
}
fn working_budgeted(path: &Path, budget: &mut u64) -> Result<Option<Vec<u8>>, String> {
    match fs::symlink_metadata(path) {
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Ok(_) => bounded(path, FILE_LIMIT, budget).map(Some),
        Err(_) => Err("No se puede consultar un archivo actual; se conserva".into()),
    }
}
fn working(path: &Path) -> Result<Option<Vec<u8>>, String> {
    working_budgeted(path, &mut FILE_LIMIT.clone())
}

fn proof(bytes: Option<&[u8]>) -> Option<Payload> {
    bytes.map(|bytes| Payload {
        sha256: sha256_hex(bytes),
        bytes: bytes.len() as u64,
    })
}
fn matches(bytes: Option<&[u8]>, expected: Option<&Payload>) -> bool {
    match (bytes, expected) {
        (None, None) => true,
        (Some(bytes), Some(expected)) => {
            bytes.len() as u64 == expected.bytes && sha256_hex(bytes) == expected.sha256
        }
        _ => false,
    }
}
fn row_mode(row: &FileRow, before: bool) -> Option<&str> {
    let (payload, mode) = if before {
        (&row.before, &row.before_mode)
    } else {
        (&row.after, &row.after_mode)
    };
    payload
        .as_ref()
        .map(|_| mode.as_deref().unwrap_or("100644"))
}
fn working_mode(path: &Path, fallback: Option<&str>) -> Result<Option<String>, String> {
    let meta = match fs::symlink_metadata(path) {
        Ok(m) if m.is_file() && !batch::linked(&m) => m,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        _ => return Err("Modo de archivo no comprobable".into()),
    };
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fallback;
        Ok(Some(
            if meta.permissions().mode() & 0o111 != 0 {
                "100755"
            } else {
                "100644"
            }
            .into(),
        ))
    }
    #[cfg(not(unix))]
    {
        let _ = meta;
        Ok(Some(fallback.unwrap_or("100644").into()))
    }
}
fn apply_mode(path: &Path, mode: &str) -> Result<(), String> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut permissions = fs::symlink_metadata(path)
            .map_err(|_| "No se pudo comprobar el permiso")?
            .permissions();
        let previous = permissions.mode();
        permissions.set_mode(if mode == "100755" {
            previous | ((previous & 0o444) >> 2)
        } else {
            previous & !0o111
        });
        fs::set_permissions(path, permissions).map_err(|_| {
            "Contenido conservado, permiso sin confirmar. Revisa antes de continuar"
        })?;
    }
    #[cfg(not(unix))]
    {
        let _ = (path, mode);
    }
    Ok(())
}
fn blob(source: &Context, entry: Option<&Entry>) -> Result<Option<Vec<u8>>, String> {
    let Some(entry) = entry else { return Ok(None) };
    if !matches!(entry.mode.as_str(), "100644" | "100755") {
        return Err("Los archivos ejecutables requieren preparación manual; se conservan".into());
    }
    let size = read_git(&source.root, &["cat-file", "-s", &entry.blob])?;
    let size = std::str::from_utf8(&size)
        .ok()
        .and_then(|s| s.trim().parse::<u64>().ok())
        .filter(|n| *n <= FILE_LIMIT)
        .ok_or("Una variante supera8MiB")?;
    let bytes = read_git_bounded(&source.root, &["cat-file", "blob", &entry.blob], FILE_LIMIT)?;
    if bytes.len() as u64 != size {
        return Err("La variante cambió durante la lectura".into());
    }
    Ok(Some(bytes))
}
fn validate_content(name: &str, bytes: Option<&[u8]>) -> Result<(), String> {
    if let Some(bytes) = bytes {
        if is_markdown_path(Path::new(name)) {
            std::str::from_utf8(bytes)
                .map_err(|_| "El documento no es Markdown UTF8 compatible")?;
        }
        if is_handwritten_note_path(Path::new(name)) {
            let value: Value = serde_json::from_slice(bytes)
                .map_err(|_| "La nota no es legible; se conserva sin normalizar")?;
            document_validation::handwritten(&value)?;
        }
    }
    Ok(())
}
fn prepare(api: &LocalApi, project: &str, id: &str) -> Result<Prepared, String> {
    let (plan, plan_revision) = read(api, project, id)?;
    let reviewed = api.review_mixed_selection(project, id)?;
    if reviewed["additionalCount"] != 0 {
        return Err(
            "Hay cambios registrados fuera de la selección; prepara una revisión nueva".into(),
        );
    }
    let source = context(api, project)?;
    mixed_application_guard::ensure(&source.root)?;
    if reviewed["revision"] != source.revision {
        return Err("El historial cambió; vuelve a revisar".into());
    }
    if api
        .app_data_dir
        .canonicalize()
        .map_err(|_| "Almacén no comprobable")?
        .starts_with(&source.root)
    {
        return Err(
            "La preparación necesita conservar sus copias fuera de la carpeta del proyecto".into(),
        );
    }
    if !read_git(
        &source.root,
        &[
            "status",
            "--porcelain=v1",
            "-z",
            "--untracked-files=all",
            "--ignore-submodules=none",
        ],
    )?
    .is_empty()
    {
        return Err("Guarda o revisa los cambios sin registrar antes de aplicar variantes".into());
    }
    let current = tree(&source, &source.local)?;
    let mut rows = vec![];
    let mut values = vec![];
    let mut total = 0u64;
    let mut read_budget = 64 * 1024 * 1024u64;
    for row in &plan.rows {
        let entry = match row.choice.as_str() {
            "local" => row.local.as_ref(),
            "remote" => row.remote.as_ref(),
            _ => {
                let entry = current.get(&row.path);
                if entry.is_none() || entry == row.local.as_ref() || entry == row.remote.as_ref() {
                    return Err("Prepara y registra primero el contenido combinado elegido; no se inventa con IA".into());
                }
                entry
            }
        };
        let after = blob(&source, entry)?;
        read_budget = read_budget
            .checked_sub(after.as_ref().map_or(0, |b| b.len() as u64))
            .ok_or("La preparación supera64MiB de lecturas documentales; reduce el alcance")?;
        let path = target(api, project, &source.root, &row.path, false)?;
        let before = working_budgeted(&path, &mut read_budget)?;
        validate_content(&row.path, before.as_deref())?;
        validate_content(&row.path, after.as_deref())?;
        let before_mode = working_mode(
            &path,
            current.get(&row.path).map(|entry| entry.mode.as_str()),
        )?;
        let after_mode = entry.map(|entry| entry.mode.clone());
        #[cfg(not(unix))]
        if before_mode != after_mode
            && before_mode
                .iter()
                .chain(after_mode.iter())
                .any(|m| m == "100755")
        {
            return Err("Este sistema no representa cambios del permiso ejecutable sin alterar el índice. Conserva las copias y registra ese cambio de modo desde un sistema compatible".into());
        }
        if before == after && before_mode == after_mode {
            continue;
        }

        if api.read_draft(&doc_id(project, &row.path))?.is_some() {
            return Err(format!(
                "{} tiene un borrador privado. Revísalo antes de sustituir el archivo",
                row.path
            ));
        }
        if fs::symlink_metadata(&path).is_ok_and(|m| m.permissions().readonly()) {
            return Err(format!("{} es de solo lectura; se conserva", row.path));
        }
        total = total
            .saturating_add(before.as_ref().map_or(0, |b| b.len() as u64))
            .saturating_add(after.as_ref().map_or(0, |b| b.len() as u64));
        if total > TOTAL_LIMIT {
            return Err("Las copias antes/después superan32MiB; reduce el alcance".into());
        }
        rows.push(FileRow {
            path: row.path.clone(),
            before: proof(before.as_deref()),
            after: proof(after.as_deref()),
            before_mode,
            after_mode,
        });
        values.push((before, after));
    }
    let unchanged = plan.rows.len() - rows.len();
    let record = Record {
        format: 2,
        project_id: project.into(),
        plan_id: id.into(),
        plan_revision,
        created_at: plan.created_at,
        location: sha256_hex(source.root.to_string_lossy().as_bytes()),
        origin: source.origin_revision,
        local_reference: source.local_reference,
        remote_reference: source.remote_reference,
        local_commit: source.local,
        remote_commit: source.remote,
        unchanged_count: unchanged,
        rows,
    };
    if context(api, project)?.revision != source.revision
        || read(api, project, id)?.1 != record.plan_revision
    {
        return Err("El ámbito cambió durante la preparación; vuelve a revisar".into());
    }
    let bytes = serde_json::to_vec(&record).map_err(|_| "No se pudo identificar la preparación")?;
    Ok(Prepared {
        revision: sha256_hex(&bytes),
        record,
        bytes: values,
    })
}
fn payload_path(folder: &Path, index: usize, side: &str) -> PathBuf {
    folder.join(format!("{index:03}-{side}.bin"))
}
fn payload_bytes(path: &Path, budget: &mut u64) -> Result<Vec<u8>, String> {
    match fs::symlink_metadata(path) {
        Ok(_) => bounded(path, FILE_LIMIT, budget),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            let packed = bounded(
                &path.with_extension("bin.zip"),
                recovery_copy_storage::PACKED_LIMIT,
                budget,
            )?;
            recovery_copy_storage::unpack_resource(&packed, budget)
        }
        Err(_) => Err("No se puede comprobar una copia conservada; se mantiene".into()),
    }
}
fn load_inner(
    api: &LocalApi,
    project: &str,
    id: &str,
    check_payloads: bool,
) -> Result<Option<(Record, String, PathBuf)>, String> {
    let folder = store(api, project, id, false)?;
    if !directory(&folder)? {
        return Ok(None);
    }
    let raw = bounded(
        &folder.join("record.json"),
        RECORD_LIMIT,
        &mut RECORD_LIMIT.clone(),
    )
    .map_err(|_| {
        "Hay una preparación incompleta o incompatible. Se conserva sin reiniciar ni aplicar"
    })?;
    let record: Record = serde_json::from_slice(&raw)
        .map_err(|_| "Formato de preparación desconocido; se conserva")?;
    if !matches!(record.format, 1 | 2)
        || record.project_id != project
        || record.plan_id != id
        || !hash(&record.plan_revision)
        || !hash(&record.location)
        || !hash(&record.origin)
        || !version_history::is_commit_id(&record.local_commit)
        || !version_history::is_commit_id(&record.remote_commit)
        || record.rows.is_empty()
        || record.rows.len() > MAX_ROWS
        || record.unchanged_count + record.rows.len() > MAX_ROWS
        || OffsetDateTime::parse(&record.created_at, &Rfc3339).is_err()
    {
        return Err("Preparación no compatible; se conserva sin reinterpretar".into());
    }
    let mut seen = std::collections::HashSet::new();
    let mut budget = 64 * 1024 * 1024;
    let mut declared = 0u64;
    let mut names = BTreeSet::from([
        "record.json".to_string(),
        "completed.json".into(),
        "retirement.json".into(),
    ]);
    if check_payloads && retirement::present(&folder)? {
        return Err("Las copias de esta preparación tienen una retirada registrada. Consulta su conservación; no se aplica ni reinicia".into());
    }
    for (index, row) in record.rows.iter().enumerate() {
        path(row.path.as_bytes())?;
        if record.format == 1 && (row.before_mode.is_some() || row.after_mode.is_some())
            || record.format == 2
                && (row.before.is_some() != row.before_mode.is_some()
                    || row.after.is_some() != row.after_mode.is_some())
            || row
                .before_mode
                .iter()
                .chain(row.after_mode.iter())
                .any(|m| !matches!(m.as_str(), "100644" | "100755"))
        {
            return Err("Modos de archivo incompatibles; se conservan sin aplicar".into());
        }
        if !seen.insert(portable_paths::key(&row.path))
            || row.before.is_none() && row.after.is_none()
        {
            return Err("Rutas de preparación incompatibles".into());
        }
        for (side, proof) in [("before", &row.before), ("after", &row.after)] {
            if let Some(proof) = proof {
                if !hash(&proof.sha256) || proof.bytes > FILE_LIMIT {
                    return Err("Huella de preparación incompatible".into());
                }
                declared = declared.saturating_add(proof.bytes);
                if declared > TOTAL_LIMIT {
                    return Err(
                        "El contenido conservado supera32MiB; se preserva sin aplicar".into(),
                    );
                }
                let path = payload_path(&folder, index, side);
                names.insert(
                    path.with_extension("bin.zip")
                        .file_name()
                        .unwrap_or_default()
                        .to_string_lossy()
                        .into(),
                );
                names.insert(
                    path.file_name()
                        .unwrap_or_default()
                        .to_string_lossy()
                        .into(),
                );
                if check_payloads {
                    let raw = payload_bytes(&path, &mut budget)?;
                    if raw.len() as u64 != proof.bytes || sha256_hex(&raw) != proof.sha256 {
                        return Err("Una copia conservada cambió; no se aplica ni repara".into());
                    }
                    validate_content(&row.path, Some(&raw))?;
                }
            }
        }
    }
    for (index, entry) in fs::read_dir(&folder)
        .map_err(|_| "No se puede revisar la preparación")?
        .enumerate()
    {
        if index > 1026 {
            return Err("La preparación tiene entradas adicionales; se conserva".into());
        }
        let entry = entry.map_err(|_| "Entrada desconocida")?;
        if !entry
            .file_name()
            .to_str()
            .is_some_and(|name| names.contains(name))
        {
            return Err("Hay entradas desconocidas; se conservan sin aplicar".into());
        }
        let meta = fs::symlink_metadata(entry.path()).map_err(|_| "Entrada no comprobable")?;
        if !meta.is_file() || batch::linked(&meta) {
            return Err("Entrada no regular; se conserva".into());
        }
    }
    Ok(Some((record, sha256_hex(&raw), folder)))
}
fn load(
    api: &LocalApi,
    project: &str,
    id: &str,
) -> Result<Option<(Record, String, PathBuf)>, String> {
    load_inner(api, project, id, true)
}
fn admission(
    api: &LocalApi,
    record: &Record,
    digest: &str,
) -> Result<mixed_application_guard::Marker, String> {
    Ok(mixed_application_guard::Marker {
        format: 1,
        project_id: record.project_id.clone(),
        plan_id: record.plan_id.clone(),
        record_sha256: digest.into(),
        store_sha256: sha256_hex(
            api.app_data_dir
                .canonicalize()
                .map_err(|_| "Almacén no comprobable")?
                .to_string_lossy()
                .as_bytes(),
        ),
    })
}
fn observe(api: &LocalApi, project: &str, id: &str) -> Result<Value, String> {
    if retirement::present(&store(api, project, id, false)?)? {
        return retirement::application_review(api, project, id);
    }
    let Some((record, record_hash, folder)) = load(api, project, id)? else {
        return Ok(
            json!({"schemaVersion":1,"projectId":project,"planId":id,"phase":"absent","canContinue":false,"rows":[],"checkedAt":knownext_core::now_iso()}),
        );
    };
    let source = context(api, project).ok();
    let located = source
        .as_ref()
        .is_some_and(|s| sha256_hex(s.root.to_string_lossy().as_bytes()) == record.location);
    let valid = source.as_ref().is_some_and(|s| {
        located
            && s.origin_revision == record.origin
            && s.local_reference == record.local_reference
            && s.remote_reference == record.remote_reference
            && s.local == record.local_commit
            && s.remote == record.remote_commit
    }) && read(api, project, id)
        .is_ok_and(|(_, revision)| revision == record.plan_revision);
    let marker = folder.join("completed.json");
    let completed = match fs::symlink_metadata(&marker) {
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
        Ok(_) => {
            let raw = bounded(&marker, 4096, &mut 4096)?;
            let value: Completed = serde_json::from_slice(&raw)
                .map_err(|_| "La confirmación tiene un formato desconocido; se conserva")?;
            if value.format != 1
                || !matches!(value.outcome.as_str(), "applied" | "abandoned")
                || value.record_sha256 != record_hash
                || OffsetDateTime::parse(&value.completed_at, &Rfc3339).is_err()
            {
                return Err("Confirmación no compatible; se conserva sin repetir".into());
            }
            Some(value.outcome)
        }
        Err(_) => return Err("No se puede comprobar la confirmación".into()),
    };
    let mode_tree = source
        .as_ref()
        .map(|s| tree(s, &s.local))
        .transpose()
        .ok()
        .flatten()
        .unwrap_or_default();
    let mut rows = vec![];
    let mut blocked = !valid;
    let mut pending = 0;
    let mut after_count = 0;
    let mut read_budget = 64 * 1024 * 1024u64;
    for row in &record.rows {
        let actual = if located {
            source
                .as_ref()
                .map(|s| {
                    target(api, project, &s.root, &row.path, false)
                        .and_then(|p| working_budgeted(&p, &mut read_budget))
                })
                .transpose()
        } else {
            Ok(None)
        };
        let (state, current_hash) = match actual {
            Ok(Some(bytes)) => {
                let current_hash = bytes.as_ref().map(|b| sha256_hex(b));
                let draft = api.read_draft(&doc_id(project, &row.path));
                let actual_mode = source
                    .as_ref()
                    .and_then(|s| target(api, project, &s.root, &row.path, false).ok())
                    .and_then(|p| {
                        working_mode(&p, mode_tree.get(&row.path).map(|e| e.mode.as_str())).ok()
                    })
                    .flatten();
                if matches(bytes.as_deref(), row.after.as_ref())
                    && actual_mode.as_deref() == row_mode(row, false)
                {
                    after_count += 1;
                    ("after", current_hash)
                } else if (matches(bytes.as_deref(), row.before.as_ref())
                    || matches(bytes.as_deref(), row.after.as_ref()))
                    && actual_mode.as_deref() == row_mode(row, true)
                    && draft.is_ok_and(|d| d.is_none())
                {
                    pending += 1;
                    ("before", current_hash)
                } else {
                    blocked = true;
                    ("changed", current_hash)
                }
            }
            _ => {
                blocked = true;
                ("unavailable", None)
            }
        };
        rows.push(json!({"path":row.path,"state":state,"currentHash":current_hash,"action":if row.after.is_none(){"delete"}else if row.before.is_none(){"create"}else{"replace"},"beforeBytes":row.before.as_ref().map(|p|p.bytes),"afterBytes":row.after.as_ref().map(|p|p.bytes),"beforeMode":row_mode(row,true),"afterMode":row_mode(row,false)}));
    }
    let outcome = completed;
    let completed = outcome.is_some();
    let phase = if outcome.as_deref() == Some("abandoned") {
        "abandoned"
    } else if completed {
        if after_count == record.rows.len() {
            "completed"
        } else {
            "changed"
        }
    } else if blocked {
        "blocked"
    } else if after_count == 0 {
        "prepared"
    } else {
        "partial"
    };
    let revision=sha256_hex(&serde_json::to_vec(&json!({"record":record_hash,"scope":source.as_ref().map(|s|&s.revision),"valid":valid,"destinationLocation":api.project_root(project).ok().and_then(|p|p.canonicalize().ok()).map(|p|sha256_hex(p.to_string_lossy().as_bytes())),"completed":completed,"rows":rows})).map_err(|_|"No se pudo identificar el estado")?);
    let owned = api
        .project_root(project)
        .ok()
        .and_then(|p| p.canonicalize().ok())
        .is_some_and(|root| {
            admission(api, &record, &record_hash)
                .is_ok_and(|marker| mixed_application_guard::owns(&root, &marker))
        });
    Ok(
        json!({"schemaVersion":1,"projectId":project,"planId":id,"planRevision":record.plan_revision,"revision":revision,"phase":phase,"canContinue":!completed&&!blocked,"canRelease":completed&&owned,"canAbandon":!completed,"rows":rows,"unchangedCount":record.unchanged_count,"appliedCount":after_count,"pendingCount":pending,"copiesPreserved":true,"scopeMatches":valid,"canReplay":false,"checkedAt":knownext_core::now_iso(),"message":if completed{"La preparación registrada se conserva. El estado por archivo corresponde a esta consulta."}else if blocked{"El ámbito, un borrador o un archivo cambió. Se conservan las copias; no se sobrescribe trabajo posterior."}else{"Las copias anteriores y elegidas están conservadas. Continuar requiere esta revisión y confirmación explícita."}}),
    )
}
impl LocalApi {
    pub(crate) fn preview_mixed_application(
        &self,
        project: &str,
        id: &str,
    ) -> Result<Value, String> {
        let folder = store(self, project, id, false)?;
        if directory(&folder)? {
            return Err("Esta selección ya tiene una preparación conservada. Consulta su resultado sin reiniciarla".into());
        }
        let p = prepare(self, project, id)?;
        Ok(
            json!({"schemaVersion":1,"projectId":project,"planId":id,"planRevision":p.record.plan_revision,"revision":p.revision,"phase":"preview","canContinue":false,"canStart":!p.record.rows.is_empty(),"unchangedCount":p.record.unchanged_count,"rows":p.record.rows.iter().map(|r|json!({"path":r.path,"action":if r.after.is_none(){"delete"}else if r.before.is_none(){"create"}else{"replace"},"state":"before","beforeBytes":r.before.as_ref().map(|p|p.bytes),"afterBytes":r.after.as_ref().map(|p|p.bytes),"beforeMode":row_mode(r,true),"afterMode":row_mode(r,false)})).collect::<Vec<_>>(),"checkedAt":knownext_core::now_iso()}),
        )
    }
    pub(crate) fn review_mixed_application(
        &self,
        project: &str,
        id: &str,
    ) -> Result<Value, String> {
        observe(self, project, id)
    }
    pub(crate) fn start_mixed_application(
        &self,
        project: &str,
        id: &str,
        body: Value,
    ) -> Result<Value, String> {
        #[derive(Deserialize)]
        #[serde(deny_unknown_fields)]
        struct Request {
            revision: String,
            acknowledge: bool,
        }
        let request: Request =
            serde_json::from_value(body).map_err(|_| "Solicitud de aplicación no compatible")?;
        if !request.acknowledge {
            return Err("Confirma los cambios y las copias antes de aplicar".into());
        }
        let _permit = self.project_transaction(project)?;
        let p = prepare(self, project, id)?;
        if request.revision != p.revision || p.record.rows.is_empty() {
            return Err(
                "La revisión cambió o no hay archivos que aplicar; consulta de nuevo".into(),
            );
        }
        let folder = store(self, project, id, true)?;
        if directory(&folder)? {
            return Err("Este intento ya está reservado; consulta sin repetir".into());
        }
        let raw =
            serde_json::to_vec(&p.record).map_err(|_| "No se pudo conservar la preparación")?;
        if raw.len() as u64 > RECORD_LIMIT {
            return Err("La preparación supera256KiB; no se ha aplicado".into());
        }
        let size = p
            .bytes
            .iter()
            .map(|(a, b)| {
                a.as_ref().map_or(0, |v| v.len() as u64) + b.as_ref().map_or(0, |v| v.len() as u64)
            })
            .sum::<u64>();
        quota(
            folder.parent().ok_or("Falta el almacén")?,
            size + raw.len() as u64,
        )?;
        let _budget = recovery_inventory::admit(self, size + raw.len() as u64 + 4096)?;
        fs::create_dir(&folder)
            .map_err(|_| "No se pudo reservar una preparación nueva; consulta sin repetir")?;
        for (index, (before, after)) in p.bytes.iter().enumerate() {
            for (side, bytes) in [("before", before), ("after", after)] {
                if let Some(bytes) = bytes {
                    atomic_io::create(&payload_path(&folder,index,side),bytes).map_err(|_|"No se completaron las copias. Los archivos originales aún no se han sustituido; conserva esta preparación")?;
                }
            }
        }
        atomic_io::create(&folder.join("record.json"), &raw)
            .map_err(|_| "No se confirmó el recibo previo. No se han aplicado variantes")?;
        let reviewed = observe(self, project, id)?;
        self.continue_mixed_application(
            project,
            id,
            json!({"revision":reviewed["revision"],"acknowledge":true}),
        )
    }
    pub(crate) fn continue_mixed_application(
        &self,
        project: &str,
        id: &str,
        body: Value,
    ) -> Result<Value, String> {
        #[derive(Deserialize)]
        #[serde(deny_unknown_fields)]
        struct Request {
            revision: String,
            acknowledge: bool,
        }
        let request: Request =
            serde_json::from_value(body).map_err(|_| "Continuación no compatible")?;
        if !request.acknowledge {
            return Err("Confirma esta revisión antes de continuar".into());
        }
        let _permit = self.project_transaction(project)?;
        let reviewed = observe(self, project, id)?;
        if reviewed["revision"] != request.revision || reviewed["canContinue"] != true {
            return Err(
                "La preparación cambió, está bloqueada o ya terminó. Consulta sin repetir".into(),
            );
        }
        let (record, record_hash, folder) =
            load(self, project, id)?.ok_or("Preparación no disponible")?;
        let source = context(self, project)?;
        let guard = admission(self, &record, &record_hash)?;
        mixed_application_guard::reserve(&source.root, &guard)?;
        let mode_tree = tree(&source, &source.local)?;
        let mut writes = 0;
        for (index, row) in record.rows.iter().enumerate() {
            let path = target(self, project, &source.root, &row.path, false)?;
            let current = working(&path)?;
            let actual_mode =
                working_mode(&path, mode_tree.get(&row.path).map(|e| e.mode.as_str()))?;
            if matches(current.as_deref(), row.after.as_ref())
                && actual_mode.as_deref() == row_mode(row, false)
            {
                continue;
            }
            if writes == CHUNK {
                break;
            }
            if (!(matches(current.as_deref(), row.before.as_ref())
                || matches(current.as_deref(), row.after.as_ref()))
                || actual_mode.as_deref() != row_mode(row, true))
                || self.read_draft(&doc_id(project, &row.path))?.is_some()
            {
                return Err("Un archivo o borrador cambió; se conserva y se detiene el conjunto para revisión".into());
            }
            if let Some(after) = &row.after {
                let bytes = payload_bytes(
                    &payload_path(&folder, index, "after"),
                    &mut (FILE_LIMIT + recovery_copy_storage::PACKED_LIMIT),
                )?;
                if sha256_hex(&bytes) != after.sha256 {
                    return Err("La copia elegida cambió; se conserva sin aplicar".into());
                }
                let path = target(self, project, &source.root, &row.path, true)?;
                if row.before.is_some(){atomic_io::write(&path,&bytes)}else{atomic_io::create(&path,&bytes)}.map_err(|_|"No se confirmó una escritura. Consulta el conjunto; las copias anteriores siguen conservadas")?;
            } else {
                let meta = fs::symlink_metadata(&path)
                    .map_err(|_| "El archivo cambió antes de retirarlo")?;
                if !meta.is_file() || batch::linked(&meta) || meta.permissions().readonly() {
                    return Err("El archivo no es regular o es de solo lectura; se conserva".into());
                }
                fs::remove_file(&path).map_err(|_| {
                    "No se confirmó la retirada del archivo; su copia anterior se conserva"
                })?;
            }
            if let Some(mode) = row_mode(row, false) {
                apply_mode(&path, mode)?;
            }
            if !matches(working(&path)?.as_deref(), row.after.as_ref())
                || working_mode(&path, mode_tree.get(&row.path).map(|e| e.mode.as_str()))?
                    .as_deref()
                    != row_mode(row, false)
            {
                return Err("No se confirmó el contenido escrito; consulta sin repetir".into());
            }
            writes += 1;
        }
        if context(self, project)? != source
            || bounded(
                &folder.join("record.json"),
                RECORD_LIMIT,
                &mut RECORD_LIMIT.clone(),
            )?
            .as_slice()
                != serde_json::to_vec(&record)
                    .map_err(|_| "Recibo no comprobable")?
                    .as_slice()
        {
            return Err(
                "El ámbito o recibo cambió. Las copias se conservan; consulta sin repetir".into(),
            );
        }
        let after = observe(self, project, id)?;
        if after["canContinue"] == true && after["pendingCount"] == 0 {
            let marker = Completed {
                format: 1,
                record_sha256: record_hash,
                completed_at: knownext_core::now_iso(),
                outcome: "applied".into(),
            };
            atomic_io::create(
                &folder.join("completed.json"),
                &serde_json::to_vec(&marker).map_err(|_| "No se pudo preparar la confirmación")?,
            )
            .map_err(|_| "La confirmación final no se recibió. Consulta antes de continuar")?;
        }
        let result = observe(self, project, id)?;
        if result["phase"] == "completed" {
            mixed_application_guard::release(&source.root, &guard)?;
        }
        observe(self, project, id)
    }
    pub(crate) fn close_mixed_application(
        &self,
        project: &str,
        id: &str,
        body: Value,
    ) -> Result<Value, String> {
        #[derive(Deserialize)]
        #[serde(deny_unknown_fields)]
        struct Request {
            revision: String,
            action: String,
            acknowledge: bool,
        }
        let request: Request = serde_json::from_value(body).map_err(|_| "Cierre no compatible")?;
        let _permit = self.project_transaction(project)?;
        let reviewed = observe(self, project, id)?;
        if !request.acknowledge
            || reviewed["revision"] != request.revision
            || !matches!(request.action.as_str(), "abandon" | "release")
        {
            return Err("Revisa y confirma el cierre antes de continuar".into());
        }
        let (record, record_hash, folder) =
            load(self, project, id)?.ok_or("Preparación no disponible")?;
        let root = self
            .project_root(project)?
            .canonicalize()
            .map_err(|_| "Destino no comprobable")?;
        let guard = admission(self, &record, &record_hash)?;
        mixed_application_guard::can_release(&root, &guard)?;
        if request.action == "abandon" {
            if reviewed["canAbandon"] != true {
                return Err("La preparación ya está cerrada; consulta su resultado".into());
            }
            let marker = Completed {
                format: 1,
                record_sha256: record_hash,
                completed_at: knownext_core::now_iso(),
                outcome: "abandoned".into(),
            };
            atomic_io::create(
                &folder.join("completed.json"),
                &serde_json::to_vec(&marker).map_err(|_| "No se pudo preparar el cierre")?,
            )
            .map_err(|_| "No se confirmó el cierre; consulta sin repetir")?;
        } else if reviewed["canRelease"] != true {
            return Err("Esta admisión no está pendiente de finalizar".into());
        }
        mixed_application_guard::release(&root, &guard)?;
        observe(self, project, id)
    }
    pub(crate) fn copy_mixed_application_payload(
        &self,
        project: &str,
        id: &str,
        body: Value,
    ) -> Result<Value, String> {
        #[derive(Deserialize)]
        #[serde(deny_unknown_fields)]
        struct Request {
            revision: String,
            path: String,
            side: String,
            name: String,
        }
        let request: Request =
            serde_json::from_value(body).map_err(|_| "Solicitud de copia no compatible")?;
        let _permit = self.project_transaction(project)?;
        let reviewed = observe(self, project, id)?;
        if reviewed["revision"] != request.revision
            || !matches!(request.side.as_str(), "before" | "after")
        {
            return Err("Revisa la copia conservada antes de recuperarla".into());
        }
        let (record, _, folder) =
            load(self, project, id)?.ok_or("No hay una preparación conservada")?;
        let (index, row) = record
            .rows
            .iter()
            .enumerate()
            .find(|(_, r)| r.path == request.path)
            .ok_or("Ruta no conservada")?;
        let expected = if request.side == "before" {
            &row.before
        } else {
            &row.after
        };
        let expected = expected
            .as_ref()
            .ok_or("Esta variante representa ausencia de archivo")?;
        portable_paths::component(&request.name)?;
        if Path::new(&request.name).extension() != Path::new(&row.path).extension() {
            return Err("Conserva la extensión de la copia elegida".into());
        }
        let bytes = payload_bytes(
            &payload_path(&folder, index, &request.side),
            &mut (FILE_LIMIT + recovery_copy_storage::PACKED_LIMIT),
        )?;
        if sha256_hex(&bytes) != expected.sha256 {
            return Err("La copia conservada cambió; no se recupera".into());
        }
        let root = self
            .project_root(project)?
            .canonicalize()
            .map_err(|_| "Ubicación de destino no comprobable")?;
        let path = target(self, project, &root, &request.name, false)?;
        if self.read_draft(&doc_id(project, &request.name))?.is_some() {
            return Err("El destino tiene un borrador. Elige otro nombre".into());
        }
        atomic_io::create(&path, &bytes).map_err(|_| {
            "El destino ya existe o la copia no se confirmó. Comprueba el árbol antes de repetir"
        })?;
        if working(&path)?.as_deref() != Some(bytes.as_slice()) {
            return Err("No se confirmó la copia. El original conservado permanece".into());
        }
        Ok(
            json!({"projectId":project,"planId":id,"name":request.name,"documentId":doc_id(project,&request.name),"sha256":expected.sha256,"bytes":bytes.len(),"checkedAt":knownext_core::now_iso()}),
        )
    }
}

impl LocalApi {
    pub(crate) fn lifecycle_application_record(&self, raw: &[u8], completed: &[u8]) -> bool {
        let Ok(record) = serde_json::from_slice::<Record>(raw) else {
            return false;
        };
        let valid = load_inner(self, &record.project_id, &record.plan_id, false)
            .is_ok_and(|v| v.is_some_and(|(_, digest, _)| digest == sha256_hex(raw)));
        let released = self
            .project_root(&record.project_id)
            .ok()
            .and_then(|p| p.canonicalize().ok())
            .is_some_and(|root| {
                admission(self, &record, &sha256_hex(raw)).is_ok_and(|guard| {
                    mixed_application_guard::can_release(&root, &guard).is_ok()
                        && !mixed_application_guard::owns(&root, &guard)
                })
            });
        valid
            && released
            && serde_json::from_slice::<Completed>(completed).is_ok_and(|c| {
                c.format == 1
                    && c.record_sha256 == sha256_hex(raw)
                    && matches!(c.outcome.as_str(), "applied" | "abandoned")
                    && OffsetDateTime::parse(&c.completed_at, &Rfc3339).is_ok()
            })
    }
}
