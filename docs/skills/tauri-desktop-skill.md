# Tauri Desktop Skill

## Purpose

Maintain the Tauri shell and local Rust runtime integration.

## Rules

- Do not use Electron.
- Keep React as the primary UI.
- Keep Tauri commands small and explicit.
- Do not expose broad shell or filesystem permissions.
- Do not add auxiliary product runtime processes or separate runtime services.
- Document runtime, permissions, updater, and security changes.

## Recommended Steps

1. Update `src-tauri/tauri.conf.json` for window/runtime changes.
2. Keep Rust command handlers focused on bridge behavior.
3. Add capabilities only when a feature requires them.
4. Put product behavior in Rust crates and test it there.

## Acceptance Criteria

- App opens as a desktop window.
- Window constraints remain suitable for the product UI.
- Permissions are minimal.
- Local runtime commands work without external services.
