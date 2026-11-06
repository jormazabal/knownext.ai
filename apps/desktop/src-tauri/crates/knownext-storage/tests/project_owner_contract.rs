use knownext_storage::LocalApi;
use serde_json::{json, Value};
use std::{
    fs,
    path::Path,
    process::Command,
    time::{Duration, Instant},
};
fn api(state: &Path) -> LocalApi {
    LocalApi::new(state.into(), "qa".into(), "test".into())
}
fn create(api: &LocalApi, root: &Path) -> Value {
    api.handle("POST","/api/projects",json!({"name":"Owned shared project","folderPath":root,"versioningMode":"none","syncMode":"none"}),vec![]).unwrap().body
}
fn register(state: &Path, project: &Value) {
    fs::create_dir_all(state).unwrap();
    fs::write(
        state.join("projects.json"),
        serde_json::to_vec(
            &json!({"schemaVersion":2,"activeProjectId":project["id"],"projects":[project]}),
        )
        .unwrap(),
    )
    .unwrap();
}

#[test]
fn owned_project_child() {
    let Some(root) = std::env::var_os("KNOWNEXT_SHARED_PROJECT_FIXTURE") else {
        return;
    };
    let root = std::path::PathBuf::from(root);
    let state =
        std::path::PathBuf::from(std::env::var_os("KNOWNEXT_SHARED_STATE_FIXTURE").unwrap());
    let service = api(&state);
    let result = service.handle(
        "POST",
        "/api/projects",
        json!({"name":"Own child","folderPath":root,"versioningMode":"none","syncMode":"none"}),
        vec![],
    );
    if std::env::var_os("KNOWNEXT_SHARED_MODE").as_deref() == Some(std::ffi::OsStr::new("blocked"))
    {
        assert!(result.unwrap_err().contains("Otra instancia o perfil"));
        return;
    }
    assert!(result.is_ok());
    fs::write(state.join("ready"), b"owned").unwrap();
    std::thread::sleep(Duration::from_secs(15));
}

#[test]
fn shared_folder_rejects_another_profile_but_same_profile_services_and_clones_share_the_lease() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().join("source");
    let a = temp.path().join("profile-a");
    let b = temp.path().join("profile-b");
    let first = api(&a);
    let project = create(&first, &root);
    let id = project["id"].as_str().unwrap();
    fs::write(root.join("Original.md"), b"# Preserve source\n").unwrap();
    register(&b, &project);
    let second = api(&b);
    assert!(second
        .handle("GET", "/api/projects", Value::Null, vec![])
        .is_ok());
    assert!(second
        .handle(
            "GET",
            &format!("/api/projects/{id}/tree"),
            Value::Null,
            vec![]
        )
        .unwrap_err()
        .contains("Otra instancia o perfil"));
    let denied_write = second.handle(
        "PUT", &format!("/api/documents/{id}::Original.md"),
        json!({"force":true,"markdown":"unconfirmed overwrite"}), vec![],
    );
    assert!(denied_write.is_err() || denied_write.unwrap().status >= 400);
    assert_eq!(
        fs::read(root.join("Original.md")).unwrap(),
        b"# Preserve source\n"
    );
    let same = api(&a);
    assert!(same
        .handle(
            "GET",
            &format!("/api/projects/{id}/tree"),
            Value::Null,
            vec![]
        )
        .is_ok());
    let clone = first.clone();
    drop(first);
    drop(same);
    assert!(second
        .handle(
            "GET",
            &format!("/api/projects/{id}/tree"),
            Value::Null,
            vec![]
        )
        .is_err());
    drop(clone);
    let tree = second
        .handle(
            "GET",
            &format!("/api/projects/{id}/tree"),
            Value::Null,
            vec![],
        )
        .unwrap();
    assert!(!tree.body.to_string().contains("knownext-runtime"));
    let denied = second.handle(
        "GET",
        &format!("/api/documents/{id}::.knownext-runtime/owner.lock"),
        Value::Null,
        vec![],
    );
    assert!(denied.is_err() || denied.unwrap().status >= 400);
    assert!(second
        .handle(
            "POST",
            &format!("/api/projects/{id}/folders"),
            json!({"name":".knownext-runtime"}),
            vec![]
        )
        .is_err());
    assert_eq!(
        fs::metadata(root.join(".knownext-runtime/owner.lock"))
            .unwrap()
            .len(),
        0
    );
    let status = Command::new("git")
        .args(["-C"])
        .arg(&root)
        .arg("init")
        .output()
        .unwrap();
    assert!(status.status.success());
    let status = Command::new("git")
        .arg("-C")
        .arg(&root)
        .args(["status", "--porcelain", "--untracked-files=all"])
        .output()
        .unwrap();
    assert!(status.status.success());
    assert!(!String::from_utf8_lossy(&status.stdout).contains("knownext-runtime"));
}

