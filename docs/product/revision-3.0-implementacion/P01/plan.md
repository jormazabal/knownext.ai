# P01 · Plan evolutivo
[Definición](tarea.md) · [Plan principal](../plan.md)
Estado: Desarrollo local del paquete integrado y regresión139 correcta; aceptación instalada/física/humana P10 y T17 real según alcance pendientes. Sin candidata, publicación ni instalación3.0. Responsable: Rust/runtime con frontend; persona por asignar. Esfuerzo relativo XL, sin conversión a calendario.

## Entrada
- [P00](../P00/plan.md): entradas pertinentes según las dependencias del plan principal; no exige finalizar todas sus ampliaciones.
Hito propuesto: H1; extracciones incrementales.

## Cortes de trabajo
1. [x] Definir contratos de error, operación, versión y cancelación en los flujos que se tocarán; extraer únicamente esos dominios.
2. [x] Implementar escritura recuperable, versionado optimista y reconciliación de borradores; registrar resultados antes de declarar éxito.
3. [x] Separar trabajos largos/publicación crítica y conservar orden por recurso (130);139 registra baseline de latencia, sin afirmar cancelación de llamadas indivisibles del SO.
4. [x] Implementar coordinación/diario y recuperación de estado sin replay (130). Suspensión/cierre/actualización físicos se aceptan por separado en P10.
5. [x] Implementar migración conservadora de formatos conocidos y recuperación/diagnóstico; muestra2.6.0 en copia aislada contrastada (129). La migración instalada integral continúa en P10; formatos futuros no se convierten implícitamente.

## Superficies a inspeccionar antes de editar
apps/desktop/src/lib/api; apps/desktop/src/types; apps/desktop/src/app; apps/desktop/src-tauri/src; crates/knownext-core y knownext-storage.
Las rutas describen el ámbito propietario esperado, no una orden de modificar todos sus archivos. Confirmar contratos y cambios locales al comenzar cada corte.

## Verificación prevista
Contratos Rust/Tauri, tests de fallos de E/S y concurrencia, componentes de guardado, reinicio y suspensión nativos; diagnóstico sin datos privados.
Cada criterio P01-C se asociará a evidencia del corte que lo implemente, con entorno y resultado. Las verificaciones y sus límites se registran en los avances enlazados; no equivalen por sí solas al cierre completo del paquete.

## Riesgos y tratamiento
Acoplamiento y migraciones con datos reales. Trabajar por verticales, con fixtures y fallos inyectados, sin reescritura integral.

## Ampliación y condición de entrada
Homogeneizar dominios restantes, coordinación entre instancias y reanudación por etapas si la plataforma lo permite.
Se concreta el comportamiento, contrato y aceptación del siguiente corte antes de empezar; permanece en el backlog aunque no entre en 3.0.

## Progreso y siguiente paso
- Hecho: implementación local y verificación dirigida de los recorridos descritos en [Integridad129](../avance-129.md), [runtime130](../avance-130.md); consultar sus límites, no la antigua cabecera de primer corte.
- Hecho: regresión local139 cerrada; reutilizar evidencia no invalidada, sin repetir suites completas por cambios documentales.
- Pendiente: preparar y aceptar la candidata instalada Windows/Android, migración/actualización/recuperación, dispositivos/fallos físicos y recorridos con personas en P10/U16. T17 real sigue aplazada sin gasto.
- Próximo paso: el coordinador completa la revisión e integración Git y diagnostica el entorno; después construye y valida la candidata instalada según la autoridad actual. Registrar cada resultado por artefacto, entorno y revisión.
- Publicación excluida por instrucción actual. La autorización de preparar e instalar no acredita instalación realizada ni aceptación humana. Las capacidades condicionadas se conservan sin simulación.

## Avance 02
Ver [implementacion, pruebas y pendientes](../avance-02.md). Este paquete permanece abierto: no se equipara una implementacion parcial a su aceptacion completa. El desarrollo del programa completo esta autorizado.


## Avance 03
Ver [contrastes, implementación y pendientes](../avance-03.md). Se mantiene abierto el paquete y su alcance restante; no se declara completado por esta entrega.


## Avance 04
Estado y evidencia vigentes: [continuidad, seguridad nativa y primer uso](../avance-04.md). Continúa el alcance completo restante; no se cierra este paquete.

## Corte activo · identidad y base de recuperación
Dos pruebas nuevas reproducen mezcla de borradores de `a-b.md`/`a_b.md` y pérdida de la base original al reabrir tras un cambio externo (`v3-draft-recovery-before.log`). Se extrae el almacén de borradores: clave derivada de la identidad completa, lectura y migración legado comprobando propietario, errores conservadores y eliminación con resultado. La reapertura mantiene la huella original del borrador y exige resolver el conflicto antes de sobrescribir disco. La restauración debe crear exclusivamente un destino libre y respetar el tipo Markdown/manuscrito. Tras verificar esta base se continúa con referencias y borradores de movimientos en P05.


