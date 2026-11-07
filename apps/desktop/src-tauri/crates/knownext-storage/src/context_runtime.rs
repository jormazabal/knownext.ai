//! Runtime facade extracted without changing method bodies or public contracts.
use super::*;

impl LocalApi {
    pub(super) fn ai_context_search(&self, project_id: &str, query: &BTreeMap<String, String>) -> Value {
        let needle = query
            .get("q")
            .map(|value| value.to_ascii_lowercase())
            .unwrap_or_default();
        let mut matches = Vec::new();
        if let (Ok(root), Ok(nodes)) =
            (self.project_root(project_id), self.project_tree(project_id))
        {
            flatten_nodes(&nodes, &mut matches, &root, &needle);
        }
        Value::Array(matches)
    }
    pub(super) fn ai_sources(&self, project_id: &str) -> Result<Value,String> {
        let mut list = self.context_checked(project_id)?;
        if let Some(sources) = list["sources"].as_array_mut() {
            for source in sources {
                *source=ai_context_origin::public(source.clone());
            }
        }
        Ok(list)
    }
    pub(super) fn ai_sources_internal(&self, project_id: &str) -> Value {
        self.context_checked(project_id).unwrap_or_else(|_|json!({"sources":[],"expiredSourceIds":[],"unavailable":true}))
    }
    pub(super) fn ai_source(&self, project_id: &str, source_id: &str, kind: &str) -> Result<Value,String> {
        let now = knownext_core::now_iso();
        let mut source = self.build_ai_source(project_id, source_id, kind, &now);
        let mut list = self.context_checked(project_id)?;
        let sources = list["sources"].as_array_mut();
        if let Some(sources) = sources {
            let matching=sources.iter().filter(|entry|entry["id"].as_str()==Some(source_id)).collect::<Vec<_>>();
            if matching.len()>1{return Err("Identidad de fuente ambigua; se conserva el contexto".into())}
            if let Some(original)=matching.first(){source=ai_context_origin::replacement((*original).clone(),&source)?;}
            sources.retain(|item| item["id"].as_str() != Some(source_id));
            sources.push(source.clone());
            self.write_json(&self.context_sources_path(project_id), &list)?;
        }
        Ok(without_internal_source_text(source))
    }
    pub(super) fn ai_upload_sources(&self, project_id: &str, files: Vec<LocalApiFile>) -> Result<Value,String> {
        if files.iter().any(|f|f.data_base64.len()>44*1024*1024){return Err("Cada fuente de contexto admite hasta32MiB; selecciona un archivo menor".into());}
        let mut list = self.context_checked(project_id)?;
        let now = knownext_core::now_iso();
        let mut uploaded = Vec::new();
        if let Some(sources) = list["sources"].as_array_mut() {
            for file in files {
                let id = format!(
                    "upload_{}",
                    knownext_core::compact_id(&safe_name(&file.name))
                );
                let bytes = base64::engine::general_purpose::STANDARD
                    .decode(file.data_base64.as_bytes())
                    .map_err(|_|"El archivo de contexto no contiene base64 válido")?;
                if bytes.len()>32*1024*1024{return Err("La fuente de contexto supera32MiB".into());}
                let mut extraction_warning:Option<String>=None;
                let mut extraction_error=false;
                let text = if file.name.to_ascii_lowercase().ends_with(".pdf") || file.mime_type.as_deref()==Some("application/pdf") {
                    match knownext_docs::extract_pdf_text_bounded(&bytes,2*1024*1024){
                        Ok(text)=>{if text.trim().is_empty(){extraction_warning=Some("PDF sin texto extraíble; no se ha ejecutado OCR".into());}text},
                        Err(warning)=>{extraction_error=true;extraction_warning=Some(warning);String::new()}
                    }
                } else if file.mime_type.as_deref().unwrap_or("").starts_with("text/")
                    || file.name.ends_with(".md")
                    || file.name.ends_with(".txt")
                    || file.name.ends_with(".csv")
                {
                    String::from_utf8_lossy(&bytes)
                        .chars()
                        .take(20_000)
                        .collect::<String>()
                } else {
                    String::new()
                };
                let name = file.name;
                let mime_type = file.mime_type;
                let source = json!({
                    "id": id,
                    "projectId": project_id,
                    "kind": "external_file",
                    "name": name,
                    "path": null,
                    "mimeType": mime_type,
                    "sizeBytes": bytes.len(),
                    "status": if extraction_error{"error"}else if extraction_warning.is_some(){"warning"}else{"ready"},
                    "weight": "medium",
                    "warning": extraction_warning,
                    "error": if extraction_error{Some("No se ha incorporado texto de este PDF") }else{None},
                    "createdAt": now,
                    "updatedAt": now,
                    "lastUsedAt": null,
                    "expiresAt": null,
                    "text": text,
                    "originProof": ai_context_origin::snapshot_proof(&bytes,&text)
                });
                sources.retain(|item| item["id"].as_str() != source["id"].as_str());
                sources.push(source.clone());
                uploaded.push(source);
            }
        }
        self.write_json(&self.context_sources_path(project_id), &list)?;
        self.ai_sources(project_id)
    }
    pub(super) fn ai_upload_local_sources(&self, project_id: &str, body: Value) -> ApiResult {
        const MAX_CONTEXT_FILE_BYTES: u64 = 25 * 1024 * 1024;
        let Some(paths) = body.get("paths").and_then(Value::as_array) else {
            return Ok(LocalApiResponse {
                status: 400,
                body: json!({ "error": "missing_paths", "message": "Selecciona al menos un archivo para añadirlo al contexto IA." }),
            });
        };

        let mut files = Vec::new();
        for raw_path in paths
            .iter()
            .filter_map(Value::as_str)
            .filter(|value| !value.trim().is_empty())
        {
            let path = PathBuf::from(raw_path);
            let metadata = match std::fs::metadata(&path) {
                Ok(metadata) if metadata.is_file() => metadata,
                Ok(_) => {
                    return Ok(LocalApiResponse {
                        status: 400,
                        body: json!({ "error": "invalid_file", "message": format!("La ruta seleccionada no es un archivo: {raw_path}") }),
                    });
                }
                Err(error) => {
                    return Ok(LocalApiResponse {
                        status: 400,
                        body: json!({ "error": "file_unavailable", "message": format!("No se pudo leer el archivo seleccionado: {error}") }),
                    });
                }
            };
            if metadata.len() > MAX_CONTEXT_FILE_BYTES {
                return Ok(LocalApiResponse {
                    status: 413,
                    body: json!({ "error": "file_too_large", "message": format!("El archivo supera el límite de 25 MB: {}", path.file_name().and_then(|value| value.to_str()).unwrap_or(raw_path)) }),
                });
            }

            let bytes = std::fs::read(&path).map_err(|error| error.to_string())?;
            files.push(LocalApiFile {
                field_name: "files".to_string(),
                name: path
                    .file_name()
                    .and_then(|value| value.to_str())
                    .unwrap_or("archivo")
                    .to_string(),
                mime_type: Some(mime_for_path(&path).to_string()),
                data_base64: base64::engine::general_purpose::STANDARD.encode(bytes),
            });
        }

        if files.is_empty() {
            return Ok(LocalApiResponse {
                status: 400,
                body: json!({ "error": "missing_paths", "message": "Selecciona al menos un archivo para añadirlo al contexto IA." }),
            });
        }

        Ok(LocalApiResponse {
            status: 200,
            body: self.ai_upload_sources(project_id, files)?,
        })
    }
    pub(super) fn build_ai_source(&self, project_id:&str, source_id:&str, kind:&str, now:&str)->Value {
        ai_context_origin::build_source(self,project_id,source_id,kind,now)
    }
    pub(super) fn remove_ai_source(&self, project_id: &str, source_id: &str) -> Result<Value,String> {
        let mut list = self.context_checked(project_id)?;
        if let Some(sources) = list["sources"].as_array_mut() {
            sources.retain(|item| item["id"].as_str() != Some(source_id));
        }
        self.write_json(&self.context_sources_path(project_id), &list)?;
        self.ai_sources(project_id)
    }
    pub(super) fn add_ai_source_to_project(
        &self,
        project_id: &str,
        source_id: &str,
        body: Value,
    ) -> Result<Value, String> {
        let sources = self.ai_sources_internal(project_id);
        let source = sources["sources"]
            .as_array()
            .and_then(|sources| {
                sources
                    .iter()
                    .find(|source| source["id"].as_str() == Some(source_id))
                    .cloned()
            })
            .unwrap_or_else(|| {
                self.build_ai_source(
                    project_id,
                    source_id,
                    "external_file",
                    &knownext_core::now_iso(),
                )
            });

        let parent =
            self.node_relative(project_id, body.get("parentId").and_then(Value::as_str))?;
        let requested_name = body
            .get("name")
            .and_then(Value::as_str)
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| source["name"].as_str().unwrap_or("contexto.md"));
        let file_name = markdown_file_name(requested_name);
        let relative = self.unique_project_relative(project_id, parent.as_deref(), &file_name)?;
        let path = self.resolve_project_relative(project_id, &relative)?;
        if let Some(parent_path) = path.parent() {
            std::fs::create_dir_all(parent_path).map_err(|error| error.to_string())?;
        }

