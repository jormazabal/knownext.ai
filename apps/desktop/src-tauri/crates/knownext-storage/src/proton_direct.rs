//! Direct SDK transport. Local publication remains owned by storage, never by
//! a WebView, a provider folder client, or an SDK callback.
use super::*;
mod lifecycle;
mod planner;
use base64::engine::general_purpose::STANDARD as B64;
use knownext_sync_folder::{self as snapshots, Manifest};
use std::{
    collections::BTreeMap,
    fs,
    sync::{Mutex, OnceLock},
};

static GATE: Mutex<()> = Mutex::new(());
type Browser = Box<dyn Fn(&str) -> Result<(), String> + Send + Sync>;
static BROWSER: OnceLock<Browser> = OnceLock::new();
pub fn initialize_proton_browser(browser: Browser) {
    let _ = BROWSER.set(browser);
}
static LIBRARY: OnceLock<PathBuf> = OnceLock::new();
pub fn initialize_proton_library(path: PathBuf) {
    let _ = LIBRARY.set(path);
}
pub(super) fn native_available() -> bool {
    static AVAILABLE: OnceLock<bool> = OnceLock::new();
    let Some(path) = LIBRARY.get() else {
        return false;
    };
    *AVAILABLE.get_or_init(|| knownext_proton::bridge::NativeBridge::load(path).is_ok())
}
const QUOTA: u64 = 1024 * 1024 * 1024;
const MAX_STATE: u64 = 16 * 1024 * 1024;