#[test]
fn another_process_is_excluded_and_forced_exit_releases_the_stable_inode() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().join("source");
    let state = temp.path().join("parent");
    let child_state = temp.path().join("child");
    let first = api(&state);
    let project = create(&first, &root);
    let id = project["id"].as_str().unwrap();
    let exe = std::env::current_exe().unwrap();
    let mut command = Command::new(&exe);
    command
        .args(["--exact", "owned_project_child", "--nocapture"])
        .env("KNOWNEXT_SHARED_PROJECT_FIXTURE", &root)
        .env("KNOWNEXT_SHARED_STATE_FIXTURE", &child_state)
        .env("KNOWNEXT_SHARED_MODE", "blocked");
    assert!(command.status().unwrap().success());
    drop(first);
    let mut child = command.env("KNOWNEXT_SHARED_MODE", "hold").spawn().unwrap();
    let start = Instant::now();
    while !child_state.join("ready").exists() && start.elapsed() < Duration::from_secs(8) {
        std::thread::sleep(Duration::from_millis(25));
    }
    if !child_state.join("ready").exists() {
        let _ = child.kill();
        let _ = child.wait();
        panic!("Owned child did not acquire project");
    }
    let next = api(&state);
    let blocked = next
        .handle(
            "GET",
            &format!("/api/projects/{id}/tree"),
            Value::Null,
            vec![],
        )
        .is_err();
    child.kill().unwrap();
    child.wait().unwrap();
    assert!(blocked);
    assert!(next
        .handle(
            "GET",
            &format!("/api/projects/{id}/tree"),
            Value::Null,
            vec![]
        )
        .is_ok());
    assert!(root.join(".knownext-runtime/owner.lock").exists());
}

#[test]
fn unknown_coordination_and_missing_registered_roots_are_preserved() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().join("source");
    fs::create_dir_all(root.join(".knownext-runtime")).unwrap();
    let unknown = b"owned unknown data";
    fs::write(root.join(".knownext-runtime/.gitignore"), unknown).unwrap();
    let service = api(&temp.path().join("state"));
    assert!(service
        .handle(
            "POST",
            "/api/projects",
            json!({"name":"Owned","folderPath":root,"versioningMode":"none"}),
            vec![]
        )
        .is_err());
    assert_eq!(
        fs::read(root.join(".knownext-runtime/.gitignore")).unwrap(),
        unknown
    );
    assert!(!root.join(".knownext-runtime/owner.lock").exists());
    let missing = temp.path().join("absent");
    let state = temp.path().join("other");
    register(
        &state,
        &json!({"id":"owned-missing","name":"Missing","folderPath":missing}),
    );
    let service = api(&state);
    assert!(service
        .handle(
            "GET",
            "/api/projects/owned-missing/tree",
            Value::Null,
            vec![]
        )
        .is_err());
    assert!(!missing.exists());
}

