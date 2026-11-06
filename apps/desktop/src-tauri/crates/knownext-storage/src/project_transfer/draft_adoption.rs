//! A portable draft is data. Native copies and optional continuation require a fresh explicit review.
use super::*;
use std::{fs, io::Read, time::Instant};
const DIRECTORY: &str = "Archivo KnowNext";
const COPY_LIMIT: u64 = 8 * 1024 * 1024;
const TEXT_LIMIT: usize = 2 * 1024 * 1024;
#[derive(Clone)]
struct Entry {
    id: String,
    path: String,
    original: String,
    sha256: String,
}
struct Catalog {
    root: PathBuf,
    revision: String,
    entries: Vec<Entry>,
    limited: bool,
    unavailable: usize,
}
struct Review {
    catalog: Catalog,
    entry: Entry,
    document: String,
    kind: &'static str,
    copy: Value,
    copy_raw: Vec<u8>,
    key: String,
    operation: String,
    copy_state: String,
    disk: Option<Vec<u8>>,
    draft_slots: Value,
    base_matches: bool,
    can_resume: bool,
    resume_reason: String,
    revision: String,
}
fn hash(v: &str) -> bool {
    v.len() == 64 && v.bytes().all(|b| b.is_ascii_hexdigit())
}
fn optional(path: &Path, limit: u64) -> Result<Option<Vec<u8>>, String> {
    match fs::symlink_metadata(path) {
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(_) => return Err("No se puede consultar una copia; se conserva".into()),
        Ok(meta) if !meta.is_file() || batch::linked(&meta) || meta.len() > limit => {
            return Err("Copia no regular o fuera de límites; se conserva".into())
        }
        _ => (),
    }
    let mut raw = vec![];
    fs::File::open(path)
        .map_err(|_| "No se puede abrir la copia")?
        .take(limit + 1)
        .read_to_end(&mut raw)
        .map_err(|_| "Lectura incompleta de la copia")?;
    if raw.len() as u64 > limit {
        return Err("La copia creció fuera de límites".into());
    }
    Ok(Some(raw))
}
fn directory(path: &Path) -> Result<bool, String> {
    match fs::symlink_metadata(path) {
        Ok(meta) if meta.is_dir() && !batch::linked(&meta) => Ok(true),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(false),
        _ => Err("El almacén requiere una carpeta regular; se conserva".into()),
    }
}
fn catalog(api: &LocalApi, project: &str) -> Result<Catalog, String> {
    let root = api
        .project_root(project)?
        .canonicalize()
        .map_err(|_| "Ubicación de proyecto no disponible")?;
    let path = path_policy::resolve(&root, &format!("{DIRECTORY}/Inventario.json"))?;
    let raw = optional(&path, MAX_MANIFEST)?
        .ok_or("Este proyecto no contiene un inventario privado de borradores")?;
    let inventory = archive_index::parse(&raw)?;
    let revision = sha256_hex(
        &serde_json::to_vec(&json!({"project":project,"root":root,"index":sha256_hex(&raw)}))
            .map_err(|_| "No se puede representar el ámbito")?,
    );
    let mut entries = vec![];
    let mut seen = BTreeSet::new();
    let mut limited = false;
    let mut unavailable = 0;
    for item in inventory
        .items
        .into_iter()
        .filter(|item| item["kind"] == "draft")
    {
        let parsed = (|| -> Result<Entry, String> {
            if item["active"] != false {
                return Err("La entrada no confirma datos sin ejecución".into());
            }
            let path = item["documentPath"]
                .as_str()
                .ok_or("Documento de origen ausente")?;
            paths::validate(path)?;
            if !is_markdown_path(Path::new(path)) && !is_handwritten_note_path(Path::new(path)) {
                return Err("Tipo de borrador no compatible".into());
            }
            let original = item["original"]
                .as_str()
                .ok_or("Original de borrador ausente")?;
            paths::validate(original)?;
            let sha = item["sha256"]
                .as_str()
                .filter(|sha| hash(sha))
                .ok_or("Huella de borrador no compatible")?
                .to_ascii_lowercase();
            let id = sha256_hex(
                &serde_json::to_vec(&json!([project, root, original, sha, path]))
                    .map_err(|_| "Identidad de borrador no representable")?,
            );
            Ok(Entry {
                id,
                path: path.into(),
                original: original.into(),
                sha256: sha,
            })
        })();
        match parsed {
            Ok(entry) if seen.insert(entry.id.clone()) => {
                if entries.len() >= 2000 {
                    limited = true;
                    break;
                }
                entries.push(entry);
            }
            _ => {
                unavailable += 1;
                limited = true;
            }
        }
    }
    entries.sort_by(|a, b| a.path.cmp(&b.path).then_with(|| a.id.cmp(&b.id)));
    Ok(Catalog {
        root,
        revision,
        entries,
        limited,
        unavailable,
    })
}
fn slot(path: &Path) -> Value {
    match fs::symlink_metadata(path) {
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => json!({"status":"absent"}),
        Ok(meta) => {
            json!({"status":"present","regular":meta.is_file()&&!batch::linked(&meta),"bytes":meta.len(),"modified":meta.modified().ok().and_then(|t|t.duration_since(std::time::UNIX_EPOCH).ok()).map(|d|d.as_nanos().to_string())})
        }
        Err(_) => json!({"status":"unavailable"}),
    }
}
fn slots(api: &LocalApi, document: &str) -> Value {
    let root = api.app_data_dir.join("drafts");
    if directory(&root).is_err() {
        return json!({"current":{"status":"unavailable"},"legacy":{"status":"unavailable"}});
    }
    json!({"current":slot(&draft_store::path(&root,document)),"legacy":slot(&root.join(format!("{}.json",safe_name(document))))})
}
fn copy_state(
    api: &LocalApi,
    key: &str,
    expected: &[u8],
    document: &str,
    operation: &str,
) -> (String, Value) {
    let root = api.app_data_dir.join("drafts-review");
    let folder = match recovery_review::archive_folder(&root, key) {
        Ok(path) => path,
        Err(_) => return ("blocked".into(), json!("unavailable")),
    };
    match fs::symlink_metadata(&folder) {
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            return ("absent".into(), Value::Null)
        }
        Err(_) => return ("blocked".into(), json!("unavailable")),
        _ => (),
    }
    let names = match fs::read_dir(&folder) {
        Ok(entries) => entries
            .take(4)
            .map(|entry| {
                entry
                    .ok()
                    .map(|entry| entry.file_name().to_string_lossy().into_owned())
            })
            .collect::<Vec<_>>(),
        Err(_) => return ("blocked".into(), json!("unavailable")),
    };
    if names.len() > 3
        || names.iter().any(|name| {
            name.as_deref()
                .is_none_or(|name| !matches!(name, "copy.json" | "copy.json.zip" | "manifest.json"))
        })
    {
        return ("blocked".into(), json!("unknown-entries"));
    }
    let mut budget = 2 * COPY_LIMIT + 64 * 1024;
    match recovery_review::archive_bundle_budgeted(&root, key, &mut budget) {
        Ok((raw, manifest))
            if raw == expected
                && manifest["sourceKey"] == format!("v2_{}", sha256_hex(document.as_bytes()))
                && manifest["operationId"] == operation
                && manifest["reason"] == "portable-draft-import" =>
        {
            (
                "present".into(),
                json!({"payload":sha256_hex(&raw),"manifest":manifest}),
            )
        }
        Ok((raw, manifest)) => (
            "blocked".into(),
            json!({"payload":sha256_hex(&raw),"manifest":manifest}),
        ),
        Err(_) => (
            "incomplete".into(),
            json!({"copy":slot(&folder.join("copy.json")),"packed":slot(&folder.join("copy.json.zip")),"manifest":slot(&folder.join("manifest.json"))}),
        ),
    }
}
fn review(
    api: &LocalApi,
    project: &str,
    id: &str,
    expected_catalog: Option<&str>,
) -> Result<Review, String> {
    if !hash(id) {
        return Err("Identidad de borrador portable no válida".into());
    }
    let catalog = catalog(api, project)?;
    if expected_catalog.is_some_and(|expected| expected != catalog.revision) {
        return Err(
            "El archivo o su ubicación cambiaron; actualiza el catálogo antes de revisar".into(),
        );
    }
    let entry = catalog
        .entries
        .iter()
        .find(|entry| entry.id == id)
        .cloned()
        .ok_or("El borrador no forma parte de este catálogo; actualiza la lista")?;
    let source = path_policy::resolve(&catalog.root, &format!("{DIRECTORY}/{}", entry.original))?;
    let source_raw = optional(&source, COPY_LIMIT)?
        .ok_or("El original ya no está disponible; se conserva el resto del archivo")?;
    if sha256_hex(&source_raw) != entry.sha256 {
        return Err(
            "El borrador original no coincide con su huella; no se adopta ni modifica".into(),
        );
    }
    let original: Value = serde_json::from_slice(&source_raw)
        .map_err(|_| "El original no contiene un borrador conocido")?;
    if original
        .get("schemaVersion")
        .is_some_and(|v| v.as_u64() != Some(1))
    {
        return Err("Versión de borrador futura; se conserva sin adoptar".into());
    }
    let origin = original["documentId"]
        .as_str()
        .ok_or("El borrador original no tiene identidad")?;
    if document_ref(origin)?.1 != entry.path {
        return Err("El documento original no corresponde a la entrada revisada".into());
    }
    draft_versions::ensure_kind(origin, Some(&original))?;
    let document = doc_id(project, &entry.path);
    let mut copy = json!({"schemaVersion":1,"documentId":document,"baseFingerprint":null});
    let kind = if let Some(markdown) = original["markdown"].as_str() {
        if markdown.len() > TEXT_LIMIT {
            return Err("La continuación admite hasta2MiB de texto; las copias portables permanecen completas".into());
        }
        copy["markdown"] = json!(markdown);
        "document"
    } else {
        document_validation::handwritten(&original["content"])?;
        copy["content"] = original["content"].clone();
        "handwritten-note"
    };
    if let Some(date) = original["draftUpdatedAt"]
        .as_str()
        .filter(|date| OffsetDateTime::parse(date, &Rfc3339).is_ok())
    {
        copy["draftUpdatedAt"] = json!(date);
    }
    let copy_raw = serde_json::to_vec(&copy).map_err(|_| "No se puede preparar la copia nativa")?;
    if copy_raw.len() as u64 > COPY_LIMIT {
        return Err("La copia nativa supera8MiB; el archivo portable se conserva".into());
    }
    let identity = sha256_hex(
        &serde_json::to_vec(&json!([
            project,
            catalog.root,
            entry.original,
            entry.sha256,
            entry.path
        ]))
        .map_err(|_| "Identidad nativa no representable")?,
    );
    let key = format!("recovery-portable-{identity}");
    let operation = format!("portable-{identity}");
    let (copy_state, copy_proof) = copy_state(api, &key, &copy_raw, &document, &operation);
    let disk = path_policy::resolve(&catalog.root, &entry.path)
        .and_then(|path| optional(&path, COPY_LIMIT))
        .ok()
        .flatten();
    let base_matches = disk.as_ref().is_some_and(|raw| {
        original["baseFingerprint"]["size"].as_u64() == Some(raw.len() as u64)
            && original["baseFingerprint"]["sha256"]
                .as_str()
                .is_some_and(|hash| hash.eq_ignore_ascii_case(&sha256_hex(raw)))
    });
    let disk_compatible = disk.as_ref().is_some_and(|raw| {
        if kind == "document" {
            std::str::from_utf8(raw).is_ok()
        } else {
            serde_json::from_slice::<Value>(raw)
                .is_ok_and(|value| document_validation::handwritten(&value).is_ok())
        }
    });
    let draft_slots = slots(api, &document);
    let no_draft =
        draft_slots["current"]["status"] == "absent" && draft_slots["legacy"]["status"] == "absent";
    let same = if let Some(raw) = &disk {
        if kind == "document" {
            std::str::from_utf8(raw)
                .ok()
                .is_some_and(|text| copy["markdown"].as_str() == Some(text))
        } else {
            serde_json::from_slice::<Value>(raw)
                .ok()
                .filter(|value| document_validation::handwritten(value).is_ok())
                .is_some_and(|value| {
                    draft_versions::revision(Some(&json!({"content":value}))).ok()
                        == draft_versions::revision(Some(&copy)).ok()
                })
        }
    } else {
        false
    };
    let reason=if !matches!(copy_state.as_str(),"absent"|"present"){"La copia nativa necesita revisión; se conserva sin reemplazar."}else if !no_draft{"Hay un borrador local o legado que debe conservarse. Puedes guardar una copia para revisar."}else if !base_matches||!disk_compatible{"El documento base no coincide o no está disponible. Recupera la copia como otro archivo."}else if same{"El contenido ya coincide con el documento guardado."}else{"El documento base coincide y no hay otro borrador local."}.to_string();
    let can_resume = matches!(copy_state.as_str(), "absent" | "present")
        && no_draft
        && base_matches
        && disk_compatible
        && !same;
    let revision=sha256_hex(&serde_json::to_vec(&json!({"catalog":catalog.revision,"entry":entry.id,"source":entry.sha256,"copyState":copy_state,"copyProof":copy_proof,"disk":disk.as_ref().map(|bytes|sha256_hex(bytes)),"slots":draft_slots})).map_err(|_|"No se puede representar la revisión")?);
    Ok(Review {
        catalog,
        entry,
        document,
        kind,
        copy,
        copy_raw,
        key,
        operation,
        copy_state,
        disk,
        draft_slots,
        base_matches,
        can_resume,
        resume_reason: reason,
        revision,
    })
}
fn native_copy(value: &Review) -> Value {
    json!({"key":value.key,"source":"archive","operationId":null,"variantRole":null,"fingerprint":sha256_hex(&value.copy_raw),"bytes":value.copy_raw.len(),"documentId":value.document,"name":value.entry.path.rsplit('/').next().unwrap_or("Borrador"),"path":value.entry.path,"projectName":null,"kind":value.kind,"state":"archived","reason":"Borrador traído de un archivo portable. Conserva su copia original y puede recuperarse como otro archivo.","canCopy":true,"canArchive":false,"canInspectUnverified":false,"updatedAt":value.copy["draftUpdatedAt"]})
}
fn public(project: &str, value: &Review) -> Value {
    let preview = if value.kind == "document" {
        knownext_docs::markdown_excerpt(value.copy["markdown"].as_str().unwrap_or(""),640).0
    } else {
        let pages = value.copy["content"]["pages"]
            .as_array()
            .map(Vec::len)
            .unwrap_or(0);
        format!("Nota manuscrita · {pages} páginas conservadas.")
    };
    json!({"schemaVersion":1,"projectId":project,"entryId":value.entry.id,"catalogRevision":value.catalog.revision,"revision":value.revision,"checkedAt":knownext_core::now_iso(),"documentId":value.document,"path":value.entry.path,"kind":value.kind,"preview":preview,"sourceUpdatedAt":value.copy["draftUpdatedAt"],"bytes":value.copy_raw.len(),"sourceSha256":value.entry.sha256,"copyKey":value.key,"copyState":value.copy_state,"copy":if value.copy_state=="present"{native_copy(value)}else{Value::Null},"canCopy":value.copy_state=="absent","canResume":value.can_resume,"baseMatches":value.base_matches,"resumeReason":value.resume_reason,"preservesSource":true,"startsAi":false})
}
fn quota(root: &Path, additional: u64) -> Result<(), String> {
    if !directory(root)? {
        return Ok(());
    }
    let start = Instant::now();
    let mut pending = vec![root.to_path_buf()];
    let mut entries = 0;
    let mut bytes = additional;
    while let Some(path) = pending.pop() {
        for entry in fs::read_dir(&path).map_err(|_| "No se puede medir la capacidad de copias")? {
            entries += 1;
            if entries > 5000 || start.elapsed() > Duration::from_secs(2) {
                return Err(
                    "La capacidad de copias no pudo revisarse; no se publica otra copia".into(),
                );
            }
            let entry = entry.map_err(|_| "Capacidad no comprobable")?;
            let name = entry.file_name().to_string_lossy().to_ascii_lowercase();
            if matches!(
                name.as_str(),
                "owner.lock" | "runtime-owner.lock" | "capture.lock"
            ) {
                continue;
            }
            let meta =
                fs::symlink_metadata(entry.path()).map_err(|_| "Capacidad no comprobable")?;
            if batch::linked(&meta) {
                return Err("Las copias contienen enlaces; se conserva el almacén".into());
            }
            if meta.is_dir() {
                pending.push(entry.path());
            } else if meta.is_file() {
                bytes=bytes.checked_add(meta.len()).filter(|b|*b<=128*1024*1024).ok_or("Las copias conservadas alcanzan128MiB; no se elimina contenido para continuar")?;
            } else {
                return Err("Entrada de recuperación no regular".into());
            }
        }
    }
    Ok(())
}
impl LocalApi {
    pub(crate) fn portable_draft_catalog(&self, project: &str) -> Result<Value, String> {
        let value = catalog(self, project)?;
        Ok(
            json!({"schemaVersion":1,"projectId":project,"revision":value.revision,"checkedAt":knownext_core::now_iso(),"limited":value.limited,"unavailable":value.unavailable,"scope":"portable-drafts-only","items":value.entries.iter().map(|entry|json!({"id":entry.id,"path":entry.path,"name":entry.path.rsplit('/').next().unwrap_or("Borrador")})).collect::<Vec<_>>()}),
        )
    }
    pub(crate) fn review_portable_draft(
        &self,
        project: &str,
        id: &str,
        body: Value,
    ) -> Result<Value, String> {
        #[derive(Deserialize)]
        #[serde(rename_all = "camelCase", deny_unknown_fields)]
        struct Input {
            catalog_revision: String,
        }
        let input: Input =
            serde_json::from_value(body).map_err(|_| "Falta la revisión del catálogo")?;
        Ok(public(
            project,
            &review(self, project, id, Some(&input.catalog_revision))?,
        ))
    }
    pub(crate) fn adopt_portable_draft(
        &self,
        project: &str,
        id: &str,
        body: Value,
    ) -> Result<Value, String> {
        #[derive(Deserialize)]
        #[serde(rename_all = "camelCase", deny_unknown_fields)]
        struct Input {
            revision: String,
            mode: String,
            acknowledge: bool,
        }
        let input: Input =
            serde_json::from_value(body).map_err(|_| "Elige y confirma cómo traer el borrador")?;
        if !input.acknowledge || !matches!(input.mode.as_str(), "copy" | "resume") {
            return Err("Confirma la copia o la continuación revisada del borrador".into());
        }
        let _transaction = self.project_transaction(project)?;
        let value = review(self, project, id, None)?;
        if value.revision != input.revision {
            return Err("El borrador, la ubicación o las copias cambiaron. Revisa de nuevo; no se ha reenviado nada".into());
        }
        if input.mode == "resume" && !value.can_resume {
            return Err(value.resume_reason);
        }
        if input.mode == "copy" && value.copy_state != "absent" {
            return Err(
                "La copia ya existe o necesita revisión; no se duplica ni reemplaza".into(),
            );
        }
        let _budget = if value.copy_state == "absent" {
            Some(recovery_inventory::admit(
                self,
                value.copy_raw.len() as u64 + 4096,
            )?)
        } else {
            None
        };
        if review(self, project, id, None)?.revision != value.revision {
            return Err("Las fuentes cambiaron antes de publicar; vuelve a revisar".into());
        }
        if value.copy_state == "absent" {
            let root = self.app_data_dir.join("drafts-review");
            quota(&root, value.copy_raw.len() as u64 + 4096)?;
            fs::create_dir_all(&root).map_err(|_| "No se puede preparar el almacén de copias")?;
            jobs::regular_directory(&root)?;
            let folder = root.join(&value.key);
            fs::create_dir(&folder)
                .map_err(|_| "La identidad ya está reservada. Consulta la copia sin repetir")?;
            atomic_io::create(&folder.join("copy.json"), &value.copy_raw)
                .map_err(|_| "No se confirmó la copia; revisa su estado sin repetir")?;
            let manifest = json!({"schemaVersion":1,"id":value.key,"sourceKey":format!("v2_{}",sha256_hex(value.document.as_bytes())),"fingerprint":sha256_hex(&value.copy_raw),"bytes":value.copy_raw.len(),"archivedAt":knownext_core::now_iso(),"operationId":value.operation,"reason":"portable-draft-import","retention":"manual-no-auto-expiry"});
            atomic_io::create(
                &folder.join("manifest.json"),
                &serde_json::to_vec(&manifest).map_err(|_| "Registro no representable")?,
            )
            .map_err(|_| {
                "La copia se conserva, pero falta confirmar el registro. Consulta sin repetir"
            })?;
            if copy_state(
                self,
                &value.key,
                &value.copy_raw,
                &value.document,
                &value.operation,
            )
            .0 != "present"
            {
                return Err("La copia nativa no está confirmada; consulta sin repetir".into());
            }
        }
        if input.mode == "resume" {
            let current = review(self, project, id, None)?;
            if !current.can_resume
                || current.entry.sha256 != value.entry.sha256
                || current.catalog.revision != value.catalog.revision
                || current.disk != value.disk
                || current.draft_slots != value.draft_slots
            {
                return Err("La copia está conservada. El destino cambió; revisa antes de continuar el borrador".into());
            }
            let disk = value.disk.as_ref().ok_or("Documento base no disponible")?;
            let mut draft = value.copy.clone();
            draft["draftUpdatedAt"] = json!(knownext_core::now_iso());
            draft["baseFingerprint"] = fingerprint_bytes(disk);
            let (base_hash, content_hash) = if value.kind == "document" {
                let text = std::str::from_utf8(disk).map_err(|_| "Base Markdown no compatible")?;
                (
                    markdown_content_hash(text),
                    markdown_content_hash(draft["markdown"].as_str().unwrap_or("")),
                )
            } else {
                let title = Path::new(&value.entry.path)
                    .file_stem()
                    .and_then(|s| s.to_str())
                    .unwrap_or("Nota");
                let source: Value =
                    serde_json::from_slice(disk).map_err(|_| "Base de nota no compatible")?;
                document_validation::handwritten(&source)?;
                let base = normalize_handwritten_note(source, &value.document, title);
                let content =
                    normalize_handwritten_note(draft["content"].clone(), &value.document, title);
                let hashes = (
                    handwritten_content_hash(&base),
                    handwritten_content_hash(&content),
                );
                draft["content"] = content;
                hashes
            };
            draft["baseContentHash"] = json!(base_hash);
            draft["diskContentHash"] = json!(base_hash);
            draft["savedContentHash"] = json!(base_hash);
            draft["draftContentHash"] = json!(content_hash);
            draft["sourceUnavailable"] = json!(false);
            let raw = serde_json::to_vec(&draft).map_err(|_| "Borrador no representable")?;
            if raw.len() as u64 > COPY_LIMIT {
                return Err("La copia está conservada; el borrador resultante supera8MiB".into());
            }
            let root = self.app_data_dir.join("drafts");
            if slots(self, &value.document) != value.draft_slots {
                return Err("Apareció otro borrador; la copia conservada no se aplica".into());
            }
            fs::create_dir_all(&root).map_err(|_| "No se puede preparar el borrador")?;
            jobs::regular_directory(&root)?;
            let destination = draft_store::path(&root, &value.document);
            atomic_io::create(&destination,&raw).map_err(|_|"La copia está conservada. No se reemplaza un borrador que ya existe; consulta el estado")?;
            if optional(&destination, COPY_LIMIT)?.as_deref() != Some(raw.as_slice()) {
                return Err(
                    "El borrador no está confirmado. La copia permanece; consulta sin repetir"
                        .into(),
                );
            }
        }
        let observed = review(self, project, id, None)?;
        Ok(
            json!({"schemaVersion":1,"projectId":project,"entryId":id,"requestRevision":value.revision,"status":if input.mode=="resume"{"draft_ready"}else{"copied"},"checkedAt":knownext_core::now_iso(),"copy":native_copy(&observed),"review":public(project,&observed),"startsAi":false,"preservesSource":true}),
        )
    }
}
