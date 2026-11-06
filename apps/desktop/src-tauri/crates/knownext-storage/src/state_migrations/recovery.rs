//! Explicit continuation and restoration share one frozen cohort review.
use super::*;

struct File {
    key: String,
    filename: String,
    original: Option<Vec<u8>>,
    target: Option<Vec<u8>>,
    status: String,
}
struct Snapshot {
    path: PathBuf,
    manifest: Value,
    manifest_sha: String,
    files: Vec<File>,
    expected: BTreeMap<String, Option<String>>,
    review: Value,
}
fn snapshot(api: &LocalApi, id: &str) -> Result<Snapshot, String> {
    let retention_status = retention::status(api, id)?;
    let (path, manifest, manifest_sha) = journal(api, id)?;
    let mut files = vec![];
    let mut rows = vec![];
    let mut expected = BTreeMap::new();
    let mut cohort_compatible = true;
    // Include absent/non-cohort critical stores in the revision and guards too.
    for (key, filename, store, _) in STORES {
        let current = bytes(&api.app_data_dir.join(filename), LIMIT);
        let fingerprint = match current {
            Ok(Some(content)) => {
                cohort_compatible &=
                    local_state::decode(store, &content).is_ok_and(|value| !secret_fields(&value));
                Some(sha256_hex(&content))
            }
            Ok(None) => None,
            Err(_) => {
                cohort_compatible = false;
                None
            }
        };
        expected.insert(key.into(), fingerprint);
    }
    for entry in manifest["entries"].as_array().unwrap() {
        let key = entry["id"].as_str().unwrap();
        let (_, filename, store, current_version) =
            STORES.iter().find(|(known, ..)| *known == key).unwrap();
        let backup = bytes(&path.join(format!("{filename}.original")), LIMIT)
            .ok()
            .flatten();
        let backup_verified = backup
            .as_ref()
            .is_some_and(|value| sha256_hex(value) == entry["before"]);
        let backup_compatible = backup_verified
            && backup.as_ref().is_some_and(|value| {
                local_state::decode(*store, value).is_ok_and(|value| !secret_fields(&value))
            });
        let original = backup.filter(|_| backup_compatible);
        let mut target = original
            .as_ref()
            .and_then(|source| {
                prepare(key, filename, *store, *current_version, source.clone()).ok()
            })
            .map(|value| value.target)
            .filter(|value| sha256_hex(value) == entry["after"]);
        let current = bytes(&api.app_data_dir.join(filename), LIMIT);
        let (status, fingerprint) = match current {
            Ok(Some(content)) => {
                let hash = sha256_hex(&content);
                // Older known upgrades may have introduced a timestamp. An
                // already-applied, compatible exact target can be observed;
                // never guess that timestamp for a still-original file.
                if target.is_none()
                    && hash == entry["after"]
                    && local_state::decode(*store, &content)
                        .is_ok_and(|value| !secret_fields(&value))
                {
                    target = Some(content);
                }
                (
                    if hash == entry["before"] {
                        "original"
                    } else if hash == entry["after"] {
                        "applied"
                    } else {
                        "changed"
                    },
                    Some(hash),
                )
            }
            Ok(None) => ("missing", None),
            Err(_) => ("unavailable", None),
        };
        expected.insert(key.into(), fingerprint.clone());
        rows.push(json!({"id":key,"filename":filename,"status":status,"fingerprint":fingerprint,"backupVerified":backup_verified,"backupCompatible":backup_compatible,"targetVerified":target.is_some()}));
        files.push(File {
            key: key.into(),
            filename: filename.to_string(),
            original,
            target,
            status: status.into(),
        });
    }
    let recoverable = retention_status == "active"
        && cohort_compatible
        && files.iter().all(|file| {
            file.original.is_some() && matches!(file.status.as_str(), "original" | "applied")
        });
    let can_restore = recoverable && files.iter().any(|file| file.status == "applied");
    let can_complete = recoverable
        && files.iter().all(|file| file.target.is_some())
        && manifest.get("trigger").is_none_or(Value::is_null)
        && matches!(manifest["status"].as_str(), Some("prepared" | "applying"))
        && manifest["entries"]
            .as_array()
            .unwrap()
            .iter()
            .any(|entry| entry["before"] != entry["after"]);
    let complete_reason = if can_complete {
        None
    } else {
        Some(if retention_status != "active" {
            "Este punto está archivado o pendiente de eliminación; revisa su conservación antes de reabrirlo."
        } else if !recoverable {
            "Hay estados posteriores o copias no verificadas; se conservan sin completar."
        } else if manifest
            .get("trigger")
            .is_some_and(|value| !value.is_null())
        {
            "Una escritura ordinaria puede contener decisiones nuevas. Se conserva para recuperar o revisar; no se reconstruye su intención."
        } else if files.iter().any(|file| file.target.is_none()) {
            "El destino no puede reconstruirse exactamente con esta aplicación; se conservan los originales."
        } else {
            "Este punto no corresponde a una actualización interrumpida pendiente."
        })
    };
    let revision = sha256_hex(
        &serde_json::to_vec(&json!({"manifest":manifest_sha,"entries":rows,"cohort":expected,"cohortCompatible":cohort_compatible}))
            .map_err(|_| "No se pudo preparar la revisión del conjunto")?,
    );
    let review = json!({"schemaVersion":1,"id":id,"checkedAt":knownext_core::now_iso(),"revision":revision,"entries":rows,"canRestore":can_restore,"canComplete":can_complete,"completionReason":complete_reason,"journalStatus":manifest["status"],"retentionStatus":retention_status});
    Ok(Snapshot {
        path,
        manifest,
        manifest_sha,
        files,
        expected,
        review,
    })
}
fn copies_match(state: &Snapshot) -> Result<(), String> {
    for file in &state.files {
        if bytes(
            &state.path.join(format!("{}.original", file.filename)),
            LIMIT,
        )?
        .as_deref()
            != file.original.as_deref()
        {
            return Err("Una copia original cambió; se conservan los estados actuales y se requiere otra revisión".into());
        }
    }
    Ok(())
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Request {
    revision: String,
}
fn change(api: &LocalApi, id: &str, payload: Value, complete: bool) -> Result<Value, String> {
    retention::ensure_active(api, id)?;
    let request: Request = serde_json::from_value(payload)
        .map_err(|_| "Se necesita una revisión completa del punto de recuperación")?;
    let mut state = snapshot(api, id)?;
    if state.review["revision"] != request.revision
        || state.review[if complete {
            "canComplete"
        } else {
            "canRestore"
        }] != true
    {
        return Err("El conjunto ya no coincide con la revisión recuperable. Se conserva sin sobrescribir cambios posteriores".into());
    }
    for index in 0..state.files.len() {
        let file = &state.files[index];
        let target = if complete {
            file.target.as_ref()
        } else {
            file.original.as_ref()
        }
        .ok_or("No hay un contenido exacto verificado para este paso")?;
        if state
            .expected
            .get(&file.key)
            .and_then(|hash| hash.as_deref())
            == Some(sha256_hex(target).as_str())
        {
            continue;
        }
        if state_matches(api, &state.expected)
            .and_then(|_| unchanged_journal(api, id, &state.manifest_sha))
            .is_err()
        {
            return Ok(result(id,"review-required","Cambió el conjunto o su diario durante la operación. Se conservan los pasos confirmados y se requiere otra revisión",true));
        }
        // Recheck every original, including those whose current file needs no write.
        if copies_match(&state).is_err() {
            return Ok(result(id,"review-required","Una copia original cambió; se conservan los estados actuales y se requiere otra revisión",true));
        }
        let destination = api.app_data_dir.join(&file.filename);
        if atomic_io::write(&destination, target).is_err() {
            return Ok(result(id,"review-required","No se confirmó una escritura del conjunto. Las copias se conservan; consulta los estados antes de otra acción",true));
        }
        state
            .expected
            .insert(file.key.clone(), Some(sha256_hex(target)));
        if complete {
            state.manifest["entries"][index]["applied"] = json!(true);
            state.manifest["status"] = json!("applying");
            match write_journal(&state.path,&state.manifest,Some(&state.manifest_sha)){Ok(hash)=>state.manifest_sha=hash,Err(_)=>return Ok(result(id,"review-required","El estado cambió, pero el diario no quedó confirmado. Consulta el conjunto; no se repite automáticamente",true))}
        }
    }
    if state_matches(api, &state.expected)
        .and_then(|_| unchanged_journal(api, id, &state.manifest_sha))
        .and_then(|_| copies_match(&state))
        .is_err()
    {
        return Ok(result(
            id,
            "review-required",
            "Cambió el conjunto al terminar; se conservan los estados y sus copias",
            true,
        ));
    }
    if complete {
        for entry in state.manifest["entries"].as_array_mut().unwrap() {
            entry["applied"] = json!(true);
        }
    }
    state.manifest["status"] = json!(if complete { "completed" } else { "restored" });
    if write_journal(&state.path, &state.manifest, Some(&state.manifest_sha)).is_err() {
        return Ok(result(id,"review-required","Los estados están escritos; no se confirmó el diario final. Revisa antes de otra acción",true));
    }
    Ok(result(
        id,
        if complete { "completed" } else { "restored" },
        if complete {
            "Actualización completada con los destinos exactos revisados. Se conservan los originales y se volverá a leer el espacio de trabajo."
        } else {
            "Originales revisados recuperados. Las copias permanecen y se volverá a leer el espacio de trabajo."
        },
        true,
    ))
}
impl LocalApi {
    pub(crate) fn review_upgrade_recovery(&self, id: &str) -> Result<Value, String> {
        Ok(snapshot(self, id)?.review)
    }
    pub(crate) fn restore_upgrade_recovery(
        &self,
        id: &str,
        payload: Value,
    ) -> Result<Value, String> {
        change(self, id, payload, false)
    }
    pub(crate) fn complete_upgrade_recovery(
        &self,
        id: &str,
        payload: Value,
    ) -> Result<Value, String> {
        change(self, id, payload, true)
    }
}
