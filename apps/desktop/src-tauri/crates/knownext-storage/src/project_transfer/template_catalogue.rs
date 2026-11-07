//! Explicit multi-template transport over the existing native project-package queue.
//! Carrier packages contain only documentary template packages, never runtime authority.
use super::*;
use std::{fs, io::Read};
const INDEX: &str = "knownext-project-template-catalogue.json";
const CAT_FORMAT: &str = "knownext.project-template-catalogue";
const MAX_INDEX: u64 = 128 * 1024;
const MAX_PAYLOAD: u64 = 256 * 1024 * 1024;
const MAX_ATTEMPTS: usize = 2048;
const MAX_ATTEMPT_BYTES: u64 = 64 * 1024 * 1024;
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct Selection {
    pub id: String,
    pub revision: String,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Portable {
    pub name: String,
    pub description: String,
    pub path: String,
    pub archive_sha256: String,
    pub archive_bytes: u64,
    pub file_count: usize,
    pub directory_count: usize,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Catalogue {
    pub format: String,
    pub schema_version: u8,
    pub entries: Vec<Portable>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Outcome {
    pub index: usize,
    pub name: String,
    pub status: String,
    pub template_id: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Attempt {
    pub schema_version: u8,
    pub id: String,
    pub transfer_id: String,
    pub archive_sha256: String,
    pub revision: String,
    pub phase: String,
    pub entries: Vec<Outcome>,
    pub checked_at: String,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Choice {
    index: usize,
    name: String,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ReviewInput {
    archive_sha256: String,
    entries: Vec<Choice>,
}
fn digest(s: &str) -> bool {
    s.len() == 64
        && s.bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}
pub(super) fn validate_selection(entries: &[Selection]) -> Result<(), String> {
    let mut ids = BTreeSet::new();
    if entries.is_empty()
        || entries.len() > 32
        || entries.iter().any(|x| {
            !ids.insert(&x.id)
                || !x.id.starts_with("project-template-")
                || !request_scope::portable_id(&x.id)
                || !digest(&x.revision)
        })
    {
        return Err("Selecciona entre 1 y 32 plantillas diferentes con revisión vigente".into());
    }
    Ok(())
}
impl Catalogue {
    pub(super) fn validate(&self) -> Result<(), String> {
        if self.format != CAT_FORMAT
            || self.schema_version != 1
            || self.entries.is_empty()
            || self.entries.len() > 32
        {
            return Err("Catálogo agrupado futuro o incompatible; se conserva".into());
        }
        let mut total = 0u64;
        let mut names = BTreeSet::new();
        for (i, e) in self.entries.iter().enumerate() {
            catalog::name(&e.name)?;
            total = total.saturating_add(e.archive_bytes);
            if !names.insert(paths::key(&e.name))
                || e.path != format!("Templates/{i:03}/payload.zip")
                || !digest(&e.archive_sha256)
                || e.archive_bytes == 0
                || e.archive_bytes > MAX_FILE
                || e.description.len() > 2000
                || e.description.contains('\0')
                || e.file_count.saturating_add(e.directory_count) + 1 > MAX_ENTRIES
            {
                return Err("Entrada de catálogo ambigua o fuera de límites; se conserva".into());
            }
        }
        if total > MAX_PAYLOAD {
            return Err("El catálogo supera 256 MiB; elige un grupo menor".into());
        }
        Ok(())
    }
}
fn read_file(path: &Path, max: u64) -> Result<Vec<u8>, String> {
    let m = fs::symlink_metadata(path).map_err(|_| "Archivo de catálogo ausente")?;
    if !m.is_file() || batch::linked(&m) || m.len() > max {
        return Err("Archivo no regular o demasiado grande; se conserva".into());
    }
    let mut bytes = vec![];
    fs::File::open(path)
        .map_err(|_| "No se puede leer el archivo")?
        .take(max + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| "Lectura incompleta")?;
    if bytes.len() as u64 != m.len() {
        return Err("El archivo cambió durante la lectura".into());
    }
    Ok(bytes)
}
pub(super) fn is_carrier(manifest: &Manifest) -> bool {
    manifest.files.iter().any(|f| f.path == INDEX)
}
/// A narrow carrier exception, not general JSON/ZIP project import support.
pub(super) fn valid_carrier_kind(manifest: &Manifest, file: &PackageFile) -> bool {
    if manifest.schema_version != 1
        || manifest.supplement.is_some()
        || !is_carrier(manifest)
        || !(2..=33).contains(&manifest.files.len())
    {
        return false;
    }
    let count = manifest.files.len() - 1;
    if manifest.files.iter().filter(|f| f.path == INDEX).count() != 1 {
        return false;
    }
    let expected = (0..count)
        .map(|i| format!("Templates/{i:03}/payload.zip"))
        .collect::<BTreeSet<_>>();
    let directories = std::iter::once("Templates".to_string())
        .chain((0..count).map(|i| format!("Templates/{i:03}")))
        .collect::<BTreeSet<_>>();
    if manifest.directories.len() != directories.len()
        || manifest
            .directories
            .iter()
            .any(|d| !directories.contains(d))
    {
        return false;
    }
    let mut total = 0u64;
    for candidate in &manifest.files {
        if candidate.path == INDEX {
            if candidate.kind != FileKind::Attachment
                || candidate.size == 0
                || candidate.size > MAX_INDEX
            {
                return false;
            }
        } else {
            if !expected.contains(&candidate.path)
                || candidate.kind != FileKind::Archive
                || candidate.size == 0
                || candidate.size > MAX_FILE
            {
                return false;
            }
            total = total.saturating_add(candidate.size);
        }
    }
    total <= MAX_PAYLOAD && manifest.files.contains(file)
}
pub(super) fn inspect_stage(stage: &Path, manifest: &Manifest) -> Result<Catalogue, String> {
    if manifest.supplement.is_some() {
        return Err("El archivo privado no es un catálogo de plantillas".into());
    }
    let c: Catalogue = serde_json::from_slice(&read_file(&stage.join(INDEX), MAX_INDEX)?)
        .map_err(|_| "Índice de catálogo ilegible o futuro")?;
    c.validate()?;
    let expected: BTreeSet<_> = c
        .entries
        .iter()
        .map(|e| e.path.as_str())
        .chain(std::iter::once(INDEX))
        .collect();
    if manifest.files.len() != expected.len()
        || manifest
            .files
            .iter()
            .any(|f| !expected.contains(f.path.as_str()))
    {
        return Err("El catálogo contiene archivos ajenos al índice; no se incorpora".into());
    }
    for e in &c.entries {
        let path = stage.join(&e.path);
        let (bytes, hash) = worker::file_hash(&path, &|| Ok(()))?;
        let inner = archive::inspect(&path)?;
        if bytes != e.archive_bytes
            || hash != e.archive_sha256
            || inner.supplement.is_some()
            || is_carrier(&inner)
            || inner.project_name != e.name
            || inner.template_description.as_deref().unwrap_or("") != e.description
            || inner.files.len() != e.file_count
            || inner.directories.len() != e.directory_count
        {
            return Err(
                "Un paquete no coincide con el índice o contiene datos privados; se conserva todo"
                    .into(),
            );
        }
    }
    Ok(c)
}
pub(super) fn prepare_export(
    api: &LocalApi,
    job: &jobs::Job,
    dir: &Path,
) -> Result<(Manifest, Catalogue), String> {
    validate_selection(&job.template_selection)?;
    let stage = tempfile::Builder::new()
        .prefix("snapshot-")
        .tempdir_in(dir)
        .map_err(|_| "No se pudo preparar el grupo")?;
    fs::create_dir(stage.path().join("Templates")).map_err(|_| "No se pudo reservar el grupo")?;
    let mut c = Catalogue {
        format: CAT_FORMAT.into(),
        schema_version: 1,
        entries: vec![],
    };
    let mut files = vec![];
    let mut directories = vec!["Templates".into()];
    for (i, s) in job.template_selection.iter().enumerate() {
        jobs::check(api, &job.id)?;
        let (v, source) = catalog::reviewed(api, &s.id, &s.revision)?;
        let name = v["name"].as_str().ok_or("Plantilla sin nombre")?.to_owned();
        let description = v["description"].as_str().unwrap_or("").to_owned();
        let size = v["archiveBytes"].as_u64().ok_or("Tamaño no disponible")?;
        if size > MAX_FILE {
            return Err(
                "Cada plantilla del grupo admite hasta 64 MiB; la plantilla original permanece"
                    .into(),
            );
        }
        let folder = format!("Templates/{i:03}");
        fs::create_dir(stage.path().join(&folder))
            .map_err(|_| "No se pudo preparar una entrada")?;
        directories.push(folder.clone());
        let path = format!("{folder}/payload.zip");
        let hash = v["archiveSha256"]
            .as_str()
            .ok_or("Huella de plantilla ausente")?
            .to_owned();
        catalog::copy(&source, &stage.path().join(&path), &hash, &|| {
            jobs::check(api, &job.id)
        })?;
        catalog::reviewed(api, &s.id, &s.revision)?;
        let e = Portable {
            name,
            description,
            path: path.clone(),
            archive_sha256: hash.clone(),
            archive_bytes: size,
            file_count: v["fileCount"].as_u64().ok_or("Recuento ausente")? as usize,
            directory_count: v["directoryCount"].as_u64().ok_or("Recuento ausente")? as usize,
        };
        c.entries.push(e);
        c.validate()?;
        files.push(PackageFile {
            path,
            size,
            sha256: hash,
            kind: FileKind::Archive,
        });
    }
    let raw = serde_json::to_vec_pretty(&c).map_err(|_| "Índice no representable")?;
    if raw.len() as u64 > MAX_INDEX {
        return Err("Índice de catálogo demasiado grande".into());
    }
    atomic_io::create(&stage.path().join(INDEX), &raw)
        .map_err(|_| "No se pudo conservar el índice")?;
    files.push(PackageFile {
        path: INDEX.into(),
        size: raw.len() as u64,
        sha256: sha256_hex(&raw),
        kind: FileKind::Attachment,
    });
    let manifest = Manifest {
        supplement: None,
        template_description: None,
        format: FORMAT.into(),
        schema_version: 1,
        project_name: "Catálogo de plantillas de proyecto".into(),
        created_at: knownext_core::now_iso(),
        directories,
        files,
        exclusions: vec![],
        adjustments: vec![],
        reference_warnings: vec![],
    };
    inspect_stage(stage.path(), &manifest)?;
    for s in &job.template_selection {
        catalog::reviewed(api, &s.id, &s.revision)?;
    }
    archive::write(stage.path(), &manifest, &dir.join("payload.zip"))?;
    Ok((manifest, c))
}
fn source_stage(api: &LocalApi, job: &jobs::Job) -> Result<PathBuf, String> {
    let name = job
        .staged_folder
        .as_deref()
        .ok_or("Falta el contenido preparado")?;
    let path = jobs::folder(api, &job.id)?.join(name);
    jobs::regular_directory(&path)?;
    Ok(path)
}
fn checked_source(
    api: &LocalApi,
    id: &str,
    input: &ReviewInput,
) -> Result<(jobs::Job, Catalogue, PathBuf), String> {
    let job = jobs::read(api, id)?;
    if !job.template_catalogue
        || job.kind != jobs::Kind::Import
        || job.phase != jobs::Phase::Ready
        || job.catalogue_outcome.is_some()
        || job.archive_sha256.as_deref() != Some(&input.archive_sha256)
    {
        return Err("La revisión no corresponde a un catálogo importado listo. Consulta el intento sin repetir".into());
    }
    jobs::check(api, id)?;
    let source = jobs::folder(api, id)?.join("payload.zip");
    if worker::file_hash(&source, &|| jobs::check(api, id))?.1 != input.archive_sha256 {
        return Err("El archivo cambió desde su revisión; se conserva".into());
    }
    let stage = source_stage(api, &job)?;
    let c = inspect_stage(&stage, job.manifest.as_ref().ok_or("Falta el manifiesto")?)?;
    if job.catalogue.as_ref() != Some(&c) {
        return Err("El índice cambió desde la preparación; vuelve a elegir el archivo".into());
    }
    Ok((job, c, stage))
}
fn review(
    api: &LocalApi,
    id: &str,
    input: &ReviewInput,
) -> Result<(Value, jobs::Job, Catalogue, PathBuf), String> {
    let (job, c, stage) = checked_source(api, id, input)?;
    let inv = api.list_project_templates()?;
    if inv["complete"] != true {
        return Err(
            "El catálogo local contiene entradas desconocidas; se conservan antes de ampliarlo"
                .into(),
        );
    }
    let mut indices = BTreeSet::new();
    let mut names = BTreeSet::new();
    if input.entries.is_empty() || input.entries.len() > 32 {
        return Err("Selecciona entre 1 y 32 entradas".into());
    }
    let existing = inv["templates"]
        .as_array()
        .ok_or("Catálogo local no compatible")?;
    let mut rows = vec![];
    let mut additional = 0u64;
    let mut records = 0usize;
    for s in &input.entries {
        catalog::name(&s.name)?;
        if s.index >= c.entries.len()
            || !indices.insert(s.index)
            || !names.insert(paths::key(&s.name))
        {
            return Err("Selecciona entradas distintas y nombres distintos".into());
        }
        let entry = &c.entries[s.index];
        let current = existing.iter().find(|e| {
            e["name"]
                .as_str()
                .is_some_and(|n| paths::key(n) == paths::key(&s.name))
        });
        let same = current.is_some_and(|v| {
            v["retired"] == false
                && v["name"] == s.name
                && v["description"] == entry.description
                && (v["archiveSha256"] == entry.archive_sha256
                    || v["sourceArchiveSha256"] == entry.archive_sha256)
        });
        let status = if current.is_some() {
            if same {
                "existing"
            } else {
                "conflict"
            }
        } else {
            "new"
        };
        if status == "new" {
            additional = additional
                .saturating_add(entry.archive_bytes)
                .saturating_add(65536);
            records += 1;
        }
        rows.push(json!({"index":s.index,"name":s.name,"sourceName":entry.name,"description":entry.description,"fileCount":entry.file_count,"directoryCount":entry.directory_count,"archiveBytes":entry.archive_bytes,"status":status,"templateId":if same{current.unwrap()["id"].clone()}else{Value::Null}}));
    }
    let capacity = existing.len().saturating_add(records) <= recovery_quotas::TEMPLATE_RECORDS
        && inv["storedBytes"]
            .as_u64()
            .unwrap_or(u64::MAX)
            .saturating_add(additional)
            <= recovery_quotas::TEMPLATE_BYTES;
    let root = api
        .app_data_dir
        .canonicalize()
        .map_err(|_| "Perfil no accesible")?;
    let revision=sha256_hex(&serde_json::to_vec(&json!({"source":input.archive_sha256,"selection":input.entries,"inventory":inv["templates"],"profile":root.to_string_lossy()})).map_err(|_|"Revisión no representable")?);
    let can = capacity && !rows.iter().any(|v| v["status"] == "conflict");
    Ok((
        json!({"schemaVersion":1,"transferId":id,"archiveSha256":input.archive_sha256,"revision":revision,"entries":rows,"canApply":can,"capacityAvailable":capacity,"createsProjects":false,"startsAi":false,"preservesSource":true,"checkedAt":knownext_core::now_iso()}),
        job,
        c,
        stage,
    ))
}
fn receipt_dir(api: &LocalApi) -> Result<PathBuf, String> {
    let dir = api.app_data_dir.join("project-template-catalogues");
    jobs::regular_directory(&api.app_data_dir)?;
    if fs::symlink_metadata(&dir).is_ok() {
        jobs::regular_directory(&dir)?;
    }
    Ok(dir)
}
fn receipt_path(api: &LocalApi, id: &str) -> Result<PathBuf, String> {
    if !id.starts_with("project-template-catalogue-") || !request_scope::portable_id(id) {
        return Err("Identidad de intento de catálogo inválida".into());
    }
    Ok(receipt_dir(api)?.join(format!("{id}.json")))
}
pub(super) fn validate_attempt(a: &Attempt) -> Result<(), String> {
    if a.schema_version != 1
        || !a.id.starts_with("project-template-catalogue-")
        || !request_scope::portable_id(&a.id)
        || !a.transfer_id.starts_with("transfer-")
        || !request_scope::portable_id(&a.transfer_id)
        || !digest(&a.archive_sha256)
        || !digest(&a.revision)
        || !matches!(
            a.phase.as_str(),
            "applying" | "completed" | "partial" | "uncertain"
        )
        || a.entries.is_empty()
        || a.entries.len() > 32
    {
        return Err("Intento de catálogo futuro o incoherente; se conserva".into());
    }
    let mut indices = BTreeSet::new();
    for e in &a.entries {
        catalog::name(&e.name)?;
        if !indices.insert(e.index)
            || !matches!(
                e.status.as_str(),
                "pending" | "created" | "existing" | "unconfirmed"
            )
            || e.template_id.as_ref().is_some_and(|id| {
                !id.starts_with("project-template-") || !request_scope::portable_id(id)
            })
            || a.phase == "completed" && !matches!(e.status.as_str(), "created" | "existing")
        {
            return Err("Entradas de intento no compatibles".into());
        }
    }
    OffsetDateTime::parse(&a.checked_at, &Rfc3339).map_err(|_| "Fecha de intento no compatible")?;
    Ok(())
}
fn read_attempt(api: &LocalApi, id: &str) -> Result<Attempt, String> {
    let a: Attempt = serde_json::from_slice(&read_file(&receipt_path(api, id)?, MAX_INDEX)?)
        .map_err(|_| "Intento de catálogo no compatible; se conserva")?;
    validate_attempt(&a)?;
    if a.id != id {
        return Err("El intento no corresponde a su identidad".into());
    }
    Ok(a)
}
fn public_attempt(a: &Attempt) -> Value {
    let mut v = serde_json::to_value(a).unwrap();
    v["canReplay"] = json!(false);
    v["preservesSource"] = json!(true);
    v["createsProjects"] = json!(false);
    v
}
fn update(api: &LocalApi, job: &mut jobs::Job, a: &Attempt) -> Result<(), String> {
    validate_attempt(a)?;
    read_attempt(api, &a.id)?;
    atomic_io::write(
        &receipt_path(api, &a.id)?,
        &serde_json::to_vec_pretty(a).map_err(|_| "Acuse no representable")?,
    )
    .map_err(|_| "El acuse necesita consulta; no se repite la incorporación")?;
    job.catalogue_outcome = Some(a.clone());
    jobs::write(api, job)
}
fn admit_attempt(api: &LocalApi, job: &str, bytes: u64) -> Result<(), String> {
    let dir = receipt_dir(api)?;
    let mut count = 0;
    let mut total = bytes;
    if dir.exists() {
        for entry in fs::read_dir(&dir).map_err(|_| "No se pudo medir el almacén de intentos")? {
            let entry = entry.map_err(|_| "Inventario de intentos incompleto")?;
            let name = entry.file_name().to_string_lossy().into_owned();
            if matches!(
                name.as_str(),
                "owner.lock" | "runtime-owner.lock" | "capture.lock"
            ) {
                continue;
            }
            let m = fs::symlink_metadata(entry.path()).map_err(|_| "Intento no verificable")?;
            if !m.is_file() || batch::linked(&m) {
                return Err("Intento no regular; se conserva".into());
            }
            count += 1;
            total = total.saturating_add(m.len());
            if count >= MAX_ATTEMPTS || total > MAX_ATTEMPT_BYTES {
                return Err(
                    "El almacén de intentos alcanza 2048 identidades/64 MiB. No se reciclan recibos"
                        .into(),
                );
            }
            if let Some(id) = name.strip_suffix(".json") {
                match read_attempt(api, id) {
                    Ok(a) if a.transfer_id == job => {
                        return Err(
                            "Esta preparación ya tiene un intento. Consulta su acuse sin repetir"
                                .into(),
                        )
                    }
                    Ok(_) => (),
                    Err(_) => {
                        return Err(
                            "Hay intentos desconocidos; se conservan antes de admitir otro".into(),
                        )
                    }
                }
            }
        }
    }
    Ok(())
}
/// Explicit retirement runs only under the shared transfer queue. It never replays work.
pub(super) fn close_preparation(api: &LocalApi, job: &jobs::Job) -> Result<(), String> {
    let recorded = job
        .catalogue_outcome
        .as_ref()
        .ok_or("La preparación no acredita un intento de catálogo; se conserva")?;
    let mut receipt = read_attempt(api, &recorded.id)?;
    if receipt.transfer_id != job.id
        || receipt.archive_sha256 != recorded.archive_sha256
        || receipt.revision != recorded.revision
    {
        return Err("El acuse no corresponde a esta preparación; se conserva todo".into());
    }
    if receipt.phase == "applying" {
        receipt.phase = "uncertain".into();
        for entry in &mut receipt.entries {
            if entry.status == "pending" {
                entry.status = "unconfirmed".into();
            }
        }
        atomic_io::write(
            &receipt_path(api, &receipt.id)?,
            &serde_json::to_vec_pretty(&receipt).map_err(|_| "Acuse no representable")?,
        )
        .map_err(|_| "No se confirmó el cierre del intento; la preparación permanece")?;
    }
    Ok(())
}
impl LocalApi {
    pub(crate) fn review_project_template_catalogue(
        &self,
        id: &str,
        body: Value,
    ) -> Result<Value, String> {
        let q: ReviewInput = serde_json::from_value(body)
            .map_err(|_| "Revisa huella, entradas y nombres elegidos")?;
        Ok(review(self, id, &q)?.0)
    }
    pub(crate) fn commit_project_template_catalogue(
        &self,
        id: &str,
        body: Value,
    ) -> Result<Value, String> {
        #[derive(Deserialize)]
        #[serde(rename_all = "camelCase", deny_unknown_fields)]
        struct Input {
            archive_sha256: String,
            entries: Vec<Choice>,
            revision: String,
            attempt_id: String,
            acknowledge: bool,
        }
        let q: Input = serde_json::from_value(body).map_err(|_| "Confirma un catálogo revisado")?;
        if !q.acknowledge {
            return Err("Confirma las entradas y sus nombres".into());
        }
        let _gate = catalog::CATALOG_GATE
            .lock()
            .map_err(|_| "El catálogo está ocupado")?;
        let input = ReviewInput {
            archive_sha256: q.archive_sha256,
            entries: q.entries,
        };
        let (v, mut job, c, stage) = review(self, id, &input)?;
        if v["revision"] != q.revision || v["canApply"] != true {
            return Err("La revisión cambió, hay colisiones o falta capacidad. No se publicó ninguna plantilla".into());
        }
        let folder = jobs::folder(self, id)?;
        let mut staged = vec![];
        let mut outcomes = vec![];
        let mut actual_bytes = 0u64;
        for row in v["entries"].as_array().unwrap() {
            let index = row["index"].as_u64().unwrap() as usize;
            let entry = &c.entries[index];
            if row["status"] == "existing" {
                outcomes.push(Outcome {
                    index,
                    name: row["name"].as_str().unwrap().into(),
                    status: "existing".into(),
                    template_id: Some(row["templateId"].as_str().unwrap().into()),
                });
                continue;
            }
            jobs::check(self, id)?;
            let source = stage.join(&entry.path);
            let (mut manifest, contents) = archive::extract(&source, &folder)?;
            manifest.project_name = row["name"].as_str().unwrap().into();
            manifest.template_description = Some(entry.description.clone());
            let template_id = knownext_core::compact_id("project-template");
            let prepared = folder.join(format!("template-catalogue-{template_id}"));
            fs::create_dir(&prepared).map_err(|_| "No se pudo reservar una plantilla preparada")?;
            archive::write(contents.path(), &manifest, &prepared.join("payload.zip"))?;
            drop(contents);
            let (bytes, hash) =
                worker::file_hash(&prepared.join("payload.zip"), &|| jobs::check(self, id))?;
            if bytes > MAX_FILE {
                return Err("La plantilla renombrada supera 64 MiB; no se publica el grupo".into());
            }
            let record = catalog::Record {
                schema_version: 1,
                id: template_id.clone(),
                name: row["name"].as_str().unwrap().into(),
                description: entry.description.clone(),
                created_at: knownext_core::now_iso(),
                archive_sha256: hash,
                source_archive_sha256: entry.archive_sha256.clone(),
                archive_bytes: bytes,
                file_count: entry.file_count,
                directory_count: entry.directory_count,
                retired: false,
            };
            let raw =
                serde_json::to_vec_pretty(&record).map_err(|_| "Registro no representable")?;
            actual_bytes = actual_bytes
                .saturating_add(bytes)
                .saturating_add(raw.len() as u64);
            atomic_io::create(&prepared.join("record.json"), &raw)
                .map_err(|_| "No se pudo conservar el registro preparado")?;
            staged.push((
                template_id.clone(),
                prepared,
                index,
                record.archive_sha256.clone(),
                sha256_hex(&raw),
            ));
            outcomes.push(Outcome {
                index,
                name: record.name,
                status: "pending".into(),
                template_id: Some(template_id),
            });
            jobs::budget(&folder)?;
        }
        let inv = self.list_project_templates()?;
        if inv["storedBytes"]
            .as_u64()
            .unwrap_or(u64::MAX)
            .saturating_add(actual_bytes)
            > recovery_quotas::TEMPLATE_BYTES
            || inv["templates"].as_array().unwrap().len() + staged.len()
                > recovery_quotas::TEMPLATE_RECORDS
        {
            return Err(
                "El catálogo no admite el grupo completo; ninguna plantilla se publica".into(),
            );
        }
        let (v2, _, _, _) = review(self, id, &input)?;
        if v2["revision"] != v["revision"] {
            return Err(
                "La revisión cambió al preparar; las copias se conservan sin publicar".into(),
            );
        }
        let mut attempt = Attempt {
            schema_version: 1,
            id: q.attempt_id,
            transfer_id: id.into(),
            archive_sha256: input.archive_sha256,
            revision: q.revision,
            phase: "applying".into(),
            entries: outcomes,
            checked_at: knownext_core::now_iso(),
        };
        validate_attempt(&attempt)?;
        let receipt = receipt_path(self, &attempt.id)?;
        let raw = serde_json::to_vec_pretty(&attempt).unwrap();
        admit_attempt(self, id, raw.len() as u64)?;
        let _budget =
            recovery_inventory::admit(self, actual_bytes.saturating_add(raw.len() as u64))?;
        let receipts = receipt_dir(self)?;
        fs::create_dir_all(&receipts).map_err(|_| "No se pudo conservar el intento")?;
        atomic_io::create(&receipt, &raw)
            .map_err(|_| "El intento ya existe o no está confirmado. Consúltalo")?;
        job.catalogue_outcome = Some(attempt.clone());
        job.phase = jobs::Phase::Committing;
        jobs::write(self, &job)?;
        let target = catalog::directory(self)?;
        fs::create_dir_all(&target).map_err(|_| "No se pudo preparar el catálogo local")?;
        jobs::regular_directory(&target)?;
        if worker::file_hash(&folder.join("payload.zip"), &|| Ok(()))?.1 != attempt.archive_sha256 {
            attempt.phase = "uncertain".into();
            job.phase = jobs::Phase::Failed;
            job.last_error = Some(
                "La fuente cambió después de conservar el intento; no se publicó el grupo".into(),
            );
            update(self, &mut job, &attempt)?;
            return Ok(jobs::public(self, &job));
        }
        for (template_id, prepared, index, payload_hash, record_hash) in staged {
            if worker::file_hash(&prepared.join("payload.zip"), &|| Ok(()))?.1 != payload_hash
                || sha256_hex(&read_file(&prepared.join("record.json"), 65536)?) != record_hash
            {
                attempt.phase = "uncertain".into();
                job.phase = jobs::Phase::Failed;
                job.last_error = Some(
                    "Una copia preparada cambió. Consulta el resultado parcial sin repetir".into(),
                );
                update(self, &mut job, &attempt)?;
                return Ok(jobs::public(self, &job));
            }
            let destination = target.join(sha256_hex(template_id.as_bytes()));
            if let Err(error) = atomic_io::rename_no_replace(&prepared, &destination) {
                attempt.phase = "partial".into();
                job.phase = jobs::Phase::Failed;
                job.last_error = Some(format!(
                    "Incorporación parcial; conserva las copias y consulta sin repetir: {error}"
                ));
                update(self, &mut job, &attempt)?;
                return Ok(jobs::public(self, &job));
            }
            let row = attempt
                .entries
                .iter_mut()
                .find(|r| r.index == index)
                .unwrap();
            row.status = "created".into();
            if let Err(error) = update(self, &mut job, &attempt) {
                return Err(error);
            }
        }
        attempt.phase = "completed".into();
        job.phase = jobs::Phase::Completed;
        job.last_error = None;
        update(self, &mut job, &attempt)?;
        Ok(jobs::public(self, &job))
    }
    pub(crate) fn project_template_catalogue_receipt(&self, id: &str) -> Result<Value, String> {
        Ok(public_attempt(&read_attempt(self, id)?))
    }
    pub(crate) fn project_template_catalogue_attempts(&self) -> Result<Value, String> {
        let dir = receipt_dir(self)?;
        let mut items = vec![];
        let mut unavailable = 0;
        let mut limited = false;
        if dir.exists() {
            for (index, entry) in fs::read_dir(&dir)
                .map_err(|_| "Catálogo de intentos no accesible")?
                .enumerate()
            {
                if index >= MAX_ATTEMPTS {
                    limited = true;
                    break;
                }
                let entry = entry.map_err(|_| "Catálogo de intentos incompleto")?;
                let name = entry.file_name().to_string_lossy().into_owned();
                if matches!(
                    name.as_str(),
                    "owner.lock" | "runtime-owner.lock" | "capture.lock"
                ) {
                    continue;
                }
                let Some(id) = name.strip_suffix(".json") else {
                    unavailable += 1;
                    continue;
                };
                match read_attempt(self, id) {
                    Ok(a) => items.push(public_attempt(&a)),
                    Err(_) => unavailable += 1,
                }
            }
        }
        items.sort_by(|a, b| b["checkedAt"].as_str().cmp(&a["checkedAt"].as_str()));
        if items.len() > 200 {
            limited = true;
            items.truncate(200);
        }
        Ok(
            json!({"schemaVersion":1,"items":items,"unavailable":unavailable,"limited":limited,"canReplay":false,"checkedAt":knownext_core::now_iso()}),
        )
    }
}
