# Manual Test Checklist

Use this checklist before publishing a KnowNext.ai release. For 2.3.0, run critical acceptance on packaged Windows and Android builds. Do not publish if a critical item fails.

Use `docs/development/functional-validation-matrix.md` to record which areas are proven by automated tests, which areas have been manually validated, and which areas remain blocked by credentials, signing keys, or device access.

## Build Under Test

- Version: `2.3.0`
- Windows artifact: primary installer `KnowNext.ai_2.3.0_x64_en-US.msi`; secondary NSIS asset `KnowNext.ai_2.3.0_x64-setup.exe`
- Android artifact: `KnowNext.ai-android-arm64-v2.3.0.apk`
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
- On a Git/GitHub project, confirm startup does not repeatedly open and close terminal windows while history and sync status are checked.
- Create a project from the project selector.
- Create a folder and Markdown document from tree menus.
- Open multiple tabs, switch tabs, close tabs, and confirm the active document stays stable.
- Use the tab context menu actions `Cerrar`, `Cerrar otras pestañas` and `Cerrar todas las pestañas`; with dirty tabs, confirm the confirmation dialog advances one document at a time and no tab is skipped.
- Drag document tabs to reorder them; confirm the order persists while switching tabs and reopening the app.
- Edit in Milkdown, save, close, reopen, and confirm Markdown content persists.
- Apply `Cita` from the Markdown toolbar to selected text, then apply it again and confirm the blockquote style is removed.
- Edit a document without saving, force an orphaned draft by removing the backing Markdown file from disk, then open `Borradores recuperables`; confirm the draft is listed, can recreate the file, and disappears after restore or discard.
- Create and save user notes.
- In a disposable validation project or copied workspace, drag documents, folders, images, and attachments in the tree to move them between folders and to the project root; confirm the resulting filesystem paths, open tabs, and image/document references stay consistent.
- Open `Guardado y sincronización` from the file tree toolbar and confirm it shows a single file list ordered by modification date, with Local, Historial local and GitHub status columns and no Actividad or Detalles tabs.
- In `Guardado y sincronización`, verify filters for `Necesitan atención`, `Borradores`, `Historial pendiente`, `GitHub pendiente`, `Conflictos` and `Omitidos`, and confirm actions are available per file or as batch actions.
- Add a Markdown file and a `.env` file directly in the project folder outside the app; scan guardado/sincronización and confirm the Markdown can be imported into local history while the private file remains omitted.
- Import or attach an image and confirm it renders in the document/reference viewer when supported.
- Import a single Markdown/PDF/DOCX/XLSX file and confirm the imported file opens immediately as the active editable document or supported preview.
- Insert an imported image into a Markdown document, then move the image, move the document, and move their containing folders; confirm Markdown image references are recalculated and remain valid.
- Hover an image in a Markdown document, click the bottom-center edit icon, then confirm the edit dialog can change the alt text, replace the image through project/upload/URL modes, and delete the image from the document.
- Insert a Mermaid diagram from the Markdown toolbar, use the example catalog, validate it in the dialog, confirm it renders visually in the document, hover it and use `Editar` to reopen the dialog with the original code, then update and delete it.
- In Settings > Capabilities, switch Mermaid profiles between maximum compatibility, local visual and controlled experimental. Confirm compatible mode blocks icon/image enriched diagrams, local visual mode allows bundled `lucide:*` icons, and beta examples show a warning or are blocked according to the beta policy.
- Export a document containing at least one Mermaid diagram to PDF and DOCX; confirm the exported files embed the rendered diagram image, not raw Mermaid code.
- Reindex project images from settings and confirm the result reports the real number of project images and indexed images.
- Open AI/capabilities settings and confirm image generation exposes `gpt-image-2`, model, size, quality, format, destination folder, document insertion, document-context and asset-permission controls.
- Open AI/documental settings and confirm RAG exposes local index status, document counts, local index ID, `Reconstruir índice` and `Limpiar índice`; rebuild the index and confirm the document count updates.
- Open Settings > Skills de IA. Confirm the compact base skills list is visible, base skills show a `Base` badge, runtime status is visible, and selected base skill content is read-only with the copy `Skill base incluida con KnowNext.ai`.
- Inspect `knownext.mermaid` from Settings > Skills de IA. Confirm the summary, modes, instructions, manifest, examples, and diagnostic tabs render, then run validation and confirm the manifest reports a valid state.
- In `knownext.mermaid`, review the Mermaid catalog grouped by family and confirm beta entries such as `architecture-beta` show their required policy and aliases.
- Use the `Probar seleccion` panel with a Mermaid prompt and then with a Markdown table prompt. Confirm the preview shows candidates, selector or fallback decision, accepted/rejected applications, and policy/validation diagnostics without mutating a document.
- Confirm Settings > Skills de IA does not expose active edit, duplicate, import, export, or per-project activation actions; only passive preparation for user skills may be shown.
- In the document prompt, add context from a project document, then use `Adjuntar archivo` to select an external Markdown/PDF/Office/image file through the native picker. Confirm both sources appear as chips, `Fuentes` shows the correct count, preview works, and each source can be removed without affecting project files.
- Type `@` in the prompt and confirm the reference picker has a bounded height with scroll, can be closed, shows the folder path above and the filename below, and does not repeat the filename in the path.
- Drag a project document/image/attachment from the tree onto the prompt input and confirm it is added as IA context without uploading a duplicate external file.
- Open PDF/DOCX/XLSX reference previews where supported and confirm failures are visible and non-destructive; for XLSX, verify the sheet selector lists real workbook sheets and the grid shows actual cell values.
- Export a document to MD, PDF, and DOCX.
- Use the AI panel on the active document. With an OpenAI key configured, ask a question that requires context from another indexed project document and confirm the answer cites/uses that context. Then ask for a generated image and confirm a local image asset is created, appears in the tree/viewer, and is inserted into the document when insertion is enabled.
- Select a paragraph, ask IA to include an image that supports that selected text, and verify the app does not ask where to place it: the image is generated as a local asset, inserted directly where the IA judged appropriate, and the selected text is treated as context rather than as a mandatory insertion point.
- Select text in a Markdown document, ask IA to expand or rewrite only that selection, and verify the selected text changes directly as a dirty draft instead of showing raw JSON or an approval dialog.
- Place the cursor without selecting text, ask IA to insert content at that point, confirm the prompt chip says cursor context, and verify the insertion lands directly at the cursor.
- Ask IA to update one concept across several sections or documents. Confirm safe anchored operations apply directly, changed documents open as dirty tabs when needed, and only ambiguous/stale operations remain blocked for review in the IA surface.
- Ask IA to insert an existing project image into the active document and verify the Markdown image reference is inserted directly, renders, and points to the local project asset.
- Ask IA to add a process, architecture or sequence diagram to the active document; confirm the IA returns an editable Mermaid diagram aligned with the active profile, reports the used AI skill and mode such as `Mermaid / structure` or `Mermaid / sequence`, renders visually, and PDF/DOCX export embeds it.
- Ask IA to create a Markdown comparison table and confirm the response reports `Markdown / table` when selected, with table validation diagnostics when available.
- With architecture-beta enabled, force or simulate an invalid architecture-beta proposal that uses flowchart syntax such as `A --> B`; confirm Rust blocks the edit proposal and the AI response shows a `knownext.mermaid / diagram_structure` diagnostic instead of applying the invalid diagram.
- Ask the AI to create a new document with document-creation permission enabled and confirm the request is visible in the IA tab conversation and the created document opens as the active tab.
- Open settings > Capacidades and confirm local guided agentic controls are configurable for depth, confirmation, max steps, documents, sources and cost, while web research remains marked unavailable.
- Open settings, confirm Services shows `Runtime local`, `Contrato local`, `tauri://local-api/health`, no port control, no restart action, and no external executable.
- Open settings > System diagnostics and confirm the Git/GitHub service reports the active project, Git availability, local history state, origin/remote state, and GitHub paused state when unauthenticated.
- Configure an OpenAI key, connect GitHub, then close only the GitHub session; confirm the OpenAI key remains configured. Reconnect GitHub, update the OpenAI key, and confirm GitHub remains connected.
- Open a GitHub-synced project without a GitHub account or without repository access. Confirm editing, saving, and local history continue; the document footer shows `Sin acceso a GitHub`; automatic remote sync pauses without repeated save/sync error prompts.
- If a previous install shows an internal development GitHub placeholder account or a public GitHub account without a private credential, update to 2.3.0 and confirm it is cleared to `Sin cuenta GitHub`; attempting GitHub login must start the real GitHub device flow in the installed app. If a temporary fallback such as `GitHub remoto no configurado` appears, close and reopen or use `Reintentar login` and confirm the app attempts the device flow again instead of staying stuck in the fallback. If the account is disconnected or lacks permissions, the UI must show GitHub as paused while local history remains usable.
- Enable diagnostics, trigger a visible error, and confirm trace/log access works.
- Check for updates and confirm the updater uses the signed Windows manifest.
- Resize the window across compact and normal widths without overlapping core controls.
- Insert or open an embedded image, drag its bottom resize handle and confirm the image resizes live while dragging, keeps its natural proportions, stops at the available document width, and does not create empty white margins above or below the image.
- Use image hover actions to edit, reset size, open fullscreen and delete. Confirm reset returns to responsive default sizing rather than preserving a manual size.
- Insert or open a Mermaid diagram and confirm it uses the same visual toolbar pattern as images: edit, reset size, fullscreen and delete.
- Resize a Mermaid diagram from the bottom handle, confirm the gesture is vertical, proportional and capped by the document width.
- Open image and diagram fullscreen views, then verify zoom in, zoom out, 100%, fit, pan and `Esc` close behavior.

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
- `latest.json` resolves to `2.3.0` and points `windows-x86_64.url` to the MSI artifact.
- `android-latest.json` resolves to `2.3.0` and points to `KnowNext.ai-android-arm64-v2.3.0.apk`.
- README Windows MSI and Android download URLs return HTTP 200.
- A previous Windows install updates to 2.3.0 without deleting app data.
- An Android install updates to 2.3.0 while preserving app data and still works offline.

## Known 2.3.0 Limitations To Record If Still Present

- GitHub synchronization must use the Rust Git service; if credentials or permissions are missing, the UI must pause remote sync while local history remains usable.
- AI provider execution requires locally stored OpenAI credentials and must be validated with a real key before claiming provider acceptance.
- AI image generation and local RAG require real-provider hands-on validation before release acceptance; do not claim acceptance if generated assets, Markdown insertion, or indexed-document retrieval fail.
- Agentic local guided configuration is accepted for 2.3.0; agentic web research and unrestricted autonomous multi-step flows are not accepted capabilities and must remain unavailable.
- Some document previews may be best-effort depending on Rust conversion support.

Any limitation here must be repeated in `docs/releases/2.3.0.md` before publication.
