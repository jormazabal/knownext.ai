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

## 3.0 · Integridad y biblioteca (en ejecución)

`knownext-storage` separa `atomic_io`, `path_policy`, `trash`, `batch` y `local_search`. Los comandos Tauri conservan el adaptador de API local; React utiliza contratos tipados en `lib/api` y `types`.

La papelera vive en `.knownext-trash` dentro de cada proyecto, con propietario, manifiestos y contenido conservado; se excluye de Git y exploración normal. El borrado ordinario envía a papelera. No hay purga automática. Los lotes guardan su plan y resultados en `file-batches` del almacenamiento de la app: preparar, revisar, verificar de nuevo y ejecutar una vez. Un estado iniciado tras interrupción exige revisión y nunca se reejecuta automáticamente.

Endpoints nuevos: `GET projects/:id/trash`, `POST projects/:id/trash/:entry/restore`, `POST projects/:id/nodes/batch/plan`, `GET projects/:id/nodes/batch/:batch`, `POST projects/:id/nodes/batch/:batch/execute` y `POST projects/:id/search/content`, todos bajo `/api`.

La búsqueda consulta Markdown guardado con límites explícitos; no es todavía un índice incremental. Únicamente la búsqueda y la lectura de estado de lote pueden eludir la cola de mutaciones en Windows mediante un handle inmutable auditado. Las escrituras mantienen la coordinación previa. Ni la atomicidad física completa ni la coordinación entre procesos externos se consideran resueltas por este corte. Ver [evidencia y límites](../product/revision-3.0-implementacion/avance-03.md).

## Command Boundary

### Credenciales y autoridad de ventanas en 3.0

`knownext-storage/credential_store.rs` posee el formato cifrado, la migración verificada y la sustitución atómica. Windows utiliza DPAPI del usuario. Android recibe un callback del adaptador JNI `android_credentials.rs`; `CredentialVault.kt` realiza AES-GCM con Android Keystore. El almacenamiento no depende de Tauri ni de React. El trabajador Android inicializa el adaptador antes de utilizar proveedores. La clase de cifrado no se expone como interfaz JavaScript.

`knownext-core/window_policy.rs` delimita la API local según la ventana suministrada por Tauri. La ventana `recordings` puede consultar salud, proyectos y árboles para elegir destino, además del contrato específico de grabación. No puede leer documentos/configuración/credenciales ni mutar el espacio general. Las capacidades Tauri separadas acompañan estas comprobaciones. Los dos handles de lectura auditada mantienen la misma identidad de ventana; no eluden autorización.

Los lotes guardan `movedFiles`, `referencesPending` y `error`. Primero mueven los elementos comprobados y después actualizan las referencias de imágenes una sola vez. No se presenta esta separación como transacción global ni como reparación automática de borradores o enlaces documentales.

Las sesiones frontend identifican la carga pendiente y su revisión base. Sus reductores rechazan respuestas obsoletas o que sobrescriban cambios posteriores. La recarga conserva el editor montado durante la espera y comunica los fallos con reintento explícito.

Ver [contraste y límites actuales](../product/revision-3.0-implementacion/avance-04.md) y [procedimiento nativo](../development/v3-native-qa.md).

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

## 3.0 · Recovery and version contracts in development

`draft_store.rs` owns private recovery file identity, bounded reads, legacy ownership checks and exclusive migration. The complete document ID is SHA-256 keyed; lossy filenames do not establish ownership. Conflicting variants and malformed copies are preserved and reported. `document_recovery.rs` owns Markdown/ink records, the original draft baseline, save acknowledgement and orphan recreation. An unverified legacy baseline requires an explicit choice before replacing the disk file. Cleanup errors after a committed save return the committed record and `recoveryWarning`.

`version_history.rs` reads document versions and blobs from local Git. It follows the rename reported by Git and resolves historical content at the corresponding path. New versions commit the saved file, without reading the recovery overlay or writing a second history cache. Old cache files remain untouched; old IDs are accepted only after checking their project, Git history and exact content. This does not certify arbitrary legacy caches or every rename/copy topology.

`POST /api/documents/{id}/versions/{versionId}/restore` requires `baseFingerprint`; a missing base returns 400 and an externally changed file returns 409. A successful file restoration returns `savedDocument`, optional `version`, `historyWarning` and `recoveryWarning`. A Git failure after writing the file is a partial result, not a false assertion that nothing changed. The frontend preserves newer typing and reports the pending history step.

`app/sessionWriteQueue.ts` serializes draft/save/cleanup operations for each document. Queued timer revisions are checked again when they execute; draining reads the live sessions. This frontend ordering does not yet replace the runtime-wide mutation queue or coordinate independent app instances. See the [current implementation evidence](../product/revision-3.0-implementacion/avance-05.md).

`file_moves.rs` checks recovery collisions before a move and migrates draft identity by exclusive creation and verified retirement. Cleanup errors after moving return `warnings` and `recoveryPending`; they do not hide the completed physical move. Reviewed batches validate every recovery destination before the first mutation and retain partial results.

`knownext-docs::markdown_destinations` uses pulldown-cmark source positions to identify destinations without serializing the document again. `document_links.rs` rewrites local paths while preserving titles, anchors and queries in the verified corpus. `file_references.rs` updates disk and recovery overlays, advancing only an exactly matching verified base. It returns confirmed `affected` snapshots and warnings when later documents cannot be processed. This is not an all-files transaction or an inter-process lock.

Affected Markdown entries may include `referenceUpdated`, `previousMarkdown` and `document`. `app/fileSessionChanges.ts` accepts the snapshot only when its previous content matches the current session; otherwise it preserves the newer content and requires conflict review. Late batch snapshots can also address an already remapped identity. See [native and automated evidence](../product/revision-3.0-implementacion/avance-06.md).


### Contexto de documentos · desarrollo 3.0
`GET /api/documents/{id}/links` es una instantánea independiente del contenido guardado. `document_references.rs` devuelve destinos tipados, alcance, huella, fecha de consulta, cobertura y avisos; no consulta proveedores ni mezcla borradores. `local_corpus.rs` comparte límites de lectura con búsqueda. Los límites actuales no sustituyen un índice persistente ni acotan todavía la reescritura durante movimientos.
`project_capabilities.rs` comprueba Git en escritorio con espera acotada; Android declara que no dispone de Git local integrado. La UI consume esta capacidad y no exige login para trabajar con archivos locales.
La visibilidad contextual deriva de la preferencia mediante `useContextVisibility`; la hidratación conjunta de proyecto y configuración no introduce un segundo estado de fijación que pueda cerrar el panel recién restaurado.


