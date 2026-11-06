use std::fs::{self, File, OpenOptions};
use std::io::{self, Write};
use std::path::Path;

/// Stage in the destination directory, flush, then replace without removing the original.
pub(crate) fn write(path: &Path, bytes: &[u8]) -> io::Result<()> {
    replace_with(
        path,
        |file| {
            file.write_all(bytes)?;
            file.sync_all()
        },
        rename_replace,
    )
}

/// Creation must never truncate an existing document, including a concurrent creator.
pub(crate) fn create(path: &Path, bytes: &[u8]) -> io::Result<()> {
    stage_with(
        path,
        false,
        |file| {
            file.write_all(bytes)?;
            file.sync_all()
        },
        rename_no_replace,
    )
}

fn replace_with(
    path: &Path,
    write: impl FnOnce(&mut File) -> io::Result<()>,
    commit: impl FnOnce(&Path, &Path) -> io::Result<()>,
) -> io::Result<()> {
    stage_with(path, true, write, commit)
}

fn stage_with(
    path: &Path,
    replacing: bool,
    write: impl FnOnce(&mut File) -> io::Result<()>,
    commit: impl FnOnce(&Path, &Path) -> io::Result<()>,
) -> io::Result<()> {
    let parent = path
        .parent()
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "Destination has no parent"))?;
    let metadata = match fs::symlink_metadata(path) {
        Ok(metadata) => {
            if !replacing {
                return Err(io::Error::new(
                    io::ErrorKind::AlreadyExists,
                    "Destination already exists",
                ));
            }
            if !metadata.is_file() || metadata.file_type().is_symlink() {
                return Err(io::Error::new(
                    io::ErrorKind::InvalidInput,
                    "Destination must be a regular file",
                ));
            }
            if metadata.permissions().readonly() {
                return Err(io::Error::new(
                    io::ErrorKind::PermissionDenied,
                    "Destination is read-only",
                ));
            }
            Some(metadata)
        }
        Err(error) if error.kind() == io::ErrorKind::NotFound => None,
        Err(error) => return Err(error),
    };
    let name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("document");
    let temporary = parent.join(format!(
        ".{name}.{}.tmp",
        knownext_core::compact_id("write")
    ));
    let mut owns_temporary = false;
    let result = (|| {
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)?;
        owns_temporary = true;
        write(&mut file)?;
        if let Some(metadata) = metadata {
            file.set_permissions(metadata.permissions())?;
        }
        drop(file);
        commit(&temporary, path)?;
        // A flushed file alone does not commit its new directory entry on Unix.
        #[cfg(unix)]
        File::open(parent)?.sync_all()?;
        Ok(())
    })();
    if result.is_err() && owns_temporary {
        let _ = fs::remove_file(&temporary);
    }
    result
}

/// Atomically publish a file or directory only if its destination is still free.
/// Never fall back to rename/copy-and-delete: both can replace a concurrent creator.
#[cfg(windows)]
pub(crate) fn rename_no_replace(from: &Path, to: &Path) -> io::Result<()> {
    windows_move(from, to, false)
}

#[cfg(windows)]
fn rename_replace(from: &Path,to: &Path)->io::Result<()> { windows_move(from,to,true) }
#[cfg(not(windows))]
fn rename_replace(from: &Path,to: &Path)->io::Result<()> { fs::rename(from,to) }

