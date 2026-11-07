use knownext_storage::LocalApi;
use serde_json::{json,Value};
use sha2::{Digest,Sha256};
use std::fs;
#[test]
fn local_mixed_catalog_does_not_require_remote_context_or_adopt_unknown_entries(){
 let owned=tempfile::tempdir().unwrap();let state=owned.path().join("state");let api=LocalApi::new(state.clone(),"qa".into(),"test".into());
 let project=api.handle("POST","/api/projects",json!({"name":"Owned local catalog","versioningMode":"none","syncMode":"none"}),vec![]).unwrap().body;let id=project["id"].as_str().unwrap();let route=format!("/api/projects/{id}/sync/mixed-selections");let empty=api.handle("GET",&route,Value::Null,vec![]).unwrap().body;assert_eq!(empty["schemaVersion"],1);assert_eq!(empty["projectId"],id);assert_eq!(empty["items"],json!([]));assert_eq!(empty["limited"],false);assert!(empty["checkedAt"].as_str().is_some());assert!(!state.join("mixed-reviews").exists());
 let root=state.join("mixed-reviews").join(format!("{:x}",Sha256::digest(id.as_bytes())));fs::create_dir_all(&root).unwrap();let sentinel=root.join("unknown-future.json");fs::write(&sentinel,b"owned unknown future entry").unwrap();let partial=api.handle("GET",&route,Value::Null,vec![]).unwrap().body;assert_eq!(partial["items"],json!([]));assert_eq!(partial["limited"],true);assert!(!partial["warnings"].as_array().unwrap().is_empty());assert_eq!(fs::read(&sentinel).unwrap(),b"owned unknown future entry");assert_eq!(fs::read_dir(&root).unwrap().count(),1);
}
