use base64::Engine;
use reqwest::blocking::{multipart, Client};
use reqwest::header::{HeaderMap, HeaderValue, ACCEPT, AUTHORIZATION, USER_AGENT};
use serde_json::{json, Value};
use std::collections::BTreeSet;
use std::time::Duration;

pub fn answer_interaction(
    project_id: &str,
    payload: &Value,
    context_sources: Value,
    openai_key: Option<&str>,
    model: &str,
) -> Value {
    let prompt = payload
        .get("prompt")
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim();
    let document_id = payload.get("documentId").and_then(Value::as_str);
    let mode = payload
        .get("mode")
        .and_then(Value::as_str)
        .unwrap_or("document");
    let execution_mode = payload
        .get("executionMode")
        .and_then(Value::as_str)
        .unwrap_or("quick");
    let reasoning_depth = payload
        .get("reasoningDepth")
        .and_then(Value::as_str)
        .unwrap_or("light");
    let event_id = knownext_core::compact_id("ai-event");
    let interaction_id = knownext_core::compact_id("ai");
    let created_at = knownext_core::now_iso();

    if prompt.is_empty() {
        return provider_unavailable_response(
            project_id,
            document_id,
            &interaction_id,
            &event_id,
            &created_at,
            "Indica qué necesitas hacer con el documento activo.",
            execution_mode,
            reasoning_depth,
            mode,
        );
    }

    let Some(openai_key) = openai_key.filter(|value| !value.trim().is_empty()) else {
        return provider_unavailable_response(
            project_id,
            document_id,
            &interaction_id,
            &event_id,
            &created_at,
            "Configura una API key de OpenAI en Ajustes > IA para usar respuestas reales.",
            execution_mode,
            reasoning_depth,
            mode,
        );
    };

    let (selector_proposal, mut usage_records) =
        run_skill_selector(openai_key, payload, prompt, model)
            .map(|(proposal, usage)| (Some(proposal), usage.into_iter().collect::<Vec<_>>()))
            .unwrap_or((None, Vec::new()));
    let skill_context =
        knownext_ai_skills::select_skills_for_request(payload, selector_proposal.as_ref());
    let request_body =
        build_response_request(payload, prompt, &context_sources, model, &skill_context);
    let response = openai_client(openai_key)
        .post("https://api.openai.com/v1/responses")
        .json(&request_body)
        .send();

    let provider_text = match response {
        Ok(response) if response.status().is_success() => match response.json::<Value>() {
            Ok(value) => {
                if let Some(usage) = provider_usage_record("document_ai", model, &value) {
                    usage_records.push(usage);
                }
                extract_response_text(&value)
                    .unwrap_or_else(|| "La IA respondió sin texto utilizable.".to_string())
            }
            Err(error) => {
                return provider_error_response(
                    project_id,
                    document_id,
                    &interaction_id,
                    &event_id,
                    &created_at,
                    &format!("No se pudo leer la respuesta de OpenAI: {error}"),
                    execution_mode,
                    reasoning_depth,
                    mode,
                )
            }
        },
        Ok(response) => {
            let status = response.status();
            let detail = response.text().unwrap_or_default();
            return provider_error_response(
                project_id,
                document_id,
                &interaction_id,
                &event_id,
                &created_at,
                &format!(
                    "OpenAI devolvió {status}: {}",
                    summarize_error_detail(&detail)
                ),
                execution_mode,
                reasoning_depth,
                mode,
            );
        }
        Err(error) => {
            return provider_error_response(
                project_id,
                document_id,
                &interaction_id,
                &event_id,
                &created_at,
                &format!("No se pudo conectar con OpenAI: {error}"),
                execution_mode,
                reasoning_depth,
                mode,
            )
        }
    };

    if let Some(mut response) = structured_interaction_response(
        project_id,
        payload,
        document_id,
        &interaction_id,
        &event_id,
        &created_at,
        &provider_text,
        execution_mode,
        reasoning_depth,
        mode,
        &context_sources,
    ) {
        apply_skill_context_to_response(&mut response, payload, &skill_context);
        attach_usage_records(&mut response, usage_records);
        return response;
    }

    if looks_like_structured_payload(&provider_text) {
        return provider_error_response(
            project_id,
            document_id,
            &interaction_id,
            &event_id,
            &created_at,
            "La IA devolvió una propuesta estructurada incompleta o no validable. Vuelve a intentarlo con un alcance más pequeño.",
            execution_mode,
            reasoning_depth,
            mode,
        );
    }

    let public_context_sources = public_context_sources(&context_sources);
    let assistant_event = json!({
        "id": event_id,
        "projectId": project_id,
        "type": "assistant_message",
        "role": "assistant",
        "content": provider_text,
        "createdAt": created_at,
        "documentId": document_id,
        "path": null,
        "paths": [],
        "summary": null,
        "sourcesUsed": public_context_sources,
    });

    let mut response = json!({
        "interactionId": interaction_id,
        "status": "completed",
        "display": "bubble",
        "uiPlacement": if mode == "project" { "conversation_tab" } else { "document_bubble" },
        "interactionType": "chat",
        "confidence": "medium",
        "executionMode": execution_mode,
        "reasoningDepth": reasoning_depth,
        "executionScope": "direct_action",
        "routeToAiTab": mode == "project",
        "needsUserClarification": false,
        "pendingIntent": null,
        "pendingIntentStatus": null,
        "editProposal": null,
        "editProposalStatus": null,
        "answer": assistant_event["content"],
        "conversationEvents": [assistant_event],
        "operations": [],
        "updatedDocument": null,
        "generatedImages": [],
        "task": null,
        "tree": null,
        "affectedDocuments": [],
        "requiresConfirmation": null,
        "contextSources": null,
        "expiredContextSourceIds": []
    });
    apply_skill_context_to_response(&mut response, payload, &skill_context);
    attach_usage_records(&mut response, usage_records);
    response
}

pub fn prompt_response(
    prompt: &str,
    active_markdown: &str,
    document_id: Option<&str>,
    openai_key: Option<&str>,
    model: &str,
) -> Value {
    let request = prompt_payload(prompt, active_markdown, document_id);
    let response = answer_interaction("prompt", &request, json!([]), openai_key, model);
    json!({
        "answer": response["answer"].clone(),
        "usageRecords": response["usageRecords"].clone(),
        "suggestedActions": if response["status"].as_str() == Some("completed") {
            json!(["Revisar el documento activo", "Crear una versión", "Actualizar notas"])
        } else {
            json!(["Configurar OpenAI", "Revisar ajustes de IA"])
        }
    })
}

pub fn run_research(
    brief: &Value,
    context_sources: &Value,
    openai_key: Option<&str>,
    model: &str,
) -> Value {
    let Some(openai_key) = openai_key.filter(|value| !value.trim().is_empty()) else {
        return json!({
            "status": "failed",
            "message": "Configura una API key de OpenAI en Ajustes > IA para ejecutar investigaciones.",
            "markdown": null,
            "sources": [],
            "evidence": [],
            "usageRecords": []
        });
    };

    let skill_context =
        knownext_ai_skills::select_skills_for_request(&research_skill_payload(brief), None);
    let request_body = build_research_request(brief, context_sources, model, &skill_context);
    let response = openai_client(openai_key)
        .post("https://api.openai.com/v1/responses")
        .json(&request_body)
        .send();

    match response {
        Ok(response) if response.status().is_success() => match response.json::<Value>() {
            Ok(value) => {
                let text = extract_response_text(&value).unwrap_or_default();
                let parsed = serde_json::from_str::<Value>(&text).unwrap_or_else(|_| {
                    json!({
                        "markdown": text,
                        "sources": [],
                        "evidence": []
                    })
                });
                let mut diagnostics = skill_context.diagnostics.clone();
                let markdown = parsed
                    .get("markdown")
                    .and_then(Value::as_str)
                    .unwrap_or("")
                    .trim();
                diagnostics.extend(validate_research_markdown(markdown, brief, &skill_context));
                let mut result = json!({
                    "status": "ready",
                    "message": "Investigación completada.",
                    "markdown": markdown,
                    "sources": parsed.get("sources").cloned().unwrap_or_else(|| json!([])),
                    "evidence": parsed.get("evidence").cloned().unwrap_or_else(|| json!([])),
                    "visualRequests": parsed.get("visualRequests").cloned().unwrap_or_else(|| json!([])),
                    "usedSkills": skill_context.used_skill_ids.clone(),
                    "skillApplications": skill_context.applications.clone(),
                    "skillDiagnostics": diagnostics,
                    "usageRecords": []
                });
                if result["markdown"].as_str().unwrap_or("").is_empty() {
                    result["status"] = Value::from("failed");
                    result["message"] = Value::from(
                        "La investigación no devolvió un documento Markdown utilizable.",
                    );
                }
                if let Some(usage) = provider_usage_record("agentic_tasks", model, &value) {
                    result["usageRecords"] = json!([usage]);
                }
                result
            }
            Err(error) => json!({
                "status": "failed",
                "message": format!("No se pudo leer la respuesta de OpenAI: {error}"),
                "markdown": null,
                "sources": [],
                "evidence": [],
                "usageRecords": []
            }),
        },
        Ok(response) => {
            let status = response.status();
            let detail = response.text().unwrap_or_default();
            json!({
                "status": "failed",
                "message": format!("OpenAI devolvió {status}: {}", summarize_error_detail(&detail)),
                "markdown": null,
                "sources": [],
                "evidence": [],
                "usageRecords": []
            })
        }
        Err(error) => json!({
            "status": "failed",
            "message": format!("No se pudo conectar con OpenAI: {error}"),
            "markdown": null,
            "sources": [],
            "evidence": [],
            "usageRecords": []
        }),
    }
}

pub fn run_research_step(
    openai_key: Option<&str>,
    model: &str,
    step: &str,
    payload: &Value,
    use_web: bool,
) -> Value {
    let Some(openai_key) = openai_key.filter(|value| !value.trim().is_empty()) else {
        return json!({
            "status": "failed",
            "message": "Configura una API key de OpenAI en Ajustes > IA para ejecutar investigaciones.",
            "body": null,
            "usageRecords": []
        });
    };
    let request_body = build_research_step_request(step, payload, model, use_web);
    let response = openai_client(openai_key)
        .post("https://api.openai.com/v1/responses")
        .json(&request_body)
        .send();
    match response {
        Ok(response) if response.status().is_success() => match response.json::<Value>() {
            Ok(value) => {
                let text = extract_response_text(&value).unwrap_or_default();
                let body = serde_json::from_str::<Value>(&text).unwrap_or_else(|_| {
                    json!({
                        "markdown": text
                    })
                });
                let usage_records = provider_usage_record("agentic_tasks", model, &value)
                    .map(|usage| json!([usage]))
                    .unwrap_or_else(|| json!([]));
                json!({
                    "status": "ready",
                    "message": "Paso de investigación completado.",
                    "body": body,
                    "usageRecords": usage_records
                })
            }
            Err(error) => json!({
                "status": "failed",
                "message": format!("No se pudo leer la respuesta de OpenAI: {error}"),
                "body": null,
                "usageRecords": []
            }),
        },
        Ok(response) => {
            let status = response.status();
            let detail = response.text().unwrap_or_default();
            json!({
                "status": "failed",
                "message": format!("OpenAI devolvió {status}: {}", summarize_error_detail(&detail)),
                "body": null,
                "usageRecords": []
            })
        }
        Err(error) => json!({
            "status": "failed",
            "message": format!("No se pudo conectar con OpenAI: {error}"),
            "body": null,
            "usageRecords": []
        }),
    }
}

fn build_research_step_request(step: &str, payload: &Value, model: &str, use_web: bool) -> Value {
    let system = match step {
        "search" => concat!(
            "Eres el SearchWorker de KnowNext.ai. Descubre fuentes candidatas para una investigación profesional. ",
            "No redactes conclusiones. Devuelve únicamente fuentes candidatas con título, URL si existe, extracto breve, confianza, objectiveIndex y aspectIndex. ",
            "Prioriza fuentes primarias, documentación oficial, reguladores, investigaciones, medios especializados y fuentes independientes."
        ),
        "evidence" => concat!(
            "Eres el EvidenceExtractorWorker de KnowNext.ai. Extrae evidencias solo desde sourceReads. ",
            "Cada evidencia debe tener sourceId, claim, excerpt, confidence, objectiveIndex y aspectIndex. ",
            "No inventes claims ni uses conocimiento externo."
        ),
        "synthesize" => concat!(
            "Eres el SynthesizerWorker de KnowNext.ai. Consolida hallazgos únicamente desde evidencias. ",
            "Cada finding debe citar evidenceIds existentes. No generes findings sin evidencias."
        ),
        "write" => concat!(
            "Eres el WriterWorker de KnowNext.ai. Redacta un informe Markdown profesional solo desde plan, strategy, findings y evidence. ",
            "No inventes fuentes ni afirmaciones. Incluye fuentes consultadas, limitaciones y contradicciones/incertidumbres. ",
            "Respeta strategy.reportLength, strategy.targetWordRange, strategy.targetSectionCount, strategy.maxHeadingDepth y strategy.allowAppendices: ajustan extension, sintesis, estructura y anexos. ",
            "No rellenes para alcanzar longitud si no hay evidencias suficientes; declara limitaciones en su lugar. ",
            "Usa tablas cuando aclaren comparativas, riesgos, criterios o datos. ",
            "Incluye Mermaid solo si allowedVisuals.diagramsEnabled es true y aporta claridad. ",
            "Solicita imágenes en visualRequests solo si allowedVisuals.imagesEnabled es true y aportan valor; no inventes rutas de assets."
        ),
        _ => "Eres un worker de investigación de KnowNext.ai. Devuelve JSON estricto validable.",
    };
    let mut tools = Vec::new();
    if use_web {
        let candidate_limit = payload
            .pointer("/strategy/candidateSourceLimit")
            .and_then(Value::as_u64)
            .unwrap_or(50);
        tools.push(json!({
            "type": "web_search",
            "search_context_size": if candidate_limit > 200 { "high" } else if candidate_limit > 50 { "medium" } else { "low" }
        }));
    }
    let mut request = json!({
        "model": normalize_text_model(model),
        "input": [
            { "role": "system", "content": system },
            { "role": "user", "content": serde_json::to_string_pretty(payload).unwrap_or_else(|_| "{}".to_string()) }
        ],
        "max_output_tokens": research_step_max_tokens(step),
        "text": { "format": research_step_output_format(step) }
    });
    if !tools.is_empty() {
        request["tools"] = Value::Array(tools);
    }
    request
}

fn research_step_max_tokens(step: &str) -> u64 {
    match step {
        "search" => 7000,
        "evidence" => 9000,
        "synthesize" => 7000,
        "write" => 12000,
        _ => 5000,
    }
}

fn research_step_output_format(step: &str) -> Value {
    let schema = match step {
        "search" => json!({
            "type": "object",
            "additionalProperties": false,
            "required": ["candidates"],
            "properties": {
                "candidates": {
                    "type": "array",
                    "items": research_source_candidate_schema()
                }
            }
        }),
        "evidence" => json!({
            "type": "object",
            "additionalProperties": false,
            "required": ["evidence"],
            "properties": {
                "evidence": {
                    "type": "array",
                    "items": research_evidence_schema()
                }
            }
        }),
        "synthesize" => json!({
            "type": "object",
            "additionalProperties": false,
            "required": ["findings", "researchFindings"],
            "properties": {
                "findings": {
                    "type": "array",
                    "items": research_finding_schema()
                },
                "researchFindings": {
                    "type": "array",
                    "items": { "type": "string" }
                }
            }
        }),
        "write" => json!({
            "type": "object",
            "additionalProperties": false,
            "required": ["markdown", "visualRequests"],
            "properties": {
                "markdown": { "type": "string" },
                "visualRequests": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "additionalProperties": false,
                        "required": ["id", "kind", "title", "prompt", "altText", "placementHint"],
                        "properties": {
                            "id": { "type": "string" },
                            "kind": { "enum": ["image"] },
                            "title": { "type": "string" },
                            "prompt": { "type": "string" },
                            "altText": { "type": "string" },
                            "placementHint": { "type": ["string", "null"] }
                        }
                    }
                }
            }
        }),
        _ => json!({
            "type": "object",
            "additionalProperties": true,
            "properties": {}
        }),
    };
    json!({
        "type": "json_schema",
        "name": format!("knownext_research_{step}"),
        "strict": true,
        "schema": schema
    })
}

