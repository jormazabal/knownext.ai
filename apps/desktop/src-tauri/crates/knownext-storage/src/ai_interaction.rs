//! Interactive AI: bounded local preparation, provider wait, then guarded commit.
//! Prepared credentials stay in Rust and are deliberately not Debug/Serialize.
use super::*;
use std::{fs, io::Read, sync::Mutex};
mod drawings;
mod images;

const MAX_CONTEXT_FILE: u64 = 64 * 1024 * 1024;

struct InteractionScope {
    _private_activity:ai_privacy::PrivatePermit,
    project_id: String,
    project_name: String,
    root: PathBuf,
    runtime_body: Value,
    user_event: Option<Value>,
    policy: Value,
    bases: Vec<(String, Value)>,
    draft_bases: Vec<DraftContextBase>,
}
struct DraftContextBase {
    id: String,
    published_hash: String,
    submitted_hash: Option<String>,
}

pub(super) struct PreparedAiInteraction {
    scope: InteractionScope,
    context_sources: Value,
    api_key: Option<String>,
    model: String,
}

pub(super) struct CompletedAiInteraction {
    scope: InteractionScope,
    response: Value,
    image_results: BTreeMap<usize, Value>,
    drawing_results: BTreeMap<usize, Result<Value, String>>,
}

fn execution_policy(ai: &Value) -> Value {
    let mut policy = serde_json::Map::new();
    for field in [
        "provider",
        "model",
        "permissions",
        "vision",
        "imageGeneration",
        "transcription",
        "agentic",
        "diagrams",
        "handwrittenDrawing",
    ] {
        policy.insert(field.into(), ai[field].clone());
    }
    // Index timestamps/status may change without changing execution authority.
    policy.insert("ragEnabled".into(), ai["rag"]["enabled"].clone());
    Value::Object(policy)
}

fn context_fingerprint(path: &Path) -> Result<Value, String> {
    let file = fs::File::open(path).map_err(|_| {
        "No se puede verificar el archivo del contexto. Ábrelo o recupéralo antes de usar IA."
    })?;
    let metadata = file
        .metadata()
        .map_err(|_| "No se puede comprobar el contexto documental")?;
    if !metadata.is_file() || metadata.len() > MAX_CONTEXT_FILE {
        return Err(
            "El contexto no es un archivo regular de hasta 64 MiB; no se ha enviado a IA".into(),
        );
    }
    let mut reader = file.take(MAX_CONTEXT_FILE + 1);
    let mut digest = Sha256::new();
    let mut size = 0u64;
    let mut buffer = [0u8; 64 * 1024];
    loop {
        let count = reader
            .read(&mut buffer)
            .map_err(|_| "No se pudo verificar toda la base del contexto")?;
        if count == 0 {
            break;
        }
        size += count as u64;
        if size > MAX_CONTEXT_FILE {
            return Err("El contexto creció durante la lectura; vuelve a revisarlo".into());
        }
        digest.update(&buffer[..count]);
    }
    Ok(json!({"mtimeNs":null,"size":size,"sha256":format!("{:x}",digest.finalize())}))
}

struct PublishedContext {
    content_hash: String,
    draft_hash: Option<String>,
    handwritten: bool,
}
fn handwritten_revision_hash(content: &Value) -> String {
    let mut revision = content.clone();
    // Draft persistence stamps this root field after accepting identical strokes.
    // Keep all page/stroke/style data; an ACK timestamp is not a new edit.
    if let Some(object) = revision.as_object_mut() {
        object.remove("updatedAt");
    }
    handwritten_content_hash(&revision)
}
fn published_context(api: &LocalApi, id: &str, path: &Path) -> Result<PublishedContext, String> {
    let mut bytes = Vec::new();
    let metadata =
        fs::metadata(path).map_err(|_| "No se puede verificar el contexto conservado")?;
    if !metadata.is_file() || metadata.len() > MAX_CONTEXT_FILE {
        return Err("El contexto conservado supera el límite permitido".into());
    }
    fs::File::open(path)
        .map_err(|_| "No se puede abrir el contexto conservado")?
        .take(MAX_CONTEXT_FILE + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| "No se puede leer el contexto conservado")?;
    if bytes.len() as u64 > MAX_CONTEXT_FILE {
        return Err("El contexto creció durante la revisión".into());
    }
    let draft = api.read_draft(id)?;
    if draft
        .as_ref()
        .is_some_and(|value| !draft_base_is_verified(value))
    {
        return Err(
            "La base del borrador no está verificada. Revisa su recuperación antes de usar IA."
                .into(),
        );
    }
    let handwritten = is_handwritten_note_path(path);
    let (disk_hash, draft_hash, content_hash) = if handwritten {
        let disk: Value = serde_json::from_slice(&bytes)
            .map_err(|_| "La nota del contexto no contiene JSON válido")?;
        let title = path
            .file_stem()
            .and_then(|name| name.to_str())
            .unwrap_or("Nota a mano");
        let disk = normalize_handwritten_note(disk, id, title);
        let disk_hash = handwritten_content_hash(&disk);
        let draft_content = draft
            .as_ref()
            .map(|value| {
                value
                    .get("content")
                    .filter(|content| content.is_object())
                    .ok_or("El borrador no contiene trazos verificables")
                    .map(|content| {
                        normalize_handwritten_note(
                            content.clone(),
                            id,
                            disk["title"].as_str().unwrap_or(title),
                        )
                    })
            })
            .transpose()?;
        let draft_hash = draft_content
            .as_ref()
            .map(handwritten_content_hash)
            .filter(|hash| hash != &disk_hash);
        let current = if draft_hash.is_some() {
            draft_content.as_ref().unwrap()
        } else {
            &disk
        };
        let content_hash = handwritten_revision_hash(current);
        (disk_hash, draft_hash, content_hash)
    } else if is_markdown_path(path) {
        let text = std::str::from_utf8(&bytes)
            .map_err(|_| "El contexto Markdown no contiene texto UTF-8 válido")?;
        let draft_hash = draft
            .as_ref()
            .map(|value| {
                value["markdown"]
                    .as_str()
                    .ok_or("El borrador no contiene texto verificable")
                    .map(markdown_content_hash)
            })
            .transpose()?;
        let disk_hash = markdown_content_hash(text);
        let content_hash = draft_hash.clone().unwrap_or_else(|| disk_hash.clone());
        (disk_hash, draft_hash, content_hash)
    } else {
        return Err("El contexto IA necesita un documento Markdown o una nota a mano".into());
    };
    let draft_hash = draft_hash.filter(|hash| hash != &disk_hash);
    Ok(PublishedContext {
        content_hash,
        draft_hash,
        handwritten,
    })
}

pub fn interaction_project_id(method: &str, path: &str) -> Option<String> {
    if !method.eq_ignore_ascii_case("POST") {
        return None;
    }
    let (path, _) = split_path(path);
    let parts: Vec<_> = path
        .trim_matches('/')
        .split('/')
        .map(knownext_core::percent_decode)
        .collect();
    match parts
        .iter()
        .map(String::as_str)
        .collect::<Vec<_>>()
        .as_slice()
    {
        ["api", "projects", project, "ai", "interactions" | "confirm-delete"] => {
            Some((*project).into())
        }
        _ => None,
    }
}

pub fn dispatch_interaction(
    mutations: &Mutex<LocalApi>,
    ai_queue: &Mutex<()>,
    project_id: &str,
    body: Value,
) -> ApiResult {
    dispatch_with(
        mutations,
        ai_queue,
        project_id,
        body,
        PreparedAiInteraction::execute,
    )
}

fn dispatch_with(
    mutations: &Mutex<LocalApi>,
    ai_queue: &Mutex<()>,
    project_id: &str,
    body: Value,
    execute: impl FnOnce(PreparedAiInteraction) -> CompletedAiInteraction,
) -> ApiResult {
    dispatch_with_images(
        mutations,
        ai_queue,
        project_id,
        body,
        execute,
        knownext_ai::generate_image,
    )
}
fn dispatch_with_images(
    mutations: &Mutex<LocalApi>,
    ai_queue: &Mutex<()>,
    project_id: &str,
    body: Value,
    execute: impl FnOnce(PreparedAiInteraction) -> CompletedAiInteraction,
    generate: impl FnMut(Option<&str>, &Value, &str) -> Value,
) -> ApiResult {
    dispatch_with_phases(
        mutations,
        ai_queue,
        project_id,
        body,
        execute,
        generate,
        knownext_drawing::apply_handwritten_drawing,
    )
}
fn dispatch_with_phases(
    mutations: &Mutex<LocalApi>,
    ai_queue: &Mutex<()>,
    project_id: &str,
    body: Value,
    execute: impl FnOnce(PreparedAiInteraction) -> CompletedAiInteraction,
    generate: impl FnMut(Option<&str>, &Value, &str) -> Value,
    calculate: impl FnMut(&Value, &Value, &Value) -> Result<Value, String>,
) -> ApiResult {
    // Acquire AI authority first. Never wait for this queue with mutations locked.
    let _ai = ai_queue
        .lock()
        .map_err(|_| "No se puede acceder a la cola de IA")?;
    let prepared = mutations
        .lock()
        .map_err(|_| "No se puede preparar la operación local")?
        .prepare_ai_interaction(project_id, body)?;
    let mut completed = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| execute(prepared)))
        .map_err(|_| "La ejecución IA se interrumpió. Los documentos se conservan y no se ha aplicado un resultado.")?;
    let image_work = {
        let api = mutations
            .lock()
            .map_err(|_| "No se puede preparar la generación de imágenes")?;
        images::PreparedImages::prepare(&completed, &api)
    };
    completed.image_results = image_work.execute_with(generate, || {
        let api = mutations
            .lock()
            .map_err(|_| "No se puede comprobar la autoridad de imagen")?;
        api.spend_preflight(Some(&completed.scope.project_id))?;
        completed.validate_response(&api)
    });
    let drawing_work = {
        let api = mutations
            .lock()
            .map_err(|_| "No se puede preparar la nota para el cálculo local")?;
        completed.prepare_drawings(&api)
    };
    if let Some(work) = drawing_work {
        completed.drawing_results = work.execute_with(calculate, || {
            let api = mutations
                .lock()
                .map_err(|_| "No se puede verificar la base de los trazos")?;
            completed.validate_response(&api)
        });
    }
    let api = mutations
        .lock()
        .map_err(|_| "No se puede aplicar el resultado local")?;
    ok(completed.commit(&api))
}