## Avance 05
Recuperación, continuidad e historial: [evidencia y pendientes](../avance-05.md). No se cierra el alcance restante de este paquete.


## Avance 06
[Traslados, continuidad y referencias](../avance-06.md). Implementación y comprobación parciales; continúa el alcance restante. No se declara cerrado este paquete.


## Corte 07
Información y referencias contextuales, corpus acotado, capacidades por plataforma y restauración del panel fijado. [Evidencia transversal](../avance-07.md). Este corte no cierra el paquete ni sus ampliaciones.


## Corte 08
Revisión de variantes y copias dañadas, recuperación como otro archivo, archivo privado verificado y categorías fijas. [Evidencia transversal](../avance-08.md). No cierra el paquete ni sus ampliaciones.


## Corte 09
Configuración integrada, continuidad, errores por grupo y guardado ordenado. [Evidencia transversal y límites](../avance-09.md). No cierra el paquete ni sus ampliaciones.


## Corte 10
Estado crítico protegido, revisión/restablecimiento conservando originales y aislamiento del inicio. [Evidencia transversal y límites](../avance-10.md). No completa el resto del paquete ni sus ampliaciones.


## Corte 11
Búsqueda de ajustes, resumen integrado, foco y trabajo de vistas ocultas. [Evidencia transversal y límites](../avance-11.md). Continúa todo el alcance restante; no se cierra el paquete.


## Avance 12
[Espera principal, continuidad y revisión de resultados IA](../avance-12.md). Verificación parcial frontend/Rust y Android sin red; no cierra el paquete ni sus ampliaciones. Continúan todos sus criterios restantes y la aceptación nativa.


## Avance 13
[Revisión, borradores y autoridad IA](../avance-13.md). Evidencia parcial por tramo; continúan el resto del paquete y sus ampliaciones.


## Avance 14
[Imágenes/trazos y revisión raster](../avance-14.md). Evidencia parcial nativa/Rust/frontend; siguen el resto del paquete y sus ampliaciones.


## Avance 15
[Exportación comprobada y destino Android](../avance-15.md): 479 frontend, suite Rust 259/259 más dominio PDF actualizado 19/19 y APK 29 contrastado sin red. Corpus de 15 páginas, cancelación, nombre elegido, escritura y lector nativo. Continúa todo el programa; no cierra paquetes ni sus ampliaciones.


## Corte 18 definido · conservar las propuestas IA desde su recepción
P01/P02/P04: conservar en Rust las salidas de propuestas Markdown que necesitan confirmación antes de entregarlas al renderer, no solo cuando se rechaza su aplicación. Usar el almacén de resultados y su acuse nativo existente. Solo salida generada; nunca sobre de petición, prompts, claves, contexto/base del documento ni posiciones ejecutables. Una propuesta pendiente sobrevive al cierre como una copia para comparar o guardar aparte. Al reiniciar no se ejecutan operaciones antiguas ni se vuelve a consumir proveedor.

La copia conservada permanece hasta que el usuario la quite, también si aplicó la propuesta en esta sesión. La interfaz debe llamarlas resultados conservados, sin presentarlas todas como tareas pendientes, e informar del acuse de conservación en la tarjeta de propuesta. Fallo de disco/cuota mantiene respuesta y revisión RAM y advierte de que no se cierre antes de conservarla; nunca comunica persistencia correcta sin ACK. Reintentar conservación usa la misma salida, sin nueva llamada IA. No se afirma recuperación de la selección ni reaplicación sobre offsets antiguos.

Antes de ampliar retención, aplicar presupuesto real de escritura al almacén completo: 256 entradas y 64 MiB, contando archivos dañados/futuros sin borrarlos. Mantener tope individual 32 MiB y copia idempotente por identidad. Una entrada no verificable o una carpeta/enlace bloquea ampliación con diagnóstico, sin recorrer destinos externos ni limpiar automáticamente. Permitir reintentar un registro idéntico ya guardado aunque se alcance cuota. No es coordinación CAS entre procesos.

Contrastar recepción manual normal y reinicio, política directa sin conservación automática añadida, sobre de modelo con acuse falso retirado, fallo de escritura, cuotas por bytes/entradas, conservación idempotente y copia nueva sin sobrescribir el documento. Ejecutores controlados sin proveedor externo; distinguir esa prueba de la validación visual/web y de cualquier comprobación APK. Continúa todo el alcance restante, incluidos investigación, plantillas amplias, transferencia de proyectos y aceptación física.


## Avance 18
[Conservación desde la recepción y recuperación revisable](../avance-18.md): 509 frontend, suite Rust 278 más dominio resultados actualizado 10/10; 42 ejecuciones Rust Android y APK39 contrastado sin red. Reintentos/retiradas se reflejan en la tarjeta, sin resurrección por acuses tardíos. Continúa todo el programa, sin cierre completo del paquete.


