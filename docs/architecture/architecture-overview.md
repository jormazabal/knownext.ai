# Architecture Overview

KnowNext.ai 2.0.4 is a local-first Tauri v2 product with a React frontend and a Rust runtime. Windows and Android use the same product contracts through Tauri commands; neither platform connects to a separate product service.

```text
Tauri v2 shell
  React UI
    feature components
    apps/desktop/src/lib/api command adapter
  Rust command handlers
    knownext-core
    knownext-storage
    knownext-docs
    knownext-ai
```

## Data Flow

1. React components call `apps/desktop/src/lib/api/*`.
2. The API layer invokes Tauri commands such as `local_api_request` and `local_api_content`.
3. Tauri command handlers stay thin and delegate to Rust crates.
4. Rust services read/write local project files, runtime JSON state, notes, drafts, exports, previews, AI context, and version metadata.
5. Results return as structured JSON or binary payloads to the API layer.
6. React renders explicit loading, empty, unavailable, conflict, and error states.

The product must not silently fall back to frontend mock data. Test fixtures and development-only service doubles may exist, but they must be opt-in and visibly non-production when used.

## Boundaries

- React owns UI and local interaction state.
- `apps/desktop/src/lib/api` owns the frontend contract boundary.
- Rust crates own document persistence, project operations, exports, previews, Git/versioning orchestration, AI orchestration, and runtime diagnostics.
- Tauri owns native shell behavior, command registration, file dialogs, updater integration, Android bridge behavior, and OS-level permissions.

## Runtime Contract

The local runtime exposes a health contract through the Tauri command adapter. The API base is represented as `tauri://local-api` so frontend code keeps a stable request abstraction without HTTP.

The health payload includes:

- `app=knownext`
- `schemaVersion`
- `status`
- `service`
- `version`
- `profile`
- `endpoint`
- `instanceId`
- `startedAt`
- `managedBy`
- `appDataDir`

## No Separate Runtime Server

KnowNext.ai 2.0.4 does not include a separate product server, packaged auxiliary process, mobile endpoint discovery path, or compatibility mode for those paths. Any future external sync or AI provider traffic must be mediated by Rust/Tauri services.

## SC01: direct Proton integration; authenticated Windows/Android QA

Current uncommitted code still includes knownext-sync-folder and
knownext-storage::proton_sync with manual Windows folder exchange. This is
historical implementation, not the requested authenticated Proton connector.
Subsequent implementation retires new folder bindings/publication/application routes and removes folder onboarding from CloudSyncDialog; legacy data remains readable.

Implemented target: official SDK integration on Windows and Android, persistent per-device
sessions and Rust/Tauri-managed synchronization. React presents state and intent.
No external Proton app, bundled CLI, sidecar, product server or live .git replica.
The in-process bridge is native/proton-sdk (NativeAOT and source-built official
crypto); knownext-proton owns its JSON ABI, native loading, encrypted account
vault and recovery journal. React receives public status only. Browser fork URLs,
tokens and account key passphrases never pass through the WebView.

P1 retires folder onboarding and recovers/migrates bindings, outbox and partial
receipts without deleting documents or mistaking local handoff for cloud receipt.
Reuse compatible immutable-content/causal rules; CFAPI does not establish SDK support.
Credential migration preserves GitHub/AI secrets under DPAPI/Keystore.
Session persistence does not guarantee execution after process termination.

See [current SC01 plan](../product/revision-3.0-implementacion/sincronizacion-alternativa/plan.md)
and [acceptance](../product/revision-3.0-implementacion/sincronizacion-alternativa/tarea.md).
Windows and Android x64 emulator ABI, SRP, AES-GCM and anonymous HTTPS login
initiation have passed. The common bridge uses memory cache, not the earlier
experimental SQLite path. Android additionally preloads packaged OpenSSL and
uses system CA directories with TLS verification enabled. API29+ and 64-bit
libraries are required for this capability; the app minimum stays API24.