impl LocalApi {
    pub(super) fn prepare_ai_interaction(
        &self,
        project_id: &str,
        mut body: Value,
    ) -> Result<PreparedAiInteraction, String> {
        if body.get("readOnly").is_some_and(|v|!v.is_boolean()){return Err("La autoridad de solo lectura debe ser booleana".into());}
        if project_id.is_empty()
            || project_id.len() > 160
            || !project_id
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
        {
            return Err("Identificador de proyecto no válido para IA".into());
        }
        self.conversation_checked(project_id)?;
        self.context_checked(project_id)?;
        self.usage_checked()?;
        if !body.is_object() {
            return Err("La petición IA debe ser un objeto".into());
        }
        if body["projectId"]
            .as_str()
            .is_some_and(|id| id != project_id)
        {
            return Err("La petición IA no pertenece al proyecto de destino".into());
        }
        let config = self.read_config_checked()?;
        let root = self
            .project_root(project_id)?
            .canonicalize()
            .map_err(|_| "La carpeta del proyecto no está disponible")?;
        if !root.is_dir() {
            return Err("La ubicación del proyecto no es una carpeta".into());
        }
        if body["activeMarkdown"]
            .as_str()
            .is_some_and(|text| text.len() as u64 > MAX_CONTEXT_FILE)
        {
            return Err("El contenido del contexto supera 64 MiB; no se ha enviado a IA".into());
        }
        let cancelling =
            body.pointer("/intentAction/type").and_then(Value::as_str) == Some("cancel");
        let mut bases = Vec::new();
        let mut draft_bases = Vec::new();
        for field in ["documentId", "handwrittenNoteId"] {
            let Some(id) = body[field].as_str().filter(|id| !id.is_empty()) else {
                continue;
            };
            // Personal notes are an explicit virtual surface, never a project path.
            if id == "user-notes" && field == "documentId" {
                continue;
            }
            let (owner, relative) = document_ref(id)?;
            if owner != project_id {
                return Err("El documento del contexto no pertenece al proyecto".into());
            }
            let path = self.resolve_project_relative(project_id, &relative)?;
            if cancelling {
                continue;
            }
            let actual = context_fingerprint(&path)?;
            let base_field = if field == "documentId" {
                "activeDocumentBaseFingerprint"
            } else {
                "activeHandwrittenBaseFingerprint"
            };
            let supplied = body.get(base_field).filter(|base| !base.is_null());
            if supplied.is_some_and(|base| {
                base["size"].as_u64().is_none()
                    || !base["sha256"].as_str().is_some_and(|hash| {
                        hash.len() == 64 && hash.bytes().all(|b| b.is_ascii_hexdigit())
                    })
            }) {
                return Err("La base del contexto IA no tiene un formato válido".into());
            }
            let verified_base = supplied.is_some_and(|base| {
                base["size"] == actual["size"] && base["sha256"] == actual["sha256"]
            });
            // Permit an acknowledged save to catch up only when the submitted
            // Markdown is byte-for-byte the current saved content. Dirty input
            // needs its original saved base; a queued old request cannot rebase.
            let exact_saved_text = field == "documentId"
                && body["activeMarkdown"].as_str().is_some_and(|text| {
                    text.len() as u64 == actual["size"].as_u64().unwrap_or(u64::MAX)
                        && sha256_hex(text.as_bytes()) == actual["sha256"].as_str().unwrap_or("")
                });
            if !verified_base && !exact_saved_text {
                return Err("El archivo cambió desde la base del contexto. Conserva los cambios y vuelve a abrirlo antes de enviar otra operación IA.".into());
            }
            let published = published_context(self, id, &path)?;
            let draft_field = if published.handwritten {
                "activeHandwrittenDraftContentHash"
            } else {
                "activeDocumentDraftContentHash"
            };
            let expected = body[draft_field].as_str();
            if !body[draft_field].is_null()
                && !expected.is_some_and(|hash| {
                    hash.len() == 64 && hash.bytes().all(|b| b.is_ascii_hexdigit())
                })
            {
                return Err("La revisión del borrador IA no tiene un formato válido".into());
            }
            let submitted_hash = if published.handwritten {
                body.get("activeHandwrittenContent")
                    .filter(|content| content.is_object())
                    .map(|content| {
                        if serde_json::to_vec(content)
                            .map_err(|_| "No se puede verificar el contenido manuscrito")?
                            .len() as u64
                            > MAX_CONTEXT_FILE
                        {
                            return Err("El contexto manuscrito supera 64 MiB");
                        }
                        Ok(handwritten_revision_hash(&normalize_handwritten_note(
                            content.clone(),
                            id,
                            content["title"].as_str().unwrap_or("Nota a mano"),
                        )))
                    })
                    .transpose()?
            } else {
                body["activeMarkdown"].as_str().map(markdown_content_hash)
            };
            if expected != published.draft_hash.as_deref()
                && submitted_hash.as_deref() != Some(published.content_hash.as_str())
            {
                return Err("El borrador conservado cambió desde el envío. Se mantiene su contenido; revisa la sesión antes de solicitar otra operación IA.".into());
            }
            draft_bases.push(DraftContextBase {
                id: id.to_string(),
                published_hash: published.content_hash,
                submitted_hash,
            });
            bases.push((id.to_string(), actual));
        }
        // This hash is runtime authority, not provider context.
        body.as_object_mut()
            .unwrap()
            .remove("activeDocumentBaseFingerprint");
        for field in [
            "activeDocumentDraftContentHash",
            "activeHandwrittenDraftContentHash",
        ] {
            body.as_object_mut().unwrap().remove(field);
        }
        let user_event = self.ai_user_conversation_event(project_id, &body);
        self.spend_preflight(Some(project_id))?;
        let context_sources = if cancelling {json!([])}else{self.resolve_ai_context_sources(project_id, &body)?};
        body["runtimePermissions"] = config["ai"]["permissions"].clone();
        body["runtimeAi"] = config["ai"].clone();
        if body["readOnly"]==true{if let Some(p)=body["runtimePermissions"].as_object_mut(){for v in p.values_mut(){*v=json!(false);}}body["runtimeAi"]["permissions"]=body["runtimePermissions"].clone();}

        let model = config["ai"]["model"]
            .as_str()
            .unwrap_or("gpt-5.4-mini")
            .to_string();
        Ok(PreparedAiInteraction {
            scope: InteractionScope {
                _private_activity:self.private_work()?,
                project_id: project_id.into(),
                project_name: self
                    .list_projects()
                    .iter()
                    .find(|project| project["id"] == project_id)
                    .and_then(|project| project["name"].as_str())
                    .unwrap_or("Proyecto de origen")
                    .to_string(),
                root,
                runtime_body: body,
                user_event,
                policy: execution_policy(&config["ai"]),
                bases,
                draft_bases,
            },
            context_sources,
            api_key: self.openai_key(),
            model,
        })
    }
}

impl PreparedAiInteraction {
    pub(super) fn execute(self) -> CompletedAiInteraction {
        self.execute_with(knownext_ai::answer_interaction)
    }
    fn execute_with(
        self,
        answer: impl FnOnce(&str, &Value, Value, Option<&str>, &str) -> Value,
    ) -> CompletedAiInteraction {
        let response = answer(
            &self.scope.project_id,
            &self.scope.runtime_body,
            self.context_sources,
            self.api_key.as_deref(),
            &self.model,
        );
        // Only scope/response survive the provider phase, never its credential.
        CompletedAiInteraction {
            scope: self.scope,
            response,
            image_results: BTreeMap::new(),
            drawing_results: BTreeMap::new(),
        }
    }
}

fn mutates_context(response: &Value) -> bool {
    if [
        "updatedDocument",
        "updatedHandwrittenNote",
        "editProposal",
        "drawingProposal",
    ]
    .iter()
    .any(|field| !response[*field].is_null())
    {
        return true;
    }
    response["operations"].as_array().is_some_and(|operations| {
        operations.iter().any(|operation| {
            matches!(
                operation["type"].as_str(),
                Some(
                    "document_modified"
                        | "handwritten_modified"
                        | "folder_created"
                        | "document_created"
                        | "document_duplicated"
                        | "node_moved"
                        | "node_deleted"
                        | "image_generated"
                        | "image_inserted"
                        | "handwritten_drawing_generated"
                )
            ) && matches!(operation["status"].as_str(), Some("ready" | "completed"))
        })
    })
}

fn block(response: &mut Value, project_id: &str, document_id: Option<&str>, message: &str) {
    response["status"] = json!("error");
    response["answer"] = json!(message);
    response["conversationEvents"] = json!([{"id":knownext_core::compact_id("ai-event"),"projectId":project_id,"type":"provider_error","role":"assistant","content":message,"createdAt":knownext_core::now_iso(),"documentId":document_id,"path":null,"paths":[],"summary":null,"sourcesUsed":[]}]);
    response["operations"] = json!([{"type":"provider_error","status":"error","message":message,"documentId":document_id,"nodeId":null,"path":null,"paths":[],"summary":message,"task":null,"confirmationId":null}]);
    for field in [
        "editProposal",
        "drawingProposal",
        "updatedDocument",
        "updatedHandwrittenNote",
        "tree",
        "requiresConfirmation",
        "pendingIntent",
        "pendingIntentStatus",
        "task",
    ] {
        response[field] = Value::Null;
    }
    response["generatedImages"] = json!([]);
}

