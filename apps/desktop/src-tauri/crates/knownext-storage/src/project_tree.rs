//! A complete metadata view or an explicit failure; never a silently truncated tree.
use super::*;
use std::{
    fs,
    time::{Duration, Instant},
};
const MAX_ENTRIES: usize = 20_000;
const MAX_NODES: usize = 10_000;
// Arrays and objects add two JSON levels per folder. Leave room for the outer
// request/job envelope below serde_json's normal deserialization depth limit.
const MAX_DEPTH: usize = 48;
const MAX_BYTES: usize = 8 * 1024 * 1024;
struct Budget {
    started: Instant,
    entries: usize,
    nodes: usize,
    bytes: usize,
}
impl Budget {
    fn check(&self) -> Result<(), String> {
        if self.started.elapsed() > Duration::from_secs(2) {
            return Err("No se pudo leer la estructura completa dentro del presupuesto cooperativo. Los archivos se conservan; vuelve a consultar la vista.".into());
        }
        Ok(())
    }
}
fn read_level(
    project: &str,
    root: &Path,
    current: &Path,
    depth: usize,
    budget: &mut Budget,
) -> Result<Vec<Value>, String> {
    budget.check()?;
    if depth > MAX_DEPTH {
        return Err("La estructura supera 48 niveles admitidos por esta vista. Los archivos se conservan; no se devuelve un árbol incompleto.".into());
    }
    let meta = fs::symlink_metadata(current)
        .map_err(|_| "Una carpeta dejó de estar disponible; no se entrega una vista incompleta")?;
    if !meta.is_dir()
        || batch::linked(&meta)
        || !current
            .canonicalize()
            .map_err(|_| "Carpeta no comprobable")?
            .starts_with(root)
    {
        return Err("Una carpeta cambió o quedó enlazada durante la lectura. No se entrega una vista incompleta.".into());
    }
    let mut nodes = vec![];
    for entry in fs::read_dir(current)
        .map_err(|_| "No se pudo leer una carpeta completa; los archivos se conservan")?
    {
        budget.check()?;
        budget.entries = budget
            .entries
            .checked_add(1)
            .ok_or("Estructura fuera de presupuesto")?;
        if budget.entries > MAX_ENTRIES {
            return Err("La consulta supera 20.000 entradas. Se conserva la vista anterior; no se informa de una estructura vacía o completa.".into());
        }
        let entry =
            entry.map_err(|_| "Hay una entrada no legible; no se entrega una vista incompleta")?;
        let name = entry.file_name();
        let name=name.to_str().ok_or("Hay un nombre que no se puede representar sin alterarlo. Los archivos se conservan; no se inventa su identidad.")?;
        if name.starts_with('.') {
            continue;
        }
        let path = entry.path();
        let meta = fs::symlink_metadata(&path)
            .map_err(|_| "Una entrada cambió durante la consulta; vuelve a cargar la estructura")?;
        if batch::linked(&meta) {
            continue;
        }
        if !meta.is_file() && !meta.is_dir() {
            return Err("Hay una entrada de tipo no compatible; se conserva sin recorrerla".into());
        }
        budget.nodes += 1;
        if budget.nodes > MAX_NODES {
            return Err("La vista supera 10.000 archivos y carpetas visibles; no se entrega una estructura incompleta.".into());
        }
        let relative = path
            .strip_prefix(root)
            .map_err(|_| "Entrada fuera del proyecto")?
            .to_str()
            .ok_or("Ruta no representable sin alteración")?
            .replace('\\', "/");
        let directory = meta.is_dir();
        let mut node = tree_node_from_metadata(project, &path, &relative, Some(meta));
        // Count each shell once before attaching its children. This conservatively
        // bounds serialized metadata without repeatedly cloning whole subtrees.
        budget.bytes = budget.bytes.saturating_add(
            serde_json::to_vec(&node)
                .map_err(|_| "Metadatos no comprobables")?
                .len()
                + 2,
        );
        if budget.bytes > MAX_BYTES {
            return Err(
                "La estructura supera 8 MiB de metadatos; no se entrega una vista incompleta."
                    .into(),
            );
        }
        if directory {
            node["children"] = json!(read_level(project, root, &path, depth + 1, budget)?)
        }
        nodes.push(node);
    }
    budget.check()?;
    nodes.sort_by(|a, b| {
        (a["type"] != "folder", a["name"].as_str().unwrap_or(""))
            .cmp(&(b["type"] != "folder", b["name"].as_str().unwrap_or("")))
    });
    budget.check()?;
    Ok(nodes)
}
pub(crate) fn read(project: &str, root: &Path) -> Result<Vec<Value>, String> {
    let canonical = root
        .canonicalize()
        .map_err(|_| "La carpeta del proyecto no está disponible")?;
    let mut budget = Budget {
        started: Instant::now(),
        entries: 0,
        nodes: 0,
        bytes: 0,
    };
    let result = read_level(project, &canonical, &canonical, 0, &mut budget)?;
    if root.canonicalize().ok().as_ref() != Some(&canonical) {
        return Err(
            "La ubicación del proyecto cambió durante la consulta; no se sustituye su vista".into(),
        );
    }
    Ok(result)
}
