//! Critical application state. Failed reads must never become writable defaults.
use super::*;
use std::{fs, io::Read};

const MAX_BYTES: u64 = 8 * 1024 * 1024;

#[derive(Clone, Copy)]
pub(crate) enum Store {
    Config,
    Export,
    Projects,
}

impl Store {
    fn id(self) -> &'static str {
        match self {
            Self::Config => "config",
            Self::Export => "export",
            Self::Projects => "projects",
        }
    }
    fn filename(self) -> &'static str {
        match self {
            Self::Config => "config.json",
            Self::Export => "export-template.json",
            Self::Projects => "projects.json",
        }
    }
    fn label(self) -> &'static str {
        match self {
            Self::Config => "Preferencias e IA",
            Self::Export => "Plantilla de exportación",
            Self::Projects => "Registro de proyectos",
        }
    }
    fn default(self) -> Value {
        match self {
            Self::Config => default_config(),
            Self::Export => default_export_template(),
            Self::Projects => json!({"schemaVersion":2,"activeProjectId":null,"projects":[]}),
        }
    }
    fn parse(id: &str) -> Result<Self, String> {
        match id {
            "config" => Ok(Self::Config),
            "export" => Ok(Self::Export),
            "projects" => Ok(Self::Projects),
            _ => Err("Estado local desconocido".into()),
        }
    }
    fn validate(self, value: &Value) -> Result<(), &'static str> {
        if !value.is_object() {
            return Err("La raíz del archivo no es un objeto JSON");
        }
        let maximum = if matches!(self, Self::Config) { 3 } else { 2 };
        if let Some(version) = value.get("schemaVersion") {
            match version.as_u64() {
                Some(v) if v >= 1 && v <= maximum => (),
                _ => return Err("Versión de estado no compatible; se conserva para su revisión"),
            }
        }
        let fields: &[&str] = match self {
            Self::Config => &[
                "layout",
                "appearance",
                "diagnostics",
                "handwritten",
                "ai",
                "tabsByProject",
                "treeOpenPathsByProject",
            ],
            Self::Export => &[
                "page",
                "normal",
                "headings",
                "code",
                "paragraph",
                "document",
            ],
            Self::Projects => &[],
        };
        if fields
            .iter()
            .any(|key| value.get(*key).is_some_and(|v| !v.is_object()))
        {
            return Err("La estructura del estado local no es compatible");
        }
        if matches!(self, Self::Config) {
            for key in [
                "permissions",
                "rag",
                "vision",
                "imageGeneration",
                "agentic",
                "transcription",
                "diagrams",
                "handwrittenDrawing",
            ] {
                if value["ai"].get(key).is_some_and(|v| !v.is_object()) {
                    return Err("La configuración de IA no tiene una estructura compatible");
                }
            }
        }
        if matches!(self, Self::Projects) {
            let projects = value["projects"]
                .as_array()
                .ok_or("El registro no contiene una lista de proyectos")?;
            let mut ids = BTreeSet::new();
            for project in projects {
                let id = project["id"]
                    .as_str()
                    .filter(|id| !id.is_empty())
                    .ok_or("El registro contiene una identidad de proyecto no válida")?;
                if !ids.insert(id)
                    || project["folderPath"]
                        .as_str()
                        .filter(|path| !path.is_empty())
                        .is_none()
                {
                    return Err("El registro contiene proyectos duplicados o rutas no válidas");
                }
            }
        }
        Ok(())
    }
}

fn directory(path: &Path) -> Result<(), String> {
    let metadata =
        fs::symlink_metadata(path).map_err(|_| "No se puede acceder al almacén de estado local")?;
    if !metadata.is_dir() || batch::linked(&metadata) {
        return Err("El almacén de estado local debe ser una carpeta regular".into());
    }
    Ok(())
}

