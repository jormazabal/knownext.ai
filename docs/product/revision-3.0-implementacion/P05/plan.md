# P05 · Plan evolutivo
[Definición](tarea.md) · [Plan principal](../plan.md)
Estado: Desarrollo local del paquete integrado y regresión139 correcta; aceptación instalada/física/humana P10 y T17 real según alcance pendientes. Sin candidata, publicación ni instalación3.0. Responsable: Rust/almacenamiento y frontend biblioteca; persona por asignar. Esfuerzo relativo XL, sin conversión a calendario.

## Entrada
- [P01](../P01/plan.md): entradas pertinentes según las dependencias del plan principal; no exige finalizar todas sus ampliaciones.
- [P02](../P02/plan.md): entradas pertinentes según las dependencias del plan principal; no exige finalizar todas sus ampliaciones.
- [P03](../P03/plan.md): entradas pertinentes según las dependencias del plan principal; no exige finalizar todas sus ampliaciones.
Hito propuesto: H3.

## Cortes de trabajo
1. [x] Implementar papelera recuperable sin depender de Git: assets, carpetas, colisiones, retención y restauración.
2. [x] Definir selección mixta accesible y normalizar carpeta más descendientes; informar elementos ocultos por filtro.
3. [x] Implementar plan de Mover a… y papelera por lote con prevalidación, protección de borradores, rutas seguras y resultado por elemento.
4. [x] Resolver divergencias conservando ambas variantes; distinguir guardado local, versión y sincronización remota.
5. [x] Retirar/revincular/almacenamiento, hitos/comparación y lotes ampliados implementados (129/133/135/137/138). Revinculación con raíz original ausente corregida139 y contrastada en la tanda dirigida de16casos; regresión global aún pendiente.

## Superficies a inspeccionar antes de editar
src/features/documents, projects, versions y externalChanges; crates/knownext-core y knownext-storage.
Las rutas describen el ámbito propietario esperado, no una orden de modificar todos sus archivos. Confirmar contratos y cambios locales al comenzar cada corte.

## Verificación prevista
Contratos de lote y restauración, enlaces/adjuntos, falta de espacio y permisos, conflictos y selección por teclado/tacto; UX-T13 a UX-T17.
Cada criterio P05-C se asociará a evidencia del corte que lo implemente, con entorno y resultado. Las verificaciones y sus límites se registran en los avances enlazados; no equivalen por sí solas al cierre completo del paquete.

## Riesgos y tratamiento
Cambios de rutas, colisiones y operaciones incompletas. No habilitar eliminación múltiple recuperable antes de la recuperación real.

## Ampliación y condición de entrada
Arrastre/duplicación/exportación/renombrado múltiple, hitos, combinación por bloques, centro de recuperación y cuotas; cada acción se acepta por separado.
Se concreta el comportamiento, contrato y aceptación del siguiente corte antes de empezar; permanece en el backlog aunque no entre en 3.0.

## Progreso y siguiente paso
- Hecho: implementación local y verificación dirigida de los recorridos descritos en [Integridad129](../avance-129.md), [edición133](../avance-133.md), [recursos135](../avance-135.md), [copias137](../avance-137.md); consultar sus límites, no la antigua cabecera de primer corte.
- Hecho: regresión local139 cerrada; reutilizar evidencia no invalidada, sin repetir suites completas por cambios documentales.
- Pendiente: preparar y aceptar la candidata instalada Windows/Android, migración/actualización/recuperación, dispositivos/fallos físicos y recorridos con personas en P10/U16. T17 real sigue aplazada sin gasto.
- Próximo paso: el coordinador completa la revisión e integración Git y diagnostica el entorno; después construye y valida la candidata instalada según la autoridad actual. Registrar cada resultado por artefacto, entorno y revisión.
- Publicación excluida por instrucción actual. La autorización de preparar e instalar no acredita instalación realizada ni aceptación humana. Las capacidades condicionadas se conservan sin simulación.
- Revinculación con origen ausente corregida y contrastada en139; sus16casos dirigidos y la regresión general posterior están cerrados. Se conserva pendiente su aceptación instalada.

## Avance 03
Ver [contrastes, implementación y pendientes](../avance-03.md). Se mantiene abierto el paquete y su alcance restante; no se declara completado por esta entrega.


## Avance 04
Estado y evidencia vigentes: [continuidad, seguridad nativa y primer uso](../avance-04.md). Continúa el alcance completo restante; no se cierra este paquete.


## Avance 05
Recuperación, continuidad e historial: [evidencia y pendientes](../avance-05.md). No se cierra el alcance restante de este paquete.


## Avance 06
[Traslados, continuidad y referencias](../avance-06.md). Implementación y comprobación parciales; continúa el alcance restante. No se declara cerrado este paquete.


## Corte 08
Revisión de variantes y copias dañadas, recuperación como otro archivo, archivo privado verificado y categorías fijas. [Evidencia transversal](../avance-08.md). No cierra el paquete ni sus ampliaciones.


## Corte 10
Estado crítico protegido, revisión/restablecimiento conservando originales y aislamiento del inicio. [Evidencia transversal y límites](../avance-10.md). No completa el resto del paquete ni sus ampliaciones.


## Avance 12
[Espera principal, continuidad y revisión de resultados IA](../avance-12.md). Verificación parcial frontend/Rust y Android sin red; no cierra el paquete ni sus ampliaciones. Continúan todos sus criterios restantes y la aceptación nativa.


## Avance 13
[Revisión, borradores y autoridad IA](../avance-13.md). Evidencia parcial por tramo; continúan el resto del paquete y sus ampliaciones.


## Avance 19
[Paquetes documentales entre Windows y Android](../avance-19.md): 517 frontend, 297 Rust, 8 JVM y APK41 offline. Primera parte F07 contrastada; nombre al reabrir, referencias a carpetas y mensajes de entrega pasan al siguiente tramo. Continúan todo el paquete y el programa, sin cierre completo.


## Corte 20 definido · continuidad de la revisión y referencias a carpetas
Completar los ajustes observados en APK41, sin sustituir la preparación revisada ni ampliar su contenido. Guardar el nombre provisional de una importación al cerrar con ID/huella y acuse nativo; aceptar provisional vacío y validar el nombre final solo al importar. Un fallo de conservación mantiene diálogo/valor para repetir. Cerrar no importa y no recrea archivos; reabrir/reiniciar recupera el nombre confirmado. El formulario de Crear proyecto subyacente permanece intacto.

Comunicar cancelación del destino explícitamente, conservar el mismo paquete revisado y proponer como nombre de archivo el proyecto con saneado portable y longitud acotada; Windows sigue creando un destino nuevo. No añadir rutas a React.

Las referencias guardadas a carpetas regulares deben devolver kind folder/status available, sin convertir un enlace o ruta externa en autoridad de navegación. El panel permite Mostrar carpeta y abre/selecciona esa carpeta en la navegación contextual, conservando documento, cambios y posición. Una carpeta con extensión .md sigue siendo carpeta; faltantes/bloqueadas no ofrecen abrir. No cambiar el alcance de contenido guardado ni dar por resuelta toda navegación directa desde enlaces del editor.

Contrastar nombre distinto/vacío al cerrar/reabrir y reiniciar, error de ACK con valor conservado, huella/ID cambiados, ausencia de importación al cerrar, cancelación de destino sin éxito falso y nombres reservados/largos. Probar carpeta vacía, carpeta con extensión, padre enlazado y navegación desde panel estrecho sin perder el editor. Pruebas Rust/frontend pertinentes y APK QA offline; mantener separados datos sintéticos, selector real y aceptación física. Sigue todo el programa y sus ampliaciones.


## Avance 20
[Continuidad de revisión y navegación a carpetas](../avance-20.md): 520 frontend, 300 Rust y APK42 offline. Tres ajustes C19 contrastados; campo vacío/reinicio, fallo de permiso y borrador exacto conservados. Se detecta pérdida ALT de imagen, F16/P0, priorizada en C21. Continúa todo el alcance restante.


## Corte 22 definido
F17: retiro reversible de la asociación, reincorporación con identidad conservada y pruebas de interrupción/colisiones. Contrato y continuación completa del almacenamiento en el [plan principal](../plan.md). No iniciar antes de verificar la corrección P0 de C21.


