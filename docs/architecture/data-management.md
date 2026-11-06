# Data Management And Clean Distribution

KnowNext.ai packages must contain application code, static UI assets, native runtime files, and signed updater metadata only. They must never contain user projects, Markdown documents, drafts, logs, notes, credentials, API keys, generated AI assets, caches, or development seed data.

## Product Invariants

- A clean installation starts with no projects.
- A clean installation must not show `Proyecto Alpha`, `Proyecto Beta`, `Proyecto Gamma`, sample documents, mock users, or stale tabs.
- Updating an existing installation must preserve data that belongs to the same app identity, runtime profile, and native storage location.
- Uninstalling and reinstalling follows the platform default. Windows may leave per-user app data unless the user removes it; Android clears app-specific data on uninstall.
- Runtime profiles are isolated. Desktop, browser development, Android, and tests must not import data from each other unless a migration is explicitly implemented.
- Product data belongs in Tauri/Rust-managed local storage, not in client bundles or installers.

## Windows Installed App

The installed Windows Tauri app uses the local Rust runtime with the Tauri app data directory. Installer updates replace program files and keep this directory intact, so project metadata, config, credentials, drafts, logs, notes, and managed project folders survive an update.

The package itself must not include files from that app data directory. Release checks should inspect installers and generated application resources for:

- `projects.json`
- `credentials.json`
- `notes.json`
- `drafts/`
- `logs/`
- `ai-conversations/`
- `sk-` style OpenAI keys
- removed runtime markers checked by `scripts/check-client-bundle-clean.mjs`

## Android App

Android is a native Tauri APK/AAB with local Rust runtime contracts. It must not depend on a workstation process or product runtime endpoint.

Android app-local state is managed by Tauri/Rust storage. Android updates installed over the same package preserve app storage when package id, signing certificate, and version progression are valid.

The APK itself must not include workspace data, logs, credentials, generated AI assets, or development caches. Clean Android acceptance requires creating a project and editing Markdown offline with no external service running.

## Development Data

Browser development and automated tests may use isolated data directories and fixtures. Those fixtures must not be bundled into release assets or silently shown in normal product use.

Release validation must run `pnpm bundle:check-clean` after building the frontend and must verify packaged Windows and Android artifacts do not contain runtime data or removed runtime markers.

## Handwritten Notes

Handwritten notes are first-class project documents stored as `.knote` files with MIME `application/vnd.knownext.handwritten-note+json`. They are part of the project tree, local history, sync status, search classification and AI context contracts in the same way as Markdown documents, but their source format remains the structured `.knote` JSON rather than Markdown.

The `.knote` source file is versioned with the project. It stores schema version, stable note/page/stroke IDs, timestamps, page backgrounds, stroke points, derived vector paths, OCR/transcription text when available, bounds and thumbnail metadata. Runtime services must validate this structure before saving or exporting. Active pencil presets are app-level user preferences in `config.json` under `handwritten.toolPresets`; changing them must not mark an open `.knote` as dirty.

Drafts for handwritten notes live in app data, not inside the project folder. Render caches and thumbnails also live in app data and are never versioned. A generated render is written into the project only when the user explicitly exports it or inserts a page into a Markdown document.

Images inserted from a handwritten note are normal project assets under `assets/handwritten/`. The Markdown image title carries source metadata in the form `knownext-note:<noteId>#<pageId>` so the app can offer `Abrir nota original` behavior without treating the render as the source of truth. Moving generated images must follow the same Markdown reference rewrite rules as other project images.

Clean-distribution checks must continue to reject runtime data and caches, including `.knote` drafts, render caches, OCR caches, thumbnails and generated assets that belong to a user's project rather than the application package.


### Imágenes, exportación y referencias · corte 21
ALT no transporta el tamaño nuevo. El Markdown sigue siendo una imagen normal, seguida solo cuando procede por `<!-- knownext-image: {"version":1,"ratio":0.5} -->`. No se recupera automáticamente texto que una versión anterior ya hubiese sustituido sin copia conservada. Los comentarios ajenos/futuros no se borran del documento.

`knownext-docs::markdown_images` usa pulldown-cmark y el lector HTML estructural existente para enumerar apariciones reales, ALT literal y posiciones; excluye frontmatter, código, comentarios y ejemplos de script. Almacenamiento usa esas apariciones tanto para referencias de assets como para preparar exportaciones. Las posiciones se calculan en un recorrido lineal. Las rutas siguen resolviéndose bajo la raíz de proyecto.

DOCX/PDF interpretan una anotación v1 estricta adyacente, conservan el pie de imagen y aplican el ratio dentro de sus límites de página; no imprimen las anotaciones propias completas ni las confunden con ejemplos dentro de código. Apariciones repetidas comparten bytes de asset, conservando descripción/pie/geometría e identificador DOCX por aparición. La descripción DOCX se incluye en docPr/descr. No se declara equivalencia física con una ventana responsive, PDF etiquetado accesible ni cobertura CommonMark integral del exportador por líneas.

### Asociaciones de proyectos retirados · corte 22
`knownext-storage::project_lifecycle` conserva `retired-projects.json` v1, máximo 256 identidades y 8 MiB. Solo admite metadatos conocidos de proyecto/repositorio; no copia claves ni extensiones desconocidas. Un catálogo futuro, dañado, enlazado o fuera de límites bloquea la operación y se conserva. No descubre ni migra automáticamente asociaciones retiradas antes de existir este catálogo.

La ficha se escribe antes de quitar el proyecto de `projects.json`. Si falla la segunda escritura, registro y ficha permanecen y el inventario informa que sigue registrado. El reintento concilia por identidad. Reincorporar requiere ID/revisión y nombre válido, carpeta original disponible, raíz canónica conservada cuando se pudo capturar y ausencia de colisiones de nombre/ruta. Recupera el ID original sin copiar, fusionar ni crear documentos; deja el proyecto inactivo y la sincronización en pausa. Una identidad ya registrada nunca se sobrescribe al repetir un acuse perdido. Las entradas conservadas no se eliminan automáticamente.

La preparación de metadatos/rutas se ejecuta fuera del mutex global; la confirmación revalida las huellas JSON bajo la autoridad de mutación antes de escribir. Esto coordina el proceso actual, no equivale a CAS entre procesos ni prueba identidad física de una carpeta por inodo. Los borradores, pestañas y expansión del árbol del proyecto se conservan. El mapa de almacenamiento, revinculación de carpetas ausentes, cuotas y limpieza regenerable continúan en F17.

### Consulta del almacenamiento local · corte 23
`storage_usage` expone GET `/api/storage/usage` como snapshot independiente del mutex de mutaciones. Consulta solo metadatos de archivos regulares bajo app data: máximo 10.000 entradas y presupuesto cooperativo de 2 segundos. El presupuesto no interrumpe una llamada al sistema bloqueada; la ejecución vive en el worker nativo y no ocupa autoridad sobre otros guardados. Se omiten enlaces/reparse points, se verifican directorios bajo la raíz y no se leen contenidos documentales o de credenciales para medirlos.

