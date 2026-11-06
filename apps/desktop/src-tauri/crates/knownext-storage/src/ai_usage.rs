//! Provider usage recording and monthly accounting. Preserves the existing ledger contract.
use super::*;
mod ledger;
pub(crate) mod budget;

const MAX_COUNTER: u64 = 9_007_199_254_740_991;
const MAX_MONEY: f64 = 9_000_000_000.0;
fn counter(value: &Value, field: &str) -> Result<u64, String> {
    match value.get(field){None|Some(Value::Null)=>Ok(0),Some(number)=>number.as_u64().filter(|n|*n<=MAX_COUNTER).ok_or_else(||format!("El contador {field} no es representable. Se conserva el registro de consumo sin asumir cero"))}
}
fn add_counter(first: u64, second: u64) -> Result<u64, String> {
    first
        .checked_add(second)
        .filter(|n| *n <= MAX_COUNTER)
        .ok_or("El total de consumo supera el rango representable; el registro se conserva".into())
}
fn money(value: &Value, field: &str) -> Result<f64, String> {
    match value.get(field){None|Some(Value::Null)=>Ok(0.0),Some(number)=>number.as_f64().filter(|n|n.is_finite()&&*n>=0.0&&*n<=MAX_MONEY).ok_or_else(||format!("El importe {field} no es compatible. Se conserva el registro sin atribuirle otro importe"))}
}
fn add_money(first: f64, second: f64) -> Result<f64, String> {
    let total = first + second;
    if total.is_finite() && total <= MAX_MONEY {
        Ok(total)
    } else {
        Err("El importe total no es representable; el registro se conserva".into())
    }
}
pub(super) fn validate_usage_entry(entry: &Value) -> Result<(), String> {
    if !entry.is_object() {
        return Err("Entrada de consumo no compatible; se conserva".into());
    }
    if entry
        .get("costSchemaVersion")
        .is_some_and(|v| !matches!(v.as_u64(), Some(1 | 2)))
    {
        return Err("Formato de coste no compatible; se conserva sin normalizar".into());
    }
    if entry
        .get("month")
        .is_some_and(|v| !v.as_str().is_some_and(is_usage_month))
    {
        return Err(
            "El periodo del registro no es compatible; se conserva sin asumir otro mes".into(),
        );
    }
    if entry
        .get("projectId")
        .is_some_and(|id| !id.is_null() && !id.as_str().is_some_and(request_scope::portable_id))
    {
        return Err("Identidad de consumo no compatible; se conserva".into());
    }
    for field in ["model", "capability", "usageSource"] {
        if entry.get(field).is_some_and(|value| {
            !value.is_null() && !value.as_str().is_some_and(|text| text.len() <= 200)
        }) {
            return Err("La identidad de modelo o capacidad no es compatible; se conserva".into());
        }
    }
    for field in [
        "inputTokens",
        "cachedInputTokens",
        "outputTokens",
        "reasoningTokens",
        "embeddingTokens",
        "totalTokens",
    ] {
        counter(entry, field)?;
    }
    for field in ["estimatedCost", "estimatedCostUsd", "estimatedCostEur"] {
        money(entry, field)?;
    }
    Ok(())
}
pub(super) fn validate_usage_store(value: &Value) -> Result<(), String> {
    ledger::validate(value)
}
fn entry_month(entry: &Value) -> Option<&str> {
    entry["month"].as_str().or_else(|| {
        entry["createdAt"]
            .as_str()
            .and_then(|date| date.get(..7))
            .filter(|month| is_usage_month(month))
    })
}

#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct AiUsageAccumulator {
    interactions: u64,
    unpriced_entries: u64,
    input_tokens: u64,
    cached_input_tokens: u64,
    output_tokens: u64,
    reasoning_tokens: u64,
    embedding_tokens: u64,
    total_tokens: u64,
    estimated_cost: f64,
    usage_sources: BTreeSet<String>,
}

