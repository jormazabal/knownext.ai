# Compatibilidad y migración del estado local

Inventario de formatos propietarios observado en el código durante el programa3.0. No es un inventario de datos del usuario ni acredita una migración instalada completa. Las versiones de formato son independientes de la versión comercial: un formato compatible no se reescribe por cambiar de2.6 a3.0.

| Datos / ubicación lógica | Propietario | Tratamiento vigente | Pendiente relevante |
|---|---|---|---|
| config.json | local_state / state_migrations | Versiones conocidas hasta3; revisión y migración explícita con copia/diario | Piloto con preferencias representativas |
| projects.json | local_state / state_migrations | Versiones conocidas hasta2; preservar ID, raíz y asociaciones | Proyectos externos/compartidos y coordinación entre perfiles |
| export-template.json | local_state / state_migrations | Versiones conocidas hasta2; revisión, valores conservados y recuperación exacta | Muestras reales de estilo/exportación |
| credentials.json | credential_store + DPAPI/Keystore | Legado conocido se protege tras verificación; sobrev1 desconocido/futuro no se sustituye | Dispositivo nuevo, backup nativo y recuperación guiada del vault |
| auth.json / github-device.json | ancillary_state + autenticación | Formatos conocidos sin versión o1; futuro/daño bloquea acciones; no exponer secretos | Aceptación instalada y renovación real sin perder estado |
| notes.json | ancillary_state | Legado conocido o1; contenido Markdown obligatorio; fallo no produce vacío escribible | Reapertura y edición extensa instalada |
| drafts/ | draft_store | Identidadv2 basada en hash; legado conocido revisado; futuro conservado | Más escenarios compuestos de falta de espacio/concurrencia |
| drafts-review/ | recovery_review / document_conflicts | Manifiesto legado conocido o1, identidad/origen/huella/tamaño/retención/fecha/procedencia validados; pareja copia/registro revalidada. Futuro/extensión/inconsistencia se conserva sin permitir recuperación. Local/disco/propuesta antes de combinar | Cuotas, archivo y recuperación compuesta |
| state-recovery/ / migrations/ | local_state / state_migrations | Copias exactas privadas; diario y recuperación revisada que rechaza cambios posteriores | Campaña instalada, interrupciones y gestión de copias |
| ai/*.json por proyecto | ai_private_state | Conversación legada conocida o1; lectura acotada y propietario validado | Eliminación integral y política de conservación ampliada |
| ai-context/ | ai_private_state | Fuentes legadas conocidas o1; corrupción/futuro/otro proyecto bloquean mutación | Fidelidad y errores de extracción de todos los formatos |
| ai/usage.json | ai_operational_state / ai_usage/ledger | Legado/1 leído sin convertir;2 con agregados por periodo y detalle5000, checksum,20000grupos/64MiB. Conversión conserva original/revalida origen antes de sustituir; futuro no se normaliza | Presupuestos, puertas completas y piloto real |
| ai-research/ | ai_operational_state / investigación | Trabajos y políticas validados; formato conocido sin versión o1; ejecución antigua se observa interrumpida sin reanudar | Autoridad ampliada, resultados/costes reales bajo presupuesto y recuperación completa |
| ai-results/ | ai_results | Formato1; resultados revisables y límites de almacén; no ejecutar instrucciones antiguas | Gestión/archivo de resultados y cuota global |
| ai-index/ | ai_index_store / index_rebuild | Legado conocido/versión admitida; revisión por hash antes de publicar/reconstruir | Sincronización general del corpus y rendimiento medido |
| image-index/ | ancillary_state | Metadatos conocidos sin versión o1; futuro se conserva incluso al reindexar | Catálogo de recursos y planificación del trabajo largo |
| activity/ | ancillary_state | Formato conocido sin versión o1; propietario real validado con nomenclatura histórica | Conservación/cuotas y advertencias integradas en todos los recorridos |
| history-milestones/ / favorites/ | dominios respectivos | Formato1 estricto, revisión optimista e identidad de proyecto | Portabilidad y operaciones ampliadas |
| document-templates/ / document-templates-retired/ | document_templates | Formato1 conocido; revisión, cuotas y conservación de retiradas. Imágenes locales solo por preparación explícita como Markdown embebido | Adjuntos no imagen y aceptación instalada |
| project-templates/ | project_transfer/catalog | Registros1 estrictos64KiB y paquetes verificables,50 entradas/256MiB incluidas retiradas; revisar hash/revisión y conservar futuro/incompleto. Reempaquetado medido antes de publicar | Transporte instalado y catálogo múltiple |
| project-transfers/ | project_transfer | Trabajos y paquetes con manifiesto conocido; selectedPaths y templateId/templateRevision opcionales conservan lectura de trabajos anteriores y limita la exportación revisada; no reemplazar un proyecto existente | Historial, audio, borradores y preferencias en transferencia completa |
| retired-projects.json | project_lifecycle | Formato1; retirar asociación conserva fuentes y recuperación revisada | Archivo/cuotas y escenarios externos ampliados |
| file-batches/ | batch/state | Legado conocido o1, campos/estados/propietario/huellas validados,16MiB por registro; creación exclusiva y revisión de bytes antes de reemplazar. Consulta sin inicialización y recuperación acotada; sin replay de lotes interrumpidos | Mover/papelera/duplicar/renombrar/contexto usan planes conocidos; detención cooperativa sin replay ni rollback; recuperación compuesta pendiente, sin atomicidad del lote |
| .knownext-trash/ en proyecto | trash | Propietario y entradas conocidas; preservar payload y rechazar colisiones al recuperar | Gestión de conservación y lotes ampliados |
| previews/ | preview_store | Recibos conocidos/legado admitido; fuente separada y limpieza revisada | Frescura/conversión, otros cachés y PDFs extensos |
| logs/diagnostics-v1.json | diagnostics | Diagnóstico1 acotado y sin contenido privado | Aceptación y soporte de la candidata |
| eur-usd.json | currency | Legado conocido o1, fechas/referencia/estructura y64KiB; futuro/daño/no regular se conserva y bloquea refresh antes de red; revalidación de bytes en cada escritura | Fallos compuestos y presupuestos ampliados; no es historial de consumo |
| recordings[-dev]/settings.json | knownext-recording | Campos conocidos, sin pérdida silenciosa; recuperación explícita con copia y hash | Campaña instalada y gestión de copias |
| recordings[-dev]/*/session.json | knownext-recording | Campos conocidos; al reabrir no reescribir, original antes de primer cambio recuperado | Recuperación de sesiones no abribles y fallos de operaciones compuestas |
| PCM y archivos de audio | knownext-recording | Revisión no modifica el audio ni trunca finales impares | Integridad de operaciones de audio, sesiones largas y hardware real |
| Markdown, recursos y documentos de referencia | filesystem / knownext-docs | Conservar fuentes; cambios solo por operaciones explícitas revisadas | IR/exportación, fidelidad y formatos avanzados |
| .knote | knownext-docs / handwritten | Formato conocido validado antes de normalizar; fuente64MiB y revisión de conflicto16MiB. Futuro, campos/texturas/unidades incompatibles y páginas duplicadas se conservan incluso ante force. Borrador conocido sigue disponible si falla la fuente; combinación por páginas conserva tres copias y texto asociado | Migración/piloto con notas representativas, OCR y dispositivos físicos; divergencias entre dispositivos |
| .git / historial | servicios Git | El historial permanece bajo su propietario Git; la cohorte crítica no lo migra | Repositorios reales, remotos complejos y transferencia completa |
| Cachés de preferencias del frontend | capa de preferencias | Apoyo a la continuidad; el estado Rust sigue siendo la autoridad persistida | Revisar claves obsoletas y migración de cachés por versión |
| runtime-owner.lock / capture.lock | SO y runtime | Concesiones cooperativas; no borrar para desbloquear por PID o antigüedad | Aceptación instalada en ambos sistemas |
| .knownext-runtime/ en proyecto | project_owner / SO | .gitignore exacto y owner.lock regular vacío; concesión compartida por servicios del mismo perfil y exclusiva entre perfiles/procesos. Reservado y fuera de Git/árbol/transferencia. Datos desconocidos se conservan | Aceptación instalada; no coordina raíces anidadas ni editores externos; cerrar todos los servicios del perfil libera carpetas utilizadas |

