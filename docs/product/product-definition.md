# KnowNext.ai Product Definition

KnowNext.ai is a desktop workspace for project documentation written in Markdown.

## First Product Version

The first version focuses on the core editing surface:

- Project selection.
- Folder, Markdown document, and project image tree.
- Document tabs.
- Visual Markdown editing through Milkdown.
- Project image management for PNG, JPEG, WEBP, and GIF assets, including upload, preview, Markdown linking, AI context use, and AI-generated image assets.
- Document status and save feedback.
- Mock Git commit history for the active document.
- Contextual AI prompt input for the active document.

## AI Document Assistant

KnowNext.ai includes a project-scoped AI assistant mediated by the local FastAPI backend.

- When a project is active, the first workspace tab is always `IA`. It shows the project conversation, including user prompts, assistant responses, and file-operation events.
- When a document is active, prompts use that document as the primary context, including the folder that contains it so related document-creation requests can default to the same location. AI edits are applied directly to the editor buffer and leave the document in `Cambios sin guardar`; the user still controls saving to disk and versioning.
- When text is selected in the active document, focusing the AI prompt keeps that selection visually highlighted and adds it as a removable focus context. This focus supplements the full document context; it does not replace it.
- Prompts include a short backend-built recent conversation context to resolve references like `eso`, `lo anterior`, or `ahora`, filtered to the active document when applicable. The active document and current prompt remain higher priority than conversation history.
- AI provider responses are interpreted as a structured plan with separate conversational `answer`, optional document change, optional project operations, and optional task plan. Conversational text must never be promoted into document content by backend keyword heuristics.
- Project images can be attached as explicit AI prompt context. When image context is active and vision is enabled, the backend sends image inputs through OpenAI Responses with the configured vision model/detail instead of React calling providers directly.
- The assistant can semantically infer image-generation requests from the prompt without keyword, language, or regex matching. Generated images are always saved first as normal project image files. If the user asks to include the result in the active document, the backend also returns an updated Markdown document with a relative image reference so Milkdown renders the image in the single-column document flow.
- The prompt has two execution modes. `Rápido` is the default: one direct call, no automatic agentic task, no automatic IA-tab routing. `Razonar` performs a short structured preflight before execution and can choose direct action, a real clarification, a blocked-permission response, or an agentic task.
- Reasoning depth is selected per prompt (`Ligero`, `Medio`, `Profundo`) so token use is explicit and task-specific instead of a global app default.
- The prompt microphone supports realtime transcription through the local backend. Its split control starts/stops dictation from the icon side and opens destination/language options from the chevron side. The destination can be `Transcribir al prompt` or `Dictar en documento`; document dictation writes at the active Milkdown cursor as unsaved user input and does not auto-send prompts or save files.
- Requests that need delayed execution create a project-scoped pending intent with a preserved target document. Follow-up prompts from the `IA` tab or from project mode still apply to that target when the LLM returns a structured execution decision.
- Pending intent controls appear as a compact card above the prompt with the target, action, state, and structured actions for allowing web research, applying, cancelling, or opening the IA conversation.
- Informational responses that do not modify a document appear in a compact dismissible bubble above the prompt and are also recorded in the `IA` tab.
- Multi-step requests can be routed automatically to the `IA` tab as guided tasks. Task cards show steps, source intent, estimated limits, web-research requirements, and checkpoints before creating or modifying documents.
- App settings permissions are the source of truth for AI actions. When the required permission is enabled, the assistant executes directly without asking for extra permission or showing a pre-approval step. When the permission is disabled, the assistant does not execute the action and tells the user it can be enabled in `Configuración de la app > IA`.
- The assistant can edit Markdown documents only when `Editar documentos` is enabled. It can create folders and Markdown documents only when the corresponding permissions are enabled. The document creation permission also allows AI document duplication and document moves; the folder creation permission also allows AI folder moves. Delete operations execute only when the delete permission is enabled. Image generation has separate permissions for generating images, creating image files, inserting them into documents, and using document context for visual prompts.
- OpenAI is the first supported provider. API keys are configured in app settings, stored locally through backend credential storage, and never exposed to React after save.
- Audio transcription uses `gpt-realtime-whisper` by default. React may capture microphone audio, but OpenAI realtime sessions are mediated by FastAPI so provider credentials remain backend-only.
- App settings include web research, action permissions, and max step/document/source/cost limits for agentic work. Task depth is selected from the prompt when using `Razonar`.
- Project-wide RAG is opt-in. When enabled, Markdown documentation is indexed with a project manifest, incremental file hashing, OpenAI vector stores for semantic retrieval, and a local exact-search index for terms, acronyms, filenames, and code-like references. Responses should cite relevant paths when evidence comes from the project.
- Image indexing is separately configurable. When enabled, project images are analyzed with the configured OpenAI vision model and local visual descriptions are stored for project asset metadata and future retrieval flows.
- Image generation is separately configurable from vision. Settings include provider model, size, quality, output format, default storage location, insertion confirmation preference, and whether to retain prompt metadata for generated assets.
- Prompts and document content must not be written to trace logs.

