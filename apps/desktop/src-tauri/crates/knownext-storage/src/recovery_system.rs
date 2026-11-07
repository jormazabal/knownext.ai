//! Read-only discovery of preserved operational originals. Never rollback active state.
use super::*;
use std::{fs, io::Read, time::Instant};
const FILE_LIMIT: u64 = 32 * 1024 * 1024;
const ENTRY_LIMIT: usize = 1000;
const SOURCES: [(&str, &str, &str); 5] = [
    ("usage", "ai/usage-migrations", "Consumo de IA"),
    (
        "sessions",
        "recordings/sessions-recovery",
        "Sesiones de grabación",
    ),
    (
        "recording-settings",
        "recordings/settings-recovery",
        "Preferencias de grabación",
    ),
    (
        "sessions-dev",
        "recordings-dev/sessions-recovery",
        "Sesiones de desarrollo",
    ),
    (
        "recording-settings-dev",
        "recordings-dev/settings-recovery",
        "Preferencias de grabación de desarrollo",
    ),
];
struct Copy {
    id: String,
    group: &'static str,
    label: &'static str,
    name: String,
    path: PathBuf,
    bytes: u64,
    modified: Option<String>,
    regular: bool,
}
fn directory(path: &Path, optional: bool) -> Result<bool, String> {
    match fs::symlink_metadata(path) {
        Ok(meta) if meta.is_dir() && !batch::linked(&meta) => Ok(true),
        Err(error) if optional && error.kind() == std::io::ErrorKind::NotFound => Ok(false),
        _ => Err(
            "Una carpeta de copias no es regular o accesible; se conserva sin recorrerla".into(),
        ),
    }
}
fn digest(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}
fn scan(api: &LocalApi) -> Result<(Vec<Copy>, Vec<String>, bool), String> {
    directory(&api.app_data_dir, false)?;
    let start = Instant::now();
    let mut rows = vec![];
    let mut warnings = vec![];
    let mut visited = 0;
    let mut limited = false;
    for (group, relative, label) in SOURCES {
        let root = api.app_data_dir.join(relative);
        let parent = root
            .parent()
            .ok_or("Origen de recuperación no compatible")?;
        match directory(parent, true) {
            Ok(false) => continue,
            Err(error) => {
                warnings.push(format!("{label}: {error}"));
                continue;
            }
            Ok(true) => (),
        }
        match directory(&root, true) {
            Ok(false) => continue,
            Err(error) => {
                warnings.push(format!("{label}: {error}"));
                continue;
            }
            Ok(true) => (),
        }
        let entries = match fs::read_dir(&root) {
            Ok(entries) => entries,
            Err(_) => {
                warnings.push(format!("{label}: no se pudo consultar su inventario"));
                continue;
            }
        };
        for entry in entries {
            if visited >= ENTRY_LIMIT || start.elapsed() > Duration::from_secs(2) {
                limited = true;
                break;
            }
            visited += 1;
            let entry = match entry {
                Ok(entry) => entry,
                Err(_) => {
                    if warnings.len() < 32 {
                        warnings.push(format!("{label}: una copia no se pudo consultar"));
                    }
                    continue;
                }
            };
            let Some(name) = entry.file_name().to_str().map(str::to_owned) else {
                if warnings.len() < 32 {
                    warnings.push(format!("{label}: un nombre no es compatible; se conserva"));
                }
                continue;
            };
            let metadata = match fs::symlink_metadata(entry.path()) {
                Ok(meta) => meta,
                Err(_) => {
                    if warnings.len() < 32 {
                        warnings.push(format!("{label}: una copia no es accesible"));
                    }
                    continue;
                }
            };
            let regular =
                metadata.is_file() && !batch::linked(&metadata) && metadata.len() <= FILE_LIMIT;
            let modified = metadata.modified().ok().map(|time| {
                OffsetDateTime::from(time)
                    .format(&Rfc3339)
                    .unwrap_or_default()
            });
            rows.push(Copy {
                id: digest(format!("{group}/{name}").as_bytes()),
                group,
                label,
                name,
                path: entry.path(),
                bytes: metadata.len(),
                modified,
                regular,
            });
        }
        if limited {
            break;
        }
    }
    // Only known payload names in known cohort folders; never recurse into a
    // project, a credential store or an arbitrary recovery subdirectory.
    for (group, relative, label, prefix, names) in [
        (
            "state",
            "state-recovery",
            "Estado local conservado",
            "state-",
            &["config.json", "export-template.json"][..],
        ),
        (
            "migration",
            "migrations",
            "Originales de migración",
            "migration-",
            &[
                "config.json.original",
                "projects.json.original",
                "export-template.json.original",
            ][..],
        ),
    ] {
        if limited {
            break;
        }
        let root = api.app_data_dir.join(relative);
        match directory(&root, true) {
            Ok(false) => continue,
            Err(error) => {
                warnings.push(format!("{label}: {error}"));
                continue;
            }
            Ok(true) => (),
        }
        let entries = match fs::read_dir(&root) {
            Ok(entries) => entries,
            Err(_) => {
                warnings.push(format!("{label}: no se pudo consultar su inventario"));
                continue;
            }
        };
        for entry in entries {
            if visited >= ENTRY_LIMIT || start.elapsed() > Duration::from_secs(2) {
                limited = true;
                break;
            }
            visited += 1;
            let entry = match entry {
                Ok(entry) => entry,
                Err(_) => {
                    if warnings.len() < 32 {
                        warnings.push(format!("{label}: una cohorte no se pudo consultar"));
                    }
                    continue;
                }
            };
            let Some(cohort) = entry.file_name().to_str().map(str::to_owned) else {
                continue;
            };
            if !cohort.starts_with(prefix) || !request_scope::portable_id(&cohort) {
                if warnings.len() < 32 {
                    warnings.push(format!("{label}: hay elementos sin identificador de recuperación conocido; se conservan fuera de la revisión"));
                }
                continue;
            }
            if directory(&entry.path(), false).is_err() {
                if warnings.len() < 32 {
                    warnings.push(format!(
                        "{label}: una carpeta de cohorte no es regular; se conserva sin recorrerla"
                    ));
                }
                continue;
            }
            for filename in names {
                if visited >= ENTRY_LIMIT || start.elapsed() > Duration::from_secs(2) {
                    limited = true;
                    break;
                }
                visited += 1;
                let path = entry.path().join(filename);
                let metadata = match fs::symlink_metadata(&path) {
                    Ok(meta) => meta,
                    Err(error) if error.kind() == std::io::ErrorKind::NotFound => continue,
                    Err(_) => {
                        if warnings.len() < 32 {
                            warnings.push(format!("{label}: una copia no es accesible"));
                        }
                        continue;
                    }
                };
                let name = format!("{cohort}/{filename}");
                let regular =
                    metadata.is_file() && !batch::linked(&metadata) && metadata.len() <= FILE_LIMIT;
                let modified = metadata
                    .modified()
                    .ok()
                    .and_then(|time| OffsetDateTime::from(time).format(&Rfc3339).ok());
                rows.push(Copy {
                    id: digest(format!("{group}/{name}").as_bytes()),
                    group,
                    label,
                    name,
                    path,
                    bytes: metadata.len(),
                    modified,
                    regular,
                });
            }
            if limited {
                break;
            }
        }
    }
    rows.sort_by(|a, b| b.modified.cmp(&a.modified).then_with(|| a.id.cmp(&b.id)));
    Ok((rows, warnings, limited))
}
fn selected(api: &LocalApi, id: &str) -> Result<Copy, String> {
    if id.len() != 64 || !id.bytes().all(|b| b.is_ascii_hexdigit()) {
        return Err("Identidad de copia no válida".into());
    }
    let (copies, _, limited) = scan(api)?;
    copies
        .into_iter()
        .find(|copy| copy.id == id)
        .ok_or_else(|| {
            if limited {
                "La copia no figura en esta revisión parcial; vuelve a consultar".into()
            } else {
                "La copia ya no está disponible; no se sustituye su origen".into()
            }
        })
}
fn read(copy: &Copy) -> Result<Vec<u8>, String> {
    for parent in copy.path.ancestors().skip(1).take(3) {
        directory(parent, false)?;
    }
    if !copy.regular {
        return Err(
            "La copia no es un archivo regular dentro del límite de32MiB; se conserva".into(),
        );
    }
    let before = fs::symlink_metadata(&copy.path).map_err(|_| "La copia ya no está disponible")?;
    if !before.is_file() || batch::linked(&before) || before.len() > FILE_LIMIT {
        return Err("La copia cambió o dejó de ser regular; se conserva".into());
    }
    let mut file = fs::File::open(&copy.path).map_err(|_| "No se puede abrir la copia")?;
    let mut bytes = vec![];
    file.by_ref()
        .take(FILE_LIMIT + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| "No se pudo completar la lectura de la copia")?;
    let after =
        fs::symlink_metadata(&copy.path).map_err(|_| "La copia cambió durante la lectura")?;
    if bytes.len() as u64 > FILE_LIMIT
        || bytes.len() as u64 != before.len()
        || before.len() != after.len()
        || before.modified().ok() != after.modified().ok()
        || batch::linked(&after)
    {
        return Err("La copia cambió durante la revisión; actualiza antes de continuar".into());
    }
    Ok(bytes)
}
fn provenance(copy: &Copy, hash: &str) -> &'static str {
    let expected = if copy.group == "usage" {
        copy.name
            .strip_prefix("legacy-")
            .and_then(|name| name.strip_suffix(".json"))
    } else {
        copy.name
            .strip_prefix("usage-origin-")
            .and_then(|name| name.strip_suffix(".json"))
    };
    match expected {
        Some(expected) if expected == hash => "verified-filename-digest",
        Some(_) => "digest-mismatch",
        None => "copy-fingerprint-only",
    }
}
fn summary(copy: &Copy, bytes: &[u8]) -> Value {
    if bytes.len() > 2 * 1024 * 1024 {
        return json!({"format":"not-inspected","message":"El contenido supera2MiB y no se interpreta en esta vista. La exportación conserva todos sus bytes."});
    }
    let Ok(value) = serde_json::from_slice::<Value>(bytes) else {
        return json!({"format":"unreadable","message":"El contenido no es JSON legible. La copia permanece disponible para conservar sus bytes exactos."});
    };
    if matches!(copy.group, "state" | "migration") {
        return json!({"format":"critical-state-copy","message":"Original conservado de configuración, registro o exportación. Este resumen no certifica su compatibilidad; la recuperación del conjunto se comprueba por separado antes de aplicar cambios."});
    }
    if value
        .get("schemaVersion")
        .is_some_and(|version| !matches!(version.as_u64(), Some(1 | 2)))
    {
        return json!({"format":"unknown","message":"Versión no reconocida. No se interpreta, aplica ni migra."});
    }
    if copy.group == "usage" {
        if value
            .get("schemaVersion")
            .is_some_and(|version| !matches!(version.as_u64(), Some(1 | 2)))
        {
            return json!({"format":"unknown","message":"Versión de consumo no reconocida. No se interpreta ni migra."});
        }
        let count = value["entries"].as_array().map(Vec::len);
        return json!({"format":if count.is_some(){"usage"}else{"unknown"},"entries":count,"message":"Copia anterior del consumo. No debe sustituir los agregados o recibos posteriores."});
    }
    if copy.group.starts_with("sessions") {
        if !value["id"].is_string() || !value["chunks"].is_array() {
            return json!({"format":"unknown","message":"Manifiesto de sesión no reconocido. Se conserva sin aplicar."});
        }
        let chunks = value["chunks"].as_array().unwrap();
        let completed = chunks
            .iter()
            .filter(|chunk| chunk["status"] == "completed")
            .count();
        return json!({"format":"recording-session","fragments":chunks.len(),"completedFragments":completed,"durationSeconds":value["samples"].as_u64().map(|samples|samples/24_000),"message":"Manifiesto conservado de una sesión. El audio PCM se conserva por separado; esta copia no contiene el audio."});
    }
    json!({"format":"recording-settings","message":"Copia de preferencias de grabación. Se conserva para revisión; no sustituye automáticamente la configuración actual."})
}
/// Frozen bytes remain in Rust while the user chooses a destination.
pub struct FrozenRecoveryCopy {
    filename: String,
    bytes: Vec<u8>,
    extension: &'static str,
    content_type: &'static str,
}
impl FrozenRecoveryCopy {
    pub(crate) fn project_package(filename:String,bytes:Vec<u8>)->Self{Self{filename,bytes,extension:"zip",content_type:"application/zip"}}
    pub(crate) fn markdown(filename:String,bytes:Vec<u8>)->Self{Self{filename,bytes,extension:"md",content_type:"text/markdown"}}
    pub(crate) fn handwritten(filename:String,bytes:Vec<u8>)->Self{Self{filename,bytes,extension:"knote",content_type:"application/vnd.knownext.handwritten-note+json"}}
    pub fn extension(&self)->&str{self.extension}
    pub fn filename(&self) -> &str {
        &self.filename
    }
    pub fn sha256(&self)->String{digest(&self.bytes)}
    pub fn byte_length(&self)->u64{self.bytes.len() as u64}
    pub fn stage(&self, cache: &Path) -> Result<crate::StagedUserExport, String> {
        export_execution::stage_user_export_bytes(&self.bytes,self.filename.clone(),self.content_type.into(),cache)
    }
}
impl LocalApi {
    pub(super) fn system_recovery_inventory(&self) -> Result<Value, String> {
        let (rows, warnings, limited) = scan(self)?;
        Ok(
            json!({"items":rows.iter().map(|copy|json!({"id":copy.id,"group":copy.group,"groupLabel":copy.label,"name":copy.name,"byteLength":copy.bytes,"modifiedAt":copy.modified,"canReview":copy.regular})).collect::<Vec<_>>(),"warnings":warnings,"limited":limited,"entryLimit":ENTRY_LIMIT,"fileLimit":FILE_LIMIT,"queriedAt":knownext_core::now_iso()}),
        )
    }
    pub(super) fn review_system_recovery(&self, id: &str) -> Result<Value, String> {
        let copy = selected(self, id)?;
        let bytes = read(&copy)?;
        let hash = digest(&bytes);
        let mut result = json!({"id":copy.id,"fingerprint":hash,"byteLength":bytes.len(),"name":copy.name,"groupLabel":copy.label,"provenance":provenance(&copy,&hash),"summary":summary(&copy,&bytes),"canExport":true,"canRestore":false,"checkedAt":knownext_core::now_iso()});
        if copy.group == "migration" {
            result["relatedRecoveryId"] = json!(copy.name.split('/').next());
        }
        if digest(&read(&copy)?) != hash {
            return Err("La copia cambió durante la revisión; vuelve a consultar".into());
        }
        Ok(result)
    }
    pub fn freeze_system_recovery(
        &self,
        id: &str,
        fingerprint: &str,
    ) -> Result<FrozenRecoveryCopy, String> {
        let copy = selected(self, id)?;
        let bytes = read(&copy)?;
        if digest(&bytes) != fingerprint {
            return Err("La copia cambió desde la revisión. No se exporta otro contenido".into());
        }
        Ok(FrozenRecoveryCopy {
            filename: format!("KnowNext-recuperacion-{}.json", &copy.id[..16]),
            bytes,extension:"json",content_type:"application/json",
        })
    }
    pub fn write_system_recovery(
        &self,
        copy: &FrozenRecoveryCopy,
        destination: &Path,
    ) -> Result<u64, String> {
        if !destination.is_absolute()
            || destination
                .extension()
                .and_then(|extension| extension.to_str())
                != Some(copy.extension)
        {
            return Err(format!("Elige un archivo nuevo con extensión .{}",copy.extension));
        }
        let parent = destination
            .parent()
            .ok_or("Falta la carpeta de destino")?
            .canonicalize()
            .map_err(|_| "La carpeta de destino no está disponible")?;
        directory(&parent, false)?;
        if parent.starts_with(
            self.app_data_dir
                .canonicalize()
                .map_err(|_| "No se puede verificar el estado privado")?,
        ) {
            return Err("La copia debe guardarse fuera del estado privado de la aplicación".into());
        }
        let path = parent.join(
            destination
                .file_name()
                .ok_or("Falta el nombre de destino")?,
        );
        let limit=if copy.extension=="zip"{64*1024*1024}else{FILE_LIMIT};
        if copy.bytes.len() as u64>limit{return Err("La copia supera el límite de entrega; el original se conserva".into());}
        atomic_io::create(&path,&copy.bytes).map_err(|_|"El destino ya existe o no se pudo confirmar su creación. Comprueba el destino antes de repetir; no se reemplaza")?;
        if digest(&export_execution::bounded_read(&path, limit)?) != digest(&copy.bytes) {
            return Err("No se confirmó que el destino contenga la copia completa; compruébalo antes de repetir".into());
        }
        Ok(copy.bytes.len() as u64)
    }
}
