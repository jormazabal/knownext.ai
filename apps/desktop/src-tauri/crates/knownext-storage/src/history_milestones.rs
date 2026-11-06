//! Local annotations of immutable Git versions; never rewrite a commit or source.
use super::*;
use std::{fs, io::Read};
const MAX_BYTES: u64 = 8 * 1024 * 1024;
const MAX_MARKERS: usize = 10_000;

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Store {
    schema_version: u32,
    project_id: String,
    markers: Vec<Marker>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Marker {
    id: String,
    commit: String,
    source_path: String,
    title: String,
    created_at: String,
    updated_at: String,
}
struct Snapshot {
    store: Store,
    revision: Option<String>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Rename {
    title: String,
    revision: Option<String>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Remove {
    revision: Option<String>,
}

fn marker_id(commit: &str, path: &str) -> String {
    format!(
        "milestone-{:x}",
        Sha256::digest(format!("{commit}\0{path}"))
    )
}
fn title_valid(title: &str) -> bool {
    !title.trim().is_empty() && title.chars().count() <= 120 && !title.chars().any(char::is_control)
}
fn validate_store(store: &Store, project: &str) -> Result<(), String> {
    if store.schema_version != 1 || store.project_id != project || store.markers.len() > MAX_MARKERS
    {
        return Err("Versión o pertenencia de hitos no compatible; se conserva".into());
    }
    let mut ids = BTreeSet::new();
    for marker in &store.markers {
        // Git's historical path is an identity key, never filesystem authority.
        // It can describe a renamed file which no longer exists in this tree.
        let source_valid = !marker.source_path.is_empty()
            && marker.source_path.len() <= 4096
            && !marker.source_path.contains('\0')
            && !marker.source_path.starts_with('/')
            && !marker
                .source_path
                .split('/')
                .any(|p| p.is_empty() || matches!(p, "." | ".."));
        if !ids.insert(&marker.id)
            || marker.id != marker_id(&marker.commit, &marker.source_path)
            || !matches!(marker.commit.len(), 40 | 64)
            || !marker.commit.bytes().all(|b| b.is_ascii_hexdigit())
            || !source_valid
            || !title_valid(&marker.title)
        {
            return Err("Hito no compatible; se conserva el almacén".into());
        }
        for date in [&marker.created_at, &marker.updated_at] {
            OffsetDateTime::parse(date, &Rfc3339)
                .map_err(|_| "Fecha de hito no compatible; se conserva")?;
        }
    }
    Ok(())
}
fn directory(path: &Path) -> Result<(), String> {
    let meta =
        fs::symlink_metadata(path).map_err(|_| "No se puede consultar el almacén de hitos")?;
    if !meta.is_dir() || batch::linked(&meta) {
        return Err("El almacén de hitos debe ser una carpeta regular; se conserva".into());
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
    fn milestone_path(&self, project: &str) -> Result<PathBuf, String> {
        self.project_root(project)?;
        directory(&self.app_data_dir)?;
        let folder = self.app_data_dir.join("history-milestones");
        match fs::symlink_metadata(&folder) {
            Ok(_) => directory(&folder)?,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => (),
            Err(_) => return Err("No se puede consultar el almacén de hitos".into()),
        }
        Ok(folder.join(format!("{project}.json")))
    }
    fn read_milestones(&self, project: &str) -> Result<Snapshot, String> {
        let path = self.milestone_path(project)?;
        let meta = match fs::symlink_metadata(&path) {
            Ok(meta) => meta,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                return Ok(Snapshot {
                    store: Store {
                        schema_version: 1,
                        project_id: project.into(),
                        markers: vec![],
                    },
                    revision: None,
                })
            }
            Err(_) => return Err("No se pueden consultar los hitos; se conservan".into()),
        };
        if !meta.is_file() || batch::linked(&meta) || meta.len() > MAX_BYTES {
            return Err("Hitos no regulares o fuera de 8 MiB; se conservan".into());
        }
        let mut bytes = Vec::new();
        fs::File::open(&path)
            .map_err(|_| "No se pueden abrir los hitos")?
            .take(MAX_BYTES + 1)
            .read_to_end(&mut bytes)
            .map_err(|_| "No se pueden leer los hitos")?;
        if bytes.len() as u64 > MAX_BYTES {
            return Err("Los hitos superan 8 MiB; se conservan".into());
        }
        let store: Store = serde_json::from_slice(&bytes)
            .map_err(|_| "Formato de hitos desconocido; se conserva")?;
        validate_store(&store, project)?;
        Ok(Snapshot {
            store,
            revision: Some(format!("{:x}", Sha256::digest(&bytes))),
        })
    }
    pub(super) fn document_history_snapshot(&self, document_id: &str) -> Result<Value, String> {
        let (project, _) = document_ref(document_id)?;
        self.resolve_document_path(document_id)?;
        let history = self.document_history_capability(&project)?;
        let entries = if history["status"] == "ready" {
            self.git_document_history(document_id)?
        } else {
            vec![]
        };
        let snapshot = self.read_milestones(&project);
        let marker_state = match &snapshot {
            Ok(data) => {
                json!({"status":if data.revision.is_some(){"ready"}else{"missing"},"revision":data.revision,"error":null})
            }
            Err(error) => json!({"status":"unavailable","revision":null,"error":error}),
        };
        let versions = entries
            .into_iter()
            .map(|mut entry| {
                entry.version["milestone"] = snapshot
                    .as_ref()
                    .ok()
                    .and_then(|data| {
                        data.store.markers.iter().find(|marker| {
                            marker.commit == entry.version["id"].as_str().unwrap_or("")
                                && marker.source_path == entry.path
                        })
                    })
                    .map(|marker| serde_json::to_value(marker).unwrap())
                    .unwrap_or(Value::Null);
                entry.version
            })
            .collect::<Vec<_>>();
        Ok(
            json!({"versions":versions,"milestones":marker_state,"history":history,"checkedAt":knownext_core::now_iso()}),
        )
    }
    pub(super) fn set_history_milestone(
        &self,
        document_id: &str,
        version_id: &str,
        body: Value,
        remove: bool,
    ) -> ApiResult {
        if body.get("revision").is_none() {
            return failure(
                400,
                "milestone_revision_required",
                "Actualiza el historial y envía su revisión antes de modificar un hito",
            );
        }
        let (title, revision) = if remove {
            match serde_json::from_value::<Remove>(body) {
                Ok(request) => (None, request.revision),
                Err(_) => {
                    return failure(
                        400,
                        "milestone_request_invalid",
                        "Solicitud de hito no compatible",
                    )
                }
            }
        } else {
            match serde_json::from_value::<Rename>(body) {
                Ok(request) if title_valid(&request.title) => {
                    (Some(request.title.trim().to_string()), request.revision)
                }
                _ => {
                    return failure(
                        400,
                        "milestone_title_invalid",
                        "Escribe un nombre de hito de 1 a 120 caracteres, sin saltos de línea",
                    )
                }
            }
        };
        let entries = self.git_document_history(document_id)?;
        let entry = match entries
            .iter()
            .find(|entry| entry.version["id"].as_str() == Some(version_id))
        {
            Some(entry) => entry,
            None => {
                return failure(
                    404,
                    "milestone_version_not_found",
                    "La versión no pertenece al historial de este documento",
                )
            }
        };
        let (project, _) = document_ref(document_id)?;
        let mut snapshot = match self.read_milestones(&project) {
            Ok(data) => data,
            Err(detail) => return failure(503, "milestone_store_unavailable", &detail),
        };
        if revision != snapshot.revision {
            return failure(
                409,
                "milestone_revision_changed",
                "Los hitos cambiaron; actualiza el historial antes de modificar el nombre",
            );
        }
        let id = marker_id(version_id, &entry.path);
        let existing = snapshot
            .store
            .markers
            .iter()
            .position(|marker| marker.id == id);
        let checked_at = knownext_core::now_iso();
        let marker = if let Some(title) = title {
            if existing.is_none() && snapshot.store.markers.len() >= MAX_MARKERS {
                return failure(
                    413,
                    "milestone_limit",
                    "El proyecto alcanza 10.000 hitos; revisa los nombres existentes",
                );
            }
            let marker = Marker {
                id: id.clone(),
                commit: version_id.into(),
                source_path: entry.path.clone(),
                title,
                created_at: existing
                    .map(|i| snapshot.store.markers[i].created_at.clone())
                    .unwrap_or_else(|| checked_at.clone()),
                updated_at: checked_at.clone(),
            };
            if let Some(index) = existing {
                snapshot.store.markers[index] = marker.clone();
            } else {
                snapshot.store.markers.push(marker.clone());
            }
            Some(marker)
        } else {
            if let Some(index) = existing {
                snapshot.store.markers.remove(index);
            }
            None
        };
        if remove && existing.is_none() {
            return ok(
                json!({"milestone":null,"revision":snapshot.revision,"checkedAt":checked_at}),
            );
        }
        if let Err(detail) = validate_store(&snapshot.store, &project) {
            return failure(400, "milestone_data_invalid", &detail);
        }
        let bytes =
            serde_json::to_vec(&snapshot.store).map_err(|_| "No se pueden preparar los hitos")?;
        if bytes.len() as u64 > MAX_BYTES {
            return failure(
                413,
                "milestone_store_limit",
                "Los hitos superan 8 MiB; los anteriores se conservan",
            );
        }
        let path = self.milestone_path(&project)?;
        let folder = path.parent().unwrap();
        if !folder.exists() {
            fs::create_dir(folder).map_err(|_| "No se puede crear el almacén de hitos")?;
        }
        directory(folder)?;
        atomic_io::write(&path, &bytes)
            .map_err(|_| "No se pudo guardar el nombre; los hitos anteriores se conservan")?;
        ok(
            json!({"milestone":marker,"revision":format!("{:x}",Sha256::digest(&bytes)),"checkedAt":checked_at}),
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture() -> (tempfile::TempDir, LocalApi, String, PathBuf, String) {
        let temp = tempfile::tempdir().unwrap();
        let api = LocalApi::new(temp.path().into(), "qa".into(), "test".into());
        let project = api
            .create_project(
                json!({"name":"History QA","versioningMode":"local-git","syncMode":"none"}),
            )
            .unwrap();
        let id = project["id"].as_str().unwrap().to_string();
        let root = api.project_root(&id).unwrap();
        fs::write(root.join("one.md"), b"# One\n").unwrap();
        fs::write(root.join("two.md"), b"# Two\n").unwrap();
        git_commit_paths(&root, "Initial", &["one.md", "two.md"]).unwrap();
        let hash = api.git_document_history(&doc_id(&id, "one.md")).unwrap()[0].version["id"]
            .as_str()
            .unwrap()
            .to_string();
        (temp, api, id, root, hash)
    }
    #[test]
    fn history_capability_keeps_existing_commits_when_automatic_versioning_is_disabled() {
        let (_temp, api, owner, root, hash) = fixture();
        api.update_project(&owner, json!({"versioningMode":"none"}))
            .unwrap();
        let snapshot = api
            .document_history_snapshot(&doc_id(&owner, "one.md"))
            .unwrap();
        assert_eq!(snapshot["history"]["status"], "ready");
        assert_eq!(snapshot["history"]["recordingEnabled"], false);
        assert_eq!(snapshot["versions"][0]["id"], hash);
        assert_eq!(fs::read(root.join("one.md")).unwrap(), b"# One\n");
        assert_eq!(git_head_hash(&root).unwrap().as_deref(), Some(&hash[..8]));
    }
    #[test]
    fn milestones_follow_historical_paths_preserve_sources_and_reject_stale_writes() {
        let (_temp, api, id, root, hash) = fixture();
        let document = doc_id(&id, "one.md");
        assert_eq!(
            api.set_history_milestone(&document, &hash, json!({"title":"Sin revisión"}), false)
                .unwrap()
                .status,
            400
        );
        let response = api
            .set_history_milestone(
                &document,
                &hash,
                json!({"title":"Diseño aprobado","revision":null}),
                false,
            )
            .unwrap();
        assert_eq!(response.status, 200);
        let revision = response.body["revision"].as_str().unwrap().to_string();
        assert_eq!(git_head_hash(&root).unwrap().as_deref(), Some(&hash[..8]));
        assert_eq!(fs::read(root.join("one.md")).unwrap(), b"# One\n");
        let other = api
            .document_history_snapshot(&doc_id(&id, "two.md"))
            .unwrap();
        assert!(other["versions"][0]["milestone"].is_null());
        fs::rename(root.join("one.md"), root.join("renamed.md")).unwrap();
        git_commit_paths(&root, "Rename", &["one.md", "renamed.md"]).unwrap();
        let head = git_head_hash(&root).unwrap();
        let renamed = doc_id(&id, "renamed.md");
        let history = api.document_history_snapshot(&renamed).unwrap();
        let marked = history["versions"]
            .as_array()
            .unwrap()
            .iter()
            .find(|version| version["id"] == hash)
            .unwrap();
        assert_eq!(marked["milestone"]["title"], "Diseño aprobado");
        assert_eq!(
            api.set_history_milestone(&renamed, &hash, json!({"revision":"0".repeat(64)}), true)
                .unwrap()
                .status,
            409
        );
        assert_eq!(
            api.set_history_milestone(
                &doc_id(&id, "two.md"),
                &hash,
                json!({"title":"Otro documento","revision":revision}),
                false
            )
            .unwrap()
            .status,
            200
        );
        assert_eq!(
            api.set_history_milestone(&renamed, &hash, json!({"revision":revision}), true)
                .unwrap()
                .status,
            409
        );
        let current = api.document_history_snapshot(&renamed).unwrap();
        assert_eq!(
            api.set_history_milestone(
                &renamed,
                &hash,
                json!({"revision":current["milestones"]["revision"]}),
                true
            )
            .unwrap()
            .status,
            200
        );
        assert_eq!(git_head_hash(&root).unwrap(), head);
        assert_eq!(fs::read(root.join("renamed.md")).unwrap(), b"# One\n");
        assert_eq!(
            api.document_history_snapshot(&doc_id(&id, "two.md"))
                .unwrap()["versions"][0]["milestone"]["title"],
            "Otro documento"
        );
    }
    #[test]
    fn unknown_or_unwritable_milestones_never_hide_git_history_or_overwrite_metadata() {
        let (_temp, api, id, root, hash) = fixture();
        let document = doc_id(&id, "one.md");
        let path = api.milestone_path(&id).unwrap();
        fs::create_dir(path.parent().unwrap()).unwrap();
        for bytes in [serde_json::to_vec(&json!({"schemaVersion":99,"projectId":id,"markers":[],"private":"owned-secret-sentinel"})).unwrap(),b"{broken".to_vec()]{
            fs::write(&path,&bytes).unwrap();let history=api.document_history_snapshot(&document).unwrap();
            assert_eq!(history["versions"].as_array().unwrap().len(),1);assert_eq!(history["milestones"]["status"],"unavailable");assert!(!history.to_string().contains("owned-secret-sentinel"));
            assert_eq!(api.set_history_milestone(&document,&hash,json!({"title":"Keep","revision":null}),false).unwrap().status,503);assert_eq!(fs::read(&path).unwrap(),bytes);
        }
        let known = serde_json::to_vec(&Store {
            schema_version: 1,
            project_id: id.clone(),
            markers: vec![],
        })
        .unwrap();
        fs::write(&path, &known).unwrap();
        let revision = format!("{:x}", Sha256::digest(&known));
        let mut permissions = fs::metadata(&path).unwrap().permissions();
        permissions.set_readonly(true);
        fs::set_permissions(&path, permissions.clone()).unwrap();
        assert!(api
            .set_history_milestone(
                &document,
                &hash,
                json!({"title":"Denied","revision":revision}),
                false
            )
            .is_err());
        assert_eq!(fs::read(&path).unwrap(), known);
        permissions.set_readonly(false);
        fs::set_permissions(&path, permissions).unwrap();
        fs::OpenOptions::new()
            .write(true)
            .open(&path)
            .unwrap()
            .set_len(MAX_BYTES + 1)
            .unwrap();
        assert_eq!(
            api.document_history_snapshot(&document).unwrap()["milestones"]["status"],
            "unavailable"
        );
        assert_eq!(fs::metadata(&path).unwrap().len(), MAX_BYTES + 1);
        assert_eq!(git_head_hash(&root).unwrap().as_deref(), Some(&hash[..8]));
    }
}

pub(super) fn portable_snapshot(api:&LocalApi,project:&str)->Result<Value,String>{let snap=api.read_milestones(project)?;serde_json::to_value(snap.store).map_err(|_|"Datos del trabajo no representables".into())}
pub(super) fn portable_merge(api:&LocalApi,project:&str,value:Value)->Result<(PathBuf,Value),String>{let mut incoming:Store=serde_json::from_value(value).map_err(|_|"Datos del trabajo no compatibles")?;incoming.project_id=project.into();let mut store=incoming;validate_store(&store,project)?;let incoming=store.markers;store=api.read_milestones(project)?.store;for item in incoming{if store.markers.iter().any(|old|old.id==item.id){continue;} store.markers.push(item);}validate_store(&store,project)?;Ok((api.milestone_path(project)?,serde_json::to_value(store).map_err(|_|"Datos del trabajo no representables")?))}
