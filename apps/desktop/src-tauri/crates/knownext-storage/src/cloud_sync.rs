//! Reviewed local cloud-association attempts. No remote acknowledgement is inferred.
use super::*;
use std::{fs, io::Read};
mod reconcile;
static GATE: std::sync::Mutex<()> = std::sync::Mutex::new(());
const STATE_LIMIT: u64 = 256 * 1024;
const FILE_LIMIT: u64 = 64 * 1024 * 1024;
const TOTAL_LIMIT: u64 = 512 * 1024 * 1024;
fn hash(value: &Value) -> String {
    sha256_hex(&serde_json::to_vec(value).expect("JSON value"))
}
fn regular_directory(path: &Path) -> Result<(), String> {
    let meta = fs::symlink_metadata(path).map_err(|_| "La carpeta no está disponible")?;
    if !meta.is_dir() || batch::linked(&meta) {
        return Err("La carpeta no es un directorio local regular".into());
    }
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    fn fixture() -> (tempfile::TempDir, LocalApi, String, PathBuf) {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().join("project");
        let api = LocalApi::new(temp.path().join("state"), "qa".into(), "test".into());
        let project=api.create_project(json!({"name":"Cloud review","folderPath":root,"versioningMode":"none","syncMode":"none"})).unwrap();
        fs::write(root.join("Original.md"), b"# Original").unwrap();
        (temp, api, project["id"].as_str().unwrap().into(), root)
    }
    #[test]
    fn cloud_sync_review_never_activates_unconnected_cloud() {
        let (_temp, api, id, root) = fixture();
        let before = api.registry_checked().unwrap();
        let review = api
            .cloud_sync_review(&id, json!({"provider":"onedrive"}))
            .unwrap();
        assert_eq!(review["canApply"], false);
        assert_eq!(review["summary"]["documents"], 1);
        assert!(api
            .cloud_sync_apply(
                &id,
                json!({"id":review["id"],"revision":review["revision"]})
            )
            .is_err());
        assert_eq!(api.registry_checked().unwrap(), before);
        assert_eq!(fs::read(root.join("Original.md")).unwrap(), b"# Original");
        assert_eq!(
            api.cloud_sync_status(&id).unwrap()["sourceProvider"],
            "none"
        );
    }
    #[test]
    fn cloud_sync_local_change_rejects_stale_review() {
        let (_temp, api, id, root) = fixture();
        let review = api
            .cloud_sync_review(&id, json!({"provider":"none"}))
            .unwrap();
        fs::write(root.join("Original.md"), b"# Edited").unwrap();
        assert!(api
            .cloud_sync_apply(
                &id,
                json!({"id":review["id"],"revision":review["revision"]})
            )
            .is_err());
        assert_eq!(fs::read(root.join("Original.md")).unwrap(), b"# Edited");
    }
    #[test]
    fn cloud_sync_local_apply_is_idempotent_and_preserves_identity() {
        let (_temp, api, id, root) = fixture();
        let before = api.registry_checked().unwrap();
        let review = api
            .cloud_sync_review(&id, json!({"provider":"none"}))
            .unwrap();
        let payload = json!({"reviewId":review["id"],"revision":review["revision"]});
        let receipt = api.cloud_sync_apply(&id, payload.clone()).unwrap();
        assert_eq!(api.cloud_sync_apply(&id, payload).unwrap(), receipt);
        assert_eq!(receipt["remoteConfirmed"], false);
        assert_eq!(api.registry_checked().unwrap(), before);
        assert!(root.join("Original.md").exists());
    }
    #[test]
    fn cloud_sync_cancel_is_durable_and_never_applies_later() {
        let (_temp, api, id, _) = fixture();
        let review = api
            .cloud_sync_review(&id, json!({"provider":"google-drive"}))
            .unwrap();
        let payload = json!({"id":review["id"],"revision":review["revision"]});
        let receipt = api.cloud_sync_cancel(&id, payload.clone()).unwrap();
        assert_eq!(receipt["status"], "cancelled");
        assert_eq!(
            api.cloud_sync_cancel(&id, payload.clone()).unwrap(),
            receipt
        );
        assert!(api.cloud_sync_apply(&id, payload).is_err());
        assert!(api.cloud_sync_status(&id).unwrap()["activeMigration"].is_null());
    }
    #[test]
    fn cloud_sync_future_state_is_preserved_and_rejected() {
        let (_temp, api, id, _) = fixture();
        let path = api.cloud_path(&id);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        let bytes = br#"{"schemaVersion":999,"unknown":"preserve"}"#;
        fs::write(&path, bytes).unwrap();
        assert!(api
            .cloud_sync_review(&id, json!({"provider":"none"}))
            .is_err());
        assert_eq!(fs::read(path).unwrap(), bytes);
    }
    #[test]
    fn cloud_sync_reserved_names_are_excluded_before_metadata() {
        let (_temp, api, id, root) = fixture();
        fs::create_dir(root.join(".git")).unwrap();
        fs::write(root.join(".git").join("secret"), b"not transferred").unwrap();
        let reviewed = api
            .cloud_sync_review(&id, json!({"provider":"none"}))
            .unwrap();
        assert_eq!(reviewed["summary"]["history"], "local-only");
        assert_eq!(reviewed["summary"]["resources"], 0);
    }
    #[test]
    fn cloud_sync_local_mode_never_silently_disconnects_github() {
        let (_temp, api, id, _) = fixture();
        let mut registry = api.registry_checked().unwrap();
        registry["projects"][0]["syncMode"] = json!("manual-github");
        api.write_registry(&registry).unwrap();
        assert_eq!(
            api.cloud_sync_status(&id).unwrap()["sourceProvider"],
            "github"
        );
        let review = api
            .cloud_sync_review(&id, json!({"provider":"none"}))
            .unwrap();
        assert_eq!(review["canApply"], false);
        assert!(api
            .cloud_sync_apply(
                &id,
                json!({"id":review["id"],"revision":review["revision"]})
            )
            .is_err());
        assert_eq!(api.registry_checked().unwrap(), registry);
    }
    #[test]
    fn cloud_sync_corrupt_binding_and_future_flags_remain_untouched() {
        let (_temp, api, id, _) = fixture();
        let review = api
            .cloud_sync_review(&id, json!({"provider":"none"}))
            .unwrap();
        let original = api.cloud_load(&id).unwrap();
        for alteration in [
            json!({"provider":"onedrive","verified":true}),
            json!("not-a-binding"),
        ] {
            let mut corrupt = original.clone();
            corrupt["binding"] = alteration;
            let bytes = serde_json::to_vec(&corrupt).unwrap();
            fs::write(api.cloud_path(&id), &bytes).unwrap();
            assert!(api
                .cloud_sync_apply(
                    &id,
                    json!({"id":review["id"],"revision":review["revision"]})
                )
                .is_err());
            assert_eq!(fs::read(api.cloud_path(&id)).unwrap(), bytes);
        }
        let mut future = original;
        future["futureFeatures"] = json!({"trusted":true});
        let bytes = serde_json::to_vec(&future).unwrap();
        fs::write(api.cloud_path(&id), &bytes).unwrap();
        assert!(api.cloud_sync_status(&id).is_err());
        assert_eq!(fs::read(api.cloud_path(&id)).unwrap(), bytes);
    }
    #[test]
    fn cloud_sync_tampered_review_cannot_turn_unverified_cloud_into_success() {
        let (_temp, api, id, _) = fixture();
        let review = api
            .cloud_sync_review(&id, json!({"provider":"onedrive"}))
            .unwrap();
        let mut state = api.cloud_load(&id).unwrap();
        state["activeMigration"]["canApply"] = json!(true);
        let bytes = serde_json::to_vec(&state).unwrap();
        fs::write(api.cloud_path(&id), &bytes).unwrap();
        assert!(api
            .cloud_sync_apply(
                &id,
                json!({"id":review["id"],"revision":review["revision"]})
            )
            .is_err());
        assert_eq!(fs::read(api.cloud_path(&id)).unwrap(), bytes);
    }
    #[test]
    fn cloud_sync_hidden_user_files_are_explicit_omissions() {
        let (_temp, api, id, root) = fixture();
        fs::write(root.join(".user-notes.md"), b"private").unwrap();
        let review = api
            .cloud_sync_review(&id, json!({"provider":"none"}))
            .unwrap();
        // Runtime ownership also creates a reserved directory in this fixture.
        // The user file must be disclosed among the exclusions, independently
        // of those internal entries and filesystem enumeration order.
        assert!(review["summary"]["excludedEntries"]
            .as_array()
            .unwrap()
            .contains(&json!(".user-notes.md")));
        assert!(review["warnings"]
            .as_array()
            .unwrap()
            .iter()
            .any(|v| v.as_str().unwrap().contains(".user-notes.md")));
    }
}
fn reserved(name: &str) -> bool {
    name.starts_with('.')
        || ["owner.lock", "runtime-owner.lock", "capture.lock"]
            .iter()
            .any(|x| name.eq_ignore_ascii_case(x))
}
fn snapshot(root: &Path) -> Result<Value, String> {
    regular_directory(root)?;
    let canonical = root
        .canonicalize()
        .map_err(|_| "No se puede verificar la ubicación local")?;
    let mut stack = vec![(canonical.clone(), String::new())];
    let mut entries = BTreeMap::new();
    let mut bytes = 0u64;
    let mut visited = 0usize;
    let mut excluded = 0usize;
    let mut excluded_names = vec![];
    let mut documents = 0usize;
    while let Some((directory, prefix)) = stack.pop() {
        for entry in
            fs::read_dir(directory).map_err(|_| "No se puede inventariar el proyecto completo")?
        {
            let entry = entry.map_err(|_| "No se pudo enumerar una entrada")?;
            let name = entry
                .file_name()
                .into_string()
                .map_err(|_| "Nombre no portable en el proyecto")?;
            if reserved(&name) {
                excluded += 1;
                if excluded_names.len() < 32 {
                    excluded_names.push(if prefix.is_empty() {
                        name.clone()
                    } else {
                        format!("{prefix}/{name}")
                    });
                }
                continue;
            }
            visited += 1;
            if visited > 10_000 {
                return Err(
                    "El inventario supera 10000 entradas; no se acepta un resultado parcial".into(),
                );
            }
            let relative = if prefix.is_empty() {
                name.clone()
            } else {
                format!("{prefix}/{name}")
            };
            let meta = fs::symlink_metadata(entry.path())
                .map_err(|_| "No se puede verificar una entrada")?;
            if batch::linked(&meta) {
                return Err(
                    "El proyecto contiene enlaces; se conserva sin preparar el cambio".into(),
                );
            }
            if meta.is_dir() {
                entries.insert(relative.clone(), json!({"kind":"directory"}));
                stack.push((entry.path(), relative));
                continue;
            }
            if !meta.is_file() {
                return Err("El proyecto contiene una entrada no regular".into());
            }
            if meta.len() > FILE_LIMIT {
                return Err(
                    "Un archivo supera 64 MiB; revisa el alcance antes de cambiar sincronización"
                        .into(),
                );
            }
            bytes = bytes
                .checked_add(meta.len())
                .ok_or("Inventario fuera de presupuesto")?;
            if bytes > TOTAL_LIMIT {
                return Err(
                    "El inventario supera 512 MiB; no se prepara un conjunto parcial".into(),
                );
            }
            let mut content = Vec::new();
            fs::File::open(entry.path())
                .map_err(|_| "No se puede leer un archivo")?
                .take(FILE_LIMIT + 1)
                .read_to_end(&mut content)
                .map_err(|_| "No se completó la lectura de un archivo")?;
            if content.len() as u64 != meta.len() {
                return Err("El proyecto cambió durante el inventario; revisa otra vez".into());
            }
            if name.to_ascii_lowercase().ends_with(".md")
                || name.to_ascii_lowercase().ends_with(".markdown")
            {
                documents += 1
            }
            entries.insert(
                relative,
                json!({"kind":"file","bytes":content.len(),"sha256":sha256_hex(&content)}),
            );
        }
    }
    let resources = entries.values().filter(|e| e["kind"] == "file").count() - documents;
    Ok(
        json!({"stamp":hash(&json!({"root":canonical,"entries":entries})),"documents":documents,"resources":resources,"bytes":bytes,"excluded":excluded,"excludedEntries":excluded_names,"excludedEntriesTruncated":excluded>32}),
    )
}
impl LocalApi {
    fn cloud_path(&self, project_id: &str) -> PathBuf {
        self.app_data_dir
            .join("cloud-sync")
            .join(format!("{}.json", sha256_hex(project_id.as_bytes())))
    }
    fn cloud_load(&self, id: &str) -> Result<Value, String> {
        let path = self.cloud_path(id);
        match fs::symlink_metadata(path.parent().unwrap()) {
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                return Ok(
                    json!({"schemaVersion":1,"projectId":id,"generation":0,"binding":null,"activeMigration":null,"lastReceipt":null}),
                )
            }
            Err(_) => return Err("No se puede consultar el estado de sincronización".into()),
            Ok(m) if !m.is_dir() || batch::linked(&m) => {
                return Err("El almacén de sincronización no es regular".into())
            }
            _ => {}
        }
        let m = match fs::symlink_metadata(&path) {
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                return Ok(
                    json!({"schemaVersion":1,"projectId":id,"generation":0,"binding":null,"activeMigration":null,"lastReceipt":null}),
                )
            }
            Err(_) => return Err("No se puede consultar el recibo de sincronización".into()),
            Ok(m) => m,
        };
        if !m.is_file() || batch::linked(&m) || m.len() > STATE_LIMIT {
            return Err("Estado de sincronización no regular o fuera de presupuesto".into());
        }
        let mut content = Vec::new();
        fs::File::open(&path)
            .map_err(|_| "No se puede abrir el estado de sincronización")?
            .take(STATE_LIMIT + 1)
            .read_to_end(&mut content)
            .map_err(|_| "No se completó la lectura del estado")?;
        if content.len() as u64 > STATE_LIMIT {
            return Err("Estado de sincronización fuera de presupuesto".into());
        }
        let value: Value = serde_json::from_slice(&content)
            .map_err(|_| "Estado de sincronización ilegible; se conserva")?;
        if value["schemaVersion"] != 1
            || value["projectId"] != id
            || !value["generation"].is_u64()
            || !value.get("binding").is_some_and(Value::is_null)
            || value.as_object().is_none_or(|m| {
                m.keys().any(|k| {
                    ![
                        "schemaVersion",
                        "projectId",
                        "generation",
                        "binding",
                        "activeMigration",
                        "lastReceipt",
                    ]
                    .contains(&k.as_str())
                })
            })
        {
            return Err(
                "Formato de sincronización no compatible; se conserva sin modificar".into(),
            );
        }
        let review = &value["activeMigration"];
        if !review.is_null() {
            let mut material = review.clone();
            let revision = material
                .as_object_mut()
                .and_then(|r| r.remove("revision"))
                .ok_or("Revisión de sincronización incompatible; se conserva")?;
            let can_apply = review["provider"] == "none" && review["sourceProvider"] == "none";
            if revision != hash(&material)
                || review["projectId"] != id
                || review["generation"] != value["generation"]
                || review["canApply"] != can_apply
                || review["status"]
                    != if can_apply {
                        "ready"
                    } else {
                        "requires-connection"
                    }
            {
                return Err(
                    "La revisión de sincronización fue alterada; se conserva sin aplicar".into(),
                );
            }
        }
        let receipt = &value["lastReceipt"];
        if !receipt.is_null()
            && (receipt["remoteConfirmed"] != false
                || receipt["documentsPreserved"] != true
                || !["active-local", "cancelled"]
                    .contains(&receipt["status"].as_str().unwrap_or("")))
        {
            return Err("Recibo de sincronización incompatible; se conserva".into());
        }
        Ok(value)
    }
    fn cloud_project(&self, id: &str) -> Result<(Value, Value, PathBuf), String> {
        let registry = self.registry_checked()?;
        let project = registry["projects"]
            .as_array()
            .and_then(|p| p.iter().find(|p| p["id"] == id))
            .ok_or("Proyecto no registrado")?
            .clone();
        let root = self.project_root(id)?;
        regular_directory(&root)?;
        Ok((registry, project, root))
    }
    pub(super) fn cloud_sync_status(&self, id: &str) -> Result<Value, String> {
        let _gate = GATE
            .lock()
            .map_err(|_| "No se puede coordinar sincronización")?;
        let (_, project, _) = self.cloud_project(id)?;
        let state = self.cloud_load(id)?;
        if self.proton_direct_connected(id)? {
            let direct=self.proton_direct(id,"status",json!(null))?;
            return Ok(json!({"projectId":id,"sourceProvider":"proton-drive","provider":"proton-drive","binding":direct["binding"],"generation":direct["binding"]["generation"],"state":"proton-direct","label":"Proton Drive","detail":direct["detail"],"canApply":false,"activeMigration":null,"lastReceipt":state["lastReceipt"]}));
        }
        if self.proton_sync_is_connected(id)? {
            let proton = self.proton_sync_status(id)?;
            return Ok(json!({"projectId":id,"sourceProvider":"proton-drive","provider":"proton-drive","binding":{"provider":"proton-drive","generation":proton["generation"]},"generation":proton["generation"],"state":"proton-folder","label":"Proton Drive mediante carpeta","detail":"La asociación de intercambio está activa. La entrega en carpeta no confirma la subida a la nube. El intercambio anterior se conserva para recuperación; no se publica desde él.","canApply":false,"activeMigration":null,"lastReceipt":state["lastReceipt"]}));
        }
        let github = project["syncMode"]
            .as_str()
            .is_some_and(is_github_sync_mode);
        let source = if github {
            "github"
        } else {
            state["binding"]["provider"].as_str().unwrap_or("none")
        };
        Ok(
            json!({"projectId":id,"sourceProvider":source,"provider":source,"binding":state["binding"],"generation":state["generation"],"state":if github{"existing-github"}else if source=="none"{"local"}else{"paused"},"label":if github{"GitHub configurado"}else if source=="none"{"Guardado en este dispositivo"}else{"Sincronización pausada"},"detail":"Los documentos e historial locales se conservan. La conexión cloud requiere autenticación y transferencia verificadas.","canApply":false,"activeMigration":state["activeMigration"],"lastReceipt":state["lastReceipt"]}),
        )
    }
    pub(super) fn cloud_sync_review(&self, id: &str, payload: Value) -> Result<Value, String> {
        #[derive(Deserialize)]
        #[serde(rename_all = "camelCase", deny_unknown_fields)]
        struct Input {
            provider: String,
            account_id: Option<String>,
        }
        let input: Input =
            serde_json::from_value(payload).map_err(|_| "Destino de sincronización no válido")?;
        if !["none", "onedrive", "google-drive", "proton-drive"].contains(&input.provider.as_str())
        {
            return Err("Proveedor de sincronización no compatible".into());
        }
        if input
            .account_id
            .as_ref()
            .is_some_and(|v| v.is_empty() || v.len() > 256 || v.chars().any(char::is_control))
        {
            return Err("Identidad de cuenta no válida".into());
        }
        let _gate = GATE
            .lock()
            .map_err(|_| "No se puede coordinar la revisión")?;
        let (registry, project, root) = self.cloud_project(id)?;
        let mut state = self.cloud_load(id)?;
        if state["activeMigration"]["status"] == "switching" {
            return Err("Existe un cambio de asociación pendiente de consulta".into());
        }
        let inventory = snapshot(&root)?;
        let proton_connected = self.proton_sync_status(id)?["connected"] == true || self.proton_direct_connected(id)?;
        let github = project["syncMode"]
            .as_str()
            .is_some_and(is_github_sync_mode);
        let mut blockers = vec![];
        if input.provider != "none" {
            blockers.push("La conexión del proveedor y la transferencia remota todavía no están verificadas. El proyecto continúa en su ubicación actual.")
        }
        if input.provider == "none" && github {
            blockers.push("La desconexión GitHub requiere su flujo actual; esta preparación no modifica GitHub ni su historial.")
        }
        if proton_connected {
            blockers.push("El proyecto tiene una asociación Proton. Revisa la asociación y sus operaciones pendientes antes de elegir otro destino; esta comprobación conserva el intercambio.")
        }
        let can_apply = blockers.is_empty();
        let source = if proton_connected {
            "proton-drive"
        } else if github {
            "github"
        } else {
            state["binding"]["provider"].as_str().unwrap_or("none")
        };
        let mut warnings=vec!["Los borradores, credenciales y estado de dispositivo permanecen locales. El inventario es una revisión, no una transferencia.".to_string()];
        if inventory["excluded"].as_u64().unwrap_or(0) > 0 {
            warnings.push(format!("{} entradas ocultas o internas excluidas (incluidos nombres de usuario que empiezan por punto): {}{}. No se afirma una copia completa del árbol.",inventory["excluded"],inventory["excludedEntries"].as_array().unwrap().iter().filter_map(Value::as_str).collect::<Vec<_>>().join(", "),if inventory["excludedEntriesTruncated"]==true{"… (lista limitada a 32)"}else{""}));
        }
        let mut review = json!({"id":knownext_core::compact_id("cloud-review"),"projectId":id,"provider":input.provider,"sourceProvider":source,"accountId":input.account_id,"status":if can_apply{"ready"}else{"requires-connection"},"canApply":can_apply,"createdAt":knownext_core::now_iso(),"summary":{"documents":inventory["documents"],"resources":inventory["resources"],"bytes":inventory["bytes"],"excluded":inventory["excluded"],"excludedEntries":inventory["excludedEntries"],"excludedEntriesTruncated":inventory["excludedEntriesTruncated"],"history":if root.join(".git").exists(){"local-only"}else{"none"}},"warnings":warnings,"blockers":blockers,"sourceStamp":inventory["stamp"],"registryStamp":hash(&registry),"generation":state["generation"]});
        review["revision"] = json!(hash(&review));
        state["activeMigration"] = review.clone();
        self.write_json(&self.cloud_path(id), &state)?;
        Ok(review)
    }
    pub(super) fn cloud_sync_apply(&self, id: &str, payload: Value) -> Result<Value, String> {
        self.cloud_finish(id, payload, false)
    }
    pub(super) fn cloud_sync_cancel(&self, id: &str, payload: Value) -> Result<Value, String> {
        self.cloud_finish(id, payload, true)
    }
    fn cloud_finish(&self, id: &str, payload: Value, cancel: bool) -> Result<Value, String> {
        #[derive(Deserialize)]
        #[serde(deny_unknown_fields)]
        struct Input {
            #[serde(alias = "reviewId")]
            id: String,
            revision: String,
        }
        let input: Input =
            serde_json::from_value(payload).map_err(|_| "Recibo de sincronización no válido")?;
        let _gate = GATE.lock().map_err(|_| "No se puede coordinar el cambio")?;
        let (registry, project, root) = self.cloud_project(id)?;
        let mut state = self.cloud_load(id)?;
        if state["lastReceipt"]["id"] == input.id
            && state["lastReceipt"]["revision"] == input.revision
        {
            let receipt = state["lastReceipt"].clone();
            if (receipt["status"] == "cancelled") == cancel {
                return Ok(receipt);
            } else {
                return Err("El intento ya finalizó con otro resultado".into());
            }
        }
        let review = state["activeMigration"].clone();
        if review["id"] != input.id || review["revision"] != input.revision {
            return Err("La revisión ya no está vigente; revisa otra vez".into());
        }
        if !cancel {
            if self.proton_sync_status(id)?["connected"] == true || self.proton_direct_connected(id)? {
                return Err("La asociación Proton cambió; conserva sus operaciones pendientes y revisa antes de desconectar".into());
            }
            if review["canApply"] != true || review["provider"] != "none" {
                return Err("No se puede activar una sincronización sin conexión y transferencia verificadas".into());
            }
            if project["syncMode"]
                .as_str()
                .is_some_and(is_github_sync_mode)
            {
                return Err("Este flujo no modifica la asociación GitHub existente".into());
            }
            if review["registryStamp"] != hash(&registry)
                || review["sourceStamp"] != snapshot(&root)?["stamp"]
                || review["generation"] != state["generation"]
            {
                return Err(
                    "El proyecto cambió desde la revisión; las fuentes se conservan".into(),
                );
            }
            state["binding"] = Value::Null;
            state["generation"] = json!(state["generation"]
                .as_u64()
                .unwrap()
                .checked_add(1)
                .ok_or("Generación agotada")?);
        }
        let receipt = json!({"id":input.id,"revision":input.revision,"projectId":id,"status":if cancel{"cancelled"}else{"active-local"},"provider":if cancel{review["sourceProvider"].clone()}else{json!("none")},"generation":state["generation"],"completedAt":knownext_core::now_iso(),"remoteConfirmed":false,"documentsPreserved":true});
        state["activeMigration"] = Value::Null;
        state["lastReceipt"] = receipt.clone();
        self.write_json(&self.cloud_path(id), &state)?;
        Ok(receipt)
    }
}
