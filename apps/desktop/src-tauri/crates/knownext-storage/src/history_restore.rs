//! Reviewed restoration creates a new child commit without consuming the user's index or draft.
use super::*;
use base64::Engine;
use std::{fs, io::Read};
const MAX_FILE: u64 = 32 * 1024 * 1024;
const MAX_RECORD: u64 = 64 * 1024;
const MAX_STORE: u64 = 256 * 1024 * 1024;
const MAX_ATTEMPTS: usize = 64;
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Source {
    document_id: String,
    version_id: String,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Apply {
    document_id: String,
    version_id: String,
    revision: String,
    attempt_id: String,
    acknowledge: bool,
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Receipt {
    schema_version: u8,
    project_id: String,
    document_id: String,
    attempt_id: String,
    revision: String,
    root_hash: String,
    path: String,
    source_path: String,
    source_version: String,
    source_blob: String,
    source_sha256: String,
    source_bytes: u64,
    previous_sha256: Option<String>,
    previous_head: String,
    new_version: String,
    phase: String,
    created_at: String,
    draft_preserved: bool,
}
struct Prepared {
    source: Source,
    root: PathBuf,
    target: PathBuf,
    path: String,
    source_path: String,
    blob: String,
    mode: String,
    bytes: Vec<u8>,
    before: Option<Vec<u8>>,
    draft: Option<String>,
    head: String,
    index: Option<String>,
    revision: String,
}
fn sha(s: &str) -> bool {
    s.len() == 64 && s.bytes().all(|b| b.is_ascii_hexdigit())
}
fn attempt(s: &str) -> bool {
    s.strip_prefix("history-restore-")
        .is_some_and(|id| id.len() == 32 && id.bytes().all(|b| b.is_ascii_hexdigit()))
}
fn relative(path: &str) -> Result<(), String> {
    if path.is_empty() || path.len() > 4096 || path.contains('\\') {
        return Err("Ruta histórica no portable".into());
    }
    for part in path.split('/') {
        if matches!(
            part.to_ascii_lowercase().as_str(),
            "owner.lock" | "runtime-owner.lock" | "capture.lock"
        ) {
            return Err("Los archivos de coordinación no son contenido documental".into());
        }
        portable_paths::component(part)?;
    }
    Ok(())
}
fn regular_directory(path: &Path, optional: bool) -> Result<(), String> {
    match fs::symlink_metadata(path) {
        Ok(m) if m.is_dir() && !batch::linked(&m) => Ok(()),
        Err(e) if optional && e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        _ => Err("La ubicación histórica no es una carpeta regular; se conserva".into()),
    }
}
fn read(path: &Path, max: u64) -> Result<Option<Vec<u8>>, String> {
    let m = match fs::symlink_metadata(path) {
        Ok(m) => m,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(_) => return Err("No se puede comprobar el archivo; se conserva".into()),
    };
    if !m.is_file() || batch::linked(&m) || m.len() > max {
        return Err("Archivo histórico no regular o fuera de límite; se conserva".into());
    }
    let mut bytes = vec![];
    let mut f = fs::File::open(path).map_err(|_| "Archivo no legible")?;
    let identity =
        local_file_identity::identity(&f).map_err(|_| "Identidad de archivo no comprobable")?;
    f.by_ref()
        .take(max + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| "Lectura histórica incompleta")?;
    let after = fs::symlink_metadata(path).map_err(|_| "El archivo cambió")?;
    let again = fs::File::open(path).map_err(|_| "El archivo cambió")?;
    if bytes.len() as u64 != m.len()
        || bytes.len() as u64 > max
        || after.len() != m.len()
        || after.modified().ok() != m.modified().ok()
        || batch::linked(&after)
        || local_file_identity::identity(&again).ok().as_deref() != Some(&identity)
    {
        return Err("El archivo cambió mientras se comprobaba".into());
    }
    Ok(Some(bytes))
}
fn target(api: &LocalApi, project: &str, path: &str) -> Result<PathBuf, String> {
    relative(path)?;
    let root = api.project_root(project)?;
    let mut next = root.clone();
    regular_directory(&root, false)?;
    for part in path.split('/').take(path.split('/').count() - 1) {
        next.push(part);
        regular_directory(&next, true)?;
    }
    let resolved = api.resolve_project_relative(project, path)?;
    if let Ok(m) = fs::symlink_metadata(&resolved) {
        if !m.is_file() || batch::linked(&m) {
            return Err("El destino no es un archivo regular; se conserva".into());
        }
    }
    Ok(resolved)
}
fn git(root: &Path, args: &[&str], index: Option<&Path>) -> Result<Vec<u8>, String> {
    let mut c = local_git_command();
    c.arg("-C")
        .arg(root)
        .args([
            "-c",
            "core.hooksPath=/dev/null",
            "-c",
            "commit.gpgsign=false",
            "-c",
            "user.name=KnowNext.ai",
            "-c",
            "user.email=knownext.local@knownext.ai",
            "-c",
            "gc.auto=0",
            "-c",
            "maintenance.auto=false",
            "-c",
            "protocol.allow=never",
        ])
        .args(args)
        .env("GIT_NO_REPLACE_OBJECTS", "1")
        .env("GIT_OPTIONAL_LOCKS", "0")
        .env_remove("GIT_INDEX_FILE");
    if let Some(index) = index {
        c.env("GIT_INDEX_FILE", index);
    }
    let o = run_local_git(&mut c)?;
    if !o.status.success() {
        return Err("No se pudo completar la operación histórica local; consulta su recibo antes de repetir".into());
    }
    if o.stdout.len() > MAX_FILE as usize {
        return Err("El resultado histórico supera32MiB".into());
    }
    Ok(o.stdout)
}
fn text(root: &Path, args: &[&str], index: Option<&Path>) -> Result<String, String> {
    String::from_utf8(git(root, args, index)?)
        .map(|s| s.trim().to_owned())
        .map_err(|_| "Resultado histórico no representable".into())
}
fn folder(api: &LocalApi, project: &str, id: Option<&str>) -> Result<PathBuf, String> {
    if !request_scope::portable_id(project) || id.is_some_and(|id| !attempt(id)) {
        return Err("Identidad de restauración no válida".into());
    }
    let root = api.app_data_dir.join("history-restores");
    regular_directory(&api.app_data_dir, false)?;
    regular_directory(&root, true)?;
    let project = root.join(sha256_hex(project.as_bytes()));
    regular_directory(&project, true)?;
    if let Some(id) = id {
        let item = project.join(id);
        regular_directory(&item, true)?;
        Ok(item)
    } else {
        Ok(project)
    }
}
fn prepare(api: &LocalApi, project: &str, source: Source) -> Result<Prepared, String> {
    project_capabilities::require_history_runtime()?;
    let (owner, path) = document_ref(&source.document_id)?;
    if owner != project || !version_history::is_commit_id(&source.version_id) {
        return Err("La versión no pertenece al proyecto revisado".into());
    }
    let root = api
        .project_root(project)?
        .canonicalize()
        .map_err(|_| "Proyecto no disponible")?;
    regular_directory(&root.join(".git"), false)?;
    let target = target(api, project, &path)?;
    let entry = api
        .git_document_history(&source.document_id)?
        .into_iter()
        .find(|entry| entry.version["id"] == source.version_id)
        .ok_or("La versión no pertenece al historial consultado del archivo")?;
    relative(&entry.path)?;
    let tree = git(
        &root,
        &["ls-tree", "-z", &source.version_id, "--", &entry.path],
        None,
    )?;
    let row = std::str::from_utf8(&tree)
        .map_err(|_| "Ruta Git no representable")?
        .trim_end_matches('\0');
    let (meta, stored) = row
        .split_once('\t')
        .ok_or("La versión no contiene este archivo")?;
    let columns = meta.split_whitespace().collect::<Vec<_>>();
    if columns.len() != 3
        || !matches!(columns[0], "100644" | "100755")
        || columns[1] != "blob"
        || stored != entry.path
        || !version_history::is_commit_id(columns[2])
    {
        return Err("Solo se restauran archivos regulares del historial".into());
    }
    let mode = columns[0].to_owned();
    let blob = columns[2].to_owned();
    let size = text(&root, &["cat-file", "-s", &blob], None)?
        .parse::<u64>()
        .map_err(|_| "Tamaño histórico no válido")?;
    if size > MAX_FILE {
        return Err("La restauración admite archivos de hasta32MiB; fuente conservada".into());
    }
    let bytes = git(&root, &["cat-file", "blob", &blob], None)?;
    if bytes.len() as u64 != size {
        return Err("El contenido Git no coincide con el tamaño revisado".into());
    }
    if is_handwritten_note_path(Path::new(&path)) {
        let value: Value = serde_json::from_slice(&bytes)
            .map_err(|_| "La nota histórica no contiene JSON válido")?;
        document_validation::handwritten(&value)?;
    }
    if is_markdown_path(Path::new(&path)) {
        std::str::from_utf8(&bytes)
            .map_err(|_| "El documento histórico no contiene Markdown UTF-8")?;
    }
    let before = read(&target, MAX_FILE)?;
    let draft = api.draft_write_revision(&source.document_id)?;
    let head = text(&root, &["rev-parse", "--verify", "HEAD"], None)?;
    if !version_history::is_commit_id(&head) {
        return Err("El historial actual no tiene un punto válido".into());
    }
    let index = read(&root.join(".git/index"), 64 * 1024 * 1024)?.map(|v| sha256_hex(&v));
    let revision = sha256_hex(
        &serde_json::to_vec(&json!([
            project,
            root,
            source.document_id,
            source.version_id,
            path,
            entry.path,
            blob,
            sha256_hex(&bytes),
            before.as_ref().map(|b| sha256_hex(b)),
            draft,
            head,
            index
        ]))
        .map_err(|_| "Revisión no representable")?,
    );
    Ok(Prepared {
        source,
        root,
        target,
        path,
        source_path: entry.path,
        blob,
        mode,
        bytes,
        before,
        draft,
        head,
        index,
        revision,
    })
}
fn kind(path: &str) -> (&'static str, &'static str) {
    let ext = Path::new(path)
        .extension()
        .and_then(|x| x.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    match ext.as_str() {
        "md" | "markdown" => ("markdown", "text/markdown"),
        "knote" => ("handwritten", "application/json"),
        "pdf" => ("pdf", "application/pdf"),
        "png" => ("image", "image/png"),
        "jpg" | "jpeg" => ("image", "image/jpeg"),
        "webp" => ("image", "image/webp"),
        "gif" => ("image", "image/gif"),
        "docx" => (
            "binary",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ),
        _ => ("binary", "application/octet-stream"),
    }
}
fn public_review(project: &str, p: &Prepared) -> Value {
    let (k, m) = kind(&p.path);
    json!({"schemaVersion":1,"projectId":project,"documentId":p.source.document_id,"versionId":p.source.version_id,"revision":p.revision,"path":p.path,"sourcePath":p.source_path,"kind":k,"mimeType":m,"sourceSha256":sha256_hex(&p.bytes),"sourceBytes":p.bytes.len(),"currentBytes":p.before.as_ref().map(Vec::len),"hasDraft":p.draft.is_some(),"createsNewVersion":true,"preservesIndex":true,"preservesDraft":true,"previewSupported":k!="binary"&&p.bytes.len()<=8*1024*1024,"checkedAt":knownext_core::now_iso()})
}
fn store(path: &Path, r: &Receipt, create: bool) -> Result<(), String> {
    let b = serde_json::to_vec(r).map_err(|_| "Recibo no representable")?;
    if b.len() as u64 > MAX_RECORD {
        return Err("El recibo supera su límite".into());
    }
    if create {
        atomic_io::create(path, &b)
    } else {
        atomic_io::write(path, &b)
    }
    .map_err(|_| "El recibo no está confirmado; consulta sin repetir".into())
}
fn receipt(api: &LocalApi, project: &str, id: &str) -> Result<(Receipt, PathBuf), String> {
    let dir = folder(api, project, Some(id))?;
    let raw = read(&dir.join("receipt.json"), MAX_RECORD)?
        .ok_or("No se conserva este intento; no se ha repetido")?;
    let r: Receipt = serde_json::from_slice(&raw).map_err(|_| "Recibo desconocido; se conserva")?;
    if r.schema_version != 1
        || r.project_id != project
        || r.attempt_id != id
        || !attempt(id)
        || !sha(&r.revision)
        || !sha(&r.root_hash)
        || !sha(&r.source_sha256)
        || r.source_bytes > MAX_FILE
        || !version_history::is_commit_id(&r.previous_head)
        || !version_history::is_commit_id(&r.new_version)
        || !version_history::is_commit_id(&r.source_version)
        || !version_history::is_commit_id(&r.source_blob)
        || !matches!(
            r.phase.as_str(),
            "prepared" | "file-restored" | "completed" | "partial"
        )
        || r.previous_sha256.as_ref().is_some_and(|s| !sha(s))
    {
        return Err("Recibo fuera de ámbito o formato; se conserva sin ejecutar".into());
    }
    relative(&r.path)?;
    relative(&r.source_path)?;
    if r.document_id != doc_id(project, &r.path) {
        return Err("Identidad documental del recibo no compatible".into());
    }
    Ok((r, dir))
}
fn check_current(api: &LocalApi, project: &str, p: &Prepared) -> Result<(), String> {
    if api
        .project_root(project)?
        .canonicalize()
        .map_err(|_| "Proyecto no disponible")?
        != p.root
        || target(api, project, &p.path)? != p.target
        || read(&p.target, MAX_FILE)? != p.before
        || api.draft_write_revision(&p.source.document_id)? != p.draft
        || text(&p.root, &["rev-parse", "--verify", "HEAD"], None)? != p.head
        || read(&p.root.join(".git/index"), 64 * 1024 * 1024)?.map(|b| sha256_hex(&b)) != p.index
    {
        return Err("El archivo, borrador, índice o historial cambió; vuelve a revisar".into());
    }
    Ok(())
}
impl LocalApi {
    pub(crate) fn history_restore_catalog(&self, project: &str) -> Result<Value, String> {
        self.project_root(project)?;
        let dir = folder(self, project, None)?;
        let mut items = vec![];
        let mut unavailable = 0usize;
        let mut limited = false;
        match fs::symlink_metadata(&dir) {
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => (),
            Ok(m) if m.is_dir() && !batch::linked(&m) => {
                for (index, entry) in fs::read_dir(&dir)
                    .map_err(|_| "No se pueden consultar las restauraciones")?
                    .enumerate()
                {
                    if index >= MAX_ATTEMPTS {
                        limited = true;
                        break;
                    }
                    let entry = entry.map_err(|_| "Una restauración no está disponible")?;
                    let id = entry.file_name().to_string_lossy().into_owned();
                    if matches!(
                        id.to_ascii_lowercase().as_str(),
                        "owner.lock" | "runtime-owner.lock" | "capture.lock"
                    ) {
                        continue;
                    }
                    if !attempt(&id) {
                        unavailable += 1;
                        continue;
                    }
                    match receipt(self,project,&id){Ok((r,_))=>items.push(json!({"attemptId":r.attempt_id,"documentId":r.document_id,"versionId":r.source_version,"revision":r.revision,"path":r.path,"phase":r.phase,"newVersion":r.new_version,"createdAt":r.created_at})),Err(_)=>unavailable+=1}
                }
            }
            _ => return Err("El catálogo histórico no es regular; se conserva".into()),
        }
        items.sort_by(|a, b| b["createdAt"].as_str().cmp(&a["createdAt"].as_str()));
        Ok(
            json!({"schemaVersion":1,"projectId":project,"items":items,"unavailable":unavailable,"limited":limited,"checkedAt":knownext_core::now_iso(),"canReplay":false}),
        )
    }
    pub(crate) fn review_history_restore(
        &self,
        project: &str,
        body: Value,
    ) -> Result<Value, String> {
        let p = prepare(
            self,
            project,
            serde_json::from_value(body).map_err(|_| "Revisa documento y versión")?,
        )?;
        Ok(public_review(project, &p))
    }
    pub(crate) fn preview_history_resource(
        &self,
        project: &str,
        body: Value,
    ) -> Result<Value, String> {
        #[derive(Deserialize)]
        #[serde(rename_all = "camelCase", deny_unknown_fields)]
        struct Preview {
            document_id: String,
            version_id: String,
            page_id: Option<String>,
        }
        let input: Preview =
            serde_json::from_value(body).map_err(|_| "Vista previa histórica no compatible")?;
        let p = prepare(
            self,
            project,
            Source {
                document_id: input.document_id,
                version_id: input.version_id,
            },
        )?;
        let mut v = public_review(project, &p);
        let (k, _) = kind(&p.path);
        if p.bytes.len() > 8 * 1024 * 1024 || k == "binary" {
            v["previewUnavailable"]=json!("Este formato o tamaño conserva sus bytes, pero no dispone de visor histórico integrado");
            return Ok(v);
        }
        match k {
            "markdown" => {
                v["markdown"] = json!(String::from_utf8(p.bytes).map_err(|_| "Markdown no válido")?)
            }
            "handwritten" => {
                let value: Value =
                    serde_json::from_slice(&p.bytes).map_err(|_| "Nota no válida")?;
                let pages = value["pages"].as_array().ok_or("Páginas no válidas")?;
                let page = if let Some(id) = input.page_id.as_deref() {
                    pages
                        .iter()
                        .find(|p| p["id"] == id)
                        .ok_or("La página no pertenece a esta nota histórica")?
                } else {
                    pages.first().ok_or("Nota sin páginas")?
                };
                v["pageIds"] = json!(pages.iter().map(|p| p["id"].clone()).collect::<Vec<_>>());
                v["previewPageId"] = page["id"].clone();
                let width = page["size"]["width"].as_f64().ok_or("Ancho no válido")?;
                let height = page["size"]["height"].as_f64().ok_or("Alto no válido")?;
                if width * height * 0.25 > 8_000_000.0 {
                    v["previewUnavailable"]=json!("La página supera el presupuesto de vista previa; la nota completa permanece disponible para restauración");
                } else {
                    let (_, png) =
                        knownext_docs::handwritten_note_png(&value, page["id"].as_str(), 0.5)?;
                    if png.len() > 8 * 1024 * 1024 {
                        return Err("La página supera8MiB; fuente conservada".into());
                    }
                    v["base64"] = json!(base64::engine::general_purpose::STANDARD.encode(png));
                    v["previewMimeType"] = json!("image/png");
                }
            }
            _ => v["base64"] = json!(base64::engine::general_purpose::STANDARD.encode(p.bytes)),
        };
        Ok(v)
    }
    pub(crate) fn history_restore_receipt(&self, project: &str, id: &str) -> Result<Value, String> {
        let (r, _) = receipt(self, project, id)?;
        let root = self
            .project_root(project)?
            .canonicalize()
            .map_err(|_| "Proyecto no disponible")?;
        let root_matches = sha256_hex(root.to_string_lossy().as_bytes()) == r.root_hash;
        let mut confirmed = false;
        if root_matches && r.phase == "completed" {
            let parent = text(&root, &["rev-parse", &format!("{}^", r.new_version)], None)?;
            let blob = text(
                &root,
                &["rev-parse", &format!("{}:{}", r.new_version, r.path)],
                None,
            )?;
            confirmed = parent == r.previous_head && blob == r.source_blob;
        }
        Ok(
            json!({"schemaVersion":1,"projectId":project,"documentId":r.document_id,"attemptId":id,"revision":r.revision,"path":r.path,"versionId":r.source_version,"newVersion":r.new_version,"status":if confirmed{"completed"}else if r.phase=="completed"{"partial"}else{r.phase.as_str()},"confirmed":confirmed,"canReplay":false,"preservesDraft":true,"preservesIndex":true,"checkedAt":knownext_core::now_iso(),"message":if confirmed{"Archivo restaurado y registrado como versión nueva. El borrador y el índice se conservan."}else{"La restauración requiere revisión; consulta el historial y las copias conservadas. No se repite automáticamente."}}),
        )
    }
    pub(crate) fn apply_history_restore(
        &self,
        project: &str,
        body: Value,
    ) -> Result<Value, String> {
        let q: Apply = serde_json::from_value(body).map_err(|_| "Restauración no compatible")?;
        if !q.acknowledge || !attempt(&q.attempt_id) || !sha(&q.revision) {
            return Err("Revisa y confirma esta restauración".into());
        }
        let _transaction = self.project_transaction(project)?;
        let dir = folder(self, project, Some(&q.attempt_id))?;
        match fs::symlink_metadata(&dir) {
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => (),
            _ => {
                return Err(
                    "Este intento ya existe o no es comprobable. Consulta su recibo sin repetir"
                        .into(),
                )
            }
        }
        let p = prepare(
            self,
            project,
            Source {
                document_id: q.document_id,
                version_id: q.version_id,
            },
        )?;
        if p.revision != q.revision {
            return Err("La revisión de restauración cambió; no se ha escrito".into());
        }
        mixed_application_guard::ensure(&p.root)?;
        let store_dir = folder(self, project, None)?;
        let mut count = 0;
        let mut total = 0u64;
        if store_dir.is_dir() {
            for item in fs::read_dir(&store_dir)
                .map_err(|_| "No se pueden comprobar intentos previos")?
                .take(MAX_ATTEMPTS + 1)
            {
                let item = item.map_err(|_| "Intento no disponible")?;
                let name = item.file_name().to_string_lossy().into_owned();
                if matches!(
                    name.to_ascii_lowercase().as_str(),
                    "owner.lock" | "runtime-owner.lock" | "capture.lock"
                ) {
                    continue;
                }
                if !attempt(&name) {
                    return Err("Hay una preparación histórica desconocida o interrumpida; se conserva sin superponer otra".into());
                }
                let _ = receipt(self, project, &name)?;
                count += 1;
                regular_directory(&item.path(), false)?;
                for name in ["receipt.json", "source.bin", "before.bin"] {
                    if let Some(b) = read(
                        &item.path().join(name),
                        if name == "receipt.json" {
                            MAX_RECORD
                        } else {
                            MAX_FILE
                        },
                    )? {
                        total = total.saturating_add(b.len() as u64);
                        if total > MAX_STORE {
                            return Err(
                                "Las restauraciones conservadas alcanzan256MiB; se conservan"
                                    .into(),
                            );
                        }
                    }
                }
            }
        }
        let extra =
            p.bytes.len() as u64 + p.before.as_ref().map_or(0, |b| b.len() as u64) + MAX_RECORD;
        if count >= MAX_ATTEMPTS || total.saturating_add(extra) > MAX_STORE {
            return Err("Las restauraciones conservadas alcanzan64intentos o256MiB; no se purgan para continuar".into());
        }
        let _budget = recovery_inventory::admit(self, extra)?;
        let work = tempfile::tempdir().map_err(|_| "No se pudo preparar el historial")?;
        let index = work.path().join("index");
        git(&p.root, &["read-tree", &p.head], Some(&index))?;
        git(
            &p.root,
            &[
                "update-index",
                "--add",
                "--cacheinfo",
                &format!("{},{},{}", p.mode, p.blob, p.path),
            ],
            Some(&index),
        )?;
        let tree = text(&p.root, &["write-tree"], Some(&index))?;
        let commit = text(
            &p.root,
            &[
                "commit-tree",
                &tree,
                "-p",
                &p.head,
                "-m",
                &format!("Restaura {} · {}", p.path, q.attempt_id),
            ],
            Some(&index),
        )?;
        if !version_history::is_commit_id(&commit) {
            return Err("No se pudo preparar una versión nueva".into());
        }
        check_current(self, project, &p)?;
        fs::create_dir_all(&store_dir).map_err(|_| "No se pudo conservar la restauración")?;
        let stage = tempfile::Builder::new()
            .prefix("prepare-")
            .tempdir_in(&store_dir)
            .map_err(|_| "No se pudo reservar la restauración")?;
        atomic_io::create(&stage.path().join("source.bin"), &p.bytes)
            .map_err(|_| "No se pudo conservar la fuente")?;
        if let Some(bytes) = &p.before {
            atomic_io::create(&stage.path().join("before.bin"), bytes)
                .map_err(|_| "No se pudo conservar el archivo actual")?;
        }
        let mut r = Receipt {
            schema_version: 1,
            project_id: project.into(),
            document_id: p.source.document_id.clone(),
            attempt_id: q.attempt_id,
            revision: q.revision,
            root_hash: sha256_hex(p.root.to_string_lossy().as_bytes()),
            path: p.path.clone(),
            source_path: p.source_path.clone(),
            source_version: p.source.version_id.clone(),
            source_blob: p.blob.clone(),
            source_sha256: sha256_hex(&p.bytes),
            source_bytes: p.bytes.len() as u64,
            previous_sha256: p.before.as_ref().map(|b| sha256_hex(b)),
            previous_head: p.head.clone(),
            new_version: commit.clone(),
            phase: "prepared".into(),
            created_at: knownext_core::now_iso(),
            draft_preserved: p.draft.is_some(),
        };
        store(&stage.path().join("receipt.json"), &r, true)?;
        let stage = stage.keep();
        atomic_io::rename_no_replace(&stage, &dir)
            .map_err(|_| "Preparación sin confirmar; consulta sin repetir")?;
        check_current(self, project, &p)?;
        if let Some(parent) = p.target.parent() {
            fs::create_dir_all(parent).map_err(|_| "No se pudo recuperar la carpeta original")?;
        }
        target(self, project, &p.path)?;
        let write = if p.before.is_some() {
            atomic_io::write(&p.target, &p.bytes)
        } else {
            atomic_io::create(&p.target, &p.bytes)
        };
        if write.is_err() {
            return Err(
                "La publicación del archivo no está confirmada; consulta el intento sin repetir"
                    .into(),
            );
        }
        r.phase = "file-restored".into();
        store(&dir.join("receipt.json"), &r, false)?;
        if text(&p.root, &["rev-parse", "--verify", "HEAD"], None)? != p.head
            || git(&p.root, &["update-ref", "HEAD", &commit, &p.head], None).is_err()
        {
            r.phase = "partial".into();
            let _ = store(&dir.join("receipt.json"), &r, false);
            return Err("El archivo se restauró, pero su versión no está confirmada. Conserva el trabajo y consulta el intento".into());
        }
        if read(&p.root.join(".git/index"), 64 * 1024 * 1024)?.map(|b| sha256_hex(&b)) != p.index
            || self.draft_write_revision(&p.source.document_id)? != p.draft
        {
            r.phase = "partial".into();
            let _ = store(&dir.join("receipt.json"), &r, false);
            return Err("La restauración requiere revisión porque cambió el índice o el borrador. No repitas el intento".into());
        }
        r.phase = "completed".into();
        store(&dir.join("receipt.json"), &r, false)?;
        self.history_restore_receipt(project, &r.attempt_id)
    }
}
