# Mobile Runtime

KnowNext.ai 2.0.1 can be packaged as a native Android app through Tauri v2. Android is an autonomous local app and uses Rust/Tauri command contracts for product state and operations.

## Scope

- Android uses the same React + TypeScript frontend as desktop.
- Android uses the same local API boundary under `apps/desktop/src/lib/api`.
- Tauri commands route requests into Rust services.
- Windows uses the signed Tauri updater. Android private APK builds use `android-latest.json` and the Android system installer.
- The Android package must not contain projects, documents, credentials, API keys, notes, drafts, logs, or development data.
- Android does not render the desktop title bar, app name, or minimize/maximize/close window controls.
- Android must let the native system reserve status and navigation bar areas unless a future edge-to-edge design explicitly handles safe-area insets across devices.
- Mobile shell decisions are device/runtime decisions, not just viewport-width decisions.

## Data Model

A clean Android installation starts with no projects unless the user creates or imports them. Product data is stored in Android app-local storage managed by Tauri/Rust. Android updates installed over the same package preserve app data when the package id and signing certificate remain unchanged.

Uninstalling follows Android defaults and clears app-specific data. The APK itself must never carry workspace data, credentials, generated AI assets, logs, or cached previews.

Android must work offline without a workstation app, LAN endpoint, or external product service running.

## Build Flow

Install the Android toolchain first:

- Android Studio with Android SDK Command-line Tools.
- Android NDK.
- `ANDROID_HOME` pointing at the SDK.
- `NDK_HOME` pointing at the installed NDK.
- Rust Android targets, or allow `tauri android init` to install them.

Initialize the generated Android project once:

```powershell
pnpm android:init
```

Run on a connected Android device or emulator:

```powershell
pnpm android:dev
```

Create Android build artifacts:

```powershell
pnpm android:build
```

Tauri writes APK and AAB artifacts under:

```text
apps/desktop/src-tauri/gen/android/app/build/outputs
```

For local debug APK copies:

```powershell
$env:KNOWNEXT_ANDROID_ABI="arm64"
pnpm android:build:debug
```

The debug helper writes:

```text
output/KnowNext.ai-android-<abi>-debug.apk
```

Do not put OpenAI credentials in `VITE_*` variables or Android build inputs. The debug build helper refuses `VITE_OPENAI*`, `VITE_*API_KEY*`, and `sk-...` values in the client bundle.

## Private APK Updates

Private Android distribution uses the visible `Buscar actualizaciones` action, but the implementation is Android-specific:

1. The app reads `https://github.com/jormazabal/knownext.ai/releases/latest/download/android-latest.json` unless `VITE_ANDROID_UPDATE_MANIFEST_URL` is set at build time.
2. The manifest must declare `applicationId=ai.knownext.mobile`, a higher `versionCode`, an HTTPS APK URL, APK size, ABI, and SHA-256 digest.
3. The Android bridge downloads the APK to app cache, verifies SHA-256, checks the package id, checks the exact published `versionCode`, rejects downgrades, and confirms the APK is signed with the same certificate as the installed app.
4. The app opens Android's system installer. Android may require the user to grant KnowNext.ai permission to install unknown apps before continuing.

The updater does not silently install APKs. Android app data is preserved only when the package id and signing certificate stay unchanged and `versionCode` increases. Release builds derive `versionCode` from `VERSION` as `major * 1000000 + minor * 1000 + patch`.

On Windows, the standard Tauri Android flow may create symlinks into the generated Android project. Enable Windows Developer Mode, or run from a shell with `SeCreateSymbolicLinkPrivilege`, before relying on the standard command.

## Validation

Manual Android acceptance must include:

- install from a clean APK
- create a project offline
- create/edit/save Markdown
- open notes and tabs
- import/export documents
- preview PDF/DOCX/XLSX reference files when available
- use mocked or configured AI through the local runtime contract
- open settings and diagnostics
- check for updates through `android-latest.json`
- confirm the app still works with no workstation app or external service running

## Limitations

- Play Store release tracks are not implemented yet. The current Android release channel is private APK distribution from GitHub Releases through `android-latest.json`.