## Avance 21
[Imágenes que conservan su significado](../avance-21.md): corrección F16/P0 contrastada; 535 frontend, 305 Rust y APK48 offline. Documento idéntico al reabrir; pies debajo, sin URLs temporales. Exportaciones nativas y preparación ZIP verificadas. Entorno QA restaurado; continúa C22/F17 y todo el programa, sin cierre completo del paquete.


## Avance 22
[Retirar un proyecto sin perder su trabajo](../avance-22.md): 554 frontend, 313 Rust y APK50 offline. Retirada/reincorporación, permisos, colisión y reinicio contrastados; bloqueo de modales detectado en 49 y corregido/verificado en 50. Cuatro hashes y red QA restaurados. Continúan F17, todas las áreas y ampliaciones, sin cierre completo de paquetes.


## Corte 23 definido
Continuación tras C22 verificado y QA restituida. Incorporar una consulta nativa explícita de uso lógico y ubicaciones en Sistema, localizable por búsqueda de ajustes. Escanear solo metadatos de archivos regulares bajo el almacén privado, sin leer contenidos ni seguir enlaces/junctions ni inspeccionar automáticamente raíces externas. Máximo 10.000 entradas y presupuesto cooperativo de 2 s; informar límite, errores, enlaces omitidos y cobertura parcial, nunca convertir una medición incompleta en cero o en capacidad libre. No confundir suma de tamaños lógicos con bloques físicos ni total del dispositivo. La consulta va fuera del mutex de mutaciones y no se ejecuta/pollee en pantallas ocultas.

Clasificar fuentes gestionadas, recuperación, grabaciones, trabajo IA, plantillas, preparaciones, índices/vistas, preferencias y otros datos. Todas las categorías se conservan; índices/vistas solo son candidatos a revisión, no autorización de borrado. Mostrar raíces registradas y fichas retiradas con alcance/límite de consulta; registro o catálogo ilegible conserva medición y aviso, no se presenta como lista vacía fiable. Las ubicaciones externas se enumeran desde el contrato, sin medirlas ni crear carpetas. No ofrecer un botón de limpieza hasta demostrar regeneración y ausencia de referencias/tareas en curso.

UI integrada, compacta, progresiva y bilingüe es/en; datos y error anterior se conservan en actualización fallida, un envío en vuelo, sin promesa de cancelación nativa inexistente. Probar clasificación, tamaño parcial, enlaces, estado dañado, privacidad, ausencia de escritura, accesibilidad de consulta y preservación ante error. Contrastar componentes reales y APK aislado con restauración. Limpieza regenerable, revinculación, archivo/cuotas, falta de espacio y demás ampliaciones continúan después; no cierran F17 con el mapa.


## Avance 23
[Datos locales con un alcance claro](../avance-23.md): 559 frontend, 320 Rust y APK51 offline. Mapa explícito de uso lógico, enlaces omitidos y catálogo futuro conservado; consulta sin cambios en cuatro almacenes. Red/estado QA restaurados. Sigue C24 con validación de rutas/acuses de índices y todas las áreas/ampliaciones, sin cierre completo de paquetes.


## Corte 24 definido
Prioridad de integridad de rutas y acuses del índice IA, contrato y continuación en el [plan principal](../plan.md). Solo pruebas de manipulación en TempDir aislado; no se amplía limpieza genérica ni se cierra el paquete.


## Avance 24
[Índices con identidad, revisión y resultado verificables](../avance-24.md): 568 frontend, 329 Rust y APK53 offline. Defecto de ruta reproducido en TempDir y corregido; revisión, permisos, efectos parciales y cache futuro contrastados sin alterar la fuente. Estado/RAG conservados y QA restituida. Continúan otras rutas de datos secundarios, limpieza ampliada y todo el programa, sin cierre completo de paquetes.

## Avance28 · historial elegible
Implementados hitos como anotaciones locales separadas de commits y comparación A/B de dos versiones, conservando comparación con trabajo actual. Almacén acotado con revisión requerida y formatos futuros conservados. Consulta mantiene editor/undo/posición; ver [evidencia y pendientes](../avance-28.md). Solo comprobaciones focales, sin suite completa ni APK; nativa agrupada pendiente. Continúan combinación/restauración parcial y demás ampliaciones del paquete.


## C33–C34
Limpieza revisable de recibos y revinculación de ubicaciones con pausa de automatismos: decisiones, implementación, evidencia focal y límites en el [plan principal](../plan.md). Continúa el resto del paquete; no se acredita cierre integral ni aceptación nativa de estos cambios.


## Avances43–55 · estado vigente
Combinación Markdown por bloques y manuscrita por páginas con tres copias verificadas; restauración parcial del historial como borrador con procedencia y commits anteriores conservados. Recuperación incluye borrador de última fuente incompatible aunque la ruta exista. H61 contrasta Markdown/migración; C53–55 en integración62. Siguen divergencia remota compleja, grupos avanzados, lotes/archivo/cuotas y aceptación. Detalle y evidencias en el [plan principal](../plan.md); no se declara cerrado el paquete.


## Selección ampliada
Las cinco acciones de ampliación están implementadas con revisión/resultados por elemento. Contratos dirigidos y navegador controlado correctos; integración instalada y recuperación compuesta pendientes. Continúa detención segura de lotes, según el plan principal.


### Bloque funcional · copias de sistema en Recuperación
F04/T14: nueva categoría «Copias de sistema» integra originales de consumo y copias de sesión/preferencias de grabación en los perfiles normal y desarrollo. Inventario de metadatos, acotado a1000 entradas/2s, en orígenes conocidos; no recorre directorios desconocidos ni enlaces. Fuentes no disponibles se informan sin ocultar otras disponibles. Metadatos no se convierten en permiso de restauración; no muestra transcripciones, claves ni campos privados en el resumen.

Revisión explícita lee copia regular hasta32MiB, calcula SHA y comprueba cambio durante la lectura; resumen JSON solo hasta2MiB. Formatos futuros/ilegibles se conservan sin interpretación/aplicación. Nombres con digest se contrastan con bytes; discrepancia se anuncia. Otras copias tienen huella de la revisión, no una verificación de procedencia inventada. Sesión resume fragmentos/duración y explica que el PCM no viaja en el manifiesto. Consulta no escribe y no necesita que el ledger activo sea interpretable.

Conservar copia externa congela en Rust los bytes de la huella revisada antes del selector. Cambio desde revisión se rechaza; cambio posterior al congelado no altera la copia elegida. Windows crea archivo JSON nuevo fuera del estado privado, nunca sobreescribe y verifica bytes tras escribir. Android usa staging privado existente y selector nativo. Cancelación es distinta de confirmación/error; ningún replay automático. No se entregan bytes de metadatos al renderer ni se restauran copias antiguas sobre consumo/recibos/sesiones posteriores. Copias futuras o dañadas pueden conservarse exactamente para recuperación fuera del estado activo.

Centro mantiene cabecera/cierre y pie visibles; categorías en selector compacto en estrecho y botones en escritorio. Se reduce descripción repetida y jerarquía móvil para que la lista y sus acciones dispongan de espacio. Filtro por origen, resumen e identificación de la copia en la misma superficie; no otro modal encadenado. Fallo al actualizar conserva inventario anterior y declara estado actual no confirmado.

Contratos aislados correctos: fuentes y estado activo exactos, sin secretos en resumen; checksum/procedencia, huella obsoleta, snapshot congelado, staging completo, salida exclusiva y destino privado bloqueado. Futuro/ilegible/discrepancia y elemento no regular preservados, origen bloqueado no oculta orígenes independientes y rutas manipuladas se rechazan. UI de ACK incierto/cancelación sin replay e inventario previo tras error correctos. TypeScript y cargo check nativo correctos. Navegador de aplicación real con API de copias controlada: categoría/filtro/resumen, cancelación y escritorio/320px; controles44px, sin desborde ni peticiones remotas.311–314 vistas. No se ha ejecutado un selector nativo instalado ni un nuevo APK.

Evidencia: v3-system-recovery-contract.log, v3-system-recovery-ui.log (caso de inventario correcto; primer caso ajustado por espera del estado final), v3-system-recovery-ack-final-ui.log, v3-system-recovery-types.log, v3-system-recovery-native-check.log y v3-system-recovery-browser-evidence.json. El primer fallo de UI era una aserción que leía el indicador de espera antes de la cancelación resuelta; caso corregido y verificado, sin ocultar el resultado anterior. Se retiró un import no usado del contrato.

