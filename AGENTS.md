# AGENTS.md

## Product Objective

KnowNext.ai is a Tauri desktop application for managing, editing, versioning, and consulting Markdown documentation by project. The product must feel like a compact professional workspace, not a static mockup.

## Mandatory Stack

- Desktop application: Tauri.
- Frontend: React + TypeScript.
- Styles: Tailwind CSS.
- Visual Markdown editor: Milkdown.
- Local API/backend: Python + FastAPI.
- Initial persistence: local files and mock services.
- Future versioning: local Git.
- Future AI: FastAPI-mediated AI integration.

## Architecture Rules

- Keep a clear separation between UI, services, models, and runtime integration.
- Components render state and dispatch intent; they must not own backend, Git, or AI business logic.
- API access belongs under `apps/desktop/src/lib/api`.
- Shared product types belong under `apps/desktop/src/types`.
- Backend business rules belong in `backend/app/services`.
- Backend routers must stay thin and call services.
- Do not introduce unrelated frameworks or state managers without a concrete product need.

## Frontend Rules

- Use React components organized by product feature.
- Use TypeScript types for projects, document tree nodes, documents, versions, and AI requests.
- Use Tailwind tokens matching the KnowNext.ai palette.
- Use lucide-react for linear icons.
- Keep the main document as a single-column editing surface.
- Do not mix business logic into visual-only components.
- Do not call mock data directly from arbitrary components; use the API layer.

## Backend Rules

- Use FastAPI routers, schemas, and services.
- Keep mocks replaceable by real persistence services.
- Do not implement a complex real backend until storage, Git, and security decisions are explicit.
- Keep endpoint contracts stable and documented.
- Return structured JSON with predictable IDs and timestamps.

## Milkdown Rules

- Milkdown is the required visual Markdown editor.
- Do not replace Milkdown with MDXEditor, Tiptap, Lexical, Monaco, CodeMirror-only, or another editor without an explicit product decision.
- Do not show raw Markdown as the primary user experience.
- The editor must load from a Markdown string and export Markdown back to application state.
- Customize Milkdown visually with Tailwind/CSS so it feels native to KnowNext.ai.
- Document content must remain a normal single-column document flow.

## Tauri Rules

- Use Tauri, not Electron.
- React remains the primary UI.
- Keep native commands minimal in the first version.
- Future backend startup must use a controlled sidecar approach.
- Do not block the UI thread with filesystem, Git, or backend operations.

## Release And Updater Rules

- Use `docs/skills/release-management-skill.md` when preparing or publishing a release.
- Keep `VERSION` as the release source of truth and keep all checked manifests aligned.
- Public Windows releases are distributed from GitHub Releases in `jormazabal/knownext.ai`.
- The README manual download link must point to the versioned NSIS installer using the `/releases/latest/download/KnowNext.ai_<version>_x64-setup.exe` URL.
- The in-app updater must use the signed Tauri `latest.json` manifest and currently must prefer the MSI artifact for `windows-x86_64`.
- Do not publish a release unless the GitHub release contains the NSIS installer, MSI installer, both `.sig` files, and `latest.json`.
- After publishing, verify that `latest.json` resolves to the new version and that its Windows URL points to the MSI artifact.
- Updater signing with `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` is mandatory; Authenticode is recommended but optional until a public code-signing certificate exists.
- Do not regenerate the Tauri updater key unless explicitly requested; changing it can strand already installed clients.

## Git And Versioning Rules

- Version history is based on commits in the repository conceptually.
- Do not introduce Git branches into the UI.
- Do not show `main` or any branch name in product UI.
- Do not execute Git directly from React components.
- Git operations must be mediated by backend/runtime services.
- The first version uses mock commit history only.

## AI Rules

- AI interactions must be contextual to the active document.
- AI intent resolution must be structured: backend state + LLM decision + validated deterministic execution.
- The prompt execution mode controls cost and routing: quick mode is direct and non-agentic; reasoning mode may run structured preflight and then choose direct or agentic work.
- Do not implement intent logic with user-text heuristics, regexes, language-specific phrase lists, or keyword matching.
- Do not call real AI providers directly from React components.
- All future AI calls go through FastAPI.
- Initial AI behavior can be mocked, but request/response schemas should be stable.
- Do not stream or persist prompts until product and privacy rules are defined.

## Visual Design Rules

- Primary action color: `#F37021`.
- Dark orange: `#D85A12`.
- Main text: `#111827`.
- Secondary text: `#6B7280`.
- Soft border: `#E5E7EB`.
- Main background: `#FFFFFF`.
- Sidebar background: `#FAFAFA`.
- Orange hover: `#FFF1E8`.
- Do not use blue as the primary action color.
- Use a white main canvas, light left panel, subtle borders, and very soft shadows.
- Keep the UI compact and operational.
- Do not add a search input to the sidebar header.
- Do not add an external plus button next to the project selector.
- Tree item actions appear through hover/context menus, not permanent action icons.

## Quality Rules

- Keep changes scoped to the product surface requested.
- Favor simple, typed contracts over clever abstractions.
- Validate with TypeScript build and backend tests when possible.
- Avoid unrelated refactors.
- Keep mock data realistic and centralized.

## Testing Rules

- Add tests for backend contracts.
- Add frontend component tests for critical interactions when expanding behavior.
- Maintain `docs/development/manual-test-checklist.md`.
- Manual acceptance must include project selector, tree menus, tab switching, Milkdown editing, save feedback, history drawer, and AI input.

## Documentation Rules

- Update product, architecture, and development docs when contracts or structure change.
- Document known limitations and next technical steps.
- Keep docs practical for future agents and engineers.
- For release changes, update `CHANGELOG.md`, `docs/releases/<version>.md`, `docs/development/release-process.md` when the process changes, and the manual test checklist when acceptance steps change.

## Working By Phases

1. Product shell and visual fidelity.
2. Stable frontend/backend contracts.
3. Local filesystem persistence.
4. Real Git version history service.
5. Real AI integration through FastAPI.
6. Tauri sidecar packaging and hardening.
7. Automated frontend and integration tests.

## Do Not Do

- Do not use Electron.
- Do not replace Milkdown without explicit approval.
- Do not show raw Markdown as the main editor.
- Do not introduce Git branches in the interface.
- Do not use blue as the main action color.
- Do not execute Git from React components.
- Do not mix backend or business logic into visual components.
- Do not build a complex real backend before storage and security decisions are defined.
- Do not scatter mock data across the UI.

