//! Local output review. No request envelopes, credentials, provider calls or automatic expiry.
use super::*;
use std::{fs, io::Read};

#[cfg(test)]
mod tests {
    use super::*;
    struct Fixture {
        _dir: tempfile::TempDir,
        api: LocalApi,
        project: String,
        root: PathBuf,
    }
    fn fixture() -> Fixture {
        let dir = tempfile::tempdir().unwrap();
        let api = LocalApi::new(dir.path().join("state"), "test".into(), "test".into());
        let root = dir.path().join("project");
        let project = api
            .create_project(json!({"name":"Results QA","folderPath":root,"versioningMode":"none"}))
            .unwrap()["id"]
            .as_str()
            .unwrap()
            .to_string();
        Fixture {
            _dir: dir,
            api,
            project,
            root,
        }
    }
    fn record(f: &Fixture) -> Value {
        json!({"id":format!("{}:qa-result",f.project),"projectId":f.project,"projectName":"Results QA","receivedAt":"2026-10-31T09:00:00Z","reason":"New typing","answer":"Generated output","originProjectRootHash":sha256_hex(f.root.canonicalize().unwrap().to_string_lossy().as_bytes()),"outputs":[{"id":"output","kind":"markdown","name":"Proposed document","summary":"QA","markdown":"# Proposed\nOutput"}],"appliedPaths":[]})
    }
    #[test]
    fn round_trip_survives_a_new_runtime_and_strips_request_fields() {
        let f = fixture();
        let mut value = record(&f);
        value["prompt"] = json!("DO NOT STORE REQUEST");
        value["apiKey"] = json!("DO NOT STORE KEY");
        value["outputs"][0]["request"] = json!({"prompt":"DO NOT STORE NESTED REQUEST"});
        let saved = f.api.preserve_ai_result(value.clone()).unwrap();
        assert!(saved.get("prompt").is_none());
        let bytes =
            fs::read_to_string(path(&f.api, value["id"].as_str().unwrap()).unwrap()).unwrap();
        assert!(!bytes.contains("DO NOT STORE"));
        let restarted = LocalApi::new(f.api.app_data_dir.clone(), "test".into(), "test".into());
        assert_eq!(restarted.list_ai_results().unwrap()["results"][0], saved);
        assert_eq!(f.api.preserve_ai_result(value).unwrap(), saved);
    }
    #[test]
    fn write_quota_counts_all_real_entries_but_allows_idempotent_ack_at_capacity() {
        let f=fixture(); let value=record(&f); let saved=f.api.preserve_ai_result(value.clone()).unwrap();
        for index in 1..MAX_FILES {
            let mut item=value.clone();item["id"]=json!(format!("{}:quota-{index}",f.project));item["schemaVersion"]=json!(1);
            fs::write(path(&f.api,item["id"].as_str().unwrap()).unwrap(),serde_json::to_vec(&item).unwrap()).unwrap();
        }
        assert_eq!(f.api.preserve_ai_result(value.clone()).unwrap(),saved);
        let mut next=value;next["id"]=json!(format!("{}:one-too-many",f.project));
        assert!(f.api.preserve_ai_result(next.clone()).unwrap_err().contains("256"));
        assert!(!path(&f.api,next["id"].as_str().unwrap()).unwrap().exists());
        assert_eq!(fs::read_dir(directory(&f.api).unwrap()).unwrap().count(),MAX_FILES);
    }
    #[test]
    fn write_quota_charges_bytes_without_loading_or_removing_oversize_original() {
        let f=fixture();let root=directory(&f.api).unwrap();fs::create_dir_all(&root).unwrap();let reserved=root.join("unknown.json");
        fs::File::create(&reserved).unwrap().set_len(MAX_TOTAL).unwrap();
        assert!(f.api.preserve_ai_result(record(&f)).unwrap_err().contains("64 MiB"));
        assert_eq!(fs::metadata(reserved).unwrap().len(),MAX_TOTAL);assert_eq!(fs::read_dir(root).unwrap().count(),1);
    }
    #[test]
    fn unverified_or_nonregular_entries_block_new_retention_without_changing_them() {
        let f=fixture();let root=directory(&f.api).unwrap();fs::create_dir_all(&root).unwrap();let bad=root.join("future.json");
        fs::write(&bad,"{damaged").unwrap();assert!(f.api.preserve_ai_result(record(&f)).is_err());assert_eq!(fs::read_to_string(&bad).unwrap(),"{damaged");
        let mut future=record(&f);future["schemaVersion"]=json!(2);let future_bytes=serde_json::to_vec(&future).unwrap();
        fs::write(&bad,&future_bytes).unwrap();assert!(f.api.preserve_ai_result(record(&f)).is_err());assert_eq!(fs::read(&bad).unwrap(),future_bytes);
        fs::remove_file(&bad).unwrap();fs::create_dir(&bad).unwrap();assert!(f.api.preserve_ai_result(record(&f)).unwrap_err().contains("no regular"));assert!(bad.is_dir());
    }
    #[test]
    fn identity_collision_and_corrupt_files_are_preserved() {
        let f = fixture();
        let value = record(&f);
        f.api.preserve_ai_result(value.clone()).unwrap();
        let mut changed = value.clone();
        changed["answer"] = json!("Other output");
        assert!(f.api.preserve_ai_result(changed).is_err());
        let target = path(&f.api, value["id"].as_str().unwrap()).unwrap();
        fs::write(&target, "{bad json").unwrap();
        let listed = f.api.list_ai_results().unwrap();
        assert!(listed["results"].as_array().unwrap().is_empty());
        assert_eq!(listed["warnings"].as_array().unwrap().len(), 1);
        assert!(f
            .api
            .remove_ai_result(value["id"].as_str().unwrap())
            .is_err());
        assert_eq!(fs::read_to_string(target).unwrap(), "{bad json");
    }
    #[test]
    fn copy_is_idempotent_and_never_replaces_new_edits() {
        let f = fixture();
        let value = record(&f);
        let id = value["id"].as_str().unwrap().to_string();
        f.api.preserve_ai_result(value).unwrap();
        let first = f
            .api
            .copy_ai_result(&id, json!({"outputId":"output"}))
            .unwrap();
        let second = f
            .api
            .copy_ai_result(&id, json!({"outputId":"output"}))
            .unwrap();
        assert_eq!(first["node"]["id"], second["node"]["id"]);
        let target = f.root.join(first["node"]["path"].as_str().unwrap());
        fs::write(&target, "# New local edits").unwrap();
        assert!(f
            .api
            .copy_ai_result(&id, json!({"outputId":"output"}))
            .is_err());
        assert_eq!(fs::read_to_string(target).unwrap(), "# New local edits");
        f.api.remove_ai_result(&id).unwrap();
        assert!(f.api.list_ai_results().unwrap()["results"]
            .as_array()
            .unwrap()
            .is_empty());
        assert!(f
            .root
            .join(first["node"]["path"].as_str().unwrap())
            .exists());
    }
    #[test]
    fn handwriting_copy_rebinds_identity_and_can_be_retried() {
        let f = fixture();
        let mut value = record(&f);
        let id = value["id"].as_str().unwrap().to_string();
        let content = default_handwritten_note("old:note.knote", "QA strokes");
        value["outputs"][0] =
            json!({"id":"ink","kind":"handwritten","name":"Ink","summary":"QA","content":content});
        f.api.preserve_ai_result(value).unwrap();
        let first = f
            .api
            .copy_ai_result(&id, json!({"outputId":"ink"}))
            .unwrap();
        let second = f
            .api
            .copy_ai_result(&id, json!({"outputId":"ink"}))
            .unwrap();
        assert_eq!(first["node"]["id"], second["node"]["id"]);
        let copied: Value = serde_json::from_slice(
            &fs::read(f.root.join(first["node"]["path"].as_str().unwrap())).unwrap(),
        )
        .unwrap();
        assert_eq!(copied["id"], first["node"]["id"]);
        assert_eq!(copied["pages"], content["pages"]);
    }
    #[test]
    fn repointed_project_does_not_lose_result_or_copy_to_new_root() {
        let f = fixture();
        let value = record(&f);
        let id = value["id"].as_str().unwrap().to_string();
        let projects = f.api.app_data_dir.join("projects.json");
        let mut registry: Value = serde_json::from_slice(&fs::read(&projects).unwrap()).unwrap();
        registry["projects"][0]["folderPath"] = json!(f._dir.path().join("different"));
        fs::create_dir_all(f._dir.path().join("different")).unwrap();
        fs::write(&projects, serde_json::to_vec(&registry).unwrap()).unwrap();
        f.api.preserve_ai_result(value).unwrap();
        assert!(f
            .api
            .copy_ai_result(&id, json!({"outputId":"output"}))
            .is_err());
        assert_eq!(
            f.api.list_ai_results().unwrap()["results"]
                .as_array()
                .unwrap()
                .len(),
            1
        );
        registry["projects"] = json!([]);
        fs::write(projects, serde_json::to_vec(&registry).unwrap()).unwrap();
        assert_eq!(
            f.api.list_ai_results().unwrap()["results"]
                .as_array()
                .unwrap()
                .len(),
            1
        );
    }
    #[test]
    fn rejects_unsupported_shapes_and_unsafe_store_without_altering_sources() {
        let f = fixture();
        let mut value = record(&f);
        value["outputs"][0] = json!({"id":"ink","name":"Ink","summary":"QA","kind":"handwritten","content":{"schemaVersion":1,"pages":[null]}});
        assert!(f.api.preserve_ai_result(value).is_err());
        let mut value = record(&f);
        value["originProjectRootHash"] = json!("unverified");
        assert!(f.api.preserve_ai_result(value).is_err());
        let store = directory(&f.api).unwrap();
        fs::write(&store, "preserve me").unwrap();
        assert!(f.api.preserve_ai_result(record(&f)).is_err());
        assert_eq!(fs::read_to_string(store).unwrap(), "preserve me");
    }
    #[test]
    fn raster_output_is_bounded_copied_exactly_and_never_treated_as_markup() {
        let f = fixture();
        let mut value = record(&f);
        value["outputs"][0] = json!({"id":"image","name":"Image","summary":"Generated raster","kind":"image","format":"png","dataBase64":"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jXioAAAAASUVORK5CYII=","prompt":"DO NOT STORE IMAGE PROMPT"});
        let saved = f.api.preserve_ai_result(value.clone()).unwrap();
        assert!(!saved.to_string().contains("DO NOT STORE"));
        let first = f
            .api
            .copy_ai_result(saved["id"].as_str().unwrap(), json!({"outputId":"image"}))
            .unwrap();
        let second = f
            .api
            .copy_ai_result(saved["id"].as_str().unwrap(), json!({"outputId":"image"}))
            .unwrap();
        assert_eq!(first["node"], second["node"]);
        let target = f.root.join(first["node"]["path"].as_str().unwrap());
        assert_eq!(
            fs::read(&target).unwrap(),
            image_bytes(&saved["outputs"][0]).unwrap()
        );
        fs::write(&target, b"new image bytes").unwrap();
        assert!(f
            .api
            .copy_ai_result(saved["id"].as_str().unwrap(), json!({"outputId":"image"}))
            .is_err());
        value["outputs"][0]["format"] = json!("svg");
        assert!(f.api.preserve_ai_result(value.clone()).is_err());
        value["outputs"][0]["format"] = json!("png");
        value["outputs"][0]["dataBase64"] =
            json!(base64::engine::general_purpose::STANDARD.encode(b"<script>bad</script>"));
        assert!(f.api.preserve_ai_result(value).is_err());
    }
}

