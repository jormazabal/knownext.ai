# Changelog

All KnowNext.ai releases use a single monolithic application version for the desktop frontend, Tauri shell, and FastAPI backend.

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
