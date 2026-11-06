# P07 · Plan evolutivo
[Definición](tarea.md) · [Plan principal](../plan.md)
Estado: Desarrollo local del paquete integrado y regresión139 correcta; aceptación instalada/física/humana P10 y T17 real según alcance pendientes. Sin candidata, publicación ni instalación3.0. Responsable: Frontend/audio, Rust nativo y QA hardware; persona por asignar. Esfuerzo relativo XL, sin conversión a calendario.

## Entrada
- [P01](../P01/plan.md): entradas pertinentes según las dependencias del plan principal; no exige finalizar todas sus ampliaciones.
- [P02](../P02/plan.md): entradas pertinentes según las dependencias del plan principal; no exige finalizar todas sus ampliaciones.
- [P03](../P03/plan.md): entradas pertinentes según las dependencias del plan principal; no exige finalizar todas sus ampliaciones.
Hito propuesto: H2 compacto; H4 ampliaciones.

## Cortes de trabajo
1. [x] Extraer un controlador de sesión compartido y vistas separadas: miniventana de bandeja y gestor principal; conservar comandos y un único propietario de captura.
2. [x] Aplicar preparada/grabando/pausa con una fila por fuente; sesión activa y controles fuera del área desplazable de sesiones.
3. [x] Implementar expansión ajustada al monitor, restauración de tamaño, teclado/foco, nombres completos y disponibilidad de dispositivos por estado.
4. [x] Implementar estados/contratos de niveles, finalización, errores, destino cancelado y recuperación sin nueva captura accidental (134/138). La captura, suspensión y falta de espacio físicas siguen en P10.
5. [x] Integrar dictado/libreta en el shell y conservar ámbitos/señales (134/138). Las pruebas con micrófono/sistema/lápiz reales permanecen pendientes en P10.
6. [x] Implementar actas manuales revisadas y OCR remoto explícito por página con propuesta/corrección/CAS (134), conservando audio/trazos. Reconocimiento continuo, diarización y palabras sólo con datos/alcance validados; T17 real sin gasto pendiente.

## Superficies a inspeccionar antes de editar
src/features/recordings, transcription y handwritten; src-tauri/src/recording.rs; crates/knownext-recording y knownext-drawing.
Las rutas describen el ámbito propietario esperado, no una orden de modificar todos sus archivos. Confirmar contratos y cambios locales al comenzar cada corte.

## Verificación prevista
RecordingPanel/useRecordings y contratos Rust, prueba nativa de dos ventanas, suspensión y periféricos; UX-T22/23/24/30/31 y R01–R12.
Cada criterio P07-C se asociará a evidencia del corte que lo implemente, con entorno y resultado. Las verificaciones y sus límites se registran en los avances enlazados; no equivalen por sí solas al cierre completo del paquete.

## Riesgos y tratamiento
Ciclo de vida multiwindow, DPI, hardware y capacidades Android. No inferir aceptación nativa desde navegador ni de los renders.

## Ampliación y condición de entrada
Actas con referencias disponibles, diarización y sincronización audio/texto si proveedor lo permite; OCR por página antes de reconocimiento continuo.
Se concreta el comportamiento, contrato y aceptación del siguiente corte antes de empezar; permanece en el backlog aunque no entre en 3.0.

## Progreso y siguiente paso
- Hecho: implementación local y verificación dirigida de los recorridos descritos en [Captura134](../avance-134.md) y [UX138](../avance-138.md); consultar sus límites, no la antigua cabecera de primer corte.
- Hecho: regresión local139 cerrada; reutilizar evidencia no invalidada, sin repetir suites completas por cambios documentales.
- Pendiente: preparar y aceptar la candidata instalada Windows/Android, migración/actualización/recuperación, dispositivos/fallos físicos y recorridos con personas en P10/U16. T17 real sigue aplazada sin gasto.
- Próximo paso: el coordinador completa la revisión e integración Git y diagnostica el entorno; después construye y valida la candidata instalada según la autoridad actual. Registrar cada resultado por artefacto, entorno y revisión.
- Publicación excluida por instrucción actual. La autorización de preparar e instalar no acredita instalación realizada ni aceptación humana. Las capacidades condicionadas se conservan sin simulación.

