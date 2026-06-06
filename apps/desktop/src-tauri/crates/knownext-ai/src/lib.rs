use base64::Engine;
use reqwest::blocking::{multipart, Client};
use reqwest::header::{HeaderMap, HeaderValue, ACCEPT, AUTHORIZATION, USER_AGENT};
use serde_json::{json, Value};
use std::time::Duration;

pub fn answer_interaction(
    project_id: &str,
    payload: &Value,
    context_sources: Value,
    openai_key: Option<&str>,
    model: &str,
) -> Value {
    let prompt = payload
        .get("prompt")
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim();
    let document_id = payload.get("documentId").and_then(Value::as_str);
    let mode = payload
        .get("mode")
        .and_then(Value::as_str)
        .unwrap_or("document");
    let execution_mode = payload
        .get("executionMode")
        .and_then(Value::as_str)
        .unwrap_or("quick");
    let reasoning_depth = payload
        .get("reasoningDepth")
        .and_then(Value::as_str)
        .unwrap_or("light");
    let event_id = knownext_core::compact_id("ai-event");
    let interaction_id = knownext_core::compact_id("ai");
    let created_at = knownext_core::now_iso();

    if prompt.is_empty() {
        return provider_unavailable_response(
            project_id,
            document_id,
            &interaction_id,
            &event_id,
            &created_at,
            "Indica qué necesitas hacer con el documento activo.",
            execution_mode,
            reasoning_depth,
            mode,
        );
    }

    let Some(openai_key) = openai_key.filter(|value| !value.trim().is_empty()) else {
        return provider_unavailable_response(
            project_id,
            document_id,
            &interaction_id,
            &event_id,
            &created_at,
            "Configura una API key de OpenAI en Ajustes > IA para usar respuestas reales.",
            execution_mode,
            reasoning_depth,
            mode,
        );
    };

    let request_body = build_response_request(payload, prompt, &context_sources, model);
    let response = openai_client(openai_key)
        .post("https://api.openai.com/v1/responses")
        .json(&request_body)
        .send();

    let provider_text = match response {
        Ok(response) if response.status().is_success() => match response.json::<Value>() {
            Ok(value) => extract_response_text(&value)
                .unwrap_or_else(|| "La IA respondió sin texto utilizable.".to_string()),
            Err(error) => {
                return provider_error_response(
                    project_id,
                    document_id,
                    &interaction_id,
                    &event_id,
                    &created_at,
                    &format!("No se pudo leer la respuesta de OpenAI: {error}"),
                    execution_mode,
                    reasoning_depth,
                    mode,
                )
            }
        },
        Ok(response) => {
            let status = response.status();
            let detail = response.text().unwrap_or_default();
            return provider_error_response(
                project_id,
                document_id,
                &interaction_id,
                &event_id,
                &created_at,
                &format!(
                    "OpenAI devolvió {status}: {}",
                    summarize_error_detail(&detail)
                ),
                execution_mode,
                reasoning_depth,
                mode,
            );
        }
        Err(error) => {
            return provider_error_response(
                project_id,
                document_id,
                &interaction_id,
                &event_id,
                &created_at,
                &format!("No se pudo conectar con OpenAI: {error}"),
                execution_mode,
                reasoning_depth,
                mode,
            )
        }
    };

    if let Some(response) = structured_interaction_response(
        project_id,
        payload,
        document_id,
        &interaction_id,
        &event_id,
        &created_at,
        &provider_text,
        execution_mode,
        reasoning_depth,
        mode,
        &context_sources,
    ) {
        return response;
    }

    let public_context_sources = public_context_sources(&context_sources);
    let assistant_event = json!({
        "id": event_id,
        "projectId": project_id,
        "type": "assistant_message",
        "role": "assistant",
        "content": provider_text,
        "createdAt": created_at,
        "documentId": document_id,
        "path": null,
        "paths": [],
        "summary": null,
        "sourcesUsed": public_context_sources,
    });

    json!({
        "interactionId": interaction_id,
        "status": "completed",
        "display": "bubble",
        "uiPlacement": if mode == "project" { "conversation_tab" } else { "document_bubble" },
        "interactionType": "chat",
        "confidence": "medium",
        "executionMode": execution_mode,
        "reasoningDepth": reasoning_depth,
        "executionScope": "direct_action",
        "routeToAiTab": mode == "project",
        "needsUserClarification": false,
        "pendingIntent": null,
        "pendingIntentStatus": null,
        "answer": assistant_event["content"],
        "conversationEvents": [assistant_event],
        "operations": [],
        "updatedDocument": null,
        "generatedImages": [],
        "task": null,
        "tree": null,
        "affectedDocuments": [],
        "requiresConfirmation": null,
        "contextSources": null,
        "expiredContextSourceIds": []
    })
}

pub fn prompt_response(
    prompt: &str,
    active_markdown: &str,
    document_id: Option<&str>,
    openai_key: Option<&str>,
    model: &str,
) -> Value {
    let request = prompt_payload(prompt, active_markdown, document_id);
    let response = answer_interaction("prompt", &request, json!([]), openai_key, model);
    json!({
        "answer": response["answer"].clone(),
        "suggestedActions": if response["status"].as_str() == Some("completed") {
            json!(["Revisar el documento activo", "Crear una versión", "Actualizar notas"])
        } else {
            json!(["Configurar OpenAI", "Revisar ajustes de IA"])
        }
    })
}

fn prompt_payload(prompt: &str, active_markdown: &str, document_id: Option<&str>) -> Value {
    json!({
        "prompt": prompt,
        "activeMarkdown": active_markdown,
        "documentId": document_id,
        "mode": if document_id.is_some() { "document" } else { "project" }
    })
}

