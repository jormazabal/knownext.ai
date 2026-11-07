//! Monotonic review generations prevent an old retention request becoming current after a roundtrip.
use super::*;
use std::{fs, io::Read, time::Instant};
use std::sync::{Arc,LazyLock,Mutex,Weak};
static CHANGE:LazyLock<Mutex<BTreeMap<PathBuf,Weak<Mutex<()>>>>>=LazyLock::new(||Mutex::new(BTreeMap::new()));
#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Record {
    format: u8,
    key_sha256: String,
    sequence: u64,
    updated_at: String,
}
pub(crate) struct Token {
    pub revision: String,
    sequence: u64,
}
fn folder(api: &LocalApi) -> Result<PathBuf, String> {
    for path in [
        &api.app_data_dir,
        &api.app_data_dir.join("retention-generations"),
    ] {
        match fs::symlink_metadata(path) {
            Ok(meta) if meta.is_dir() && !batch::linked(&meta) => (),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => (),
            _ => {
                return Err(
                    "El registro de conservación no es regular; se conserva sin modificar".into(),
                )
            }
        }
    }
    Ok(api.app_data_dir.join("retention-generations"))
}
pub(crate) fn read(api: &LocalApi, key: &str) -> Result<Token, String> {
    let path = folder(api)?.join(format!("{}.json", sha256_hex(key.as_bytes())));
    let meta = match fs::symlink_metadata(&path) {
        Ok(meta) => meta,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            return Ok(Token {
                revision: sha256_hex(format!("absent/{key}").as_bytes()),
                sequence: 0,
            })
        }
        _ => return Err("No se puede comprobar la revisión de conservación".into()),
    };
    if !meta.is_file() || batch::linked(&meta) || meta.len() > 1024 {
        return Err("Revisión de conservación no compatible; se preserva".into());
    }
    let mut raw = vec![];
    fs::File::open(path)
        .map_err(|_| "No se puede leer la revisión")?
        .take(1025)
        .read_to_end(&mut raw)
        .map_err(|_| "No se completó la revisión de conservación")?;
    if raw.len() > 1024 {
        return Err("Revisión de conservación fuera de límite".into());
    }
    let record: Record =
        serde_json::from_slice(&raw).map_err(|_| "Formato de revisión desconocido; se conserva")?;
    if record.format != 1
        || record.key_sha256 != sha256_hex(key.as_bytes())
        || record.sequence == 0
        || OffsetDateTime::parse(&record.updated_at, &Rfc3339).is_err()
    {
        return Err("Revisión de conservación no compatible; se preserva".into());
    }
    Ok(Token {
        revision: sha256_hex(&raw),
        sequence: record.sequence,
    })
}
pub(crate) fn advance(api: &LocalApi, key: &str, expected: &Token) -> Result<Token, String> {
    let location=api.app_data_dir.canonicalize().map_err(|_|"No se puede comprobar el almacén de revisiones")?;
    let lock={let mut gates=CHANGE.lock().map_err(|_|"No se puede reservar la revisión")?;gates.retain(|_,entry|entry.strong_count()>0);if let Some(lock)=gates.get(&location).and_then(Weak::upgrade){lock}else{let lock=Arc::new(Mutex::new(()));gates.insert(location,Arc::downgrade(&lock));lock}};
    let _gate=lock.try_lock().map_err(|_|"Hay otra revisión de conservación en este almacén; consulta antes de continuar")?;
    let current = read(api, key)?;
    if current.revision != expected.revision {
        return Err("La conservación cambió; consulta antes de continuar".into());
    }
    let sequence = current
        .sequence
        .checked_add(1)
        .ok_or("La revisión alcanzó su límite; se conservan las copias")?;
    let root = folder(api)?;
    if !root.exists() {
        fs::create_dir(&root).map_err(|_| "No se pudo preparar el registro de conservación")?;
    }
    folder(api)?;
    if current.sequence == 0 {
        let start = Instant::now();
        let mut count = 0;
        let mut total = 0u64;
        for entry in
            fs::read_dir(&root).map_err(|_| "No se puede revisar la cuota de conservación")?
        {
            count += 1;
            if count >= 20_000 || start.elapsed() > Duration::from_secs(2) {
                return Err(
                    "El inventario de revisiones está lleno o parcial; no se podan identidades"
                        .into(),
                );
            }
            let entry = entry.map_err(|_| "Revisión no comprobable")?;
            let name = entry.file_name();
            let valid = name
                .to_str()
                .and_then(|n| n.strip_suffix(".json"))
                .is_some_and(|n| n.len() == 64 && n.bytes().all(|b| b.is_ascii_hexdigit()));
            let meta = fs::symlink_metadata(entry.path()).map_err(|_| "Revisión no comprobable")?;
            if !valid || !meta.is_file() || batch::linked(&meta) || meta.len() > 1024 {
                return Err("Hay revisiones desconocidas; se conservan sin crear otra".into());
            }
            total = total.saturating_add(meta.len());
            if total > 16 * 1024 * 1024 - 1024 {
                return Err("Las revisiones de conservación superan16MiB; se preservan".into());
            }
        }
    }
    let path = root.join(format!("{}.json", sha256_hex(key.as_bytes())));
    let raw = serde_json::to_vec(&Record {
        format: 1,
        key_sha256: sha256_hex(key.as_bytes()),
        sequence,
        updated_at: knownext_core::now_iso(),
    })
    .map_err(|_| "No se pudo preparar la revisión")?;
    if current.sequence == 0 {
        atomic_io::create(&path, &raw)
    } else {
        atomic_io::write(&path, &raw)
    }
    .map_err(|_| "No se confirmó la revisión; las representaciones anteriores se conservan")?;
    let result = read(api, key)?;
    if result.sequence != sequence || result.revision != sha256_hex(&raw) {
        return Err("No se confirmó la revisión escrita; consulta sin repetir".into());
    }
    Ok(result)
}