knownext-storage::proton_direct owns bindings, capture, immutable objects and
publication descriptors, verified ancestry, conflict choices and durable
receive/publish attempts. Source content stays in ordinary local project files;
private copies and state live under appData/proton-direct/<projectHash>, account
secrets under appData/proton-accounts. Both are excluded from Android cloud and
device-transfer backups. Credentials use Windows DPAPI or Android Keystore;
accounts.pending.json is encrypted and recovers token rotation before replacing
accounts.json. No plaintext fallback is permitted.

proton_sync_runtime schedules open-app work, with bounded retries and provider
events; it participates in restart/exit admission. No execution is promised
after process termination. Local save markers require no provider request.
Network work stays outside the global editor mutex; pause/status use independent
admission. Receipt applies only verified cached content under a short project
transaction, with original bytes preserved and an element journal. Lost write
acknowledgements are recognized by content, never by blind replay. Reviewed
local resolutions invalidate the old publication stamp; proven own ancestors
avoid false conflicts on sequential return edits. Observed descriptor fingerprints
are checked before reusing causal evidence. Status rechecks the local snapshot
before asserting a previous remote acknowledgement; this conservative operation
can be expensive on large projects and awaits performance acceptance.

Windows QA compiles and opens with a separate identifier. Kotlin host integration
compiles; the full x86_64 Android QA APK has passed startup, project preservation,
native SDK/browser initiation and encrypted pending-attempt recovery after process
death. Android's app mount namespace aliases /data/user/0 to /data/data: Proton
uses the canonical OS sandbox after validating its boundary, and resolves an owned
project only after existing descendant/ownership guards. User links remain rejected.
Retired folder state is queried only for an existing legacy binding.
Authenticated Windows↔Android transfer and connected-session reopen have passed
on isolated Windows QA and the owned API36 x86_64 emulator. Android received the
two Windows synthetic files and published its third file; bytes and SHA256 match
on both devices. Windows received that file automatically. Android was then
force-stopped while idle, reopened with its account/binding intact, and completed
one further authenticated SDK sync without another login. The first Android sync
exceeded the UI wait and returned 504/Result pending; querying recovered the final
acknowledgement without replay. This is not interruption-during-write acceptance.
Avance05 implements local retention/cleanup and recoverable provider/account
migration in `proton_direct/lifecycle.rs`; focused and installed acceptance are
tracked separately below. No release is authorized.

The final frontend invalidates the active workspace after manual Proton sync or
conflict resolution, including uncertain acknowledgements after partial writes.
It reuses tree/document guards and preserves drafts. The existing 60-second tree
check now also covers local projects without Git; the Android installed APK has
demonstrated an external synthetic file appearing without reopening the project.

Windows authenticated acceptance: browser authorization, protected account reused
after app restart, managed synthetic project publication, one explicit provider
refresh and fresh-service root access succeeded. Independent SDK readback of both
managed blobs matched the source sizes and SHA256. This does not establish
Android token-expiry renewal or a literal 24-hour waiting test. Final ARM64
and x86_64 QA APKs share the same frontend/runtime sources and verified native
libraries; physical ARM64 acceptance remains pending. Cross-device receipt is
demonstrated only for the synthetic corpus above, not every supported resource
family, large project or concurrent-edit scenario.

A final existing-file checkpoint changed only Android's synthetic third file
from 104 to 138 bytes using the QA app UID (not a Milkdown interaction). Windows
received the new SHA256 automatically, with its original two files unchanged.
The one Android sync again exceeded the UI wait; no manual replay was used.
See the redacted [Windows receipt](../../output/sc01-proton-p1/windows-candidate/cross-device-receipt.json).
The last Android UI observation still reported one pending operation. A direct
read-only runtime query also returned ready/pendingOperations=1/remoteConfirmed=false,
despite the completed byte transfer and an earlier local diagnostic showing no
dirty markers, receive/publish attempts or errors. This is not attributed solely
to stale UI. Cause remains unconfirmed; state/acknowledgement consistency remains
a P4 follow-up, not a final Android "up to date" observation for that edit.

