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

Mocks live in `src/lib/mockData.ts` and are exposed through API modules only as a browser-only fallback when the local API is not running. By default the desktop frontend attempts to use FastAPI.

## Persisted App State

- Project creation, project editing, and active project selection go through `src/lib/api/projects.ts` and are persisted by FastAPI in `projects.json`.
- GitHub auth status and device-flow login go through `src/lib/api/auth.ts`; tokens are never exposed to arbitrary UI components.
- Project capabilities and versioning status are fetched per project so the assistant can show disabled Git/GitHub options without hiding them.
- Layout widths and per-project open document tabs go through `src/lib/api/config.ts` and are persisted by FastAPI in `config.json`.
- The document tree goes through `src/lib/api/projects.ts` and reflects the Markdown files and folders under the active project's local folder.
- Open documents are tracked as per-tab editing sessions in the root app state. Each session owns its own Markdown content, dirty state, draft metadata, and Milkdown instance while the tab remains open.
- Unsaved document changes are autosaved through `src/lib/api/documents.ts` to FastAPI-managed internal drafts. React must not write draft files directly.
- Open document sessions are checked with backend sync-status polling and window focus refreshes so external disk changes become visible without replacing local editor content.
- Recoverable orphan drafts are exposed through the account actions menu as a discrete maintenance panel.
- The project assistant supports local files, local Git with manual sync, and GitHub API projects. Versioned modes remain disabled until GitHub login is active.
- The history button is enabled only when the active project has a versioning provider and the user is authenticated.
- UI components receive persisted values as props and dispatch user intent back to the root app state.
