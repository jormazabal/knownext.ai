//! Manual retention only. Never delete unknown files or resume deletion on read.
use super::*;
const RECORD: &str = "retention.json";
const RECORD_LIMIT: u64 = 16 * 1024;
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Record {
    schema_version: u8,
    id: String,
    phase: String,
    created_at: String,
    files: BTreeMap<String, String>,
}
struct Snapshot {
    path: PathBuf,
    record: Option<Record>,
    record_bytes: Option<Vec<u8>>,
    files: BTreeMap<String, String>,
    review: Value,
}
fn filename(name: &str) -> bool {
    name == "manifest.json"
        || STORES
            .iter()
            .any(|(_, file, ..)| name == format!("{file}.original"))
}
fn remove_regular(path: &Path) -> Result<(), String> {
    let metadata = fs::symlink_metadata(path)
        .map_err(|_| "No se puede consultar una entrada antes de retirarla")?;
    if !metadata.is_file() || batch::linked(&metadata) || metadata.permissions().readonly() {
        return Err("La entrada cambió o es de solo lectura; se conserva".into());
    }
    fs::remove_file(path).map_err(|_| "No se confirmó la retirada de una entrada".into())
}
fn record(path: &Path, id: &str) -> Result<(Option<Record>, Option<Vec<u8>>), String> {
    let Some(raw) = bytes(&path.join(RECORD), RECORD_LIMIT)? else {
        return Ok((None, None));
    };
    let value:Record=serde_json::from_slice(&raw).map_err(|_|"La conservación de este punto tiene un formato desconocido; se preservan todos sus archivos")?;
    if value.schema_version != 1
        || value.id != id
        || !matches!(value.phase.as_str(), "archived" | "deleting")
        || OffsetDateTime::parse(&value.created_at, &Rfc3339).is_err()
        || value.files.len() < 2
        || value.files.len() > 4
        || !value.files.contains_key("manifest.json")
        || value.files.iter().any(|(name, hash)| {
            !filename(name) || hash.len() != 64 || !hash.bytes().all(|b| b.is_ascii_hexdigit())
        })
    {
        return Err("Registro de conservación no compatible; no se retiran archivos".into());
    }
    Ok((Some(value), Some(raw)))
}
pub(super) fn status(api: &LocalApi, id: &str) -> Result<String, String> {
    let path = folder(api, id)?;
    Ok(record(&path, id)?
        .0
        .map(|value| value.phase)
        .unwrap_or_else(|| "active".into()))
}
pub(super) fn ensure_active(api: &LocalApi, id: &str) -> Result<(), String> {
    if status(api, id)? != "active" {
        return Err("Este punto está archivado o pendiente de eliminación. Revisa sus copias antes de reabrirlo; no se cambia el estado activo".into());
    }
    Ok(())
}
fn snapshot(api: &LocalApi, id: &str) -> Result<Snapshot, String> {
    if !id.starts_with("migration-") || !request_scope::portable_id(id) {
        return Err("Identidad de punto no válida".into());
    }
    directory(&api.app_data_dir, false)?;
    let root = api.app_data_dir.join("migrations");
    directory(&root, false)?;
    let candidate = root.join(id);
    if fs::symlink_metadata(&candidate)
        .is_err_and(|error| error.kind() == std::io::ErrorKind::NotFound)
    {
        return Ok(Snapshot {
            path: candidate,
            record: None,
            record_bytes: None,
            files: BTreeMap::new(),
            review: json!({"id":id,"phase":"absent","revision":sha256_hex(format!("absent:{id}").as_bytes()),"files":0,"logicalBytes":0,"warnings":["El punto ya no está disponible. Esta lectura no confirma qué operación lo retiró."],"canArchive":false,"canReopen":false,"canDelete":false,"checkedAt":knownext_core::now_iso()}),
        });
    }
    let path = folder(api, id)?;
    let (record, record_bytes) = record(&path, id)?;
    let phase = record
        .as_ref()
        .map(|value| value.phase.as_str())
        .unwrap_or("active");
    let mut warnings = vec![];
    let mut files = BTreeMap::new();
    let mut expected = record
        .as_ref()
        .map(|value| value.files.clone())
        .unwrap_or_default();
    if phase != "deleting" {
        match journal(api, id) {
            Ok((_, manifest, hash)) => {
                files.insert("manifest.json".into(), hash);
                for entry in manifest["entries"].as_array().unwrap() {
                    let (_, name, store, ..) =
                        STORES.iter().find(|(key, ..)| entry["id"] == *key).unwrap();
                    let name = format!("{name}.original");
                    match bytes(&path.join(&name),LIMIT){Ok(Some(raw)) if sha256_hex(&raw)==entry["before"]&&local_state::decode(*store,&raw).is_ok_and(|value|!secret_fields(&value))=>{files.insert(name,sha256_hex(&raw));},_=>warnings.push("Una copia original falta, cambió o no es compatible; se conserva el punto.".to_string())}
                }
            }
            Err(_) => warnings.push(
                "El diario no es conocido y completo; no se autoriza eliminar este punto.".into(),
            ),
        }
        if phase == "active" {
            expected = files.clone();
        } else if expected != files {
            warnings.push(
                "El contenido cambió después del archivo; se conserva sin reabrir ni eliminar."
                    .into(),
            );
        }
    }
    // Read only a fixed, small cohort. Any extra file/directory blocks cleanup.
    let mut entries = 0;
    for entry in fs::read_dir(&path).map_err(|_| "No se puede consultar el punto")? {
        entries += 1;
        if entries > 6 {
            warnings.push("Hay entradas inesperadas; se conservan sin eliminar.".into());
            break;
        }
        let entry = entry.map_err(|_| "No se pudo consultar una entrada del punto")?;
        let name = entry.file_name();
        let Some(name) = name.to_str() else {
            warnings.push("Hay un nombre no compatible; se conserva.".into());
            continue;
        };
        if name == RECORD {
            continue;
        }
        if !expected.contains_key(name) {
            warnings
                .push("Hay un archivo no incluido en la revisión; se conserva el punto.".into());
        }
    }
    let mut remaining = vec![];
    let mut logical_bytes = 0u64;
    for (name, hash) in &expected {
        match bytes(
            &path.join(name),
            if name == "manifest.json" {
                MANIFEST_LIMIT
            } else {
                LIMIT
            },
        ) {
            Ok(Some(raw)) if sha256_hex(&raw) == *hash => {
                let compatible = if name == "manifest.json" {
                    serde_json::from_slice::<Value>(&raw)
                        .is_ok_and(|value| valid_manifest(&value, id).is_ok())
                } else {
                    STORES
                        .iter()
                        .find(|(_, file, ..)| name == &format!("{file}.original"))
                        .is_some_and(|(_, _, store, ..)| {
                            local_state::decode(*store, &raw)
                                .is_ok_and(|value| !secret_fields(&value))
                        })
                };
                if !compatible {
                    warnings.push(
                        "Una entrada no tiene formato conocido; se conserva sin eliminar.".into(),
                    );
                }
                logical_bytes = logical_bytes.saturating_add(raw.len() as u64);
                remaining.push(name.clone());
            }
            Ok(None) if phase == "deleting" => (),
            _ => warnings.push("Una entrada falta o cambió; se conserva el punto.".into()),
        }
    }
    let safe = warnings.is_empty() && expected.len() >= 2;
    let revision=sha256_hex(&serde_json::to_vec(&json!({"record":record_bytes.as_ref().map(|bytes|sha256_hex(bytes)),"expected":expected,"remaining":remaining,"warnings":warnings})).map_err(|_|"No se pudo preparar revisión de conservación")?);
    let review = json!({"id":id,"phase":phase,"revision":revision,"files":remaining.len(),"logicalBytes":logical_bytes,"warnings":warnings,"canArchive":safe&&phase=="active","canReopen":safe&&phase=="archived","canDelete":safe&&phase!="active","checkedAt":knownext_core::now_iso()});
    Ok(Snapshot {
        path,
        record,
        record_bytes,
        files: expected,
        review,
    })
}
fn write_record(state: &Snapshot, value: &Record) -> Result<Vec<u8>, String> {
    if bytes(&state.path.join(RECORD), RECORD_LIMIT)? != state.record_bytes {
        return Err("La conservación cambió; consulta el punto antes de otra acción".into());
    }
    let raw = serde_json::to_vec_pretty(value).map_err(|_| "No se pudo preparar conservación")?;
    if state.record_bytes.is_some() {
        atomic_io::write(&state.path.join(RECORD), &raw)
    } else {
        atomic_io::create(&state.path.join(RECORD), &raw)
    }
    .map_err(|_| "No se confirmó el registro de conservación; consulta antes de repetir")?;
    if bytes(&state.path.join(RECORD), RECORD_LIMIT)?.as_deref() != Some(raw.as_slice()) {
        return Err("No se confirmó el registro escrito; consulta antes de otra acción".into());
    }
    Ok(raw)
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Request {
    revision: String,
    action: String,
    confirm_delete: Option<bool>,
}
impl LocalApi {
    pub(crate) fn review_upgrade_retention(&self, id: &str) -> Result<Value, String> {
        Ok(snapshot(self, id)?.review)
    }
    pub(crate) fn change_upgrade_retention(
        &self,
        id: &str,
        payload: Value,
    ) -> Result<Value, String> {
        let request: Request = serde_json::from_value(payload)
            .map_err(|_| "Se necesita una acción y revisión conocidas")?;
        let mut state = snapshot(self, id)?;
        let permission = match request.action.as_str() {
            "archive" => "canArchive",
            "reopen" => "canReopen",
            "delete" if request.confirm_delete == Some(true) => "canDelete",
            _ => return Err("No se ha confirmado una acción de conservación válida".into()),
        };
        if state.review["revision"] != request.revision || state.review[permission] != true {
            return Err("El punto cambió o no permite esta acción. Se conservan sus archivos; vuelve a revisar".into());
        }
        if request.action == "archive" {
            write_record(
                &state,
                &Record {
                    schema_version: 1,
                    id: id.into(),
                    phase: "archived".into(),
                    created_at: knownext_core::now_iso(),
                    files: state.files.clone(),
                },
            )?;
        } else if request.action == "reopen" {
            if bytes(&state.path.join(RECORD), RECORD_LIMIT)? != state.record_bytes {
                return Err("El registro cambió; se conserva".into());
            }
            remove_regular(&state.path.join(RECORD))
                .map_err(|_| "No se confirmó la reapertura; consulta antes de repetir")?;
        } else {
            let mut record = state
                .record
                .clone()
                .ok_or("Solo se eliminan puntos archivados revisados")?;
            record.phase = "deleting".into();
            state.record_bytes = Some(write_record(&state, &record)?);
            state.record = Some(record);
            // Each remaining file is known by exact name/hash. No recursive removal.
            let mut names = state
                .files
                .keys()
                .filter(|name| name.as_str() != "manifest.json")
                .cloned()
                .collect::<Vec<_>>();
            names.push("manifest.json".into());
            for name in names {
                let current = snapshot(self, id)?;
                if current.review["canDelete"] != true || current.record_bytes != state.record_bytes
                {
                    return Ok(
                        json!({"id":id,"status":"review-required","message":"La eliminación se detuvo; se conservan los archivos restantes. Revisa antes de continuar.","checkedAt":knownext_core::now_iso()}),
                    );
                }
                if let Some(raw) = bytes(&state.path.join(&name), LIMIT)? {
                    if state.files.get(&name) != Some(&sha256_hex(&raw)) {
                        return Err("Una entrada cambió; se conserva sin eliminar".into());
                    }
                    if remove_regular(&state.path.join(&name)).is_err() {
                        return Ok(
                            json!({"id":id,"status":"review-required","message":"No se pudo retirar una entrada. Revisa la eliminación pendiente; no se reanuda automáticamente.","checkedAt":knownext_core::now_iso()}),
                        );
                    }
                }
            }
            let current = snapshot(self, id)?;
            if current.review["canDelete"] != true || current.record_bytes != state.record_bytes {
                return Err("El punto cambió al terminar; se conserva su registro".into());
            }
            remove_regular(&state.path.join(RECORD))
                .map_err(|_| "Los archivos están retirados; no se confirmó el último registro")?;
            let empty = fs::remove_dir(&state.path).is_ok();
            return Ok(
                json!({"id":id,"status":if empty{"deleted"}else{"review-required"},"message":if empty{"Punto eliminado. Los documentos y estados activos se conservan."}else{"Las copias conocidas se retiraron; hay una carpeta que requiere revisión. No se elimina recursivamente."},"checkedAt":knownext_core::now_iso()}),
            );
        }
        Ok(
            json!({"id":id,"status":if request.action=="archive"{"archived"}else{"active"},"message":if request.action=="archive"{"Punto archivado; todas sus copias se conservan y no se restauran hasta reabrirlo."}else{"Punto reabierto; vuelve a revisar sus estados antes de recuperar."},"checkedAt":knownext_core::now_iso()}),
        )
    }
}
