# Changelog

All KnowNext.ai releases use one monolithic application version for the frontend, Tauri shell, Rust runtime, Windows updater, and Android updater.

## 2.0.2 - 2026-06-03

- Fixed GitHub login in installed builds so an unavailable remote GitHub OAuth flow can no longer persist or display an internal development placeholder account.
- Added runtime cleanup for any previously persisted development GitHub auth marker; affected users are returned to the correct unauthenticated GitHub-paused state after updating.
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
