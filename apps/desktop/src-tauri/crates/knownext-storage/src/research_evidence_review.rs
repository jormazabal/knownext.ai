//! Human evidence review is a local overlay. Never sends, rewrites prose or edits source artefacts.
use super::*;
use std::{fs, path::Component};
const MAX_SOURCES: usize = 128;
const MAX_CLAIMS: usize = 500;
const MAX_EVIDENCE: usize = 1000;
const MAX_TEXT: usize = 2 * 1024 * 1024;
const MAX_REVIEWS: usize = 16;
#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Selection {
    selected_claim_ids: Vec<String>,
    excluded_source_ids: Vec<String>,
    comment: String,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Review {
    attempt_id: String,
    created_at: String,
    source_revision: String,
    selection_revision: String,
    selection: Selection,
}
#[derive(Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Overlay {
    schema_version: u8,
    reviews: Vec<Review>,
}
fn sha_value(v: &Value) -> Result<String, String> {
    Ok(sha256_hex(
        &serde_json::to_vec(v).map_err(|_| "La revisión no se puede representar")?,
    ))
}
fn sha(s: &str) -> bool {
    s.len() == 64 && s.bytes().all(|b| b.is_ascii_hexdigit())
}
fn provider_id(v: &Value) -> Option<String> {
    v.as_str()
        .filter(|s| request_scope::portable_id(s))
        .map(str::to_owned)
}
fn original_id(v: &Value) -> Option<String> {
    v.as_str().map(str::to_owned)
}
fn text(v: &Value) -> String {
    v.as_str().map(str::to_owned).unwrap_or_default()
}
fn field(v: &Value, keys: &[&str]) -> String {
    keys.iter()
        .find_map(|k| v[*k].as_str())
        .unwrap_or("")
        .to_owned()
}
fn optional(v: &Value) -> Value {
    v.as_str()
        .filter(|s| !s.is_empty())
        .map(|s| json!(s))
        .unwrap_or(Value::Null)
}
fn http_url(v: &Value) -> Option<String> {
    let url = reqwest::Url::parse(v.as_str()?).ok()?;
    if !matches!(url.scheme(), "http" | "https")
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return None;
    }
    Some(url.to_string())
}
fn root_hash(api: &LocalApi, p: &str) -> Result<String, String> {
    let root = api
        .project_root(p)?
        .canonicalize()
        .map_err(|_| "El proyecto no está disponible")?;
    Ok(sha256_hex(root.to_string_lossy().as_bytes()))
}
fn list(job: &Value, name: &str, limit: usize) -> Result<Vec<Value>, String> {
    match job.get(name){None|Some(Value::Null)=>Ok(vec![]),Some(v)=>v.as_array().filter(|a|a.len()<=limit).cloned().ok_or_else(||format!("{name}: formato no compatible o supera el límite de{limit}; los originales permanecen"))}
}
fn source_revision(api: &LocalApi, p: &str, job: &Value) -> Result<String, String> {
    let mut projection = serde_json::Map::new();
    projection.insert("root".into(), json!(root_hash(api, p)?));
    for key in [
        "id",
        "projectId",
        "sources",
        "evidence",
        "findings",
        "sourceReads",
        "researchFindings",
        "markdown",
        "draftMarkdown",
        "qualityReport",
        "createdAt",
        "startedAt",
        "finishedAt",
        "status",
        "documentId",
        "createdDocumentId",
        "retryOfJobId",
        "sourceHistory",
        "history",
    ] {
        projection.insert(key.into(), job[key].clone());
    }
    sha_value(&Value::Object(projection))
}
fn overlay(job: &Value) -> Result<Overlay, String> {
    let Some(value) = job.get("evidenceReview") else {
        return Ok(Overlay {
            schema_version: 1,
            reviews: vec![],
        });
    };
    let o: Overlay = serde_json::from_value(value.clone())
        .map_err(|_| "Extensión de revisión desconocida; se conserva sin aplicar")?;
    if o.schema_version != 1 || o.reviews.len() > MAX_REVIEWS {
        return Err("Versión de revisión desconocida o más de16intentos; se conserva".into());
    }
    let mut ids = BTreeSet::new();
    for r in &o.reviews {
        if !r.attempt_id.starts_with("research-review-")
            || !request_scope::portable_id(&r.attempt_id)
            || !ids.insert(&r.attempt_id)
            || !sha(&r.source_revision)
            || !sha(&r.selection_revision)
            || time::OffsetDateTime::parse(
                &r.created_at,
                &time::format_description::well_known::Rfc3339,
            )
            .is_err()
        {
            return Err("Historial de revisión incoherente; no concede autoridad".into());
        }
        selection_shape(&r.selection)?;
    }
    Ok(o)
}
fn selection_shape(q: &Selection) -> Result<(), String> {
    if q.selected_claim_ids.len() > MAX_CLAIMS
        || q.excluded_source_ids.len() > MAX_SOURCES
        || q.comment.len() > 4096
        || q.selected_claim_ids
            .iter()
            .any(|s| !s.starts_with("claim-") || !request_scope::portable_id(s))
        || q.excluded_source_ids
            .iter()
            .any(|s| !s.starts_with("source-") || !request_scope::portable_id(s))
        || q.selected_claim_ids.iter().collect::<BTreeSet<_>>().len() != q.selected_claim_ids.len()
        || q.excluded_source_ids.iter().collect::<BTreeSet<_>>().len()
            != q.excluded_source_ids.len()
    {
        return Err("Selecciona afirmaciones y fuentes conocidas, sin duplicados, y un comentario de hasta4096bytes".into());
    }
    Ok(())
}
fn selection(q: Value, sources: usize, claims: usize) -> Result<Selection, String> {
    let mut q: Selection =
        serde_json::from_value(q).map_err(|_| "Selección de revisión no compatible")?;
    selection_shape(&q)?;
    let valid_claims = (1..=claims)
        .map(|n| format!("claim-{n}"))
        .collect::<BTreeSet<_>>();
    let valid_sources = (1..=sources)
        .map(|n| format!("source-{n}"))
        .collect::<BTreeSet<_>>();
    if q.selected_claim_ids
        .iter()
        .any(|id| !valid_claims.contains(id))
        || q.excluded_source_ids
            .iter()
            .any(|id| !valid_sources.contains(id))
    {
        return Err("La selección contiene una afirmación o fuente ajena a esta revisión".into());
    }
    q.selected_claim_ids.sort();
    q.excluded_source_ids.sort();
    Ok(q)
}
fn local_target(api: &LocalApi, p: &str, source: &Value) -> Value {
    let raw = field(source, &["path", "documentId"]);
    let relative = if raw.contains("::") {
        match document_ref(&raw) {
            Ok((owner, path)) if owner == p => path,
            _ => return Value::Null,
        }
    } else {
        raw
    };
    if relative.is_empty()
        || relative.len() > 4096
        || relative.replace('\\', "/").split('/').any(|part| {
            let s = part.trim_end_matches(['.', ' ']).to_ascii_lowercase();
            s.starts_with('.')
                || matches!(
                    s.as_str(),
                    "owner.lock"
                        | "runtime-owner.lock"
                        | "capture.lock"
                        | "node_modules"
                        | "target"
                        | "dist"
                )
        })
    {
        return Value::Null;
    }
    let root = match api.project_root(p) {
        Ok(root) => root,
        Err(_) => return Value::Null,
    };
    let path = match path_policy::resolve(&root, &relative) {
        Ok(path) => path,
        Err(_) => return Value::Null,
    };
    let mut current = root;
    for part in Path::new(&relative).components() {
        if !matches!(part, Component::Normal(_)) {
            return Value::Null;
        }
        current.push(part);
        if fs::symlink_metadata(&current).is_ok_and(|m| batch::linked(&m)) {
            return Value::Null;
        }
    }
    let meta = fs::symlink_metadata(&path).ok();
    let status = if meta.as_ref().is_some_and(|m| m.is_file() || m.is_dir()) {
        "available"
    } else {
        "missing"
    };
    let kind = if meta.as_ref().is_some_and(|m| m.is_dir()) {
        "folder"
    } else if is_markdown_path(&path) {
        "document"
    } else if is_handwritten_note_path(&path) {
        "handwritten-note"
    } else if is_image_path(&path) {
        "image"
    } else if path
        .extension()
        .and_then(|s| s.to_str())
        .is_some_and(|s| matches!(s.to_ascii_lowercase().as_str(), "pdf" | "docx" | "xlsx"))
    {
        "reference-document"
    } else {
        "attachment"
    };
    json!({"id":doc_id(p,&relative),"projectId":p,"name":relative.rsplit('/').next().unwrap_or(&relative),"path":relative,"kind":kind,"status":status})
}
fn frequencies(rows: &[Value]) -> BTreeMap<String, usize> {
    let mut counts = BTreeMap::new();
    for row in rows {
        if let Some(id) = provider_id(&row["id"]) {
            *counts.entry(id).or_default() += 1;
        }
    }
    counts
}
fn checked_job(store: &Value, p: &str, id: &str) -> Result<Value, String> {
    if !request_scope::portable_id(id) {
        return Err("Identidad de investigación no válida".into());
    }
    let job = store["jobs"]
        .as_array()
        .and_then(|jobs| jobs.iter().find(|job| job["id"] == id))
        .cloned()
        .ok_or("Investigación no encontrada")?;
    if job["projectId"].as_str().is_some_and(|owner| owner != p)
        || job
            .get("schemaVersion")
            .is_some_and(|v| v.as_u64() != Some(1))
    {
        return Err("Investigación ajena o de versión futura; se conserva".into());
    }
    Ok(job)
}
fn inspect(
    api: &LocalApi,
    p: &str,
    job: &Value,
    proposal: Option<&Selection>,
) -> Result<Value, String> {
    let source_rows = list(job, "sources", MAX_SOURCES)?;
    let evidence_rows = list(job, "evidence", MAX_EVIDENCE)?;
    let finding_rows = list(job, "findings", MAX_CLAIMS)?;
    if finding_rows.iter().any(|row| {
        row["evidenceIds"]
            .as_array()
            .is_some_and(|ids| ids.len() > MAX_EVIDENCE)
    }) {
        return Err("Una afirmación supera1000referencias de evidencia; se conserva el original sin truncar ni normalizar".into());
    }
    let reads = list(job, "sourceReads", MAX_SOURCES)?;
    let inspect_size=serde_json::to_vec(&json!({"sources":source_rows,"evidence":evidence_rows,"findings":finding_rows,"reads":reads})).map_err(|_|"Fuentes no compatibles")?.len();
    if inspect_size > MAX_TEXT {
        return Err("Las fuentes/evidencias/afirmaciones superan2MiB de inspección; los originales no se truncan".into());
    }
    let source_rev = source_revision(api, p, job)?;
    let o = overlay(job)?;
    let revision = sha_value(&json!({"sourceRevision":source_rev,"overlay":o}))?;
    let sf = frequencies(&source_rows);
    let ef = frequencies(&evidence_rows);
    let ff = frequencies(&finding_rows);
    let mut warnings=vec!["La revisión calcula relaciones registradas y coincidencias de extractos capturados. No comprueba la verdad factual ni la actualidad de una fuente.".to_string()];
    if finding_rows.is_empty() {
        warnings.push("No hay afirmaciones estructuradas conservadas. No se han sintetizado a partir del Markdown.".into());
    }
    let current = o
        .reviews
        .iter()
        .filter(|r| r.source_revision == source_rev)
        .collect::<Vec<_>>();
    if o.reviews.iter().any(|r| r.source_revision != source_rev) {
        warnings.push("Hay revisiones de otra base conservadas en el historial; no se aplican a las fuentes actuales.".into());
    }
    let last_selection = proposal
        .cloned()
        .or_else(|| current.last().map(|r| r.selection.clone()))
        .unwrap_or_default();
    let mut claim_overrides: BTreeMap<String, (Vec<String>, String)> = BTreeMap::new();
    for r in current {
        let q = selection(
            serde_json::to_value(&r.selection).map_err(|_| "Revisión no compatible")?,
            source_rows.len(),
            finding_rows.len(),
        )?;
        for id in q.selected_claim_ids {
            claim_overrides.insert(id, (q.excluded_source_ids.clone(), q.comment.clone()));
        }
    }
    if let Some(q) = proposal {
        for id in &q.selected_claim_ids {
            claim_overrides.insert(
                id.clone(),
                (q.excluded_source_ids.clone(), q.comment.clone()),
            );
        }
    }
    let mut sources = vec![];
    let mut source_map = BTreeMap::new();
    let mut captured: BTreeMap<String, String> = BTreeMap::new();
    let mut source_usable = BTreeSet::new();
    for (i, row) in source_rows.iter().enumerate() {
        let view_id = format!("source-{}", i + 1);
        let id = provider_id(&row["id"]);
        let ambiguous = id.as_ref().map(|id| sf.get(id) != Some(&1)).unwrap_or(true);
        if !ambiguous {
            source_map.insert(id.clone().unwrap(), view_id.clone());
        }
        let kind = field(row, &["kind"]);
        let url = http_url(&row["url"]);
        let local = local_target(api, p, row);
        let status = field(row, &["status", "state"]);
        let excerpt = field(row, &["snapshotExcerpt", "excerpt"]);
        let mut capture = excerpt.clone();
        if let Some(parts) = row["usedFragments"].as_array() {
            for part in parts.iter().filter_map(Value::as_str) {
                capture.push('\n');
                capture.push_str(part);
            }
        }
        if let Some(original) = id.as_ref() {
            for read in reads
                .iter()
                .filter(|read| read["sourceId"].as_str() == Some(original))
            {
                capture.push('\n');
                capture.push_str(&field(read, &["excerpt", "text", "content"]));
            }
        }
        captured.insert(view_id.clone(), capture);
        if !ambiguous
            && !matches!(status.as_str(), "unavailable" | "rejected" | "failed")
            && (kind != "web" || url.is_some())
        {
            source_usable.insert(view_id.clone());
        }
        sources.push(json!({"id":view_id,"originalId":original_id(&row["id"]),"title":if row["title"].is_string(){text(&row["title"])}else{format!("Fuente {} sin título",i+1)},"url":url,"localTarget":local,"kind":kind,"publishedAt":optional(&row["publishedAt"]),"consultedAt":optional(&row["consultedAt"]),"excerpt":excerpt,"status":status,"excluded":last_selection.excluded_source_ids.contains(&view_id),"ambiguous":ambiguous}));
    }
    let mut evidence = vec![];
    let mut evidence_map = BTreeMap::new();
    for (i, row) in evidence_rows.iter().enumerate() {
        let view_id = format!("evidence-{}", i + 1);
        let id = provider_id(&row["id"]);
        let ambiguous = id.as_ref().map(|id| ef.get(id) != Some(&1)).unwrap_or(true);
        if !ambiguous {
            evidence_map.insert(id.clone().unwrap(), view_id.clone());
        }
        let original_source = provider_id(&row["sourceId"]);
        let source_id = original_source
            .as_ref()
            .and_then(|s| source_map.get(s))
            .cloned();
        let excerpt = field(row, &["excerpt"]);
        let snapshot = source_id
            .as_ref()
            .and_then(|id| captured.get(id))
            .map(String::as_str)
            .unwrap_or("");
        let matched = if excerpt.is_empty() {
            "not-provided"
        } else if snapshot.trim().is_empty() {
            "unavailable"
        } else if snapshot.contains(&excerpt) {
            "match"
        } else {
            "not-found"
        };
        let usable = matched == "match"
            && !ambiguous
            && source_id
                .as_ref()
                .is_some_and(|s| source_usable.contains(s));
        evidence.push(json!({"id":view_id,"originalId":original_id(&row["id"]),"sourceId":source_id,"originalSourceId":original_id(&row["sourceId"]),"claim":field(row,&["claim","summary"]),"excerpt":excerpt,"consultedAt":optional(&row["consultedAt"]),"excerptMatch":matched,"usable":usable,"ambiguous":ambiguous}));
    }
    let by_evidence = evidence
        .iter()
        .map(|row| (row["id"].as_str().unwrap().to_owned(), row))
        .collect::<BTreeMap<_, _>>();
    let mut claims = vec![];
    let mut used_sources = BTreeSet::new();
    let mut used_evidence = BTreeSet::new();
    let mut unknown_total = 0usize;
    let mut backed = 0;
    let mut partial = 0;
    let mut unbacked = 0;
    let mut excluded_count = 0;
    for (i, row) in finding_rows.iter().enumerate() {
        let id = format!("claim-{}", i + 1);
        let valid_claim = provider_id(&row["id"])
            .as_ref()
            .is_some_and(|id| ff.get(id) == Some(&1));
        let (exclusions, comment) = claim_overrides.get(&id).cloned().unwrap_or_default();
        let mut refs = vec![];
        let mut unknown = vec![];
        let mut unknown_sources = vec![];
        let mut claim_sources = BTreeSet::new();
        let mut support = 0;
        let mut valid_before_exclusion = 0;
        let mut citation_gaps = 0usize;
        let mut seen_references = BTreeSet::new();
        let raw_refs = row["evidenceIds"].as_array().cloned().unwrap_or_default();
        for original in raw_refs {
            let raw = original
                .as_str()
                .map(str::to_owned)
                .unwrap_or_else(|| original.to_string());
            if !seen_references.insert(raw.clone()) {
                continue;
            }
            if let Some(eid) = provider_id(&original)
                .as_ref()
                .and_then(|id| evidence_map.get(id))
            {
                refs.push(eid.clone());
                let e = by_evidence[eid];
                if e["usable"] != true {
                    citation_gaps += 1;
                }
                if let Some(sid) = e["sourceId"].as_str() {
                    claim_sources.insert(sid.to_owned());
                    if e["usable"] == true && valid_claim {
                        valid_before_exclusion += 1;
                        if !exclusions.iter().any(|s| s == sid) {
                            support += 1;
                            used_sources.insert(sid.to_owned());
                            used_evidence.insert(eid.clone());
                        }
                    } else if !source_usable.contains(sid) {
                        unknown_sources.push(
                            e["originalSourceId"]
                                .as_str()
                                .unwrap_or("Fuente ambigua o no disponible")
                                .to_owned(),
                        );
                    }
                } else {
                    unknown_sources.push(
                        e["originalSourceId"]
                            .as_str()
                            .unwrap_or("Fuente sin identidad")
                            .to_owned(),
                    );
                }
            } else {
                unknown.push(raw);
            }
        }
        let unknown_count = unknown.len() + unknown_sources.len() + usize::from(!valid_claim);
        unknown_total += unknown_count;
        let state = if support > 0 {
            if unknown_count == 0 && citation_gaps == 0 {
                backed += 1;
                "backed"
            } else {
                partial += 1;
                "partially-backed"
            }
        } else if valid_before_exclusion > 0 {
            excluded_count += 1;
            "excluded"
        } else {
            unbacked += 1;
            "unbacked"
        };
        claims.push(json!({"id":id,"originalId":original_id(&row["id"]),"title":if row["title"].is_string(){text(&row["title"])}else{format!("Afirmación {}",i+1)},"summary":field(row,&["summary","claim","text"]),"evidenceIds":refs,"unknownEvidenceIds":unknown,"sourceIds":claim_sources.into_iter().collect::<Vec<_>>(),"unknownSourceIds":unknown_sources,"excludedSourceIds":exclusions,"comment":comment,"state":state,"supportCount":support,"unknownReferenceCount":unknown_count}));
    }
    if unknown_total > 0
        || sources.iter().any(|s| s["ambiguous"] == true)
        || evidence.iter().any(|e| e["ambiguous"] == true)
    {
        warnings.push("Hay identidades ausentes, duplicadas, desconocidas o no utilizables. Se muestran como falta de respaldo; no se cuentan como apoyo.".into());
    }
    let receipts=o.reviews.iter().map(|r|json!({"attemptId":r.attempt_id,"createdAt":r.created_at,"sourceRevision":r.source_revision,"selectionRevision":r.selection_revision,"phase":"applied"})).collect::<Vec<_>>();
    let mut out = json!({"schemaVersion":1,"projectId":p,"jobId":job["id"],"revision":revision,"sourceRevision":source_rev,"checkedAt":knownext_core::now_iso(),"readOnly":true,"startsProvider":false,"sources":sources,"evidence":evidence,"claims":claims,"selection":last_selection,"warnings":warnings,"receipts":receipts,"coverage":{"claims":finding_rows.len(),"backedClaims":backed,"partiallyBackedClaims":partial,"unbackedClaims":unbacked,"excludedClaims":excluded_count,"sources":source_rows.len(),"includedSources":used_sources.len(),"evidence":evidence_rows.len(),"usableEvidence":used_evidence.len(),"unknownReferences":unknown_total,"coverageRatio":if finding_rows.is_empty(){0.0}else{backed as f64/finding_rows.len()as f64}}});
    if let Some(receipt) = out["receipts"]
        .as_array()
        .and_then(|rows| rows.last())
        .cloned()
    {
        out["receipt"] = receipt;
    }
    let mut exposed = 0usize;
    for warning in out["warnings"].as_array().unwrap() {
        exposed += warning.as_str().unwrap_or("").len();
    }
    exposed += out["selection"]["comment"].as_str().unwrap_or("").len();
    for (rows, fields) in [
        ("sources", &["title", "excerpt", "originalId"][..]),
        (
            "evidence",
            &["claim", "excerpt", "originalId", "originalSourceId"][..],
        ),
        ("claims", &["title", "summary", "comment"][..]),
    ] {
        for row in out[rows].as_array().unwrap() {
            for key in fields {
                exposed += row[*key].as_str().unwrap_or("").len();
            }
            if rows == "claims" {
                for field in ["unknownEvidenceIds", "unknownSourceIds"] {
                    for value in row[field].as_array().unwrap() {
                        exposed += value.as_str().unwrap_or("").len();
                    }
                }
            }
        }
    }
    if exposed > MAX_TEXT {
        return Err("La revisión y sus comentarios superan2MiB de texto visible; no se truncan ni se guarda un estado ilegible".into());
    }
    Ok(out)
}
fn review_revision(view: &Value, q: &Selection) -> Result<String, String> {
    sha_value(
        &json!({"revision":view["revision"],"sourceRevision":view["sourceRevision"],"selection":q}),
    )
}
impl LocalApi {
    pub(crate) fn research_evidence_review(&self, p: &str, id: &str) -> Result<Value, String> {
        let _private = self.private_work()?;
        let root = root_hash(self, p)?;
        let job = checked_job(&self.research_jobs_checked(p)?, p, id)?;
        let value = inspect(self, p, &job, None)?;
        if root_hash(self, p)? != root {
            return Err("La ubicación cambió durante la consulta".into());
        }
        Ok(value)
    }
    pub(crate) fn prepare_research_evidence_review(
        &self,
        p: &str,
        id: &str,
        body: Value,
    ) -> Result<Value, String> {
        #[derive(Deserialize)]
        #[serde(deny_unknown_fields)]
        struct Input {
            revision: String,
            selection: Value,
        }
        let q: Input =
            serde_json::from_value(body).map_err(|_| "Preparación de revisión no válida")?;
        let _private = self.private_work()?;
        let root = root_hash(self, p)?;
        let job = checked_job(&self.research_jobs_checked(p)?, p, id)?;
        let baseline = inspect(self, p, &job, None)?;
        if baseline["revision"] != q.revision {
            return Err("La investigación o su revisión cambiaron; vuelve a consultar".into());
        }
        let selected = selection(
            q.selection,
            baseline["sources"].as_array().unwrap().len(),
            baseline["claims"].as_array().unwrap().len(),
        )?;
        let mut view = inspect(self, p, &job, Some(&selected))?;
        view["reviewRevision"] = json!(review_revision(&baseline, &selected)?);
        if root_hash(self, p)? != root {
            return Err("La ubicación cambió durante la revisión".into());
        }
        Ok(view)
    }
    pub(crate) fn apply_research_evidence_review(
        &self,
        p: &str,
        id: &str,
        body: Value,
    ) -> Result<Value, String> {
        #[derive(Deserialize)]
        #[serde(rename_all = "camelCase", deny_unknown_fields)]
        struct Input {
            revision: String,
            review_revision: String,
            selection: Value,
            attempt_id: String,
            acknowledge: bool,
        }
        let q: Input =
            serde_json::from_value(body).map_err(|_| "Aplicación de revisión no válida")?;
        if !q.acknowledge
            || !q.attempt_id.starts_with("research-review-")
            || !request_scope::portable_id(&q.attempt_id)
        {
            return Err("Confirma esta revisión con una identidad de intento válida".into());
        }
        let _private = self.private_work()?;
        let _project = self.project_transaction(p)?;
        let _gate = self
            .research_gate
            .lock()
            .map_err(|_| "No se pudo reservar la investigación")?;
        let root = root_hash(self, p)?;
        let before = self.research_jobs_checked(p)?;
        let job = checked_job(&before, p, id)?;
        if !matches!(
            job["status"].as_str(),
            Some(
                "ready"
                    | "ready_pass"
                    | "ready_warning"
                    | "completed"
                    | "cancelled"
                    | "failed"
                    | "failed_quality"
                    | "failed_publish"
                    | "failed_runtime"
                    | "failed_provider"
            )
        ) {
            return Err("La investigación sigue cambiando; espera su finalización antes de guardar la revisión local".into());
        }
        let baseline = inspect(self, p, &job, None)?;
        if baseline["revision"] != q.revision {
            return Err("La base cambió; la revisión no se ha aplicado".into());
        }
        let selected = selection(
            q.selection,
            baseline["sources"].as_array().unwrap().len(),
            baseline["claims"].as_array().unwrap().len(),
        )?;
        let reviewed = review_revision(&baseline, &selected)?;
        if reviewed != q.review_revision {
            return Err("La selección no corresponde a la revisión preparada".into());
        }
        let mut o = overlay(&job)?;
        if o.reviews.len() >= MAX_REVIEWS || o.reviews.iter().any(|r| r.attempt_id == q.attempt_id)
        {
            return Err(
                "Intento conservado o límite de16revisiones alcanzado; consulta sin repetir".into(),
            );
        }
        o.reviews.push(Review {
            attempt_id: q.attempt_id,
            created_at: knownext_core::now_iso(),
            source_revision: baseline["sourceRevision"].as_str().unwrap().into(),
            selection_revision: reviewed,
            selection: selected,
        });
        let mut changed = job;
        changed["evidenceReview"] =
            serde_json::to_value(o).map_err(|_| "Revisión no representable")?;
        let mut view = inspect(self, p, &changed, None)?;
        view["readOnly"] = json!(false);
        let mut store = before.clone();
        let slot = store["jobs"]
            .as_array_mut()
            .unwrap()
            .iter_mut()
            .find(|job| job["id"] == id)
            .ok_or("La investigación ya no está disponible")?;
        *slot = changed.clone();
        let size = serde_json::to_vec_pretty(&store)
            .map_err(|_| "Estado no representable")?
            .len();
        if size > 32 * 1024 * 1024 {
            return Err(
                "El archivo de investigaciones supera32MiB; no se truncan originales ni revisiones"
                    .into(),
            );
        }
        let old = fs::metadata(self.research_jobs_path(p))
            .map(|m| m.len())
            .unwrap_or(0);
        let _budget = recovery_inventory::admit(self, (size as u64).saturating_sub(old) + 4096)?;
        if self.research_jobs_checked(p)? != before || root_hash(self, p)? != root {
            return Err(
                "La fuente o el historial cambiaron antes de guardar; no se sustituyen".into(),
            );
        }
        self.write_json_atomic(&self.research_jobs_path(p), &store)?;
        Ok(view)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn block8_review_later_research_writer_preserves_existing_human_overlay() {
        let d = tempfile::tempdir().unwrap();
        let a = LocalApi::new(d.path().join("state"), "qa".into(), "review".into());
        let p = a
            .handle(
                "POST",
                "/api/projects",
                json!({"name":"Writer","versioningMode":"none","syncMode":"none"}),
                vec![],
            )
            .unwrap()
            .body;
        let id = p["id"].as_str().unwrap();
        let old = json!({"id":"research-writer","projectId":id,"status":"ready_pass","sources":[],"evidence":[],"findings":[],"markdown":"Original"});
        a.write_ai_research_job(id, &old).unwrap();
        let mut saved = old.clone();
        saved["evidenceReview"] = json!({"schemaVersion":1,"reviews":[]});
        a.write_json_atomic(&a.research_jobs_path(id), &json!({"jobs":[saved]}))
            .unwrap();
        let mut late = old;
        late["message"] = json!("Other runtime metadata update");
        a.write_ai_research_job(id, &late).unwrap();
        let job =
            checked_job(&a.research_jobs_checked(id).unwrap(), id, "research-writer").unwrap();
        assert_eq!(
            job["evidenceReview"],
            json!({"schemaVersion":1,"reviews":[]})
        );
        assert_eq!(job["markdown"], "Original");
    }
}
