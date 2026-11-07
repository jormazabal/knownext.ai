//! Reviewed literal replacement into private drafts. Saved files and Git remain untouched.
use super::*;
use std::{fs, io::Read};
const MAX_DOCUMENT: u64 = 2 * 1024 * 1024;
const MAX_REVIEW: usize = 16 * 1024 * 1024;
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Row {
    document_id: String,
    path: String,
    before: String,
    after: String,
    disk_sha: String,
    draft_sha: String,
    matches: usize,
    applied: bool,
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Receipt {
    schema_version: u8,
    id: String,
    project_id: String,
    root_hash: String,
    revision: String,
    phase: String,
    rows: Vec<Row>,
    undo_id: Option<String>,
    checked_at: String,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Selection {
    document_ids: Vec<String>,
    query: String,
    replacement: String,
}
fn root_hash(api: &LocalApi, p: &str) -> Result<String, String> {
    let root = api
        .project_root(p)?
        .canonicalize()
        .map_err(|_| "Proyecto no disponible")?;
    Ok(sha256_hex(root.to_string_lossy().as_bytes()))
}
fn directory(api: &LocalApi, p: &str) -> Result<PathBuf, String> {
    api.project_root(p)?;
    let base = api.app_data_dir.join("document-replacements");
    let dir = base.join(sha256_hex(p.as_bytes()));
    for path in [&api.app_data_dir, &base, &dir] {
        match fs::symlink_metadata(path) {
            Ok(m) if m.is_dir() && !batch::linked(&m) => (),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => (),
            _ => return Err("Almacén de reemplazos no regular; se conserva".into()),
        }
    }
    Ok(dir)
}
fn path(api: &LocalApi, p: &str, id: &str) -> Result<PathBuf, String> {
    if !id.starts_with("replace-") || !request_scope::portable_id(id) {
        return Err("Intento de reemplazo no válido".into());
    }
    Ok(directory(api, p)?.join(format!("{id}.json")))
}
fn read_regular(path: &Path, limit: u64) -> Result<Vec<u8>, String> {
    let m = fs::symlink_metadata(path).map_err(|_| "Archivo no accesible")?;
    if !m.is_file() || batch::linked(&m) || m.len() > limit {
        return Err("Archivo no regular o fuera de límite".into());
    }
    let mut b = vec![];
    fs::File::open(path)
        .map_err(|_| "Archivo no accesible")?
        .take(limit + 1)
        .read_to_end(&mut b)
        .map_err(|_| "Lectura incompleta")?;
    if b.len() as u64 != m.len() {
        return Err("El archivo cambió durante la lectura".into());
    }
    Ok(b)
}
fn current(api: &LocalApi, p: &str, id: &str) -> Result<(String, String, String, String), String> {
    let (owner, relative) = document_ref(id)?;
    if owner != p {
        return Err("El documento pertenece a otro proyecto".into());
    }
    let target = api.resolve_markdown_path(id)?;
    let disk = read_regular(&target, MAX_DOCUMENT)?;
    let draft = api.read_draft(id)?;
    draft_versions::ensure_kind(id, draft.as_ref())?;
    let text = draft
        .as_ref()
        .and_then(|d| d["markdown"].as_str())
        .map(str::to_owned)
        .unwrap_or(String::from_utf8(disk.clone()).map_err(|_| "Documento no UTF-8")?);
    if text.len() as u64 > MAX_DOCUMENT {
        return Err("Un borrador supera 2 MiB; reduce el alcance".into());
    }
    Ok((
        relative,
        text,
        sha256_hex(&disk),
        sha256_hex(
            &serde_json::to_vec(&draft.as_ref().map(|v| {
                let mut stable = v.clone();
                if let Some(o) = stable.as_object_mut() {
                    o.remove("updatedAt");
                }
                stable
            }))
            .map_err(|_| "Borrador no representable")?,
        ),
    ))
}
fn plan(api: &LocalApi, p: &str, s: &Selection) -> Result<(Vec<Row>, String), String> {
    if s.document_ids.is_empty()
        || s.document_ids.len() > 32
        || s.query.is_empty()
        || s.query.len() > 256
        || s.replacement.len() > 4096
        || s.query == s.replacement
        || s.document_ids.iter().collect::<BTreeSet<_>>().len() != s.document_ids.len()
    {
        return Err("Selecciona 1–32 documentos, texto exacto de hasta 256 bytes y un reemplazo distinto de hasta 4096 bytes".into());
    }
    let mut rows = vec![];
    let mut bytes = 0usize;
    for id in &s.document_ids {
        let (relative, before, disk_sha, draft_sha) = current(api, p, id)?;
        let matches = before.matches(&s.query).count();
        if matches == 0 {
            continue;
        }
        if matches > 10000 {
            return Err("Un documento supera 10000 coincidencias; reduce el alcance".into());
        }
        let after = before.replace(&s.query, &s.replacement);
        bytes = bytes
            .saturating_add(before.len())
            .saturating_add(after.len());
        if after.len() as u64 > MAX_DOCUMENT || bytes > MAX_REVIEW {
            return Err("El reemplazo supera 2 MiB por documento o 16 MiB de revisión; no se aplica una selección parcial".into());
        }
        rows.push(Row {
            document_id: id.clone(),
            path: relative,
            before,
            after,
            disk_sha,
            draft_sha,
            matches,
            applied: false,
        });
    }
    let revision = sha256_hex(
        &serde_json::to_vec(&json!([
            p,
            root_hash(api, p)?,
            s.document_ids,
            s.query,
            s.replacement,
            rows
        ]))
        .map_err(|_| "Revisión no representable")?,
    );
    Ok((rows, revision))
}
fn public(r: &Receipt) -> Value {
    json!({"schemaVersion":1,"id":r.id,"projectId":r.project_id,"revision":r.revision,"phase":r.phase,"checkedAt":r.checked_at,"documents":r.rows.iter().map(|x|json!({"documentId":x.document_id,"path":x.path,"matches":x.matches,"applied":x.applied})).collect::<Vec<_>>(),"undoId":r.undo_id,"preservesSavedFiles":true})
}
fn store(api: &LocalApi, r: &Receipt) -> Result<(), String> {
    atomic_io::write(
        &path(api, &r.project_id, &r.id)?,
        &serde_json::to_vec(r).map_err(|_| "Recibo no representable")?,
    )
    .map_err(|_| "Resultado sin confirmar; consulta el intento sin repetir".into())
}
fn load(api: &LocalApi, p: &str, id: &str) -> Result<Receipt, String> {
    let r: Receipt = serde_json::from_slice(&read_regular(&path(api, p, id)?, 64 * 1024 * 1024)?)
        .map_err(|_| "Recibo de reemplazo no compatible; se conserva")?;
    if r.schema_version != 1
        || r.project_id != p
        || r.id != id
        || r.root_hash != root_hash(api, p)?
        || r.rows.len() > 32
        || !matches!(r.phase.as_str(), "applying" | "completed" | "partial")
    {
        return Err("El recibo cambió de versión o ubicación; se conserva".into());
    }
    let mut ids = BTreeSet::new();
    let mut paths = BTreeSet::new();
    let mut logical = 0usize;
    if r.rows.is_empty() {
        return Err("Recibo vacío no compatible; se conserva".into());
    }
    for row in &r.rows {
        let (owner, relative) = document_ref(&row.document_id)?;
        logical = logical
            .saturating_add(row.before.len())
            .saturating_add(row.after.len());
        if owner != p
            || relative != row.path
            || !is_markdown_path(Path::new(&relative))
            || !ids.insert(&row.document_id)
            || !paths.insert(portable_paths::key(&relative))
            || row.before.len() as u64 > MAX_DOCUMENT
            || row.after.len() as u64 > MAX_DOCUMENT
            || row.matches == 0
            || row.matches > 10000
            || r.phase == "completed" && !row.applied
            || [&row.disk_sha, &row.draft_sha]
                .iter()
                .any(|v| v.len() != 64 || !v.bytes().all(|b| b.is_ascii_hexdigit()))
        {
            return Err("Filas de reemplazo no compatibles; se conservan sin aplicar".into());
        }
    }
    if logical > MAX_REVIEW {
        return Err("Recibo fuera de límite; se conserva".into());
    }
    Ok(r)
}
fn capacity(api: &LocalApi, p: &str, additional: u64) -> Result<(), String> {
    let dir = directory(api, p)?;
    let mut count = 0usize;
    let mut bytes = additional;
    match fs::read_dir(&dir) {
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(_) => return Err("Reemplazos no accesibles".into()),
        Ok(entries) => {
            for entry in entries {
                let e = entry.map_err(|_| "Recibo no accesible")?;
                let name = e.file_name().to_string_lossy().into_owned();
                if matches!(
                    name.to_ascii_lowercase().as_str(),
                    "owner.lock" | "runtime-owner.lock" | "capture.lock"
                ) {
                    continue;
                }
                let m = fs::symlink_metadata(e.path()).map_err(|_| "Recibo no verificable")?;
                if !m.is_file() || batch::linked(&m) {
                    return Err("Recibo desconocido; se conserva".into());
                }
                count += 1;
                bytes = bytes.saturating_add(m.len());
                if count >= 64 || bytes > 128 * 1024 * 1024 {
                    return Err("Los reemplazos conservados alcanzan 64 intentos o 128 MiB; no se retira contenido para continuar".into());
                }
            }
        }
    }
    Ok(())
}
fn publish(api: &LocalApi, mut r: Receipt, undo_source: Option<&Receipt>) -> Result<Value, String> {
    let bytes = serde_json::to_vec(&r).map_err(|_| "Recibo no representable")?;
    if bytes.len() > 64 * 1024 * 1024 {
        return Err("El recibo supera 64 MiB; reduce el alcance".into());
    }
    capacity(api, &r.project_id, bytes.len() as u64)?;
    let _budget = recovery_inventory::admit(api, bytes.len() as u64)?;
    let file = path(api, &r.project_id, &r.id)?;
    fs::create_dir_all(file.parent().unwrap()).map_err(|_| "No se pudo conservar el intento")?;
    atomic_io::create(&file, &bytes)
        .map_err(|_| "El intento ya existe o no está confirmado. Consúltalo sin repetir")?;
    if let Some(source) = undo_source {
        store(api, source)?;
    }
    for i in 0..r.rows.len() {
        let row = &r.rows[i];
        let observed = current(api, &r.project_id, &row.document_id)?;
        if observed.1 != row.before || observed.2 != row.disk_sha || observed.3 != row.draft_sha {
            r.phase = "partial".into();
            store(api, &r)?;
            return Err("Un documento cambió; el resto permanece. Consulta el resultado parcial sin repetir".into());
        }
        if let Err(error) = api.save_draft(&row.document_id, json!({"markdown":row.after})) {
            r.phase = "partial".into();
            store(api, &r)?;
            return Err(format!("Resultado parcial conservado: {error}"));
        }
        r.rows[i].applied = true;
        store(api, &r)?;
    }
    r.phase = "completed".into();
    store(api, &r)?;
    Ok(public(&r))
}
impl LocalApi {
    pub(crate) fn review_document_replace(&self, p: &str, body: Value) -> Result<Value, String> {
        let s: Selection = serde_json::from_value(body).map_err(|_| "Selección no compatible")?;
        let (rows, revision) = plan(self, p, &s)?;
        Ok(
            json!({"schemaVersion":1,"projectId":p,"revision":revision,"checkedAt":knownext_core::now_iso(),"documents":rows.iter().map(|x|json!({"documentId":x.document_id,"path":x.path,"before":x.before,"after":x.after,"matches":x.matches})).collect::<Vec<_>>(),"preservesSavedFiles":true}),
        )
    }
    pub(crate) fn apply_document_replace(&self, p: &str, body: Value) -> Result<Value, String> {
        #[derive(Deserialize)]
        #[serde(rename_all = "camelCase", deny_unknown_fields)]
        struct Input {
            selection: Selection,
            revision: String,
            attempt_id: String,
            acknowledge: bool,
        }
        let q: Input =
            serde_json::from_value(body).map_err(|_| "Confirma una revisión de reemplazo")?;
        if !q.acknowledge {
            return Err("Confirma el alcance revisado".into());
        }
        let _transaction = self.project_transaction(p)?;
        let (rows, revision) = plan(self, p, &q.selection)?;
        if revision != q.revision || rows.is_empty() {
            return Err("La revisión cambió o no contiene coincidencias; vuelve a revisar".into());
        }
        publish(
            self,
            Receipt {
                schema_version: 1,
                id: q.attempt_id,
                project_id: p.into(),
                root_hash: root_hash(self, p)?,
                revision,
                phase: "applying".into(),
                rows,
                undo_id: None,
                checked_at: knownext_core::now_iso(),
            },
            None,
        )
    }
    pub(crate) fn document_replace_catalog(&self, p: &str) -> Result<Value, String> {
        let dir = directory(self, p)?;
        let mut items = vec![];
        let mut unavailable = 0usize;
        match fs::read_dir(dir) {
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => (),
            Err(_) => return Err("Catálogo de reemplazos no accesible".into()),
            Ok(entries) => {
                for (index, e) in entries.enumerate() {
                    if index >= 128 {
                        return Err("Catálogo fuera de límite; se conserva".into());
                    }
                    let e = e.map_err(|_| "Recibo no accesible")?;
                    let name = e.file_name().to_string_lossy().into_owned();
                    if matches!(
                        name.to_ascii_lowercase().as_str(),
                        "owner.lock" | "runtime-owner.lock" | "capture.lock"
                    ) {
                        continue;
                    }
                    if let Some(id) = name.strip_suffix(".json") {
                        match self.document_replace_receipt(p, id) {
                            Ok(mut v) => {
                                v.as_object_mut().unwrap().remove("copies");
                                items.push(v);
                            }
                            Err(_) => unavailable += 1,
                        }
                    } else {
                        unavailable += 1;
                    }
                }
            }
        }
        Ok(
            json!({"schemaVersion":1,"projectId":p,"checkedAt":knownext_core::now_iso(),"items":items,"unavailable":unavailable}),
        )
    }
    pub(crate) fn document_replace_receipt(&self, p: &str, id: &str) -> Result<Value, String> {
        let r = load(self, p, id)?;
        let mut v = public(&r);
        v["copies"]=json!(r.rows.iter().map(|x|json!({"documentId":x.document_id,"path":x.path,"before":x.before,"after":x.after})).collect::<Vec<_>>());
        if r.phase == "applying" {
            v["phase"] = json!("interrupted");
        }
        Ok(v)
    }
    pub(crate) fn undo_document_replace(
        &self,
        p: &str,
        id: &str,
        body: Value,
    ) -> Result<Value, String> {
        #[derive(Deserialize)]
        #[serde(rename_all = "camelCase", deny_unknown_fields)]
        struct Input {
            revision: String,
            attempt_id: String,
            acknowledge: bool,
        }
        let q: Input = serde_json::from_value(body).map_err(|_| "Confirma el deshacer revisado")?;
        let _transaction = self.project_transaction(p)?;
        let mut r = load(self, p, id)?;
        if !q.acknowledge
            || r.revision != q.revision
            || r.phase != "completed"
            || r.undo_id.is_some()
        {
            return Err(
                "El reemplazo no permite repetir el deshacer; consulta su resultado".into(),
            );
        }
        path(self, p, &q.attempt_id)?;
        let mut rows = vec![];
        for row in &r.rows {
            let (relative, text, disk_sha, draft_sha) = current(self, p, &row.document_id)?;
            if text != row.after || disk_sha != row.disk_sha {
                return Err(
                    "Hay cambios posteriores; se conservan y no se deshace el lote automáticamente"
                        .into(),
                );
            }
            rows.push(Row {
                document_id: row.document_id.clone(),
                path: relative,
                before: text,
                after: row.before.clone(),
                disk_sha,
                draft_sha,
                matches: row.matches,
                applied: false,
            });
        }
        if fs::symlink_metadata(path(self, p, &q.attempt_id)?).is_ok() {
            return Err("Ese intento ya existe; consulta sin repetir".into());
        }
        r.undo_id = Some(q.attempt_id.clone());
        publish(
            self,
            Receipt {
                schema_version: 1,
                id: q.attempt_id,
                project_id: p.into(),
                root_hash: r.root_hash.clone(),
                revision: r.revision.clone(),
                phase: "applying".into(),
                rows,
                undo_id: None,
                checked_at: knownext_core::now_iso(),
            },
            Some(&r),
        )
    }
}