### Revisión de recuperación · desarrollo 3.0
`recovery_review.rs` sirve `GET /api/recovery/drafts` y `/api/recovery/archives`; ambas consultas son instantáneas auditadas, sin migración. El inventario limita entradas/bytes y comprueba tiempo entre archivos. La lista compatible `/api/drafts/orphans` usa el mismo inventario, aunque su contrato antiguo no expresa cobertura parcial; el centro nuevo sí la muestra.
`POST /api/recovery/drafts/{key}/preview|copy|archive` exige la huella de la copia revisada. `source=archive` solo permite revisar o copiar un archivo cuyo contenido coincide con su manifest. Copiar crea exclusivamente un archivo nuevo en la raíz del proyecto elegido. Apartar escribe y verifica `drafts-review/<id>/copy.json` y su registro antes de intentar retirar la fuente; no hay expiración automática ni eliminación del archivo privado desde esta entrega. Las copias son locales y privadas; no son una copia portátil ni externa.
El extracto acotado de Markdown se obtiene en `knownext-docs::markdown_excerpt`, con texto sin HTML ejecutable ni carga de medios. La UI mantiene selección, campos y errores dentro de la confirmación. Las consultas auditadas no sustituyen una cola de trabajos largos ni la coordinación entre procesos; la operación compatible de huérfanos también es una lectura auditada desde el corte 09.


### Lecturas de recuperación sin espera de mutación · corte 09
GET /api/recovery/drafts, GET /api/recovery/archives y GET /api/drafts/orphans son lecturas auditadas. La prueba runtime mantiene ocupada la autoridad de mutación y exige respuesta de las tres y de búsqueda. Crear, copiar, apartar y ejecutar lotes siguen requiriendo autoridad de mutación. No se declara completado el planificador de trabajos largos.

### Critical local state · 3.0 work
`knownext-storage/local_state.rs` protege lecturas y escrituras de `config.json`, `export-template.json` y `projects.json`. Ausencia permite valores iniciales; JSON/estructura inválidos, versión incompatible, enlaces, lectura denegada o más de 8 MiB bloquean la escritura. GET normaliza preferencias en memoria sin reescribir el origen. Las entradas IA y el ejecutor de investigación verifican la configuración antes de continuar; la coordinación de trabajos ya en curso sigue pendiente.

`GET /api/recovery/state` devuelve identidades fijas, estado, diagnóstico y huella, sin bytes originales. `POST /api/recovery/state/{config|export}/reset` exige la huella revisada, conserva bytes y manifiesto en `state-recovery/<id>/`, verifica la copia y vuelve a comprobar el origen antes del reemplazo atómico. No es un CAS entre procesos. Las versiones futuras y el registro de proyectos no se restablecen con esta acción. La copia hereda la privacidad del almacén local, sin cifrado adicional ni vencimiento automático; no copia los archivos de credenciales/conversaciones y queda excluida de backup/transferencia Android. La gestión de retención/restauración de este archivo privado y la extensión a otros estados siguen abiertas.

### Espera principal de IA y resultados por revisar · corte 12
`ai_interaction.rs` prepara bajo la autoridad de mutación, espera la respuesta principal de `knownext-ai` fuera de ella y vuelve a obtenerla antes de aplicar. Una segunda cola conserva una sola interacción IA en curso; nunca se espera esa cola reteniendo mutaciones. El contrato incluye `activeDocumentBaseFingerprint`; los borradores requieren su base guardada y una petición en cola no puede adoptar silenciosamente una base posterior. Una coincidencia exacta con el texto ya guardado permite recoger un ACK retrasado. Las credenciales del trabajo preparado no se serializan ni exponen al frontend.

La aplicación contrasta raíz canónica, política de ejecución y bases guardadas; un cambio bloquea salidas mutantes, conserva el consumo registrado y no repite al proveedor. Las creaciones deterministas repiten permiso, exigen un nombre Markdown en una carpeta existente y crean exclusivamente. `runtimeApplied` se retira de la salida del modelo y lo asigna el runtime al crear; el error parcial conserva esos cambios y el fallo posterior. La llamada adicional de generación de imágenes, el cálculo local de trazos y las conversiones largas todavía requieren separación; tampoco se declara resuelta toda la autoridad de operaciones devueltas por IA.

El frontend captura la base RAM y la época del proyecto. Una respuesta tardía no reemplaza texto/trazos posteriores ni cambia el proyecto visible. Milkdown contrasta el documento real con la instantánea publicada junto al Markdown; no lo compara con un parseo nuevo que perdería atributos internos. La propuesta queda pendiente hasta recibir ACK del editor y una aplicación fallida nunca hace un reemplazo alternativo del contenido.

`ai_results.rs` conserva solo campos de salida seleccionados en `ai-results/<sha256-id>.json`, sin añadir el sobre de petición, prompt, fuentes ni claves. El contenido generado puede reproducir información de sus fuentes. Es almacenamiento privado local sin cifrado adicional ni expiración automática, excluido de backup/transferencia Android. `GET/POST /api/ai/results`, `DELETE /api/ai/results/{id}` y `POST /api/ai/results/{id}/copy` sirven revisión, conservación, retirada explícita y copia al proyecto de origen. El hash de raíz de `originProjectRootHash` lo añade el runtime tras la respuesta; una raíz cambiada impide copiar allí. La copia usa identidad estable, creación exclusiva y repetición sin duplicados solo si los bytes siguen iguales; nunca reemplaza ediciones nuevas. Retirar un resultado no elimina sus copias documentales.

Límites: 32 MiB por registro, 64 MiB/256 entradas por revisión, 128 salidas por registro y validación acotada de páginas/trazos. Las entradas dañadas y las que exceden el inventario se conservan y se informa de cobertura parcial. Su gestión manual/archivo sigue pendiente. Un fallo al conservar mantiene la salida en RAM y lo indica; esto no prueba recuperación ante cualquier interrupción previa al ACK de conservación. El adaptador web usa datos de navegador y no acredita archivos nativos.


### Borrador durable y salida rechazada · corte 13
La preparación y aplicación IA contrastan revisiones del borrador local además del archivo guardado. El ACK del mismo contenido es válido; el timestamp raíz manuscrito añadido al conservar no representa otros trazos. Los hashes locales se retiran antes del proveedor. El runtime fija la revisión de texto, valida tipos/destinos/permisos y no acepta acuses/árbol/assets del modelo. Antes de bloquear una salida útil, conserva un registro output-only y devuelve `retainedResult: {result,stored,error?}`; React adopta ese acuse. Un fallo de conservación deja RAM/aviso. Esta garantía aún no cubre todo fallo parcial de assets ni el ciclo durable de propuestas manuales.


### Fases interactivas de imagen y trazos · corte 14
`ai_interaction/images.rs` prepara credenciales y solicitudes inmutables; las llamadas salen del mutex de mutaciones y conservan la cola IA única. Se contrasta autoridad antes de cada llamada adicional y al aplicar. La función singular solicita una imagen; el límite acota operaciones distintas. `drawings.rs` captura nota activa y calcula localmente sin bloquear escrituras; el borrador se conserva después de repetir sus guardas. El runtime no ejecuta varias sustituciones de dibujo sobre la misma base.
`ai_results.rs` admite raster PNG/JPEG/WebP con base64 acotado a 16 MiB y firma de bytes; conserva solo contenido de salida. La copia crea exclusivamente un raster con extensión validada y verifica bytes al repetir. La imagen recibida y su uso se conservan ante rechazo/fallo del destino; la persistencia de uso mantiene sus propios límites. El acuse de asset no acredita insertar texto en el documento. Investigación y conversiones mantienen su revisión separada.


