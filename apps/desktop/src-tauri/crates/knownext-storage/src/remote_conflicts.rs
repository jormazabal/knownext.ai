//! Review only the already known remote document. No fetch, checkout or graph mutation.
use super::*;
const MAX_TEXT: usize = 2 * 1024 * 1024;
mod renames;
mod project;
#[derive(Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct RemoteSource {
    pub(crate) local_commit: String,
    pub(crate) remote_commit: String,
    pub(crate) markdown_sha256: String,
    pub(crate) revision: String,
    pub(crate) source_path: String,
}
fn git(root: &Path, args: &[&str]) -> Result<Vec<u8>, String> {
    let output = run_local_git(local_git_command().arg("-C").arg(root).args(args))
        .map_err(|_| "No se pudo consultar el historial local")?;
    if !output.status.success() {
        return Err("La referencia remota conocida no está disponible en el historial local. Actualiza la sincronización y vuelve a revisar.".into());
    }
    Ok(output.stdout)
}
fn commit(root: &Path, reference: &str) -> Result<String, String> {
    let text = String::from_utf8(git(
        root,
        &["rev-parse", "--verify", &format!("{reference}^{{commit}}")],
    )?)
    .map_err(|_| "Identidad histórica no compatible")?;
    let hash = text.trim();
    if !version_history::is_commit_id(hash) {
        return Err("La referencia no identifica una versión completa de Git".into());
    }
    Ok(hash.into())
}
impl LocalApi {
    fn known_remote_document(&self, id: &str) -> Result<(RemoteSource, String), String> {
        let (project, relative) = document_ref(id)?;
        self.resolve_markdown_path(id)?;
        let root = self.project_root(&project)?;
        let registry = self.registry_checked()?;
        let record = registry["projects"]
            .as_array()
            .and_then(|projects| projects.iter().find(|entry| entry["id"] == project))
            .ok_or("Proyecto no registrado")?;
        let branch = github_repository_parts(&record["githubRepository"])
            .and_then(|(_, _, branch)| branch)
            .or_else(|| current_git_branch(&root))
            .ok_or("No hay una referencia remota configurada para este proyecto")?;
        if branch.len() > 512 {
            return Err("La referencia configurada supera el límite de revisión".into());
        }
        let reference = format!("refs/remotes/origin/{branch}");
        git(&root, &["check-ref-format", &reference])?;
        let origin = git_remote_url(&root, "origin")
            .map_err(|_| "No se puede consultar la conexión remota configurada")?
            .ok_or("El proyecto no tiene un origen remoto configurado")?;
        let local = commit(&root, "HEAD")?;
        let remote = commit(&root, &reference)?;
        let mut source_path = relative.clone();
        let mut tree = git(
            &root,
            &[
                "--literal-pathspecs",
                "ls-tree",
                "-z",
                &remote,
                "--",
                &relative,
            ],
        )?;
        if tree.is_empty() {
            source_path = renames::resolve(&root, &local, &remote, &relative)?;
            tree = git(
                &root,
                &[
                    "--literal-pathspecs",
                    "ls-tree",
                    "-z",
                    &remote,
                    "--",
                    &source_path,
                ],
            )?;
        }
        let records = tree
            .split(|byte| *byte == 0)
            .filter(|entry| !entry.is_empty())
            .collect::<Vec<_>>();
        if records.len() != 1 {
            return Err("La versión remota conocida no contiene un documento en esta misma ruta. Revisa sus cambios de nombre antes de combinar; las fuentes locales se conservan.".into());
        }
        let separator = records[0]
            .iter()
            .position(|byte| *byte == b'\t')
            .ok_or("Entrada remota no compatible")?;
        let metadata = &records[0][..separator];
        let path = &records[0][separator + 1..];
        if path != source_path.as_bytes() {
            return Err("La ruta remota no coincide con el documento elegido".into());
        }
        let metadata = std::str::from_utf8(metadata)
            .map_err(|_| "Referencia de objeto no compatible")?
            .split(' ')
            .collect::<Vec<_>>();
        if metadata.len() != 3
            || !matches!(metadata[0], "100644" | "100755")
            || metadata[1] != "blob"
            || !version_history::is_commit_id(metadata[2])
        {
            return Err(
                "La referencia remota no es un archivo Markdown regular; se conserva sin aplicar"
                    .into(),
            );
        }
        let blob = metadata[2];
        let size=String::from_utf8(git(&root,&["cat-file","-s",blob])?).ok().and_then(|value|value.trim().parse::<usize>().ok()).filter(|size|*size<=MAX_TEXT).ok_or("La versión remota supera 2 MiB o no tiene tamaño verificable; se conserva sin leerla")?;
        let bytes = git(&root, &["cat-file", "blob", blob])?;
        if bytes.len() != size {
            return Err("El objeto remoto no coincide con su tamaño revisado".into());
        }
        if bytes.contains(&0) {
            return Err(
                "La versión remota contiene datos binarios; se conserva sin aplicar".into(),
            );
        }
        let markdown = String::from_utf8(bytes)
            .map_err(|_| "La versión remota no contiene Markdown UTF-8 válido")?;
        if commit(&root, "HEAD")? != local || commit(&root, &reference)? != remote {
            return Err(
                "El historial cambió durante la revisión; vuelve a consultarlo antes de combinar"
                    .into(),
            );
        }
        let location = root
            .canonicalize()
            .map_err(|_| "No se puede verificar la ubicación del proyecto")?;
        let proof = json!({"projectId":project,"location":location.to_string_lossy(),"originHash":sha256_hex(origin.as_bytes()),"referenceHash":sha256_hex(reference.as_bytes()),"localCommit":local,"remoteCommit":remote,"path":relative,"sourcePath":source_path,"blob":blob});
        let revision = sha256_hex(
            &serde_json::to_vec(&proof).map_err(|_| "No se pudo revisar el origen remoto")?,
        );
        Ok((
            RemoteSource {
                local_commit: local,
                remote_commit: remote,
                markdown_sha256: sha256_hex(markdown.as_bytes()),
                revision,
                source_path,
            },
            markdown,
        ))
    }
    pub(super) fn review_remote_document(&self, id: &str) -> Result<Value, String> {
        let mut review = self.review_document_conflict(id)?;
        let (source, markdown) = self.known_remote_document(id)?;
        review["remotePathChanged"] = json!(source.source_path != document_ref(id)?.1);
        let mut value =
            serde_json::to_value(source).map_err(|_| "No se pudo preparar la revisión remota")?;
        value["markdown"] = json!(markdown);
        review["remoteSource"] = value;
        Ok(review)
    }
    pub(crate) fn checked_remote_source(
        &self,
        id: &str,
        expected: &RemoteSource,
    ) -> Result<Value, String> {
        let (actual, markdown) = self.known_remote_document(id)?;
        if actual != *expected {
            return Err("La referencia remota conocida o el historial local cambiaron. Revisa otra vez; no se ha sustituido el borrador".into());
        }
        let mut value =
            serde_json::to_value(actual).map_err(|_| "No se pudo verificar el origen remoto")?;
        value["markdown"] = json!(markdown);
        Ok(value)
    }
}
