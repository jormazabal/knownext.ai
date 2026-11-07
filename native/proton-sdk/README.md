# Proton SDK native bridge

KnowNext's in-process provider adapter. C# calls the official Drive and Account SDK;
the application process remains Rust/Tauri. No service, CLI or user-installed .NET
runtime. This directory contains only KnowNext adapter code and build recipes.

Sources used: ProtonDriveApps/sdk commit
`05c9115955589d9f6ab7392a36f8f0cb39327133`, Account sources from the same revision,
ProtonDriveApps/dotnet-crypto commit
`fc2c10881e6fb44fc8a181c8db99cba73d06dfdb`. The public crypto package was unavailable;
the experiment builds the wrapper from source as explicit local `0.40.1-p0`.
That name does not claim equivalence to Proton's unpublished `0.40.1` package.
Both pinned repositories carry MIT notices, which are included with the native
resources. The SDK's service-usage guidelines and beta status are separate from
the source license: see the pinned SDK README before enabling a public channel.
KnowNext does not claim Proton endorsement or an official Proton binary package.

## Contract

UTF-8 JSON, schema version1, cdecl functions:

- `knownext_proton_request(const uint8_t*, size_t) -> uint8_t*`
- `knownext_proton_response_length(uint8_t*) -> size_t`
- `knownext_proton_free(uint8_t*)`

The Rust host owns the input and must release every response exactly once.
Responses contain secrets; the response buffer is zeroed on free. Rust must persist
the returned `session` before returning success **or error** to the UI: the browser
fork is one-use and a refresh token may already have rotated. Never log request or
response JSON. Run the blocking ABI on a worker, never the UI thread. Serialize by
account to avoid competing refresh operations. NativeAOT library unloading is not
supported: keep library/dependency handles for the entire process lifetime.

Request: `{operation, session?, payload?}`. Response:
`{ok, result?, session?, error?:{code,message,retryable}}`.

Public operations to expose through a typed Rust service:

- `auth.start`: returns `{state:"waiting",signInUrl,expiresAt}` and pending secret
  state. Open only the official HTTPS account URL in the system browser.
- `auth.poll`: waiting or connected. If profile hydration fails after consuming the
  fork, the error carries the acquired session. Retry with that session, not the old
  fork selector. Never infer complete account setup solely from session.kind.
- `auth.refresh`, `account.status`: session refresh/status; no passwords accepted.
- `drive.root` returns a node `{id,nodeId,name,type}`.
- `drive.events` payload `{cursor?}` returns `{cursor,changed,requiresRefresh}` using
  real SDK events for MyFiles' event scope. A null cursor captures the server's
  current cursor and requires the initial inventory. Capture it before the initial
  inventory; only advance the persisted cursor after applying the corresponding
  inventory/publications. Continuity loss requires a full safe re-inventory.
- `drive.list` payload `{parentId}` returns `{items,complete:true}` (max10000).
- `drive.createFolder` payload `{parentId,name}`; reuses exactly one matching folder.
- `drive.readFile` payload `{nodeId}` returns `{contentBase64}` (max64MiB).
- `drive.writeFile` payload `{parentId,name,contentBase64,mediaType?}` creates only;
  an existing name is accepted only if verified content is identical. A conflicting
  or ambiguous name blocks, never overwrites. Sender publication identity and
  journal/idempotence remain Rust business rules; listing then writing is not CAS.

Private ABI-only `bridge.info` and `diagnostics.crypto` are QA probes. Do not expose
them through generic frontend invocation. Crypto diagnostics export the public SRP
verification key, exercise AES-GCM roundtrip/tag rejection and an in-memory cache;
no network/account data.

The native account uses only the server-reported primary active user key. Its secret
comes from the official encrypted browser fork. Password mode is unobserved (`0`),
not a fabricated single-password assertion; it is not re-derived through SRP login.
Old inactive keys are not assigned the secret blindly. Real account/multi-key
acceptance must verify this path before claiming complete functionality.

## Build

Release preparation is independent of the ignored QA/output source trees:

1. Select .NET SDK **10.0.403**, Rust **1.95.0**, Node22 and PowerShell7. Windows
   also needs the MSVC C++/Windows SDK toolchain supplied by the release runner.