La suma usa longitudes lógicas por entrada, no bloques asignados ni espacio libre del dispositivo; un hard link puede contar por cada entrada. La medición en vivo no es atómica. Límites, enlaces omitidos o elementos inaccesibles vuelven parcial el resultado; los valores son cotas inferiores, no ceros fiables para lo no recorrido. Los errores de registro/catálogo se informan por código sin reemplazarlos, manteniendo la medición independiente.

Nueve grupos estables distinguen fuentes/historial gestionado, recuperación (incluida `.knownext-trash` dentro del proyecto), grabaciones, trabajo IA, plantillas, preparaciones, índices/vistas, preferencias/acceso y otros. Todos se conservan: la clasificación no habilita borrado. Las notas globales son contenido documental. Las ubicaciones registradas/retiradas se enumeran hasta 256 desde sus contratos; ninguna raíz externa se recorre ni crea para completar el mapa. No se deduce disponibilidad o tamaño individual de cada proyecto. El endpoint no acepta carpetas arbitrarias ni ofrece limpieza.

### Frontera del índice textual IA · corte 24
`ai_index_store` valida identidad portable registrada antes de formar `ai-index/<id>.json`; rechaza raíz/directorio/archivo enlazados o no regulares. Lectura real máxima 64 MiB, colecciones acotadas y contrato local conocido: se admite el formato heredado sin versión y el v1, conservando bytes desconocidos, futuros, dañados o de otra identidad. Lectores, regeneración y limpieza pasan por esa frontera. La lectura no reescribe el archivo; la revisión SHA identifica sus bytes exactos.

El estado distingue índice ilegible de ausente: `status:error`, error explícito, `indexReadable:false`, revisión/tamaño desconocidos. No bloquea por sí solo la configuración IA independiente ni expone el contenido del archivo. `documentCountKnown` distingue ausencia de medición de un cero conocido. El contexto RAG no utiliza contenido de un índice que no supera la validación; las fuentes explícitas conservan su contrato independiente.

DELETE exige la revisión SHA observada y no elimina una generación posterior. Fallo de retirada conserva el archivo y se propaga. Las preferencias se limpian solo si pertenecen a ese proyecto y se mantiene el interruptor RAG. Si la retirada/reconstrucción se completó pero falló después la persistencia de preferencias, el error identifica ese efecto parcial: no se comunica éxito íntegro. Consultar estado no repite la mutación. Archivo y config siguen siendo escrituras separadas; no se promete una transacción entre ambos ni CAS entre procesos. La regeneración conserva fuentes, pero su planificación global, límites de todo el corpus y la revisión de todos los candidatos a limpieza continúan en T04/F17.

### Sustitución explícita por disco · corte38
Los comandos POST /api/documents/:id/draft/discard-and-read y /api/handwritten-notes/:id/draft/discard-and-read construyen el registro de disco sin recuperar borrador y solo después retiran la recuperación verificada. Devuelven ese mismo registro: no existe una lectura posterior que pueda fallar tras el descarte. Una nota futura/no verificable y una fuente ilegible conservan el borrador. La fuente no se modifica. El gateway mantiene estos comandos bajo autoridad de mutaciones.

Frontend serializa por documento, reserva el ID de guardado y verifica revisión antes/después. Sustitución confirmada actualiza referencia de sesión y vista; fallo, acuse incierto o edición nueva reprotege el contenido actual incluso si ya estaba reconocido como persistido. Se conserva base original para detectar cambios externos posteriores. No es una transacción con editores externos ni entre procesos. La actualización remota conserva el borrador hasta respuesta synced y lectura de disco válida; pausas/conflictos no confirman sustitución.

### Puntos manuscritos compatibles · corte40
El validador estructural compartido acepta2a6coordenadas finitas por muestra. React ya emitía x,y,presión,tiempo,tiltX,tiltY; el límite anterior4rechazaba notas válidas en transferencia/exportación/búsqueda/indexación y carga de disco estricta. Se conserva la muestra íntegra, sin migración de esquema ni recorte de inclinación. Hardware/lápiz físico sigue sin aceptación.

### Integridad secundaria y migración revisada · C43–C44
Conversaciones/contexto usan ai_private_state: lectura32MiB/10.000entradas, forma/versión/propietario y carpetas/archivos regulares. Ausencia es distinta de corrupción. Preflight antes de IA y validación antes de escritura; errores de contexto se propagan y pérdida de historial posterior al cálculo devuelve conversationWarning sin perder resultado ni repetir proveedor. No es CAS entre procesos.

state_migrations añade GET/POST /api/recovery/upgrade y GET /api/recovery/upgrades/:id, GET listado y POST /restore. Cohorte: config.json hasta esquema3, projects.json hasta2 y export-template.json hasta2. Lectura/versión conocidas, huella conjunta y backups privados exactos de presentes antes de reemplazar. Diario bajo migrations/<id> acotado64KiB; fuentes8MiB por archivo. No crea estados ausentes, no migra futuros y bloquea credenciales en claro reconocidas antes de copia. Exclusiones: credenciales (propietario nativo), documentos/Git/audio y borradores (migración propia).

Revisión de recuperación deriva estado real de hashes antes/después y copias verificadas, no solo del último acuse. Solo restaura estados originales/aplicados sin cambios posteriores; fallos parciales detienen sin rollback destructivo ni reintento automático. Las copias se conservan sin caducidad; restaurar requiere reiniciar preferencias y no promete downgrade. El listado no ejecuta pasos. Quedan inventario/migraciones de formatos restantes y aceptación instalada de actualización completa.


### Combinación revisada de conflictos Markdown
GET /api/documents/:id/conflict revisa fuente UTF-8 regular de hasta2MiB, revisión del borrador y ubicación canónica. POST exige esas tres bases, conserva local/disco/propuesta con manifiestos verificables de recuperación, vuelve a revisar y cambia únicamente el borrador. Su base pasa al disco consultado; guardar sigue siendo una acción explícita. El protocolo no promete CAS frente a procesos externos ni combinación automática a tres bandas. Draft futuro se conserva como incompatible. Cola y revisión RAM evitan adoptar respuestas antiguas; un ACK perdido se observa mediante lecturas, nunca mediante reenvío automático.


### Estado operativo IA
Consumo e investigación tienen fronteras validadas independientes del historial:32MiB para consumo/trabajos,64KiB para política. Consumo conserva el límite existente5000registros; trabajos admiten hasta10000entradas como presupuesto de lectura, no cuota comercial. JSON dañado/futuro, extensiones no conocidas y otro propietario bloquean mutación. Ausente no crea archivos al consultar. Escrituras de política/estado devuelven Result; no se serializan resultados fallidos como éxito. Colas compartidas entre clones impiden read-modify-write superpuestos dentro del proceso.

