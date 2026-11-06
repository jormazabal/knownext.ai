use knownext_storage::LocalApi;
use knownext_core::recording_usage::RecordingUsageReceipt;
use serde_json::{json,Value};
use std::fs;

fn request(api:&LocalApi,method:&str,path:&str,body:Value)->Value{let response=api.handle(method,path,body,vec![]).unwrap();assert!(response.status<400,"{}",response.body);response.body}
fn receipt(id:&str,confirmed:bool)->RecordingUsageReceipt{RecordingUsageReceipt{id:id.into(),started_at:knownext_core::now_iso(),project_id:"owned-project".into(),model:"gpt-transcribe".into(),samples:24_000*60,exchange_rate:json!({"usdPerEur":1.25,"date":&knownext_core::now_iso()[..10]}),confirmed}}
#[test]
fn native_receipts_are_durable_idempotent_and_uncertain_sends_are_not_free(){
    let owned=tempfile::tempdir().unwrap();let state=owned.path().join("state");
    let api=LocalApi::new(state.clone(),"qa".into(),"test".into());
    let confirmed=receipt("owned-receipt-confirmed",true);api.record_recording_usage(&confirmed).unwrap();
    let path=state.join("ai/usage.json");let exact=fs::read(&path).unwrap();
    api.record_recording_usage(&confirmed).unwrap();assert_eq!(fs::read(&path).unwrap(),exact);
    let mut conflict=confirmed.clone();conflict.samples+=1;assert!(api.record_recording_usage(&conflict).is_err());assert_eq!(fs::read(&path).unwrap(),exact);
    let reopened=LocalApi::new(state.clone(),"qa".into(),"test".into());reopened.record_recording_usage(&confirmed).unwrap();assert_eq!(fs::read(&path).unwrap(),exact);
    let summary=request(&reopened,"GET","/api/ai/usage/summary",Value::Null);
    assert_eq!(summary["totalInteractions"],1);assert!(summary["totalEstimatedCost"].as_f64().unwrap()>0.0);
    assert_eq!(summary["models"][0]["usageSource"],"estimated");
    reopened.record_recording_usage(&receipt("owned-receipt-uncertain",false)).unwrap();
    let summary=request(&reopened,"GET","/api/ai/usage/summary",Value::Null);assert_eq!(summary["totalInteractions"],2);assert_eq!(summary["unpricedEntries"],1);
    let raw=fs::read_to_string(&path).unwrap();assert!(!raw.contains("transcript"));assert!(!raw.contains("credential"));
}
#[test]
fn monthly_global_and_project_limits_gate_new_native_sends_with_revision_guards(){
    let owned=tempfile::tempdir().unwrap();let state=owned.path().join("state");let api=LocalApi::new(state.clone(),"qa".into(),"test".into());
    let month=&knownext_core::now_iso()[..7];let path=format!("/api/ai/usage/budget?month={month}&projectId=owned-project");
    let review=request(&api,"GET",&path,Value::Null);assert_eq!(review["revision"],"absent");assert!(!state.join("ai").exists());
    let change=json!({"revision":review["revision"],"month":month,"projectId":"owned-project","limitEur":0.01,"mode":"stop-new"});
    let saved=request(&api,"POST","/api/ai/usage/budget",change.clone());
    let policy=state.join("ai/usage-policy.json");let original=fs::read(&policy).unwrap();
    request(&api,"POST","/api/ai/usage/budget",change);assert_eq!(fs::read(&policy).unwrap(),original);
    // Missing conversion prevents a capped paid send, but has no capture authority.
    assert!(api.recording_transcription_credential("owned-project").unwrap_err().contains("referencia EUR"));
    api.record_recording_usage(&receipt("owned-uncertain",false)).unwrap();
    let checked=request(&api,"GET",&path,Value::Null);assert_eq!(checked["checks"][0]["blocked"],true);assert_eq!(checked["checks"][0]["state"],"uncertain");
    assert!(api.recording_transcription_credential("owned-project").unwrap_err().contains("Presupuesto de IA"));
    assert!(api.handle("POST","/api/ai/usage/budget",json!({"revision":"absent","month":month,"projectId":"owned-project","limitEur":2.0,"mode":"notice"}),vec![]).is_err());assert_eq!(fs::read(&policy).unwrap(),original);
    request(&api,"POST","/api/ai/usage/budget",json!({"revision":saved["revision"],"month":month,"projectId":"owned-project","limitEur":2.0,"mode":"notice"}));
    assert!(!api.recording_transcription_credential("owned-project").unwrap_err().contains("Presupuesto de IA"));
    let latest=request(&api,"GET",&path,Value::Null);
    request(&api,"POST","/api/ai/usage/budget",json!({"revision":latest["revision"],"month":month,"projectId":null,"limitEur":0.01,"mode":"stop-new"}));
    assert!(api.recording_transcription_credential("owned-project").unwrap_err().contains("Presupuesto de IA"));
    assert_eq!(request(&api,"GET",&format!("/api/ai/usage/budget?month=2000-01&projectId=owned-project"),Value::Null)["checks"],json!([]));
    let future=br#"{"schemaVersion":99,"rules":[],"future":"preserve"}"#;fs::write(&policy,future).unwrap();
    assert!(api.ai_spend_assessment(Some("owned-project")).is_err());assert!(api.handle("POST","/api/ai/usage/budget",json!({"revision":"absent","month":month,"projectId":null,"limitEur":null,"mode":null}),vec![]).is_err());assert_eq!(fs::read(&policy).unwrap(),future);
}
