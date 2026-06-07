# KnowNext.ai

KnowNext.ai is a local-first Tauri application for managing, editing, versioning, exporting, and consulting Markdown documentation by project.

Version 2.3.0 runs as a self-contained native app on Windows and Android:

- Tauri v2 shell and commands.
- Rust local runtime for persistence, documents, exports, AI orchestration, diagnostics, and project operations.
- React + TypeScript frontend.
- Tailwind CSS visual system.
- Milkdown visual Markdown editor.
- Frontend API boundary under `apps/desktop/src/lib/api`, backed by Tauri commands instead of HTTP.
- Local JSON/file persistence with replaceable Rust services.

There is no external product service, packaged auxiliary runtime, API port, or mobile workstation dependency in 2.3.0.

## Download

The latest installers are published on GitHub Releases:

- [Download KnowNext.ai for Windows](https://github.com/jormazabal/knownext.ai/releases/latest/download/KnowNext.ai_2.3.0_x64_en-US.msi)
- [Download KnowNext.ai for Android arm64](https://github.com/jormazabal/knownext.ai/releases/latest/download/KnowNext.ai-android-arm64-v2.3.0.apk)
- [View all releases](https://github.com/jormazabal/knownext.ai/releases)

The Windows updater checks the signed Tauri manifest:

```text
https://github.com/jormazabal/knownext.ai/releases/latest/download/latest.json
```

The private Android updater checks:

```text
https://github.com/jormazabal/knownext.ai/releases/latest/download/android-latest.json
```

Windows may show a SmartScreen or endpoint protection warning for unsigned open source builds. The Tauri updater manifest and update artifacts are signed; Authenticode signing is optional until a public code-signing certificate exists.

Android private APK installs use the Android system installer. Android may ask you to allow installs from KnowNext.ai before an in-app private update can continue.

## Run Locally

Install dependencies:

```bash
pnpm install
```

Run the browser development UI against the local Tauri-command adapter:

```bash
pnpm dev
```

Run the native Windows desktop app:

```bash
pnpm desktop
```

Build the native Android app after installing the Android SDK/NDK:

```powershell
pnpm android:init
pnpm android:build
```

For a debug APK:

```powershell
$env:KNOWNEXT_ANDROID_ABI="arm64"
pnpm android:build:debug
```

Android artifacts are generated under `apps/desktop/src-tauri/gen/android/app/build/outputs`, and the helper copies the arm64 debug APK to `output/KnowNext.ai-android-arm64-debug.apk`. Android uses the same local Tauri/Rust runtime contracts as Windows and does not connect to a workstation service.

## Validate

```bash
pnpm version:check
pnpm build
pnpm test
pnpm rust:test
pnpm bundle:check-clean
pnpm release:check
```

Release builds require the Tauri updater signing key and Android keystore secrets described in `docs/development/release-process.md`.

## Documentation

- Product definition: `docs/product/product-definition.md`
- Architecture overview: `docs/architecture/architecture-overview.md`
- Desktop runtime: `docs/architecture/desktop-runtime.md`
- Mobile runtime: `docs/architecture/mobile-runtime.md`
- Getting started: `docs/development/getting-started.md`
- Release process: `docs/development/release-process.md`
- Manual test checklist: `docs/development/manual-test-checklist.md`
- Open source readiness: `docs/legal/open-source-readiness.md`
- Agent instructions: `AGENTS.md`

## Contributing

Contributions are welcome under the Apache-2.0 license. See `CONTRIBUTING.md` and `SECURITY.md` before submitting code or reporting vulnerabilities.

## License

KnowNext.ai is licensed under the Apache License, Version 2.0. See `LICENSE`, `NOTICE`, and `THIRD_PARTY_NOTICES.md`.
