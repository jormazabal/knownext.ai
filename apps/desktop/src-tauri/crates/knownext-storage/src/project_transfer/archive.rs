//! Bounded ZIP parsing. Never use ZipArchive::extract on external input.
use super::*;
use std::{
    fs,
    io::{Read, Seek, SeekFrom, Write},
};
use zip::{write::SimpleFileOptions, CompressionMethod, ZipArchive, ZipWriter};

struct BudgetFile {
    file: fs::File,
    position: u64,
}
impl Write for BudgetFile {
    fn write(&mut self, bytes: &[u8]) -> std::io::Result<usize> {
        if self.position.saturating_add(bytes.len() as u64) > MAX_ARCHIVE {
            return Err(std::io::Error::other("El ZIP preparado supera 512 MiB"));
        }
        let count = self.file.write(bytes)?;
        self.position += count as u64;
        Ok(count)
    }
    fn flush(&mut self) -> std::io::Result<()> {
        self.file.flush()
    }
}
impl Seek for BudgetFile {
    fn seek(&mut self, from: SeekFrom) -> std::io::Result<u64> {
        self.position = self.file.seek(from)?;
        if self.position > MAX_ARCHIVE {
            return Err(std::io::Error::other("Posición ZIP fuera de presupuesto"));
        }
        Ok(self.position)
    }
}

fn validate_payload(kind: FileKind, bytes: &[u8]) -> Result<(), String> {
    match kind {
        FileKind::Markdown => {
            std::str::from_utf8(bytes).map_err(|_| "Un documento Markdown no es UTF-8 válido")?;
        }
        FileKind::Handwritten => {
            let value: Value = serde_json::from_slice(bytes)
                .map_err(|_| "Una nota .knote no contiene JSON válido")?;
            document_validation::handwritten(&value)?;
        }
        _ => (),
    }
    Ok(())
}

/// Reject unbounded counts, multidisk/ZIP64 and impossible central directory ranges before ZIP allocates.
fn preflight(file: &mut fs::File) -> Result<(), String> {
    let size = file
        .metadata()
        .map_err(|_| "No se puede consultar el paquete")?
        .len();
    if !(22..=MAX_ARCHIVE).contains(&size) {
        return Err("El paquete no es ZIP válido de hasta 512 MiB".into());
    }
    let length = size.min(65557) as usize;
    file.seek(SeekFrom::End(-(length as i64)))
        .map_err(|_| "No se puede leer el final del paquete")?;
    let mut tail = vec![0; length];
    file.read_exact(&mut tail)
        .map_err(|_| "El paquete está incompleto")?;
    // Our package writer emits no ZIP comment. A unique final EOCD avoids parser ambiguity.
    let end = length - 22;
    if tail[end..end + 4] != *b"PK\x05\x06" || tail[end + 20..end + 22] != [0, 0] {
        return Err("El paquete necesita un final ZIP sin comentarios ni datos añadidos".into());
    }
    let u16at = |p| u16::from_le_bytes([tail[end + p], tail[end + p + 1]]);
    let u32at = |p| u32::from_le_bytes(tail[end + p..end + p + 4].try_into().unwrap());
    if u16at(4) != 0 || u16at(6) != 0 || u16at(8) != u16at(10) {
        return Err("No se admiten paquetes ZIP de varios volúmenes".into());
    }
    if u16at(10) == u16::MAX
        || u32at(12) == u32::MAX
        || u32at(16) == u32::MAX
        || (end >= 20 && tail[end - 20..end - 16] == *b"PK\x06\x07")
    {
        return Err("ZIP64 no está admitido en esta versión del paquete".into());
    }
    if u16at(10) as usize > MAX_ENTRIES || u32at(12) as u64 > 16 * 1024 * 1024 {
        return Err("El directorio ZIP supera su presupuesto".into());
    }
    let absolute_end = size - length as u64 + end as u64;
    if (u32at(16) as u64).saturating_add(u32at(12) as u64) != absolute_end {
        return Err("El directorio ZIP no coincide con el contenido del archivo".into());
    }
    file.seek(SeekFrom::Start(0))
        .map_err(|_| "No se puede volver a leer el paquete")?;
    Ok(())
}

