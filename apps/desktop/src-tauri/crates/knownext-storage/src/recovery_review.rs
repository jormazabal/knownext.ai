//! Read-only recovery inventory and explicit, fingerprint-checked preservation.
use super::*;
use std::{fs, io::Read, time::Instant};

const MAX_FILE: u64 = 64 * 1024 * 1024;
const MAX_TOTAL: u64 = 64 * 1024 * 1024;
const MAX_ENTRIES: usize = 1000;

fn private_directory(path: &Path) -> Result<(), String> {
    match fs::symlink_metadata(path) {
        Ok(meta) if !meta.is_dir() || batch::linked(&meta) => {
            Err("El almacén privado no es una carpeta regular. Se conserva sin cambios.".into())
        }
        Ok(_) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(_) => Err("No se puede consultar el almacén privado".into()),
    }
}

fn source_path(root: &Path, key: &str) -> Result<PathBuf, String> {
    if key.is_empty()
        || key.len() > 240
        || !key.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'_')
    {
        return Err("Identificador de recuperación no válido".into());
    }
    Ok(root.join(format!("{key}.json")))
}

fn read_bytes(path: &Path) -> Result<Vec<u8>, String> {
    let mut budget = MAX_FILE + 1;
    read_budgeted(path, MAX_FILE, &mut budget)
}

fn read_budgeted(path: &Path, max_file: u64, budget: &mut u64) -> Result<Vec<u8>, String> {
    let meta = fs::symlink_metadata(path).map_err(|_| "No se puede consultar la copia")?;
    if !meta.is_file() || batch::linked(&meta) || meta.len() > max_file {
        return Err(
            "La copia no es un archivo regular permitido o supera el límite de lectura. Se conserva sin cambios."
                .into(),
        );
    }
    let mut bytes = Vec::new();
    if meta.len() > *budget {
        return Err(
            "La copia supera el presupuesto de esta revisión. Se conserva sin cambios.".into(),
        );
    }
    let result = fs::File::open(path)
        .map_err(|_| "No se puede leer la copia")?
        .take((max_file + 1).min(budget.saturating_add(1)))
        .read_to_end(&mut bytes);
    let exhausted = bytes.len() as u64 > *budget;
    *budget = budget.saturating_sub(bytes.len() as u64);
    result.map_err(|_| "No se puede leer la copia")?;
    if bytes.len() as u64 > max_file || exhausted {
        return Err("La copia supera el límite de esta lectura. Se conserva sin cambios.".into());
    }
    Ok(bytes)
}

fn hash(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn content_kind(value: &Value) -> Option<&'static str> {
    if value.get("schemaVersion").is_some_and(|version|version.as_u64()!=Some(1)){return None}
    let (_, relative) = document_ref(value["documentId"].as_str()?).ok()?;
    if is_markdown_path(Path::new(&relative)) && value["markdown"].is_string() {
        Some("document")
    } else if is_handwritten_note_path(Path::new(&relative)) && document_validation::handwritten(&value["content"]).is_ok()
    {
        Some("handwritten-note")
    } else {
        None
    }
}

pub(crate) fn archive_folder(root: &Path, key: &str) -> Result<PathBuf, String> {
    if !key.starts_with("recovery-")
        || key.len() > 120
        || !key.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'-')
    {
        return Err("Identificador de archivo privado no válido".into());
    }
    private_directory(root)?;
    let folder = root.join(key);
    private_directory(&folder)?;
    Ok(folder)
}

fn archive_bytes(root: &Path, key: &str) -> Result<Vec<u8>, String> {
    let mut budget = 2 * (MAX_FILE + 16 * 1024 + 1);
    archive_budgeted(root, key, &mut budget)
}

fn checked_manifest(raw:&[u8],key:&str)->Result<Value,String>{
    let value:Value=serde_json::from_slice(raw).map_err(|_|"El registro de la copia archivada no se puede leer")?;
    let object=value.as_object().ok_or("El registro de la copia tiene un formato desconocido; se conserva")?;
    let fields=["schemaVersion","id","sourceKey","fingerprint","bytes","archivedAt","retention","operationId","reason"];
    if object.keys().any(|key|!fields.contains(&key.as_str()))||value.get("schemaVersion").is_some_and(|version|version.as_u64()!=Some(1)){
        return Err("Versión o campos del registro de recuperación no compatibles; copia y registro se conservan sin cambios".into());
    }
    let source=value["sourceKey"].as_str().ok_or("Falta la identidad de origen de la copia")?;
    source_path(Path::new(""),source)?;
    if !value["fingerprint"].as_str().is_some_and(|s|s.len()==64&&s.bytes().all(|b|b.is_ascii_hexdigit())){return Err("La huella del registro no es válida".into());}
    if value["id"]!=key||value["retention"]!="manual-no-auto-expiry"||value["bytes"].as_u64().is_none_or(|n|n>MAX_FILE){return Err("El registro de recuperación no tiene identidad, tamaño o conservación compatibles; se conserva".into());}
    let date=value["archivedAt"].as_str().ok_or("Falta la fecha del registro de recuperación")?;
    OffsetDateTime::parse(date,&Rfc3339).map_err(|_|"La fecha del registro de recuperación no es válida")?;
    for field in ["operationId","reason"]{if let Some(v)=value.get(field){if !v.as_str().is_some_and(|s|!s.is_empty()&&s.len()<=512&&!s.chars().any(char::is_control)){return Err("La procedencia de la copia no tiene un formato conocido; se conserva".into());}}}
    if value.get("operationId").is_some()!=value.get("reason").is_some(){return Err("La procedencia de la copia no está completa; se conserva".into());}
    Ok(value)
}

