use knownext_storage::LocalApi;
use serde_json::{json,Value};
use std::fs;

#[test]
fn ordinary_preference_save_preserves_exact_legacy_bytes_and_reuses_reviewed_recovery(){
    let temp=tempfile::tempdir().unwrap();let state=temp.path().join("state");let api=LocalApi::new(state.clone(),"qa".into(),"test".into());
    let original=br#"{ "schemaVersion":2, "appearance":{"theme":"dark"}, "ownedExtension":"retained" }"#;
    fs::write(state.join("config.json"),original).unwrap();
    api.handle("GET","/api/config",Value::Null,vec![]).unwrap();assert_eq!(fs::read(state.join("config.json")).unwrap(),original);
    api.handle("PUT","/api/config",json!({"appearance":{"theme":"light"}}),vec![]).unwrap();
    let catalog=api.handle("GET","/api/recovery/upgrades",Value::Null,vec![]).unwrap().body;let id=catalog["entries"][0]["id"].as_str().unwrap();
    assert_eq!(fs::read(state.join("migrations").join(id).join("config.json.original")).unwrap(),original);
    let reopened=LocalApi::new(state.clone(),"qa".into(),"test".into());let route=format!("/api/recovery/upgrades/{id}");
    let review=reopened.handle("GET",&route,Value::Null,vec![]).unwrap().body;assert_eq!(review["canRestore"],true);
    reopened.handle("POST",&format!("{route}/restore"),json!({"revision":review["revision"]}),vec![]).unwrap();assert_eq!(fs::read(state.join("config.json")).unwrap(),original);
    // An unavailable preservation destination must block normalization, not lose the source.
    fs::remove_dir_all(state.join("migrations")).unwrap();fs::write(state.join("migrations"),"owned obstruction").unwrap();
    assert!(reopened.handle("PUT","/api/config",json!({"appearance":{"theme":"light"}}),vec![]).is_err());assert_eq!(fs::read(state.join("config.json")).unwrap(),original);
}

#[test]
fn plaintext_credentials_are_not_copied_by_an_ordinary_format_transition(){
    let temp=tempfile::tempdir().unwrap();let state=temp.path().join("state");let api=LocalApi::new(state.clone(),"qa".into(),"test".into());
    let original=br#"{"schemaVersion":2,"ai":{"apiKey":"owned-synthetic-value"}}"#;fs::write(state.join("config.json"),original).unwrap();
    assert!(api.handle("PUT","/api/config",json!({"appearance":{"theme":"light"}}),vec![]).is_err());assert_eq!(fs::read(state.join("config.json")).unwrap(),original);assert!(!state.join("migrations").exists());
}
