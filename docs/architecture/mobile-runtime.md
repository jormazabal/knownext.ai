# Mobile Runtime

KnowNext.ai can be packaged as a native Android app through Tauri v2.

## Current Scope

- Android uses the same React + TypeScript frontend as desktop.
- Android does not bundle or start the Python FastAPI backend as a local sidecar.
- Android builds can include a default backend with `VITE_API_BASE_URL`, and the installed Android app can override it from the startup connection screen.
- The backend health profile expected by Android is `mobile` by default and can be overridden with `VITE_EXPECTED_BACKEND_PROFILE`.
- Windows uses the signed Tauri updater. Android private APK builds use a separate `android-latest.json` channel and the Android system installer.
- The Android package must not contain projects, documents, credentials, API keys, notes, drafts, logs, or development backend data.
- Android does not render the desktop title bar, app name, or minimize/maximize/close window controls. Those controls belong to desktop window chrome and overlap native Android system UI on phones.
- Android must let the native system reserve the status and navigation bar areas unless a future edge-to-edge design explicitly handles safe-area insets across devices.
- Mobile shell decisions are device/runtime decisions, not just viewport-width decisions. A narrow desktop window must keep desktop window chrome; Android phone shells get larger touch targets, larger editor text, and phone-specific spacing.

This keeps the first Android package native without pretending that local Python sidecar packaging for Android has been solved.

## Data Model

A clean Android installation has no bundled product data. When no endpoint is packaged or saved, startup stops on the backend connection screen. When an endpoint is configured, all projects and documents shown in the Android UI come from that backend's active `appDataDir`; they are not copied from the APK.

Android updates preserve WebView app storage for the same package, so a saved backend endpoint remains configured after `adb install -r` or an app-store update. User project data remains wherever the backend stores it. Uninstalling the Android app follows Android defaults and clears app-specific WebView storage, but does not delete data held by an external backend.

The `pnpm backend:mobile` helper is a development backend on the workstation. It uses a persistent development data directory so it can legitimately show projects from earlier testing. For clean-install acceptance, point it at an empty disposable `KNOWNEXT_APP_DATA_DIR` or delete the development data directory before starting it.

```powershell
$env:KNOWNEXT_APP_DATA_DIR="$PWD\output\mobile-clean-data"
pnpm backend:mobile
```

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
$env:VITE_API_BASE_URL="https://api.example.com"
$env:VITE_EXPECTED_BACKEND_PROFILE="mobile"
pnpm android:dev
```

For local device testing against the development backend, start the mobile backend on the host:

```powershell
pnpm backend:mobile
```

Then build a debug APK for a physical Android phone on the same Wi-Fi. `VITE_API_BASE_URL` is only a default for private local testing; if omitted, the APK does not embed any backend endpoint and Android shows a connection screen where the endpoint can be entered and persisted.

```powershell
$env:VITE_API_BASE_URL="http://<host-lan-ip>:8775"
$env:VITE_EXPECTED_BACKEND_PROFILE="mobile"
$env:KNOWNEXT_ANDROID_ABI="arm64"
pnpm android:build:debug
```

For Android Emulator, use the emulator host bridge and x86_64 ABI:

```powershell
$env:VITE_API_BASE_URL="http://10.0.2.2:8775"
$env:VITE_EXPECTED_BACKEND_PROFILE="mobile"
$env:KNOWNEXT_ANDROID_ABI="x86_64"
pnpm android:build:debug
```

Create Android release artifacts:

```powershell
$env:VITE_API_BASE_URL="https://api.example.com"
$env:VITE_EXPECTED_BACKEND_PROFILE="mobile"
pnpm android:build
```

Tauri writes APK and AAB artifacts under:

```text
apps/desktop/src-tauri/gen/android/app/build/outputs
```

`pnpm android:build:debug` writes convenience APK copies under:

```text
output/KnowNext.ai-android-<abi>-debug.apk
```

If the packaged endpoint is unreachable, the Android app opens a compact connection screen before the workspace. Enter a full URL such as `http://192.168.1.20:8775`; the app checks `/health` for the matching app version and `profile=mobile` before saving it locally on the device.

Do not put OpenAI credentials in `VITE_*` variables or Android build inputs. The debug build helper refuses `VITE_OPENAI*`, `VITE_*API_KEY*`, and `sk-...` values in the client bundle. OpenAI keys belong only in backend-managed credentials and must never be shipped in APK/AAB artifacts.

The client bundle clean check rejects runtime data markers in the generated frontend bundle, including `projects.json`, `credentials.json`, `notes.json`, and legacy seed project names. It runs from the debug Android helper, from the Android Tauri build configuration, and from `pnpm release:check`.

## Private APK Updates

Private Android distribution uses the same visible `Buscar actualizaciones` action as Windows, but the implementation is Android-specific:

1. The app reads `https://github.com/jormazabal/knownext.ai/releases/latest/download/android-latest.json` unless `VITE_ANDROID_UPDATE_MANIFEST_URL` is set at build time.
2. The manifest must declare `applicationId=ai.knownext.mobile`, a higher `versionCode`, an HTTPS APK URL, APK size, ABI, and SHA-256 digest.
3. The Android bridge downloads the APK to app cache, verifies SHA-256, checks the package id, checks the exact published `versionCode`, rejects downgrades, and confirms the APK is signed with the same certificate as the installed app.
4. The app opens Android's system installer. Android may require the user to grant KnowNext.ai permission to install unknown apps before continuing.

The updater does not silently install APKs. Android app data is preserved only when the package id and signing certificate stay unchanged and `versionCode` increases. Release builds derive `versionCode` from `VERSION` as `major * 1000000 + minor * 1000 + patch`.

On Windows, the normal `tauri android build` flow creates symlinks into the generated Android project. Enable Windows Developer Mode, or run from a shell with `SeCreateSymbolicLinkPrivilege`, before relying on the standard command. `pnpm android:build:debug` is a local debug workaround for machines without that privilege: it builds the web assets, compiles Rust with Tauri's `custom-protocol` feature, copies the native `.so` into the generated Android project for the selected ABI, runs the matching Gradle assemble task, then removes the copied `.so`.

## Backend Contract

The Android frontend still uses the normal FastAPI contracts under `/health` and `/api/*`.

The server used by Android should expose `/health` with:

- `app=knownext`
- `status=ok`
- `version` matching the packaged app version
- `profile=mobile` unless `VITE_EXPECTED_BACKEND_PROFILE` is changed

The backend must allow the Tauri mobile WebView origin through CORS. `http://tauri.localhost` is already included in the default development CORS list, but production deployments should define their allowed origins explicitly before public release.

## Limitations

- Offline local project storage on Android is not implemented yet.
- Local Git integration on Android is not implemented yet.
- The Android app is installable as a native Tauri APK/AAB, but it requires a compatible backend endpoint for product data. The endpoint can be changed in the app when startup cannot reach the packaged default.
- Play Store release tracks are not implemented yet. The current Android release channel is private APK distribution from GitHub Releases through `android-latest.json`.