fn archive_budgeted(root: &Path, key: &str, budget: &mut u64) -> Result<Vec<u8>, String> {
    archive_bundle_budgeted(root,key,budget).map(|(bytes,_)|bytes)
}
pub(crate) fn archive_bundle_budgeted(root: &Path, key: &str, budget: &mut u64) -> Result<(Vec<u8>,Value), String> {
    let folder = archive_folder(root, key)?;
    let original_manifest=read_budgeted(
        &folder.join("manifest.json"),
        16 * 1024,
        budget,
    )?;
    let manifest=checked_manifest(&original_manifest,key)?;
    let bytes = recovery_copy_storage::read(&folder, MAX_FILE, budget)?;
    if manifest["fingerprint"] != hash(&bytes) || manifest["bytes"].as_u64()!=Some(bytes.len() as u64) {
        return Err(
            "La copia archivada no coincide con su registro. Se conserva sin cambios.".into(),
        );
    }
    if read_budgeted(&folder.join("manifest.json"),16*1024,budget)?!=original_manifest
        || hash(&recovery_copy_storage::read(&folder,MAX_FILE,budget)?)!=hash(&bytes){
        return Err("La copia o su registro cambiaron durante la revisión. Actualiza antes de continuar; se conservan sin sustituir.".into());
    }
    Ok((bytes,manifest))
}

fn conflict_provenance<'a>(manifest:&'a Value,value:&Value)->(Option<&'a str>,Option<&'static str>){
    let Some(id)=value["documentId"].as_str().filter(|id|document_ref(id).is_ok()) else{return(None,None)};
    if value.get("schemaVersion").is_some_and(|version|version.as_u64()!=Some(1))||manifest["sourceKey"]!=format!("v2_{}",sha256_hex(id.as_bytes())){return(None,None)}
    let Some(operation)=manifest["operationId"].as_str().filter(|id|id.starts_with("conflict-")&&id.len()<=120&&request_scope::portable_id(id)) else{return(None,None)};
    let role=match manifest["reason"].as_str(){Some("conflict-local")=>Some("local"),Some("conflict-disk")=>Some("disk"),Some("conflict-proposed")=>Some("proposal"),Some(reason) if reason.strip_prefix("conflict-remote-").is_some_and(version_history::is_commit_id)=>Some("remote"),_=>None};
    if role.is_some(){(Some(operation),role)}else{(None,None)}
}

