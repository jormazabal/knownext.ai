//! Cooperative stop signals never take mutation authority or modify a durable plan.
use super::*;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, OnceLock,
};
type Key = (PathBuf, String);
static ACTIVE: OnceLock<Mutex<BTreeMap<Key, Arc<AtomicBool>>>> = OnceLock::new();
pub(super) struct Active {
    key: Key,
    signal: Arc<AtomicBool>,
}
impl Active {
    pub fn begin(api: &LocalApi, id: &str) -> Result<Self, String> {
        let key = (api.app_data_dir.clone(), id.into());
        let signal = Arc::new(AtomicBool::new(false));
        let mut active = ACTIVE
            .get_or_init(Default::default)
            .lock()
            .map_err(|_| "No se puede observar la ejecución del lote")?;
        if active.contains_key(&key) {
            return Err("El lote ya tiene una ejecución activa".into());
        }
        active.insert(key.clone(), signal.clone());
        Ok(Self { key, signal })
    }
    pub fn requested(&self) -> bool {
        self.signal.load(Ordering::Acquire)
    }
}
impl Drop for Active {
    fn drop(&mut self) {
        if let Some(active) = ACTIVE.get() {
            if let Ok(mut active) = active.lock() {
                active.remove(&self.key);
            }
        }
    }
}
pub(super) fn request(api: &LocalApi, project: &str, id: &str) -> Result<Value, String> {
    let plan = state::read(api, id)?;
    if plan.project_id != project || plan.id != id {
        return Err("El lote pertenece a otro proyecto".into());
    }
    let mut requested = false;
    if matches!(plan.state.as_str(), "prepared" | "running") {
        let active = ACTIVE
            .get_or_init(Default::default)
            .lock()
            .map_err(|_| "No se puede solicitar la detención")?;
        if let Some(signal) = active.get(&(api.app_data_dir.clone(), id.into())) {
            signal.store(true, Ordering::Release);
            requested = true;
        }
    }
    Ok(
        json!({"id":id,"projectId":project,"requested":requested,"observedState":plan.state,"requestedAt":knownext_core::now_iso()}),
    )
}
