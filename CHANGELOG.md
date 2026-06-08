# Changelog

All KnowNext.ai releases use one monolithic application version for the frontend, Tauri shell, Rust runtime, Windows updater, and Android updater.

## 2.4.0 - 2026-06-08

- Replaced the protection/history drawer with a compact `Guardado y sincronización` workspace that shows every project file in one operational list with Local, Historial local and GitHub status columns.
- Added per-file and batch actions for drafts, local history imports, omitted external files, GitHub push/pull states and conflict handling, with filters for attention, drafts, pending history, pending GitHub work, conflicts and omitted files.
- Added a Rust/Tauri file-sync overview contract so React renders structured sync state instead of inspecting Git or filesystem details directly.
- Expanded local runtime sync detection for Git status paths, blocked/omitted files, paused GitHub access, draft documents and timestamped file metadata.
- Improved DOCX and PDF export rendering for Markdown structure, including styled headings, paragraph spacing, inline formatting, links, tables, horizontal rules and embedded image assets.
- Added export template controls for paragraph spacing, heading spacing and Mermaid diagram raster resolution.
- Added support for Markdown, HTML and data-URL image assets during export, including JPEG, GIF and WebP handling on desktop PDF/DOCX paths.
- Persisted AI provider usage records through the Rust runtime and added monthly usage summaries with provider and estimated-cost breakdowns.
- Updated automated coverage for sync overview contracts, the file sync drawer, export template normalization, Mermaid export scaling and runtime usage summaries.

## 2.3.0 - 2026-06-07

- Added compact AI base skills with Rust-managed manifests, modes, validators, diagnostics and a read-only Skills de IA settings surface for inspecting bundled capabilities.
- Added the hybrid skill-selection pipeline for AI interactions: Rust prefilters candidates, accepts or rejects structured selector output, composes only accepted instructions and reports applied skill/mode diagnostics.
- Activated runtime skill application for Mermaid diagrams and Markdown tables, while keeping future user/imported skills represented in contracts without enabling editing, import, export or project-level activation.
- Reworked Mermaid skills into modes under `knownext.mermaid` and exposed a Rust-backed Mermaid catalog so supported diagram families, maturity, aliases and policies stay consistent.
- Unified embedded images and Mermaid diagrams as document visual elements with common hover actions for edit, reset size, fullscreen inspection and deletion.
- Added a shared fullscreen media viewer with zoom, fit and pan support for embedded images and rendered Mermaid diagrams.
- Improved image sizing in Milkdown documents: default images follow responsive viewport rules, manual resizing is proportional, live while dragging, capped at the available document width and no longer creates empty white vertical margins.
- Removed obsolete image/diagram insertion size controls from dialogs so presentation sizing is managed directly in the document.

## 2.2.0 - 2026-06-07

- Added Mermaid diagrams as first-class editable Markdown content: users can insert, validate, preview, edit, delete and render diagrams visually inside the document instead of seeing raw code as the primary experience.
- Added a professional diagram editor with a guided diagram-type selector, searchable examples, numbered Mermaid code editor, independent live preview column, validation diagnostics, width/caption controls and contextual information for profiles, beta syntax and local icons.
- Expanded the Mermaid catalog with product, technical, data and experimental diagram examples so users can learn from templates and start from valid Mermaid code.
- Integrated diagram generation into the AI structured edit flow so the assistant can choose prose, tables, images or Mermaid diagrams when creating document content.
- Added AI diagram capability configuration for compatible, local visual and advanced profiles, including local Lucide icon use, beta-policy handling and project-local image constraints.
- Added Mermaid rendering support in the visual editor, read-only viewer and export pipeline so PDF/DOCX exports embed rendered diagram images rather than raw Mermaid code.
- Added Rust/Tauri document export support for rendering Mermaid blocks through generated diagram assets and carrying KnowNext metadata for editable captions and widths.
- Expanded automated coverage for Mermaid rendering, diagram insertion/editing UI, settings normalization and the AI `insert_diagram` contract.

## 2.1.0 - 2026-06-07