fn research_source_candidate_schema() -> Value {
    json!({
        "type": "object",
        "additionalProperties": false,
        "required": ["id", "title", "url", "path", "kind", "consultedAt", "confidence", "usedFragments", "snapshotExcerpt", "query", "objectiveIndex", "aspectIndex"],
        "properties": {
            "id": { "type": "string" },
            "title": { "type": "string" },
            "url": { "type": ["string", "null"] },
            "path": { "type": ["string", "null"] },
            "kind": { "enum": ["web", "project_document", "local_file"] },
            "consultedAt": { "type": "string" },
            "confidence": { "type": "number" },
            "usedFragments": { "type": "array", "items": { "type": "string" } },
            "snapshotExcerpt": { "type": "string" },
            "query": { "type": "string" },
            "objectiveIndex": { "type": "integer" },
            "aspectIndex": { "type": "integer" }
        }
    })
}

fn research_evidence_schema() -> Value {
    json!({
        "type": "object",
        "additionalProperties": false,
        "required": ["id", "sourceId", "claim", "excerpt", "confidence", "consultedAt", "sourceKind", "objectiveIndex", "aspectIndex"],
        "properties": {
            "id": { "type": "string" },
            "sourceId": { "type": "string" },
            "claim": { "type": "string" },
            "excerpt": { "type": "string" },
            "confidence": { "type": "number" },
            "consultedAt": { "type": "string" },
            "sourceKind": { "enum": ["web", "project_document", "local_file"] },
            "objectiveIndex": { "type": "integer" },
            "aspectIndex": { "type": "integer" }
        }
    })
}

fn research_finding_schema() -> Value {
    json!({
        "type": "object",
        "additionalProperties": false,
        "required": ["id", "title", "summary", "evidenceIds", "objectiveIndex", "aspectIndex", "confidence"],
        "properties": {
            "id": { "type": "string" },
            "title": { "type": "string" },
            "summary": { "type": "string" },
            "evidenceIds": { "type": "array", "items": { "type": "string" } },
            "objectiveIndex": { "type": "integer" },
            "aspectIndex": { "type": "integer" },
            "confidence": { "type": "number" }
        }
    })
}

fn build_research_request(
    brief: &Value,
    context_sources: &Value,
    model: &str,
    skill_context: &knownext_ai_skills::SkillRuntimeContext,
) -> Value {
    let source_scope = brief
        .get("sourceScope")
        .and_then(Value::as_str)
        .unwrap_or("web_project");
    let max_sources = brief
        .get("candidateSourceLimit")
        .and_then(Value::as_u64)
        .or_else(|| brief.get("maxSources").and_then(Value::as_u64))
        .unwrap_or(500);
    let system = concat!(
        "Eres el investigador documental de KnowNext.ai. ",
        "Realiza investigaciones profesionales, verificables y útiles para documentación de proyecto. ",
        "La busqueda web es obligatoria en investigaciones ejecutables; usa el contexto del proyecto solo cuando venga resuelto en projectContextSources. ",
        "Trabaja en dos fases internas: primero investiga, lee fuentes, extrae evidencias, contradicciones y hallazgos; despues redacta el informe desde esos hallazgos. ",
        "Responde siempre en JSON estricto con researchFindings, markdown, sources, evidence y visualRequests. ",
        "El markdown debe incluir estas secciones: Título, Resumen ejecutivo, Objetivo y alcance, Metodología, Fuentes consultadas, Hallazgos principales, Análisis contrastado, Riesgos, contradicciones e incertidumbres, Conclusiones, Recomendaciones y Limitaciones. ",
        "Si el brief incluye plan, usa primaryObjective, secondaryObjectives, researchAspects y recommendedReportStyle como guía principal; respeta el plan revisado por el usuario salvo que entre en conflicto con seguridad o veracidad. ",
        "Respeta plan.reportLength y plan.candidateSourceLimit: las fuentes candidatas definen alcance de busqueda y contraste; la extension define nivel de detalle, profundidad de estructura y anexos. ",
        "Para informes breves sintetiza; para estandar equilibra detalle; para amplios y exhaustivos profundiza con secciones y anexos solo si hay evidencias. ",
        "No inventes fuentes. Si una afirmación relevante no está suficientemente respaldada, márcala como no concluyente. ",
        "Las citas son obligatorias para afirmaciones relevantes. Usa citas Markdown enlazadas cuando haya URL. Separa hechos, interpretación y recomendación. ",
        "Las tablas siempre están disponibles: úsalas cuando haya comparación, criterios, riesgos, pros/contras, fuentes o datos que se entiendan mejor en tabla. ",
        "No modifiques documentos existentes. ",
        "Incluye diagramas Mermaid solo si reportProfile.diagramsEnabled es true y aportan claridad real. ",
        "Solicita imagenes solo si reportProfile.imagesEnabled es true y aportan claridad real. ",
        "Para imagenes generadas, no insertes rutas inventadas; devuelve visualRequests con prompt y altText para que el runtime cree assets locales."
    );
    let user_content = json!({
        "brief": brief,
        "sourceScope": source_scope,
        "maxSources": max_sources,
        "projectContextSources": context_sources,
        "activeSkills": skill_context.used_skill_ids.clone(),
        "skillGuidance": skill_context.prompt_guidance
    });
    let mut tools = Vec::new();
    if matches!(source_scope, "web" | "web_project") {
        tools.push(json!({
            "type": "web_search",
            "search_context_size": if max_sources > 200 { "high" } else if max_sources > 50 { "medium" } else { "low" }
        }));
    }
    let mut request = json!({
        "model": normalize_text_model(model),
        "input": [
            { "role": "system", "content": system },
            { "role": "system", "content": skill_context.prompt_guidance },
            { "role": "user", "content": serde_json::to_string_pretty(&user_content).unwrap_or_else(|_| "{}".to_string()) }
        ],
        "max_output_tokens": 12000,
        "text": { "format": research_output_format() }
    });
    if !tools.is_empty() {
        request["tools"] = Value::Array(tools);
    }
    request
}

fn research_skill_payload(brief: &Value) -> Value {
    let mut research_profile = brief.get("reportProfile").cloned().unwrap_or_else(|| {
        json!({
            "diagramsEnabled": false,
            "imagesEnabled": false
        })
    });
    if let Some(profile) = research_profile.as_object_mut() {
        if let Some(style) = brief
            .pointer("/plan/recommendedReportStyle")
            .and_then(Value::as_str)
        {
            profile.insert("recommendedReportStyle".to_string(), Value::from(style));
        }
    }
    json!({
        "prompt": brief.get("topic").and_then(Value::as_str).unwrap_or("Investigación"),
        "expectedAction": "create_research_report",
        "executionMode": "reasoning",
        "researchProfile": research_profile,
        "runtimeAi": {
            "diagrams": {
                "enabled": true,
                "visualProfile": "visual_local",
                "iconSet": "lucide",
                "imagePolicy": "project_assets",
                "betaPolicy": "ask"
            }
        }
    })
}

fn validate_research_markdown(
    markdown: &str,
    brief: &Value,
    skill_context: &knownext_ai_skills::SkillRuntimeContext,
) -> Vec<knownext_ai_skills::AiSkillDiagnostic> {
    let mut diagnostics = Vec::new();
    let used = skill_context
        .used_skill_ids
        .iter()
        .map(String::as_str)
        .collect::<BTreeSet<_>>();
    if used.contains("knownext.markdown") && markdown.contains('|') {
        diagnostics.extend(knownext_ai_skills::validate_markdown_table(markdown));
    }
    if used.contains("knownext.mermaid") {
        for code in extract_mermaid_blocks(markdown) {
            diagnostics.extend(knownext_ai_skills::validate_mermaid_diagram(
                &code,
                None,
                &research_skill_payload(brief),
            ));
        }
    }
    diagnostics
}

fn extract_mermaid_blocks(markdown: &str) -> Vec<String> {
    let mut blocks = Vec::new();
    let mut current = Vec::new();
    let mut in_mermaid = false;
    for line in markdown.lines() {
        let trimmed = line.trim();
        if !in_mermaid && trimmed.eq_ignore_ascii_case("```mermaid") {
            in_mermaid = true;
            current.clear();
            continue;
        }
        if in_mermaid && trimmed == "```" {
            in_mermaid = false;
            if !current.is_empty() {
                blocks.push(current.join("\n"));
            }
            current.clear();
            continue;
        }
        if in_mermaid {
            current.push(line.to_string());
        }
    }
    blocks
}

fn research_output_format() -> Value {
    json!({
        "type": "json_schema",
        "name": "knownext_research_result",
        "strict": true,
        "schema": {
            "type": "object",
            "additionalProperties": false,
            "required": ["researchFindings", "markdown", "sources", "evidence", "visualRequests"],
            "properties": {
                "researchFindings": {
                    "type": "array",
                    "items": { "type": "string" }
                },
                "markdown": { "type": "string" },
                "sources": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "additionalProperties": false,
                        "required": ["id", "title", "url", "path", "kind", "consultedAt", "confidence", "usedFragments", "status", "snapshotExcerpt"],
                        "properties": {
                            "id": { "type": "string" },
                            "title": { "type": "string" },
                            "url": { "type": ["string", "null"] },
                            "path": { "type": ["string", "null"] },
                            "kind": { "enum": ["web", "project_document", "external_file"] },
                            "consultedAt": { "type": "string" },
                            "confidence": { "enum": ["high", "medium", "low"] },
                            "usedFragments": { "type": "array", "items": { "type": "string" } },
                            "status": { "enum": ["pending", "read", "used", "rejected", "unavailable"] },
                            "snapshotExcerpt": { "type": ["string", "null"] }
                        }
                    }
                },
                "evidence": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "additionalProperties": false,
                        "required": ["id", "sourceId", "claim", "excerpt", "confidence", "consultedAt", "sourceKind"],
                        "properties": {
                            "id": { "type": "string" },
                            "sourceId": { "type": "string" },
                            "claim": { "type": "string" },
                            "excerpt": { "type": "string" },
                            "confidence": { "enum": ["high", "medium", "low"] },
                            "consultedAt": { "type": ["string", "null"] },
                            "sourceKind": { "enum": ["web", "project_document", "external_file"] }
                        }
                    }
                },
                "visualRequests": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "additionalProperties": false,
                        "required": ["id", "kind", "title", "prompt", "altText", "placementHint"],
                        "properties": {
                            "id": { "type": "string" },
                            "kind": { "enum": ["image"] },
                            "title": { "type": "string" },
                            "prompt": { "type": "string" },
                            "altText": { "type": "string" },
                            "placementHint": { "type": ["string", "null"] }
                        }
                    }
                }
            }
        }
    })
}

fn prompt_payload(prompt: &str, active_markdown: &str, document_id: Option<&str>) -> Value {
    json!({
        "prompt": prompt,
        "activeMarkdown": active_markdown,
        "documentId": document_id,
        "mode": if document_id.is_some() { "document" } else { "project" }
    })
}

pub fn transcribe_audio(
    openai_key: Option<&str>,
    language: Option<&str>,
    wav_bytes: Vec<u8>,
) -> Value {
    let Some(openai_key) = openai_key.filter(|value| !value.trim().is_empty()) else {
        return json!({
            "status": "error",
            "error": "provider_unavailable",
            "transcript": "",
            "message": "Configura una API key de OpenAI en Ajustes > IA para usar transcripción."
        });
    };

    if wav_bytes.is_empty() {
        return json!({
            "status": "error",
            "error": "empty_audio",
            "transcript": "",
            "message": "No se recibió audio para transcribir."
        });
    }

    let mut form = multipart::Form::new()
        .text("model", "gpt-4o-mini-transcribe")
        .text("response_format", "json")
        .part(
            "file",
            multipart::Part::bytes(wav_bytes)
                .file_name("knownext-dictation.wav")
                .mime_str("audio/wav")
                .unwrap_or_else(|_| multipart::Part::bytes(Vec::new())),
        );
    if let Some(language) = language.filter(|value| *value != "auto" && !value.is_empty()) {
        form = form.text("language", language.to_string());
    }

    let response = openai_client(openai_key)
        .post("https://api.openai.com/v1/audio/transcriptions")
        .multipart(form)
        .send();

    match response {
        Ok(response) if response.status().is_success() => {
            let body = response.json::<Value>().unwrap_or_else(|_| json!({}));
            let transcript = body["text"].as_str().unwrap_or("").trim().to_string();
            json!({ "status": "completed", "transcript": transcript })
        }
        Ok(response) => {
            let status = response.status();
            let detail = response.text().unwrap_or_default();
            json!({
                "status": "error",
                "error": "provider_error",
                "transcript": "",
                "message": format!("OpenAI devolvió {status}: {}", summarize_error_detail(&detail))
            })
        }
        Err(error) => json!({
            "status": "error",
            "error": "provider_error",
            "transcript": "",
            "message": format!("No se pudo conectar con OpenAI: {error}")
        }),
    }
}

pub fn generate_image(openai_key: Option<&str>, config: &Value, prompt: &str) -> Value {
    let prompt = prompt.trim();
    let Some(openai_key) = openai_key.filter(|value| !value.trim().is_empty()) else {
        return json!({
            "status": "error",
            "error": "provider_unavailable",
            "message": "Configura una API key de OpenAI en Ajustes > IA para generar imágenes."
        });
    };
    if prompt.is_empty() {
        return json!({
            "status": "error",
            "error": "empty_prompt",
            "message": "La generación de imagen necesita un prompt validable."
        });
    }

    let model = normalize_image_model(
        config
            .get("model")
            .and_then(Value::as_str)
            .unwrap_or("gpt-image-2"),
    );
    let mut request = json!({
        "model": model,
        "prompt": prompt,
        "n": config.get("maxImagesPerPrompt").and_then(Value::as_u64).unwrap_or(1).clamp(1, 4),
        "size": normalize_image_size_for_model(model, config.get("size").and_then(Value::as_str).unwrap_or("auto")),
        "quality": normalize_image_quality(config.get("quality").and_then(Value::as_str).unwrap_or("auto")),
        "output_format": normalize_image_format(config.get("outputFormat").and_then(Value::as_str).unwrap_or("png"))
    });
    if request["size"].as_str() == Some("auto") {
        request.as_object_mut().map(|object| object.remove("size"));
    }
    if request["quality"].as_str() == Some("auto") {
        request
            .as_object_mut()
            .map(|object| object.remove("quality"));
    }

    let response = openai_client(openai_key)
        .post("https://api.openai.com/v1/images/generations")
        .json(&request)
        .send();

    match response {
        Ok(response) if response.status().is_success() => {
            let body = response.json::<Value>().unwrap_or_else(|_| json!({}));
            let Some(item) = body
                .get("data")
                .and_then(Value::as_array)
                .and_then(|items| items.first())
            else {
                return json!({
                    "status": "error",
                    "error": "provider_error",
                    "message": "OpenAI no devolvió datos de imagen."
                });
            };
            if let Some(data_base64) = item
                .get("b64_json")
                .and_then(Value::as_str)
                .filter(|value| !value.trim().is_empty())
            {
                return json!({
                    "status": "completed",
                    "mimeType": mime_for_image_format(request["output_format"].as_str().unwrap_or("png")),
                    "dataBase64": data_base64,
                    "revisedPrompt": item.get("revised_prompt").and_then(Value::as_str),
                    "model": request["model"].as_str().unwrap_or("gpt-image-2"),
                    "size": request.get("size").and_then(Value::as_str).unwrap_or("auto"),
                    "quality": request.get("quality").and_then(Value::as_str).unwrap_or("auto"),
                    "format": request["output_format"].as_str().unwrap_or("png")
                });
            }
            if let Some(url) = item
                .get("url")
                .and_then(Value::as_str)
                .filter(|value| !value.trim().is_empty())
            {
                return match openai_client(openai_key).get(url).send() {
                    Ok(image_response) if image_response.status().is_success() => {
                        let mime = image_response
                            .headers()
                            .get("content-type")
                            .and_then(|value| value.to_str().ok())
                            .unwrap_or_else(|| {
                                mime_for_image_format(
                                    request["output_format"].as_str().unwrap_or("png"),
                                )
                            })
                            .to_string();
                        let bytes = image_response
                            .bytes()
                            .map(|bytes| bytes.to_vec())
                            .unwrap_or_default();
                        json!({
                            "status": "completed",
                            "mimeType": mime,
                            "dataBase64": base64::engine::general_purpose::STANDARD.encode(bytes),
                            "revisedPrompt": item.get("revised_prompt").and_then(Value::as_str),
                            "model": request["model"].as_str().unwrap_or("gpt-image-2"),
                            "size": request.get("size").and_then(Value::as_str).unwrap_or("auto"),
                            "quality": request.get("quality").and_then(Value::as_str).unwrap_or("auto"),
                            "format": request["output_format"].as_str().unwrap_or("png")
                        })
                    }
                    Ok(image_response) => json!({
                        "status": "error",
                        "error": "provider_error",
                        "message": format!("OpenAI devolvió {} al descargar la imagen.", image_response.status())
                    }),
                    Err(error) => json!({
                        "status": "error",
                        "error": "provider_error",
                        "message": format!("No se pudo descargar la imagen generada: {error}")
                    }),
                };
            }
            json!({
                "status": "error",
                "error": "provider_error",
                "message": "OpenAI no devolvió base64 ni URL para la imagen."
            })
        }
        Ok(response) => {
            let status = response.status();
            let detail = response.text().unwrap_or_default();
            json!({
                "status": "error",
                "error": "provider_error",
                "message": format!("OpenAI devolvió {status}: {}", summarize_error_detail(&detail))
            })
        }
        Err(error) => json!({
            "status": "error",
            "error": "provider_error",
            "message": format!("No se pudo conectar con OpenAI: {error}")
        }),
    }
}

