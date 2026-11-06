//! Reviewed privacy changes; receipts contain metadata only, never deleted content.
use super::*;
use std::{
    fs,
    io::Read,
    sync::{Arc, Mutex},
};
#[derive(Default)]
pub(super) struct Activity {
    readers: usize,
    exclusive: bool,
}
pub struct PrivatePermit {
    state: Arc<Mutex<Activity>>,
    exclusive: bool,
}
impl Drop for PrivatePermit {
    fn drop(&mut self) {
        if let Ok(mut s) = self.state.lock() {
            if self.exclusive {
                s.exclusive = false;
            } else {
                s.readers = s.readers.saturating_sub(1);
            }
        }
    }
}
fn regular_dir(path: &Path, optional: bool) -> Result<(), String> {
    match fs::symlink_metadata(path) {
        Ok(m) if m.is_dir() && !batch::linked(&m) => Ok(()),
        Err(e) if optional && e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        _ => Err("La carpeta de datos no es regular; se conserva".into()),
    }
}
fn bytes(path: &Path, limit: u64) -> Result<Option<Vec<u8>>, String> {
    regular_dir(path.parent().ok_or("Almacén no válido")?, true)?;
    let m = match fs::symlink_metadata(path) {
        Ok(m) => m,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        _ => return Err("No se puede revisar un almacén; se conserva".into()),
    };
    if !m.is_file() || batch::linked(&m) || m.len() > limit {
        return Err("Almacén no regular o fuera de límite; se conserva".into());
    }
    let mut b = vec![];
    fs::File::open(path)
        .map_err(|_| "No se puede leer el almacén")?
        .take(limit + 1)
        .read_to_end(&mut b)
        .map_err(|_| "Lectura incompleta; se conserva")?;
    if b.len() as u64 > limit {
        return Err("Almacén fuera de límite; se conserva".into());
    }
    Ok(Some(b))
}
fn sha(b: &Option<Vec<u8>>) -> String {
    sha256_hex(b.as_deref().unwrap_or(b"absent-privacy-store"))
}
#[derive(Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Policy {
    schema_version: u8,
    projects: BTreeMap<String, bool>,
}
fn policy(api: &LocalApi) -> Result<(Policy, Option<Vec<u8>>), String> {
    regular_dir(&api.app_data_dir, false)?;
    let raw = bytes(&api.app_data_dir.join("ai-privacy-policy.json"), 256 * 1024)?;
    let p = match &raw {
        None => Policy {
            schema_version: 1,
            projects: Default::default(),
        },
        Some(b) => serde_json::from_slice::<Policy>(b)
            .map_err(|_| "Política de privacidad ilegible; se conserva")?,
    };
    if p.schema_version != 1
        || p.projects.len() > 256
        || p.projects.keys().any(|id| !request_scope::portable_id(id))
    {
        return Err("Política de privacidad no compatible; se conserva".into());
    }
    Ok((p, raw))
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PolicyChange {
    schema_version: u8,
    revision: String,
    send_allowed: bool,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Selection {
    categories: Vec<String>,
    before: Option<String>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Apply {
    schema_version: u8,
    review_id: String,
    revision: String,
    selection: Selection,
    confirmed: bool,
}
struct Entry {
    path: PathBuf,
    raw: Vec<u8>,
    next: Option<Vec<u8>>,
}
struct Plan {
    entries: Vec<Entry>,
    summary: Vec<Value>,
    revision: String,
    policy_revision: String,
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Receipt {
    schema_version: u8,
    id: String,
    project_id: String,
    revision: String,
    phase: String,
    planned_files: usize,
    completed_files: usize,
    checked_at: String,
}
fn receipt_path(api: &LocalApi, id: &str) -> Result<PathBuf, String> {
    if !id.starts_with("privacy-") || !request_scope::portable_id(id) {
        return Err("Identidad de revisión no válida".into());
    }
    regular_dir(&api.app_data_dir, false)?;
    let d = api.app_data_dir.join("ai-privacy-receipts");
    regular_dir(&d, true)?;
    Ok(d.join(format!("{id}.json")))
}
fn write_receipt(path: &Path, r: &Receipt, create: bool) -> Result<(), String> {
    if !path.parent().unwrap().exists() {
        fs::create_dir(path.parent().unwrap())
            .map_err(|_| "No se puede registrar la eliminación")?;
    }
    regular_dir(path.parent().unwrap(), false)?;
    let b = serde_json::to_vec(r).map_err(|_| "No se puede registrar la eliminación")?;
    if create {
        atomic_io::create(path, &b)
    } else {
        atomic_io::write(path, &b)
    }
    .map_err(|_| "No se pudo confirmar el diario de eliminación".into())
}
fn selected(item: &Value, before: Option<OffsetDateTime>) -> bool {
    match before {
        None => true,
        Some(cut) => [
            "createdAt",
            "updatedAt",
            "builtAt",
            "completedAt",
            "receivedAt",
            "indexedAt",
        ]
        .iter()
        .filter_map(|k| {
            item[*k]
                .as_str()
                .and_then(|s| OffsetDateTime::parse(s, &Rfc3339).ok())
        })
        .max()
        .is_some_and(|d| d < cut),
    }
}
impl LocalApi {
    pub fn private_work(&self) -> Result<PrivatePermit, String> {
        let mut s = self
            .private_activity
            .lock()
            .map_err(|_| "No se pudo comprobar el trabajo IA")?;
        if s.exclusive {
            return Err("Hay una eliminación de datos IA en curso; no se inicia el envío".into());
        }
        s.readers = s.readers.checked_add(1).ok_or("Demasiado trabajo IA")?;
        Ok(PrivatePermit {
            state: self.private_activity.clone(),
            exclusive: false,
        })
    }
    fn privacy_exclusive(&self) -> Result<PrivatePermit, String> {
        let mut s = self
            .private_activity
            .lock()
            .map_err(|_| "No se pudo comprobar el trabajo IA")?;
        if s.exclusive || s.readers > 0 || self.has_background_work() {
            return Err("Todavía hay trabajo IA activo. Espera a que termine y vuelve a revisar; no se ha eliminado nada".into());
        }
        s.exclusive = true;
        Ok(PrivatePermit {
            state: self.private_activity.clone(),
            exclusive: true,
        })
    }
    pub(crate) fn require_ai_transmission(&self, project: Option<&str>) -> Result<(), String> {
        let (p, _) = policy(self)?;
        if project.and_then(|id| p.projects.get(id)) == Some(&false) {
            return Err("Los envíos IA están pausados en este proyecto. Revisa Privacidad antes de reactivarlos".into());
        }
        Ok(())
    }
    pub(super) fn review_ai_privacy_policy(&self, project: &str) -> Result<Value, String> {
        self.project_root(project)?;
        let (p, raw) = policy(self)?;
        Ok(
            json!({"schemaVersion":1,"projectId":project,"revision":sha(&raw),"sendAllowed":p.projects.get(project).copied().unwrap_or(true),"automaticExpiry":false,"checkedAt":knownext_core::now_iso()}),
        )
    }
    pub(super) fn change_ai_privacy_policy(
        &self,
        project: &str,
        body: Value,
    ) -> Result<Value, String> {
        self.project_root(project)?;
        let q: PolicyChange =
            serde_json::from_value(body).map_err(|_| "Cambio de privacidad no válido")?;
        let (mut p, raw) = policy(self)?;
        if q.schema_version != 1 || q.revision != sha(&raw) {
            return Err("La política cambió; vuelve a consultarla".into());
        }
        if !p.projects.contains_key(project) && p.projects.len() >= 256 {
            return Err("La política admite256 proyectos".into());
        }
        p.projects.insert(project.into(), q.send_allowed);
        let path = self.app_data_dir.join("ai-privacy-policy.json");
        let data = serde_json::to_vec(&p).map_err(|_| "No se pudo preparar la política")?;
        if bytes(&path, 256 * 1024)? != raw {
            return Err("La política cambió; no se ha sustituido".into());
        }
        atomic_io::write(&path, &data)
            .map_err(|_| "No se pudo confirmar el cambio de privacidad")?;
        self.review_ai_privacy_policy(project)
    }
    fn privacy_plan(&self, project: &str, q: &Selection) -> Result<Plan, String> {
        if q.categories.is_empty()
            || q.categories.len() > 5
            || q.categories.iter().collect::<BTreeSet<_>>().len() != q.categories.len()
            || q.categories.iter().any(|c| {
                !["conversation", "context", "index", "results", "research"].contains(&c.as_str())
            })
        {
            return Err("Selecciona categorías de datos conocidas".into());
        }
        let before = q
            .before
            .as_deref()
            .map(|s| {
                OffsetDateTime::parse(s, &Rfc3339).map_err(|_| "Fecha de conservación no válida")
            })
            .transpose()?;
        if before.is_some_and(|d| d > OffsetDateTime::now_utc()) {
            return Err("La fecha de conservación no puede ser futura".into());
        }
        let root = self
            .project_root(project)?
            .canonicalize()
            .map_err(|_| "Proyecto no disponible")?;
        let (_, praw) = policy(self)?;
        let mut entries = vec![];
        let mut summary = vec![];
        let mut fingerprints = vec![];
        let mut total = 0u64;
        for category in &q.categories {
            let mut candidates: Vec<(PathBuf, Option<Value>, Option<&str>)> = vec![];
            match category.as_str() {
                "conversation" => candidates.push((
                    self.conversation_path(project),
                    Some(self.conversation_checked(project)?),
                    Some("events"),
                )),
                "context" => candidates.push((
                    self.context_sources_path(project),
                    Some(self.context_checked(project)?),
                    Some("sources"),
                )),
                "index" => {
                    let stored = self.read_ai_index(project)?;
                    candidates.push((self.ai_index_path(project)?, stored.map(|s| s.value), None));
                }
                "research" => candidates.push((
                    self.research_jobs_path(project),
                    Some(self.research_jobs_checked(project)?),
                    Some("jobs"),
                )),
                "results" => {
                    for (path, value) in ai_results::privacy_entries(self, project)? {
                        candidates.push((path, Some(value), None));
                    }
                }
                _ => unreachable!(),
            }
            let (mut removed, mut kept, mut removed_bytes) = (0usize, 0usize, 0u64);
            for (path, value, key) in candidates {
                let raw = bytes(&path, 64 * 1024 * 1024)?;
                total = total.saturating_add(raw.as_ref().map_or(0, |v| v.len() as u64));
                if total > 128 * 1024 * 1024 || entries.len() > 260 {
                    return Err(
                        "La revisión supera128MiB/260 archivos; selecciona menos categorías".into(),
                    );
                }
                fingerprints.push(json!({"category":category,"file":sha256_hex(path.to_string_lossy().as_bytes()),"revision":sha(&raw)}));
                let (Some(raw), Some(mut value)) = (raw, value) else {
                    continue;
                };
                let (mut count, mut next) = (0usize, None);
                if let Some(key) = key {
                    let items = value[key]
                        .as_array_mut()
                        .ok_or("Colección privada no compatible")?;
                    let old = items.len();
                    let mut ids = BTreeSet::new();
                    items.retain(|item| {
                        if selected(item, before) {
                            if let Some(id) = item["id"].as_str() {
                                ids.insert(id.to_owned());
                            }
                            false
                        } else {
                            true
                        }
                    });
                    count = old - items.len();
                    kept += items.len();
                    if category == "context" {
                        if let Some(expired) = value["expiredSourceIds"].as_array_mut() {
                            if before.is_none() {
                                expired.clear();
                            } else {
                                expired.retain(|id| !id.as_str().is_some_and(|s| ids.contains(s)));
                            }
                        }
                    }
                    next = Some(
                        serde_json::to_vec(&value)
                            .map_err(|_| "No se pudo preparar la limpieza")?,
                    );
                } else if selected(&value, before) {
                    count = 1;
                } else {
                    kept += 1;
                }
                if count > 0
                    || next.as_ref().is_some_and(|b| *b != raw)
                        && category == "context"
                        && before.is_none()
                {
                    removed += count;
                    removed_bytes = removed_bytes.saturating_add(
                        raw.len().saturating_sub(next.as_ref().map_or(0, Vec::len)) as u64,
                    );
                    entries.push(Entry { path, raw, next });
                }
            }
            summary.push(json!({"id":category,"itemsToRemove":removed,"itemsKept":kept,"bytesToRemove":removed_bytes}));
        }
        let revision=sha256_hex(&serde_json::to_vec(&json!({"projectId":project,"root":sha256_hex(root.to_string_lossy().as_bytes()),"selection":q,"policy":sha(&praw),"files":fingerprints})).map_err(|_|"No se pudo revisar la eliminación")?);
        Ok(Plan {
            entries,
            summary,
            revision,
            policy_revision: sha(&praw),
        })
    }
    pub(super) fn review_ai_privacy(&self, project: &str, body: Value) -> Result<Value, String> {
        let q: Selection =
            serde_json::from_value(body).map_err(|_| "Revisión de datos no válida")?;
        let plan = self.privacy_plan(project, &q)?;
        Ok(
            json!({"schemaVersion":1,"projectId":project,"reviewId":knownext_core::compact_id("privacy"),"revision":plan.revision,"selection":q,"categories":plan.summary,"plannedFiles":plan.entries.len(),"policyRevision":plan.policy_revision,"checkedAt":knownext_core::now_iso(),"excluded":["documents","drafts","history","source-audio-and-transcripts","accounting-receipts","recovery-copies","exports","provider-copies"],"forensicErasure":false}),
        )
    }
    pub(super) fn ai_privacy_receipt(&self, project: &str, id: &str) -> Result<Value, String> {
        let path = receipt_path(self, id)?;
        let raw =
            bytes(&path, 64 * 1024)?.ok_or("No hay acuse local; no se repite automáticamente")?;
        let mut r: Receipt =
            serde_json::from_slice(&raw).map_err(|_| "Acuse no compatible; se conserva")?;
        if r.schema_version != 1
            || r.id != id
            || r.project_id != project
            || !matches!(r.phase.as_str(), "applying" | "completed" | "interrupted")
            || r.completed_files > r.planned_files
            || r.planned_files > 260
        {
            return Err("Acuse ajeno o no compatible; se conserva".into());
        }
        // A persisted applying receipt is observationally interrupted after its
        // exclusive worker has left (also after restart). Never resume it here.
        if r.phase=="applying"&&!self.private_activity.lock().map_err(|_|"No se puede comprobar el trabajo privado")?.exclusive{r.phase="interrupted".into();}
        serde_json::to_value(r).map_err(|_| "Acuse no disponible".into())
    }
    pub(super) fn apply_ai_privacy(&self, project: &str, body: Value) -> Result<Value, String> {
        let q: Apply = serde_json::from_value(body).map_err(|_| "Eliminación no válida")?;
        if q.schema_version != 1 || !q.confirmed {
            return Err("Confirma el alcance revisado antes de eliminar".into());
        }
        let path = receipt_path(self, &q.review_id)?;
        if bytes(&path, 64 * 1024)?.is_some() {
            let r = self.ai_privacy_receipt(project, &q.review_id)?;
            if r["revision"] != q.revision {
                return Err("La identidad ya pertenece a otra revisión".into());
            }
            return Ok(r);
        }
        let _private = self.privacy_exclusive()?;
        let _research = self
            .research_gate
            .lock()
            .map_err(|_| "No se puede revisar la investigación")?;
        let _project = self.project_transaction(project)?;
        self.require_privacy_paused(project)?;
        let plan = self.privacy_plan(project, &q.selection)?;
        if plan.revision != q.revision {
            return Err(
                "Los datos o la política cambiaron; vuelve a revisar antes de eliminar".into(),
            );
        }
        let root = path.parent().unwrap();
        if root.exists() {
            let mut count = 0;
            for e in fs::read_dir(root)
                .map_err(|_| "No se pueden revisar los acuses")?
                .take(1001)
            {
                let e = e.map_err(|_| "Acuse no accesible")?;
                let n = e.file_name().to_string_lossy().into_owned();
                if !n.starts_with("privacy-") || !n.ends_with(".json") {
                    return Err("Hay un acuse desconocido; se conserva".into());
                }
                let m = fs::symlink_metadata(e.path()).map_err(|_| "Acuse no accesible")?;
                if !m.is_file() || batch::linked(&m) || m.len() > 64 * 1024 {
                    return Err("Acuse no regular o fuera de límite; se conserva".into());
                }
                count += 1;
            }
            if count >= 1000 {
                return Err("Los acuses alcanzan1000 identidades; no se reutilizan".into());
            }
        }
        for entry in &plan.entries {
            if bytes(&entry.path, 64 * 1024 * 1024)?.as_ref() != Some(&entry.raw) {
                return Err("Los datos cambiaron; no se ha eliminado nada".into());
            }
        }
        let mut receipt = Receipt {
            schema_version: 1,
            id: q.review_id,
            project_id: project.into(),
            revision: q.revision,
            phase: "applying".into(),
            planned_files: plan.entries.len(),
            completed_files: 0,
            checked_at: knownext_core::now_iso(),
        };
        write_receipt(&path, &receipt, true)?;
        for entry in plan.entries {
            let result = (|| -> Result<(), String> {
                if bytes(&entry.path, 64 * 1024 * 1024)?.as_ref() != Some(&entry.raw) {
                    return Err("Los datos cambiaron".into());
                }
                match entry.next {
                    Some(next) => atomic_io::write(&entry.path, &next)
                        .map_err(|_| "No se pudo confirmar el cambio".into()),
                    None => fs::remove_file(&entry.path)
                        .map_err(|_| "No se pudo confirmar la retirada".into()),
                }
            })();
            if result.is_err() {
                receipt.phase = "interrupted".into();
                receipt.checked_at = knownext_core::now_iso();
                write_receipt(&path, &receipt, false)?;
                return serde_json::to_value(receipt).map_err(|_| "Acuse no disponible".into());
            }
            receipt.completed_files += 1;
            write_receipt(&path, &receipt, false)?;
        }
        receipt.phase = "completed".into();
        receipt.checked_at = knownext_core::now_iso();
        write_receipt(&path, &receipt, false)?;
        serde_json::to_value(receipt).map_err(|_| "Acuse no disponible".into())
    }
    fn require_privacy_paused(&self, project: &str) -> Result<(), String> {
        let (p, _) = policy(self)?;
        if p.projects.get(project) != Some(&false) {
            return Err("Pausa primero los nuevos envíos IA de este proyecto".into());
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture() -> (tempfile::TempDir, LocalApi, String) {
        let d = tempfile::tempdir().unwrap();
        let a = LocalApi::new(d.path().join("state"), "qa".into(), "test".into());
        let p = a
            .create_project(
                json!({"name":"Owned privacy QA","versioningMode":"none","syncMode":"none"}),
            )
            .unwrap();
        (d, a, p["id"].as_str().unwrap().into())
    }
    fn pause(a: &LocalApi, p: &str) {
        let r = a.review_ai_privacy_policy(p).unwrap();
        a.change_ai_privacy_policy(
            p,
            json!({"schemaVersion":1,"revision":r["revision"],"sendAllowed":false}),
        )
        .unwrap();
    }
    fn select() -> Value {
        json!({"categories":["conversation","context","research","index","results"],"before":null})
    }
    fn apply(a: &LocalApi, p: &str, r: &Value) -> Result<Value, String> {
        a.apply_ai_privacy(p,json!({"schemaVersion":1,"reviewId":r["reviewId"],"revision":r["revision"],"selection":r["selection"],"confirmed":true}))
    }
    #[test]
    fn security_block_privacy_requires_pause_and_idle_work_and_replay_only_observes() {
        let (_d, a, p) = fixture();
        a.append_ai_conversation_events(
            &p,
            vec![json!({"content":"PRIVATE-PROMPT-CANARY","createdAt":"2025-01-01T00:00:00Z"})],
        )
        .unwrap();
        let r = a.review_ai_privacy(&p, select()).unwrap();
        assert!(!r.to_string().contains("CANARY"));
        assert!(apply(&a, &p, &r).is_err());
        pause(&a, &p);
        let r = a.review_ai_privacy(&p, select()).unwrap();
        let work = a.private_work().unwrap();
        assert!(apply(&a, &p, &r).is_err());
        drop(work);
        let receipt = apply(&a, &p, &r).unwrap();
        assert_eq!(receipt["phase"], "completed");
        assert!(a.conversation_checked(&p).unwrap()["events"]
            .as_array()
            .unwrap()
            .is_empty());
        a.append_ai_conversation_events(&p, vec![json!({"content":"NEW-CONTENT-CANARY"})])
            .unwrap();
        let again = apply(&a, &p, &r).unwrap();
        assert_eq!(again, receipt);
        assert_eq!(
            a.conversation_checked(&p).unwrap()["events"][0]["content"],
            "NEW-CONTENT-CANARY"
        );
        assert!(!a
            .ai_privacy_receipt(&p, r["reviewId"].as_str().unwrap())
            .unwrap()
            .to_string()
            .contains("CANARY"));
    }
    #[test]
    fn security_block_privacy_stale_future_and_unknown_categories_preserve_bytes() {
        let (_d, a, p) = fixture();
        pause(&a, &p);
        a.append_ai_conversation_events(&p, vec![json!({"content":"original"})])
            .unwrap();
        let r = a.review_ai_privacy(&p, select()).unwrap();
        a.append_ai_conversation_events(&p, vec![json!({"content":"new"})])
            .unwrap();
        let path = a.conversation_path(&p);
        let before = fs::read(&path).unwrap();
        assert!(apply(&a, &p, &r).is_err());
        assert_eq!(fs::read(&path).unwrap(), before);
        assert!(a
            .review_ai_privacy(&p, json!({"categories":["documents"],"before":null}))
            .is_err());
        let future = b"{\"schemaVersion\":99,\"events\":[]}";
        fs::write(&path, future).unwrap();
        assert!(a.review_ai_privacy(&p, select()).is_err());
        assert_eq!(fs::read(path).unwrap(), future);
    }
    #[test]
    fn security_block_retention_uses_latest_known_date_and_preserves_undated_entries() {
        let (_d, a, p) = fixture();
        pause(&a, &p);
        a.append_ai_conversation_events(&p,vec![json!({"content":"old","createdAt":"2024-01-01T00:00:00Z"}),json!({"content":"updated","createdAt":"2024-01-01T00:00:00Z","updatedAt":"2026-01-01T00:00:00Z"}),json!({"content":"undated"})]).unwrap();
        let r = a
            .review_ai_privacy(
                &p,
                json!({"categories":["conversation"],"before":"2025-01-01T00:00:00Z"}),
            )
            .unwrap();
        assert_eq!(r["categories"][0]["itemsToRemove"], 1);
        apply(&a, &p, &r).unwrap();
        let c = a.conversation_checked(&p).unwrap();
        assert_eq!(c["events"].as_array().unwrap().len(), 2);
        assert_eq!(c["events"][0]["content"], "updated");
    }
    #[test]
    fn security_block_paused_transmission_is_local_and_other_projects_remain_independent() {
        let (_d, a, p) = fixture();
        pause(&a, &p);
        assert!(a.require_ai_transmission(Some(&p)).is_err());
        assert!(a.require_ai_transmission(None).is_ok());
        assert!(a
            .spend_preflight(Some(&p))
            .unwrap_err()
            .contains("pausados"));
        let path = a.app_data_dir.join("ai-privacy-policy.json");
        let future = b"{\"schemaVersion\":99,\"projects\":{}}";
        fs::write(&path, future).unwrap();
        assert!(a.require_ai_transmission(None).is_err());
        assert_eq!(fs::read(path).unwrap(), future);
    }
    #[test]
    fn security_block_full_category_review_removes_only_selected_project_data() {
        let (_d, a, p) = fixture();
        let root = a.project_root(&p).unwrap();
        fs::write(root.join("original.md"), "SOURCE-CANARY").unwrap();
        a.append_ai_conversation_events(
            &p,
            vec![json!({"content":"PRIVATE-CONVERSATION","createdAt":"2024-01-01T00:00:00Z"})],
        )
        .unwrap();
        a.write_json(&a.context_sources_path(&p),&json!({"sources":[{"id":"source","createdAt":"2024-01-01T00:00:00Z","text":"PRIVATE-CONTEXT"}],"expiredSourceIds":[]})).unwrap();
        a.write_json(&a.research_jobs_path(&p),&json!({"jobs":[{"id":"job-owned","projectId":p,"createdAt":"2024-01-01T00:00:00Z","status":"completed"}]})).unwrap();
        a.write_ai_index(&p,&json!({"schemaVersion":1,"projectId":p,"vectorStoreId":format!("local-rag:{p}"),"indexedAt":"2024-01-01T00:00:00Z","documents":[],"chunks":[],"failedDocuments":[]})).unwrap();
        a.preserve_ai_result(json!({"id":format!("{p}:privacy"),"projectId":p,"projectName":"Owned","receivedAt":"2024-01-01T00:00:00Z","reason":"review","answer":"PRIVATE-RESULT","originProjectRootHash":sha256_hex(root.canonicalize().unwrap().to_string_lossy().as_bytes()),"outputs":[],"appliedPaths":[]})).unwrap();
        pause(&a, &p);
        let mut selection = select();
        selection["before"] = json!("2025-01-01T00:00:00Z");
        let r = a.review_ai_privacy(&p, selection).unwrap();
        assert!(
            r["categories"]
                .as_array()
                .unwrap()
                .iter()
                .all(|c| c["itemsToRemove"] == 1),
            "{r}"
        );
        let result = apply(&a, &p, &r).unwrap();
        assert_eq!(result["completedFiles"], 5);
        assert_eq!(
            fs::read_to_string(root.join("original.md")).unwrap(),
            "SOURCE-CANARY"
        );
        assert!(a.read_ai_index(&p).unwrap().is_none());
        assert!(a.list_ai_results().unwrap()["results"]
            .as_array()
            .unwrap()
            .is_empty());
        assert!(a.context_checked(&p).unwrap()["sources"]
            .as_array()
            .unwrap()
            .is_empty());
        assert!(a.research_jobs_checked(&p).unwrap()["jobs"]
            .as_array()
            .unwrap()
            .is_empty());
    }
    #[cfg(windows)]
    #[test]
    fn security_block_partial_deletion_has_an_observable_receipt_and_never_replays() {
        let (_d, a, p) = fixture();
        pause(&a, &p);
        a.append_ai_conversation_events(&p, vec![json!({"content":"old"})])
            .unwrap();
        a.write_json(
            &a.context_sources_path(&p),
            &json!({"sources":[{"id":"source","text":"original"}],"expiredSourceIds":[]}),
        )
        .unwrap();
        let r = a
            .review_ai_privacy(
                &p,
                json!({"categories":["conversation","context"],"before":null}),
            )
            .unwrap();
        let target = a.context_sources_path(&p);
        let original = fs::read(&target).unwrap();
        let mut permissions = fs::metadata(&target).unwrap().permissions();
        permissions.set_readonly(true);
        fs::set_permissions(&target, permissions.clone()).unwrap();
        let first = apply(&a, &p, &r).unwrap();
        assert_eq!(first["phase"], "interrupted");
        assert_eq!(first["completedFiles"], 1);
        assert_eq!(fs::read(&target).unwrap(), original);
        permissions.set_readonly(false);
        fs::set_permissions(&target, permissions).unwrap();
        a.append_ai_conversation_events(&p, vec![json!({"content":"new content"})])
            .unwrap();
        assert_eq!(apply(&a, &p, &r).unwrap(), first);
        assert_eq!(
            a.conversation_checked(&p).unwrap()["events"][0]["content"],
            "new content"
        );
        assert_eq!(fs::read(&target).unwrap(), original);
    }
 #[test]fn security_block_orphaned_receipt_is_observed_interrupted_without_changing_its_bytes(){let(_d,a,p)=fixture();let id="privacy-owned-orphan";let path=receipt_path(&a,id).unwrap();let r=Receipt{schema_version:1,id:id.into(),project_id:p.clone(),revision:"a".repeat(64),phase:"applying".into(),planned_files:2,completed_files:0,checked_at:knownext_core::now_iso()};write_receipt(&path,&r,true).unwrap();let raw=fs::read(&path).unwrap();assert_eq!(a.ai_privacy_receipt(&p,id).unwrap()["phase"],"interrupted");assert_eq!(fs::read(path).unwrap(),raw);}

}
