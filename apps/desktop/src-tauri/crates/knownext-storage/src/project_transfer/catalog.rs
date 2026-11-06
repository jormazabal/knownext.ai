//! Personal project templates reuse the portable package and never carry runtime authority.
use super::*;
use std::{
    fs,
    io::{Read, Write},
};
pub(super) static CATALOG_GATE: std::sync::Mutex<()> = std::sync::Mutex::new(());
const MAX_RECORD: u64 = 64 * 1024;
const MAX_CATALOG: u64 = recovery_quotas::TEMPLATE_BYTES;
const MAX_TEMPLATES: usize = recovery_quotas::TEMPLATE_RECORDS;
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Record {
    pub(super) schema_version: u8,
    pub(super) id: String,
    pub(super) name: String,
    pub(super) description: String,
    pub(super) created_at: String,
    pub(super) archive_sha256: String,
    pub(super) source_archive_sha256: String,
    pub(super) archive_bytes: u64,
    pub(super) file_count: usize,
    pub(super) directory_count: usize,
    pub(super) retired: bool,
}
fn valid_id(id: &str) -> bool {
    id.starts_with("project-template-")
        && id.len() <= 160
        && id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-')
}
pub(super) fn directory(api: &LocalApi) -> Result<PathBuf, String> {
    jobs::regular_directory(&api.app_data_dir)?;
    let root = api.app_data_dir.join("project-templates");
    match fs::symlink_metadata(&root) {
        Ok(_) => jobs::regular_directory(&root)?,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => (),
        Err(_) => return Err("No se puede consultar el catálogo de proyectos".into()),
    };
    Ok(root)
}
pub(super) fn folder(api: &LocalApi, id: &str) -> Result<PathBuf, String> {
    if !valid_id(id) {
        return Err("Identidad de plantilla no válida".into());
    }
    let folder = directory(api)?.join(sha256_hex(id.as_bytes()));
    recovery_lifecycle::ensure_open(api, &folder)?;
    jobs::regular_directory(&folder)?;
    Ok(folder)
}
pub(super) fn name(value: &str) -> Result<(), String> {
    if value.trim().is_empty()
        || value.trim() != value
        || value.len() > 240
        || value.chars().any(char::is_control)
    {
        return Err("Indica un nombre de plantilla más corto y sin caracteres de control".into());
    }
    Ok(())
}
pub(super) fn read(api: &LocalApi, id: &str) -> Result<(Record, String), String> {
    let folder = folder(api, id)?;
    let path = folder.join("record.json");
    let meta = fs::symlink_metadata(&path).map_err(|_| "Registro de plantilla ausente")?;
    if !meta.is_file() || batch::linked(&meta) || meta.len() > MAX_RECORD {
        return Err("Registro de plantilla no regular o fuera de límite; se conserva".into());
    }
    let mut bytes = vec![];
    fs::File::open(path)
        .and_then(|file| file.take(MAX_RECORD + 1).read_to_end(&mut bytes))
        .map_err(|_| "No se puede leer la plantilla")?;
    if bytes.len() as u64 > MAX_RECORD {
        return Err("Registro de plantilla demasiado grande".into());
    }
    let record: Record = serde_json::from_slice(&bytes)
        .map_err(|_| "Plantilla dañada o de formato desconocido; se conserva")?;
    name(&record.name)?;
    if record.schema_version != 1
        || record.id != id
        || record.description.len() > 2000
        || record.description.contains('\0')
        || record.archive_bytes > MAX_ARCHIVE
        || record.source_archive_sha256.len() != 64
        || !record
            .source_archive_sha256
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
        || record.archive_sha256.len() != 64
        || !record
            .archive_sha256
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
        || record
            .file_count
            .saturating_add(record.directory_count)
            .saturating_add(1)
            > MAX_ENTRIES
    {
        return Err("Plantilla no compatible; se conserva sin cambios".into());
    }
    OffsetDateTime::parse(&record.created_at, &Rfc3339)
        .map_err(|_| "Fecha de plantilla no compatible")?;
    let archive = fs::symlink_metadata(folder.join("payload.zip"))
        .map_err(|_| "Paquete de plantilla ausente")?;
    if !archive.is_file() || batch::linked(&archive) || archive.len() != record.archive_bytes {
        return Err("El paquete de la plantilla no coincide con su registro; se conserva".into());
    }
    Ok((record, sha256_hex(&bytes)))
}
fn public(record: &Record, revision: &str) -> Value {
    let mut value = serde_json::to_value(record).unwrap();
    value["revision"] = json!(revision);
    value
}
pub(super) fn selected(api: &LocalApi, id: &str, revision: &str) -> Result<Value, String> {
    let (record, current) = read(api, id)?;
    if current != revision || record.retired {
        return Err("La plantilla cambió o está retirada; revisa el catálogo".into());
    }
    Ok(public(&record, &current))
}
pub(super) fn reviewed(
    api: &LocalApi,
    id: &str,
    revision: &str,
) -> Result<(Value, PathBuf), String> {
    let value = selected(api, id, revision)?;
    let (record, current) = read(api, id)?;
    if current != revision {
        return Err("La plantilla cambió durante la revisión".into());
    }
    let path = folder(api, id)?.join("payload.zip");
    let (bytes, hash) = worker::file_hash(&path, &|| Ok(()))?;
    if hash != record.archive_sha256 || bytes != record.archive_bytes || read(api, id)?.1 != current
    {
        return Err("El paquete cambió desde su revisión; no se utiliza".into());
    }
    Ok((value, path))
}
pub(super) fn copy(
    source: &Path,
    target: &Path,
    expected: &str,
    check: &impl Fn() -> Result<(), String>,
) -> Result<(), String> {
    let meta =
        fs::symlink_metadata(source).map_err(|_| "La fuente de plantilla no está disponible")?;
    if !meta.is_file() || batch::linked(&meta) || meta.len() > MAX_ARCHIVE {
        return Err("La fuente de plantilla no es un paquete regular".into());
    }
    let mut input =
        fs::File::open(source).map_err(|_| "No se puede abrir el paquete de plantilla")?;
    let mut output = fs::OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(target)
        .map_err(|_| "El destino de la plantilla ya existe o no se pudo crear; se conserva")?;
    let mut total = 0u64;
    let mut buffer = [0u8; 65536];
    loop {
        check()?;
        let n = input
            .read(&mut buffer)
            .map_err(|_| "No se pudo leer el paquete completo")?;
        if n == 0 {
            break;
        }
        total += n as u64;
        if total > MAX_ARCHIVE {
            return Err(
                "El paquete supera 512 MiB; la copia parcial se conserva para revisión".into(),
            );
        }
        output
            .write_all(&buffer[..n])
            .map_err(|_| "No se pudo conservar la copia de plantilla")?;
    }
    output
        .sync_all()
        .map_err(|_| "No se confirmó la copia de plantilla")?;
    if worker::file_hash(target, check)?.1 != expected {
        return Err("La copia no coincide con el paquete revisado; necesita revisión".into());
    }
    Ok(())
}
pub(super) fn copy_payload(api: &LocalApi, job: &jobs::Job, target: &Path) -> Result<(), String> {
    let id = job.template_id.as_deref().ok_or("Falta la plantilla")?;
    let revision = job
        .template_revision
        .as_deref()
        .ok_or("Falta la revisión de plantilla")?;
    let (record, source) = reviewed(api, id, revision)?;
    copy(
        &source,
        target,
        record["archiveSha256"].as_str().unwrap(),
        &|| jobs::check(api, &job.id),
    )?;
    reviewed(api, id, revision)?;
    Ok(())
}
impl LocalApi {
    pub(crate) fn list_project_templates(&self) -> Result<Value, String> {
        let root = directory(self)?;
        let mut templates = vec![];
        let mut warnings = vec![];
        let mut bytes = 0u64;
        let mut scanned = 0;
        if !root.exists() {
            return Ok(
                json!({"templates":[],"warnings":[],"complete":true,"maximumEntries":MAX_TEMPLATES,"maximumBytes":MAX_CATALOG,"storedBytes":0}),
            );
        }
        for entry in fs::read_dir(root)
            .map_err(|_| "No se puede consultar el catálogo")?
            .take(MAX_TEMPLATES + 1)
        {
            scanned += 1;
            if scanned > MAX_TEMPLATES {
                warnings.push(
                    "El catálogo supera el límite de revisión; se conserva completo".to_string(),
                );
                break;
            }
            let result = (|| -> Result<Value, String> {
                let entry = entry.map_err(|_| "Entrada de catálogo no accesible")?;
                jobs::regular_directory(&entry.path())?;
                let path = entry.path().join("record.json");
                let meta =
                    fs::symlink_metadata(&path).map_err(|_| "Entrada incompleta; se conserva")?;
                if !meta.is_file() || batch::linked(&meta) || meta.len() > MAX_RECORD {
                    return Err("Registro no compatible; se conserva".into());
                }
                let mut raw = vec![];
                fs::File::open(&path)
                    .and_then(|file| file.take(MAX_RECORD + 1).read_to_end(&mut raw))
                    .map_err(|_| "Entrada no legible")?;
                if raw.len() as u64 > MAX_RECORD {
                    return Err("Registro fuera de límite".into());
                }
                let record: Record = serde_json::from_slice(&raw)
                    .map_err(|_| "Entrada incompleta o futura; se conserva")?;
                if entry.file_name().to_str() != Some(&sha256_hex(record.id.as_bytes())) {
                    return Err("Identidad de catálogo incoherente; se conserva".into());
                }
                let (record, revision) = read(self, &record.id)?;
                bytes = bytes.saturating_add(record.archive_bytes + meta.len());
                Ok(public(&record, &revision))
            })();
            match result {
                Ok(template) => templates.push(template),
                Err(error) => warnings.push(error),
            }
        }
        templates.sort_by(|a, b| a["name"].as_str().cmp(&b["name"].as_str()));
        Ok(
            json!({"templates":templates,"complete":warnings.is_empty(),"warnings":warnings,"maximumEntries":MAX_TEMPLATES,"maximumBytes":MAX_CATALOG,"storedBytes":bytes}),
        )
    }
    pub(crate) fn save_project_template(
        &self,
        transfer: &str,
        body: Value,
    ) -> Result<Value, String> {
        #[derive(Deserialize)]
        #[serde(rename_all = "camelCase", deny_unknown_fields)]
        struct Save {
            name: String,
            #[serde(default)]
            description: String,
            archive_sha256: String,
        }
        let _catalog_gate = CATALOG_GATE
            .lock()
            .map_err(|_| "El catálogo está ocupado")?;
        let input: Save = serde_json::from_value(body)
            .map_err(|_| "La plantilla necesita nombre y huella revisada del paquete")?;
        name(&input.name)?;
        if input.description.len() > 2000 || input.description.contains('\0') {
            return Err("Descripción de plantilla no válida".into());
        }
        let job = jobs::read(self, transfer)?;
        if job.template_catalogue {
            return Err("Un catálogo agrupado no se guarda como una sola plantilla. Incorpora sus entradas revisadas".into());
        }
        if job
            .manifest
            .as_ref()
            .is_some_and(|manifest| manifest.supplement.is_some())
        {
            return Err("El archivo privado no se convierte en plantilla. Prepara un paquete documental para compartirlo".into());
        }
        if job.phase != jobs::Phase::Ready
            || job.archive_sha256.as_deref() != Some(&input.archive_sha256)
        {
            return Err(
                "La preparación cambió; revisa el paquete antes de guardar la plantilla".into(),
            );
        }
        let inventory = self.list_project_templates()?;
        let entries = inventory["templates"].as_array().unwrap();
        if inventory["complete"] != true {
            return Err(
                "El catálogo contiene entradas no disponibles; se conservan antes de añadir otras"
                    .into(),
            );
        }
        if let Some(entry) = entries.iter().find(|entry| {
            paths::key(entry["name"].as_str().unwrap_or("")) == paths::key(&input.name)
        }) {
            if entry["name"] == input.name
                && entry["description"] == input.description
                && (entry["sourceArchiveSha256"] == input.archive_sha256
                    || entry["archiveSha256"] == input.archive_sha256)
                && entry["retired"] == false
            {
                return Ok(entry.clone());
            }
            return Err("Ya existe una plantilla con ese nombre, incluso retirada. Elige otro para conservar ambas".into());
        }
        if entries.len() >= MAX_TEMPLATES {
            return Err("El catálogo alcanza 50 entradas o 256 MiB, incluidas las retiradas. No se sustituye ninguna plantilla".into());
        }
        let source = jobs::folder(self, transfer)?.join("payload.zip");
        let mut manifest = archive::inspect(&source)?;
        if job.manifest.as_ref() != Some(&manifest)
            || worker::file_hash(&source, &|| jobs::check(self, transfer))?.1
                != input.archive_sha256
        {
            return Err("El paquete cambió; no se guarda como plantilla".into());
        }
        let preparation = jobs::folder(self, transfer)?;
        let (_, stage) = archive::extract(&source, &preparation)?;
        if worker::file_hash(&source, &|| jobs::check(self, transfer))?.1 != input.archive_sha256 {
            return Err("El paquete cambió durante la preparación de la plantilla".into());
        }
        manifest.project_name = input.name.clone();
        manifest.template_description = Some(input.description.clone());
        let staged = tempfile::Builder::new()
            .prefix("template-")
            .tempdir_in(&preparation)
            .map_err(|_| "No se pudo preparar la plantilla")?;
        let payload = staged.path().join("payload.zip");
        archive::write(stage.path(), &manifest, &payload)?;
        drop(stage);
        jobs::budget(&preparation)?;
        let (archive_bytes, archive_sha256) =
            worker::file_hash(&payload, &|| jobs::check(self, transfer))?;
        let id = knownext_core::compact_id("project-template");
        let record = Record {
            schema_version: 1,
            id,
            name: input.name,
            description: input.description,
            created_at: knownext_core::now_iso(),
            archive_sha256,
            source_archive_sha256: input.archive_sha256,
            archive_bytes,
            file_count: manifest.files.len(),
            directory_count: manifest.directories.len(),
            retired: false,
        };
        let encoded =
            serde_json::to_vec_pretty(&record).map_err(|_| "No se pudo preparar el registro")?;
        if inventory["storedBytes"]
            .as_u64()
            .unwrap_or(MAX_CATALOG)
            .saturating_add(archive_bytes)
            .saturating_add(encoded.len() as u64)
            > MAX_CATALOG
        {
            return Err("El catálogo supera 256 MiB con el paquete completo. Se conservan las plantillas existentes".into());
        }
        let _budget =
            recovery_inventory::admit(self, archive_bytes.saturating_add(encoded.len() as u64))?;
        let root = directory(self)?;
        fs::create_dir_all(&root).map_err(|_| "No se puede crear el catálogo")?;
        jobs::regular_directory(&root)?;
        let destination = root.join(sha256_hex(record.id.as_bytes()));
        recovery_lifecycle::ensure_open(self, &destination)?;
        fs::create_dir(&destination).map_err(|_| "No se pudo reservar una plantilla nueva")?;
        copy(
            &payload,
            &destination.join("payload.zip"),
            &record.archive_sha256,
            &|| jobs::check(self, transfer),
        )?;
        atomic_io::create(&destination.join("record.json"), &encoded)
            .map_err(|_| "La copia se conserva, pero falta confirmar su registro")?;
        let (record, revision) = read(self, &record.id)?;
        Ok(public(&record, &revision))
    }
    pub(crate) fn set_project_template_retired(
        &self,
        id: &str,
        body: Value,
    ) -> Result<Value, String> {
        #[derive(Deserialize)]
        #[serde(deny_unknown_fields)]
        struct Change {
            revision: String,
            retired: bool,
        }
        let _catalog_gate = CATALOG_GATE
            .lock()
            .map_err(|_| "El catálogo está ocupado")?;
        let input: Change = serde_json::from_value(body)
            .map_err(|_| "La acción necesita revisión y estado explícitos")?;
        let (mut record, revision) = read(self, id)?;
        if revision != input.revision {
            return Err("La plantilla cambió; actualiza antes de continuar".into());
        }
        record.retired = input.retired;
        let file = folder(self, id)?.join("record.json");
        if read(self, id)?.1 != revision {
            return Err("El registro cambió; se conserva".into());
        }
        atomic_io::write(
            &file,
            &serde_json::to_vec_pretty(&record).map_err(|_| "Registro no serializable")?,
        )
        .map_err(|_| "No se confirmó el cambio del catálogo")?;
        let (record, revision) = read(self, id)?;
        Ok(public(&record, &revision))
    }
}

impl LocalApi {
    pub(crate) fn lifecycle_template_record(&self, raw: &[u8]) -> bool {
        serde_json::from_slice::<Record>(raw).is_ok_and(|r| {
            r.schema_version == 1
                && valid_id(&r.id)
                && r.retired
                && self.list_project_transfers().is_ok_and(|v| {
                    v["warnings"].as_array().is_some_and(|a| a.is_empty())
                        && v["jobs"].as_array().is_some_and(|a| {
                            a.iter().all(|job| {
                                job["templateId"] != r.id
                                    || matches!(
                                        job["phase"].as_str(),
                                        Some("completed" | "cancelled" | "failed")
                                    )
                            })
                        })
                })
        })
    }
}
