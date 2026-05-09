# Tauri Desktop Skill

## Purpose

Maintain the Tauri desktop shell and prepare the app for local backend sidecar execution.

## Context

KnowNext.ai uses Tauri v2. Electron is forbidden.

## Rules

- Do not use Electron.
- Keep React as the primary UI.
- Keep Tauri commands small and explicit.
- Do not expose broad shell or filesystem permissions.
- Document sidecar and security changes.

## Recommended Steps

1. Update `src-tauri/tauri.conf.json` for window/runtime changes.
2. Keep Rust code focused on lifecycle and native integration.
3. Add capabilities only when a feature requires them.
4. Plan FastAPI sidecar startup before implementing it.

## Acceptance Criteria

- App opens as a desktop window.
- Window constraints remain suitable for the product UI.
- Permissions are minimal.

## Mistakes To Avoid

- Running backend subprocesses ad hoc without lifecycle management.
- Adding native features before the frontend/backend contract exists.

