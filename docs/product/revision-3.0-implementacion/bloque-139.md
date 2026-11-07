# Bloque11 · Escala, corpus y cierre de regresión · entrega139

Inicio tras cerrar UX138. Se mantiene plan padre y autoridad de implementación completa, sin gasto IA ni pruebas de UI nativa/Gradle con incidencia pendiente.

## Reparto real

- recording_sources: instrumentación de latencia por clases estáticas en LocalApi, diagnóstico readonly y benchmark nativo aislado; módulo/diagnostics/api_routes/lib y tests propios.
- handwritten_ocr: búsqueda/corpus/PDF, límites honestos y equivalencias Unicode con pruebas sintéticas; local_search, corpus, bounded_pdf_text y tests propios.
- meeting_minutes: medición de frontend de producción con navegador aislado y corpus sintético; optimización sólo de cuellos confirmados en carga/cliente, sin cambiar editor ni negocio.
- Coordinador: SDK/UI de diagnóstico avanzado, barrido justo de copias, integración/mediciones agrupadas, una regresión final y conciliación del programa.

## Criterios

- [x] Métricas de solicitud Rust acotadas, compartidas por clones y separadas por instancia, sin IDs/rutas/contenidos; no se presentan como arranque/render/cola nativa.
- [x] Búsqueda distingue completitud, límites y resultados50/51; equivalencias Unicode/ligaduras conservan extracto original y exclusiones antes de metadata.
- [x] Corpus/latencias/memoria nativos y navegador medidos en perfiles/contextos sintéticos aislados, con límites explícitos y sin IA.
- [x] El planificador recorre por turnos más de200registros sin superar200por pulso ni una copia admitida; no genera escrituras de políticas desactivadas.
- [x] Optimizar sólo cuellos medidos; preservar Milkdown, una columna, carga/progreso/foco y contratos existentes.
- [x] Ejecutar la regresión completa una vez al finalizar los cambios; después repetir sólo fallos o casos invalidados.
- [x] Backlog/reporte conciliados con implementación, evidencia y límites reales.

P10 instalado/físico/usuarios y T17 proveedor real siguen separados. Los benchmarks no certifican hardware representativo ni sustituyen aceptación humana; no hay publicación, instalación o cambio de VERSION.


Cierre:1.158frontend y740Rust únicos correctos, dos benchmarks explícitos adicionales; producción/tipos/bundle y Rust Android correctos. Regresión general una vez, continuada por targets no ejecutados y sólo fallos/afectados después.22fallos Rust iniciales corregidos; se conserva su evidencia anterior. La revinculación ausente era un defecto real, corregido y revisado de forma independiente;5nuevos casos. [Reporte](avance-139.md). P10/U16/T17 y limitaciones condicionadas siguen separados; no se declara aceptación instalada.
