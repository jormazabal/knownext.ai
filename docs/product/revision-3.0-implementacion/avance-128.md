# Avance128 · Importar y actualizar el inventario sin retener el guardado durante el cálculo

[Reporte visual](avance-128.html) · [Alcance](bloque-128.md) · [P01](P01/plan.md) · [Backlog](backlog.csv).

Cerrado localmente el bloque de importación de archivos/imágenes y reconstrucción del inventario de imágenes por fases. P01 y T04 completos permanecen abiertos por otros recorridos y ampliaciones.

## Implementado

- Despacho de estas operaciones fuera de la vía de guardado: Transfer para importar; Index para reconstruir el inventario. Se reutiliza la cola de trabajo nativa existente. Preparar y publicar toman autoridad de mutación; el cálculo y la reconstrucción de la vista trabajan fuera.
- Importación: decodificación y validación del contenido, primer recorrido de nombres, árbol y huella del recibo fuera del bloqueo global. Antes de crear, se revisan proyecto/raíz, destino canónico y nombres portables; se reserva la publicación del proyecto y se mantiene creación exclusiva. Una colisión tardía puede conservar ambos con otro nombre; nunca trunca el existente. Canonicalización de padre compatible con rutas normales/verbatim de Windows.
- Destino retirado/cambiado antes de publicar: error409 con operación no iniciada. Imagen exige formato de imagen tanto con barra final como sin ella. Los nombres no comprobables y presupuestos excedidos impiden publicar.
- Importación confirmada con fallo posterior de vista: conserva committed=true y añade treeAvailable=false/treeWarning al nivel que consume el frontend, además del recibo existente. La biblioteca no debe sustituirse por una lista vacía y no debe repetirse la importación. Cambiar el proyecto después de publicar también invalida la vista devuelta, no la confirmación del archivo.
- Inventario de imágenes: recorrido acotado y cada Markdown leído una vez; las referencias se agrupan por recurso. Se eliminan los recorridos repetidos de todos los documentos para cada imagen. Cálculo sin proveedores ni modificación de fuentes.
- Publicación del inventario: revalida asociación, caché previa y revisiones de archivos/directorios; fuentes modificadas o un índice más reciente conservan la revisión vigente. UTF-8 inválido, lectura incompleta, futuro, exceso o entrada no comprobable producen fallo explícito, nunca índice vacío declarado correcto.
- Se excluyen coordinación y carpetas técnicas antes de consultar metadata/contenido; rutas fuente vuelven a validarse antes de abrir Markdown. Se mantienen formatos y capacidades del inventario; es metadata local, no descripción visual por IA.

## Comprobaciones

10 casos Rust distintos dirigidos correctos: siete del cálculo/publicación/concurrencia, uno de clasificación de vías nativas, uno de contrato de imagen con/sin barra final y uno del recibo con vista no disponible. Compilación Tauri Windows posterior a los cambios correcta. La primera campaña detectó dos comparaciones de rutas Windows que se corrigieron; esos fallos constan en el log inicial y están sustituidos por las comprobaciones posteriores. No se ejecutó la suite completa.

La prueba concurrente pausa justo antes de publicar, cuando ya se ha preparado el archivo y calculado su destino; mientras tanto obtiene la autoridad de mutación y guarda por PUT un documento existente usando su baseFingerprint. Se verifican los bytes del documento guardado y del archivo importado. Pruebas de colisión tardía y proyecto retirado usan ese mismo punto. El inventario preserva bytes de caché cuando cambian fuentes o revisión y ante corrupción/futuro. No se midió rendimiento con corpus representativo ni latencia física de disco/red.

Evidencia: output/v3-asset-pipeline-final.log; output/v3-asset-pipeline-import-fix.log; output/v3-asset-pipeline-image-contract.log; output/v3-asset-pipeline-receipt.log; output/v3-asset-pipeline-contracts.log (dos fallos iniciales corregidos); output/v3-asset-pipeline-verification.json; output/v3-asset-pipeline-concurrent-save.log.

La UI y sus contratos de control de tareas se conservan. Se reutilizan build, comprobaciones frontend y campaña visual127 no afectados; no se repiten. La captura del reporte procede de127 y se identifica como tal. Este corte no acredita aceptación instalada, suspensión, instalador ni dispositivo Android.

## Pendiente

Autenticación remota y otros recorridos lentos, prioridades por recurso/trabajadores persistentes y medición representativa; esquemas y etapas cooperativas restantes, productores/grafo/familias y continuidad ampliada. Piloto instalado y aceptación física Windows/Android siguen abiertos. La sección crítica conserva comprobaciones y publicación atómica con E/S; sus presupuestos son cooperativos y no garantizan interrupción del sistema operativo.

Sin IA, nuevas suites frontend completas, instalación, publicación o cambio de VERSION2.6.0.