## Corte 19 en ejecución · paquetes documentales de proyecto
P09/F07 con P01/P02/P05: paquete ZIP `*.knownext-project.zip` y manifiesto estricto `knownext-project.json`, formato knownext.project/version 1. Primera parte: documentos guardados, imágenes/recursos compatibles, .knote y carpetas vacías. Mantener rutas relativas y verificar tamaños/SHA de cada entrada. No exportar raíz absoluta, credenciales, configuración de aplicación, Git, papelera ni carpetas internas/ocultas; la revisión enumera exclusiones. El contenido de archivos puede incluir datos personales escritos por el usuario: no se promete detección automática de secretos. Historial, grabaciones, borradores y preferencias conservan su ampliación posterior.

Preparar una instantánea de archivos guardados fuera del bloqueo global de guardados, sin convertir ni descargar recursos. Si hay RAM/borradores sin guardar, avisar y pedir una elección explícita de exportar solo lo guardado; no prometer que se incluyeron. Detectar enlaces/recursos ausentes y diferencias de rutas/caso que puedan romperse al pasar de Windows a Android. Toda adaptación determinista de referencias debe figurar en el informe; los originales quedan intactos.

Importar siempre crea un proyecto local nuevo y una identidad nativa nueva, sin fusionar/reemplazar proyectos. Nombre ocupado permite renombrar. Archivo elegido se conserva. Revisión previa mediante trabajo nativo y huella; React recibe resumen/ID, no ZIP base64 ni URI/rutas libres. Windows usa diálogo/lectura Rust; Android ContentResolver copia con límite real a un destino privado controlado por Rust. Confirmar usa la misma instantánea revisada, valida de nuevo entradas/raíz de destino y crea ficheros exclusivamente. Registrar el proyecto solo tras tener contenido completo; fallo de registro conserva un recibo recuperable y permite reintentar sin copiar encima de archivos nuevos o modificados.

Presupuestos iniciales: archivo ZIP y contenido descomprimido hasta 128 MiB cada uno, 32 MiB por archivo, manifiesto hasta 8 MiB, máximo 10.000 entradas y un trabajo pendiente. Acotar también el almacenamiento de preparación, contar restos desconocidos y no limpiarlos a ciegas. Prevalidar directorio central antes de reservar memoria; no admitir ZIP64, cifrado, enlaces ni métodos ajenos a Stored/Deflate en esta primera entrega. Rechazar rutas absolutas, parent/drive/ADS, nombres reservados Windows, duplicados por caso/normalización y archivos extra no declarados. No usar extract genérico del ZIP.

UX integrada: exportar desde acciones de proyecto, importar como origen de proyecto, revisión compacta con nombre, contenido, exclusiones y recursos ausentes; un único scroll y acciones 44 px visibles. Preparación, revisión, selector, guardado/importación, cancelación, fallo y registro pendiente son estados distintos. Conservar formularios/contexto, impedir dobles confirmaciones y volver a cargar lista/árbol solo con acuse nativo. Copias temporales se retiran tras confirmar o cancelar de forma segura; un proyecto pendiente de registro no se borra silenciosamente.

Contrastes: ida/vuelta entre raíces independientes con Markdown + PNG + .knote + carpeta vacía; imágenes/enlaces tras Windows→Android offline, hashes, exclusiones, colisión de nombre, recursos ausentes y rutas con diferencias de caso. Corpus adverso de traversal/drive/ADS/symlink, duplicados, futuro/JSON dañado, manifest/ZIP discrepantes, SHA/tamaño falsos y límites de expansión. Guardado concurrente no bloqueado y fallo de registro recuperable. Separar pruebas de dominio/controladas, recorridos web, selectores nativos y aceptación física. No cierra otras ampliaciones ni el programa.


## Avance 19
[Paquetes documentales entre Windows y Android](../avance-19.md): 517 frontend, 297 Rust, 8 JVM y APK41 offline. Primera parte F07 contrastada; nombre al reabrir, referencias a carpetas y mensajes de entrega pasan al siguiente tramo. Continúan todo el paquete y el programa, sin cierre completo.


## Corte 20 definido · continuidad de la revisión y referencias a carpetas
Completar los ajustes observados en APK41, sin sustituir la preparación revisada ni ampliar su contenido. Guardar el nombre provisional de una importación al cerrar con ID/huella y acuse nativo; aceptar provisional vacío y validar el nombre final solo al importar. Un fallo de conservación mantiene diálogo/valor para repetir. Cerrar no importa y no recrea archivos; reabrir/reiniciar recupera el nombre confirmado. El formulario de Crear proyecto subyacente permanece intacto.

Comunicar cancelación del destino explícitamente, conservar el mismo paquete revisado y proponer como nombre de archivo el proyecto con saneado portable y longitud acotada; Windows sigue creando un destino nuevo. No añadir rutas a React.

