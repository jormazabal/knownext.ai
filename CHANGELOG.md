# Changelog

All KnowNext.ai releases use a single monolithic application version for the desktop frontend, Tauri shell, and FastAPI backend.

## 0.17.1 - 2026-05-18

- Added distinct tree badges/icons for PDF, DOCX, PPTX, XLSX, TXT, and CSV support files.
- Kept the document-tree toolbar fixed while only the folder/file list scrolls.
- Broadened support-file management so non-private unknown file types are scanned, imported, renamed, moved, deleted, and versioned as generic files.
- Added frontend and backend coverage for typed support-file icons, generic attachments, and external-change classification.

## 0.17.0 - 2026-05-17

- Added first-class management for project support files such as PDF, Office documents, CSV/TSV, text, JSON/YAML/XML, and archives.
- Extended the document tree with support-file icons, search, `Solo archivos` filtering, import, rename, move, delete, and no internal viewer for non-previewable files.
- Added backend support-file scanning, import, privacy filtering, external-change classification, and AI prompt context extraction for readable project files.
- Updated frontend/backend contracts, tests, product documentation, architecture notes, and manual acceptance coverage for support-file workflows.

## 0.16.2 - 2026-05-17

- Prevented external-change scanning from overlapping with selected imports, avoiding transient Git `index.lock` failures with larger pasted batches.
- Reduced external-change scans to a single Git status read and added retry handling for temporary `index.lock` contention.

## 0.16.1 - 2026-05-17

- Fixed external-change imports for folders and files with non-ASCII characters in their path, including names such as `Facturación`.
- Added backend coverage for Git quoted UTF-8 paths so pasted Windows folders do not produce mojibake paths like `FacturaciÃ³n`.

## 0.16.0 - 2026-05-17

- Added external-change detection for local Git projects so pasted folders and files from Windows Explorer are surfaced inside KnowNext.ai instead of silently waiting in Git status.
- Added a compact sync indicator, document banner, review drawer, and temporary tree badges for external changes, using product language instead of Git internals.
- Classified external changes into safe, review, and blocked groups, with Markdown/images preselected, attachments/deletions requiring review, and private or technical files omitted.
- Added backend-mediated import of selected external changes into a local version, with optional GitHub sync handled outside React.
- Updated product, architecture, and manual acceptance documentation for the external-change import workflow.

## 0.15.1 - 2026-05-17

- Unified the embedded AI prompt controls so context, mode, microphone, transcription menu, and send actions share the same background, border, and hover treatment.
- Added differentiated microphone target icons for prompt transcription and document transcription, including the target selection menu.
- Improved the Markdown editor cursor UX with an orange focused caret and a persistent fixed orange caret when focus moves to another control such as the AI prompt.
- Hardened the editor caret behavior across focus changes so the document keeps visible insertion context without showing a blinking editor caret while another input is active.

## 0.15.0 - 2026-05-16

- Added a compact document-tree search modal from the sidebar search icon for folder and Markdown document names.
- Added incremental name matching for fragments at the start, middle, or end of folder and document names, including multi-token queries and diacritic-insensitive matching.
- Added contextual parent-folder paths in search results so documents can be distinguished without searching document content.
- Added keyboard-first search behavior: focused input on open, Up/Down navigation, Tab/Enter selection, Escape close, and click-outside dismissal.
- Added inline first-result completion in the search input with a softer suggestion layer that avoids visual gaps between typed text and completion.
- Selecting a document now closes search, opens the document, expands parent folders, and scrolls the tree selection into view; selecting a folder expands and selects it without changing the current document.
- Added focused frontend tests and manual acceptance coverage for name-only search behavior.

## 0.14.0 - 2026-05-16

- Added AI-generated project images from the prompt: structured image-generation plans create normal image assets, open generated image tabs, and can insert relative Markdown image references into the active Milkdown document.
- Added separate image-generation settings and permissions for GPT Image model, size, quality, output format, prompt metadata, image asset creation, and document insertion.
- Redesigned the application settings modal with document-style tabs, a configuration summary, a richer Interface tab, a complete Capabilities tab, and updated IA documental plus system diagnostics sections.
- Added a reusable AI model selector with capacity, cost, recommendation tags, compact and full variants, and combobox-style option behavior.
- Added multimodel AI usage accounting and UI summaries by capability and by model, including generated image, vision, audio, document AI, and agentic task buckets.
- Added backend usage events for image generation, image vision indexing, realtime audio transcription, and agentic tasks, plus compatibility for generated images created before image usage events existed.
- Improved generated image asset organization with configurable default project folders and clearer settings copy for custom storage preferences.

