# Data Management And Clean Distribution

KnowNext.ai packages must contain application code, static UI assets, native runtime files, and bundled backend binaries only. They must never contain user projects, Markdown documents, drafts, logs, notes, credentials, API keys, generated AI assets, caches, or development seed data.

## Product Invariants

- A clean installation starts with no projects.
- A clean installation must not show `Proyecto Alpha`, `Proyecto Beta`, `Proyecto Gamma`, sample documents, mock users, or stale tabs.
- Updating an existing installation must preserve the data that belongs to the same app identity, runtime profile, and native storage location.
- Uninstalling and reinstalling follows the platform default. Windows may leave per-user app data unless the user removes it; Android clears app app-specific data on uninstall.
- Runtime profiles are isolated. `desktop`, `web-dev`, `mobile`, and future mobile-native profiles must not import data from each other.
- Desktop legacy recovery is allowed only for `KNOWNEXT_RUNTIME_PROFILE=desktop`, where it is used to migrate older Windows data locations into the Tauri app data directory.
- Mobile and web development profiles must not recover legacy desktop projects, config, credentials, or notes.

## Windows Installed App

The installed Windows Tauri app starts a bundled FastAPI sidecar with:

- `KNOWNEXT_RUNTIME_PROFILE=desktop`
- `KNOWNEXT_MANAGED_BY=tauri`
- `KNOWNEXT_APP_DATA_DIR=<Tauri appDataDir>`

The backend writes product state under the Tauri app data directory, currently `%APPDATA%/ai.knownext.desktop` for the configured app identity. Installer updates replace program files and keep this directory intact, so project metadata, config, credentials, drafts, logs, notes, and managed project folders survive an update.

The package itself must not include files from that app data directory. Release checks should inspect installers and generated application resources for `projects.json`, `credentials.json`, `notes.json`, `drafts/`, `logs/`, `ai-conversations/`, and any `sk-` style OpenAI key.

## Android App

The current Android package is a native Tauri APK/AAB with the React frontend only. It does not bundle Python/FastAPI, local Git, or a local project filesystem backend.

Android app-local state is limited to frontend runtime preferences such as the configured backend endpoint in WebView storage. Product data lives in the selected compatible FastAPI backend. A shareable Android package should normally be built without `VITE_API_BASE_URL`; first startup then shows the backend connection screen and no workspace data is loaded until the endpoint passes `/health`.

Android updates installed over the same package preserve WebView app storage, so the saved endpoint is retained. Backend data is preserved by the backend storage policy, not by the APK.

Future offline Android storage must use Android-native app-specific storage or a documented Android file access flow, such as the Storage Access Framework. It must be introduced as a separate mobile-native runtime profile and must not reuse or migrate desktop `%APPDATA%` locations automatically.

## Development Backends

`pnpm backend:web` and `pnpm backend:mobile` are development helpers. They intentionally use isolated directories under the developer machine's app data area and can therefore retain projects across test runs. Seeing projects after connecting Android to a development backend means the backend already had data; it must not be interpreted as APK-bundled product state.

For clean Android acceptance, run the mobile backend with a disposable `KNOWNEXT_APP_DATA_DIR` or delete the development backend data directory before testing. For product sharing, build the APK without an embedded endpoint and verify startup reaches the connection screen first.
