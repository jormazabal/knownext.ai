//! Session-local timings of the Rust JSON dispatcher, never request identities or content.
//! The timer starts inside LocalApi::handle: it excludes the caller's queue, IPC,
//! rendering, application startup and services invoked directly (including backup ticks).
use serde_json::{json, Value};
use std::{collections::VecDeque, sync::Mutex, time::Duration};

const SAMPLE_LIMIT: usize = 128;
const CLASSES: [&str; 11] = [
    "documents",
    "projects",
    "history",
    "search",
    "ai",
    "transfer",
    "recovery",
    "settings",
    "security",
    "runtime",
    "other",
];

#[derive(Clone, Copy)]
pub(crate) struct OperationClass(usize);
impl OperationClass {
    /// Positions are route structure, not substring searches of IDs or names.
    pub(crate) fn for_request(method: &str, raw_path: &str) -> Option<Self> {
        let path = raw_path.split('?').next().unwrap_or("").trim_matches('/');
        if method.eq_ignore_ascii_case("GET") {
            let mut diagnostic = path.split('/');
            let matches = |segment: Option<&str>, expected: &str| {
                segment.is_some_and(|value| {
                    value == expected
                        || value.contains('%') && knownext_core::percent_decode(value) == expected
                })
            };
            if matches(diagnostic.next(), "api")
                && matches(diagnostic.next(), "runtime")
                && matches(diagnostic.next(), "diagnostics")
                && diagnostic.next().is_none()
            {
                return None; // Observing the snapshot must not change that snapshot.
            }
        }
        let mut parts = path.split('/');
        let first = parts.next().unwrap_or("");
        if first == "health" {
            return Some(Self(9));
        }
        if first != "api" {
            return Some(Self(10));
        }
        let class = match parts.next().unwrap_or("") {
            "documents" | "handwritten-notes" => {
                let _identity = parts.next();
                match parts.next() {
                    Some("history" | "versions" | "history-groups") => 2,
                    Some("ai" | "ai-changes") => 4,
                    _ => 0,
                }
            }
            "projects" => {
                let _identity = parts.next();
                match parts.next() {
                    Some("search") => 3,
                    Some("history-points" | "history-restores" | "history-retention") => 2,
                    Some("ai" | "research-evidence" | "ai-changes") => 4,
                    Some("portable-workspace" | "scheduled-backups" | "export-batches") => 5,
                    Some("tree" | "documents" | "nodes" | "folders" | "assets") => 0,
                    _ => 1,
                }
            }
            "notes" => 0,
            "ai" | "transcription" => 4,
            "project-transfers" | "document-templates" | "project-templates" | "export-batches"
            | "export-profiles" => 5,
            "recovery" | "storage" | "drafts" => 6,
            "config" => 7,
            "security" | "credentials" | "auth" => 8,
            "runtime" => 9,
            _ => 10,
        };
        Some(Self(class))
    }
}

#[derive(Default)]
struct Bucket {
    count: u64,
    errors: u64,
    total_us: u64,
    max_us: u64,
    recent_us: VecDeque<u64>,
}
impl Bucket {
    fn record(&mut self, elapsed: Duration, failed: bool) {
        let micros = elapsed.as_micros().min(u64::MAX as u128) as u64;
        self.count = self.count.saturating_add(1);
        self.errors = self.errors.saturating_add(u64::from(failed));
        self.total_us = self.total_us.saturating_add(micros);
        self.max_us = self.max_us.max(micros);
        if self.recent_us.len() == SAMPLE_LIMIT {
            self.recent_us.pop_front();
        }
        self.recent_us.push_back(micros);
    }
    fn p95(&self) -> u64 {
        if self.recent_us.is_empty() {
            return 0;
        }
        let mut sorted = self.recent_us.iter().copied().collect::<Vec<_>>();
        sorted.sort_unstable();
        sorted[(sorted.len() * 95 + 99) / 100 - 1]
    }
}

#[derive(Default)]
pub(crate) struct RuntimePerformance {
    buckets: Mutex<[Bucket; 11]>,
}
impl RuntimePerformance {
    /// A short in-memory critical section after execution; no file or provider work.
    pub(crate) fn record(&self, class: OperationClass, elapsed: Duration, failed: bool) {
        let mut buckets = self
            .buckets
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        buckets[class.0].record(elapsed, failed);
    }
    pub(crate) fn snapshot(&self) -> Value {
        let buckets = self
            .buckets
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        let mut observed = 0_u64;
        let mut errors = 0_u64;
        let classes = buckets
            .iter()
            .enumerate()
            .filter(|(_, bucket)| bucket.count > 0)
            .map(|(index, bucket)| {
                observed = observed.saturating_add(bucket.count);
                errors = errors.saturating_add(bucket.errors);
                json!({"operationClass":CLASSES[index],"count":bucket.count,"errorCount":bucket.errors,
                    "totalDurationUs":bucket.total_us,"maxDurationUs":bucket.max_us,
                    "p95RecentDurationUs":bucket.p95(),"recentSamples":bucket.recent_us.len()})
            })
            .collect::<Vec<_>>();
        json!({"schemaVersion":1,"available":true,"scope":"local-api-requests",
            "clock":"monotonic-wall-clock","persistent":false,"readOnly":true,
            "startsProvider":false,"includesStartup":false,"sampleLimitPerClass":SAMPLE_LIMIT,
            "maximumClasses":CLASSES.len(),"observedRequests":observed,"errorCount":errors,"classes":classes})
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn bounded_recent_percentile_keeps_lifetime_totals_and_counts_errors() {
        let metrics = RuntimePerformance::default();
        for micros in 1..=200 {
            metrics.record(
                OperationClass(0),
                Duration::from_micros(micros),
                micros % 10 == 0,
            );
        }
        let value = metrics.snapshot();
        assert_eq!(value["observedRequests"], 200);
        assert_eq!(value["errorCount"], 20);
        assert_eq!(value["classes"][0]["totalDurationUs"], 20100);
        assert_eq!(value["classes"][0]["maxDurationUs"], 200);
        assert_eq!(value["classes"][0]["p95RecentDurationUs"], 194);
        assert_eq!(value["classes"][0]["recentSamples"], 128);
        assert_eq!(value, metrics.snapshot());
    }
    #[test]
    fn classes_depend_on_route_positions_never_private_identifiers_or_query_values() {
        let classified = |path| OperationClass::for_request("GET", path).map(|c| CLASSES[c.0]);
        assert_eq!(
            classified("/api/projects/private-search-id/tree?query=private"),
            Some("documents")
        );
        assert_eq!(
            classified("/api/projects/private/search/content"),
            Some("search")
        );
        assert_eq!(
            classified("/api/documents/private-ai-id/history"),
            Some("history")
        );
        assert_eq!(classified("/api/runtime/diagnostics?private=canary"), None);
        assert_eq!(classified("/api/runtime/%64iagnostics"), None);
        assert_eq!(classified("/private-not-a-route"), Some("other"));
        assert_eq!(classified("/api/config"), Some("settings"));
    }
}
