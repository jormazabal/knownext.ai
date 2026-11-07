//! Long work owns a separate queue. Only registry publication takes mutation authority.
use super::{jobs::*, *};
use std::{
    fs,
    io::{Read, Write},
    sync::Mutex,
};

fn route(path: &str) -> Option<(String, String)> {
    let parts: Vec<_> = path.trim_matches('/').split('/').collect();
    match parts.as_slice() {
        ["api", "project-transfers", id, action @ ("prepare" | "commit" | "discard" | "save-template" | "catalogue-review"
        | "catalogue-commit")] => Some((knownext_core::percent_decode(id), (*action).into())),
        _ => None,
    }
}
pub fn is_project_transfer_work(method: &str, path: &str) -> bool {
    method.eq_ignore_ascii_case("POST") && route(path).is_some()
}
pub fn dispatch_project_transfer(
    api: &Mutex<LocalApi>,
    worker: &LocalApi,
    queue: &Mutex<()>,
    path: &str,
    body: Value,
) -> Result<LocalApiResponse, String> {
    let (id, action) = route(path).ok_or("Operación de transferencia no válida")?;
    let _work = queue
        .lock()
        .map_err(|_| "No se puede reservar la transferencia")?;
    let value = match action.as_str() {
        "prepare" => worker.prepare_project_transfer(&id)?,
        "save-template" => worker.save_project_template(&id, body)?,
        "catalogue-review" => worker.review_project_template_catalogue(&id, body)?,
        "catalogue-commit" => worker.commit_project_template_catalogue(&id, body)?,
        "discard" => worker.discard_project_transfer(&id)?,
        "commit" => {
            worker.place_project_transfer_authorized(&id, &body, Some(api))?;
            api.lock()
                .map_err(|_| "El proyecto está copiado; falta confirmar su registro")?
                .register_project_transfer(&id)?
        }
        _ => unreachable!(),
    };
    ok(value)
}

pub(super) fn file_hash(
    path: &Path,
    check: &dyn Fn() -> Result<(), String>,
) -> Result<(u64, String), String> {
    let meta = fs::symlink_metadata(path).map_err(|_| "El paquete no está disponible")?;
    if !meta.is_file() || batch::linked(&meta) || meta.len() > MAX_ARCHIVE {
        return Err("El paquete no es regular o supera 512 MiB".into());
    }
    let mut file = fs::File::open(path)
        .map_err(|_| "No se puede leer el paquete")?
        .take(MAX_ARCHIVE + 1);
    let mut hash = Sha256::new();
    let mut bytes = 0u64;
    let mut buffer = [0; 65536];
    loop {
        check()?;
        let n = file
            .read(&mut buffer)
            .map_err(|_| "No se pudo leer el paquete completo")?;
        if n == 0 {
            break;
        }
        bytes += n as u64;
        if bytes > MAX_ARCHIVE {
            return Err("El paquete supera 512 MiB".into());
        }
        hash.update(&buffer[..n]);
    }
    Ok((bytes, format!("{:x}", hash.finalize())))
}
fn root_hash(api: &LocalApi, job: &Job) -> Result<PathBuf, String> {
    let root = api
        .project_root(
            job.project_id
                .as_deref()
                .ok_or("Falta el proyecto de origen")?,
        )?
        .canonicalize()
        .map_err(|_| "El proyecto de origen no está disponible")?;
    if job.origin_root_hash.as_deref() != Some(&sha256_hex(root.to_string_lossy().as_bytes())) {
        return Err("El proyecto ha cambiado de carpeta; inicia otra exportación".into());
    }
    Ok(root)
}
fn finish_error(api: &LocalApi, job: &mut Job, error: String) -> Result<Value, String> {
    job.phase = if cancelled(api, &job.id)? {
        Phase::Cancelled
    } else {
        Phase::Failed
    };
    job.last_error = Some(error);
    write(api, job)?;
    Ok(public(api, job))
}
fn stage_path(api: &LocalApi, job: &Job) -> Result<PathBuf, String> {
    let path = folder(api, &job.id)?.join(
        job.staged_folder
            .as_deref()
            .ok_or("Falta la carpeta preparada")?,
    );
    regular_directory(&path)?;
    Ok(path)
}
fn target_parent(api: &LocalApi, job: &Job) -> Result<PathBuf, String> {
    let projects = api.app_data_dir.join("projects");
    if !projects.exists() {
        fs::create_dir(&projects).map_err(|_| "No se puede preparar el destino local")?;
    }
    regular_directory(&projects)?;
    Ok(projects.join(
        job.target_project_id
            .as_deref()
            .ok_or("Falta la identidad del proyecto nuevo")?,
    ))
}
fn owner(parent: &Path, id: &str) -> Result<(), String> {
    regular_directory(parent)?;
    let marker = parent.join(".knownext-import-owner");
    let meta = fs::symlink_metadata(&marker)
        .map_err(|_| "La carpeta reservada no acredita esta importación; se conserva")?;
    if !meta.is_file()
        || batch::linked(&meta)
        || meta.len() != id.len() as u64
        || fs::read(marker).map_err(|_| "No se puede comprobar la reserva")? != id.as_bytes()
    {
        return Err("La carpeta reservada pertenece a otra operación; se conserva".into());
    }
    Ok(())
}