#[test]
fn a_verified_private_root_accepts_its_platform_ancestor_alias_but_not_links_below_it_or_external_aliases(
) {
    let temp = tempfile::tempdir().unwrap();
    let actual = temp.path().join("actual");
    let alias = temp.path().join("platform-alias");
    fs::create_dir(&actual).unwrap();
    #[cfg(unix)]
    std::os::unix::fs::symlink(&actual, &alias).unwrap();
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let quoted = |path: &Path| format!("'{}'", path.to_string_lossy().replace('\'', "''"));
        let output=Command::new("powershell.exe").args(["-NoProfile","-NonInteractive","-Command"]).arg(format!("$ErrorActionPreference='Stop'; New-Item -ItemType Junction -Path {} -Value {} | Out-Null",quoted(&alias),quoted(&actual))).creation_flags(0x08000000).output().unwrap();
        assert!(output.status.success(), "Owned junction creation failed");
    }
    // The OS supplies an existing private root on Android. Create that root
    // through the real path so Windows junction setup has the same precondition.
    fs::create_dir_all(actual.join("state/projects")).unwrap();
    let state = alias.join("state");
    assert!(
        alias.is_dir(),
        "Owned platform alias is unavailable: {:?}",
        fs::read_link(&alias)
    );
    assert!(
        state.is_dir(),
        "Owned aliased private state must already exist"
    );
    let managed = state.join("projects/project-owned-alias");
    fs::create_dir(actual.join("state/projects/project-owned-alias")).unwrap();
    let created = json!({"id":"project-owned-alias","name":"Own managed alias","folderPath":managed,"versioningMode":"none","syncMode":"none"});
    register(&actual.join("state"), &created);
    let service = api(&state);
    let id = created["id"].as_str().unwrap();
    assert!(service
        .handle(
            "GET",
            &format!("/api/projects/{id}/tree"),
            Value::Null,
            vec![]
        )
        .is_ok());
    let external = alias.join("external-project");
    fs::create_dir(actual.join("external-project")).unwrap();
    fs::write(external.join("Preserve.md"), b"owned external source").unwrap();
    let registry_path = actual.join("state/projects.json");
    let mut registry: Value = serde_json::from_slice(&fs::read(&registry_path).unwrap()).unwrap();
    registry["projects"]
        .as_array_mut()
        .unwrap()
        .push(json!({"id":"project-owned-external","name":"External alias","folderPath":external}));
    fs::write(&registry_path, serde_json::to_vec(&registry).unwrap()).unwrap();
    assert!(service
        .handle(
            "GET",
            "/api/projects/project-owned-external/tree",
            Value::Null,
            vec![]
        )
        .unwrap_err()
        .contains("sin enlaces"));
    assert_eq!(
        fs::read(external.join("Preserve.md")).unwrap(),
        b"owned external source"
    );
    // The platform alias is above state. A link inside managed projects remains untrusted.
    let linked = state.join("projects/owned-linked");
    #[cfg(unix)]
    std::os::unix::fs::symlink(&external, &linked).unwrap();
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let quoted = |path: &Path| format!("'{}'", path.to_string_lossy().replace('\'', "''"));
        let output=Command::new("powershell.exe").args(["-NoProfile","-NonInteractive","-Command"]).arg(format!("$ErrorActionPreference='Stop'; New-Item -ItemType Junction -Path {} -Value {} | Out-Null",quoted(&actual.join("state/projects/owned-linked")),quoted(&actual.join("external-project")))).creation_flags(0x08000000).output().unwrap();
        assert!(output.status.success());
    }
    registry["projects"].as_array_mut().unwrap().push(
        json!({"id":"project-owned-linked","name":"Linked managed root","folderPath":linked}),
    );
    fs::write(&registry_path, serde_json::to_vec(&registry).unwrap()).unwrap();
    assert!(service
        .handle(
            "GET",
            "/api/projects/project-owned-linked/tree",
            Value::Null,
            vec![]
        )
        .unwrap_err()
        .contains("sin enlaces"));
    assert_eq!(
        fs::read(external.join("Preserve.md")).unwrap(),
        b"owned external source"
    );
    drop(service);
    #[cfg(windows)]
    {
        fs::remove_dir(actual.join("state/projects/owned-linked")).unwrap();
        fs::remove_dir(&alias).unwrap();
    }
    #[cfg(unix)]
    {
        fs::remove_file(&linked).unwrap();
        fs::remove_file(&alias).unwrap();
    }
}
