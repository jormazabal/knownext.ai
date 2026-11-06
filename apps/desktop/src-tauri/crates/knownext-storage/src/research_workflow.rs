//! Domain methods moved verbatim; contracts, preconditions and effects remain unchanged.
use super::*;
impl LocalApi {
    pub fn has_background_work(&self) -> bool {
        self.background_work.active()
    }
    pub(super) fn ai_research_jobs(&self, project_id: &str) -> Result<Value, String> {
        self.research_jobs_checked(project_id)
    }

    pub(super) fn ai_research_jobs_response(&self, project_id: &str) -> Result<Value, String> {
        let mut store = self.ai_research_jobs(project_id)?;
        if let Some(jobs) = store["jobs"].as_array_mut() {
            jobs.sort_by(|a, b| {
                b["createdAt"]
                    .as_str()
                    .unwrap_or("")
                    .cmp(a["createdAt"].as_str().unwrap_or(""))
            });
            jobs.truncate(50);
            for job in jobs.iter_mut() {
                *job = self.observed_research_job(project_id, job.clone());
            }
        }
        Ok(store)
    }
    pub(super) fn write_ai_research_job(
        &self,
        project_id: &str,
        job: &Value,
    ) -> Result<(), String> {
        let _gate = self
            .research_gate
            .lock()
            .map_err(|_| "No se puede acceder al estado de investigación")?;
        self.write_ai_research_job_unlocked(project_id, job)
    }
    pub(super) fn write_ai_research_job_unlocked(
        &self,
        project_id: &str,
        job: &Value,
    ) -> Result<(), String> {
        let mut normalized_job = job.clone();
        refresh_research_runtime_fields(&mut normalized_job);
        let mut store = self.ai_research_jobs(project_id)?;
        if let Some(jobs) = store["jobs"].as_array_mut() {
            let job_id = normalized_job["id"].as_str().unwrap_or("");
            if let Some(existing) = jobs
                .iter_mut()
                .find(|item| item["id"].as_str() == Some(job_id))
            {
                if existing["status"] == "cancelled" && normalized_job["status"] != "cancelled" {
                    return Ok(());
                }
                // Other research writers cannot erase a human overlay captured after their snapshot.
                // This path never edits the overlay; only the reviewed local service does so.
                if let Some(review) = existing.get("evidenceReview") {
                    normalized_job["evidenceReview"] = review.clone();
                }
                *existing = normalized_job;
            } else {
                jobs.push(normalized_job);
            }
        }
        self.write_json_atomic(&self.research_jobs_path(project_id), &store)
    }
    pub(super) fn ai_research_policy(&self, project_id: &str) -> Result<Value, String> {
        let now = knownext_core::now_iso();
        let config = self.read_config();
        let agentic = &config["ai"]["agentic"];
        let default = json!({
            "projectId": project_id,
            "allowedSourceScopes": ["web_project", "web", "project"],
            "blockedDomains": [],
            "preferredLanguage": "es",
            "defaultDepth": agentic["depth"].as_str().filter(|value| matches!(*value, "quick" | "standard" | "deep")).unwrap_or("deep"),
            "maxEstimatedCostEur": agentic["maxEstimatedCostEur"].as_f64().unwrap_or(1.0),
            "maxSources": agentic["maxSources"].as_u64().unwrap_or(6),
            "confirmBeforeCreating": agentic["confirmBeforeApplying"].as_bool().unwrap_or(true),
            "allowPrivateProjectDocuments": true,
            "minimumSources": 2,
            "requireCitations": true,
            "updatedAt": now
        });
        let mut policy = ai_operational_state::read(
            &self.app_data_dir,
            project_id,
            ai_operational_state::Store::Policy,
            default,
        )?;
        policy["projectId"] = Value::from(project_id);
        Ok(policy)
    }
    pub(super) fn save_ai_research_policy(
        &self,
        project_id: &str,
        mut body: Value,
    ) -> Result<Value, String> {
        if !body.is_object() {
            return Err("La política de investigación necesita un objeto válido".into());
        }
        body["projectId"] = Value::from(project_id);
        body["updatedAt"] = Value::from(knownext_core::now_iso());
        let _gate = self
            .research_gate
            .lock()
            .map_err(|_| "No se puede acceder al estado de investigación")?;
        self.write_json_atomic(&self.research_policy_path(project_id), &body)?;
        Ok(body)
    }
    pub(super) fn ai_research_brief(&self, project_id: &str, body: Value) -> Result<Value, String> {
        if let Some(user_event) = self.ai_user_conversation_event(project_id, &body) {
            self.append_ai_conversation_events(project_id, vec![user_event])?;
        }
        let now = knownext_core::now_iso();
        let config = self.read_config();
        let agentic = &config["ai"]["agentic"];
        let policy = self.ai_research_policy(project_id)?;
        let prompt = body
            .get("prompt")
            .and_then(Value::as_str)
            .unwrap_or("")
            .trim();
        let topic = body
            .pointer("/intent/research/topic")
            .and_then(Value::as_str)
            .filter(|value| !value.trim().is_empty())
            .unwrap_or(prompt)
            .trim();
        let topic = if topic.is_empty() {
            "Investigación sin título"
        } else {
            topic
        };
        let max_cost = body
            .pointer("/intent/research/maxEstimatedCostEur")
            .and_then(Value::as_f64)
            .or_else(|| policy["maxEstimatedCostEur"].as_f64())
            .or_else(|| agentic["maxEstimatedCostEur"].as_f64())
            .unwrap_or(1.0)
            .clamp(0.1, 25.0);
        let web_enabled = config["ai"]["agentic"]["webResearchEnabled"]
            .as_bool()
            .unwrap_or(false);
        let depth = "deep".to_string();
        let template_id = "state_of_art".to_string();
        let source_scope = "web_project".to_string();
        let proposed_candidate_source_limit =
            research_proposed_candidate_source_limit(topic, prompt, &body);
        let proposed_report_length =
            research_proposed_report_length(topic, prompt, proposed_candidate_source_limit);
        let candidate_source_limit = body
            .pointer("/intent/research/candidateSourceLimit")
            .and_then(Value::as_u64)
            .or_else(|| {
                body.pointer("/intent/research/maxSources")
                    .and_then(Value::as_u64)
            })
            .or_else(|| {
                body.pointer("/intent/research/plan/candidateSourceLimit")
                    .and_then(Value::as_u64)
            })
            .unwrap_or(proposed_candidate_source_limit)
            .clamp(1, 500);
        let report_length = body
            .pointer("/intent/research/reportLength")
            .and_then(Value::as_str)
            .or_else(|| {
                body.pointer("/intent/research/plan/reportLength")
                    .and_then(Value::as_str)
            })
            .map(normalize_research_report_length)
            .unwrap_or(proposed_report_length);
        let diagrams_enabled = agentic["researchDiagramsEnabled"]
            .as_bool()
            .unwrap_or_else(|| legacy_research_visual_enabled(agentic, "diagramsEnabled", true));
        let images_enabled = agentic["researchImagesEnabled"]
            .as_bool()
            .unwrap_or_else(|| legacy_research_visual_enabled(agentic, "imagesEnabled", true));
        let strategy = knownext_research::strategy_for_mode_and_length(
            "deep",
            candidate_source_limit as usize,
            report_length,
        );
        let duration_label = strategy["estimatedTimeRange"]
            .as_str()
            .unwrap_or("10-30 min")
            .to_string();
        let language = body
            .pointer("/intent/research/language")
            .and_then(Value::as_str)
            .or_else(|| policy["preferredLanguage"].as_str())
            .unwrap_or("es");
        let tone = body
            .pointer("/intent/research/tone")
            .and_then(Value::as_str)
            .unwrap_or("professional");
        let primary_objective = research_objective_for_request(topic);
        let secondary_objectives = research_secondary_objectives_for_request(topic);
        let research_aspects = research_aspects_for_request(topic);
        let recommended_report_style =
            research_recommended_style_for_request(topic, report_length).to_string();
        let constraints = if !web_enabled && matches!(source_scope.as_str(), "web" | "web_project")
        {
            "La investigación necesita búsqueda web activa y una API key configurada. Configura OpenAI para poder ejecutarla.".to_string()
        } else {
            "Usar web como fuente principal, añadir contexto del proyecto solo si el usuario lo aporta y marcar como no concluyente cualquier afirmación sin soporte suficiente.".to_string()
        };
        let planning_rationale = format!(
            "Se proponen {} fuentes candidatas y extensión {} por el alcance y complejidad del objetivo.",
            candidate_source_limit,
            research_report_length_label(report_length)
        );
        let plan = json!({
            "title": research_title_for_request(topic),
            "objective": primary_objective,
            "primaryObjective": primary_objective,
            "secondaryObjectives": secondary_objectives,
            "researchAspects": research_aspects,
            "objectiveCoverage": research_objective_coverage(),
            "recommendedReportStyle": recommended_report_style,
            "proposedCandidateSourceLimit": proposed_candidate_source_limit,
            "candidateSourceLimit": candidate_source_limit,
            "proposedReportLength": proposed_report_length,
            "reportLength": report_length,
            "planningRationale": planning_rationale,
            "outline": research_aspects,
            "constraints": constraints,
            "sourceScope": source_scope.clone(),
            "reportSkillId": "knownext.research_report",
            "auxiliarySkillIds": research_auxiliary_skill_ids(diagrams_enabled, images_enabled),
            "outputSummary": "Web activa · contexto del proyecto si se aporta · tablas y citas siempre disponibles",
            "visualPlan": research_visual_plan(diagrams_enabled, images_enabled),
            "diagramsEnabled": diagrams_enabled,
            "imagesEnabled": images_enabled,
            "estimatedDurationLabel": duration_label.clone(),
            "autoStartAfterSeconds": knownext_research::AUTO_START_AFTER_SECONDS,
            "createdAt": now,
            "updatedAt": now
        });
        Ok(json!({
            "id": knownext_core::compact_id("research-brief"),
            "projectId": project_id,
            "topic": topic,
            "objective": plan["objective"],
            "questions": plan["outline"],
            "depth": depth,
            "sourceScope": source_scope,
            "maxSources": candidate_source_limit,
            "candidateSourceLimit": candidate_source_limit,
            "maxEstimatedCostEur": max_cost,
            "resultTarget": "new_document",
            "confirmBeforeCreating": false,
            "destinationFolderId": Value::Null,
            "destinationFolderPath": Value::Null,
            "templateId": template_id,
            "reportLength": report_length,
            "tone": tone,
            "language": language,
            "plan": plan,
            "reportProfile": {
                "diagramsEnabled": diagrams_enabled,
                "imagesEnabled": images_enabled
            },
            "createdAt": now,
            "updatedAt": now
        }))
    }
    pub(super) fn ai_research_job(&self, project_id: &str, job_id: &str) -> Result<Value, String> {
        let job = self.ai_research_jobs(project_id)?["jobs"]
            .as_array()
            .and_then(|jobs| {
                jobs.iter()
                    .find(|job| job["id"].as_str() == Some(job_id))
                    .cloned()
            })
            .ok_or_else(|| {
                "Investigación no encontrada; no se ha creado ni sustituido ningún estado"
                    .to_string()
            })?;
        Ok(self.observed_research_job(project_id, job))
    }

