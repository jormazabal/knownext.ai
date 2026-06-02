# Manual Test Checklist

Use this checklist before publishing a KnowNext.ai release. For 2.0.1, run critical acceptance on packaged Windows and Android builds. Do not publish if a critical item fails.

## Build Under Test

- Version: `2.0.1`
- Windows artifact: `KnowNext.ai_2.0.1_x64-setup.exe` and `KnowNext.ai_2.0.1_x64_en-US.msi`
- Android artifact: `KnowNext.ai-android-arm64-v2.0.1.apk`
- Runtime: local Tauri/Rust, no external product service or workstation service dependency.

## Automated Gate

- `pnpm version:check` passes.
- `pnpm build` passes.
- `pnpm test` passes.
- `pnpm rust:test` passes.
- `pnpm bundle:check-clean` passes.
- `pnpm release:check` passes.
- Windows Tauri release build succeeds with updater signing.
- Android release build succeeds with Android signing.
- Bundles and installers pass the clean-distribution scanner for removed runtime markers, runtime data files, seed projects, and API keys.

## Windows Critical Acceptance

- Install or update the packaged Windows app.
- Open the app and confirm startup resolves to an empty workspace or the user's preserved real workspace, not sample data.
- Create a project from the project selector.
- Create a folder and Markdown document from tree menus.
- Open multiple tabs, switch tabs, close tabs, and confirm the active document stays stable.
- Edit in Milkdown, save, close, reopen, and confirm Markdown content persists.
- Create and save user notes.
- Open the history/protection drawer and confirm version state is shown without product branch names.
- Import or attach an image and confirm it renders in the document/reference viewer when supported.
- Open PDF/DOCX/XLSX reference previews where supported and confirm failures are visible and non-destructive.
- Export a document to MD, PDF, and DOCX.
- Use the AI panel on the active document. Mocked responses are acceptable only when clearly routed through the local runtime contract.
- Open settings, confirm Services shows `Runtime local`, `Contrato local`, `tauri://local-api/health`, no port control, no restart action, and no external executable.
- Open a GitHub-synced project without a GitHub account or without repository access. Confirm editing, saving, and local history continue; the document footer shows `Sin acceso a GitHub`; automatic remote sync pauses without repeated save/sync error prompts.
- Enable diagnostics, trigger a visible error, and confirm trace/log access works.
- Check for updates and confirm the updater uses the signed Windows manifest.
- Resize the window across compact and normal widths without overlapping core controls.

## Android Critical Acceptance

- Install the packaged APK on a clean Android device or emulator.
- Start the app with no workstation app, LAN service, or external product service running.
- Confirm startup reaches the app workspace without asking for a runtime endpoint.
- Create a project offline.
- Create a folder and Markdown document.
- Edit in Milkdown, save, close, reopen, and confirm content persists.
- Use tabs and notes.
- Import/export documents where Android permissions allow it.
- Open supported reference previews or confirm unsupported previews fail with visible product errors.
- Use the AI panel through the local runtime contract.
- Open settings and confirm local runtime diagnostics and no endpoint configuration.
- Check Android updates through `android-latest.json`; confirm package id, version code, SHA-256, and installer handoff behavior.
- Reboot or relaunch the app and confirm local app data persists.

## Release Publication Gate

- GitHub release draft contains Windows NSIS, Windows MSI, both `.sig` files, `latest.json`, Android APK, and `android-latest.json`.
- `latest.json` resolves to `2.0.1` and points `windows-x86_64.url` to the MSI artifact.
- `android-latest.json` resolves to `2.0.1` and points to `KnowNext.ai-android-arm64-v2.0.1.apk`.
- README Windows and Android download URLs return HTTP 200.
- A previous Windows install updates to 2.0.1 without deleting app data.
- An Android install updates to 2.0.1 while preserving app data and still works offline.

## Known 2.0.1 Limitations To Record If Still Present

- GitHub synchronization may remain mock-backed unless a real Rust GitHub service is validated.
- AI provider execution may remain mock-backed unless credentials, privacy, and provider routing are validated.
- Some document previews may be best-effort depending on Rust conversion support.

Any limitation here must be repeated in `docs/releases/2.0.1.md` before publication.
