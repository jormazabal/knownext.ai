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
- `config_service`: application configuration, including persisted layout widths, appearance preferences such as locale, zoom, theme mode, and primary accent color, diagnostics settings, AI provider/model settings, RAG settings, image-generation settings, and agentic task permission/limit settings. Per-task reasoning depth is carried on AI interaction requests, not stored as the primary app-level control.
- `logging_service`: trace logging to a dedicated local log folder. Error and critical entries are always written; informational entries require diagnostics logging to be enabled.
- `app_storage`: shared JSON file storage rooted in the KnowNext.ai application data directory, with per-file locking and atomic temporary-file replacement for concurrent API requests.
- `document_service`: document loading and saving.
- `draft_service`: internal recoverable document drafts, stored in the KnowNext.ai app data directory and never beside project documentation files. Draft keys are internal identifiers derived from draft files, not user paths or product document ids.
- `auth_service` and `credential_service`: optional GitHub identity, OAuth device flow, and local credential storage. Tokens are never stored in project metadata.
- `git_service`: local Git operations mediated by FastAPI; React never executes Git.
- `github_service`: GitHub REST API access for repository discovery, cache hydration, history, and commit creation.
- `version_service`: provider abstraction for local Git and GitHub API histories. Development fakes must not be exposed as production history.
- `external_changes_service`: project-scoped detection and import of files changed outside KnowNext.ai. It classifies local Git working-tree changes into safe, review, and blocked groups, creates a local version for selected safe paths, and optionally attempts remote sync through backend Git services.
- `ai_service`: project-scoped AI orchestration for prompts, active document and containing-folder context, optional selected-text focus context, short recent conversation context, conversation events, structured interaction plans, document edit plans, image-generation plans, permission-gated project file operations including create, duplicate, move, and delete flows, guided task plans, configured task limits, and RAG query context. It must only apply document changes from explicit structured document-change fields or validated image insertion plans, never by inferring edits from conversational text.
- `ai_context_service`: project-scoped active prompt context. It owns visible prompt sources, `@` project-document lookup, external file upload, text extraction, image payload preparation, one-hour inactivity expiry, source previews, source removal/extension, and conversion of extracted external text into project Markdown documents. React sends source ids; this service resolves current content at interaction time.
- `transcription_service`: realtime microphone transcription proxy. React streams local PCM audio to FastAPI over a local WebSocket; this service opens the OpenAI Realtime transcription session with the configured model, normalizes delta/completed/error events, and never writes audio or transcript contents to trace logs.
- `rag_service`: project RAG indexing boundary. It owns the local manifest, incremental Markdown scanning by hash, local SQLite FTS exact search, and OpenAI vector-store synchronization state.
- `openai_service`: OpenAI Responses API, strict structured response parsing, GPT Image generation, and low-level vector-store/file operations. It is the only backend service that should call OpenAI directly.

## Local Application Files

The local API owns application metadata files. React must access them through API contracts, not by reading files directly.

- `projects.json`: known projects, local/cache folder paths, visual metadata, per-project storage/versioning/sync modes, optional GitHub repository metadata, and the active project id.
- `config.json`: user-level application configuration such as sidebar and history panel widths, appearance settings including theme mode and primary accent color, diagnostics settings, AI model/RAG/agentic-task limits, plus the open document tabs per project, active document id, and tab order.
- `ai-conversations/*.json`: project-scoped AI conversation events, including user prompts, assistant responses, and file-operation events.
- `ai-context/<project-id>/sources.json`: active AI prompt-context source metadata, expiry timestamps, processing state, source type, warnings, and file references. External source originals and extracted previews live under sibling `files/` and `extracted/` folders and are temporary app data, not project documentation.
- `ai-pending-deletes.json`: legacy short-lived AI delete requests retained for backward-compatible confirmation cleanup.
- `ai-rag-manifests/*.json`: project-scoped RAG manifests with vector store id, last indexed time, per-document `sha256`, local path, OpenAI file ids, indexing status, and failures. Global AI settings can enable RAG, but vector store state is tracked per project.
- `ai-rag/*.sqlite3`: project-scoped SQLite FTS indexes for local exact keyword search. These indexes complement OpenAI File Search and are rebuilt from Markdown content during indexing.
- `logs/knownext.log`: readable trace blocks for user-visible errors, runtime failures, backend startup/shutdown, and sidecar supervision. This folder is dedicated to logs; errors are always written and informational entries depend on diagnostics settings.
- `credentials.json`: GitHub auth state and OpenAI API key outside `projects.json`; secrets are protected with Windows DPAPI when available and fall back to plain local JSON only on unsupported development/test environments.
- `drafts/*.json`: internal unsaved document working copies with their base file fingerprint. These files are recoverable application state, not project documentation, and must not be written into project folders. Orphan drafts are conserved until the user restores or discards them.
- `runtime.json`: native/runtime-only desktop settings such as backend port mode. It is intentionally separate from backend-served `config.json` because the frontend may need the endpoint before the backend can be reached.

By default these files are stored in `%APPDATA%/KnowNext.ai` on Windows and `~/.knownext.ai` elsewhere. The installed Tauri app overrides this with its app profile, currently `%APPDATA%/ai.knownext.desktop`, and browser development should use `pnpm backend:web`, which sets a separate web profile under `%APPDATA%/ai.knownext.web`. The backend `/health` response identifies the active runtime with `app=knownext`, `profile`, `version`, `port`, `managedBy`, `instanceId`, and `appDataDir`; frontends must reject a backend whose profile does not match their runtime. When project creation sends an empty `folderPath`, the backend allocates a managed folder under `projects/<project-id>` inside the active app data directory. Tests and local tooling can override the directory with `KNOWNEXT_APP_DATA_DIR`.