F04 sigue abierto: integrar en un centro común las restantes familias de copias/migraciones/conflictos, navegación hacia sus recuperaciones específicas, extracción revisada de contenido y retención/archivo coordinado con F17. Esta categoría no es una restauración universal ni resuelve el downgrade/piloto2.6. Instaladas Windows/Android y regresión final pendientes; no suites completas por este bloque.


### Recuperación con trabajo protegido
Compatibilidad de cohortes integrada en el centro; autoridad común con Ajustes, protección previa y lectura nueva incluso tras ACK desconocido. [Evidencia y límites](../avance-71.md); ver bloque correspondiente del plan raíz. F04 continúa abierto.


### Originales de estado y navegación al punto
Copias de sistema enumera originales conocidos de restablecimiento/migración, sin mostrar valores privados. La revisión específica del punto mantiene guardas de cambio posterior y protección del espacio. [Avance72](../avance-72.md); familias restantes/retención y aceptación pendientes.


### Colecciones locales del historial
Crear/editar/agrupar/archivar/reabrir referencias inmutables por proyecto, con pertenencia comprobada y protección frente a revisión obsoleta. Filtro conserva documento/comparación. [Avance73](../avance-73.md); ver evidencia/límites en plan raíz. Continúan formatos/recursos ampliados, trazabilidad selectiva e integración/aceptación.


### Remoto conocido como fuente de un borrador revisado
Comparación desde historial con referencia ya disponible localmente, prueba completa revalidada y cuatro copias antes de sustituir solo borrador. ACK perdido se observa sin replay. Disco/HEAD/índice conservados; sincronización del proyecto pendiente. [Avance74](../avance-74.md); evidencia/límites en plan raíz. Continúan combinación de grafo remoto, renombres/recursos e integración/aceptación.


### Recuperación con continuación revisada
Compatibilidad ofrece completar puntos críticos interrumpidos verificables, además de restaurar originales. Sin autoridad del espacio es consulta; tras acuse perdido lee sin replay. Puntos desconocidos/incompletos se conservan. [Avance75](../avance-75.md); restantes familias, retención y aceptación abiertas.


### Comparación remota con renombres
Base común única y seguimiento Git de rutas locales/remotas, sourcePath ligado a la prueba. Aviso visible; solo prepara contenido y conserva nombre local. [Avance76](../avance-76.md); contratos Git/componentes/tipos correctos. Grafo remoto y aplicación de renombres/recursos al árbol siguen pendientes.


### Variantes de una combinación en Recuperación
Pareja copia/registro revalidada devuelve procedencia conocida; grupos por operación+documento con cuatro papeles y consulta de identidad exacta. Filas compactas y recuperación a otro archivo conserva todas las copias. [Avance77](../avance-77.md). Retención/cuotas y restantes familias abiertas.


### Retención manual de puntos de migración
Archivar conserva sin liberar espacio, reabrir devuelve revisión de recuperación, eliminar exige aceptación explícita y punto exacto. Fallo conserva restos y requiere otra acción revisada; sin limpieza recursiva/automática. [Avance78](../avance-78.md). Restantes familias/cuotas e integración siguen pendientes.


### Revisión y resultados recuperables de lotes
Límite explícito de profundidad/entradas/bytes/tiempo antes de crear lote; copia parcial en atención. Comprobantes conservan cambios documentales sin árboles repetidos. UI adopta una vista actual y no repite efectos tras ACK perdido. [Avance80](../avance-80.md). Resto de conflictos/retención pendiente.


### Bloque81 · divergencia por proyecto revisable y confirmación falsa retirada
F06/T03/U09: la ruta antigua POST sync/conflicts/:id/resolve solo devolvía sync_status; App ignoraba su estado y anunciaba sincronización completada. Esa ruta ahora devuelve409 explícito sin consultar red ni modificar fuentes; las cuatro resoluciones antiguas están bloqueadas. Retirados controlador/callback/diálogo y acciones de reemplazo que prometían resolver sin implementación. En divergencia se inhiben tanto acciones remotas globales como por fila; no se retira guardar ni revisar documentos. El resumen distingue revisión del proyecto de conflictos de documento.

GET /api/projects/:id/sync/remote-review inspecciona exclusivamente HEAD, referencia origin conocida y base común única. Diffs raw con renombres Git, altas/bajas/modificaciones/tipo, recursos y tipos no regulares identificados sin leer su contenido ni ejecutarlos. Contrasta ubicación canónica, origen/referencia por huellas y commits completos antes/después; no expone URL ni nombre de referencia. 2MiB de salida por comando,10.000 cambios por lado y1.000.000 de comparaciones cruzadas máximas; el límite de salida no es un timeout de proceso. No fetch, checkout, cambio de índice, commit, fusión ni push. Las fuentes locales se conservan al rechazar rutas no portables, formatos ambiguos o falta de base común interpretable.

Coincidencia incluye rutas anteriores/actuales y relaciones carpeta-descendiente; marca mismo resultado solo si todos los cruces coincidentes concuerdan en contenido/modo/acción/ruta. No declara un conflicto de texto por coincidir una ruta. Solo abre documentos Markdown locales regulares; una ruta remota nueva/recurso/tipo no regular no se convierte en lectura o ejecución. La revisión queda limitada a versiones registradas: no incluye borradores/cambios sin commit ni acredita actualización remota reciente.

ExternalChangesDrawer ofrece Revisar divergencia y ProjectRemoteReviewDialog con lados independientes, contadores, filtro de coincidencias, renombres, recursos/tipos manuales y apertura de documento para comparación existente desde Historial. Metadatos de base progresivos; filas50 por tramo. Cierre/consulta en pie fijo,320px con ambos lados y acciones en una fila. Error de refresco retira datos antiguos; respuesta tardía de otro proyecto no se adopta. No hay botón de aplicar ni promesa de sincronización resuelta.

Evidencia dirigida: v3-project-remote-review-contract.log2 correctos, incluidos HEAD/índice/disco/borradores exactos y cuatro resoluciones409; referencia local inaccesible por red para demostrar que el contrato usa datos existentes. Rutas no portables rechazadas sin cambios. UI2 nuevos de revisión y1 entrada del drawer correctos (tras corregir que las acciones por fila aún quedaban visibles);5 casos previos del drawer comprobados una sola vez, TypeScript y diff correctos. Sin suites completas ni APK.

Pantallas345–348 inspeccionadas: drawer/diálogo reales en navegador aislado con módulo API controlado, sin puente nativo ni red exterior. Dos lecturas, cero mutaciones; filtro/renombre/recursos, error limpia revisión y cierre devuelve foco a Revisar divergencia. Ajuste visual tras inspección reduce texto y mantiene controles juntos a320px. Reporte81 no afirma aceptación instalada.

Pendiente F06: resolver y aplicar transaccionalmente el grafo de versiones al árbol real, con borradores, renombres/recursos, recuperación de cortes, escritores externos y dispositivos. Comparar textos o revisar el grafo no cierra esa resolución. Continúan las demás familias de recuperación/retención, portabilidad, ampliaciones y aceptación final.


### Publicación coordinada de conflictos
Reserva cooperativa por raíz durante conservación/cambio del borrador. Escritores API, grabación y commit IA participan; consultas/cancelación no esperan. Rechazo explícito not-started evita falsa conciliación. [Avance82](../avance-82.md). No resuelve el grafo ni sustituye autoridad de registro; recibo durable de intento y otros trabajos pendientes.


### Bloque83 · recibos de combinación y consulta sin repetir el intento
F06/T02/T03/U09: conflict-attempts/attempt-*.json formato1 estricto, máximo64KiB por recibo y presupuesto previo1000 registros/16MiB/revisión2s. Guarda identidad de intento/documento/tipo, operación nativa, hash canónico del pedido, fase, huellas de copias/registros y revisión esperada del borrador; no duplica texto, trazos, prompts ni credenciales. La revisión de cada copia usa pareja copia/manifiesto revalidada, documento y operación de procedencia exactos. Copias y recibos sin caducidad automática; gestión/archivo de esta familia sigue en F04/F17.

