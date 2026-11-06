# P08 · Búsqueda, plantillas y conocimiento conectado
Padre: [V3-PLAN](../tarea.md). Responsable propuesto: Rust/índices y frontend productividad. Persona: por asignar. Estado: desarrollo local implementado y regresión139 cerrada; aceptación instalada/física/humana P10/U16 pendiente y T17 real aplazada sin gasto cuando aplica.

## Objetivo
Encontrar contenido y reutilizarlo con fuentes y límites comprensibles.

## Alcance y aceptación por propuesta
### F01 · Búsqueda global por contenido e índice local actualizado
- Primera entrega: Buscar contenido local Markdown con extractos e índice actualizado al guardar/mover/borrar; incluir .knote cuando tenga texto disponible.
- Ampliación planificada: Corpus PDF/OCR y búsqueda semántica si las consultas reales lo justifican.
- Aceptación de origen: Encontrar un término que solo está dentro de un documento; tras editarlo o borrarlo, los resultados se actualizan y no abren rutas obsoletas.
- Recomendación de hito: H4. Primera entrega candidata a 3.0; validar alcance y entrada.

### F03 · Plantillas documentales y de proyecto reutilizables
- Primera entrega: Guardar y reutilizar una plantilla documental con variables sencillas y vista previa.
- Ampliación planificada: Plantillas de proyectos completos y distribución de catálogos.
- Aceptación de origen: Crear dos actas desde una plantilla conserva su estructura y pide solo los campos variables; exportar/importar plantillas no incluye secretos ni datos de ejemplo involuntarios.
- Recomendación de hito: H6 · ampliación condicionada. Planificar ampliación; seleccionar caso de uso y alcance antes de comprometerla en 3.0.

### F10 · Investigaciones con evidencias verificables y revisión de fuentes
- Primera entrega: Si se selecciona: referencias a fuentes/fragmentos y fecha, con afirmaciones sin respaldo identificadas.
- Ampliación planificada: Recalcular por exclusión de fuentes; trazabilidad no certifica veracidad.
- Aceptación de origen: Una conclusión sin evidencia aparece marcada y el usuario abre la fuente/fragmento asociado. Si se incluye retirar fuentes, se revisan las afirmaciones dependientes; la asociación no se presenta como certificación factual.
- Recomendación de hito: H6 · ampliación condicionada. Planificar ampliación; seleccionar caso de uso y alcance antes de comprometerla en 3.0.

### F14 · Referencias, adjuntos y assets como conocimiento conectado
- Primera entrega: Si se selecciona: indicar límites de extracción y detectar referencias/recursos ausentes. Mantener enlaces gestionados en los movimientos forma parte de F15.
- Ampliación planificada: Backlinks, extracción estructurada por página/hoja y OCR de escaneados.
- Aceptación de origen: El usuario identifica documentos sin texto extraíble y recursos ausentes. Los movimientos preservan referencias gestionadas o informan del impacto; abrir una página/hoja exacta se exige solo si se selecciona esa ampliación.
- Recomendación de hito: H6 · ampliación condicionada. Planificar ampliación; seleccionar caso de uso y alcance antes de comprometerla en 3.0.

### U08 · Acceso rápido a proyectos, documentos y acciones frecuentes
- Primera entrega: Si se selecciona: paleta con acciones existentes, rutas desambiguadas y recientes.
- Ampliación planificada: Favoritos persistentes y personalización de atajos.
- Aceptación de origen: Se localiza por teclado una acción existente o un archivo homónimo mediante su ruta sin recorrer el árbol; si se incluyen favoritos, sobreviven a mover el documento.
- Recomendación de hito: H6 · ampliación condicionada. Planificar ampliación; seleccionar caso de uso y alcance antes de comprometerla en 3.0.


## Criterios compartidos del paquete
- P08-C1: Resultados corresponden al contenido vigente y no incluyen archivos eliminados o fuera del alcance; búsqueda básica funciona offline.
- P08-C2: Acciones rápidas muestran documento/proyecto destino sin inventar capacidades; plantillas no sobrescriben archivos existentes.
- P08-C3: Una fuente parcial o no extraíble lo indica; referencia/cita no se presenta como garantía automática de verdad.

## Límites
Se conserva la arquitectura obligatoria del proyecto. La orden posterior del usuario autoriza implementar el programa completo y sus ampliaciones, conforme al plan principal. Las imágenes no acreditan implementación ni aceptación; cada entrega mantiene su verificación y límites explícitos. Las reglas comunes de privacidad, estado y recuperación se referencian desde el [plan principal](../plan.md) y no se redefinen de forma contradictoria aquí.



## Avance 04
Estado y evidencia vigentes: [continuidad, seguridad nativa y primer uso](../avance-04.md). Continúa el alcance completo restante; no se cierra este paquete.


## Alcance vigente consolidado140 · 2026-11-06

El alcance local de este paquete está implementado y verificado; las notas históricas conservan la fecha y no reabren entregas posteriores cerradas. Véase el [alcance consolidado de la candidata](../consolidacion-140-alcance.md). P10/U16 conserva aceptación instalada/física/humana; T17 real permanece aplazada sin gasto y las capacidades condicionadas conservan sus límites.
