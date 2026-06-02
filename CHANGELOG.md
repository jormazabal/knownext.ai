# Changelog

All KnowNext.ai releases use one monolithic application version for the frontend, Tauri shell, Rust runtime, Windows updater, and Android updater.

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