const MAX_FILE: u64 = 32 * 1024 * 1024;
const MAX_TOTAL: u64 = 64 * 1024 * 1024;
const MAX_FILES: usize = 256;

/// Charge actual files before parsing. Unknown/corrupt entries are preserved, never evicted.
fn preservation_budget(api: &LocalApi, additional: u64) -> Result<(), String> {
    let root = directory(api)?;
    let reader = match fs::read_dir(&root) {
        Ok(reader) => reader,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(_) => return Err("No se puede comprobar el espacio de resultados; los archivos se conservan".into()),
    };
    let mut paths = Vec::new();
    let mut total = additional;
    for entry in reader.take(MAX_FILES) {
        let path = entry.map_err(|_| "No se puede verificar una entrada de resultados")?.path();
        let meta = fs::symlink_metadata(&path).map_err(|_| "No se puede comprobar un resultado conservado")?;
        if !meta.is_file() || batch::linked(&meta) { return Err("Hay una entrada no regular en resultados. Se conserva sin seguir enlaces; revisa el almacén antes de ampliarlo".into()); }
        total = total.saturating_add(meta.len());
        if total > MAX_TOTAL { return Err("El almacén de resultados alcanza 64 MiB. Quita copias ya revisadas antes de conservar otra; no se borra nada automáticamente".into()); }
        paths.push(path);
    }
    if paths.len() >= MAX_FILES { return Err("El almacén alcanza 256 resultados. Quita copias ya revisadas antes de conservar otra".into()); }
    for candidate in paths {
        let value = read(&candidate).map_err(|_| "Hay un resultado no verificable. Se conserva sin cambios; revisa el almacén antes de ampliarlo")?;
        if candidate != path(api, value["id"].as_str().unwrap_or(""))? { return Err("La identidad de un resultado no coincide con su archivo; se conserva sin cambios".into()); }
    }
    Ok(())
}