## 0.13.0 - 2026-05-15

- Added realtime audio transcription controls to the AI prompt with selectable destination: prompt input or active Markdown document cursor.
- Added configurable transcription settings for provider model, favorite languages, language selection, and local backend-mediated OpenAI Realtime WebSocket sessions.
- Improved the microphone control UX with a compact split action/menu treatment, active recording feedback, and clearer local transcription connection errors.
- Extended Milkdown integration so dictated text can be inserted at the current document selection while preserving editor focus and undo behavior.
- Improved image asset viewing with compact metadata, pixel dimensions, color depth, zoom controls, fit-to-window behavior, and a cleaner right-side details panel.
- Hardened Markdown image reference detection for filenames with spaces and added clickable image usage references back into Markdown documents.
- Refined document workspace geometry around the prompt input, scroll area, status bar, light-mode send button, and global tooltip dismissal when opening menus.
- Aligned frontend and FastAPI backend contracts for transcription, image metadata, backend discovery, and version compatibility.

## 0.12.1 - 2026-05-14

- Refined the document workspace layout with resizable integrated side panels and an integrated collapsed left rail that preserves access to the application menu.
- Improved desktop panel controls, project selector alignment, and collapsed account access for the document navigation panel.
- Standardized modal overlays with a subtle backdrop blur and improved the recoverable drafts dialog copy, empty state, and action styling.
- Refined the Markdown editor toolbar labels, AI prompt controls, document status bar, and Git/history visibility rules for projects without active versioning.
- Reduced excessive editor empty space and prompt fade behavior so short documents do not show unnecessary scrollbars while long documents remain scrollable.
- Continued dark-mode polish for tabs, toolbars, tooltips, prompt input, and theme-aware interface surfaces.

## 0.12.0 - 2026-05-14

- Added global appearance personalization from `Configuración de la app > Apariencia`, including Light, Dark, and system-synchronized theme modes.
- Added configurable primary color support using the same project color range for navigation, active states, focus rings, controls, settings previews, and editor chrome.
- Reworked the dark theme into a neutral graphite palette that keeps contrast, hierarchy, hover states, tooltips, tabs, editor controls, and the AI prompt visually integrated.
- Added theme-aware accent tokens shared by frontend settings, Tailwind utilities, and persisted local appearance configuration.
- Added a dynamic KnowNext.ai brand mark so the app logo, startup mark, and watermark adapt to the selected primary color without duplicating static logo assets.
- Hardened backend appearance configuration defaults and migration behavior so older local configs can load without missing theme or color fields.
- Updated product, frontend/backend architecture, and manual validation documentation for global appearance customization.

## 0.11.0 - 2026-05-14

- Added project image asset management: image files now appear in the tree, can be imported into folders, opened in an image viewer, inserted into Markdown, and used as AI prompt context.
- Added Markdown image reference governance so moving or renaming images and moving Markdown documents rewrites relative links where possible and warns before breaking referenced images.
- Added configurable OpenAI vision controls for image context and image indexing, including model/detail selection and project image reindexing.
- Redesigned project tree actions and file filtering so creation/import, view filters, expand/collapse, and project settings sit in a compact professional toolbar.
- Improved settings UX with top-level tabs and a denser IA panel for OpenAI credentials, vision settings, permissions, agentic limits, and RAG indexing.
- Hardened legacy AI configuration loading so older local configs without vision or agentic defaults no longer crash the IA settings panel.
- Updated product, architecture, backend service, API contract, and manual validation documentation for project image workflows.

## 0.10.0 - 2026-05-13

- Added persistent AI prompt context chips for project document references and external files, making the exact context sent to the model visible before every prompt.
- Added `@` document reference search in the AI prompt with incremental filtering over the active project's Markdown tree.
- Added external file context uploads for Markdown, text, PDF, DOCX, PPTX, and image files, including drag-and-drop, paste handling, previews, and conversion of supported external text sources into project documents.
- Added time-boxed prompt context with expiry, warning states, manual removal, one-hour extension, and conversation-level source traceability.
- Routed explicit prompt context through FastAPI AI contracts and OpenAI Responses payloads, including image context when the selected model supports vision input.
- Updated backend context contracts, frontend API clients, architecture notes, AI interaction guidance, and manual acceptance coverage for the new context workflow.

## 0.9.0 - 2026-05-13

