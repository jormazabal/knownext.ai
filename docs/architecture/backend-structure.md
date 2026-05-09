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
- `draft_service`: internal recoverable document drafts, stored in the KnowNext.ai app data directory and never beside project documentation files.
- `version_service`: commit history abstraction.
- `ai_service`: document-aware AI prompt handling.

## Local Application Files

The local API owns application metadata files. React must access them through API contracts, not by reading files directly.

- `projects.json`: known projects, their local documentation folder paths, visual metadata, and the active project id.
- `config.json`: user-level application configuration such as sidebar and history panel widths, plus the open document tabs per project, active document id, and tab order.
- `drafts/*.json`: internal unsaved document working copies with their base file fingerprint. These files are recoverable application state, not project documentation, and must not be written into project folders.

By default these files are stored in `%APPDATA%/KnowNext.ai` on Windows and `~/.knownext.ai` elsewhere. Tests and local tooling can override the directory with `KNOWNEXT_APP_DATA_DIR`.

## Future Persistence

Project metadata remains in local JSON, while document tree and Markdown document operations now read and write the project folder on disk through backend services. Unsaved document content is mediated by `draft_service` until the user explicitly saves to disk. Routers should stay thin and call services when contracts evolve.
