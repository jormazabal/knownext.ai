//! Bounded, content-free admission and observation. Cancellation only stops queued work.
use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
use std::sync::{Arc, Condvar, Mutex};
use std::time::{Duration, Instant};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Lane {
    Mutation,
    Query,
    Ai,
    Transfer,
    Index,
    Control,
    Background,
}
impl Lane {
    fn capacity(self) -> usize {
        match self {
            Self::Query => 4,
            Self::Background => 2,
            Self::Control => 8,
            _ => 1,
        }
    }
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Phase {
    Queued,
    Running,
    Succeeded,
    Failed,
    Cancelled,
    Expired,
    Unknown,
}
impl Phase {
    fn terminal(self) -> bool {
        !matches!(self, Self::Queued | Self::Running)
    }
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Stage {
    Preparing,
    WaitingRemote,
    Validating,
    Publishing,
    Observing,
}
#[derive(Clone, Debug)]
pub struct Resource {
    pub group: String,
    pub key: String,
    pub exclusive_group: bool,
}
pub trait OperationJournal: Send + Sync {
    fn load(&self) -> Result<Vec<Snapshot>, String>;
    fn save(&self, snapshots: &[Snapshot]) -> Result<(), String>;
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Snapshot {
    pub id: String,
    pub lane: Lane,
    pub phase: Phase,
    pub queued_at: String,
    pub started_at: Option<String>,
    pub finished_at: Option<String>,
    pub cancellable: bool,
    #[serde(default)]
    pub cancel_requested: bool,
    #[serde(default)]
    pub stage: Option<Stage>,
    #[serde(default)]
    pub recovered: bool,
}
struct Entry {
    snapshot: Snapshot,
    priority: u8,
    queued: Instant,
    order: u64,
    resource: Option<Resource>,
    cooperative: bool,
    publication_started: bool,
}
#[derive(Default)]
struct State {
    entries: VecDeque<Entry>,
    next: u64,
}
#[derive(Default)]
struct Inner {
    state: Mutex<State>,
    changed: Condvar,
    journal: Option<Arc<dyn OperationJournal>>,
    journal_healthy: std::sync::atomic::AtomicBool,
}
#[derive(Clone, Default)]
pub struct Operations {
    inner: Arc<Inner>,
}
pub struct Running {
    owner: Operations,
    id: String,
    finished: bool,
}

/// Detached work remains active until its thread exits, even after a UI cancellation.
#[derive(Clone, Default)]
pub struct BackgroundActivity(Arc<std::sync::atomic::AtomicUsize>);
pub struct BackgroundPermit(BackgroundActivity);
impl BackgroundActivity {
    pub fn enter(&self) -> BackgroundPermit {
        self.0.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
        BackgroundPermit(self.clone())
    }
    pub fn active(&self) -> bool {
        self.0.load(std::sync::atomic::Ordering::SeqCst) > 0
    }
}
impl Drop for BackgroundPermit {
    fn drop(&mut self) {
        self.0 .0.fetch_sub(1, std::sync::atomic::Ordering::SeqCst);
    }
}

impl Operations {
    pub fn recover(journal: Arc<dyn OperationJournal>) -> Self {
        let loaded = journal.load();
        let healthy = loaded.is_ok();
        let mut state = State::default();
        for mut snapshot in loaded
            .unwrap_or_default()
            .into_iter()
            .rev()
            .take(256)
            .collect::<Vec<_>>()
            .into_iter()
            .rev()
        {
            if state.entries.iter().any(|e| e.snapshot.id == snapshot.id) {
                continue;
            }
            if matches!(snapshot.phase, Phase::Queued | Phase::Running) {
                snapshot.phase = Phase::Unknown;
                snapshot.finished_at = Some(crate::now_iso());
            }
            snapshot.recovered = true;
            snapshot.cancellable = false;
            snapshot.cancel_requested = false;
            let order = state.next;
            state.next += 1;
            state.entries.push_back(Entry {
                snapshot,
                priority: 2,
                queued: Instant::now(),
                order,
                resource: None,
                cooperative: false,
                publication_started: true,
            });
        }
        Self {
            inner: Arc::new(Inner {
                state: Mutex::new(state),
                changed: Condvar::new(),
                journal: Some(journal),
                journal_healthy: std::sync::atomic::AtomicBool::new(healthy),
            }),
        }
    }
    pub fn continuity_available(&self) -> bool {
        self.inner.journal.is_some()
            && self
                .inner
                .journal_healthy
                .load(std::sync::atomic::Ordering::Relaxed)
    }
    fn persist(&self, state: &State) {
        if self.continuity_available() {
            let snapshots: Vec<_> = state.entries.iter().map(|e| e.snapshot.clone()).collect();
            if self
                .inner
                .journal
                .as_ref()
                .unwrap()
                .save(&snapshots)
                .is_err()
            {
                self.inner
                    .journal_healthy
                    .store(false, std::sync::atomic::Ordering::Relaxed);
            }
        }
    }
    pub fn submit(&self, id: &str, lane: Lane, priority: u8) -> Result<(), &'static str> {
        self.submit_scoped(id, lane, priority, None, false)
    }
    pub fn submit_scoped(
        &self,
        id: &str,
        lane: Lane,
        priority: u8,
        resource: Option<Resource>,
        cooperative: bool,
    ) -> Result<(), &'static str> {
        if !id.starts_with("operation-")
            || id.len() < 20
            || id.len() > 80
            || !id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-')
        {
            return Err("invalid-operation-id");
        }
        if resource.as_ref().is_some_and(|r| {
            [&r.group, &r.key].iter().any(|s| {
                s.is_empty()
                    || s.len() > 80
                    || !s.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-')
            })
        }) {
            return Err("invalid-operation-resource");
        }
        let mut state = self
            .inner
            .state
            .lock()
            .map_err(|_| "operation-registry-unavailable")?;
        if state.entries.iter().any(|e| e.snapshot.id == id) {
            return Err("operation-already-registered");
        }
        if state
            .entries
            .iter()
            .filter(|e| !e.snapshot.phase.terminal())
            .count()
            >= 128
        {
            return Err("operation-queue-full");
        }
        while state
            .entries
            .iter()
            .filter(|e| e.snapshot.phase.terminal())
            .count()
            >= 256
        {
            if let Some(index) = state
                .entries
                .iter()
                .position(|e| e.snapshot.phase.terminal())
            {
                state.entries.remove(index);
            }
        }
        let order = state.next;
        state.next += 1;
        state.entries.push_back(Entry {
            snapshot: Snapshot {
                id: id.into(),
                lane,
                phase: Phase::Queued,
                queued_at: crate::now_iso(),
                started_at: None,
                finished_at: None,
                cancellable: true,
                cancel_requested: false,
                stage: None,
                recovered: false,
            },
            priority: priority.min(2),
            queued: Instant::now(),
            order,
            resource,
            cooperative,
            publication_started: false,
        });
        self.persist(&state);
        self.inner.changed.notify_all();
        Ok(())
    }
    pub fn wait(&self, id: &str, maximum: Duration) -> Result<Running, &'static str> {
        let mut state = self
            .inner
            .state
            .lock()
            .map_err(|_| "operation-registry-unavailable")?;
        loop {
            let index = state
                .entries
                .iter()
                .position(|e| e.snapshot.id == id)
                .ok_or("operation-not-found")?;
            let current = &state.entries[index];
            if current.snapshot.phase != Phase::Queued {
                return Err(match current.snapshot.phase {
                    Phase::Cancelled => "operation-cancelled",
                    Phase::Expired => "operation-expired",
                    _ => "operation-already-started",
                });
            }
            let elapsed = current.queued.elapsed();
            if elapsed >= maximum {
                Self::terminal(&mut state.entries[index], Phase::Expired);
                self.persist(&state);
                self.inner.changed.notify_all();
                return Err("operation-expired");
            }
            let lane = current.snapshot.lane;
            let rank = |e: &Entry| {
                (
                    e.priority
                        .saturating_sub((e.queued.elapsed().as_secs() / 10).min(2) as u8),
                    e.order,
                )
            };
            let conflict = |a: &Entry, b: &Entry| match (&a.resource, &b.resource) {
                (Some(a), Some(b)) => {
                    a.group == b.group && (a.exclusive_group || b.exclusive_group || a.key == b.key)
                }
                _ => false,
            };
            let available = |candidate: &Entry| {
                !state.entries.iter().any(|other| {
                    conflict(candidate, other)
                        && (other.snapshot.phase == Phase::Running
                            || other.snapshot.phase == Phase::Queued
                                && other.snapshot.id != candidate.snapshot.id
                                && rank(other) < rank(candidate))
                })
            };
            let first = state
                .entries
                .iter()
                .filter(|e| {
                    e.snapshot.lane == lane && e.snapshot.phase == Phase::Queued && available(e)
                })
                .min_by_key(|e| rank(e))
                .map(|e| e.snapshot.id.as_str())
                == Some(id);
            let occupied = state
                .entries
                .iter()
                .filter(|e| e.snapshot.lane == lane && e.snapshot.phase == Phase::Running)
                .count();
            if first && occupied < lane.capacity() {
                let entry = &mut state.entries[index];
                entry.snapshot.phase = Phase::Running;
                entry.snapshot.started_at = Some(crate::now_iso());
                entry.snapshot.cancellable = entry.cooperative;
                entry.snapshot.stage = Some(Stage::Preparing);
                self.persist(&state);
                self.inner.changed.notify_all();
                return Ok(Running {
                    owner: self.clone(),
                    id: id.into(),
                    finished: false,
                });
            }
            let wait = (maximum - elapsed).min(Duration::from_millis(250));
            state = self
                .inner
                .changed
                .wait_timeout(state, wait)
                .map_err(|_| "operation-registry-unavailable")?
                .0;
        }
    }
    fn terminal(entry: &mut Entry, phase: Phase) {
        entry.snapshot.phase = phase;
        entry.snapshot.cancellable = false;
        entry.snapshot.finished_at = Some(crate::now_iso());
    }
    fn finish(&self, id: &str, phase: Phase) {
        if let Ok(mut state) = self.inner.state.lock() {
            if let Some(entry) = state
                .entries
                .iter_mut()
                .find(|e| e.snapshot.id == id && e.snapshot.phase == Phase::Running)
            {
                Self::terminal(entry, phase);
            }
            self.persist(&state);
            self.inner.changed.notify_all();
        }
    }
    pub fn cancel(&self, id: &str) -> Result<Option<Snapshot>, &'static str> {
        let mut state = self
            .inner
            .state
            .lock()
            .map_err(|_| "operation-registry-unavailable")?;
        let entry = state.entries.iter_mut().find(|e| e.snapshot.id == id);
        let snapshot = entry.map(|entry| {
            if entry.snapshot.phase == Phase::Queued {
                Self::terminal(entry, Phase::Cancelled);
            } else if entry.snapshot.phase == Phase::Running && entry.snapshot.cancellable {
                entry.snapshot.cancel_requested = true;
            }
            entry.snapshot.clone()
        });
        self.persist(&state);
        self.inner.changed.notify_all();
        Ok(snapshot)
    }
    fn checkpoint(&self, id: &str, stage: Stage) -> Result<(), &'static str> {
        let mut state = self
            .inner
            .state
            .lock()
            .map_err(|_| "operation-registry-unavailable")?;
        let entry = state
            .entries
            .iter_mut()
            .find(|e| e.snapshot.id == id)
            .ok_or("operation-not-found")?;
        if entry.snapshot.phase == Phase::Cancelled {
            return Err("operation-stopped-before-publication");
        }
        if entry.snapshot.phase != Phase::Running {
            return Err("operation-not-running");
        }
        if entry.snapshot.cancel_requested && !entry.publication_started {
            Self::terminal(entry, Phase::Cancelled);
            self.persist(&state);
            self.inner.changed.notify_all();
            return Err("operation-stopped-before-publication");
        }
        let changed = entry.snapshot.stage != Some(stage);
        if stage == Stage::Publishing {
            entry.publication_started = true;
        }
        entry.snapshot.stage = Some(stage);
        entry.snapshot.cancellable = entry.cooperative && !entry.publication_started;
        if changed {
            self.persist(&state);
        }
        Ok(())
    }
    pub fn snapshots(&self) -> Result<Vec<Snapshot>, &'static str> {
        Ok(self
            .inner
            .state
            .lock()
            .map_err(|_| "operation-registry-unavailable")?
            .entries
            .iter()
            .map(|e| e.snapshot.clone())
            .collect())
    }
}
thread_local! {static CURRENT:std::cell::RefCell<Option<(Operations,String)>>=const{std::cell::RefCell::new(None)};}
pub struct ContextGuard(Option<(Operations, String)>);
impl Drop for ContextGuard {
    fn drop(&mut self) {
        CURRENT.with(|slot| *slot.borrow_mut() = self.0.take());
    }
}
pub fn checkpoint(stage: Stage) -> Result<(), String> {
    CURRENT.with(|slot| {
        slot.borrow().as_ref().map_or(Ok(()), |(owner, id)| {
            owner.checkpoint(id, stage).map_err(str::to_owned)
        })
    })
}
impl Running {
    pub fn bind(&self) -> ContextGuard {
        ContextGuard(CURRENT.with(|slot| slot.replace(Some((self.owner.clone(), self.id.clone())))))
    }

