use knownext_sync_folder::*;
use std::{collections::BTreeMap,fs,path::Path};

fn fixture()->(tempfile::TempDir,std::path::PathBuf,std::path::PathBuf) {
    let area=tempfile::tempdir().unwrap();
    let source=area.path().join("source");let exchange=area.path().join("exchange");
    fs::create_dir(&source).unwrap();fs::create_dir(&exchange).unwrap();
    (area,source,exchange)
}
fn sample(source:&Path)->Snapshot {
    fs::create_dir_all(source.join("docs/empty")).unwrap();
    fs::write(source.join("docs/meeting.md"),"# Reunión\nContenido confirmado.\n").unwrap();
    capture(source,"project-1","publication-1","device-1",None).unwrap()
}
fn copy_file(source:&Path,dest:&Path) {fs::create_dir_all(dest.parent().unwrap()).unwrap();fs::copy(source,dest).unwrap();}

#[test]
fn publish_is_idempotent_verifies_all_bytes_and_preserves_empty_directories() {
    let (_area,source,exchange)=fixture();
    fs::create_dir(source.join(".git")).unwrap();
    fs::write(source.join(".git/private-config"),"not transferable").unwrap();
    let snapshot=sample(&source);
    assert_eq!(snapshot.manifest.exclusions,vec![".git"]);
    assert!(snapshot.manifest.directories.contains(&"docs/empty".into()));
    let first=publish(&exchange,&snapshot).unwrap();
    assert_eq!(publish(&exchange,&snapshot).unwrap(),first);
    assert_eq!(list(&exchange,"project-1").unwrap(),vec![first.clone()]);
    assert_eq!(read_verified(&exchange,&first).unwrap(),snapshot.contents);
    assert_eq!(manifest_hash(&first).unwrap(),manifest_hash(&snapshot.manifest).unwrap());
    assert_eq!(first.files.len(),1);
}

#[test]
fn hidden_secrets_are_excluded_before_publication() {
    let (_area,source,exchange)=fixture();fs::write(source.join(".env"),b"secret value").unwrap();
    let snapshot=sample(&source);assert!(snapshot.manifest.exclusions.contains(&".env".into()));
    publish(&exchange,&snapshot).unwrap();
    assert!(!exchange.join(format!("objects/{}.blob",sha256(b"secret value"))).exists());
}

#[test]
fn discovery_is_bounded_complete_and_rejects_unknown_roots() {
    let (_area,source,exchange)=fixture();assert!(discover_projects(&exchange).unwrap().is_empty());
    let snapshot=sample(&source);publish(&exchange,&snapshot).unwrap();
    assert_eq!(discover_projects(&exchange).unwrap(),vec!["project-1"]);
    let object=snapshot.manifest.files.values().next().unwrap();
    fs::write(exchange.join(format!("objects/{}.blob",object.sha256)),b"corrupted").unwrap();
    assert!(discover_projects(&exchange).is_err());
    fs::write(exchange.join("unknown.txt"),b"do not touch").unwrap();
    assert_eq!(discover_projects(&exchange).unwrap_err().code,"unexpected-exchange-entry");
}

#[test]
fn two_exchange_copies_model_out_of_order_transport_not_real_proton() {
    let (area,source,exchange_a)=fixture();
    let snapshot=sample(&source);publish(&exchange_a,&snapshot).unwrap();
    let exchange_b=area.path().join("exchange-b");fs::create_dir(&exchange_b).unwrap();
    fs::create_dir(exchange_b.join("objects")).unwrap();
    let descriptor="projects/project-1/publications/publication-1.json";
    copy_file(&exchange_a.join(descriptor),&exchange_b.join(descriptor));
    let received=inspect(&exchange_b,"project-1","publication-1").unwrap();
    assert!(read_verified(&exchange_b,&received).is_err());
    for file in received.files.values() {
        let name=format!("objects/{}.blob",file.sha256);
        copy_file(&exchange_a.join(&name),&exchange_b.join(name));
    }
    assert_eq!(read_verified(&exchange_b,&received).unwrap(),snapshot.contents);
    assert!(fs::read_dir(&exchange_b).unwrap().all(|e|e.unwrap().file_name()!="meeting.md"));
}

#[test]
fn corrupted_or_occupied_objects_are_preserved_and_never_acknowledged() {
    let (_area,source,exchange)=fixture();let snapshot=sample(&source);
    publish(&exchange,&snapshot).unwrap();
    let item=snapshot.manifest.files.values().next().unwrap();
    let object=exchange.join(format!("objects/{}.blob",item.sha256));
    fs::write(&object,b"unknown content").unwrap();
    assert!(read_verified(&exchange,&snapshot.manifest).is_err());
    assert!(publish(&exchange,&snapshot).is_err());
    assert_eq!(fs::read(object).unwrap(),b"unknown content");
}

#[test]
fn same_publication_id_with_different_manifest_does_not_replace() {
    let (_area,source,exchange)=fixture();let snapshot=sample(&source);
    publish(&exchange,&snapshot).unwrap();
    fs::write(source.join("new.md"),"new content").unwrap();
    let changed=capture(&source,"project-1","publication-1","device-1",None).unwrap();
    assert!(publish(&exchange,&changed).is_err());
    assert_eq!(inspect(&exchange,"project-1","publication-1").unwrap(),snapshot.manifest);
}

