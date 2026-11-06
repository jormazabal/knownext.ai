//! Verifiable project packages. Portable data never carries runtime configuration or authority.
use super::*;
mod archive;
mod backup_snapshot;
pub(crate) use backup_snapshot::{create_scheduled_backup_archive,verify_scheduled_backup_archive,publish_scheduled_backup_archive,create_scheduled_backup_import,scheduled_backup_import_status,backup_snapshot_coordinate};
mod archive_index;
mod draft_adoption;
mod recording_adoption;
mod history_adoption;
mod catalog;
mod template_catalogue;
mod jobs;
mod paths;
mod recovery_package;
mod snapshot;
mod supplement;
mod worker;
pub(crate) use recovery_package::recovery_package;
pub use worker::{dispatch_project_transfer, is_project_transfer_work};
pub use history_adoption::is_portable_history_work;

const FORMAT: &str = "knownext.project";
const MANIFEST: &str = "knownext-project.json";
const MAX_ARCHIVE: u64 = 512 * 1024 * 1024;
const MAX_CONTENT: u64 = 1024 * 1024 * 1024;
const MAX_FILE: u64 = 64 * 1024 * 1024;
const MAX_MANIFEST: u64 = 8 * 1024 * 1024;
const MAX_ENTRIES: usize = 10_000;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Manifest {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    supplement: Option<supplement::Summary>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    template_description: Option<String>,
    format: String,
    schema_version: u8,
    project_name: String,
    created_at: String,
    directories: Vec<String>,
    files: Vec<PackageFile>,
    exclusions: Vec<Exclusion>,
    adjustments: Vec<ReferenceAdjustment>,
    reference_warnings: Vec<ReferenceWarning>,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PackageFile {
    path: String,
    size: u64,
    sha256: String,
    kind: FileKind,
}
#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
enum FileKind {
    Markdown,
    Handwritten,
    Image,
    Attachment,
    Asset,
    Archive,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Exclusion {
    path: String,
    reason: String,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ReferenceAdjustment {
    path: String,
    targets_updated: usize,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ReferenceWarning {
    path: String,
    message: String,
}

impl Manifest {
    fn validate(&self) -> Result<(), String> {
        if self
            .template_description
            .as_ref()
            .is_some_and(|text| text.len() > 2000 || text.contains('\0'))
        {
            return Err("Descripción de plantilla no compatible".into());
        }
        if self.format != FORMAT || !matches!(self.schema_version, 1 | 2 | 3) {
            return Err(
                "Formato o versión de paquete no compatible. El original se conserva".into(),
            );
        }
        supplement::validate(self)?;
        if self.project_name.trim().is_empty()
            || self.project_name.len() > 240
            || self.project_name.chars().any(char::is_control)
        {
            return Err("Nombre de proyecto no válido en el paquete".into());
        }
        OffsetDateTime::parse(&self.created_at, &Rfc3339)
            .map_err(|_| "Fecha de paquete no válida")?;
        if 1 + self.directories.len() + self.files.len() > MAX_ENTRIES
            || self.exclusions.len() > MAX_ENTRIES
            || self.adjustments.len() > MAX_ENTRIES
            || self.reference_warnings.len() > MAX_ENTRIES
        {
            return Err("El paquete supera 10.000 entradas".into());
        }
        let mut all = std::collections::HashSet::new();
        let mut dirs = BTreeSet::new();
        let mut file_paths = BTreeSet::new();
        let mut total = 0u64;
        for path in &self.directories {
            paths::validate(path)?;
            if !all.insert(paths::key(path)) {
                return Err("Hay rutas duplicadas por caso o normalización en el paquete".into());
            }
            dirs.insert(path.as_str());
        }
        for file in &self.files {
            paths::validate(&file.path)?;
            if !all.insert(paths::key(&file.path)) {
                return Err("Hay rutas duplicadas por caso o normalización en el paquete".into());
            }
            if !supplement::valid_kind(self, file) {
                return Err("El tipo de una entrada no corresponde a un archivo compatible".into());
            }
            if file.size > MAX_FILE {
                return Err("Un archivo del paquete supera 64 MiB".into());
            }
            if file.sha256.len() != 64
                || !file
                    .sha256
                    .bytes()
                    .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
            {
                return Err("Huella SHA256 de archivo no válida".into());
            }
            total = total.saturating_add(file.size);
            file_paths.insert(file.path.as_str());
        }
        if total > MAX_CONTENT {
            return Err("El contenido del paquete supera 1 GiB".into());
        }
        // Explicit parents avoid file/directory conflicts and preserve empty folders.
        for path in self
            .directories
            .iter()
            .chain(self.files.iter().map(|f| &f.path))
        {
            let mut parent = path.rsplit_once('/').map(|p| p.0);
            while let Some(p) = parent {
                if !dirs.contains(p) {
                    return Err("Una carpeta contenedora no está declarada en el paquete".into());
                }
                parent = p.rsplit_once('/').map(|p| p.0);
            }
        }
        for exclusion in &self.exclusions {
            // Report-only text; it never becomes a destination path.
            if exclusion.path.is_empty()
                || exclusion.path.len() > 4096
                || exclusion.reason.len() > 1000
                || exclusion.path.chars().any(char::is_control)
                || exclusion.reason.chars().any(char::is_control)
            {
                return Err("Informe de exclusiones no válido".into());
            }
        }
        let mut adjusted = BTreeSet::new();
        for warning in &self.reference_warnings {
            if !file_paths.contains(warning.path.as_str())
                || warning.message.len() > 1000
                || warning.message.chars().any(char::is_control)
            {
                return Err("Informe de referencias no válido".into());
            }
        }
        for adjustment in &self.adjustments {
            if !file_paths.contains(adjustment.path.as_str())
                || !adjusted.insert(&adjustment.path)
                || adjustment.targets_updated > MAX_ENTRIES
            {
                return Err("Informe de adaptación de referencias no válido".into());
            }
        }
        Ok(())
    }
}

#[cfg(test)] mod portability_block_tests {use super::*;use std::{fs,sync::Mutex};
#[test]fn portability_block_larger_files_roundtrip_and_limits_are_explicit(){
let d=tempfile::tempdir().unwrap();let api=LocalApi::new(d.path().join("state"),"qa".into(),"test".into());let p=api.create_project(json!({"name":"Large","versioningMode":"none","syncMode":"none"})).unwrap();let id=p["id"].as_str().unwrap();let root=api.project_root(id).unwrap();let raw=vec![42;33*1024*1024];fs::write(root.join("large.pdf"),&raw).unwrap();
let job=api.handle("POST","/api/project-transfers",json!({"kind":"export","projectId":id,"includeArchive":true}),vec![]).unwrap().body;let jid=job["id"].as_str().unwrap();let ready=dispatch_project_transfer(&Mutex::new(api.clone()),&api,&Mutex::new(()),&format!("/api/project-transfers/{jid}/prepare"),Value::Null).unwrap().body;assert_eq!(ready["phase"],"ready","{ready}");let payload=api.app_data_dir.join("project-transfers").join(sha256_hex(jid.as_bytes())).join("payload.zip");let mut zip=zip::ZipArchive::new(fs::File::open(payload).unwrap()).unwrap();let mut recovered=vec![];std::io::Read::read_to_end(&mut zip.by_name("large.pdf").unwrap(),&mut recovered).unwrap();assert_eq!(recovered,raw);let mut work=String::new();std::io::Read::read_to_string(&mut zip.by_name("Archivo KnowNext/Trabajo.json").unwrap(),&mut work).unwrap();assert!(work.contains("knownext.portable-workspace"));assert_eq!(MAX_FILE,64*1024*1024);assert_eq!(MAX_CONTENT,1024*1024*1024);assert_eq!(MAX_ARCHIVE,512*1024*1024);
let mut manifest:Manifest=serde_json::from_value(ready["manifest"].clone()).unwrap();manifest.files.iter_mut().find(|x|x.path=="large.pdf").unwrap().size=MAX_FILE+1;assert!(manifest.validate().unwrap_err().contains("64 MiB"));assert_eq!(fs::metadata(root.join("large.pdf")).unwrap().len(),raw.len() as u64);
}}