Las pruebas focales y el estado de entrega se registran en el [plan único](../product/revision-3.0-implementacion/plan.md). C44 cubre una cohorte de tres archivos, C43/C46–C51 sus fronteras adicionales. C51 conserva original y diario de recuperación también cuando una escritura ordinaria normaliza un formato crítico legado; una consulta no migra. El mismo panel revisa esos puntos y bloquea recuperación ante cambios posteriores. H61 contrastó integración Android con fixtures sintéticos y restitución exacta, no una instalación real2.6. No equivalen a una transacción entre todos los datos, una garantía de downgrade ni aceptación de una instalación real. Antes de una candidata siguen siendo necesarios los casos pendientes indicados y el piloto de migración.

Los manifiestos de paquetes conocidos admiten templateDescription opcional para distribución de una plantilla con su nombre y descripción. No transporta identidad privada del catálogo. Plantillas documentales existentes mantienen su formato y no adquieren recursos automáticamente.


Catálogos documentales portables: formato `knownext.document-template-catalog`, versión1, `templates` con1–32 entradas del formato individual conocido. Límite2MiB, campos estrictos, digest del archivo revisado y nombres explícitos por índice. No transporta IDs/estado privado ni migra plantillas existentes. Formato individual1 sigue admitido; archivo desconocido/futuro no se normaliza. Preparación de imágenes conserva formato privado1; límites1MiB de Markdown,512KiB por imagen y decodificación acotada. Compartir recursos de proyectos utiliza sus paquetes independientes.


