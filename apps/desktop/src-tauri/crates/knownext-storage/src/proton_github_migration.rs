//! GitHub migration checks share the existing credential store and ordinary Git
//! repository. No cloned .git directory, force push or implicit remote rewrite.
use super::*;
use std::io::{Read, Write};
use std::process::Stdio;

const OUTPUT_LIMIT: u64 = 16 * 1024 * 1024;
const GITHUB_FILE_LIMIT: u64 = 100 * 1024 * 1024;

fn git(
    root: &Path,
    args: &[&str],
    input: Option<Vec<u8>>,
    token: Option<&str>,
) -> Result<Vec<u8>, String> {
    let mut command = local_git_command();
    // Snapshot paths are exact filenames, including brackets and other Git
    // pattern syntax. NUL separation alone does not make pathspecs literal.
    command.arg("--literal-pathspecs")
        .env_remove("GIT_GLOB_PATHSPECS")
        .env_remove("GIT_NOGLOB_PATHSPECS")
        .env_remove("GIT_ICASE_PATHSPECS")
        .arg("-C").arg(root).args([
        "-c",
        "core.hooksPath=/dev/null",
        "-c",
        "http.lowSpeedLimit=1",
        "-c",
        "http.lowSpeedTime=30",
    ]);
    if let Some(token) = token {
        command.arg("-c").arg(format!(
            "http.https://github.com/.extraheader={}",
            git_auth_header(token)
        ));
    }
    let mut child = command
        .args(args)
        .stdin(if input.is_some() {
            Stdio::piped()
        } else {
            Stdio::null()
        })
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|_| "Git no está disponible para revisar la migración")?;
    let writer = input.map(|data| {
        let mut stdin = child.stdin.take().expect("piped stdin");
        std::thread::spawn(move || stdin.write_all(&data))
    });
    let mut bytes = Vec::new();
    let read = child
        .stdout
        .take()
        .ok_or("No se pudo revisar Git")?
        .take(OUTPUT_LIMIT + 1)
        .read_to_end(&mut bytes);
    if read.is_err() || bytes.len() as u64 > OUTPUT_LIMIT {
        let _ = child.kill();
        let _ = child.wait();
        if let Some(writer) = writer {
            let _ = writer.join();
        }
        return Err(
            "La revisión Git está incompleta o supera su presupuesto; se conserva el origen".into(),
        );
    }
    let success = child
        .wait()
        .map_err(|_| "No se pudo confirmar Git")?
        .success();
    let wrote = writer
        .map(|w| w.join().is_ok_and(|r| r.is_ok()))
        .unwrap_or(true);
    if !success || !wrote {
        return Err("No se pudo verificar GitHub; se conserva la conexión de origen. Revisa el acceso y los cambios remotos.".into());
    }
    Ok(bytes)
}

fn text(root: &Path, args: &[&str], token: Option<&str>) -> Result<String, String> {
    String::from_utf8(git(root, args, None, token)?)
        .map(|s| s.trim().to_owned())
        .map_err(|_| "La respuesta Git no es compatible".into())
}
fn valid_oid(value: &str) -> bool {
    matches!(value.len(), 40 | 64) && value.bytes().all(|b| b.is_ascii_hexdigit())
}
fn head(root: &Path) -> Result<Option<String>, String> {
    // A missing HEAD is legitimate only for a verified empty repository.
    let value = text(root, &["rev-parse", "--verify", "HEAD"], None);
    match value {
        Ok(id) if valid_oid(&id) => Ok(Some(id)),
        Ok(_) => Err("Identidad Git no verificable".into()),
        Err(error) => {
            if text(root, &["rev-list", "--all", "--count"], None)? == "0" {
                Ok(None)
            } else {
                Err(error)
            }
        }
    }
}
fn remote_head(
    root: &Path,
    remote: &str,
    branch: &str,
    token: &str,
) -> Result<Option<String>, String> {
    let output = text(
        root,
        &[
            "ls-remote",
            "--heads",
            remote,
            &format!("refs/heads/{branch}"),
        ],
        Some(token),
    )?;
    if output.is_empty() {
        return Ok(None);
    }
    let mut rows = output.lines();
    let id = rows
        .next()
        .and_then(|r| r.split_whitespace().next())
        .filter(|s| valid_oid(s))
        .ok_or("Identidad remota Git no verificable")?;
    if rows.next().is_some() {
        return Err("La referencia remota no es inequívoca".into());
    }
    Ok(Some(id.to_owned()))
}

