use super::*;
use std::{collections::VecDeque, fs};
struct FakeBridge(Mutex<VecDeque<Value>>);
impl Bridge for FakeBridge {
    fn request(&self, _: &Value) -> Result<Value> {
        self.0
            .lock()
            .unwrap()
            .pop_front()
            .ok_or_else(|| Error::new("unexpected-call"))
    }
}
struct TestProtector;
impl vault::Protector for TestProtector {
    fn name(&self) -> &str {
        "test-only-protected"
    }
    fn transform(&self, b: &[u8], _: bool) -> Result<Vec<u8>> {
        Ok(b.iter().map(|v| v ^ 0xa5).collect())
    }
}
fn service(root: &std::path::Path, replies: Vec<Value>) -> Service {
    Service {
        directory: root.join("vault"),
        bridge: Ok(Arc::new(FakeBridge(Mutex::new(replies.into())))),
        protector: Arc::new(TestProtector),
    }
}
fn start() -> Value {
    json!({"ok":true,"session":{"kind":"pending","selector":"synthetic-selector","encryptionKey":"synthetic-key"},"result":{"state":"waiting","signInUrl":"https://account.proton.me/desktop/login?app=drive#payload=synthetic-sensitive","expiresAt":"2026-11-06T18:00:00Z"}})
}
fn connected() -> Value {
    json!({"ok":true,"session":{"kind":"connected","userId":"account-a","accessToken":"synthetic-access","refreshToken":"synthetic-refresh","keyPassword":"synthetic-key-password"},"result":{"state":"connected","accountId":"account-a","label":"Test Account"}})
}
fn connect(s: &Service) -> String {
    let launch = s.start().unwrap();
    let id = launch.status["attempt"]["connectionId"]
        .as_str()
        .unwrap()
        .to_owned();
    s.poll(&id).unwrap();
    id
}

