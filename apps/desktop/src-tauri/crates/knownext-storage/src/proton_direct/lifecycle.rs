//! Reviewed local conservation and recoverable provider changes. No remote purge.
use super::*;
use std::collections::{BTreeMap, BTreeSet};

const LIFECYCLE_VERSION: u64 = 1;
const MAX_CANDIDATES: usize = 128;
const MAX_PROOF_BYTES: u64 = 512 * 1024 * 1024;

fn lifecycle(state: &Value) -> Result<Value, String> {
    let value = &state["lifecycle"];
    if value.is_null() {
        return Ok(
            json!({"schemaVersion":LIFECYCLE_VERSION,"retentionReview":null,"retentionAttempt":null,"retentionHistory":[],"migration":null,"receipts":[]}),
        );
    }
    if value["schemaVersion"] != LIFECYCLE_VERSION
        || !value.is_object()
        || !value["receipts"].is_array()
        || value.as_object().unwrap().keys().any(|key| {
            ![
                "schemaVersion",
                "retentionReview",
                "retentionAttempt",
                "retentionHistory",
                "migration",
                "receipts",
            ]
            .contains(&key.as_str())
        })
        || ["retentionReview", "retentionAttempt", "migration"]
            .iter()
            .any(|key| !(value[*key].is_null() || value[*key].is_object()))
    {
        return Err(
            "El estado de conservación o migración no es compatible; se conserva sin modificar"
                .into(),
        );
    }
    let mut normalized = value.clone();
    if normalized.get("retentionHistory").is_none() {
        normalized["retentionHistory"] = json!([]);
    }
    if !normalized["retentionHistory"]
        .as_array()
        .is_some_and(|rows| {
            rows.len() <= 64
                && rows.iter().all(|row| {
                    row["receipt"].is_object()
                        && row["receipt"]["receiptId"].is_string()
                        && matches!(
                            row["receipt"]["state"].as_str(),
                            Some("complete" | "cancelled")
                        )
                })
        })
    {
        return Err("Los recibos de limpieza no son compatibles; se conservan".into());
    }
    Ok(normalized)
}
fn revision(value: &Value) -> String {
    let mut material = value.clone();
    if let Some(object) = material.as_object_mut() {
        object.remove("revision");
    }
    hash(&material)
}
fn sealed(mut value: Value) -> Value {
    value["revision"] = json!(revision(&value));
    value
}
fn valid_review(value: &Value, payload: &Value) -> Result<(), String> {
    let requested = payload.get("attemptId").or_else(|| payload.get("id"));
    if !value.is_object()
        || requested != Some(&value["id"])
        || payload["revision"] != value["revision"]
        || value["revision"] != revision(value)
    {
        return Err("La revisión cambió; consulta el intento antes de continuar".into());
    }
    Ok(())
}
fn terminal(attempt: &Value) -> bool {
    attempt.is_null() || matches!(attempt["phase"].as_str(), Some("complete" | "cancelled"))
}
pub(super) fn publication_blocked(state: &Value) -> Result<bool, String> {
    let lc = lifecycle(state)?;
    let attempt = &lc["migration"];
    if attempt.is_null() {
        return Ok(false);
    }
    if ![
        "reviewed",
        "staging",
        "verifying",
        "ready",
        "switching",
        "complete",
        "needs-review",
        "cancelled",
    ]
    .contains(
        &attempt["phase"]
            .as_str()
            .ok_or("Fase de migración incompatible")?,
    ) {
        return Err("Migración no verificable; no se publica automáticamente".into());
    }
    Ok(!matches!(
        attempt["phase"].as_str(),
        Some("reviewed" | "complete" | "cancelled")
    ))
}
fn collect_hashes(value: &Value, hashes: &mut BTreeSet<String>) {
    match value {
        Value::String(text) if text.len() == 64 && text.bytes().all(|b| b.is_ascii_hexdigit()) => {
            hashes.insert(text.to_ascii_lowercase());
        }
        Value::Array(rows) => {
            for row in rows {
                collect_hashes(row, hashes);
            }
        }
        Value::Object(rows) => {
            for (key, row) in rows {
                if key.len() == 64 && key.bytes().all(|b| b.is_ascii_hexdigit()) {
                    hashes.insert(key.to_ascii_lowercase());
                }
                collect_hashes(row, hashes);
            }
        }
        _ => (),
    }
}
fn protected_material(state: &Value) -> Value {
    let mut material = state.clone();
    if let Some(lifecycle) = material.get_mut("lifecycle").and_then(Value::as_object_mut) {
        lifecycle.remove("retentionReview");
        lifecycle.remove("retentionAttempt");
        lifecycle.remove("retentionHistory");
    }
    material
}
fn engine_only(state: &Value) -> Value {
    let mut engine = state.clone();
    engine.as_object_mut().unwrap().remove("lifecycle");
    engine
}
fn project_row(registry: &Value, project: &str) -> Result<Value, String> {
    registry["projects"]
        .as_array()
        .and_then(|rows| rows.iter().find(|row| row["id"] == project))
        .cloned()
        .ok_or("El proyecto no está registrado".into())
}
fn pending(state: &Value) -> bool {
    !state["receiveAttempt"].is_null()
        || !state["publishAttempt"].is_null()
        || state["conflicts"]
            .as_array()
            .is_some_and(|rows| !rows.is_empty())
}

struct Inventory {
    total: u64,
    entries: Vec<Value>,
    content: BTreeMap<String, u64>,
    protected: BTreeSet<String>,
    local_copies: BTreeMap<String, String>,
    stamp: String,
}