fn metadata(bytes: &[u8]) -> Result<Vec<(String, u64)>, String> {
    let output = std::str::from_utf8(bytes).map_err(|_| "Inventario histórico Git incompatible")?;
    let mut small = Vec::new();
    for (index, row) in output.lines().enumerate() {
        if index >= 100_000 {
            return Err("El historial supera el presupuesto de revisión; no se ha migrado".into());
        }
        let cols = row.split_whitespace().collect::<Vec<_>>();
        if cols.len() != 3 || !valid_oid(cols[0]) {
            return Err("Inventario histórico Git incompleto".into());
        }
        let size = cols[2]
            .parse::<u64>()
            .map_err(|_| "Tamaño histórico Git desconocido")?;
        if cols[1] == "blob" {
            if size > GITHUB_FILE_LIMIT {
                return Err("El historial contiene un archivo mayor de 100 MiB; conserva el proyecto y revisa ese archivo antes de usar GitHub".into());
            }
            if size <= 1024 {
                small.push((cols[0].to_owned(), size));
            }
        }
    }
    Ok(small)
}
fn history_policy(root: &Path) -> Result<(), String> {
    match head(root)? {Some(tip)=>history_policy_at(root,&tip),None=>Ok(())}
}
fn history_policy_at(root:&Path,tip:&str)->Result<(),String>{
    if !valid_oid(tip){return Err("Versión Git no verificable".into());}
    let ids = git(
        root,
        &["rev-list", "--objects", "--no-object-names", tip],
        None,
        None,
    )?;
    let small = metadata(&git(root, &["cat-file", "--batch-check"], Some(ids), None)?)?;
    if small.is_empty() {
        return Ok(());
    }
    let input = small
        .iter()
        .map(|(id, _)| format!("{id}\n"))
        .collect::<String>()
        .into_bytes();
    let data = git(root, &["cat-file", "--batch"], Some(input), None)?;
    let mut offset = 0;
    for (id, size) in small {
        let newline = data[offset..]
            .iter()
            .position(|b| *b == b'\n')
            .ok_or("Lectura histórica incompleta")?
            + offset;
        let expected = format!("{id} blob {size}");
        if data.get(offset..newline) != Some(expected.as_bytes()) {
            return Err("La identidad de un objeto histórico cambió".into());
        }
        offset = newline + 1;
        let end = offset
            .checked_add(size as usize)
            .ok_or("Objeto histórico fuera de presupuesto")?;
        let content = data
            .get(offset..end)
            .ok_or("Contenido histórico incompleto")?;
        if content.starts_with(b"version https://git-lfs.github.com/spec/v1\n")
            || content.starts_with(b"version https://git-lfs.github.com/spec/v1\r\n")
        {
            return Err("El historial contiene punteros Git LFS. Su transferencia no está validada; conserva el origen y sus objetos LFS.".into());
        }
        if data.get(end) != Some(&b'\n') {
            return Err("Lectura histórica incompleta".into());
        }
        offset = end + 1;
    }
    if offset != data.len() {
        return Err("La lectura histórica no coincide con su inventario".into());
    }
    Ok(())
}

fn push_reviewed(root:&Path,url:&str,branch:&str,desired:&str,token:&str)->Result<String,String>{
    history_policy_at(root,desired)?;
    let push=git(root,&["push",url,&format!("{desired}:refs/heads/{branch}")],None,Some(token));
    let after=remote_head(root,url,branch,token)?;
    if after.as_deref()!=Some(desired){
        return Err(push.err().unwrap_or_else(||"GitHub no confirmó la versión preparada; consulta el intento antes de continuar".into()));
    }
    Ok(desired.to_owned())
}