pub fn transcribe_audio(
    openai_key: Option<&str>,
    language: Option<&str>,
    wav_bytes: Vec<u8>,
) -> Value {
    let Some(openai_key) = openai_key.filter(|value| !value.trim().is_empty()) else {
        return json!({
            "status": "error",
            "error": "provider_unavailable",
            "transcript": "",
            "message": "Configura una API key de OpenAI en Ajustes > IA para usar transcripción."
        });
    };

    if wav_bytes.is_empty() {
        return json!({
            "status": "error",
            "error": "empty_audio",
            "transcript": "",
            "message": "No se recibió audio para transcribir."
        });
    }

    let mut form = multipart::Form::new()
        .text("model", "gpt-4o-mini-transcribe")
        .text("response_format", "json")
        .part(
            "file",
            multipart::Part::bytes(wav_bytes)
                .file_name("knownext-dictation.wav")
                .mime_str("audio/wav")
                .unwrap_or_else(|_| multipart::Part::bytes(Vec::new())),
        );
    if let Some(language) = language.filter(|value| *value != "auto" && !value.is_empty()) {
        form = form.text("language", language.to_string());
    }

    let response = openai_client(openai_key)
        .post("https://api.openai.com/v1/audio/transcriptions")
        .multipart(form)
        .send();

    match response {
        Ok(response) if response.status().is_success() => {
            let body = response.json::<Value>().unwrap_or_else(|_| json!({}));
            let transcript = body["text"].as_str().unwrap_or("").trim().to_string();
            json!({ "status": "completed", "transcript": transcript })
        }
        Ok(response) => {
            let status = response.status();
            let detail = response.text().unwrap_or_default();
            json!({
                "status": "error",
                "error": "provider_error",
                "transcript": "",
                "message": format!("OpenAI devolvió {status}: {}", summarize_error_detail(&detail))
            })
        }
        Err(error) => json!({
            "status": "error",
            "error": "provider_error",
            "transcript": "",
            "message": format!("No se pudo conectar con OpenAI: {error}")
        }),
    }
}

pub fn generate_image(openai_key: Option<&str>, config: &Value, prompt: &str) -> Value {
    let prompt = prompt.trim();
    let Some(openai_key) = openai_key.filter(|value| !value.trim().is_empty()) else {
        return json!({
            "status": "error",
            "error": "provider_unavailable",
            "message": "Configura una API key de OpenAI en Ajustes > IA para generar imágenes."
        });
    };
    if prompt.is_empty() {
        return json!({
            "status": "error",
            "error": "empty_prompt",
            "message": "La generación de imagen necesita un prompt validable."
        });
    }

    let model = normalize_image_model(config.get("model").and_then(Value::as_str).unwrap_or("gpt-image-2"));
    let mut request = json!({
        "model": model,
        "prompt": prompt,
        "n": config.get("maxImagesPerPrompt").and_then(Value::as_u64).unwrap_or(1).clamp(1, 4),
        "size": normalize_image_size_for_model(model, config.get("size").and_then(Value::as_str).unwrap_or("auto")),
        "quality": normalize_image_quality(config.get("quality").and_then(Value::as_str).unwrap_or("auto")),
        "output_format": normalize_image_format(config.get("outputFormat").and_then(Value::as_str).unwrap_or("png"))
    });
    if request["size"].as_str() == Some("auto") {
        request.as_object_mut().map(|object| object.remove("size"));
    }
    if request["quality"].as_str() == Some("auto") {
        request
            .as_object_mut()
            .map(|object| object.remove("quality"));
    }

    let response = openai_client(openai_key)
        .post("https://api.openai.com/v1/images/generations")
        .json(&request)
        .send();

    match response {
        Ok(response) if response.status().is_success() => {
            let body = response.json::<Value>().unwrap_or_else(|_| json!({}));
            let Some(item) = body
                .get("data")
                .and_then(Value::as_array)
                .and_then(|items| items.first())
            else {
                return json!({
                    "status": "error",
                    "error": "provider_error",
                    "message": "OpenAI no devolvió datos de imagen."
                });
            };
            if let Some(data_base64) = item
                .get("b64_json")
                .and_then(Value::as_str)
                .filter(|value| !value.trim().is_empty())
            {
                return json!({
                    "status": "completed",
                    "mimeType": mime_for_image_format(request["output_format"].as_str().unwrap_or("png")),
                    "dataBase64": data_base64,
                    "revisedPrompt": item.get("revised_prompt").and_then(Value::as_str),
                    "model": request["model"].as_str().unwrap_or("gpt-image-2"),
                    "size": request.get("size").and_then(Value::as_str).unwrap_or("auto"),
                    "quality": request.get("quality").and_then(Value::as_str).unwrap_or("auto"),
                    "format": request["output_format"].as_str().unwrap_or("png")
                });
            }
            if let Some(url) = item
                .get("url")
                .and_then(Value::as_str)
                .filter(|value| !value.trim().is_empty())
            {
                return match openai_client(openai_key).get(url).send() {
                    Ok(image_response) if image_response.status().is_success() => {
                        let mime = image_response
                            .headers()
                            .get("content-type")
                            .and_then(|value| value.to_str().ok())
                            .unwrap_or_else(|| {
                                mime_for_image_format(
                                    request["output_format"].as_str().unwrap_or("png"),
                                )
                            })
                            .to_string();
                        let bytes = image_response
                            .bytes()
                            .map(|bytes| bytes.to_vec())
                            .unwrap_or_default();
                        json!({
                            "status": "completed",
                            "mimeType": mime,
                            "dataBase64": base64::engine::general_purpose::STANDARD.encode(bytes),
                            "revisedPrompt": item.get("revised_prompt").and_then(Value::as_str),
                            "model": request["model"].as_str().unwrap_or("gpt-image-2"),
                            "size": request.get("size").and_then(Value::as_str).unwrap_or("auto"),
                            "quality": request.get("quality").and_then(Value::as_str).unwrap_or("auto"),
                            "format": request["output_format"].as_str().unwrap_or("png")
                        })
                    }
                    Ok(image_response) => json!({
                        "status": "error",
                        "error": "provider_error",
                        "message": format!("OpenAI devolvió {} al descargar la imagen.", image_response.status())
                    }),
                    Err(error) => json!({
                        "status": "error",
                        "error": "provider_error",
                        "message": format!("No se pudo descargar la imagen generada: {error}")
                    }),
                };
            }
            json!({
                "status": "error",
                "error": "provider_error",
                "message": "OpenAI no devolvió base64 ni URL para la imagen."
            })
        }
        Ok(response) => {
            let status = response.status();
            let detail = response.text().unwrap_or_default();
            json!({
                "status": "error",
                "error": "provider_error",
                "message": format!("OpenAI devolvió {status}: {}", summarize_error_detail(&detail))
            })
        }
        Err(error) => json!({
            "status": "error",
            "error": "provider_error",
            "message": format!("No se pudo conectar con OpenAI: {error}")
        }),
    }
}

