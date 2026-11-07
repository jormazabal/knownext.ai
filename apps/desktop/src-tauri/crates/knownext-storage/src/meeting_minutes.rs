//! Human-reviewed minutes from retained native recording sources. No provider or task execution.
use super::*;
use std::{collections::HashSet, fs, io::Read};
const MAX_RECORD: u64 = 8 * 1024 * 1024;
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Entry {
    text: String,
    source_ids: Vec<String>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Action {
    text: String,
    owner: Option<String>,
    due_date: Option<String>,
    source_ids: Vec<String>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Draft {
    title: String,
    name: String,
    summary: String,
    decisions: Vec<Entry>,
    actions: Vec<Action>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Request {
    session_id: String,
    draft: Option<Draft>,
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Receipt {
    schema_version: u8,
    id: String,
    project_id: String,
    session_id: String,
    revision: String,
    root_hash: String,
    source: Value,
    markdown: String,
    document_id: String,
    phase: String,
    checked_at: String,
}
fn regular(path: &Path, max: u64) -> Result<Vec<u8>, String> {
    let m = fs::symlink_metadata(path).map_err(|_| "Archivo no accesible")?;
    if !m.is_file() || batch::linked(&m) || m.len() > max {
        return Err("Archivo no regular o fuera de límite; se conserva".into());
    }
    let mut b = vec![];
    fs::File::open(path)
        .map_err(|_| "Archivo no accesible")?
        .take(max + 1)
        .read_to_end(&mut b)
        .map_err(|_| "Lectura incompleta")?;
    if b.len() as u64 != m.len() {
        return Err("La fuente cambió durante la lectura".into());
    }
    Ok(b)
}
fn directory(api: &LocalApi, p: &str) -> Result<PathBuf, String> {
    api.project_root(p)?;
    let base = api.app_data_dir.join("meeting-minutes");
    let dir = base.join(sha256_hex(p.as_bytes()));
    for path in [&api.app_data_dir, &base, &dir] {
        match fs::symlink_metadata(path) {
            Ok(m) if m.is_dir() && !batch::linked(&m) => (),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => (),
            _ => return Err("Almacén de actas no regular; se conserva".into()),
        }
    }
    Ok(dir)
}
fn root_hash(api: &LocalApi, p: &str) -> Result<String, String> {
    Ok(sha256_hex(
        api.project_root(p)?
            .canonicalize()
            .map_err(|_| "Proyecto no disponible")?
            .to_string_lossy()
            .as_bytes(),
    ))
}
fn record_path(api: &LocalApi, p: &str, id: &str) -> Result<PathBuf, String> {
    if !id.starts_with("minutes-") || !request_scope::portable_id(id) {
        return Err("Identidad de acta no válida".into());
    }
    Ok(directory(api, p)?.join(format!("{id}.json")))
}
fn recording_source(api: &LocalApi, p: &str, id: &str) -> Result<Value, String> {
    let recording_root = api.app_data_dir.join(if cfg!(debug_assertions) {
        "recordings-dev"
    } else {
        "recordings"
    });
    let value = knownext_recording::transcript_source(&recording_root, id)?;
    if value["projectId"].as_str() != Some(p) {
        return Err("La grabación pertenece a otro proyecto o no tiene destino".into());
    }
    if matches!(
        value["status"].as_str(),
        Some("recording" | "paused" | "queued" | "transcribing")
    ) {
        return Err(
            "Espera a que la sesión deje de capturar o transcribir; las fuentes permanecen".into(),
        );
    }
    let segments = value["segments"]
        .as_array()
        .ok_or("Fuente de transcripción no compatible")?;
    if segments.is_empty() {
        return Err("No hay fragmentos transcritos confirmados. No se enviará audio ni se inventará un acta".into());
    }
    if segments.len() > 2000
        || serde_json::to_vec(&value)
            .map_err(|_| "Fuente no representable")?
            .len()
            > 4 * 1024 * 1024
    {
        return Err("La fuente supera2000fragmentos o4MiB; reduce el alcance".into());
    }
    Ok(value)
}
fn default_draft(source: &Value) -> Draft {
    let title = format!("Acta · {}", source["title"].as_str().unwrap_or("Reunión"));
    let name = "Acta de reunión.md".to_owned();
    Draft {
        title,
        name,
        summary: String::new(),
        decisions: vec![],
        actions: vec![],
    }
}
fn source_refs(source: &Value, ids: &[String]) -> Result<String, String> {
    let rows = source["segments"]
        .as_array()
        .ok_or("Fragmentos no disponibles")?;
    if ids.is_empty() || ids.len() > 32 {
        return Err("Vincula de1a32fragmentos a cada acuerdo o acción".into());
    }
    let mut unique = HashSet::new();
    for id in ids {
        if !unique.insert(id) || !rows.iter().any(|r| r["id"].as_str() == Some(id)) {
            return Err("Referencia de fragmento inexistente o repetida".into());
        }
    }
    Ok(ids.join(", "))
}
fn clean_line(text: &str) -> String {
    text.replace('\r', "").replace('\n', " ")
}
fn render(source: &Value, d: &Draft) -> Result<String, String> {
    if d.title.trim().is_empty()
        || d.title.len() > 300
        || d.summary.len() > 16000
        || d.decisions.len() > 64
        || d.actions.len() > 64
    {
        return Err("El acta supera los límites de revisión".into());
    }
    let name = d.name.trim();
    if !name.ends_with(".md")
        || name.len() > 150
        || name.len() < 4
        || name
            .chars()
            .any(|c| c.is_control() || "<>:\"/\\|?*".contains(c))
        || name.starts_with('.')
        || name.ends_with(' ')
    {
        return Err("Elige un nombre Markdown simple y visible, de hasta150bytes".into());
    }
    let mut md=format!("# {}\n\n> Acta revisada por una persona. El resumen, los acuerdos y los responsables requieren verificación; las fuentes originales se conservan.\n\n## Resumen revisado\n\n{}\n\n## Acuerdos\n\n",clean_line(&d.title),if d.summary.trim().is_empty(){"Pendiente de revisión."}else{&d.summary});
    for row in &d.decisions {
        if row.text.trim().is_empty() || row.text.len() > 8000 {
            return Err("Acuerdo vacío o demasiado largo".into());
        }
        md += &format!(
            "- {} _(Fuentes: {})_\n",
            clean_line(&row.text),
            source_refs(source, &row.source_ids)?
        );
    }
    if d.decisions.is_empty() {
        md += "Sin acuerdos confirmados.\n";
    }
    md += "\n## Acciones revisadas\n\n";
    for row in &d.actions {
        if row.text.trim().is_empty()
            || row.text.len() > 8000
            || row.owner.as_ref().is_some_and(|x| x.len() > 200)
            || row.due_date.as_ref().is_some_and(|x| x.len() > 80)
        {
            return Err("Acción o responsable fuera de límite".into());
        }
        md += &format!(
            "- [ ] {} · Responsable: {} · Fecha: {} _(Fuentes: {})_\n",
            clean_line(&row.text),
            row.owner
                .as_ref()
                .map(|x| clean_line(x))
                .filter(|x| !x.trim().is_empty())
                .unwrap_or("Por confirmar".into()),
            row.due_date
                .as_ref()
                .map(|x| clean_line(x))
                .filter(|x| !x.trim().is_empty())
                .unwrap_or("Por confirmar".into()),
            source_refs(source, &row.source_ids)?
        );
    }
    if d.actions.is_empty() {
        md += "Sin acciones confirmadas.\n";
    }
    md+=&format!("\n## Transcripción original de referencia\n\nSesión: `{}`. Los tiempos corresponden a fragmentos, no a palabras. No hay identificación automática de hablantes.\n\n",source["sessionId"].as_str().ok_or("Sesión no identificada")?);
    for segment in source["segments"].as_array().unwrap() {
        let start = segment["start"].as_u64().ok_or("Tiempo no disponible")? / 24000;
        let count = segment["samples"]
            .as_u64()
            .ok_or("Duración no disponible")?
            / 24000;
        md += &format!(
            "### {} · {:02}:{:02}–{:02}:{:02}\n\n{}\n\n",
            segment["id"].as_str().ok_or("Fragmento sin identidad")?,
            start / 60,
            start % 60,
            (start + count) / 60,
            (start + count) % 60,
            segment["text"].as_str().ok_or("Texto no disponible")?
        );
    }
    if source["unconfirmedCount"].as_u64().unwrap_or(0) > 0 {
        md+="\n> La sesión contiene fragmentos no confirmados. Este acta no representa una transcripción completa.\n";
    }
    if md.len() > 4 * 1024 * 1024 {
        return Err("El acta supera4MiB; reduce el alcance".into());
    }
    Ok(md)
}
fn plan(
    api: &LocalApi,
    p: &str,
    q: Request,
) -> Result<(Value, Draft, String, String, String), String> {
    let root = root_hash(api, p)?;
    let source = recording_source(api, p, &q.session_id)?;
    let draft = q.draft.unwrap_or_else(|| default_draft(&source));
    let markdown = render(&source, &draft)?;
    let target = api.resolve_project_relative(p, &draft.name)?;
    match fs::symlink_metadata(&target) {
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => (),
        _ => {
            return Err(
                "El nombre ya está ocupado o no se puede comprobar. Elige otro, sin sobrescribir"
                    .into(),
            )
        }
    }
    let revision = sha256_hex(
        &serde_json::to_vec(&json!({"root":root,"source":source["sourceRevision"],"draft":draft}))
            .map_err(|_| "Revisión no representable")?,
    );
    Ok((source, draft, markdown, revision, root))
}
fn public(r: &Receipt) -> Value {
    json!({"schemaVersion":1,"id":r.id,"projectId":r.project_id,"sessionId":r.session_id,"revision":r.revision,"documentId":r.document_id,"phase":r.phase,"confirmed":r.phase=="completed","preservesSource":true,"canReplay":false,"checkedAt":r.checked_at})
}
fn load(api: &LocalApi, p: &str, id: &str) -> Result<Receipt, String> {
    let r: Receipt = serde_json::from_slice(&regular(&record_path(api, p, id)?, MAX_RECORD)?)
        .map_err(|_| "Recibo de acta futuro o incoherente; se conserva")?;
    if r.schema_version != 1
        || r.id != id
        || r.project_id != p
        || r.root_hash != root_hash(api, p)?
        || !matches!(r.phase.as_str(), "prepared" | "completed" | "uncertain")
        || !r.document_id.starts_with(&format!("{p}::"))
        || r.revision.len() != 64
        || r.markdown.len() > 4 * 1024 * 1024
        || r.source["sessionId"] != r.session_id
        || r.source["projectId"] != p
    {
        return Err("El recibo no confirma su ámbito; se conserva".into());
    }
    Ok(r)
}
impl LocalApi {
    pub(crate) fn review_meeting_minutes(&self, p: &str, body: Value) -> Result<Value, String> {
        let q: Request =
            serde_json::from_value(body).map_err(|_| "Revisión de acta no compatible")?;
        let (source, draft, markdown, revision, _) = plan(self, p, q)?;
        Ok(
            json!({"schemaVersion":1,"projectId":p,"sessionId":source["sessionId"],"revision":revision,"draft":draft,"source":source,"markdown":markdown,"preservesSource":true,"startsAi":false,"checkedAt":knownext_core::now_iso()}),
        )
    }
    pub(crate) fn create_meeting_minutes(&self, p: &str, body: Value) -> Result<Value, String> {
        #[derive(Deserialize)]
        #[serde(rename_all = "camelCase", deny_unknown_fields)]
        struct Input {
            session_id: String,
            draft: Draft,
            revision: String,
            attempt_id: String,
            acknowledge: bool,
        }
        let q: Input = serde_json::from_value(body).map_err(|_| "Confirma un acta revisada")?;
        if !q.acknowledge {
            return Err("Confirma el acta y sus responsables antes de crear el documento".into());
        }
        let _owner = self.project_transaction(p)?;
        let (source, draft, markdown, revision, root) = plan(
            self,
            p,
            Request {
                session_id: q.session_id.clone(),
                draft: Some(q.draft),
            },
        )?;
        if revision != q.revision {
            return Err("La fuente o el acta cambió; vuelve a revisar sin publicar".into());
        }
        let path = record_path(self, p, &q.attempt_id)?;
        let dir = directory(self, p)?;
        let mut count = 0;
        let mut total = 0u64;
        if dir.exists() {
            for entry in fs::read_dir(&dir).map_err(|_| "No se pudo medir el almacén de actas")? {
                let entry = entry.map_err(|_| "Inventario incompleto")?;
                let name = entry.file_name().to_string_lossy().into_owned();
                if matches!(
                    name.as_str(),
                    "owner.lock" | "runtime-owner.lock" | "capture.lock"
                ) {
                    continue;
                }
                let m =
                    fs::symlink_metadata(entry.path()).map_err(|_| "Registro no verificable")?;
                if !m.is_file() || batch::linked(&m) {
                    return Err("Registro no regular; se conserva".into());
                }
                count += 1;
                total = total.saturating_add(m.len());
            }
        }
        let mut r = Receipt {
            schema_version: 1,
            id: q.attempt_id,
            project_id: p.into(),
            session_id: q.session_id,
            revision,
            root_hash: root,
            source,
            markdown,
            document_id: doc_id(p, &draft.name),
            phase: "prepared".into(),
            checked_at: knownext_core::now_iso(),
        };
        let bytes = serde_json::to_vec(&r).map_err(|_| "El acta no es representable")?;
        if count >= 64
            || bytes.len() as u64 > MAX_RECORD
            || total.saturating_add(bytes.len() as u64) > 128 * 1024 * 1024
        {
            return Err("Actas conservadas: límite64intentos/128MiB. No se elimina contenido para continuar".into());
        }
        let _budget =
            recovery_inventory::admit(self, bytes.len() as u64 + r.markdown.len() as u64)?;
        fs::create_dir_all(&dir).map_err(|_| "No se pudo conservar el intento")?;
        atomic_io::create(&path, &bytes)
            .map_err(|_| "El intento ya existe o no está confirmado. Consúltalo sin repetir")?;
        if recording_source(self, p, &r.session_id)?["sourceRevision"] != r.source["sourceRevision"]
            || root_hash(self, p)? != r.root_hash
        {
            r.phase = "uncertain".into();
            atomic_io::write(&path, &serde_json::to_vec(&r).unwrap())
                .map_err(|_| "Intento conservado sin confirmación")?;
            return Err(
                "La fuente cambió. El intento permanece sin publicación; consulta sin repetir"
                    .into(),
            );
        }
        let target = self.resolve_project_relative(p, &draft.name)?;
        if let Err(e) = atomic_io::create(&target, r.markdown.as_bytes()) {
            r.phase = "uncertain".into();
            let _ = atomic_io::write(&path, &serde_json::to_vec(&r).unwrap());
            return Err(format!(
                "No se confirmó la creación. Se conserva el intento y cualquier archivo: {e}"
            ));
        }
        r.phase = "completed".into();
        atomic_io::write(&path, &serde_json::to_vec(&r).unwrap()).map_err(|_| {
            "Documento creado; acuse sin confirmar. Consulta el intento sin repetir"
        })?;
        Ok(public(&r))
    }
    pub(crate) fn meeting_minutes_receipt(&self, p: &str, id: &str) -> Result<Value, String> {
        let r = load(self, p, id)?;
        Ok(public(&r))
    }
    pub(crate) fn meeting_minutes_catalog(&self, p: &str) -> Result<Value, String> {
        let dir = directory(self, p)?;
        let mut items = vec![];
        let mut unavailable = 0;
        let mut limited = false;
        if dir.exists() {
            for (index, entry) in fs::read_dir(&dir)
                .map_err(|_| "Catálogo de actas no accesible")?
                .enumerate()
            {
                if index >= 128 {
                    limited = true;
                    break;
                }
                let entry = entry.map_err(|_| "Catálogo incompleto")?;
                let name = entry.file_name().to_string_lossy().into_owned();
                if matches!(
                    name.as_str(),
                    "owner.lock" | "runtime-owner.lock" | "capture.lock"
                ) {
                    continue;
                }
                let Some(id) = name.strip_suffix(".json") else {
                    unavailable += 1;
                    continue;
                };
                match load(self, p, id) {
                    Ok(r) => items.push(public(&r)),
                    Err(_) => unavailable += 1,
                }
            }
        }
        Ok(
            json!({"schemaVersion":1,"projectId":p,"items":items,"unavailable":unavailable,"limited":limited,"canReplay":false,"checkedAt":knownext_core::now_iso()}),
        )
    }
}
