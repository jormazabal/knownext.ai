# Architecture Overview

KnowNext.ai is organized as a Tauri product with a React frontend and a FastAPI service. Desktop uses a local service; Android uses a configured remote service until mobile-local persistence is explicitly designed.

```text
Tauri shell
  React UI
    feature components
    API service layer
  local runtime integration

FastAPI backend
  routers
  schemas
  services
  future filesystem/Git/AI adapters
```

## Current Data Flow

1. React components call `src/lib/api/*`.
2. On desktop, Tauri starts FastAPI as a local sidecar and exposes the managed endpoint to React.
3. On Android, the frontend reads `VITE_API_BASE_URL` from the build configuration and expects a compatible FastAPI endpoint.
4. The API layer calls FastAPI for product state and operations.
5. FastAPI routers call services that read/write application data and project files.
6. If the backend is unavailable or data is absent, the frontend renders explicit loading, empty, disconnected, or error states.

The product must not silently fall back to frontend mock data. Test fixtures and development-only service doubles may exist, but they must be opt-in and visibly non-production when used.

## Future Data Flow

1. Desktop Tauri continues to supervise FastAPI as a local sidecar.
2. Android either uses a product backend endpoint or a future mobile-local persistence service after storage and security decisions are explicit.
3. React calls FastAPI through the API layer.
4. FastAPI reads and writes project data.
5. FastAPI mediates Git and AI operations.

## Boundaries

- React owns UI and local interaction state.
- FastAPI owns document persistence, Git operations, and AI orchestration.
- Tauri owns native shell behavior and desktop process lifecycle.
