//! Follow only a unique Git-reported rename from one known common ancestor.
use super::*;
use std::{io::Read, process::Stdio};
const DIFF_LIMIT: u64 = 8 * 1024 * 1024;
fn changes(root: &Path, base: &str, tip: &str) -> Result<Vec<u8>, String> {
    let mut child = local_git_command()
        .arg("-C")
        .arg(root)
        .args([
            "diff-tree",
            "--no-commit-id",
            "--no-ext-diff",
            "--no-textconv",
            "-r",
            "-z",
            "--name-status",
            "--find-renames=50%",
            "--diff-filter=R",
            "-l1000",
            base,
            tip,
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|_| "No se pudo revisar el cambio de nombre conocido")?;
    let mut output = vec![];
    let read = child
        .stdout
        .take()
        .ok_or("No se pudo leer la revisión de rutas")?
        .take(DIFF_LIMIT + 1)
        .read_to_end(&mut output);
    if read.is_err() || output.len() as u64 > DIFF_LIMIT {
        let _ = child.kill();
        let _ = child.wait();
        return Err("La revisión de renombres supera los límites; las fuentes se conservan".into());
    }
    if !child
        .wait()
        .map_err(|_| "No se pudo completar la revisión de rutas")?
        .success()
    {
        return Err(
            "No se pudo revisar el cambio de nombre conocido; se conservan las fuentes".into(),
        );
    }
    Ok(output)
}
fn renamed(
    root: &Path,
    base: &str,
    tip: &str,
    path: &str,
    backwards: bool,
) -> Result<Option<String>, String> {
    let bytes = changes(root, base, tip)?;
    let mut tokens = bytes.split(|byte| *byte == 0).collect::<Vec<_>>();
    if tokens.last().is_some_and(|token| token.is_empty()) {
        tokens.pop();
    }
    if tokens.len() % 3 != 0 || tokens.len() > 60_000 {
        return Err("La revisión de renombres no es compatible o supera sus límites".into());
    }
    let mut found = None;
    for record in tokens.chunks_exact(3) {
        if record[0].first() != Some(&b'R')
            || record[0].len() < 2
            || !record[0][1..].iter().all(u8::is_ascii_digit)
        {
            return Err("La revisión de rutas no se pudo interpretar sin ambigüedad".into());
        }
        if record[if backwards { 2 } else { 1 }] != path.as_bytes() {
            continue;
        }
        let candidate = std::str::from_utf8(record[if backwards { 1 } else { 2 }])
            .map_err(|_| "El nombre remoto no es UTF-8 compatible")?;
        if found.replace(candidate.to_string()).is_some() {
            return Err(
                "Hay más de un origen de ruta posible; revisa el proyecto antes de combinar".into(),
            );
        }
    }
    Ok(found)
}
pub(super) fn resolve(
    root: &Path,
    local: &str,
    remote: &str,
    path: &str,
) -> Result<String, String> {
    let bytes = git(root, &["merge-base", "--all", local, remote])?;
    let text = std::str::from_utf8(&bytes).map_err(|_| "No hay una base común interpretable")?;
    let bases = text.split_whitespace().collect::<Vec<_>>();
    if bases.len() != 1 || !version_history::is_commit_id(bases[0]) {
        return Err(
            "No hay una base común única para revisar el renombre; se conservan las fuentes".into(),
        );
    }
    let base = bases[0];
    let ancestor = renamed(root, base, local, path, true)?.unwrap_or_else(|| path.into());
    let source = if let Some(renamed) = renamed(root, base, remote, &ancestor, false)? {
        renamed
    } else if ancestor != path
        && !git(
            root,
            &[
                "--literal-pathspecs",
                "ls-tree",
                "-z",
                remote,
                "--",
                &ancestor,
            ],
        )?
        .is_empty()
    {
        ancestor
    } else {
        return Err("El remoto conocido no contiene esta ruta ni un renombre verificable desde la base común; no se ha aplicado ningún cambio".into());
    };
    if source.len() > 4096
        || source
            .split('/')
            .any(|part| portable_paths::component(part).is_err())
        || !matches!(
            Path::new(&source)
                .extension()
                .and_then(|value| value.to_str())
                .map(str::to_ascii_lowercase)
                .as_deref(),
            Some("md" | "markdown")
        )
    {
        return Err(
            "La ruta remota renombrada no es Markdown portable; se conserva sin aplicar".into(),
        );
    }
    Ok(source)
}