Cada trabajo nuevo referencia el runtime que lo inició. Consultar uno activo de un runtime anterior lo presenta interrumpido, conserva información y no reanuda proveedor ni reescribe el registro. Falla de confirmación final se observa en memoria acotada mientras vive el proceso; al reiniciar actúa la identidad anterior. ready/ready_pass/ready_warning y fallos/cancelados son terminales. Consumo ilegible impide preparar una llamada nueva; fallo de registro posterior devuelve usageWarning junto al resultado y nunca repite generación. Una consulta de consumo fallida es desconocida, no un cero verificado.


### Credenciales y propietario del estado
Las credenciales nativas solo migran el formato legado conocido. Desconocidos/futuros/extensiones, archivo no regular o fuera de límite se conservan; se revalidan bytes antes de reemplazar. La migración sigue perteneciendo a su protección DPAPI/Keystore y nunca entra en backups genéricos de configuración.

El proceso instalado mantiene una concesión del SO en runtime-owner.lock antes de sus servicios. Es archivo estable sin contenido: no borrar por antigüedad/PID para desbloquear. Otro proceso cooperante con el mismo estado falla sin iniciar sus servicios. Android comparte la concesión entre setup y worker/grabación, incluso si el primer inicio sucede en segundo plano. Directorios distintos son independientes; no es CAS de archivos externos ni coordinación de proyectos compartidos entre perfiles.

### Auxiliares
Notas, actividad, estado público de sesión, desafío de dispositivo e índice de imágenes ya no reconstruyen vacíos escribibles tras un error. Sus formatos actuales conocidos se validan y los futuros se conservan. La actividad conserva su nomenclatura histórica con guiones sustituidos por subrayados: el propietario se comprueba contra el identificador real, nunca contra una inversión ambigua del nombre. Sesión dañada/futura devuelve aviso sin contenido/secretos. Logout revisa su estado antes de retirar credenciales. Error de actividad después de commit se comunica como advertencia; no convierte el commit completado en una operación para repetir.


### Metadatos de grabación
Servicio compartido Windows/Android: lectura regular/acotada4MiB; Settings/Session/Chunk/Destination desconocidos se rechazan y conservan. Reabrir calcula recuperación en memoria sin reescribir manifiesto ni truncar PCM. Primer cambio de una sesión recuperada guarda copia verificada en sessions-recovery. Hash de base y formato se revisan antes de efectos/escritura, incluida eliminación de audio; no hay CAS frente a un editor externo que escriba después de la última revisión.

Preferencias incompatibles mantienen app y sesiones consultables, con settingsError/settingsRecoveryRevision/unavailableSessions en snapshot. Iniciar/prueba/cambio de preferencias bloqueados hasta revisión. recover-settings exige huella actual, conserva copia exacta en settings-recovery y aplica preferencias conocidas sin autoinicio Windows. ACK perdido no se repite; consulta confirma disponibilidad. Las copias no caducan automáticamente y su gestión/cuotas queda pendiente. No se copian ni modifican archivos PCM al revisar metadatos. Procesamiento interrumpido pasa a atención y no se reanuda al abrir.


### Revisión de originales operativos conservados
recovery_system.rs enumera únicamente ai/usage-migrations y sessions-recovery/settings-recovery de recordings/recordings-dev. Lectura de metadatos1000/2s y lectura individual32MiB; resumen2MiB. IDs son digest de origen/nombre, no rutas aceptadas del renderer. Revisión calcula huella y distingue la coincidencia del digest de nombre de una huella de copia sin procedencia verificable. Formatos futuros/ilegibles se preservan. GET independientes de mutaciones documentales; ninguna ruta restaura/elimina estos originales.

export_system_recovery verifica huella y congela bytes en Rust antes del selector. FrozenRecoveryCopy no se serializa al frontend. Salida Windows exclusiva, fuera del estado privado y verificada; Android usa StagedUserExport y la entrega nativa existente. El estado activo no participa ni se reemplaza. Las familias de copias/migraciones adicionales y sus restauraciones específicas continúan en F04/F17.


### Originales críticos dentro del centro
El catálogo de copias incluye state-recovery/state-*/config.json/export-template.json y migrations/migration-*/config.json.original/projects.json.original/export-template.json.original. Rutas fijas y cohortes validadas; no recorrido genérico de directorios. Resumen no expone valores ni certifica formato. relatedRecoveryId solo enlaza a la revisión de cohorte existente, que conserva la autoridad para restaurar. Diario futuro o cambio posterior bloquean esa recuperación. Conservar bytes individuales no aplica/restaura estado.


### Bloque80 · revisión acotada y comprobantes de lotes recuperables
T03/T04/T10/F15: la huella histórica se conserva, con presupuesto compartido por selección y revalidación previa: 20.000 entradas, 1GiB leído, 64 niveles y 5s cooperativos. Conteo anterior a recoger entradas; bytes reales leídos. Copia conserva sus límites menores de10.000 entradas/128MiB y añade profundidad/tiempo; contexto también limita recorrido. No hay plazo duro sobre una llamada bloqueante del SO. Superar la revisión no crea trabajo ni cambia fuentes. Interrupción durante copia conserva originales y requiere revisar el destino parcial, sin repetición automática.

El ensayo profundo reprodujo desbordamiento de pila por búfer64KiB en cada nivel; ahora una única reserva en heap se comparte por recorrido. Después reprodujo un segundo defecto: el resultado repetía el árbol recursivo completo en cada ítem y en el registro final; con una carpeta ajena profunda, el propio diario dejaba de poder deserializarse tras copiar un archivo normal. Corregido guardando efectos sin árboles ni children recursivos de carpetas; afectados, contenido/base de documentos, rutas, avisos y estados se conservan. El escritor comprueba que sus bytes son legibles con el lector estricto antes de publicar, además del límite16MiB y revisión de origen existentes. Formatos futuros/extensiones siguen bloqueados.

GET/resultado reconstruyen una única vista actual del árbol, en memoria, sin reescribir el comprobante ni repetir efectos. treeAvailable=false distingue comprobantes o fallo de vista de un proyecto vacío válido; la UI conserva el árbol anterior en ese caso. fileBatchEffects aplica los cambios por documento una sola vez y adopta la vista final una sola vez; conserva correspondencias de carpetas abiertas y no remapea originales al duplicar. Se mantiene formato de lote1 y huellas históricas; registros heredados legibles se consultan sin conversión automática. No se repara por suposición un registro antiguo ya ilegible.