## Target User

Product engineers, technical leads, documentation owners, and teams that maintain project knowledge in Markdown repositories.

## Product Principles

- Markdown remains the storage format for documents; image assets remain normal local project files referenced from Markdown.
- The main editing experience is visual and document-like.
- Version history is commit-based and simplified for non-Git-heavy workflows.
- External filesystem changes are treated as an import queue. KnowNext.ai detects pasted folders or files in versioned local-Git projects, classifies risk, imports safe changes into a local version, and syncs to GitHub only through backend/runtime services.
- AI is contextual to the active document and mediated by the local backend.
- The desktop app should feel compact, fast, and professional.
- The app must show the user's real available state. It must not invent projects, documents, users, history, AI responses, or backend results through a product mock mode.

## Real Data And Empty-State UX

KnowNext.ai must not operate as a mock application in normal product use. Local development fixtures can exist for tests and isolated demos, but the running application must not silently replace missing backend data with sample projects, sample documents, sample users, sample Git history, or sample AI responses.

When there is no data, the interface must make that absence explicit:

- No projects: show a first-project empty state instead of selecting or displaying a sample project.
- No active user or disconnected GitHub account: show the anonymous/disconnected account state and keep authenticated capabilities disabled with explanatory copy.
- No documents in the active project: show an empty project workspace that explains that Markdown documents can be created or imported, without opening a fake document.
- No version history provider or no versions: show the unavailable or empty history state, not mock commits.
- No AI provider or unsupported AI mode: show the disabled or local-placeholder state explicitly, not a fake AI answer that looks production-backed.
- Backend unavailable: show a recoverable API/runtime error and keep the real empty/error state visible; do not fall back to mock data.

## First-Project Empty State

If the project list is empty, the sidebar project area must not render the project selector dropdown. It must render a compact first-project call to action:

- Primary control: a single orange action button with a plus icon and the label `Añadir primer proyecto`.
- Supporting text: explain that the first step is to create a project before the application can show documents, tabs, history, or document-aware AI. Suggested copy: `Crea tu primer proyecto para empezar a trabajar con documentación Markdown en KnowNext.ai.`
- The button opens the existing new-project flow.
- The empty state uses the same compact workspace language as the rest of the product: white/panel backgrounds, subtle border, no marketing hero, no permanent extra plus button beside a populated selector.
- Keyboard focus must land on the first-project button when the empty state is the first actionable control after startup.
- The state must remain stable after restart until a real project exists in `projects.json`.

Once at least one project exists, the normal project selector is shown. `Nuevo proyecto` remains inside the selector dropdown for the populated state.

## Initial Loading UX

Startup must present a clean loading layer before showing user state. The app must not flash default projects, empty panels, sample data, or partially initialized controls while projects, configuration, auth, capabilities, tabs, and the active project tree are loading.

The loading layer requirements are:

