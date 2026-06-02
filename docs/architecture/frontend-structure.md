# Frontend Structure

The frontend is React + TypeScript and renders product state received through the API boundary under `apps/desktop/src/lib/api`.

## Boundaries

- Feature components render state and dispatch intent.
- API modules adapt requests to Tauri commands and product contracts.
- React must not read or write project files directly.
- React must not execute Git, call GitHub APIs directly, access credential storage, or call AI providers directly.
- Runtime, filesystem, Git, document conversion, and AI behavior belongs to Rust services.

## State And Persistence

- Project creation, editing, selection, and tree operations go through `src/lib/api/projects.ts`.
- Layout, tabs, folder open state, notes, drafts, export templates, and settings go through API modules.
- Unsaved document changes are autosaved through `src/lib/api/documents.ts` to runtime-managed drafts.
- Document export goes through `src/lib/api/documents.ts`; React may open native save dialogs, but Rust writes or returns the export artifact.
- Reference previews render runtime-prepared PDF/text/workbook payloads and show explicit errors for unsupported files.

## Runtime Services

Runtime helpers live under `src/lib/runtime`. React can request health, logs, update checks, and folder-opening actions through those wrappers. It does not spawn processes, configure API ports, or assume an HTTP endpoint.

The Services settings section shows the local Rust runtime, version/profile details, app data directory, and latest diagnostic error.

## AI

The IA workspace tab is project-scoped and renders conversation events from runtime contracts. Prompt context chips are presentation state; source resolution, extraction, indexing, provider credentials, and operation validation belong to Rust services.

AI-generated document changes, images, and project operations must return structured operations that the app can apply deterministically.

## Visual Structure

- Keep the document editor as a single-column Milkdown surface.
- Keep the left panel compact and operational.
- Use hover/context menus for tree item actions.
- Do not show raw Markdown as the primary editing experience.
- Do not use product mock data as a normal runtime fallback.
