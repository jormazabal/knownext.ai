# Desktop Runtime

KnowNext.ai uses Tauri v2 as the Windows desktop shell and Rust as the only product runtime.

## Current Runtime

- Tauri loads the Vite React app.
- React calls the API boundary under `apps/desktop/src/lib/api`.
- The API boundary invokes Tauri commands instead of HTTP.
- Rust services own local projects, Markdown reads/writes, drafts, notes, previews, exports, history, AI orchestration, diagnostics, and updater integration.
- The frontend must not silently fall back to sample projects or arbitrary mock data.
- Tauri owns desktop update checks through the updater plugin. React calls only wrappers under `apps/desktop/src/lib/runtime`.
- The Tauri window must be user-resizable from operating-system edges and corners, with a practical minimum size instead of a fixed mockup-sized viewport.

## Window Resizing

- The packaged desktop window must keep native resizing enabled.
- Minimum width and height values should protect the compact workspace while still allowing narrow responsive drawer behavior.
- The workspace must respond to continuous window resize without reloading, losing unsaved drafts, or resetting the active Milkdown editor.
- Runtime integrations such as updater dialogs, GitHub login, project creation, and recoverable drafts must remain usable inside the resized window.

## Startup Runtime UX

- Show a loading layer before revealing workspace state.
- Do not render mock projects, default active project labels, stale tabs, or document chrome while initial state is unresolved.
- Resolve startup into exactly one visible state: real workspace, first-project empty state, recoverable runtime error, or explicit capability state.
- If the local Rust runtime command contract is unavailable, show a runtime error with retry guidance. Do not show sample data as a fallback.
- Fade the loading layer out after the target state is ready so the user never sees partially initialized controls.

## Auto Updates

KnowNext.ai checks public GitHub Releases through Tauri's updater endpoint:

```text
https://github.com/jormazabal/knownext.ai/releases/latest/download/latest.json
```

The updater is enabled for the installed Tauri app only. Browser development builds degrade safely and show that updates are unavailable. The UI may check automatically after startup and can also trigger a manual check from the account menu.

Update installation must preserve local work before restarting. The app flushes pending drafts before calling the Tauri updater install flow; if draft persistence fails, installation is stopped and the user keeps editing.

Updater packages are signed with Tauri's updater key. This is separate from Windows Authenticode installer signing, which remains optional hardening.

## Services Panel

The Services settings panel reports the local Rust runtime:

- runtime name and status
- app version and expected version
- runtime profile
- `tauri://local-api/health` endpoint marker
- app data directory
- instance id and start time
- latest diagnostic error

There are no auxiliary product processes, restart controls, or API ports to configure in 2.0.1.

## Security Notes

- Do not allow arbitrary shell access from React.
- Route filesystem, Git, document conversion, and AI operations through Rust services.
- Never expose API keys in the frontend.
- Do not add a separate product service or mobile endpoint dependency.