Layout width values in `config.json` are user preferences. Services should preserve known width fields, tolerate missing legacy values, and return defaults when values are absent or invalid so the frontend can clamp and render resizable panels safely.

## Project Modes

- `local-files` + `none`: available without login; document operations read and write the selected local folder.
- `local-files` + `local-git`: requires GitHub login by product decision; local Git provides document history and optional manual GitHub sync.
- `local-cache` + `github-api`: requires GitHub login; GitHub is the versioning authority while KnowNext.ai keeps a local cache for editing and drafts.

Project metadata remains in local JSON, while document tree and Markdown document operations are mediated by backend services. Unsaved document content is mediated by `draft_service` until the user explicitly saves or versions it. Routers should stay thin and call services when contracts evolve.

Image assets are normal files inside the project folder. `filesystem_service` exposes supported images in the tree, `asset_service` owns upload/metadata/content/usage/image-reference contracts, and `asset_reference_service` parses and rewrites Markdown image links. Moving or renaming images rewrites matching Markdown references across the project; moving Markdown documents rewrites that document's relative image links.

AI-generated images use the same asset path as uploaded images. `ai_service` executes only structured `imageGeneration` plans, calls `openai_service.generate_image`, writes the returned bytes through `asset_service.create_generated_image`, returns the refreshed tree, and optionally returns `updatedDocument` with a relative Markdown image reference. If insertion fails after generation, the asset remains in the project and the response reports the insertion issue separately.

## Empty And Unavailable Data Contracts

- `GET /api/projects` may return an empty array. This is a valid loaded state and must not be replaced by seeded projects unless an explicit onboarding/import action creates them.
- If an old seeded registry with `Proyecto Alpha`, `Proyecto Beta`, and `Proyecto Gamma` is found, the backend must ignore it, recover a valid non-seed registry backup when available, or return the empty-project state.
- `GET /api/projects/active` must clearly represent no active project when no projects exist, either through a documented `null`/empty contract or an explicit not-found response consumed by the frontend as the first-project state.
- Auth endpoints must distinguish anonymous/disconnected users from authenticated users. They must not return mock users in normal product runtime.
- History and AI endpoints must distinguish unavailable providers, empty results, and service errors with structured responses or documented status errors so the UI can show the correct empty or disabled state.
- AI document edits must return updated Markdown to the frontend without writing to disk. The normal draft/save flow remains responsible for persistence.
- AI interactions must separate conversational answer, document change, image generation, project operations, and task plan in the response contract. A provider answer alone is a conversation event; it is not document Markdown.
- Agentic task plans can only be surfaced from reasoning-mode interactions and must respect web-research permission plus max step/document/source/cost limits before surfacing in the UI.
- AI selected-text focus is an additive context item for resolving references in the current prompt. It must not replace `activeDocument.markdown`.
- AI prompt context source ids are resolved by FastAPI at interaction time. If a source is expired, missing, processing, or unreadable, it must not be silently treated as active context; responses return the current source list and expired ids so the prompt can stay visually truthful.
- Project image context sources are resolved by FastAPI and passed to OpenAI Responses as image inputs only when vision is enabled. The configured vision model is used for interactions with explicit image context, and image indexing stores local visual descriptions generated through the configured vision model/detail.
- Image-generation intent is semantic and structured. The backend must not use user-text keyword matching to decide whether to generate or insert an image; the LLM planner returns `imageGeneration.intent`, prompt, destination, and metadata, and the backend validates permissions and target document state before execution.
- Realtime transcription events are not AI document operations. Prompt transcription fills the local prompt input and waits for explicit submit; document dictation inserts confirmed transcript segments into the active Milkdown buffer as user edits, leaving normal dirty/save and undo/redo behavior in place.
- AI duplicate and move operations must return the refreshed tree and any affected document id/path mappings so open tabs and drafts can follow moved files.
- AI operations must use configured app permissions as the execution gate. If a permission is enabled, the backend may execute the structured operation directly; if it is disabled, the backend returns a structured `permission_blocked` operation with guidance to change `Configuración de la app > IA`.

## Draft and Sync Contracts

- `POST /api/documents/sync-status` checks open document fingerprints for active external changes without loading full document content.
- `GET /api/projects/{project_id}/external-changes` returns the current external-change set for the project.
- `POST /api/projects/{project_id}/external-changes/scan` forces a rescan of external filesystem/Git changes.
- `POST /api/projects/{project_id}/external-changes/import` imports selected external changes as a local version and returns the refreshed tree plus human sync state. React sends item decisions only; Git add/commit/push remains backend-owned.
- `GET /api/drafts/orphans` lists recoverable drafts whose original file is missing.
- `POST /api/drafts/{draftKey}/restore` recreates the original Markdown file only when it does not already exist.
- `DELETE /api/drafts/{draftKey}` discards an internal draft by internal draft key.

External-change detection is implemented for `local-files + local-git` projects using Git porcelain status. The backend treats Markdown and supported images as safe when small, attachments as review, deletions as review, and private/technical paths such as `.env`, key/certificate files, `.git`, `node_modules`, `dist`, and `build` as blocked or omitted. `local-cache + github-api` projects currently return an unsupported detection message until a cache baseline strategy is defined.