impl LocalApi {
    pub(super) fn record_research_image_usage(&self, project: &str, job: &str, image:&Value)->Result<(),String>{
        let usage=&image["usage"];
        let input=usage["input_tokens"].as_u64().unwrap_or(0);
        let output=usage["output_tokens"].as_u64().unwrap_or(0);
        self.record_ai_usage_records(project,job,&json!({"usageRecords":[{
            "capability":"image_generation","model":image["model"].as_str().unwrap_or("gpt-image-2"),
            "providerUsage":usage,"usageSource":if usage.is_object(){"provider"}else{"unknown"},
            "inputTokens":input,"cachedInputTokens":usage["input_tokens_details"]["cached_tokens"].as_u64().unwrap_or(0),
            "outputTokens":output,"totalTokens":input.checked_add(output).ok_or("Contadores de imagen no representables")?
        }]}))
    }
    pub fn recording_transcription_credential(&self, project: &str) -> Result<String, String> {
        if !request_scope::portable_id(project) { return Err("Proyecto de grabación no válido".into()); }
        self.spend_preflight(Some(project))?;
        self.recording_credential()
    }
    /// Called by native recording workers, never a frontend receipt ingestion route.
    pub fn record_recording_usage(&self, receipt: &knownext_core::recording_usage::RecordingUsageReceipt) -> Result<(), String> {
        if !request_scope::portable_id(&receipt.id) || !request_scope::portable_id(&receipt.project_id)
            || receipt.model != "gpt-transcribe" || receipt.samples == 0 || receipt.samples > 24_000 * 300
            || OffsetDateTime::parse(&receipt.started_at, &Rfc3339).is_err()
            || serde_json::to_vec(&receipt.exchange_rate).map_err(|_|"Cambio no válido")?.len() > 8192 {
            return Err("Recibo de grabación no compatible; se conserva sin registrar otro importe".into());
        }
        let id = format!("{:x}", Sha256::digest(receipt.id.as_bytes()));
        let digest = format!("{:x}", Sha256::digest(serde_json::to_vec(receipt).map_err(|_|"Recibo no válido")?));
        let _gate = self.usage_gate.lock().map_err(|_|"No se puede registrar el recibo de audio")?;
        let usage = ledger::ensure_locked(self, None)?;
        if ledger::receipt_recorded(&usage, &id, &digest)? { return Ok(()); }
        let mut entry = json!({"id":receipt.id,"interactionId":receipt.id,"createdAt":receipt.started_at,"month":month_from_iso(&receipt.started_at).ok_or("Periodo del recibo no válido")?,"projectId":receipt.project_id,"capability":"audio","model":receipt.model,"durationSeconds":receipt.samples as f64/24_000.0,"usageSource":if receipt.confirmed{"estimated"}else{"unknown"},"captureSource":"native_recording","sendConfirmation":if receipt.confirmed{"confirmed"}else{"unconfirmed"}});
        currency::price_entry(&mut entry, &receipt.exchange_rate);
        if !receipt.confirmed {
            entry["estimatedCost"] = Value::Null;
            entry["estimatedCostEur"] = Value::Null;
            entry["estimatedCostUsd"] = Value::Null;
        }
        validate_usage_entry(&entry)?;
        ledger::append_receipt(self, usage, entry, id, digest)
    }
    pub(super) fn record_ai_usage_records(
        &self,
        project_id: &str,
        interaction_id: &str,
        response: &Value,
    ) -> Result<(), String> {
        for record in response["usageRecords"]
            .as_array()
            .into_iter()
            .flatten()
            .filter(|record| record.is_object())
        {
            let mut entry = record.clone();
            if let Some(object) = entry.as_object_mut() {
                object.insert("projectId".to_string(), Value::from(project_id));
                object.insert("interactionId".to_string(), Value::from(interaction_id));
                if !object.contains_key("estimatedCost") {
                    let model = object
                        .get("model")
                        .and_then(Value::as_str)
                        .unwrap_or("gpt-5.4-mini");
                    object.insert(
                        "estimatedCost".to_string(),
                        Value::from(text_estimated_cost(
                            model,
                            value_u64(object.get("inputTokens")),
                            value_u64(object.get("cachedInputTokens")),
                            value_u64(object.get("outputTokens")),
                        )),
                    );
                }
            }
            let job = if interaction_id.starts_with("research-") {
                self.ai_research_job(project_id, interaction_id)?
            } else {
                Value::Null
            };
            let rate = if job["exchangeRateSnapshot"].is_object() {
                job["exchangeRateSnapshot"].clone()
            } else {
                currency::read(&self.app_data_dir)
            };
            currency::price_entry(&mut entry, &rate);
            self.record_ai_usage(entry.clone())?;
            self.accumulate_ai_research_usage(project_id, interaction_id, &entry)?;
        }
        Ok(())
    }

