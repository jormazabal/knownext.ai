//! Explicit private archive. Imported files are ordinary data, never runtime authority.
use super::*;
use std::{
    fs,
    io::{Read, Write},
};
mod drafts;
mod existing;
mod history;
mod preferences;
mod recordings;
mod workspace;
mod editing;

const DIRECTORY: &str = "Archivo KnowNext";
const PART: usize = 16 * 1024 * 1024;
fn is_zero(value: &usize) -> bool {
    *value == 0
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Summary {
    #[serde(default, skip_serializing_if = "is_zero")]
    retained_files: usize,
    directory: String,
    data_only: bool,
    drafts: usize,
    recording_sessions: usize,
    history: bool,
    preferences: bool,
}

pub(super) fn validate(manifest: &Manifest) -> Result<(), String> {
    match (&manifest.supplement, manifest.schema_version) {
        (None, 1) => Ok(()),
        (Some(summary), 2 | 3)
            if (manifest.schema_version == 2 && summary.retained_files == 0
                || manifest.schema_version == 3
                    && summary.retained_files > 0
                    && summary.retained_files <= MAX_ENTRIES
                    && summary.retained_files <= manifest.files.len())
                && summary.directory == DIRECTORY
                && summary.data_only
                && summary.preferences
                && summary.drafts <= 2000
                && summary.recording_sessions <= 2000
                && manifest.directories.iter().any(|p| p == DIRECTORY)
                && ["LEEME.md", "Inventario.json", "Preferencias.json"]
                    .iter()
                    .all(|name| {
                        manifest
                            .files
                            .iter()
                            .any(|file| file.path == format!("{DIRECTORY}/{name}"))
                    }) =>
        {
            Ok(())
        }
        _ => Err(
            "El archivo privado requiere formato2/3, inventario y alcance de datos sin ejecución"
                .into(),
        ),
    }
}

pub(super) fn valid_kind(manifest: &Manifest, file: &PackageFile) -> bool {
    if template_catalogue::is_carrier(manifest) { return template_catalogue::valid_carrier_kind(manifest,file); }
    let private = file.path.starts_with(&format!("{DIRECTORY}/"));
    if file.kind == FileKind::Archive {
        return matches!(manifest.schema_version, 2 | 3)
            && manifest.supplement.is_some()
            && private
            && matches!(file.path.rsplit('.').next(), Some("json" | "bin" | "wav"));
    }
    paths::kind(&file.path) == Some(file.kind)
}

struct Source {
    base: PathBuf,
    relative: String,
    size: u64,
    sha256: String,
}
struct Builder<'a> {
    snapshot: &'a mut snapshot::Snapshot,
    check: &'a dyn Fn() -> Result<(), String>,
    sources: Vec<Source>,
    inventories: Vec<(PathBuf, Vec<String>)>,
    items: Vec<Value>,
    bytes: u64,
    prefix: String,
    scanned_entries: usize,
}

fn entries(path: &Path) -> Result<Vec<String>, String> {
    match fs::symlink_metadata(path) {
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(vec![]),
        Err(_) => return Err("No se puede inventariar una fuente del archivo privado".into()),
        Ok(_) => jobs::regular_directory(path)?,
    }
    let mut names = vec![];
    for (index, entry) in fs::read_dir(path)
        .map_err(|_| "No se puede completar el inventario privado")?
        .enumerate()
    {
        if index >= 2000 {
            return Err("El inventario privado supera2000 entradas".into());
        }
        let entry = entry.map_err(|_| "Una entrada privada dejó de estar disponible")?;
        let name = entry
            .file_name()
            .into_string()
            .map_err(|_| "Un nombre privado no es UTF-8")?;
        // Coordination files are not opened, hashed or copied.
        if matches!(
            name.as_str(),
            "owner.lock" | "runtime-owner.lock" | "capture.lock"
        ) {
            continue;
        }
        names.push(name);
        if names.len() > 2000 {
            return Err(
                "El inventario privado supera2000 entradas; no se prepara una copia parcial".into(),
            );
        }
    }
    names.sort();
    Ok(names)
}