fn directory(api: &LocalApi) -> Result<PathBuf, String> {
    for path in [&api.app_data_dir, &api.app_data_dir.join("ai-results")] {
        match fs::symlink_metadata(path) {
            Ok(meta) if !meta.is_dir() || batch::linked(&meta) => return Err(
                "El almacén de resultados IA no es una carpeta regular; se conserva sin cambios"
                    .into(),
            ),
            Ok(_) => (),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => (),
            Err(_) => return Err("No se puede consultar el almacén de resultados IA".into()),
        }
    }
    Ok(api.app_data_dir.join("ai-results"))
}
fn path(api: &LocalApi, id: &str) -> Result<PathBuf, String> {
    if id.is_empty() || id.len() > 320 {
        return Err("Identidad de resultado no válida".into());
    }
    Ok(directory(api)?.join(format!("{}.json", sha256_hex(id.as_bytes()))))
}
fn read(path: &Path) -> Result<Value, String> {
    let meta =
        fs::symlink_metadata(path).map_err(|_| "No se puede consultar el resultado conservado")?;
    if !meta.is_file() || batch::linked(&meta) || meta.len() > MAX_FILE {
        return Err(
            "El resultado no es un archivo regular de hasta 32 MiB; se conserva sin cambios".into(),
        );
    }
    let mut bytes = Vec::new();
    fs::File::open(path)
        .map_err(|_| "No se puede abrir el resultado")?
        .take(MAX_FILE + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| "No se puede leer todo el resultado")?;
    if bytes.len() as u64 > MAX_FILE {
        return Err("El resultado supera el límite de lectura".into());
    }
    let value: Value = serde_json::from_slice(&bytes)
        .map_err(|_| "El resultado conservado está dañado; no se modifica")?;
    if value["schemaVersion"] != 1 {
        return Err("Versión de resultado no compatible; no se modifica".into());
    }
    validate(&value)?;
    Ok(value)
}
fn text<'a>(value: &'a Value, key: &str, max: usize) -> Result<&'a str, String> {
    value[key]
        .as_str()
        .filter(|text| text.len() <= max)
        .ok_or_else(|| format!("Campo de resultado no válido: {key}"))
}
fn validate(value: &Value) -> Result<(), String> {
    let origin = text(value, "originProjectRootHash", 64)?;
    if origin.len() != 64 || !origin.bytes().all(|b| b.is_ascii_hexdigit()) {
        return Err("No se puede verificar el origen del resultado".into());
    }
    if text(value, "id", 320)?.is_empty() {
        return Err("Identidad de resultado vacía".into());
    }
    text(value, "projectName", 1024)?;
    text(value, "reason", 4096)?;
    text(value, "answer", 16 * 1024 * 1024)?;
    let project = text(value, "projectId", 160)?;
    if project.is_empty()
        || !project
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
    {
        return Err("Proyecto de resultado no válido".into());
    }
    OffsetDateTime::parse(text(value, "receivedAt", 64)?, &Rfc3339)
        .map_err(|_| "Fecha de resultado no válida")?;
    let outputs = value["outputs"]
        .as_array()
        .filter(|outputs| outputs.len() <= 128)
        .ok_or("Lista de resultados no válida")?;
    let mut ids = BTreeSet::new();
    for output in outputs {
        let id = text(output, "id", 320)?;
        if id.is_empty() || !ids.insert(id) {
            return Err("Identidad de contenido duplicada o vacía".into());
        }
        text(output, "name", 1024)?;
        text(output, "summary", 4096)?;
        match output["kind"].as_str() {
            Some("markdown") => {
                text(output, "markdown", 16 * 1024 * 1024)?;
            }
            Some("handwritten") => validate_handwritten(&output["content"])?,
            Some("image") => {
                image_bytes(output)?;
            }
            _ => return Err("Contenido del resultado no compatible".into()),
        }
    }
    let paths = value["appliedPaths"]
        .as_array()
        .filter(|paths| paths.len() <= 1024)
        .ok_or("Lista de cambios aplicados no válida")?;
    if paths
        .iter()
        .any(|path| !path.as_str().is_some_and(|path| path.len() <= 4096))
    {
        return Err("Ruta informativa no válida".into());
    }
    Ok(())
}
pub(super) fn validate_handwritten(content: &Value) -> Result<(), String> {
    document_validation::handwritten(content)
}
/// Raster only, bounded before decoding. The extension/mime never comes from a path.
pub(super) fn image_bytes(output: &Value) -> Result<Vec<u8>, String> {
    let encoded = text(output, "dataBase64", 16 * 1024 * 1024)?;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(encoded)
        .map_err(|_| "La imagen conservada no contiene base64 válido")?;
    let matches = match output["format"].as_str() {
        Some("png") => bytes.starts_with(b"\x89PNG\r\n\x1a\n"),
        Some("jpeg") => bytes.starts_with(&[0xff, 0xd8, 0xff]),
        Some("webp") => bytes.len() >= 12 && &bytes[..4] == b"RIFF" && &bytes[8..12] == b"WEBP",
        _ => false,
    };
    if !matches {
        return Err("Formato raster no compatible con los bytes de la imagen".into());
    }
    Ok(bytes)
}
fn public(value: &Value) -> Value {
    let mut output = serde_json::Map::new();
    for field in [
        "id",
        "projectId",
        "projectName",
        "receivedAt",
        "reason",
        "answer",
        "outputs",
        "appliedPaths",
        "originProjectRootHash",
    ] {
        output.insert(field.into(), value[field].clone());
    }
    Value::Object(output)
}
impl LocalApi {
    pub(crate) fn list_ai_results(&self) -> Result<Value, String> {
        let root = directory(self)?;
        if !root.exists() {
            return Ok(json!({"results":[],"warnings":[]}));
        }
        let mut results = Vec::new();
        let mut warnings = Vec::new();
        let mut budget = MAX_TOTAL;
        for (index, entry) in fs::read_dir(root)
            .map_err(|_| "No se puede revisar el almacén de resultados")?
            .enumerate()
        {
            if index >= MAX_FILES {
                warnings.push("La revisión alcanza 256 entradas. Conserva las demás; libera resultados revisados para continuar.".to_string());
                break;
            }
            let entry = match entry {
                Ok(entry) => entry,
                Err(_) => {
                    warnings.push("Una entrada no se pudo consultar y se conserva.".into());
                    continue;
                }
            };
            let size = entry
                .metadata()
                .map(|meta| meta.len())
                .unwrap_or(MAX_FILE + 1);
            if size > budget {
                warnings.push("Se alcanza el presupuesto de 64 MiB de esta revisión. Los demás resultados se conservan.".into());
                break;
            }
            budget = budget.saturating_sub(size);
            match read(&entry.path()) {
                Ok(value) if entry.path()==path(self,value["id"].as_str().unwrap_or(""))? => results.push(public(&value)),
                _ => warnings.push("Un resultado no se pudo verificar; el archivo original se conserva sin cambios.".into()),
            }
        }
        results.sort_by(|a, b| b["receivedAt"].as_str().cmp(&a["receivedAt"].as_str()));
        Ok(json!({"results":results,"warnings":warnings}))
    }
    pub(crate) fn preserve_ai_result(&self, payload: Value) -> Result<Value, String> {
        validate(&payload)?;
        // Only these output fields enter the store; never a request/prompt/context snapshot.
        let mut value = public(&payload);
        value["outputs"]=json!(payload["outputs"].as_array().unwrap().iter().map(|output|{
            let mut safe=json!({"id":output["id"],"name":output["name"],"summary":output["summary"],"kind":output["kind"]});
            match output["kind"].as_str() {
                Some("markdown") => safe["markdown"]=output["markdown"].clone(),
                Some("image") => {safe["dataBase64"]=output["dataBase64"].clone();safe["format"]=output["format"].clone();},
                _ => safe["content"]=output["content"].clone(),
            }
            safe
        }).collect::<Vec<_>>());
        let target = path(self, value["id"].as_str().unwrap())?;
        if target.exists() {
            let existing = read(&target)?;
            if public(&existing) == value {
                return Ok(public(&existing));
            }
            return Err("Ya existe otro resultado con esta identidad; no se ha reemplazado".into());
        }
        value["schemaVersion"] = json!(1);
        let bytes = serde_json::to_vec_pretty(&value).map_err(|error| error.to_string())?;
        if bytes.len() as u64 > MAX_FILE {
            return Err(
                "El resultado supera 32 MiB. Se mantiene en la sesión para revisión.".into(),
            );
        }
        preservation_budget(self, bytes.len() as u64)?;
        fs::create_dir_all(directory(self)?)
            .map_err(|_| "No se puede crear el almacén de resultados")?;
        atomic_io::create(&target, &bytes)
            .map_err(|_| "No se pudo conservar el resultado. Sigue disponible en esta sesión.")?;
        Ok(public(&value))
    }
    pub(crate) fn remove_ai_result(&self, id: &str) -> Result<Value, String> {
        let target = path(self, id)?;
        let value = read(&target)?;
        if value["id"] != id {
            return Err("La identidad del resultado no coincide".into());
        }
        fs::remove_file(target).map_err(|_| "No se pudo quitar el resultado conservado")?;
        Ok(json!({"removed":true}))
    }
    pub(crate) fn copy_ai_result(&self, id: &str, payload: Value) -> Result<Value, String> {
        let value = read(&path(self, id)?)?;
        if value["id"] != id {
            return Err("La identidad del resultado no coincide".into());
        }
        let project = value["projectId"].as_str().unwrap();
        let _project_write=self.project_write(project)?;
        let root = self
            .project_root(project)?
            .canonicalize()
            .map_err(|_| "El proyecto de origen ya no está disponible")?;
        if value["originProjectRootHash"] != sha256_hex(root.to_string_lossy().as_bytes()) {
            return Err("La ubicación del proyecto cambió. El resultado se conserva; revisa el destino antes de copiarlo.".into());
        }
        let index = value["outputs"]
            .as_array()
            .unwrap()
            .iter()
            .position(|output| output["id"] == payload["outputId"])
            .ok_or("Contenido del resultado no encontrado")?;
        let output = &value["outputs"][index];
        let key = sha256_hex(id.as_bytes());
        let extension = match output["kind"].as_str() {
            Some("markdown") => "md",
            Some("image") => output["format"]
                .as_str()
                .ok_or("Formato de imagen no válido")?,
            _ => "knote",
        };
        let relative = format!("Resultado IA {}-{}.{}", &key[..12], index + 1, extension);
        let target = self.resolve_project_relative(project, &relative)?;
        let bytes = if extension == "md" {
            output["markdown"].as_str().unwrap().as_bytes().to_vec()
        } else if output["kind"] == "image" {
            image_bytes(output)?
        } else {
            let note_id = doc_id(project, &relative);
            let mut original = output["content"].clone();
            for field in ["createdAt", "updatedAt"] {
                if original[field].as_str().unwrap_or("").is_empty() {
                    original[field] = value["receivedAt"].clone();
                }
            }
            if let Some(pages) = original["pages"].as_array_mut() {
                for page in pages {
                    if page["updatedAt"].as_str().unwrap_or("").is_empty() {
                        page["updatedAt"] = value["receivedAt"].clone();
                    }
                }
            }
            let mut content = normalize_handwritten_note(original, &note_id, "Resultado IA");
            content["id"] = json!(note_id);
            serde_json::to_vec_pretty(&content).map_err(|error| error.to_string())?
        };
        match fs::symlink_metadata(&target) {
            Ok(meta) => {
                if !meta.is_file() || batch::linked(&meta) || meta.len() != bytes.len() as u64 {
                    return Err(
                        "El nombre de copia ya está ocupado; no se sobrescribe ningún archivo"
                            .into(),
                    );
                }
                let mut existing = Vec::new();
                fs::File::open(&target)
                    .map_err(|_| "No se puede verificar la copia")?
                    .take(MAX_FILE + 1)
                    .read_to_end(&mut existing)
                    .map_err(|_| "No se puede leer la copia")?;
                if existing != bytes {
                    return Err(
                        "La copia existente tiene cambios nuevos; se conserva sin reemplazarla"
                            .into(),
                    );
                }
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                atomic_io::create(&target, &bytes)
                    .map_err(|_| "No se pudo crear la copia; el resultado se conserva")?
            }
            Err(_) => return Err("No se puede comprobar el destino de la copia".into()),
        }
        self.file_result(project, Some(relative), vec![])
    }
}

