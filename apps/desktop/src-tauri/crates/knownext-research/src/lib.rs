use knownext_core::{compact_id, now_iso};
use serde_json::{json, Value};
use std::collections::{BTreeMap, BTreeSet};

pub const AUTO_START_AFTER_SECONDS: u64 = 60;

pub fn research_mode_from_brief(brief: &Value) -> &'static str {
    let template_id = brief
        .get("templateId")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let depth = brief
        .get("depth")
        .and_then(Value::as_str)
        .unwrap_or_default();
    match template_id {
        "comparison" => "compare",
        "technical_analysis" => "currentDocument",
        "executive_report" => "quick",
        _ if depth.eq_ignore_ascii_case("quick") => "quick",
        _ => "deep",
    }
}

pub fn candidate_source_limit_from_brief(brief: &Value) -> usize {
    read_usize(brief, "candidateSourceLimit")
        .or_else(|| read_usize(brief, "maxSources"))
        .unwrap_or(500)
        .clamp(1, 500)
}

pub fn strategy_for_brief(brief: &Value) -> Value {
    let mode = research_mode_from_brief(brief);
    let limit = candidate_source_limit_from_brief(brief);
    let report_length = report_length_from_brief(brief);
    strategy_for_mode_and_length(mode, limit, report_length)
}

pub fn strategy_for_mode(mode: &str, candidate_source_limit: usize) -> Value {
    strategy_for_mode_and_length(mode, candidate_source_limit, "standard")
}

pub fn report_length_from_brief(brief: &Value) -> &'static str {
    let value = brief
        .get("reportLength")
        .and_then(Value::as_str)
        .or_else(|| brief.pointer("/plan/reportLength").and_then(Value::as_str))
        .or_else(|| {
            brief
                .pointer("/plan/proposedReportLength")
                .and_then(Value::as_str)
        })
        .unwrap_or("standard");
    match value {
        "brief" => "brief",
        "wide" => "wide",
        "exhaustive" => "exhaustive",
        _ => "standard",
    }
}

pub fn strategy_for_mode_and_length(
    mode: &str,
    candidate_source_limit: usize,
    report_length: &str,
) -> Value {
    let limit = candidate_source_limit.clamp(1, 500);
    let (
        source_read_budget,
        citation_target,
        search_rounds,
        max_queries_per_round,
        min_independent_sources,
        min_sources_per_objective,
        contradiction_check,
        estimated_time_range,
    ) = match limit {
        0..=10 => (10, 4, 2, 4, 3, 1, "light", "2-6 min"),
        11..=50 => (20, 8, 3, 5, 5, 2, "standard", "4-10 min"),
        51..=200 => (60, 20, 6, 8, 10, 3, "strict", "8-20 min"),
        _ => (80, 35, 8, 8, 12, 3, "strict", "12-35 min"),
    };
    let (
        normalized_report_length,
        target_word_range,
        target_section_count,
        max_heading_depth,
        allow_appendices,
        report_detail,
    ) = match report_length {
        "brief" => ("brief", [800, 1500], [3, 5], 2, false, "executive"),
        "wide" => ("wide", [5000, 8000], [8, 12], 3, true, "deep"),
        "exhaustive" => ("exhaustive", [9000, 15000], [12, 18], 3, true, "deep"),
        _ => ("standard", [2000, 4000], [5, 8], 3, false, "complete"),
    };
    json!({
        "mode": mode,
        "candidateSourceLimit": limit,
        "reportLength": normalized_report_length,
        "targetWordRange": target_word_range,
        "targetSectionCount": target_section_count,
        "maxHeadingDepth": max_heading_depth,
        "allowAppendices": allow_appendices,
        "sourceReadBudget": source_read_budget.min(limit.max(1)),
        "citationTarget": citation_target,
        "searchRounds": search_rounds,
        "maxQueriesPerRound": max_queries_per_round,
        "minIndependentSources": min_independent_sources,
        "minSourcesPerObjective": min_sources_per_objective,
        "contradictionCheck": contradiction_check,
        "gapReview": true,
        "reportDetail": report_detail,
        "estimatedTimeRange": estimated_time_range,
    })
}

pub fn budget_for_strategy(strategy: &Value, max_cost_eur: f64, max_steps: usize) -> Value {
    let rounds = read_usize(strategy, "searchRounds").unwrap_or(2);
    let read_budget = read_usize(strategy, "sourceReadBudget").unwrap_or(10);
    json!({
        "maxEstimatedCostEur": max_cost_eur.max(0.0),
        "estimatedCostEur": 0.0,
        "maxSteps": max_steps.max(1),
        "usedSteps": 0,
        "maxSearchRounds": rounds,
        "usedSearchRounds": 0,
        "maxSourceReads": read_budget,
        "usedSourceReads": 0,
        "exhausted": false,
    })
}

