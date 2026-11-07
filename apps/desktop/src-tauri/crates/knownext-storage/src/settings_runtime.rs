//! Runtime facade extracted without changing method bodies or public contracts.
use super::*;

impl LocalApi {
    pub(super) fn read_config_checked(&self) -> Result<Value, String> {
        let mut config = local_state::read(&self.app_data_dir, local_state::Store::Config)?;
        normalize_config(&mut config);
        Ok(config)
    }
    pub(super) fn read_config(&self) -> Value {
        self.read_config_checked().unwrap_or_else(|_| default_config())
    }
    pub(super) fn update_config(&self, patch: Value) -> Result<Value, String> {
        if !patch.is_object() { return Err("La actualización de preferencias debe ser un objeto".into()); }
        let mut config = self.read_config_checked()?;
        merge(&mut config, &patch);
        normalize_config(&mut config);
        config["updatedAt"] = Value::from(knownext_core::now_iso());
        self.write_json(&self.config_path(), &config)?;
        Ok(config)
    }
    pub(super) fn ai_config_status(&self) -> Value {
        let mut ai = self.read_config()["ai"].clone();
        let status = self.openai_key_status();
        ai["openaiKeyConfigured"] = status["configured"].clone();
        ai["openaiKeyPreview"] = status["preview"].clone();
        ai["credentialStorageError"] = status["storageError"].clone();
        ai["credentialProtection"] = status["protection"].clone();
        ai
    }
    pub(super) fn update_ai_config(&self, payload: Value) -> Result<Value, String> {
        if !payload.is_object() { return Err("La actualización de IA debe ser un objeto".into()); }
        let mut config = self.read_config_checked()?;
        config["ai"] = payload;
        normalize_config(&mut config);
        config["updatedAt"] = Value::from(knownext_core::now_iso());
        self.write_json(&self.config_path(), &config)?;
        Ok(self.ai_config_status())
    }
    pub(super) fn openai_key(&self) -> Option<String> {
        self.read_config_checked().ok()?;
        self.credentials()
            .get("openaiKey")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_string)
    }
    pub(super) fn github_access_token(&self) -> Option<String> {
        let credentials = self.credentials();
        credentials
            .get("github")
            .and_then(|github| github.get("accessToken"))
            .or_else(|| credentials.get("accessToken"))
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_string)
    }
    pub(super) fn credentials(&self) -> Value {
        credential_store::read(&self.credentials_path()).unwrap_or_else(|_|json!({}))
    }
    pub(super) fn update_credentials<F>(&self, mut update: F) -> Result<Value,String>
    where
        F: FnMut(&mut serde_json::Map<String, Value>),
    {
        let _credentials=self.credential_gate.lock().map_err(|_|"No se pudo reservar el almacén de credenciales")?;
        let mut credentials = credential_store::read(&self.credentials_path())?;
        if let Some(object) = credentials.as_object_mut() {
            update(object);
        }
        credential_store::write(&self.credentials_path(), &credentials)?;
        Ok(credentials)
    }
    pub(super) fn ai_model(&self) -> String {
        self.read_config()["ai"]["model"]
            .as_str()
            .unwrap_or("gpt-5.4-mini")
            .to_string()
    }
}
