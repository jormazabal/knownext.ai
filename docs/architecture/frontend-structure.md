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

AI-generated document changes, images, and project operations must return structured operations that the app can apply deterministically. The frontend may apply already validated edit proposals to local editor/document state, but it must treat provider text as display-only and must not call providers or infer intent from prompt wording.

AI edit proposals are the UX boundary for document mutation. Selection/cursor operations can use the active Milkdown controller; project or multi-document operations must use validated Markdown anchors or explicit full-document replacement. If an anchor is missing or ambiguous, the UI keeps the operation reviewable instead of guessing a target.

AI skills are displayed through the settings surface and response metadata, but they remain runtime-owned. The frontend uses `src/lib/api/skills.ts` to list, inspect, request validation, and request non-mutating selection previews for skills. It may show `usedSkills`, `skillApplications`, and `skillDiagnostics` returned by Rust, but it must not compose skill prompts, validate manifests locally, infer applied skills from assistant text, or treat a skill as a permission grant.

The Skills de IA settings tab is a compact capability manager, not an editor. It shows base skills, modes, runtime status, Mermaid catalog families, manifest data, examples, diagnostics, and the selection preview panel. Import, export, duplicate, edit, and project-level activation controls must remain passive or absent until user/imported skills are implemented in the runtime.

## Visual Structure

- Keep the document editor as a single-column Milkdown surface.
- Keep the left panel compact and operational.
- Use hover/context menus for tree item actions.
- Do not show raw Markdown as the primary editing experience.
- Do not use product mock data as a normal runtime fallback.
