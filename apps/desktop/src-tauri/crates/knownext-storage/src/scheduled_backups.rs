//! Opt-in backups while this application is alive. A durable generation is claimed before every effect.
use super::*;
use std::{fs, io::Read, sync::Mutex};
const MAX_BYTES: u64 = 10 * 1024 * 1024 * 1024;
const RESERVATION: u64 = 2 * 1024 * 1024 * 1024;
const MAX_STATE: u64 = 2 * 1024 * 1024;
const MAX_HISTORY: usize = 64;
static BUSY: Mutex<()> = Mutex::new(());
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Policy {
    enabled: bool,
    interval_hours: u8,
    keep: u8,
    include_archive: bool,
    retention_allowed: bool,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Receipt {
    generation: u64,
    policy_generation: u64,
    source_root_hash: String,
    profile_hash: String,
    phase: String,
    owner_runtime: String,
    created_at: String,
    finished_at: Option<String>,
    archive_sha256: Option<String>,
    archive_bytes: u64,
    include_archive: bool,
    retention_eligible: bool,
    warnings: Vec<String>,
    restore_transfer_id: Option<String>,
    restore_status: String,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct State {
    schema_version: u8,
    project_id: String,
    source_root_hash: String,
    profile_hash: String,
    policy: Policy,
    policy_generation: u64,
    latest_generation: u64,
    next_due_at: Option<String>,
    receipts: Vec<Receipt>,
}
struct Context {
    project: String,
    source: Option<PathBuf>,
    directory: PathBuf,
    source_hash: String,
    profile_hash: String,
    recursive: bool,
}
fn sha(s: &str) -> bool {
    s.len() == 64
        && s.bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}
fn regular(path: &Path, optional: bool) -> Result<bool, String> {
    match fs::symlink_metadata(path) {
        Ok(m) if m.is_dir() && !batch::linked(&m) => Ok(true),
        Err(e) if optional && e.kind() == std::io::ErrorKind::NotFound => Ok(false),
        _ => Err("La carpeta de copias no es regular; no se siguen enlaces".into()),
    }
}
fn path_key(path: &Path) -> String {
    let mut parts = vec![];
    for c in path.components() {
        match c {
            std::path::Component::CurDir => (),
            std::path::Component::ParentDir => {
                parts.pop();
            }
            other => parts.push(other.as_os_str().to_string_lossy().into_owned()),
        }
    }
    let key = parts
        .join("/")
        .replace('\\', "/")
        .trim_end_matches('/')
        .to_owned();
    let key = if let Some(rest) = key.strip_prefix("//?/UNC/") {
        format!("//{rest}")
    } else {
        key.strip_prefix("//?/").unwrap_or(&key).to_owned()
    };
    if cfg!(windows) {
        key.to_lowercase()
    } else {
        key
    }
}
fn overlap(a: &Path, b: &Path) -> bool {
    let a = path_key(a);
    let b = path_key(b);
    a == b || a.starts_with(&(b.clone() + "/")) || b.starts_with(&(a + "/"))
}
fn context(api: &LocalApi, p: &str) -> Result<Context, String> {
    let declared = api.registered_project_root(p).map_err(|r| {
        r.body["detail"]
            .as_str()
            .unwrap_or("Proyecto no registrado")
            .to_owned()
    })?;
    let profile = api
        .app_data_dir
        .canonicalize()
        .map_err(|_| "El perfil local no está disponible")?;
    regular(&api.app_data_dir, false)?;
    let base = profile.join("scheduled-backups");
    regular(&base, true)?;
    let directory = base.join(sha256_hex(p.as_bytes()));
    regular(&directory, true)?;
    let safe=!declared.components().any(|c|matches!(c,std::path::Component::Normal(n) if project_transfer::backup_snapshot_coordinate(n.to_string_lossy().as_ref())));
    let source = if safe
        && fs::symlink_metadata(&declared).is_ok_and(|m| m.is_dir() && !batch::linked(&m))
    {
        declared.canonicalize().ok()
    } else {
        None
    };
    let source_hash = sha256_hex(
        source
            .as_ref()
            .unwrap_or(&declared)
            .to_string_lossy()
            .as_bytes(),
    );
    let profile_hash =
        sha256_hex(format!("{}|{}", profile.to_string_lossy(), api.profile).as_bytes());
    let recursive = overlap(source.as_ref().unwrap_or(&declared), &directory);
    Ok(Context {
        project: p.into(),
        source,
        directory,
        source_hash,
        profile_hash,
        recursive,
    })
}
fn default_state(c: &Context) -> State {
    State {
        schema_version: 1,
        project_id: c.project.clone(),
        source_root_hash: c.source_hash.clone(),
        profile_hash: c.profile_hash.clone(),
        policy: Policy {
            enabled: false,
            interval_hours: 24,
            keep: 3,
            include_archive: false,
            retention_allowed: false,
        },
        policy_generation: 0,
        latest_generation: 0,
        next_due_at: None,
        receipts: vec![],
    }
}
fn load(c: &Context) -> Result<(State, String), String> {
    let path = c.directory.join("state.json");
    let m = match fs::symlink_metadata(&path) {
        Ok(m) => m,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            return Ok((default_state(c), sha256_hex(b"absent-scheduled-backups")))
        }
        Err(_) => return Err("No se puede leer el estado de copias; se conserva".into()),
    };
    if !m.is_file() || batch::linked(&m) || m.len() > MAX_STATE {
        return Err("El estado de copias no es regular o supera2MiB".into());
    }
    let mut raw = vec![];
    fs::File::open(path)
        .map_err(|_| "No se pudo abrir el estado de copias")?
        .take(MAX_STATE + 1)
        .read_to_end(&mut raw)
        .map_err(|_| "Lectura de copias incompleta")?;
    if raw.len() as u64 > MAX_STATE {
        return Err("Estado de copias fuera de límite".into());
    }
    let s: State = serde_json::from_slice(&raw)
        .map_err(|_| "Política de copias desconocida; no se activa ni reescribe")?;
    validate(c, &s)?;
    Ok((s, sha256_hex(&raw)))
}
fn validate(c: &Context, s: &State) -> Result<(), String> {
    if s.schema_version != 1
        || s.project_id != c.project
        || !sha(&s.source_root_hash)
        || !sha(&s.profile_hash)
        || s.policy.interval_hours != 24
        || !(1..=16).contains(&s.policy.keep)
        || s.receipts.len() > MAX_HISTORY
        || s.next_due_at
            .as_ref()
            .is_some_and(|d| OffsetDateTime::parse(d, &Rfc3339).is_err())
    {
        return Err(
            "Política de copias futura, ajena o incoherente; se conserva desactivada".into(),
        );
    }
    let mut seen = BTreeSet::new();
    for r in &s.receipts {
        if r.generation == 0
            || r.generation > s.latest_generation
            || !seen.insert(r.generation)
            || r.policy_generation > s.policy_generation
            || !sha(&r.source_root_hash)
            || !sha(&r.profile_hash)
            || r.archive_bytes > 512 * 1024 * 1024
            || r.archive_sha256.as_ref().is_some_and(|v| !sha(v))
            || !matches!(
                r.phase.as_str(),
                "preparing" | "verified" | "partial" | "failed" | "retired" | "retiring"
            )
            || r.restore_transfer_id.as_ref().is_some_and(|id| {
                !id.starts_with("transfer-backup-") || !request_scope::portable_id(id)
            })
            || !matches!(
                r.restore_status.as_str(),
                "none" | "starting" | "ready" | "uncertain"
            )
            || r.warnings.len() > 16
            || r.warnings.iter().any(|s| s.len() > 1200)
            || OffsetDateTime::parse(&r.created_at, &Rfc3339).is_err()
            || r.finished_at
                .as_ref()
                .is_some_and(|d| OffsetDateTime::parse(d, &Rfc3339).is_err())
            || matches!(r.phase.as_str(), "verified" | "partial")
                && (r.archive_sha256.is_none() || r.archive_bytes == 0 || r.finished_at.is_none())
            || r.phase == "partial" && r.retention_eligible
        {
            return Err(
                "Recibo de copia desconocido o incoherente; no concede repetición ni borrado"
                    .into(),
            );
        }
    }
    Ok(())
}
fn bound(c: &Context, s: &State) -> bool {
    c.source.is_some()
        && !c.recursive
        && s.source_root_hash == c.source_hash
        && s.profile_hash == c.profile_hash
}
fn revision(c: &Context, raw: &str) -> String {
    sha256_hex(
        format!(
            "{raw}|{}|{}|{}|{}",
            c.source_hash,
            c.profile_hash,
            c.source.is_some(),
            c.recursive
        )
        .as_bytes(),
    )
}
fn save(c: &Context, s: &State) -> Result<(), String> {
    validate(c, s)?;
    let parent = c.directory.parent().ok_or("Carpeta de copias no válida")?;
    for dir in [parent, &c.directory] {
        if !regular(dir, true)? {
            fs::create_dir(dir).map_err(|_| "No se pudo preparar la carpeta de copias")?;
        }
        regular(dir, false)?;
    }
    let raw = serde_json::to_vec_pretty(s).map_err(|_| "Estado de copias no representable")?;
    if raw.len() as u64 > MAX_STATE {
        return Err("El historial de copias supera2MiB; no se trunca".into());
    }
    let path = c.directory.join("state.json");
    match fs::symlink_metadata(&path) {
        Ok(m) if m.is_file() && !batch::linked(&m) => atomic_io::write(&path, &raw),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => atomic_io::create(&path, &raw),
        _ => return Err("El registro de copias cambió; se conserva".into()),
    }
    .map_err(|_| "No se confirmó el registro de la copia; consulta sin repetir".to_owned())
}
fn payload(c: &Context, generation: u64) -> PathBuf {
    c.directory.join(format!("backup-{generation}.zip"))
}
fn measure(c: &Context, s: &State) -> Result<(u64, usize, bool), String> {
    if !regular(&c.directory, true)? {
        return Ok((0, 0, true));
    }
    let known = s
        .receipts
        .iter()
        .filter(|r| r.archive_sha256.is_some())
        .map(|r| format!("backup-{}.zip", r.generation))
        .chain(std::iter::once("state.json".into()))
        .collect::<BTreeSet<_>>();
    let mut dirs = vec![c.directory.clone()];
    let (mut bytes, mut unknown, mut visited, mut complete) = (0u64, 0usize, 0usize, true);
    while let Some(dir) = dirs.pop() {
        let entries = match fs::read_dir(&dir) {
            Ok(v) => v,
            Err(_) => {
                unknown += 1;
                complete = false;
                continue;
            }
        };
        for entry in entries {
            visited += 1;
            if visited > 20000 {
                return Ok((bytes, unknown + 1, false));
            }
            let e = match entry {
                Ok(e) => e,
                Err(_) => {
                    unknown += 1;
                    complete = false;
                    continue;
                }
            };
            let name = e.file_name().to_string_lossy().into_owned();
            // Coordination names are never probed; unknown coverage is explicit and blocks new admission.
            if project_transfer::backup_snapshot_coordinate(&name) {
                unknown += 1;
                complete = false;
                continue;
            }
            let meta = match fs::symlink_metadata(e.path()) {
                Ok(m) => m,
                Err(_) => {
                    unknown += 1;
                    complete = false;
                    continue;
                }
            };
            if batch::linked(&meta) || !meta.is_dir() && !meta.is_file() {
                unknown += 1;
                complete = false;
                bytes = bytes.saturating_add(meta.len());
                continue;
            }
            if dir == c.directory && !known.contains(&name) {
                unknown += 1;
            }
            if meta.is_dir() {
                dirs.push(e.path())
            } else {
                bytes = bytes.saturating_add(meta.len());
            }
        }
    }
    Ok((bytes, unknown, complete))
}
fn public_receipt(api: &LocalApi, c: &Context, r: &Receipt) -> Value {
    let mut phase = r.phase.as_str();
    if phase == "preparing" && r.owner_runtime != api.runtime_id || phase == "retiring" {
        phase = "interrupted"
    }
    if matches!(phase, "verified" | "partial") {
        match fs::symlink_metadata(payload(c, r.generation)) {
            Ok(m) if m.is_file() && !batch::linked(&m) && m.len() == r.archive_bytes => (),
            _ => phase = "missing",
        }
    }
    let mut restore = r.restore_status.as_str();
    if let Some(id) = &r.restore_transfer_id {
        if project_transfer::scheduled_backup_import_status(api, id).is_ok_and(|job| {
            job["kind"] == "import"
                && matches!(
                    job["phase"].as_str(),
                    Some("ready" | "completed" | "pending_registration")
                )
                && job["archiveSha256"] == json!(r.archive_sha256)
        }) {
            restore = "ready"
        } else if restore != "none" {
            restore = "uncertain";
        }
    }
    json!({"schemaVersion":1,"projectId":c.project,"generation":r.generation,"policyGeneration":r.policy_generation,"sourceRootHash":r.source_root_hash,"profileHash":r.profile_hash,"phase":phase,"createdAt":r.created_at,"finishedAt":r.finished_at,"archiveSha256":r.archive_sha256,"archiveBytes":r.archive_bytes,"includeArchive":r.include_archive,"retentionEligible":r.retention_eligible,"warnings":r.warnings,"restoreTransferId":r.restore_transfer_id,"restoreStatus":restore,"canReplay":false,"checkedAt":knownext_core::now_iso()})
}
fn snapshot(api: &LocalApi, c: &Context, s: &State, raw: &str) -> Result<Value, String> {
    let (bytes, unknown, storage_complete) = measure(c, s)?;
    let matches = bound(c, s);
    let mut policy = serde_json::to_value(&s.policy).map_err(|_| "Política no compatible")?;
    if !matches {
        policy["enabled"] = json!(false)
    }
    let mut receipts = s
        .receipts
        .iter()
        .map(|r| public_receipt(api, c, r))
        .collect::<Vec<_>>();
    receipts.reverse();
    Ok(
        json!({"schemaVersion":1,"projectId":c.project,"revision":revision(c,raw),"sourceRootHash":c.source_hash,"profileHash":c.profile_hash,"sourceAvailable":c.source.is_some(),"bindingMatches":matches,"readOnly":true,"startsProvider":false,"policy":policy,"policyGeneration":s.policy_generation,"latestGeneration":s.latest_generation,"nextGeneration":s.latest_generation.checked_add(1).ok_or("Contador de copias agotado")?,"nextDueAt":if matches{s.next_due_at.clone()}else{None},"snapshots":receipts,"unknownEntries":unknown,"storageComplete":storage_complete,"storageBytes":bytes,"maxBytes":MAX_BYTES,"checkedAt":knownext_core::now_iso()}),
    )
}
fn now_at() -> OffsetDateTime {
    OffsetDateTime::now_utc()
}
fn stamp(now: OffsetDateTime) -> String {
    now.format(&Rfc3339)
        .unwrap_or_else(|_| knownext_core::now_iso())
}
fn verify_binding(api: &LocalApi, c: &Context, policy_generation: u64) -> Result<(), String> {
    let current = context(api, &c.project)?;
    let (s, _) = load(&current)?;
    if !bound(&current, &s)
        || current.source_hash != c.source_hash
        || current.profile_hash != c.profile_hash
        || s.policy_generation != policy_generation
    {
        return Err(
            "La ubicación o política cambió durante la copia; el intento se conserva sin repetir"
                .into(),
        );
    }
    Ok(())
}
fn compatible(c: &Context, s: &State, r: &Receipt) -> bool {
    r.phase == "verified"
        && r.retention_eligible
        && r.source_root_hash == c.source_hash
        && r.profile_hash == c.profile_hash
        && r.include_archive == s.policy.include_archive
}
fn verify_anchor(api: &LocalApi, c: &Context, s: &State, anchor: u64) -> Result<(), String> {
    verify_binding(api, c, s.policy_generation)?;
    let r = s
        .receipts
        .iter()
        .find(|r| r.generation == anchor && compatible(c, s, r))
        .ok_or("No hay una copia compatible que autorice la conservación diferida")?;
    let v = project_transfer::verify_scheduled_backup_archive(&payload(c, anchor))?;
    if v["archiveSha256"] != json!(r.archive_sha256) || v["archiveBytes"] != r.archive_bytes {
        return Err("La copia de respaldo cambió; no se retiran generaciones anteriores".into());
    }
    Ok(())
}
fn retain_with_anchor(
    api: &LocalApi,
    c: &Context,
    s: &mut State,
    anchor: u64,
) -> Result<(), String> {
    if !s.policy.retention_allowed {
        return Ok(());
    }
    verify_anchor(api, c, s, anchor)?;
    let mut eligible = s
        .receipts
        .iter()
        .filter(|r| {
            r.phase == "verified"
                && r.retention_eligible
                && r.source_root_hash == c.source_hash
                && r.profile_hash == c.profile_hash
                && r.include_archive == s.policy.include_archive
                && r.generation <= anchor
        })
        .map(|r| r.generation)
        .collect::<Vec<_>>();
    eligible.sort_unstable();
    let remove = eligible.len().saturating_sub(s.policy.keep as usize);
    for old in eligible.into_iter().take(remove) {
        if old == anchor {
            continue;
        }
        let index = s.receipts.iter().position(|r| r.generation == old).unwrap();
        let r = &s.receipts[index];
        let expected = r.archive_sha256.clone().unwrap();
        let verified = project_transfer::verify_scheduled_backup_archive(&payload(c, old));
        if !verified
            .is_ok_and(|v| v["archiveSha256"] == expected && v["archiveBytes"] == r.archive_bytes)
        {
            continue;
        }
        verify_binding(api, c, s.policy_generation)?;
        s.receipts[index].phase = "retiring".into();
        save(c, s)?;
        let rechecked = project_transfer::verify_scheduled_backup_archive(&payload(c, old))?;
        if rechecked["archiveSha256"] != expected
            || rechecked["archiveBytes"] != s.receipts[index].archive_bytes
        {
            return Err("La copia anterior cambió tras registrar su retirada; se conserva".into());
        }
        verify_anchor(api, c, s, anchor)?;
        let path = payload(c, old);
        let m = fs::symlink_metadata(&path)
            .map_err(|_| "La copia anterior cambió antes de retirarla")?;
        if !m.is_file() || batch::linked(&m) || m.permissions().readonly() {
            return Err(
                "La copia anterior cambió; la nueva permanece y la retirada no se confirma".into(),
            );
        }
        fs::remove_file(path)
            .map_err(|_| "No se confirmó retirar una copia; la nueva permanece")?;
        s.receipts[index].phase = "retired".into();
        save(c, s)?;
    }
    Ok(())
}
impl LocalApi {
    pub(crate) fn scheduled_backups(&self, p: &str) -> Result<Value, String> {
        let c = context(self, p)?;
        let (s, raw) = load(&c)?;
        snapshot(self, &c, &s, &raw)
    }
    pub(crate) fn update_scheduled_backup_policy(
        &self,
        p: &str,
        body: Value,
    ) -> Result<Value, String> {
        #[derive(Deserialize)]
        #[serde(rename_all = "camelCase", deny_unknown_fields)]
        struct Input {
            revision: String,
            enabled: bool,
            keep: u8,
            include_archive: bool,
            ack_retention: bool,
            #[serde(default)]
            ack_binding: bool,
        }
        let q: Input = serde_json::from_value(body).map_err(|_| "Política de copias no válida")?;
        let _busy = BUSY.try_lock().map_err(|_| {
            "Hay una copia en curso; espera su finalización antes de cambiar la política"
        })?;
        let c = context(self, p)?;
        let (mut s, raw) = load(&c)?;
        if q.revision != revision(&c, &raw) || !(1..=16).contains(&q.keep) {
            return Err(
                "La política cambió o el número de copias no es válido; vuelve a consultar".into(),
            );
        }
        if q.enabled && (c.source.is_none() || c.recursive) {
            return Err("La fuente no está disponible o se solapa con el almacén; no se activa la programación".into());
        }
        let was_bound = bound(&c, &s);
        if q.enabled && !was_bound && !q.ack_binding {
            return Err(
                "Confirma la ubicación actual para activar una política de otra raíz o perfil"
                    .into(),
            );
        }
        if !was_bound && q.ack_binding && c.source.is_some() && !c.recursive {
            s.source_root_hash = c.source_hash.clone();
            s.profile_hash = c.profile_hash.clone();
        }
        let was_enabled = s.policy.enabled;
        s.policy = Policy {
            enabled: q.enabled,
            interval_hours: 24,
            keep: q.keep,
            include_archive: q.include_archive,
            retention_allowed: q.ack_retention,
        };
        s.policy_generation = s
            .policy_generation
            .checked_add(1)
            .ok_or("Contador de política agotado")?;
        if !q.enabled {
            s.next_due_at = None;
        } else if !was_enabled || !was_bound || s.next_due_at.is_none() {
            s.next_due_at = Some(stamp(now_at() + TimeDuration::hours(24)));
        }
        let _admit = recovery_inventory::admit(self, 65536)?;
        if c.recursive {
            return Err(
                "El almacén de copias no puede estar dentro del proyecto ni contenerlo".into(),
            );
        }
        save(&c, &s)?;
        let (s, raw) = load(&c)?;
        let mut v = snapshot(self, &c, &s, &raw)?;
        v["readOnly"] = json!(false);
        Ok(v)
    }
    pub(crate) fn scheduled_backup_receipt(
        &self,
        p: &str,
        generation: u64,
    ) -> Result<Value, String> {
        let c = context(self, p)?;
        let (s, _) = load(&c)?;
        let r=s.receipts.iter().find(|r|r.generation==generation).ok_or("Generación fuera del historial conservado; no confirma resultado ni permite repetir su cursor")?;
        Ok(public_receipt(self, &c, r))
    }
    pub(crate) fn run_scheduled_backup(&self, p: &str, body: Value) -> Result<Value, String> {
        self.run_scheduled_backup_at(p, body, now_at(), false)
    }
    fn run_scheduled_backup_at(
        &self,
        p: &str,
        body: Value,
        now: OffsetDateTime,
        automatic: bool,
    ) -> Result<Value, String> {
        #[derive(Deserialize)]
        #[serde(rename_all = "camelCase", deny_unknown_fields)]
        struct Input {
            revision: String,
            expected_generation: u64,
            acknowledge: bool,
        }
        let q: Input = serde_json::from_value(body).map_err(|_| "Solicitud de copia no válida")?;
        let _busy = BUSY
            .try_lock()
            .map_err(|_| "Hay otra copia local en curso; no se repite")?;
        let _work = self.background_work.enter();
        let _private = self.private_work()?;
        let c = context(self, p)?;
        let (mut s, raw) = load(&c)?;
        if !q.acknowledge
            || q.revision != revision(&c, &raw)
            || q.expected_generation
                != s.latest_generation
                    .checked_add(1)
                    .ok_or("Contador agotado")?
        {
            return Err(
                "El cursor o revisión de copia ya no está vigente; consulta sin repetir".into(),
            );
        }
        if !bound(&c, &s) {
            return Err(
                "La fuente o el perfil cambió; confirma su ubicación antes de crear otra copia"
                    .into(),
            );
        }
        if automatic && !s.policy.enabled {
            return Err("Las copias programadas están desactivadas".into());
        }
        let _source = self.project_write(p)?;
        let (_, _, complete) = measure(&c, &s)?;
        if !complete {
            return Err("No se puede medir todo el almacén; se conservan las copias sin crear otra preparación".into());
        }
        if s.receipts.len() >= MAX_HISTORY
            && s.policy.retention_allowed
            && !s.receipts.iter().any(|r| {
                r.phase == "retired"
                    && fs::symlink_metadata(payload(&c, r.generation))
                        .is_err_and(|e| e.kind() == std::io::ErrorKind::NotFound)
            })
        {
            if let Some(anchor) = s
                .receipts
                .iter()
                .filter(|r| compatible(&c, &s, r))
                .map(|r| r.generation)
                .max()
            {
                retain_with_anchor(self, &c, &mut s, anchor)?;
            }
        }
        while s.receipts.len() >= MAX_HISTORY {
            let Some(index) = s.receipts.iter().position(|r| {
                r.phase == "retired"
                    && fs::symlink_metadata(payload(&c, r.generation))
                        .is_err_and(|e| e.kind() == std::io::ErrorKind::NotFound)
            }) else {
                return Err("Se conservan64generaciones; los intentos incompletos o payloads no se eliminan automáticamente".into());
            };
            s.receipts.remove(index);
        }
        let (bytes, _, complete) = measure(&c, &s)?;
        if !complete {
            return Err("No se puede medir todo el almacén después de la conservación; no se inicia otra copia".into());
        }
        if bytes.saturating_add(RESERVATION) > MAX_BYTES {
            return Err(
                "No hay margen conservador para otra preparación; las copias existentes permanecen"
                    .into(),
            );
        }
        let _admission = recovery_inventory::admit(self, RESERVATION)?;
        let generation = q.expected_generation;
        s.latest_generation = generation;
        s.next_due_at = if s.policy.enabled {
            Some(stamp(now + TimeDuration::hours(24)))
        } else {
            None
        };
        s.receipts.push(Receipt {
            generation,
            policy_generation: s.policy_generation,
            source_root_hash: c.source_hash.clone(),
            profile_hash: c.profile_hash.clone(),
            phase: "preparing".into(),
            owner_runtime: self.runtime_id.clone(),
            created_at: stamp(now),
            finished_at: None,
            archive_sha256: None,
            archive_bytes: 0,
            include_archive: s.policy.include_archive,
            retention_eligible: false,
            warnings: vec![],
            restore_transfer_id: None,
            restore_status: "none".into(),
        });
        save(&c, &s)?;
        let policy_generation = s.policy_generation;
        let outcome = (|| {
            let stage = tempfile::Builder::new()
                .prefix(&format!("stage-{generation}-"))
                .tempdir_in(&c.directory)
                .map_err(|_| "No se pudo preparar espacio para la copia")?;
            let output = stage.path().join("backup.zip");
            let check = || verify_binding(self, &c, policy_generation);
            let summary = project_transfer::create_scheduled_backup_archive(
                self,
                p,
                c.source.as_ref().ok_or("Fuente no disponible")?,
                stage.path(),
                &output,
                s.policy.include_archive,
                &check,
            )?;
            let hash = summary["archiveSha256"]
                .as_str()
                .ok_or("Falta la huella de copia")?;
            project_transfer::publish_scheduled_backup_archive(
                &output,
                &payload(&c, generation),
                hash,
                &check,
            )?;
            check()?;
            Ok::<Value, String>(summary)
        })();
        let (mut s, _) = load(&c)?;
        let r = s
            .receipts
            .iter_mut()
            .find(|r| r.generation == generation)
            .ok_or("El intento perdió su registro; no se repite")?;
        r.finished_at = Some(stamp(now_at()));
        match outcome {
            Ok(summary) => {
                r.archive_sha256 = summary["archiveSha256"].as_str().map(str::to_owned);
                r.archive_bytes = summary["archiveBytes"].as_u64().unwrap_or(0);
                r.retention_eligible = summary["retentionEligible"] == true;
                r.phase = if r.retention_eligible {
                    "verified"
                } else {
                    "partial"
                }
                .into();
                r.warnings = summary["warnings"]
                    .as_array()
                    .into_iter()
                    .flatten()
                    .filter_map(Value::as_str)
                    .take(16)
                    .map(str::to_owned)
                    .collect();
            }
            Err(error) => {
                r.phase = "failed".into();
                let mut warning = String::new();
                for c in error.chars() {
                    if warning.len() + c.len_utf8() > 1100 {
                        break;
                    }
                    warning.push(c);
                }
                r.warnings = vec![warning];
            }
        }
        save(&c, &s)?;
        // Retention is a separate, journalled effect after the NEW eligible copy is durable.
        if s.receipts
            .iter()
            .any(|r| r.generation == generation && r.phase == "verified" && r.retention_eligible)
            && s.policy.retention_allowed
            && verify_binding(self, &c, policy_generation).is_ok()
        {
            retain_with_anchor(self, &c, &mut s, generation)?;
        }
        let (s, raw) = load(&c)?;
        let mut v = snapshot(self, &c, &s, &raw)?;
        v["readOnly"] = json!(false);
        v["receipt"] = public_receipt(
            self,
            &c,
            s.receipts
                .iter()
                .find(|r| r.generation == generation)
                .unwrap(),
        );
        Ok(v)
    }
    pub fn run_due_scheduled_backups(&self) -> Result<Value, String> {
        self.run_due_scheduled_backups_at(now_at())
    }
    pub fn run_due_scheduled_backups_at(&self, now: OffsetDateTime) -> Result<Value, String> {
        let registry = self.registry_checked()?;
        let projects = registry["projects"]
            .as_array()
            .ok_or("Registro no compatible")?;
        let mut warnings = vec![];
        let count = projects.len();
        let start = if count == 0 {
            0
        } else {
            self.scheduled_backup_cursor
                .load(std::sync::atomic::Ordering::Relaxed)
                % count
        };
        // Bound each pulse without permanently excluding projects after the first200.
        for offset in 0..count.min(200) {
            let index = (start + offset) % count;
            self.scheduled_backup_cursor
                .store((index + 1) % count, std::sync::atomic::Ordering::Relaxed);
            let row = &projects[index];
            let Some(p) = row["id"].as_str() else {
                continue;
            };
            let c = match context(self, p) {
                Ok(c) => c,
                Err(_) => continue,
            };
            let (s, raw) = match load(&c) {
                Ok(v) => v,
                Err(_) => continue,
            };
            if !s.policy.enabled || !bound(&c, &s) {
                continue;
            }
            let Some(due) = s
                .next_due_at
                .as_ref()
                .and_then(|d| OffsetDateTime::parse(d, &Rfc3339).ok())
            else {
                continue;
            };
            if due > now {
                continue;
            }
            let Some(next) = s.latest_generation.checked_add(1) else {
                if warnings.len() < 16 {
                    warnings.push(format!("{p}: contador agotado"));
                }
                continue;
            };
            let request =
                json!({"revision":revision(&c,&raw),"expectedGeneration":next,"acknowledge":true});
            let value = match self.run_scheduled_backup_at(p, request, now, true) {
                Ok(value) => value,
                Err(error) => {
                    if warnings.len() < 16 {
                        warnings.push(format!("{p}: {error}"));
                    }
                    continue;
                }
            };
            return Ok(
                json!({"didRun":true,"projectId":p,"generation":value["receipt"]["generation"],"phase":value["receipt"]["phase"]}),
            );
        }
        Ok(json!({"didRun":false,"warnings":warnings}))
    }
    pub(crate) fn restore_scheduled_backup(
        &self,
        p: &str,
        generation: u64,
        body: Value,
    ) -> Result<Value, String> {
        #[derive(Deserialize)]
        #[serde(rename_all = "camelCase", deny_unknown_fields)]
        struct Input {
            revision: String,
            archive_sha256: String,
            acknowledge: bool,
            #[serde(default)]
            ack_partial: bool,
            #[serde(default)]
            ack_binding: bool,
        }
        let q: Input =
            serde_json::from_value(body).map_err(|_| "Restauración de copia no válida")?;
        let _busy = BUSY
            .try_lock()
            .map_err(|_| "Hay otro trabajo de copias en curso")?;
        let _work = self.background_work.enter();
        let _private = self.private_work()?;
        let c = context(self, p)?;
        let (mut s, raw) = load(&c)?;
        if !q.acknowledge || q.revision != revision(&c, &raw) {
            return Err("La revisión de la copia cambió; consulta antes de restaurar".into());
        }
        let index = s
            .receipts
            .iter()
            .position(|r| r.generation == generation)
            .ok_or("Copia no conservada")?;
        let r = &s.receipts[index];
        if !matches!(r.phase.as_str(), "verified" | "partial")
            || r.archive_sha256.as_deref() != Some(q.archive_sha256.as_str())
            || r.restore_transfer_id.is_some()
        {
            return Err(
                "La copia no permite una nueva restauración; consulta el intento existente".into(),
            );
        }
        if r.phase == "partial" && !q.ack_partial {
            return Err("Confirma las omisiones de esta copia parcial antes de restaurar".into());
        }
        if (!bound(&c, &s)
            || r.source_root_hash != c.source_hash
            || r.profile_hash != c.profile_hash)
            && !q.ack_binding
        {
            return Err("Confirma restaurar esta copia histórica de otra ubicación o perfil como proyecto NUEVO".into());
        }
        let verified = project_transfer::verify_scheduled_backup_archive(&payload(&c, generation))?;
        if verified["archiveSha256"] != q.archive_sha256
            || verified["archiveBytes"] != r.archive_bytes
        {
            return Err("La copia cambió desde su revisión; no se importa".into());
        }
        let transfer_id = format!(
            "transfer-backup-{}",
            &sha256_hex(
                format!("{}|{p}|{generation}|{}", c.profile_hash, q.archive_sha256).as_bytes()
            )[..32]
        );
        s.receipts[index].restore_transfer_id = Some(transfer_id.clone());
        s.receipts[index].restore_status = "starting".into();
        let result = project_transfer::create_scheduled_backup_import(
            self,
            &transfer_id,
            &payload(&c, generation),
            &|| save(&c, &s),
        );
        let (mut s, _) = load(&c)?;
        let index = s
            .receipts
            .iter()
            .position(|r| r.generation == generation)
            .ok_or("La restauración perdió el acuse; consulta la transferencia")?;
        match result {
            Ok(job) => {
                if job["phase"] != "ready" || job["archiveSha256"] != q.archive_sha256 {
                    return Err(
                        "La importación necesita revisión; no se repite la preparación".into(),
                    );
                }
                s.receipts[index].restore_status = "ready".into();
                save(&c, &s)?;
                Ok(
                    json!({"schemaVersion":1,"projectId":p,"generation":generation,"transferId":transfer_id,"transfer":job,"receipt":public_receipt(self,&c,&s.receipts[index]),"readOnly":false,"startsProvider":false}),
                )
            }
            Err(error) => {
                if s.receipts[index].restore_transfer_id.is_none() {
                    return Err(error);
                }
                s.receipts[index].restore_status = "uncertain".into();
                save(&c, &s)?;
                Err(format!(
                    "La restauración necesita consulta; no se repite. {error}"
                ))
            }
        }
    }
}