`ai/usage-migrations/` conserva copias exactas privadas por digest (16copias/128MiB), verificadas antes de ledger2. La versión2 añade origen de conversión, cobertura heredada, conteo total y agregados conocidos, sin reconstruir transacciones perdidas antes de migrar. El detalle reciente rota; el agregado permanece. Una aplicación anterior que no conozca2 debe conservarlo/rechazar uso; no se soporta downgrade automático ni restauración del original encima de agregados nuevos. Gestión integrada de copias y eliminación/retención se coordinan con F04/T09/F17. Fuente y copia inaccesibles no se convierten en vacíos escribibles.


### Presupuestos y recibos de audio
ai/usage-policy.json: esquema1 estricto,256 reglas/256KiB; mes UTC, proyecto opcional, límite EUR y modo notice/stop-new. CAS por revisión observada; formato desconocido se conserva. Ledger2 incorpora receipts opcional omitido vacío, índice de digests id/payload hasta100000, mismo checksum y escritura de agregados/detalle. No elimina identidades al rotar detalle reciente. Metadatos Chunk añaden recibo opcional y bandera omitida falsa; primera incorporación conserva sesión anterior exacta en sessions-recovery/usage-origin-<SHA>.json,500copias/128MiB. Archivos anteriores se leen sin atribuir recibos inventados. Versiones anteriores pueden rechazar metadatos nuevos: retorno2.6 requiere procedimiento integral pendiente, no copia antigua encima de datos nuevos.


### Colecciones de versiones
history-groups/<projectId>.json: formato1 nuevo, projectId/grupos, referencia commit/ruta histórica, fechas y archivo lógico.128 grupos incluidos archivados,500 referencias/grupo,5000 totales y2MiB; campos estrictos, nombres activos únicos y revisión SHA. Lectura futura/dañada no permite crear vacío ni reescribir. No migra ni modifica history-milestones/ ni Git. Las referencias sobreviven renombre por seguimiento histórico y no autorizan lectura de rutas externas. Portabilidad/sincronización de esta metadata continúa pendiente con F07.


### Borrador combinado con remoto conocido
GET /api/documents/{id}/remote-conflict devuelve la revisión de disco/borrador y remoteSource con commits completos local/remoto, markdownSha256, revision y Markdown. POST de conflicto admite solo uno de historySource o remoteSource; este último excluye Markdown y se deriva/revalida en Rust. No hay nuevo almacén/formato ni migración: cuatro copias normales de conflicto, agrupadas por operationId; motivo conflict-remote-<commit> identifica la copia remota. La autoridad de revisión no se persiste como orden de restauración. Preparar borrador no modifica Git ni certifica sincronización remota. Cuotas/retención global F17 y portabilidad F07 siguen pendientes.


