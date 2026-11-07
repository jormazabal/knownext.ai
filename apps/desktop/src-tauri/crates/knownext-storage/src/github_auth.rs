//! Runtime facade extracted without changing method bodies or public contracts.
use super::*;
use knownext_core::operations::{checkpoint, Stage};
struct AuthStamp {
    generation: u64,
    revision: String,
}
fn stopped(code: String) -> Value {
    json!({"status":"error","error":code,"message":"La respuesta no se ha publicado. Revisa el estado antes de continuar."})
}

impl LocalApi {
    fn auth_revision(&self) -> Result<String, String> {
        Ok(sha256_hex(&serde_json::to_vec(&json!({"auth":self.auth_checked()?,"pending":self.device_checked()?,"credential":sha256_hex(self.github_access_token().unwrap_or_default().as_bytes())})).map_err(|_|"auth-state-unavailable")?))
    }
    fn auth_begin(&self, replacing: bool) -> Result<AuthStamp, String> {
        let _gate = self
            .auth_gate
            .lock()
            .map_err(|_| "auth-state-unavailable")?;
        if replacing {
            self.auth_generation
                .fetch_add(1, std::sync::atomic::Ordering::SeqCst);
        }
        Ok(AuthStamp {
            generation: self
                .auth_generation
                .load(std::sync::atomic::Ordering::SeqCst),
            revision: self.auth_revision()?,
        })
    }
    fn auth_is_current(&self, stamp: &AuthStamp) -> bool {
        self.auth_generation
            .load(std::sync::atomic::Ordering::SeqCst)
            == stamp.generation
            && self.auth_revision().is_ok_and(|v| v == stamp.revision)
    }

