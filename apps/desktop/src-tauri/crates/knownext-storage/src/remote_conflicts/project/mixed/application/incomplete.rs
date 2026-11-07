//! Read-only last-resort extraction. Metadata is never interpreted as authority or repaired.
use super::*;
use std::io::{Cursor, Write};
struct Snapshot {
    review: Value,
    bytes: std::collections::BTreeMap<String, Vec<u8>>,
}
fn candidate(name: &str) -> Option<(usize, &'static str, bool)> {
    let (plain, compact) = name
        .strip_suffix(".zip")
        .map_or((name, false), |s| (s, true));
    if plain.len() != 14 && plain.len() != 13 {
        return None;
    }
    let (number, side) = plain.split_once('-')?;
    if number.len() != 3 || !number.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    let index = number.parse::<usize>().ok().filter(|n| *n < MAX_ROWS)?;
    Some((
        index,
        match side {
            "before.bin" => "before",
            "after.bin" => "after",
            _ => return None,
        },
        compact,
    ))
}
fn marker(folder: &Path, name: &str, budget: &mut u64) -> Value {
    let path = folder.join(name);
    match fs::symlink_metadata(&path) {
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => json!({"state":"missing"}),
        _ => match bounded(&path, RECORD_LIMIT, budget) {
            Ok(bytes) => json!({"state":"present","sha256":sha256_hex(&bytes)}),
            Err(_) => json!({"state":"unavailable"}),
        },
    }
}
fn snapshot(api: &LocalApi, project: &str, id: &str) -> Result<Snapshot, String> {
    let folder = store(api, project, id, false)?;
    if !directory(&folder)? {
        return Err("No hay una carpeta de copias conservadas para esta selección".into());
    }
    let location = folder
        .canonicalize()
        .map_err(|_| "No se puede comprobar la carpeta de copias")?;
    let mut budget = 64 * 1024 * 1024;
    let record = marker(&folder, "record.json", &mut budget);
    let completed = marker(&folder, "completed.json", &mut budget);
    let retirement = marker(&folder, "retirement.json", &mut budget);
    let mut paths = vec![];
    let mut ignored = 0usize;
    let mut limited = false;
    for (index, entry) in fs::read_dir(&folder)
        .map_err(|_| "No se puede consultar el inventario; se conserva")?
        .enumerate()
    {
        if index >= 1027 {
            limited = true;
            break;
        }
        let Ok(entry) = entry else {
            limited = true;
            continue;
        };
        let Some(name) = entry.file_name().to_str().map(str::to_owned) else {
            limited = true;
            continue;
        };
        if candidate(&name).is_some() {
            paths.push((name, entry.path()));
        } else if !matches!(
            name.as_str(),
            "record.json" | "completed.json" | "retirement.json"
        ) {
            ignored += 1;
        }
    }
    limited |= ignored > 0;
    paths.sort_by(|a, b| a.0.cmp(&b.0));
    let mut rows = vec![];
    let mut bytes = std::collections::BTreeMap::new();
    for (name, path) in paths {
        let (slot, side, compact) = candidate(&name).ok_or("Nombre no compatible")?;
        let raw = bounded(
            &path,
            if compact {
                recovery_copy_storage::PACKED_LIMIT
            } else {
                FILE_LIMIT
            },
            &mut budget,
        )
        .and_then(|raw| {
            if compact {
                recovery_copy_storage::unpack_resource(&raw, &mut budget)
            } else {
                Ok(raw)
            }
        });
        match raw {
            Ok(raw) => {
                rows.push(json!({"key":name,"slot":slot,"side":side,"representation":if compact{"compact"}else{"plain"},"status":"readable","bytes":raw.len(),"sha256":sha256_hex(&raw)}));
                bytes.insert(name, raw);
            }
            Err(_) => {
                limited = true;
                rows.push(json!({"key":name,"slot":slot,"side":side,"representation":if compact{"compact"}else{"plain"},"status":"unavailable","bytes":null,"sha256":null}));
            }
        }
    }
    if folder.canonicalize().ok().as_ref() != Some(&location) || !directory(&folder)? {
        return Err("La ubicación cambió durante la consulta; revisa sin repetir".into());
    }
    let basis = json!({"project":project,"plan":id,"location":location.to_string_lossy(),"rows":rows,"record":record,"completed":completed,"retirement":retirement,"ignored":ignored,"limited":limited});
    let revision = sha256_hex(
        &serde_json::to_vec(&basis).map_err(|_| "No se pudo identificar el inventario")?,
    );
    Ok(Snapshot {
        review: json!({"schemaVersion":1,"projectId":project,"planId":id,"revision":revision,"recordState":record["state"],"rows":rows,"ignoredCount":ignored,"limited":limited,"provenanceVerified":false,"canApply":false,"canDelete":false,"canReprepare":can_reprepare(api,project,id),"canAbandon":abandonable(api,project,id).is_some(),"checkedAt":knownext_core::now_iso()}),
        bytes,
    })
}
fn abandonable(
    api: &LocalApi,
    project: &str,
    id: &str,
) -> Option<(Record, String, PathBuf, PathBuf)> {
    let (record, digest, folder) = load_inner(api, project, id, false).ok()??;
    let root = api.project_root(project).ok()?.canonicalize().ok()?;
    if sha256_hex(root.to_string_lossy().as_bytes()) != record.location {
        return None;
    }
    let guard = admission(api, &record, &digest).ok()?;
    mixed_application_guard::can_release(&root, &guard).ok()?;
    match fs::symlink_metadata(folder.join("completed.json")) {
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => (),
        Ok(_) => {
            let raw = bounded(&folder.join("completed.json"), 4096, &mut 4096).ok()?;
            let complete: Completed = serde_json::from_slice(&raw).ok()?;
            if complete.format != 1
                || complete.record_sha256 != digest
                || !matches!(complete.outcome.as_str(), "applied" | "abandoned")
                || !mixed_application_guard::owns(&root, &guard)
            {
                return None;
            }
        }
        _ => return None,
    }
    Some((record, digest, folder, root))
}
fn can_reprepare(api: &LocalApi, project: &str, id: &str) -> bool {
    if load(api, project, id).is_ok() {
        return false;
    }
    let Ok((plan, _)) = super::super::read(api, project, id) else {
        return false;
    };
    let Ok(source) = context(api, project) else {
        return false;
    };
    plan.location == sha256_hex(source.root.to_string_lossy().as_bytes())
        && plan.origin == source.origin_revision
        && plan.local_commit == source.local
        && plan.remote_commit == source.remote
        && plan.local_reference == source.local_reference
        && plan.remote_reference == source.remote_reference
}
impl LocalApi {
    pub(crate) fn abandon_incomplete_mixed(
        &self,
        project: &str,
        id: &str,
        body: Value,
    ) -> Result<Value, String> {
        #[derive(Deserialize)]
        #[serde(deny_unknown_fields)]
        struct Request {
            revision: String,
            acknowledge: bool,
        }
        let input: Request =
            serde_json::from_value(body).map_err(|_| "Confirmación de cierre no compatible")?;
        let _permit = self.project_transaction(project)?;
        if !input.acknowledge || snapshot(self, project, id)?.review["revision"] != input.revision {
            return Err("Revisa y confirma el cierre sin aplicar ni deshacer archivos".into());
        }
        let(record,digest,folder,root)=abandonable(self,project,id).ok_or("No se comprobó una preparación propia que pueda cerrarse. Se conservan todos los archivos")?;
        let guard = admission(self, &record, &digest)?;
        let marker = folder.join("completed.json");
        if fs::symlink_metadata(&marker).is_err() {
            if bounded(
                &folder.join("record.json"),
                RECORD_LIMIT,
                &mut RECORD_LIMIT.clone(),
            )?
            .as_slice()
                != serde_json::to_vec(&record)
                    .map_err(|_| "Recibo no comprobable")?
                    .as_slice()
            {
                return Err("El recibo cambió antes del cierre; se conserva".into());
            }
            let complete = Completed {
                format: 1,
                record_sha256: digest,
                completed_at: knownext_core::now_iso(),
                outcome: "abandoned".into(),
            };
            atomic_io::create(
                &marker,
                &serde_json::to_vec(&complete).map_err(|_| "No se pudo preparar el cierre")?,
            )
            .map_err(|_| "No se confirmó el cierre. Consulta sin repetir")?;
        }
        mixed_application_guard::release(&root, &guard)?;
        let mut result = snapshot(self, project, id)?.review;
        result["closed"] = json!(true);
        result["preservesOriginal"] = json!(true);
        result["changesWorkingFiles"] = json!(false);
        Ok(result)
    }

