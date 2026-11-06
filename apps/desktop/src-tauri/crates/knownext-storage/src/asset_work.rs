//! Prepare under mutation authority, calculate outside it, recheck before publication.
use super::*;
use file_imports::PublicationFailure;
use std::{fs, sync::Mutex, time::Instant};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AssetWorkKind {
    Import,
    Images,
}
pub fn asset_work_request(method: &str, path: &str) -> Option<(String, AssetWorkKind)> {
    if !method.eq_ignore_ascii_case("POST") {
        return None;
    }
    let (path, _) = split_path(path);
    let parts: Vec<_> = path.trim_matches('/').split('/').collect();
    match parts.as_slice() {
        ["api", "projects", project, "attachments"]
        | ["api", "projects", project, "assets", "images"] => Some((
            knownext_core::percent_decode(project),
            AssetWorkKind::Import,
        )),
        ["api", "projects", project, "assets", "reindex-images"] => Some((
            knownext_core::percent_decode(project),
            AssetWorkKind::Images,
        )),
        _ => None,
    }
}
pub(super) struct ProjectSnapshot {
    pub project: String,
    pub root: PathBuf,
    association: Value,
}
impl ProjectSnapshot {
    pub fn new(api: &LocalApi, project: &str) -> Result<Self, String> {
        let association = Self::association(api, project)?;
        let root = api
            .project_root(project)?
            .canonicalize()
            .map_err(|_| "No se puede comprobar la ubicación del proyecto")?;
        Ok(Self {
            project: project.into(),
            root,
            association,
        })
    }
    fn association(api: &LocalApi, project: &str) -> Result<Value, String> {
        let registry = api.registry_checked()?;
        let record = registry["projects"]
            .as_array()
            .and_then(|items| {
                items
                    .iter()
                    .find(|item| item["id"].as_str() == Some(project))
            })
            .ok_or("El proyecto ya no está registrado")?;
        Ok(json!({"id":record["id"],"folderPath":record["folderPath"]}))
    }
    pub fn check(&self, api: &LocalApi) -> Result<(), String> {
        if Self::association(api, &self.project)? != self.association
            || api
                .project_root(&self.project)?
                .canonicalize()
                .ok()
                .as_ref()
                != Some(&self.root)
        {
            return Err("La ubicación del proyecto cambió durante el trabajo. Vuelve a revisar el destino; no se ha repetido la operación".into());
        }
        Ok(())
    }
}
pub fn dispatch_asset_work(
    mutations: &Mutex<LocalApi>,
    queue: &Mutex<()>,
    method: &str,
    path: &str,
    files: Vec<LocalApiFile>,
) -> ApiResult {
    dispatch_with(mutations, queue, method, path, files, || {})
}
fn dispatch_with(
    mutations: &Mutex<LocalApi>,
    queue: &Mutex<()>,
    method: &str,
    path: &str,
    files: Vec<LocalApiFile>,
    calculation_started: impl FnOnce(),
) -> ApiResult {
    let (project, kind) =
        asset_work_request(method, path).ok_or("Trabajo de archivos no compatible")?;
    let _queue = queue
        .lock()
        .map_err(|_| "No se puede reservar el trabajo de archivos")?;
    let (snapshot, source) = {
        let api = mutations
            .lock()
            .map_err(|_| "No se puede preparar el trabajo de archivos")?;
        (ProjectSnapshot::new(&api, &project)?, api.clone())
    };
    if kind == AssetWorkKind::Images {
        calculation_started();
        return super::image_inventory_work::rebuild(mutations, &source, snapshot);
    }
    let (route, query) = split_path(path);
    let image_only = route.trim_end_matches('/').ends_with("/assets/images");
    let mut before_publication=Some(calculation_started);
    let mut result=source.import_file_with_publication(&project,&query,files,image_only,|path,bytes|{
        if let Some(started)=before_publication.take(){started();}
        let api=mutations.lock().map_err(|_|PublicationFailure::ContextChanged("No se puede confirmar el destino".into()))?;
        snapshot.check(&api).map_err(PublicationFailure::ContextChanged)?;
        let _publication=api.project_transaction(&project).map_err(PublicationFailure::ContextChanged)?;
        let parent=path.parent().and_then(|parent|parent.canonicalize().ok()).ok_or_else(||PublicationFailure::ContextChanged("La carpeta de destino cambió".into()))?;
        let pinned=parent.join(path.file_name().ok_or_else(||PublicationFailure::ContextChanged("Falta el nombre de destino".into()))?);
        let relative=pinned.strip_prefix(&snapshot.root).ok().and_then(Path::to_str).ok_or_else(||PublicationFailure::ContextChanged("El destino ya no corresponde al proyecto revisado".into()))?;
        let relative=relative.replace('\\',"/");
        let expected=path_policy::resolve(&snapshot.root,&relative).map_err(PublicationFailure::ContextChanged)?;
        if expected!=pinned{return Err(PublicationFailure::ContextChanged("El destino cambió; vuelve a revisarlo".into()));}
        // Repeat the portable-name check: a different spelling may have appeared
        // while decoding. Exclusive creation still protects the final publication.
        let key=portable_paths::key(path.file_name().and_then(|name|name.to_str()).unwrap_or(""));
        let started=Instant::now();
        for (index,entry) in fs::read_dir(path.parent().ok_or_else(||PublicationFailure::ContextChanged("Destino no válido".into()))?).map_err(PublicationFailure::Io)?.enumerate(){
            if index>=10_000||started.elapsed()>Duration::from_millis(250){return Err(PublicationFailure::ContextChanged("La comprobación del destino supera su presupuesto. Elige una subcarpeta con menos entradas".into()));}
            let name=entry.map_err(PublicationFailure::Io)?.file_name().into_string().map_err(|_|PublicationFailure::ContextChanged("No se puede comprobar un nombre del destino; no se ha importado el archivo".into()))?;
            if portable_paths::key(&name)==key{return Err(PublicationFailure::Io(std::io::Error::new(std::io::ErrorKind::AlreadyExists,"Nombre ocupado")));}
        }
        atomic_io::create(&expected,bytes).map_err(PublicationFailure::Io)
    })?;
    if result.body["importReceipt"]["committed"] == true {
        let api = mutations.lock().map_err(|_| {
            "El archivo se importó; no se pudo comprobar la vista. Consulta el proyecto sin repetir"
        })?;
        if snapshot.check(&api).is_err() {
            result.body["tree"] = json!([]);
            result.body["treeAvailable"]=json!(false);
            result.body["treeWarning"]=json!("Importación confirmada en el destino revisado; el proyecto cambió después. Actualiza la vista sin repetir la importación.");
            result.body["importReceipt"]["treeAvailable"] = json!(false);
            if let Some(warnings) = result.body["warnings"].as_array_mut() {
                warnings.push(json!("El archivo quedó en el destino revisado, pero el proyecto cambió después. Actualiza la vista; no repitas la importación"));
            }
        }
    }
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{mpsc, Arc};
    fn fixture() -> (tempfile::TempDir, Arc<Mutex<LocalApi>>, String, PathBuf) {
        let dir = tempfile::tempdir().unwrap();
        let api = LocalApi::new(dir.path().join("profile"), "qa".into(), "test".into());
        let project = api
            .handle(
                "POST",
                "/api/projects",
                json!({"name":"Owned asset pipeline","versioningMode":"none","syncMode":"none"}),
                vec![],
            )
            .unwrap();
        let id = project.body["id"].as_str().unwrap().to_owned();
        let root = PathBuf::from(project.body["folderPath"].as_str().unwrap());
        (dir, Arc::new(Mutex::new(api)), id, root)
    }
    fn incoming() -> LocalApiFile {
        LocalApiFile {
            field_name: "file".into(),
            name: "Plan.md".into(),
            mime_type: None,
            data_base64: base64::engine::general_purpose::STANDARD.encode(b"incoming"),
        }
    }
    #[test]
    fn asset_pipeline_calculation_releases_mutations_and_publishes_a_verified_receipt() {
        let (_dir, api, project, root) = fixture();
        fs::write(root.join("other.md"),b"original document").unwrap();
        let other_id=doc_id(&project,"other.md");
        let base=api.lock().unwrap().get_document(&other_id).unwrap()["baseFingerprint"].clone();
        let worker = api.clone();
        let worker_project = project.clone();
        let (entered, ready) = mpsc::channel();
        let (resume, wait) = mpsc::channel();
        let thread = std::thread::spawn(move || {
            dispatch_with(
                &worker,
                &Mutex::new(()),
                "POST",
                &format!("/api/projects/{worker_project}/attachments"),
                vec![incoming()],
                || {
                    entered.send(()).unwrap();
                    wait.recv_timeout(Duration::from_secs(5)).unwrap();
                },
            )
        });
        ready.recv_timeout(Duration::from_secs(5)).unwrap();
        {
            let state = api
                .try_lock()
                .expect("calculation must not retain mutation authority");
            let result = state
                .handle(
                    "PUT",
                    &format!("/api/documents/{other_id}"),
                    json!({"markdown":"saved while calculating","baseFingerprint":base}),
                    vec![],
                )
                .unwrap();
            assert_eq!(result.status, 200,"{}",result.body);
        }
        resume.send(()).unwrap();
        let result = thread.join().unwrap().unwrap();
        assert_eq!(result.status, 200,"{}",result.body);
        assert_eq!(result.body["importReceipt"]["committed"], true);
        assert_eq!(fs::read(root.join("Plan.md")).unwrap(), b"incoming");
        assert_eq!(
            fs::read(root.join("other.md")).unwrap(),
            b"saved while calculating"
        );
    }
    #[test]
    fn asset_pipeline_rechecks_portable_aliases_that_appear_after_preparation() {
        let (_dir, api, project, root) = fixture();
        let result = dispatch_with(
            &api,
            &Mutex::new(()),
            "POST",
            &format!("/api/projects/{project}/attachments?collision=keep-both"),
            vec![incoming()],
            || {
                fs::write(root.join("plan.md"), b"concurrent content").unwrap();
            },
        )
        .unwrap();
        assert_eq!(result.body["importReceipt"]["storedName"], "Plan (2).md");
        assert_eq!(
            fs::read(root.join("plan.md")).unwrap(),
            b"concurrent content"
        );
    }
    #[test]
    fn asset_pipeline_refuses_retired_context_and_preserves_source_files() {
        let (_dir, api, project, root) = fixture();
        let result = dispatch_with(
            &api,
            &Mutex::new(()),
            "POST",
            &format!("/api/projects/{project}/attachments"),
            vec![incoming()],
            || {
                let state = api.lock().unwrap();
                let mut registry = state.registry_checked().unwrap();
                registry["projects"] = json!([]);
                state.write_registry(&registry).unwrap();
            },
        );
        let result=result.unwrap();assert_eq!(result.status,409);assert_eq!(result.body["operationOutcome"],"not-started");
        assert!(!root.join("Plan.md").exists());
    }
    #[test]
    fn asset_pipeline_image_endpoint_rejects_attachments_with_or_without_trailing_slash(){
        let (_dir,api,project,root)=fixture();
        for suffix in ["assets/images","assets/images/"]{
            let result=dispatch_asset_work(&api,&Mutex::new(()),"POST",&format!("/api/projects/{project}/{suffix}"),vec![incoming()]).unwrap();
            assert_eq!(result.status,415,"{}",result.body);assert!(!root.join("Plan.md").exists());
        }
    }

    #[test]
    fn asset_pipeline_only_classifies_the_known_routes() {
        assert_eq!(
            asset_work_request("POST", "/api/projects/a%2Db/attachments?collision=reject"),
            Some(("a-b".into(), AssetWorkKind::Import))
        );
        assert_eq!(
            asset_work_request("POST", "/api/projects/p/assets/reindex-images"),
            Some(("p".into(), AssetWorkKind::Images))
        );
        for path in [
            "/api/projects/p/assets/reindex-images/extra",
            "/api/projects/p/documents",
            "/api/projects/p/assets/images/extra",
        ] {
            assert!(asset_work_request("POST", path).is_none());
        }
        assert!(asset_work_request("GET", "/api/projects/p/attachments").is_none());
    }
}
