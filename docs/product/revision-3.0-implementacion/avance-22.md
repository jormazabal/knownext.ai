# Avance 22 · Retirar un proyecto sin perder su trabajo

Retirar una asociación conserva documentos, historial, borradores y pestañas. Proyectos retirados permite reincorporarla con su identidad original, revisar el nombre y resolver colisiones sin fusionar archivos. La entrega local está contrastada; F17 y el programa completo continúan abiertos.

## Implementado

- Servicio Rust `project_lifecycle`, contratos tipados y acceso desde el selector, incluido el estado sin proyectos registrados. Sin Git, proveedor ni cambio automático del proyecto activo al reincorporar.
- Catálogo local estricto v1, máximo 256 identidades/8 MiB. Ficha conservada antes de quitar la asociación. Metadatos conocidos, sin claves ni extensiones desconocidas. Datos dañados/futuros/no regulares se conservan y bloquean la escritura.
- Reincorporación con ID, revisión y nombre revisado. Comprueba carpeta original, raíz canónica capturada y colisiones. Recupera el mismo ID, inactivo y con sincronización en pausa; no crea carpetas ni copia/fusiona documentos. Repetir un acuse perdido no sobrescribe una identidad ya registrada.
- Preparación de rutas fuera del mutex de mutaciones; confirmación con revalidación de ambas huellas JSON. No impide guardar otro proyecto durante esa preparación. No equivale a coordinación CAS entre procesos ni a identificación física por inodo.
- Antes de retirar, captura snapshots vivos, conserva borradores nativos y exige el acuse real del checkpoint completo. Un guardado supersedido no lo autoriza. Las pestañas y claves de navegación del proyecto permanecen; la liberación tardía de un editor no elimina al lector nuevo.
- Diálogo compacto con una zona desplazable y pie fijo, controles de 44 px, nombre conservado ante error y estado de operación. Recupera el foco aunque el botón de origen haya desaparecido. La reconciliación de acuses y el refresco del selector no repiten la mutación.
- Corregido un bloqueo de modales anidados detectado en Android: propiedad compartida del aislamiento y retorno de foco al desmontar padre y confirmación en el mismo commit. Se conserva el estado `inert` previo; el último propietario libera el fondo.

## Verificación

| Comprobación | Resultado y alcance |
|---|---|
| Frontend final | **554/554, 121 archivos**, [suite 51](../../../output/v3-frontend-tests-51.log). Suite 50 anterior: 552/552; después se añaden dos regresiones de modales. |
| Rust completo | **313/313**, [suite 40](../../../output/v3-rust-tests-40.log). Sin cambios Rust entre APK49 y 50. |
| Ciclo de vida Rust | 8 pruebas de conservación, fallo entre escrituras, reinicio/reintento, acuse perdido, revisión obsoleta, cuotas, catálogo dañado/futuro y colisiones Unicode/ruta. [Registro](../../../output/v3-project-lifecycle-tests-05.log). |
| Modales | El test nuevo [reproduce el fallo antes de corregirlo](../../../output/v3-modal-isolation-red-22.log). Después pasan [37 pruebas focales](../../../output/v3-modal-isolation-tests-22.log) y [cinco ciclos reales en Chromium](../../../output/v3-modal-isolation-browser-22.json), sin aislamiento residual y con foco recuperado. |
| TypeScript y construcción | [TypeScript](../../../output/v3-project-lifecycle-types-06.log), Vite, bundle limpio y reconstrucción completa frontend/Rust/Tauri/Gradle [APK50](../../../output/v3-android-qa-build-50.log). Sin reutilizar un `.so` con frontend diferente. Avisos de tamaño de chunks, variables específicas de plataforma y deprecaciones Gradle permanecen como trabajo técnico; no se ocultan ni se convierten en fallos de pruebas. |
| UX web | Componentes reales con recibos controlados en 1360×900, 412×720 y 360×520: un scroll, pie visible de 44 px, nombre/error conservados, sin overflow ni cambio del documento principal. [Evidencia](../../../output/v3-project-lifecycle-browser-evidence-22.json). |

Browser plugin no disponible: Playwright ordinario. El contraste web controlado no acredita ejecución Rust. La página aislada de desarrollo puede registrar avisos HMR/WebSocket por comprobación de red local; no se modificó seguridad del navegador ni se afirma consola de arranque limpia.