fn build_response_request(
    payload: &Value,
    prompt: &str,
    context_sources: &Value,
    model: &str,
    skill_context: &knownext_ai_skills::SkillRuntimeContext,
) -> Value {
    let active_markdown = payload
        .get("activeMarkdown")
        .and_then(Value::as_str)
        .unwrap_or("");
    let selection = payload
        .get("selectionFocus")
        .filter(|value| !value.is_null())
        .cloned()
        .unwrap_or(Value::Null);
    let permissions = payload
        .get("runtimePermissions")
        .cloned()
        .unwrap_or_else(|| json!({}));
    let execution_mode =
        normalize_execution_mode(payload.get("executionMode").and_then(Value::as_str));
    let reasoning_depth = if execution_mode == "quick" {
        "light"
    } else {
        normalize_reasoning_depth(payload.get("reasoningDepth").and_then(Value::as_str))
    };
    let reasoning_guidance = reasoning_instruction(execution_mode, reasoning_depth);
    let diagram_guidance = skill_context.prompt_guidance.as_str();
    let intent_guidance = match payload.pointer("/intent/kind").and_then(Value::as_str) {
        Some("image") => "Intencion manual activa: crear imagen. Si hay documento activo, usa action generate_image salvo que falten permisos.",
        Some("diagram") => "Intencion manual activa: crear diagrama. Usa action insert_diagram con Mermaid valido o crea documento con Mermaid si no hay documento activo.",
        Some("research") => "Intencion manual activa: investigacion. Si llega a este flujo, resume que la investigacion debe prepararse como tarea guiada.",
        _ => "",
    };
    let system = format!(
        "{} {} {} {}",
        concat!(
        "Eres el asistente documental de KnowNext.ai. Responde en español salvo que el usuario pida otro idioma. ",
        "Usa el documento activo y las fuentes aportadas como contexto. ",
        "Devuelve siempre un JSON sin markdown externo ni bloques de codigo. ",
        "Contrato de salida: {\"action\":\"answer\",\"answer\":\"texto\"} para consultas; ",
        "{\"action\":\"replace_selection\",\"answer\":\"resumen para el usuario\",\"summary\":\"resumen breve\",\"replacementMarkdown\":\"markdown que sustituye solo la seleccion\"} para reemplazar texto seleccionado. ",
        "{\"action\":\"insert_at_cursor\",\"answer\":\"resumen para el usuario\",\"summary\":\"resumen breve\",\"markdown\":\"markdown a insertar en el cursor\"} para insertar contenido en el cursor activo. ",
        "{\"action\":\"insert_image\",\"answer\":\"resumen para el usuario\",\"summary\":\"resumen breve\",\"assetId\":\"id del asset\",\"altText\":\"texto alternativo\",\"placement\":{\"type\":\"at_cursor\"}} para insertar una imagen existente del proyecto. ",
        "{\"action\":\"insert_diagram\",\"answer\":\"resumen para el usuario\",\"summary\":\"resumen breve\",\"diagramCode\":\"codigo Mermaid sin fences\",\"diagramCaption\":\"pie opcional\",\"placement\":{\"type\":\"after_heading\",\"headingPath\":[\"titulo\"],\"anchorExcerpt\":null}} para insertar un diagrama Mermaid editable en el documento. ",
        "{\"action\":\"edit_document\",\"answer\":\"resumen para el usuario\",\"summary\":\"resumen breve\",\"patches\":[...]} para cambios en varios apartados sin devolver el documento completo. ",
        "{\"action\":\"replace_document\",\"answer\":\"resumen para el usuario\",\"summary\":\"resumen breve\",\"markdown\":\"documento markdown completo\"} solo para reescrituras completas explicitas. ",
        "{\"action\":\"create_document\",\"answer\":\"resumen para el usuario\",\"summary\":\"resumen breve\",\"name\":\"nombre.md\",\"markdown\":\"documento markdown completo\"} para crear un documento Markdown nuevo cuando el usuario lo pida. ",
        "{\"action\":\"generate_image\",\"answer\":\"resumen para el usuario\",\"summary\":\"resumen breve\",\"prompt\":\"prompt visual detallado\",\"name\":\"nombre.png\",\"altText\":\"texto alternativo\",\"insertIntoDocument\":true,\"placement\":{\"type\":\"after_heading\",\"headingPath\":[\"titulo del apartado\"],\"anchorExcerpt\":null}} para generar una imagen local como asset del proyecto e insertarla en el documento. ",
        "No afirmes que has modificado archivos: devuelve una accion estructurada y el runtime la convertira en una propuesta revisable o una operacion validada segun permisos. ",
        "No afirmes que has creado archivos: propone el cambio con action create_document y el runtime lo validara contra permisos. ",
        "No afirmes que has generado imagenes: propone action generate_image y el runtime la creara, guardara e insertara si los permisos lo permiten. ",
        "KnowNext puede crear contenido con parrafos, listas, tablas Markdown, imagenes y diagramas Mermaid. Elige tablas para comparativas de datos, imagenes para contenido visual ilustrativo y diagramas Mermaid para procesos, arquitecturas, secuencias, estados, dependencias, journeys, organigramas, mapas conceptuales, datos ligeros y vistas tecnicas. ",
        "Cuando un diagrama ayude a explicar el contenido, usa action insert_diagram o incluye bloques ```mermaid en markdown de create_document/replace_document/insert_at_cursor. En action insert_diagram, diagramCode debe contener Mermaid valido sin fences y sin explicaciones externas. ",
        "Si el usuario pide incluir, anadir, insertar o apoyar el texto con una imagen y hay documento activo, no preguntes ubicacion ni respondas con action answer: usa action generate_image, insertIntoDocument true, altText descriptivo, placement elegido por ti y un prompt visual basado en el texto seleccionado, el cursor o el apartado activo. ",
        "El texto seleccionado puede ser solo contexto: no asumas que la imagen debe ir justo despues de la seleccion. Decide proactivamente donde encaja mejor la imagen. Usa placement con at_cursor, after_selection, after_heading, after_paragraph o document_end segun el documento y la peticion. ",
        "No uses action replace_document si no hay documento activo o si la peticion no requiere modificar contenido. ",
        "Si hay seleccion activa y el usuario pide modificarla, usa replace_selection. ",
        "Si no hay seleccion pero hay cursor y el usuario pide insertar, continuar o incluir contenido aqui, usa insert_at_cursor. ",
        "Para cambios sobre un concepto en varios apartados, usa edit_document con parches pequenos."
        ),
        reasoning_guidance,
        diagram_guidance,
        intent_guidance,
    );
    let user_content = format!(
        "Petición del usuario:\n{prompt}\n\nModo de ejecución:\n{} ({})\n\nPermisos runtime:\n{}\n\nDocumento activo Markdown:\n{active_markdown}\n\nSelección activa:\n{}\n\nFuentes de contexto:\n{}",
        execution_mode,
        reasoning_depth,
        serde_json::to_string_pretty(&permissions).unwrap_or_else(|_| "{}".to_string()),
        serde_json::to_string_pretty(&selection).unwrap_or_else(|_| "null".to_string()),
        serde_json::to_string_pretty(context_sources).unwrap_or_else(|_| "[]".to_string()),
    );
    json!({
        "model": normalize_text_model(model),
        "input": [
            { "role": "system", "content": system },
            { "role": "user", "content": user_content }
        ],
        "max_output_tokens": max_output_tokens_for_execution(execution_mode, reasoning_depth),
        "text": { "format": structured_output_format() }
    })
}

fn run_skill_selector(
    openai_key: &str,
    payload: &Value,
    prompt: &str,
    model: &str,
) -> Option<(knownext_ai_skills::AiSkillSelectorProposal, Option<Value>)> {
    let request_body = build_skill_selector_request(payload, prompt, model);
    let response = openai_client(openai_key)
        .post("https://api.openai.com/v1/responses")
        .json(&request_body)
        .send()
        .ok()?;
    if !response.status().is_success() {
        return None;
    }
    let value = response.json::<Value>().ok()?;
    let usage = provider_usage_record("document_ai", model, &value);
    let text = extract_response_text(&value)?;
    serde_json::from_str::<knownext_ai_skills::AiSkillSelectorProposal>(&text)
        .ok()
        .map(|proposal| (proposal, usage))
}

fn build_skill_selector_request(payload: &Value, prompt: &str, model: &str) -> Value {
    let candidates = knownext_ai_skills::selector_candidates_json(payload);
    let execution_mode =
        normalize_execution_mode(payload.get("executionMode").and_then(Value::as_str));
    let selection = payload
        .get("selectionFocus")
        .filter(|value| !value.is_null())
        .cloned()
        .unwrap_or(Value::Null);
    let user_content = json!({
        "prompt": prompt,
        "executionMode": execution_mode,
        "hasActiveDocument": payload.get("documentId").and_then(Value::as_str).is_some(),
        "hasSelection": selection.is_object(),
        "candidateSkills": candidates["candidateSkills"],
        "diagramConfig": payload.pointer("/clientContext/diagramConfig").or_else(|| payload.pointer("/runtimeAi/diagrams")).cloned().unwrap_or(Value::Null),
        "runtimePermissions": payload.get("runtimePermissions").cloned().unwrap_or_else(|| json!({}))
    });
    json!({
        "model": normalize_text_model(model),
        "input": [
            {
                "role": "system",
                "content": concat!(
                    "Eres el selector de skills de KnowNext.ai. ",
                    "Elige solo skills y modos relevantes desde candidateSkills. ",
                    "No ejecutes acciones, no pidas permisos y no inventes ids. ",
                    "Devuelve JSON estricto con selected. ",
                    "En modo quick elige como maximo una skill; en reasoning como maximo dos. ",
                    "Selecciona knownext.markdown/table cuando la tarea pida tablas Markdown. ",
                    "Selecciona knownext.mermaid con el modo diagram_* mas cercano cuando la tarea pida diagramas."
                )
            },
            { "role": "user", "content": serde_json::to_string(&user_content).unwrap_or_else(|_| "{}".to_string()) }
        ],
        "max_output_tokens": 900,
        "text": { "format": skill_selector_output_format() }
    })
}

fn skill_selector_output_format() -> Value {
    json!({
        "type": "json_schema",
        "name": "knownext_skill_selector",
        "strict": true,
        "schema": {
            "type": "object",
            "additionalProperties": false,
            "required": ["selected"],
            "properties": {
                "selected": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "additionalProperties": false,
                        "required": ["skillId", "modeId", "action", "confidence", "reason"],
                        "properties": {
                            "skillId": { "type": "string" },
                            "modeId": { "type": "string" },
                            "action": { "type": "string" },
                            "confidence": { "enum": ["high", "medium", "low"] },
                            "reason": { "type": "string" }
                        }
                    }
                }
            }
        }
    })
}

fn apply_skill_context_to_response(
    response: &mut Value,
    payload: &Value,
    base_context: &knownext_ai_skills::SkillRuntimeContext,
) {
    let mut used_skill_ids = base_context.used_skill_ids.clone();
    let mut applications = base_context.applications.clone();
    let mut diagnostics = base_context.diagnostics.clone();
    let mut blocking_message: Option<String> = None;

    let diagram_operations = response
        .pointer("/editProposal/operations")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .filter(|operation| {
            operation.get("action").and_then(Value::as_str) == Some("insert_diagram")
        })
        .collect::<Vec<_>>();

    for operation in diagram_operations {
        let diagram_code = operation
            .get("diagramCode")
            .and_then(Value::as_str)
            .unwrap_or("");
        let diagram_type = operation.get("diagramType").and_then(Value::as_str);
        let validation =
            knownext_ai_skills::validate_mermaid_diagram(diagram_code, diagram_type, payload);
        if knownext_ai_skills::diagnostics_have_errors(&validation) {
            blocking_message = Some(
                validation
                    .iter()
                    .find(|diagnostic| diagnostic.status == "error")
                    .map(|diagnostic| diagnostic.title.clone())
                    .unwrap_or_else(|| {
                        "La skill Mermaid bloqueo el diagrama propuesto.".to_string()
                    }),
            );
        }
        for diagnostic in validation {
            if !used_skill_ids.contains(&diagnostic.skill_id)
                && diagnostic.skill_id.starts_with("knownext.")
            {
                used_skill_ids.push(diagnostic.skill_id.clone());
            }
            diagnostics.push(diagnostic);
        }
    }

    if applications.iter().any(|application| {
        application.skill_id == "knownext.markdown"
            && application.mode_id == "table"
            && application.status == "applied"
    }) {
        let mut markdown_fragments = Vec::new();
        if let Some(answer) = response.get("answer").and_then(Value::as_str) {
            markdown_fragments.push(answer.to_string());
        }
        if let Some(operations) = response
            .pointer("/editProposal/operations")
            .and_then(Value::as_array)
        {
            for operation in operations {
                for key in ["markdown", "replacementMarkdown"] {
                    if let Some(markdown) = operation.get(key).and_then(Value::as_str) {
                        markdown_fragments.push(markdown.to_string());
                    }
                }
            }
        }
        if let Some(fragment) = markdown_fragments
            .iter()
            .find(|fragment| fragment.contains('|'))
        {
            diagnostics.extend(knownext_ai_skills::validate_markdown_table(fragment));
        }
    }

    used_skill_ids = unique_strings(used_skill_ids);
    applications = unique_applications(applications);
    diagnostics = unique_diagnostics(diagnostics);

    if let Some(message) = blocking_message {
        block_response_for_skill_error(response, &message);
    }

    response["usedSkills"] = json!(used_skill_ids);
    response["skillApplications"] = json!(applications);
    response["skillDiagnostics"] = json!(diagnostics);
    let used_skills_value = response["usedSkills"].clone();
    let skill_applications_value = response["skillApplications"].clone();
    let skill_diagnostics_value = response["skillDiagnostics"].clone();
    if let Some(events) = response["conversationEvents"].as_array_mut() {
        for event in events.iter_mut().filter(|event| {
            event.get("role").and_then(Value::as_str) == Some("assistant")
                || event.get("type").and_then(Value::as_str) == Some("permission_blocked")
        }) {
            event["usedSkills"] = used_skills_value.clone();
            event["skillApplications"] = skill_applications_value.clone();
            event["skillDiagnostics"] = skill_diagnostics_value.clone();
        }
    }
}

fn block_response_for_skill_error(response: &mut Value, message: &str) {
    let document_id = response
        .pointer("/editProposal/documentId")
        .cloned()
        .unwrap_or(Value::Null);
    response["status"] = Value::from("blocked");
    response["executionScope"] = Value::from("needs_permission");
    response["editProposal"] = Value::Null;
    response["editProposalStatus"] = Value::Null;
    response["updatedDocument"] = Value::Null;
    response["answer"] = Value::from(message.to_string());
    response["operations"] = json!([{
        "type": "permission_blocked",
        "status": "blocked",
        "message": message,
        "documentId": document_id,
        "nodeId": null,
        "path": null,
        "paths": [],
        "summary": message,
        "task": null,
        "confirmationId": null
    }]);
    if let Some(events) = response["conversationEvents"].as_array_mut() {
        for event in events
            .iter_mut()
            .filter(|event| event.get("role").and_then(Value::as_str) == Some("assistant"))
        {
            event["type"] = Value::from("permission_blocked");
            event["content"] = Value::from(message.to_string());
            event["summary"] = Value::from(message.to_string());
        }
    }
}

