//! Separate account store. Existing GitHub/AI credentials are never rewritten.
use crate::{Error, Result};
use base64::{engine::general_purpose::STANDARD, Engine};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{fs, io::Read, path::Path, sync::OnceLock};

pub type AndroidProtector = fn(&[u8], bool) -> std::result::Result<Vec<u8>, String>;
static ANDROID_PROTECTOR: OnceLock<AndroidProtector> = OnceLock::new();
pub fn initialize_android_protector(protector: AndroidProtector) {
    let _ = ANDROID_PROTECTOR.set(protector);
}

pub trait Protector: Send + Sync {
    fn transform(&self, bytes: &[u8], protect: bool) -> Result<Vec<u8>>;
    fn name(&self) -> &str;
}
pub struct NativeProtector;
impl Protector for NativeProtector {
    fn name(&self) -> &str {
        if cfg!(windows) {
            "windows-dpapi-user"
        } else {
            "android-keystore-aes-gcm"
        }
    }
    fn transform(&self, bytes: &[u8], protect: bool) -> Result<Vec<u8>> {
        #[cfg(windows)]
        {
            windows_transform(bytes, protect)
        }
        #[cfg(target_os = "android")]
        {
            ANDROID_PROTECTOR
                .get()
                .ok_or_else(|| Error::new("protection-unavailable"))?(bytes, protect)
            .map_err(|_| Error::new("protection-unavailable"))
        }
        #[cfg(not(any(windows, target_os = "android")))]
        {
            let _ = (bytes, protect);
            Err(Error::new("protection-unavailable"))
        }
    }
}