Las referencias guardadas a carpetas regulares deben devolver kind folder/status available, sin convertir un enlace o ruta externa en autoridad de navegación. El panel permite Mostrar carpeta y abre/selecciona esa carpeta en la navegación contextual, conservando documento, cambios y posición. Una carpeta con extensión .md sigue siendo carpeta; faltantes/bloqueadas no ofrecen abrir. No cambiar el alcance de contenido guardado ni dar por resuelta toda navegación directa desde enlaces del editor.

Contrastar nombre distinto/vacío al cerrar/reabrir y reiniciar, error de ACK con valor conservado, huella/ID cambiados, ausencia de importación al cerrar, cancelación de destino sin éxito falso y nombres reservados/largos. Probar carpeta vacía, carpeta con extensión, padre enlazado y navegación desde panel estrecho sin perder el editor. Pruebas Rust/frontend pertinentes y APK QA offline; mantener separados datos sintéticos, selector real y aceptación física. Sigue todo el programa y sus ampliaciones.


## Avance 20
[Continuidad de revisión y navegación a carpetas](../avance-20.md): 520 frontend, 300 Rust y APK42 offline. Tres ajustes C19 contrastados; campo vacío/reinicio, fallo de permiso y borrador exacto conservados. Se detecta pérdida ALT de imagen, F16/P0, priorizada en C21. Continúa todo el alcance restante.


## Corte 21 definido · F16/P0, fidelidad de imágenes en Milkdown
Incidencia reproducida en APK42: una edición de texto ajena a la imagen sustituye ALT Pixel por 1.00 en el borrador. La fuente instalada Milkdown 7.20 confirma el uso por defecto de ALT como ratio. Mantener Milkdown/React/Tauri y el flujo de documento normal; corregir mediante extensión pública de esquema/parser/serializer, sin editar node_modules ni usar reemplazos globales de cadenas Markdown.

Separar atributos de texto alternativo, título/caption y tamaño. Abrir/cerrar sin editar no reescribe el archivo. Editar un párrafo, pegar, deshacer, guardar y reabrir conserva ALT, título, URL y tamaño de bloques ajenos. La vista DOM debe exponer el ALT real. Actualizar metadatos de una imagen no pierde el resto de sus atributos ni altera otra aparición de la misma URL.

Conservar el ratio fuera de ALT mediante metadatos explícitos versionados y acotados, ligados estructuralmente a su imagen; un lector Markdown convencional sigue viendo la imagen normal. Validar dato, versión y límites; no consumir ni borrar comentarios ajenos/dañados/futuros. Compatibilidad de geometría numérica del esquema anterior requiere decisión documentada que preserve el ALT existente sin inventar texto perdido. No reconstruir automáticamente etiquetas ya sobrescritas sin una fuente conservada. Las rutas locales/imagen siguen mediadas por Rust y la extensión no descarga recursos.

Contrastar corpus con imagen de bloque y en línea, ALT normal/vacío/numérico/caracteres escapados, título, URL con query/fragmento, imágenes repetidas, resize/reset y metadatos futuros/dañados. Probar esquema real y editor real en navegador aislado y APK QA sin red; distinguir bytes sin edición de la normalización legítima del Markdown al editar. Exportaciones/transferencia deben conservar contenido y no mostrar metadatos técnicos como texto. Solo después de resolver la pérdida reproducible continuar otras ampliaciones. Mantener todo el programa y su aceptación física abiertos.


## Avance 21
[Imágenes que conservan su significado](../avance-21.md): corrección F16/P0 contrastada; 535 frontend, 305 Rust y APK48 offline. Documento idéntico al reabrir; pies debajo, sin URLs temporales. Exportaciones nativas y preparación ZIP verificadas. Entorno QA restaurado; continúa C22/F17 y todo el programa, sin cierre completo del paquete.


## Avance 22
[Retirar un proyecto sin perder su trabajo](../avance-22.md): 554 frontend, 313 Rust y APK50 offline. Retirada/reincorporación, permisos, colisión y reinicio contrastados; bloqueo de modales detectado en 49 y corregido/verificado en 50. Cuatro hashes y red QA restaurados. Continúan F17, todas las áreas y ampliaciones, sin cierre completo de paquetes.


## Avance 23
[Datos locales con un alcance claro](../avance-23.md): 559 frontend, 320 Rust y APK51 offline. Mapa explícito de uso lógico, enlaces omitidos y catálogo futuro conservado; consulta sin cambios en cuatro almacenes. Red/estado QA restaurados. Sigue C24 con validación de rutas/acuses de índices y todas las áreas/ampliaciones, sin cierre completo de paquetes.


## Corte 24 definido
Prioridad de integridad de rutas y acuses del índice IA, contrato y continuación en el [plan principal](../plan.md). Solo pruebas de manipulación en TempDir aislado; no se amplía limpieza genérica ni se cierra el paquete.