fn build_response_request(
    payload: &Value,
    prompt: &str,
    context_sources: &Value,
    model: &str,
) -> Value {
    let active_markdown = payload
        .get("activeMarkdown")
        .and_then(Value::as_str)
        .unwrap_or("");
    let selection = payload
        .get("selectionFocus")
        .filter(|value| !value.is_null())
        .cloned()
        .unwrap_or(Value::Null);
    let permissions = payload
        .get("runtimePermissions")
        .cloned()
        .unwrap_or_else(|| json!({}));
    let execution_mode =
        normalize_execution_mode(payload.get("executionMode").and_then(Value::as_str));
    let reasoning_depth = if execution_mode == "quick" {
        "light"
    } else {
        normalize_reasoning_depth(payload.get("reasoningDepth").and_then(Value::as_str))
    };
    let reasoning_guidance = reasoning_instruction(execution_mode, reasoning_depth);
    let system = format!(
        "{} {}",
        concat!(
        "Eres el asistente documental de KnowNext.ai. Responde en español salvo que el usuario pida otro idioma. ",
        "Usa el documento activo y las fuentes aportadas como contexto. ",
        "Devuelve siempre un JSON sin markdown externo ni bloques de codigo. ",
        "Contrato de salida: {\"action\":\"answer\",\"answer\":\"texto\"} para consultas; ",
        "{\"action\":\"replace_document\",\"answer\":\"resumen para el usuario\",\"summary\":\"resumen breve\",\"markdown\":\"documento markdown completo\"} para cambios de contenido del documento activo. ",
        "{\"action\":\"create_document\",\"answer\":\"resumen para el usuario\",\"summary\":\"resumen breve\",\"name\":\"nombre.md\",\"markdown\":\"documento markdown completo\"} para crear un documento Markdown nuevo cuando el usuario lo pida. ",
        "{\"action\":\"generate_image\",\"answer\":\"resumen para el usuario\",\"summary\":\"resumen breve\",\"prompt\":\"prompt visual detallado\",\"name\":\"nombre.png\",\"altText\":\"texto alternativo\",\"insertIntoDocument\":true} para generar una imagen local como asset del proyecto. ",
        "No afirmes que has modificado archivos: propone el cambio con action replace_document y el runtime lo validara contra permisos. ",
        "No afirmes que has creado archivos: propone el cambio con action create_document y el runtime lo validara contra permisos. ",
        "No afirmes que has generado imagenes: propone action generate_image y el runtime la creara, guardara e insertara si los permisos lo permiten. ",
        "No uses action replace_document si no hay documento activo o si la peticion no requiere modificar contenido."
        ),
        reasoning_guidance,
    );
    let user_content = format!(
        "Petición del usuario:\n{prompt}\n\nModo de ejecución:\n{} ({})\n\nPermisos runtime:\n{}\n\nDocumento activo Markdown:\n{active_markdown}\n\nSelección activa:\n{}\n\nFuentes de contexto:\n{}",
        execution_mode,
        reasoning_depth,
        serde_json::to_string_pretty(&permissions).unwrap_or_else(|_| "{}".to_string()),
        serde_json::to_string_pretty(&selection).unwrap_or_else(|_| "null".to_string()),
        serde_json::to_string_pretty(context_sources).unwrap_or_else(|_| "[]".to_string()),
    );
    json!({
        "model": normalize_text_model(model),
        "input": [
            { "role": "system", "content": system },
            { "role": "user", "content": user_content }
        ],
        "max_output_tokens": max_output_tokens_for_execution(execution_mode, reasoning_depth)
    })
}

fn normalize_execution_mode(mode: Option<&str>) -> &'static str {
    match mode {
        Some("reasoning") => "reasoning",
        _ => "quick",
    }
}

fn normalize_reasoning_depth(depth: Option<&str>) -> &'static str {
    match depth {
        Some("medium") => "medium",
        Some("deep") => "deep",
        _ => "light",
    }
}

fn reasoning_instruction(execution_mode: &str, reasoning_depth: &str) -> &'static str {
    match (execution_mode, reasoning_depth) {
        ("reasoning", "deep") => "Modo Razonar profundo: haz un preflight interno exhaustivo sobre documento, seleccion y contexto aportado antes de responder; no uses fuentes externas no aportadas; conserva el contrato JSON de salida.",
        ("reasoning", "medium") => "Modo Razonar medio: revisa internamente documento, seleccion y contexto aportado antes de responder; no uses fuentes externas no aportadas; conserva el contrato JSON de salida.",
        ("reasoning", _) => "Modo Razonar ligero: contrasta internamente la peticion con el documento activo y el contexto aportado antes de responder; conserva el contrato JSON de salida.",
        _ => "Modo rapido: responde con una sola pasada directa usando solo el documento activo y el contexto aportado; conserva el contrato JSON de salida.",
    }
}

fn max_output_tokens_for_execution(execution_mode: &str, reasoning_depth: &str) -> u32 {
    match (execution_mode, reasoning_depth) {
        ("reasoning", "deep") => 2600,
        ("reasoning", "medium") => 2000,
        ("reasoning", _) => 1700,
        _ => 1400,
    }
}

fn provider_unavailable_response(
    project_id: &str,
    document_id: Option<&str>,
    interaction_id: &str,
    event_id: &str,
    created_at: &str,
    message: &str,
    execution_mode: &str,
    reasoning_depth: &str,
    mode: &str,
) -> Value {
    provider_status_response(
        project_id,
        document_id,
        interaction_id,
        event_id,
        created_at,
        message,
        "provider_unavailable",
        execution_mode,
        reasoning_depth,
        mode,
    )
}

fn provider_error_response(
    project_id: &str,
    document_id: Option<&str>,
    interaction_id: &str,
    event_id: &str,
    created_at: &str,
    message: &str,
    execution_mode: &str,
    reasoning_depth: &str,
    mode: &str,
) -> Value {
    provider_status_response(
        project_id,
        document_id,
        interaction_id,
        event_id,
        created_at,
        message,
        "provider_error",
        execution_mode,
        reasoning_depth,
        mode,
    )
}

