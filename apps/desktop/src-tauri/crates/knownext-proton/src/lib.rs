//! Direct Proton runtime. No provider credentials cross the UI boundary.
pub mod bridge;
mod vault;
use bridge::{Bridge, NativeBridge};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    collections::BTreeMap,
    path::PathBuf,
    sync::{Arc, Mutex, OnceLock},
    time::{SystemTime, UNIX_EPOCH},
};
pub use vault::initialize_android_protector;

static GATE: Mutex<()> = Mutex::new(());
static LIBRARIES: OnceLock<Mutex<BTreeMap<PathBuf, Arc<dyn Bridge>>>> = OnceLock::new();
pub type Result<T> = std::result::Result<T, Error>;
#[derive(Clone, Debug)]
pub struct Error {
    pub code: String,
    pub retryable: bool,
}
impl Error {
    pub fn new(code: &str) -> Self {
        Self {
            code: code.into(),
            retryable: matches!(
                code,
                "network" | "rate-limited" | "service-busy" | "provider-unavailable"
            ),
        }
    }
    pub fn message(&self) -> &'static str {
        match self.code.as_str(){
        "sdk-unavailable"|"sdk-incompatible"=>"La integración nativa de Proton no está disponible en esta instalación.",
        "auth-required"|"session-revoked"|"needs-reconnect"=>"Vuelve a conectar tu cuenta Proton. Tus documentos y pendientes se conservan.",
        "network"|"provider-unavailable"|"rate-limited"=>"No se pudo contactar con Proton. La conexión y el trabajo pendiente se conservan.",
        "attempt-expired"=>"La conexión ha caducado. Puedes iniciar una nueva conexión.",
        "attempt-changed"=>"La conexión cambió. Consulta su estado antes de continuar.",
        "protection-unavailable"=>"No se pudo desbloquear el almacén seguro de este dispositivo. Se conserva sin cambios.",
        "store-corrupt"|"store-incompatible"=>"El almacén de Proton no se puede leer. Se conserva para recuperación.",
        "store-changed"=>"El almacén de Proton cambió. Consulta su estado antes de repetir.",
        "account-not-found"=>"La cuenta Proton no está conectada en este dispositivo.",
        _=>"La operación Proton no se pudo completar. Los datos existentes se conservan."
    }
    }
    pub fn value(&self) -> Value {
        json!({"code":self.code,"message":self.message(),"retryable":self.retryable})
    }
}
impl std::fmt::Display for Error {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.message())
    }
}
impl std::error::Error for Error {}

