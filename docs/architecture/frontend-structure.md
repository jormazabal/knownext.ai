# Frontend Structure

Frontend code lives in `apps/desktop/src`.

## Folders

- `app`: root application state and composition.
- `components`: shared low-level components.
- `features`: product features such as projects, documents, editor, versions, and assistant.
- `layouts`: page-level desktop workspace layout.
- `lib/api`: frontend service contracts.
- `styles`: Tailwind and Milkdown CSS integration.
- `types`: shared TypeScript product models.

## Rules

- Components must not import mock data directly.
- Components use the API layer in `lib/api`.
- Feature-specific components stay under their feature folder.
- Visual components should receive props and callbacks.
- Business behavior that later belongs to backend services should stay out of React components.
- React must not call Git, GitHub APIs, or credential storage directly. It renders auth/capability state from FastAPI and dispatches intent through `lib/api`.

## Current Mock Strategy

The application must not use frontend mock data as a normal runtime fallback. API modules call FastAPI for product state. If FastAPI is not available, the UI shows a clear runtime/API error and keeps user data absent instead of returning sample projects or documents.

Any remaining mock fixtures must be limited to tests, Storybook/demo surfaces, or explicitly labeled development tools. They must not be reachable as an invisible fallback from the production workspace.

## Persisted App State

- Project creation, project editing, and active project selection go through `src/lib/api/projects.ts` and are persisted by FastAPI in `projects.json`.
- GitHub auth status and device-flow login go through `src/lib/api/auth.ts`; tokens are never exposed to arbitrary UI components.
- Project capabilities and versioning status are fetched per project so the assistant can show disabled Git/GitHub options without hiding them.
- Layout widths and per-project open document tabs go through `src/lib/api/config.ts` and are persisted by FastAPI in `config.json`.
- Application settings for appearance and diagnostics also go through `src/lib/api/config.ts`; UI components receive these values as props and dispatch setting changes to the root app state. Global appearance includes locale, zoom, Markdown compatibility, theme mode, and primary accent color.
- AI settings also go through `src/lib/api/config.ts` and `src/lib/api/ai.ts`. The OpenAI key status is visible to React, but the secret value is never returned to the frontend after save. Image-generation settings are persisted with AI settings and remain separate from image-vision settings.
- Runtime trace logging helpers live under `src/lib/runtime/logging.ts`. React can request log status, record frontend errors, and ask the runtime to open the dedicated log folder, but it does not write log files directly.
- Runtime service helpers live under `src/lib/runtime/services.ts`. React can request local service health and ask the installed Tauri runtime to restart the backend, but it does not spawn or kill processes directly.
- The document tree goes through `src/lib/api/projects.ts` and reflects folders, Markdown files, and supported image assets under the active project's local folder.
- Project image upload, metadata, usage checks, Markdown reference creation, and visual reindex actions also go through `src/lib/api/projects.ts`; React never reads or writes project image files directly.
- Open documents are tracked as per-tab editing sessions in the root app state. Each session owns its own Markdown content, dirty state, draft metadata, and Milkdown instance while the tab remains open.
- Unsaved document changes are autosaved through `src/lib/api/documents.ts` to FastAPI-managed internal drafts. React must not write draft files directly.
- Open document sessions are checked with backend sync-status polling and window focus refreshes so external disk changes become visible without replacing local editor content.
- Project-level external changes go through `src/lib/api/externalChanges.ts`. React polls the backend, renders a compact status indicator, a contextual banner, a review drawer, and tree badges, then sends explicit import decisions back to FastAPI. React never inspects the project folder or executes Git.
- Recoverable orphan drafts are exposed through the account actions menu as a discrete maintenance panel.
- The project AI conversation is a fixed first workspace tab whenever a project is active. It is project-scoped, not closable, and renders persisted conversation events from FastAPI.
- AI edits update the in-memory document session and leave the document dirty; React does not write the AI result to disk until the normal document save flow runs.
- AI project operations are dispatched through `src/lib/api/ai.ts`. Folder/document creation, move, duplicate, and delete results refresh the backend tree when app IA permissions allow them; blocked actions are rendered from structured `permission_blocked` responses.
- AI-generated images are returned from `src/lib/api/ai.ts` as `generatedImages`. React refreshes the tree from the backend response, opens generated image assets in image tabs when they were not inserted into a document, and applies `updatedDocument` through the existing editor-operation path when insertion was requested.
- AI prompt context is rendered as chips inside `AiPromptInput`. If a source chip is visible, it is active and its id is sent with the next AI interaction. React owns only source presentation and user intent; FastAPI owns file upload, extraction, expiry, preview, source resolution, and conversion into project documents.
- Project image context uses the same visible chip model as document context. Search results can include images, and selecting one creates a backend-owned image context source for the next prompt.
- The project assistant supports local files, local Git with manual sync, and GitHub API projects. Versioned modes remain disabled until GitHub login is active.
- The history button is enabled only when the active project has a versioning provider and the user is authenticated.
- UI components receive persisted values as props and dispatch user intent back to the root app state.

## Startup And Empty States

