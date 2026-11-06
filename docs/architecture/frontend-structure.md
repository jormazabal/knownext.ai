# Frontend Structure

The frontend is React + TypeScript and renders product state received through the API boundary under `apps/desktop/src/lib/api`.

## Boundaries

- Feature components render state and dispatch intent.
- API modules adapt requests to Tauri commands and product contracts.
- React must not read or write project files directly.
- React must not execute Git, call GitHub APIs directly, access credential storage, or call AI providers directly.
- Runtime, filesystem, Git, document conversion, and AI behavior belongs to Rust services.

## State And Persistence

- Project creation, editing, selection, and tree operations go through `src/lib/api/projects.ts`.
- The document tree toolbar resolves new-folder, new-document, new-handwritten-note, import, and AI add-to-project destinations from product state before calling APIs: selected folder first, then the parent folder of the active file/document, then project root only when no current tree location exists.
- Project file guard/sync overviews go through `src/lib/api/sync.ts` and are rendered as state; React does not inspect Git or the filesystem directly.
- Layout, tabs, folder open state, notes, drafts, export templates, and settings go through API modules.
- Handwritten pencil presets are application settings under `AppConfig.handwritten.toolPresets`. The handwritten editor receives them from app state and updates them through the config flow; opening a different `.knote` must not replace the active preset list.
- Unsaved document changes are autosaved through `src/lib/api/documents.ts` to runtime-managed drafts.
- Unsaved handwritten-note changes are autosaved through `src/lib/api/handwrittenNotes.ts` to runtime-managed drafts. React stores editor session state under `src/app/handwrittenSessions.ts`; it must not persist `.knote` files, render caches, or derived assets directly.
- Document export goes through `src/lib/api/documents.ts`; React may open native save dialogs, but Rust writes or returns the export artifact.
- Handwritten-note export and Markdown insertion go through `src/lib/api/handwrittenNotes.ts`. React may collect pointer input and draw canvas previews, but Rust validates/persists the `.knote`, renders export artifacts, writes derived assets, and prepares AI context.
- Reference previews render runtime-prepared PDF/text/workbook payloads and show explicit errors for unsupported files.
- The Markdown string remains the source of truth for inline visual formatting. Supported extended marks may use controlled inline HTML, including `<u>` and `<mark data-knx-highlight="yellow|green|blue|pink|orange">`.

## Runtime Services

Runtime helpers live under `src/lib/runtime`. React can request health, logs, update checks, and folder-opening actions through those wrappers. It does not spawn processes, configure API ports, or assume an HTTP endpoint.

The Services settings section shows the local Rust runtime, version/profile details, app data directory, and latest diagnostic error.

## AI

The IA workspace tab is project-scoped and renders conversation events from runtime contracts. Prompt context chips are presentation state; source resolution, extraction, indexing, provider credentials, and operation validation belong to Rust services.

AI-generated document changes, images, and project operations must return structured operations that the app can apply deterministically. The frontend may apply already validated edit proposals to local editor/document state, but it must treat provider text as display-only and must not call providers or infer intent from prompt wording.

AI edit proposals are the UX boundary for document mutation. Selection/cursor operations can use the active Milkdown controller; project or multi-document operations must use validated Markdown anchors or explicit full-document replacement. If an anchor is missing or ambiguous, the UI keeps the operation reviewable instead of guessing a target.

AI skills are displayed through the settings surface and response metadata, but they remain runtime-owned. The frontend uses `src/lib/api/skills.ts` to list, inspect, request validation, and request non-mutating selection previews for skills. It may show `usedSkills`, `skillApplications`, and `skillDiagnostics` returned by Rust, but it must not compose skill prompts, validate manifests locally, infer applied skills from assistant text, or treat a skill as a permission grant.

The Skills de IA settings tab is a compact capability manager, not an editor. It shows base skills, modes, runtime status, Mermaid catalog families, manifest data, examples, diagnostics, and the selection preview panel. Import, export, duplicate, edit, and project-level activation controls must remain passive or absent until user/imported skills are implemented in the runtime.

## Visual Structure

- Keep the document editor as a single-column Milkdown surface.
- Keep handwritten notes in `src/features/handwritten` as a separate feature surface. The handwritten editor is a paginated canvas notebook, not a replacement for Milkdown and not a raw JSON editor.
- Handwritten UI must be stylus-first: pen/mouse write, touch scrolls, pressure and coalesced pointer events are used when available, and toolbar controls remain compact icon-led controls consistent with the workspace.
- Keep the left panel compact and operational.
- Use hover/context menus for tree item actions.
- Do not show raw Markdown as the primary editing experience.
- Do not use product mock data as a normal runtime fallback.


