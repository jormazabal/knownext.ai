//! Reviewed working-file publication. Preparation never reads from the live worktree twice.
use super::*;
use std::{fs, io::Read, process::Stdio};
const OUTPUT_LIMIT: u64 = 2 * 1024 * 1024;
const FILE_LIMIT: u64 = 8 * 1024 * 1024;
const TOTAL_LIMIT: u64 = 32 * 1024 * 1024;
const MAX_ITEMS: usize = 512;

fn git(root: &Path, args: &[&str]) -> Result<Vec<u8>, String> {
    let mut child = local_git_command()
        .arg("--no-optional-locks")
        .arg("--literal-pathspecs")
        .arg("-C")
        .arg(root)
        .args(["-c", "core.fsmonitor=false"])
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|_| "No se pudo iniciar la revisión local")?;
    let mut bytes = vec![];
    let read = child
        .stdout
        .take()
        .ok_or("No se pudo abrir la revisión")?
        .take(OUTPUT_LIMIT + 1)
        .read_to_end(&mut bytes);
    if read.is_err() || bytes.len() as u64 > OUTPUT_LIMIT {
        let _ = child.kill();
        let _ = child.wait();
        return Err("La revisión supera2MiB; no se registra un conjunto parcial".into());
    }
    if !child
        .wait()
        .map_err(|_| "No se completó la revisión")?
        .success()
    {
        return Err("No se pudo comprobar el historial local; vuelve a revisar".into());
    }
    Ok(bytes)
}
fn text(bytes: Vec<u8>) -> Result<String, String> {
    String::from_utf8(bytes)
        .map(|s| s.trim().to_owned())
        .map_err(|_| "Historial no compatible".into())
}
fn regular_bytes(path: &Path, maximum: u64) -> Result<Vec<u8>, String> {
    let m = fs::symlink_metadata(path).map_err(|_| "No se puede comprobar un archivo revisado")?;
    if !m.is_file() || batch::linked(&m) || m.len() > maximum {
        return Err("Archivo no regular o fuera del presupuesto de revisión".into());
    }
    let mut bytes = vec![];
    fs::File::open(path)
        .map_err(|_| "No se puede abrir un archivo revisado")?
        .take(maximum + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| "No se pudo revisar el archivo completo")?;
    if bytes.len() as u64 > maximum {
        return Err("El archivo creció durante la revisión".into());
    }
    Ok(bytes)
}
fn safe_path(root: &Path, relative: &str) -> Result<PathBuf, String> {
    if relative.is_empty()
        || relative.contains(['\\', ':', '\r', '\n'])
        || relative.starts_with('/')
    {
        return Err("Ruta externa no compatible".into());
    }
    let pieces = relative.split('/').collect::<Vec<_>>();
    if pieces
        .iter()
        .any(|p| p.is_empty() || *p == "." || *p == "..")
    {
        return Err("Ruta externa no compatible".into());
    }
    let mut path = root.to_path_buf();
    for (i, piece) in pieces.iter().enumerate() {
        path.push(piece);
        match fs::symlink_metadata(&path) {
            Ok(meta) if batch::linked(&meta) || (i + 1 < pieces.len() && !meta.is_dir()) => {
                return Err("La ruta contiene un enlace o carpeta no regular".into())
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => (),
            Err(_) => return Err("No se pudo comprobar la ruta completa".into()),
            _ => (),
        }
    }
    Ok(path)
}
fn reserved(path: &str) -> bool {
    path.split('/').any(|s| {
        matches!(
            s.to_ascii_lowercase().as_str(),
            ".git"
                | ".knownext-runtime"
                | ".knownext-mixed-work"
                | ".gitattributes"
                | ".gitmodules"
                | "owner.lock"
                | "runtime-owner.lock"
                | "capture.lock"
        )
    })
}
struct Row {
    item: Value,
    bytes: Option<Vec<u8>>,
    executable: bool,
    staged: bool,
}
struct Review {
    root: PathBuf,
    head: String,
    reference: String,
    revision: String,
    rows: Vec<Row>,
}
fn snapshot(api: &LocalApi, project: &str) -> Result<Review, String> {
    let root = api
        .project_root(project)?
        .canonicalize()
        .map_err(|_| "Proyecto no disponible")?;
    let reference = text(git(&root, &["symbolic-ref", "-q", "HEAD"])?)?;
    if !reference.starts_with("refs/heads/") {
        return Err("El historial requiere una referencia local estable".into());
    }
    let head = text(git(&root, &["rev-parse", "--verify", "HEAD"])?)?;
    let index_path = PathBuf::from(text(git(
        &root,
        &["rev-parse", "--path-format=absolute", "--git-path", "index"],
    )?)?);
    let index = regular_bytes(&index_path, 16 * 1024 * 1024)?;
    let status = git(
        &root,
        &[
            "status",
            "--porcelain=v1",
            "-z",
            "--no-renames",
            "--untracked-files=all",
        ],
    )?;
    let entries = status
        .split(|b| *b == 0)
        .filter(|b| !b.is_empty())
        .collect::<Vec<_>>();
    if entries.len() > MAX_ITEMS {
        return Err("Más de512 cambios; no se registra una selección parcial".into());
    }
    let mut budget = TOTAL_LIMIT;
    let mut rows = vec![];
    for entry in entries {
        if entry.len() < 4 || entry[2] != b' ' {
            return Err("Estado externo no compatible".into());
        }
        let path =
            std::str::from_utf8(&entry[3..]).map_err(|_| "Nombre de archivo no compatible")?;
        let (kind, mut risk, mut decision, mut reason) = if reserved(path) {
            (
                "private",
                "blocked",
                "omit",
                json!("Metadatos de coordinación/configuración conservados fuera del historial."),
            )
        } else {
            classify_external_change(path, &root)
        };
        let staged = entry[0] != b' ' && entry[0] != b'?';
        let mut bytes = None;
        #[cfg(unix)]
        let mut executable = false;
        #[cfg(not(unix))]
        let executable = false;
        let mut exists = entry[1] != b'D';
        if risk != "blocked" {
            let read = safe_path(&root, path).and_then(|full| match fs::symlink_metadata(&full) {
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                    exists = false;
                    Ok(None)
                }
                Err(_) => Err("No se puede comprobar el archivo".to_string()),
                Ok(meta) => {
                    exists = true;
                    #[cfg(unix)]
                    {
                        use std::os::unix::fs::PermissionsExt;
                        executable = meta.permissions().mode() & 0o111 != 0;
                    }
                    #[cfg(not(unix))]
                    {
                        let _ = meta;
                    }
                    regular_bytes(&full, FILE_LIMIT.min(budget)).map(Some)
                }
            });
            match read {
                Ok(value) => {
                    if let Some(b) = &value {
                        budget = budget.saturating_sub(b.len() as u64);
                    }
                    bytes = value;
                }
                Err(message) => {
                    risk = "blocked";
                    decision = "omit";
                    reason = json!(message);
                }
            }
            if staged && risk != "blocked" {
                risk = "blocked";
                decision = "omit";
                reason = json!("Hay contenido preparado por otra herramienta; se conserva sin sustituirlo. Resuélvelo allí antes de incluir esta ruta.");
            }
        }
        let change = if !exists {
            "deleted"
        } else if entry.starts_with(b"??") {
            "added"
        } else {
            "modified"
        };
        rows.push(Row { item: json!({"id":format!("external-{}",sha256_hex(path.as_bytes())),"path":path,"name":path.rsplit('/').next(),"changeType":change,"kind":kind,"risk":risk,"decision":decision,"sizeBytes":bytes.as_ref().map(Vec::len),"reason":reason}), bytes, executable, staged });
    }
    // Include bytes, not timestamps: same-size external edits invalidate the review.
    let identity = json!({"format":1,"project":project,"root":root.to_string_lossy(),"reference":reference,"head":head,"index":sha256_hex(&index),"status":sha256_hex(&status),"rows":rows.iter().map(|r|json!({"item":r.item,"sha256":r.bytes.as_ref().map(|b|sha256_hex(b)),"executable":r.executable})).collect::<Vec<_>>()});
    let revision = sha256_hex(
        &serde_json::to_vec(&identity).map_err(|_| "No se pudo identificar la revisión")?,
    );
    if text(git(&root, &["rev-parse", "--verify", "HEAD"])?)? != head
        || text(git(&root, &["symbolic-ref", "-q", "HEAD"])?)? != reference
        || regular_bytes(&index_path, 16 * 1024 * 1024)? != index
        || git(
            &root,
            &[
                "status",
                "--porcelain=v1",
                "-z",
                "--no-renames",
                "--untracked-files=all",
            ],
        )? != status
    {
        return Err(
            "El historial o la preparación cambió durante la consulta; vuelve a revisar".into(),
        );
    }
    Ok(Review {
        root,
        head,
        reference,
        revision,
        rows,
    })
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Request {
    revision: String,
    decisions: Vec<Decision>,
    sync_remote: bool,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Decision {
    item_id: String,
    decision: String,
}

fn commit_frozen(review: &Review, included: &[&Row], title: &str) -> Result<(), String> {
    mixed_application_guard::ensure(&review.root)?;
    let frozen =
        tempfile::tempdir().map_err(|_| "No se pudo preparar la copia privada de publicación")?;
    let paths = included
        .iter()
        .map(|r| r.item["path"].as_str().unwrap())
        .collect::<Vec<_>>();
    // No external clean filters, encodings or attributes may transform the reviewed bytes.
    let mut attr_args = vec!["check-attr", "-z", "--all", "--"];
    attr_args.extend(paths.iter().copied());
    if !git(&review.root, &attr_args)?.is_empty() {
        return Err("Estas rutas tienen atributos Git activos. Regístralas desde su herramienta para conservar su transformación; no se ha publicado".into());
    }
    attr_args.insert(1, "--cached");
    if !git(&review.root, &attr_args)?.is_empty() {
        return Err("Estas rutas conservan atributos preparados en el historial; revísalas desde su herramienta antes de registrarlas".into());
    }
    let mut new_paths = vec![];
    for row in included {
        let relative = row.item["path"].as_str().unwrap();
        if let Some(bytes) = &row.bytes {
            let file = frozen.path().join(relative);
            fs::create_dir_all(file.parent().ok_or("Ruta de publicación inválida")?)
                .map_err(|_| "No se pudo preparar la carpeta privada")?;
            atomic_io::create(&file, bytes).map_err(|_| "No se pudo preparar el contenido privado")?;
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                fs::set_permissions(
                    &file,
                    fs::Permissions::from_mode(if row.executable { 0o755 } else { 0o644 }),
                )
                .map_err(|_| "No se pudo conservar el modo del archivo")?;
            }
            if row.item["changeType"] == "added" {
                new_paths.push(relative);
            }
        }
    }
    let command = || {
        let mut cmd = local_git_command();
        cmd.arg("--literal-pathspecs")
            .arg("-C")
            .arg(&review.root)
            .arg("--work-tree")
            .arg(frozen.path())
            .args([
                "-c",
                "core.hooksPath=/dev/null",
                "-c",
                "commit.gpgsign=false",
                "-c",
                "core.fsmonitor=false",
                "-c",
                "core.autocrlf=false",
                "-c",
                "user.name=KnowNext.ai",
                "-c",
                "user.email=knownext.local@knownext.ai",
            ])
            .env("GIT_ATTR_NOSYSTEM", "1");
        cmd
    };
    if text(git(&review.root, &["rev-parse", "--verify", "HEAD"])?)? != review.head
        || text(git(&review.root, &["symbolic-ref", "-q", "HEAD"])?)? != review.reference
    {
        return Err("El historial cambió antes de publicar; vuelve a revisar".into());
    }
    if !new_paths.is_empty() {
        let output = run_local_git(
            command()
                .args(["add", "--intent-to-add", "--"])
                .args(new_paths),
        )?;
        if !output.status.success() {
            return Err("No se confirmó la preparación de las rutas nuevas; comprueba el estado antes de reintentar".into());
        }
    }
    // Git's --only transaction advances selected index entries and retains unrelated staging.
    // The working directory is an owned frozen copy: later live edits are never committed here.
    let output = run_local_git(
        command()
            .args(["commit", "--only", "-m", title, "--"])
            .args(paths),
    )?;
    if !output.status.success() {
        return Err("No se confirmó la publicación. Los archivos vivos permanecen; puede quedar una preparación de rutas nuevas. Comprueba el estado antes de reintentar".into());
    }
    Ok(())
}
impl LocalApi {
    pub(super) fn external_changes(&self, project_id: &str) -> Value {
        match snapshot(self, project_id) {
            Ok(review) => {
                let mut value = external_change_set(
                    project_id,
                    review.rows.into_iter().map(|r| r.item).collect(),
                    None,
                );
                value["revision"] = json!(review.revision);
                value["id"] = json!(format!("changes-{}", review.revision));
                value
            }
            Err(message) => {
                let mut value = external_change_set(project_id, vec![], Some(message));
                value["revision"] = Value::Null;
                value
            }
        }
    }
    pub(super) fn import_external_changes(
        &self,
        project_id: &str,
        body: Value,
    ) -> Result<Value, String> {
        let request: Request = serde_json::from_value(body)
            .map_err(|_| "Solicitud sin revisión vigente o decisiones compatibles")?;
        let _permit = self.project_transaction(project_id)?;
        let review = snapshot(self, project_id)?;
        if request.revision != review.revision {
            return Err("Los archivos o el historial cambiaron desde la revisión. Comprueba de nuevo y confirma la selección actual; no se ha publicado".into());
        }
        if request.decisions.len() != review.rows.len() {
            return Err("Confirma una decisión explícita por cada archivo revisado".into());
        }
        let mut choices = BTreeMap::new();
        for d in request.decisions {
            if !matches!(d.decision.as_str(), "include" | "omit" | "review")
                || choices.insert(d.item_id, d.decision).is_some()
            {
                return Err("Decisiones repetidas o no compatibles".into());
            }
        }
        let mut included = vec![];
        for row in &review.rows {
            let choice = choices
                .remove(row.item["id"].as_str().unwrap())
                .ok_or("La selección contiene otra identidad")?;
            if choice == "include" {
                if row.item["risk"] == "blocked" || row.staged {
                    return Err(
                        "La selección incluye una ruta bloqueada; se conserva sin publicar".into(),
                    );
                }
                let path = row.item["path"].as_str().unwrap();
                if self.read_draft(&doc_id(project_id, path))?.is_some() {
                    return Err("Hay un borrador recuperable de una ruta seleccionada. Revísalo antes de registrar el archivo guardado".into());
                }
                included.push(row);
            }
        }
        if !choices.is_empty() {
            return Err("La selección contiene archivos no revisados".into());
        }
        if included.is_empty() {
            return Err("No se ha seleccionado ningún archivo para el historial".into());
        }
        // A second read detects edits during the first bounded snapshot and all preparation.
        if snapshot(self, project_id)?.revision != review.revision {
            return Err("La revisión cambió mientras se preparaba; comprueba de nuevo".into());
        }
        let title = format!("Cambios externos importados ({})", included.len());
        commit_frozen(&review, &included, &title)?;
        let activity_warning=self.record_activity(project_id,json!({"type":"external-changes-imported","scope":"history","title":"Cambios externos importados","message":format!("{} cambio(s) añadidos al historial local.",included.len()),"tone":"success"})).err();
        let _ = request.sync_remote; // Publication is local; remote delivery remains a separate action.
        Ok(self.with_project_tree(project_id,json!({"status":"synced","message":if activity_warning.is_some(){"Historial actualizado; no se confirmó el registro de actividad."}else{"Los archivos revisados se añadieron al historial local. El envío al remoto es una acción separada."},"activityWarning":activity_warning,"versionTitle":title,"syncedAt":knownext_core::now_iso(),"pendingRemoteSync":self.sync_status(project_id)["mode"].as_str().unwrap_or("")!="local-history"})))
    }
}