impl LocalApi {
    /// Called only under the transfer queue, outside the global mutation lock.
    pub fn prepare_project_transfer(&self, id: &str) -> Result<Value, String> {
        let mut job = read(self, id)?;
        if job.phase == Phase::Ready {
            return Ok(public(self, &job));
        }
        if job.phase != Phase::Preparing {
            return Err("Esta transferencia no espera una preparación; revisa su estado".into());
        }
        // Interrupted preparation is discarded explicitly, never overlaid with a second snapshot.
        if job.owner_started_at != self.started_at {
            return Err("La preparación se interrumpió. Descártala y vuelve a iniciarla".into());
        }
        let result = (|| -> Result<(), String> {
            check(self, id)?;
            let directory = folder(self, id)?;
            budget(&directory)?;
            let payload = directory.join("payload.zip");
            if job.template_id.is_some() {
                catalog::copy_payload(self, &job, &payload)?;
            }
            let (manifest, stage) = if job.template_catalogue && job.kind == Kind::Export {
                let (manifest, catalogue) =
                    template_catalogue::prepare_export(self, &job, &directory)?;
                job.catalogue = Some(catalogue);
                (manifest, None)
            } else {
                match job.kind {
                    Kind::Export if job.template_id.is_some() => {
                        (archive::inspect(&payload)?, None)
                    }
                    Kind::Export => {
                        let root = root_hash(self, &job)?;
                        let name = self
                            .list_projects()
                            .into_iter()
                            .find(|p| p["id"].as_str() == job.project_id.as_deref())
                            .and_then(|p| p["name"].as_str().map(str::to_owned))
                            .ok_or("El proyecto no está disponible")?;
                        let mut snapshot = if job.include_archive {
                            snapshot::prepare_private(&root, &directory, &name, &|| {
                                check(self, id)
                            })?
                        } else if job.selected_paths.is_empty() {
                            snapshot::prepare(&root, &directory, &name, &|| check(self, id))?
                        } else {
                            snapshot::prepare_selected(
                                &root,
                                &directory,
                                &name,
                                &job.selected_paths,
                                &|| check(self, id),
                            )?
                        };
                        check(self, id)?;
                        if job.include_archive {
                            supplement::append(
                                self,
                                job.project_id.as_deref().ok_or("Falta el proyecto")?,
                                &root,
                                &directory,
                                &mut snapshot,
                                &|| check(self, id),
                            )?;
                        }
                        archive::write(snapshot.directory.path(), &snapshot.manifest, &payload)?;
                        (snapshot.manifest, None)
                    }
                    Kind::Import => {
                        let (manifest, stage) = archive::extract(&payload, &directory)?;
                        if job.template_catalogue {
                            job.catalogue =
                                Some(template_catalogue::inspect_stage(stage.path(), &manifest)?);
                        } else if template_catalogue::is_carrier(&manifest) {
                            return Err("Este archivo es un catálogo agrupado. Impórtalo desde Plantillas de proyecto, sin crear un proyecto".into());
                        }
                        (manifest, Some(stage))
                    }
                }
            };
            check(self, id)?;
            let (bytes, hash) = file_hash(&payload, &|| check(self, id))?;
            job.staged_folder = if let Some(stage) = &stage {
                Some(
                    stage
                        .path()
                        .file_name()
                        .and_then(|s| s.to_str())
                        .ok_or("Preparación no válida")?
                        .into(),
                )
            } else {
                None
            };
            job.manifest = Some(manifest);
            job.archive_bytes = bytes;
            job.archive_sha256 = Some(hash);
            job.phase = Phase::Ready;
            job.last_error = None;
            write(self, &job)?;
            if let Some(stage) = stage {
                let _ = stage.keep();
            }
            budget(&directory)?;
            Ok(())
        })();
        match result {
            Ok(()) => Ok(public(self, &job)),
            Err(e) => finish_error(self, &mut job, e),
        }
    }
    /// Native transport receives this opaque job's reserved file, never a frontend-supplied path.
    pub fn reserve_project_transfer_source(&self, id: &str) -> Result<PathBuf, String> {
        let mut job = read(self, id)?;
        if job.kind != Kind::Import || job.phase != Phase::AwaitingSource {
            return Err("Esta transferencia no espera un archivo de origen".into());
        }
        check(self, id)?;
        let path = folder(self, id)?.join("payload.zip");
        fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&path)
            .map_err(|_| "Ya existe una preparación de origen; revísala antes de repetir")?;
        job.phase = Phase::Preparing;
        write(self, &job)?;
        Ok(path)
    }
    pub fn record_project_transfer_source(
        &self,
        id: &str,
        name: Option<&str>,
    ) -> Result<Value, String> {
        let mut job = read(self, id)?;
        if job.kind != Kind::Import || job.phase != Phase::Preparing {
            return Err("El origen ya no corresponde a esta preparación".into());
        }
        job.source_name = name.map(|s| s.chars().filter(|c| !c.is_control()).take(200).collect());
        write(self, &job)?;
        self.prepare_project_transfer(id)
    }
    pub fn fail_project_transfer_source(
        &self,
        id: &str,
        error: Option<String>,
    ) -> Result<Value, String> {
        let mut job = read(self, id)?;
        if job.phase != Phase::Preparing {
            return Err("La selección de origen ya terminó".into());
        }
        if let Some(error) = error {
            finish_error(self, &mut job, error)
        } else {
            job.phase = Phase::Cancelled;
            job.last_error = None;
            write(self, &job)?;
            Ok(public(self, &job))
        }
    }
    pub fn copy_project_transfer_source(&self, id: &str, source: &Path) -> Result<(), String> {
        let job = read(self, id)?;
        if job.kind != Kind::Import || job.phase != Phase::Preparing {
            return Err("La preparación no espera un paquete".into());
        }
        let meta =
            fs::symlink_metadata(source).map_err(|_| "El archivo de origen no está disponible")?;
        if !meta.is_file() || batch::linked(&meta) || meta.len() > MAX_ARCHIVE {
            return Err("Selecciona un archivo regular de hasta 512 MiB".into());
        }
        let path = folder(self, id)?.join("payload.zip");
        let reserved = fs::symlink_metadata(&path).map_err(|_| "Falta la reserva del paquete")?;
        if !reserved.is_file() || batch::linked(&reserved) || reserved.len() != 0 {
            return Err("La reserva del paquete ya contiene datos; no se reemplaza".into());
        }
        let mut input = fs::File::open(source)
            .map_err(|_| "No se puede abrir el archivo elegido")?
            .take(MAX_ARCHIVE + 1);
        let mut output = fs::OpenOptions::new()
            .write(true)
            .open(path)
            .map_err(|_| "No se puede escribir la reserva privada")?;
        let mut bytes = 0u64;
        let mut buffer = [0; 65536];
        loop {
            check(self, id)?;
            let n = input
                .read(&mut buffer)
                .map_err(|_| "No se pudo leer el archivo de origen completo")?;
            if n == 0 {
                break;
            }
            bytes += n as u64;
            if bytes > MAX_ARCHIVE {
                return Err("El paquete supera 512 MiB".into());
            }
            output
                .write_all(&buffer[..n])
                .map_err(|_| "No se pudo conservar el paquete completo")?;
        }
        output
            .sync_all()
            .map_err(|_| "No se pudo confirmar la copia privada".into())
    }
    #[cfg(test)]
    fn place_project_transfer(&self, id: &str, body: &Value) -> Result<(), String> {
        self.place_project_transfer_authorized(id, body, None)
    }
    fn place_project_transfer_authorized(
        &self,
        id: &str,
        body: &Value,
        authority: Option<&Mutex<LocalApi>>,
    ) -> Result<(), String> {
        let mut job = read(self, id)?;
        if job.template_catalogue {
            return Err(
                "El catálogo agrupado solo se incorpora a Plantillas; no crea proyectos".into(),
            );
        }
        if job.kind != Kind::Import {
            return Err("Esta transferencia no importa un proyecto".into());
        }
        if body["archiveSha256"].as_str() != job.archive_sha256.as_deref() {
            return Err("La confirmación no corresponde al paquete revisado".into());
        }
        if job.phase == Phase::Completed {
            return Ok(());
        }
        if job.phase == Phase::PendingRegistration {
            let name = body["name"].as_str().unwrap_or("").trim();
            validate_name(name)?;
            self.available_transfer_name(name, job.target_project_id.as_deref())?;
            job.requested_name = Some(name.into());
            write(self, &job)?;
            return Ok(());
        }
        if !matches!(job.phase, Phase::Ready | Phase::Committing) {
            return Err("El paquete aún no está listo para importarse".into());
        }
        if job.phase == Phase::Ready {
            check(self, id)?;
            let name = body["name"].as_str().unwrap_or("").trim();
            validate_name(name)?;
            self.available_transfer_name(name, None)?;
            let payload = folder(self, id)?.join("payload.zip");
            if file_hash(&payload, &|| check(self, id))?.1
                != job
                    .archive_sha256
                    .clone()
                    .ok_or("Falta la huella revisada")?
            {
                return Err("El paquete cambió después de revisarlo".into());
            }
            verify_stage(
                &stage_path(self, &job)?,
                job.manifest.as_ref().ok_or("Falta el inventario")?,
            )?;
            job.target_project_id = Some(knownext_core::compact_id("project"));
            job.requested_name = Some(name.into());
            transition(self, &mut job, Phase::Committing, authority)?;
        }
        let parent = target_parent(self, &job)?;
        if !parent.exists() {
            // Publish the ownership receipt together with the reservation. A crash between
            // create_dir and marker creation leaves only an exclusively owned private folder.
            let reservation = folder(self, id)?.join(
                job.target_project_id
                    .as_deref()
                    .ok_or("Falta la identidad reservada")?,
            );
            if !reservation.exists() {
                fs::create_dir(&reservation)
                    .map_err(|_| "No se pudo reservar el proyecto nuevo")?;
            }
            regular_directory(&reservation)?;
            if fs::read_dir(&reservation)
                .map_err(|_| "No se puede comprobar la reserva privada")?
                .next()
                .is_none()
            {
                atomic_io::create(&reservation.join(".knownext-import-owner"), id.as_bytes())
                    .map_err(|_| "No se pudo confirmar la reserva del proyecto")?;
            }
            owner(&reservation, id)?;
            atomic_io::rename_no_replace(&reservation, &parent)
                .map_err(|_| "No se pudo publicar la reserva del proyecto nuevo")?;
        }
        owner(&parent, id)?;
        let target = parent.join("content");
        let stage = folder(self, id)?.join(
            job.staged_folder
                .as_deref()
                .ok_or("Falta el contenido preparado")?,
        );
        match (
            fs::symlink_metadata(&stage).is_ok(),
            fs::symlink_metadata(&target).is_ok(),
        ) {
            (true, false) => {
                regular_directory(&stage)?;
                atomic_io::rename_no_replace(&stage, &target).map_err(|_| {
                    "El proyecto sigue preparado; no se pudo completar su traslado local"
                })?;
            }
            (false, true) => regular_directory(&target)?,
            _ => {
                return Err(
                    "El estado del traslado necesita revisión; ambas ubicaciones se conservan"
                        .into(),
                )
            }
        }
        job.phase = Phase::PendingRegistration;
        job.last_error = None;
        write(self, &job)
    }
    fn available_transfer_name(&self, name: &str, own: Option<&str>) -> Result<(), String> {
        let registry = self.registry_checked()?;
        if registry["projects"]
            .as_array()
            .into_iter()
            .flatten()
            .any(|p| {
                p["id"].as_str() != own
                    && p["name"]
                        .as_str()
                        .is_some_and(|n| paths::key(n.trim()) == paths::key(name))
            })
        {
            return Err(
                "Ya existe un proyecto con ese nombre. Elige otro nombre antes de importarlo"
                    .into(),
            );
        }
        Ok(())
    }
    fn register_project_transfer(&self, id: &str) -> Result<Value, String> {
        let mut job = read(self, id)?;
        if job.phase == Phase::Completed {
            return Ok(public(self, &job));
        }
        if !matches!(job.phase, Phase::PendingRegistration | Phase::Completed) {
            return Err("El contenido todavía no está trasladado".into());
        }
        let result = (|| -> Result<(), String> {
            let target_id = job
                .target_project_id
                .as_deref()
                .ok_or("Falta el proyecto de destino")?;
            let parent = target_parent(self, &job)?;
            owner(&parent, id)?;
            let target = parent.join("content");
            regular_directory(&target)?;
            let mut registry = self.registry_checked()?;
            let projects = registry["projects"]
                .as_array_mut()
                .ok_or("Registro de proyectos no válido")?;
            if let Some(existing) = projects
                .iter()
                .find(|p| p["id"].as_str() == Some(target_id))
            {
                if existing["folderPath"].as_str() != target.to_str() {
                    return Err(
                        "La identidad del proyecto ya apunta a otra ubicación; se conserva todo"
                            .into(),
                    );
                }
                return Ok(()); // A lost acknowledgement must never copy files over subsequent edits.
            }
            let name = job
                .requested_name
                .as_deref()
                .ok_or("Falta el nombre del proyecto")?;
            self.available_transfer_name(name, Some(target_id))?;
            projects.push(json!({"id":target_id,"name":name,"folderPath":target.to_string_lossy(),"icon":"folder","iconColor":"#F37021","storageMode":"local-files","versioningMode":"none","syncMode":"none","authRequired":false,"githubRepository":null,"isGitRepository":false,"active":false}));
            self.write_registry(&registry)
        })();
        if let Err(error) = result {
            job.phase = Phase::PendingRegistration;
            job.last_error = Some(format!(
                "El contenido está copiado. Falta registrar el proyecto: {error}"
            ));
            write(self, &job)?;
            return Ok(public(self, &job));
        }
        job.phase = Phase::Completed;
        job.last_error = None;
        write(self, &job)?;
        Ok(public(self, &job))
    }
    pub fn begin_project_transfer_delivery(
        &self,
        id: &str,
        digest: &str,
        cache: &Path,
        authority: Option<&Mutex<LocalApi>>,
    ) -> Result<StagedUserExport, String> {
        let mut job = read(self, id)?;
        if job.kind != Kind::Export
            || job.phase != Phase::Ready
            || job.archive_sha256.as_deref() != Some(digest)
        {
            return Err("La entrega no corresponde al paquete revisado y preparado".into());
        }
        check(self, id)?;
        let source = folder(self, id)?.join("payload.zip");
        if file_hash(&source, &|| check(self, id))?.1 != digest {
            return Err("El paquete cambió después de revisarlo".into());
        }
        let staged = export_execution::stage_user_export_file(
            &source,
            portable_delivery_name(
                &job.manifest
                    .as_ref()
                    .ok_or("Falta el inventario revisado")?
                    .project_name,
            ),
            cache,
        )?;
        if file_hash(&staged.path, &|| check(self, id))?.1 != digest {
            return Err("La copia de entrega no coincide con la revisión".into());
        }
        transition(self, &mut job, Phase::Delivering, authority)?;
        Ok(staged)
    }
    pub fn finish_project_transfer_delivery(
        &self,
        id: &str,
        result: Result<Value, String>,
    ) -> Result<Value, String> {
        let mut job = read(self, id)?;
        if job.kind != Kind::Export || job.phase != Phase::Delivering {
            return Err("La entrega ya no corresponde a esta transferencia".into());
        }
        match result {
            Ok(result) if result["status"].as_str() == Some("saved") => {
                job.phase = Phase::Completed;
                job.delivered_name = Some(
                    result["fileName"]
                        .as_str()
                        .unwrap_or("Proyecto KnowNext.knownext-project.zip")
                        .chars()
                        .filter(|c| !c.is_control())
                        .take(200)
                        .collect(),
                );
                job.last_error = None;
            }
            Ok(result) if result["status"].as_str() == Some("cancelled") => {
                job.phase = Phase::Ready;
                job.last_error = None;
            }
            Err(error) => {
                job.phase = Phase::Ready;
                job.last_error = Some(format!(
                    "No se pudo confirmar la entrega. Revisa el destino antes de repetir: {error}"
                ));
            }
            _ => {
                job.phase = Phase::Ready;
                job.last_error = Some(
                    "La entrega no devolvió confirmación. Revisa el destino antes de repetir"
                        .into(),
                );
            }
        }
        write(self, &job)?;
        Ok(public(self, &job))
    }
    pub fn deliver_project_transfer_file(
        &self,
        source: &Path,
        destination: &Path,
    ) -> Result<u64, String> {
        self.deliver_archive_file(source, destination, ".knownext-project.zip")
    }
    pub fn deliver_export_batch_file(
        &self,
        source: &Path,
        destination: &Path,
    ) -> Result<u64, String> {
        self.deliver_archive_file(source, destination, ".zip")
    }
    fn deliver_archive_file(
        &self,
        source: &Path,
        destination: &Path,
        suffix: &str,
    ) -> Result<u64, String> {
        if !destination.is_absolute()
            || !destination
                .file_name()
                .and_then(|s| s.to_str())
                .is_some_and(|s| s.ends_with(suffix))
        {
            return Err(format!("Elige un archivo nuevo con extensión {suffix}"));
        }
        let parent = destination
            .parent()
            .ok_or("Falta la carpeta de destino")?
            .canonicalize()
            .map_err(|_| "La carpeta de destino no está disponible")?;
        regular_directory(&parent)?;
        let private = self
            .app_data_dir
            .canonicalize()
            .map_err(|_| "No se puede comprobar el espacio privado")?;
        if parent.starts_with(private) {
            return Err(
                "El paquete debe guardarse fuera del estado privado de la aplicación".into(),
            );
        }
        let target = parent.join(
            destination
                .file_name()
                .ok_or("Falta el nombre del paquete")?,
        );
        let mut output = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&target)
            .map_err(|_| {
                "Ese destino ya existe o no se puede crear. Elige otro archivo; no se reemplaza"
            })?;
        let copied = (|| -> Result<u64, String> {
            let mut input = fs::File::open(source)
                .map_err(|_| "La entrega preparada no está disponible")?
                .take(MAX_ARCHIVE + 1);
            let count = std::io::copy(&mut input, &mut output)
                .map_err(|_| "No se pudo escribir todo el paquete")?;
            if count > MAX_ARCHIVE {
                return Err("El paquete supera 512 MiB".into());
            }
            output
                .sync_all()
                .map_err(|_| "No se pudo confirmar la escritura del paquete")?;
            Ok(count)
        })();
        drop(output);
        if copied.is_err() {
            let _ = fs::remove_file(target);
        }
        copied
    }
}
fn transition(
    api: &LocalApi,
    job: &mut Job,
    phase: Phase,
    authority: Option<&Mutex<LocalApi>>,
) -> Result<(), String> {
    // Cancel requests share this short authority. Hashing/copying finished before
    // the lock decides the one-way commit boundary; no heavy work is inside it.
    let _guard = authority
        .map(|mutex| {
            mutex
                .lock()
                .map_err(|_| "No se puede confirmar el inicio de la operación")
        })
        .transpose()?;
    let current = read(api, &job.id)?;
    if current.phase != Phase::Ready || current.archive_sha256 != job.archive_sha256 {
        return Err("La transferencia ya no corresponde a la revisión confirmada".into());
    }
    check(api, &job.id)?;
    job.phase = phase;
    job.owner_started_at = api.started_at.clone();
    write(api, job)
}
fn portable_delivery_name(name: &str) -> String {
    let mut clean = String::new();
    for ch in name.trim().chars() {
        let ch = if ch.is_control() || r#"<>:"/\|?*"#.contains(ch) {
            '-'
        } else {
            ch
        };
        if clean.len() + ch.len_utf8() > 160 {
            break;
        }
        clean.push(ch);
    }
    let clean = clean.trim_matches([' ', '.']);
    let mut filename = format!(
        "{}.knownext-project.zip",
        if clean.is_empty() { "Proyecto" } else { clean }
    );
    if paths::validate(&filename).is_err() {
        filename = format!("Proyecto-{filename}");
    }
    filename
}
fn validate_name(name: &str) -> Result<(), String> {
    if name.is_empty() {
        return Err("Escribe un nombre para el proyecto".into());
    }
    if name.len() > 240 {
        return Err("El nombre es demasiado largo. Acórtalo para continuar".into());
    }
    if name.chars().any(char::is_control) {
        return Err("El nombre contiene un carácter no permitido. Revisa el texto".into());
    }
    Ok(())
}
fn verify_stage(root: &Path, manifest: &Manifest) -> Result<(), String> {
    // Verify the private tree immediately before its one-time rename; no 512 MiB copy under registry authority.
    regular_directory(root)?;
    let expected: BTreeSet<_> = manifest
        .directories
        .iter()
        .chain(manifest.files.iter().map(|f| &f.path))
        .cloned()
        .collect();
    let mut actual = BTreeSet::new();
    let mut folders = vec![root.to_path_buf()];
    while let Some(folder) = folders.pop() {
        for entry in fs::read_dir(folder)
            .map_err(|_| "No se puede revisar el contenido preparado")?
            .take(MAX_ENTRIES + 1)
        {
            let entry = entry.map_err(|_| "No se puede revisar una entrada preparada")?;
            let meta = fs::symlink_metadata(entry.path())
                .map_err(|_| "No se puede comprobar una entrada preparada")?;
            if batch::linked(&meta) || (!meta.is_file() && !meta.is_dir()) {
                return Err("El contenido preparado contiene una entrada no regular".into());
            }
            let path = entry
                .path()
                .strip_prefix(root)
                .map_err(|_| "Una entrada sale de la preparación")?
                .to_str()
                .ok_or("Ruta preparada no compatible")?
                .replace('\\', "/");
            if !expected.contains(&path) || !actual.insert(path) || actual.len() > MAX_ENTRIES {
                return Err(
                    "Hay contenido preparado que no figura en el inventario revisado".into(),
                );
            }
            if meta.is_dir() {
                folders.push(entry.path());
            }
        }
    }
    if actual != expected {
        return Err("Falta contenido del inventario revisado".into());
    }
    for dir in &manifest.directories {
        regular_directory(&root.join(dir))?;
    }
    for file in &manifest.files {
        let path = path_policy::resolve(root, &file.path)?;
        let meta = fs::symlink_metadata(&path)
            .map_err(|_| "Un archivo preparado dejó de estar disponible")?;
        if !meta.is_file()
            || batch::linked(&meta)
            || meta.len() != file.size
            || sha256_hex(&export_execution::bounded_read(&path, MAX_FILE)?) != file.sha256
        {
            return Err("El contenido preparado cambió; no se importa sobre esa revisión".into());
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    struct Fixture {
        _dir: tempfile::TempDir,
        api: LocalApi,
        source: PathBuf,
        project: String,
    }
    fn fixture() -> Fixture {
        let dir = tempfile::tempdir().unwrap();
        let api = LocalApi::new(dir.path().join("state"), "test".into(), "test".into());
        let source = dir.path().join("source");
        let project = api
            .create_project(
                json!({"name":"Proyecto original","folderPath":source,"versioningMode":"none"}),
            )
            .unwrap()["id"]
            .as_str()
            .unwrap()
            .to_owned();
        fs::create_dir(source.join("Vacía")).unwrap();
        fs::write(source.join("Acta.md"), "# Acta\n\nResultado guardado.\n").unwrap();
        fs::write(source.join(".env"), b"not portable").unwrap();
        api.create_handwritten_note(&project, json!({"name":"Pizarra","parentId":null}))
            .unwrap();
        Fixture {
            _dir: dir,
            api,
            source,
            project,
        }
    }
    fn export(f: &Fixture) -> (String, PathBuf, Value) {
        let begin = f
            .api
            .begin_project_transfer(json!({"kind":"export","projectId":f.project}))
            .unwrap();
        let id = begin["id"].as_str().unwrap().to_owned();
        let prepared = f.api.prepare_project_transfer(&id).unwrap();
        assert_eq!(prepared["phase"], "ready");
        assert!(prepared
            .to_string()
            .find(&f.source.to_string_lossy().to_string())
            .is_none());
        let output = f._dir.path().join("Transferencia.knownext-project.zip");
        let cache = f._dir.path().join("cache");
        let staged = f
            .api
            .begin_project_transfer_delivery(
                &id,
                prepared["archiveSha256"].as_str().unwrap(),
                &cache,
                None,
            )
            .unwrap();
        let bytes = f
            .api
            .deliver_project_transfer_file(&staged.path, &output)
            .unwrap();
        let delivered=f.api.finish_project_transfer_delivery(&id,Ok(json!({"status":"saved","fileName":"Transferencia.knownext-project.zip","byteLength":bytes}))).unwrap();
        assert_eq!(delivered["phase"], "completed");
        f.api.discard_project_transfer(&id).unwrap();
        (id, output, prepared)
    }
    fn import(f: &Fixture, path: &Path) -> Value {
        let begin = f
            .api
            .begin_project_transfer(json!({"kind":"import"}))
            .unwrap();
        let id = begin["id"].as_str().unwrap();
        f.api.reserve_project_transfer_source(id).unwrap();
        f.api.copy_project_transfer_source(id, path).unwrap();
        let ready = f
            .api
            .record_project_transfer_source(id, Some("Transferencia.knownext-project.zip"))
            .unwrap();
        assert_eq!(ready["phase"], "ready");
        ready
    }
    #[test]
    fn native_file_roundtrip_requires_review_and_new_name_then_retries_without_overwriting_edits() {
        let f = fixture();
        let (_, package, exported) = export(&f);
        let ready = import(&f, &package);
        let id = ready["id"].as_str().unwrap();
        assert_eq!(ready["manifest"], exported["manifest"]);
        assert!(f
            .api
            .place_project_transfer(id, &json!({"archiveSha256":"0".repeat(64),"name":"Copia"}))
            .is_err());
        assert!(f
            .api
            .place_project_transfer(
                id,
                &json!({"archiveSha256":ready["archiveSha256"],"name":"proyecto ORIGINAL"})
            )
            .is_err());
        f.api
            .place_project_transfer(
                id,
                &json!({"archiveSha256":ready["archiveSha256"],"name":"Copia"}),
            )
            .unwrap();
        let job = read(&f.api, id).unwrap();
        let target = target_parent(&f.api, &job).unwrap().join("content");
        assert_eq!(
            fs::read(target.join("Acta.md")).unwrap(),
            fs::read(f.source.join("Acta.md")).unwrap()
        );
        assert!(target.join("Vacía").is_dir());
        assert!(!target.join(".env").exists());
        let result = f.api.register_project_transfer(id).unwrap();
        let note_id = format!(
            "{}::Pizarra.knote",
            job.target_project_id.as_deref().unwrap()
        );
        let note_bytes = fs::read(target.join("Pizarra.knote")).unwrap();
        let note = f.api.get_handwritten_note(&note_id).unwrap();
        assert_eq!(note["id"], note_id);
        assert_eq!(
            note["content"]["id"], note_id,
            "runtime identity belongs to the imported destination"
        );
        assert_eq!(
            fs::read(target.join("Pizarra.knote")).unwrap(),
            note_bytes,
            "reading must preserve the verified stored bytes"
        );
        assert_eq!(result["phase"], "completed");
        assert_ne!(result["targetProjectId"], f.project);
        fs::write(target.join("Acta.md"), b"newer edited file").unwrap();
        f.api
            .place_project_transfer(
                id,
                &json!({"archiveSha256":ready["archiveSha256"],"name":"Copia"}),
            )
            .unwrap();
        assert_eq!(
            f.api.register_project_transfer(id).unwrap()["phase"],
            "completed"
        );
        assert_eq!(
            fs::read(target.join("Acta.md")).unwrap(),
            b"newer edited file"
        );
        assert_eq!(f.api.list_projects().len(), 2);
        f.api.discard_project_transfer(id).unwrap();
        assert!(target.join("Acta.md").exists());
    }
    #[test]
    fn registry_failure_keeps_complete_folder_and_registration_retry_does_not_recopy() {
        let f = fixture();
        let (_, package, _) = export(&f);
        let ready = import(&f, &package);
        let id = ready["id"].as_str().unwrap();
        f.api
            .place_project_transfer(
                id,
                &json!({"archiveSha256":ready["archiveSha256"],"name":"Recuperado"}),
            )
            .unwrap();
        let target = target_parent(&f.api, &read(&f.api, id).unwrap())
            .unwrap()
            .join("content");
        let registry = fs::read(f.api.registry_path()).unwrap();
        fs::write(f.api.registry_path(), b"damaged JSON").unwrap();
        let pending = f.api.register_project_transfer(id).unwrap();
        assert_eq!(pending["phase"], "pending_registration");
        assert!(pending["error"].as_str().unwrap().contains("copiado"));
        assert!(f.api.discard_project_transfer(id).is_err());
        assert_eq!(fs::read(f.api.registry_path()).unwrap(), b"damaged JSON");
        fs::write(target.join("Acta.md"), b"newer after failed registry").unwrap();
        fs::write(f.api.registry_path(), registry).unwrap();
        let restarted = LocalApi::new(f.api.app_data_dir.clone(), "test".into(), "test".into());
        restarted
            .place_project_transfer(
                id,
                &json!({"archiveSha256":ready["archiveSha256"],"name":"Recuperado"}),
            )
            .unwrap();
        assert_eq!(
            restarted.register_project_transfer(id).unwrap()["phase"],
            "completed"
        );
        assert_eq!(
            fs::read(target.join("Acta.md")).unwrap(),
            b"newer after failed registry"
        );
    }
    #[test]
    fn reviewed_private_tree_tampering_or_extra_files_cannot_be_registered() {
        let f = fixture();
        let (_, package, _) = export(&f);
        let ready = import(&f, &package);
        let id = ready["id"].as_str().unwrap();
        let stage = stage_path(&f.api, &read(&f.api, id).unwrap()).unwrap();
        fs::write(stage.join("extra.md"), b"not reviewed").unwrap();
        assert!(f
            .api
            .place_project_transfer(
                id,
                &json!({"archiveSha256":ready["archiveSha256"],"name":"Copia"})
            )
            .unwrap_err()
            .contains("inventario"));
        fs::remove_file(stage.join("extra.md")).unwrap();
        fs::write(stage.join("Acta.md"), b"changed").unwrap();
        assert!(f
            .api
            .place_project_transfer(
                id,
                &json!({"archiveSha256":ready["archiveSha256"],"name":"Copia"})
            )
            .is_err());
        assert_eq!(f.api.list_projects().len(), 1);
    }
    #[test]
    fn single_pending_job_future_schema_cancellation_and_interrupted_cleanup_preserve_sources() {
        let f = fixture();
        let begin = f
            .api
            .begin_project_transfer(json!({"kind":"export","projectId":f.project}))
            .unwrap();
        let id = begin["id"].as_str().unwrap();
        assert!(f
            .api
            .begin_project_transfer(json!({"kind":"import"}))
            .is_err());
        assert!(f.api.discard_project_transfer(id).is_err());
        assert_eq!(
            f.api.cancel_project_transfer(id).unwrap()["requested"],
            true
        );
        assert_eq!(
            f.api.prepare_project_transfer(id).unwrap()["phase"],
            "cancelled"
        );
        f.api.discard_project_transfer(id).unwrap();
        let begin = f
            .api
            .begin_project_transfer(json!({"kind":"import"}))
            .unwrap();
        let id = begin["id"].as_str().unwrap();
        let path = folder(&f.api, id).unwrap().join("job.json");
        let original = fs::read(&path).unwrap();
        let mut value: Value = serde_json::from_slice(&original).unwrap();
        value["schemaVersion"] = json!(2);
        let future = serde_json::to_vec(&value).unwrap();
        fs::write(&path, &future).unwrap();
        assert!(f.api.cancel_project_transfer(id).is_err());
        assert!(f.api.discard_project_transfer(id).is_err());
        assert!(!f.api.list_project_transfers().unwrap()["warnings"]
            .as_array()
            .unwrap()
            .is_empty());
        assert_eq!(fs::read(&path).unwrap(), future);
        fs::write(&path, original).unwrap();
        f.api.discard_project_transfer(id).unwrap();
        assert!(f.source.join("Acta.md").is_file());
    }
    #[test]
    fn commit_after_rename_crash_recovers_existing_folder_without_second_copy() {
        let f = fixture();
        let (_, package, _) = export(&f);
        let ready = import(&f, &package);
        let id = ready["id"].as_str().unwrap();
        let body = json!({"archiveSha256":ready["archiveSha256"],"name":"Tras cierre"});
        f.api.place_project_transfer(id, &body).unwrap();
        let mut job = read(&f.api, id).unwrap();
        let target = target_parent(&f.api, &job).unwrap().join("content");
        job.phase = Phase::Committing;
        write(&f.api, &job).unwrap();
        fs::write(target.join("Acta.md"), b"kept after crash").unwrap();
        let restarted = LocalApi::new(f.api.app_data_dir.clone(), "test".into(), "test".into());
        restarted.place_project_transfer(id, &body).unwrap();
        assert_eq!(
            restarted.register_project_transfer(id).unwrap()["phase"],
            "completed"
        );
        assert_eq!(
            fs::read(target.join("Acta.md")).unwrap(),
            b"kept after crash"
        );
    }
    #[test]
    fn private_empty_reservation_after_crash_can_resume_without_claiming_user_folder() {
        let f = fixture();
        let (_, package, _) = export(&f);
        let ready = import(&f, &package);
        let id = ready["id"].as_str().unwrap();
        let mut job = read(&f.api, id).unwrap();
        job.phase = Phase::Committing;
        job.target_project_id = Some(knownext_core::compact_id("project"));
        job.requested_name = Some("Reserva recuperada".into());
        write(&f.api, &job).unwrap();
        let private = folder(&f.api, id)
            .unwrap()
            .join(job.target_project_id.as_deref().unwrap());
        fs::create_dir(private).unwrap();
        let body = json!({"archiveSha256":ready["archiveSha256"],"name":"Reserva recuperada"});
        f.api.place_project_transfer(id, &body).unwrap();
        assert_eq!(
            f.api.register_project_transfer(id).unwrap()["phase"],
            "completed"
        );
        let mut registry = f.api.registry_checked().unwrap();
        registry["projects"]
            .as_array_mut()
            .unwrap()
            .retain(|p| p["id"].as_str() != job.target_project_id.as_deref());
        f.api.write_registry(&registry).unwrap();
        f.api.place_project_transfer(id, &body).unwrap();
        f.api.register_project_transfer(id).unwrap();
        assert_eq!(
            f.api.list_projects().len(),
            1,
            "completed receipt must not recreate a removed project"
        );
    }
    #[test]
    fn long_worker_queue_does_not_own_mutations_or_cancel_and_snapshot_reads() {
        let f = fixture();
        let begin = f
            .api
            .begin_project_transfer(json!({"kind":"export","projectId":f.project}))
            .unwrap();
        let id = begin["id"].as_str().unwrap();
        let mutations = Mutex::new(f.api.clone());
        let work = Mutex::new(());
        let _held = work.lock().unwrap();
        assert!(LocalApi::is_independent_snapshot(
            "GET",
            "/api/project-transfers"
        ));
        assert_eq!(
            f.api.list_project_transfers().unwrap()["jobs"]
                .as_array()
                .unwrap()
                .len(),
            1
        );
        let api = mutations
            .try_lock()
            .expect("separate queue must leave save authority available");
        api.handle(
            "POST",
            &format!("/api/project-transfers/{id}/cancel"),
            json!({}),
            vec![],
        )
        .unwrap();
        fs::write(
            f.source.join("Acta.md"),
            b"saved while another operation owns transfer queue",
        )
        .unwrap();
        assert!(cancelled(&f.api, id).unwrap());
    }
    #[test]
    fn acknowledged_cancel_before_commit_boundary_prevents_both_import_and_delivery() {
        let f = fixture();
        let (_, package, _) = export(&f);
        let ready = import(&f, &package);
        let id = ready["id"].as_str().unwrap();
        let mut job = read(&f.api, id).unwrap();
        job.target_project_id = Some(knownext_core::compact_id("project"));
        job.requested_name = Some("Cancelado".into());
        let authority = Mutex::new(f.api.clone());
        let reply = authority
            .lock()
            .unwrap()
            .cancel_project_transfer(id)
            .unwrap();
        assert_eq!(reply["requested"], true);
        assert!(transition(&f.api, &mut job, Phase::Committing, Some(&authority)).is_err());
        assert_eq!(read(&f.api, id).unwrap().phase, Phase::Ready);
        assert_eq!(f.api.list_projects().len(), 1);
        assert!(transition(&f.api, &mut job, Phase::Delivering, Some(&authority)).is_err());
    }
    #[test]
    fn reviewed_name_survives_restart_including_empty_draft_without_importing() {
        let f = fixture();
        let (_, package, _) = export(&f);
        let ready = import(&f, &package);
        let id = ready["id"].as_str().unwrap();
        let before = fs::read(f.api.registry_path()).unwrap();
        assert!(f
            .api
            .remember_project_transfer_review(
                id,
                json!({"archiveSha256":"0".repeat(64),"name":"Other"})
            )
            .is_err());
        assert!(f
            .api
            .remember_project_transfer_review(
                id,
                json!({"archiveSha256":ready["archiveSha256"],"name":"Other","path":"untrusted"})
            )
            .is_err());
        for name in ["Nombre recibido", ""] {
            let ack = f
                .api
                .remember_project_transfer_review(
                    id,
                    json!({"archiveSha256":ready["archiveSha256"],"name":name}),
                )
                .unwrap();
            assert_eq!(ack["requestedName"], name);
            let restarted = LocalApi::new(f.api.app_data_dir.clone(), "test".into(), "test".into());
            let reloaded = restarted.list_project_transfers().unwrap();
            assert_eq!(reloaded["jobs"][0]["requestedName"], name);
            assert_eq!(reloaded["jobs"][0]["archiveSha256"], ready["archiveSha256"]);
            assert_eq!(fs::read(f.api.registry_path()).unwrap(), before);
        }
    }
    #[test]
    fn delivery_suggests_project_name_with_portable_bounded_filename() {
        assert_eq!(
            portable_delivery_name("Equipo Norte"),
            "Equipo Norte.knownext-project.zip"
        );
        for name in [
            "CON".to_owned(),
            " . ".into(),
            "Equipo / Norte:*".into(),
            "á".repeat(240),
        ] {
            let file = portable_delivery_name(&name);
            paths::validate(&file).unwrap();
            assert!(file.len() <= 240);
            assert!(file.ends_with(".knownext-project.zip"));
        }
    }
}
