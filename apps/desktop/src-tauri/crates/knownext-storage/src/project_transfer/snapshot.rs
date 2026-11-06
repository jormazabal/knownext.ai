//! Saved project files become a private, verified snapshot before packaging.
use super::*;
use std::{
    fs,
    io::{Read, Write},
};

pub(super) struct Snapshot {
    pub manifest: Manifest,
    pub directory: tempfile::TempDir,
    pub unplanned_exclusions: usize,
}

fn report_path(value: &str) -> String {
    let mut out = String::new();
    for c in value.chars() {
        let next = if c.is_control() {
            format!("\\u{:04X}", c as u32)
        } else {
            c.to_string()
        };
        if out.len() + next.len() > 4000 {
            out.push_str("…");
            break;
        }
        out.push_str(&next);
    }
    out
}
fn read_hash(path: &Path, check: &dyn Fn() -> Result<(), String>) -> Result<(u64, String), String> {
    let meta = fs::symlink_metadata(path).map_err(|_| "Un archivo dejó de estar disponible")?;
    if !meta.is_file() || batch::linked(&meta) || meta.len() > MAX_FILE {
        return Err("Un archivo dejó de ser regular o supera 64 MiB".into());
    }
    let mut file = fs::File::open(path)
        .map_err(|_| "No se puede leer un archivo guardado")?
        .take(MAX_FILE + 1);
    let mut digest = Sha256::new();
    let mut count = 0u64;
    let mut buffer = [0; 65536];
    loop {
        check()?;
        let n = file
            .read(&mut buffer)
            .map_err(|_| "No se pudo leer el archivo guardado completo")?;
        if n == 0 {
            break;
        }
        count += n as u64;
        if count > MAX_FILE {
            return Err("Un archivo supera 64 MiB".into());
        }
        digest.update(&buffer[..n]);
    }
    Ok((count, format!("{:x}", digest.finalize())))
}

