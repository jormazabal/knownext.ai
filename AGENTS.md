# AGENTS.md

## Product Objective

KnowNext.ai is a local-first Tauri application for managing, editing, versioning, exporting, and consulting Markdown documentation by project. The product must feel like a compact professional workspace, not a static mockup.

## Mandatory Stack

- Native application: Tauri v2.
- Frontend: React + TypeScript.
- Styles: Tailwind CSS.
- Visual Markdown editor: Milkdown.
- Local runtime: Rust/Tauri commands.
- Persistence: local files and Rust-managed JSON state.
- Versioning: local Git mediated by Rust services.
- AI: Rust/Tauri mediated provider integration; React never calls AI providers directly.

## Architecture Rules

- Keep a clear separation between UI, services, models, and runtime integration.
- Components render state and dispatch intent; they must not own filesystem, Git, AI, or persistence business logic.
- Frontend API access belongs under `apps/desktop/src/lib/api`.
- Shared product types belong under `apps/desktop/src/types`.
- Rust command registration belongs under `apps/desktop/src-tauri/src`.
- Rust business rules belong in crates under `apps/desktop/src-tauri/crates`.
- Tauri commands must stay thin and call Rust services.
- Do not introduce unrelated frameworks or state managers without a concrete product need.

## Rust Runtime Rules

- The product has no external product service, HTTP runtime server, packaged auxiliary process, or compatibility runtime option.
- Windows and Android must be autonomous local apps.
- Runtime commands must return structured JSON with predictable IDs and timestamps.
- Keep mocks replaceable by real persistence, Git, document, and AI services.
- Do not block the UI thread with filesystem, Git, document conversion, or AI work.

## Frontend Rules

- Use React components organized by product feature.
- Use TypeScript types for projects, document tree nodes, documents, versions, and AI requests.
- Use Tailwind tokens matching the KnowNext.ai palette.
- Use lucide-react for linear icons.
- Keep the main document as a single-column editing surface.
- Do not mix business logic into visual-only components.
- Do not call mock data directly from arbitrary components; use the API layer.

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
- Keep native command handlers minimal and delegate to Rust crates.
- Do not add auxiliary product runtime processes.
- Do not block the UI thread with filesystem, Git, document, or AI operations.

## Release And Updater Rules

- Use `docs/skills/release-management-skill.md` when preparing or publishing a release.
- Keep `VERSION` as the release source of truth and keep all checked manifests aligned.
- Public Windows releases are distributed from GitHub Releases in `jormazabal/knownext.ai`.
- The README manual download link must point to the versioned MSI installer using the `/releases/latest/download/KnowNext.ai_<version>_x64_en-US.msi` URL.
- The Windows updater must use the signed Tauri `latest.json` manifest and currently must prefer the MSI artifact for `windows-x86_64`.
- Android releases must include the signed APK and `android-latest.json`.
- Do not publish a release unless the GitHub release contains the MSI installer, NSIS installer, both Windows `.sig` files, `latest.json`, Android APK, and `android-latest.json`.
- After publishing, verify that both update manifests resolve to the new version and point to the expected assets.
- Updater signing with `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` is mandatory; Authenticode is recommended but optional until a public code-signing certificate exists.
- Do not regenerate the Tauri updater key unless explicitly requested; changing it can strand already installed clients.

## Git And Versioning Rules

- Version history is based on commits in the repository conceptually.
- Do not introduce Git branches into the product UI.
- Do not show `main` or any branch name in product UI.
- Do not execute Git directly from React components.
- Git operations must be mediated by Rust runtime services.
- Local-only versioning may use replaceable mock commit history only until the local Git service is complete.

## AI Rules

- AI interactions must be contextual to the active document.
- AI intent resolution must be structured: runtime state + LLM decision + validated deterministic execution.
- The prompt execution mode controls cost and routing: quick mode is direct and non-agentic; reasoning mode may run structured preflight and then choose direct or agentic work.
- Do not implement intent logic with user-text heuristics, regexes, language-specific phrase lists, or keyword matching.
- Do not call real AI providers directly from React components.
- All AI calls go through Rust/Tauri services.
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

- Keep changes scoped to the requested product surface.
- Favor simple, typed contracts over clever abstractions.
- Validate with TypeScript build, frontend tests, Rust tests, and contract tests when possible.
- Avoid unrelated refactors.
- Keep mock data realistic and centralized.

## Testing Rules

- Add tests for Rust/Tauri contracts.
- Add frontend component tests for critical interactions when expanding behavior.
- Maintain `docs/development/manual-test-checklist.md`.
- Manual acceptance must include project selector, tree menus, tab switching, Milkdown editing, save feedback, history drawer, AI input, import/export, previews, settings, Windows update, and Android offline operation.

## Documentation Rules

- Update product, architecture, and development docs when contracts or structure change.
- Document known limitations and next technical steps.
- Keep docs practical for future agents and engineers.
- For release changes, update `CHANGELOG.md`, `docs/releases/<version>.md`, `docs/development/release-process.md` when the process changes, and the manual test checklist when acceptance steps change.

## Working By Phases

1. Product shell and visual fidelity.
2. Stable frontend/Rust runtime contracts.
3. Local filesystem persistence.
4. Real Git version history service.
5. Real AI integration through Tauri/Rust.
6. Tauri packaging and hardening for Windows and Android.
7. Automated frontend, Rust, and integration tests.

## Do Not Do

- Do not use Electron.
- Do not add external server runtime paths, compatibility runtime paths, or auxiliary product processes.
- Do not replace Milkdown without explicit approval.
- Do not show raw Markdown as the main editor.
- Do not introduce Git branches in the interface.
- Do not use blue as the main action color.
- Do not execute Git from React components.
- Do not mix runtime or business logic into visual components.
- Do not scatter mock data across the UI.
