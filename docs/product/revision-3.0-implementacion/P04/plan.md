# P04 · Plan evolutivo
[Definición](tarea.md) · [Plan principal](../plan.md)
Estado: Desarrollo local del paquete integrado y regresión139 correcta; aceptación instalada/física/humana P10 y T17 real según alcance pendientes. Sin candidata, publicación ni instalación3.0. Responsable: Frontend/editor y Rust IA/documentos; persona por asignar. Esfuerzo relativo XL, sin conversión a calendario.

## Entrada
- [P01](../P01/plan.md): entradas pertinentes según las dependencias del plan principal; no exige finalizar todas sus ampliaciones.
- [P02](../P02/plan.md): entradas pertinentes según las dependencias del plan principal; no exige finalizar todas sus ampliaciones.
- [P03](../P03/plan.md): entradas pertinentes según las dependencias del plan principal; no exige finalizar todas sus ampliaciones.
Hito propuesto: H3.

## Cortes de trabajo
1. [x] Preparar ida/vuelta de Markdown y bloques existentes en Milkdown; proteger sintaxis no soportada y comprobar pegar/deshacer.
2. [x] Reagrupar barra y acciones de bloque, índice de títulos y buscar/reemplazar con vista previa y deshacer.
3. [x] Aplicar sistema común a notas personales, imágenes, referencias y Mermaid conservando ámbitos, solo lectura y límites reales.
4. [x] Mostrar documento, selección y fuentes antes de enviar; no incorporar automáticamente la selección múltiple al contexto IA.
5. [x] Identificar operación IA y revisiones afectadas; mantener aplicación validada existente, deshacer seguro y revisión cuando la base sea obsoleta.

## Superficies a inspeccionar antes de editar
src/features/editor, assistant, notes y documentPreview; crates/knownext-docs y knownext-ai.
Las rutas describen el ámbito propietario esperado, no una orden de modificar todos sus archivos. Confirmar contratos y cambios locales al comenzar cada corte.

## Verificación prevista
Tests de serialización/edición semántica, selección y deshacer; contratos de edición IA y versiones; UX-T06 a UX-T12 y UX-T18 a UX-T21.
Cada criterio P04-C se asociará a evidencia del corte que lo implemente, con entorno y resultado. Las verificaciones y sus límites se registran en los avances enlazados; no equivalen por sí solas al cierre completo del paquete.

## Riesgos y tratamiento
Extensiones de editor y formatos heterogéneos. Reutilizar corpus de exportación sin contar dos veces su trabajo.

## Ampliación y condición de entrada
Más dialectos, herramientas por bloque, reemplazo entre documentos y reversión selectiva con conflictos explícitos.
Se concreta el comportamiento, contrato y aceptación del siguiente corte antes de empezar; permanece en el backlog aunque no entre en 3.0.

## Progreso y siguiente paso
- Hecho: implementación local y verificación dirigida de los recorridos descritos en [Edición/reversión133](../avance-133.md) y [UX138](../avance-138.md); consultar sus límites, no la antigua cabecera de primer corte.
- Hecho: regresión local139 cerrada; reutilizar evidencia no invalidada, sin repetir suites completas por cambios documentales.
- Pendiente: preparar y aceptar la candidata instalada Windows/Android, migración/actualización/recuperación, dispositivos/fallos físicos y recorridos con personas en P10/U16. T17 real sigue aplazada sin gasto.
- Próximo paso: el coordinador completa la revisión e integración Git y diagnostica el entorno; después construye y valida la candidata instalada según la autoridad actual. Registrar cada resultado por artefacto, entorno y revisión.
- Publicación excluida por instrucción actual. La autorización de preparar e instalar no acredita instalación realizada ni aceptación humana. Las capacidades condicionadas se conservan sin simulación.

## Avance 02
Ver [implementacion, pruebas y pendientes](../avance-02.md). Este paquete permanece abierto: no se equipara una implementacion parcial a su aceptacion completa. El desarrollo del programa completo esta autorizado.


## Avance 04
Estado y evidencia vigentes: [continuidad, seguridad nativa y primer uso](../avance-04.md). Continúa el alcance completo restante; no se cierra este paquete.


