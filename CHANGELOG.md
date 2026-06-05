# Changelog

All KnowNext.ai releases use one monolithic application version for the frontend, Tauri shell, Rust runtime, Windows updater, and Android updater.

## 2.0.4 - 2026-06-05

- Centralized Rust Git execution behind a local helper that runs Git non-interactively and hides subprocess windows on Windows, preventing terminal windows from opening during internal history and sync checks.
- Added non-interactive Git environment controls so Git/GitHub operations do not prompt through Git Credential Manager while KnowNext.ai is running as a graphical app.
- Reduced startup and background sync aggressiveness: external-change scans now run on a slower cadence and focus events, and remote-paused GitHub projects back off instead of repeatedly polling.
- Kept `auto-github` projects local-first when GitHub is unavailable: documents remain editable, Git local remains available, and GitHub is represented as a paused status instead of a repeated interruption.
- Added Git/GitHub diagnostics to the settings runtime panel, including active project, Git availability, local history state, origin status and remote access state.
- Added a Rust/Tauri AI document-creation contract: when the user asks AI to create a Markdown document, the runtime can materialize the document locally and open it through the normal project tree flow.
- Persisted user prompts as conversation events so document-level AI requests appear in the IA tab alongside assistant responses and document operations.
- Added Rust and frontend coverage for Git diagnostics, AI document creation, conversation persistence and the expanded settings runtime service view.

## 2.0.3 - 2026-06-05

- Added runtime cleanup for stale public GitHub auth state when the private GitHub credential is missing, so the UI cannot show a connected account that cannot actually authenticate sync.
- Prevented the GitHub login dialog from showing an empty device-code flow when GitHub OAuth is not configured in either development or installed builds.
- Normalized GitHub project configuration to local Git versioning with GitHub as the remote sync target; old GitHub-versioning metadata is converted by the Rust runtime when read or updated.
- GitHub remote status now classifies missing credentials, missing permissions and offline remotes before enabling push/pull actions, so local history can continue without noisy remote errors.
- Revalidated prompt context file handling for project-tree drag/drop, external file drag/drop, native file-picker uploads and nested Markdown imports.
- Preserved active document Markdown and document identity in the auxiliary Rust `/ai/prompt` contract so all exposed AI prompt routes remain contextual.
- Encoded document and AI context source IDs in auxiliary prompt/context API routes so documents inside folders reach the Rust local contracts correctly.
- Routed imported Markdown files through the local Rust project-file import contract instead of reading Markdown file content directly in the React shell.
- Added local Rust contracts for auxiliary runtime logging and log-folder opening routes so exposed diagnostics paths do not fall back to unimplemented local API responses.
- Expanded automated coverage for settings, dialogs, tree drag/drop, tab reorder, prompt context, transcription, previews, release notes, updater UI, GitHub login states and local runtime contracts.

## 2.0.2 - 2026-06-03

- Fixed GitHub login in installed builds so an unavailable remote GitHub OAuth flow can no longer persist or display an internal development placeholder account.
- Added runtime cleanup for any previously persisted development GitHub auth marker; affected users are returned to the correct unauthenticated GitHub-paused state after updating.
- Added real GitHub device authorization through the local Rust runtime when the release is built with the KnowNext.ai GitHub client ID.
- Limited mock GitHub authentication to internal test profiles and kept Windows/Android `desktop` and `mobile` profiles from accepting mock auth.
- Stopped frontend polling for GitHub device auth when the runtime reports GitHub remote auth is not configured.
- Strengthened the production bundle gate so development GitHub mock strings fail release validation if they leak into packaged frontend assets.

## 2.0.1 - 2026-06-02

- Improved GitHub sync degradation when the user is not signed in, loses connectivity, or no longer has repository access: documents remain editable, local history stays available, automatic remote sync pauses, and the document footer shows a quiet `Sin acceso a GitHub` state instead of repeated save/sync prompts.
- Added Rust and frontend contract coverage for GitHub remote pause/recovery and for documents that should not become dirty immediately after opening because of Markdown newline normalization.
- Cleaned the application settings modal for the local-first runtime: removed obsolete port, restart, external executable, and auxiliary service controls, leaving only local Rust runtime health, diagnostics, app data, and updater-relevant status.
- Fixed the production GitHub connection dialog so installed builds no longer display development/mock login copy when remote GitHub OAuth is not configured; the UI now presents remote GitHub as unavailable while preserving local work.
- Updated release documentation, manual acceptance steps, and download links for 2.0.1.

## 2.0.0 - 2026-06-02

- Migrated KnowNext.ai to a local-first Tauri v2/Rust architecture for Windows and Android.
- Removed the previous product server runtime, desktop process packaging, mobile endpoint discovery, legacy packaging scripts, legacy contract tests, and release workflow steps for that runtime.
- Added Rust runtime crates for shared contracts, storage/project operations, document export/preview helpers, and AI orchestration stubs.
- Replaced frontend HTTP transport with the `apps/desktop/src/lib/api` Tauri-command adapter while preserving the product API boundary for React components.
- Kept project selection, document tree operations, Markdown loading/saving, Milkdown editing, notes, drafts, tabs, versions, settings, diagnostics, imports, exports, previews, and AI panel contracts routed through local runtime services.
- Updated Android builds so the APK is autonomous and does not require a workstation app or external product service.
- Updated release validation to run TypeScript build, frontend tests, Rust tests, bundle cleanliness checks, Windows release build, Android release build, updater manifest checks, and manual Windows/Android acceptance before publication.
- Updated README, architecture, development, release, manual checklist, AGENTS, and release-skill documentation for the 2.0.0 local-first runtime.

Historical note: releases before 2.0.0 used a different local-service architecture. 2.0.0 is the compatibility break that removes that runtime from the product.
