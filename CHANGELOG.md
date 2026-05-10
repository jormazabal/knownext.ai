# Changelog

All KnowNext.ai releases use a single monolithic application version for the desktop frontend, Tauri shell, and FastAPI backend.

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