## Android offline

[Evidencia consolidada](../../../output/android-v3-project-lifecycle-evidence-50.json). API36 x86_64, exclusivamente `ai.knownext.mobile.v3qa`, sin proveedor. Windows habitual intacto y sin reintentar su automatización detenida.

- APK50 SHA256 `e6e50173d8d2c723c8f32db366db39efa304ad706d5ca2142db62400b35331d4`. [468 entradas de fuente](../../../output/android-v3-project-lifecycle-inputs-50.json) sin cambios durante la construcción; [instalación correcta](../../../output/v3-android-qa-install-50.log). JavaScript y tres CSS servidos por Tauri coinciden con dist: [huellas](../../../output/android-v3-project-lifecycle-assets-50.json).
- APK49 acredita los contratos Rust, que no cambian en 50: denegación de checkpoint conserva asociación/formulario; restaurar permiso permite retirar con pestaña/borrador y archivo intactos. Colisión conserva nombre y revisión; renombrar reincorpora el mismo ID inactivo y sin sincronización. Denegación del catálogo conserva la asociación y permite reintentar sin duplicar fichas. [Evidencia intermedia](../../../output/android-v3-project-lifecycle-intermediate-49.json).
- La repetición en APK49 descubre un bloqueo del espacio principal tras cerrar modales anidados. No se presenta ese APK como aceptación final. La regresión automatizada falla antes de la corrección y pasa después.
- APK50 completa dos ciclos de retirada/reincorporación: cero diálogos e `inert` residuales, navegación operativa y una sola ficha de la identidad. Reinicio con proyecto reincorporado: misma identidad/pestaña, texto `[QA22 pendiente]` y borrador privado exacto; archivo fuente sin escribir. [Prueba de reinicio](../../../output/android-v3-project-lifecycle-restart-50.json), [captura inspeccionada](../../../output/playwright/revision-3.0/124-android-proyecto-reincorporado.png).
- Cero errores de página durante los recorridos registrados; no se afirma cero mensajes de consola. UIA inicial no produjo archivo durante carga en 49/50: se repitió tras estabilizarse y se comprobó primer plano QA antes de CDP. No se actuó sobre un selector/ANR del sistema ni con clics forzados.
- Una lectura inmediata tras elegir proyecto aún veía el editor anterior; la aserción válida de reinicio espera explícitamente la pestaña y marcador QA22. No se presenta esa lectura transitoria como prueba de pérdida ni como éxito del documento correcto.

La ventana de cambios todavía no publicados y la propiedad de snapshots tienen pruebas específicas; la secuencia de clics nativa no demuestra por sí sola ese intervalo. El fixture nativo no tenía carpetas expandidas: la conservación del mapa existente se contrasta separadamente. CDP no acredita tacto físico, stylus, TalkBack, otros DPI ni aceptación Windows.

## Entorno restituido y continuación

[Restauración verificada](../../../output/android-v3-project-lifecycle-restoration-22.json): cuatro hashes originales coinciden; avión 0/Wi-Fi 1/datos 0; permisos 600; dos backups privados retirados; borrador sintético eliminado tras desmontar su editor; archivo y dos carpetas sintéticas retirados únicamente tras comprobar raíz, listado exacto y hash. Catálogo nuevo eliminado solo después de confirmar que contenía únicamente ambas identidades QA. XML y forwards propios retirados. QA detenida, emulador disponible.

Siguiente: mapa de ubicaciones/uso y clasificación de datos conservados, seguido de limpieza realmente regenerable, revinculación de ubicaciones ausentes, archivo/cuotas y demás F17. No se ofrece limpieza genérica de fuentes, borradores, papelera, grabaciones o preparaciones pendientes. Proyectos retirados antes de existir el catálogo no se descubren automáticamente.

Siguen todas las ampliaciones del [plan completo](plan.md): persistencias secundarias/multiinstancia, edición y formatos, historial/combinación, acciones por lote, plantillas y conocimiento, investigación y costes IA, captura/actas/OCR, ajustes/i18n, accesibilidad y matriz nativa, integración y candidata P10. Diez paquetes iniciados y ninguno cerrado completamente. VERSION 2.6.0; sin commit, integración, publicación ni aceptación humana de 3.0. [Avance anterior](avance-21.md).
