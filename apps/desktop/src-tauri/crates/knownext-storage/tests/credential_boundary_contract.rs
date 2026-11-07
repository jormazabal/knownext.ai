use knownext_storage::LocalApi;
use serde_json::{json,Value};
use std::fs;
fn status(api:&LocalApi)->Value{api.handle("GET","/api/credentials/openai-key",Value::Null,vec![]).unwrap().body}
#[test]
fn unknown_future_nonregular_and_oversized_credentials_are_preserved_by_all_key_mutations(){
    let temp=tempfile::tempdir().unwrap();let root=temp.path().join("state");let api=LocalApi::new(root.clone(),"qa".into(),"test".into());let path=root.join("credentials.json");
    for value in [json!({"format":"knownext-credentials-vNext","version":1,"payload":"owned-future-sentinel"}),json!({"format":"knownext-credentials","version":99,"protection":"future","payload":"owned-future-sentinel"}),json!({"openaiKey":"owned-legacy-sentinel","schemaVersion":99}),json!({"openaiKey":123})]{let bytes=serde_json::to_vec(&value).unwrap();fs::write(&path,&bytes).unwrap();let state=status(&api);assert_eq!(state["protection"],"unavailable");assert!(!state["storageError"].is_null());assert!(!state.to_string().contains("owned-future-sentinel"));assert!(!state.to_string().contains("owned-legacy-sentinel"));assert!(api.handle("PUT","/api/credentials/openai-key",json!({"apiKey":"owned-dummy-replacement"}),vec![]).is_err());assert!(api.handle("DELETE","/api/credentials/openai-key",Value::Null,vec![]).is_err());assert_eq!(fs::read(&path).unwrap(),bytes);}
    fs::remove_file(&path).unwrap();fs::create_dir(&path).unwrap();assert_eq!(status(&api)["protection"],"unavailable");assert!(api.handle("PUT","/api/credentials/openai-key",json!({"apiKey":"owned-dummy"}),vec![]).is_err());assert!(path.is_dir());fs::remove_dir(&path).unwrap();let file=fs::File::create(&path).unwrap();file.set_len(1024*1024+1).unwrap();drop(file);assert_eq!(status(&api)["protection"],"unavailable");assert_eq!(fs::metadata(&path).unwrap().len(),1024*1024+1);
}
#[cfg(windows)]
#[test]
fn known_legacy_credentials_migrate_to_native_protection_and_reopen_without_another_write(){
    let temp=tempfile::tempdir().unwrap();let root=temp.path().join("state");let api=LocalApi::new(root.clone(),"qa".into(),"test".into());let path=root.join("credentials.json");fs::write(&path,serde_json::to_vec(&json!({"openaiKey":"owned-dummy-openai","github":{"provider":"github","accessToken":"owned-dummy-github","scopes":["repo"]}})).unwrap()).unwrap();let state=status(&api);assert_eq!(state["configured"],true);assert_eq!(state["protection"],"windows-dpapi-user");let protected=fs::read(&path).unwrap();assert!(!String::from_utf8_lossy(&protected).contains("owned-dummy"));let reopened=LocalApi::new(root,"qa".into(),"test".into());assert_eq!(status(&reopened)["configured"],true);assert_eq!(fs::read(&path).unwrap(),protected);api.handle("DELETE","/api/credentials/openai-key",Value::Null,vec![]).unwrap();assert_eq!(status(&api)["configured"],false);let remaining:Value=serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();assert_eq!(remaining["format"],"knownext-credentials");assert!(!remaining.to_string().contains("owned-dummy"));
}
