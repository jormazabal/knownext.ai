use knownext_storage::LocalApi;
use serde_json::{json,Value};
use std::{fs,path::PathBuf};
fn call(api:&LocalApi,method:&str,path:&str,body:Value)->Value{let response=api.handle(method,path,body,vec![]).unwrap();assert_eq!(response.status,200,"{}",response.body);response.body}
fn fixture()->(tempfile::TempDir,LocalApi,String,PathBuf){
    let owned=tempfile::tempdir().unwrap();let api=LocalApi::new(owned.path().join("state"),"qa".into(),"test".into());
    let project=call(&api,"POST","/api/projects",json!({"name":"Owned attempt QA","versioningMode":"none","syncMode":"none"}));
    let root=PathBuf::from(project["folderPath"].as_str().unwrap());let id=format!("{}::A.md",project["id"].as_str().unwrap());
    fs::write(root.join("A.md"),b"Disk\n").unwrap();call(&api,"PUT",&format!("/api/documents/{id}/draft"),json!({"markdown":"Local\n"}));(owned,api,id,root)
}
fn payload(api:&LocalApi,id:&str,attempt:&str,merged:&str)->Value{let review=call(api,"GET",&format!("/api/documents/{id}/conflict"),Value::Null);json!({"attemptId":attempt,"locationRevision":review["locationRevision"],"diskFingerprint":review["diskFingerprint"],"draftRevision":review["draftRevision"],"localMarkdown":"Local\n","mergedMarkdown":merged})}
fn receipt_path(owned:&tempfile::TempDir,attempt:&str)->PathBuf{owned.path().join("state/conflict-attempts").join(format!("{attempt}.json"))}
fn count_copies(owned:&tempfile::TempDir)->usize{fs::read_dir(owned.path().join("state/drafts-review")).map(|entries|entries.count()).unwrap_or(0)}
#[test]
fn receipt_reopens_and_confirms_only_its_exact_copies_and_postcondition_without_replay_or_read_time_repair(){
    let(owned,api,id,root)=fixture();let attempt="attempt-owned-complete-0001";let payload=payload(&api,&id,attempt,"Combined\n");
    let response=call(&api,"POST",&format!("/api/documents/{id}/conflict"),payload.clone());assert_eq!(response["attemptId"],attempt);assert_eq!(count_copies(&owned),3);
    let file=receipt_path(&owned,attempt);let complete=fs::read(&file).unwrap();let mut interrupted:Value=serde_json::from_slice(&complete).unwrap();interrupted["phase"]=json!("applying");let interrupted=serde_json::to_vec_pretty(&interrupted).unwrap();fs::write(&file,&interrupted).unwrap();
    let reopened=LocalApi::new(owned.path().join("state"),"qa".into(),"test".into());let route=format!("/api/documents/{id}/conflict-attempts/{attempt}/review");assert!(LocalApi::is_independent_snapshot("POST",&route));
    let observed=call(&reopened,"POST",&route,payload.clone());assert_eq!(observed["status"],"confirmed");assert_eq!(observed["result"]["document"]["markdown"],"Combined\n");assert_eq!(observed["result"]["preservedCopies"],response["preservedCopies"]);assert_eq!(observed["result"]["id"],response["id"]);assert_eq!(fs::read(&file).unwrap(),interrupted);
    assert!(reopened.handle("POST",&format!("/api/documents/{id}/conflict"),payload.clone(),vec![]).is_err());assert_eq!(count_copies(&owned),3);assert_eq!(fs::read(root.join("A.md")).unwrap(),b"Disk\n");
    let key=response["preservedCopies"][0].as_str().unwrap();let copy=owned.path().join("state/drafts-review").join(key).join("copy.json");let original=fs::read(&copy).unwrap();fs::write(&copy,b"Tampered own fixture").unwrap();assert!(reopened.handle("POST",&route,payload.clone(),vec![]).is_err());assert_eq!(fs::read(&file).unwrap(),interrupted);fs::write(&copy,original).unwrap();
    let current=call(&reopened,"GET",&format!("/api/documents/{id}"),Value::Null);
    assert!(current["draftWriteRevision"].is_string(),"the later edit must review the currently stored draft");
    call(&reopened,"PUT",&format!("/api/documents/{id}/draft"),json!({"markdown":"Later draft\n","expectedDraftWriteRevision":current["draftWriteRevision"]}));assert_eq!(call(&reopened,"POST",&route,payload)["status"],"changed");assert_eq!(count_copies(&owned),3);
}
#[test]
fn pending_absent_or_failed_attempt_never_confirms_matching_content_or_restarts_a_write(){
    let(owned,api,id,root)=fixture();let attempt="attempt-owned-noop-0002";let payload=payload(&api,&id,attempt,"Disk\n");
    let absent=format!("/api/documents/{id}/conflict-attempts/{attempt}/review");assert_eq!(call(&api,"POST",&absent,payload.clone())["status"],"absent");assert!(!owned.path().join("state/conflict-attempts").exists());
    let result=call(&api,"POST",&format!("/api/documents/{id}/conflict"),payload.clone());let file=receipt_path(&owned,attempt);let mut preparing:Value=serde_json::from_slice(&fs::read(&file).unwrap()).unwrap();preparing["phase"]=json!("ready");preparing["targetPrepared"]=json!(false);let bytes=serde_json::to_vec(&preparing).unwrap();fs::write(&file,&bytes).unwrap();
    assert_eq!(call(&api,"POST",&absent,payload.clone())["status"],"pending");assert_eq!(fs::read(&file).unwrap(),bytes);assert_eq!(count_copies(&owned),3);assert_eq!(result["document"]["markdown"],"Disk\n");
    let mut changed=payload.clone();changed["mergedMarkdown"]=json!("Other proposal");assert!(api.handle("POST",&absent,changed,vec![]).is_err());
    let mut future=preparing;future["schemaVersion"]=json!(99);let future=serde_json::to_vec(&future).unwrap();fs::write(&file,&future).unwrap();assert!(api.handle("POST",&absent,payload.clone(),vec![]).is_err());assert!(api.handle("POST",&format!("/api/documents/{id}/conflict"),payload,vec![]).is_err());assert_eq!(fs::read(&file).unwrap(),future);assert_eq!(count_copies(&owned),3);assert_eq!(fs::read(root.join("A.md")).unwrap(),b"Disk\n");
}
#[test]
fn failed_draft_publication_has_copies_and_an_intent_but_no_false_confirmation(){
    let(owned,api,id,root)=fixture();let attempt="attempt-owned-readonly-0003";let payload=payload(&api,&id,attempt,"Combined\n");let draft=fs::read_dir(owned.path().join("state/drafts")).unwrap().next().unwrap().unwrap().path();let before=fs::read(&draft).unwrap();let permissions=fs::metadata(&draft).unwrap().permissions();let mut readonly=permissions.clone();readonly.set_readonly(true);fs::set_permissions(&draft,readonly).unwrap();
    let applied=api.handle("POST",&format!("/api/documents/{id}/conflict"),payload.clone(),vec![]);fs::set_permissions(&draft,permissions).unwrap();assert!(applied.is_err());assert_eq!(fs::read(&draft).unwrap(),before);assert_eq!(count_copies(&owned),3);
    let file=receipt_path(&owned,attempt);let bytes=fs::read(&file).unwrap();assert_eq!(serde_json::from_slice::<Value>(&bytes).unwrap()["phase"],"applying");let route=format!("/api/documents/{id}/conflict-attempts/{attempt}/review");assert_eq!(call(&api,"POST",&route,payload)["status"],"changed");assert_eq!(fs::read(&file).unwrap(),bytes);assert_eq!(fs::read(root.join("A.md")).unwrap(),b"Disk\n");
}
#[test]
fn handwritten_receipt_preserves_points_and_binds_the_same_pages_after_reopen(){
    let(owned,api,id,root)=fixture();let project=id.split("::").next().unwrap();let created=call(&api,"POST",&format!("/api/projects/{project}/handwritten-notes"),json!({"name":"Owned.knote"}));let note=created["node"]["id"].as_str().unwrap();let record=call(&api,"GET",&format!("/api/handwritten-notes/{note}"),Value::Null);
    let mut merged=record["content"].clone();merged["title"]=json!("Owned merged pages");merged["pages"][0]["strokes"]=json!([{"id":"owned-ink","color":"#111827","width":2,"opacity":1,"tool":"pen","pressure":true,"points":[[10,20,0.7,0,45,-30],[20,30,0.8,16,35,-20]]}]);
    let source=fs::read(root.join("Owned.knote")).unwrap();let review=call(&api,"GET",&format!("/api/handwritten-notes/{note}/conflict"),Value::Null);let attempt="attempt-owned-pages-0004";
    let payload=json!({"attemptId":attempt,"locationRevision":review["locationRevision"],"diskFingerprint":review["diskFingerprint"],"draftRevision":review["draftRevision"],"localContent":record["content"],"mergedContent":merged});let response=call(&api,"POST",&format!("/api/handwritten-notes/{note}/conflict"),payload.clone());
    let reopened=LocalApi::new(owned.path().join("state"),"qa".into(),"test".into());let route=format!("/api/handwritten-notes/{note}/conflict-attempts/{attempt}/review");let proof=call(&reopened,"POST",&route,payload.clone());assert_eq!(proof["status"],"confirmed");assert_eq!(proof["result"]["preservedCopies"],response["preservedCopies"]);assert_eq!(proof["result"]["note"]["content"]["title"],merged["title"]);assert_eq!(proof["result"]["note"]["content"]["pages"][0]["strokes"][0]["points"],merged["pages"][0]["strokes"][0]["points"]);assert_eq!(fs::read(root.join("Owned.knote")).unwrap(),source);
    let file=receipt_path(&owned,attempt);let original=fs::read(&file).unwrap();let mut unknown:Value=serde_json::from_slice(&original).unwrap();unknown["futureAction"]=json!(true);let unknown=serde_json::to_vec(&unknown).unwrap();fs::write(&file,&unknown).unwrap();assert!(reopened.handle("POST",&route,payload,vec![]).is_err());assert_eq!(fs::read(&file).unwrap(),unknown);assert_eq!(count_copies(&owned),3);
}
#[test]
fn receipt_quota_and_oversize_refuse_before_creating_copies_or_changing_a_draft(){
    let(owned,api,id,root)=fixture();let attempt="attempt-owned-budget-0005";let payload=payload(&api,&id,attempt,"Combined\n");let folder=owned.path().join("state/conflict-attempts");fs::create_dir(&folder).unwrap();let file=fs::File::create(receipt_path(&owned,attempt)).unwrap();file.set_len(64*1024+1).unwrap();drop(file);assert!(api.handle("POST",&format!("/api/documents/{id}/conflict"),payload.clone(),vec![]).is_err());assert_eq!(fs::metadata(receipt_path(&owned,attempt)).unwrap().len(),64*1024+1);assert_eq!(count_copies(&owned),0);
    // A separate identity cannot evade the total-storage budget.
    let huge=fs::File::create(folder.join("attempt-owned-existing-budget.json")).unwrap();huge.set_len(16*1024*1024).unwrap();drop(huge);let mut second=payload;second["attemptId"]=json!("attempt-owned-budget-other-0006");assert!(api.handle("POST",&format!("/api/documents/{id}/conflict"),second,vec![]).is_err());assert_eq!(count_copies(&owned),0);assert_eq!(fs::read(root.join("A.md")).unwrap(),b"Disk\n");
}
