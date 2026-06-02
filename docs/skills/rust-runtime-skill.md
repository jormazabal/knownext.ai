# Rust Runtime Skill

## Purpose

Implement KnowNext.ai local runtime behavior through Tauri v2 commands and Rust services.

## Principles

- Keep React as UI only.
- Keep command handlers thin.
- Put business rules in Rust crates under `apps/desktop/src-tauri/crates`.
- Return structured JSON with predictable IDs and timestamps.
- Keep mocks replaceable by real storage, Git, document, and AI services.
- Do not add a product HTTP server, external runtime process, or compatibility path for removed runtimes.

## Standard Steps

1. Identify the frontend API contract under `apps/desktop/src/lib/api`.
2. Add or update Rust types in `knownext-core` or the relevant runtime crate.
3. Implement the service behavior in a crate.
4. Expose it through a thin Tauri command or local API path dispatch.
5. Add Rust tests for the contract and frontend tests when UI behavior changes.
6. Run `pnpm rust:test`, `pnpm test`, and `pnpm build`.

## Mistakes To Avoid

- Writing filesystem, Git, or AI logic in React components.
- Returning ad hoc untyped payloads.
- Scattering mock data outside runtime services.
- Introducing runtime processes or server endpoints for product functionality.