fn unique_strings(values: Vec<String>) -> Vec<String> {
    let mut seen = BTreeSet::new();
    values
        .into_iter()
        .filter(|value| seen.insert(value.clone()))
        .collect()
}

fn unique_diagnostics(
    diagnostics: Vec<knownext_ai_skills::AiSkillDiagnostic>,
) -> Vec<knownext_ai_skills::AiSkillDiagnostic> {
    let mut seen = BTreeSet::new();
    diagnostics
        .into_iter()
        .filter(|diagnostic| {
            seen.insert(format!(
                "{}:{}:{}",
                diagnostic.skill_id, diagnostic.status, diagnostic.title
            ))
        })
        .collect()
}

fn unique_applications(
    applications: Vec<knownext_ai_skills::AiSkillApplication>,
) -> Vec<knownext_ai_skills::AiSkillApplication> {
    let mut seen = BTreeSet::new();
    applications
        .into_iter()
        .filter(|application| {
            seen.insert(format!(
                "{}:{}:{}:{}",
                application.skill_id, application.mode_id, application.action, application.status
            ))
        })
        .collect()
}

fn structured_output_format() -> Value {
    let nullable_string = || json!({ "anyOf": [{ "type": "string" }, { "type": "null" }] });
    let nullable_number = || json!({ "anyOf": [{ "type": "integer" }, { "type": "null" }] });
    let string_array_or_null = || json!({ "anyOf": [{ "type": "array", "items": { "type": "string" } }, { "type": "null" }] });
    let placement_schema = json!({
        "type": "object",
        "additionalProperties": false,
        "required": ["type", "headingPath", "anchorExcerpt"],
        "properties": {
            "type": { "enum": ["at_cursor", "before_selection", "after_selection", "replace_selection", "after_heading", "after_paragraph", "document_end"] },
            "headingPath": string_array_or_null(),
            "anchorExcerpt": nullable_string()
        }
    });
    let patch_schema = json!({
        "type": "object",
        "additionalProperties": false,
        "required": ["id", "action", "documentId", "summary", "confidence", "from", "to", "position", "markdown", "replacementMarkdown", "headingPath", "originalExcerpt", "anchorExcerpt", "imageAssetId", "imageAltText", "diagramSyntax", "diagramType", "diagramCode", "diagramCaption", "placement"],
        "properties": {
            "id": nullable_string(),
            "action": { "enum": ["replace_selection", "insert_at_cursor", "edit_block", "edit_document", "edit_project", "insert_image", "insert_diagram", "replace_document"] },
            "documentId": nullable_string(),
            "summary": nullable_string(),
            "confidence": { "enum": ["high", "medium", "low"] },
            "from": nullable_number(),
            "to": nullable_number(),
            "position": nullable_number(),
            "markdown": nullable_string(),
            "replacementMarkdown": nullable_string(),
            "headingPath": string_array_or_null(),
            "originalExcerpt": nullable_string(),
            "anchorExcerpt": nullable_string(),
            "imageAssetId": nullable_string(),
            "imageAltText": nullable_string(),
            "diagramSyntax": nullable_string(),
            "diagramType": nullable_string(),
            "diagramCode": nullable_string(),
            "diagramCaption": nullable_string(),
            "placement": { "anyOf": [placement_schema.clone(), { "type": "null" }] }
        }
    });
    json!({
        "type": "json_schema",
        "name": "knownext_ai_interaction",
        "strict": true,
        "schema": {
            "type": "object",
            "additionalProperties": false,
            "required": ["action", "answer", "summary", "markdown", "replacementMarkdown", "name", "prompt", "assetId", "altText", "insertIntoDocument", "diagramSyntax", "diagramType", "diagramCode", "diagramCaption", "placement", "patches"],
            "properties": {
                "action": { "enum": ["answer", "replace_selection", "insert_at_cursor", "edit_document", "edit_project", "replace_document", "create_document", "generate_image", "insert_image", "insert_diagram"] },
                "answer": nullable_string(),
                "summary": nullable_string(),
                "markdown": nullable_string(),
                "replacementMarkdown": nullable_string(),
                "name": nullable_string(),
                "prompt": nullable_string(),
                "assetId": nullable_string(),
                "altText": nullable_string(),
                "insertIntoDocument": { "anyOf": [{ "type": "boolean" }, { "type": "null" }] },
                "diagramSyntax": nullable_string(),
                "diagramType": nullable_string(),
                "diagramCode": nullable_string(),
                "diagramCaption": nullable_string(),
                "placement": { "anyOf": [placement_schema.clone(), { "type": "null" }] },
                "patches": { "anyOf": [{ "type": "array", "items": patch_schema }, { "type": "null" }] }
            }
        }
    })
}

fn normalize_execution_mode(mode: Option<&str>) -> &'static str {
    match mode {
        Some("reasoning") => "reasoning",
        _ => "quick",
    }
}

fn normalize_reasoning_depth(depth: Option<&str>) -> &'static str {
    match depth {
        Some("medium") => "medium",
        Some("deep") => "deep",
        _ => "light",
    }
}

fn reasoning_instruction(execution_mode: &str, reasoning_depth: &str) -> &'static str {
    match (execution_mode, reasoning_depth) {
        ("reasoning", "deep") => "Modo Razonar profundo: haz un preflight interno exhaustivo sobre documento, seleccion y contexto aportado antes de responder; no uses fuentes externas no aportadas; conserva el contrato JSON de salida.",
        ("reasoning", "medium") => "Modo Razonar medio: revisa internamente documento, seleccion y contexto aportado antes de responder; no uses fuentes externas no aportadas; conserva el contrato JSON de salida.",
        ("reasoning", _) => "Modo Razonar ligero: contrasta internamente la peticion con el documento activo y el contexto aportado antes de responder; conserva el contrato JSON de salida.",
        _ => "Modo rapido: responde con una sola pasada directa usando solo el documento activo y el contexto aportado; conserva el contrato JSON de salida.",
    }
}

fn max_output_tokens_for_execution(execution_mode: &str, reasoning_depth: &str) -> u32 {
    match (execution_mode, reasoning_depth) {
        ("reasoning", "deep") => 10000,
        ("reasoning", "medium") => 8000,
        ("reasoning", _) => 6000,
        _ => 4000,
    }
}

fn provider_unavailable_response(
    project_id: &str,
    document_id: Option<&str>,
    interaction_id: &str,
    event_id: &str,
    created_at: &str,
    message: &str,
    execution_mode: &str,
    reasoning_depth: &str,
    mode: &str,
) -> Value {
    provider_status_response(
        project_id,
        document_id,
        interaction_id,
        event_id,
        created_at,
        message,
        "provider_unavailable",
        execution_mode,
        reasoning_depth,
        mode,
    )
}

fn provider_error_response(
    project_id: &str,
    document_id: Option<&str>,
    interaction_id: &str,
    event_id: &str,
    created_at: &str,
    message: &str,
    execution_mode: &str,
    reasoning_depth: &str,
    mode: &str,
) -> Value {
    provider_status_response(
        project_id,
        document_id,
        interaction_id,
        event_id,
        created_at,
        message,
        "provider_error",
        execution_mode,
        reasoning_depth,
        mode,
    )
}

fn provider_status_response(
    project_id: &str,
    document_id: Option<&str>,
    interaction_id: &str,
    event_id: &str,
    created_at: &str,
    message: &str,
    event_type: &str,
    execution_mode: &str,
    reasoning_depth: &str,
    mode: &str,
) -> Value {
    let event = json!({
        "id": event_id,
        "projectId": project_id,
        "type": event_type,
        "role": "assistant",
        "content": message,
        "createdAt": created_at,
        "documentId": document_id,
        "path": null,
        "paths": [],
        "summary": null,
        "sourcesUsed": [],
        "usedSkills": [],
        "skillApplications": [],
        "skillDiagnostics": []
    });
    json!({
        "interactionId": interaction_id,
        "status": "error",
        "display": "bubble",
        "uiPlacement": if mode == "project" { "conversation_tab" } else { "document_bubble" },
        "interactionType": "chat",
        "confidence": "high",
        "executionMode": execution_mode,
        "reasoningDepth": reasoning_depth,
        "executionScope": "needs_permission",
        "routeToAiTab": mode == "project",
        "needsUserClarification": false,
        "pendingIntent": null,
        "pendingIntentStatus": null,
        "editProposal": null,
        "editProposalStatus": null,
        "answer": message,
        "conversationEvents": [event],
        "operations": [{ "type": event_type }],
        "updatedDocument": null,
        "generatedImages": [],
        "task": null,
        "tree": null,
        "affectedDocuments": [],
        "requiresConfirmation": null,
        "contextSources": null,
        "expiredContextSourceIds": [],
        "usedSkills": [],
        "skillApplications": [],
        "skillDiagnostics": []
    })
}

#[allow(clippy::too_many_arguments)]
fn structured_interaction_response(
    project_id: &str,
    payload: &Value,
    document_id: Option<&str>,
    interaction_id: &str,
    event_id: &str,
    created_at: &str,
    provider_text: &str,
    execution_mode: &str,
    reasoning_depth: &str,
    mode: &str,
    context_sources: &Value,
) -> Option<Value> {
    let decision = parse_provider_decision(provider_text)?;
    let action = decision
        .get("action")
        .and_then(Value::as_str)
        .unwrap_or("answer");
    let answer = decision
        .get("answer")
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .unwrap_or(provider_text)
        .trim();

    if action == "answer" {
        return Some(chat_response(
            project_id,
            document_id,
            interaction_id,
            event_id,
            created_at,
            answer,
            execution_mode,
            reasoning_depth,
            mode,
            context_sources,
        ));
    }

    if action == "create_document" {
        return Some(create_document_response(
            project_id,
            payload,
            document_id,
            interaction_id,
            event_id,
            created_at,
            &decision,
            answer,
            execution_mode,
            reasoning_depth,
            mode,
            context_sources,
        ));
    }

    if action == "generate_image" {
        return Some(generate_image_response(
            project_id,
            payload,
            document_id,
            interaction_id,
            event_id,
            created_at,
            &decision,
            answer,
            execution_mode,
            reasoning_depth,
            mode,
            context_sources,
        ));
    }

    if action == "replace_selection"
        || action == "insert_at_cursor"
        || action == "insert_image"
        || action == "insert_diagram"
        || action == "edit_document"
        || action == "edit_project"
    {
        return Some(edit_proposal_response(
            project_id,
            payload,
            document_id,
            interaction_id,
            event_id,
            created_at,
            &decision,
            action,
            answer,
            execution_mode,
            reasoning_depth,
            mode,
            context_sources,
        ));
    }

    if action != "replace_document" {
        return Some(permission_blocked_response(
            project_id,
            document_id,
            interaction_id,
            event_id,
            created_at,
            "La IA propuso una acción que esta versión de KnowNext.ai todavía no puede aplicar de forma segura.",
            execution_mode,
            reasoning_depth,
            mode,
        ));
    }

    let Some(document_id) = document_id.filter(|value| !value.trim().is_empty()) else {
        return Some(permission_blocked_response(
            project_id,
            None,
            interaction_id,
            event_id,
            created_at,
            "La IA propuso editar, pero no hay un documento activo sobre el que aplicar el cambio.",
            execution_mode,
            reasoning_depth,
            mode,
        ));
    };

    if !payload
        .pointer("/runtimePermissions/editDocuments")
        .and_then(Value::as_bool)
        .unwrap_or(false)
    {
        return Some(permission_blocked_response(
            project_id,
            Some(document_id),
            interaction_id,
            event_id,
            created_at,
            "La IA propuso modificar el documento, pero el permiso de edición está desactivado en Ajustes > IA.",
            execution_mode,
            reasoning_depth,
            mode,
        ));
    }

    let Some(markdown) = decision
        .get("markdown")
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
    else {
        return Some(permission_blocked_response(
            project_id,
            Some(document_id),
            interaction_id,
            event_id,
            created_at,
            "La IA propuso editar, pero no devolvió un documento Markdown completo y validable.",
            execution_mode,
            reasoning_depth,
            mode,
        ));
    };
    let summary = decision
        .get("summary")
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .unwrap_or(answer);
    if payload
        .pointer("/runtimeAi/agentic/confirmBeforeApplying")
        .and_then(Value::as_bool)
        .unwrap_or(false)
    {
        let operation = json!({
            "id": knownext_core::compact_id("ai-op"),
            "action": "replace_document",
            "documentId": document_id,
            "summary": summary,
            "confidence": "medium",
            "from": null,
            "to": null,
            "position": null,
            "markdown": markdown,
            "replacementMarkdown": null,
            "headingPath": null,
            "originalExcerpt": null,
            "anchorExcerpt": null,
            "imageAssetId": null,
            "imageAltText": null,
            "diagramSyntax": null,
            "diagramType": null,
            "diagramCode": null,
            "diagramCaption": null,
            "placement": null
        });
        return Some(edit_proposal_response_from_operations(
            project_id,
            payload,
            Some(document_id),
            interaction_id,
            event_id,
            created_at,
            answer,
            summary,
            "document",
            execution_mode,
            reasoning_depth,
            mode,
            context_sources,
            vec![operation],
        ));
    }
    let public_context_sources = public_context_sources(context_sources);
    let assistant_event = json!({
        "id": event_id,
        "projectId": project_id,
        "type": "document_modified",
        "role": "assistant",
        "content": answer,
        "createdAt": created_at,
        "documentId": document_id,
        "path": null,
        "paths": [],
        "summary": summary,
        "sourcesUsed": public_context_sources,
    });
    Some(json!({
        "interactionId": interaction_id,
        "status": "completed",
        "display": "bubble",
        "uiPlacement": if mode == "project" { "conversation_tab" } else { "document_bubble" },
        "interactionType": "document_edit",
        "confidence": "medium",
        "executionMode": execution_mode,
        "reasoningDepth": reasoning_depth,
        "executionScope": "direct_action",
        "routeToAiTab": mode == "project",
        "needsUserClarification": false,
        "pendingIntent": null,
        "pendingIntentStatus": null,
        "editProposal": null,
        "editProposalStatus": null,
        "answer": answer,
        "conversationEvents": [assistant_event],
        "operations": [{
            "type": "document_modified",
            "status": "completed",
            "message": summary,
            "documentId": document_id,
            "nodeId": null,
            "path": null,
            "paths": [],
            "summary": summary,
            "task": null,
            "confirmationId": null
        }],
        "updatedDocument": {
            "documentId": document_id,
            "markdown": markdown,
            "summary": summary
        },
        "generatedImages": [],
        "task": null,
        "tree": null,
        "affectedDocuments": [],
        "requiresConfirmation": null,
        "contextSources": null,
        "expiredContextSourceIds": []
    }))
}