## Avance 24
[Índices con identidad, revisión y resultado verificables](../avance-24.md): 568 frontend, 329 Rust y APK53 offline. Defecto de ruta reproducido en TempDir y corregido; revisión, permisos, efectos parciales y cache futuro contrastados sin alterar la fuente. Estado/RAG conservados y QA restituida. Continúan otras rutas de datos secundarios, limpieza ampliada y todo el programa, sin cierre completo de paquetes.


## Corte 25 definido
Ámbito común de proyecto, identidad/propietario de vistas previas y errores contextuales. Definición completa en el [plan principal](../plan.md); pruebas de manipulación exclusivamente en TempDir y sin cierre del paquete.


## Avance 25
[Ámbito de proyectos y recuperación del visor](../avance-25.md): 573 frontend, 338 Rust y APK56 offline. Fuentes conservadas, reintento/reinicio verificados y QA restituida. Continúan adaptación móvil del visor, durabilidad/limpieza y todo el programa; no se cierra el paquete.

## Avances37–41
[Plan principal](../plan.md): capacidades reales de historial, lectura de disco preparada antes de descarte y reprotección de respuesta incierta. Reconstrucción de índice con cálculo fuera del mutex y publicación guardada por asociación/revisión; presupuestos de corpus y XML Office. Casos focales y APK60 contrastados; todos los almacenes/QA restituidos. Planificador general, persistencia secundaria/migración y coordinación entre procesos siguen pendientes; no se cierra P01.


## Avances43–55 · estado vigente
C43–C55 añaden fronteras de persistencia secundaria, migración revisada y conservación antes de normalización ordinaria. Fuente futura de nota y borrador se conservan; un borrador conocido puede recuperarse aparte. H61 instalado/restaurado; C51–55 en compilación62. Coordinación entre perfiles, fallos compuestos y migración/piloto integrales siguen abiertos. Detalle y evidencias en el [plan principal](../plan.md); no se declara cerrado el paquete.


## Rutas y contabilidad fuera del núcleo
Despacho JSON/binario y consumo separados en módulos, con cuerpos trasladados comparados por hash y API conservada. Validación de mes/prefijo Unicode corregida y caso dirigido correcto; no repetición de suites para el movimiento mecánico. Detalle/recibo en plan principal/avance66. Otros núcleos y el programa permanecen abiertos.


### Continuación explícita de migración interrumpida
Diarios estrictos y ligados a revisión; toda la cohorte/copias revalidadas por paso. Completar solo destinos exactos, omitiendo pasos actuales; recuperar conserva originales. Timestamp ausente no se inventa. [Avance75](../avance-75.md); contratos/UI/aplicación controlada correctos. Piloto real2.6 e integración instalada pendientes.


### Conservación de puntos críticos
Archivo/reapertura y eliminación manual revisada de puntos conocidos; autoridad de restauración/completar exige punto activo. Intención de eliminación y huellas permiten observar interrupción sin reanudar al abrir. [Avance78](../avance-78.md); activos/originales ajenos conservados en contratos. Piloto real/integración pendientes.


### Datos reales2.6 contrastados de forma aislada
Seis almacenes del perfil etiquetado2.6.0 copiados a Temp privado y convertidos con Rust actual. Exportación/consumo legados, copias/reapertura/idempotencia/recuperación exactas; crítico restaurado conserva consumo2 posterior. Originales intactos y copia privada cerrada. [Avance79](../avance-79.md). No acredita instalación/piloto completo ni downgrade.


### Lotes profundos y registro durable legible
Recorrido con presupuesto y búfer único; comprobantes sin árbol duplicado, escritor verifica legibilidad y vistas actuales separadas. Fuentes preservadas y sin replay tras reapertura. [Avance80](../avance-80.md). Sin CAS frente a escritores externos ni reparación inferida de diarios ilegibles.


### Bloque82 · reserva cooperativa durante combinación y rechazo sin falsa confirmación
T03/T04/F06: las concesiones de proyecto ahora comparten en memoria admisiones de escritura y una reserva exclusiva de publicación, entre clones e instancias LocalApi del mismo perfil/fuente canónica. No crea otro archivo ni borra/reemplaza owner.lock. Admisión normal no serializa por sí sola escritores ordinarios; siguen actuando sus huellas/revisiones. Reserva exclusiva no espera ni intenta ascender un permiso activo, evitando bloqueos al estar dentro de otras colas. Anidación del mismo hilo permitida; un hijo vivo mantiene la reserva aunque se libere antes el padre. Permisos no transferibles de hilo, liberados por Drop.

