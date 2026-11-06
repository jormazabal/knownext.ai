//! Credentials at rest: user-bound DPAPI on Windows and Android Keystore.
use serde_json::{json, Value};
use std::{io::Read, path::Path};

const FORMAT: &str = "knownext-credentials";

pub(super) fn raw(path: &Path) -> Result<Option<Vec<u8>>, String> {
    let parent = path.parent().ok_or("Ubicación de credenciales no válida")?;
    let directory = std::fs::symlink_metadata(parent)
        .map_err(|_| "No se puede consultar la carpeta de credenciales")?;
    if !directory.is_dir() || crate::batch::linked(&directory) {
        return Err("La carpeta de credenciales no es regular; se conserva".into());
    }
    let metadata = match std::fs::symlink_metadata(path) {
        Ok(v) => v,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(_) => return Err("No se puede consultar el almacén de credenciales".into()),
    };
    if !metadata.is_file() || crate::batch::linked(&metadata) || metadata.len() > 1024 * 1024 {
        return Err(
            "El almacén de credenciales no es regular o supera el límite; se conserva".into(),
        );
    }
    let mut bytes = Vec::new();
    std::fs::File::open(path)
        .map_err(|_| "No se puede abrir el almacén de credenciales")?
        .take(1024 * 1024 + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| "No se pudo completar la lectura de credenciales")?;
    if bytes.len() > 1024 * 1024 {
        return Err("El almacén de credenciales supera el límite; se conserva".into());
    }
    Ok(Some(bytes))
}
fn plain(value: &Value) -> Result<(), String> {
    let object = value
        .as_object()
        .ok_or("Las credenciales no contienen un objeto válido")?;
    if object.keys().any(|key| {
        ![
            "openaiKey",
            "github",
            "provider",
            "accessToken",
            "scopes",
            "updatedAt",
        ]
        .contains(&key.as_str())
    }) {
        return Err("Formato de credenciales no conocido; se conserva sin migrar".into());
    }
    for key in ["openaiKey", "accessToken", "provider", "updatedAt"] {
        if object
            .get(key)
            .is_some_and(|v| !v.is_null() && !v.is_string())
        {
            return Err("Estructura de credenciales no compatible; se conserva".into());
        }
    }
    if object.get("scopes").is_some_and(|v| {
        !v.is_null()
            && !v
                .as_array()
                .is_some_and(|items| items.iter().all(Value::is_string))
    }) {
        return Err("Permisos de credenciales no compatibles; se conservan".into());
    }
    if let Some(github) = object.get("github").filter(|v| !v.is_null()) {
        let fields = github
            .as_object()
            .ok_or("Credenciales GitHub no compatibles")?;
        if fields
            .keys()
            .any(|key| !["provider", "accessToken", "scopes", "updatedAt"].contains(&key.as_str()))
        {
            return Err("Extensión de credenciales GitHub no compatible; se conserva".into());
        }
        for key in ["provider", "accessToken", "updatedAt"] {
            if fields.get(key).is_some_and(|v| !v.is_string()) {
                return Err("Credenciales GitHub no compatibles; se conservan".into());
            }
        }
        if fields.get("scopes").is_some_and(|v| {
            !v.as_array()
                .is_some_and(|items| items.iter().all(Value::is_string))
        }) {
            return Err("Permisos GitHub no compatibles; se conservan".into());
        }
    }
    Ok(())
}

pub(super) fn protection_name() -> &'static str {
    if cfg!(windows) {
        "windows-dpapi-user"
    } else if cfg!(target_os = "android") {
        "android-keystore-aes-gcm"
    } else {
        "legacy-local"
    }
}

#[cfg(target_os = "android")]
type AndroidProtector = fn(&[u8], bool) -> Result<Vec<u8>, String>;
#[cfg(target_os = "android")]
static ANDROID_PROTECTOR: std::sync::OnceLock<AndroidProtector> = std::sync::OnceLock::new();
#[cfg(target_os = "android")]
pub fn initialize_android_credential_protector(protector: AndroidProtector) {
    let _ = ANDROID_PROTECTOR.set(protector);
}