Cliente crea identidad criptográfica opaca por envío. Antes de conservar copias se reserva un recibo nuevo exclusivo; reutilizarlo no ejecuta de nuevo. Fases preparing/ready/applying/completed: copias comprobadas antes de ready, destino del borrador registrado antes de publicar, comprobación final antes de completed. Escrituras con revisión de bytes, formatos futuros/extensiones/entradas no regulares/recibos demasiado grandes conservados y bloqueados. Fallo deja estado/copies para revisión; jamás se continúa al abrir o consultar. No se promete CAS frente a editores externos ni una transacción del disco/Git.

POST documents/:id/conflict-attempts/:attempt/review y equivalente handwritten-notes es una consulta auditada independiente, no una reaplicación. Exige el pedido original, verifica su hash, copias y metadatos exactos, ubicación/fuente/revisión actual del borrador y vuelve a comprobar tras leer el resultado. Devuelve absent/pending/changed/confirmed. Un corte tras publicar y antes de cerrar el recibo puede confirmarse solo si su fase, todas las copias y postcondición coinciden; la consulta no repara el registro. Referencia remota cambiada o copia alterada no se atribuyen como éxito. Recepción confirmada devuelve IDs reales de copias, no una lista vacía inferida por coincidencia de texto.

Los confirmadores de interfaz requieren recibo; eliminada conciliación basada solo en contenido coincidente. Una respuesta incierta realiza una consulta del intento, sin otro envío ni consultas paralelas redundantes de documento/revisión. not-started no consulta. Intento pendiente conserva pedido/elecciones en RAM; diálogo bloquea modificar el envío anterior y ofrece Consultar intento, Nueva revisión y Cerrar revisión. Consultar vuelve a verificar el mismo ID sin callback de mutación; una revisión nueva es una acción separada. Aviso fijo sobre el contenido desplazable y controles juntos a320px. Selección de versión completa ya no muestra contador engañoso de0 bloques elegidos.

Contrastes: v3-conflict-attempts-contract.log5 correctos: reapertura/corte tras publicación sin reparación, copia alterada/pedido distinto/futuro/extra, contenido ya coincidente con recibo pendiente, publicación fallida readonly con copias sin falsa confirmación, trazos completos de6 valores y cuotas/tamaño antes de efectos. v3-conflict-attempts-remote-contract.log1 caso correcto con4 copias y referencia posterior cambiada, HEAD/índice/fuente intactos. UI de confirmadores/API10 casos en v3-conflict-attempts-required-ui.log, consulta explícita de nota1 en v3-conflict-attempts-note-recheck-ui.log y controles nuevos2 en v3-conflict-attempts-recheck-ui.log. TypeScript/diff correctos; sin suites completas, APK ni proveedor.

Pantallas351–353 inspeccionadas: diálogo, confirmadores obligatorios, API frontend y Milkdown reales en harness aislado; módulo runtime controlado y sin puente nativo. Recibo ausente pese a texto coincidente: un envío y dos consultas, incluida la explícita, sin adopción ni replay; edición conservada al cerrar. Escenario separado confirmado: un envío/una consulta, mismo ID, tres copias y borrador combinado. Sin errores de consola ni red externa;320px sin desbordamiento. La vista del editor es un harness, no el shell completo ni una captura instalada.

Pendiente: catálogo/retención de recibos y recuperación asistida tras reiniciar la UI sin su pedido RAM; siempre quedan copias revisables y diario conservado, sin reanudación automática. Debe reforzarse además la precondición de contenido del borrador en guardado/descarte para impedir que una persistencia vieja de RAM sustituya un borrador cambiado por otra operación. La existencia de copias mitiga esa colisión pero no equivale a impedirla. Resolución transaccional del grafo y resto del programa continúan abiertos.


### Bloque84 · borradores conocidos y conservación de la edición abierta
T02/T03/F04/F06/U09: reproducida una colisión real de contrato Rust: un checkpoint antiguo sustituía el borrador publicado por otra operación, aunque el archivo seguía igual. Ahora la UI envía expectedDraftWriteRevision en checkpoints, guardado/forzado, descarte, cargar disco y restaurar versión. SHA opaca del contenido físico del borrador, o null para ausencia conocida; separada del hash de cambios visibles. Rust reserva publicación frente a escritores cooperantes, comprueba esa revisión antes de efectos y responde draft_write_conflict o draft_state_unavailable con operationOutcome:not-started. Formato futuro, ambiguo o ilegible se conserva. El contrato interno previo sin campo no cambia de runtime; la interfaz nueva siempre lo envía.

Los acuses propios avanzan la revisión antes de liberar la cola por documento, también si hubo escritura, deshacer o trazos nuevos durante la espera. No sustituyen esa RAM. Recarga/base diferente rechaza el acuse antiguo. La limpieza posterior a guardar comprueba la revisión completa; si otro borrador apareció, lo conserva y devuelve aviso sin autorizar una revisión no observada. Notas usan una revisión estable frente a identidad/fechas de raíz; páginas, seis valores de puntos y demás contenido siguen vinculados. Traslado de identidad conserva esa revisión. Los resultados nativos de combinación e IA incluyen su revisión; se elimina cualquier campo homónimo propuesto por el modelo antes de ejecutar.

Una colisión suspende las escrituras de esa sesión sobre el borrador activo. La edición abierta se conserva como copia independiente mediante POST /api/recovery/local-edits/{id}, con ID criptográfico conocido; si no llega acuse, solo se consulta POST .../{id}/review. Una consulta ausente no autoriza cerrar/reemplazar ni reenvía automáticamente. Conservación exacta de texto/trazos/base, pareja copy.json/manifest.json comprobada y reapertura verificable. Reutiliza drafts-review y formato1; no duplica otro almacén. Máximo2MiB de Markdown/64MiB de copia; presupuesto previo1000 entradas/128MiB lógicos/2s cooperativos. No elimina copias para liberar espacio ni completa parejas parciales. No requiere que el registro o carpeta de origen estén disponibles. Gestión global de cuota/retención continúa pendiente.

Aviso compacto diferenciado del conflicto del archivo: Conservar y revisar borrador / Recuperación. Revisar primero confirma la copia de RAM y después lee el borrador actual; solo lo carga si la sesión sigue siendo la revisada. No descarta el borrador guardado. La copia conocida se muestra en Apartadas incluso si el inventario general es parcial. Checkpoints de cierre/transición incluyen sesiones bloqueadas aunque deshacer las haya dejado iguales al disco; necesitan conservación confirmada.

Contrastado: cinco contratos Rust dirigidos (colisión original; guardar/forzar/descartar/cargar disco y futuro/extensiones; notas/renombrado/puntos; copia/reapertura/recuperar como archivo; pares parciales/cuota/origen inaccesible). El primer test de renombrado usaba POST y se corrigió al PATCH real antes de pasar de forma dirigida; no fue un fallo del producto. Nueve casos frontend nuevos y dos contratos existentes afectados, TypeScript y diff. No suites completas ni APK/proveedor. Pantallas354–356: App/Milkdown/Recuperación reales con módulos API controlados, proyecto aislado web-dev y sin puente nativo. Un checkpoint rechazado, una conservación con acuse perdido, dos consultas, carga del borrador nuevo y vista del texto anterior exacto; cero guardados fuente/descartes/red externa,320px sin desbordamiento. No acredita instalación o aceptación en hardware.

Pendiente: cobertura de productores internos no interactivos y concurrencia/suspensión instalada, recuperación asistida de intentos sin pedido RAM, catálogo/retención de recibos y otras familias, grafo Git transaccional, cuotas globales/portabilidad y restantes capacidades. La reserva es cooperativa; no promete CAS frente a procesos externos. Sin candidata3.0, publicación o cierre de los11 paquetes.


### Bloque85 · revisión de combinaciones después de reiniciar la interfaz
F04/F06/U09: Recuperación incorpora Combinaciones. El catálogo encuentra recibos persistidos sin depender del pedido que tenía el diálogo en RAM. GET /api/recovery/conflict-attempts revisa solo el almacén privado, con1000 entradas/16MiB/2s cooperativos y64KiB por recibo; limita antes de acumular, cuenta entradas desconocidas y mantiene recibos futuros/ilegibles sin acciones. No crea carpetas, migra estado, toca proyectos ni reanuda trabajos. Metadatos de documento/fase/fecha y revisión de bytes; no expone el pedido, prompts, URL de origen o nombres de ramas.

