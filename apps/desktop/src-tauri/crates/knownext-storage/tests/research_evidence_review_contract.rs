//! Local evidence graph and human overlay. Synthetic captures, no provider or web calls.
use knownext_storage::LocalApi;
use serde_json::{json, Value};
use std::{fs, path::PathBuf};
fn call(a: &LocalApi, m: &str, p: &str, b: Value) -> Value {
    let r = a.handle(m, p, b, vec![]).unwrap();
    assert_eq!(r.status, 200, "{}", r.body);
    r.body
}
fn reject(a: &LocalApi, m: &str, p: &str, b: Value) {
    match a.handle(m, p, b, vec![]) {
        Err(_) => (),
        Ok(v) => assert!(v.status >= 400, "{}", v.body),
    }
}
fn fixture() -> (tempfile::TempDir, LocalApi, String, PathBuf, Value) {
    let d = tempfile::tempdir().unwrap();
    let state = d.path().join("state");
    let a = LocalApi::new(state.clone(), "qa".into(), "research-review".into());
    let p = call(
        &a,
        "POST",
        "/api/projects",
        json!({"name":"Review","versioningMode":"none","syncMode":"none"}),
    );
    let id = p["id"].as_str().unwrap().to_owned();
    let mut local = PathBuf::from(p["folderPath"].as_str().unwrap());
    local.push("source.md");
    fs::write(&local, "# Captured source\nExact excerpt").unwrap();
    let job = json!({"id":"research-owned","projectId":id,"status":"ready_pass","createdAt":"2026-11-06T09:00:00Z","sources":[{"id":"source-owned","title":"Captured","kind":"web","url":"https://example.test/source","status":"read","snapshotExcerpt":"Captured beginning. Exact excerpt. Captured end.","consultedAt":"2026-11-05T12:00:00Z"},{"id":"source-local","title":"Local","kind":"project_document","path":"source.md","status":"read","snapshotExcerpt":"Local excerpt"}],"evidence":[{"id":"evidence-owned","sourceId":"source-owned","claim":"Claim","excerpt":"Exact excerpt"},{"id":"evidence-local","sourceId":"source-local","claim":"Local claim","excerpt":"Local excerpt"}],"findings":[{"id":"finding-one","title":"One","summary":"Original first claim","evidenceIds":["evidence-owned"]},{"id":"finding-two","title":"Two","summary":"Original second claim","evidenceIds":["evidence-owned","evidence-local"]}],"sourceReads":[],"markdown":"# Original report\n\nOriginal prose must remain.","qualityReport":{"status":"pass","legacy":"retained"},"activity":[{"message":"Original activity"}]});
    fs::create_dir_all(state.join("ai-research")).unwrap();
    let path = state.join("ai-research").join(format!("{id}.json"));
    fs::write(
        &path,
        serde_json::to_vec(&json!({"jobs":[job.clone()]})).unwrap(),
    )
    .unwrap();
    (d, a, id, path, job)
}
fn route(p: &str) -> String {
    format!("/api/projects/{p}/research-evidence/research-owned")
}
fn prepare(a: &LocalApi, p: &str, selection: Value) -> Value {
    let v = call(a, "GET", &route(p), Value::Null);
    call(
        a,
        "POST",
        &(route(p) + "/prepare"),
        json!({"revision":v["revision"],"selection":selection}),
    )
}
fn apply(a: &LocalApi, p: &str, v: &Value, id: &str) -> Value {
    call(
        a,
        "POST",
        &(route(p) + "/apply"),
        json!({"revision":v["revision"],"reviewRevision":v["reviewRevision"],"selection":v["selection"],"attemptId":id,"acknowledge":true}),
    )
}
#[test]
fn block8_review_inspects_captured_excerpts_and_local_targets_without_sending() {
    let (_d, a, p, path, job) = fixture();
    let raw = fs::read(&path).unwrap();
    let v = call(&a, "GET", &route(&p), Value::Null);
    assert_eq!(v["startsProvider"], false);
    assert_eq!(v["readOnly"], true);
    assert_eq!(v["coverage"]["backedClaims"], 2);
    assert_eq!(v["evidence"][0]["excerptMatch"], "match");
    assert_eq!(
        v["sources"][1]["localTarget"]["id"],
        format!("{p}::source.md")
    );
    assert_eq!(
        v["sources"][0]["consultedAt"],
        job["sources"][0]["consultedAt"]
    );
    assert_eq!(fs::read(&path).unwrap(), raw);
}
#[test]
fn block8_review_per_claim_exclusion_comments_history_and_pause_preserve_originals() {
    let (d, a, p, path, job) = fixture();
    let mut policy = json!({"schemaVersion":1,"projects":{}});
    policy["projects"][&p] = json!(false);
    fs::write(
        d.path().join("state/ai-privacy-policy.json"),
        serde_json::to_vec(&policy).unwrap(),
    )
    .unwrap();
    let selection = json!({"selectedClaimIds":["claim-1"],"excludedSourceIds":["source-1"],"comment":" Revisión humana ñ "});
    let prepared = prepare(&a, &p, selection.clone());
    assert_eq!(prepared["claims"][0]["state"], "excluded");
    assert_eq!(prepared["claims"][1]["state"], "backed");
    let applied = apply(&a, &p, &prepared, "research-review-one");
    assert_eq!(applied["readOnly"], false);
    assert_eq!(
        applied["receipt"]["selectionRevision"],
        prepared["reviewRevision"]
    );
    assert_eq!(applied["claims"][0]["comment"], selection["comment"]);
    let original: Value = serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
    let mut saved = original["jobs"][0].clone();
    saved.as_object_mut().unwrap().remove("evidenceReview");
    assert_eq!(saved, job);
    let bytes = fs::read(&path).unwrap();
    let observed = call(&a, "GET", &route(&p), Value::Null);
    assert_eq!(observed["receipt"], applied["receipt"]);
    assert_eq!(fs::read(&path).unwrap(), bytes);
    reject(
        &a,
        "POST",
        &(route(&p) + "/apply"),
        json!({"revision":prepared["revision"],"reviewRevision":prepared["reviewRevision"],"selection":selection,"attemptId":"research-review-one","acknowledge":true}),
    );
    assert_eq!(fs::read(&path).unwrap(), bytes);
    let second = prepare(
        &a,
        &p,
        json!({"selectedClaimIds":["claim-2"],"excludedSourceIds":["source-2"],"comment":"Second"}),
    );
    let second = apply(&a, &p, &second, "research-review-two");
    assert_eq!(second["claims"][0]["state"], "excluded");
    assert_eq!(second["claims"][0]["comment"], " Revisión humana ñ ");
    assert_eq!(second["claims"][1]["supportCount"], 1);
    assert_eq!(second["receipts"].as_array().unwrap().len(), 2);
}
#[test]
fn block8_review_unknown_provider_ids_duplicates_and_unmatched_quotes_are_gaps_not_silenced() {
    let (_d, a, p, path, mut job) = fixture();
    job["evidence"].as_array_mut().unwrap().extend([
        json!({"id":"bad-quote","sourceId":"source-owned","excerpt":"Invented quote"}),
        json!({"id":"unknown-source","sourceId":"not-in-sources","excerpt":"Exact excerpt"}),
    ]);
    job["findings"] = json!([{"id":"finding-valid","summary":"Retained","evidenceIds":["evidence-owned","evidence-owned"]},{"id":"finding-unknown","summary":"Unknown evidence retained","evidenceIds":["unknown-evidence"]},{"id":"finding-no-evidence","summary":"No evidence retained","evidenceIds":[]},{"id":"finding-quote","summary":"Invented quote retained","evidenceIds":["bad-quote"]},{"id":"finding-source","summary":"Unknown source retained","evidenceIds":["unknown-source"]}]);
    fs::write(&path, serde_json::to_vec(&json!({"jobs":[job]})).unwrap()).unwrap();
    let v = call(&a, "GET", &route(&p), Value::Null);
    assert_eq!(v["claims"].as_array().unwrap().len(), 5);
    assert_eq!(v["claims"][0]["supportCount"], 1);
    assert_eq!(v["claims"][0]["evidenceIds"].as_array().unwrap().len(), 1);
    assert_eq!(v["coverage"]["backedClaims"], 1);
    assert_eq!(v["claims"][1]["unknownEvidenceIds"][0], "unknown-evidence");
    assert_eq!(v["claims"][2]["state"], "unbacked");
    assert_eq!(v["claims"][3]["state"], "unbacked");
    assert_eq!(v["evidence"][2]["excerptMatch"], "not-found");
    assert_eq!(v["evidence"][2]["usable"], false);
    assert_eq!(v["claims"][4]["unknownSourceIds"][0], "not-in-sources");
}
#[test]
fn block8_review_unknown_user_selection_stale_job_and_future_overlay_never_write() {
    let (_d, a, p, path, mut job) = fixture();
    let baseline = call(&a, "GET", &route(&p), Value::Null);
    for selected in [
        json!({"selectedClaimIds":["claim-900"],"excludedSourceIds":[],"comment":""}),
        json!({"selectedClaimIds":["claim-1"],"excludedSourceIds":["source-999"],"comment":""}),
    ] {
        let bytes = fs::read(&path).unwrap();
        reject(
            &a,
            "POST",
            &(route(&p) + "/prepare"),
            json!({"revision":baseline["revision"],"selection":selected}),
        );
        assert_eq!(fs::read(&path).unwrap(), bytes);
    }
    let prepared = prepare(
        &a,
        &p,
        json!({"selectedClaimIds":["claim-1"],"excludedSourceIds":[],"comment":"Old"}),
    );
    job["markdown"] = json!("# Report changed after review");
    fs::write(
        &path,
        serde_json::to_vec(&json!({"jobs":[job.clone()]})).unwrap(),
    )
    .unwrap();
    let bytes = fs::read(&path).unwrap();
    reject(
        &a,
        "POST",
        &(route(&p) + "/apply"),
        json!({"revision":prepared["revision"],"reviewRevision":prepared["reviewRevision"],"selection":prepared["selection"],"attemptId":"research-review-stale","acknowledge":true}),
    );
    assert_eq!(fs::read(&path).unwrap(), bytes);
    job["evidenceReview"] = json!({"schemaVersion":99,"future":"preserve"});
    fs::write(&path, serde_json::to_vec(&json!({"jobs":[job]})).unwrap()).unwrap();
    let bytes = fs::read(&path).unwrap();
    reject(&a, "GET", &route(&p), Value::Null);
    assert_eq!(fs::read(&path).unwrap(), bytes);
    let mut excessive: Value = serde_json::from_slice(&bytes).unwrap();
    excessive["jobs"][0]
        .as_object_mut()
        .unwrap()
        .remove("evidenceReview");
    excessive["jobs"][0]["findings"][0]["evidenceIds"] = json!((0..1001)
        .map(|n| format!("missing-{n}"))
        .collect::<Vec<_>>());
    fs::write(&path, serde_json::to_vec(&excessive).unwrap()).unwrap();
    let original = fs::read(&path).unwrap();
    reject(&a, "GET", &route(&p), Value::Null);
    assert_eq!(fs::read(&path).unwrap(), original);
}
#[test]
fn block8_review_capacity_retains_sixteen_receipts_and_does_not_recycle_ids() {
    let (_d, a, p, path, _job) = fixture();
    for n in 0..16 {
        let prepared = prepare(
            &a,
            &p,
            json!({"selectedClaimIds":["claim-1"],"excludedSourceIds":[],"comment":format!("Review {n}")}),
        );
        let done = apply(&a, &p, &prepared, &format!("research-review-{n}"));
        assert_eq!(done["receipts"].as_array().unwrap().len(), n + 1);
    }
    let prepared = prepare(
        &a,
        &p,
        json!({"selectedClaimIds":[],"excludedSourceIds":[],"comment":"No claim overwritten"}),
    );
    let bytes = fs::read(&path).unwrap();
    reject(
        &a,
        "POST",
        &(route(&p) + "/apply"),
        json!({"revision":prepared["revision"],"reviewRevision":prepared["reviewRevision"],"selection":prepared["selection"],"attemptId":"research-review-overflow","acknowledge":true}),
    );
    assert_eq!(fs::read(&path).unwrap(), bytes);
}
