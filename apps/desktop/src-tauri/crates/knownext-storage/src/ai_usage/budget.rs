//! Local monthly guardrails, based on recorded estimates, never a provider invoice.
use super::*;

#[derive(Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Rule {
    month: String,
    project_id: Option<String>,
    limit_eur: f64,
    mode: String,
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Policy {
    schema_version: u8,
    rules: Vec<Rule>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Change {
    revision: String,
    month: String,
    project_id: Option<String>,
    limit_eur: Option<f64>,
    mode: Option<String>,
}

fn scope(month: &str, project: Option<&str>) -> Result<(), String> {
    if !is_usage_month(month) || project.is_some_and(|id| !request_scope::portable_id(id)) {
        return Err("Periodo o proyecto del presupuesto no válido".into());
    }
    Ok(())
}
fn decode(value: &Value) -> Result<Policy, String> {
    let policy: Policy = serde_json::from_value(value.clone())
        .map_err(|_| "Presupuestos no compatibles; se conserva su archivo")?;
    if policy.schema_version != 1 || policy.rules.len() > 256 {
        return Err("Versión o capacidad de presupuestos no compatible; se conserva".into());
    }
    let mut keys = BTreeSet::new();
    for rule in &policy.rules {
        scope(&rule.month, rule.project_id.as_deref())?;
        if !keys.insert((rule.month.clone(), rule.project_id.clone()))
            || !rule.limit_eur.is_finite()
            || !(0.01..=1_000_000.0).contains(&rule.limit_eur)
            || (rule.limit_eur * 100.0 - (rule.limit_eur * 100.0).round()).abs() > 0.000001
            || !matches!(rule.mode.as_str(), "notice" | "stop-new")
        {
            return Err("Regla de presupuesto no compatible; se conserva".into());
        }
    }
    Ok(policy)
}
pub(crate) fn validate(value: &Value) -> Result<(), String> {
    decode(value).map(|_| ())
}
fn read(api: &LocalApi) -> Result<(Policy, String), String> {
    let (value, bytes) = ai_operational_state::snapshot(
        &api.app_data_dir,
        "budgets",
        ai_operational_state::Store::Budgets,
        json!({"schemaVersion":1,"rules":[]}),
    )?;
    Ok((
        decode(&value)?,
        bytes.map_or("absent".into(), |bytes| {
            format!("{:x}", Sha256::digest(bytes))
        }),
    ))
}
fn assess(
    api: &LocalApi,
    policy: &Policy,
    month: &str,
    project: Option<&str>,
) -> Result<Vec<Value>, String> {
    let current = api.usage_checked()?;
    let periods = ledger::periods(&current)?;
    let mut result = vec![];
    for rule in policy.rules.iter().filter(|rule| {
        rule.month == month && (rule.project_id.is_none() || rule.project_id.as_deref() == project)
    }) {
        let mut total = 0.0;
        let mut unknown = 0;
        for period in periods.iter().filter(|period| {
            period.month.as_deref() == Some(month)
                && (rule.project_id.is_none() || period.project_id == rule.project_id)
        }) {
            total = add_money(total, period.usage.estimated_cost)?;
            unknown = add_counter(unknown, period.usage.unpriced_entries)?;
        }
        let reached = total + 0.000000001 >= rule.limit_eur;
        let state = if reached {
            "reached"
        } else if unknown > 0 {
            "uncertain"
        } else if total >= rule.limit_eur * 0.8 {
            "warning"
        } else {
            "ok"
        };
        let blocked = rule.mode == "stop-new" && (reached || unknown > 0);
        result.push(json!({"month":month,"projectId":rule.project_id,"limitEur":rule.limit_eur,"mode":rule.mode,"recordedEur":round_cost(total),"unpricedEntries":unknown,"state":state,"blocked":blocked}));
    }
    Ok(result)
}
impl LocalApi {
    pub(crate) fn ai_budget_status(
        &self,
        query: &BTreeMap<String, String>,
    ) -> Result<Value, String> {
        let month = query
            .get("month")
            .cloned()
            .unwrap_or_else(|| knownext_core::now_iso()[..7].into());
        let project = query
            .get("projectId")
            .filter(|v| !v.is_empty())
            .map(String::as_str);
        scope(&month, project)?;
        let (policy, revision) = read(self)?;
        let rule = policy
            .rules
            .iter()
            .find(|rule| rule.month == month && rule.project_id.as_deref() == project);
        let checks = assess(self, &policy, &month, project)?;
        Ok(
            json!({"schemaVersion":1,"revision":revision,"month":month,"projectId":project,"rule":rule,"checks":checks,"checkedAt":knownext_core::now_iso(),"basis":"local-recorded-estimates","exchangeRateAvailable":currency::valid(&currency::read(&self.app_data_dir))}),
        )
    }
    pub(crate) fn change_ai_budget(&self, body: Value) -> Result<Value, String> {
        let change: Change =
            serde_json::from_value(body).map_err(|_| "Cambio de presupuesto no compatible")?;
        scope(&change.month, change.project_id.as_deref())?;
        let desired = match (change.limit_eur, change.mode) {
            (Some(limit_eur), Some(mode)) => Some(Rule {
                month: change.month.clone(),
                project_id: change.project_id.clone(),
                limit_eur,
                mode,
            }),
            (None, None) => None,
            _ => return Err("Importe y modo deben indicarse juntos".into()),
        };
        if let Some(rule) = &desired {
            validate(&json!({"schemaVersion":1,"rules":[rule]}))?;
        }
        let _gate = self
            .usage_gate
            .lock()
            .map_err(|_| "No se puede actualizar el presupuesto")?;
        let (mut policy, revision) = read(self)?;
        let index = policy
            .rules
            .iter()
            .position(|rule| rule.month == change.month && rule.project_id == change.project_id);
        let same = index.and_then(|index| policy.rules.get(index)) == desired.as_ref();
        if !same {
            if revision != change.revision {
                return Err("Los presupuestos cambiaron desde la revisión. Comprueba el estado antes de guardar; no se ha sobrescrito".into());
            }
            if let Some(index) = index {
                policy.rules.remove(index);
            }
            if let Some(rule) = desired {
                policy.rules.push(rule);
            }
            policy
                .rules
                .sort_by(|a, b| (&a.month, &a.project_id).cmp(&(&b.month, &b.project_id)));
            let value =
                serde_json::to_value(&policy).map_err(|_| "No se puede preparar el presupuesto")?;
            validate(&value)?;
            // Validate both stores before changing either one.
            self.usage_checked()?;
            self.write_json(&self.app_data_dir.join("ai/usage-policy.json"), &value)?;
        }
        let mut query = BTreeMap::from([("month".into(), change.month)]);
        if let Some(project) = change.project_id {
            query.insert("projectId".into(), project);
        }
        self.ai_budget_status(&query)
    }
    /// Shared by native workers and every paid entry point. No capture gating.
    pub fn ai_spend_assessment(&self, project: Option<&str>) -> Result<Value, String> {
        let mut query = BTreeMap::new();
        if let Some(project) = project {
            query.insert("projectId".into(), project.into());
        }
        self.ai_budget_status(&query)
    }
    pub(crate) fn spend_preflight(&self, project: Option<&str>) -> Result<(), String> {
        self.require_ai_transmission(project)?;
        let status = self.ai_spend_assessment(project)?;
        let checks = status["checks"]
            .as_array()
            .ok_or("No se puede comprobar el presupuesto")?;
        if checks.iter().any(|check| check["blocked"] == true) {
            return Err("Presupuesto de IA: se detienen nuevos envíos porque se alcanzó el límite o hay consumo sin importe EUR. Revisa Consumo de IA. Los documentos y el audio local se conservan.".into());
        }
        if checks.iter().any(|check| check["mode"] == "stop-new")
            && status["exchangeRateAvailable"] != true
        {
            return Err("Presupuesto de IA: falta una referencia EUR vigente para valorar nuevos envíos. Actualiza el cambio en Consumo de IA. La grabación local sigue disponible.".into());
        }
        self.usage_preflight()
    }
}
