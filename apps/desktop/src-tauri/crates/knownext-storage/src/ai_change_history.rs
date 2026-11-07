//! Native provenance and reviewed inverse drafts. Reads never replay or infer an application.
use super::*;
use std::{fs, io::Read};
#[path = "ai_reversion_diff.rs"]
mod inverse;
#[path = "ai_reversion_notes.rs"]
mod notes;
const MAX_TEXT: usize = 2 * 1024 * 1024;
const MAX_FILE: u64 = 40 * 1024 * 1024;
const MAX_TOTAL: u64 = 128 * 1024 * 1024;
const MAX_ACTIVE: usize = 64;
const MAX_IDENTITIES: usize = 2048;
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Receipt {
    id: String,
    review_revision: String,
    selected: Vec<String>,
    phase: String,
    created_at: String,
    before_markdown: String,
    candidate_sha256: String,
    draft_write_revision: Option<String>,
    effect: String,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Record {
    schema_version: u8,
    id: String,
    project_id: String,
    document_id: String,
    root_hash: String,
    interaction_id: String,
    operation_id: String,
    summary: String,
    kind: String,
    created_at: String,
    phase: String,
    disk_fingerprint: Value,
    draft_before: Option<String>,
    head_before: Option<String>,
    before_markdown: String,
    before_sha256: String,
    after_markdown: Option<String>,
    after_sha256: Option<String>,
    after_draft_revision: Option<String>,
    reverted_hunks: Vec<String>,
    receipts: Vec<Receipt>,
    retired_at: Option<String>,
}
fn directory(api: &LocalApi) -> Result<PathBuf, String> {
    let d = api.app_data_dir.join("ai-changes");
    for p in [&api.app_data_dir, &d] {
        match fs::symlink_metadata(p) {
            Ok(m) if m.is_dir() && !batch::linked(&m) => (),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => (),
            _ => return Err("El historial de cambios IA no es regular; se conserva".into()),
        }
    }
    Ok(d)
}
fn path(api: &LocalApi, id: &str) -> Result<PathBuf, String> {
    if !id.starts_with("ai-change-") || !request_scope::portable_id(id) {
        return Err("Cambio IA no válido".into());
    }
    Ok(directory(api)?.join(format!("{id}.json")))
}
fn validate(r: &Record) -> Result<(), String> {
    let (p, _) = document_ref(&r.document_id)?;
    if r.schema_version != 1
        || p != r.project_id
        || !request_scope::portable_id(&p)
        || !r.id.starts_with("ai-change-")
        || !request_scope::portable_id(&r.id)
        || r.root_hash.len() != 64
        || !r.root_hash.bytes().all(|b| b.is_ascii_hexdigit())
        || r.interaction_id.is_empty()
        || r.interaction_id.len() > 320
        || r.operation_id.is_empty()
        || r.operation_id.len() > 320
        || r.summary.len() > 4096
        || !matches!(r.kind.as_str(), "markdown" | "created" | "handwritten")
        || !matches!(
            r.phase.as_str(),
            "prepared" | "applying" | "applied" | "partially-reverted" | "reverted" | "retired"
        )
        || r.before_markdown.len() > MAX_TEXT
        || r.after_markdown
            .as_ref()
            .is_some_and(|s| s.len() > MAX_TEXT)
        || r.receipts.len() > 16
        || r.reverted_hunks.len() > 128
        || OffsetDateTime::parse(&r.created_at, &Rfc3339).is_err()
    {
        return Err("Historial IA futuro o no compatible; se conserva".into());
    }
    if r.before_sha256.len() != 64
        || r.after_sha256.as_ref().is_some_and(|h| h.len() != 64)
        || r.phase != "retired"
            && (sha256_hex(r.before_markdown.as_bytes()) != r.before_sha256
                || r.after_markdown.as_ref().map(|t| sha256_hex(t.as_bytes())) != r.after_sha256)
    {
        return Err("Las copias del cambio no coinciden con sus huellas; se conservan".into());
    }
    if (r.kind == "handwritten") != (content_kind(&r.document_id)? == "handwritten") {
        return Err("El tipo del cambio no coincide con el documento".into());
    }
    let mut ids = BTreeSet::new();
    for receipt in &r.receipts {
        if !receipt.id.starts_with("ai-revert-")
            || !request_scope::portable_id(&receipt.id)
            || !ids.insert(&receipt.id)
            || !matches!(receipt.phase.as_str(), "applying" | "completed")
            || receipt.before_markdown.len() > MAX_TEXT
            || receipt.candidate_sha256.len() != 64
            || receipt.selected.len() > 128
        {
            return Err("Acuse IA no compatible; se conserva".into());
        }
    }
    Ok(())
}
fn load(api: &LocalApi, id: &str) -> Result<(Record, String), String> {
    let p = path(api, id)?;
    let m = fs::symlink_metadata(&p).map_err(|_| "Cambio IA no disponible")?;
    if !m.is_file() || batch::linked(&m) || m.len() > MAX_FILE {
        return Err("Cambio IA no regular o fuera de límite; se conserva".into());
    }
    let mut bytes = vec![];
    fs::File::open(p)
        .map_err(|_| "Cambio IA no accesible")?
        .take(MAX_FILE + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| "Cambio IA incompleto")?;
    if bytes.len() as u64 > MAX_FILE {
        return Err("Cambio IA fuera de límite".into());
    }
    let r: Record =
        serde_json::from_slice(&bytes).map_err(|_| "Cambio IA no compatible; se conserva")?;
    validate(&r)?;
    if r.id != id {
        return Err("La identidad del cambio no coincide".into());
    }
    Ok((r, sha256_hex(&bytes)))
}
fn entries(api: &LocalApi) -> Result<Vec<String>, String> {
    let d = directory(api)?;
    let reader = match fs::read_dir(d) {
        Ok(v) => v,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(vec![]),
        Err(_) => return Err("Historial IA no accesible".into()),
    };
    let mut ids = vec![];
    for entry in reader.take(MAX_IDENTITIES + 1) {
        let name = entry
            .map_err(|_| "Historial IA incompleto")?
            .file_name()
            .to_string_lossy()
            .into_owned();
        if matches!(
            name.to_ascii_lowercase().as_str(),
            "owner.lock" | "runtime-owner.lock" | "capture.lock"
        ) {
            continue;
        }
        let id = name
            .strip_suffix(".json")
            .filter(|s| s.starts_with("ai-change-") && request_scope::portable_id(s))
            .ok_or("Entrada IA desconocida; se conserva")?;
        ids.push(id.to_owned());
        if ids.len() > MAX_IDENTITIES {
            return Err("El historial alcanza2048 identidades; se conservan".into());
        }
    }
    ids.sort();
    Ok(ids)
}
fn store(
    api: &LocalApi,
    r: &Record,
    expected: Option<&str>,
    creating: bool,
) -> Result<String, String> {
    validate(r)?;
    let d = directory(api)?;
    let raw = serde_json::to_vec(r).map_err(|_| "Cambio IA no representable")?;
    if raw.len() as u64 > MAX_FILE {
        return Err("Las copias de la operación superan40MiB; no se modifica el documento".into());
    }
    let mut total = raw.len() as u64;
    let mut active = usize::from(r.phase != "retired");
    let ids = entries(api)?;
    if creating && ids.len() >= MAX_IDENTITIES {
        return Err("Se alcanzaron2048 identidades IA; se conservan sus acuses".into());
    }
    for id in ids.iter().filter(|id| *id != &r.id) {
        let (other, _) = load(api, id)?;
        total = total.saturating_add(
            fs::metadata(path(api, id)?)
                .map_err(|_| "Cambio IA no disponible")?
                .len(),
        );
        if other.phase != "retired" {
            active += 1;
        }
        if total > MAX_TOTAL || active > MAX_ACTIVE {
            return Err("El historial IA alcanza64 operaciones activas o128MiB. Retira copias revisadas; no se borra nada automáticamente".into());
        }
    }
    let previous = if let Some(expected) = expected {
        let (previous, revision) = load(api, &r.id)?;
        if revision != expected {
            return Err("El cambio IA tiene otra revisión; consulta antes de repetir".into());
        }
        Some(previous)
    } else {
        None
    };
    let previous_bytes = if creating {
        0
    } else {
        fs::metadata(path(api, &r.id)?)
            .map_err(|_| "El cambio IA no está disponible")?
            .len()
    };
    let starting = creating
        || previous.as_ref().is_some_and(|old| {
            r.phase == "applying" && old.phase == "prepared"
                || r.receipts.len() > old.receipts.len()
        });
    // Completion and payload retirement continue already admitted work; they cannot be blocked by a newly lowered budget.
    let _budget = if starting {
        Some(recovery_inventory::admit(
            api,
            (raw.len() as u64).saturating_sub(previous_bytes) + 4096,
        )?)
    } else {
        None
    };
    if !d.exists() {
        fs::create_dir(&d).map_err(|_| "No se pudo conservar el historial IA")?;
    }
    if creating {
        atomic_io::create(&path(api, &r.id)?, &raw)
    } else {
        atomic_io::write(&path(api, &r.id)?, &raw)
    }
    .map_err(|_| "El acuse no está confirmado. Consulta sin repetir")?;
    Ok(sha256_hex(&raw))
}
fn root(api: &LocalApi, p: &str) -> Result<(PathBuf, String), String> {
    let root = api
        .project_root(p)?
        .canonicalize()
        .map_err(|_| "El proyecto no está disponible")?;
    let hash = sha256_hex(root.to_string_lossy().as_bytes());
    Ok((root, hash))
}
// Version history is optional metadata: Android edits must never require a Git executable.
fn optional_head(root: &Path) -> Option<String> {
    if project_capabilities::require_history_runtime().is_err() {
        return None;
    }
    history_views::head(root).ok().flatten()
}
fn source_proof(
    root_hash: &str,
    disk: &Value,
    draft: &Option<String>,
    text: &str,
) -> Result<String, String> {
    Ok(sha256_hex(
        &serde_json::to_vec(&json!([
            root_hash,
            disk,
            draft,
            sha256_hex(text.as_bytes())
        ]))
        .map_err(|_| "La fuente no es representable")?,
    ))
}
fn current_source_proof(api: &LocalApi, p: &str, id: &str) -> Result<(String, Value), String> {
    let (_, root_hash) = root(api, p)?;
    let (text, disk, draft) = current(api, id)?;
    Ok((source_proof(&root_hash, &disk, &draft, &text)?, disk))
}
fn bound(api: &LocalApi, p: &str, id: &str) -> Result<(Record, String), String> {
    let (r, rev) = load(api, id)?;
    if r.project_id != p || root(api, p)?.1 != r.root_hash {
        return Err("El cambio pertenece a otra ubicación del proyecto; no se ejecuta".into());
    }
    Ok((r, rev))
}
fn canonical_note(value: Value, id: &str) -> Result<String, String> {
    document_validation::handwritten(&value)?;
    let (_, relative) = document_ref(id)?;
    let title = Path::new(&relative)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("Nota");
    let mut v = normalize_handwritten_note(value, id, title);
    if let Some(m) = v.as_object_mut() {
        m.remove("createdAt");
        m.remove("updatedAt");
    }
    let text = serde_json::to_string_pretty(&v).map_err(|_| "Nota no representable")?;
    if text.len() > MAX_TEXT {
        return Err("La copia de nota supera2MiB; no se sustituye".into());
    }
    Ok(text)
}
fn content_kind(id: &str) -> Result<&'static str, String> {
    let (_, relative) = document_ref(id)?;
    Ok(if is_handwritten_note_path(Path::new(&relative)) {
        "handwritten"
    } else {
        "markdown"
    })
}
fn edit_permission(api: &LocalApi, kind: &str) -> Result<(), String> {
    let config = api.read_config_checked()?;
    let name = if kind == "handwritten" {
        "editHandwrittenNotes"
    } else {
        "editDocuments"
    };
    if config["ai"]["permissions"][name] != true {
        return Err("El permiso de edición IA está desactivado; no se aplica el cambio".into());
    }
    Ok(())
}
fn current(api: &LocalApi, id: &str) -> Result<(String, Value, Option<String>), String> {
    let handwritten = content_kind(id)? == "handwritten";
    let p = if handwritten {
        api.resolve_handwritten_path(id)?
    } else {
        api.resolve_markdown_path(id)?
    };
    let m = fs::symlink_metadata(&p).map_err(|_| "Documento no disponible")?;
    if !m.is_file() || batch::linked(&m) || m.len() as usize > MAX_TEXT {
        return Err(
            "La revisión admite archivos regulares de hasta2MiB; los originales permanecen".into(),
        );
    }
    let raw = export_execution::bounded_read(&p, MAX_TEXT as u64)?;
    let disk = String::from_utf8(raw.clone()).map_err(|_| "Documento no UTF-8")?;
    let draft = api.read_draft(id)?;
    draft_versions::ensure_kind(id, draft.as_ref())?;
    let revision = draft_versions::revision(draft.as_ref())?;
    let text = if handwritten {
        let value = if let Some(v) = draft.as_ref().and_then(|d| d.get("content")) {
            v.clone()
        } else {
            serde_json::from_str(&disk).map_err(|_| "Nota no compatible")?
        };
        canonical_note(value, id)?
    } else {
        draft
            .as_ref()
            .and_then(|d| d["markdown"].as_str())
            .unwrap_or(&disk)
            .to_owned()
    };
    if text.len() > MAX_TEXT {
        return Err("El borrador supera2MiB; se conserva".into());
    }
    Ok((text, fingerprint_bytes(&raw), revision))
}
fn public(r: &Record, revision: &str) -> Value {
    json!({"schemaVersion":1,"id":r.id,"projectId":r.project_id,"documentId":r.document_id,"interactionId":r.interaction_id,"operationId":r.operation_id,"summary":r.summary,"kind":r.kind,"createdAt":r.created_at,"revision":revision,"phase":if r.phase=="applying"||r.receipts.iter().any(|x|x.phase=="applying"){"uncertain"}else{r.phase.as_str()},"headBefore":r.head_before,"beforeSha256":r.before_sha256,"afterSha256":r.after_sha256,"afterDraftWriteRevision":r.after_draft_revision,"revertedHunks":r.reverted_hunks,"receiptCount":r.receipts.len(),"retiredAt":r.retired_at,"preservesDisk":true,"startsAi":false,"checkedAt":knownext_core::now_iso()})
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Prepare {
    interaction_id: String,
    operation_id: String,
    summary: String,
    before_markdown: String,
    expected_draft_write_revision: Option<String>,
    base_fingerprint: Option<Value>,
    #[serde(default)]
    read_only: bool,
}
impl LocalApi {
    pub(crate) fn prepare_ai_change(&self, id: &str, body: Value) -> Result<Value, String> {
        let q: Prepare = serde_json::from_value(body).map_err(|_| "Origen IA no válido")?;
        let (p, _) = document_ref(id)?;
        let kind = content_kind(id)?;
        edit_permission(self, kind)?;
        if q.read_only {
            return Err("Una petición de solo lectura no autoriza editar".into());
        }
        let _gate = self.project_transaction(&p)?;
        let (_, fingerprint, draft) = current(self, id)?;
        if q.expected_draft_write_revision != draft
            || q.base_fingerprint
                .as_ref()
                .is_some_and(|f| !f.is_null() && f != &fingerprint)
        {
            return Err("El archivo o borrador cambió antes de preparar la edición IA".into());
        }
        if q.before_markdown.len() > MAX_TEXT {
            return Err("La edición IA supera2MiB; se conserva sin aplicar".into());
        }
        let before = if kind == "handwritten" {
            canonical_note(
                serde_json::from_str(&q.before_markdown)
                    .map_err(|_| "La nota anterior no es JSON válido")?,
                id,
            )?
        } else {
            q.before_markdown
        };
        let (root, hash) = root(self, &p)?;
        let r = Record {
            schema_version: 1,
            id: knownext_core::compact_id("ai-change"),
            project_id: p,
            document_id: id.into(),
            root_hash: hash,
            interaction_id: q.interaction_id,
            operation_id: q.operation_id,
            summary: q.summary,
            kind: kind.into(),
            created_at: knownext_core::now_iso(),
            phase: "prepared".into(),
            disk_fingerprint: fingerprint,
            draft_before: draft,
            head_before: optional_head(&root),
            before_sha256: sha256_hex(before.as_bytes()),
            before_markdown: before,
            after_markdown: None,
            after_sha256: None,
            after_draft_revision: None,
            reverted_hunks: vec![],
            receipts: vec![],
            retired_at: None,
        };
        let rev = store(self, &r, None, true)?;
        Ok(public(&r, &rev))
    }
    pub(crate) fn apply_tracked_ai_change(
        &self,
        id: &str,
        mut body: Value,
    ) -> Result<Value, String> {
        if body.get("changeId").is_none() {
            let markdown = body
                .as_object_mut()
                .ok_or("Solicitud IA no válida")?
                .remove("markdown")
                .ok_or("Falta el texto editado")?;
            let prepared = self.prepare_ai_change(id, body)?;
            body = json!({"changeId":prepared["id"],"revision":prepared["revision"],"markdown":markdown});
        }
        #[derive(Deserialize)]
        #[serde(rename_all = "camelCase", deny_unknown_fields)]
        struct Input {
            change_id: String,
            revision: String,
            markdown: String,
        }
        let q: Input = serde_json::from_value(body).map_err(|_| "Aplicación IA no válida")?;
        let (p, _) = document_ref(id)?;
        let _gate = self.project_transaction(&p)?;
        let (mut r, revision) = bound(self, &p, &q.change_id)?;
        edit_permission(self, &r.kind)?;
        let (_, disk, draft) = current(self, id)?;
        if r.document_id != id
            || !matches!(r.kind.as_str(), "markdown" | "handwritten")
            || r.phase != "prepared"
            || revision != q.revision
            || disk != r.disk_fingerprint
            || draft != r.draft_before
            || q.markdown.len() > MAX_TEXT
        {
            return Err(
                "La aplicación cambió o ya tiene un intento. Consulta el historial sin repetir"
                    .into(),
            );
        }
        let next = if r.kind == "handwritten" {
            canonical_note(
                serde_json::from_str(&q.markdown)
                    .map_err(|_| "La nota propuesta no es JSON válido")?,
                id,
            )?
        } else {
            q.markdown
        };
        r.phase = "applying".into();
        r.after_sha256 = Some(sha256_hex(next.as_bytes()));
        r.after_markdown = Some(next.clone());
        let started = store(self, &r, Some(&revision), false)?;
        // Preserving copies can take time; pin the live source again immediately before effects.
        self.verify_ai_change_precondition(&p, &r.id)?;
        let mut ack = if r.kind == "handwritten" {
            self.save_handwritten_note_draft(id,json!({"content":serde_json::from_str::<Value>(&next).map_err(|_|"Nota no representable")?,"baseFingerprint":disk}))?
        } else {
            self.save_draft(id, json!({"markdown":next,"baseFingerprint":disk}))?
        };
        ack["documentId"] = json!(id);
        r.after_draft_revision = ack["draftWriteRevision"].as_str().map(str::to_owned);
        r.phase = "applied".into();
        let revision = store(self, &r, Some(&started), false)?;
        let mut ack = ack;
        ack["aiChange"] = public(&r, &revision);
        Ok(ack)
    }
    pub(crate) fn ai_change_catalog(&self, p: &str) -> Result<Value, String> {
        root(self, p)?;
        let mut items = vec![];
        let mut active = 0;
        for id in entries(self)? {
            let (r, rev) = load(self, &id)?;
            if r.project_id == p {
                active += usize::from(r.phase != "retired");
                items.push(public(&r, &rev));
            }
        }
        items.sort_by(|a, b| b["createdAt"].as_str().cmp(&a["createdAt"].as_str()));
        Ok(
            json!({"schemaVersion":1,"projectId":p,"items":items,"active":active,"maxActive":64,"maxIdentities":2048,"maxBytes":MAX_TOTAL,"checkedAt":knownext_core::now_iso()}),
        )
    }
    pub(crate) fn ai_change_receipt(&self, p: &str, id: &str) -> Result<Value, String> {
        let (r, rev) = bound(self, p, id)?;
        let mut v = public(&r, &rev);
        v["receipts"]=json!(r.receipts.iter().map(|x|json!({"id":x.id,"phase":if x.phase=="applying"{"uncertain"}else{x.phase.as_str()},"selected":x.selected,"effect":x.effect,"createdAt":x.created_at,"draftWriteRevision":x.draft_write_revision})).collect::<Vec<_>>());
        v["copies"] = json!({"beforeMarkdown":r.before_markdown,"afterMarkdown":r.after_markdown});
        Ok(v)
    }
    pub(crate) fn review_ai_reversion(
        &self,
        p: &str,
        id: &str,
        body: Value,
    ) -> Result<Value, String> {
        #[derive(Deserialize)]
        #[serde(rename_all = "camelCase", deny_unknown_fields)]
        struct Input {
            #[serde(default)]
            selected_hunk_ids: Vec<String>,
            #[serde(default)]
            resolved_markdown: Option<String>,
        }
        let q: Input = serde_json::from_value(body).map_err(|_| "Revisión IA no válida")?;
        let (r, revision) = bound(self, p, id)?;
        if !matches!(r.phase.as_str(), "applied" | "partially-reverted")
            || r.receipts.iter().any(|x| x.phase == "applying")
        {
            return Err(
                "La operación no tiene una aplicación confirmada reversible. Consulta su acuse"
                    .into(),
            );
        }
        let (text, disk, draft) = current(self, &r.document_id)?;
        let after = r
            .after_markdown
            .as_deref()
            .ok_or("Falta la copia aplicada")?;
        let (hunks, selective) = inverse::hunks(&r.before_markdown, after);
        let selected = if r.kind == "handwritten" {
            q.selected_hunk_ids
        } else if q.selected_hunk_ids.is_empty() {
            hunks
                .iter()
                .filter(|h| !r.reverted_hunks.contains(&h.id))
                .map(|h| h.id.clone())
                .collect::<Vec<_>>()
        } else {
            q.selected_hunk_ids
        };
        let (candidate, rows, selective, selected) = if r.kind == "handwritten" {
            let (candidate, rows, selected) = notes::inverse(
                &r.before_markdown,
                after,
                &text,
                &selected,
                &r.reverted_hunks,
            )?;
            (candidate, rows, true, selected)
        } else if r.kind == "created" {
            let ready = text == after && draft.is_none();
            (
                String::new(),
                json!([{"id":"created-document","before":"","after":after,"selected":true,"status":if ready{"ready"}else{"conflict"},"reason":if ready{None}else{Some("La creación o su borrador cambió; usa la revisión normal de Papelera")}}]),
                false,
                selected,
            )
        } else if selected.is_empty() {
            (text.clone(), json!([]), selective, selected)
        } else {
            let (candidate, rows, selective) = inverse::inverse(
                &r.before_markdown,
                after,
                &text,
                &selected,
                &r.reverted_hunks,
            )?;
            (candidate, rows, selective, selected)
        };
        let manual = q.resolved_markdown.is_some();
        let candidate = if let Some(text) = q.resolved_markdown {
            if r.kind != "markdown" || text.len() > MAX_TEXT {
                return Err("Resolución manual no compatible".into());
            }
            text
        } else {
            candidate
        };
        let selected = if r.kind == "created" {
            vec!["created-document".to_owned()]
        } else {
            selected
        };
        let can = !selected.is_empty()
            && (manual
                || rows
                    .as_array()
                    .unwrap()
                    .iter()
                    .filter(|x| x["selected"] == true)
                    .all(|x| x["status"] == "ready"));
        let review = sha256_hex(
            &serde_json::to_vec(&json!([
                revision,
                r.root_hash,
                disk,
                draft,
                sha256_hex(text.as_bytes()),
                selected,
                sha256_hex(candidate.as_bytes())
            ]))
            .map_err(|_| "Revisión no representable")?,
        );
        let source_revision = source_proof(&r.root_hash, &disk, &draft, &text)?;
        Ok(
            json!({"schemaVersion":1,"projectId":p,"id":id,"documentId":r.document_id,"kind":r.kind,"summary":r.summary,"sourceRevision":source_revision,"revision":review,"changeRevision":revision,"selectedHunkIds":selected,"hunks":rows,"currentMarkdown":text,"candidateMarkdown":candidate,"resolutionMode":if manual{"manual"}else{"automatic"},"selectiveAvailable":selective,"canRevert":can,"writesDraft":r.kind!="created","movesToTrash":r.kind=="created","preservesManualEdits":true,"startsAi":false,"checkedAt":knownext_core::now_iso()}),
        )
    }
    pub(crate) fn apply_ai_reversion(
        &self,
        p: &str,
        id: &str,
        body: Value,
    ) -> Result<Value, String> {
        #[derive(Deserialize)]
        #[serde(rename_all = "camelCase", deny_unknown_fields)]
        struct Input {
            review_revision: String,
            selected_hunk_ids: Vec<String>,
            acknowledge: bool,
            #[serde(default)]
            resolved_markdown: Option<String>,
            #[serde(default)]
            acknowledge_manual_resolution: bool,
        }
        let q: Input = serde_json::from_value(body).map_err(|_| "Reversión IA no válida")?;
        let _gate = self.project_transaction(p)?;
        let reviewed = self.review_ai_reversion(
            p,
            id,
            json!({"selectedHunkIds":q.selected_hunk_ids,"resolvedMarkdown":q.resolved_markdown}),
        )?;
        if !q.acknowledge
            || q.resolved_markdown.is_some() && !q.acknowledge_manual_resolution
            || reviewed["revision"] != q.review_revision
            || reviewed["canRevert"] != true
            || reviewed["selectedHunkIds"] != json!(q.selected_hunk_ids)
        {
            return Err("El alcance cambió o tiene conflictos; revisa antes de revertir".into());
        }
        let (mut r, revision) = bound(self, p, id)?;
        if r.receipts.len() >= 16 {
            return Err("La operación conserva16 acuses; no se amplía ni se pierden copias".into());
        }
        let candidate = reviewed["candidateMarkdown"]
            .as_str()
            .ok_or("Falta el resultado revisado")?;
        let receipt = Receipt {
            id: knownext_core::compact_id("ai-revert"),
            review_revision: q.review_revision,
            selected: q.selected_hunk_ids.clone(),
            phase: "applying".into(),
            created_at: knownext_core::now_iso(),
            before_markdown: reviewed["currentMarkdown"].as_str().unwrap_or("").into(),
            candidate_sha256: sha256_hex(candidate.as_bytes()),
            draft_write_revision: None,
            effect: if r.kind == "created" {
                "moved-to-trash"
            } else {
                "draft"
            }
            .into(),
        };
        r.receipts.push(receipt);
        let started = store(self, &r, Some(&revision), false)?;
        // This proof comes from the server's fresh review, never from the submitted payload.
        // Any intervening disk/draft/root change leaves an uncertain receipt without replay.
        let (source_revision, disk) = current_source_proof(self, p, &r.document_id)?;
        if reviewed["sourceRevision"] != source_revision {
            return Err("La fuente cambió mientras se conservaban las copias; consulta el acuse sin repetir".into());
        }
        let ack = if r.kind == "created" {
            self.delete_node(p, &r.document_id)?
        } else {
            if r.kind == "handwritten" {
                self.save_handwritten_note_draft(&r.document_id,json!({"content":serde_json::from_str::<Value>(candidate).map_err(|_|"Nota no representable")?,"baseFingerprint":disk}))?
            } else {
                self.save_draft(
                    &r.document_id,
                    json!({"markdown":candidate,"baseFingerprint":disk}),
                )?
            }
        };
        let latest = r.receipts.last_mut().unwrap();
        latest.phase = "completed".into();
        latest.draft_write_revision = ack["draftWriteRevision"].as_str().map(str::to_owned);
        r.reverted_hunks.extend(q.selected_hunk_ids);
        let all = if r.kind == "created" {
            true
        } else if r.kind == "handwritten" {
            notes::all_ids(
                &r.before_markdown,
                r.after_markdown.as_deref().unwrap_or(""),
            )?
            .iter()
            .all(|id| r.reverted_hunks.contains(id))
        } else {
            inverse::hunks(
                &r.before_markdown,
                r.after_markdown.as_deref().unwrap_or(""),
            )
            .0
            .iter()
            .all(|h| r.reverted_hunks.contains(&h.id))
        };
        r.phase = if all {
            "reverted"
        } else {
            "partially-reverted"
        }
        .into();
        let revision = store(self, &r, Some(&started), false)?;
        let mut result = public(&r, &revision);
        result["draft"] = ack;
        result["status"] = json!("reverted");
        Ok(result)
    }
    pub(crate) fn ai_change_page_preview(
        &self,
        p: &str,
        id: &str,
        body: Value,
    ) -> Result<Value, String> {
        #[derive(Deserialize)]
        #[serde(rename_all = "camelCase", deny_unknown_fields)]
        struct Input {
            revision: String,
            side: String,
            page_id: String,
        }
        let q: Input = serde_json::from_value(body).map_err(|_| "Vista de página no válida")?;
        let (r, rev) = bound(self, p, id)?;
        if r.kind != "handwritten" || r.phase == "retired" || rev != q.revision {
            return Err("La copia de nota cambió o fue retirada; vuelve a consultar".into());
        }
        let text = match q.side.as_str() {
            "before" => r.before_markdown.as_str(),
            "after" => r
                .after_markdown
                .as_deref()
                .ok_or("No hay copia posterior")?,
            _ => return Err("Elige una copia anterior o posterior".into()),
        };
        let value: Value = serde_json::from_str(text).map_err(|_| "Copia de nota no compatible")?;
        document_validation::handwritten(&value)?;
        let (page, bytes) = knownext_docs::handwritten_note_png(&value, Some(&q.page_id), 0.3)?;
        if bytes.len() > 4 * 1024 * 1024 {
            return Err("La vista supera4MiB; la nota original permanece".into());
        }
        Ok(
            json!({"schemaVersion":1,"projectId":p,"id":id,"revision":rev,"side":q.side,"pageId":page,"dataUrl":format!("data:image/png;base64,{}",base64::engine::general_purpose::STANDARD.encode(bytes)),"readOnly":true,"checkedAt":knownext_core::now_iso()}),
        )
    }
    pub(crate) fn retire_ai_change(&self, p: &str, id: &str, body: Value) -> Result<Value, String> {
        #[derive(Deserialize)]
        #[serde(deny_unknown_fields)]
        struct Input {
            revision: String,
            acknowledge: bool,
        }
        let q: Input = serde_json::from_value(body).map_err(|_| "Retirada IA no válida")?;
        let (mut r, rev) = bound(self, p, id)?;
        if !q.acknowledge
            || rev != q.revision
            || r.phase == "applying"
            || r.receipts.iter().any(|x| x.phase == "applying")
        {
            return Err(
                "El cambio no está confirmado; consulta antes de retirar sus copias".into(),
            );
        }
        r.before_markdown.clear();
        r.after_markdown = None;
        for receipt in &mut r.receipts {
            receipt.before_markdown.clear();
        }
        r.phase = "retired".into();
        r.retired_at = Some(knownext_core::now_iso());
        let rev = store(self, &r, Some(&rev), false)?;
        Ok(public(&r, &rev))
    }
    pub(super) fn verify_ai_change_precondition(&self, p: &str, id: &str) -> Result<(), String> {
        let (r, _) = bound(self, p, id)?;
        if r.phase != "applying" {
            return Err("El cambio no tiene un intento pendiente propio".into());
        }
        if r.kind == "created" {
            if self.read_config_checked()?["ai"]["permissions"]["createDocuments"] != true {
                return Err("La creación IA está desactivada; se conserva el resultado".into());
            }
            let (_, relative) = document_ref(&r.document_id)?;
            let path = self.resolve_project_relative(p, &relative)?;
            match fs::symlink_metadata(path) {
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => (),
                _ => return Err("El destino de la creación cambió; consulta sin repetir".into()),
            }
            if self.read_draft(&r.document_id)?.is_some() {
                return Err("El destino conserva un borrador anterior; no se sustituye".into());
            }
        } else {
            edit_permission(self, &r.kind)?;
            let (_, disk, draft) = current(self, &r.document_id)?;
            if disk != r.disk_fingerprint || draft != r.draft_before {
                return Err(
                    "El archivo o borrador cambió al conservar las copias; consulta sin repetir"
                        .into(),
                );
            }
        }
        Ok(())
    }
    pub(super) fn begin_ai_created_change(
        &self,
        p: &str,
        relative: &str,
        markdown: &str,
        interaction: &str,
        operation: &str,
        summary: &str,
    ) -> Result<String, String> {
        let (root, hash) = root(self, p)?;
        let id = doc_id(p, relative);
        let path = self.resolve_project_relative(p, relative)?;
        if fs::symlink_metadata(&path).is_ok() {
            return Err("La creación ya tiene destino; no se registra otra aplicación".into());
        }
        let r = Record {
            schema_version: 1,
            id: knownext_core::compact_id("ai-change"),
            project_id: p.into(),
            document_id: id,
            root_hash: hash,
            interaction_id: interaction.into(),
            operation_id: operation.into(),
            summary: summary.into(),
            kind: "created".into(),
            created_at: knownext_core::now_iso(),
            phase: "applying".into(),
            disk_fingerprint: Value::Null,
            draft_before: None,
            head_before: optional_head(&root),
            before_markdown: String::new(),
            before_sha256: sha256_hex(b""),
            after_markdown: Some(markdown.into()),
            after_sha256: Some(sha256_hex(markdown.as_bytes())),
            after_draft_revision: None,
            reverted_hunks: vec![],
            receipts: vec![],
            retired_at: None,
        };
        store(self, &r, None, true)?;
        Ok(r.id)
    }
    pub(super) fn begin_ai_handwritten_change(
        &self,
        id: &str,
        before: Value,
        after: Value,
        interaction: &str,
        operation: &str,
        summary: &str,
        read_only: bool,
    ) -> Result<String, String> {
        if read_only {
            return Err("La petición es de solo lectura".into());
        }
        edit_permission(self, "handwritten")?;
        let (p, _) = document_ref(id)?;
        let (_, disk, draft) = current(self, id)?;
        let (root, hash) = root(self, &p)?;
        let before = canonical_note(before, id)?;
        let after = canonical_note(after, id)?;
        let r = Record {
            schema_version: 1,
            id: knownext_core::compact_id("ai-change"),
            project_id: p,
            document_id: id.into(),
            root_hash: hash,
            interaction_id: interaction.into(),
            operation_id: operation.into(),
            summary: summary.into(),
            kind: "handwritten".into(),
            created_at: knownext_core::now_iso(),
            phase: "applying".into(),
            disk_fingerprint: disk,
            draft_before: draft,
            head_before: optional_head(&root),
            before_sha256: sha256_hex(before.as_bytes()),
            before_markdown: before,
            after_sha256: Some(sha256_hex(after.as_bytes())),
            after_markdown: Some(after),
            after_draft_revision: None,
            reverted_hunks: vec![],
            receipts: vec![],
            retired_at: None,
        };
        store(self, &r, None, true)?;
        Ok(r.id)
    }
    pub(super) fn finish_ai_created_change(&self, p: &str, id: &str) -> Result<Value, String> {
        let (mut r, rev) = bound(self, p, id)?;
        let (text, _, draft) = current(self, &r.document_id)?;
        if !matches!(r.kind.as_str(), "created" | "handwritten")
            || r.phase != "applying"
            || Some(text.as_str()) != r.after_markdown.as_deref()
            || r.kind == "created" && draft.is_some()
        {
            return Err(
                "La creación no se pudo confirmar en su intento; consulta sin repetir".into(),
            );
        }
        r.phase = "applied".into();
        r.after_draft_revision = draft;
        let rev = store(self, &r, Some(&rev), false)?;
        Ok(public(&r, &rev))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture() -> (tempfile::TempDir, LocalApi, String, String, PathBuf) {
        let d = tempfile::tempdir().unwrap();
        let a = LocalApi::new(d.path().join("state"), "qa".into(), "test".into());
        let p = a
            .create_project(
                json!({"name":"AI provenance","versioningMode":"none","syncMode":"none"}),
            )
            .unwrap()["id"]
            .as_str()
            .unwrap()
            .to_owned();
        let root = a.project_root(&p).unwrap();
        let id = doc_id(&p, "a.md");
        fs::write(
            root.join("a.md"),
            "# Heading\n\nOriginal text\n\nContext one\nContext two\nContext three\n\nTail\n",
        )
        .unwrap();
        (d, a, p, id, root)
    }
    fn track(a: &LocalApi, id: &str, after: &str) -> Value {
        let (before, disk, draft) = current(a, id).unwrap();
        a.apply_tracked_ai_change(id,json!({"interactionId":"interaction-owned","operationId":"operation-owned","summary":"Cambio revisado","beforeMarkdown":before,"markdown":after,"expectedDraftWriteRevision":draft,"baseFingerprint":disk})).unwrap()["aiChange"].clone()
    }
    fn revert(a: &LocalApi, p: &str, id: &str, review: &Value) -> Value {
        a.apply_ai_reversion(p,id,json!({"reviewRevision":review["revision"],"selectedHunkIds":review["selectedHunkIds"],"acknowledge":true})).unwrap()
    }
    #[test]
    fn block5_ai_direct_reversion_is_a_new_draft_without_replacing_the_disk() {
        let (_d, a, p, id, root) = fixture();
        let before = fs::read_to_string(root.join("a.md")).unwrap();
        let after = before.replace("Original text", "AI text");
        let change = track(&a, &id, &after);
        let cid = change["id"].as_str().unwrap();
        let review = a.review_ai_reversion(&p, cid, json!({})).unwrap();
        assert_eq!(review["canRevert"], true);
        let done = revert(&a, &p, cid, &review);
        assert_eq!(done["phase"], "reverted");
        assert_eq!(current(&a, &id).unwrap().0, before);
        assert_eq!(fs::read_to_string(root.join("a.md")).unwrap(), before);
        assert!(a.apply_ai_reversion(&p,cid,json!({"reviewRevision":review["revision"],"selectedHunkIds":review["selectedHunkIds"],"acknowledge":true})).is_err());
    }
    #[test]
    fn block5_ai_selective_inverse_preserves_later_manual_changes() {
        let (_d, a, p, id, root) = fixture();
        let before = fs::read_to_string(root.join("a.md")).unwrap();
        let after = before.replace("Original text", "AI text");
        let change = track(&a, &id, &after);
        a.save_draft(
            &id,
            json!({"markdown":after.replace("Tail","Manual later tail")}),
        )
        .unwrap();
        let cid = change["id"].as_str().unwrap();
        let review = a.review_ai_reversion(&p, cid, json!({})).unwrap();
        assert_eq!(review["canRevert"], true);
        revert(&a, &p, cid, &review);
        assert_eq!(
            current(&a, &id).unwrap().0,
            before.replace("Tail", "Manual later tail")
        );
    }
    #[test]
    fn block5_ai_overlap_is_explicit_and_manual_resolution_requires_its_own_consent() {
        let (_d, a, p, id, root) = fixture();
        let before = fs::read_to_string(root.join("a.md")).unwrap();
        let after = before.replace("Original text", "AI text");
        let change = track(&a, &id, &after);
        a.save_draft(
            &id,
            json!({"markdown":after.replace("AI text","Manual rewrite")}),
        )
        .unwrap();
        let cid = change["id"].as_str().unwrap();
        let review = a.review_ai_reversion(&p, cid, json!({})).unwrap();
        assert_eq!(review["canRevert"], false);
        let resolved = before.replace("Original text", "Original text and manual agreement");
        let review = a
            .review_ai_reversion(
                &p,
                cid,
                json!({"selectedHunkIds":review["selectedHunkIds"],"resolvedMarkdown":resolved}),
            )
            .unwrap();
        assert_eq!(review["resolutionMode"], "manual");
        let mut request = json!({"reviewRevision":review["revision"],"selectedHunkIds":review["selectedHunkIds"],"resolvedMarkdown":resolved,"acknowledge":true});
        assert!(a.apply_ai_reversion(&p, cid, request.clone()).is_err());
        request["acknowledgeManualResolution"] = json!(true);
        a.apply_ai_reversion(&p, cid, request).unwrap();
        assert_eq!(current(&a, &id).unwrap().0, resolved);
        let (r, _) = load(&a, cid).unwrap();
        assert!(r.receipts[0].before_markdown.contains("Manual rewrite"));
    }
    #[test]
    fn block5_ai_prepare_pins_native_state_and_never_replays_an_application() {
        let (_d, a, p, id, root) = fixture();
        let (before, disk, draft) = current(&a, &id).unwrap();
        let prepared=a.prepare_ai_change(&id,json!({"interactionId":"interaction","operationId":"operation","summary":"QA","beforeMarkdown":before,"expectedDraftWriteRevision":draft,"baseFingerprint":disk})).unwrap();
        fs::write(root.join("a.md"), "New disk content").unwrap();
        assert!(a.apply_tracked_ai_change(&id,json!({"changeId":prepared["id"],"revision":prepared["revision"],"markdown":"AI text"})).is_err());
        assert_eq!(
            fs::read_to_string(root.join("a.md")).unwrap(),
            "New disk content"
        );
        let catalog = a.ai_change_catalog(&p).unwrap();
        assert_eq!(catalog["items"][0]["phase"], "prepared");
    }
    #[test]
    fn block5_ai_uncertain_receipts_do_not_confirm_by_text_or_mutate_when_read() {
        let (_d, a, p, id, root) = fixture();
        let before = fs::read_to_string(root.join("a.md")).unwrap();
        let change = track(&a, &id, &before.replace("Original text", "AI text"));
        let cid = change["id"].as_str().unwrap();
        let (mut record, rev) = load(&a, cid).unwrap();
        record.phase = "applying".into();
        store(&a, &record, Some(&rev), false).unwrap();
        let bytes = fs::read(path(&a, cid).unwrap()).unwrap();
        assert_eq!(a.ai_change_receipt(&p, cid).unwrap()["phase"], "uncertain");
        assert!(a.review_ai_reversion(&p, cid, json!({})).is_err());
        assert_eq!(fs::read(path(&a, cid).unwrap()).unwrap(), bytes);
        assert!(
            a.ai_change_receipt(&p, cid).unwrap()["copies"]["afterMarkdown"]
                .as_str()
                .unwrap()
                .contains("AI text")
        );
    }
    #[test]
    fn block5_ai_stale_review_and_future_journal_preserve_current_work() {
        let (_d, a, p, id, root) = fixture();
        let before = fs::read_to_string(root.join("a.md")).unwrap();
        let change = track(&a, &id, &before.replace("Original text", "AI text"));
        let cid = change["id"].as_str().unwrap();
        let reviewed = a.review_ai_reversion(&p, cid, json!({})).unwrap();
        a.save_draft(&id, json!({"markdown":"Brand new manual draft"}))
            .unwrap();
        assert!(a.apply_ai_reversion(&p,cid,json!({"reviewRevision":reviewed["revision"],"selectedHunkIds":reviewed["selectedHunkIds"],"acknowledge":true})).is_err());
        let file = path(&a, cid).unwrap();
        let mut value: Value = serde_json::from_slice(&fs::read(&file).unwrap()).unwrap();
        value["schemaVersion"] = json!(99);
        let future = serde_json::to_vec(&value).unwrap();
        fs::write(&file, &future).unwrap();
        assert!(a.ai_change_receipt(&p, cid).is_err());
        assert_eq!(fs::read(&file).unwrap(), future);
        assert_eq!(current(&a, &id).unwrap().0, "Brand new manual draft");
    }
    #[test]
    fn block5_ai_created_document_reverts_to_trash_only_while_intact() {
        let (_d, a, p, _id, root) = fixture();
        let change = a
            .begin_ai_created_change(
                &p,
                "created.md",
                "# Created",
                "interaction",
                "operation",
                "Creación",
            )
            .unwrap();
        atomic_io::create(&root.join("created.md"), b"# Created").unwrap();
        a.finish_ai_created_change(&p, &change).unwrap();
        let review = a.review_ai_reversion(&p, &change, json!({})).unwrap();
        assert_eq!(review["movesToTrash"], true);
        revert(&a, &p, &change, &review);
        assert!(!root.join("created.md").exists());
        assert_eq!(
            a.ai_change_receipt(&p, &change).unwrap()["phase"],
            "reverted"
        );
    }
    #[test]
    fn block5_ai_retirement_removes_payload_without_touching_document_or_identity() {
        let (_d, a, p, id, root) = fixture();
        let before = fs::read_to_string(root.join("a.md")).unwrap();
        let change = track(&a, &id, &before.replace("Original text", "AI text"));
        let cid = change["id"].as_str().unwrap();
        a.retire_ai_change(
            &p,
            cid,
            json!({"revision":change["revision"],"acknowledge":true}),
        )
        .unwrap();
        let (r, _) = load(&a, cid).unwrap();
        assert_eq!(r.phase, "retired");
        assert!(r.before_markdown.is_empty() && r.after_markdown.is_none());
        assert!(current(&a, &id).unwrap().0.contains("AI text"));
        assert_eq!(a.ai_change_catalog(&p).unwrap()["active"], 0);
        assert_eq!(
            a.ai_change_catalog(&p).unwrap()["items"]
                .as_array()
                .unwrap()
                .len(),
            1
        );
    }
    #[test]
    fn block5_ai_adjacent_manual_line_is_preserved_without_false_overlap() {
        let (_d, a, p, id, root) = fixture();
        let before = fs::read_to_string(root.join("a.md")).unwrap();
        let after = before.replace("Original text", "AI text");
        let change = track(&a, &id, &after);
        let later = after.replace(
            "AI text\n\nContext one",
            "AI text\nManual adjacent line\nContext one",
        );
        a.save_draft(&id, json!({"markdown":later})).unwrap();
        let cid = change["id"].as_str().unwrap();
        let review = a.review_ai_reversion(&p, cid, json!({})).unwrap();
        assert_eq!(review["canRevert"], true, "{review}");
        revert(&a, &p, cid, &review);
        assert!(current(&a, &id)
            .unwrap()
            .0
            .contains("Original text\nManual adjacent line"));
    }
    #[test]
    fn block5_ai_selected_blocks_can_be_reverted_in_separate_reviewed_rounds() {
        let (_d, a, p, id, root) = fixture();
        let before = fs::read_to_string(root.join("a.md")).unwrap();
        let after = before
            .replace("Original text", "AI text")
            .replace("Tail", "AI tail");
        let change = track(&a, &id, &after);
        let cid = change["id"].as_str().unwrap();
        let all = a.review_ai_reversion(&p, cid, json!({})).unwrap();
        assert_eq!(all["hunks"].as_array().unwrap().len(), 2);
        let first = all["hunks"][0]["id"].clone();
        let first = a
            .review_ai_reversion(&p, cid, json!({"selectedHunkIds":[first]}))
            .unwrap();
        assert_eq!(revert(&a, &p, cid, &first)["phase"], "partially-reverted");
        let next = a.review_ai_reversion(&p, cid, json!({})).unwrap();
        assert_eq!(next["selectedHunkIds"].as_array().unwrap().len(), 1);
        assert_eq!(revert(&a, &p, cid, &next)["phase"], "reverted");
        assert_eq!(current(&a, &id).unwrap().0, before);
    }
    #[test]
    fn block5_ai_permission_revocation_and_read_only_never_apply_or_gain_authority() {
        let (_d, a, _p, id, root) = fixture();
        let (before, disk, draft) = current(&a, &id).unwrap();
        let request = json!({"interactionId":"interaction","operationId":"operation","summary":"QA","beforeMarkdown":before,"expectedDraftWriteRevision":draft,"baseFingerprint":disk});
        let mut readonly = request.clone();
        readonly["readOnly"] = json!(true);
        assert!(a.prepare_ai_change(&id, readonly).is_err());
        let prepared = a.prepare_ai_change(&id, request).unwrap();
        a.update_ai_config(json!({"permissions":{"editDocuments":false}}))
            .unwrap();
        assert!(a.apply_tracked_ai_change(&id,json!({"changeId":prepared["id"],"revision":prepared["revision"],"markdown":"Not allowed"})).is_err());
        assert_eq!(fs::read_to_string(root.join("a.md")).unwrap(), before);
        assert!(a.read_draft(&id).unwrap().is_none());
    }
    fn note_fixture() -> (tempfile::TempDir, LocalApi, String, String, Value) {
        let (d, a, p, _id, _root) = fixture();
        a.update_ai_config(json!({"permissions":{"editHandwrittenNotes":true}}))
            .unwrap();
        a.create_handwritten_note(&p, json!({"name":"note.knote"}))
            .unwrap();
        let id = doc_id(&p, "note.knote");
        let mut note = a.get_handwritten_note(&id).unwrap()["content"].clone();
        note["pages"]
            .as_array_mut()
            .unwrap()
            .push(default_handwritten_page("page-2", "blank"));
        a.save_handwritten_note_draft(&id, json!({"content":note}))
            .unwrap();
        let text = current(&a, &id).unwrap().0;
        let note = serde_json::from_str(&text).unwrap();
        (d, a, p, id, note)
    }
    fn track_note(a: &LocalApi, id: &str, before: &Value, after: &Value) -> Value {
        let (_, disk, draft) = current(a, id).unwrap();
        a.apply_tracked_ai_change(id,json!({"interactionId":"note-interaction","operationId":"note-operation","summary":"Dibujo revisado","beforeMarkdown":serde_json::to_string(before).unwrap(),"markdown":serde_json::to_string(after).unwrap(),"expectedDraftWriteRevision":draft,"baseFingerprint":disk})).unwrap()["aiChange"].clone()
    }
    #[test]
    fn block5_ai_note_reversion_by_page_preserves_another_manually_edited_page() {
        let (_d, a, p, id, before) = note_fixture();
        let mut after = before.clone();
        after["pages"][0]["background"]["type"] = json!("grid");
        let change = track_note(&a, &id, &before, &after);
        let mut later = after.clone();
        later["pages"][1]["background"]["type"] = json!("dots");
        a.save_handwritten_note_draft(&id, json!({"content":later}))
            .unwrap();
        let cid = change["id"].as_str().unwrap();
        let review = a.review_ai_reversion(&p, cid, json!({})).unwrap();
        assert_eq!(review["kind"], "handwritten");
        assert_eq!(review["canRevert"], true);
        revert(&a, &p, cid, &review);
        let now: Value = serde_json::from_str(&current(&a, &id).unwrap().0).unwrap();
        assert_eq!(now["pages"][0]["background"]["type"], "blank");
        assert_eq!(now["pages"][1]["background"]["type"], "dots");
    }
    #[test]
    fn block5_ai_note_overlap_conflicts_and_page_preview_is_bound_and_read_only() {
        let (_d, a, p, id, before) = note_fixture();
        let mut after = before.clone();
        after["pages"][0]["background"]["type"] = json!("grid");
        let change = track_note(&a, &id, &before, &after);
        let cid = change["id"].as_str().unwrap();
        let page = before["pages"][0]["id"].as_str().unwrap();
        let preview = a
            .ai_change_page_preview(
                &p,
                cid,
                json!({"revision":change["revision"],"side":"after","pageId":page}),
            )
            .unwrap();
        assert_eq!(preview["readOnly"], true);
        assert!(preview["dataUrl"]
            .as_str()
            .unwrap()
            .starts_with("data:image/png;base64,"));
        let mut later = after.clone();
        later["pages"][0]["background"]["type"] = json!("ruled");
        a.save_handwritten_note_draft(&id, json!({"content":later}))
            .unwrap();
        let reviewed = a.review_ai_reversion(&p, cid, json!({})).unwrap();
        assert_eq!(reviewed["canRevert"], false);
        assert_eq!(
            current(&a, &id).unwrap().0,
            canonical_note(later, &id).unwrap()
        );
        assert!(a
            .ai_change_page_preview(
                &p,
                cid,
                json!({"revision":"0".repeat(64),"side":"after","pageId":page})
            )
            .is_err());
    }
    #[test]
    fn block5_ai_native_note_capture_precedes_write_and_retirement_keeps_hashes() {
        let (_d, a, p, id, before) = note_fixture();
        let mut after = before.clone();
        after["pages"][0]["background"]["type"] = json!("grid");
        let cid = a
            .begin_ai_handwritten_change(
                &id,
                before.clone(),
                after.clone(),
                "interaction",
                "operation",
                "Native drawing",
                false,
            )
            .unwrap();
        assert_eq!(a.ai_change_receipt(&p, &cid).unwrap()["phase"], "uncertain");
        a.save_handwritten_note_draft(&id, json!({"content":after}))
            .unwrap();
        let done = a.finish_ai_created_change(&p, &cid).unwrap();
        a.retire_ai_change(
            &p,
            &cid,
            json!({"revision":done["revision"],"acknowledge":true}),
        )
        .unwrap();
        let (retired, _) = load(&a, &cid).unwrap();
        assert_eq!(
            retired.before_sha256,
            sha256_hex(canonical_note(before, &id).unwrap().as_bytes())
        );
        assert!(retired.after_sha256.is_some());
        assert!(retired.after_markdown.is_none());
    }
    #[test]
    fn block5_ai_duplicated_context_is_not_attributed_after_a_later_edit() {
        let (_d, a, p, id, root) = fixture();
        let chunk = "# Repeated\n\nOriginal text\n\nSame context\nSame padding\n\n";
        let before = format!("{chunk}{chunk}Tail\n");
        fs::write(root.join("a.md"), &before).unwrap();
        let after = before.replace("Original text", "AI text");
        let change = track(&a, &id, &after);
        let later = after.replace("Tail", "Manual tail");
        a.save_draft(&id, json!({"markdown":later})).unwrap();
        let review = a
            .review_ai_reversion(&p, change["id"].as_str().unwrap(), json!({}))
            .unwrap();
        assert_eq!(review["canRevert"], false);
        assert!(review["hunks"]
            .as_array()
            .unwrap()
            .iter()
            .any(|h| h["status"] == "conflict"));
        assert_eq!(current(&a, &id).unwrap().0, later);
    }
    #[test]
    fn block5_ai_effect_gate_rechecks_source_after_journal_copies() {
        let (_d, a, p, id, root) = fixture();
        let (before, disk, draft) = current(&a, &id).unwrap();
        let prepared = a.prepare_ai_change(&id,json!({"interactionId":"capture","operationId":"effect","summary":"Pinned source","beforeMarkdown":before,"expectedDraftWriteRevision":draft,"baseFingerprint":disk})).unwrap();
        let cid = prepared["id"].as_str().unwrap();
        let (mut record, rev) = load(&a, cid).unwrap();
        record.phase = "applying".into();
        record.after_markdown = Some("AI proposal".into());
        record.after_sha256 = Some(sha256_hex(b"AI proposal"));
        store(&a, &record, Some(&rev), false).unwrap();
        a.verify_ai_change_precondition(&p, cid).unwrap();
        let proof = current_source_proof(&a, &p, &id).unwrap();
        a.save_draft(
            &id,
            json!({"markdown":"Manual change during journal write"}),
        )
        .unwrap();
        assert!(a.verify_ai_change_precondition(&p, cid).is_err());
        assert_ne!(proof, current_source_proof(&a, &p, &id).unwrap());
        assert_eq!(a.ai_change_receipt(&p, cid).unwrap()["phase"], "uncertain");
        assert_eq!(
            current(&a, &id).unwrap().0,
            "Manual change during journal write"
        );
        let created = a
            .begin_ai_created_change(&p, "new.md", "Generated", "capture", "create", "New file")
            .unwrap();
        a.verify_ai_change_precondition(&p, &created).unwrap();
        fs::write(root.join("new.md"), "External file").unwrap();
        assert!(a.verify_ai_change_precondition(&p, &created).is_err());
        assert_eq!(
            fs::read_to_string(root.join("new.md")).unwrap(),
            "External file"
        );
        assert_eq!(
            a.ai_change_receipt(&p, &created).unwrap()["copies"]["afterMarkdown"],
            "Generated"
        );
    }
}
