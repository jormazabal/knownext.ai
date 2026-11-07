//! Bounded operation records. Unknown formats and later edits never become writable plans.
use super::*;
use std::io::Read;
use std::fs;
const MAX_BYTES: u64 = 16 * 1024 * 1024;
fn directory(path: &Path) -> Result<(), String> {
    let meta =
        fs::symlink_metadata(path).map_err(|_| "No se puede consultar el registro de lotes")?;
    if !meta.is_dir() || linked(&meta) {
        return Err("El registro de lotes requiere carpetas regulares; se conserva".into());
    }
    Ok(())
}
fn path(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 32768
        && value
            .split('/')
            .all(|part| portable_paths::component(part).is_ok())
}
fn validate(plan: &Plan) -> Result<(), String> {
    if plan.schema_version.is_some_and(|v| v != 1)
        || !request_scope::portable_id(&plan.project_id)
        || !Path::new(&plan.root).is_absolute()
        || !matches!(plan.action.as_str(), "move" | "trash" | "duplicate" | "rename" | "context")
        || !matches!(
            plan.state.as_str(),
            "prepared" | "running" | "attention" | "completed"
        )
        || plan.items.is_empty()
        || plan.items.len() > 500
        || (plan.action!="context"&&plan.selected_count < plan.items.len())
        || plan.selected_count > 500
        || plan.selected_count == 0
    {
        return Err(
            "Formato, versión o alcance del lote no compatible; se conserva sin ejecutar".into(),
        );
    }
    OffsetDateTime::parse(&plan.created_at, &Rfc3339)
        .map_err(|_| "La fecha del registro de lote no es válida")?;
    if plan.target_folder_id.as_deref().is_some_and(|id| {
        document_ref(id).is_err() || !id.starts_with(&format!("{}::", plan.project_id))
    }) {
        return Err("El destino del lote pertenece a otro proyecto".into());
    }
    let mut paths = BTreeSet::new();
    for item in &plan.items {
        if !path(&item.path)
            || item.node_id != doc_id(&plan.project_id, &item.path)
            || !paths.insert(item.path.to_lowercase())
            || item.fingerprint.len() != 64
            || !item.fingerprint.bytes().all(|b| b.is_ascii_hexdigit())
            || !matches!(
                item.state.as_str(),
                "pending" | "running" | "applied" | "attention"
            )
            || item.destination.as_deref().is_some_and(|p| !path(p))
        {
            return Err(
                "El lote contiene un elemento incompatible o repetido; se conserva sin ejecutar"
                    .into(),
            );
        }
        if plan.state == "prepared"
            && (item.state != "pending" || item.error.is_some() || item.result.is_some())
        {
            return Err(
                "El lote preparado contiene un resultado no esperado; revisa la selección".into(),
            );
        }
    }
    if plan.state == "prepared"
        && (!plan.moved_files.is_empty()
            || plan.references_pending
            || plan.error.is_some()
            || plan.result.is_some())
    {
        return Err(
            "El lote preparado contiene efectos previos no compatibles; se conserva".into(),
        );
    }
    if plan
        .moved_files
        .iter()
        .any(|(from, to)| !path(from) || !path(to))
    {
        return Err("El registro de movimientos no tiene rutas compatibles; se conserva".into());
    }
    Ok(())
}
pub(super) fn read(api: &LocalApi, id: &str) -> Result<Plan, String> {
    let mut budget = MAX_BYTES;
    read_limited(api, id, &mut budget)
}
pub(super) fn read_limited(api: &LocalApi, id: &str, budget: &mut u64) -> Result<Plan, String> {
    let file = api.batch_path(id)?;
    directory(&api.app_data_dir)?;
    directory(file.parent().unwrap())?;
    let meta =
        fs::symlink_metadata(&file).map_err(|_| "No se puede consultar el registro del lote")?;
    if !meta.is_file() || linked(&meta) || meta.len() > MAX_BYTES || meta.len() > *budget {
        return Err("El registro del lote no es regular o supera el presupuesto de lectura (máximo16MiB por archivo); se conserva".into());
    }
    let mut bytes = Vec::new();
    let result = fs::File::open(&file)
        .map_err(|_| "No se puede leer el registro del lote")?
        .take((MAX_BYTES + 1).min(budget.saturating_add(1)))
        .read_to_end(&mut bytes);
    let exhausted = bytes.len() as u64 > *budget;
    *budget = budget.saturating_sub(bytes.len() as u64);
    result.map_err(|_| "No se pudo completar la lectura del lote")?;
    if bytes.len() as u64 > MAX_BYTES || exhausted {
        return Err("El registro del lote supera el presupuesto de lectura; se conserva".into());
    }
    let mut plan: Plan = serde_json::from_slice(&bytes).map_err(|_| {
        "El registro del lote está dañado o contiene campos desconocidos; se conserva sin ejecutar"
    })?;
    if plan.id != id {
        return Err("La identidad del registro del lote no coincide".into());
    }
    validate(&plan)?;
    plan.source_revision = Some(sha256_hex(&bytes));
    Ok(plan)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn a_changed_or_future_record_is_not_replaced_by_a_held_plan() {
        let temp = tempfile::tempdir().unwrap();
        let api = LocalApi::new(temp.path().join("state"), "qa".into(), "test".into());
        let project = api
            .create_project(json!({"name":"Owned","versioningMode":"none","syncMode":"none"}))
            .unwrap();
        let owner = project["id"].as_str().unwrap();
        let root = api.project_root(owner).unwrap();
        fs::write(root.join("Source.md"), b"preserved").unwrap();
        let prepared = api
            .prepare_batch(
                owner,
                json!({"action":"trash","nodeIds":[doc_id(owner,"Source.md")]}),
            )
            .unwrap();
        let id = prepared["id"].as_str().unwrap();
        let path = api.batch_path(id).unwrap();
        let original = fs::read(&path).unwrap();
        let mut held = read(&api, id).unwrap();
        let mut changed: Value = serde_json::from_slice(&original).unwrap();
        changed["createdAt"] = json!("2025-01-01T00:00:00Z");
        let changed = serde_json::to_vec(&changed).unwrap();
        fs::write(&path, &changed).unwrap();
        held.state = "running".into();
        assert!(save(&api, &mut held).is_err());
        assert_eq!(fs::read(&path).unwrap(), changed);
        let future = br#"{"schemaVersion":99,"owned":"future record"}"#;
        fs::write(&path, future).unwrap();
        assert!(save(&api, &mut held).is_err());
        assert_eq!(fs::read(&path).unwrap(), future);
        assert_eq!(fs::read(root.join("Source.md")).unwrap(), b"preserved");
    }
}
pub(super) fn save(api: &LocalApi, plan: &mut Plan) -> Result<(), String> {
    validate(plan)?;
    let path = api.batch_path(&plan.id)?;
    directory(&api.app_data_dir)?;
    let bytes = serde_json::to_vec(plan).map_err(|_| "No se pudo preparar el registro del lote")?;
    if bytes.len() as u64 > MAX_BYTES {
        return Err(
            "El registro del lote supera16MiB; se conserva el último estado confirmado".into(),
        );
    }
    // Anything we publish must remain readable with the same strict reader.
    serde_json::from_slice::<Plan>(&bytes).map_err(|_| "El resultado excede la estructura admitida del registro; se conserva el último estado confirmado")?;
    if let Some(expected) = &plan.source_revision {
        let current = read(api, &plan.id)?;
        if current.source_revision.as_ref() != Some(expected) {
            return Err("El registro del lote cambió desde su lectura. Revisa el estado; no se repite la operación.".into());
        }
        atomic_io::write(&path, &bytes).map_err(|_| {
            "No se pudo confirmar el registro del lote; revisa su estado antes de continuar"
        })?;
    } else {
        match fs::create_dir(path.parent().unwrap()) {
            Ok(()) => {}
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => {}
            Err(_) => return Err("No se pudo preparar el registro de lotes".into()),
        }
        directory(path.parent().unwrap())?;
        atomic_io::create(&path, &bytes)
            .map_err(|_| "No se pudo crear un registro nuevo de lote; no se ha sustituido otro")?;
    }
    plan.source_revision = Some(sha256_hex(&bytes));
    Ok(())
}