impl LocalApi {
    pub(crate) fn verified_conflict_copy(&self,key:&str,document:&str,operation:&str,budget:&mut u64)->Result<(String,String),String>{
        self.conflict_copy_bundle(key,document,operation,budget).map(|(content,manifest,_,_)|(content,manifest))
    }
    pub(crate) fn conflict_copy_review(&self,key:&str,document:&str,operation:&str,budget:&mut u64)->Result<(String,String,Value),String>{
        let(content_hash,manifest_hash,value,manifest)=self.conflict_copy_bundle(key,document,operation,budget)?;
        let(_,relative)=document_ref(document)?;let (_,role)=conflict_provenance(&manifest,&value);let kind=content_kind(&value);
        let row=json!({"key":key,"source":"archive","operationId":operation,"variantRole":role,"fingerprint":content_hash,"bytes":manifest["bytes"],"documentId":document,"name":relative.rsplit('/').next(),"path":relative,"projectName":null,"kind":kind,"state":"archived","reason":"Copia vinculada al recibo de combinación. Recuperar como otro archivo conserva las demás versiones.","canCopy":kind.is_some(),"canArchive":false,"updatedAt":value["draftUpdatedAt"]});
        Ok((content_hash,manifest_hash,row))
    }
    pub(crate) fn conflict_copy_bundle(&self,key:&str,document:&str,operation:&str,budget:&mut u64)->Result<(String,String,Value,Value),String>{
        let root=self.app_data_dir.join("drafts-review");let folder=archive_folder(&root,key)?;
        let raw=read_budgeted(&folder.join("manifest.json"),16*1024,budget)?;
        let(bytes,manifest)=archive_bundle_budgeted(&root,key,budget)?;
        let value:Value=serde_json::from_slice(&bytes).map_err(|_|"La copia no contiene un formato revisable")?;
        if value["documentId"]!=document||conflict_provenance(&manifest,&value).0!=Some(operation)||read_budgeted(&folder.join("manifest.json"),16*1024,budget)?!=raw{return Err("La copia no confirma la procedencia del intento; se conserva sin aplicar".into());}
        Ok((sha256_hex(&bytes),sha256_hex(&raw),value,manifest))
    }
    pub(super) fn archived_drafts(&self) -> Result<Value, String> {
        let root = self.app_data_dir.join("drafts-review");
        private_directory(&root)?;
        let entries = match fs::read_dir(&root) {
            Ok(e) => Some(e),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => None,
            Err(_) => return Err("No se puede consultar el archivo privado de revisión".into()),
        };
        let start = Instant::now();
        let mut budget = MAX_TOTAL;
        let mut scanned = 0;
        let mut limited = false;
        let mut rows = vec![];
        let mut warnings = vec![];
        if let Some(entries) = entries {
            for entry in entries {
                if scanned >= MAX_ENTRIES || budget == 0 || start.elapsed() > Duration::from_secs(2)
                {
                    limited = true;
                    break;
                }
                scanned += 1;
                let Ok(entry) = entry else {
                    if warnings.len() < 50 {
                        warnings.push("No se pudo consultar una copia apartada.");
                    }
                    continue;
                };
                let key = entry.file_name().to_str().unwrap_or("").to_owned();
                let size = fs::symlink_metadata(entry.path().join("copy.json"))
                    .map(|m| m.len())
                    .unwrap_or(0);
                if size > budget {
                    limited = true;
                    continue;
                }
                let result = archive_bundle_budgeted(&root, &key, &mut budget);
                if budget == 0 || (result.is_err() && size > budget) {
                    limited = true;
                }
                let value: Value = result
                    .as_ref()
                    .ok()
                    .and_then(|(bytes,_)| serde_json::from_slice(bytes).ok())
                    .unwrap_or(Value::Null);
                let relative = value["documentId"]
                    .as_str()
                    .and_then(|id| document_ref(id).ok())
                    .map(|(_, relative)| relative);
                let kind = content_kind(&value);
                let (operation,role)=result.as_ref().ok().map(|(_,manifest)|conflict_provenance(manifest,&value)).unwrap_or((None,None));
                let reason=if result.as_ref().ok().is_some_and(|(_,manifest)|manifest["reason"]=="portable-draft-import"){"Borrador traído de un archivo portable. Se conserva su original y puede recuperarse como otro archivo.".into()}else if result.as_ref().ok().is_some_and(|(_,manifest)|manifest["reason"]=="concurrent-draft-local"){ "Edición abierta conservada al no poder sustituir el borrador guardado. Recuperar como otro archivo mantiene ambas versiones.".to_string() }else{value["historySource"]["versionId"].as_str().filter(|id|version_history::is_commit_id(id)).map(|id|format!("Propuesta de restauración parcial desde {}. Incluye el contenido histórico revisado; recuperar como otro archivo mantiene esta copia.",&id[..8])).unwrap_or_else(||"Copia apartada conservada sin caducidad automática. Recuperar como otro archivo mantiene esta copia.".into())};
                let can_inspect_unverified=result.is_err()&&archive_folder(&root,&key).is_ok();
                let size=result.as_ref().ok().map(|(bytes,_)|bytes.len() as u64).unwrap_or(size);
                rows.push(json!({"key":key,"source":"archive","operationId":operation,"variantRole":role,"fingerprint":result.as_ref().ok().map(|(bytes,_)|hash(bytes)),"bytes":size,"documentId":value["documentId"].as_str(),"name":relative.as_deref().and_then(|r|r.rsplit('/').next()).unwrap_or("Copia sin identificar"),"path":relative,"projectName":null,"kind":kind,"state":if result.is_ok(){"archived"}else{"unreadable"},"reason":result.err().unwrap_or(reason),"canCopy":kind.is_some(),"canArchive":false,"canInspectUnverified":can_inspect_unverified,"updatedAt":value["draftUpdatedAt"].as_str()}));
            }
        }
        Ok(
            json!({"items":rows,"activeCount":0,"archivedCount":rows.len(),"scannedFiles":scanned,"limited":limited,"warnings":warnings,"queriedAt":knownext_core::now_iso()}),
        )
    }