impl LocalApi {
    fn pd_legacy_migration_blocked(&self, project: &str) -> Result<bool, String> {
        if self.proton_sync_is_connected(project)? {
            return Ok(true);
        }
        let path = self
            .pd_private_root()
            .join("proton-sync")
            .join(sha256_hex(project.as_bytes()))
            .join("state.json");
        if !path.exists() {
            return Ok(false);
        }
        let legacy: Value = serde_json::from_slice(&bytes(&path, MAX_STATE)?).map_err(|_| {
            "El estado del intercambio anterior no es legible; se conserva para recuperación"
        })?;
        if legacy["schemaVersion"] != 1 || legacy["projectId"] != project {
            return Err(
                "El estado del intercambio anterior es incompatible; se conserva para recuperación"
                    .into(),
            );
        }
        Ok(!legacy["binding"].is_null()
            || !legacy["publishAttempt"].is_null()
            || !legacy["receiveAttempt"].is_null())
    }
    fn pd_lifecycle_save(
        &self,
        project: &str,
        state: &mut Value,
        lifecycle: &Value,
    ) -> Result<(), String> {
        state["lifecycle"] = lifecycle.clone();
        self.pd_save(project, state)
    }
    fn pd_lifecycle_snapshot(
        &self,
        project: &str,
        root: &Path,
        logical: &str,
        publication: &str,
    ) -> Result<snapshots::Snapshot, String> {
        let _source = self.project_write(project)?;
        snapshots::capture(root, logical, publication, "migration", None).map_err(|_| {
            "No se pudo inventariar todo el contenido; las fuentes se conservan".into()
        })
    }
    fn pd_inventory(&self, project: &str, root: &Path, state: &Value) -> Result<Inventory, String> {
        let dir = self.pd_dir(project);
        let mut entries = Vec::new();
        let mut unknown_payload = false;
        let mut total = 0u64;
        let mut content = BTreeMap::new();
        let mut stack = vec![];
        if dir.exists() {
            regular(&dir)?;
            stack.push((dir.clone(), String::new()));
        }
        while let Some((directory, prefix)) = stack.pop() {
            regular(&directory)?;
            for entry in fs::read_dir(directory).map_err(|_| "Inventario local incompleto")? {
                let entry = entry.map_err(|_| "Inventario local incompleto")?;
                let name = entry
                    .file_name()
                    .into_string()
                    .map_err(|_| "Nombre local no verificable")?;
                // Coordination files are never opened, hashed, removed or counted as payload.
                if [
                    "owner.lock",
                    "runtime-owner.lock",
                    "capture.lock",
                    "account-access.lock",
                ]
                .contains(&name.as_str())
                {
                    continue;
                }
                if entries.len() >= 50_000 {
                    return Err(
                        "El inventario supera el límite; no se acepta un resultado parcial".into(),
                    );
                }
                let relative = if prefix.is_empty() {
                    name.clone()
                } else {
                    format!("{prefix}/{name}")
                };
                if (!relative.starts_with("content/")
                    && !relative.starts_with("dirty/")
                    && !["content", "dirty", "state.json", "policy.json"]
                        .contains(&relative.as_str()))
                    || (prefix == "content"
                        && !(name.len() == 64 && name.bytes().all(|b| b.is_ascii_hexdigit())))
                {
                    unknown_payload = true;
                }
                let metadata = fs::symlink_metadata(entry.path())
                    .map_err(|_| "Inventario local incompleto")?;
                if batch::linked(&metadata) {
                    return Err("El inventario contiene enlaces; se conserva sin limpiar".into());
                }
                if metadata.is_dir() {
                    entries.push(json!({"path":relative,"kind":"directory"}));
                    stack.push((entry.path(), relative));
                } else if metadata.is_file() {
                    total = total
                        .checked_add(metadata.len())
                        .ok_or("Inventario fuera de presupuesto")?;
                    let digest = if prefix == "content"
                        && name.len() == 64
                        && name.bytes().all(|b| b.is_ascii_hexdigit())
                    {
                        let data = bytes(&entry.path(), snapshots::MAX_FILE_BYTES)?;
                        let actual = sha256_hex(&data);
                        if actual == name {
                            content.insert(name.clone(), metadata.len());
                        } else {
                            unknown_payload = true;
                        }
                        Some(actual)
                    } else {
                        None
                    };
                    entries.push(json!({"path":relative,"kind":"file","bytes":metadata.len(),"digest":digest}));
                } else {
                    return Err("Entrada desconocida; se conserva sin limpiar".into());
                }
            }
        }
        entries.sort_by_key(|entry| entry["path"].as_str().unwrap_or("").to_owned());
        let mut protected = BTreeSet::new();
        collect_hashes(&protected_material(state), &mut protected);
        if unknown_payload {
            protected.extend(content.keys().cloned());
        }
        let snapshot = self.pd_lifecycle_snapshot(project, root, "inventory", "inventory")?;
        let local_copies = snapshot
            .manifest
            .files
            .iter()
            .map(|(path, file)| (file.sha256.clone(), path.clone()))
            .collect();
        // Reviews/receipts update state.json themselves. Their administrative
        // bytes and dirty acknowledgements must not invalidate their own review.
        let stable_entries = entries
            .iter()
            .filter(|entry| {
                entry["path"].as_str().is_some_and(|p| {
                    p != "state.json"
                        && p != "policy.json"
                        && p != "dirty"
                        && !p.starts_with("dirty/")
                })
            })
            .collect::<Vec<_>>();
        let stamp = hash(
            &json!({"entries":stable_entries,"source":Self::pd_stamp(&snapshot),"protected":protected,"binding":state["binding"]}),
        );
        Ok(Inventory {
            total,
            entries,
            content,
            protected,
            local_copies,
            stamp,
        })
    }
    fn pd_storage(&self, project: &str, root: &Path, state: &Value) -> Result<Value, String> {
        let inventory = self.pd_inventory(project, root, state)?;
        let local_reclaimable = inventory
            .content
            .iter()
            .filter(|(sha, _)| {
                !inventory.protected.contains(*sha) && inventory.local_copies.contains_key(*sha)
            })
            .map(|(_, size)| *size)
            .sum::<u64>();
        let lc = lifecycle(state)?;
        let reviewed = if lc["retentionReview"]["inventoryRevision"] == inventory.stamp {
            lc["retentionReview"]["reclaimableBytes"]
                .as_u64()
                .unwrap_or(local_reclaimable)
        } else {
            local_reclaimable
        };
        let reclaimable = reviewed.min(inventory.total);
        Ok(
            json!({"bytes":inventory.total,"limitBytes":QUOTA,"quotaBytes":QUOTA,
            "protectedBytes":inventory.total-reclaimable,"reclaimableBytes":reclaimable,"inventoryRevision":inventory.stamp,
            "quotaStatus":if inventory.total>=QUOTA{"full"}else if inventory.total>=QUOTA*4/5{"warning"}else{"ok"},
            "categories":[{"id":"protected","label":"Bases, variantes, intentos y estado conservado","bytes":inventory.total-reclaimable,"protected":true,"reason":"No se elimina contenido necesario o desconocido"},
                {"id":"reconstructible","label":"Caché verificable","bytes":reclaimable,"protected":false,"reason":"Requiere revisión y comprobación antes de limpiar"}],
            "remoteQuotaKnown":false,"remotePurgeSupported":false,"canReview":true}),
        )
    }
    fn pd_retention_review(
        &self,
        project: &str,
        root: &Path,
        state: &mut Value,
    ) -> Result<Value, String> {
        let mut lc = lifecycle(state)?;
        if !terminal(&lc["migration"]) && lc["migration"]["phase"] != "reviewed" {
            return Err("Termina o cancela la migración antes de limpiar su caché".into());
        }
        if lc["retentionAttempt"]["state"] == "pending" {
            let review = lc["retentionReview"].clone();
            if review.is_null()
                || lc["retentionAttempt"]["reviewId"] != review["id"]
                || review["revision"] != revision(&review)
            {
                return Err("La revision pendiente no es verificable; se conserva".into());
            }
            let mut dto = retention_dto(&review);
            dto["resume"] = json!(true);
            dto["progress"] = json!({"completed":lc["retentionAttempt"]["completed"].as_array().map_or(0,Vec::len),"reclaimedBytes":lc["retentionAttempt"]["reclaimedBytes"]});
            return Ok(dto);
        }
        let inventory = self.pd_inventory(project, root, state)?;
        let mut remote_objects = None;
        let mut candidates = Vec::new();
        let mut proof_bytes = 0u64;
        for (sha, size) in &inventory.content {
            if inventory.protected.contains(sha) || candidates.len() >= MAX_CANDIDATES {
                continue;
            }
            let proof = if let Some(path) = inventory.local_copies.get(sha) {
                Some(json!({"kind":"local-copy","path":path}))
            } else if !state["binding"].is_null()
                && proof_bytes.saturating_add(*size) <= MAX_PROOF_BYTES
            {
                if remote_objects.is_none() {
                    let remote = state["binding"]["remoteRootId"]
                        .as_str()
                        .ok_or("Destino remoto no confirmado")?;
                    let root_nodes = self.pd_list(state, remote)?;
                    let folders = root_nodes
                        .iter()
                        .filter(|row| row["name"] == "objects" && row["type"] == "folder")
                        .collect::<Vec<_>>();
                    if folders.len() != 1 {
                        return Err("Inventario remoto no verificable; no se limpia".into());
                    }
                    remote_objects = Some(
                        self.pd_list(
                            state,
                            folders[0]["id"]
                                .as_str()
                                .ok_or("Identidad remota ausente")?,
                        )?,
                    );
                }
                let nodes = remote_objects
                    .as_ref()
                    .unwrap()
                    .iter()
                    .filter(|row| row["name"] == format!("{sha}.blob") && row["type"] == "file")
                    .collect::<Vec<_>>();
                if nodes.len() == 1 {
                    let node = nodes[0]["id"].as_str().ok_or("Identidad remota ausente")?;
                    let data = self.pd_read(state, node, *size)?;
                    proof_bytes += data.len() as u64;
                    if data.len() as u64 == *size && sha256_hex(&data) == *sha {
                        Some(
                            json!({"kind":"remote-object","nodeId":node,"bindingStamp":hash(&state["binding"])}),
                        )
                    } else {
                        None
                    }
                } else {
                    None
                }
            } else {
                None
            };
            if let Some(proof) = proof {
                candidates.push(json!({"id":sha,"bytes":size,"reason":"Copia reconstruible verificada","proof":proof}));
            }
        }
        let reclaimable = candidates
            .iter()
            .map(|row| row["bytes"].as_u64().unwrap_or(0))
            .sum::<u64>();
        let review = sealed(
            json!({"id":id(),"inventoryRevision":inventory.stamp,"bytesBefore":inventory.total,"protectedBytes":inventory.total-reclaimable,"reclaimableBytes":reclaimable,"candidates":candidates,
            "canApply":true,"warnings":["Sólo caché local verificada. No se purga Proton ni se retiran bases de otros dispositivos."],"blockers":[]}),
        );
        lc["retentionReview"] = review.clone();
        self.pd_lifecycle_save(project, state, &lc)?;
        Ok(retention_dto(&review))
    }
    fn pd_retention_apply(
        &self,
        project: &str,
        root: &Path,
        state: &mut Value,
        payload: Value,
    ) -> Result<Value, String> {
        let mut lc = lifecycle(state)?;
        if !terminal(&lc["migration"]) && lc["migration"]["phase"] != "reviewed" {
            return Err("La migración protege la caché; termina o cancela antes de limpiar".into());
        }
        let review = lc["retentionReview"].clone();
        valid_review(&review, &payload)?;
        if lc["retentionAttempt"]["reviewId"] == review["id"]
            && lc["retentionAttempt"]["state"] == "cancelled"
        {
            return Err("La limpieza fue cancelada; crea otra revision".into());
        }
        if lc["retentionAttempt"]["reviewId"] == review["id"]
            && lc["retentionAttempt"]["state"] == "complete"
        {
            let mut receipt = lc["retentionAttempt"].clone();
            receipt["storage"] = self.pd_storage(project, root, state)?;
            return Ok(receipt);
        }
        if lc["retentionAttempt"].is_null() || lc["retentionAttempt"]["reviewId"] != review["id"] {
            if self.pd_inventory(project, root, state)?.stamp != review["inventoryRevision"] {
                return Err("El inventario cambió; revisa de nuevo antes de limpiar".into());
            }
            lc["retentionAttempt"] = json!({"receiptId":id(),"reviewId":review["id"],"state":"pending","completed":[],"reclaimedBytes":0});
            self.pd_lifecycle_save(project, state, &lc)?;
        }
        let inventory_protected = self.pd_inventory(project, root, state)?.protected;
        for row in review["candidates"]
            .as_array()
            .ok_or("Revisión incompatible")?
        {
            let sha = row["id"]
                .as_str()
                .filter(|s| s.len() == 64 && s.bytes().all(|b| b.is_ascii_hexdigit()))
                .ok_or("Candidato incompatible")?;
            if lc["retentionAttempt"]["completed"]
                .as_array()
                .unwrap()
                .contains(&json!(sha))
            {
                continue;
            }
            let path = self.pd_dir(project).join("content").join(sha);
            // Remote proof runs before local write admission. It never holds
            // the editor or a project transaction while waiting on Proton.
            if path.exists() && row["proof"]["kind"] == "remote-object" {
                if row["proof"]["bindingStamp"] != hash(&state["binding"]) {
                    return Err("Cambió la asociación; se conserva la caché".into());
                }
                let size = row["bytes"].as_u64().ok_or("Tamaño incompatible")?;
                let recovered = self.pd_read(
                    state,
                    row["proof"]["nodeId"]
                        .as_str()
                        .ok_or("Prueba remota incompatible")?,
                    size,
                )?;
                if recovered.len() as u64 != size || sha256_hex(&recovered) != sha {
                    return Err("La copia remota no está verificada; se conserva la caché".into());
                }
            }
            let _transaction = self.project_transaction(project)?;
            let mut protected = BTreeSet::new();
            collect_hashes(&protected_material(state), &mut protected);
            if protected.contains(sha) || inventory_protected.contains(sha) {
                return Err(
                    "El contenido ahora está protegido; se conserva la limpieza pendiente".into(),
                );
            }
            if path.exists() {
                let data = bytes(&path, snapshots::MAX_FILE_BYTES)?;
                if sha256_hex(&data) != sha
                    || data.len() as u64 != row["bytes"].as_u64().ok_or("Tamaño incompatible")?
                {
                    return Err("La caché cambió; no se elimina".into());
                }
                if row["proof"]["kind"] == "local-copy" {
                    let source = target(
                        root,
                        row["proof"]["path"]
                            .as_str()
                            .ok_or("Prueba de reconstrucción incompatible")?,
                    )?;
                    if sha256_hex(&bytes(&source, snapshots::MAX_FILE_BYTES)?) != sha {
                        return Err("La copia de origen cambió; no se limpia".into());
                    }
                } else if row["proof"]["kind"] != "remote-object" {
                    return Err("Prueba de reconstrucción desconocida; se conserva".into());
                }
                fs::remove_file(&path)
                    .map_err(|_| "No se pudo confirmar la limpieza; consulta antes de repetir")?;
            }
            lc["retentionAttempt"]["completed"]
                .as_array_mut()
                .unwrap()
                .push(json!(sha));
            lc["retentionAttempt"]["reclaimedBytes"] = json!(lc["retentionAttempt"]
                ["reclaimedBytes"]
                .as_u64()
                .unwrap_or(0)
                .saturating_add(row["bytes"].as_u64().unwrap_or(0)));
            self.pd_lifecycle_save(project, state, &lc)?;
        }
        lc["retentionAttempt"]["state"] = json!("complete");
        archive_retention(&mut lc)?;
        self.pd_lifecycle_save(project, state, &lc)?;
        let mut receipt = lc["retentionAttempt"].clone();
        receipt["storage"] = self.pd_storage(project, root, state)?;
        Ok(receipt)
    }
    fn pd_retention_cancel(
        &self,
        project: &str,
        root: &Path,
        state: &mut Value,
        payload: Value,
    ) -> Result<Value, String> {
        let mut lc = lifecycle(state)?;
        let review = lc["retentionReview"].clone();
        valid_review(&review, &payload)?;
        if lc["retentionAttempt"].is_null() || lc["retentionAttempt"]["reviewId"] != review["id"] {
            lc["retentionAttempt"] = json!({"receiptId":id(),"reviewId":review["id"],"state":"cancelled","completed":[],"reclaimedBytes":0});
        } else if lc["retentionAttempt"]["state"] != "complete" {
            lc["retentionAttempt"]["state"] = json!("cancelled");
        }
        archive_retention(&mut lc)?;
        self.pd_lifecycle_save(project, state, &lc)?;
        let mut receipt = lc["retentionAttempt"].clone();
        receipt["storage"] = self.pd_storage(project, root, state)?;
        Ok(receipt)
    }
}