fn provider_status_response(
    project_id: &str,
    document_id: Option<&str>,
    interaction_id: &str,
    event_id: &str,
    created_at: &str,
    message: &str,
    event_type: &str,
    execution_mode: &str,
    reasoning_depth: &str,
    mode: &str,
) -> Value {
    let event = json!({
        "id": event_id,
        "projectId": project_id,
        "type": event_type,
        "role": "assistant",
        "content": message,
        "createdAt": created_at,
        "documentId": document_id,
        "path": null,
        "paths": [],
        "summary": null,
        "sourcesUsed": []
    });
    json!({
        "interactionId": interaction_id,
        "status": "error",
        "display": "bubble",
        "uiPlacement": if mode == "project" { "conversation_tab" } else { "document_bubble" },
        "interactionType": "chat",
        "confidence": "high",
        "executionMode": execution_mode,
        "reasoningDepth": reasoning_depth,
        "executionScope": "needs_permission",
        "routeToAiTab": mode == "project",
        "needsUserClarification": false,
        "pendingIntent": null,
        "pendingIntentStatus": null,
        "answer": message,
        "conversationEvents": [event],
        "operations": [{ "type": event_type }],
        "updatedDocument": null,
        "generatedImages": [],
        "task": null,
        "tree": null,
        "affectedDocuments": [],
        "requiresConfirmation": null,
        "contextSources": null,
        "expiredContextSourceIds": []
    })
}

#[allow(clippy::too_many_arguments)]
fn structured_interaction_response(
    project_id: &str,
    payload: &Value,
    document_id: Option<&str>,
    interaction_id: &str,
    event_id: &str,
    created_at: &str,
    provider_text: &str,
    execution_mode: &str,
    reasoning_depth: &str,
    mode: &str,
    context_sources: &Value,
) -> Option<Value> {
    let decision = parse_provider_decision(provider_text)?;
    let action = decision
        .get("action")
        .and_then(Value::as_str)
        .unwrap_or("answer");
    let answer = decision
        .get("answer")
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .unwrap_or(provider_text)
        .trim();

    if action == "answer" {
        return Some(chat_response(
            project_id,
            document_id,
            interaction_id,
            event_id,
            created_at,
            answer,
            execution_mode,
            reasoning_depth,
            mode,
            context_sources,
        ));
    }

    if action == "create_document" {
        return Some(create_document_response(
            project_id,
            payload,
            document_id,
            interaction_id,
            event_id,
            created_at,
            &decision,
            answer,
            execution_mode,
            reasoning_depth,
            mode,
            context_sources,
        ));
    }

    if action == "generate_image" {
        return Some(generate_image_response(
            project_id,
            payload,
            document_id,
            interaction_id,
            event_id,
            created_at,
            &decision,
            answer,
            execution_mode,
            reasoning_depth,
            mode,
            context_sources,
        ));
    }

    if action != "replace_document" {
        return Some(permission_blocked_response(
            project_id,
            document_id,
            interaction_id,
            event_id,
            created_at,
            "La IA propuso una acción que esta versión de KnowNext.ai todavía no puede aplicar de forma segura.",
            execution_mode,
            reasoning_depth,
            mode,
        ));
    }

    let Some(document_id) = document_id.filter(|value| !value.trim().is_empty()) else {
        return Some(permission_blocked_response(
            project_id,
            None,
            interaction_id,
            event_id,
            created_at,
            "La IA propuso editar, pero no hay un documento activo sobre el que aplicar el cambio.",
            execution_mode,
            reasoning_depth,
            mode,
        ));
    };

    if !payload
        .pointer("/runtimePermissions/editDocuments")
        .and_then(Value::as_bool)
        .unwrap_or(false)
    {
        return Some(permission_blocked_response(
            project_id,
            Some(document_id),
            interaction_id,
            event_id,
            created_at,
            "La IA propuso modificar el documento, pero el permiso de edición está desactivado en Ajustes > IA.",
            execution_mode,
            reasoning_depth,
            mode,
        ));
    }

    let Some(markdown) = decision
        .get("markdown")
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
    else {
        return Some(permission_blocked_response(
            project_id,
            Some(document_id),
            interaction_id,
            event_id,
            created_at,
            "La IA propuso editar, pero no devolvió un documento Markdown completo y validable.",
            execution_mode,
            reasoning_depth,
            mode,
        ));
    };
    let summary = decision
        .get("summary")
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .unwrap_or(answer);
    let public_context_sources = public_context_sources(context_sources);
    let assistant_event = json!({
        "id": event_id,
        "projectId": project_id,
        "type": "document_modified",
        "role": "assistant",
        "content": answer,
        "createdAt": created_at,
        "documentId": document_id,
        "path": null,
        "paths": [],
        "summary": summary,
        "sourcesUsed": public_context_sources,
    });
    Some(json!({
        "interactionId": interaction_id,
        "status": "completed",
        "display": "bubble",
        "uiPlacement": if mode == "project" { "conversation_tab" } else { "document_bubble" },
        "interactionType": "document_edit",
        "confidence": "medium",
        "executionMode": execution_mode,
        "reasoningDepth": reasoning_depth,
        "executionScope": "direct_action",
        "routeToAiTab": mode == "project",
        "needsUserClarification": false,
        "pendingIntent": null,
        "pendingIntentStatus": null,
        "answer": answer,
        "conversationEvents": [assistant_event],
        "operations": [{
            "type": "document_modified",
            "status": "completed",
            "message": summary,
            "documentId": document_id,
            "nodeId": null,
            "path": null,
            "paths": [],
            "summary": summary,
            "task": null,
            "confirmationId": null
        }],
        "updatedDocument": {
            "documentId": document_id,
            "markdown": markdown,
            "summary": summary
        },
        "generatedImages": [],
        "task": null,
        "tree": null,
        "affectedDocuments": [],
        "requiresConfirmation": null,
        "contextSources": null,
        "expiredContextSourceIds": []
    }))
}

