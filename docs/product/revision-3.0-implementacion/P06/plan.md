# P06 · Plan evolutivo
[Definición](tarea.md) · [Plan principal](../plan.md)
Estado: Desarrollo local del paquete integrado y regresión139 correcta; aceptación instalada/física/humana P10 y T17 real según alcance pendientes. Sin candidata, publicación ni instalación3.0. Responsable: Frontend/configuración y producto; persona por asignar. Esfuerzo relativo L, sin conversión a calendario.

## Entrada
- [P01](../P01/plan.md): entradas pertinentes según las dependencias del plan principal; no exige finalizar todas sus ampliaciones.
- [P02](../P02/plan.md): entradas pertinentes según las dependencias del plan principal; no exige finalizar todas sus ampliaciones.
- [P03](../P03/plan.md): entradas pertinentes según las dependencias del plan principal; no exige finalizar todas sus ampliaciones.
Hito propuesto: H3.

## Cortes de trabajo
1. [x] Inventariar campos y ámbitos dispositivo/proyecto/documento; separar categorías en navegación lateral y formulario central.
2. [x] Mostrar habituales y avanzado por sección sobre el mismo modelo; indicar personalizaciones y origen de valores.
3. [x] Validar antes de guardar, impedir doble envío y conservar datos tras error; restablecer con alcance explícito.
4. [x] Dar acceso directo a configurar IA/audio/exportación desde la tarea; inicio centrado en crear/abrir proyecto.
5. [x] Extender patrones a diálogos secundarios (138) y conservar búsqueda unificada de ajustes ya implementada (avance19, SettingsSearch); no permanece como ampliación por texto obsoleto.

## Superficies a inspeccionar antes de editar
src/features/settings y projects; contratos de preferencias; docs de ayuda.
Las rutas describen el ámbito propietario esperado, no una orden de modificar todos sus archivos. Confirmar contratos y cambios locales al comenzar cada corte.

## Verificación prevista
Tests de persistencia y migración de ajustes, validación/errores/foco, recorridos UX-T01/02/25/26/27 y comparación de tareas frecuentes.
Cada criterio P06-C se asociará a evidencia del corte que lo implemente, con entorno y resultado. Las verificaciones y sus límites se registran en los avances enlazados; no equivalen por sí solas al cierre completo del paquete.

## Riesgos y tratamiento
Ocultar personalizaciones o duplicar estado entre vistas. Mantener un único contrato de configuración.

## Ampliación y condición de entrada
Búsqueda de opciones avanzadas, perfiles compartidos y ayuda adicional solo cuando la prueba de uso lo justifique.
Se concreta el comportamiento, contrato y aceptación del siguiente corte antes de empezar; permanece en el backlog aunque no entre en 3.0.

## Progreso y siguiente paso
- Hecho: implementación local y verificación dirigida de los recorridos descritos en [UX138](../avance-138.md) y [corpus139](../bloque-139.md); consultar sus límites, no la antigua cabecera de primer corte.
- Hecho: regresión local139 cerrada; reutilizar evidencia no invalidada, sin repetir suites completas por cambios documentales.
- Pendiente: preparar y aceptar la candidata instalada Windows/Android, migración/actualización/recuperación, dispositivos/fallos físicos y recorridos con personas en P10/U16. T17 real sigue aplazada sin gasto.
- Próximo paso: el coordinador completa la revisión e integración Git y diagnostica el entorno; después construye y valida la candidata instalada según la autoridad actual. Registrar cada resultado por artefacto, entorno y revisión.
- Publicación excluida por instrucción actual. La autorización de preparar e instalar no acredita instalación realizada ni aceptación humana. Las capacidades condicionadas se conservan sin simulación.

## Avance 02
Ver [implementacion, pruebas y pendientes](../avance-02.md). Este paquete permanece abierto: no se equipara una implementacion parcial a su aceptacion completa. El desarrollo del programa completo esta autorizado.


