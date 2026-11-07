# Consolidación 140 · Alcance de la candidata 3.0

Fecha: 2026-11-06. Este documento fija el alcance local ya implementado que se prepara para aceptación instalada. No acredita por sí mismo una instalación, actualización, publicación o aceptación humana.

La instrucción vigente del usuario autoriza completar la consolidación y preparar y validar la candidata instalada, sin repetir suites completas ni gastar en IA. La publicación sigue excluida. La revisión Git, la revisión exacta de fuente, las huellas y los artefactos de la candidata se registran en el [plan principal](plan.md) y en el reporte del coordinador.

## Alcance incluido

| Paquete | Alcance implementado de la candidata | Evidencia local principal |
|---|---|---|
| P01 | Contratos, integridad, migraciones, conflictos y continuidad de trabajo; servicios locales separados y admisión de operaciones. | [Integridad129](avance-129.md), [runtime130](avance-130.md), [cierre139](avance-139.md). |
| P02 | Credenciales, privacidad, consentimiento y autoridad de la IA; corpus y herramientas de evaluación locales. | [Seguridad131](avance-131.md) y [plan P02](P02/plan.md). |
| P03 | Espacio compacto de tres paneles contextuales, navegación y continuidad; accesibilidad y contraste contrastados en componentes reales. | [UX138](avance-138.md) y [cobertura UX](ux-138-cobertura.md). |
| P04 | Edición visual Milkdown, referencias, fidelidad, historial y reversión revisada de cambios. | [Edición133](avance-133.md) y [UX138](avance-138.md). |
| P05 | Organización por lotes, enlaces, recuperación, versiones, retención, cuotas y copias; revinculación revisada con origen ausente. | [Integridad129](avance-129.md), [recursos135](avance-135.md), [copias137](avance-137.md), [cierre139](avance-139.md). |
| P06 | Configuración habitual y avanzada, formularios, inicio y diagnóstico local de tiempos. | [UX138](avance-138.md) y [escala139](avance-139.md). |
| P07 | Grabación compacta preparada/grabando/pausa, sesiones, actas, dictado y notas manuscritas dentro de las capacidades comprobadas. | [Captura134](avance-134.md), [UX138](avance-138.md), [plan P07](P07/plan.md). |
| P08 | Recursos, plantillas, fuentes de investigación y revisión humana; búsqueda acotada con equivalencias Unicode y PDF con texto. | [Recursos135](avance-135.md), [evidencia136](avance-136.md), [escala139](avance-139.md). |
| P09 | Exportación, portabilidad e inventarios con conservación de fuentes y capacidades diferenciadas por plataforma. | [Portabilidad132](avance-132.md), [recursos135](avance-135.md) y [plan P09](P09/plan.md). |
| P10 | Integración y regresión local cerradas; preparación y aceptación de la candidata instalada en curso. | [Cierre139](avance-139.md), [plan P10](P10/plan.md) y [checklist manual](../../development/manual-test-checklist.md). |

Las 50 propuestas del [backlog](backlog.csv) y las 70 capacidades de la [matriz](cobertura-capacidades.csv) conservan sus IDs, criterios, evidencias y límites. El cierre local no extiende capacidades fuera de ese alcance ni convierte sus ampliaciones condicionadas en promesas de esta candidata.

## Límites y exclusiones que se mantienen

- T17: la campaña real de calidad, coste y latencia de proveedores está aplazada por decisión expresa de no gasto. No se envía documentación personal ni se activan llamadas facturables para sustituir esa campaña. Los fixtures no acreditan calidad real de un proveedor.
- Git nativo Android no está disponible. La interfaz conserva las capacidades comprobadas por plataforma; no se promete paridad Git Windows/Android ni se habilitan acciones mediante simulación.
- Reconocimiento continuo, selección arbitraria, diarización y tiempos por palabra dependen de fuentes compatibles, dispositivos, uso y coste. No se inventan muestras, hablantes, tiempos ni resultados de reconocimiento que la fuente no proporciona.
- La extracción PDF usa texto disponible y su orden de flujo. No realiza OCR automático de páginas escaneadas ni reconstruye el orden visual de columnas.
- Las búsquedas conservan sus límites de tiempo, archivos y resultados. Una biblioteca de 5.000 archivos puede quedar parcial con el presupuesto de 2 s; la UI informa del alcance real.
- Las copias programadas se ejecutan con el proceso abierto. No se presenta esta programación como un servicio del sistema que funciona con la aplicación cerrada.
- Las mediciones del dispatcher Rust, del proceso de prueba y del navegador son baselines locales. No certifican arranque, render, GPU o memoria exclusiva de la aplicación instalada ni demuestran una mejora estable de latencia del editor.

## Evidencia reutilizada y aceptación pendiente

El [cierre139](avance-139.md) registra 1.158 casos frontend y 740 Rust únicos correctos, dos benchmarks aislados, build/tipos/bundle correctos y comprobación Rust Android correcta. La consolidación documental no invalida esa evidencia ni justifica volver a ejecutar las suites completas. La preparación de la candidata añadirá los controles de versión, empaquetado y verificaciones dirigidas que sus cambios invaliden.

P10 mantiene aceptación instalada Windows/Android, actualización, migración 2.6 → 3.0, restauración y procedimiento de vuelta documentado; dispositivos/SAF, permisos, audio, suspensión/cortes, espacio físico y funcionamiento offline; rendimiento representativo, lectores de pantalla, IME, DPI, lápiz/tacto y recorridos con personas U16. Estas comprobaciones se cierran sólo con su entorno, artefacto/revisión, resultado y evidencia reales.

La incidencia del entorno nativo se diagnostica antes de reintentar. No se presupone resuelta por esta consolidación. Los estados de firma, instalación, actualización y aceptación se registran separados; una compilación no se convierte en una aceptación instalada.

## Cierre de alcance y tratamiento de incidencias

El desarrollo local obligatorio del alcance incluido está cerrado. La siguiente etapa acepta la candidata e incorpora únicamente correcciones concretas de defectos reproducidos; cada corrección repite sólo las comprobaciones que invalida. Una ampliación funcional se registra con su propia decisión de alcance.

La consolidación de documentación y alcance no publica, no instala por sí sola y no modifica VERSION. El coordinador conserva la revisión e integración Git y el empaquetado. No hay autorización para push, tag, GitHub Release, publicación de instaladores o actualización de canales públicos en esta etapa.