### Configuración en el espacio de trabajo · desarrollo 3.0
App mantiene el modelo y entrega a DesktopLayout los slots tipados SettingsWorkspace. SettingsNavigation usa el lateral izquierdo; AppSettingsDialog conserva una presentación modal compatible y una presentación workspace, que es la usada por la aplicación; SettingsContext entrega ayuda y ámbito, sin simular un motor de previsualización. El editor documental permanece montado y oculto. useWorkspaceSurfaceTransition cierra el lateral temporal y devuelve foco al editor visible, cancelando frames de foco superados.
El texto común vive en settingsCopy.ts y los metadatos en settingsSections.ts. Las categorías visitadas conservan su estado durante la apertura; el cierre desmonta sus campos privados. Es necesario seguir revisando el trabajo de categorías ocultas.
useSettingsPersistence ordena por archivo real: app e IA comparten configuration; exportación usa export-template. Las revisiones de grupo evitan aplicar ACK antiguos, permiten agrupar solicitudes aún no iniciadas y mantienen errores/reintento independientes. Una lectura IA se reconcilia con revisiones de preferencias/credenciales y ámbito de proyecto. Esto es coordinación de esta sesión frontend; no sustituye la autoridad y validación Rust ni la coordinación entre procesos.

### Revisión de estado e inicio · 3.0 en desarrollo
`types/localState.ts` y `lib/api/localState.ts` definen el diagnóstico y restablecimiento revisado del estado crítico. `LocalStateReview` muestra la consulta sin contenido privado; dentro de Recuperación solo diagnostica, para conservar las sesiones abiertas. `StartupRecovery` permite revisar y confirmar un restablecimiento antes de cargar el espacio de trabajo. Utiliza `ModalFrame` para aislar el fondo, contener teclado y devolver foco tras las confirmaciones; el detalle del inicio permanece plegable. Los errores de inicio pertenecen a esa pantalla, sin aviso flotante duplicado.

El menú de cuenta cerrado se desmonta para que sus acciones no permanezcan en el recorrido de teclado ni en el árbol de accesibilidad. La revisión de todas las superficies ocultas continúa.


### Ajustes localizables y actividad de vistas · corte 11
`settingsSearchIndex.ts` contiene temas explícitos asociados a categorías reales; `SettingsSearch` filtra localmente y anuncia el alcance por apartado. No indexa valores privados ni invoca IA. Su selección y las acciones internas solicitan foco después de montar el panel; las flechas de categorías permanecen en la navegación. El resumen usa grupos sin tarjetas anidadas y mantiene modelos detallados bajo `AdvancedOptions`.

`useRecordings(active)` mantiene revisión confirmada, una lectura pendiente reutilizable y errores separados para consulta/orden. La categoría Audio transmite su actividad y cancela la aplicación de respuestas de dispositivos al ocultarse. La visibilidad documental suspende polling web; no se envían órdenes de captura desde la limpieza. El comportamiento de segundo plano nativo requiere su evidencia propia. Vite ignora `src-tauri`, que mantiene su compilación Rust/Gradle independiente.

### Continuidad de respuestas y revisión · corte 12
`app/aiResponseContinuity.ts` captura bases RAM y época del proyecto; el cambio de destino o contenido impide aplicar automáticamente la respuesta. No mezcla la conversación/árbol de otro proyecto ni activa una pestaña anterior. `AiEditOperation.expectedMarkdown` es autoridad del cliente tomada de esa petición, no del modelo. La preparación asíncrona vuelve a contrastar el contenido vivo y conserva operaciones no aplicables para revisión.

Milkdown publica una instantánea `{markdown, document}` junto a sus notificaciones. `matchesMarkdown` compara el documento vivo con ella antes de ejecutar una operación pendiente: protege cambios todavía no entregados a React y conserva atributos internos que un nuevo parseo perdería. Las operaciones externas incluyen identidad de propuesta y sus operaciones; se mantienen pendientes hasta ACK. Un fallo nunca hace un reemplazo alternativo del contenido.

`types/aiResults.ts`, `lib/api/aiResults.ts` y `useAiResultReview` separan contrato, persistencia y estado. El hook conserva salidas sin sobre de petición, mantiene RAM/aviso si falla el almacenamiento, descarta listas antiguas y coordina conservación/copia/retirada pendientes. `AiResultReviewDialog` reutiliza Milkdown de solo lectura y canvas de trazos; crear copia no modifica la sesión original. El acceso permanece visible mediante icono/contador y área de 44 px en móvil. La lista vacía conserva Actualizar; el modal aísla fondo y devuelve foco.

El contexto móvil se posiciona respecto al cuerpo de trabajo, por debajo de las barras superiores; no debe interceptar sus controles. Las pruebas web controladas no acreditan persistencia de archivos nativos ni un proveedor real. Ver [evidencia y límites del corte](../product/revision-3.0-implementacion/avance-12.md).