    fn accumulate_ai_research_usage(
        &self,
        project_id: &str,
        job_id: &str,
        entry: &Value,
    ) -> Result<(), String> {
        if !job_id.starts_with("research-") {
            return Ok(());
        }
        let exists = self.ai_research_jobs(project_id)?["jobs"]
            .as_array()
            .map(|jobs| jobs.iter().any(|job| job["id"].as_str() == Some(job_id)))
            .unwrap_or(false);
        if !exists {
            return Ok(());
        }
        let now = knownext_core::now_iso();
        self.update_ai_research_job_checked(project_id, job_id, |job| {
            let current = job["usage"].clone();
            if !current.is_null()&&!current.is_object(){return Err("El acumulado de investigación no es compatible; se conserva".into());}
            if current.as_object().is_some_and(|object|object.keys().any(|key|!["providerCalls","inputTokens","cachedInputTokens","outputTokens","reasoningTokens","embeddingTokens","totalTokens","estimatedCostEur","currency","updatedAt"].contains(&key.as_str()))){return Err("El acumulado contiene campos no compatibles; se conserva sin sustituir".into());}
            if current.get("currency").is_some_and(|currency|!currency.is_null()&&currency!="EUR"){return Err("La moneda del acumulado no es compatible; se conserva".into());}
            if job.get("schemaVersion").is_some_and(|version|version.as_u64()!=Some(1)){return Err("La versión de investigación no es compatible; se conserva".into());}
            if !job["budget"].is_null()&&!job["budget"].is_object(){return Err("El presupuesto de investigación no es compatible; se conserva".into());}
            let provider_calls=add_counter(counter(&current,"providerCalls")?,1)?;
            let input_tokens=add_counter(counter(&current,"inputTokens")?,counter(entry,"inputTokens")?)?;
            let cached_input_tokens=add_counter(counter(&current,"cachedInputTokens")?,counter(entry,"cachedInputTokens")?)?;
            let output_tokens=add_counter(counter(&current,"outputTokens")?,counter(entry,"outputTokens")?)?;
            let reasoning_tokens=add_counter(counter(&current,"reasoningTokens")?,counter(entry,"reasoningTokens")?)?;
            let embedding_tokens=add_counter(counter(&current,"embeddingTokens")?,counter(entry,"embeddingTokens")?)?;
            let total_tokens=add_counter(counter(&current,"totalTokens")?,counter(entry,"totalTokens")?)?;
            if entry["estimatedCostEur"].is_null() || (provider_calls>1&&current["estimatedCostEur"].is_null()){return Err("El coste EUR de una llamada no está disponible. Se conserva su consumo; revisa la investigación antes de continuar".into());}
            let estimated_cost=add_money(money(&current,"estimatedCostEur")?,money(entry,"estimatedCostEur")?)?;
            job["usage"] = json!({
                "providerCalls": provider_calls,
                "inputTokens": input_tokens,
                "cachedInputTokens": cached_input_tokens,
                "outputTokens": output_tokens,
                "reasoningTokens": reasoning_tokens,
                "embeddingTokens": embedding_tokens,
                "totalTokens": total_tokens,
                "estimatedCostEur": round_cost(estimated_cost),
                "currency": "EUR",
                "updatedAt": now
            });
            job["budget"]["estimatedCostEur"] = Value::from(round_cost(estimated_cost));
            Ok(())
        })?;
        Ok(())
    }