- Root app state starts in an explicit loading phase. The desktop workspace renders a clean loading layer until projects, configuration, auth, capabilities, active project tree, and tab state have resolved.
- Components must not render default project names, default document tabs, sample trees, or fallback users during startup.
- An empty project list is a valid loaded state. It renders the first-project call to action instead of `ProjectSelector`.
- `ProjectSelector` is only rendered when at least one real project exists.
- Empty states are driven by real API responses: empty arrays, `null` active project, disconnected auth, disabled capabilities, or explicit API errors.
- Smooth transitions are part of the component contract. Loading-to-empty, loading-to-workspace, and loading-to-error transitions should use opacity/transform transitions that do not move the sidebar or editor layout abruptly.

## Responsive Resizable Layout

- The desktop shell must allow free OS-level window resizing. React layout code must assume the viewport can change continuously.
- The main workspace uses a three-region layout: left project/document navigation, central editor, and optional right history panel.
- In desktop layout, the left navigation width and right history width are controlled by draggable vertical separators.
- Separator components must use accessible `role="separator"`, vertical orientation, current/min/max width values, pointer dragging, and keyboard arrow resizing.
- Persisted widths belong in `layout` config under `config.json`; UI components receive widths as props and report resize intent back to root state.
- Clamp left navigation and history widths so the central single-column editor keeps enough readable width.
- In tablet/mobile layout, navigation and history become overlay drawers and the desktop separators are hidden.
- Window resizing, panel resizing, and drawer transitions must not remount active document sessions or reset Milkdown undo/redo state.
- The editor header structure is fixed: document tabs and Markdown toolbar do not own vertical scrolling; only the document canvas scrolls vertically.

## Application Settings Modal

- `Configuración de la app` opens a modal settings surface over the current workspace.
- The modal has a left settings list and a right detail pane.
- `Servicios` is the first section and shows local backend health, version/profile details, last error, manual refresh, and backend restart where supported by the installed desktop runtime.
- `Apariencia` owns the persisted locale, zoom percentage, theme mode (`Sistema`, `Claro`, `Oscuro`), primary accent color, and Markdown compatibility preferences such as extended underline visibility.
- Runtime theme application belongs to `src/lib/theme/appearance.ts`. It resolves the system color scheme when requested and writes `data-theme`, `data-theme-preference`, and `data-accent` attributes on the root document so Tailwind/CSS tokens can update the full workspace without remounting React state.
- `IA` owns OpenAI provider status, action permissions, project documentation indexing controls, vision controls for image context/indexing, and generation controls for GPT Image assets. RAG status from FastAPI includes semantic index state, indexed/failed document counts, and whether the local exact-search index is ready; React only renders those values and never indexes files itself.
- `Trazas` owns the persisted trace logging toggle and the action to open the dedicated log folder.
- The settings component remains visual: persistence goes through root app state and FastAPI config updates, while folder opening and log writes go through runtime/API helpers.

## Project Creation Modal Structure

- `CreateProjectDialog` must be organized as tabs or a wizard rather than a long all-in-one form.
- Each project source mode owns its visible fields: blank local project, existing local folder, and GitHub repository project.
- The modal uses a constrained height with scrollable content and a footer that keeps primary/secondary actions visible.
- Responsive behavior is required: desktop can use tabs or a step rail; smaller screens should collapse to a wizard-like sequence or top tabs with concise labels.
- Mode changes preserve form state already entered during the same dialog session.
- Validation and loading states are scoped to the active mode and focus moves to the relevant field or step when an error blocks progression.
- The same dialog supports both populated-project creation from `Nuevo proyecto` and first-project creation from `Añadir primer proyecto`.

## Markdown Editor Toolbar

- `MarkdownToolbar` renders grouped editor intent only; command execution stays in `editorCommands.ts`.
- Block formats are selected through one dropdown from paragraph through heading level 6.
- Table insertion passes explicit row/column options to the editor controller instead of relying on a fixed table size.
- Extended underline visibility is driven by `AppearanceConfig.markdownExtendedUnderlineEnabled`; when enabled, Milkdown serializes underline as inline HTML.
- Responsive compaction is CSS-driven so the toolbar remains one fixed row and moves lower-priority actions into menus instead of creating structural scroll.

## External Changes UX

- The global sync indicator lives at the right edge of the document tab row and uses product states: `Sincronizado`, `Cambios externos detectados`, `Revisión necesaria`, `Guardando versión`, `Sincronizando con GitHub`, `Pendiente de sincronizar`, and `Error de sincronización`.
- When the active project has external changes, the document canvas shows a compact banner above the editor. Safe batches can be imported directly; risky batches route to review.
- Review opens as a right drawer so the user keeps document context. The drawer groups files by folders, Markdown documents, images, attachments, private files, ignored files, and unsupported files. Safe items are preselected; review items need user selection; blocked items cannot be included.
- Newly detected tree items receive temporary badges such as `Nuevo`, `Modificado`, `Eliminado`, or `Revisar`. Badges disappear after the external-change set is imported and the backend reports a clean state.
- Copy must stay human and non-Git-heavy. The UI can say `versión local`, `GitHub`, `pendiente`, and `sincronizado`; it must not expose branch names, `git add`, `commit hash`, `origin`, or `main`.