    pub(super) fn recovery_drafts(&self) -> Result<Value, String> {
        let root = self.app_data_dir.join("drafts");
        private_directory(&root)?;
        let start = Instant::now();
        let mut rows = Vec::new();
        let mut warnings = Vec::new();
        let mut budget = MAX_TOTAL;
        let mut scanned = 0;
        let mut limited = false;
        let entries = match fs::read_dir(&root) {
            Ok(entries) => Some(entries),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
            Err(_) => {
                return Err(
                    "No se puede revisar el almacén de recuperación. Se conserva sin cambios."
                        .into(),
                )
            }
        };
        let projects = self.list_projects();
        if let Some(entries) = entries {
            for entry in entries {
                if scanned >= MAX_ENTRIES || budget == 0 || start.elapsed() > Duration::from_secs(2)
                {
                    limited = true;
                    break;
                }
                scanned += 1;
                let Ok(entry) = entry else {
                    if warnings.len() < 50 {
                        warnings.push("No se pudo consultar una entrada del almacén.");
                    }
                    continue;
                };
                if entry.path().extension().and_then(|e| e.to_str()) != Some("json") {
                    continue;
                }
                let key = entry
                    .path()
                    .file_stem()
                    .and_then(|e| e.to_str())
                    .unwrap_or("")
                    .to_owned();
                let addressable = source_path(&root, &key).is_ok();
                let meta = fs::symlink_metadata(entry.path()).ok();
                let size = meta.as_ref().map(|m| m.len()).unwrap_or(0);
                if size > budget {
                    limited = true;
                }
                let bytes = if size <= budget {
                    read_budgeted(&entry.path(), MAX_FILE, &mut budget)
                } else {
                    Err(
                        "La copia supera el presupuesto de esta revisión. Se conserva sin cambios."
                            .into(),
                    )
                };
                if budget == 0 {
                    limited = true;
                }
                let fingerprint = bytes.as_ref().ok().map(|b| hash(b));
                let value: Value = bytes
                    .as_ref()
                    .ok()
                    .and_then(|b| serde_json::from_slice(b).ok())
                    .unwrap_or(Value::Null);
                let identity = value["documentId"]
                    .as_str()
                    .and_then(|id| document_ref(id).ok());
                let kind = content_kind(&value);
                let mut state = "invalid";
                let mut reason =
                    "La copia contiene datos dañados o no se puede identificar su contenido."
                        .to_owned();
                let mut name = "Copia sin identificar".to_owned();
                let mut project_name = None;
                let mut relative_path = None;
                if let Some((project, relative)) = &identity {
                    name = relative.rsplit('/').next().unwrap_or(relative).to_owned();
                    relative_path = Some(relative.clone());
                    project_name = projects
                        .iter()
                        .find(|p| p["id"] == *project)
                        .and_then(|p| p["name"].as_str())
                        .map(str::to_owned);
                    if kind.is_some() {
                        let id = value["documentId"].as_str().unwrap();
                        let expected = draft_store::path(&root, id)
                            .file_stem()
                            .and_then(|s| s.to_str())
                            .unwrap_or("")
                            .to_owned();
                        let legacy = safe_name(id);
                        if key != expected && key != legacy {
                            state = "identity-mismatch";
                            reason = "El nombre de la copia no coincide con su documento. Solo se puede recuperar como un archivo nuevo.".into();
                        } else {
                            match self.resolve_document_path(id) {
                                Ok(path) if path.exists() => {
                                    if value["sourceUnavailable"]==true{state="source-unavailable";reason="La última comprobación no pudo usar la fuente. El borrador conocido se conserva y puede recuperarse como otro archivo.".into();}else{state = "active";
                                    reason = "Copia vinculada a un archivo existente.".into();}
                                }
                                Ok(_) => {
                                    state = "orphan";
                                    reason =
                                        "El archivo original ya no está en su ubicación.".into();
                                }
                                Err(_) => {
                                    state = "unavailable";
                                    reason =
                                        "El proyecto o la ruta de origen no están disponibles."
                                            .into();
                                }
                            }
                        }
                    }
                }
                if let Err(error) = &bytes {
                    state = "unreadable";
                    reason = error.clone();
                }
                let can_archive = addressable
                    && fingerprint.is_some()
                    && meta.as_ref().is_some_and(|m| !m.permissions().readonly());
                rows.push(json!({"key":key,"fingerprint":fingerprint,"bytes":size,"documentId":value["documentId"].as_str(),"name":name,"projectName":project_name,"path":relative_path,"kind":kind,"state":state,"reason":reason,"canCopy":addressable && kind.is_some() && fingerprint.is_some(),"canArchive":can_archive,"updatedAt":value["draftUpdatedAt"].as_str(),"wordCount":knownext_core::word_count(value["markdown"].as_str().unwrap_or("")),"pageCount":value["content"]["pages"].as_array().map(Vec::len)}));
            }
        }
        let mut identities = BTreeMap::<String, usize>::new();
        for row in &rows {
            if let Some(id) = row["documentId"].as_str() {
                *identities.entry(id.to_owned()).or_default() += 1;
            }
        }
        let mut active = 0;
        for row in &mut rows {
            if row["documentId"]
                .as_str()
                .is_some_and(|id| identities.get(id).copied().unwrap_or(0) > 1)
                && row["kind"].is_string()
                && matches!(row["state"].as_str(), Some("active" | "orphan"))
            {
                row["state"] = json!("variant");
                row["reason"]=json!("Hay varias copias vinculadas a este documento. Revísalas antes de elegir; ninguna se aplica automáticamente.");
            }
            if row["state"] == "active" {
                active += 1;
            }
        }
        rows.retain(|r| r["state"] != "active");
        rows.sort_by(|a, b| {
            a["name"]
                .as_str()
                .cmp(&b["name"].as_str())
                .then(a["key"].as_str().cmp(&b["key"].as_str()))
        });
        // Archived originals have no automatic expiry. Count only our private review folders.
        let archive_root = self.app_data_dir.join("drafts-review");
        private_directory(&archive_root)?;
        let archived = fs::read_dir(archive_root)
            .ok()
            .map(|e| {
                e.take(MAX_ENTRIES)
                    .filter_map(Result::ok)
                    .filter(|e| {
                        fs::symlink_metadata(e.path())
                            .is_ok_and(|m| m.is_dir() && !batch::linked(&m))
                            && e.path().join("manifest.json").is_file()
                    })
                    .count()
            })
            .unwrap_or(0);
        Ok(
            json!({"items":rows,"activeCount":active,"archivedCount":archived,"scannedFiles":scanned,"limited":limited,"warnings":warnings,"queriedAt":knownext_core::now_iso()}),
        )
    }