    pub(super) fn record_ai_usage(&self, mut entry: Value) -> Result<(), String> {
        let _gate = self
            .usage_gate
            .lock()
            .map_err(|_| "No se puede acceder al consumo IA")?;
        validate_usage_entry(&entry)?;
        currency::price_entry(&mut entry, &currency::read(&self.app_data_dir));
        validate_usage_entry(&entry)?;
        let now = knownext_core::now_iso();
        let month = entry
            .get("createdAt")
            .and_then(Value::as_str)
            .and_then(month_from_iso)
            .unwrap_or_else(|| now.chars().take(7).collect::<String>());
        if let Some(object) = entry.as_object_mut() {
            object.insert(
                "id".to_string(),
                Value::from(knownext_core::compact_id("ai-usage")),
            );
            object
                .entry("createdAt".to_string())
                .or_insert_with(|| Value::from(now));
            object.insert("month".to_string(), Value::from(month));
            object
                .entry("currency".to_string())
                .or_insert_with(|| Value::from("EUR"));
            object
                .entry("usageSource".to_string())
                .or_insert_with(|| Value::from("estimated"));
        }
        let usage = ledger::ensure_locked(self, None)?;
        ledger::append(self, usage, entry)
    }

    pub(super) fn usage_preflight(&self) -> Result<(), String> {
        let _gate = self
            .usage_gate
            .lock()
            .map_err(|_| "No se puede preparar la conservación de consumo")?;
        let usage = ledger::ensure_locked(self, None)?;
        ledger::can_record(&usage.value)
    }
    pub(super) fn usage_ledger_info(&self) -> Result<Value, String> {
        ledger::info(self)
    }
    pub(super) fn upgrade_usage_ledger(&self, body: Value) -> Result<Value, String> {
        let object = body
            .as_object()
            .filter(|object| object.len() == 1)
            .ok_or("La conversión requiere solo la revisión observada")?;
        let revision = object
            .get("revision")
            .and_then(Value::as_str)
            .ok_or("Falta la revisión observada del consumo")?;
        let _gate = self
            .usage_gate
            .lock()
            .map_err(|_| "No se puede convertir el registro de consumo")?;
        ledger::ensure_locked(self, Some(revision))?;
        ledger::info(self)
    }