- Added a complete document undo/redo history model with independent enabled states, bounded in-memory history, and AI document edits recorded as undoable editor changes.
- Made AI execution respect the configured permissions consistently: allowed edit operations run directly, while blocked operations explain which IA settings must be changed.
- Improved AI proactivity for active-document requests so direct editing tasks avoid unnecessary clarification loops and use the active Markdown document as context.
- Hardened local backend readiness, timeout handling, restart diagnostics, and frontend health checks for browser-development and installed-app flows.
- Redesigned the Markdown editor toolbar with a block-format dropdown, H1-H6 support, grouped inline and structural actions, extended underline support, and responsive overflow menus.
- Added a visual table insertion picker with grid selection and manual row/column fallback.
- Added an Appearance setting to show or hide the extended underline action, with explanatory copy because underline is represented as HTML inside Markdown.
- Fixed document tab/header layout so only the document canvas scrolls vertically while title, tabs, toolbar, prompt, and status surfaces remain stable.
- Simplified AI modified-document bubbles by removing redundant path text already present in the title.
- Updated product, frontend/backend architecture, AI interaction, manual validation, and release documentation for `0.9.0`.

## 0.8.0 - 2026-05-13

- Added prompt-level AI response modes so everyday requests can stay in fast direct mode while reasoning tasks can opt into structured preflight and selectable depth.
- Added structured pending-intent handling for document AI work, including preserved target documents, explicit action controls, web permission flow, and deterministic execution after validated LLM decisions.
- Added selected-text focus context, active document folder context, move/duplicate action support, and safer handling for conversational responses versus document edits.
- Added AI usage UI and backend usage accounting foundations grouped by model, interactions, tokens, and estimated cost.
- Redesigned the AI conversation tab, prompt input, response bubbles, and pending action controls for a more compact professional chat-style experience.
- Added drag-and-drop moving for documents and folders in the project tree with visual drop targets and backend validation.
- Improved the document status bar so save appears only when needed and document metrics are separated from history/status information.
- Updated AI interaction documentation, backend contracts, frontend coverage, and manual validation notes for `0.8.0`.

## 0.7.2 - 2026-05-12

- Moved AI system response notices out of the document body into compact floating bubbles above the prompt, with right alignment, large rounded corners, and a close action.
- Added a right-aligned waiting bubble while an AI prompt is processing.
- Simplified the applied-change notice so it only shows the change summary; document undo remains handled by the editor-level controls.
- Added an AI model selector in Settings with clear intelligence and cost indicators for `gpt-5.5`, `gpt-5.4`, `gpt-5.4-mini`, and `gpt-5.4-nano`.
- Persisted the selected AI model through the frontend/backend configuration contract and used it for OpenAI Responses API interactions.
- Fixed browser-development backend discovery so the web app can recover from incompatible local backend instances and use a compatible `web-dev` backend.
- Fixed the account menu and service diagnostic copy interaction in the settings panel.
- Updated release metadata, backend contract coverage, frontend tests, and manual acceptance checks for `0.7.2`.

## 0.7.1 - 2026-05-12

- Added profile-aware local API identity so browser development, installed desktop builds, and older versions no longer reuse an incompatible backend silently.
- Added automatic packaged-desktop backend port selection across `8765-8799`, fixed-port configuration, and transactional restart/rollback from the Services settings panel.
- Improved the Services diagnostics panel with active/expected profile, endpoint, port, manager, instance, app-data path, restart availability, and copyable diagnostics.
- Fixed document AI edit prompts so requests such as `Redacta una receta de cocina` update the active Milkdown document buffer without surfacing local API timeout errors.
- Hardened frontend API readiness, request timeouts, backend profile validation, and manual recovery messaging.
- Updated runtime architecture docs, backend contract docs, manual acceptance checks, and release metadata for `0.7.1`.

## 0.7.0 - 2026-05-11

- Added the project-scoped AI conversation tab with persisted messages, day grouping, file-operation events, and a compact icon-only tab.
- Added OpenAI-backed AI interactions through FastAPI, including secure local API key storage, provider status, and configurable permissions for creating folders, creating documents, and requesting deletes.
- Added direct AI document edits that update the active editor buffer as unsaved changes, with conflict blocking, an applied-change banner, and undo support.
- Added informational AI response bubbles above the prompt with dismiss/open actions and dissolve transitions.
- Added confirmed AI delete flow, project tree refreshes for AI-created content, and conversation records for document and filesystem actions.
- Added opt-in project RAG with OpenAI vector stores, per-project local manifests, incremental Markdown indexing, and complementary SQLite exact search.
- Updated AI product, frontend/backend architecture, manual checklist, backend contract tests, and release metadata for `0.7.0`.

