use knownext_storage::acquire_runtime_owner;
use std::{fs,process::Command,time::{Duration,Instant}};
#[test]
fn owned_child_probe(){
    let Some(root)=std::env::var_os("KNOWNEXT_OWNED_LOCK_FIXTURE") else{return;};
    let root=std::path::PathBuf::from(root);
    if std::env::var_os("KNOWNEXT_OWNED_LOCK_MODE").as_deref()==Some(std::ffi::OsStr::new("blocked")){assert!(acquire_runtime_owner(&root).is_err());return;}
    let _lease=acquire_runtime_owner(&root).unwrap();fs::write(root.join("owned-ready"),b"ready").unwrap();let start=Instant::now();while start.elapsed()<Duration::from_secs(10){std::thread::sleep(Duration::from_millis(25));}
}
#[test]
fn only_one_process_owns_the_state_and_the_os_releases_it_after_a_forced_exit(){
    let temp=tempfile::tempdir().unwrap();let root=temp.path();let lease=acquire_runtime_owner(root).unwrap();assert!(acquire_runtime_owner(root).is_err());let executable=std::env::current_exe().unwrap();let status=Command::new(&executable).args(["--exact","owned_child_probe","--nocapture"]).env("KNOWNEXT_OWNED_LOCK_FIXTURE",root).env("KNOWNEXT_OWNED_LOCK_MODE","blocked").status().unwrap();assert!(status.success());drop(lease);
    let mut child=Command::new(&executable).args(["--exact","owned_child_probe","--nocapture"]).env("KNOWNEXT_OWNED_LOCK_FIXTURE",root).env("KNOWNEXT_OWNED_LOCK_MODE","hold").spawn().unwrap();let start=Instant::now();while !root.join("owned-ready").exists()&&start.elapsed()<Duration::from_secs(5){std::thread::sleep(Duration::from_millis(25));}
    if !root.join("owned-ready").exists(){let _=child.kill();let _=child.wait();panic!("own fixture child did not acquire lease");}
    let blocked=acquire_runtime_owner(root).is_err();child.kill().unwrap();child.wait().unwrap();assert!(blocked);let resumed=acquire_runtime_owner(root).unwrap();assert_eq!(fs::metadata(root.join("runtime-owner.lock")).unwrap().len(),0);drop(resumed);assert!(root.join("runtime-owner.lock").exists());
}
#[test]
fn unknown_lock_file_is_preserved_and_separate_state_directories_are_independent(){
    let a=tempfile::tempdir().unwrap();let b=tempfile::tempdir().unwrap();let _first=acquire_runtime_owner(a.path()).unwrap();let _second=acquire_runtime_owner(b.path()).unwrap();drop(_first);let path=a.path().join("runtime-owner.lock");fs::write(&path,b"owned unknown data").unwrap();assert!(acquire_runtime_owner(a.path()).is_err());assert_eq!(fs::read(&path).unwrap(),b"owned unknown data");
}