#[cfg(any(windows, target_os = "android"))]
fn transform(bytes: &[u8], protect: bool) -> Result<Vec<u8>, String> {
    #[cfg(windows)]
    {
        windows::transform(bytes, protect)
    }
    #[cfg(target_os = "android")]
    {
        ANDROID_PROTECTOR
            .get()
            .ok_or("El almacén nativo de Android no está inicializado")?(bytes, protect)
    }
}
pub(super) fn read(path: &Path) -> Result<Value, String> {
    let Some(bytes) = raw(path)? else {
        return Ok(json!({}));
    };
    let value = decode(&bytes)?;
    #[cfg(any(windows, target_os = "android"))]
    if serde_json::from_slice::<Value>(&bytes)
        .ok()
        .is_some_and(|v| v["format"] != FORMAT)
    {
        write(path, &value)?;
    }
    Ok(value)
}

pub(super) fn decode(bytes: &[u8]) -> Result<Value, String> {
    let stored: Value = serde_json::from_slice(bytes)
        .map_err(|_| "El almacén de credenciales está dañado. No se ha reemplazado.".to_string())?;
    if stored.get("format").is_some_and(|format| format != FORMAT) {
        return Err("Formato de credenciales desconocido; se conserva sin migrar".into());
    }
    if stored["format"] == FORMAT {
        if stored.as_object().is_some_and(|fields| {
            fields.keys().any(|key| {
                !["format", "version", "protection", "payloadHash", "payload"]
                    .contains(&key.as_str())
            })
        }) {
            return Err("Sobre de credenciales no compatible; se conserva".into());
        }
        if stored["version"] != 1 || stored["protection"] != protection_name() {
            return Err("Estas credenciales pertenecen a otra protección o dispositivo. Se conserva el almacén sin cambios.".into());
        }
        #[cfg(any(windows, target_os = "android"))]
        {
            use base64::Engine;
            let encrypted = base64::engine::general_purpose::STANDARD
                .decode(
                    stored["payload"]
                        .as_str()
                        .ok_or("Falta el contenido protegido")?,
                )
                .map_err(|_| "Contenido protegido no válido")?;
            if stored["payloadHash"].as_str() != Some(hash(&encrypted).as_str()) {
                return Err(
                    "La huella del almacén protegido no coincide. Se conserva sin cambios.".into(),
                );
            }
            let bytes = transform(&encrypted, false)?;
            let value: Value = serde_json::from_slice(&bytes)
                .map_err(|_| "El contenido protegido no es válido")?;
            if !value.is_object() {
                return Err("El almacén protegido no contiene credenciales válidas".into());
            }
            plain(&value)?;
            return Ok(value);
        }
        #[cfg(not(any(windows, target_os = "android")))]
        {
            return Err("Estas credenciales están vinculadas al usuario de Windows. Configura las claves en este dispositivo.".into());
        }
    }
    if !stored.is_object() {
        return Err(
            "El almacén de credenciales no es un objeto válido. Se conserva sin cambios.".into(),
        );
    }
    plain(&stored)?;
    // Migrate only after encryption and decryption verification. Atomic replacement
    // preserves the legacy file if either protection or persistence fails.
    Ok(stored)
}

pub(super) fn write(path: &Path, value: &Value) -> Result<(), String> {
    plain(value)?;
    let original = raw(path)?;
    if let Some(bytes) = &original {
        let stored: Value = serde_json::from_slice(bytes)
            .map_err(|_| "El almacén existente está dañado; se conserva")?;
        if stored["format"] == FORMAT {
            read(path)?;
        } else {
            plain(&stored)?;
        }
    }
    if !value.is_object() {
        return Err("El almacén de credenciales debe contener un objeto".into());
    }
    let bytes = encode(value)?;
    if raw(path)? != original {
        return Err(
            "Las credenciales cambiaron durante la preparación; se conservan sin sustituir".into(),
        );
    }
    crate::atomic_io::write(path, &bytes).map_err(|_| {
        "No se pudieron guardar las credenciales. Se conserva el almacén anterior.".into()
    })
}