## 0.6.15 - 2026-05-11

- Added managed browser-project storage so web-created projects live inside the backend web sandbox instead of exposing or scanning arbitrary local repository folders.
- Improved the project creation and editing experience for browser and desktop modes, including clearer web-mode restrictions, safer editable fields, a more compact project editor, and hidden backend paths in the browser UI.
- Hardened startup API readiness and transient GET requests so browser refreshes do not surface local API connection toasts while the backend is still becoming ready.
- Fixed RAG index status checks so the UI does not call the index endpoint when document indexing is disabled, and corrected the backend index-status response for enabled RAG flows.
- Added tests and documentation for managed project storage, web-mode project creation, editor behavior, and AI index-status handling.
- Updated release metadata and installer download links for `0.6.15`.

## 0.6.14 - 2026-05-11

- Separated desktop and browser development API profiles so the installed Windows app uses `8765` with the desktop app-data directory while the browser build uses `8766` with its own web app-data directory.
- Allowed local browser origins on arbitrary development ports, fixing CORS preflight failures from `127.0.0.1:1421` and similar Vite URLs.
- Removed runtime exposure of seeded mock projects and added recovery from valid `projects.json.corrupt-*` backups before falling back to an empty project registry.
- Hardened JSON persistence with per-file locking and unique temporary files to avoid Windows `WinError 32` failures during concurrent project, credential, and configuration writes.
- Updated release metadata and installer download links for `0.6.14`.

## 0.6.13 - 2026-05-11

- Added a Services section to application settings with local backend health, version/profile details, endpoint, sidecar path, last error, manual check, and restart action.
- Added packaged-app backend supervision so KnowNext.ai periodically checks `/health` and attempts to restart the bundled backend if it stops or becomes incompatible.
- Improved backend startup diagnostics with explicit supervisor, manual restart, health-check, and FastAPI startup/shutdown trace entries.
- Added frontend coverage for the services status panel.
- Updated release metadata and installer download links for `0.6.13`.

## 0.6.12 - 2026-05-11

- Improved the project editor with a maintenance-focused UI, editable identity/local path fields, and read-only technical configuration for origin, storage, history, sync, and GitHub repository.
- Preserved existing project storage, versioning, sync, and GitHub metadata when saving edits so the editor cannot accidentally convert the project type.
- Added frontend coverage for editing GitHub-backed projects with read-only technical configuration.
- Updated release metadata and installer download links for `0.6.12`.

## 0.6.11 - 2026-05-11

- Fixed startup after updates by rejecting stale local API processes from older app versions or different data profiles before starting the bundled backend.
- Added recovery for projects, configuration, and credentials when an update creates a new empty data profile while a previous KnowNext.ai profile still exists.
- Improved diagnostics so controlled API errors, startup failures, visible UI errors, and backend version/profile mismatches are written to `knownext.log` with useful detail.
- Kept project loading resilient when a secondary startup request, such as versioning status, fails.
- Updated release metadata and installer download links for `0.6.11`.

## 0.6.10 - 2026-05-11

- Fixed the versioning status check for newly created local Git projects before their first commit exists.
- Prevented empty Git repositories created during "Create GitHub repo from local" from surfacing `fatal: Needed a single revision` as an application error.
- Updated release metadata and installer download links for `0.6.10`.

## 0.6.9 - 2026-05-11

- Reworked project creation into a guided assistant with ordered scenarios, gated steps, a final review screen, and clearer explanations for local, Git, and GitHub project setup.
- Added the local-folder-to-new-GitHub-repository flow with repository owner/name, visibility selection, GitHub repository creation, and local `origin` configuration.
- Persisted desktop window size and position so the workspace restores the user's last layout after restarting.
- Updated release metadata and installer download links for `0.6.9`.

## 0.6.8 - 2026-05-10

- Fixed GitHub device login so `slow_down` responses keep the authorization pending instead of showing a raw error.
- Kept GitHub authorization polling active while the login dialog is waiting and prevented duplicate checks from repeated manual clicks.
- Opened the GitHub verification page through Tauri's native shell integration with a browser fallback for development.
- Updated release metadata and installer download links for `0.6.8`.

## 0.6.7 - 2026-05-10

