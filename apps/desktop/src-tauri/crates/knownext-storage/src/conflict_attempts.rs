//! Bounded receipts bind one client attempt to preserved copies and a draft postcondition.
//! Reading never resumes a write or repairs an interrupted attempt.
use super::*;
use std::{fs, io::Read};
mod recovery;
mod portable;
mod retention;
mod retirement;
const MAX_RECORD: u64 = 64 * 1024;
const MAX_RECORDS: usize = recovery_quotas::CONFLICT_RECORDS;
const MAX_TOTAL: u64 = recovery_quotas::CONFLICT_BYTES;
const COPY_BUDGET: u64 = 128 * 1024 * 1024;
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CopyProof {
    key: String,
    content_hash: String,
    manifest_hash: String,
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Record {
    schema_version: u8,
    id: String,
    document_id: String,
    kind: String,
    operation_id: String,
    request_hash: String,
    created_at: String,
    phase: String,
    copies: Vec<CopyProof>,
    target_prepared: bool,
    after_draft_revision: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    archived_at: Option<String>,
    #[serde(skip)]
    revision: Option<String>,
}
pub(crate) struct Attempt {
    record: Record,
}
fn hash(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}
fn identity(id: &str) -> Result<(), String> {
    if !id.starts_with("attempt-")
        || id.len() < 16
        || id.len() > 120
        || !request_scope::portable_id(id)
    {
        return Err("Identificador de intento de combinación no compatible".into());
    }
    Ok(())
}
fn directory(path: &Path) -> Result<(), String> {
    match fs::symlink_metadata(path) {
        Ok(meta) if meta.is_dir() && !batch::linked(&meta) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        _ => Err(
            "Los recibos de combinación requieren una carpeta regular; se conservan sin cambios"
                .into(),
        ),
    }
}
fn path(api: &LocalApi, id: &str) -> Result<PathBuf, String> {
    identity(id)?;
    directory(&api.app_data_dir)?;
    let root = api.app_data_dir.join("conflict-attempts");
    directory(&root)?;
    let target=root.join(format!("{id}.json"));recovery_lifecycle::ensure_open(api,&target)?;Ok(target)
}
fn validate(record: &Record) -> Result<(), String> {
    identity(&record.id)?;
    document_ref(&record.document_id)?;
    if record.schema_version != 1
        || !matches!(record.kind.as_str(), "markdown" | "handwritten")
        || !record.operation_id.starts_with("conflict-")
        || !request_scope::portable_id(&record.operation_id)
        || !hash(&record.request_hash)
        || !matches!(
            record.phase.as_str(),
            "preparing" | "ready" | "applying" | "completed"
        )
        || record.copies.len() > 4
        || record
            .after_draft_revision
            .as_deref()
            .is_some_and(|value| !hash(value))
    {
        return Err("El recibo tiene un formato o versión no compatible; se conserva".into());
    }
    OffsetDateTime::parse(&record.created_at, &Rfc3339)
        .map_err(|_| "La fecha del recibo no es válida")?;
    if let Some(date) = &record.archived_at {
        OffsetDateTime::parse(date, &Rfc3339)
            .map_err(|_| "La fecha de archivo del recibo no es válida")?;
        if record.phase != "completed" {
            return Err(
                "Un recibo pendiente no puede estar archivado; se conserva para revisión".into(),
            );
        }
    }
    let mut keys = BTreeSet::new();
    for copy in &record.copies {
        if !copy.key.starts_with("recovery-")
            || copy.key.len() > 120
            || !request_scope::portable_id(&copy.key)
            || !keys.insert(&copy.key)
            || !hash(&copy.content_hash)
            || !hash(&copy.manifest_hash)
        {
            return Err("El recibo contiene copias incompatibles; se conserva".into());
        }
    }
    if record.phase == "preparing" && (!record.copies.is_empty() || record.target_prepared)
        || record.phase != "preparing" && !matches!(record.copies.len(), 3 | 4)
        || record.target_prepared != matches!(record.phase.as_str(), "applying" | "completed")
        || !record.target_prepared && record.after_draft_revision.is_some()
    {
        return Err("El estado del recibo no es coherente; se conserva sin reanudar".into());
    }
    Ok(())
}
fn read(api: &LocalApi, id: &str) -> Result<Option<Record>, String> {
    let mut budget = MAX_RECORD;
    read_budgeted(api, id, &mut budget)
}
fn read_budgeted(api: &LocalApi, id: &str, budget: &mut u64) -> Result<Option<Record>, String> {
    let file = path(api, id)?;
    let meta = match fs::symlink_metadata(&file) {
        Ok(meta) => meta,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(_) => return Err("No se puede consultar el recibo de combinación".into()),
    };
    if !meta.is_file() || batch::linked(&meta) || meta.len() > MAX_RECORD {
        return Err("El recibo no es regular o supera 64 KiB; se conserva".into());
    }
    if meta.len() > *budget {
        return Err(
            "El recibo supera el presupuesto restante de esta revisión; se conserva".into(),
        );
    }
    let mut bytes = vec![];
    fs::File::open(&file)
        .map_err(|_| "No se pudo leer el recibo")?
        .take((MAX_RECORD + 1).min(budget.saturating_add(1)))
        .read_to_end(&mut bytes)
        .map_err(|_| "No se pudo completar la lectura del recibo")?;
    let exhausted = bytes.len() as u64 > *budget;
    *budget = budget.saturating_sub(bytes.len() as u64);
    if bytes.len() as u64 > MAX_RECORD || exhausted {
        return Err("El recibo creció fuera del límite; se conserva".into());
    }
    let mut record: Record = serde_json::from_slice(&bytes).map_err(|_| {
        "Recibo ilegible, futuro o con campos desconocidos; se conserva sin reanudar"
    })?;
    validate(&record)?;
    if record.id != id {
        return Err("La identidad del recibo no coincide".into());
    }
    record.revision = Some(sha256_hex(&bytes));
    Ok(Some(record))
}
fn write(api: &LocalApi, record: &mut Record) -> Result<(), String> {
    validate(record)?;
    let file = path(api, &record.id)?;
    let bytes = serde_json::to_vec(record).map_err(|_| "No se pudo preparar el recibo")?;
    if bytes.len() as u64 > MAX_RECORD {
        return Err("El recibo supera su límite; se conserva el último estado confirmado".into());
    }
    if let Some(expected) = &record.revision {
        if read(api, &record.id)?
            .and_then(|record| record.revision)
            .as_ref()
            != Some(expected)
        {
            return Err("El recibo cambió desde su lectura; no se repite la combinación".into());
        }
        atomic_io::write(&file,&bytes).map_err(|_|"No se confirmó el recibo; las copias y el borrador necesitan revisión, sin repetir el intento")?;
    } else {
        atomic_io::create(&file, &bytes)
            .map_err(|_| "No se pudo reservar un intento nuevo; no se ha sustituido otro")?;
    }
    record.revision = Some(sha256_hex(&bytes));
    Ok(())
}
fn request_hash(request: &Value) -> Result<String, String> {
    fn canonical(value: &Value) -> Value {
        match value {
            Value::Array(items) => Value::Array(items.iter().map(canonical).collect()),
            Value::Object(fields) => {
                let sorted = fields.iter().collect::<BTreeMap<_, _>>();
                Value::Object(
                    sorted
                        .into_iter()
                        .map(|(key, value)| (key.clone(), canonical(value)))
                        .collect(),
                )
            }
            _ => value.clone(),
        }
    }
    Ok(sha256_hex(
        &serde_json::to_vec(&canonical(request))
            .map_err(|_| "No se pudo identificar el intento")?,
    ))
}
fn quota(root: &Path) -> Result<(), String> {
    let entries = match fs::read_dir(root) {
        Ok(entries) => entries,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(_) => return Err("No se puede revisar el almacén de recibos".into()),
    };
    let mut total = 0;
    let start = std::time::Instant::now();
    for (index, entry) in entries.enumerate() {
        if index >= MAX_RECORDS - 1 || start.elapsed() > Duration::from_secs(2) {
            return Err("El almacén de recibos alcanzó su presupuesto de revisión. Se conserva; no comienza otra combinación".into());
        }
        let meta = fs::symlink_metadata(
            entry
                .map_err(|_| "No se puede revisar un recibo conservado")?
                .path(),
        )
        .map_err(|_| "No se puede comprobar un recibo conservado")?;
        if !meta.is_file() || batch::linked(&meta) {
            return Err(
                "El almacén contiene entradas no regulares; se conserva sin aplicar".into(),
            );
        }
        if meta.len() > (MAX_TOTAL - MAX_RECORD).saturating_sub(total) {
            return Err(
                "El almacén de recibos supera su cuota de 16 MiB; se conserva sin aplicar".into(),
            );
        }
        total += meta.len();
    }
    Ok(())
}
pub(crate) fn begin(
    api: &LocalApi,
    document: &str,
    kind: &str,
    request: &Value,
) -> Result<Option<Attempt>, String> {
    let Some(id) = request["attemptId"].as_str() else {
        return Ok(None);
    };
    identity(id)?;
    if read(api, id)?.is_some() {
        return Err(
            "Ese intento ya tiene un recibo. Consúltalo; no se vuelve a ejecutar ni se sustituye"
                .into(),
        );
    }
    let root = api.app_data_dir.join("conflict-attempts");
    directory(&root)?;
    let _budget=recovery_inventory::admit(api,MAX_RECORD)?;
    quota(&root)?;
    if !root.exists() {
        fs::create_dir(&root).map_err(|_| "No se pudo preparar el almacén de recibos")?;
    }
    directory(&root)?;
    let mut record = Record {
        schema_version: 1,
        id: id.into(),
        document_id: document.into(),
        kind: kind.into(),
        operation_id: knownext_core::compact_id("conflict"),
        request_hash: request_hash(request)?,
        created_at: knownext_core::now_iso(),
        phase: "preparing".into(),
        copies: vec![],
        target_prepared: false,
        after_draft_revision: None,
        archived_at: None,
        revision: None,
    };
    write(api, &mut record)?;
    Ok(Some(Attempt { record }))
}
impl Attempt {
    pub(crate) fn operation_id(&self) -> &str {
        &self.record.operation_id
    }
    pub(crate) fn ready(&mut self, api: &LocalApi, keys: &[String]) -> Result<(), String> {
        let mut budget = COPY_BUDGET;
        let mut proofs = vec![];
        for key in keys {
            let (content_hash, manifest_hash) = api.verified_conflict_copy(
                key,
                &self.record.document_id,
                &self.record.operation_id,
                &mut budget,
            )?;
            proofs.push(CopyProof {
                key: key.clone(),
                content_hash,
                manifest_hash,
            });
        }
        self.record.copies = proofs;
        self.record.phase = "ready".into();
        write(api, &mut self.record)
    }
    pub(crate) fn applying(
        &mut self,
        api: &LocalApi,
        target: &Option<Value>,
    ) -> Result<(), String> {
        self.record.after_draft_revision = document_conflicts::draft_revision(target)?;
        self.record.target_prepared = true;
        self.record.phase = "applying".into();
        write(api, &mut self.record)
    }
    pub(crate) fn complete(&mut self, api: &LocalApi) -> Result<(), String> {
        if document_conflicts::draft_revision(&api.read_draft(&self.record.document_id)?)?
            != self.record.after_draft_revision
        {
            return Err(
                "El borrador cambió antes de confirmar el recibo; revisa el intento sin repetirlo"
                    .into(),
            );
        }
        verify_copies(api, &self.record)?;
        self.record.phase = "completed".into();
        write(api, &mut self.record)
    }
}
fn verify_copies(api: &LocalApi, record: &Record) -> Result<(), String> {
    let mut budget = COPY_BUDGET;
    for copy in &record.copies {
        let (content, manifest) = api.verified_conflict_copy(
            &copy.key,
            &record.document_id,
            &record.operation_id,
            &mut budget,
        )?;
        if content != copy.content_hash || manifest != copy.manifest_hash {
            return Err(
                "Una copia o su registro cambió; el intento se conserva sin atribuir confirmación"
                    .into(),
            );
        }
    }
    Ok(())
}
pub(crate) fn observe(
    api: &LocalApi,
    document: &str,
    kind: &str,
    id: &str,
    request: &Value,
    current: &Value,
) -> Result<Value, String> {
    let Some(record) = read(api, id)? else {
        return Ok(json!({"status":"absent","attemptId":id,"checkedAt":knownext_core::now_iso()}));
    };
    if record.document_id != document
        || record.kind != kind
        || record.request_hash != request_hash(request)?
    {
        return Err("El recibo no corresponde a este documento, contenido o revisión".into());
    }
    if !record.target_prepared {
        return Ok(
            json!({"status":"pending","attemptId":id,"phase":record.phase,"checkedAt":knownext_core::now_iso()}),
        );
    }
    verify_copies(api, &record)?;
    if current["locationRevision"] != request["locationRevision"]
        || current["diskFingerprint"] != request["diskFingerprint"]
        || current["draftRevision"] != json!(record.after_draft_revision)
    {
        return Ok(json!({"status":"changed","attemptId":id,"checkedAt":knownext_core::now_iso()}));
    }
    let value = if kind == "markdown" {
        api.get_document(document)?
    } else {
        api.get_handwritten_note(document)?
    };
    let last = if kind == "markdown" {
        api.review_document_conflict(document)?
    } else {
        api.review_handwritten_conflict(document)?
    };
    if last["locationRevision"] != current["locationRevision"]
        || last["diskFingerprint"] != current["diskFingerprint"]
        || last["draftRevision"] != current["draftRevision"]
        || read(api, id)?.and_then(|record| record.revision) != record.revision
    {
        return Err("El estado cambió durante la confirmación del intento; vuelve a consultar sin repetirlo".into());
    }
    let result = json!({"id":record.operation_id,"attemptId":id,"preservedCopies":record.copies.iter().map(|copy|&copy.key).collect::<Vec<_>>(),"sourceUnchanged":true,"document":if kind=="markdown"{value.clone()}else{Value::Null},"note":if kind=="handwritten"{value}else{Value::Null},"historySource":request["historySource"],"remoteSource":request["remoteSource"],"checkedAt":knownext_core::now_iso()});
    Ok(
        json!({"status":"confirmed","attemptId":id,"result":result,"checkedAt":knownext_core::now_iso()}),
    )
}

impl LocalApi { pub(crate) fn lifecycle_conflict_record(&self,raw:&[u8])->bool{serde_json::from_slice::<Record>(raw).is_ok_and(|record|validate(&record).is_ok()&&record.phase=="completed"&&retirement::present(self,&record.id).unwrap_or(false)&&self.review_conflict_payloads(&record.id).is_ok_and(|v|v["phase"]=="retired"))} }
