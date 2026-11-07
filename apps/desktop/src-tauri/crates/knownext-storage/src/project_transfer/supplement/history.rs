use super::*;
use std::{
    process::Stdio,
    time::{Duration, Instant},
};

fn git(
    root: &Path,
    work: &Path,
    args: &[&str],
    output: Option<&Path>,
    check: &dyn Fn() -> Result<(), String>,
) -> Result<Vec<u8>, String> {
    let log = tempfile::NamedTempFile::new_in(work)
        .map_err(|_| "No se puede reservar la consulta Git")?;
    let errors = tempfile::NamedTempFile::new_in(work)
        .map_err(|_| "No se puede reservar el diagnóstico Git")?;
    let mut command = local_git_command();
    for key in [
        "GIT_DIR",
        "GIT_WORK_TREE",
        "GIT_INDEX_FILE",
        "GIT_OBJECT_DIRECTORY",
        "GIT_ALTERNATE_OBJECT_DIRECTORIES",
        "GIT_CONFIG_COUNT",
    ] {
        command.env_remove(key);
    }
    command
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
            "pack.threads=1",
            "-c",
            "pack.windowMemory=16m",
            "-C",
        ])
        .arg(root)
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::from(
            log.reopen()
                .map_err(|_| "No se puede abrir la consulta Git")?,
        ))
        .stderr(Stdio::from(
            errors
                .reopen()
                .map_err(|_| "No se puede abrir el diagnóstico Git")?,
        ));
    let mut child = command.spawn().map_err(|_| {
        "Git no está disponible para archivar el historial; elige el paquete documental"
    })?;
    let started = Instant::now();
    let result = loop {
        let state = (|| -> Result<Option<std::process::ExitStatus>, String> {
            check()?;
            if started.elapsed() > Duration::from_secs(30)
                || log
                    .as_file()
                    .metadata()
                    .map_err(|_| "No se puede medir la consulta Git")?
                    .len()
                    > 1024 * 1024
                || errors
                    .as_file()
                    .metadata()
                    .map_err(|_| "No se puede medir el diagnóstico Git")?
                    .len()
                    > 1024 * 1024
                || output.is_some_and(|p| fs::metadata(p).is_ok_and(|m| m.len() > MAX_CONTENT))
            {
                return Err("El historial supera el tiempo o tamaño del archivo portable; los originales se conservan".into());
            }
            child
                .try_wait()
                .map_err(|_| "No se puede consultar la preparación Git".into())
        })();
        match state {
            Ok(Some(status)) => {
                break if status.success()
                    || (args.first() == Some(&"show-ref")
                        && status.code() == Some(1)
                        && log.as_file().metadata().is_ok_and(|m| m.len() == 0)
                        && errors.as_file().metadata().is_ok_and(|m| m.len() == 0))
                {
                    Ok(())
                } else {
                    Err("No se pudo preparar un historial autónomo; revisa el repositorio o usa el paquete documental".into())
                }
            }
            Ok(None) => std::thread::sleep(Duration::from_millis(20)),
            Err(error) => {
                let _ = child.kill();
                let _ = child.wait();
                break Err(error);
            }
        }
    };
    result?;
    let mut raw = vec![];
    fs::File::open(log.path())
        .map_err(|_| "Consulta Git no disponible")?
        .take(1024 * 1024 + 1)
        .read_to_end(&mut raw)
        .map_err(|_| "Consulta Git incompleta")?;
    if raw.len() > 1024 * 1024 {
        return Err("La consulta Git excede su límite".into());
    }
    Ok(raw)
}

pub(super) fn append(
    root: &Path,
    parent: &Path,
    builder: &mut Builder<'_>,
) -> Result<bool, String> {
    match fs::symlink_metadata(root.join(".git")) {
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(false),
        Err(_) => return Err("No se puede consultar el historial local".into()),
        Ok(_) => jobs::regular_directory(&root.join(".git"))?,
    }
    project_capabilities::require_history_runtime()?;
    for name in [
        "commondir",
        "shallow",
        "objects/info/alternates",
        "objects/info/http-alternates",
    ] {
        if fs::symlink_metadata(root.join(".git").join(name)).is_ok() {
            return Err("El historial depende de otro almacén o está incompleto; usa el paquete documental hasta completarlo".into());
        }
    }
    let work = tempfile::Builder::new()
        .prefix("history-")
        .tempdir_in(parent)
        .map_err(|_| "No se puede preparar el historial privado")?;
    let refs = git(
        root,
        work.path(),
        &["show-ref", "--head"],
        None,
        builder.check,
    )?;
    if refs.is_empty() {
        return Ok(false);
    }
    let bundle = work.path().join("history.bundle");
    let target = bundle.to_str().ok_or("Ruta del historial no compatible")?;
    git(
        root,
        work.path(),
        &["bundle", "create", target, "--all"],
        Some(&bundle),
        builder.check,
    )?;
    let data = builder.parts(work.path(), "history.bundle", "Historial/Parte", false)?;
    git(
        root,
        work.path(),
        &["bundle", "verify", target],
        None,
        builder.check,
    )?;
    if git(
        root,
        work.path(),
        &["show-ref", "--head"],
        None,
        builder.check,
    )? != refs
    {
        return Err("El historial cambió durante la preparación; vuelve a crear el archivo".into());
    }
    builder
        .items
        .push(json!({"kind":"history","bundle":data,"reachableHistoryOnly":true,"active":false}));
    // The temporary bundle has been copied and verified; it is removed with this private work area.
    builder.sources.retain(|source| source.base != work.path());
    Ok(true)
}
