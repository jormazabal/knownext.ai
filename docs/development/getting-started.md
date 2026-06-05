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

## Frontend-Only Development

```bash
pnpm dev
```

This starts Vite for frontend-only work. Opening `http://127.0.0.1:1420` directly is not a valid product runtime check: the UI intentionally returns `503 Runtime unavailable` when it is not running inside Tauri.

Use the native Tauri window for functional development and QA:

```bash
pnpm --filter @knownext/desktop tauri:dev
```

The frontend still uses the same API boundary as the native app, but product requests are served by Tauri commands through the local Rust runtime represented as `tauri://local-api`. Feature code must not talk to a separate product service.

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
