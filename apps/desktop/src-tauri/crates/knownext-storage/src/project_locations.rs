//! Reviewed association changes. No source creation, copying or moving.
use super::*;
use std::fs;

pub fn reviewed_location_owner(method: &str, path: &str, body: &Value) -> Option<String> {
    let decoded: Vec<_> = path
        .split('?')
        .next()?
        .trim_matches('/')
        .split('/')
        .map(knownext_core::percent_decode)
        .collect();
    let parts: Vec<_> = decoded.iter().map(String::as_str).collect();
    if !method.eq_ignore_ascii_case("PUT")
        || !body.get("locationReview").is_some_and(Value::is_object)
    {
        return None;
    }
    match parts.as_slice() {
        ["api", "projects", id] => Some((*id).to_string()),
        _ => None,
    }
}
pub fn location_recording_blocker(snapshot: &Value, project: &str) -> bool {
    snapshot["sessions"].as_array().map_or(true, |sessions| {
        sessions
            .iter()
            .any(|s| s["destination"]["projectId"] == project && s["status"] != "completed")
    })
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct LocationReview {
    registry_revision: String,
    folder_stamp: String,
    candidate_path: String,
}

fn digest(value: &Value) -> String {
    format!("{:x}", Sha256::digest(serde_json::to_vec(value).unwrap()))
}
fn regular_root(path: &Path) -> Result<PathBuf, String> {
    if !path.is_absolute() {
        return Err("Elige una carpeta con ruta absoluta".into());
    }
    for ancestor in path.ancestors() {
        let metadata =
            fs::symlink_metadata(ancestor).map_err(|_| "La carpeta elegida no está disponible")?;
        if !metadata.is_dir() || batch::linked(&metadata) {
            return Err("Elige una carpeta regular, sin enlaces en su ubicación".into());
        }
    }
    fs::canonicalize(path).map_err(|_| "No se puede verificar la carpeta elegida".into())
}
fn overlap(a: &Path, b: &Path) -> bool {
    if cfg!(windows) {
        let key = |p: &Path| {
            p.to_string_lossy()
                .replace('/', "\\")
                .trim_start_matches("\\\\?\\")
                .trim_end_matches('\\')
                .to_lowercase()
        };
        let a = key(a);
        let b = key(b);
        a == b || a.starts_with(&format!("{b}\\")) || b.starts_with(&format!("{a}\\"))
    } else {
        a.starts_with(b) || b.starts_with(a)
    }
}

// Immediate directory metadata only. Coordination names are excluded before any
// metadata call; its creation is the only admission change this digest ignores.
pub(super) fn admission_fingerprint(root: &Path) -> Result<String, String> {
    let canonical = regular_root(root)?;
    let metadata = fs::symlink_metadata(&canonical).map_err(|_| "No se puede verificar el destino")?;
    let time = |value: std::io::Result<SystemTime>| value.ok().and_then(|value|value.duration_since(UNIX_EPOCH).ok()).map(|value|value.as_nanos().to_string());
    let started = std::time::Instant::now();
    let mut entries = BTreeMap::new();
    for entry in fs::read_dir(&canonical).map_err(|_| "No se puede completar la revisión del destino")? {
        let entry = entry.map_err(|_| "No se pudo consultar una entrada del destino")?;
        let name = entry.file_name();
        let name = name.to_string_lossy();
        if [".knownext-runtime", "owner.lock", "runtime-owner.lock", "capture.lock"].iter().any(|reserved|name.eq_ignore_ascii_case(reserved)) { continue; }
        if entries.len() >= 10_000 || started.elapsed() > Duration::from_secs(2) {
            return Err("El destino supera la revisión inmediata acotada; no se ha cambiado la asociación".into());
        }
        let meta = fs::symlink_metadata(entry.path()).map_err(|_| "No se puede verificar una entrada del destino")?;
        entries.insert(name.to_string(),json!({"file":meta.is_file(),"directory":meta.is_dir(),"linked":batch::linked(&meta),"bytes":meta.len(),"created":time(meta.created()),"modified":time(meta.modified()),"readonly":meta.permissions().readonly()}));
    }
    Ok(digest(&json!({"root":canonical,"created":time(metadata.created()),"entries":entries})))
}

impl LocalApi {
    pub(crate) fn review_project_location(&self, id: &str, body: Value) -> Result<Value, String> {
        #[derive(Deserialize)]
        #[serde(rename_all = "camelCase", deny_unknown_fields)]
        struct Input {
            folder_path: String,
        }
        let input: Input =
            serde_json::from_value(body).map_err(|_| "Ubicación de proyecto no válida")?;
        let registry = self.registry_checked()?;
        self.location_review(id, &input.folder_path, &registry)
    }

    fn location_review(&self, id: &str, folder: &str, registry: &Value) -> Result<Value, String> {
        if cfg!(target_os = "android") {
            return Err("Este dispositivo usa carpetas gestionadas. La revinculación de rutas externas no está disponible; utiliza la transferencia de proyectos".into());
        }
        if folder.is_empty() || folder.len() > 32768 || folder.chars().any(char::is_control) {
            return Err("Ubicación no válida".into());
        }
        let project = registry["projects"]
            .as_array()
            .and_then(|p| p.iter().find(|p| p["id"].as_str() == Some(id)))
            .ok_or("Proyecto no registrado")?;
        let candidate = regular_root(Path::new(folder))?;
        let private = regular_root(&self.app_data_dir)?;
        if overlap(&candidate, &private) {
            return Err("La nueva ubicación no puede incluir el almacén privado de la aplicación ni estar dentro de él".into());
        }
        for other in registry["projects"].as_array().unwrap() {
            if other["id"] == id {
                continue;
            }
            let path = other["folderPath"]
                .as_str()
                .ok_or("Ubicación registrada no compatible")?;
            let other_root = match regular_root(Path::new(path)) {
                Ok(root) => root,
                Err(_) => {
                    let identity = self.missing_location_identity(Path::new(path))?;
                    regular_root(&identity).map_err(|_| "No se puede verificar la ubicación de otro proyecto; revisa o retira esa asociación antes de revincular")?
                },
            };
            if overlap(&candidate, &other_root) {
                return Err("La carpeta se solapa con otro proyecto registrado; se conserva la asociación actual".into());
            }
        }
        let metadata = fs::metadata(&candidate).map_err(|_| "La carpeta ya no está disponible")?;
        let time = |value: std::io::Result<SystemTime>| {
            value
                .ok()
                .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                .map(|t| t.as_nanos().to_string())
        };
        let canonical = candidate.to_string_lossy().to_string();
        let stamp = digest(
            &json!({"path":canonical,"created":time(metadata.created()),"modified":time(metadata.modified())}),
        );
        let original = project["folderPath"]
            .as_str()
            .ok_or("Ubicación original no compatible")?;
        Ok(
            json!({"projectId":id,"projectName":project["name"],"currentPath":original,"originalAvailable":regular_root(Path::new(original)).is_ok(),"candidatePath":canonical,"registryRevision":digest(registry),"folderStamp":stamp,"targetHasHistory":candidate.join(".git").exists(),"checkedAt":knownext_core::now_iso(),"scope":"association-only"}),
        )
    }

    pub(super) fn reviewed_location(
        &self,
        id: &str,
        folder: &str,
        review: &Value,
        registry: &Value,
    ) -> Result<PathBuf, String> {
        let review: LocationReview = serde_json::from_value(review.clone())
            .map_err(|_| "Revisa la nueva ubicación antes de cambiar la asociación del proyecto")?;
        if review.registry_revision != digest(registry) {
            return Err("El registro cambió desde la revisión. Revisa de nuevo la ubicación; no se ha modificado el proyecto".into());
        }
        let current = self.location_review(id, folder, registry)?;
        if current["folderStamp"] != review.folder_stamp
            || current["candidatePath"] != review.candidate_path
        {
            return Err("La carpeta elegida cambió desde la revisión. Revisa de nuevo; la asociación se conserva".into());
        }
        Ok(PathBuf::from(review.candidate_path))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture() -> (tempfile::TempDir, LocalApi, String, PathBuf, PathBuf) {
        let root = tempfile::tempdir().unwrap();
        let data = root.path().join("app");
        fs::create_dir(&data).unwrap();
        let api = LocalApi::new(data, "qa".into(), "test".into());
        let project = api
            .create_project(json!({"name":"Original","versioningMode":"none","syncMode":"none"}))
            .unwrap();
        let id = project["id"].as_str().unwrap().to_string();
        let original = api.project_root(&id).unwrap();
        let target = root.path().join("Relocated");
        fs::create_dir(&target).unwrap();
        (root, api, id, original, target)
    }
    fn receipt(review: &Value) -> Value {
        json!({"registryRevision":review["registryRevision"],"folderStamp":review["folderStamp"],"candidatePath":review["candidatePath"]})
    }
    #[test]
    fn project_location_review_keeps_sources_drafts_identity_and_pauses_automatic_work() {
        let (_root, api, id, original, target) = fixture();
        fs::write(original.join("a.md"), "Original").unwrap();
        fs::write(target.join("a.md"), "Different destination").unwrap();
        fs::create_dir(api.app_data_dir.join("drafts")).unwrap();
        let draft = api.app_data_dir.join("drafts").join("owned.json");
        fs::write(&draft, b"pending-draft-canary").unwrap();
        api.update_project(&id,json!({"githubRepository":{"owner":"qa","repo":"original","rootPath":"","permissions":[]},"syncMode":"auto-github"})).unwrap();
        let before = fs::read(api.registry_path()).unwrap();
        assert!(api
            .update_project(&id, json!({"folderPath":target}))
            .is_err());
        assert_eq!(fs::read(api.registry_path()).unwrap(), before);
        let review = api
            .review_project_location(&id, json!({"folderPath":target}))
            .unwrap();
        let updated=api.update_project(&id,json!({"folderPath":target,"locationReview":receipt(&review),"githubRepository":{"owner":"unexpected","repo":"wrong"},"versioningMode":"local-git","syncMode":"auto-github"})).unwrap();
        assert_eq!(updated["id"], id);
        assert_eq!(updated["folderPath"], review["candidatePath"]);
        assert_eq!(updated["syncMode"], "none");
        assert_eq!(updated["versioningMode"], "none");
        assert_eq!(updated["githubRepository"]["repo"], "original");
        let listed=api.list_projects().into_iter().find(|p|p["id"]==id).unwrap();
        assert_eq!(listed["versioningMode"],"none");assert_eq!(listed["syncMode"],"none");
        assert_eq!(normalize_project_metadata(json!({"githubRepository":{"repo":"legacy"}}))["versioningMode"],"local-git");
        assert_eq!(fs::read(original.join("a.md")).unwrap(), b"Original");
        assert_eq!(
            fs::read(target.join("a.md")).unwrap(),
            b"Different destination"
        );
        assert_eq!(fs::read(draft).unwrap(), b"pending-draft-canary");
        assert!(!target.join(".git").exists());
    }
    #[test]
    fn project_location_review_rejects_stale_registry_private_and_other_project_roots_and_failed_commit(
    ) {
        let (_root, api, id, _original, target) = fixture();
        let review = api
            .review_project_location(&id, json!({"folderPath":target}))
            .unwrap();
        api.update_project(&id, json!({"name":"Changed independently"}))
            .unwrap();
        assert!(api
            .update_project(
                &id,
                json!({"folderPath":target,"locationReview":receipt(&review)})
            )
            .unwrap_err()
            .contains("registro cambió"));
        for path in [
            &api.app_data_dir,
            &api.app_data_dir.parent().unwrap().to_path_buf(),
        ] {
            assert!(api
                .review_project_location(&id, json!({"folderPath":path}))
                .is_err());
        }
        let other=api.create_project(json!({"name":"Other","folderPath":target,"creationMode":"open-local","versioningMode":"none"})).unwrap();
        assert!(api
            .review_project_location(&id, json!({"folderPath":other["folderPath"]}))
            .is_err());
        let free = target.parent().unwrap().join("Free");
        fs::create_dir(&free).unwrap();
        let review = api
            .review_project_location(&id, json!({"folderPath":free}))
            .unwrap();
        let path = api.registry_path();
        let before = fs::read(&path).unwrap();
        let permissions = fs::metadata(&path).unwrap().permissions();
        let mut readonly = permissions.clone();
        readonly.set_readonly(true);
        fs::set_permissions(&path, readonly).unwrap();
        let result = api.update_project(
            &id,
            json!({"folderPath":free,"locationReview":receipt(&review)}),
        );
        fs::set_permissions(&path, permissions).unwrap();
        assert!(result.is_err());
        assert_eq!(fs::read(path).unwrap(), before);
    }
    #[test]
    fn missing_location_with_unrelated_idle_owners_can_still_be_reviewed_and_applied() {
        let (owned, api, id, original, target) = fixture();
        api.project_owners.lock().unwrap().clear();
        fs::rename(&original,owned.path().join("parked-source")).unwrap();
        let other = owned.path().join("other-source");
        api.create_project(json!({"name":"Other idle project","folderPath":other,"versioningMode":"none","syncMode":"none"})).unwrap();
        fs::write(other.join("kept.md"),b"other content").unwrap();
        let review = api.review_project_location(&id,json!({"folderPath":target})).unwrap();
        assert_eq!(review["originalAvailable"],false);
        let updated = api.update_project(&id,json!({"folderPath":target,"locationReview":receipt(&review)})).unwrap();
        assert_eq!(updated["id"],id);
        assert!(!original.exists());
        assert_eq!(fs::read(other.join("kept.md")).unwrap(),b"other content");
    }
    #[test]
    fn missing_alias_of_another_registered_project_cannot_share_the_reviewed_target() {
        let (owned, api, id, _original, target) = fixture();
        let other = api.create_project(json!({"name":"Other alias owner","folderPath":target,"versioningMode":"none","syncMode":"none"})).unwrap();
        let other_id = other["id"].as_str().unwrap();
        let intermediate = owned.path().join("other-alias-parent");
        fs::create_dir(&intermediate).unwrap();
        let alias = intermediate.join("..").join(target.file_name().unwrap());
        api.update_project_fields(other_id, |project| project["folderPath"] = json!(alias)).unwrap();
        fs::remove_dir(&intermediate).unwrap();
        let before = fs::read(api.registry_path()).unwrap();
        assert!(api.review_project_location(&id,json!({"folderPath":target})).is_err());
        assert_eq!(fs::read(api.registry_path()).unwrap(),before);
        assert!(target.is_dir());
    }
    #[test]
    fn reviewed_location_does_not_absorb_changes_during_target_admission() {
        for change in ["entry", "root"] {
            let (owned, api, id, original, target) = fixture();
            api.project_owners.lock().unwrap().clear();
            fs::rename(&original, owned.path().join("parked-source")).unwrap();
            let review = api.review_project_location(&id,json!({"folderPath":target})).unwrap();
            let before = fs::read(api.registry_path()).unwrap();
            let result = api.update_project_with_location_hooks(&id,json!({"folderPath":target,"locationReview":receipt(&review)}),|| {
                if change == "root" {
                    fs::rename(&target,owned.path().join("parked-target")).unwrap();
                    fs::create_dir(&target).unwrap();
                }
                fs::write(target.join("unreviewed.md"),b"unreviewed target content").unwrap();
            },||{});
            assert!(result.is_err(), "destination change was adopted: {change}");
            assert_eq!(fs::read(api.registry_path()).unwrap(),before);
            assert_eq!(fs::read(target.join("unreviewed.md")).unwrap(),b"unreviewed target content");
            assert!(!original.exists());
        }
    }
    #[test]
    fn missing_location_alias_never_bypasses_a_retained_source_writer() {
        let (owned, api, id, original, target) = fixture();
        let intermediate = original.parent().unwrap().join("owned-alias-parent");
        fs::create_dir(&intermediate).unwrap();
        let alias = intermediate.join("..").join(original.file_name().unwrap());
        api.update_project_fields(&id, |project| project["folderPath"] = json!(alias)).unwrap();
        let _writer = api.project_write(&id).unwrap();
        // Only an empty, owned intermediary disappears. The source and its lease stay intact.
        fs::remove_dir(&intermediate).unwrap();
        let review = api.review_project_location(&id,json!({"folderPath":target})).unwrap();
        assert_eq!(review["originalAvailable"],false);
        let before = fs::read(api.registry_path()).unwrap();
        assert!(api.update_project(&id,json!({"folderPath":target,"locationReview":receipt(&review)})).is_err());
        assert_eq!(fs::read(api.registry_path()).unwrap(),before);
        assert!(original.is_dir());
        assert!(owned.path().is_dir());
    }
    #[test]
    fn reviewed_missing_location_rechecks_origin_registry_and_target_after_admission() {
        for change in ["origin", "registry", "target"] {
            let (owned, api, id, original, target) = fixture();
            api.project_owners.lock().unwrap().clear();
            let parked = owned.path().join("parked-original");
            fs::rename(&original, &parked).unwrap();
            let review = api.review_project_location(&id, json!({"folderPath":target})).unwrap();
            let after = std::cell::RefCell::new(Vec::new());
            let result = api.update_project_after_location_admission(
                &id, json!({"folderPath":target,"locationReview":receipt(&review)}), || {
                    match change {
                        "origin" => fs::create_dir(&original).unwrap(),
                        "registry" => { api.update_project_fields(&id, |project| project["name"] = json!("Newer registry edit")).unwrap(); },
                        "target" => fs::write(target.join("newer.md"), b"newer target bytes").unwrap(),
                        _ => unreachable!(),
                    }
                    *after.borrow_mut() = fs::read(api.registry_path()).unwrap();
                },
            );
            assert!(result.is_err(), "unreviewed change was accepted: {change}");
            assert_eq!(fs::read(api.registry_path()).unwrap(), *after.borrow());
            assert!(parked.is_dir());
            if change == "target" { assert_eq!(fs::read(target.join("newer.md")).unwrap(), b"newer target bytes"); }
        }
    }
    #[test]
    fn project_location_review_allows_missing_original_but_rejects_changed_destination_and_coordinates_recordings(
    ) {
        let (_root, api, id, original, target) = fixture();
        api.project_owners.lock().unwrap().clear();
        fs::rename(&original, _root.path().join("parked-original")).unwrap();
        let review = api
            .review_project_location(&id, json!({"folderPath":target}))
            .unwrap();
        assert_eq!(review["originalAvailable"], false);
        fs::remove_dir(&target).unwrap();
        assert!(api
            .update_project(
                &id,
                json!({"folderPath":target,"locationReview":receipt(&review)})
            )
            .is_err());
        fs::create_dir(&target).unwrap();
        let fresh = api
            .review_project_location(&id, json!({"folderPath":target}))
            .unwrap();
        api.update_project(
            &id,
            json!({"folderPath":target,"locationReview":receipt(&fresh)}),
        )
        .unwrap();
        assert!(!original.exists());
        for status in [
            "recording",
            "paused",
            "ready",
            "queued",
            "transcribing",
            "attention",
        ] {
            assert!(location_recording_blocker(
                &json!({"sessions":[{"destination":{"projectId":id},"status":status}]}),
                &id
            ));
        }
        assert!(!location_recording_blocker(
            &json!({"sessions":[{"destination":{"projectId":"another"},"status":"recording"},{"destination":{"projectId":id},"status":"completed"}]}),
            &id
        ));
        assert!(location_recording_blocker(&json!({}), &id));
        assert_eq!(
            reviewed_location_owner(
                "PUT",
                &format!("/api/projects/{id}"),
                &json!({"locationReview":{}})
            ),
            Some(id)
        );
        assert!(reviewed_location_owner(
            "PUT",
            "/api/projects/p",
            &json!({"name":"Only metadata"})
        )
        .is_none());
        assert_eq!(
            reviewed_location_owner(
                "put",
                "/api/%70rojects/project%2Downed",
                &json!({"locationReview":{}})
            ),
            Some("project-owned".into())
        );
    }
}
