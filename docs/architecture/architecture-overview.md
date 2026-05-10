# Architecture Overview

KnowNext.ai is organized as a local desktop product with a React/Tauri frontend and a FastAPI local service.

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
2. The API layer calls FastAPI for product state and operations.
3. FastAPI routers call services that read/write local application data and project files.
4. If the backend is unavailable or data is absent, the frontend renders explicit loading, empty, disconnected, or error states.

The product must not silently fall back to frontend mock data. Test fixtures and development-only service doubles may exist, but they must be opt-in and visibly non-production when used.

## Future Data Flow

1. Tauri starts FastAPI as a local sidecar.
2. React calls FastAPI on a managed local port.
3. FastAPI reads and writes local project files.
4. FastAPI mediates Git and AI operations.

## Boundaries

- React owns UI and local interaction state.
- FastAPI owns document persistence, Git operations, and AI orchestration.
- Tauri owns desktop shell behavior and process lifecycle.
