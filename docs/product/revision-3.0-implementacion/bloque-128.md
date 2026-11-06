# Bloque128 · Importación e inventario de imágenes por fases

Padre: [P01](P01/tarea.md). T01/T02/T03/T04/T05. Autoridad: continuación del desarrollo ya autorizado, sin gasto IA, suites completas, instalación o publicación.

Cierre funcional: preparación breve del proyecto bajo autoridad de mutación; decodificación, validación, recorrido inicial, lectura Markdown y cálculo fuera; publicación que revalida asociación/raíz, reserva el proyecto y conserva creación exclusiva o revisión del índice. La importación ocupa la vía Transfer y el inventario la vía Index; no ocupan Mutation durante todo el cálculo. La publicación final sigue serializada y hace E/S; no se promete ausencia absoluta de espera ni cancelación de llamadas bloqueantes del sistema operativo.

Aceptación: guardar otro documento mientras la importación está preparada; conservar nombres ocupados después del recorrido inicial; rechazar proyecto retirado con not-started antes de escribir; aceptar la misma política de imagen con barra final y sin ella; no convertir una vista fallida en biblioteca vacía. Inventario: contar referencias sin recorrer todos los documentos por cada imagen, conservar caché ante fuentes modificadas, revisión más reciente, UTF-8 inválido o formato futuro; no modificar documentos.

Límites: importación32MiB, destino10.000 entradas y comprobación final cooperativa250ms. Inventario10.000 entradas, Markdown8MiB por fuente/64MiB total,20.000 marcadores por fuente/100.000 referencias totales, cálculo15s, comprobación final1s, índice32MiB. Son presupuestos cooperativos; no interrumpen E/S del sistema. Archivos de coordinación excluidos antes de metadata/contenido. No cambia formato persistido ni se introduce proveedor.
