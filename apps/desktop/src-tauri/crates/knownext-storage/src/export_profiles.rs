use super::*;
use std::{fs, io::Read};
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Profile {
    pub id: String,
    pub name: String,
    pub cover: bool,
    pub contents: bool,
    pub style: Value,
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Store {
    schema_version: u8,
    profiles: Vec<Profile>,
}
fn read(api: &LocalApi) -> Result<(Store, Option<Vec<u8>>), String> {
    let path = api.app_data_dir.join("export-profiles.json");
    let raw = match fs::symlink_metadata(&path) {
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => None,
        Ok(m) if m.is_file() && !batch::linked(&m) && m.len() <= 2 * 1024 * 1024 => {
            let mut b = vec![];
            fs::File::open(&path)
                .map_err(|_| "Perfiles no disponibles")?
                .take(2 * 1024 * 1024 + 1)
                .read_to_end(&mut b)
                .map_err(|_| "Lectura de perfiles incompleta")?;
            if b.len() > 2 * 1024 * 1024 {
                return Err("Perfiles fuera de límite".into());
            }
            Some(b)
        }
        _ => return Err("Perfiles no regulares o fuera de límite; se conservan".into()),
    };
    let store = match &raw {
        Some(b) => serde_json::from_slice::<Store>(b)
            .map_err(|_| "Perfiles no compatibles; se conservan")?,
        None => Store {
            schema_version: 1,
            profiles: vec![],
        },
    };
    if store.schema_version != 1 || store.profiles.len() > 32 {
        return Err("Perfiles de exportación no compatibles".into());
    }
    let mut ids = BTreeSet::new();
    for p in &store.profiles {
        if !request_scope::portable_id(&p.id)
            || !p.id.starts_with("export-profile-")
            || !ids.insert(&p.id)
            || p.name.trim().is_empty()
            || p.name.chars().count() > 100
            || p.name.chars().any(char::is_control)
        {
            return Err("Perfil de exportación no válido".into());
        }
        local_state::decode(
            local_state::Store::Export,
            &serde_json::to_vec(&p.style).map_err(|_| "Estilo no representable")?,
        )?;
    }
    Ok((store, raw))
}
impl LocalApi {
    pub(crate) fn export_profiles(&self) -> Result<Value, String> {
        let (s, raw) = read(self)?;
        Ok(
            json!({"schemaVersion":1,"revision":raw.map(|b|sha256_hex(&b)),"profiles":s.profiles,"checkedAt":knownext_core::now_iso()}),
        )
    }
    pub(crate) fn change_export_profiles(&self, body: Value) -> Result<Value, String> {
        #[derive(Deserialize)]
        #[serde(rename_all = "camelCase", deny_unknown_fields)]
        struct Input {
            revision: Option<String>,
            action: String,
            id: String,
            name: Option<String>,
            cover: Option<bool>,
            contents: Option<bool>,
        }
        let q: Input = serde_json::from_value(body).map_err(|_| "Cambio de perfil no válido")?;
        let (mut s, raw) = read(self)?;
        if raw.as_ref().map(|b| sha256_hex(b)) != q.revision
            || !request_scope::portable_id(&q.id)
            || !q.id.starts_with("export-profile-")
        {
            return Err("Los perfiles cambiaron; vuelve a consultarlos".into());
        }
        match q.action.as_str() {
            "capture" => {
                if s.profiles.len() >= 32 || s.profiles.iter().any(|p| p.id == q.id) {
                    return Err("El perfil ya existe o se alcanzan32 perfiles".into());
                }
                let name = q
                    .name
                    .filter(|n| {
                        !n.trim().is_empty()
                            && n.chars().count() <= 100
                            && !n.chars().any(char::is_control)
                    })
                    .ok_or("Indica un nombre de perfil")?;
                s.profiles.push(Profile {
                    id: q.id,
                    name,
                    cover: q.cover.unwrap_or(false),
                    contents: q.contents.unwrap_or(false),
                    style: self.read_export_template_checked()?,
                });
            }
            "remove" => {
                if !s.profiles.iter().any(|p| p.id == q.id) {
                    return Err("El perfil ya no existe".into());
                }
                s.profiles.retain(|p| p.id != q.id);
            }
            _ => return Err("Acción de perfil no conocida".into()),
        }
        if read(self)?.1 != raw {
            return Err("Los perfiles cambiaron; se conservan".into());
        }
        atomic_io::write(
            &self.app_data_dir.join("export-profiles.json"),
            &serde_json::to_vec(&s).map_err(|_| "Perfiles no representables")?,
        )
        .map_err(|_| "Perfil sin confirmar; consulta antes de repetir")?;
        self.export_profiles()
    }
    pub(super) fn export_profile(&self, id: Option<&str>) -> Result<Option<Profile>, String> {
        let (s, _) = read(self)?;
        match id {
            Some(id) => s
                .profiles
                .into_iter()
                .find(|p| p.id == id)
                .map(Some)
                .ok_or("El perfil seleccionado no existe".into()),
            None => Ok(None),
        }
    }
}
pub(super) fn decorate(name: &str, markdown: &str, profile: &Profile) -> String {
    let mut intro = String::new();
    if profile.cover {
        let title = name
            .chars()
            .filter(|c| !c.is_control())
            .take(200)
            .collect::<String>();
        intro.push_str(&format!("# {title}\n\n<!-- knownext:page-break -->\n\n"));
    }
    if profile.contents {
        intro.push_str("# Índice de títulos\n\n");
        for (level, title) in knownext_docs::export_outline(markdown) {
            intro.push_str(&format!(
                "{}- {}\n",
                "  ".repeat(level.saturating_sub(1)),
                title
            ));
        }
        intro.push_str("\n<!-- knownext:page-break -->\n\n");
    }
    intro.push_str(markdown);
    intro
}

pub(super) fn portable_snapshot(api: &LocalApi) -> Result<Value, String> {
    serde_json::to_value(read(api)?.0).map_err(|_| "Perfiles no representables".into())
}
pub(super) fn portable_merge(api: &LocalApi, value: Value) -> Result<(PathBuf, Value), String> {
    let incoming: Store =
        serde_json::from_value(value).map_err(|_| "Perfiles portables no compatibles")?;
    if incoming.schema_version != 1 || incoming.profiles.len() > 32 {
        return Err("Perfiles portables fuera de límite".into());
    }
    let (mut current, _) = read(api)?;
    for profile in incoming.profiles {
        if !request_scope::portable_id(&profile.id)
            || !profile.id.starts_with("export-profile-")
            || profile.name.trim().is_empty()
            || profile.name.chars().count() > 100
            || profile.name.chars().any(char::is_control)
        {
            return Err("Perfil portable no válido".into());
        }
        local_state::decode(
            local_state::Store::Export,
            &serde_json::to_vec(&profile.style).map_err(|_| "Estilo no representable")?,
        )?;
        if !current.profiles.iter().any(|p| p.id == profile.id) {
            current.profiles.push(profile);
        }
    }
    if current.profiles.len() > 32 {
        return Err("El destino supera32 perfiles".into());
    }
    Ok((
        api.app_data_dir.join("export-profiles.json"),
        serde_json::to_value(current).map_err(|_| "Perfiles no representables")?,
    ))
}
