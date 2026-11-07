//! Known local AI collections. Absence differs from an unreadable existing file.
use super::*;
use std::{fs, io::Read};

const MAX_BYTES: u64 = 32 * 1024 * 1024;
const MAX_ITEMS: usize = 10_000;

#[derive(Clone, Copy)]
enum Kind {
    Conversation,
    Context,
}
impl Kind {
    fn directory(self) -> &'static str {
        match self {
            Self::Conversation => "ai",
            Self::Context => "ai-context",
        }
    }
    fn collection(self) -> &'static str {
        match self {
            Self::Conversation => "events",
            Self::Context => "sources",
        }
    }
    fn empty(self) -> Value {
        match self {
            Self::Conversation => json!({"events":[]}),
            Self::Context => json!({"sources":[],"expiredSourceIds":[]}),
        }
    }
}

fn regular_directory(path: &Path, optional: bool) -> Result<(), String> {
    match fs::symlink_metadata(path) {
        Ok(meta) if meta.is_dir() && !batch::linked(&meta) => Ok(()),
        Err(error) if optional && error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        _ => {
            Err("El almacén IA no es una carpeta regular accesible; se conserva sin cambios".into())
        }
    }
}

fn validate(kind: Kind, project: &str, value: &Value) -> Result<(), String> {
    let object = value
        .as_object()
        .ok_or("El estado IA no contiene un objeto válido; se conserva")?;
    if object
        .get("schemaVersion")
        .is_some_and(|v| v.as_u64() != Some(1))
    {
        return Err("Versión de estado IA no compatible; se conserva sin cambios".into());
    }
    if object
        .get("projectId")
        .is_some_and(|owner| owner.as_str() != Some(project))
    {
        return Err("El estado IA pertenece a otro proyecto; se conserva".into());
    }
    let fields: &[&str] = match kind {
        Kind::Conversation => &["events", "schemaVersion", "projectId", "updatedAt"],
        Kind::Context => &[
            "sources",
            "expiredSourceIds",
            "schemaVersion",
            "projectId",
            "updatedAt",
        ],
    };
    if object.keys().any(|key| !fields.contains(&key.as_str())) {
        return Err("El estado IA contiene extensiones no compatibles; se conserva".into());
    }
    let items = value[kind.collection()]
        .as_array()
        .filter(|v| v.len() <= MAX_ITEMS)
        .ok_or("Colección IA no válida o fuera de límites; se conserva")?;
    for item in items {
        if !item.is_object()
            || item
                .get("projectId")
                .is_some_and(|owner| owner.as_str() != Some(project))
        {
            return Err("La colección IA contiene una entrada de otro propietario o no compatible; se conserva".into());
        }
    }
    if matches!(kind, Kind::Context)
        && value.get("expiredSourceIds").is_some_and(|v| {
            !v.as_array()
                .is_some_and(|items| items.len() <= MAX_ITEMS && items.iter().all(Value::is_string))
        })
    {
        return Err("Las referencias de contexto no son compatibles; se conservan".into());
    }
    Ok(())
}

fn read(root: &Path, project: &str, kind: Kind) -> Result<Value, String> {
    if !request_scope::portable_id(project) {
        return Err("Identificador de estado IA no válido".into());
    }
    regular_directory(root, false)?;
    let directory = root.join(kind.directory());
    regular_directory(&directory, true)?;
    let path = directory.join(format!("{project}.json"));
    let meta = match fs::symlink_metadata(&path) {
        Ok(meta) => meta,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(kind.empty()),
        Err(_) => return Err("No se puede consultar el estado IA; se conserva".into()),
    };
    if !meta.is_file() || batch::linked(&meta) || meta.len() > MAX_BYTES {
        return Err("El estado IA no es un archivo regular de hasta32MiB; se conserva".into());
    }
    let mut bytes = Vec::new();
    fs::File::open(path)
        .map_err(|_| "No se puede abrir el estado IA; se conserva")?
        .take(MAX_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| "No se pudo completar la lectura IA; se conserva")?;
    if bytes.len() as u64 > MAX_BYTES {
        return Err("El estado IA supera32MiB; se conserva".into());
    }
    let value: Value = serde_json::from_slice(&bytes)
        .map_err(|_| "El estado IA contiene JSON ilegible; se conserva sin cambios")?;
    validate(kind, project, &value)?;
    Ok(value)
}

pub(super) fn before_write(root: &Path, path: &Path, value: &Value) -> Result<(), String> {
    let kind = if path.parent() == Some(root.join("ai-context").as_path()) {
        Kind::Context
    } else if path.parent() == Some(root.join("ai").as_path())
        && !matches!(path.file_name().and_then(|v| v.to_str()),Some("usage.json"|"usage-policy.json"))
    {
        Kind::Conversation
    } else {
        return Ok(());
    };
    if path.extension().and_then(|v| v.to_str()) != Some("json") {
        return Err("Formato de estado IA no válido".into());
    }
    let project = path
        .file_stem()
        .and_then(|v| v.to_str())
        .ok_or("Identidad de estado IA no válida")?;
    read(root, project, kind)?;
    validate(kind, project, value)?;
    if serde_json::to_vec_pretty(value)
        .map_err(|_| "No se pudo preparar el estado IA")?
        .len() as u64
        > MAX_BYTES
    {
        return Err("El estado IA supera32MiB; no se ha escrito".into());
    }
    Ok(())
}

