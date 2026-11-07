//! Conservative structural inverse patches. Exact context or an explicit conflict; no fuzzy edits.
use super::*;
#[derive(Clone)]
pub(super) struct Hunk {
    pub id: String,
    pub before: String,
    pub after: String,
    pub start: usize,
    pub end: usize,
    pub base_start: usize,
    pub base_end: usize,
    pub prefix: String,
    pub suffix: String,
}
pub(super) fn hunks(before: &str, after: &str) -> (Vec<Hunk>, bool) {
    let a = before.split_inclusive('\n').collect::<Vec<_>>();
    let b = after.split_inclusive('\n').collect::<Vec<_>>();
    let n = a.len();
    let m = b.len();
    if before == after {
        return (vec![], true);
    }
    if n.saturating_mul(m) > 1_000_000 || n > 2000 || m > 2000 {
        return (
            vec![Hunk {
                id: "whole-document".into(),
                before: before.into(),
                after: after.into(),
                start: 0,
                end: after.len(),
                base_start: 0,
                base_end: before.len(),
                prefix: String::new(),
                suffix: String::new(),
            }],
            false,
        );
    }
    let mut table = vec![0u16; (n + 1) * (m + 1)];
    for i in (0..n).rev() {
        for j in (0..m).rev() {
            table[i * (m + 1) + j] = if a[i] == b[j] {
                1 + table[(i + 1) * (m + 1) + j + 1]
            } else {
                table[(i + 1) * (m + 1) + j].max(table[i * (m + 1) + j + 1])
            };
        }
    }
    let (mut i, mut j, mut raw) = (0, 0, vec![]);
    while i < n || j < m {
        if i < n && j < m && a[i] == b[j] {
            i += 1;
            j += 1;
            continue;
        }
        let (ai, bj) = (i, j);
        while i < n || j < m {
            if i < n && j < m && a[i] == b[j] {
                break;
            }
            if j < m && (i == n || table[i * (m + 1) + j + 1] >= table[(i + 1) * (m + 1) + j]) {
                j += 1;
            } else {
                i += 1;
            }
        }
        raw.push((ai, i, bj, j));
    }
    if raw.len() > 128 {
        return (
            vec![Hunk {
                id: "whole-document".into(),
                before: before.into(),
                after: after.into(),
                start: 0,
                end: after.len(),
                base_start: 0,
                base_end: before.len(),
                prefix: String::new(),
                suffix: String::new(),
            }],
            false,
        );
    }
    let base_offsets = std::iter::once(0)
        .chain(a.iter().scan(0usize, |v, line| {
            *v += line.len();
            Some(*v)
        }))
        .collect::<Vec<_>>();
    let offsets = std::iter::once(0)
        .chain(b.iter().scan(0usize, |v, line| {
            *v += line.len();
            Some(*v)
        }))
        .collect::<Vec<_>>();
    (
        raw.into_iter()
            .enumerate()
            .map(|(index, (a0, a1, b0, b1))| Hunk {
                id: format!(
                    "hunk-{index}-{}",
                    &sha256_hex(format!("{before}\0{after}\0{index}").as_bytes())[..12]
                ),
                before: a[a0..a1].concat(),
                after: b[b0..b1].concat(),
                start: offsets[b0],
                end: offsets[b1],
                base_start: base_offsets[a0],
                base_end: base_offsets[a1],
                prefix: b[b0.saturating_sub(2)..b0].concat(),
                suffix: b[b1..(b1 + 2).min(m)].concat(),
            })
            .collect(),
        true,
    )
}
fn location(h: &Hunk, current: &str, original_after: &str) -> Result<(usize, usize), String> {
    if current == original_after {
        return Ok((h.start, h.end));
    }
    let (manual, selective) = hunks(original_after, current);
    if !selective {
        return Err("Los cambios posteriores requieren revisión completa".into());
    }
    let mut shift = 0isize;
    for edit in manual {
        let overlap = edit.base_start < h.end && edit.base_end > h.start;
        let inserted_inside = edit.base_start == edit.base_end
            && edit.base_start > h.start
            && edit.base_start < h.end;
        let same_empty =
            h.start == h.end && edit.base_start == edit.base_end && edit.base_start == h.start;
        if overlap || inserted_inside || same_empty {
            return Err("El bloque tiene cambios posteriores superpuestos".into());
        }
        if edit.base_end <= h.start {
            shift += edit.after.len() as isize - edit.before.len() as isize;
        }
    }
    let start = (h.start as isize)
        .checked_add(shift)
        .filter(|n| *n >= 0)
        .ok_or("No se puede situar el bloque")? as usize;
    let end = start + h.after.len();
    if current.get(start..end) != Some(h.after.as_str()) {
        return Err("El bloque ya no coincide con la copia aplicada".into());
    }
    if !h.after.is_empty() {
        if let Some(first) = current.find(&h.after) {
            let next = first
                + current[first..]
                    .chars()
                    .next()
                    .map(char::len_utf8)
                    .unwrap_or(0);
            if current[next..].contains(&h.after) {
                let context = format!("{}{}{}", h.prefix, h.after, h.suffix);
                let anchored = start
                    .checked_sub(h.prefix.len())
                    .and_then(|at| current.get(at..at + context.len()))
                    .is_some_and(|text| text == context);
                let repeated_context = if let Some(first) = current.find(&context) {
                    let next = first
                        + current[first..]
                            .chars()
                            .next()
                            .map(char::len_utf8)
                            .unwrap_or(0);
                    current[next..].contains(&context)
                } else {
                    false
                };
                if !anchored || repeated_context {
                    return Err(
                        "Hay varios bloques posibles y su contexto cambió; se conserva el trabajo"
                            .into(),
                    );
                }
            }
        }
    }
    Ok((start, end))
}
pub(super) fn inverse(
    before: &str,
    after: &str,
    current: &str,
    selected: &[String],
    already: &[String],
) -> Result<(String, Value, bool), String> {
    let (hunks, selective) = hunks(before, after);
    let known = hunks.iter().map(|h| h.id.as_str()).collect::<BTreeSet<_>>();
    if selected.is_empty()
        || selected.len() > 128
        || selected.iter().collect::<BTreeSet<_>>().len() != selected.len()
        || selected
            .iter()
            .any(|id| !known.contains(id.as_str()) || already.contains(id))
    {
        return Err("Elige bloques pendientes de esta operación".into());
    }
    let mut changes = vec![];
    let mut rows = vec![];
    let mut conflicts = false;
    for h in &hunks {
        let chosen = selected.contains(&h.id);
        let loc = location(h, current, after);
        let done = already.contains(&h.id);
        let ready = loc.is_ok() && !done;
        if chosen {
            match &loc {
                Ok((start, end)) => changes.push((*start, *end, h.before.clone())),
                Err(_) => conflicts = true,
            }
        }
        rows.push(json!({"id":h.id,"before":h.before,"after":h.after,"selected":chosen,"status":if done{"reverted"}else if ready{"ready"}else{"conflict"},"reason":if done{Some("Este bloque ya se revirtió".into())}else{loc.err()}}));
    }
    changes.sort_by_key(|v| v.0);
    for pair in changes.windows(2) {
        if pair[0].1 > pair[1].0 {
            conflicts = true;
        }
    }
    let mut candidate = current.to_owned();
    if !conflicts {
        for (start, end, text) in changes.into_iter().rev() {
            candidate.replace_range(start..end, &text);
        }
    }
    Ok((candidate, json!(rows), selective))
}