#[allow(clippy::too_many_arguments)]
fn generate_image_response(
    project_id: &str,
    payload: &Value,
    document_id: Option<&str>,
    interaction_id: &str,
    event_id: &str,
    created_at: &str,
    decision: &Value,
    answer: &str,
    execution_mode: &str,
    reasoning_depth: &str,
    mode: &str,
    context_sources: &Value,
) -> Value {
    if !payload
        .pointer("/runtimePermissions/generateImages")
        .and_then(Value::as_bool)
        .unwrap_or(false)
        || !payload
            .pointer("/runtimePermissions/createImageAssets")
            .and_then(Value::as_bool)
            .unwrap_or(false)
    {
        return permission_blocked_response(
            project_id,
            document_id,
            interaction_id,
            event_id,
            created_at,
            "La IA ha preparado una imagen, pero la generación de imágenes o la creación de assets está desactivada en Ajustes > IA.",
            execution_mode,
            reasoning_depth,
            mode,
        );
    }

    let Some(prompt) = decision
        .get("prompt")
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
    else {
        return permission_blocked_response(
            project_id,
            document_id,
            interaction_id,
            event_id,
            created_at,
            "La IA propuso generar una imagen, pero no devolvió un prompt visual validable.",
            execution_mode,
            reasoning_depth,
            mode,
        );
    };
    let summary = decision
        .get("summary")
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .unwrap_or(answer);
    let name = normalize_image_file_name(
        decision
            .get("name")
            .or_else(|| decision.get("title"))
            .and_then(Value::as_str)
            .unwrap_or("imagen-ia.png"),
        "png",
    );
    let alt_text = decision
        .get("altText")
        .or_else(|| decision.get("alt"))
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .unwrap_or("Imagen generada por IA");
    let insert_into_document = decision
        .get("insertIntoDocument")
        .and_then(Value::as_bool)
        .unwrap_or(document_id.is_some());
    let public_context_sources = public_context_sources(context_sources);
    let assistant_event = json!({
        "id": event_id,
        "projectId": project_id,
        "type": "image_generated",
        "role": "assistant",
        "content": answer,
        "createdAt": created_at,
        "documentId": document_id,
        "path": null,
        "paths": [],
        "summary": summary,
        "sourcesUsed": public_context_sources,
    });
    json!({
        "interactionId": interaction_id,
        "status": "completed",
        "display": "bubble",
        "uiPlacement": if mode == "project" { "conversation_tab" } else { "document_bubble" },
        "interactionType": "image_generation",
        "confidence": "medium",
        "executionMode": execution_mode,
        "reasoningDepth": reasoning_depth,
        "executionScope": "direct_action",
        "routeToAiTab": true,
        "needsUserClarification": false,
        "pendingIntent": null,
        "pendingIntentStatus": null,
        "answer": answer,
        "conversationEvents": [assistant_event],
        "operations": [{
            "type": "image_generated",
            "status": "ready",
            "message": summary,
            "documentId": document_id,
            "nodeId": null,
            "path": null,
            "paths": [],
            "summary": summary,
            "task": null,
            "confirmationId": null,
            "name": name,
            "prompt": prompt,
            "altText": alt_text,
            "insertIntoDocument": insert_into_document
        }],
        "updatedDocument": null,
        "generatedImages": [],
        "task": null,
        "tree": null,
        "affectedDocuments": [],
        "requiresConfirmation": null,
        "contextSources": null,
        "expiredContextSourceIds": []
    })
}

#[allow(clippy::too_many_arguments)]
fn create_document_response(
    project_id: &str,
    payload: &Value,
    document_id: Option<&str>,
    interaction_id: &str,
    event_id: &str,
    created_at: &str,
    decision: &Value,
    answer: &str,
    execution_mode: &str,
    reasoning_depth: &str,
    mode: &str,
    context_sources: &Value,
) -> Value {
    if !payload
        .pointer("/runtimePermissions/createDocuments")
        .and_then(Value::as_bool)
        .unwrap_or(false)
    {
        return permission_blocked_response(
            project_id,
            document_id,
            interaction_id,
            event_id,
            created_at,
            "La IA ha preparado un documento nuevo, pero el permiso de creación de documentos está desactivado en Ajustes > IA.",
            execution_mode,
            reasoning_depth,
            mode,
        );
    }

    let Some(markdown) = decision
        .get("markdown")
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
    else {
        return permission_blocked_response(
            project_id,
            document_id,
            interaction_id,
            event_id,
            created_at,
            "La IA propuso crear un documento, pero no devolvió un Markdown completo y validable.",
            execution_mode,
            reasoning_depth,
            mode,
        );
    };
    let raw_name = decision
        .get("name")
        .or_else(|| decision.get("title"))
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .unwrap_or("documento-ia.md");
    let name = normalize_markdown_file_name(raw_name);
    let summary = decision
        .get("summary")
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .unwrap_or(answer);
    let public_context_sources = public_context_sources(context_sources);
    let assistant_event = json!({
        "id": event_id,
        "projectId": project_id,
        "type": "document_created",
        "role": "assistant",
        "content": answer,
        "createdAt": created_at,
        "documentId": document_id,
        "path": null,
        "paths": [],
        "summary": summary,
        "sourcesUsed": public_context_sources,
    });
    json!({
        "interactionId": interaction_id,
        "status": "completed",
        "display": "bubble",
        "uiPlacement": if mode == "project" { "conversation_tab" } else { "document_bubble" },
        "interactionType": "project_operation",
        "confidence": "medium",
        "executionMode": execution_mode,
        "reasoningDepth": reasoning_depth,
        "executionScope": "direct_action",
        "routeToAiTab": mode == "project",
        "needsUserClarification": false,
        "pendingIntent": null,
        "pendingIntentStatus": null,
        "answer": answer,
        "conversationEvents": [assistant_event],
        "operations": [{
            "type": "document_created",
            "status": "ready",
            "message": summary,
            "documentId": null,
            "nodeId": null,
            "path": null,
            "paths": [],
            "summary": summary,
            "task": null,
            "confirmationId": null,
            "name": name,
            "markdown": markdown
        }],
        "updatedDocument": null,
        "generatedImages": [],
        "task": null,
        "tree": null,
        "affectedDocuments": [],
        "requiresConfirmation": null,
        "contextSources": null,
        "expiredContextSourceIds": []
    })
}