## Avance 06
[Traslados, continuidad y referencias](../avance-06.md). Implementación y comprobación parciales; continúa el alcance restante. No se declara cerrado este paquete.


## Corte 07
Información y referencias contextuales, corpus acotado, capacidades por plataforma y restauración del panel fijado. [Evidencia transversal](../avance-07.md). Este corte no cierra el paquete ni sus ampliaciones.

## Corte 12 en ejecución
La base guardada de la petición IA se contrasta también si espera en cola. La respuesta no puede sustituir texto/trazos RAM posteriores ni mezclar proyectos. Captura por petición, comprobación al recibir, protección de aplicación diferida y revisión de resultados como copia separada. Milkdown contrasta su documento real antes de ejecutar una operación pendiente; conservar la propuesta si falla. Añadir pruebas diferidas de edición, cambio de proyecto, notas personales, documentos no abiertos y operaciones múltiples. Persistencia de resultados sin prompts y recuperación tras reinicio se contrastarán por separado; no se cierra P04 con este corte.


## Avance 12
[Espera principal, continuidad y revisión de resultados IA](../avance-12.md). Verificación parcial frontend/Rust y Android sin red; no cierra el paquete ni sus ampliaciones. Continúan todos sus criterios restantes y la aceptación nativa.


## Avance 13
[Revisión, borradores y autoridad IA](../avance-13.md). Evidencia parcial por tramo; continúan el resto del paquete y sus ampliaciones.


## Avance 14
[Imágenes/trazos y revisión raster](../avance-14.md). Evidencia parcial nativa/Rust/frontend; siguen el resto del paquete y sus ampliaciones.


## Avance 15
[Exportación comprobada y destino Android](../avance-15.md): 479 frontend, suite Rust 259/259 más dominio PDF actualizado 19/19 y APK 29 contrastado sin red. Corpus de 15 páginas, cancelación, nombre elegido, escritura y lector nativo. Continúa todo el programa; no cierra paquetes ni sus ampliaciones.


## Avance 16
[Plantillas reutilizables y controles sobre el teclado](../avance-16.md): 492 frontend, 268 Rust, 3 JVM y APK32 contrastado sin red. Reinicio, creación y retirada conservan documentos; estado y red restaurados. No cierra el paquete ni sus ampliaciones. Continúa todo el programa.


## Corte 18 definido · conservar las propuestas IA desde su recepción
P01/P02/P04: conservar en Rust las salidas de propuestas Markdown que necesitan confirmación antes de entregarlas al renderer, no solo cuando se rechaza su aplicación. Usar el almacén de resultados y su acuse nativo existente. Solo salida generada; nunca sobre de petición, prompts, claves, contexto/base del documento ni posiciones ejecutables. Una propuesta pendiente sobrevive al cierre como una copia para comparar o guardar aparte. Al reiniciar no se ejecutan operaciones antiguas ni se vuelve a consumir proveedor.

La copia conservada permanece hasta que el usuario la quite, también si aplicó la propuesta en esta sesión. La interfaz debe llamarlas resultados conservados, sin presentarlas todas como tareas pendientes, e informar del acuse de conservación en la tarjeta de propuesta. Fallo de disco/cuota mantiene respuesta y revisión RAM y advierte de que no se cierre antes de conservarla; nunca comunica persistencia correcta sin ACK. Reintentar conservación usa la misma salida, sin nueva llamada IA. No se afirma recuperación de la selección ni reaplicación sobre offsets antiguos.

Antes de ampliar retención, aplicar presupuesto real de escritura al almacén completo: 256 entradas y 64 MiB, contando archivos dañados/futuros sin borrarlos. Mantener tope individual 32 MiB y copia idempotente por identidad. Una entrada no verificable o una carpeta/enlace bloquea ampliación con diagnóstico, sin recorrer destinos externos ni limpiar automáticamente. Permitir reintentar un registro idéntico ya guardado aunque se alcance cuota. No es coordinación CAS entre procesos.

Contrastar recepción manual normal y reinicio, política directa sin conservación automática añadida, sobre de modelo con acuse falso retirado, fallo de escritura, cuotas por bytes/entradas, conservación idempotente y copia nueva sin sobrescribir el documento. Ejecutores controlados sin proveedor externo; distinguir esa prueba de la validación visual/web y de cualquier comprobación APK. Continúa todo el alcance restante, incluidos investigación, plantillas amplias, transferencia de proyectos y aceptación física.


