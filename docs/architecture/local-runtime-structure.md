# Local Runtime Structure

Rust runtime code lives under `apps/desktop/src-tauri`.

## Crates

- `knownext-core`: shared product contracts, IDs, timestamps, errors, and runtime health structures.
- `knownext-storage`: project registry, document tree, Markdown reads/writes, handwritten-note `.knote` reads/writes, drafts, notes, configuration, versions, sync state, and local API path dispatch.
- `knownext-docs`: document export and preview helpers for Markdown, PDF, DOCX, spreadsheet-oriented content, and handwritten-note SVG/PNG/PDF rendering.
- `knownext-ai`: AI request/response contracts and provider orchestration entry points. Mock behavior is allowed only as a replaceable service implementation.
- `knownext-ai-skills`: declarative AI skill registry, embedded base skill manifests, compact modes, selector metadata, prompt guidance, and runtime validation.
- `knownext-drawing`: local handwritten drawing composition. It converts AI `SceneSpec` drawing intent into deterministic vector layout, stroke-font text, handwritten strokes, generated-element metadata, and quality diagnostics for `.knote` drafts.

The crate map may evolve, but business logic must stay in Rust services rather than React components or Tauri command handlers.

## Command Boundary

Tauri command handlers in `apps/desktop/src-tauri/src` are the native bridge. They should:

- validate and normalize command input
- call a Rust service
- return structured JSON or binary payloads
- record diagnostics when needed
- avoid large business-rule blocks

The frontend API layer adapts old `/health` and `/api/*` style paths to Tauri commands through `local_api_request` and `local_api_content`. Feature components should remain unaware of the transport.

## Runtime State

The runtime stores product state in the Tauri app data directory. Expected state includes:

- `projects.json`
- `config.json`
- `notes.json`
- `credentials.json`
- project folders and Markdown files
- project-scoped `.knote` handwritten-note files
- drafts and version metadata
- preview/export caches when implemented
- diagnostic logs

Release bundles must not contain those runtime files.

## Git, GitHub, And AI

React never executes Git, filesystem, or AI provider operations directly. Rust services mediate:

- local Git history and future GitHub synchronization
- image and attachment imports
- document export and reference previews
- handwritten-note validation, drafts, rendering, export, Markdown insertion assets, and AI context preparation
- AI context indexing, prompt execution, permissions, and credential access
- AI skill prefiltering, selector gating, prompt composition, and validation diagnostics
- handwritten AI drawing execution from structured intent to validated `.knote` draft strokes

No separate product service or auxiliary product process is part of the runtime.

## Handwritten Notes

Handwritten notes are local project documents with MIME `application/vnd.knownext.handwritten-note+json` and extension `.knote`. The source format is JSON schema version 1 containing note IDs, timestamps, default page settings, page metadata, raw stroke points `[x, y, pressure, time, tiltX?, tiltY?]`, derived stroke paths, bounds, and OCR/transcription metadata. `.knote` files may retain `toolPresets` for backward compatibility and portability, but the active pencil preset list is stored in app configuration at `config.json -> handwritten.toolPresets`.

The local API owns the durable operations:

- `POST /api/projects/{projectId}/handwritten-notes`
- `GET /api/handwritten-notes/{noteId}`
- `PUT /api/handwritten-notes/{noteId}`
- `PUT /api/handwritten-notes/{noteId}/draft`
- `DELETE /api/handwritten-notes/{noteId}/draft`
- `POST /api/handwritten-notes/{noteId}/export`
- `POST /api/handwritten-notes/{noteId}/export/content`
- `GET /api/handwritten-notes/{noteId}/pages/{pageId}/render`
- `POST /api/handwritten-notes/{noteId}/pages/{pageId}/insert-markdown`
- `POST /api/projects/{projectId}/ai/context/handwritten-notes`

Drafts and render caches live in app data. Project files are written only for the `.knote` source itself and user-visible derived assets, such as inserted page images under `assets/handwritten/`. Android PDF export must use the handwritten render path and must not fall back to textual PDF placeholders for release acceptance.

AI drawing in handwritten notes uses `draw_handwritten_note`, not Markdown editing. The model returns `DrawingBrief` and semantic `SceneSpec`; Rust converts that into a `VectorPlan` and then into `HandwrittenStroke[]` with the note's tool presets. Runtime policy blocks `debug_raw_strokes` in product flows, applies append-only drawings as drafts, and refuses replacement or cleanup of existing strokes unless a future explicit selection/lasso flow authorizes it.

## AI Skills

AI skills are versioned declarative capabilities. They can contribute instructions, constraints, examples, output action expectations, modes, and validators to Rust-controlled AI flows. A skill cannot execute commands, access files, call providers, enable tools, or grant product permissions.

A mode is a scoped way to apply a skill, such as `knownext.mermaid / diagram_structure` or `knownext.markdown / table`. A template is reusable content or guidance used inside a skill. A policy is a Rust-owned runtime rule, usually derived from permissions or capability settings. A validator is Rust-owned code that checks manifests, selected modes, or provider output before the UI applies an operation.

Base skills live in the `knownext-ai-skills` crate and are embedded into the installed binary with `include_str!`. Their source is `base`, their visibility is read-only, and the runtime exposes them through local API contracts for inspection and validation:

- `GET /api/ai/skills`
- `GET /api/ai/skills/{skillId}`
- `POST /api/ai/skills/{skillId}/validate`
- `POST /api/ai/skills/selection-preview`

Rust owns manifest validation, candidate prefiltering, final policy gates, prompt composition, and post-provider validation. The selector LLM can propose `skillId`, `modeId`, action, confidence, and reason from compact metadata, but it never receives full `SKILL.md` content and never has final authority. If the selector fails, Rust can still use narrow deterministic fallback only for explicit UI actions that are already allowed by runtime policy.

The base registry uses compact skills with modes. Active runtime skills in this phase include `knownext.mermaid`, `knownext.markdown` table mode, and `knownext.handwritten_drawing` for `.knote` drawing intent. Document review, composition, editing, project knowledge, and governance skills are visible as base capabilities, but runtime-disabled until their minimum validators and application flows are product-ready.

The frontend can list, inspect, preview selection, and display diagnostics for skills, but it must not infer used skills from provider text, compose skill prompts, validate manifests locally, or treat a skill as a permission grant. `source=user` and `source=imported` remain part of the contract for future work, but this release does not enable user skill editing, import, export, or project-level activation.
