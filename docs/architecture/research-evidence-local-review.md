# Investigación verificable: revisión local de evidencia · entrega136

La revisión contrasta el grafo estructurado guardado del trabajo. No usa LLM, búsqueda web, refine o update_sources. No regenera el informe mediante reglas textuales. La coincidencia de una cita con un texto capturado prueba esa coincidencia, no la verdad de una conclusión o la actualidad de una URL.

## Contrato y datos

GET `/api/projects/:p/research-evidence/:job`, POST `/prepare` y `/apply`. GET/prepare son snapshots de lectura; apply usa transacción exclusiva de proyecto, private_work y research_gate con CAS de raíz/trabajo/fuente/historial/almacén. La ruta local queda fuera de sendpreflight/cola proveedor y funciona con envíos IA pausados. No reconstruye permisos desde configuración ilegible ni amplía autoridad de otras capacidades.

Selección `{selectedClaimIds,excludedSourceIds,comment}`. Las exclusiones se aplican SOLO a las afirmaciones seleccionadas; seleccionar todas permite alcance global. Otras afirmaciones mantienen su revisión anterior. Comentario≤4096bytesUTF8; IDs de selección duplicados/ajenos, revisión cambiada o overlay futuro se rechazan antes de escribir. Preparar devuelve reviewRevision de esa selección; aplicar requiere revision/reviewRevision/attemptId `research-review-*`/acknowledge. La respuesta y GET incluyen acuses vinculados a fuente/revisión/intento.

Hasta128fuentes,500afirmaciones,1000evidencias y1000refs por afirmación,2MiB de texto contrastado. Exceso se comunica sin truncar o normalizar el trabajo. El overlay evidenceReview v1 vive dentro del job en ai-research, hasta16revisiones, con límite existente32MiB del almacén y admisión de crecimiento. No crea otra familia privada/inventario ni duplica el informe. Los campos originales sources/sourceReads/evidence/findings/markdown permanecen semánticamente exactos; el JSON del contenedor cambia por el overlay y su fecha.

## Calidad y procedencia

La vista conserva referencias desconocidas/huérfanas/ambiguas del proveedor como gaps visibles. Su presencia no cuenta como respaldo. Evidencia utilizable exige ID único, fuente conocida/no ambigua, lectura capturada y coincidencia del fragmento; hay estados sin fragmento/no localizado/captura no disponible. Duplicados no multiplican respaldo en la vista ni alteran el original. La calidad/cobertura futura excluye IDs desconocidos y el workflow conserva hallazgos sin evidencia en vez de descartarlos.

Fuentes muestran URL válida o destino local del proyecto, publicación/consulta conservadas y fragmentos capturados. Caminos privados/coordinación se rechazan por nombre antes de metadata; no se recorren enlaces fuera de raíz. Abrir una fuente es gesto explícito; abrir la ubicación actual puede mostrar otra revisión y no vuelve a certificar la captura histórica. Legados sin afirmaciones estructuradas se avisan, no se inventan a partir del Markdown.

## Escritura y experiencia

Aplicación es un overlay local atómico. Acuses≤16 se conservan, no se reciclan identidades silenciosamente. Una escritura posterior del trabajo conserva la revisión humana existente. Si cambian fuente/ubicación/historial se exige otra revisión; futuros/incoherencias permanecen sin normalización.

La UI selecciona alcance, prepara proyección y pide confirmación; cambiar decisión invalida consentimiento. No confunde un comentario preparado con uno aplicado. Referencias sin resolver siguen consultables y las evidencias huérfanas aparecen bajo demanda. Cierre con cambios exige decisión explícita y retorno de foco. Intento incierto se conserva en memoria acotada por proyecto/trabajo y se recupera con GET; solo recibo exacto confirma. Un acuse antiguo con fuente nueva confirma el hecho anterior y pide nueva revisión, sin aplicar el estado a otro trabajo.

Entrada Revisar fuentes junto al informe terminal, sin exigir proveedor disponible. App→DesktopLayout→AiPromptInput→ResearchPreparationCard usa callback explícito y el diálogo se liga a proyecto/job. Abrir local respeta propietario/disponibilidad; web usa apertura externa controlada, nunca navegación o envío automático. Pies/controles44px y layout320px contrastados.

## Conservación y aceptación

El archivo privado portable existente conserva job+overlay como datos con huellas; la importación no activa trabajos ni autoridad. Eliminación explícita de la categoría de investigación incluye ese trabajo y sus revisiones bajo las mismas guardas. No se crea una copia oculta que el inventario ignore.

13casos nativos dirigidos y22frontend, build/composición Tauri y RustAndroid se registran en avance136. QA614–619 usa componentes reales con API controlada, sin proveedor ni puente Tauri. P10 conserva investigadores/corpus/instalación real; T17 real aplazado sin gasto. No es certificación factual ni aceptación física.