/// Native caller opens this URL, then returns only status to React. No Debug/Serialize.
pub struct ConnectionLaunch {
    pub status: Value,
    pub sign_in_url: String,
}
pub struct Service {
    directory: PathBuf,
    bridge: Result<Arc<dyn Bridge>>,
    protector: Arc<dyn vault::Protector>,
}
impl Service {
    pub fn new(directory: PathBuf, library_path: PathBuf) -> Self {
        let bridge = (|| {
            let libraries = LIBRARIES.get_or_init(|| Mutex::new(BTreeMap::new()));
            let mut libraries = libraries.lock().map_err(|_| Error::new("service-busy"))?;
            if let Some(bridge) = libraries.get(&library_path) {
                return Ok(bridge.clone());
            }
            let bridge = Arc::new(NativeBridge::load(&library_path)?) as Arc<dyn Bridge>;
            let info =
                bridge.request(&json!({"operation":"bridge.info","session":null,"payload":{}}))?;
            if info["ok"] != true || info["result"]["schemaVersion"] != 1 {
                return Err(Error::new("sdk-incompatible"));
            }
            // NativeAOT can own runtime threads/callbacks. Retain its Arc until
            // process exit; never unload it at the end of an API request.
            libraries.insert(library_path, bridge.clone());
            Ok(bridge)
        })();
        Self {
            directory,
            bridge,
            protector: Arc::new(vault::NativeProtector),
        }
    }
    pub fn status(&self) -> Result<Value> {
        // A provider call holds the writer gate while it may wait on the
        // network. Status reads only an encrypted atomic snapshot and must not
        // wait behind it. Retry once if journal publication crossed the read.
        let state = match self.load() {
            Err(error) if error.code == "store-changed" => self.load()?,
            result => result?,
        };
        Ok(self.public_status(&state))
    }
    pub fn start(&self) -> Result<ConnectionLaunch> {
        let _gate = self.gate()?;
        let _file = self.filesystem_gate()?;
        let mut state = self.load()?;
        let response = self.call("auth.start", Value::Null, json!({}))?;
        Self::check(&response)?;
        let session = &response["session"];
        if session["kind"] != "pending" {
            return Err(Error::new("sdk-response-invalid"));
        }
        let url = response["result"]["signInUrl"]
            .as_str()
            .filter(|s| {
                s.starts_with("https://account.proton.me/desktop/login?") && s.len() < 16384
            })
            .ok_or_else(|| Error::new("sdk-response-invalid"))?
            .to_owned();
        let id = format!(
            "{:x}",
            Sha256::digest(
                serde_json::to_vec(session).map_err(|_| Error::new("sdk-response-invalid"))?
            )
        );
        state["attempt"] = json!({"connectionId":id,"state":"pending","createdUnix":now(),"expiresUnix":now()+600,"expiresAt":response["result"]["expiresAt"],"session":session});
        self.save(&mut state)?;
        Ok(ConnectionLaunch {
            status: self.public_status(&state),
            sign_in_url: url,
        })
    }
    pub fn poll(&self, connection_id: &str) -> Result<Value> {
        let _gate = self.gate()?;
        let _file = self.filesystem_gate()?;
        let mut state = self.load()?;
        self.check_attempt(&state, connection_id)?;
        if state["attempt"]["state"] != "pending" {
            return Ok(self.public_status(&state));
        }
        if state["attempt"]["session"]["kind"] != "connected"
            && state["attempt"]["expiresUnix"].as_u64().unwrap_or(0) <= now()
        {
            state["attempt"]["state"] = json!("expired");
            state["attempt"]["session"] = Value::Null;
            self.save(&mut state)?;
            return Ok(self.public_status(&state));
        }
        let response = self.call("auth.poll", state["attempt"]["session"].clone(), json!({}))?;
        // A fork selector can be consumed only once. Preserve the resulting
        // session before profile/key hydration errors or token rotation.
        if response["session"].is_object() && response["session"] != state["attempt"]["session"] {
            state["attempt"]["session"] = response["session"].clone();
            self.save(&mut state)?;
        }
        if response["ok"] != true {
            if matches!(
                response["error"]["code"].as_str(),
                Some("auth-expired" | "attempt-expired")
            ) {
                state["attempt"]["state"] = json!("expired");
                state["attempt"]["session"] = Value::Null;
                self.save(&mut state)?;
                return Ok(self.public_status(&state));
            }
            return Self::check(&response).and_then(|_| Err(Error::new("sdk-response-invalid")));
        }
        match response["result"]["state"].as_str() {
            Some("waiting") | Some("pending") | Some("pending-profile") => {}
            Some("connected") => {
                let account_id = response["result"]["accountId"]
                    .as_str()
                    .filter(|v| valid_id(v))
                    .ok_or_else(|| Error::new("sdk-response-invalid"))?;
                if response["session"]["kind"] != "connected"
                    || response["session"]["userId"] != account_id
                {
                    return Err(Error::new("sdk-response-invalid"));
                }
                let label = response["result"]["label"]
                    .as_str()
                    .unwrap_or("Cuenta Proton");
                state["accounts"][account_id] = json!({"label":label.chars().filter(|c|!c.is_control()).take(256).collect::<String>(),"state":"connected","session":response["session"],"updatedAt":now()});
                state["activeAccountId"] = json!(account_id);
                state["attempt"]["state"] = json!("connected");
                state["attempt"]["session"] = Value::Null;
                self.save(&mut state)?;
            }
            Some("expired") => {
                state["attempt"]["state"] = json!("expired");
                state["attempt"]["session"] = Value::Null;
                self.save(&mut state)?;
            }
            _ => return Err(Error::new("sdk-response-invalid")),
        }
        Ok(self.public_status(&state))
    }
    pub fn cancel(&self, connection_id: &str) -> Result<Value> {
        let _gate = self.gate()?;
        let _file = self.filesystem_gate()?;
        let mut state = self.load()?;
        self.check_attempt(&state, connection_id)?;
        // Cancellation is local and cannot remove an existing connected account.
        if state["attempt"]["state"] == "pending" {
            state["attempt"]["state"] = json!("cancelled");
            state["attempt"]["session"] = Value::Null;
            self.save(&mut state)?;
        }
        Ok(self.public_status(&state))
    }
    /// Removes only this device's saved session. Remote revocation is not claimed.
    pub fn disconnect(&self, account_id: &str) -> Result<Value> {
        let _gate = self.gate()?;
        let _file = self.filesystem_gate()?;
        let mut state = self.load()?;
        if state["accounts"].get(account_id).is_none() {
            return Err(Error::new("account-not-found"));
        }
        state["accounts"]
            .as_object_mut()
            .ok_or_else(|| Error::new("store-corrupt"))?
            .remove(account_id);
        if state["activeAccountId"] == account_id {
            state["activeAccountId"] = Value::Null;
        }
        self.save(&mut state)?;
        let mut status = self.public_status(&state);
        status["remoteRevoked"] = json!(false);
        Ok(status)
    }
    /// SDK results contain file content/metadata; never session or account key material.
    pub fn invoke(&self, account_id: &str, operation: &str, payload: Value) -> Result<Value> {
        if !matches!(
            operation,
            "account.status"
                | "auth.refresh"
                | "drive.root"
                | "drive.list"
                | "drive.events"
                | "drive.createFolder"
                | "drive.readFile"
                | "drive.writeFile"
        ) {
            return Err(Error::new("invalid-operation"));
        }
        let _gate = self.gate()?;
        let _file = self.filesystem_gate()?;
        let mut state = self.load()?;
        if state["accounts"].get(account_id).is_none() {
            return Err(Error::new("account-not-found"));
        }
        if state["accounts"][account_id]["state"] != "connected" {
            return Err(Error::new("needs-reconnect"));
        }
        let mut response = self.call(
            operation,
            state["accounts"][account_id]["session"].clone(),
            payload.clone(),
        )?;
        self.persist_session(&mut state, account_id, &response)?;
        // A refreshed session is durable before another provider request. Never
        // blindly replay a mutation: the project journal must inspect its result.
        if response["ok"] != true
            && matches!(
                response["error"]["code"].as_str(),
                Some("auth-required" | "token-expired" | "session-expired")
            )
            && operation != "auth.refresh"
        {
            let refreshed = self.call(
                "auth.refresh",
                state["accounts"][account_id]["session"].clone(),
                json!({}),
            )?;
            self.persist_session(&mut state, account_id, &refreshed)?;
            if let Err(error) = Self::check(&refreshed) {
                if matches!(
                    error.code.as_str(),
                    "session-revoked" | "needs-reconnect" | "auth-required"
                ) {
                    state["accounts"][account_id]["state"] = json!("needs-reconnect");
                    self.save(&mut state)?;
                }
                return Err(error);
            }
            if matches!(
                operation,
                "account.status" | "drive.root" | "drive.list" | "drive.events" | "drive.readFile"
            ) {
                response = self.call(
                    operation,
                    state["accounts"][account_id]["session"].clone(),
                    payload,
                )?;
                self.persist_session(&mut state, account_id, &response)?;
            } else {
                return Err(Error {
                    code: "operation-needs-review".into(),
                    retryable: false,
                });
            }
        }
        if let Err(error) = Self::check(&response) {
            if matches!(
                error.code.as_str(),
                "session-revoked" | "needs-reconnect" | "auth-required"
            ) {
                state["accounts"][account_id]["state"] = json!("needs-reconnect");
                self.save(&mut state)?;
            }
            return Err(error);
        }
        Ok(response["result"].clone())
    }
    fn persist_session(&self, state: &mut Value, id: &str, response: &Value) -> Result<()> {
        if response["session"]["kind"] == "connected"
            && response["session"] != state["accounts"][id]["session"]
        {
            if response["session"]["userId"] != id {
                return Err(Error::new("sdk-response-invalid"));
            }
            state["accounts"][id]["session"] = response["session"].clone();
            state["accounts"][id]["updatedAt"] = json!(now());
            self.save(state)?;
        }
        Ok(())
    }
    fn check(response: &Value) -> Result<()> {
        if response["ok"] == true {
            return Ok(());
        }
        let code = response["error"]["code"]
            .as_str()
            .unwrap_or("sdk-response-invalid");
        let known = match code {
            "session-expired" => "auth-required",
            "auth-expired" => "attempt-expired",
            "not-connected" | "invalid-session" => "needs-reconnect",
            "network"
            | "rate-limited"
            | "provider-unavailable"
            | "auth-required"
            | "token-expired"
            | "session-revoked"
            | "needs-reconnect"
            | "not-found"
            | "conflict"
            | "quota-exceeded"
            | "attempt-expired"
            | "permission-denied" => code,
            _ => "provider-error",
        };
        Err(Error {
            code: known.into(),
            retryable: response["error"]["retryable"] == true,
        })
    }
    fn call(&self, operation: &str, session: Value, payload: Value) -> Result<Value> {
        self.bridge
            .as_ref()
            .map_err(Clone::clone)?
            .request(&json!({"operation":operation,"session":session,"payload":payload}))
    }
    fn gate(&self) -> Result<std::sync::MutexGuard<'static, ()>> {
        GATE.lock().map_err(|_| Error::new("service-busy"))
    }
    fn filesystem_gate(&self) -> Result<std::fs::File> {
        if !self.directory.is_absolute() {
            return Err(Error::new("store-unavailable"));
        }
        vault::directory(&self.directory)?;
        let path = self.directory.join("account-access.lock");
        if path.exists() {
            vault::regular_path(&path, false)?;
        }
        let file = std::fs::OpenOptions::new()
            .read(true)
            .write(true)
            .create(true)
            .truncate(false)
            .open(&path)
            .map_err(|_| Error::new("store-unavailable"))?;
        vault::regular_path(&path, false)?;
        fs2::FileExt::try_lock_exclusive(&file).map_err(|_| Error::new("service-busy"))?;
        Ok(file)
    }
    fn check_attempt(&self, state: &Value, id: &str) -> Result<()> {
        if state["attempt"]["connectionId"] != id {
            return Err(Error::new("attempt-changed"));
        }
        Ok(())
    }
    fn path(&self) -> PathBuf {
        self.directory.join("accounts.json")
    }
    fn load(&self) -> Result<Value> {
        if !self.directory.is_absolute() {
            return Err(Error::new("store-unavailable"));
        }
        let state=vault::read(&self.path(),self.protector.as_ref())?.unwrap_or_else(||json!({"schemaVersion":1,"generation":0,"activeAccountId":null,"accounts":{},"attempt":null}));
        if state["schemaVersion"] != 1
            || !state["generation"].is_u64()
            || !state["accounts"].is_object()
            || state["accounts"].as_object().unwrap().len() > 32
        {
            return Err(Error::new("store-incompatible"));
        }
        for (id, account) in state["accounts"].as_object().unwrap() {
            if !valid_id(id)
                || !account["label"].is_string()
                || !matches!(
                    account["state"].as_str(),
                    Some("connected" | "needs-reconnect")
                )
                || account["session"]["kind"] != "connected"
            {
                return Err(Error::new("store-corrupt"));
            }
        }
        Ok(state)
    }
    fn save(&self, state: &mut Value) -> Result<()> {
        state["generation"] = json!(state["generation"]
            .as_u64()
            .ok_or_else(|| Error::new("store-corrupt"))?
            .checked_add(1)
            .ok_or_else(|| Error::new("store-too-large"))?);
        vault::write(&self.path(), state, self.protector.as_ref())
    }
    fn public_status(&self, state: &Value) -> Value {
        let active = state["activeAccountId"].as_str().and_then(|id| {
            state["accounts"]
                .get(id)
                .map(|a| json!({"id":id,"label":a["label"],"state":a["state"]}))
        });
        let accounts = state["accounts"]
            .as_object()
            .map(|a| {
                a.iter()
                    .map(|(id, a)| json!({"id":id,"label":a["label"],"state":a["state"]}))
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();
        let attempt = if state["attempt"].is_object() {
            Some(
                json!({"connectionId":state["attempt"]["connectionId"],"state":state["attempt"]["state"],"expiresAt":state["attempt"]["expiresAt"]}),
            )
        } else {
            None
        };
        json!({"available":self.bridge.is_ok(),"reason":self.bridge.as_ref().err().map(|e|e.message()),"account":active,"accounts":accounts,"attempt":attempt,"updatedAt":now()})
    }
}
fn valid_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= 256 && !id.chars().any(char::is_control)
}
fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

#[cfg(test)]
mod tests;