#[allow(clippy::too_many_arguments)]
fn edit_proposal_response(
    project_id: &str,
    payload: &Value,
    document_id: Option<&str>,
    interaction_id: &str,
    event_id: &str,
    created_at: &str,
    decision: &Value,
    action: &str,
    answer: &str,
    execution_mode: &str,
    reasoning_depth: &str,
    mode: &str,
    context_sources: &Value,
) -> Value {
    let active_document_id = document_id.filter(|value| !value.trim().is_empty());
    if action != "edit_project" && active_document_id.is_none() {
        return permission_blocked_response(
            project_id,
            None,
            interaction_id,
            event_id,
            created_at,
            "La IA propuso editar, pero no hay un documento activo sobre el que aplicar el cambio.",
            execution_mode,
            reasoning_depth,
            mode,
        );
    }

    if !payload
        .pointer("/runtimePermissions/editDocuments")
        .and_then(Value::as_bool)
        .unwrap_or(false)
    {
        return permission_blocked_response(
            project_id,
            active_document_id,
            interaction_id,
            event_id,
            created_at,
            "La IA propuso modificar el documento, pero el permiso de edición está desactivado en Ajustes > IA.",
            execution_mode,
            reasoning_depth,
            mode,
        );
    }

    let summary = decision
        .get("summary")
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .unwrap_or(answer);
    let operations = match action {
        "replace_selection" => {
            let document_id =
                active_document_id.expect("document-scoped edit requires an active document");
            let Some(replacement) = decision
                .get("replacementMarkdown")
                .or_else(|| decision.get("markdown"))
                .and_then(Value::as_str)
                .filter(|value| !value.trim().is_empty())
            else {
                return permission_blocked_response(
                    project_id,
                    active_document_id,
                    interaction_id,
                    event_id,
                    created_at,
                    "La IA propuso reemplazar la selección, pero no devolvió Markdown aplicable.",
                    execution_mode,
                    reasoning_depth,
                    mode,
                );
            };
            let Some(selection) = payload
                .get("selectionFocus")
                .filter(|value| !value.is_null())
            else {
                return permission_blocked_response(
                    project_id,
                    active_document_id,
                    interaction_id,
                    event_id,
                    created_at,
                    "La IA propuso reemplazar una selección, pero no hay selección activa.",
                    execution_mode,
                    reasoning_depth,
                    mode,
                );
            };
            let from = selection.get("from").and_then(Value::as_i64).unwrap_or(0);
            let to = selection.get("to").and_then(Value::as_i64).unwrap_or(from);
            vec![json!({
                "id": knownext_core::compact_id("ai-op"),
                "action": "replace_selection",
                "documentId": document_id,
                "summary": summary,
                "confidence": "medium",
                "from": from,
                "to": to,
                "position": null,
                "markdown": null,
                "replacementMarkdown": replacement,
                "headingPath": selection.get("headingPath").cloned().unwrap_or(Value::Null),
                "originalExcerpt": selection.get("text").cloned().unwrap_or(Value::Null),
                "anchorExcerpt": null,
                "imageAssetId": null,
                "imageAltText": null,
                "placement": null
            })]
        }
        "insert_at_cursor" => {
            let document_id =
                active_document_id.expect("document-scoped edit requires an active document");
            let Some(markdown) = decision
                .get("markdown")
                .or_else(|| decision.get("replacementMarkdown"))
                .and_then(Value::as_str)
                .filter(|value| !value.trim().is_empty())
            else {
                return permission_blocked_response(
                    project_id,
                    active_document_id,
                    interaction_id,
                    event_id,
                    created_at,
                    "La IA propuso insertar en el cursor, pero no devolvió Markdown aplicable.",
                    execution_mode,
                    reasoning_depth,
                    mode,
                );
            };
            let Some(focus) = payload
                .get("selectionFocus")
                .filter(|value| !value.is_null())
            else {
                return permission_blocked_response(
                    project_id,
                    active_document_id,
                    interaction_id,
                    event_id,
                    created_at,
                    "La IA propuso insertar en el cursor, pero no hay cursor activo.",
                    execution_mode,
                    reasoning_depth,
                    mode,
                );
            };
            let position = focus
                .get("position")
                .or_else(|| focus.get("from"))
                .and_then(Value::as_i64)
                .unwrap_or(0);
            vec![json!({
                "id": knownext_core::compact_id("ai-op"),
                "action": "insert_at_cursor",
                "documentId": document_id,
                "summary": summary,
                "confidence": "medium",
                "from": null,
                "to": null,
                "position": position,
                "markdown": markdown,
                "replacementMarkdown": null,
                "headingPath": focus.get("headingPath").cloned().unwrap_or(Value::Null),
                "originalExcerpt": null,
                "anchorExcerpt": focus.get("nearTextBefore").cloned().unwrap_or(Value::Null),
                "imageAssetId": null,
                "imageAltText": null,
                "placement": { "type": "at_cursor", "headingPath": null, "anchorExcerpt": null }
            })]
        }
        "insert_image" => {
            let document_id =
                active_document_id.expect("document-scoped edit requires an active document");
            let Some(asset_id) = decision
                .get("assetId")
                .or_else(|| decision.get("imageAssetId"))
                .and_then(Value::as_str)
                .filter(|value| !value.trim().is_empty())
            else {
                return permission_blocked_response(
                    project_id,
                    active_document_id,
                    interaction_id,
                    event_id,
                    created_at,
                    "La IA propuso insertar una imagen, pero no identificó un asset del proyecto.",
                    execution_mode,
                    reasoning_depth,
                    mode,
                );
            };
            let focus = payload
                .get("selectionFocus")
                .filter(|value| !value.is_null());
            let position = focus
                .and_then(|value| value.get("position").or_else(|| value.get("from")))
                .and_then(Value::as_i64);
            let from = focus
                .and_then(|value| value.get("from"))
                .and_then(Value::as_i64);
            let to = focus
                .and_then(|value| value.get("to"))
                .and_then(Value::as_i64);
            vec![json!({
                "id": knownext_core::compact_id("ai-op"),
                "action": "insert_image",
                "documentId": document_id,
                "summary": summary,
                "confidence": "medium",
                "from": from,
                "to": to,
                "position": position,
                "markdown": null,
                "replacementMarkdown": null,
                "headingPath": focus.and_then(|value| value.get("headingPath")).cloned().unwrap_or(Value::Null),
                "originalExcerpt": focus.and_then(|value| value.get("text")).cloned().unwrap_or(Value::Null),
                "anchorExcerpt": focus.and_then(|value| value.get("nearTextBefore")).cloned().unwrap_or(Value::Null),
                "imageAssetId": asset_id,
                "imageAltText": decision.get("altText").or_else(|| decision.get("alt")).cloned().unwrap_or(Value::Null),
                "placement": decision.get("placement").cloned().unwrap_or_else(|| json!({ "type": "at_cursor", "headingPath": null, "anchorExcerpt": null }))
            })]
        }
        "insert_diagram" => {
            let Some(diagram_code) = decision
                .get("diagramCode")
                .or_else(|| decision.get("code"))
                .or_else(|| decision.get("markdown"))
                .and_then(Value::as_str)
                .map(strip_mermaid_fence)
                .filter(|value| !value.trim().is_empty())
            else {
                return permission_blocked_response(
                    project_id,
                    active_document_id,
                    interaction_id,
                    event_id,
                    created_at,
                    "La IA propuso insertar un diagrama, pero no devolvió código Mermaid validable.",
                    execution_mode,
                    reasoning_depth,
                    mode,
                );
            };
            let focus = payload
                .get("selectionFocus")
                .filter(|value| !value.is_null());
            let position = focus
                .and_then(|value| value.get("position").or_else(|| value.get("from")))
                .and_then(Value::as_i64);
            let from = focus
                .and_then(|value| value.get("from"))
                .and_then(Value::as_i64);
            let to = focus
                .and_then(|value| value.get("to"))
                .and_then(Value::as_i64);
            let caption = decision
                .get("diagramCaption")
                .or_else(|| decision.get("caption"))
                .and_then(Value::as_str)
                .filter(|value| !value.trim().is_empty());
            let markdown = mermaid_markdown(&diagram_code, caption);
            vec![json!({
                "id": knownext_core::compact_id("ai-op"),
                "action": "insert_diagram",
                "documentId": document_id,
                "summary": summary,
                "confidence": "medium",
                "from": from,
                "to": to,
                "position": position,
                "markdown": markdown,
                "replacementMarkdown": null,
                "headingPath": focus.and_then(|value| value.get("headingPath")).cloned().unwrap_or(Value::Null),
                "originalExcerpt": focus.and_then(|value| value.get("text")).cloned().unwrap_or(Value::Null),
                "anchorExcerpt": focus.and_then(|value| value.get("nearTextBefore")).cloned().unwrap_or(Value::Null),
                "imageAssetId": null,
                "imageAltText": null,
                "diagramSyntax": "mermaid",
                "diagramType": decision.get("diagramType").cloned().unwrap_or(Value::Null),
                "diagramCode": diagram_code,
                "diagramCaption": caption.map(Value::from).unwrap_or(Value::Null),
                "placement": decision.get("placement").cloned().unwrap_or_else(|| json!({ "type": "at_cursor", "headingPath": null, "anchorExcerpt": null }))
            })]
        }
        "edit_document" | "edit_project" => {
            normalize_ai_patches(decision, active_document_id, summary)
        }
        _ => Vec::new(),
    };

    if operations.is_empty() {
        return permission_blocked_response(
            project_id,
            active_document_id,
            interaction_id,
            event_id,
            created_at,
            "La IA propuso cambios, pero no devolvió operaciones aplicables.",
            execution_mode,
            reasoning_depth,
            mode,
        );
    }

    edit_proposal_response_from_operations(
        project_id,
        payload,
        active_document_id,
        interaction_id,
        event_id,
        created_at,
        answer,
        summary,
        if action == "edit_project" {
            "project"
        } else {
            document_focus_scope(payload)
        },
        execution_mode,
        reasoning_depth,
        mode,
        context_sources,
        operations,
    )
}

#[allow(clippy::too_many_arguments)]
fn edit_proposal_response_from_operations(
    project_id: &str,
    payload: &Value,
    document_id: Option<&str>,
    interaction_id: &str,
    event_id: &str,
    created_at: &str,
    answer: &str,
    summary: &str,
    scope: &str,
    execution_mode: &str,
    reasoning_depth: &str,
    mode: &str,
    context_sources: &Value,
    operations: Vec<Value>,
) -> Value {
    let public_context_sources = public_context_sources(context_sources);
    let operation_count = operations.len();
    let title = proposal_title(scope, operation_count);
    let assistant_event = json!({
        "id": event_id,
        "projectId": project_id,
        "type": "document_modified",
        "role": "assistant",
        "content": answer,
        "createdAt": created_at,
        "documentId": document_id,
        "path": null,
        "paths": [],
        "summary": summary,
        "sourcesUsed": public_context_sources,
    });
    let proposal_id = knownext_core::compact_id("ai-proposal");
    json!({
        "interactionId": interaction_id,
        "status": "completed",
        "display": "bubble",
        "uiPlacement": if mode == "project" { "conversation_tab" } else { "document_bubble" },
        "interactionType": "document_edit",
        "confidence": "medium",
        "executionMode": execution_mode,
        "reasoningDepth": reasoning_depth,
        "executionScope": "needs_permission",
        "routeToAiTab": mode == "project",
        "needsUserClarification": false,
        "pendingIntent": null,
        "pendingIntentStatus": null,
        "editProposal": {
            "id": proposal_id,
            "projectId": project_id,
            "interactionId": interaction_id,
            "status": "proposed",
            "documentId": document_id,
            "title": title,
            "summary": summary,
            "scope": scope,
            "focus": focus_payload(payload, document_id),
            "operations": operations,
            "createdAt": created_at,
            "updatedAt": created_at
        },
        "editProposalStatus": "proposed",
        "answer": answer,
        "conversationEvents": [assistant_event],
        "operations": [{
            "type": "document_modified",
            "status": "pending",
            "message": summary,
            "documentId": document_id,
            "nodeId": null,
            "path": null,
            "paths": [],
            "summary": summary,
            "task": null,
            "confirmationId": null
        }],
        "updatedDocument": null,
        "generatedImages": [],
        "task": null,
        "tree": null,
        "affectedDocuments": [],
        "requiresConfirmation": null,
        "contextSources": null,
        "expiredContextSourceIds": []
    })
}

fn normalize_ai_patches(
    decision: &Value,
    fallback_document_id: Option<&str>,
    fallback_summary: &str,
) -> Vec<Value> {
    decision
        .get("patches")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .enumerate()
        .filter_map(|(index, patch)| {
            let action = patch
                .get("action")
                .and_then(Value::as_str)
                .unwrap_or_else(|| patch.get("operation").and_then(Value::as_str).unwrap_or("edit_block"));
            let action = match action {
                "replace_selection" | "insert_at_cursor" | "edit_block" | "edit_document"
                | "edit_project" | "insert_image" | "insert_diagram" | "replace_document" => action,
                _ => "edit_block",
            };
            let document_id = patch
                .get("documentId")
                .and_then(Value::as_str)
                .filter(|value| !value.trim().is_empty())
                .or(fallback_document_id)?;
            let summary = patch
                .get("summary")
                .and_then(Value::as_str)
                .filter(|value| !value.trim().is_empty())
                .unwrap_or(fallback_summary);
            let markdown = patch
                .get("markdown")
                .or_else(|| patch.get("replacementMarkdown"))
                .and_then(Value::as_str)
                .unwrap_or("");
            let replacement = patch
                .get("replacementMarkdown")
                .or_else(|| patch.get("markdown"))
                .and_then(Value::as_str)
                .unwrap_or("");
            let image_asset_id = patch
                .get("imageAssetId")
                .or_else(|| patch.get("assetId"))
                .and_then(Value::as_str)
                .unwrap_or("");
            let diagram_code = patch
                .get("diagramCode")
                .or_else(|| patch.get("code"))
                .and_then(Value::as_str)
                .map(strip_mermaid_fence)
                .unwrap_or_default();
            let markdown = if action == "insert_diagram" && markdown.trim().is_empty() && !diagram_code.trim().is_empty() {
                mermaid_markdown(
                    &diagram_code,
                    patch.get("diagramCaption")
                        .or_else(|| patch.get("caption"))
                        .and_then(Value::as_str)
                        .filter(|value| !value.trim().is_empty()),
                )
            } else {
                markdown.to_string()
            };
            if markdown.trim().is_empty()
                && replacement.trim().is_empty()
                && !(action == "insert_image" && !image_asset_id.trim().is_empty())
                && !(action == "insert_diagram" && !diagram_code.trim().is_empty())
            {
                return None;
            }
            Some(json!({
                "id": patch.get("id").and_then(Value::as_str).map(str::to_string).unwrap_or_else(|| format!("patch-{}", index + 1)),
                "action": action,
                "documentId": document_id,
                "summary": summary,
                "confidence": patch.get("confidence").and_then(Value::as_str).unwrap_or("medium"),
                "from": patch.get("from").cloned().unwrap_or(Value::Null),
                "to": patch.get("to").cloned().unwrap_or(Value::Null),
                "position": patch.get("position").cloned().unwrap_or(Value::Null),
                "markdown": if markdown.is_empty() { Value::Null } else { Value::from(markdown) },
                "replacementMarkdown": if replacement.is_empty() { Value::Null } else { Value::from(replacement) },
                "headingPath": patch.get("headingPath").cloned().unwrap_or(Value::Null),
                "originalExcerpt": patch.get("originalExcerpt").cloned().unwrap_or(Value::Null),
                "anchorExcerpt": patch.get("anchorExcerpt").cloned().unwrap_or(Value::Null),
                "imageAssetId": if image_asset_id.trim().is_empty() { Value::Null } else { Value::from(image_asset_id) },
                "imageAltText": patch.get("imageAltText").or_else(|| patch.get("altText")).cloned().unwrap_or(Value::Null),
                "diagramSyntax": if action == "insert_diagram" { Value::from("mermaid") } else { Value::Null },
                "diagramType": patch.get("diagramType").cloned().unwrap_or(Value::Null),
                "diagramCode": if diagram_code.trim().is_empty() { Value::Null } else { Value::from(diagram_code) },
                "diagramCaption": patch.get("diagramCaption").or_else(|| patch.get("caption")).cloned().unwrap_or(Value::Null),
                "placement": patch.get("placement").cloned().unwrap_or(Value::Null)
            }))
        })
        .collect()
}

fn strip_mermaid_fence(value: &str) -> String {
    let normalized = value.replace("\r\n", "\n").replace('\r', "\n");
    let trimmed = normalized.trim();
    if !trimmed.starts_with("```") {
        return normalize_ai_mermaid_code(trimmed);
    }

    let mut lines = trimmed.lines();
    let Some(first) = lines.next() else {
        return String::new();
    };
    if !first.trim_start().starts_with("```") || !first.to_ascii_lowercase().contains("mermaid") {
        return trimmed.to_string();
    }

    let mut body: Vec<&str> = lines.collect();
    if body
        .last()
        .map(|line| line.trim_start().starts_with("```"))
        .unwrap_or(false)
    {
        body.pop();
    }
    normalize_ai_mermaid_code(body.join("\n").trim())
}

fn mermaid_markdown(code: &str, caption: Option<&str>) -> String {
    let clean_code = strip_mermaid_fence(code);
    let metadata = caption
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|caption| json!({ "caption": caption, "width": "wide" }).to_string())
        .map(|metadata| format!("%% knownext: {metadata}\n"))
        .unwrap_or_default();
    format!(
        "```mermaid\n{}{}```\n",
        metadata,
        ensure_trailing_newline(clean_code.trim())
    )
}