## Avance 04
Estado y evidencia vigentes: [continuidad, seguridad nativa y primer uso](../avance-04.md). Continúa el alcance completo restante; no se cierra este paquete.


## Corte 08
Revisión de variantes y copias dañadas, recuperación como otro archivo, archivo privado verificado y categorías fijas. [Evidencia transversal](../avance-08.md). No cierra el paquete ni sus ampliaciones.


## Corte 09
Configuración integrada, continuidad, errores por grupo y guardado ordenado. [Evidencia transversal y límites](../avance-09.md). No cierra el paquete ni sus ampliaciones.


## Corte 10
Estado crítico protegido, revisión/restablecimiento conservando originales y aislamiento del inicio. [Evidencia transversal y límites](../avance-10.md). No completa el resto del paquete ni sus ampliaciones.


## Corte 11
Búsqueda de ajustes, resumen integrado, foco y trabajo de vistas ocultas. [Evidencia transversal y límites](../avance-11.md). Continúa todo el alcance restante; no se cierra el paquete.


## Avance 13
[Revisión, borradores y autoridad IA](../avance-13.md). Evidencia parcial por tramo; continúan el resto del paquete y sus ampliaciones.


## Avance 20
[Continuidad de revisión y navegación a carpetas](../avance-20.md): 520 frontend, 300 Rust y APK42 offline. Tres ajustes C19 contrastados; campo vacío/reinicio, fallo de permiso y borrador exacto conservados. Se detecta pérdida ALT de imagen, F16/P0, priorizada en C21. Continúa todo el alcance restante.


## Avance 22
[Retirar un proyecto sin perder su trabajo](../avance-22.md): 554 frontend, 313 Rust y APK50 offline. Retirada/reincorporación, permisos, colisión y reinicio contrastados; bloqueo de modales detectado en 49 y corregido/verificado en 50. Cuatro hashes y red QA restaurados. Continúan F17, todas las áreas y ampliaciones, sin cierre completo de paquetes.


## Avance 23
[Datos locales con un alcance claro](../avance-23.md): 559 frontend, 320 Rust y APK51 offline. Mapa explícito de uso lógico, enlaces omitidos y catálogo futuro conservado; consulta sin cambios en cuatro almacenes. Red/estado QA restaurados. Sigue C24 con validación de rutas/acuses de índices y todas las áreas/ampliaciones, sin cierre completo de paquetes.


## Avance 24
[Índices con identidad, revisión y resultado verificables](../avance-24.md): 568 frontend, 329 Rust y APK53 offline. Defecto de ruta reproducido en TempDir y corregido; revisión, permisos, efectos parciales y cache futuro contrastados sin alterar la fuente. Estado/RAG conservados y QA restituida. Continúan otras rutas de datos secundarios, limpieza ampliada y todo el programa, sin cierre completo de paquetes.


## Corte 25 definido
Ámbito común de proyecto, identidad/propietario de vistas previas y errores contextuales. Definición completa en el [plan principal](../plan.md); pruebas de manipulación exclusivamente en TempDir y sin cierre del paquete.


## Avance 25
[Ámbito de proyectos y recuperación del visor](../avance-25.md): 573 frontend, 338 Rust y APK56 offline. Fuentes conservadas, reintento/reinicio verificados y QA restituida. Continúan adaptación móvil del visor, durabilidad/limpieza y todo el programa; no se cierra el paquete.


## C33–C34
Limpieza revisable de recibos y revinculación de ubicaciones con pausa de automatismos: decisiones, implementación, evidencia focal y límites en el [plan principal](../plan.md). Continúa el resto del paquete; no se acredita cierre integral ni aceptación nativa de estos cambios.


### Bloque95 · Recurso histórico recuperable como archivo nuevo
Fuentes Git revisadas, binarios y versión previa a eliminación; publicación sin reemplazo con ancla/identidad física y recibo1, consulta sin reenvío y catálogo64/128MiB. Namespace privado propio y reservado, sin alterar coordinación. Tres contratos Rust nuevos, seis frontend, TypeScript, identidad Android compilada y capturas395–399 controladas. [Evidencia/límites](../avance-95.md). Aplicación mixta, árbol acotado, retención/portabilidad y aceptación instalada pendientes.