GET /api/recovery/conflict-attempts/{id} contrasta identidad del recibo, SHA de cada copia/manifiesto y operación/documento de procedencia, roles únicos y revisión completa del borrador privado. Lectura con presupuesto128MiB de copias, segunda comprobación del recibo/borrador, sin reconstruir ni ejecutar el pedido original. Si una copia cambió, conserva acceso a otras verificadas y muestra que el conjunto no está confirmado. Recibo preparando no infiere publicación por texto coincidente; fase applying/completed no implica resolución actual. Devuelve por separado draftMatchesRecordedPublication, copiesVerified y fileStateReviewed/remoteStateReviewed/canReplay=false. No confirma que archivo/origen/Git sigan iguales. Esa distinción impide atribuir éxito o sincronización a una mera coincidencia privada.

Inspección del borrador usa draft_store::inspect, que lee identidad/formatos/duplicados de borrador actual o legado sin migrar ni retirar el legado al consultar. Funciona aunque registro o fuente del proyecto no estén disponibles. La verificación de copias comparte lectura/hash con el contrato83; la vía antigua no construye filas de presentación ni añade validaciones de trazos repetidas.

Ver copias conservadas lleva a Apartadas con los IDs, huellas y roles comprobados del recibo. Esas copias siguen visibles aunque el inventario general sea parcial; ver contenido vuelve a comprobar huella y recuperar como otro archivo usa el flujo ya existente con conservación de originales. Sin proyecto, explica que hay que crear/abrir uno antes de elegir destino. Móvil usa el selector de categoría y conserva cierre fijo; resultados antiguos tras actualizar o cambiar de consulta no reemplazan la revisión vigente. El escaneo inicial no se duplica por remontaje StrictMode de desarrollo.

Contrastado: tres contratos Rust nuevos: reapertura sin pedido/registro y legado intacto; borrador posterior/copia alterada/futuro; preparación sin publicación y catálogo de1000 entradas sin crear ni podar. Comparación de archivos privados de fixture excluye bloqueos estables del sistema: el primer helper intentó leer el bloqueo propio de Windows y se corrigió para respetarlo, sin cambiar acceso ni eliminarlo. Los dos casos afectados pasaron dirigidos. Cuatro casos frontend del catálogo/consulta, TypeScript y diff. Pantallas357–360 inspeccionadas con App/Milkdown/Recuperación reales y APIs controladas: un catálogo, una consulta, una vista remota, cero mutaciones y notas intactas;320px sin desbordamiento. Sin puente nativo, proveedor, APK o suites completas.

Pendiente: archivo/reapertura/retención de recibos y demás familias, gestión global de cuota, recuperación de parejas parciales que nunca llegaron a registrarse y resolución transaccional del grafo. Esta revisión sin pedido original es asistida y de solo lectura, no la confirmación exacta83 ni una reaplicación. Integración instalada/regresión final siguen pendientes; sin candidata, publicación o cierre integral de paquetes.


### Bloque86 · archivo reversible de recibos completados
F04/F17/U09: Combinaciones distingue Sin archivar y Archivados. Solo un recibo de fase completed puede archivarse o reabrirse; los intentos pendientes permanecen visibles para revisión. POST /api/recovery/conflict-attempts/{id}/archive-state exige revisión SHA exacta de los bytes y action archive/reopen estricta, revalida antes de publicación atómica y conserva ID, fase, hash del pedido, referencias/huellas de copias y postcondición. No escribe documentos, borradores o copias, no cambia el grafo y no reaplica el intento.

Se añade archivedAt opcional RFC3339 al formato1 de recibo, omitido si no está archivado. La lectura previa sin ese campo sigue compatible y no reescribe. Una marca en fase pendiente es incompatible y se conserva bloqueada; formato futuro/campos extra/revisión vieja/acción delete no mutan. Reabrir retira solo la marca conocida. Un archivo repetido con revisión vigente no cambia su fecha ni sus bytes. El recibo sigue existiendo y begin sigue rechazando reutilizar el ID, incluso archivado. No hay otro almacén, desplazamiento físico, caducidad ni borrado automático. Un lector previo estricto que desconozca el campo conservará el recibo sin aplicarlo; no se garantiza downgrade de la prerelease.

GET /api/recovery/conflict-attempts mantiene los recibos sin archivar; GET /api/recovery/conflict-attempt-archives filtra archivados con los mismos presupuestos. Entradas no compatibles pueden aparecer en ambos ámbitos porque no se infiere su marca. Archivo es organización de la lista: los archivados siguen contando en1000 entradas/16MiB, y la UI explica que no libera espacio. Eliminar/compactar exige preservar identidades antirrepetición y continúa pendiente junto a cuota global y retención de otras familias.

La acción se ofrece solo tras revisión fresca de un recibo completado. Durante el cambio se bloquean otras acciones de esa sección; cierre permanece accesible. Se envía una mutación y después se consulta el estado, también si no llegó el acuse. Una observación sin la marca esperada deja la acción deshabilitada hasta Revisar intento; no se repite automáticamente. Si se observa la marca, se retira la fila del ámbito y se muestra dónde está. Cambiar de ámbito requiere otra revisión antes de reabrir. La consulta no declara resuelto archivo/origen.

Contrastado: dos contratos Rust nuevos, archivo/reapertura e idempotencia de metadatos, reapertura del servicio, ID no reutilizable, igualdad de todos los otros archivos privados del fixture, original semántico del recibo tras retirar la marca, rechazo de pendiente/revisión vieja/futuro/delete. Dos casos frontend nuevos: doble clic/acuse perdido con reconsulta y reapertura explícita; resultado no confirmado que requiere revisión nueva. TypeScript/diff correctos. Pantallas361–365 inspeccionadas: App/Milkdown/controles reales, APIs controladas; archivo y reapertura fueron dos cambios de metadatos con cuatro consultas de recibo, sin repetir el archivo tras perder acuse, sin cambios documentales, notas intactas,320px sin desbordamiento. No puente nativo ni aceptación instalada. Sin suites completas, APK o proveedor.

Pendiente: eliminación/retención con identidades preservadas, cuotas globales, otras familias, portabilidad y grafo transaccional; aceptación instalada/regresión final del programa. No se cierra F17 ni ninguno de los11 paquetes por esta entrega; sin candidata o publicación.


### Bloque87 · recuperar y descartar la copia que se revisó
T02/T03/F04: reproducido un borrado indebido real en el contrato de archivos ausentes. DELETE /api/drafts/{key} aceptaba solo la clave y eliminaba un borrador actualizado después de seleccionarlo. Ahora DELETE y POST .../{key}/restore exigen documentId, expectedFingerprint SHA de los bytes y locationRevision de la ubicación canónica. El SDK siempre envía esa revisión; una petición antigua sin ella no modifica datos. Rust reserva el proyecto frente a escritores cooperantes y verifica identidad completa, clave canónica o legado correspondiente, formato/tipo conocido, huella exacta, misma ubicación y archivo todavía ausente. Archivo reaparecido, origen no comprobable, dato futuro, clave/identidad o huella cambiadas conservan la copia. Se mantienen límites64MiB y rechazo de enlaces/entradas no regulares; no se promete CAS frente a escritores externos.

Servicio separado orphan_recovery.rs. Recrear conserva atomic create en destino libre: prepara el contenido validado y su límite antes de publicar, construye y comprueba el acuse del archivo antes de retirar recuperación. La limpieza vuelve a verificar bytes/identidad de la copia seleccionada; si cambió después de publicar, deja el archivo recreado y conserva el borrador nuevo/futuro con aviso. No devuelve una revisión privada no observada como autoridad de escritura. Copias duplicadas/legadas restantes se inspeccionan sin migración; solo una revisión semántica ya conocida puede formar parte del acuse. Markdown y puntos/presión/inclinación de notas conservados. No se sustituye un archivo reaparecido ni se reintenta una publicación incierta.

GET /api/recovery/orphans entrega schemaVersion1/items/limited/warnings/queriedAt, con prueba de copia y ubicación. Conteos y fecha derivan de la misma lectura acotada del inventario; se elimina la segunda lectura sin presupuesto de cada borrador para construir la lista anterior. Ubicación consultada una vez por proyecto y cobertura parcial explícita. La ruta anterior de lista mantiene el array; las acciones mutables requieren el contrato nuevo. No cambia formato persistido ni migra un borrador al consultar. UI conserva también filas de origen no disponible, con acciones deshabilitadas. El adaptador web mantiene datos de demostración centralizados; no se considera evidencia nativa.