    pub(super) fn ai_research_cancel(
        &self,
        project_id: &str,
        job_id: &str,
    ) -> Result<Value, String> {
        self.update_ai_research_job(project_id, job_id, |job| {
            let now = knownext_core::now_iso();
            job["status"] = json!("cancelled");
            job["currentPhase"] = json!("cancelled");
            job["phase"] = json!("cancelled");
            job["progress"] = json!(100);
            job["progressMessage"] = json!("Investigación cancelada.");
            job["message"] = json!("Investigación cancelada.");
            job["finishedAt"] = json!(now);
        })
    }

    pub(super) fn ai_research_start(&self, project_id: &str, body: Value) -> Result<Value, String> {
        self.read_config_checked()?;
        self.research_state_preflight(project_id)?;
        let brief = match body.get("brief") {
            Some(brief) => brief.clone(),
            None => self.ai_research_brief(project_id, body.clone())?,
        };
        let now = knownext_core::now_iso();
        let current_ai = self.read_config()["ai"].clone();
        let ai_snapshot: serde_json::Map<String, Value> = [
            "model",
            "vision",
            "imageGeneration",
            "transcription",
            "agentic",
            "permissions",
            "rag",
            "diagrams",
        ]
        .into_iter()
        .filter_map(|key| current_ai.get(key).map(|v| (key.to_string(), v.clone())))
        .collect();
        let job = json!({
            "runtimeId": self.runtime_id,
            "aiConfigSnapshot": ai_snapshot,
            "exchangeRateSnapshot": currency::read(&self.app_data_dir),
            "id": knownext_core::compact_id("research"),
            "projectId": project_id,
            "brief": brief,
            "status": "planning",
            "phases": ["planning", "searching", "reading", "extracting", "contrasting", "drafting", "reviewing"],
            "currentPhase": "planning",
            "phase": "planning",
            "progress": 5,
            "progressMessage": "Preparando investigación.",
            "message": "Preparando investigación.",
            "heartbeatAt": now,
            "lastActivityAt": now,
            "sources": [],
            "evidence": [],
            "strategy": Value::Null,
            "queryBatches": [],
            "sourceCandidates": [],
            "rankedSources": [],
            "sourceReads": [],
            "coverage": Value::Null,
            "findings": [],
            "draftMarkdown": Value::Null,
            "activity": [knownext_research::activity_event("planning", "info", "Investigación creada.")],
            "artifactCounts": {
                "candidateSources": 0,
                "rankedSources": 0,
                "selectedSources": 0,
                "readSources": 0,
                "evidence": 0,
                "findings": 0,
                "citedSources": 0,
                "tables": 0,
                "diagrams": 0,
                "images": 0
            },
            "usage": {
                "providerCalls": 0,
                "inputTokens": 0,
                "cachedInputTokens": 0,
                "outputTokens": 0,
                "reasoningTokens": 0,
                "totalTokens": 0,
                "estimatedCostEur": Value::Null,
                "currency": "EUR",
                "updatedAt": Value::Null
            },
            "budget": Value::Null,
            "qualityReport": Value::Null,
            "reviewState": { "status": "draft_ai", "comments": Value::Null, "reviewedAt": Value::Null },
            "metrics": { "durationMs": Value::Null, "estimatedCostEur": Value::Null, "sourceCount": 0, "evidenceCount": 0, "supportedClaimRatio": Value::Null },
            "documentId": Value::Null,
            "createdDocumentId": Value::Null,
            "documentPath": Value::Null,
            "markdown": Value::Null,
            "researchFindings": [],
            "tree": Value::Null,
            "usedSkills": [],
            "skillApplications": [],
            "skillDiagnostics": [],
            "generatedImages": [],
            "error": Value::Null,
            "retryOfJobId": body.get("retryOfJobId").cloned().unwrap_or(Value::Null),
            "request": body,
            "startedAt": Value::Null,
            "finishedAt": Value::Null,
            "createdAt": now,
            "updatedAt": now
        });
        self.write_ai_research_job(project_id, &job)?;

        let api = self.clone();
        let project_id = project_id.to_string();
        let job_id = job["id"].as_str().unwrap_or("").to_string();
        let activity = self.background_work.enter();
        thread::spawn(move || {
            let _activity = activity;
            if let Err(error) = api.ai_research_execute_job(&project_id, &job_id) {
                if api
                    .fail_ai_research_job_with_status(
                        &project_id,
                        &job_id,
                        "failed_runtime",
                        "research_runtime_error",
                        &format!("La investigación se ha detenido por un error interno: {error}"),
                        true,
                    )
                    .is_err()
                {
                    api.note_research_persistence_failure(&project_id, &job_id);
                }
            }
        });

        Ok(job)
    }

