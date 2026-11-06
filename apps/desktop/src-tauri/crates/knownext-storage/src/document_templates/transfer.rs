//! Explicit portable data. Private catalog identities and filled document values never travel.
use super::*;

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Portable {
    pub(super) format: String,
    pub(super) schema_version: u8,
    pub(super) name: String,
    pub(super) description: String,
    pub(super) markdown: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub(super) resources: Vec<Attachment>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Import {
    content: String,
    digest: String,
    name: String,
    #[serde(default, rename = "reviewedResources")]
    reviewed_resources: bool,
}
pub(super) fn decode(content: &str) -> Result<Portable, String> {
    if content.len() as u64 > MAX_FILE {
        return Err("El archivo de plantilla supera 16 MiB".into());
    }
    let data: Portable = serde_json::from_str(content).map_err(|_| {
        "El archivo no es una plantilla portable válida o contiene campos adicionales"
    })?;
    if data.format != "knownext.document-template" || !matches!(data.schema_version, 1 | 2) {
        return Err(
            "Formato o versión de plantilla no compatible. El archivo original se conserva".into(),
        );
    }
    validate(&Record {
        schema_version: data.schema_version,
        resources: data.resources.clone(),
        id: "custom-import-review".into(),
        name: data.name.clone(),
        description: data.description.clone(),
        markdown: data.markdown.clone(),
        created_at: knownext_core::now_iso(),
    })?;
    Ok(data)
}
fn validate_portable(content: &str) -> Result<(), String> {
    if catalogue::is_catalogue(content) {
        catalogue::decode(content).map(|_| ())
    } else {
        decode(content).map(|_| ())
    }
}
pub fn read_transfer_file(path: &Path) -> Result<Value, String> {
    let bytes = read_bytes(path)?;
    let content = String::from_utf8(bytes)
        .map_err(|_| "La plantilla necesita texto UTF-8 válido; el original se conserva")?;
    // Do not infer trust from the extension or MIME supplied by a file provider.
    validate_portable(&content)?;
    Ok(
        json!({"status":"selected","fileName":path.file_name().and_then(|s|s.to_str()).unwrap_or("Plantilla.json"),"content":content}),
    )
}
impl LocalApi {
    pub fn stage_document_template_transfer(
        &self,
        file: &Value,
        cache: &Path,
    ) -> Result<crate::StagedUserExport, String> {
        let content = file["content"]
            .as_str()
            .ok_or("Falta el contenido portable")?;
        validate_portable(content)?;
        super::super::export_execution::stage_user_export(
            LocalApiContentResponse {
                status: 200,
                content_type: "application/json".into(),
                filename: Some(
                    file["fileName"]
                        .as_str()
                        .unwrap_or("Plantilla KnowNext.json")
                        .into(),
                ),
                data_base64: base64::engine::general_purpose::STANDARD.encode(content.as_bytes()),
            },
            cache,
        )
    }
    pub fn inspect_document_template_transfer(&self, content: &str) -> Result<Value, String> {
        if catalogue::is_catalogue(content) {
            return catalogue::inspect(content);
        }
        let data = decode(content)?;
        Ok(
            json!({"name":data.name,"description":data.description,"markdown":data.markdown,"variables":variables(&data.markdown)?,"resources":data.resources.iter().map(attachments::summary).collect::<Vec<_>>(),"digest":sha256_hex(content.as_bytes()),"byteLength":content.len()}),
        )
    }
    pub(crate) fn import_document_template_transfer(&self, body: Value) -> Result<Value, String> {
        let input: Import =
            serde_json::from_value(body).map_err(|_| "Importación de plantilla no válida")?;
        if input.content.len() as u64 > MAX_FILE
            || sha256_hex(input.content.as_bytes()) != input.digest
        {
            return Err(
                "El archivo cambió desde la revisión. Vuelve a seleccionarlo antes de importar"
                    .into(),
            );
        }
        let data = decode(&input.content)?;
        if !data.resources.is_empty() && !input.reviewed_resources {
            return Err(
                "Revisa los adjuntos del archivo y confirma su incorporación al catálogo".into(),
            );
        }
        self.capture_document_template(
            json!({"name":input.name,"description":data.description,"markdown":data.markdown,"resources":data.resources,"reviewedResources":true}),
        )
    }
    pub fn export_document_template_transfer(
        &self,
        id: &str,
        revision: &str,
    ) -> Result<Value, String> {
        let data = self.document_template(id)?;
        if data["revision"].as_str() != Some(revision) {
            return Err("La plantilla cambió. Vuelve a revisarla antes de exportar".into());
        }
        let content = serde_json::to_string_pretty(&Portable {
            format: "knownext.document-template".into(),
            schema_version: if data.get("resources").is_some() {
                2
            } else {
                1
            },
            resources: serde_json::from_value(
                data.get("resources").cloned().unwrap_or_else(|| json!([])),
            )
            .map_err(|_| "Recursos de plantilla no compatibles")?,
            name: data["name"].as_str().unwrap_or_default().into(),
            description: data["description"].as_str().unwrap_or_default().into(),
            markdown: data["markdown"].as_str().unwrap_or_default().into(),
        })
        .map_err(|e| e.to_string())?;
        decode(&content)?;
        Ok(
            json!({"fileName":"Plantilla KnowNext.json","content":content,"digest":sha256_hex(content.as_bytes()),"byteLength":content.len()}),
        )
    }
    pub fn write_document_template_transfer(
        &self,
        content: &str,
        output: &Path,
    ) -> Result<usize, String> {
        validate_portable(content)?;
        if !output.is_absolute()
            || !output
                .extension()
                .is_some_and(|x| x.eq_ignore_ascii_case("json"))
        {
            return Err("Elige un archivo JSON nuevo con ruta absoluta".into());
        }
        let parent = output
            .parent()
            .ok_or("Falta la carpeta de destino")?
            .canonicalize()
            .map_err(|_| "La carpeta de destino no está disponible")?;
        let target = parent.join(output.file_name().ok_or("Falta el nombre de destino")?);
        if target.starts_with(
            self.app_data_dir
                .canonicalize()
                .map_err(|_| "No se puede comprobar el estado privado")?,
        ) {
            return Err(
                "La plantilla no puede exportarse dentro del estado privado de la aplicación"
                    .into(),
            );
        }
        for project in self.list_projects() {
            if let Some(root) = project["folderPath"]
                .as_str()
                .and_then(|s| Path::new(s).canonicalize().ok())
            {
                if let Ok(relative) = target.strip_prefix(&root) {
                    path_policy::resolve(&root, &relative.to_string_lossy().replace('\\', "/"))?;
                }
            }
        }
        atomic_io::create(&target,content.as_bytes()).map_err(|_|"No se pudo crear el archivo. Elige un nombre nuevo en una carpeta con permiso; no se reemplazan archivos existentes")?;
        Ok(content.len())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn api() -> (tempfile::TempDir, LocalApi) {
        let dir = tempfile::tempdir().unwrap();
        let api = LocalApi::new(dir.path().join("state"), "test".into(), "desktop".into());
        (dir, api)
    }
    fn saved(api: &LocalApi) -> Value {
        api.capture_document_template(json!({"name":"Acta portable","description":"Solo estructura","markdown":"# {{titulo}}\n\n{{asistentes}}"})).unwrap()
    }
    #[test]
    fn roundtrip_between_catalogs_has_only_explicit_portable_fields_and_new_identity() {
        let (_a, first) = api();
        let (_b, second) = api();
        let original = saved(&first);
        let file = first
            .export_document_template_transfer(
                original["id"].as_str().unwrap(),
                original["revision"].as_str().unwrap(),
            )
            .unwrap();
        let data: Value = serde_json::from_str(file["content"].as_str().unwrap()).unwrap();
        assert_eq!(data.as_object().unwrap().len(), 5);
        for key in [
            "id",
            "createdAt",
            "values",
            "projectId",
            "credentials",
            "root",
        ] {
            assert!(data.get(key).is_none());
        }
        let review = second
            .inspect_document_template_transfer(file["content"].as_str().unwrap())
            .unwrap();
        let imported = second
            .import_document_template_transfer(
                json!({"content":file["content"],"digest":review["digest"],"name":review["name"]}),
            )
            .unwrap();
        assert_ne!(original["id"], imported["id"]);
        assert_eq!(original["markdown"], imported["markdown"]);
        assert_eq!(original["variables"], imported["variables"]);
    }
    #[test]
    fn collision_preserves_both_catalog_and_review_and_allows_explicit_rename() {
        let (_d, api) = api();
        let original = saved(&api);
        let file = api
            .export_document_template_transfer(
                original["id"].as_str().unwrap(),
                original["revision"].as_str().unwrap(),
            )
            .unwrap();
        let mut input =
            json!({"content":file["content"],"digest":file["digest"],"name":"ACTA PORTABLE"});
        assert!(api
            .import_document_template_transfer(input.clone())
            .unwrap_err()
            .contains("otro nombre"));
        input["name"] = json!("Acta recibida");
        let imported = api.import_document_template_transfer(input).unwrap();
        assert_ne!(original["id"], imported["id"]);
        assert_eq!(
            api.document_template(original["id"].as_str().unwrap())
                .unwrap()["revision"],
            original["revision"]
        );
    }
    #[test]
    fn changed_bytes_revision_future_schema_and_hidden_state_are_rejected() {
        let (_d, api) = api();
        let original = saved(&api);
        let file = api
            .export_document_template_transfer(
                original["id"].as_str().unwrap(),
                original["revision"].as_str().unwrap(),
            )
            .unwrap();
        assert!(api
            .export_document_template_transfer(original["id"].as_str().unwrap(), "old")
            .is_err());
        assert!(api.import_document_template_transfer(json!({"content":format!("{} ",file["content"].as_str().unwrap()),"digest":file["digest"],"name":"Changed"})).is_err());
        let mut data: Value = serde_json::from_str(file["content"].as_str().unwrap()).unwrap();
        data["schemaVersion"] = json!(2);
        assert!(decode(&data.to_string()).is_err());
        data["schemaVersion"] = json!(1);
        data["credentials"] = json!({});
        assert!(decode(&data.to_string()).is_err());
        data.as_object_mut().unwrap().remove("credentials");
        data["markdown"] = json!("![local](photo.png)");
        assert!(decode(&data.to_string()).is_err());
        assert!(decode(&" ".repeat(MAX_FILE as usize + 1)).is_err());
    }
    #[test]
    fn regular_bounded_utf8_read_and_exclusive_private_safe_export() {
        let (dir, api) = api();
        let original = saved(&api);
        let file = api
            .export_document_template_transfer(
                original["id"].as_str().unwrap(),
                original["revision"].as_str().unwrap(),
            )
            .unwrap();
        let content = file["content"].as_str().unwrap();
        let path = dir.path().join("received.json");
        assert_eq!(
            api.write_document_template_transfer(content, &path)
                .unwrap(),
            content.len()
        );
        assert_eq!(read_transfer_file(&path).unwrap()["content"], content);
        assert!(api
            .write_document_template_transfer(content, &path)
            .is_err());
        assert_eq!(fs::read_to_string(&path).unwrap(), content);
        assert!(api
            .write_document_template_transfer(content, &api.app_data_dir.join("copy.json"))
            .is_err());
        fs::write(&path, [0xff, 0xfe]).unwrap();
        assert!(read_transfer_file(&path).is_err());
        fs::write(&path, vec![b' '; MAX_FILE as usize + 1]).unwrap();
        assert!(read_transfer_file(&path).is_err());
        assert!(read_transfer_file(dir.path()).is_err());
    }
}