impl LocalApi {
    pub(super) fn append_ai_conversation_events(
        &self,
        project: &str,
        next_events: Vec<Value>,
    ) -> Result<(), String> {
        if next_events.is_empty() {
            return Ok(());
        }
        let mut conversation = self.conversation_checked(project)?;
        let events = conversation["events"]
            .as_array_mut()
            .ok_or("Conversación no compatible; se conserva")?;
        events.extend(next_events);
        trim_ai_conversation_events(events);
        self.write_json(&self.conversation_path(project), &conversation)
    }
    pub(super) fn conversation_checked(&self, project: &str) -> Result<Value, String> {
        read(&self.app_data_dir, project, Kind::Conversation)
    }
    pub(super) fn context_checked(&self, project: &str) -> Result<Value, String> {
        read(&self.app_data_dir, project, Kind::Context)
    }
    pub(super) fn ai_state_preflight(&self, parts: &[&str]) -> Result<(), String> {
        match parts {
            ["api", "projects", project, "ai", "conversation", ..] => {
                self.conversation_checked(project)?;
            }
            ["api", "projects", project, "ai", "context", ..] => {
                self.context_checked(project)?;
            }
            ["api", "projects", project, "ai", "research", ..] => {
                self.conversation_checked(project)?;
                self.context_checked(project)?;
            }
            _ => (),
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture() -> (tempfile::TempDir, LocalApi, String) {
        let owned = tempfile::tempdir().unwrap();
        let api = LocalApi::new(owned.path().join("state"), "qa".into(), "test".into());
        let project = api
            .create_project(
                json!({"name":"Owned state QA","versioningMode":"none","syncMode":"none"}),
            )
            .unwrap();
        (owned, api, project["id"].as_str().unwrap().into())
    }

    #[test]
    fn known_legacy_reads_do_not_migrate_and_invalid_collections_never_become_writable_empty_state()
    {
        let (_owned, api, project) = fixture();
        assert_eq!(
            api.conversation_checked(&project).unwrap()["events"],
            json!([])
        );
        assert!(!api.app_data_dir.join("ai").exists());
        for (kind, tail) in [
            (Kind::Conversation, "conversation"),
            (Kind::Context, "context/sources"),
        ] {
            let directory = api.app_data_dir.join(kind.directory());
            fs::create_dir_all(&directory).unwrap();
            let path = directory.join(format!("{project}.json"));
            let legacy = serde_json::to_vec(&kind.empty()).unwrap();
            fs::write(&path, &legacy).unwrap();
            assert_eq!(
                read(&api.app_data_dir, &project, kind).unwrap(),
                kind.empty()
            );
            assert_eq!(fs::read(&path).unwrap(), legacy);
            let mut future = kind.empty();
            future["schemaVersion"] = json!(2);
            let mut wrong_owner = kind.empty();
            wrong_owner["projectId"] = json!("other-project");
            for bytes in [
                b"{ invalid JSON".to_vec(),
                serde_json::to_vec(&future).unwrap(),
                serde_json::to_vec(&wrong_owner).unwrap(),
            ] {
                fs::write(&path, &bytes).unwrap();
                assert!(api
                    .handle(
                        "GET",
                        &format!("/api/projects/{project}/ai/{tail}"),
                        Value::Null,
                        vec![]
                    )
                    .is_err());
                assert!(before_write(&api.app_data_dir, &path, &kind.empty()).is_err());
                assert_eq!(fs::read(&path).unwrap(), bytes);
            }
            fs::File::create(&path)
                .unwrap()
                .set_len(MAX_BYTES + 1)
                .unwrap();
            assert!(read(&api.app_data_dir, &project, kind).is_err());
            assert_eq!(fs::metadata(&path).unwrap().len(), MAX_BYTES + 1);
            fs::remove_file(&path).unwrap();
            fs::create_dir(&path).unwrap();
            assert!(read(&api.app_data_dir, &project, kind).is_err());
        }
    }

    #[test]
    fn failed_context_mutation_is_not_acknowledged_or_allowed_to_replace_its_source() {
        let (_owned, api, project) = fixture();
        let root = api.project_root(&project).unwrap();
        let document = doc_id(&project, "source.md");
        fs::write(root.join("source.md"), "owned source").unwrap();
        let path = api.context_sources_path(&project);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        let original = b"{\"sources\":[],\"expiredSourceIds\":[]}";
        fs::write(&path, original).unwrap();
        let permissions = fs::metadata(&path).unwrap().permissions();
        let mut readonly = permissions.clone();
        readonly.set_readonly(true);
        fs::set_permissions(&path, readonly).unwrap();
        let result = api.handle(
            "POST",
            &format!("/api/projects/{project}/ai/context/project-documents"),
            json!({"documentId":document}),
            vec![],
        );
        fs::set_permissions(&path, permissions).unwrap();
        assert!(result.is_err());
        assert_eq!(fs::read(&path).unwrap(), original);
        assert_eq!(
            fs::read_to_string(root.join("source.md")).unwrap(),
            "owned source"
        );
    }
}
