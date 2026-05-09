# Testing Skill

## Purpose

Add practical tests that protect core KnowNext.ai behavior.

## Context

V1 combines frontend UI state, FastAPI contracts, and manual desktop validation.

## Rules

- Test backend contracts with FastAPI TestClient.
- Prefer component tests for UI interactions that can regress.
- Keep manual checklist updated for desktop-specific behavior.
- Do not overbuild end-to-end tests before core persistence exists.

## Recommended Steps

1. Add backend tests for every endpoint contract.
2. Add frontend tests for project selector, tabs, save feedback, and history toggle.
3. Use manual checklist for Milkdown and Tauri visual checks.
4. Document test gaps in PRs.

## Acceptance Criteria

- `pnpm test` runs frontend tests.
- `python -m pytest` runs backend tests.
- Manual checklist covers the acceptance criteria.

## Mistakes To Avoid

- Snapshot-only tests for dynamic UI.
- Testing mocks instead of user-visible behavior.
- Ignoring visual verification for desktop layout.