- Fixed packaged backend startup by resolving the installed `knownext-backend.exe` next to the desktop executable instead of using the build-time `binaries/` sidecar path.
- Added clearer backend startup diagnostics with the resolved sidecar path and captured backend stdout/stderr in `knownext.log`.
- Changed the Windows updater manifest to prefer the NSIS setup artifact so normal per-user updates do not require administrator permissions.
- Updated release metadata and installer download links for `0.6.7`.

## 0.6.6 - 2026-05-10

- Included the root `VERSION` file in the PyInstaller backend sidecar so `/health` reports the packaged application version instead of `0.0.0`.
- Kept the packaged backend sidecar, readable trace logs, shared app data profile, and release-workflow sidecar health validation from the unpublished `0.6.4` and `0.6.5` tags.
- Updated release metadata and installer download links for `0.6.6`.

## 0.6.5 - 2026-05-10

- Strengthened backend sidecar packaging by collecting all backend `app.*` submodules during PyInstaller builds.
- Added release-workflow diagnostics for backend sidecar stdout and stderr when the `/health` validation fails.
- Kept the packaged FastAPI sidecar startup, shared app data directory, readable trace log format, and background diagnostics cleanup introduced for the unpublished `0.6.4` tag.
- Updated release metadata and installer download links for `0.6.5`.

## 0.6.4 - 2026-05-10

- Packaged the FastAPI backend as a Windows sidecar and start it from Tauri in release builds.
- Added a startup health check so the local API is expected to be ready before the frontend begins normal API calls.
- Passed the Tauri app data directory to the backend through `KNOWNEXT_APP_DATA_DIR` so runtime state and logs use the same profile.
- Changed frontend, Tauri, and backend trace entries from compact JSON lines to readable timestamped log blocks.
- Stopped suppressed background API connection failures from being written repeatedly to diagnostics.
- Updated the Windows release workflow to build the backend sidecar before creating Tauri installer artifacts.
- Updated release metadata and installer download links for `0.6.4`.

## 0.6.3 - 2026-05-10

- Stopped expected local API connection failures from repeatedly showing notices or flooding diagnostics during background settings and draft checks.
- Added trace-log de-duplication for repeated frontend errors within a short interval.
- Serialized Tauri trace-log writes so concurrent diagnostics cannot interleave and corrupt `knownext.log` lines.
- Replaced Rust debug timestamps in trace entries with stable Unix millisecond timestamps.
- Updated release metadata and installer download links for `0.6.3`.

## 0.6.2 - 2026-05-10

- Fixed the settings trace log folder staying on `Preparando carpeta de logs` when the local API is unavailable.
- Resolved the log folder path through the Tauri runtime and kept the `Abrir carpeta en el explorador` action available in packaged builds.
- Added local fallback persistence for appearance and diagnostics settings when FastAPI configuration cannot be reached.
- Made the settings modal, account menu, and first-project state react to the selected Spanish/English language.
- Kept the zoom slider cursor as the standard arrow cursor.
- Updated release metadata and installer download links for `0.6.2`.

## 0.6.1 - 2026-05-10

- Added the application settings modal from the account menu with left-side sections and right-side configuration detail.
- Added appearance settings for persisted language selection and interface zoom.
- Added diagnostics settings to enable or disable local trace logging.
- Added a dedicated `logs/knownext.log` trace file under the KnowNext.ai app data directory for user-visible errors and runtime failures.
- Added a Tauri/runtime action to open the dedicated log folder from settings when trace logging is enabled.
- Updated product, architecture, and manual acceptance documentation for application settings and trace logging.
- Updated release metadata and installer download links for `0.6.1`.

## 0.6.0 - 2026-05-10

- Removed normal runtime fallback to frontend/backend mock data so empty projects, disconnected users, unavailable AI, and API failures render as explicit product states.
- Added a clean startup loading layer before the user workspace appears.
- Added the first-project empty state with `Añadir primer proyecto` instead of a project dropdown when no projects exist.
- Reworked the project creation dialog into responsive tabs/steps with constrained height, internal scrolling, and persistent footer actions.
- Kept the desktop workspace resizable with persisted left navigation and right history panel widths, and lowered the Tauri minimum window size for responsive drawer validation.
- Updated UX/UI, architecture, release-readiness, and manual acceptance documentation for the non-mock startup and resizing contracts.
- Updated release metadata and installer download links for `0.6.0`.

## 0.5.1 - 2026-05-10

