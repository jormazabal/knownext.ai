# Recursos, plantillas y conocimiento conectado · entrega135

Servicios Rust/Tauri, React despacha intención y muestra contratos. No nuevo servidor, proceso auxiliar, framework, proveedor ni índice persistente. Tres agentes reales con ámbitos exclusivos y coordinador de contratos/autoridad/recorridos.

## Plantillas documentales con adjuntos

Record/Portable2 compatible1; rutas existentes de preparar/capturar/preview/crear/importar/exportar/catálogo. Hasta8adjuntos de1MiB,8MiB brutos, Markdown1MiB/render2MiB; transferencia serializada16MiB ycatálogo16MiB/256entradas incluyen payloads. PDF/DOCX/XLSX/TXT/CSV explícitos, OfficeZIP acotado sin macros; no archivo implícito de configuración/credencial/ejecutable. El contenido documental puede ser privado: el inventario y consentimiento humano no certifican confidencialidad.

Captura revalida ámbito/ubicación/bytes, copia con SHA y tamaño; recursos locales no admitidos fallan sin omitirlos. Las imágenes anteriores mantienen su contrato512KiB/16/16MP. Save/importación individual/aplicación de catálogo requieren reviewedResources para adjuntos2; el formato1 mantiene comportamiento. Crear muestra nombres/tamaños antes del efecto y materializa `_template-resources/<sha>/<nombre>` en carpeta elegida. Preflight y publicación sin reemplazo, originales intactos; copias previas conservadas si el documento queda parcial. La codificación de segmentos UTF8 conserva consultas/fragmentos exactos (incluidos #page=2) sin admitir alias de prefijo ni porcentajes malformados. No se ejecutan variables, HTML ni adjuntos. Preservar fragmento no certifica navegación exacta en todos los lectores.

SAFTemplateFile aumenta2→16MiB en Kotlin, actualbytes/UTF8estricto conservados; Rust comparte16MiB. Se compila Rust Android, no Gradle con incidencia ni pruebas físicas del selector. Esa parte permanece P10.

## Plantillas de proyecto agrupadas

Entrada en catálogo existente, sin nuevo modo de creación App. project-transfer jobs añade campos opcionales compatibles: templateCatalogue/templateSelection/catalogue/catalogueOutcome. Hasta32plantillas activas por ID/revisión,64MiB/copia y256MiB conjunto. Reutiliza ZIP512MiB, picker/delivery/colas/presupuesto; envelope conocido schema1, sin supplement, exactamente1índice≤128KiB y1–32payloads Templates/NNN/payload.zip con directorios/formatos/tamaños exactos. La excepción de FileKind es solo ese carrier; no ZIP/JSON genéricos ni catálogo anidado.

Importación revisa selección/nombres/colisiones incluso retiradas y admite todo el cupo antes de publicar. Nuevos IDs solo elegidos, copia íntegra por directorio/rename_no_replace; resultados parciales/inciertos conservan identidades y originales. Nunca crea proyectos o activa IA/credenciales/permisos. Worker legado rechaza carrier de catálogo antes de crear un proyecto.

GET `/api/project-templates/catalogue-attempts` y `/:id` consultan recibos; el transporte existente gestiona prepare/pick/catalogue-review/catalogue-commit/deliver/discard. Committing interrumpido se puede cerrar solo con queue y recibo conocido vinculado al mismo trabajo, conservando plantillas/recibo antes de retirar payload. Futuro/desconocido bloquea. Reanudar awaiting_source/preparing es acción explícita sobre el mismo job; delivering incierto solo consulta, sin otra entrega.

Almacén global project-template-catalogues,2048identidades/64MiB; payloads del transporte separados, identidades no se reciclan. Inventario/cupo/presupuesto visibles. Catálogo original50/256MiB sin cambios. El contenido documental compartido requiere revisión humana, no detección de secretos inventada.

## Catálogo de recursos y enlaces

GET `/api/projects/:p/asset-catalog`, `/:assetId/links` y `/:assetId/text`. Una enumeración de archivos/metadatos y Markdown guardado, parser real sin interpretar código como enlaces. Hasta10000entradas/2000recursos/10000enlaces/2s, Markdown2MiB y64MiB leído agregado. Faltantes/bloqueados y parciales explícitos, nombres privados/coordinación excluidos antes de metadata, symlinks/cambios de raíz revalidados. Rutas existentes se normalizan al spelling canónico real; Windows no duplica aliases por mayúsculas, Linux mantiene identidades distintas.

Detalle hasta200enlaces por lado, con documento/línea/columna y carpeta con descendientes por frontera `/`; exceso marca parcial y no inventa0impacto. Texto bajo demanda≤64MiB fuente/2MiB texto, SHA del contenido leído y avisos, PDFpáginas/Officecuerpo/knoteOCRguardado. Estados available/no-text/unsupported/unavailable/limited separados: no se infiere vacío por extensión o errorUTF8. El catálogo de imagen anterior conserva su API.

Menú/paleta abre catálogo; destino disponible/propio usa visor existente y web solo por gesto explícito. Mover por archivo/carpeta revisa links, lote usa un único catálogo para evitarN². Revisión avisa alcance Markdown guardado y corrección manual de enlaces no gestionados; parciales no son totalidad. Cancelación/cambio de proyecto/época/cierre no ejecuta el lote ni aplica el ACK a otra vista. Imágenes gestionadas mantienen tratamiento nativo existente. No hay promesa de gestión universal de vínculos o CAS frente a otro programa.

Filtro IPC acepta PATCH usado por contratos existentes de mover/renombrar y sigue rechazando métodos no permitidos, con prueba Tauri dirigida. Acciones de renombrar/eliminar y continuidad de visores se contrastan en cierreUX10. P10 mantiene lectores/selectores/SAF/Kotlin/instalación, corpus/dispositivos y regresión final; no se simula aceptación física.