fn linked(meta: &fs::Metadata) -> bool {
    if meta.file_type().is_symlink() {
        return true;
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        if meta.file_attributes() & 0x400 != 0 {
            return true;
        }
    }
    false
}
pub(crate) fn regular_path(path: &Path, directory: bool) -> Result<()> {
    for ancestor in path.ancestors() {
        let m = fs::symlink_metadata(ancestor).map_err(|_| Error::new("store-unavailable"))?;
        if linked(&m) || (ancestor != path && !m.is_dir()) {
            return Err(Error::new("store-unavailable"));
        }
        if ancestor == path && (if directory { !m.is_dir() } else { !m.is_file() }) {
            return Err(Error::new("store-unavailable"));
        }
    }
    Ok(())
}
pub(crate) fn directory(path: &Path) -> Result<()> {
    if path.exists() {
        return regular_path(path, true);
    }
    let parent = path
        .parent()
        .ok_or_else(|| Error::new("store-unavailable"))?;
    directory(parent)?;
    match fs::create_dir(path) {
        Ok(()) => {}
        Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => {}
        Err(_) => return Err(Error::new("store-unavailable")),
    }
    regular_path(path, true)
}
pub(crate) fn read(path: &Path, protector: &dyn Protector) -> Result<Option<Value>> {
    let current = raw(path)?;
    if let Some(journal) = raw(&path.with_file_name("accounts.pending.json"))? {
        let journal: Value =
            serde_json::from_slice(&journal).map_err(|_| Error::new("store-corrupt"))?;
        if journal["format"] != "knownext-proton-pending" || journal["version"] != 1 {
            return Err(Error::new("store-incompatible"));
        }
        let next =
            serde_json::to_vec(&journal["envelope"]).map_err(|_| Error::new("store-corrupt"))?;
        let current_hash = current.as_ref().map(|bytes| digest(bytes));
        // Read the last durably protected session without executing a provider
        // operation. An incomplete replace may only extend its exact predecessor.
        if journal["previousHash"] == json!(current_hash)
            || current_hash.as_deref() == Some(digest(&next).as_str())
        {
            return decode(&next, protector).map(Some);
        }
        return Err(Error::new("store-changed"));
    }
    let Some(bytes) = current else {
        return Ok(None);
    };
    decode(&bytes, protector).map(Some)
}
fn decode(bytes: &[u8], protector: &dyn Protector) -> Result<Value> {
    let envelope: Value =
        serde_json::from_slice(&bytes).map_err(|_| Error::new("store-corrupt"))?;
    if envelope["format"] != "knownext-proton-accounts"
        || envelope["version"] != 1
        || envelope["protection"] != protector.name()
    {
        return Err(Error::new("store-incompatible"));
    }
    let cipher = STANDARD
        .decode(
            envelope["payload"]
                .as_str()
                .ok_or_else(|| Error::new("store-corrupt"))?,
        )
        .map_err(|_| Error::new("store-corrupt"))?;
    if envelope["sha256"] != format!("{:x}", Sha256::digest(&cipher)) {
        return Err(Error::new("store-corrupt"));
    }
    let mut plain = protector.transform(&cipher, false)?;
    let value = serde_json::from_slice(&plain).map_err(|_| Error::new("store-corrupt"));
    plain.fill(0);
    value
}
pub(crate) fn raw(path: &Path) -> Result<Option<Vec<u8>>> {
    if let Some(parent) = path.parent().filter(|p| p.exists()) {
        regular_path(parent, true)?;
    }
    match fs::symlink_metadata(path) {
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(_) => return Err(Error::new("store-unavailable")),
        Ok(_) => {}
    }
    regular_path(path, false)?;
    let mut bytes = vec![];
    fs::File::open(path)
        .map_err(|_| Error::new("store-unavailable"))?
        .take(8 * 1024 * 1024 + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| Error::new("store-unavailable"))?;
    if bytes.len() > 8 * 1024 * 1024 {
        return Err(Error::new("store-too-large"));
    }
    Ok(Some(bytes))
}
pub(crate) fn write(path: &Path, value: &Value, protector: &dyn Protector) -> Result<()> {
    let expected = raw(path)?;
    let journal_path = path.with_file_name("accounts.pending.json");
    let previous_journal = raw(&journal_path)?;
    if previous_journal.is_some() {
        read(path, protector)?;
    }
    let mut plain = serde_json::to_vec(value).map_err(|_| Error::new("store-corrupt"))?;
    if plain.len() > 4 * 1024 * 1024 {
        plain.fill(0);
        return Err(Error::new("store-too-large"));
    }
    let cipher = protector.transform(&plain, true)?;
    let mut verified = protector.transform(&cipher, false)?;
    let matches = plain == verified;
    plain.fill(0);
    verified.fill(0);
    if !matches {
        return Err(Error::new("protection-unavailable"));
    }
    let envelope = json!({"format":"knownext-proton-accounts","version":1,"protection":protector.name(),"sha256":format!("{:x}",Sha256::digest(&cipher)),"payload":STANDARD.encode(cipher)});
    let parent = path
        .parent()
        .ok_or_else(|| Error::new("store-unavailable"))?;
    directory(parent)?;
    let bytes = serde_json::to_vec(&envelope).map_err(|_| Error::new("store-corrupt"))?;
    let journal=serde_json::to_vec(&json!({"format":"knownext-proton-pending","version":1,"previousHash":expected.as_ref().map(|v|digest(v)),"envelope":envelope})).map_err(|_|Error::new("store-corrupt"))?;
    if raw(path)? != expected || raw(&journal_path)? != previous_journal {
        return Err(Error::new("store-changed"));
    }
    atomic_replace(&journal_path, &journal)?;
    if raw(path)? != expected {
        return Err(Error::new("store-changed"));
    }
    atomic_replace(path, &bytes)?;
    // Removing a known exact journal cannot invalidate a successful write. If
    // removal fails, the next read recognises the already-published envelope.
    if raw(&journal_path)? == Some(journal) {
        let _ = fs::remove_file(&journal_path);
    }
    Ok(())
}
fn digest(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}
fn atomic_replace(path: &Path, bytes: &[u8]) -> Result<()> {
    let parent = path
        .parent()
        .ok_or_else(|| Error::new("store-unavailable"))?;
    let mut temp =
        tempfile::NamedTempFile::new_in(parent).map_err(|_| Error::new("store-unavailable"))?;
    use std::io::Write;
    temp.write_all(bytes)
        .map_err(|_| Error::new("store-unavailable"))?;
    temp.as_file()
        .sync_all()
        .map_err(|_| Error::new("store-unavailable"))?;
    temp.persist(path)
        .map_err(|_| Error::new("store-unavailable"))?;
    Ok(())
}

#[cfg(windows)]
fn windows_transform(bytes: &[u8], protect: bool) -> Result<Vec<u8>> {
    use windows_sys::Win32::{Foundation::LocalFree, Security::Cryptography::*};
    let input = CRYPT_INTEGER_BLOB {
        cbData: u32::try_from(bytes.len()).map_err(|_| Error::new("store-too-large"))?,
        pbData: bytes.as_ptr().cast_mut(),
    };
    let mut output = CRYPT_INTEGER_BLOB {
        cbData: 0,
        pbData: std::ptr::null_mut(),
    };
    let success = unsafe {
        if protect {
            CryptProtectData(
                &input,
                std::ptr::null(),
                std::ptr::null(),
                std::ptr::null(),
                std::ptr::null(),
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut output,
            )
        } else {
            CryptUnprotectData(
                &input,
                std::ptr::null_mut(),
                std::ptr::null(),
                std::ptr::null(),
                std::ptr::null(),
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut output,
            )
        }
    };
    if success == 0 || output.pbData.is_null() {
        return Err(Error::new("protection-unavailable"));
    }
    let result =
        unsafe { std::slice::from_raw_parts(output.pbData, output.cbData as usize).to_vec() };
    unsafe {
        for i in 0..output.cbData as usize {
            std::ptr::write_volatile(output.pbData.add(i), 0);
        }
        LocalFree(output.pbData.cast());
    }
    Ok(result)
}