#[test]
fn connection_survives_reopening_without_exposing_secrets() {
    let d = tempfile::tempdir().unwrap();
    let s = service(d.path(), vec![start(), connected()]);
    connect(&s);
    let stored = fs::read_to_string(s.path()).unwrap();
    for secret in [
        "synthetic-access",
        "synthetic-refresh",
        "synthetic-key-password",
        "synthetic-selector",
    ] {
        assert!(!stored.contains(secret));
    }
    let reopened = service(
        d.path(),
        vec![json!({"ok":true,"result":{"nodeId":"root"}})],
    );
    let status = reopened.status().unwrap();
    assert_eq!(status["account"]["state"], "connected");
    let public = serde_json::to_string(&status).unwrap();
    assert!(!public.contains("synthetic"));
    assert!(!public.contains("signInUrl"));
    assert_eq!(
        reopened
            .invoke("account-a", "drive.root", json!({}))
            .unwrap()["nodeId"],
        "root"
    );
}
#[test]
fn transient_failure_preserves_session_and_revocation_marks_only_affected_account() {
    let d = tempfile::tempdir().unwrap();
    let s = service(
        d.path(),
        vec![
            start(),
            connected(),
            json!({"ok":false,"error":{"code":"network","retryable":true,"message":"NEVER EXPOSE SDK SECRET"}}),
            json!({"ok":false,"error":{"code":"session-revoked"}}),
        ],
    );
    connect(&s);
    let before = fs::read(s.path()).unwrap();
    let error = s.invoke("account-a", "drive.root", json!({})).unwrap_err();
    assert!(error.retryable);
    assert!(!error.to_string().contains("SECRET"));
    assert_eq!(fs::read(s.path()).unwrap(), before);
    assert_eq!(
        s.invoke("account-a", "drive.root", json!({}))
            .unwrap_err()
            .code,
        "session-revoked"
    );
    assert_eq!(s.status().unwrap()["account"]["state"], "needs-reconnect");
}
#[test]
fn stale_attempt_cannot_cancel_new_attempt_and_cancel_preserves_connected_account() {
    let d = tempfile::tempdir().unwrap();
    let s = service(
        d.path(),
        vec![
            start(),
            connected(),
            json!({"ok":true,"session":{"kind":"pending","selector":"other"},"result":{"signInUrl":"https://account.proton.me/desktop/login?app=drive#payload=other"}}),
        ],
    );
    let old = connect(&s);
    let launch = s.start().unwrap();
    let id = launch.status["attempt"]["connectionId"].as_str().unwrap();
    assert_eq!(s.cancel(&old).unwrap_err().code, "attempt-changed");
    let status = s.cancel(id).unwrap();
    assert_eq!(status["attempt"]["state"], "cancelled");
    assert_eq!(status["account"]["state"], "connected");
}
#[test]
fn refresh_is_durable_and_does_not_blindly_replay_a_write() {
    let d = tempfile::tempdir().unwrap();
    let mut refreshed = connected();
    refreshed["session"]["accessToken"] = json!("rotated");
    let s = service(
        d.path(),
        vec![
            start(),
            connected(),
            json!({"ok":false,"error":{"code":"session-expired"}}),
            refreshed,
        ],
    );
    connect(&s);
    assert_eq!(
        s.invoke("account-a", "drive.writeFile", json!({"name":"snapshot"}))
            .unwrap_err()
            .code,
        "operation-needs-review"
    );
    let state = s.load().unwrap();
    assert_eq!(
        state["accounts"]["account-a"]["session"]["accessToken"],
        "rotated"
    );
}
#[test]
fn corrupt_or_future_store_is_preserved_and_sdk_absence_is_honest() {
    let d = tempfile::tempdir().unwrap();
    let mut s = service(d.path(), vec![]);
    s.bridge = Err(Error::new("sdk-unavailable"));
    assert_eq!(s.status().unwrap()["available"], false);
    vault::directory(&s.directory).unwrap();
    fs::write(s.path(), b"broken").unwrap();
    assert!(s.status().is_err());
    assert_eq!(fs::read(s.path()).unwrap(), b"broken");
    fs::remove_file(s.path()).unwrap();
    let future = json!({"schemaVersion":42,"generation":0,"accounts":{}});
    vault::write(&s.path(), &future, s.protector.as_ref()).unwrap();
    let bytes = fs::read(s.path()).unwrap();
    assert!(s.start().is_err());
    assert_eq!(fs::read(s.path()).unwrap(), bytes);
}
#[test]
fn consumed_fork_is_persisted_before_profile_failure_and_resumed_after_reopen() {
    let d = tempfile::tempdir().unwrap();
    let mut pending = connected();
    pending["ok"] = json!(false);
    pending["result"] = Value::Null;
    pending["error"] = json!({"code":"network","retryable":true});
    let s = service(d.path(), vec![start(), pending]);
    let launch = s.start().unwrap();
    let id = launch.status["attempt"]["connectionId"].as_str().unwrap();
    assert!(s.poll(id).unwrap_err().retryable);
    assert_eq!(s.load().unwrap()["attempt"]["session"]["kind"], "connected");
    let reopened = service(d.path(), vec![connected()]);
    assert_eq!(reopened.poll(id).unwrap()["account"]["id"], "account-a");
}
#[test]
fn encrypted_pending_journal_recovers_rotation_but_never_replaces_an_unknown_predecessor() {
    let d = tempfile::tempdir().unwrap();
    let s = service(d.path(), vec![start(), connected()]);
    connect(&s);
    let previous = fs::read(s.path()).unwrap();
    let mut next = s.load().unwrap();
    next["accounts"]["account-a"]["session"]["accessToken"] = json!("rotated-after-response");
    vault::write(&s.path(), &next, s.protector.as_ref()).unwrap();
    let published: Value = serde_json::from_slice(&fs::read(s.path()).unwrap()).unwrap();
    let journal = json!({"format":"knownext-proton-pending","version":1,"previousHash":format!("{:x}",Sha256::digest(&previous)),"envelope":published});
    fs::write(s.path(), previous).unwrap();
    fs::write(
        s.directory.join("accounts.pending.json"),
        serde_json::to_vec(&journal).unwrap(),
    )
    .unwrap();
    assert_eq!(
        s.load().unwrap()["accounts"]["account-a"]["session"]["accessToken"],
        "rotated-after-response"
    );
    assert!(
        !fs::read_to_string(s.directory.join("accounts.pending.json"))
            .unwrap()
            .contains("rotated-after-response")
    );
    fs::write(s.path(), b"unexpected external replacement").unwrap();
    assert_eq!(s.load().unwrap_err().code, "store-changed");
}
#[test]
fn a_rotated_session_cannot_switch_account_identity() {
    let d = tempfile::tempdir().unwrap();
    let mut wrong = connected();
    wrong["session"]["userId"] = json!("another-account");
    let s = service(d.path(), vec![start(), connected(), wrong]);
    connect(&s);
    let bytes = fs::read(s.path()).unwrap();
    assert_eq!(
        s.invoke("account-a", "drive.root", json!({}))
            .unwrap_err()
            .code,
        "sdk-response-invalid"
    );
    assert_eq!(fs::read(s.path()).unwrap(), bytes);
}