fn bytes(root: &Path, store: Store) -> Result<Option<Vec<u8>>, String> {
    directory(root)?;
    let path = root.join(store.filename());
    let metadata = match fs::symlink_metadata(&path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(_) => return Err("No se puede consultar el archivo de estado local".into()),
    };
    if !metadata.is_file() || batch::linked(&metadata) {
        return Err("El estado local no es un archivo regular; se conserva sin cambios".into());
    }
    if metadata.len() > MAX_BYTES {
        return Err(
            "El estado local supera el límite de revisión de 8 MiB; se conserva sin cambios".into(),
        );
    }
    let mut content = Vec::new();
    fs::File::open(path)
        .map_err(|_| "No se puede leer el estado local; comprueba sus permisos")?
        .take(MAX_BYTES + 1)
        .read_to_end(&mut content)
        .map_err(|_| "No se pudo completar la lectura del estado local")?;
    if content.len() as u64 > MAX_BYTES {
        return Err("El estado local creció durante la revisión; se conserva sin cambios".into());
    }
    Ok(Some(content))
}

pub(crate) fn decode(store: Store, bytes: &[u8]) -> Result<Value, String> {
    let value: Value = serde_json::from_slice(bytes).map_err(|_| {
        "El estado local no contiene JSON válido; el original se conserva".to_string()
    })?;
    store.validate(&value).map_err(str::to_string)?;
    Ok(value)
}

pub(crate) fn read(root: &Path, store: Store) -> Result<Value, String> {
    bytes(root, store)?
        .map_or_else(|| Ok(store.default()), |bytes| decode(store, &bytes))
        .map_err(|error| format!("{}: {error}", store.label()))
}

/// Only critical filenames in the private root are guarded here, not project data.
pub(crate) fn before_write(root: &Path, path: &Path, value: &Value) -> Result<(), String> {
    for store in [Store::Config, Store::Export, Store::Projects] {
        if path == root.join(store.filename()) {
            read(root, store)?;
            store.validate(value).map_err(str::to_string)?;
            let length = serde_json::to_vec_pretty(value)
                .map_err(|_| "No se pudo preparar el estado local")?
                .len();
            if length as u64 > MAX_BYTES {
                return Err("El estado local supera el límite de 8 MiB; no se ha escrito".into());
            }
        }
    }
    Ok(())
}

pub(crate) fn inventory(root: &Path) -> Value {
    let entries: Vec<Value> = [Store::Config, Store::Export, Store::Projects].into_iter().map(|store| {
        let mut item = json!({"id":store.id(),"name":store.label(),"filename":store.filename(),"status":"healthy","message":null,"fingerprint":null,"canReset":false});
        match bytes(root, store) {
            Ok(None) => item["status"] = json!("missing"),
            Ok(Some(content)) => {
                item["fingerprint"] = json!(sha256_hex(&content));
                if let Err(error) = decode(store, &content) {
                    item["status"] = json!("invalid"); item["message"] = json!(error);
                    // Future versions must be opened by their owning app, never downgraded.
                    let future = serde_json::from_slice::<Value>(&content).ok().and_then(|v|v["schemaVersion"].as_u64()).is_some_and(|v|v > if matches!(store,Store::Config){3}else{2});
                    item["canReset"] = json!(!future && !matches!(store,Store::Projects));
                }
            }
            Err(error) => { item["status"] = json!("unavailable"); item["message"] = json!(error); }
        }
        item
    }).collect();
    json!({"entries":entries,"checkedAt":knownext_core::now_iso(),"maxFileBytes":MAX_BYTES})
}

