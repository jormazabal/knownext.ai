# Product Definition

KnowNext.ai is a compact local-first workspace for Markdown documentation. Users organize projects, edit documents visually, keep notes, inspect history, export content, and ask contextual AI questions without depending on a separate product service.

## Product Shape

- Native Windows and Android applications built with Tauri v2.
- React + TypeScript UI with Tailwind styling.
- Milkdown visual Markdown editor as the primary editing experience.
- Rust/Tauri runtime for project operations, persistence, document conversion, AI orchestration, diagnostics, updates, and future Git/GitHub synchronization.
- No separate product service, auxiliary runtime process, or mobile endpoint dependency.

## Core Workflows

- Create, select, edit, rename, move, duplicate, and delete projects, folders, documents, images, and supported attachments.
- Keep the main document as a single-column Milkdown editing surface.
- Use tabs for documents and fixed utility areas such as IA and Notas.
- Save Markdown to local project files and preserve drafts until explicit save or discard.
- Maintain user notes outside the project document tree.
- Show history/version state through product language without exposing branch names in the UI.
- Import images and supported support files.
- Preview PDF, DOCX, and XLSX reference files when the Rust document services can extract or render them.
- Export Markdown documents to MD, PDF, and DOCX.
- Show runtime diagnostics and update status from the local Tauri/Rust runtime.

## AI

- AI interactions are contextual to the active document and selected context sources.
- React captures user intent and displays results; Rust/Tauri services own provider credentials, request construction, permissions, context indexing, and deterministic execution.
- Intent resolution must be structured: runtime state + LLM decision + validated operation.
- Do not implement AI intent with user-text heuristics, regexes, language-specific phrase lists, or keyword matching.
- Mock AI responses are acceptable only as replaceable local runtime behavior while provider integration and privacy policy are finalized.
- OpenAI is the first supported provider when real execution is enabled. Credentials must be stored locally through runtime services and never exposed back to React after save.

## Git And GitHub

- Git and GitHub behavior is project-scoped and mediated by Rust runtime services.
- React must not execute Git commands.
- Do not show branches such as `main` in product UI.
- Local history may be mock-backed until the Rust Git implementation is fully validated.
- GitHub sync may be manual or automatic only after local state, credential handling, and conflict policy are validated.

## Settings And Diagnostics

- The Services section shows the local Rust runtime, app version, profile, app data directory, health state, and latest diagnostic error.
- 2.0.1 has no external executable, process restart, API port, or runtime endpoint setting.
- Diagnostic trace logging can be enabled by the user and must avoid secrets, prompt bodies, credentials, and full document content.

## Data Policy

- A clean install starts with no projects.
- Release bundles must not include user data, sample projects, credentials, notes, drafts, logs, AI caches, or generated assets.
- Windows and Android app data are local to their platform storage identities.
- Android must work offline without a workstation app or external product service running.

## Visual Direction

- The app should feel like a compact professional workspace.
- Primary action color: `#F37021`.
- Use a white main canvas, light left panel, subtle borders, restrained shadows, and operational density.
- Do not use blue as the primary action color.
- Do not add a search input to the sidebar header.
- Do not add an external plus button next to the project selector.
- Tree item actions appear through hover/context menus, not permanent action icons.

## Current 2.0.1 Limitations

- Some AI, GitHub, and document conversion behaviors may be replaceable Rust mocks until the real provider/storage/security decisions are complete.
- Any mock-backed behavior must be centralized, routed through the runtime boundary, and documented in release notes.
