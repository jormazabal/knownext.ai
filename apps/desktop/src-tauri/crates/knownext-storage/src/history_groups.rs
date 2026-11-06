//! Project-local collections of immutable document versions. No Git or document mutation.
use super::*;
use std::{fs, io::Read};
const MAX_BYTES: u64 = 2 * 1024 * 1024;
const MAX_GROUPS: usize = 128;
const MAX_MEMBERS: usize = 5000;
#[derive(Clone, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Member {
    commit: String,
    source_path: String,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Group {
    id: String,
    title: String,
    description: String,
    members: Vec<Member>,
    retired: bool,
    created_at: String,
    updated_at: String,
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Store {
    schema_version: u8,
    project_id: String,
    groups: Vec<Group>,
}
struct Snapshot {
    store: Store,
    revision: Option<String>,
}
#[derive(Deserialize)]
#[serde(
    tag = "action",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
enum Change {
    Create {
        group_id: String,
        revision: Option<String>,
        title: String,
        description: String,
        version_id: String,
    },
    Rename {
        group_id: String,
        revision: Option<String>,
        title: String,
        description: String,
    },
    Add {
        group_id: String,
        revision: Option<String>,
        version_id: String,
    },
    Remove {
        group_id: String,
        revision: Option<String>,
        version_id: String,
    },
    Retire {
        group_id: String,
        revision: Option<String>,
    },
    Reopen {
        group_id: String,
        revision: Option<String>,
    },
}
fn group_id(value: &str) -> bool {
    value.starts_with("history-group-") && value.len() <= 120 && request_scope::portable_id(value)
}
fn text(value: &str, max: usize, required: bool) -> bool {
    (!required || !value.trim().is_empty())
        && value.chars().count() <= max
        && !value.chars().any(char::is_control)
}
fn validate(store: &Store, project: &str) -> Result<(), String> {
    if store.schema_version != 1 || store.project_id != project {
        return Err("Formato o pertenencia de colecciones no compatible; se conserva".into());
    }
    if store.groups.len()>MAX_GROUPS { return Err("Se alcanza el límite de128 colecciones, incluidas las archivadas. Revisa o reutiliza las existentes; sus referencias se conservan.".into()); }
    let mut ids = BTreeSet::new();
    let mut titles = BTreeSet::new();
    let mut total = 0usize;
    for group in &store.groups {
        if !group.retired && !titles.insert(group.title.to_lowercase()) {
            return Err("Ya existe una colección activa con ese nombre; elige otro o reutiliza la existente".into());
        }
        if !group_id(&group.id)
            || !ids.insert(&group.id)
            || !text(&group.title, 120, true)
            || !text(&group.description, 500, false)
            || group.members.len() > 500
        {
            return Err("Colección no compatible o fuera de límites; se conserva".into());
        }
        total = total
            .checked_add(group.members.len())
            .ok_or("Inventario de colecciones no representable")?;
        if total > MAX_MEMBERS {
            return Err("Las colecciones superan5000 referencias; se conservan".into());
        }
        let mut members = BTreeSet::new();
        for member in &group.members {
            if !version_history::is_commit_id(&member.commit)
                || member.source_path.is_empty()
                || member.source_path.len() > 4096
                || member.source_path.contains('\0')
                || member.source_path.starts_with('/')
                || member
                    .source_path
                    .split('/')
                    .any(|part| part.is_empty() || matches!(part, "." | ".."))
                || !members.insert(member)
            {
                return Err("Referencia histórica no compatible; se conserva".into());
            }
        }
        for date in [&group.created_at, &group.updated_at] {
            OffsetDateTime::parse(date, &Rfc3339)
                .map_err(|_| "Fecha de colección no válida; se conserva")?;
        }
    }
    Ok(())
}
fn directory(path: &Path, optional: bool) -> Result<(), String> {
    match fs::symlink_metadata(path) {
        Ok(meta) if meta.is_dir() && !batch::linked(&meta) => Ok(()),
        Err(error) if optional && error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        _ => Err("El almacén de colecciones no es una carpeta regular; se conserva".into()),
    }
}
fn path(api: &LocalApi, project: &str) -> Result<PathBuf, String> {
    if !request_scope::portable_id(project) {
        return Err("Proyecto de colecciones no válido".into());
    }
    api.project_root(project)?;
    directory(&api.app_data_dir, false)?;
    let folder = api.app_data_dir.join("history-groups");
    directory(&folder, true)?;
    Ok(folder.join(format!("{project}.json")))
}
fn read(api: &LocalApi, project: &str) -> Result<Snapshot, String> {
    let path = path(api, project)?;
    let metadata = match fs::symlink_metadata(&path) {
        Ok(meta) => meta,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok(Snapshot {
                store: Store {
                    schema_version: 1,
                    project_id: project.into(),
                    groups: vec![],
                },
                revision: None,
            })
        }
        Err(_) => return Err("No se pueden consultar las colecciones; se conservan".into()),
    };
    if !metadata.is_file() || batch::linked(&metadata) || metadata.len() > MAX_BYTES {
        return Err("Colecciones no regulares o fuera de2MiB; se conservan".into());
    }
    let mut bytes = vec![];
    fs::File::open(path)
        .map_err(|_| "No se pueden abrir las colecciones")?
        .take(MAX_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| "No se pudo completar la lectura de colecciones")?;
    if bytes.len() as u64 > MAX_BYTES {
        return Err("Las colecciones superan2MiB; se conservan".into());
    }
    let store: Store = serde_json::from_slice(&bytes)
        .map_err(|_| "Formato de colecciones desconocido; se conserva")?;
    validate(&store, project)?;
    Ok(Snapshot {
        store,
        revision: Some(format!("{:x}", Sha256::digest(bytes))),
    })
}
fn response(
    snapshot: &Snapshot,
    history: &[version_history::HistoryEntry],
    document: &str,
) -> Value {
    json!({"schemaVersion":1,"documentId":document,"projectId":snapshot.store.project_id,"revision":snapshot.revision,"groups":snapshot.store.groups.iter().map(|group|{
        let members=group.members.iter().collect::<BTreeSet<_>>();
        let versions=history.iter().filter(|entry|members.contains(&Member{commit:entry.version["id"].as_str().unwrap_or("").into(),source_path:entry.path.clone()})).map(|entry|entry.version["id"].clone()).collect::<Vec<_>>();
        json!({"id":group.id,"title":group.title,"description":group.description,"retired":group.retired,"referenceCount":group.members.len(),"documentVersionIds":versions,"createdAt":group.created_at,"updatedAt":group.updated_at})
    }).collect::<Vec<_>>(),"groupLimit":MAX_GROUPS,"referenceLimit":MAX_MEMBERS,"checkedAt":knownext_core::now_iso()})
}
impl LocalApi {
    fn groups_history(
        &self,
        id: &str,
    ) -> Result<(String, Vec<version_history::HistoryEntry>), String> {
        let (project, _) = document_ref(id)?;
        self.resolve_document_path(id)?;
        if self.document_history_capability(&project)?["status"] != "ready" {
            return Err("El historial no está disponible para revisar colecciones en este dispositivo. Sus referencias se conservan.".into());
        }
        Ok((project, self.git_document_history(id)?))
    }
    pub(super) fn history_groups(&self, document: &str) -> Result<Value, String> {
        let (project, history) = self.groups_history(document)?;
        Ok(response(&read(self, &project)?, &history, document))
    }
    pub(super) fn change_history_group(
        &self,
        document: &str,
        body: Value,
    ) -> Result<Value, String> {
        if body.get("revision").is_none() {
            return Err("Falta la revisión observada de las colecciones".into());
        }
        let change: Change =
            serde_json::from_value(body).map_err(|_| "Cambio de colección no compatible")?;
        let (project, history) = self.groups_history(document)?;
        let mut snapshot = read(self, &project)?;
        let (id, revision) = match &change {
            Change::Create {
                group_id, revision, ..
            }
            | Change::Rename {
                group_id, revision, ..
            }
            | Change::Add {
                group_id, revision, ..
            }
            | Change::Remove {
                group_id, revision, ..
            }
            | Change::Retire { group_id, revision }
            | Change::Reopen { group_id, revision } => (group_id, revision),
        };
        if !group_id(id) {
            return Err("Identidad de colección no válida".into());
        }
        let member = |version: &str| -> Result<Member, String> {
            let entry = history
                .iter()
                .find(|entry| entry.version["id"] == version)
                .ok_or("La versión no pertenece al historial actual de este documento")?;
            Ok(Member {
                commit: version.into(),
                source_path: entry.path.clone(),
            })
        };
        let index = snapshot
            .store
            .groups
            .iter()
            .position(|group| group.id == *id);
        let now = knownext_core::now_iso();
        let changed = match &change {
            Change::Create {
                title,
                description,
                version_id,
                ..
            } => {
                let source = member(version_id)?;
                if let Some(index) = index {
                    let group = &snapshot.store.groups[index];
                    if group.title != title.trim()
                        || group.description != description.trim()
                        || group.retired
                        || !group.members.contains(&source)
                    {
                        return Err(
                            "Esa colección ya existe con otro contenido; vuelve a revisar".into(),
                        );
                    }
                    false
                } else {
                    snapshot.store.groups.push(Group {
                        id: id.clone(),
                        title: title.trim().into(),
                        description: description.trim().into(),
                        members: vec![source],
                        retired: false,
                        created_at: now.clone(),
                        updated_at: now.clone(),
                    });
                    true
                }
            }
            Change::Rename {
                title, description, ..
            } => {
                let group = &mut snapshot.store.groups[index.ok_or("Colección no encontrada")?];
                if group.title == title.trim() && group.description == description.trim() {
                    false
                } else {
                    group.title = title.trim().into();
                    group.description = description.trim().into();
                    true
                }
            }
            Change::Add { version_id, .. } => {
                let source = member(version_id)?;
                let group = &mut snapshot.store.groups[index.ok_or("Colección no encontrada")?];
                if group.retired {
                    return Err("Reabre la colección antes de añadir versiones".into());
                }
                if group.members.contains(&source) {
                    false
                } else {
                    group.members.push(source);
                    group.members.sort();
                    true
                }
            }
            Change::Remove { version_id, .. } => {
                let source = member(version_id)?;
                let group = &mut snapshot.store.groups[index.ok_or("Colección no encontrada")?];
                let old = group.members.len();
                group.members.retain(|member| *member != source);
                old != group.members.len()
            }
            Change::Retire { .. } | Change::Reopen { .. } => {
                let retired = matches!(change, Change::Retire { .. });
                let group = &mut snapshot.store.groups[index.ok_or("Colección no encontrada")?];
                let changed = group.retired != retired;
                group.retired = retired;
                changed
            }
        };
        if !changed {
            return Ok(response(&snapshot, &history, document));
        }
        if *revision != snapshot.revision {
            return Err(
                "Las colecciones cambiaron desde la revisión; no se ha sobrescrito el estado"
                    .into(),
            );
        }
        if let Some(group) = snapshot
            .store
            .groups
            .iter_mut()
            .find(|group| group.id == *id)
        {
            group.updated_at = now;
        }
        validate(&snapshot.store, &project)?;
        let bytes = serde_json::to_vec_pretty(&snapshot.store)
            .map_err(|_| "No se pueden preparar las colecciones")?;
        if bytes.len() as u64 > MAX_BYTES {
            return Err("Las colecciones superan2MiB; se conserva el estado anterior".into());
        }
        if read(self, &project)?.revision != snapshot.revision {
            return Err("Las colecciones cambiaron durante la preparación; se conservan".into());
        }
        let target = path(self, &project)?;
        let folder = target.parent().ok_or("Ruta de colecciones no válida")?;
        if !folder.exists() {
            fs::create_dir(folder).map_err(|_| "No se pudo preparar el almacén de colecciones")?;
        }
        directory(folder, false)?;
        if snapshot.revision.is_none() {
            atomic_io::create(&target, &bytes)
        } else {
            atomic_io::write(&target, &bytes)
        }
        .map_err(|_| {
            "No se confirmó el cambio de colección. Consulta su estado antes de repetir"
        })?;
        snapshot.revision = Some(format!("{:x}", Sha256::digest(bytes)));
        Ok(response(&snapshot, &history, document))
    }
}

pub(super) fn portable_snapshot(api:&LocalApi,project:&str)->Result<Value,String>{let snap=read(api,project)?;serde_json::to_value(snap.store).map_err(|_|"Datos del trabajo no representables".into())}
pub(super) fn portable_merge(api:&LocalApi,project:&str,value:Value)->Result<(PathBuf,Value),String>{let mut incoming:Store=serde_json::from_value(value).map_err(|_|"Datos del trabajo no compatibles")?;incoming.project_id=project.into();let mut store=incoming;validate(&store,project)?;let incoming=store.groups;store=read(api,project)?.store;for mut item in incoming{if store.groups.iter().any(|old|old.id==item.id){continue;}if store.groups.iter().any(|g|!g.retired&&!item.retired&&g.title.trim().eq_ignore_ascii_case(item.title.trim())){let base=item.title.chars().take(90).collect::<String>();let mut n=1;loop{let candidate=format!("{base} (importada {n})");if !store.groups.iter().any(|g|g.title==candidate){item.title=candidate;break;}n+=1;}} store.groups.push(item);}validate(&store,project)?;Ok((path(api,project)?,serde_json::to_value(store).map_err(|_|"Datos del trabajo no representables")?))}