### Bloque96 · Estructura acotada y resultado conservado
Lector separado con48 niveles/20.000 entradas/10.000 nodos/8MiB/2s cooperativos, error explícito sin árbol parcial. Publicación y refresco separados; pestañas conservadas sin lectura, última vista con aviso/reintento/búsqueda, también sin navegación y en móvil. Dos contratos Rust y cuatro frontend nuevos, TypeScript y capturas400–403 con App real/API controlada. [Evidencia y límites](../avance-96.md). Navegación progresiva, retención/portabilidad, variantes mixtas y aceptación instalada pendientes.


### Bloque97 · Contenido de copia con registro incompleto
Revisión y extracción Markdown o nota estructurada sin atribuir procedencia, reparar ni sustituir originales. Revisión ligada a contenido/ubicación/registro opcional, confirmación explícita y archivo nuevo por selector nativo;2MiB de texto, original conservado. Dos contratos Rust nuevos y uno JSON afectado, tres frontend, TypeScript, compilación Tauri Windows y capturas404–407 controladas. [Evidencia/límites](../avance-97.md). Otras familias, retención global, portabilidad y aceptación instalada pendientes.


### Bloque98 · Borrador existente protegido ante revisión omitida
Llamada sin revisión: primera escritura solo sin borrador; borrador existente428 y estado no comprobable503, sin inicio. Todas estas rutas tienen admisión exclusiva no bloqueante; dos solicitudes iniciales no publican ambas. Cuatro casos Rust nuevos y nueve anteriores afectados correctos, sin ejecutar suite completa. Restauración revalida archivo/ruta/borrador después de leer Git, antes de publicar; bases obsoletas conservan originales y bases actuales crean versión nueva. [Evidencia y límites](../avance-98.md). Servicios internos restantes, retención/portabilidad, variantes mixtas y aceptación instalada pendientes.


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


## Conciliación documental139 previa al cierre de regresión · 2026-11-06

Configuración e inicio locales implementados; cierre UX138 y medición139 registrados, regresión final y aceptación P10 pendientes. Las notas históricas anteriores conservan su fecha/alcance; sus frases de «pendiente» no reabren desarrollos ya entregados. Evidencia actual: [UX138](../avance-138.md) y [corpus139](../bloque-139.md). El [bloque139](../bloque-139.md) está en verificación final: la regresión Rust y correcciones concretas continúan, sin PASS global anticipado. P10/U16 conservan aceptación física/humana; T17 proveedor real permanece aplazado por decisión de no gasto. Git nativo Android y capacidades dependientes de proveedor/hardware siguen sujetos a disponibilidad real.


## Cierre verificado139 · 2026-11-06

Regresión local139 cerrada:1.158casos frontend y740Rust únicos correctos; build/tipos/bundle y comprobación Rust Android correctos. Dos benchmarks aislados adicionales. Una campaña completa y repeticiones sólo de fallos/casos invalidados. La revinculación con origen ausente está corregida y revisada por un segundo agente. [Resultado y límites](../avance-139.md). Las notas históricas conservan su fecha; no reabren desarrollos ya entregados. P10/U16 mantienen instalación/actualización, dispositivos/SAF, cortes/suspensión, accesibilidad y personas; T17 real sigue aplazado sin gasto. Git nativo Android y capacidades condicionadas conservan sus límites documentados. No publicación/instalación/cambioVERSION.


## Consolidación de alcance140 · 2026-11-06

[Alcance local y exclusiones vigentes](../consolidacion-140-alcance.md). La regresión139 está cerrada; los textos anteriores a ese cierre conservan su contexto. La preparación y validación instalada están ahora autorizadas, sin publicar ni gastar en IA. Este ajuste documental no constituye una instalación o aceptación.
