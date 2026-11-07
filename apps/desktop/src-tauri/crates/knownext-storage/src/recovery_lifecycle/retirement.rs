//! Payload retirement keeps the permanent identity and requires an exact external backup again.
use super::*;
const NAME: &str = "retirement.json";
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Journal {
    format: u8,
    closure_revision: String,
    archive_sha256: String,
    archive_bytes: u64,
    created_at: String,
}
fn path(api: &LocalApi, key: &str) -> Result<PathBuf, String> {
    if !hash(key) {
        return Err("Identidad no compatible".into());
    }
    let path = api.app_data_dir.join(VAULT).join(key).join(NAME);
    safe_path(api, &path)?;
    Ok(path)
}
pub(super) fn present(api: &LocalApi, key: &str) -> Result<bool, String> {
    match fs::symlink_metadata(path(api, key)?) {
        Ok(_) => Ok(true),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(_) => Err("No se pudo comprobar la retirada; se conserva".into()),
    }
}
fn journal(
    api: &LocalApi,
    key: &str,
    record: &Closure,
) -> Result<Option<(Journal, String)>, String> {
    if !present(api, key)? {
        return Ok(None);
    }
    let raw = read(&path(api, key)?, 4096)?;
    let j: Journal =
        serde_json::from_slice(&raw).map_err(|_| "Retirada desconocida; se conservan sus bytes")?;
    if j.format != 1
        || j.closure_revision != revision(record)?
        || !hash(&j.archive_sha256)
        || j.archive_bytes > LIMIT + 1024 * 1024
        || OffsetDateTime::parse(&j.created_at, &Rfc3339).is_err()
    {
        return Err("Retirada incompatible; se conserva sin continuar".into());
    }
    Ok(Some((j, sha256_hex(&raw))))
}
fn remaining(
    api: &LocalApi,
    record: &Closure,
    started: bool,
) -> Result<BTreeMap<String, Vec<u8>>, String> {
    let source = api.app_data_dir.join(VAULT).join(&record.key).join("data");
    safe_path(api, &source)?;
    let (directory, data, dirs) = match fs::symlink_metadata(&source) {
        Err(e) if e.kind() == std::io::ErrorKind::NotFound && started => {
            (record.directory, BTreeMap::new(), vec![])
        }
        _ => contents(&source)?,
    };
    if directory != record.directory || dirs.iter().any(|d| !record.directories.contains(d)) {
        return Err("Las carpetas conservadas cambiaron; se detiene la retirada".into());
    }
    for proof in proofs(&data) {
        if !record.files.iter().any(|expected| {
            expected.path == proof.path
                && expected.bytes == proof.bytes
                && expected.sha256 == proof.sha256
        }) {
            return Err("Una copia conservada cambió; no se retira ni reemplaza".into());
        }
    }
    if !started && (data.len() != record.files.len() || dirs != record.directories) {
        return Err("La copia está incompleta sin una retirada registrada; se conserva".into());
    }
    Ok(data)
}
pub(super) fn review(api: &LocalApi, family: &str, key: &str) -> Result<Value, String> {
    let record = closure(api, key)?.ok_or("Identidad conservada no disponible")?;
    if record.family != family {
        return Err("La identidad pertenece a otra familia".into());
    }
    let j = journal(api, key, &record)?;
    let data = remaining(api, &record, j.is_some())?;
    let token = if let Some((_, digest)) = &j {
        sha256_hex(
            &serde_json::to_vec(&(revision(&record)?, digest, proofs(&data)))
                .map_err(|_| "Revisión no comprobable")?,
        )
    } else {
        revision(&record)?
    };
    Ok(
        json!({"schemaVersion":1,"family":family,"key":key,"revision":token,"archived":true,"files":record.files,"bytes":data.values().map(|b|b.len()as u64).sum::<u64>(),"remainingFiles":data.len(),"phase":if data.is_empty(){"retired"}else if j.is_some(){"retiring"}else{"closed"},"canClose":false,"canExport":j.is_none(),"canRetire":!data.is_empty(),"affectsWorkingFiles":false,"message":if data.is_empty(){"Bytes retirados. La identidad y las huellas permanecen para impedir repeticiones. Conserva el respaldo externo verificado."}else if j.is_some(){"Retirada parcial registrada. Para continuar, vuelve a elegir el mismo respaldo completo. Consultar no retira archivos."}else{"Identidad cerrada. Puedes guardar un respaldo privado o elegirlo de nuevo para retirar estos bytes locales."}}),
    )
}
fn verify_backup(
    api: &LocalApi,
    record: &Closure,
    external: &Path,
) -> Result<(String, u64), String> {
    if external
        .components()
        .any(|p| coordination(&p.as_os_str().to_string_lossy()))
    {
        return Err("Archivo de coordinación protegido".into());
    }
    let external = external
        .canonicalize()
        .map_err(|_| "El respaldo externo no está disponible")?;
    let private = api
        .app_data_dir
        .canonicalize()
        .map_err(|_| "No se pudo comprobar el almacén")?;
    if external.starts_with(private) {
        return Err("El respaldo debe estar fuera del estado privado de la aplicación".into());
    }
    let raw = read(&external, LIMIT + 1024 * 1024)?;
    let digest = sha256_hex(&raw);
    let length = raw.len() as u64;
    let mut zip = zip::ZipArchive::new(Cursor::new(raw))
        .map_err(|_| "El respaldo no es un ZIP compatible")?;
    if zip.len() != 1 + record.files.len() + record.directories.len() {
        return Err("El respaldo contiene entradas adicionales o incompletas".into());
    }
    let mut names = BTreeSet::new();
    let mut manifest = false;
    for index in 0..zip.len() {
        let mut entry = zip
            .by_index(index)
            .map_err(|_| "No se pudo revisar el respaldo")?;
        let name = entry.name().to_owned();
        if !names.insert(name.clone())
            || entry.unix_mode().is_some_and(|m| m & 0o170000 == 0o120000)
        {
            return Err("El respaldo tiene duplicados o enlaces; se conserva lo local".into());
        }
        if name == "knownext-recovery.json" {
            if entry.size() > 2 * 1024 * 1024 {
                return Err("Manifiesto fuera de límites".into());
            }
            let mut bytes = vec![];
            entry
                .take(2 * 1024 * 1024 + 1)
                .read_to_end(&mut bytes)
                .map_err(|_| "Manifiesto incompleto")?;
            let value: Closure =
                serde_json::from_slice(&bytes).map_err(|_| "Manifiesto no compatible")?;
            if revision(&value)? != revision(record)? {
                return Err("El respaldo pertenece a otra revisión".into());
            }
            manifest = true;
        } else if let Some(name) = name.strip_prefix("Contenido/") {
            if let Some(dir) = name.strip_suffix('/') {
                if !entry.is_dir() || !record.directories.iter().any(|d| d == dir) {
                    return Err("Carpeta ajena al respaldo revisado".into());
                }
            } else {
                let expected = record
                    .files
                    .iter()
                    .find(|f| f.path == name)
                    .ok_or("Archivo ajeno al respaldo revisado")?;
                if entry.is_dir() || entry.size() != expected.bytes {
                    return Err("Tamaño de respaldo distinto".into());
                }
                let mut bytes = vec![];
                entry
                    .by_ref()
                    .take(expected.bytes + 1)
                    .read_to_end(&mut bytes)
                    .map_err(|_| "Respaldo incompleto")?;
                if bytes.len() as u64 != expected.bytes || sha256_hex(&bytes) != expected.sha256 {
                    return Err("La huella del respaldo no coincide; se conserva lo local".into());
                }
            }
        } else {
            return Err("Entrada de respaldo desconocida".into());
        }
    }
    if !manifest {
        return Err("No se comprobó el manifiesto del respaldo".into());
    }
    Ok((digest, length))
}
impl LocalApi {
    pub fn retire_recovery_unit(
        &self,
        family: &str,
        key: &str,
        expected: &str,
        acknowledge: bool,
        external: &Path,
    ) -> Result<Value, String> {
        if !acknowledge {
            return Err("Confirma la retirada permanente antes de elegir el respaldo".into());
        }
        let record =
            closure(self, key)?.ok_or("La identidad no está cerrada; no se retiran archivos")?;
        if record.family != family {
            return Err("La copia pertenece a otra familia".into());
        }
        let reviewed = review(self, family, key)?;
        if reviewed["revision"] != expected || reviewed["canRetire"] != true {
            return Err("La conservación cambió o ya terminó; revisa sin repetir".into());
        }
        let (archive_sha256, archive_bytes) = verify_backup(self, &record, external)?;
        let previous = journal(self, key, &record)?;
        let data = remaining(self, &record, previous.is_some())?;
        if review(self, family, key)?["revision"] != expected {
            return Err("La copia cambió durante la comprobación; no se retira".into());
        }
        if let Some((j, _)) = &previous {
            if j.archive_sha256 != archive_sha256 || j.archive_bytes != archive_bytes {
                return Err(
                    "La retirada requiere el mismo respaldo completo; se conserva lo restante"
                        .into(),
                );
            }
        } else {
            let j = Journal {
                format: 1,
                closure_revision: revision(&record)?,
                archive_sha256,
                archive_bytes,
                created_at: knownext_core::now_iso(),
            };
            atomic_io::create(
                &path(self, key)?,
                &serde_json::to_vec(&j).map_err(|_| "No se pudo preparar la retirada")?,
            )
            .map_err(|_| "No se confirmó el diario. Consulta antes de continuar")?;
        }
        let source = self.app_data_dir.join(VAULT).join(key).join("data");
        if protects_project(self, &source)? {
            return Err("La copia solapa una ubicación de proyecto; se conserva".into());
        }
        for (name, bytes) in data.iter().take(16) {
            let target = if record.directory {
                source.join(name)
            } else {
                source.clone()
            };
            safe_path(self, &target)?;
            if closure(self, key)?
                .as_ref()
                .map(revision)
                .transpose()?
                .as_deref()
                != Some(revision(&record)?.as_str())
                || read(&target, LIMIT)? != *bytes
            {
                return Err("Una copia cambió antes de retirarla; se conserva lo restante".into());
            }
            let meta =
                fs::symlink_metadata(&target).map_err(|_| "La copia cambió antes de retirarla")?;
            if !meta.is_file() || batch::linked(&meta) || meta.permissions().readonly() {
                return Err("Copia no regular o de solo lectura; se conserva".into());
            }
            fs::remove_file(&target)
                .map_err(|_| "Retirada sin confirmar. Consulta; no se repite automáticamente")?;
        }
        review(self, family, key)
    }
}