fn normalize_ai_mermaid_code(value: &str) -> String {
    value.replace("\\n", "<br/>").trim().to_string()
}

fn ensure_trailing_newline(value: &str) -> String {
    if value.ends_with('\n') {
        value.to_string()
    } else {
        format!("{value}\n")
    }
}

fn document_focus_scope(payload: &Value) -> &str {
    payload
        .pointer("/selectionFocus/focusType")
        .and_then(Value::as_str)
        .unwrap_or("document")
}

fn focus_payload(payload: &Value, document_id: Option<&str>) -> Value {
    let Some(focus) = payload
        .get("selectionFocus")
        .filter(|value| !value.is_null())
    else {
        return json!({
            "type": if document_id.is_some() { "document" } else { "project" },
            "documentId": document_id,
            "path": payload.pointer("/clientContext/lastDocumentPath").cloned().unwrap_or(Value::Null),
            "from": null,
            "to": null,
            "position": null,
            "text": null,
            "nearTextBefore": null,
            "nearTextAfter": null,
            "headingPath": null,
            "blockType": null,
            "blockHash": null
        });
    };
    json!({
        "type": focus.get("focusType").and_then(Value::as_str).unwrap_or("selection"),
        "documentId": document_id,
        "path": focus.get("path").cloned().unwrap_or(Value::Null),
        "from": focus.get("from").cloned().unwrap_or(Value::Null),
        "to": focus.get("to").cloned().unwrap_or(Value::Null),
        "position": focus.get("position").cloned().unwrap_or(Value::Null),
        "text": focus.get("text").cloned().unwrap_or(Value::Null),
        "nearTextBefore": focus.get("nearTextBefore").cloned().unwrap_or(Value::Null),
        "nearTextAfter": focus.get("nearTextAfter").cloned().unwrap_or(Value::Null),
        "headingPath": focus.get("headingPath").cloned().unwrap_or(Value::Null),
        "blockType": focus.get("blockType").cloned().unwrap_or(Value::Null),
        "blockHash": focus.get("blockHash").cloned().unwrap_or(Value::Null)
    })
}

fn proposal_title(scope: &str, operation_count: usize) -> String {
    match (scope, operation_count) {
        ("selection", _) => "Cambio sobre texto seleccionado".to_string(),
        ("cursor", _) => "Inserción en el cursor".to_string(),
        ("project", 1) => "Cambio de proyecto preparado".to_string(),
        ("project", count) => format!("{count} cambios de proyecto preparados"),
        (_, 1) => "Cambio de documento preparado".to_string(),
        (_, count) => format!("{count} cambios de documento preparados"),
    }
}

#[allow(clippy::too_many_arguments)]
fn generate_image_response(
    project_id: &str,
    payload: &Value,
    document_id: Option<&str>,
    interaction_id: &str,
    event_id: &str,
    created_at: &str,
    decision: &Value,
    answer: &str,
    execution_mode: &str,
    reasoning_depth: &str,
    mode: &str,
    context_sources: &Value,
) -> Value {
    if !payload
        .pointer("/runtimePermissions/generateImages")
        .and_then(Value::as_bool)
        .unwrap_or(false)
        || !payload
            .pointer("/runtimePermissions/createImageAssets")
            .and_then(Value::as_bool)
            .unwrap_or(false)
    {
        return permission_blocked_response(
            project_id,
            document_id,
            interaction_id,
            event_id,
            created_at,
            "La IA ha preparado una imagen, pero la generación de imágenes o la creación de assets está desactivada en Ajustes > IA.",
            execution_mode,
            reasoning_depth,
            mode,
        );
    }

    let Some(prompt) = decision
        .get("prompt")
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
    else {
        return permission_blocked_response(
            project_id,
            document_id,
            interaction_id,
            event_id,
            created_at,
            "La IA propuso generar una imagen, pero no devolvió un prompt visual validable.",
            execution_mode,
            reasoning_depth,
            mode,
        );
    };
    let summary = decision
        .get("summary")
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .unwrap_or(answer);
    let name = normalize_image_file_name(
        decision
            .get("name")
            .or_else(|| decision.get("title"))
            .and_then(Value::as_str)
            .unwrap_or("imagen-ia.png"),
        "png",
    );
    let alt_text = decision
        .get("altText")
        .or_else(|| decision.get("alt"))
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .unwrap_or("Imagen generada por IA");
    let insert_into_document = decision
        .get("insertIntoDocument")
        .and_then(Value::as_bool)
        .unwrap_or(document_id.is_some());
    let public_context_sources = public_context_sources(context_sources);
    let assistant_event = json!({
        "id": event_id,
        "projectId": project_id,
        "type": "image_generated",
        "role": "assistant",
        "content": answer,
        "createdAt": created_at,
        "documentId": document_id,
        "path": null,
        "paths": [],
        "summary": summary,
        "sourcesUsed": public_context_sources,
    });
    json!({
        "interactionId": interaction_id,
        "status": "completed",
        "display": "bubble",
        "uiPlacement": if mode == "project" { "conversation_tab" } else { "document_bubble" },
        "interactionType": "image_generation",
        "confidence": "medium",
        "executionMode": execution_mode,
        "reasoningDepth": reasoning_depth,
        "executionScope": "direct_action",
        "routeToAiTab": mode == "project",
        "needsUserClarification": false,
        "pendingIntent": null,
        "pendingIntentStatus": null,
        "answer": answer,
        "conversationEvents": [assistant_event],
        "operations": [{
            "type": "image_generated",
            "status": "ready",
            "message": summary,
            "documentId": document_id,
            "nodeId": null,
            "path": null,
            "paths": [],
            "summary": summary,
            "task": null,
            "confirmationId": null,
            "name": name,
            "prompt": prompt,
            "altText": alt_text,
            "insertIntoDocument": insert_into_document,
            "placement": decision.get("placement").cloned().unwrap_or(Value::Null)
        }],
        "updatedDocument": null,
        "generatedImages": [],
        "task": null,
        "tree": null,
        "affectedDocuments": [],
        "requiresConfirmation": null,
        "contextSources": null,
        "expiredContextSourceIds": []
    })
}

#[allow(clippy::too_many_arguments)]
fn create_document_response(
    project_id: &str,
    payload: &Value,
    document_id: Option<&str>,
    interaction_id: &str,
    event_id: &str,
    created_at: &str,
    decision: &Value,
    answer: &str,
    execution_mode: &str,
    reasoning_depth: &str,
    mode: &str,
    context_sources: &Value,
) -> Value {
    if !payload
        .pointer("/runtimePermissions/createDocuments")
        .and_then(Value::as_bool)
        .unwrap_or(false)
    {
        return permission_blocked_response(
            project_id,
            document_id,
            interaction_id,
            event_id,
            created_at,
            "La IA ha preparado un documento nuevo, pero el permiso de creación de documentos está desactivado en Ajustes > IA.",
            execution_mode,
            reasoning_depth,
            mode,
        );
    }

    let Some(markdown) = decision
        .get("markdown")
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
    else {
        return permission_blocked_response(
            project_id,
            document_id,
            interaction_id,
            event_id,
            created_at,
            "La IA propuso crear un documento, pero no devolvió un Markdown completo y validable.",
            execution_mode,
            reasoning_depth,
            mode,
        );
    };
    let raw_name = decision
        .get("name")
        .or_else(|| decision.get("title"))
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .unwrap_or("documento-ia.md");
    let name = normalize_markdown_file_name(raw_name);
    let summary = decision
        .get("summary")
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .unwrap_or(answer);
    let public_context_sources = public_context_sources(context_sources);
    let assistant_event = json!({
        "id": event_id,
        "projectId": project_id,
        "type": "document_created",
        "role": "assistant",
        "content": answer,
        "createdAt": created_at,
        "documentId": document_id,
        "path": null,
        "paths": [],
        "summary": summary,
        "sourcesUsed": public_context_sources,
    });
    json!({
        "interactionId": interaction_id,
        "status": "completed",
        "display": "bubble",
        "uiPlacement": if mode == "project" { "conversation_tab" } else { "document_bubble" },
        "interactionType": "project_operation",
        "confidence": "medium",
        "executionMode": execution_mode,
        "reasoningDepth": reasoning_depth,
        "executionScope": "direct_action",
        "routeToAiTab": mode == "project",
        "needsUserClarification": false,
        "pendingIntent": null,
        "pendingIntentStatus": null,
        "answer": answer,
        "conversationEvents": [assistant_event],
        "operations": [{
            "type": "document_created",
            "status": "ready",
            "message": summary,
            "documentId": null,
            "nodeId": null,
            "path": null,
            "paths": [],
            "summary": summary,
            "task": null,
            "confirmationId": null,
            "name": name,
            "markdown": markdown
        }],
        "updatedDocument": null,
        "generatedImages": [],
        "task": null,
        "tree": null,
        "affectedDocuments": [],
        "requiresConfirmation": null,
        "contextSources": null,
        "expiredContextSourceIds": []
    })
}

#[allow(clippy::too_many_arguments)]
fn chat_response(
    project_id: &str,
    document_id: Option<&str>,
    interaction_id: &str,
    event_id: &str,
    created_at: &str,
    answer: &str,
    execution_mode: &str,
    reasoning_depth: &str,
    mode: &str,
    context_sources: &Value,
) -> Value {
    let public_context_sources = public_context_sources(context_sources);
    let assistant_event = json!({
        "id": event_id,
        "projectId": project_id,
        "type": "assistant_message",
        "role": "assistant",
        "content": answer,
        "createdAt": created_at,
        "documentId": document_id,
        "path": null,
        "paths": [],
        "summary": null,
        "sourcesUsed": public_context_sources,
    });
    json!({
        "interactionId": interaction_id,
        "status": "completed",
        "display": "bubble",
        "uiPlacement": if mode == "project" { "conversation_tab" } else { "document_bubble" },
        "interactionType": "chat",
        "confidence": "medium",
        "executionMode": execution_mode,
        "reasoningDepth": reasoning_depth,
        "executionScope": "direct_action",
        "routeToAiTab": mode == "project",
        "needsUserClarification": false,
        "pendingIntent": null,
        "pendingIntentStatus": null,
        "answer": assistant_event["content"],
        "conversationEvents": [assistant_event],
        "operations": [],
        "updatedDocument": null,
        "generatedImages": [],
        "task": null,
        "tree": null,
        "affectedDocuments": [],
        "requiresConfirmation": null,
        "contextSources": null,
        "expiredContextSourceIds": []
    })
}

fn permission_blocked_response(
    project_id: &str,
    document_id: Option<&str>,
    interaction_id: &str,
    event_id: &str,
    created_at: &str,
    message: &str,
    execution_mode: &str,
    reasoning_depth: &str,
    mode: &str,
) -> Value {
    let event = json!({
        "id": event_id,
        "projectId": project_id,
        "type": "permission_blocked",
        "role": "assistant",
        "content": message,
        "createdAt": created_at,
        "documentId": document_id,
        "path": null,
        "paths": [],
        "summary": message,
        "sourcesUsed": []
    });
    json!({
        "interactionId": interaction_id,
        "status": "blocked",
        "display": "bubble",
        "uiPlacement": if mode == "project" { "conversation_tab" } else { "document_bubble" },
        "interactionType": "document_edit",
        "confidence": "high",
        "executionMode": execution_mode,
        "reasoningDepth": reasoning_depth,
        "executionScope": "needs_permission",
        "routeToAiTab": mode == "project",
        "needsUserClarification": false,
        "pendingIntent": null,
        "pendingIntentStatus": null,
        "answer": message,
        "conversationEvents": [event],
        "operations": [{
            "type": "permission_blocked",
            "status": "blocked",
            "message": message,
            "documentId": document_id,
            "nodeId": null,
            "path": null,
            "paths": [],
            "summary": message,
            "task": null,
            "confirmationId": null
        }],
        "updatedDocument": null,
        "generatedImages": [],
        "task": null,
        "tree": null,
        "affectedDocuments": [],
        "requiresConfirmation": null,
        "contextSources": null,
        "expiredContextSourceIds": []
    })
}

fn parse_provider_decision(text: &str) -> Option<Value> {
    let trimmed = text.trim();
    serde_json::from_str::<Value>(trimmed)
        .ok()
        .or_else(|| {
            extract_fenced_json(trimmed)
                .and_then(|json_text| serde_json::from_str::<Value>(json_text).ok())
        })
        .or_else(|| {
            extract_first_json_object(trimmed)
                .and_then(|json_text| serde_json::from_str::<Value>(&json_text).ok())
        })
        .map(normalize_provider_decision)
        .filter(|value| value.is_object() && value.get("action").and_then(Value::as_str).is_some())
}

fn looks_like_structured_payload(text: &str) -> bool {
    let trimmed = text.trim();
    trimmed.starts_with('{') || trimmed.starts_with("```json") || trimmed.contains("\"action\"")
}

fn extract_fenced_json(text: &str) -> Option<&str> {
    let start_marker = text.find("```")?;
    let after_start = &text[start_marker + 3..];
    let content_start = after_start.find('\n').map(|index| index + 1).unwrap_or(0);
    let content = &after_start[content_start..];
    let end = content.find("```")?;
    Some(content[..end].trim())
}

fn extract_first_json_object(text: &str) -> Option<String> {
    let start = text.find('{')?;
    let mut depth = 0usize;
    let mut in_string = false;
    let mut escaped = false;
    for (relative_index, character) in text[start..].char_indices() {
        if escaped {
            escaped = false;
            continue;
        }
        if in_string {
            match character {
                '\\' => escaped = true,
                '"' => in_string = false,
                _ => {}
            }
            continue;
        }
        match character {
            '"' => in_string = true,
            '{' => depth += 1,
            '}' => {
                depth = depth.saturating_sub(1);
                if depth == 0 {
                    let end = start + relative_index + character.len_utf8();
                    return Some(text[start..end].to_string());
                }
            }
            _ => {}
        }
    }
    None
}

fn normalize_provider_decision(mut decision: Value) -> Value {
    let Some(object) = decision.as_object_mut() else {
        return decision;
    };
    let action = object
        .get("action")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();
    if action != "generate_image" {
        return decision;
    }

    if missing_string(object.get("prompt")) {
        let fallback_prompt = object
            .get("imagePrompt")
            .or_else(|| object.get("visualPrompt"))
            .or_else(|| object.get("description"))
            .or_else(|| object.get("caption"))
            .and_then(Value::as_str)
            .filter(|value| !value.trim().is_empty())
            .map(str::to_string);
        if let Some(prompt) = fallback_prompt {
            object.insert("prompt".to_string(), Value::String(prompt));
        }
    }
    if missing_string(object.get("answer")) {
        object.insert(
            "answer".to_string(),
            Value::String("He preparado una imagen de apoyo para el documento.".to_string()),
        );
    }
    if missing_string(object.get("summary")) {
        let summary = object
            .get("answer")
            .and_then(Value::as_str)
            .unwrap_or("Imagen de apoyo preparada")
            .to_string();
        object.insert("summary".to_string(), Value::String(summary));
    }
    if missing_string(object.get("name")) {
        object.insert(
            "name".to_string(),
            Value::String("imagen-apoyo.png".to_string()),
        );
    }
    if missing_string(object.get("altText")) {
        object.insert(
            "altText".to_string(),
            Value::String("Imagen de apoyo para el texto seleccionado".to_string()),
        );
    }
    if !object
        .get("insertIntoDocument")
        .map(Value::is_boolean)
        .unwrap_or(false)
    {
        object.insert("insertIntoDocument".to_string(), Value::Bool(true));
    }
    if object
        .get("placement")
        .map(|value| value.is_null())
        .unwrap_or(true)
    {
        object.insert(
            "placement".to_string(),
            json!({ "type": "after_selection", "headingPath": null, "anchorExcerpt": null }),
        );
    }
    decision
}

fn missing_string(value: Option<&Value>) -> bool {
    value
        .and_then(Value::as_str)
        .map(str::trim)
        .map(str::is_empty)
        .unwrap_or(true)
}

fn normalize_markdown_file_name(raw: &str) -> String {
    let mut name = raw
        .trim()
        .replace('\\', "/")
        .rsplit('/')
        .next()
        .unwrap_or("documento-ia.md")
        .chars()
        .map(|character| match character {
            '<' | '>' | ':' | '"' | '|' | '?' | '*' => '-',
            character if character.is_control() => '-',
            character => character,
        })
        .collect::<String>()
        .trim()
        .trim_matches('.')
        .to_string();
    if name.is_empty() {
        name = "documento-ia.md".to_string();
    }
    if !name.to_ascii_lowercase().ends_with(".md") {
        name.push_str(".md");
    }
    name
}

