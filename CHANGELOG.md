# Changelog

All KnowNext.ai releases use a single monolithic application version for the desktop frontend, Tauri shell, and FastAPI backend.

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