fn source_hash(
    base: &Path,
    relative: &str,
    check: &dyn Fn() -> Result<(), String>,
) -> Result<(u64, String), String> {
    let path = path_policy::resolve(base, relative)?;
    let meta = fs::symlink_metadata(&path).map_err(|_| "Una fuente privada no está disponible")?;
    if !meta.is_file() || batch::linked(&meta) || meta.len() > MAX_CONTENT {
        return Err("Una fuente privada no es regular o supera 1 GiB".into());
    }
    let mut source = fs::File::open(path)
        .map_err(|_| "No se puede leer una fuente privada")?
        .take(MAX_CONTENT + 1);
    let mut sha = Sha256::new();
    let mut size = 0;
    let mut buffer = [0; 65536];
    loop {
        check()?;
        let count = source
            .read(&mut buffer)
            .map_err(|_| "Lectura privada incompleta")?;
        if count == 0 {
            break;
        }
        size += count as u64;
        if size > MAX_CONTENT {
            return Err("La fuente creció fuera del límite".into());
        }
        sha.update(&buffer[..count]);
    }
    if size != meta.len() {
        return Err("La fuente privada cambió de tamaño".into());
    }
    Ok((size, format!("{:x}", sha.finalize())))
}

impl Builder<'_> {
    fn relative(&self, path: &str) -> String {
        if self.prefix.is_empty() {
            path.into()
        } else {
            format!("{}/{path}", self.prefix)
        }
    }
    fn empty_directory(&mut self, relative: &str) -> Result<(), String> {
        let relative = self.relative(relative);
        let path = if relative.is_empty() {
            DIRECTORY.into()
        } else {
            format!("{DIRECTORY}/{relative}")
        };
        paths::validate(&path)?;
        if !self.snapshot.manifest.directories.contains(&path) {
            self.snapshot.manifest.directories.push(path.clone());
        }
        if self.snapshot.manifest.directories.len() + self.snapshot.manifest.files.len() + 1
            > MAX_ENTRIES
        {
            return Err("Demasiadas entradas en el archivo privado".into());
        }
        fs::create_dir_all(self.snapshot.directory.path().join(path))
            .map_err(|_| "No se pudo conservar una carpeta privada vacía".into())
    }

    fn scan(&mut self, path: &Path) -> Result<Vec<String>, String> {
        (self.check)()?;
        let names = entries(path)?;
        self.scanned_entries = self.scanned_entries.saturating_add(names.len() + 1);
        if self.scanned_entries > MAX_ENTRIES {
            return Err("El inventario privado supera10000 entradas".into());
        }
        self.inventories.push((path.to_path_buf(), names.clone()));
        Ok(names)
    }
    fn read(&mut self, base: &Path, relative: &str, limit: u64) -> Result<Vec<u8>, String> {
        let (size, sha256) = source_hash(base, relative, self.check)?;
        if size > limit {
            return Err(
                "Los metadatos privados superan su límite; no se prepara una copia parcial".into(),
            );
        }
        if !self
            .sources
            .iter()
            .any(|source| source.base == base && source.relative == relative)
            && self
                .sources
                .iter()
                .map(|source| source.size)
                .sum::<u64>()
                .saturating_add(size)
                > MAX_CONTENT
        {
            return Err("La revisión de metadatos privados supera 1 GiB".into());
        }
        let mut raw = vec![];
        fs::File::open(path_policy::resolve(base, relative)?)
            .map_err(|_| "No se puede leer la fuente revisada")?
            .take(limit + 1)
            .read_to_end(&mut raw)
            .map_err(|_| "Lectura privada incompleta")?;
        if raw.len() as u64 != size || sha256_hex(&raw) != sha256 {
            return Err("La fuente cambió durante la copia".into());
        }
        if let Some(previous) = self
            .sources
            .iter()
            .find(|source| source.base == base && source.relative == relative)
        {
            if previous.size != size || previous.sha256 != sha256 {
                return Err("Una fuente cambió durante la revisión".into());
            }
        } else {
            self.sources.push(Source {
                base: base.into(),
                relative: relative.into(),
                size,
                sha256,
            });
        }
        Ok(raw)
    }
    fn put(&mut self, relative: &str, bytes: &[u8]) -> Result<(), String> {
        (self.check)()?;
        let relative = self.relative(relative);
        let path = format!("{DIRECTORY}/{relative}");
        paths::validate(&path)?;
        if bytes.len() as u64 > MAX_FILE
            || self.bytes.saturating_add(bytes.len() as u64) > MAX_CONTENT
        {
            return Err(
                "El archivo completo supera 1 GiB; no se entrega un conjunto parcial".into(),
            );
        }
        let destination = self.snapshot.directory.path().join(&path);
        let mut parent = path.rsplit_once('/').map(|p| p.0);
        while let Some(dir) = parent {
            if !self.snapshot.manifest.directories.iter().any(|p| p == dir) {
                self.snapshot.manifest.directories.push(dir.into());
            }
            parent = dir.rsplit_once('/').map(|p| p.0);
        }
        if self.snapshot.manifest.files.len() + self.snapshot.manifest.directories.len() + 1
            > MAX_ENTRIES
        {
            return Err("El archivo completo supera10000 entradas".into());
        }
        fs::create_dir_all(destination.parent().ok_or("Falta la carpeta privada")?)
            .map_err(|_| "No se puede preparar la carpeta del archivo")?;
        let mut file = fs::OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(destination)
            .map_err(|_| "Una ruta del archivo privado ya existe")?;
        file.write_all(bytes)
            .and_then(|_| file.sync_all())
            .map_err(|_| "No se pudo confirmar la copia privada")?;
        self.bytes += bytes.len() as u64;
        self.snapshot.manifest.files.push(PackageFile {
            path: path.clone(),
            size: bytes.len() as u64,
            sha256: sha256_hex(bytes),
            kind: paths::kind(&path).unwrap_or(FileKind::Archive),
        });
        Ok(())
    }
    fn json(&mut self, relative: &str, value: &Value) -> Result<(), String> {
        self.put(
            relative,
            &serde_json::to_vec_pretty(value)
                .map_err(|_| "No se puede representar el inventario privado")?,
        )
    }
    /// Fixed-size parts preserve bytes; WAV parts add only a standard44-byte PCM header.
    fn parts(
        &mut self,
        base: &Path,
        relative: &str,
        prefix: &str,
        wav: bool,
    ) -> Result<Value, String> {
        let (size, sha256) = source_hash(base, relative, self.check)?;
        if wav && size % 2 != 0 {
            return Err("La pista PCM contiene una muestra incompleta; se conserva".into());
        }
        if self.bytes.saturating_add(size) > MAX_CONTENT {
            return Err("El audio o historial no cabe en el archivo de 1 GiB".into());
        }
        let mut input = fs::File::open(path_policy::resolve(base, relative)?)
            .map_err(|_| "No se puede copiar la fuente privada")?;
        let mut total = 0u64;
        let mut digest = Sha256::new();
        let mut parts = vec![];
        loop {
            (self.check)()?;
            let mut raw = vec![];
            (&mut input)
                .take(PART as u64)
                .read_to_end(&mut raw)
                .map_err(|_| "No se pudo completar una parte privada")?;
            if raw.is_empty() {
                break;
            }
            total += raw.len() as u64;
            if total > size {
                return Err("La fuente creció durante la copia".into());
            }
            digest.update(&raw);
            let name = format!(
                "{prefix}-{:04}.{}",
                parts.len() + 1,
                if wav { "wav" } else { "bin" }
            );
            let payload = if wav {
                let mut header = b"RIFF".to_vec();
                header.extend((raw.len() as u32 + 36).to_le_bytes());
                header.extend(b"WAVEfmt ");
                header.extend(16u32.to_le_bytes());
                header.extend(1u16.to_le_bytes());
                header.extend(1u16.to_le_bytes());
                header.extend(24000u32.to_le_bytes());
                header.extend(48000u32.to_le_bytes());
                header.extend(2u16.to_le_bytes());
                header.extend(16u16.to_le_bytes());
                header.extend(b"data");
                header.extend((raw.len() as u32).to_le_bytes());
                header.extend(&raw);
                header
            } else {
                raw
            };
            self.put(&name, &payload)?;
            parts.push(json!({"path":self.relative(&name),"payloadBytes":payload.len() - if wav {44} else {0},"skipBytes":if wav {44} else {0}}));
        }
        if total != size || format!("{:x}", digest.finalize()) != sha256 {
            return Err("La fuente cambió al dividirla; no se entrega".into());
        }
        self.sources.push(Source {
            base: base.into(),
            relative: relative.into(),
            size,
            sha256: sha256.clone(),
        });
        Ok(json!({"bytes":size,"sha256":sha256,"parts":parts}))
    }
    fn verify(&self) -> Result<(), String> {
        for source in &self.sources {
            if source_hash(&source.base, &source.relative, self.check)?
                != (source.size, source.sha256.clone())
            {
                return Err("Una fuente cambió durante la preparación. Vuelve a preparar el archivo completo".into());
            }
        }
        for (path, names) in &self.inventories {
            if &entries(path)? != names {
                return Err(
                    "El inventario privado cambió durante la preparación; vuelve a prepararlo"
                        .into(),
                );
            }
        }
        Ok(())
    }
}