- It covers the workspace below the native/title area or the full app if the title area is not ready yet.
- It uses the KnowNext.ai palette: white background, very light panel tint, orange progress accent, main text `#111827`, secondary text `#6B7280`.
- It is visually quiet: compact logo or product name, one short loading label such as `Preparando espacio de trabajo`, and a subtle progress indicator or skeleton line.
- It must avoid fake content placeholders that look like projects or documents.
- It remains visible until the initial app state has resolved as one of: real loaded workspace, first-project empty state, authenticated/disconnected real state, or blocking runtime/API error.
- The transition out must be smooth: opacity transition around 180-260ms, no layout jump, no sudden content flash, and no double-rendered project selector.
- If initialization fails, the layer transitions into a clear error state with retry guidance instead of revealing stale or mock UI.

## Window And Layout Resizing

KnowNext.ai must behave like a real desktop workspace, not a fixed-size mockup.

- The Tauri window must be freely resizable by dragging any operating-system window edge or corner.
- The app must define practical minimum dimensions so the workspace remains usable and text does not overlap. Below the desktop breakpoint, the layout adapts to drawer-based navigation rather than forcing horizontal overflow.
- Window resizing must preserve active work: selected project, open tabs, unsaved editor content, drawer state where practical, and visible save/conflict feedback.
- Resizing the outer window must feel continuous. Main panes should flex smoothly without flicker, clipped controls, or sudden editor reinitialization.
- No product UI should imply a fixed desktop-only canvas; small widths must remain navigable even when dense workflows require drawers.

In desktop layout, the internal structure must also be width-resizable:

- The left folder/document panel is resized by dragging the vertical separator between the navigation panel and the main editor area.
- The right GitHub/version history panel is resized by dragging the vertical separator between the editor area and the history panel.
- Resize handles must be discoverable on hover/focus, show a subtle vertical orange resize line while active, and expose keyboard-accessible separator semantics.
- Widths must be clamped to sensible minimum and maximum values so the tree, editor, and history content remain usable.
- Panel widths must persist in `config.json` and be restored on restart.
- On tablet/mobile widths, the folder/document panel becomes a left drawer and the history panel becomes a right drawer. Drawer mode must not expose desktop resize handles.
- Panel resizing must not change document content, lose editor focus unexpectedly, reset Milkdown state, or mark documents dirty.

## Application Settings

The account menu includes `Configuración de la app`. It opens a modal settings window instead of navigating away from the workspace.

The account menu also exposes `Uso IA`, which shows a hover/focus usage layer grouped by active model. The layer reports monthly interactions, tokens, estimated cost in EUR, and a monthly total only when the month includes more than one model.

The modal requirements are:

- The left side lists settings sections.
- The right side shows the options for the selected section.
- `Servicios` is the first section and shows the health of local runtime services, including the backend endpoint, active/expected version, app data profile, and the latest diagnostic error.
- In the installed desktop app, `Servicios` includes a manual backend restart action. The runtime also monitors the backend and attempts to restart it automatically when the health check fails.
- `Apariencia` includes a language selector, an interface zoom control, global theme controls, primary color controls, and Markdown compatibility controls.
- The language selector persists the selected locale and applies it to the application document language.
- The zoom control persists a percentage between 85% and 125% and applies it to the current interface immediately.
- The theme control supports `Sistema`, `Claro`, and `Oscuro`. `Sistema` follows the operating system preference, while explicit light and dark choices override it immediately and persist in `config.json`.
- The primary color control uses the same eligible color family as project customization, defaults to orange, and updates global interactive accents, active states, focus highlights, and soft emphasis surfaces without changing project-specific icon colors.
- The appearance panel includes a compact live preview so users can evaluate the selected theme and accent before leaving settings.
- `Subrayado extendido` is enabled by default. It controls whether the editor may expose underline as an extended formatting option and must explain that underline is not standard Markdown and is saved as inline HTML such as `<u>texto</u>`.
- `Trazas` includes a toggle for local trace logging.
- When trace logging is enabled, KnowNext.ai writes user-visible errors and unhandled runtime failures to `knownext.log`.
- Logs live in a dedicated `logs` folder under the KnowNext.ai app data directory.
- Backend startup failures, failed health checks, supervisor restart attempts, and manual restarts must be written to `knownext.log` with enough detail to identify version/profile mismatches and sidecar launch problems.
- When trace logging is enabled, the settings panel shows an action to open that dedicated log folder in Windows Explorer.
- Logging must not expose prompts, document contents, or provider secrets; entries are limited to timestamp, level, source, message, and technical detail.
- If the local API is unavailable, the UI still shows the normal API error. Trace logging resumes when the backend is available and the setting remains enabled.

