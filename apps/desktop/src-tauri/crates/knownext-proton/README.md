# Direct Proton service

This crate keeps the native SDK ABI and account persistence outside React and
outside the project tree. `Service::new(private_directory, absolute_library_path)`
loads the packaged in-process bridge and performs `bridge.info` schema validation.
Successful NativeAOT modules remain loaded until process exit.

Public operations: `status`, `start`, `poll(connection_id)`,
`cancel(connection_id)`, `disconnect(account_id)` and
`invoke(account_id, operation, payload)`. Supported provider calls are
`account.status`, `auth.refresh`, `drive.root`, `drive.list`,
`drive.events`, `drive.createFolder`, `drive.readFile`, and `drive.writeFile`.

`start` returns `ConnectionLaunch { status, sign_in_url }`. The caller opens the
URL through a native browser action and sends **only status** to the UI. The URL
contains an ephemeral authentication key and must not enter logs or UI state.
Session values are private to the Rust/native bridge boundary. SDK errors are
mapped to bounded product messages rather than exposing arbitrary provider text.

Accounts and pending login state are stored separately from GitHub/AI credentials.
Windows uses user-bound DPAPI. Android must initialise
`initialize_android_protector` with the same Keystore-backed byte transformation
used by the host. Other platforms fail closed; there is no plaintext fallback.

The protected `accounts.pending.json` journal preserves a rotated session if a
crash interrupts final publication. Reads select it only when its predecessor
matches the exact current encrypted store or the completed replacement. Reads do
not repeat provider effects. Unknown/corrupt predecessors are preserved and
reported. Writers use an in-process gate plus a private file lock; files,
directories, and ancestors reject symbolic links and Windows reparse points.

After a fork is consumed, returned credentials are persisted even if profile
hydration fails. Another poll resumes that session instead of consuming the fork
again. Account identity is checked before accepting a rotated session. Transient
failures retain credentials. Reads may retry once after durable token refresh;
writes require the project journal to inspect the result rather than replaying
blindly. Disconnect is local credential removal, not remote revocation. The host
must check affected project bindings before allowing account removal.

Run focused checks with `cargo test -p knownext-proton --offline`. The example
`native_probe` loads the actual bridge and calls only `bridge.info`, with no
authentication or provider request. Tests use synthetic sessions; one Windows
test uses actual DPAPI. These checks do not certify real login, key hydration,
Android runtime protection or cross-device transfer.

Android packages must include adjacent libcrypto.so and libssl.so in addition to
libproton_crypto.so and libknownext_proton.so. The loader preloads packaged OpenSSL
by absolute path, retains the handles, and selects the OS certificate directory
(/apex/com.android.conscrypt/cacerts, otherwise /system/etc/security/cacerts)
before the first managed request. There is no PATH/LD_LIBRARY_PATH change or TLS
validation bypass. The host still owns permission and supported Android API checks.

Status never waits on the provider/writer gate: it reads an atomic encrypted
snapshot with at most one local retry if state and recovery journal publication
cross the read. It does not renew tokens, repeat an operation, or acquire the
mutation file lock.