pub fn increment_budget_step(budget: &Value, step_count: usize) -> Value {
    let mut next = budget.clone();
    let used = read_usize(&next, "usedSteps").unwrap_or(0) + step_count;
    let max_steps = read_usize(&next, "maxSteps").unwrap_or(usize::MAX);
    if let Some(obj) = next.as_object_mut() {
        obj.insert("usedSteps".to_string(), json!(used));
        obj.insert("exhausted".to_string(), json!(used >= max_steps));
    }
    next
}

pub fn query_batches(plan: &Value, strategy: &Value) -> Vec<Value> {
    let now = now_iso();
    let objective = plan
        .get("primaryObjective")
        .and_then(Value::as_str)
        .or_else(|| plan.get("objective").and_then(Value::as_str))
        .unwrap_or("Investigación solicitada");
    let aspects = read_string_array(plan, "researchAspects")
        .or_else(|| read_string_array(plan, "outline"))
        .unwrap_or_else(|| vec![objective.to_string()]);
    let secondary = read_string_array(plan, "secondaryObjectives").unwrap_or_default();
    let max_queries = read_usize(strategy, "maxQueriesPerRound")
        .unwrap_or(5)
        .max(1);
    aspects
        .into_iter()
        .take(5)
        .enumerate()
        .map(|(aspect_index, aspect)| {
            let related_objective = secondary
                .get(aspect_index % secondary.len().max(1))
                .cloned()
                .unwrap_or_else(|| objective.to_string());
            let mut queries = vec![
                format!("{objective} {aspect} fuentes fiables"),
                format!("{aspect} {related_objective} evidencia actual"),
            ];
            if max_queries > 2 {
                queries.push(format!("{aspect} riesgos contradicciones limitaciones"));
            }
            json!({
                "id": compact_id("query-batch"),
                "round": 1,
                "aspectIndex": aspect_index,
                "objectiveIndex": aspect_index % 3,
                "aspect": aspect,
                "queries": queries.into_iter().take(max_queries).collect::<Vec<_>>(),
                "status": "pending",
                "createdAt": now,
                "completedAt": null,
            })
        })
        .collect()
}

pub fn normalize_source_candidates(raw: &Value, batch: &Value, limit: usize) -> Vec<Value> {
    let candidates = raw
        .get("candidates")
        .and_then(Value::as_array)
        .or_else(|| raw.get("sources").and_then(Value::as_array))
        .cloned()
        .unwrap_or_default();
    let now = now_iso();
    candidates
        .into_iter()
        .take(limit)
        .map(|source| {
            let id = source
                .get("id")
                .and_then(Value::as_str)
                .map(ToOwned::to_owned)
                .unwrap_or_else(|| compact_id("source"));
            let title = source
                .get("title")
                .and_then(Value::as_str)
                .unwrap_or("Fuente sin título");
            let url = source.get("url").and_then(Value::as_str);
            let path = source.get("path").and_then(Value::as_str);
            let confidence = source
                .get("confidence")
                .and_then(Value::as_f64)
                .unwrap_or(0.5)
                .clamp(0.0, 1.0);
            json!({
                "id": id,
                "title": title,
                "url": url,
                "path": path,
                "kind": source.get("kind").and_then(Value::as_str).unwrap_or(if url.is_some() { "web" } else { "project_document" }),
                "status": "candidate",
                "consultedAt": source.get("consultedAt").and_then(Value::as_str).unwrap_or(&now),
                "usedFragments": source.get("usedFragments").and_then(Value::as_array).cloned().unwrap_or_default(),
                "snapshotExcerpt": source.get("snapshotExcerpt").and_then(Value::as_str).or_else(|| source.get("excerpt").and_then(Value::as_str)).unwrap_or_default(),
                "confidence": confidence,
                "query": source.get("query").and_then(Value::as_str).unwrap_or_default(),
                "objectiveIndex": source.get("objectiveIndex").and_then(Value::as_u64).unwrap_or_else(|| batch.get("objectiveIndex").and_then(Value::as_u64).unwrap_or(0)),
                "aspectIndex": source.get("aspectIndex").and_then(Value::as_u64).unwrap_or_else(|| batch.get("aspectIndex").and_then(Value::as_u64).unwrap_or(0)),
            })
        })
        .collect()
}