#[test]
fn unsafe_identity_paths_names_and_case_aliases_are_rejected() {
    let (_area,source,_exchange)=fixture();let mut manifest=sample(&source).manifest;
    manifest.project_id="../project".into();assert!(validate_manifest(&manifest).is_err());
    manifest.project_id="project-1".into();let entry=manifest.files.values().next().unwrap().clone();
    for path in ["../escape.md","/absolute.md","a\\b.md","a/b:stream","docs/NUL.txt","docs/file.",".git/config"] {
        manifest.files=BTreeMap::from([(path.into(),entry.clone())]);
        assert!(validate_manifest(&manifest).is_err(),"{path}");
    }
    manifest.directories.clear();
    manifest.files=BTreeMap::from([("Docs/one.md".into(),entry.clone()),("docs/two.md".into(),entry.clone())]);
    assert!(validate_manifest(&manifest).is_err());
    manifest.files=BTreeMap::from([("one.md".into(),entry.clone()),("ONE.md".into(),entry)]);
    assert!(validate_manifest(&manifest).is_err());
}

#[test]
fn directory_cannot_descend_from_file_and_duplicate_json_keys_are_rejected() {
    let (_area,source,_exchange)=fixture();let mut manifest=sample(&source).manifest;
    let entry=manifest.files.values().next().unwrap().clone();
    manifest.files=BTreeMap::from([("a".into(),entry.clone())]);manifest.directories=vec!["a/b".into()];
    assert_eq!(validate_manifest(&manifest).unwrap_err().code,"file-directory-collision");
    let hash=sha256(b"content");
    let raw=format!("{{\"schemaVersion\":1,\"projectId\":\"project\",\"publicationId\":\"publication\",\"senderId\":\"sender\",\"parentPublication\":null,\"files\":{{\"a\":{{\"sha256\":\"{hash}\",\"bytes\":7}},\"a\":{{\"sha256\":\"{hash}\",\"bytes\":7}}}}}}");
    assert!(serde_json::from_str::<Manifest>(&raw).is_err());
}

#[test]
fn future_manifest_and_wrong_identity_do_not_succeed() {
    let (_area,source,exchange)=fixture();let snapshot=sample(&source);publish(&exchange,&snapshot).unwrap();
    let descriptor=exchange.join("projects/project-1/publications/publication-1.json");
    let mut changed=snapshot.manifest.clone();changed.schema_version=2;
    fs::write(&descriptor,serde_json::to_vec(&changed).unwrap()).unwrap();
    assert!(inspect(&exchange,"project-1","publication-1").is_err());
    changed.schema_version=1;changed.sender_id="../not-device".into();
    fs::write(&descriptor,serde_json::to_vec(&changed).unwrap()).unwrap();
    assert!(inspect(&exchange,"project-1","publication-1").is_err());
    changed.sender_id="device-1".into();changed.project_id="different".into();
    fs::write(&descriptor,serde_json::to_vec(&changed).unwrap()).unwrap();
    assert!(inspect(&exchange,"project-1","publication-1").is_err());
}

#[test]
fn limits_are_checked_without_allocating_giant_payloads() {
    let (_area,source,_exchange)=fixture();let mut manifest=sample(&source).manifest;
    manifest.files.values_mut().next().unwrap().bytes=MAX_FILE_BYTES+1;
    assert!(validate_manifest(&manifest).is_err());
    manifest.files.clear();
    for i in 0..9 {manifest.files.insert(format!("{i}.bin"),FileEntry{sha256:sha256(b"content"),bytes:MAX_FILE_BYTES});}
    assert!(validate_manifest(&manifest).is_err());
    manifest.files.clear();manifest.directories=(0..=MAX_ENTRIES).map(|i|format!("dir-{i}")).collect();
    assert!(validate_manifest(&manifest).is_err());
}

#[test]
fn source_changes_after_capture_do_not_alter_the_captured_payload() {
    let (_area,source,exchange)=fixture();let snapshot=sample(&source);
    fs::write(source.join("docs/meeting.md"),"later revision").unwrap();
    publish(&exchange,&snapshot).unwrap();
    assert_eq!(read_verified(&exchange,&snapshot.manifest).unwrap(),snapshot.contents);
    assert_eq!(fs::read_to_string(source.join("docs/meeting.md")).unwrap(),"later revision");
}

#[test]
fn project_exchange_overlap_is_rejected() {
    let (_area,source,_exchange)=fixture();let snapshot=sample(&source);
    let nested=source.join("exchange");fs::create_dir(&nested).unwrap();
    assert_eq!(publish(&nested,&snapshot).unwrap_err().code,"exchange-overlaps-project");
}

#[test]
fn incomplete_temporaries_are_not_publications() {
    let (_area,source,exchange)=fixture();let snapshot=sample(&source);publish(&exchange,&snapshot).unwrap();
    fs::write(exchange.join("projects/project-1/publications/.knownext-interrupted.tmp"),b"partial").unwrap();
    assert_eq!(list(&exchange,"project-1").unwrap().len(),1);
}

#[test]
fn outbox_restore_reuses_original_capture_and_rejects_tampering() {
    let (_area,source,exchange)=fixture();let original=sample(&source);
    let restored=restore_snapshot(original.manifest.clone(),original.contents.clone(),&source).unwrap();
    assert_eq!(publish(&exchange,&restored).unwrap(),original.manifest);
    let mut altered=original.contents.clone();altered.values_mut().next().unwrap().push(b'!');
    assert!(restore_snapshot(original.manifest,altered,&source).is_err());
}

#[cfg(unix)]
#[test]
fn symlink_sources_and_exchange_ancestors_are_rejected() {
    use std::os::unix::fs::symlink;
    let (area,source,exchange)=fixture();let snapshot=sample(&source);
    let outside=area.path().join("outside");fs::write(&outside,"secret").unwrap();
    symlink(&outside,source.join("link.md")).unwrap();
    assert!(capture(&source,"project-1","pub-2","device",None).is_err());
    let alias=area.path().join("alias");symlink(&exchange,&alias).unwrap();
    assert!(publish(&alias,&snapshot).is_err());
}