fn retention_dto(review: &Value) -> Value {
    let mut dto = review.clone();
    if let Some(rows) = dto["candidates"].as_array_mut() {
        for row in rows {
            row.as_object_mut().unwrap().remove("proof");
        }
    }
    dto
}
fn archive_retention(lc: &mut Value) -> Result<(), String> {
    let receipt = lc["retentionAttempt"].clone();
    if !matches!(receipt["state"].as_str(), Some("complete" | "cancelled")) {
        return Ok(());
    }
    let review = lc["retentionReview"].clone();
    if receipt["reviewId"] != review["id"] {
        return Err("El recibo no coincide con la revision conservada".into());
    }
    if lc.get("retentionHistory").is_none() {
        lc["retentionHistory"] = json!([]);
    }
    let rows = lc["retentionHistory"]
        .as_array_mut()
        .ok_or("Registro de limpieza incompatible")?;
    if !rows
        .iter()
        .any(|row| row["receipt"]["receiptId"] == receipt["receiptId"])
    {
        rows.push(json!({"review":retention_dto(&review),"receipt":receipt,"archivedAt":knownext_core::now_iso()}));
        if rows.len() > 64 {
            rows.remove(0);
        }
    }
    Ok(())
}

fn provider_label(provider: &str) -> &'static str {
    match provider {
        "proton" => "Proton Drive",
        "github" => "GitHub",
        _ => "Sólo en este dispositivo",
    }
}
fn attempt_dto(attempt: &Value) -> Value {
    if attempt.is_null() {
        return Value::Null;
    }
    let phase = attempt["phase"].as_str().unwrap_or("needs-review");
    let summary = if let Some(files) = attempt["stagedManifest"]["files"].as_object() {
        json!({"files":files.len(),"bytes":files.values().fold(0u64,|total,file|total.saturating_add(file["bytes"].as_u64().unwrap_or(0)))})
    } else {
        json!({"files":attempt["summary"]["files"].as_u64().unwrap_or(0),"bytes":attempt["summary"]["bytes"].as_u64().unwrap_or(0)})
    };
    let destination_name = match attempt["target"].as_str() {
        Some("proton") => attempt["remoteProjects"]
            .as_array()
            .and_then(|rows| {
                rows.iter()
                    .find(|row| row["id"] == attempt["destination"]["remoteRootId"])
            })
            .and_then(|row| row["name"].as_str())
            .filter(|name| !name.trim().is_empty())
            .map(str::to_owned)
            .unwrap_or_else(|| {
                if attempt["destination"]["priorEngine"].is_object() {
                    "Origen conservado de este proyecto".into()
                } else if phase == "reviewed" && attempt["destination"]["remoteRootId"].is_string()
                {
                    "Raíz seleccionada pendiente de comprobación".into()
                } else {
                    "Nuevo espacio gestionado de este proyecto".into()
                }
            }),
        Some("github") => {
            let repository = &attempt["destination"]["github"]["repository"];
            match (repository["owner"].as_str(), repository["repo"].as_str()) {
                (Some(owner), Some(repo)) if !owner.is_empty() && !repo.is_empty() => {
                    format!("{owner}/{repo}")
                }
                _ => "Repositorio GitHub configurado de este proyecto".into(),
            }
        }
        _ => "Carpeta actual del proyecto en este dispositivo".into(),
    };
    let can_start = phase == "reviewed"
        && attempt["canStart"] == true
        && attempt["blockers"].as_array().is_some_and(Vec::is_empty)
        && attempt["revision"] == revision(attempt);
    json!({"id":attempt["id"],"revision":attempt["revision"],"target":attempt["target"],"phase":phase,
        "source":provider_label(attempt["sourceKind"].as_str().unwrap_or("local")),
        "destination":provider_label(attempt["target"].as_str().unwrap_or("local")),
        "destinationAccountId":if attempt["target"]=="proton"{attempt["destination"]["accountId"].clone()}else{Value::Null},
        "destinationName":destination_name.chars().filter(|c|!c.is_control()).take(256).collect::<String>(),
        "summary":summary,"canStart":can_start,
        "canCancel":!matches!(phase,"switching"|"complete"|"cancelled"),
        "canResume":matches!(phase,"staging"|"verifying"|"needs-review")||(phase=="switching"&&attempt["switch"]["committed"]==true),
        "canAcknowledge":phase=="ready"||(phase=="switching"&&attempt["switch"]["committed"]!=true),"sourcePreserved":true,
        "detail":attempt["detail"],"warnings":attempt["warnings"],"blockers":attempt["blockers"],
        "receiptId":attempt["receiptId"],"fullyMigrated":attempt["fullyMigrated"],
        "localRecovery":attempt["localRecovery"]==true,"pendingLocalChanges":attempt["pendingLocalChanges"]==true,
        "remoteConfirmed":attempt["destinationVerified"]==true && attempt["target"]!="local"})
}
fn review_dto(attempt: &Value) -> Value {
    let mut dto = attempt_dto(attempt);
    dto["remoteProjects"] = attempt["remoteProjects"].clone();
    dto
}
fn restore_engine(current: &mut Value, engine: &Value) {
    let lc = current["lifecycle"].clone();
    *current = engine.clone();
    current["lifecycle"] = lc;
}
fn logical_identity(state: &Value, lc: &Value) -> String {
    state["binding"]["logicalProjectId"]
        .as_str()
        .or_else(|| {
            lc["receipts"].as_array().and_then(|rows| {
                rows.iter()
                    .rev()
                    .find_map(|row| row["logicalProjectId"].as_str())
            })
        })
        .map(str::to_owned)
        .unwrap_or_else(id)
}

