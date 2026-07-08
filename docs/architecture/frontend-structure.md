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
- The document tree toolbar resolves new-folder, new-document, new-handwritten-note, import, and AI add-to-project destinations from product state before calling APIs: selected folder first, then the parent folder of the active file/document, then project root only when no current tree location exists.
- Project file guard/sync overviews go through `src/lib/api/sync.ts` and are rendered as state; React does not inspect Git or the filesystem directly.
- Layout, tabs, folder open state, notes, drafts, export templates, and settings go through API modules.
- Handwritten pencil presets are application settings under `AppConfig.handwritten.toolPresets`. The handwritten editor receives them from app state and updates them through the config flow; opening a different `.knote` must not replace the active preset list.
- Unsaved document changes are autosaved through `src/lib/api/documents.ts` to runtime-managed drafts.
- Unsaved handwritten-note changes are autosaved through `src/lib/api/handwrittenNotes.ts` to runtime-managed drafts. React stores editor session state under `src/app/handwrittenSessions.ts`; it must not persist `.knote` files, render caches, or derived assets directly.
- Document export goes through `src/lib/api/documents.ts`; React may open native save dialogs, but Rust writes or returns the export artifact.
- Handwritten-note export and Markdown insertion go through `src/lib/api/handwrittenNotes.ts`. React may collect pointer input and draw canvas previews, but Rust validates/persists the `.knote`, renders export artifacts, writes derived assets, and prepares AI context.
- Reference previews render runtime-prepared PDF/text/workbook payloads and show explicit errors for unsupported files.
- The Markdown string remains the source of truth for inline visual formatting. Supported extended marks may use controlled inline HTML, including `<u>` and `<mark data-knx-highlight="yellow|green|blue|pink|orange">`.

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
- Keep handwritten notes in `src/features/handwritten` as a separate feature surface. The handwritten editor is a paginated canvas notebook, not a replacement for Milkdown and not a raw JSON editor.
- Handwritten UI must be stylus-first: pen/mouse write, touch scrolls, pressure and coalesced pointer events are used when available, and toolbar controls remain compact icon-led controls consistent with the workspace.
- Keep the left panel compact and operational.
- Use hover/context menus for tree item actions.
- Do not show raw Markdown as the primary editing experience.
- Do not use product mock data as a normal runtime fallback.