### Revisión contextual y acuse · corte 13
`useAiProposalAutoApply` decide una sola vez por propuesta y exige política explícita; un cambio de ajustes no libera revisiones anteriores. `aiProposalExecution` coordina preparación/ACK, identidades únicas, cancelación y expiración sin declarar aplicación antes del editor. La propuesta permanece en el Asistente sin caducidad; la entrada se oculta sin desmontarse. `useAiResultReview.adopt` incorpora el registro exacto conservado por Rust; no lo vuelve a escribir con fecha/identidad distintas. La UI exige `runtimeApplied` para retirar sesiones por eliminación. Ver avance-13.md para límites nativos.


### Revisión raster · corte 14
`AiReviewOutput` añade `image` con formato raster y base64. El diálogo muestra imagen local a escala, sin cargar una URL de proveedor y sin recortar el archivo copiado. La miniatura de escritorio se limita a 360 px. La copia necesita runtime nativo; el adaptador web comunica esa limitación. La UI adopta la salida conservada por el runtime y no vuelve a consumir un proveedor.


### Estado de exportación móvil · corte 15
`lib/api/mobileExports.ts` envía solicitudes tipadas de exportación documental y recibe cancelación o acuse nativo (`requestId`, `completedAt`, nombre, bytes e identificador de apertura). `ExportStatus` presenta preparación y, únicamente tras el acuse de escritura, Archivo exportado/Abrir. El App captura contenido al pulsar y evita dobles envíos en esta ventana; no bloquea la edición. Los errores del diálogo nativo ya no se interpretan como cancelación. La API de plataforma y la escritura permanecen fuera de los componentes.


### Captura y reutilización de plantillas · corte 16
`lib/api/documentTemplates.ts` y `types/documentTemplates.ts` median el catálogo y las solicitudes revisadas. `useDocumentTemplates` ordena recargas e ignora respuestas antiguas; `useDocumentTemplatePreview` identifica todos los campos de cada petición, invalida una vista previa al cambiarlos, descarta respuestas tardías y permite reintentar. No persisten prompts ni estado de proveedores. El adaptador web mantiene catálogo y archivo propios de desarrollo; sus fixtures no acreditan filesystem nativo.

`SaveDocumentTemplateDialog` revisa el contenido capturado y conserva los campos ante error. `CreateDocumentDialog` muestra destino, catálogo y campos variables; título/fecha/proyecto están bajo una personalización opcional. Vista previa Milkdown de una columna, un solo desplazamiento de cuerpo y acciones fuera de él. Crear recibe los valores resueltos y el acuse de raíz; retirar requiere decisión explícita y anuncia el resultado. Ambos flujos evitan dobles envíos y mantienen foco dentro del diálogo. Las opciones compactas de MarkdownToolbar usan ModalFrame; la captura está junto a exportación, sin añadir acciones permanentes al árbol.

`MarkdownEditorController.getMarkdownSnapshot` conserva el Markdown publicado exactamente si su documento ProseMirror sigue igual; si hay escritura aún no publicada, serializa el documento vivo. La captura de plantilla y la exportación desde la barra usan esa lectura y restauran referencias materiales del proyecto; un editor no preparado produce error, sin recurrir silenciosamente a un estado anterior. El acuse de creación se contrasta con proyecto/época antes de cambiar árbol/pestaña; si cambió la vista, se informa del archivo creado conservando el contexto actual. No se atribuye esta protección a todos los demás flujos asíncronos.


### Corte 17 · transferencia revisada de plantillas
Formato portable `knownext.document-template`, versión 1: solo nombre, descripción y Markdown. Inspección estricta y SHA de los bytes antes de importar con nombre explícito y nueva identidad local; sin sobrescritura de catálogo. Lectura real limitada a 2 MiB, UTF-8 estricto, versiones futuras/campos extra rechazados y original conservado. Windows selecciona y lee en Rust; Android usa ACTION_OPEN_DOCUMENT/ContentResolver. Exportación fija revisión, temporal privado hasta ACK nativo y acciones compactas de 44 px. La UI muestra revisión visual y archivo completo antes de confirmar. Windows crea solo un archivo nuevo; un fallo de entrega Android exige revisar un posible parcial del proveedor. No detecta secretos escritos dentro del texto: hay que revisar el contenido antes de compartir. Cero credenciales/configuración adjuntadas por la aplicación. Validación nativa y límites en avance-17 cuando se complete la campaña.


### Corte 18 · conservación y comprobación
C18: bindAiProposalReview enlaza propuesta con base enviada, nombre legible y acuse nativo de conservación, retirando metadatos de recuperación no acreditados. La tarjeta distingue copia conservada de disponibilidad solo en sesión. Resultados IA conservados incluye copias ya aplicadas: abrir/reiniciar no ejecuta posiciones antiguas. Las copias permanecen hasta retirada explícita. useAiResultReview mantiene el acuse confirmado frente a fallos tardíos, da prioridad al inventario durable y vuelve a consultar el estado tras esperar antes de eliminar. No cambia el coste ni la ruta de proveedor.


