//! Join reviewed divergent histories without replacing working files.
//! No checkout, index update, fetch, push, document rewrite, repair or replay.
use super::*;
use std::{
    fs,
    io::Write,
    time::{Duration, Instant},
};
const MAX_RECORD: u64 = 16 * 1024;
pub(super) const MAX_RECORDS: usize = recovery_quotas::JOIN_RECORDS;
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Record {
    format: u8,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    resolution: Option<String>,
    #[serde(default,skip_serializing_if="Option::is_none")]
    mixed_selection:Option<mixed::Proof>,
    project_id: String,
    attempt_id: String,
    created_at: String,
    reviewed_revision: String,
    location_revision: String,
    origin_revision: String,
    local_reference: String,
    remote_reference: String,
    local_commit: String,
    remote_commit: String,
    tree: String,
    target_commit: String,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Request {
    revision: String,
    attempt_id: String,
    #[serde(default)]
    resolution: Option<String>,
    #[serde(default)]
    acknowledge_remote_history_only: Option<bool>,
    #[serde(default)] mixed_plan_id:Option<String>,
    #[serde(default)] mixed_plan_revision:Option<String>,
    #[serde(default)] acknowledge_prepared_combination:Option<bool>,
}
fn id(value: &str) -> bool {
    value
        .strip_prefix("attempt-")
        .is_some_and(|v| v.len() == 32 && v.bytes().all(|c| c.is_ascii_hexdigit()))
}
fn digest(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(|c| c.is_ascii_hexdigit())
}
fn reference(value: &str, prefix: &str) -> bool {
    value.starts_with(prefix)
        && value.len() <= 1024
        && !value
            .chars()
            .any(|c| c.is_control() || c.is_whitespace() || "~^:?*[\\\"".contains(c))
        && !value.contains("..")
        && !value.contains("@{")
}
fn location(context: &Context) -> String {
    sha256_hex(context.root.to_string_lossy().as_bytes())
}
fn directory(path: &Path) -> Result<bool, String> {
    match fs::symlink_metadata(path) {
        Ok(meta) if meta.is_dir() && !batch::linked(&meta) => Ok(true),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(false),
        _ => Err("El catálogo de reuniones no es una carpeta regular; se conserva".into()),
    }
}
fn folder(api: &LocalApi, project: &str, create: bool) -> Result<PathBuf, String> {
    let parent = api.app_data_dir.join("graph-joins");
    let root = parent.join(sha256_hex(project.as_bytes()));
    for path in [&api.app_data_dir, &parent, &root] {
        if !directory(path)? && create {
            fs::create_dir(path)
                .or_else(|e| {
                    if e.kind() == std::io::ErrorKind::AlreadyExists {
                        Ok(())
                    } else {
                        Err(e)
                    }
                })
                .map_err(|_| "No se pudo preparar el catálogo de reuniones")?;
            if !directory(path)? {
                return Err("Catálogo no disponible".into());
            }
        }
    }
    Ok(root)
}
fn tree(root: &Path, commit: &str) -> Result<String, String> {
    let bytes = read_git(
        root,
        &["rev-parse", "--verify", &format!("{commit}^{{tree}}")],
    )?;
    let value = std::str::from_utf8(&bytes)
        .map_err(|_| "Árbol histórico no compatible")?
        .trim();
    if !version_history::is_commit_id(value) {
        return Err("Árbol histórico no válido".into());
    }
    Ok(value.into())
}
fn clean(context: &Context) -> Result<bool, String> {
    Ok(read_git(
        &context.root,
        &[
            "status",
            "--porcelain=v1",
            "-z",
            "--untracked-files=all",
            "--ignore-submodules=none",
        ],
    )?
    .is_empty())
}
pub(super) fn availability(context: &Context, relation: &str) -> Value {
    let result = (|| -> Result<bool, String> {
        if relation != "diverged" {
            return Err("Solo se reúnen historiales con versiones propias en ambos lados".into());
        }
        if !reference(&context.local_reference, "refs/heads/") {
            return Err("No hay un historial local activo que se pueda reunir".into());
        }
        if !clean(context)? {
            return Err("Hay cambios de archivos sin registrar. Consérvalos antes de reunir los historiales".into());
        }
        Ok(tree(&context.root, &context.local)? == tree(&context.root, &context.remote)?)
    })();
    match result {
        Ok(true) => {
            json!({"canJoin":true,"canKeepLocal":false,"message":"Los dos historiales contienen exactamente los mismos archivos. Puedes reunir sus versiones sin reemplazar documentos. No se envía nada al remoto."})
        }
        Ok(false) => {
            json!({"canJoin":false,"canKeepLocal":true,"message":"Los archivos registrados son distintos. Compara las variantes. Si eliges conservar la versión de este equipo para todo el proyecto, las diferencias remotas permanecerán solo en el historial; no se incorporarán a los archivos."})
        }
        Err(message) => json!({"canJoin":false,"canKeepLocal":false,"message":message}),
    }
}
fn validate(record: &Record, project: &str, attempt: &str) -> Result<(), String> {
    if !((record.format == 1 && record.resolution.is_none() && record.mixed_selection.is_none())
        || (record.format == 2 && record.resolution.as_deref() == Some("keep-local") && record.mixed_selection.is_none())
        || (record.format == 3 && record.resolution.as_deref()==Some("mixed") && record.mixed_selection.as_ref().is_some_and(mixed::valid_proof)))
        || record.project_id != project
        || record.attempt_id != attempt
        || !id(attempt)
        || !digest(&record.reviewed_revision)
        || !digest(&record.location_revision)
        || !digest(&record.origin_revision)
        || !reference(&record.local_reference, "refs/heads/")
        || !reference(&record.remote_reference, "refs/remotes/origin/")
        || [
            &record.local_commit,
            &record.remote_commit,
            &record.tree,
            &record.target_commit,
        ]
        .into_iter()
        .any(|v| !version_history::is_commit_id(v))
        || record.local_commit == record.remote_commit
        || OffsetDateTime::parse(&record.created_at, &Rfc3339).is_err()
    {
        return Err("Recibo de reunión no compatible; se conserva sin repetir".into());
    }
    Ok(())
}
fn read(path: &Path, project: &str, attempt: &str) -> Result<(Record, Vec<u8>), String> {
    let meta = fs::symlink_metadata(path).map_err(|_| "Recibo no disponible")?;
    if !meta.is_file() || batch::linked(&meta) || meta.len() > MAX_RECORD {
        return Err("Recibo no regular o fuera de límites; se conserva".into());
    }
    let mut bytes = vec![];
    fs::File::open(path)
        .map_err(|_| "Recibo no legible")?
        .take(MAX_RECORD + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| "Recibo no legible")?;
    if bytes.len() as u64 > MAX_RECORD {
        return Err("Recibo fuera de límites".into());
    }
    let record: Record = serde_json::from_slice(&bytes)
        .map_err(|_| "Formato de recibo no compatible; se conserva")?;
    validate(&record, project, attempt)?;
    Ok((record, bytes))
}
fn inspect_commit(root: &Path, record: &Record) -> Result<(), String> {
    let bytes = read_git(
        root,
        &[
            "show",
            "--no-patch",
            "--format=%T%n%P%n%B",
            &record.target_commit,
        ],
    )?;
    let text = std::str::from_utf8(&bytes).map_err(|_| "Versión de reunión no compatible")?;
    let expected = format!(
        "{}\n{} {}\n{}",
        record.tree,
        record.local_commit,
        record.remote_commit,
        commit_message(record.resolution.as_deref(), &record.attempt_id)
    );
    if text.trim() != expected {
        return Err(
            "La versión preparada no conserva el árbol y ambos historiales esperados".into(),
        );
    }
    Ok(())
}
fn commit_message(resolution: Option<&str>, attempt: &str) -> String {
    format!(
        "{}\n\nIntento: {attempt}",
        if resolution==Some("mixed"){"KnowNext: reunir una combinación guardada y verificada por archivo"} else if resolution==Some("keep-local") {
            "KnowNext: conservar la versión del equipo y reunir historiales; diferencias remotas solo en el historial"
        } else {
            "KnowNext: reunir historiales con contenido idéntico"
        }
    )
}
// Native reference transaction: verify the cached remote tip together with the
// exact old local tip; only the captured local ref changes. HEAD/origin/root are
// reviewed before and after, not CAS-protected against external Git programs.
fn publish(context: &Context, record: &Record) -> Result<(), String> {
    let script = format!(
        "start\noption no-deref\nverify {} {}\noption no-deref\nupdate {} {} {}\nprepare\ncommit\n",
        record.remote_reference,
        record.remote_commit,
        record.local_reference,
        record.target_commit,
        record.local_commit
    );
    let mut child = local_git_command()
        .arg("-C")
        .arg(&context.root)
        .args([
            "-c",
            "core.hooksPath=/dev/null",
            "update-ref",
            "--stdin",
            "--create-reflog",
            "-m",
            "KnowNext: reunir historiales con contenido idéntico",
        ])
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|_| "No se pudo iniciar la publicación del historial")?;
    let written = child
        .stdin
        .take()
        .ok_or("No se pudo preparar la publicación")
        .and_then(|mut stdin| {
            stdin
                .write_all(script.as_bytes())
                .map_err(|_| "No se pudo completar la petición al historial")
        });
    if written.is_err() {
        let _ = child.kill();
        let _ = child.wait();
        return Err("Publicación no confirmada. Consulta el recibo; no repitas la petición".into());
    }
    let start = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                return if status.success() {
                    Ok(())
                } else {
                    Err("El historial cambió o Git no admite la transacción requerida. Consulta el recibo; no se repite ni se usa una publicación alternativa".into())
                }
            }
            Ok(None) if start.elapsed() < Duration::from_secs(10) => {
                std::thread::sleep(Duration::from_millis(10))
            }
            _ => {
                let _ = child.kill();
                let _ = child.wait();
                return Err("Publicación no confirmada. Consulta el recibo sin repetir".into());
            }
        }
    }
}
impl LocalApi {
    pub(crate) fn list_graph_joins(&self, project: &str) -> Result<Value, String> {
        let root = folder(self, project, false)?;
        if !directory(&root)? {
            return Ok(json!({"items":[],"limited":false,"warnings":[]}));
        }
        let started = Instant::now();
        let mut items = vec![];
        let mut warnings = vec![];
        let mut limited = false;
        let mut total = 0u64;
        for (index, entry) in fs::read_dir(&root)
            .map_err(|_| "No se puede consultar el catálogo de reuniones")?
            .enumerate()
        {
            if index >= MAX_RECORDS || started.elapsed() > Duration::from_secs(2) {
                limited = true;
                break;
            }
            let item = (|| -> Result<Value, String> {
                let entry = entry.map_err(|_| "Entrada no legible")?;
                let name = entry
                    .file_name()
                    .to_str()
                    .ok_or("Nombre no compatible")?
                    .to_string();
                let attempt = name
                    .strip_suffix(".json")
                    .filter(|v| id(v))
                    .ok_or("Entrada desconocida conservada")?;
                let (record, bytes) = read(&entry.path(), project, attempt)?;
                total = total.saturating_add(bytes.len() as u64);
                if total > recovery_quotas::JOIN_BYTES {
                    return Err("Catálogo fuera de presupuesto".into());
                }
                Ok(
                    json!({"attemptId":record.attempt_id,"createdAt":record.created_at,"reviewedRevision":record.reviewed_revision,"targetCommit":record.target_commit,"resolution":record.resolution.as_deref().unwrap_or("identical")}),
                )
            })();
            match item {
                Ok(item) => items.push(item),
                Err(message) => {
                    limited = true;
                    if warnings.len() < 10 {
                        warnings.push(message)
                    }
                }
            }
        }
        items.sort_by(|a, b| b["createdAt"].as_str().cmp(&a["createdAt"].as_str()));
        Ok(json!({"items":items,"limited":limited,"warnings":warnings}))
    }
    pub(crate) fn review_graph_join(&self, project: &str, attempt: &str) -> Result<Value, String> {
        if !id(attempt) {
            return Err("Identidad de reunión no válida".into());
        }
        let root = folder(self, project, false)?;
        let path = root.join(format!("{attempt}.json"));
        recovery_lifecycle::ensure_open(self,&path)?;
        if !directory(&root)?
            || !path
                .try_exists()
                .map_err(|_| "No se pudo comprobar el recibo")?
        {
            return Ok(
                json!({"schemaVersion":1,"projectId":project,"attemptId":attempt,"status":"absent","canReplay":false,"checkedAt":knownext_core::now_iso()}),
            );
        }
        let (record, bytes) = read(&path, project, attempt)?;
        let source = context(self, project)?;
        let same_scope = location(&source) == record.location_revision
            && source.origin_revision == record.origin_revision
            && source.local_reference == record.local_reference
            && source.remote_reference == record.remote_reference;
        let state = if !same_scope {
            "changed"
        } else if source.local == record.target_commit {
            inspect_commit(&source.root, &record)?;
            "confirmed"
        } else if source.local == record.local_commit {
            "pending"
        } else {
            "changed"
        };
        if read(&path, project, attempt)?.1 != bytes || context(self, project)? != source {
            return Err(
                "El recibo o historial cambió durante la consulta; no se confirma ni repite".into(),
            );
        }
        Ok(
            json!({"schemaVersion":1,"projectId":project,"attemptId":attempt,"reviewedRevision":record.reviewed_revision,"targetCommit":record.target_commit,"resolution":record.resolution.as_deref().unwrap_or("identical"),"mixedSelection":record.mixed_selection,"status":state,"canReplay":false,"checkedAt":knownext_core::now_iso(),"message":match state{"confirmed" if record.resolution.as_deref()==Some("mixed")=>"La combinación guardada coincide con la selección verificada y ambos historiales están reunidos. No se han sustituido archivos ni borradores ni se ha enviado al remoto.","confirmed" if record.resolution.is_some()=>"Se conserva la versión guardada del equipo y ambos historiales. Las diferencias remotas permanecen solo en el historial; no se han incorporado a los archivos. El envío al remoto es una acción separada.","confirmed"=>"Historiales reunidos localmente. Los documentos no se han reemplazado. El envío al remoto es una acción separada.","pending"=>"Existe una preparación, pero no se confirma su publicación. No se ha reanudado ni repetido.",_=>"El ámbito o historial cambió. El recibo se conserva y no autoriza repetir la operación."}}),
        )
    }
    pub(crate) fn join_reviewed_histories(
        &self,
        project: &str,
        body: Value,
    ) -> Result<Value, String> {
        let request: Request =
            serde_json::from_value(body).map_err(|_| "Solicitud de reunión no compatible")?;
        let mixed_request=request.resolution.as_deref()==Some("mixed");
        let keep_local=if mixed_request{if request.acknowledge_prepared_combination!=Some(true)||request.acknowledge_remote_history_only.is_some()||request.mixed_plan_id.is_none()||request.mixed_plan_revision.is_none(){return Err("Confirma la combinación guardada y su selección antes de reunirla".into())}true}else{
            if request.mixed_plan_id.is_some()||request.mixed_plan_revision.is_some()||request.acknowledge_prepared_combination.is_some(){return Err("La selección solo se admite para una combinación mixta".into())}
            match(request.resolution.as_deref(),request.acknowledge_remote_history_only){(None|Some("identical"),None|Some(false))=>false,(Some("keep-local"),Some(true))=>true,_=>return Err("Confirma explícitamente la elección para todo el proyecto y el destino de las diferencias remotas".into())}
        };
        if !id(&request.attempt_id) || !digest(&request.revision) {
            return Err("Revisa el historial antes de reunirlo".into());
        }
        let _permit = self.project_transaction(project)?;
        let root = folder(self, project, true)?;
        let path = root.join(format!("{}.json", request.attempt_id));
        recovery_lifecycle::ensure_open(self,&path)?;
        if path
            .try_exists()
            .map_err(|_| "No se pudo comprobar el intento")?
        {
            return Err("Este intento ya está conservado. Consulta su recibo; no se repite".into());
        }
        let inventory = self.list_graph_joins(project)?;
        if inventory["limited"] == true
            || inventory["items"]
                .as_array()
                .is_none_or(|items| items.len() >= MAX_RECORDS)
        {
            return Err("Catálogo de reuniones no revisable o con64 recibos; se conserva sin podar ni reciclar identidades".into());
        }
        let review = self.review_remote_project(project)?;
        let source = context(self, project)?;
        if review["revision"] != request.revision
            || source.revision != request.revision
            || review["graphJoin"][if keep_local {
                "canKeepLocal"
            } else {
                "canJoin"
            }] != true
        {
            return Err("Cambió la revisión o esta elección no está disponible. Vuelve a consultar; no se ha reunido el historial".into());
        }
        let selection=if mixed_request{Some(mixed::check(self,project,request.mixed_plan_id.as_deref().unwrap_or(""),request.mixed_plan_revision.as_deref().unwrap_or(""),&source)?)}else{None};
        let common_tree = tree(&source.root, &source.local)?;
        let resolution=if mixed_request{Some("mixed")}else if keep_local{Some("keep-local")}else{None};
        let message = commit_message(resolution, &request.attempt_id);
        let bytes = read_git(
            &source.root,
            &[
                "-c",
                "core.hooksPath=/dev/null",
                "-c",
                "commit.gpgsign=false",
                "-c",
                "user.name=KnowNext",
                "-c",
                "user.email=local@knownext.invalid",
                "commit-tree",
                &common_tree,
                "-p",
                &source.local,
                "-p",
                &source.remote,
                "-m",
                &message,
            ],
        )?;
        let target = std::str::from_utf8(&bytes)
            .map_err(|_| "Versión preparada no válida")?
            .trim()
            .to_string();
        let record = Record {
            format: if mixed_request{3}else if keep_local { 2 } else { 1 },
            resolution: resolution.map(str::to_owned),
            mixed_selection:selection,
            project_id: project.into(),
            attempt_id: request.attempt_id,
            created_at: knownext_core::now_iso(),
            reviewed_revision: request.revision,
            location_revision: location(&source),
            origin_revision: source.origin_revision.clone(),
            local_reference: source.local_reference.clone(),
            remote_reference: source.remote_reference.clone(),
            local_commit: source.local.clone(),
            remote_commit: source.remote.clone(),
            tree: common_tree,
            target_commit: target,
        };
        validate(&record, project, &record.attempt_id)?;
        inspect_commit(&source.root, &record)?;
        if context(self, project)? != source || !clean(&source)? {
            return Err("El historial o los archivos cambiaron durante la preparación. Se conservan sin publicar".into());
        }
        let bytes = serde_json::to_vec(&record).map_err(|_| "No se pudo preparar el recibo")?;
        if bytes.len() as u64 > MAX_RECORD {
            return Err("Recibo fuera de límites".into());
        }
        atomic_io::create(&path, &bytes)
            .map_err(|_| "No se pudo conservar el recibo; no se ha publicado el historial")?;
        if read(&path, project, &record.attempt_id)?.1 != bytes {
            return Err("Recibo no comprobable; no se publica ni repite".into());
        }
        publish(&source, &record)?;
        self.review_graph_join(project, &record.attempt_id)
    }
}

impl LocalApi { pub(crate) fn lifecycle_join_record(&self,raw:&[u8])->bool{serde_json::from_slice::<Record>(raw).is_ok_and(|r|validate(&r,&r.project_id,&r.attempt_id).is_ok()&&self.project_root(&r.project_id).ok().is_some_and(|root|read_git(&root,&["merge-base","--is-ancestor",&r.target_commit,"HEAD"]).is_ok()))} }
