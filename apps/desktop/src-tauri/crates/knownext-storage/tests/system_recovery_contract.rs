use knownext_storage::LocalApi;
use serde_json::Value;
use sha2::{Digest,Sha256};
use std::fs;
fn request(api:&LocalApi,path:&str)->Value{let response=api.handle("GET",path,Value::Null,vec![]).unwrap();assert!(response.status<400,"{}",response.body);response.body}
fn hash(bytes:&[u8])->String{format!("{:x}",Sha256::digest(bytes))}
#[test]
fn system_copies_are_reviewed_without_mutation_and_exported_as_exact_new_files(){
    let owned=tempfile::tempdir().unwrap();let state=owned.path().join("state");let api=LocalApi::new(state.clone(),"qa".into(),"test".into());
    let root=state.join("ai/usage-migrations");fs::create_dir_all(&root).unwrap();
    let original=br#"{"schemaVersion":1,"entries":[{"model":"owned","private":"never in UI summary"}]}"#;let source=root.join(format!("legacy-{}.json",hash(original)));fs::write(&source,original).unwrap();
    let current=state.join("ai/usage.json");let active=br#"{"schemaVersion":99,"future":"active remains exact"}"#;fs::write(&current,active).unwrap();
    let inventory=request(&api,"/api/recovery/system");assert_eq!(inventory["items"].as_array().unwrap().len(),1);let id=inventory["items"][0]["id"].as_str().unwrap();
    assert!(LocalApi::is_independent_snapshot("GET","/api/recovery/system"));assert!(LocalApi::is_independent_snapshot("GET",&format!("/api/recovery/system/{id}")));
    let review=request(&api,&format!("/api/recovery/system/{id}"));assert_eq!(review["provenance"],"verified-filename-digest");assert_eq!(review["canRestore"],false);assert_eq!(review["summary"]["entries"],1);assert!(!review.to_string().contains("never in UI summary"));
    assert_eq!(fs::read(&source).unwrap(),original);assert_eq!(fs::read(&current).unwrap(),active);
    let frozen=api.freeze_system_recovery(id,review["fingerprint"].as_str().unwrap()).unwrap();
    let cache=owned.path().join("cache");fs::create_dir(&cache).unwrap();let staged=frozen.stage(&cache).unwrap();assert_eq!(fs::read(&staged.path).unwrap(),original);
    // A changed source after freezing cannot alter the snapshot chosen for delivery.
    fs::write(&source,b"owned changed copy").unwrap();assert!(api.freeze_system_recovery(id,review["fingerprint"].as_str().unwrap()).is_err());
    let output=owned.path().join(frozen.filename());assert_eq!(api.write_system_recovery(&frozen,&output).unwrap(),original.len() as u64);assert_eq!(fs::read(&output).unwrap(),original);assert!(api.write_system_recovery(&frozen,&output).is_err());assert_eq!(fs::read(&output).unwrap(),original);
    assert!(api.write_system_recovery(&frozen,&state.join("forbidden.json")).is_err());assert!(!state.join("forbidden.json").exists());assert_eq!(fs::read(current).unwrap(),active);
}
#[test]
fn future_malformed_mismatched_and_blocked_sources_are_preserved_and_not_applied(){
    let owned=tempfile::tempdir().unwrap();let state=owned.path().join("state");let api=LocalApi::new(state.clone(),"qa".into(),"test".into());
    let root=state.join("recordings-dev/sessions-recovery");fs::create_dir_all(&root).unwrap();
    let future=br#"{"schemaVersion":99,"id":"owned","chunks":[],"private":"future canary"}"#;let future_path=root.join("owned-future.json");fs::write(&future_path,future).unwrap();
    let broken=root.join("owned-broken.json");fs::write(&broken,b"not-json private bytes").unwrap();
    fs::create_dir(root.join("unexpected-folder")).unwrap();
    let usage=state.join("ai/usage-migrations");fs::create_dir_all(&usage).unwrap();let wrong=usage.join(format!("legacy-{}.json","0".repeat(64)));fs::write(&wrong,b"{\"entries\":[]}").unwrap();
    let inventory=request(&api,"/api/recovery/system");assert_eq!(inventory["items"].as_array().unwrap().len(),4);
    for item in inventory["items"].as_array().unwrap(){let id=item["id"].as_str().unwrap();if item["canReview"]==false{assert!(api.handle("GET",&format!("/api/recovery/system/{id}"),Value::Null,vec![]).is_err());continue;}let review=request(&api,&format!("/api/recovery/system/{id}"));assert_eq!(review["canRestore"],false);assert!(!review.to_string().contains("future canary"));if item["name"]=="owned-future.json"{assert_eq!(review["summary"]["format"],"unknown");}if item["name"]==wrong.file_name().unwrap().to_str().unwrap(){assert_eq!(review["provenance"],"digest-mismatch");}}
    assert_eq!(fs::read(future_path).unwrap(),future);assert_eq!(fs::read(broken).unwrap(),b"not-json private bytes");
    assert!(api.handle("GET","/api/recovery/system/..%2Fneighbor",Value::Null,vec![]).is_err());
    // An inaccessible origin must not hide independent, available origins.
    let blocked=state.join("recordings/settings-recovery");fs::create_dir_all(blocked.parent().unwrap()).unwrap();fs::write(&blocked,b"owned obstruction").unwrap();
    let partial=request(&api,"/api/recovery/system");assert!(!partial["warnings"].as_array().unwrap().is_empty());assert_eq!(partial["items"].as_array().unwrap().len(),4);
}
#[test]
fn critical_originals_use_known_cohort_payloads_and_never_expose_credentials(){
    let owned=tempfile::tempdir().unwrap();let state=owned.path().join("state");let api=LocalApi::new(state.clone(),"qa".into(),"test".into());
    let reset=state.join("state-recovery/state-owned");let migration=state.join("migrations/migration-owned");fs::create_dir_all(&reset).unwrap();fs::create_dir_all(&migration).unwrap();
    let original=br#"{"schemaVersion":2,"ai":{"apiKey":"owned credential canary"},"appearance":{"theme":"dark"}}"#;
    fs::write(reset.join("config.json"),original).unwrap();fs::write(migration.join("config.json.original"),original).unwrap();
    fs::write(migration.join("manifest.json"),br#"{"schemaVersion":99,"future":"kept"}"#).unwrap();fs::write(migration.join("credentials.json.original"),b"owned forbidden payload").unwrap();
    let unknown=state.join("state-recovery/unattributed");fs::create_dir_all(&unknown).unwrap();fs::write(unknown.join("config.json"),original).unwrap();
    let inventory=request(&api,"/api/recovery/system");assert_eq!(inventory["items"].as_array().unwrap().len(),2);
    for copy in inventory["items"].as_array().unwrap(){let id=copy["id"].as_str().unwrap();let review=request(&api,&format!("/api/recovery/system/{id}"));assert_eq!(review["provenance"],"copy-fingerprint-only");assert_eq!(review["canRestore"],false);assert!(!review.to_string().contains("owned credential canary"));assert!(!review.to_string().contains("appearance"));
        if copy["group"]=="migration"{assert_eq!(review["relatedRecoveryId"],"migration-owned");assert!(api.handle("GET","/api/recovery/upgrades/migration-owned",Value::Null,vec![]).is_err());}
        let frozen=api.freeze_system_recovery(id,review["fingerprint"].as_str().unwrap()).unwrap();let output=owned.path().join(frozen.filename());api.write_system_recovery(&frozen,&output).unwrap();assert_eq!(fs::read(output).unwrap(),original);
    }
    assert_eq!(fs::read(reset.join("config.json")).unwrap(),original);assert_eq!(fs::read(migration.join("manifest.json")).unwrap(),br#"{"schemaVersion":99,"future":"kept"}"#);
}