pub(super) fn inspect(path: &Path) -> Result<Manifest, String> {
    let meta =
        fs::symlink_metadata(path).map_err(|_| "No se puede consultar el paquete elegido")?;
    if !meta.is_file() || batch::linked(&meta) || meta.len() > MAX_ARCHIVE {
        return Err("El paquete necesita un archivo regular de hasta 512 MiB".into());
    }
    let mut file = fs::File::open(path).map_err(|_| "No se puede abrir el paquete elegido")?;
    preflight(&mut file)?;
    let mut zip =
        ZipArchive::new(file).map_err(|_| "El directorio del paquete ZIP no es válido")?;
    if zip.len() > MAX_ENTRIES {
        return Err("El paquete contiene demasiadas entradas".into());
    }
    let mut names = BTreeSet::new();
    let mut manifest_index = None;
    for i in 0..zip.len() {
        let entry = zip
            .by_index(i)
            .map_err(|_| "No se puede consultar una entrada ZIP")?;
        let name = std::str::from_utf8(entry.name_raw())
            .map_err(|_| "Las rutas del paquete necesitan UTF-8")?;
        if name != entry.name() || !names.insert(name.to_owned()) {
            return Err("El ZIP contiene nombres ambiguos o duplicados".into());
        }
        if entry.encrypted()
            || !matches!(
                entry.compression(),
                CompressionMethod::Stored | CompressionMethod::Deflated
            )
        {
            return Err("El ZIP usa cifrado o una compresión no admitida".into());
        }
        let mode = entry.unix_mode().unwrap_or(0) & 0o170000;
        if !matches!(mode, 0 | 0o100000 | 0o040000)
            || (entry.is_dir() && mode == 0o100000)
            || (!entry.is_dir() && mode == 0o040000)
        {
            return Err("El paquete contiene enlaces o entradas no regulares".into());
        }
        if name == MANIFEST {
            if entry.is_dir() || entry.size() > MAX_MANIFEST {
                return Err("El manifiesto del paquete supera 8 MiB o no es un archivo".into());
            }
            manifest_index = Some(i);
        }
    }
    let mut bytes = Vec::new();
    zip.by_index(manifest_index.ok_or("Falta knownext-project.json")?)
        .map_err(|_| "No se puede leer el manifiesto")?
        .take(MAX_MANIFEST + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| "El manifiesto del paquete está incompleto")?;
    if bytes.len() as u64 > MAX_MANIFEST {
        return Err("El manifiesto supera 8 MiB".into());
    }
    let manifest: Manifest = serde_json::from_slice(&bytes)
        .map_err(|_| "Manifiesto no válido o con campos adicionales")?;
    manifest.validate()?;
    let mut expected = BTreeMap::new();
    expected.insert(MANIFEST.to_owned(), None);
    for dir in &manifest.directories {
        expected.insert(format!("{dir}/"), None);
    }
    for file in &manifest.files {
        expected.insert(file.path.clone(), Some(file));
    }
    if names.len() != expected.len() || names.iter().any(|name| !expected.contains_key(name)) {
        return Err("El ZIP contiene entradas no declaradas o le faltan archivos".into());
    }
    let mut total = bytes.len() as u64;
    for i in 0..zip.len() {
        let mut entry = zip
            .by_index(i)
            .map_err(|_| "No se puede verificar una entrada ZIP")?;
        let name = entry.name().to_owned();
        if name == MANIFEST {
            continue;
        }
        if let Some(Some(file)) = expected.get(&name) {
            if entry.is_dir() || entry.size() != file.size {
                return Err("Un tamaño de archivo no coincide con el manifiesto".into());
            }
            let mut digest = Sha256::new();
            let mut read = 0u64;
            let mut payload = Vec::new();
            let mut buffer = [0; 65536];
            let mut limited = (&mut entry).take(file.size.saturating_add(1));
            loop {
                let n = limited
                    .read(&mut buffer)
                    .map_err(|_| "Un archivo ZIP está dañado o su CRC no coincide")?;
                if n == 0 {
                    break;
                }
                read += n as u64;
                total += n as u64;
                if read > file.size || total > MAX_CONTENT {
                    return Err("El contenido real supera el presupuesto del paquete".into());
                }
                digest.update(&buffer[..n]);
                if matches!(file.kind, FileKind::Markdown | FileKind::Handwritten) {
                    payload.extend_from_slice(&buffer[..n]);
                }
            }
            if read != file.size || format!("{:x}", digest.finalize()) != file.sha256 {
                return Err("La huella SHA256 o el tamaño real de un archivo no coincide".into());
            }
            validate_payload(file.kind, &payload)?;
        } else if !entry.is_dir() || entry.size() != 0 {
            return Err("Una carpeta declarada no es una entrada vacía de directorio".into());
        }
    }
    Ok(manifest)
}