fn encode(value: &Value) -> Result<Vec<u8>, String> {
    plain(value)?;
    let plain =
        serde_json::to_vec(value).map_err(|_| "No se pudieron preparar las credenciales")?;
    if plain.len() > 512 * 1024 {
        return Err(
            "El almacén de credenciales supera el tamaño permitido. Se conserva sin cambios."
                .into(),
        );
    }
    #[cfg(any(windows, target_os = "android"))]
    let stored = {
        use base64::Engine;
        let encrypted = transform(&plain, true)?;
        if transform(&encrypted, false)? != plain {
            return Err("No se ha podido verificar la protección de credenciales".into());
        }
        json!({"format":FORMAT,"version":1,"protection":protection_name(),"payloadHash":hash(&encrypted),"payload":base64::engine::general_purpose::STANDARD.encode(encrypted)})
    };
    #[cfg(not(any(windows, target_os = "android")))]
    let stored = value;
    let bytes =
        serde_json::to_vec(&stored).map_err(|_| "No se pudieron preparar las credenciales")?;
    Ok(bytes)
}
pub(super) fn replace_reviewed(
    path: &Path,
    expected: &Option<Vec<u8>>,
    value: &Value,
) -> Result<(), String> {
    let bytes = encode(value)?;
    if &raw(path)? != expected {
        return Err("El almacén cambió; vuelve a revisarlo".into());
    }
    crate::atomic_io::write(path, &bytes)
        .map_err(|_| "No se pudo confirmar el cambio del almacén".into())
}

pub(super) fn seal_original(bytes: &[u8]) -> Result<Value, String> {
    #[cfg(any(windows, target_os = "android"))]
    {
        use base64::Engine;
        let cipher = transform(bytes, true)?;
        if transform(&cipher, false)? != bytes {
            return Err("No se pudo verificar la copia privada".into());
        }
        Ok(
            json!({"schemaVersion":1,"format":"knownext-credential-recovery","protection":protection_name(),"payloadHash":hash(&cipher),"payload":base64::engine::general_purpose::STANDARD.encode(cipher)}),
        )
    }
    #[cfg(not(any(windows, target_os = "android")))]
    {
        let _ = bytes;
        Err("La recuperación de claves requiere protección nativa".into())
    }
}
pub(super) fn unseal_original(value: &Value) -> Result<Vec<u8>, String> {
    #[cfg(any(windows, target_os = "android"))]
    {
        use base64::Engine;
        if value["schemaVersion"] != 1
            || value["format"] != "knownext-credential-recovery"
            || value["protection"] != protection_name()
            || !value.as_object().is_some_and(|o| o.len() == 5)
        {
            return Err("Copia de credenciales no compatible; se conserva".into());
        }
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(value["payload"].as_str().ok_or("Copia no válida")?)
            .map_err(|_| "Copia no válida")?;
        if value["payloadHash"].as_str() != Some(hash(&bytes).as_str()) {
            return Err("La copia cambió; se conserva".into());
        }
        transform(&bytes, false)
    }
    #[cfg(not(any(windows, target_os = "android")))]
    {
        let _ = value;
        Err("La recuperación de claves requiere protección nativa".into())
    }
}

#[cfg(any(windows, target_os = "android"))]
fn hash(bytes: &[u8]) -> String {
    use sha2::{Digest, Sha256};
    format!("{:x}", Sha256::digest(bytes))
}