### Continuación de puntos críticos conocidos
Diario1 exige campos conocidos, fecha RFC3339, fases preparando/preparado/aplicando/completado/restaurado con sus valores internos originales y entradas con hashes/bool. Extensiones/futuro/incompleto se conserva sin escribir. POST /api/recovery/upgrades/{id}/complete requiere revisión del conjunto y autoridad del espacio. Respuesta de revisión añade canComplete/completionReason y compatibilidad de copia/destino. Regeneración desde originales debe coincidir exactamente con after; destino ya aplicado conocido se observa por bytes/huella. Ausencia de updatedAt se conserva al normalizar config/export, sin migración adicional. Los puntos antiguos no reconstruibles conservan restauración cuando procede; escritura ordinaria no reproduce intención nueva. Diario y copias no se sustituyen por una consulta. Sin garantía de downgrade ni transacción global.


### Ruta de origen remoto revisada
remoteSource incluye sourcePath obligatorio en la prueba de combinación. Sin misma ruta remota, seguimiento Git desde una base común única; ambigüedad y correspondencia no disponible se conservan sin aplicar. Revisión añade remotePathChanged como información de presentación. Campo ausente/ajeno no autoriza una combinación actual. Contrato efímero del runtime, sin nuevo almacén ni migración; las copias y rutas locales no se renombrarán por comparar contenido.


### Presentación de copias de conflicto
Inventario de Apartadas añade operationId/variantRole opcionales; provienen de la misma pareja copia/registro validada dos veces y solo con motivo conocido, origen v2 coincidente y versión admitida. Papeles local/disk/proposal/remote. Se agrupa además por documentId; el ID de operación no es autoridad de recuperación. Sin nuevo formato ni migración. Campos futuros, huella incoherente o procedencia ajena no se reinterpretan para agrupar. Las acciones conservan contratos existentes con huella/source/key.


### Conservación manual de puntos críticos
Cada migrations/<id>/retention.json usa formato1 estricto: schemaVersion/id/phase(created archived o deleting)/createdAt/files, mapa de2–4 nombres exactos con SHA256 y16KiB. No contiene payloads ni rutas arbitrarias. Ausente implica punto activo conocido; desconocido/futuro bloquea mutaciones y se conserva. Archivo no mueve ni elimina originales; reapertura retira solo marca revisada. Eliminación explícita registra intención antes de retirar archivo por archivo; faltar una entrada solo se admite si deleting ya estaba registrado. No reanuda al consultar; exige otra revisión/confirmación. Copias incompatibles/extrañas, enlaces, cambios y solo lectura se conservan. Sin borrado recursivo, limpieza automática ni garantía de downgrade. GET/POST /api/recovery/upgrades/{id}/retention separan revisión de acción; completo/restore revalidan punto activo.


### Contraste con datos reales2.6
La muestra aislada del perfil etiquetado2.6.0 conserva config3/projects2/export1, consumo legado y notas/cambio sin versión. El runtime actual convierte exportación y consumo solo en Temp privado; reabre y restaura la cohorte crítica exacta conservando ledger2 posterior. Los seis originales reales se comparan por bytes antes/después y no se escriben. No se copiaron credenciales ni se abrieron rutas de proyectos; el recibo solo conserva metadata/huellas. No es migración de la instalación real ni prueba de todas sus familias, proceso de actualización o downgrade. Ver avance79 y ejemplo migration_profile_pilot.


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


### Recibos de restauración de papelera · formato1
Cada entrada conserva restore-attempt-<32hex>.json (16KiB, formato1 estricto) y restore-active.json (4KiB, formato1 estricto). Incluyen identidad, pedido revisado, huella de payload, entrada/propietario/ubicación y fase applying/completed; el marcador identifica el único intento que puede atribuir la publicación actual. Consulta no repara fases ni migra archivos. Máximo32 intentos por entrada, IDs no reciclados; futuros/extra/ilegibles se conservan. Entradas previas sin recibos siguen consultables y la próxima restauración usa el contrato90. No se ofrece recuperación con un cliente anterior ni conversión destructiva.


### Resolver conservando la versión guardada del equipo
graph-joins: formato1 de reunión con árboles idénticos sigue legible y no se reescribe. Formato2 contiene resolution=keep-local, con la elección ligada al commit/recibo; campos o modalidades futuras no autorizan publicación/repetición. Las vistas públicas mantienen schemaVersion1 con resolución opcional y recibos anteriores equivalen solo a identical. No hay migración automática ni cambio de documentos.


