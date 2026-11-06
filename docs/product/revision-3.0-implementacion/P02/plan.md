# P02 · Plan evolutivo
[Definición](tarea.md) · [Plan principal](../plan.md)
Estado: Desarrollo local del paquete integrado y regresión139 correcta; aceptación instalada/física/humana P10 y T17 real según alcance pendientes. Sin candidata, publicación ni instalación3.0. Responsable: Rust/seguridad y responsable de producto IA; persona por asignar. Esfuerzo relativo XL, sin conversión a calendario.

## Entrada
- [P01](../P01/plan.md): entradas pertinentes según las dependencias del plan principal; no exige finalizar todas sus ampliaciones.
Hito propuesto: H1 y H4.

## Cortes de trabajo
1. [x] Inventariar secretos, permisos por ventana/comando, rutas de importación y límites de recursos; verificar hallazgos antes de clasificarlos como defectos.
2. [x] Migrar credenciales al almacén nativo, aplicar permisos y CSP compatibles; validar rutas, archivos expandidos y límites en runtime.
3. [x] Definir privacidad, retención y borrado por capacidad; mantener prompts de sesión sin añadir persistencia por el rediseño.
4. [x] Separar contexto del usuario y autorización de ejecución; validar operaciones estructuradas y alcance fuera del modelo.
5. [x] Unificar estimación/uso y límites, y corpus local de contratos adversos (131–139). La evaluación real/semántica del proveedor no se ejecutó: T17 aplazado por decisión de no gasto.

## Superficies a inspeccionar antes de editar
apps/desktop/src-tauri/capabilities; configuración Tauri; crates/knownext-ai, knownext-ai-skills y knownext-storage; src/lib/api.
Las rutas describen el ámbito propietario esperado, no una orden de modificar todos sus archivos. Confirmar contratos y cambios locales al comenzar cada corte.

## Verificación prevista
Pruebas de autorización y entradas adversas aisladas, migración de secretos, rutas con escapes/symlinks cuando apliquen, corpus IA determinista y evaluación presupuestada.
Cada criterio P02-C se asociará a evidencia del corte que lo implemente, con entorno y resultado. Las verificaciones y sus límites se registran en los avances enlazados; no equivalen por sí solas al cierre completo del paquete.

## Riesgos y tratamiento
Permisos más estrictos pueden romper exportación, recursos o ventanas. Comprobar recorridos reales antes de cerrar el paquete.

## Ampliación y condición de entrada
Corpus y controles por proveedor/proyecto, presupuestos por periodo y aislamiento adicional según exposición verificada.
Se concreta el comportamiento, contrato y aceptación del siguiente corte antes de empezar; permanece en el backlog aunque no entre en 3.0.

## Progreso y siguiente paso
- Hecho: implementación local y verificación dirigida de los recorridos descritos en [Seguridad131](../avance-131.md); consultar sus límites, no la antigua cabecera de primer corte.
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


## Corte 09
Configuración integrada, continuidad, errores por grupo y guardado ordenado. [Evidencia transversal y límites](../avance-09.md). No cierra el paquete ni sus ampliaciones.


## Corte 10
Estado crítico protegido, revisión/restablecimiento conservando originales y aislamiento del inicio. [Evidencia transversal y límites](../avance-10.md). No completa el resto del paquete ni sus ampliaciones.


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


## Avance 19
[Paquetes documentales entre Windows y Android](../avance-19.md): 517 frontend, 297 Rust, 8 JVM y APK41 offline. Primera parte F07 contrastada; nombre al reabrir, referencias a carpetas y mensajes de entrega pasan al siguiente tramo. Continúan todo el paquete y el programa, sin cierre completo.


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


## C35 · evaluación documental preparada
[Corpus y protocolo](../../../development/ai-evaluation/README.md), evaluador offline y controles positivos/negativos del evaluador contrastados. Calidad/coste/latencia de proveedor continúan sin medir; no equivale a evaluación end-to-end ni cierre de T17. Decisiones y evidencia en el [plan principal](../plan.md).


## Consumo por proyecto y mes
Consulta local de alcance confirmado, retirados y cobertura de registros conservados; carreras A→B descartadas. Contadores/importes comprobados, EUR desconocido sin cero engañoso y acumulados de investigación incompatibles conservados. Contratos/panel/navegador dirigidos y TypeScript correctos, sin proveedor ni suites generales. Ver plan principal/avance67. Continúa conservación histórica de consumo antes de presupuestos y puertas previas en todas las capacidades.


