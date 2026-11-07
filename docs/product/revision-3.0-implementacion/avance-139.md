# Avance139 · Escala, rendimiento y cierre de desarrollo

Estado: desarrollo local integrado, revisado y regresión cerrada. La aceptación instalada/física/humana sigue separada en P10/U16.

Tres subagentes reales y coordinador: instrumentación/contratos Rust; corpus y búsqueda; carga/mediciones frontend. En el cierre, responsabilidades separadas para corregir fixtures, conciliar50propuestas/70capacidades y documentar los resultados. Los bloques6–10 se cerraron uno a uno en134–138;139 completa el último bloque de desarrollo11.

## Resultado de producto

- Carga inicial:2.040.224→1.747.990bytes JavaScript, ahorro292.234bytes(14,32%). Ajustes, traslados y otras vistas secundarias se cargan bajo demanda; ajustes conserva su instancia al reabrir. No se atribuye esta reducción a latencia de arranque nativo ni a memoria.
- Sistema avanzado: tiempos JSON locales por11clases, contadores de sesión y p95 de las últimas128muestras. SóloRAM, sin identidades/rutas/contenidos/prompts/credenciales. Actualización manual, versión incompatible distinguida de cero y última observación conservada ante error. Excluye cola/IPC/render/arranque y servicios que no pasan por esteAPI.
- Búsqueda: equivalencias Unicode/ligaduras con extracto original, diferencia entre50resultados completos y un51.º que demuestra límite, avisos de corpus parcial y exclusión de coordinación antes de consultar metadata. PDF con texto real; noOCR automático ni reconstrucción visual de columnas.
- Escala de copias: recorrido por turnos entre más de200proyectos, hasta200revisados y una copia admitida por pulso, sin escrituras de políticas desactivadas.
- Revinculación: la regresión detectó un fallo real al faltar el origen, que se corrige con admisión revisada del destino y revalidaciones; no se modifica la prueba para ocultar la ausencia.

## Mediciones y límites

Corpus Rust sintético:500Markdown,20carpetas,32.582.500bytes. En proceso debug Windows x86_64, mediana/p95 calientes: lectura10,307/13,415ms; árbol71,299/115,641ms; búsqueda1.297,668/1.502,412ms. Memoria del proceso de prueba11.251.712→46.989.312bytes; no es memoria exclusiva de una funcionalidad ni de la aplicación instalada.

Corpus de búsqueda100/1.000/5.000archivos: se conserva el presupuesto2s, por lo que5.000puede dar cobertura parcial. Edición con la misma fecha, renombrado y borrado no recuperan contenido obsoleto; los resultados siguen indicando su alcance real. No se certifica rendimiento en hardware representativo.

Navegador aislado: nota grande331.455bytes/1.200secciones, restauraciónmediana2.360→2.422ms y gesto completo de14caracteres900→982ms en la comparación intermedia. No hay ganancia estable de latencia; estas mediciones preceden a la última separación de traslados, cuyos bytes se midieron de nuevo. No se añade otra espera de serialización a Milkdown: conserva los límites existentes para proteger escritura y recuperación.

## Verificación

Rust:740casos únicos correctos;22fallos iniciales corregidos y5nuevos casos de revinculación. La campaña inicial se continuó con72targets de integración aún no ejecutados; después sólo se repitieron los fallos y los casos afectados(16+2). Los2benchmarks omitidos en la campaña ordinaria ya estaban aprobados de forma explícita. Comprobación Rust Android correcta(4m31s). Frontend:269archivos/1.158casos; los7fallos iniciales se corrigieron y contrastaron de forma dirigida. Build de producción, tipos y bundle limpios; no se reconstruye producción por cambios exclusivos de fixtures. Dos benchmarks explícitos y13contratos dirigidos del bloque correctos.

Capturas653–654: componente real con transporte controlado que devuelve una medición del proceso de prueba, sin puente Tauri falso ni acceso al perfil real. Vista1040px y error a320px sin desbordamiento. Son evidencia de desarrollo, no aceptación instalada.

## Límites de entrega

P10 mantiene instalación/actualización Windows y Android, SAF/dispositivos, suspensión/cortes físicos, DPI/IME/lectores/lápiz y aceptación con personas. T17 con proveedor real sigue aplazado por decisión de no gastar. Git nativo Android y capacidades condicionadas mantienen sus límites documentados; no se inventan diarización/OCR continuado/tiempos de palabra de fuentes que no los proporcionan.

Sin llamadas reales IA, gasto, UI Windows nativa, reintentoGradle, instalación, publicación, commit/push ni cambio deVERSION2.6.0. El workflow de regresión se incorpora al repositorio y se revisa localmente; no se afirma que GitHubActions se haya ejecutado.

Evidencia: output/v3-block11-native-performance.json; output/v3-block11-search-corpus-benchmark.json; output/frontend-load-block11-final.json; output/v3-block11-frontend-performance.html; output/v3-block11-runtime-browser-evidence.json; output/v3-final-build.log; output/v3-final-frontend-regression.log; output/v3-final-rust-regression.log; output/v3-final-native-continuation.log.

Prueba consolidada: [verificación JSON](../../../output/v3-final-regression-verification.json). Se conservan logs de los fallos iniciales y de su cierre; no se presentan las primeras campañas fallidas como éxitos. El workflow local usa --no-fail-fast para completar targets aun ante un fallo, sanea5variables de probes y mantiene su código de salida.