    pub fn finish(mut self, succeeded: bool) {
        self.owner.finish(
            &self.id,
            if succeeded {
                Phase::Succeeded
            } else {
                Phase::Failed
            },
        );
        self.finished = true;
    }
}
impl Drop for Running {
    fn drop(&mut self) {
        if !self.finished {
            self.owner.finish(&self.id, Phase::Unknown);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    const A: &str = "operation-aaaaaaaaaaaa";
    const B: &str = "operation-bbbbbbbbbbbb";
    const C: &str = "operation-cccccccccccc";
    #[test]
    fn runtime_block_resource_waiter_does_not_block_unrelated_save() {
        let ops = Operations::default();
        let resource = |group: &str, exclusive| {
            Some(Resource {
                group: group.into(),
                key: "document".into(),
                exclusive_group: exclusive,
            })
        };
        ops.submit_scoped(A, Lane::Background, 1, resource("projectA", true), false)
            .unwrap();
        let first = ops.wait(A, Duration::from_secs(1)).unwrap();
        ops.submit_scoped(B, Lane::Mutation, 0, resource("projectA", false), false)
            .unwrap();
        ops.submit_scoped(C, Lane::Mutation, 1, resource("projectB", false), false)
            .unwrap();
        ops.wait(C, Duration::from_secs(1)).unwrap().finish(true);
        assert_eq!(ops.snapshots().unwrap()[1].phase, Phase::Queued);
        first.finish(true);
        ops.wait(B, Duration::from_secs(1)).unwrap().finish(true);
    }
    #[test]
    fn runtime_block_running_cancellation_is_confirmed_only_at_a_checkpoint() {
        let ops = Operations::default();
        ops.submit_scoped(A, Lane::Background, 1, None, true)
            .unwrap();
        let work = ops.wait(A, Duration::from_secs(1)).unwrap();
        let _bound = work.bind();
        checkpoint(Stage::WaitingRemote).unwrap();
        let asked = ops.cancel(A).unwrap().unwrap();
        assert_eq!(asked.phase, Phase::Running);
        assert!(asked.cancel_requested);
        assert_eq!(
            checkpoint(Stage::Validating),
            Err("operation-stopped-before-publication".into())
        );
        drop(work);
        assert_eq!(ops.snapshots().unwrap()[0].phase, Phase::Cancelled);
    }
    #[test]
    fn runtime_block_publication_closes_the_cancel_window_and_context_does_not_leak() {
        let ops = Operations::default();
        ops.submit_scoped(A, Lane::Index, 1, None, true).unwrap();
        let work = ops.wait(A, Duration::from_secs(1)).unwrap();
        {
            let _bound = work.bind();
            checkpoint(Stage::Publishing).unwrap();
            assert!(!ops.cancel(A).unwrap().unwrap().cancel_requested);
            checkpoint(Stage::Observing).unwrap();
        }
        work.finish(true);
        assert!(checkpoint(Stage::Validating).is_ok());
        assert_eq!(ops.snapshots().unwrap()[0].phase, Phase::Succeeded);
    }
    #[test]
    fn runtime_block_journal_failure_does_not_stop_current_work() {
        struct Broken;
        impl OperationJournal for Broken {
            fn load(&self) -> Result<Vec<Snapshot>, String> {
                Ok(vec![])
            }
            fn save(&self, _: &[Snapshot]) -> Result<(), String> {
                Err("owned injected failure".into())
            }
        }
        let ops = Operations::recover(Arc::new(Broken));
        assert!(ops.continuity_available());
        ops.submit(A, Lane::Mutation, 0).unwrap();
        assert!(!ops.continuity_available());
        ops.wait(A, Duration::from_secs(1)).unwrap().finish(true);
        assert_eq!(ops.snapshots().unwrap()[0].phase, Phase::Succeeded);
    }
    #[test]
    fn detached_work_stays_active_across_clones_until_all_permits_exit() {
        let work = BackgroundActivity::default();
        let clone = work.clone();
        let first = work.enter();
        let second = clone.enter();
        drop(first);
        assert!(clone.active());
        drop(second);
        assert!(!work.active());
    }
    #[test]
    fn queued_cancellation_never_claims_to_stop_running_work() {
        let scheduler = Operations::default();
        scheduler.submit(A, Lane::Mutation, 1).unwrap();
        let running = scheduler.wait(A, Duration::from_secs(1)).unwrap();
        scheduler.submit(B, Lane::Mutation, 1).unwrap();
        assert_eq!(scheduler.cancel(A).unwrap().unwrap().phase, Phase::Running);
        assert_eq!(
            scheduler.cancel(B).unwrap().unwrap().phase,
            Phase::Cancelled
        );
        assert_eq!(
            scheduler.wait(B, Duration::from_secs(1)).err(),
            Some("operation-cancelled")
        );
        running.finish(true);
        assert_eq!(scheduler.snapshots().unwrap()[0].phase, Phase::Succeeded);
        assert_eq!(
            scheduler.submit(A, Lane::Mutation, 0),
            Err("operation-already-registered")
        );
    }
    #[test]
    fn independent_lanes_expiry_and_unwinding_are_observable() {
        let scheduler = Operations::default();
        scheduler.submit(A, Lane::Transfer, 2).unwrap();
        let transfer = scheduler.wait(A, Duration::from_secs(1)).unwrap();
        scheduler.submit(B, Lane::Mutation, 0).unwrap();
        scheduler
            .wait(B, Duration::from_secs(1))
            .unwrap()
            .finish(true);
        scheduler.submit(C, Lane::Transfer, 0).unwrap();
        assert_eq!(
            scheduler.wait(C, Duration::ZERO).err(),
            Some("operation-expired")
        );
        drop(transfer);
        let snapshots = scheduler.snapshots().unwrap();
        assert_eq!(snapshots[0].phase, Phase::Unknown);
        assert_eq!(snapshots[2].phase, Phase::Expired);
        let json = serde_json::to_string(&snapshots).unwrap();
        assert!(!json.contains("path"));
        assert!(!json.contains("body"));
    }
    #[test]
    fn priority_orders_waiters_without_interrupting_the_current_writer() {
        let scheduler = std::sync::Arc::new(Operations::default());
        scheduler.submit(A, Lane::Mutation, 1).unwrap();
        let running = scheduler.wait(A, Duration::from_secs(2)).unwrap();
        scheduler.submit(B, Lane::Mutation, 2).unwrap();
        scheduler.submit(C, Lane::Mutation, 0).unwrap();
        let (send, receive) = std::sync::mpsc::channel();
        let mut workers = vec![];
        for id in [B, C] {
            let scheduler = scheduler.clone();
            let send = send.clone();
            workers.push(std::thread::spawn(move || {
                let work = scheduler.wait(id, Duration::from_secs(2)).unwrap();
                send.send(id).unwrap();
                work.finish(true);
            }));
        }
        running.finish(true);
        assert_eq!(receive.recv_timeout(Duration::from_secs(2)).unwrap(), C);
        assert_eq!(receive.recv_timeout(Duration::from_secs(2)).unwrap(), B);
        for worker in workers {
            worker.join().unwrap();
        }
    }
    #[test]
    fn bounded_admission_and_terminal_retention() {
        let scheduler = Operations::default();
        for index in 0..128 {
            scheduler
                .submit(&format!("operation-queued-{index:08}"), Lane::Mutation, 1)
                .unwrap();
        }
        assert_eq!(
            scheduler.submit(A, Lane::Mutation, 0),
            Err("operation-queue-full")
        );
        let terminal = Operations::default();
        for index in 0..300 {
            let id = format!("operation-finished-{index:08}");
            terminal.submit(&id, Lane::Query, 1).unwrap();
            terminal
                .wait(&id, Duration::from_secs(1))
                .unwrap()
                .finish(true);
        }
        assert_eq!(terminal.snapshots().unwrap().len(), 256);
    }
}