Diálogo Ausentes: copia sin prueba no habilita acciones. Tras fallo o resultado incierto, bloquea el elemento y la confirmación hasta Actualizar completado; actualización fallida mantiene el bloqueo. El segundo descarte requiere confirmar la nueva copia. Error en el propio diálogo, sin duplicarlo en un aviso global. Cobertura parcial visible y avisos desplegables; una lista vacía parcial no afirma que no existan otras copias. Fechas ausentes no aparecen como1970. Consultas antiguas no sustituyen la revisión nueva. Restauración/descarte participan en la cola por documento; acuses actualizan refs antes de liberar la cola y conservan RAM posterior. Un borrador abierto con trabajo pendiente no puede retirarse desde esta lista. Recrear en otro proyecto conserva el espacio actual y ofrece seleccionarlo para abrir el archivo.

Contrastado: tres contratos de integración Rust dirigidos (reproducción antigua ahora rechazada; Markdown/nota con seis valores por punto; revisión, ubicación, archivo reaparecido, petición sin prueba, identidad y futuro), más un contrato de publicación con dos variantes: borrador nuevo y futuro aparecen después de crear el archivo y no se eliminan ni se atribuyen como vistos. El helper de integración se ajustó al204 correcto de DELETE y se repitió solo el caso afectado. Dos primeros casos de UI nuevos pasaron junto al tercero inicialmente fallido por nombre de botón de fixture; corregido a Conservar borrador, ese caso pasó dirigido. Tres casos frontend nuevos y dos contratos afectados en total; TypeScript y diff correctos. Las tres advertencias Rust de Result sin usar en tests antiguos de uso IA continúan, sin warnings nuevos de producto.

Pantallas366–369 inspeccionadas: App/diálogo/confirmación reales con API documental controlada y proyecto web-dev aislado, sin puente nativo o borrado real del perfil. Selección antigua rechazada una vez, confirmación bloqueada, Actualizar explícito y otra confirmación con huella nueva; solo ese segundo cambio se observa aplicado en el stub. Lista final parcial correctamente indicada;320px sin desbordamiento, consola/red externa vacías. La conservación real y la carrera tras publicar están contrastadas en los contratos Rust de carpetas temporales propias, no por la captura.

Pendiente: fallos compuestos y cortes de proceso ampliados, parejas parciales/retención/cuotas de otras familias, portabilidad, grafo Git transaccional e integración instalada. Sin suites completas, APK, proveedor, candidata/publicación o cierre integral de paquetes.


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


### Bloque93 · Reunión local de historiales con archivos idénticos
Publicación real de una versión con ambos padres, sin checkout ni reescritura de documentos/índice. Revisión vinculada y transacción de referencias, recibo durable consultable, catálogo limitado y confirmación explícita. Cuatro contratos Rust nuevos, cinco frontend y capturas386–389 controladas. [Evidencia y límites](../avance-93.md). Árboles distintos, retención y aceptación instalada pendientes.


### Bloque94 · Elección explícita de la versión guardada del equipo
Resuelve el grafo con árbol local completo y ambos padres sin reemplazar archivos/índice/borradores. Alcance de proyecto, confirmación separada y recibo2 vinculado a la elección; formato1 legible sin reescritura. Un contrato Rust nuevo y uno afectado, dos frontend, TypeScript y capturas390–394 controladas. [Detalle](../avance-94.md). Aplicación mixta de variantes, retención, migración ampliada y aceptación instalada pendientes.


### Bloque95 · Recurso histórico recuperable como archivo nuevo
Fuentes Git revisadas, binarios y versión previa a eliminación; publicación sin reemplazo con ancla/identidad física y recibo1, consulta sin reenvío y catálogo64/128MiB. Namespace privado propio y reservado, sin alterar coordinación. Tres contratos Rust nuevos, seis frontend, TypeScript, identidad Android compilada y capturas395–399 controladas. [Evidencia/límites](../avance-95.md). Aplicación mixta, árbol acotado, retención/portabilidad y aceptación instalada pendientes.


### Bloque96 · Estructura acotada y resultado conservado
Lector separado con48 niveles/20.000 entradas/10.000 nodos/8MiB/2s cooperativos, error explícito sin árbol parcial. Publicación y refresco separados; pestañas conservadas sin lectura, última vista con aviso/reintento/búsqueda, también sin navegación y en móvil. Dos contratos Rust y cuatro frontend nuevos, TypeScript y capturas400–403 con App real/API controlada. [Evidencia y límites](../avance-96.md). Navegación progresiva, retención/portabilidad, variantes mixtas y aceptación instalada pendientes.


### Bloque97 · Contenido de copia con registro incompleto
Revisión y extracción Markdown o nota estructurada sin atribuir procedencia, reparar ni sustituir originales. Revisión ligada a contenido/ubicación/registro opcional, confirmación explícita y archivo nuevo por selector nativo;2MiB de texto, original conservado. Dos contratos Rust nuevos y uno JSON afectado, tres frontend, TypeScript, compilación Tauri Windows y capturas404–407 controladas. [Evidencia/límites](../avance-97.md). Otras familias, retención global, portabilidad y aceptación instalada pendientes.


### Bloque98 · Borrador existente protegido ante revisión omitida
Llamada sin revisión: primera escritura solo sin borrador; borrador existente428 y estado no comprobable503, sin inicio. Todas estas rutas tienen admisión exclusiva no bloqueante; dos solicitudes iniciales no publican ambas. Cuatro casos Rust nuevos y nueve anteriores afectados correctos, sin ejecutar suite completa. Restauración revalida archivo/ruta/borrador después de leer Git, antes de publicar; bases obsoletas conservan originales y bases actuales crean versión nueva. [Evidencia y límites](../avance-98.md). Servicios internos restantes, retención/portabilidad, variantes mixtas y aceptación instalada pendientes.


### Bloque99 · Combinación guardada verificada por archivo
Selección durable1 de variantes originales del equipo/remoto o contenido preparado; comparación con árbol registrado, alcance completo y revisión antes de reunir ambos historiales con recibo3. Sin checkout ni sustitución de archivos/índice/borradores; la preparación usa flujos existentes. Dos contratos Rust nuevos y dos afectados, cinco frontend nuevos y dos afectados, TypeScript y capturas412–418 controladas. [Evidencia/límites](../avance-99.md). Aplicación automática de elecciones con cortes, retención/portabilidad integral y aceptación instalada pendientes.


### Bloque100 cerrado · Portabilidad documental de variantes

Paquete estándar de tres/cuatro variantes verificadas y fuente histórica de propuesta cuando exista; Markdown/notas completas, entrega nativa nueva comprobada y posterior importación como otro proyecto. Sobres privados, recursos y autoridad excluidos explícitamente; originales conservados. Cuatro contratos Rust y cuatro casos frontend nuevos, TypeScript y capturas419–422 controladas. [Evidencia/límites](../avance-100.md). Retención sin pérdida, aplicación automática, portabilidad integral y aceptación instalada pendientes.


### Bloque101 cerrado · Retención local sin pérdida

Copias verificadas de recibo completado/archivado: compactación reversible, lectura/recuperación/paquete portable desde compacto, confirmación y revisión de cortes con estados mixtos. Recibos/manifiestos e identidades conservados; sin caducidad ni borrado global. Cinco contratos Rust nuevos (incluye4 sobres de8MiB y extracción de compacto con manifiesto futuro), dos afectados, cuatro casos frontend nuevos y uno afectado, TypeScript, biblioteca Tauri Windows y capturas423–427 controladas. [Evidencia/límites](../avance-101.md). Cuotas/eliminación global, aplicación automática, portabilidad integral y aceptación instalada pendientes.


### Bloque102 cerrado · Aplicación de variantes con recuperación de cortes

