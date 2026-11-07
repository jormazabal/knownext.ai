# Avance112 · Imágenes que conservan el trabajo anterior

[Reporte visual](avance-112.html) · [Plan](plan.md).

T02/T03/F14/F16: una página manuscrita se publica como instantánea PNG cuyo nombre incluye el SHA256 de sus bytes. La creación no reemplaza destinos; solo se reutiliza una imagen regular idéntica comprobada. Cambiar la página genera otra ruta y conserva las imágenes anteriores, incluidas las legadas. Contenido, documento y pertenencia al proyecto se validan antes de publicar; notas, documentos y borradores no se escriben desde este servicio.

Las inserciones directas capturan proyecto, visita, documento y revisión. Se contrasta también la entrada viva de Milkdown aún no publicada en React, y se rechaza la composición pendiente. Una respuesta posterior a edición, recarga o cambio de contexto no sustituye el texto. El reintento inserta el fragmento mediante una transacción del editor, conservando los nodos y la selección existentes. Deshacer/rehacer separa la imagen del texto anterior y posterior. Admisión inmediata por documento durante la operación.

Verificación dirigida: un contrato Rust público sobre carpeta temporal sin Git (instantánea, reutilización, cambio de página, archivo alterado/solo lectura, ámbito, formato futuro y originales intactos); seis casos frontend nuevos y tres afectados; TypeScript correcto. No se repiten suites ni compilación de handlers Tauri sin cambios.

App y Milkdown reales en Chrome headless, con adaptadores API controlados: respuesta retenida mientras se escribe, rechazo tardío, reintento, cambio A/B, retorno y segunda inserción. Deshacer deja una imagen y conserva el texto; rehacer recupera dos. Capturas474–481 inspeccionadas, incluido320px; sin errores ni red externa. La persistencia del borrador en esta prueba es un adaptador explícito del fixture: no acredita persistencia nativa, aceptación instalada o recuperación tras reinicio. El contrato Rust comprueba por separado los PNG reales.

Evidencia: `output/v3-handwritten-snapshot-contract.log`, `output/v3-image-insertion-pending-input-ui.log`, `output/v3-image-insertion-append-ui.log`, `output/v3-image-insertion-append-types.log`, `output/v3-image-insertion-browser-evidence.json`.

Pendientes: otros productores internos/publicación del historial, retención/cuotas y portabilidad integral, ampliaciones de los paquetes, aceptación instalada/física y regresión final. Android/SAF continúa bloqueado antes de compilar por Java/Gradle; T17 real aplazada sin gasto. Sin commit, instalación o publicación; VERSION2.6.0.