Aplicación de conflictos Markdown y notas adquiere reserva exclusiva solo en publicación/conservación, no mientras el usuario lee o elige bloques/páginas. Entrada API de escrituras documentales/borradores, nodos/lotes, restauración de papelera, recursos y operaciones Git pertinentes participa mediante lista de rutas explícita. Consultas y detención de lotes no esperan esa reserva. Publicación directa del documento de grabación y copia de resultado IA participan también, aunque se ejecuten fuera del gateway. Commit local de interacción IA obtiene admisión después del proveedor: rechazo conserva resultado revisable y no aplica fuentes ni repite generación. Metadatos privados ajenos a escritura de fuente no requieren abrir una carpeta inaccesible.

No se declara un planificador general ni transacción de registro de proyectos: asociación/retirada/migración siguen bajo autoridad nativa existente. Una futura resolución global del grafo debe poseer además esa autoridad y sus revisiones de registro; esta primitiva no basta para resolverlo ni es CAS ante programas externos. Lecturas pueden observar cambios; no son instantáneas globales. Otros procesos cooperantes siguen bajo concesión del SO anterior. No se liberan reservas por antigüedad/PID.

Rechazo previo del gateway devuelve409 estructurado, code=project_write_not_started, operationOutcome=not-started y checkedAt. ApiError conserva exclusivamente ese resultado explícito; no lo infiere de409 ni analiza texto español. Confirmadores Markdown/nota no convierten ese rechazo en ACK perdido ni en éxito por encontrar contenido que ya coincidía. Solo los resultados inciertos siguen la conciliación de lectura existente, sin reenviar. Aviso de error fuera del contenido desplazable y acotado/consultable por teclado en ambos diálogos; controles finales visibles.

Evidencia: tres casos Rust nuevos con barreras reales (v3-project-admission-contract.log): lectores/otro proyecto disponibles, escritores y publicación de grabación bloqueados, salida de IA retenida, anidación/liberación y ausencia de espera. Tras añadir contrato409 se repite solo el caso afectado, correcto en v3-project-admission-outcome-contract.log. Dos contratos previos de éxito Markdown/nota ejecutados una vez en v3-project-admission-merge-contract.log: tres copias y fuente intacta hasta guardar. Tres frontend nuevos de resultado explícito/no falsa conciliación, TypeScript y diff correctos. Sin suites completas ni APK/proveedor.

Pantallas349/350 inspeccionadas: DocumentConflictDialog, confirmDocumentMerge y Milkdown reales en harness aislado; ApiError not-started sintético, sin puente nativo. Un envío, cero lecturas de conciliación, error fijo y aplicar bloqueado hasta revisar, propuesta elegida visible y edición original exacta al cancelar;320px sin desbordamiento. No acredita campaña instalada ni que los datos pendientes en RAM estén ya persistidos.

Sigue pendiente formalizar recibo durable por intento de combinación para atribuir copias tras ACK incierto, además de resolver/aplicar el grafo remoto completo. La conciliación antigua observa una postcondición; no prueba por sí misma qué petición la produjo ni la existencia de todas sus copias. Continúan otras familias/retención/cuotas, portabilidad, ampliaciones e integración final.


### Recibos de intento de combinación
Nuevo formato1 estricto de metadatos, sin contenido duplicado; intentos no reaplicables y consulta de copias/postcondición sin reparar al leer. Frontend exige prueba del mismo intento y permite reconsulta explícita. [Avance83](../avance-83.md). Precondición de borradores, gestión de recibos y grafo siguen pendientes.


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

### Bloque106 cerrado · Sincronización y cambios externos separados

Seis métodos/679 líneas extraídos con cuerpos idénticos por SHA y contratos conservados; biblioteca Tauri Windows compilada junto a105. Sin repetir contratos intactos. [Evidencia/límites](../avance-106.md). Modularización integral y planificador pendientes.

### Bloque107 cerrado · Respuestas de la sesión actual

Admisión inmediata por proyecto y respuestas de última lectura/visita; cambiar/volver no revive callbacks ni libera otro trabajo. Tres casos dirigidos, TypeScript y capturas454–457 con App real/API controlada. [Evidencia/límites](../avance-107.md). No cierra el paquete completo.

### Bloque108 cerrado · Guardado legible en móvil

Tarjetas móviles con nombre/ruta/fecha y tres estados visibles, filtros plegables y carga sin falso vacío. Dos casos nuevos/seis afectados, TypeScript y capturas458–464 con App real/API controlada a320x780/560. [Evidencia/límites](../avance-108.md). No cierra el paquete completo.

### Bloque109 cerrado · Recuperar lo legible sin adoptar el registro

Extracción de una copia conocida legible aunque falte el recibo o falle otra. ZIP de bytes exactos sin procedencia/autoridad adoptadas; originales intactos. Un contrato Rust, cuatro casos frontend, TypeScript, Tauri Windows y capturas465–469 controladas. [Evidencia/límites](../avance-109.md). El programa y el paquete mantienen trabajo pendiente.

### Bloque110 cerrado · Tres dominios separados del núcleo