pub fn rank_sources(candidates: &[Value], limit: usize) -> Vec<Value> {
    let mut seen = BTreeSet::new();
    let mut ranked = Vec::new();
    for source in candidates {
        let key = normalized_source_key(source);
        if !seen.insert(key) {
            continue;
        }
        let mut next = source.clone();
        let confidence = read_f64(&next, "confidence").unwrap_or(0.5);
        let has_url = next.get("url").and_then(Value::as_str).is_some();
        let has_excerpt = next
            .get("snapshotExcerpt")
            .and_then(Value::as_str)
            .map(|s| !s.trim().is_empty())
            .unwrap_or(false);
        let score =
            (confidence + if has_url { 0.15 } else { 0.0 } + if has_excerpt { 0.1 } else { 0.0 })
                .clamp(0.0, 1.0);
        if let Some(obj) = next.as_object_mut() {
            obj.insert("status".to_string(), json!("ranked"));
            obj.insert("score".to_string(), json!(score));
            obj.insert(
                "rankReason".to_string(),
                json!("Relevancia, disponibilidad, diversidad y confianza estimada."),
            );
        }
        ranked.push(next);
    }
    ranked.sort_by(|a, b| {
        read_f64(b, "score")
            .unwrap_or(0.0)
            .partial_cmp(&read_f64(a, "score").unwrap_or(0.0))
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    ranked.truncate(limit);
    ranked
}

pub fn select_sources_for_reading(ranked: &[Value], read_budget: usize) -> Vec<Value> {
    ranked
        .iter()
        .take(read_budget.max(1))
        .map(|source| {
            let mut next = source.clone();
            if let Some(obj) = next.as_object_mut() {
                obj.insert("status".to_string(), json!("selected_for_reading"));
            }
            next
        })
        .collect()
}

pub fn coverage_report(plan: &Value, evidence: &[Value], strategy: &Value) -> Value {
    let objective_count = read_string_array(plan, "secondaryObjectives")
        .map(|items| items.len())
        .unwrap_or(3)
        .max(3);
    let aspect_count = read_string_array(plan, "researchAspects")
        .map(|items| items.len())
        .unwrap_or(5)
        .max(5);
    let min_sources = read_usize(strategy, "minSourcesPerObjective").unwrap_or(2);
    let mut objectives: BTreeMap<usize, BTreeSet<String>> = BTreeMap::new();
    let mut aspects: BTreeMap<usize, BTreeSet<String>> = BTreeMap::new();
    for item in evidence {
        let Some(source_id) = item.get("sourceId").and_then(Value::as_str) else {
            continue;
        };
        let objective = read_usize(item, "objectiveIndex").unwrap_or(0);
        let aspect = read_usize(item, "aspectIndex").unwrap_or(0);
        objectives
            .entry(objective)
            .or_default()
            .insert(source_id.to_string());
        aspects
            .entry(aspect)
            .or_default()
            .insert(source_id.to_string());
    }
    let mut objective_rows = Vec::new();
    let mut gaps = Vec::new();
    for idx in 0..objective_count.min(3) {
        let source_count = objectives.get(&idx).map(BTreeSet::len).unwrap_or(0);
        let covered = source_count >= min_sources;
        if !covered {
            gaps.push(format!(
                "El objetivo secundario {} necesita más evidencias independientes.",
                idx + 1
            ));
        }
        objective_rows.push(json!({
            "objectiveIndex": idx,
            "sourceCount": source_count,
            "covered": covered,
        }));
    }
    let aspect_rows: Vec<Value> = (0..aspect_count.min(5))
        .map(|idx| {
            let source_count = aspects.get(&idx).map(BTreeSet::len).unwrap_or(0);
            json!({
                "aspectIndex": idx,
                "sourceCount": source_count,
                "covered": source_count > 0,
            })
        })
        .collect();
    let covered_objectives = objective_rows
        .iter()
        .filter(|row| row.get("covered").and_then(Value::as_bool).unwrap_or(false))
        .count();
    let status = if evidence.is_empty() {
        "fail"
    } else if covered_objectives == objective_count.min(3) {
        "pass"
    } else {
        "warning"
    };
    json!({
        "status": status,
        "coveredObjectives": covered_objectives,
        "requiredObjectives": objective_count.min(3),
        "objectives": objective_rows,
        "aspects": aspect_rows,
        "gaps": gaps,
    })
}

pub fn quality_report(
    sources: &[Value],
    evidence: &[Value],
    coverage: &Value,
    findings: &[Value],
    diagnostics: &[Value],
) -> Value {
    let source_ids: BTreeSet<String> = evidence
        .iter()
        .filter_map(|item| {
            item.get("sourceId")
                .and_then(Value::as_str)
                .map(ToOwned::to_owned)
        })
        .collect();
    let cited_count = sources
        .iter()
        .filter(|source| {
            source
                .get("status")
                .and_then(Value::as_str)
                .map(|status| matches!(status, "cited" | "used_as_evidence"))
                .unwrap_or(false)
        })
        .count()
        .max(source_ids.len());
    let unsupported_findings = findings
        .iter()
        .filter(|finding| {
            finding
                .get("evidenceIds")
                .and_then(Value::as_array)
                .map(Vec::is_empty)
                .unwrap_or(true)
        })
        .count();
    let coverage_status = coverage
        .get("status")
        .and_then(Value::as_str)
        .unwrap_or("warning");
    let mut limitations = Vec::new();
    if source_ids.is_empty() {
        limitations.push("No hay fuentes web verificables usadas como evidencia.".to_string());
    }
    if evidence.is_empty() {
        limitations.push("No se han extraído evidencias suficientes.".to_string());
    }
    if unsupported_findings > 0 {
        limitations.push("Hay hallazgos sin evidencias asociadas.".to_string());
    }
    if coverage_status != "pass" {
        limitations.push("La cobertura de objetivos no es completa.".to_string());
    }
    for diagnostic in diagnostics {
        if let Some(message) = diagnostic.get("message").and_then(Value::as_str) {
            limitations.push(message.to_string());
        }
    }
    let status = if source_ids.is_empty() || evidence.is_empty() || unsupported_findings > 0 {
        "fail"
    } else if coverage_status == "pass" && limitations.is_empty() {
        "pass"
    } else {
        "warning"
    };
    json!({
        "status": status,
        "sourceCount": sources.len(),
        "citedSourceCount": cited_count,
        "evidenceCount": evidence.len(),
        "supportedFindings": findings.len().saturating_sub(unsupported_findings),
        "unsupportedFindings": unsupported_findings,
        "limitations": limitations,
        "contradictions": [],
        "coverage": coverage,
    })
}

pub fn final_status_from_quality(quality: &Value) -> &'static str {
    match quality
        .get("status")
        .and_then(Value::as_str)
        .unwrap_or("fail")
    {
        "pass" => "ready_pass",
        "warning" => "ready_warning",
        _ => "failed_quality",
    }
}

pub fn activity_event(phase: &str, level: &str, message: &str) -> Value {
    json!({
        "id": compact_id("activity"),
        "phase": phase,
        "level": level,
        "message": message,
        "createdAt": now_iso(),
    })
}

pub fn source_state_counts(sources: &[Value]) -> Value {
    let mut counts: BTreeMap<String, usize> = BTreeMap::new();
    for source in sources {
        let status = source
            .get("status")
            .and_then(Value::as_str)
            .unwrap_or("candidate")
            .to_string();
        *counts.entry(status).or_insert(0) += 1;
    }
    json!(counts)
}

fn normalized_source_key(source: &Value) -> String {
    source
        .get("url")
        .and_then(Value::as_str)
        .or_else(|| source.get("path").and_then(Value::as_str))
        .or_else(|| source.get("title").and_then(Value::as_str))
        .unwrap_or_default()
        .trim()
        .trim_end_matches('/')
        .to_ascii_lowercase()
}

fn read_string_array(value: &Value, key: &str) -> Option<Vec<String>> {
    value
        .get(key)
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .map(ToOwned::to_owned)
                .collect::<Vec<_>>()
        })
        .filter(|items| !items.is_empty())
}