Revisión de efectos, protección de editores/borradores y payloads antes/después previos a aplicar. Altas/bajas/sustituciones de archivos regulares y recursos,4 escrituras por bloque con avance solo tras acuse y pausa/continuación revisada; historial e índice separados. Admisión persistente propia impide registrar/sincronizar un parcial; finalización o cierre explícitos conservan copias. Recuperación de cada variante como archivo nuevo. Tres contratos Rust nuevos, siete frontend y dos afectados, TypeScript y capturas430–437 controladas; original/índice/HEAD, corte, cambio posterior y liberación interrumpida contrastados. [Evidencia y límites](../avance-102.md). Preparaciones ilegibles/previas a recibo, modos ejecutables, retención/portabilidad y aceptación pendientes.


### Bloque103 cerrado · Retención reversible de payloads aplicados

Compactación/expansión de copias anteriores/elegidas de preparaciones cerradas, con lectura/recuperación transparente y recibos/hashes/identidades conservados. Revisión monotónica evita repetir una solicitud antigua después de un ciclo, también en conflict-attempts. Un contrato Rust nuevo y uno afectado, cuatro frontend nuevos, TypeScript y capturas438–442 controladas. [Evidencia/límites](../avance-103.md). Respaldo portable/retirada permanente, inventarios parciales, cuotas globales y aceptación pendientes.

### Bloque104 cerrado · Respaldo completo de variantes

Respaldo ZIP de todos los payloads anteriores/elegidos de una preparación cerrada, incluidos binarios, con rutas/tamaños/SHA y sin configuración ni autoridad. Exportación nueva y comprobación exacta por selector nativo; extracción a carpeta nueva abierta como proyecto independiente. Originales y recibos conservados. Un contrato Rust nuevo, tres de recuperación afectados, cuatro frontend, TypeScript, compilación Tauri Windows y capturas443–447 controladas. Android/SAF permanece sin compilar ni aceptar por fallo Java/Gradle previo a compilación. [Evidencia/límites](../avance-104.md). Retirada permanente, inventarios parciales, cuotas globales y portabilidad integral pendientes.

### Bloque105 cerrado · Retirada local con respaldo revalidado

Retirada permanente de payloads de preparaciones cerradas con revisión/confirmación y elección/comprobación exacta de respaldo. Journal inmutable previo, parcial/retirado consultables sin continuación al leer y recibos/identidad conservados. Un contrato Rust nuevo, cuatro casos frontend nuevos y cuatro afectados, TypeScript, biblioteca Tauri Windows y capturas448–453 controladas. [Evidencia/límites](../avance-105.md). No libera cuota de IDs ni cierra retención global; Kotlin/SAF pendiente por bloqueo Java/Gradle.

### Bloque107 cerrado · Respuestas de la sesión actual

Admisión inmediata por proyecto y respuestas de última lectura/visita; cambiar/volver no revive callbacks ni libera otro trabajo. Tres casos dirigidos, TypeScript y capturas454–457 con App real/API controlada. [Evidencia/límites](../avance-107.md). No cierra el paquete completo.

### Bloque108 cerrado · Guardado legible en móvil

Tarjetas móviles con nombre/ruta/fecha y tres estados visibles, filtros plegables y carga sin falso vacío. Dos casos nuevos/seis afectados, TypeScript y capturas458–464 con App real/API controlada a320x780/560. [Evidencia/límites](../avance-108.md). No cierra el paquete completo.

### Bloque109 cerrado · Recuperar lo legible sin adoptar el registro

Extracción de una copia conocida legible aunque falte el recibo o falle otra. ZIP de bytes exactos sin procedencia/autoridad adoptadas; originales intactos. Un contrato Rust, cuatro casos frontend, TypeScript, Tauri Windows y capturas465–469 controladas. [Evidencia/límites](../avance-109.md). El programa y el paquete mantienen trabajo pendiente.

### Bloque111 cerrado · Teclado y vuelta al punto de trabajo

Límite modal compartido en guardado/sincronización, fondo aislado, Tab/Shift+Tab/Escape y devolución a origen visible o área principal tras resize. Tres casos nuevos/doce afectados, TypeScript y capturas470–473 de App real/API controlada. [Evidencia/límites](../avance-111.md). El programa y el paquete mantienen trabajo pendiente.

### Bloque113 cerrado · Registro desde contenido revisado

Revisión nativa de bytes/ubicación/HEAD/índice; decisiones explícitas, preparación congelada y transacción Git por rutas que conserva preparación ajena. Borradores protegidos y respuesta incierta consulta sin reenvío. Un contrato nuevo y uno afectado Rust, cinco casos frontend nuevos/quince afectados, TypeScript y capturas482–488 controladas, con ajuste de altura verificado solo en el recorrido afectado. [Evidencia y límites](../avance-113.md). Otros productores, retención/cuotas/portabilidad y programa siguen pendientes.

### Bloque114 cerrado · Centro común de preparaciones, espacio y traslado

Recuperación incorpora Proyectos y Espacio; catálogo mixto local independiente del remoto, ámbitos de proyecto aislados, revisión y acceso a respaldo/retención/retirada/extracción ya existentes. Exportación por proyecto y medición/limpieza segura explícitas, alcance del traslado visible. Un contrato Rust, seis casos frontend, TypeScript y una campaña visual conjunta489–493. Se reutilizan resultados de los diálogos. [Evidencia/límites](../avance-114.md). Inventarios/cuotas entre familias y traslado integral siguen pendientes.

### Bloque115 cerrado · Inventario común y admisión por presupuesto

Metadatos de15 familias, carpetas mixtas previas al recibo y cobertura explícita, sin lectura de contenido/coordinación ni autoridad de borrado. Presupuesto opcional revisado y serializado para nuevas selecciones/preparaciones, recibos y copias de combinación; guardados/borradores/continuaciones excluidos. Dos contratos Rust, siete casos frontend/SDK, TypeScript y campaña494–498 controlada. [Evidencia/límites](../avance-115.md). Cuotas de identidades, productores restantes, inventarios externos, retención de otras familias y traslado integral continúan.

### Bloque116 cerrado · Respaldo íntegro y retirada de copias de conflictos

ZIP privado con bytes/metadatos originales y paquete documental importable; selección/comprobación exacta antes de retirar representaciones. Diario inmutable, revisión monotónica y cortes consultables sin continuar; recibo/manifiestos/identidad conservados. Admisiones por almacén también en revisión monotónica, con contrato concurrente de dos perfiles. Dos contratos Rust nuevos/tres afectados, seis casos frontend/SDK, TypeScript, Tauri Windows y campaña499–504 controlada. [Evidencia/límites](../avance-116.md). No libera IDs ni cierra retención/portabilidad integral.


### Bloque118 cerrado · Cobertura externa y presupuesto

Inventario ampliado a20 familias del perfil y tres tipos de almacén de proyectos registrados (papelera, copias históricas y preparación), también externos: metadatos acotados, raíces solapadas deduplicadas, registro no comprobable implica cobertura parcial. Presupuesto opcional extendido antes del payload a nuevas plantillas de proyecto y anclas históricas; audio/traslados medidos, creación aún exenta y declarada (118). Tres contratos Rust nuevos/uno afectado, un caso frontend y campaña visual510–512. [Evidencia/límites](../avance-118.md). No cierra cuotas/retención ni portabilidad integral.


### Bloque119 cerrado · Preferencias portables

Adopción explícita de preferencias visuales desde el archivo portable: comparación actual/importado, selección separada de aspecto/idioma y anchos, autoridad existente de protección/recarga del espacio de trabajo y revisión ligada a ubicación/archivo/configuración. Campos no elegidos e IA conservados, futuros/cambios rechazados y acuses inciertos consultados sin reenvío (119). Tres contratos Rust, ocho casos frontend/SDK y TypeScript; App real con adaptadores, transición y reapertura móvil513–516. [Evidencia/límites](../avance-119.md). Continúa adopción de historial/audio/borradores y el resto del programa.


### Bloque120 cerrado · Ubicaciones conservadas y retiradas

Inventario de ubicaciones conservadas en fichas retiradas, distinguiendo proyecto retirado y ubicación anterior de proyecto registrado. Deduplicación y filas ligadas también a ruta canónica; sin reclamar propietario/activar/restaurar. Catálogo futuro implica cobertura parcial y se conserva; retirar no descuenta bytes del presupuesto. Consultas de inventario, payloads y preferencias pasan por vía independiente, con escrituras aún serializadas (120). Dos contratos Rust nuevos/uno afectado, clasificación contrastada, tres casos frontend/SDK y TypeScript; campaña517–519. [Evidencia/límites](../avance-120.md). Continúan cuotas/retención y portabilidad integral.


