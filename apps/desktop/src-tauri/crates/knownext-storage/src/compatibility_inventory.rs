//! Bounded format review delegates acceptance to the same codecs used by writers.
use super::*;
use std::{fs, io::Read, time::Instant};
const BUDGET: u64 = 64 * 1024 * 1024;
fn coordination(name: &str) -> bool {
    matches!(
        name.to_ascii_lowercase().as_str(),
        "owner.lock" | "runtime-owner.lock" | "capture.lock"
    )
}
impl LocalApi {
    pub(super) fn project_protection_summary(&self, project: &str) -> Result<Value, String> {
        let registry = self.registry_checked()?;
        let entry = registry["projects"]
            .as_array()
            .and_then(|p| p.iter().find(|p| p["id"] == project))
            .ok_or("Proyecto no disponible")?;
        let root = self.project_root(project)?;
        let root_available =
            fs::symlink_metadata(&root).is_ok_and(|m| m.is_dir() && !batch::linked(&m));
        let history = entry["versioningMode"]
            .as_str()
            .is_some_and(|m| m != "none");
        let history_available = root_available
            && fs::symlink_metadata(root.join(".git"))
                .is_ok_and(|m| m.is_dir() && !batch::linked(&m))
            && run_local_git(
                local_git_command()
                    .arg("--no-optional-locks")
                    .arg("-C")
                    .arg(&root)
                    .args(["rev-parse", "--is-inside-work-tree"]),
            )
            .is_ok_and(|output| {
                output.status.success() && String::from_utf8_lossy(&output.stdout).trim() == "true"
            });
        let remote = entry["syncMode"].as_str().is_some_and(|m| m != "none");
        let integrity_pending = !root_available || mixed_application_guard::ensure(&root).is_err();
        Ok(
            json!({"schemaVersion":1,"id":format!("protection-{project}"),"projectId":project,"checkedAt":knownext_core::now_iso(),"items":[
          {"id":"files","label":"Guardado local","state":if root_available{"available"}else{"attention"},"message":if root_available{"La ubicación local está accesible. El estado de guardado de cada documento se muestra en el editor."}else{"La ubicación no está accesible o no es regular. Conserva los borradores antes de revincularla."}},
          {"id":"history","label":"Historial","state":if history_available{"available"}else if history{"attention"}else{"disabled"},"message":if history_available{"Historial local disponible. Crear una versión es una acción distinta de guardar el documento."}else if history{"El historial está configurado, pero no se comprobó un almacén local regular."}else{"El historial local no está activado para este proyecto."}},
          {"id":"remote","label":"Copia remota","state":if remote{"not-checked"}else{"disabled"},"message":if remote{"Sincronización configurada. No se ha consultado el servidor ni confirmado una copia remota en esta revisión."}else{"No hay sincronización remota configurada."}},
          {"id":"recovery","label":"Continuidad","state":if integrity_pending{"attention"}else{"available"},"message":if integrity_pending{"Hay una preparación pendiente o una ubicación que requiere revisión. No se reanuda ni se reemplaza trabajo automáticamente."}else{"No se detectó una aplicación mixta pendiente en esta ubicación. Las copias conservadas se revisan por separado."}},
          {"id":"external","label":"Respaldo externo","state":"not-checked","message":"Esta revisión no confirma una copia externa completa. Prepara y verifica un respaldo antes de trasladar o retirar datos."}
        ],"contactsRemote":false,"allDocumentsVerified":false}),
        )
    }
    pub(super) fn compatibility_inventory(&self) -> Result<Value, String> {
        let mut locations: Vec<(String, PathBuf, u64)> = vec![];
        for (name, file, version) in [
            ("Preferencias", "config.json", 3),
            ("Proyectos", "projects.json", 2),
            ("Exportación", "export-template.json", 2),
            ("Notas", "notes.json", 1),
            ("Sesión de acceso", "auth.json", 1),
            ("Acceso pendiente", "github-device.json", 1),
            ("Consumo IA", "ai/usage.json", 2),
            ("Límites IA", "ai/usage-policy.json", 1),
        ] {
            locations.push((name.into(), self.app_data_dir.join(file), version));
        }
        let mut limited = false;
        let registry = match self.registry_checked() {
            Ok(v) => v,
            Err(_) => {
                limited = true;
                json!({"projects":[]})
            }
        };
        let mut project_names = BTreeMap::new();
        let mut owners = BTreeSet::new();
        for p in registry["projects"].as_array().into_iter().flatten() {
            if owners.len() >= 200 {
                limited = true;
                break;
            }
            if let Some(id) = p["id"].as_str() {
                owners.insert(id.to_owned());
                project_names.insert(
                    id.to_owned(),
                    p["name"].as_str().unwrap_or("Proyecto").to_owned(),
                );
            }
        }
        for owner in owners {
            for (label, path) in [
                ("Conversaciones", self.conversation_path(&owner)),
                ("Contexto", self.context_sources_path(&owner)),
                ("Investigaciones", self.research_jobs_path(&owner)),
                (
                    "Política de investigación",
                    self.research_policy_path(&owner),
                ),
                (
                    "Actividad",
                    self.app_data_dir
                        .join("activity")
                        .join(format!("{owner}.json")),
                ),
                ("Índice de imágenes", self.image_index_path(&owner)),
            ] {
                locations.push((
                    format!(
                        "{label} · {}",
                        project_names
                            .get(&owner)
                            .map(String::as_str)
                            .unwrap_or("Proyecto")
                    ),
                    path,
                    1,
                ));
            }
        }
        let mut entries = vec![];
        let mut bytes = 0u64;
        let started = Instant::now();
        for (label, path, current) in locations {
            if started.elapsed() > Duration::from_secs(5) {
                limited = true;
                break;
            }
            let rel = path
                .strip_prefix(&self.app_data_dir)
                .map_err(|_| "Ubicación no compatible")?;
            let id = sha256_hex(rel.to_string_lossy().as_bytes());
            if rel
                .components()
                .any(|p| coordination(&p.as_os_str().to_string_lossy()))
            {
                continue;
            }
            let mut cursor = self.app_data_dir.clone();
            let mut linked = false;
            for component in rel.components() {
                cursor.push(component);
                if fs::symlink_metadata(&cursor).is_ok_and(|m| batch::linked(&m)) {
                    linked = true;
                    break;
                }
            }
            let meta = if linked {
                None
            } else {
                fs::symlink_metadata(&path).ok()
            };
            let row = if linked {
                json!({"id":id,"label":label,"status":"protected","message":"Ubicación enlazada; se conserva sin abrir"})
            } else if let Some(meta) = meta {
                if !meta.is_file()
                    || meta.len() > 32 * 1024 * 1024
                    || meta.len() > BUDGET.saturating_sub(bytes)
                {
                    limited = true;
                    json!({"id":id,"label":label,"status":"not-reviewed","message":"Fuera del presupuesto de lectura; se conserva"})
                } else {
                    let mut raw = vec![];
                    let result = fs::File::open(&path).and_then(|f| {
                        f.take((BUDGET - bytes).min(32 * 1024 * 1024) + 1)
                            .read_to_end(&mut raw)
                    });
                    bytes = bytes.saturating_add(raw.len() as u64);
                    let parsed = if result.is_ok() && bytes <= BUDGET {
                        serde_json::from_slice::<Value>(&raw).ok()
                    } else {
                        None
                    };
                    let validated = parsed.as_ref().map(|value| {
                        local_state::before_write(&self.app_data_dir, &path, value)
                            .and_then(|_| {
                                ancillary_state::before_write(&self.app_data_dir, &path, value)
                            })
                            .and_then(|_| {
                                ai_private_state::before_write(&self.app_data_dir, &path, value)
                            })
                            .and_then(|_| {
                                ai_operational_state::before_write(&self.app_data_dir, &path, value)
                            })
                    });
                    let status = if validated.is_some_and(|r| r.is_ok()) {
                        if parsed
                            .as_ref()
                            .is_some_and(|v| v["schemaVersion"].as_u64() == Some(current))
                        {
                            "compatible"
                        } else {
                            "compatible-legacy"
                        }
                    } else {
                        "protected"
                    };
                    json!({"id":id,"label":label,"status":status,"sourceVersion":parsed.as_ref().and_then(|v|v["schemaVersion"].as_u64()),"currentVersion":current,"byteLength":raw.len(),"message":match status{"compatible"=>"Formato comprobado por su servicio propietario","compatible-legacy"=>"Formato legado compatible; no necesita una conversión destructiva",_=>"Formato ilegible, futuro o incompatible; se conserva y no se sustituye por valores vacíos"}})
                }
            } else {
                match fs::symlink_metadata(&path) {
                    Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                        json!({"id":id,"label":label,"status":"absent","message":"Todavía no hay un archivo; no se ha creado"})
                    }
                    _ => {
                        limited = true;
                        json!({"id":id,"label":label,"status":"not-reviewed","message":"No se pudo comprobar el archivo; se conserva"})
                    }
                }
            };
            entries.push(row);
        }
        Ok(
            json!({"schemaVersion":1,"entries":entries,"limited":limited,"scope":"registered-projects-and-profile-json","checkedAt":knownext_core::now_iso(),"bytesRead":bytes,"writes":false,"credentialsContentIncluded":false,"message":"Revisión de formatos, sin modificar originales ni regenerar cachés. Documentos, historial y grabaciones conservan sus formatos propios."}),
        )
    }
    pub(super) fn preserve_auxiliary_format_transition(
        &self,
        destination: &Path,
        value: &Value,
    ) -> Result<(), String> {
        let relative = destination
            .strip_prefix(&self.app_data_dir)
            .map_err(|_| "Ubicación no compatible")?;
        let parts = relative
            .components()
            .map(|p| p.as_os_str().to_string_lossy().into_owned())
            .collect::<Vec<_>>();
        let supported = matches!(parts.as_slice(),[file]if matches!(file.as_str(),"notes.json"|"auth.json"|"github-device.json"))
            || matches!(parts.as_slice(),[folder,file]if matches!(folder.as_str(),"ai"|"ai-context"|"ai-research"|"activity"|"image-index")&&file.ends_with(".json"));
        if !supported {
            return Ok(());
        }
        let raw = match fs::symlink_metadata(destination) {
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(()),
            Ok(m) if m.is_file() && !batch::linked(&m) && m.len() <= 32 * 1024 * 1024 => {
                let mut raw = vec![];
                fs::File::open(destination)
                    .map_err(|_| "No se pudo conservar el formato anterior")?
                    .take(32 * 1024 * 1024 + 1)
                    .read_to_end(&mut raw)
                    .map_err(|_| "Copia anterior incompleta")?;
                if raw.len() > 32 * 1024 * 1024 {
                    return Err("El formato anterior creció fuera de límites".into());
                }
                raw
            }
            _ => return Err("No se puede comprobar el formato anterior; se conserva".into()),
        };
        let original: Value =
            serde_json::from_slice(&raw).map_err(|_| "Formato anterior ilegible; se conserva")?;
        if original.get("schemaVersion") == value.get("schemaVersion") {
            return Ok(());
        }
        // Authentication is handled by native protection; never create a plaintext credential copy.
        if matches!(parts.as_slice(),[file]if matches!(file.as_str(),"auth.json"|"github-device.json"))
        {
            return Err(
                "El formato de acceso necesita protección nativa antes de convertirse".into(),
            );
        }
        let parent = self.app_data_dir.join("state-recovery");
        match fs::symlink_metadata(&parent) {
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                fs::create_dir(&parent).map_err(|_| "No se pudo preparar la copia anterior")?
            }
            Ok(m) if m.is_dir() && !batch::linked(&m) => (),
            _ => return Err("La carpeta de recuperación no es regular".into()),
        }
        let folder = parent.join(knownext_core::compact_id("format"));
        fs::create_dir(&folder).map_err(|_| "No se pudo reservar la copia anterior")?;
        atomic_io::create(&folder.join("original.bin"), &raw)
            .map_err(|_| "No se confirmó la copia original; el formato no se cambia")?;
        let manifest = json!({"schemaVersion":1,"kind":"auxiliary-format-original","sourceId":sha256_hex(relative.to_string_lossy().as_bytes()),"beforeVersion":original.get("schemaVersion"),"afterVersion":value.get("schemaVersion"),"beforeSha256":sha256_hex(&raw),"createdAt":knownext_core::now_iso(),"automaticRestore":false});
        atomic_io::create(
            &folder.join("manifest.json"),
            &serde_json::to_vec(&manifest).map_err(|_| "No se pudo preparar el manifiesto")?,
        )
        .map_err(|_| "No se confirmó el manifiesto; el formato no se cambia")?;
        if fs::read(destination).map_err(|_| "No se pudo comprobar el original")? != raw
            || fs::read(folder.join("original.bin")).map_err(|_| "No se pudo comprobar la copia")?
                != raw
        {
            return Err("El formato cambió durante la conservación; se preservan ambas copias sin sustituirlo".into());
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn lifecycle_format_inventory_preserves_legacy_future_and_corrupt_caches_without_network() {
        let owned = tempfile::tempdir().unwrap();
        let api = LocalApi::new(owned.path().join("state"), "2.6.0".into(), "test".into());
        let p = api
            .create_project(
                json!({"name":"Owned format QA","versioningMode":"none","syncMode":"none"}),
            )
            .unwrap();
        let id = p["id"].as_str().unwrap();
        fs::write(api.notes_path(), br#"{"markdown":"Owned legacy note"}"#).unwrap();
        fs::create_dir_all(api.app_data_dir.join("image-index")).unwrap();
        let future = br#"{"schemaVersion":99,"images":[],"doNotNormalize":true}"#;
        fs::write(api.image_index_path(id), future).unwrap();
        fs::create_dir_all(api.app_data_dir.join("ai-context")).unwrap();
        fs::write(api.context_sources_path(id), b"broken-owned-json").unwrap();
        let review = api.compatibility_inventory().unwrap();
        assert_eq!(review["writes"], false);
        assert_eq!(review["credentialsContentIncluded"], false);
        let rows = review["entries"].as_array().unwrap();
        assert!(rows
            .iter()
            .any(|r| r["label"] == "Notas" && r["status"] == "compatible-legacy"));
        assert!(rows.iter().any(|r| r["label"]
            .as_str()
            .is_some_and(|label| label.starts_with("Índice de imágenes"))
            && r["status"] == "protected"));
        assert!(rows.iter().any(|r| r["label"]
            .as_str()
            .is_some_and(|label| label.starts_with("Contexto"))
            && r["status"] == "protected"));
        assert_eq!(fs::read(api.image_index_path(id)).unwrap(), future);
        assert!(!api.app_data_dir.join("state-recovery").exists());
        let summary = api.project_protection_summary(id).unwrap();
        assert_eq!(summary["contactsRemote"], false);
        assert_eq!(summary["allDocumentsVerified"], false);
        assert!(summary["items"]
            .as_array()
            .unwrap()
            .iter()
            .any(|i| i["id"] == "external" && i["state"] == "not-checked"));
    }
    #[test]
    fn lifecycle_auxiliary_format_change_keeps_exact_original_and_refuses_future() {
        let owned = tempfile::tempdir().unwrap();
        let api = LocalApi::new(owned.path().join("state"), "2.6.0".into(), "test".into());
        let original = br#"{"markdown":"Owned exact legacy bytes"}"#;
        fs::write(api.notes_path(), original).unwrap();
        api.write_json(
            &api.notes_path(),
            &json!({"schemaVersion":1,"markdown":"Owned updated note"}),
        )
        .unwrap();
        let folder = fs::read_dir(api.app_data_dir.join("state-recovery"))
            .unwrap()
            .next()
            .unwrap()
            .unwrap()
            .path();
        assert_eq!(fs::read(folder.join("original.bin")).unwrap(), original);
        let count = fs::read_dir(api.app_data_dir.join("state-recovery"))
            .unwrap()
            .count();
        api.write_json(
            &api.notes_path(),
            &json!({"schemaVersion":1,"markdown":"Next edit"}),
        )
        .unwrap();
        assert_eq!(
            fs::read_dir(api.app_data_dir.join("state-recovery"))
                .unwrap()
                .count(),
            count
        );
        let future = br#"{"schemaVersion":99,"markdown":"Owned future"}"#;
        fs::write(api.notes_path(), future).unwrap();
        assert!(api
            .write_json(
                &api.notes_path(),
                &json!({"schemaVersion":1,"markdown":"Unsafe"})
            )
            .is_err());
        assert_eq!(fs::read(api.notes_path()).unwrap(), future);
    }
}