    fn reviewed_bytes(&self, key: &str, payload: &Value) -> Result<(PathBuf, Vec<u8>), String> {
        let expected = payload["fingerprint"]
            .as_str()
            .filter(|s| s.len() == 64)
            .ok_or("Falta la huella de la copia revisada. Actualiza antes de continuar.")?;
        let (path, bytes) = match payload["source"].as_str() {
            Some("archive") => {
                let root = self.app_data_dir.join("drafts-review");
                (
                    archive_folder(&root, key)?.join("copy.json"),
                    archive_bytes(&root, key)?,
                )
            }
            None | Some("active") => {
                let root = self.app_data_dir.join("drafts");
                private_directory(&root)?;
                let path = source_path(&root, key)?;
                let bytes = read_bytes(&path)?;
                (path, bytes)
            }
            _ => return Err("Origen de recuperación no válido".into()),
        };
        if hash(&bytes) != expected {
            return Err("La copia cambió desde la revisión. Se conserva sin cambios; actualiza antes de continuar.".into());
        }
        Ok((path, bytes))
    }

    pub(super) fn copy_reviewed_draft(&self, key: &str, payload: Value) -> Result<Value, String> {
        let (_, bytes) = self.reviewed_bytes(key, &payload)?;
        let value: Value = serde_json::from_slice(&bytes)
            .map_err(|_| "La copia no contiene datos recuperables")?;
        let kind =
            content_kind(&value).ok_or("La copia no contiene texto o trazos recuperables")?;
        let project = payload["projectId"]
            .as_str()
            .ok_or("Elige el proyecto de destino")?;
        let name = payload["name"]
            .as_str()
            .map(str::trim)
            .filter(|n| {
                !n.is_empty()
                    && n.len() <= 180
                    && !n.ends_with(['.', ' '])
                    && !n
                        .chars()
                        .any(|c| c.is_control() || "<>:\"/\\|?*".contains(c))
            })
            .ok_or("Escribe un nombre de archivo válido, sin carpetas")?;
        let path = self.resolve_project_relative(project, name)?;
        if (kind == "document" && !is_markdown_path(&path))
            || (kind == "handwritten-note" && !is_handwritten_note_path(&path))
        {
            return Err("Mantén la extensión del contenido recuperado: .md o .knote".into());
        }
        let id = doc_id(project, name);
        // A pending recovery copy at the new identity also occupies the destination.
        if self.read_draft(&id)?.is_some() {
            return Err(
                "El destino tiene otro borrador. Elige otro nombre; se conservan ambas copias."
                    .into(),
            );
        }
        let content = if kind == "document" {
            value["markdown"].as_str().unwrap().as_bytes().to_vec()
        } else {
            serde_json::to_vec_pretty(&normalize_handwritten_note(
                value["content"].clone(),
                &id,
                path.file_stem()
                    .and_then(|s| s.to_str())
                    .unwrap_or("Recuperado"),
            ))
            .map_err(|e| e.to_string())?
        };
        atomic_io::create(&path,&content).map_err(|_|"No se pudo crear la copia en un destino libre. El original y los borradores se conservan.".to_owned())?;
        let record = if kind == "document" {
            self.document_record(&id, false)?
        } else {
            self.handwritten_record(&id, false)?
        };
        // Never retire the source just because a user requested another file.
        Ok(if kind == "document" {
            json!({"kind":kind,"document":record,"recoveryWarning":null})
        } else {
            json!({"kind":kind,"note":record,"recoveryWarning":null})
        })
    }