    pub(crate) fn reprepare_incomplete_mixed(
        &self,
        project: &str,
        id: &str,
        body: Value,
    ) -> Result<Value, String> {
        #[derive(Deserialize)]
        #[serde(deny_unknown_fields)]
        struct Request {
            revision: String,
            acknowledge: bool,
        }
        let input: Request = serde_json::from_value(body)
            .map_err(|_| "Confirmación de nueva preparación no compatible")?;
        if !input.acknowledge {
            return Err(
                "Confirma la creación de otra selección conservando todos los originales".into(),
            );
        }
        let _permit = self.project_transaction(project)?;
        let current = snapshot(self, project, id)?;
        if current.review["revision"] != input.revision || !can_reprepare(self, project, id) {
            return Err("La preparación o sus bases cambiaron. Se conserva todo y se requiere otra revisión".into());
        }
        let (plan, _) = super::super::read(self, project, id)?;
        let source = context(self, project)?;
        let new_id = format!(
            "mixed-{}",
            &sha256_hex(format!("reprepare/{project}/{id}/{}", input.revision).as_bytes())[..32]
        );
        let target = super::super::folder(self, project, false)?.join(format!("{new_id}.json"));
        if fs::symlink_metadata(&target).is_ok() {
            let existing = self.review_mixed_selection(project, &new_id)?;
            return Ok(
                json!({"projectId":project,"sourcePlanId":id,"planId":new_id,"status":"already-prepared","selection":existing,"preservesOriginal":true}),
            );
        }
        let choices = plan
            .rows
            .iter()
            .map(|r| json!({"path":r.path,"choice":r.choice}))
            .collect::<Vec<_>>();
        if snapshot(self, project, id)?.review["revision"] != input.revision {
            return Err("Las copias cambiaron antes de preparar; se conservan".into());
        }
        let selection = self.create_mixed_selection(
            project,
            json!({"id":new_id,"revision":source.revision,"choices":choices}),
        )?;
        Ok(
            json!({"projectId":project,"sourcePlanId":id,"planId":new_id,"status":"prepared","selection":selection,"preservesOriginal":true}),
        )
    }