### Bloque81 · divergencia por proyecto revisable y confirmación falsa retirada
F06/T03/U09: la ruta antigua POST sync/conflicts/:id/resolve solo devolvía sync_status; App ignoraba su estado y anunciaba sincronización completada. Esa ruta ahora devuelve409 explícito sin consultar red ni modificar fuentes; las cuatro resoluciones antiguas están bloqueadas. Retirados controlador/callback/diálogo y acciones de reemplazo que prometían resolver sin implementación. En divergencia se inhiben tanto acciones remotas globales como por fila; no se retira guardar ni revisar documentos. El resumen distingue revisión del proyecto de conflictos de documento.

GET /api/projects/:id/sync/remote-review inspecciona exclusivamente HEAD, referencia origin conocida y base común única. Diffs raw con renombres Git, altas/bajas/modificaciones/tipo, recursos y tipos no regulares identificados sin leer su contenido ni ejecutarlos. Contrasta ubicación canónica, origen/referencia por huellas y commits completos antes/después; no expone URL ni nombre de referencia. 2MiB de salida por comando,10.000 cambios por lado y1.000.000 de comparaciones cruzadas máximas; el límite de salida no es un timeout de proceso. No fetch, checkout, cambio de índice, commit, fusión ni push. Las fuentes locales se conservan al rechazar rutas no portables, formatos ambiguos o falta de base común interpretable.

Coincidencia incluye rutas anteriores/actuales y relaciones carpeta-descendiente; marca mismo resultado solo si todos los cruces coincidentes concuerdan en contenido/modo/acción/ruta. No declara un conflicto de texto por coincidir una ruta. Solo abre documentos Markdown locales regulares; una ruta remota nueva/recurso/tipo no regular no se convierte en lectura o ejecución. La revisión queda limitada a versiones registradas: no incluye borradores/cambios sin commit ni acredita actualización remota reciente.

ExternalChangesDrawer ofrece Revisar divergencia y ProjectRemoteReviewDialog con lados independientes, contadores, filtro de coincidencias, renombres, recursos/tipos manuales y apertura de documento para comparación existente desde Historial. Metadatos de base progresivos; filas50 por tramo. Cierre/consulta en pie fijo,320px con ambos lados y acciones en una fila. Error de refresco retira datos antiguos; respuesta tardía de otro proyecto no se adopta. No hay botón de aplicar ni promesa de sincronización resuelta.


### Bloque82 · reserva cooperativa durante combinación y rechazo sin falsa confirmación
T03/T04/F06: las concesiones de proyecto ahora comparten en memoria admisiones de escritura y una reserva exclusiva de publicación, entre clones e instancias LocalApi del mismo perfil/fuente canónica. No crea otro archivo ni borra/reemplaza owner.lock. Admisión normal no serializa por sí sola escritores ordinarios; siguen actuando sus huellas/revisiones. Reserva exclusiva no espera ni intenta ascender un permiso activo, evitando bloqueos al estar dentro de otras colas. Anidación del mismo hilo permitida; un hijo vivo mantiene la reserva aunque se libere antes el padre. Permisos no transferibles de hilo, liberados por Drop.

Aplicación de conflictos Markdown y notas adquiere reserva exclusiva solo en publicación/conservación, no mientras el usuario lee o elige bloques/páginas. Entrada API de escrituras documentales/borradores, nodos/lotes, restauración de papelera, recursos y operaciones Git pertinentes participa mediante lista de rutas explícita. Consultas y detención de lotes no esperan esa reserva. Publicación directa del documento de grabación y copia de resultado IA participan también, aunque se ejecuten fuera del gateway. Commit local de interacción IA obtiene admisión después del proveedor: rechazo conserva resultado revisable y no aplica fuentes ni repite generación. Metadatos privados ajenos a escritura de fuente no requieren abrir una carpeta inaccesible.

No se declara un planificador general ni transacción de registro de proyectos: asociación/retirada/migración siguen bajo autoridad nativa existente. Una futura resolución global del grafo debe poseer además esa autoridad y sus revisiones de registro; esta primitiva no basta para resolverlo ni es CAS ante programas externos. Lecturas pueden observar cambios; no son instantáneas globales. Otros procesos cooperantes siguen bajo concesión del SO anterior. No se liberan reservas por antigüedad/PID.

Rechazo previo del gateway devuelve409 estructurado, code=project_write_not_started, operationOutcome=not-started y checkedAt. ApiError conserva exclusivamente ese resultado explícito; no lo infiere de409 ni analiza texto español. Confirmadores Markdown/nota no convierten ese rechazo en ACK perdido ni en éxito por encontrar contenido que ya coincidía. Solo los resultados inciertos siguen la conciliación de lectura existente, sin reenviar. Aviso de error fuera del contenido desplazable y acotado/consultable por teclado en ambos diálogos; controles finales visibles.


### Bloque83 · recibos de combinación y consulta sin repetir el intento
F06/T02/T03/U09: conflict-attempts/attempt-*.json formato1 estricto, máximo64KiB por recibo y presupuesto previo1000 registros/16MiB/revisión2s. Guarda identidad de intento/documento/tipo, operación nativa, hash canónico del pedido, fase, huellas de copias/registros y revisión esperada del borrador; no duplica texto, trazos, prompts ni credenciales. La revisión de cada copia usa pareja copia/manifiesto revalidada, documento y operación de procedencia exactos. Copias y recibos sin caducidad automática; gestión/archivo de esta familia sigue en F04/F17.

Cliente crea identidad criptográfica opaca por envío. Antes de conservar copias se reserva un recibo nuevo exclusivo; reutilizarlo no ejecuta de nuevo. Fases preparing/ready/applying/completed: copias comprobadas antes de ready, destino del borrador registrado antes de publicar, comprobación final antes de completed. Escrituras con revisión de bytes, formatos futuros/extensiones/entradas no regulares/recibos demasiado grandes conservados y bloqueados. Fallo deja estado/copies para revisión; jamás se continúa al abrir o consultar. No se promete CAS frente a editores externos ni una transacción del disco/Git.

POST documents/:id/conflict-attempts/:attempt/review y equivalente handwritten-notes es una consulta auditada independiente, no una reaplicación. Exige el pedido original, verifica su hash, copias y metadatos exactos, ubicación/fuente/revisión actual del borrador y vuelve a comprobar tras leer el resultado. Devuelve absent/pending/changed/confirmed. Un corte tras publicar y antes de cerrar el recibo puede confirmarse solo si su fase, todas las copias y postcondición coinciden; la consulta no repara el registro. Referencia remota cambiada o copia alterada no se atribuyen como éxito. Recepción confirmada devuelve IDs reales de copias, no una lista vacía inferida por coincidencia de texto.

Los confirmadores de interfaz requieren recibo; eliminada conciliación basada solo en contenido coincidente. Una respuesta incierta realiza una consulta del intento, sin otro envío ni consultas paralelas redundantes de documento/revisión. not-started no consulta. Intento pendiente conserva pedido/elecciones en RAM; diálogo bloquea modificar el envío anterior y ofrece Consultar intento, Nueva revisión y Cerrar revisión. Consultar vuelve a verificar el mismo ID sin callback de mutación; una revisión nueva es una acción separada. Aviso fijo sobre el contenido desplazable y controles juntos a320px. Selección de versión completa ya no muestra contador engañoso de0 bloques elegidos.