## Avance 01
Ver [evidencia y pendientes](../avance-01.md). La orden actual autoriza ejecutar el programa completo. Este paquete no se declara completado.


## Avance 02
Ver [implementacion, pruebas y pendientes](../avance-02.md). Este paquete permanece abierto: no se equipara una implementacion parcial a su aceptacion completa. El desarrollo del programa completo esta autorizado.


## Avance 04
Estado y evidencia vigentes: [continuidad, seguridad nativa y primer uso](../avance-04.md). Continúa el alcance completo restante; no se cierra este paquete.


## Avance 05
Recuperación, continuidad e historial: [evidencia y pendientes](../avance-05.md). No se cierra el alcance restante de este paquete.


## Avance 06
[Traslados, continuidad y referencias](../avance-06.md). Implementación y comprobación parciales; continúa el alcance restante. No se declara cerrado este paquete.


## Corte 11
Búsqueda de ajustes, resumen integrado, foco y trabajo de vistas ocultas. [Evidencia transversal y límites](../avance-11.md). Continúa todo el alcance restante; no se cierra el paquete.


## Avance 12
[Espera principal, continuidad y revisión de resultados IA](../avance-12.md). Verificación parcial frontend/Rust y Android sin red; no cierra el paquete ni sus ampliaciones. Continúan todos sus criterios restantes y la aceptación nativa.


## Avance 13
[Revisión, borradores y autoridad IA](../avance-13.md). Evidencia parcial por tramo; continúan el resto del paquete y sus ampliaciones.


## Avance 14
[Imágenes/trazos y revisión raster](../avance-14.md). Evidencia parcial nativa/Rust/frontend; siguen el resto del paquete y sus ampliaciones.


## Avances43–55 · estado vigente
Notas: elecciones por página con presión/inclinación/texto reconocido conservados y ampliación; fuente futura no se normaliza al guardar, borrador conocido disponible para copia separada. Grabación C50 contrastó originales/preferencias en H61, sin captura física. C53–55 en integración62; actas/OCR y aceptación física pendientes. Detalle y evidencias en el [plan principal](../plan.md); no se declara cerrado el paquete.


### Integración de consumo y presupuesto de transcripción
Ver bloque «presupuestos locales y recibos de grabación» del plan raíz y avance69. Recibos por fragmento con identidad duradera, acuse idempotente y recuperación de texto completo; copia exacta antes del primer metadato nuevo. Presupuesto afecta envíos, nunca captura local ni entrega ya completada. Puertas Android compartidas con aplicación; validación nativa instalada/hardware/consumo real pendiente.

### Bloque112 cerrado · Inserción sobre la revisión viva

Instantáneas PNG inmutables y reutilización exacta, validación de ámbito y originales conservados. Inserciones ligadas a revisión/visita y entrada viva/composición de Milkdown; transacción de fragmento que conserva texto y permite deshacer/rehacer solo la imagen. Un contrato Rust, seis casos frontend nuevos/tres afectados, TypeScript y capturas474–481 con API controlada. [Evidencia/límites](../avance-112.md). No cierra integridad integral ni el programa.


### Bloque124 cerrado · Audio portable retenido en escritorio

Audio del archivo portable revisable y adoptable en escritorio como sesión nativa detenida y retenida: partes WAV/PCM exactas, identidad estable ligada al receptor, copia exclusiva con registro al final, sin cola/costes/envíos ni caducidad automática. Presupuesto global opcional y límite del almacén de512MiB/1000 carpetas para admitir nuevas copias; captura, niveles, dictado o envío activos bloquean. Acuse incierto consultado sin duplicar, y originales/transcripción conservados. Android muestra su alcance pendiente (124). Seis contratos nativos, seis casos frontend/SDK, TypeScript, comprobación Tauri Windows y campaña530–534. [Evidencia/límites](../avance-124.md). Continúan historial, audio Android, otros productores/retención y el programa completo.