    pub(crate) fn review_incomplete_mixed(&self, project: &str, id: &str) -> Result<Value, String> {
        snapshot(self, project, id).map(|s| s.review)
    }
    pub fn freeze_incomplete_mixed(
        &self,
        project: &str,
        id: &str,
        revision: &str,
        key: &str,
        acknowledge_unverified: bool,
    ) -> Result<crate::FrozenRecoveryCopy, String> {
        if !acknowledge_unverified || candidate(key).is_none() {
            return Err(
                "Elige una copia legible y confirma que su procedencia no está comprobada".into(),
            );
        }
        let s = snapshot(self, project, id)?;
        if s.review["revision"] != revision {
            return Err("Las copias o su inventario cambiaron; revisa antes de extraer".into());
        }
        let raw = s
            .bytes
            .get(key)
            .ok_or("La copia no es legible dentro de los límites; se conserva")?;
        let (slot, side, compact) = candidate(key).ok_or("Copia no compatible")?;
        let manifest = json!({"format":"knownext.recovered-bytes","schemaVersion":1,"slot":slot,"side":side,"representation":if compact{"compact"}else{"plain"},"file":"Contenido.bin","bytes":raw.len(),"sha256":sha256_hex(raw),"provenanceVerified":false,"authorityIncluded":false,"canApply":false});
        let mut writer = zip::ZipWriter::new(Cursor::new(Vec::new()));
        let options = zip::write::SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Stored)
            .unix_permissions(0o644);
        writer
            .start_file("knownext-extracted.json", options)
            .map_err(|_| "No se pudo preparar el manifiesto")?;
        writer
            .write_all(
                &serde_json::to_vec_pretty(&manifest)
                    .map_err(|_| "No se pudo conservar el manifiesto")?,
            )
            .map_err(|_| "No se pudo completar el manifiesto")?;
        writer
            .start_file("Contenido.bin", options)
            .map_err(|_| "No se pudo reservar el contenido")?;
        writer
            .write_all(raw)
            .map_err(|_| "No se pudo conservar el contenido completo")?;
        let archive = writer
            .finish()
            .map_err(|_| "No se pudo completar el ZIP de contenido")?
            .into_inner();
        let after = snapshot(self, project, id)?;
        if after.review["revision"] != revision {
            return Err("El inventario cambió antes de entregar; revisa las copias".into());
        }
        Ok(recovery_system::FrozenRecoveryCopy::project_package(
            format!(
                "Copia-{slot:03}-{}.zip",
                if side == "before" {
                    "anterior"
                } else {
                    "elegida"
                }
            ),
            archive,
        ))
    }
}