### Bloque84 · borradores conocidos y conservación de la edición abierta
T02/T03/F04/F06/U09: reproducida una colisión real de contrato Rust: un checkpoint antiguo sustituía el borrador publicado por otra operación, aunque el archivo seguía igual. Ahora la UI envía expectedDraftWriteRevision en checkpoints, guardado/forzado, descarte, cargar disco y restaurar versión. SHA opaca del contenido físico del borrador, o null para ausencia conocida; separada del hash de cambios visibles. Rust reserva publicación frente a escritores cooperantes, comprueba esa revisión antes de efectos y responde draft_write_conflict o draft_state_unavailable con operationOutcome:not-started. Formato futuro, ambiguo o ilegible se conserva. El contrato interno previo sin campo no cambia de runtime; la interfaz nueva siempre lo envía.

Los acuses propios avanzan la revisión antes de liberar la cola por documento, también si hubo escritura, deshacer o trazos nuevos durante la espera. No sustituyen esa RAM. Recarga/base diferente rechaza el acuse antiguo. La limpieza posterior a guardar comprueba la revisión completa; si otro borrador apareció, lo conserva y devuelve aviso sin autorizar una revisión no observada. Notas usan una revisión estable frente a identidad/fechas de raíz; páginas, seis valores de puntos y demás contenido siguen vinculados. Traslado de identidad conserva esa revisión. Los resultados nativos de combinación e IA incluyen su revisión; se elimina cualquier campo homónimo propuesto por el modelo antes de ejecutar.

Una colisión suspende las escrituras de esa sesión sobre el borrador activo. La edición abierta se conserva como copia independiente mediante POST /api/recovery/local-edits/{id}, con ID criptográfico conocido; si no llega acuse, solo se consulta POST .../{id}/review. Una consulta ausente no autoriza cerrar/reemplazar ni reenvía automáticamente. Conservación exacta de texto/trazos/base, pareja copy.json/manifest.json comprobada y reapertura verificable. Reutiliza drafts-review y formato1; no duplica otro almacén. Máximo2MiB de Markdown/64MiB de copia; presupuesto previo1000 entradas/128MiB lógicos/2s cooperativos. No elimina copias para liberar espacio ni completa parejas parciales. No requiere que el registro o carpeta de origen estén disponibles. Gestión global de cuota/retención continúa pendiente.

Aviso compacto diferenciado del conflicto del archivo: Conservar y revisar borrador / Recuperación. Revisar primero confirma la copia de RAM y después lee el borrador actual; solo lo carga si la sesión sigue siendo la revisada. No descarta el borrador guardado. La copia conocida se muestra en Apartadas incluso si el inventario general es parcial. Checkpoints de cierre/transición incluyen sesiones bloqueadas aunque deshacer las haya dejado iguales al disco; necesitan conservación confirmada.


### Bloque85 · revisión de combinaciones después de reiniciar la interfaz
F04/F06/U09: Recuperación incorpora Combinaciones. El catálogo encuentra recibos persistidos sin depender del pedido que tenía el diálogo en RAM. GET /api/recovery/conflict-attempts revisa solo el almacén privado, con1000 entradas/16MiB/2s cooperativos y64KiB por recibo; limita antes de acumular, cuenta entradas desconocidas y mantiene recibos futuros/ilegibles sin acciones. No crea carpetas, migra estado, toca proyectos ni reanuda trabajos. Metadatos de documento/fase/fecha y revisión de bytes; no expone el pedido, prompts, URL de origen o nombres de ramas.

GET /api/recovery/conflict-attempts/{id} contrasta identidad del recibo, SHA de cada copia/manifiesto y operación/documento de procedencia, roles únicos y revisión completa del borrador privado. Lectura con presupuesto128MiB de copias, segunda comprobación del recibo/borrador, sin reconstruir ni ejecutar el pedido original. Si una copia cambió, conserva acceso a otras verificadas y muestra que el conjunto no está confirmado. Recibo preparando no infiere publicación por texto coincidente; fase applying/completed no implica resolución actual. Devuelve por separado draftMatchesRecordedPublication, copiesVerified y fileStateReviewed/remoteStateReviewed/canReplay=false. No confirma que archivo/origen/Git sigan iguales. Esa distinción impide atribuir éxito o sincronización a una mera coincidencia privada.

Inspección del borrador usa draft_store::inspect, que lee identidad/formatos/duplicados de borrador actual o legado sin migrar ni retirar el legado al consultar. Funciona aunque registro o fuente del proyecto no estén disponibles. La verificación de copias comparte lectura/hash con el contrato83; la vía antigua no construye filas de presentación ni añade validaciones de trazos repetidas.

Ver copias conservadas lleva a Apartadas con los IDs, huellas y roles comprobados del recibo. Esas copias siguen visibles aunque el inventario general sea parcial; ver contenido vuelve a comprobar huella y recuperar como otro archivo usa el flujo ya existente con conservación de originales. Sin proyecto, explica que hay que crear/abrir uno antes de elegir destino. Móvil usa el selector de categoría y conserva cierre fijo; resultados antiguos tras actualizar o cambiar de consulta no reemplazan la revisión vigente. El escaneo inicial no se duplica por remontaje StrictMode de desarrollo.


### Bloque86 · archivo reversible de recibos completados
F04/F17/U09: Combinaciones distingue Sin archivar y Archivados. Solo un recibo de fase completed puede archivarse o reabrirse; los intentos pendientes permanecen visibles para revisión. POST /api/recovery/conflict-attempts/{id}/archive-state exige revisión SHA exacta de los bytes y action archive/reopen estricta, revalida antes de publicación atómica y conserva ID, fase, hash del pedido, referencias/huellas de copias y postcondición. No escribe documentos, borradores o copias, no cambia el grafo y no reaplica el intento.

Se añade archivedAt opcional RFC3339 al formato1 de recibo, omitido si no está archivado. La lectura previa sin ese campo sigue compatible y no reescribe. Una marca en fase pendiente es incompatible y se conserva bloqueada; formato futuro/campos extra/revisión vieja/acción delete no mutan. Reabrir retira solo la marca conocida. Un archivo repetido con revisión vigente no cambia su fecha ni sus bytes. El recibo sigue existiendo y begin sigue rechazando reutilizar el ID, incluso archivado. No hay otro almacén, desplazamiento físico, caducidad ni borrado automático. Un lector previo estricto que desconozca el campo conservará el recibo sin aplicarlo; no se garantiza downgrade de la prerelease.

