//! Explicit local text templates. Substitution is single-pass data processing, never execution.
use super::*;
use std::{fs, io::Read};
mod attachments;
mod catalogue;
mod resources;
mod transfer;
use attachments::Attachment;
pub use transfer::read_transfer_file;

const MAX_MARKDOWN: usize = 1024 * 1024;
const MAX_FILE: u64 = 16 * 1024 * 1024;
const MAX_TOTAL: u64 = 16 * 1024 * 1024;
const MAX_ENTRIES: usize = 256;

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Record {
    schema_version: u8,
    id: String,
    name: String,
    description: String,
    markdown: String,
    created_at: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    resources: Vec<Attachment>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Capture {
    name: String,
    #[serde(default)]
    description: String,
    markdown: String,
    #[serde(default)]
    resources: Vec<Attachment>,
    #[serde(default)]
    reviewed_resources: bool,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Render {
    project_id: String,
    name: String,
    #[serde(default)]
    values: BTreeMap<String, String>,
    revision: String,
    #[serde(default)]
    parent_id: Option<String>,
    #[serde(default)]
    project_root_hash: Option<String>,
    #[serde(default)]
    local_date: Option<String>,
}

fn folder(api: &LocalApi, retired: bool) -> Result<PathBuf, String> {
    let dir = api.app_data_dir.join(if retired {
        "document-templates-retired"
    } else {
        "document-templates"
    });
    for path in [&api.app_data_dir, &dir] {
        match fs::symlink_metadata(path) {
            Ok(meta) if !meta.is_dir() || batch::linked(&meta) => {
                return Err(
                    "El catálogo de plantillas no es una carpeta regular; se conserva sin cambios"
                        .into(),
                )
            }
            Ok(_) => (),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => (),
            Err(_) => return Err("No se puede consultar el catálogo de plantillas".into()),
        }
    }
    Ok(dir)
}
fn record_path(api: &LocalApi, id: &str) -> Result<PathBuf, String> {
    if id.is_empty() || id.len() > 160 {
        return Err("Identidad de plantilla no válida".into());
    }
    Ok(folder(api, false)?.join(format!("{}.json", sha256_hex(id.as_bytes()))))
}
fn variables(markdown: &str) -> Result<Vec<String>, String> {
    let mut keys = Vec::new();
    for (_, _, key) in placeholders(markdown) {
        if !keys.contains(&key) {
            keys.push(key);
        }
        if keys.len() > 32 {
            return Err("La plantilla admite hasta 32 campos diferentes".into());
        }
    }
    Ok(keys)
}
fn placeholders(markdown: &str) -> Vec<(usize, usize, String)> {
    let mut spans = Vec::new();
    let mut offset = 0;
    while let Some(start) = markdown[offset..].find("{{").map(|p| p + offset) {
        let Some(end) = markdown[start + 2..].find("}}").map(|p| p + start + 4) else {
            break;
        };
        let key = &markdown[start + 2..end - 2];
        let escapes = markdown[..start]
            .bytes()
            .rev()
            .take_while(|b| *b == b'\\')
            .count();
        if escapes % 2 == 0
            && !key.is_empty()
            && key.len() <= 40
            && key.bytes().next().is_some_and(|b| b.is_ascii_lowercase())
            && key
                .bytes()
                .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'_')
        {
            spans.push((start, end, key.to_owned()));
        }
        offset = end;
    }
    spans
}
fn portable(markdown: &str, allow_variables: bool) -> Result<(), String> {
    portable_with_resources(markdown, allow_variables, &[])
}
fn portable_with_resources(
    markdown: &str,
    allow_variables: bool,
    resources: &[Attachment],
) -> Result<(), String> {
    for link in knownext_docs::markdown_destinations(markdown) {
        let target = link.target.trim().to_ascii_lowercase();
        let variable_target = allow_variables
            && placeholders(&link.target)
                .iter()
                .any(|(start, end, _)| *start == 0 && *end == link.target.len());
        let mut resource_link = false;
        if !link.is_image {
            for resource in resources {
                if attachments::matches_target(resource, &link.target)? {
                    resource_link = true;
                }
            }
        }
        if resource_link {
            continue;
        }
        if link.is_image && !target.starts_with("data:image/") && !variable_target {
            return Err("La plantilla contiene una imagen no embebida. Conserva el original y prepara una plantilla de texto con imágenes embebidas; no se descargan ni se copian recursos externos.".into());
        }
        if target.starts_with('#')
            || target.starts_with("https://")
            || target.starts_with("http://")
            || target.starts_with("mailto:")
            || target.starts_with("data:image/")
        {
            continue;
        }
        if variable_target {
            continue;
        }
        return Err("La plantilla contiene un recurso o enlace local. Las plantillas de texto reutilizables admiten enlaces web e imágenes embebidas; conserva el original y prepara una copia sin rutas locales.".into());
    }
    Ok(())
}
fn validate(record: &Record) -> Result<(), String> {
    if !matches!(record.schema_version, 1 | 2)
        || (record.schema_version == 1 && !record.resources.is_empty())
        || (record.schema_version == 2 && record.resources.is_empty())
    {
        return Err("Versión de plantilla no compatible; se conserva sin cambios".into());
    }
    if !record.id.starts_with("custom-")
        || record.id.len() > 160
        || record.name.trim().is_empty()
        || record.name.len() > 240
        || record.name.chars().any(char::is_control)
        || record.description.len() > 2000
        || record.markdown.len() > MAX_MARKDOWN
    {
        return Err(
            "Datos de plantilla no válidos o fuera de presupuesto; se conservan sin cambios".into(),
        );
    }
    OffsetDateTime::parse(&record.created_at, &Rfc3339)
        .map_err(|_| "Fecha de plantilla no válida")?;
    variables(&record.markdown)?;
    attachments::validate(&record.resources, &record.markdown)?;
    portable_with_resources(&record.markdown, true, &record.resources)
}
fn read_bytes(path: &Path) -> Result<Vec<u8>, String> {
    let meta = fs::symlink_metadata(path).map_err(|_| "No se puede consultar la plantilla")?;
    if !meta.is_file() || batch::linked(&meta) || meta.len() > MAX_FILE {
        return Err(
            "La plantilla no es un archivo regular dentro del límite; se conserva sin cambios"
                .into(),
        );
    }
    let mut bytes = Vec::new();
    fs::File::open(path)
        .map_err(|_| "No se puede abrir la plantilla")?
        .take(MAX_FILE + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| "No se puede leer la plantilla")?;
    if bytes.len() as u64 > MAX_FILE {
        return Err("La plantilla supera el límite de lectura".into());
    }
    Ok(bytes)
}
fn read(path: &Path) -> Result<(Record, Vec<u8>), String> {
    let bytes = read_bytes(path)?;
    let record: Record = serde_json::from_slice(&bytes).map_err(|_| {
        "La plantilla está dañada o usa campos no compatibles; se conserva sin cambios"
    })?;
    validate(&record)?;
    if path.file_name().and_then(|n| n.to_str())
        != Some(&format!("{}.json", sha256_hex(record.id.as_bytes())))
    {
        return Err(
            "La identidad del archivo de plantilla no coincide; se conserva sin cambios".into(),
        );
    }
    Ok((record, bytes))
}
fn view(record: &Record, revision: &str, full: bool) -> Value {
    let mut result = json!({"id":record.id,"name":record.name,"description":record.description,"variables":variables(&record.markdown).unwrap_or_default(),"revision":revision,"builtIn":false,"createdAt":record.created_at});
    if !record.resources.is_empty() {
        result["resourceCount"] = json!(record.resources.len());
        result["resourceBytes"] =
            json!(record.resources.iter().map(|r| r.byte_length).sum::<u64>());
    }
    if full {
        result["markdown"] = json!(record.markdown);
        if !record.resources.is_empty() {
            result["resources"] = json!(record.resources);
            result["schemaVersion"] = json!(record.schema_version);
        }
    }
    result
}
fn builtin(id: &str, full: bool) -> Option<Value> {
    let (name,markdown)=match id {
        "blank"=>("Documento en blanco","# {{titulo}}\n\n"),
        "meeting"=>("Acta de reunión","# {{titulo}}\n\n## Información general\n\n## Asistentes\n\n## Acuerdos\n\n- [ ] Nueva tarea\n"),
        "requirements"=>("Requisitos","# {{titulo}}\n\n## Requisitos funcionales\n\n- \n\n## Requisitos no funcionales\n\n- \n"),
        "decision"=>("Decisión técnica","# {{titulo}}\n\n## Contexto\n\n## Decisión\n\n## Consecuencias\n\n"),
        _=>return None,
    };
    let mut result = json!({"id":id,"name":name,"description":"Plantilla inicial de KnowNext.ai","variables":variables(markdown).ok()?,"revision":sha256_hex(format!("{id}\n{markdown}").as_bytes()),"builtIn":true,"createdAt":null});
    if full {
        result["markdown"] = json!(markdown);
    }
    Some(result)
}

impl LocalApi {
    pub(crate) fn document_templates(&self) -> Value {
        let mut templates: Vec<Value> = ["blank", "meeting", "requirements", "decision"]
            .iter()
            .filter_map(|id| builtin(id, false))
            .collect();
        let mut warnings = Vec::new();
        let mut bytes = 0u64;
        let mut entries = 0usize;
        let scan = (|| -> Result<(), String> {
            let dir = folder(self, false)?;
            let reader = match fs::read_dir(dir) {
                Ok(reader) => reader,
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
                Err(_) => return Err("No se puede leer el catálogo personal".into()),
            };
            let mut paths = Vec::new();
            for entry in reader {
                let entry = entry.map_err(|_| "No se puede leer una entrada del catálogo")?;
                if matches!(
                    entry.file_name().to_str(),
                    Some("owner.lock" | "runtime-owner.lock" | "capture.lock")
                ) {
                    continue;
                }
                entries += 1;
                if entries > MAX_ENTRIES {
                    return Err(
                        "El inventario de plantillas supera 256 entradas; se conserva sin cambios"
                            .into(),
                    );
                }
                paths.push(entry.path());
            }
            paths.sort();
            for path in paths {
                let size = fs::symlink_metadata(&path)
                    .map_err(|_| "No se puede consultar una entrada de plantilla")?
                    .len();
                bytes = bytes.saturating_add(size);
                if bytes > MAX_TOTAL {
                    return Err(
                        "El inventario de plantillas supera 16 MiB; se conserva sin cambios".into(),
                    );
                }
                match read(&path) {
                    Ok((record, data)) => templates.push(view(&record, &sha256_hex(&data), false)),
                    Err(error) => warnings.push(json!({"message":error})),
                }
            }
            Ok(())
        })();
        if let Err(error) = scan {
            warnings.push(json!({"message":error}));
        }
        json!({"templates":templates,"complete":warnings.is_empty(),"warnings":warnings,"scannedEntries":entries,"scannedBytes":bytes})
    }
    pub(crate) fn document_template(&self, id: &str) -> Result<Value, String> {
        if let Some(template) = builtin(id, true) {
            return Ok(template);
        }
        let (record, bytes) = read(&record_path(self, id)?)?;
        Ok(view(&record, &sha256_hex(&bytes), true))
    }
    pub(crate) fn capture_document_template(&self, body: Value) -> Result<Value, String> {
        let input:Capture=serde_json::from_value(body).map_err(|_|"La plantilla necesita nombre, descripción y contenido documental; no admite estado adicional")?;
        if !input.resources.is_empty() && !input.reviewed_resources {
            return Err("Revisa los adjuntos y confirma que su contenido puede reutilizarse antes de guardar la plantilla".into());
        }
        let record = Record {
            schema_version: if input.resources.is_empty() { 1 } else { 2 },
            id: format!("custom-{}", knownext_core::compact_id("template")),
            name: input.name.trim().into(),
            description: input.description.trim().into(),
            markdown: input.markdown,
            resources: input.resources,
            created_at: knownext_core::now_iso(),
        };
        validate(&record)?;
        let bytes = serde_json::to_vec_pretty(&record).map_err(|e| e.to_string())?;
        if bytes.len() as u64 > MAX_FILE {
            return Err("La plantilla supera 16 MiB serializada".into());
        }
        let inventory = self.document_templates();
        if inventory["templates"]
            .as_array()
            .into_iter()
            .flatten()
            .any(|item| {
                item["builtIn"] == false
                    && item["name"]
                        .as_str()
                        .is_some_and(|name| name.to_lowercase() == record.name.to_lowercase())
            })
        {
            return Err("Ya existe una plantilla personal con ese nombre. Elige otro nombre para conservar ambas.".into());
        }
        if inventory["complete"] != true
            || inventory["scannedEntries"].as_u64().unwrap_or(0) >= MAX_ENTRIES as u64
            || inventory["scannedBytes"]
                .as_u64()
                .unwrap_or(MAX_TOTAL)
                .saturating_add(bytes.len() as u64)
                > MAX_TOTAL
        {
            return Err("No se puede ampliar el catálogo personal: revisa sus avisos o su presupuesto. Los archivos existentes se conservan.".into());
        }
        let path = record_path(self, &record.id)?;
        fs::create_dir_all(path.parent().unwrap()).map_err(|e| e.to_string())?;
        atomic_io::create(&path, &bytes).map_err(|e| e.to_string())?;
        Ok(view(&record, &sha256_hex(&bytes), true))
    }
    pub(crate) fn render_document_template(
        &self,
        id: &str,
        body: Value,
        create: bool,
    ) -> Result<Value, String> {
        let input: Render =
            serde_json::from_value(body).map_err(|_| "Solicitud de plantilla no válida")?;
        let template = self.document_template(id)?;
        if template["revision"] != input.revision {
            return Err("La plantilla cambió desde que la revisaste. Vuelve a cargarla antes de crear el documento.".into());
        }
        self.registry_checked()?;
        let project = self
            .list_projects()
            .into_iter()
            .find(|project| project["id"].as_str() == Some(input.project_id.as_str()))
            .ok_or("El proyecto no está disponible")?;
        let root = self
            .project_root(&input.project_id)?
            .canonicalize()
            .map_err(|_| "La carpeta del proyecto no está disponible")?;
        let project_root_hash = sha256_hex(root.to_string_lossy().as_bytes());
        let name = input.name.trim();
        if name.is_empty()
            || name.len() > 240
            || name.contains(['/', '\\'])
            || name.contains('\0')
            || !name.to_ascii_lowercase().ends_with(".md")
            || name.eq_ignore_ascii_case(".md")
        {
            return Err("El documento necesita un nombre Markdown válido, sin carpetas".into());
        }
        let markdown = template["markdown"]
            .as_str()
            .ok_or("La plantilla no contiene texto")?;
        let keys = variables(markdown)?;
        if input.values.len() > 32
            || input
                .values
                .iter()
                .any(|(k, v)| !keys.contains(k) || v.len() > 16384 || v.contains('\0'))
        {
            return Err(
                "Hay campos desconocidos o valores demasiado largos en la plantilla".into(),
            );
        }
        let mut values = input.values;
        let local_date = if let Some(date) = input.local_date {
            let format = time::format_description::parse("[year]-[month]-[day]")
                .map_err(|_| "No se puede preparar el formato de fecha")?;
            if date.len() != 10 || time::Date::parse(&date, &format).is_err() {
                return Err("La fecha del dispositivo no es una fecha de calendario válida".into());
            }
            date
        } else {
            knownext_core::now_iso()[..10].to_owned()
        };
        let stem = &name[..name.len() - 3];
        for (key, value) in [
            ("titulo", stem.replace('-', " ")),
            ("fecha", local_date),
            (
                "proyecto",
                project["name"].as_str().unwrap_or("").to_owned(),
            ),
        ] {
            if keys.iter().any(|k| k == key) {
                values.entry(key.into()).or_insert(value);
            }
        }
        if let Some(key) = keys
            .iter()
            .find(|k| values.get(*k).is_none_or(|v| v.trim().is_empty()))
        {
            return Err(format!(
                "Completa el campo {{{{{key}}}}} antes de crear el documento"
            ));
        }
        let mut rendered = String::with_capacity(markdown.len());
        let mut offset = 0;
        for (start, end, key) in placeholders(markdown) {
            rendered.push_str(&markdown[offset..start]);
            rendered.push_str(&values[&key]);
            offset = end;
            if rendered.len() > 2 * MAX_MARKDOWN {
                return Err("El documento generado supera 2 MiB".into());
            }
        }
        rendered.push_str(&markdown[offset..]);
        if rendered.len() > 2 * MAX_MARKDOWN {
            return Err("El documento generado supera 2 MiB".into());
        }
        let resources: Vec<Attachment> = serde_json::from_value(
            template
                .get("resources")
                .cloned()
                .unwrap_or_else(|| json!([])),
        )
        .map_err(|_| "Recursos de plantilla no compatibles")?;
        attachments::validate(&resources, &rendered)?;
        portable_with_resources(&rendered, false, &resources)?;
        let materialized = attachments::render_links(&rendered, &resources)?;
        if create {
            if template["builtIn"] != true
                && input.project_root_hash.as_deref() != Some(project_root_hash.as_str())
            {
                return Err("El proyecto cambió desde la vista previa. Revisa de nuevo el destino antes de crear el documento.".into());
            }
            let parent = self.node_relative(&input.project_id, input.parent_id.as_deref())?;
            if let Some(parent) = parent {
                let dir = self.resolve_project_relative(&input.project_id, &parent)?;
                if !dir.is_dir() {
                    return Err("La carpeta de destino no está disponible".into());
                }
            }
            attachments::publish(
                self,
                &input.project_id,
                input.parent_id.as_deref(),
                name,
                &resources,
            )?;
            return self.create_document(
                &input.project_id,
                json!({"parentId":input.parent_id,"name":name,"markdown":materialized}),
            );
        }
        Ok(
            json!({"templateId":id,"revision":template["revision"],"markdown":materialized,"values":values,"name":name,"projectRootHash":project_root_hash,"resources":resources.iter().map(attachments::summary).collect::<Vec<_>>()}),
        )
    }
    pub(crate) fn retire_document_template(&self, id: &str, body: Value) -> Result<Value, String> {
        if builtin(id, false).is_some() {
            return Err("Las plantillas iniciales se mantienen disponibles".into());
        }
        if body.as_object().is_none_or(|obj| obj.len() != 1) {
            return Err("Retirar requiere únicamente la revisión observada".into());
        }
        let path = record_path(self, id)?;
        let (_, bytes) = read(&path)?;
        let revision = sha256_hex(&bytes);
        if body["revision"] != revision {
            return Err("La plantilla cambió; vuelve a revisarla antes de retirarla".into());
        }
        let archive = folder(self, true)?;
        fs::create_dir_all(&archive).map_err(|e| e.to_string())?;
        let copy = archive.join(format!("{}-{revision}.json", sha256_hex(id.as_bytes())));
        match atomic_io::create(&copy, &bytes) {
            Ok(()) => (),
            Err(_) if read_bytes(&copy).ok().as_deref() == Some(bytes.as_slice()) => (),
            Err(error) => {
                return Err(format!(
                    "No se pudo conservar la plantilla antes de retirarla: {error}"
                ))
            }
        }
        let (_, current) = read(&path)?;
        if current != bytes {
            return Err("La plantilla cambió al retirarla; se conservan ambas versiones".into());
        }
        fs::remove_file(path).map_err(|e| e.to_string())?;
        Ok(json!({"id":id,"retired":true,"archived":true,"completedAt":knownext_core::now_iso()}))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture() -> (tempfile::TempDir, LocalApi, String, PathBuf) {
        let dir = tempfile::tempdir().unwrap();
        let api = LocalApi::new(dir.path().join("state"), "test".into(), "test".into());
        let root = dir.path().join("project");
        let id = api
            .create_project(json!({"name":"Proyecto QA","folderPath":root,"versioningMode":"none"}))
            .unwrap()["id"]
            .as_str()
            .unwrap()
            .to_owned();
        (dir, api, id, root)
    }
    #[test]
    fn creates_two_documents_with_reviewed_fields_without_overwriting() {
        let (_dir, api, project, root) = fixture();
        let saved=api.capture_document_template(json!({"name":"Acta de equipo","markdown":"# {{titulo}}\n\n{{fecha}} · {{proyecto}}\n\n## Participantes\n{{asistentes}}"})).unwrap();
        let id = saved["id"].as_str().unwrap();
        for (name, attendees) in [
            ("Acta uno.md", "Ana y Jon"),
            ("Acta dos.md", "Miren y Unai"),
        ] {
            let mut body = json!({"projectId":project,"name":name,"revision":saved["revision"],"values":{"asistentes":attendees}});
            let preview = api
                .render_document_template(id, body.clone(), false)
                .unwrap();
            body["projectRootHash"] = preview["projectRootHash"].clone();
            api.render_document_template(id, body.clone(), true)
                .unwrap();
            assert_eq!(
                fs::read_to_string(root.join(name)).unwrap(),
                preview["markdown"].as_str().unwrap()
            );
            assert!(api.render_document_template(id, body, true).is_err());
            assert!(preview["markdown"].as_str().unwrap().contains(attendees));
        }
        let restarted = LocalApi::new(api.app_data_dir.clone(), "test".into(), "test".into());
        assert_eq!(restarted.document_template(id).unwrap(), saved);
    }
    #[test]
    fn variables_are_bounded_single_pass_and_never_evaluated() {
        assert_eq!(
            variables(r"{{cliente}} {{cliente}} \{{literal}} {{otro_2}} {{no valido}}").unwrap(),
            vec!["cliente", "otro_2"]
        );
        let (_dir, api, project, _root) = fixture();
        let saved = api
            .capture_document_template(
                json!({"name":"Variables","markdown":"{{cliente}} / {{otro}}"}),
            )
            .unwrap();
        let id = saved["id"].as_str().unwrap();
        let mut body = json!({"projectId":project,"name":"Variables.md","revision":saved["revision"],"values":{"cliente":"{{otro}} $(nunca)","otro":"Literal"}});
        assert_eq!(
            api.render_document_template(id, body.clone(), false)
                .unwrap()["markdown"],
            "{{otro}} $(nunca) / Literal"
        );
        body["values"]["extra"] = json!("no");
        assert!(api
            .render_document_template(id, body.clone(), false)
            .is_err());
        body["values"] = json!({"cliente":"Ana"});
        assert!(api
            .render_document_template(id, body.clone(), true)
            .unwrap_err()
            .contains("otro"));
        body["values"] = json!({"cliente":"Ana","otro":"Literal"});
        body["revision"] = json!("changed");
        assert!(api
            .render_document_template(id, body, true)
            .unwrap_err()
            .contains("cambió"));
    }
    #[test]
    fn rejects_local_assets_unknown_capture_fields_and_unsafe_destinations() {
        let (_dir, api, project, root) = fixture();
        for markdown in [
            "![Imagen](assets/foto.png)",
            "[Documento](otro.md)",
            "<img src=\"file:///privado.png\">",
            "[Fuente][ref]\n\n[ref]: ../fuente.pdf",
            "![Imagen][ref]\n\n[ref]: https://example.invalid/image.png",
            "<img src=\"https://example.invalid/image.png\">",
            "<file:///fuera.md>",
        ] {
            assert!(api
                .capture_document_template(json!({"name":"Con recurso","markdown":markdown}))
                .is_err());
        }
        assert!(api
            .capture_document_template(
                json!({"name":"No","markdown":"Texto","config":{"key":"never"}})
            )
            .is_err());
        let template = api.document_template("blank").unwrap();
        for name in ["../fuera.md", ".md", "sub/archivo.md", "archivo.txt"] {
            assert!(api
                .render_document_template(
                    "blank",
                    json!({"projectId":project,"name":name,"revision":template["revision"]}),
                    true
                )
                .is_err());
        }
        assert!(!root.parent().unwrap().join("fuera.md").exists());
    }
    #[test]
    fn damaged_or_future_catalog_is_preserved_and_builtins_remain_available() {
        let (_dir, api, _project, _root) = fixture();
        let dir = folder(&api, false).unwrap();
        fs::create_dir_all(&dir).unwrap();
        let file = dir.join("future.json");
        let bytes = b"{\"schemaVersion\":99,\"markdown\":\"keep\"}";
        fs::write(&file, bytes).unwrap();
        let list = api.document_templates();
        assert_eq!(list["complete"], false);
        assert_eq!(list["templates"].as_array().unwrap().len(), 4);
        assert!(api.document_template("meeting").is_ok());
        assert!(api
            .capture_document_template(json!({"name":"New","markdown":"Text"}))
            .is_err());
        assert_eq!(fs::read(file).unwrap(), bytes);
    }
    #[test]
    fn retirement_preserves_original_template_and_derived_documents() {
        let (_dir, api, project, root) = fixture();
        let saved = api
            .capture_document_template(json!({"name":"Texto","markdown":"# {{titulo}}"}))
            .unwrap();
        let id = saved["id"].as_str().unwrap();
        let mut body =
            json!({"projectId":project,"name":"Derivado.md","revision":saved["revision"]});
        let preview = api
            .render_document_template(id, body.clone(), false)
            .unwrap();
        body["projectRootHash"] = preview["projectRootHash"].clone();
        api.render_document_template(id, body, true).unwrap();
        assert!(api
            .retire_document_template(id, json!({"revision":"old"}))
            .is_err());
        api.retire_document_template(id, json!({"revision":saved["revision"]}))
            .unwrap();
        assert!(root.join("Derivado.md").exists());
        assert!(api.document_template(id).is_err());
        let archived = fs::read_dir(folder(&api, true).unwrap())
            .unwrap()
            .next()
            .unwrap()
            .unwrap()
            .path();
        let record: Record = serde_json::from_slice(&fs::read(archived).unwrap()).unwrap();
        assert_eq!(record.markdown, "# {{titulo}}");
    }
    #[test]
    fn a_repointed_project_does_not_receive_a_document_from_an_older_preview() {
        let (dir, api, project, root) = fixture();
        let saved = api
            .capture_document_template(json!({"name":"Reviewed","markdown":"# Texto"}))
            .unwrap();
        let id = saved["id"].as_str().unwrap();
        let mut body =
            json!({"projectId":project,"name":"Reviewed.md","revision":saved["revision"]});
        let preview = api
            .render_document_template(id, body.clone(), false)
            .unwrap();
        body["projectRootHash"] = preview["projectRootHash"].clone();
        let changed = dir.path().join("different-root");
        fs::create_dir_all(&changed).unwrap();
        api.update_project_fields(&project, |record| {
            record["folderPath"] = json!(changed);
        })
        .unwrap();
        assert!(api
            .render_document_template(id, body, true)
            .unwrap_err()
            .contains("proyecto cambió"));
        assert!(!root.join("Reviewed.md").exists());
        assert!(!changed.join("Reviewed.md").exists());
    }
    #[test]
    fn calendar_defaults_use_the_devices_reviewed_day_and_reject_invalid_dates() {
        let (_dir, api, project, _root) = fixture();
        let saved = api
            .capture_document_template(json!({"name":"Calendar","markdown":"Fecha: {{fecha}}"}))
            .unwrap();
        let id = saved["id"].as_str().unwrap();
        let mut body = json!({"projectId":project,"name":"Calendar.md","revision":saved["revision"],"localDate":"2026-11-01"});
        assert_eq!(
            api.render_document_template(id, body.clone(), false)
                .unwrap()["markdown"],
            "Fecha: 2026-11-01"
        );
        body["localDate"] = json!("2026-02-30");
        assert!(api
            .render_document_template(id, body, false)
            .unwrap_err()
            .contains("calendario"));
    }
    #[test]
    fn catalog_names_and_budgets_do_not_replace_or_truncate_existing_templates() {
        let (_dir, api, _project, _root) = fixture();
        let first = api
            .capture_document_template(json!({"name":"Acta común","markdown":"Original"}))
            .unwrap();
        assert!(api
            .capture_document_template(json!({"name":" ACTA COMÚN ","markdown":"Otro contenido"}))
            .unwrap_err()
            .contains("otro nombre"));
        assert_eq!(
            api.document_template(first["id"].as_str().unwrap())
                .unwrap()["markdown"],
            "Original"
        );
        assert!(api
            .capture_document_template(
                json!({"name":"Large","markdown":"x".repeat(MAX_MARKDOWN+1)})
            )
            .is_err());
        assert!(variables(
            &(0..33)
                .map(|index| format!("{{{{campo_{index}}}}}"))
                .collect::<String>()
        )
        .is_err());
        let huge = folder(&api, false).unwrap().join("large.json");
        fs::File::create(&huge)
            .unwrap()
            .set_len(MAX_FILE + 1)
            .unwrap();
        assert_eq!(api.document_templates()["complete"], false);
        assert_eq!(fs::metadata(huge).unwrap().len(), MAX_FILE + 1);
    }
}
