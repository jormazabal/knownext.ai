//! Describes existing data handling; this endpoint neither reads private stores
//! nor changes retention or requests any external service.
use super::*;

impl LocalApi {
    pub(super) fn ai_data_policy(&self) -> Value {
        json!({"schemaVersion":1,"id":"ai-data-policy-v1","checkedAt":knownext_core::now_iso(),
            "transmission":"request-and-prepared-context",
            "conversation":{"includesUserPrompts":true,"maximumEvents":AI_CONVERSATION_MAX_EVENTS,"automaticExpiry":false},
            "contextSources":{"storedLocally":true,"automaticExpiry":false},
            "reviewResults":{"storedLocally":true,"requestEnvelopeStored":false,"automaticExpiry":false},
            "index":{"savedContentCopy":true,"providerUse":"retrieved-fragments"},
            "deletion":{"categoriesAreSeparate":true,"providerRetentionVerified":false,"localDeletionRemovesRemoteCopies":false}})
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn policy_reads_no_private_content_and_references_the_actual_event_limit() {
        let owned=tempfile::tempdir().unwrap();
        let api=LocalApi::new(owned.path().join("app"),"qa".into(),"test".into());
        let private=b"unreadable-configuration PRIVATE-PROMPT-CANARY";
        std::fs::write(api.config_path(),private).unwrap();
        let response=api.handle("GET","/api/ai/data-policy",Value::Null,vec![]).unwrap();
        assert_eq!(response.status,200);assert_eq!(response.body["conversation"]["maximumEvents"],AI_CONVERSATION_MAX_EVENTS);
        assert_eq!(response.body["deletion"]["providerRetentionVerified"],false);
        assert!(!response.body.to_string().contains("CANARY"));assert_eq!(std::fs::read(api.config_path()).unwrap(),private);
        assert!(LocalApi::is_independent_snapshot("GET","/api/ai/data-policy"));
    }
}
