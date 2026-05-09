# Desktop Runtime

KnowNext.ai uses Tauri as the desktop shell.

## Current Runtime

- Tauri loads the Vite React app.
- FastAPI is run manually during development.
- The frontend can use local mocks or call FastAPI with `VITE_USE_BACKEND=true`.

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