#[test]
fn event_cursor_reads_can_refresh_and_retry_without_replaying_writes() {
    let d = tempfile::tempdir().unwrap();
    let mut refreshed = connected();
    refreshed["session"]["accessToken"] = json!("events-rotated");
    let s = service(
        d.path(),
        vec![
            start(),
            connected(),
            json!({"ok":false,"error":{"code":"session-expired"}}),
            refreshed,
            json!({"ok":true,"result":{"cursor":"next","items":[],"complete":true}}),
        ],
    );
    connect(&s);
    let result = s
        .invoke("account-a", "drive.events", json!({"cursor":"previous"}))
        .unwrap();
    assert_eq!(result["cursor"], "next");
    assert_eq!(
        s.load().unwrap()["accounts"]["account-a"]["session"]["accessToken"],
        "events-rotated"
    );
}
#[test]
fn status_does_not_wait_for_a_provider_call_holding_the_writer_gate() {
    use std::sync::mpsc;
    use std::time::Duration;
    struct BlockedBridge {
        entered: mpsc::SyncSender<()>,
        release: Mutex<mpsc::Receiver<()>>,
    }
    impl Bridge for BlockedBridge {
        fn request(&self, _: &Value) -> Result<Value> {
            self.entered.send(()).unwrap();
            self.release.lock().unwrap().recv().unwrap();
            Ok(json!({"ok":true,"result":{"nodeId":"root"}}))
        }
    }
    let d = tempfile::tempdir().unwrap();
    let mut s = service(d.path(), vec![start(), connected()]);
    connect(&s);
    let (entered_tx, entered_rx) = mpsc::sync_channel(1);
    let (release_tx, release_rx) = mpsc::sync_channel(1);
    s.bridge = Ok(Arc::new(BlockedBridge {
        entered: entered_tx,
        release: Mutex::new(release_rx),
    }));
    let s = Arc::new(s);
    let writer_service = s.clone();
    let writer = std::thread::spawn(move || {
        writer_service.invoke("account-a", "drive.root", json!({}))
    });
    entered_rx.recv_timeout(Duration::from_secs(3)).unwrap();
    let (status_tx, status_rx) = mpsc::sync_channel(1);
    let status_service = s.clone();
    let reader = std::thread::spawn(move || {
        status_tx.send(status_service.status()).unwrap();
    });
    let snapshot = status_rx.recv_timeout(Duration::from_secs(1));
    // Always release/join before assertions, so a regression cannot strand the
    // gate or poison unrelated tests after the timeout.
    release_tx.send(()).unwrap();
    writer.join().unwrap().unwrap();
    reader.join().unwrap();
    let snapshot = snapshot.expect("status waited for the provider request").unwrap();
    assert_eq!(snapshot["account"]["state"], "connected");
}
#[cfg(windows)]
#[test]
fn windows_dpapi_round_trip_rejects_corrupt_ciphertext() {
    let d = tempfile::tempdir().unwrap();
    let mut s = service(d.path(), vec![start(), connected()]);
    s.protector = Arc::new(vault::NativeProtector);
    connect(&s);
    let status = s.status().unwrap();
    assert_eq!(status["account"]["id"], "account-a");
    let bytes = fs::read(s.path()).unwrap();
    assert!(!String::from_utf8_lossy(&bytes).contains("synthetic-access"));
    let mut envelope: Value = serde_json::from_slice(&bytes).unwrap();
    envelope["payload"] = json!("AAAA");
    fs::write(s.path(), serde_json::to_vec(&envelope).unwrap()).unwrap();
    assert!(s.status().is_err());
}