### Recuperar recursos históricos como archivos nuevos
Familia nueva de proyecto .knownext-history-copies: owner.json formato1/projectId y .gitignore conocido; recibos1 y anclas .data. Namespace y preparaciones reservadas, separado de .knownext-runtime. Lectura no repara ni reclama versión/propietario desconocidos. Parejas incompletas producen parcialidad y bloqueo de nuevas copias, no eliminación automática. Identidades/anclas aún no portables ni integradas en retención global; archivos públicos son independientes de la permanencia del nombre de ancla.


### Extraer texto sin registro comprobado
La extracción de contenido no migra un par dañado o futuro: manifest.json se identifica opacamente y se conserva; contenido futuro/ambiguo/nota inválida se rechaza. Markdown o contenido de nota validada se entregan aparte tras confirmación de procedencia no comprobada. Originales desconocidos permanecen byte a byte, sin reclamar identidad de proyecto/intento ni reescribir formatos.


### Revisión omitida en escritura de borradores
Compatibilidad de llamadas antiguas: ausencia de expectedDraftWriteRevision solo se admite cuando el almacén comprueba que no hay borrador. Estado existente requiere revisión explícita; ilegible/futuro se conserva con503. No migra, elimina ni normaliza un borrador durante este rechazo. No modifica formatos persistidos.


### Combinación guardada por archivo
Familia mixed-reviews formato1 estricto: identidad criptográfica, proyecto/sellos privados/versiones originales y filas modo/blob/elección. Recibo graph-joins formato3/resolution mixed añade prueba de selección;1/2 legibles sin reescritura. Futuro/parcial se conserva y no autoriza publicar ni podar. Selecciones no se transfieren como autoridad por paquetes documentales; portabilidad íntegra pendiente.


### Recuperación y portabilidad (115–117)

recovery-policy.json1: generación monotónica, revisión SHA y presupuesto opcional; formato futuro no sustituible. conflict-retirements/<id>.json1: diario inmutable de recibo/respaldo/representaciones antes de retirar copias; identidad/manifiestos conservados, lectura sin continuación. knownext.project2: suplemento tipado dataOnly, carpeta visible Archivo KnowNext, nuevos archivos archive JSON/bin/WAV limitados a esa carpeta; mantiene lectura1 y rechaza futuros/campos desconocidos. Inventario de suplemento knownext.project-archive1 con huellas/orden de partes; preferencias knownext.portable-preferences1 con lista visual permitida y applyAutomatically=false. Importación únicamente documental, sin adopción de ejecución.


### Paquete portable3 e índice privado2 (121)

Paquete3: suplemento con retainedFiles positivo, acotado por entradas declaradas; se mantiene lectura1/2/3. Archivo inicial sigue usando paquete2. Índice knownext.project-archive2 conserva items y metadataSnapshots (name/path/sha256/bytes); índice1 sigue admitido sin metadatos anteriores. Cabeceras originales en Anteriores/<SHA>; payloads nuevos en Actual-<id>, anteriores en sus rutas. Campos/versión futuros, referencias duplicadas o huellas incorrectas no se migran ni se sustituyen. El paquete documental completo1 excluye la carpeta privada.


### Borradores portables · bloque122

Archivo privado1/2: borradores activos=false/original SHA revisados individualmente. Copia nativa schema1 con campos permitidos y razón portable-draft-import; identidad determinista vinculada a receptor/original, sin sustituir parciales/futuros. Base nueva de continuación ligada al documento receptor; originales permanecen.


### Audio portable · bloque124

Session añade portableOrigin opcional conocido1 con identity/projectId/sourceSha256 y SHA opcionales de pistas, sin texto del proveedor o rutas. Ausencia conserva formato previo; versión/firma incompatible se conserva sin sustituir. No se promete lectura por2.6 ni downgrade de sesiones nuevas. Originales portables no se normalizan ni se mueven. Índice privado1/2 y partes WAV existentes sin cambio.


### Historial portable y grabaciones integradas · bloques125–126

Historial portable: índice privado1/2 sin cambio. Marcador .git/knownext-portable-history.json y recibo .knownext-history-import/preparation.json conocidos1 con projectId/entryId/bundleSha256/tip/requestRevision/createdAt; no sustitución o interpretación reparadora de destinos previos/futuros. El recibo permanece y las preparaciones se miden sin autoridad de borrado. Source refs se conservan bajo nombres internos; bundle original conserva los nombres de origen. No cambia el esquema de documentos/borradores/registro.