GET /api/recovery/conflict-attempts mantiene los recibos sin archivar; GET /api/recovery/conflict-attempt-archives filtra archivados con los mismos presupuestos. Entradas no compatibles pueden aparecer en ambos ámbitos porque no se infiere su marca. Archivo es organización de la lista: los archivados siguen contando en1000 entradas/16MiB, y la UI explica que no libera espacio. Eliminar/compactar exige preservar identidades antirrepetición y continúa pendiente junto a cuota global y retención de otras familias.

La acción se ofrece solo tras revisión fresca de un recibo completado. Durante el cambio se bloquean otras acciones de esa sección; cierre permanece accesible. Se envía una mutación y después se consulta el estado, también si no llegó el acuse. Una observación sin la marca esperada deja la acción deshabilitada hasta Revisar intento; no se repite automáticamente. Si se observa la marca, se retira la fila del ámbito y se muestra dónde está. Cambiar de ámbito requiere otra revisión antes de reabrir. La consulta no declara resuelto archivo/origen.


### Bloque87 · recuperar y descartar la copia que se revisó
T02/T03/F04: reproducido un borrado indebido real en el contrato de archivos ausentes. DELETE /api/drafts/{key} aceptaba solo la clave y eliminaba un borrador actualizado después de seleccionarlo. Ahora DELETE y POST .../{key}/restore exigen documentId, expectedFingerprint SHA de los bytes y locationRevision de la ubicación canónica. El SDK siempre envía esa revisión; una petición antigua sin ella no modifica datos. Rust reserva el proyecto frente a escritores cooperantes y verifica identidad completa, clave canónica o legado correspondiente, formato/tipo conocido, huella exacta, misma ubicación y archivo todavía ausente. Archivo reaparecido, origen no comprobable, dato futuro, clave/identidad o huella cambiadas conservan la copia. Se mantienen límites64MiB y rechazo de enlaces/entradas no regulares; no se promete CAS frente a escritores externos.

Servicio separado orphan_recovery.rs. Recrear conserva atomic create en destino libre: prepara el contenido validado y su límite antes de publicar, construye y comprueba el acuse del archivo antes de retirar recuperación. La limpieza vuelve a verificar bytes/identidad de la copia seleccionada; si cambió después de publicar, deja el archivo recreado y conserva el borrador nuevo/futuro con aviso. No devuelve una revisión privada no observada como autoridad de escritura. Copias duplicadas/legadas restantes se inspeccionan sin migración; solo una revisión semántica ya conocida puede formar parte del acuse. Markdown y puntos/presión/inclinación de notas conservados. No se sustituye un archivo reaparecido ni se reintenta una publicación incierta.

GET /api/recovery/orphans entrega schemaVersion1/items/limited/warnings/queriedAt, con prueba de copia y ubicación. Conteos y fecha derivan de la misma lectura acotada del inventario; se elimina la segunda lectura sin presupuesto de cada borrador para construir la lista anterior. Ubicación consultada una vez por proyecto y cobertura parcial explícita. La ruta anterior de lista mantiene el array; las acciones mutables requieren el contrato nuevo. No cambia formato persistido ni migra un borrador al consultar. UI conserva también filas de origen no disponible, con acciones deshabilitadas. El adaptador web mantiene datos de demostración centralizados; no se considera evidencia nativa.

Diálogo Ausentes: copia sin prueba no habilita acciones. Tras fallo o resultado incierto, bloquea el elemento y la confirmación hasta Actualizar completado; actualización fallida mantiene el bloqueo. El segundo descarte requiere confirmar la nueva copia. Error en el propio diálogo, sin duplicarlo en un aviso global. Cobertura parcial visible y avisos desplegables; una lista vacía parcial no afirma que no existan otras copias. Fechas ausentes no aparecen como1970. Consultas antiguas no sustituyen la revisión nueva. Restauración/descarte participan en la cola por documento; acuses actualizan refs antes de liberar la cola y conservan RAM posterior. Un borrador abierto con trabajo pendiente no puede retirarse desde esta lista. Recrear en otro proyecto conserva el espacio actual y ofrece seleccionarlo para abrir el archivo.


### Bloque88 · publicación completa sin reemplazar otro destino
T02/T03/F04/F15: movimientos, renombrados, entrada/restauración de papelera y publicación de proyectos preparados comparten rename_no_replace. La comprobación previa de destino libre ya no es la única defensa: si otro creador ocupa el nombre después, la publicación nativa se rechaza y ambas ubicaciones se conservan. Incluye carpetas vacías. No se usa fallback de copia/borrado o rename que sustituya contenido. Las sustituciones autorizadas de atomic_io::write mantienen su contrato separado.

atomic_io::create escribe ahora un temporal exclusivo en el directorio de destino, vacía su contenido y solo después publica sin reemplazo. Un error de escritura no expone un documento parcial ni limpia ciegamente la ruta pública. La limpieza del temporal solo se intenta si esa operación lo creó; un fallo al reservar su nombre no borra otro temporal. Un corte puede dejar el temporal privado para revisión; no se introduce poda automática. No se promete exclusión de procesos externos que alteren directorios antecesores o el contenido fuente durante la operación.