Cuarenta métodos/1.568 líneas de investigación, recursos y vistas previas separados con cuerpos idénticos por SHA; visibilidad genérica corregida y compilación Tauri final correcta. No se repiten contratos intactos. [Evidencia/límites](../avance-110.md). El programa y el paquete mantienen trabajo pendiente.

### Bloque112 cerrado · Inserción sobre la revisión viva

Instantáneas PNG inmutables y reutilización exacta, validación de ámbito y originales conservados. Inserciones ligadas a revisión/visita y entrada viva/composición de Milkdown; transacción de fragmento que conserva texto y permite deshacer/rehacer solo la imagen. Un contrato Rust, seis casos frontend nuevos/tres afectados, TypeScript y capturas474–481 con API controlada. [Evidencia/límites](../avance-112.md). No cierra integridad integral ni el programa.

### Bloque113 cerrado · Registro desde contenido revisado

Revisión nativa de bytes/ubicación/HEAD/índice; decisiones explícitas, preparación congelada y transacción Git por rutas que conserva preparación ajena. Borradores protegidos y respuesta incierta consulta sin reenvío. Un contrato nuevo y uno afectado Rust, cinco casos frontend nuevos/quince afectados, TypeScript y capturas482–488 controladas, con ajuste de altura verificado solo en el recorrido afectado. [Evidencia y límites](../avance-113.md). Otros productores, retención/cuotas/portabilidad y programa siguen pendientes.

### Bloque115 cerrado · Inventario común y admisión por presupuesto

Metadatos de15 familias, carpetas mixtas previas al recibo y cobertura explícita, sin lectura de contenido/coordinación ni autoridad de borrado. Presupuesto opcional revisado y serializado para nuevas selecciones/preparaciones, recibos y copias de combinación; guardados/borradores/continuaciones excluidos. Dos contratos Rust, siete casos frontend/SDK, TypeScript y campaña494–498 controlada. [Evidencia/límites](../avance-115.md). Cuotas de identidades, productores restantes, inventarios externos, retención de otras familias y traslado integral continúan.

### Bloque116 cerrado · Respaldo íntegro y retirada de copias de conflictos

ZIP privado con bytes/metadatos originales y paquete documental importable; selección/comprobación exacta antes de retirar representaciones. Diario inmutable, revisión monotónica y cortes consultables sin continuar; recibo/manifiestos/identidad conservados. Admisiones por almacén también en revisión monotónica, con contrato concurrente de dos perfiles. Dos contratos Rust nuevos/tres afectados, seis casos frontend/SDK, TypeScript, Tauri Windows y campaña499–504 controlada. [Evidencia/límites](../avance-116.md). No libera IDs ni cierra retención/portabilidad integral.


### Bloque117 cerrado · Archivo privado portable

Archivo privado opcional knownext.project2: borradores originales/editables, audio detenido asociado en WAV por partes, bundle Git alcanzable en partes verificadas y preferencias visuales permitidas. Importación a proyecto nuevo como datos, sin activar trabajos/historial/ajustes; no convertir en plantilla. Lectura compatible con1, límites128MiB/32MiB y rechazo del conjunto ante fuentes activas/cambiadas, colisiones o metadatos futuros (117). Tres contratos públicos de traslado/rechazos;16 casos frontend/SDK, TypeScript y campaña visual505–509 controlada. [Evidencia y límites](../avance-117.md). No cierra adopción nativa integral ni aceptación física.


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


## Avance127 · Operaciones y transiciones protegidas

Ver [implementación, evidencia y pendientes](../avance-127.md). Se completan el corte de operaciones con prioridades/observación/cancelación en cola y el de protección final de instalación/salida; extracción de13 fachadas con cuerpos conservados. Los checks de este corte no cierran todas las ampliaciones del paquete.

| Criterio | Evidencia del corte | Límite que continúa abierto |
|---|---|---|
| P01-C1 | Publicación Windows con escritura forzada, sincronización de directorio Unix, creación exclusiva e inyección de fallos antes/después de publicar | Fallos compuestos de todas las familias, piloto físico |
| P01-C2 | Timeout desconocido, IDs opacos, resultados tardíos observables, documento editable/guardado conservado | Más productores y combinación entre dispositivos |
| P01-C3 | Colas acotadas, cancelación solo antes de iniciar, consulta sin replay, protección final de actualización y cierre | Continuidad por etapas e instalación/suspensión reales |
| P01-C4 | Sin cambios de formatos persistidos; inventario y procedimiento de migración integral | Piloto instalado y resto de muestras; no se promete downgrade |

Pendiente de desarrollo: utilidades/coordinación aún concentradas, esquemas JSON y cooperación por etapa, productores/grafo/familias, desacoplamiento de importación/reindexado/autenticación y trabajadores persistentes. Pendiente de validación: corpus representativo, cortes/falta de espacio, Windows/Android instalados y aceptación física. No se reabren suites ajenas al código cambiado.


