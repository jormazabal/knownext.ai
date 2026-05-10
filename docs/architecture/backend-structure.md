# Backend Structure

Backend code lives in `backend/app`.

## Folders

- `api`: FastAPI routers.
- `core`: settings and runtime configuration.
- `schemas`: Pydantic request and response schemas.
- `services`: business/service layer.
- `models`: future domain models and persistence helpers.

## Service Boundaries

- `project_service`: project list and document tree.
- `filesystem_service`: local project folder scanning and Markdown file operations for the navigation tree.
- `config_service`: application configuration, including persisted layout widths.
- `app_storage`: shared JSON file storage rooted in the KnowNext.ai application data directory.
- `document_service`: document loading and saving.
- `draft_service`: internal recoverable document drafts, stored in the KnowNext.ai app data directory and never beside project documentation files. Draft keys are internal identifiers derived from draft files, not user paths or product document ids.
- `auth_service` and `credential_service`: optional GitHub identity, OAuth device flow, and local credential storage. Tokens are never stored in project metadata.
- `git_service`: local Git operations mediated by FastAPI; React never executes Git.
- `github_service`: GitHub REST API access for repository discovery, cache hydration, history, and commit creation.
- `version_service`: provider abstraction for local Git and GitHub API histories. Development fakes must not be exposed as production history.
- `ai_service`: document-aware AI prompt handling. If a real provider is not configured, the API must return an explicit unavailable/placeholder state rather than a production-looking fake answer.

## Local Application Files

The local API owns application metadata files. React must access them through API contracts, not by reading files directly.

- `projects.json`: known projects, local/cache folder paths, visual metadata, per-project storage/versioning/sync modes, optional GitHub repository metadata, and the active project id.
- `config.json`: user-level application configuration such as sidebar and history panel widths, plus the open document tabs per project, active document id, and tab order.
- `credentials.json`: GitHub auth state outside `projects.json`; access tokens are protected with Windows DPAPI when available and fall back to plain local JSON only on unsupported development/test environments.
- `drafts/*.json`: internal unsaved document working copies with their base file fingerprint. These files are recoverable application state, not project documentation, and must not be written into project folders. Orphan drafts are conserved until the user restores or discards them.

By default these files are stored in `%APPDATA%/KnowNext.ai` on Windows and `~/.knownext.ai` elsewhere. Tests and local tooling can override the directory with `KNOWNEXT_APP_DATA_DIR`.

Layout width values in `config.json` are user preferences. Services should preserve known width fields, tolerate missing legacy values, and return defaults when values are absent or invalid so the frontend can clamp and render resizable panels safely.

## Project Modes

- `local-files` + `none`: available without login; document operations read and write the selected local folder.
- `local-files` + `local-git`: requires GitHub login by product decision; local Git provides document history and optional manual GitHub sync.
- `local-cache` + `github-api`: requires GitHub login; GitHub is the versioning authority while KnowNext.ai keeps a local cache for editing and drafts.

Project metadata remains in local JSON, while document tree and Markdown document operations are mediated by backend services. Unsaved document content is mediated by `draft_service` until the user explicitly saves or versions it. Routers should stay thin and call services when contracts evolve.

## Empty And Unavailable Data Contracts

- `GET /api/projects` may return an empty array. This is a valid loaded state and must not be replaced by seeded projects unless an explicit onboarding/import action creates them.
- `GET /api/projects/active` must clearly represent no active project when no projects exist, either through a documented `null`/empty contract or an explicit not-found response consumed by the frontend as the first-project state.
- Auth endpoints must distinguish anonymous/disconnected users from authenticated users. They must not return mock users in normal product runtime.
- History and AI endpoints must distinguish unavailable providers, empty results, and service errors with structured responses or documented status errors so the UI can show the correct empty or disabled state.

## Draft and Sync Contracts

- `POST /api/documents/sync-status` checks open document fingerprints for active external changes without loading full document content.
- `GET /api/drafts/orphans` lists recoverable drafts whose original file is missing.
- `POST /api/drafts/{draftKey}/restore` recreates the original Markdown file only when it does not already exist.
- `DELETE /api/drafts/{draftKey}` discards an internal draft by internal draft key.