## Conservación del consumo por periodos
Ledger2 mantiene totales locales al rotar el detalle5000; legado preservado por digest antes de convertir y origen/copia verificados. Contratos de rotación, reapertura, carreras/futuros/decimales y controles de ACK correctos.305–307 de navegador con módulos API controlados, sin aceptación nativa. Ver plan principal/avance68. Continúan presupuestos y puertas en todas las capacidades, retención/gestión integrada y piloto real.


### Bloque funcional · presupuestos locales y recibos de grabación
Presupuesto mensual UTC por proyecto y general del perfil, aplicado conjuntamente. Modos «Solo avisar» y «Detener nuevos envíos»; aviso desde el80% y al alcanzar el importe. El segundo modo detiene si se alcanza el consumo EUR registrado o hay registros del periodo sin importe EUR, y exige referencia cambiaria vigente antes de un envío nuevo. No se promete reserva de gasto, factura completa, tope exacto ni coordinación entre equipos: una interacción/llamada ya iniciada puede superar el importe. Los periodos anteriores no se trasladan automáticamente al mes siguiente.

Política privada estricta1,256 reglas/256KiB, importes en céntimos0,01–1000000EUR, revisión SHA y actualización atómica bajo puerta compartida. Cambio obsoleto/futuro/ilegible se conserva; mismo resultado ya aplicado se observa sin reescribir. GET no migra ni escribe. Lectura de política y ledger precede a envíos en interacción, prompts, dictado, etapas de investigación y generación de sus imágenes; grabación verifica cada fragmento nuevo. No se limita capturar/pausar/guardar PCM ni entregar fragmentos ya completados. Las comprobaciones son deterministas en Rust y no se delegan al LLM.

Grabación nativa integra recibos mínimos por intento/fragmento: identidad, inicio, proyecto al enviar, modelo, muestras, cambio capturado y confirmación. Sin texto ni claves. El intento se persiste antes de HTTP; respuesta/texto y recibo se conservan antes de contabilizar. Completados recuperan acuse local sin pedir credenciales ni reenviar audio; envío incierto se registra sin importe confirmado y solo se reenvía con confirmación explícita previa existente y nueva identidad. Rechazo explícito/preconexión no se convierte en cargo confirmado. No se inventa consumo retrospectivo para fragmentos antiguos sin recibo.

Ledger2 añade índice opcional de recibos por digest en la misma escritura que detalle/agregados, con100000 identidades y límite global64MiB. Campo vacío omitido conserva checksum de ledger2 anterior. Mismo recibo exacto tras reapertura no vuelve a sumar; identidad con contenido distinto se rechaza. Reconciliación local de sesiones pendientes de atención al arrancar/procesar no ejecuta proveedores. Recarga la sesión completa desde su fuente; el snapshot de UI omite transcripciones y nunca se reescribe como si fuese el manifiesto completo. Android comparte las puertas de dominio entre trabajo de fondo y aplicación.

Antes de añadir el primer recibo a una sesión se conserva copia exacta deduplicada por digest en sessions-recovery;500copias/128MiB, regulares y verificadas antes de sustituir. Fallo de copia impide ese envío, no la captura. Los originales y formatos futuros no se limpian. Copias de sesión y preferencias figuran como recuperación; política como preferencias. La aplicación2.6 no conoce los nuevos campos: no se presenta un downgrade automático; piloto/restauración integral siguen pendientes.

Consumo ofrece presupuesto plegado, consulta bajo demanda, alcance visible y cierre fijo; no otro panel permanente. Campos sobreviven al fallo de guardado y una confirmación desconocida exige GET sin replay. Respuestas tardías de otro alcance se ignoran. Referencia BCE puede reintentarse explícitamente tras inicio sin conexión, en hilo nativo y con espera mínima60s; automática diaria se conserva. Fallo mantiene referencia/campos y no presupone conversión. Aviso previo de UI es presentación; Rust vuelve a comprobar por su autoridad y emite avisos de trabajo nativo.

Contratos dirigidos correctos: recibos idempotentes/reapertura/conflicto, incertidumbre no gratuita, límites conjuntos/mes/revisión/futuro, recuperación sin credenciales/proveedor, texto íntegro y copia previa exacta. UI: ACK desconocido, campos, alcance tardío, aviso antes del envío, bloqueo sin POST y fallo de cambio. TypeScript y cargo check nativo correctos. Investigación añade registro de sus imágenes antes de publicar recursos y detiene nuevas imágenes si falla contabilidad; conserva advertencia junto al resultado. No se han consumido proveedores en las verificaciones.