    fn auth_publication(&self, stamp: &AuthStamp) -> Result<std::sync::MutexGuard<'_, ()>, String> {
        let gate = self
            .auth_gate
            .lock()
            .map_err(|_| "auth-state-unavailable")?;
        if !self.auth_is_current(stamp) {
            return Err("github-session-changed".into());
        }
        checkpoint(Stage::Publishing)?;
        Ok(gate)
    }
    pub(super) fn auth_status(&self) -> Value {
        let mut auth = match self.auth_checked() {
            Ok(value) => value,
            Err(error) => {
                let mut status = default_auth_status();
                status["storageError"] = json!(error);
                return status;
            }
        };
        if is_mock_github_auth(&auth) {
            return default_auth_status();
        }
        remove_public_auth_secrets(&mut auth);
        let credentials = match credential_store::read(&self.credentials_path()) {
            Ok(value) => value,
            Err(error) => {
                auth["isAuthenticated"] = json!(false);
                auth["credentialStorageError"] = json!(error);
                return auth;
            }
        };
        let has_token = credentials
            .get("github")
            .and_then(|github| github.get("accessToken"))
            .or_else(|| credentials.get("accessToken"))
            .and_then(Value::as_str)
            .is_some_and(|token| !token.trim().is_empty());
        if is_github_auth_without_credentials(&auth, has_token) {
            return default_auth_status();
        }
        auth
    }

    pub(super) fn start_github_device(&self) -> Value {
        let stamp = match self.auth_begin(true) {
            Ok(s) => s,
            Err(e) => return stopped(e),
        };
        if let Err(e) = checkpoint(Stage::WaitingRemote) {
            return stopped(e);
        }
        if let Err(error) = self.device_checked().and_then(|_| self.auth_checked()) {
            let mut response = github_unconfigured_device_response();
            response["error"] = json!("local_state_unavailable");
            response["message"] = json!(error);
            return response;
        }
        let Some(client_id) = self.github_client_id() else {
            let _ = std::fs::remove_file(self.github_device_path());
            return github_unconfigured_device_response();
        };

        let client = github_http_client();
        let response = client
            .post("https://github.com/login/device/code")
            .form(&[
                ("client_id", client_id.as_str()),
                ("scope", "repo read:user user:email"),
            ])
            .send();

        let Ok(response) = response else {
            return json!({
                "deviceCode": "",
                "userCode": "",
                "verificationUri": "https://github.com/login/device",
                "expiresIn": 0,
                "interval": 5,
                "mock": false,
                "status": "error",
                "error": "github_network_unavailable"
            });
        };

        let body = response.json::<Value>().unwrap_or_else(|_| json!({}));
        if let Some(error) = body.get("error").and_then(Value::as_str) {
            return json!({
                "deviceCode": "",
                "userCode": "",
                "verificationUri": "https://github.com/login/device",
                "expiresIn": 0,
                "interval": 5,
                "mock": false,
                "status": "error",
                "error": error
            });
        }

        let device_code = body
            .get("device_code")
            .and_then(Value::as_str)
            .unwrap_or("");
        let user_code = body.get("user_code").and_then(Value::as_str).unwrap_or("");
        let verification_uri = body
            .get("verification_uri")
            .or_else(|| body.get("verification_uri_complete"))
            .and_then(Value::as_str)
            .unwrap_or("https://github.com/login/device");
        let expires_in = body
            .get("expires_in")
            .and_then(Value::as_i64)
            .unwrap_or(900)
            .max(1);
        let interval = body
            .get("interval")
            .and_then(Value::as_i64)
            .unwrap_or(5)
            .max(1);

        if device_code.is_empty() || user_code.is_empty() {
            return json!({
                "deviceCode": "",
                "userCode": "",
                "verificationUri": "https://github.com/login/device",
                "expiresIn": 0,
                "interval": 5,
                "mock": false,
                "status": "error",
                "error": "github_device_start_failed"
            });
        }

        let pending = json!({
            "deviceCode": device_code,
            "expiresAtEpochSeconds": unix_now_seconds() + expires_in,
            "interval": interval
        });
        if let Err(e) = checkpoint(Stage::Validating) {
            return stopped(e);
        }
        let _gate = match self.auth_publication(&stamp) {
            Ok(g) => g,
            Err(e) => return stopped(e),
        };
        if let Err(error) = self.write_json(&self.github_device_path(), &pending) {
            let mut response = github_unconfigured_device_response();
            response["error"] = json!("local_state_unavailable");
            response["message"] = json!(error);
            return response;
        }

        json!({
            "deviceCode": device_code,
            "userCode": user_code,
            "verificationUri": verification_uri,
            "expiresIn": expires_in,
            "interval": interval,
            "mock": false
        })
    }

    pub(super) fn poll_github_device(&self, expected: Option<&str>) -> Value {
        let stamp = match self.auth_begin(false) {
            Ok(s) => s,
            Err(e) => return stopped(e),
        };
        if let Err(error) = self.device_checked().and_then(|_| self.auth_checked()) {
            return json!({"status":"error","auth":self.auth_status(),"interval":null,"error":"local_state_unavailable","message":error});
        }
        let Some(client_id) = self.github_client_id() else {
            return json!({
                "status": "error",
                "auth": self.auth_status(),
                "interval": null,
                "error": "github_remote_not_configured"
            });
        };

        let pending = match self.device_checked() {
            Ok(value) => value,
            Err(error) => {
                return json!({"status":"error","auth":self.auth_status(),"error":"local_state_unavailable","message":error,"interval":null})
            }
        };
        let device_code = pending
            .get("deviceCode")
            .and_then(Value::as_str)
            .unwrap_or("");
        let expires_at = pending
            .get("expiresAtEpochSeconds")
            .and_then(Value::as_i64)
            .unwrap_or(0);
        if expected != Some(device_code) {
            return stopped("github-session-changed".into());
        }
        if device_code.is_empty() {
            return json!({
                "status": "error",
                "auth": self.auth_status(),
                "interval": null,
                "error": "incorrect_device_code"
            });
        }
        if expires_at <= unix_now_seconds() {
            let _gate = match self.auth_gate.lock() {
                Ok(g) => g,
                Err(_) => return stopped("auth-state-unavailable".into()),
            };
            if !self.auth_is_current(&stamp) {
                return stopped("github-session-changed".into());
            }
            let _ = std::fs::remove_file(self.github_device_path());
            return json!({
                "status": "error",
                "auth": self.auth_status(),
                "interval": null,
                "error": "expired_token"
            });
        }

        if let Err(e) = checkpoint(Stage::WaitingRemote) {
            return stopped(e);
        }
        let client = github_http_client();
        let response = client
            .post("https://github.com/login/oauth/access_token")
            .form(&[
                ("client_id", client_id.as_str()),
                ("device_code", device_code),
                ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"),
            ])
            .send();

        let Ok(response) = response else {
            return json!({
                "status": "error",
                "auth": self.auth_status(),
                "interval": pending.get("interval").cloned().unwrap_or(Value::Null),
                "error": "github_network_unavailable"
            });
        };

        let token_body = response.json::<Value>().unwrap_or_else(|_| json!({}));
        if let Some(error) = token_body.get("error").and_then(Value::as_str) {
            if error == "authorization_pending" {
                return json!({
                    "status": "pending",
                    "auth": self.auth_status(),
                    "interval": pending.get("interval").cloned().unwrap_or(Value::Null),
                    "error": null
                });
            }
            return json!({
                "status": "error",
                "auth": self.auth_status(),
                "interval": if error == "slow_down" {
                    Some(pending.get("interval").and_then(Value::as_i64).unwrap_or(5) + 5)
                } else {
                    None
                },
                "error": error
            });
        }

        let access_token = token_body
            .get("access_token")
            .and_then(Value::as_str)
            .unwrap_or("");
        if access_token.is_empty() {
            return json!({
                "status": "error",
                "auth": self.auth_status(),
                "interval": null,
                "error": "github_token_missing"
            });
        }

        if let Err(e) = checkpoint(Stage::WaitingRemote) {
            return stopped(e);
        }
        let user = client
            .get("https://api.github.com/user")
            .bearer_auth(access_token)
            .send()
            .ok()
            .and_then(|response| response.json::<Value>().ok())
            .unwrap_or_else(|| json!({}));

        let login = user.get("login").and_then(Value::as_str).unwrap_or("");
        if login.is_empty() {
            return json!({
                "status": "error",
                "auth": self.auth_status(),
                "interval": null,
                "error": "github_user_unavailable"
            });
        }

        let scopes = parse_github_scopes(
            token_body
                .get("scope")
                .and_then(Value::as_str)
                .unwrap_or(""),
        );
        let auth = json!({
            "isAuthenticated": true,
            "provider": "github",
            "user": {
                "login": login,
                "name": user.get("name").and_then(Value::as_str).unwrap_or(login),
                "avatarUrl": user.get("avatar_url").and_then(Value::as_str)
            },
            "scopes": scopes.clone(),
            "expiresAt": null,
            "updatedAt": knownext_core::now_iso()
        });
        if let Err(e) = checkpoint(Stage::Validating) {
            return stopped(e);
        }
        let _gate = match self.auth_publication(&stamp) {
            Ok(g) => g,
            Err(e) => return stopped(e),
        };
        if self
            .update_credentials(|credentials| {
                credentials.insert(
                    "github".to_string(),
                    json!({
                        "provider": "github",
                        "accessToken": access_token,
                        "scopes": scopes,
                        "updatedAt": knownext_core::now_iso()
                    }),
                );
                credentials.remove("provider");
                credentials.remove("accessToken");
                credentials.remove("scopes");
            })
            .is_err()
        {
            return json!({"status":"error","auth":self.auth_status(),"interval":null,"error":"credential_store_failed"});
        }
        if self.write_json(&self.auth_path(), &auth).is_err() {
            return json!({"status":"error","auth":self.auth_status(),"interval":null,"error":"auth_store_failed"});
        }
        let _ = std::fs::remove_file(self.github_device_path());

        json!({
            "status": "authenticated",
            "auth": auth,
            "interval": null,
            "error": null
        })
    }

    pub(super) fn clear_auth_status(&self) -> Result<Value, String> {
        let _gate = self
            .auth_gate
            .lock()
            .map_err(|_| "auth-state-unavailable")?;
        self.auth_generation
            .fetch_add(1, std::sync::atomic::Ordering::SeqCst);
        self.auth_checked()?;
        self.device_checked()?;
        self.update_credentials(|credentials| {
            credentials.remove("github");
            credentials.remove("provider");
            credentials.remove("accessToken");
            credentials.remove("scopes");
        })?;
        for path in [self.auth_path(), self.github_device_path()] {
            match std::fs::remove_file(path) {
                Ok(()) => {}
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
                Err(_) => return Err("No se ha podido completar el cierre de sesión local".into()),
            }
        }
        Ok(default_auth_status())
    }

    pub(super) fn github_repositories(&self) -> Value {
        let stamp = match self.auth_begin(false) {
            Ok(s) => s,
            Err(e) => return stopped(e),
        };
        if let Err(e) = checkpoint(Stage::WaitingRemote) {
            return stopped(e);
        }
        let Some(token) = self.github_access_token() else {
            return stopped("github-repositories-unavailable".into());
        };

        let response = github_http_client()
            .get("https://api.github.com/user/repos?per_page=100&sort=updated")
            .bearer_auth(token)
            .send();

        let Ok(response) = response else {
            return stopped("github-repositories-unavailable".into());
        };
        if !response.status().is_success() {
            return stopped("github-repositories-unavailable".into());
        }

        let repos = match response.json::<Value>() {
            Ok(v) if v.is_array() => v,
            _ => return stopped("github-response-invalid".into()),
        };
        if let Err(e) = checkpoint(Stage::Validating) {
            return stopped(e);
        }
        if !self.auth_is_current(&stamp) {
            return stopped("github-session-changed".into());
        }
        let list = repos
            .as_array()
            .cloned()
            .unwrap_or_default()
            .into_iter()
            .filter_map(|repo| {
                let full_name = repo.get("full_name").and_then(Value::as_str).unwrap_or("");
                let (owner, name) = full_name.split_once('/').unwrap_or(("", ""));
                if owner.is_empty() || name.is_empty() {
                    return None;
                }
                let permissions = repo
                    .get("permissions")
                    .cloned()
                    .unwrap_or_else(|| json!({}));
                let mut access = Vec::new();
                if permissions
                    .get("pull")
                    .and_then(Value::as_bool)
                    .unwrap_or(true)
                {
                    access.push("pull");
                }
                if permissions
                    .get("push")
                    .and_then(Value::as_bool)
                    .unwrap_or(false)
                {
                    access.push("push");
                }
                if permissions
                    .get("admin")
                    .and_then(Value::as_bool)
                    .unwrap_or(false)
                {
                    access.push("admin");
                }
                Some(json!({
                    "owner": owner,
                    "repo": name,
                    "defaultRef": repo.get("default_branch").and_then(Value::as_str),
                    "rootPath": "",
                    "permissions": access,
                    "private": repo.get("private").and_then(Value::as_bool).unwrap_or(false),
                    "updatedAt": repo.get("updated_at").and_then(Value::as_str)
                }))
            })
            .collect::<Vec<_>>();

        Value::Array(list)
    }

    pub(super) fn github_client_id(&self) -> Option<String> {
        if cfg!(test) || self.profile == "test" {
            return None;
        }
        github_client_id()
    }
}

