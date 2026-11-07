//! Optional local folder exchange. Receipts attest local hand-off, never cloud delivery.
use super::*;
use knownext_sync_folder::{self as exchange, Manifest};
use std::{fs, io::Read};
static GATE: std::sync::Mutex<()> = std::sync::Mutex::new(());
const LIMIT: u64 = 16 * 1024 * 1024;
fn digest(value: &Value) -> String {
    sha256_hex(&serde_json::to_vec(value).expect("JSON value"))
}
fn identifier() -> String {
    sha256_hex(knownext_core::compact_id("proton").as_bytes())
}
fn valid_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 128
        && id
            .bytes()
            .all(|v| v.is_ascii_alphanumeric() || b"_-".contains(&v))
}
fn regular(path: &Path) -> Result<(), String> {
    let m = fs::symlink_metadata(path).map_err(|_| "Carpeta no disponible")?;
    if !m.is_dir() || batch::linked(&m) {
        return Err("La carpeta no es un directorio regular".into());
    }
    Ok(())
}
fn ensure_directory(path: &Path) -> Result<(), String> {
    match fs::symlink_metadata(path) {
        Ok(_) => checked_folder(path).map(|_| ()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            let parent = path.parent().ok_or("Carpeta sin ancestro")?;
            ensure_directory(parent)?;
            match fs::create_dir(path) {
                Ok(()) => Ok(()),
                Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => regular(path),
                Err(_) => Err("No se pudo crear una carpeta regular".into()),
            }
        }
        Err(_) => Err("No se pudo verificar una carpeta".into()),
    }
}
fn read_json(path: &Path) -> Result<Option<Value>, String> {
    let m = match fs::symlink_metadata(path) {
        Ok(m) => m,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(_) => return Err("Estado de intercambio inaccesible".into()),
    };
    if !m.is_file() || batch::linked(&m) || m.len() > LIMIT {
        return Err("Estado de intercambio no regular o fuera de presupuesto".into());
    }
    let mut bytes = vec![];
    fs::File::open(path)
        .map_err(|_| "Estado inaccesible")?
        .take(LIMIT + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| "Lectura incompleta")?;
    if bytes.len() as u64 > LIMIT {
        return Err("Estado fuera de presupuesto".into());
    }
    serde_json::from_slice(&bytes)
        .map(Some)
        .map_err(|_| "Estado ilegible; se conserva".into())
}
fn same_or_nested(a: &Path, b: &Path) -> bool {
    let key = |p: &Path| {
        let v = p
            .to_string_lossy()
            .replace('\\', "/")
            .trim_end_matches('/')
            .to_string();
        if cfg!(windows) {
            let v = v.strip_prefix("//?/").unwrap_or(&v);
            if let Some(unc) = v.strip_prefix("UNC/") {
                format!("//{}", unc.to_lowercase())
            } else {
                v.to_lowercase()
            }
        } else {
            v
        }
    };
    let a = key(a);
    let b = key(b);
    a == b || a.starts_with(&(b.clone() + "/")) || b.starts_with(&(a + "/"))
}
fn checked_folder(path: &Path) -> Result<PathBuf, String> {
    if !path.is_absolute() {
        return Err("Selecciona una carpeta absoluta".into());
    }
    for p in path.ancestors() {
        regular(p)?
    }
    path.canonicalize()
        .map_err(|_| "Carpeta no verificable".into())
}
// Only the selected exchange may use non-redirecting Cloud Files placeholders.
// Project worktrees and private staging continue through checked_folder above.
fn checked_exchange_folder(path: &Path) -> Result<PathBuf, String> {
    if !path.is_absolute() {
        return Err("Selecciona una carpeta de intercambio absoluta".into());
    }
    exchange::regular_exchange_directory(path)
        .map_err(|_| "La carpeta de intercambio contiene un enlace o marcador no compatible")?;
    let canonical=path.canonicalize().map_err(|_| "Carpeta de intercambio no verificable")?;
    exchange::regular_exchange_directory(&canonical)
        .map_err(|_| "No se puede verificar la ubicación de intercambio")?;
    Ok(canonical)
}
fn exchange_stamp(path: &Path) -> Result<String, String> {
    checked_exchange_folder(path)?;
    let mut options=fs::OpenOptions::new();
    options.read(true);
    #[cfg(windows)] {
        use std::os::windows::fs::OpenOptionsExt;
        options.custom_flags(windows_sys::Win32::Storage::FileSystem::FILE_FLAG_BACKUP_SEMANTICS);
    }
    let handle=options.open(path).map_err(|_| "No se puede verificar la identidad de la carpeta de intercambio")?;
    let identity=local_file_identity::identity(&handle).map_err(|_| "La carpeta de intercambio no proporciona una identidad verificable")?;
    Ok(digest(&json!({"path":path,"identity":identity})))
}
pub(super) fn target_path(root: &Path, relative: &str) -> Result<PathBuf, String> {
    if relative.is_empty() || relative.contains(['\\', ':', '\0']) {
        return Err("Ruta recibida no compatible".into());
    }
    // Exclude coordination/private names before any metadata call.
    if relative.split('/').any(|name| name.starts_with('.') || matches!(name.to_ascii_lowercase().as_str(),"owner.lock"|"runtime-owner.lock"|"capture.lock")) {
        return Err("Ruta interna o de coordinación excluida".into());
    }
    let mut target = root.to_path_buf();
    let parts = relative.split('/').collect::<Vec<_>>();
    for (i, name) in parts.iter().enumerate() {
        if name.is_empty() || *name == "." || *name == ".." {
            return Err("Ruta recibida no segura".into());
        }
        target.push(name);
        match fs::symlink_metadata(&target) {
            Ok(m) if batch::linked(&m) || i + 1 < parts.len() && !m.is_dir() => {
                return Err("La ruta contiene enlaces o una carpeta incompatible".into())
            }
            Ok(_) => {}
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(_) => return Err("No se puede verificar el destino".into()),
        }
    }
    Ok(target)
}
fn manifest_value(m: &Manifest) -> Result<Value, String> {
    serde_json::to_value(m).map_err(|_| "Manifiesto incompatible".into())
}
fn source_stamp(m: &Manifest) -> Result<String, String> {
    Ok(digest(
        &json!({"files":m.files,"directories":m.directories,"exclusions":m.exclusions}),
    ))
}
fn ancestors(
    folder: &Path,
    logical: &str,
    manifest: &Manifest,
    wanted: &BTreeSet<String>,
) -> Result<BTreeSet<String>, String> {
    let mut ids = BTreeSet::new();
    if wanted.is_empty() {
        return Ok(ids);
    }
    let mut parent = manifest.parent_publication.clone();
    while let Some(id) = parent {
        if ids.len() >= 128 {
            break;
        }
        if !ids.insert(id.clone()) {
            return Err("La cadena recibida es circular; no se aplica".into());
        }
        let prior = exchange::inspect(folder, logical, &id).map_err(|_| {
            "Falta un antecedente de la publicación; espera a completar la transferencia"
        })?;
        if wanted.iter().all(|key| ids.contains(key)) {
            break;
        }
        parent = prior.parent_publication;
    }
    Ok(ids)
}
fn bounded_file(path: &Path, limit: u64) -> Result<Vec<u8>, String> {
    let m = fs::symlink_metadata(path).map_err(|_| "Archivo no disponible")?;
    if !m.is_file() || batch::linked(&m) || m.len() > limit {
        return Err("Archivo no regular o fuera de presupuesto".into());
    }
    let mut bytes = vec![];
    fs::File::open(path)
        .map_err(|_| "Archivo no disponible")?
        .take(limit + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| "Lectura incompleta")?;
    if bytes.len() as u64 > limit {
        return Err("Archivo fuera de presupuesto".into());
    }
    Ok(bytes)
}
fn verify_review(review: &Value, input: &Value) -> Result<(), String> {
    let id = input
        .get("id")
        .or_else(|| input.get("reviewId"))
        .and_then(Value::as_str)
        .ok_or("Falta identidad de revisión")?;
    if review["id"] != id || review["revision"] != input["revision"] {
        return Err("La revisión ya no está vigente".into());
    }
    let mut material = review.clone();
    let revision = material
        .as_object_mut()
        .and_then(|v| v.remove("revision"))
        .ok_or("Revisión no válida")?;
    if revision != digest(&material) {
        return Err("Revisión alterada; se conserva".into());
    }
    Ok(())
}
impl LocalApi {
    /// Atomic private metadata only; guards may call this while owning runtime
    /// mutation authority. Never acquire the exchange gate from such a guard.
    pub(super) fn proton_sync_is_connected(&self, id: &str) -> Result<bool, String> {
        Ok(!self.proton_state(id)?["binding"].is_null())
    }
    fn proton_directory(&self, id: &str) -> PathBuf {
        self.app_data_dir
            .join("proton-sync")
            .join(sha256_hex(id.as_bytes()))
    }
    fn proton_state(&self, id: &str) -> Result<Value, String> {
        let directory = self.proton_directory(id);
        for p in [directory.parent().unwrap(), directory.as_path()] {
            match fs::symlink_metadata(p) {
                Ok(m) if !m.is_dir() || batch::linked(&m) => {
                    return Err("El almacén privado de intercambio no es regular".into())
                }
                Err(e) if e.kind() != std::io::ErrorKind::NotFound => {
                    return Err("Almacén de intercambio inaccesible".into())
                }
                _ => {}
            }
        }
        let value=read_json(&directory.join("state.json"))?.unwrap_or_else(||json!({"schemaVersion":1,"projectId":id,"generation":0,"binding":null,"connectReview":null,"receiveReview":null,"publishAttempt":null,"receiveAttempt":null,"lastPublication":null,"causalPublication":null,"lastReceipt":null,"base":{},"basePublications":{},"remoteHeads":{},"seenPublications":[]}));
        if value["schemaVersion"] != 1
            || value["projectId"] != id
            || !value["generation"].is_u64()
            || !value["base"].is_object()
            || !value["basePublications"].is_object()
            || !value["remoteHeads"].is_object()
            || !value["seenPublications"].is_array()
        {
            return Err("Formato de intercambio no compatible; se conserva".into());
        }
        if value["base"].as_object().unwrap().len() > 10_000
            || value["base"].as_object().unwrap().values().any(|v| {
                v.as_str()
                    .is_none_or(|s| s.len() != 64 || !s.bytes().all(|b| b.is_ascii_hexdigit()))
            })
            || value["basePublications"]
                .as_object()
                .unwrap()
                .values()
                .chain(value["remoteHeads"].as_object().unwrap().values())
                .any(|v| v.as_str().is_none_or(|s| !valid_id(s)))
            || value["seenPublications"].as_array().unwrap().len() > 10_000
            || value["seenPublications"]
                .as_array()
                .unwrap()
                .iter()
                .any(|v| v.as_str().is_none_or(|s| !valid_id(s)))
        {
            return Err("Base de intercambio no compatible; se conserva".into());
        }
        if !value["binding"].is_null() {
            let b = &value["binding"];
            if b["folderPath"].as_str().is_none()
                || b["logicalProjectId"].as_str().is_none_or(|v| !valid_id(v))
                || b["deviceId"].as_str().is_none_or(|v| !valid_id(v))
                || b["generation"] != value["generation"]
            {
                return Err("Asociación de intercambio no compatible; se conserva".into());
            }
        }
        Ok(value)
    }
    fn proton_save(&self, id: &str, state: &Value) -> Result<(), String> {
        ensure_directory(&self.proton_directory(id))?;
        if serde_json::to_vec(state)
            .map_err(|_| "Estado no válido")?
            .len() as u64
            > LIMIT
        {
            return Err(
                "El inventario de intercambio supera su cupo; se conserva el estado previo".into(),
            );
        }
        self.write_json(&self.proton_directory(id).join("state.json"), state)
    }
    fn proton_project(&self, id: &str) -> Result<PathBuf, String> {
        if cfg!(target_os = "android") {
            return Err("El intercambio mediante carpeta Proton está disponible sólo en Windows en esta entrega".into());
        }
        let registry = self.registry_checked()?;
        let p = registry["projects"]
            .as_array()
            .and_then(|p| p.iter().find(|v| v["id"] == id))
            .ok_or("Proyecto no registrado")?;
        if p["syncMode"].as_str().is_some_and(is_github_sync_mode) {
            return Err("Pausa y revisa la asociación GitHub antes de usar el intercambio Proton; no se ha cambiado su configuración".into());
        }
        let root = self.project_root(id)?;
        checked_folder(&root)
    }
    fn proton_binding(
        &self,
        id: &str,
        state: &Value,
    ) -> Result<(PathBuf, PathBuf, String, String), String> {
        let root = self.proton_project(id)?;
        let b = &state["binding"];
        let folder = checked_exchange_folder(Path::new(
            b["folderPath"]
                .as_str()
                .ok_or("Primero conecta una carpeta de intercambio")?,
        ))?;
        if same_or_nested(&root, &folder) || same_or_nested(&self.app_data_dir, &folder) {
            return Err(
                "La carpeta de intercambio se solapa con documentos o datos privados".into(),
            );
        }
        Ok((
            root,
            folder,
            b["logicalProjectId"]
                .as_str()
                .ok_or("Proyecto lógico no válido")?
                .to_string(),
            b["deviceId"]
                .as_str()
                .ok_or("Dispositivo no válido")?
                .to_string(),
        ))
    }
    pub(super) fn proton_sync_status(&self, id: &str) -> Result<Value, String> {
        let _gate = GATE.lock().map_err(|_| "Intercambio ocupado")?;
        let root = self.project_root(id)?;
        checked_folder(&root)?;
        let state = self.proton_state(id)?;
        Ok(
            json!({"projectId":id,"connected":!state["binding"].is_null(),"binding":state["binding"],"generation":state["generation"],"state":if state["binding"].is_null(){"disconnected"}else{"local-exchange"},"detail":"Intercambio mediante carpeta local. KnowNext no confirma la entrega a Proton Drive ni instala su cliente.","lastPublication":state["lastPublication"],"lastReceipt":state["lastReceipt"],"activeReceive":state["receiveAttempt"],"receiveReview":state["receiveReview"],"activePublication":state["publishAttempt"],"remoteConfirmed":false}),
        )
    }
    pub(super) fn proton_sync_review(&self, id: &str, payload: Value) -> Result<Value, String> {
        let folder_path = payload["folderPath"]
            .as_str()
            .filter(|v| !v.is_empty() && v.len() < 32768)
            .ok_or("Selecciona una carpeta de intercambio")?;
        let _gate = GATE.lock().map_err(|_| "Intercambio ocupado")?;
        let root = self.proton_project(id)?;
        let folder = checked_exchange_folder(Path::new(folder_path))?;
        if same_or_nested(&root, &folder) || same_or_nested(&self.app_data_dir, &folder) {
            return Err(
                "Selecciona una carpeta separada del proyecto y del almacén privado".into(),
            );
        }
        let mut state = self.proton_state(id)?;
        if !state["binding"].is_null() {
            return Err(
                "Desconecta la asociación anterior antes de elegir otra; sus copias se conservarán"
                    .into(),
            );
        }
        let projects = exchange::discover_projects(&folder)
            .map_err(|_| "La carpeta está incompleta o no es un intercambio compatible")?;
        let logical = if let Some(explicit) = payload
            .get("logicalProjectId")
            .and_then(Value::as_str)
            .filter(|s| !s.is_empty())
        {
            explicit.to_owned()
        } else if projects.len() == 1 {
            projects[0].clone()
        } else if projects.len() > 1 {
            return Err("La carpeta contiene varios proyectos; indica el identificador del que quieres conectar".into());
        } else {
            identifier()
        };
        if !valid_id(&logical) {
            return Err("Identidad lógica no compatible".into());
        }
        if !projects.is_empty() && !projects.iter().any(|p| p == &logical) {
            return Err("La carpeta no corresponde al proyecto lógico indicado".into());
        }
        let snap = exchange::capture(&root, &logical, &identifier(), &identifier(), None)
            .map_err(|_| "No se puede preparar el inventario completo del proyecto")?;
        let mut review = json!({"id":identifier(),"projectId":id,"folderPath":folder,"logicalProjectId":logical,"canConnect":true,"blockers":[],"warnings":["La entrega en esta carpeta no acredita subida a Proton Drive.","Git, borradores y credenciales permanecen locales. Las exclusiones del inventario se muestran sin transferirlas."],"summary":{"files":snap.manifest.files.len(),"directories":snap.manifest.directories.len(),"exclusions":snap.manifest.exclusions,"bytes":snap.manifest.files.values().map(|f|f.bytes).sum::<u64>()},"sourceStamp":source_stamp(&snap.manifest)?,"folderStamp":exchange_stamp(&folder)?,"registryStamp":digest(&self.registry_checked()?),"generation":state["generation"]});
        review["revision"] = json!(digest(&review));
        state["connectReview"] = review.clone();
        self.proton_save(id, &state)?;
        Ok(review)
    }
    pub(super) fn proton_sync_connect(&self, id: &str, payload: Value) -> Result<Value, String> {
        let _gate = GATE.lock().map_err(|_| "Intercambio ocupado")?;
        let root = self.proton_project(id)?;
        let mut state = self.proton_state(id)?;
        let review = state["connectReview"].clone();
        verify_review(&review, &payload)?;
        if review["canConnect"] != true
            || review["generation"] != state["generation"]
            || review["registryStamp"] != digest(&self.registry_checked()?)
        {
            return Err("La asociación cambió; revisa de nuevo".into());
        }
        let folder = checked_exchange_folder(Path::new(
            review["folderPath"].as_str().ok_or("Carpeta no válida")?,
        ))?;
        if same_or_nested(&root, &folder)
            || same_or_nested(&self.app_data_dir, &folder)
            || review["folderStamp"] != exchange_stamp(&folder)?
        {
            return Err("La carpeta de intercambio cambió; revisa de nuevo".into());
        }
        let logical = review["logicalProjectId"]
            .as_str()
            .ok_or("Identidad lógica no válida")?;
        let projects = exchange::discover_projects(&folder)
            .map_err(|_| "El contenido de intercambio cambió o todavía está incompleto; revisa de nuevo")?;
        if !projects.is_empty() && !projects.iter().any(|project| project == logical) {
            return Err("El proyecto compartido de la carpeta cambió; revisa de nuevo".into());
        }
        let snap = exchange::capture(&root, logical, &identifier(), &identifier(), None)
            .map_err(|_| "No se puede verificar el proyecto")?;
        if review["sourceStamp"] != source_stamp(&snap.manifest)? {
            return Err("Los archivos locales cambiaron; revisa de nuevo".into());
        }
        let _transaction = self.project_transaction(id)?;
        if self
            .project_root(id)?
            .canonicalize()
            .map_err(|_| "Ubicación no disponible")?
            != root
            || review["registryStamp"] != digest(&self.registry_checked()?)
        {
            return Err("La asociación del proyecto cambió durante la preparación".into());
        }
        let generation = state["generation"]
            .as_u64()
            .unwrap()
            .checked_add(1)
            .ok_or("Generación agotada")?;
        state["generation"] = json!(generation);
        state["binding"] = json!({"folderPath":folder,"logicalProjectId":logical,"deviceId":identifier(),"generation":generation});
        state["connectReview"] = Value::Null;
        state["base"] = json!({});
        state["basePublications"] = json!({});
        state["causalPublication"] = Value::Null;
        state["remoteHeads"] = json!({});
        state["seenPublications"] = json!([]);
        let receipt = json!({"projectId":id,"status":"connected-local","binding":state["binding"],"remoteConfirmed":false,"updatedAt":knownext_core::now_iso()});
        state["lastReceipt"] = receipt.clone();
        self.proton_save(id, &state)?;
        Ok(receipt)
    }
    pub(super) fn proton_sync_publish(&self, id: &str) -> Result<Value, String> {
        let _gate = GATE.lock().map_err(|_| "Intercambio ocupado")?;
        // Keep project structure stable while capturing without excluding
        // ordinary document writers or holding the global editor mutex.
        let _source = self.project_write(id)?;
        let mut state = self.proton_state(id)?;
        let (root, folder, logical, device) = self.proton_binding(id, &state)?;
        let snapshot = if state["publishAttempt"].is_null() {
            let publication = identifier();
            let snap = exchange::capture(
                &root,
                &logical,
                &publication,
                &device,
                state["causalPublication"].as_str(),
            )
            .map_err(|_| "No se pudo capturar el contenido guardado")?;
            let staged = self.proton_directory(id).join("outbox").join(&publication);
            ensure_directory(&staged)?;
            for (path, content) in &snap.contents {
                let dest = target_path(&staged, path)?;
                if let Some(parent) = dest.parent() {
                    ensure_directory(parent)?;
                }
                atomic_io::create(&dest, content)
                    .map_err(|_| "No se pudo preparar una copia durable")?;
            }
            state["publishAttempt"] = json!({"publicationId":publication,"manifest":manifest_value(&snap.manifest)?,"status":"prepared"});
            self.proton_save(id, &state)?;
            snap
        } else {
            let manifest: Manifest =
                serde_json::from_value(state["publishAttempt"]["manifest"].clone())
                    .map_err(|_| "Intento pendiente no compatible; se conserva")?;
            exchange::validate_manifest(&manifest)
                .map_err(|_| "Intento preparado no compatible")?;
            let staged = self
                .proton_directory(id)
                .join("outbox")
                .join(&manifest.publication_id);
            checked_folder(&staged)?;
            let mut contents = BTreeMap::new();
            for (path, entry) in &manifest.files {
                let bytes = bounded_file(&target_path(&staged, path)?, exchange::MAX_FILE_BYTES)?;
                if bytes.len() as u64 != entry.bytes || sha256_hex(&bytes) != entry.sha256 {
                    return Err("La copia preparada cambió; se conserva sin reenviar".into());
                }
                contents.insert(path.clone(), bytes);
            }
            exchange::restore_snapshot(manifest, contents, &root)
                .map_err(|_| "La copia preparada no es verificable")?
        };
        exchange::publish(&folder,&snapshot).map_err(|_|"No se confirmó el depósito local. El intento conserva su identidad; consulta el estado antes de reintentarlo")?;
        let receipt = json!({"projectId":id,"status":"handed-off","publicationId":snapshot.manifest.publication_id,"files":snapshot.manifest.files.len(),"bytes":snapshot.manifest.files.values().map(|f|f.bytes).sum::<u64>(),"remoteConfirmed":false,"updatedAt":knownext_core::now_iso()});
        // Only first shared content establishes a base. Later publications
        // cannot acknowledge local edits on behalf of another replica.
        for (path, file) in &snapshot.manifest.files {
            if state["base"].get(path).is_none() {
                state["base"][path] = json!(file.sha256);
                state["basePublications"][path] = json!(snapshot.manifest.publication_id);
            }
        }
        state["lastPublication"] = json!(snapshot.manifest.publication_id);
        state["causalPublication"] = json!(snapshot.manifest.publication_id);
        state["publishAttempt"] = Value::Null;
        state["lastReceipt"] = receipt.clone();
        self.proton_save(id, &state)?;
        Ok(receipt)
    }
    pub(super) fn proton_sync_inbox(&self, id: &str) -> Result<Value, String> {
        let _gate = GATE.lock().map_err(|_| "Intercambio ocupado")?;
        let state = self.proton_state(id)?;
        let (_, folder, logical, device) = self.proton_binding(id, &state)?;
        let manifests = exchange::list(&folder, &logical)
            .map_err(|_| "No se pudo completar el inventario de publicaciones")?;
        Ok(
            json!({"projectId":id,"items":manifests.into_iter().filter(|m|m.sender_id!=device&&!state["seenPublications"].as_array().unwrap().iter().any(|p|p.as_str()==Some(m.publication_id.as_str()))).collect::<Vec<_>>(),"remoteConfirmed":false}),
        )
    }
    fn proton_receive_plan(
        &self,
        id: &str,
        state: &Value,
        publication: &str,
    ) -> Result<(Manifest, BTreeMap<String, Vec<u8>>, Value), String> {
        if !valid_id(publication) {
            return Err("Publicación no válida".into());
        }
        let (root, folder, logical, _) = self.proton_binding(id, state)?;
        let manifest = exchange::inspect(&folder, &logical, publication)
            .map_err(|_| "No se puede verificar la publicación recibida")?;
        if manifest.sender_id == state["binding"]["deviceId"].as_str().unwrap_or("") {
            return Err("No se reciben publicaciones propias como cambios remotos".into());
        }
        let contents = exchange::read_verified(&folder, &manifest)
            .map_err(|_| "La publicación está incompleta o alterada")?;
        let mut wanted = state["basePublications"]
            .as_object()
            .unwrap()
            .values()
            .filter_map(Value::as_str)
            .map(str::to_string)
            .collect::<BTreeSet<_>>();
        wanted.extend(
            state["remoteHeads"]
                .as_object()
                .unwrap()
                .values()
                .filter_map(Value::as_str)
                .map(str::to_string),
        );
        let ancestors = ancestors(&folder, &logical, &manifest, &wanted)?;
        if let Some(head) = state["remoteHeads"][&manifest.sender_id].as_str() {
            if head != publication && !ancestors.contains(head) {
                return Err("La publicación no continúa el punto recibido; revisa primero su antecedente para evitar aplicar una versión antigua".into());
            }
        }
        let mut additions = vec![];
        let mut updates = vec![];
        let mut identical = vec![];
        let mut keep_local = vec![];
        let mut conflicts = vec![];
        let mut local_hashes = BTreeMap::new();
        for directory in &manifest.directories {
            let path = target_path(&root, directory)?;
            if let Ok(m) = fs::symlink_metadata(path) {
                if !m.is_dir() || batch::linked(&m) {
                    conflicts.push(format!("{directory}/"));
                }
            }
        }
        for (path, bytes) in &contents {
            let target = target_path(&root, path)?;
            let doc_id = format!("{id}::{path}");
            if draft_store::read(&self.app_data_dir.join("drafts"), &doc_id)?.is_some() {
                conflicts.push(path.clone());
                continue;
            }
            match fs::symlink_metadata(&target) {
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                    if state["base"].get(path).is_some() {
                        conflicts.push(path.clone())
                    } else {
                        additions.push(path.clone())
                    }
                }
                Ok(m) if m.is_file() && !batch::linked(&m) => {
                    let local = bounded_file(&target, exchange::MAX_FILE_BYTES)?;
                    let local_hash = sha256_hex(&local);
                    let remote_hash = sha256_hex(bytes);
                    local_hashes.insert(path.clone(), local_hash.clone());
                    if local == *bytes {
                        identical.push(path.clone())
                    } else if state["base"][path] == local_hash
                        && state["basePublications"][path]
                            .as_str()
                            .is_some_and(|p| ancestors.contains(p))
                    {
                        updates.push(path.clone())
                    } else if state["base"][path] == remote_hash {
                        keep_local.push(path.clone())
                    } else {
                        conflicts.push(path.clone())
                    }
                }
                Ok(_) => conflicts.push(path.clone()),
                Err(_) => return Err("No se puede revisar el destino completo".into()),
            }
        }
        let deletions = state["base"]
            .as_object()
            .ok_or("Base de sincronización no compatible")?
            .keys()
            .filter(|path| !manifest.files.contains_key(*path))
            .cloned()
            .collect::<Vec<_>>();
        let plan = json!({"additions":additions,"updates":updates,"identical":identical,"keepLocal":keep_local,"conflicts":conflicts,"pendingDeletions":deletions,"localHashes":local_hashes,"manifestStamp":digest(&manifest_value(&manifest)?),"baseStamp":digest(&json!({"base":state["base"],"publications":state["basePublications"]})),"generation":state["generation"],"root":root});
        Ok((manifest, contents, plan))
    }
    pub(super) fn proton_sync_receive_review(
        &self,
        id: &str,
        payload: Value,
    ) -> Result<Value, String> {
        let publication = payload["publicationId"]
            .as_str()
            .ok_or("Selecciona una publicación")?;
        let _gate = GATE.lock().map_err(|_| "Intercambio ocupado")?;
        let mut state = self.proton_state(id)?;
        if !state["receiveAttempt"].is_null() {
            return Err(
                "Hay una recepción parcial pendiente de revisión; no se repite automáticamente"
                    .into(),
            );
        }
        let (_, _, plan) = self.proton_receive_plan(id, &state, publication)?;
        let mut review = json!({"id":identifier(),"projectId":id,"publicationId":publication,"canApply":plan["conflicts"].as_array().unwrap().is_empty()&&plan["pendingDeletions"].as_array().unwrap().is_empty(),"additions":plan["additions"],"updates":plan["updates"],"identical":plan["identical"],"keepLocal":plan["keepLocal"],"conflicts":plan["conflicts"],"pendingDeletions":plan["pendingDeletions"],"warnings":["Se añaden archivos nuevos y se actualizan sólo los que coinciden con su base conocida. Cada actualización conserva copia previa privada.","Los borrados y renombrados requieren revisión; no se propagan automáticamente. Los cambios recibidos no crean commits Git ni reanudan trabajos."],"planStamp":digest(&plan),"generation":state["generation"]});
        review["revision"] = json!(digest(&review));
        state["receiveReview"] = review.clone();
        self.proton_save(id, &state)?;
        Ok(review)
    }
    pub(super) fn proton_sync_receive_apply(
        &self,
        id: &str,
        payload: Value,
    ) -> Result<Value, String> {
        let _gate = GATE.lock().map_err(|_| "Intercambio ocupado")?;
        let mut state = self.proton_state(id)?;
        if state["lastReceipt"]["status"] == "received-local"
            && payload
                .get("id")
                .or_else(|| payload.get("reviewId"))
                .is_some_and(|v| v == &state["lastReceipt"]["reviewId"])
            && payload["revision"] == state["lastReceipt"]["revision"]
        {
            return Ok(state["lastReceipt"].clone());
        }
        let review = state["receiveReview"].clone();
        verify_review(&review, &payload)?;
        if review["canApply"] != true || !state["receiveAttempt"].is_null() {
            return Err(
                "La recepción tiene conflictos o un resultado pendiente de consulta".into(),
            );
        }
        let publication = review["publicationId"]
            .as_str()
            .ok_or("Publicación no válida")?;
        let (manifest, contents, plan) = self.proton_receive_plan(id, &state, publication)?;
        if review["planStamp"] != digest(&plan) {
            return Err("El destino cambió desde la revisión; revisa de nuevo".into());
        }
        // Material is already verified in memory; only local publication is reserved.
        let _transaction = self.project_transaction(id)?;
        let (root, _, _, _) = self.proton_binding(id, &state)?;
        for path in plan["additions"].as_array().unwrap() {
            let p = path.as_str().unwrap();
            if fs::symlink_metadata(target_path(&root, p)?).is_ok()
                || draft_store::read(&self.app_data_dir.join("drafts"), &format!("{id}::{p}"))?
                    .is_some()
            {
                return Err("El destino cambió; no se aplica la revisión anterior".into());
            }
        }
        for path in plan["updates"].as_array().unwrap() {
            let p = path.as_str().unwrap();
            let current = bounded_file(&target_path(&root, p)?, exchange::MAX_FILE_BYTES)?;
            if plan["localHashes"][p] != sha256_hex(&current)
                || draft_store::read(&self.app_data_dir.join("drafts"), &format!("{id}::{p}"))?
                    .is_some()
            {
                return Err("El documento cambió; no se sustituye la revisión anterior".into());
            }
        }
        state["receiveAttempt"] = json!({"publicationId":publication,"reviewId":review["id"],"status":"applying","added":[],"updated":[]});
        self.proton_save(id, &state)?;
        for directory in &manifest.directories {
            ensure_directory(&target_path(&root, directory)?)?;
        }
        let mut added = vec![];
        for path in plan["additions"].as_array().unwrap() {
            let p = path.as_str().unwrap();
            let dest = target_path(&root, p)?;
            if let Some(parent) = dest.parent() {
                ensure_directory(parent)?;
            }
            atomic_io::create(
                &dest,
                contents.get(p).ok_or("Contenido recibido no disponible")?,
            )
            .map_err(|_| "Recepción parcial: no se reemplazó el destino; consulta el estado")?;
            added.push(p.to_string());
            state["receiveAttempt"]["added"] = json!(added);
            self.proton_save(id, &state)?;
        }
        let mut updated = vec![];
        for path in plan["updates"].as_array().unwrap() {
            let p = path.as_str().unwrap();
            let dest = target_path(&root, p)?;
            let previous = bounded_file(&dest, exchange::MAX_FILE_BYTES)?;
            if plan["localHashes"][p] != sha256_hex(&previous) {
                return Err(
                    "Recepción parcial: el archivo cambió antes de publicar; se conserva".into(),
                );
            }
            let recovery = self.proton_directory(id).join("recovery").join(publication);
            ensure_directory(&recovery)?;
            let copy = target_path(&recovery, p)?;
            ensure_directory(copy.parent().unwrap())?;
            atomic_io::create(&copy, &previous)
                .map_err(|_| "No se pudo conservar una copia anterior exclusiva")?;
            if bounded_file(&dest, exchange::MAX_FILE_BYTES)? != previous {
                return Err(
                    "Recepción parcial: el original cambió tras preparar su copia; se conserva"
                        .into(),
                );
            }
            atomic_io::write(&dest, contents.get(p).ok_or("Contenido no disponible")?).map_err(
                |_| "Recepción parcial: no se completó la actualización; consulta el estado",
            )?;
            updated.push(p.to_string());
            state["receiveAttempt"]["updated"] = json!(updated);
            self.proton_save(id, &state)?;
        }
        for (path, file) in &manifest.files {
            if !plan["keepLocal"]
                .as_array()
                .unwrap()
                .iter()
                .any(|p| p.as_str() == Some(path.as_str()))
            {
                state["base"][path] = json!(file.sha256);
                state["basePublications"][path] = json!(publication);
            }
        }
        state["remoteHeads"][&manifest.sender_id] = json!(publication);
        state["causalPublication"] = json!(publication);
        if !state["seenPublications"]
            .as_array()
            .unwrap()
            .iter()
            .any(|p| p.as_str() == Some(publication))
        {
            state["seenPublications"]
                .as_array_mut()
                .unwrap()
                .push(json!(publication));
        }
        let receipt = json!({"projectId":id,"status":"received-local","publicationId":publication,"reviewId":review["id"],"revision":review["revision"],"added":added,"updated":updated,"directories":manifest.directories,"remoteConfirmed":false,"updatedAt":knownext_core::now_iso()});
        state["receiveAttempt"] = Value::Null;
        state["receiveReview"] = Value::Null;
        state["lastReceipt"] = receipt.clone();
        self.proton_save(id, &state)?;
        Ok(receipt)
    }
    pub(super) fn proton_sync_disconnect(&self, id: &str, payload: Value) -> Result<Value, String> {
        let _gate = GATE.lock().map_err(|_| "Intercambio ocupado")?;
        self.proton_project(id)?;
        let mut state = self.proton_state(id)?;
        if payload["generation"] != state["generation"]
            || !state["receiveAttempt"].is_null()
            || !state["publishAttempt"].is_null()
        {
            return Err(
                "La asociación cambió o tiene una transferencia pendiente; consulta el estado"
                    .into(),
            );
        }
        let _transaction = self.project_transaction(id)?;
        state["generation"] = json!(state["generation"]
            .as_u64()
            .unwrap()
            .checked_add(1)
            .ok_or("Generación agotada")?);
        state["binding"] = Value::Null;
        state["connectReview"] = Value::Null;
        state["receiveReview"] = Value::Null;
        let receipt = json!({"projectId":id,"status":"disconnected-local","documentsPreserved":true,"remoteConfirmed":false,"updatedAt":knownext_core::now_iso()});
        state["lastReceipt"] = receipt.clone();
        self.proton_save(id, &state)?;
        Ok(receipt)
    }
}
