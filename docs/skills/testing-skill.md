# Testing Skill

## Purpose

Add practical tests that protect core KnowNext.ai behavior.

## Rules

- Test Rust/Tauri runtime contracts for product operations.
- Prefer component tests for UI interactions that can regress.
- Keep manual checklist updated for Windows and Android behavior.
- Do not overbuild end-to-end tests before core persistence and platform flows are stable.

## Recommended Steps

1. Add Rust tests for each new runtime contract.
2. Add frontend tests for project selector, tabs, save feedback, history, notes, import/export, and AI interactions when changed.
3. Use the manual checklist for Milkdown, packaged Tauri, updater, and Android offline checks.
4. Document test gaps in PRs.

## Acceptance Criteria

- `pnpm test` runs frontend tests.
- `pnpm rust:test` runs Rust tests and Tauri checks.
- `pnpm release:check` passes before release work is tagged.
- Manual checklist covers critical acceptance criteria.
