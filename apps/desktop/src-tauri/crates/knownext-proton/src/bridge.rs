//! Narrow in-process ABI. The host supplies an absolute, packaged library path.
use crate::{Error, Result};
use serde_json::Value;
use std::{path::Path, sync::Mutex};

pub trait Bridge: Send + Sync {
    fn request(&self, request: &Value) -> Result<Value>;
}

pub struct NativeBridge {
    _handle: usize,
    _crypto_handle: usize,
    #[cfg(target_os = "android")]
    _tls_handles: [usize; 2],
    request_fn: unsafe extern "C" fn(*const u8, usize) -> *mut u8,
    length_fn: unsafe extern "C" fn(*mut u8) -> usize,
    free_fn: unsafe extern "C" fn(*mut u8),
    gate: Mutex<()>,
}
unsafe impl Send for NativeBridge {}
unsafe impl Sync for NativeBridge {}

impl NativeBridge {
    pub fn load(path: &Path) -> Result<Self> {
        if !path.is_absolute() {
            return Err(Error::new("sdk-unavailable"));
        }
        crate::vault::regular_path(path, false)?;
        let crypto_path = path.with_file_name(if cfg!(windows) {
            "proton_crypto.dll"
        } else {
            "libproton_crypto.so"
        });
        crate::vault::regular_path(&crypto_path, false)
            .map_err(|_| Error::new("sdk-unavailable"))?;
        #[cfg(windows)]
        unsafe {
            use std::os::windows::ffi::OsStrExt;
            use windows_sys::Win32::System::LibraryLoader::*;
            let crypto_wide: Vec<u16> = crypto_path
                .as_os_str()
                .encode_wide()
                .chain(Some(0))
                .collect();
            let crypto_handle = LoadLibraryExW(
                crypto_wide.as_ptr(),
                std::ptr::null_mut(),
                LOAD_LIBRARY_SEARCH_DLL_LOAD_DIR | LOAD_LIBRARY_SEARCH_DEFAULT_DIRS,
            );
            if crypto_handle.is_null() {
                return Err(Error::new("sdk-unavailable"));
            }
            let wide: Vec<u16> = path.as_os_str().encode_wide().chain(Some(0)).collect();
            let handle = LoadLibraryExW(
                wide.as_ptr(),
                std::ptr::null_mut(),
                LOAD_LIBRARY_SEARCH_DLL_LOAD_DIR | LOAD_LIBRARY_SEARCH_DEFAULT_DIRS,
            );
            if handle.is_null() {
                return Err(Error::new("sdk-unavailable"));
            }
            let request = GetProcAddress(handle, c"knownext_proton_request".as_ptr().cast());
            let length = GetProcAddress(handle, c"knownext_proton_response_length".as_ptr().cast());
            let free = GetProcAddress(handle, c"knownext_proton_free".as_ptr().cast());
            match (request, length, free) {
                (Some(request), Some(length), Some(free)) => Ok(Self {
                    _handle: handle as usize,
                    _crypto_handle: crypto_handle as usize,
                    request_fn: std::mem::transmute(request),
                    length_fn: std::mem::transmute(length),
                    free_fn: std::mem::transmute(free),
                    gate: Mutex::new(()),
                }),
                _ => {
                    windows_sys::Win32::Foundation::FreeLibrary(handle);
                    Err(Error::new("sdk-incompatible"))
                }
            }
        }
        #[cfg(any(target_os = "android", target_os = "linux"))]
        unsafe {
            use std::os::unix::ffi::OsStrExt;
            #[cfg(target_os = "android")]
            let tls_handles = {
                configure_android_tls()?;
                let mut handles = [0usize; 2];
                // NativeAOT's managed HTTP/AES implementations require the
                // packaged OpenSSL ABI, not Android's private system libssl.
                // Absolute paths avoid changing LD_LIBRARY_PATH or global PATH.
                for (index, file) in ["libcrypto.so", "libssl.so"].iter().enumerate() {
                    let dependency = path.with_file_name(file);
                    crate::vault::regular_path(&dependency, false)
                        .map_err(|_| Error::new("sdk-unavailable"))?;
                    let name = std::ffi::CString::new(dependency.as_os_str().as_bytes())
                        .map_err(|_| Error::new("sdk-unavailable"))?;
                    let handle = libc::dlopen(name.as_ptr(), libc::RTLD_NOW | libc::RTLD_GLOBAL);
                    if handle.is_null() {
                        return Err(Error::new("sdk-unavailable"));
                    }
                    handles[index] = handle as usize;
                }
                handles
            };
            let crypto_name = std::ffi::CString::new(crypto_path.as_os_str().as_bytes())
                .map_err(|_| Error::new("sdk-unavailable"))?;
            let crypto_handle =
                libc::dlopen(crypto_name.as_ptr(), libc::RTLD_NOW | libc::RTLD_GLOBAL);
            if crypto_handle.is_null() {
                return Err(Error::new("sdk-unavailable"));
            }
            let name = std::ffi::CString::new(path.as_os_str().as_bytes())
                .map_err(|_| Error::new("sdk-unavailable"))?;
            let handle = libc::dlopen(name.as_ptr(), libc::RTLD_NOW | libc::RTLD_LOCAL);
            if handle.is_null() {
                return Err(Error::new("sdk-unavailable"));
            }
            let request = libc::dlsym(handle, c"knownext_proton_request".as_ptr());
            let length = libc::dlsym(handle, c"knownext_proton_response_length".as_ptr());
            let free = libc::dlsym(handle, c"knownext_proton_free".as_ptr());
            if request.is_null() || length.is_null() || free.is_null() {
                libc::dlclose(handle);
                return Err(Error::new("sdk-incompatible"));
            }
            Ok(Self {
                _handle: handle as usize,
                _crypto_handle: crypto_handle as usize,
                #[cfg(target_os = "android")]
                _tls_handles: tls_handles,
                request_fn: std::mem::transmute(request),
                length_fn: std::mem::transmute(length),
                free_fn: std::mem::transmute(free),
                gate: Mutex::new(()),
            })
        }
        #[cfg(not(any(windows, target_os = "android", target_os = "linux")))]
        {
            Err(Error::new("sdk-unavailable"))
        }
    }
}
#[cfg(target_os = "android")]
fn configure_android_tls() -> Result<()> {
    static CONFIGURED: std::sync::OnceLock<Result<()>> = std::sync::OnceLock::new();
    CONFIGURED
        .get_or_init(|| {
            let certificates = [
                "/apex/com.android.conscrypt/cacerts",
                "/system/etc/security/cacerts",
            ]
            .into_iter()
            .map(Path::new)
            .find(|path| path.is_dir())
            .ok_or_else(|| Error::new("tls-trust-unavailable"))?;
            // Set exactly one SDK trust-store setting before the first managed
            // request. Values come only from these OS certificate directories;
            // no user path, certificate override or TLS-validation bypass is used.
            std::env::set_var("SSL_CERT_DIR", certificates);
            Ok(())
        })
        .clone()
}
impl Bridge for NativeBridge {
    fn request(&self, request: &Value) -> Result<Value> {
        let _gate = self.gate.lock().map_err(|_| Error::new("service-busy"))?;
        let mut input = serde_json::to_vec(request).map_err(|_| Error::new("invalid-request"))?;
        if input.len() > 96 * 1024 * 1024 {
            return Err(Error::new("request-too-large"));
        }
        let pointer = unsafe { (self.request_fn)(input.as_ptr(), input.len()) };
        input.fill(0);
        if pointer.is_null() {
            return Err(Error::new("sdk-response-invalid"));
        }
        let length = unsafe { (self.length_fn)(pointer) };
        let parsed = if length == 0 || length > 96 * 1024 * 1024 {
            Err(Error::new("sdk-response-invalid"))
        } else {
            let bytes = unsafe { std::slice::from_raw_parts(pointer, length) };
            serde_json::from_slice(bytes).map_err(|_| Error::new("sdk-response-invalid"))
        };
        unsafe { (self.free_fn)(pointer) };
        parsed
    }
}
// A successfully called NativeAOT module is pinned for process lifetime. OS
// teardown releases its loader reference; unloading it can invalidate GC threads.
