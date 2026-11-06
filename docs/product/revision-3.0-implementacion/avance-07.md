# Avance 07 · Información y referencias en el panel contextual

31/10/2026 · Rama `codex/v3-programa` · [Resumen visual](avance.html)

## Implementado

- **P03 / U03, U06:** Información y Referencias se incorporan al panel derecho intercambiable. Información sigue el documento, nota, imagen o visor activo y distingue ámbito personal, proyecto, formato y estado de guardado. No muestra fechas de modificación inventadas. La preferencia de contenido se conserva; los contenidos incompatibles tienen una alternativa útil.
- **P03 / U07:** corregida una carrera de restauración: el panel fijado podía quedar oculto al hidratar simultáneamente proyecto y preferencias. El estado deriva ahora de la preferencia, sin una segunda copia que compita con ella. Ocultar explícitamente y desfijar siguen siendo acciones independientes.
- **P04 / F02:** referencias locales entrantes y salientes desde Markdown guardado, con navegación a documentos, notas, imágenes y visores compatibles. Los destinos ausentes o bloqueados se identifican sin ofrecer una apertura falsa. Los cambios pendientes se anuncian y no se mezclan con el análisis del disco.
- **P01 / T04 y P08 / F01:** búsqueda y referencias comparten un lector de corpus con límites de archivos, bytes, tiempo y resultados. Una consulta parcial conserva resultados y explica su alcance. No constituye todavía un índice persistente ni el planificador de trabajos largos.
- **P04 / T05:** el parser de destinos omite código, comentarios y contenido de script/style en el corpus contrastado; maneja etiquetas con atributos entrecomillados y elementos personalizados. No certifica todo Markdown/HTML.
- **P09 / T13:** las capacidades reflejan el runtime. Android declara Git local no disponible mientras no exista una implementación integrada. Escritorio comprueba Git con una consulta acotada y comprueba el repositorio real para anunciar historial. Crear archivos locales no exige cuenta GitHub.
- **P03 / U10:** selector, fijar, cerrar y desplegar detalles de referencias tienen un mínimo de 44 px en el shell móvil; se mantiene la densidad de escritorio.

## Verificación

- **391 pruebas frontend / 84 archivos**, superadas: `v3-frontend-tests-17.log`. Las ocho pruebas focalizadas de Información, Referencias y visibilidad del contexto también pasan. El ajuste posterior de la anotación de tipos del test no cambia su comportamiento.
- **199 pruebas Rust**, superadas: `v3-rust-tests-15.log`. Incluye los contratos de capacidades, corpus, referencias, preferencias y parser; no se suman rondas repetidas.
- TypeScript y **APK Android QA 12** correctos: `v3-types-context-restore-02.log` y `v3-android-qa-build-12.log`. Persisten avisos conocidos de tamaño de chunks, código Rust no usado y deprecaciones Gradle.
- Android API 36 x86_64, paquete separado `ai.knownext.mobile.v3qa`, sin red: panel Información restaurado tras instalar y tras un segundo arranque del proceso, fijado y con el mismo documento y borrador pendientes.
- La consulta nativa devuelve cuatro destinos guardados, incluido uno ausente. Excluye un enlace añadido solo al borrador y el enlace externo. Se contrastó navegación a otro documento y a una imagen, con referencias recibidas y conservación del borrador. El destino ausente no tiene botón de apertura.
- Controles contextuales visibles medidos a 44 px; anchura de contenido y viewport de 412 px, sin desbordamiento horizontal. [Referencias](../../../output/playwright/revision-3.0/23-android-referencias-compactas.png) e [Información](../../../output/playwright/revision-3.0/24-android-informacion-fijada.png) son capturas reales del APK 12, inspeccionadas.
- [Evidencia nativa](../../../output/android-v3-context-evidence.json) y [inventario de entradas posterior a la compilación](../../../output/android-v3-context-inputs-12.json). Fixtures sintéticos preparados mediante API local; interacción con el DOM del WebView nativo. Sin proveedores facturables. No acredita tacto físico, TalkBack, teclado virtual, rotación o suspensión.
- Se detuvo únicamente el paquete QA, se cerró su conexión y el emulador propio. Modo avión volvió a 0 y datos a 1; se solicitó habilitar Wi-Fi, cuyo último valor observado fue 2 —en transición— antes de cerrar el emulador. No se afirma una comprobación posterior del estado estable.

## Pendiente y siguiente corte

Diez paquetes iniciados; **ninguno cerrado por completo**. Continúan recuperación de copias dañadas y variantes, privacidad y credenciales, coordinación del runtime, ajustes completos, fidelidad editorial y revisión IA, captura avanzada, índice persistente, plantillas, investigación, exportación, portabilidad y Git autónomo Android, accesibilidad/DPI y piloto/candidata. La reescritura de enlaces durante movimientos aún necesita un presupuesto de corpus y cobertura de alias de rutas.

El siguiente corte amplía el centro de recuperación para hacer visibles incidencias que hoy se conservan en disco pero no aparecen en la lista de archivos desaparecidos. Se mantendrá la revisión explícita y la protección del original. El [plan completo](plan.md) y sus ampliaciones siguen autorizados.

VERSION continúa en 2.6.0. Sin commit, push, integración, publicación ni aceptación humana de 3.0.
