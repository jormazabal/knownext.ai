//! Multi-template transport, explicit name review and per-entry outcomes. Never overwrite.
use super::transfer::Portable;
use super::*;

const MAX_SELECTION: usize = 32;
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Catalogue {
    format: String,
    schema_version: u8,
    templates: Vec<Portable>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Export {
    entries: Vec<ExportEntry>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ExportEntry {
    id: String,
    revision: String,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Import {
    content: String,
    digest: String,
    entries: Vec<ImportEntry>,
    #[serde(default, rename = "reviewedResources")]
    reviewed_resources: bool,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ImportEntry {
    index: usize,
    name: String,
}

pub(super) fn is_catalogue(content: &str) -> bool {
    content.len() as u64 <= MAX_FILE
        && serde_json::from_str::<Value>(content)
            .ok()
            .is_some_and(|v| v["format"] == "knownext.document-template-catalog")
}
pub(super) fn decode(content: &str) -> Result<Vec<Portable>, String> {
    if content.len() as u64 > MAX_FILE {
        return Err("El catálogo portable supera 16 MiB".into());
    }
    let catalogue: Catalogue = serde_json::from_str(content)
        .map_err(|_| "Catálogo portable ilegible o con campos no compatibles; se conserva")?;
    if catalogue.format != "knownext.document-template-catalog"
        || !matches!(catalogue.schema_version, 1 | 2)
        || catalogue.templates.is_empty()
        || catalogue.templates.len() > MAX_SELECTION
    {
        return Err(
            "Formato, versión o número de plantillas no compatible; se conserva el catálogo".into(),
        );
    }
    if catalogue.schema_version == 1 && catalogue.templates.iter().any(|t| t.schema_version != 1) {
        return Err("El catálogo1 no puede incluir plantillas de formato2".into());
    }
    for template in &catalogue.templates {
        transfer::decode(
            &serde_json::to_string(template)
                .map_err(|_| "No se puede revisar una plantilla del catálogo")?,
        )?;
    }
    Ok(catalogue.templates)
}
pub(super) fn inspect(content: &str) -> Result<Value, String> {
    let templates = decode(content)?;
    Ok(
        json!({"name":"Catálogo de plantillas","description":format!("{} plantillas documentales",templates.len()),"markdown":"","variables":[],"digest":sha256_hex(content.as_bytes()),"byteLength":content.len(),"catalog":templates.iter().enumerate().map(|(index,template)|json!({"index":index,"name":template.name,"description":template.description,"markdown":template.markdown,"variables":variables(&template.markdown).unwrap_or_default(),"resources":template.resources.iter().map(attachments::summary).collect::<Vec<_>>()})).collect::<Vec<_>>()}),
    )
}
impl LocalApi {
    pub fn export_document_template_catalogue(&self, body: Value) -> Result<Value, String> {
        let input: Export = serde_json::from_value(body).map_err(|_| {
            "Selecciona identidades y revisiones de plantillas, sin campos adicionales"
        })?;
        let mut ids = BTreeSet::new();
        if input.entries.is_empty()
            || input.entries.len() > MAX_SELECTION
            || input.entries.iter().any(|e| !ids.insert(&e.id))
        {
            return Err("Selecciona entre 1 y 32 plantillas diferentes".into());
        }
        let mut templates = Vec::new();
        let mut size = 0usize;
        for entry in input.entries {
            let template = self.document_template(&entry.id)?;
            if template["revision"] != entry.revision {
                return Err("Una plantilla cambió; vuelve a revisar la selección".into());
            }
            let portable = Portable {
                format: "knownext.document-template".into(),
                schema_version: if template.get("resources").is_some() {
                    2
                } else {
                    1
                },
                resources: serde_json::from_value(
                    template
                        .get("resources")
                        .cloned()
                        .unwrap_or_else(|| json!([])),
                )
                .map_err(|_| "Recursos de plantilla no compatibles")?,
                name: template["name"].as_str().unwrap_or_default().into(),
                description: template["description"].as_str().unwrap_or_default().into(),
                markdown: template["markdown"].as_str().unwrap_or_default().into(),
            };
            size = size.saturating_add(
                serde_json::to_vec(&portable)
                    .map_err(|_| "No se puede medir una plantilla")?
                    .len(),
            );
            if size as u64 > MAX_FILE {
                return Err("La selección supera 16 MiB; comparte un grupo menor".into());
            }
            templates.push(portable);
        }
        let content = serde_json::to_string_pretty(&Catalogue {
            format: "knownext.document-template-catalog".into(),
            schema_version: if templates.iter().any(|t| t.schema_version == 2) {
                2
            } else {
                1
            },
            templates,
        })
        .map_err(|_| "No se pudo preparar el catálogo")?;
        decode(&content)?;
        Ok(
            json!({"fileName":"Catálogo KnowNext.json","content":content,"digest":sha256_hex(content.as_bytes()),"byteLength":content.len()}),
        )
    }

    pub(crate) fn review_document_template_catalogue(
        &self,
        body: Value,
        apply: bool,
    ) -> Result<Value, String> {
        let input: Import = serde_json::from_value(body)
            .map_err(|_| "La revisión necesita archivo, digest y nombres elegidos")?;
        if input.content.len() as u64 > MAX_FILE
            || sha256_hex(input.content.as_bytes()) != input.digest
        {
            return Err("El catálogo cambió desde la revisión; vuelve a elegirlo".into());
        }
        let templates = decode(&input.content)?;
        let mut indices = BTreeSet::new();
        let mut names = BTreeSet::new();
        if input.entries.is_empty()
            || input.entries.len() > MAX_SELECTION
            || input.entries.iter().any(|entry| {
                entry.index >= templates.len()
                    || !indices.insert(entry.index)
                    || !names.insert(entry.name.trim().to_lowercase())
            })
        {
            return Err("Selecciona hasta 32 entradas distintas con nombres distintos".into());
        }
        if apply
            && !input.reviewed_resources
            && input
                .entries
                .iter()
                .any(|entry| !templates[entry.index].resources.is_empty())
        {
            return Err(
                "Revisa los adjuntos seleccionados antes de incorporarlos al catálogo".into(),
            );
        }
        let inventory = self.document_templates();
        if inventory["complete"] != true {
            return Err(
                "El catálogo local tiene entradas sin revisar; se conserva y no se amplía".into(),
            );
        }
        let mut outcomes = Vec::new();
        let mut pending = Vec::new();
        let mut additional = 0u64;
        for entry in input.entries {
            let portable = &templates[entry.index];
            let record = Record {
                schema_version: portable.schema_version,
                resources: portable.resources.clone(),
                id: format!("custom-{}", knownext_core::compact_id("template")),
                name: entry.name.trim().into(),
                description: portable.description.clone(),
                markdown: portable.markdown.clone(),
                created_at: knownext_core::now_iso(),
            };
            validate(&record)?;
            let existing = inventory["templates"]
                .as_array()
                .into_iter()
                .flatten()
                .find(|item| {
                    item["builtIn"] == false
                        && item["name"]
                            .as_str()
                            .is_some_and(|name| name.to_lowercase() == record.name.to_lowercase())
                });
            if let Some(existing) = existing {
                let current = self.document_template(
                    existing["id"].as_str().ok_or("Identidad local no válida")?,
                )?;
                let same = current["name"] == record.name
                    && current["description"] == record.description
                    && current["markdown"] == record.markdown
                    && current
                        .get("resources")
                        .cloned()
                        .unwrap_or_else(|| json!([]))
                        == json!(record.resources);
                outcomes.push(json!({"index":entry.index,"name":record.name,"status":if same{"existing"}else{"conflict"},"template":if same{current}else{Value::Null},"message":if same{"Ya está en tu catálogo con el mismo contenido; no se repite"}else{"El nombre pertenece a otra plantilla. Cambia el nombre para conservar ambas"}}));
                continue;
            }
            let bytes = serde_json::to_vec_pretty(&record)
                .map_err(|_| "No se pudo preparar la entrada de catálogo")?;
            if bytes.len() as u64 > MAX_FILE {
                return Err("Una plantilla supera 16 MiB serializada".into());
            }
            additional = additional.saturating_add(bytes.len() as u64);
            pending.push((entry.index, record, bytes));
        }
        let capacity = inventory["scannedEntries"]
            .as_u64()
            .unwrap_or(MAX_ENTRIES as u64)
            .saturating_add(pending.len() as u64)
            <= MAX_ENTRIES as u64
            && inventory["scannedBytes"]
                .as_u64()
                .unwrap_or(MAX_TOTAL)
                .saturating_add(additional)
                <= MAX_TOTAL;
        for (index, record, bytes) in pending {
            let mut status = if capacity { "new" } else { "blocked" };
            let mut message = if capacity {
                "Nombre disponible; se creará una plantilla nueva".to_owned()
            } else {
                "El grupo supera la capacidad local; reduce la selección. No se ha creado esta entrada".to_owned()
            };
            let mut template = Value::Null;
            if apply && capacity {
                let result = (|| {
                    let path = record_path(self, &record.id)?;
                    fs::create_dir_all(path.parent().ok_or("Catálogo sin carpeta")?)
                        .map_err(|_| "No se puede preparar la carpeta de plantillas")?;
                    atomic_io::create(&path, &bytes).map_err(|_| {
                        "No se pudo confirmar la creación; revisa el catálogo antes de continuar"
                    })?;
                    Ok::<(), String>(())
                })();
                match result {
                    Ok(()) => {
                        status = "imported";
                        message = "Plantilla nueva confirmada".into();
                        template = view(&record, &sha256_hex(&bytes), true);
                    }
                    Err(error) => {
                        status = "unconfirmed";
                        message = error;
                    }
                }
            }
            outcomes.push(json!({"index":index,"name":record.name,"status":status,"message":message,"template":template}));
        }
        outcomes.sort_by_key(|entry| entry["index"].as_u64().unwrap_or(u64::MAX));
        Ok(
            json!({"id":knownext_core::compact_id(if apply{"template-catalog-import"}else{"template-catalog-review"}),"checkedAt":knownext_core::now_iso(),"applied":apply,"digest":input.digest,"outcomes":outcomes,"limits":{"selection":MAX_SELECTION,"fileBytes":MAX_FILE,"catalogBytes":MAX_TOTAL,"catalogEntries":MAX_ENTRIES}}),
        )
    }
}
