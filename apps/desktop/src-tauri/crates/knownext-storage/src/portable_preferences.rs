//! Explicit adoption of a small visual projection. The project archive conveys data, not authority.
use super::*;
use std::{fs, io::Read};
const SOURCE: &str = "Archivo KnowNext/Preferencias.json";
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Portable {
    format: String,
    schema_version: u8,
    appearance: Appearance,
    layout: Layout,
    apply_automatically: bool,
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Appearance {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    language: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    theme_mode: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    primary_color: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    zoom_percent: Option<u16>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    markdown_extended_underline_enabled: Option<bool>,
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Layout {
    #[serde(default,skip_serializing_if="Option::is_none")]navigation_visible:Option<bool>,
    #[serde(default,skip_serializing_if="Option::is_none")]context_pinned:Option<bool>,
    #[serde(default,skip_serializing_if="Option::is_none")]context_kind:Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    sidebar_width: Option<u16>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    history_width: Option<u16>,
}
struct Snapshot {
    root: PathBuf,
    raw: Vec<u8>,
    config_raw: Option<Vec<u8>>,
    config: Value,
    imported: Value,
    revision: String,
}
fn raw(path: &Path, limit: u64) -> Result<Option<Vec<u8>>, String> {
    let meta = match fs::symlink_metadata(path) {
        Ok(value) => value,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(_) => return Err("No se puede revisar el archivo de preferencias".into()),
    };
    if !meta.is_file() || batch::linked(&meta) || meta.len() > limit {
        return Err("Preferencias no regulares o fuera de límites; se conservan".into());
    }
    let mut bytes = vec![];
    fs::File::open(path)
        .map_err(|_| "No se pueden abrir las preferencias")?
        .take(limit + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| "Lectura de preferencias incompleta")?;
    if bytes.len() as u64 > limit {
        return Err("Las preferencias crecieron durante la revisión".into());
    }
    Ok(Some(bytes))
}
fn snapshot(api: &LocalApi, project: &str) -> Result<Snapshot, String> {
    let root = api
        .project_root(project)?
        .canonicalize()
        .map_err(|_| "Ubicación de proyecto no disponible")?;
    let path = path_policy::resolve(&root, SOURCE)?;
    let bytes = raw(&path, 32 * 1024)?
        .ok_or("Este proyecto no contiene preferencias visuales en Archivo KnowNext")?;
    let value: Portable = serde_json::from_slice(&bytes).map_err(|_| {
        "Formato de preferencias portable desconocido o con campos adicionales; se conserva"
    })?;
    if value.format != "knownext.portable-preferences"
        || !matches!(value.schema_version,1|2)
        || value.apply_automatically
        || value
            .appearance
            .language
            .as_deref()
            .is_some_and(|v| !matches!(v, "es" | "en" | "eu"))
        || value
            .appearance
            .theme_mode
            .as_deref()
            .is_some_and(|v| !matches!(v, "system" | "light" | "dark"))
        || value
            .appearance
            .primary_color
            .as_deref()
            .is_some_and(|v| !matches!(v,"orange"|"amber"|"yellow"|"lime"|"olive"|"green"|"cyan"|"blue"|"indigo"|"wine"|"rose"|"red"))
        || value
            .appearance
            .zoom_percent
            .is_some_and(|v| !(50..=200).contains(&v))
        || value.layout.context_kind.as_deref().is_some_and(|v|!matches!(v,"assistant"|"document"|"properties"|"references"))
        || [value.layout.sidebar_width, value.layout.history_width]
            .into_iter()
            .flatten()
            .any(|v| !(160..=1000).contains(&v))
    {
        return Err("Valores o versión de preferencias no compatibles; no se aplican".into());
    }
    let imported = json!({"appearance":value.appearance,"layout":value.layout});
    let config_raw = raw(&api.config_path(), 8 * 1024 * 1024)?;
    let config = if let Some(bytes) = &config_raw {
        local_state::decode(local_state::Store::Config, bytes)?
    } else {
        default_config()
    };
    let revision=sha256_hex(&serde_json::to_vec(&json!({"project":project,"root":root,"source":sha256_hex(&bytes),"config":config_raw.as_ref().map(|bytes|sha256_hex(bytes))})).map_err(|_|"No se puede representar la revisión")?);
    Ok(Snapshot {
        root,
        raw: bytes,
        config_raw,
        config,
        imported,
        revision,
    })
}
fn public(project: &str, state: &Snapshot) -> Value {
    let mut observed = json!({"appearance":{},"layout":{}});
    for group in ["appearance", "layout"] {
        for (key, _) in state.imported[group].as_object().into_iter().flatten() {
            observed[group][key] = state.config[group][key].clone();
        }
    }
    json!({"schemaVersion":1,"projectId":project,"revision":state.revision,"checkedAt":knownext_core::now_iso(),"source":SOURCE,"imported":state.imported,"observed":observed,"canApply":state.imported["appearance"].as_object().is_some_and(|v|!v.is_empty())||state.imported["layout"].as_object().is_some_and(|v|!v.is_empty()),"dataOnly":true,"changesAi":false})
}
impl LocalApi {
    pub(crate) fn review_portable_preferences(&self, project: &str) -> Result<Value, String> {
        Ok(public(project, &snapshot(self, project)?))
    }
    pub(crate) fn apply_portable_preferences(
        &self,
        project: &str,
        body: Value,
    ) -> Result<Value, String> {
        #[derive(Deserialize)]
        #[serde(rename_all = "camelCase", deny_unknown_fields)]
        struct Request {
            revision: String,
            appearance: bool,
            layout: bool,
            acknowledge: bool,
        }
        let request: Request = serde_json::from_value(body)
            .map_err(|_| "Revisa y confirma las preferencias antes de aplicarlas")?;
        if !request.acknowledge || !(request.appearance || request.layout) {
            return Err("Elige al menos un grupo y confirma el cambio de este dispositivo".into());
        }
        let state = snapshot(self, project)?;
        if request.revision != state.revision {
            return Err("El archivo, la ubicación o los ajustes actuales cambiaron. Revisa de nuevo; no se ha aplicado nada".into());
        }
        let mut next = state.config.clone();
        let mut changed = false;
        for (group, selected) in [
            ("appearance", request.appearance),
            ("layout", request.layout),
        ] {
            if selected {
                for (key, value) in state.imported[group]
                    .as_object()
                    .ok_or("Grupo de preferencias no compatible")?
                {
                    if next[group].get(key) != Some(value) {
                        if !next[group].is_object() {
                            next[group] = json!({});
                        }
                        next[group][key] = value.clone();
                        changed = true;
                    }
                }
            }
        }
        if changed {
            next["updatedAt"] = json!(knownext_core::now_iso());
            let encoded = serde_json::to_vec_pretty(&next)
                .map_err(|_| "No se pueden representar las preferencias")?;
            if encoded.len() > 8 * 1024 * 1024 {
                return Err("El estado resultante supera8MiB; se conserva el actual".into());
            }
            // Recheck all inputs immediately before publication. This is not a CAS against external programs.
            if self.project_root(project)?.canonicalize().ok().as_ref() != Some(&state.root)
                || raw(&path_policy::resolve(&state.root, SOURCE)?, 32 * 1024)?.as_deref()
                    != Some(state.raw.as_slice())
                || raw(&self.config_path(), 8 * 1024 * 1024)? != state.config_raw
            {
                return Err(
                    "Las preferencias cambiaron antes de publicar; vuelve a revisar".into(),
                );
            }
            self.write_json(&self.config_path(), &next)?;
            let observed = raw(&self.config_path(), 8 * 1024 * 1024)?
                .ok_or("La escritura no está confirmada; consulta el estado sin reenviarla")?;
            let observed = local_state::decode(local_state::Store::Config, &observed)?;
            if observed != next {
                return Err(
                    "Los ajustes observados no confirman la escritura. Consulta sin repetir".into(),
                );
            }
        }
        Ok(
            json!({"schemaVersion":1,"projectId":project,"requestRevision":state.revision,"status":if changed{"applied"}else{"unchanged"},"checkedAt":knownext_core::now_iso(),"changesAi":false,"review":self.review_portable_preferences(project)?}),
        )
    }
}