pub(super) fn write(root: &Path, manifest: &Manifest, output: &Path) -> Result<(), String> {
    manifest.validate()?;
    let bytes = serde_json::to_vec_pretty(manifest).map_err(|e| e.to_string())?;
    if bytes.len() as u64 > MAX_MANIFEST {
        return Err("El manifiesto supera 8 MiB".into());
    }
    if manifest
        .files
        .iter()
        .map(|f| f.size)
        .sum::<u64>()
        .saturating_add(bytes.len() as u64)
        > MAX_CONTENT
    {
        return Err("El contenido y su manifiesto superan 1 GiB".into());
    }
    let file = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(output)
        .map_err(|_| "El destino de preparación ya existe o no se puede crear")?;
    let result = (|| -> Result<(), String> {
        let mut zip = ZipWriter::new(BudgetFile { file, position: 0 });
        let time = OffsetDateTime::parse(&manifest.created_at, &Rfc3339)
            .map_err(|_| "Fecha de paquete no válida")?;
        let date = zip::DateTime::from_date_and_time(
            time.year().clamp(1980, 2107) as u16,
            time.month() as u8,
            time.day(),
            time.hour(),
            time.minute(),
            time.second().min(59),
        )
        .map_err(|_| "No se puede representar la fecha ZIP")?;
        let options = SimpleFileOptions::default()
            .compression_method(CompressionMethod::Stored)
            .last_modified_time(date);
        zip.start_file(MANIFEST, options)
            .map_err(|e| e.to_string())?;
        zip.write_all(&bytes).map_err(|e| e.to_string())?;
        for dir in &manifest.directories {
            let source = path_policy::resolve(root, dir)?;
            let meta = fs::symlink_metadata(source)
                .map_err(|_| "Una carpeta de la instantánea no está disponible")?;
            if !meta.is_dir() || batch::linked(&meta) {
                return Err("La instantánea contiene una carpeta no regular".into());
            }
            zip.add_directory(format!("{dir}/"), options)
                .map_err(|e| e.to_string())?;
        }
        for item in &manifest.files {
            let source = path_policy::resolve(root, &item.path)?;
            let meta = fs::symlink_metadata(&source)
                .map_err(|_| "Un archivo de la instantánea no está disponible")?;
            if !meta.is_file() || batch::linked(&meta) || meta.len() != item.size {
                return Err("Un archivo de la instantánea cambió antes de empaquetar".into());
            }
            zip.start_file(&item.path, options)
                .map_err(|e| e.to_string())?;
            let mut input = fs::File::open(source)
                .map_err(|_| "No se puede abrir un archivo de la instantánea")?
                .take(item.size + 1);
            let mut digest = Sha256::new();
            let mut count = 0u64;
            let mut buffer = [0; 65536];
            loop {
                let n = input
                    .read(&mut buffer)
                    .map_err(|_| "No se puede leer la instantánea completa")?;
                if n == 0 {
                    break;
                }
                count += n as u64;
                if count > item.size {
                    return Err("La instantánea cambió de tamaño".into());
                };
                digest.update(&buffer[..n]);
                zip.write_all(&buffer[..n]).map_err(|e| e.to_string())?;
            }
            if count != item.size || format!("{:x}", digest.finalize()) != item.sha256 {
                return Err("La instantánea cambió de contenido".into());
            }
        }
        let finished = zip.finish().map_err(|e| e.to_string())?;
        finished
            .file
            .sync_all()
            .map_err(|_| "No se pudo confirmar la escritura del paquete")?;
        if finished.file.metadata().map_err(|e| e.to_string())?.len() > MAX_ARCHIVE {
            return Err("El ZIP preparado supera 512 MiB".into());
        }
        drop(finished);
        if &inspect(output)? != manifest {
            return Err("El manifiesto escrito no coincide con la instantánea".into());
        }
        Ok(())
    })();
    if result.is_err() {
        let _ = fs::remove_file(output);
    }
    result
}