    pub(super) fn preview_reviewed_draft(
        &self,
        key: &str,
        payload: Value,
    ) -> Result<Value, String> {
        let (_, bytes) = self.reviewed_bytes(key, &payload)?;
        let value: Value = serde_json::from_slice(&bytes)
            .map_err(|_| "La copia no contiene datos recuperables")?;
        let kind =
            content_kind(&value).ok_or("La copia no contiene texto o trazos recuperables")?;
        let (text, truncated) = if kind == "document" {
            knownext_docs::markdown_excerpt(value["markdown"].as_str().unwrap(), 2000)
        } else {
            (String::new(), false)
        };
        let pages = value["content"]["pages"].as_array();
        let strokes = pages
            .map(|pages| {
                pages
                    .iter()
                    .map(|p| p["strokes"].as_array().map(Vec::len).unwrap_or(0))
                    .sum::<usize>()
            })
            .unwrap_or(0);
        Ok(
            json!({"kind":kind,"text":text,"truncated":truncated,"pageCount":pages.map(Vec::len).unwrap_or(0),"strokeCount":strokes,"bytes":bytes.len()}),
        )
    }

    pub(super) fn archive_reviewed_draft(
        &self,
        key: &str,
        payload: Value,
    ) -> Result<Value, String> {
        if payload["source"]
            .as_str()
            .is_some_and(|source| source != "active")
        {
            return Err("Esta copia ya está en el archivo privado".into());
        }
        let (source, bytes) = self.reviewed_bytes(key, &payload)?;
        let meta = fs::symlink_metadata(&source).map_err(|_| "No se puede consultar la copia")?;
        if meta.permissions().readonly() {
            return Err("La copia es de solo lectura. Se conserva sin cambios.".into());
        }
        let archive_id = knownext_core::compact_id("recovery");
        let archive_root = self.app_data_dir.join("drafts-review");
        private_directory(&archive_root)?;
        let folder = archive_root.join(&archive_id);
        fs::create_dir_all(&folder)
            .map_err(|_| "No se puede preparar el archivo privado de revisión")?;
        atomic_io::create(&folder.join("copy.json"), &bytes)
            .map_err(|_| "No se pudo archivar la copia. El original se conserva.")?;
        let manifest = json!({"schemaVersion":1,"id":archive_id,"sourceKey":key,"fingerprint":hash(&bytes),"bytes":bytes.len(),"archivedAt":knownext_core::now_iso(),"retention":"manual-no-auto-expiry"});
        if read_bytes(&folder.join("copy.json"))? != bytes {
            return Err("No se pudo verificar la copia archivada. El original se conserva.".into());
        }
        atomic_io::create(
            &folder.join("manifest.json"),
            &serde_json::to_vec_pretty(&manifest).map_err(|e| e.to_string())?,
        )
        .map_err(|_| "No se pudo registrar el archivo. El original se conserva.")?;
        let warning=match read_bytes(&source) {
            Ok(current) if current==bytes => draft_store::discard_key(&self.app_data_dir.join("drafts"),key).err(),
            _ => Some("El original cambió o no se puede comprobar después del archivado. Se conserva la copia archivada; revisa el almacén antes de continuar.".to_owned()),
        };
        Ok(
            json!({"archiveId":archive_id,"retired":warning.is_none(),"warning":warning,"retention":"manual-no-auto-expiry"}),
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn setup() -> (tempfile::TempDir, LocalApi, String, PathBuf) {
        let temp = tempfile::tempdir().unwrap();
        let api = LocalApi::new(temp.path().join("app"), "2.6.0".into(), "test".into());
        let root = temp.path().join("project");
        let project = api
            .create_project(json!({"name":"Recovery QA","folderPath":root.to_string_lossy()}))
            .unwrap();
        (temp, api, project["id"].as_str().unwrap().to_owned(), root)
    }
    fn put(api: &LocalApi, key: &str, bytes: &[u8]) {
        let root = api.app_data_dir.join("drafts");
        fs::create_dir_all(&root).unwrap();
        fs::write(source_path(&root, key).unwrap(), bytes).unwrap();
    }
    #[test]
    fn recovery_review_exposes_corrupt_and_live_variants_without_migrating_or_losing_bytes() {
        let (_temp, api, project, root) = setup();
        fs::write(root.join("live.md"), "disk").unwrap();
        let id = doc_id(&project, "live.md");
        let draft = json!({"documentId":id,"markdown":"new draft"});
        api.save_draft(&id, draft.clone()).unwrap();
        let legacy = safe_name(&id);
        let bytes = serde_json::to_vec(&json!({"documentId":id,"markdown":"older draft"})).unwrap();
        put(&api, &legacy, &bytes);
        put(&api, "damaged", b"{broken");
        let list = api.recovery_drafts().unwrap();
        let rows = list["items"].as_array().unwrap();
        assert_eq!(rows.len(), 3);
        assert_eq!(rows.iter().filter(|r| r["state"] == "variant").count(), 2);
        assert!(rows.iter().any(|r| r["key"] == "damaged"
            && r["state"] == "invalid"
            && r["canCopy"] == false
            && r["canArchive"] == true));
        assert_eq!(
            fs::read(
                api.app_data_dir
                    .join("drafts")
                    .join(format!("{legacy}.json"))
            )
            .unwrap(),
            bytes
        );
        assert!(api.get_document(&id).is_err());
        assert_eq!(fs::read_to_string(root.join("live.md")).unwrap(), "disk");
    }
    #[test]
    fn recovery_review_checks_fingerprints_copies_to_free_names_and_keeps_sources() {
        let (_temp, api, project, root) = setup();
        let bytes = serde_json::to_vec(
            &json!({"documentId":"retired-project::lost.md","markdown":"recovered text"}),
        )
        .unwrap();
        put(&api, "copy_source", &bytes);
        let stale = json!({"fingerprint":"0".repeat(64),"projectId":project,"name":"Recovered.md"});
        assert!(api.copy_reviewed_draft("copy_source", stale).is_err());
        let payload = json!({"fingerprint":hash(&bytes),"projectId":project,"name":"Recovered.md"});
        let result = api
            .copy_reviewed_draft("copy_source", payload.clone())
            .unwrap();
        assert_eq!(result["document"]["markdown"], "recovered text");
        assert!(api
            .copy_reviewed_draft("copy_source", payload.clone())
            .is_err());
        assert_eq!(
            fs::read_to_string(root.join("Recovered.md")).unwrap(),
            "recovered text"
        );
        assert_eq!(
            fs::read(source_path(&api.app_data_dir.join("drafts"), "copy_source").unwrap())
                .unwrap(),
            bytes
        );
        for name in ["../escape.md", ".git/config", "Changed.knote"] {
            let mut invalid = payload.clone();
            invalid["name"] = json!(name);
            assert!(api.copy_reviewed_draft("copy_source", invalid).is_err());
        }
    }
    #[test]
    fn recovery_review_archives_exact_corrupt_bytes_before_retiring_and_rejects_stale_actions() {
        let (_temp, api, _project, _root) = setup();
        let bytes = b"{invalid json";
        put(&api, "broken", bytes);
        assert!(api
            .archive_reviewed_draft("broken", json!({"fingerprint":"0".repeat(64)}))
            .is_err());
        let archived = api
            .archive_reviewed_draft("broken", json!({"fingerprint":hash(bytes)}))
            .unwrap();
        assert_eq!(archived["retired"], true);
        let folder = api
            .app_data_dir
            .join("drafts-review")
            .join(archived["archiveId"].as_str().unwrap());
        assert_eq!(fs::read(folder.join("copy.json")).unwrap(), bytes);
        let manifest: Value =
            serde_json::from_slice(&fs::read(folder.join("manifest.json")).unwrap()).unwrap();
        assert_eq!(manifest["fingerprint"], hash(bytes));
        assert_eq!(manifest["retention"], "manual-no-auto-expiry");
        assert!(!source_path(&api.app_data_dir.join("drafts"), "broken")
            .unwrap()
            .exists());
        assert_eq!(api.recovery_drafts().unwrap()["archivedCount"], 1);
        assert!(api
            .archive_reviewed_draft("../outside", json!({"fingerprint":hash(bytes)}))
            .is_err());
    }
    #[test]
    fn recovery_review_copies_ink_to_a_new_identity_and_reports_active_drafts_separately() {
        let (_temp, api, project, root) = setup();
        let id = doc_id(&project, "live.md");
        fs::write(root.join("live.md"), "disk").unwrap();
        api.save_draft(&id, json!({"markdown":"pending"})).unwrap();
        let content=normalize_handwritten_note(json!({"pages":[{"id":"p","strokes":[{"id":"owned-stroke","tool":"pen","color":"#111827","width":2,"opacity":1.0,"points":[[10,10,0.5,0],[20,20,0.5,16]]}]}]}),"retired::sketch.knote","Recoverable ink");
        document_validation::handwritten(&content).unwrap();
        let bytes=serde_json::to_vec(&json!({"documentId":"retired::sketch.knote","content":content})).unwrap();
        put(&api, "ink", &bytes);
        assert_eq!(api.recovery_drafts().unwrap()["activeCount"], 1);
        let result = api
            .copy_reviewed_draft(
                "ink",
                json!({"fingerprint":hash(&bytes),"projectId":project,"name":"Copy.knote"}),
            )
            .unwrap();
        assert_eq!(result["kind"], "handwritten-note");
        assert_eq!(result["note"]["id"], doc_id(&project, "Copy.knote"));
        assert_eq!(result["note"]["pageCount"], 1);
        assert_eq!(result["note"]["content"]["pages"][0]["strokes"][0]["id"], "owned-stroke");
        assert!(root.join("Copy.knote").is_file());
        assert!(source_path(&api.app_data_dir.join("drafts"), "ink")
            .unwrap()
            .is_file());
    }

    #[test]
    fn recovery_review_can_recover_an_archived_variant_and_rejects_tampering() {
        let (_temp, api, project, root) = setup();
        let bytes = serde_json::to_vec(
            &json!({"documentId":"missing::variant.md","markdown":"original variant"}),
        )
        .unwrap();
        put(&api, "variant", &bytes);
        let result = api
            .archive_reviewed_draft("variant", json!({"fingerprint":hash(&bytes)}))
            .unwrap();
        let key = result["archiveId"].as_str().unwrap();
        let archive = api.archived_drafts().unwrap();
        assert_eq!(archive["items"][0]["source"], "archive");
        assert_eq!(archive["items"][0]["canCopy"], true);
        let payload = json!({"source":"archive","fingerprint":hash(&bytes),"projectId":project,"name":"Archived.md"});
        api.copy_reviewed_draft(key, payload.clone()).unwrap();
        assert_eq!(
            fs::read_to_string(root.join("Archived.md")).unwrap(),
            "original variant"
        );
        let folder = api.app_data_dir.join("drafts-review").join(key);
        fs::write(folder.join("copy.json"), b"tampered").unwrap();
        let mut other = payload;
        other["name"] = json!("Another.md");
        assert!(api.copy_reviewed_draft(key, other).is_err());
        assert!(!root.join("Another.md").exists());
        assert_eq!(api.archived_drafts().unwrap()["items"][0]["canCopy"], false);
    }

    #[test]
    fn recovery_review_bounds_excerpts_and_rejects_readonly_retirement() {
        let (_temp, api, _project, _root) = setup();
        let bytes = serde_json::to_vec(
            &json!({"documentId":"missing::text.md","markdown":"á".repeat(4000)}),
        )
        .unwrap();
        put(&api, "excerpt", &bytes);
        let preview = api
            .preview_reviewed_draft("excerpt", json!({"fingerprint":hash(&bytes)}))
            .unwrap();
        assert_eq!(preview["text"].as_str().unwrap().chars().count(), 2000);
        assert_eq!(preview["truncated"], true);
        let path = source_path(&api.app_data_dir.join("drafts"), "excerpt").unwrap();
        let original = fs::metadata(&path).unwrap().permissions();
        let mut readonly = original.clone();
        readonly.set_readonly(true);
        fs::set_permissions(&path, readonly).unwrap();
        assert!(api
            .archive_reviewed_draft("excerpt", json!({"fingerprint":hash(&bytes)}))
            .is_err());
        assert_eq!(fs::read(&path).unwrap(), bytes);
        fs::set_permissions(path, original).unwrap();
    }

    #[test]
    fn recovery_review_reports_bounded_coverage_and_charges_failed_archive_reads() {
        let (_temp, api, _project, _root) = setup();
        for n in 0..=MAX_ENTRIES {
            put(&api, &format!("invalid_{n}"), b"bad");
        }
        let review = api.recovery_drafts().unwrap();
        assert_eq!(review["limited"], true);
        // Under load the time budget may stop before the entry budget. Both are valid.
        let scanned=review["scannedFiles"].as_u64().unwrap() as usize;
        assert!(scanned>0 && scanned<=MAX_ENTRIES);
        assert_eq!(review["items"].as_array().unwrap().len(), scanned);
        let file = api.app_data_dir.join("budget.json");
        fs::write(&file, b"123456").unwrap();
        let mut budget = 8;
        assert_eq!(read_budgeted(&file, 8, &mut budget).unwrap(), b"123456");
        assert_eq!(budget, 2);
        assert!(read_budgeted(&file, 8, &mut budget).is_err());
        assert_eq!(budget, 2);
    }
}