## Avance128 · Importación e inventario de imágenes

[Resultado y evidencia](../avance-128.md) · [Alcance](../bloque-128.md). Importación/reindexado pasan a preparación/cálculo/publicación; cálculo fuera de autoridad global y vías de guardado separadas. Colisiones, asociación cambiada, fuente/caché más reciente y vista fallida conservan datos/confirmaciones.10 contratos dirigidos correctos y Tauri Windows compilado; frontend/UI127 reutilizados sin repetir.

Próximo desarrollo P01: autenticación remota y demás recorridos pendientes, esquemas/etapas cooperativas y coordinación restante. P01 sigue abierto; publicación crítica conserva E/S serializada, no se promete preempción del sistema ni aceptación instalada.


## Bloque 1 · Integridad, recuperación y almacenamiento · entrega 129

Implementación técnica cerrada en el alcance de [bloque-129.md](../bloque-129.md); verificación dirigida completada en [avance-129.md](../avance-129.md). No cierra este paquete completo.

- [x] Inventario común, bytes parciales, respaldo privado y cierre de identidades terminales con dependencias protegidas.
- [x] Continuación por revisión y retirada tras respaldo externo íntegro, sin reenvío automático ni reciclado de IDs.
- [x] Preparaciones mixtas conocidas incompletas: otra selección o cierre conservando copias; modos de archivo declarados.
- [x] Reservas en productores internos/versiones y admisión de nueva captura/transferencia.
- [x] Compatibilidad secundaria con original previo al cambio de esquema y resumen de protección por proyecto.
- [ ] Piloto instalado, selectores nativos, cortes/espacio físicos y aceptación Windows/Android en P10.

Se mantienen las ampliaciones funcionales y los otros bloques del programa; ver backlog. Sin IA de pago ni suites completas durante el desarrollo.


## Bloque 2 · Fiabilidad y continuidad del runtime · entrega 130

Cerrado el desarrollo local del alcance de [bloque-130.md](../bloque-130.md); [evidencia e informe visual](../avance-130.md). Red GitHub y Git lento fuera de la autoridad global, cola por recurso con prioridad y envejecimiento, autenticación protegida frente a respuestas antiguas, diario técnico persistente sin contenido y sin ejecución al reabrir, contratos IPC correlacionados y detención cooperativa antes de publicación.

Los estados se aplican en el espacio real: sesión anterior por revisar, solicitud de detención distinta de confirmación y publicación sin botón de cancelar. Aviso compacto limitado al45% de la altura, controles de44px y documento editable. Un diario futuro/averiado se conserva y avisa sin impedir trabajar. No hay reenvío ni reanudación automática desde el diario.

19 contratos nativos dirigidos y23 frontend correctos; build y composición de pruebas Tauri Windows correctos. Capturas555–558 con API controlada, sin puente Tauri, llamadas de proveedor ni gasto. Se reutilizan resultados no afectados. P10 conserva regresión final, instalación/actualización/suspensión, rendimiento representativo y aceptación física; no se declara completado todo el programa.


## Conciliación documental139 previa al cierre de regresión · 2026-11-06

Dominios y persistencia locales implementados (129–130); cierre de regresión139 y aceptación P10 pendientes. Las notas históricas anteriores conservan su fecha/alcance; sus frases de «pendiente» no reabren desarrollos ya entregados. Evidencia actual: [Integridad129](../avance-129.md), [runtime130](../avance-130.md). El [bloque139](../bloque-139.md) está en verificación final: la regresión Rust y correcciones concretas continúan, sin PASS global anticipado. P10/U16 conservan aceptación física/humana; T17 proveedor real permanece aplazado por decisión de no gasto. Git nativo Android y capacidades dependientes de proveedor/hardware siguen sujetos a disponibilidad real.


## Cierre verificado139 · 2026-11-06

Regresión local139 cerrada:1.158casos frontend y740Rust únicos correctos; build/tipos/bundle y comprobación Rust Android correctos. Dos benchmarks aislados adicionales. Una campaña completa y repeticiones sólo de fallos/casos invalidados. La revinculación con origen ausente está corregida y revisada por un segundo agente. [Resultado y límites](../avance-139.md). Las notas históricas conservan su fecha; no reabren desarrollos ya entregados. P10/U16 mantienen instalación/actualización, dispositivos/SAF, cortes/suspensión, accesibilidad y personas; T17 real sigue aplazado sin gasto. Git nativo Android y capacidades condicionadas conservan sus límites documentados. No publicación/instalación/cambioVERSION.


## Consolidación de alcance140 · 2026-11-06

[Alcance local y exclusiones vigentes](../consolidacion-140-alcance.md). La regresión139 está cerrada; los textos anteriores a ese cierre conservan su contexto. La preparación y validación instalada están ahora autorizadas, sin publicar ni gastar en IA. Este ajuste documental no constituye una instalación o aceptación.