#[cfg(windows)]
fn windows_move(from:&Path,to:&Path,replacing:bool)->io::Result<()> {
    use std::os::windows::ffi::OsStrExt;
    use std::path::{Component, Prefix};
    use windows_sys::Win32::Storage::FileSystem::{MoveFileExW, MOVEFILE_WRITE_THROUGH, MOVEFILE_REPLACE_EXISTING};
    fn wide(path: &Path) -> io::Result<Vec<u16>> {
        let absolute = std::path::absolute(path)?;
        let extended = match absolute.components().next() {
            Some(Component::Prefix(prefix)) => match prefix.kind() {
                Prefix::VerbatimDisk(_) | Prefix::VerbatimUNC(_, _) => absolute,
                Prefix::Disk(_) => {
                    let mut extended = std::ffi::OsString::from(r"\\?\");
                    extended.push(absolute);
                    extended.into()
                }
                Prefix::UNC(server, share) => {
                    let mut extended = Path::new(r"\\?\UNC\").join(server).join(share);
                    extended.extend(absolute.components().skip(2));
                    extended
                }
                _ => {
                    return Err(io::Error::new(
                        io::ErrorKind::InvalidInput,
                        "Unsupported path namespace",
                    ))
                }
            },
            _ => {
                return Err(io::Error::new(
                    io::ErrorKind::InvalidInput,
                    "Absolute path required",
                ))
            }
        };
        let mut value: Vec<u16> = extended.as_os_str().encode_wide().collect();
        if value.contains(&0) {
            return Err(io::Error::new(io::ErrorKind::InvalidInput, "Nul in path"));
        }
        value.push(0);
        Ok(value)
    }
    let from = wide(from)?;
    let to = wide(to)?;
    // SAFETY: both NUL-terminated buffers remain alive; flags exclude replacement,
    // deferred moves and the cross-volume copy/delete fallback. Replacement is explicit.
    if unsafe { MoveFileExW(from.as_ptr(), to.as_ptr(), MOVEFILE_WRITE_THROUGH | if replacing {MOVEFILE_REPLACE_EXISTING} else {0}) } == 0 {
        Err(io::Error::last_os_error())
    } else {
        Ok(())
    }
}

#[cfg(any(target_os = "linux", target_os = "android"))]
pub(crate) fn rename_no_replace(from: &Path, to: &Path) -> io::Result<()> {
    use std::ffi::CString;
    use std::os::unix::ffi::OsStrExt;
    let from = CString::new(from.as_os_str().as_bytes())
        .map_err(|_| io::Error::new(io::ErrorKind::InvalidInput, "Nul in path"))?;
    let to = CString::new(to.as_os_str().as_bytes())
        .map_err(|_| io::Error::new(io::ErrorKind::InvalidInput, "Nul in path"))?;
    // SAFETY: valid NUL-terminated paths and the renameat2 syscall's fixed arguments.
    // Using the syscall avoids depending on an Android libc symbol's API level.
    let result = unsafe {
        libc::syscall(
            libc::SYS_renameat2,
            libc::AT_FDCWD,
            from.as_ptr(),
            libc::AT_FDCWD,
            to.as_ptr(),
            libc::RENAME_NOREPLACE,
        )
    };
    if result == 0 {
        Ok(())
    } else {
        Err(io::Error::last_os_error())
    }
}

#[cfg(not(any(windows, target_os = "linux", target_os = "android")))]
pub(crate) fn rename_no_replace(_: &Path, _: &Path) -> io::Result<()> {
    Err(io::Error::new(
        io::ErrorKind::Unsupported,
        "Atomic no-replace move unavailable",
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    fn directory() -> std::path::PathBuf {
        let root = std::env::temp_dir().join(knownext_core::compact_id("knownext-atomic-test"));
        fs::create_dir_all(&root).unwrap();
        root
    }
    #[test]
    fn replaces_existing_file_and_leaves_no_temporary() {
        let root = directory();
        let path = root.join("document.md");
        fs::write(&path, "original").unwrap();
        write(&path, b"replacement").unwrap();
        assert_eq!(fs::read(&path).unwrap(), b"replacement");
        assert_eq!(fs::read_dir(&root).unwrap().count(), 1);
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn creation_refuses_an_existing_file_without_truncating_it() {
        let root = directory();
        let path = root.join("document.md");
        create(&path, b"original").unwrap();
        assert!(create(&path, b"replacement").is_err());
        assert_eq!(fs::read(&path).unwrap(), b"original");
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn partial_write_failure_preserves_original_and_cleans_temporary() {
        let root = directory();
        let path = root.join("document.md");
        fs::write(&path, "original").unwrap();
        let error = replace_with(
            &path,
            |file| {
                file.write_all(b"partial")?;
                Err(io::Error::other("disk full"))
            },
            |_, _| panic!("must not commit incomplete data"),
        );
        assert!(error.is_err());
        assert_eq!(fs::read(&path).unwrap(), b"original");
        assert_eq!(fs::read_dir(&root).unwrap().count(), 1);
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn failed_replace_preserves_original_and_cleans_temporary() {
        let root = directory();
        let path = root.join("document.md");
        fs::write(&path, "original").unwrap();
        let error = replace_with(
            &path,
            |file| file.write_all(b"new"),
            |_, _| Err(io::Error::new(io::ErrorKind::PermissionDenied, "locked")),
        );
        assert!(error.is_err());
        assert_eq!(fs::read(&path).unwrap(), b"original");
        assert_eq!(fs::read_dir(&root).unwrap().count(), 1);
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn directory_is_not_removed_or_replaced() {
        let root = directory();
        let path = root.join("folder");
        fs::create_dir(&path).unwrap();
        assert!(write(&path, b"new").is_err());
        assert!(path.is_dir());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn failure_after_publication_never_acknowledges_but_keeps_the_complete_file() {
        let root = directory(); let path = root.join("document.md");
        fs::write(&path,b"original").unwrap();
        let result=replace_with(&path,|file| {file.write_all(b"complete new revision")?;file.sync_all()},|from,to| {rename_replace(from,to)?;Err(io::Error::other("acknowledgement interrupted"))});
        assert!(result.is_err());assert_eq!(fs::read(&path).unwrap(),b"complete new revision");assert_eq!(fs::read_dir(&root).unwrap().count(),1);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn read_only_original_refuses_publication_without_truncating() {
        let root=directory();let path=root.join("document.md");fs::write(&path,b"original").unwrap();
        let initial=fs::metadata(&path).unwrap().permissions();let mut readonly=initial.clone();readonly.set_readonly(true);fs::set_permissions(&path,readonly).unwrap();
        assert!(write(&path,b"new").is_err());assert_eq!(fs::read(&path).unwrap(),b"original");assert_eq!(fs::read_dir(&root).unwrap().count(),1);
        fs::set_permissions(&path,initial).unwrap();fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn no_replace_publication_preserves_concurrent_file_and_directory_creators() {
        let root = directory();
        for folder in [false, true] {
            let source = root.join(if folder { "source-folder" } else { "source.md" });
            let target = root.join(if folder { "target-folder" } else { "target.md" });
            assert!(!target.exists()); // The caller's preflight is now stale.
            if folder {
                fs::create_dir(&source).unwrap();
                fs::write(source.join("kept.md"), b"source").unwrap();
                fs::create_dir(&target).unwrap(); // Even an EMPTY folder must survive.
            } else {
                fs::write(&source, b"source").unwrap();
                fs::write(&target, b"concurrent").unwrap();
            }
            assert!(rename_no_replace(&source, &target).is_err());
            if folder {
                assert_eq!(fs::read(source.join("kept.md")).unwrap(), b"source");
                assert_eq!(fs::read_dir(&target).unwrap().count(), 0);
            } else {
                assert_eq!(fs::read(&source).unwrap(), b"source");
                assert_eq!(fs::read(&target).unwrap(), b"concurrent");
            }
        }
        let free = root.join("published.md");
        rename_no_replace(&root.join("source.md"), &free).unwrap();
        assert_eq!(fs::read(free).unwrap(), b"source");
        let free_folder = root.join("published-folder");
        rename_no_replace(&root.join("source-folder"), &free_folder).unwrap();
        assert_eq!(fs::read(free_folder.join("kept.md")).unwrap(), b"source");
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn staged_creation_never_exposes_incomplete_data_or_replaces_a_late_creator() {
        let root = directory();
        let target = root.join("new.md");
        let failed = stage_with(
            &target,
            false,
            |file| {
                file.write_all(b"incomplete")?;
                assert!(!target.exists());
                Err(io::Error::other("simulated full disk"))
            },
            |_, _| panic!("incomplete data must not be published"),
        );
        assert!(failed.is_err());
        assert!(!target.exists());
        assert_eq!(fs::read_dir(&root).unwrap().count(), 0);
        let refused = stage_with(
            &target,
            false,
            |file| {
                file.write_all(b"complete")?;
                file.sync_all()
            },
            |from, to| {
                assert_eq!(fs::read(from)?, b"complete");
                assert!(!to.exists());
                fs::write(to, b"another creator")?;
                rename_no_replace(from, to)
            },
        );
        assert!(refused.is_err());
        assert_eq!(fs::read(&target).unwrap(), b"another creator");
        assert_eq!(fs::read_dir(&root).unwrap().count(), 1);
        fs::remove_dir_all(root).unwrap();
    }

    #[cfg(windows)]
    #[test]
    fn no_replace_supports_long_unicode_paths_and_case_only_rename() {
        let root = directory();
        let mut nested = root.clone();
        for _ in 0..5 {
            nested.push("documentación-y-recuperación-extensa");
        }
        fs::create_dir_all(&nested).unwrap();
        let source = nested.join("Revisión.md");
        let destination = nested.join("revisión.md");
        fs::write(&source, b"kept").unwrap();
        rename_no_replace(&source, &destination).unwrap();
        assert!(fs::read_dir(&nested)
            .unwrap()
            .any(|entry| entry.unwrap().file_name() == "revisión.md"));
        assert_eq!(fs::read(&destination).unwrap(), b"kept");
        fs::remove_dir_all(root).unwrap();
    }
}
