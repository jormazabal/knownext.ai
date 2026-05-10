# KnowNext.ai Product Definition

KnowNext.ai is a desktop workspace for project documentation written in Markdown.

## First Product Version

The first version focuses on the core editing surface:

- Project selection.
- Folder and Markdown document tree.
- Document tabs.
- Visual Markdown editing through Milkdown.
- Document status and save feedback.
- Mock Git commit history for the active document.
- Contextual AI prompt input for the active document.

## Target User

Product engineers, technical leads, documentation owners, and teams that maintain project knowledge in Markdown repositories.

## Product Principles

- Markdown remains the storage format.
- The main editing experience is visual and document-like.
- Version history is commit-based and simplified for non-Git-heavy workflows.
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

## Explicit Non-Goals In V1

- Real Git execution.
- Real AI provider integration.
- Complex project persistence.
- Branch management UI.
- Raw Markdown as the primary editor.