- Reworked AI document editing into a direct Canvas-style workflow: structured edit proposals are validated and applied automatically when safe, including selected text, cursor placement, whole-document updates, tables, generated images and multi-section document changes.
- Added richer AI edit contracts in the Rust/Tauri runtime, including deterministic Markdown operation application, image generation and insertion operations, cursor-aware context, project context sources, and safer handling when document content has changed.
- Improved Markdown image handling in the visual editor: project images render through the local asset scheme, preserve aspect ratio, support responsive default sizing, allow explicit width overrides, and expose a hover edit action for replacing, deleting or changing alt text.
- Redesigned the image insertion/editing dialog with a selected-image preview, compact project image selection, URL/upload paths, alt text, and default/custom document width controls.
- Restored robust controlled drag and drop in the document tree for Tauri: documents and folders can be moved, project files can be dragged into the AI prompt as context, and project images can be dropped into the active document at the cursor position under the mouse.
- Kept cursor focus as hidden AI context instead of a visible prompt chip when no text is selected, while selected text remains visibly removable from the prompt input.
- Expanded automated coverage for AI edit proposal application, prompt context behavior, document tree drag/drop, image editing/insertion UI, and project/runtime contracts.

## 2.0.5 - 2026-06-06

- Implemented local RAG indexing through the Rust/Tauri runtime: project documents and supported text attachments can be indexed locally, status/rebuild/delete contracts are real, and AI interactions automatically receive relevant indexed chunks alongside explicit prompt context.
- Implemented AI image generation as a runtime-mediated local asset workflow: structured AI image operations are permission-checked, generated through OpenAI, saved inside the project, reindexed as image assets, and inserted as Markdown references when configured.
- Added official `gpt-image-2` support for image generation, including the new default model selection and higher-resolution size options documented by OpenAI.
- Updated AI settings so RAG and image generation expose real controls instead of unavailable placeholders, while agentic web research remains unavailable.
- Refined the app settings experience: the summary now separates image generation from vision models, diagnostics are more compact and product-oriented, capabilities and agentic controls are denser, and export template changes autosave without a manual save button.
- Fixed several workspace regressions: batch tab closing now handles dirty documents in sequence, imported single files open immediately when supported, generated image references render through the local asset scheme, the quote toolbar action toggles on/off, the `@` context picker is bounded and closeable, drag operations show a translucent preview, saves create local history versions, and app settings expose local guided agentic limits while keeping web research unavailable.

## 2.0.4 - 2026-06-05

- Centralized Rust Git execution behind a local helper that runs Git non-interactively and hides subprocess windows on Windows, preventing terminal windows from opening during internal history and sync checks.
- Added non-interactive Git environment controls so Git/GitHub operations do not prompt through Git Credential Manager while KnowNext.ai is running as a graphical app.
- Reduced startup and background sync aggressiveness: external-change scans now run on a slower cadence and focus events, and remote-paused GitHub projects back off instead of repeatedly polling.
- Kept `auto-github` projects local-first when GitHub is unavailable: documents remain editable, Git local remains available, and GitHub is represented as a paused status instead of a repeated interruption.
- Added Git/GitHub diagnostics to the settings runtime panel, including active project, Git availability, local history state, origin status and remote access state.
- Added a Rust/Tauri AI document-creation contract: when the user asks AI to create a Markdown document, the runtime can materialize the document locally and open it through the normal project tree flow.
- Persisted user prompts as conversation events so document-level AI requests appear in the IA tab alongside assistant responses and document operations.
- Added Rust and frontend coverage for Git diagnostics, AI document creation, conversation persistence and the expanded settings runtime service view.

## 2.0.3 - 2026-06-05

