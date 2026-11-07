use knownext_storage::LocalApi;
use serde_json::{json,Value};
use std::fs;
fn request(api:&LocalApi,method:&str,path:&str,body:Value)->Value{api.handle(method,path,body,vec![]).unwrap().body}
fn entry(project:&str,month:&str,model:&str,tokens:u64,eur:f64)->Value{json!({"projectId":project,"month":month,"model":model,"capability":"document_ai","costSchemaVersion":2,"totalTokens":tokens,"estimatedCostEur":eur,"estimatedCostUsd":eur*1.1,"usageSource":"provider"})}
#[test]
fn month_project_and_retired_project_queries_keep_the_ledger_exact_and_disclose_coverage(){
    assert!(LocalApi::is_independent_snapshot("GET","/api/ai/usage/summary?month=2026-11"));
    let owned=tempfile::tempdir().unwrap();let api=LocalApi::new(owned.path().join("state"),"qa".into(),"test".into());
    let a=request(&api,"POST","/api/projects",json!({"name":"Owned A","versioningMode":"none","syncMode":"none"}));
    let b=request(&api,"POST","/api/projects",json!({"name":"Owned B","versioningMode":"none","syncMode":"none"}));
    let aid=a["id"].as_str().unwrap();let bid=b["id"].as_str().unwrap();
    let folder=owned.path().join("state/ai");fs::create_dir_all(&folder).unwrap();let path=folder.join("usage.json");
    let bytes=serde_json::to_vec(&json!({"entries":[entry(aid,"2026-11","owned-one",3,1.2),entry(bid,"2026-11","owned-two",7,0.8),entry(aid,"2026-10","owned-one",20,10.0),{"projectId":aid,"createdAt":"2026-11-01T12:00:00Z","model":"legacy","estimatedCost":99.0,"totalTokens":4},{"model":"unattributed","createdAt":"éééé","totalTokens":2}]})).unwrap();fs::write(&path,&bytes).unwrap();
    request(&api,"POST",&format!("/api/projects/{bid}/retire"),Value::Null);
    let global=request(&api,"GET","/api/ai/usage/summary?month=2026-11",Value::Null);
    assert_eq!(global["totalEstimatedCost"],2.0);assert_eq!(global["totalTokens"],14);assert_eq!(global["totalInteractions"],3);assert_eq!(global["legacyEntries"],1);assert_eq!(global["unscopedEntries"],1);assert_eq!(global["coverage"],"retained-local-records");assert_eq!(global["entryLimit"],5000);assert_eq!(global["periodTimeZone"],"UTC");
    assert_eq!(global["models"].as_array().unwrap().iter().find(|model|model["model"]=="legacy").unwrap()["unpricedEntries"],1);
    assert!(global["availableProjects"].as_array().unwrap().iter().any(|project|project["id"]==bid&&project["name"]=="Owned B"&&project["state"]=="retired"));
    let filtered=request(&api,"GET",&format!("/api/ai/usage/summary?month=2026-11&projectId={aid}"),Value::Null);
    assert_eq!(filtered["projectId"],aid);assert_eq!(filtered["totalEstimatedCost"],1.2);assert_eq!(filtered["totalTokens"],7);
    assert_eq!(request(&api,"GET",&format!("/api/ai/usage/summary?month=2026-11&projectId={bid}"),Value::Null)["totalEstimatedCost"],0.8);
    assert_eq!(request(&api,"GET",&format!("/api/ai/usage/summary?month=2026-10&projectId={aid}"),Value::Null)["totalEstimatedCost"],10.0);
    assert_eq!(fs::read(&path).unwrap(),bytes);
    assert!(api.handle("GET","/api/ai/usage/summary?projectId=..%2Fneighbor",Value::Null,vec![]).is_err());
}
#[test]
fn extreme_or_incompatible_counts_and_costs_never_panic_write_or_become_zero(){
    let owned=tempfile::tempdir().unwrap();let api=LocalApi::new(owned.path().join("state"),"qa".into(),"test".into());
    let folder=owned.path().join("state/ai");fs::create_dir_all(&folder).unwrap();let path=folder.join("usage.json");
    let max=9_007_199_254_740_991u64;
    for entries in [json!([entry("owned","2026-11","one",max+1,0.1)]),json!([entry("owned","2026-11","one",max,0.1),entry("owned","2026-11","two",1,0.1)]),json!([entry("owned","2026-11","one",1,5_000_000_000.0),entry("owned","2026-11","two",1,5_000_000_000.0)]),json!([{"month":"2026-11","totalTokens":"broken"}]),json!([{"month":"2026-11","costSchemaVersion":99,"estimatedCostEur":0.0}]),json!([{"month":"2026-99","totalTokens":1}])]{
        let bytes=serde_json::to_vec(&json!({"entries":entries})).unwrap();fs::write(&path,&bytes).unwrap();
        assert!(api.handle("GET","/api/ai/usage/summary?month=2026-11",Value::Null,vec![]).is_err());assert_eq!(fs::read(&path).unwrap(),bytes);
    }
}
#[test]
fn research_preflight_reads_all_stores_before_upgrading_the_usage_ledger(){
    let owned=tempfile::tempdir().unwrap();let api=LocalApi::new(owned.path().join("state"),"qa".into(),"test".into());
    let project=request(&api,"POST","/api/projects",json!({"name":"Owned preflight","versioningMode":"none","syncMode":"none"}));let id=project["id"].as_str().unwrap();
    let usage=owned.path().join("state/ai/usage.json");fs::create_dir_all(usage.parent().unwrap()).unwrap();let original=br#"{"entries":[]}"#;fs::write(&usage,original).unwrap();
    let jobs=owned.path().join("state/ai-research").join(format!("{id}.json"));fs::create_dir_all(jobs.parent().unwrap()).unwrap();let future=br#"{"schemaVersion":99,"jobs":[]}"#;fs::write(&jobs,future).unwrap();
    assert!(api.handle("POST",&format!("/api/projects/{id}/ai/research/jobs"),json!({"topic":"Owned fixture, no provider"}),vec![]).is_err());
    assert_eq!(fs::read(usage).unwrap(),original);assert_eq!(fs::read(jobs).unwrap(),future);assert!(!owned.path().join("state/ai/usage-migrations").exists());
}