### Exportación comprobada y entrega Android · corte 15
`knownext-docs::export_pdf_with_assets_and_template` devuelve `Result` y usa el mismo renderer local en Windows y Android. Fuentes Noto sin modificar, licencia y procedencia en `assets/fonts`; no depende de fuentes instaladas. Un carácter, imagen o composición todavía no representable produce error. El wrapper de previsualización devuelve un PDF de diagnóstico, nunca una abreviación presentada como exportación. El runtime usa exclusivamente el contrato comprobado; DOCX propaga errores en vez de devolver bytes vacíos. Las tablas anchas se desglosan por registro y las filas altas continúan en páginas sucesivas. Hay presupuestos de bytes y píxeles; no se promete aceptar cualquier tamaño o escritura.

`export_execution.rs` captura contenido y recursos bajo la autoridad de mutación, convierte fuera de ella en una cola propia y vuelve a contrastar proyecto/destino al publicar. El documento puede seguir editándose: se exporta la instantánea al pulsar. No se permite usar el archivo fuente como destino; crear exige ausencia y reemplazar exige la huella revisada, con escritura atómica. No constituye un CAS entre procesos. Recursos remotos no se descargan. Los límites/errores de composiciones no soportadas se muestran sin omitir contenido silenciosamente.

En Android, `export_document_mobile` valida ventana principal y ruta exacta de exportación; Rust conserva un temporal privado hasta el acuse del plugin `knownext-exports`. `ExportPlugin.kt` obtiene la URI con `ACTION_CREATE_DOCUMENT`, escribe mediante ContentResolver fuera del hilo UI y confirma tras cerrar la salida. React no proporciona URI ni ruta de temporal. Cancelación y guardado tienen estados distintos; solo un guardado confirmado ofrece Abrir mediante un identificador efímero de esta sesión. Un fallo de escritura puede dejar un archivo parcial en el proveedor elegido y se comunica; el original se conserva. Persistencia del acceso directo, todos los proveedores de documentos e interrupciones del proceso mantienen aceptación propia.


### Plantillas documentales de texto · corte 16
`knownext-storage/document_templates.rs` conserva un catálogo personal explícito y ofrece las cuatro plantillas iniciales sin depender de la salud de ese catálogo. Contratos `GET/POST /api/document-templates`, `GET /api/document-templates/{id}` y `POST .../{id}/{preview|create|retire}`. Captura admite únicamente nombre, descripción y Markdown; rechaza campos de estado ajenos. Registros schemaVersion 1, ID nativo, archivo nombrado por SHA256 del ID, revisión por bytes serializados y fecha nativa. Lecturas regulares/no enlazadas, 1 MiB de Markdown, 2 MiB de registro, 256 entradas y 16 MiB de inventario. Daño, versiones incompatibles, nombres personales duplicados y presupuesto agotado no se convierten en defaults escribibles; los originales se conservan y las plantillas iniciales siguen disponibles.

Variables `{{nombre}}` con letras ASCII minúsculas, dígitos y guion bajo (hasta 40 bytes, 32 claves). Sustitución única, sin evaluar valores ni volver a expandirlos; `\{{literal}}` se mantiene literal. Valores de hasta 16 KiB, documento resultante de hasta 2 MiB. Título, fecha y proyecto tienen valores predeterminados en Rust. El servicio frontend entrega el día de calendario del dispositivo como `localDate` validado por Rust; la vista previa devuelve valores resueltos que se reutilizan al crear, sin recalcular la fecha entre revisión y creación. Los consumidores directos que omiten localDate usan fecha UTC. No hay llamada IA. La portabilidad actual exige enlaces web e imágenes embebidas; recursos locales e imágenes remotas se rechazan antes de guardar. `MarkdownDestination.is_image` distingue imágenes/referencias/HTML y los autolinks se incluyen en el análisis.

Las plantillas personales exigen revisión vigente y `projectRootHash` emitido por la vista previa antes de crear. Cambiar la raíz impide reutilizar ese acuse. Las plantillas iniciales rápidas mantienen su recorrido sin previsualización obligatoria, con proyecto/destino validados en la ejecución. Crear usa el servicio documental y creación exclusiva; no reemplaza un archivo existente. No se acredita coordinación CAS entre procesos. Retirar exige la revisión observada, conserva bytes en `document-templates-retired` y no toca documentos derivados. Ambos directorios privados quedan fuera de backup y transferencia automática Android; sin cifrado adicional ni expiración automática. Importación/exportación, restauración del archivo, recursos locales y plantillas de proyecto continúan pendientes.


### Corte 17 · transferencia revisada de plantillas
Formato portable `knownext.document-template`, versión 1: solo nombre, descripción y Markdown. Inspección estricta y SHA de los bytes antes de importar con nombre explícito y nueva identidad local; sin sobrescritura de catálogo. Lectura real limitada a 2 MiB, UTF-8 estricto, versiones futuras/campos extra rechazados y original conservado. Windows selecciona y lee en Rust; Android usa ACTION_OPEN_DOCUMENT/ContentResolver. Exportación fija revisión, temporal privado hasta ACK nativo y acciones compactas de 44 px. La UI muestra revisión visual y archivo completo antes de confirmar. Windows crea solo un archivo nuevo; un fallo de entrega Android exige revisar un posible parcial del proveedor. No detecta secretos escritos dentro del texto: hay que revisar el contenido antes de compartir. Cero credenciales/configuración adjuntadas por la aplicación. Validación nativa y límites en avance-17 cuando se complete la campaña.


### Corte 18 · conservación y comprobación
C18: las salidas de propuestas Markdown que requieren confirmación se conservan en Rust antes de devolver la respuesta, también cuando no se rechaza la aplicación. Se reutiliza retainedResult como acuse nativo; el modelo no puede suministrarlo. Solo salidas y contexto de origen no ejecutable, sin prompts, bases privadas ni offsets. Política directa normal no añade esta retención automática. Fallo de escritura/cuota mantiene la salida en la sesión con stored=false/error. Cuotas de escritura: 256 entradas, 64 MiB reales, 32 MiB por registro; originales desconocidos/futuros/dañados se preservan, bloquean ampliación si no se verifican y no se siguen enlaces. Identidad ya conservada permite ACK idempotente aun con cuota llena.


### Paquetes documentales de proyecto · corte 19
`knownext-storage/project_transfer` separa manifiesto/rutas, lectura y escritura ZIP, instantánea de fuentes guardadas, recibos persistentes y trabajo largo. `document_validation::handwritten` reutiliza la misma validación de trazos que las salidas IA. No existe servicio HTTP ni proceso auxiliar del producto.

Formato `knownext.project`, schemaVersion 1; archivo `*.knownext-project.zip`, manifiesto estricto `knownext-project.json`, rutas relativas y tamaño/SHA256 por archivo. Se incluyen Markdown, imágenes, .knote, adjuntos/recursos admitidos y carpetas vacías. Se excluyen rutas internas/ocultas, Git y formatos no admitidos con informe. No se adjuntan ajustes/credenciales del runtime. El contenido escrito por la persona puede incluir datos personales y metadatos propios: revisión explícita, sin detector automático de secretos ni firma de autenticidad.