### Transferencia de proyectos · corte 19
`types/projectTransfer.ts` define recibos e inventario; `lib/api/projectTransfer.ts` limita transporte a identidades/huellas nativas. El navegador de desarrollo informa que necesita la aplicación nativa: no simula transferencias de archivos como éxito. `features/projects/useProjectTransfer.ts` conserva preparación revisada, nombre, cancelación solicitada y reconciliación de un ACK perdido consultando el recibo sin repetir la acción. `ProjectTransferDialog` presenta estado e intenciones con un único cuerpo desplazable, inventarios paginados y footer táctil de 44 px. El nombre precede a los detalles y los desplegables tienen indicador visual.

Acceso integrado desde el selector de proyectos y como origen en Crear proyecto; sin botón más externo ni búsqueda de cabecera. El subdiálogo conserva el formulario de creación. Importar refresca el catálogo con acuse nativo, sin sustituir el documento activo. Cerrar una revisión pendiente conserva su preparación; cerrar tras completar la retira únicamente con ACK. Una preparación de registro pendiente ofrece continuar y permite renombrar, sin borrado de su proyecto copiado. Error al refrescar el catálogo mantiene el recibo y admite Actualizar estado; no repite el commit.


### Cerrar la revisión sin perder el nombre · corte 20
`useProjectTransfer.leave` conserva el campo provisional con acuse antes de cerrar una revisión de importación; fallo conserva formulario abierto, reconsulta recibo sin perder texto y admite repetir. Completar sigue retirando solo preparación con ACK. El aviso de destino cancelado se muestra como estado, manteniendo paquete/huella revisados.

Referencias de carpeta ofrecen Mostrar carpeta. App reutiliza `revealTreeNode`; DesktopLayout abre navegación contextual, enfoca/selecciona el destino verificado de ese mismo proyecto y conserva pestaña/editor. Se reutiliza la expansión existente del árbol, sin otro motor de navegación. La navegación directa de enlaces dentro del editor conserva su alcance anterior; no se presenta como resuelta por esta acción del panel.


### Fidelidad de imágenes · corte 21
Milkdown/Crepe conserva su editor y su vista. `features/editor/imageFidelity.ts` configura el esquema público de image-block y el plugin remark: ALT literal, caption independiente y ratio propio. El tamaño manual usa un comentario adyacente `knownext-image` JSON v1 con version/ratio, máximo 1024 unidades UTF16 y ratio 0.01–4. Hasta cuatro anotaciones propias desconocidas se conservan opacas; no se interpretan y bloquean resize/reset. El exceso permanece en el AST.

La geometría numérica heredada se mantiene sin inventar el ALT anterior. DOM accesible/clipboard se sincroniza desde el nodo; no genera una transacción ni modifica la fuente al cargar. Reemplazar descripción/fuente conserva caption y tamaño; captions nuevos explícitos se admiten y se editan también en Crepe. `lib/markdownImage.ts` escapa la inserción literal. La primera publicación distingue una normalización del documento montado de una escritura real por igualdad de documento.


En el cierre de C21 se retira la reescritura regex de referencias de DesktopLayout. `lib/projectImageSources.ts` resuelve únicamente URLs de presentación a partir del árbol y la ruta del documento; `proxyDomURL` de Crepe configura bloque e inline. El nodo, los offsets, el snapshot y las bases IA mantienen Markdown de producto. Código/comentarios no pasan por una sustitución de URLs. El diálogo identifica la imagen local por metadatos; cambiar su ALT conserva la URL/query/fragmento si no se elige otra fuente.

### Retirada reversible de proyectos · corte 22
`types/projectLifecycle.ts` y `lib/api/projectLifecycle.ts` limitan la reincorporación a ID, revisión nativa y nombre revisado, sin aceptar una ruta arbitraria. El selector ofrece Proyectos retirados también en el estado sin proyectos. `RetiredProjectsDialog` tiene un cuerpo desplazable, pie fijo y controles de 44 px; conserva el campo ante colisiones, distingue operación en curso y restaura el foco incluso si desapareció el botón de origen.

`useRetiredProjects` reconcilia acuses desconocidos mediante lecturas, sin repetir mutaciones. Un fallo posterior al refrescar el selector conserva el resultado y ofrece actualizarlo. Reincorporar no cambia el proyecto activo. `projectRetirement` exige el acuse nativo real del checkpoint completo; un guardado supersedido no autoriza retirar. `editorSnapshots` captura primero los lectores vivos del proyecto, publica cambios y espera la conservación de borradores. La liberación tardía de una instancia no elimina al lector que la sustituyó. App conserva las claves de pestañas/árbol del proyecto retirado.