#[allow(clippy::too_many_arguments)]
fn chat_response(
    project_id: &str,
    document_id: Option<&str>,
    interaction_id: &str,
    event_id: &str,
    created_at: &str,
    answer: &str,
    execution_mode: &str,
    reasoning_depth: &str,
    mode: &str,
    context_sources: &Value,
) -> Value {
    let public_context_sources = public_context_sources(context_sources);
    let assistant_event = json!({
        "id": event_id,
        "projectId": project_id,
        "type": "assistant_message",
        "role": "assistant",
        "content": answer,
        "createdAt": created_at,
        "documentId": document_id,
        "path": null,
        "paths": [],
        "summary": null,
        "sourcesUsed": public_context_sources,
    });
    json!({
        "interactionId": interaction_id,
        "status": "completed",
        "display": "bubble",
        "uiPlacement": if mode == "project" { "conversation_tab" } else { "document_bubble" },
        "interactionType": "chat",
        "confidence": "medium",
        "executionMode": execution_mode,
        "reasoningDepth": reasoning_depth,
        "executionScope": "direct_action",
        "routeToAiTab": mode == "project",
        "needsUserClarification": false,
        "pendingIntent": null,
        "pendingIntentStatus": null,
        "answer": assistant_event["content"],
        "conversationEvents": [assistant_event],
        "operations": [],
        "updatedDocument": null,
        "generatedImages": [],
        "task": null,
        "tree": null,
        "affectedDocuments": [],
        "requiresConfirmation": null,
        "contextSources": null,
        "expiredContextSourceIds": []
    })
}

fn permission_blocked_response(
    project_id: &str,
    document_id: Option<&str>,
    interaction_id: &str,
    event_id: &str,
    created_at: &str,
    message: &str,
    execution_mode: &str,
    reasoning_depth: &str,
    mode: &str,
) -> Value {
    let event = json!({
        "id": event_id,
        "projectId": project_id,
        "type": "permission_blocked",
        "role": "assistant",
        "content": message,
        "createdAt": created_at,
        "documentId": document_id,
        "path": null,
        "paths": [],
        "summary": message,
        "sourcesUsed": []
    });
    json!({
        "interactionId": interaction_id,
        "status": "blocked",
        "display": "bubble",
        "uiPlacement": if mode == "project" { "conversation_tab" } else { "document_bubble" },
        "interactionType": "document_edit",
        "confidence": "high",
        "executionMode": execution_mode,
        "reasoningDepth": reasoning_depth,
        "executionScope": "needs_permission",
        "routeToAiTab": mode == "project",
        "needsUserClarification": false,
        "pendingIntent": null,
        "pendingIntentStatus": null,
        "answer": message,
        "conversationEvents": [event],
        "operations": [{
            "type": "permission_blocked",
            "status": "blocked",
            "message": message,
            "documentId": document_id,
            "nodeId": null,
            "path": null,
            "paths": [],
            "summary": message,
            "task": null,
            "confirmationId": null
        }],
        "updatedDocument": null,
        "generatedImages": [],
        "task": null,
        "tree": null,
        "affectedDocuments": [],
        "requiresConfirmation": null,
        "contextSources": null,
        "expiredContextSourceIds": []
    })
}

fn parse_provider_decision(text: &str) -> Option<Value> {
    let trimmed = text.trim();
    serde_json::from_str::<Value>(trimmed)
        .ok()
        .or_else(|| {
            extract_fenced_json(trimmed)
                .and_then(|json_text| serde_json::from_str::<Value>(json_text).ok())
        })
        .filter(|value| value.is_object() && value.get("action").and_then(Value::as_str).is_some())
}

fn extract_fenced_json(text: &str) -> Option<&str> {
    let start_marker = text.find("```")?;
    let after_start = &text[start_marker + 3..];
    let content_start = after_start.find('\n').map(|index| index + 1).unwrap_or(0);
    let content = &after_start[content_start..];
    let end = content.find("```")?;
    Some(content[..end].trim())
}

fn normalize_markdown_file_name(raw: &str) -> String {
    let mut name = raw
        .trim()
        .replace('\\', "/")
        .rsplit('/')
        .next()
        .unwrap_or("documento-ia.md")
        .chars()
        .map(|character| match character {
            '<' | '>' | ':' | '"' | '|' | '?' | '*' => '-',
            character if character.is_control() => '-',
            character => character,
        })
        .collect::<String>()
        .trim()
        .trim_matches('.')
        .to_string();
    if name.is_empty() {
        name = "documento-ia.md".to_string();
    }
    if !name.to_ascii_lowercase().ends_with(".md") {
        name.push_str(".md");
    }
    name
}

fn normalize_image_file_name(raw: &str, default_format: &str) -> String {
    let format = normalize_image_format(default_format);
    let mut name = raw
        .trim()
        .replace('\\', "/")
        .rsplit('/')
        .next()
        .unwrap_or("imagen-ia")
        .chars()
        .map(|character| match character {
            '<' | '>' | ':' | '"' | '|' | '?' | '*' => '-',
            character if character.is_control() => '-',
            character => character,
        })
        .collect::<String>()
        .trim()
        .trim_matches('.')
        .to_string();
    if name.is_empty() {
        name = "imagen-ia".to_string();
    }
    let lower = name.to_ascii_lowercase();
    if !matches!(
        lower.rsplit('.').next(),
        Some("png" | "webp" | "jpg" | "jpeg")
    ) {
        name.push('.');
        name.push_str(format);
    }
    name
}

fn normalize_image_model(model: &str) -> &'static str {
    match model {
        "gpt-image-2" => "gpt-image-2",
        "gpt-image-1.5" => "gpt-image-1.5",
        "gpt-image-1" => "gpt-image-1",
        "gpt-image-1-mini" => "gpt-image-1-mini",
        _ => "gpt-image-2",
    }
}

fn normalize_image_size(size: &str) -> &'static str {
    match size {
        "1024x1024" => "1024x1024",
        "1536x1024" => "1536x1024",
        "1024x1536" => "1024x1536",
        "2048x2048" => "2048x2048",
        "2048x1152" => "2048x1152",
        "3840x2160" => "3840x2160",
        "2160x3840" => "2160x3840",
        _ => "auto",
    }
}

fn normalize_image_size_for_model(model: &str, size: &str) -> &'static str {
    let normalized = normalize_image_size(size);
    if model == "gpt-image-2" || matches!(normalized, "auto" | "1024x1024" | "1536x1024" | "1024x1536") {
        normalized
    } else {
        "auto"
    }
}

fn normalize_image_quality(quality: &str) -> &'static str {
    match quality {
        "low" => "low",
        "medium" => "medium",
        "high" => "high",
        _ => "auto",
    }
}