Presupuestos: ZIP y bytes descomprimidos 128 MiB, archivo individual 32 MiB, manifiesto 8 MiB, 10.000 entradas, preparación privada 384 MiB y un trabajo pendiente por proceso. Se precomprueba el directorio central antes de `ZipArchive`: sin ZIP64, cifrado, enlaces, comentarios ZIP ni bytes finales ambiguos; solo Stored/Deflate. Rechaza rutas absolutas, parent/drive/ADS, nombres Windows reservados, entradas desconocidas/faltantes, duplicados por caso/NFC, tamaño/SHA/CRC incorrectos y esquema futuro. No se usa extracción genérica ni se siguen enlaces.

`GET/POST /api/project-transfers`, `POST .../{id}/cancel` y trabajo serializado `POST .../{id}/{prepare|commit|discard}`. La cola de trabajo/entrega es independiente del mutex global de mutaciones; instantánea, compresión/verificación, copia de origen y hash se ejecutan fuera. Solo la transición final de revisión a commit/entrega y el registro del proyecto toman autoridad corta, compartida con cancelación. Cancelar solicita interrupción entre lecturas y puede esperar una lectura del proveedor; no se anuncia cancelación instantánea. No hay coordinación CAS entre instancias.

Los recibos schemaVersion 1 viven en `project-transfers/<sha256-id>/job.json`, con escritura atómica y lectura estricta de hasta 16 MiB. Daño/futuro/no regular se conserva y bloquea otra preparación. La respuesta pública entrega inventario, huella, ID y fase, nunca ZIP base64, raíz privada, URI ni ruta de preparación. Solo la ventana principal puede invocar `pick_project_package`/`export_project_package`. Windows usa diálogo y copia Rust; Android ACTION_OPEN_DOCUMENT/ContentResolver copia con límite durante lectura a una reserva privada Rust, luego Rust verifica y extrae. La entrega Android reutiliza ACTION_CREATE_DOCUMENT con temporal basado en archivo hasta ACK; Windows solo crea un destino nuevo.

Importar confirma la misma huella, repite verificación del contenido preparado y crea una identidad y carpeta nuevas. La reserva se publica con su recibo de propiedad; el contenido completo se traslada mediante rename dentro del almacenamiento local antes del registro. Un fallo conserva `pending_registration`; reintentar registra la misma carpeta, sin copiar otra vez sobre ediciones nuevas. Un recibo completado no recrea un proyecto retirado. No se cambia el proyecto activo: el trabajo actual sigue abierto. Cerrar tras completar retira solo la preparación privada. Un proyecto copiado pendiente de registro no se elimina mediante Descartar.

Las referencias Markdown locales se adaptan determinísticamente en la instantánea privada a las rutas/caso reales, se informa del ajuste y se conservan fuentes. Recursos ausentes o fuera del presupuesto de análisis se informan; no se descargan. URLs internas de visualización no se exportan silenciosamente. .knote mantiene sus bytes verificados; el runtime vincula la identidad de la representación cargada a la ruta/proyecto de destino sin reescribir el archivo al leerlo. Historial, grabaciones, borradores, preferencias y otras extensiones de portabilidad siguen pendientes.


### Continuidad de la revisión y carpetas · corte 20
`POST /api/project-transfers/{id}/review` conserva el nombre provisional de una importación preparada mediante ID + SHA revisada. Contrato estricto, sin campos/rutas ajenos; permite vacío/incompleto para no transformar cerrar en validación final ni importación. Solo actualiza recibo Ready/Import, no crea carpetas ni modifica el registro de proyectos. La confirmación conserva la validación del nombre final. El ACK debe preceder al cierre; un error mantiene la revisión y el campo para repetir.

El nombre propuesto de entrega procede del proyecto del manifiesto, con caracteres portables, longitud acotada y prefijo alternativo para reservados Windows. Conserva extensión .knownext-project.zip y creación exclusiva. La cancelación de un selector de destino conserva Ready y se comunica explícitamente en la sesión, sin acuse de guardado.

Las referencias guardadas distinguen `target.kind = folder` para directorios regulares, incluso con extensión .md. Metadatos regulares y guardas de ancestros rechazan enlaces/reparse points y rutas fuera de raíz; los destinos no verificados no ofrecen navegación. La consulta conserva sus límites y alcance de Markdown guardado. No se amplía a escritura ni apertura de URI del sistema.


### Ámbito común y recibos de vista · corte 25
request_scope valida identidad portable registrada y raíz absoluta antes del gateway, dispatch local y resolución. Rechazos estructurados de ámbito conservan registros desconocidos; retirada idempotente mantiene su frontera de catálogo, sin eximir recursos. Assets con ID de documento deben pertenecer al proyecto de la ruta. preview_store admite legado/v1 conocido de hasta 8 MiB, sin campos desconocidos/duplicados, ID/propietario/ruta concordantes y fuentes regulares PDF/DOCX/XLSX; directorio/recibo sin enlaces. Escritura exclusiva y lectura sin reescritura; formatos futuros se conservan. No acredita CAS entre procesos ni fidelidad/frescura integral de conversión.

### Importación de archivo · corte27
file_imports valida antes de crear: única hoja portable, destino registrado,32MiB, UTF-8/nota conocida y cabecera/dimensiones raster. Comparación de nombres Unicode/case y creación exclusiva conservan existentes. API rechaza colisión por defecto; collision=keep-both devuelve copia nombrada, SHA y recibo committed. Después de persistir, error de snapshot deja treeAvailable=false con advertencia; consumidores conservan el árbol anterior. Conteos todavía no consultados son null. portable_paths centraliza componentes con la política de transferencia; no se añade reemplazo destructivo ni ledger/cancelación que no existan.

### Hitos del historial · corte28
history_milestones guarda anotaciones v1 por proyecto en history-milestones/<projectId>.json, regular/no enlazado, máximo8MiB/10.000 marcas. Identidad SHA del commit completo y ruta histórica, sin usarla como autoridad de filesystem. GET documents/<id>/history combina historial Git y estado independiente de anotaciones; futuro/dañado no oculta versiones ni se sobrescribe. PUT/DELETE versions/<id>/milestone exige presencia de revision (null solo para almacén ausente), compara SHA y valida pertenencia; acuse tras escritura atómica existente. No reescribe commits/documentos. GET history/versions/content auditados pueden ejecutarse independientes de mutaciones. No promete CAS entre procesos ni exportación de estas anotaciones.