### SC01 avance05: recoverable lifecycle

`proton_direct/lifecycle.rs` owns bounded private inventory, quota, reviewed
cleanup and migration. Cleanup protects bases, variants, unfinished attempts,
unknown material and archived authority; deletion requires another verified copy.
It never purges remote publications. Reviews/attempts survive restart, partial
cleanup can resume or cancel, and a bounded metadata history keeps 64 receipts.
The inventory fingerprint excludes its own administrative review writes.

Migration uses immutable destination preparation, source/destination rechecks and
a durable switching journal. `syncMigrationId` distinguishes an applied registry
change even when both providers use the same local sync mode. Remote work runs
outside the editor mutex; the final local switch shares registry authority and
uses fail-fast Proton admission. A crash after registry publication can complete
the binding while preserving subsequent edits as pending. Explicit local recovery
has narrower claims than verified migration. Documents and local Git remain in
place; no live `.git` is copied. GitHub uses the exact reviewed commit identity,
ordinary fast-forward upload and independent remote-head confirmation.

Directory removals require a demonstrated causal base and physical identity with
verifiable birth time. Only `remove_dir` on an empty directory is used. Unknown
identity/birth keeps the directory. Android uses the allowed raw statx syscall,
avoiding a new API30 libc symbol; the syscall was already present in the
[AOSP allowlist](https://android.googlesource.com/platform/bionic/+/ee7bc3002dc3127faac110167d28912eb0e86a20/libc/SECCOMP_WHITELIST_COMMON.TXT).
This is not physical-device acceptance of every Android filesystem.

Public routes add `/proton-direct/retention/{review,apply,cancel}` and
`/proton-direct/migration` plus reviewed start/cancel/ack operations. Query does
not replay a write. A completed transfer, verified destination and final local
binding switch remain separate facts. Relocation notices require review and do
not silently follow another account; old clients cannot be forcibly stopped.

Frontend status queries are bounded and deduplicated. A prior GET or remote
acknowledgement cannot replace the outcome of a newer write. Unknown accounting
returns `statusIssue`/`pendingUnknown`, never a fabricated operation count.
The old Android pending discrepancy was reproduced on P1: a single
`POST /sync/scan` created a durable content marker while all document hashes
remained unchanged. The generic mutation hook now classifies content writes
explicitly; status polling, selection and provider metadata cannot manufacture
work. Two focused contracts cover both readonly requests and real document
creation. Installed P2 acceptance remains separate from this source-level fix.
[Current report](../product/revision-3.0-implementacion/sincronizacion-alternativa/avance-05.md).

The final integration review broadened this correction: content markers use a
positive write-route list, not a growing list of readonly exceptions. External
change scans, preview creation/refresh, searches, review plans and private
metadata cannot create document work. Actual filesystem changes remain
detectable through independent snapshots, including edits outside the app.
Global materialization routes use their validated destination project or result
identity; structured AI results mark only operations actually applied at runtime.

Git migration also forces literal pathspec interpretation and removes inherited
glob/case pathspec options. NUL-delimited input protects argument separation but
does not by itself stop pattern expansion. The focused regression uses the
portable filename `[.]private`, verifies its exact inclusion/deletion and keeps
an unrelated staged `.private` outside both commits. This is a local Git test,
not acceptance of a live GitHub migration.

Final focused QA is recorded in [acceptance05](../../output/sc01-proton-p2/final/acceptance-05.json).
Windows and Android x64 retained their account, project data and association;
external scans and preview creation/refresh created no dirty markers. A real
temporary filesystem addition invalidated Windows confirmation and its verified
removal restored zero pending work. Lifecycle modules and frontend inputs were
unchanged by the last marker/Git fixes; their native retention, directory,
recovery and migration/return evidence is reused by input hashes. ARM64 package
signature/libraries are checked separately from physical-device acceptance.