pub(super) fn prepare(
    root: &Path,
    parent: &Path,
    name: &str,
    check: &dyn Fn() -> Result<(), String>,
) -> Result<Snapshot, String> {
    prepare_selected(root, parent, name, &[], check)
}
pub(super) fn prepare_selected(
    root: &Path,
    parent: &Path,
    name: &str,
    selection: &[String],
    check: &dyn Fn() -> Result<(), String>,
) -> Result<Snapshot, String> {
    prepare_scope(root, parent, name, selection, false, false, check)
}
pub(super) fn prepare_private(
    root: &Path,
    parent: &Path,
    name: &str,
    check: &dyn Fn() -> Result<(), String>,
) -> Result<Snapshot, String> {
    prepare_scope(root, parent, name, &[], true, false, check)
}
pub(super) fn prepare_backup(
    root: &Path,
    parent: &Path,
    name: &str,
    check: &dyn Fn() -> Result<(), String>,
) -> Result<Snapshot, String> {
    prepare_scope(root, parent, name, &[], true, true, check)
}
fn prepare_scope(
    root: &Path,
    parent: &Path,
    name: &str,
    selection: &[String],
    private: bool,
    backup: bool,
    check: &dyn Fn() -> Result<(), String>,
) -> Result<Snapshot, String> {
    for path in selection {
        paths::validate(path)?;
        let source = path_policy::resolve(root, path)?;
        let meta = fs::symlink_metadata(source)
            .map_err(|_| "Un elemento seleccionado ya no está disponible")?;
        if batch::linked(&meta) {
            return Err("No se exportan enlaces de la selección".into());
        }
    }
    let root = root
        .canonicalize()
        .map_err(|_| "La carpeta del proyecto no está disponible")?;
    let meta = fs::symlink_metadata(parent)
        .map_err(|_| "No se puede reservar espacio privado para el paquete")?;
    if !meta.is_dir() || batch::linked(&meta) {
        return Err("La preparación necesita una carpeta privada regular".into());
    }
    let directory = tempfile::Builder::new()
        .prefix("snapshot-")
        .tempdir_in(parent)
        .map_err(|_| "No se puede crear la instantánea del paquete")?;
    let mut manifest = Manifest {
        supplement: None,
        template_description: None,
        format: FORMAT.into(),
        schema_version: 1,
        project_name: name.trim().into(),
        created_at: knownext_core::now_iso(),
        directories: vec![],
        files: vec![],
        exclusions: vec![],
        adjustments: vec![],
        reference_warnings: vec![],
    };
    let mut folders = vec![String::new()];
    let mut visited = 0usize;
    let mut total = 0u64;
    let mut source_versions = Vec::new();
    let mut unplanned_exclusions = 0usize;
    while let Some(relative) = folders.pop() {
        check()?;
        let folder = if relative.is_empty() {
            root.clone()
        } else {
            path_policy::resolve(&root, &relative)?
        };
        let reader = match fs::read_dir(&folder) {
            Ok(reader) => reader,
            Err(_) => {
                if relative.is_empty() {
                    return Err("No se puede leer la raíz del proyecto".into());
                }
                unplanned_exclusions += 1;
                manifest.exclusions.push(Exclusion {
                    path: report_path(&relative),
                    reason: "Carpeta no accesible; su contenido no se ha incluido".into(),
                });
                continue;
            }
        };
        let mut entries = Vec::new();
        for entry in reader.take(MAX_ENTRIES.saturating_sub(visited) + 1) {
            check()?;
            visited += 1;
            if visited > MAX_ENTRIES {
                return Err("El recorrido del proyecto supera 10.000 entradas".into());
            }
            entries.push(entry.map_err(|_| "No se puede consultar una entrada del proyecto")?);
        }
        entries.sort_by_key(|e| e.file_name());
        for entry in entries {
            check()?;
            let name = entry.file_name();
            let Some(name) = name.to_str() else {
                unplanned_exclusions += 1;
                manifest.exclusions.push(Exclusion {
                    path: report_path(&relative_from_root(&root, &entry.path())),
                    reason: "Nombre de archivo no representable como UTF-8".into(),
                });
                continue;
            };
            let path = if relative.is_empty() {
                name.to_owned()
            } else {
                format!("{relative}/{name}")
            };
            // Exclude coordination BEFORE metadata in every producer, not only backups.
            if path.split('/').any(paths::coordination) || backup && paths::backup_exclusion(&path)
            {
                manifest.exclusions.push(Exclusion {
                    path,
                    reason: "Datos internos, cachés o coordinación fuera del alcance de la copia"
                        .into(),
                });
                continue;
            }
            if selection.is_empty() && paths::key(&path) == paths::key("Archivo KnowNext") {
                if private && path != "Archivo KnowNext" {
                    return Err("El nombre del archivo privado debe ser Archivo KnowNext, sin variantes de mayúsculas, para conservarlo entre plataformas".into());
                }
                if !private {
                    manifest.exclusions.push(Exclusion {path, reason:"Archivo privado excluido del paquete documental. Activa Añadir archivo privado para conservar sus copias completas".into()});
                }
                continue;
            }
            if !selection.is_empty()
                && !selection.iter().any(|selected| {
                    path == *selected
                        || path.starts_with(&format!("{selected}/"))
                        || selected.starts_with(&format!("{path}/"))
                })
            {
                continue;
            }
            if paths::validate(&path).is_err() {
                if !paths::backup_exclusion(&path) {
                    unplanned_exclusions += 1;
                }
                manifest.exclusions.push(Exclusion {
                    path: report_path(&path),
                    reason: "Ruta interna, oculta o no portable; se conserva fuera del paquete"
                        .into(),
                });
                continue;
            }
            let meta = fs::symlink_metadata(entry.path())
                .map_err(|_| "No se puede comprobar una entrada del proyecto")?;
            if batch::linked(&meta) || (!meta.is_file() && !meta.is_dir()) {
                unplanned_exclusions += 1;
                manifest.exclusions.push(Exclusion {
                    path,
                    reason: "Enlace o entrada no regular; no se sigue su destino".into(),
                });
                continue;
            }
            if meta.is_dir() {
                fs::create_dir_all(path_policy::resolve(directory.path(), &path)?)
                    .map_err(|_| "No se puede copiar una carpeta de la instantánea")?;
                manifest.directories.push(path.clone());
                folders.push(path);
                continue;
            }
            let Some(kind) = paths::kind(&path) else {
                unplanned_exclusions += 1;
                manifest.exclusions.push(Exclusion {
                    path,
                    reason: "Formato fuera del paquete documental; no se incluye".into(),
                });
                continue;
            };
            if meta.len() > MAX_FILE {
                return Err(format!(
                    "«{}» supera 64 MiB. El proyecto original se conserva",
                    report_path(&path)
                ));
            }
            let source = path_policy::resolve(&root, &path)?;
            let destination = path_policy::resolve(directory.path(), &path)?;
            let mut input = fs::File::open(&source)
                .map_err(|_| "Un archivo guardado no se puede abrir")?
                .take(MAX_FILE + 1);
            let mut output = fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(destination)
                .map_err(|_| "No se pudo crear una copia exclusiva en la instantánea")?;
            let mut count = 0u64;
            let mut digest = Sha256::new();
            let mut buffer = [0; 65536];
            loop {
                check()?;
                let n = input
                    .read(&mut buffer)
                    .map_err(|_| "No se pudo leer un archivo del proyecto completo")?;
                if n == 0 {
                    break;
                }
                count += n as u64;
                total += n as u64;
                if count > MAX_FILE || total > MAX_CONTENT {
                    return Err("Los archivos reales superan el presupuesto del paquete".into());
                }
                digest.update(&buffer[..n]);
                output.write_all(&buffer[..n]).map_err(|_| {
                    "No se pudo escribir la instantánea; los originales se conservan"
                })?;
            }
            output
                .sync_all()
                .map_err(|_| "No se pudo confirmar un archivo de la instantánea")?;
            let hash = format!("{:x}", digest.finalize());
            if count != meta.len() {
                return Err("Un archivo cambió de tamaño durante la preparación".into());
            }
            source_versions.push((source, count, hash.clone()));
            manifest.files.push(PackageFile {
                path,
                size: count,
                sha256: hash,
                kind,
            });
        }
    }
    manifest.directories.sort();
    manifest.files.sort_by(|a, b| a.path.cmp(&b.path));
    manifest.validate()?;
    // Verification stays outside mutation authority; ordinary saves can continue.
    for (path, size, hash) in source_versions {
        check()?;
        if read_hash(&path, check)? != (size, hash) {
            return Err("Un archivo cambió mientras se preparaba el paquete. Vuelve a prepararlo; los originales se conservan".into());
        }
    }
    if !private {
        adapt_references(directory.path(), &mut manifest, check)?;
    }
    manifest.validate()?;
    Ok(Snapshot {
        manifest,
        directory,
        unplanned_exclusions,
    })
}