    pub(super) fn ai_research_execute_job(
        &self,
        project_id: &str,
        job_id: &str,
    ) -> Result<(), String> {
        self.read_config_checked()?;
        self.research_state_preflight(project_id)?;
        let started_at = knownext_core::now_iso();
        self.update_ai_research_job(project_id, job_id, |job| {
            job["startedAt"] = Value::from(started_at.clone());
            job["status"] = Value::from("planning");
            job["currentPhase"] = Value::from("planning");
            job["phase"] = Value::from("planning");
            job["progress"] = Value::from(10);
            job["progressMessage"] = Value::from("Validando configuración y alcance.");
            job["message"] = Value::from("Validando configuración y alcance.");
        })?;

        let job = self.ai_research_job(project_id, job_id)?;
        if job["status"].as_str() == Some("cancelled") {
            return Ok(());
        }
        let config = if job["aiConfigSnapshot"].is_object() {
            json!({"ai":job["aiConfigSnapshot"]})
        } else {
            self.read_config()
        };
        let model = config["ai"]["model"].as_str().unwrap_or("gpt-6.1-sol");
        if !config["ai"]["agentic"]["webResearchEnabled"]
            .as_bool()
            .unwrap_or(false)
        {
            self.fail_ai_research_job_with_status(
                project_id,
                job_id,
                "failed_provider",
                "web_research_disabled",
                "Activa la investigación web en Ajustes > IA para ejecutar investigaciones con fuentes online.",
                true,
            )?;
            return Ok(());
        }
        if self.openai_key().as_deref().unwrap_or("").trim().is_empty() {
            self.fail_ai_research_job_with_status(
                project_id,
                job_id,
                "failed_provider",
                "openai_key_missing",
                "Configura una API key de OpenAI en Ajustes > IA para ejecutar investigaciones.",
                true,
            )?;
            return Ok(());
        }

        if !currency::valid(&currency::read(&self.app_data_dir)) {
            self.fail_ai_research_job_with_status(project_id,job_id,"failed_runtime","exchange_rate_required","Se necesita una referencia EUR/USD del BCE de los últimos siete días antes de consumir el presupuesto en euros.",true)?;
            return Ok(());
        }
        let job = self.ai_research_job(project_id, job_id)?;
        let request = job.get("request").cloned().unwrap_or_else(|| json!({}));
        let context_sources = match self.resolve_ai_context_sources(project_id, &request) {
            Ok(sources) => sources,
            Err(error) => {
                self.fail_ai_research_job_with_status(
                    project_id,
                    job_id,
                    "failed_runtime",
                    "context_review_required",
                    &error,
                    true,
                )?;
                return Ok(());
            }
        };
        let strategy = knownext_research::strategy_for_brief(&job["brief"]);
        let max_cost = job["brief"]["maxEstimatedCostEur"].as_f64().unwrap_or(1.0);
        let max_steps = config["ai"]["agentic"]["maxSteps"]
            .as_u64()
            .and_then(|value| usize::try_from(value).ok())
            .unwrap_or(20);
        let budget = knownext_research::budget_for_strategy(&strategy, max_cost, max_steps);
        self.update_ai_research_job(project_id, job_id, |job| {
            job["strategy"] = strategy.clone();
            job["budget"] = budget.clone();
        })?;

        self.set_ai_research_phase(
            project_id,
            job_id,
            "query_planning",
            15,
            "Preparando consultas de investigación.",
        )?;
        if self.is_ai_research_cancelled(project_id, job_id)? {
            return Ok(());
        }
        let query_batches = knownext_research::query_batches(&job["brief"]["plan"], &strategy);
        self.update_ai_research_job(project_id, job_id, |job| {
            job["queryBatches"] = json!(query_batches);
            job["budget"] = knownext_research::increment_budget_step(&job["budget"], 1);
        })?;

        let job = self.ai_research_job(project_id, job_id)?;
        self.set_ai_research_phase(project_id, job_id, "searching", 25, "Buscando fuentes.")?;
        let candidate_limit = strategy["candidateSourceLimit"]
            .as_u64()
            .and_then(|value| usize::try_from(value).ok())
            .unwrap_or(50)
            .clamp(1, 500);
        let mut source_candidates: Vec<Value> = Vec::new();
        let query_batches = job["queryBatches"].as_array().cloned().unwrap_or_default();
        let query_batch_total = query_batches.len().max(1);
        for (batch_index, batch) in query_batches.into_iter().enumerate() {
            if self.is_ai_research_cancelled(project_id, job_id)? {
                return Ok(());
            }
            let remaining = candidate_limit.saturating_sub(source_candidates.len());
            if remaining == 0 {
                break;
            }
            let aspect = batch["aspect"]
                .as_str()
                .unwrap_or("el objetivo definido")
                .chars()
                .take(90)
                .collect::<String>();
            self.set_ai_research_phase(
                project_id,
                job_id,
                "searching",
                25 + ((batch_index as u64 * 8) / query_batch_total as u64),
                &format!(
                    "Investigando {} de {}: {aspect}.",
                    batch_index + 1,
                    query_batch_total
                ),
            )?;
            self.spend_preflight(Some(project_id))?;
            let step = knownext_ai::run_research_step(
                self.openai_key().as_deref(),
                model,
                "search",
                &json!({
                    "brief": job["brief"],
                    "plan": job["brief"]["plan"],
                    "strategy": strategy,
                    "queryBatch": batch,
                    "contextSources": compact_research_context_sources(&context_sources)
                }),
                true,
            );
            if step["status"].as_str() != Some("ready") {
                self.fail_ai_research_job_with_status(
                    project_id,
                    job_id,
                    "failed_provider",
                    "provider_error",
                    step["message"]
                        .as_str()
                        .unwrap_or("No se pudieron buscar fuentes."),
                    true,
                )?;
                return Ok(());
            }
            source_candidates.extend(knownext_research::normalize_source_candidates(
                &step["body"],
                &batch,
                remaining,
            ));
            self.update_ai_research_job(project_id, job_id, |job| {
                job["sourceCandidates"] = json!(source_candidates.clone());
                job["budget"] = knownext_research::increment_budget_step(&job["budget"], 1);
            })?;
            let found = source_candidates.len();
            self.set_ai_research_phase(
                project_id,
                job_id,
                "searching",
                30,
                &format!("Fuentes candidatas encontradas: {found} de {candidate_limit}."),
            )?;
            self.record_ai_usage_records(project_id, job_id, &step)?;
        }
        if source_candidates.is_empty() {
            self.fail_ai_research_job_with_status(
                project_id,
                job_id,
                "failed_quality",
                "no_sources",
                "No se han encontrado fuentes web verificables para la investigación.",
                true,
            )?;
            return Ok(());
        }

        self.set_ai_research_phase(
            project_id,
            job_id,
            "ranking",
            35,
            "Seleccionando fuentes relevantes.",
        )?;
        let ranked_sources = knownext_research::rank_sources(&source_candidates, candidate_limit);
        let read_budget = strategy["sourceReadBudget"]
            .as_u64()
            .and_then(|value| usize::try_from(value).ok())
            .unwrap_or(12);
        let selected_sources =
            knownext_research::select_sources_for_reading(&ranked_sources, read_budget);
        self.update_ai_research_job(project_id, job_id, |job| {
            job["rankedSources"] = json!(ranked_sources.clone());
            job["sources"] = json!(selected_sources.clone());
            job["budget"] = knownext_research::increment_budget_step(&job["budget"], 1);
        })?;

        self.set_ai_research_phase(
            project_id,
            job_id,
            "reading",
            45,
            &format!("Leyendo {} fuentes seleccionadas.", selected_sources.len()),
        )?;
        let mut source_reads = self.read_ai_research_sources(&selected_sources);
        source_reads.extend(project_context_source_reads(&context_sources));
        self.update_ai_research_job(project_id, job_id, |job| {
            job["sourceReads"] = json!(source_reads.clone());
            job["budget"] = knownext_research::increment_budget_step(&job["budget"], 1);
        })?;
        let read_count = self.ai_research_job(project_id, job_id)?["sourceReads"]
            .as_array()
            .map(|items| {
                items
                    .iter()
                    .filter(|item| item["status"].as_str() == Some("read"))
                    .count()
            })
            .unwrap_or(0);
        self.set_ai_research_phase(
            project_id,
            job_id,
            "reading",
            52,
            &format!(
                "Fuentes leídas: {read_count} de {}.",
                selected_sources.len()
            ),
        )?;
        if self.is_ai_research_cancelled(project_id, job_id)? {
            return Ok(());
        }

        self.set_ai_research_phase(
            project_id,
            job_id,
            "extracting",
            58,
            "Extrayendo evidencias.",
        )?;
        let source_read_batches = research_source_read_batches(&source_reads);
        let mut evidence: Vec<Value> = Vec::new();
        let source_read_batch_total = source_read_batches.len().max(1);
        for (batch_index, source_read_batch) in source_read_batches.into_iter().enumerate() {
            if self.is_ai_research_cancelled(project_id, job_id)? {
                return Ok(());
            }
            self.set_ai_research_phase(
                project_id,
                job_id,
                "extracting",
                58 + ((batch_index as u64 * 4) / source_read_batch_total as u64),
                &format!(
                    "Extrayendo evidencias del lote {} de {}.",
                    batch_index + 1,
                    source_read_batch_total
                ),
            )?;
            self.spend_preflight(Some(project_id))?;
            let evidence_step = knownext_ai::run_research_step(
                self.openai_key().as_deref(),
                model,
                "evidence",
                &json!({
                    "brief": research_brief_for_worker(&job["brief"]),
                    "plan": research_plan_for_worker(&job["brief"]["plan"]),
                    "strategy": strategy,
                    "sourceReads": source_read_batch
                }),
                false,
            );
            if evidence_step["status"].as_str() != Some("ready") {
                self.fail_ai_research_job_with_status(
                    project_id,
                    job_id,
                    "failed_provider",
                    "provider_error",
                    evidence_step["message"]
                        .as_str()
                        .unwrap_or("No se pudieron extraer evidencias."),
                    true,
                )?;
                return Ok(());
            }
            evidence.extend(
                evidence_step["body"]["evidence"]
                    .as_array()
                    .cloned()
                    .unwrap_or_default()
                    .into_iter()
                    .filter(|item| item["sourceId"].as_str().is_some()),
            );
            self.record_ai_usage_records(project_id, job_id, &evidence_step)?;
        }
        self.update_ai_research_job(project_id, job_id, |job| {
            job["evidence"] = json!(evidence.clone());
            job["budget"] = knownext_research::increment_budget_step(&job["budget"], 1);
        })?;
        let evidence_count = self.ai_research_job(project_id, job_id)?["evidence"]
            .as_array()
            .map(Vec::len)
            .unwrap_or(0);
        self.set_ai_research_phase(
            project_id,
            job_id,
            "extracting",
            62,
            &format!("Evidencias extraídas: {evidence_count}."),
        )?;
        self.set_ai_research_phase(project_id, job_id, "gap_analysis", 66, "Revisando lagunas.")?;
        let captured_sources = self.ai_research_job(project_id, job_id)?["sources"].clone();
        let coverage = knownext_research::coverage_report(
            &job["brief"]["plan"],
            &knownext_research::usable_evidence(
                captured_sources
                    .as_array()
                    .map(Vec::as_slice)
                    .unwrap_or(&[]),
                &evidence,
            ),
            &strategy,
        );
        self.update_ai_research_job(project_id, job_id, |job| {
            job["coverage"] = coverage.clone();
            job["budget"] = knownext_research::increment_budget_step(&job["budget"], 1);
        })?;
        if self.is_ai_research_cancelled(project_id, job_id)? {
            return Ok(());
        }

        self.set_ai_research_phase(
            project_id,
            job_id,
            "synthesizing",
            75,
            "Contrastando hallazgos.",
        )?;
        self.spend_preflight(Some(project_id))?;
        let synthesize_step = knownext_ai::run_research_step(
            self.openai_key().as_deref(),
            model,
            "synthesize",
            &json!({
                "brief": research_brief_for_worker(&job["brief"]),
                "plan": research_plan_for_worker(&job["brief"]["plan"]),
                "strategy": strategy,
                "coverage": coverage,
                "evidence": compact_research_evidence(&evidence, 90, 500)
            }),
            false,
        );
        if synthesize_step["status"].as_str() != Some("ready") {
            self.fail_ai_research_job_with_status(
                project_id,
                job_id,
                "failed_provider",
                "provider_error",
                synthesize_step["message"]
                    .as_str()
                    .unwrap_or("No se pudieron sintetizar hallazgos."),
                true,
            )?;
            return Ok(());
        }
        let findings = synthesize_step["body"]["findings"]
            .as_array()
            .cloned()
            .unwrap_or_default();
        self.update_ai_research_job(project_id, job_id, |job| {
            job["findings"] = json!(findings.clone());
            job["researchFindings"] = synthesize_step["body"]["researchFindings"].clone();
            job["budget"] = knownext_research::increment_budget_step(&job["budget"], 1);
        })?;
        let finding_count = self.ai_research_job(project_id, job_id)?["findings"]
            .as_array()
            .map(Vec::len)
            .unwrap_or(0);
        self.set_ai_research_phase(
            project_id,
            job_id,
            "synthesizing",
            79,
            &format!("Hallazgos contrastados: {finding_count}."),
        )?;
        self.record_ai_usage_records(project_id, job_id, &synthesize_step)?;

        self.set_ai_research_phase(project_id, job_id, "drafting", 84, "Redactando informe.")?;
        let allowed_visuals = job["brief"]["reportProfile"].clone();
        self.spend_preflight(Some(project_id))?;
        let write_step = knownext_ai::run_research_step(
            self.openai_key().as_deref(),
            model,
            "write",
            &json!({
                "brief": research_brief_for_worker(&job["brief"]),
                "plan": research_plan_for_worker(&job["brief"]["plan"]),
                "strategy": strategy,
                "findings": compact_research_findings(&findings, 60, 900),
                "evidence": compact_research_evidence_for_findings(&evidence, &findings, 70, 500),
                "allowedVisuals": allowed_visuals,
                "recommendedReportStyle": job["brief"]["plan"]["recommendedReportStyle"]
            }),
            false,
        );
        if write_step["status"].as_str() != Some("ready") {
            self.fail_ai_research_job_with_status(
                project_id,
                job_id,
                "failed_provider",
                "provider_error",
                write_step["message"]
                    .as_str()
                    .unwrap_or("No se pudo redactar el informe."),
                true,
            )?;
            return Ok(());
        }
        let draft_markdown = write_step["body"]["markdown"]
            .as_str()
            .unwrap_or("")
            .trim()
            .to_string();
        self.update_ai_research_job(project_id, job_id, |job| {
            job["draftMarkdown"] = Value::from(draft_markdown.clone());
            job["budget"] = knownext_research::increment_budget_step(&job["budget"], 1);
        })?;
        self.set_ai_research_phase(
            project_id,
            job_id,
            "drafting",
            89,
            &format!(
                "Informe redactado: {} palabras.",
                draft_markdown.split_whitespace().count()
            ),
        )?;
        self.record_ai_usage_records(project_id, job_id, &write_step)?;

        self.set_ai_research_phase(
            project_id,
            job_id,
            "verifying",
            92,
            "Verificando citas y cobertura.",
        )?;
        let mut job = self.ai_research_job(project_id, job_id)?;
        let diagnostics =
            validate_research_draft(&draft_markdown, &job["brief"], &job["sourceReads"]);
        let quality_report = knownext_research::quality_report(
            job["sources"].as_array().map(Vec::as_slice).unwrap_or(&[]),
            job["evidence"].as_array().map(Vec::as_slice).unwrap_or(&[]),
            &job["coverage"],
            job["findings"].as_array().map(Vec::as_slice).unwrap_or(&[]),
            &diagnostics,
        );
        let final_status = knownext_research::final_status_from_quality(&quality_report);
        self.update_ai_research_job(project_id, job_id, |job| {
            job["qualityReport"] = quality_report.clone();
            job["skillDiagnostics"] = json!(diagnostics);
        })?;
        if final_status == "failed_quality" {
            self.fail_ai_research_job_with_status(
                project_id,
                job_id,
                "failed_quality",
                "quality_failed",
                "La investigación no alcanza la calidad mínima de fuentes, evidencias o citas. No se ha creado documento.",
                true,
            )?;
            return Ok(());
        }

        self.set_ai_research_phase(
            project_id,
            job_id,
            "publishing",
            97,
            "Preparando nombre del borrador.",
        )?;
        let mut markdown = draft_markdown;
        let publish_result = (|| -> Result<(String, String, Vec<Value>, Value), String> {
            let generated_visuals = self.generate_ai_research_visual_assets(
                project_id,
                &job,
                &write_step["body"],
                &mut markdown,
            )?;
            self.set_ai_research_phase(
                project_id,
                job_id,
                "publishing",
                98,
                "Guardando archivo Markdown.",
            )?;
            let topic = job["brief"]["topic"].as_str().unwrap_or("Investigación");
            let _project_write = self.project_write(project_id)?;
            let file_name = safe_research_markdown_file_name(topic, job_id);
            let parent = job["brief"]["destinationFolderId"].as_str();
            let parent_relative = self.node_relative(project_id, parent)?;
            let relative =
                self.unique_project_relative(project_id, parent_relative.as_deref(), &file_name)?;
            let path = self.resolve_project_relative(project_id, &relative)?;
            if let Some(parent_path) = path.parent() {
                std::fs::create_dir_all(parent_path).map_err(|error| error.to_string())?;
            }
            if self.ai_research_job(project_id, job_id)?["status"].as_str() == Some("cancelled") {
                return Err("Investigación cancelada.".to_string());
            }
            atomic_io::create(&path,markdown.as_bytes()).map_err(|_|"No se pudo publicar el informe sin reemplazar archivos. Se conserva el resultado para revisión".to_string())?;
            self.set_ai_research_phase(
                project_id,
                job_id,
                "publishing",
                99,
                "Preparando la confirmación del borrador.",
            )?;
            let tree = Value::Null; // The UI obtains the current bounded view after publication.
            self.set_ai_research_phase(
                project_id,
                job_id,
                "publishing",
                99,
                "Registrando borrador.",
            )?;
            let document_id = doc_id(project_id, &relative);
            Ok((relative, document_id, generated_visuals, tree))
        })();
        let (relative, document_id, generated_visuals, tree) = match publish_result {
            Ok(result) => result,
            Err(_error)
                if self.ai_research_job(project_id, job_id)?["status"].as_str()
                    == Some("cancelled") =>
            {
                return Ok(());
            }
            Err(error) => {
                self.fail_ai_research_job_with_status(
                    project_id,
                    job_id,
                    "failed_publish",
                    "publish_failed",
                    &format!(
                        "La investigación terminó, pero no se pudo crear el borrador: {error}"
                    ),
                    true,
                )?;
                return Ok(());
            }
        };
        let finished_at = knownext_core::now_iso();
        let duration_ms = iso_duration_ms(
            job["startedAt"].as_str().unwrap_or(started_at.as_str()),
            &finished_at,
        );

        job["status"] = Value::from(final_status);
        job["currentPhase"] = Value::from(final_status);
        job["phase"] = Value::from(final_status);
        job["progress"] = Value::from(100);
        job["progressMessage"] = Value::from("Investigación completada.");
        job["message"] =
            Value::from("Investigación completada. Se ha creado un borrador revisable.");
        job["qualityReport"] = quality_report;
        job["reviewState"] =
            json!({ "status": "draft_ai", "comments": Value::Null, "reviewedAt": Value::Null });
        job["metrics"] = json!({
            "durationMs": duration_ms,
            "estimatedCostEur": Value::Null,
            "sourceCount": job["sources"].as_array().map(|items| items.len()).unwrap_or(0),
            "evidenceCount": job["evidence"].as_array().map(|items| items.len()).unwrap_or(0),
            "supportedClaimRatio": supported_claim_ratio(&job["evidence"])
        });
        job["documentId"] = Value::from(document_id.clone());
        job["createdDocumentId"] = Value::from(document_id.clone());
        job["documentPath"] = Value::from(relative.clone());
        job["markdown"] = Value::from(markdown);
        if !generated_visuals.is_empty() {
            job["generatedImages"] = Value::Array(generated_visuals);
        }
        job["tree"] = tree;
        job["treeDeferred"] = json!(true);
        job["usedSkills"] = json!(["knownext.research_report"]);
        job["skillApplications"] = json!([]);
        job["finishedAt"] = Value::from(finished_at.clone());
        job["updatedAt"] = Value::from(finished_at);
        append_research_activity(&mut job, final_status, "info", "Borrador creado.");
        self.write_ai_research_job(project_id, &job)?;
        if self.is_ai_research_cancelled(project_id, job_id)? {
            return Ok(());
        }
        if let Err(error) = self.append_ai_research_event(project_id, &job) {
            job["conversationWarning"] = json!(error);
            self.write_ai_research_job(project_id, &job)?;
        }
        Ok(())
    }

