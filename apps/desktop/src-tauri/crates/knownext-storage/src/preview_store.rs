//! Private preview receipts: bounded, known schema and exact project ownership.
use super::request_scope::portable_id;
use super::*;
use std::{fs, io::Read};
mod cleanup;

const MAX_BYTES: u64 = 8 * 1024 * 1024;

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Preview {
    #[serde(skip_serializing_if = "Option::is_none")]
    schema_version: Option<u32>,
    id: String,
    project_id: String,
    path: String,
    name: String,
    format: String,
    status: String,
    readonly: bool,
    source_fingerprint: Fingerprint,
    available_renditions: Vec<String>,
    page_count: Option<u64>,
    sheets: Option<Vec<Sheet>>,
    warnings: Vec<String>,
    generated_at: String,
    error: Option<String>,
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Fingerprint {
    mtime_ns: Option<u64>,
    size: u64,
    sha256: Option<String>,
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Sheet {
    id: String,
    name: String,
    row_count: u64,
    column_count: u64,
    hidden: bool,
}

fn directory(path: &Path) -> Result<(), String> {
    let meta =
        fs::symlink_metadata(path).map_err(|_| "No se puede consultar el almacén de vistas")?;
    if !meta.is_dir() || batch::linked(&meta) {
        return Err(
            "El almacén de vistas debe ser una carpeta regular, sin enlaces; se conserva".into(),
        );
    }
    Ok(())
}
fn preview_id(id: &str) -> bool {
    id.starts_with("preview-") && portable_id(id)
}
fn relative(path: &str) -> bool {
    !path.is_empty()
        && !path.contains(['\\', ':', '\0'])
        && !Path::new(path).is_absolute()
        && !path
            .split('/')
            .any(|part| part.is_empty() || matches!(part, "." | ".."))
}
fn source_format(path: &Path) -> Result<String, String> {
    let meta =
        fs::symlink_metadata(path).map_err(|_| "No se puede consultar el documento original")?;
    if !meta.is_file() || batch::linked(&meta) {
        return Err("La fuente de la vista debe ser un archivo regular, sin enlaces".into());
    }
    let extension = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    if !matches!(extension.as_str(), "pdf" | "docx" | "xlsx") {
        return Err("Este formato no admite una vista de referencia".into());
    }
    Ok(extension)
}

impl LocalApi {
    fn validate_preview(&self, owner: &str, id: &str, value: &Preview) -> Result<(), String> {
        if value.schema_version.is_some_and(|v| v != 1)
            || value.id != id
            || value.project_id != owner
            || !relative(&value.path)
            || value.name.is_empty()
            || value.name.contains('\0')
            || value.status != "ready"
            || !value.readonly
            || value.error.is_some()
            || value.warnings.len() > 10_000
            || value.sheets.as_ref().is_some_and(|s| s.len() > 10_000)
            || value
                .source_fingerprint
                .sha256
                .as_ref()
                .is_some_and(|s| s.len() != 64 || !s.bytes().all(|b| b.is_ascii_hexdigit()))
        {
            return Err(
                "Metadatos de vista no compatibles o de otro proyecto; se conservan".into(),
            );
        }
        OffsetDateTime::parse(&value.generated_at, &Rfc3339)
            .map_err(|_| "Fecha de vista no compatible; se conserva")?;
        let path = self.resolve_project_relative(owner, &value.path)?;
        if source_format(&path)? != value.format {
            return Err(
                "El formato de la vista no corresponde al documento original; se conserva".into(),
            );
        }
        let renditions: &[&str] = if value.format == "xlsx" {
            &["text", "workbook"]
        } else {
            &["pdf", "text"]
        };
        if value.available_renditions.len() != renditions.len()
            || value
                .available_renditions
                .iter()
                .any(|r| !renditions.contains(&r.as_str()))
            || renditions
                .iter()
                .any(|r| !value.available_renditions.iter().any(|v| v == r))
            || (value.format == "xlsx") != value.sheets.is_some()
        {
            return Err("Representaciones de vista no compatibles; se conservan".into());
        }
        Ok(())
    }

    pub(super) fn create_preview(&self, project_id: &str, body: Value) -> Result<Value, String> {
        let relative = body
            .get("path")
            .and_then(Value::as_str)
            .filter(|p| relative(p))
            .ok_or("Ruta de vista no válida")?;
        let source = self.resolve_project_relative(project_id, relative)?;
        source_format(&source)?;
        directory(&self.app_data_dir)?;
        let folder = self.previews_dir();
        match fs::symlink_metadata(&folder) {
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                fs::create_dir(&folder).map_err(|_| "No se puede crear el almacén de vistas")?
            }
            Err(_) => return Err("No se puede consultar el almacén de vistas".into()),
            Ok(_) => (),
        }
        directory(&folder)?;
        let id = knownext_core::compact_id("preview");
        let mut value = preview_value(project_id, &id, relative, &source);
        value["schemaVersion"] = json!(1);
        let descriptor: Preview = serde_json::from_value(value.clone())
            .map_err(|_| "No se puede preparar una vista compatible")?;
        self.validate_preview(project_id, &id, &descriptor)?;
        let bytes =
            serde_json::to_vec(&value).map_err(|_| "No se puede preparar el recibo de vista")?;
        if bytes.len() as u64 > MAX_BYTES {
            return Err("El recibo de vista supera 8 MiB".into());
        }
        atomic_io::create(&folder.join(format!("{id}.json")), &bytes)
            .map_err(|_| "No se pudo guardar la vista; el original se conserva")?;
        Ok(value)
    }

    pub(super) fn get_preview(&self, project_id: &str, id: &str) -> Result<Value, String> {
        self.project_root(project_id)?;
        if !preview_id(id) {
            return Err("Identificador de vista no válido".into());
        }
        directory(&self.app_data_dir)?;
        directory(&self.previews_dir())?;
        let path = self.previews_dir().join(format!("{id}.json"));
        let meta = fs::symlink_metadata(&path).map_err(|_| "Vista no encontrada")?;
        if !meta.is_file() || batch::linked(&meta) || meta.len() > MAX_BYTES {
            return Err("Vista no regular o fuera de límites; se conserva".into());
        }
        let mut bytes = Vec::new();
        fs::File::open(&path)
            .map_err(|_| "No se puede abrir la vista")?
            .take(MAX_BYTES + 1)
            .read_to_end(&mut bytes)
            .map_err(|_| "No se puede leer la vista")?;
        if bytes.len() as u64 > MAX_BYTES {
            return Err("La vista supera 8 MiB; se conserva".into());
        }
        // Deserialize directly from bytes so duplicate and unknown fields fail.
        let descriptor: Preview = serde_json::from_slice(&bytes)
            .map_err(|_| "Formato de vista no compatible; se conserva")?;
        let versioned: Value = serde_json::from_slice(&bytes)
            .map_err(|_| "Formato de vista no compatible; se conserva")?;
        if versioned
            .get("schemaVersion")
            .is_some_and(|v| v.as_u64() != Some(1))
        {
            return Err("Versión de vista no compatible; se conserva".into());
        }
        self.validate_preview(project_id, id, &descriptor)?;
        // Return the known receipt, not arbitrary persisted JSON extensions.
        serde_json::to_value(descriptor).map_err(|_| "No se pudo leer el recibo de vista".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn fixture() -> (tempfile::TempDir, LocalApi, String, Value, PathBuf) {
        let root = tempfile::tempdir().unwrap();
        let api = LocalApi::new(root.path().into(), "qa".into(), "test".into());
        let project = api
            .create_project(json!({"name":"Owned QA","versioningMode":"none","syncMode":"none"}))
            .unwrap();
        let id = project["id"].as_str().unwrap().to_string();
        fs::write(
            api.project_root(&id).unwrap().join("source.pdf"),
            b"%PDF-1.4 owned source",
        )
        .unwrap();
        let preview = api
            .create_preview(&id, json!({"path":"source.pdf"}))
            .unwrap();
        let receipt = api
            .previews_dir()
            .join(format!("{}.json", preview["id"].as_str().unwrap()));
        (root, api, id, preview, receipt)
    }

    #[test]
    fn receipt_cleanup_preserves_sources_and_other_stores_and_regenerates_metadata() {
        let (root, api, id, preview, receipt) = fixture();
        let source = api.project_root(&id).unwrap().join("source.pdf");
        let bytes = fs::read(&source).unwrap();
        for directory in ["drafts", "recordings", "ai-index", "project-transfers"] {
            fs::create_dir_all(root.path().join(directory)).unwrap();
            fs::write(
                root.path().join(directory).join("owned-canary"),
                b"preserve",
            )
            .unwrap();
        }
        let future_path = api.previews_dir().join("preview-future.json");
        let mut future = preview.clone();
        future["id"] = json!("preview-future");
        future["schemaVersion"] = json!(2);
        let future_bytes = serde_json::to_vec(&future).unwrap();
        fs::write(&future_path, &future_bytes).unwrap();
        let inventory = api.preview_cleanup_inventory().unwrap();
        assert_eq!(inventory["entries"].as_array().unwrap().len(), 1);
        assert_eq!(inventory["skipped"], 1);
        let entry = &inventory["entries"][0];
        let before = fs::metadata(&receipt).unwrap().len();
        let result = api
            .cleanup_preview_receipts(
                json!({"entries":[{"id":entry["id"],"revision":entry["revision"]}]}),
            )
            .unwrap();
        assert_eq!(result["outcomes"][0]["status"], "deleted");
        assert_eq!(result["deletedBytes"], before);
        assert!(!receipt.exists());
        assert_eq!(fs::read(&source).unwrap(), bytes);
        assert_eq!(fs::read(future_path).unwrap(), future_bytes);
        for directory in ["drafts", "recordings", "ai-index", "project-transfers"] {
            assert_eq!(
                fs::read(root.path().join(directory).join("owned-canary")).unwrap(),
                b"preserve"
            );
        }
        let regenerated = api
            .create_preview(&id, json!({"path":"source.pdf"}))
            .unwrap();
        assert_ne!(regenerated["id"], preview["id"]);
        assert_eq!(
            regenerated["sourceFingerprint"],
            preview["sourceFingerprint"]
        );
        assert!(api
            .get_preview(&id, regenerated["id"].as_str().unwrap())
            .is_ok());
        assert_eq!(fs::read(source).unwrap(), bytes);
    }

    #[test]
    fn receipt_cleanup_revalidates_changed_or_missing_sources_and_reports_partial_effects() {
        let (_root, api, id, preview, receipt) = fixture();
        let second = api
            .create_preview(&id, json!({"path":"source.pdf"}))
            .unwrap();
        let entries = api.preview_cleanup_inventory().unwrap()["entries"]
            .as_array()
            .unwrap()
            .clone();
        let selected: Vec<Value> = entries
            .iter()
            .map(|e| json!({"id":e["id"],"revision":e["revision"]}))
            .collect();
        let mut changed = preview.clone();
        changed["warnings"] = json!(["Changed after review"]);
        let changed_bytes = serde_json::to_vec(&changed).unwrap();
        fs::write(&receipt, &changed_bytes).unwrap();
        assert!(api
            .cleanup_preview_receipts(json!({"entries":[selected[0],selected[0]]}))
            .is_err());
        let result = api
            .cleanup_preview_receipts(json!({"entries":selected}))
            .unwrap();
        assert!(result["outcomes"]
            .as_array()
            .unwrap()
            .iter()
            .any(|o| o["id"] == preview["id"] && o["status"] == "changed"));
        assert!(result["outcomes"]
            .as_array()
            .unwrap()
            .iter()
            .any(|o| o["id"] == second["id"] && o["status"] == "deleted"));
        assert_eq!(fs::read(&receipt).unwrap(), changed_bytes);
        let current = api.preview_cleanup_inventory().unwrap()["entries"][0].clone();
        fs::remove_file(api.project_root(&id).unwrap().join("source.pdf")).unwrap();
        let unavailable = api
            .cleanup_preview_receipts(
                json!({"entries":[{"id":current["id"],"revision":current["revision"]}]}),
            )
            .unwrap();
        assert_eq!(unavailable["outcomes"][0]["status"], "unavailable");
        assert!(receipt.exists());
        assert!(api.preview_cleanup_inventory().unwrap()["entries"]
            .as_array()
            .unwrap()
            .is_empty());
    }

    #[test]
    fn receipt_cleanup_query_does_not_create_store_and_budget_preserves_large_unknown_files() {
        let root = tempfile::tempdir().unwrap();
        let api = LocalApi::new(root.path().into(), "qa".into(), "test".into());
        assert!(api.preview_cleanup_inventory().unwrap()["entries"]
            .as_array()
            .unwrap()
            .is_empty());
        assert!(!api.previews_dir().exists());
        fs::create_dir(api.previews_dir()).unwrap();
        let path = api.previews_dir().join("preview-large.json");
        fs::File::create(&path)
            .unwrap()
            .set_len(17 * 1024 * 1024)
            .unwrap();
        let inventory = api.preview_cleanup_inventory().unwrap();
        assert_eq!(inventory["limited"], true);
        assert_eq!(inventory["skipped"], 1);
        assert_eq!(fs::metadata(path).unwrap().len(), 17 * 1024 * 1024);
    }

    #[test]
    fn preview_owner_legacy_and_content_routes_share_the_boundary() {
        let (_root, api, id, preview, receipt) = fixture();
        let pid = preview["id"].as_str().unwrap();
        let other = api
            .create_project(json!({"name":"Other","versioningMode":"none"}))
            .unwrap();
        let other = other["id"].as_str().unwrap();
        fs::write(
            api.project_root(other).unwrap().join("source.pdf"),
            b"other source",
        )
        .unwrap();
        let before = fs::read(&receipt).unwrap();
        for tail in ["", "/text", "/sheets"] {
            assert!(api
                .handle(
                    "GET",
                    &format!("/api/projects/{other}/previews/{pid}{tail}"),
                    Value::Null,
                    vec![]
                )
                .is_err());
        }
        assert!(api.get_preview(&id, pid).is_ok());
        assert_eq!(fs::read(&receipt).unwrap(), before);
        let mut legacy = preview;
        legacy.as_object_mut().unwrap().remove("schemaVersion");
        let bytes = serde_json::to_vec(&legacy).unwrap();
        fs::write(&receipt, &bytes).unwrap();
        assert!(api.get_preview(&id, legacy["id"].as_str().unwrap()).is_ok());
        assert_eq!(fs::read(&receipt).unwrap(), bytes);
    }

    #[test]
    fn unknown_future_corrupt_duplicate_and_escaped_receipts_are_preserved() {
        let (_root, api, id, preview, receipt) = fixture();
        let pid = preview["id"].as_str().unwrap();
        for change in [
            json!({"schemaVersion":99}),
            json!({"schemaVersion":null}),
            json!({"private":"never expose"}),
            json!({"path":"../outside.pdf"}),
            json!({"id":"preview-other"}),
            json!({"sourceFingerprint":{"size":1,"private":"never expose"}}),
        ] {
            let mut value = preview.clone();
            for (key, value2) in change.as_object().unwrap() {
                value[key] = value2.clone();
            }
            let bytes = serde_json::to_vec(&value).unwrap();
            fs::write(&receipt, &bytes).unwrap();
            assert!(api.get_preview(&id, pid).is_err());
            assert_eq!(fs::read(&receipt).unwrap(), bytes);
        }
        for bytes in [
            b"{broken".to_vec(),
            format!(
                "{{\"id\":\"{pid}\",{}",
                serde_json::to_string(&preview)
                    .unwrap()
                    .trim_start_matches('{')
            )
            .into_bytes(),
        ] {
            fs::write(&receipt, &bytes).unwrap();
            assert!(api.get_preview(&id, pid).is_err());
            assert_eq!(fs::read(&receipt).unwrap(), bytes);
        }
    }

    #[test]
    fn bounded_receipts_and_regular_supported_sources_are_required() {
        let (_root, api, id, preview, receipt) = fixture();
        fs::OpenOptions::new()
            .write(true)
            .open(&receipt)
            .unwrap()
            .set_len(MAX_BYTES + 1)
            .unwrap();
        assert!(api
            .get_preview(&id, preview["id"].as_str().unwrap())
            .is_err());
        assert_eq!(fs::metadata(&receipt).unwrap().len(), MAX_BYTES + 1);
        let root = api.project_root(&id).unwrap();
        fs::write(root.join("note.md"), b"owned source").unwrap();
        fs::create_dir(root.join("folder.pdf")).unwrap();
        for path in ["note.md", "folder.pdf", "missing.pdf", "../outside.pdf"] {
            assert!(api.create_preview(&id, json!({"path":path})).is_err());
        }
        assert_eq!(fs::read(root.join("note.md")).unwrap(), b"owned source");
    }

    #[test]
    fn pdf_content_is_the_original_and_missing_sources_are_never_replaced_by_a_placeholder() {
        let (_root, api, id, preview, _receipt) = fixture();
        let path = format!(
            "/api/projects/{id}/previews/{}/pdf",
            preview["id"].as_str().unwrap()
        );
        let response = api.content(&path, Value::Null).unwrap();
        assert_eq!(response.status, 200);
        assert_eq!(
            base64::engine::general_purpose::STANDARD
                .decode(response.data_base64)
                .unwrap(),
            b"%PDF-1.4 owned source"
        );
        fs::remove_file(api.project_root(&id).unwrap().join("source.pdf")).unwrap();
        assert!(api.content(&path, Value::Null).is_err());
    }

    #[cfg(windows)]
    #[test]
    fn linked_preview_directory_is_rejected_without_reading_its_target() {
        let (root, api, id, preview, receipt) = fixture();
        fs::remove_file(receipt).unwrap();
        fs::remove_dir(api.previews_dir()).unwrap();
        let target = root.path().join("owned-target");
        fs::create_dir(&target).unwrap();
        let sentinel = target.join("sentinel");
        fs::write(&sentinel, b"preserve").unwrap();
        let status = std::process::Command::new("cmd")
            .args(["/C", "mklink", "/J"])
            .arg(api.previews_dir())
            .arg(&target)
            .output()
            .unwrap();
        assert!(status.status.success());
        assert!(api
            .get_preview(&id, preview["id"].as_str().unwrap())
            .is_err());
        assert!(api
            .create_preview(&id, json!({"path":"source.pdf"}))
            .is_err());
        assert_eq!(fs::read(&sentinel).unwrap(), b"preserve");
        fs::remove_dir(api.previews_dir()).unwrap();
    }

    #[test]
    fn escaped_preview_identity_never_discloses_a_private_neighbor() {
        let root = tempfile::tempdir().unwrap();
        fs::create_dir(root.path().join("previews")).unwrap();
        let sentinel = root.path().join("owned-private.json");
        let bytes = br#"{"secret":"owned preview scope sentinel"}"#;
        fs::write(&sentinel, bytes).unwrap();
        let api = LocalApi::new(root.path().into(), "qa".into(), "test".into());
        let project = api
            .create_project(json!({"name":"Owned QA","versioningMode":"none","syncMode":"none"}))
            .unwrap();
        let route = format!(
            "/api/projects/{}/previews/..%2Fowned-private",
            project["id"].as_str().unwrap()
        );
        let read = api.handle("GET", &route, Value::Null, vec![]);
        let leaked = read.as_ref().is_ok_and(|response| {
            response
                .body
                .to_string()
                .contains("owned preview scope sentinel")
        });
        assert!(
            !leaked,
            "preview identity disclosed a neighboring private file"
        );
        assert_eq!(fs::read(&sentinel).unwrap(), bytes);
    }
}
