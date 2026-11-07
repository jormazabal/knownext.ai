use super::*;

pub(super) fn append(
    api: &LocalApi,
    project: &str,
    builder: &mut Builder<'_>,
) -> Result<usize, String> {
    let folder = api.app_data_dir.join("drafts");
    let mut count = 0;
    for name in builder.scan(&folder)? {
        let key = name
            .strip_suffix(".json")
            .ok_or("Hay entradas de borrador no reconocidas; se conservan")?;
        let raw = builder.read(&api.app_data_dir, &format!("drafts/{name}"), MAX_FILE)?;
        let value: Value = serde_json::from_slice(&raw).map_err(|_| "No se puede atribuir un borrador dañado a un proyecto; revisa Recuperación antes de archivar")?;
        let id = value["documentId"]
            .as_str()
            .ok_or("Un borrador no tiene propietario comprobable")?;
        let (owner, relative) = document_ref(id)?;
        if owner != project {
            continue;
        }
        let verified = draft_store::snapshot_key(&folder, key)?
            .ok_or("El borrador dejó de estar disponible")?;
        if verified.fingerprint != sha256_hex(&raw) {
            return Err("El borrador cambió durante la preparación".into());
        }
        let identity = sha256_hex(name.as_bytes());
        let prefix = format!("Borradores/{}", &identity[..24]);
        builder.put(&format!("{prefix}/Original.json"), &raw)?;
        let editable = if let Some(markdown) = value["markdown"].as_str() {
            let path = format!("{prefix}/Borrador.md");
            builder.put(&path, markdown.as_bytes())?;
            path
        } else {
            let content = value
                .get("content")
                .ok_or("El borrador no tiene contenido compatible")?;
            document_validation::handwritten(content)?;
            let path = format!("{prefix}/Borrador.knote");
            builder.json(&path, content)?;
            path
        };
        builder.items.push(json!({"kind":"draft","documentPath":relative,"original":builder.relative(&format!("{prefix}/Original.json")),"editable":builder.relative(&editable),"sha256":sha256_hex(&raw),"active":false}));
        count += 1;
    }
    Ok(count)
}