#[cfg(windows)]
mod windows {
    use windows_sys::Win32::{
        Foundation::LocalFree,
        Security::Cryptography::{
            CryptProtectData, CryptUnprotectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB,
        },
    };
    pub(super) fn transform(bytes: &[u8], protect: bool) -> Result<Vec<u8>, String> {
        let length = u32::try_from(bytes.len())
            .map_err(|_| "El almacén de credenciales supera el tamaño permitido")?;
        let input = CRYPT_INTEGER_BLOB {
            cbData: length,
            pbData: bytes.as_ptr().cast_mut(),
        };
        let mut output = CRYPT_INTEGER_BLOB {
            cbData: 0,
            pbData: std::ptr::null_mut(),
        };
        // DPAPI owns the output buffer. No prompt or machine-wide protection is used.
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
        if success == 0 {
            return Err("Windows no ha podido proteger o desbloquear las credenciales de este usuario. El archivo no se ha modificado.".into());
        }
        if output.pbData.is_null() {
            return Err("Windows devolvió un almacén de credenciales vacío".into());
        }
        let result =
            unsafe { std::slice::from_raw_parts(output.pbData, output.cbData as usize).to_vec() };
        // Clear the OS-owned temporary before freeing it. Rust copies and serde values
        // have ordinary process-memory lifetimes; no complete RAM-erasure guarantee.
        unsafe {
            for i in 0..output.cbData as usize {
                std::ptr::write_volatile(output.pbData.add(i), 0);
            }
            LocalFree(output.pbData.cast());
        }
        Ok(result)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture() -> std::path::PathBuf {
        let root =
            std::env::temp_dir().join(knownext_core::compact_id("knownext-credentials-test"));
        std::fs::create_dir_all(&root).unwrap();
        root.join("credentials.json")
    }
    #[cfg(windows)]
    #[test]
    fn windows_migrates_legacy_credentials_and_preserves_both_providers() {
        let path = fixture();
        let value = json!({"openaiKey":"dummy-openai-secret","github":{"accessToken":"dummy-github-secret"}});
        std::fs::write(&path, serde_json::to_vec(&value).unwrap()).unwrap();
        assert_eq!(read(&path).unwrap(), value);
        let file = std::fs::read_to_string(&path).unwrap();
        assert!(!file.contains("dummy-openai-secret"));
        assert!(!file.contains("dummy-github-secret"));
        assert_eq!(read(&path).unwrap(), value);
        std::fs::remove_dir_all(path.parent().unwrap()).unwrap();
    }
    #[test]
    fn corrupt_store_is_not_silently_replaced() {
        let path = fixture();
        std::fs::write(&path, b"broken").unwrap();
        assert!(read(&path).is_err());
        assert_eq!(std::fs::read(&path).unwrap(), b"broken");
        std::fs::remove_dir_all(path.parent().unwrap()).unwrap();
    }
    #[test]
    fn invalid_or_oversized_credentials_never_replace_the_existing_store() {
        let path = fixture();
        write(&path, &json!({"openaiKey":"dummy-bounded"})).unwrap();
        let original = std::fs::read(&path).unwrap();
        assert!(write(&path, &json!([])).is_err());
        assert!(write(&path, &json!({"openaiKey":"x".repeat(512*1024)})).is_err());
        assert_eq!(std::fs::read(&path).unwrap(), original);
        std::fs::remove_dir_all(path.parent().unwrap()).unwrap();
    }
    #[cfg(windows)]
    #[test]
    fn invalid_protected_payload_and_failed_migration_preserve_the_file() {
        let path = fixture();
        let invalid = json!({"format":FORMAT,"version":1,"protection":"windows-dpapi-user","payload":"bm90LWRwYXBp"});
        let bytes = serde_json::to_vec(&invalid).unwrap();
        std::fs::write(&path, &bytes).unwrap();
        assert!(read(&path).is_err());
        assert_eq!(std::fs::read(&path).unwrap(), bytes);
        let legacy = serde_json::to_vec(&json!({"openaiKey":"dummy-only"})).unwrap();
        std::fs::write(&path, &legacy).unwrap();
        let mut permissions = std::fs::metadata(&path).unwrap().permissions();
        permissions.set_readonly(true);
        std::fs::set_permissions(&path, permissions.clone()).unwrap();
        assert!(read(&path).is_err());
        assert_eq!(std::fs::read(&path).unwrap(), legacy);
        permissions.set_readonly(false);
        std::fs::set_permissions(&path, permissions).unwrap();
        std::fs::remove_dir_all(path.parent().unwrap()).unwrap();
    }
}
