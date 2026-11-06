# Manual Test Checklist

Use this checklist before publishing a KnowNext.ai release. For 2.3.0, run critical acceptance on packaged Windows and Android builds. Do not publish if a critical item fails.

Use `docs/development/functional-validation-matrix.md` to record which areas are proven by automated tests, which areas have been manually validated, and which areas remain blocked by credentials, signing keys, or device access.

## Build Under Test

- Version: `2.3.0`
- Windows artifact: primary installer `KnowNext.ai_2.3.0_x64_en-US.msi`; secondary NSIS asset `KnowNext.ai_2.3.0_x64-setup.exe`
- Android artifact: `KnowNext.ai-android-arm64-v2.3.0.apk`
- Runtime: local Tauri/Rust, no external product service or workstation service dependency.

## Automated Gate

- `pnpm version:check` passes.
- `pnpm build` passes.
- `pnpm test` passes.
- `pnpm rust:test` passes.
- `pnpm bundle:check-clean` passes.
- `pnpm release:check` passes.
- Windows Tauri release build succeeds with updater signing.
- Android release build succeeds with Android signing.
- Bundles and installers pass the clean-distribution scanner for removed runtime markers, runtime data files, seed projects, and API keys.

## Windows Critical Acceptance

- For dev validation, start from a clean port and launch the native Tauri window from an interactive PowerShell:
  - `netstat -ano | findstr :1420`
  - Stop only the stale PID that owns `127.0.0.1:1420`, if present.
  - `cd C:\Dev\knownext.ai`
  - `pnpm --filter @knownext/desktop tauri:dev`
  - The validation window must be a native Tauri window, not the Vite page in a browser tab.
- Install or update the packaged Windows app.
- Open the app and confirm startup resolves to an empty workspace or the user's preserved real workspace, not sample data.
- On a Git/GitHub project, confirm startup does not repeatedly open and close terminal windows while history and sync status are checked.
- Create a project from the project selector.
- Create a folder and Markdown document from tree menus.
- Select a folder, then use the tree `Añadir` menu to create a folder, Markdown document, handwritten note and imported file; confirm each item is created inside the selected folder. Open a document inside another folder, clear folder selection if needed, repeat create/import from `Añadir`, and confirm each item lands beside the active document instead of project root.
- Create a handwritten note from the tree add menu and from a folder context menu; confirm it opens directly in writing mode with one page ready.
- Open multiple tabs, switch tabs, close tabs, and confirm the active document stays stable.
- Open Markdown, image/reference and handwritten tabs together; switch between them with dirty handwritten changes and confirm drafts are preserved.
- Use the tab context menu actions `Cerrar`, `Cerrar otras pestañas` and `Cerrar todas las pestañas`; with dirty tabs, confirm the confirmation dialog advances one document at a time and no tab is skipped.
- Drag document tabs to reorder them; confirm the order persists while switching tabs and reopening the app.
- Edit in Milkdown, save, close, reopen, and confirm Markdown content persists.
- In a handwritten note, verify bolígrafo, pluma, lápiz, rotulador, subrayador, eraser and lasso; change color, width, opacity, pressure sensitivity and smoothing; confirm undo/redo works after writing, erasing and moving a lasso selection.
- Verify handwritten page templates: blank, ruled, grid, dots and Cornell. Add pages, switch pages from thumbnails, collapse/expand the page rail, zoom and pan without losing the active tool.
- With a Windows pen, confirm pressure changes stroke width, the stylus writes, a finger scrolls, two fingers zoom, palm contact does not create unwanted strokes, and a 20-page note remains responsive.
- Save, close and reopen a handwritten note; confirm strokes, tool presets, page backgrounds, thumbnails and dirty state are preserved.
- Export a handwritten note to `.knote`, PNG, SVG and PDF; confirm filenames/extensions are correct and the PDF contains rendered pages.
- Insert a handwritten page into an active Markdown document; confirm the image is written under `assets/handwritten/`, renders in Milkdown, and offers a path back to the original note metadata.
- Select a word, phrase and partial paragraph in Milkdown; apply each highlight color, change one highlight to another color, remove a highlight, save, reopen, view raw Markdown, and confirm MD/PDF/DOCX exports preserve the highlighted text.
- Apply `Cita` from the Markdown toolbar to selected text, then apply it again and confirm the blockquote style is removed.
- Edit a document without saving, force an orphaned draft by removing the backing Markdown file from disk, then open `Borradores recuperables`; confirm the draft is listed, can recreate the file, and disappears after restore or discard.
- Create and save user notes.
- In a disposable validation project or copied workspace, drag documents, folders, images, and attachments in the tree to move them between folders and to the project root; confirm the resulting filesystem paths, open tabs, and image/document references stay consistent.
- Open `Guardado y sincronización` from the file tree toolbar and confirm it shows a single file list ordered by modification date, with Local, Historial local and GitHub status columns and no Actividad or Detalles tabs.
- In `Guardado y sincronización`, verify filters for `Necesitan atención`, `Borradores`, `Historial pendiente`, `GitHub pendiente`, `Conflictos` and `Omitidos`, and confirm actions are available per file or as batch actions.
- In an automatic GitHub project, edit and save one Markdown document; confirm KnowNext.ai creates a local version and, when GitHub has no remote changes, uploads the pending version to GitHub without marking unrelated files as pending.
- In an automatic GitHub project with GitHub offline, unauthenticated, or unauthorized, save a document and confirm the change remains in local history with GitHub shown as paused and pending, without repeated error prompts.
- In an automatic GitHub project where GitHub has remote changes, save or refresh sync status and confirm automatic sync pauses for review instead of pulling remote changes automatically.
- Restore one document from a version that was created from a multi-file commit; confirm only the active document is restored and a new local version is created.
- Add a Markdown file and a `.env` file directly in the project folder outside the app; scan guardado/sincronización and confirm the Markdown can be imported into local history while the private file remains omitted.
- Import or attach an image and confirm it renders in the document/reference viewer when supported.
- Import a single Markdown/PDF/DOCX/XLSX file and confirm the imported file opens immediately as the active editable document or supported preview.
- Insert an imported image into a Markdown document, then move the image, move the document, and move their containing folders; confirm Markdown image references are recalculated and remain valid.
- Move, rename, duplicate and delete a handwritten note from the tree; confirm open tabs, sync/history rows and Markdown references to exported/inserted renders remain coherent.
- Move an image generated from a handwritten note and then move the Markdown document that references it; confirm the Markdown image reference is recalculated like other local assets.
- Hover an image in a Markdown document, click the bottom-center edit icon, then confirm the edit dialog can change the alt text, replace the image through project/upload/URL modes, and delete the image from the document.
- Insert a Mermaid diagram from the Markdown toolbar, use the example catalog, validate it in the dialog, confirm it renders visually in the document, hover it and use `Editar` to reopen the dialog with the original code, then update and delete it.
- In Settings > Capabilities, switch Mermaid profiles between maximum compatibility, local visual and controlled experimental. Confirm compatible mode blocks icon/image enriched diagrams, local visual mode allows bundled `lucide:*` icons, and beta examples show a warning or are blocked according to the beta policy.
- Export a document containing at least one Mermaid diagram to PDF and DOCX; confirm the exported files embed the rendered diagram image, not raw Mermaid code.
- Reindex project images from settings and confirm the result reports the real number of project images and indexed images.
- Open AI/capabilities settings and confirm image generation exposes `gpt-image-2`, model, size, quality, format, destination folder, document insertion, document-context and asset-permission controls.
- Open AI/documental settings and confirm RAG exposes local index status, document counts, local index ID, `Reconstruir índice` and `Limpiar índice`; rebuild the index and confirm the document count updates.
- Add a handwritten note as IA context; confirm the source chip appears, OCR/transcribed text is used when available, and the note is counted separately from Markdown documents in the local index status.
- In an active `.knote`, ask IA to draw a 5-step flow, a 2x2 matrix, a timeline, a mind map and a wireframe. Confirm the result appears as editable handwritten strokes, the IA bubble reports a concrete summary/diagnostics, the note becomes dirty as a draft, and the `.knote` file is not saved until using Save.
- In a `.knote` that already has strokes, ask IA to clean, replace or redraw existing content without selecting anything. Confirm the runtime blocks replacement and explains that explicit selection/lasso is required.
- Open Settings > Skills de IA. Confirm the compact base skills list is visible, base skills show a `Base` badge, runtime status is visible, and selected base skill content is read-only with the copy `Skill base incluida con KnowNext.ai`.
- Inspect `knownext.research_report` from Settings > Skills de IA. Confirm it appears as a base read-only skill named `Informe de investigación`, shows modes (`ejecutivo`, `profundo`, `comparativo`, `normativo`, `técnico`), and lists coordinated/auxiliary skills such as Markdown and Mermaid.
- Inspect `knownext.mermaid` from Settings > Skills de IA. Confirm the summary, modes, instructions, manifest, examples, and diagnostic tabs render, then run validation and confirm the manifest reports a valid state.
- In `knownext.mermaid`, review the Mermaid catalog grouped by family and confirm beta entries such as `architecture-beta` show their required policy and aliases.
- Use the `Probar seleccion` panel with a Mermaid prompt and then with a Markdown table prompt. Confirm the preview shows candidates, selector or fallback decision, accepted/rejected applications, and policy/validation diagnostics without mutating a document.
- Confirm Settings > Skills de IA does not expose active edit, duplicate, import, export, or per-project activation actions; only passive preparation for user skills may be shown.
- In the document prompt, add context from a project document, then use `Adjuntar archivo` to select an external Markdown/PDF/Office/image file through the native picker. Confirm both sources appear as chips, `Fuentes` shows the correct count, preview works, and each source can be removed without affecting project files.
- Type `@` in the prompt and confirm the reference picker has a bounded height with scroll, can be closed, shows the folder path above and the filename below, and does not repeat the filename in the path.
- Drag a project document/image/attachment from the tree onto the prompt input and confirm it is added as IA context without uploading a duplicate external file.
- Open PDF/DOCX/XLSX reference previews where supported and confirm failures are visible and non-destructive; for XLSX, verify the sheet selector lists real workbook sheets and the grid shows actual cell values.
- Export a document to MD, PDF, and DOCX.
- Use the AI panel on the active document. With an OpenAI key configured, ask a question that requires context from another indexed project document and confirm the answer cites/uses that context. Then ask for a generated image and confirm a local image asset is created, appears in the tree/viewer, and is inserted into the document when insertion is enabled.
- Select a paragraph, ask IA to include an image that supports that selected text, and verify the app does not ask where to place it: the image is generated as a local asset, inserted directly where the IA judged appropriate, and the selected text is treated as context rather than as a mandatory insertion point.
- Select text in a Markdown document, ask IA to expand or rewrite only that selection, and verify the selected text changes directly as a dirty draft instead of showing raw JSON or an approval dialog.
- Place the cursor without selecting text, ask IA to insert content at that point, confirm the prompt chip says cursor context, and verify the insertion lands directly at the cursor.
- Ask IA to update one concept across several sections or documents. Confirm safe anchored operations apply directly, changed documents open as dirty tabs when needed, and only ambiguous/stale operations remain blocked for review in the IA surface.
- Ask IA to insert an existing project image into the active document and verify the Markdown image reference is inserted directly, renders, and points to the local project asset.
- Ask IA to add a process, architecture or sequence diagram to the active document; confirm the IA returns an editable Mermaid diagram aligned with the active profile, reports the used AI skill and mode such as `Mermaid / structure` or `Mermaid / sequence`, renders visually, and PDF/DOCX export embeds it.
- Ask IA to create a Markdown comparison table and confirm the response reports `Markdown / table` when selected, with table validation diagnostics when available.
- From the prompt `+` menu, choose the single `Investigación` option; confirm it creates an explicit research intent chip and does not expose quick/deep/compare/current-document variants.
- In Settings > Capabilities > Investigación, confirm only `Coste máximo por investigación`, `Diagramas` and `Imágenes` are editable; depth, source presets, web toggle, estimated time, steps, documents and auto-start must not be shown.
- Send a research prompt and confirm the card shows a reviewable plan, not technical controls: objetivo principal, exactly 3 objetivos secundarios, exactly 5 aspectos a investigar, estilo recomendado, `Fuentes candidatas` (`10 · 50 · 200 · 500`), `Extensión` (`Breve · Estándar · Amplio · Exhaustivo`) and a 60-second countdown next to the start action.
- Confirm the system proposes candidate sources and report length according to the objective, shows a short rationale, and lets the user adjust both controls before starting.
- Confirm the research plan shows `Informe de investigación` as the main skill plus expected auxiliary skills/resources. With diagrams/images enabled globally, the final job should report used skills and validation diagnostics in the IA card/conversation when those resources are used.
- Edit the research plan before it starts; confirm the countdown pauses, objective, secondary objectives, research aspects, style, candidate sources and report length are editable, and `Iniciar ahora` uses the edited plan.
- Start an investigation and confirm `POST /jobs` returns quickly, the card shows progress (`Preparando`, `Buscando`, `Leyendo`, `Redactando`, `Revisando`), and the final job creates and opens a new Markdown draft with methodology, citations/sources, contradictions, conclusions, recommendations and limitations without modifying the active document.
- Enable generated images globally for research, run a provider-backed investigation that requests a useful visual, and confirm generated images are saved as local assets and referenced in the final Markdown under `Recursos visuales generados`.
- Cancel an active investigation and confirm no partial document is created. Force a failed investigation, confirm the error is actionable and `Reintentar` creates a linked new job.
- Review the completed investigation sources/quality in the IA card: it must show sources found/read/cited, evidence count, quality status, limitations and retry actions. Use the API endpoints for list, sources, quality, activity and coverage during release verification.
- Simulate missing OpenAI key or disabled legacy web configuration, repeat an investigation, and confirm the job fails asynchronously with a clear action message without creating a document.
- With architecture-beta enabled, force or simulate an invalid architecture-beta proposal that uses flowchart syntax such as `A --> B`; confirm Rust blocks the edit proposal and the AI response shows a `knownext.mermaid / diagram_structure` diagnostic instead of applying the invalid diagram.
- Ask the AI to create a new document with document-creation permission enabled and confirm the request is visible in the IA tab conversation, the created document opens as the active tab, and the Markdown lands in the selected folder or beside the active document instead of project root.
- In the IA tab conversation, confirm message bubbles show compact footers with document links, timestamp and copy action, are grouped by `Hoy`, `Ayer`, week or month separators, and initially render only the latest 40 messages with `Mostrar más` loading older messages.
- Open settings > Capacidades and confirm Investigación exposes only the three global controls agreed for product use: max cost, diagrams and images.
- Open settings, confirm Services shows `Runtime local`, `Contrato local`, `tauri://local-api/health`, no port control, no restart action, and no external executable.
- Open settings > System diagnostics and confirm the Git/GitHub service reports the active project, Git availability, local history state, origin/remote state, and GitHub paused state when unauthenticated.
- Configure an OpenAI key, connect GitHub, then close only the GitHub session; confirm the OpenAI key remains configured. Reconnect GitHub, update the OpenAI key, and confirm GitHub remains connected.
- Open a GitHub-synced project without a GitHub account or without repository access. Confirm editing, saving, and local history continue; the document footer shows `Sin acceso a GitHub`; automatic remote sync pauses without repeated save/sync error prompts.
- If a previous install shows an internal development GitHub placeholder account or a public GitHub account without a private credential, update to 2.3.0 and confirm it is cleared to `Sin cuenta GitHub`; attempting GitHub login must start the real GitHub device flow in the installed app. If a temporary fallback such as `GitHub remoto no configurado` appears, close and reopen or use `Reintentar login` and confirm the app attempts the device flow again instead of staying stuck in the fallback. If the account is disconnected or lacks permissions, the UI must show GitHub as paused while local history remains usable.
- Enable diagnostics, trigger a visible error, and confirm trace/log access works.
- Check for updates and confirm the updater uses the signed Windows manifest.
- Resize the window across compact and normal widths without overlapping core controls.
- Insert or open an embedded image, drag its bottom resize handle and confirm the image resizes live while dragging, keeps its natural proportions, stops at the available document width, and does not create empty white margins above or below the image.
- Use image hover actions to edit, reset size, open fullscreen and delete. Confirm reset returns to responsive default sizing rather than preserving a manual size.
- Insert or open a Mermaid diagram and confirm it uses the same visual toolbar pattern as images: edit, reset size, fullscreen and delete.
- Resize a Mermaid diagram from the bottom handle, confirm the gesture is vertical, proportional and capped by the document width.
- Open image and diagram fullscreen views, then verify zoom in, zoom out, 100%, fit, pan and `Esc` close behavior.

## Android Critical Acceptance

- Install the packaged APK on a clean Android device or emulator.
- Start the app with no workstation app, LAN service, or external product service running.
- Confirm startup reaches the app workspace without asking for a runtime endpoint.
- Create a project offline.
- Create a folder and Markdown document.
- Edit in Milkdown, save, close, reopen, and confirm content persists.
- Create a handwritten note offline; write with stylus hardware when available and confirm pressure or graceful pressure fallback, finger scroll, two-finger zoom and palm rejection.
- Rotate the device while a handwritten note has unsaved strokes; background and resume the app; confirm the recoverable draft and active tab survive.
- Save, close and reopen a handwritten note on Android and confirm strokes, tools, page backgrounds and thumbnails persist.
- Export a handwritten note to `.knote`, PNG, SVG and PDF on Android; confirm PDF export contains rendered pages, not fallback text.
- Insert a handwritten page into Markdown on Android and confirm the local asset renders after save/reopen.
- Use tabs and notes.
- Import/export documents where Android permissions allow it.
- Open supported reference previews or confirm unsupported previews fail with visible product errors.
- Use the AI panel through the local runtime contract.
- Open settings and confirm local runtime diagnostics and no endpoint configuration.
- Check Android updates through `android-latest.json`; confirm package id, version code, SHA-256, and installer handoff behavior.
- Reboot or relaunch the app and confirm local app data persists.

## Release Publication Gate

- GitHub release draft contains Windows NSIS, Windows MSI, both `.sig` files, `latest.json`, Android APK, and `android-latest.json`.
- `latest.json` resolves to `2.3.0` and points `windows-x86_64.url` to the MSI artifact.
- `android-latest.json` resolves to `2.3.0` and points to `KnowNext.ai-android-arm64-v2.3.0.apk`.
- README Windows MSI and Android download URLs return HTTP 200.
- A previous Windows install updates to 2.3.0 without deleting app data.
- An Android install updates to 2.3.0 while preserving app data and still works offline.

## Known 2.3.0 Limitations To Record If Still Present

- GitHub synchronization must use the Rust Git service; if credentials or permissions are missing, the UI must pause remote sync while local history remains usable.
- AI provider execution requires locally stored OpenAI credentials and must be validated with a real key before claiming provider acceptance.
- AI image generation and local RAG require real-provider hands-on validation before release acceptance; do not claim acceptance if generated assets, Markdown insertion, or indexed-document retrieval fail.
- Investigación web requires OpenAI credentials and should be validated with a real key before release acceptance; the agéntic research pipeline must persist each phase, support cancellation/retry, and never create partial documents on `failed_provider`, `failed_quality` or `cancelled`.
- Some document previews may be best-effort depending on Rust conversion support.

Any limitation here must be repeated in `docs/releases/2.3.0.md` before publication.


## Grabación y catálogo OpenAI — aceptación pendiente en dispositivos