## Editor Toolbar UX

The editor toolbar must remain compact, fixed under the document tabs, and aligned with Markdown semantics rather than word-processor styling.

- The title bar, document tabs, editor toolbar, AI prompt, and document status bar stay fixed; the document canvas is the only vertical scrolling region.
- Block formatting uses a dropdown with `Texto normal` and headings `Título 1` through `Título 6` instead of separate heading buttons.
- Inline formatting exposes bold, italic, strikethrough, optional extended underline, inline code, and clear formatting.
- Structure tools include bullet lists, ordered lists, checklists, quotes, code blocks, and horizontal separators.
- Insert tools include links, project images, uploaded images, external image URLs, and a table picker.
- Inserting a project image writes a Markdown image reference. Uploading an image from the Markdown editor stores it beside the active Markdown document and inserts a relative reference.
- Moving or renaming an image rewrites Markdown references across the project when possible. Moving a Markdown document rewrites that document's relative image references so links remain valid. Deleting a referenced image warns that Markdown links will become broken.
- Table insertion opens a compact 5 x 5 visual grid with the hovered size and a secondary custom-size action.
- The toolbar degrades by priority on narrower widths: primary actions remain visible and less frequent actions move into compact format/structure/insert menus.
- The editor must not add free font colors, arbitrary font sizes, free alignment, or other non-Markdown word-processor controls.

## External Changes UX

When a user pastes a folder into a project with Windows Explorer, KnowNext.ai should feel protective rather than technical:

- Small, safe Markdown/image imports can be imported from a compact banner without interrupting writing.
- Large, sensitive, deleted, or unsupported changes require a right-side review drawer.
- The drawer answers what happened, what is safe, what is omitted, and what action is available.
- The tree shows temporary badges for affected files and folders while the import is pending.
- The status indicator uses human states and does not show Git branch names or low-level Git commands.
- If GitHub sync fails, the version remains saved locally and the UI reports `Pendiente de sincronizar` with a retry path through the existing sync controls.

Known limitation: automatic external-change detection currently depends on a local Git working tree. GitHub API cache projects need a future cache-baseline service before they can safely classify pasted files.

## Project Creation Flow UX

The new-project modal contains enough content that it must not be a single dense form on smaller screens. It should be structured as tabs or a short assistant/wizard.

The flow requirements are:

- The user must be able to choose between `Crear desde 0`, `Cargar carpeta`, and `Repo GitHub` without scanning a long vertical form.
- On desktop, tabs or a left-side step list are acceptable if the active mode content remains compact and visible without excessive scrolling.
- On smaller widths/heights, prefer a wizard or stacked tab flow with clear `Atrás`, `Siguiente`, `Crear proyecto`, and `Cancelar` actions.
- The modal must fit within the viewport using `max-height` and an internal scroll region; primary actions remain visible in a sticky footer.
- Inputs, explanatory copy, disabled GitHub/versioning modes, repository list loading, and validation errors must remain associated with the active tab/step.
- The user must be able to switch modes without losing already entered values in other modes during the same modal session.
- The GitHub repository selection area must handle loading, empty, unauthenticated, and error states without expanding the modal beyond the viewport.
- The same flow is opened from both `Nuevo proyecto` and `Añadir primer proyecto`.
- Keyboard navigation must support tab controls or wizard buttons, and focus must move to the active step heading or first invalid field after navigation/validation.

## Explicit Non-Goals In The First Shell Phase

- Real Git execution.
- Complex project persistence.
- Branch management UI.
- Raw Markdown as the primary editor.