ModalFrame comparte propiedad de aislamiento mediante WeakMap y conserva el estado inert previo. El último propietario libera el fondo, independientemente del orden de desmontaje de los modales anidados. El recorrido no supera body. Si la recuperación inmediata del foco sigue bloqueada por un propietario que se desmonta en el mismo commit, se reintenta en microtarea comprobando conexión e inert; no se enfoca un fondo aislado por otro diálogo.

### Mapa de almacenamiento · corte 23
`StorageUsagePanel` se integra en Sistema y se localiza por temas de almacenamiento, uso y ubicaciones. Usa `types/storageUsage.ts` y `lib/api/storageUsage.ts`, sin acceso a archivos desde React. La consulta exige activación explícita: no hay escaneo al montar, temporizador ni polling en paneles ocultos. Un envío en vuelo bloquea duplicados; el componente conserva la medición anterior ante error e ignora respuestas tras desmontar. No promete cancelar el trabajo nativo ya iniciado.

Contenido es/en, cabecera apilada en móvil, acciones de 44 px, medición parcial como cota inferior y detalle progresivo de ubicaciones en grupos de 20. Los avisos nativos de catálogo/registro se localizan mediante códigos. No se confunden tamaños lógicos con capacidad libre ni se ofrece limpiar datos a partir de su categoría.

### Mantenimiento del índice con revisión · corte 24
`useAiIndexMaintenance` concentra el envío local de reconstrucción/limpieza y la consulta explícita de estado. Captura proyecto, época y revisión; bloquea operaciones duplicadas y descarta respuestas tras cambiar de proyecto, incluso al volver al mismo ID. Un acuse desconocido se concilia por GET y nunca vuelve a ejecutar DELETE/POST automáticamente. Si falla también la lectura, conserva el estado anterior y el error original.

App enlaza las intenciones y el resultado. Ajustes muestra el error en vista básica, ofrece Actualizar estado sin regenerar y mantiene controles de 44 px deshabilitados durante la operación. La limpieza requiere revisión nativa de ese proyecto. Metadatos nulos confirmados no se sustituyen por fechas/referencias antiguas de config. Un cache ilegible mantiene su aviso y la configuración del proveedor disponible. No se modifica la ruta de coste o ejecución de prompts.


### Recuperación del visor · corte 25
ReferenceDocumentViewer captura época/proyecto para recargas y apertura externa, ignora acuses antiguos y evita recargas duplicadas. Reintentar una creación fallida no exige recibo previo. Fallos PDF se muestran y fallos externos conservan la consulta. Ajustes prioriza el índice por revisar sobre el acuse histórico general, manteniendo fallos de guardado de preferencias. La barra/escala PDF móvil y el contexto fijado heredado conservan hallazgos pendientes explícitos en avance-25.

### Importación e inserción de imagen · corte27
API valida tamaño antes de FileReader y elige keep-both explícito. App captura proyecto/época y distingue árbol no disponible del vacío. InsertImageDialog concentra error/archivo/ALT, impide duplicados, reutiliza la imagen importada si falla la referencia y descarta acuses tras cambio de documento/proyecto o cierre. ModalFrame conserva foco/aislamiento. Preview es desplegable en estrecho; información accesible sin ocultarla por CSS. Advertencias propias se muestran dentro del diálogo; no se apilan avisos modales globales durante la inserción.

### Historial y continuidad · corte28
VersionHistoryPanel consume snapshot tipado y permite nombres de hito y dos selecciones. Un resultado desconocido de nombre se concilia mediante GET, sin replay; guarda texto y descarta resultados de documento antiguo. HistoryPreviewWorkspace y historyDiff extraen del layout presentación y un único LCS acotado (1M celdas/8k líneas/2M caracteres combinados), con atajo de igualdad y prefijo/sufijo. Fuera del presupuesto ofrece contenidos completos explícitos, sin recuentos ficticios. Vista adaptable por anchura real o unificada/dos columnas elegible; A/B y restauración de A explícitos. HistoryComparisonSurface mantiene editor montado y dos superficies de desplazamiento; recupera foco/posición al regresar. El adaptador web declara historial nativo no disponible, sin inventar commits.

### Acceso rápido y diagnóstico · cortes29/30
useProjectFavorites encapsula inventario/revisión y mutaciones con época, un envío en vuelo y conciliación por lectura sin replay. La paleta conserva listbox de opciones y sitúa la acción del archivo seleccionado fuera; destinos ausentes no navegan y pueden retirarse. Favoritos se consulta al abrir, sin polling oculto.

recordTraceLog conserva firma para llamadores pero solo transmite nivel/categoría conocida; texto libre queda fuera del bridge. Una confirmación puede aportar eventId al mismo aviso vigente, sin reemplazar avisos posteriores. SafeDiagnosticsPanel prepara explícitamente y retiene informe ante error/copia fallida; safeDiagnosticJson solo serializa campos/enums técnicos conocidos. Copia básica de servicio excluye rutas, endpoints y lastError. No crea una transmisión remota ni guarda prompts.