Windows usa MoveFileExW sin REPLACE_EXISTING ni COPY_ALLOWED, con rutas Unicode extendidas. Android/Linux usan renameat2 RENAME_NOREPLACE por syscall; si el kernel/sistema de archivos no lo admite, se rechaza conservando originales. Referencias del contrato: [Microsoft](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-movefileexw) y [Linux man-pages](https://man7.org/linux/man-pages/man2/rename.2.html). Sin servicios auxiliares ni cambio de formato de documentos.

Contrastado en Windows: ocho casos del módulo de publicación, tres casos de papelera y dos contratos afectados de movimientos/traslado de proyectos. Incluyen fallo parcial antes de publicar, creador tardío, carpeta vacía, conservación de fuente/destino, Unicode/ruta larga y cambio de mayúsculas. La rama Android del módulo y su syscall compilan para x86_64-linux-android con libc real; es comprobación de módulo, no ejecución en dispositivo ni APK. Sin suites completas ni cambios visuales del producto en este bloque.

Pendiente inmediato: revisión vinculada y límites del inventario de papelera, futuros/entradas desconocidas, resultados inciertos tras restauración. Retención/cuotas de otras familias, grafo Git transaccional, portabilidad y demás capacidades permanecen abiertos. Sin candidata, instalación o publicación.


### Bloque89 · papelera revisada antes de restaurar
T02/T03/T05/F04/F15/U09: GET /api/projects/{id}/trash/{entry}/review comprueba la entrada, propietario, ubicación canónica y hash de todo el contenido conservado. POST .../restore exige revision exacta; la interfaz separa Revisar de Restaurar y no acepta una revisión de otra entrada/proyecto. Cambiar contenido descendiente, metadatos o ubicación invalida la prueba. Rechaza destino ocupado y publicación usa no-replace88. Reserva exclusiva del proyecto frente a escritores cooperantes durante verificación/publicación; no promete CAS frente a cambios externos del contenido o sus antecesores.

Registros anteriores del campo conocido implícito1 continúan legibles sin reescritura. Deserialización estricta de propietario/entrada, formato/futuro o campos desconocidos se conservan sin autorizar operaciones. Se valida fecha RFC3339, identidad, estado, tipo y ruta; carpetas de papelera/entrada y archivos de metadatos no pueden ser enlaces/reparse points. Propietario limitado4KiB, entrada16KiB. Inventario cuenta todas las entradas, limita1000/2s cooperativos, acumula como máximo20 avisos más límite y expresa limited/queriedAt. Entradas desconocidas/ilegibles y tipo incompatible producen parcialidad; no se afirma vacío completo. La consulta no migra, repara, reanuda o poda contenido.

Revisión explícita del payload reutiliza el fingerprint de lotes: búfer único64KiB, profundidad64,20.000 entradas/1GiB/5s cooperativos. Revalida recibo/propietario/ubicación tras hash y vuelve a comprobar antes de restaurar. Un conjunto mayor permanece intacto para tratamiento fuera de esta operación; el límite no es una cuota global ni una garantía de latencia de hardware.

Diálogo con inventario y avisos a demanda, selección revisada y controles fuera del listado desplazable. Tras fallo/acuse incierto retira la autorización, bloquea la fila y exige Actualizar exitoso y otra revisión, sin reenvío automático. Actualizar fallido conserva el bloqueo. Un fallo al actualizar la vista después de acuse confirmado mantiene el resultado restaurado, sin convertirlo en otro intento. Respuestas antiguas no sustituyen el ámbito actual. El adaptador web conserva su demostración centralizada con token de fixture, sin representar la prueba SHA nativa.

Contrastado: tres contratos Rust nuevos: huella/petición sin prueba/destino reaparecido y restauración positiva; metadatos futuros/desconocidos preservados; carpeta/descendientes/capacidad del inventario. Después de refinar avisos/propietario se repitieron solo los dos casos afectados. Un caso legado dirigido conserva lectura/ignorado Git y no oculta otras entradas. Cuatro casos frontend de diálogo y uno del contrato SDK; TypeScript/diff correctos. Fallos iniciales de compilación por visibilidad de helper y await en router web síncrono corregidos antes de estos resultados. Sin suites completas, proveedor o APK.

Pantallas370–373 inspeccionadas: diálogo/hook reales, harness aislado y API de papelera controlada; no App completo, puente nativo ni movimiento real del perfil. Una selección rechazada, bloqueo visible, actualización/revisión nuevas y acuse separado; dos POST simulados con pruebas diferentes, solo uno aplicado en el fixture.320px sin desbordamiento y sin errores/red externa. El primer harness se corrigió para importar el default de react-dom; no fue fallo del producto. Los contratos Rust acreditan la conservación real en temporales propios.

Pendiente: recibo durable que permita atribuir/restaurar exactamente un acuse perdido tras reiniciar UI, inventarios/capacidad global y retención de otras familias, cortes compuestos/externos y resto del programa. La consulta de papelera no identifica por sí sola un destino existente como publicación propia. Sin aceptación instalada, candidata, publicación o cierre de paquetes.


### Bloque90 · consultar una restauración sin repetirla
T02/T03/F04/F15/U09: restaurar exige además attemptId criptográfico conocido por la interfaz. Antes del movimiento, Rust conserva un recibo estricto formato1 y un marcador del intento activo dentro de la entrada de papelera. El acuse incluye mismo ID y revisión; ante incertidumbre se consulta una vez GET .../trash/{entry}/restores/{attempt}, sin otro POST. Admisión explícita not-started no consulta ni presenta un recibo inexistente. El diálogo permite Consultar después y muestra los intentos del catálogo al volver a abrir, sin necesitar el pedido RAM anterior.

La consulta verifica identidad/proyecto/entrada, recibo y marcador activo, metadatos, propietario, ubicación, ausencia del payload y hash exacto del destino completo. applying puede confirmar postcondición tras un corte posterior al movimiento; nunca repara el diario ni reanuda la operación. Payload presente no confirma aunque el destino tenga texto igual. Un intento posterior invalida la atribución al anterior mediante el marcador: no se confirma el primero solo porque el segundo publicó los mismos bytes. Edición posterior del destino produce changed, no éxito actual. Sin CAS frente a escritores externos.

Recibo máximo16KiB, marcador4KiB,32 intentos por entrada y128 elementos para revisar su carpeta; no se reciclan IDs ni se podan recibos para liberar capacidad. Catálogo comparte tiempo cooperativo2s y limita1000 recibos/16MiB, además de los límites del inventario89. Campos/versiones futuras, marcador ilegible y cuota se conservan con revisión parcial o rechazo. Archivar/compactar estas identidades sigue pendiente. La consulta devuelve árbol actual como vista separada; si falla, treeAvailable:false evita vaciar el árbol del espacio. No ejecuta el movimiento.

UI exige identidad/revisión coincidentes, muestra consulta junto al intento y aplica los efectos de vista una vez por intento y sesión. Resultado no comprobado conserva bloqueo y datos; consulta explícita vuelve a leer el mismo recibo. Un callback visual fallido no convierte un resultado confirmado en otra mutación. Las fases del catálogo se presentan como fases del recibo, no como prueba del estado actual. El adaptador web conserva demostración centralizada; no constituye evidencia nativa.

Contrastes: tres casos Rust nuevos (corte tras movimiento sin reparación, intento posterior que no confirma al anterior, futuros/capacidad sin poda), un contrato API nuevo con reapertura de LocalApi y tres anteriores afectados por el pedido obligatorio; tras revisar el marcador futuro se repitió solo ese caso. Nueve casos frontend únicos entre diálogo/SDK/admisión, TypeScript y diff. Fallo inicial de tipo String en el nuevo módulo corregido antes de los resultados. Tres warnings antiguos de Result sin usar en tests de uso IA permanecen. Sin suites completas, APK o proveedor.

Pantallas374–377 inspeccionadas: diálogo/hook reales con API controlada y publicación avanzada solo por el fixture de runtime. Un POST, tres GET del mismo intento (automático y dos explícitos), desmontaje/montaje de UI y catálogo sin pedido previo; no es reinicio de proceso nativo. Dos acuses de vista, uno por montaje, sin repetir mutación.320px sin overflow/consola/red externa. Los cortes y conservación de archivos reales se contrastan en Rust con temporales propios.

Pendiente: retención/cuotas globales y demás familias, cortes de proceso instalados y fallos compuestos, migración ampliada, grafo Git transaccional, portabilidad y restantes capacidades del programa. Sin cierre de los11 paquetes, candidata o publicación.


### Extracción PDF e índice acotados
knownext-docs/bounded_pdf_text.rs concentra lectura de cuerpo PDF (lopdf_reader0.46, límites de entrada, objetos, streams, páginas, texto y tiempo cooperativo). No activa OCR, anexos ni acciones. knownext-storage local_search/corpus reutiliza por SHA y limita también el texto retenido de la consulta a32MiB; fallos/recortes son visibles y parciales. preview_text/build_ai_source/ai_upload_sources comparten extracción y explican fallo/sin texto. No cambia archivos originales ni formatos persistidos. Véase docs/product/revision-3.0-implementacion/avance-91.md para límites exactos y evidencia; contexto conservado no se refresca automáticamente.


### Contexto con origen y actualización explícita
Contexto IA: ai_context_origin.rs captura una vez bytes y prueba estricta formato1, verifica antes de envío y ofrece revisión/actualización explícita con recibo de copia. Legado no se vincula automáticamente; futuro no se reescribe. Proveedor/vista usan lista explícita y no reciben prueba, recibo o extensiones privadas. Índices existentes incompatibles no se omiten; índice ausente es estado inicial válido. Límites y semántica en avance92.


### Reunión local de historiales con contenido idéntico
remote_conflicts/project/join.rs reúne únicamente historiales divergentes con árbol completo idéntico, sin checkout/índice/escritura documental. commit-tree conserva ambos padres; update-ref compara punta local/remota en transacción. Recibo1 inmutable por intento antes de publicar; lectura confirma identidad del commit, árbol, padres y mensaje ligado al intento. Catálogo64/1MiB/2s y registro16KiB; futuros preservados, sin reanudación/poda. HEAD/origen/raíz no tienen CAS externo. Contrato y referencias Git en avance93.


### Resolver conservando la versión guardada del equipo
Reunión de historiales: recibo1 conserva únicamente modalidad de árboles idénticos, sin reescritura al consultar. Recibo2 exige resolution=keep-local y verificación del mensaje de commit ligado al intento. POST requiere además acknowledgeRemoteHistoryOnly=true. Se conserva el árbol local registrado y los dos padres, no se hace checkout ni se modifica índice/borrador. No es aplicación de variantes remotas. Modalidad/versión futura se conserva y rechaza. Véase avance94.


### Recuperar recursos históricos como archivos nuevos
remote_conflicts/project/copies.rs recupera blobs regulares de revisión vinculada a archivo nuevo, máximo32MiB, sin checkout/reemplazo. Ante eliminación usa base común. Ancla de enlace físico, identidad nativa y SHA distinguen la publicación de otro archivo idéntico. Recibo1/owner1 estrictos en .knownext-history-copies;64/128MiB/130 entradas/2s, hash64KiB/5s cooperativos. Inicialización completa antes de publicar namespace; futuros/parejas incompletas conservados, sin poda/replay. No es respaldo inmutable de edición en el mismo objeto. Detalles/plataformas en avance95.


### Estructura completa acotada y vista pendiente
project_tree.rs entrega vista completa acotada o error:48 niveles/20k entradas/10k visibles/8MiB/2s cooperativos; enlaces/privados excluidos por política. Nunca árbol parcial con éxito. Mutaciones adjuntan treeAvailable/treeWarning sin deshacer ni repetir un efecto por fallo derivado. Nuevos trabajos de investigación usan treeDeferred; consulta de vista separada. No instantánea FS atómica ni latencia dura.


### Extraer texto sin registro comprobado
recovery_incomplete.rs permite extraer Markdown conocido o nota estructurada compatible desde copy.json de un par no comprobado,8MiB/16KiB/2MiB. Vincula bytes/ubicación/contraparte, revalida antes de congelar; no adopta documentId/metadatos ni repara. Selector nativo escribe archivo nuevo; FrozenRecoveryCopy ahora fija MIME/extensión json, md o knote; contenido íntegro de la nota, sin metadatos privados de su envoltorio. No borra ni libera cuotas. Detalles/límites en avance97.


### Revisión omitida en escritura de borradores
draft_versions no permite omitir la revisión para sustituir, guardar, descartar o restaurar un borrador existente:428/not-started; estado no comprobable503. Primera escritura antigua sin borrador sigue admitida, bajo admisión exclusiva de proyecto. Todos los métodos mutation_document son transacción cooperativa no bloqueante aun sin campo; no adopción automática de una revisión ni formato nuevo. Condiciones internas restantes independientes.


### Límite de publicación de una restauración
Restauración completa: restore_version recibe el cuerpo con bases originales y revalida ruta, huella de archivo y revisión privada después de leer Git, justo antes de guardar. Cambio detectado no publica ni crea versión. No equivale a CAS del filesystem ni a revalidar todos los servicios internos.


### Combinación guardada por archivo
mixed-reviews conserva selección1 inmutable,64/256KiB por entrada/16MiB,256 rutas; fuentes originales y elección local/remota/preparada verificadas contra árbol guardado. Cambios fuera de selección o ámbito/índice sin registrar bloquean reunión. graph-joins3 vincula selección y publica mismo árbol con ambos padres sin checkout/índice/borradores. Pruebas de formatos1/2 conservadas. Almacenes de selecciones/recibos/lotes se contabilizan como recuperación.


### Respaldo completo de variantes · bloque104
Respaldo de variantes: `knownext.variants`1 exporta rutas/tamaños/SHA de Anterior/Elegida sin IDs/refs/configuración/autoridad. ZIP determinista de datos32MiB/40MiB archivo; verificación exacta no autoriza eliminación. Apertura en carpeta nueva; no Importar proyecto.


### Retirada revisada y separación de servicios ·105–106
`retirement.json`1 inmutable conserva hashes del respaldo/recibos y lista exacta de representaciones antes del primer unlink. Consultar parcial/retirado no continúa; otra retirada requiere revisión/confirmación y ZIP elegido/revalidado. Recibos/identidades nunca se podan ni reejecutan; cuota de IDs no se libera.


### Recuperación incompleta, dominios y teclado ·109–111
`mixed/application/incomplete`: inspección acotada de nombres conocidos y extracción unitaria de bytes opacos desde original/compacto. Recibos solo como huellas legibles, sin interpretar/adoptar; parcialidad explícita, revisión antes de congelar, ZIP `knownext.recovered-bytes`1. No es respaldo completo ni habilita retirada.


## Cierre y cuotas de identidades · 129

La conservación explícita traslada terminales conocidos a recovery-vault y libera su cupo activo. recovery-closures conserva la identidad permanente y bloquea su reutilización, también antes de crear un ID nuevo. No elimina los bytes del presupuesto global: se incluyen ambas familias. Una retirada posterior exige otro respaldo externo completo comprobado y conserva el diario/huellas. Dependencias pendientes impiden cierre.

Captura/transferencia nueva pasan por la admisión opcional (márgenes 32/384 MiB). La continuidad y el guardado permanecen exentos; no se promete cuota física absoluta. Inventarios parciales no conceden nueva admisión con límite activo. Véase recovery-lifecycle.md.
