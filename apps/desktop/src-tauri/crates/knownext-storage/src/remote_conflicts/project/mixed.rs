//! A durable selection verifies a mixture already saved by the user. It never
//! checks out files, changes the index, consumes drafts or applies a choice.
use super::*;
mod application;
use std::{
    fs,
    time::{Duration, Instant},
};
const MAX_ROWS: usize = 256;
const MAX_PLAN: u64 = 256 * 1024;
const MAX_PLANS: usize = recovery_quotas::MIXED_RECORDS;
const MAX_TOTAL: u64 = recovery_quotas::MIXED_BYTES;
#[derive(Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Entry {
    mode: String,
    blob: String,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Row {
    path: String,
    local: Option<Entry>,
    remote: Option<Entry>,
    choice: String,
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Plan {
    format: u8,
    id: String,
    project_id: String,
    created_at: String,
    location: String,
    origin: String,
    local_reference: String,
    remote_reference: String,
    local_commit: String,
    remote_commit: String,
    rows: Vec<Row>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Proof {
    pub plan_id: String,
    pub plan_revision: String,
    pub choices_sha256: String,
    pub local_choices: usize,
    pub remote_choices: usize,
    pub combined_choices: usize,
}
fn hash(s: &str) -> bool {
    s.len() == 64 && s.bytes().all(|b| b.is_ascii_hexdigit())
}
fn identity(s: &str) -> bool {
    s.strip_prefix("mixed-")
        .is_some_and(|id| id.len() == 32 && id.bytes().all(|b| b.is_ascii_hexdigit()))
}
pub(super) fn valid_proof(p: &Proof) -> bool {
    identity(&p.plan_id)
        && hash(&p.plan_revision)
        && hash(&p.choices_sha256)
        && p.local_choices
            .saturating_add(p.remote_choices)
            .saturating_add(p.combined_choices)
            <= MAX_ROWS
        && (p.combined_choices > 0 || (p.local_choices > 0 && p.remote_choices > 0))
}
fn directory(p: &Path) -> Result<bool, String> {
    match fs::symlink_metadata(p) {
        Ok(m) if m.is_dir() && !batch::linked(&m) => Ok(true),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(false),
        _ => Err("El almacén de selecciones no es una carpeta regular; se conserva".into()),
    }
}
fn folder(api: &LocalApi, project: &str, create: bool) -> Result<PathBuf, String> {
    let parent = api.app_data_dir.join("mixed-reviews");
    let root = parent.join(sha256_hex(project.as_bytes()));
    for p in [&api.app_data_dir, &parent, &root] {
        if !directory(p)? && create {
            fs::create_dir(p).map_err(|_| "No se pudo preparar el almacén de selecciones")?;
            directory(p)?;
        }
    }
    Ok(root)
}
fn tree(source: &Context, commit: &str) -> Result<BTreeMap<String, Entry>, String> {
    let raw = read_git(
        &source.root,
        &["ls-tree", "-r", "-z", "--full-tree", commit],
    )?;
    let mut rows = BTreeMap::new();
    for raw in raw.split(|b| *b == 0).filter(|r| !r.is_empty()) {
        if rows.len() >= 10_000 {
            return Err(
                "La selección supera10.000 entradas históricas; se conserva sin aplicar".into(),
            );
        }
        let tab = raw
            .iter()
            .position(|b| *b == b'\t')
            .ok_or("Entrada histórica ambigua")?;
        let head = std::str::from_utf8(&raw[..tab])
            .map_err(|_| "Metadatos no compatibles")?
            .split(' ')
            .collect::<Vec<_>>();
        if head.len() != 3
            || head[0].len() != 6
            || !head[0].bytes().all(|b| (b'0'..=b'7').contains(&b))
            || !version_history::is_commit_id(head[2])
        {
            return Err("Entrada histórica no compatible".into());
        }
        let name = std::str::from_utf8(&raw[tab + 1..])
            .map_err(|_| "Ruta histórica no representable")?
            .to_owned();
        if name.is_empty() || name.len() > 4096 {
            return Err("Ruta histórica fuera de límites".into());
        }
        if rows
            .insert(
                name,
                Entry {
                    mode: head[0].into(),
                    blob: head[2].into(),
                },
            )
            .is_some()
        {
            return Err("Rutas históricas duplicadas".into());
        }
    }
    Ok(rows)
}
fn differences(
    api: &LocalApi,
    project: &str,
    source: &Context,
    local: &str,
    remote: &str,
) -> Result<Vec<Row>, String> {
    let a = tree(source, local)?;
    let b = tree(source, remote)?;
    let paths = a.keys().chain(b.keys()).collect::<BTreeSet<_>>();
    let mut rows = vec![];
    let mut portable = std::collections::HashSet::new();
    for name in paths {
        if a.get(name) == b.get(name) {
            continue;
        }
        if rows.len() >= MAX_ROWS {
            return Err("La revisión mixta supera256 rutas distintas; conserva las fuentes y reduce el alcance".into());
        }
        path(name.as_bytes())?;
        if !portable.insert(portable_paths::key(name)) {
            return Err("Hay rutas equivalentes por caso o normalización; conserva las fuentes y revisa por separado".into());
        }
        api.resolve_project_relative(project, name)?;
        if a.get(name)
            .into_iter()
            .chain(b.get(name))
            .any(|e| !matches!(e.mode.as_str(), "100644" | "100755"))
        {
            return Err(
                "La selección contiene enlaces, submódulos o tipos no admitidos; no se aplica"
                    .into(),
            );
        }
        rows.push(Row {
            path: name.clone(),
            local: a.get(name).cloned(),
            remote: b.get(name).cloned(),
            choice: String::new(),
        });
    }
    Ok(rows)
}
fn read(api: &LocalApi, project: &str, id: &str) -> Result<(Plan, String), String> {
    if !identity(id) {
        return Err("Identidad de selección no válida".into());
    }
    let root = folder(api, project, false)?;
    let record_path = root.join(format!("{id}.json"));
    recovery_lifecycle::ensure_open(api,&record_path)?;
    let meta = fs::symlink_metadata(&record_path)
        .map_err(|_| "Selección no disponible; conserva el identificador y consulta de nuevo")?;
    if !meta.is_file() || batch::linked(&meta) || meta.len() > MAX_PLAN {
        return Err("Selección no regular o fuera de límites; se conserva".into());
    }
    let mut bytes = vec![];
    std::fs::File::open(record_path)
        .map_err(|_| "Selección no legible")?
        .take(MAX_PLAN + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| "Selección no legible")?;
    if bytes.len() as u64 > MAX_PLAN {
        return Err("Selección fuera de límites".into());
    }
    let p: Plan = serde_json::from_slice(&bytes)
        .map_err(|_| "Formato de selección no compatible; se conserva sin reinterpretar")?;
    if p.format != 1
        || p.id != id
        || p.project_id != project
        || !hash(&p.location)
        || !hash(&p.origin)
        || !version_history::is_commit_id(&p.local_commit)
        || !version_history::is_commit_id(&p.remote_commit)
        || p.rows.is_empty()
        || p.rows.len() > MAX_ROWS
        || OffsetDateTime::parse(&p.created_at, &Rfc3339).is_err()
    {
        return Err("Selección no compatible; se conserva".into());
    }
    let mut seen = BTreeSet::new();
    for row in &p.rows {
        if !seen.insert(&row.path)
            || !matches!(row.choice.as_str(), "local" | "remote" | "combined")
            || path(row.path.as_bytes())? != row.path
            || row.local == row.remote
            || row.local.iter().chain(row.remote.iter()).any(|e| {
                !matches!(e.mode.as_str(), "100644" | "100755")
                    || !version_history::is_commit_id(&e.blob)
            })
        {
            return Err("Fila de selección no compatible; se conserva".into());
        }
    }
    Ok((p, sha256_hex(&bytes)))
}
fn public_row(project: &str, row: &Row, current: Option<&Entry>) -> Value {
    json!({"path":row.path,"choice":row.choice,"local":row.local,"remote":row.remote,"current":current,"documentId":is_markdown_path(Path::new(&row.path)).then(||doc_id(project,&row.path))})
}
pub(super) fn check(
    api: &LocalApi,
    project: &str,
    id: &str,
    revision: &str,
    source: &Context,
) -> Result<Proof, String> {
    let review = api.review_mixed_selection(project, id)?;
    if review["planRevision"] != revision
        || review["revision"] != source.revision
        || review["ready"] != true
    {
        return Err("La selección guardada no coincide con la combinación registrada. Revisa los pendientes antes de reunir el historial".into());
    }
    let proof: Proof = serde_json::from_value(review["proof"].clone())
        .map_err(|_| "Prueba de selección no compatible")?;
    if !valid_proof(&proof) {
        return Err("La selección no acredita una combinación mixta".into());
    }
    Ok(proof)
}
impl LocalApi {
    pub(crate) fn mixed_selection_candidates(
        &self,
        project: &str,
        body: Value,
    ) -> Result<Value, String> {
        #[derive(Deserialize)]
        #[serde(deny_unknown_fields)]
        struct Review {
            revision: String,
        }
        let request: Review =
            serde_json::from_value(body).map_err(|_| "Revisión mixta no compatible")?;
        let source = context(self, project)?;
        if source.revision != request.revision {
            return Err("Los historiales cambiaron; consulta de nuevo antes de seleccionar".into());
        }
        let rows = differences(self, project, &source, &source.local, &source.remote)?;
        if context(self, project)? != source {
            return Err("El ámbito cambió durante la revisión; vuelve a consultar".into());
        }
        Ok(
            json!({"schemaVersion":1,"projectId":project,"revision":source.revision,"rows":rows.iter().map(|row|public_row(project,row,row.local.as_ref())).collect::<Vec<_>>(),"checkedAt":knownext_core::now_iso()}),
        )
    }
    pub(crate) fn list_mixed_selections(&self, project: &str) -> Result<Value, String> {
        let root = folder(self, project, false)?;
        if !directory(&root)? {
            return Ok(json!({"items":[],"limited":false,"warnings":[]}));
        }
        let started = Instant::now();
        let mut items = vec![];
        let mut warnings = vec![];
        let mut total = 0u64;
        let mut limited = false;
        for (index, entry) in fs::read_dir(root)
            .map_err(|_| "No se puede consultar el inventario de selecciones")?
            .enumerate()
        {
            if index >= MAX_PLANS || started.elapsed() > Duration::from_secs(2) {
                limited = true;
                break;
            }
            let result = (|| -> Result<Value, String> {
                let e = entry.map_err(|_| "Entrada no legible")?;
                let name = e
                    .file_name()
                    .to_str()
                    .ok_or("Nombre no compatible")?
                    .to_owned();
                let id = name
                    .strip_suffix(".json")
                    .ok_or("Entrada desconocida conservada")?;
                let size = fs::symlink_metadata(e.path())
                    .map_err(|_| "Entrada no accesible")?
                    .len();
                total = total.saturating_add(size);
                if total > MAX_TOTAL {
                    return Err("Inventario fuera de límites".into());
                }
                let (p, revision) = read(self, project, id)?;
                Ok(
                    json!({"id":p.id,"createdAt":p.created_at,"planRevision":revision,"paths":p.rows.len()}),
                )
            })();
            match result {
                Ok(row) => items.push(row),
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
    pub(crate) fn create_mixed_selection(
        &self,
        project: &str,
        body: Value,
    ) -> Result<Value, String> {
        #[derive(Deserialize)]
        #[serde(rename_all = "camelCase", deny_unknown_fields)]
        struct Choice {
            path: String,
            choice: String,
        }
        #[derive(Deserialize)]
        #[serde(rename_all = "camelCase", deny_unknown_fields)]
        struct Request {
            id: String,
            revision: String,
            choices: Vec<Choice>,
        }
        let request: Request =
            serde_json::from_value(body).map_err(|_| "Selección mixta no compatible")?;
        if !identity(&request.id)
            || !hash(&request.revision)
            || request.choices.is_empty()
            || request.choices.len() > MAX_ROWS
        {
            return Err("Revisa todas las rutas antes de conservar la selección".into());
        }
        let _permit = self.project_transaction(project)?;
        let source = context(self, project)?;
        if source.revision != request.revision {
            return Err("La base cambió; consulta antes de conservar la selección".into());
        }
        let mut rows = differences(self, project, &source, &source.local, &source.remote)?;
        let mut choices = BTreeMap::new();
        for c in request.choices {
            if !matches!(c.choice.as_str(), "local" | "remote" | "combined")
                || choices.insert(c.path, c.choice).is_some()
            {
                return Err("Selección incompleta, duplicada o no compatible".into());
            }
        }
        if choices.len() != rows.len() {
            return Err(
                "Elige una variante para cada ruta de esta revisión, incluidas las no visibles"
                    .into(),
            );
        }
        for row in &mut rows {
            row.choice = choices
                .remove(&row.path)
                .ok_or("La selección contiene otra ruta")?;
        }
        let root = folder(self, project, true)?;
        let inventory = self.list_mixed_selections(project)?;
        if inventory["limited"] == true
            || inventory["items"]
                .as_array()
                .is_none_or(|items| items.len() >= MAX_PLANS)
        {
            return Err("El catálogo de selecciones está parcial o lleno; se conserva sin podar identidades".into());
        }
        let plan = Plan {
            format: 1,
            id: request.id.clone(),
            project_id: project.into(),
            created_at: knownext_core::now_iso(),
            location: sha256_hex(source.root.to_string_lossy().as_bytes()),
            origin: source.origin_revision.clone(),
            local_reference: source.local_reference.clone(),
            remote_reference: source.remote_reference.clone(),
            local_commit: source.local.clone(),
            remote_commit: source.remote.clone(),
            rows,
        };
        let bytes = serde_json::to_vec(&plan).map_err(|_| "No se pudo conservar la selección")?;
        if bytes.len() as u64 > MAX_PLAN || context(self, project)? != source {
            return Err("La selección supera su límite o el ámbito cambió; vuelve a revisar".into());
        }
        let _budget=recovery_inventory::admit(self,bytes.len() as u64)?;
        recovery_lifecycle::ensure_open(self,&root.join(format!("{}.json",plan.id)))?;
        atomic_io::create(&root.join(format!("{}.json",plan.id)),&bytes).map_err(|_|"La selección ya existe o no se confirmó su conservación. Consulta este identificador sin reenviarla")?;
        self.review_mixed_selection(project, &plan.id)
    }
    pub(crate) fn review_mixed_selection(&self, project: &str, id: &str) -> Result<Value, String> {
        let (p, revision) = read(self, project, id)?;
        let source = context(self, project)?;
        if sha256_hex(source.root.to_string_lossy().as_bytes()) != p.location
            || source.origin_revision != p.origin
            || source.local_reference != p.local_reference
            || source.remote_reference != p.remote_reference
            || source.remote != p.remote_commit
        {
            return Err("La ubicación, conexión o referencia remota cambió. La selección original se conserva; prepara otra revisión".into());
        }
        read_git(
            &source.root,
            &[
                "merge-base",
                "--is-ancestor",
                &p.local_commit,
                &source.local,
            ],
        )
        .map_err(|_| {
            "El historial local ya no conserva la base de esta selección; se conserva sin publicar"
        })?;
        let original = differences(self, project, &source, &p.local_commit, &p.remote_commit)?;
        if original.len() != p.rows.len()
            || original
                .iter()
                .zip(&p.rows)
                .any(|(a, b)| a.path != b.path || a.local != b.local || a.remote != b.remote)
        {
            return Err(
                "Las fuentes originales no confirman la selección; se conserva sin publicar".into(),
            );
        }
        let current = tree(&source, &source.local)?;
        let before = tree(&source, &p.local_commit)?;
        let names = p
            .rows
            .iter()
            .map(|r| r.path.as_str())
            .collect::<BTreeSet<_>>();
        let additional = before
            .keys()
            .chain(current.keys())
            .filter(|name| {
                before.get(*name) != current.get(*name) && !names.contains(name.as_str())
            })
            .collect::<BTreeSet<_>>();
        let mut proof = Proof {
            plan_id: p.id.clone(),
            plan_revision: revision.clone(),
            choices_sha256: sha256_hex(
                &serde_json::to_vec(&p.rows).map_err(|_| "Selección no comprobable")?,
            ),
            local_choices: 0,
            remote_choices: 0,
            combined_choices: 0,
        };
        let mut rows = vec![];
        let mut matches = true;
        for row in &p.rows {
            let actual = current.get(&row.path);
            let ok = match row.choice.as_str() {
                "local" => {
                    proof.local_choices += 1;
                    actual == row.local.as_ref()
                }
                "remote" => {
                    proof.remote_choices += 1;
                    actual == row.remote.as_ref()
                }
                _ => {
                    proof.combined_choices += 1;
                    actual.is_some_and(|v| matches!(v.mode.as_str(), "100644" | "100755"))
                        && actual != row.local.as_ref()
                        && actual != row.remote.as_ref()
                }
            };
            matches &= ok;
            let mut public = public_row(project, row, actual);
            public["matches"] = json!(ok);
            rows.push(public);
        }
        let clean = read_git(
            &source.root,
            &[
                "status",
                "--porcelain=v1",
                "-z",
                "--untracked-files=all",
                "--ignore-submodules=none",
            ],
        )?
        .is_empty();
        let mixed = valid_proof(&proof);
        let base = read_git(
            &source.root,
            &["merge-base", "--all", &source.local, &source.remote],
        )?;
        let base = std::str::from_utf8(&base)
            .map_err(|_| "Base común no compatible")?
            .trim();
        let diverged =
            base != source.local && base != source.remote && base.split_whitespace().count() == 1;
        let ready = matches && additional.is_empty() && clean && mixed && diverged;
        if context(self, project)? != source || read(self, project, id)?.1 != revision {
            return Err(
                "El historial o la selección cambió durante la consulta; revisa de nuevo".into(),
            );
        }
        Ok(
            json!({"schemaVersion":1,"projectId":project,"id":p.id,"planRevision":revision,"revision":source.revision,"localCommit":source.local,"remoteCommit":source.remote,"rows":rows,"proof":proof,"ready":ready,"relation":if source.local==source.remote{"up-to-date"}else if base==source.local{"remote-ahead"}else if base==source.remote{"local-ahead"}else{"diverged"},"canReplay":false,"additionalPaths":additional.iter().take(20).collect::<Vec<_>>(),"additionalCount":additional.len(),"checkedAt":knownext_core::now_iso(),"message":if !diverged{"Los historiales ya no requieren esta reunión divergente. La selección se conserva como referencia."}else if !additional.is_empty(){"Hay cambios guardados fuera de esta selección. Conserva el trabajo y prepara una revisión nueva."}else if !clean{"Hay cambios sin registrar. Guarda y registra el resultado antes de verificar la combinación."}else if !matches{"Algunas rutas aún no contienen la variante elegida. Prepáralas con los flujos de comparación, recuperación y guardado; seleccionar aquí no sustituye archivos."}else if !mixed{"La selección no es mixta. Usa la elección completa de un lado o revisa la combinación."}else{"La versión guardada coincide con todas las elecciones. Puedes reunir los historiales sin cambiar archivos, índice ni borradores."}}),
        )
    }
}

impl LocalApi { pub(crate) fn lifecycle_mixed_record(&self,raw:&[u8])->bool{serde_json::from_slice::<Plan>(raw).is_ok_and(|p|read(self,&p.project_id,&p.id).is_ok_and(|(_,digest)|digest==sha256_hex(raw))&&(recovery_lifecycle::is_closed(self,&self.app_data_dir.join("mixed-applications").join(sha256_hex(p.project_id.as_bytes())).join(&p.id)).unwrap_or(false)||self.review_mixed_application(&p.project_id,&p.id).is_ok_and(|v|v["phase"]=="absent"||(matches!(v["phase"].as_str(),Some("completed"|"abandoned"|"changed"|"retired"))&&v["canRelease"]!=true))))} }
