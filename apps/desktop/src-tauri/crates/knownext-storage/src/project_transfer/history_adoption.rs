//! Explicit adoption of self-contained Git history. Never checks out a document.
use super::*;
use std::{fs, io::Read, process::Stdio, time::Instant};
pub fn is_portable_history_work(method: &str, path: &str) -> bool {
    method.eq_ignore_ascii_case("POST")
        && matches!(
            path.trim_matches('/')
                .split('/')
                .collect::<Vec<_>>()
                .as_slice(),
            [
                "api",
                "projects",
                _,
                "portable-history",
                _,
                "adopt" | "review"
            ]
        )
}
const PRIVATE: &str = "Archivo KnowNext";
const RECOVERY: &str = ".knownext-history-import";
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Parts {
    bytes: u64,
    sha256: String,
    parts: Vec<Part>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Part {
    path: String,
    payload_bytes: u64,
    skip_bytes: u8,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Entry {
    kind: String,
    bundle: Parts,
    reachable_history_only: bool,
    active: bool,
}
struct Catalog {
    root: PathBuf,
    revision: String,
    items: Vec<(String, Entry)>,
    unavailable: usize,
}
struct Prepared {
    work: tempfile::TempDir,
    repo: PathBuf,
    catalog: Catalog,
    id: String,
    revision: String,
    sha: String,
    tips: Vec<Value>,
    references: usize,
    objects: usize,
    logical_bytes: u64,
    state: &'static str,
}
fn sha_valid(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(|b| b.is_ascii_hexdigit())
}
fn read(root: &Path, path: &str, limit: u64) -> Result<Vec<u8>, String> {
    paths::validate(path)?;
    if path.split('/').any(|part| {
        matches!(
            part.to_ascii_lowercase().as_str(),
            "owner.lock" | "runtime-owner.lock" | "capture.lock"
        )
    }) {
        return Err("Ruta de historial no compatible".into());
    }
    let target = path_policy::resolve(root, &format!("{PRIVATE}/{path}"))?;
    let meta =
        fs::symlink_metadata(&target).map_err(|_| "Falta una parte del historial portable")?;
    if !meta.is_file() || batch::linked(&meta) || meta.len() > limit {
        return Err("Parte del historial no regular o fuera de límites".into());
    }
    let mut raw = vec![];
    fs::File::open(target)
        .map_err(|_| "No se puede abrir el historial")?
        .take(limit + 1)
        .read_to_end(&mut raw)
        .map_err(|_| "Lectura incompleta de historial")?;
    if raw.len() as u64 != meta.len() || raw.len() as u64 > limit {
        return Err("El historial cambió durante la lectura".into());
    }
    Ok(raw)
}
fn catalog(api: &LocalApi, project: &str) -> Result<Catalog, String> {
    let root = api
        .project_root(project)?
        .canonicalize()
        .map_err(|_| "Proyecto no disponible")?;
    let raw = read(&root, "Inventario.json", MAX_MANIFEST)?;
    let inventory = archive_index::parse(&raw)?;
    let revision = sha256_hex(
        &serde_json::to_vec(&json!([project, root, sha256_hex(&raw)]))
            .map_err(|_| "Ámbito no representable")?,
    );
    let mut items = vec![];
    let mut unavailable = 0;
    let mut seen = BTreeSet::new();
    for item in inventory
        .items
        .into_iter()
        .filter(|item| item["kind"] == "history")
    {
        let parsed = (|| -> Result<(String, Entry), String> {
            let entry: Entry =
                serde_json::from_value(item).map_err(|_| "Entrada de historial no compatible")?;
            if entry.kind != "history"
                || entry.active
                || !entry.reachable_history_only
                || entry.bundle.bytes == 0
                || entry.bundle.bytes > MAX_CONTENT
                || !sha_valid(&entry.bundle.sha256)
                || entry.bundle.parts.is_empty()
                || entry.bundle.parts.len() > 128
            {
                return Err("Historial fuera de límites".into());
            }
            let id = sha256_hex(
                &serde_json::to_vec(&json!([project, root, entry]))
                    .map_err(|_| "Identidad no representable")?,
            );
            Ok((id, entry))
        })();
        match parsed {
            Ok(value) if items.len() < 128 && seen.insert(value.0.clone()) => items.push(value),
            _ => unavailable += 1,
        }
    }
    Ok(Catalog {
        root,
        revision,
        items,
        unavailable,
    })
}
fn destination(root: &Path) -> &'static str {
    for name in [".git", RECOVERY] {
        match fs::symlink_metadata(root.join(name)) {
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => (),
            Ok(_) => return "occupied",
            Err(_) => return "unavailable",
        }
    }
    "absent"
}
fn measure(root: &Path, transient: bool) -> Result<(usize, u64), String> {
    let mut pending = vec![root.to_path_buf()];
    let mut entries = 0usize;
    let mut bytes = 0u64;
    while let Some(path) = pending.pop() {
        entries += 1;
        if entries > 20000 {
            return Err("La preparación Git supera20000 entradas".into());
        }
        if path.file_name().is_some_and(|name| {
            matches!(
                name.to_string_lossy().to_ascii_lowercase().as_str(),
                "owner.lock" | "runtime-owner.lock" | "capture.lock"
            )
        }) {
            return Err("La preparación contiene coordinación ajena; no se abre ni publica".into());
        }
        let meta = match fs::symlink_metadata(&path) {
            Ok(value) => value,
            Err(error) if transient && error.kind() == std::io::ErrorKind::NotFound => continue,
            Err(_) => return Err("Preparación Git no accesible".into()),
        };
        if batch::linked(&meta) {
            return Err("La preparación Git contiene enlaces; no se publica".into());
        }
        if meta.is_dir() {
            let children = match fs::read_dir(path) {
                Ok(value) => value,
                Err(error) if transient && error.kind() == std::io::ErrorKind::NotFound => continue,
                Err(_) => return Err("No se puede medir Git".into()),
            };
            for item in children {
                pending.push(item.map_err(|_| "Inventario Git incompleto")?.path());
            }
        } else if meta.is_file() {
            bytes = bytes
                .checked_add(meta.len())
                .filter(|n| *n <= 512 * 1024 * 1024)
                .ok_or("La preparación Git supera512MiB")?;
        } else {
            return Err("Preparación Git no regular".into());
        }
    }
    Ok((entries, bytes))
}
fn git(work: &Path, repo: &Path, args: &[&str]) -> Result<Vec<u8>, String> {
    git_input(work, repo, args, None)
}
fn git_input(
    work: &Path,
    repo: &Path,
    args: &[&str],
    input: Option<&[u8]>,
) -> Result<Vec<u8>, String> {
    let out = tempfile::NamedTempFile::new_in(work)
        .map_err(|_| "No se puede preparar la consulta Git")?;
    let err = tempfile::NamedTempFile::new_in(work)
        .map_err(|_| "No se puede preparar el diagnóstico Git")?;
    let mut command = local_git_command();
    for key in [
        "GIT_DIR",
        "GIT_WORK_TREE",
        "GIT_INDEX_FILE",
        "GIT_OBJECT_DIRECTORY",
        "GIT_ALTERNATE_OBJECT_DIRECTORIES",
        "GIT_CONFIG_COUNT",
        "GIT_CONFIG_PARAMETERS",
        "GIT_REPLACE_REF_BASE",
    ] {
        command.env_remove(key);
    }
    command
        .env("GIT_CONFIG_NOSYSTEM", "1")
        .env(
            "GIT_CONFIG_GLOBAL",
            if cfg!(windows) { "NUL" } else { "/dev/null" },
        )
        .env("GIT_NO_REPLACE_OBJECTS", "1")
        .env("GIT_OPTIONAL_LOCKS", "0")
        .args([
            "--no-pager",
            "-c",
            "core.hooksPath=",
            "-c",
            "core.fsmonitor=false",
            "-c",
            "gc.auto=0",
            "-c",
            "maintenance.auto=false",
            "-c",
            "protocol.allow=never",
            "-c",
            "pack.threads=1",
            "-c",
            "pack.windowMemory=16m",
            "-C",
        ])
        // Git for Windows accepts canonical verbatim paths through -C, but not --git-dir.
        .arg(
            repo.parent()
                .ok_or("La preparación Git no tiene ubicación contenedora")?,
        )
        .arg("--git-dir")
        .arg(
            repo.file_name()
                .ok_or("Identidad de repositorio no válida")?,
        )
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::from(
            out.reopen().map_err(|_| "Consulta no accesible")?,
        ))
        .stderr(Stdio::from(
            err.reopen().map_err(|_| "Diagnóstico no accesible")?,
        ));
    let mut stdin_file = None;
    if let Some(input) = input {
        if input.len() > 64 * 1024 {
            return Err("La publicación de referencias supera su límite".into());
        }
        let mut f = tempfile::NamedTempFile::new_in(work)
            .map_err(|_| "No se pudo preparar la publicación Git")?;
        std::io::Write::write_all(&mut f, input).map_err(|_| "Publicación Git incompleta")?;
        command.stdin(Stdio::from(
            f.reopen().map_err(|_| "Publicación no disponible")?,
        ));
        stdin_file = Some(f);
    }
    let _stdin_file = stdin_file;
    let mut child = command
        .spawn()
        .map_err(|_| "Git local no está disponible")?;
    let started = Instant::now();
    loop {
        let result = (|| -> Result<Option<std::process::ExitStatus>, String> {
            if started.elapsed() > Duration::from_secs(30)
                || out
                    .as_file()
                    .metadata()
                    .map_err(|_| "No se puede medir Git")?
                    .len()
                    > 1024 * 1024
                || err
                    .as_file()
                    .metadata()
                    .map_err(|_| "No se puede medir Git")?
                    .len()
                    > 1024 * 1024
            {
                return Err("La consulta Git supera su tiempo o salida permitidos".into());
            }
            if repo.exists() {
                // Git atomically replaces its own temporary lock files while running.
                measure(repo, true)?;
            }
            child
                .try_wait()
                .map_err(|_| "Consulta Git interrumpida".into())
        })();
        match result {
            Ok(Some(status)) => {
                if !status.success() {
                    let step = match args.first().copied().unwrap_or("") {
                        "init" => "preparar el repositorio local",
                        "bundle" => "comprobar el archivo autónomo",
                        "update-ref" | "symbolic-ref" => "conservar los puntos de partida",
                        "config" => "configurar el historial nuevo",
                        "read-tree" => "preparar el índice del historial",
                        "rev-parse" => "comprobar el historial publicado",
                        _ => "consultar el contenido histórico",
                    };
                    return Err(format!(
                        "No se pudo {step}; las fuentes permanecen (Git {}).",
                        status.code().unwrap_or(-1)
                    ));
                }
                break;
            }
            Ok(None) => std::thread::sleep(Duration::from_millis(50)),
            Err(error) => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(error);
            }
        }
    }
    let raw = fs::read(out.path()).map_err(|_| "No se pudo leer la consulta Git")?;
    if raw.len() > 1024 * 1024 {
        return Err("Salida Git fuera de límites".into());
    }
    Ok(raw)
}
fn prepare(
    api: &LocalApi,
    project: &str,
    id: &str,
    expected: Option<&str>,
) -> Result<Prepared, String> {
    project_capabilities::require_history_runtime()?;
    let catalog = catalog(api, project)?;
    if expected.is_some_and(|revision| revision != catalog.revision) {
        return Err("El archivo cambió; actualiza el catálogo".into());
    }
    let entry = catalog
        .items
        .iter()
        .find(|item| item.0 == id)
        .map(|item| item.1.clone())
        .ok_or("Historial fuera del catálogo revisado")?;
    let work = tempfile::tempdir().map_err(|_| "No se puede preparar la revisión de historial")?;
    let mut bundle = vec![];
    let mut seen = std::collections::HashSet::new();
    for part in &entry.bundle.parts {
        if part.skip_bytes != 0
            || part.payload_bytes == 0
            || part.payload_bytes > 16 * 1024 * 1024
            || !part.path.ends_with(".bin")
            || !seen.insert(paths::key(&part.path))
        {
            return Err("Partes repetidas o no compatibles en el historial".into());
        }
        let raw = read(&catalog.root, &part.path, MAX_FILE)?;
        if raw.len() as u64 != part.payload_bytes
            || bundle.len() as u64 + part.payload_bytes > entry.bundle.bytes
        {
            return Err("Las partes no coinciden con el tamaño revisado".into());
        }
        bundle.extend(raw);
    }
    if bundle.len() as u64 != entry.bundle.bytes
        || sha256_hex(&bundle) != entry.bundle.sha256.to_ascii_lowercase()
    {
        return Err("La huella del historial no coincide; no se prepara una copia parcial".into());
    }
    let source = work.path().join("history.bundle");
    fs::write(&source, &bundle).map_err(|_| "No se pudo preparar el bundle")?;
    drop(bundle);
    let repo = work.path().join("repo.git");
    git(
        work.path(),
        &repo,
        &["init", "--bare", "--template=", "--initial-branch=knownext"],
    )?;
    let source = source.to_str().ok_or("Ruta temporal no representable")?;
    git(work.path(), &repo, &["bundle", "verify", source])?;
    let references = git(work.path(), &repo, &["bundle", "unbundle", source])?;
    let text = std::str::from_utf8(&references).map_err(|_| "Referencias Git no compatibles")?;
    let mut count = 0;
    for line in text.lines() {
        let (object, name) = line.split_once(' ').ok_or("Referencia Git no compatible")?;
        if !version_history::is_commit_id(object) || name.is_empty() || count >= 128 {
            return Err("El historial supera128 referencias o usa objetos no compatibles".into());
        }
        git(
            work.path(),
            &repo,
            &[
                "update-ref",
                &format!("refs/knownext-source/{count}"),
                object,
            ],
        )?;
        count += 1;
    }
    if count == 0 {
        return Err("El bundle no contiene puntos de partida".into());
    }
    let objects = git(
        work.path(),
        &repo,
        &[
            "cat-file",
            "--batch-all-objects",
            "--batch-check=%(objectname) %(objecttype) %(objectsize)",
        ],
    )?;
    let mut object_count = 0;
    let mut logical_bytes = 0u64;
    for line in std::str::from_utf8(&objects)
        .map_err(|_| "Objetos Git no compatibles")?
        .lines()
    {
        let fields: Vec<_> = line.split(' ').collect();
        if fields.len() != 3
            || !version_history::is_commit_id(fields[0])
            || !matches!(fields[1], "commit" | "tree" | "blob" | "tag")
        {
            return Err("Objetos Git no compatibles".into());
        }
        let size = fields[2]
            .parse::<u64>()
            .map_err(|_| "Tamaño de objeto inválido")?;
        object_count += 1;
        logical_bytes = logical_bytes
            .checked_add(size)
            .filter(|n| *n <= 512 * 1024 * 1024)
            .ok_or("El historial lógico supera512MiB")?;
        if object_count > 10000 || size > 128 * 1024 * 1024 {
            return Err("El historial supera sus límites de objetos".into());
        }
    }
    let log = git(
        work.path(),
        &repo,
        &[
            "log",
            "--all",
            "--no-walk",
            "--no-show-signature",
            "--format=%H%x00%s%x00%aI%x00%an%x00",
        ],
    )?;
    let text = std::str::from_utf8(&log).map_err(|_| "Títulos de historial no compatibles")?;
    let fields: Vec<_> = text.split('\0').collect();
    let mut tips = vec![];
    let mut unique = BTreeSet::new();
    let mut i = 0;
    while i + 3 < fields.len() {
        let commit = fields[i].trim_matches('\n');
        if !version_history::is_commit_id(commit)
            || OffsetDateTime::parse(fields[i + 2], &Rfc3339).is_err()
        {
            return Err("Punto de partida Git no compatible".into());
        }
        if unique.insert(commit.to_owned()) {
            tips.push(
                json!({"id":commit,"title":fields[i+1],"date":fields[i+2],"author":fields[i+3]}),
            );
        }
        i += 4;
    }
    if tips.is_empty() {
        return Err("No hay un punto de partida consultable".into());
    }
    let state = if matches!(fs::symlink_metadata(catalog.root.join(RECOVERY)),Err(e) if e.kind()==std::io::ErrorKind::NotFound)
        && destination(&catalog.root) == "occupied"
        && fs::symlink_metadata(catalog.root.join(".git"))
            .is_ok_and(|m| m.is_dir() && !batch::linked(&m))
        && git_head_hash(&catalog.root)?.is_some()
    {
        "existing"
    } else {
        destination(&catalog.root)
    };
    let sha = entry.bundle.sha256.to_ascii_lowercase();
    let revision = sha256_hex(
        &serde_json::to_vec(&json!([
            project,
            catalog.root,
            catalog.revision,
            id,
            sha,
            state,
            tips,
            if state == "existing" {
                native_stamp(api, project, &catalog.root)?
            } else {
                Value::Null
            }
        ]))
        .map_err(|_| "Revisión no representable")?,
    );
    Ok(Prepared {
        work,
        repo,
        catalog,
        id: id.into(),
        revision,
        sha,
        tips,
        references: count,
        objects: object_count,
        logical_bytes,
        state,
    })
}
fn public(project: &str, value: &Prepared) -> Value {
    json!({"schemaVersion":1,"projectId":project,"entryId":value.id,"catalogRevision":value.catalog.revision,"revision":value.revision,"checkedAt":knownext_core::now_iso(),"bundleSha256":value.sha,"tips":value.tips,"references":value.references,"objects":value.objects,"logicalBytes":value.logical_bytes,"nativeState":value.state,"canAdopt":matches!(value.state,"absent"|"existing"),"preservesFiles":true,"changesSettings":false,"startsAi":false})
}
impl LocalApi {
    pub(crate) fn portable_history_catalog(&self, project: &str) -> Result<Value, String> {
        let value = catalog(self, project)?;
        Ok(
            json!({"schemaVersion":1,"projectId":project,"revision":value.revision,"checkedAt":knownext_core::now_iso(),"scope":"portable-history-only","limited":value.unavailable>0,"unavailable":value.unavailable,"runtimeAvailable":project_capabilities::require_history_runtime().is_ok(),"items":value.items.iter().enumerate().map(|(index,(id,item))|json!({"id":id,"label":format!("Historial {}",index+1),"bytes":item.bundle.bytes})).collect::<Vec<_>>()}),
        )
    }
    pub(crate) fn review_portable_history(
        &self,
        project: &str,
        id: &str,
        body: Value,
    ) -> Result<Value, String> {
        #[derive(Deserialize)]
        #[serde(rename_all = "camelCase", deny_unknown_fields)]
        struct Input {
            catalog_revision: String,
        }
        let input: Input = serde_json::from_value(body)
            .map_err(|_| "Actualiza la lista antes de revisar el historial")?;
        Ok(public(
            project,
            &prepare(self, project, id, Some(&input.catalog_revision))?,
        ))
    }
    pub(crate) fn adopt_portable_history(
        &self,
        project: &str,
        id: &str,
        body: Value,
    ) -> Result<Value, String> {
        #[derive(Deserialize)]
        #[serde(rename_all = "camelCase", deny_unknown_fields)]
        struct Input {
            revision: String,
            tip: String,
            acknowledge: bool,
        }
        let input: Input = serde_json::from_value(body)
            .map_err(|_| "Elige y confirma el punto de partida del historial")?;
        if !input.acknowledge {
            return Err("Confirma el historial antes de incorporarlo".into());
        }
        let _transaction = self.project_transaction(project)?;
        let value = prepare(self, project, id, None)?;
        if value.state == "existing" {
            return coexist(self, project, id, &value, &input.revision, &input.tip);
        }
        if value.revision != input.revision
            || value.state != "absent"
            || !value.tips.iter().any(|tip| tip["id"] == input.tip)
        {
            return Err("El historial o su destino cambiaron; revisa de nuevo sin repetir".into());
        }
        git(
            value.work.path(),
            &value.repo,
            &["update-ref", "refs/heads/knownext-import", &input.tip],
        )?;
        git(
            value.work.path(),
            &value.repo,
            &["symbolic-ref", "HEAD", "refs/heads/knownext-import"],
        )?;
        git(
            value.work.path(),
            &value.repo,
            &["config", "core.bare", "false"],
        )?;
        git(
            value.work.path(),
            &value.repo,
            &["config", "core.filemode", "false"],
        )?;
        git(value.work.path(), &value.repo, &["read-tree", &input.tip])?;
        fs::create_dir_all(value.repo.join("info"))
            .map_err(|_| "No se pudo preparar la exclusión privada del historial")?;
        fs::write(
            value.repo.join("info/exclude"),
            b"/Archivo KnowNext/\n/.knownext-*\n",
        )
        .map_err(|_| "No se pudo excluir el archivo privado del historial activo")?;
        let marker=serde_json::to_vec(&json!({"schemaVersion":1,"projectId":project,"entryId":id,"bundleSha256":value.sha,"tip":input.tip,"requestRevision":input.revision,"createdAt":knownext_core::now_iso()})).map_err(|_|"Registro de procedencia no representable")?;
        atomic_io::create(&value.repo.join("knownext-portable-history.json"), &marker)
            .map_err(|_| "No se pudo confirmar la procedencia del historial")?;
        measure(&value.repo, false)?;
        let current = catalog(self, project)?;
        if current.revision != value.catalog.revision
            || current.root != value.catalog.root
            || destination(&current.root) != "absent"
        {
            return Err(
                "La ubicación o el archivo cambiaron antes de publicar; se conservan las fuentes"
                    .into(),
            );
        }
        // Source bytes are checked again; all document files and drafts stay outside publication.
        let original = current
            .items
            .iter()
            .find(|item| item.0 == id)
            .ok_or("La fuente dejó de estar disponible")?;
        let mut digest = Sha256::new();
        for part in &original.1.bundle.parts {
            digest.update(read(&current.root, &part.path, MAX_FILE)?);
        }
        if format!("{:x}", digest.finalize()) != value.sha {
            return Err("El bundle cambió antes de publicar".into());
        }
        let stage = current.root.join(RECOVERY);
        fs::create_dir(&stage).map_err(|_| {
            "Ya hay una preparación de historial; se conserva sin superponer otro intento"
        })?;
        atomic_io::create(&stage.join("preparation.json"), &marker)
            .map_err(|_| "La preparación no está confirmada; consulta sin repetir")?;
        let target = stage.join("repository");
        copy_repository(&value.repo, &target)?;
        atomic_io::rename_no_replace(&target,&current.root.join(".git")).map_err(|_|"No se confirmó la publicación del historial. Consulta su estado; no se sustituye un destino existente")?;
        if fs::read(current.root.join(".git/knownext-portable-history.json"))
            .ok()
            .as_deref()
            != Some(marker.as_slice())
            || git(
                value.work.path(),
                &current.root.join(".git"),
                &["rev-parse", "HEAD"],
            )?
            .strip_suffix(b"\n")
            .unwrap_or(&[])
                != input.tip.as_bytes()
        {
            return Err(
                "El historial requiere revisión tras publicar. No repitas la incorporación".into(),
            );
        }
        Ok(
            json!({"schemaVersion":1,"projectId":project,"entryId":id,"requestRevision":input.revision,"tip":input.tip,"status":"adopted","checkedAt":knownext_core::now_iso(),"preservesFiles":true,"changesSettings":false,"startsAi":false}),
        )
    }
}
fn copy_repository(source: &Path, target: &Path) -> Result<(), String> {
    measure(source, false)?;
    fs::create_dir(target).map_err(|_| "No se pudo reservar el repositorio nuevo")?;
    let mut folders = vec![(source.to_path_buf(), target.to_path_buf())];
    while let Some((from, to)) = folders.pop() {
        for entry in fs::read_dir(from).map_err(|_| "No se pudo copiar Git")? {
            let entry = entry.map_err(|_| "Copia Git incompleta")?;
            if matches!(
                entry
                    .file_name()
                    .to_string_lossy()
                    .to_ascii_lowercase()
                    .as_str(),
                "owner.lock" | "runtime-owner.lock" | "capture.lock"
            ) {
                return Err(
                    "La preparación contiene coordinación ajena; se conserva sin abrir".into(),
                );
            }
            let meta =
                fs::symlink_metadata(entry.path()).map_err(|_| "Entrada Git no accesible")?;
            let dest = to.join(entry.file_name());
            if batch::linked(&meta) {
                return Err("La preparación Git cambió a un enlace".into());
            }
            if meta.is_dir() {
                fs::create_dir(&dest).map_err(|_| "No se pudo crear una carpeta Git")?;
                folders.push((entry.path(), dest));
            } else if meta.is_file() {
                let raw = fs::read(entry.path()).map_err(|_| "No se pudo leer una entrada Git")?;
                atomic_io::create(&dest, &raw)
                    .map_err(|_| "No se pudo publicar una entrada Git")?;
                if fs::read(&dest).ok().as_deref() != Some(raw.as_slice()) {
                    return Err("La copia Git no coincide".into());
                }
            } else {
                return Err("Entrada Git no regular".into());
            }
        }
    }
    measure(target, false)?;
    Ok(())
}

