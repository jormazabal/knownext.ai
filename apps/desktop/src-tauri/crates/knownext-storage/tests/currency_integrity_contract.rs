use knownext_storage::{currency,LocalApi};
use serde_json::Value;
use std::fs;

#[test]
fn malformed_future_and_nonregular_caches_are_preserved_before_any_network_attempt(){
    let temp=tempfile::tempdir().unwrap();let file=temp.path().join("eur-usd.json");
    assert_eq!(currency::read_checked(temp.path()).unwrap(),Value::Null);assert!(!file.exists());
    for bytes in [b"{broken".as_slice(),br#"{"schemaVersion":99,"usdPerEur":1.25,"date":"2026-11-01"}"#,br#"{"usdPerEur":0,"date":"2026-11-01"}"#,br#"{"checkedAt":"invalid"}"#]{
        fs::write(&file,bytes).unwrap();assert!(currency::read_checked(temp.path()).is_err());assert!(currency::refresh(temp.path()).is_err());assert_eq!(fs::read(&file).unwrap(),bytes);
    }
    let oversized=fs::File::create(&file).unwrap();oversized.set_len(64*1024+1).unwrap();drop(oversized);assert!(currency::refresh(temp.path()).is_err());assert_eq!(fs::metadata(&file).unwrap().len(),64*1024+1);
    fs::remove_file(&file).unwrap();fs::create_dir(&file).unwrap();assert!(currency::refresh(temp.path()).is_err());assert!(file.is_dir());
}

#[test]
fn known_daily_attempt_is_not_rewritten_and_bad_cache_is_visible_in_usage_without_fabricating_conversion(){
    let temp=tempfile::tempdir().unwrap();let state=temp.path().join("state");let api=LocalApi::new(state.clone(),"qa".into(),"test".into());let file=state.join("eur-usd.json");
    let today=&knownext_core::now_iso()[..10];let original=format!("{{ \"checkedAt\":\"{today}\" }}");fs::write(&file,&original).unwrap();assert_eq!(currency::refresh(&state).unwrap()["checkedAt"],today);assert_eq!(fs::read_to_string(&file).unwrap(),original);
    fs::write(&file,"{broken").unwrap();let response=api.handle("GET","/api/ai/usage/summary",Value::Null,vec![]).unwrap().body;assert!(response["exchangeRate"].is_null());assert!(response["exchangeRateWarning"].as_str().is_some());assert_eq!(fs::read_to_string(&file).unwrap(),"{broken");
}
