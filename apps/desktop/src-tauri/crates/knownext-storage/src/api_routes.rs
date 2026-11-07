//! JSON and binary request dispatch. Business rules stay in their domain services.
use super::*;

fn proton_content_change_project(method: &str, raw_path: &str, destination: Option<&str>, response: &Value) -> Option<String> {
    // Positive content-write list: POST is also used for searches, reviews,
    // previews, polling and private metadata. None of those is a document edit.
    // Unknown/new routes and changes outside this dispatcher remain detectable
    // by the engine's independent content snapshot, without inventing markers.
    let method = method.to_ascii_uppercase();
    let segments = raw_path.split('?').next().unwrap_or(raw_path).trim_matches('/').split('/')
        .map(knownext_core::percent_decode).collect::<Vec<_>>();
    let parts=segments.iter().map(String::as_str).collect::<Vec<_>>();
    match (method.as_str(), parts.as_slice()) {
        ("POST", ["api", "projects", project, "ai", "interactions" | "confirm-delete"])
            if response["operations"].as_array().is_some_and(|operations|
                operations.iter().any(|operation| operation["runtimeApplied"] == true))
            => Some((*project).to_owned()),
        ("POST", ["api", "projects", project,
            "folders" | "documents" | "handwritten-notes" | "attachments" |
            "meeting-minutes" | "history-restores" | "document-replacements"])
        | ("POST", ["api", "projects", project, "assets", "images"])
        | ("PATCH", ["api", "projects", project, "nodes", _, "rename" | "move"])
        | ("DELETE", ["api", "projects", project, "nodes", _])
        | ("POST", ["api", "projects", project, "nodes", "batch", _, "execute"])
        | ("POST", ["api", "projects", project, "trash", _, "restore"])
        | ("POST", ["api", "projects", project, "documents", _, "duplicate"])
        | ("POST", ["api", "projects", project, "scheduled-backups", _, "restore"])
        | ("POST", ["api", "projects", project, "research-evidence", _, "apply"])
        | ("POST", ["api", "projects", project, "ai-changes", _, "revert"])
        | ("POST", ["api", "projects", project, "document-replacements", _, "undo"])
        | ("POST", ["api", "projects", project, "portable-workspace", "apply"])
        | ("POST", ["api", "projects", project, "external-changes", "import"])
        | ("POST", ["api", "projects", project, "sync", "pull"])
        | ("POST", ["api", "projects", project, "sync", "history-copies"])
        | ("POST", ["api", "projects", project, "sync", "mixed-selections", _, "application"])
        | ("POST", ["api", "projects", project, "sync", "mixed-selections", _, "application", "continue" | "copy"])
        | ("POST", ["api", "projects", project, "ai", "context", "sources", _, "add-to-project"])
            => Some((*project).to_owned()),
        ("PUT", ["api", "documents" | "handwritten-notes", key])
        | ("POST", ["api", "documents" | "handwritten-notes", key, "conflict"])
        | ("POST", ["api", "documents", key, "ai-changes", "apply"])
        | ("POST", ["api", "documents", key, "versions", _, "restore"])
        | ("POST", ["api", "handwritten-notes", key, "ocr", _, "apply"])
        | ("POST", ["api", "handwritten-notes", key, "pages", _, "insert-markdown"])
            => key.split_once("::").map(|(project, _)| project.to_owned()),
        ("POST", ["api", "document-templates", _, "create"])
        | ("POST", ["api", "recovery", "drafts", _, "copy"])
        | ("POST", ["api", "ai", "results", _, "copy"])
        | ("POST", ["api", "drafts", _, "restore"]) => destination.map(str::to_owned)
            .or_else(|| response.pointer("/node/id").or_else(|| response.pointer("/document/id"))
                .and_then(Value::as_str).and_then(|key| key.split_once("::"))
                .map(|(project, _)| project.to_owned())),
        _ => None,
    }
}