/// Strict bounded discovery for an explicitly reviewed privacy action.
pub(super) fn privacy_entries(api:&LocalApi,project:&str)->Result<Vec<(PathBuf,Value)>,String>{let root=directory(api)?;if !root.exists(){return Ok(vec![]);}let mut rows=vec![];let mut total=0u64;let mut seen=0usize;for entry in fs::read_dir(&root).map_err(|_|"No se pueden revisar resultados")?.take(MAX_FILES+1){let entry=entry.map_err(|_|"Resultado no accesible")?;let name=entry.file_name().to_string_lossy().into_owned();if matches!(name.as_str(),"owner.lock"|"runtime-owner.lock"|"capture.lock"){continue;}seen+=1;if seen>MAX_FILES||!name.strip_suffix(".json").is_some_and(|s|s.len()==64&&s.bytes().all(|b|b.is_ascii_hexdigit())){return Err("Hay resultados desconocidos o demasiados; se conservan".into());}let value=read(&entry.path())?;let m=fs::symlink_metadata(entry.path()).map_err(|_|"Resultado no accesible")?;total=total.saturating_add(m.len());if total>MAX_TOTAL||entry.path()!=path(api,value["id"].as_str().unwrap_or(""))?{return Err("Los resultados superan su límite o identidad; se conservan".into());}if value["projectId"]==project{rows.push((entry.path(),value));}}rows.sort_by(|a,b|a.0.cmp(&b.0));Ok(rows)}