### Bloque122 cerrado · Borradores portables y continuación protegida

Borradores del archivo portable revisables por separado, con SHA/formato conocidos y copias del mismo documento diferenciadas. Copia nativa estable en Apartadas; continuación explícita de Markdown/nota solo con base guardada coincidente y sin borrador local/legado, autoridad existente de protección/recarga y publicación sin reemplazo. Fuente y documento guardado conservados, cuota antes de la copia, futuros/parciales rechazados y acuse incierto consultado sin repetir (122). Cuatro contratos Rust, uno afectado del índice compartido, siete casos frontend/SDK, TypeScript y campaña523–526. [Evidencia/límites](../avance-122.md). Continúan audio/historial y el resto del programa.


### Bloque123 cerrado · Cupos de registros y retención de identidades

Cupos de registros de seis familias consultables bajo demanda, separados de bytes y presupuesto global; límites compartidos con los productores sin cambiar valores. Ámbitos existentes por proyecto/perfil, metadatos desconocidos conservados, cobertura y asociación explícitas, máximos200 ámbitos/10000 entradas/2segundos. Reducir payloads no libera las identidades antirrepetición; la medición no concede creación, borrado ni reciclado (123). Dos contratos nativos, cinco casos frontend/SDK, TypeScript y campaña527–529. [Evidencia/límites](../avance-123.md). Continúan gestión segura de identidades, otros productores/retención y el programa completo.


### Bloque124 cerrado · Audio portable retenido en escritorio

Audio del archivo portable revisable y adoptable en escritorio como sesión nativa detenida y retenida: partes WAV/PCM exactas, identidad estable ligada al receptor, copia exclusiva con registro al final, sin cola/costes/envíos ni caducidad automática. Presupuesto global opcional y límite del almacén de512MiB/1000 carpetas para admitir nuevas copias; captura, niveles, dictado o envío activos bloquean. Acuse incierto consultado sin duplicar, y originales/transcripción conservados. Android muestra su alcance pendiente (124). Seis contratos nativos, seis casos frontend/SDK, TypeScript, comprobación Tauri Windows y campaña530–534. [Evidencia/límites](../avance-124.md). Continúan historial, audio Android, otros productores/retención y el programa completo.


### Bloque125 cerrado

Historial portable consultable en escritorio cuando no hay historial ni preparación previa: revisión de bundle/partes y elección de punto por título/autor/fecha, objetos y referencias conservados bajo nombres internos, sin checkout, remotos, configuración del origen ni cambios en documentos/borradores/ajustes. Publicación sin reemplazo y preparación durable inventariada, incluidos proyectos retirados/conservados; protección/recarga del espacio, acuse incierto consultado sin repetir y rutas Windows corregidas (125). [Evidencia y límites](../avance-125.md). Programa completo abierto; aceptación física y ampliaciones restantes.


## Bloque 1 · Integridad, recuperación y almacenamiento · entrega 129

Implementación técnica cerrada en el alcance de [bloque-129.md](../bloque-129.md); verificación dirigida completada en [avance-129.md](../avance-129.md). No cierra este paquete completo.

- [x] Inventario común, bytes parciales, respaldo privado y cierre de identidades terminales con dependencias protegidas.
- [x] Continuación por revisión y retirada tras respaldo externo íntegro, sin reenvío automático ni reciclado de IDs.
- [x] Preparaciones mixtas conocidas incompletas: otra selección o cierre conservando copias; modos de archivo declarados.
- [x] Reservas en productores internos/versiones y admisión de nueva captura/transferencia.
- [x] Compatibilidad secundaria con original previo al cambio de esquema y resumen de protección por proyecto.
- [ ] Piloto instalado, selectores nativos, cortes/espacio físicos y aceptación Windows/Android en P10.

Se mantienen las ampliaciones funcionales y los otros bloques del programa; ver backlog. Sin IA de pago ni suites completas durante el desarrollo.


## Bloque5 · Edición documental y reversión · entrega133

Desarrollo local cerrado en el alcance de [bloque-133.md](../bloque-133.md): fidelidad Milkdown/pegado protegido, restauración histórica de archivos como nueva versión, trazabilidad/reversión IA por bloques/páginas y reemplazo revisado entre documentos. Tres subagentes reales con ámbitos exclusivos y coordinación de contratos/autoridad/inventarios. Copias/acuses sin replay, edición posterior conservada y procedencia portable solo como datos. [Reporte visual y verificación](../avance-133.md); [contratos y límites](../../../architecture/document-editing-and-reversion.md).

Backlog50 y cobertura70 conservan sus IDs. No se declara cerrado todo el programa: aceptación instalada/regresión final P10 y otros bloques pendientes. T17 real aplazado sin gasto; Git nativo Android no disponible. Sin suites completas, publicación, instalación ni cambio de VERSION2.6.0.


## Bloque7 · Recursos, plantillas y conocimiento conectado · entrega135

Desarrollo local implementado/revisado en [bloque-135.md](../bloque-135.md) y [reporte visual](../avance-135.md): adjuntos de plantillas, catálogo agrupado de proyectos y recursos/enlaces bajo demanda. Tres agentes reales, ámbitos exclusivos; hashes/copias/colisiones y acuses conservados, movimiento revisado por archivo/carpeta/lote.39casos nativos y56frontend únicos; build final y comprobación Android en reporte.16capturas598–613 controladas; no aceptación instalada.

F03/F14 y relacionesF07/F17/U12 conciliadas; [contratos](../../../architecture/resources-templates-and-links.md). Continúan investigación8/copias9/UX10/rendimiento11 y P10físico/humano. Acciones de ruta renombrar/eliminar se contrastarán en UX10 con el impacto ya disponible. T17 real sin gasto, sin publicación/instalación/cambioVERSION.


### Entrega137 · Copias programadas cerradas en desarrollo local

F04 continúa con política diaria optativa por proyecto, paquetes verificados, retención por alcance y restauración como proyecto nuevo. [Criterios y verificación](../bloque-137.md). Las copias sólo se ejecutan con el proceso activo; aceptación instalada separada en P10. Sin IA ni cambios de versión/publicación.

Cierre:22casos nativos,54frontend,build/TypeScript y RustAndroid correctos;8capturas620–627. Sin gasto ni aceptación instalada. [Reporte137](../avance-137.html).


## Conciliación documental139 previa al cierre de regresión · 2026-11-06

Biblioteca/conflictos/recuperación implementados; revinculación con fuente ausente corregida139 y contrastada en16casos dirigidos; regresión global y aceptación P10 pendientes. Las notas históricas anteriores conservan su fecha/alcance; sus frases de «pendiente» no reabren desarrollos ya entregados. Evidencia actual: [Integridad129](../avance-129.md), [edición133](../avance-133.md), [recursos135](../avance-135.md), [copias137](../avance-137.md). El [bloque139](../bloque-139.md) está en verificación final: la regresión Rust y correcciones concretas continúan, sin PASS global anticipado. P10/U16 conservan aceptación física/humana; T17 proveedor real permanece aplazado por decisión de no gasto. Git nativo Android y capacidades dependientes de proveedor/hardware siguen sujetos a disponibilidad real.


## Cierre verificado139 · 2026-11-06

Regresión local139 cerrada:1.158casos frontend y740Rust únicos correctos; build/tipos/bundle y comprobación Rust Android correctos. Dos benchmarks aislados adicionales. Una campaña completa y repeticiones sólo de fallos/casos invalidados. La revinculación con origen ausente está corregida y revisada por un segundo agente. [Resultado y límites](../avance-139.md). Las notas históricas conservan su fecha; no reabren desarrollos ya entregados. P10/U16 mantienen instalación/actualización, dispositivos/SAF, cortes/suspensión, accesibilidad y personas; T17 real sigue aplazado sin gasto. Git nativo Android y capacidades condicionadas conservan sus límites documentados. No publicación/instalación/cambioVERSION.


## Consolidación de alcance140 · 2026-11-06

[Alcance local y exclusiones vigentes](../consolidacion-140-alcance.md). La regresión139 está cerrada; los textos anteriores a ese cierre conservan su contexto. La preparación y validación instalada están ahora autorizadas, sin publicar ni gastar en IA. Este ajuste documental no constituye una instalación o aceptación.