### Favoritos de acceso rápido · corte29
favorites/<projectId>.json usa esquema v1 estricto,1MiB/256 entradas, ID estable, fecha, ruta portable y tipo de archivo. GET /projects/<id>/favorites no crea almacenes y calcula disponibilidad por metadatos regulares sin enlaces. POST con path/revision y DELETE con ID/revision rechazan revisiones obsoletas y preservan formatos desconocidos. No almacenan contenidos. Renombrados/movimientos simples y lotes remapean rutas ejecutadas; un fallo de anotación se devuelve como favoritesPending/advertencia, sin ocultar el traslado confirmado. Borrado externo/papelera conserva el marcador ausente; restauración a la ruta original lo hace disponible. No se adivinan renombrados externos ni se promete CAS entre procesos.

### Diagnóstico técnico privado · corte30
diagnostics unifica logging de LocalApi/Tauri. logs/diagnostics-v1.json admite v1 estricto con hasta1000eventos/512KiB, IDs/fechas válidos y enums de nivel/operación/código. No persiste texto libre. read_config_checked gobierna traceLoggingEnabled; desactivado no crea archivos. Writer atómico serializado por exclusión propia, sin bloquear mutaciones documentales. Tauri ejecuta consultas/escritura en spawn_blocking. GET runtime/diagnostics exporta solo metadatos permitidos; registros heredados no se leen/copian/exportan. Futuros/dañados/enlazados se conservan y generan error de consulta/escritura. No hay telemetría ni borrado automático de logs heredados ni CAS entre procesos.

### Disponibilidad de historial · corte31
GET documents/<id>/history añade history con estado ready/disabled/not-initialized/unavailable, recordingEnabled, motivo estático y canConfigure. Valida documento/proyecto antes de consultar. Plataforma sin Git evita ejecutables ausentes; repositorio existente sigue consultable aunque no se creen versiones en guardados normales. Un fallo de lectura de Git disponible sigue siendo error. No cambia archivos, configuración, repositorios ni endpoint legacy. El estado de anotaciones sigue independiente.


Búsqueda local comparte un recorrido acotado Markdown/.knote para transcripciones de páginas presentes v1; referencias conserva recorrido Markdown. Resultados de nota incluyen kind/pageId/pageNumber/line; no se indexan coordenadas ni JSON técnico. Texto manual de página usa guardado normal y no implica reconocimiento OCR.


C33: GET/POST /api/storage/preview-cleanup revisa/elimina únicamente recibos regulares compatibles de previews con proyecto registrado y fuente regular accesible. GET independiente sin crear almacén; POST serializado, selección SHA, presupuestos y resultados por entrada. Formato futuro/dañado/cambiado se conserva. El campo legado cleanupAvailable=false del mapa sigue refiriéndose a limpieza genérica; esta operación específica tiene endpoint y alcance propios.


C34: POST /api/projects/:id/location/review devuelve revisión de asociación de carpeta externa. PUT de proyecto exige locationReview (registryRevision/folderStamp/candidatePath) al cambiar folderPath y pausa versioningMode/syncMode, conservando GitHub y storageMode anteriores. No mueve fuentes. Gateway coordina con comandos de audio y rechaza sesiones pendientes del mismo proyecto; Android mantiene carpetas gestionadas y transferencia, sin revinculación externa.

### Reconstrucción del índice local · corte39
LocalApiState usa una cola propia para index_rebuild. El clasificador normaliza método/segmentos de ruta y separa solo POST /api/projects/:id/ai/index/rebuild. Se prepara asociación/raíz canónica/revisión bajo mutex, se calcula corpus fuera y se valida de nuevo antes de publicar. Otra generación, limpieza o asociación distinta conserva el estado actual y rechaza el resultado antiguo. Preferencias se mezclan sobre lectura actual. Lectura/validación del índice existente y publicación permanecen bajo mutex; no se promete ausencia total de espera ni prioridades generales.

Corpus acotado y extracción Office de bytes acotados; un límite/error conserva el índice previo. Presupuesto cooperativo no interrumpe llamadas del sistema; no hay instantánea atómica frente a editores externos ni CAS entre procesos. El índice conserva su esquema conocido y no incorpora PDF/OCR/proveedores.


### Preparación de imágenes y catálogo documental portable
`document_templates/resources` prepara sin mutaciones una instantánea de imágenes locales desde documento registrado y Markdown capturado. Resolución mediada por política del proyecto, lectura/decodificación limitadas, comparación de bytes y salida final acotada; no HTTP. `document_templates/catalogue` exporta selección de revisiones conocidas y revisa/importa entradas explícitas con resultados por elemento. Inventario incompleto/futuro bloquea ampliaciones; colisión conserva ambos contenidos y no reemplaza. Capacidades/entradas se validan antes de crear; escritura exclusiva por archivo, parcial honesto ante error y observación de contenido idéntico. `template_transfer` comparte transporte con ventana autorizada, sin mantener mutex durante el picker; comando nuevo `export_document_template_catalog`. No proceso auxiliar ni formato privado nuevo para recursos.


### Núcleo, despacho y contabilidad
`api_routes.rs` es propietario de `LocalApi::handle/content`; mantiene API y orden de despacho existentes. `ai_usage.rs` es propietario de registro/resumen de consumo y auxiliares de agregación/mes. Servicios del mismo crate acceden a los métodos con visibilidad al padre; no API pública nueva ni formato nuevo. `lib.rs` conserva la composición y dominios legados pendientes de separar. El traslado se contrasta mediante comparación de cuerpos; pruebas de comportamiento se reservan a los helpers de fechas cambiados. Meses ASCII válidos01–12 y prefijos obtenidos sin cortes UTF-8 inseguros.


### Consumo local por periodo y proyecto
`GET /api/ai/usage/summary` admite projectId portable opcional y mes UTC; no accede al contenido del proyecto ni requiere que siga registrado. Opciones incluyen registro/retirados y referencias históricas, con límite256 y señal de nombres incompletos. Respuesta añade alcance, cobertura retained-local-records, límite/entradas conservadas, registros sin periodo y totales de interacciones/tokens. No cambia formato duradero del ledger por esta consulta. Store::Usage valida números/versiones/mes antes de lectura/escritura; agregación comprueba límites y conserva fuente ante error. Cada modelo/capacidad indica unpricedEntries. `update_ai_research_job_checked` ejecuta callback Result antes del timestamp/escritura, conservando extensiones o números incompatibles. Consulta independiente de mutaciones; no provider ni conversión de red al leer. Ventana5000 sigue identificada como límite de cobertura, no factura completa ni base definitiva de presupuestos.


### Ledger de consumo2
`ai_usage/ledger` posee formato, checksum, límites y transición con origen revisado/copia exacta. `ai_operational_state::snapshot` devuelve valor validado y bytes de origen; admite2 de consumo sin ampliar los formatos de otros almacenes. Guardas de lectura64MiB para2/32MiB legado. Una escritura incluye detalle y agregados, bajo usage_gate; revisión preparada evita relecturas redundantes y la fuente se comprueba antes de sustituir. float_roundtrip está habilitado para mantener floats al serializar/reabrir el formato con checksum. `GET /api/ai/usage/ledger` no muta; POST ledger/upgrade requiere revisión observada y admite observación idempotente del origen convertido. Preflight puede convertir conocido antes de proveedor, con todos los almacenes de investigación leídos antes de efectos. Agregados no son factura completa; cobertura heredada sigue explícita. Las copias se contabilizan como recuperación.