## Avance 18
[Conservación desde la recepción y recuperación revisable](../avance-18.md): 509 frontend, suite Rust 278 más dominio resultados actualizado 10/10; 42 ejecuciones Rust Android y APK39 contrastado sin red. Reintentos/retiradas se reflejan en la tarjeta, sin resurrección por acuses tardíos. Continúa todo el programa, sin cierre completo del paquete.


## Avance 20
[Continuidad de revisión y navegación a carpetas](../avance-20.md): 520 frontend, 300 Rust y APK42 offline. Tres ajustes C19 contrastados; campo vacío/reinicio, fallo de permiso y borrador exacto conservados. Se detecta pérdida ALT de imagen, F16/P0, priorizada en C21. Continúa todo el alcance restante.


## Corte 21 definido · F16/P0, fidelidad de imágenes en Milkdown
Incidencia reproducida en APK42: una edición de texto ajena a la imagen sustituye ALT Pixel por 1.00 en el borrador. La fuente instalada Milkdown 7.20 confirma el uso por defecto de ALT como ratio. Mantener Milkdown/React/Tauri y el flujo de documento normal; corregir mediante extensión pública de esquema/parser/serializer, sin editar node_modules ni usar reemplazos globales de cadenas Markdown.

Separar atributos de texto alternativo, título/caption y tamaño. Abrir/cerrar sin editar no reescribe el archivo. Editar un párrafo, pegar, deshacer, guardar y reabrir conserva ALT, título, URL y tamaño de bloques ajenos. La vista DOM debe exponer el ALT real. Actualizar metadatos de una imagen no pierde el resto de sus atributos ni altera otra aparición de la misma URL.

Conservar el ratio fuera de ALT mediante metadatos explícitos versionados y acotados, ligados estructuralmente a su imagen; un lector Markdown convencional sigue viendo la imagen normal. Validar dato, versión y límites; no consumir ni borrar comentarios ajenos/dañados/futuros. Compatibilidad de geometría numérica del esquema anterior requiere decisión documentada que preserve el ALT existente sin inventar texto perdido. No reconstruir automáticamente etiquetas ya sobrescritas sin una fuente conservada. Las rutas locales/imagen siguen mediadas por Rust y la extensión no descarga recursos.

Contrastar corpus con imagen de bloque y en línea, ALT normal/vacío/numérico/caracteres escapados, título, URL con query/fragmento, imágenes repetidas, resize/reset y metadatos futuros/dañados. Probar esquema real y editor real en navegador aislado y APK QA sin red; distinguir bytes sin edición de la normalización legítima del Markdown al editar. Exportaciones/transferencia deben conservar contenido y no mostrar metadatos técnicos como texto. Solo después de resolver la pérdida reproducible continuar otras ampliaciones. Mantener todo el programa y su aceptación física abiertos.


## Avance 21
[Imágenes que conservan su significado](../avance-21.md): corrección F16/P0 contrastada; 535 frontend, 305 Rust y APK48 offline. Documento idéntico al reabrir; pies debajo, sin URLs temporales. Exportaciones nativas y preparación ZIP verificadas. Entorno QA restaurado; continúa C22/F17 y todo el programa, sin cierre completo del paquete.


## Avance 25
[Ámbito de proyectos y recuperación del visor](../avance-25.md): 573 frontend, 338 Rust y APK56 offline. Fuentes conservadas, reintento/reinicio verificados y QA restituida. Continúan adaptación móvil del visor, durabilidad/limpieza y todo el programa; no se cierra el paquete.


## Corte 26 definido
Visor al ancho real, controles progresivos y prioridad del documento en móvil. Definición y criterios en el [plan principal](../plan.md). C25/QA restituida como entrada; no cierra el paquete.



## Avance 26
[Consulta al ancho real](../avance-26.md): visor progresivo, PDF medido, conteo/búsqueda reales y contexto móvil a demanda; APK57 contrastado y QA restituida. Dos ajustes posteriores pasan solo sus dos regresiones focales y se agrupan en el próximo hito nativo. La instrucción del usuario reserva suites completas al final; continúan todos los frentes del programa.


