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

## Current Mock Strategy

Mocks live in `src/lib/mockData.ts` and are exposed through API modules only as a browser-only fallback when the local API is not running. By default the desktop frontend attempts to use FastAPI.

## Persisted App State

- Project creation, project editing, and active project selection go through `src/lib/api/projects.ts` and are persisted by FastAPI in `projects.json`.
- Layout widths and per-project open document tabs go through `src/lib/api/config.ts` and are persisted by FastAPI in `config.json`.
- The document tree goes through `src/lib/api/projects.ts` and reflects the Markdown files and folders under the active project's local folder.
- Open documents are tracked as per-tab editing sessions in the root app state. Each session owns its own Markdown content, dirty state, draft metadata, and Milkdown instance while the tab remains open.
- Unsaved document changes are autosaved through `src/lib/api/documents.ts` to FastAPI-managed internal drafts. React must not write draft files directly.
- UI components receive persisted values as props and dispatch user intent back to the root app state.
