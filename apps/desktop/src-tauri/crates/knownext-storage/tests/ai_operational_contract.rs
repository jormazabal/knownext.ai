use knownext_storage::LocalApi;
use serde_json::{json,Value};
use std::{fs,path::PathBuf};
fn setup()->(tempfile::TempDir,LocalApi,String,PathBuf){let temp=tempfile::tempdir().unwrap();let state=temp.path().join("state");let api=LocalApi::new(state.clone(),"qa".into(),"test".into());let project=api.handle("POST","/api/projects",json!({"name":"Owned operational integrity","versioningMode":"none"}),vec![]).unwrap().body;let id=project["id"].as_str().unwrap().to_string();(temp,api,id,state)}
fn get(api:&LocalApi,path:&str)->Result<Value,String>{api.handle("GET",path,Value::Null,vec![]).map(|r|r.body)}

#[test]
fn usage_absence_legacy_corruption_future_and_limits_are_distinct_without_provider_calls(){
    let (_temp,api,project,state)=setup();let file=state.join("ai/usage.json");get(&api,"/api/ai/usage/summary").unwrap();assert!(!file.exists());fs::create_dir_all(file.parent().unwrap()).unwrap();let legacy=br#"{"entries":[{"projectId":null,"month":"2026-10","model":"legacy","totalTokens":123,"estimatedCost":2}]}"#;fs::write(&file,legacy).unwrap();let summary=get(&api,"/api/ai/usage/summary?month=2026-10").unwrap();assert_eq!(summary["legacyEntries"],1);assert_eq!(fs::read(&file).unwrap(),legacy);
    for bytes in [b"{broken".as_slice(),br#"{"schemaVersion":99,"entries":[]}"#,br#"{"entries":{},"private":"owned-sentinel"}"#]{fs::write(&file,bytes).unwrap();assert!(get(&api,"/api/ai/usage/summary").is_err());let result=api.handle("POST",&format!("/api/projects/{project}/ai/interactions"),json!({"prompt":"No network should run","activeMarkdown":""}),vec![]).unwrap().body;assert_eq!(result["status"],"error");assert_eq!(fs::read(&file).unwrap(),bytes);}
    let oversized=fs::File::create(&file).unwrap();oversized.set_len(32*1024*1024+1).unwrap();drop(oversized);assert!(get(&api,"/api/ai/usage/summary").is_err());assert_eq!(fs::metadata(&file).unwrap().len(),32*1024*1024+1);
}

#[test]
fn policy_writes_fail_honestly_and_corrupt_research_never_becomes_an_empty_success(){
    let (_temp,api,project,state)=setup();let policy_route=format!("/api/projects/{project}/ai/research/policy");let jobs_route=format!("/api/projects/{project}/ai/research/jobs");let policy=get(&api,&policy_route).unwrap();assert!(!state.join("ai-research").exists());api.handle("PUT",&policy_route,policy.clone(),vec![]).unwrap();let file=state.join("ai-research").join(format!("{project}.policy.json"));let before=fs::read(&file).unwrap();let permissions=fs::metadata(&file).unwrap().permissions();let mut readonly=permissions.clone();readonly.set_readonly(true);fs::set_permissions(&file,readonly).unwrap();let mut next=policy.clone();next["maxSources"]=json!(8);let result=api.handle("PUT",&policy_route,next,vec![]);fs::set_permissions(&file,permissions).unwrap();assert!(result.is_err());assert_eq!(fs::read(&file).unwrap(),before);
    let jobs=state.join("ai-research").join(format!("{project}.json"));for bytes in [b"{broken".as_slice(),br#"{"schemaVersion":9,"jobs":[]}"#,br#"{"jobs":[{"id":"research-owned","projectId":"someone-else"}]}"#]{fs::write(&jobs,bytes).unwrap();assert!(get(&api,&jobs_route).is_err());assert!(api.handle("POST",&jobs_route,json!({"brief":{}}),vec![]).is_err());assert_eq!(fs::read(&jobs).unwrap(),bytes);}
    fs::remove_file(&jobs).unwrap();assert!(api.handle("PUT",&policy_route,Value::Null,vec![]).is_err());assert_eq!(fs::read(&file).unwrap(),before);
}

#[test]
fn reopening_a_running_legacy_job_reports_interruption_without_rewriting_it_or_restarting_work(){
    let (_temp,api,project,state)=setup();let file=state.join("ai-research").join(format!("{project}.json"));fs::create_dir_all(file.parent().unwrap()).unwrap();let original=serde_json::to_vec(&json!({"jobs":[{"id":"research-owned","projectId":project,"status":"drafting","markdown":"Useful partial result","createdAt":"2026-10-31T10:00:00Z"},{"id":"research-finished","projectId":project,"status":"ready_pass","markdown":"Finished result"}]})).unwrap();fs::write(&file,&original).unwrap();let route=format!("/api/projects/{project}/ai/research/jobs");for instance in [&api,&LocalApi::new(state.clone(),"qa".into(),"test".into())]{let list=get(instance,&route).unwrap();let running=list["jobs"].as_array().unwrap().iter().find(|v|v["id"]=="research-owned").unwrap();assert_eq!(running["status"],"failed_runtime");assert_eq!(running["error"]["code"],"interrupted_runtime");assert_eq!(running["markdown"],"Useful partial result");let finished=get(instance,&format!("{route}/research-finished")).unwrap();assert_eq!(finished["status"],"ready_pass");assert_eq!(fs::read(&file).unwrap(),original);}
    assert!(api.handle("POST",&format!("{route}/missing/cancel"),Value::Null,vec![]).is_err());assert_eq!(fs::read(&file).unwrap(),original);
    let permissions=fs::metadata(&file).unwrap().permissions();let mut readonly=permissions.clone();readonly.set_readonly(true);fs::set_permissions(&file,readonly).unwrap();let result=api.handle("POST",&format!("{route}/research-finished/accept"),Value::Null,vec![]);fs::set_permissions(&file,permissions).unwrap();assert!(result.is_err());assert_eq!(fs::read(&file).unwrap(),original);
}
