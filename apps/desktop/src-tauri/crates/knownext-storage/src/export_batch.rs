//! Bounded local conversion into one frozen ZIP; delivery is a separate reviewed native intent.
use super::*;
use std::{
    fs,
    io::{Read, Write},
    sync::Mutex,
};

pub struct BatchDelivery {
    pub staged: StagedUserExport,
    _lease: BatchLease,
}
struct BatchLease {
    active: std::sync::Arc<std::sync::Mutex<BTreeSet<String>>>,
    id: String,
}
impl Drop for BatchLease {
    fn drop(&mut self) {
        if let Ok(mut set) = self.active.lock() {
            set.remove(&self.id);
        }
    }
}
fn file_hash(path: &Path, limit: u64) -> Result<(String, u64), String> {
    let before = fs::symlink_metadata(path).map_err(|_| "Archivo no disponible")?;
    if !before.is_file() || batch::linked(&before) || before.len() > limit {
        return Err("Archivo no regular o fuera de límite".into());
    }
    let mut file = fs::File::open(path).map_err(|_| "Archivo no accesible")?;
    let mut digest = Sha256::new();
    let mut total = 0u64;
    let mut buffer = [0; 65536];
    loop {
        let n = file.read(&mut buffer).map_err(|_| "Lectura incompleta")?;
        if n == 0 {
            break;
        }
        total += n as u64;
        if total > limit {
            return Err("Archivo fuera de límite".into());
        }
        digest.update(&buffer[..n]);
    }
    let after = fs::symlink_metadata(path).map_err(|_| "Archivo no disponible")?;
    if total != before.len()
        || after.len() != before.len()
        || after.modified().ok() != before.modified().ok()
    {
        return Err("El archivo cambió durante la lectura".into());
    }
    Ok((format!("{:x}", digest.finalize()), total))
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Document {
    id: String,
    diagram_assets: Option<Value>,
    markdown: Option<String>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Request {
    documents: Vec<Document>,
    format: String,
    profile_id: Option<String>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Row {
    source: String,
    filename: String,
    bytes: u64,
    sha256: String,
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Job {
    schema_version: u8,
    id: String,
    project_id: String,
    revision: String,
    phase: String,
    format: String,
    profile_name: Option<String>,
    rows: Vec<Row>,
    archive_sha256: String,
    archive_bytes: u64,
    checked_at: String,
}
fn folder(api: &LocalApi, id: &str) -> Result<PathBuf, String> {
    if !id.starts_with("export-batch-") || !request_scope::portable_id(id) {
        return Err("Preparación de exportación no válida".into());
    }
    let d = api.app_data_dir.join("export-batches");
    for dir in [&api.app_data_dir, &d, &d.join(id)] {
        match fs::symlink_metadata(dir) {
            Ok(m) if m.is_dir() && !batch::linked(&m) => (),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => (),
            _ => return Err("Carpeta de exportación no regular; se conserva".into()),
        }
    }
    Ok(d.join(id))
}
fn load(api: &LocalApi, id: &str) -> Result<Job, String> {
    let path = folder(api, id)?.join("review.json");
    let bytes = export_execution::bounded_read(&path, 128 * 1024)?;
    let j: Job =
        serde_json::from_slice(&bytes).map_err(|_| "Preparación de exportación no compatible")?;
    if j.schema_version != 1
        || j.id != id
        || !request_scope::portable_id(&j.project_id)
        || j.rows.len() > 32
        || j.archive_bytes > 512 * 1024 * 1024
        || !matches!(
            j.phase.as_str(),
            "prepared" | "picking" | "saved" | "cancelled" | "uncertain" | "discarded"
        )
    {
        return Err("Preparación de exportación no compatible; se conserva".into());
    }
    Ok(j)
}
fn store(api: &LocalApi, j: &Job) -> Result<(), String> {
    let path = folder(api, &j.id)?.join("review.json");
    atomic_io::write(
        &path,
        &serde_json::to_vec(j).map_err(|_| "Preparación no representable")?,
    )
    .map_err(|_| "Entrega sin confirmar; consulta antes de repetir".into())
}
fn public(j: &Job) -> Value {
    json!({"schemaVersion":1,"id":j.id,"projectId":j.project_id,"revision":j.revision,"phase":j.phase,"format":j.format,"profileName":j.profile_name,"documents":j.rows,"archiveSha256":j.archive_sha256,"archiveBytes":j.archive_bytes,"checkedAt":j.checked_at,"includesConfirmedDrafts":true,"frozen":true})
}
pub fn is_export_batch_work(method: &str, path: &str) -> bool {
    method == "POST"
        && matches!(
            path.trim_matches('/')
                .split('/')
                .collect::<Vec<_>>()
                .as_slice(),
            ["api", "projects", _, "export-batches"]
        )
}
pub fn dispatch_export_batch(
    mutations: &Mutex<LocalApi>,
    source: &LocalApi,
    project: &str,
    body: Value,
) -> ApiResult {
    validate_runtime_input(&body, &[])?;
    let q: Request = serde_json::from_value(body).map_err(|_| "Exportación agrupada no válida")?;
    if q.documents.is_empty()
        || q.documents.len() > 32
        || q.documents
            .iter()
            .map(|d| &d.id)
            .collect::<BTreeSet<_>>()
            .len()
            != q.documents.len()
        || !matches!(q.format.as_str(), "pdf" | "docx" | "md")
    {
        return Err("Selecciona 1–32 documentos y un formato admitido".into());
    }
    let (mut prepared, mut resources) = (vec![], BTreeMap::<String, Vec<u8>>::new());
    let mut capture_bytes = 0u64;
    let profile;
    {
        let api = mutations
            .lock()
            .map_err(|_| "No se pudo preparar la exportación")?;
        profile = api.export_profile(q.profile_id.as_deref())?;
        for doc in q.documents {
            let (owner, relative) = document_ref(&doc.id)?;
            if owner != project {
                return Err("Todos los documentos deben pertenecer al proyecto revisado".into());
            }
            let handwritten = relative.ends_with(".knote");
            if handwritten && q.format != "pdf" {
                return Err("Las notas manuscritas se exportan en PDF en un lote mixto; elige PDF o retira esas notas".into());
            }
            let item=api.prepare_export(if handwritten{export_execution::Kind::Handwritten}else{export_execution::Kind::Markdown},&doc.id,json!({"format":q.format,"profileId":q.profile_id,"diagramAssets":doc.diagram_assets,"markdown":doc.markdown}),false)?;
            if let Some(md) = item.batch_markdown() {
                if q.format == "md" {
                    for reference in
                        markdown_image_references(md, project, &doc.id, &relative, &relative)
                    {
                        let raw_target = reference["rawTarget"]
                            .as_str()
                            .ok_or("Referencia no representable")?;
                        if raw_target.starts_with("data:") {
                            continue;
                        }
                        if knownext_asset_url_relative(raw_target).is_some() {
                            return Err("El documento conserva una referencia interna de visualización. Guárdalo desde el editor antes de preparar el lote Markdown".into());
                        }
                        let target=reference["resolvedAssetPath"].as_str().ok_or("La entrega Markdown requiere imágenes locales verificables; no se descarga un recurso remoto")?;
                        let path = api.resolve_project_relative(project, target)?;
                        let raw = export_execution::bounded_read(&path, 32 * 1024 * 1024)?;
                        if let Some(old) = resources.get(target) {
                            if old != &raw {
                                return Err("Una imagen cambió durante la preparación".into());
                            }
                        }
                        if !resources.contains_key(target) {
                            capture_bytes = capture_bytes.saturating_add(raw.len() as u64);
                        }
                        resources.insert(target.into(), raw);
                    }
                }
            }
            capture_bytes = capture_bytes.saturating_add(item.batch_footprint()?);
            if capture_bytes > 128 * 1024 * 1024 {
                return Err(
                    "El contenido preparado del lote supera 128 MiB; selecciona menos documentos"
                        .into(),
                );
            }
            prepared.push((relative, item));
        }
    }
    let directory = source.app_data_dir.join("export-batches");
    if !directory.exists() {
        fs::create_dir(&directory).map_err(|_| "No se pudo preparar la carpeta de lotes")?;
    }
    let m = fs::symlink_metadata(&directory).map_err(|_| "Lotes no accesibles")?;
    if !m.is_dir() || batch::linked(&m) {
        return Err("Carpeta de lotes no regular".into());
    }
    let mut count = 0usize;
    let mut retained = 0u64;
    for entry in fs::read_dir(&directory)
        .map_err(|_| "No se pueden revisar preparaciones")?
        .take(2049)
    {
        let entry = entry.map_err(|_| "Preparación no disponible")?;
        let name = entry.file_name().to_string_lossy().into_owned();
        if name.starts_with("prepare-") {
            count += 1;
            let m = fs::symlink_metadata(directory.join(&name))
                .map_err(|_| "Preparación no accesible")?;
            if !m.is_dir() || batch::linked(&m) {
                return Err("Preparación no regular; se conserva".into());
            }
            let path = directory.join(&name).join("payload.zip");
            if let Ok(m) = fs::symlink_metadata(path) {
                if !m.is_file() || batch::linked(&m) || m.len() > 512 * 1024 * 1024 {
                    return Err("Preparación interrumpida no verificable; se conserva".into());
                }
                retained = retained.saturating_add(m.len());
            }
            continue;
        }
        if !name.starts_with("export-batch-") {
            return Err("Hay una preparación no conocida; se conserva".into());
        }
        let job = load(source, &name)?;
        retained=retained.saturating_add(fs::metadata(directory.join(&name).join("review.json")).map_err(|_|"Revisión no disponible")?.len());
        count += 1;
        if !matches!(job.phase.as_str(), "discarded") {
            retained = retained.saturating_add(job.archive_bytes);
        }
        if count > recovery_quotas::EXPORT_BATCH_RECORDS || retained > 1024 * 1024 * 1024 {
            return Err("Las preparaciones alcanzan su límite; quita lotes revisados antes de preparar otro".into());
        }
    }
    if count >= recovery_quotas::EXPORT_BATCH_RECORDS || retained > 1024 * 1024 * 1024 {
        return Err("Las preparaciones alcanzan su límite; conserva o retira las conocidas".into());
    }
    let id = knownext_core::compact_id("export-batch");
    let _budget = recovery_inventory::admit(source,512 * 1024 * 1024 + 128 * 1024)?;
    let temporary = tempfile::Builder::new()
        .prefix("prepare-")
        .tempdir_in(&directory)
        .map_err(|_| "No se pudo reservar el lote")?;
    let dir = temporary.path().to_path_buf();
    let payload = dir.join("payload.zip");
    let mut zip = zip::ZipWriter::new(
        fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&payload)
            .map_err(|_| "No se pudo preparar el archivo agrupado")?,
    );
    let options =
        zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored);
    let mut rows = vec![];
    let mut used = BTreeSet::new();
    let mut total = 0u64;
    for (relative, item) in prepared {
        let (name, _, bytes) = item.render()?.batch_payload();
        let parent = Path::new(&relative).parent().unwrap_or(Path::new(""));
        let mut target = parent.join(name).to_string_lossy().replace('\\', "/");
        let base = target.clone();
        let mut n = 2;
        while !used.insert(portable_paths::key(&target)) {
            let path = Path::new(&base);
            target = format!(
                "{} ({}).{}",
                path.with_extension("").to_string_lossy(),
                n,
                path.extension().and_then(|s| s.to_str()).unwrap_or("pdf")
            );
            n += 1;
        }
        total = total.saturating_add(bytes.len() as u64);
        if total + retained > 1024 * 1024 * 1024 || total > 480 * 1024 * 1024 {
            return Err("El lote supera480MiB; selecciona menos documentos".into());
        }
        zip.start_file(&target, options)
            .map_err(|_| "No se pudo preparar una entrada")?;
        zip.write_all(&bytes)
            .map_err(|_| "Archivo agrupado incompleto")?;
        rows.push(Row {
            source: relative,
            filename: target,
            bytes: bytes.len() as u64,
            sha256: sha256_hex(&bytes),
        });
    }
    for (path, bytes) in resources {
        if !used.insert(portable_paths::key(&path)) {
            return Err(
                "Un recurso colisiona con un documento exportado; se conserva la fuente".into(),
            );
        }
        total = total.saturating_add(bytes.len() as u64);
        if total + retained > 1024 * 1024 * 1024 || total > 480 * 1024 * 1024 {
            return Err("El lote y sus recursos superan480MiB".into());
        }
        zip.start_file(path, options)
            .map_err(|_| "Recurso no preparado")?;
        zip.write_all(&bytes).map_err(|_| "Recurso incompleto")?;
    }
    zip.start_file("knownext-export-manifest.json", options)
        .map_err(|_| "No se pudo preparar el manifiesto")?;
    zip.write_all(&serde_json::to_vec(&json!({"format":"knownext.document-exports","schemaVersion":1,"documents":rows,"frozen":true})).map_err(|_|"Manifiesto no representable")?).map_err(|_|"Manifiesto incompleto")?;
    let file = zip.finish().map_err(|_| "El lote no se pudo finalizar")?;
    file.sync_all()
        .map_err(|_| "El lote no se pudo confirmar en disco")?;
    drop(file);
    let (hash, archive_bytes) = file_hash(&payload, 512 * 1024 * 1024)?;
    let revision = sha256_hex(
        &serde_json::to_vec(&json!([project, id, hash, rows]))
            .map_err(|_| "Revisión no representable")?,
    );
    let job = Job {
        schema_version: 1,
        id,
        project_id: project.into(),
        revision,
        phase: "prepared".into(),
        format: q.format,
        profile_name: profile.map(|p| p.name),
        rows,
        archive_sha256: hash,
        archive_bytes,
        checked_at: knownext_core::now_iso(),
    };
    let encoded=serde_json::to_vec(&job).map_err(|_|"Revisión no representable")?;
    if retained.saturating_add(archive_bytes).saturating_add(encoded.len() as u64)>recovery_quotas::EXPORT_BATCH_BYTES {return Err("Las preparaciones alcanzan1GiB; conserva o retira las conocidas".into());}
    atomic_io::create(
        &dir.join("review.json"),
        &encoded,
    )
    .map_err(|_| "No se pudo conservar la revisión del lote")?;
    let target = folder(source, &job.id)?;
    let staged = temporary.keep();
    atomic_io::rename_no_replace(&staged, &target)
        .map_err(|_| "La preparación no está confirmada; consulta sin repetir")?;
    ok(public(&job))
}
impl LocalApi {
    pub fn export_batch_status(&self, id: &str) -> Result<Value, String> {
        let mut j = load(self, id)?;
        if j.phase == "picking"
            && !self
                .batch_deliveries
                .lock()
                .map_err(|_| "No se puede comprobar la entrega")?
                .contains(id)
        {
            j.phase = "uncertain".into();
        }
        Ok(public(&j))
    }
    pub(crate) fn export_batch_catalog(&self, p: &str) -> Result<Value, String> {
        self.project_root(p)?;
        let d = self.app_data_dir.join("export-batches");
        let mut rows = vec![];
        if d.exists() {
            let m = fs::symlink_metadata(&d).map_err(|_| "Lotes no disponibles")?;
            if !m.is_dir() || batch::linked(&m) {
                return Err("Carpeta de lotes no regular".into());
            }
            for e in fs::read_dir(d)
                .map_err(|_| "Lotes no disponibles")?
                .take(2048)
            {
                let name = e
                    .map_err(|_| "Lote no accesible")?
                    .file_name()
                    .to_string_lossy()
                    .into_owned();
                if name.starts_with("prepare-") {
                    continue;
                }
                let j = load(self, &name)?;
                if j.project_id == p && j.phase != "discarded" {
                    rows.push(public(&j));
                }
            }
        }
        rows.sort_by(|a, b| b["checkedAt"].as_str().cmp(&a["checkedAt"].as_str()));
        Ok(
            json!({"schemaVersion":1,"projectId":p,"items":rows,"checkedAt":knownext_core::now_iso()}),
        )
    }
    pub fn begin_export_batch_delivery(
        &self,
        id: &str,
        revision: &str,
        cache: &Path,
    ) -> Result<BatchDelivery, String> {
        let mut j = load(self, id)?;
        if j.revision != revision || !matches!(j.phase.as_str(), "prepared" | "cancelled") {
            return Err(
                "El lote ya se entregó o requiere comprobar su resultado; no se repite la entrega"
                    .into(),
            );
        }
        let payload = folder(self, id)?.join("payload.zip");
        let (hash, size) = file_hash(&payload, 512 * 1024 * 1024)?;
        if size != j.archive_bytes || hash != j.archive_sha256 {
            return Err("El lote cambió; no se entrega".into());
        }
        let staged = export_execution::stage_user_export_file(
            &payload,
            "Documentos-knownext.zip".into(),
            cache,
        )?;
        j.phase = "picking".into();
        store(self, &j)?;
        self.batch_deliveries
            .lock()
            .map_err(|_| "No se pudo registrar la entrega")?
            .insert(id.into());
        Ok(BatchDelivery {
            staged,
            _lease: BatchLease {
                active: self.batch_deliveries.clone(),
                id: id.into(),
            },
        })
    }
    pub fn finish_export_batch_delivery(
        &self,
        id: &str,
        result: Result<Value, String>,
    ) -> Result<Value, String> {
        let mut j = load(self, id)?;
        if j.phase != "picking" {
            return Err("La entrega no corresponde a una preparación activa".into());
        }
        j.phase = match &result {
            Ok(v) if v["status"] == "saved" => "saved",
            Ok(v) if v["status"] == "cancelled" => "cancelled",
            _ => "uncertain",
        }
        .into();
        j.checked_at = knownext_core::now_iso();
        store(self, &j)?;
        let mut v = public(&j);
        if let Ok(r) = result {
            v["delivery"] = r;
        }
        Ok(v)
    }
    pub(crate) fn discard_export_batch(&self, id: &str, body: Value) -> Result<Value, String> {
        #[derive(Deserialize)]
        #[serde(deny_unknown_fields)]
        struct Input {
            revision: String,
            acknowledge: bool,
        }
        let q: Input =
            serde_json::from_value(body).map_err(|_| "Revisa el lote antes de quitarlo")?;
        let mut j = load(self, id)?;
        if !q.acknowledge
            || q.revision != j.revision
            || j.phase == "picking"
                && self
                    .batch_deliveries
                    .lock()
                    .map_err(|_| "Entrega no verificable")?
                    .contains(id)
        {
            return Err(
                "El lote cambió o su entrega está pendiente; consulta antes de quitarlo".into(),
            );
        }
        if j.phase != "discarded" {
            let file = folder(self, id)?.join("payload.zip");
            let present = match fs::symlink_metadata(&file) {
                Ok(_) => true,
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => false,
                Err(_) => return Err("La preparación no se puede comprobar; se conserva".into()),
            };
            if present {
                let (hash, _) = file_hash(&file, 512 * 1024 * 1024)?;
                if hash != j.archive_sha256 {
                    return Err("El archivo cambió; se conserva".into());
                }
            }
            if present {
                fs::remove_file(file)
                    .map_err(|_| "Retirada sin confirmar; consulta antes de repetir")?;
            }
            j.phase = "discarded".into();
            store(self, &j)?;
        }
        Ok(public(&j))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture() -> (tempfile::TempDir, LocalApi, String, String) {
        let d = tempfile::tempdir().unwrap();
        let a = LocalApi::new(d.path().join("state"), "qa".into(), "test".into());
        let p = a
            .create_project(json!({"name":"Batch QA","versioningMode":"none","syncMode":"none"}))
            .unwrap()["id"]
            .as_str()
            .unwrap()
            .to_owned();
        let root = a.project_root(&p).unwrap();
        fs::write(
            root.join("a.md"),
            "# Informe\n\n## Sección\n\nContenido íntegro ñ.\n",
        )
        .unwrap();
        let id = doc_id(&p, "a.md");
        (d, a, p, id)
    }
    #[test] fn portability_block_new_preparations_respect_budget_inventory_and_retained_identity(){
        let (_d,a,p,id)=fixture();let view=a.handle("GET","/api/recovery/storage",Value::Null,vec![]).unwrap().body;
        let policy=a.handle("PUT","/api/recovery/storage/policy",json!({"revision":view["policy"]["revision"],"enabled":true,"maxBytes":64*1024*1024}),vec![]).unwrap();assert_eq!(policy.status,200);
        let m=Mutex::new(a.clone());let input=json!({"documents":[{"id":id}],"format":"md"});assert!(dispatch_export_batch(&m,&a,&p,input.clone()).unwrap_err().contains("presupuesto"));
        let view=a.handle("GET","/api/recovery/storage",Value::Null,vec![]).unwrap().body;
        assert_eq!(a.handle("PUT","/api/recovery/storage/policy",json!({"revision":view["policy"]["revision"],"enabled":false,"maxBytes":64*1024*1024}),vec![]).unwrap().status,200);
        let j=dispatch_export_batch(&m,&a,&p,input).unwrap().body;let view=a.handle("GET","/api/recovery/storage",Value::Null,vec![]).unwrap().body;assert!(view["items"].as_array().unwrap().iter().any(|x|x["family"]=="export-batches"&&x["bytes"].as_u64().unwrap()>0));
        let quota=a.handle("GET","/api/recovery/storage/quotas",Value::Null,vec![]).unwrap().body;let row=quota["items"].as_array().unwrap().iter().find(|x|x["family"]=="export-batches").unwrap();assert_eq!(row["entries"],1);assert_eq!(row["maxEntries"],2048);assert_eq!(row["idsRetainedOnPayloadRetirement"],true);
        a.discard_export_batch(j["id"].as_str().unwrap(),json!({"revision":j["revision"],"acknowledge":true})).unwrap();let quota=a.handle("GET","/api/recovery/storage/quotas",Value::Null,vec![]).unwrap().body;assert_eq!(quota["items"].as_array().unwrap().iter().find(|x|x["family"]=="export-batches").unwrap()["entries"],1);
        assert!(recovery_quotas::TRANSFER_BYTES>=512*1024*1024+1024*1024*1024);
    }
    #[test]
    fn portability_block_batch_freezes_content_delivers_once_and_keeps_sources() {
        let (d, a, p, id) = fixture();
        let mutations = Mutex::new(a.clone());
        let job = dispatch_export_batch(
            &mutations,
            &a,
            &p,
            json!({"documents":[{"id":id}],"format":"md","profileId":null}),
        )
        .unwrap()
        .body;
        let batch = job["id"].as_str().unwrap();
        let revision = job["revision"].as_str().unwrap();
        let root = a.project_root(&p).unwrap();
        fs::write(root.join("a.md"), "Later local typing").unwrap();
        let payload = folder(&a, batch).unwrap().join("payload.zip");
        let mut zip = zip::ZipArchive::new(fs::File::open(&payload).unwrap()).unwrap();
        let mut text = String::new();
        zip.by_name("a.md")
            .unwrap()
            .read_to_string(&mut text)
            .unwrap();
        assert!(text.contains("Contenido íntegro"));
        assert!(!text.contains("Later"));
        let cache = d.path().join("cache");
        fs::create_dir(&cache).unwrap();
        let delivery = a
            .begin_export_batch_delivery(batch, revision, &cache)
            .unwrap();
        assert!(a
            .begin_export_batch_delivery(batch, revision, &cache)
            .is_err());
        let output = d.path().join("documents.zip");
        a.deliver_export_batch_file(&delivery.staged.path, &output)
            .unwrap();
        let done = a
            .finish_export_batch_delivery(batch, Ok(json!({"status":"saved"})))
            .unwrap();
        drop(delivery);
        assert_eq!(done["phase"], "saved");
        assert!(a
            .begin_export_batch_delivery(batch, revision, &cache)
            .is_err());
        a.discard_export_batch(batch, json!({"revision":revision,"acknowledge":true}))
            .unwrap();
        assert_eq!(
            fs::read_to_string(root.join("a.md")).unwrap(),
            "Later local typing"
        );
        assert!(output.exists());
        assert!(!payload.exists());
    }
    #[test]
    fn portability_block_profiles_cover_contents_and_failed_prepare_do_not_poison_catalog() {
        let (_d, a, p, id) = fixture();
        a.change_export_profiles(json!({"revision":null,"action":"capture","id":"export-profile-owned","name":"Entrega","cover":true,"contents":true})).unwrap();
        a.update_export_template(json!({"name":"basic"})).unwrap();
        let source = a.read_export_template_checked().unwrap();
        let mutations = Mutex::new(a.clone());
        let job = dispatch_export_batch(
            &mutations,
            &a,
            &p,
            json!({"documents":[{"id":id}],"format":"docx","profileId":"export-profile-owned"}),
        )
        .unwrap()
        .body;
        let folder = folder(&a, job["id"].as_str().unwrap()).unwrap();
        let mut archive =
            zip::ZipArchive::new(fs::File::open(folder.join("payload.zip")).unwrap()).unwrap();
        let mut docx = vec![];
        archive
            .by_name("a.docx")
            .unwrap()
            .read_to_end(&mut docx)
            .unwrap();
        let mut parts = zip::ZipArchive::new(std::io::Cursor::new(docx)).unwrap();
        let mut xml = String::new();
        parts
            .by_name("word/document.xml")
            .unwrap()
            .read_to_string(&mut xml)
            .unwrap();
        assert!(xml.contains("w:type=\"page\""));
        assert!(xml.contains("Índice de títulos"));
        assert!(xml.contains("Contenido íntegro"));
        assert_eq!(a.read_export_template_checked().unwrap(), source);
        assert!(dispatch_export_batch(
            &mutations,
            &a,
            &p,
            json!({"documents":[{"id":"other::a.md"}],"format":"pdf"})
        )
        .is_err());
        assert_eq!(
            a.export_batch_catalog(&p).unwrap()["items"]
                .as_array()
                .unwrap()
                .len(),
            1
        );
    }
    #[test]
    fn portability_block_markdown_resources_are_complete_or_fail_without_a_batch() {
        let (_d, a, p, id) = fixture();
        let root = a.project_root(&p).unwrap();
        fs::write(root.join("pic.png"), b"owned image bytes").unwrap();
        let source = "# Local\n\n![Imagen](pic.png)\n";
        fs::write(root.join("a.md"), source).unwrap();
        let m = Mutex::new(a.clone());
        let j = dispatch_export_batch(&m, &a, &p, json!({"documents":[{"id":id}],"format":"md"}))
            .unwrap()
            .body;
        let mut zip = zip::ZipArchive::new(
            fs::File::open(
                folder(&a, j["id"].as_str().unwrap())
                    .unwrap()
                    .join("payload.zip"),
            )
            .unwrap(),
        )
        .unwrap();
        let mut image = vec![];
        zip.by_name("pic.png")
            .unwrap()
            .read_to_end(&mut image)
            .unwrap();
        assert_eq!(image, b"owned image bytes");
        for text in [
            "![remote](https://example.invalid/pic.png)",
            "![internal](http://knownext-asset.localhost/source/pic.png)",
            "![missing](missing.png)",
        ] {
            fs::write(root.join("a.md"), text).unwrap();
            assert!(dispatch_export_batch(
                &m,
                &a,
                &p,
                json!({"documents":[{"id":id}],"format":"md"})
            )
            .is_err());
        }
        assert_eq!(
            a.export_batch_catalog(&p).unwrap()["items"]
                .as_array()
                .unwrap()
                .len(),
            1
        );
    }
    #[test]
    fn portability_block_orphan_delivery_is_observed_unknown_without_reopening_picker() {
        let (_d, a, p, id) = fixture();
        let mutations = Mutex::new(a.clone());
        let j = dispatch_export_batch(
            &mutations,
            &a,
            &p,
            json!({"documents":[{"id":id}],"format":"md"}),
        )
        .unwrap()
        .body;
        let id = j["id"].as_str().unwrap();
        let mut receipt = load(&a, id).unwrap();
        receipt.phase = "picking".into();
        store(&a, &receipt).unwrap();
        assert_eq!(a.export_batch_status(id).unwrap()["phase"], "uncertain");
        assert_eq!(load(&a, id).unwrap().phase, "picking");
    }
}