fn native_stamp(api: &LocalApi, p: &str, root: &Path) -> Result<Value, String> {
    let raw = match fs::symlink_metadata(root.join(".git/index")) {
        Ok(m) if m.is_file() && !batch::linked(&m) && m.len() <= 64 * 1024 * 1024 => Some(
            export_execution::bounded_read(&root.join(".git/index"), 64 * 1024 * 1024)?,
        ),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => None,
        _ => return Err("Índice Git no verificable; se conserva".into()),
    };
    let (_, view) = history_views::snapshot(api, p)?;
    Ok(
        json!({"head":git_head_hash(root)?,"index":raw.map(|b|sha256_hex(&b)),"view":view.map(|b|sha256_hex(&b))}),
    )
}
fn coexist(
    api: &LocalApi,
    p: &str,
    id: &str,
    value: &Prepared,
    revision: &str,
    tip: &str,
) -> Result<Value, String> {
    if value.revision != revision || !value.tips.iter().any(|t| t["id"] == tip) {
        return Err("El historial cambió; vuelve a revisar antes de incorporar".into());
    }
    let current = catalog(api, p)?;
    if current.revision != value.catalog.revision || current.root != value.catalog.root {
        return Err("La fuente del historial cambió; vuelve a revisar".into());
    }
    let original = current
        .items
        .iter()
        .find(|item| item.0 == id)
        .ok_or("La fuente dejó de estar disponible")?;
    let mut digest = Sha256::new();
    for part in &original.1.bundle.parts {
        digest.update(read(&current.root, &part.path, MAX_FILE)?);
    }
    if format!("{:x}", digest.finalize()) != value.sha {
        return Err("El bundle cambió antes de incorporar; se conservan las fuentes".into());
    }
    let stamp = native_stamp(api, p, &value.catalog.root)?;
    let (mut store, raw) = history_views::snapshot(api, p)?;
    let namespace = format!("refs/knownext-portable/{}/", value.sha);
    let listed = git(
        value.work.path(),
        &value.repo,
        &[
            "for-each-ref",
            "--format=%(objectname) %(refname)",
            "refs/knownext-source/",
        ],
    )?;
    let mut refs = vec![];
    for (index, line) in std::str::from_utf8(&listed)
        .map_err(|_| "Referencias no representables")?
        .lines()
        .enumerate()
    {
        let (hash, _) = line.split_once(' ').ok_or("Referencia no válida")?;
        if !version_history::is_commit_id(hash) || index >= 128 {
            return Err("Referencias fuera de límite".into());
        }
        refs.push((format!("{namespace}{index}"), hash.to_owned()));
    }
    if refs.is_empty() {
        return Err("No hay puntos importables".into());
    }
    if let Some(old) = store.sources.iter().find(|s| s.bundle == value.sha) {
        if old.references != refs || old.entry_id != id {
            return Err("La identidad del historial ya conserva otra preparación".into());
        }
    } else {
        if store.sources.len() >= 128 {
            return Err("Se conservan128 fuentes de historial".into());
        }
        store.sources.push(history_views::Source {
            entry_id: id.into(),
            bundle: value.sha.clone(),
            phase: "prepared".into(),
            references: refs.clone(),
        });
        history_views::write(api, p, &store, &raw)?;
    }
    let root = &value.catalog.root;
    let live = root.join(".git");
    let observed = git(
        value.work.path(),
        &live,
        &[
            "for-each-ref",
            "--format=%(refname) %(objectname)",
            &namespace,
        ],
    )?;
    let existing = std::str::from_utf8(&observed)
        .map_err(|_| "Referencias no representables")?
        .lines()
        .map(|l| {
            l.split_once(' ')
                .map(|(a, b)| (a.to_owned(), b.to_owned()))
                .ok_or("Referencia no compatible")
        })
        .collect::<Result<BTreeMap<_, _>, _>>()?;
    if existing
        .iter()
        .any(|(name, hash)| !refs.iter().any(|(n, h)| n == name && h == hash))
    {
        return Err("El destino contiene referencias ajenas; se conservan sin reemplazar".into());
    }
    if existing.len() != refs.len() {
        let bundle = value.work.path().join("history.bundle");
        git(
            value.work.path(),
            &live,
            &[
                "bundle",
                "unbundle",
                bundle.to_str().ok_or("Fuente no representable")?,
            ],
        )?;
        let mut input = String::from("start\n");
        for (name, hash) in &refs {
            if !existing.contains_key(name) {
                input.push_str(&format!("create {name} {hash}\n"));
            }
        }
        input.push_str("prepare\ncommit\n");
        git_input(
            value.work.path(),
            &live,
            &["update-ref", "--stdin"],
            Some(input.as_bytes()),
        )?;
    }
    let after = native_stamp(api, p, root)?;
    if stamp["head"] != after["head"] || stamp["index"] != after["index"] {
        return Err(
            "El historial se incorporó, pero el punto local cambió. Consulta sin repetir".into(),
        );
    }
    let (mut store, current) = history_views::snapshot(api, p)?;
    store
        .sources
        .iter_mut()
        .find(|s| s.bundle == value.sha)
        .ok_or("Falta la preparación")?
        .phase = "completed".into();
    store.base_head = history_views::head(root)?;
    store.tip = Some(tip.into());
    history_views::write(api, p, &store, &current)?;
    Ok(
        json!({"schemaVersion":1,"projectId":p,"entryId":id,"requestRevision":revision,"tip":tip,"status":"adopted","checkedAt":knownext_core::now_iso(),"preservesFiles":true,"changesSettings":false,"startsAi":false,"coexists":true}),
    )
}