        let source_name = source["name"].as_str().unwrap_or("Fuente IA");
        let source_path = source["path"].as_str();
        let text = source["text"].as_str().unwrap_or("").trim();
        let markdown = if text.is_empty() {
            format!(
                "# {source_name}\n\nFuente añadida desde el contexto IA.\n{}\n",
                source_path
                    .map(|path| format!("\nRuta original: `{path}`\n"))
                    .unwrap_or_default()
            )
        } else {
            format!(
                "# {source_name}\n\n{}\n\n{}",
                source_path
                    .map(|path| format!("Fuente: `{path}`\n"))
                    .unwrap_or_default(),
                text
            )
        };
        atomic_io::create(&path,markdown.as_bytes()).map_err(|error|error.to_string())?;
        let document_id = doc_id(project_id, &relative);
        Ok(self.with_project_tree(project_id,json!({"documentId":document_id,"path":relative})))
    }
    pub(super) fn unique_project_relative(
        &self,
        project_id: &str,
        parent: Option<&str>,
        file_name: &str,
    ) -> Result<String, String> {
        let base_relative = join_relative(parent, file_name);
        let base_path = self.resolve_project_relative(project_id, &base_relative)?;
        if !base_path.exists() {
            return Ok(base_relative);
        }
        let stem = file_name
            .rsplit_once('.')
            .map(|(stem, _)| stem)
            .unwrap_or(file_name);
        let ext = file_name
            .rsplit_once('.')
            .map(|(_, ext)| format!(".{ext}"))
            .unwrap_or_default();
        for index in 2..1000 {
            let candidate = join_relative(parent, &format!("{stem} {index}{ext}"));
            if !self
                .resolve_project_relative(project_id, &candidate)?
                .exists()
            {
                return Ok(candidate);
            }
        }
        Err("No se pudo generar un nombre de documento libre".to_string())
    }
}