    pub(super) fn ai_usage_summary(
        &self,
        query: &BTreeMap<String, String>,
    ) -> Result<Value, String> {
        let month = query
            .get("month")
            .filter(|value| is_usage_month(value))
            .cloned()
            .unwrap_or_else(|| knownext_core::now_iso().chars().take(7).collect::<String>());
        let usage = self.usage_checked()?;
        let project_id = query.get("projectId").filter(|id| !id.is_empty());
        if project_id.is_some_and(|id| !request_scope::portable_id(id)) {
            return Err("El proyecto del resumen no tiene una identidad válida".into());
        }
        let mut by_model: BTreeMap<String, AiUsageAccumulator> = BTreeMap::new();
        let mut by_capability: BTreeMap<String, AiUsageAccumulator> = BTreeMap::new();
        let mut total = AiUsageAccumulator::default();
        let periods = ledger::periods(&usage)?;
        let mut legacy = 0;
        let mut unavailable = 0;
        let mut usd = 0.0;

        for period in periods.iter().filter(|period| {
            period.month.as_deref() == Some(month.as_str())
                && project_id.is_none_or(|id| period.project_id.as_deref() == Some(id.as_str()))
        }) {
            combine_usage(
                by_model.entry(period.model.clone()).or_default(),
                &period.usage,
            )?;
            combine_usage(
                by_capability.entry(period.capability.clone()).or_default(),
                &period.usage,
            )?;
            combine_usage(&mut total, &period.usage)?;
            legacy = add_counter(legacy, period.legacy_entries)?;
            unavailable = add_counter(unavailable, period.unpriced_entries)?;
            usd = add_money(usd, period.estimated_cost_usd)?;
        }

        let models = by_model
            .into_iter()
            .map(|(model, usage)| usage_model_summary(model, usage))
            .collect::<Vec<_>>();
        let capabilities = by_capability
            .into_iter()
            .map(|(capability, usage)| usage_capability_summary(capability, usage))
            .collect::<Vec<_>>();
        let total_estimated_cost = total.estimated_cost;

        let unscoped = periods
            .iter()
            .filter(|period| {
                period.month.is_none()
                    && project_id.is_none_or(|id| period.project_id.as_deref() == Some(id.as_str()))
            })
            .try_fold(0, |sum, period| add_counter(sum, period.usage.interactions))?;
        let (projects, project_names_complete) = self.usage_project_options(&periods);
        let mut response = json!({
            "projectId":project_id,
            "availableProjects":projects,"projectNamesComplete":project_names_complete,
            "periodTimeZone":"UTC","coverage":"retained-local-records","retainedEntries":usage["entries"].as_array().map_or(0,Vec::len),"entryLimit":5000,
            "unscopedEntries":unscoped,
            "totalInteractions":total.interactions,"totalTokens":total.total_tokens,
            "legacyEntries": legacy,
            "unpricedEntries": unavailable,
            "totalEstimatedCostUsd": usd,
            "exchangeRate": currency::read(&self.app_data_dir),
            "exchangeRateWarning": currency::read_checked(&self.app_data_dir).err(),
            "costNote": "Estimaciones. Los registros heredados y sin conversión no se incluyen en el total EUR.",
            "month": month,
            "currency": "EUR",
            "estimated": true,
            "totalEstimatedCost": round_cost(total_estimated_cost),
            "generatedAt": knownext_core::now_iso(),
            "capabilities": capabilities,
            "models": models
        });
        if let Some(metadata) = ledger::metadata(&usage)?.as_object() {
            for (key, value) in metadata {
                response[key] = value.clone();
            }
        }
        Ok(response)
    }
    fn usage_project_options(&self, periods: &[ledger::Period]) -> (Vec<Value>, bool) {
        let mut projects = BTreeMap::<String, Value>::new();
        let mut complete = true;
        match self.registry_checked() {
            Ok(registry) => {
                for entry in registry["projects"].as_array().into_iter().flatten() {
                    if let (Some(id), Some(name)) = (entry["id"].as_str(), entry["name"].as_str()) {
                        projects
                            .insert(id.into(), json!({"id":id,"name":name,"state":"registered"}));
                    }
                }
            }
            Err(_) => complete = false,
        }
        match self.retired_projects() {
            Ok(catalog) => {
                for entry in catalog["entries"].as_array().into_iter().flatten() {
                    if let (Some(id), Some(name)) = (entry["id"].as_str(), entry["name"].as_str()) {
                        projects
                            .entry(id.into())
                            .or_insert(json!({"id":id,"name":name,"state":"retired"}));
                    }
                }
            }
            Err(_) => complete = false,
        }
        for period in periods {
            if let Some(id) = period.project_id.as_deref() {
                projects.entry(id.into()).or_insert_with(
                    || json!({"id":id,"name":"Proyecto sin asociación","state":"unavailable"}),
                );
            }
        }
        if projects.len() > 256 {
            complete = false;
        }
        (projects.into_values().take(256).collect(), complete)
    }
}

