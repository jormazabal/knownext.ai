# Architecture Overview

KnowNext.ai 2.0.4 is a local-first Tauri v2 product with a React frontend and a Rust runtime. Windows and Android use the same product contracts through Tauri commands; neither platform connects to a separate product service.

```text
Tauri v2 shell
  React UI
    feature components
    apps/desktop/src/lib/api command adapter
  Rust command handlers
    knownext-core
    knownext-storage
    knownext-docs
    knownext-ai
```

## Data Flow

1. React components call `apps/desktop/src/lib/api/*`.
2. The API layer invokes Tauri commands such as `local_api_request` and `local_api_content`.
3. Tauri command handlers stay thin and delegate to Rust crates.
4. Rust services read/write local project files, runtime JSON state, notes, drafts, exports, previews, AI context, and version metadata.
5. Results return as structured JSON or binary payloads to the API layer.
6. React renders explicit loading, empty, unavailable, conflict, and error states.

The product must not silently fall back to frontend mock data. Test fixtures and development-only service doubles may exist, but they must be opt-in and visibly non-production when used.

## Boundaries

- React owns UI and local interaction state.
- `apps/desktop/src/lib/api` owns the frontend contract boundary.
- Rust crates own document persistence, project operations, exports, previews, Git/versioning orchestration, AI orchestration, and runtime diagnostics.
- Tauri owns native shell behavior, command registration, file dialogs, updater integration, Android bridge behavior, and OS-level permissions.

## Runtime Contract

The local runtime exposes a health contract through the Tauri command adapter. The API base is represented as `tauri://local-api` so frontend code keeps a stable request abstraction without HTTP.

The health payload includes:

- `app=knownext`
- `schemaVersion`
- `status`
- `service`
- `version`
- `profile`
- `endpoint`
- `instanceId`
- `startedAt`
- `managedBy`
- `appDataDir`

## No Separate Runtime Server

KnowNext.ai 2.0.4 does not include a separate product server, packaged auxiliary process, mobile endpoint discovery path, or compatibility mode for those paths. Any future external sync or AI provider traffic must be mediated by Rust/Tauri services.