impl LocalApi {
    pub(crate) fn proton_migration_holds_source(&self, project: &str) -> Result<bool, String> {
        let state = self.pd_load(project)?;
        let lc = lifecycle(&state)?;
        Ok(!lc["migration"].is_null()
            && !matches!(
                lc["migration"]["phase"].as_str(),
                Some("reviewed" | "complete" | "cancelled")
            ))
    }
    fn pd_migration_policy(
        &self,
        project: &str,
        state: &Value,
        paused: bool,
    ) -> Result<(), String> {
        ensure(&self.pd_dir(project))?;
        atomic_io::write(
            &self.pd_dir(project).join("policy.json"),
            &serde_json::to_vec(
                &json!({"schemaVersion":1,"generation":state["generation"],"paused":paused,"migrationOwner":state["lifecycle"]["migration"]["id"]}),
            )
            .map_err(|_| "Política incompatible")?,
        )
        .map_err(|_| "No se pudo confirmar la pausa; consulta el intento".into())
    }
    fn pd_migration_restore_policy(
        &self,
        project: &str,
        state: &Value,
        attempt: &Value,
    ) -> Result<bool, String> {
        let path = self.pd_dir(project).join("policy.json");
        let current = if path.exists() {
            serde_json::from_slice::<Value>(&bytes(&path, 64 * 1024)?)
                .map_err(|_| "La politica de pausa no es legible; se conserva")?
        } else {
            Value::Null
        };
        let paused = if current["migrationOwner"] == attempt["id"] {
            attempt["originalPaused"] == true
        } else {
            current["paused"]
                .as_bool()
                .unwrap_or(attempt["originalPaused"] == true)
        };
        atomic_io::write(
            &path,
            &serde_json::to_vec(
                &json!({"schemaVersion":1,"generation":state["generation"],"paused":paused}),
            )
            .map_err(|_| "Politica incompatible")?,
        )
        .map_err(|_| "No se pudo confirmar la pausa final")?;
        Ok(paused)
    }
    fn pd_migration_save(
        &self,
        project: &str,
        state: &mut Value,
        lc: &mut Value,
        attempt: Value,
    ) -> Result<Value, String> {
        let attempt = sealed(attempt);
        lc["migration"] = attempt.clone();
        self.pd_lifecycle_save(project, state, lc)?;
        Ok(attempt)
    }
    fn pd_migration_problem(
        &self,
        project: &str,
        state: &mut Value,
        lc: &mut Value,
        mut attempt: Value,
        detail: String,
    ) -> Result<Value, String> {
        attempt["phase"] = json!("needs-review");
        attempt["detail"] = json!(detail);
        let saved = self.pd_migration_save(project, state, lc, attempt)?;
        Ok(attempt_dto(&saved))
    }
    fn pd_migration_source_stamp(&self, root: &Path, attempt: &Value) -> Result<Value, String> {
        match attempt["sourceKind"].as_str() {
            Some("proton") if attempt["localRecovery"] != true => Ok(json!(self
                .pd_migration_remote_stamp(
                    &attempt["sourceBinding"],
                    attempt["logicalProjectId"]
                        .as_str()
                        .ok_or("Identidad ausente")?,
                    Some(&attempt["sourceEngine"])
                )?)),
            Some("github") if attempt["localRecovery"] != true => Ok(self
                .proton_github_migration_check(
                    attempt["projectId"].as_str().ok_or("Identidad ausente")?,
                    root,
                    false,
                    false,
                )?["stamp"]
                .clone()),
            _ => Ok(Value::Null),
        }
    }
    fn pd_migration_remote_stamp(
        &self,
        binding: &Value,
        logical: &str,
        known: Option<&Value>,
    ) -> Result<String, String> {
        let temporary = json!({"binding":binding});
        let remote = binding["remoteRootId"]
            .as_str()
            .ok_or("El destino remoto todavía no está confirmado")?;
        let children = self.pd_list(&temporary, remote)?;
        let descriptors = children
            .iter()
            .filter(|row| row["name"] == "project.json" && row["type"] == "file")
            .collect::<Vec<_>>();
        if descriptors.len() != 1 {
            return Err("El proyecto remoto no tiene una identidad única y verificable".into());
        }
        let descriptor_bytes = self.pd_read(
            &temporary,
            descriptors[0]["id"].as_str().ok_or("Identidad ausente")?,
            64 * 1024,
        )?;
        let descriptor: Value = serde_json::from_slice(&descriptor_bytes)
            .map_err(|_| "Descripción remota incompatible")?;
        if descriptor["schemaVersion"] != 1 || descriptor["logicalProjectId"] != logical {
            return Err("La identidad del destino cambió; se conservan ambas copias".into());
        }
        let folders = children
            .iter()
            .filter(|row| row["name"] == "publications" && row["type"] == "folder")
            .collect::<Vec<_>>();
        if folders.len() != 1 {
            return Err("El inventario remoto está incompleto; no se cambia la asociación".into());
        }
        let publications = self.pd_list(
            &temporary,
            folders[0]["id"].as_str().ok_or("Identidad ausente")?,
        )?;
        if publications.len() > 1000 {
            return Err("El inventario remoto supera el presupuesto de revisión".into());
        }
        let mut material = BTreeMap::new();
        let mut budget = 0u64;
        for row in publications {
            let name = row["name"].as_str().ok_or("Nombre remoto ausente")?;
            if !name.ends_with(".json") {
                return Err(
                    "El destino contiene material desconocido; no se mezcla automáticamente".into(),
                );
            }
            let data = self.pd_read(
                &temporary,
                row["id"].as_str().ok_or("Identidad ausente")?,
                8 * 1024 * 1024,
            )?;
            budget = budget.saturating_add(data.len() as u64);
            if budget > MAX_PROOF_BYTES {
                return Err("La revisión remota supera el presupuesto".into());
            }
            let manifest: Manifest =
                serde_json::from_slice(&data).map_err(|_| "Publicación incompatible")?;
            let fingerprint =
                snapshots::manifest_hash(&manifest).map_err(|_| "Publicación incompatible")?;
            if manifest.project_id != logical
                || name != format!("{}.json", manifest.publication_id)
                || material.contains_key(name)
            {
                return Err("Publicación remota no verificable".into());
            }
            if let Some(known) = known {
                if known["manifestStamps"][&manifest.publication_id] != fingerprint {
                    return Err("Hay publicaciones nuevas o no conciliadas; sincroniza el origen y revisa otra vez".into());
                }
            }
            material.insert(name.to_owned(), fingerprint);
        }
        Ok(hash(
            &json!({"descriptor":sha256_hex(&descriptor_bytes),"publications":material}),
        ))
    }
    fn pd_migration_review(
        &self,
        project: &str,
        root: &Path,
        state: &mut Value,
        payload: Value,
    ) -> Result<Value, String> {
        if payload.as_object().is_none_or(|object| {
            object.keys().any(|key| {
                !["target", "accountId", "remoteRootId", "allowLocalRecovery"]
                    .contains(&key.as_str())
            })
        }) {
            return Err("Destino de migración no válido".into());
        }
        let target_provider = payload["target"]
            .as_str()
            .filter(|value| ["local", "proton", "github"].contains(value))
            .ok_or("Elige un destino compatible")?;
        let mut lc = lifecycle(state)?;
        if !terminal(&lc["migration"]) && lc["migration"]["phase"] != "reviewed" {
            return Err(
                "Consulta, termina o cancela el intento anterior; sus preparaciones se conservan"
                    .into(),
            );
        }
        let registry = self.registry_checked()?;
        let row = project_row(&registry, project)?;
        let source = if !state["binding"].is_null() {
            "proton"
        } else if row["syncMode"].as_str().is_some_and(is_github_sync_mode) {
            "github"
        } else {
            "local"
        };
        let logical = logical_identity(state, &lc);
        let attempt_id = id();
        let snapshot = self.pd_lifecycle_snapshot(project, root, &logical, &attempt_id)?;
        let total = snapshot
            .manifest
            .files
            .values()
            .map(|file| file.bytes)
            .sum::<u64>();
        let mut attempt = json!({"id":attempt_id,"projectId":project,"target":target_provider,"sourceKind":source,"phase":"reviewed","canStart":true,"logicalProjectId":logical,
            "sourceBinding":state["binding"],"sourceEngine":engine_only(state),"sourceRegistry":row,"sourceRegistryStamp":hash(&row),"sourceStamp":Self::pd_stamp(&snapshot),"sourceRemoteStamp":null,
            "originalPaused":self.pd_paused(project,state)?,"localRecovery":payload["allowLocalRecovery"]==true,
            "destination":{"storageId":attempt_id,"accountId":payload["accountId"],"remoteRootId":payload["remoteRootId"],"priorEngine":null},
            "summary":{"files":snapshot.manifest.files.len(),"bytes":total},"remoteProjects":[],"warnings":["Se conservan la carpeta, los identificadores, los borradores y el historial local. No se borra el origen ni se copian credenciales."],"blockers":[],
            "detail":"Revisa el destino y el contenido antes de preparar el cambio.","stagedManifest":null,"destinationVerified":false,"fullyMigrated":false,"createdAt":knownext_core::now_iso()});
        let mut blockers = Vec::<String>::new();
        if pending(state) {
            blockers.push("Hay recepciones, publicaciones o conflictos pendientes; resuélvelos antes de migrar.".into());
        }
        if self.pd_legacy_migration_blocked(project)? {
            blockers.push("Hay una asociación antigua por carpeta. Revisa su recuperación y desconexión; no se enviará nada por ese flujo.".into());
        }
        if !snapshot.manifest.exclusions.is_empty() {
            attempt["warnings"].as_array_mut().unwrap().push(json!(format!("{} entradas privadas o excluidas permanecen sólo en este dispositivo; no se transporta .git vivo.",snapshot.manifest.exclusions.len())));
        }
        match self.pd_migration_source_stamp(root, &attempt) {
            Ok(stamp) => attempt["sourceRemoteStamp"] = stamp,
            Err(error) if payload["allowLocalRecovery"] == true => {
                attempt["localRecovery"] = json!(true);
                attempt["warnings"].as_array_mut().unwrap().push(json!(format!("Recuperación desde la copia local disponible: {error}. No garantiza cambios guardados sólo en otros dispositivos.")));
            }
            Err(error) => blockers.push(error),
        }
        if source == "proton"
            && payload["allowLocalRecovery"] != true
            && state["lastSentStamp"] != Self::pd_stamp(&snapshot)
        {
            blockers.push("Hay contenido local no confirmado en el origen. Sincroniza antes de migrar o elige recuperación local explícita.".into());
        }
        if target_provider == "proton" {
            let account = payload["accountId"].as_str().filter(|value| {
                !value.is_empty() && value.len() <= 256 && !value.chars().any(char::is_control)
            });
            if let Some(account) = account {
                let temporary = json!({"binding":{"accountId":account}});
                match self.pd_call(&temporary, "drive.root", json!({})) {
                    Ok(remote) => attempt["destination"]["accountRootId"] = remote["id"].clone(),
                    Err(error) => blockers.push(error),
                }
                let mut roots = BTreeMap::new();
                for receipt in lc["receipts"].as_array().unwrap().iter().rev() {
                    let previous = &receipt["sourceBinding"];
                    if previous["accountId"] == account && previous["logicalProjectId"] == logical {
                        if let Some(remote) = previous["remoteRootId"].as_str() {
                            roots.entry(remote.to_owned()).or_insert_with(||json!({"id":remote,"logicalProjectId":logical,"name":format!("Origen conservado · {}",receipt["sourceRegistry"]["name"].as_str().unwrap_or("Este proyecto"))}));
                        }
                    }
                }
                attempt["remoteProjects"] = json!(roots.into_values().collect::<Vec<_>>());
                if let Some(selected) = payload["remoteRootId"].as_str() {
                    let previous =
                        lc["receipts"]
                            .as_array()
                            .unwrap()
                            .iter()
                            .rev()
                            .find(|receipt| {
                                receipt["sourceBinding"]["accountId"] == account
                                    && receipt["sourceBinding"]["remoteRootId"] == selected
                            });
                    if let Some(previous) = previous {
                        let prior = previous["sourceEngine"].clone();
                        if prior["binding"]["logicalProjectId"] != logical {
                            blockers.push(
                                "El destino pertenece a otra identidad de proyecto; no se mezcla."
                                    .into(),
                            );
                        } else {
                            match self.pd_migration_remote_stamp(
                                &prior["binding"],
                                &logical,
                                Some(&prior),
                            ) {
                                Ok(stamp) => {
                                    attempt["destination"]["priorEngine"] = prior;
                                    attempt["destination"]["initialRemoteStamp"] = json!(stamp);
                                }
                                Err(error) => blockers.push(error),
                            }
                        }
                    } else {
                        blockers.push("Un destino no vacío sólo puede reutilizarse desde una asociación previa verificable de este mismo proyecto. Deja el destino vacío para preparar un espacio nuevo.".into());
                    }
                }
            } else {
                blockers.push("Conecta y elige la cuenta Proton de destino.".into());
            }
        } else if target_provider == "github" {
            match self.proton_github_migration_check(project, root, true, false) {
                Ok(check) => {
                    attempt["destination"]["github"] = check.clone();
                    if let Some(warnings) = check["warnings"].as_array() {
                        attempt["warnings"]
                            .as_array_mut()
                            .unwrap()
                            .extend(warnings.clone());
                    }
                }
                Err(error) => blockers.push(error),
            }
        }
        attempt["canStart"] = json!(blockers.is_empty());
        attempt["blockers"] = json!(blockers);
        let saved = self.pd_migration_save(project, state, &mut lc, attempt)?;
        Ok(review_dto(&saved))
    }
    fn pd_migration_stage(
        &self,
        project: &str,
        root: &Path,
        state: &mut Value,
        lc: &mut Value,
        mut attempt: Value,
    ) -> Result<Value, String> {
        if let Err(error) = self
            .pd_migration_source_stamp(root, &attempt)
            .and_then(|stamp| {
                if stamp == attempt["sourceRemoteStamp"] {
                    Ok(())
                } else {
                    Err("El origen remoto cambió; cancela, concilia y revisa la migración".into())
                }
            })
        {
            return self.pd_migration_problem(project, state, lc, attempt, error);
        }
        let logical = attempt["logicalProjectId"]
            .as_str()
            .ok_or("Identidad de proyecto ausente")?
            .to_owned();
        let snapshot = self.pd_lifecycle_snapshot(project, root, &logical, &id())?;
        let stamp = Self::pd_stamp(&snapshot);
        if attempt["stagedManifest"].is_null() || attempt["stagedStamp"] != stamp {
            for (path, file) in &snapshot.manifest.files {
                self.pd_cache(project, &file.sha256, &snapshot.contents[path])?;
            }
            let mut manifest = snapshot.manifest;
            manifest.sender_id = state["deviceId"]
                .as_str()
                .ok_or("Dispositivo no verificable")?
                .into();
            manifest.parent_publication = attempt["destination"]["lastPublication"]
                .as_str()
                .or_else(|| attempt["destination"]["priorEngine"]["causal"].as_str())
                .map(str::to_owned);
            attempt["stagedManifest"] =
                serde_json::to_value(manifest).map_err(|_| "Inventario no válido")?;
            attempt["stagedStamp"] = json!(stamp);
            attempt["phase"] = json!("staging");
            attempt["detail"] =
                json!("Preparando y verificando el destino; el origen permanece asociado.");
            attempt = self.pd_migration_save(project, state, lc, attempt)?;
        }
        let staged: Manifest = serde_json::from_value(attempt["stagedManifest"].clone())
            .map_err(|_| "Preparación incompatible")?;
        let outcome: Result<(), String> = (|| {
            match attempt["target"].as_str() {
                Some("proton") => {
                    let temporary =
                        json!({"binding":{"accountId":attempt["destination"]["accountId"]}});
                    if attempt["destination"]["remoteRootId"].is_null() {
                        let folder = self.pd_folder(
                            &temporary,
                            attempt["destination"]["accountRootId"]
                                .as_str()
                                .ok_or("Raíz de destino ausente")?,
                            &format!(
                                "KnowNext-{}",
                                attempt["destination"]["storageId"]
                                    .as_str()
                                    .ok_or("Identidad de preparación ausente")?
                            ),
                        )?;
                        attempt["destination"]["remoteRootId"] = json!(folder);
                        attempt = self.pd_migration_save(project, state, lc, attempt.clone())?;
                    }
                    let remote = attempt["destination"]["remoteRootId"]
                        .as_str()
                        .ok_or("Destino ausente")?
                        .to_owned();
                    if attempt["destination"]["priorEngine"].is_null() {
                        let descriptor = json!({"schemaVersion":1,"logicalProjectId":logical,"storageId":attempt["destination"]["storageId"],"migrationId":attempt["id"],"name":attempt["sourceRegistry"]["name"]});
                        self.pd_put(
                            &temporary,
                            &remote,
                            "project.json",
                            &serde_json::to_vec(&descriptor)
                                .map_err(|_| "Descripción incompatible")?,
                        )?;
                    }
                    let objects = self.pd_folder(&temporary, &remote, "objects")?;
                    let publications = self.pd_folder(&temporary, &remote, "publications")?;
                    for file in staged.files.values() {
                        let data = bytes(
                            &self.pd_dir(project).join("content").join(&file.sha256),
                            snapshots::MAX_FILE_BYTES,
                        )?;
                        if data.len() as u64 != file.bytes || sha256_hex(&data) != file.sha256 {
                            return Err("La copia preparada cambió; se conserva el intento".into());
                        }
                        self.pd_put(
                            &temporary,
                            &objects,
                            &format!("{}.blob", file.sha256),
                            &data,
                        )?;
                    }
                    self.pd_put(
                        &temporary,
                        &publications,
                        &format!("{}.json", staged.publication_id),
                        &serde_json::to_vec(&staged).map_err(|_| "Publicación no válida")?,
                    )?;
                    attempt["destination"]["lastPublication"] = json!(staged.publication_id);
                    attempt["phase"] = json!("verifying");
                    attempt = self.pd_migration_save(project, state, lc, attempt.clone())?;
                    self.pd_verify_migration_destination(project, &attempt)?;
                    let binding = json!({"accountId":attempt["destination"]["accountId"],"remoteRootId":attempt["destination"]["remoteRootId"]});
                    attempt["destination"]["verifiedRemoteStamp"] =
                        json!(self.pd_migration_remote_stamp(&binding, &logical, None)?);
                }
                Some("github") => {
                    attempt["destination"]["github"] =
                        self.proton_github_migration_check(project, root, true, true)?;
                }
                Some("local") => (),
                _ => return Err("Destino incompatible".into()),
            }
            Ok(())
        })();
        if let Err(error) = outcome {
            return self.pd_migration_problem(project, state, lc, attempt, error);
        }
        let final_snapshot = self.pd_lifecycle_snapshot(project, root, &logical, "check")?;
        if Self::pd_stamp(&final_snapshot) != attempt["stagedStamp"] {
            return self.pd_migration_problem(project,state,lc,attempt,"Se guardaron cambios durante la preparación. Reanuda este mismo intento para incluirlos antes de activar.".into());
        }
        attempt["phase"] = json!("ready");
        attempt["destinationVerified"] = json!(true);
        attempt["detail"]=json!("Destino comprobado. Confirma el cambio; la carpeta, el historial y el origen se conservan.");
        let saved = self.pd_migration_save(project, state, lc, attempt)?;
        Ok(attempt_dto(&saved))
    }
    fn pd_verify_migration_destination(
        &self,
        project: &str,
        attempt: &Value,
    ) -> Result<(), String> {
        let manifest: Manifest = serde_json::from_value(attempt["stagedManifest"].clone())
            .map_err(|_| "Preparación incompatible")?;
        let binding = json!({"accountId":attempt["destination"]["accountId"],"remoteRootId":attempt["destination"]["remoteRootId"]});
        let temporary = json!({"binding":binding});
        let remote = binding["remoteRootId"]
            .as_str()
            .ok_or("Destino no confirmado")?;
        let nodes = self.pd_list(&temporary, remote)?;
        let objects = nodes
            .iter()
            .filter(|row| row["name"] == "objects" && row["type"] == "folder")
            .collect::<Vec<_>>();
        let publications = nodes
            .iter()
            .filter(|row| row["name"] == "publications" && row["type"] == "folder")
            .collect::<Vec<_>>();
        if objects.len() != 1 || publications.len() != 1 {
            return Err("Destino incompleto o duplicado; no se activa".into());
        }
        let descriptors = self.pd_list(
            &temporary,
            publications[0]["id"].as_str().ok_or("Identidad ausente")?,
        )?;
        let found = descriptors
            .iter()
            .filter(|row| {
                row["name"] == format!("{}.json", manifest.publication_id) && row["type"] == "file"
            })
            .collect::<Vec<_>>();
        if found.len() != 1 {
            return Err("No se confirmó la publicación preparada".into());
        }
        let encoded = self.pd_read(
            &temporary,
            found[0]["id"].as_str().ok_or("Identidad ausente")?,
            8 * 1024 * 1024,
        )?;
        let read: Manifest =
            serde_json::from_slice(&encoded).map_err(|_| "Publicación no verificable")?;
        if read != manifest {
            return Err("La publicación preparada cambió; se conserva el origen".into());
        }
        let object_nodes = self.pd_list(
            &temporary,
            objects[0]["id"].as_str().ok_or("Identidad ausente")?,
        )?;
        for file in manifest.files.values() {
            let found = object_nodes
                .iter()
                .filter(|row| {
                    row["name"] == format!("{}.blob", file.sha256) && row["type"] == "file"
                })
                .collect::<Vec<_>>();
            if found.len() != 1 {
                return Err("Falta contenido preparado; no se activa".into());
            }
            let read = self.pd_read(
                &temporary,
                found[0]["id"].as_str().ok_or("Identidad ausente")?,
                file.bytes,
            )?;
            if read.len() as u64 != file.bytes || sha256_hex(&read) != file.sha256 {
                return Err("El contenido preparado no coincide; no se activa".into());
            }
            self.pd_cache(project, &file.sha256, &read)?;
        }
        Ok(())
    }
    fn pd_migration_start(
        &self,
        project: &str,
        root: &Path,
        state: &mut Value,
        payload: Value,
    ) -> Result<Value, String> {
        let mut lc = lifecycle(state)?;
        let mut attempt = lc["migration"].clone();
        valid_review(&attempt, &payload)?;
        match attempt["phase"].as_str() {
            Some("complete" | "cancelled" | "ready") => return Ok(attempt_dto(&attempt)),
            Some("switching") => {
                if attempt["switch"]["committed"] == true {
                    return self.pd_migration_finalize(project, state, &mut lc, attempt);
                }
                return Ok(attempt_dto(&attempt));
            }
            Some("reviewed") => {
                if attempt["canStart"] != true {
                    return Err(
                        "La revisión contiene bloqueos; no se inicia una migración incompleta"
                            .into(),
                    );
                }
                if pending(state)
                    || hash(&project_row(&self.registry_checked()?, project)?)
                        != attempt["sourceRegistryStamp"]
                    || state["binding"] != attempt["sourceBinding"]
                    || Self::pd_stamp(
                        &self.pd_lifecycle_snapshot(
                            project,
                            root,
                            attempt["logicalProjectId"]
                                .as_str()
                                .ok_or("Identidad ausente")?,
                            "start",
                        )?,
                    ) != attempt["sourceStamp"]
                {
                    return Err("La fuente cambió desde la revisión; revisa de nuevo sin perder las ediciones".into());
                }
                attempt["originalPaused"] = json!(self.pd_paused(project, state)?);
                attempt["phase"] = json!("staging");
                attempt["detail"]=json!("Preparación registrada. El origen se conserva y sus envíos automáticos quedan en pausa en este dispositivo.");
                attempt = self.pd_migration_save(project, state, &mut lc, attempt)?;
                self.pd_migration_policy(project, state, true)?;
            }
            Some("staging" | "verifying" | "needs-review") => {
                if state["binding"] != attempt["sourceBinding"]
                    || hash(&project_row(&self.registry_checked()?, project)?)
                        != attempt["sourceRegistryStamp"]
                {
                    return self.pd_migration_problem(project,state,&mut lc,attempt,"La asociación cambió. Conserva y cancela el intento antes de revisar otra migración.".into());
                }
            }
            _ => return Err("Fase de migración incompatible; se conserva".into()),
        }
        self.pd_migration_stage(project, root, state, &mut lc, attempt)
    }
    fn pd_migration_cancel(
        &self,
        project: &str,
        state: &mut Value,
        payload: Value,
    ) -> Result<Value, String> {
        let mut lc = lifecycle(state)?;
        let mut attempt = lc["migration"].clone();
        valid_review(&attempt, &payload)?;
        if attempt["phase"] == "cancelled" {
            return Ok(attempt_dto(&attempt));
        }
        if matches!(attempt["phase"].as_str(), Some("switching" | "complete")) {
            return Err("El cambio ya se está confirmando. Consulta y termina el mismo intento; volver después requiere otra migración.".into());
        }
        if state["binding"] != attempt["sourceBinding"] {
            return Err("La asociación cambió; se conserva el intento para revisar".into());
        }
        if attempt["phase"] != "reviewed" {
            state["paused"] = json!(self.pd_migration_restore_policy(project, state, &attempt)?);
        }
        attempt["phase"] = json!("cancelled");
        attempt["detail"]=json!("Cancelado. El origen sigue asociado; las preparaciones verificables se conservan y no se borró contenido remoto.");
        let saved = self.pd_migration_save(project, state, &mut lc, attempt)?;
        Ok(attempt_dto(&saved))
    }
    pub fn prepare_proton_migration_ack(
        &self,
        project: &str,
        body: Value,
    ) -> Result<Value, String> {
        self.proton_direct(project, "migration-ack-review", body)
    }
    pub fn finalize_proton_migration_ack(
        &self,
        project: &str,
        body: Value,
    ) -> Result<Value, String> {
        self.proton_direct(project, "migration-finalize", body)
    }
    fn pd_migration_ack_review(
        &self,
        project: &str,
        root: &Path,
        state: &mut Value,
        payload: Value,
    ) -> Result<Value, String> {
        let mut lc = lifecycle(state)?;
        let mut attempt = lc["migration"].clone();
        let identifier = payload.get("attemptId").or_else(|| payload.get("id"));
        let prior_ack = identifier == Some(&attempt["id"])
            && payload["revision"] == attempt["ackRequestRevision"];
        if !prior_ack {
            valid_review(&attempt, &payload)?;
        }
        if matches!(attempt["phase"].as_str(), Some("switching" | "complete")) {
            return Ok(
                json!({"attemptId":attempt["id"],"revision":attempt["revision"],"ackToken":attempt["ackReview"]["token"]}),
            );
        }
        if attempt["phase"] != "ready" {
            return Err("Prepara y verifica el destino antes de confirmar".into());
        }
        if pending(state) || state["binding"] != attempt["sourceBinding"] {
            return Err(
                "El origen tiene cambios de asociación o intentos pendientes; se conserva".into(),
            );
        }
        let current_row = project_row(&self.registry_checked()?, project)?;
        let before = self.pd_lifecycle_snapshot(
            project,
            root,
            attempt["logicalProjectId"]
                .as_str()
                .ok_or("Identidad ausente")?,
            "ack",
        )?;
        if Self::pd_stamp(&before) != attempt["stagedStamp"]
            || hash(&current_row) != attempt["sourceRegistryStamp"]
        {
            let error="El contenido o la configuración cambió después de preparar. Reanuda para incluir las nuevas ediciones.".to_owned();
            self.pd_migration_problem(project, state, &mut lc, attempt, error.clone())?;
            return Err(error);
        }
        let verification: Result<Value, String> = (|| {
            if self.pd_migration_source_stamp(root, &attempt)? != attempt["sourceRemoteStamp"] {
                return Err("El origen remoto cambió; concilia y revisa antes de activar".into());
            }
            match attempt["target"].as_str() {
                Some("proton") => {
                    self.pd_verify_migration_destination(project, &attempt)?;
                    let binding = json!({"accountId":attempt["destination"]["accountId"],"remoteRootId":attempt["destination"]["remoteRootId"]});
                    let stamp = self.pd_migration_remote_stamp(
                        &binding,
                        attempt["logicalProjectId"].as_str().unwrap(),
                        None,
                    )?;
                    if attempt["destination"]["verifiedRemoteStamp"] != stamp {
                        return Err("El destino recibió cambios después de preparar; se conservan y requieren nueva revisión".into());
                    }
                    Ok(json!(stamp))
                }
                Some("github") => {
                    let check = self.proton_github_migration_check(project, root, true, false)?;
                    if check["stamp"] != attempt["destination"]["github"]["stamp"] {
                        return Err("GitHub cambió desde la preparación; vuelve a revisar sin forzar el envío".into());
                    }
                    Ok(check["stamp"].clone())
                }
                Some("local") => Ok(Value::Null),
                _ => Err("Destino incompatible".into()),
            }
        })();
        let target_stamp = match verification {
            Ok(stamp) => stamp,
            Err(error) => {
                self.pd_migration_problem(project, state, &mut lc, attempt, error.clone())?;
                return Err(error);
            }
        };
        let after = self.pd_lifecycle_snapshot(
            project,
            root,
            attempt["logicalProjectId"].as_str().unwrap(),
            "ack",
        )?;
        if Self::pd_stamp(&after) != attempt["stagedStamp"] {
            let error="Se guardaron ediciones durante la comprobación. El origen continúa activo; reanuda para incluirlas.".to_owned();
            self.pd_migration_problem(project, state, &mut lc, attempt, error.clone())?;
            return Err(error);
        }
        attempt["ackRequestRevision"] = payload["revision"].clone();
        attempt["ackReview"] = json!({"token":id(),"rootStamp":attempt["stagedStamp"],"registryStamp":attempt["sourceRegistryStamp"],"targetStamp":target_stamp,"checkedAt":knownext_core::now_iso()});
        let saved = self.pd_migration_save(project, state, &mut lc, attempt)?;
        Ok(
            json!({"attemptId":saved["id"],"revision":saved["revision"],"ackToken":saved["ackReview"]["token"]}),
        )
    }
    fn pd_migration_target_engine(&self, state: &Value, attempt: &Value) -> Result<Value, String> {
        let mut engine = engine_only(state);
        let generation = state["generation"]
            .as_u64()
            .ok_or("Generación incompatible")?
            .checked_add(1)
            .ok_or("Generación agotada")?;
        if attempt["target"] == "proton" {
            let manifest: Manifest = serde_json::from_value(attempt["stagedManifest"].clone())
                .map_err(|_| "Preparación incompatible")?;
            let prior = &attempt["destination"]["priorEngine"];
            if prior.is_object() {
                engine = engine_only(prior);
            } else {
                for field in [
                    "basePublications",
                    "baseDirectoryPublications",
                    "heads",
                    "manifestStamps",
                ] {
                    engine[field] = json!({});
                }
                engine["seen"] = json!([]);
            }
            engine["deviceId"] = state["deviceId"].clone();
            engine["projectId"] = state["projectId"].clone();
            engine["schemaVersion"] = json!(1);
            engine["base"] = json!({});
            engine["baseDirectories"] = json!({});
            engine["baseDirectoryStamps"] = json!({});
            if !engine["basePublications"].is_object() {
                engine["basePublications"] = json!({});
            }
            if !engine["baseDirectoryPublications"].is_object() {
                engine["baseDirectoryPublications"] = json!({});
            }
            let old_files = engine["basePublications"]
                .as_object()
                .unwrap()
                .keys()
                .cloned()
                .collect::<Vec<_>>();
            for path in old_files {
                engine["basePublications"][&path] = json!(manifest.publication_id);
            }
            let old_directories = engine["baseDirectoryPublications"]
                .as_object()
                .unwrap()
                .keys()
                .cloned()
                .collect::<Vec<_>>();
            for path in old_directories {
                engine["baseDirectories"][&path] = json!(manifest.directories.contains(&path));
                engine["baseDirectoryPublications"][&path] = json!(manifest.publication_id);
            }
            for file in manifest.files.keys() {
                engine["base"][file] = json!(manifest.files[file].sha256);
                engine["basePublications"][file] = json!(manifest.publication_id);
            }
            for directory in &manifest.directories {
                engine["baseDirectories"][directory] = json!(true);
                engine["baseDirectoryPublications"][directory] = json!(manifest.publication_id);
            }
            if !engine["seen"].is_array() {
                engine["seen"] = json!([]);
            }
            if !engine["seen"]
                .as_array()
                .unwrap()
                .contains(&json!(manifest.publication_id))
            {
                engine["seen"]
                    .as_array_mut()
                    .unwrap()
                    .push(json!(manifest.publication_id));
            }
            if !engine["heads"].is_object() {
                engine["heads"] = json!({});
            }
            engine["heads"][&manifest.sender_id] = json!(manifest.publication_id);
            if !engine["manifestStamps"].is_object() {
                engine["manifestStamps"] = json!({});
            }
            engine["manifestStamps"][&manifest.publication_id] =
                json!(snapshots::manifest_hash(&manifest).map_err(|_| "Publicación incompatible")?);
            engine["causal"] = json!(manifest.publication_id);
            engine["lastSentStamp"] = attempt["stagedStamp"].clone();
            engine["lastSyncedAt"] = json!(knownext_core::now_iso());
            engine["verifiedCurrent"] = json!(true);
            engine["binding"] = json!({"accountId":attempt["destination"]["accountId"],"accountRootId":attempt["destination"]["accountRootId"],"remoteRootId":attempt["destination"]["remoteRootId"],"logicalProjectId":attempt["logicalProjectId"],"generation":generation});
            let lc = lifecycle(state)?;
            let mut accepted = engine["acceptedRelocations"]
                .as_array()
                .cloned()
                .unwrap_or_default();
            for receipt in lc["receipts"].as_array().unwrap() {
                if receipt["sourceBinding"]["remoteRootId"]
                    == attempt["destination"]["remoteRootId"]
                    && receipt["sourceBinding"]["accountId"] == attempt["destination"]["accountId"]
                    && !accepted.contains(&receipt["id"])
                {
                    accepted.push(receipt["id"].clone());
                }
            }
            engine["acceptedRelocations"] = json!(accepted);
        } else {
            engine["binding"] = Value::Null;
            engine["verifiedCurrent"] = json!(false);
            engine["lastSyncedAt"] = Value::Null;
        }
        engine["generation"] = json!(generation);
        engine["paused"] = json!(true);
        engine["review"] = Value::Null;
        engine["eventCursor"] = Value::Null;
        engine["receiveAttempt"] = Value::Null;
        engine["publishAttempt"] = Value::Null;
        engine["conflicts"] = json!([]);
        engine["choices"] = json!({});
        engine["lastError"] = Value::Null;
        engine["failures"] = json!(0);
        engine["nextAttemptAt"] = json!(0);
        engine["relocationNotice"] = Value::Null;
        Ok(engine)
    }
    // Called only under the runtime mutation lane. All remote verification is in ack-review.
    fn pd_migration_ack(
        &self,
        project: &str,
        root: &Path,
        state: &mut Value,
        payload: Value,
    ) -> Result<Value, String> {
        let mut lc = lifecycle(state)?;
        let mut attempt = lc["migration"].clone();
        valid_review(&attempt, &payload)?;
        if attempt["phase"] == "complete" {
            return Ok(attempt_dto(&attempt));
        }
        if payload["ackToken"] != attempt["ackReview"]["token"]
            || !attempt["ackReview"]["token"].is_string()
        {
            return Err("Falta la comprobación final; consulta antes de confirmar".into());
        }
        if !matches!(attempt["phase"].as_str(), Some("ready" | "switching")) {
            return Err("El intento no está listo para cambiar la asociación".into());
        }
        let _transaction = self.project_transaction(project)?;
        if self.pd_project_root(project)? != root {
            return Err("La ubicación cambió; no se sobrescribe la asociación".into());
        }
        let local_stamp = Self::pd_stamp(
            &self.pd_lifecycle_snapshot(
                project,
                root,
                attempt["logicalProjectId"]
                    .as_str()
                    .ok_or("Identidad ausente")?,
                "commit",
            )?,
        );
        let local_changed = local_stamp != attempt["ackReview"]["rootStamp"];
        let mut registry = self.registry_checked()?;
        let current = project_row(&registry, project)?;
        if attempt["phase"] == "ready" {
            if local_changed {
                let error="El contenido cambió antes de activar. Reanuda para incluir las nuevas ediciones.".to_owned();
                self.pd_migration_problem(project, state, &mut lc, attempt, error.clone())?;
                return Err(error);
            }
            if hash(&current) != attempt["sourceRegistryStamp"]
                || state["binding"] != attempt["sourceBinding"]
            {
                return Err("La asociación cambió; revisa antes de activar".into());
            }
            let mut after = current.clone();
            after["syncMigrationId"] = attempt["id"].clone();
            after["syncMode"] = json!(if attempt["target"] == "github" {
                "manual-github"
            } else {
                "none"
            });
            if attempt["target"] == "github" {
                after["githubRepository"] = attempt["destination"]["github"]["repository"].clone();
                after["versioningMode"] = json!("local-git");
                after["isGitRepository"] = json!(true);
            }
            let target = self.pd_migration_target_engine(state, &attempt)?;
            attempt["phase"] = json!("switching");
            attempt["switch"] = json!({"beforeRegistry":current,"afterRegistry":after,"afterEngine":target,"committed":false});
            attempt["detail"] = json!(
                "Confirmando la asociación local. El origen y las preparaciones se conservan."
            );
            attempt = self.pd_migration_save(project, state, &mut lc, attempt)?;
        }
        let association = |row: &Value| json!({"id":row["id"],"folderPath":row["folderPath"],"syncMode":row["syncMode"],"versioningMode":row["versioningMode"],"githubRepository":row["githubRepository"],"syncMigrationId":row["syncMigrationId"]});
        let registry_after =
            association(&current) == association(&attempt["switch"]["afterRegistry"]);
        let registry_before =
            association(&current) == association(&attempt["switch"]["beforeRegistry"]);
        if !registry_after && !registry_before {
            return Err("El registro cambió durante la confirmación; no se sobrescribe".into());
        }
        if attempt["switch"]["committed"] != true {
            if !registry_after && local_changed {
                attempt.as_object_mut().unwrap().remove("switch");
                attempt.as_object_mut().unwrap().remove("ackReview");
                let error="El origen sigue asociado y hay nuevas ediciones. Reanuda la preparación antes de confirmar.".to_owned();
                self.pd_migration_problem(project, state, &mut lc, attempt, error.clone())?;
                return Err(error);
            }
            if !registry_after {
                let rows = registry["projects"]
                    .as_array_mut()
                    .ok_or("Registro incompatible")?;
                let row = rows
                    .iter_mut()
                    .find(|row| row["id"] == project)
                    .ok_or("Proyecto no registrado")?;
                for field in [
                    "syncMode",
                    "versioningMode",
                    "isGitRepository",
                    "githubRepository",
                    "syncMigrationId",
                ] {
                    row[field] = attempt["switch"]["afterRegistry"][field].clone();
                }
                self.write_registry(&registry)?;
            }
            let mut target = attempt["switch"]["afterEngine"].clone();
            if local_changed {
                target["verifiedCurrent"] = json!(false);
                target["lastSyncedAt"] = Value::Null;
                attempt["pendingLocalChanges"] = json!(true);
            }
            restore_engine(state, &target);
            attempt["switch"]["committed"] = json!(true);
            attempt["detail"]=json!("Nueva asociación local confirmada. Completando el aviso al origen; las ediciones posteriores permanecen pendientes.");
            attempt = self.pd_migration_save(project, state, &mut lc, attempt)?;
            if local_changed {
                self.proton_note_local_change(project)?;
            }
        }
        Ok(attempt_dto(&attempt))
    }
    fn pd_migration_finalize(
        &self,
        project: &str,
        state: &mut Value,
        lc: &mut Value,
        mut attempt: Value,
    ) -> Result<Value, String> {
        if attempt["phase"] == "complete" {
            return Ok(attempt_dto(&attempt));
        }
        if attempt["phase"] != "switching" || attempt["switch"]["committed"] != true {
            return Err(
                "La asociación todavía no está confirmada; consulta antes de continuar".into(),
            );
        }
        if attempt["sourceKind"] == "proton" && attempt["localRecovery"] != true {
            let temporary = json!({"binding":attempt["sourceBinding"]});
            let notice = json!({"schemaVersion":1,"kind":"knownext-project-relocation","logicalProjectId":attempt["logicalProjectId"],"attemptId":attempt["id"],"sourceGeneration":attempt["sourceBinding"]["generation"],"sourceBase":attempt["sourceEngine"]["causal"],"sourceStamp":attempt["sourceEngine"]["lastSentStamp"],"destinationProvider":attempt["target"],"destinationStorageId":attempt["destination"]["storageId"],"createdAt":attempt["createdAt"]});
            let outcome = self.pd_put(
                &temporary,
                attempt["sourceBinding"]["remoteRootId"]
                    .as_str()
                    .ok_or("Origen no verificable")?,
                &format!(
                    "relocation-{}.json",
                    attempt["id"].as_str().ok_or("Identidad ausente")?
                ),
                &serde_json::to_vec(&notice).map_err(|_| "Aviso incompatible")?,
            );
            if let Err(error) = outcome {
                attempt["detail"]=json!(format!("Asociación local confirmada; aviso al origen pendiente: {error}. Reanuda el mismo intento, sin repetir el cambio."));
                let saved = self.pd_migration_save(project, state, lc, attempt)?;
                return Ok(attempt_dto(&saved));
            }
            attempt["sourceNoticeConfirmed"] = json!(true);
        }
        state["paused"] = json!(self.pd_migration_restore_policy(project, state, &attempt)?);
        if lc["receipts"].as_array().unwrap().len() >= 256 {
            return Err("El registro de migraciones alcanzó su límite conservador; no se retiran bases automáticamente".into());
        }
        let receipt = json!({"id":attempt["id"],"logicalProjectId":attempt["logicalProjectId"],"sourceBinding":attempt["sourceBinding"],"sourceEngine":attempt["sourceEngine"],"sourceRegistry":attempt["sourceRegistry"],"destinationProvider":attempt["target"],"destinationBinding":state["binding"],"completedAt":knownext_core::now_iso(),"sourcePreserved":true,"localRecovery":attempt["localRecovery"]});
        if !lc["receipts"]
            .as_array()
            .unwrap()
            .iter()
            .any(|row| row["id"] == receipt["id"])
        {
            lc["receipts"].as_array_mut().unwrap().push(receipt);
        }
        attempt["phase"] = json!("complete");
        attempt["receiptId"] = attempt["id"].clone();
        attempt["fullyMigrated"] =
            json!(attempt["localRecovery"] != true && attempt["pendingLocalChanges"] != true);
        attempt["detail"] = json!(if attempt["pendingLocalChanges"] == true {
            "Cambio de asociación recuperado. Las nuevas ediciones locales se conservan y quedan pendientes de sincronizar; no se anuncia Al día."
        } else if attempt["localRecovery"] == true {
            "Recuperación local completada. No se confirmó todo el origen remoto ni se actualizan otros dispositivos automáticamente."
        } else {
            "Cambio completado y verificado en este dispositivo. El origen y el historial local se conservan; conecta y revisa los demás dispositivos por separado."
        });
        attempt.as_object_mut().unwrap().remove("switch");
        attempt.as_object_mut().unwrap().remove("sourceEngine");
        attempt.as_object_mut().unwrap().remove("stagedManifest");
        let saved = self.pd_migration_save(project, state, lc, attempt)?;
        Ok(attempt_dto(&saved))
    }
    pub(super) fn pd_lifecycle(
        &self,
        project: &str,
        root: &Path,
        state: &mut Value,
        action: &str,
        payload: Value,
    ) -> Result<Value, String> {
        match action {
            "storage" => self.pd_storage(project, root, state),
            "retention-review" => self.pd_retention_review(project, root, state),
            "retention-apply" => self.pd_retention_apply(project, root, state, payload),
            "retention-cancel" => self.pd_retention_cancel(project, root, state, payload),
            "migration-review" => self.pd_migration_review(project, root, state, payload),
            "migration-start" => self.pd_migration_start(project, root, state, payload),
            "migration-cancel" => self.pd_migration_cancel(project, state, payload),
            "migration-ack-review" => self.pd_migration_ack_review(project, root, state, payload),
            "migration-ack" => self.pd_migration_ack(project, root, state, payload),
            "migration-finalize" => {
                let mut lc = lifecycle(state)?;
                let attempt = lc["migration"].clone();
                let requested = payload.get("attemptId").or_else(|| payload.get("id"));
                if requested.is_some() && requested != Some(&attempt["id"]) {
                    return Err("El intento cambió; consulta antes de continuar".into());
                }
                self.pd_migration_finalize(project, state, &mut lc, attempt)
            }
            "migration-query" => {
                let lc = lifecycle(state)?;
                Ok(
                    json!({"attempt":attempt_dto(&lc["migration"]),"review":if lc["migration"]["phase"]=="reviewed"{review_dto(&lc["migration"])}else{Value::Null},"receipt":lc["receipts"].as_array().unwrap().last()}),
                )
            }
            _ => Err("Acción de conservación no compatible".into()),
        }
    }
}