- Added the missing `Notas de release` account-menu action to open the packaged changelog manually.
- Added the global readonly release notes tab backed by Milkdown, separated from project documents, drafts, save state, and version history.
- Added legacy config handling so existing installations that predate release-note state can show the changelog after updating.
- Updated release metadata and installer download links for `0.5.1`.

## 0.5.0 - 2026-05-10

- Added GitHub authentication scaffolding and repository discovery through the FastAPI-mediated API layer.
- Added local Git and GitHub-backed project versioning contracts, sync status, pull/push actions, and conflict handling.
- Added recoverable draft tracking for orphaned document drafts and disk-change detection for open documents.
- Tightened the compact desktop workspace with responsive navigation, lazy Milkdown loading, stable toolbar state, and native Tauri window controls.
- Expanded backend contract coverage for project creation modes, document sync status, Git version creation, and GitHub conflict paths.
- Updated release metadata and installer download links for `0.5.0`.

## 0.4.7 - 2026-05-10

- Added release-management documentation for future agents and maintainers.
- Documented the Windows download and updater artifact contract so manual installs and in-app updates keep resolving correctly.
- Added a dedicated release-management skill for publishing GitHub Releases with signed updater assets.

## 0.4.6 - 2026-05-10

- Restored native top-edge height resizing for the custom Windows title bar.
- Kept title-bar dragging, double-click maximize, and window control buttons working with the frameless Tauri window.

## 0.4.5 - 2026-05-09

- Changed the Windows updater manifest to prefer the MSI artifact instead of NSIS for in-app updates from already installed versions.
- Removed the custom NSIS update hook and returned NSIS process handling to Tauri's default installer template.
- Kept the NSIS `.exe` as the manual installer linked from the README.

## 0.4.4 - 2026-05-09

- Wired the custom Windows title bar controls to Tauri window actions.
- Added draggable title bar behavior for frameless Windows builds, including double-click maximize/restore.
- Added invisible resize handles on all window edges and corners.
- Added explicit Tauri window permissions for close, minimize, maximize, move, and resize actions.

## 0.4.3 - 2026-05-09

- Fixed the Windows desktop build opening an extra terminal window in release installs.
- Added NSIS installer hooks to close a running KnowNext.ai process before update file replacement.
- Relaunch KnowNext.ai after passive/silent NSIS update installation completes.

## 0.4.2 - 2026-05-09

- Prepared optional Windows Authenticode signing for Tauri release builds through a CI-imported PFX certificate.
- Made the packaged desktop app default to local mock services until the FastAPI backend is bundled as a managed sidecar.
- Kept backend-backed development behavior enabled by default while allowing `VITE_USE_BACKEND=true` to force backend usage.
- Documented that unsigned Windows installers may show SmartScreen or endpoint protection warnings in the open source distribution.

## 0.4.1 - 2026-05-09

- Added the public Windows installer URL to the README.
- Documented the public releases page and signed updater manifest URL for users installing the desktop app.

## 0.4.0 - 2026-05-09

- Published KnowNext.ai as an open source project under Apache-2.0.
- Added repository legal files: `LICENSE`, `NOTICE`, and third-party notices.
- Added contribution, security, code of conduct, issue template, pull request template, and CODEOWNERS documentation.
- Documented the dependency license and secret review performed before public release.
- Configured GitHub repository metadata and branch contribution controls for public collaboration.
- Included the open source legal files in the release tag and updater-distributed desktop build.

## 0.3.1 - 2026-05-09

- Added the Tauri updater and process runtime plugins for signed desktop updates.
- Configured public GitHub Releases as the updater endpoint with NSIS preferred for Windows.
- Added a typed frontend updater runtime layer with safe non-Tauri fallback behavior.
- Added account-menu update checks, startup update checks, and a confirmation dialog before installing.
- Blocked update installation when pending draft persistence fails.
- Added the Windows release workflow that uploads signed updater artifacts and `latest.json`.
- Documented production updater signing keys, release validation, and manual update acceptance checks.

## 0.3.0 - 2026-05-09

- Added a shared `VERSION` file as the release version source of truth.
- Synchronized frontend, Tauri, Rust package, and backend package manifests to `0.3.0`.
- Added `pnpm version:check` to prevent publishing with mismatched component versions.
- Added `pnpm release:check` as the release gate for version consistency, frontend build/tests, and backend tests.
- Exposed the application version in the account/configuration layer.
- Exposed backend version metadata through the `/health` endpoint.
- Documented the GitHub release flow for the monolithic app release.
