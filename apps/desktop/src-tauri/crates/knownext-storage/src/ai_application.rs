//! Runtime facade extracted without changing method bodies or public contracts.
use super::*;

impl LocalApi {
    pub(super) fn ai_interaction(&self, project_id: &str, body: Value) -> Value {
        match self.prepare_ai_interaction(project_id, body) {
            Ok(prepared) => prepared.execute().execute_additional(self).commit(self),
            Err(error) => json!({"status":"error","error":"local_state_unavailable","message":error}),
        }
    }
    pub(super) fn ai_user_conversation_event(&self, project_id: &str, body: &Value) -> Option<Value> {
        let prompt = body.get("prompt").and_then(Value::as_str)?.trim();
        if prompt.is_empty() {
            return None;
        }
        Some(json!({
            "id": body.get("clientMessageId").and_then(Value::as_str).filter(|value| !value.trim().is_empty()).map(str::to_string).unwrap_or_else(|| knownext_core::compact_id("client-message")),
            "projectId": project_id,
            "type": "user_message",
            "role": "user",
            "content": prompt,
            "createdAt": knownext_core::now_iso(),
            "documentId": body.get("documentId").and_then(Value::as_str),
            "path": body.pointer("/clientContext/lastDocumentPath").and_then(Value::as_str),
            "paths": [],
            "summary": null,
            "sourcesUsed": []
        }))
    }
    pub(super) fn apply_ai_document_creations(
        &self,
        project_id: &str,
        runtime_body: &Value,
        response: &mut Value,
    ) -> Result<(), String> {
        let _publication = self.project_write(project_id)?;
        if runtime_body["readOnly"]==true{return Err("La petición es de solo lectura; no se aplican creaciones IA".into());}
        let config = self.read_config_checked()?;
        if response["status"] != "completed" { return Ok(()); }
        let interaction_id=response["interactionId"].as_str().unwrap_or("runtime-created-document").to_owned();
        let Some(operations) = response["operations"].as_array_mut() else {
            return Ok(());
        };
        let mut created: Vec<(String, String)> = Vec::new();
        for operation in operations.iter_mut() {
            if operation["type"].as_str() != Some("document_created")
                || operation["documentId"].as_str().is_some()
                || operation["status"] != "ready"
            {
                continue;
            }
            if config["ai"]["permissions"]["createDocuments"] != true {
                return Err("La creación de documentos por IA está desactivada".into());
            }
            let name = operation
                .get("name")
                .and_then(Value::as_str)
                .unwrap_or("documento-ia.md");
            if name.contains(['/', '\\']) || std::path::Path::new(name).components().count() != 1 || !is_markdown_path(std::path::Path::new(name)) {
                return Err("La creación IA necesita un nombre Markdown dentro de la carpeta elegida".into());
            }
            let markdown = operation
                .get("markdown")
                .and_then(Value::as_str)
                .unwrap_or("");
            let parent = self.node_relative(
                project_id,
                runtime_body
                    .pointer("/clientContext/targetParentId")
                    .and_then(Value::as_str),
            )?;
            let relative = self.unique_project_relative(project_id, parent.as_deref(), name)?;
            let path = self.resolve_project_relative(project_id, &relative)?;
            if let Some(parent) = path.parent() {
                if !parent.is_dir() { return Err("La carpeta de destino ya no existe; elige otra antes de crear el documento".into()); }
            }
            let operation_id=operation["id"].as_str().map(str::to_owned).unwrap_or_else(||knownext_core::compact_id("ai-create"));
            let change=self.begin_ai_created_change(project_id,&relative,markdown,&interaction_id,&operation_id,operation["summary"].as_str().unwrap_or("Creación de documento IA"))?;
            self.verify_ai_change_precondition(project_id,&change)?;
            atomic_io::create(&path, markdown.as_bytes()).map_err(|error| error.to_string())?;
            let document_id = doc_id(project_id, &relative);
            operation["status"] = Value::from("completed");
            operation["runtimeApplied"] = Value::Bool(true);
            operation["documentId"] = Value::from(document_id.clone());
            operation["nodeId"] = Value::from(document_id.clone());
            operation["path"] = Value::from(relative.clone());
            operation["paths"] = json!([relative.clone()]);
            operation["aiChange"]=self.finish_ai_created_change(project_id,&change)?;
            created.push((document_id, relative));
        }
        if !created.is_empty() {
            self.attach_project_tree(project_id,response);
            if let Some(events) = response["conversationEvents"].as_array_mut() {
                for event in events
                    .iter_mut()
                    .filter(|event| event["type"].as_str() == Some("document_created"))
                {
                    if event["documentId"].as_str().is_none() {
                        let (document_id, relative) = &created[0];
                        event["documentId"] = Value::from(document_id.clone());
                        event["path"] = Value::from(relative.clone());
                        event["paths"] = json!([relative]);
                    }
                }
            }
        }
        Ok(())
    }
    pub(super) fn apply_ai_image_generations(
        &self,
        project_id: &str,
        runtime_body: &Value,
        response: &mut Value,
        generated_results: &BTreeMap<usize, Value>,
    ) -> Result<(), String> {
        let _publication = self.project_write(project_id)?;
        let config = self.read_config_checked()?;
        let ai = &config["ai"];
        let image_config = &ai["imageGeneration"];
        let mut generated_images = response["generatedImages"]
            .as_array()
            .cloned()
            .unwrap_or_default();
        let mut updated_document = Value::Null;
        let Some(operations) = response["operations"].as_array_mut() else {
            return Ok(());
        };
        if !image_config["enabled"].as_bool().unwrap_or(false) {
            if operations.iter().any(|operation| operation["type"]=="image_generated" && operation["status"]=="ready") {
                return Err("La generación de imágenes está desactivada en Ajustes > IA.".into());
            }
            for operation in operations.iter_mut().filter(|operation| {
                operation["type"].as_str() == Some("image_generated")
                    && operation["status"].as_str() == Some("ready")
            }) {
                operation["status"] = Value::from("blocked");
                operation["message"] =
                    Value::from("La generación de imágenes está desactivada en Ajustes > IA.");
            }
            return Ok(());
        }
        let mut generated_any = false;
        for (index, operation) in operations.iter_mut().enumerate().filter(|(_, operation)| {
            operation["type"].as_str() == Some("image_generated")
                && operation["status"].as_str() == Some("ready")
        }) {
            if !ai["permissions"]["generateImages"]
                .as_bool()
                .unwrap_or(false)
                || !ai["permissions"]["createImageAssets"]
                    .as_bool()
                    .unwrap_or(false)
            {
                operation["status"] = Value::from("blocked");
                operation["message"] = Value::from("La generación de imágenes o la creación de assets está desactivada en Ajustes > IA.");
                return Err("La generación de imágenes o creación de assets está desactivada".into());
            }

            let prompt = operation["prompt"]
                .as_str()
                .unwrap_or("")
                .trim()
                .to_string();
            if prompt.is_empty() {
                operation["status"] = Value::from("error");
                operation["message"] =
                    Value::from("La operación de imagen no incluye un prompt validable.");
                return Err("La operación de imagen no incluye un prompt validable".into());
            }

            let generated = generated_results.get(&index).cloned().unwrap_or_else(|| json!({"status":"error","message":"No se ha ejecutado la fase de generación de esta imagen."}));
            if generated["status"].as_str() != Some("completed") {
                operation["status"] = Value::from("error");
                operation["message"] = generated["message"].clone();
                return Err(generated["message"].as_str().unwrap_or("La generación de imagen no se completó").into());
            }

            let bytes = ai_results::image_bytes(&generated)?;
            if bytes.is_empty() {
                operation["status"] = Value::from("error");
                operation["message"] = Value::from("OpenAI devolvió una imagen vacía.");
                continue;
            }

            let format = generated["format"]
                .as_str()
                .unwrap_or_else(|| image_config["outputFormat"].as_str().unwrap_or("png"));
            let requested_name = operation["name"].as_str().unwrap_or("imagen-ia.png");
            let name = image_file_name(requested_name, format);
            let parent = self.image_generation_parent(
                project_id,
                runtime_body.get("documentId").and_then(Value::as_str),
                image_config,
            )?;
            let relative = self.unique_project_relative(project_id, parent.as_deref(), &name)?;
            let path = self.resolve_project_relative(project_id, &relative)?;
            if let Some(parent_path) = path.parent() {
                std::fs::create_dir_all(parent_path).map_err(|error| error.to_string())?;
            }
            // Re-resolve after creating ancestors and never replace a racing file.
            let path = self.resolve_project_relative(project_id, &relative)?;
            atomic_io::create(&path, &bytes).map_err(|error| format!("No se pudo crear el asset sin reemplazar otro archivo: {error}"))?;
            let asset_id = doc_id(project_id, &relative);
            operation["runtimeApplied"] = json!(true);
            operation["status"] = json!("completed");
            operation["path"] = json!(relative);
            operation["paths"] = json!([relative]);
            operation["nodeId"] = json!(asset_id);
            let asset = self.asset_metadata(project_id, &asset_id)?;
            let document_id = runtime_body.get("documentId").and_then(Value::as_str);
            let alt_text = operation["altText"]
                .as_str()
                .unwrap_or("Imagen generada por IA")
                .to_string();
            let insert_requested = operation["insertIntoDocument"].as_bool().unwrap_or(false);
            let can_insert = insert_requested
                && ai["permissions"]["editDocuments"].as_bool().unwrap_or(false)
                && ai["permissions"]["insertImagesIntoDocuments"]
                    .as_bool()
                    .unwrap_or(false)
                && !image_config["confirmBeforeDocumentInsert"]
                    .as_bool()
                    .unwrap_or(false);
            let markdown_reference = if can_insert {
                document_id
                    .and_then(|document_id| {
                        self.image_reference(
                            project_id,
                            document_id,
                            json!({ "assetId": asset_id, "altText": alt_text.clone() }),
                        )
                        .ok()
                    })
                    .and_then(|reference| reference["markdown"].as_str().map(str::to_string))
            } else {
                None
            };

            if let (Some(document_id), Some(markdown_reference)) =
                (document_id, markdown_reference.as_deref())
            {
                let active_markdown = runtime_body
                    .get("activeMarkdown")
                    .and_then(Value::as_str)
                    .map(str::to_string)
                    .or_else(|| {
                        self.get_document(document_id)
                            .ok()
                            .and_then(|document| document["markdown"].as_str().map(str::to_string))
                    })
                    .unwrap_or_default();
                let next_markdown = insert_markdown_reference_near_focus(
                    &active_markdown,
                    markdown_reference,
                    operation.get("placement"),
                    runtime_body.get("selectionFocus"),
                );
                updated_document = json!({
                    "documentId": document_id,
                    "markdown": next_markdown,
                    "summary": "Referencia a la imagen generada preparada para el documento activo."
                });
            }

            operation["status"] = Value::from("completed");
            operation["runtimeApplied"] = Value::Bool(true);
            operation["documentId"] = document_id.map(Value::from).unwrap_or(Value::Null);
            operation["nodeId"] = Value::from(asset_id.clone());
            operation["path"] = Value::from(relative.clone());
            operation["paths"] = json!([relative.clone()]);
            operation["assetId"] = Value::from(asset_id.clone());
            operation["message"] = Value::from("Imagen generada y guardada como asset local.");

            generated_images.push(json!({
                "asset": asset,
                "prompt": prompt,
                "revisedPrompt": generated["revisedPrompt"].clone(),
                "altText": alt_text,
                "markdownReference": markdown_reference,
                "insertedIntoDocumentId": Value::Null,
                "sourceDocumentId": document_id,
                "sourceSelection": runtime_body.get("selectionFocus").cloned().unwrap_or(Value::Null),
                "model": generated["model"].as_str().unwrap_or_else(|| image_config["model"].as_str().unwrap_or("gpt-image-2")),
                "size": generated["size"].as_str().unwrap_or_else(|| image_config["size"].as_str().unwrap_or("auto")),
                "quality": generated["quality"].as_str().unwrap_or_else(|| image_config["quality"].as_str().unwrap_or("auto")),
                "format": format
            }));
            generated_any = true;
        }

        if generated_any {
            let _ = self.reindex_project_images(project_id);
            response["generatedImages"] = Value::Array(generated_images);
            if !updated_document.is_null() {
                response["updatedDocument"] = updated_document;
            }
            self.attach_project_tree(project_id,response);
        }
        Ok(())
    }
    pub(super) fn image_generation_parent(
        &self,
        project_id: &str,
        document_id: Option<&str>,
        config: &Value,
    ) -> Result<Option<String>, String> {
        let relative = match config["defaultFolder"]
            .as_str()
            .unwrap_or("document_folder")
        {
            "generated_assets" => Some("assets/generated".to_string()),
            "custom_folder" => Some(config["customFolderPath"].as_str()
                .and_then(normalize_project_relative).filter(|value| !value.is_empty())
                .ok_or("La carpeta de imágenes personalizada no es válida")?),
            _ => document_id
                .and_then(|document_id| document_ref_path(document_id).ok())
                .and_then(|relative| {
                    relative
                        .rsplit_once('/')
                        .map(|(parent, _)| parent.to_string())
                })
                .or_else(|| Some("assets/generated".to_string())),
        }
        ;
        if let Some(relative) = &relative {
            let path=self.resolve_project_relative(project_id, relative)?;
            let mut ancestor=path.as_path();
            while !ancestor.exists() {ancestor=ancestor.parent().ok_or("La carpeta de imágenes no tiene un contenedor válido")?;}
            if !ancestor.is_dir() {return Err("La carpeta de imágenes está ocupada por un archivo".into());}
        }
        Ok(relative)
    }
    pub(super) fn apply_ai_handwritten_drawings(
        &self,
        project_id: &str,
        runtime_body: &Value,
        response: &mut Value,
        generated_results: &BTreeMap<usize, Result<Value,String>>,
    ) -> Result<(), String> {
        let _publication = self.project_write(project_id)?;
        let config = self.read_config_checked()?;
        let ai = &config["ai"];
        let drawing_config = &ai["handwrittenDrawing"];
        let interaction=response["interactionId"].as_str().unwrap_or("runtime-handwritten-drawing").to_owned();
        let Some(operations) = response["operations"].as_array_mut() else {
            return Ok(());
        };
        let mut updated_note = Value::Null;
        let mut response_status: Option<&'static str> = None;
        let mut response_answer: Option<String> = None;
        for (index, operation) in operations.iter_mut().enumerate().filter(|(_,operation)| {
            operation["type"].as_str() == Some("handwritten_drawing_generated")
                && operation["status"].as_str() == Some("ready")
        }) {
            if !drawing_config["enabled"].as_bool().unwrap_or(true)
                || !ai["permissions"]["editHandwrittenNotes"]
                    .as_bool()
                    .unwrap_or(false)
                || !ai["permissions"]["drawHandwrittenNotes"]
                    .as_bool()
                    .unwrap_or(false)
            {
                let message = "El dibujo en notas a mano esta desactivado en Ajustes > IA.";
                operation["status"] = Value::from("blocked");
                operation["type"] = Value::from("handwritten_drawing_blocked");
                operation["message"] = Value::from(message);
                response_status = Some("blocked");
                response_answer = Some(message.to_string());
                continue;
            }
            let note_id = operation["noteId"]
                .as_str()
                .or_else(|| operation["documentId"].as_str())
                .or_else(|| {
                    runtime_body
                        .get("handwrittenNoteId")
                        .and_then(Value::as_str)
                })
                .ok_or_else(|| "La operacion de dibujo no incluye noteId.".to_string())?
                .to_string();
            let replacement_policy = operation["replacementPolicy"]
                .as_str()
                .unwrap_or("append_only").to_owned();
            if !matches!(
                replacement_policy.as_str(),
                "append_only" | "clean_existing" | "replace_page" | "cleanup_existing"
            ) {
                let message = if replacement_policy == "replace_selection" {
                    "La IA no puede reemplazar una seleccion de la knote porque aun no hay seleccion/lasso activa en el contexto."
                } else {
                    "La politica de reemplazo solicitada para la knote no esta soportada por el runtime local."
                };
                operation["status"] = Value::from("blocked");
                operation["type"] = Value::from("handwritten_drawing_blocked");
                operation["message"] = Value::from(message);
                response_status = Some("blocked");
                response_answer = Some(message.to_string());
                continue;
            }
            let applied = generated_results.get(&index).ok_or("El cálculo de trazos no está preparado")?
                .as_ref().map_err(Clone::clone)?;
            let content = applied["content"].clone();
            let draft_payload = json!({
                "content": content.clone(),
                "baseFingerprint": runtime_body.get("activeHandwrittenBaseFingerprint").cloned().unwrap_or(Value::Null)
            });
            let before=runtime_body.get("activeHandwrittenContent").filter(|v|v.is_object()).cloned().unwrap_or(self.get_handwritten_note(&note_id)?["content"].clone());
            let operation_id=operation["id"].as_str().map(str::to_owned).unwrap_or_else(||knownext_core::compact_id("ai-drawing"));
            let change=self.begin_ai_handwritten_change(&note_id,before,content.clone(),&interaction,&operation_id,operation["summary"].as_str().unwrap_or("Dibujo IA"),runtime_body["readOnly"]==true)?;
            self.verify_ai_change_precondition(project_id,&change)?;
            let _draft = self.save_handwritten_note_draft(&note_id, draft_payload)?;
            operation["runtimeApplied"]=json!(true);
            operation["documentId"]=json!(note_id);operation["noteId"]=json!(note_id);operation["path"]=json!(document_ref(&note_id)?.1);
            operation["aiChange"]=self.finish_ai_created_change(project_id,&change)?;
            let summary = operation["summary"]
                .as_str()
                .unwrap_or("Dibujo IA anadido a la nota a mano.")
                .to_string();
            let clears_target_page = matches!(
                replacement_policy.as_str(),
                "clean_existing" | "replace_page" | "cleanup_existing"
            );
            let scene_element_count = operation
                .pointer("/sceneSpec/elements")
                .and_then(Value::as_array)
                .map(Vec::len)
                .unwrap_or(0);
            let applied_message = if clears_target_page && scene_element_count == 0 {
                format!("He limpiado la pagina activa como borrador: {summary}")
            } else if clears_target_page {
                format!(
                    "He limpiado la pagina activa y he aplicado el dibujo como borrador: {summary}"
                )
            } else {
                format!("He aplicado el dibujo como borrador en la pagina activa: {summary}")
            };
            operation["status"] = Value::from("completed");
            operation["runtimeApplied"] = json!(true);
            let (_,relative)=document_ref(&note_id)?;
            operation["path"]=json!(relative);
            operation["paths"]=json!([relative]);
            operation["type"] = Value::from("handwritten_modified");
            operation["message"] = Value::from(applied_message.clone());
            operation["documentId"] = Value::from(note_id.clone());
            operation["noteId"] = Value::from(note_id.clone());
            operation["nodeId"] = Value::from(note_id.clone());
            operation["targetPageId"] = applied["pageId"].clone();
            operation["qualityReport"] = applied["qualityReport"].clone();
            updated_note = json!({
                "noteId": note_id,
                "draftWriteRevision":_draft["draftWriteRevision"],
                "content": content,
                "summary": summary,
                "pageId": applied["pageId"].clone(),
                "route": applied["route"].clone(),
                "sceneSpec": applied["sceneSpec"].clone(),
                "vectorPlan": applied["vectorPlan"].clone(),
                "qualityReport": applied["qualityReport"].clone()
            });
            response_status = Some("completed");
            response_answer = Some(applied_message);
        }
        if let Some(status) = response_status {
            response["status"] = Value::from(status);
        }
        if let Some(answer) = response_answer {
            response["answer"] = Value::from(answer);
        }
        if !updated_note.is_null() {
            response["updatedHandwrittenNote"] = updated_note;
            response["drawingProposal"] = Value::Null;
            let updated_summary = response["updatedHandwrittenNote"]["summary"].clone();
            let updated_answer = response["answer"].clone();
            if let Some(events) = response["conversationEvents"].as_array_mut() {
                for event in events
                    .iter_mut()
                    .filter(|event| event["type"].as_str() == Some("handwritten_drawing_generated"))
                {
                    event["type"] = Value::from("handwritten_modified");
                    event["content"] = updated_answer.clone();
                    event["summary"] = updated_summary.clone();
                }
            }
        }
        Ok(())
    }
    pub(super) fn mark_ai_response_error(
        &self,
        project_id: &str,
        document_id: Option<&str>,
        response: &mut Value,
        error: &str,
    ) {
        let mut applied = response["operations"].as_array().into_iter().flatten()
            .filter(|operation| operation["runtimeApplied"] == true).cloned().collect::<Vec<_>>();
        let message = if applied.is_empty() {
            format!("No se ha completado la operación de IA: {error}")
        } else {
            format!("Parte del resultado está aplicada. Revisa los cambios antes de reintentar: {error}")
        };
        let mut events = applied.iter().map(|operation| json!({
            "id": knownext_core::compact_id("ai-event"), "projectId":project_id,
            "type":operation["type"], "role":"assistant", "content":format!("Cambio aplicado: {}",operation["path"].as_str().unwrap_or("")),
            "createdAt":knownext_core::now_iso(), "documentId":operation["documentId"],
            "path":operation["path"], "paths":operation["paths"], "summary":operation["summary"], "sourcesUsed":[]
        })).collect::<Vec<_>>();
        events.push(json!({
            "id":knownext_core::compact_id("ai-event"), "projectId":project_id, "type":"provider_error", "role":"assistant",
            "content":message, "createdAt":knownext_core::now_iso(), "documentId":document_id, "path":null, "paths":[], "summary":null, "sourcesUsed":[]
        }));
        response["status"] = json!("error"); response["answer"] = json!(message);
        response["conversationEvents"] = json!(events);
        if applied.is_empty(){response["tree"]=Value::Null;}else{self.attach_project_tree(project_id,response);}
        applied.push(json!({"type":"provider_error","status":"error","message":response["answer"],"documentId":document_id,"nodeId":null,"path":null,"paths":[],"summary":response["answer"],"task":null,"confirmationId":null}));
        response["operations"] = json!(applied);
        for field in ["updatedDocument","updatedHandwrittenNote","editProposal","drawingProposal","requiresConfirmation","pendingIntent","pendingIntentStatus","task"] { response[field] = Value::Null; }
    }

