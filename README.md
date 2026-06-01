# KnowNext.ai

KnowNext.ai is a desktop product for managing, editing, versioning, and querying Markdown documentation by project.

This first version establishes the product foundation:

- Tauri desktop shell.
- React + TypeScript frontend.
- Tailwind CSS visual system.
- Milkdown visual Markdown editor.
- FastAPI local backend with JSON persistence and replaceable services.
- Encapsulated frontend API layer.
- Local project registry and layout persistence through `projects.json` and `config.json`.
- Local folder scanning and real Markdown file read/write for project documentation.
- Mock version history and AI prompt response pending the post-foundation implementation phases.

## Download

The latest Windows installer is published on GitHub Releases:

- [Download KnowNext.ai for Windows](https://github.com/jormazabal/knownext.ai/releases/latest/download/KnowNext.ai_1.0.1_x64-setup.exe)
- [Download KnowNext.ai for Android arm64](https://github.com/jormazabal/knownext.ai/releases/latest/download/KnowNext.ai-android-arm64-v1.0.1.apk)
- [View all releases](https://github.com/jormazabal/knownext.ai/releases)

The desktop app also checks the signed updater manifest at:

```text
https://github.com/jormazabal/knownext.ai/releases/latest/download/latest.json
```

The private Android APK checks:

```text
https://github.com/jormazabal/knownext.ai/releases/latest/download/android-latest.json
```

Windows may show a SmartScreen or endpoint protection warning for unsigned open source builds. The Tauri updater manifest and update artifacts are signed, but the manually downloaded Windows installer may not have Authenticode signing. You can verify the installer hash against the SHA256 digest shown on the GitHub release asset.

Android private APK installs use the Android system installer. Android may ask you to allow installs from KnowNext.ai before an in-app private update can continue.

## Run Locally

Install frontend dependencies:

```bash
pnpm install
```

Run the frontend:

```bash
pnpm dev
```

Run the Tauri desktop app:

```bash
pnpm desktop
```

Build the native Android app after installing the Android SDK/NDK:

```powershell
pnpm android:init
$env:VITE_EXPECTED_BACKEND_PROFILE="mobile"
pnpm android:build
```

Android artifacts are generated under `apps/desktop/src-tauri/gen/android/app/build/outputs`. The Android package is native Tauri, but it does not bundle the Python sidecar; it requires a compatible FastAPI backend. On first startup, Android searches the local network for a compatible mobile backend and only shows the connection screen if automatic discovery fails.

For local debug testing from this workstation:

```powershell
pnpm backend:mobile
$env:KNOWNEXT_ANDROID_ABI="arm64"
pnpm android:build:debug
```

The debug helper writes `output/KnowNext.ai-android-arm64-debug.apk`. If `VITE_API_BASE_URL` is omitted, the APK does not embed a backend endpoint and Android discovers the mobile backend from the local network before asking for a manual address. The helper refuses to package client-exposed OpenAI/API-key environment variables.

The mobile backend endpoint must respond to `/health` with this app version and `profile=mobile`.

Run the FastAPI backend:

```bash
pnpm backend:dev
```

Backend health check:

```bash
curl http://127.0.0.1:8765/health
```

## Documentation

- Product definition: `docs/product/product-definition.md`
- Architecture overview: `docs/architecture/architecture-overview.md`
- Desktop runtime: `docs/architecture/desktop-runtime.md`
- Mobile runtime: `docs/architecture/mobile-runtime.md`
- Getting started: `docs/development/getting-started.md`
- Release process: `docs/development/release-process.md`
- Manual test checklist: `docs/development/manual-test-checklist.md`
- 1.0 release readiness: `docs/development/release-1.0-readiness.md`
- Open source readiness: `docs/legal/open-source-readiness.md`
- Agent instructions: `AGENTS.md`

## Contributing

Contributions are welcome under the Apache-2.0 license. See `CONTRIBUTING.md`
and `SECURITY.md` before submitting code or reporting vulnerabilities.

## License

KnowNext.ai is licensed under the Apache License, Version 2.0. See `LICENSE`,
`NOTICE`, and `THIRD_PARTY_NOTICES.md`.