Pantallas308–310 de aplicación real con módulos API controlados, no puente nativo: consulta/edición, ACK pendiente y resultado observado;320px sin desborde y cierre/controles44px. Evidencia v3-budget-recording-final-contracts.log, v3-recording-receipt-preservation-final.log, v3-budget-focused-ui.log, v3-budget-exchange-ui.log, v3-budget-final-types.log, v3-budget-complete-native-check.log y v3-ai-budget-browser-evidence.json. Sin suites generales, APK, proveedor ni aceptación instalada. Sigue integración/piloto, presupuestos reales por proveedor y gestión común de copias/retención en F04/T09/F17; el programa completo continúa abierto.


### Ledger sobre muestra real2.6
Conversión en copia aislada, copia original verificada y reapertura/idempotencia; recuperación crítica conserva ledger nuevo. Sin proveedor/credenciales/facturación ni cambios al perfil real. [Avance79](../avance-79.md).


### Bloque91 · PDF por contenido y página
Implementados extracción PDF local acotada, búsqueda/frescura, apertura de página en visor y contexto expresamente añadido. Índice retiene máximo32MiB de texto y declara cobertura parcial; fuentes ilegibles no figuran listas. Ocho casos Rust dirigidos, dos frontend, TypeScript, compilación de knownext-docs Android y capturas378–381 controladas. Véase [avance91](../avance-91.md) para contratos, límites y evidencia; aceptación instalada y resto del programa pendientes.


### Bloque92 · Contexto con origen revisable
Pruebas de bytes/texto/ubicación, revisión sin mutación, actualización explícita y consulta de acuse sin reenvío. Legado/futuros preservados y metadatos privados excluidos del proveedor. Seis casos Rust nuevos, tres afectados y ocho frontend; capturas382–385 controladas. [Contratos y límites](../avance-92.md). Resto del programa y aceptación instalada pendientes.


### Decisión T17 · 2026-11-02
El usuario elige «Sin gasto: dejar pendiente la campaña real». No se ejecutan generaciones facturables ni se envía documentación personal. La evaluación local y el resto del desarrollo continúan; campaña con proveedor expresamente pendiente, sin equivaler a aceptación IA real.


### Bloque95 · Recurso histórico recuperable como archivo nuevo
Fuentes Git revisadas, binarios y versión previa a eliminación; publicación sin reemplazo con ancla/identidad física y recibo1, consulta sin reenvío y catálogo64/128MiB. Namespace privado propio y reservado, sin alterar coordinación. Tres contratos Rust nuevos, seis frontend, TypeScript, identidad Android compilada y capturas395–399 controladas. [Evidencia/límites](../avance-95.md). Aplicación mixta, árbol acotado, retención/portabilidad y aceptación instalada pendientes.

### Bloque111 cerrado · Teclado y vuelta al punto de trabajo

Límite modal compartido en guardado/sincronización, fondo aislado, Tab/Shift+Tab/Escape y devolución a origen visible o área principal tras resize. Tres casos nuevos/doce afectados, TypeScript y capturas470–473 de App real/API controlada. [Evidencia/límites](../avance-111.md). El programa y el paquete mantienen trabajo pendiente.


### Bloque118 cerrado · Cobertura externa y presupuesto

Inventario ampliado a20 familias del perfil y tres tipos de almacén de proyectos registrados (papelera, copias históricas y preparación), también externos: metadatos acotados, raíces solapadas deduplicadas, registro no comprobable implica cobertura parcial. Presupuesto opcional extendido antes del payload a nuevas plantillas de proyecto y anclas históricas; audio/traslados medidos, creación aún exenta y declarada (118). Tres contratos Rust nuevos/uno afectado, un caso frontend y campaña visual510–512. [Evidencia/límites](../avance-118.md). No cierra cuotas/retención ni portabilidad integral.


### Bloque121 cerrado · Traslados sucesivos íntegros

Traslados sucesivos conservan el archivo privado anterior, verifican borradores/PCM/bundle/metadatos y añaden payloads actuales en generación distinta. Cabeceras originales bajo Anteriores con huellas; paquete3 e índice privado2, lectura compatible1/2/3. Paquete documental completo excluye toda la carpeta privada, evitando filtrar textos mientras omite audio/JSON. Referencias adaptadas al final sin reescribir copias conservadas; duplicados/futuros/corrupción rechazados sin paquete parcial (121). Cuatro contratos dirigidos del formato/traslado y ampliaciones aisladas; frontend/TypeScript, Tauri Windows agrupado y campaña520–522. [Evidencia/límites](../avance-121.md). Continúan adopción activa, cuotas/retención y aceptación.