### Variantes verificadas: portabilidad y representación local
`conflict_attempts/portable` proyecta3/4 copias vinculadas y fuente histórica de la propuesta a contenido documental; `project_transfer/recovery_package` emite el formato estándar1 que importa el flujo ordinario en otro proyecto. Revisión/digest y congelación Rust antes del selector, comando Tauri `export_conflict_package`, escritura nueva con comprobación; sobres privados y autoridad quedan locales.

`conflict_attempts/retention` gestiona solo recibos completados/archivados y payloads verificados. `recovery_copy_storage` admite `copy.json` y ZIP privado de una entrada al faltar aquel; SHA original sigue referido a bytes expandidos. Compactar/expandir crea sin sustituir, verifica y retira exclusivamente la representación redundante. Admisión de mutación exclusiva no bloqueante en proceso; propietario de runtime del estado entre procesos nativos. Lectura nunca repara/continúa. Fuente8MiB, ZIP8MiB+64KiB, revisión256MiB acumulados de lecturas/expansiones; ahorro mínimo10% para preservar margen de lectores acotados. Cuotas/IDs de recibos no se liberan. No es copia externa ni CAS frente a editores externos.


### Aplicación recuperable de selecciones mixtas
`remote_conflicts/project/mixed/application` posee recibo1/payloads antes/después, revisión, aplicación4 escrituras, continuación y cierre. Rutas JSON bajo `/api/projects/{p}/sync/mixed-selections/{id}/application`: GET consulta; POST review/start/continue/copy/close. Copias32MiB, payload8MiB, recibo256KiB,64 preparaciones/256MiB por proyecto; lectura de trabajo64MiB por etapa. No toca índice/HEAD ni adopta borradores. `mixed_application_guard` usa exclusivamente `.knownext-mixed-work/pending.json` con exclusión Git; no modifica coordinación/locks. Servicios nativos de commit/sync consultan admisión, liberada solo al completar/cerrar con copias conservadas. Frontera cooperativa: otras versiones/programas no quedan bloqueados por este marcador. App captura/protege editores antes; controlador progresa solo con acuses, consulta sin reenvío al perderlos y respeta ámbito/pausa.


### Retención de payloads y revisión monotónica
`mixed/application/retention` gestiona representaciones de aplicaciones cerradas sin tocar fuente/recibos. `recovery_copy_storage` separa entradas ZIP conocidas copy.json/payload.bin sin interpretar los bytes de recursos. Lector de aplicaciones acepta .bin/.bin.zip y ambas; hashes siguen referidos a expansión exacta. `retention_generation` guarda revisión monotónica por familia/ID en retention-generations, antes de efectos, para evitar que una solicitud pasada vuelva a ser actual tras un ciclo; también aplicado a conflict-attempts. Ficheros1KiB y cohorte20.000/16MiB, sin poda automática; revisión futura bloquea mutación pero la recuperación de payloads conocidos permanece independiente. No es autenticación ni libera cuotas de identidad.


### Respaldo completo de variantes · bloque104
`mixed/application/backup` congela y verifica ZIP; comandos `export_mixed_backup`/`verify_mixed_backup` usan selectores nativos fuera del hilo UI. `stage_user_export_bytes` prepara ZIP privados sin base64. Windows compilado; nuevo selector Android Kotlin pendiente por bloqueo Java/Gradle.


### Retirada revisada y separación de servicios ·105–106
`retire_mixed_payloads` usa selector de respaldo y servicio Rust bajo admisión por proyecto. `project_sync` y `external_changes` contienen los seis métodos/679 líneas extraídos con cuerpos/JSON idénticos. Compilación Windows conjunta correcta; no aceptación instalada.


### Recuperación incompleta, dominios y teclado ·109–111
`asset_queries`, `preview_queries`, `research_workflow` separan40 métodos/1.568 líneas de lib.rs con cuerpos idénticos. `export_incomplete_mixed` exige workspace y delega congelación a Rust, con selector/transporte existentes. Compilación final Windows correcta; Android/SAF no acreditado.

## Instantáneas de páginas e inserción viva ·112
`handwritten_assets.rs` publica PNG en assets/handwritten mediante creación nueva sin reemplazo, nombre SHA256 y reutilización solo de bytes regulares idénticos. El servicio se ejecuta bajo transacción de proyecto y no guarda nota/documento/borrador. La UI contrasta revisión, visita y snapshot vivo de Milkdown; appendMarkdown inserta solo el fragmento con frontera de historial. Composición pendiente o revisión cambiada rechazan la inserción.

## Registro externo revisado ·113
GET/scan de cambios externos entrega revision SHA256 efímera de proyecto/ubicación, HEAD/referencia, índice y bytes/estado del conjunto; import exige revision y decisiones explícitas únicas de todas sus identidades. La admisión es una transacción de proyecto. Presupuesto512 entradas/32MiB de contenido/8MiB por archivo/2MiB salida Git/16MiB índice. Preparación privada de bytes; commit --only desde carpeta congelada conserva preparación ajena. Altas con intent-to-add; errores posteriores requieren consultar. Atributos activos, rutas reservadas/no regulares, borradores y preparación previa seleccionada se rechazan. No es CAS conjunto frente a todos los programas externos. Cliente sin revisión consulta otra vez; sin migración persistente.

## Centro común de recuperación ·114
GET /api/projects/:project/sync/mixed-selections publica el catálogo local existente con schemaVersion1, projectId y checkedAt, sin resolver referencias remotas. SDK valida ámbito,64 entradas máximas, identidades/revisiones,256 rutas, fechas y avisos. ProjectRecoverySection se monta por proyecto y descarta resultados al desmontarse; ofrece consulta y los diálogos existentes de respaldo/retención/retirada/extracción, sin aplicación de archivos. Recuperación carga por categoría los proyectos y StorageUsagePanel; exportación es el flujo ProjectTransferDialog existente, con alcance visible. No hay selectores, limpieza ni exportación automáticos.

## Inventario y presupuesto de recuperación ·115
recovery_inventory.rs contiene metadatos acotados de15 familias (50.000 entradas/2.000 grupos/3s), sin contenido, coordinación, enlaces o autoridad derivada. GET /api/recovery/storage; PUT /api/recovery/storage/policy con revisión SHA, enabled y maxBytes16MiB–8GiB. recovery-policy.json1 estricto con generación monotónica; default desactivado. Admit serializa revisión/publicación en nuevas selecciones/preparaciones mixtas, recibos y copias de conflicto, con presupuestos conservadores. No es reserva del disco; guardados, borradores y continuaciones quedan excluidos. Familia/proyecto/plan solo habilitan otra revisión de bytes mediante el contrato nativo existente. Formatos futuros y entradas no revisables se conservan.

