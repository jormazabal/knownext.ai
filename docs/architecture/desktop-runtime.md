# Desktop Runtime

KnowNext.ai uses Tauri as the desktop shell.

## Current Runtime

- Tauri loads the Vite React app.
- The installed Tauri app starts and supervises the bundled FastAPI sidecar on `127.0.0.1:8765` by default, with automatic fallback across `8765-8799` when the default port is occupied by another service.
- Browser development runs a separate FastAPI profile on `127.0.0.1:8766` through `pnpm backend:web` so browser projects, credentials, and app settings do not overwrite the installed app profile.
- The frontend calls FastAPI for product data and must not silently fall back to local mock data.
- Tauri owns desktop update checks through the updater plugin. React calls only the runtime wrapper under `apps/desktop/src/lib/runtime`, and the updater downloads signed packages from GitHub Releases.
- The Tauri window must be user-resizable from operating-system edges and corners, with a practical minimum size instead of a fixed mockup-sized viewport.

## Window Resizing

- The packaged desktop window must keep native resizing enabled.
- The app should set minimum width and height values that protect the compact workspace from broken layout, while still allowing tablet-like widths for responsive drawer behavior.
- The React workspace must respond to continuous window resize without reloading the frontend, restarting the backend, losing unsaved drafts, or resetting the active Milkdown editor.
- Runtime integrations such as updater dialogs, GitHub login, project creation, and recoverable drafts must remain usable inside the resized window.

## Startup Runtime UX

The desktop shell must keep startup visually clean while the runtime and API-backed state initialize.

- Show a loading layer before revealing the workspace state.
- Do not render mock projects, default active project labels, stale tabs, or document chrome while initial state is unresolved.
- Resolve startup into exactly one visible state: real workspace, first-project empty state, recoverable runtime/API error, or explicit disconnected capability state.
- When FastAPI is not running in development or the future sidecar fails in the packaged app, show a runtime/API error with retry guidance. Do not show sample data as a fallback.
- Fade the loading layer out over roughly 180-260ms after the target state is ready so the user never sees partially initialized controls.

## Auto Updates

KnowNext.ai checks public GitHub Releases through Tauri's updater endpoint:

```text
https://github.com/jormazabal/knownext.ai/releases/latest/download/latest.json
```

The updater is enabled for the installed Tauri app only. Browser development builds degrade safely and show that updates are unavailable. The UI may check automatically after startup and can also trigger a manual check from the account menu.

Update installation must preserve local work before restarting. The app flushes pending internal drafts before calling the Tauri updater install flow; if draft persistence fails, installation is stopped and the user keeps editing.

Updater packages are signed with Tauri's updater key. This is separate from Windows Authenticode installer signing, which remains a later hardening step.

## Backend Supervision

Tauri starts FastAPI as a sidecar process when the installed desktop app opens.

The sidecar integration must:

- Prefer the reserved desktop port `127.0.0.1:8765`, but use a configured fixed port or automatic fallback port when needed.
- Start FastAPI with explicit host `127.0.0.1`.
- Pass the Tauri app data directory to the backend through `KNOWNEXT_APP_DATA_DIR`.
- Pass `KNOWNEXT_RUNTIME_PROFILE=desktop`, `KNOWNEXT_MANAGED_BY=tauri`, and the selected `KNOWNEXT_API_PORT`.
- Expose the active API endpoint to React through Tauri instead of requiring the frontend to hard-code a port.
- Health-check the backend before enabling backend-backed actions and while the app remains open.
- Restart the backend when health checks fail. If a fixed port is occupied by an incompatible service, report the conflict instead of killing unrelated processes.
- Shut down FastAPI when the desktop app closes.
- Record startup failures, health mismatches, and restart attempts in `knownext.log`.
- Avoid exposing the API beyond localhost.

The backend `/health` contract is the runtime identity boundary. It must include `app=knownext`, `schemaVersion`, `profile`, `version`, `port`, `endpoint`, `instanceId`, `startedAt`, `managedBy`, and `appDataDir`. Desktop frontends must reject non-`desktop` profiles; browser development frontends must reject non-`web-dev` profiles.

The Services settings panel exposes port control under an advanced section. Automatic mode is the product default. Fixed mode is intended for managed machines or port reservation scenarios and must validate conflicts before applying.

## Security Notes

- Keep CORS restricted to Tauri and local development origins.
- Do not allow arbitrary shell access from React.
- Route filesystem, Git, and AI operations through backend services.
- Never expose API keys in the frontend.