impl LocalApi {
    pub fn handle(
        &self,
        method: &str,
        raw_path: &str,
        body: Value,
        files: Vec<LocalApiFile>,
    ) -> ApiResult {
        let class = runtime_performance::OperationClass::for_request(method, raw_path);
        let started = std::time::Instant::now();
        let destination = body["projectId"].as_str().map(str::to_owned);
        let result = self.handle_unmeasured(method, raw_path, body, files);
        if let Ok(response) = &result {
          if response.status < 400 {
            let project=proton_content_change_project(method,raw_path,destination.as_deref(),&response.body);
            if let Some(project)=project { let _=self.proton_note_local_change(&project); }
          }
        }

        if let Some(class) = class {
            let failed = match &result {
                Ok(response) => response.status >= 400,
                Err(_) => true,
            };
            self.runtime_performance.record(class, started.elapsed(), failed);
        }
        result
    }
    fn handle_unmeasured(
        &self,
        method: &str,
        raw_path: &str,
        body: Value,
        files: Vec<LocalApiFile>,
    ) -> ApiResult {
        if let Err(detail)=validate_runtime_input(&body,&files){return Ok(LocalApiResponse{status:400,body:json!({"code":"runtime_input_not_started","detail":detail,"operationOutcome":"not-started"})});}
        let (path, query) = split_path(raw_path);
        let segment_strings = path
            .trim_matches('/')
            .split('/')
            .map(knownext_core::percent_decode)
            .collect::<Vec<_>>();
        let segments = segment_strings
            .iter()
            .map(String::as_str)
            .collect::<Vec<_>>();
        let method = method.to_ascii_uppercase();

        if let Some(failure) = self.request_scope_failure(&method, raw_path) {
            return Ok(failure);
        }
        let _project_write = match self.request_project_write(&method,raw_path,&segments,&body){
            Ok(permit)=>permit,
            Err(detail)=>return Ok(LocalApiResponse{status:409,body:json!({"code":"project_write_not_started","detail":detail,"operationOutcome":"not-started","checkedAt":knownext_core::now_iso()})}),
        };
        if let Some(failure)=self.draft_write_precondition(&method,&segments,&body){return Ok(failure);}

        // Never execute AI with permissions reconstructed from unreadable state.
        if method != "GET" && method != "DELETE" && segments.last() != Some(&"cancel")
            && matches!(segments.as_slice(), ["api", "transcription"] | ["api", "documents", _, "ai", "prompt"] | ["api", "projects", _, "ai", ..]) {
            self.read_config_checked()?;
        }

        self.ai_state_preflight(&segments)?;
        if let ["api","projects",project,"ai","research",..]=segments.as_slice(){ self.research_jobs_checked(project)?; self.ai_research_policy(project)?; }
        match (method.as_str(), segments.as_slice()) {
            ("GET", ["api", "proton", "accounts", "status"]) => ok(self.proton_accounts("status", body)?),
            ("POST", ["api", "proton", "accounts", action]) if matches!(*action,"start"|"poll"|"cancel"|"disconnect") => ok(self.proton_accounts(action, body)?),
            ("GET", ["api", "projects", p, "proton-direct"]) => ok(self.proton_direct(p,"status",body)?),
            ("GET", ["api", "projects", p, "proton-direct", action]) if matches!(*action,"conflicts"|"storage") => ok(self.proton_direct(p,action,body)?),
            ("GET", ["api", "projects", p, "proton-direct", "migration"]) => ok(self.proton_direct(p,"migration-query",body)?),
            ("POST", ["api", "projects", p, "proton-direct", "retention", action]) if matches!(*action,"review"|"apply"|"cancel") => ok(self.proton_direct(p,&format!("retention-{action}"),body)?),
            ("POST", ["api", "projects", p, "proton-direct", "migration", action]) if matches!(*action,"review"|"start"|"query"|"cancel"|"ack") => ok(self.proton_direct(p,&format!("migration-{action}"),body)?),
            ("POST", ["api", "projects", p, "proton-direct", action]) if matches!(*action,"review"|"connect"|"sync"|"pause"|"disconnect") => ok(self.proton_direct(p,action,body)?),
            ("POST", ["api", "projects", p, "proton-direct", "conflicts", "review"]) => ok(self.proton_direct(p,"conflict-review",body)?),
            ("POST", ["api", "projects", p, "proton-direct", "conflicts", "resolve"]) => ok(self.proton_direct(p,"resolve",body)?),
            // Folder exchange is superseded. Keep read/recovery state and safe
            // disconnect, but never create a new binding or publish more files.
            ("POST", ["api", "projects", _, "proton-sync", action])
                if matches!(*action, "review" | "connect" | "publish") =>
                Ok(LocalApiResponse { status: 409, body: json!({"code":"proton-folder-retired","message":"El intercambio por carpeta Proton está retirado. La conexión directa está en desarrollo.","documentsPreserved":true}) }),
            ("POST", ["api", "projects", _, "proton-sync", "receive", "apply"]) =>
                Ok(LocalApiResponse { status: 409, body: json!({"code":"proton-folder-retired","message":"La recepción por carpeta está retirada. Se conservan los intentos y las copias para su recuperación.","documentsPreserved":true}) }),
            ("GET", ["api", "projects", p, "proton-sync"]) => ok(self.proton_sync_status(p)?),
            ("GET", ["api", "projects", p, "proton-sync", "inbox"]) => ok(self.proton_sync_inbox(p)?),
            ("POST", ["api", "projects", p, "proton-sync", "receive", "review"]) => ok(self.proton_sync_receive_review(p, body)?),
            ("POST", ["api", "projects", p, "proton-sync", "disconnect"]) => ok(self.proton_sync_disconnect(p, body)?),
            ("GET", ["api", "cloud-sync", "capabilities"]) => ok(cloud_providers::capabilities()),
            ("GET", ["api", "projects", p, "cloud-sync"]) => ok(self.cloud_sync_status(p)?),
            ("POST", ["api", "projects", p, "cloud-sync", "review"]) => ok(self.cloud_sync_review(p, body)?),
            ("POST", ["api", "projects", p, "cloud-sync", "apply"]) => ok(self.cloud_sync_apply(p, body)?),
            ("POST", ["api", "projects", p, "cloud-sync", "cancel"]) => ok(self.cloud_sync_cancel(p, body)?),
            ("GET",["api","projects",p,"scheduled-backups"])=>ok(self.scheduled_backups(p)?),
            ("PUT",["api","projects",p,"scheduled-backups"])=>ok(self.update_scheduled_backup_policy(p,body)?),
            ("POST",["api","projects",p,"scheduled-backups","run"])=>ok(self.run_scheduled_backup(p,body)?),
            ("GET",["api","projects",p,"scheduled-backups",generation])=>ok(self.scheduled_backup_receipt(p,generation.parse::<u64>().map_err(|_|"Generación de copia no válida")?)?),
            ("POST",["api","projects",p,"scheduled-backups",generation,"restore"])=>ok(self.restore_scheduled_backup(p,generation.parse::<u64>().map_err(|_|"Generación de copia no válida")?,body)?),
            ("POST",["api","handwritten-notes",id,"ocr"])=>ok(self.recognize_handwritten_page(id,body)?),
            ("GET",["api","handwritten-notes",id,"ocr"])=>ok(self.handwritten_note_ocr_catalog(id)?),
            ("GET",["api","handwritten-notes",id,"ocr",attempt])=>ok(self.handwritten_ocr_receipt(id,attempt)?),
            ("POST",["api","handwritten-notes",id,"ocr",attempt,"apply"])=>ok(self.apply_handwritten_ocr(id,attempt,body)?),
            ("GET",["api","projects",p,"handwritten-ocr"])=>ok(self.handwritten_ocr_catalog(p)?),
            ("GET",["api","projects",p,"research-evidence",job])=>ok(self.research_evidence_review(p,job)?),
            ("POST",["api","projects",p,"research-evidence",job,"prepare"])=>ok(self.prepare_research_evidence_review(p,job,body)?),
            ("POST",["api","projects",p,"research-evidence",job,"apply"])=>ok(self.apply_research_evidence_review(p,job,body)?),
            ("GET",["api","projects",p,"asset-catalog"])=>ok(self.project_asset_catalog(p)?),
            ("GET",["api","projects",p,"asset-catalog",id,"links"])=>ok(self.project_asset_links(p,id)?),
            ("GET",["api","projects",p,"asset-catalog",id,"text"])=>ok(self.project_asset_text(p,id)?),
            ("GET",["api","project-templates","catalogue-attempts"])=>ok(self.project_template_catalogue_attempts()?),
            ("GET",["api","project-templates","catalogue-attempts",id])=>ok(self.project_template_catalogue_receipt(id)?),
            ("GET",["api","projects",p,"meeting-minutes"])=>ok(self.meeting_minutes_catalog(p)?),
            ("POST",["api","projects",p,"meeting-minutes","review"])=>ok(self.review_meeting_minutes(p,body)?),
            ("POST",["api","projects",p,"meeting-minutes"])=>ok(self.create_meeting_minutes(p,body)?),
            ("GET",["api","projects",p,"meeting-minutes",id])=>ok(self.meeting_minutes_receipt(p,id)?),
            ("GET",["api","projects",p,"history-restores"])=>ok(self.history_restore_catalog(p)?),
            ("GET",["api","projects",p,"document-replacements"])=>ok(self.document_replace_catalog(p)?),
            ("POST",["api","projects",p,"history-restores","review"])=>ok(self.review_history_restore(p,body)?),
            ("POST",["api","projects",p,"history-restores","preview"])=>ok(self.preview_history_resource(p,body)?),
            ("POST",["api","projects",p,"history-restores"])=>ok(self.apply_history_restore(p,body)?),
            ("GET",["api","projects",p,"history-restores",id])=>ok(self.history_restore_receipt(p,id)?),
            ("POST",["api","documents",id,"ai-changes","prepare"])=>ok(self.prepare_ai_change(id,body)?),
            ("POST",["api","documents",id,"ai-changes","apply"])=>ok(self.apply_tracked_ai_change(id,body)?),
            ("GET",["api","projects",p,"ai-changes"])=>ok(self.ai_change_catalog(p)?),
            ("POST",["api","projects",p,"ai-changes",id,"page-preview"])=>ok(self.ai_change_page_preview(p,id,body)?),
            ("POST",["api","projects",p,"ai-changes",id,"review"])=>ok(self.review_ai_reversion(p,id,body)?),
            ("POST",["api","projects",p,"ai-changes",id,"revert"])=>ok(self.apply_ai_reversion(p,id,body)?),
            ("GET",["api","projects",p,"ai-changes",id])=>ok(self.ai_change_receipt(p,id)?),
            ("DELETE",["api","projects",p,"ai-changes",id])=>ok(self.retire_ai_change(p,id,body)?),
            ("POST",["api","projects",p,"document-replacements","review"])=>ok(self.review_document_replace(p,body)?),
            ("POST",["api","projects",p,"document-replacements"])=>ok(self.apply_document_replace(p,body)?),
            ("GET",["api","projects",p,"document-replacements",id])=>ok(self.document_replace_receipt(p,id)?),
            ("POST",["api","projects",p,"document-replacements",id,"undo"])=>ok(self.undo_document_replace(p,id,body)?),

            ("GET",["api","projects",p,"export-batches"])=>ok(self.export_batch_catalog(p)?),
            ("GET",["api","export-batches",id])=>ok(self.export_batch_status(id)?),
            ("DELETE",["api","export-batches",id])=>ok(self.discard_export_batch(id,body)?),
            ("GET",["api","export-profiles"])=>ok(self.export_profiles()?),
            ("POST",["api","export-profiles"])=>ok(self.change_export_profiles(body)?),
            ("POST",["api","projects",p,"portable-workspace","review"])=>ok(self.review_portable_workspace(p,body)?),
            ("POST",["api","projects",p,"portable-workspace","apply"])=>ok(self.apply_portable_workspace(p,body)?),
            ("GET",["api","projects",p,"history-points"])=>ok(self.history_points(p,query.get("offset").and_then(|s|s.parse().ok()).unwrap_or(0))?),
            ("POST",["api","projects",p,"history-points"])=>ok(self.select_history_point(p,body)?),
            ("GET",["api","security","credentials"])=>ok(self.review_credentials()?),
            ("POST",["api","security","credentials"])=>ok(self.change_credentials(body)?),
            ("GET",["api","security","controls"])=>ok(self.security_controls()),
            ("GET",["api","projects",project,"ai","privacy"])=>ok(self.review_ai_privacy_policy(project)?),
            ("PUT",["api","projects",project,"ai","privacy"])=>ok(self.change_ai_privacy_policy(project,body)?),
            ("POST",["api","projects",project,"ai","privacy","review"])=>ok(self.review_ai_privacy(project,body)?),
            ("POST",["api","projects",project,"ai","privacy","apply"])=>ok(self.apply_ai_privacy(project,body)?),
            ("GET",["api","projects",project,"ai","privacy","receipts",id])=>ok(self.ai_privacy_receipt(project,id)?),
            ("GET",["api","projects",project,"protection"])=>ok(self.project_protection_summary(project)?),
            ("GET",["api","recovery","formats"])=>ok(self.compatibility_inventory()?),
            ("GET",["api","recovery","families"])=>ok(self.recovery_family_catalog(None,0)?),
            ("GET",["api","recovery","families",family])=>ok(self.recovery_family_catalog(Some(family),query.get("offset").and_then(|s|s.parse().ok()).unwrap_or(0))?),
            ("POST",["api","recovery","families",family,key,"review"])=>ok(self.review_recovery_unit(family,key,body["archived"]==true)?),
            ("POST",["api","recovery","families",family,key,"close"])=>ok(self.close_recovery_unit(family,key,body)?),
            ("POST",["api","recovery","families",family,key,"continue"])=>ok(self.continue_recovery_unit_close(family,key,body)?),
            ("GET", ["api","documents",id,"conflict"]) => ok(self.review_document_conflict(id)?),
            ("GET", ["api","documents",id,"remote-conflict"]) => ok(self.review_remote_document(id)?),
            ("POST", ["api","documents",id,"conflict"]) => ok(self.apply_document_conflict(id,body)?),
            ("POST",["api","documents",id,"conflict-attempts",attempt,"review"])=>ok(self.review_document_conflict_attempt(id,attempt,body)?),
            ("POST",["api","handwritten-notes",id,"conflict-attempts",attempt,"review"])=>ok(self.review_handwritten_conflict_attempt(id,attempt,body)?),
            ("GET", ["api","recovery","upgrade"]) => ok(self.review_state_upgrade()?),
            ("GET", ["api","documents",id,"history","groups"]) => ok(self.history_groups(id)?),
            ("POST", ["api","documents",id,"history","groups"]) => ok(self.change_history_group(id,body)?),
            ("GET", ["api","recovery","system"]) => ok(self.system_recovery_inventory()?),
            ("GET", ["api","recovery","system",id]) => ok(self.review_system_recovery(id)?),
            ("POST", ["api","recovery","upgrade"]) => ok(self.apply_state_upgrade(body)?),
            ("GET", ["api","recovery","upgrades"]) => ok(self.list_upgrade_recoveries()?),
            ("GET", ["api","recovery","upgrades",id]) => ok(self.review_upgrade_recovery(id)?),
            ("GET", ["api","recovery","upgrades",id,"retention"]) => ok(self.review_upgrade_retention(id)?),
            ("POST", ["api","recovery","upgrades",id,"retention"]) => ok(self.change_upgrade_retention(id,body)?),
            ("POST", ["api","recovery","upgrades",id,"restore"]) => ok(self.restore_upgrade_recovery(id,body)?),
            ("POST", ["api","recovery","upgrades",id,"complete"]) => ok(self.complete_upgrade_recovery(id,body)?),
            ("GET", ["api", "ai", "data-policy"]) => ok(self.ai_data_policy()),
            ("GET", ["api", "storage", "usage"]) => ok(self.storage_usage()?),
            ("GET", ["api", "recovery", "storage"]) => ok(self.recovery_storage_inventory()?),
            ("GET", ["api", "recovery", "storage", "quotas"]) => ok(self.recovery_quota_inventory()?),
            ("PUT", ["api", "recovery", "storage", "policy"]) => ok(self.update_recovery_budget(body)?),
            ("GET", ["api", "storage", "preview-cleanup"]) => ok(self.preview_cleanup_inventory()?),
            ("POST", ["api", "storage", "preview-cleanup"]) => ok(self.cleanup_preview_receipts(body)?),
            ("GET", ["api", "ai", "results"]) => ok(self.list_ai_results()?),
            ("POST", ["api", "ai", "results"]) => ok(self.preserve_ai_result(body)?),
            ("DELETE", ["api", "ai", "results", id]) => ok(self.remove_ai_result(id)?),
            ("POST", ["api", "ai", "results", id, "copy"]) => ok(self.copy_ai_result(id,body)?),
            ("GET", ["health"]) => ok(self.health()),
            ("GET", ["api", "config"]) => ok(self.read_config_checked()?),
            ("PUT", ["api", "config"]) => ok(self.update_config(body)?),
            ("GET", ["api", "config", "ai"]) => { self.read_config_checked()?; ok(self.ai_config_status()) },
            ("PUT", ["api", "config", "ai"]) => ok(self.update_ai_config(body)?),
            ("GET", ["api", "ai", "skills"]) => ok(knownext_ai_skills::list_ai_skills_json()),
            ("POST", ["api", "ai", "skills", "selection-preview"]) => {
                ok(knownext_ai_skills::selection_preview_json(&body))
            }
            ("GET", ["api", "ai", "skills", skill_id]) => {
                if let Some(skill) = knownext_ai_skills::get_ai_skill_json(skill_id) {
                    ok(skill)
                } else {
                    bad(404, "Skill de IA no encontrada.")
                }
            }
            ("POST", ["api", "ai", "skills", skill_id, "validate"]) => {
                if let Some(validation) = knownext_ai_skills::validate_ai_skill_json(skill_id) {
                    ok(validation)
                } else {
                    bad(404, "Skill de IA no encontrada.")
                }
            }
            ("GET", ["api", "runtime", "diagnostics"]) => ok(self.safe_diagnostic_report()?),
            ("POST", ["api", "transcription"]) => ok(self.transcribe_audio(body, files)),
            ("GET", ["api", "config", "export-template"]) => ok(self.read_export_template_checked()?),
            ("GET", ["api", "recovery", "state"]) => ok(local_state::inventory(&self.app_data_dir)),
            ("POST", ["api", "recovery", "state", id, "reset"]) => ok(local_state::reset(&self.app_data_dir, id, &body)?),
            ("PUT", ["api", "config", "export-template"]) => ok(self.update_export_template(body)?),
            ("POST", ["api", "config", "export-template", "reset"]) => {
                ok(self.reset_export_template()?)
            }
            ("GET", ["api", "config", "export-template", "path"]) => {
                ok(json!({ "path": self.export_template_path().to_string_lossy() }))
            }
            ("GET", ["api", "document-templates"]) => ok(self.document_templates()),
            ("POST", ["api", "document-templates", "source", "prepare"]) => ok(self.prepare_document_template_source(body)?),
            ("POST", ["api", "document-templates", "transfer", "catalog", "export"]) => ok(self.export_document_template_catalogue(body)?),
            ("POST", ["api", "document-templates", "transfer", "catalog", "review"]) => ok(self.review_document_template_catalogue(body,false)?),
            ("POST", ["api", "document-templates", "transfer", "catalog", "import"]) => ok(self.review_document_template_catalogue(body,true)?),
            ("POST", ["api", "document-templates", "transfer", "inspect"]) => ok(self.inspect_document_template_transfer(body["content"].as_str().ok_or("Falta el archivo de plantilla")?)?),
            ("POST", ["api", "document-templates", "transfer", "import"]) => ok(self.import_document_template_transfer(body)?),
            ("POST", ["api", "document-templates", id, "transfer"]) => ok(self.export_document_template_transfer(id,body["revision"].as_str().ok_or("Falta la revisión de plantilla")?)?),
            ("POST", ["api", "document-templates"]) => ok(self.capture_document_template(body)?),
            ("GET", ["api", "document-templates", id]) => ok(self.document_template(id)?),
            ("POST", ["api", "document-templates", id, "preview"]) => ok(self.render_document_template(id,body,false)?),
            ("POST", ["api", "document-templates", id, "create"]) => ok(self.render_document_template(id,body,true)?),
            ("POST", ["api", "document-templates", id, "retire"]) => ok(self.retire_document_template(id,body)?),
            ("GET", ["api", "project-transfers"]) => ok(self.list_project_transfers()?),
            ("POST", ["api", "project-transfers"]) => ok(self.begin_project_transfer(body)?),
            ("GET", ["api", "project-templates"]) => ok(self.list_project_templates()?),
            ("POST", ["api", "project-templates", id, "retirement"]) => ok(self.set_project_template_retired(id,body)?),
            ("POST", ["api", "project-transfers", id, "cancel"]) => ok(self.cancel_project_transfer(id)?),
            ("POST", ["api", "project-transfers", id, "review"]) => ok(self.remember_project_transfer_review(id,body)?),
            ("GET", ["api", "notes"]) => ok(self.read_notes()?),
            ("PUT", ["api", "notes"]) => ok(self.write_notes(
                body.get("markdown")
                    .and_then(Value::as_str)
                    .ok_or("Las notas necesitan un contenido Markdown válido")?
                    .to_string(),
            )?),
            ("GET", ["api", "auth", "status"]) => ok(self.auth_status()),
            ("POST", ["api", "auth", "github", "device", "start"]) => {
                ok(self.start_github_device())
            }
            ("POST", ["api", "auth", "github", "device", "poll"]) => ok(self.poll_github_device(body["deviceCode"].as_str())),
            ("POST", ["api", "auth", "logout"]) => ok(self.clear_auth_status()?),
            ("GET", ["api", "github", "repositories"]) => ok(self.github_repositories()),
            ("GET", ["api", "projects"]) => { self.registry_checked()?; ok(json!(self.list_projects())) },
            ("GET", ["api", "retired-projects"]) => ok(self.retired_projects()?),
            ("POST", ["api", "retired-projects", id, "restore"]) => ok(self.restore_retired_project(id,body)?),
            ("POST", ["api", "projects", id, "retire"]) => ok(json!(self.retire_project(id)?)),
            ("POST", ["api", "projects"]) => ok(self.create_project(body)?),
            ("GET", ["api", "projects", id, "portable-history"]) => ok(self.portable_history_catalog(id)?),
            ("POST", ["api", "projects", id, "portable-history", key, "review"]) => ok(self.review_portable_history(id,key,body)?),
            ("POST", ["api", "projects", id, "portable-history", key, "adopt"]) => ok(self.adopt_portable_history(id,key,body)?),
            ("GET", ["api", "projects", id, "portable-recordings"]) => ok(self.portable_recording_catalog(id)?),
            ("POST", ["api", "projects", id, "portable-recordings", key, "review"]) => ok(self.review_portable_recording(id,key,body)?),
            ("GET", ["api", "projects", id, "portable-drafts"]) => ok(self.portable_draft_catalog(id)?),
            ("POST", ["api", "projects", id, "portable-drafts", key, "review"]) => ok(self.review_portable_draft(id,key,body)?),
            ("POST", ["api", "projects", id, "portable-drafts", key]) => ok(self.adopt_portable_draft(id,key,body)?),
            ("GET", ["api", "projects", id, "portable-preferences"]) => ok(self.review_portable_preferences(id)?),
            ("POST", ["api", "projects", id, "portable-preferences"]) => ok(self.apply_portable_preferences(id,body)?),
            ("GET", ["api", "projects", "active"]) => self.active_project(),
            ("GET", ["api", "projects", "capabilities"]) => ok(self.project_capabilities()),
            ("GET", ["api", "projects", project_id, "favorites"]) => self.project_favorites(project_id),
            ("POST", ["api", "projects", project_id, "favorites"]) => self.change_favorite(project_id,None,body),
            ("DELETE", ["api", "projects", project_id, "favorites", id]) => self.change_favorite(project_id,Some(id),body),
            ("GET", ["api", "projects", project_id, "tree"]) => {
                ok(json!(self.project_tree(project_id)?))
            }
            ("GET", ["api", "projects", project_id, "versioning", "status"]) => {
                ok(self.versioning_status(project_id))
            }
            ("GET", ["api", "projects", project_id, "file-sync-overview"]) => {
                ok(self.file_sync_overview(project_id)?)
            }
            ("GET", ["api", "projects", project_id, "activity"]) => {
                ok(self.project_activity(project_id)?)
            }
            ("POST", ["api", "projects", project_id, "activity"]) => {
                ok(self.record_activity(project_id, body)?)
            }
            ("PUT", ["api", "projects", project_id, "active"]) => {
                ok(self.set_active_project(project_id)?)
            }
            ("PUT", ["api", "projects", project_id]) => ok(self.update_project(project_id, body)?),
            ("POST", ["api", "projects", project_id, "location", "review"]) => ok(self.review_project_location(project_id, body)?),
            ("DELETE", ["api", "projects", project_id]) => {
                ok(json!(self.delete_project(project_id)?))
            }
            ("POST", ["api", "projects", project_id, "folders"]) => {
                ok(self.create_folder(project_id, body)?)
            }
            ("POST", ["api", "projects", project_id, "documents"]) => {
                ok(self.create_document(project_id, body)?)
            }
            ("POST", ["api", "projects", project_id, "handwritten-notes"]) => {
                ok(self.create_handwritten_note(project_id, body)?)
            }
            ("POST", ["api", "projects", project_id, "attachments"]) => {
                self.import_file(project_id, &query, files, false)
            }
            ("POST", ["api", "projects", project_id, "assets", "images"]) => {
                self.import_file(project_id, &query, files, true)
            }
            ("GET", ["api", "projects", project_id, "assets", asset_id]) => {
                ok(self.asset_metadata(project_id, asset_id)?)
            }
            ("GET", ["api", "projects", project_id, "assets", asset_id, "usage"]) => {
                ok(self.asset_usage(project_id, asset_id)?)
            }
            ("POST", ["api", "projects", project_id, "assets", "reindex-images"]) => {
                ok(self.reindex_project_images(project_id)?)
            }
            (
                "POST",
                ["api", "projects", project_id, "documents", document_id, "image-reference"],
            ) => ok(self.image_reference(project_id, document_id, body)?),
            ("GET", ["api", "projects", project_id, "documents", document_id, "move-impact"]) => {
                ok(self.document_move_impact(project_id, document_id)?)
            }
            ("PATCH", ["api", "projects", project_id, "nodes", node_id, "rename"]) => {
                ok(self.rename_node(project_id, node_id, body)?)
            }
            ("PATCH", ["api", "projects", project_id, "nodes", node_id, "move"]) => {
                ok(self.move_node(project_id, node_id, body)?)
            }
            ("POST", ["api", "projects", project_id, "nodes", "batch", "plan"]) => ok(self.prepare_batch(project_id, body)?),
            ("POST", ["api", "projects", project_id, "search", "content"]) => ok(local_search::search(project_id,&self.project_root(project_id)?,body["query"].as_str().unwrap_or(""))?),
            ("GET", ["api", "projects", project_id, "nodes", "batch", batch_id]) => ok(self.batch_status(project_id, batch_id)?),
            ("POST", ["api", "projects", project_id, "nodes", "batch", batch_id, "execute"]) => ok(self.execute_batch(project_id, batch_id)?),
            ("POST", ["api", "projects", project_id, "nodes", "batch", batch_id, "cancel"]) => ok(self.cancel_batch(project_id, batch_id)?),
            ("GET", ["api", "projects", project_id, "trash"]) => {
                let mut snapshot = trash::list(&self.project_root(project_id)?, project_id)?;
                let (batches, warnings) = self.batch_recovery(project_id);
                snapshot.warnings.extend(warnings);
                let mut snapshot = serde_json::to_value(snapshot).map_err(|e| e.to_string())?;
                snapshot["batches"] = json!(batches);
                ok(snapshot)
            }
            ("GET", ["api", "projects", project_id, "trash", entry_id, "review"]) => {
                ok(serde_json::to_value(trash::review(&self.project_root(project_id)?,project_id,entry_id)?).map_err(|e|e.to_string())?)
            }
            ("GET", ["api", "projects", project_id, "trash", entry_id, "restores",attempt_id]) => {
                let mut proof=trash::verify_attempt(&self.project_root(project_id)?,project_id,entry_id,attempt_id)?;
                if proof["status"]=="confirmed"{
                    let path=proof["originalPath"].as_str().map(str::to_string);
                    proof["result"]=self.file_result(project_id,path,vec![]).unwrap_or_else(|_|json!({"tree":[],"treeAvailable":false,"affectedDocuments":[],"warnings":["Restauración comprobada; actualiza el proyecto para revisar su contenido."]}));
                }
                ok(proof)
            }
            ("POST", ["api", "projects", project_id, "trash", entry_id, "restore"]) => {
                let restored = trash::restore_reviewed(&self.project_root(project_id)?, project_id, entry_id,body)?;
                let mut result=self.file_result(project_id, Some(restored.entry.original_path), vec![])?;
                result["restoreAttemptId"]=json!(restored.attempt_id);result["restoredRevision"]=json!(restored.reviewed_revision);
                ok(result)
            }
            ("DELETE", ["api", "projects", project_id, "nodes", node_id]) => {
                ok(self.delete_node(project_id, node_id)?)
            }
            ("POST", ["api", "projects", project_id, "documents", document_id, "duplicate"]) => {
                ok(self.duplicate_document(project_id, document_id)?)
            }
            ("GET", ["api", "documents", document_id, "links"]) => ok(self.document_references(document_id)?),
            ("GET", ["api", "documents", document_id]) => ok(self.get_document(document_id)?),
            ("PUT", ["api", "documents", document_id]) => {
                if self.save_base_changed(document_id, &body)? {
                    bad(409, "Existe un conflicto o no se puede verificar la base del borrador. Conserva tus cambios y revisa las versiones antes de reemplazar el archivo.")
                } else { ok(self.save_document(document_id, body)?) }
            }
            ("GET", ["api", "handwritten-notes", note_id]) => {
                ok(self.get_handwritten_note(note_id)?)
            }
            ("GET",["api","handwritten-notes",id,"conflict"])=>ok(self.review_handwritten_conflict(id)?),
            ("POST",["api","handwritten-notes",id,"conflict"])=>ok(self.apply_handwritten_conflict(id,body)?),
            ("PUT", ["api", "handwritten-notes", note_id]) => {
                if self.save_base_changed(note_id, &body)? {
                    bad(409, "Existe un conflicto o no se puede verificar la base de la nota. Conserva los trazos antes de revisar las versiones.")
                } else { ok(self.save_handwritten_note(note_id, body)?) }
            }
            ("PUT", ["api", "handwritten-notes", note_id, "draft"]) => {
                ok(self.save_handwritten_note_draft(note_id, body)?)
            }
            ("DELETE", ["api", "handwritten-notes", note_id, "draft"]) => {
                self.delete_draft(note_id)?;
                no_content()
            }
            ("POST", ["api", "handwritten-notes", note_id, "draft", "discard-and-read"]) => {
                ok(self.discard_draft_and_read_disk(note_id, true)?)
            }
            ("POST", ["api", "handwritten-notes", note_id, "export"]) => {
                ok(self.export_handwritten_note(note_id, body)?)
            }
            ("GET", ["api", "handwritten-notes", note_id, "pages", page_id, "render"]) => {
                ok(self.render_handwritten_note_page(note_id, page_id, &query)?)
            }
            (
                "POST",
                ["api", "handwritten-notes", note_id, "pages", page_id, "insert-markdown"],
            ) => ok(self.insert_handwritten_page_markdown(note_id, page_id, body)?),
            ("PUT", ["api", "documents", document_id, "draft"]) => {
                ok(self.save_draft(document_id, body)?)
            }
            ("DELETE", ["api", "documents", document_id, "draft"]) => {
                self.delete_draft(document_id)?;
                no_content()
            }
            ("POST", ["api", "documents", document_id, "draft", "discard-and-read"]) => {
                ok(self.discard_draft_and_read_disk(document_id, false)?)
            }
            ("POST", ["api", "documents", document_id, "export"]) => {
                ok(self.export_document(document_id, body)?)
            }
            ("POST", ["api", "documents", "sync-status"]) => ok(self.documents_sync_status(body)?),
            ("GET",["api","documents",id,"versions",version,"restore-draft"])=>ok(self.review_version_draft(id,version)?),
            ("GET", ["api", "drafts", "orphans"]) => ok(self.orphan_drafts()),
            ("GET", ["api", "recovery", "drafts"]) => ok(self.recovery_drafts()?),
            ("GET", ["api", "recovery", "orphans"]) => ok(self.orphan_draft_inventory()?),
            ("GET", ["api", "recovery", "conflict-attempts"]) => ok(self.list_conflict_attempt_recovery(false)?),
            ("GET", ["api", "recovery", "conflict-attempt-archives"]) => ok(self.list_conflict_attempt_recovery(true)?),
            ("GET", ["api", "recovery", "conflict-attempts",id]) => ok(self.review_conflict_attempt_recovery(id)?),
            ("GET", ["api", "recovery", "conflict-attempts",id,"package-review"]) => ok(self.review_conflict_package(id)?),
            ("GET", ["api", "recovery", "conflict-attempts",id,"retention"]) => ok(self.review_conflict_retention(id)?),
            ("GET", ["api", "recovery", "conflict-attempts",id,"payloads"]) => ok(self.review_conflict_payloads(id)?),
            ("POST", ["api", "recovery", "conflict-attempts",id,"retention"]) => ok(self.change_conflict_retention(id,body)?),
            ("POST", ["api", "recovery", "conflict-attempts",id,"archive-state"]) => ok(self.change_conflict_attempt_archive(id,body)?),
            ("POST", ["api", "recovery", "local-edits", key]) => ok(self.preserve_local_edit(key,body,false)?),
            ("POST", ["api", "recovery", "local-edits", key,"review"]) => ok(self.preserve_local_edit(key,body,true)?),
            ("GET", ["api","recovery","archives",key,"content-review"]) => ok(self.review_incomplete_recovery(key)?),
            ("GET", ["api", "recovery", "archives"]) => ok(self.archived_drafts()?),
            ("POST", ["api", "recovery", "drafts", key, "preview"]) => ok(self.preview_reviewed_draft(key, body)?),
            ("POST", ["api", "recovery", "drafts", key, "copy"]) => ok(self.copy_reviewed_draft(key, body)?),
            ("POST", ["api", "recovery", "drafts", key, "archive"]) => ok(self.archive_reviewed_draft(key, body)?),
            ("POST", ["api", "drafts", draft_key, "restore"]) => {
                ok(self.restore_reviewed_orphan(draft_key,body)?)
            }
            ("DELETE", ["api", "drafts", draft_key]) => {
                self.discard_reviewed_orphan(draft_key,body)?;
                no_content()
            }
            ("GET", ["api", "documents", document_id, "versions"]) => {
                ok(json!(self.list_versions(document_id)?))
            }
            ("GET", ["api", "documents", document_id, "history"]) => ok(self.document_history_snapshot(document_id)?),
            ("PUT", ["api", "documents", document_id, "versions", version_id, "milestone"]) => self.set_history_milestone(document_id,version_id,body,false),
            ("DELETE", ["api", "documents", document_id, "versions", version_id, "milestone"]) => self.set_history_milestone(document_id,version_id,body,true),
            ("POST", ["api", "projects", project_id, "versions"]) => {
                ok(self.create_version(project_id, body)?)
            }
            ("GET", ["api", "documents", document_id, "versions", version_id, "content"]) => {
                ok(self.version_content(document_id, version_id)?)
            }
            ("POST", ["api", "documents", document_id, "versions", version_id, "restore"]) => {
                let path = self.resolve_markdown_path(document_id)?;
                if body["baseFingerprint"].is_null() {
                    bad(400, "Vuelve a abrir el documento antes de restaurar una versión; falta su base guardada.")
                } else if self.fingerprint(&path) != body["baseFingerprint"] {
                    bad(409, "El archivo cambió después de abrirlo. Revisa su contenido antes de restaurar la versión.")
                } else { ok(self.restore_version(document_id, version_id, body)?) }
            }
            ("GET", ["api", "projects", project_id, "sync", "status"]) => {
                ok(self.sync_status(project_id))
            }
            ("GET",["api","projects",project_id,"sync","remote-review"])=>ok(self.review_remote_project(project_id)?),
            ("GET",["api","projects",project,"sync","mixed-selections"])=>{
                let mut catalog=self.list_mixed_selections(project)?;
                catalog["schemaVersion"]=json!(1);catalog["projectId"]=json!(project);catalog["checkedAt"]=json!(knownext_core::now_iso());ok(catalog)
            },
            ("POST",["api","projects",project,"sync","mixed-selections","review"])=>ok(self.mixed_selection_candidates(project,body)?),
            ("POST",["api","projects",project,"sync","mixed-selections"])=>ok(self.create_mixed_selection(project,body)?),
            ("GET",["api","projects",project,"sync","mixed-selections",id])=>ok(self.review_mixed_selection(project,id)?),
            ("GET",["api","projects",project,"sync","mixed-selections",id,"application"])=>ok(self.review_mixed_application(project,id)?),
            ("POST",["api","projects",project,"sync","mixed-selections",id,"application","review"])=>ok(self.preview_mixed_application(project,id)?),
            ("POST",["api","projects",project,"sync","mixed-selections",id,"application"])=>ok(self.start_mixed_application(project,id,body)?),
            ("POST",["api","projects",project,"sync","mixed-selections",id,"application","continue"])=>ok(self.continue_mixed_application(project,id,body)?),
            ("POST",["api","projects",project,"sync","mixed-selections",id,"application","copy"])=>ok(self.copy_mixed_application_payload(project,id,body)?),
            ("POST",["api","projects",project,"sync","mixed-selections",id,"application","close"])=>ok(self.close_mixed_application(project,id,body)?),
            ("GET",["api","projects",project,"sync","mixed-selections",id,"application","retention"])=>ok(self.review_mixed_payload_retention(project,id)?),
            ("GET",["api","projects",project,"sync","mixed-selections",id,"application","backup"])=>ok(self.review_mixed_backup(project,id)?),
            ("GET",["api","projects",project,"sync","mixed-selections",id,"application","retirement"])=>ok(self.review_mixed_retirement(project,id)?),
            ("POST",["api","projects",project,"sync","mixed-selections",id,"application","abandon-incomplete"])=>ok(self.abandon_incomplete_mixed(project,id,body)?),
            ("POST",["api","projects",project,"sync","mixed-selections",id,"application","reprepare"])=>ok(self.reprepare_incomplete_mixed(project,id,body)?),
            ("GET",["api","projects",project,"sync","mixed-selections",id,"application","copies"])=>ok(self.review_incomplete_mixed(project,id)?),
            ("POST",["api","projects",project,"sync","mixed-selections",id,"application","retention"])=>ok(self.change_mixed_payload_retention(project,id,body)?),
            ("POST",["api","projects",project_id,"sync","graph-joins"])=>ok(self.join_reviewed_histories(project_id,body)?),
            ("GET",["api","projects",project_id,"sync","graph-joins",attempt])=>ok(self.review_graph_join(project_id,attempt)?),
            ("POST",["api","projects",project,"sync","history-copies","review"])=>ok(self.review_historical_copy_source(project,body)?),
            ("POST",["api","projects",project,"sync","history-copies"])=>ok(self.copy_historical_resource(project,body)?),
            ("GET",["api","projects",project,"sync","history-copies",attempt])=>ok(self.review_historical_copy(project,attempt)?),
            ("POST", ["api", "projects", project_id, "sync", "pull"]) => {
                ok(self.sync_operation(project_id, "pull"))
            }
            ("POST", ["api", "projects", project_id, "sync", "push"]) => {
                ok(self.sync_operation(project_id, "push"))
            }
            ("POST", ["api", "projects", project_id, "sync", "scan"]) => {
                ok(self.sync_status(project_id))
            }
            ("POST", ["api", "projects", project_id, "sync", "auto-run"]) => {
                ok(self.sync_auto_run(project_id))
            }
            ("POST", ["api", "projects", project_id, "history", "enable"]) => {
                ok(self.enable_project_history(project_id)?)
            }
            ("PUT", ["api", "projects", project_id, "sync-mode"]) => {
                ok(self.change_project_sync_mode(project_id, body)?)
            }
            ("POST", ["api", "projects", project_id, "github", "connect"]) => {
                ok(self.connect_project_github(project_id, body, false)?)
            }
            ("POST", ["api", "projects", project_id, "github", "verify-connection"]) => {
                ok(self.sync_status(project_id))
            }
            ("POST", ["api", "projects", project_id, "github", "publish"]) => {
                ok(self.connect_project_github(project_id, body, true)?)
            }
            (
                "POST",
                ["api", "projects", _project_id, "sync", "conflicts", _conflict_id, "resolve"],
            ) => bad(409,"La resolución global del historial requiere una revisión y todavía no está disponible. No se ha fusionado ni sincronizado el proyecto."),
            ("GET", ["api", "projects", project_id, "external-changes"]) => {
                ok(self.external_changes(project_id))
            }
            ("POST", ["api", "projects", project_id, "external-changes", "scan"]) => {
                ok(self.external_changes(project_id))
            }
            ("POST", ["api", "projects", project_id, "external-changes", "import"]) => {
                ok(self.import_external_changes(project_id, body)?)
            }
            ("POST", ["api", "projects", project_id, "previews"]) => {
                ok(self.create_preview(project_id, body)?)
            }
            ("GET", ["api", "projects", project_id, "previews", preview_id]) => {
                ok(self.get_preview(project_id, preview_id)?)
            }
            ("POST", ["api", "projects", project_id, "previews", preview_id, "refresh"]) => {
                ok(self.get_preview(project_id, preview_id)?)
            }
            ("GET", ["api", "projects", project_id, "previews", preview_id, "text"]) => {
                ok(self.preview_text(project_id, preview_id)?)
            }
            ("GET", ["api", "projects", project_id, "previews", preview_id, "sheets"]) => {
                ok(self.preview_sheets(project_id, preview_id)?)
            }
            (
                "GET",
                ["api", "projects", project_id, "previews", preview_id, "sheets", sheet_id],
            ) => ok(self.preview_sheet(project_id, preview_id, sheet_id)?),
            ("POST", ["api", "projects", project_id, "previews", preview_id, "open-external"]) => {
                ok(self.open_preview_external(project_id, preview_id)?)
            }
            ("GET", ["api", "projects", project_id, "ai", "context", "search"]) => {
                ok(self.ai_context_search(project_id, &query))
            }
            ("GET", ["api", "projects", project_id, "ai", "context", "sources"]) => {
                ok(self.ai_sources(project_id)?)
            }
            ("POST", ["api", "projects", project_id, "ai", "context", "project-documents"]) => {
                ok(self.ai_source(
                    project_id,
                    body_id(&body, &["documentId"]).unwrap_or("document"),
                    "project_document",
                )?)
            }
            ("POST", ["api", "projects", project_id, "ai", "context", "project-images"]) => {
                ok(self.ai_source(
                    project_id,
                    body_id(&body, &["assetId", "documentId"]).unwrap_or("image"),
                    "image",
                )?)
            }
            ("POST", ["api", "projects", project_id, "ai", "context", "project-attachments"]) => {
                ok(self.ai_source(
                    project_id,
                    body_id(&body, &["attachmentId", "documentId"]).unwrap_or("attachment"),
                    "external_file",
                )?)
            }
            ("POST", ["api", "projects", project_id, "ai", "context", "handwritten-notes"]) => {
                ok(self.ai_source(
                    project_id,
                    body_id(&body, &["noteId", "documentId"]).unwrap_or("handwritten-note"),
                    "handwritten_note",
                )?)
            }
            ("POST", ["api", "projects", project_id, "ai", "context", "files"]) => {
                ok(self.ai_upload_sources(project_id, files)?)
            }
            ("POST", ["api", "projects", project_id, "ai", "context", "local-files"]) => {
                self.ai_upload_local_sources(project_id, body)
            }
            ("DELETE", ["api", "projects", project_id, "ai", "context", "sources", source_id]) => {
                ok(self.remove_ai_source(project_id, source_id)?)
            }
            (
                "POST",
                ["api", "projects", project_id, "ai", "context", "sources", source_id, "extend"],
            ) => ok(self.ai_source(project_id, source_id, "external_file")?),
            (
                "GET",
                ["api", "projects", project_id, "ai", "context", "sources", source_id, "preview"],
            ) => ok(self.preview_context_source_checked(project_id, source_id)?),
            ("GET",["api","projects",project_id,"ai","context","sources",source_id,"review"])=>ok(self.review_context_source(project_id,source_id)?),
            ("POST",["api","projects",project_id,"ai","context","sources",source_id,"refresh"])=>{
                let review=self.refresh_context_source(project_id,source_id,body)?;
                ok(self.preview_context_source_from_review(project_id,source_id,review)?)
            },
            (
                "POST",
                ["api", "projects", project_id, "ai", "context", "sources", source_id, "add-to-project"],
            ) => ok(self.add_ai_source_to_project(project_id, source_id, body)?),
            ("POST", ["api", "documents", document_id, "ai", "prompt"]) => {
                self.resolve_ai_context_sources(document_id.split("::").next().unwrap_or("prompt"),&body)?;
                self.spend_preflight(Some(document_id.split("::").next().unwrap_or("prompt")))?;
                let mut response = knownext_ai::prompt_response(
                    body.get("prompt").and_then(Value::as_str).unwrap_or(""),
                    body.get("markdown").and_then(Value::as_str).unwrap_or(""),
                    Some(document_id),
                    self.openai_key().as_deref(),
                    self.ai_model().as_str(),
                );
                let project_id = document_id.split("::").next().unwrap_or("prompt");
                if let Err(error)=self.record_ai_usage_records(project_id,"prompt",&response){response["usageWarning"]=json!(error);}
                ok(response)
            }
            ("POST", ["api", "projects", _project_id, "ai", "prompt"]) => {
                self.resolve_ai_context_sources(_project_id,&body)?;
                self.spend_preflight(Some(_project_id))?;
                let mut response = knownext_ai::prompt_response(
                    body.get("prompt").and_then(Value::as_str).unwrap_or(""),
                    "",
                    None,
                    self.openai_key().as_deref(),
                    self.ai_model().as_str(),
                );
                if let Err(error)=self.record_ai_usage_records(_project_id,"prompt",&response){response["usageWarning"]=json!(error);}
                ok(response)
            }
            ("POST", ["api", "projects", project_id, "ai", "interactions"]) => {
                ok(self.ai_interaction(project_id, body))
            }
            ("POST", ["api", "projects", project_id, "ai", "research", "brief"]) => {
                ok(self.ai_research_brief(project_id, body)?)
            }
            ("GET", ["api", "projects", project_id, "ai", "research", "policy"]) => {
                ok(self.ai_research_policy(project_id)?)
            }
            ("PUT", ["api", "projects", project_id, "ai", "research", "policy"]) => {
                ok(self.save_ai_research_policy(project_id, body)?)
            }
            ("GET", ["api", "projects", project_id, "ai", "research", "jobs"]) => {
                ok(self.ai_research_jobs_response(project_id)?)
            }
            ("POST", ["api", "projects", project_id, "ai", "research", "jobs"]) => {
                ok(self.ai_research_start(project_id, body)?)
            }
            ("GET", ["api", "projects", project_id, "ai", "research", "jobs", job_id]) => {
                ok(self.ai_research_job(project_id, job_id)?)
            }
            (
                "GET",
                ["api", "projects", project_id, "ai", "research", "jobs", job_id, "sources"],
            ) => ok(self.ai_research_sources(project_id, job_id)?),
            (
                "GET",
                ["api", "projects", project_id, "ai", "research", "jobs", job_id, "quality"],
            ) => ok(self.ai_research_quality(project_id, job_id)?),
            (
                "GET",
                ["api", "projects", project_id, "ai", "research", "jobs", job_id, "activity"],
            ) => ok(self.ai_research_activity(project_id, job_id)?),
            (
                "GET",
                ["api", "projects", project_id, "ai", "research", "jobs", job_id, "coverage"],
            ) => ok(self.ai_research_coverage(project_id, job_id)?),
            (
                "POST",
                ["api", "projects", project_id, "ai", "research", "jobs", job_id, "cancel"],
            ) => ok(self.ai_research_cancel(project_id, job_id)?),
            (
                "POST",
                ["api", "projects", project_id, "ai", "research", "jobs", job_id, "retry"],
            ) => ok(self.ai_research_retry(project_id, job_id)?),
            (
                "POST",
                ["api", "projects", project_id, "ai", "research", "jobs", job_id, "refine"],
            ) => ok(self.ai_research_refine(project_id, job_id, body)?),
            (
                "POST",
                ["api", "projects", project_id, "ai", "research", "jobs", job_id, "update-sources"],
            ) => ok(self.ai_research_update_sources(project_id, job_id)?),
            (
                "POST",
                ["api", "projects", project_id, "ai", "research", "jobs", job_id, "accept"],
            ) => ok(self.ai_research_accept(project_id, job_id)?),
            (
                "POST",
                ["api", "projects", project_id, "ai", "research", "jobs", job_id, "review"],
            ) => ok(self.ai_research_review(project_id, job_id, body)?),
            (
                "POST",
                ["api", "projects", project_id, "ai", "research", "jobs", job_id, "export"],
            ) => ok(self.ai_research_export(project_id, job_id, body)?),
            ("GET", ["api", "projects", project_id, "ai", "conversation"]) => {
                ok(self.conversation_checked(project_id)?)
            }
            ("DELETE", ["api", "projects", project_id, "ai", "conversation"]) => {
                self.write_json(
                    &self.conversation_path(project_id),
                    &json!({ "events": [] }),
                )?;
                ok(json!({ "events": [] }))
            }
            ("GET", ["api", "projects", _project_id, "ai", "pending-intent"]) => ok(Value::Null),
            ("POST", ["api", "projects", project_id, "ai", "confirm-delete"]) => {
                ok(self.ai_interaction(project_id, body))
            }
            ("GET", ["api", "ai", "usage", "summary"]) => ok(self.ai_usage_summary(&query)?),
            ("GET", ["api", "ai", "usage", "budget"]) => ok(self.ai_budget_status(&query)?),
            ("POST", ["api", "ai", "usage", "budget"]) => ok(self.change_ai_budget(body)?),
            ("GET", ["api", "ai", "usage", "ledger"]) => ok(self.usage_ledger_info()?),
            ("POST", ["api", "ai", "usage", "ledger", "upgrade"]) => ok(self.upgrade_usage_ledger(body)?),
            ("GET", ["api", "credentials", "openai-key"]) => ok(self.openai_key_status()),
            ("PUT", ["api", "credentials", "openai-key"]) => ok(self.save_openai_key(body)?),
            ("DELETE", ["api", "credentials", "openai-key"]) => {
                self.delete_openai_key()?;
                no_content()
            }
            ("GET", ["api", "projects", project_id, "ai", "index", "status"]) => {
                ok(self.ai_index_status(project_id)?)
            }
            ("POST", ["api", "projects", project_id, "ai", "index", "rebuild"]) => {
                ok(self.rebuild_ai_index(project_id)?)
            }
            ("DELETE", ["api", "projects", project_id, "ai", "index"]) => {
                ok(self.delete_ai_index(project_id, body)?)
            }
            ("POST", ["api", "runtime", "select-folder"]) => {
                ok(json!({ "folderPath": body.get("currentPath").and_then(Value::as_str) }))
            }
            ("GET", ["api", "runtime", "logging"]) => ok(self.runtime_logging_status()?),
            ("GET", ["api", "runtime", "git"]) => ok(self.git_diagnostics()),
            ("POST", ["api", "runtime", "logging"]) => ok(self.record_runtime_log(body)?),
            ("POST", ["api", "runtime", "open-folder"]) => ok(self.open_runtime_folder(body)?),
            _ => bad(
                404,
                &format!("Contrato local no implementado: {method} {path}"),
            ),
        }
    }

