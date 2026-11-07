# Avance 11 · Encontrar ajustes y reducir trabajo oculto

31/10/2026 · Rama `codex/v3-programa` · [Resumen visual](avance.html)

## Implementado

- **P06 / U05:** búsqueda local por temas y apartados en el centro de configuración. Metadatos explícitos de las ocho categorías, acentos y términos en español/inglés. Los resultados indican que abren un apartado; no simulan un índice de todos sus campos ni consultan proveedores. Escape limpia primero la consulta. Flechas y Tab permiten recorrer resultados.
- **P03 / U07, U10:** la selección de un resultado enfoca su formulario. Activar una categoría cierra el lateral temporal y enfoca el panel; las flechas de la navegación conservan allí el foco. Los accesos internos de Resumen y Audio también enfocan su destino.
- **P06 / U05:** resumen integrado sin tarjetas/tablas anidadas ni líneas entre sus valores. El detalle de modelos queda en la vista avanzada, conservando los mismos valores. Los controles nativos de ajustes usan el acento del producto. La concordancia del recuento de resultados distingue uno/varios apartados.
- **P01 / T04 y P06/P07:** las categorías visitadas conservan sus campos; Audio deja de consultar snapshots/dispositivos al quedar inactivo. El hook suspende lecturas ante visibilidad web oculta y refresca al volver. Reutiliza una lectura pendiente durante cambios rápidos y conserva la revisión más reciente. Ocultar la vista no envía pausa/parada al servicio.
- **P01 / T05 y P07:** errores de consulta y de órdenes separados: una lectura correcta posterior no oculta una orden fallida. Las lecturas se recuperan cuando vuelve una respuesta confirmada.
- **P00:** Vite excluye `src-tauri` de HMR tras observar recargas por informes HTML de Gradle, conforme a la [guía oficial Tauri/Vite](https://v2.tauri.app/es/start/frontend/vite/). No se altera el runtime del producto. También se resolvió una colisión de nombres de módulos por mayúsculas/minúsculas en Windows antes de validar.

## Verificado

- **435 pruebas frontend / 96 archivos**, [suite final 29](../../../output/v3-frontend-tests-29.log), y [35 pruebas dirigidas](../../../output/v3-settings-summary-tests-01.log). Respuestas diferidas, visibilidad, cambios rápidos, fallo de orden frente a lectura correcta, revisiones y conservación del campo privado. No se envían órdenes de captura por ocultar la vista en las pruebas del hook.
- **213 pruebas Rust** de [suite 21](../../../output/v3-rust-tests-21.log) reutilizadas: 49 entradas Rust/manifiestos/lock comparadas con esa base, sin cambios. No se anuncia una nueva ejecución Rust. [APK QA 23](../../../output/v3-android-qa-build-23.log) correcto con TypeScript/Vite y runtime nativo; quedan las advertencias de tamaño y avisos heredados.
- Escritorio web-dev a 1440 px: búsqueda, activación con foco, resumen sin bordes de tarjeta, modelos ocultos en básico y visibles en avanzado. Recarga final sin overlay ni errores/avisos relevantes de consola. Reescribir el informe Gradle con los mismos bytes mantuvo marcador y origen de la página; no hubo recarga tras excluirlo.
- **Android QA 22, API 36 sin red:** buscar micrófono/márgenes/credenciales/API key; entrar en su apartado con foco; alternar categorías conserva campo privado no guardado y vista avanzada. Escape limpia sin cerrar ajustes. Activar Interfaz oculta el lateral temporal y enfoca el formulario. Volver conserva el mismo editor y borrador; cerrar retira el campo privado. Grabaciones/sesiones permanecieron sin cambios. Cero errores de página durante el recorrido observado.
- **Android QA 23:** resumen sin bordes anidados, detalle de modelos oculto/visible según la vista, acción del resumen con foco, recuento correcto y búsqueda a 412 px sin desbordamiento. Acento del checkbox medido en `rgb(166,65,37)` y fila de etiqueta de 44 px. Capturas inspeccionadas: [web](../../../output/playwright/revision-3.0/57-web-ajustes-simplificados.png), [búsqueda Android](../../../output/playwright/revision-3.0/58-android-busqueda-ajustes.png), [acento en Audio](../../../output/playwright/revision-3.0/59-android-audio-acento.png).
- [Evidencia Android 22](../../../output/android-v3-settings-evidence-22.json), [23](../../../output/android-v3-settings-evidence-23.json) e [inventario del APK 23](../../../output/android-v3-settings-inputs-23.json): 341 archivos enumerados, sin afirmar trazado exhaustivo de dependencias. El APK 22 precede al ajuste del watcher y al pulido final del resumen; el 23 los incorpora.
- QA detenido, conexión cerrada, copia temporal de configuración retirada tras restaurar su hash y credenciales sin cambios. Red comprobada en avión 0 / Wi-Fi 1 / datos 0 antes de cerrar el emulador propio. No se inició una captura de audio ni una petición facturable ni se guardó la clave sintética.

## Límites y siguiente paso

No se obtuvo recuento IPC nativo: el puente es de solo lectura y no se forzó su modificación. La supresión/concurrencia de consultas está contrastada por pruebas del hook. Evaluar el DOM después de HOME se bloqueó con el WebView en segundo plano; no acredita un evento de visibilidad nativo. System UI volvió a mostrar ANR, también mientras QA estaba activo; se eligió Esperar desde el XML actual y no se atribuye al producto sin evidencia.

Diez paquetes iniciados; ninguno cerrado completamente. Siguen la simplificación de otros apartados, búsqueda por campo con destinos precisos, todos los recorridos de accesibilidad, barras del sistema Android, IME/tacto/lector, Windows nativo y DPI. Este corte no acredita grabación física, pausa/reanudación de captura ni todos los controles.

El [programa completo](plan.md) continúa. Siguiente corte: separar la espera de operaciones IA largas del bloqueo que utilizan guardados y otras mutaciones, conservando permisos y ejecución determinista. Permanecen abiertas integridad del resto del estado, privacidad/credenciales, edición/revisión IA, capturas, búsqueda/índices/plantillas/investigación, exportación/plataformas y candidata.

VERSION 2.6.0; sin commit, push, integración, publicación ni aceptación humana de 3.0.
