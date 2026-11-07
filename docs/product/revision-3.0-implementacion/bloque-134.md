# Bloque6 · Grabaciones, actas y notas manuscritas · entrega134

Autorización: orden explícita del usuario de implementar el bloque con subagentes reales. Padre: plan integral/P07; ampliaciones F11/F12 y claridad U14 incluidas. No gasto IA ni publicación/instalación/cambio de VERSION. Doctor SDD instalado unbound; no instalación/migración. Se reutilizan resultados de bloques previos no afectados.

## Criterios y ámbitos exclusivos

- C1/U14/P07-C1–5 → recording_sources: transcript local con segmentos de tiempos reales y escucha de audio original, sin inferir palabras/hablantes. Tiempo/niveles/acciones fijos, fuente por fila, sesiones desplazables; destino/retención/errores honestos. Ámbito features/recordings, transcription, knownext-recording y adaptador recording.rs; no shared App/routes.
- C2/F11 → meeting_minutes: acta estructurada editable con fuentes, decisiones/acciones propuestas y responsables revisados; publicar copia documental nueva solo tras revisar. Transcripción/audio intactos, fuente ligada a revisión, catálogo/acuse sin replay. Ámbito meeting_minutes.rs/contratos, features/meetings y SDK/types nuevos.
- C3/F12/P07-C6 → handwritten_ocr: reconocimiento explícito por página, remoto informado, propuesta/corrección antes de aplicar; guardas de fuente/documento/visita y texto posterior conservado. Trazos originales intactos y texto revisado consultable por búsqueda existente. Ámbito handwritten/** y handwritten_ocr.rs/SDK/types nuevos.
- C4/integración → coordinador: contratos/rutas/App/layout, autoridad y exclusiones, presupuesto/inventarios/portabilidad de stores nuevos, verificaciones agrupadas y reporte/backlog. React sin proveedores directos; Rust negocio y Tauri delgado.

## Reglas de coordinación y validación

Tres subagentes simultáneos (máximo disponible con el coordinador), ámbitos sin colisión; solo coordinador modifica compartidos/Cargo/build. Una ejecución Cargo a la vez tras congelar fuentes. Tests JS de cada dominio dirigidos y contratos nativos sintéticos agrupados; solo repetir casos invalidados por correcciones. Sin proveedores reales. Cero UI nativa Windows y cero Gradle con incidencia sin resolver. Nunca abrir/stat/eliminar owner.lock/runtime-owner.lock/capture.lock; walkers excluyen nombres antes de metadata. Árbol local previo conservado (780entradas dirty al iniciar).

Diarización/sincronía fina se muestran solo cuando una fuente compatible aporta datos; no se fabrican a partir del texto. El acta manual no se anuncia como resumen generado por IA ni crea tareas externas. Reconocimiento continuo/cualquier selección conserva ampliación definida por capacidad; este corte materializa página explícita primero. P10 conserva dispositivos, suspensión/captura física y aceptación instalada. T17 real aplazado sin gasto.

## Trabajo

- [x] Grabación, fuentes y escucha.
- [x] Acta revisable y publicación protegida.
- [x] OCR revisable y conservación manuscrita.
- [x] Integración de contratos/autoridad/inventarios.
- [x] Pruebas dirigidas, revisión y reporte visual.
- [x] Backlog y planes conciliados.


## Cierre de desarrollo verificado

19 casos nativos únicos y51 frontend únicos correctos. TypeScript/build producción y Rust/Tauri Android cruzado correctos.12capturas586–597, sin overflow/errores/externas, sin proveedor/gasto. Tres agentes reales y revisión independiente, hallazgos corregidos antes de cerrar. [Resultado y límites](avance-134.md). P10 mantiene aceptación instalada/física y regresión general al terminar todo el programa; no se declara esa aceptación ni el cierre de3.0. Fuentes/ámbitos congelados al iniciar el bloque7.