### Bloque126 cerrado

Gestor lateral de Grabaciones comparte el control compacto: fuentes en una fila, tiempo/niveles/acciones fijos y sesiones visibles al entrar, cierre/Ajustes útiles y áreas integradas de44px. La ventana principal no se redimensiona por usar composición compacta: geometría exclusiva de recordings. Contexto de bandeja conservado; documento intacto al configurar, sin captura/envíos automáticos (126). [Evidencia y límites](../avance-126.md). Programa completo abierto; aceptación física y ampliaciones restantes.



## Bloque6 · Grabaciones, actas y notas manuscritas · entrega134

Implementación y revisión en [bloque-134.md](../bloque-134.md), [reporte visual y resultados](../avance-134.md). Tres subagentes reales con ámbitos exclusivos: fuentes/transcripción local y escucha acotada; actas manuales revisadas con referencias/publicación exclusiva; OCR remoto explícito por página, corrección humana y aplicación CAS solo del texto. Originales/audio/trazos retenidos, ningún responsable/hablante inventado ni tarea externa. Inventarios/cupos y archivo privado DATAONLY de los nuevos almacenes integrados.

19 casos nativos y51 frontend únicos aprobados; TypeScript/build correctos y12 capturas586–597 conAPI controlada, sin proveedor/gasto/replay. Comprobación Android y límites en el reporte. P10 conserva la aceptación instalada/física y regresión general al finalizar todo el programa; T17 real aplazado sin gasto. La3.0 completa continúa en ejecución, sin publicación/instalación/cambioVERSION.

Cortes funcionales1–3 y6 implementados en las entregas previas/134. Los cortes4–5 tienen comportamiento de software y contratos, con audio/stylus/suspensión/cortes reales todavía en P10; no se marcan aceptados físicamente por un harness.


## Conciliación documental139 previa al cierre de regresión · 2026-11-06

Grabaciones/actas/OCR del alcance local implementados (134/138); hardware/instalación P10 y campaña real T17 pendientes. Las notas históricas anteriores conservan su fecha/alcance; sus frases de «pendiente» no reabren desarrollos ya entregados. Evidencia actual: [Captura134](../avance-134.md) y [UX138](../avance-138.md). El [bloque139](../bloque-139.md) está en verificación final: la regresión Rust y correcciones concretas continúan, sin PASS global anticipado. P10/U16 conservan aceptación física/humana; T17 proveedor real permanece aplazado por decisión de no gasto. Git nativo Android y capacidades dependientes de proveedor/hardware siguen sujetos a disponibilidad real.


## Cierre verificado139 · 2026-11-06

Regresión local139 cerrada:1.158casos frontend y740Rust únicos correctos; build/tipos/bundle y comprobación Rust Android correctos. Dos benchmarks aislados adicionales. Una campaña completa y repeticiones sólo de fallos/casos invalidados. La revinculación con origen ausente está corregida y revisada por un segundo agente. [Resultado y límites](../avance-139.md). Las notas históricas conservan su fecha; no reabren desarrollos ya entregados. P10/U16 mantienen instalación/actualización, dispositivos/SAF, cortes/suspensión, accesibilidad y personas; T17 real sigue aplazado sin gasto. Git nativo Android y capacidades condicionadas conservan sus límites documentados. No publicación/instalación/cambioVERSION.


## Consolidación de alcance140 · 2026-11-06

[Alcance local y exclusiones vigentes](../consolidacion-140-alcance.md). La regresión139 está cerrada; los textos anteriores a ese cierre conservan su contexto. La preparación y validación instalada están ahora autorizadas, sin publicar ni gastar en IA. Este ajuste documental no constituye una instalación o aceptación.