fn commit_reviewed_paths(root: &Path, paths: &BTreeSet<String>) -> Result<(), String> {
    let pathspec = paths
        .iter()
        .flat_map(|p| p.as_bytes().iter().copied().chain(std::iter::once(0)))
        .collect::<Vec<_>>();
    if !paths.is_empty() {
        git(
            root,
            &["add", "--pathspec-from-file=-", "--pathspec-file-nul"],
            Some(pathspec.clone()),
            None,
        )?;
    }
    let changed = git(root, &["diff", "--cached", "--name-only", "-z"], None, None)?;
    let reviewed_changed = changed
        .split(|b| *b == 0)
        .filter_map(|p| std::str::from_utf8(p).ok())
        .any(|p| paths.contains(p));
    if reviewed_changed {
        // Only the reviewed paths enter this commit. Unrelated staged changes
        // remain staged, and pathspecs never become command-line options.
        git(
            root,
            &[
                "-c",
                "user.name=KnowNext.ai",
                "-c",
                "user.email=knownext.local@knownext.ai",
                "commit",
                "--only",
                "--pathspec-from-file=-",
                "--pathspec-file-nul",
                "-m",
                "Migración revisada de documentos",
            ],
            Some(pathspec),
            None,
        )?;
    }
    Ok(())
}

