# Avance 25 · Datos por proyecto y recuperación del visor

Corregidas dos rutas de acceso fuera del ámbito y el cruce de propietario de recursos. El visor recupera una preparación inicial fallida y presenta errores sin perder la consulta. La adaptación móvil del visor sigue abierta y tiene defectos reproducidos que se corrigen a continuación.

## Implementado y contrastado

- [Conversación: regresión antes del cambio](../../../output/v3-private-scope-red-25.log) y [vista previa: regresión con proyecto registrado](../../../output/v3-preview-scope-red-25.log), exclusivamente TempDir con centinelas propios. Identificadores manipulados podían acceder a archivos vecinos. La corrección preserva los bytes y rechaza las peticiones antes del trabajo.
- Identidad portable registrada y raíz absoluta compartidas por gateway Tauri, handler local y resolución de raíz. Rechazos con estado/código/checkedAt; registro ilegible o futuro se conserva. Endpoints globales y retirada idempotente conservados. Metadatos y contenido de assets comprueban también el propietario del ID de documento.
- Recibos de vistas extraídos: máximo 8 MiB; legado/v1 conocido, campos estrictos sin duplicados, ID/proyecto/ruta concordantes y fuentes regulares PDF/DOCX/XLSX. Formatos futuros, extensiones desconocidas, enlaces y rutas fuera de ámbito se conservan y rechazan. La lectura no reescribe el archivo; no se retornan campos privados arbitrarios.
- Errores PDF y apertura externa gestionados. El fallo externo conserva la hoja consultada. Recarga capturada por época/proyecto, sin duplicados y sin aplicar respuestas antiguas A→B→A. Reintentar funciona incluso si la primera preparación no creó un recibo. La apertura externa no se ofrece como acción operativa sin recibo.
- Ajustes: Índice IA · Revisar resultado tiene prioridad sobre un acuse histórico general. Se conservan los errores/reintentos de guardado de preferencias. Texto de guardado es/en explicita su carácter histórico; no se presenta como conciliación transaccional de todos los dominios.

## Verificación automatizada y visual

[573/573 frontend, 124 archivos](../../../output/v3-frontend-tests-56.log), [338/338 Rust](../../../output/v3-rust-tests-46.log), [TypeScript](../../../output/v3-private-scope-types-03.log) y diff-check correctos. Nueve pruebas focales de ámbito/vistas, incluida junction Windows real; siete pruebas del visor y 28 de ajustes incluidas en la suite completa.

Rust44 detectó una expectativa antigua que exigía Err en vez del nuevo 503 estructurado; la aserción se actualizó comprobando código y conservación. Rust45 no pudo enlazar el ejecutable todavía ocupado por 44 en Windows; no cuenta como resultado verde. Rust46 ejecutado después pasa completo. Build54 se interrumpió antes del nativo para incluir esa aserción; 55 antes del empaquetado al detectar que faltaba el reintento inicial. Ninguno se instaló. APK56 es el artefacto final de este corte.

[Contraste de componentes reales con recibos controlados](../../../output/v3-private-scope-browser-evidence-25.json): ajustes 1360/412 px sin overflow, prioridad del resultado por revisar; visor recuperado y hoja visible ante error externo en escritorio. [Captura](../../../output/playwright/revision-3.0/138-visor-recuperacion-y-error.png). El cargador del harness necesitó corregir el import default de createRoot y volver a enlazar su ruta; los avisos HMR de desarrollo permanecen y no se presentan como consola de producto limpia.

## Android sin conexión

[Evidencia APK56](../../../output/android-v3-private-scope-evidence-56.json), API36 x86_64, exclusivamente ai.knownext.mobile.v3qa. SHA256 6bb66135649d0d4b66d30b1427b093d8a6d4de01a0c362b55781479181b888fb. [480 entradas de fuente](../../../output/android-v3-private-scope-inputs-56.json), sin cambios durante [build completo](../../../output/v3-android-qa-build-56.log). [Instalación](../../../output/v3-android-qa-install-56.log) correcta; [JS/CSS servidos coinciden con dist](../../../output/android-v3-private-scope-assets-56.json).

PDF propio de 1.600 bytes, SHA256 412d3b76f5972455a60de2f04c8a7fc3b2a65281aecd05f3641394488b0d6a31, importado a proyecto nuevo sin Git. Carpeta previews nueva con permiso 500: error de preparación, cero recibos y fuente intacta. Restituir 700 y Reintentar genera recibo v1 del mismo proyecto y carga un canvas. El PDF servido coincide byte por byte con el original. [Error visible](../../../output/playwright/revision-3.0/139-android-vista-preparacion-error.png) y [recuperación inspeccionada](../../../output/playwright/revision-3.0/140-android-vista-pdf-recuperada.png). Tras reiniciar el mismo APK, recibo y fuente siguen legibles e idénticos; no se afirma restauración automática de pestañas de referencia. Cero errores de página registrados y cero llamadas a proveedores.

Hallazgos abiertos: en 412 px, barra XLSX de escritorio alcanza 487 px; en PDF los controles finales quedan fuera del área visible. En Android, Ancho produce canvas de 900 px CSS dentro de viewport de 412 px. Un contexto fijado heredado tapa el centro hasta pulsar Ocultar contexto; el primer clic de QA quedó correctamente bloqueado por ese panel y no se forzó. Los rechazos nativos string llegan al visor como mensaje genérico. Estos defectos no se ocultan como aceptación móvil: son la siguiente corrección UX. Frescura, conteo/fidelidad completos y conversión de Office continúan en su ampliación.

## Restitución y continuidad

[Restauración comprobada](../../../output/android-v3-private-scope-restoration-25.json): cuatro hashes originales, red 0/1/0, permisos restablecidos, fuente retirada solo tras listado exacto/SHA, recibo y catálogo exclusivamente propios retirados, directorios nuevos solo estando vacíos, backups/XML/forwards propios retirados. QA detenida, emulador disponible; Windows habitual intacto.

Continúan todas las áreas y ampliaciones del [programa](plan.md), almacenamiento secundario/durabilidad/limpieza, herramientas documentales, IA/captura, accesibilidad, rendimiento y P10. Diez paquetes iniciados; ninguno cerrado completamente. VERSION 2.6.0, cambios locales, sin commit/integración/publicación ni aceptación humana de 3.0. [Avance anterior](avance-24.md).
