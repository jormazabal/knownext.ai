//! Cached commit-graph review. No fetch, provider, checkout, index update or resolution.
use super::*;
use std::{io::Read, process::Stdio};
mod copies;
mod mixed;
mod join;
const MAX_OUTPUT: u64 = 2 * 1024 * 1024;
const MAX_CHANGES: usize = 10_000;
fn read_git(root: &Path, args: &[&str]) -> Result<Vec<u8>, String> {
    read_git_bounded(root, args, MAX_OUTPUT)
}
fn read_git_bounded(root: &Path, args: &[&str], maximum: u64) -> Result<Vec<u8>, String> {
    let mut child = local_git_command()
        .arg("--no-optional-locks")
        .arg("-C")
        .arg(root)
        .args(args)
        .env("GIT_OPTIONAL_LOCKS", "0")
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|_| "No se pudo iniciar la revisión del historial conocido")?;
    let mut bytes = vec![];
    let read = child
        .stdout
        .take()
        .ok_or("No se pudo consultar el historial")?
        .take(maximum + 1)
        .read_to_end(&mut bytes);
    if read.is_err() || bytes.len() as u64 > maximum {
        let _ = child.kill();
        let _ = child.wait();
        return Err(
            "La lectura histórica supera el límite de esta operación; las fuentes se conservan"
                .into(),
        );
    }
    if !child
        .wait()
        .map_err(|_| "No se pudo completar la revisión")?
        .success()
    {
        return Err("No se pudo revisar el historial conocido. Las fuentes se conservan".into());
    }
    Ok(bytes)
}
#[derive(PartialEq, Eq)]
struct Context {
    root: PathBuf,
    local: String,
    remote: String,
    local_reference: String,
    remote_reference: String,
    origin_revision: String,
    revision: String,
}
fn context(api: &LocalApi, project: &str) -> Result<Context, String> {
    let root = api
        .project_root(project)?
        .canonicalize()
        .map_err(|_| "No se puede verificar la ubicación del proyecto")?;
    let registry = api.registry_checked()?;
    let record = registry["projects"]
        .as_array()
        .and_then(|entries| entries.iter().find(|entry| entry["id"] == project))
        .ok_or("Proyecto no registrado")?;
    let branch = github_repository_parts(&record["githubRepository"])
        .and_then(|(_, _, branch)| branch)
        .or_else(|| current_git_branch(&root))
        .ok_or("No hay referencia remota configurada")?;
    if branch.len() > 512 {
        return Err("La referencia configurada supera el límite de revisión".into());
    }
    let reference = format!("refs/remotes/origin/{branch}");
    read_git(&root, &["check-ref-format", &reference])?;
    let origin = read_git(&root, &["config", "--get", "remote.origin.url"])?;
    if origin.is_empty() {
        return Err("No hay origen remoto configurado".into());
    }
    let local = commit(&root, "HEAD")?;
    let remote = commit(&root, &reference)?;
    let local_reference = String::from_utf8(read_git(
        &root,
        &["rev-parse", "--symbolic-full-name", "HEAD"],
    )?)
    .map_err(|_| "Referencia local no compatible")?
    .trim()
    .to_string();
    let origin_revision = sha256_hex(&origin);
    let revision=sha256_hex(&serde_json::to_vec(&json!({"projectId":project,"location":root.to_string_lossy(),"localCommit":local,"remoteCommit":remote,"originHash":origin_revision,"referenceHash":sha256_hex(reference.as_bytes()),"localReferenceHash":sha256_hex(local_reference.as_bytes())})).map_err(|_|"No se pudo identificar la revisión")?);
    Ok(Context {
        root,
        local,
        remote,
        local_reference,
        remote_reference: reference,
        origin_revision,
        revision,
    })
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Change {
    side: String,
    change: String,
    path: String,
    previous_path: Option<String>,
    kind: String,
    overlap: bool,
    identical: bool,
    can_open: bool,
    can_recover: bool,
    document_id: Option<String>,
    #[serde(skip)]
    mode: String,
    #[serde(skip)]
    blob: String,
}
fn path(bytes: &[u8]) -> Result<String, String> {
    let path = std::str::from_utf8(bytes)
        .map_err(|_| "Hay rutas que no son UTF-8; se conserva el proyecto sin aplicar")?;
    if path.is_empty()
        || path.len() > 4096
        || path
            .split('/')
            .any(|part| portable_paths::component(part).is_err())
    {
        return Err("Hay rutas no portables; se conserva el proyecto sin aplicar".into());
    }
    Ok(path.into())
}
fn changes(
    api: &LocalApi,
    project: &str,
    root: &Path,
    base: &str,
    tip: &str,
    side: &str,
) -> Result<Vec<Change>, String> {
    let bytes = read_git(
        root,
        &[
            "diff-tree",
            "--no-commit-id",
            "--no-ext-diff",
            "--no-textconv",
            "--no-abbrev",
            "-r",
            "-z",
            "--raw",
            "--find-renames=50%",
            "-l1000",
            base,
            tip,
        ],
    )?;
    let mut tokens = bytes.split(|byte| *byte == 0).peekable();
    let mut changes = vec![];
    while let Some(header) = tokens.next() {
        if header.is_empty() && tokens.peek().is_none() {
            break;
        }
        if changes.len() >= MAX_CHANGES {
            return Err(
                "La revisión supera 10.000 cambios por lado; las fuentes se conservan".into(),
            );
        }
        let header = std::str::from_utf8(header)
            .map_err(|_| "Metadatos históricos no compatibles")?
            .split(' ')
            .collect::<Vec<_>>();
        if header.len() != 5
            || !header[0].starts_with(':')
            || !version_history::is_commit_id(header[2])
            || !version_history::is_commit_id(header[3])
        {
            return Err("No se pudo interpretar una entrada del historial".into());
        }
        let status = header[4].as_bytes();
        let change = match status.first() {
            Some(b'A') => "added",
            Some(b'D') => "deleted",
            Some(b'M') => "modified",
            Some(b'T') => "type-changed",
            Some(b'R') => "renamed",
            _ => {
                return Err(
                    "Tipo de cambio histórico no compatible; se conserva sin aplicar".into(),
                )
            }
        };
        if status.len() > 1 && (change != "renamed" || !status[1..].iter().all(u8::is_ascii_digit))
        {
            return Err("Metadatos de cambio no compatibles".into());
        }
        let first = path(tokens.next().ok_or("Falta una ruta histórica")?)?;
        let (path, previous_path) = if change == "renamed" {
            (
                path(tokens.next().ok_or("Falta el destino del renombre")?)?,
                Some(first),
            )
        } else {
            (first, None)
        };
        let mode = if change == "deleted" {
            &header[0][1..]
        } else {
            header[1]
        };
        let regular = matches!(mode, "100644" | "100755")
            && matches!(&header[0][1..], "000000" | "100644" | "100755");
        let kind = if !regular {
            "unsupported"
        } else if is_markdown_path(Path::new(&path)) {
            "markdown"
        } else {
            "resource"
        };
        let can_open = kind == "markdown"
            && api
                .resolve_markdown_path(&doc_id(project, &path))
                .is_ok_and(|file| {
                    std::fs::symlink_metadata(file)
                        .is_ok_and(|meta| meta.is_file() && !batch::linked(&meta))
                });
        changes.push(Change {
            side: side.into(),
            change: change.into(),
            document_id: can_open.then(|| doc_id(project, &path)),
            path,
            previous_path,
            kind: kind.into(),
            overlap: false,
            identical: false,
            can_open,
            can_recover: regular,
            mode: mode.into(),
            blob: header[3].into(),
        });
    }
    Ok(changes)
}
fn touches(a: &Change, b: &Change) -> bool {
    [&a.path]
        .into_iter()
        .chain(a.previous_path.as_ref())
        .any(|left| {
            [&b.path]
                .into_iter()
                .chain(b.previous_path.as_ref())
                .any(|right| {
                    left == right
                        || left
                            .strip_prefix(right.as_str())
                            .is_some_and(|rest| rest.starts_with('/'))
                        || right
                            .strip_prefix(left.as_str())
                            .is_some_and(|rest| rest.starts_with('/'))
                })
        })
}
impl LocalApi {
    pub(crate) fn review_remote_project(&self, project: &str) -> Result<Value, String> {
        let source = context(self, project)?;
        let base = read_git(
            &source.root,
            &["merge-base", "--all", &source.local, &source.remote],
        )?;
        let text = std::str::from_utf8(&base).map_err(|_| "Base común no compatible")?;
        let bases = text.split_whitespace().collect::<Vec<_>>();
        if bases.len() != 1 || !version_history::is_commit_id(bases[0]) {
            return Err(
                "No hay una base común única para revisar el proyecto; las fuentes se conservan"
                    .into(),
            );
        }
        let base = bases[0];
        let mut local = changes(self, project, &source.root, base, &source.local, "local")?;
        let mut remote = changes(self, project, &source.root, base, &source.remote, "remote")?;
        // Bound the cross-side comparison rather than performing an unbounded quadratic scan.
        if local.len().saturating_mul(remote.len()) > 1_000_000 {
            return Err("La revisión cruzada supera su presupuesto. Revisa un proyecto de menor alcance; no se aplicó ningún cambio".into());
        }
        for left in &mut local {
            for right in &mut remote {
                if touches(left, right) {
                    let identical = left.path == right.path
                        && left.previous_path == right.previous_path
                        && left.change == right.change
                        && left.mode == right.mode
                        && left.blob == right.blob;
                    left.identical = if left.overlap {
                        left.identical && identical
                    } else {
                        identical
                    };
                    right.identical = if right.overlap {
                        right.identical && identical
                    } else {
                        identical
                    };
                    left.overlap = true;
                    right.overlap = true;
                }
            }
        }
        if context(self, project)? != source {
            return Err("El historial, la ubicación o la conexión conocida cambiaron durante la revisión; vuelve a consultarlos".into());
        }
        let relation = if source.local == source.remote {
            "up-to-date"
        } else if source.local == base {
            "remote-ahead"
        } else if source.remote == base {
            "local-ahead"
        } else {
            "diverged"
        };
        let mut join = join::availability(&source, relation);
        let mixed=self.list_mixed_selections(project).unwrap_or_else(|message|json!({"items":[],"limited":true,"warnings":[message]}));
        let joins = self.list_graph_joins(project)?;
        let copies = self.list_historical_copies(project).unwrap_or_else(
            |message| json!({"items":[],"limited":true,"warnings":[message],"retainedBytes":0}),
        );
        if joins["limited"] == true
            || joins["items"]
                .as_array()
                .is_none_or(|items| items.len() >= join::MAX_RECORDS)
        {
            join = json!({"canJoin":false,"canKeepLocal":false,"message":"El catálogo de reuniones no se puede revisar por completo o ha alcanzado64 recibos. Se conservan sus identidades; no se permite otra reunión ni se podan automáticamente."});
        }
        Ok(
            json!({"schemaVersion":1,"projectId":project,"revision":source.revision,"localCommit":source.local,"remoteCommit":source.remote,"baseCommit":base,"relation":relation,"local":local,"remote":remote,"graphJoin":join,"graphJoins":joins,"historyCopies":copies,"mixedSelections":mixed,"checkedAt":knownext_core::now_iso(),"warnings":["Solo versiones guardadas y referencia remota conocida: puede estar desactualizada. No incluye borradores ni cambios sin registrar.","Las rutas coincidentes requieren revisión; no equivalen por sí solas a conflictos de texto. Consultar no fusiona ni sincroniza el proyecto."]}),
        )
    }
}
