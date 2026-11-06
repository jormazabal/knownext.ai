use std::path::{Component, Path, PathBuf};

fn reserved(name: &std::ffi::OsStr) -> bool {
    let name = name.to_string_lossy();
    let portable = name.trim_end_matches(['.', ' ']);
    portable.eq_ignore_ascii_case(".git") || portable.eq_ignore_ascii_case(".knownext-trash") || portable.eq_ignore_ascii_case(".knownext-runtime") || portable.eq_ignore_ascii_case(".knownext-mixed-work") || portable.eq_ignore_ascii_case(".knownext-history-copies") || portable.to_ascii_lowercase().starts_with(".knownext-history-copies.")
}

/// Validate both the lexical path and the existing ancestor (including links).
pub(crate) fn resolve(root: &Path, relative: &str) -> Result<PathBuf, String> {
    let path = PathBuf::from(relative.replace('/', std::path::MAIN_SEPARATOR_STR));
    if path.is_absolute()
        || path.components().any(|part| match part {
            Component::ParentDir | Component::RootDir | Component::Prefix(_) => true,
            Component::Normal(name) => reserved(name) || name.to_string_lossy().contains(':'),
            _ => false,
        })
    {
        return Err("Ruta fuera del proyecto o reservada para datos internos".into());
    }
    let canonical_root = root.canonicalize().map_err(|error| error.to_string())?;
    let candidate = root.join(path);
    let mut ancestor = candidate.as_path();
    loop {
        match std::fs::symlink_metadata(ancestor) {
            Ok(_) => {
                let canonical = ancestor.canonicalize().map_err(|error| error.to_string())?;
                if !canonical.starts_with(&canonical_root) {
                    return Err("La ruta enlazada sale del proyecto".into());
                }
                if canonical
                    .strip_prefix(&canonical_root)
                    .map_err(|e| e.to_string())?
                    .components()
                    .any(|part| matches!(part,Component::Normal(name) if reserved(name)))
                {
                    return Err("La ruta enlazada accede a datos internos del proyecto".into());
                }
                break;
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                ancestor = ancestor
                    .parent()
                    .ok_or("No hay carpeta contenedora valida")?;
            }
            Err(error) => return Err(error.to_string()),
        }
    }
    Ok(candidate)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_parent_drive_and_git_paths_but_allows_new_descendants() {
        let root = std::env::temp_dir().join(knownext_core::compact_id("knownext-path-policy"));
        std::fs::create_dir_all(&root).unwrap();
        for path in [
            "../escape.md",
            ".git/config",
            "docs/.git/config",
            ".git./config",
            ".knownext-trash /payload",
            ".knownext-runtime/owner.lock",
            "docs/.KNOWNEXT-RUNTIME /owner.lock",
            "C:escape.md",
            "C:/escape.md",
        ] {
            assert!(resolve(&root, path).is_err(), "accepted {path}");
        }
        assert_eq!(
            resolve(&root, "new/folder/document.md").unwrap(),
            root.join("new/folder/document.md")
        );
        std::fs::remove_dir(&root).unwrap();
    }
    #[cfg(unix)]
    #[test]
    fn rejects_external_symlink_ancestor() {
        let root = std::env::temp_dir().join(knownext_core::compact_id("knownext-link-policy"));
        std::fs::create_dir_all(&root).unwrap();
        std::os::unix::fs::symlink(std::env::temp_dir(), root.join("outside")).unwrap();
        assert!(resolve(&root, "outside/document.md").is_err());
        std::fs::remove_file(root.join("outside")).unwrap();
        std::fs::remove_dir(root).unwrap();
    }
}