pub(super) fn append(
    api: &LocalApi,
    project: &str,
    project_root: &Path,
    parent: &Path,
    snapshot: &mut snapshot::Snapshot,
    check: &dyn Fn() -> Result<(), String>,
) -> Result<(), String> {
    if snapshot
        .manifest
        .files
        .iter()
        .any(|p| paths::key(p.path.split('/').next().unwrap_or("")) == paths::key(DIRECTORY))
        || snapshot
            .manifest
            .directories
            .iter()
            .any(|p| paths::key(p.split('/').next().unwrap_or("")) == paths::key(DIRECTORY))
    {
        return Err("El proyecto ya contiene «Archivo KnowNext». Conserva esa carpeta y usa el paquete documental o renómbrala antes de crear otro archivo privado".into());
    }
    let bytes = snapshot.manifest.files.iter().map(|p| p.size).sum();
    let mut builder = Builder {
        snapshot,
        check,
        sources: vec![],
        inventories: vec![],
        items: vec![],
        bytes,
        prefix: String::new(),
        scanned_entries: 0,
    };
    let previous = existing::append(project_root, &mut builder)?;
    if previous.files > 0 {
        builder.prefix = knownext_core::compact_id("Actual");
    }
    let drafts = drafts::append(api, project, &mut builder)?;
    let recordings = recordings::append(api, project, &mut builder)?;
    let history = history::append(project_root, parent, &mut builder)?;
    let workspace = workspace::append(api,project,&mut builder)?;
    editing::append(api,project,&mut builder)?;
    builder.prefix.clear();
    preferences::append(api, &mut builder)?;
    builder.put("LEEME.md", "# Archivo privado de KnowNext\n\nCopias de datos, sin ejecución automática. Los documentos, borradores, audio e historial pueden contener información personal y secretos escritos por sus autores. No compartas este archivo como una plantilla.\n\nEn traslados sucesivos, los archivos anteriores mantienen sus rutas; sus cabeceras originales quedan en Anteriores. Inventario.json incluye metadataSnapshots para reconstruir esos metadatos. Las copias actuales nuevas usan una carpeta Actual distinta. Los borradores tienen su copia original y una versión editable. Las pistas WAV están ordenadas; cada parte se reproduce por separado. Inventario.json conserva SHA256 y el orden para reconstruir sus bytes PCM (omitir44 bytes por parte). Las partes del historial concatenadas, sin omitir bytes, reconstruyen el bundle Git. Trabajo.json contiene colecciones, hitos, favoritos y estilos/perfiles. Datos IA conserva conversación, contexto, investigaciones y resultados como copias, sin sesiones activas. No se incluye configuración Git, hooks ni el almacén de credenciales.\n\nImportar conserva estos datos en esta carpeta visible, sin activar historial, transcripciones, envíos, borradores ni preferencias globales. Los cambios aún no persistidos en el editor y las sesiones sin proyecto asignado quedan fuera. No incluye papelera, cachés, recibos de operaciones ni copias privadas de conflictos.\n".as_bytes())?;
    let items = builder.items.clone();
    let mut index = json!({"format":"knownext.project-archive","schemaVersion":if previous.files>0{2}else{1},"dataOnly":true,"items":items});
    if !previous.metadata.is_empty() {
        index["metadataSnapshots"] = json!(previous.metadata);
    }
    builder.json("Inventario.json", &index)?;
    builder.verify()?;
    workspace::verify(api,project,&workspace)?;
    builder.snapshot.manifest.schema_version = if previous.files > 0 { 3 } else { 2 };
    builder.snapshot.manifest.supplement = Some(Summary {
        retained_files: previous.files,
        directory: DIRECTORY.into(),
        data_only: true,
        drafts: drafts + previous.drafts,
        recording_sessions: recordings + previous.recordings,
        history: history || previous.history,
        preferences: true,
    });
    builder
        .snapshot
        .manifest
        .files
        .sort_by(|a, b| a.path.cmp(&b.path));
    builder.snapshot.manifest.directories.sort();
    snapshot::adapt_references(
        builder.snapshot.directory.path(),
        &mut builder.snapshot.manifest,
        check,
    )?;
    builder.snapshot.manifest.validate()
}