fn normalize_image_file_name(raw: &str, default_format: &str) -> String {
    let format = normalize_image_format(default_format);
    let mut name = raw
        .trim()
        .replace('\\', "/")
        .rsplit('/')
        .next()
        .unwrap_or("imagen-ia")
        .chars()
        .map(|character| match character {
            '<' | '>' | ':' | '"' | '|' | '?' | '*' => '-',
            character if character.is_control() => '-',
            character => character,
        })
        .collect::<String>()
        .trim()
        .trim_matches('.')
        .to_string();
    if name.is_empty() {
        name = "imagen-ia".to_string();
    }
    let lower = name.to_ascii_lowercase();
    if !matches!(
        lower.rsplit('.').next(),
        Some("png" | "webp" | "jpg" | "jpeg")
    ) {
        name.push('.');
        name.push_str(format);
    }
    name
}

fn normalize_image_model(model: &str) -> &'static str {
    match model {
        "gpt-image-2" => "gpt-image-2",
        "gpt-image-1.5" => "gpt-image-1.5",
        "gpt-image-1" => "gpt-image-1",
        "gpt-image-1-mini" => "gpt-image-1-mini",
        _ => "gpt-image-2",
    }
}

fn normalize_image_size(size: &str) -> &'static str {
    match size {
        "1024x1024" => "1024x1024",
        "1536x1024" => "1536x1024",
        "1024x1536" => "1024x1536",
        "2048x2048" => "2048x2048",
        "2048x1152" => "2048x1152",
        "3840x2160" => "3840x2160",
        "2160x3840" => "2160x3840",
        _ => "auto",
    }
}

fn normalize_image_size_for_model(model: &str, size: &str) -> &'static str {
    let normalized = normalize_image_size(size);
    if model == "gpt-image-2"
        || matches!(normalized, "auto" | "1024x1024" | "1536x1024" | "1024x1536")
    {
        normalized
    } else {
        "auto"
    }
}

fn normalize_image_quality(quality: &str) -> &'static str {
    match quality {
        "low" => "low",
        "medium" => "medium",
        "high" => "high",
        _ => "auto",
    }
}

fn normalize_image_format(format: &str) -> &'static str {
    match format {
        "webp" => "webp",
        "jpeg" | "jpg" => "jpeg",
        _ => "png",
    }
}

fn mime_for_image_format(format: &str) -> &'static str {
    match normalize_image_format(format) {
        "webp" => "image/webp",
        "jpeg" => "image/jpeg",
        _ => "image/png",
    }
}

fn openai_client(openai_key: &str) -> Client {
    let mut headers = HeaderMap::new();
    headers.insert(USER_AGENT, HeaderValue::from_static("KnowNext.ai"));
    headers.insert(ACCEPT, HeaderValue::from_static("application/json"));
    if let Ok(value) = HeaderValue::from_str(&format!("Bearer {openai_key}")) {
        headers.insert(AUTHORIZATION, value);
    }
    Client::builder()
        .default_headers(headers)
        .timeout(Duration::from_secs(90))
        .build()
        .unwrap_or_else(|_| Client::new())
}

fn extract_response_text(value: &Value) -> Option<String> {
    if let Some(text) = value
        .get("output_text")
        .and_then(Value::as_str)
        .filter(|text| !text.trim().is_empty())
    {
        return Some(text.trim().to_string());
    }
    let mut chunks = Vec::new();
    for output in value
        .get("output")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
    {
        for content in output
            .get("content")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
        {
            if let Some(text) = content.get("text").and_then(Value::as_str) {
                chunks.push(text);
            }
        }
    }
    let text = chunks.join("\n").trim().to_string();
    if text.is_empty() {
        None
    } else {
        Some(text)
    }
}

fn attach_usage_records(response: &mut Value, usage_records: Vec<Value>) {
    if usage_records.is_empty() {
        response["usageRecords"] = json!([]);
    } else {
        response["usageRecords"] = Value::Array(usage_records);
    }
}

fn provider_usage_record(capability: &str, model: &str, value: &Value) -> Option<Value> {
    let usage = value.get("usage")?;
    let input_tokens = usage_number(usage, &["input_tokens", "inputTokens"]);
    let output_tokens = usage_number(usage, &["output_tokens", "outputTokens"]);
    let total_tokens =
        usage_number(usage, &["total_tokens", "totalTokens"]).max(input_tokens + output_tokens);
    if input_tokens == 0 && output_tokens == 0 && total_tokens == 0 {
        return None;
    }
    let cached_input_tokens = usage
        .get("input_tokens_details")
        .or_else(|| usage.get("inputTokensDetails"))
        .map(|details| usage_number(details, &["cached_tokens", "cachedTokens"]))
        .unwrap_or(0);
    let reasoning_tokens = usage
        .get("output_tokens_details")
        .or_else(|| usage.get("outputTokensDetails"))
        .map(|details| usage_number(details, &["reasoning_tokens", "reasoningTokens"]))
        .unwrap_or(0);
    Some(json!({
        "capability": capability,
        "model": normalize_text_model(model),
        "inputTokens": input_tokens,
        "cachedInputTokens": cached_input_tokens,
        "outputTokens": output_tokens,
        "reasoningTokens": reasoning_tokens,
        "embeddingTokens": 0,
        "totalTokens": total_tokens,
        "usageSource": "provider"
    }))
}

fn usage_number(value: &Value, keys: &[&str]) -> u64 {
    keys.iter()
        .find_map(|key| value.get(*key).and_then(Value::as_u64))
        .unwrap_or(0)
}

fn normalize_text_model(model: &str) -> &'static str {
    match model {
        "gpt-5.5" => "gpt-5.5",
        "gpt-5.4" => "gpt-5.4",
        "gpt-5.4-mini" => "gpt-5.4-mini",
        "gpt-5.4-nano" => "gpt-5.4-nano",
        "gpt-5.2" => "gpt-5.5",
        "gpt-5" => "gpt-5.4",
        "gpt-5-mini" => "gpt-5.4-mini",
        "gpt-5-nano" => "gpt-5.4-nano",
        _ => "gpt-5.4-mini",
    }
}

fn summarize_error_detail(detail: &str) -> String {
    if detail.trim().is_empty() {
        return "sin detalle".to_string();
    }
    serde_json::from_str::<Value>(detail)
        .ok()
        .and_then(|value| {
            value
                .pointer("/error/message")
                .and_then(Value::as_str)
                .map(str::to_string)
        })
        .unwrap_or_else(|| detail.chars().take(500).collect())
}

fn public_context_sources(context_sources: &Value) -> Value {
    let Some(sources) = context_sources.as_array() else {
        return json!([]);
    };
    Value::Array(
        sources
            .iter()
            .cloned()
            .map(strip_internal_source_text)
            .collect(),
    )
}

