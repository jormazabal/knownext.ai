//! The ordinary document package format, projected from verified conflict copies.
use super::*;
use std::fs;

pub(crate) fn recovery_package(
    created_at: &str,
    files: &[(String, Vec<u8>)],
) -> Result<Vec<u8>, String> {
    if !(3..=5).contains(&files.len()) {
        return Err("El conjunto portable necesita entre tres y cinco documentos".into());
    }
    let temporary = tempfile::tempdir().map_err(|_| "No se puede preparar el paquete privado")?;
    let root = temporary.path().join("content");
    fs::create_dir(&root).map_err(|_| "No se puede preparar el contenido")?;
    let mut directories = BTreeSet::new();
    let mut entries = vec![];
    for (path, bytes) in files {
        paths::validate(path)?;
        let kind = if path.ends_with(".md") {
            FileKind::Markdown
        } else if path.ends_with(".knote") {
            FileKind::Handwritten
        } else {
            return Err("Tipo documental no compatible".into());
        };
        let parent = path
            .rsplit_once('/')
            .ok_or("Falta la carpeta de variantes")?
            .0;
        directories.insert(parent.to_string());
        fs::create_dir_all(root.join(parent)).map_err(|_| "No se puede preparar una variante")?;
        atomic_io::create(&root.join(path), bytes).map_err(|_| "No se puede congelar una variante")?;
        entries.push(PackageFile {
            path: path.clone(),
            size: bytes.len() as u64,
            sha256: sha256_hex(bytes),
            kind,
        });
    }
    entries.sort_by(|a, b| a.path.cmp(&b.path));
    let warnings = entries.iter().map(|file| ReferenceWarning { path: file.path.clone(), message: "Los recursos y enlaces relativos del proyecto original no se incluyen ni se adaptan.".into() }).collect();
    let manifest = Manifest { supplement: None, template_description: None, format: FORMAT.into(), schema_version: 1, project_name: "Variantes de conflicto".into(), created_at: created_at.into(), directories: directories.into_iter().collect(), files: entries, exclusions: vec![Exclusion { path: "Estado privado y recursos del proyecto original".into(), reason: "Solo contenido documental: sin borradores activos, recibos, conexiones, credenciales, configuración, audio ni historial Git.".into() }], adjustments: vec![], reference_warnings: warnings };
    let output = temporary.path().join("variantes.zip");
    archive::write(&root, &manifest, &output)?;
    if fs::metadata(&output)
        .map_err(|_| "No se puede comprobar el paquete")?
        .len()
        > 32 * 1024 * 1024
    {
        return Err("El paquete de variantes supera 32 MiB; se conservan los originales".into());
    }
    fs::read(output).map_err(|_| "No se puede leer el paquete comprobado".into())
}