impl LocalApi {
    pub(super) fn proton_github_migration_check(
        &self,
        project: &str,
        root: &Path,
        destination: bool,
        prepare: bool,
    ) -> Result<Value, String> {
        project_capabilities::require_history_runtime()?;
        mixed_application_guard::ensure(root)?;
        let registry = self.registry_checked()?;
        let row = registry["projects"]
            .as_array()
            .and_then(|r| r.iter().find(|r| r["id"] == project))
            .ok_or("Proyecto no disponible")?;
        let repository = row["githubRepository"].clone();
        let (owner, repo, branch) = github_repository_parts(&repository).ok_or(
            "Configura primero el repositorio GitHub del proyecto; no se ha cambiado Proton",
        )?;
        if !root.join(".git").exists() {
            return Err("Activa y revisa el historial Git local antes de cambiar a GitHub".into());
        }
        let expected = format!("https://github.com/{owner}/{repo}").to_ascii_lowercase();
        let remote =
            git_remote_url(root, "origin")?.ok_or("No hay un repositorio remoto configurado")?;
        if remote
            .trim_end_matches('/')
            .trim_end_matches(".git")
            .to_ascii_lowercase()
            != expected
        {
            return Err("El destino Git no coincide con el GitHub configurado; revisa la conexión sin cambiar el origen".into());
        }
        let branch = branch
            .or_else(|| current_git_branch(root))
            .ok_or("La referencia de GitHub no está configurada")?;
        git(
            root,
            &["check-ref-format", &format!("refs/heads/{branch}")],
            None,
            None,
        )?;
        let token = self.github_access_token().ok_or(
            "Conecta tu cuenta GitHub antes de migrar; Proton y los documentos se conservan",
        )?;
        // Address the reviewed URL directly: origin.pushurl and mirror settings
        // must not send the migration to a different destination.
        let reviewed_url = format!("{expected}.git");
        let before = remote_head(root, &reviewed_url, &branch, &token)?;
        if before.is_some() {
            git(
                root,
                &[
                    "fetch",
                    "--no-tags",
                    &reviewed_url,
                    &format!("refs/heads/{branch}"),
                ],
                None,
                Some(&token),
            )?;
            let fetched = text(root, &["rev-parse", "--verify", "FETCH_HEAD"], None)?;
            if before.as_deref() != Some(fetched.as_str()) {
                return Err("GitHub cambió durante la revisión; consulta y revisa otra vez".into());
            }
            let local = head(root)?.ok_or("El historial local no contiene la base remota")?;
            git(root,&["merge-base","--is-ancestor",&fetched,&local],None,None).map_err(|_|"Hay cambios ajenos o historias distintas en GitHub; concilia el origen antes de migrar".to_owned())?;
        }
        let current =
            knownext_sync_folder::capture(root, "github-migration", "preflight", "local", None)
                .map_err(|_| "No se pudo inventariar el contenido local de la migración")?;
        if current.contents.values().any(|data| {
            data.starts_with(b"version https://git-lfs.github.com/spec/v1\n")
                || data.starts_with(b"version https://git-lfs.github.com/spec/v1\r\n")
        }) {
            return Err("Hay archivos que sólo contienen un puntero Git LFS; recupera sus bytes antes de migrar".into());
        }
        // Git history stays local when moving to Proton. Its size is a remote
        // upload constraint only when the destination is ordinary GitHub Git.
        if destination {
            history_policy(root)?;
        }
        if destination && prepare {
            let _transaction = self.project_transaction(project)?;
            let snapshot =
                knownext_sync_folder::capture(root, "github-migration", "snapshot", "local", None)
                    .map_err(|_| "No se pudo revisar el contenido antes de crear su versión Git")?;
            let tracked = git(root, &["ls-files", "-z"], None, None)?;
            let mut paths = snapshot
                .manifest
                .files
                .keys()
                .cloned()
                .collect::<BTreeSet<_>>();
            for value in tracked.split(|b| *b == 0).filter(|p| !p.is_empty()) {
                let path = std::str::from_utf8(value).map_err(|_| "Una ruta Git no es portable")?;
                if path.split('/').any(|part| {
                    part.starts_with('.')
                        || matches!(
                            part.to_ascii_lowercase().as_str(),
                            "owner.lock" | "runtime-owner.lock" | "capture.lock"
                        )
                }) {
                    // Never stat or read coordination paths. Existing hidden Git
                    // configuration is retained, not newly added by migration.
                    continue;
                }
                paths.insert(path.to_owned());
            }
            // Stage only the reviewed transferable paths, including deletions;
            // hidden/private/coordination content is never added by this flow.
            commit_reviewed_paths(root, &paths)?;
            let desired = head(root)?.ok_or("No existe una versión Git para enviar")?;
            drop(_transaction);
            // Ordinary fast-forward push; a concurrent remote writer is never
            // overwritten. A lost acknowledgement is resolved by ls-remote.
            let after = push_reviewed(root,&reviewed_url,&branch,&desired,&token)?;
            return Ok(json!({"stamp":after,"head":desired,"repository":repository,"warnings":[]}));
        }
        Ok(
            json!({"stamp":before,"head":head(root)?,"repository":repository,"warnings":if destination {json!(["El historial Git se conserva localmente. No se envían directorios vacíos ni contenido privado excluido."])} else {json!([])}}),
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    fn repo() -> tempfile::TempDir {
        let temp = tempfile::tempdir().unwrap();
        git(temp.path(), &["init"], None, None).unwrap();
        temp
    }
    fn commit(root: &Path) {
        git(root, &["add", "--", "document.md"], None, None).unwrap();
        git(
            root,
            &[
                "-c",
                "user.name=QA",
                "-c",
                "user.email=qa@example.test",
                "commit",
                "-m",
                "Synthetic",
            ],
            None,
            None,
        )
        .unwrap();
    }
    #[test]
    fn migration_history_policy_reads_exact_full_objects() {
        let temp = repo();
        fs::write(temp.path().join("document.md"), b"# Synthetic\n").unwrap();
        commit(temp.path());
        assert_eq!(head(temp.path()).unwrap().unwrap().len(), 40);
        history_policy(temp.path()).unwrap();
    }
    #[test]
    fn migration_history_rejects_lfs_pointer_even_after_replacement() {
        let temp = repo();
        fs::write(
            temp.path().join("document.md"),
            b"version https://git-lfs.github.com/spec/v1\noid sha256:123\nsize 3\n",
        )
        .unwrap();
        commit(temp.path());
        fs::write(temp.path().join("document.md"), b"Hydrated now").unwrap();
        commit(temp.path());
        assert!(history_policy(temp.path()).unwrap_err().contains("LFS"));
        assert_eq!(
            fs::read(temp.path().join("document.md")).unwrap(),
            b"Hydrated now"
        );
    }
    #[test]
    fn migration_history_rejects_old_large_blob_metadata() {
        assert!(metadata(
            format!("{} blob {}\n", "a".repeat(40), GITHUB_FILE_LIMIT + 1).as_bytes()
        )
        .unwrap_err()
        .contains("100 MiB"));
    }
    #[test]
    fn migration_commit_preserves_unrelated_staged_private_content() {
        let temp = repo();
        fs::write(temp.path().join("document.md"), b"Initial").unwrap();
        commit(temp.path());
        fs::write(temp.path().join(".private"), b"Keep staged privately").unwrap();
        git(temp.path(), &["add", "--", ".private"], None, None).unwrap();
        fs::write(temp.path().join("document.md"), b"Reviewed change").unwrap();
        commit_reviewed_paths(temp.path(), &BTreeSet::from(["document.md".to_owned()])).unwrap();
        assert_eq!(
            git(temp.path(), &["show", "HEAD:document.md"], None, None).unwrap(),
            b"Reviewed change"
        );
        assert!(git(temp.path(), &["show", "HEAD:.private"], None, None).is_err());
        assert_eq!(
            text(temp.path(), &["diff", "--cached", "--name-only"], None).unwrap(),
            ".private"
        );
    }
    #[test]
    fn migration_treats_reviewed_pattern_names_literally_and_keeps_private_staged() {
        let temp = repo();
        fs::write(temp.path().join("document.md"), b"Initial").unwrap();
        commit(temp.path());
        fs::write(temp.path().join(".private"), b"Private staged bytes").unwrap();
        git(temp.path(), &["add", "--", ".private"], None, None).unwrap();
        fs::write(temp.path().join("[.]private"), b"Reviewed portable filename").unwrap();
        fs::write(temp.path().join("document.md"), b"Reviewed change").unwrap();
        let paths=BTreeSet::from(["document.md".to_owned(), "[.]private".to_owned()]);
        commit_reviewed_paths(temp.path(), &paths).unwrap();
        assert!(git(temp.path(), &["cat-file", "-e", "HEAD:.private"], None, None).is_err());
        assert_eq!(git(temp.path(), &["show", "HEAD:[.]private"], None, None).unwrap(), b"Reviewed portable filename");
        assert_eq!(text(temp.path(), &["diff", "--cached", "--name-only"], None).unwrap(), ".private");
        fs::remove_file(temp.path().join("[.]private")).unwrap();
        commit_reviewed_paths(temp.path(), &paths).unwrap();
        // `show` may succeed with empty output for a missing bracketed name;
        // object existence must be checked without its revision/path display.
        assert!(git(temp.path(), &["cat-file", "-e", "HEAD:[.]private"], None, None).is_err());
        assert!(git(temp.path(), &["cat-file", "-e", "HEAD:.private"], None, None).is_err());
        assert_eq!(text(temp.path(), &["diff", "--cached", "--name-only"], None).unwrap(), ".private");
    }
    #[test]
    fn migration_push_uses_the_reviewed_commit_even_when_head_changes(){
        let temp=repo();let remote=tempfile::tempdir().unwrap();git(remote.path(),&["init","--bare"],None,None).unwrap();
        fs::write(temp.path().join("document.md"),b"Reviewed").unwrap();commit(temp.path());
        let reviewed=head(temp.path()).unwrap().unwrap();
        fs::write(temp.path().join("document.md"),b"version https://git-lfs.github.com/spec/v1\noid sha256:later\nsize 4\n").unwrap();commit(temp.path());
        assert_ne!(head(temp.path()).unwrap().as_deref(),Some(reviewed.as_str()));
        let confirmed=push_reviewed(temp.path(),remote.path().to_str().unwrap(),"reviewed",&reviewed,"synthetic").unwrap();
        assert_eq!(confirmed,reviewed);
        assert_eq!(text(remote.path(),&["rev-parse","refs/heads/reviewed"],None).unwrap(),reviewed);
    }
}