/// Preserve output data before stripping executable fields. Never store the
/// request envelope, context snapshots, generated-image prompts or credentials.
fn retain_output_for_review(
    api: &LocalApi,
    scope: &InteractionScope,
    response: &Value,
    image_results: &BTreeMap<usize, Value>,
    drawing_results: &BTreeMap<usize, Result<Value, String>>,
    reason: &str,
) -> Option<Value> {
    let mut outputs = Vec::new();
    let mut markdown = |name: &str, summary: &Value, text: Option<&str>| {
        if let Some(text) = text {
            outputs.push(json!({"id":format!("output-{}",outputs.len()),"name":name,"summary":summary.as_str().unwrap_or("Resultado pendiente de revisión"),"kind":"markdown","markdown":text}));
        }
    };
    markdown(
        "Documento propuesto",
        &response["updatedDocument"]["summary"],
        response["updatedDocument"]["markdown"].as_str(),
    );
    for operation in response["editProposal"]["operations"]
        .as_array()
        .into_iter()
        .flatten()
    {
        let diagram = operation["diagramCode"]
            .as_str()
            .map(|text| format!("```mermaid\n{text}\n```"));
        markdown(
            "Texto propuesto",
            &operation["summary"],
            operation["markdown"]
                .as_str()
                .or_else(|| operation["replacementMarkdown"].as_str())
                .or(diagram.as_deref()),
        );
    }
    for operation in response["operations"].as_array().into_iter().flatten() {
        if operation["type"] == "document_created" && operation["runtimeApplied"] != true {
            markdown(
                "Documento por crear",
                &operation["summary"],
                operation["markdown"].as_str(),
            );
        }
    }
    if ai_results::validate_handwritten(&response["updatedHandwrittenNote"]["content"]).is_ok() {
        outputs.push(json!({"id":format!("output-{}",outputs.len()),"name":"Nota a mano propuesta","summary":response["updatedHandwrittenNote"]["summary"].as_str().unwrap_or("Trazos propuestos"),"kind":"handwritten","content":response["updatedHandwrittenNote"]["content"]}));
    }
    for (index, image) in image_results {
        if image["status"] == "completed" && ai_results::image_bytes(image).is_ok() {
            outputs.push(json!({"id":format!("image-{index}"),"name":"Imagen generada","summary":"Imagen conservada sin sustituir el documento","kind":"image","dataBase64":image["dataBase64"],"format":image["format"]}));
        }
    }
    for (index, applied) in drawing_results {
        if let Ok(applied) = applied {
            if ai_results::validate_handwritten(&applied["content"]).is_ok() {
                outputs.push(json!({"id":format!("drawing-{index}"),"name":"Dibujo propuesto","summary":"Trazos conservados sin reemplazar tu nota","kind":"handwritten","content":applied["content"]}));
            }
        }
    }
    if outputs.is_empty() {
        return None;
    }
    let record = json!({
        "id":format!("{}:{}",scope.project_id,knownext_core::compact_id("ai-review")),
        "projectId":scope.project_id,"projectName":scope.project_name,"receivedAt":knownext_core::now_iso(),
        "reason":reason,"answer":response["answer"].as_str().unwrap_or(""),"outputs":outputs,
        "originProjectRootHash":sha256_hex(scope.root.to_string_lossy().as_bytes()),
        "appliedPaths":response["operations"].as_array().into_iter().flatten().filter(|op|op["runtimeApplied"]==true)
            .flat_map(|op|op["paths"].as_array().cloned().unwrap_or_default()).collect::<Vec<_>>()
    });
    Some(match api.preserve_ai_result(record.clone()) {
        Ok(result) => json!({"result":result,"stored":true}),
        Err(error) => json!({"result":record,"stored":false,"error":error}),
    })
}

impl CompletedAiInteraction {
    fn prepare_drawings(&self, api: &LocalApi) -> Option<drawings::PreparedDrawings> {
        if self.response["status"] != "completed" || self.validate_response(api).is_err() {
            return None;
        }
        Some(drawings::PreparedDrawings::prepare(
            api,
            &self.scope.project_id,
            &self.scope.runtime_body,
            &self.response,
            &self.scope.policy,
        ))
    }
    pub(super) fn execute_additional(mut self, api: &LocalApi) -> Self {
        let work = images::PreparedImages::prepare(&self, api);
        self.image_results =
            work.execute_with(knownext_ai::generate_image, || { api.spend_preflight(Some(&self.scope.project_id))?; self.validate_response(api) });
        if let Some(work) = self.prepare_drawings(api) {
            self.drawing_results = work
                .execute_with(knownext_drawing::apply_handwritten_drawing, || {
                    self.validate_response(api)
                });
        }
        self
    }
    fn validate_response(&self, api: &LocalApi) -> Result<(), String> {
        let scope = &self.scope;
        let project_id = scope.project_id.as_str();
        let same_root = self.same_root(api);
        if !same_root {
            return Err("El proyecto cambió o dejó de estar disponible. No se ha aplicado el resultado de IA.".into());
        }
        if scope.runtime_body["readOnly"]==true&&(["updatedDocument","updatedHandwrittenNote","editProposal","drawingProposal"].iter().any(|k|!self.response[*k].is_null())||self.response["operations"].as_array().into_iter().flatten().any(|op|matches!(op["type"].as_str(),Some("document_created"|"document_modified"|"handwritten_modified"|"handwritten_drawing_generated"|"image_generated"|"image_inserted"|"node_deleted"|"node_moved"|"folder_created"|"document_duplicated")))){return Err("La petición es de solo lectura; el contenido recibido no concede autoridad para modificar archivos".into());}
        let config = api.read_config_checked()?;
        if execution_policy(&config["ai"]) != scope.policy {
            return Err("La configuración de ejecución IA cambió mientras se esperaba. Revisa los ajustes; no se ha aplicado el resultado.".into());
        }
        let validate_target = |id: &str, handwritten: bool| -> Result<(), String> {
            if !handwritten
                && id == "user-notes"
                && scope.runtime_body["documentId"] == "user-notes"
            {
                return Ok(());
            }
            let (owner, relative) = document_ref(id)?;
            if owner != project_id {
                return Err("El resultado IA apunta a otro proyecto; no se ha aplicado".into());
            }
            let path = api.resolve_project_relative(project_id, &relative)?;
            let valid_type = if handwritten {
                is_handwritten_note_path(&path)
            } else {
                is_markdown_path(&path)
            };
            if !valid_type || !fs::metadata(&path).is_ok_and(|meta| meta.is_file()) {
                return Err("El destino IA no es un documento existente del tipo esperado".into());
            }
            Ok(())
        };
        for (field, id_field) in [
            ("updatedDocument", "documentId"),
            ("updatedHandwrittenNote", "noteId"),
            ("drawingProposal", "noteId"),
        ] {
            if let Some(id) = self.response[field][id_field].as_str() {
                validate_target(id, field != "updatedDocument")?;
            }
        }
        if self.response["editProposal"]["projectId"]
            .as_str()
            .is_some_and(|id| id != project_id)
        {
            return Err("La propuesta IA no pertenece al proyecto; no se ha aplicado".into());
        }
        for operation in self.response["editProposal"]["operations"]
            .as_array()
            .into_iter()
            .flatten()
        {
            if let Some(id) = operation["documentId"].as_str() {
                validate_target(id, false)?;
            }
        }
        for operation in self.response["operations"].as_array().into_iter().flatten() {
            if matches!(
                operation["type"].as_str(),
                Some(
                    "document_created"
                        | "document_modified"
                        | "handwritten_modified"
                        | "handwritten_drawing_generated"
                        | "image_generated"
                        | "image_inserted"
                )
            ) {
                for field in ["documentId", "noteId"] {
                    if let Some(id) = operation[field].as_str() {
                        validate_target(
                            id,
                            matches!(
                                operation["type"].as_str(),
                                Some("handwritten_modified" | "handwritten_drawing_generated")
                            ),
                        )?;
                    }
                }
            }
        }
        if self.response["operations"]
            .as_array()
            .into_iter()
            .flatten()
            .any(|op| {
                matches!(
                    op["type"].as_str(),
                    Some("node_deleted" | "node_moved" | "folder_created" | "document_duplicated")
                )
            })
        {
            return Err("La respuesta propone un efecto de archivos sin un ejecutor nativo validado. No se ha ejecutado.".into());
        }
        if self.response["operations"]
            .as_array()
            .into_iter()
            .flatten()
            .filter(|op| op["type"] == "handwritten_drawing_generated" && op["status"] == "ready")
            .count()
            > 1
        {
            return Err(
                "Una petición de dibujo debe aplicar una sola operación sobre su nota activa"
                    .into(),
            );
        }
        if (!self.response["updatedDocument"].is_null() || !self.response["editProposal"].is_null())
            && config["ai"]["permissions"]["editDocuments"] != true
        {
            return Err("El permiso de edición de documentos IA está desactivado".into());
        }
        if !self.response["updatedHandwrittenNote"].is_null()
            && config["ai"]["permissions"]["editHandwrittenNotes"] != true
        {
            return Err("El permiso de edición de notas a mano IA está desactivado".into());
        }
        if mutates_context(&self.response) {
            for (id, expected) in &scope.bases {
                let (_, relative) = document_ref(id)?;
                if context_fingerprint(&api.resolve_project_relative(project_id, &relative)?)?
                    != *expected
                {
                    return Err("El archivo del contexto cambió mientras se esperaba. Se conserva su contenido actual; revisa el documento antes de solicitar otra operación.".into());
                }
            }
            for base in &scope.draft_bases {
                let (_, relative) = document_ref(&base.id)?;
                let current = published_context(
                    api,
                    &base.id,
                    &api.resolve_project_relative(project_id, &relative)?,
                )?;
                if current.content_hash != base.published_hash
                    && base.submitted_hash.as_deref() != Some(current.content_hash.as_str())
                {
                    return Err("El borrador conservado cambió mientras se esperaba. No se ha reemplazado su contenido con el resultado IA.".into());
                }
            }
        }
        Ok(())
    }

    fn same_root(&self, api: &LocalApi) -> bool {
        api.project_root(&self.scope.project_id)
            .ok()
            .and_then(|root| root.canonicalize().ok())
            .is_some_and(|root| root == self.scope.root)
    }

