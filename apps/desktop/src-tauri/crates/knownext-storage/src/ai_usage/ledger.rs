//! Atomic recent detail plus lifetime local period aggregates. Legacy bytes are preserved first.
use super::*;
use std::{
    fs,
    io::{Read, Write},
};

pub(super) const MAX_BYTES: u64 = 64 * 1024 * 1024;
const MAX_GROUPS: usize = 20_000;
const MAX_RECENT: usize = 5000;
const BACKUP_BYTES: u64 = 128 * 1024 * 1024;

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Period {
    pub(super) project_id: Option<String>,
    pub(super) month: Option<String>,
    pub(super) model: String,
    pub(super) capability: String,
    pub(super) usage: AiUsageAccumulator,
    pub(super) legacy_entries: u64,
    pub(super) unpriced_entries: u64,
    pub(super) estimated_cost_usd: f64,
}
impl Period {
    fn key(&self) -> (Option<String>, Option<String>, String, String) {
        (
            self.project_id.clone(),
            self.month.clone(),
            self.model.clone(),
            self.capability.clone(),
        )
    }
    fn for_entry(entry: &Value) -> Self {
        Self {
            project_id: entry["projectId"].as_str().map(str::to_owned),
            month: entry_month(entry).map(str::to_owned),
            model: entry["model"].as_str().unwrap_or("unknown").into(),
            capability: normalize_usage_capability(
                entry["capability"].as_str().unwrap_or("document_ai"),
            )
            .into(),
            usage: AiUsageAccumulator::default(),
            legacy_entries: 0,
            unpriced_entries: 0,
            estimated_cost_usd: 0.0,
        }
    }
    fn add(&mut self, entry: &Value) -> Result<(), String> {
        accumulate_usage(&mut self.usage, entry)?;
        if entry["costSchemaVersion"] != 2 {
            self.legacy_entries = add_counter(self.legacy_entries, 1)?;
        } else {
            self.estimated_cost_usd =
                add_money(self.estimated_cost_usd, money(entry, "estimatedCostUsd")?)?;
            if entry["estimatedCostEur"].is_null() {
                self.unpriced_entries = add_counter(self.unpriced_entries, 1)?;
            }
        }
        Ok(())
    }
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Ledger {
    schema_version: u8,
    created_at: String,
    initial_revision: String,
    legacy_window_only: bool,
    recorded_entries: u64,
    entries: Vec<Value>,
    periods: Vec<Period>,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    receipts: BTreeMap<String, String>,
    checksum: String,
}
pub(super) struct Prepared {
    pub(super) value: Value,
    revision: String,
}
struct HashWriter(Sha256);
impl Write for HashWriter {
    fn write(&mut self, buffer: &[u8]) -> std::io::Result<usize> {
        self.0.update(buffer);
        Ok(buffer.len())
    }
    fn flush(&mut self) -> std::io::Result<()> {
        Ok(())
    }
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Payload<'a> {
    schema_version: u8,
    created_at: &'a str,
    initial_revision: &'a str,
    legacy_window_only: bool,
    recorded_entries: u64,
    entries: &'a [Value],
    periods: &'a [Period],
    #[serde(skip_serializing_if = "BTreeMap::is_empty")]
    receipts: &'a BTreeMap<String, String>,
}
fn checksum(ledger: &Ledger) -> Result<String, String> {
    let payload = Payload {
        schema_version: ledger.schema_version,
        created_at: &ledger.created_at,
        initial_revision: &ledger.initial_revision,
        legacy_window_only: ledger.legacy_window_only,
        recorded_entries: ledger.recorded_entries,
        entries: &ledger.entries,
        periods: &ledger.periods,
        receipts: &ledger.receipts,
    };
    let mut writer = HashWriter(Sha256::new());
    serde_json::to_writer(&mut writer, &payload)
        .map_err(|_| "No se puede verificar el registro por periodos")?;
    Ok(format!("{:x}", writer.0.finalize()))
}
fn serialized_revision(value: &Value) -> Result<String, String> {
    let mut writer = HashWriter(Sha256::new());
    serde_json::to_writer_pretty(&mut writer, value)
        .map_err(|_| "No se puede verificar el formato escrito de consumo")?;
    Ok(format!("{:x}", writer.0.finalize()))
}
fn is_digest(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(|b| b.is_ascii_hexdigit())
}
fn decode(value: &Value) -> Result<Ledger, String> {
    let ledger: Ledger = serde_json::from_value(value.clone())
        .map_err(|_| "Formato de consumo por periodos no compatible; se conserva")?;
    if ledger.schema_version != 2
        || ledger.entries.len() > MAX_RECENT
        || ledger.periods.len() > MAX_GROUPS
        || ledger.receipts.len() > 100_000
        || ledger.receipts.len() as u64 > ledger.recorded_entries
        || ledger.receipts.iter().any(|(id, digest)| !is_digest(id) || !is_digest(digest))
        || ledger.recorded_entries > MAX_COUNTER
        || ledger.recorded_entries < ledger.entries.len() as u64
        || !is_digest(&ledger.checksum)
        || ledger.checksum != checksum(&ledger)?
    {
        return Err(
            "Consumo por periodos incompleto o con checksum distinto; se conserva sin escribir"
                .into(),
        );
    }
    if ledger.initial_revision != "absent" && !is_digest(&ledger.initial_revision)
        || ledger.legacy_window_only != (ledger.initial_revision != "absent")
        || OffsetDateTime::parse(&ledger.created_at, &Rfc3339).is_err()
    {
        return Err("Origen del registro de consumo no compatible; se conserva".into());
    }
    let mut keys = BTreeSet::new();
    let mut interactions = 0;
    for entry in &ledger.entries {
        validate_usage_entry(entry)?;
    }
    for period in &ledger.periods {
        if !keys.insert(period.key())
            || period
                .project_id
                .as_deref()
                .is_some_and(|id| !request_scope::portable_id(id))
            || period
                .month
                .as_deref()
                .is_some_and(|month| !is_usage_month(month))
            || period.model.is_empty()
            || period.model.len() > 200
            || !matches!(
                period.capability.as_str(),
                "document_ai" | "image_generation" | "vision" | "audio" | "agentic_tasks"
            )
        {
            return Err("Identidad de periodo no compatible; se conserva".into());
        }
        let counts = [
            period.usage.interactions,
            period.usage.unpriced_entries,
            period.usage.input_tokens,
            period.usage.cached_input_tokens,
            period.usage.output_tokens,
            period.usage.reasoning_tokens,
            period.usage.embedding_tokens,
            period.usage.total_tokens,
            period.legacy_entries,
            period.unpriced_entries,
        ];
        if counts.iter().any(|count| *count > MAX_COUNTER)
            || period.usage.interactions == 0
            || period.usage.unpriced_entries
                != add_counter(period.legacy_entries, period.unpriced_entries)?
            || period.usage.unpriced_entries > period.usage.interactions
            || period.usage.usage_sources.len() > 64
            || period
                .usage
                .usage_sources
                .iter()
                .any(|source| source.len() > 64)
            || !period.estimated_cost_usd.is_finite()
            || period.estimated_cost_usd < 0.0
            || period.estimated_cost_usd > MAX_MONEY
            || !period.usage.estimated_cost.is_finite()
            || period.usage.estimated_cost < 0.0
            || period.usage.estimated_cost > MAX_MONEY
        {
            return Err("Totales de periodo no compatibles; se conservan".into());
        }
        interactions = add_counter(interactions, period.usage.interactions)?;
    }
    if interactions != ledger.recorded_entries {
        return Err("El inventario de periodos no coincide con su contador; se conserva".into());
    }
    Ok(ledger)
}
pub(super) fn validate(value: &Value) -> Result<(), String> {
    decode(value).map(|_| ())
}
pub(super) fn can_record(value: &Value) -> Result<(), String> {
    let ledger = decode(value)?;
    if ledger.periods.len() >= MAX_GROUPS || ledger.recorded_entries >= MAX_COUNTER || ledger.receipts.len() >= 100_000 {
        return Err("El consumo alcanza su límite de conservación; revisa el histórico antes de iniciar otra operación IA".into());
    }
    if serde_json::to_vec_pretty(value)
        .map_err(|_| "No se puede medir el consumo")?
        .len() as u64
        > MAX_BYTES - 1024 * 1024
    {
        return Err(
            "El consumo no tiene margen de conservación; no se inicia otro envío IA".into(),
        );
    }
    Ok(())
}
pub(super) fn periods(value: &Value) -> Result<Vec<Period>, String> {
    if value["schemaVersion"] == 2 {
        return Ok(decode(value)?.periods);
    }
    let mut groups = BTreeMap::new();
    for entry in value["entries"].as_array().into_iter().flatten() {
        let period = Period::for_entry(entry);
        if !groups.contains_key(&period.key()) && groups.len() >= MAX_GROUPS {
            return Err("El consumo supera el límite de periodos; se conserva".into());
        }
        groups.entry(period.key()).or_insert(period).add(entry)?;
    }
    Ok(groups.into_values().collect())
}
fn value(mut ledger: Ledger) -> Result<Value, String> {
    ledger.checksum = checksum(&ledger)?;
    let value =
        serde_json::to_value(ledger).map_err(|_| "No se puede preparar el consumo por periodos")?;
    validate(&value)?;
    if serde_json::to_vec_pretty(&value)
        .map_err(|_| "No se puede medir el consumo")?
        .len() as u64
        > MAX_BYTES
    {
        return Err("El registro por periodos supera64MiB; se conserva su fuente".into());
    }
    Ok(value)
}
fn snapshot(api: &LocalApi) -> Result<(Value, Option<Vec<u8>>), String> {
    ai_operational_state::snapshot(
        &api.app_data_dir,
        "usage",
        ai_operational_state::Store::Usage,
        json!({"entries":[]}),
    )
}
fn revision(bytes: Option<&[u8]>) -> String {
    bytes.map(sha256_hex).unwrap_or_else(|| "absent".into())
}
fn regular_folder(path: &Path, optional: bool) -> Result<(), String> {
    match fs::symlink_metadata(path) {
        Ok(meta) if meta.is_dir() && !batch::linked(&meta) => Ok(()),
        Err(error) if optional && error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        _ => Err(
            "La conservación de consumo requiere una carpeta regular; se conserva el registro"
                .into(),
        ),
    }
}
fn preserve(api: &LocalApi, bytes: &[u8]) -> Result<(), String> {
    let parent = api.app_data_dir.join("ai");
    regular_folder(&parent, false)?;
    let folder = parent.join("usage-migrations");
    regular_folder(&folder, true)?;
    if !folder.exists() {
        fs::create_dir(&folder).map_err(|_| "No se puede preparar la copia del consumo")?;
    }
    regular_folder(&folder, false)?;
    let target = folder.join(format!("legacy-{}.json", sha256_hex(bytes)));
    if target.exists() {
        let meta =
            fs::symlink_metadata(&target).map_err(|_| "No se puede consultar la copia anterior")?;
        if !meta.is_file() || batch::linked(&meta) || meta.len() != bytes.len() as u64 {
            return Err("La copia anterior no coincide; se conserva sin sustituir".into());
        }
        let mut existing = Vec::new();
        fs::File::open(&target)
            .map_err(|_| "No se puede abrir la copia anterior")?
            .take(bytes.len() as u64 + 1)
            .read_to_end(&mut existing)
            .map_err(|_| "No se pudo verificar la copia anterior")?;
        if existing == bytes {
            return Ok(());
        }
        return Err("La copia anterior tiene bytes distintos; se conserva".into());
    }
    let mut count = 0;
    let mut total = 0u64;
    for item in fs::read_dir(&folder).map_err(|_| "No se pueden revisar las copias anteriores")? {
        let item = item.map_err(|_| "Una copia anterior no está disponible")?;
        let meta = fs::symlink_metadata(item.path())
            .map_err(|_| "No se puede verificar una copia anterior")?;
        if !meta.is_file() || batch::linked(&meta) {
            return Err("Hay entradas no compatibles entre las copias; se conservan".into());
        }
        count += 1;
        total = total.saturating_add(meta.len());
        if count >= 16 || total.saturating_add(bytes.len() as u64) > BACKUP_BYTES {
            return Err(
                "Las copias de consumo alcanzan su límite; se conserva el original sin migrar"
                    .into(),
            );
        }
    }
    atomic_io::create(&target, bytes)
        .map_err(|_| "No se confirmó la copia original de consumo; no se migra")?;
    let mut verified = Vec::new();
    fs::File::open(&target)
        .map_err(|_| "No se puede verificar la copia")?
        .take(bytes.len() as u64 + 1)
        .read_to_end(&mut verified)
        .map_err(|_| "No se pudo verificar la copia completa")?;
    if verified != bytes {
        return Err("No coincide la copia completa; no se migra el registro".into());
    }
    Ok(())
}
fn write_reviewed(api: &LocalApi, expected: &str, new_value: &Value) -> Result<(), String> {
    if revision(snapshot(api)?.1.as_deref()) != expected {
        return Err(
            "El consumo cambió durante la preparación; se conserva el estado actual y su copia"
                .into(),
        );
    }
    api.write_json(&api.ai_usage_path(), new_value)
}
fn backup_verified(api: &LocalApi, digest: &str) -> bool {
    let parent = api.app_data_dir.join("ai");
    let folder = parent.join("usage-migrations");
    if regular_folder(&parent, false).is_err() || regular_folder(&folder, false).is_err() {
        return false;
    }
    let path = folder.join(format!("legacy-{digest}.json"));
    let Ok(meta) = fs::symlink_metadata(&path) else {
        return false;
    };
    if !meta.is_file() || batch::linked(&meta) || meta.len() > 32 * 1024 * 1024 {
        return false;
    }
    let Ok(file) = fs::File::open(path) else {
        return false;
    };
    let mut hash = HashWriter(Sha256::new());
    let Ok(size) = std::io::copy(&mut file.take(32 * 1024 * 1024 + 1), &mut hash) else {
        return false;
    };
    size == meta.len() && format!("{:x}", hash.0.finalize()) == digest
}
/// Called only while holding the shared usage gate.
pub(super) fn ensure_locked(api: &LocalApi, expected: Option<&str>) -> Result<Prepared, String> {
    let (current, bytes) = snapshot(api)?;
    let current_revision = revision(bytes.as_deref());
    if current["schemaVersion"] == 2 {
        let decoded = decode(&current)?;
        if expected.is_some_and(|expected| {
            expected != current_revision && expected != decoded.initial_revision
        }) {
            return Err("El consumo cambió; vuelve a revisar antes de convertir".into());
        }
        return Ok(Prepared {
            value: current,
            revision: current_revision,
        });
    }
    if expected.is_some_and(|expected| expected != current_revision) {
        return Err("El registro cambió desde la revisión; no se ha migrado".into());
    }
    let periods = periods(&current)?;
    let entries = current["entries"]
        .as_array()
        .ok_or("No se puede preparar el detalle de consumo")?
        .clone();
    let new_value = value(Ledger {
        schema_version: 2,
        created_at: knownext_core::now_iso(),
        initial_revision: current_revision.clone(),
        legacy_window_only: bytes.is_some(),
        recorded_entries: entries.len() as u64,
        entries,
        periods,
        receipts: BTreeMap::new(),
        checksum: String::new(),
    })?;
    if let Some(bytes) = bytes {
        preserve(api, &bytes)?;
    }
    write_reviewed(api, &current_revision, &new_value)?;
    let revision = serialized_revision(&new_value)?;
    Ok(Prepared {
        value: new_value,
        revision,
    })
}
pub(super) fn append(api: &LocalApi, current: Prepared, entry: Value) -> Result<(), String> {
    append_inner(api, current, entry, None)
}
pub(super) fn append_receipt(api: &LocalApi, current: Prepared, entry: Value, id: String, digest: String) -> Result<(), String> {
    append_inner(api, current, entry, Some((id, digest)))
}
pub(super) fn receipt_recorded(current: &Prepared, id: &str, digest: &str) -> Result<bool, String> {
    match decode(&current.value)?.receipts.get(id) {
        Some(existing) if existing == digest => Ok(true),
        Some(_) => Err("El recibo ya existe con otro contenido; se conservan ambos orígenes sin duplicar consumo".into()),
        None => Ok(false),
    }
}
fn append_inner(api: &LocalApi, current: Prepared, entry: Value, receipt: Option<(String, String)>) -> Result<(), String> {
    let current_revision = current.revision;
    let mut ledger = decode(&current.value)?;
    if let Some((id, digest)) = receipt {
        if ledger.receipts.len() >= 100_000 { return Err("Se ha alcanzado el límite de recibos de audio; se conserva el recibo pendiente".into()); }
        ledger.receipts.insert(id, digest);
    }
    let incoming = Period::for_entry(&entry);
    let key = incoming.key();
    if let Some(period) = ledger.periods.iter_mut().find(|period| period.key() == key) {
        period.add(&entry)?;
    } else {
        if ledger.periods.len() >= MAX_GROUPS {
            return Err(
                "El registro alcanza el límite de periodos; no se pierde el histórico".into(),
            );
        }
        let mut period = incoming;
        period.add(&entry)?;
        ledger.periods.push(period);
        ledger.periods.sort_by_key(Period::key);
    }
    ledger.recorded_entries = add_counter(ledger.recorded_entries, 1)?;
    ledger.entries.push(entry);
    if ledger.entries.len() > MAX_RECENT {
        let count = ledger.entries.len() - MAX_RECENT;
        ledger.entries.drain(..count);
    }
    write_reviewed(api, &current_revision, &value(ledger)?)
}
pub(super) fn info(api: &LocalApi) -> Result<Value, String> {
    let (current, bytes) = snapshot(api)?;
    let mut result = json!({"id":"ai-usage-ledger","checkedAt":knownext_core::now_iso(),"revision":revision(bytes.as_deref()),"schemaVersion":current["schemaVersion"].as_u64().unwrap_or(1),"needsUpgrade":current["schemaVersion"]!=2,"recentEntries":current["entries"].as_array().map_or(0,Vec::len),"recentLimit":MAX_RECENT,"groupLimit":MAX_GROUPS});
    if current["schemaVersion"] == 2 {
        let ledger = decode(&current)?;
        result["recordedEntries"] = json!(ledger.recorded_entries);
        result["periodGroups"] = json!(ledger.periods.len());
        result["legacyWindowOnly"] = json!(ledger.legacy_window_only);
        result["createdAt"] = json!(ledger.created_at);
        let needed = ledger.initial_revision != "absent";
        let verified = needed && backup_verified(api, &ledger.initial_revision);
        result["originalCopyPreserved"] = json!(verified);
        result["originalCopyStatus"] = json!(if !needed {
            "not-needed"
        } else if verified {
            "verified"
        } else {
            "unavailable"
        });
    }
    Ok(result)
}
pub(super) fn metadata(current: &Value) -> Result<Value, String> {
    if current["schemaVersion"] != 2 {
        return Ok(json!({"coverage":"retained-local-records"}));
    }
    let ledger = decode(current)?;
    Ok(
        json!({"coverage":"local-period-aggregates","recordedEntries":ledger.recorded_entries,"ledgerCreatedAt":ledger.created_at,"legacyWindowOnly":ledger.legacy_window_only,"periodGroups":ledger.periods.len()}),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    fn request(api: &LocalApi, method: &str, path: &str, body: Value) -> Value {
        let response = api.handle(method, path, body, vec![]).unwrap();
        assert!(response.status < 400, "{}", response.body);
        response.body
    }
    fn entry(index: usize, cost: f64) -> Value {
        json!({"id":format!("owned-receipt-{index}"),"projectId":"owned-project","createdAt":"2026-11-01T12:00:00Z","month":"2026-11","model":"owned-model","capability":"document_ai","costSchemaVersion":2,"totalTokens":1,"estimatedCostEur":cost,"estimatedCostUsd":cost*1.1,"usageSource":"provider"})
    }
    fn fixture(entries: usize) -> (tempfile::TempDir, LocalApi, Vec<u8>) {
        let owned = tempfile::tempdir().unwrap();
        let api = LocalApi::new(owned.path().join("state"), "qa".into(), "test".into());
        fs::create_dir_all(api.app_data_dir.join("ai")).unwrap();
        let bytes=serde_json::to_vec(&json!({"schemaVersion":1,"entries":(0..entries).map(|index|entry(index,0.1)).collect::<Vec<_>>()})).unwrap();
        fs::write(api.ai_usage_path(), &bytes).unwrap();
        (owned, api, bytes)
    }

    #[test]
    fn reviewed_upgrade_preserves_exact_legacy_and_aggregates_survive_rotation_and_restart() {
        let (_owned, api, original) = fixture(5000);
        let info = request(&api, "GET", "/api/ai/usage/ledger", Value::Null);
        assert_eq!(info["needsUpgrade"], true);
        assert_eq!(
            request(
                &api,
                "GET",
                "/api/ai/usage/summary?month=2026-11",
                Value::Null
            )["totalEstimatedCost"],
            500.0
        );
        assert_eq!(fs::read(api.ai_usage_path()).unwrap(), original);
        let review = json!({"revision":info["revision"]});
        let upgraded = request(&api, "POST", "/api/ai/usage/ledger/upgrade", review.clone());
        assert_eq!(upgraded["schemaVersion"], 2);
        assert_eq!(upgraded["originalCopyStatus"], "verified");
        let backup = api.app_data_dir.join("ai/usage-migrations").join(format!(
            "legacy-{}.json",
            info["revision"].as_str().unwrap()
        ));
        assert_eq!(fs::read(&backup).unwrap(), original);
        let converted = fs::read(api.ai_usage_path()).unwrap();
        request(&api, "POST", "/api/ai/usage/ledger/upgrade", review);
        assert_eq!(fs::read(api.ai_usage_path()).unwrap(), converted);
        api.record_ai_usage(entry(5000, 0.2)).unwrap();
        let raw: Value = serde_json::from_slice(&fs::read(api.ai_usage_path()).unwrap()).unwrap();
        assert_eq!(raw["entries"].as_array().unwrap().len(), 5000);
        assert!(raw["entries"]
            .as_array()
            .unwrap()
            .iter()
            .all(|entry| entry["id"] != "owned-receipt-0"));
        let summary = request(
            &api,
            "GET",
            "/api/ai/usage/summary?month=2026-11&projectId=owned-project",
            Value::Null,
        );
        assert_eq!(summary["coverage"], "local-period-aggregates");
        assert_eq!(summary["totalEstimatedCost"], 500.2);
        assert_eq!(summary["totalInteractions"], 5001);
        assert_eq!(summary["totalTokens"], 5001);
        assert_eq!(summary["recordedEntries"], 5001);
        assert_eq!(summary["legacyWindowOnly"], true);
        let reopened = LocalApi::new(api.app_data_dir.clone(), "qa".into(), "test".into());
        assert_eq!(
            request(
                &reopened,
                "GET",
                "/api/ai/usage/summary?month=2026-11",
                Value::Null
            )["totalEstimatedCost"],
            500.2
        );
        reopened.record_ai_usage(entry(5001, 0.3)).unwrap();
        assert_eq!(
            request(
                &api,
                "GET",
                "/api/ai/usage/summary?month=2026-11",
                Value::Null
            )["totalEstimatedCost"],
            500.5
        );
        assert_eq!(fs::read(&backup).unwrap(), original);
        let groups = request(&api, "GET", "/api/storage/usage", Value::Null);
        assert!(groups["measurement"]["groups"]
            .as_array()
            .unwrap()
            .iter()
            .any(|group| group["id"] == "recovery"
                && group["logicalBytes"].as_u64().unwrap() >= original.len() as u64));
    }

    #[test]
    fn failed_copy_changed_revision_and_unknown_or_tampered_formats_preserve_sources() {
        let (_owned, api, original) = fixture(1);
        let before = info(&api).unwrap();
        assert!(api
            .upgrade_usage_ledger(json!({"revision":"obsolete"}))
            .is_err());
        assert_eq!(fs::read(api.ai_usage_path()).unwrap(), original);
        let blocked = api.app_data_dir.join("ai/usage-migrations");
        fs::write(&blocked, b"Owned blocker, never remove automatically").unwrap();
        assert!(api.usage_preflight().is_err());
        assert_eq!(fs::read(api.ai_usage_path()).unwrap(), original);
        assert_eq!(
            fs::read(&blocked).unwrap(),
            b"Owned blocker, never remove automatically"
        );
        let (_other, second, _) = fixture(1);
        second
            .upgrade_usage_ledger(json!({"revision":info(&second).unwrap()["revision"]}))
            .unwrap();
        let known = fs::read(second.ai_usage_path()).unwrap();
        let value: Value = serde_json::from_slice(&known).unwrap();
        for changed in [
            {
                let mut changed = value.clone();
                changed["schemaVersion"] = json!(99);
                changed
            },
            {
                let mut changed = value.clone();
                changed["periods"][0]["usage"]["estimatedCost"] = json!(0.0);
                changed
            },
            {
                let mut changed = value.clone();
                changed["periods"][0]["futureFields"] = json!({"owned":"preserve"});
                changed
            },
        ] {
            let bytes = serde_json::to_vec(&changed).unwrap();
            fs::write(second.ai_usage_path(), &bytes).unwrap();
            assert!(second.usage_preflight().is_err());
            assert_eq!(fs::read(second.ai_usage_path()).unwrap(), bytes);
        }
        assert_eq!(before["needsUpgrade"], true);
    }

    #[test]
    fn a_valid_newer_ledger_is_not_overwritten_by_an_obsolete_prepared_append() {
        let (_owned, api, _) = fixture(1);
        let prepared = ensure_locked(&api, None).unwrap();
        let mut newer = decode(&prepared.value).unwrap();
        let receipt = entry(1, 0.2);
        newer.periods[0].add(&receipt).unwrap();
        newer.recorded_entries = 2;
        newer.entries.push(receipt);
        let newer = value(newer).unwrap();
        let bytes = serde_json::to_vec_pretty(&newer).unwrap();
        fs::write(api.ai_usage_path(), &bytes).unwrap();
        assert!(append(&api, prepared, entry(2, 0.3)).is_err());
        assert_eq!(fs::read(api.ai_usage_path()).unwrap(), bytes);
        assert_eq!(
            request(
                &api,
                "GET",
                "/api/ai/usage/summary?month=2026-11",
                Value::Null
            )["totalEstimatedCost"],
            0.3
        );
    }
    #[test]
    fn decimal_provider_metadata_does_not_change_the_checksum_when_reopened() {
        let (_owned, api, _) = fixture(0);
        let mut seed = 0x123456789abcdefu64;
        let entries = (0..256)
            .map(|index| {
                seed = seed
                    .wrapping_mul(6364136223846793005)
                    .wrapping_add(1442695040888963407);
                let number = (seed >> 11) as f64 / 9_007_199_254_740_992.0 * 9_000_000_000.0;
                let mut value = entry(index, 0.1);
                value["providerUsage"] = json!({"ownedDecimalMetadata":number});
                value
            })
            .collect::<Vec<_>>();
        fs::write(
            api.ai_usage_path(),
            serde_json::to_vec(&json!({"entries":entries})).unwrap(),
        )
        .unwrap();
        api.upgrade_usage_ledger(json!({"revision":info(&api).unwrap()["revision"]}))
            .unwrap();
        assert_eq!(info(&api).unwrap()["recordedEntries"], 256);
        assert_eq!(
            request(
                &api,
                "GET",
                "/api/ai/usage/summary?month=2026-11",
                Value::Null
            )["totalEstimatedCost"],
            25.6
        );
        api.record_ai_usage(entry(256, 0.2)).unwrap();
        assert_eq!(info(&api).unwrap()["recordedEntries"], 257);
    }
}