## Procedimiento integral de piloto2.6→3.0 ·127

Este procedimiento describe aceptación pendiente; no acredita instalación, publicación ni migración de un perfil real. El corte127 cambia el contrato IPC, no los formatos persistidos del inventario.

1. Con2.6, identificar proyectos/raíces y comprobar que no quedan cambios sin ACK, ajustes en error, captura, dictado o envíos activos. Registrar la versión, plataforma y capacidades disponibles; no registrar credenciales ni documentación en diagnósticos.
2. Preparar una copia fría y verificable de los datos que participarán en el piloto, sin abrir/leer archivos de coordinación owner.lock/runtime-owner.lock/capture.lock. Conservar originales, documentos, `.knote`, repositorios locales, borradores, notas, preferencias y audio según el inventario. El vault depende de usuario/dispositivo; no prometer traslado de DPAPI/Keystore. Usar una copia aislada y recursos sintéticos cuando no esté autorizado utilizar datos personales.
3. Registrar hashes/conteos en esa copia y las relaciones proyecto→raíz, base de borrador, HEAD/contenido, sesiones/destino y preferencias. No inferir éxito de un simple arranque ni de que el catálogo se vea.
4. Ejecutar revisión de migración explícita. Un formato futuro, lectura parcial, archivo no regular o diario incompleto se conserva y bloquea su modificación; nunca se normaliza como vacío. Crear y verificar copias/diario antes de sustituir cualquier formato que realmente cambie. Los formatos compatibles se leen sin reescritura por cambio de versión comercial.
5. Reabrir y comprobar texto guardado y borrador por separado, notas manuscritas, versiones/Git, enlaces, ubicaciones externas, preferencias de estilos y sesiones/audio. No lanzar proveedores, sincronización de red o transcripciones. Comparar huellas de originales y de las copias conservadas.
6. Inyectar fallos en la copia: falta de espacio, denegación de acceso, interrupción antes de publicar, después de publicar y antes del ACK, estados de preparación futura/incompleta y modificación del origen durante la revisión. Debe sobrevivir original/copia identificada y no haber éxito falso ni reenvío automático. Reabrir solo para observar/revisar el diario.
7. Probar edición durante descarga Windows y nueva comprobación final, instalación rechazada con actividad/borrador sin ACK, suspensión y salida desde main/bandeja. En Android contrastar el puente combinado y el retorno explícito del instalador. Medir tiempo efectivo hasta ACK y pérdida máxima de RAM en el entorno físico; no usar el intervalo5s como garantía de resistencia a muerte abrupta.
8. Ensayar retorno desde la copia fría verificada en su versión original. No abrir con2.6 los datos ya modificados por3.0 ni ofrecer downgrade garantizado. Documentar muestras no cubiertas y cualquier fallo de fidelidad antes de aprobar el candidato.

La muestra previa de seis almacenes reales2.6 en copia aislada no sustituye estos pasos ni la campaña instalada Windows/Android. Copias portables e inventarios conservan sus límites/capacidades; no equivalen a un respaldo integral de un dispositivo.



## Integridad y formatos secundarios · 129

Aplicación mixta formato 2 añade beforeMode/afterMode (100644/100755) a los payloads; 1 permanece legible. Los escritores preservan índice/historial. Unix aplica el permiso; Windows rechaza cambios de modo no representables sin tocar el índice. Los marcadores de finalización siguen en formato 1 y vinculan el SHA del recibo exacto.

Recuperación: diario de cierre 1 permanente antes del traslado, diario de retirada 1 antes de retirar bytes, respaldo privado ZIP con manifiesto exacto y huellas. La identidad no se reabre. Una preparación conocida con payload ilegible puede cerrarse sin modificar archivos; no se interpreta un recibo futuro. Una nueva preparación conserva elecciones/bases comprobadas con ID distinto, manteniendo originales.

La revisión de formatos JSON distingue compatibilidad actual, legado válido sin conversión forzada, protegido y no revisado. Transiciones auxiliares conocidas conservan original exacto y manifiesto; no se respalda acceso en texto plano. No cambia el formato de documentos/knote ni concede downgrade de datos ya modificados. Véase recovery-lifecycle.md.
