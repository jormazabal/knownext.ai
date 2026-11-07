//! Content-free continuity hints, never executable work or authority to replay.
use super::*;
use knownext_core::operations::{OperationJournal, Operations, Snapshot};
use std::{fs, io::Read, sync::Arc};
const LIMIT: u64 = 512 * 1024;
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Journal {
    schema_version: u8,
    operations: Vec<Snapshot>,
}
struct Store(PathBuf);
impl Store {
    fn check(&self) -> Result<(), String> {
        let root = self.0.parent().ok_or("operation-journal-unavailable")?;
        let m = fs::symlink_metadata(root).map_err(|_| "operation-journal-unavailable")?;
        if !m.is_dir() || batch::linked(&m) {
            return Err("operation-journal-unavailable".into());
        }
        if let Ok(m) = fs::symlink_metadata(&self.0) {
            if !m.is_file() || batch::linked(&m) || m.len() > LIMIT {
                return Err("operation-journal-unavailable".into());
            }
        }
        Ok(())
    }
    fn validate(entries: &[Snapshot]) -> Result<(), String> {
        let mut ids = BTreeSet::new();
        if entries.len() > 384 {
            return Err("operation-journal-limit".into());
        }
        for s in entries {
            if !s.id.starts_with("operation-")
                || s.id.len() < 20
                || s.id.len() > 80
                || !s.id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-')
                || !ids.insert(&s.id)
                || OffsetDateTime::parse(&s.queued_at, &Rfc3339).is_err()
                || s.started_at
                    .iter()
                    .chain(s.finished_at.iter())
                    .any(|date| OffsetDateTime::parse(date, &Rfc3339).is_err())
            {
                return Err("operation-journal-invalid".into());
            }
        }
        Ok(())
    }
}
impl OperationJournal for Store {
    fn load(&self) -> Result<Vec<Snapshot>, String> {
        self.check()?;
        let file = match fs::File::open(&self.0) {
            Ok(f) => f,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(vec![]),
            Err(_) => return Err("operation-journal-unavailable".into()),
        };
        let mut raw = vec![];
        file.take(LIMIT + 1)
            .read_to_end(&mut raw)
            .map_err(|_| "operation-journal-unavailable")?;
        if raw.len() as u64 > LIMIT {
            return Err("operation-journal-limit".into());
        }
        let j: Journal = serde_json::from_slice(&raw).map_err(|_| "operation-journal-invalid")?;
        if j.schema_version != 1 {
            return Err("operation-journal-future".into());
        }
        Self::validate(&j.operations)?;
        Ok(j.operations)
    }
    fn save(&self, entries: &[Snapshot]) -> Result<(), String> {
        self.check()?;
        Self::validate(entries)?;
        let raw = serde_json::to_vec(&Journal {
            schema_version: 1,
            operations: entries.to_vec(),
        })
        .map_err(|_| "operation-journal-unavailable")?;
        if raw.len() as u64 > LIMIT {
            return Err("operation-journal-limit".into());
        }
        atomic_io::write(&self.0, &raw).map_err(|_| "operation-journal-unavailable".into())
    }
}
impl LocalApi {
    pub fn runtime_operations(&self) -> Operations {
        Operations::recover(Arc::new(Store(
            self.app_data_dir.join("runtime-operations-v1.json"),
        )))
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    use knownext_core::operations::{Lane, Phase, Stage};
    #[test]
    fn runtime_block_journal_reopens_as_observation_not_work_and_never_overwrites_future() {
        let root = tempfile::tempdir().unwrap();
        let api = LocalApi::new(root.path().join("state"), "qa".into(), "test".into());
        let scheduler = api.runtime_operations();
        scheduler
            .submit_scoped("operation-aaaaaaaaaaaa", Lane::Background, 1, None, true)
            .unwrap();
        let running = scheduler
            .wait("operation-aaaaaaaaaaaa", Duration::from_secs(1))
            .unwrap();
        {
            let _bound = running.bind();
            knownext_core::operations::checkpoint(Stage::WaitingRemote).unwrap();
        }
        let restarted = api.runtime_operations();
        let s = restarted.snapshots().unwrap();
        assert_eq!(s[0].phase, Phase::Unknown);
        assert!(s[0].recovered);
        assert!(!s[0].cancellable);
        let path = api.app_data_dir.join("runtime-operations-v1.json");
        let raw = fs::read(&path).unwrap();
        assert!(!String::from_utf8_lossy(&raw).contains("state"));
        drop(running);
        let future = b"{\"schemaVersion\":99,\"operations\":[],\"private\":\"keep\"}";
        fs::write(&path, future).unwrap();
        let preserved = api.runtime_operations();
        assert!(!preserved.continuity_available());
        preserved
            .submit("operation-bbbbbbbbbbbb", Lane::Query, 1)
            .unwrap();
        assert_eq!(fs::read(&path).unwrap(), future);
    }
}