2. `prepare-sources.ps1 -WorkDirectory <cache> -Dotnet dotnet` fetches and verifies
   the two full Git revisions in `pins.json`, refuses modified vendor sources,
   installs the reviewed `crypto.Cargo.lock`, and builds only the source C# crypto
   package. Its `sources.json` supplies the paths to both platform preparations.
   A private `global.json` selects the exact .NET SDK. `-FetchOnly` skips packing.
3. `prepare-restore.ps1 -SourcesReceipt <cache>/sources.json -Runtime <RID>` copies
   the checked-in NuGet version/hash graphs to private build locations. The sole
   replaced hash is the freshly compiled local crypto package, whose ZIP timestamps
   may differ; external package hashes and versions are never refreshed. Restore
   must use `--locked-mode`, the returned NuGet config and
   `NUGET_PACKAGES=sources.nugetPackagesDirectory` from the cache working directory.
4. Windows uses `scripts/prepare-proton-windows.ps1 [-WriteGitHubEnvironment]`.
   This builds the native Rust crypto with **static CRT**, publishes NativeAOT,
   validates PE imports/exports and runs the existing **offline** ABI/AES/cache
   probe. It stages only `knownext_proton.dll`, `proton_crypto.dll`,
   `THIRD-PARTY-NOTICES.txt` and `provenance.json`. No account or cloud call occurs.
5. The Windows resource guard and explicit HKCU-keyed WiX component require those
   four files at the installed `resources/proton/windows/` path used by the app.
   Its component GUID is stable per existing upgrade family; public identity,
   UpgradeCode, updater keys and user data locations are unchanged.

The bootstrap uses ordinary ignored `target/proton-sdk` intermediates. Source
commits, the Rust lock and per-RID NuGet locks are versioned here. Build outputs
remain untracked. `build.ps1 -RestoreOnly` validates the locked graph without a
native compilation; the ordinary build restores locked then publishes without a
second restore. No PATH/system configuration changes persist outside the process.
Windows publishes `knownext_proton.dll`.
Android cross-publish from Windows is possible with NDK28.2's clang and NativeAOT
runtime packs: RID `linux-bionic-arm64` or `linux-bionic-x64`, API29 linker target,
`DisableUnsupportedError=true`, `PublishAotUsingRuntimePack=true`, no stripping during
the experiment. Android library is `libknownext_proton.so`; guards must preserve
KnowNext's existing minimum and load the optional feature only on supported devices.

Crypto dependency must be the matching native source build: `proton_crypto.dll` or
`libproton_crypto.so`. SDK cache in this bridge is **InMemoryCacheRepository**; it
does not create a SQLite database. Network operations on Android also require the
platform/SDK OpenSSL runtime dependencies: `libcrypto.so` then `libssl.so`, preloaded
from the same package namespace (RTLD_NOW|RTLD_GLOBAL on Android), before the Proton
libraries. Use a real existing Android CA directory in SSL_CERT_DIR before first
HTTPS (`/apex/com.android.conscrypt/cacerts`, fallback `/system/etc/security/cacerts`).
Never disable certificate validation. Anonymous auth.start, native AES-GCM, SRP and
memory cache passed in the dedicated API36/x86_64 emulator with those dependencies.
The QA OpenSSL binaries originated from the P0 AAR; public release preparation
must instead use Android's separately pinned source build and corresponding
Apache/OpenSSL notices. Do not distribute the AAR SDK/classes as MIT components.
Do not mistake loading/diagnostics for authentication or successful cloud transfer.

`write-notices.mjs` includes the original SDK/crypto notices and the licenses of
the resolved Rust/NuGet/runtime packages, with a machine-readable inventory. A
copyleft dependency triggers an explicit distribution review rather than a false
MIT-only claim. `source-bundle.ps1` includes the exact upstream Git archives,
adapter/build recipes and locks, plus the registry `.crate` corresponding sources.
Windows emits `output/knownext-proton-sources-windows.zip` for an extra release
asset; it contains no account state, signing credentials or developer environment.

`probe.ps1 -Library <path>` checks loaded Windows ABI without network. It is not a
complete product campaign. Compilation, resource integrity, signed installers,
clean-device acceptance, account acceptance and service-distribution eligibility
remain separate delivery facts. Historical QA evidence is preserved in `output/`.