HandwrittenEditor consume una intención de página con propietario/requestId y acuse único. pageTranscription parchea la nota actual y compara texto base; PageTranscriptionDialog conserva edición y exige revisar base cambiada. Límite64.000UTF16/página y512KiBUTF8/nota; no reemplaza trazos.


### Módulos visuales diferidos
createDeferredView carga capacidades pesadas al mostrarlas, comparte módulo y mantiene errores/reintento en su superficie. Los documentos y controles exteriores conservan la autoridad de estado. ReadonlyMilkdown, PDF y MarkdownEditor permanecen fuera del grafo inicial; highlightPalette solo contiene valores visuales. Vite emite manifest para medir imports estáticos con `pnpm bundle:measure-load -- current`. No usar onlyExplicitManualChunks sin revisar ciclos del build de producción; React/helpers están agrupados expresamente. La medición de bytes no sustituye latencia/memoria nativas.


### Continuidad de edición al ocultar/reanudar
`WorkspaceContinuity` serializa/coalesce checkpoints y consultas; `useWorkspaceContinuity` consume eventos web y la señal Android `knownext:activity-visibility` (solo booleano). `SessionWriteQueue` conserva orden por documento y `user-notes`; `notesProtection` valida el ACK sin reemplazar el modelo actual. `editorSnapshots` recoge todos los lectores antes de publicar cambios y `pendingInputCheckpoints` finaliza una vez el gesto UI pendiente al ocultarse. El checkpoint periódico de5s solo protege modelos publicados cuando cambió su revisión; no corta gestos ni fuerza serialización de editores inactivos. Un ACK lento no autoriza replay. La duración y última confirmación son estado RAM, sin contenido privado persistido ni nuevo formato Rust. La notificación es inline; el pie de notas distingue pendiente, guardando, error y ACK del texto actual. No garantiza persistencia ante muerte del proceso antes de recibir confirmación.


### Búsqueda literal del documento
`documentTools` mantiene posiciones ProseMirror a través de marcas inline y nodos hoja. `DocumentFindOptions` viaja desde el panel al controlador tanto en consulta como en reemplazo; el controlador vuelve a consultar el modelo actual. Consulta200 unidades UTF-16, hasta1001 resultados para distinguir exceso y reemplazo limitado a1000. Palabra completa usa vecinos Unicode L/M/N/guion bajo en un intervalo acotado, sin recorrer cada prefijo completo. Las expresiones internas escapan la consulta literal. La transacción de reemplazo abre/cierra grupo de historial; no incorpora escritura adyacente al mismo undo. Panel conserva opciones/textos por scope en RAM y liga su acuse al Markdown resultante para retirarlo tras deshacer u otra edición. No persistencia ni contrato Rust nuevo.


### Imágenes y transferencia de catálogos de plantilla
`documentTemplates.prepareDocumentTemplateSource` pide al runtime una copia portable; el diálogo conserva la instantánea revisada y puede abandonar esa lectura sin guardar una respuesta tardía. Persistencia usa el Markdown explícito resultante. `useDocumentTemplateCatalogTransfer` posee selección, nombres, revisión y acuses; componentes solo renderizan/intentan acciones. Un ACK desconocido vuelve a revisión de solo lectura. Una nueva aplicación exige otra revisión; el resultado confirmado se conserva si falla el refresco exterior. Contenido se muestra uno por vez y el visor solo se monta al desplegar. `ReadonlyMilkdown` reutiliza `configureImageFidelity`/`remarkImageFidelity`; un plugin de vista sincroniza ALT/título/metadata en imágenes montadas asincrónicamente y desconecta su observador al destruirse. Continúa read-only y no serializa cambios al usuario.


### Consultas de consumo con alcance estable
`useAiUsageScope` mantiene mes/proyecto, generación y resultado confirmado sin modificar la cache global del espacio de trabajo. Comprueba projectId y mes devueltos antes de adoptar; la respuesta anterior no se rotula con el nuevo alcance. Un fallo no equivale a cero y se conserva solo una instantánea cuyo alcance sigue coincidiendo. ProjectActions ofrece filtros/actualización local; controles44px, cabecera fija y detalles de calidad desplegables. EUR no disponible se representa con raya/aviso, incluso cuando no hay total valorado.


### Revisión de conservación del consumo
`useAiUsageLedger` separa revisión, conversión y observación posterior a ACK desconocido. No hay llamada al montar el control. Tras error se conserva revisión anterior, bloquea convertir y solo permite comprobar mediante GET. Confirmación exige formato/estado compatible; copia verificada no se anuncia desde una lectura ahora incierta. Notificación usa callback actual de consulta, sin cambiar el proyecto/mes que el usuario haya elegido durante la espera. Detalles de calidad distinguen totales por periodo, detalle reciente y cobertura anterior limitada.