fn combine_usage(total: &mut AiUsageAccumulator, part: &AiUsageAccumulator) -> Result<(), String> {
    total.interactions = add_counter(total.interactions, part.interactions)?;
    total.unpriced_entries = add_counter(total.unpriced_entries, part.unpriced_entries)?;
    total.input_tokens = add_counter(total.input_tokens, part.input_tokens)?;
    total.cached_input_tokens = add_counter(total.cached_input_tokens, part.cached_input_tokens)?;
    total.output_tokens = add_counter(total.output_tokens, part.output_tokens)?;
    total.reasoning_tokens = add_counter(total.reasoning_tokens, part.reasoning_tokens)?;
    total.embedding_tokens = add_counter(total.embedding_tokens, part.embedding_tokens)?;
    total.total_tokens = add_counter(total.total_tokens, part.total_tokens)?;
    total.estimated_cost = add_money(total.estimated_cost, part.estimated_cost)?;
    total
        .usage_sources
        .extend(part.usage_sources.iter().cloned());
    Ok(())
}

fn accumulate_usage(accumulator: &mut AiUsageAccumulator, entry: &Value) -> Result<(), String> {
    accumulator.interactions = add_counter(accumulator.interactions, 1)?;
    accumulator.input_tokens =
        add_counter(accumulator.input_tokens, counter(entry, "inputTokens")?)?;
    accumulator.cached_input_tokens = add_counter(
        accumulator.cached_input_tokens,
        counter(entry, "cachedInputTokens")?,
    )?;
    accumulator.output_tokens =
        add_counter(accumulator.output_tokens, counter(entry, "outputTokens")?)?;
    accumulator.reasoning_tokens = add_counter(
        accumulator.reasoning_tokens,
        counter(entry, "reasoningTokens")?,
    )?;
    accumulator.embedding_tokens = add_counter(
        accumulator.embedding_tokens,
        counter(entry, "embeddingTokens")?,
    )?;
    accumulator.total_tokens =
        add_counter(accumulator.total_tokens, counter(entry, "totalTokens")?)?;
    if entry["costSchemaVersion"] == 2 {
        accumulator.estimated_cost = add_money(
            accumulator.estimated_cost,
            money(entry, "estimatedCostEur")?,
        )?;
    }
    if entry["costSchemaVersion"] != 2 || entry["estimatedCostEur"].is_null() {
        accumulator.unpriced_entries = add_counter(accumulator.unpriced_entries, 1)?;
    }
    accumulator.usage_sources.insert(
        entry["usageSource"]
            .as_str()
            .unwrap_or("unknown")
            .to_string(),
    );
    Ok(())
}

fn usage_model_summary(model: String, usage: AiUsageAccumulator) -> Value {
    json!({
        "unpricedEntries":usage.unpriced_entries,
        "model": model,
        "interactions": usage.interactions,
        "inputTokens": usage.input_tokens,
        "cachedInputTokens": usage.cached_input_tokens,
        "outputTokens": usage.output_tokens,
        "reasoningTokens": usage.reasoning_tokens,
        "embeddingTokens": usage.embedding_tokens,
        "totalTokens": usage.total_tokens,
        "estimatedCost": round_cost(usage.estimated_cost),
        "currency": "EUR",
        "usageSource": combined_usage_source(&usage.usage_sources)
    })
}

fn usage_capability_summary(capability: String, usage: AiUsageAccumulator) -> Value {
    json!({
        "unpricedEntries":usage.unpriced_entries,
        "capability": capability,
        "label": usage_capability_label(&capability),
        "interactions": usage.interactions,
        "inputTokens": usage.input_tokens,
        "cachedInputTokens": usage.cached_input_tokens,
        "outputTokens": usage.output_tokens,
        "reasoningTokens": usage.reasoning_tokens,
        "embeddingTokens": usage.embedding_tokens,
        "totalTokens": usage.total_tokens,
        "estimatedCost": round_cost(usage.estimated_cost),
        "currency": "EUR",
        "usageSource": combined_usage_source(&usage.usage_sources)
    })
}

fn combined_usage_source(sources: &BTreeSet<String>) -> &'static str {
    if sources.is_empty() {
        return "unknown";
    }
    let normalized = sources
        .iter()
        .map(|value| value.as_str())
        .filter(|value| matches!(*value, "provider" | "estimated" | "unknown"))
        .collect::<BTreeSet<_>>();
    if normalized.len() == 1 {
        match normalized.iter().next().copied().unwrap_or("unknown") {
            "provider" => "provider",
            "estimated" => "estimated",
            _ => "unknown",
        }
    } else {
        "mixed"
    }
}