#[cfg(test)]
mod coexist_tests {
    use super::*;
    fn cmd(root: &Path, args: &[&str]) -> String {
        let o = run_local_git(local_git_command().arg("-C").arg(root).args(args)).unwrap();
        assert!(
            o.status.success(),
            "{:?}: {}",
            args,
            String::from_utf8_lossy(&o.stderr)
        );
        String::from_utf8(o.stdout).unwrap()
    }
    #[test]
    fn portability_block_history_coexists_and_query_changes_never_checkout_or_replace_index() {
        let d = tempfile::tempdir().unwrap();
        let source = d.path().join("source");
        fs::create_dir(&source).unwrap();
        cmd(&source, &["init", "--initial-branch=qa"]);
        cmd(&source, &["config", "user.name", "Owned QA"]);
        cmd(&source, &["config", "user.email", "qa@example.invalid"]);
        fs::write(source.join("a.md"), "# Source one").unwrap();
        cmd(&source, &["add", "a.md"]);
        cmd(&source, &["commit", "-m", "Source point"]);
        let bundle = d.path().join("history.bundle");
        cmd(
            &source,
            &["bundle", "create", bundle.to_str().unwrap(), "--all"],
        );
        let raw = fs::read(&bundle).unwrap();
        let api = LocalApi::new(d.path().join("state"), "qa".into(), "test".into());
        let root = d.path().join("target");
        let p=api.create_project(json!({"name":"History target","folderPath":root,"versioningMode":"none","syncMode":"none"})).unwrap()["id"].as_str().unwrap().to_owned();
        cmd(&root, &["init", "--initial-branch=qa"]);
        cmd(&root, &["config", "user.name", "Owned QA"]);
        cmd(&root, &["config", "user.email", "qa@example.invalid"]);
        fs::write(root.join("a.md"), "# Current target").unwrap();
        cmd(&root, &["add", "a.md"]);
        cmd(&root, &["commit", "-m", "Current point"]);
        fs::write(root.join("unrelated.txt"), "staged data").unwrap();
        cmd(&root, &["add", "unrelated.txt"]);
        let head = git_head_hash(&root).unwrap();
        let index = fs::read(root.join(".git/index")).unwrap();
        let private = root.join("Archivo KnowNext");
        fs::create_dir(&private).unwrap();
        fs::write(private.join("history.bin"), &raw).unwrap();
        fs::write(private.join("Inventario.json"),serde_json::to_vec(&json!({"format":"knownext.project-archive","schemaVersion":1,"dataOnly":true,"items":[{"kind":"history","bundle":{"bytes":raw.len(),"sha256":sha256_hex(&raw),"parts":[{"path":"history.bin","payloadBytes":raw.len(),"skipBytes":0}]},"reachableHistoryOnly":true,"active":false}]})).unwrap()).unwrap();
        let list = api.portable_history_catalog(&p).unwrap();
        let id = list["items"][0]["id"].as_str().unwrap();
        let review = api
            .review_portable_history(&p, id, json!({"catalogRevision":list["revision"]}))
            .unwrap();
        assert_eq!(review["nativeState"], "existing");
        let tip = review["tips"][0]["id"].as_str().unwrap();
        let input = json!({"revision":review["revision"],"tip":tip,"acknowledge":true});
        let result = api.adopt_portable_history(&p, id, input.clone()).unwrap();
        assert_eq!(result["coexists"], true);
        assert_eq!(git_head_hash(&root).unwrap(), head);
        assert_eq!(fs::read(root.join(".git/index")).unwrap(), index);
        assert_eq!(
            fs::read_to_string(root.join("a.md")).unwrap(),
            "# Current target"
        );
        let document = doc_id(&p, "a.md");
        assert_eq!(
            api.version_content(&document, tip).unwrap()["markdown"],
            "# Source one"
        );
        assert!(api.adopt_portable_history(&p, id, input).is_err());
        let points = api.history_points(&p, 0).unwrap();
        assert_eq!(points["selectedTip"], tip);
        api.select_history_point(
            &p,
            json!({"revision":points["revision"],"tip":null,"acknowledge":true}),
        )
        .unwrap();
        assert_eq!(api.history_query_tip(&p).unwrap(), "HEAD");
        let points = api.history_points(&p, 0).unwrap();
        api.select_history_point(
            &p,
            json!({"revision":points["revision"],"tip":tip,"acknowledge":true}),
        )
        .unwrap();
        cmd(&root, &["commit", "-m", "New current version"]);
        assert_eq!(api.history_query_tip(&p).unwrap(), "HEAD");
        assert_eq!(api.history_points(&p, 0).unwrap()["selectionExpired"], true);
        assert!(!cmd(
            &root,
            &[
                "for-each-ref",
                "--format=%(objectname)",
                "refs/knownext-portable/"
            ]
        )
        .trim()
        .is_empty());
    }
}