fn read_usize(value: &Value, key: &str) -> Option<usize> {
    value
        .get(key)
        .and_then(Value::as_u64)
        .and_then(|number| usize::try_from(number).ok())
}

fn read_f64(value: &Value, key: &str) -> Option<f64> {
    value.get(key).and_then(Value::as_f64)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strategy_uses_candidate_limit() {
        let strategy = strategy_for_mode("quick", 50);
        assert_eq!(strategy["candidateSourceLimit"], json!(50));
        assert_eq!(strategy["sourceReadBudget"], json!(20));
        assert_eq!(strategy["reportLength"], json!("standard"));
        assert_eq!(strategy["targetWordRange"], json!([2000, 4000]));
    }

    #[test]
    fn query_batches_are_plan_specific() {
        let plan = json!({
            "primaryObjective": "Comparar Mazda MX-5 por año",
            "secondaryObjectives": ["motor", "precio", "fiabilidad"],
            "researchAspects": ["generaciones", "motores", "averías", "mercado", "uso diario"]
        });
        let batches = query_batches(&plan, &strategy_for_mode("deep", 500));
        assert_eq!(batches.len(), 5);
        assert!(batches[0]["queries"][0]
            .as_str()
            .unwrap()
            .contains("Mazda MX-5"));
    }

    #[test]
    fn coverage_requires_evidence() {
        let plan = json!({
            "secondaryObjectives": ["a", "b", "c"],
            "researchAspects": ["a1", "a2", "b1", "c1", "c2"]
        });
        let coverage = coverage_report(&plan, &[], &strategy_for_mode("quick", 50));
        assert_eq!(coverage["status"], json!("fail"));
    }
}
