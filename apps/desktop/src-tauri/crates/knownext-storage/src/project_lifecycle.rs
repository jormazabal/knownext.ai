//! Reversible removal of a project association. Source files and recovery data
//! are never deleted here. The retained record precedes the registry change.
use super::*;
use std::sync::Mutex;
use std::{fs, io::Read};
use unicode_normalization::UnicodeNormalization;

const MAX_ENTRIES: usize = 256;
const MAX_BYTES: u64 = 8 * 1024 * 1024;
const FILE_NAME: &str = "retired-projects.json";

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Catalog {
    schema_version: u32,
    entries: Vec<Record>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Record {
    id: String,
    retired_at: String,
    original_root: Option<String>,
    project: Value,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Restore {
    revision: String,
    name: Option<String>,
}

fn folded(value: &str) -> unicase::UniCase<String> {
    unicase::UniCase::new(value.nfc().collect())
}

fn timestamp() -> String {
    knownext_core::now_iso()
}

fn validate_project(project: &Value) -> Result<(), String> {
    let object = project
        .as_object()
        .ok_or("Ficha de proyecto no compatible; se conserva")?;
    const FIELDS: &[&str] = &[
        "id",
        "name",
        "folderPath",
        "icon",
        "iconColor",
        "storageMode",
        "versioningMode",
        "syncMode",
        "authRequired",
        "githubRepository",
        "isGitRepository",
        "active",
    ];
    if object.keys().any(|key| !FIELDS.contains(&key.as_str())) {
        return Err("La ficha contiene metadatos no compatibles. No se retira ni se copia información desconocida".into());
    }
    for key in [
        "icon",
        "iconColor",
        "storageMode",
        "versioningMode",
        "syncMode",
    ] {
        if project.get(key).is_some_and(|value| {
            !value.is_null()
                && !value
                    .as_str()
                    .is_some_and(|text| text.len() <= 2000 && !text.contains('\0'))
        }) {
            return Err("La ficha contiene valores no compatibles; se conserva sin copiar".into());
        }
    }
    for key in ["authRequired", "isGitRepository", "active"] {
        if project
            .get(key)
            .is_some_and(|value| !value.is_null() && !value.is_boolean())
        {
            return Err("La ficha contiene valores no compatibles; se conserva sin copiar".into());
        }
    }
    for key in ["id", "name", "folderPath"] {
        let value = project[key]
            .as_str()
            .filter(|v| !v.trim().is_empty() && !v.contains('\0'))
            .ok_or("Ficha de proyecto incompleta; se conserva")?;
        if value.len() > 32_768 {
            return Err("La ficha de proyecto supera sus límites".into());
        }
    }
    if project["id"].as_str().unwrap().len() > 256
        || !Path::new(project["folderPath"].as_str().unwrap()).is_absolute()
    {
        return Err("La identidad o ubicación de proyecto no es compatible".into());
    }
    if let Some(repository) = project.get("githubRepository").filter(|r| !r.is_null()) {
        let fields = repository
            .as_object()
            .ok_or("Asociación de repositorio no compatible")?;
        if fields.keys().any(|k| {
            ![
                "owner",
                "repo",
                "name",
                "defaultRef",
                "defaultBranch",
                "rootPath",
                "permissions",
            ]
            .contains(&k.as_str())
        }) {
            return Err("La asociación contiene metadatos de repositorio no compatibles; se conserva sin copiar".into());
        }
        for (key, value) in fields {
            let valid = if key == "permissions" {
                value.is_null()
                    || value.as_array().is_some_and(|a| {
                        a.len() <= 64
                            && a.iter()
                                .all(|value| value.as_str().is_some_and(|text| text.len() <= 4096))
                    })
            } else {
                value.as_str().is_some_and(|text| text.len() <= 32_768) || value.is_null()
            };
            if !valid {
                return Err("Asociación de repositorio no compatible".into());
            }
        }
    }
    Ok(())
}

fn validate(catalog: &Catalog) -> Result<(), String> {
    if catalog.schema_version != 1 || catalog.entries.len() > MAX_ENTRIES {
        return Err(
            "Catálogo de proyectos retirados no compatible o fuera de límites; se conserva".into(),
        );
    }
    let mut ids = BTreeSet::new();
    for record in &catalog.entries {
        validate_project(&record.project)?;
        if record.project["id"].as_str() != Some(&record.id)
            || !ids.insert(&record.id)
            || OffsetDateTime::parse(&record.retired_at, &Rfc3339).is_err()
            || record
                .original_root
                .as_ref()
                .is_some_and(|p| p.len() > 32_768 || !Path::new(p).is_absolute())
        {
            return Err("Catálogo de proyectos retirados inconsistente; se conserva".into());
        }
    }
    Ok(())
}

fn read(root: &Path) -> Result<Catalog, String> {
    let directory =
        fs::symlink_metadata(root).map_err(|_| "No se puede acceder al almacén local")?;
    if !directory.is_dir() || batch::linked(&directory) {
        return Err("El almacén local debe ser una carpeta regular".into());
    }
    let path = root.join(FILE_NAME);
    let metadata = match fs::symlink_metadata(&path) {
        Ok(value) => value,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok(Catalog {
                schema_version: 1,
                entries: Vec::new(),
            })
        }
        Err(_) => return Err("No se puede leer el catálogo de proyectos retirados".into()),
    };
    if !metadata.is_file() || batch::linked(&metadata) || metadata.len() > MAX_BYTES {
        return Err("El catálogo de proyectos retirados no es un archivo regular dentro de sus límites; se conserva".into());
    }
    let mut bytes = Vec::new();
    fs::File::open(path)
        .map_err(|e| e.to_string())?
        .take(MAX_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    if bytes.len() as u64 > MAX_BYTES {
        return Err("El catálogo de proyectos retirados supera 8 MiB; se conserva".into());
    }
    let catalog: Catalog = serde_json::from_slice(&bytes).map_err(|_| {
        "Catálogo de proyectos retirados dañado o futuro; se conserva sin reemplazar"
    })?;
    validate(&catalog)?;
    Ok(catalog)
}

fn write(root: &Path, catalog: &Catalog) -> Result<(), String> {
    validate(catalog)?;
    let bytes = serde_json::to_vec_pretty(catalog).map_err(|e| e.to_string())?;
    if bytes.len() as u64 > MAX_BYTES {
        return Err(
            "El catálogo de proyectos retirados alcanza 8 MiB; no se retira la asociación".into(),
        );
    }
    atomic_io::write(&root.join(FILE_NAME), &bytes).map_err(|e| e.to_string())
}

fn revision(record: &Record) -> Result<String, String> {
    Ok(format!(
        "{:x}",
        Sha256::digest(serde_json::to_vec(record).map_err(|e| e.to_string())?)
    ))
}

fn canonical(root: &Path) -> Option<String> {
    fs::canonicalize(root)
        .ok()
        .map(|p| p.to_string_lossy().to_string())
}

fn same_root(first: &str, second: &str) -> bool {
    if cfg!(windows) {
        first.eq_ignore_ascii_case(second)
    } else {
        first == second
    }
}

struct Snapshot {
    registry: String,
    catalog: String,
}
struct PreparedRetirement {
    snapshot: Snapshot,
    registry: Value,
    catalog: Option<Catalog>,
}
struct PreparedRestoration {
    snapshot: Snapshot,
    registry: Option<Value>,
    result: Value,
}
enum PreparedWork {
    Retire(PreparedRetirement),
    Restore(PreparedRestoration),
}
enum Action<'a> {
    Retire(&'a str),
    Restore(&'a str),
}

fn digest(value: &impl Serialize) -> Result<String, String> {
    Ok(format!(
        "{:x}",
        Sha256::digest(serde_json::to_vec(value).map_err(|e| e.to_string())?)
    ))
}
fn snapshot(registry: &Value, catalog: &Catalog) -> Result<Snapshot, String> {
    Ok(Snapshot {
        registry: digest(registry)?,
        catalog: digest(catalog)?,
    })
}
fn action<'a>(method: &str, path: &'a str) -> Option<Action<'a>> {
    let parts: Vec<_> = path
        .split('?')
        .next()?
        .trim_matches('/')
        .split('/')
        .collect();
    match (method, parts.as_slice()) {
        ("POST", ["api", "projects", id, "retire"]) | ("DELETE", ["api", "projects", id]) => {
            Some(Action::Retire(id))
        }
        ("POST", ["api", "retired-projects", id, "restore"]) => Some(Action::Restore(id)),
        _ => None,
    }
}
pub fn is_project_lifecycle_work(method: &str, path: &str) -> bool {
    action(method, path).is_some()
}

pub fn dispatch_project_lifecycle(
    mutations: &Mutex<LocalApi>,
    source: &LocalApi,
    method: &str,
    path: &str,
    body: Value,
) -> Result<LocalApiResponse, String> {
    dispatch_with(mutations, source, |api| {
        match action(method, path).ok_or("Operación de ciclo de vida no válida")? {
            Action::Retire(id) => Ok(PreparedWork::Retire(
                api.prepare_retirement(&knownext_core::percent_decode(id))?,
            )),
            Action::Restore(id) => Ok(PreparedWork::Restore(
                api.prepare_restoration(&knownext_core::percent_decode(id), body)?,
            )),
        }
    })
}

fn dispatch_with(
    mutations: &Mutex<LocalApi>,
    source: &LocalApi,
    prepare: impl FnOnce(&LocalApi) -> Result<PreparedWork, String>,
) -> Result<LocalApiResponse, String> {
    // Source metadata and alias checks can block on an unavailable folder.
    // They must finish before acquiring authority over unrelated saves.
    let work = prepare(source)?;
    let api = mutations
        .lock()
        .map_err(|_| "No se pudo obtener acceso al registro de proyectos")?;
    match work {
        PreparedWork::Retire(prepared) => {
            ok(json!(api
                .commit_retirement_using(prepared, |registry| api
                    .write_registry(registry))?))
        }
        PreparedWork::Restore(prepared) => {
            ok(api.commit_restoration_using(prepared, |registry| api.write_registry(registry))?)
        }
    }
}

impl LocalApi {
    pub(super) fn retired_projects(&self) -> Result<Value, String> {
        let registry = self.registry_checked()?;
        let catalog = read(&self.app_data_dir)?;
        let mut entries = Vec::new();
        for record in &catalog.entries {
            let registered = registry["projects"]
                .as_array()
                .unwrap()
                .iter()
                .any(|p| p["id"].as_str() == Some(&record.id));
            entries.push(json!({"id":record.id,"name":record.project["name"],"folderPath":record.project["folderPath"],"retiredAt":record.retired_at,"revision":revision(record)?,"registered":registered,"originalFolderVerified":record.original_root.is_some()}));
        }
        entries.reverse();
        Ok(
            json!({"schemaVersion":1,"entries":entries,"checkedAt":timestamp(),"scope":"this-device","maximumEntries":MAX_ENTRIES}),
        )
    }

    pub(super) fn retire_project(&self, id: &str) -> Result<Vec<Value>, String> {
        self.retire_project_using(id, |registry| self.write_registry(registry))
    }

    fn retire_project_using(
        &self,
        id: &str,
        commit: impl FnOnce(&Value) -> Result<(), String>,
    ) -> Result<Vec<Value>, String> {
        let prepared = self.prepare_retirement(id)?;
        self.commit_retirement_using(prepared, commit)
    }

    fn ensure_lifecycle_snapshot(&self, expected: &Snapshot) -> Result<(), String> {
        let current = snapshot(&self.registry_checked()?, &read(&self.app_data_dir)?)?;
        if current.registry != expected.registry || current.catalog != expected.catalog {
            return Err("El registro o las asociaciones han cambiado. Actualiza la revisión antes de continuar".into());
        }
        Ok(())
    }

    fn prepare_retirement(&self, id: &str) -> Result<PreparedRetirement, String> {
        let mut registry = self.registry_checked()?;
        let mut catalog = read(&self.app_data_dir)?;
        let snapshot = snapshot(&registry, &catalog)?;
        let project = registry["projects"]
            .as_array()
            .unwrap()
            .iter()
            .find(|p| p["id"].as_str() == Some(id))
            .cloned();
        let Some(project) = project else {
            return if catalog.entries.iter().any(|record| record.id == id) {
                Ok(PreparedRetirement {
                    snapshot,
                    registry,
                    catalog: None,
                })
            } else {
                Err("Proyecto no registrado ni conservado para reincorporación".into())
            };
        };
        validate_project(&project)?;
        if !catalog.entries.iter().any(|record| record.id == id)
            && catalog.entries.len() >= MAX_ENTRIES
        {
            return Err("El catálogo conserva 256 asociaciones. Revisa su almacenamiento antes de retirar otro proyecto".into());
        }
        let root = Path::new(project["folderPath"].as_str().unwrap());
        let record = Record {
            id: id.into(),
            retired_at: timestamp(),
            original_root: canonical(root),
            project,
        };
        catalog.entries.retain(|record| record.id != id);
        catalog.entries.push(record);
        registry["projects"]
            .as_array_mut()
            .unwrap()
            .retain(|p| p["id"].as_str() != Some(id));
        if registry["activeProjectId"].as_str() == Some(id) {
            registry["activeProjectId"] = registry["projects"]
                .as_array()
                .unwrap()
                .first()
                .map(|p| p["id"].clone())
                .unwrap_or(Value::Null);
        }
        let active = registry["activeProjectId"].as_str().map(str::to_string);
        for project in registry["projects"].as_array_mut().unwrap() {
            project["active"] = json!(project["id"].as_str() == active.as_deref());
        }
        Ok(PreparedRetirement {
            snapshot,
            registry,
            catalog: Some(catalog),
        })
    }

    fn commit_retirement_using(
        &self,
        prepared: PreparedRetirement,
        commit: impl FnOnce(&Value) -> Result<(), String>,
    ) -> Result<Vec<Value>, String> {
        self.ensure_lifecycle_snapshot(&prepared.snapshot)?;
        if let Some(catalog) = prepared.catalog {
            // A failed registry commit leaves the retained record alongside
            // the still-registered original. Retry after restart is safe.
            write(&self.app_data_dir, &catalog)?;
            commit(&prepared.registry)?;
        }
        Ok(prepared.registry["projects"]
            .as_array()
            .unwrap()
            .iter()
            .cloned()
            .map(normalize_project_metadata)
            .collect())
    }

    pub(super) fn restore_retired_project(&self, id: &str, body: Value) -> Result<Value, String> {
        self.restore_project_using(id, body, |registry| self.write_registry(registry))
    }

    fn restore_project_using(
        &self,
        id: &str,
        body: Value,
        commit: impl FnOnce(&Value) -> Result<(), String>,
    ) -> Result<Value, String> {
        let prepared = self.prepare_restoration(id, body)?;
        self.commit_restoration_using(prepared, commit)
    }

    fn prepare_restoration(&self, id: &str, body: Value) -> Result<PreparedRestoration, String> {
        let request: Restore =
            serde_json::from_value(body).map_err(|_| "Revisión de reincorporación no válida")?;
        let mut registry = self.registry_checked()?;
        let catalog = read(&self.app_data_dir)?;
        let snapshot = snapshot(&registry, &catalog)?;
        let record = catalog
            .entries
            .iter()
            .find(|entry| entry.id == id)
            .ok_or("No se conserva esta asociación de proyecto")?;
        if request.revision != revision(record)? {
            return Err(
                "La ficha ha cambiado. Actualiza los proyectos retirados antes de reincorporar"
                    .into(),
            );
        }
        if let Some(existing) = registry["projects"]
            .as_array()
            .unwrap()
            .iter()
            .find(|project| project["id"].as_str() == Some(id))
        {
            // An unknown ACK or an external re-registration never overwrites
            // the current project's metadata, files or newly edited documents.
            return Ok(PreparedRestoration {
                snapshot,
                registry: None,
                result: json!({"project":existing,"alreadyRegistered":true,"checkedAt":timestamp(),"syncPaused":existing["syncMode"].as_str()==Some("none")}),
            });
        }
        let name = request
            .name
            .as_deref()
            .unwrap_or(record.project["name"].as_str().unwrap())
            .trim();
        if name.is_empty() || name.len() > 2000 || name.contains(['\0', '\r', '\n']) {
            return Err("Escribe un nombre de proyecto válido, de hasta 2000 bytes".into());
        }
        let path = Path::new(record.project["folderPath"].as_str().unwrap());
        if !fs::metadata(path).is_ok_and(|meta| meta.is_dir()) {
            return Err("La carpeta original no está disponible. No se crea ni se sustituye ninguna carpeta".into());
        }
        let current_root = canonical(path).ok_or("No se puede comprobar la carpeta original")?;
        if record
            .original_root
            .as_ref()
            .is_some_and(|old| !same_root(old, &current_root))
        {
            return Err(
                "La ubicación apunta a otra carpeta. Revisa su vinculación antes de reincorporar"
                    .into(),
            );
        }
        for registered in registry["projects"].as_array().unwrap() {
            if registered["name"]
                .as_str()
                .is_some_and(|other| folded(other.trim()) == folded(name))
            {
                return Err(
                    "Ya hay un proyecto con ese nombre. Elige otro nombre para reincorporarlo"
                        .into(),
                );
            }
            if let Some(other) = registered["folderPath"].as_str() {
                if same_root(other, &path.to_string_lossy())
                    || canonical(Path::new(other))
                        .is_some_and(|other| same_root(&other, &current_root))
                {
                    return Err(
                        "La carpeta ya está asociada a otro proyecto. No se fusionan identidades"
                            .into(),
                    );
                }
            }
        }
        let mut project = record.project.clone();
        project["name"] = json!(name);
        project["active"] = json!(false);
        project["syncMode"] = json!("none");
        registry["projects"]
            .as_array_mut()
            .unwrap()
            .push(project.clone());
        Ok(PreparedRestoration {
            snapshot,
            registry: Some(registry),
            result: json!({"project":project,"alreadyRegistered":false,"checkedAt":timestamp(),"syncPaused":true}),
        })
    }

    fn commit_restoration_using(
        &self,
        mut prepared: PreparedRestoration,
        commit: impl FnOnce(&Value) -> Result<(), String>,
    ) -> Result<Value, String> {
        self.ensure_lifecycle_snapshot(&prepared.snapshot)?;
        if let Some(registry) = prepared.registry {
            commit(&registry)?;
        }
        prepared.result["checkedAt"] = json!(timestamp());
        Ok(prepared.result)
    }
}

#[cfg(test)]
mod tests;
