use super::*;
fn capture(api: &LocalApi, project: &str) -> Result<Value, String> {
    let mut style = api.read_export_template_checked()?;
    match fs::symlink_metadata(api.export_template_path()) {
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            style["updatedAt"] = json!("1970-01-01T00:00:00Z");
        }
        Ok(_) => (),
        Err(_) => return Err("No se puede comprobar el estilo de exportación".into()),
    }
    let data = json!({"format":"knownext.portable-workspace","schemaVersion":1,"sourceProjectId":project,"groups":history_groups::portable_snapshot(api,project)?,"milestones":history_milestones::portable_snapshot(api,project)?,"favorites":favorites::portable_snapshot(api,project)?,"exportStyle":style,"exportProfiles":export_profiles::portable_snapshot(api)?,"dataOnly":true});
    let results = ai_results::privacy_entries(api, project)?
        .into_iter()
        .map(|(_, v)| v)
        .collect::<Vec<_>>();
    Ok(
        json!({"work":data,"conversation":api.conversation_checked(project)?,"context":api.context_checked(project)?,"research":api.research_jobs_checked(project)?,"results":results}),
    )
}
pub(super) fn append(api: &LocalApi, project: &str, b: &mut Builder<'_>) -> Result<Value, String> {
    let value = capture(api, project)?;
    let mut payloads = vec![];
    b.json("Trabajo.json", &value["work"])?;
    b.items
        .push(json!({"kind":"workspace","path":b.relative("Trabajo.json"),"active":false}));
    for (name, key) in [
        ("Conversacion.json", "conversation"),
        ("Contexto.json", "context"),
        ("Investigaciones.json", "research"),
    ] {
        let path = format!("Datos IA/{name}");
        b.json(&path, &value[key])?;
        payloads.push(b.relative(&path));
    }
    for (index, v) in value["results"]
        .as_array()
        .ok_or("Resultados no representables")?
        .iter()
        .enumerate()
    {
        let path = format!("Datos IA/Resultados/{index}.json");
        b.json(&path, v)?;
        payloads.push(b.relative(&path));
    }
    b.items.push(
        json!({"kind":"personal-data","files":payloads,"active":false,"runtimeAdoption":false}),
    );
    Ok(value)
}
pub(super) fn verify(api: &LocalApi, project: &str, previous: &Value) -> Result<(), String> {
    if &capture(api, project)? != previous {
        return Err(
            "Los datos del trabajo cambiaron durante la preparación; vuelve a prepararla".into(),
        );
    }
    Ok(())
}
