# Getting Started

## Prerequisites

- Node.js 22 or newer.
- pnpm 11.
- Rust toolchain for Tauri.
- Python 3.12 or newer.

## Install

```bash
pnpm install
```

## Frontend

```bash
pnpm dev
```

Open `http://127.0.0.1:1420`.

The browser frontend uses `http://127.0.0.1:8766` by default so it can keep a separate web profile from the installed Windows app.
The backend `/health` response must report `profile=web-dev`; if a browser build points at a desktop backend the frontend treats it as incompatible.

Start the web backend in another terminal:

```bash
pnpm backend:web
```

To use a non-default browser backend port during development, start both sides with the same explicit endpoint:

```bash
$env:KNOWNEXT_API_PORT="8770"; pnpm backend:web
$env:VITE_API_BASE_URL="http://127.0.0.1:8770"; pnpm dev
```

## Desktop

```bash
pnpm desktop
```

## Android

KnowNext.ai can be built as a native Android app with Tauri v2. The Android package does not bundle the Python FastAPI sidecar; it must connect to a reachable backend endpoint. A build-time `VITE_API_BASE_URL` may be used as a private local-testing default, and the Android app can save a replacement endpoint from its startup connection screen. Omit `VITE_API_BASE_URL` for APKs that may be shared.

Install Android Studio, Android SDK Command-line Tools, and Android NDK. Set `ANDROID_HOME` and `NDK_HOME`, then initialize the generated Android project once:

```bash
pnpm android:init
```

Run on a connected device or emulator:

```powershell
$env:VITE_API_BASE_URL="https://api.example.com"
$env:VITE_EXPECTED_BACKEND_PROFILE="mobile"
pnpm android:dev
```

Build APK/AAB artifacts:

```powershell
$env:VITE_API_BASE_URL="https://api.example.com"
$env:VITE_EXPECTED_BACKEND_PROFILE="mobile"
pnpm android:build
```

Artifacts are written under `apps/desktop/src-tauri/gen/android/app/build/outputs`.
On Windows, enable Developer Mode before running the standard Tauri Android build; the CLI needs permission to create symlinks for native libraries.

For local Android testing against this workstation, start the mobile backend:

```powershell
pnpm backend:mobile
```

Then create a debug APK. Use the workstation LAN IP for a physical Android phone:

```powershell
$env:VITE_API_BASE_URL="http://<host-lan-ip>:8775"
$env:KNOWNEXT_ANDROID_ABI="arm64"
pnpm android:build:debug
```

Use the emulator host bridge for Android Emulator:

```powershell
$env:VITE_API_BASE_URL="http://10.0.2.2:8775"
$env:KNOWNEXT_ANDROID_ABI="x86_64"
pnpm android:build:debug
```

The debug helper writes installable APKs to `output/KnowNext.ai-android-<abi>-debug.apk`.
If the phone cannot reach the packaged endpoint, enter a full URL such as `http://192.168.1.20:8775` in the Android connection screen. The app validates `/health` against the current app version and `profile=mobile` before saving it.

Never pass OpenAI secrets through `VITE_*` variables. The Android debug helper fails the build when client-exposed OpenAI/API-key environment variables or `sk-...` values appear in the frontend bundle.

## Backend

```bash
cd backend
python -m uvicorn app.main:app --reload --port 8765
```

Port `8765` is reserved for the Tauri/Windows desktop profile. The installed desktop app can automatically move to another port in the `8765-8799` range when the default is occupied, and its frontend obtains the active endpoint from Tauri at runtime. Use `pnpm backend:web` for browser development unless you intentionally want to inspect the desktop profile.

## Tests

```bash
pnpm test
pnpm backend:test
```