## Buscar/reemplazar avanzado
Filtros literales por mayúsculas/palabra completa, revisión del intervalo, límites y estado por documento implementados. Un reemplazo es un paso de deshacer independiente y conserva formato ajeno. Modelo ProseMirror, panel y Milkdown real contrastados; navegador320/1366 sin desborde, sin proveedor ni suites generales. Ver detalle y límites en plan principal/avance64. Reemplazo entre documentos e integración/aceptación siguen pendientes.


### Bloque92 · Contexto con origen revisable
Pruebas de bytes/texto/ubicación, revisión sin mutación, actualización explícita y consulta de acuse sin reenvío. Legado/futuros preservados y metadatos privados excluidos del proveedor. Seis casos Rust nuevos, tres afectados y ocho frontend; capturas382–385 controladas. [Contratos y límites](../avance-92.md). Resto del programa y aceptación instalada pendientes.

### Bloque112 cerrado · Inserción sobre la revisión viva

Instantáneas PNG inmutables y reutilización exacta, validación de ámbito y originales conservados. Inserciones ligadas a revisión/visita y entrada viva/composición de Milkdown; transacción de fragmento que conserva texto y permite deshacer/rehacer solo la imagen. Un contrato Rust, seis casos frontend nuevos/tres afectados, TypeScript y capturas474–481 con API controlada. [Evidencia/límites](../avance-112.md). No cierra integridad integral ni el programa.


## Bloque5 · Edición documental y reversión · entrega133

Desarrollo local cerrado en el alcance de [bloque-133.md](../bloque-133.md): fidelidad Milkdown/pegado protegido, restauración histórica de archivos como nueva versión, trazabilidad/reversión IA por bloques/páginas y reemplazo revisado entre documentos. Tres subagentes reales con ámbitos exclusivos y coordinación de contratos/autoridad/inventarios. Copias/acuses sin replay, edición posterior conservada y procedencia portable solo como datos. [Reporte visual y verificación](../avance-133.md); [contratos y límites](../../../architecture/document-editing-and-reversion.md).

Backlog50 y cobertura70 conservan sus IDs. No se declara cerrado todo el programa: aceptación instalada/regresión final P10 y otros bloques pendientes. T17 real aplazado sin gasto; Git nativo Android no disponible. Sin suites completas, publicación, instalación ni cambio de VERSION2.6.0.


## Conciliación documental139 previa al cierre de regresión · 2026-11-06

Edición/reversión local implementadas (133) y cierre UX138; regresión139 y aceptación P10 pendientes. Las notas históricas anteriores conservan su fecha/alcance; sus frases de «pendiente» no reabren desarrollos ya entregados. Evidencia actual: [Edición/reversión133](../avance-133.md) y [UX138](../avance-138.md). El [bloque139](../bloque-139.md) está en verificación final: la regresión Rust y correcciones concretas continúan, sin PASS global anticipado. P10/U16 conservan aceptación física/humana; T17 proveedor real permanece aplazado por decisión de no gasto. Git nativo Android y capacidades dependientes de proveedor/hardware siguen sujetos a disponibilidad real.


## Cierre verificado139 · 2026-11-06

Regresión local139 cerrada:1.158casos frontend y740Rust únicos correctos; build/tipos/bundle y comprobación Rust Android correctos. Dos benchmarks aislados adicionales. Una campaña completa y repeticiones sólo de fallos/casos invalidados. La revinculación con origen ausente está corregida y revisada por un segundo agente. [Resultado y límites](../avance-139.md). Las notas históricas conservan su fecha; no reabren desarrollos ya entregados. P10/U16 mantienen instalación/actualización, dispositivos/SAF, cortes/suspensión, accesibilidad y personas; T17 real sigue aplazado sin gasto. Git nativo Android y capacidades condicionadas conservan sus límites documentados. No publicación/instalación/cambioVERSION.


## Consolidación de alcance140 · 2026-11-06

[Alcance local y exclusiones vigentes](../consolidacion-140-alcance.md). La regresión139 está cerrada; los textos anteriores a ese cierre conservan su contexto. La preparación y validación instalada están ahora autorizadas, sin publicar ni gastar en IA. Este ajuste documental no constituye una instalación o aceptación.
