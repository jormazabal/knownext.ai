# Getting Started

## Prerequisites

- Node.js 22 or newer.
- pnpm 11.
- Rust toolchain for Tauri.
- Windows desktop builds: WebView2 and the Windows build toolchain required by Tauri.
- Android builds: Android Studio, SDK Command-line Tools, and Android NDK.

## Install

```bash
pnpm install
```

## Browser Development

```bash
pnpm dev
```

Open `http://127.0.0.1:1420`.

The browser development UI uses the same frontend API boundary as the native app. Requests are routed through the local Tauri-command adapter abstraction, represented as `tauri://local-api`, so feature code does not talk to a separate product service.

## Desktop

```bash
pnpm desktop
```

The native desktop app runs with Tauri v2 and Rust services. Project files, runtime state, notes, drafts, exports, diagnostics, and AI orchestration are local runtime responsibilities.

## Android

Initialize the generated Android project once:

```bash
pnpm android:init
```

Run on a connected device or emulator:

```powershell
pnpm android:dev
```

Build APK/AAB artifacts:

```powershell
pnpm android:build
```

Artifacts are written under `apps/desktop/src-tauri/gen/android/app/build/outputs`. On Windows, enable Developer Mode before running the standard Tauri Android build; the CLI needs permission to create symlinks for native libraries.

For a local debug APK:

```powershell
$env:KNOWNEXT_ANDROID_ABI="arm64"
pnpm android:build:debug
```

The debug helper writes installable APKs to `output/KnowNext.ai-android-<abi>-debug.apk`.

Android uses the local Tauri/Rust runtime and must work offline without a workstation app or external service running. Do not pass OpenAI secrets through `VITE_*` variables; the Android debug helper fails the build when client-exposed OpenAI/API-key environment variables or `sk-...` values appear in the frontend bundle.

## Tests

```bash
pnpm build
pnpm test
pnpm rust:test
pnpm release:check
```