## Retirada de copias de conflicto ·116
conflict_attempts/retirement.rs: GET /api/recovery/conflict-attempts/:id/payloads. Exportación y retirada usan comandos nativos export_conflict_payload_backup/retire_conflict_payloads desde workspace y spawn_blocking. ZIP data-only conocido (32MiB datos/40MiB ZIP) contiene Copias/*/Contenido.json y Registro.json exactos, más Documentos.zip del exportador existente. Sin almacén de credenciales/configuración de ejecución. Diario conflict-retirements/:id.json1 previo a unlink, hash de recibo/archivo/manifiestos/representaciones y generación monotónica compartida con compactación. Archivo elegido exacto en cada continuación; nunca reparar/reanudar al consultar ni reciclar IDs. Recibo original y manifiestos permanecen; archivo/reapertura/compactación se bloquean al existir intención de retirada. Retención y generación usan gates débiles por ruta canónica de app-data; lectores de retirada rechazan operaciones en curso. Inventario global incluye esta familia16. No promete CAS frente a programas externos ni compatibilidad de ejecución con versiones anteriores.


### Archivo portable del proyecto (117)

Archivo privado opcional knownext.project2: borradores originales/editables, audio detenido asociado en WAV por partes, bundle Git alcanzable en partes verificadas y preferencias visuales permitidas. Importación a proyecto nuevo como datos, sin activar trabajos/historial/ajustes; no convertir en plantilla. Lectura compatible con1, límites128MiB/32MiB y rechazo del conjunto ante fuentes activas/cambiadas, colisiones o metadatos futuros (117). El suplemento se construye en project_transfer/supplement con proyecciones separadas de borradores, grabaciones, Git y preferencias. Parte WAV estándar44bytes/PCM mono24kHz16bits; SHA original y orden en Inventario.json. No se llama al motor de grabación ni se adoptan trabajos. Git bundle acotado sin config/hooks, refs reconsultadas; repositorios con alternates/commondir/shallow rechazados. Importador reutiliza staging y registro idempotente existentes.


### Cobertura del inventario (118)

Inventario ampliado a20 familias del perfil y tres tipos de almacén de proyectos registrados (papelera, copias históricas y preparación), también externos: metadatos acotados, raíces solapadas deduplicadas, registro no comprobable implica cobertura parcial. Presupuesto opcional extendido antes del payload a nuevas plantillas de proyecto y anclas históricas; audio/traslados medidos, creación aún exenta y declarada (118). Se usa la ruta del registro únicamente para metadatos contenidos; no se invoca claim_project_root durante la medición. Raíces canónicas ordenadas por profundidad, deduplicadas contra familias previas y entre proyectos. Registro inaccesible marca bytes incompletos y evita admisión bajo límite activo.


### Preferencias portables (119)

Adopción explícita de preferencias visuales desde el archivo portable: comparación actual/importado, selección separada de aspecto/idioma y anchos, autoridad existente de protección/recarga del espacio de trabajo y revisión ligada a ubicación/archivo/configuración. Campos no elegidos e IA conservados, futuros/cambios rechazados y acuses inciertos consultados sin reenvío (119). portable_preferences.rs aplica la proyección estricta1, sin comandos Tauri nuevos. Recuperación transmite StateTransitionAuthority hasta el diálogo; antes protege documentos/nota y bloquea ajustes pendientes, después reutiliza recarga local en App. SHA cubre archivo/ubicación/configuración completa; lectura no normaliza/escribe la fuente y no activa trabajos.


### Ubicaciones conservadas del inventario (120)

Inventario de ubicaciones conservadas en fichas retiradas, distinguiendo proyecto retirado y ubicación anterior de proyecto registrado. Deduplicación y filas ligadas también a ruta canónica; sin reclamar propietario/activar/restaurar. Catálogo futuro implica cobertura parcial y se conserva; retirar no descuenta bytes del presupuesto. Consultas de inventario, payloads y preferencias pasan por vía independiente, con escrituras aún serializadas (120). El catálogo de ciclo de vida se consulta de forma estricta para metadatos. No se incorporan proyectos retirados como autoridad de extracción mixta; sus filas son metadata-only sin acción. Campos opcionales projectState registered/retired/retained; ID SHA incluye ruta canónica.


### Archivo privado sucesivo (121)

Traslados sucesivos conservan el archivo privado anterior, verifican borradores/PCM/bundle/metadatos y añaden payloads actuales en generación distinta. Cabeceras originales bajo Anteriores con huellas; paquete3 e índice privado2, lectura compatible1/2/3. Paquete documental completo excluye toda la carpeta privada, evitando filtrar textos mientras omite audio/JSON. Referencias adaptadas al final sin reescribir copias conservadas; duplicados/futuros/corrupción rechazados sin paquete parcial (121). supplement/existing verifica referencias y representaciones antes de conservar fuentes anteriores. Source presupuestos contabilizan cada archivo una vez aunque se compruebe y copie. Índice privado2 guarda metadataSnapshots de cabeceras originales; generación de payloads nueva y cabecera actual sin activar datos importados. Referencias del documento normal se adaptan tras montar el conjunto, omitiendo el archivo privado.


### Borradores portables · bloque122

Catálogo/revisión/adopción en project_transfer/draft_adoption.rs; lector estricto compartido archive_index.rs. GET y revisión independientes, adopción serializada por proyecto y autoridad UI de protección/recarga; no nuevos comandos Tauri.


### Cupos de registros · bloque123

recovery_quotas.rs expone GET /api/recovery/storage/quotas por lectura independiente. Límites compartidos con productores; metadatos de seis tipos de ámbito, sin lectura de contenido/coordinación ni autoridad de creación/retirada. Máximo200 ámbitos/10000 entradas/2segundos, conteo parcial como mínimo.


### Audio portable · bloque124

project_transfer/recording_adoption.rs: catálogo/revisión independientes y llamada nativa bajo transacción/presupuesto. recording_portability.rs comparte PCM/origen entre servicios sin React. RecordingService usa mensaje tipado, valida inactividad y publica en portable.rs; Tauri import_portable_recording solo desde main. Sin trabajos automáticos ni nuevas rutas de proveedor.


### Historial portable y grabaciones integradas · bloques125–126

history_adoption.rs: catálogo/revisión independientes; adopción por cola existente fuera del bloqueo general y transacción de proyecto. Bundle verificado en repositorio de plantilla vacía; publicación sin reemplazo de .git y preparación durable .knownext-history-import inventariada. No checkout, proveedor, remoto ni cambios de ajustes. Windows usa -C y nombre relativo para Git. Composición compacta integrada no autoriza geometría de main; hook limitado a recordings.


## Operaciones, transición y servicios ·127

`knownext-core::operations` mantiene admisión acotada por vía, prioridad/envejecimiento, IDs, timestamps y estados; sus permisos en RAII terminan como desconocidos si hay una salida sin resultado. `BackgroundActivity` mantiene viva la actividad de investigación fuera de la petición hasta que termina el hilo, incluso después de solicitar cancelación. No es una cola persistente ni almacena cuerpos o resultados.

La composición Tauri delega en `runtime_dispatch`, `operations`, `managed_native`, `runtime_services`, `restart` y `workspace_exit`. Las entregas nativas se exponen por `managed_native_request` con enum estricto; sus antiguos nombres individuales ya no se registran como IPC. Las exportaciones SDK conservan sus firmas. Las peticiones locales opcionalmente reciben operationId; el SDK lo proporciona. Los comandos de observación/cancelación requieren main y no necesitan el bloqueo de documentos. Los recursos del protocolo se responden asíncronamente.

Vías: mutación1, consulta4, IA1, transferencia1, índice1, control8. Prioridad0 para guardado,1 normal,2 trabajo de fondo; una espera de10s promueve un nivel. Se preservan los bloqueos de dominio: la cola no sustituye precondiciones ni transacciones de proyecto. Hasta128 no terminales y256 terminales; espera de admisión120s. Cancelación solo queued; running nunca se anuncia cancelado por el planificador. La prioridad no interrumpe trabajo en ejecución. Importación/reindexado y otros recorridos aún necesitan extracciones adicionales.

Fachadas de almacenamiento extraídas con cuerpos conservados: `recording_runtime`, `runtime_health`, `state_io`, `projects_runtime`, `documents_runtime`, `settings_runtime`, `audio_transcription`, `export_styles`, `application_notes`, `github_auth`, `activity_runtime`, `context_runtime`, `ai_application`. `lib.rs` conserva composición, tipos, construcción y utilidades compartidas. Los dominios de persistencia, conflictos y transacciones mantienen sus módulos propietarios. Ver output/v3-runtime-module-extraction.json.

El registro común es volátil y privado de la sesión; para recuperación tras reinicio mandan los diarios de lotes, recuperación, investigación y grabación. No se transforma una espera agotada o un reinicio en una repetición. La reserva de actualización se obtiene después de proteger documentos/ajustes; excluye admisiones y establece retención interna de audio. La salida efectiva usa nonce nativo y ACK frontend antes de finalizar captura; la retención final impide capturas/admisiones entre ACK y salida. Ninguna ruta nueva acepta nombres de ventana enviados por React.


La extracción no cambia cuerpos; posteriormente `projects_runtime::update_project` añade rechazo de revinculación mientras BackgroundActivity siga activa. La publicación de investigación usa permiso de escritura de proyecto y creación atómica exclusiva: un nombre ocupado tarde no se reemplaza. No cambia ningún formato persistido.


## Importación e inventario por fases ·128

`asset_work_request` clasifica únicamente POST attachments/assets/images y assets/reindex-images. Tauri delega en `dispatch_asset_work`; la admisión general usa Transfer/Index respectivamente, conservando Mutation para guardados. La cola de transferencias existente evita múltiples publicaciones pesadas concurrentes.

`ProjectSnapshot` fija identidad y raíz sin invalidarse por cambiar nombre/icono/proyecto activo. Importación usa un callback de publicación revisada: cálculo/listado inicial fuera de autoridad, revalidación/nombres portables/permiso del proyecto/creación exclusiva dentro, árbol/huella de recibo fuera. El padre se canonicaliza antes de comparar rutas Windows; se publica en la ruta revisada. ContextChanged produce not-started solo antes de escribir. E/S ambigua mantiene resultado sin confirmar.

`image_inventory_work` recorre una vez, lee Markdown una vez y agrupa referencias por ruta con el parser existente. Conserva snapshot del índice previo y metadata de fuentes/directorios. Publica solo tras revisar raíz/índice/fuentes y reservar proyecto. Futuro/UTF-8/lectura parcial/exceso no se normalizan como vacío.10.000 entradas; fuentes8MiB/64MiB;20.000 marcadores por fuente y100.000 referencias; cálculo15s, comprobación final1s e índice32MiB. Nombres de coordinación se omiten antes de metadata; validar ruta antes de abrir fuente. Son presupuestos cooperativos, no cancelación de E/S del SO. La publicación crítica conserva E/S bajo autoridad de mutación.

El recibo añade treeAvailable/treeWarning a FileOperationResult, campos ya admitidos por el consumidor. committed=true no depende de reconstruir vista; vista no disponible conserva la biblioteca y ofrece actualizar, sin repetir importación. Los formatos persistidos de inventario y documentos no cambian.


## Runtime por recursos y continuidad ·130 (sustituye los límites del corte127)

La cola añade Background2 a Mutation1/Query4/Ai1/Transfer1/Index1/Control8. Resource agrupa proyecto y clave opacos derivados por SHA, sin rutas persistidas. Exclusión de grupo para publicaciones de Git/estructura; claves distintas pueden convivir si el dominio lo permite. Elegibilidad revisa trabajos running y waiters anteriores de recursos en conflicto; mantiene prioridad y envejecimiento10s sin bloquear otro recurso libre. Las transacciones/guardas del dominio siguen siendo obligatorias. Los trabajos ya iniciados no son preemptivos.

slow_runtime deriva solo los endpoints auditados de autenticación/repositorios, estado y operaciones Git, conexión/configuración y versiones. La red no retiene el mutex global. Configuración cambia bajo autoridad corta y consulta estado después; escrituras Git mantienen transacción de proyecto y la consulta compartida conserva reserva de ubicación. Otro proyecto puede guardar. auth_gate protege solo revisión/publicación local; generación más huella del estado y credencial impiden publicar una respuesta sustituida. Logout invalida generación; el frontend comprueba también su epoch. No se prueban proveedores reales en este bloque.

OperationJournal guarda runtime-operations-v1.json atómicamente,384 entradas/512KiB. Snapshot estricto contiene IDs opacos, lane, phase, timestamps, stage, cancelRequested y recovered; nunca cuerpos, etiquetas, rutas ni recursos. Cargar valida esquema, límite, IDs y tiempos; queued/running anteriores se convierten en unknown, no en trabajo ejecutable. Formato futuro/corrupción/fallo de escritura desactiva persistencia para esa sesión, conserva el original y permite seguir en memoria. La UI consulta persistenceAvailable. Continúan mandando recibos y diarios de negocio para revisar/continuar sus operaciones. El registro técnico acotado no es un recibo de idempotencia duradero.

submit/start/cancel con escritura de diario se ejecutan en spawn_blocking. El estado del core sigue protegido por mutex durante una escritura pequeña y acotada del diario; no se promete ausencia total de espera de disco. ContextGuard liga checkpoints al hilo y restaura contexto al salir. Los dominios auditados (autenticación/repositorios/reindexado) aceptan solicitud en running; solo un checkpoint anterior a Publishing confirma cancelled con error operation-stopped-before-publication. Desde Publishing no se ofrece cancelar, incluso al pasar a Observing. No se mata HTTP/Git/E/S del sistema. Los otros dominios conservan su autoridad de cancelación propia o solo queued.

local_api_request/content devuelven sobre protocolVersion1, operationId y completedAt junto a la respuesta anterior. El SDK exige correlación y esquema conocido. Entradas IPC y archivos rechazan campos ajenos, método/ruta inválidos no se admiten. Errores diferencian not-started, not-applied y unknown; timeout solo termina espera UI. Observación/cancelación nunca reenvían. El diagnóstico explícito exporta50 metadatos sin etiquetas/contenido; no hay telemetría nueva.