fn strip_internal_source_text(mut source: Value) -> Value {
    if let Some(object) = source.as_object_mut() {
        object.remove("text");
    }
    source
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn structured_answer_remains_chat() {
        let response = structured_interaction_response(
            "project",
            &json!({ "runtimePermissions": { "editDocuments": true } }),
            Some("project::doc.md"),
            "interaction",
            "event",
            "2026-06-04T00:00:00Z",
            r#"{"action":"answer","answer":"El documento resume el proyecto."}"#,
            "quick",
            "light",
            "document",
            &json!([]),
        )
        .unwrap();

        assert_eq!(response["status"], "completed");
        assert_eq!(response["interactionType"], "chat");
        assert!(response["updatedDocument"].is_null());
        assert_eq!(response["answer"], "El documento resume el proyecto.");
    }

    #[test]
    fn response_request_applies_execution_mode_and_reasoning_depth() {
        let skill_context = knownext_ai_skills::resolve_for_request(&json!({}), None);
        let quick = build_response_request(
            &json!({
                "activeMarkdown": "# Nota",
                "runtimePermissions": { "editDocuments": true },
                "executionMode": "quick",
                "reasoningDepth": "deep"
            }),
            "Resume",
            &json!([]),
            "gpt-5.4-mini",
            &skill_context,
        );
        assert_eq!(quick["max_output_tokens"], 4000);
        assert_eq!(quick["text"]["format"]["type"], "json_schema");
        assert_eq!(quick["text"]["format"]["name"], "knownext_ai_interaction");
        assert!(quick["input"][0]["content"]
            .as_str()
            .unwrap()
            .contains("Modo rapido"));
        assert!(quick["input"][1]["content"]
            .as_str()
            .unwrap()
            .contains("quick (light)"));

        let reasoning = build_response_request(
            &json!({
                "activeMarkdown": "# Nota",
                "runtimePermissions": { "editDocuments": true },
                "executionMode": "reasoning",
                "reasoningDepth": "deep"
            }),
            "Investiga dentro del documento",
            &json!([{ "id": "source", "name": "Fuente", "text": "Dato" }]),
            "gpt-5.4-mini",
            &skill_context,
        );
        assert_eq!(reasoning["max_output_tokens"], 10000);
        let system = reasoning["input"][0]["content"].as_str().unwrap();
        let user = reasoning["input"][1]["content"].as_str().unwrap();
        assert!(system.contains("Modo Razonar profundo"));
        assert!(system.contains("no uses fuentes externas no aportadas"));
        assert!(system.contains("devuelve una accion estructurada"));
        assert!(
            system.contains("replace_document")
                && system.contains("solo para reescrituras completas explicitas")
        );
        assert!(!system.contains("propone el cambio con action replace_document"));
        assert!(user.contains("reasoning (deep)"));
    }

    #[test]
    fn prompt_payload_preserves_document_context_for_auxiliary_prompt_contract() {
        let payload = prompt_payload(
            "Resume el documento",
            "# Activo\n\nContenido actual.",
            Some("project::docs/activo.md"),
        );

        assert_eq!(payload["prompt"], "Resume el documento");
        assert_eq!(payload["activeMarkdown"], "# Activo\n\nContenido actual.");
        assert_eq!(payload["documentId"], "project::docs/activo.md");
        assert_eq!(payload["mode"], "document");
    }

    #[test]
    fn structured_document_edit_returns_validated_updated_document() {
        let response = structured_interaction_response(
            "project",
            &json!({ "runtimePermissions": { "editDocuments": true } }),
            Some("project::doc.md"),
            "interaction",
            "event",
            "2026-06-04T00:00:00Z",
            r##"{"action":"replace_document","answer":"He preparado una versión revisada.","summary":"Documento revisado","markdown":"# Revisado\n\nContenido final."}"##,
            "reasoning",
            "medium",
            "document",
            &json!([{ "id": "source", "text": "internal", "name": "Fuente" }]),
        ).unwrap();

        assert_eq!(response["status"], "completed");
        assert_eq!(response["interactionType"], "document_edit");
        assert_eq!(response["operations"][0]["type"], "document_modified");
        assert_eq!(response["updatedDocument"]["documentId"], "project::doc.md");
        assert_eq!(
            response["updatedDocument"]["markdown"],
            "# Revisado\n\nContenido final."
        );
        assert!(response["conversationEvents"][0]["sourcesUsed"][0]["text"].is_null());
    }

    #[test]
    fn structured_selection_edit_returns_reviewable_edit_proposal() {
        let response = structured_interaction_response(
            "project",
            &json!({
                "runtimePermissions": { "editDocuments": true },
                "selectionFocus": {
                    "focusType": "selection",
                    "documentId": "project::doc.md",
                    "from": 12,
                    "to": 34,
                    "text": "Texto original"
                }
            }),
            Some("project::doc.md"),
            "interaction",
            "event",
            "2026-06-04T00:00:00Z",
            r##"{"action":"replace_selection","answer":"He preparado una ampliación.","summary":"Selección ampliada","replacementMarkdown":"Texto original ampliado con más detalle."}"##,
            "quick",
            "light",
            "document",
            &json!([]),
        )
        .unwrap();

        assert_eq!(response["status"], "completed");
        assert_eq!(response["updatedDocument"], Value::Null);
        assert_eq!(response["editProposal"]["status"], "proposed");
        assert_eq!(response["editProposal"]["scope"], "selection");
        assert_eq!(
            response["editProposal"]["operations"][0]["action"],
            "replace_selection"
        );
        assert_eq!(response["editProposal"]["operations"][0]["from"], 12);
        assert_eq!(response["editProposal"]["operations"][0]["to"], 34);
        assert_eq!(
            response["editProposal"]["operations"][0]["replacementMarkdown"],
            "Texto original ampliado con más detalle."
        );
    }

    #[test]
    fn structured_cursor_insert_returns_reviewable_edit_proposal() {
        let response = structured_interaction_response(
            "project",
            &json!({
                "runtimePermissions": { "editDocuments": true },
                "selectionFocus": {
                    "focusType": "cursor",
                    "documentId": "project::doc.md",
                    "from": 42,
                    "to": 42,
                    "position": 42,
                    "text": "",
                    "nearTextBefore": "## Origenes"
                }
            }),
            Some("project::doc.md"),
            "interaction",
            "event",
            "2026-06-04T00:00:00Z",
            r##"{"action":"insert_at_cursor","answer":"He preparado un párrafo nuevo.","summary":"Párrafo insertado","markdown":"Nuevo párrafo contextual."}"##,
            "quick",
            "light",
            "document",
            &json!([]),
        )
        .unwrap();

        assert_eq!(response["status"], "completed");
        assert_eq!(response["updatedDocument"], Value::Null);
        assert_eq!(response["editProposal"]["scope"], "cursor");
        assert_eq!(
            response["editProposal"]["operations"][0]["action"],
            "insert_at_cursor"
        );
        assert_eq!(response["editProposal"]["operations"][0]["position"], 42);
        assert_eq!(
            response["editProposal"]["operations"][0]["markdown"],
            "Nuevo párrafo contextual."
        );
    }

    #[test]
    fn structured_image_insert_returns_reviewable_asset_proposal() {
        let response = structured_interaction_response(
            "project",
            &json!({
                "runtimePermissions": { "editDocuments": true },
                "selectionFocus": {
                    "focusType": "cursor",
                    "documentId": "project::doc.md",
                    "from": 8,
                    "to": 8,
                    "position": 8,
                    "text": ""
                }
            }),
            Some("project::doc.md"),
            "interaction",
            "event",
            "2026-06-04T00:00:00Z",
            r##"{"action":"insert_image","answer":"He preparado la imagen.","summary":"Imagen insertada","assetId":"project::assets/origen.png","altText":"Origen de la cerveza","placement":{"type":"at_cursor","headingPath":null,"anchorExcerpt":null}}"##,
            "quick",
            "light",
            "document",
            &json!([]),
        )
        .unwrap();

        assert_eq!(response["status"], "completed");
        assert_eq!(response["updatedDocument"], Value::Null);
        assert_eq!(
            response["editProposal"]["operations"][0]["action"],
            "insert_image"
        );
        assert_eq!(
            response["editProposal"]["operations"][0]["imageAssetId"],
            "project::assets/origen.png"
        );
        assert_eq!(
            response["editProposal"]["operations"][0]["placement"]["type"],
            "at_cursor"
        );
    }

    #[test]
    fn structured_diagram_insert_returns_reviewable_mermaid_proposal() {
        let mut response = structured_interaction_response(
            "project",
            &json!({
                "runtimePermissions": { "editDocuments": true },
                "clientContext": { "diagramConfig": { "enabled": true, "visualProfile": "visual_local", "iconSet": "lucide", "imagePolicy": "project_assets", "betaPolicy": "ask" } },
                "selectionFocus": {
                    "focusType": "cursor",
                    "documentId": "project::doc.md",
                    "from": 8,
                    "to": 8,
                    "position": 8,
                    "text": "",
                    "nearTextBefore": "## Arquitectura"
                }
            }),
            Some("project::doc.md"),
            "interaction",
            "event",
            "2026-06-04T00:00:00Z",
            r##"{"action":"insert_diagram","answer":"He preparado el diagrama.","summary":"Diagrama insertado","diagramType":"flowchart","diagramCode":"flowchart TD\n  A[Entrada] --> B[Proceso]","diagramCaption":"Flujo de arquitectura","placement":{"type":"at_cursor","headingPath":null,"anchorExcerpt":null}}"##,
            "quick",
            "light",
            "document",
            &json!([]),
        )
        .unwrap();
        let skill_context = knownext_ai_skills::resolve_for_request(
            &json!({ "clientContext": { "diagramConfig": { "enabled": true } } }),
            Some("flowchart"),
        );
        apply_skill_context_to_response(
            &mut response,
            &json!({ "clientContext": { "diagramConfig": { "enabled": true, "visualProfile": "visual_local", "iconSet": "lucide", "imagePolicy": "project_assets", "betaPolicy": "ask" } } }),
            &skill_context,
        );

        let operation = &response["editProposal"]["operations"][0];
        assert_eq!(response["status"], "completed");
        assert_eq!(operation["action"], "insert_diagram");
        assert_eq!(operation["diagramSyntax"], "mermaid");
        assert_eq!(operation["diagramType"], "flowchart");
        assert!(operation["markdown"]
            .as_str()
            .unwrap()
            .contains("```mermaid"));
        assert!(operation["markdown"]
            .as_str()
            .unwrap()
            .contains("%% knownext:"));
        assert!(operation["markdown"]
            .as_str()
            .unwrap()
            .contains("flowchart TD"));
        assert!(response["usedSkills"]
            .as_array()
            .unwrap()
            .iter()
            .any(|skill| skill == "knownext.mermaid"));
    }

    #[test]
    fn skill_validation_blocks_architecture_beta_with_flowchart_edges() {
        let payload = json!({
            "runtimePermissions": { "editDocuments": true },
            "clientContext": { "diagramConfig": { "enabled": true, "visualProfile": "advanced", "iconSet": "lucide", "imagePolicy": "project_assets", "betaPolicy": "enabled" } },
            "selectionFocus": {
                "focusType": "cursor",
                "documentId": "project::doc.md",
                "from": 8,
                "to": 8,
                "position": 8,
                "text": ""
            }
        });
        let mut response = structured_interaction_response(
            "project",
            &payload,
            Some("project::doc.md"),
            "interaction",
            "event",
            "2026-06-04T00:00:00Z",
            r##"{"action":"insert_diagram","answer":"He preparado el diagrama.","summary":"Diagrama insertado","diagramType":"architecture-beta","diagramCode":"architecture-beta\n  app --> runtime","diagramCaption":"Arquitectura","placement":{"type":"at_cursor","headingPath":null,"anchorExcerpt":null}}"##,
            "quick",
            "light",
            "document",
            &json!([]),
        )
        .unwrap();
        let skill_context =
            knownext_ai_skills::resolve_for_request(&payload, Some("architecture-beta"));
        apply_skill_context_to_response(&mut response, &payload, &skill_context);

        assert_eq!(response["status"], "blocked");
        assert!(response["skillDiagnostics"].as_array().unwrap().iter().any(
            |diagnostic| diagnostic["skillId"] == "knownext.mermaid"
                && diagnostic["modeId"] == "diagram_structure"
                && diagnostic["validatorId"] == "mermaid.architecture_beta"
                && diagnostic["status"] == "error"
        ));
    }

    #[test]
    fn structured_project_edit_without_active_document_returns_multi_document_proposal() {
        let response = structured_interaction_response(
            "project",
            &json!({ "runtimePermissions": { "editDocuments": true } }),
            None,
            "interaction",
            "event",
            "2026-06-04T00:00:00Z",
            r##"{"action":"edit_project","answer":"He preparado cambios en varios documentos.","summary":"Concepto actualizado","patches":[{"id":"patch-1","action":"edit_block","documentId":"project::docs/a.md","summary":"Actualizar A","confidence":"medium","from":null,"to":null,"position":null,"markdown":null,"replacementMarkdown":"Nuevo texto A","headingPath":["A"],"originalExcerpt":"Texto A","anchorExcerpt":null,"imageAssetId":null,"imageAltText":null,"placement":null},{"id":"patch-2","action":"edit_block","documentId":"project::docs/b.md","summary":"Actualizar B","confidence":"medium","from":null,"to":null,"position":null,"markdown":null,"replacementMarkdown":"Nuevo texto B","headingPath":["B"],"originalExcerpt":"Texto B","anchorExcerpt":null,"imageAssetId":null,"imageAltText":null,"placement":null}]}"##,
            "reasoning",
            "medium",
            "project",
            &json!([]),
        )
        .unwrap();

        assert_eq!(response["status"], "completed");
        assert_eq!(response["editProposal"]["status"], "proposed");
        assert_eq!(response["editProposal"]["documentId"], Value::Null);
        assert_eq!(response["editProposal"]["scope"], "project");
        assert_eq!(response["routeToAiTab"], true);
        assert_eq!(
            response["editProposal"]["operations"]
                .as_array()
                .unwrap()
                .len(),
            2
        );
        assert_eq!(
            response["editProposal"]["operations"][0]["documentId"],
            "project::docs/a.md"
        );
        assert_eq!(
            response["editProposal"]["operations"][1]["documentId"],
            "project::docs/b.md"
        );
    }

    #[test]
    fn structured_document_multi_patch_keeps_user_in_document_surface() {
        let response = structured_interaction_response(
            "project",
            &json!({ "runtimePermissions": { "editDocuments": true } }),
            Some("project::docs/a.md"),
            "interaction",
            "event",
            "2026-06-04T00:00:00Z",
            r##"{"action":"edit_document","answer":"He preparado cambios en varios apartados.","summary":"Apartados actualizados","patches":[{"id":"patch-1","action":"edit_block","documentId":"project::docs/a.md","summary":"Actualizar A","confidence":"medium","from":null,"to":null,"position":null,"markdown":null,"replacementMarkdown":"Nuevo texto A","headingPath":["A"],"originalExcerpt":"Texto A","anchorExcerpt":null,"imageAssetId":null,"imageAltText":null,"placement":null},{"id":"patch-2","action":"edit_block","documentId":"project::docs/a.md","summary":"Actualizar B","confidence":"medium","from":null,"to":null,"position":null,"markdown":null,"replacementMarkdown":"Nuevo texto B","headingPath":["B"],"originalExcerpt":"Texto B","anchorExcerpt":null,"imageAssetId":null,"imageAltText":null,"placement":null}]}"##,
            "reasoning",
            "medium",
            "document",
            &json!([]),
        )
        .unwrap();

        assert_eq!(response["status"], "completed");
        assert_eq!(response["editProposal"]["status"], "proposed");
        assert_eq!(
            response["editProposal"]["operations"]
                .as_array()
                .unwrap()
                .len(),
            2
        );
        assert_eq!(response["uiPlacement"], "document_bubble");
        assert_eq!(response["routeToAiTab"], false);
    }

    #[test]
    fn structured_project_image_patch_returns_reviewable_asset_operation() {
        let response = structured_interaction_response(
            "project",
            &json!({ "runtimePermissions": { "editDocuments": true } }),
            None,
            "interaction",
            "event",
            "2026-06-04T00:00:00Z",
            r##"{"action":"edit_project","answer":"He preparado una imagen en el apartado.","summary":"Imagen añadida","patches":[{"id":"patch-img","action":"insert_image","documentId":"project::docs/a.md","summary":"Insertar imagen","confidence":"medium","from":null,"to":null,"position":null,"markdown":null,"replacementMarkdown":null,"headingPath":["A"],"originalExcerpt":null,"anchorExcerpt":null,"imageAssetId":"project::assets/origen.png","imageAltText":"Origen","placement":{"type":"after_heading","headingPath":["A"],"anchorExcerpt":null}}]}"##,
            "reasoning",
            "medium",
            "project",
            &json!([]),
        )
        .unwrap();

        assert_eq!(response["status"], "completed");
        assert_eq!(response["editProposal"]["scope"], "project");
        assert_eq!(
            response["editProposal"]["operations"]
                .as_array()
                .unwrap()
                .len(),
            1
        );
        assert_eq!(
            response["editProposal"]["operations"][0]["action"],
            "insert_image"
        );
        assert_eq!(
            response["editProposal"]["operations"][0]["imageAssetId"],
            "project::assets/origen.png"
        );
        assert_eq!(
            response["editProposal"]["operations"][0]["placement"]["type"],
            "after_heading"
        );
    }

    #[test]
    fn structured_document_creation_returns_validated_project_operation() {
        let response = structured_interaction_response(
            "project",
            &json!({ "runtimePermissions": { "createDocuments": true } }),
            Some("project::active.md"),
            "interaction",
            "event",
            "2026-06-04T00:00:00Z",
            r##"{"action":"create_document","answer":"He preparado el documento nuevo.","summary":"Documento nuevo preparado","name":"Plan: IA","markdown":"# Plan IA\n\nContenido final."}"##,
            "reasoning",
            "medium",
            "document",
            &json!([{ "id": "source", "text": "internal", "name": "Fuente" }]),
        ).unwrap();

        assert_eq!(response["status"], "completed");
        assert_eq!(response["interactionType"], "project_operation");
        assert_eq!(response["operations"][0]["type"], "document_created");
        assert_eq!(response["operations"][0]["status"], "ready");
        assert_eq!(response["operations"][0]["name"], "Plan- IA.md");
        assert_eq!(
            response["operations"][0]["markdown"],
            "# Plan IA\n\nContenido final."
        );
        assert_eq!(
            response["conversationEvents"][0]["type"],
            "document_created"
        );
        assert!(response["conversationEvents"][0]["sourcesUsed"][0]["text"].is_null());
    }

    #[test]
    fn structured_image_generation_returns_runtime_validated_operation() {
        let response = structured_interaction_response(
            "project",
            &json!({ "runtimePermissions": { "generateImages": true, "createImageAssets": true, "insertImagesIntoDocuments": true } }),
            Some("project::doc.md"),
            "interaction",
            "event",
            "2026-06-04T00:00:00Z",
            r##"{"action":"generate_image","answer":"He preparado la imagen.","summary":"Imagen preparada","prompt":"Ilustración técnica de un flujo local-first","name":"flujo-local","altText":"Flujo local-first","insertIntoDocument":true,"placement":{"type":"after_heading","headingPath":["Arquitectura"],"anchorExcerpt":null}}"##,
            "quick",
            "light",
            "document",
            &json!([{ "id": "source", "text": "internal", "name": "Fuente" }]),
        )
        .unwrap();

        assert_eq!(response["status"], "completed");
        assert_eq!(response["interactionType"], "image_generation");
        assert_eq!(response["operations"][0]["type"], "image_generated");
        assert_eq!(response["operations"][0]["status"], "ready");
        assert_eq!(response["operations"][0]["name"], "flujo-local.png");
        assert_eq!(response["routeToAiTab"], false);
        assert_eq!(
            response["operations"][0]["prompt"],
            "Ilustración técnica de un flujo local-first"
        );
        assert_eq!(response["operations"][0]["insertIntoDocument"], true);
        assert_eq!(
            response["operations"][0]["placement"]["type"],
            "after_heading"
        );
        assert_eq!(
            response["operations"][0]["placement"]["headingPath"][0],
            "Arquitectura"
        );
        assert_eq!(response["conversationEvents"][0]["type"], "image_generated");
        assert!(response["conversationEvents"][0]["sourcesUsed"][0]["text"].is_null());
    }

    #[test]
    fn structured_image_generation_accepts_json_embedded_in_provider_text() {
        let response = structured_interaction_response(
            "project",
            &json!({ "runtimePermissions": { "generateImages": true, "createImageAssets": true, "insertImagesIntoDocuments": true } }),
            Some("project::doc.md"),
            "interaction",
            "event",
            "2026-06-04T00:00:00Z",
            r##"Claro. {"action":"generate_image","answer":"He preparado la imagen.","summary":"Imagen preparada","prompt":"Ilustración documental sobre cerveza antigua","name":"cerveza-antigua","altText":"Cerveza en la antigüedad","insertIntoDocument":true,"placement":{"type":"after_selection","headingPath":null,"anchorExcerpt":null}} La insertaré en el documento."##,
            "quick",
            "light",
            "document",
            &json!([]),
        )
        .unwrap();

        assert_eq!(response["status"], "completed");
        assert_eq!(response["operations"][0]["type"], "image_generated");
        assert_eq!(
            response["operations"][0]["prompt"],
            "Ilustración documental sobre cerveza antigua"
        );
        assert_eq!(
            response["operations"][0]["placement"]["type"],
            "after_selection"
        );
        assert_eq!(response["routeToAiTab"], false);
    }

    #[test]
    fn structured_image_generation_normalizes_recoverable_incomplete_decision() {
        let response = structured_interaction_response(
            "project",
            &json!({ "runtimePermissions": { "generateImages": true, "createImageAssets": true, "insertImagesIntoDocuments": true } }),
            Some("project::doc.md"),
            "interaction",
            "event",
            "2026-06-04T00:00:00Z",
            r##"{"action":"generate_image","description":"Ilustración histórica de elaboración de cerveza en Mesopotamia"}"##,
            "quick",
            "light",
            "document",
            &json!([]),
        )
        .unwrap();

        assert_eq!(response["status"], "completed");
        assert_eq!(response["operations"][0]["type"], "image_generated");
        assert_eq!(
            response["operations"][0]["prompt"],
            "Ilustración histórica de elaboración de cerveza en Mesopotamia"
        );
        assert_eq!(response["operations"][0]["insertIntoDocument"], true);
        assert_eq!(
            response["operations"][0]["placement"]["type"],
            "after_selection"
        );
    }

    #[test]
    fn gpt_image_2_is_the_supported_default_image_generation_model() {
        assert_eq!(normalize_image_model("gpt-image-2"), "gpt-image-2");
        assert_eq!(normalize_image_model("unknown-image-model"), "gpt-image-2");
        assert_eq!(normalize_image_size("2048x2048"), "2048x2048");
        assert_eq!(normalize_image_size("2048x1152"), "2048x1152");
        assert_eq!(normalize_image_size("3840x2160"), "3840x2160");
        assert_eq!(normalize_image_size("2160x3840"), "2160x3840");
        assert_eq!(
            normalize_image_size_for_model("gpt-image-2", "3840x2160"),
            "3840x2160"
        );
        assert_eq!(
            normalize_image_size_for_model("gpt-image-1.5", "3840x2160"),
            "auto"
        );
    }

    #[test]
    fn structured_document_edit_is_blocked_without_permission() {
        let response = structured_interaction_response(
            "project",
            &json!({ "runtimePermissions": { "editDocuments": false } }),
            Some("project::doc.md"),
            "interaction",
            "event",
            "2026-06-04T00:00:00Z",
            r##"{"action":"replace_document","answer":"Cambio propuesto","summary":"Cambio","markdown":"# Cambio"}"##,
            "quick",
            "light",
            "document",
            &json!([]),
        ).unwrap();

        assert_eq!(response["status"], "blocked");
        assert_eq!(response["operations"][0]["type"], "permission_blocked");
        assert!(response["updatedDocument"].is_null());
    }

    #[test]
    fn structured_document_edit_is_blocked_without_active_document() {
        let response = structured_interaction_response(
            "project",
            &json!({ "runtimePermissions": { "editDocuments": true } }),
            None,
            "interaction",
            "event",
            "2026-06-04T00:00:00Z",
            r##"{"action":"replace_document","answer":"Cambio propuesto","summary":"Cambio","markdown":"# Cambio"}"##,
            "quick",
            "light",
            "project",
            &json!([]),
        ).unwrap();

        assert_eq!(response["status"], "blocked");
        assert_eq!(response["operations"][0]["type"], "permission_blocked");
        assert!(response["updatedDocument"].is_null());
        assert!(response["answer"]
            .as_str()
            .unwrap()
            .contains("no hay un documento activo"));
    }

    #[test]
    fn unsupported_structured_actions_are_blocked() {
        let response = structured_interaction_response(
            "project",
            &json!({ "runtimePermissions": { "editDocuments": true, "deleteDocuments": true } }),
            Some("project::doc.md"),
            "interaction",
            "event",
            "2026-06-04T00:00:00Z",
            r##"{"action":"delete_document","answer":"Voy a eliminar el documento."}"##,
            "reasoning",
            "deep",
            "document",
            &json!([]),
        )
        .unwrap();

        assert_eq!(response["status"], "blocked");
        assert_eq!(response["operations"][0]["type"], "permission_blocked");
        assert!(response["updatedDocument"].is_null());
        assert!(response["answer"]
            .as_str()
            .unwrap()
            .contains("todavía no puede aplicar"));
    }
}
