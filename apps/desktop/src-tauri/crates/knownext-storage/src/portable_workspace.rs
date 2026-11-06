use super::*;
use std::{fs, io::Read};
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Capsule {
    format: String,
    schema_version: u8,
    source_project_id: String,
    groups: Value,
    milestones: Value,
    favorites: Value,
    export_style: Value,
    #[serde(default)]
    export_profiles: Value,
    data_only: bool,
}
fn raw(path: &Path) -> Result<Option<Vec<u8>>, String> {
    let m = match fs::symlink_metadata(path) {
        Ok(m) => m,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        _ => return Err("No se puede revisar el estado del trabajo".into()),
    };
    if !m.is_file() || batch::linked(&m) || m.len() > 16 * 1024 * 1024 {
        return Err("Estado no regular o fuera de16MiB; se conserva".into());
    }
    let mut b = vec![];
    fs::File::open(path)
        .map_err(|_| "No se puede leer el estado")?
        .take(16 * 1024 * 1024 + 1)
        .read_to_end(&mut b)
        .map_err(|_| "Lectura incompleta")?;
    if b.len() > 16 * 1024 * 1024 {
        return Err("Estado fuera de límite".into());
    }
    Ok(Some(b))
}
fn plan(
    api: &LocalApi,
    p: &str,
    selected: &[String],
) -> Result<(Vec<(String, PathBuf, Option<Vec<u8>>, Vec<u8>)>, String), String> {
    if selected.is_empty()
        || selected.len() > 5
        || selected.iter().collect::<BTreeSet<_>>().len() != selected.len()
        || selected.iter().any(|s| {
            ![
                "groups",
                "milestones",
                "favorites",
                "exportStyle",
                "exportProfiles",
            ]
            .contains(&s.as_str())
        })
    {
        return Err("Selecciona familias conocidas del trabajo".into());
    }
    let root = api
        .project_root(p)?
        .canonicalize()
        .map_err(|_| "Proyecto no disponible")?;
    let index_file = path_policy::resolve(&root, "Archivo KnowNext/Inventario.json")?;
    let index: Value =
        serde_json::from_slice(&raw(&index_file)?.ok_or("Falta el inventario privado")?)
            .map_err(|_| "Inventario no compatible")?;
    if index["format"] != "knownext.project-archive"
        || !matches!(index["schemaVersion"].as_u64(), Some(1 | 2))
        || index["dataOnly"] != true
    {
        return Err("Inventario privado no compatible".into());
    }
    let source = index["items"]
        .as_array()
        .and_then(|a| {
            a.iter()
                .rev()
                .find(|v| v["kind"] == "workspace" && v["active"] == false)
        })
        .and_then(|v| v["path"].as_str())
        .ok_or("No hay estado del trabajo en el archivo")?;
    let file = path_policy::resolve(&root, &format!("Archivo KnowNext/{source}"))?;
    let source = raw(&file)?.ok_or("El archivo no incluye Trabajo.json")?;
    let data: Capsule = serde_json::from_slice(&source)
        .map_err(|_| "Archivo del trabajo no compatible; se conserva")?;
    if data.format != "knownext.portable-workspace"
        || data.schema_version != 1
        || !data.data_only
        || !request_scope::portable_id(&data.source_project_id)
    {
        return Err("Formato del trabajo no compatible".into());
    }
    let mut entries = vec![];
    let mut fingerprints = vec![];
    for family in selected {
        let (path, value) = match family.as_str() {
            "groups" => history_groups::portable_merge(api, p, data.groups.clone())?,
            "milestones" => history_milestones::portable_merge(api, p, data.milestones.clone())?,
            "favorites" => favorites::portable_merge(api, p, data.favorites.clone())?,
            "exportProfiles" => export_profiles::portable_merge(api, data.export_profiles.clone())?,
            "exportStyle" => {
                let b = serde_json::to_vec(&data.export_style)
                    .map_err(|_| "Estilo no representable")?;
                let style = local_state::decode(local_state::Store::Export, &b)?;
                api.read_export_template_checked()?;
                (api.export_template_path(), style)
            }
            _ => unreachable!(),
        };
        let before = raw(&path)?;
        let next = serde_json::to_vec(&value).map_err(|_| "Trabajo no representable")?;
        fingerprints.push(json!([
            family,
            before.as_ref().map(|b| sha256_hex(b)),
            sha256_hex(&next)
        ]));
        entries.push((family.clone(), path, before, next));
    }
    let revision = sha256_hex(
        &serde_json::to_vec(&json!([p, root, sha256_hex(&source), fingerprints]))
            .map_err(|_| "Revisión no representable")?,
    );
    Ok((entries, revision))
}
impl LocalApi {
    pub(crate) fn review_portable_workspace(&self, p: &str, body: Value) -> Result<Value, String> {
        #[derive(Deserialize)]
        #[serde(deny_unknown_fields)]
        struct Input {
            families: Vec<String>,
        }
        let q: Input =
            serde_json::from_value(body).map_err(|_| "Revisión del trabajo no válida")?;
        let (entries, revision) = plan(self, p, &q.families)?;
        Ok(
            json!({"schemaVersion":1,"projectId":p,"revision":revision,"families":q.families,"items":entries.iter().map(|(id,_,before,next)|json!({"id":id,"currentBytes":before.as_ref().map_or(0,Vec::len),"resultBytes":next.len(),"changed":before.as_ref()!=Some(next)})).collect::<Vec<_>>(),"checkedAt":knownext_core::now_iso(),"preservesFiles":true,"startsAi":false,"personalDataIsArchivedOnly":true}),
        )
    }
    pub(crate) fn apply_portable_workspace(&self, p: &str, body: Value) -> Result<Value, String> {
        #[derive(Deserialize)]
        #[serde(deny_unknown_fields)]
        struct Input {
            families: Vec<String>,
            revision: String,
            acknowledge: bool,
        }
        let q: Input = serde_json::from_value(body).map_err(|_| "Cambio del trabajo no válido")?;
        if !q.acknowledge {
            return Err("Confirma las familias revisadas".into());
        }
        let _guard = self.project_transaction(p)?;
        let (entries, revision) = plan(self, p, &q.families)?;
        if q.revision != revision {
            return Err("Las copias o el destino cambiaron; revisa de nuevo".into());
        }
        let mut applied = vec![];
        for (id, path, before, next) in entries {
            if raw(&path)? != before {
                return Err("El destino cambió; consulta antes de repetir".into());
            }
            if before.as_ref() != Some(&next) {
                if !path.parent().unwrap().exists() {
                    fs::create_dir(path.parent().unwrap())
                        .map_err(|_| "No se pudo preparar el destino")?;
                }
                let m = fs::symlink_metadata(path.parent().unwrap())
                    .map_err(|_| "Destino no disponible")?;
                if !m.is_dir() || batch::linked(&m) {
                    return Err("Destino no regular; no se sustituye".into());
                }
                if id == "exportStyle" {
                    self.write_json(
                        &path,
                        &serde_json::from_slice(&next).map_err(|_| "Estilo no representable")?,
                    )?;
                } else {
                    atomic_io::write(&path, &next).map_err(|_| {
                        "El resultado puede ser parcial; consulta las familias sin repetir"
                    })?;
                }
            }
            applied.push(id);
        }
        Ok(
            json!({"schemaVersion":1,"projectId":p,"revision":revision,"status":"applied","families":applied,"checkedAt":knownext_core::now_iso(),"preservesFiles":true,"startsAi":false}),
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn portability_block_workspace_merges_without_losing_current_metadata_or_starting_ai() {
        let d = tempfile::tempdir().unwrap();
        let a = LocalApi::new(d.path().join("state"), "qa".into(), "test".into());
        let p = a
            .create_project(
                json!({"name":"Workspace QA","versioningMode":"none","syncMode":"none"}),
            )
            .unwrap()["id"]
            .as_str()
            .unwrap()
            .to_owned();
        let root = a.project_root(&p).unwrap();
        fs::write(root.join("a.md"), "Source document").unwrap();
        let data = json!({"format":"knownext.portable-workspace","schemaVersion":1,"sourceProjectId":"source-project","groups":{"schemaVersion":1,"projectId":"source-project","groups":[]},"milestones":{"schemaVersion":1,"projectId":"source-project","markers":[]},"favorites":{"schemaVersion":1,"projectId":"source-project","entries":[{"id":"favorite-source","path":"a.md","kind":"document","createdAt":"2026-01-01T00:00:00Z","updatedAt":"2026-01-01T00:00:00Z"}]},"exportStyle":a.read_export_template_checked().unwrap(),"exportProfiles":{"schemaVersion":1,"profiles":[]},"dataOnly":true});
        let archive = root.join("Archivo KnowNext");
        fs::create_dir(&archive).unwrap();
        fs::write(
            archive.join("Trabajo.json"),
            serde_json::to_vec(&data).unwrap(),
        )
        .unwrap();
        fs::write(archive.join("Inventario.json"),serde_json::to_vec(&json!({"format":"knownext.project-archive","schemaVersion":1,"dataOnly":true,"items":[{"kind":"workspace","path":"Trabajo.json","active":false}]})).unwrap()).unwrap();
        let families = json!(["groups", "milestones", "favorites", "exportProfiles"]);
        let review = a
            .review_portable_workspace(&p, json!({"families":families}))
            .unwrap();
        let result = a
            .apply_portable_workspace(
                &p,
                json!({"families":families,"revision":review["revision"],"acknowledge":true}),
            )
            .unwrap();
        assert_eq!(result["startsAi"], false);
        assert_eq!(
            favorites::portable_snapshot(&a, &p).unwrap()["entries"]
                .as_array()
                .unwrap()
                .len(),
            1
        );
        let next = a
            .review_portable_workspace(&p, json!({"families":families}))
            .unwrap();
        a.apply_portable_workspace(
            &p,
            json!({"families":families,"revision":next["revision"],"acknowledge":true}),
        )
        .unwrap();
        assert_eq!(
            favorites::portable_snapshot(&a, &p).unwrap()["entries"]
                .as_array()
                .unwrap()
                .len(),
            1
        );
        let original = fs::read(archive.join("Trabajo.json")).unwrap();
        let mut future = data;
        future["schemaVersion"] = json!(99);
        fs::write(
            archive.join("Trabajo.json"),
            serde_json::to_vec(&future).unwrap(),
        )
        .unwrap();
        assert!(a
            .review_portable_workspace(&p, json!({"families":families}))
            .is_err());
        assert_eq!(
            fs::read_to_string(root.join("a.md")).unwrap(),
            "Source document"
        );
        assert!(!original.is_empty());
    }
}