- [ ] Windows: Teams con auriculares; micrófono solo, salida sola y ambas. Verificar nombres efectivos, niveles y ausencia de reproducción del micrófono.
- [ ] Pausa: contador detenido, barras apagadas, ninguna muestra capturada; reanudar mantiene sesión. Desactivar última entrada pausa sin reanudar al activarla.
- [ ] Desconectar dispositivo, cambiarlo estando pausado y suspender el equipo: interrupción visible, audio recuperable, sin reanudación automática.
- [ ] Bandeja gris/naranja/pausa, X oculta, instancia instalada y desarrollo independientes, autoinicio sin captura y fallo de registro visible.
- [ ] Carpeta/raíz, destino al parar, cancelar selector, cero proyectos, carpeta eliminada y nombres coincidentes. No sobrescribir ni cambiar destino silenciosamente.
- [ ] Reunión de dos horas con pausas y funcionamiento offline: memoria acotada, duración correcta y sincronía entre fuentes.
- [ ] Android físico: pantalla bloqueada, cambio de aplicación, rotación, llamada entrante, micrófono ocupado, permisos denegados/revocados, notificación y controles.
- [ ] Android: matar proceso tras parar; WorkManager recupera fragmentos sin WebView; abrir Grabaciones desde la notificación. Probar ahorro de batería.
- [ ] Castellano, euskera y bilingüe con fixture autorizado: integridad de palabras en cortes; no prometer diarización.
- [ ] Cancelación durante envío, timeout con resultado desconocido, reintento explícito, fallo solo al guardar: conservar resultados y no duplicar documentos.
- [ ] Audio retenido siete días desde documento, Conservar, eliminación manual, limpieza con reproducción/procesamiento activo. El MD permanece.
- [ ] Teclado, Escape/foco de diálogos, 200 % de escala, pantalla pequeña y controles táctiles de 44 px; estados comprensibles sin color.
- [ ] Catálogo: desconocido/retirado visible sin sustitución; parámetros compatibles; comprobar acceso sin generación facturable.
- [ ] Coste: USD, conversión BCE fechada, sin cambio, referencia >7 días, históricos separados y presupuesto EUR detenido sin referencia válida.
- [ ] Mantener edición Milkdown, navegación, guardado, selector de proyectos, menús de árbol, pestañas, historial, IA, importación/exportación y previsualizaciones durante procesamiento.
- [ ] Regresión de ajustes, actualización Windows y Android offline. Esta tarea no publica ni instala una release.


### Evidencia parcial Windows del 30/10/2026

- [x] Loopback Realtek con voz sintética, inicio desde PRUEBAS, pausa/continuación en una sesión y Markdown correcto.
- [x] PCM sin cambios durante la pausa; las frases de pausa no aparecen en las dos transcripciones reales.
- [x] Inicio general, destino diferido, cancelación conservadora y recuperación desde el historial.
- [x] Guardado con nombre coincidente crea sufijo (1) y conserva el original.
- [x] Botón derecho de carpeta y Markdown nuevo sin identificador técnico visible.
- [x] Miniventana abierta por el usuario desde la bandeja; inicio, pausa, continuación, parada, selección de destino, transcripción y apertura del Markdown verificados.
- [x] Panel principal y miniventana muestran la misma sesión y contador.
- [x] Barras con señal durante reproducción sintética; PCM y SHA-256 estables durante la pausa de la sesión de bandeja.
- [ ] Inspección específica del cambio de color del icono en el área de notificaciones.

