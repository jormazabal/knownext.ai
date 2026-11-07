use knownext_recording::{model::{Chunk,Destination,Session,Settings,Status},RecordingService,transcription};
use knownext_core::recording_usage::RecordingUsageReceipt;
use serde_json::{json,Value};
use std::{fs,sync::{Mutex,atomic::{AtomicUsize,Ordering}}};

fn fixture(status:&str)->(tempfile::TempDir,RecordingService,String){
    let owned=tempfile::tempdir().unwrap();let root=owned.path().join("recordings");fs::create_dir(&root).unwrap();
    let mut session=Session::new(Settings::default(),Some(Destination{project_id:"owned-project".into(),folder_id:None,name:"Owned.md".into()}));
    session.samples=24_000;session.status=if status=="sending"{Status::Transcribing}else{Status::Queued};
    session.chunks.push(Chunk{sha256:None,start:0,samples:24_000,status:status.into(),text:Some("Owned confirmed text".into()),languages:vec![],usage_recorded:false,usage_receipt:Some(RecordingUsageReceipt{id:"owned-receipt".into(),started_at:knownext_core::now_iso(),project_id:"owned-project".into(),model:"gpt-transcribe".into(),samples:24_000,exchange_rate:Value::Null,confirmed:status=="completed"})});
    if status=="legacy" {session.chunks[0].usage_receipt=None;session.chunks[0].status="pending".into();}
    let id=session.id.clone();fs::create_dir(root.join(&id)).unwrap();fs::write(root.join(&id).join("session.json"),serde_json::to_vec(&session).unwrap()).unwrap();
    (owned,RecordingService::new(root).unwrap(),id)
}
#[test]
fn completed_chunk_recovers_receipt_ack_without_credentials_or_repeating_provider(){
    let (_owned,service,id)=fixture("completed");let receipts=Mutex::new(vec![]);let documents=AtomicUsize::new(0);
    transcription::drain(&service,|_|panic!("completed audio must not request credentials"),|receipt|{receipts.lock().unwrap().push(serde_json::to_value(receipt).unwrap());Err("owned lost acknowledgement".into())},|_,_,_|{documents.fetch_add(1,Ordering::SeqCst);Ok("owned-doc".into())}).unwrap();
    assert_eq!(documents.load(Ordering::SeqCst),0);
    service.request("queue",json!({"id":id})).unwrap();
    transcription::drain(&service,|_|panic!("receipt retry must not send audio"),|receipt|{receipts.lock().unwrap().push(serde_json::to_value(receipt).unwrap());Ok(())},|_,_,text|{assert!(text.contains("Owned confirmed text"));documents.fetch_add(1,Ordering::SeqCst);Ok("owned-doc".into())}).unwrap();
    let receipts=receipts.lock().unwrap();assert_eq!(receipts.len(),2);assert_eq!(receipts[0],receipts[1]);assert_eq!(documents.load(Ordering::SeqCst),1);
    let snapshot=service.request("snapshot",json!({})).unwrap();assert_eq!(snapshot["sessions"][0]["status"],"completed");assert_eq!(snapshot["sessions"][0]["chunks"][0]["usageRecorded"],true);
}
#[test]
fn interrupted_send_keeps_unknown_receipt_before_explicit_new_attempt(){
    let (_owned,service,id)=fixture("sending");
    let observed=Mutex::new(vec![]);
    transcription::reconcile_usage(&service,|receipt|{observed.lock().unwrap().push(receipt.clone());Ok(())}).unwrap();
    assert_eq!(observed.lock().unwrap().len(),1);
    let full:Value=serde_json::from_slice(&fs::read(service.root.join(&id).join("session.json")).unwrap()).unwrap();
    assert_eq!(full["chunks"][0]["text"],"Owned confirmed text");
    assert!(service.request("queue",json!({"id":id})).is_err());
    service.request("queue",json!({"id":id,"confirmUnknown":true})).unwrap();
    let receipts=Mutex::new(vec![]);
    transcription::drain(&service,|_|Err("owned budget stopped new sends".into()),|receipt|{receipts.lock().unwrap().push(receipt.clone());Ok(())},|_,_,_|panic!("incomplete audio cannot deliver")).unwrap();
    let receipts=receipts.lock().unwrap();assert!(receipts.is_empty());assert!(!observed.lock().unwrap()[0].confirmed);
    let snapshot=service.request("snapshot",json!({})).unwrap();assert_eq!(snapshot["sessions"][0]["chunks"][0]["status"],"unknown");assert_eq!(snapshot["sessions"][0]["chunks"][0]["usageRecorded"],true);
}
#[test]
fn first_receipt_preserves_the_exact_previous_session_before_adding_new_metadata(){
    let (_owned,service,id)=fixture("legacy");let path=service.root.join(&id).join("session.json");let original=fs::read(&path).unwrap();
    let mut full:Session=serde_json::from_slice(&original).unwrap();full.chunks[0].usage_receipt=Some(RecordingUsageReceipt{id:"owned-new-receipt".into(),started_at:knownext_core::now_iso(),project_id:"owned-project".into(),model:"gpt-transcribe".into(),samples:24_000,exchange_rate:Value::Null,confirmed:false});
    service.request("job-update",json!({"id":id,"chunks":full.chunks})).unwrap();
    let folder=service.root.join("sessions-recovery");let copies=fs::read_dir(&folder).unwrap().collect::<Result<Vec<_>,_>>().unwrap();assert_eq!(copies.len(),1);assert_eq!(fs::read(copies[0].path()).unwrap(),original);
    service.request("job-update",json!({"id":id,"chunks":full.chunks})).unwrap();assert_eq!(fs::read_dir(folder).unwrap().count(),1);
}
