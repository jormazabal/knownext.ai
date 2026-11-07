//! Device-local navigation bookmarks. Sources are never written by this service.
use super::*;
use std::{fs, io::Read};
const MAX_BYTES: u64 = 1024 * 1024;
const MAX_ENTRIES: usize = 256;

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Store {
    schema_version: u32,
    project_id: String,
    entries: Vec<Favorite>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Favorite {
    id: String,
    path: String,
    kind: String,
    created_at: String,
    updated_at: String,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Change {
    revision: Option<String>,
    path: Option<String>,
}
struct Snapshot {
    store: Store,
    revision: Option<String>,
}

fn relative(path: &str) -> bool {
    !path.is_empty()
        && path.len() <= 4096
        && path
            .split('/')
            .all(|part| portable_paths::component(part).is_ok())
}
fn kind(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_ascii_lowercase()
        .as_str()
    {
        "md" | "markdown" => "document",
        "knote" => "handwritten-note",
        "png" | "jpg" | "jpeg" | "gif" | "webp" | "svg" => "image",
        _ => "attachment",
    }
}
fn validate(store: &Store, owner: &str) -> Result<(), String> {
    if store.schema_version != 1 || store.project_id != owner || store.entries.len() > MAX_ENTRIES {
        return Err("Formato o pertenencia de favoritos no compatible; se conserva".into());
    }
    let mut ids = BTreeSet::new();
    let mut paths = BTreeSet::new();
    for entry in &store.entries {
        if !request_scope::portable_id(&entry.id)
            || !entry.id.starts_with("favorite-")
            || !relative(&entry.path)
            || !ids.insert(&entry.id)
            || !paths.insert(portable_paths::key(&entry.path))
            || !matches!(
                entry.kind.as_str(),
                "document" | "handwritten-note" | "image" | "attachment"
            )
            || [&entry.created_at, &entry.updated_at]
                .iter()
                .any(|date| OffsetDateTime::parse(date, &Rfc3339).is_err())
        {
            return Err("Favorito no compatible; se conserva el almacén".into());
        }
    }
    Ok(())
}
fn directory(path: &Path) -> Result<(), String> {
    let metadata =
        fs::symlink_metadata(path).map_err(|_| "No se puede consultar la carpeta de favoritos")?;
    if !metadata.is_dir() || batch::linked(&metadata) {
        return Err("Favoritos requiere una carpeta regular; se conserva".into());
    }
    Ok(())
}
fn failure(status: u16, code: &str, detail: &str) -> ApiResult {
    Ok(LocalApiResponse {
        status,
        body: json!({"code":code,"detail":detail,"checkedAt":knownext_core::now_iso()}),
    })
}

impl LocalApi {
    fn favorites_path(&self, project: &str) -> Result<PathBuf, String> {
        self.project_root(project)?;
        directory(&self.app_data_dir)?;
        let folder = self.app_data_dir.join("favorites");
        match fs::symlink_metadata(&folder) {
            Ok(_) => directory(&folder)?,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => (),
            Err(_) => return Err("No se pueden consultar los favoritos".into()),
        }
        Ok(folder.join(format!("{project}.json")))
    }
    fn read_favorites(&self, project: &str) -> Result<Snapshot, String> {
        let path = self.favorites_path(project)?;
        let metadata = match fs::symlink_metadata(&path) {
            Ok(metadata) => metadata,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                return Ok(Snapshot {
                    store: Store {
                        schema_version: 1,
                        project_id: project.into(),
                        entries: vec![],
                    },
                    revision: None,
                })
            }
            Err(_) => return Err("No se pueden consultar los favoritos; se conservan".into()),
        };
        if !metadata.is_file() || batch::linked(&metadata) || metadata.len() > MAX_BYTES {
            return Err("Favoritos no regulares o fuera del límite de 1 MiB; se conservan".into());
        }
        let mut bytes = vec![];
        fs::File::open(path)
            .map_err(|_| "No se pueden abrir los favoritos")?
            .take(MAX_BYTES + 1)
            .read_to_end(&mut bytes)
            .map_err(|_| "No se pueden leer los favoritos")?;
        if bytes.len() as u64 > MAX_BYTES {
            return Err("Favoritos supera 1 MiB; se conserva".into());
        }
        let store: Store = serde_json::from_slice(&bytes)
            .map_err(|_| "Formato de favoritos dañado o desconocido; se conserva")?;
        validate(&store, project)?;
        Ok(Snapshot {
            store,
            revision: Some(sha256_hex(&bytes)),
        })
    }
    fn write_favorites(&self, project: &str, store: &Store) -> Result<String, String> {
        validate(store, project)?;
        let bytes = serde_json::to_vec(store).map_err(|_| "No se pueden preparar los favoritos")?;
        if bytes.len() as u64 > MAX_BYTES {
            return Err("Favoritos supera 1 MiB; se conserva".into());
        }
        let path = self.favorites_path(project)?;
        let folder = path.parent().unwrap();
        if !folder.exists() {
            fs::create_dir(folder).map_err(|_| "No se puede crear la carpeta de favoritos")?;
        }
        directory(folder)?;
        atomic_io::write(&path, &bytes)
            .map_err(|_| "No se han podido guardar los favoritos; el documento se conserva")?;
        Ok(sha256_hex(&bytes))
    }
    fn favorite_target(&self, project: &str, relative: &str) -> Result<(PathBuf, String), String> {
        let root = self.project_root(project)?;
        let path = path_policy::resolve(&root, relative)?;
        let mut current = root.clone();
        directory(&current)?;
        for part in relative.split('/') {
            current.push(part);
            let metadata =
                fs::symlink_metadata(&current).map_err(|_| "El destino no está disponible")?;
            if batch::linked(&metadata) {
                return Err("El destino enlazado no está disponible como favorito".into());
            }
        }
        if !fs::symlink_metadata(&path)
            .map_err(|_| "El destino no está disponible")?
            .is_file()
        {
            return Err("El favorito necesita un archivo regular".into());
        }
        let kind = kind(&path).to_string();
        Ok((path, kind))
    }
    pub(super) fn project_favorites(&self, project: &str) -> ApiResult {
        let snapshot = match self.read_favorites(project) {
            Ok(data) => data,
            Err(detail) => return failure(503, "favorites_unavailable", &detail),
        };
        let entries: Vec<_> = snapshot
            .store
            .entries
            .iter()
            .map(|entry| {
                let available = self.favorite_target(project, &entry.path).is_ok();
                let mut value = serde_json::to_value(entry).unwrap();
                value["nodeId"] = json!(doc_id(project, &entry.path));
                value["name"] = json!(entry.path.rsplit('/').next().unwrap_or(&entry.path));
                value["available"] = json!(available);
                value
            })
            .collect();
        ok(
            json!({"projectId":project,"revision":snapshot.revision,"entries":entries,"maximumEntries":MAX_ENTRIES,"checkedAt":knownext_core::now_iso(),"scope":"this-device"}),
        )
    }
    pub(super) fn change_favorite(
        &self,
        project: &str,
        id: Option<&str>,
        body: Value,
    ) -> ApiResult {
        if id.is_some_and(|value| {
            !request_scope::portable_id(value) || !value.starts_with("favorite-")
        }) {
            return failure(
                400,
                "favorite_identity_invalid",
                "Identificador de favorito no válido",
            );
        }
        if body.get("revision").is_none() {
            return failure(
                400,
                "favorites_revision_required",
                "Actualiza los favoritos antes de cambiarlos",
            );
        }
        let request: Change = match serde_json::from_value(body) {
            Ok(request) => request,
            Err(_) => {
                return failure(
                    400,
                    "favorites_request_invalid",
                    "Solicitud de favorito no compatible",
                )
            }
        };
        if (id.is_some() && request.path.is_some())
            || (id.is_none() && !request.path.as_deref().is_some_and(relative))
        {
            return failure(
                400,
                "favorite_path_invalid",
                "Elige un archivo del proyecto para añadirlo a favoritos",
            );
        }
        let mut snapshot = match self.read_favorites(project) {
            Ok(data) => data,
            Err(detail) => return failure(503, "favorites_unavailable", &detail),
        };
        if request.revision != snapshot.revision {
            return failure(
                409,
                "favorites_revision_changed",
                "Los favoritos cambiaron. Actualiza antes de confirmar el cambio",
            );
        }
        let now = knownext_core::now_iso();
        let favorite = if let Some(id) = id {
            if !snapshot.store.entries.iter().any(|entry| entry.id == id) {
                return ok(json!({"favorite":null,"revision":snapshot.revision,"checkedAt":now}));
            }
            snapshot.store.entries.retain(|entry| entry.id != id);
            None
        } else {
            let path = request.path.unwrap();
            let (_, kind) = match self.favorite_target(project, &path) {
                Ok(target) => target,
                Err(detail) => return failure(400, "favorite_target_unavailable", &detail),
            };
            if let Some(existing) = snapshot
                .store
                .entries
                .iter()
                .find(|entry| portable_paths::key(&entry.path) == portable_paths::key(&path))
            {
                return ok(
                    json!({"favorite":existing,"revision":snapshot.revision,"checkedAt":now}),
                );
            }
            if snapshot.store.entries.len() >= MAX_ENTRIES {
                return failure(
                    413,
                    "favorites_limit",
                    "El proyecto alcanza 256 favoritos. Retira alguno antes de añadir otro",
                );
            }
            let entry = Favorite {
                id: knownext_core::compact_id("favorite"),
                path,
                kind,
                created_at: now.clone(),
                updated_at: now.clone(),
            };
            snapshot.store.entries.push(entry.clone());
            Some(entry)
        };
        let revision = match self.write_favorites(project, &snapshot.store) {
            Ok(revision) => revision,
            Err(detail) => return failure(503, "favorites_write_failed", &detail),
        };
        ok(json!({"favorite":favorite,"revision":revision,"checkedAt":now}))
    }
    pub(super) fn remap_favorites(
        &self,
        project: &str,
        mappings: &[(String, String)],
    ) -> Result<(), String> {
        if mappings.is_empty() {
            return Ok(());
        }
        let mut snapshot = self.read_favorites(project)?;
        let mut changed = false;
        for entry in &mut snapshot.store.entries {
            if let Some((_, new)) = mappings.iter().find(|(old, _)| old == &entry.path) {
                if entry.path != *new {
                    entry.path = new.clone();
                    entry.kind = kind(Path::new(new)).into();
                    entry.updated_at = knownext_core::now_iso();
                    changed = true;
                }
            }
        }
        if changed {
            self.write_favorites(project, &snapshot.store)?;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture() -> (tempfile::TempDir, LocalApi, String, PathBuf) {
        let temp = tempfile::tempdir().unwrap();
        let api = LocalApi::new(temp.path().into(), "qa".into(), "test".into());
        let project = api
            .create_project(json!({"name":"Favorites","versioningMode":"none"}))
            .unwrap();
        let id = project["id"].as_str().unwrap().to_string();
        let root = PathBuf::from(project["folderPath"].as_str().unwrap());
        fs::write(root.join("One.md"), b"# Original\n").unwrap();
        fs::create_dir(root.join("Docs")).unwrap();
        (temp, api, id, root)
    }
    #[test]
    fn bookmarks_persist_follow_app_moves_keep_identity_and_allow_removal_of_missing_files() {
        let (_temp, api, owner, root) = fixture();
        let route = format!("/api/projects/{owner}/favorites");
        let initial = api.handle("GET", &route, Value::Null, vec![]).unwrap();
        assert_eq!(initial.status, 200);
        assert!(initial.body["revision"].is_null());
        assert!(!api.app_data_dir.join("favorites").exists());
        assert_eq!(
            api.handle("POST", &route, json!({"path":"One.md"}), vec![])
                .unwrap()
                .status,
            400
        );
        let added = api
            .handle(
                "POST",
                &route,
                json!({"path":"One.md","revision":null}),
                vec![],
            )
            .unwrap();
        assert_eq!(added.status, 200);
        let id = added.body["favorite"]["id"].as_str().unwrap().to_string();
        assert_eq!(
            api.handle(
                "POST",
                &route,
                json!({"path":"One.md","revision":null}),
                vec![]
            )
            .unwrap()
            .status,
            409
        );
        let restarted = LocalApi::new(api.app_data_dir.clone(), "qa".into(), "test".into());
        assert_eq!(
            restarted.project_favorites(&owner).unwrap().body["entries"][0]["id"],
            id
        );
        api.rename_node(&owner, &doc_id(&owner, "One.md"), json!({"name":"Two.md"}))
            .unwrap();
        api.move_node(
            &owner,
            &doc_id(&owner, "Two.md"),
            json!({"targetFolderId":doc_id(&owner,"Docs")}),
        )
        .unwrap();
        let moved = api.project_favorites(&owner).unwrap();
        assert_eq!(moved.body["entries"][0]["path"], "Docs/Two.md");
        assert_eq!(moved.body["entries"][0]["id"], id);
        assert_eq!(moved.body["entries"][0]["available"], true);
        assert_eq!(fs::read(root.join("Docs/Two.md")).unwrap(), b"# Original\n");
        fs::remove_file(root.join("Docs/Two.md")).unwrap();
        let missing = api.project_favorites(&owner).unwrap();
        assert_eq!(missing.body["entries"][0]["available"], false);
        let removed = api
            .change_favorite(
                &owner,
                Some(&id),
                json!({"revision":missing.body["revision"]}),
            )
            .unwrap();
        assert_eq!(removed.status, 200);
        assert!(api.project_favorites(&owner).unwrap().body["entries"]
            .as_array()
            .unwrap()
            .is_empty());
    }
    #[test]
    fn unknown_stores_and_invalid_targets_are_preserved_and_do_not_hide_completed_moves() {
        let (_temp, api, owner, root) = fixture();
        for path in [
            "../One.md",
            ".git/config",
            "C:/One.md",
            "Docs",
            "Missing.md",
        ] {
            assert_eq!(
                api.change_favorite(&owner, None, json!({"path":path,"revision":null}))
                    .unwrap()
                    .status,
                400
            );
        }
        assert!(!api.app_data_dir.join("favorites").exists());
        let path = api.favorites_path(&owner).unwrap();
        fs::create_dir(path.parent().unwrap()).unwrap();
        let future=b"{\"schemaVersion\":99,\"projectId\":\"unknown\",\"entries\":[],\"private\":\"do-not-expose\"}";
        fs::write(&path, future).unwrap();
        let response = api.project_favorites(&owner).unwrap();
        assert_eq!(response.status, 503);
        assert!(!response.body.to_string().contains("do-not-expose"));
        let moved = api
            .rename_node(&owner, &doc_id(&owner, "One.md"), json!({"name":"Two.md"}))
            .unwrap();
        assert_eq!(moved["favoritesPending"], true);
        assert_eq!(fs::read(&path).unwrap(), future);
        assert_eq!(fs::read(root.join("Two.md")).unwrap(), b"# Original\n");
        fs::write(
            &path,
            format!("{{\"schemaVersion\":1,\"projectId\":\"{owner}\",\"entries\":[]}}"),
        )
        .unwrap();
        let before = fs::read(&path).unwrap();
        let mut permissions = fs::metadata(&path).unwrap().permissions();
        permissions.set_readonly(true);
        fs::set_permissions(&path, permissions.clone()).unwrap();
        let revision = sha256_hex(&before);
        let failed =
            api.change_favorite(&owner, None, json!({"path":"Two.md","revision":revision}));
        permissions.set_readonly(false);
        fs::set_permissions(&path, permissions).unwrap();
        assert_eq!(failed.unwrap().status, 503);
        assert_eq!(fs::read(path).unwrap(), before);
    }
}

pub(super) fn portable_snapshot(api:&LocalApi,project:&str)->Result<Value,String>{let snap=api.read_favorites(project)?;serde_json::to_value(snap.store).map_err(|_|"Datos del trabajo no representables".into())}
pub(super) fn portable_merge(api:&LocalApi,project:&str,value:Value)->Result<(PathBuf,Value),String>{let mut incoming:Store=serde_json::from_value(value).map_err(|_|"Datos del trabajo no compatibles")?;incoming.project_id=project.into();let mut store=incoming;validate(&store,project)?;let incoming=store.entries;store=api.read_favorites(project)?.store;for item in incoming{if store.entries.iter().any(|old|old.id==item.id||portable_paths::key(&old.path)==portable_paths::key(&item.path)){continue;} store.entries.push(item);}validate(&store,project)?;Ok((api.favorites_path(project)?,serde_json::to_value(store).map_err(|_|"Datos del trabajo no representables")?))}
