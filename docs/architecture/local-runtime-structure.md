# Local Runtime Structure

Rust runtime code lives under `apps/desktop/src-tauri`.

## Crates

- `knownext-core`: shared product contracts, IDs, timestamps, errors, and runtime health structures.
- `knownext-storage`: project registry, document tree, Markdown reads/writes, drafts, notes, configuration, versions, sync state, and local API path dispatch.
- `knownext-docs`: document export and preview helpers for Markdown, PDF, DOCX, and spreadsheet-oriented content.
- `knownext-ai`: AI request/response contracts and provider orchestration entry points. Mock behavior is allowed only as a replaceable service implementation.

The crate map may evolve, but business logic must stay in Rust services rather than React components or Tauri command handlers.

## Command Boundary

Tauri command handlers in `apps/desktop/src-tauri/src` are the native bridge. They should:

- validate and normalize command input
- call a Rust service
- return structured JSON or binary payloads
- record diagnostics when needed
- avoid large business-rule blocks

The frontend API layer adapts old `/health` and `/api/*` style paths to Tauri commands through `local_api_request` and `local_api_content`. Feature components should remain unaware of the transport.

## Runtime State

The runtime stores product state in the Tauri app data directory. Expected state includes:

- `projects.json`
- `config.json`
- `notes.json`
- `credentials.json`
- project folders and Markdown files
- drafts and version metadata
- preview/export caches when implemented
- diagnostic logs

Release bundles must not contain those runtime files.

## Git, GitHub, And AI

React never executes Git, filesystem, or AI provider operations directly. Rust services mediate:

- local Git history and future GitHub synchronization
- image and attachment imports
- document export and reference previews
- AI context indexing, prompt execution, permissions, and credential access

No separate product service or auxiliary product process is part of the runtime.