pub(super) fn adapt_references(
    root: &Path,
    manifest: &mut Manifest,
    check: &dyn Fn() -> Result<(), String>,
) -> Result<(), String> {
    let all = manifest
        .files
        .iter()
        .map(|f| &f.path)
        .chain(manifest.directories.iter())
        .map(|p| (paths::key(p), p.clone()))
        .collect::<std::collections::HashMap<_, _>>();
    let mut parsed_bytes = 0u64;
    for file in &mut manifest.files {
        if file.kind != FileKind::Markdown || file.path.starts_with("Archivo KnowNext/") {
            continue;
        }
        check()?;
        if file.size > 2 * 1024 * 1024 || parsed_bytes.saturating_add(file.size) > 64 * 1024 * 1024
        {
            manifest.reference_warnings.push(ReferenceWarning{path:file.path.clone(),message:"No se comprobaron referencias por el límite de análisis (2 MiB por documento y 64 MiB en total); el archivo se incluye completo".into()});
            continue;
        }
        let path = path_policy::resolve(root, &file.path)?;
        let text =
            fs::read_to_string(&path).map_err(|_| "Un documento guardado no es Markdown UTF-8")?;
        parsed_bytes += file.size;
        let spans = knownext_docs::markdown_destinations(&text);
        let mut mappings = BTreeMap::new();
        let mut changed = 0usize;
        let mut missing = 0usize;
        for span in spans {
            check()?;
            if reqwest::Url::parse(&span.target)
                .ok()
                .and_then(|u| u.host_str().map(str::to_owned))
                .is_some_and(|host| host.eq_ignore_ascii_case("knownext-asset.localhost"))
            {
                return Err("Un documento conserva una referencia interna de visualización. Vuelve a guardarlo desde el editor antes de preparar el paquete; no se comparte esa referencia privada".into());
            }
            let Some(previous) = document_links::local_target(&file.path, &span.target) else {
                continue;
            };
            match all.get(&paths::key(&previous)) {
                Some(actual) if actual != &previous => {
                    mappings.insert(previous, actual.clone());
                    changed += 1;
                }
                Some(_) => (),
                None => missing += 1,
            }
        }
        if missing > 0 {
            manifest.reference_warnings.push(ReferenceWarning{path:file.path.clone(),message:format!("{missing} referencias locales no tienen archivo o carpeta incluida en el paquete; no se descargan recursos externos")});
        }
        if changed > 0 {
            let rewritten = document_links::rewrite(&text, &file.path, &file.path, &mappings);
            if rewritten.len() as u64 > MAX_FILE {
                return Err("Las referencias adaptadas hacen superar 64 MiB a un documento".into());
            }
            atomic_io::write(&path, rewritten.as_bytes())
                .map_err(|_| "No se pudo adaptar una referencia en la copia privada")?;
            file.size = rewritten.len() as u64;
            file.sha256 = sha256_hex(rewritten.as_bytes());
            manifest.adjustments.push(ReferenceAdjustment {
                path: file.path.clone(),
                targets_updated: changed,
            });
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn saved_snapshot_excludes_secrets_git_unknown_files_and_adapts_only_link_destinations() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().join("project");
        fs::create_dir_all(root.join("Docs")).unwrap();
        fs::create_dir_all(root.join("Assets")).unwrap();
        fs::create_dir_all(root.join(".git")).unwrap();
        fs::create_dir(root.join("Vacía")).unwrap();
        let markdown="# Plan\n\n![Pixel](../assets/Pixel.PNG#view)\n\n`![Example](../assets/Pixel.PNG)`\n\n[missing](../absent.md)\n";
        fs::write(root.join("Docs/Plan.md"), markdown).unwrap();
        fs::write(root.join("Assets/pixel.png"), b"opaque image bytes").unwrap();
        fs::write(root.join(".git/config"), b"PRIVATE GIT DATA").unwrap();
        fs::write(root.join(".env"), b"PRIVATE KEY").unwrap();
        fs::write(root.join("settings.json"), b"PRIVATE CONFIG").unwrap();
        let snapshot = prepare(&root, temp.path(), "Equipo", &|| Ok(())).unwrap();
        assert_eq!(snapshot.manifest.files.len(), 2);
        assert_eq!(snapshot.manifest.exclusions.len(), 3);
        assert_eq!(snapshot.manifest.adjustments.len(), 1);
        assert_eq!(snapshot.manifest.reference_warnings.len(), 1);
        let adjusted = fs::read_to_string(snapshot.directory.path().join("Docs/Plan.md")).unwrap();
        assert!(adjusted.contains("../Assets/pixel.png#view"));
        assert!(adjusted.contains("`![Example](../assets/Pixel.PNG)`"));
        assert_eq!(
            fs::read_to_string(root.join("Docs/Plan.md")).unwrap(),
            markdown
        );
        assert!(snapshot.directory.path().join("Vacía").is_dir());
        assert!(!snapshot.directory.path().join(".env").exists());
        assert!(!snapshot.directory.path().join("settings.json").exists());
    }
    #[test]
    fn cancellation_drops_partial_snapshot_and_never_changes_saved_source() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().join("project");
        fs::create_dir(&root).unwrap();
        fs::write(root.join("Plan.md"), b"# Keep").unwrap();
        let calls = std::cell::Cell::new(0);
        assert!(prepare(&root, temp.path(), "Equipo", &|| {
            calls.set(calls.get() + 1);
            if calls.get() > 4 {
                Err("cancelled fixture".into())
            } else {
                Ok(())
            }
        })
        .is_err());
        assert_eq!(fs::read(root.join("Plan.md")).unwrap(), b"# Keep");
        assert_eq!(fs::read_dir(temp.path()).unwrap().count(), 1);
    }
    #[test]
    fn internal_asset_tokens_are_not_silently_exported_or_remapped_to_another_project() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().join("project");
        fs::create_dir(&root).unwrap();
        let original = "![x](http://knownext-asset.localhost/PRIVATE_TOKEN/photo.png)";
        fs::write(root.join("Plan.md"), original).unwrap();
        assert!(prepare(&root, temp.path(), "Equipo", &|| Ok(()))
            .err()
            .unwrap()
            .contains("referencia interna"));
        assert_eq!(fs::read_to_string(root.join("Plan.md")).unwrap(), original);
    }
}