fn hash(v: &Value) -> String {
    sha256_hex(&serde_json::to_vec(v).expect("JSON"))
}
fn id() -> String {
    sha256_hex(knownext_core::compact_id("proton").as_bytes())
}
fn regular(path: &Path) -> Result<(), String> {
    snapshots::regular_directory(path).map_err(|_| "Ubicación privada no regular".into())
}
fn ensure(path: &Path) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        if !parent.exists() {
            ensure(parent)?;
        }
        regular(parent)?;
    }
    match fs::create_dir(path) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => regular(path),
        Err(_) => Err("No se pudo preparar el almacén local".into()),
    }
}
fn bytes(path: &Path, max: u64) -> Result<Vec<u8>, String> {
    use std::io::Read;
    let m = fs::symlink_metadata(path).map_err(|_| "Archivo no disponible")?;
    if !m.is_file() || batch::linked(&m) || m.len() > max {
        return Err("Archivo no regular o fuera de presupuesto".into());
    }
    let mut result = Vec::new();
    fs::File::open(path)
        .map_err(|_| "No se pudo abrir el archivo")?
        .take(max + 1)
        .read_to_end(&mut result)
        .map_err(|_| "Lectura incompleta")?;
    if result.len() as u64 > max {
        return Err("Archivo fuera de presupuesto".into());
    }
    Ok(result)
}
fn target(root: &Path, path: &str) -> Result<PathBuf, String> {
    super::proton_sync::target_path(root, path)
}
fn local_hash(root: &Path, path: &str) -> Result<Option<String>, String> {
    let p = target(root, path)?;
    match fs::symlink_metadata(&p) {
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(_) => Err("No se pudo comprobar el archivo".into()),
        Ok(_) => Ok(Some(sha256_hex(&bytes(&p, snapshots::MAX_FILE_BYTES)?))),
    }
}
fn directory_birth(file: &fs::File) -> Option<(i128, u32)> {
    if let Ok(created) = file.metadata().ok()?.created() {
        let duration = created.duration_since(std::time::UNIX_EPOCH).ok()?;
        return Some((duration.as_secs() as i128, duration.subsec_nanos()));
    }
    #[cfg(target_os = "android")]
    {
        use std::os::fd::AsRawFd;
        let mut info = std::mem::MaybeUninit::<libc::statx>::zeroed();
        // SAFETY: statx reads the open directory FD with an empty C path and
        // writes the correctly sized structure. A raw syscall avoids requiring
        // a newer Android API symbol; old kernels/filesystems fail closed.
        let result = unsafe {
            libc::syscall(
                libc::SYS_statx,
                file.as_raw_fd(),
                c"".as_ptr(),
                libc::AT_EMPTY_PATH | libc::AT_SYMLINK_NOFOLLOW,
                libc::STATX_BTIME,
                info.as_mut_ptr(),
            )
        };
        if result == 0 {
            // SAFETY: a successful syscall initialized the complete structure.
            let info = unsafe { info.assume_init() };
            if info.stx_mask & libc::STATX_BTIME != 0 && info.stx_btime.tv_nsec < 1_000_000_000 {
                return Some((info.stx_btime.tv_sec as i128, info.stx_btime.tv_nsec));
            }
        }
    }
    None
}
fn directory_identity(root: &Path, path: &str) -> Result<Option<(String, bool)>, String> {
    let path = target(root, path)?;
    match fs::symlink_metadata(&path) {
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(_) => return Err("No se puede comprobar una carpeta recibida".into()),
        Ok(m) if !m.is_dir() || batch::linked(&m) => {
            return Err("La carpeta recibida ocupa una ruta local incompatible; se conserva".into())
        }
        _ => {}
    }
    regular(&path)?;
    let mut options = fs::OpenOptions::new();
    options.read(true);
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        options.custom_flags(windows_sys::Win32::Storage::FileSystem::FILE_FLAG_BACKUP_SEMANTICS);
    }
    let file = options
        .open(path)
        .map_err(|_| "No se puede verificar la identidad de la carpeta")?;
    let identity =
        local_file_identity::identity(&file).map_err(|_| "Identidad de carpeta no verificable")?;
    let birth = directory_birth(&file);
    Ok(Some((
        hash(&json!({"identity":identity,"birth":birth})),
        birth.is_some(),
    )))
}
fn directory_stamp(root: &Path, path: &str) -> Result<Option<String>, String> {
    Ok(directory_identity(root, path)?.map(|(stamp, _)| stamp))
}
fn directory_removal_verifiable(root: &Path, path: &str) -> Result<bool, String> {
    Ok(directory_identity(root, path)?.is_some_and(|(_, birth_verified)| birth_verified))
}
fn relative_directory(path: &str) -> bool {
    !path.is_empty()
        && !path.contains(['\\', ':', '\0'])
        && path.split('/').all(|p| {
            !p.is_empty()
                && !p.starts_with('.')
                && !matches!(
                    p.to_ascii_lowercase().as_str(),
                    "owner.lock" | "runtime-owner.lock" | "capture.lock"
                )
        })
}
fn usage(root: &Path) -> Result<u64, String> {
    let mut total = 0u64;
    let mut stack = vec![root.to_path_buf()];
    let mut count = 0;
    while let Some(dir) = stack.pop() {
        regular(&dir)?;
        for item in fs::read_dir(dir).map_err(|_| "Inventario privado incompleto")? {
            let item = item.map_err(|_| "Inventario privado incompleto")?;
            let name = item.file_name();
            if matches!(
                name.to_str(),
                Some("owner.lock" | "runtime-owner.lock" | "capture.lock")
            ) {
                continue;
            }
            count += 1;
            if count > 50_000 {
                return Err("Inventario privado fuera de presupuesto".into());
            }
            let m =
                fs::symlink_metadata(item.path()).map_err(|_| "Inventario privado incompleto")?;
            if batch::linked(&m) {
                return Err("El almacén contiene un enlace; se conserva".into());
            }
            if m.is_dir() {
                stack.push(item.path());
            } else if m.is_file() {
                total = total
                    .checked_add(m.len())
                    .ok_or("Inventario fuera de presupuesto")?;
            } else {
                return Err("Contenido privado desconocido; se conserva".into());
            }
        }
    }
    Ok(total)
}
impl LocalApi {
    fn pd_private_root(&self) -> PathBuf {
        #[cfg(target_os = "android")]
        {
            // Android supplies this sandbox boundary. Its mount namespace can
            // alias /data/user/0 to /data/data; never canonicalize a user link
            // below that boundary as a substitute for checking it.
            if fs::symlink_metadata(&self.app_data_dir)
                .is_ok_and(|m| m.is_dir() && !m.file_type().is_symlink())
            {
                return self
                    .app_data_dir
                    .canonicalize()
                    .unwrap_or_else(|_| self.app_data_dir.clone());
            }
        }
        self.app_data_dir.clone()
    }
    fn pd_project_root(&self, project: &str) -> Result<PathBuf, String> {
        // Existing ownership verifies all managed descendants before resolving
        // the OS sandbox alias. Keep rejecting user-created links.
        let root = self.project_root(project)?;
        #[cfg(target_os = "android")]
        {
            return root
                .canonicalize()
                .map_err(|_| "Proyecto no verificable".into());
        }
        #[cfg(not(target_os = "android"))]
        {
            Ok(root)
        }
    }
    fn pd_service(&self) -> knownext_proton::Service {
        let library = LIBRARY
            .get()
            .cloned()
            .or_else(|| std::env::var_os("KNOWNEXT_PROTON_LIBRARY").map(PathBuf::from))
            .unwrap_or_else(|| {
                PathBuf::from(if cfg!(windows) {
                    "knownext_proton.dll"
                } else {
                    "libknownext_proton.so"
                })
            });
        knownext_proton::Service::new(self.pd_private_root().join("proton-accounts"), library)
    }
    pub(super) fn proton_accounts(&self, action: &str, payload: Value) -> Result<Value, String> {
        let service = self.pd_service();
        match action {
            "status" => service.status().map_err(|e| e.to_string()),
            "start" => {
                let launch = service.start().map_err(|e| e.to_string())?;
                BROWSER
                    .get()
                    .ok_or("El navegador nativo no está disponible")?(
                    &launch.sign_in_url
                )?;
                Ok(launch.status)
            }
            "poll" => service
                .poll(
                    payload["connectionId"]
                        .as_str()
                        .ok_or("Falta el intento de conexión")?,
                )
                .map_err(|e| e.to_string()),
            "cancel" => service
                .cancel(
                    payload["connectionId"]
                        .as_str()
                        .ok_or("Falta el intento de conexión")?,
                )
                .map_err(|e| e.to_string()),
            "disconnect" => {
                let _guard = GATE.lock().map_err(|_| "Sincronización ocupada")?;
                let account = payload["accountId"].as_str().ok_or("Falta la cuenta")?;
                let registry = self.registry_checked()?;
                for project in registry["projects"]
                    .as_array()
                    .ok_or("Registro no disponible")?
                {
                    let id = project["id"].as_str().ok_or("Proyecto incompatible")?;
                    if self.pd_load(id)?["binding"]["accountId"] == account {
                        return Err("Esta cuenta está asociada a proyectos. Desconecta primero sus sincronizaciones conservando los documentos.".into());
                    }
                }
                service.disconnect(account).map_err(|e| e.to_string())
            }
            _ => Err("Acción de cuenta no compatible".into()),
        }
    }
    pub(super) fn proton_note_local_change(&self, project: &str) -> Result<(), String> {
        // One immutable marker per save prevents clearing a newer concurrent
        // save between comparing and unlinking a shared dirty flag.
        let dir = self.pd_dir(project);
        if !dir.join("state.json").exists() {
            return Ok(());
        }
        regular(&dir)?;
        let markers = dir.join("dirty");
        ensure(&markers)?;
        atomic_io::create(
            &markers.join(format!("{}.dirty", id())),
            b"knownext-proton-dirty/v1",
        )
        .map_err(|_| "No se pudo marcar el cambio pendiente".into())
    }
    fn pd_dirty(&self, project: &str) -> Result<Vec<PathBuf>, String> {
        let dir = self.pd_dir(project).join("dirty");
        match fs::symlink_metadata(&dir) {
            Ok(_) => regular(&dir)?,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(vec![]),
            Err(_) => return Err("Marcadores inaccesibles; se conservan".into()),
        }
        let mut result = Vec::new();
        for item in fs::read_dir(&dir).map_err(|_| "No se pudo consultar cambios pendientes")? {
            let path = item
                .map_err(|_| "No se pudo consultar cambios pendientes")?
                .path();
            let name = path
                .file_name()
                .and_then(|v| v.to_str())
                .ok_or("Marcador pendiente incompatible")?;
            if name.len() != 70
                || !name.ends_with(".dirty")
                || !name.as_bytes()[..64].iter().all(|c| c.is_ascii_hexdigit())
                || bytes(&path, 64)? != b"knownext-proton-dirty/v1"
            {
                return Err("Marcador desconocido; se conserva".into());
            }
            result.push(path);
            if result.len() == 10000 {
                // A bounded acknowledgement batch must not strand a project
                // after a long offline period. Remaining immutable markers
                // keep remoteConfirmed false and are drained next time.
                break;
            }
        }
        Ok(result)
    }
    fn pd_clear_markers(markers: &[PathBuf]) -> Result<(), String> {
        for path in markers {
            if bytes(path, 64)? != b"knownext-proton-dirty/v1" {
                return Err("El marcador cambió; se conserva".into());
            }
            fs::remove_file(path).map_err(|_| "No se pudo confirmar el guardado sincronizado")?;
        }
        Ok(())
    }
    pub fn run_due_proton_sync(&self) -> Result<(), String> {
        let registry = self.registry_checked()?;
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_err(|_| "Reloj no disponible")?
            .as_secs();
        for project in registry["projects"]
            .as_array()
            .ok_or("Registro no disponible")?
            .iter()
            .take(200)
        {
            let Some(id) = project["id"].as_str() else {
                continue;
            };
            let Ok(state) = self.pd_load(id) else {
                continue;
            };
            if state["binding"].is_null()
                || self.pd_paused(id, &state).unwrap_or(true)
                || !state["conflicts"].as_array().unwrap().is_empty()
                || state["nextAttemptAt"].as_u64().unwrap_or(0) > now
            {
                continue;
            }
            let outcome = self.proton_direct(id, "sync", json!({}));
            let _guard = GATE.lock().map_err(|_| "Sincronización ocupada")?;
            let mut current = self.pd_load(id)?;
            let failures = if outcome.is_ok() {
                0
            } else {
                current["failures"]
                    .as_u64()
                    .unwrap_or(0)
                    .saturating_add(1)
                    .min(6)
            };
            current["failures"] = json!(failures);
            current["nextAttemptAt"] = json!(
                now + if failures == 0 {
                    60
                } else {
                    30u64.saturating_mul(1 << failures).min(900)
                }
            );
            current["lastError"] = match outcome {
                Ok(_) => Value::Null,
                Err(error) => json!(error),
            };
            self.pd_save(id, &current)?;
        }
        Ok(())
    }
    fn pd_paused(&self, project: &str, state: &Value) -> Result<bool, String> {
        let file = self.pd_dir(project).join("policy.json");
        match fs::symlink_metadata(&file) {
            Ok(_) => {}
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                return Ok(state["paused"] == true)
            }
            Err(_) => return Err("Política Proton inaccesible; se conserva".into()),
        }
        let policy: Value = serde_json::from_slice(&bytes(&file, 4096)?)
            .map_err(|_| "Política Proton ilegible; se conserva")?;
        let identity = |v: &Value| {
            v.as_str().is_some_and(|s| {
                !s.is_empty()
                    && s.len() <= 128
                    && s.bytes()
                        .all(|b| b.is_ascii_alphanumeric() || b"_-".contains(&b))
            })
        };
        if policy["schemaVersion"] != 1
            || !policy["paused"].is_boolean()
            || !policy["generation"].is_u64()
            || (!policy["migrationOwner"].is_null() && !identity(&policy["migrationOwner"]))
        {
            return Err("Política Proton incompatible; se conserva".into());
        }
        let attempt = &state["lifecycle"]["migration"];
        if attempt["phase"] == "switching" {
            let before = &attempt["sourceEngine"];
            let after = &attempt["switch"]["afterEngine"];
            let pair = before["generation"]
                .as_u64()
                .zip(after["generation"].as_u64());
            let valid = identity(&attempt["id"])
                && before["projectId"] == state["projectId"]
                && after["projectId"] == state["projectId"]
                && pair.is_some_and(|(a, b)| {
                    a.checked_add(1) == Some(b)
                        && [json!(a), json!(b)].contains(&state["generation"])
                        && [json!(a), json!(b)].contains(&policy["generation"])
                })
                && (policy["migrationOwner"].is_null()
                    || policy["migrationOwner"] == attempt["id"]);
            if !valid {
                return Err("La transición de sincronización no es verificable; se conservan política e intento".into());
            }
            // Recovery can query either side of the committed generation, but
            // neither may resume publication before finalize remaps the policy.
            return Ok(true);
        }
        if policy["generation"].as_u64() > state["generation"].as_u64() {
            return Err("Política de una generación futura; se conserva sin aplicar".into());
        }
        if policy["generation"] != state["generation"] {
            return Ok(state["paused"] == true);
        }
        Ok(policy["paused"] == true)
    }
    fn pd_validate_root(&self, root: &Path) -> Result<(), String> {
        fn normalized(path: &Path) -> String {
            let value = path
                .to_string_lossy()
                .replace('\\', "/")
                .trim_end_matches('/')
                .to_owned();
            if cfg!(windows) {
                value.to_lowercase()
            } else {
                value
            }
        }
        let source = normalized(
            &root
                .canonicalize()
                .map_err(|_| "Ubicación del proyecto inaccesible")?,
        );
        let private = normalized(
            &self
                .app_data_dir
                .canonicalize()
                .map_err(|_| "Almacén privado inaccesible")?,
        );
        let safe_documents = format!("{private}/projects/");
        if (source == private || source.starts_with(&format!("{private}/")))
            && !source.starts_with(&safe_documents)
            || private.starts_with(&format!("{source}/"))
        {
            return Err("El proyecto se solapa con datos privados de KnowNext. Elige una carpeta de documentos separada antes de sincronizar.".into());
        }
        if let Some(library) = LIBRARY
            .get()
            .and_then(|p| p.parent())
            .and_then(|p| p.canonicalize().ok())
        {
            let library = normalized(&library);
            if source == library
                || source.starts_with(&format!("{library}/"))
                || library.starts_with(&format!("{source}/"))
            {
                return Err("La carpeta incluye componentes de la aplicación y no puede ser un destino de sincronización.".into());
            }
        }
        Ok(())
    }
    fn pd_dir(&self, project: &str) -> PathBuf {
        self.pd_private_root()
            .join("proton-direct")
            .join(sha256_hex(project.as_bytes()))
    }
    fn pd_load(&self, project: &str) -> Result<Value, String> {
        let dir = self.pd_dir(project);
        let path = dir.join("state.json");
        for folder in [
            dir.parent().ok_or("Almacén privado incompatible")?,
            dir.as_path(),
        ] {
            match fs::symlink_metadata(folder) {
                Ok(_) => regular(folder)?,
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
                Err(_) => return Err("Almacén Proton inaccesible; se conserva".into()),
            }
        }
        let mut value = match fs::symlink_metadata(&path) {
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                json!({"schemaVersion":1,"projectId":project,"deviceId":id(),"generation":0,"binding":null,"review":null,"paused":false,"base":{},"basePublications":{},"heads":{},"seen":[],"causal":null,"lastSentStamp":null,"publishAttempt":null,"receiveAttempt":null,"conflicts":[],"choices":{},"lastSyncedAt":null})
            }
            Err(_) => return Err("Estado Proton inaccesible".into()),
            Ok(_) => serde_json::from_slice(&bytes(&path, MAX_STATE)?)
                .map_err(|_| "Estado Proton ilegible; se conserva")?,
        };
        for field in [
            "baseDirectories",
            "baseDirectoryPublications",
            "baseDirectoryStamps",
        ] {
            if value.get(field).is_none() {
                value[field] = json!({});
            }
        }
        if value.get("acceptedRelocations").is_none() {
            value["acceptedRelocations"] = json!([]);
        }
        if !(value["lifecycle"].is_null() || value["lifecycle"].is_object())
            || !value["baseDirectories"].as_object().is_some_and(|m| {
                m.len() <= snapshots::MAX_ENTRIES
                    && m.iter()
                        .all(|(p, v)| relative_directory(p) && v.is_boolean())
            })
            || !value["baseDirectoryStamps"].as_object().is_some_and(|m| {
                m.len() <= snapshots::MAX_ENTRIES && m.keys().all(|p| relative_directory(p))
            })
            || !value["baseDirectoryPublications"]
                .as_object()
                .is_some_and(|m| {
                    m.len() <= snapshots::MAX_ENTRIES && m.keys().all(|p| relative_directory(p))
                })
        {
            return Err("Estado de carpetas o ciclo de vida incompatible; se conserva".into());
        }
        if value["schemaVersion"] != 1
            || value["projectId"] != project
            || !value["base"].is_object()
            || !value["basePublications"].is_object()
            || !value["heads"].is_object()
            || !value["seen"].is_array()
            || !value["conflicts"].is_array()
            || !value["choices"].is_object()
            || !value["generation"].is_u64()
        {
            return Err("Estado Proton incompatible; se conserva".into());
        }
        let identity = |v: &Value| {
            v.as_str().is_some_and(|s| {
                !s.is_empty()
                    && s.len() <= 128
                    && s.bytes()
                        .all(|b| b.is_ascii_alphanumeric() || b"_-".contains(&b))
            })
        };
        let digest = |v: &Value| {
            v.as_str()
                .is_some_and(|s| s.len() == 64 && s.bytes().all(|b| b.is_ascii_hexdigit()))
        };
        if !value["acceptedRelocations"]
            .as_array()
            .is_some_and(|r| r.len() <= 1000 && r.iter().all(&identity))
        {
            return Err("Avisos de traslado aceptados incompatibles; se conservan".into());
        }
        if !identity(&value["deviceId"])
            || !value["paused"].is_boolean()
            || value["seen"]
                .as_array()
                .unwrap()
                .iter()
                .any(|v| !identity(v))
            || value["base"]
                .as_object()
                .unwrap()
                .values()
                .any(|v| !digest(v))
            || value["basePublications"]
                .as_object()
                .unwrap()
                .values()
                .any(|v| !identity(v))
            || value["baseDirectoryStamps"]
                .as_object()
                .unwrap()
                .values()
                .any(|v| !digest(v))
            || value["baseDirectoryPublications"]
                .as_object()
                .unwrap()
                .values()
                .any(|v| !identity(v))
        {
            return Err("Estado Proton incompatible; se conserva sin aplicar".into());
        }
        if !value["binding"].is_null() {
            let b = &value["binding"];
            if !b["accountId"]
                .as_str()
                .is_some_and(|s| !s.is_empty() && s.len() < 2048)
                || !identity(&b["logicalProjectId"])
                || b["generation"] != value["generation"]
                || !b["accountRootId"]
                    .as_str()
                    .is_some_and(|s| !s.is_empty() && s.len() < 2048)
                || !(b["remoteRootId"].is_null()
                    || b["remoteRootId"]
                        .as_str()
                        .is_some_and(|s| !s.is_empty() && s.len() < 2048))
            {
                return Err("Asociación Proton incompatible; se conserva".into());
            }
        }
        if !value["manifestStamps"].is_null()
            && !value["manifestStamps"].as_object().is_some_and(|rows| {
                rows.iter()
                    .all(|(key, stamp)| identity(&json!(key)) && digest(stamp))
            })
        {
            return Err("Huellas observadas incompatibles; se conservan".into());
        }
        if !value["publishAttempt"].is_null() {
            let m: Manifest = serde_json::from_value(value["publishAttempt"]["manifest"].clone())
                .map_err(|_| "Preparación pendiente incompatible")?;
            snapshots::manifest_hash(&m).map_err(|_| "Preparación pendiente no verificable")?;
            if !digest(&value["publishAttempt"]["stamp"]) {
                return Err("Sello de preparación incompatible".into());
            }
        }
        if !value["receiveAttempt"].is_null() {
            let attempt = &value["receiveAttempt"];
            let m: Manifest = serde_json::from_value(attempt["manifest"].clone())
                .map_err(|_| "Recepción pendiente incompatible")?;
            snapshots::manifest_hash(&m).map_err(|_| "Recepción pendiente no verificable")?;
            if !attempt["observedBase"].is_null()
                && !attempt["observedBase"].as_object().is_some_and(|rows| {
                    rows.iter().all(|(path, row)| {
                        (m.files.contains_key(path) || value["base"].get(path).is_some())
                            && identity(&row["publicationId"])
                            && (row["sha256"].is_null() || digest(&row["sha256"]))
                            && attempt["ancestors"]
                                .as_array()
                                .is_some_and(|a| a.contains(&row["publicationId"]))
                    })
                })
            {
                return Err("Base observada incompatible; se conserva".into());
            }
            if !attempt["observedDirectoryBase"].is_null()
                && !attempt["observedDirectoryBase"]
                    .as_object()
                    .is_some_and(|rows| {
                        rows.len() <= snapshots::MAX_ENTRIES
                            && rows.iter().all(|(path, row)| {
                                relative_directory(path)
                                    && identity(&row["publicationId"])
                                    && row["present"].is_boolean()
                                    && attempt["ancestors"]
                                        .as_array()
                                        .is_some_and(|a| a.contains(&row["publicationId"]))
                            })
                    })
            {
                return Err("Base de carpetas observada incompatible; se conserva".into());
            }
            if !attempt["directoryPlan"].is_null() {
                let plan = attempt["directoryPlan"]
                    .as_array()
                    .ok_or("Plan de carpetas incompatible")?;
                if plan.len() > snapshots::MAX_ENTRIES
                    || !plan.iter().all(|r| {
                        r["path"].as_str().is_some_and(relative_directory)
                            && matches!(
                                r["action"].as_str(),
                                Some("same" | "keep" | "create" | "remove-if-empty")
                            )
                            && r["remote"].is_boolean()
                            && (r["expectedStamp"].is_null() || digest(&r["expectedStamp"]))
                    })
                    || !attempt["directoriesCompleted"]
                        .as_array()
                        .is_some_and(|done| {
                            done.iter().all(|p| plan.iter().any(|r| &r["path"] == p))
                        })
                {
                    return Err("Journal de carpetas incompatible; se conserva".into());
                }
            }
            if !attempt["completed"]
                .as_array()
                .is_some_and(|v| v.iter().all(Value::is_string))
                || !attempt["ancestors"]
                    .as_array()
                    .is_some_and(|v| v.iter().all(&identity))
                || !(attempt["plan"].is_null()
                    || attempt["plan"].as_array().is_some_and(|rows| {
                        rows.iter().all(|r| {
                            r["path"].is_string()
                                && matches!(
                                    r["action"].as_str(),
                                    Some("same" | "keep" | "write" | "delete" | "both")
                                )
                                && (r["expected"].is_null() || digest(&r["expected"]))
                                && (r["remote"].is_null() || digest(&r["remote"]))
                        })
                    }))
            {
                return Err("Journal recibido incompatible; se conserva".into());
            }
        }
        for row in value["conflicts"].as_array().unwrap() {
            if !row["id"].is_string()
                || !row["path"].is_string()
                || !identity(&row["publicationId"])
                || !digest(&row["revision"])
                || !(row["localHash"].is_null() || digest(&row["localHash"]))
                || !(row["remoteHash"].is_null() || digest(&row["remoteHash"]))
            {
                return Err("Conflicto guardado incompatible; se conserva".into());
            }
        }
        Ok(value)
    }
    fn pd_save(&self, project: &str, state: &Value) -> Result<(), String> {
        let encoded = serde_json::to_vec(state).map_err(|_| "Estado no válido")?;
        if encoded.len() as u64 > MAX_STATE {
            return Err("Estado Proton fuera de presupuesto; se conserva".into());
        }
        ensure(&self.pd_dir(project))?;
        atomic_io::write(&self.pd_dir(project).join("state.json"), &encoded)
            .map_err(|_| "No se pudo guardar el estado Proton".into())
    }
    pub(super) fn proton_direct_connected(&self, project: &str) -> Result<bool, String> {
        Ok(!self.pd_load(project)?["binding"].is_null())
    }
    fn pd_call(&self, state: &Value, op: &str, payload: Value) -> Result<Value, String> {
        if let Some(project) = state["projectId"].as_str() {
            if self.pd_paused(project, state)? {
                return Err(
                    "Sincronización en pausa; el progreso se conserva para continuar".into(),
                );
            }
        }
        self.pd_service()
            .invoke(
                state["binding"]["accountId"]
                    .as_str()
                    .ok_or("Conecta una cuenta Proton")?,
                op,
                payload,
            )
            .map_err(|e| e.to_string())
    }
    fn pd_list(&self, state: &Value, parent: &str) -> Result<Vec<Value>, String> {
        let value = self.pd_call(state, "drive.list", json!({"parentId":parent}))?;
        if value["complete"] != true {
            return Err("Listado remoto incompleto; no se modifica".into());
        }
        let items = value["items"]
            .as_array()
            .ok_or("Listado remoto incompleto")?;
        if items.len() > 10_000 {
            return Err("Listado remoto fuera de presupuesto".into());
        }
        Ok(items.clone())
    }
    fn pd_folder(&self, state: &Value, parent: &str, name: &str) -> Result<String, String> {
        let found: Vec<_> = self
            .pd_list(state, parent)?
            .into_iter()
            .filter(|v| v["name"] == name)
            .collect();
        if found.len() > 1 {
            return Err("Destino remoto ambiguo; se conserva".into());
        }
        let value = if let Some(v) = found.into_iter().next() {
            if v["type"] != "folder" {
                return Err("El destino remoto no es una carpeta".into());
            }
            v
        } else {
            self.pd_call(
                state,
                "drive.createFolder",
                json!({"parentId":parent,"name":name}),
            )?
        };
        Ok(value["id"]
            .as_str()
            .ok_or("Identidad remota ausente")?
            .into())
    }
    fn pd_read(&self, state: &Value, node: &str, max: u64) -> Result<Vec<u8>, String> {
        let value = self.pd_call(
            state,
            "drive.readFile",
            json!({"nodeId":node,"maxBytes":max}),
        )?;
        let content = value["contentBase64"]
            .as_str()
            .ok_or("Contenido remoto ausente")?;
        if content.len() as u64 > (max + 2) / 3 * 4 + 8 {
            return Err("Contenido remoto fuera de presupuesto".into());
        }
        let result = B64
            .decode(content)
            .map_err(|_| "Contenido remoto no válido")?;
        if result.len() as u64 > max {
            return Err("Contenido remoto fuera de presupuesto".into());
        }
        Ok(result)
    }
    fn pd_status(&self, project: &str, state: &Value) -> Value {
        let mut observed = state.clone();
        observed["paused"] = json!(self.pd_paused(project, state).unwrap_or(true));
        // Read once: errors are unknown accounting, not a fabricated queued save.
        // Keep the closed guard and expose its real cause for recovery/diagnosis.
        let markers = self.pd_dirty(project);
        let mut status_issue = markers.as_ref().err().cloned();
        let lifecycle_block = lifecycle::publication_blocked(state);
        if let Err(issue) = &lifecycle_block {
            if status_issue.is_none() {
                status_issue = Some(issue.clone());
            }
        }
        let mut local_changed = false;
        if observed["verifiedCurrent"] == true {
            let checked=self.pd_project_root(project).and_then(|root|{
                let logical=state["binding"]["logicalProjectId"].as_str().ok_or("Asociación sin identidad verificable")?;
                snapshots::capture(&root,logical,&id(),state["deviceId"].as_str().ok_or("Dispositivo no verificable")?,None)
                    .map(|snapshot|state["lastSentStamp"]==Self::pd_stamp(&snapshot))
                    .map_err(|_|"No se pudo contrastar el contenido actual; se conserva la confirmación anterior sin declararla vigente".to_owned())
            });
            match checked {
                Ok(unchanged) => {
                    observed["verifiedCurrent"] = json!(unchanged);
                    local_changed = !unchanged;
                }
                Err(issue) => {
                    observed["verifiedCurrent"] = json!(false);
                    if status_issue.is_none() {
                        status_issue = Some(issue);
                    }
                }
            }
        }
        let state = &observed;
        let blocked = !state["relocationNotice"].is_null() || lifecycle_block.unwrap_or(true);
        let notice = if !state["relocationNotice"].is_null() {
            let n = &state["relocationNotice"];
            json!({"kind":n["kind"],"attemptId":n["attemptId"],"destinationProvider":n["destinationProvider"],"createdAt":n["createdAt"],"detail":n["detail"],"causalVerified":n["causalVerified"]})
        } else {
            Value::Null
        };
        let dirty = local_changed || markers.as_ref().is_ok_and(|rows| !rows.is_empty());
        let pending = usize::from(!state["publishAttempt"].is_null())
            + usize::from(!state["receiveAttempt"].is_null())
            + usize::from(dirty);
        json!({"projectId":project,"binding":state["binding"],"paused":state["paused"],"state":if state["binding"].is_null(){"disconnected"}else if blocked||status_issue.is_some()||!state["conflicts"].as_array().unwrap().is_empty(){"needs-review"}else if pending>0{"pending"}else if state["paused"]==true{"paused"}else{"ready"},"detail":status_issue.as_deref().or(state["lastError"].as_str()).unwrap_or("Los cambios se guardan localmente; la sincronización usa el SDK directo de Proton."),"statusIssue":status_issue,"pendingUnknown":status_issue.is_some(),"notice":notice,"publicationBlocked":blocked,"remoteConfirmed":!blocked&&status_issue.is_none()&&markers.is_ok()&&state["verifiedCurrent"]==true&&!state["lastSyncedAt"].is_null()&&pending==0&&state["conflicts"].as_array().unwrap().is_empty(),"lastSyncedAt":state["lastSyncedAt"],"canDisconnect":state["receiveAttempt"].is_null()&&state["publishAttempt"].is_null(),"recoveryRequired":!state["receiveAttempt"].is_null(),"pendingOperations":pending})
    }
    pub(super) fn proton_direct(
        &self,
        project: &str,
        action: &str,
        payload: Value,
    ) -> Result<Value, String> {
        let _gate = if matches!(
            action,
            "status" | "conflicts" | "conflict-review" | "storage" | "migration-query" | "pause"
        ) {
            None
        } else if action == "migration-ack" {
            // ACK commits under the editor mutation mutex. Never queue it
            // behind a network transfer holding GATE from another project.
            Some(
                GATE.try_lock()
                    .map_err(|_| "Sincronización ocupada; consulta antes de confirmar")?,
            )
        } else {
            Some(GATE.lock().map_err(|_| "Sincronización ocupada")?)
        };
        let root = self.pd_project_root(project)?;
        regular(&root)?;
        self.pd_validate_root(&root)?;
        let mut state = self.pd_load(project)?;
        state["paused"] = json!(self.pd_paused(project, &state)?);
        match action {
            "status" => Ok(self.pd_status(project, &state)),
            "disconnect" => {
                if payload["generation"] != state["generation"]
                    || !state["receiveAttempt"].is_null()
                    || !state["publishAttempt"].is_null()
                {
                    return Err("La asociación cambió o tiene operaciones pendientes; se conserva para recuperación".into());
                }
                let _transaction = self.project_transaction(project)?;
                state["binding"] = Value::Null;
                state["review"] = Value::Null;
                state["generation"] = json!(state["generation"]
                    .as_u64()
                    .unwrap()
                    .checked_add(1)
                    .ok_or("Generación agotada")?);
                state["verifiedCurrent"] = json!(false);
                self.pd_save(project, &state)?;
                Ok(self.pd_status(project, &state))
            }
            "pause" => {
                let paused = payload["paused"]
                    .as_bool()
                    .ok_or("Indica si quieres pausar")?;
                ensure(&self.pd_dir(project))?;
                atomic_io::write(&self.pd_dir(project).join("policy.json"),&serde_json::to_vec(&json!({"schemaVersion":1,"generation":state["generation"],"paused":paused})).map_err(|_|"Política no válida")?).map_err(|_|"No se pudo confirmar la pausa")?;
                state["paused"] = json!(paused);
                Ok(self.pd_status(project, &state))
            }
            "review" => self.pd_review(project, &root, &mut state, payload),
            "connect" => self.pd_connect(project, &root, &mut state, payload),
            "sync" => {
                let _activity = self.background_work.enter();
                if state["paused"] == true {
                    return Ok(self.pd_status(project, &state));
                }
                self.pd_sync(project, &root, &mut state)?;
                Ok(self.pd_status(project, &state))
            }
            "conflicts" => Ok(json!({"items":state["conflicts"]})),
            "resolve" => self.pd_resolve(project, &root, &mut state, payload),
            "conflict-review" => {
                let mut row = state["conflicts"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .find(|v| v["id"] == payload["conflictId"])
                    .ok_or("Conflicto no disponible")?
                    .clone();
                let path = row["path"].as_str().ok_or("Ruta no válida")?;
                if let Some(expected) = row["localHash"].as_str() {
                    if local_hash(&root, path)?.as_deref() != Some(expected) {
                        return Err("El documento cambió; actualiza la revisión".into());
                    }
                    let content = bytes(&target(&root, path)?, 256 * 1024);
                    if let Ok(content) = content {
                        if let Ok(text) = String::from_utf8(content) {
                            row["local"] = json!(text);
                        }
                    }
                }
                if let Some(hash) = row["remoteHash"].as_str() {
                    if let Ok(content) =
                        bytes(&self.pd_dir(project).join("content").join(hash), 256 * 1024)
                    {
                        if let Ok(text) = String::from_utf8(content) {
                            row["remote"] = json!(text);
                        }
                    }
                }
                Ok(row)
            }

            "storage"
            | "retention-review"
            | "retention-apply"
            | "retention-cancel"
            | "migration-review"
            | "migration-start"
            | "migration-query"
            | "migration-cancel"
            | "migration-ack"
            | "migration-ack-review"
            | "migration-finalize" => {
                self.pd_lifecycle(project, &root, &mut state, action, payload)
            }
            _ => Err("Acción Proton no compatible".into()),
        }
    }
    fn pd_project_descriptor(&self, state: &Value, folder: &Value) -> Result<Value, String> {
        let storage = folder["name"]
            .as_str()
            .and_then(|n| n.strip_prefix("KnowNext-"))
            .ok_or("Proyecto remoto incompatible")?;
        let identity = |s: &str| {
            !s.is_empty()
                && s.len() <= 128
                && s.bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b"_-".contains(&b))
        };
        if folder["type"] != "folder" || !identity(storage) {
            return Err("Identidad de almacén remoto incompatible".into());
        }
        let children = self.pd_list(
            state,
            folder["id"].as_str().ok_or("Identidad remota ausente")?,
        )?;
        let descriptions = children
            .iter()
            .filter(|v| v["name"] == "project.json")
            .collect::<Vec<_>>();
        if descriptions.len() != 1 || descriptions[0]["type"] != "file" {
            return Err("Proyecto remoto incompleto o duplicado; revisa de nuevo".into());
        }
        let metadata: Value = serde_json::from_slice(&self.pd_read(
            state,
            descriptions[0]["id"].as_str().ok_or("Identidad ausente")?,
            64 * 1024,
        )?)
        .map_err(|_| "Descripción remota no válida")?;
        let logical = metadata["logicalProjectId"]
            .as_str()
            .filter(|s| identity(s))
            .ok_or("Identidad lógica remota incompatible")?;
        if metadata["schemaVersion"] != 1
            || metadata["storageId"].as_str().unwrap_or(logical) != storage
            || (!metadata["storageId"].is_null()
                && !metadata["storageId"].as_str().is_some_and(identity))
        {
            return Err("Identidad de proyecto remoto no verificable".into());
        }
        Ok(metadata)
    }
    fn pd_review(
        &self,
        project: &str,
        root: &Path,
        state: &mut Value,
        payload: Value,
    ) -> Result<Value, String> {
        if !state["binding"].is_null() {
            return Err("El proyecto ya tiene una asociación Proton; se conserva".into());
        }
        if self.proton_sync_is_connected(project)? {
            return Err(
                "Existe un intercambio anterior pendiente de recuperación; se conserva".into(),
            );
        }
        let registry = self.registry_checked()?;
        let project_row = registry["projects"]
            .as_array()
            .and_then(|p| p.iter().find(|p| p["id"] == project))
            .ok_or("Proyecto no registrado")?;
        if project_row["syncMode"]
            .as_str()
            .is_some_and(is_github_sync_mode)
        {
            return Err("Revisa la desconexión de GitHub antes de cambiar el destino".into());
        }
        let account = payload["accountId"]
            .as_str()
            .ok_or("Conecta tu cuenta Proton")?;
        let temporary = json!({"binding":{"accountId":account}});
        let remote = self.pd_call(&temporary, "drive.root", json!({}))?;
        let remote_id = remote["id"].as_str().ok_or("Raíz remota no disponible")?;
        let mut projects = self
            .pd_list(&temporary, remote_id)?
            .into_iter()
            .filter(|v| {
                v["type"] == "folder"
                    && v["name"]
                        .as_str()
                        .is_some_and(|s| s.starts_with("KnowNext-"))
            })
            .collect::<Vec<_>>();
        for item in &mut projects {
            let metadata = self.pd_project_descriptor(&temporary, item)?;
            item["logicalProjectId"] = metadata["logicalProjectId"].clone();
            item["descriptorStamp"] = json!(hash(&metadata));
            item["name"] = json!(metadata["name"]
                .as_str()
                .filter(|n| !n.is_empty() && n.len() < 256)
                .unwrap_or("Proyecto compartido"));
        }
        if let Some(selected) = payload["remoteRootId"].as_str() {
            if !projects.iter().any(|p| p["id"] == selected) {
                return Err("El destino seleccionado no pertenece al inventario revisado".into());
            }
        }
        let snapshot = snapshots::capture(root, "review", &id(), &id(), None)
            .map_err(|_| "No se pudo revisar el proyecto completo")?;
        let mut review = json!({"id":id(),"generation":state["generation"],"accountId":account,"remoteRootId":payload["remoteRootId"],"accountRootId":remote_id,"registryStamp":hash(&registry),"rootStamp":hash(&json!({"files":snapshot.manifest.files,"directories":snapshot.manifest.directories})),"canConnect":true,"summary":{"files":snapshot.manifest.files.len(),"bytes":snapshot.manifest.files.values().map(|f|f.bytes).sum::<u64>()},"remoteProjects":projects,"warnings":["Git, credenciales, borradores y estado del dispositivo permanecen locales."],"blockers":[]});
        review["revision"] = json!(hash(&review));
        state["review"] = review.clone();
        self.pd_save(project, state)?;
        Ok(review)
    }
    fn pd_connect(
        &self,
        project: &str,
        root: &Path,
        state: &mut Value,
        payload: Value,
    ) -> Result<Value, String> {
        let review = state["review"].clone();
        let mut material = review.clone();
        let revision = material.as_object_mut().and_then(|r| r.remove("revision"));
        if revision != Some(json!(hash(&material))) {
            return Err("La revisión guardada cambió; revisa de nuevo".into());
        }
        if review.is_null()
            || payload["id"] != review["id"]
            || payload["revision"] != review["revision"]
            || review["generation"] != state["generation"]
            || !state["binding"].is_null()
        {
            return Err("La revisión no está vigente".into());
        }
        let snapshot = snapshots::capture(root, "review", &id(), &id(), None)
            .map_err(|_| "No se pudo comprobar el proyecto")?;
        if review["rootStamp"]
            != hash(
                &json!({"files":snapshot.manifest.files,"directories":snapshot.manifest.directories}),
            )
        {
            return Err("El contenido cambió; revisa de nuevo".into());
        }
        let logical = if review["remoteRootId"].is_string() {
            let temporary = json!({"binding":{"accountId":review["accountId"]}});
            let folders = self.pd_list(&temporary, review["accountRootId"].as_str().unwrap())?;
            let selected = folders
                .iter()
                .find(|v| v["id"] == review["remoteRootId"])
                .ok_or("El destino cambió; revisa de nuevo")?;
            let metadata = self.pd_project_descriptor(&temporary, selected)?;
            let expected = review["remoteProjects"]
                .as_array()
                .and_then(|rows| rows.iter().find(|r| r["id"] == review["remoteRootId"]))
                .ok_or("Identidad revisada ausente")?;
            if metadata["logicalProjectId"] != expected["logicalProjectId"]
                || expected["descriptorStamp"] != hash(&metadata)
            {
                return Err("La identidad o descripción remota cambió; revisa de nuevo".into());
            }
            metadata["logicalProjectId"].as_str().unwrap().to_owned()
        } else {
            id()
        };
        let _transaction = self.project_transaction(project)?;
        if review["registryStamp"] != hash(&self.registry_checked()?)
            || self.pd_project_root(project)? != root
        {
            return Err("La asociación o ubicación cambió; revisa de nuevo".into());
        }
        let generation = state["generation"]
            .as_u64()
            .unwrap()
            .checked_add(1)
            .ok_or("Generación agotada")?;
        state["paused"] = json!(false);
        state["base"] = json!({});
        state["basePublications"] = json!({});
        state["baseDirectories"] = json!({});
        state["baseDirectoryPublications"] = json!({});
        state["baseDirectoryStamps"] = json!({});
        state["heads"] = json!({});
        state["manifestStamps"] = json!({});
        state["seen"] = json!([]);
        state["causal"] = Value::Null;
        state["lastSentStamp"] = Value::Null;
        state["lastSyncedAt"] = Value::Null;
        state["eventCursor"] = Value::Null;
        state["conflicts"] = json!([]);
        state["choices"] = json!({});
        state["relocationNotice"] = Value::Null;
        state["binding"] = json!({"accountId":review["accountId"],"remoteRootId":review["remoteRootId"],"accountRootId":review["accountRootId"],"logicalProjectId":logical,"generation":generation});
        // Persist the intent before a remote folder can be created. Reopening
        // resolves by logical identity rather than creating a fresh project.
        state["generation"] = json!(generation);
        state["review"] = Value::Null;
        self.pd_save(project, state)?;
        Ok(self.pd_status(project, state))
    }
    fn pd_cache(&self, project: &str, hash: &str, data: &[u8]) -> Result<(), String> {
        if hash.len() != 64
            || !hash.bytes().all(|v| v.is_ascii_hexdigit())
            || sha256_hex(data) != hash
        {
            return Err("Contenido no verificable".into());
        }
        let dir = self.pd_dir(project);
        ensure(&dir)?;
        let content = dir.join("content");
        ensure(&content)?;
        let path = content.join(hash);
        if path.exists() {
            if bytes(&path, snapshots::MAX_FILE_BYTES)? != data {
                return Err("Colisión en el almacén privado".into());
            }
            return Ok(());
        }
        if usage(&dir)?.saturating_add(data.len() as u64) > QUOTA {
            return Err("El almacén Proton alcanzó su cuota; conserva pendientes y copias".into());
        }
        atomic_io::create(&path, data)
            .map_err(|_| "No se pudo conservar el contenido privado".into())
    }
    fn pd_cached(
        &self,
        project: &str,
        manifest: &Manifest,
        root: &Path,
    ) -> Result<snapshots::Snapshot, String> {
        snapshots::manifest_hash(manifest).map_err(|_| "Descriptor privado incompatible")?;
        let mut contents = BTreeMap::new();
        for (path, file) in &manifest.files {
            let data = bytes(
                &self.pd_dir(project).join("content").join(&file.sha256),
                snapshots::MAX_FILE_BYTES,
            )?;
            contents.insert(path.clone(), data);
        }
        snapshots::restore_snapshot(manifest.clone(), contents, root)
            .map_err(|_| "La recepción o preparación privada está incompleta; se conserva".into())
    }
    fn pd_put(&self, state: &Value, parent: &str, name: &str, data: &[u8]) -> Result<(), String> {
        let nodes = self
            .pd_list(state, parent)?
            .into_iter()
            .filter(|v| v["name"] == name)
            .collect::<Vec<_>>();
        if nodes.len() > 1 {
            return Err("Objeto remoto duplicado; necesita revisión".into());
        }
        if let Some(node) = nodes.first() {
            if node["type"] != "file"
                || self.pd_read(
                    state,
                    node["id"].as_str().ok_or("Identidad remota inválida")?,
                    data.len() as u64,
                )? != data
            {
                return Err("El objeto remoto cambió; no se sustituye".into());
            }
            return Ok(());
        }
        self.pd_call(
            state,
            "drive.writeFile",
            json!({"parentId":parent,"name":name,"contentBase64":B64.encode(data)}),
        )?;
        // Verify actual committed bytes. A timeout retains the same attempt;
        // the next invocation queries this immutable object before retrying.
        let nodes = self
            .pd_list(state, parent)?
            .into_iter()
            .filter(|v| v["name"] == name)
            .collect::<Vec<_>>();
        if nodes.len() != 1
            || self.pd_read(
                state,
                nodes[0]["id"].as_str().ok_or("Falta identidad remota")?,
                data.len() as u64,
            )? != data
        {
            return Err(
                "La publicación remota no está confirmada; se consultará antes de repetir".into(),
            );
        }
        Ok(())
    }
    fn pd_stamp(snapshot: &snapshots::Snapshot) -> String {
        hash(&json!({"files":snapshot.manifest.files,"directories":snapshot.manifest.directories}))
    }
    fn pd_relocation_notice(
        &self,
        project: &str,
        state: &mut Value,
        nodes: &[Value],
    ) -> Result<bool, String> {
        let mut found = None;
        if state["acceptedRelocations"]
            .as_array()
            .is_some_and(|a| a.contains(&state["relocationNotice"]["attemptId"]))
        {
            state["relocationNotice"] = Value::Null;
        }
        for node in nodes {
            let Some(name) = node["name"].as_str() else {
                continue;
            };
            let Some(attempt) = name
                .strip_prefix("relocation-")
                .and_then(|n| n.strip_suffix(".json"))
            else {
                continue;
            };
            if state["acceptedRelocations"]
                .as_array()
                .is_some_and(|a| a.contains(&json!(attempt)))
            {
                continue;
            }
            if node["type"] != "file"
                || attempt.is_empty()
                || attempt.len() > 128
                || !attempt
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b"_-".contains(&b))
            {
                return Err("Aviso de traslado incompatible; no se publica".into());
            }
            let notice: Value = serde_json::from_slice(&self.pd_read(
                state,
                node["id"].as_str().ok_or("Aviso sin identidad")?,
                64 * 1024,
            )?)
            .map_err(|_| "Aviso de traslado ilegible; no se publica")?;
            let base = &notice["sourceBase"];
            let digest = notice["sourceStamp"]
                .as_str()
                .is_some_and(|v| v.len() == 64 && v.bytes().all(|b| b.is_ascii_hexdigit()));
            if notice["schemaVersion"] != 1
                || notice["kind"] != "knownext-project-relocation"
                || notice["logicalProjectId"] != state["binding"]["logicalProjectId"]
                || notice["attemptId"] != attempt
                || !notice["sourceGeneration"].as_u64().is_some_and(|v| v > 0)
                || !digest
                || !notice["createdAt"]
                    .as_str()
                    .is_some_and(|v| OffsetDateTime::parse(v, &Rfc3339).is_ok())
                || !matches!(
                    notice["destinationProvider"].as_str(),
                    Some("proton" | "local" | "github")
                )
            {
                return Err("El aviso no corresponde a este proyecto; no se publica".into());
            }
            // A signed/encrypted account object is not causal proof by itself.
            let known = base.is_null()
                || state["seen"].as_array().unwrap().contains(base)
                || state["causal"] == *base;
            if !base.is_null()
                && !base.as_str().is_some_and(|v| {
                    !v.is_empty()
                        && v.len() <= 128
                        && v.bytes()
                            .all(|b| b.is_ascii_alphanumeric() || b"_-".contains(&b))
                })
            {
                return Err("Antecedente del aviso incompatible; no se publica".into());
            }
            let public = json!({"kind":"knownext-project-relocation","attemptId":attempt,"sourceBase":base,"causalVerified":known,"destinationProvider":notice["destinationProvider"],"createdAt":notice["createdAt"],"detail":"Este proyecto cambió de sincronización desde otro dispositivo. El envío está detenido; revisa el destino antes de continuar. No se cambia de cuenta automáticamente."});
            if found
                .as_ref()
                .is_some_and(|v: &Value| v["attemptId"] != public["attemptId"])
            {
                return Err("Hay varios avisos de traslado; revisa antes de publicar".into());
            }
            found = Some(public);
        }
        if let Some(notice) = found {
            state["relocationNotice"] = notice;
            state["verifiedCurrent"] = json!(false);
            self.pd_save(project, state)?;
        }
        Ok(!state["relocationNotice"].is_null())
    }
    fn pd_sync(&self, project: &str, root: &Path, state: &mut Value) -> Result<(), String> {
        if state["binding"].is_null() {
            return Err("Asocia el proyecto antes de sincronizar".into());
        }
        let lifecycle_blocked = lifecycle::publication_blocked(state)?;
        let dirty_before = self.pd_dirty(project)?;
        state["verifiedCurrent"] = json!(false);
        self.pd_save(project, state)?;
        if !state["receiveAttempt"].is_null() {
            let manifest: Manifest =
                serde_json::from_value(state["receiveAttempt"]["manifest"].clone())
                    .map_err(|_| "Recepción pendiente incompatible")?;
            self.pd_receive(project, root, state, &manifest)?;
            if !state["receiveAttempt"].is_null() {
                return Ok(());
            }
        }
        let event = self.pd_call(
            state,
            "drive.events",
            json!({"cursor":state["eventCursor"]}),
        )?;
        let next_cursor = event["cursor"].clone();
        if !next_cursor.is_string() {
            return Err("Cursor remoto no verificable".into());
        }
        if event["changed"] == false
            && event["requiresRefresh"] == false
            && state["publishAttempt"].is_null()
            && state["receiveAttempt"].is_null()
            && state["binding"]["remoteRootId"].is_string()
            && state["relocationNotice"].is_null()
            && !lifecycle_blocked
        {
            let snapshot = {
                let _source = self.project_write(project)?;
                snapshots::capture(
                    root,
                    state["binding"]["logicalProjectId"].as_str().unwrap(),
                    &id(),
                    state["deviceId"].as_str().unwrap(),
                    None,
                )
                .map_err(|_| "No se pudo comprobar el contenido local")?
            };
            if state["lastSentStamp"] == Self::pd_stamp(&snapshot) {
                state["eventCursor"] = next_cursor.clone();
                state["lastSyncedAt"] = json!(knownext_core::now_iso());
                state["verifiedCurrent"] = json!(true);
                self.pd_save(project, state)?;
                Self::pd_clear_markers(&dirty_before)?;
                return Ok(());
            }
        }
        if state["binding"]["remoteRootId"].is_null() {
            let parent = state["binding"]["accountRootId"]
                .as_str()
                .ok_or("Raíz remota ausente")?;
            let remote = self.pd_folder(
                state,
                parent,
                &format!(
                    "KnowNext-{}",
                    state["binding"]["logicalProjectId"]
                        .as_str()
                        .ok_or("Identidad ausente")?
                ),
            )?;
            state["binding"]["remoteRootId"] = json!(remote);
            self.pd_save(project, state)?;
        }
        let remote = state["binding"]["remoteRootId"]
            .as_str()
            .ok_or("Raíz remota ausente")?
            .to_owned();
        let descriptor_nodes = self.pd_list(state, &remote)?;
        let publication_blocked =
            self.pd_relocation_notice(project, state, &descriptor_nodes)? || lifecycle_blocked;
        let (objects, publications) = if publication_blocked {
            let existing = |name: &str| -> Result<String, String> {
                let rows = descriptor_nodes
                    .iter()
                    .filter(|n| n["name"] == name && n["type"] == "folder")
                    .collect::<Vec<_>>();
                if rows.len() != 1 {
                    return Err(
                        "El origen trasladado está incompleto; se conserva sin publicar".into(),
                    );
                }
                rows[0]["id"]
                    .as_str()
                    .map(str::to_owned)
                    .ok_or_else(|| "Carpeta sin identidad".into())
            };
            (existing("objects")?, existing("publications")?)
        } else {
            (
                self.pd_folder(state, &remote, "objects")?,
                self.pd_folder(state, &remote, "publications")?,
            )
        };
        if !publication_blocked && !state["publishAttempt"].is_null() {
            self.pd_publish_pending(project, root, state, &objects, &publications)?;
        }
        let label = self.registry_checked()?["projects"]
            .as_array()
            .and_then(|p| p.iter().find(|p| p["id"] == project))
            .and_then(|p| p["name"].as_str())
            .unwrap_or("Proyecto")
            .to_owned();
        if !publication_blocked && !descriptor_nodes.iter().any(|n| n["name"] == "project.json") {
            self.pd_put(state,&remote,"project.json",&serde_json::to_vec(&json!({"schemaVersion":1,"logicalProjectId":state["binding"]["logicalProjectId"],"name":label})).map_err(|_|"Proyecto incompatible")?)?;
        }
        let nodes = self.pd_list(state, &publications)?;
        if nodes.len() > 1000 {
            return Err(
                "El historial remoto necesita revisión de capacidad; no se omite contenido".into(),
            );
        }
        let mut manifests = BTreeMap::new();
        for node in nodes {
            let name = node["name"].as_str().ok_or("Nombre remoto ausente")?;
            if !name.ends_with(".json") {
                continue;
            }
            if node["type"] != "file" {
                return Err("Publicación remota incompatible".into());
            }
            let encoded = self.pd_read(
                state,
                node["id"].as_str().ok_or("Identidad ausente")?,
                8 * 1024 * 1024,
            )?;
            let manifest: Manifest =
                serde_json::from_slice(&encoded).map_err(|_| "Descriptor remoto no válido")?;
            snapshots::manifest_hash(&manifest).map_err(|_| "Descriptor remoto incompatible")?;
            if state["seen"]
                .as_array()
                .unwrap()
                .contains(&json!(manifest.publication_id))
                && state["manifestStamps"][&manifest.publication_id]
                    != json!(snapshots::manifest_hash(&manifest)
                        .map_err(|_| "Descriptor incompatible")?)
            {
                return Err(
                    "Una publicación ya observada cambió; se conserva para revisión".into(),
                );
            }
            if manifest.project_id != state["binding"]["logicalProjectId"].as_str().unwrap_or("")
                || name != format!("{}.json", manifest.publication_id)
            {
                return Err("Identidad remota no corresponde al proyecto".into());
            }
            if manifests
                .insert(manifest.publication_id.clone(), manifest)
                .is_some()
            {
                return Err("Publicaciones duplicadas; se conservan".into());
            }
        }
        let object_nodes = self.pd_list(state, &objects)?;
        for _ in 0..=manifests.len() {
            let mut progressed = false;
            for manifest in manifests.values() {
                if state["seen"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .any(|v| v == &manifest.publication_id)
                {
                    continue;
                }
                if manifest.sender_id == state["deviceId"].as_str().unwrap_or("") {
                    continue;
                }
                if manifest
                    .parent_publication
                    .as_ref()
                    .is_some_and(|p| !state["seen"].as_array().unwrap().iter().any(|v| v == p))
                {
                    continue;
                }
                for file in manifest.files.values() {
                    let name = format!("{}.blob", file.sha256);
                    let found = object_nodes
                        .iter()
                        .filter(|n| n["name"] == name)
                        .collect::<Vec<_>>();
                    if found.len() != 1 {
                        return Err(
                            "La publicación recibida está incompleta o duplicada; no se aplica"
                                .into(),
                        );
                    }
                    let content = self.pd_read(
                        state,
                        found[0]["id"].as_str().ok_or("Identidad ausente")?,
                        file.bytes,
                    )?;
                    self.pd_cache(project, &file.sha256, &content)?;
                }
                let mut ancestors = BTreeSet::new();
                let mut chain = Vec::new();
                let mut parent = manifest.parent_publication.as_ref();
                while let Some(key) = parent {
                    if ancestors.len() >= 1000 || !ancestors.insert(key.clone()) {
                        return Err("Cadena remota circular o fuera de presupuesto".into());
                    }
                    let prior = manifests
                        .get(key)
                        .ok_or("Falta un antecedente remoto verificable")?;
                    chain.push(prior);
                    parent = prior.parent_publication.as_ref();
                }
                let mut observed_base = serde_json::Map::new();
                for path in manifest
                    .files
                    .keys()
                    .chain(state["base"].as_object().unwrap().keys())
                {
                    let rows = chain
                        .iter()
                        .map(|m| {
                            (
                                m.publication_id.as_str(),
                                m.sender_id.as_str(),
                                m.files.get(path).map(|f| f.sha256.as_str()),
                            )
                        })
                        .collect::<Vec<_>>();
                    if let Some((publication, sha)) = planner::observed_own_base(
                        state["basePublications"][path].as_str(),
                        &rows,
                        state["deviceId"].as_str().unwrap(),
                    ) {
                        observed_base.insert(
                            path.clone(),
                            json!({"publicationId":publication,"sha256":sha}),
                        );
                    }
                }
                let mut observed_directories = serde_json::Map::new();
                let directory_paths = manifest
                    .directories
                    .iter()
                    .chain(state["baseDirectories"].as_object().unwrap().keys())
                    .chain(
                        chain
                            .iter()
                            .filter(|m| {
                                state["seen"]
                                    .as_array()
                                    .unwrap()
                                    .contains(&json!(m.publication_id))
                            })
                            .flat_map(|m| m.directories.iter()),
                    )
                    .cloned()
                    .collect::<BTreeSet<_>>();
                if directory_paths.len() > snapshots::MAX_ENTRIES {
                    return Err(
                        "La base causal de carpetas supera el presupuesto; se conserva".into(),
                    );
                }
                for path in &directory_paths {
                    let rows = chain
                        .iter()
                        .map(|m| {
                            (
                                m.publication_id.as_str(),
                                m.sender_id.as_str(),
                                m.directories.contains(path).then_some("present"),
                            )
                        })
                        .collect::<Vec<_>>();
                    if let Some((publication, present)) = planner::observed_own_base(
                        state["baseDirectoryPublications"][path].as_str(),
                        &rows,
                        state["deviceId"].as_str().unwrap(),
                    ) {
                        observed_directories.insert(
                            path.clone(),
                            json!({"publicationId":publication,"present":present.is_some()}),
                        );
                    } else if state["baseDirectories"].get(path).is_none() {
                        // Upgrade an older journal only from a verified ancestor
                        // already received by this replica, never a sender head.
                        if let Some(prior) = chain.iter().find(|m| {
                            state["seen"]
                                .as_array()
                                .unwrap()
                                .contains(&json!(m.publication_id))
                        }) {
                            observed_directories.insert(path.clone(),json!({"publicationId":prior.publication_id,"present":prior.directories.contains(path)}));
                        }
                    }
                }
                state["receiveAttempt"] = json!({"manifest":manifest,"ancestors":ancestors,"observedBase":observed_base,"observedDirectoryBase":observed_directories,"plan":null,"completed":[]});
                self.pd_save(project, state)?;
                self.pd_receive(project, root, state, manifest)?;
                if !state["receiveAttempt"].is_null() {
                    return Ok(());
                }
                progressed = true;
            }
            if !progressed {
                break;
            }
        }
        if manifests.values().any(|m| {
            m.sender_id != state["deviceId"].as_str().unwrap_or("")
                && !state["seen"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .any(|v| v == &m.publication_id)
        }) {
            return Err("Faltan antecedentes remotos; no se publica una base incompleta".into());
        }
        if publication_blocked {
            state["eventCursor"] = next_cursor;
            state["verifiedCurrent"] = json!(false);
            if !state["relocationNotice"].is_null() {
                let base = &state["relocationNotice"]["sourceBase"];
                let known = base.is_null() || state["seen"].as_array().unwrap().contains(base);
                state["relocationNotice"]["causalVerified"] = json!(known);
            }
            return self.pd_save(project, state);
        }
        if state["publishAttempt"].is_null() {
            let snapshot = {
                let _source = self.project_write(project)?;
                snapshots::capture(
                    root,
                    state["binding"]["logicalProjectId"].as_str().unwrap(),
                    &id(),
                    state["deviceId"].as_str().unwrap(),
                    state["causal"].as_str(),
                )
                .map_err(|_| "No se pudo capturar el proyecto completo")?
            };
            if state["lastSentStamp"] == Self::pd_stamp(&snapshot) {
                state["eventCursor"] = next_cursor.clone();
                state["lastSyncedAt"] = json!(knownext_core::now_iso());
                state["verifiedCurrent"] = json!(true);
                self.pd_save(project, state)?;
                Self::pd_clear_markers(&dirty_before)?;
                return Ok(());
            }
            for (path, file) in &snapshot.manifest.files {
                self.pd_cache(project, &file.sha256, &snapshot.contents[path])?;
            }
            state["publishAttempt"] =
                json!({"manifest":snapshot.manifest,"stamp":Self::pd_stamp(&snapshot)});
            self.pd_save(project, state)?;
        }
        self.pd_publish_pending(project, root, state, &objects, &publications)?;
        state["eventCursor"] = next_cursor;
        self.pd_save(project, state)?;
        if !state["lastSyncedAt"].is_null() {
            Self::pd_clear_markers(&dirty_before)?;
        }
        Ok(())
    }
    fn pd_publish_pending(
        &self,
        project: &str,
        root: &Path,
        state: &mut Value,
        objects: &str,
        publications: &str,
    ) -> Result<(), String> {
        let manifest: Manifest =
            serde_json::from_value(state["publishAttempt"]["manifest"].clone())
                .map_err(|_| "Preparación pendiente incompatible")?;
        let snapshot = self.pd_cached(project, &manifest, root)?;
        for (path, file) in &manifest.files {
            self.pd_put(
                state,
                &objects,
                &format!("{}.blob", file.sha256),
                &snapshot.contents[path],
            )?;
        }
        self.pd_put(
            state,
            &publications,
            &format!("{}.json", manifest.publication_id),
            &serde_json::to_vec(&manifest).map_err(|_| "Descriptor inválido")?,
        )?;
        // Publishing does not advance an existing shared base: two offline
        // writers must still conflict when they later see each other.
        for (path, file) in &manifest.files {
            if state["base"].get(path).is_none() {
                state["base"][path] = json!(file.sha256);
                state["basePublications"][path] = json!(manifest.publication_id);
            }
        }
        for path in &manifest.directories {
            if state["baseDirectories"].get(path).is_none() {
                state["baseDirectories"][path] = json!(true);
                state["baseDirectoryPublications"][path] = json!(manifest.publication_id);
                if let Some(stamp) = directory_stamp(root, path)? {
                    state["baseDirectoryStamps"][path] = json!(stamp);
                }
            }
        }
        state["seen"]
            .as_array_mut()
            .unwrap()
            .push(json!(manifest.publication_id));
        if state["manifestStamps"].is_null() {
            state["manifestStamps"] = json!({});
        }
        state["manifestStamps"][&manifest.publication_id] =
            json!(snapshots::manifest_hash(&manifest).map_err(|_| "Descriptor incompatible")?);
        state["causal"] = json!(manifest.publication_id);
        state["lastSentStamp"] = state["publishAttempt"]["stamp"].clone();
        state["publishAttempt"] = Value::Null;
        let now = snapshots::capture(root, &manifest.project_id, &id(), &manifest.sender_id, None)
            .map_err(|_| "No se pudo verificar el contenido actual")?;
        state["lastSyncedAt"] = if state["lastSentStamp"] == Self::pd_stamp(&now) {
            json!(knownext_core::now_iso())
        } else {
            Value::Null
        };
        state["verifiedCurrent"] = json!(!state["lastSyncedAt"].is_null());
        self.pd_save(project, state)
    }
    fn pd_changed_receive(
        &self,
        project: &str,
        state: &mut Value,
        manifest: &Manifest,
        path: &str,
        local: Option<String>,
        remote: Value,
        reason: &str,
    ) -> Result<(), String> {
        let key = format!("{}:{path}", manifest.publication_id);
        let mut row = json!({"id":sha256_hex(key.as_bytes()),"publicationId":manifest.publication_id,"path":path,"reason":reason,"localHash":local,"remoteHash":remote});
        row["revision"] = json!(hash(&row));
        state["conflicts"]
            .as_array_mut()
            .unwrap()
            .retain(|v| v["id"] != row["id"]);
        state["conflicts"].as_array_mut().unwrap().push(row);
        self.pd_save(project, state)
    }
    fn pd_removed_received_parent(
        &self,
        root: &Path,
        state: &Value,
        path: &str,
    ) -> Result<bool, String> {
        if let Some(rows) = state["receiveAttempt"]["directoryPlan"].as_array() {
            for row in rows {
                let parent = row["path"]
                    .as_str()
                    .ok_or("Carpeta del journal incompatible")?;
                if row["action"] == "create"
                    && path.starts_with(&format!("{parent}/"))
                    && state["receiveAttempt"]["directoriesCompleted"]
                        .as_array()
                        .is_some_and(|done| done.contains(&row["path"]))
                    && directory_stamp(root, parent)?.is_none()
                {
                    return Ok(true);
                }
            }
        }
        Ok(false)
    }
    fn pd_directory_plan(
        &self,
        project: &str,
        root: &Path,
        state: &mut Value,
        manifest: &Manifest,
    ) -> Result<(), String> {
        if !state["receiveAttempt"]["directoryPlan"].is_null() {
            return Ok(());
        }
        let paths = manifest
            .directories
            .iter()
            .chain(state["baseDirectories"].as_object().unwrap().keys())
            .chain(
                state["receiveAttempt"]["observedDirectoryBase"]
                    .as_object()
                    .into_iter()
                    .flat_map(|m| m.keys()),
            )
            .cloned()
            .collect::<BTreeSet<_>>();
        if paths.len() > snapshots::MAX_ENTRIES {
            return Err("El plan de carpetas supera el presupuesto; se conserva".into());
        }
        let mut rows = Vec::new();
        for path in paths {
            let stamp = directory_stamp(root, &path)?;
            let local = stamp.is_some();
            let remote = manifest.directories.contains(&path);
            let observed = state["receiveAttempt"]["observedDirectoryBase"].get(&path);
            let base = observed
                .map(|r| &r["present"])
                .unwrap_or(&state["baseDirectories"][&path])
                .as_bool();
            let causal = observed.is_some()
                || state["baseDirectoryPublications"][&path].is_null()
                || state["receiveAttempt"]["ancestors"]
                    .as_array()
                    .is_some_and(|a| a.contains(&state["baseDirectoryPublications"][&path]));
            let kind = match planner::directory(local, remote, base, causal) {
                planner::DirectoryDecision::Same => "same",
                planner::DirectoryDecision::Keep => "keep",
                planner::DirectoryDecision::Create => "create",
                // A shared path does not prove that the same local directory
                // still occupies it. Legacy bases have no identity proof.
                planner::DirectoryDecision::RemoveIfEmpty
                    if stamp.as_deref() == state["baseDirectoryStamps"][&path].as_str()
                        && directory_removal_verifiable(root, &path)? =>
                {
                    "remove-if-empty"
                }
                planner::DirectoryDecision::RemoveIfEmpty => "keep",
            };
            rows.push(json!({"path":path,"action":kind,"expectedStamp":stamp,"remote":remote}));
        }
        state["receiveAttempt"]["directoryPlan"] = json!(rows);
        state["receiveAttempt"]["directoriesCompleted"] = json!([]);
        state["receiveAttempt"]["keptDirectories"] = json!(false);
        self.pd_save(project, state)
    }
    fn pd_apply_directories(
        &self,
        project: &str,
        root: &Path,
        state: &mut Value,
        creates: bool,
    ) -> Result<(), String> {
        let mut rows = state["receiveAttempt"]["directoryPlan"]
            .as_array()
            .ok_or("Plan de carpetas incompatible")?
            .clone();
        // Children are removed first. Creations are shallow-first.
        rows.sort_by_key(|r| r["path"].as_str().unwrap().split('/').count());
        if !creates {
            rows.reverse();
        }
        for row in rows {
            let path = row["path"].as_str().ok_or("Carpeta incompatible")?;
            if state["receiveAttempt"]["directoriesCompleted"]
                .as_array()
                .unwrap()
                .contains(&json!(path))
            {
                continue;
            }
            let kind = row["action"]
                .as_str()
                .ok_or("Acción de carpeta incompatible")?;
            if creates != (kind == "create") {
                continue;
            }
            let stamp = directory_stamp(root, path)?;
            let destination = target(root, path)?;
            if kind == "create" {
                // An already-created regular directory is idempotent; never
                // replace a file or a user link at this path.
                if stamp.is_none() {
                    ensure(&destination)?;
                }
            } else if kind == "remove-if-empty" && stamp.is_some() {
                let empty = fs::read_dir(&destination)
                    .map_err(|_| "No se puede comprobar si la carpeta está vacía")?
                    .next()
                    .is_none();
                if json!(stamp) == row["expectedStamp"]
                    && json!(stamp) == state["baseDirectoryStamps"][path]
                    && directory_removal_verifiable(root, path)?
                    && empty
                {
                    match fs::remove_dir(&destination) {
                        Ok(()) => {}
                        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
                        Err(_)
                            if fs::read_dir(&destination).is_ok_and(|mut r| r.next().is_some()) =>
                        {
                            state["receiveAttempt"]["keptDirectories"] = json!(true);
                        }
                        Err(_) => {
                            return Err(
                                "No se pudo retirar la carpeta vacía; se conserva el journal"
                                    .into(),
                            )
                        }
                    }
                } else {
                    state["receiveAttempt"]["keptDirectories"] = json!(true);
                }
            } else if stamp.is_some() != row["remote"].as_bool().unwrap() {
                state["receiveAttempt"]["keptDirectories"] = json!(true);
            }
            state["receiveAttempt"]["directoriesCompleted"]
                .as_array_mut()
                .unwrap()
                .push(json!(path));
            self.pd_save(project, state)?;
        }
        Ok(())
    }
    fn pd_receive(
        &self,
        project: &str,
        root: &Path,
        state: &mut Value,
        manifest: &Manifest,
    ) -> Result<(), String> {
        let snapshot = self.pd_cached(project, manifest, root)?;
        let _transaction = self.project_transaction(project)?;
        // Rebuild only unfinished actions from current files/drafts. Completed
        // receipts and their cached backups remain immutable across a replan.
        {
            let completed = state["receiveAttempt"]["completed"]
                .as_array()
                .unwrap()
                .clone();
            let previous = state["receiveAttempt"]["plan"]
                .as_array()
                .cloned()
                .unwrap_or_default();
            let mut actions = previous
                .iter()
                .filter(|row| completed.contains(&row["path"]))
                .cloned()
                .collect::<Vec<_>>();
            if completed
                .iter()
                .any(|p| !actions.iter().any(|row| &row["path"] == p))
            {
                return Err(
                    "El journal contiene un acuse sin acción verificable; se conserva".into(),
                );
            }
            let mut conflicts = Vec::new();
            let paths = manifest
                .files
                .keys()
                .chain(state["base"].as_object().unwrap().keys())
                .cloned()
                .collect::<BTreeSet<_>>();
            // The parent must be observed, and a path's base publication must
            // be in the observed causal chain, never just a sender head or
            // the verified chain; unknown ancestry is preserved as conflict.
            for path in paths {
                if completed.contains(&json!(path)) {
                    continue;
                }
                let local = local_hash(root, &path)?;
                let remote = manifest.files.get(&path).map(|f| f.sha256.clone());
                let observed_base = state["receiveAttempt"]["observedBase"].get(&path);
                let base = observed_base
                    .map(|row| &row["sha256"])
                    .unwrap_or(&state["base"][&path])
                    .as_str()
                    .map(str::to_owned);
                let key = format!("{}:{path}", manifest.publication_id);
                let choice = &state["choices"][&key];
                let reviewed =
                    choice["localHash"] == json!(local) && choice["resolution"].is_string();
                let removed_parent = self.pd_removed_received_parent(root, state, &path)?;
                let draft = draft_store::read(
                    &self.app_data_dir.join("drafts"),
                    &format!("{project}::{path}"),
                )?
                .is_some();
                let causal = observed_base.is_some()
                    || state["basePublications"][&path].is_null()
                    || state["receiveAttempt"]["ancestors"]
                        .as_array()
                        .is_some_and(|list| {
                            list.iter().any(|v| v == &state["basePublications"][&path])
                        });
                let decision = if removed_parent && !reviewed {
                    planner::Decision::Conflict
                } else {
                    planner::decide(
                        local.as_deref(),
                        remote.as_deref(),
                        base.as_deref(),
                        causal,
                        draft,
                        if reviewed {
                            choice["resolution"].as_str()
                        } else {
                            None
                        },
                    )
                };
                let action = match decision {
                    planner::Decision::Same => "same",
                    planner::Decision::Keep => "keep",
                    planner::Decision::Write => "write",
                    planner::Decision::Delete => "delete",
                    planner::Decision::Both => "both",
                    planner::Decision::Conflict => "conflict",
                };
                if action == "conflict" {
                    let mut row = json!({"id":sha256_hex(key.as_bytes()),"publicationId":manifest.publication_id,"path":path,"reason":if draft{"El documento tiene un borrador abierto"}else if removed_parent{"Una carpeta creada por esta recepción fue retirada localmente; revisa antes de recrearla"}else{"Hay cambios concurrentes o una base no demostrada"},"localHash":local,"remoteHash":remote});
                    row["revision"] = json!(hash(&row));
                    conflicts.push(row);
                }
                if action != "conflict" {
                    actions.push(
                        json!({"path":path,"action":action,"expected":local,"remote":remote}),
                    );
                }
            }
            state["conflicts"] = json!(conflicts);
            state["receiveAttempt"]["plan"] = json!(actions);
            self.pd_save(project, state)?;
            if !state["conflicts"].as_array().unwrap().is_empty() {
                return Ok(());
            }
        }
        self.pd_directory_plan(project, root, state, manifest)?;
        self.pd_apply_directories(project, root, state, true)?;
        let actions = state["receiveAttempt"]["plan"]
            .as_array()
            .ok_or("Plan recibido incompatible")?
            .clone();
        for action in &actions {
            let path = action["path"]
                .as_str()
                .ok_or("Ruta recibida incompatible")?;
            if state["receiveAttempt"]["completed"]
                .as_array()
                .unwrap()
                .iter()
                .any(|v| v == path)
            {
                continue;
            }
            let current = local_hash(root, path)?;
            let desired = action["remote"].as_str();
            let kind = action["action"].as_str().ok_or("Acción incompatible")?;
            let reviewed = state["choices"][format!("{}:{path}", manifest.publication_id)]
                ["localHash"]
                == json!(current)
                && state["choices"][format!("{}:{path}", manifest.publication_id)]["resolution"]
                    .is_string();
            if matches!(kind, "write" | "both")
                && !reviewed
                && self.pd_removed_received_parent(root, state, path)?
            {
                return self.pd_changed_receive(
                    project,
                    state,
                    manifest,
                    path,
                    current,
                    action["remote"].clone(),
                    "La carpeta fue retirada durante la recepción; revisa antes de recrearla",
                );
            }
            if matches!(kind, "write" | "delete" | "both")
                && draft_store::read(
                    &self.app_data_dir.join("drafts"),
                    &format!("{project}::{path}"),
                )?
                .is_some()
            {
                return self.pd_changed_receive(
                    project,
                    state,
                    manifest,
                    path,
                    current,
                    action["remote"].clone(),
                    "Ha aparecido un borrador durante la recepción; revisa la comparación",
                );
            }
            if json!(current) != action["expected"] {
                if !(kind == "write" && current.as_deref() == desired
                    || kind == "delete" && current.is_none())
                {
                    return self.pd_changed_receive(
                        project,
                        state,
                        manifest,
                        path,
                        current,
                        action["remote"].clone(),
                        "El archivo cambió durante la recepción; compara las variantes actuales",
                    );
                }
            } else if matches!(kind, "write" | "delete" | "both") {
                let destination = target(root, path)?;
                if current.is_some() {
                    let previous = bytes(&destination, snapshots::MAX_FILE_BYTES)?;
                    self.pd_cache(project, &sha256_hex(&previous), &previous)?;
                }
                let checked = local_hash(root, path)?;
                if checked != current {
                    return self.pd_changed_receive(
                        project,
                        state,
                        manifest,
                        path,
                        checked,
                        action["remote"].clone(),
                        "El archivo cambió antes de aplicar; revisa la comparación",
                    );
                }
                match kind {
                    "write" => {
                        ensure(destination.parent().ok_or("Ruta no válida")?)?;
                        let data = snapshot
                            .contents
                            .get(path)
                            .ok_or("Contenido recibido ausente")?;
                        if current.is_none() {
                            atomic_io::create(&destination, data)
                        } else {
                            atomic_io::write(&destination, data)
                        }
                        .map_err(|_| "Recepción parcial; se conserva el intento")?;
                    }
                    "delete" => {
                        fs::remove_file(&destination)
                            .map_err(|_| "No se pudo completar el borrado revisado")?;
                    }
                    "both" => {
                        let copied = format!(
                            "{path}.proton-{}.received",
                            manifest.publication_id.chars().take(8).collect::<String>()
                        );
                        let destination = target(root, &copied)?;
                        ensure(destination.parent().ok_or("Ruta no válida")?)?;
                        let data = snapshot.contents.get(path).ok_or("Contenido ausente")?;
                        if destination.exists() {
                            if bytes(&destination, snapshots::MAX_FILE_BYTES)? != *data {
                                return Err("La copia en conflicto ya cambió; se conserva".into());
                            }
                        } else {
                            atomic_io::create(&destination, data)
                                .map_err(|_| "No se pudo conservar la variante recibida")?;
                        }
                    }
                    _ => {}
                }
            }
            state["receiveAttempt"]["completed"]
                .as_array_mut()
                .unwrap()
                .push(json!(path));
            self.pd_save(project, state)?;
        }
        self.pd_apply_directories(project, root, state, false)?;
        if let Some(rows) = state["receiveAttempt"]["directoryPlan"].as_array().cloned() {
            for row in rows {
                let present =
                    directory_stamp(root, row["path"].as_str().ok_or("Carpeta no válida")?)?
                        .is_some();
                if present != row["remote"].as_bool().unwrap() {
                    state["receiveAttempt"]["keptDirectories"] = json!(true);
                }
            }
        }
        let kept_directories = state["receiveAttempt"]["keptDirectories"] == true;
        let kept_local_changes =
            actions
                .iter()
                .try_fold(kept_directories, |kept, action| -> Result<bool, String> {
                    Ok(kept
                        || json!(local_hash(
                            root,
                            action["path"].as_str().ok_or("Ruta de journal inválida")?
                        )?) != action["remote"])
                })?;
        for action in actions {
            let path = action["path"].as_str().unwrap();
            if let Some(remote) = action["remote"].as_str() {
                state["base"][path] = json!(remote);
                state["basePublications"][path] = json!(manifest.publication_id);
            } else {
                state["base"].as_object_mut().unwrap().remove(path);
                // Absence is a causal tombstone too. Keep its publication so
                // an unrelated offline writer cannot silently resurrect it.
                state["basePublications"][path] = json!(manifest.publication_id);
            }
        }
        if let Some(rows) = state["receiveAttempt"]["directoryPlan"].as_array().cloned() {
            for row in rows {
                let path = row["path"]
                    .as_str()
                    .ok_or("Carpeta de journal incompatible")?;
                state["baseDirectories"][path] = row["remote"].clone();
                state["baseDirectoryPublications"][path] = json!(manifest.publication_id);
                // Persist only the identity that was actually present when a
                // positive shared base was acknowledged. Absence is a tombstone.
                if row["remote"] == true {
                    if let Some(stamp) = directory_stamp(root, path)? {
                        state["baseDirectoryStamps"][path] = json!(stamp);
                    } else {
                        state["baseDirectoryStamps"]
                            .as_object_mut()
                            .unwrap()
                            .remove(path);
                    }
                } else {
                    state["baseDirectoryStamps"]
                        .as_object_mut()
                        .unwrap()
                        .remove(path);
                }
            }
        }
        state["seen"]
            .as_array_mut()
            .unwrap()
            .push(json!(manifest.publication_id));
        state["heads"][&manifest.sender_id] = json!(manifest.publication_id);
        if state["manifestStamps"].is_null() {
            state["manifestStamps"] = json!({});
        }
        state["manifestStamps"][&manifest.publication_id] =
            json!(snapshots::manifest_hash(manifest).map_err(|_| "Descriptor incompatible")?);
        state["causal"] = json!(manifest.publication_id);
        // A reviewed local choice may preserve the exact previous bytes.
        // Publish them again as a descendant of this receipt so the other
        // replica can observe the resolution instead of the old concurrency.
        if kept_local_changes {
            state["lastSentStamp"] = Value::Null;
        }
        state["receiveAttempt"] = Value::Null;
        state["conflicts"] = json!([]);
        self.pd_save(project, state)
    }
    fn pd_resolve(
        &self,
        project: &str,
        root: &Path,
        state: &mut Value,
        payload: Value,
    ) -> Result<Value, String> {
        let conflict = state["conflicts"]
            .as_array()
            .unwrap()
            .iter()
            .find(|v| v["id"] == payload["conflictId"])
            .ok_or("Conflicto no disponible")?
            .clone();
        let path = conflict["path"].as_str().ok_or("Ruta no válida")?;
        if conflict["revision"] != payload["revision"]
            || conflict["localHash"] != json!(local_hash(root, path)?)
        {
            return Err("El conflicto cambió; revisa de nuevo".into());
        }
        let resolution = payload["resolution"]
            .as_str()
            .ok_or("Selecciona una resolución")?;
        if !["local", "remote", "both"].contains(&resolution) {
            return Err("Resolución no compatible".into());
        }
        let key = format!(
            "{}:{path}",
            conflict["publicationId"]
                .as_str()
                .ok_or("Identidad ausente")?
        );
        state["choices"][key] = json!({"resolution":resolution,"localHash":conflict["localHash"]});
        state["conflicts"]
            .as_array_mut()
            .unwrap()
            .retain(|v| v["id"] != payload["conflictId"]);
        self.pd_save(project, state)?;
        Ok(self.pd_status(project, state))
    }
}

#[cfg(test)]
mod admission_tests {
    use super::*;
    #[test]
    fn migration_ack_does_not_wait_for_the_network_gate() {
        let _busy = GATE.lock().unwrap();
        let temp = tempfile::tempdir().unwrap();
        let api = LocalApi::new(temp.path().to_path_buf(), "qa".into(), "test".into());
        let error = api
            .proton_direct("not-registered", "migration-ack", json!({}))
            .unwrap_err();
        assert_eq!(error, "Sincronización ocupada; consulta antes de confirmar");
    }
    #[test]
    fn switching_pause_is_correlated_without_overriding_a_later_explicit_policy() {
        let temp = tempfile::tempdir().unwrap();
        let api = LocalApi::new(temp.path().to_path_buf(), "qa".into(), "test".into());
        let mut state = json!({"projectId":"owned","generation":2,"paused":false,"lifecycle":{"migration":{"id":"migration-owned","phase":"switching","sourceEngine":{"projectId":"owned","generation":1},"switch":{"afterEngine":{"projectId":"owned","generation":2}}}}});
        let dir = api.pd_dir("owned");
        fs::create_dir_all(&dir).unwrap();
        let policy = json!({"schemaVersion":1,"generation":1,"paused":false});
        let raw = serde_json::to_vec(&policy).unwrap();
        fs::write(dir.join("policy.json"), &raw).unwrap();
        assert!(api.pd_paused("owned", &state).unwrap());
        assert_eq!(fs::read(dir.join("policy.json")).unwrap(), raw);
        state["lifecycle"]["migration"]["phase"] = json!("complete");
        assert!(!api.pd_paused("owned", &state).unwrap());
        fs::write(
            dir.join("policy.json"),
            serde_json::to_vec(&json!({"schemaVersion":1,"generation":3,"paused":false})).unwrap(),
        )
        .unwrap();
        assert!(api.pd_paused("owned", &state).is_err());
    }
}