#[cfg(test)]
mod runtime_tests {
    use super::*;
    #[test]
    fn runtime_block_late_authentication_cannot_reverse_logout_or_new_challenge() {
        let root = tempfile::tempdir().unwrap();
        let api = LocalApi::new(root.path().join("state"), "qa".into(), "test".into());
        let old = api.auth_begin(false).unwrap();
        api.clear_auth_status().unwrap();
        assert!(api.auth_publication(&old).is_err());
        assert!(!api.auth_status()["isAuthenticated"].as_bool().unwrap());
        let previous = api.auth_begin(true).unwrap();
        let next = api.auth_begin(true).unwrap();
        assert!(api.auth_publication(&previous).is_err());
        let _publication = api.auth_publication(&next).unwrap();
        api.write_json(&api.github_device_path(),&json!({"deviceCode":"owned-new-challenge","expiresAtEpochSeconds":unix_now_seconds()+300,"interval":5})).unwrap();
        assert_eq!(
            api.device_checked().unwrap()["deviceCode"],
            "owned-new-challenge"
        );
    }
    #[test]
    fn runtime_block_external_auth_state_change_invalidates_publication() {
        let root = tempfile::tempdir().unwrap();
        let api = LocalApi::new(root.path().join("state"), "qa".into(), "test".into());
        let stamp = api.auth_begin(true).unwrap();
        api.write_json(&api.github_device_path(),&json!({"deviceCode":"owned-other-challenge","expiresAtEpochSeconds":unix_now_seconds()+300,"interval":5})).unwrap();
        assert!(api.auth_publication(&stamp).is_err());
        assert_eq!(
            api.device_checked().unwrap()["deviceCode"],
            "owned-other-challenge"
        );
    }
}
