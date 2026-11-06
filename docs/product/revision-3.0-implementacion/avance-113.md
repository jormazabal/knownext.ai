# Avance113 · Registrar únicamente los archivos revisados

[Reporte visual](avance-113.html) · [Plan](plan.md).

T02/T03/F05/U09: la consulta externa entrega revisión SHA256 de ubicación, proyecto, referencia/HEAD, índice, estado y bytes regulares. Lectura Git NUL con renombres descompuestos en alta/baja e identidades SHA por ruta sin colisión entre espacios y guiones. Cohorte máxima512 entradas, salida2MiB, archivo8MiB, contenido agregado32MiB e índice16MiB; no se autoriza una selección parcial por exceso de inventario. Entradas privadas, enlaces, rutas no compatibles o contenido no revisable quedan bloqueados. No se leen contenidos de coordinación.

Importar exige revisión vigente y una decisión única explícita por cada identidad. Rechaza bytes/índice/historial cambiados, inclusión privada, preparación previa de la ruta o borrador recuperable antes de publicar. La UI captura entrada pendiente, protege borradores y excluye los abiertos del lote. La lista toma identidades/riesgos de la cohorte revisada, aunque el resumen por archivo sea anterior.

Se prepara una carpeta temporal privada con los bytes capturados. Git commit --only registra esas rutas desde la copia congelada y conserva la preparación ajena; las altas usan intent-to-add. Se desactivan hooks, firma y conversión automática CRLF; atributos activos en archivos o índice requieren gestión desde su herramienta. Archivos vivos y trabajo posterior no se reemplazan. La confirmación es local y el envío remoto es una acción separada.

Límites: no hay CAS conjunto de filesystem/ubicación/referencia/índice frente a todos los programas externos. Git conserva sus bloqueos/transacción nativos. Un fallo tras preparar una ruta nueva puede conservar intent-to-add; no se anuncia éxito ni se revierte preparación ajena. Otros productores de historial y persistencia siguen pendientes. Contrato efímero: clientes sin revision deben consultar otra vez; no requiere migración persistente.

Verificación dirigida: un contrato Rust nuevo y uno afectado pasan. Altas/bajas, Unicode/espacios, cambio del mismo tamaño, revisión estable, identidad desconocida/repetida, privacidad, hooks/CRLF, atributos y preparación ajena contrastados. Cinco casos frontend nuevos y trece afectados del área pasan; otros dos contratos SDK afectados pasan. TypeScript correcto. Sin suites completas ni recompilación adicional del handler Tauri sin cambios.

App/Milkdown/panel reales con adaptadores API controlados: primera confirmación obsoleta, segunda explícita con revisión nueva, tercera interrumpida tras publicación simulada y consulta sin reenvío. Tres peticiones corresponden a tres acciones explícitas. Capturas482–487 inspeccionadas. El ajuste de altura se comprueba solo con el recorrido afectado, una petición rechazada y captura488; pie completo dentro del panel a320x560. Sin red externa/errores. El fixture no acredita efectos Git ni aceptación instalada; el contrato Rust comprueba el historial temporal real.

Evidencia: output/v3-external-review-final-contract.log; output/v3-external-review-affected-contract.log; output/v3-external-review-cohort-final-ui.log; output/v3-external-review-ui.log (SDK2 correctos, fallos de panel corregidos en resultado final); output/v3-external-review-final-types.log; output/v3-external-review-browser-evidence.json; output/v3-external-review-compact-layout-evidence.json; output/v3-external-review-compact-affected-ui.log (solo el caso invalidado por el ajuste del panel, correcto).

No cierra el programa: recuperación común/inventarios, retención/cuotas y portabilidad integral, otros productores y ampliaciones pendientes. Android/SAF bloqueado antes de compilar y campaña IA real aplazada sin gasto. Sin commit, instalación o publicación; VERSION2.6.0.