    pub(super) fn generate_ai_research_visual_assets(
        &self,
        project_id: &str,
        job: &Value,
        result: &Value,
        markdown: &mut String,
    ) -> Result<Vec<Value>, String> {
        if !job["brief"]["reportProfile"]["imagesEnabled"]
            .as_bool()
            .unwrap_or(false)
        {
            return Ok(Vec::new());
        }
        let visual_requests = result["visualRequests"]
            .as_array()
            .cloned()
            .unwrap_or_default();
        if visual_requests.is_empty() {
            return Ok(Vec::new());
        }
        let config = self.read_config_checked()?;
        let ai = &config["ai"];
        if !ai["imageGeneration"]["enabled"].as_bool().unwrap_or(false)
            || !ai["permissions"]["generateImages"]
                .as_bool()
                .unwrap_or(false)
            || !ai["permissions"]["createImageAssets"]
                .as_bool()
                .unwrap_or(false)
        {
            return Ok(vec![json!({
                "status": "blocked",
                "message": "El informe solicitó imágenes, pero la generación o creación de assets está desactivada."
            })]);
        }

        let mut generated = Vec::new();
        let image_config = &ai["imageGeneration"];
        let parent = self.image_generation_parent(project_id, None, image_config)?;
        for request in visual_requests.into_iter().take(3) {
            if request["kind"].as_str() != Some("image") {
                continue;
            }
            let prompt = request["prompt"].as_str().unwrap_or("").trim();
            if prompt.is_empty() {
                continue;
            }
            if let Err(message) = self.spend_preflight(Some(project_id)) {
                generated
                    .push(json!({"status":"blocked","title":request["title"],"message":message}));
                break;
            }
            let image =
                knownext_ai::generate_image(self.openai_key().as_deref(), image_config, prompt);
            if image["status"].as_str() != Some("completed") {
                generated.push(json!({
                    "status": "error",
                    "title": request["title"],
                    "message": image["message"]
                }));
                continue;
            }
            let usage_warning = self
                .record_research_image_usage(
                    project_id,
                    job["id"]
                        .as_str()
                        .ok_or("La investigación no tiene identidad para registrar imágenes")?,
                    &image,
                )
                .err();
            let bytes = base64::engine::general_purpose::STANDARD
                .decode(image["dataBase64"].as_str().unwrap_or("").as_bytes())
                .map_err(|error| {
                    format!("No se pudo decodificar la imagen de investigación: {error}")
                })?;
            if bytes.is_empty() {
                continue;
            }
            let format = image["format"]
                .as_str()
                .unwrap_or_else(|| image_config["outputFormat"].as_str().unwrap_or("png"));
            let title = request["title"].as_str().unwrap_or("imagen-investigacion");
            let name = image_file_name(title, format);
            let _project_write = self.project_write(project_id)?;
            let relative = self.unique_project_relative(project_id, parent.as_deref(), &name)?;
            let path = self.resolve_project_relative(project_id, &relative)?;
            if let Some(parent_path) = path.parent() {
                std::fs::create_dir_all(parent_path).map_err(|error| error.to_string())?;
            }
            atomic_io::create(&path, &bytes).map_err(|_| "No se pudo publicar la imagen sin reemplazar archivos; se conserva el trabajo anterior")?;
            let alt_text = request["altText"]
                .as_str()
                .unwrap_or("Imagen generada para el informe");
            generated.push(json!({
                "status": "completed",
                "title": title,
                "path": relative,
                "altText": alt_text,
                "prompt": prompt,
                "usageWarning":usage_warning
            }));
            if usage_warning.is_some() {
                break;
            }
        }

        let completed = generated
            .iter()
            .filter(|item| item["status"].as_str() == Some("completed"))
            .collect::<Vec<_>>();
        if !completed.is_empty() {
            markdown.push_str("\n\n## Recursos visuales generados\n\n");
            for item in completed {
                let path = item["path"].as_str().unwrap_or("");
                let alt = item["altText"].as_str().unwrap_or("Imagen generada");
                markdown.push_str(&format!("![{alt}]({path})\n\n"));
            }
        }
        Ok(generated)
    }

