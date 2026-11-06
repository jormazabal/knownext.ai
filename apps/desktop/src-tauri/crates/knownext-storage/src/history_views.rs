//! Consultation points are separate from Git HEAD/index and never check out files.
use super::*;
use std::{fs, io::Read};
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Source {
    pub entry_id: String,
    pub bundle: String,
    pub phase: String,
    pub references: Vec<(String, String)>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Store {
    pub schema_version: u8,
    pub project_id: String,
    pub root_hash: String,
    pub base_head: Option<String>,
    pub tip: Option<String>,
    pub sources: Vec<Source>,
}
fn path(api: &LocalApi, p: &str) -> Result<PathBuf, String> {
    if !request_scope::portable_id(p) {
        return Err("Proyecto de consulta no válido".into());
    }
    let d = api.app_data_dir.join("history-views");
    for dir in [&api.app_data_dir, &d] {
        match fs::symlink_metadata(dir) {
            Ok(m) if m.is_dir() && !batch::linked(&m) => (),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => (),
            _ => return Err("La consulta histórica no tiene carpeta regular".into()),
        }
    }
    Ok(d.join(format!("{p}.json")))
}
pub(super) fn snapshot(api: &LocalApi, p: &str) -> Result<(Store, Option<Vec<u8>>), String> {
    let root = api
        .project_root(p)?
        .canonicalize()
        .map_err(|_| "Proyecto no disponible")?;
    let root_hash = sha256_hex(root.to_string_lossy().as_bytes());
    let file = path(api, p)?;
    let raw = match fs::symlink_metadata(&file) {
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => None,
        Ok(m) if m.is_file() && !batch::linked(&m) && m.len() <= 2 * 1024 * 1024 => {
            let mut b = vec![];
            fs::File::open(&file)
                .map_err(|_| "Consulta histórica no disponible")?
                .take(2 * 1024 * 1024 + 1)
                .read_to_end(&mut b)
                .map_err(|_| "Consulta histórica incompleta")?;
            if b.len() > 2 * 1024 * 1024 {
                return Err("La consulta histórica supera su límite".into());
            }
            Some(b)
        }
        _ => return Err("Consulta histórica desconocida; se conserva".into()),
    };
    let store = match &raw {
        Some(b) => serde_json::from_slice::<Store>(b)
            .map_err(|_| "Consulta histórica no compatible; se conserva")?,
        None => Store {
            schema_version: 1,
            project_id: p.into(),
            root_hash: root_hash.clone(),
            base_head: None,
            tip: None,
            sources: vec![],
        },
    };
    if store.schema_version != 1
        || store.project_id != p
        || store.root_hash != root_hash
        || store.sources.len() > 128
        || store
            .tip
            .as_deref()
            .is_some_and(|s| !version_history::is_commit_id(s))
        || store
            .base_head
            .as_deref()
            .is_some_and(|s| !version_history::is_commit_id(s))
    {
        return Err("La consulta histórica cambió de ámbito o versión; se conserva".into());
    }
    let mut ids = BTreeSet::new();
    for src in &store.sources {
        if src.bundle.len() != 64
            || !src.bundle.bytes().all(|b| b.is_ascii_hexdigit())
            || !ids.insert(&src.bundle)
            || !matches!(src.phase.as_str(), "prepared" | "completed")
            || src.references.len() > 128
            || src.references.iter().enumerate().any(|(i, (name, sha))| {
                *name != format!("refs/knownext-portable/{}/{i}", src.bundle)
                    || !version_history::is_commit_id(sha)
            })
        {
            return Err("Fuente de historial no compatible; se conserva".into());
        }
    }
    Ok((store, raw))
}
pub(super) fn write(
    api: &LocalApi,
    p: &str,
    store: &Store,
    expected: &Option<Vec<u8>>,
) -> Result<(), String> {
    if snapshot(api, p)?.1 != *expected {
        return Err("La consulta histórica cambió; vuelve a revisarla".into());
    }
    let file = path(api, p)?;
    if !file.parent().unwrap().exists() {
        fs::create_dir(file.parent().unwrap())
            .map_err(|_| "No se puede conservar la consulta histórica")?;
    }
    let b = serde_json::to_vec(store).map_err(|_| "Consulta no representable")?;
    if b.len() > 2 * 1024 * 1024 {
        return Err("La consulta histórica supera2MiB".into());
    }
    atomic_io::write(&file, &b)
        .map_err(|_| "La consulta no está confirmada; comprueba sin repetir".into())
}
pub(super) fn head(root: &Path) -> Result<Option<String>, String> {
    let o = run_local_git(local_git_command().arg("-C").arg(root).args([
        "rev-parse",
        "--verify",
        "HEAD",
    ]))?;
    if !o.status.success() {
        return Ok(None);
    }
    let h = String::from_utf8(o.stdout)
        .map_err(|_| "Punto local no representable")?
        .trim()
        .to_owned();
    if !version_history::is_commit_id(&h) {
        return Err("Punto local no verificable".into());
    }
    Ok(Some(h))
}
fn query(root: &Path, args: &[&str]) -> Result<String, String> {
    let o = run_local_git(local_git_command().arg("-C").arg(root).args(args))?;
    if !o.status.success() || o.stdout.len() > 1024 * 1024 {
        return Err("No se pudo comprobar el historial local".into());
    }
    String::from_utf8(o.stdout).map_err(|_| "Historial no representable".into())
}
impl LocalApi {
    pub(super) fn history_query_tip(&self, p: &str) -> Result<String, String> {
        let (s, _) = snapshot(self, p)?;
        let root = self.project_root(p)?;
        if s.base_head == head(&root)? {
            if let Some(t) = s.tip {
                return Ok(t);
            }
        }
        Ok("HEAD".into())
    }
    pub(crate) fn history_points(&self, p: &str, offset: usize) -> Result<Value, String> {
        project_capabilities::require_history_runtime()?;
        if offset > 100000 {
            return Err("Página de historial fuera de límite".into());
        }
        let (s, raw) = snapshot(self, p)?;
        let root = self.project_root(p)?;
        let head = head(&root)?;
        let selected = if s.base_head == head {
            s.tip.clone()
        } else {
            None
        };
        let revision = sha256_hex(
            &serde_json::to_vec(&json!([
                s.root_hash,
                head,
                raw.as_ref().map(|b| sha256_hex(b))
            ]))
            .map_err(|_| "Consulta no representable")?,
        );
        let text = if head.is_some() {
            query(
                &root,
                &[
                    "log",
                    "--all",
                    "--no-show-signature",
                    &format!("--skip={offset}"),
                    "--max-count=51",
                    "--format=%H%x00%s%x00%aI%x00%an",
                ],
            )?
        } else {
            String::new()
        };
        let mut points = vec![];
        for line in text.lines() {
            let f = line.split('\0').collect::<Vec<_>>();
            if f.len() != 4
                || !version_history::is_commit_id(f[0])
                || OffsetDateTime::parse(f[2], &Rfc3339).is_err()
            {
                return Err("Punto histórico no compatible".into());
            }
            points.push(json!({"id":f[0],"title":f[1],"date":f[2],"author":f[3]}));
        }
        let more = points.len() > 50;
        points.truncate(50);
        Ok(
            json!({"schemaVersion":1,"projectId":p,"checkedAt":knownext_core::now_iso(),"revision":revision,"head":head,"selectedTip":selected,"selectionExpired":s.tip.is_some()&&s.base_head!=head,"points":points,"offset":offset,"hasMore":more,"sources":s.sources.iter().map(|s|json!({"id":s.bundle,"phase":s.phase,"references":s.references.len()})).collect::<Vec<_>>(),"preservesFiles":true}),
        )
    }
    pub(crate) fn select_history_point(&self, p: &str, body: Value) -> Result<Value, String> {
        #[derive(Deserialize)]
        #[serde(rename_all = "camelCase", deny_unknown_fields)]
        struct Input {
            revision: String,
            tip: Option<String>,
            acknowledge: bool,
        }
        let q: Input = serde_json::from_value(body).map_err(|_| "Revisa el punto de consulta")?;
        let observed = self.history_points(p, 0)?;
        if !q.acknowledge || observed["revision"] != q.revision {
            return Err("El historial cambió; revisa antes de seleccionar".into());
        }
        let _guard = self.project_transaction(p)?;
        let (mut s, raw) = snapshot(self, p)?;
        let root = self.project_root(p)?;
        if let Some(tip) = &q.tip {
            if !version_history::is_commit_id(tip)
                || query(&root, &["cat-file", "-t", tip])?.trim() != "commit"
                || query(
                    &root,
                    &[
                        "for-each-ref",
                        "--format=%(refname)",
                        &format!("--contains={tip}"),
                    ],
                )?
                .trim()
                .is_empty()
            {
                return Err("El punto no pertenece al historial conservado".into());
            }
        }
        let expected_head = observed["head"].as_str().map(str::to_owned);
        if head(&root)? != expected_head {
            return Err("El historial cambió antes de seleccionar; vuelve a consultar".into());
        }
        s.base_head = expected_head;
        s.tip = q.tip;
        write(self, p, &s, &raw)?;
        if head(&root)? != s.base_head {
            return Err("El historial cambió durante la selección; consulta sin repetir".into());
        }
        self.history_points(p, 0)
    }
}