### Transición de estado crítico
StateMigrationPanel requiere autoridad explícita antes de mutar; aislado es de consulta. App protege entrada viva y documentos/notas, exige ajustes confirmados, pausa persistencia e invalida cachés/lecturas/contexto IA anterior. Modal mantiene aislamiento hasta completar la lectura de inicio posterior a cualquier resultado, incluido ACK incierto. No se repite la mutación ni se recarga proceso/página. Contrato y límites en el bloque de recuperación protegida del plan3.0.


### Vistas y efectos de lotes
FileOperationResult.treeAvailable=false permite un comprobante de efectos sin sustituir el árbol por[]. fileBatchEffects mantiene documentos afectados/rutas y cambios de pestañas por elemento, adopta plan.result.tree una sola vez sin reaplicar documentos agregados, y conserva carpetas abiertas. El runtime reconstruye la vista actual en GET/resultado sin persistirla en el diario. Ver avance80.


### Resultado explícito previo a escritura
ApiError.operationOutcome=not-started solo se construye desde ese campo explícito del runtime, manteniendo el detalle legible. Los confirmadores Markdown/nota propagan ese rechazo sin observar coincidencias preexistentes como ACK perdido. Un409 sin ese campo sigue siendo incierto. Error acotado fuera del cuerpo desplazable mantiene visible el motivo sin ocultar controles. No hay parsing de texto ni reenvío automático. Ver avance82.


### Intento de combinación obligatorio
confirmDocumentMerge/confirmHandwrittenMerge requieren identidad y verificador de recibo. Ya no existe fallback por contenido coincidente. verifyDocumentMergeAttempt/verifyHandwrittenMergeAttempt son consultas sin callback de mutación. App conserva el pedido de un intento incierto en el estado del diálogo, con elecciones bloqueadas, consulta explícita y revisión nueva separada. not-started descarta esa espera sin consultar. El verificador runtime devuelve documento y copias comprobados en una sola consulta. Ver avance83. Pedido RAM no sobrevive al reinicio; catálogo de recibos pendiente.


### Revisión física del borrador y RAM en conflicto
DocumentSession/HandwrittenNoteSession mantienen draftWriteRevision/draftWriteConflict separados de draftContentHash. acknowledgeDraftWrite conserva RAM y solo avanza acuses propios de la misma carga/base; App publica esa revisión antes de liberar SessionWriteQueue. LocalEditProtection conserva una instantánea independiente y consulta el ID tras acuse incierto sin repetirlo. DraftWriteConflictBanner ofrece conservación y lectura posterior condicionada a la misma sesión. RecoveryReviewSection admite una copia conocida para no perder acceso por presupuesto del inventario. Ver avance84; productores internos/aceptación nativa aún pendientes.


### Catálogo de intentos conservados
ConflictAttemptsSection/useConflictAttempts consultan catálogo y detalle sin pedido RAM; invalidan respuestas antiguas y evitan doble escaneo inicial en StrictMode. Recuperación añade categoría Combinaciones; Ver copias conserva las identidades verificadas al pasar a Apartadas. RecoveryReviewSection admite knownCopies además de la copia RAM84 para evitar que un inventario parcial oculte la revisión seleccionada. No ofrece repetir/aplicar/resolver desde el catálogo. Véase avance85.


### Archivo de recibos revisados
useConflictAttempts mantiene ámbito, revisión fresca y exclusión inmediata de doble envío. archive/reopen ejecutan una mutación y observan después; ante resultado incierto no repiten y exigen revisión explícita. ConflictAttemptsSection conserva cierre del diálogo y explica que archivar solo organiza, sin liberar cuota. Véase avance86.


### Archivos ausentes con revisión vinculada
getOrphanDraftInventory conserva cobertura y pruebas en App; las consultas tienen secuencia para descartar respuestas antiguas. Restore/discard envían identidad/huella/ubicación, se serializan por documento y conservan edición posterior. RecoverableDraftsDialog mantiene snapshot de confirmación y bloquea resultado incierto hasta una actualización exitosa; onDiscard recibe el objeto revisado, no solo la clave. Errores en contexto y parcialidad explícita, con avisos desplegables. Véase avance87.


### Papelera con autorización revisada
useProjectTrash separa catálogo, revisión y restauración. El SDK exige revision y el runtime vuelve a contrastar contenido/ubicación. Error de mutación bloquea el elemento hasta nueva actualización exitosa; un acuse confirmado se conserva si falla el callback de vista. Selección y avisos fuera del listado, parcialidad explícita, sin retry automático. Véase avance89.


### Navegación a página PDF desde búsqueda
WorkspaceNodeFocus distingue pdf-page de handwritten-page. App transforma la selección explícita en pageFocus con requestId en la pestaña de referencia; ReferenceDocumentViewer la aplica después de cargar y limita al número real de páginas. Una petición nueva navega un PDF ya abierto sin recrear la vista. PdfPreviewSurface permite alinear la última página en una pantalla estrecha. Alcance de búsqueda actualizado, sin prometer OCR ni texto en todos los PDF.


