//! Explicit console campaign, ignored during normal regression. Synthetic temporary corpus only.
//! Run in isolation with --ignored --exact --test-threads=1 --nocapture.
use knownext_storage::LocalApi;
use serde_json::{json, Value};
use std::{fs, path::PathBuf, time::Instant};

fn call(api: &LocalApi, method: &str, route: &str, body: Value) -> Value {
    let response = api.handle(method, route, body, vec![]).unwrap();
    assert_eq!(response.status, 200, "{}", response.body);
    response.body
}
fn duration_us(started: Instant) -> u64 {
    started.elapsed().as_micros().min(u64::MAX as u128) as u64
}
fn summarize(samples: &[u64]) -> Value {
    let mut sorted = samples.to_vec();
    sorted.sort_unstable();
    json!({"iterations":samples.len(),"totalUs":samples.iter().sum::<u64>(),
        "maxUs":sorted.last(),"p50Us":sorted[(sorted.len()+1)/2-1],"p95Us":sorted[(sorted.len()*95+99)/100-1]})
}

#[cfg(windows)]
fn process_memory() -> Value {
    #[repr(C)]
    struct Counters {
        size: u32,
        faults: u32,
        peak_working_set: usize,
        working_set: usize,
        quota_peak_paged: usize,
        quota_paged: usize,
        quota_peak_nonpaged: usize,
        quota_nonpaged: usize,
        pagefile: usize,
        peak_pagefile: usize,
    }
    #[link(name = "kernel32")]
    extern "system" {
        fn K32GetProcessMemoryInfo(
            process: *mut std::ffi::c_void,
            counters: *mut Counters,
            size: u32,
        ) -> i32;
    }
    let mut counters: Counters = unsafe { std::mem::zeroed() };
    counters.size = std::mem::size_of::<Counters>() as u32;
    let result = unsafe {
        K32GetProcessMemoryInfo(
            (-1_isize) as *mut std::ffi::c_void,
            &mut counters,
            std::mem::size_of::<Counters>() as u32,
        )
    };
    if result == 0 {
        return json!({"available":false,"scope":"test-process"});
    }
    json!({"available":true,"scope":"test-process","source":"windows-process-working-set",
        "residentBytes":counters.working_set,"peakResidentBytes":counters.peak_working_set})
}
#[cfg(any(target_os = "linux", target_os = "android"))]
fn process_memory() -> Value {
    let text = fs::read_to_string("/proc/self/status").unwrap_or_default();
    let bytes = |key: &str| {
        text.lines()
            .find_map(|line| line.strip_prefix(key))
            .and_then(|value| value.split_whitespace().next())
            .and_then(|value| value.parse::<u64>().ok())
            .map(|kb| kb * 1024)
    };
    json!({"available":bytes("VmRSS:").is_some(),"scope":"test-process","source":"proc-self-status",
        "residentBytes":bytes("VmRSS:"),"peakResidentBytes":bytes("VmHWM:")})
}
#[cfg(not(any(windows, target_os = "linux", target_os = "android")))]
fn process_memory() -> Value {
    json!({"available":false,"scope":"test-process"})
}

#[test]
#[ignore = "Explicit isolated synthetic Rust performance campaign; no UI/startup measurement"]
fn runtime_performance_synthetic_corpus_campaign() {
    let owned = tempfile::tempdir().unwrap();
    let api = LocalApi::new(
        owned.path().join("state"),
        "qa".into(),
        "isolated-benchmark".into(),
    );
    let project = call(
        &api,
        "POST",
        "/api/projects",
        json!({"name":"Synthetic benchmark","versioningMode":"none","syncMode":"none"}),
    );
    let project_id = project["id"].as_str().unwrap();
    let root = PathBuf::from(project["folderPath"].as_str().unwrap());
    let memory_before = process_memory();
    let files = 500_usize;
    let text = format!(
        "# Synthetic document\n\nbenchmarkneedle locally generated content.\n{}",
        "Synthetic paragraph for deterministic filesystem measurement.\n".repeat(1050)
    );
    let mut corpus_bytes = 0_u64;
    for index in 0..files {
        let folder = root.join(format!("group-{:02}", index / 25));
        if index % 25 == 0 {
            fs::create_dir(&folder).unwrap();
        }
        fs::write(folder.join(format!("Document-{index:04}.md")), &text).unwrap();
        corpus_bytes += text.len() as u64;
    }
    let mut latency = serde_json::Map::new();
    for (label, method, route, body, iterations) in [
        (
            "projectTree",
            "GET",
            format!("/api/projects/{project_id}/tree"),
            Value::Null,
            12,
        ),
        (
            "documentRead",
            "GET",
            format!("/api/documents/{project_id}::group-00%2FDocument-0000.md"),
            Value::Null,
            30,
        ),
        (
            "contentSearch",
            "POST",
            format!("/api/projects/{project_id}/search/content"),
            json!({"query":"benchmarkneedle"}),
            8,
        ),
    ] {
        let cold = Instant::now();
        let result = call(&api, method, &route, body.clone());
        let cold_us = duration_us(cold);
        if label == "projectTree" {
            assert!(result.as_array().unwrap().len() >= 20);
        }
        if label == "documentRead" {
            assert_eq!(result["markdown"].as_str().unwrap().len(), text.len());
        }
        if label == "contentSearch" {
            assert!(!result["results"].as_array().unwrap().is_empty());
        }
        let mut samples = Vec::with_capacity(iterations);
        for _ in 0..iterations {
            let started = Instant::now();
            call(&api, method, &route, body.clone());
            samples.push(duration_us(started));
        }
        latency.insert(
            label.into(),
            json!({"firstObservedUs":cold_us,"warm":summarize(&samples)}),
        );
    }
    let report = json!({"schemaVersion":1,"campaign":"synthetic-rust-dispatcher","generatedAt":knownext_core::now_iso(),
        "platform":std::env::consts::OS,"architecture":std::env::consts::ARCH,"buildProfile":if cfg!(debug_assertions){"debug"}else{"release"},
        "corpus":{"synthetic":true,"markdownFiles":files,"folders":20,"bytes":corpus_bytes},
        "measurements":{"latency":latency,"memoryBefore":memory_before,"memoryAfter":process_memory()},
        "performance":call(&api,"GET","/api/runtime/diagnostics",Value::Null)["performance"],
        "scope":{"localRustDispatcher":true,"nativeUi":false,"startup":false,"callerQueue":false,"ipc":false,"providerCalls":0,"hostProfile":false},
        "limitations":["First observed includes service cold work, not OS cache eviction.","Memory describes the whole isolated test process, not exclusive feature allocations.","No native UI, render, startup or Android device performance is measured.","No timing gate: this report is an observed baseline on the executing host."]});
    if let Some(path) = std::env::var_os("KNOWNEXT_PERFORMANCE_REPORT") {
        let path = PathBuf::from(path);
        assert!(
            path.is_absolute(),
            "Report path must be explicit and absolute"
        );
        // create_new prevents overwriting another campaign or user file.
        use std::io::Write;
        let mut output = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(path)
            .unwrap();
        output
            .write_all(&serde_json::to_vec_pretty(&report).unwrap())
            .unwrap();
        output.sync_all().unwrap();
    }
    println!("KNOWNEXT_PERFORMANCE_REPORT={report}");
}