Detalle y alcance: [validación de grabación](recording-validation.md#prueba-nativa-windows--30-de-octubre-de-2026).


## 3.0 - Compact controller and modal foundation (implementation in progress)

- [ ] Windows tray: open/close/reopen during capture without stopping or duplicating the session.
- [ ] Ready/recording/paused: one row per source; timer, levels and recording controls visible.
- [ ] Expand and scroll sessions: capture controls remain outside the scrolling list.
- [ ] Pause permits changing devices; inactive/untested levels differ from live signal.
- [ ] Compact window initial 420x260, expanded height at most 480; check work area and DPI 100/125/150/200.
- [ ] Settings and full manager open the main window and preserve the active capture.
- [ ] Create document at 320/390 CSS px with virtual keyboard: complete form and reachable actions.
- [ ] Create dialog: focus inside, Tab cycle, Escape close, background inert and focus returned.

Frontend fixtures and automated checks do not replace native acceptance of this new presentation. See [current execution report](../product/revision-3.0-implementacion/avance-01.md).

## 3.0 · Biblioteca, recuperación y acceso rápido

- [ ] Windows y Android: seleccionar archivos y carpetas por teclado/tacto; mantener e informar selección oculta por filtro o plegado.
- [ ] Revisar Mover y Papelera: carpeta con descendiente seleccionado equivale a una operación; detectar destino propio, ajeno, repetido u ocupado.
- [ ] Cambiar el archivo fuera de la app después de revisar: rechazar el lote antes de la primera mutación y permitir revisar de nuevo.
- [ ] Proteger borradores antes del lote; impedir doble envío; comprobar tabs y sesiones de Markdown, .knote, imágenes y adjuntos tras mover o eliminar carpetas.
- [ ] Restaurar carpeta con recursos desde papelera en proyecto sin Git; rechazar colisión conservando ambos contenidos.
- [ ] Interrumpir un lote: consultar registro y resultados sin reejecución automática. Comprobar retención sin purga automática.
- [ ] Paleta Ctrl/Cmd Mayús P con navegación oculta: acción, archivo homónimo por ruta, proyecto y reciente; Esc y retorno de foco.
- [ ] Búsqueda guardada: cambios externos, movimiento, papelera/restauración; alcance explícito, límites y archivos sin consultar.
- [ ] Contexto: cerrar por botón/Esc y devolver foco; Esc de menú/diálogo no debe cerrar también el panel.
- [ ] Android offline: crear/abrir/editar/guardar, búsqueda, mover y restaurar, reiniciar y comprobar persistencia.

Evidencia parcial automatizada y nativa: [avance 03](../product/revision-3.0-implementacion/avance-03.md). Mantener estos casos abiertos hasta completar su aceptación en cada plataforma.

## 3.0 · Continuidad, credenciales y primer uso

- [x] Android QA API 36 sin red: crear proyecto y Markdown, editar, guardar, reiniciar el proceso y reabrir el contenido.
- [x] Android QA: conservar el documento activo tras reinicio; el valor explícito null de la utilidad activa no se transforma en Notas.
- [x] Android QA: tablas, Mermaid e imagen SVG local bajo CSP, sin rechazos observados en este corpus.
- [x] Android Keystore con credencial sintética: migración, archivo cifrado, lectura tras reinicio, rechazo de alteración autenticada, conservación ante guardado fallido y retirada de la clave.
- [ ] Windows y Android: completar recuperación guiada de almacén inaccesible, dispositivo nuevo, migración real y downgrade documentado.
- [ ] Android: restauración cloud y transferencia con las exclusiones de credenciales; no inferirla de la compilación de XML.
- [ ] Primer uso con TalkBack/lector y tacto físico; apertura de archivos con un toque y selección múltiple sin aperturas accidentales.
- [ ] Móvil con teclado virtual: pasos de alta, errores y acciones siempre alcanzables a 320/390 px.
- [ ] Forzar respuestas tardías con edición continua, cierre, movimiento y cambio de proyecto; conservar texto/trazos y foco. Hay cobertura automatizada de reductores, pendiente aceptación de los recorridos completos.
- [ ] Forzar fallo de creación/actualización: datos conservados, reintento explícito y una única operación; cancelar/Esc no interrumpen una escritura en curso.
- [ ] Barra común: Grabaciones accesible sin cubrir Guardar ni feedback; comprobar alturas pequeñas y zoom.

Estos contrastes parciales corresponden a identidades de prueba separadas. [Evidencia y pendientes](../product/revision-3.0-implementacion/avance-04.md).

## 3.0 · Recuperación e historial

- [x] Android QA sin red: recrear Markdown desde su copia, abrirlo, reiniciar el proceso y conservar el texto.
- [x] Android QA sin red: recrear .knote conservando página y trazo, también tras reinicio.
- [x] Android QA: confirmar descarte y elegir conservar; la copia permanece disponible.
- [x] Android QA: borrador antiguo sin base verificable bloquea guardado ordinario; mantener mi versión requiere una decisión explícita.
- [ ] Windows/Android: conflictos de texto y trazos con controles adaptables, teclado/lector y foco; editar mientras se espera cargar disco conserva los cambios nuevos.
- [ ] Historial: cambios hechos fuera de la app, renombrado y archivos homónimos; comparar la última versión guardada con el borrador y volver al documento abierto.
- [ ] Restaurar: archivo cambiado después de abrirlo, nuevas ediciones durante la petición, falta de permisos y Git bloqueado; distinguir archivo restaurado de versión todavía no registrada.
- [ ] Mover/renombrar carpetas con borradores, enlaces y pestañas abiertos; ninguna copia se aplica a otra identidad.

Las casillas nativas se limitan al paquete QA y las rondas indicadas en el [avance 05](../product/revision-3.0-implementacion/avance-05.md). Las pruebas automatizadas de historial y cola no cierran la aceptación nativa restante.

## 3.0 · Traslados y referencias

- [x] Android QA 09 sin red: abrir un borrador, moverlo con el menú del árbol, conservar su texto pendiente y actualizar el enlace relativo del editor.
- [x] Android QA 09: otro documento recibe el destino trasladado y conserva su ancla; guardar el borrador confirma el texto y retira la copia pendiente.
- [x] Android QA 09: reiniciar conserva documento activo, ruta, contenido y enlaces actualizados.
- [x] Android QA 09: nota manuscrita con base desconocida conserva cero trazos en disco tras guardar ordinariamente y un trazo en su borrador. Mantener mi versión guarda el trazo, retira el borrador y conserva el resultado tras reinicio.
- [ ] Windows y Android: traslados por lotes de carpetas mixtas con trazos, imágenes, adjuntos y selección oculta; aceptación de teclado, tacto y lector.
- [ ] Referencias: corpus extenso con HTML complejo, definiciones compartidas y ejemplos; comprobar navegación y exportaciones después del traslado.
- [ ] Interrumpir entre archivo, copia de recuperación y referencias; revisar copias, estado parcial y sesiones sin reejecutar el lote.

Las casillas verificadas corresponden a automatización DOM del WebView nativo y capturas ADB, no a aceptación táctil completa. [Evidencia y límites del avance 06](../product/revision-3.0-implementacion/avance-06.md).


### Panel contextual y capacidades · 3.0 en desarrollo
- Cambiar entre Asistente, Historial, Buscar y secciones, Información y Referencias; comprobar alternativas útiles en notas, imágenes y ámbito personal.
- Fijar Información, cerrar el proceso y abrirlo: mismo panel, proyecto, documento y borrador. Desfijar no cierra el panel; cambiar de proyecto cierra solo el temporal. Ocultar explícitamente sigue funcionando.
- Referencias: comprobar enlaces guardados frente a uno solo en borrador, destino ausente, entrantes, navegación y actualización con error conservando la consulta anterior. Corpus parcial debe anunciar cobertura parcial.
- Móvil: selector, fijar/cerrar y detalles de referencias de al menos 44 px; comprobar 390/412 px, teclado virtual y lector por separado.
- Android no anuncia Git local mientras no esté implementado. Escritorio con Git ausente o repositorio inválido explica el límite y permite trabajar con archivos.
Evidencia automatizada parcial: avance-07.md. Teclado virtual, tacto físico, TalkBack y DPI siguen pendientes.


### Recuperación y revisión de copias · 3.0 en desarrollo
- Preparar variantes y JSON dañado únicamente en una instalación QA detenida. Abrir Recuperación desde Acceso rápido; categorías Ausentes/Revisar/Apartadas y Cerrar permanecen visibles al desplazar resultados.
- Ver contenido no modifica archivos. El extracto de texto está limitado; las notas muestran páginas/trazos y se abren completas recuperando otro archivo.
- Recuperar como otro archivo conserva el disco original y las fuentes; nombre ocupado, huella obsoleta y fallo conservan campos y permiten corregir. No cambiar formato con la extensión.
- Apartar exige confirmar, conserva bytes y registro privado, y no anuncia retirada si falla la limpieza. Apartadas permite recuperar contenido válido a otro archivo y no caduca automáticamente.
- Reiniciar conserva archivos creados y copias apartadas. Comprobar huellas; un archivo apartado alterado no puede aplicarse.
- Contrastar inventario parcial, proyectos inaccesibles, solo lectura y límites sin presentar ausencia total cuando solo hay cobertura parcial.
Evidencia automatizada parcial: avance-08.md. Interrupciones entre procesos, copias programadas, retención gestionada, lector y tacto físico siguen pendientes.


### Configuración contextual y persistencia · 3.0 en desarrollo
- Abrir configuración: categorías sustituyen al árbol; formulario central y ayuda derecha muestran dispositivo y proyecto del índice sin navegación duplicada. Ambos laterales se ocultan independientemente de la vista documental.
- Documento largo con borrador: abrir configuración y volver por el control y por la paleta, con lateral abierto/cerrado. Mantener editor, texto, cursor, posición y foco; no dejar un árbol temporal tapando el documento.
- Alternar categorías y básico/avanzado: mismos valores, estado avanzado por apartado y campos privados retenidos mientras la configuración siga abierta. Cerrar retira la clave no guardada.
- Solo en QA aislado: registrar modo/huella de config.json y credentials.json, ponerlos temporalmente en solo lectura y provocar fallo. Conservar campos/errores; restaurar permisos en finally y comprobar bytes intactos antes de reintentar.
- Otro grupo guardado no borra un error pendiente. Reintentar por grupo persiste la última elección; reiniciar confirma solo los ajustes que habían sido guardados. Restaurar los valores temporales al terminar.
- Contrastar respuestas antiguas durante edición, refresco de IA y cambio de proyecto; caché secundaria bloqueada no impide escritura nativa.
- Móvil: ocho categorías sin desbordamiento; área táctil de interruptores 44 × 44 px sin estirar su pista visual de 44 × 24. Revisar todos los recorridos de foco, lector y teclado virtual por separado.
Evidencia automatizada parcial: avance-09.md. Configuración dañada, restablecimiento confirmado, cambios fallidos entre reinicios y aceptación completa de accesibilidad siguen pendientes.

### Estado local dañado y arranque · 3.0 en desarrollo
- Solo en QA detenido y aislado: conservar originales, modos y huellas de configuración, plantilla y registro; restaurarlos al terminar, incluidos fallos. No introducir claves reales.
- JSON roto o estructura incorrecta: el arranque muestra diagnóstico; no presenta una instalación vacía ni sobrescribe mediante PUT, restablecimiento normal o IA. Una lectura válida de formato legado no modifica el archivo.
- Revisar restablecimiento: confirmar alcance, cancelar sin efecto, conservar copia exacta y manifiesto antes de valores iniciales. Una huella anterior o un fallo de conservación impiden reemplazar. Reintentar solo después de actualizar.
- Versión futura o registro dañado: diagnóstico y originales conservados, sin botón para vaciar proyectos ni degradar la versión. Intentar crear proyecto no deja una carpeta nueva cuando el registro no puede leerse.
- Inicio: foco en título, fondo inerte, Tab/Mayús+Tab contenidos, detalle plegable accesible, Escape conserva la revisión; la confirmación anidada devuelve el foco. Ningún aviso flotante oculta el título.
- Reintentar tras reparación carga el espacio, libera el fondo y conserva documentos/borradores. Reiniciar confirma la recuperación; comprobar la copia y el original de forma independiente.
- Comprobar permisos denegados, archivo grande/enlazado, límites, falta de espacio, interrupción entre copia y reemplazo, lector y dispositivos físicos por separado. La cobertura de tres estados críticos no acredita todos los archivos JSON ni coordinación entre procesos.


### Ajustes por temas y vistas ocultas · corte 11
- Buscar micrófono, márgenes, credenciales/API key y permisos: mostrar categorías reales, alcance y alternativa sin resultados. Sin llamadas a proveedores ni búsqueda en campos privados. Escape limpia antes de cerrar un diálogo; comprobar flechas y Tab.
- Seleccionar un resultado enfoca su panel; activar una categoría móvil cierra el lateral temporal. Las flechas de navegación mantienen allí el foco. Los accesos de Resumen/Audio enfocan destino.
- Campo de clave pendiente, categoría y vista avanzada: alternar mediante búsqueda y navegación conserva valor/estado; cerrar configuración elimina el campo sin guardarlo. Volver al documento conserva editor y borrador.
- Resumen: grupos integrados sin tarjetas/tablas anidadas; mismos valores en básico/avanzado. Detalle de modelos solo en avanzado. Acento de controles nativos y etiquetas táctiles de 44 px.
- Consultas de Audio: sin actividad no hay polling; vuelta refresca, una lectura pendiente no se solapa y una respuesta vieja no sustituye una revisión nueva. Un snapshot correcto no oculta una orden fallida. Ocultar no debe pausar/parar la grabación nativa. Contrastar captura real aparte.
- Segundo plano Android/Windows, permisos, teclado virtual, lector y hardware se verifican por separado. El IPC Android de solo lectura no se modifica para obtener métricas; el recuento simulado del hook no prueba por sí solo llamadas nativas.
- Desarrollo: compilar Android/reescribir el informe HTML de Gradle no recarga la página Vite. No confundir errores de HMR durante edición con la consola de una recarga final estable.
Evidencia parcial: avance-11.md. Continúa el resto del programa y la aceptación nativa.

### Respuestas IA tardías y revisión · corte 12
- Sin proveedor real: usar respuesta controlada. Mientras espera el texto principal, otro documento debe poder guardarse; no hay dos interacciones de proveedor simultáneas. Guardados/mutaciones siguen ordenados.
- Enviar borrador con base, cambiar archivo/raíz/permisos durante espera o cola: no aplicar salida mutante ni reintentar proveedor; conservar consumo realmente realizado. Creaciones múltiples con fallo posterior muestran la copia creada y el error.
- Base RAM intacta: aplicar como borrador en Milkdown, actualizar estado y permitir deshacer/rehacer. Edición nueva, incluidas notas personales/trazos, documento no abierto y cambio de proyecto: conservar contenido actual y resultado para revisión; no activar la pestaña anterior.
- Propuesta con varias operaciones: contrastar cada documento al recibir y después de preparación asíncrona. Si el editor cambia antes de consumir la operación pendiente, no sustituirlo ni aplicar posiciones anteriores como alternativa. Mantener resultado para copia separada.
- Revisión: vista visual de solo lectura, foco contenido y devuelto al cerrar, fondo inerte, acceso con icono y contador a 44 px en móvil. Selector/controles visibles con contenido largo, sin desbordamiento horizontal. Captura nativa y web se identifican por separado.
- Conservar y reiniciar sin red: resultado presente. Guardar copia Markdown/manuscrita crea otro archivo con identidad propia; repetir no duplica, editar la copia impide sobrescribirla. Raíz distinta o proyecto no disponible bloquea copia conservando resultado.
- Fallo de conservación: salida disponible en esta sesión y aviso explícito; reintentar no consume IA. Quitar exige decisión explícita y no elimina documentos ya copiados. Registro dañado/futuro, enlaces y presupuesto agotado se conservan y se diagnostican.
- Generación adicional de imágenes/cálculo local de trazos, conversiones/exportaciones, autoridad completa de operaciones, interrupciones y aceptación física siguen con evidencia propia. No se cierra T04/P04 con este recorrido.


### Revisión contextual y autoridad · corte 13
- Revisión básica activada: esperar Aplicar/Descartar, sin caducidad ni doble aplicación; cambiar a desactivada no aplica propuestas anteriores. Respuesta que requiere revisión sigue manual. Aplicación directa solo en una respuesta nueva autorizada.
- Base plegada y nombres legibles; entrada desplegable conserva texto. Controles disponibles durante trabajo/captura. Contar cambio aplicado únicamente tras ACK de Milkdown; cancelación/timeout no reutiliza identidades antiguas.
- Petición en cola con borrador durable posterior: rechazo previo al proveedor. Cambio durante espera: no aplicar. ACK del mismo texto/trazos: admitirlo aunque cambie timestamp de conservación.
- Rechazo por política/base: contenido útil conservado, presente tras reinicio, copia separada y archivo actual intacto. Fallo de almacén: RAM y reintento visible sin consumo externo. Acuse falso, tipos erróneos o efectos de archivos sin ejecutor no cambian árbol ni cierran sesiones.
- APK QA 27 contrasta ajustes y reloj del borrador con petición vacía local; la conservación ampliada y los efectos posteriores necesitan APK nuevo. No atribuir la prueba de dominio o web-dev a aceptación de proveedor nativo.


### Imágenes y trazos fuera del bloqueo · corte 14
- Generación lenta de imagen y cálculo lento local: guardar otro documento. Mantener una sola cola IA; permisos/base/raíz cambian sin permitir aplicar una salida antigua ni consumir otra llamada.
- Límite de imágenes por petición y una imagen por llamada singular. Carpeta personalizada reservada/ocupada: rechazar sin crearla ni consumir proveedor. Destino ocupado durante espera: preservar archivo, uso y raster recibido.
- Fallo posterior a un asset creado: informar el cambio parcial; no atribuir inserción en el documento a la mera creación. Propuesta de referencia sobre un documento vacío respeta ese vacío.
- Dibujo en nota activa: cálculo sin acceso de proveedor; unos trazos durables posteriores no se sustituyen. Resultado útil conservado como nota separada. Fallo capturado conserva las fases anteriores, sin reintento.
- Raster conservado: vista previa local completa a escala, formatos/bytes acotados, copia exacta e idempotente, protección de una copia editada, reinicio sin red y retirada del resultado sin eliminar el PNG. No equiparar fixture de salida con generación real.
- APK 28 contrasta almacén/UI/copia raster; la miniatura CSS posterior se contrastó en web. Investigación, proveedores reales y hardware continúan pendientes.


### Exportación completa y destino nativo · corte 15
- PDF de varias páginas: verificar inicio y final, acentos, estilos combinados, sangría de código, palabras largas, imagen, Mermaid y todas las columnas de tablas anchas. Extraer texto con lector independiente y renderizar páginas iniciales/final. No basta comprobar la cabecera PDF.
- Recurso perdido, glifo no soportado, imagen mezclada con texto aún no representable, archivo o píxeles fuera de presupuesto: error explícito sin éxito abreviado ni sustitución del original. DOCX no puede confirmar bytes vacíos tras un error.
- Mientras convierte, guardar otro documento y seguir editando el origen; la salida corresponde a la instantánea al pulsar. Cambiar raíz/destino durante conversión: conservar la modificación posterior y rechazar publicación. Rechazar el propio documento como destino.
- Android: exportar mediante el control de la aplicación, cancelar el selector y confirmar que no aparece Archivo exportado; repetir, elegir destino real y comprobar bytes/texto final. Abrir usa la URI concedida por el selector, nunca una ruta Rust construida con content://. Controles de 44 px, nombre largo sin desbordamiento y aviso visible.
- Error de proveedor/escritura: original intacto, aviso que permite revisar el destino potencialmente parcial; no se presenta cancelación ni éxito. Reinicio, rotación y otros proveedores de documentos requieren su propia aceptación.


### Plantillas reutilizables y captura del editor · corte 16
- Desde un documento con campos `{{titulo}}`, `{{fecha}}`, `{{proyecto}}` y campos propios, Guardar como plantilla permite revisar el contenido RAM y guardar nombre/descripción. Una escritura reciente de Milkdown también se captura; el documento publicado sin cambios conserva su Markdown exacto.
- Crear dos actas con distintos nombres/asistentes/acuerdos: estructura y valores corresponden a cada vista previa. Título/fecha/proyecto se pueden personalizar bajo demanda. Ver destino lógico, nombre completo, acciones 44 px, foco contenido y un único scroll de cuerpo con footer visible en 412 px/IME.
- Fecha del dispositivo distinta de la UTC y fecha inválida: usar el día local revisado o rechazar el contexto inválido. Crear reutiliza los valores resueltos. Datos desconocidos, clave faltante, revisión de plantilla cambiada o raíz repuntada: no crear una salida antigua ni sobrescribir el destino.
- Documento ocupado: error visible y datos conservados; cambiar nombre y repetir sin duplicados. Llega un acuse tras cambiar de proyecto: archivo queda en su proyecto y no sustituye árbol/pestaña actuales.
- Cancelar retirada mantiene plantilla. Retirarla conserva copia local y no borra actas derivadas. Reiniciar sin red: catálogo y documentos presentes; tras retirar, catálogo activo no incluye la plantilla y el archivo de conservación mantiene sus bytes.
- Catálogo dañado/futuro/enlazado o fuera de presupuesto: originales intactos, aviso y cuatro plantillas iniciales utilizables. Nombres personales duplicados no sustituyen contenido. Recursos locales e imágenes no embebidas se rechazan con explicación; no hay descarga automática para salvarlos.
- Archivo privado y catálogo excluidos de backup Android; importación/exportación explícitas y restauración de ese archivo tienen trabajo propio. Web-dev no prueba persistencia nativa; APK 29 solo acredita corte 15, pendiente APK del corte 16.


### Corte 16 · contraste realizado y aceptación restante
APK32 aislado API36/WebView133: guardar plantilla, tres actas, reinicio, cancelar/confirmar retirada y conservar actas; teclado abierto/cerrado conserva foco/valores y Crear visible 44 px. Estado/red restaurados. Ver avance-16. Pendiente Windows físico, TalkBack, rotación y otros teclados/WebView; APK29 solo acredita C15.


### Corte 17 · transferencia revisada de plantillas
Formato portable `knownext.document-template`, versión 1: solo nombre, descripción y Markdown. Inspección estricta y SHA de los bytes antes de importar con nombre explícito y nueva identidad local; sin sobrescritura de catálogo. Lectura real limitada a 2 MiB, UTF-8 estricto, versiones futuras/campos extra rechazados y original conservado. Windows selecciona y lee en Rust; Android usa ACTION_OPEN_DOCUMENT/ContentResolver. Exportación fija revisión, temporal privado hasta ACK nativo y acciones compactas de 44 px. La UI muestra revisión visual y archivo completo antes de confirmar. Windows crea solo un archivo nuevo; un fallo de entrega Android exige revisar un posible parcial del proveedor. No detecta secretos escritos dentro del texto: hay que revisar el contenido antes de compartir. Cero credenciales/configuración adjuntadas por la aplicación. Validación nativa y límites en avance-17 cuando se complete la campaña.


C17 contrastado: APK34/35 aislados, cancelar/repetir selectores, guardar JSON con nombre elegido, importar mismos bytes, renombrar colisión, crear acta y reiniciar. APK35 retira aviso al editar nombre. Red/estado restaurados; límites y evidencias en avance-17. Pendientes Windows físico, otros proveedores y accesibilidad asistida.


### Corte 18 · conservación y comprobación
C18: propuesta manual útil → acuse de conservación antes de entregar; cerrar/reabrir → resultado recuperable como copia nueva, sin reaplicar offsets. Fallo de disco/cuota → advertencia solo sesión y datos RAM; reintentar sin proveedor. Acuse confirmado no retrocede por fallo tardío. Resultados conservados puede incluir cambios aplicados; quitar resultado no borra la copia documental. Cuotas/archivo dañado/futuro/no regular no limpian originales. Distinguir ejecutor controlado Rust, harness visual, APK y aceptación humana; evidencia final en avance-18 cuando termine la campaña.


### Corte 19 · proyecto portable y recuperación
- Exportar desde el selector: elegir explícitamente Preparar lo guardado. Cambios RAM/borradores no se presentan como incluidos. El original sigue editable durante preparación; revisar archivos, carpetas, exclusiones, enlaces adaptados y referencias ausentes. Ver las páginas finales de cada inventario sin renderizar miles de filas simultáneamente.
- Cancelar selector de origen/destino: no anunciar importación/guardado; conservar fuente y recibo pertinente. Error de lectura/cuota/copia: no ocultar fallo ni sustituir archivos. Solicitar cancelación durante preparación: distinguir solicitada de terminada; originales intactos.
- Exportar paquete en Rust Windows e importar offline en Android por ContentResolver. Markdown, imagen, .knote y carpeta vacía mantienen bytes/SHA declarados. El enlace ajustado por caso abre la imagen en Android; la nota se vincula al ID nativo de destino en RAM sin cambiar bytes al leer.
- Confirmar exige huella revisada y nombre; colisión permite renombrar sin perder revisión/formulario. Se crea proyecto nuevo, sin Git/remoto automático, y el proyecto/documento con cambios actual permanece abierto. Abrir desde el selector conserva el borrador anterior.
- Reiniciar con revisión pendiente o proyecto pendiente de registro: no reejecutar automáticamente. Continuar registro conserva la carpeta existente y ediciones posteriores. Repetir un acuse completado no duplica ni recrea un proyecto retirado. Descartar nunca elimina el proyecto copiado pendiente de registro.
- Probar ZIP traversal, drive/ADS, enlaces, duplicados de caso/NFC, extra no declarado, futuro, JSON inválido, tamaño/SHA/CRC falsos, exceso de expansión/directorio central y comentarios/trailing ambiguos. No se extrae contenido fuera de la reserva privada.
- Pantallas 1360, 412 y 360 px, altura 520 px y teclado Android: nombre accesible, un scroll, footer visible y controles >=44 px; Esc/foco vuelve al origen. No cerrar ni duplicar una operación en vuelo. Mantener el formulario de Crear proyecto al cerrar su subdiálogo de importación.
- No confundir pruebas de dominio, recibos sintéticos web, APK aislado y aceptación física. Las capturas de una revisión no prueban por sí mismas la transferencia del archivo. Consultar avance-19 cuando se cierre la campaña local; quedan aceptación Windows física, otros proveedores/teclados, TalkBack y ampliaciones del paquete.


### Corte 20 · continuidad observada en C19
- Preparar importación, escribir otro nombre, cerrar y reabrir: mismo trabajo/huella y nombre conservado, sin elegir ni importar otra vez. Repetir con campo vacío y reinicio: sigue vacío, Importar deshabilitado, Volver disponible. Nombre final se valida al confirmar.
- Denegar escritura solo a la preparación QA: intentar cerrar conserva diálogo/texto y explica error. Restaurar permiso y repetir conserva el mismo campo con ACK. No probar esta denegación en carpetas de documentos ni en la instalación habitual.
- Cancelar destino muestra mensaje explícito y no guardado. El selector propone un nombre derivado del proyecto, con extensión correcta y saneado portable; verificar reservados/largos mediante contratos. No se reemplaza un archivo Windows existente.
- En Referencias: carpeta vacía y carpeta llamada Carpeta.md son carpetas disponibles; alias/enlace y rutas externas quedan bloqueadas. Mostrar carpeta abre navegación y enfoca el destino, conservando documento activo y cambios RAM. Cerrar navegación vuelve al mismo editor.
- Separar prueba de panel de cualquier aceptación de enlaces directos dentro de Milkdown, y prueba en emulador de teclado/tacto asistido real. Evidencia en avance-20 al completar su campaña; siguen las demás áreas del programa.


### Corte 21 · imágenes sin pérdida de descripción
- Abrir sin editar un Markdown con imagen y comprobar que no se escribe el archivo ni aparece un cambio artificial. Editar el último párrafo: ALT, pie/título, URL y tamaño de la imagen permanecen. La primera escritura se clasifica como usuario. Guardar y reabrir/reiniciar; contrastar bytes/semántica y borrador.
- Dos apariciones de una URL con ALT, pie y tamaños distintos: redimensionar/restablecer una, cambiar solo su descripción desde el formulario, copiar/pegar y deshacer. La otra permanece intacta. Incluir corchetes, asteriscos, ampersands, entidades literales y espacios/paréntesis en destinos.
- Anotaciones v1 válidas, futuras, dañadas, duplicadas y excesivas: conservar su fuente, no interpretar versiones desconocidas y bloquear tamaño cuando no sea seguro; el editor conserva documento e imagen. No confundir comentarios junto a la imagen con texto de un ejemplo de código.
- Exportar DOCX/PDF nativos: cada imagen y pie aparecen, no se imprime metadato de tamaño, no se deforma la imagen, los IDs DOCX son únicos y la descripción se conserva. Ejemplos de imagen dentro de código/comentarios no se buscan como assets reales. Transferir el Markdown conserva anotaciones y fuente.
- Separar la prueba del esquema real, la combinación formulario/editor en navegador y el APK offline con Rust; registrar huellas y restauración. Sin proveedor. TalkBack, lectura física DOCX, otros DPI y matriz Android siguen requiriendo su aceptación propia.

### Corte 22 · retirar y reincorporar proyectos
- Retirar un proyecto con cambios pendientes: confirmar que se conservan snapshot vivo, borrador nativo y checkpoint completo de pestañas/árbol antes de quitar la asociación. No se borran archivos ni historial. Un error o un guardado supersedido bloquea la retirada.
- Reabrir Proyectos retirados desde el selector, también sin proyectos registrados. Ver nombre, fecha y ubicación; reincorporar con la misma identidad. No activar el proyecto ni iniciar sincronización/Git/proveedor. Abrir después recupera su pestaña y borrador, sin escribirlo como fuente.
- Colisión de nombre permite editarlo sin perder revisión ni diálogo. Carpeta ausente, alias ocupado, revisión obsoleta y catálogo futuro/dañado no crean carpetas ni reemplazan datos. No se recuperan automáticamente proyectos antiguos sin ficha.
- Inyectar fallo entre ficha y registro, y acuse perdido después de confirmar: el reintento no duplica, no sobrescribe cambios posteriores ni elimina la ficha. Un fallo al refrescar el selector ofrece actualizar sin repetir la reincorporación.
- Probar una altura de 520 px: un scroll, pie accesible, controles de 44 px, error y nombre legibles, Escape bloqueado durante escritura y foco restaurado al cerrar. Contrastar contrato, componentes reales, APK aislado y reinicio por separado; registrar restauración de los datos QA y no atribuir aceptación física a CDP.

### Corte 23 · mapa de uso y ubicaciones
- Abrir Sistema sin iniciar consulta; buscar «uso almacenamiento»/«storage locations» lleva a ese apartado. Solo Ver uso local inicia medición. No hay polling oculto ni doble envío mientras está en curso.
- Comparar tamaños de archivos sintéticos y grupos, incluyendo borrador, papelera bajo proyecto, audio, preparación y fichero desconocido. No se muestra contenido de credenciales/documentos ni se cambia ningún archivo al consultar. El tamaño es lógico, no capacidad libre ni uso físico exacto.
- Límite de entradas/tiempo, enlace/junction y elemento inaccesible indican medición parcial y cotas inferiores. Cero archivos medidos no significa almacén vacío. Un alias externo no se sigue; su destino permanece intacto. Separar prueba de junction Windows, symlink Unix y recorrido APK.
- Registro/catálogo futuro o dañado conserva bytes y muestra ubicaciones incompletas; no anuncia una lista vacía fiable. Una carpeta externa o ausente se enumera sin recorrer ni crearla; un proyecto retirado sigue apareciendo como tal. Mostrar más no renderiza todas las ubicaciones al inicio.
- Error de actualización conserva la medición previa, permite repetir y no ofrece limpieza por deducción de tamaño/categoría. Comprobar español/inglés, 360 px, controles de 44 px, lectura por teclado y foco de ajustes. Guardar huellas, entorno y restauración de QA antes de continuar la limpieza regenerable y otras F17.

### Corte 24 · integridad y acuses del índice IA
- Probar IDs manipulados/ajenos exclusivamente con centinelas dentro de TempDir; nunca invocar esas rutas contra datos habituales o QA anterior. Índices de otra identidad, futuros, dañados, con extensiones desconocidas, fuera de 64 MiB, enlazados o no regulares no se leen como contexto, sustituyen o limpian silenciosamente.
- Reconstruir un índice conocido, obtener revisión nativa y limpiar esa revisión. Una regeneración intermedia hace obsoleta la revisión anterior y permanece intacta. Documento fuente y estado RAG en pausa se conservan; limpiar A no restablece preferencias que pertenecen a B.
- Solo en cache/config sintéticos: denegar escritura al índice impide retirarlo; restaurar permiso y repetir permite completar. Denegar config después de retirar/reconstruir informa el efecto parcial y conserva el efecto confirmado. Actualizar estado es una lectura, no otro borrado ni una regeneración automática.
- Error de cache no oculta la configuración IA. Revisiones/tamaños desconocidos no se presentan como un índice vacío válido. Metadatos nulos confirmados no recuperan referencias o fechas antiguas. Error visible en vista básica, acciones de 44 px y ningún doble envío en vuelo.
- Cambiar de proyecto y volver antes del acuse: la respuesta antigua no sustituye el estado actual. Cerrar ajustes no duplica la operación. Separar fixtures visuales, contratos TempDir, APK offline, efectos parciales y aceptación física. Restaurar permisos, cuatro hashes y red QA; no declarar limpieza regenerable integral ni coordinación multiinstancia por este corte.

### Corte 25 · ámbito y vistas previas
- Probar identidades manipuladas, no registradas y pertenencia cruzada solo en TempDir aislado. Conversación, contexto, investigación, imágenes, assets y previews no deben devolver ni reemplazar archivos vecinos o de otro proyecto. Registro futuro/dañado y raíz relativa producen rechazo estructurado sin recreación ni trabajo IA.
- Recibos de vista: legado/v1 válido se lee sin reescritura; futuro, campos desconocidos/duplicados, hoja no portable, ruta fuera de raíz, archivo/carpeta enlazados y más de 8 MiB se conservan y rechazan. El PDF/texto/hojas/apertura externa usa la misma pertenencia.
- Fallo al preparar inicialmente: Reintentar crea una nueva vista sin exigir un recibo inexistente. Fallo de carga PDF es visible; error de apertura externa conserva la consulta actual. Recarga doble no duplica; respuesta antigua tras A→B→A no sustituye el visor actual. El acuse histórico de ajustes no oculta un resultado de índice por revisar.
- APK aislado: PDF sintético, lectura offline y reinicio; permisos denegados solo en carpeta privada sintética, restaurados antes de reintentar. Conservar SHA de la fuente y de los cuatro almacenes base, retirar todos los fixtures/backups/forwards propios y restituir la red. La adaptación táctil de la barra del visor, frescura y fidelidad completas requieren su contraste específico posterior.

### Corte 26 · visor al ancho real
- Componente PDF con carga diferida: contenedor medido desde el inicio. Probar 320/412 px, escritorio y centro de 380 con ventana amplia. Barra sin recortes, búsqueda/actualizar/abrir accesibles, acciones táctiles 44 px, Vista progresiva con Escape/selección y retorno de foco; hojas con selector nativo y nombre completo accesible.
- PDF de tres páginas aunque el recibo provisional indique una: cuenta/navegación correctas y primera página inicial. Coincidencias del texto renderizado; mostrar desconocido mientras no se pueda completar el recuento. Ancho/Página responde al ancho y alto reales; zoom manual solo desborda dentro de la consulta. Raster limitado por píxeles/borde, sin modificar el original.
- Desplazar de forma natural actualiza la página y no provoca snap; navegar, redimensionar y alternar paneles conserva la página actual. Mantener consulta y hoja ante fallo externo. Rechazo nativo string debe ofrecer detalle útil y acotado. Permiso 000 solo en PDF sintético: error de lectura, ningún PDF de ejemplo como éxito; restituir permiso y reintentar recupera los mismos bytes.
- Preferencia contexto fijado heredada: en móvil no tapa el centro al cargar/cambiar documento. Abrir expresamente contexto e historial sigue funcionando; volver a documento y controles de cierre/foco son utilizables. En escritorio sigue restaurando el lateral fijado y se respeta ocultación explícita tras cambios de ancho. Edición Milkdown y borradores intactos.
- APK aislado offline, varias páginas, controles y teclado/orientación cuando sea viable. Separar evidencia de navegador, CDP, UIA y aceptación física. Restaurar permisos, fuentes/cuatro hashes/red y retirar solo auxiliares/forwards propios antes de iniciar otro corte.

### Importación protegida · corte27
- En datos sintéticos: mismo nombre/case/Unicode normalizado conserva original; modo rechazar no escribe y conservar ambos informa ruta/nombre/SHA. Hoja reservada/ruta, codificación, imagen inválida o más32MiB no crea contenido. Archivo original fuera de la app siempre intacto.
- Árbol ilegible después de persistir comunica importación confirmada y treeAvailable=false; mantiene biblioteca anterior y pide actualizar sin repetir subida. Cambio de proyecto durante selector/acuse no cambia documento activo del nuevo proyecto.
- Imagen: fallo de subida conserva File/ALT; fallo de referencia posterior no vuelve a importar al reintentar. Cierre y A→B→A descartan inserciones tardías. Copia renombrada revisable; preview móvil desplegable y controles44px. Avisos dentro del modal que los posee, sin bloqueo por avisos globales.
- Validación durante desarrollo focal; nativa agrupada con siguiente hito, incluyendo anclaje/recuento desconocido C26. Suite completa final según instrucción del usuario.

### Historial elegible y continuidad · corte28
- Proyecto Git sintético con dos documentos que compartan commit: nombrar/quitar hito solo afecta al solicitado; sigue el renombrado y no guarda cambios RAM ni altera HEAD. Revisión ausente/obsoleta, almacén futuro/dañado/ilegible y fallo de escritura conservan datos; versiones siguen consultables si falla solo anotación.
- Elegir dos versiones, dirección A/B e intercambiar lados; contenido de ambos en Milkdown de solo lectura. Comparar con documento abierto incluye el borrador solo cuando esa es la referencia elegida. Restaurar señala A y mantiene confirmación/protecciones existentes.
- Error de nombre conserva texto; acuse desconocido se concilia por lectura sin repetir la escritura; respuesta de documento anterior no cambia el nuevo. Documento grande fuera del presupuesto permite consultar contenido, sin declarar igualdad ni inventar cifras.
- Consultar historial y volver conserva misma instancia Milkdown, borrador, deshacer, selección/posición y foco. 320/412 px: vista unificada automática, controles44px y sin overflow del viewport; dos columnas forzadas desplazan solo su área. Nativa agrupada con C26 posterior y C27; no suites generales durante desarrollo.

### Favoritos · corte29
- Añadir desde el archivo seleccionado en paleta; reiniciar y consultar Favoritos. Archivos homónimos muestran rutas. Renombrar y mover simple/lote conserva ID y destino; operación parcial no remapea pasos no ejecutados.
- Destino ausente conserva marcador, impide abrirlo y permite retirar solo el favorito. Error/revisión obsoleta no pisa almacén; acuse desconocido se concilia por lectura sin repetición. Futuro/dañado/enlace conserva bytes y no oculta traslado ya confirmado.
- Teclado/Intro no abre un destino ausente; acción de favorito está fuera del listbox y devuelve foco al campo.320/412px con controles44px, lista desplazable y acciones visibles. Native agrupada pendiente.

### Diagnóstico seguro · corte30
- Desactivado en preferencias: intentar registrar no crea archivo/carpeta; activado conserva solo ID/fecha/nivel/categoría/código, incluso si el llamador anterior envía message/detail con canarios privados. No deben aparecer contenido, prompts, tokens, rutas ni source libre en archivo/informe/bridge.
- Anillo de1000eventos/512KiB: entrada nueva conserva las más recientes sin crecimiento ilimitado. Formato futuro/dañado/enlace y permiso denegado conservan bytes. Logs heredados intactos y excluidos, sin lectura ni exportación implícita.
- Preparar informe es explícito; revisión/copia no envían a terceros. Copia fallida conserva textarea seleccionable; actualización fallida conserva informe previo. El diagnóstico básico tampoco incluye rutas/endpoints/lastError. Un ID de incidencia aparece solo tras acuse confirmado y no altera un aviso posterior.
-320/412px sin overflow, controles44px; nueva nativa se contrasta junto a visor/importación/historial/favoritos, sin suites completas por bloque.

### Capacidad de historial · corte31
- Dispositivo sin Git: mostrar motivo y conservación de archivos/borradores, sin activar una capacidad inexistente ni ofrecer hito sin versiones. No confundirlo con un documento nuevo sin commits.
- Windows con Git/configuración desactivada/repositorio existente: conservar lectura de commits previos y explicar que guardados normales no crean versiones. Sin repositorio, distinguir desactivado/sin preparar y ofrecer revisar ajustes solo si puede configurarse. Error de lectura no se toma por vacío.
- Es un cambio posterior a APK58, verificado de forma focal; no se recompila por él.


C32: buscar transcripción guardada de página2 y abrir exactamente esa página. Nota sin texto no produce palabras inventadas; formato futuro se conserva. Editar Texto de página, cambiar base mientras está abierto, revisar nueva base y aplicar conservando campo/trazos; deshacer y guardar/reabrir. Comprobar412px/teclado/controles44px. Reconocimiento automático y comprobación nativa de C32 pendientes del siguiente hito agrupado.


C33: Sistema > Almacenamiento > Revisar metadatos de vistas. Seleccionar recibos y comprobar alcance/tamaño lógico; alterar uno después de revisar y comprobar eliminación parcial sin tocar el cambiado. Simular acuse desconocido: selección conservada y nueva revisión obligatoria. Reabrir fuente tras eliminar recibo regenera la vista; documentos/borradores/audio/papelera/índices intactos. No equivale a limpiar cachés de contenido o espacio físico. Comprobación nativa se agrupa en próximo hito.


C34: editar carpeta de proyecto, revisar rutas y cancelar: valores pendientes y foco conservados. Cambiar registro/destino tras revisión impide commit. Revincular carpeta propia con otro contenido: borrador anterior recuperable, conflicto tratado al abrir/guardar; fuentes anteriores intactas. Historial automático y sync en pausa, GitHub conservado y ninguna sincronización disparada. Sesión de audio pendiente/en curso del proyecto impide cambio; otra de distinto proyecto no lo bloquea. API normalizada igual para método/ruta codificados. Android: no ofrecer ruta externa no disponible; mantener transferencia. Aceptación Windows instalada pendiente, sin operar la aplicación habitual bloqueada.


C36: cierre de Markdown/manuscrito con cambios, guardado/descartado en vuelo y fallo. No avanzar cola de cierre ni cerrar pestaña al fallar o llegar una edición nueva. Escape durante espera no cancela; después del fallo cancela sin descartar. Foco en frontera/Cancelar, controles44px y sin overflow320px. Protección de versiones, conexión GitHub opcional y actualización con progreso comparten frontera accesible. No confundir muestra de actualización con publicación/instalación real.

### Capacidad y protección · cortes37–38
- Android sin Git: tarjetas Git/GitHub deshabilitadas y motivo visible; renombrar proyecto heredado conserva sus modos, sin activar ni iniciar repositorio. API de activación falla antes de mutar registro.
- PDF con URL pendiente: Preparando vista y contador desconocido; rechazo real muestra error recuperable. Revisar singular y palabras/rutas en320/412px.
- Navegación/IME: barra de gesto no cubre acciones inferiores; contenedor ya redimensionado no recibe doble margen; teclado conserva controles. Reparación de código pendiente de APK posterior a59.
- Carga de disco Markdown/nota: fuente ausente/ilegible/futura conserva borrador y diálogo; éxito devuelve contenido/base actuales sin reescribir fuente. Editar mientras llega el acuse conserva y reprotege la revisión nueva. Comprobar también borrador vacío ya reconocido como persistido y reinicio tras acuse incierto.
- Protección: un envío, Escape bloqueado pendiente, foco a Cancelar tras error; decisión de documento anterior no afecta otra pestaña. Estado remoto paused/conflict/error no elimina borrador ni cierra como éxito; no reintentos automáticos. Aceptación nativa de C37/C38 todavía pendiente.

### Índice y guardado concurrentes · corte39
- Reconstruir corpus propio y guardar otro documento mientras se calcula: el guardado no espera a todo el cálculo. Dos reconstrucciones se serializan en su cola; exportación/IA conservan sus colas.
- Limpiar/reconstruir o modificar asociación durante cálculo invalida resultado antiguo sin resucitar el índice. Cambiar RAG no se revierte al publicar.
- Archivo>8MiB, corpus>64MiB, texto>16MiB,20.000fragmentos,10.000entradas o presupuesto cooperativo alcanzado: error recuperable e índice/preferencias previos conservados. ZIP Office de expansión grande respeta bytes XML reales.
- No atribuir una instantánea completa/atómica ni cancelación inmediata a estos límites; aceptación de rendimiento/nativa pendiente. No repetir campañas no invalidadas.

### Formularios de proyecto · corte41
- Crear/editar320/412px: una zona de scroll en un div normal; fieldset conserva disabled sin gobernar recorte. El conmutador fuera de vista no se pinta sobre el pie ni recibe interacción a través de él.
- Pie compacto a412px y por filas a320px, todas las acciones44px y sin overflow. Con ventana baja/teclado, consultar final del formulario y conservar pie. Envío bloquea nombre/campos y un fallo conserva configuración. Contraste nativo de este marcado posterior a APK60 pendiente.

### Información de datos IA · corte42
- Ajustes/IA: Datos y conservación permanece plegado; abrir consulta contrato local, sin proveedor ni lectura de contenido privado. Mostrar prompts/eventos/límite rodante real y categorías independientes; aclarar falta de caducidad por fecha y alcance del borrado local.
- Versión incompatible o fallo: error, reintento explícito, sin números/reglas inventados; castellano/inglés y320/412px con summary44px. No atribuir gestión integral ni eliminación externa a este panel informativo. Contraste empaquetado posterior a60 pendiente.

### Integridad y migración · C43–C44
- Conversación/contexto ausente, legado, corrupto, futuro, enlazado/otro propietario o fuera de límites: conservar bytes y no ejecutar IA sobre estado ilegible. Contexto no comunica guardado al fallar. Historial que falla después de respuesta conserva resultado/aviso diferenciado, sin nueva generación.
- Revisar cohorte crítica no escribe. Revisión obsoleta/futuro/secretos antiguos bloquea; aplicación conserva backups exactos y diario. Interrumpir tras un paso, reiniciar y observar estados reales. Restauración solo con revisión vigente y sin ediciones posteriores, dejando copias.
- ACK incierto obliga a revisar/listar; ninguna repetición automática de aplicación/recuperación.320/412px,44px, copia/alcance claros; instalada y migración integral todavía pendientes.


### C45 · combinación de conflictos (pendiente de hito instalado)
- Con borrador local y edición externa, revisar bloques y elegir local/disco/ambos. Hasta completar todas las elecciones, aplicar permanece bloqueado. Consultar vista Markdown y opciones de versión completa.
- Aplicar prepara solo el borrador, conserva tres copias consultables en Apartadas y deja el SHA fuente intacto. Guardar explícitamente publica sobre la base revisada.
- Cambiar fuente, borrador o ubicación después de revisar: rechazo y nueva revisión; no perder edición/elecciones tras fallo. Permiso denegado/futuro conserva bytes. ACK incierto no repite operación.
- Móvil320/412, teclado, foco y acciones44px. Durante mutación no cerrar; durante lectura sí. Nuevo texto posterior se mantiene y la propuesta queda archivada.


### C46 · consumo e investigación (pendiente de hito instalado)
- Consumo dañado/futuro/no regular: consultar devuelve error y panel indica resumen no disponible, nunca sin uso. Nueva IA queda bloqueada antes de proveedor; fuente y registro intactos.
- Política de investigación con permiso denegado: guardar falla y conserva valores originales. Trabajo dañado/futuro/otro proyecto no se convierte en lista vacía ni se sustituye al iniciar.
- Reiniciar con trabajo activo: se muestra interrumpido, conserva resultado parcial y no reanuda llamadas. Trabajos ready_pass/ready_warning conservan su estado. Cancelación persistida prevalece sobre finalización tardía.
- Fallo tardío de consumo conserva respuesta con aviso; no volver a enviar automáticamente. Aceptar/revisar/cancelar con fallo de persistencia no anuncia éxito.


### C47–C49 · integridad instalada pendiente
- Sobres de credenciales futuros/desconocidos: estado no disponible y mutaciones rechazadas, bytes intactos y sin contenido en mensajes. Formato legado conocido se protege mediante su almacén nativo; reabrir no lo reescribe. DPAPI tiene contrato dirigido; comprobar Keystore en el hito Android.
- Dos procesos de prueba sobre el mismo estado: el segundo no inicia servicios. Tras crash, el SO libera el bloqueo sin borrar runtime-owner.lock. El arranque Android de worker comparte propietario con setup. No ejecutar esta prueba sobre el perfil habitual.
- Notas/actividad dañadas o futuras no aparecen vacías ni se sustituyen; propietario ajeno rechazado. Sesión/desafío GitHub futuro no se borra al consultar, iniciar/poll o cerrar sesión. Ningún secreto se devuelve al frontend.


### C50 · originales de grabación (hito61 sintético contrastado; aceptación física pendiente)
- Reabrir sesión interrumpida: atención sin captura, PCM impar y manifiesto byte exactos. Primer cambio explícito conserva copia verificable. Sesión completada intacta y futuras/huérfanas visibles como no disponibles.
- Preferencias futuras/dañadas: app abre y no anuncia guardado; iniciar/probar/cambiar bloqueados. Revisar recuperación explica valores básicos, conserva original y no inicia micrófono. Permisos/revisión cambiada rechazan sin sustituir.
- Acuse perdido: no reenviar; observar disponibilidad y cerrar. Compacto420×260 mantiene tiempo/niveles/pie, avisos en Detalles; sesiones se despliegan con controles presentes. Cambios externos en manifiesto bloquean escritura/eliminar audio.
- Inicio Windows solo después de persistir preferencias; fallo de autoinicio debe distinguirse del guardado. Contraste físico de bandeja/micrófono/DPI permanece pendiente.

### H61/C51–52 · comprobación y siguientes contrastes
- H61 Android con fixtures sintéticos contrastó migración/recuperación exacta, combinación Markdown, originales de grabación y rechazo de formatos futuros de conversación/contexto/investigación/notas/credenciales. No repetir esa campaña completa por cambios de marcado. Keystore legado real, Windows habitual y hardware continúan pendientes.
- Guardado ordinario que normaliza preferencias legadas: antes conserva original exacto y diario consultable; fallo al conservar bloquea reemplazo. Recuperación exige revisión y rechaza ediciones posteriores. No se archivan credenciales legadas en claro por esta ruta.
- Caché de cambio futura/dañada/no regular: error y bytes intactos, sin consulta BCE. Aviso de conversión desconocida en Uso IA; no inferir coste cero. Cambio externo durante consulta no debe sustituirse.
- Confirmación de recuperación visible/enfocada. Carga o lectura fallida de Markdown/nota no muestran Guardado; las consultas de disco de una base anterior no reintroducen conflictos tras combinar. Divergencia remota real sigue visible. C51–52 pendientes del próximo hito instalado agrupado.

### C53–C55 · conflictos y protección de notas/historial
- Nota conocida con conflicto: comparar por páginas, ampliar, elegir orden/datos generales y páginas local/disco/ambas; OCR sigue a su página y duplicación no pierde puntos/inclinación. Tres copias en Apartadas; fuente intacta al preparar y Guardar explícito.
- Historia Markdown: Elegir partes de A compara con versión elegida, no con disco. Procedencia/hash verificados, contenido histórico conservado con propuesta; preparar no sustituye fuente y guardar genera versión posterior sin alterar anteriores.
- Fuente de nota futura/dañada/no regular no se normaliza, ni con force. Borrador conocido sigue disponible; Fuente por revisar ofrece revisión o copia separada, sin reemplazo/descarte. Volver a revisar conserva primero RAM. Recuperación reconoce la última comprobación incompatible aunque la ruta exista.
- Recuperar copia de la nota conocida con otro nombre conserva fuente incompatible y borrador originales. Un borrador de formato futuro queda sin reinterpretar; formato/unidad/textura desconocidos se conservan. No confundir pruebas del renderer en navegador con lápiz físico ni Git local de contrato con Git Android.

### H62/C56–57 · integración y carpetas compartidas
- H62 QA sin red contrastó copia de preferencias legadas al guardar, caché futura intacta, combinación/guardado manuscrito y recuperación separada de borrador frente a fuente futura. Datos/red/rotación restituidos; no repetir todo62 por cambios de estilo.
- Comprobar en próximo hito que la barra superior Android no cubre cabecera ni modales; padre ya ajustado no debe duplicar margen. IME y controles inferiores deben seguir utilizables.
- Dos perfiles con directorios privados distintos y misma carpeta: segundo no puede abrir/modificar fuentes; mensaje indica cerrar la otra instancia. Clones/servicios del mismo perfil comparten acceso; cierre/crash libera por el SO, sin borrar owner.lock. Apartar una asociación mantiene concesión hasta cerrar sus servicios.
- Coordinación desconocida/enlazada bloquea sin limpiar. Carpeta registrada ausente no se recrea. .knownext-runtime no aparece en árbol, búsqueda, paquete ni cambios Git. Contrato host dirigido correcto; aceptación instalada agrupada pendiente.

### C58–59 · archivos de recuperación y lotes
- Copia apartada con manifiesto futuro/desconocido/incoherente: no se ofrece recuperar/vista; se conservan copia y registro. Legado conocido se consulta sin reescribir. Nuevo conflicto conserva manifiesto1 y tres copias recuperables; revisión limitada explica su alcance.
- Plan de lote futuro, campos desconocidos o propietario/elementos/estados incompatibles: consultar/ejecutar rechaza sin tocar fuentes ni normalizar plan. Registro cambiado tras lectura rechaza escritura; ausencia de registro no crea carpetas.
- Lote legado conocido se consulta byte exacto y ejecuta solo explícitamente. Interrumpido se observa sin replay; segundo execute de completado no mueve/elimina otra vez. Verificar referencias, imágenes y borradores en hito agrupado siguiente; contratos dirigidos host correctos, sin repetir suites completas.


### Selección ampliada · candidato3.0
- Seleccionar mezcla de carpetas/archivos y arrastrar a otra carpeta: revisar grupo/destino antes de confirmar, incluyendo descendientes normalizados.
- Duplicar con borrador pendiente y colisión de nombre: conserva original/borrador, crea copia de lo guardado y rechaza destinos aparecidos después de revisar.
- Renombrar varios documentos enlazados: revisar nombres/extensiones, conservar cambios introducidos ante error y comprobar borradores/enlaces tras aplicar.
- Exportar selección: revisar subconjunto, obtener paquete y comprobar manifiesto/hashes, rutas y advertencias de recursos omitidos.
- Añadir selección al contexto: no llama a IA; explica archivos sin texto/OCR y mantiene controles/resultados parciales visibles en ventana estrecha.
- Interrumpir acuse de ejecución: consultar registro sin repetir automáticamente; no afirmar éxito desconocido.


### Búsqueda local incremental
- Buscar contenido guardado, repetir tras editar externamente, mover y borrar; no conservar coincidencias antiguas.
- Consultar TXT/CSV/Word/Excel y nota con transcripción; abrir resultado con el visor/página correspondiente.
- Revisar Alcance y actualización: sin borradores sin guardar/PDF/trazos inferidos; límites e incidencias explícitos.
- En320px mantener búsqueda y resultados visibles; cambiar tipo con selector compacto y usar teclado para abrir.

- Durante un lote activo o esperando turno, solicitar detener una vez; confirmar que termina el elemento actual y deja el resto sin ejecutar. Solicitud recibida no equivale a resultado final; revisar aplicados y referencias pendientes. Reabrir/execute no repite el lote.


### Lectores/editor bajo demanda
- Con perfil vacío, cargar bienvenida y comprobar que no solicita motores Milkdown/CodeMirror/PDF.
- Abrir notas/documento: cargar Milkdown, editar/guardar, cambiar pestaña y conservar estado.
- Abrir vista de lectura y PDF: mantener contenido/zoom/página y solo lectura; carga/error no recarga el espacio ni pierde cambios exteriores.
- Revisar compilado de producción, además del servidor de desarrollo: ningún ciclo de chunks ni error de inicialización.


### Plantillas de proyecto
- Crear/abrir proyecto → Plantillas de proyecto; revisar catálogo, recursos, límites y entradas retiradas.
- Preparar exportación/importación → Guardar como plantilla; revisar contenido completo, nombre y descripción. ACK incierto debe consultarse sin duplicar.
- Crear desde plantilla: revisar paquete/nombre y crear proyecto nuevo; editarlo no modifica original ni plantilla. Imagen referenciada y carpeta vacía permanecen.
- Compartir, recibir en otro perfil y guardar en catálogo: conserva nombre, descripción, contenido y recursos; cancelar destino mantiene preparación.
- Retirar/reincorporar conserva paquete. Formato futuro se conserva sin usar y el inventario explica revisión parcial.
- En320px mantener campos/acciones visibles y foco estable al retirar una entrada; footer de una fila, sin desbordamiento.


### Continuidad de sesión y guardado de notas
- Editar notas A, ocultar y volver mientras el ACK tarda; escribir B. B permanece visible, A termina antes de B y no se repite la escritura por otra señal. El pie no presenta la fecha antigua como protección de B.
- Mantener escritura continua: los modelos publicados se protegen con cadencia nominal5s más cola/ACK. Sin cambios no hay escrituras periódicas. El temporizador no termina trazos activos.
- Ocultar con un trazo en curso; terminar el gesto después: se conserva una sola vez. Selección/lazo incompletos conservan el original.
- Fallar checkpoint/comprobación: aviso inline y reintento explícito; una operación pendiente no se reenvía. En320px no tapa pie ni controles.
- En paquete Android agrupado, comprobar onPause/onResume, suspensión real y proceso terminado antes/después del ACK. Documentar lo que no llegó a protegerse; no confundir ratón/fixture web con lápiz físico ni señal Kotlin compilada con aceptación instalada.
- Actualización con edición/audio y trabajos por etapas conserva sus criterios propios; no se reanuda proveedor o captura por un evento de visibilidad.


### Buscar/reemplazar avanzado
- Buscar Plan con Plan/PLAN/planner, caracteres astrales, acentos combinados y texto que cruza negrita. Combinar mayúsculas/palabra completa; no atraviesa imágenes ni párrafos.
- Anterior/Siguiente selecciona la coincidencia visible y comunica posición; secciones conserva navegación por título.
- Reemplazar una/todas solo en documento nombrado. Deshacer una vez devuelve el estado anterior al reemplazo; escribir después es otro paso. Conserva marcas y elementos fuera del intervalo.
- Cambiar A→B→A conserva textos/filtros propios sin aplicar sobre B. Consulta máxima200; más1000 coincidencias requiere acotar antes de reemplazar.
- Deshacer/editar retira el acuse anterior.320px mantiene acciones44px sin desborde horizontal; panel móvil se oculta/reabre sin perder búsqueda.


### Plantillas con imágenes y catálogo documental
- Capturar desde Markdown con imágenes locales inline/referencia/HTML: preparar copia, revisar contenido y guardar. Cambiar/eliminar original después no cambia plantilla ni documento creado. ALT, título y tamaños se conservan en la vista de lectura.
- PNG/JPEG/WebP regulares hasta512KiB; faltar/dañar/truncar/salir del proyecto o superar tamaño/píxeles detiene sin escribir. Texto con imágenes hasta1MiB. Imágenes remotas no se descargan; adjuntos no imagen requieren otro flujo.
- Cerrar una preparación de solo lectura: respuesta tardía no guarda nada. Guardado pendiente conserva su protección contra cierre/repetición.
- Crear documento → Compartir varias: seleccionar revisiones, preparar y revisar una a la vez; cambiar selección invalida preparación. Cancelar destino conserva selección; archivo existente nunca se sobrescribe.
- Recibir catálogo: nombres propios, colisiones conservadas y contenido idéntico sin duplicar. Importación parcial informa cada entrada y mantiene resumen/error junto al pie. ACK perdido lleva a consulta de solo lectura y no repite importación.
- Archivo/digest futuro/campos desconocidos o catálogo local incompleto no se normalizan. Mantener límites32 entradas/2MiB; contenido privado no viaja implícitamente.
- En320px y con teclado, selección/nombres y pie44px siguen alcanzables. Contrastar selector/entrega instalados en siguiente integración agrupada, no inferirlos de componentes web.


### Consumo por proyecto y mes
- Abrir Uso IA: consultar global, un proyecto y un retirado. Cambiar mes UTC y comprobar alcance del resultado; no consultar proveedor.
- Demorar A, elegir B y terminar A después: B conserva selección/resultado. Error o respuesta de otro alcance no anuncia cero.
- Datos heredados/sin EUR: raya y aviso visible; total solo de importes disponibles. Datos sin periodo se explican. Vacío confirmado solo corresponde al alcance elegido.
- Datos numéricos/futuros no compatibles: error, fuente intacta y ningún reenvío facturable. Acumulado de investigación fallido conserva sus bytes; la ejecución puede reflejar fallo normal sin repetir proveedor.
- En320px cabecera/cierre siempre visibles, filtros44px y cifras legibles; contenido desplazable sin desborde. Escritorio mantiene panel al enfocar filtros.
- Cobertura indica hasta5000 registros conservados. No interpretar esta vista como factura completa/tope garantizado; conservación histórica y presupuestos mantienen su verificación separada.


### Conservación de consumo y transición a ledger2
- En copia de prueba con ledger legado, consultar no cambia bytes. Revisar conservación y convertir: conservar copia exacta antes de sustituir, verificarla y mantener agregados/detalle en una sola escritura.
- Alcanzar5000 detalles y añadir recibos: detalle rota, totales de periodos conservan todos los registrados; cerrar/abrir mantiene cifras. No reconstruir importes ya perdidos antes de migración.
- ACK perdido: comprobar estado por GET y no repetir conversión. Cambiar alcance mientras espera no regresa a la consulta anterior. Error de lectura retira afirmación de copia actualmente verificada.
- Fuente/revisión nueva, copia no disponible/protegida, checksum o versión/extensión futura: conservar archivos, no normalizar ni iniciar envíos IA desde preflight fallido. Un trabajo de investigación futuro se detecta antes de migrar consumo.
- Copia previa figura como recuperación y conserva bytes; no restaurarla sobre agregados nuevos como supuesto downgrade. Contrastar piloto2.6 real, falta de espacio/interrupciones y dispositivos en integración agrupada.
-320px mantiene cabecera/cierre44px al consultar/revisar; estado confirmado y cobertura heredada son distintos de factura completa o presupuesto garantizado.


### Presupuestos y grabación unificada
- Consultar mes/proyecto no escribe; presupuesto general y del proyecto se aplican juntos. Modo aviso continúa y se presenta antes del envío; modo detención bloquea nuevas operaciones al alcanzar límite o tener consumo sin EUR. Un mes anterior no impone límite al actual.
- Confirmación perdida: campos conservados, guardar bloqueado hasta comprobar GET, ningún replay. Cambio concurrente/archivo futuro no se sustituye; respuesta tardía no ocupa otro alcance.
- Grabación preparada/activa/pausada mantiene tiempo, niveles y controles aunque se alcance presupuesto IA. PCM se conserva; solo transcribir un nuevo fragmento se bloquea. Fragmento completado se entrega sin credencial ni nuevo proveedor.
- Interrumpir después de persistir envío/resultado/recibo/contabilidad: reapertura y observación no duplican consumo ni pierden textos; incierto no equivale a gratis. Retransmisión explícita advierte posible consumo y usa otro recibo.
- Antes del primer recibo, comprobar copia exacta de sesión. Denegar copia conserva original y evita envío; no elimina audio. Confirmar límites/formato futuro y referencias de recuperación en ambas plataformas.
- Inicio sin red y reintento explícito BCE: error mantiene cambio/campos, éxito confirma vigencia, reintentos próximos se limitan. No altera importes históricos.
- Contrastar instalada Windows/Android, trabajo en segundo plano, micrófono real y facturación real del proveedor. No confundir las pruebas controladas con esta aceptación.


### Copias de sistema en Recuperación
- Abrir Recuperación → Copias de sistema, filtrar consumo/sesiones/preferencias y distinguir fuentes de desarrollo. Inventario parcial/inaccesible no equivale a vacío global.
- Revisar copia: resumen sin texto/secretos, huella y procedencia precisas; futuro/ilegible/discrepancia no se aplica ni altera. El manifiesto de sesión no promete incluir audio PCM.
- Cambiar copia después de revisión: exportación se bloquea hasta revisar otra vez. Elegir destino después del congelado conserva exactamente el snapshot elegido.
- Cancelar destino conserva fuente/estado activo. Salida confirmada coincide byte a byte; archivo existente o ruta privada no se sustituye. Error o ACK incierto exige comprobar destino, sin replay automático.
- Contrastar selector nativo Windows y Android, permisos/espacio/cierre durante entrega,320px y teclado. Cierre y pie accesibles; categorías compactas sin ocupar la lista. No restaurar copia anterior sobre datos nuevos como supuesto downgrade.


### Recuperación de configuración con trabajo abierto
- Desde Ajustes y desde Recuperación/Compatibilidad, ajustes pendientes o documentos sin acuse bloquean mutación y mantienen revisión. Un cambio durante la protección se detecta.
- Proteger notas/Markdown/trazos antes de actualizar/restaurar. Durante la transición, teclado y puntero no editan controles anteriores. No detener captura nativa; contrastar con grabación activa instalada.
- Acuse perdido o resultado parcial: volver a leer estado, nunca repetir automáticamente. Mantener borradores y texto, y abrir visores/documentos desde la raíz observada aunque conserve ID. Respuestas tardías y propuestas IA antiguas requieren contexto nuevo.
- Fallo de lectura posterior mantiene vía de recuperación del inicio; no convierte archivo incompatible en valor inicial escribible. Contrastar Windows/Android, interrupciones y raíces reales antes de aceptación.


### Originales de restablecimiento y migración
- Filtrar los dos nuevos orígenes; revisar/exportar original sin mostrar campos privados. Identidad desconocida, enlace, archivo grande y diario futuro se conservan sin aplicación.
- Revisar punto de recuperación abre el punto de la copia elegida. Cambio posterior deshabilita restaurar; original individual no salta la revisión de la cohorte ni la protección de documentos/ajustes.
- Contrastar con instalación2.6 real y diarios/cambios/interrupciones propios. No confundir copia externa con downgrade/restauración autorizada del estado activo.


### Colecciones locales del historial
- Crear con versión elegida, cambiar selección mientras se edita y confirmar que conserva el destino original. Editar, añadir/quitar, archivar y reabrir sin cambiar documentos/commits ni miembros de otros documentos.
- Renombrar documento y volver a consultar: referencias anteriores siguen mediante historial. Diferenciar referencias de proyecto de versiones disponibles de este documento.
- Seleccionar dos versiones, filtrar una colección que oculte una: comparación conserva ambas y preview/borrador permanecen. Volver a todo el historial recupera marcas.
- ACK perdido mantiene campos, exige comprobar GET y adopta cambio encontrado sin otro POST. Formato futuro/ilegible, revisión cambiada, duplicado y cuota conservan estado y muestran error.
-320px mantiene cierre/acciones44px, gestor se pliega al finalizar y devuelve foco. Contrastar instalada Windows/Android y metadatos locales frente a sincronización/portabilidad pendiente.


### Comparación con remoto conocido
- Historial de proyecto GitHub: abrir Versión remota sin ampliar cabecera fija; informar que es instantánea local y que sincronización sigue pendiente. Sin conexión, usar referencia local disponible sin fetch/proveedor.
- Elegir bloques/ambos/versión completa; vista Milkdown. Aplicar prepara borrador y conserva cuatro contenidos exactos en Apartadas, disco/HEAD/índice intactos. Cancelar conserva edición. Guardar sigue siendo acción local separada.
- Cambiar HEAD, referencia remota, conexión/raíz o borrador después de revisar: rechazar y pedir nueva revisión; no sobrescribir ninguna fuente. Nombres con caracteres de pathspec se interpretan literalmente.
- Sin referencia/ruta coincidente, renombre remoto, enlace, binario o exceso2MiB: error explícito sin aplicación. Futuro/dañado de borrador permanece protegido.
- ACK perdido: una mutación, lectura del documento/revisión; solo adopta si coinciden contenido/base/identidad remota completa, sin repetir POST.320px mantiene controles44px visibles. Contrastar instalada Windows/Android y divergencia entre equipos; arnés de componentes no equivale a aceptación.


### Completar una actualización interrumpida
- Preparar punto y provocar fallo tras uno o dos estados: revisar estados observados y originales/destinos. Completar con trabajo protegido sin crear otro punto; omitir pasos ya actuales. Reabrir y recuperar originales exactos.
- Simular acuse de diario perdido con destinos ya escritos: revisión sin cambios y completar solo diario; nada se ejecuta al abrir ni se repite ante ACK perdido.
- Cambiar diario, copia o cualquiera de los tres estados tras revisar: rechazar/conservar y exigir otra revisión. Formato futuro, campo adicional, fase/tipo/fecha desconocidos nunca autorizan mutación.
- Configuración/exportación sin updatedAt conservan ausencia durante cambio de formato; destinos antiguos no reconstruibles y escrituras ordinarias no se adivinan.
- Sin autoridad del espacio o con ajustes/trabajo sin confirmar, completar no despacha. Tras resultado parcial/desconocido se lee estado real y conserva edición.320px con acciones/cierre44px. Contrastar instalada Windows/Android y migración real2.6 en campaña agrupada.


### Comparar fuentes remotas renombradas
- Remoto renombrado, solo local renombrado y nombres distintos a ambos lados: resolver ruta desde base común única, mostrarla y permitir revisar texto. Mantener nombre/archivo local, HEAD/índice y cuatro copias.
- Cambiar referencia/ruta después de revisar, enviar prueba ajena o perder ACK con origen cambiado: bloquear adopción/aplicación y conservar fuentes, sin otro POST automático.
- Sin base única/renombre reconocible, ruta no portable, enlace/binario/tamaño excesivo o revisión de rutas agotada: error explícito sin adivinar equivalencia ni copiar archivos nuevos.
-320px conserva controles visibles y texto de ruta legible. Contrastar instalada y entre equipos; preparar contenido no resuelve el grafo de sincronización del proyecto.


### Variantes agrupadas de conflicto
- Combinar Markdown/disco, histórico, remoto y nota: identificar grupos por operación/documento y papel de cada copia. Dos documentos/operaciones nunca se mezclan; revisión parcial no promete inventario completo.
- Consultar una variante y verificar su identidad/huella originales. Recuperar como archivo nuevo conserva las otras copias, manifiestos y fuentes. Formato futuro/dañado/origen ajeno no crea procedencia o autoridad nuevas.
- Filas compactas en320px, datos de identificación plegados y navegación/cierre fuera de resultados desplazables. Vista previa muestra papel; notas/editor permanecen. Contrastar instalada en próxima campaña agrupada.


### Ciclo de vida de puntos críticos
- Archivar punto conocido: originales/diario exactos, no libera espacio y recuperar/completar bloqueados. Reabrir y revisar de nuevo, sin cambiar documentos/activos. Vista sin autoridad solo consulta.
- Eliminar exige punto archivado, huellas actuales y aceptación nueva. Verificar que solo desaparece el punto elegido, conservando otros puntos y config/proyectos/export activos.
- Fallo en una entrada o proceso tras retirada parcial: conservar restos/registro, consultar sin reanudar y continuar solo mediante otra acción explícita. Punto ausente observado no atribuye causa.
- Futuro/extra/inconsistente/copia cambiada/enlace/solo lectura no se retira; no borrar carpetas recursivamente ni archivos desconocidos.
- ACK perdido: GET sin otro POST, aceptación reiniciada y resultado/aviso visibles.320px mantiene selección/cierre/acciones; notas/editor intactos. Contrastar instalada Windows/Android, espacio real y piloto2.6 agrupados.


### Lotes profundos y recuperación del resultado
- Revisar selección de más de64 niveles: error accionable, Cancelar/Revisar visibles a320px, ningún lote ni mutación. Probar entradas/bytes y selección menor.
- Con una carpeta profunda ajena, duplicar archivo y carpeta normales; reabrir servicio y consultar: originales/copias intactos, registro legible y sin árboles repetidos.
- ACK perdido: consultar una vez sin reejecución; documentos/pestañas se actualizan una vez, carpetas abiertas se conservan. Árbol no disponible conserva la vista previa y comunica revisión.
- Copia interrumpida: original intacto, destino parcial en atención; detención termina elemento en curso, no repite pendientes. Campaña nativa/dispositivos sigue pendiente.


### Divergencia de proyecto y resultados veraces
- En divergencia no ofrecer reemplazo/subir/actualizar global ni por fila; revisar datos conocidos sin conexión nueva. Las rutas antiguas de resolución rechazan409 y no anuncian éxito.
- Revisar ambos lados, coincidencias y renombres; separar coincidencia de ruta y conflicto de texto. Recursos/tipos no regulares se identifican sin abrirlos.
- Documento local regular abre para comparación desde Historial; ruta remota nueva no se trata como archivo local. Borradores fuera del análisis permanecen intactos.
- Refrescar con error limpia revisión vieja; cambiar proyecto no adopta respuesta anterior. A320px cierre/consulta visibles, contenido desplazable y foco devuelto. Resolver el grafo real sigue pendiente.


### Combinación frente a escritores concurrentes
- Durante publicación de combinación no admitir guardado/movimiento/borrador o publicación final de grabación del mismo proyecto; conservar resultado/estado pendiente, sin replay. Lectura, detención de lote y otra raíz siguen admitidas por la primitiva.
- Salida IA llegada durante la reserva queda revisable sin aplicar ni repetir proveedor. Reserva no cubre espera del proveedor ni elección de bloques por el usuario.
- Rechazo not-started no se confirma por coincidencia previa de contenido; aviso visible aun al desplazar comparación, aplicar bloqueado hasta revisar y cancelar conserva edición.
- Atribución de copias tras ACK incierto requiere recibo por intento todavía pendiente; no confundir postcondición observada con prueba de todos sus efectos.


### Recibo durable de combinación
- Confirmación perdida: comprobar identidad exacta,3/4 copias y estado actual; un POST de aplicación, solo consultas posteriores. Consultar intento no ejecuta ni cambia elecciones previas.
- Sin recibo/pendiente o con otra identidad, no adoptar contenido ya coincidente. Nueva revisión y cierre separados; edición conservada.
- Reabrir servicio tras corte en applying con postcondición y copias exactas: consultar sin cambiar diario; si borrador/fuente/origen/copias cambiaron, no confirmar.
- Readonly al publicar deja intent/copies sin cambiar fuente ni atribuir éxito. Formato futuro/extra/tamaño/cuota no se sustituye.
- Nota conserva páginas/puntos/presión/inclinación; remoto4 copias y referencia exacta. Archivo/retención del nuevo almacén e integración instalada pendientes.


### Borrador cambiado por otra operación
- Mantener una sesión abierta, cambiar su borrador por otra operación y provocar checkpoint/guardar/forzar/deshacer/descarte: revisión vieja rechazada, borrador nuevo y RAM intactos; aviso propio, sin confundir con cambio de archivo.
- Conservar y revisar: verificar copia exacta antes de leer el borrador guardado; escritura o trazos durante la espera no se sustituyen. Deshacer durante un acuse conserva su revisión propia para la siguiente operación.
- Acuse de conservación perdido: consultar ID, no repetir; copia ausente/parcial/futura o cuota agotada impiden reemplazo/cierre. Origen o registro inaccesible no impiden conservar RAM válida.
- Cerrar/transición con RAM bloqueada igual al disco requiere protección confirmada. Reabrir copia y recuperar como archivo nuevo conserva original y borrador activo.
- Nota renombrada conserva revisión frente a ID/fechas de raíz y distingue cambios de páginas/puntos/presión/inclinación. Pendiente contraste instalado y productores internos no interactivos.


### Combinaciones después de reiniciar
- Cerrar diálogo/reiniciar y abrir Recuperación > Combinaciones: localizar intento/fecha/fase sin pedido RAM ni reanudación. Aplicación iniciada o recibo completado no equivalen a sincronización resuelta.
- Revisar copias y coincidencia del borrador por separado; archivo/origen quedan sin contrastar. Borrador posterior se conserva y avisa; copia alterada no oculta las otras verificadas.
- Ver copias conservadas mantiene IDs/huellas/roles aun con inventario parcial; vista y recuperar como nuevo revalidan la copia. Sin proyecto explica el destino pendiente.
- Recibo futuro/ilegible permanece sin acciones; preparación sin destino no infiere éxito. Consultar legado no lo migra ni lo elimina. Registro/fuente inaccesibles no bloquean revisión privada.
-320px: selector/cierre/controles visibles, sin desbordamiento; cambio/actualización de consulta ignora respuesta antigua. Archivo/retención y aceptación instalada pendientes.


### Archivo y reapertura de recibos
- Recibo completado revisado: Archivar recibo lo sitúa en Archivados y conserva documento/borrador/copias. Pendiente o no compatible no ofrece archivo; Native también lo rechaza.
- Reabrir desde revisión de Archivados retira solo marca. ID del intento sigue reservado; no se vuelve a ejecutar. Archivar de nuevo el estado ya archivado con revisión vigente no cambia fecha/bytes.
- Revisión vieja, formato futuro y acción delete conservan recibo/copias. Archivo no libera cuota y no modifica fuente u origen.
- Acuse perdido: una mutación y solo consulta posterior; marca no observada bloquea otro cambio hasta Revisar intento. Doble clic no duplica. Cierre accesible, ámbitos a320px sin desbordamiento.
- Aceptación instalada y política de eliminación segura de recibos pendientes.


### Copias de archivos ausentes revisadas
- Listar una copia, cambiarla después y confirmar descarte/restauración: rechazar, conservar bytes nuevos y exigir Actualizar; no repetir la petición. Copia/ubicación sin prueba tampoco habilitan acciones.
- Reaparece el archivo o cambia la ubicación del proyecto después de listar: no sobrescribir ni retirar borrador activo. Formato futuro, identidad o clave discordantes se conservan aun con SHA correcto.
- Recrear Markdown/nota verifica origen y seis valores de puntos. Si un borrador nuevo/futuro aparece después de publicar fuente, archivo recreado y copia nueva se conservan; aviso sin adoptar revisión privada no vista.
- RAM abierta con cambios impide retirar su copia desde Ausentes. Editar durante un acuse conserva RAM y la revisión propia para el próximo checkpoint. Otro proyecto no desplaza el espacio actual.
- Inventario parcial vacío no se presenta como completo; origen no disponible sigue visible sin acciones; actualización fallida no desbloquea la decisión anterior. Confirmación conserva prueba antigua hasta cancelar/actualizar/elegir de nuevo.
-320px: error y acciones legibles, sin overflow; aceptación instalada y cortes de proceso pendientes.


### Publicación sin reemplazo concurrente
- Crear archivo/carpeta en el destino después de revisar un movimiento/restauración: se conservan fuente y destino. Comprobar también carpeta vacía.
- Fallar durante escritura de un archivo nuevo: no debe aparecer contenido parcial en la ruta pública. Un corte puede dejar un temporal privado; no borrarlo automáticamente.
- Windows: Unicode, ruta larga y renombrado de mayúsculas. Android: contrastar syscall en hardware/sistema de archivos, conservando originales si no se admite. Integración instalada pendiente.


### Papelera revisada
- Cambiar un archivo descendiente después de Revisar: Restaurar rechaza y conserva payload, origen y metadatos. Actualizar y revisar otra vez antes de otra decisión.
- Crear destino después de revisar: nunca reemplazarlo. Archivo y carpeta vacía deben sobrevivir.
- Propietario/entrada futuros, campos extra o enlaces: conservar sin interpretar; inventario parcial y acciones bloqueadas. Mil entradas, profundidad mayor64 o contenido mayor1GiB no debe forzar lectura ilimitada.
- Perder acuse: no inferir éxito por destino existente ni repetir; fila bloqueada hasta Actualizar exitoso y nueva revisión. Fallar Actualizar no la habilita.
- Acuse confirmado y fallo de refresco del espacio: mantener aviso de restaurado, sin repetir movimiento.320px, teclado y acciones fijas. Instalación/cortes de proceso pendientes.


### Acuse de restauración incierto
- Cortar después de mover y antes de completed: consulta del mismo intento confirma solo si payload ausente, destino exacto y marcador/propietario/ubicación iguales. No repara ni vuelve a mover.
- Payload presente con destino idéntico no confirma. Un segundo intento publicado no debe confirmar al primero que no publicó.
- Reiniciar UI: catálogo encuentra recibo; Consultar vuelve a leer, sin POST. Edición posterior del destino informa cambio. Error de árbol no vacía el espacio.
- Formato/marcador futuro y32 intentos: conservar, no podar ni reutilizar ID. Admisión not-started no consulta automáticamente.
- Validación instalada y cortes reales de proceso pendientes; pruebas actuales en temporales y capturas controladas.


### PDF con texto extraíble
- Buscar término solo en página2: resultado indica página/línea y abre PDF allí, también si estaba abierto y después de cambiar tamaño. No abre una nota ni muestra Markdown.
- Editar bytes/renombrar/borrar PDF: no reutilizar texto antiguo por fecha/tamaño; sin índice privado en disco. Metadatos/adjuntos embebidos no producen resultados del cuerpo.
- PDF protegido, ilegible, más200 páginas o streams comprimidos excesivos: avisar y conservar original. Escaneado sin texto no activa OCR.
- Añadir PDF de proyecto/subido al contexto: vista explícita muestra texto del cuerpo; error/sin texto tiene aviso y las listas omiten texto privado. Sin llamada a proveedor durante incorporación.
- Consulta que alcanza32MiB de texto retenido: devolver parcialidad sin retener el corpus entero. Android compilado; PDF reales/hardware/aceptación instalada pendientes.


### Contexto con origen y actualización explícita
Contexto IA: editar externamente una fuente con mismo tamaño/fecha debe exigir revisión. La vista conserva copia anterior; Actualizar copia cambia solo la caché con prueba actual. Simular acuse perdido: un POST y consulta del mismo recibo. Legado/futuro no se migran al leer. Instantáneas no ofrecen actualización de archivo vivo; cambio de proyecto no recibe vistas antiguas. Revisar320px, teclado y lector de pantalla; aceptación instalada pendiente.


### Reunión local de historiales con contenido idéntico
- Historiales divergentes con árbol idéntico: revisar/confirmar crea commit con dos padres y mismos archivos; verificar índice y borrador privados intactos. No mostrar nombres de ramas ni afirmar envío al remoto.
- Árboles distintos, cambios sin registrar o revisión vieja: impedir reunión sin cambiar fuentes.
- Acuse perdido: un POST y consulta del mismo intento; cerrar/reabrir permite consultarlo sin RAM anterior. Preparado no es confirmado, otro intento no confirma al primero.
- Recibo futuro, no regular o capacidad64: preservar, indicar parcialidad y no podar.320px mantiene consulta/cierre visibles. Dispositivos instalados y cortes de proceso pendientes.


### Resolver conservando la versión guardada del equipo
- Proyecto divergente con recurso/renombre: elegir Conservar versión del equipo muestra remoto y alcance completo, no una selección del filtro. Confirmar está deshabilitado hasta reconocer que no se incorporarán cambios remotos.
- Confirmar conserva exactamente árbol local guardado, índice/archivos y borrador; nuevo commit tiene ambos padres. No afirmar envío remoto.
- Acuse perdido/reapertura: consulta del mismo intento y modalidad, sin reenvío. No aceptar recibo de otra modalidad. Recibo1 sin reescritura, recibo2 conocido, modalidad futura preservada.
-320px muestra diferencias y confirmación sin repetir encabezados extensos; controles no se pierden al desplazar lista. Aceptación instalada pendiente.


### Recuperar recursos históricos como archivos nuevos
- Recuperar binario/texto de revisión local/remota a nombre libre: bytes exactos y extensión, originales/índice/historial/borradores intactos; nueva copia visible en raíz. Nombre ocupado/equivalente no se reemplaza.
- Eliminado: indicar que se toma base común anterior; no sustituir variante actual.
- Acuse perdido: consulta del mismo intento, sin POST adicional; archivo ajeno idéntico u otro intento no lo confirma. Reabrir desde catálogo sin RAM anterior. Error/cambio de proyecto no borra campo ni aplica árbol antiguo.
- Namespace privado no accesible por rutas de documento, enlaces o alias de caso; datos/propietario futuros y parejas incompletas se conservan, cuota no poda. No tocar carpeta/locks de coordinación.
- Confirmación de copia y vista separadas; sistema sin enlace/identidad verificable falla sin reemplazo. Verificar NTFS y almacenamiento Android real; compilación de identidad no equivale a ejecución instalada.320px mantiene controles fuera del texto desplazable.


### Estructura completa acotada y vista pendiente
- Abrir proyecto con estructura fuera de presupuesto o carpeta no legible: error explícito, sin falso proyecto vacío ni poda de pestañas; documento/nota aún pueden abrirse por su identidad si son legibles.
- Crear/recuperar/importar con fallo posterior de árbol: éxito de efecto y aviso de vista; no repetir escritura. Reintentar solo lectura, conservar última estructura y retirar aviso específico al actualizarla.
- Ocultar navegación y320px: acceso al estado, motivo, reintento y búsqueda; editor permanece operativo. Cambio de proyecto/resultado antiguo no sustituye la vista actual.
- Investigación nueva usa vista diferida; validar publicación en campaña autorizada, sin confundir compilación con ejecución de proveedor.


### Extraer texto sin registro comprobado
- Apartadas: copy.json legible sin registro, registro dañado/futuro o huella discordante. Revisar texto indica procedencia no comprobada; ninguna restauración directa al proyecto ni reparación.
- Casilla obligatoria junto a acciones;320px y navegación por teclado. Exportar Markdown a archivo nuevo, texto completo y originales byte a byte; campos privados/metadatos/adjuntos no incluidos. Archivo ocupado y destino privado no se reemplazan.
- Contraparte o contenido cambian tras revisar: exigir nueva revisión aunque el texto sea igual. Nota incompatible/formato futuro/JSON dañado/fuera de límite se conservan sin extracción. Nota válida: resumen de páginas/trazos y .knote con igualdad estructural completa, OCR y presión/inclinación; excluir metadatos privados de envoltorio, no aplicar a una nota abierta.
- Entrega incierta: comprobar destino y revisar de nuevo, sin reenvío automático. Cancelar selector conserva origen. Ejecutar flujo nativo Windows y Android; compilación y harness no equivalen a aceptación instalada.


### Revisión omitida en escritura de borradores
- Intentar checkpoint, guardado forzado, descarte/lectura de disco y restauración sin revisión con borrador existente:428/not-started y ambas ediciones intactas. Leer/revisar explícitamente antes de escribir con revisión válida.
- Primera escritura antigua sin borrador admitida; dos simultáneas no publican ambas, segunda409/428 no iniciada y contenido admitido íntegro.
- Borrador futuro/dañado/no comprobable:503/not-started, sin interpretar ausencia ni permitir forzar. Repetir para nota y Markdown; guardar/restaurar con revisión conocida conserva comprobaciones de base de disco e historial.


### Límite de publicación de una restauración
- Restaurar una versión mientras cambia el archivo/borrador: volver a comprobar las bases tras leer Git y antes de escribir; conservar estado y no crear versión al rechazar. Con bases actuales, restaurar registra versión nueva y las históricas permanecen legibles. La última comprobación no garantiza CAS contra un proceso externo.


### Combinación guardada por archivo
- Revisión de proyecto → Combinación por archivo. Elegir todas las rutas y conservar sin alterar archivos. Preparar/guardar/registrar una mezcla usando flujos existentes; volver desde catálogo y verificar.
- Pendientes, cambios fuera del alcance, archivos sin registrar, remoto/ubicación/conexión cambiados impiden reunión. Elegir ausencia exige que la versión registrada confirme ausencia; combinación propia debe diferir de ambas fuentes.
- Confirmar solo mezcla completa y vigente: ambos padres, árbol elegido y archivos/índice/borradores intactos. Acuse incierto consulta mismo ID sin POST adicional; selección/reunión futura conservadas, sin poda.
-320px, paginación y todas las rutas contadas; pie/confirmación44px, ámbito tardío ignorado. No presentar la selección como aplicación automática ni la revisión previa como estado actual tras publicar.


### Programa3.0 · Paquete de variantes (bloque100)

- Desde recuperación, revisar un intento completado con3/4 copias y abrir Compartir variantes. Contrastar funciones, tamaños y recursos excluidos; controles visibles a320px.
- Cancelar selector; entregar ZIP nuevo; rechazar sobrescribir existente. Importar por Importar proyecto en otro perfil, revisar contenido Markdown/notas y advertencias; comprobar originales intactos.
- Tras acuse perdido, comprobar destino y revisar de nuevo antes de otra entrega deliberada. Cambiar recibo/copia tras revisión debe impedir exportar con revisión anterior. Formatos futuros/parciales se conservan.
- Selector Windows instalado y Android SAF: pendientes de aceptación física. Sin proveedor IA.


### Programa3.0 · Conservación compactada (bloque101)

- Archivar un recibo completado, revisar conservación y ahorro por variante; confirmar compatibilidad. Compactar, recuperar como otro archivo y compartir variantes desde el compacto.
- Volver al formato anterior y contrastar bytes de payload/manifiesto/recibo; no cambia documento ni borrador activos. No se da por creada una copia externa.
- Simular denegación de retirada o corte entre copias: ver estados original/compacto/ambos, consultar sin continuar, nueva revisión y confirmación para continuar o expandir. Acuse perdido no repite POST.
- ZIP corrupto, futuro, entradas adicionales, enlaces, límites o recibo cambiado: preservar sin reparar. Comprobar controles fijos a320px. Aceptación instalada Windows/Android pendiente.

- Manifiesto no compatible con payload compacto conocido: extraer texto/nota mediante confirmación de procedencia no verificada; compacto y manifiesto original permanecen intactos.


### Programa3.0 · Aplicar variantes (bloque102)

- Selección de local/remoto/contenido combinado ya registrado; revisar altas, bajas y recursos. Capturar editores abiertos; un borrador afectado o cambios sin registrar impiden aplicar.
- Conservar y aplicar: verificar contenidos, copias previas, índice/HEAD intactos y controles fijos a320px. Más de4 cambios avanza solo con acuses; pausar/cerrar no encadena más bloques.
- Cortar entre bloques, reabrir y consultar sin continuar. Alterar un archivo/borrador: bloquear continuación, conservarlo y permitir recuperar variante como archivo nuevo. Destino ocupado no se sustituye.
- Mientras pendiente, intentar crear versión o sincronizar: pausa antes de publicar. Interrumpir liberación tras completar y finalizar mediante consulta nueva, sin repetir archivos.
- Cerrar sin continuar requiere confirmación visible: no deshace cambios, conserva copias y permite revisar/registrar estado actual. Formatos desconocidos o payloads dañados se preservan. Aceptación Windows/Android instalada pendiente.


### Programa3.0 · Payloads aplicados (bloque103)

- Desde preparación cerrada, gestionar copias anteriores/elegidas. Ver aviso de compatibilidad antes de lista y controles a320px; confirmar, compactar, recuperar binario/Markdown/nota como copia y expandir.
- Comparar bytes/hash, recibo, confirmación y archivos/índice/historial del proyecto: permanecen. No se acredita respaldo externo ni se libera cuota de IDs.
- Corte/denegación deja original, compacto o ambos; consultar no reanuda. Acuse perdido hace una consulta sin otro POST, requiere revisión/confirmación nuevas.
- Completar un ciclo y reenviar revisión inicial: debe rechazarla. Repetir en copias de conflictos archivadas. Formato futuro de revisión se preserva; datos conocidos siguen recuperables. Aceptación instalada pendiente.


### Respaldo completo de variantes · bloque104
[ ] V3/104: desde preparación cerrada respaldar ZIP nuevo, cancelar, comprobar exacto/alterado y reabrir Anterior/Elegida en otro proyecto. Acuse incierto no reenvía. Originales/recibos intactos;320px, teclado y foco. Android: compilar Kotlin y validar SAF pendiente por fallo Java/Gradle; no aceptado con fixture.


### Retirada revisada y separación de servicios ·105–106
[ ] V3/105: guardar respaldo, confirmar retirada, cancelar o elegir ZIP erróneo; cortar con representaciones mixtas, consultar sin continuación, reabrir y revisar/elegir de nuevo para terminar. Índice/documentos/recibos/ZIP intactos e identidad no reiniciable. Android/SAF pendiente de compilar/aceptar; fixture no acredita selector físico.


### Propiedad de sesión y resumen móvil ·107–108
[ ] V3/107–108: retener consultas de estado, cambiar A/B/A y soltar respuestas anteriores; ninguna sustituye la sesión actual. Doble acción no duplica admisión. Móvil320: tarjetas con tres estados, nombres/rutas largos, filtros plegados conservados, objetivos44px, cuerpo/pie a altura560 y carga sin falso vacío. Contrastar teclado virtual/lector y app instalada por separado.


### Recuperación incompleta, dominios y teclado ·109–111
[ ] V3/109: con recibo ausente/futuro y copia ilegible, extraer otra original/compacta y comprobar bytes exactos del ZIP. No se aplican ni borran originales. Revisar tras cambio, cancelar/acuse incierto y volver a seleccionar.
[ ] V3/111: Tab/Shift+Tab/Escape, fondo aislado y foco devuelto al control; redimensionar ocultando origen y volver al área principal. Revisar modal anidado/lector real por separado. Sin aceptación instalada por fixture.

### Instantáneas e inserción viva ·112
[ ] Insertar página, editarla e insertar otra vez: imágenes previas y documento anterior intactos. Archivo destino alterado/no regular y proyecto ajeno deben rechazarse. Retener respuesta de imagen/nota, escribir/componer, cambiar documento/proyecto y volver: no sobrescribir ni insertar en ámbito ajeno. Reintento añade imagen visible; deshacer/rehacer conserva texto anterior/posterior. Contrastar borrador/reinicio e IME en app instalada; fixture no acredita aceptación.

### Historial revisado ·113
[ ] Revisar y cambiar bytes del mismo tamaño/HEAD/índice: confirmar revisión vieja debe rechazar antes de efectos. Incluir documento, alta/baja y nombre Unicode/espacios; preparación ajena y privados intactos. Borrador abierto queda pendiente. Atributos activos requieren otra herramienta. Perder acuse: solo consulta, sin reenvío; revisar estado antes de confirmar otra acción. Comprobar botón inferior completamente dentro del panel a320x560. Git/archivos reales y aceptación instalada pendientes por separado.

### Centro de proyectos, espacio y traslado ·114
[ ] Abrir Recuperación/Proyectos sin remoto disponible. Elegir A/B reteniendo la respuesta anterior: ámbitos y detalles separados, proyecto abierto intacto. Revisar preparación cerrada, respaldo/compactación/retirada y volver; no repetir mutaciones. Error de consulta permite extracción legible sin adoptar formato desconocido. Exportar explícitamente el proyecto elegido y comprobar alcance; Espacio no mide/limpia al entrar. Cambiar categoría, móvil320x560 y foco/diálogo anidado. Selectores, efectos nativos y aceptación instalada se verifican por separado.

### Inventario y presupuesto común ·115
[ ] Revisar Copias y límites con carpetas mixtas sin recibo, entradas futuras y grupos sin asociación; cobertura parcial/enlaces nunca se consideran vacíos. Revisar bytes exige identidad de proyecto conocida y no permite aplicar/borrar. Activar/lower/ampliar/desactivar presupuesto con revisión vigente; formato futuro intacto. Capacidad agotada rechaza nueva preparación antes de recibo; guardados/borradores y continuaciones se conservan. Acuse perdido consulta sin reenviar. Filtro/paginación, móvil320x560 y teclado. No acredita aceptación instalada del selector/exportación.

### Respaldo íntegro y retirada de conflictos ·116
[ ] Archivar recibo completado, guardar ZIP nuevo y comprobar bytes originales/manifiestos/Documentos.zip. Elegir ZIP erróneo/cancelar/sin confirmar no retira. Cortar por solo lectura, consultar sin continuar, nueva revisión y volver a elegir respaldo para terminar. Extras/futuro/cambio posterior preservan lo restante; recibo/documento/borrador/ZIP intactos e ID no reutilizable. Dos perfiles compactan/expanden sin falso ocupado. Revisar estado final sin ofrecer reabrir, teclado/foco y footer320x560. Native picker/SAF y aceptación instalada por separado; Android pendiente de compilar.


### Archivo privado portable (117)

- Exportar proyecto: opción privada desmarcada; selección parcial/plantilla no la ofrece. Activarla añade resumen revisable, no entrega hasta elegir destino ni permite guardar plantilla.
- Importar en otro perfil: nombre nuevo, documentos y copias originales/editables presentes, WAV por partes reproducibles, inventario/SHA y bundle reconstruibles; no se activa Git, no se aplican preferencias globales ni se inician envíos/transcripciones.
- Sesión activa, colisión Archivo KnowNext, datos futuros/enlaces o exceso de128MiB: rechazo recuperable sin tocar originales. Confirmar otra vez un proyecto ya importado conserva ediciones posteriores.
- Contratos temporales/headless pasan; selectores Windows/Android y aceptación física siguen pendientes.


### Cobertura externa y presupuesto (118)

- Copias y límites: grabaciones, paquetes y almacenes conocidos de proyectos externos, categorías filtrables sin acciones destructivas derivadas de tamaños. Ubicaciones compartidas/anidadas se cuentan una vez.
- Registro/ubicación inaccesible indica cobertura parcial; no habilita nuevas preparaciones cubiertas con límite activo.
- Presupuesto agotado: nueva plantilla/copia histórica no publica payload; ampliar el límite permite continuar explícitamente. Fuentes y documentos actuales intactos.
- Confirmar que se explica que audio/traslados se miden pero su creación aún no se limita; no confundir tamaño lógico con espacio libre/recuperable.


### Preferencias del archivo portable (119)

- Recuperación/Proyectos: revisar preferencias sin activar proyecto ni escribir; comparar valores y grupos inicialmente desmarcados. Sin archivo/formato futuro/campos IA: rechazo con originales intactos.
- Elegir solo aspecto o solo anchos, confirmar y aplicar; proteger documento/nota abierta, impedir transición si hay ajustes pendientes y recargar estado. Campos no elegidos y credenciales conservados.
- Cambiar fuente/configuración tras revisar: rechazo sin publicación. Acuse perdido: una consulta/reapertura, ninguna repetición; revisión nueva para otro intento. Valores ya coincidentes no escriben otra vez.
- Vista320x560: comparación legible, confirmación y pie accesibles. Pruebas temporales/headless no sustituyen aceptación instalada.


### Copias de proyectos retirados y ubicaciones anteriores (120)

- Retirar proyecto conserva su medición/presupuesto de copias conocidas; la consulta no lo restaura ni activa. Distinguir retirado de ubicación conservada de proyecto registrado.
- Ubicaciones actuales/anteriores producen filas distintas; raíces compartidas/anidadas no duplican bytes. No se reclama propietario durante la consulta.
- Catálogo retirado futuro/ilegible o ubicación no disponible: cobertura parcial y fuentes conservadas; con presupuesto activo, nuevas copias cubiertas no se admiten con medición incompleta.
- GET de inventario/payloads/preferencias independiente; escrituras siguen serializadas. Pie y avisos accesibles a320x560.


### Traslados sucesivos y privacidad del paquete simple (121)

- Tras importar, exportar como paquete documental: ningún archivo dentro de Archivo KnowNext; exclusión de la carpeta completa visible.
- Exportar con archivo privado: conserva payloads anteriores, cabeceras originales en Anteriores, copias actuales bajo Actual y conteos agregados. Importar en otro perfil y repetir el traslado; bytes/borradores/audio/historial conservados sin activarlos.
- Documento normal enlazado a copia anterior: enlace sigue resolviendo; no reescribir archivos privados conservados.
- WAV/binario/metadatos alterados, referencias duplicadas, versión futura o carpeta privada no reconocida: no entregar conjunto parcial, fuentes intactas.


### Borradores portables · bloque122

En Recuperación > Proyectos > Borradores del archivo, contrastar dos copias del mismo documento, vista individual, fecha y acciones a320x560; crear copia y abrir Apartadas. Continuar Markdown/nota con base coincidente y sin borrador, comprobar protección del trabajo abierto y disco sin cambio; rechazar base distinta/borrador/futuro/parcial/cupo. Simular acuse perdido: consultar sin replay, revisar otra vez antes de continuar.


### Cupos de registros · bloque123

En Recuperación > Copias y límites > Cupos de registros, comprobar que no consulta hasta Revisar cupos. Distinguir64/64 registros con pocos bytes, traslados pendientes, proyecto anónimo y recuentos mínimos. Confirmar que reducir archivos no promete cupos libres ni hay acción de eliminar/reciclar. Revisar error tras actualizar (sin datos antiguos), paginación y320x560 con Cerrar visible.


### Audio portable · bloque124

En Recuperación > Proyectos > Audio del archivo, revisar fuentes/fecha/tamaños y entradas sin audio, confirmación en320x560, importación explícita y sesión Archivo portable conservada en Grabaciones. Escuchar sin transcribir; controlador compacto mantiene tiempo/niveles/acciones con sesiones abiertas. Comprobar rechazo con captura/niveles/dictado/trabajo activos, parte alterada/ausente/repetida, presupuesto/almacén lleno, origen futuro y destino ocupado/parcial. Acuse interrumpido consulta sin duplicar ni afirmar copia completa. Android indica adopción pendiente; no ejecutar proveedores en QA sin presupuesto autorizado.


### Historial portable y grabaciones integradas · bloques125–126

Historial portable: revisar dos puntos sin ramas, elegir/confirmar, comprobar documentos/borradores/configuración intactos y versiones consultables sin guardado automático. Rechazar bundle/partes alterados, punto ajeno, futuros, .git previo o preparación conservada; acuse perdido consulta sin replay. Medir preparación en Copias y límites sin ofrecer borrado. Gestor integrado: fuentes en fila, tiempo/niveles/controles fijos al desplazar sesiones, cierre/Ajustes, siete áreas44px a320x560 y documento conservado. Bandeja420x480 y geometría solo recordings; comprobar físicamente que main no cambia tamaño. No usar IA sin presupuesto. Otros historiales/formatos/dispositivos siguen pendientes.


### Fiabilidad, operaciones y transiciones ·127

- Lanzar una exportación/IA controlada lenta y seguir editando/guardando otro documento. Revisar prioridad entre pendientes sin interrumpir escritura actual. Inspeccionar importación/reindexado restantes por separado: no dar por cubiertas todas las capacidades.
- Agotar espera, conservar aviso y comprobar sin reenvío. Recibir respuesta antigua después de editar; conservar edición nueva y no mostrar guardado falso. Abortar antes de invocar: no hay trabajo. Cancelar queued: confirmación not-started; running: informar que no se detuvo.
- Detalle de tareas en1280 y320px: pendientes antes que finalizadas, historia recogida, 44px, sin desbordamiento ni desplazar totalmente documento; copiar diagnóstico y confirmar ausencia de nombres, rutas, prompt, cuerpos o secretos.
- Editar durante descarga Windows y verificar último ACK antes de instalar. Rechazar instalación con ajustes/borradores en error, captura/pausa/dictado/niveles/envío, investigación activa aunque se haya solicitado cancelación. Otras ventanas no inician captura tras reservar; fallar instalación devuelve el espacio o conserva aviso para retorno explícito.
- Android: proteger desde antes del puente combinado; aceptar permisos solo por el flujo existente. Observar apertura/retorno del instalador y fallo/tiempo agotado sin repetición. No dar por verificada esta integración con navegador o compilación Windows.
- Cerrar main con keepInTray: ocultar conserva trabajo. Cierre efectivo y Salir desde bandeja: proteger entrada pendiente, documentos/notas y ajustes antes de terminar audio/proceso. Con fallo, permanecer abierto. Con confirmación vieja/nonce ajeno, no salir. Verificar físicamente el intervalo entre ACK y cierre y estados de proveedor inciertos.
- Usar el procedimiento integral de docs/architecture/migration-formats.md para piloto/retorno. Reutilizar resultados no afectados; regresión completa cuando termine la implementación del programa. Sin IA de pago.


Investigación en segundo plano: impedir revincular raíces hasta que termine realmente el trabajador, incluso tras solicitar cancelación; publicar informes/imágenes con admisión por proyecto y sin reemplazar una ruta ocupada después de la revisión. Conservar resultados y estados de revisión si la publicación no se confirma.

Actualización: doble clic durante el primer checkpoint no inicia una segunda descarga, instalación ni reserva; un fallo devuelve el espacio sin liberar la reserva de otro intento.


### Importación e inventario por fases ·128

Importar archivo/imagen mientras se edita/guarda otro documento; observar tareas sin ocupar toda la vista. Ocupación tardía del nombre, incluyendo cambio de mayúsculas, conserva origen y entrada existente; conservar ambos informa el nombre real. Retirar/revincular proyecto antes de publicar impide escritura con not-started; cambio posterior conserva recibo y marca vista no disponible. Fallo de árbol no vacía biblioteca ni reenvía importación. Endpoint de imagen con y sin barra final mantiene validación de cabecera/tipo.

Reindexar imágenes con referencias repetidas en varios Markdown: contar por recurso y conservar documentos. Modificar fuentes/crear archivo o publicar otro índice durante el cálculo: no sustituir con resultado obsoleto. UTF-8 inválido, caché futura/corrupta, límites o permisos denegados conservan caché anterior. Las carpetas técnicas y los archivos de coordinación no se abren. Medición representativa y aceptación física siguen pendientes; no confundir presupuesto cooperativo con interrupción garantizada de E/S. No usar proveedores.


### Bloque 1 · Recuperación, cuotas y compatibilidad · 129

- Recuperación > Copias y límites: alternar Registros y conservación / Espacio y límites. Familia, página, original/archivo y revisión identifican el mismo registro. A 320 px, sin desbordamiento; confirmaciones legibles y controles de al menos 44 px.
- Respaldar un registro conocido y uno parcial; comprobar archivos/directorios vacíos y huellas. No incluir archivos de coordinación. Un formato futuro o enlace permanece sin reinterpretarse.
- Resolver primero copias/admisiones/transferencias dependientes; después cerrar recibo, aplicación/plan o plantilla. El cupo activo baja; los bytes conservados siguen contando. ID anterior no se recrea.
- Cortar antes/después del registro de cierre y antes/después de un traslado. Consultar no continúa; otra confirmación solo continúa con las mismas pruebas y no sustituye un destino.
- Retirar archivado: nueva confirmación, elegir otro ZIP externo completo. ZIP incorrecto/cambiado/parcial no permite retirar. Corte después de algunos archivos: consulta sin efectos, huellas/identidad restantes y respaldo conservados; continuar exige revisión y ZIP otra vez. No se purgan IDs.
- Preparación incompleta: extracción conserva bytes. Nueva selección mantiene bases/elecciones verificadas con ID distinto y no aplica archivos. Recibo conocido con payload ilegible: cierre explícito no deshace ni aplica, conserva copias y libera solo su propia admisión. Recibo futuro/ajeno no permite liberar protección.
- Ejecutable: contenido mantiene modo, índice e historial. En Unix comprobar permisos después de aplicar; en Windows cambio de permiso no representable queda rechazado antes de modificar archivos.
- Presupuesto: nueva captura/transferencia sin margen no se inicia. Guardar/detener/continuar trabajo previo siguen disponibles; no confundir el presupuesto de admisión con cuota rígida de disco.
- Compatibilidad: legado válido sin conversiones obligatorias; caché futura/corrupta protegida. Transición auxiliar guarda copia exacta antes de sustituir. Resumen de proyecto distingue guardado, historial, remoto sin consultar y copia externa sin verificar.

Aceptación física, actualización/piloto 2.6→3.0 y regresión completa se ejecutan en P10; estas instrucciones no acreditan su ejecución. No utilizar IA de pago.


### Bloque 2 · Runtime y continuidad ·130

- Iniciar autenticación/consulta de repositorios y guardar un documento: la red no mantiene la autoridad de guardado. Sustituir desafío o cerrar sesión: la respuesta antigua no publica ni revive UI. Probar error de repositorios sin interpretarlo como lista vacía correcta.
- Mantener operación Git de proyecto A: guardar en B. La exclusión de A conserva su ubicación/historial; un recurso bloqueado no impide otro disponible y la antigüedad evita inanición entre waiters en conflicto.
- Cancelar queued confirma no inicio. En trabajo cooperativo running, Solicitar detención solo solicita; confirmar detención al siguiente punto seguro antes de publicación. Durante publicación no existe botón de cancelar. No esperar terminación inmediata de HTTP/Git/E/S del sistema.
- Reabrir con tarea activa en el diario: aparece sesión anterior por revisar, sin repetir/continuar ni llamar a proveedor. Consultar resultado en su dominio. Diario futuro/corrupto o escritura fallida: bytes conservados, aviso visible y edición/guardado disponibles.
- Sobre IPC con versión/ID erróneos y argumentos futuros se rechaza, sin segundo envío. Diagnóstico no contiene nombres, rutas, documentos, cuerpos, tokens ni prompts. Respeta límites384/512KiB en diario y50 entradas exportadas.
- A320px: aviso limitado al45% de altura, acciones al menos44px, lista desplazable, sin desbordamiento horizontal y documento principal visible. Estado detenido no equivale a resultado desconocido.

La campaña local usa API controlada y Chrome headless; instalación, suspensión real, actualización/audio, cortes/espacio y rendimiento representativo siguen en P10. No activar la UI nativa ni reintentar Gradle con la incidencia de entorno sin resolver. Sin IA de pago.


### Bloque3 · Seguridad, privacidad y control IA ·131

- Ajustes > IA documental: paneles plegados y consultas bajo demanda. El buscador encuentra privacidad/retención/credenciales. A320px, sin desbordamiento y controles/etiquetas accionables de44px; teclado y errores permanecen en el recorrido.
- Clave sintética: reemplazar/retirar preserva GitHub; fallo conserva el campo del formulario. Revisión vieja no aplica. Nunca devolver claves ni copiarlas en claro. Revocar en proveedor es otra acción.
- Almacén ilegible/futuro sintético: restablecer solo confirmado, original exacto cifrado y verificado antes de sustituir. Copia compatible: restaurar por huella; original ilegible/futuro queda no restaurable en esta versión. Retirar una copia exige otra revisión/confirmación y no altera las claves actuales. No actuar sobre claves/perfiles reales para esta comprobación.
- Privacidad del proyectoA: pausar nuevos envíos, conservar captura local. Envíos de texto/imágenes/investigación/dictado/grabación comprueban política antes de cada nueva llamada; las ya iniciadas no se interrumpen por fuerza. ProyectoB conserva su regla propia.
- Seleccionar categorías y30/90/365días o Todos. Revisar cantidades y exclusiones. Fecha más reciente impide borrar una entrada actualizada; sin fecha se conserva con filtro. Confirmar con política pausada y sin trabajo incompatible. Cambios posteriores o formato no conocido bloquean antes del primer efecto.
- Corte/fallo después de un archivo: acuse parcial observable, resto intacto; consultar o reenviar ID anterior no continúa ni elimina contenido creado después. applying sin trabajador tras reiniciar se observa como interrumpido sin reescribir recibo. Revisión nueva requerida para otra eliminación.
- Documentos/borradores/historial/audio original/transcripciones/contabilidad/copias/exportaciones permanecen. Borrado local no elimina proveedor ni es borrado forense. Pausa IA no bloquea solicitudes de imágenes remotas del documento.
- Ventana de grabación/desconocida no lee claves, documentos ni datos IA generales. Navegación remota/file/javascript/data/host parecido/credenciales rechazada; enlaces web explícitos y recursos locales PDF/Mermaid/imágenes/audio se comprueban en el paquete instalado P10.
- readOnly estructurado: respuesta que propone crear/editar/dibujar/generar imagen/eliminar no aplica ni obtiene otra capacidad. Fuente con instrucciones no amplía proyecto/permiso. Cambios de raíz/base/borrador o permisos durante espera conservan el documento y ofrecen revisión; ACK del modelo no se interpreta como nativo.
- Entradas con profundidad/nodos/bytes/archivos/base64 fuera de límite se rechazan antes de negocio/decodificación. ZIP traversal/alias/reservados/futuro, contenido/imagen falsos y fuente PDF grande conservan destino. No abrir archivos de coordinación.

La campaña local131 no equivale a instalación, Keystore físico, pérdida de energía, aceptación de usuarios ni evaluación de proveedor. Estas comprobaciones permanecen en P10/T17; no usar IA de pago ni repetir suites completas durante desarrollo.


## Bloque4 · entrega132 · Portabilidad y exportación

- Con un repositorio existente, revisar bundle y punto de partida; incorporar sin cambiar HEAD, índice (incluidos cambios preparados), archivos abiertos, borradores, configuración o remotos. Un destino/preparación desconocido o fuente cambiada bloquea. Consultar puntos antiguos y volver al actual; guardar una nueva versión vuelve al historial actual. No aparecen ramas.
- Traslado privado sucesivo: preservar todas las generaciones, colecciones/hitos/favoritos, estilos/perfiles, conversación/contexto/investigaciones/resultados como datos y preferencias1/2. Revisión de familias conserva IDs actuales; estilo solo se sustituye si se elige. No se reactiva IA, presupuesto, permisos o trabajos. Credenciales y estado técnico excluidos. Archivos ilegibles/futuros permanecen.
- Windows y Android: revisar/incorporar audio como sesión detenida/retenida, identidad estable y PCM exacto, sin envíos ni transcripción. Captura/niveles/dictado/trabajo activo bloquean; ACK perdido no duplica. Android muestra la limitación de Git real.
- ZIP hasta512MiB/expandido1GiB/archivo64MiB/10000entradas; comprobar también justo por encima, espacio insuficiente y permisos. No se acepta truncado/parcial. SAF copia por64KiB y conserva su límite separado para recuperación.
- Lote de32 documentos como máximo y mismo proyecto: perfiles, portada, índice sin páginas falsas, imágenes/diagramas/tablas/texto largo y Unicode del corpus; mixto con notas en PDF. DOCX/Markdown con notas falla explícitamente. Markdown conserva rutas/imágenes locales; faltantes/remotas/internas sin guardar fallan antes de publicar. Comparar contenido real y abrir resultados en lectores externos en P10.
- Revisar lote congelado, editar origen después, entregar y comprobar que no cambia el lote. Destino existente no se reemplaza. Cancelación permite elegir otro; ACK incierto consulta sin reabrir selector. Reabrir preparación conservada; quitar solo su ZIP local tras confirmar conserva originales y copia externa. Futuros, hashes cambiados y preparación desconocida no se eliminan para continuar.
- A320px y zoom comprobar títulos, etiquetas táctiles44px, desplazamiento interior y pie accesible. Capturas de desarrollo no acreditan teclado/lector de pantalla o WebView instalado completos.

P10 conserva instalación Windows/Android, Kotlin/SAF/Keystore y aceptación física, suspensión/actualización, cortes y espacio reales, rendimiento representativo y regresión general. No activar UI nativa Windows ni repetir Gradle sin resolver la incidencia de entorno. Sin gasto de proveedor.

- Inventario/cupos132: exportaciones preparadas visibles, también interrumpidas o retiradas como metadatos. Presupuesto opcional insuficiente bloquea antes de crear el lote; retirar el ZIP mantiene el cupo de identidad y no borra entregas externas. Comprobar que se muestran siete familias y que los límites de2GiB de trabajo de traslado/512MiB+128KiB de reserva de lote no cambian por sí solos el presupuesto seleccionado.


## Entrega133 · Edición documental y reversión (aceptación P10 pendiente)

- [ ] Abrir sin editar Markdown con YAML/TOML, definiciones, tablas, pies, HTML/Mermaid e imágenes: ningún guardado/borrador por normalización; editar, deshacer y reabrir sin pérdida de fuente protegida.
- [ ] Pegar tabla con celdas combinadas/SVG/media: bloqueo previo sin cambio, alternativa de texto explícita sobre selección vigente y un undo. Teclado/IME/portapapeles reales y diálogo a320px/zoom.
- [ ] Menú/paleta de proyecto → restaurar archivo histórico sin Markdown abierto; revisar Markdown, imagen, PDF, nota y binario sin visor. Commit nuevo con índice previo y borrador privado conservados; comprobar renombre, fuente cambiada y parcial por HEAD concurrente.
- [ ] Aplicación IA sintética en editor visible/otra pestaña/no abierto/nota: una procedencia previa al efecto; guardar/autosave no adelantan; cambio de proyecto/permiso/sesión durante espera y edición manual tras ACK no se pierden.
- [ ] Revertir bloque/página disjunta; preservar manual posterior; solapamiento exige resolución revisada/consentimiento; creación intacta a Papelera, destino modificado permanece. Sin proveedor ni gasto.
- [ ] Perder ACK y consultar restauración/reversión/reemplazo: protección y recarga, un único intento; cerrar/reabrir catálogo nunca ejecuta. Retirada IA conserva identidad/huellas y documento.
- [ ] Reemplazar entre documentos elegidos: antes/después y límites, archivos guardados intactos, borradores revisados; edición posterior impide deshacer lote. Parcial conserva copias consultables.
- [ ] Inventario/cupos de tres familias y traslado privado ida/vuelta: huellas/copias conservadas como datos, sin activar operaciones/recibos del receptor; documental no filtra procedencia personal.
- [ ] Windows/Android instalados, recursos/lectores externos, offline, suspensión/actualización y cortes/espacio físicos. Git nativo Android sigue explícitamente no disponible. Regresión completa solo al finalizar el programa.


## Entrega134 · Grabaciones, actas y OCR (P10 instalado pendiente)

- [ ] Abrir gestor principal y miniventana: preparada/grabando/pausa, fuentes en una fila y controles/tiempo/niveles visibles con sesiones desplazadas; cierre no duplica/detiene captura. Hardware real y reanudación Android/Windows.
- [ ] Consultar transcripción local de sesión detenida, fragmentos incompletos avisados, tiempos de captura reales y ningún hablante inferido; escuchar rango correcto por bloques≤30s conlease y foco/Tab/Escape aislados; audio retirado no simula reproducción.
- [ ] Abrir acta desde gestor y bandeja: fuentes/fragmentos disponibles, acuerdo/acción con citas, responsable/fecha solo humanos, preview y consentimiento. Publicar como archivo nuevo, colisión no sobrescribe, perderACK→consultar una vez; apertura después de recarga protegida, incluso otroproyecto. Cierre de borrador exige descarte.
- [ ] OCR por página requiere consentimiento remoto/posiblecoste; original PNG y propuesta retenidos, corrección antesaplicar. Sinclave/permiso/modelo/budget no envío. T17 real sigue aplazado: no ejecutar reconocimiento facturable en esta aceptación sin nueva autorización de gasto.
- [ ] Aplicar texto revisado no cambia trazos/otraspáginas. Edición manual posterior/otra pestaña/proyecto/source cambiado conserva copias; ACK perdido→GET/observer sin reenviar; texto albuscar trasguardar. Probar IME/teclado/lápiz y background reales.
- [ ] Cupos/bytes de actas yOCR visibles; archivo privado conservaPNG/propuesta/fuentes/huellas como datos, no activa operaciones del receptor; paquete documental excluyehistorialprivado. Llenado/interrupción/error de disco conserva originales y muestraestadohonesto.


## Entrega135 · Plantillas y recursos (P10 instalado pendiente)

- [ ] Capturar plantilla conPDF/Office/TXT/CSV/imágenes, revisar recursos/privacidad, exportar/importar2y1, crear en subcarpeta; bytesSHA ylinksrelativos/query/#page conservados, originales intactos. Recurso unsupported,macros,hash/tamaño/colisiónrechazadossinpublicaciónparcialoculta.
- [ ] Seleccionargrupo de plantillas deproyecto, revisar nombres/colisiones incluidasretiradas/cupo y transmitir: solo catálogo, IDs nuevos, nunca proyecto/autoridad. ACKperdido→GET, jobconservado secontinúa explícitamente; deliveringincierto noentregadenuevo; retirarpayloadconproofdejaoriginales/identidades.
- [ ] Menú/paleta → recursos: recursosfaltantes/backlinks/relativosWindowscasing/carpeta, fuenteparcial yestado extracción real. Text/PDF/Office/OCRguardado conSHA; erroresUTF8noparecenvacío. Links websoloporgesto.
- [ ] Moverporarchivo/carpeta/lote: impactoMarkdown, alcanceparcial ycancelación sin efectos; z150/foco/44px/móvil; cambio deproyecto/cierre de diálogo nopublicael lote. PATCHTauri mover/renombrar aceptado.
- [ ] AppWindows/Android instalada, SAFTemplateFile16MiB/UTF8/Kotlin, lectoresPDF/Office y corpus real, corte/espaciofísico. NoGradle/UIWindows conincidenciapendiente; regresióncompleta al finalizarprograma.


## Entrega136 · Revisión local de investigación (P10/T17 pendientes)

- [ ] Informe terminal→Revisarfuentes incluso sinproveedor/IAenpausa. Abrirlocalpropio ywebsoloexplícito; fragmento/fecha soncapturados, no certificado factual.
- [ ] Elegirafirmaciones/excluirfuentes/comentar; restantesconservanreviewprevia. Preparar antesaplicar,scopecambiadoinvalidaconsent,IDsdesconocidos/duplicados/citanolocalizada visibles sinrespaldo. Legadoincompletoseavisa,sininventarclaims.
- [ ] Originalessources/evidence/findings/markdowniguales trasreview; escritorposteriornodeletahumanoverlay. CAS/stale/futuros/límites16y32MiB preservanfuentes. ACKperdido→cerrar/reabrir/GETexacto,sinreplay; fuenteactualcambiadamantieneacuseanterior ypiderevisiónnueva.
- [ ] Cierrecondecisionespendientes,subdialoginert/foco,44px/320/DPI. Corpusinvestigaciónreal yusuarios/lecturadereferencias enP10; T17real sin gastonoseejecuta hastaautorizaciónpresupuestoposterior.


## Entrega137 · Copias locales programadas (2026-11-06)

- Confirmar estado inicial desactivado, activar programación diaria explícita y cerrar ajustes; comprobar ejecución con el proceso abierto y una puesta al día al volver, sin recrear cada día omitido.
- Crear copia manual con un documento abierto modificado y comprobar que se protege antes el trabajo; revisar alcance guardado/persistido y omisiones.
- Elegir retención, cambiar inclusión de archivo privado y comprobar que una copia documental no elimina la última copia privada de mayor alcance. Parciales/desconocidos no autorizan retirada.
- Perder un acuse: consultar la misma generación sin repetirla, cerrar/reabrir ajustes y conservar el intento; un acuse tardío no borra el seguimiento posterior.
- Cambiar de vista con borrador de política y volver: conservar campos en memoria; si cambia raíz/revisión, revocar consentimientos y revisar otra vez.
- Restaurar copia íntegra/parcial/histórica tras desaparecer el origen: revisar consentimiento y abrir exclusivamente su traslado; crear proyecto nuevo sin sustituir el original ni activar programación.
- Comprobar cupos, falta de espacio, copia alterada, interrupción y estado futuro; conservar archivos desconocidos. Validación física Windows/Android pendiente en P10, sin simular aceptación instalada.

- Llenar el historial de64recibos sin retención, aceptarla después y crear generación65: retirar sólo copias anteriores compatibles con ancla revalidada y conservada; ancla alterada no permite retirar ni consumir cursor.


## Entrega138 · Usabilidad y continuidad (2026-11-06)

- Teclado completo en menús, pestañas, cuenta y árbol; Shift+Tab recorre sin abrir resultados; Escape de un menú no cierra antes su diálogo. Comprobar lector real y composición IME.
- Visor con pinza/cancelación y fuente equivalente sin reset; barra compacta conserva selección y un tabstop disponible al redimensionar.
- Alternar PDF/hojas A/B/A conserva página/zoom/consulta/scroll; cambiar raíz o huella reinicia; una navegación nueva explícita prevalece. Memoria sólo durante sesión.
- A320x480, opciones IA/búsqueda/destino/confirmación mantienen acciones44px y cuerpo desplazable. Guardar destino conserva foco/error/selección y bloquea cierre/duplicados.
- Renombrar/mover/papelera, individual o lote: revisar vínculos guardados/parciales; cancelar o cambiar de proyecto no ejecuta ni muestra error tardío en otro ámbito.
- Credencial etiquetada y error asociado; no perder valor al fallar. ES/EN y lenguaje HTML coherentes; contrastar24temas/paletas y DPI real.
- Aceptación física/humana y pruebas instaladas pendientes enP10; no sustituir por capturas o fixtures.

## Entrega139 · Escala y cierre de desarrollo (2026-11-06)

- Sistema → Opciones avanzadas: consultar tiempos locales y actualizar; distinguir runtime incompatible de cero solicitudes. Un error conserva la última observación. No aparecen rutas, documentos, prompts ni credenciales; cerrar descarta métricas.
- Buscar equivalencias Unicode, ligaduras y PDF con texto: conservar extracto original; advertir corpus parcial, errores y límites50/51. No presentar páginas escaneadas como texto reconocido ni prometer orden visual de columnas.
- Con más de200proyectos, comprobar recorrido por turnos y una sola copia admitida por pulso; programación desactivada no crea copias.
- Abrir ajustes y traslados bajo demanda; reabrir ajustes conserva continuidad. Contrastar notas grandes, respuesta de escritura y memoria sobre dispositivos representativos antes de fijar objetivos de rendimiento.
- Revincular un proyecto cuyo origen falta: revisar destino, confirmar y conservar identidad y sesiones; destino cambiado o revisión obsoleta no autoriza aplicar.
- Mantener aceptación instalada Windows/Android, actualización, SAF, cortes/suspensión, lectores de pantalla, IME, lápiz y usuarios en P10. T17 con proveedor real sigue aplazado sin gasto. Ninguna captura ni benchmark local sustituye estas comprobaciones.


## Consolidación140 · Candidata instalada autorizada, publicación excluida (2026-11-06)

La regresión local139 está cerrada; se reutilizan sus resultados mientras no cambien las entradas pertinentes. No repetir suites completas por la conciliación documental. El usuario autoriza ahora preparar y validar la candidata instalada, sin gasto IA y sin publicación. La incidencia del entorno debe diagnosticarse y resolverse antes de reintentos nativos; esta sección no afirma que ya esté resuelta.

- [ ] Registrar revisión de fuente, versión de candidata, hashes de instaladores/binarios, plataforma y entorno. Distinguir firmado/no firmado y empaquetado/instalado/aceptado sin equipararlos.
- [ ] Windows instalado: selector de proyectos, árbol y menús, pestañas, Milkdown, guardado, historial, entrada IA sin enviar a proveedores, importación/exportación, vistas previas, ajustes y controlador compacto de grabación. Conservar controles/tiempo/niveles al desplegar sesiones; preparada/grabando/pausa en dispositivos reales.
- [ ] Android instalado: arranque y edición offline, reapertura, almacenamiento/permisos/SAF, importación/exportación y notas/grabaciones en capacidades reales. Git nativo Android permanece no disponible y se informa; no simular paridad.
- [ ] Migración2.6→candidata con conjunto controlado: documentos, proyectos, preferencias, borradores, historial, imágenes/recursos, audio y tinta; comprobar bytes/identidad y reabrir. Contrastar restauración y procedimiento de vuelta mediante copia o compatibilidad documentada, sin prometer downgrade universal.
- [ ] Actualización instalada con la misma identidad de aplicación y firma compatible; preservar datos. La comprobación pública de latest.json/android-latest.json y publicación de activos siguen excluidas de esta etapa.
- [ ] Suspensión/reanudación, interrupción, espacio físico, audio/permisos, teclado/IME, DPI/lectores de pantalla, lápiz/tacto y rendimiento representativo; registrar casos no ejecutados. Piloto U16 con personas reales permanece separado de la automatización.
- [ ] Conservar T17 real aplazada sin gasto; no enviar documentación personal ni activar proveedores para sustituirla. Documentar límites de5.000archivos/búsqueda parcial, PDF sin OCR automático y capacidades de audio/tinta condicionadas.

Sólo marcar resultados realmente observados y asociados a la candidata concreta. El coordinador incorpora evidencia y límites al reporte de la entrega; una captura de desarrollo o un cargo check no sustituye una aceptación instalada.


## Resultado QA instalado140 · Etapa acotada cerrada, no aceptación de release productiva

Esta tabla concreta el alcance observado y no marca como superadas las casillas amplias anteriores que incluyen hardware, migración productiva o personas. Evidencia Windows definitiva: output/candidate-windows-package-final-140.json y output/candidate-windows-final-install-140.json; UI de runtime reutilizada: output/candidate-windows-ui-140.json. Los registros iniciales de empaquetado/instalación se conservan como pasos intermedios. Candidata3.0.0, fuente del runtime736e7484 y datos sintéticos; el ajuste WXS posterior sólo afecta a empaquetado.

- [x] MSI Windows C1 final reinstalado, exit0, identidad/UpgradeCode/perfil separados y proceso normal2.6 conservado; clave de licencia OFL/HKCU resuelta y licencia instalada coincidente. MSI SHA256DAC25F7BEFA709546C788B8831A09A183455E0BF36AB2B92949314A683C24845. No se usa el hash inicial como candidata definitiva. Sin firma updater de distribución.
- [x] Ventana activada y puente Tauri real con healthok, versión3.0.0 y appDataDir ai.knownext.desktop.v3candidate; no interfaz de desarrollo con transporte simulado.
- [x] Botón Guardar escribe el Markdown en disco y limpia dirty/draft. Guardado por teclado comprobado mediante Ctrl+Shift+P → Guardar documento activo → Enter; no se afirma Ctrl+S ni Tab+Enter.
- [x] Vista previa SVG cargada, navegación de ajustes y vuelta visible al documento; diagnóstico local sin inicio de proveedor.
- [x] Reapertura tras detención forzada posterior a guardado durable: Markdown idéntico, testigo conservado y documento limpio. No acredita salida normal con borrador pendiente, cierre con cambios ni recuperación de trabajo no guardado.
- [x] Android QA final: paquete3.0.0/3000000 instalado en emulador API36/x86_64, mismo UID/certificado debug, testigo intacto tras actualizar QA. APK instalado coincide por SHA256 con el verificado por apksigner. Edición real/botón Guardar y reapertura exacta comprobados; finalJSONreutiliza esos resultados y no escribe nuevos documentos. Evidencias output/candidate-android-140.upgrade.json y output/candidate-android-140.final.json.
- [x] Android offline antes de lanzar, sin ruta por defecto; Sistema móvil/Vista avanzada/diagnóstico visibles, retorno a básica y al mismo documento sin mutación. Tras la campaña, QA force-stopped sin workers y red restituida al estado inicial. No acredita ARM físico ni el actualizador productivo.
- [x] Paquete final e instalación enlazados por el mismo SHA256; EXE instaladoED789DC3C7420A6932A90D316A4A57294F8A6C39EC3C7D6FCD290FADAD2FE433 idéntico al contrastado, documento7EE119262B6B4328D0EA6BDF6B6E459ABF69BD98FBF7ACFA617E3CC821D92E6D conservado. Se reutiliza el recorrido UI previo sin repetirlo ni afirmar una nueva observación de todos los recorridos.
- [ ] Mantener como aceptación posterior la actualización/migración productiva con las firmas existentes, ARM físico/SAF/Keystore y fallos físicos, DPI/IME/lectores, lápiz/tacto/audio reales y personas U16. T17 real permanece aplazada sin gasto; no hay publicación.


Cierre de esta etapa QA140: Windows MSI paralelo y Android QA/emulador aceptados sólo en los recorridos comprobados anteriores. No se marcan como completas las casillas amplias que incluyen migración/actualizador productivos, firma oficial, ARM físico/SAF/Keystore/hardware o personas. T17 real continúa aplazada sin gasto; publicación excluida. P10 mantiene abiertas esas aceptaciones generales.
