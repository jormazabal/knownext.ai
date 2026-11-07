//! Opaque content revisions protect a known private draft from stale workspace writes.
//! Root note identity/timestamps do not invalidate a revision when moving its file.
use super::*;
use std::io::Write;
struct HashWriter(Sha256);
impl Write for HashWriter {
    fn write(&mut self, bytes: &[u8]) -> std::io::Result<usize> {
        self.0.update(bytes);
        Ok(bytes.len())
    }
    fn flush(&mut self) -> std::io::Result<()> {
        Ok(())
    }
}
pub(crate) fn revision(draft: Option<&Value>) -> Result<Option<String>, String> {
    let Some(draft) = draft else { return Ok(None) };
    let content = draft.get("content").filter(|content| !content.is_null());
    match (draft["markdown"].as_str(), content) {
        (Some(markdown), None) => Ok(Some(markdown_content_hash(markdown))),
        (None, Some(content)) => {
            document_validation::handwritten(content)?;
            let fields = content
                .as_object()
                .ok_or("El borrador de nota no contiene un objeto válido")?;
            let fields = fields
                .iter()
                .filter(|(key, _)| !matches!(key.as_str(), "id" | "createdAt" | "updatedAt"))
                .collect::<BTreeMap<_, _>>();
            let mut writer = HashWriter(Sha256::new());
            writer.0.update(b"handwritten-draft\0");
            serde_json::to_writer(&mut writer, &fields)
                .map_err(|_| "No se pudo identificar el contenido del borrador")?;
            Ok(Some(format!("{:x}", writer.0.finalize())))
        }
        _ => Err(
            "El borrador contiene tipos ambiguos o desconocidos; se conserva sin sustituir".into(),
        ),
    }
}
pub(crate) fn ensure_kind(id: &str, draft: Option<&Value>) -> Result<(), String> {
    let Some(draft) = draft else { return Ok(()) };
    let (_, relative) = document_ref(id)?;
    let markdown = draft["markdown"].is_string();
    let ink = draft.get("content").is_some_and(|value| !value.is_null());
    if (is_markdown_path(Path::new(&relative)) && markdown && !ink)
        || (is_handwritten_note_path(Path::new(&relative)) && ink && !markdown)
    {
        Ok(())
    } else {
        Err("El borrador no coincide con el tipo del documento. Se conserva sin sustituir ni descartar.".into())
    }
}
pub(crate) fn mutation_document<'a>(method: &str, parts: &[&'a str]) -> Option<&'a str> {
    match (method, parts) {
        ("PUT", ["api", "documents" | "handwritten-notes", id])
        | ("PUT" | "DELETE", ["api", "documents" | "handwritten-notes", id, "draft"])
        | ("POST", ["api", "documents" | "handwritten-notes", id, "draft", "discard-and-read"])
        | ("POST", ["api", "documents", id, "versions", _, "restore"]) => Some(*id),
        _ => None,
    }
}
fn response(status: u16, code: &str, detail: &str) -> LocalApiResponse {
    LocalApiResponse {
        status,
        body: json!({"code":code,"detail":detail,"operationOutcome":"not-started","checkedAt":knownext_core::now_iso()}),
    }
}
impl LocalApi {
    pub(crate) fn draft_write_revision(&self, id: &str) -> Result<Option<String>, String> {
        let draft = self.read_draft(id)?;
        ensure_kind(id, draft.as_ref())?;
        revision(draft.as_ref())
    }
    pub(crate) fn clear_unchanged_draft(
        &self,
        id: &str,
        before: &Option<Value>,
    ) -> Result<(), String> {
        let current = self.read_draft(id)?;
        if document_conflicts::draft_revision(&current)?
            != document_conflicts::draft_revision(before)?
        {
            return Err("El archivo está guardado, pero el borrador interno cambió y se conserva para revisión.".into());
        }
        self.delete_draft(id)
    }
    pub(crate) fn draft_write_precondition(
        &self,
        method: &str,
        parts: &[&str],
        body: &Value,
    ) -> Option<LocalApiResponse> {
        let id = mutation_document(method, parts)?;
        let expected = match body.get("expectedDraftWriteRevision") {
            Some(expected)=>expected,
            None=>return match self.draft_write_revision(id){
                Ok(None)=>None, // A legacy first write cannot discard an existing private draft.
                Ok(Some(_))=>Some(response(428,"draft_revision_required","Esta solicitud no identifica el borrador guardado. Vuelve a leer el documento y revisa ambas ediciones antes de escribir, guardar o descartar; el borrador existente se conserva.")),
                Err(_)=>Some(response(503,"draft_state_unavailable","No se puede comprobar el borrador interno. Se conserva sin escribir, guardar ni descartar; protege tu edición antes de revisar el almacenamiento.")),
            },
        };
        if !expected.is_null()
            && !expected.as_str().is_some_and(|value| {
                value.len() == 64 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
            })
        {
            return Some(response(
                400,
                "draft_revision_invalid",
                "La revisión del borrador no es válida. No se ha aplicado la solicitud.",
            ));
        }
        let current=match self.draft_write_revision(id){Ok(current)=>current,Err(_)=>return Some(response(503,"draft_state_unavailable","No se puede comprobar el borrador interno. Se conserva sin escribir, guardar ni descartar; protege tu edición antes de revisar el almacenamiento."))};
        if *expected != json!(current) {
            return Some(response(409,"draft_write_conflict","Otra operación cambió el borrador interno. Tu edición en memoria no lo ha sustituido. Conserva ambas ediciones antes de continuar."));
        }
        None
    }
}