### Contexto con origen y actualización explícita
ActiveContextSourcesDialog presenta copia y origen con controles persistentes. AiPromptInput invalida respuestas al cambiar proyecto y bloquea reenvío tras resultado incierto hasta nueva revisión. API contextOrigin exige prueba e ID criptográfico; acuse incierto consulta una vez sin repetir POST.


### Reunión local de historiales con contenido idéntico
ProjectRemoteReviewDialog incorpora confirmación de reunión local solo cuando Rust la declara disponible. SDK envía una vez y consulta el mismo recibo ante acuse incierto. ID se genera antes de enviar y se conserva en UI; catálogo permite observarlo tras remontaje. Controles fuera del listado desplazable. Árboles distintos continúan en revisión.


### Recuperar recursos históricos como archivos nuevos
HistoricalResourceCopyDialog presenta revisión y recibo, useHistoricalResourceCopy coordina intentos/ámbito, SDK historyCopies verifica origen/acuse y consulta sin reenvío. Campo/recibo sobreviven a error y revisión fallida. App aplica árbol solo al proyecto y época capturados. Reabrir desde catálogo consulta el intento existente; efecto visual una vez por intento/montaje. Sin negocio filesystem en React.


### Estructura completa acotada y vista pendiente
projectTabs conserva pestañas del proyecto y selección cuando treeAvailable=false; solo una lectura completa permite podar. ProjectTreeReadIssue presenta última vista o ausencia de vista, reintento y búsqueda. App separa efecto y vista, controla refrescos por ámbito/secuencia y agrupa consulta concurrente; copias históricas notifican ausencia/recuperación de vista por separado. Aviso visible con navegación oculta y en móvil; Milkdown sigue abierto.


### Extraer texto sin registro comprobado
RecoveryReviewSection ofrece revisión de contenido sin registro para filas no comprobadas; formato1 Markdown y2 resumen de nota. RecoveryContentDialog mantiene confirmación y controles visibles, exige nueva revisión tras entrega incierta y descarta respuestas de otro ámbito. SDK recoveryExtract valida identidad/flags/límites y usa transporte Tauri; no simula entrega en navegador normal. Lógica de origen/publicación en Rust.


### Combinación guardada por archivo
MixedSelectionDialog renderiza selección/pedientes/confirmación; useMixedSelection coordina ámbito y acuses. API mixedSelections valida y conserva un ID ante acuse incierto, sin repetir POST; API projectRemoteReview liga publicación a selección. Catálogo reabre sin RAM previa. Diálogo padre se oculta visualmente mientras se revisa la combinación. Revisión conservada tras publicar se identifica como anterior.


### Propiedad de sesión y resumen móvil ·107–108
`projectWork`/`useProjectWork`: lecturas por superficie/visita y admisión inmediata por proyecto. Cambiar/volver o desmontar invalida callbacks visuales; el trabajo runtime ya admitido termina sin repetirse. App limpia el resumen antes de confirmar otro proyecto; cierre de una operación antigua no libera otra.


### Recuperación incompleta, dominios y teclado ·109–111
Guardado/sincronización usa ModalFrame. Restauración prueba visibilidad/foco efectivo y fallback a landmark principal con tabindex-1 si resize oculta el launcher; respeta propietario anidado e inert previo. No desplaza el documento.


## Esperas y transiciones ·127

`lib/api/errors` define ApiError con outcome/code/operationId; `client` mantiene su reexportación. `lib/runtime/localOperations` controla el ciclo de espera, conserva incertidumbre y publica un almacén externo estable; `lib/api/operationRuntime` contiene el puente de observación/cancelación. `nativeClient` entrega intenciones revisadas por el contrato Rust. Los componentes no invocan proveedores ni ficheros.

`LocalOperationsNotice` se suscribe sin introducir otro gestor de estado. Aviso tras750ms o inmediatamente ante incertidumbre; detalle opcional limitado a38dvh, filas pendientes primero, historia recogida y objetivos44px. Diagnóstico de sesión con50 entradas y omisión explícita del resto; no copia etiquetas o contenido. Un timeout libera la espera visual y conserva la observación; no cambia una operación en running a cancelled ni descarta revisiones nuevas.

`updateProtection` y `useWorkspaceExit` coordinan intención de transición, protección y autorización nativa. Fallo devuelve el espacio; no fuerza el cierre. Antes de instalar Windows se vuelve a capturar el trabajo creado durante la descarga. Android, cuyo puente une descarga/instalación, protege desde antes de iniciarlo. La vista pausa entradas mientras mantiene el estado en memoria y no sustituye borradores por una carga remota.
