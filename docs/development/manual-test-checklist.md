# Manual Test Checklist

Use this checklist before publishing a KnowNext.ai release. For 2.0.3, run critical acceptance on packaged Windows and Android builds. Do not publish if a critical item fails.

Use `docs/development/functional-validation-matrix.md` to record which areas are proven by automated tests, which areas have been manually validated, and which areas remain blocked by credentials, signing keys, or device access.

## Build Under Test

- Version: `2.0.3`
- Windows artifact: primary installer `KnowNext.ai_2.0.3_x64_en-US.msi`; secondary NSIS asset `KnowNext.ai_2.0.3_x64-setup.exe`
- Android artifact: `KnowNext.ai-android-arm64-v2.0.3.apk`
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

- For dev validation, start from a clean port and launch the native Tauri window from an interactive PowerShell:
  - `netstat -ano | findstr :1420`
  - Stop only the stale PID that owns `127.0.0.1:1420`, if present.
  - `cd C:\Dev\knownext.ai`
  - `pnpm --filter @knownext/desktop tauri:dev`
  - The validation window must be a native Tauri window, not the Vite page in a browser tab.
- Install or update the packaged Windows app.
- Open the app and confirm startup resolves to an empty workspace or the user's preserved real workspace, not sample data.
- Create a project from the project selector.
- Create a folder and Markdown document from tree menus.
- Open multiple tabs, switch tabs, close tabs, and confirm the active document stays stable.
- Drag document tabs to reorder them; confirm the order persists while switching tabs and reopening the app.
- Edit in Milkdown, save, close, reopen, and confirm Markdown content persists.
- Edit a document without saving, force an orphaned draft by removing the backing Markdown file from disk, then open `Borradores recuperables`; confirm the draft is listed, can recreate the file, and disappears after restore or discard.
- Create and save user notes.
- In a disposable validation project or copied workspace, drag documents, folders, images, and attachments in the tree to move them between folders and to the project root; confirm the resulting filesystem paths, open tabs, and image/document references stay consistent.
- Open the history/protection drawer and confirm version state is shown without product branch names.
- Add a Markdown file and a `.env` file directly in the project folder outside the app; scan external changes and confirm the Markdown can be imported into local history while the private file remains omitted.
- Import or attach an image and confirm it renders in the document/reference viewer when supported.
- Insert an imported image into a Markdown document, then move the image, move the document, and move their containing folders; confirm Markdown image references are recalculated and remain valid.
- Reindex project images from settings and confirm the result reports the real number of project images and indexed images.
- Open AI/capabilities settings and confirm image generation is marked unavailable rather than exposing model, folder, or insertion controls until a Rust/Tauri asset-generation contract exists.
- Open AI/capabilities settings and confirm automatic semantic RAG/vector store and agentic web research are marked unavailable; the app must still allow explicit document/image/attachment context from the prompt.
- In the document prompt, add context from a project document, then use `Adjuntar archivo` to select an external Markdown/PDF/Office/image file through the native picker. Confirm both sources appear as chips, `Fuentes` shows the correct count, preview works, and each source can be removed without affecting project files.
- Drag a project document/image/attachment from the tree onto the prompt input and confirm it is added as IA context without uploading a duplicate external file.
- Open PDF/DOCX/XLSX reference previews where supported and confirm failures are visible and non-destructive; for XLSX, verify the sheet selector lists real workbook sheets and the grid shows actual cell values.
- Export a document to MD, PDF, and DOCX.
- Use the AI panel on the active document. Mocked responses are acceptable only when clearly routed through the local runtime contract.
- Open settings, confirm Services shows `Runtime local`, `Contrato local`, `tauri://local-api/health`, no port control, no restart action, and no external executable.
- Configure an OpenAI key, connect GitHub, then close only the GitHub session; confirm the OpenAI key remains configured. Reconnect GitHub, update the OpenAI key, and confirm GitHub remains connected.
- Open a GitHub-synced project without a GitHub account or without repository access. Confirm editing, saving, and local history continue; the document footer shows `Sin acceso a GitHub`; automatic remote sync pauses without repeated save/sync error prompts.
- If a previous 2.0.1 install shows an internal development GitHub placeholder account or a public GitHub account without a private credential, update to 2.0.3 and confirm it is cleared to `Sin cuenta GitHub`; attempting GitHub login must start the real GitHub device flow in the installed app. If a temporary fallback such as `GitHub remoto no configurado` appears, close and reopen or use `Reintentar login` and confirm the app attempts the device flow again instead of staying stuck in the fallback. If the account is disconnected or lacks permissions, the UI must show GitHub as paused while local history remains usable.
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
- `latest.json` resolves to `2.0.3` and points `windows-x86_64.url` to the MSI artifact.
- `android-latest.json` resolves to `2.0.3` and points to `KnowNext.ai-android-arm64-v2.0.3.apk`.
- README Windows MSI and Android download URLs return HTTP 200.
- A previous Windows install updates to 2.0.3 without deleting app data.
- An Android install updates to 2.0.3 while preserving app data and still works offline.

## Known 2.0.3 Limitations To Record If Still Present

- GitHub synchronization must use the Rust Git service; if credentials or permissions are missing, the UI must pause remote sync while local history remains usable.
- AI provider execution requires locally stored OpenAI credentials and must be validated with a real key before claiming provider acceptance.
- AI image generation is not an accepted 2.0.3 capability until Rust/Tauri can create local image assets and insert references through a validated contract; settings must continue to show it as unavailable.
- Automatic semantic RAG/vector store and agentic web research are not accepted 2.0.3 capabilities until the Rust/Tauri runtime uses them in AI interactions; settings must continue to show them as unavailable while explicit prompt context remains usable.
- Some document previews may be best-effort depending on Rust conversion support.

Any limitation here must be repeated in `docs/releases/2.0.3.md` before publication.