    pub(super) fn update_ai_research_job<F>(
        &self,
        project_id: &str,
        job_id: &str,
        update: F,
    ) -> Result<Value, String>
    where
        F: FnOnce(&mut Value),
    {
        self.update_ai_research_job_checked(project_id, job_id, |job| {
            update(job);
            Ok(())
        })
    }
    pub(super) fn update_ai_research_job_checked<F>(
        &self,
        project_id: &str,
        job_id: &str,
        update: F,
    ) -> Result<Value, String>
    where
        F: FnOnce(&mut Value) -> Result<(), String>,
    {
        let _gate = self
            .research_gate
            .lock()
            .map_err(|_| "No se puede acceder al estado de investigación")?;
        let mut job = self.ai_research_job(project_id, job_id)?;
        update(&mut job)?;
        job["updatedAt"] = Value::from(knownext_core::now_iso());
        self.write_ai_research_job_unlocked(project_id, &job)?;
        Ok(job)
    }
    pub(super) fn is_ai_research_cancelled(
        &self,
        project_id: &str,
        job_id: &str,
    ) -> Result<bool, String> {
        Ok(self.ai_research_job(project_id, job_id)?["status"].as_str() == Some("cancelled"))
    }
    pub(super) fn read_ai_research_sources(&self, sources: &[Value]) -> Vec<Value> {
        let client = knownext_core::http_client_builder()
            .timeout(Duration::from_secs(12))
            .build()
            .unwrap_or_else(|_| Client::new());
        sources
            .iter()
            .map(|source| {
                let source_id = source["id"].as_str().unwrap_or("").to_string();
                let url = source["url"].as_str().unwrap_or("").trim().to_string();
                let fallback = source["snapshotExcerpt"]
                    .as_str()
                    .filter(|value| !value.trim().is_empty())
                    .or_else(|| {
                        source["usedFragments"]
                            .as_array()
                            .and_then(|items| items.first())
                            .and_then(Value::as_str)
                    })
                    .unwrap_or("")
                    .to_string();
                let (status, text) = if url.starts_with("http://") || url.starts_with("https://") {
                    match client
                        .get(&url)
                        .header(USER_AGENT, "KnowNext.ai research reader")
                        .header(ACCEPT, "text/html,text/plain,application/xhtml+xml")
                        .send()
                    {
                        Ok(response) if response.status().is_success() => match response.text() {
                            Ok(body) => ("read", clean_web_text(&body)),
                            Err(_) if !fallback.is_empty() => ("read", fallback.clone()),
                            Err(_) => ("unavailable", String::new()),
                        },
                        _ if !fallback.is_empty() => ("read", fallback.clone()),
                        _ => ("unavailable", String::new()),
                    }
                } else if !fallback.is_empty() {
                    ("read", fallback.clone())
                } else {
                    ("unavailable", String::new())
                };
                json!({
                    "sourceId": source_id,
                    "title": source["title"].clone(),
                    "url": source["url"].clone(),
                    "path": source["path"].clone(),
                    "kind": source["kind"].clone(),
                    "status": status,
                    "readAt": knownext_core::now_iso(),
                    "content": text.chars().take(8_000).collect::<String>(),
                    "excerpt": fallback.chars().take(1_200).collect::<String>(),
                    "objectiveIndex": source["objectiveIndex"].clone(),
                    "aspectIndex": source["aspectIndex"].clone()
                })
            })
            .collect()
    }
    pub(super) fn set_ai_research_phase(
        &self,
        project_id: &str,
        job_id: &str,
        phase: &str,
        progress: u64,
        message: &str,
    ) -> Result<Value, String> {
        self.update_ai_research_job(project_id, job_id, |job| {
            if job["status"].as_str() == Some("cancelled") {
                return;
            }
            job["status"] = Value::from(phase);
            job["currentPhase"] = Value::from(phase);
            job["phase"] = Value::from(phase);
            job["progress"] = Value::from(progress.min(99));
            job["progressMessage"] = Value::from(message);
            job["message"] = Value::from(message);
            append_research_activity(job, phase, "info", message);
        })
    }
    pub(super) fn fail_ai_research_job_with_status(
        &self,
        project_id: &str,
        job_id: &str,
        status: &str,
        code: &str,
        message: &str,
        retryable: bool,
    ) -> Result<Value, String> {
        self.update_ai_research_job(project_id, job_id, |job| {
            if job["status"].as_str() == Some("cancelled") {
                return;
            }
            let now = knownext_core::now_iso();
            job["status"] = Value::from(status);
            job["currentPhase"] = Value::from(status);
            job["phase"] = Value::from(status);
            job["progress"] = Value::from(100);
            job["progressMessage"] = Value::from(message);
            job["message"] = Value::from(message);
            job["error"] = json!({ "code": code, "message": message, "retryable": retryable });
            job["finishedAt"] = Value::from(now);
            append_research_activity(job, status, "error", message);
        })
    }
    pub(super) fn ai_research_retry(
        &self,
        project_id: &str,
        job_id: &str,
    ) -> Result<Value, String> {
        let job = self.ai_research_job(project_id, job_id)?;
        let mut request = job.get("request").cloned().unwrap_or_else(|| {
            json!({
                "brief": job["brief"].clone(),
                "activeMarkdown": "",
                "contextSourceIds": []
            })
        });
        if let Some(object) = request.as_object_mut() {
            object.insert("brief".to_string(), job["brief"].clone());
            object.insert("retryOfJobId".to_string(), Value::from(job_id));
        }
        self.ai_research_start(project_id, request)
    }
    pub(super) fn ai_research_refine(
        &self,
        project_id: &str,
        job_id: &str,
        body: Value,
    ) -> Result<Value, String> {
        let job = self.ai_research_job(project_id, job_id)?;
        let action = body
            .get("action")
            .and_then(Value::as_str)
            .unwrap_or("expand");
        let instruction = body
            .get("instruction")
            .and_then(Value::as_str)
            .unwrap_or("");
        let mut brief = job["brief"].clone();
        let suffix = match action {
            "reduce" => {
                "Reducir y sintetizar el resultado anterior, manteniendo fuentes y limitaciones."
            }
            "technical_focus" => "Añadir mayor enfoque técnico y trazabilidad de decisiones.",
            "add_recommendations" => "Ampliar recomendaciones accionables y riesgos.",
            "update_sources" => "Actualizar fuentes y contrastar cambios recientes.",
            "new_version" => "Crear una nueva versión revisada desde la investigación anterior.",
            _ => "Ampliar la investigación con mayor profundidad.",
        };
        let current_objective = brief["objective"].as_str().unwrap_or("").trim();
        brief["objective"] = Value::from(format!(
            "{current_objective}\n\nRefinamiento: {suffix} {instruction}"
        ));
        brief["updatedAt"] = Value::from(knownext_core::now_iso());
        let mut request = job.get("request").cloned().unwrap_or_else(|| json!({}));
        if let Some(object) = request.as_object_mut() {
            object.insert("brief".to_string(), brief);
            object.insert("retryOfJobId".to_string(), Value::from(job_id));
        }
        self.ai_research_start(project_id, request)
    }
    pub(super) fn ai_research_update_sources(
        &self,
        project_id: &str,
        job_id: &str,
    ) -> Result<Value, String> {
        self.ai_research_refine(project_id, job_id, json!({ "action": "update_sources" }))
    }
    pub(super) fn ai_research_sources(
        &self,
        project_id: &str,
        job_id: &str,
    ) -> Result<Value, String> {
        let job = self.ai_research_job(project_id, job_id)?;
        Ok(json!({
            "sources": job["sources"].clone(),
            "evidence": job["evidence"].clone(),
            "sourceCandidates": job["sourceCandidates"].clone(),
            "rankedSources": job["rankedSources"].clone(),
            "sourceReads": job["sourceReads"].clone()
        }))
    }
    pub(super) fn ai_research_quality(
        &self,
        project_id: &str,
        job_id: &str,
    ) -> Result<Value, String> {
        let job = self.ai_research_job(project_id, job_id)?;
        if job["qualityReport"].is_object() {
            return Ok(job["qualityReport"].clone());
        }
        Ok(knownext_research::quality_report(
            job["sources"].as_array().map(Vec::as_slice).unwrap_or(&[]),
            job["evidence"].as_array().map(Vec::as_slice).unwrap_or(&[]),
            &job["coverage"],
            job["findings"].as_array().map(Vec::as_slice).unwrap_or(&[]),
            job["skillDiagnostics"]
                .as_array()
                .map(Vec::as_slice)
                .unwrap_or(&[]),
        ))
    }
    pub(super) fn ai_research_activity(
        &self,
        project_id: &str,
        job_id: &str,
    ) -> Result<Value, String> {
        let job = self.ai_research_job(project_id, job_id)?;
        Ok(json!({
            "jobId": job_id,
            "activity": job["activity"].clone()
        }))
    }
    pub(super) fn ai_research_coverage(
        &self,
        project_id: &str,
        job_id: &str,
    ) -> Result<Value, String> {
        let job = self.ai_research_job(project_id, job_id)?;
        Ok(json!({
            "jobId": job_id,
            "coverage": job["coverage"].clone()
        }))
    }
    pub(super) fn ai_research_accept(
        &self,
        project_id: &str,
        job_id: &str,
    ) -> Result<Value, String> {
        self.update_ai_research_job(project_id, job_id, |job| {
            job["reviewState"] = json!({
                "status": "accepted",
                "comments": Value::Null,
                "reviewedAt": knownext_core::now_iso()
            });
        })
    }
    pub(super) fn ai_research_review(
        &self,
        project_id: &str,
        job_id: &str,
        body: Value,
    ) -> Result<Value, String> {
        let comments = body
            .get("comments")
            .and_then(Value::as_str)
            .unwrap_or("")
            .trim();
        self.update_ai_research_job(project_id, job_id, |job| {
            job["reviewState"] = json!({
                "status": "revision_requested",
                "comments": comments,
                "reviewedAt": knownext_core::now_iso()
            });
        })
    }
    pub(super) fn ai_research_export(
        &self,
        project_id: &str,
        job_id: &str,
        body: Value,
    ) -> Result<Value, String> {
        let job = self.ai_research_job(project_id, job_id)?;
        let format = body
            .get("format")
            .and_then(Value::as_str)
            .unwrap_or("markdown");
        let markdown = job["markdown"].as_str().unwrap_or("").to_string();
        if markdown.trim().is_empty() {
            return Err("La investigación no tiene contenido exportable.".to_string());
        }
        let topic = job["brief"]["topic"].as_str().unwrap_or("investigacion");
        let file_name = match format {
            "pdf" => research_export_file_name(topic, "pdf"),
            "docx" => research_export_file_name(topic, "docx"),
            "package" => research_export_file_name(topic, "json"),
            _ => research_export_file_name(topic, "md"),
        };
        let export = json!({
            "format": format,
            "filename": file_name,
            "markdown": if format == "markdown" { Value::from(markdown) } else { Value::Null },
            "path": Value::Null,
            "message": if format == "markdown" {
                "Exportación Markdown preparada."
            } else {
                "La exportación avanzada queda preparada en contrato; usa Markdown hasta activar conversión local."
            }
        });
        let _ = project_id;
        Ok(export)
    }
    pub(super) fn append_ai_research_event(
        &self,
        project_id: &str,
        job: &Value,
    ) -> Result<(), String> {
        self.append_ai_conversation_events(
            project_id,
            vec![json!({
                "id": knownext_core::compact_id("ai-event"),
                "projectId": project_id,
                "type": "document_created",
                "role": "assistant",
                "content": job["message"],
                "createdAt": knownext_core::now_iso(),
                "documentId": job["documentId"],
                "path": job["documentPath"],
                "paths": if job["documentPath"].is_string() { json!([job["documentPath"].clone()]) } else { json!([]) },
                "summary": job["brief"]["topic"],
                "sourcesUsed": job["sources"],
                "usedSkills": job["usedSkills"],
                "skillApplications": job["skillApplications"],
                "skillDiagnostics": job["skillDiagnostics"]
            })],
        )
    }
}
