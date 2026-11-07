//! Pure local drawing calculation. Only immutable note/config snapshots cross this phase.
use super::*;
pub(super) struct PreparedDrawings {
    jobs: Vec<(usize, Value, Value, Value)>,
    rejected: BTreeMap<usize, Result<Value, String>>,
}
impl PreparedDrawings {
    pub(super) fn prepare(
        api: &LocalApi,
        project: &str,
        body: &Value,
        response: &Value,
        config: &Value,
    ) -> Self {
        let mut prepared = Self {
            jobs: Vec::new(),
            rejected: BTreeMap::new(),
        };
        for (index, operation) in response["operations"]
            .as_array()
            .into_iter()
            .flatten()
            .enumerate()
        {
            if operation["type"] != "handwritten_drawing_generated"
                || operation["status"] != "ready"
            {
                continue;
            }
            let job = (|| -> Result<(Value, Value), String> {
                if config["handwrittenDrawing"]["enabled"] != true
                    || config["permissions"]["editHandwrittenNotes"] != true
                    || config["permissions"]["drawHandwrittenNotes"] != true
                {
                    return Err("El dibujo de notas a mano está desactivado".into());
                }
                let id = operation["noteId"]
                    .as_str()
                    .or_else(|| operation["documentId"].as_str())
                    .or_else(|| body["handwrittenNoteId"].as_str())
                    .ok_or("La operación de dibujo no incluye nota")?;
                if document_ref(id)?.0 != project || body["handwrittenNoteId"].as_str() != Some(id)
                {
                    return Err("El dibujo necesita la nota activa y su base verificada".into());
                }
                let record = api.get_handwritten_note(id)?;
                let mut request = operation.clone();
                request["content"] = body
                    .get("activeHandwrittenContent")
                    .filter(|v| v.is_object())
                    .cloned()
                    .unwrap_or_else(|| record["content"].clone());
                request["targetPageId"] = operation
                    .get("targetPageId")
                    .cloned()
                    .or_else(|| body.get("activeHandwrittenPageId").cloned())
                    .unwrap_or(Value::Null);
                request["prompt"] = body["prompt"].clone();
                Ok((record["content"].clone(), request))
            })();
            match job {
                Ok((content, request)) => prepared.jobs.push((
                    index,
                    content,
                    request,
                    config["handwrittenDrawing"].clone(),
                )),
                Err(error) => {
                    prepared.rejected.insert(index, Err(error));
                }
            }
        }
        prepared
    }
    pub(super) fn execute_with(
        self,
        mut calculate: impl FnMut(&Value, &Value, &Value) -> Result<Value, String>,
        mut validate: impl FnMut() -> Result<(), String>,
    ) -> BTreeMap<usize, Result<Value, String>> {
        let mut results = self.rejected;
        for (index, content, request, config) in self.jobs {
            let output = validate().and_then(|()| {
                std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                    calculate(&content, &request, &config)
                }))
                .unwrap_or_else(|_| {
                    Err(
                        "El cálculo local de trazos se interrumpió; la nota no se ha sustituido"
                            .into(),
                    )
                })
            });
            results.insert(index, output);
        }
        results
    }
}