### Bloque124 cerrado · Audio portable retenido en escritorio

Audio del archivo portable revisable y adoptable en escritorio como sesión nativa detenida y retenida: partes WAV/PCM exactas, identidad estable ligada al receptor, copia exclusiva con registro al final, sin cola/costes/envíos ni caducidad automática. Presupuesto global opcional y límite del almacén de512MiB/1000 carpetas para admitir nuevas copias; captura, niveles, dictado o envío activos bloquean. Acuse incierto consultado sin duplicar, y originales/transcripción conservados. Android muestra su alcance pendiente (124). Seis contratos nativos, seis casos frontend/SDK, TypeScript, comprobación Tauri Windows y campaña530–534. [Evidencia/límites](../avance-124.md). Continúan historial, audio Android, otros productores/retención y el programa completo.


### Bloque125 cerrado

Historial portable consultable en escritorio cuando no hay historial ni preparación previa: revisión de bundle/partes y elección de punto por título/autor/fecha, objetos y referencias conservados bajo nombres internos, sin checkout, remotos, configuración del origen ni cambios en documentos/borradores/ajustes. Publicación sin reemplazo y preparación durable inventariada, incluidos proyectos retirados/conservados; protección/recarga del espacio, acuse incierto consultado sin repetir y rutas Windows corregidas (125). [Evidencia y límites](../avance-125.md). Programa completo abierto; aceptación física y ampliaciones restantes.


## Bloque 3 · Seguridad, privacidad y control de IA · entrega131

Desarrollo local cerrado dentro de [bloque-131.md](../bloque-131.md), con [evidencia y reporte visual](../avance-131.md). Revisión/rotación/recuperación de credenciales con originales cifrados, copias gestionables por huella y sin revocación externa implícita. Pausa de nuevos envíos por proyecto, selección/antigüedad y revisión de cinco categorías IA, eliminación con exclusión de trabajo activo y recibos sin contenido ni replay. Navegación local por WebView, enlaces web explícitos, límites comunes y autoridad de solo lectura estructurada.

34 contratos nativos únicos y42 casos frontend correctos; build y composición Tauri Windows de pruebas correctos. Seis capturas nuevas559–564, App real con API controlada y sin puente Tauri/proveedores. Se repiten solo resultados invalidados por correcciones, sin suites completas. El programa y la aceptación instalada P10 permanecen abiertos; T17 real sigue aplazado por no gasto. No se cambia VERSION2.6.0 ni se instala/publica.


## Conciliación documental139 previa al cierre de regresión · 2026-11-06

Seguridad/privacidad local implementadas (131); regresión139, aceptación P10 y campaña real T17 separadas. Las notas históricas anteriores conservan su fecha/alcance; sus frases de «pendiente» no reabren desarrollos ya entregados. Evidencia actual: [Seguridad131](../avance-131.md). El [bloque139](../bloque-139.md) está en verificación final: la regresión Rust y correcciones concretas continúan, sin PASS global anticipado. P10/U16 conservan aceptación física/humana; T17 proveedor real permanece aplazado por decisión de no gasto. Git nativo Android y capacidades dependientes de proveedor/hardware siguen sujetos a disponibilidad real.


## Cierre verificado139 · 2026-11-06

Regresión local139 cerrada:1.158casos frontend y740Rust únicos correctos; build/tipos/bundle y comprobación Rust Android correctos. Dos benchmarks aislados adicionales. Una campaña completa y repeticiones sólo de fallos/casos invalidados. La revinculación con origen ausente está corregida y revisada por un segundo agente. [Resultado y límites](../avance-139.md). Las notas históricas conservan su fecha; no reabren desarrollos ya entregados. P10/U16 mantienen instalación/actualización, dispositivos/SAF, cortes/suspensión, accesibilidad y personas; T17 real sigue aplazado sin gasto. Git nativo Android y capacidades condicionadas conservan sus límites documentados. No publicación/instalación/cambioVERSION.


## Consolidación de alcance140 · 2026-11-06

[Alcance local y exclusiones vigentes](../consolidacion-140-alcance.md). La regresión139 está cerrada; los textos anteriores a ese cierre conservan su contexto. La preparación y validación instalada están ahora autorizadas, sin publicar ni gastar en IA. Este ajuste documental no constituye una instalación o aceptación.
