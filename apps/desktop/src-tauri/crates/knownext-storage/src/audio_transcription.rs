//! Runtime facade extracted without changing method bodies or public contracts.
use super::*;

impl LocalApi {
    pub(super) fn transcribe_audio(&self, body: Value, files: Vec<LocalApiFile>) -> Value {
        let Some(file) = files.into_iter().find(|file| file.field_name == "file") else {
            return json!({ "status": "error", "error": "missing_audio", "transcript": "", "message": "No se recibió audio para transcribir." });
        };
        let bytes = match base64::engine::general_purpose::STANDARD.decode(file.data_base64) {
            Ok(bytes) => bytes,
            Err(error) => {
                return json!({ "status": "error", "error": "invalid_audio", "transcript": "", "message": error.to_string() })
            }
        };
        if let Err(error)=self.spend_preflight(None){return json!({"status":"error","error":"usage_unavailable","message":error,"transcript":""});}
        let config=match self.read_config_checked(){Ok(config)=>config,Err(message)=>return json!({"status":"error","error":"configuration_unavailable","message":message,"transcript":""})};
        let model=config["ai"]["transcription"]["model"].as_str().unwrap_or("gpt-transcribe");
        let mut response = knownext_ai::transcribe_audio(
            self.openai_key().as_deref(),
            model,
            body.get("language").and_then(Value::as_str),
            bytes,
        );
        if response["status"].as_str() == Some("completed") {
            if let Err(error)=self.record_ai_usage(json!({
                "projectId": null,
                "interactionId": knownext_core::compact_id("ai-audio"),
                "capability": "audio",
                "model": model,
                "inputTokens": 0,
                "cachedInputTokens": 0,
                "outputTokens": 0,
                "reasoningTokens": 0,
                "embeddingTokens": 0,
                "totalTokens": 0,
                "estimatedCost": 0,
                "usageSource": "unknown"
            })){response["usageWarning"]=json!(error); }
        }
        response
    }
}