/// A fresh, private staging directory owns every output; it is never merged into an existing root.
pub(super) fn extract(path: &Path, parent: &Path) -> Result<(Manifest, tempfile::TempDir), String> {
    let manifest = inspect(path)?;
    let meta = fs::symlink_metadata(parent)
        .map_err(|_| "La carpeta privada de preparación no está disponible")?;
    if !meta.is_dir() || batch::linked(&meta) {
        return Err("La preparación necesita una carpeta privada regular".into());
    }
    let temporary = tempfile::Builder::new()
        .prefix("content-")
        .tempdir_in(parent)
        .map_err(|_| "No se puede reservar una carpeta de importación nueva")?;
    let mut file = fs::File::open(path).map_err(|_| "No se puede volver a abrir el paquete")?;
    preflight(&mut file)?;
    let mut zip = ZipArchive::new(file).map_err(|_| "El ZIP cambió antes de extraerlo")?;
    for dir in &manifest.directories {
        fs::create_dir_all(path_policy::resolve(temporary.path(), dir)?)
            .map_err(|_| "No se puede crear una carpeta del paquete")?;
    }
    for item in &manifest.files {
        let destination = path_policy::resolve(temporary.path(), &item.path)?;
        let mut output = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(destination)
            .map_err(|_| "Un destino de importación ya existe o no se puede crear")?;
        let mut entry = zip
            .by_name(&item.path)
            .map_err(|_| "Un archivo del paquete dejó de estar disponible")?;
        if entry.is_dir() || entry.size() != item.size {
            return Err("El paquete cambió desde su revisión".into());
        }
        let mut limited = (&mut entry).take(item.size + 1);
        let mut buffer = [0; 65536];
        let mut digest = Sha256::new();
        let mut count = 0u64;
        loop {
            let n = limited
                .read(&mut buffer)
                .map_err(|_| "No se puede extraer el archivo completo")?;
            if n == 0 {
                break;
            }
            count += n as u64;
            if count > item.size {
                return Err("El archivo extraído supera el tamaño revisado".into());
            }
            digest.update(&buffer[..n]);
            output.write_all(&buffer[..n]).map_err(|_| {
                "No se pudo escribir la copia importada; el paquete original se conserva"
            })?;
        }
        if count != item.size || format!("{:x}", digest.finalize()) != item.sha256 {
            return Err("La copia extraída no coincide con el manifiesto revisado".into());
        }
        output
            .sync_all()
            .map_err(|_| "No se pudo confirmar un archivo importado")?;
    }
    Ok((manifest, temporary))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    fn manifest(files: Vec<(&str, Vec<u8>)>) -> Manifest {
        Manifest {
            supplement: None,
            template_description:None,
            format: FORMAT.into(),
            schema_version: 1,
            project_name: "Conocimiento del equipo".into(),
            created_at: "2026-10-31T12:00:00Z".into(),
            directories: vec![],
            files: files
                .into_iter()
                .map(|(path, data)| PackageFile {
                    path: path.into(),
                    size: data.len() as u64,
                    sha256: sha256_hex(&data),
                    kind: paths::kind(path).unwrap(),
                })
                .collect(),
            exclusions: vec![],
            adjustments: vec![],
            reference_warnings: vec![],
        }
    }
    fn virtual_zip(value: Value, entries: &[(&str, Vec<u8>)]) -> Vec<u8> {
        let mut zip = ZipWriter::new(Cursor::new(Vec::new()));
        let options = SimpleFileOptions::default().compression_method(CompressionMethod::Stored);
        zip.start_file(MANIFEST, options).unwrap();
        zip.write_all(&serde_json::to_vec(&value).unwrap()).unwrap();
        for (name, data) in entries {
            zip.start_file(*name, options).unwrap();
            zip.write_all(data).unwrap();
        }
        zip.finish().unwrap().into_inner()
    }
    fn put_zip(dir: &Path, name: &str, bytes: &[u8]) -> PathBuf {
        let path = dir.join(name);
        fs::write(&path, bytes).unwrap();
        path
    }
    #[test]
    fn roundtrip_preserves_markdown_png_note_bytes_and_empty_unicode_folder() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().join("source");
        fs::create_dir(&root).unwrap();
        let png=base64::engine::general_purpose::STANDARD.decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jXioAAAAASUVORK5CYII=").unwrap();
        let note = serde_json::to_vec(&default_handwritten_note(
            "source::Notas/Pizarra.knote",
            "Pizarra",
        ))
        .unwrap();
        let source = vec![
            (
                "docs/Plan.md",
                b"# Plan\n\n![Pixel](../assets/pixel.png)\n".to_vec(),
            ),
            ("assets/pixel.png", png),
            ("Notas/Pizarra.knote", note),
        ];
        let mut data = manifest(source.clone());
        data.directories = vec![
            "docs".into(),
            "assets".into(),
            "Notas".into(),
            "Vacía".into(),
        ];
        for d in &data.directories {
            fs::create_dir(root.join(d)).unwrap();
        }
        for (p, bytes) in &source {
            fs::write(root.join(p), bytes).unwrap();
        }
        let archive = temp.path().join("project.zip");
        write(&root, &data, &archive).unwrap();
        assert_eq!(inspect(&archive).unwrap(), data);
        let (restored, out) = extract(&archive, temp.path()).unwrap();
        assert_eq!(restored, data);
        assert!(out.path().join("Vacía").is_dir());
        for (path, bytes) in source {
            assert_eq!(fs::read(out.path().join(path)).unwrap(), bytes);
            assert_eq!(fs::read(root.join(path)).unwrap(), bytes);
        }
    }
    #[test]
    fn traversal_case_normalization_reserved_names_and_future_fields_are_rejected_before_extraction(
    ) {
        let dir = tempfile::tempdir().unwrap();
        let payload = b"# Safe\n".to_vec();
        let base = manifest(vec![("safe.md", payload.clone())]);
        for (i, path) in [
            "../outside.md",
            "/outside.md",
            "C:/outside.md",
            "docs\\outside.md",
            "safe.md:stream",
            ".git/config",
            "CON.md",
        ]
        .iter()
        .enumerate()
        {
            let mut data = serde_json::to_value(&base).unwrap();
            data["files"][0]["path"] = json!(path);
            let zip = put_zip(
                dir.path(),
                &format!("bad-{i}.zip"),
                &virtual_zip(data, &[(path, payload.clone())]),
            );
            assert!(extract(&zip, dir.path()).is_err());
        }
        for (i, (one, two)) in [
            ("Report.md", "report.md"),
            ("Café.md", "Cafe\u{301}.md"),
            ("Straße.md", "STRASSE.md"),
        ]
        .into_iter()
        .enumerate()
        {
            let data = manifest(vec![(one, payload.clone()), (two, payload.clone())]);
            let zip = put_zip(
                dir.path(),
                &format!("case-{i}.zip"),
                &virtual_zip(
                    serde_json::to_value(data).unwrap(),
                    &[(one, payload.clone()), (two, payload.clone())],
                ),
            );
            assert!(inspect(&zip).is_err());
        }
        for field in ["schemaVersion", "credentials"] {
            let mut data = serde_json::to_value(&base).unwrap();
            data[field] = json!(2);
            let zip = put_zip(
                dir.path(),
                &format!("{field}.zip"),
                &virtual_zip(data, &[("safe.md", payload.clone())]),
            );
            assert!(inspect(&zip).is_err());
        }
        assert!(!dir.path().parent().unwrap().join("outside.md").exists());
        assert!(!fs::read_dir(dir.path()).unwrap().any(|e| e
            .unwrap()
            .file_type()
            .unwrap()
            .is_dir()));
    }
    #[test]
    fn undeclared_missing_tampered_and_wrong_sized_entries_never_form_a_valid_package() {
        let dir = tempfile::tempdir().unwrap();
        let payload = b"# Safe\n".to_vec();
        let base = manifest(vec![("safe.md", payload.clone())]);
        let extra = put_zip(
            dir.path(),
            "extra.zip",
            &virtual_zip(
                serde_json::to_value(&base).unwrap(),
                &[
                    ("safe.md", payload.clone()),
                    ("extra.txt", b"not declared".to_vec()),
                ],
            ),
        );
        assert!(inspect(&extra).is_err());
        let missing = put_zip(
            dir.path(),
            "missing.zip",
            &virtual_zip(serde_json::to_value(&base).unwrap(), &[]),
        );
        assert!(inspect(&missing).is_err());
        for field in ["size", "sha256"] {
            let mut data = serde_json::to_value(&base).unwrap();
            data["files"][0][field] = if field == "size" {
                json!(1)
            } else {
                json!("0".repeat(64))
            };
            let zip = put_zip(
                dir.path(),
                &format!("{field}.zip"),
                &virtual_zip(data, &[("safe.md", payload.clone())]),
            );
            assert!(inspect(&zip).is_err());
        }
        let mut corrupt = virtual_zip(
            serde_json::to_value(&base).unwrap(),
            &[("safe.md", payload.clone())],
        );
        let position = corrupt
            .windows(payload.len())
            .position(|b| b == payload)
            .unwrap();
        corrupt[position] ^= 1;
        let zip = put_zip(dir.path(), "crc.zip", &corrupt);
        assert!(inspect(&zip).is_err());
        assert_eq!(fs::read(zip).unwrap(), corrupt);
    }
    #[test]
    fn central_directory_budgets_and_ambiguous_footer_are_rejected_before_zip_allocation() {
        let dir = tempfile::tempdir().unwrap();
        let original = virtual_zip(serde_json::to_value(manifest(vec![])).unwrap(), &[]);
        for index in 0..4 {
            let mut bytes = original.clone();
            let end = bytes.len() - 22;
            match index {
                0 => {
                    let n = ((MAX_ENTRIES + 1) as u16).to_le_bytes();
                    bytes[end + 8..end + 10].copy_from_slice(&n);
                    bytes[end + 10..end + 12].copy_from_slice(&n);
                }
                1 => {
                    bytes[end + 8..end + 12].fill(255);
                }
                2 => {
                    bytes[end + 12..end + 16].copy_from_slice(&(17u32 * 1024 * 1024).to_le_bytes());
                }
                _ => {
                    bytes[end + 20..end + 22].copy_from_slice(&1u16.to_le_bytes());
                    bytes.push(0);
                }
            }
            let path = put_zip(dir.path(), &format!("footer-{index}.zip"), &bytes);
            assert!(inspect(&path).is_err());
        }
        let large = dir.path().join("oversize.zip");
        fs::File::create(&large)
            .unwrap()
            .set_len(MAX_ARCHIVE + 1)
            .unwrap();
        assert!(inspect(&large).is_err());
        assert_eq!(fs::metadata(large).unwrap().len(), MAX_ARCHIVE + 1);
    }
    #[test]
    fn note_schema_and_markdown_utf8_are_verified_without_normalizing_original_bytes() {
        let dir = tempfile::tempdir().unwrap();
        for (index, (path, bytes)) in [
            (
                "future.knote",
                br#"{"schemaVersion":2,"pages":[]}"#.to_vec(),
            ),
            ("broken.md", vec![255, 254]),
        ]
        .into_iter()
        .enumerate()
        {
            let data = manifest(vec![(path, bytes.clone())]);
            let zip = put_zip(
                dir.path(),
                &format!("payload-{index}.zip"),
                &virtual_zip(serde_json::to_value(data).unwrap(), &[(path, bytes)]),
            );
            assert!(inspect(&zip).is_err());
        }
    }
    #[test]
    fn changed_snapshot_and_occupied_output_keep_both_originals_and_no_partial_success() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("source");
        fs::create_dir(&root).unwrap();
        let original = b"# Base\n".to_vec();
        let data = manifest(vec![("safe.md", original.clone())]);
        fs::write(root.join("safe.md"), &original).unwrap();
        let occupied = dir.path().join("occupied.zip");
        fs::write(&occupied, b"Keep original").unwrap();
        assert!(write(&root, &data, &occupied).is_err());
        assert_eq!(fs::read(&occupied).unwrap(), b"Keep original");
        let changed = b"# Next\n";
        fs::write(root.join("safe.md"), changed).unwrap();
        let target = dir.path().join("new.zip");
        assert!(write(&root, &data, &target).is_err());
        assert!(!target.exists());
        assert_eq!(fs::read(root.join("safe.md")).unwrap(), changed);
    }
    #[test]
    fn symlink_entries_are_never_extracted_even_with_a_matching_manifest_hash() {
        let dir = tempfile::tempdir().unwrap();
        let data = b"../outside".to_vec();
        let manifest = manifest(vec![("link.md", data)]);
        let output = dir.path().join("link.zip");
        let mut zip = ZipWriter::new(fs::File::create(&output).unwrap());
        let options = SimpleFileOptions::default().compression_method(CompressionMethod::Stored);
        zip.start_file(MANIFEST, options).unwrap();
        zip.write_all(&serde_json::to_vec(&manifest).unwrap())
            .unwrap();
        zip.add_symlink("link.md", "../outside", options).unwrap();
        zip.finish().unwrap();
        assert!(extract(&output, dir.path()).is_err());
    }
}
