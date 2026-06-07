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
- Work with imported and AI-generated images as local project assets.
- Preview PDF, DOCX, and XLSX reference files when the Rust document services can extract or render them.
- Export Markdown documents to MD, PDF, and DOCX.
- Show runtime diagnostics and update status from the local Tauri/Rust runtime.

## AI

- AI interactions are contextual to the active document and selected context sources.
- Users can add documents, images, attachments, and uploads as explicit prompt context.
- Prompt execution supports a quick direct mode and a reasoning direct mode. Reasoning mode may increase provider guidance and response budget, but it is not agentic and must not imply web access.
- React captures user intent and displays results; Rust/Tauri services own provider credentials, request construction, permissions, context indexing, and deterministic execution.
- Intent resolution must be structured: runtime state + LLM decision + validated operation.
- Document edits use structured AI edit proposals as the runtime contract, but the normal user experience is Canvas-like: safe validated operations are applied directly in the document without an approval dialog. Proposals can target the active selection, cursor, block, whole document, or project scope, and contain deterministic operations such as selected-text replacement, cursor insertion, anchored Markdown patches, image insertion, or explicit full-document replacement. Project-scope proposals do not require an active document when every operation identifies its target document.
- Multi-section and multi-document concept changes must be represented as small anchored patches, not as a single oversized rewritten document. The app applies operations whose target can be validated; ambiguous or stale anchors remain reviewable instead of being applied silently.
- Image requests while editing a document must be proactive. If the user asks to include, add, insert, create, or support content with an image, the AI should choose an appropriate image concept and document placement instead of asking for location clarification. A selected text range can be used as visual context without forcing the image to be inserted next to that selection; the structured operation must carry placement metadata such as cursor, selection, heading, paragraph anchor, or document end.
- OpenAI output is not treated as unlimited. Model context windows and runtime `max_output_tokens` still apply, so document editing must prefer compact structured operations, anchored replacements, cursor insertions, image operations, and project-scoped patch lists instead of depending on full-document regeneration.
- Do not implement AI intent with user-text heuristics, regexes, language-specific phrase lists, or keyword matching.
- Mock AI responses are acceptable only as replaceable local runtime behavior while provider integration and privacy policy are finalized.
- OpenAI is the first supported provider when real execution is enabled. Credentials must be stored locally through runtime services and never exposed back to React after save.
- AI image generation is Rust/Tauri mediated: the LLM may propose a structured image operation, and the runtime validates permissions, calls the provider, writes the generated asset locally, and inserts Markdown references when configured.
- RAG uses a local project index rebuilt from Markdown and supported text attachments. The runtime retrieves relevant local chunks for AI interactions; it must not create a remote vector store as part of the local-first workflow.
- Agentic web research controls must remain unavailable until Rust/Tauri uses them in AI interactions with validated source, cost, and permission contracts.

## Git And GitHub

- Git and GitHub behavior is project-scoped and mediated by Rust runtime services.
- React must not execute Git commands.
- Do not show branches such as `main` in product UI.
- Local history is backed by the Rust-managed local Git service for projects that enable versioning.
- GitHub sync uses the Rust-managed Git service with local credentials, local-first paused states, and explicit push/pull contracts.

## Settings And Diagnostics

- The Services section shows the local Rust runtime, app version, profile, app data directory, health state, and latest diagnostic error.
- 2.0.4 has no external executable, process restart, API port, or runtime endpoint setting.
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

## Current Limitations

- AI provider execution depends on locally stored OpenAI credentials and still needs end-to-end validation with real keys before claiming provider acceptance.
- AI image generation and local RAG are implemented through the Rust/Tauri runtime and still require hands-on validation with a real OpenAI key before release acceptance.
- Agentic web research remains unavailable.
- Document previews and exports are Rust-managed and best-effort for formats that require complex conversion.
- Any remaining service double must be centralized, routed through the runtime boundary, and documented in release notes.
