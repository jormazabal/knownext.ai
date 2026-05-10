# Desktop Runtime

KnowNext.ai uses Tauri as the desktop shell.

## Current Runtime

- Tauri loads the Vite React app.
- FastAPI is run manually during development.
- The frontend can use local mocks or call FastAPI with `VITE_USE_BACKEND=true`.
- Tauri owns desktop update checks through the updater plugin. React calls only the runtime wrapper under `apps/desktop/src/lib/runtime`, and the updater downloads signed packages from GitHub Releases.

## Auto Updates

KnowNext.ai checks public GitHub Releases through Tauri's updater endpoint:

```text
https://github.com/jormazabal/knownext.ai/releases/latest/download/latest.json
```

The updater is enabled for the installed Tauri app only. Browser development builds degrade safely and show that updates are unavailable. The UI may check automatically after startup and can also trigger a manual check from the account menu.

Update installation must preserve local work before restarting. The app flushes pending internal drafts before calling the Tauri updater install flow; if draft persistence fails, installation is stopped and the user keeps editing.

Updater packages are signed with Tauri's updater key. This is separate from Windows Authenticode installer signing, which remains a later hardening step.

## Future Sidecar Plan

Tauri should start FastAPI as a sidecar process when the desktop app opens.

The sidecar plan must include:

- Allocate or reserve a local port.
- Start FastAPI with explicit host `127.0.0.1`.
- Pass the selected port to the frontend.
- Health-check the backend before enabling backend-backed actions.
- Shut down FastAPI when the desktop app closes.
- Avoid exposing the API beyond localhost.

## Security Notes

- Keep CORS restricted to Tauri and local development origins.
- Do not allow arbitrary shell access from React.
- Route filesystem, Git, and AI operations through backend services.
- Never expose API keys in the frontend.