fn normalize_image_format(format: &str) -> &'static str {
    match format {
        "webp" => "webp",
        "jpeg" | "jpg" => "jpeg",
        _ => "png",
    }
}

fn mime_for_image_format(format: &str) -> &'static str {
    match normalize_image_format(format) {
        "webp" => "image/webp",
        "jpeg" => "image/jpeg",
        _ => "image/png",
    }
}

fn openai_client(openai_key: &str) -> Client {
    let mut headers = HeaderMap::new();
    headers.insert(USER_AGENT, HeaderValue::from_static("KnowNext.ai"));
    headers.insert(ACCEPT, HeaderValue::from_static("application/json"));
    if let Ok(value) = HeaderValue::from_str(&format!("Bearer {openai_key}")) {
        headers.insert(AUTHORIZATION, value);
    }
    Client::builder()
        .default_headers(headers)
        .timeout(Duration::from_secs(90))
        .build()
        .unwrap_or_else(|_| Client::new())
}

fn extract_response_text(value: &Value) -> Option<String> {
    if let Some(text) = value
        .get("output_text")
        .and_then(Value::as_str)
        .filter(|text| !text.trim().is_empty())
    {
        return Some(text.trim().to_string());
    }
    let mut chunks = Vec::new();
    for output in value
        .get("output")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
    {
        for content in output
            .get("content")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
        {
            if let Some(text) = content.get("text").and_then(Value::as_str) {
                chunks.push(text);
            }
        }
    }
    let text = chunks.join("\n").trim().to_string();
    if text.is_empty() {
        None
    } else {
        Some(text)
    }
}

fn normalize_text_model(model: &str) -> &'static str {
    match model {
        "gpt-5.5" => "gpt-5.5",
        "gpt-5.4" => "gpt-5.4",
        "gpt-5.4-mini" => "gpt-5.4-mini",
        "gpt-5.4-nano" => "gpt-5.4-nano",
        "gpt-5.2" => "gpt-5.5",
        "gpt-5" => "gpt-5.4",
        "gpt-5-mini" => "gpt-5.4-mini",
        "gpt-5-nano" => "gpt-5.4-nano",
        _ => "gpt-5.4-mini",
    }
}

fn summarize_error_detail(detail: &str) -> String {
    if detail.trim().is_empty() {
        return "sin detalle".to_string();
    }
    serde_json::from_str::<Value>(detail)
        .ok()
        .and_then(|value| {
            value
                .pointer("/error/message")
                .and_then(Value::as_str)
                .map(str::to_string)
        })
        .unwrap_or_else(|| detail.chars().take(500).collect())
}

fn public_context_sources(context_sources: &Value) -> Value {
    let Some(sources) = context_sources.as_array() else {
        return json!([]);
    };
    Value::Array(
        sources
            .iter()
            .cloned()
            .map(strip_internal_source_text)
            .collect(),
    )
}

