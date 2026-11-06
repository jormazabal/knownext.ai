//! Compare open regular files while a private hard-link anchor keeps the object alive.
//! Unsupported/partial identities fail closed; content equality alone is not ownership.
use std::{fs::File, io};
#[cfg(windows)]
pub(crate) fn identity(file: &File) -> io::Result<String> {
    use std::os::windows::io::AsRawHandle;
    use windows_sys::Win32::Storage::FileSystem::{
        FileIdInfo, GetFileInformationByHandleEx, FILE_ID_INFO,
    };
    let mut info = std::mem::MaybeUninit::<FILE_ID_INFO>::zeroed();
    // SAFETY: an open file handle and a writable correctly-sized native structure.
    let result = unsafe {
        GetFileInformationByHandleEx(
            file.as_raw_handle(),
            FileIdInfo,
            info.as_mut_ptr().cast(),
            std::mem::size_of::<FILE_ID_INFO>() as u32,
        )
    };
    if result == 0 {
        return Err(io::Error::last_os_error());
    }
    // SAFETY: the successful call initialized the complete FILE_ID_INFO structure.
    let info = unsafe { info.assume_init() };
    if info.FileId.Identifier.iter().all(|byte| *byte == 0) {
        return Err(io::Error::new(
            io::ErrorKind::Unsupported,
            "File identity unavailable",
        ));
    }
    Ok(format!(
        "windows:{:016x}:{}",
        info.VolumeSerialNumber,
        info.FileId
            .Identifier
            .iter()
            .map(|b| format!("{b:02x}"))
            .collect::<String>()
    ))
}
#[cfg(unix)]
pub(crate) fn identity(file: &File) -> io::Result<String> {
    use std::os::unix::fs::MetadataExt;
    let meta = file.metadata()?;
    if meta.ino() == 0 {
        return Err(io::Error::new(
            io::ErrorKind::Unsupported,
            "File identity unavailable",
        ));
    }
    Ok(format!("unix:{:016x}:{:016x}", meta.dev(), meta.ino()))
}
#[cfg(not(any(windows, unix)))]
pub(crate) fn identity(_file: &File) -> io::Result<String> {
    Err(io::Error::new(
        io::ErrorKind::Unsupported,
        "File identity unavailable",
    ))
}