    pub(super) fn commit(mut self, api: &LocalApi) -> Value {
        // Native acknowledgements cannot be supplied by a model response.
        if let Some(object) = self.response.as_object_mut() {
            object.remove("retainedResult");
            object.remove("originProjectRootHash");
        }
        self.response["tree"] = Value::Null;
        if let Some(object)=self.response.as_object_mut(){object.remove("treeAvailable");object.remove("treeWarning");}
        self.response["affectedDocuments"] = json!([]);
        self.response["generatedImages"] = json!([]);
        for field in ["updatedDocument","updatedHandwrittenNote"]{if let Some(object)=self.response[field].as_object_mut(){object.remove("draftWriteRevision");object.remove("draftWriteConflict");}}
        if let Some(operations) = self.response["operations"].as_array_mut() {
            for operation in operations {
                if let Some(object) = operation.as_object_mut() {
                    object.remove("runtimeApplied");
                    object.remove("aiChange");
                }
            }
        }
        let scope = &self.scope;
        let project_id = scope.project_id.as_str();
        // Provider usage is recorded even when local application is rejected or fails.
        for generated in self
            .image_results
            .values()
            .filter(|image| image["status"] == "completed" || image["usage"].is_object())
        {
            let usage = &generated["usage"];
            let input = usage["input_tokens"].as_u64().unwrap_or(0);
            let output = usage["output_tokens"].as_u64().unwrap_or(0);
            if let Err(error)=api.record_ai_usage(json!({"projectId":project_id,"interactionId":self.response["interactionId"],"capability":"image_generation","model":generated["model"].as_str().unwrap_or("gpt-image-2"),"providerUsage":usage,"usageSource":if usage.is_object(){"provider"}else{"estimated"},"inputTokens":input,"cachedInputTokens":usage["input_tokens_details"]["cached_tokens"].as_u64().unwrap_or(0),"outputTokens":output,"reasoningTokens":0,"embeddingTokens":0,"totalTokens":usage["total_tokens"].as_u64().unwrap_or_else(||input.saturating_add(output))})){self.response["usageWarning"]=json!(error);}
        }
        let same_root = api
            .project_root(project_id)
            .ok()
            .and_then(|root| root.canonicalize().ok())
            .is_some_and(|root| root == scope.root);
        let admission=api.project_write(project_id);
        let guard = admission.as_ref().map(|_|()).map_err(Clone::clone).and_then(|_|self.validate_response(api));
        if let Err(message) = guard {
            let retained = retain_output_for_review(
                api,
                scope,
                &self.response,
                &self.image_results,
                &self.drawing_results,
                &message,
            );
            block(
                &mut self.response,
                project_id,
                scope.runtime_body["documentId"].as_str(),
                &message,
            );
            if let Some(retained) = retained {
                self.response["retainedResult"] = retained;
            }
        } else {
            if let Err(error) =
                api.apply_ai_document_creations(project_id, &scope.runtime_body, &mut self.response)
            {
                let retained=retain_output_for_review(api,scope,&self.response,&self.image_results,&self.drawing_results,&error);
                api.mark_ai_response_error(
                    project_id,
                    scope.runtime_body["documentId"].as_str(),
                    &mut self.response,
                    &error,
                );
                if let Some(retained)=retained{self.response["retainedResult"]=retained;}
            }
            // Image calls already ran outside this lock. Local drawing calculation
            // still requires extraction; do not claim all long work is separated.
            if self.response["status"] == "completed" {
                if let Err(error) = api.apply_ai_image_generations(
                    project_id,
                    &scope.runtime_body,
                    &mut self.response,
                    &self.image_results,
                ) {
                    let retained = retain_output_for_review(
                        api,
                        scope,
                        &self.response,
                        &self.image_results,
                        &self.drawing_results,
                        &error,
                    );
                    api.mark_ai_response_error(
                        project_id,
                        scope.runtime_body["documentId"].as_str(),
                        &mut self.response,
                        &error,
                    );
                    if let Some(retained) = retained {
                        self.response["retainedResult"] = retained;
                    }
                }
            }
            if self.response["status"] == "completed" {
                if let Err(error) = api.apply_ai_handwritten_drawings(
                    project_id,
                    &scope.runtime_body,
                    &mut self.response,
                    &self.drawing_results,
                ) {
                    let retained = retain_output_for_review(
                        api,
                        scope,
                        &self.response,
                        &self.image_results,
                        &self.drawing_results,
                        &error,
                    );
                    api.mark_ai_response_error(
                        project_id,
                        scope.runtime_body["handwrittenNoteId"]
                            .as_str()
                            .or_else(|| scope.runtime_body["documentId"].as_str()),
                        &mut self.response,
                        &error,
                    );
                    if let Some(retained) = retained {
                        self.response["retainedResult"] = retained;
                    }
                }
            }
        }
        let mut events = scope.user_event.clone().into_iter().collect::<Vec<_>>();
        events.extend(
            self.response["conversationEvents"]
                .as_array()
                .cloned()
                .unwrap_or_default(),
        );
        self.response["conversationEvents"] = json!(events);
        // Do not recreate per-project conversation state after removal/repointing.
        if same_root {
            if let Err(error)=api.append_ai_conversation_events(project_id, events) {
                self.response["conversationWarning"]=json!(error);
            }
        }
        if let Err(error)=api.record_ai_usage_records(
            project_id,
            self.response["interactionId"].as_str().unwrap_or("ai"),
            &self.response,
        ){self.response["usageWarning"]=json!(error);}
        self.response["originProjectRootHash"] =
            json!(sha256_hex(scope.root.to_string_lossy().as_bytes()));
        self.response["requiresEditConfirmation"] = json!(
            scope.policy["agentic"]["confirmBeforeApplying"] != false
                || self.response["needsUserClarification"] == true
                || self.response["executionScope"].as_str() != Some("direct_action")
        );
        // A normal manual proposal needs a durable output copy before leaving Rust too.
        // Existing rejection receipts already own their copy; never store executable offsets/base.
        let manual_text = self.response["requiresEditConfirmation"] == true
            && (self.response["updatedDocument"]["markdown"].is_string()
                || (self.response["editProposal"]["status"] == "proposed"
                    && self.response["editProposal"]["operations"].as_array().is_some_and(|ops| !ops.is_empty())));
        if manual_text && self.response.get("retainedResult").is_none() {
            if let Some(retained) = retain_output_for_review(api, scope, &self.response, &BTreeMap::new(), &BTreeMap::new(),
                "Copia de la propuesta recibida para revisión. Se conserva también después de aplicar cambios, hasta que la quites. Tras reiniciar puedes compararla o guardar una copia; no se ejecutan operaciones antiguas.") {
                self.response["retainedResult"] = retained;
            }
        }
        self.response
    }
}

