//! One persistent transfer at a time. UI sees opaque identities and reviewed data, never file authority.
use super::*;
use std::{fs, io::Read};

const MAX_STATE: u64 = 16 * 1024 * 1024;
const MAX_WORKSPACE: u64 = recovery_quotas::TRANSFER_BYTES;
#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub(super) enum Kind {
    Export,
    Import,
}
#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub(super) enum Phase {
    AwaitingSource,
    Preparing,
    Ready,
    Delivering,
    Committing,
    PendingRegistration,
    Completed,
    Cancelled,
    Failed,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Job {
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub template_catalogue: bool,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub template_selection: Vec<template_catalogue::Selection>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub catalogue: Option<template_catalogue::Catalogue>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub catalogue_outcome: Option<template_catalogue::Attempt>,
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub include_archive: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub template_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub template_revision: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub selected_paths: Vec<String>,
    pub schema_version: u8,
    pub id: String,
    pub kind: Kind,
    pub phase: Phase,
    pub created_at: String,
    pub owner_started_at: String,
    pub project_id: Option<String>,
    pub origin_root_hash: Option<String>,
    pub manifest: Option<Manifest>,
    pub archive_sha256: Option<String>,
    pub archive_bytes: u64,
    pub source_name: Option<String>,
    pub staged_folder: Option<String>,
    pub target_project_id: Option<String>,
    pub requested_name: Option<String>,
    pub delivered_name: Option<String>,
    pub last_error: Option<String>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Begin {
    #[serde(default)]
    template_catalogue: bool,
    #[serde(default)]
    template_selection: Vec<template_catalogue::Selection>,
    #[serde(default)]
    include_archive: bool,
    kind: Kind,
    #[serde(default)]
    template_id: Option<String>,
    #[serde(default)]
    template_revision: Option<String>,
    #[serde(default)]
    project_id: Option<String>,
    #[serde(default)]
    node_ids: Vec<String>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Review {
    archive_sha256: String,
    name: String,
}

fn identifier(value: &str, prefix: &str) -> bool {
    value.starts_with(prefix)
        && value.len() <= 160
        && value
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
}
pub(super) fn regular_directory(path: &Path) -> Result<(), String> {
    let meta = fs::symlink_metadata(path)
        .map_err(|_| "No se puede comprobar una carpeta de transferencia")?;
    if !meta.is_dir() || batch::linked(&meta) {
        return Err(
            "La transferencia necesita carpetas regulares; los enlaces se conservan sin seguirlos"
                .into(),
        );
    }
    Ok(())
}
pub(super) fn root(api: &LocalApi) -> Result<PathBuf, String> {
    regular_directory(&api.app_data_dir)?;
    let root = api.app_data_dir.join("project-transfers");
    if root.exists() {
        regular_directory(&root)?;
    } else if fs::symlink_metadata(&root).is_ok() {
        return Err("La carpeta de transferencias no es regular".into());
    }
    Ok(root)
}
pub(super) fn folder(api: &LocalApi, id: &str) -> Result<PathBuf, String> {
    if !identifier(id, "transfer-") {
        return Err("Identidad de transferencia no válida".into());
    }
    let path = root(api)?.join(sha256_hex(id.as_bytes()));
    recovery_lifecycle::ensure_open(api, &path)?;
    regular_directory(&path)?;
    Ok(path)
}
pub(super) fn read(api: &LocalApi, id: &str) -> Result<Job, String> {
    let path = folder(api, id)?.join("job.json");
    let meta = fs::symlink_metadata(&path)
        .map_err(|_| "No se puede consultar el registro de transferencia")?;
    if !meta.is_file() || batch::linked(&meta) || meta.len() > MAX_STATE {
        return Err(
            "El registro de transferencia no es regular o supera 16 MiB; se conserva".into(),
        );
    }
    let mut bytes = Vec::new();
    fs::File::open(path)
        .map_err(|_| "No se puede abrir el registro de transferencia")?
        .take(MAX_STATE + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| "No se pudo leer el registro de transferencia completo")?;
    if bytes.len() as u64 > MAX_STATE {
        return Err("El registro supera 16 MiB".into());
    }
    let job: Job = serde_json::from_slice(&bytes).map_err(|_| {
        "El registro está dañado o contiene campos no compatibles; se conserva sin cambios"
    })?;
    validate(&job)?;
    if job.id != id {
        return Err("La identidad del registro de transferencia no coincide".into());
    }
    Ok(job)
}
fn validate(job: &Job) -> Result<(), String> {
    if job.schema_version != 1 || !identifier(&job.id, "transfer-") {
        return Err("Versión de transferencia no compatible; se conserva sin cambios".into());
    }
    for time in [&job.created_at, &job.owner_started_at] {
        OffsetDateTime::parse(time, &Rfc3339).map_err(|_| "Fecha de transferencia no válida")?;
    }
    if job
        .project_id
        .as_ref()
        .is_some_and(|id| !identifier(id, "project-"))
        || job
            .target_project_id
            .as_ref()
            .is_some_and(|id| !identifier(id, "project-"))
    {
        return Err("Proyecto de transferencia no válido".into());
    }
    if !job.template_catalogue
        && ((job.kind == Kind::Export && (job.project_id.is_some() == job.template_id.is_some()))
            || (job.kind == Kind::Import && job.project_id.is_some()))
    {
        return Err("Ámbito de transferencia no válido".into());
    }
    if job.template_catalogue {
        if job.project_id.is_some()
            || job.template_id.is_some()
            || job.template_revision.is_some()
            || job.include_archive
            || !job.selected_paths.is_empty()
        {
            return Err("Un catálogo agrupado no tiene proyecto ni configuración privada".into());
        }
        if job.kind == Kind::Export {
            template_catalogue::validate_selection(&job.template_selection)?;
        } else if !job.template_selection.is_empty() {
            return Err("El grupo importado se elige después de revisar el archivo".into());
        }
        if let Some(c) = &job.catalogue {
            c.validate()?;
        }
        if let Some(a) = &job.catalogue_outcome {
            template_catalogue::validate_attempt(a)?;
            if a.transfer_id != job.id || job.archive_sha256.as_deref() != Some(&a.archive_sha256) {
                return Err("El acuse no pertenece al catálogo preparado".into());
            }
        }
    } else if !job.template_selection.is_empty()
        || job.catalogue.is_some()
        || job.catalogue_outcome.is_some()
    {
        return Err("Campos de catálogo fuera de su ámbito".into());
    }
    if job.template_id.is_some() != job.template_revision.is_some()
        || job.template_id.as_deref().is_some_and(|id| {
            !id.starts_with("project-template-") || !identifier(id, "project-template-")
        })
        || job
            .template_revision
            .as_deref()
            .is_some_and(|hash| hash.len() != 64 || !hash.bytes().all(|b| b.is_ascii_hexdigit()))
    {
        return Err("Origen de plantilla no compatible".into());
    }
    if job.include_archive
        && (job.kind != Kind::Export
            || job.project_id.is_none()
            || job.template_id.is_some()
            || !job.selected_paths.is_empty())
    {
        return Err("El archivo privado requiere un proyecto completo".into());
    }
    if job.selected_paths.len() > 500
        || (!job.selected_paths.is_empty() && job.kind != Kind::Export)
    {
        return Err("Ámbito de selección no compatible".into());
    }
    for path in &job.selected_paths {
        paths::validate(path)?;
    }
    for hash in [&job.archive_sha256, &job.origin_root_hash]
        .into_iter()
        .flatten()
    {
        if hash.len() != 64
            || !hash
                .bytes()
                .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
        {
            return Err("Huella de transferencia no válida".into());
        }
    }
    if job.archive_bytes > MAX_ARCHIVE
        || job.staged_folder.as_ref().is_some_and(|s| {
            s.len() > 100
                || !(s.starts_with("snapshot-") || s.starts_with("content-"))
                || !s
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
        })
    {
        return Err("Preparación de transferencia no válida".into());
    }
    for text in [
        &job.source_name,
        &job.requested_name,
        &job.delivered_name,
        &job.last_error,
    ]
    .into_iter()
    .flatten()
    {
        if text.len() > 2000 || text.contains('\0') {
            return Err("Metadatos de transferencia no válidos".into());
        }
    }
    if let Some(manifest) = &job.manifest {
        manifest.validate()?;
    }
    if matches!(
        job.phase,
        Phase::Ready
            | Phase::Delivering
            | Phase::Committing
            | Phase::PendingRegistration
            | Phase::Completed
    ) && (job.manifest.is_none() || job.archive_sha256.is_none())
    {
        return Err("La transferencia no contiene una instantánea verificada".into());
    }
    Ok(())
}
pub(super) fn write(api: &LocalApi, job: &Job) -> Result<(), String> {
    validate(job)?;
    read(api, &job.id)?; // Never replace damaged/future state after a long operation.
    let bytes = serde_json::to_vec_pretty(job).map_err(|e| e.to_string())?;
    if bytes.len() as u64 > MAX_STATE {
        return Err("El registro de transferencia supera 16 MiB".into());
    }
    atomic_io::write(&folder(api, &job.id)?.join("job.json"), &bytes)
        .map_err(|_| "No se pudo conservar el avance de la transferencia".to_string())
}
pub(super) fn cancelled(api: &LocalApi, id: &str) -> Result<bool, String> {
    let path = folder(api, id)?.join("cancel-requested");
    match fs::symlink_metadata(path) {
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Ok(meta) if meta.is_file() && !batch::linked(&meta) => Ok(true),
        _ => Err("No se puede verificar la cancelación solicitada".into()),
    }
}
pub(super) fn check(api: &LocalApi, id: &str) -> Result<(), String> {
    if cancelled(api, id)? {
        Err("Cancelación solicitada; el original se conserva".into())
    } else {
        Ok(())
    }
}
pub(super) fn public(api: &LocalApi, job: &Job) -> Value {
    json!({"templateCatalogue":job.template_catalogue,"catalogue":job.catalogue,"catalogueOutcome":job.catalogue_outcome,"includeArchive":job.include_archive,"id":job.id,"templateId":job.template_id,"kind":job.kind,"phase":job.phase,"createdAt":job.created_at,"projectId":job.project_id,"selectedPaths":job.selected_paths,"manifest":job.manifest,"archiveSha256":job.archive_sha256,"archiveBytes":job.archive_bytes,"sourceName":job.source_name,"targetProjectId":job.target_project_id,"requestedName":job.requested_name,"deliveredName":job.delivered_name,"error":job.last_error,"cancelRequested":cancelled(api,&job.id).unwrap_or(false),"interrupted":job.owner_started_at!=api.started_at&&matches!(job.phase,Phase::Preparing|Phase::Delivering|Phase::Committing)})
}
pub(super) fn budget(path: &Path) -> Result<(), String> {
    let mut folders = vec![path.to_path_buf()];
    let mut bytes = 0u64;
    let mut entries = 0usize;
    while let Some(folder) = folders.pop() {
        for entry in fs::read_dir(folder)
            .map_err(|_| "No se puede comprobar la preparación privada")?
            .take(2 * MAX_ENTRIES + 33)
        {
            entries += 1;
            if entries > 2 * MAX_ENTRIES + 32 {
                return Err(
                    "La preparación privada contiene demasiadas entradas; se conserva".into(),
                );
            }
            let entry = entry.map_err(|_| "No se puede comprobar una entrada privada")?;
            if matches!(
                entry
                    .file_name()
                    .to_string_lossy()
                    .to_ascii_lowercase()
                    .as_str(),
                "owner.lock" | "runtime-owner.lock" | "capture.lock"
            ) {
                continue;
            }
            let meta = fs::symlink_metadata(entry.path())
                .map_err(|_| "No se puede comprobar el tamaño preparado")?;
            if batch::linked(&meta) {
                return Err("La preparación contiene un enlace; se conserva sin seguirlo".into());
            }
            if meta.is_dir() {
                folders.push(entry.path());
            } else if meta.is_file() {
                bytes = bytes.saturating_add(meta.len());
                if bytes > MAX_WORKSPACE {
                    return Err(
                        "La preparación privada supera 2 GiB; se conserva sin ampliarla".into(),
                    );
                }
            } else {
                return Err("La preparación contiene una entrada no regular".into());
            }
        }
    }
    Ok(())
}

impl LocalApi {
    pub(crate) fn remember_project_transfer_review(
        &self,
        id: &str,
        body: Value,
    ) -> Result<Value, String> {
        let review: Review = serde_json::from_value(body)
            .map_err(|_| "La revisión necesita la huella del paquete y el nombre provisional")?;
        let mut job = read(self, id)?;
        if job.kind != Kind::Import
            || job.phase != Phase::Ready
            || job.archive_sha256.as_deref() != Some(review.archive_sha256.as_str())
        {
            return Err("La revisión ya no corresponde a esta preparación. Consulta su estado antes de cerrar".into());
        }
        // A provisional field may be empty or incomplete. Final project naming is
        // validated only by commit; closing must not become an accidental import.
        if review.name.len() > 2000 || review.name.contains('\0') {
            return Err(
                "El nombre provisional es demasiado largo o contiene un carácter no válido".into(),
            );
        }
        job.requested_name = Some(review.name);
        write(self, &job)?;
        Ok(public(self, &job))
    }
    pub(crate) fn list_project_transfers(&self) -> Result<Value, String> {
        let root = root(self)?;
        if !root.exists() {
            return Ok(json!({"jobs":[],"warnings":[]}));
        }
        let mut jobs = Vec::new();
        let mut warnings = Vec::new();
        for entry in fs::read_dir(&root)
            .map_err(|_| "No se pueden consultar las transferencias")?
            .take(3)
        {
            let result = (|| -> Result<Job, String> {
                let entry = entry.map_err(|_| "Una transferencia no se puede consultar")?;
                regular_directory(&entry.path())?;
                let path = entry.path().join("job.json");
                let meta =
                    fs::symlink_metadata(&path).map_err(|_| "Registro de transferencia ausente")?;
                if !meta.is_file() || batch::linked(&meta) || meta.len() > MAX_STATE {
                    return Err(
                        "Registro de transferencia no regular o fuera de presupuesto".into(),
                    );
                }
                let mut bytes = Vec::new();
                fs::File::open(path)
                    .map_err(|_| "Registro no accesible")?
                    .take(MAX_STATE + 1)
                    .read_to_end(&mut bytes)
                    .map_err(|_| "Registro no legible")?;
                if bytes.len() as u64 > MAX_STATE {
                    return Err("Registro fuera de presupuesto".into());
                }
                let job: Job =
                    serde_json::from_slice(&bytes).map_err(|_| "Registro dañado o futuro")?;
                if entry.file_name().to_str() != Some(&sha256_hex(job.id.as_bytes())) {
                    return Err("La identidad no coincide con la carpeta".into());
                }
                read(self, &job.id)
            })();
            match result {
                Ok(job) => jobs.push(public(self, &job)),
                Err(error) => {
                    warnings.push(format!("{error}. La preparación se conserva sin cambios."))
                }
            }
        }
        if jobs.len() + warnings.len() > 1 {
            warnings.push("Hay más de una entrada de preparación; no se inicia otra transferencia hasta revisarlas".into());
        }
        Ok(json!({"jobs":jobs,"warnings":warnings}))
    }
    pub(crate) fn begin_project_transfer(&self, body: Value) -> Result<Value, String> {
        self.begin_project_transfer_with_id(body, None, None)
    }
    pub(super) fn begin_backup_import(
        &self,
        id: &str,
        before_create: &dyn Fn() -> Result<(), String>,
    ) -> Result<Value, String> {
        if !identifier(id, "transfer-backup-") {
            return Err("Identidad de restauración no válida".into());
        }
        self.begin_project_transfer_with_id(json!({"kind":"import"}), Some(id), Some(before_create))
    }
    fn begin_project_transfer_with_id(
        &self,
        body: Value,
        preferred_id: Option<&str>,
        before_create: Option<&dyn Fn() -> Result<(), String>>,
    ) -> Result<Value, String> {
        let input: Begin = serde_json::from_value(body)
            .map_err(|_| "La transferencia necesita tipo y, al exportar, proyecto")?;
        if input.include_archive
            && (input.kind != Kind::Export
                || input.project_id.is_none()
                || input.template_id.is_some()
                || !input.node_ids.is_empty())
        {
            return Err(
                "El archivo privado requiere un proyecto completo, sin selección ni plantilla"
                    .into(),
            );
        }
        self.registry_checked()?;
        if !input.template_catalogue
            && ((input.kind == Kind::Export
                && (input.project_id.is_some() == input.template_id.is_some()))
                || (input.kind == Kind::Import && input.project_id.is_some()))
        {
            return Err("Ámbito de transferencia no válido".into());
        }
        if input.template_catalogue {
            if input.project_id.is_some()
                || input.template_id.is_some()
                || input.template_revision.is_some()
                || input.include_archive
                || !input.node_ids.is_empty()
            {
                return Err("Un catálogo agrupado no importa proyectos ni datos privados".into());
            }
            if input.kind == Kind::Export {
                template_catalogue::validate_selection(&input.template_selection)?;
                for e in &input.template_selection {
                    catalog::selected(self, &e.id, &e.revision)?;
                }
            } else if !input.template_selection.is_empty() {
                return Err("Elige las entradas después de revisar el archivo".into());
            }
        } else if !input.template_selection.is_empty() {
            return Err("La selección agrupada requiere su tipo de catálogo".into());
        }
        let template = if let Some(id) = &input.template_id {
            Some(catalog::selected(
                self,
                id,
                input
                    .template_revision
                    .as_deref()
                    .ok_or("Falta la revisión de la plantilla")?,
            )?)
        } else {
            if input.template_revision.is_some() {
                return Err("Falta la identidad de la plantilla".into());
            }
            None
        };
        let mut origin = None;
        if input.node_ids.len() > 500
            || (!input.node_ids.is_empty()
                && (input.kind != Kind::Export || input.project_id.is_none()))
        {
            return Err("Selecciona hasta500 elementos de un proyecto para exportar".into());
        }
        let mut selected_paths = vec![];
        if let Some(id) = &input.project_id {
            for node in &input.node_ids {
                let relative = self.project_node_relative(id, node)?;
                paths::validate(&relative)?;
                self.resolve_project_relative(id, &relative)?;
                selected_paths.push(relative);
            }
            selected_paths.sort();
            selected_paths.dedup();
            selected_paths = selected_paths
                .iter()
                .filter(|path| {
                    !selected_paths
                        .iter()
                        .any(|parent| path != &parent && path.starts_with(&format!("{parent}/")))
                })
                .cloned()
                .collect();
            if !self
                .list_projects()
                .iter()
                .any(|p| p["id"].as_str() == Some(id))
            {
                return Err("El proyecto no está disponible".into());
            }
            let source = self
                .project_root(id)?
                .canonicalize()
                .map_err(|_| "La raíz del proyecto no está disponible")?;
            let private = self
                .app_data_dir
                .canonicalize()
                .map_err(|_| "No se puede comprobar la raíz privada")?;
            if private.starts_with(&source)
                || (source.starts_with(&private) && !source.starts_with(private.join("projects")))
            {
                return Err("La raíz privada de la aplicación no se exporta como proyecto".into());
            }
            origin = Some(sha256_hex(source.to_string_lossy().as_bytes()));
        }
        let _admission = crate::recovery_inventory::admit(self, MAX_WORKSPACE)?;
        let root = root(self)?;
        fs::create_dir_all(&root).map_err(|_| "No se puede crear la preparación privada")?;
        if fs::read_dir(&root)
            .map_err(|_| "No se puede revisar la preparación anterior")?
            .next()
            .is_some()
        {
            return Err(
                "Ya hay una transferencia pendiente. Continúa o descártala antes de iniciar otra"
                    .into(),
            );
        }
        let id = preferred_id
            .map(str::to_owned)
            .unwrap_or_else(|| knownext_core::compact_id("transfer"));
        let folder = root.join(sha256_hex(id.as_bytes()));
        recovery_lifecycle::ensure_open(self, &folder)?;
        if let Some(before) = before_create {
            before()?;
        }
        fs::create_dir(&folder).map_err(|_| "No se puede reservar una preparación exclusiva")?;
        let job = Job {
            template_catalogue: input.template_catalogue,
            template_selection: input.template_selection,
            catalogue: None,
            catalogue_outcome: None,
            include_archive: input.include_archive,
            template_id: input.template_id,
            template_revision: input.template_revision,
            selected_paths,
            schema_version: 1,
            id,
            kind: input.kind,
            phase: if input.kind == Kind::Import && template.is_none() {
                Phase::AwaitingSource
            } else {
                Phase::Preparing
            },
            created_at: knownext_core::now_iso(),
            owner_started_at: self.started_at.clone(),
            project_id: input.project_id,
            origin_root_hash: origin,
            manifest: None,
            archive_sha256: None,
            archive_bytes: 0,
            source_name: template
                .as_ref()
                .and_then(|entry| entry["name"].as_str())
                .map(|name| format!("Plantilla: {name}")),
            staged_folder: None,
            target_project_id: None,
            requested_name: template
                .as_ref()
                .and_then(|entry| entry["name"].as_str())
                .map(str::to_owned),
            delivered_name: None,
            last_error: None,
        };
        validate(&job)?;
        atomic_io::create(
            &folder.join("job.json"),
            &serde_json::to_vec_pretty(&job).map_err(|e| e.to_string())?,
        )
        .map_err(|_| "No se pudo conservar el inicio de la transferencia")?;
        Ok(public(self, &job))
    }
    pub(crate) fn cancel_project_transfer(&self, id: &str) -> Result<Value, String> {
        let job = read(self, id)?;
        let accepted = matches!(
            job.phase,
            Phase::AwaitingSource | Phase::Preparing | Phase::Ready | Phase::Failed
        );
        if accepted {
            let marker = folder(self, id)?.join("cancel-requested");
            if !cancelled(self, id)? {
                atomic_io::create(&marker, b"")
                    .map_err(|_| "No se pudo solicitar la cancelación")?;
            }
        }
        Ok(
            json!({"id":id,"requested":accepted,"phase":read(self,id)?.phase,"completedAt":knownext_core::now_iso()}),
        )
    }
    pub fn discard_project_transfer(&self, id: &str) -> Result<Value, String> {
        let job = read(self, id)?;
        if job.template_catalogue && job.catalogue_outcome.is_some() {
            template_catalogue::close_preparation(self, &job)?;
        }
        if job.phase == Phase::PendingRegistration
            || (job.phase == Phase::Committing
                && (!job.template_catalogue || job.catalogue_outcome.is_none()))
        {
            return Err("La carpeta ya copiada necesita resolver su registro; no se elimina silenciosamente".into());
        }
        if matches!(job.phase, Phase::Delivering | Phase::Preparing)
            && job.owner_started_at == self.started_at
        {
            return Err(
                "El selector de destino debe terminar antes de descartar la preparación".into(),
            );
        }
        let path = folder(self, id)?;
        let root = root(self)?
            .canonicalize()
            .map_err(|_| "No se puede comprobar la carpeta de transferencias")?;
        let actual = path
            .canonicalize()
            .map_err(|_| "La preparación no está disponible")?;
        if actual.parent() != Some(root.as_path()) {
            return Err("La preparación no está dentro de su espacio privado".into());
        }
        let registry = self.registry_checked()?;
        for project in registry["projects"].as_array().into_iter().flatten() {
            if let Some(project) = project["folderPath"]
                .as_str()
                .and_then(|s| Path::new(s).canonicalize().ok())
            {
                if project.starts_with(&actual) || actual.starts_with(project) {
                    return Err(
                        "La preparación se usa como carpeta de proyecto y no se elimina".into(),
                    );
                }
            }
        }
        budget(&actual)?;
        fs::remove_dir_all(&actual).map_err(|_| {
            "No se pudo retirar toda la preparación privada; no se anuncia como descartada"
        })?;
        Ok(json!({"id":id,"discarded":true,"completedAt":knownext_core::now_iso()}))
    }
}

impl LocalApi {
    pub(crate) fn lifecycle_transfer_record(&self, raw: &[u8]) -> bool {
        serde_json::from_slice::<Job>(raw).is_ok_and(|job| validate(&job).is_ok())
    }
}
