# P04 · Edición, referencias visuales y cambios IA
Padre: [V3-PLAN](../tarea.md). Responsable propuesto: Frontend/editor y Rust IA/documentos. Persona: por asignar. Estado: desarrollo local implementado y regresión139 cerrada; aceptación instalada/física/humana P10/U16 pendiente y T17 real aplazada sin gasto cuando aplica.

## Objetivo
Escribir con fidelidad documental y comprender el destino y el efecto de las herramientas y de la IA.

## Alcance y aceptación por propuesta
### F02 · Navegación por secciones y buscar/reemplazar en el documento
- Primera entrega: Índice de títulos y búsqueda/reemplazo acotado con vista previa y deshacer en documento activo.
- Ampliación planificada: Consultas complejas o reemplazo entre documentos como decisión independiente.
- Aceptación de origen: En un documento largo se navega a una sección y se reemplazan coincidencias elegidas con una única operación de deshacer.
- Recomendación de hito: H3. Primera entrega candidata a 3.0; validar alcance y entrada.

### F08 · Trazabilidad y reversión de cambios realizados por IA
- Primera entrega: Identificar operación IA, documentos y versiones afectadas; reversión directa cuando las bases sigan vigentes.
- Ampliación planificada: Reversión selectiva sobre ediciones posteriores con resolución explícita; nunca prometer deshacer sin conflictos.
- Aceptación de origen: Un cambio IA identifica documentos y versiones afectadas. Se revierte directamente cuando siguen vigentes; ante ediciones posteriores se conserva el trabajo manual y se presenta el conflicto, sin prometer reversión automática del conjunto.
- Recomendación de hito: H3. Primera entrega candidata a 3.0; validar alcance y entrada.

### F16 · Fidelidad documental al abrir, pegar, editar y volver a guardar
- Primera entrega: Corpus de ida y vuelta abrir/editar/guardar/reabrir para formatos presentes, protección de construcciones no soportadas y pruebas de pegar/deshacer de los recorridos frecuentes.
- Ampliación planificada: Ampliación de dialectos Markdown e importación enriquecida de formatos adicionales, solo tras elegir compatibilidad objetivo; no prometer preservación byte a byte tras editar.
- Aceptación de origen: Abrir/cerrar sin editar conserva el archivo; modificar un párrafo conserva el contenido de bloques ajenos en el corpus. Una construcción no soportada no desaparece silenciosamente. Pegar y deshacer recupera el estado anterior y una nueva apertura mantiene tablas, enlaces y metadatos admitidos. Si se detecta pérdida reproducible, su corrección se trata como P0.
- Recomendación de hito: H3. Primera entrega candidata a 3.0; validar alcance y entrada.

### U04 · Barra de edición progresiva y contextual
- Primera entrega: Reagrupar acciones frecuentes y ubicar Asistente de forma estable; mantener atajos y accesibilidad.
- Ampliación planificada: Herramientas específicas por cada tipo de bloque tras evaluar uso.
- Aceptación de origen: Usuarios nuevos encuentran lista, imagen y exportación en una prueba de tareas; usuarios habituales conservan sus atajos y el texto no salta al aparecer controles.
- Recomendación de hito: H3. Primera entrega candidata a 3.0; validar alcance y entrada.

### U10 · Hacer visible qué contexto y alcance tendrá cada petición IA
- Primera entrega: Resumen compacto de destino/contexto y datos enviados; no heredar selección múltiple como contexto IA.
- Ampliación planificada: Inspección avanzada de recuperación y fuentes bajo demanda.
- Aceptación de origen: Antes de enviar, el usuario distingue selección/documento/proyecto y capacidad de consulta/edición/investigación; al cambiar de pestaña no se mantiene un contexto inesperado.
- Recomendación de hito: H3. Primera entrega candidata a 3.0; validar alcance y entrada.


## Criterios compartidos del paquete
- P04-C1: Abrir/editar/guardar/reabrir el corpus preserva semántica y assets o informa una incompatibilidad antes de perderlos.
- P04-C2: Buscar/reemplazar solo afecta al alcance mostrado y puede deshacerse; el editor principal sigue siendo Milkdown visual de una columna.
- P04-C3: Ocultar asistencia o cambiar de documento no cambia el destino de una petición; un anclaje obsoleto requiere resolución.
- P04-C4: Notas personales, archivo de proyecto y referencia solo lectura se distinguen; no se introduce una aprobación universal que cambie el comportamiento IA existente.

## Límites
Se conserva la arquitectura obligatoria del proyecto. La orden posterior del usuario autoriza implementar el programa completo y sus ampliaciones, conforme al plan principal. Las imágenes no acreditan implementación ni aceptación; cada entrega mantiene su verificación y límites explícitos. Las reglas comunes de privacidad, estado y recuperación se referencian desde el [plan principal](../plan.md) y no se redefinen de forma contradictoria aquí.



## Avance 04
Estado y evidencia vigentes: [continuidad, seguridad nativa y primer uso](../avance-04.md). Continúa el alcance completo restante; no se cierra este paquete.


## Alcance vigente consolidado140 · 2026-11-06

El alcance local de este paquete está implementado y verificado; las notas históricas conservan la fecha y no reabren entregas posteriores cerradas. Véase el [alcance consolidado de la candidata](../consolidacion-140-alcance.md). P10/U16 conserva aceptación instalada/física/humana; T17 real permanece aplazada sin gasto y las capacidades condicionadas conservan sus límites.