fn strip_internal_source_text(mut source: Value) -> Value {
    if let Some(object) = source.as_object_mut() {
        object.remove("text");
    }
    source
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn structured_answer_remains_chat() {
        let response = structured_interaction_response(
            "project",
            &json!({ "runtimePermissions": { "editDocuments": true } }),
            Some("project::doc.md"),
            "interaction",
            "event",
            "2026-06-04T00:00:00Z",
            r#"{"action":"answer","answer":"El documento resume el proyecto."}"#,
            "quick",
            "light",
            "document",
            &json!([]),
        )
        .unwrap();

        assert_eq!(response["status"], "completed");
        assert_eq!(response["interactionType"], "chat");
        assert!(response["updatedDocument"].is_null());
        assert_eq!(response["answer"], "El documento resume el proyecto.");
    }

    #[test]
    fn response_request_applies_execution_mode_and_reasoning_depth() {
        let quick = build_response_request(
            &json!({
                "activeMarkdown": "# Nota",
                "runtimePermissions": { "editDocuments": true },
                "executionMode": "quick",
                "reasoningDepth": "deep"
            }),
            "Resume",
            &json!([]),
            "gpt-5.4-mini",
        );
        assert_eq!(quick["max_output_tokens"], 1400);
        assert!(quick["input"][0]["content"]
            .as_str()
            .unwrap()
            .contains("Modo rapido"));
        assert!(quick["input"][1]["content"]
            .as_str()
            .unwrap()
            .contains("quick (light)"));

        let reasoning = build_response_request(
            &json!({
                "activeMarkdown": "# Nota",
                "runtimePermissions": { "editDocuments": true },
                "executionMode": "reasoning",
                "reasoningDepth": "deep"
            }),
            "Investiga dentro del documento",
            &json!([{ "id": "source", "name": "Fuente", "text": "Dato" }]),
            "gpt-5.4-mini",
        );
        assert_eq!(reasoning["max_output_tokens"], 2600);
        let system = reasoning["input"][0]["content"].as_str().unwrap();
        let user = reasoning["input"][1]["content"].as_str().unwrap();
        assert!(system.contains("Modo Razonar profundo"));
        assert!(system.contains("no uses fuentes externas no aportadas"));
        assert!(user.contains("reasoning (deep)"));
    }

    #[test]
    fn prompt_payload_preserves_document_context_for_auxiliary_prompt_contract() {
        let payload = prompt_payload(
            "Resume el documento",
            "# Activo\n\nContenido actual.",
            Some("project::docs/activo.md"),
        );

        assert_eq!(payload["prompt"], "Resume el documento");
        assert_eq!(payload["activeMarkdown"], "# Activo\n\nContenido actual.");
        assert_eq!(payload["documentId"], "project::docs/activo.md");
        assert_eq!(payload["mode"], "document");
    }

    #[test]
    fn structured_document_edit_returns_validated_updated_document() {
        let response = structured_interaction_response(
            "project",
            &json!({ "runtimePermissions": { "editDocuments": true } }),
            Some("project::doc.md"),
            "interaction",
            "event",
            "2026-06-04T00:00:00Z",
            r##"{"action":"replace_document","answer":"He preparado una versión revisada.","summary":"Documento revisado","markdown":"# Revisado\n\nContenido final."}"##,
            "reasoning",
            "medium",
            "document",
            &json!([{ "id": "source", "text": "internal", "name": "Fuente" }]),
        ).unwrap();

        assert_eq!(response["status"], "completed");
        assert_eq!(response["interactionType"], "document_edit");
        assert_eq!(response["operations"][0]["type"], "document_modified");
        assert_eq!(response["updatedDocument"]["documentId"], "project::doc.md");
        assert_eq!(
            response["updatedDocument"]["markdown"],
            "# Revisado\n\nContenido final."
        );
        assert!(response["conversationEvents"][0]["sourcesUsed"][0]["text"].is_null());
    }

    #[test]
    fn structured_document_creation_returns_validated_project_operation() {
        let response = structured_interaction_response(
            "project",
            &json!({ "runtimePermissions": { "createDocuments": true } }),
            Some("project::active.md"),
            "interaction",
            "event",
            "2026-06-04T00:00:00Z",
            r##"{"action":"create_document","answer":"He preparado el documento nuevo.","summary":"Documento nuevo preparado","name":"Plan: IA","markdown":"# Plan IA\n\nContenido final."}"##,
            "reasoning",
            "medium",
            "document",
            &json!([{ "id": "source", "text": "internal", "name": "Fuente" }]),
        ).unwrap();

        assert_eq!(response["status"], "completed");
        assert_eq!(response["interactionType"], "project_operation");
        assert_eq!(response["operations"][0]["type"], "document_created");
        assert_eq!(response["operations"][0]["status"], "ready");
        assert_eq!(response["operations"][0]["name"], "Plan- IA.md");
        assert_eq!(
            response["operations"][0]["markdown"],
            "# Plan IA\n\nContenido final."
        );
        assert_eq!(
            response["conversationEvents"][0]["type"],
            "document_created"
        );
        assert!(response["conversationEvents"][0]["sourcesUsed"][0]["text"].is_null());
    }

    #[test]
    fn structured_image_generation_returns_runtime_validated_operation() {
        let response = structured_interaction_response(
            "project",
            &json!({ "runtimePermissions": { "generateImages": true, "createImageAssets": true, "insertImagesIntoDocuments": true } }),
            Some("project::doc.md"),
            "interaction",
            "event",
            "2026-06-04T00:00:00Z",
            r##"{"action":"generate_image","answer":"He preparado la imagen.","summary":"Imagen preparada","prompt":"Ilustración técnica de un flujo local-first","name":"flujo-local","altText":"Flujo local-first","insertIntoDocument":true}"##,
            "quick",
            "light",
            "document",
            &json!([{ "id": "source", "text": "internal", "name": "Fuente" }]),
        )
        .unwrap();

        assert_eq!(response["status"], "completed");
        assert_eq!(response["interactionType"], "image_generation");
        assert_eq!(response["operations"][0]["type"], "image_generated");
        assert_eq!(response["operations"][0]["status"], "ready");
        assert_eq!(response["operations"][0]["name"], "flujo-local.png");
        assert_eq!(
            response["operations"][0]["prompt"],
            "Ilustración técnica de un flujo local-first"
        );
        assert_eq!(response["operations"][0]["insertIntoDocument"], true);
        assert_eq!(response["conversationEvents"][0]["type"], "image_generated");
        assert!(response["conversationEvents"][0]["sourcesUsed"][0]["text"].is_null());
    }

    #[test]
    fn gpt_image_2_is_the_supported_default_image_generation_model() {
        assert_eq!(normalize_image_model("gpt-image-2"), "gpt-image-2");
        assert_eq!(normalize_image_model("unknown-image-model"), "gpt-image-2");
        assert_eq!(normalize_image_size("2048x2048"), "2048x2048");
        assert_eq!(normalize_image_size("2048x1152"), "2048x1152");
        assert_eq!(normalize_image_size("3840x2160"), "3840x2160");
        assert_eq!(normalize_image_size("2160x3840"), "2160x3840");
        assert_eq!(normalize_image_size_for_model("gpt-image-2", "3840x2160"), "3840x2160");
        assert_eq!(normalize_image_size_for_model("gpt-image-1.5", "3840x2160"), "auto");
    }

    #[test]
    fn structured_document_edit_is_blocked_without_permission() {
        let response = structured_interaction_response(
            "project",
            &json!({ "runtimePermissions": { "editDocuments": false } }),
            Some("project::doc.md"),
            "interaction",
            "event",
            "2026-06-04T00:00:00Z",
            r##"{"action":"replace_document","answer":"Cambio propuesto","summary":"Cambio","markdown":"# Cambio"}"##,
            "quick",
            "light",
            "document",
            &json!([]),
        ).unwrap();

        assert_eq!(response["status"], "blocked");
        assert_eq!(response["operations"][0]["type"], "permission_blocked");
        assert!(response["updatedDocument"].is_null());
    }

    #[test]
    fn structured_document_edit_is_blocked_without_active_document() {
        let response = structured_interaction_response(
            "project",
            &json!({ "runtimePermissions": { "editDocuments": true } }),
            None,
            "interaction",
            "event",
            "2026-06-04T00:00:00Z",
            r##"{"action":"replace_document","answer":"Cambio propuesto","summary":"Cambio","markdown":"# Cambio"}"##,
            "quick",
            "light",
            "project",
            &json!([]),
        ).unwrap();

        assert_eq!(response["status"], "blocked");
        assert_eq!(response["operations"][0]["type"], "permission_blocked");
        assert!(response["updatedDocument"].is_null());
        assert!(response["answer"]
            .as_str()
            .unwrap()
            .contains("no hay un documento activo"));
    }

    #[test]
    fn unsupported_structured_actions_are_blocked() {
        let response = structured_interaction_response(
            "project",
            &json!({ "runtimePermissions": { "editDocuments": true, "deleteDocuments": true } }),
            Some("project::doc.md"),
            "interaction",
            "event",
            "2026-06-04T00:00:00Z",
            r##"{"action":"delete_document","answer":"Voy a eliminar el documento."}"##,
            "reasoning",
            "deep",
            "document",
            &json!([]),
        )
        .unwrap();

        assert_eq!(response["status"], "blocked");
        assert_eq!(response["operations"][0]["type"], "permission_blocked");
        assert!(response["updatedDocument"].is_null());
        assert!(response["answer"]
            .as_str()
            .unwrap()
            .contains("todavía no puede aplicar"));
    }
}
