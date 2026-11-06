//! Same digest as legacy batches, with explicit cooperative traversal budgets.
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::Read,
    path::Path,
    time::{Duration, Instant},
};
pub(super) const MAX_DEPTH: usize = 64;
pub(super) const MAX_TIME: Duration = Duration::from_secs(5);
#[derive(Clone, Copy)]
pub(super) struct Limits {
    pub entries: usize,
    pub bytes: u64,
    pub depth: usize,
    pub duration: Duration,
}
impl Default for Limits {
    fn default() -> Self {
        Self {
            entries: 20_000,
            bytes: 1024 * 1024 * 1024,
            depth: MAX_DEPTH,
            duration: MAX_TIME,
        }
    }
}
pub(super) struct Budget {
    entries: usize,
    bytes: u64,
    limits: Limits,
    started: Instant,
}
impl Budget {
    pub fn new(limits: Limits) -> Self {
        Self {
            entries: 0,
            bytes: 0,
            limits,
            started: Instant::now(),
        }
    }
    pub fn time(&self) -> Result<(), String> {
        if self.started.elapsed() > self.limits.duration {
            Err("La revisión agotó su presupuesto de tiempo. Reduce la selección; los originales se conservan".into())
        } else {
            Ok(())
        }
    }
    fn entry(&mut self, depth: usize) -> Result<(), String> {
        self.time()?;
        if depth > self.limits.depth {
            return Err("La selección supera la profundidad admitida de 64 niveles. Reduce su alcance; los originales se conservan".into());
        }
        if self.entries >= self.limits.entries {
            return Err("La selección supera el límite de entradas de la revisión. Divide la operación; los originales se conservan".into());
        }
        self.entries += 1;
        Ok(())
    }
    fn available(&self, length: u64) -> Result<(), String> {
        if length > self.limits.bytes.saturating_sub(self.bytes) {
            Err("La selección supera el límite de bytes de la revisión. Divide la operación; los originales se conservan".into())
        } else {
            Ok(())
        }
    }
    fn consume(&mut self, length: u64) -> Result<(), String> {
        self.time()?;
        self.available(length)?;
        self.bytes += length;
        Ok(())
    }
}
pub(crate) fn linked(metadata: &fs::Metadata) -> bool {
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        metadata.file_attributes() & 0x400 != 0
    }
    #[cfg(not(windows))]
    {
        metadata.file_type().is_symlink()
    }
}
pub(crate) fn fingerprint(path: &Path) -> Result<String, String> {
    fingerprint_with_budget(path, &mut Budget::new(Limits::default()))
}
pub(super) fn fingerprint_with_budget(path: &Path, budget: &mut Budget) -> Result<String, String> {
    fn visit(
        path: &Path,
        hash: &mut Sha256,
        budget: &mut Budget,
        depth: usize,
        buffer: &mut [u8],
    ) -> Result<(), String> {
        budget.time()?;
        let metadata = fs::symlink_metadata(path).map_err(|error| error.to_string())?;
        if linked(&metadata) {
            return Err(
                "La selección contiene un enlace; resuélvelo antes de operar en grupo".into(),
            );
        }
        if metadata.is_dir() {
            hash.update(b"directory\0");
            let mut entries = vec![];
            for entry in fs::read_dir(path).map_err(|error| error.to_string())? {
                budget.entry(depth + 1)?;
                entries.push(entry.map_err(|error| error.to_string())?);
            }
            entries.sort_by_key(|entry| entry.file_name());
            for entry in entries {
                let name = entry.file_name().to_string_lossy().as_bytes().to_vec();
                hash.update((name.len() as u64).to_le_bytes());
                hash.update(name);
                visit(&entry.path(), hash, budget, depth + 1, buffer)?;
            }
        } else if metadata.is_file() {
            budget.available(metadata.len())?;
            hash.update(b"file\0");
            hash.update(metadata.len().to_le_bytes());
            let mut file = fs::File::open(path).map_err(|error| error.to_string())?;
            loop {
                budget.time()?;
                let count = file.read(buffer).map_err(|error| error.to_string())?;
                if count == 0 {
                    break;
                }
                budget.consume(count as u64)?;
                hash.update(&buffer[..count]);
            }
        } else {
            return Err("Tipo de archivo no compatible con operaciones en grupo".into());
        }
        budget.time()
    }
    budget.entry(0)?;
    let mut hash = Sha256::new();
    let mut buffer = vec![0u8; 65536];
    visit(path, &mut hash, budget, 0, &mut buffer)?;
    Ok(format!("{:x}", hash.finalize()))
}