#[cfg(test)]
pub(super) fn drawing_results_for_test(
    api: &LocalApi,
    project: &str,
    body: &Value,
    response: &Value,
) -> BTreeMap<usize, Result<Value, String>> {
    drawings::PreparedDrawings::prepare(
        api,
        project,
        body,
        response,
        &api.read_config_checked().unwrap()["ai"],
    )
    .execute_with(knownext_drawing::apply_handwritten_drawing, || Ok(()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{mpsc, Arc};

    struct Fixture {
        _dir: tempfile::TempDir,
        api: LocalApi,
        project: String,
        root: PathBuf,
    }
    fn fixture() -> Fixture {
        let dir = tempfile::tempdir().unwrap();
        let api = LocalApi::new(dir.path().join("state"), "test".into(), "test".into());
        let root = dir.path().join("project");
        let project = api
            .create_project(
                json!({"name":"AI concurrency QA","folderPath":root,"versioningMode":"none"}),
            )
            .unwrap()["id"]
            .as_str()
            .unwrap()
            .to_string();
        fs::write(root.join("a.md"), "# Context\nOriginal").unwrap();
        fs::write(root.join("b.md"), "# Other\nOriginal").unwrap();
        Fixture {
            _dir: dir,
            api,
            project,
            root,
        }
    }
    fn request(project: &str) -> Value {
        json!({"projectId":project,"documentId":doc_id(project,"a.md"),"targetKind":"markdown_document","prompt":"QA fixture","activeMarkdown":"# Context\nOriginal","mode":"document","executionMode":"quick"})
    }
    fn response(operations: Value) -> Value {
        json!({"interactionId":"ai-concurrency-qa","status":"completed","display":"bubble","uiPlacement":"document_bubble","interactionType":"chat","confidence":"high","executionMode":"quick","reasoningDepth":"light","routeToAiTab":false,"needsUserClarification":false,"answer":"QA completed","conversationEvents":[],"operations":operations,"affectedDocuments":[],"usageRecords":[]})
    }
    fn creation() -> Value {
        json!([{"type":"document_created","status":"ready","name":"created.md","markdown":"# Created"}])
    }
    #[test]
    fn project_mutation_fence_retains_an_arrived_ai_result_without_applying_or_repeating_generation(){
        let f=fixture();let work=f.api.prepare_ai_interaction(&f.project,request(&f.project)).unwrap();let output=completed(work,creation());
        let (entered,ready)=mpsc::channel();let(release,resume)=mpsc::channel();let worker=f.api.clone();let project=f.project.clone();
        let transaction=thread::spawn(move||{let _permit=worker.project_transaction(&project).unwrap();entered.send(()).unwrap();resume.recv_timeout(Duration::from_secs(5)).unwrap();});
        ready.recv_timeout(Duration::from_secs(5)).unwrap();let response=output.commit(&f.api);
        assert_eq!(response["status"],"error");assert_eq!(response["retainedResult"]["stored"],true);assert!(!f.root.join("created.md").exists());
        release.send(()).unwrap();transaction.join().unwrap();assert!(!f.root.join("created.md").exists());
        let retained=f.api.list_ai_results().unwrap();assert_eq!(retained["results"].as_array().unwrap().len(),1);
        assert_eq!(fs::read_to_string(f.root.join("a.md")).unwrap(),"# Context\nOriginal");
    }
    fn image_operation() -> Value {
        json!({"type":"image_generated","status":"ready","prompt":"Synthetic test image","name":"qa.png","altText":"A synthetic image","insertIntoDocument":true,"documentId":null})
    }
    fn generated_image() -> Value {
        json!({"status":"completed","format":"png","dataBase64":"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jXioAAAAASUVORK5CYII=","model":"gpt-image-2","usage":{"input_tokens":7,"output_tokens":2}})
    }
    #[test]
    fn image_provider_wait_allows_saves_and_rejected_image_survives_with_usage() {
        let f = fixture();
        f.api
            .update_ai_config(json!({"imageGeneration":{"enabled":true}}))
            .unwrap();
        let mutations = Arc::new(Mutex::new(f.api.clone()));
        let queue = Arc::new(Mutex::new(()));
        let (started_tx, started_rx) = mpsc::channel();
        let (release_tx, release_rx) = mpsc::channel();
        let worker_api = mutations.clone();
        let worker_queue = queue.clone();
        let project = f.project.clone();
        let worker = thread::spawn(move || {
            dispatch_with_images(
                &worker_api,
                &worker_queue,
                &project,
                request(&project),
                |work| completed(work, json!([image_operation()])),
                |key, _, _| {
                    assert!(key.is_none());
                    started_tx.send(()).unwrap();
                    release_rx.recv_timeout(Duration::from_secs(5)).unwrap();
                    generated_image()
                },
            )
        });
        started_rx.recv_timeout(Duration::from_secs(5)).unwrap();
        let api = mutations
            .try_lock()
            .expect("image wait retained document authority");
        let id = doc_id(&f.project, "b.md");
        api.handle("PUT",&format!("/api/documents/{id}"),json!({"markdown":"# Saved during image wait","baseFingerprint":api.fingerprint(&f.root.join("b.md"))}),vec![]).unwrap();
        api.update_ai_config(json!({"permissions":{"createImageAssets":false}}))
            .unwrap();
        drop(api);
        release_tx.send(()).unwrap();
        let response = worker.join().unwrap().unwrap().body;
        assert_eq!(response["status"], "error");
        assert_eq!(response["retainedResult"]["stored"], true);
        let output = &response["retainedResult"]["result"]["outputs"][0];
        assert_eq!(output["kind"], "image");
        assert!(
            f.api.read_json(&f.api.ai_usage_path(), Value::Null)["entries"]
                .as_array()
                .unwrap()
                .iter()
                .any(|entry| entry["capability"] == "image_generation")
        );
        assert!(!f.root.join("assets").exists());
        assert!(fs::read_to_string(f.root.join("b.md"))
            .unwrap()
            .contains("during image wait"));
        let restarted = LocalApi::new(f.api.app_data_dir.clone(), "test".into(), "test".into());
        let record = restarted.list_ai_results().unwrap()["results"][0].clone();
        let copy = restarted
            .copy_ai_result(
                record["id"].as_str().unwrap(),
                json!({"outputId":output["id"]}),
            )
            .unwrap();
        assert!(copy["node"]["path"].as_str().unwrap().ends_with(".png"));
        assert_eq!(
            fs::read(f.root.join(copy["node"]["path"].as_str().unwrap())).unwrap(),
            ai_results::image_bytes(&generated_image()).unwrap()
        );
    }
    #[test]
    fn asset_creation_failure_keeps_image_and_usage_and_preflight_has_no_folder_side_effects() {
        let f = fixture();
        f.api.update_ai_config(json!({"imageGeneration":{"enabled":true,"defaultFolder":"custom_folder","customFolderPath":".git/generated"}})).unwrap();
        let mutations = Mutex::new(f.api.clone());
        let queue = Mutex::new(());
        let result = dispatch_with_images(
            &mutations,
            &queue,
            &f.project,
            request(&f.project),
            |work| completed(work, json!([image_operation()])),
            |_, _, _| panic!("invalid path consumed a provider"),
        )
        .unwrap()
        .body;
        assert_eq!(result["status"], "error");
        assert!(!f.root.join(".git").exists());
        f.api.update_ai_config(json!({"imageGeneration":{"enabled":true,"defaultFolder":"custom_folder","customFolderPath":"occupied/subfolder"}})).unwrap();
        let result = dispatch_with_images(
            &mutations,
            &queue,
            &f.project,
            request(&f.project),
            |work| completed(work, json!([image_operation()])),
            |_, _, _| {
                fs::write(f.root.join("occupied"), "Keep existing file").unwrap();
                generated_image()
            },
        )
        .unwrap()
        .body;
        assert_eq!(result["status"], "error");
        assert_eq!(result["retainedResult"]["stored"], true);
        assert_eq!(
            fs::read_to_string(f.root.join("occupied")).unwrap(),
            "Keep existing file"
        );
    }
    #[test]
    fn images_obey_per_request_limit_and_revalidate_before_next_provider_call() {
        let f = fixture();
        f.api
            .update_ai_config(json!({"imageGeneration":{"enabled":true,"maxImagesPerPrompt":2}}))
            .unwrap();
        let mutations = Mutex::new(f.api.clone());
        let queue = Mutex::new(());
        let mut calls = 0;
        let result = dispatch_with_images(
            &mutations,
            &queue,
            &f.project,
            request(&f.project),
            |work| {
                completed(
                    work,
                    json!([image_operation(), image_operation(), image_operation()]),
                )
            },
            |_, _, _| {
                calls += 1;
                f.api
                    .update_ai_config(json!({"permissions":{"generateImages":false}}))
                    .unwrap();
                generated_image()
            },
        )
        .unwrap()
        .body;
        assert_eq!(calls, 1);
        assert_eq!(result["status"], "error");
        assert_eq!(
            result["retainedResult"]["result"]["outputs"]
                .as_array()
                .unwrap()
                .len(),
            1
        );
    }
    #[test]
    fn image_asset_ack_is_native_and_insertion_is_a_reviewable_proposal() {
        let f = fixture();
        f.api
            .update_ai_config(
                json!({"imageGeneration":{"enabled":true,"confirmBeforeDocumentInsert":false}}),
            )
            .unwrap();
        let result = dispatch_with_images(
            &Mutex::new(f.api.clone()),
            &Mutex::new(()),
            &f.project,
            request(&f.project),
            |work| completed(work, json!([image_operation()])),
            |_, _, _| generated_image(),
        )
        .unwrap()
        .body;
        assert_eq!(result["status"], "completed");
        assert_eq!(result["operations"][0]["runtimeApplied"], true);
        assert!(f
            .root
            .join(result["operations"][0]["path"].as_str().unwrap())
            .exists());
        assert!(result["updatedDocument"]["markdown"]
            .as_str()
            .unwrap()
            .contains("!["));
        assert!(result["generatedImages"][0]["insertedIntoDocumentId"].is_null());
        assert_eq!(
            fs::read_to_string(f.root.join("a.md")).unwrap(),
            "# Context\nOriginal"
        );
    }
    #[test]
    fn local_drawing_wait_allows_saves_and_keeps_newer_strokes_with_review_copy() {
        let f = fixture();
        let created = f
            .api
            .create_handwritten_note(&f.project, json!({"name":"drawing.knote"}))
            .unwrap();
        let id = created["node"]["id"].as_str().unwrap().to_string();
        let record = f.api.get_handwritten_note(&id).unwrap();
        let body = json!({"projectId":f.project,"handwrittenNoteId":id,"targetKind":"handwritten_note","prompt":"Synthetic scene","activeHandwrittenContent":record["content"],"activeHandwrittenBaseFingerprint":record["baseFingerprint"],"activeHandwrittenDraftContentHash":null,"mode":"document","executionMode":"quick"});
        let mutations = Arc::new(Mutex::new(f.api.clone()));
        let queue = Arc::new(Mutex::new(()));
        let (started_tx, started_rx) = mpsc::channel();
        let (release_tx, release_rx) = mpsc::channel();
        let worker_api = mutations.clone();
        let worker_queue = queue.clone();
        let project = f.project.clone();
        let worker_id = id.clone();
        let worker = thread::spawn(move || {
            dispatch_with_phases(
                &worker_api,
                &worker_queue,
                &project,
                body,
                |work| {
                    completed(
                        work,
                        json!([{"type":"handwritten_drawing_generated","status":"ready","noteId":worker_id,"replacementPolicy":"append_only"}]),
                    )
                },
                |_, _, _| panic!("drawing must not consume an image provider"),
                |content, _, _| {
                    started_tx.send(()).unwrap();
                    release_rx.recv_timeout(Duration::from_secs(5)).unwrap();
                    let mut content = content.clone();
                    content["title"] = json!("Calculated output");
                    Ok(json!({"content":content,"pageId":"page-1"}))
                },
            )
        });
        started_rx.recv_timeout(Duration::from_secs(5)).unwrap();
        let api = mutations
            .try_lock()
            .expect("drawing calculation retained mutation authority");
        let mut newer = record["content"].clone();
        newer["title"] = json!("Newer local strokes");
        api.save_handwritten_note_draft(
            &id,
            json!({"content":newer,"baseFingerprint":record["baseFingerprint"]}),
        )
        .unwrap();
        drop(api);
        release_tx.send(()).unwrap();
        let result = worker.join().unwrap().unwrap().body;
        assert_eq!(result["status"], "error");
        assert_eq!(
            f.api.get_handwritten_note(&id).unwrap()["content"]["title"],
            "Newer local strokes"
        );
        assert_eq!(result["retainedResult"]["stored"], true);
        assert_eq!(
            result["retainedResult"]["result"]["outputs"][0]["content"]["title"],
            "Calculated output"
        );
    }
    #[test]
    fn interrupted_image_phase_keeps_prior_result_partial_ack_and_does_not_poison_queue() {
        let f = fixture();
        f.api
            .update_ai_config(json!({"imageGeneration":{"enabled":true,"maxImagesPerPrompt":2}}))
            .unwrap();
        let mutations = Mutex::new(f.api.clone());
        let queue = Mutex::new(());
        let mut calls = 0;
        let result = dispatch_with_images(
            &mutations,
            &queue,
            &f.project,
            request(&f.project),
            |work| completed(work, json!([image_operation(), image_operation()])),
            |_, _, _| {
                calls += 1;
                if calls == 2 {
                    panic!("Controlled second image interruption");
                }
                generated_image()
            },
        )
        .unwrap()
        .body;
        assert_eq!(calls, 2);
        assert_eq!(result["status"], "error");
        assert_eq!(result["operations"][0]["runtimeApplied"], true);
        assert!(f
            .root
            .join(result["operations"][0]["path"].as_str().unwrap())
            .exists());
        assert_eq!(result["retainedResult"]["stored"], true);
        assert!(queue.try_lock().is_ok());
        assert!(mutations.try_lock().is_ok());
    }
    #[test]
    fn block5_ai_creation_trace_failure_retains_output_before_error_projection(){
        let f=fixture();let output=completed(f.api.prepare_ai_interaction(&f.project,request(&f.project)).unwrap(),creation());
        let dir=f.api.app_data_dir.join("ai-changes");fs::create_dir_all(&dir).unwrap();let file=dir.join("ai-change-future.json");let future=b"{\"schemaVersion\":99,\"retain\":\"owned future content\"}";fs::write(&file,future).unwrap();
        let response=output.commit(&f.api);assert_eq!(response["status"],"error");assert!(!f.root.join("created.md").exists());assert_eq!(response["retainedResult"]["stored"],true,"{response}");assert!(response["retainedResult"]["result"]["outputs"].as_array().unwrap().iter().any(|item|item["markdown"]=="# Created"));assert_eq!(fs::read(&file).unwrap(),future);
    }
    #[test]
    fn rejected_output_survives_restart_without_request_envelope_and_copies_separately() {
        let f = fixture();
        let mut body = request(&f.project);
        body["prompt"] = json!("PRIVATE REQUEST NOT FOR OUTPUT STORE");
        let work = f.api.prepare_ai_interaction(&f.project, body).unwrap();
        let mut finished = completed(work, creation());
        finished.response["updatedDocument"] = json!({"documentId":doc_id(&f.project,"a.md"),"markdown":"# Useful rejected output","summary":"Proposed edit"});
        finished.response["apiKey"] = json!("DO NOT STORE KEY");
        fs::write(f.root.join("a.md"), "# New local content").unwrap();
        let result = finished.commit(&f.api);
        assert_eq!(result["status"], "error");
        assert_eq!(result["retainedResult"]["stored"], true);
        assert!(result["updatedDocument"].is_null());
        assert!(!f.root.join("created.md").exists());
        let restarted = LocalApi::new(f.api.app_data_dir.clone(), "test".into(), "test".into());
        let saved = restarted.list_ai_results().unwrap()["results"][0].clone();
        assert_eq!(saved, result["retainedResult"]["result"]);
        assert_eq!(saved["outputs"].as_array().unwrap().len(), 2);
        assert!(!saved.to_string().contains("PRIVATE REQUEST"));
        assert!(!saved.to_string().contains("DO NOT STORE KEY"));
        let copy = restarted
            .copy_ai_result(
                saved["id"].as_str().unwrap(),
                json!({"outputId":saved["outputs"][0]["id"]}),
            )
            .unwrap();
        assert_eq!(
            fs::read_to_string(f.root.join(copy["node"]["path"].as_str().unwrap())).unwrap(),
            "# Useful rejected output"
        );
        assert_eq!(
            fs::read_to_string(f.root.join("a.md")).unwrap(),
            "# New local content"
        );
    }
    #[test]
    fn failed_native_preservation_returns_output_for_ram_review_and_never_overwrites_store() {
        let f = fixture();
        let work = f
            .api
            .prepare_ai_interaction(&f.project, request(&f.project))
            .unwrap();
        let finished = completed(work, creation());
        fs::write(f.api.app_data_dir.join("ai-results"), "Keep corrupt store").unwrap();
        fs::write(f.root.join("a.md"), "# New local content").unwrap();
        let result = finished.commit(&f.api);
        assert_eq!(result["retainedResult"]["stored"], false);
        assert_eq!(
            result["retainedResult"]["result"]["outputs"][0]["markdown"],
            "# Created"
        );
        assert!(result["retainedResult"]["error"].is_string());
        assert_eq!(
            fs::read_to_string(f.api.app_data_dir.join("ai-results")).unwrap(),
            "Keep corrupt store"
        );
    }
    #[test]
    fn model_cannot_supply_a_native_review_acknowledgement() {
        let f = fixture();
        let work = f
            .api
            .prepare_ai_interaction(&f.project, request(&f.project))
            .unwrap();
        let mut finished = completed(work, json!([]));
        finished.response["retainedResult"] = json!({"stored":true,"result":{"id":"spoofed"}});
        assert!(finished.commit(&f.api).get("retainedResult").is_none());
    }
    #[test]
    fn manual_proposal_is_durable_before_delivery_without_prompt_base_or_executable_offsets() {
        let f=fixture();let mut body=request(&f.project);body["prompt"]=json!("PRIVATE PROMPT NOT FOR RETENTION");
        let work=f.api.prepare_ai_interaction(&f.project,body).unwrap();let mut finished=completed(work,json!([]));
        finished.response["retainedResult"]=json!({"stored":true,"result":{"id":"model-forged"}});
        finished.response["editProposal"]=json!({"id":"proposal","status":"proposed","operations":[{"id":"edit","action":"replace_range","documentId":doc_id(&f.project,"a.md"),"replacementMarkdown":"Generated paragraph","summary":"Edit","expectedMarkdown":"PRIVATE BASE NOT FOR RETENTION","from":2,"to":9}]});
        let result=finished.commit(&f.api);assert_eq!(result["requiresEditConfirmation"],true);assert_eq!(result["retainedResult"]["stored"],true);
        let restarted=LocalApi::new(f.api.app_data_dir.clone(),"test".into(),"test".into());let saved=restarted.list_ai_results().unwrap()["results"][0].clone();
        assert_eq!(saved,result["retainedResult"]["result"]);assert_eq!(saved["outputs"][0]["markdown"],"Generated paragraph");
        for excluded in ["PRIVATE PROMPT","PRIVATE BASE","expectedMarkdown","replacementMarkdown","model-forged","\"from\"","\"to\""] {assert!(!saved.to_string().contains(excluded));}
        assert_eq!(fs::read_to_string(f.root.join("a.md")).unwrap(),"# Context\nOriginal");
    }
    #[test]
    fn normal_updated_document_retention_failure_returns_output_for_manual_session_review() {
        let f=fixture();fs::write(f.api.app_data_dir.join("ai-results"),"Keep existing state").unwrap();
        let work=f.api.prepare_ai_interaction(&f.project,request(&f.project)).unwrap();let mut finished=completed(work,json!([]));
        finished.response["updatedDocument"]=json!({"documentId":doc_id(&f.project,"a.md"),"markdown":"# Manual output","summary":"Edit"});
        let result=finished.commit(&f.api);assert_eq!(result["requiresEditConfirmation"],true);assert_eq!(result["retainedResult"]["stored"],false);assert!(result["retainedResult"]["error"].is_string());assert_eq!(result["updatedDocument"]["markdown"],"# Manual output");
        assert_eq!(fs::read_to_string(f.api.app_data_dir.join("ai-results")).unwrap(),"Keep existing state");
    }
    #[test]
    fn direct_policy_does_not_add_automatic_retention_for_normal_text_response() {
        let f=fixture();f.api.update_ai_config(json!({"agentic":{"confirmBeforeApplying":false}})).unwrap();
        let work=f.api.prepare_ai_interaction(&f.project,request(&f.project)).unwrap();let mut finished=completed(work,json!([]));
        finished.response["executionScope"]=json!("direct_action");finished.response["updatedDocument"]=json!({"documentId":doc_id(&f.project,"a.md"),"markdown":"# Direct output","summary":"Edit"});
        let result=finished.commit(&f.api);assert_eq!(result["requiresEditConfirmation"],false);assert!(result.get("retainedResult").is_none());assert!(f.api.list_ai_results().unwrap()["results"].as_array().unwrap().is_empty());
    }
    fn completed(work: PreparedAiInteraction, operations: Value) -> CompletedAiInteraction {
        work.execute_with(|_, _, _, key, _| {
            assert!(key.is_none(), "fixture must not have a provider credential");
            response(operations)
        })
    }

    #[test]
    fn unreadable_ai_state_blocks_execution_and_late_history_failure_preserves_the_answer(){
        let f=fixture();let mutations=Mutex::new(f.api.clone());let queue=Mutex::new(());
        for path in [f.api.conversation_path(&f.project),f.api.context_sources_path(&f.project)] {
            fs::create_dir_all(path.parent().unwrap()).unwrap();fs::write(&path,b"{ broken owned state").unwrap();
            let result=dispatch_with(&mutations,&queue,&f.project,request(&f.project),|_|panic!("provider executed with unreadable state"));
            assert!(result.is_err());assert_eq!(fs::read(&path).unwrap(),b"{ broken owned state");fs::remove_file(path).unwrap();
        }
        let path=f.api.conversation_path(&f.project);f.api.write_json(&path,&json!({"events":[]})).unwrap();let original=fs::read(&path).unwrap();
        let permissions=fs::metadata(&path).unwrap().permissions();let mut readonly=permissions.clone();readonly.set_readonly(true);fs::set_permissions(&path,readonly).unwrap();
        let result=dispatch_with(&mutations,&queue,&f.project,request(&f.project),|work|completed(work,json!([])));
        fs::set_permissions(&path,permissions).unwrap();let response=result.unwrap().body;
        assert_eq!(response["answer"],"QA completed");assert!(response["conversationWarning"].is_string());assert!(!response["conversationEvents"].as_array().unwrap().is_empty());assert_eq!(fs::read(&path).unwrap(),original);
    }

    #[test]
    fn text_provider_wait_allows_another_document_to_save() {
        let f = fixture();
        let mutations = Arc::new(Mutex::new(f.api.clone()));
        let queue = Arc::new(Mutex::new(()));
        let (started_tx, started_rx) = mpsc::channel();
        let (release_tx, release_rx) = mpsc::channel();
        let worker_api = mutations.clone();
        let worker_queue = queue.clone();
        let project = f.project.clone();
        let worker = thread::spawn(move || {
            dispatch_with(
                &worker_api,
                &worker_queue,
                &project,
                request(&project),
                |work| {
                    started_tx.send(()).unwrap();
                    release_rx.recv_timeout(Duration::from_secs(5)).unwrap();
                    completed(work, json!([]))
                },
            )
        });
        started_rx.recv_timeout(Duration::from_secs(5)).unwrap();
        let api = mutations
            .try_lock()
            .expect("provider retained mutation authority");
        let id = doc_id(&f.project, "b.md");
        let base = api.fingerprint(&f.root.join("b.md"));
        let saved = api
            .handle(
                "PUT",
                &format!("/api/documents/{id}"),
                json!({"markdown":"# Other\nSaved while AI waits","baseFingerprint":base}),
                vec![],
            )
            .unwrap();
        assert_eq!(saved.status, 200);
        assert!(fs::read_to_string(f.root.join("b.md"))
            .unwrap()
            .contains("Saved while AI waits"));
        drop(api);
        release_tx.send(()).unwrap();
        let result = worker.join().unwrap().unwrap();
        assert_eq!(result.body["status"], "completed");
        assert_eq!(result.body["interactionId"], "ai-concurrency-qa");
    }

    #[test]
    fn commit_waits_for_mutation_authority_and_preserves_provider_serialisation() {
        let f = fixture();
        let mutations = Arc::new(Mutex::new(f.api.clone()));
        let queue = Arc::new(Mutex::new(()));
        let (started_tx, started_rx) = mpsc::channel();
        let (release_tx, release_rx) = mpsc::channel();
        let (done_tx, done_rx) = mpsc::channel();
        let worker_api = mutations.clone();
        let worker_queue = queue.clone();
        let project = f.project.clone();
        let worker = thread::spawn(move || {
            let result = dispatch_with(
                &worker_api,
                &worker_queue,
                &project,
                request(&project),
                |work| {
                    started_tx.send(()).unwrap();
                    release_rx.recv_timeout(Duration::from_secs(5)).unwrap();
                    completed(work, creation())
                },
            );
            done_tx.send(result).unwrap();
        });
        started_rx.recv_timeout(Duration::from_secs(5)).unwrap();
        assert!(
            queue.try_lock().is_err(),
            "interactive provider queue was released early"
        );
        let guard = mutations.lock().unwrap();
        release_tx.send(()).unwrap();
        assert!(done_rx.recv_timeout(Duration::from_millis(80)).is_err());
        assert!(!f.root.join("created.md").exists());
        drop(guard);
        let response = done_rx
            .recv_timeout(Duration::from_secs(5))
            .unwrap()
            .unwrap();
        worker.join().unwrap();
        assert_eq!(response.body["status"], "completed");
        assert_eq!(
            fs::read_to_string(f.root.join("created.md")).unwrap(),
            "# Created"
        );
        assert!(queue.try_lock().is_ok());
    }

    #[test]
    fn changed_execution_authority_blocks_results_without_automatic_retry() {
        let f = fixture();
        let work = f
            .api
            .prepare_ai_interaction(&f.project, request(&f.project))
            .unwrap();
        f.api
            .update_config(json!({"ai":{"permissions":{"createDocuments":false}}}))
            .unwrap();
        let mut finished = completed(work, creation());
        finished.response["usageRecords"] = json!([{"model":"gpt-5.4-mini","capability":"text","inputTokens":7,"outputTokens":3,"totalTokens":10,"estimatedCost":0.0001,"usageSource":"provider"}]);
        let result = finished.commit(&f.api);
        assert_eq!(result["status"], "error");
        assert!(result["answer"].as_str().unwrap().contains("configuración"));
        assert!(!f.root.join("created.md").exists());
        assert!(result["editProposal"].is_null());
        let usage = f.api.read_json(&f.api.ai_usage_path(), Value::Null);
        assert_eq!(usage["entries"][0]["inputTokens"], 7);
        assert_eq!(usage["entries"][0]["interactionId"], "ai-concurrency-qa");
    }

    #[test]
    fn saved_context_change_blocks_mutation_but_allows_a_read_only_answer() {
        let f = fixture();
        let work = f
            .api
            .prepare_ai_interaction(&f.project, request(&f.project))
            .unwrap();
        fs::write(f.root.join("a.md"), "# New saved context").unwrap();
        let result = completed(work, creation()).commit(&f.api);
        assert_eq!(result["status"], "error");
        assert!(!f.root.join("created.md").exists());
        assert_eq!(
            fs::read_to_string(f.root.join("a.md")).unwrap(),
            "# New saved context"
        );
        let mut current_request = request(&f.project);
        current_request["activeMarkdown"] = json!("# New saved context");
        let work = f
            .api
            .prepare_ai_interaction(&f.project, current_request)
            .unwrap();
        fs::write(f.root.join("a.md"), "# Newer saved context").unwrap();
        assert_eq!(
            completed(work, json!([])).commit(&f.api)["status"],
            "completed"
        );
    }

    #[test]
    fn repointed_project_is_not_a_target_for_an_old_result() {
        let f = fixture();
        let work = f
            .api
            .prepare_ai_interaction(&f.project, request(&f.project))
            .unwrap();
        let other = f._dir.path().join("other");
        fs::create_dir(&other).unwrap();
        let location=f.api.review_project_location(&f.project,json!({"folderPath":other})).unwrap();
        f.api
            .update_project(&f.project, json!({"folderPath":other,"locationReview":{"registryRevision":location["registryRevision"],"folderStamp":location["folderStamp"],"candidatePath":location["candidatePath"]}}))
            .unwrap();
        assert_eq!(
            completed(work, creation()).commit(&f.api)["status"],
            "error"
        );
        assert!(!other.join("created.md").exists());
        assert!(!f.root.join("created.md").exists());
        assert!(!f.api.conversation_path(&f.project).exists());
    }

    #[test]
    fn preparation_rejects_foreign_missing_and_oversized_contexts_and_keeps_notes_supported() {
        let f = fixture();
        let mut body = request(&f.project);
        body["documentId"] = json!("other::a.md");
        assert!(f.api.prepare_ai_interaction(&f.project, body).is_err());
        let mut body = request(&f.project);
        body["documentId"] = json!(doc_id(&f.project, "absent.md"));
        assert!(f.api.prepare_ai_interaction(&f.project, body).is_err());
        let mut body = request(&f.project);
        body["targetKind"] = json!("notes");
        body["documentId"] = json!("user-notes");
        assert!(f.api.prepare_ai_interaction(&f.project, body).is_ok());
        fs::OpenOptions::new()
            .write(true)
            .open(f.root.join("a.md"))
            .unwrap()
            .set_len(MAX_CONTEXT_FILE + 1)
            .unwrap();
        assert!(f
            .api
            .prepare_ai_interaction(&f.project, request(&f.project))
            .is_err());
        assert!(f.api.prepare_ai_interaction(&f.project, json!([])).is_err());
    }

    #[test]
    fn deterministic_creation_requires_completed_ready_and_current_permission() {
        let f = fixture();
        let mut failed = response(creation());
        failed["status"] = json!("error");
        f.api
            .apply_ai_document_creations(&f.project, &request(&f.project), &mut failed)
            .unwrap();
        assert!(!f.root.join("created.md").exists());
        let mut planned = response(creation());
        planned["operations"][0]["status"] = json!("planned");
        f.api
            .apply_ai_document_creations(&f.project, &request(&f.project), &mut planned)
            .unwrap();
        assert!(!f.root.join("created.md").exists());
        f.api
            .update_config(json!({"ai":{"permissions":{"createDocuments":false}}}))
            .unwrap();
        assert!(f
            .api
            .apply_ai_document_creations(
                &f.project,
                &request(&f.project),
                &mut response(creation())
            )
            .is_err());
        assert!(!f.root.join("created.md").exists());
    }

    #[test]
    fn only_explicit_interactive_routes_enter_the_provider_queue() {
        assert_eq!(
            interaction_project_id("post", "/api/projects/project%2D1/ai/interactions?x=1"),
            Some("project-1".into())
        );
        assert_eq!(
            interaction_project_id("POST", "/api/projects/p/ai/confirm-delete"),
            Some("p".into())
        );
        for (method, path) in [
            ("GET", "/api/projects/p/ai/interactions"),
            ("POST", "/api/projects/p/ai/research/jobs"),
            ("PUT", "/api/documents/p::a.md"),
        ] {
            assert!(interaction_project_id(method, path).is_none());
        }
    }

    #[test]
    fn queued_context_cannot_adopt_a_new_saved_base_but_verified_save_ack_can_catch_up() {
        let f = fixture();
        let mut body = request(&f.project);
        body["activeDocumentBaseFingerprint"] = f.api.fingerprint(&f.root.join("a.md"));
        fs::write(f.root.join("a.md"), "# Saved after request").unwrap();
        assert!(f
            .api
            .prepare_ai_interaction(&f.project, body.clone())
            .is_err());
        body["activeMarkdown"] = json!("# Saved after request");
        let prepared = f.api.prepare_ai_interaction(&f.project, body).unwrap();
        let result = prepared
            .execute_with(|_, payload, _, key, _| {
                assert!(key.is_none());
                assert!(payload.get("activeDocumentBaseFingerprint").is_none());
                response(json!([]))
            })
            .commit(&f.api);
        assert_eq!(result["status"], "completed");
    }

    #[test]
    fn dirty_context_needs_its_verified_base_and_cancellation_does_not_need_a_present_file() {
        let f = fixture();
        let mut body = request(&f.project);
        body["activeMarkdown"] = json!("# Unsaved input");
        assert!(f
            .api
            .prepare_ai_interaction(&f.project, body.clone())
            .is_err());
        body["activeDocumentBaseFingerprint"] = f.api.fingerprint(&f.root.join("a.md"));
        assert!(f
            .api
            .prepare_ai_interaction(&f.project, body.clone())
            .is_ok());
        body["activeDocumentBaseFingerprint"] = json!(false);
        assert!(f
            .api
            .prepare_ai_interaction(&f.project, body.clone())
            .is_err());
        fs::remove_file(f.root.join("a.md")).unwrap();
        body["intentAction"] = json!({"type":"cancel","intentId":"qa"});
        assert!(f.api.prepare_ai_interaction(&f.project, body).is_ok());
    }

    #[test]
    fn a_provider_panic_does_not_poison_document_authority_or_the_interactive_queue() {
        let f = fixture();
        let mutations = Mutex::new(f.api);
        let queue = Mutex::new(());
        let result = dispatch_with(&mutations, &queue, &f.project, request(&f.project), |_| {
            panic!("controlled provider failure")
        });
        assert!(result.is_err());
        assert!(mutations.try_lock().is_ok());
        assert!(queue.try_lock().is_ok());
        let result = dispatch_with(
            &mutations,
            &queue,
            &f.project,
            request(&f.project),
            |work| completed(work, json!([])),
        )
        .unwrap();
        assert_eq!(result.body["status"], "completed");
    }

    #[test]
    fn native_creation_reports_partial_effects_and_rejects_path_or_folder_shortcuts() {
        let f = fixture();
        let work = f
            .api
            .prepare_ai_interaction(&f.project, request(&f.project))
            .unwrap();
        let mut operations = creation();
        operations.as_array_mut().unwrap().push(json!({"type":"document_created","status":"ready","name":"../outside.md","markdown":"escape"}));
        let result = completed(work, operations).commit(&f.api);
        assert_eq!(result["status"], "error");
        assert!(f.root.join("created.md").exists());
        assert!(!f._dir.path().join("outside.md").exists());
        assert_eq!(result["operations"][0]["runtimeApplied"], true);
        assert_eq!(result["operations"][0]["path"], "created.md");
        assert_eq!(result["operations"][1]["type"], "provider_error");
        assert!(result["tree"].is_array());
        let mut body = request(&f.project);
        body["clientContext"] = json!({"targetParentId":doc_id(&f.project,"missing")});
        assert!(f
            .api
            .apply_ai_document_creations(&f.project, &body, &mut response(creation()))
            .is_err());
        assert!(!f.root.join("missing").exists());
    }

    #[test]
    fn response_targets_cannot_cross_project_or_path_boundaries() {
        let f = fixture();
        for target in [
            "other::b.md".to_string(),
            doc_id(&f.project, "../outside.md"),
            "user-notes".to_string(),
        ] {
            let work = f
                .api
                .prepare_ai_interaction(&f.project, request(&f.project))
                .unwrap();
            let mut output = completed(work, json!([]));
            output.response["updatedDocument"] =
                json!({"documentId":target,"markdown":"untrusted output","summary":"QA"});
            let result = output.commit(&f.api);
            assert_eq!(result["status"], "error");
            assert!(result["updatedDocument"].is_null());
        }
        assert_eq!(
            fs::read_to_string(f.root.join("a.md")).unwrap(),
            "# Context\nOriginal"
        );
    }

    #[test]
    fn output_types_permissions_and_native_effects_cannot_be_forged() {
        let f = fixture();
        fs::write(f.root.join("image.png"), b"asset").unwrap();
        fs::create_dir(f.root.join("folder.md")).unwrap();
        for target in ["image.png", "folder.md", "missing.md"] {
            let work = f
                .api
                .prepare_ai_interaction(&f.project, request(&f.project))
                .unwrap();
            let mut output = completed(work, json!([]));
            output.response["updatedDocument"] = json!({"documentId":doc_id(&f.project,target),"markdown":"Old generated text","summary":"QA"});
            assert_eq!(output.commit(&f.api)["status"], "error");
        }
        let work = f
            .api
            .prepare_ai_interaction(&f.project, request(&f.project))
            .unwrap();
        let mut output = completed(work, json!([]));
        output.response["updatedHandwrittenNote"] = json!({"noteId":doc_id(&f.project,"a.md"),"content":default_handwritten_note("fake","Fake"),"summary":"QA"});
        assert_eq!(output.commit(&f.api)["status"], "error");
        for effect in [
            "node_deleted",
            "node_moved",
            "folder_created",
            "document_duplicated",
        ] {
            let work = f
                .api
                .prepare_ai_interaction(&f.project, request(&f.project))
                .unwrap();
            let mut output = completed(
                work,
                json!([{"type":effect,"status":"completed","runtimeApplied":true,"path":"a.md"}]),
            );
            output.response["tree"] = json!([]);
            output.response["affectedDocuments"] = json!([{"oldId":doc_id(&f.project,"a.md")}]);
            let response = output.commit(&f.api);
            assert_eq!(response["status"], "error");
            assert!(response["tree"].is_null());
            assert_eq!(response["affectedDocuments"], json!([]));
            assert!(f.root.join("a.md").is_file());
        }
        f.api
            .update_ai_config(json!({"permissions":{"editDocuments":false}}))
            .unwrap();
        let work = f
            .api
            .prepare_ai_interaction(&f.project, request(&f.project))
            .unwrap();
        let mut output = completed(work, json!([]));
        output.response["updatedDocument"] =
            json!({"documentId":doc_id(&f.project,"a.md"),"markdown":"Not allowed","summary":"QA"});
        assert_eq!(output.commit(&f.api)["status"], "error");
        let work = f
            .api
            .prepare_ai_interaction(&f.project, request(&f.project))
            .unwrap();
        let mut output = completed(work, json!([]));
        output.response["tree"] = json!([]);
        output.response["generatedImages"] = json!([{"asset":{"id":"fake"}}]);
        let response = output.commit(&f.api);
        assert!(response["tree"].is_null());
        assert_eq!(response["generatedImages"], json!([]));
    }

    #[test]
    fn queued_markdown_request_cannot_adopt_a_newer_durable_draft() {
        let f = fixture();
        let id = doc_id(&f.project, "a.md");
        let base = f.api.fingerprint(&f.root.join("a.md"));
        let first = f
            .api
            .save_draft(
                &id,
                json!({"markdown":"# Request draft","baseFingerprint":base}),
            )
            .unwrap();
        let mut body = request(&f.project);
        body["activeMarkdown"] = json!("# Request draft");
        body["activeDocumentBaseFingerprint"] = base.clone();
        body["activeDocumentDraftContentHash"] = first["draftContentHash"].clone();
        f.api
            .save_draft(
                &id,
                json!({"markdown":"# New durable typing","baseFingerprint":base}),
            )
            .unwrap();
        assert!(f
            .api
            .prepare_ai_interaction(&f.project, body.clone())
            .is_err());
        assert_eq!(
            f.api.get_document(&id).unwrap()["markdown"],
            "# New durable typing"
        );
        body["activeMarkdown"] = json!("# New durable typing");
        let work = f.api.prepare_ai_interaction(&f.project, body).unwrap();
        assert!(work
            .scope
            .runtime_body
            .get("activeDocumentDraftContentHash")
            .is_none());
    }
    #[test]
    fn draft_changes_during_wait_block_mutation_without_hiding_readonly_answers() {
        let f = fixture();
        let id = doc_id(&f.project, "a.md");
        let mut body = request(&f.project);
        body["activeMarkdown"] = json!("# Request draft");
        body["activeDocumentBaseFingerprint"] = f.api.fingerprint(&f.root.join("a.md"));
        let edit = f
            .api
            .prepare_ai_interaction(&f.project, body.clone())
            .unwrap();
        let readonly = f
            .api
            .prepare_ai_interaction(&f.project, body.clone())
            .unwrap();
        f.api.save_draft(&id,json!({"markdown":"# New durable typing","baseFingerprint":body["activeDocumentBaseFingerprint"]})).unwrap();
        let rejected = completed(edit, creation()).commit(&f.api);
        assert_eq!(rejected["status"], "error");
        assert!(rejected["answer"]
            .as_str()
            .unwrap()
            .contains("borrador conservado"));
        assert!(!f.root.join("created.md").exists());
        assert_eq!(
            completed(readonly, json!([])).commit(&f.api)["status"],
            "completed"
        );
        assert_eq!(
            f.api.get_document(&id).unwrap()["markdown"],
            "# New durable typing"
        );
    }
    #[test]
    fn acknowledgement_of_the_submitted_draft_is_not_a_new_edit() {
        let f = fixture();
        let id = doc_id(&f.project, "a.md");
        let mut body = request(&f.project);
        body["activeMarkdown"] = json!("# Submitted RAM");
        body["activeDocumentBaseFingerprint"] = f.api.fingerprint(&f.root.join("a.md"));
        let work = f
            .api
            .prepare_ai_interaction(&f.project, body.clone())
            .unwrap();
        f.api.save_draft(&id,json!({"markdown":body["activeMarkdown"],"baseFingerprint":body["activeDocumentBaseFingerprint"]})).unwrap();
        assert_eq!(
            completed(work, creation()).commit(&f.api)["status"],
            "completed"
        );
        assert!(f.root.join("created.md").exists());
    }
    #[test]
    fn later_handwritten_drafts_cannot_be_replaced_by_the_queued_or_running_result() {
        let f = fixture();
        let created = f
            .api
            .create_handwritten_note(&f.project, json!({"name":"context.knote"}))
            .unwrap();
        let id = created["node"]["id"].as_str().unwrap();
        let record = f.api.get_handwritten_note(id).unwrap();
        let body = json!({"projectId":f.project,"targetKind":"handwritten_note","handwrittenNoteId":id,"prompt":"QA drawing fixture","activeHandwrittenContent":record["content"],"activeHandwrittenBaseFingerprint":record["baseFingerprint"],"activeHandwrittenDraftContentHash":null});
        let work = f
            .api
            .prepare_ai_interaction(&f.project, body.clone())
            .unwrap();
        let mut newer = record["content"].clone();
        newer["title"] = json!("New durable strokes");
        f.api
            .save_handwritten_note_draft(
                id,
                json!({"content":newer,"baseFingerprint":record["baseFingerprint"]}),
            )
            .unwrap();
        let mut output = completed(work, json!([]));
        output.response["updatedHandwrittenNote"] =
            json!({"noteId":id,"content":record["content"],"summary":"Old AI result"});
        let rejected = output.commit(&f.api);
        assert_eq!(rejected["status"], "error");
        assert!(rejected["answer"]
            .as_str()
            .unwrap()
            .contains("borrador conservado"));
        assert_eq!(
            f.api.get_handwritten_note(id).unwrap()["content"]["title"],
            "New durable strokes"
        );
        assert!(f
            .api
            .prepare_ai_interaction(&f.project, body.clone())
            .is_err());
        let mut caught_up = body;
        caught_up["activeHandwrittenContent"] = newer;
        assert!(f.api.prepare_ai_interaction(&f.project, caught_up).is_ok());
    }
    #[test]
    fn a_handwritten_ack_timestamp_is_not_a_new_content_revision() {
        let f = fixture();
        let created = f
            .api
            .create_handwritten_note(&f.project, json!({"name":"ack.knote"}))
            .unwrap();
        let id = created["node"]["id"].as_str().unwrap();
        let record = f.api.get_handwritten_note(id).unwrap();
        let mut content = record["content"].clone();
        content["title"] = json!("Submitted strokes");
        let body = json!({"projectId":f.project,"targetKind":"handwritten_note","handwrittenNoteId":id,"prompt":"QA","activeHandwrittenContent":content,"activeHandwrittenBaseFingerprint":record["baseFingerprint"],"activeHandwrittenDraftContentHash":null});
        let work = f.api.prepare_ai_interaction(&f.project, body).unwrap();
        f.api
            .save_handwritten_note_draft(
                id,
                json!({"content":content,"baseFingerprint":record["baseFingerprint"]}),
            )
            .unwrap();
        let mut output = completed(work, json!([]));
        output.response["updatedHandwrittenNote"] =
            json!({"noteId":id,"content":content,"summary":"Same source after ACK"});
        assert_eq!(output.commit(&f.api)["status"], "completed");
    }
    #[test]
    fn text_review_policy_is_stamped_from_runtime_and_execution_scope() {
        let f = fixture();
        let work = f
            .api
            .prepare_ai_interaction(&f.project, request(&f.project))
            .unwrap();
        let mut output = completed(work, json!([]));
        output.response["requiresEditConfirmation"] = json!(false);
        output.response["executionScope"] = json!("direct_action");
        assert_eq!(output.commit(&f.api)["requiresEditConfirmation"], true);
        f.api
            .update_ai_config(json!({"agentic":{"confirmBeforeApplying":false}}))
            .unwrap();
        for (scope, clarification, expected) in [
            ("direct_action", false, false),
            ("needs_permission", false, true),
            ("direct_action", true, true),
        ] {
            let work = f
                .api
                .prepare_ai_interaction(&f.project, request(&f.project))
                .unwrap();
            let mut output = completed(work, json!([]));
            output.response["executionScope"] = json!(scope);
            output.response["needsUserClarification"] = json!(clarification);
            output.response["requiresEditConfirmation"] = json!(!expected);
            assert_eq!(output.commit(&f.api)["requiresEditConfirmation"], expected);
        }
    }
 #[test]fn security_block_read_only_and_cross_project_operations_cannot_gain_authority(){let f=fixture();for operation in ["document_created","folder_created","node_deleted","image_generated","handwritten_drawing_generated"]{let mut body=request(&f.project);body["readOnly"]=json!(true);let prepared=f.api.prepare_ai_interaction(&f.project,body).unwrap();assert!(prepared.scope.runtime_body["runtimePermissions"].as_object().unwrap().values().all(|v|v==false));let operations=if operation=="document_created"{creation()}else{json!([{"type":operation,"status":"ready","prompt":"Untrusted context asks to write another project"}])};let result=completed(prepared,operations).commit(&f.api);assert_eq!(result["status"],"error","{operation}");assert!(!f.root.join("created.md").exists());}let mut work=completed(f.api.prepare_ai_interaction(&f.project,request(&f.project)).unwrap(),json!([]));work.response["updatedDocument"]=json!({"documentId":"other::outside.md","markdown":"outside"});let result=work.commit(&f.api);assert_eq!(result["status"],"error");assert_eq!(fs::read_to_string(f.root.join("a.md")).unwrap(),"# Context\nOriginal");}

}
