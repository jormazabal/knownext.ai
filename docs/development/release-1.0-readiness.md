# KnowNext.ai 1.0 Release Readiness

This document defines the minimum functional and quality bar before KnowNext.ai can be treated as a commercial 1.0 release.

## Current Release Status

Status: not ready for commercial 1.0.

The current application has a working professional workspace, local project registry, local configuration persistence, Markdown editing, local folder scanning, and real Markdown file operations. It is suitable for internal validation and controlled pilot use.

It is not yet ready to sell as a standalone desktop product because the packaged Tauri app does not start and supervise the FastAPI backend as a controlled sidecar, and Git history plus AI assistance are still mock services.

## Completed 1.0 Foundations

- Tauri desktop shell with React, TypeScript, Tailwind CSS, and Milkdown.
- Project metadata persistence in `projects.json`.
- Application layout and open tab persistence in `config.json`.
- Local project folder scanning for folders and Markdown documents.
- Real Markdown document read/write through the FastAPI backend.
- Tree operations for creating, renaming, duplicating, moving, and deleting project folders/documents.
- Per-project open tab state, active document, and tab order persistence.
- Visible UI errors for backend/API failures instead of silent fallback to mock data.
- Protection against accidental loss of unsaved document changes when switching document or project.
- Corrupt local JSON files are backed up before defaults are recreated.
- Backend and frontend automated tests cover the main persistence and tree interaction contracts.

## Commercial 1.0 Blockers

- Package the FastAPI backend as a controlled Tauri sidecar.
- Start, health-check, stop, and recover the backend from the Tauri runtime.
- Replace mock Git history with a local Git service mediated by FastAPI.
- Decide whether AI is included in 1.0; if included, replace mock AI with a FastAPI-mediated provider integration and privacy controls.
- Add installer signing, update policy, license/EULA, and release artifact validation.
- Add end-to-end smoke tests against the packaged desktop build.
- Complete a full manual acceptance pass on Windows using a clean user profile.

## Release Gate

A build can be called 1.0 only when all automated tests pass and every item in `docs/development/manual-test-checklist.md` passes against the packaged Tauri application, not only the browser dev server.
