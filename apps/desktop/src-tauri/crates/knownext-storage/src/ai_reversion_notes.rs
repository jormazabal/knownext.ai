//! Page-level inverse for typed handwritten content. Changed pages conflict; other pages remain.
use super::*;
#[derive(Clone)]
struct Delta {
    id: String,
    page: Option<String>,
    before: Option<Value>,
    after: Option<Value>,
    index: usize,
}
fn parse(text: &str) -> Result<Value, String> {
    let v: Value = serde_json::from_str(text).map_err(|_| "Copia de nota no compatible")?;
    document_validation::handwritten(&v)?;
    Ok(v)
}
fn properties(v: &Value) -> Value {
    let mut v = v.clone();
    if let Some(m) = v.as_object_mut() {
        for k in ["pages", "createdAt", "updatedAt"] {
            m.remove(k);
        }
    }
    v
}
fn deltas(before: &Value, after: &Value) -> Result<Vec<Delta>, String> {
    let a = before["pages"]
        .as_array()
        .ok_or("Faltan páginas de origen")?;
    let b = after["pages"]
        .as_array()
        .ok_or("Faltan páginas aplicadas")?;
    let mut ids = vec![];
    for page in b.iter().chain(a) {
        let id = page["id"].as_str().ok_or("Página sin identidad")?;
        if !ids.contains(&id.to_owned()) {
            ids.push(id.to_owned());
        }
    }
    let mut rows = vec![];
    for id in ids {
        let x = a.iter().find(|v| v["id"] == id).cloned();
        let y = b.iter().find(|v| v["id"] == id).cloned();
        if x != y {
            let hash = sha256_hex(
                serde_json::to_string(&json!([id, x, y]))
                    .map_err(|_| "Página no representable")?
                    .as_bytes(),
            );
            rows.push(Delta {
                id: format!("page-{}", &hash[..24]),
                page: Some(id.clone()),
                before: x,
                after: y,
                index: a
                    .iter()
                    .position(|v| v["id"] == id)
                    .unwrap_or(b.iter().position(|v| v["id"] == id).unwrap_or(0)),
            });
        }
    }
    let x = properties(before);
    let y = properties(after);
    if x != y {
        rows.push(Delta {
            id: format!(
                "note-properties-{}",
                &sha256_hex(
                    serde_json::to_string(&json!([x, y]))
                        .map_err(|_| "Propiedades no representables")?
                        .as_bytes()
                )[..16]
            ),
            page: None,
            before: Some(x),
            after: Some(y),
            index: 0,
        });
    }
    if rows.len() > 128 {
        return Err("La nota supera128 bloques de reversión; las copias permanecen".into());
    }
    Ok(rows)
}
fn summary(v: Option<&Value>, index: usize, properties: bool) -> String {
    if properties {
        return v
            .and_then(|x| x["title"].as_str())
            .map(|title| format!("Propiedades · {title}"))
            .unwrap_or_else(|| "Propiedades ausentes".into());
    }
    match v {
        None => "Página ausente".into(),
        Some(v) => format!(
            "Página {} · {} trazos · {} imágenes",
            index + 1,
            v["strokes"].as_array().map_or(0, Vec::len),
            v["images"].as_array().map_or(0, Vec::len)
        ),
    }
}
pub(super) fn all_ids(before: &str, after: &str) -> Result<Vec<String>, String> {
    Ok(deltas(&parse(before)?, &parse(after)?)?
        .into_iter()
        .map(|d| d.id)
        .collect())
}
pub(super) fn inverse(
    before: &str,
    after: &str,
    current: &str,
    selection: &[String],
    already: &[String],
) -> Result<(String, Value, Vec<String>), String> {
    let a = parse(before)?;
    let b = parse(after)?;
    let mut c = parse(current)?;
    let deltas = deltas(&a, &b)?;
    let selected = if selection.is_empty() {
        deltas
            .iter()
            .filter(|d| !already.contains(&d.id))
            .map(|d| d.id.clone())
            .collect::<Vec<_>>()
    } else {
        selection.to_vec()
    };
    let known = deltas
        .iter()
        .map(|d| d.id.as_str())
        .collect::<BTreeSet<_>>();
    if selected.len() > 128
        || selected.iter().collect::<BTreeSet<_>>().len() != selected.len()
        || selected
            .iter()
            .any(|id| !known.contains(id.as_str()) || already.contains(id))
    {
        return Err("Selecciona páginas pendientes de esta operación".into());
    }
    let mut rows = vec![];
    let mut any_conflict = false;
    for d in &deltas {
        let actual = if let Some(page) = &d.page {
            c["pages"]
                .as_array()
                .unwrap()
                .iter()
                .find(|v| v["id"] == *page)
                .cloned()
        } else {
            Some(properties(&c))
        };
        let ready = actual == d.after;
        let chosen = selected.contains(&d.id);
        let done = already.contains(&d.id);
        let conflict = chosen && !ready;
        rows.push(json!({"id":d.id,"pageId":d.page,"beforeAvailable":d.before.is_some(),"afterAvailable":d.after.is_some(),"before":summary(d.before.as_ref(),d.index,d.page.is_none()),"after":summary(d.after.as_ref(),d.index,d.page.is_none()),"selected":chosen,"status":if done{"reverted"}else if ready{"ready"}else{"conflict"},"reason":if ready{None}else{Some("Esta página o sus propiedades tienen cambios posteriores; se conservan")}}));
        if conflict {
            any_conflict = true;
        }
    }
    if !any_conflict {
        for d in deltas.iter().filter(|d| selected.contains(&d.id)) {
            if let Some(page) = &d.page {
                let pages = c["pages"].as_array_mut().unwrap();
                let position = pages.iter().position(|v| v["id"] == *page);
                match (position, &d.before) {
                    (Some(i), Some(before)) => pages[i] = before.clone(),
                    (Some(i), None) => {
                        pages.remove(i);
                    }
                    (None, Some(before)) => {
                        let source = a["pages"].as_array().unwrap();
                        let following = source
                            .iter()
                            .skip(d.index + 1)
                            .filter_map(|v| v["id"].as_str())
                            .find_map(|id| pages.iter().position(|p| p["id"] == id));
                        let at = following.unwrap_or(pages.len());
                        pages.insert(at, before.clone());
                    }
                    (None, None) => (),
                }
            } else {
                let pages = c["pages"].clone();
                c = d
                    .before
                    .clone()
                    .ok_or("Faltan las propiedades anteriores")?;
                c["pages"] = pages;
            }
        }
        document_validation::handwritten(&c)?;
    }
    Ok((
        if any_conflict {
            current.into()
        } else {
            serde_json::to_string_pretty(&c).map_err(|_| "Nota no representable")?
        },
        json!(rows),
        selected,
    ))
}