    pub(super) fn resolve_ai_context_sources(&self, project_id: &str, body: &Value) -> Result<Value,String> {
        if body.get("contextSourceIds").is_some_and(|ids|!ids.is_null()&&!ids.is_array()){return Err("La selección de fuentes debe ser una lista de identidades".into())}
        let source_ids = body["contextSourceIds"]
            .as_array()
            .cloned()
            .unwrap_or_default();
        let stored = self.ai_sources_internal(project_id);
        let sources = stored["sources"].as_array().cloned().unwrap_or_default();
        if stored["unavailable"]==true{return Err("El contexto conservado no se puede revisar. Se mantiene sin enviar fuentes al proveedor".into())}
        if source_ids.len()>64{return Err("La revisión admite hasta64 fuentes explícitas. Reduce la selección".into())}
        if source_ids.iter().any(|id|!id.as_str().is_some_and(|id|!id.is_empty()&&id.len()<=2048)){return Err("La selección contiene una identidad de fuente no válida".into())}
        let mut resolved = Vec::new();
        let mut seen=BTreeSet::new();
        for id in source_ids.iter().filter_map(Value::as_str) {
            if !seen.insert(id){continue}
            let matching=sources
                .iter()
                .filter(|source| source["id"].as_str() == Some(id)).collect::<Vec<_>>();
            if matching.len()!=1{return Err("Una fuente elegida ya no está disponible o tiene identidad ambigua. Vuelve a revisar el contexto".into())}
            resolved.push(matching[0].clone());
        }
        resolved.extend(self.retrieve_ai_index_context(project_id, body, &resolved)?);
        let mut budget=ai_context_origin::ReviewBudget::new();
        for source in &mut resolved{
            ai_context_origin::verify(self,project_id,source,&mut budget).map_err(|error|{
                let name=source["name"].as_str().unwrap_or("Fuente de contexto").chars().take(120).collect::<String>();
                if source["documentId"].is_string(){format!("Índice IA · {name}: {error}. Revisa o reconstruye el índice.")}else{format!("{name}: {error}")}
            })?;
            let mode=source["originProof"]["mode"].clone();
            *source=ai_context_origin::provider_view(source.clone());source["sourceOrigin"]=mode;
        }
        Ok(Value::Array(resolved))
    }
    pub(super) fn update_ai_rag_config(&self, patch: Value) -> Result<(), String> {
        let mut config = self.read_config_checked()?;
        merge(&mut config["ai"]["rag"], &patch);
        normalize_config(&mut config);
        config["updatedAt"] = Value::from(knownext_core::now_iso());
        self.write_json(&self.config_path(), &config)
    }
    pub(super) fn retrieve_ai_index_context(
        &self,
        project_id: &str,
        body: &Value,
        explicit_sources: &[Value],
    ) -> Result<Vec<Value>,String> {
        let config = self.read_config_checked()?;
        if !config["ai"]["rag"]["enabled"].as_bool().unwrap_or(false) {
            return Ok(Vec::new());
        }
        let Some(stored)=self.read_ai_index(project_id)? else {
            // No index is a normal new-project state. An existing unreadable or
            // future index still propagates its error; it is never silently dropped.
            return Ok(Vec::new());
        };
        let index = stored.value;
        let Some(chunks) = index["chunks"].as_array() else {
            return Ok(Vec::new());
        };
        let query = ai_index_query_text(body);
        let query_tokens = tokenize_for_rag(&query);
        if query_tokens.is_empty() {
            return Ok(Vec::new());
        }
        let explicit_document_ids = explicit_sources
            .iter()
            .filter_map(|source| {
                source["id"]
                    .as_str()
                    .or_else(|| source["documentId"].as_str())
            })
            .collect::<BTreeSet<_>>();
        let mut scored = chunks
            .iter()
            .filter_map(|chunk| {
                let document_id = chunk["documentId"].as_str()?;
                if explicit_document_ids.contains(document_id) {
                    return None;
                }
                let text = chunk["text"].as_str().unwrap_or("");
                let score = rag_score(text, &query_tokens);
                (score > 0).then_some((score, chunk.clone()))
            })
            .collect::<Vec<_>>();
        scored.sort_by(|left, right| right.0.cmp(&left.0));
        Ok(scored
            .into_iter()
            .take(6)
            .map(|(_, chunk)| {
                let now = knownext_core::now_iso();
                json!({
                    "id": format!("rag:{}", chunk["id"].as_str().unwrap_or("chunk")),
                    "projectId": project_id,
                    "kind": "project_document",
                    "name": chunk["name"].as_str().unwrap_or("Documento indexado"),
                    "path": chunk["path"].as_str(),
                    "mimeType": "text/markdown",
                    "sizeBytes": chunk["text"].as_str().unwrap_or("").len(),
                    "status": "ready",
                    "weight": "high",
                    "warning": null,
                    "error": null,
                    "createdAt": chunk["indexedAt"].as_str().unwrap_or(&now),
                    "updatedAt": chunk["indexedAt"].as_str().unwrap_or(&now),
                    "lastUsedAt": now,
                    "expiresAt": null,
                    "documentId": chunk["documentId"].as_str(),
                    "text": chunk["text"].as_str().unwrap_or(""),
                    "originProof":chunk["originProof"].clone()
                })
            })
            .collect())
    }
    pub(super) fn openai_key_status(&self) -> Value {
        let value = match credential_store::read(&self.credentials_path()) {
            Ok(value)=>value,
            Err(error)=>return json!({"configured":false,"preview":null,"protection":"unavailable","storageError":error}),
        };
        let key = value["openaiKey"].as_str().unwrap_or("");
        let suffix:String=key.chars().rev().take(4).collect::<Vec<_>>().into_iter().rev().collect();
        json!({ "configured": !key.is_empty(), "preview": if key.chars().count() > 8 { Value::from(format!("{}...{}",key.chars().take(3).collect::<String>(),suffix)) } else { Value::Null },"protection":credential_store::protection_name(),"storageError":null })
    }
    pub(super) fn save_openai_key(&self, body: Value) -> Result<Value,String> {
        let key = body.get("apiKey").and_then(Value::as_str).map(str::trim).filter(|key|!key.is_empty()&&key.len()<=8192&&!key.chars().any(char::is_control)).ok_or("Indica una clave válida antes de guardar")?;
        self.update_credentials(|credentials| {
            credentials.insert("openaiKey".to_string(), Value::from(key));
        })?;
        Ok(self.openai_key_status())
    }
    pub(super) fn delete_openai_key(&self) -> Result<(),String> {
        self.update_credentials(|credentials| {
            credentials.remove("openaiKey");
        })?;
        Ok(())
    }
    pub(super) fn ai_index_status(&self, project_id: &str) -> Result<Value, String> {
        self.require_ai_index_project(project_id)?;
        let tree = self.project_tree(project_id);
        let document_count_known = tree.is_ok();
        let docs = tree.map(|nodes| count_documents(&nodes)).unwrap_or(0);
        let config = self.read_config_checked()?;
        let stored = match self.read_ai_index(project_id) {
            Ok(stored) => stored,
            Err(error) => return Ok(json!({
                "projectId":project_id,"enabled":config["ai"]["rag"]["enabled"].as_bool().unwrap_or(false),
                "status":"error","error":error,"vectorStoreId":null,"lastIndexedAt":null,
                "documentCount":docs,"documentCountKnown":document_count_known,
                "indexedDocumentCount":0,"pendingDocumentCount":0,"failedDocumentCount":0,"deletedDocumentCount":0,
                "localExactReady":true,"indexReadable":false,"indexRevision":null,"indexSizeBytes":null,"checkedAt":knownext_core::now_iso()
            })),
        };
        if let Some(stored) = stored {
            let index = stored.value;
            let indexed = index["documents"].as_array().map(Vec::len).unwrap_or(0);
            let failed = index["failedDocuments"]
                .as_array()
                .map(Vec::len)
                .unwrap_or(0);
            return Ok(json!({
                "projectId": project_id,
                "enabled": config["ai"]["rag"]["enabled"].as_bool().unwrap_or(false),
                "status": "updated",
                "vectorStoreId": index["vectorStoreId"].as_str().map(Value::from).unwrap_or(Value::Null),
                "lastIndexedAt": index["indexedAt"].as_str().map(Value::from).unwrap_or(Value::Null),
                "error": null,
                "documentCount": docs,
                "indexedDocumentCount": indexed,
                "pendingDocumentCount": docs.saturating_sub(indexed),
                "failedDocumentCount": failed,
                "deletedDocumentCount": 0,
                "localExactReady": true,
                "indexRevision":stored.revision,"indexSizeBytes":stored.bytes,
                "indexReadable":true,"documentCountKnown":document_count_known,"checkedAt":knownext_core::now_iso()
            }));
        }
        Ok(json!({
            "projectId": project_id,
            "enabled": config["ai"]["rag"]["enabled"].as_bool().unwrap_or(false),
            "status": "not-indexed",
            "vectorStoreId": null,
            "lastIndexedAt": null,
            "error": null,
            "documentCount": docs,
            "indexedDocumentCount": 0,
            "pendingDocumentCount": 0,
            "failedDocumentCount": 0,
            "deletedDocumentCount": 0,
            "localExactReady": true,"indexRevision":null,"indexSizeBytes":0,
            "indexReadable":true,"documentCountKnown":document_count_known,"checkedAt":knownext_core::now_iso()
        }))
    }
}