fn usage_capability_label(capability: &str) -> &'static str {
    match capability {
        "image_generation" => "Imágenes",
        "vision" => "Visión",
        "audio" => "Audio",
        "agentic_tasks" => "Investigación",
        _ => "IA documental",
    }
}

fn normalize_usage_capability(capability: &str) -> &'static str {
    match capability {
        "image_generation" => "image_generation",
        "vision" => "vision",
        "audio" => "audio",
        "agentic_tasks" => "agentic_tasks",
        _ => "document_ai",
    }
}

fn value_u64(value: Option<&Value>) -> u64 {
    value.and_then(Value::as_u64).unwrap_or(0)
}

pub(super) fn text_estimated_cost(
    model: &str,
    input_tokens: u64,
    cached_input_tokens: u64,
    output_tokens: u64,
) -> f64 {
    knownext_core::model_catalog::text_usd(model, input_tokens, cached_input_tokens, output_tokens)
        .unwrap_or(0.0)
}

fn round_cost(value: f64) -> f64 {
    (value * 1_000_000.0).round() / 1_000_000.0
}

fn is_usage_month(value: &str) -> bool {
    let bytes = value.as_bytes();
    bytes.len() == 7
        && bytes[4] == b'-'
        && bytes[..4].iter().all(u8::is_ascii_digit)
        && bytes[5..].iter().all(u8::is_ascii_digit)
        && (1..=12).contains(&((bytes[5] - b'0') * 10 + bytes[6] - b'0'))
}

fn month_from_iso(value: &str) -> Option<String> {
    value
        .get(..7)
        .filter(|month| is_usage_month(month))
        .map(str::to_owned)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn usage_dates_are_calendar_months_and_never_slice_through_unicode() {
        for month in ["2026-01", "2026-12"] {
            assert!(is_usage_month(month));
        }
        for month in [
            "2026-00",
            "2026-13",
            "2026-1",
            "2026-aa",
            "éé-01",
            "123é-1",
            "2026-💡",
            "💡💡",
        ] {
            assert!(!is_usage_month(month));
        }
        for date in ["123456é", "éééé", "2026-13-01T00:00:00Z", ""] {
            assert_eq!(month_from_iso(date), None);
        }
        assert_eq!(
            month_from_iso("2026-11-01T00:00:00Z"),
            Some("2026-11".into())
        );
    }
    #[test]
    fn research_accumulation_rejects_bad_totals_before_writing_the_job() {
        let owned = tempfile::tempdir().unwrap();
        let api = LocalApi::new(owned.path().into(), "qa".into(), "test".into());
        let project = api
            .create_project(json!({"name":"Owned usage","versioningMode":"none","syncMode":"none"}))
            .unwrap();
        let id = project["id"].as_str().unwrap();
        let path = api.research_jobs_path(id);
        let entry = json!({"costSchemaVersion":2,"estimatedCostEur":0.1,"totalTokens":1});
        for usage in [
            json!({"providerCalls":MAX_COUNTER,"estimatedCostEur":0.0}),
            json!({"providerCalls":1,"totalTokens":MAX_COUNTER,"estimatedCostEur":0.0}),
            json!({"providerCalls":1,"estimatedCostEur":"broken"}),
            json!({"providerCalls":1,"estimatedCostEur":0.0,"futureEstimate":{"preserve":"owned"}}),
        ] {
            api.write_json(&path,&json!({"projectId":id,"jobs":[{"id":"research-owned","projectId":id,"status":"ready","usage":usage,"budget":{}}]})).unwrap();
            let before = std::fs::read(&path).unwrap();
            assert!(api
                .accumulate_ai_research_usage(id, "research-owned", &entry)
                .is_err());
            assert_eq!(std::fs::read(&path).unwrap(), before);
        }
    }
}
