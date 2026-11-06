//! Cooperative source-write admission. Never wait while another runtime queue is held.
use super::*;
use std::{marker::PhantomData, rc::Rc, thread::ThreadId};
#[derive(Default)]
pub(super) struct Operations {
    writers: usize,
    transaction: Option<(ThreadId, usize)>,
}
pub(crate) struct Permit {
    owner: Arc<ProjectOwner>,
    transaction: bool,
    transaction_member: bool,
    _thread: PhantomData<Rc<()>>,
}
fn busy() -> String {
    "El proyecto tiene una operación de integridad en curso. Los cambios se conservan; vuelve a revisar antes de aplicarlos. No se ha repetido ninguna operación.".into()
}
impl ProjectOwner {
    fn permit(self: &Arc<Self>, transaction: bool) -> Result<Permit, String> {
        let thread = std::thread::current().id();
        let mut state = self
            .operations
            .lock()
            .map_err(|_| "No se puede comprobar la actividad del proyecto")?;
        if transaction {
            if state.transaction.is_none() && state.writers > 0 {
                return Err(busy());
            }
            match &mut state.transaction {
                Some((owner, depth)) if *owner == thread => {
                    *depth = depth
                        .checked_add(1)
                        .ok_or("La reserva de integridad supera su límite")?
                }
                Some(_) => return Err(busy()),
                None => state.transaction = Some((thread, 1)),
            }
        } else {
            if state
                .transaction
                .as_ref()
                .is_some_and(|(owner, _)| *owner != thread)
            {
                return Err(busy());
            }
            let writers = state
                .writers
                .checked_add(1)
                .ok_or("La actividad del proyecto supera su límite")?;
            if let Some((_, depth)) = &mut state.transaction {
                *depth = depth
                    .checked_add(1)
                    .ok_or("La reserva de integridad supera su límite")?;
            }
            state.writers = writers;
        }
        let transaction_member = state.transaction.is_some();
        Ok(Permit {
            owner: self.clone(),
            transaction,
            transaction_member,
            _thread: PhantomData,
        })
    }
}
impl Drop for Permit {
    fn drop(&mut self) {
        if let Ok(mut state) = self.owner.operations.lock() {
            if self.transaction_member {
                if let Some((_, depth)) = &mut state.transaction {
                    *depth -= 1;
                    if *depth == 0 {
                        state.transaction = None;
                    }
                }
            }
            if !self.transaction {
                state.writers -= 1;
            }
        }
    }
}
impl LocalApi {
    fn operation_owner(&self, project: &str) -> Result<Arc<ProjectOwner>, String> {
        let root = self
            .project_root(project)?
            .canonicalize()
            .map_err(|_| "No se puede revisar la ubicación del proyecto")?;
        self.project_owners
            .lock()
            .map_err(|_| "No se puede comprobar el propietario del proyecto")?
            .get(&root)
            .cloned()
            .ok_or("No se ha confirmado el propietario del proyecto".into())
    }
    pub(crate) fn project_write(&self, project: &str) -> Result<Permit, String> {
        self.operation_owner(project)?.permit(false)
    }
    // Exclusive source publication. Registry transactions must additionally own
    // the runtime mutation authority. This is no CAS against external programs.
    pub(crate) fn project_transaction(&self, project: &str) -> Result<Permit, String> {
        self.operation_owner(project)?.permit(true)
    }
    // Missing-source reassociation may retain an already held owner without touching
    // its coordination file. Every existing ancestor must still be regular.
    pub(crate) fn missing_location_identity(&self, root: &Path) -> Result<PathBuf, String> {
        match std::fs::symlink_metadata(root) {
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => (),
            _ => return Err("La fuente original no confirma su ausencia; revisa la ubicación".into()),
        }
        for ancestor in root.ancestors().skip(1) {
            match std::fs::symlink_metadata(ancestor) {
                Ok(meta) if meta.is_dir() && !batch::linked(&meta) => (),
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => (),
                _ => return Err("La ubicación original no es verificable; se conserva la asociación".into()),
            }
        }
        // Recover the canonical identity from an existing regular ancestor. The
        // missing suffix can contain historical `..` or an existing ancestor alias.
        let ancestor = root.ancestors().skip(1).find(|path| std::fs::symlink_metadata(path).is_ok())
            .ok_or("No se puede correlacionar la fuente original ausente")?;
        let mut canonical = ancestor.canonicalize().map_err(|_| "No se puede verificar el ancestro original")?;
        for component in root.strip_prefix(ancestor).map_err(|_| "Ubicación original no compatible")?.components() {
            match component {
                std::path::Component::Normal(name) => canonical.push(name),
                std::path::Component::CurDir => (),
                std::path::Component::ParentDir if canonical.pop() => (),
                _ => return Err("La fuente original sale de su ubicación verificable".into()),
            }
        }
        Ok(canonical)
    }
    pub(crate) fn missing_location_transaction(&self, root: &Path) -> Result<Vec<Permit>, String> {
        let canonical = self.missing_location_identity(root)?;
        let key = |path: &Path| if cfg!(windows) {
            path.to_string_lossy().replace('/', "\\").trim_start_matches("\\\\?\\").trim_end_matches('\\').to_lowercase()
        } else { path.to_string_lossy().trim_end_matches('/').to_string() };
        let wanted = key(&canonical);
        let held = self.project_owners.lock().map_err(|_| "No se puede coordinar la ubicación original")?;
        let owners = match held.iter().find(|(path, _)| key(path) == wanted) {
            Some((_, owner)) => vec![owner.clone()],
            // A vanished short-name alias may not be reconstructible. Reserve
            // retained owners conservatively; idle projects never strand a relink.
            None => held.values().cloned().collect::<Vec<_>>(),
        };
        drop(held);
        owners.into_iter().map(|owner|owner.permit(true)).collect()
    }
    pub(crate) fn location_target_transaction(&self, root: &Path) -> Result<Permit, String> {
        let canonical = self.claim_project_root(root)?.canonicalize().map_err(|_| "No se puede verificar el destino revisado")?;
        let owner = self.project_owners.lock().map_err(|_| "No se puede coordinar el destino revisado")?
            .get(&canonical).cloned().ok_or("No se ha confirmado el propietario del destino")?;
        owner.permit(true)
    }
    pub(crate) fn request_project_write(
        &self,
        method: &str,
        path: &str,
        parts: &[&str],
        body: &Value,
    ) -> Result<Option<Permit>, String> {
        if method == "GET" || Self::is_independent_snapshot(method, path) {
            return Ok(None);
        }
        if let ("POST",["api","handwritten-notes",_,"ocr"])=(method,parts){return Ok(None);}
        if let ("POST",["api","handwritten-notes",id,"ocr",_,"apply"])=(method,parts){return self.project_transaction(&document_ref(id)?.0).map(Some);}
        if let ("POST",["api","projects",project,"research-evidence",_,"apply"])=(method,parts){return self.project_transaction(project).map(Some);}
        if let ("POST",["api","projects",project,"meeting-minutes"])=(method,parts){return self.project_transaction(project).map(Some);}
        if let ("POST",["api","projects",project,"external-changes","import"])=(method,parts){return self.project_transaction(project).map(Some);}
        if let ("POST",["api","handwritten-notes",id,"pages",_,"insert-markdown"])=(method,parts){return self.project_transaction(&document_ref(id)?.0).map(Some);}
        if let ("POST",["api","projects",project,"versions"])=(method,parts){return self.project_transaction(project).map(Some);}
        if let ("POST",["api","projects",project,"sync","mixed-selections"])=(method,parts){return self.project_transaction(project).map(Some);}
        if let ("POST",["api","projects",project,"sync","mixed-selections",_,"application",..])=(method,parts){return self.project_transaction(project).map(Some);}
        if let ("POST",["api","projects",project,"sync","graph-joins"])=(method,parts){return self.project_transaction(project).map(Some);}
        if let ("POST",["api","projects",project,"sync","history-copies"])=(method,parts){return self.project_transaction(project).map(Some);}
        if let ("POST",["api","projects",project,"ai","context","sources",_,"refresh"])=(method,parts){return self.project_transaction(project).map(Some);}
        if let ("POST",["api","projects",project,"trash",_,"restore"])=(method,parts){
            return self.project_transaction(project).map(Some);
        }
        if matches!((method,parts),("POST",["api","drafts",_,"restore"])|("DELETE",["api","drafts",_])){
            let id=body["documentId"].as_str().ok_or("Falta la identidad del documento revisado")?;
            return self.project_transaction(&document_ref(id)?.0).map(Some);
        }
        if let ("POST",["api","documents"|"handwritten-notes",id,"ai-changes","prepare"|"apply"])=(method,parts){return self.project_transaction(&document_ref(id)?.0).map(Some);}
        if let Some(id)=draft_versions::mutation_document(method,parts){return self.project_transaction(&document_ref(id)?.0).map(Some);}
        if let ["api", "documents" | "handwritten-notes", id, "conflict"] = parts {
            return self.project_transaction(&document_ref(id)?.0).map(Some);
        }
        let owner = match parts {
            ["api","projects",project,"ai","context",..]=>Some((*project).to_string()),
            ["api", "projects", project, "folders" | "documents" | "handwritten-notes" | "attachments" | "versions"]
            | ["api", "projects", project, "assets", "images"]
            | ["api", "projects", project, "documents", _, "duplicate" | "image-reference"]
            | ["api", "projects", project, "nodes", _, "rename" | "move"]
            | ["api", "projects", project, "nodes", _]
            | ["api", "projects", project, "nodes", "batch", "plan"]
            | ["api", "projects", project, "nodes", "batch", _, "execute"]
            | ["api", "projects", project, "trash", _, "restore"]
            | ["api", "projects", project, "sync", "pull" | "push" | "scan" | "auto-run"]
            | ["api", "projects", project, "history", "enable"]
            | ["api", "projects", project, "github", "connect" | "publish" | "verify-connection"]
            | ["api", "projects", project, "external-changes", "import"] => {
                Some((*project).to_string())
            }
            ["api", "documents" | "handwritten-notes", id, tail @ ..]
                if id.contains("::") && tail.first() != Some(&"export") =>
            {
                Some(document_ref(id)?.0)
            }
            ["api", "recovery", "drafts", _, "copy"] => {
                body["projectId"].as_str().map(str::to_owned)
            }
            _ => None,
        };
        owner
            .map(|project| self.project_write(&project))
            .transpose()
    }
}
#[cfg(test)]
mod tests;