- Added runtime cleanup for stale public GitHub auth state when the private GitHub credential is missing, so the UI cannot show a connected account that cannot actually authenticate sync.
- Prevented the GitHub login dialog from showing an empty device-code flow when GitHub OAuth is not configured in either development or installed builds.
- Normalized GitHub project configuration to local Git versioning with GitHub as the remote sync target; old GitHub-versioning metadata is converted by the Rust runtime when read or updated.
- GitHub remote status now classifies missing credentials, missing permissions and offline remotes before enabling push/pull actions, so local history can continue without noisy remote errors.
- Revalidated prompt context file handling for project-tree drag/drop, external file drag/drop, native file-picker uploads and nested Markdown imports.
- Preserved active document Markdown and document identity in the auxiliary Rust `/ai/prompt` contract so all exposed AI prompt routes remain contextual.
- Encoded document and AI context source IDs in auxiliary prompt/context API routes so documents inside folders reach the Rust local contracts correctly.
- Routed imported Markdown files through the local Rust project-file import contract instead of reading Markdown file content directly in the React shell.
- Added local Rust contracts for auxiliary runtime logging and log-folder opening routes so exposed diagnostics paths do not fall back to unimplemented local API responses.
- Expanded automated coverage for settings, dialogs, tree drag/drop, tab reorder, prompt context, transcription, previews, release notes, updater UI, GitHub login states and local runtime contracts.

## 2.0.2 - 2026-06-03

- Fixed GitHub login in installed builds so an unavailable remote GitHub OAuth flow can no longer persist or display an internal development placeholder account.
- Added runtime cleanup for any previously persisted development GitHub auth marker; affected users are returned to the correct unauthenticated GitHub-paused state after updating.
- Added real GitHub device authorization through the local Rust runtime when the release is built with the KnowNext.ai GitHub client ID.
- Limited mock GitHub authentication to internal test profiles and kept Windows/Android `desktop` and `mobile` profiles from accepting mock auth.
- Stopped frontend polling for GitHub device auth when the runtime reports GitHub remote auth is not configured.
- Strengthened the production bundle gate so development GitHub mock strings fail release validation if they leak into packaged frontend assets.

## 2.0.1 - 2026-06-02

- Improved GitHub sync degradation when the user is not signed in, loses connectivity, or no longer has repository access: documents remain editable, local history stays available, automatic remote sync pauses, and the document footer shows a quiet `Sin acceso a GitHub` state instead of repeated save/sync prompts.
- Added Rust and frontend contract coverage for GitHub remote pause/recovery and for documents that should not become dirty immediately after opening because of Markdown newline normalization.
- Cleaned the application settings modal for the local-first runtime: removed obsolete port, restart, external executable, and auxiliary service controls, leaving only local Rust runtime health, diagnostics, app data, and updater-relevant status.
- Fixed the production GitHub connection dialog so installed builds no longer display development/mock login copy when remote GitHub OAuth is not configured; the UI now presents remote GitHub as unavailable while preserving local work.
- Updated release documentation, manual acceptance steps, and download links for 2.0.1.

## 2.0.0 - 2026-06-02

- Migrated KnowNext.ai to a local-first Tauri v2/Rust architecture for Windows and Android.
- Removed the previous product server runtime, desktop process packaging, mobile endpoint discovery, legacy packaging scripts, legacy contract tests, and release workflow steps for that runtime.
- Added Rust runtime crates for shared contracts, storage/project operations, document export/preview helpers, and AI orchestration stubs.
- Replaced frontend HTTP transport with the `apps/desktop/src/lib/api` Tauri-command adapter while preserving the product API boundary for React components.
- Kept project selection, document tree operations, Markdown loading/saving, Milkdown editing, notes, drafts, tabs, versions, settings, diagnostics, imports, exports, previews, and AI panel contracts routed through local runtime services.
- Updated Android builds so the APK is autonomous and does not require a workstation app or external product service.
- Updated release validation to run TypeScript build, frontend tests, Rust tests, bundle cleanliness checks, Windows release build, Android release build, updater manifest checks, and manual Windows/Android acceptance before publication.
- Updated README, architecture, development, release, manual checklist, AGENTS, and release-skill documentation for the 2.0.0 local-first runtime.

Historical note: releases before 2.0.0 used a different local-service architecture. 2.0.0 is the compatibility break that removes that runtime from the product.