pub(crate) fn reset(root: &Path, id: &str, body: &Value) -> Result<Value, String> {
    let store = Store::parse(id)?;
    if matches!(store, Store::Projects) {
        return Err("El registro se conserva. Revisa el archivo original; no se vacían proyectos desde esta acción".into());
    }
    let expected = body["fingerprint"]
        .as_str()
        .filter(|hash| hash.len() == 64 && hash.bytes().all(|b| b.is_ascii_hexdigit()))
        .ok_or("Actualiza y revisa el estado antes de restablecerlo")?;
    let original = bytes(root, store)?.ok_or("El estado ya no existe; actualiza la revisión")?;
    if sha256_hex(&original) != expected {
        return Err(
            "El estado cambió desde la revisión. Actualiza antes de decidir; no se ha reemplazado"
                .into(),
        );
    }
    if decode(store, &original).is_ok() {
        return Err(
            "El estado es válido. Utiliza los ajustes normales; no se ha reemplazado".into(),
        );
    }
    if !inventory(root)["entries"]
        .as_array()
        .unwrap()
        .iter()
        .any(|v| v["id"] == id && v["canReset"] == true)
    {
        return Err("Este estado no se puede restablecer desde esta revisión".into());
    }
    let archive_root = root.join("state-recovery");
    match fs::symlink_metadata(&archive_root) {
        Ok(_) => directory(&archive_root)?,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => fs::create_dir(&archive_root)
            .map_err(|_| {
                "No se pudo crear la carpeta de conservación; no se ha reemplazado el estado"
            })?,
        Err(_) => return Err("No se puede consultar la carpeta de conservación".into()),
    }
    let archive_id = knownext_core::compact_id("state");
    let folder = archive_root.join(&archive_id);
    fs::create_dir(&folder).map_err(|_| "No se pudo preparar la copia de conservación")?;
    let copy = folder.join(store.filename());
    atomic_io::create(&copy, &original)
        .map_err(|_| "No se pudo conservar el original; no se ha reemplazado el estado")?;
    let saved = fs::read(&copy)
        .map_err(|_| "No se pudo comprobar la copia; no se ha reemplazado el estado")?;
    if saved != original {
        return Err("La copia no coincide con el original; no se ha reemplazado el estado".into());
    }
    let manifest = json!({"id":archive_id,"store":store.id(),"filename":store.filename(),"sha256":expected,"size":original.len(),"createdAt":knownext_core::now_iso(),"retention":"manual"});
    atomic_io::create(
        &folder.join("manifest.json"),
        &serde_json::to_vec_pretty(&manifest).map_err(|e| e.to_string())?,
    )
    .map_err(|_| "No se pudo registrar la copia; no se ha reemplazado el estado")?;
    // Recheck after preservation. This is not a cross-process compare-and-swap.
    if bytes(root, store)?.as_deref() != Some(original.as_slice()) {
        return Err("El estado cambió durante la conservación. Se conserva la copia y no se reemplaza el archivo actual".into());
    }
    let replacement = serde_json::to_vec_pretty(&store.default()).map_err(|e| e.to_string())?;
    atomic_io::write(&root.join(store.filename()),&replacement).map_err(|_|"El original está conservado, pero no se pudo restablecer. Comprueba permisos y actualiza antes de reintentar")?;
    Ok(
        json!({"id":store.id(),"archiveId":archive_id,"archivePath":folder.to_string_lossy(),"preservedFingerprint":expected,"restoredAt":knownext_core::now_iso()}),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    fn root() -> tempfile::TempDir {
        tempfile::tempdir().unwrap()
    }
    #[test]
    fn missing_is_default_but_invalid_is_not() {
        let root = root();
        assert_eq!(
            read(root.path(), Store::Config).unwrap()["schemaVersion"],
            3
        );
        for content in [
            "{broken",
            "[]",
            r#"{"schemaVersion":99}"#,
            r#"{"ai":[]}"#,
            r#"{"ai":{"permissions":false}}"#,
        ] {
            fs::write(root.path().join("config.json"), content).unwrap();
            assert!(read(root.path(), Store::Config).is_err());
            assert!(before_write(
                root.path(),
                &root.path().join("config.json"),
                &default_config()
            )
            .is_err());
            assert_eq!(
                fs::read_to_string(root.path().join("config.json")).unwrap(),
                content
            );
        }
    }
    #[test]
    fn checked_read_preserves_legacy_bytes_and_reports_future_without_reset() {
        let root = root();
        let path = root.path().join("config.json");
        fs::write(
            &path,
            r#"{"schemaVersion":1,"appearance":{"zoomPercent":125}}"#,
        )
        .unwrap();
        let api = LocalApi::new(root.path().into(), "test".into(), "test".into());
        assert_eq!(
            api.read_config_checked().unwrap()["appearance"]["zoomPercent"],
            125
        );
        assert_eq!(
            fs::read_to_string(&path).unwrap(),
            r#"{"schemaVersion":1,"appearance":{"zoomPercent":125}}"#
        );
        fs::write(&path, r#"{"schemaVersion":99}"#).unwrap();
        assert_eq!(inventory(root.path())["entries"][0]["canReset"], false);
    }
    #[test]
    fn reset_requires_review_and_preserves_exact_bytes_before_defaults() {
        let root = root();
        let path = root.path().join("config.json");
        let original = b"{\nBROKEN\n";
        fs::write(&path, original).unwrap();
        assert!(reset(root.path(), "config", &json!({})).is_err());
        assert!(reset(
            root.path(),
            "config",
            &json!({"fingerprint":"a".repeat(64)})
        )
        .is_err());
        let result = reset(
            root.path(),
            "config",
            &json!({"fingerprint":sha256_hex(original)}),
        )
        .unwrap();
        assert_eq!(
            fs::read(Path::new(result["archivePath"].as_str().unwrap()).join("config.json"))
                .unwrap(),
            original
        );
        assert_eq!(
            read(root.path(), Store::Config).unwrap()["schemaVersion"],
            3
        );
        assert!(reset(
            root.path(),
            "config",
            &json!({"fingerprint":sha256_hex(original)})
        )
        .is_err());
    }
    #[test]
    fn refused_archive_and_registry_reset_leave_original_intact() {
        let root = root();
        let path = root.path().join("export-template.json");
        fs::write(&path, b"broken").unwrap();
        fs::write(root.path().join("state-recovery"), b"obstruction").unwrap();
        assert!(reset(
            root.path(),
            "export",
            &json!({"fingerprint":sha256_hex(b"broken")})
        )
        .is_err());
        assert_eq!(fs::read(&path).unwrap(), b"broken");
        assert!(reset(root.path(), "projects", &json!({})).is_err());
    }
    #[test]
    fn bounded_regular_files_and_registry_identity_are_required() {
        let root = root();
        let path = root.path().join("projects.json");
        for content in [
            json!([]),
            json!({"projects":[{"id":"p","folderPath":"/a"},{"id":"p","folderPath":"/b"}]}),
            json!({"projects":[{"id":"p"}]}),
        ] {
            fs::write(&path, serde_json::to_vec(&content).unwrap()).unwrap();
            assert!(read(root.path(), Store::Projects).is_err());
        }
        fs::write(&path, b"{}").unwrap();
        fs::OpenOptions::new()
            .write(true)
            .open(&path)
            .unwrap()
            .set_len(MAX_BYTES + 1)
            .unwrap();
        assert_eq!(
            inventory(root.path())["entries"][2]["status"],
            "unavailable"
        );
        assert!(read(root.path(), Store::Projects).is_err());
    }
    #[test]
    fn api_never_overwrites_corruption_or_creates_project_before_registry_check() {
        let root = root();
        let api = LocalApi::new(root.path().into(), "test".into(), "test".into());
        for (filename, route) in [
            ("config.json", "/api/config"),
            ("export-template.json", "/api/config/export-template"),
        ] {
            fs::write(root.path().join(filename), b"broken").unwrap();
            assert!(api.handle("GET", route, Value::Null, vec![]).is_err());
            assert!(api.handle("PUT", route, json!({}), vec![]).is_err());
            assert_eq!(fs::read(root.path().join(filename)).unwrap(), b"broken");
        }
        fs::write(root.path().join("projects.json"), b"broken").unwrap();
        let project = root.path().join("must-not-create");
        assert!(api.create_project(json!({"folderPath":project})).is_err());
        assert!(!project.exists());
        let rejected = api
            .handle("POST", "/api/projects/p/ai/interactions", json!({}), vec![])
            .unwrap();
        assert_eq!(rejected.status, 503);
        assert_eq!(rejected.body["code"], "project_registry_unavailable");
        assert_eq!(fs::read(root.path().join("projects.json")).unwrap(), b"broken");
        assert!(api.ai_research_execute_job("p", "job").is_err());
    }
    #[cfg(unix)]
    #[test]
    fn linked_state_and_archive_are_not_followed() {
        let outside = root();
        let root = root();
        fs::write(outside.path().join("config.json"), b"secret").unwrap();
        std::os::unix::fs::symlink(
            outside.path().join("config.json"),
            root.path().join("config.json"),
        )
        .unwrap();
        assert!(read(root.path(), Store::Config).is_err());
        assert_eq!(
            inventory(root.path())["entries"][0]["fingerprint"],
            Value::Null
        );
    }
}
