use serde_json::{json, Value};

pub fn answer_interaction(project_id: &str, payload: &Value, context_sources: Value) -> Value {
    let prompt = payload.get("prompt").and_then(Value::as_str).unwrap_or("").trim();
    let document_id = payload.get("documentId").and_then(Value::as_str);
    let mode = payload.get("mode").and_then(Value::as_str).unwrap_or("document");
    let execution_mode = payload.get("executionMode").and_then(Value::as_str).unwrap_or("quick");
    let reasoning_depth = payload.get("reasoningDepth").and_then(Value::as_str).unwrap_or("light");
    let event_id = knownext_core::compact_id("ai-event");
    let interaction_id = knownext_core::compact_id("ai");
    let created_at = knownext_core::now_iso();
    let answer = if prompt.is_empty() {
        "Indica qué necesitas hacer con el documento activo.".to_string()
    } else if let Some(document_id) = document_id {
        format!("Respuesta local contextual para `{document_id}`: {prompt}")
    } else {
        format!("Respuesta local contextual del proyecto: {prompt}")
    };

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
        "sourcesUsed": context_sources,
    });

    json!({
        "interactionId": interaction_id,
        "status": "completed",
        "display": "bubble",
        "uiPlacement": "document_bubble",
        "interactionType": "chat",
        "confidence": "medium",
        "executionMode": execution_mode,
        "reasoningDepth": reasoning_depth,
        "executionScope": "direct_action",
        "routeToAiTab": mode == "project",
        "needsUserClarification": prompt.is_empty(),
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
        "contextSources": [],
        "expiredContextSourceIds": []
    })
}

pub fn prompt_response(prompt: &str) -> Value {
    json!({
        "answer": if prompt.trim().is_empty() { "Escribe una petición para continuar." } else { "KnowNext.ai ejecuta IA local-first desde Rust/Tauri en esta versión. La respuesta real de proveedor se habilitará mediante el adaptador Rust configurado." },
        "suggestedActions": ["Revisar el documento activo", "Crear una versión", "Actualizar notas"]
    })
}
