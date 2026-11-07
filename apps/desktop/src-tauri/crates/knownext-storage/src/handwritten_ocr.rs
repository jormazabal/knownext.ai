//! Explicit page recognition. Provider waits hold no project transaction; receipts never replay.
use super::*;
use std::{fs, io::Read};
const MAX_RECORD: u64 = 8 * 1024 * 1024;
const MAX_TOTAL: u64 = 64 * 1024 * 1024;
const MAX_IDS: usize = 64;
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Record {
    schema_version: u8,
    id: String,
    project_id: String,
    note_id: String,
    page_id: String,
    root_hash: String,
    disk_sha: String,
    page_sha: String,
    base_text: String,
    png: String,
    phase: String,
    text: Option<String>,
    corrected_text: Option<String>,
    message: String,
    model: String,
    created_at: String,
    applied_draft_revision: Option<String>,
}
fn dir(api: &LocalApi) -> Result<PathBuf, String> {
    let base = api.app_data_dir.join("handwritten-ocr");
    for path in [&api.app_data_dir, &base] {
        match fs::symlink_metadata(path) {
            Ok(m) if m.is_dir() && !batch::linked(&m) => (),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => (),
            _ => return Err("El almacén OCR no es regular; se conserva".into()),
        }
    }
    Ok(base)
}
fn valid_id(id: &str) -> bool {
    id.starts_with("handwritten-ocr-") && request_scope::portable_id(id)
}
fn path(api: &LocalApi, id: &str) -> Result<PathBuf, String> {
    if !valid_id(id) {
        return Err("Identidad OCR no válida".into());
    }
    Ok(dir(api)?.join(format!("{id}.json")))
}
fn ids(api: &LocalApi) -> Result<Vec<String>, String> {
    let d = dir(api)?;
    if !d.exists() {
        return Ok(vec![]);
    }
    let mut list = vec![];
    for entry in fs::read_dir(d).map_err(|_| "No se puede consultar OCR")? {
        let entry = entry.map_err(|_| "No se puede consultar OCR")?;
        let name = entry.file_name().to_string_lossy().to_string();
        if matches!(
            name.as_str(),
            "owner.lock" | "runtime-owner.lock" | "capture.lock"
        ) {
            continue;
        }
        let id = name
            .strip_suffix(".json")
            .filter(|s| valid_id(s))
            .ok_or("Almacén OCR desconocido; no se omite ni elimina")?;
        let m = fs::symlink_metadata(entry.path()).map_err(|_| "Registro OCR no disponible")?;
        if !m.is_file() || batch::linked(&m) || m.len() > MAX_RECORD {
            return Err("Registro OCR no regular o fuera de límite; se conserva".into());
        }
        list.push(id.to_owned());
        if list.len() > MAX_IDS {
            return Err("El catálogo OCR supera64identidades; se conserva".into());
        }
    }
    Ok(list)
}
fn read(api: &LocalApi, id: &str) -> Result<(Record, String), String> {
    let p = path(api, id)?;
    let m = fs::symlink_metadata(&p).map_err(|_| "Intento OCR no disponible")?;
    if !m.is_file() || batch::linked(&m) || m.len() > MAX_RECORD {
        return Err("Intento OCR no regular; se conserva".into());
    }
    let mut raw = vec![];
    fs::File::open(&p)
        .map_err(|_| "No se pudo consultar OCR")?
        .take(MAX_RECORD + 1)
        .read_to_end(&mut raw)
        .map_err(|_| "Lectura OCR incompleta")?;
    if raw.len() as u64 > MAX_RECORD {
        return Err("Registro OCR fuera de límite".into());
    }
    let r: Record =
        serde_json::from_slice(&raw).map_err(|_| "Formato OCR desconocido; se conserva")?;
    validate(&r, id)?;
    Ok((r, sha256_hex(&raw)))
}
fn validate(r: &Record, id: &str) -> Result<(), String> {
    if r.schema_version != 1
        || r.id != id
        || !valid_id(id)
        || document_ref(&r.note_id)?.0 != r.project_id
        || !is_handwritten_note_path(Path::new(&document_ref(&r.note_id)?.1))
        || r.page_id.is_empty()
        || r.page_id.len() > 200
        || [&r.root_hash, &r.disk_sha, &r.page_sha]
            .iter()
            .any(|s| s.len() != 64 || !s.bytes().all(|c| c.is_ascii_hexdigit()))
        || !matches!(
            r.phase.as_str(),
            "started" | "ready" | "unavailable" | "failed" | "uncertain" | "applying" | "applied"
        )
        || r.text
            .as_ref()
            .is_some_and(|s| s.chars().count() > 64_000 || s.len() > 256 * 1024)
        || r.base_text.chars().count() > 64_000
        || r.png.len() > 6 * 1024 * 1024
        || r.phase == "ready" && r.text.is_none()
    {
        return Err("Contrato OCR incoherente; se conserva sin ejecutar".into());
    }
    Ok(())
}
fn write(api: &LocalApi, r: &Record, expected: Option<&str>) -> Result<String, String> {
    validate(r, &r.id)?;
    let raw = serde_json::to_vec(r).map_err(|_| "Registro OCR no representable")?;
    if raw.len() as u64 > MAX_RECORD {
        return Err("Registro OCR supera8MiB; fuentes conservadas".into());
    }
    let mut total = raw.len() as u64;
    let list = ids(api)?;
    if expected.is_none() && list.len() >= MAX_IDS {
        return Err("OCR alcanza64intentos; no se eliminan propuestas automáticamente".into());
    }
    for id in list.iter().filter(|id| *id != &r.id) {
        let (record, _) = read(api, id)?;
        total = total.saturating_add(
            serde_json::to_vec(&record)
                .map_err(|_| "Registro OCR no compatible")?
                .len() as u64,
        );
    }
    if total > MAX_TOTAL {
        return Err("El almacén OCR alcanza64MiB; no se borran originales".into());
    }
    let previous = if let Some(expected) = expected {
        let (old, revision) = read(api, &r.id)?;
        if revision != expected {
            return Err("El intento OCR cambió; consulta sin repetir".into());
        }
        serde_json::to_vec(&old)
            .map_err(|_| "OCR no representable")?
            .len() as u64
    } else {
        0
    };
    let _budget = if expected.is_none() {
        Some(recovery_inventory::admit(
            api,
            (raw.len() as u64).saturating_sub(previous) + 4096,
        )?)
    } else {
        None
    };
    let d = dir(api)?;
    if !d.exists() {
        fs::create_dir(&d).map_err(|_| "No se pudo conservar la propuesta OCR")?;
    }
    if expected.is_none() {
        atomic_io::create(&path(api, &r.id)?, &raw)
    } else {
        atomic_io::write(&path(api, &r.id)?, &raw)
    }
    .map_err(|_| "Acuse OCR no confirmado; consulta sin reenviar")?;
    Ok(sha256_hex(&raw))
}
fn root_hash(api: &LocalApi, project: &str) -> Result<String, String> {
    let root = api
        .project_root(project)?
        .canonicalize()
        .map_err(|_| "Proyecto no disponible")?;
    Ok(sha256_hex(root.to_string_lossy().as_bytes()))
}
fn source(
    api: &LocalApi,
    note: &str,
    page: &str,
) -> Result<(Value, String, String, String), String> {
    let path = api.resolve_handwritten_path(note)?;
    let (_, raw) =
        document_validation::handwritten_source(&path)?.ok_or("Nota fuente no disponible")?;
    if raw.len() > 2 * 1024 * 1024 {
        return Err("La nota supera2MiB; los trazos se conservan".into());
    }
    let record = api.get_handwritten_note(note)?;
    if record["orphaned"] == true
        || record["diskChanged"] == true
        || record["baseVerified"] == false
    {
        return Err("La nota tiene cambios de base; revísalos antes de reconocer".into());
    }
    let content = &record["content"];
    document_validation::handwritten(content)?;
    if serde_json::to_vec(content)
        .map_err(|_| "Nota no compatible")?
        .len()
        > 2 * 1024 * 1024
    {
        return Err("El borrador supera2MiB; se conserva".into());
    }
    let pages = content["pages"].as_array().ok_or("Nota sin páginas")?;
    let found = pages.iter().filter(|p| p["id"] == page).collect::<Vec<_>>();
    if found.len() != 1 {
        return Err("La página ya no está disponible".into());
    }
    let page_sha = sha256_hex(&serde_json::to_vec(found[0]).map_err(|_| "Página no compatible")?);
    let text = content["ocr"]["textByPage"][page]
        .as_str()
        .unwrap_or("")
        .to_owned();
    Ok((record, sha256_hex(&raw), page_sha, text))
}
fn public(r: &Record, revision: &str, payload: bool) -> Value {
    let phase = if matches!(r.phase.as_str(), "started" | "applying") {
        "uncertain"
    } else {
        &r.phase
    };
    let mut v = json!({"schemaVersion":1,"attemptId":r.id,"projectId":r.project_id,"noteId":r.note_id,"pageId":r.page_id,"revision":revision,"pageSha256":r.page_sha,"phase":phase,"message":r.message,"model":r.model,"createdAt":r.created_at,"startsAi":false,"preservesStrokes":true,"canReplay":false,"appliedDraftWriteRevision":r.applied_draft_revision});
    if payload {
        v["sourceDataUrl"] = json!(format!("data:image/png;base64,{}", r.png));
        v["text"] = json!(r.text);
        v["baseText"] = json!(r.base_text);
        v["correctedText"] = json!(r.corrected_text);
    }
    v
}
fn permission(api: &LocalApi) -> Result<Value, String> {
    let config = api.read_config_checked()?;
    if config["ai"]["vision"]["enabled"] != true
        || config["ai"]["permissions"]["editHandwrittenNotes"] != true
    {
        return Err("Activa visión y edición de notas en Ajustes IA antes de reconocer. Los trazos permanecen.".into());
    }
    Ok(config)
}
impl LocalApi {
    pub(crate) fn handwritten_ocr_catalog(&self, project: &str) -> Result<Value, String> {
        self.project_root(project)?;
        let mut items = vec![];
        for id in ids(self)? {
            let (r, rev) = read(self, &id)?;
            if r.project_id == project {
                items.push(public(&r, &rev, false))
            }
        }
        items.sort_by(|a, b| b["createdAt"].as_str().cmp(&a["createdAt"].as_str()));
        Ok(
            json!({"schemaVersion":1,"projectId":project,"items":items,"maxRecords":MAX_IDS,"maxBytes":MAX_TOTAL,"checkedAt":knownext_core::now_iso(),"canReplay":false}),
        )
    }
    pub(crate) fn handwritten_note_ocr_catalog(&self, note: &str) -> Result<Value, String> {
        let (project, _) = document_ref(note)?;
        let mut value = self.handwritten_ocr_catalog(&project)?;
        value["noteId"] = json!(note);
        value["items"] = json!(value["items"]
            .as_array()
            .unwrap()
            .iter()
            .filter(|r| r["noteId"] == note)
            .cloned()
            .collect::<Vec<_>>());
        Ok(value)
    }
    pub(crate) fn handwritten_ocr_receipt(&self, note: &str, id: &str) -> Result<Value, String> {
        let (r, revision) = read(self, id)?;
        if r.note_id != note {
            return Err("El intento OCR pertenece a otra nota".into());
        }
        self.project_root(&r.project_id)?;
        Ok(public(&r, &revision, true))
    }
    pub(crate) fn recognize_handwritten_page(
        &self,
        note: &str,
        body: Value,
    ) -> Result<Value, String> {
        self.recognize_handwritten_page_with(
            note,
            body,
            knownext_ai::handwritten_ocr::recognize_page,
        )
    }
    fn recognize_handwritten_page_with(
        &self,
        note: &str,
        body: Value,
        recognize: impl FnOnce(Option<&str>, &str, &str) -> Value,
    ) -> Result<Value, String> {
        #[derive(Deserialize)]
        #[serde(rename_all = "camelCase", deny_unknown_fields)]
        struct Input {
            attempt_id: String,
            page_id: String,
            acknowledge_remote: bool,
        }
        let q: Input = serde_json::from_value(body).map_err(|_| "Reconocimiento no válido")?;
        if !q.acknowledge_remote || !valid_id(&q.attempt_id) {
            return Err("Confirma el envío remoto de una sola página".into());
        }
        let (project, _) = document_ref(note)?;
        let _activity = self.private_work()?;
        let (mut r, mut revision, key) = {
            let _permit = self.project_transaction(&project)?;
            let config = permission(self)?;
            self.spend_preflight(Some(&project))?;
            let (record, disk_sha, page_sha, base_text) = source(self, note, &q.page_id)?;
            let (_, png) =
                knownext_docs::handwritten_note_png(&record["content"], Some(&q.page_id), 0.8)?;
            if png.len() > 4 * 1024 * 1024 {
                return Err("La imagen de página supera4MiB; no se envía".into());
            }
            let model = config["ai"]["vision"]["model"]
                .as_str()
                .ok_or("Falta modelo de visión")?
                .to_owned();
            knownext_core::model_catalog::validate(&model, "vision")?;
            let r = Record {
                schema_version: 1,
                id: q.attempt_id,
                project_id: project.clone(),
                note_id: note.into(),
                page_id: q.page_id,
                root_hash: root_hash(self, &project)?,
                disk_sha,
                page_sha,
                base_text,
                png: base64::engine::general_purpose::STANDARD.encode(png),
                phase: "started".into(),
                text: None,
                corrected_text: None,
                message: "Envío iniciado. Si se pierde el acuse, consulta sin repetir.".into(),
                model,
                created_at: knownext_core::now_iso(),
                applied_draft_revision: None,
            };
            let revision = write(self, &r, None)?;
            (r, revision, self.openai_key())
        };
        // No project lock is held while the provider waits. The immutable PNG is the only source sent.
        permission(self)?;
        self.spend_preflight(Some(&project))?;
        let outcome = recognize(key.as_deref(), &r.model, &r.png);
        // This writer alone owns the started attempt; retain output even if the project is now busy.
        if let Some(text) = outcome["text"]
            .as_str()
            .filter(|s| s.chars().count() <= 64_000 && s.len() <= 256 * 1024)
        {
            if outcome["status"] == "ready" {
                r.text = Some(text.into());
                r.phase = "ready".into();
                r.message="Propuesta OCR conservada. Revisa y corrige antes de aplicar; los trazos no han cambiado.".into();
            }
        }
        if r.phase == "started" {
            r.phase = match outcome["status"].as_str() {
                Some("unavailable") => "unavailable",
                Some("failed") => "failed",
                _ => "uncertain",
            }
            .into();
            r.message = outcome["message"]
                .as_str()
                .unwrap_or("No se confirmó el reconocimiento. Consulta sin repetir.")
                .into();
        }
        if outcome["usage"].is_object() {
            if let Err(e) = self.record_ai_usage_records(
                &project,
                &r.id,
                &json!({"usageRecords":[outcome["usage"].clone()]}),
            ) {
                r.message
                    .push_str(&format!(" Aviso de registro de consumo: {e}"));
            }
        } else if key.is_some() && r.phase != "unavailable" {
            if let Err(e)=self.record_ai_usage(json!({"projectId":project,"interactionId":r.id,"capability":"handwritten_ocr","model":r.model,"usageSource":"unknown","estimatedCost":0})){r.message.push_str(&format!(" Aviso de registro de consumo: {e}"));}
        }
        revision = write(self, &r, Some(&revision))?;
        Ok(public(&r, &revision, true))
    }
    pub(crate) fn apply_handwritten_ocr(
        &self,
        note: &str,
        id: &str,
        body: Value,
    ) -> Result<Value, String> {
        #[derive(Deserialize)]
        #[serde(deny_unknown_fields)]
        struct Input {
            revision: String,
            text: String,
            acknowledge: bool,
        }
        let q: Input = serde_json::from_value(body).map_err(|_| "Aplicación OCR no válida")?;
        if !q.acknowledge || q.text.chars().count() > 64_000 || q.text.len() > 256 * 1024 {
            return Err("Revisa el texto completo de hasta64.000caracteres".into());
        }
        let (project, _) = document_ref(note)?;
        let _permit = self.project_transaction(&project)?;
        let (mut r, revision) = read(self, id)?;
        if r.note_id != note || revision != q.revision || r.phase != "ready" || r.text.is_none() {
            return Err(
                "La propuesta OCR cambió o ya tiene un intento; consulta sin repetir".into(),
            );
        }
        let config = self.read_config_checked()?;
        if config["ai"]["permissions"]["editHandwrittenNotes"] != true {
            return Err("La edición de notas está desactivada; la propuesta permanece".into());
        }
        let (record, disk, page, base) = source(self, note, &r.page_id)?;
        if root_hash(self, &project)? != r.root_hash
            || disk != r.disk_sha
            || page != r.page_sha
            || base != r.base_text
        {
            return Err("La página o su texto cambió después del reconocimiento. La propuesta y los trazos permanecen; combina el texto manualmente.".into());
        }
        let previous = self.draft_write_revision(note)?;
        let mut next = record["content"].clone();
        next["ocr"]["textByPage"][&r.page_id] = json!(q.text);
        next["ocr"]["status"] = json!("updated");
        next["ocr"]["updatedAt"] = json!(knownext_core::now_iso());
        next["updatedAt"] = json!(knownext_core::now_iso());
        let total = next["ocr"]["textByPage"]
            .as_object()
            .ok_or("OCR no compatible")?
            .values()
            .map(|v| v.as_str().map(str::len).ok_or("Texto OCR no compatible"))
            .collect::<Result<Vec<_>, _>>()?
            .iter()
            .sum::<usize>();
        if total > 512 * 1024 {
            return Err(
                "La nota alcanza512KiB de texto reconocido; se conservan los trazos".into(),
            );
        }
        document_validation::handwritten(&next)?;
        r.phase = "applying".into();
        r.corrected_text = Some(q.text);
        r.message = "Aplicación iniciada; consulta el acuse antes de repetir.".into();
        let started = write(self, &r, Some(&revision))?;
        let (_, disk2, page2, base2) = source(self, note, &r.page_id)?;
        if disk2 != disk
            || page2 != page
            || base2 != base
            || self.draft_write_revision(note)? != previous
            || root_hash(self, &project)? != r.root_hash
        {
            return Err("La fuente cambió antes de escribir; intento conservado sin replay".into());
        }
        let mut ack=self.save_handwritten_note_draft(note,json!({"content":next,"baseFingerprint":record["baseFingerprint"],"expectedDraftWriteRevision":previous}))?;
        r.phase = "applied".into();
        r.applied_draft_revision = ack["draftWriteRevision"].as_str().map(str::to_owned);
        r.message="Texto revisado aplicado al borrador. Guarda la nota para incluirlo en la búsqueda; trazos y original conservados.".into();
        let revision = write(self, &r, Some(&started))?;
        ack["schemaVersion"] = json!(1);
        ack["attemptId"] = json!(r.id);
        ack["pageId"] = json!(r.page_id);
        ack["content"] = next;
        ack["previousDraftWriteRevision"] = json!(previous);
        ack["receipt"] = public(&r, &revision, true);
        Ok(ack)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture() -> (tempfile::TempDir, LocalApi, String, String, PathBuf) {
        let d = tempfile::tempdir().unwrap();
        let a = LocalApi::new(d.path().join("state"), "qa".into(), "ocr".into());
        let p = a
            .handle(
                "POST",
                "/api/projects",
                json!({"name":"OCR QA","versioningMode":"none","syncMode":"none"}),
                vec![],
            )
            .unwrap()
            .body;
        let id = p["id"].as_str().unwrap().to_owned();
        let root = PathBuf::from(p["folderPath"].as_str().unwrap());
        let note = format!("{id}::note.knote");
        let mut content = default_handwritten_note(&note, "Source");
        content["pages"]
            .as_array_mut()
            .unwrap()
            .push(default_handwritten_page("page-2", "grid"));
        fs::write(
            root.join("note.knote"),
            serde_json::to_vec(&content).unwrap(),
        )
        .unwrap();
        (d, a, id, note, root)
    }
    fn recognize(a: &LocalApi, note: &str, id: &str) -> Value {
        a.recognize_handwritten_page_with(
            note,
            json!({"pageId":"page-1","attemptId":id,"acknowledgeRemote":true}),
            |_, _, image| {
                assert!(!image.is_empty());
                json!({"status":"ready","text":"Texto [ilegible]"})
            },
        )
        .unwrap()
    }
    #[test]
    fn block6_ocr_review_apply_only_text_preserves_other_page_draft_and_source() {
        let (_d, a, _p, note, root) = fixture();
        let bytes = fs::read(root.join("note.knote")).unwrap();
        let before = a.get_handwritten_note(&note).unwrap();
        let result = recognize(&a, &note, "handwritten-ocr-owned");
        assert_eq!(a.get_handwritten_note(&note).unwrap()["hasDraft"], false);
        let mut manual = before["content"].clone();
        manual["ocr"]["textByPage"]["page-2"] = json!("Texto manual posterior");
        a.save_handwritten_note_draft(&note,json!({"content":manual,"baseFingerprint":before["baseFingerprint"],"expectedDraftWriteRevision":null})).unwrap();
        let done = a
            .apply_handwritten_ocr(
                &note,
                "handwritten-ocr-owned",
                json!({"revision":result["revision"],"text":"Texto corregido","acknowledge":true}),
            )
            .unwrap();
        assert_eq!(
            done["content"]["ocr"]["textByPage"]["page-2"],
            "Texto manual posterior"
        );
        assert_eq!(
            done["content"]["ocr"]["textByPage"]["page-1"],
            "Texto corregido"
        );
        assert_eq!(done["content"]["pages"], before["content"]["pages"]);
        assert_eq!(done["receipt"]["phase"], "applied");
        assert_eq!(fs::read(root.join("note.knote")).unwrap(), bytes);
        assert!(a
            .apply_handwritten_ocr(
                &note,
                "handwritten-ocr-owned",
                json!({"revision":result["revision"],"text":"Replay","acknowledge":true})
            )
            .is_err());
    }
    #[test]
    fn block6_ocr_page_or_text_changed_during_review_never_overwrites() {
        for change_page in [false, true] {
            let (_d, a, _p, note, _root) = fixture();
            let result = recognize(&a, &note, "handwritten-ocr-conflict");
            let before = a.get_handwritten_note(&note).unwrap();
            let mut content = before["content"].clone();
            if change_page {
                content["pages"][0]["title"] = json!("Nueva página manual");
            } else {
                content["ocr"]["textByPage"]["page-1"] = json!("Corrección manual posterior");
            }
            a.save_handwritten_note_draft(&note,json!({"content":content,"baseFingerprint":before["baseFingerprint"],"expectedDraftWriteRevision":null})).unwrap();
            let draft = a.read_draft(&note).unwrap();
            assert!(a
                .apply_handwritten_ocr(
                    &note,
                    "handwritten-ocr-conflict",
                    json!({"revision":result["revision"],"text":"No debe ganar","acknowledge":true})
                )
                .is_err());
            assert_eq!(a.read_draft(&note).unwrap(), draft);
        }
    }
    #[test]
    fn block6_ocr_provider_attempt_is_durable_and_reopening_never_replays() {
        let (_d, a, p, note, _root) = fixture();
        let result = recognize(&a, &note, "handwritten-ocr-once");
        assert!(a.recognize_handwritten_page_with(&note,json!({"pageId":"page-1","attemptId":"handwritten-ocr-once","acknowledgeRemote":true}),|_,_,_|panic!("provider replay")).is_err());
        assert_eq!(
            a.handwritten_ocr_receipt(&note, "handwritten-ocr-once")
                .unwrap(),
            result
        );
        assert_eq!(
            a.handwritten_ocr_catalog(&p).unwrap()["items"]
                .as_array()
                .unwrap()
                .len(),
            1
        );
        assert!(a
            .handwritten_ocr_receipt(&format!("{p}::other.knote"), "handwritten-ocr-once")
            .is_err());
    }
    #[test]
    fn block6_ocr_no_permission_or_consent_never_calls_provider() {
        let (_d, a, _p, note, _root) = fixture();
        assert!(a.recognize_handwritten_page_with(&note,json!({"pageId":"page-1","attemptId":"handwritten-ocr-no","acknowledgeRemote":false}),|_,_,_|panic!("not consented")).is_err());
        a.update_ai_config(json!({"vision":{"enabled":false}}))
            .unwrap();
        assert!(a.recognize_handwritten_page_with(&note,json!({"pageId":"page-1","attemptId":"handwritten-ocr-no","acknowledgeRemote":true}),|_,_,_|panic!("permission blocked")).is_err());
        assert!(ids(&a).unwrap().is_empty());
    }
    #[test]
    fn block6_ocr_unknown_records_and_occupied_identity_are_preserved() {
        let (_d, a, p, note, _root) = fixture();
        let d = dir(&a).unwrap();
        fs::create_dir(&d).unwrap();
        let raw = br#"{"schemaVersion":99,"future":"preserve"}"#;
        fs::write(d.join("handwritten-ocr-future.json"), raw).unwrap();
        assert!(a.handwritten_ocr_catalog(&p).is_err());
        assert!(a.recognize_handwritten_page_with(&note,json!({"pageId":"page-1","attemptId":"handwritten-ocr-new","acknowledgeRemote":true}),|_,_,_|panic!("unknown store")).is_err());
        assert_eq!(
            fs::read(d.join("handwritten-ocr-future.json")).unwrap(),
            raw
        );
    }
}