    pub fn content(&self, raw_path: &str, body: Value) -> Result<LocalApiContentResponse, String> {
        if let Some(failure) = self.request_scope_failure("GET", raw_path) {
            return Err(failure.body["detail"].as_str().unwrap_or("Proyecto no disponible").into());
        }
        let (path, _query) = split_path(raw_path);
        let segment_strings = path
            .trim_matches('/')
            .split('/')
            .map(knownext_core::percent_decode)
            .collect::<Vec<_>>();
        let segments = segment_strings
            .iter()
            .map(String::as_str)
            .collect::<Vec<_>>();
        match segments.as_slice() {
            ["api", "documents", id, "export", "content"] => Ok(self.prepare_export(export_execution::Kind::Markdown,id,body,false)?.render()?.content()),
            ["api", "handwritten-notes", id, "export", "content"] => Ok(self.prepare_export(export_execution::Kind::Handwritten,id,body,false)?.render()?.content()),
            ["api", "projects", project_id, "assets", asset_id, "content"] => {
                let path = self.resolve_project_asset(project_id, asset_id)?;
                let bytes = std::fs::read(&path).map_err(|error| error.to_string())?;
                Ok(binary(
                    200,
                    mime_for_path(&path),
                    path.file_name()
                        .map(|value| value.to_string_lossy().to_string()),
                    bytes,
                ))
            }
            ["api", "projects", project_id, "previews", preview_id, "pdf"] => {
                let preview = self.get_preview(project_id, preview_id)?;
                let source_path = self
                    .resolve_project_relative(project_id, preview["path"].as_str().unwrap_or(""))?;
                let markdown = knownext_docs::extract_plain_text(&source_path);
                let bytes = if source_path
                    .extension()
                    .and_then(|value| value.to_str())
                    .unwrap_or("")
                    .eq_ignore_ascii_case("pdf")
                {
                    std::fs::read(&source_path)
                        .map_err(|_| "No se pudo leer el PDF original; se conserva".to_string())?
                } else {
                    knownext_docs::minimal_pdf(
                        preview["name"].as_str().unwrap_or(preview_id),
                        &markdown,
                    )
                };
                Ok(binary(
                    200,
                    "application/pdf".to_string(),
                    Some(format!("{preview_id}.pdf")),
                    bytes,
                ))
            }
            _ => Ok(binary(
                404,
                "application/json".to_string(),
                None,
                br#"{"detail":"Contenido local no implementado"}"#.to_vec(),
            )),
        }
    }

}
