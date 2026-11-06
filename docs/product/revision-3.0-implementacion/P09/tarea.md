# P09 · Exportación, portabilidad y capacidades por plataforma
Padre: [V3-PLAN](../tarea.md). Responsable propuesto: Rust/documentos y QA Windows/Android. Persona: por asignar. Estado: desarrollo local implementado y regresión139 cerrada; aceptación instalada/física/humana P10/U16 pendiente y T17 real aplazada sin gasto cuando aplica.

## Objetivo
Entregar resultados íntegros y comunicar las capacidades reales de cada plataforma.

## Alcance y aceptación por propuesta
### T12 · Hacer verificables las capacidades nativas de Windows y Android
- Primera entrega: Comprobar capacidades reales por plataforma, funcionamiento local sin procesos auxiliares y estados honestos; acotar brechas nativas.
- Ampliación planificada: Paridad completa de Git y capacidades avanzadas solo tras una prueba técnica y dimensionamiento.
- Aceptación de origen: En instalación limpia y sin workstation se crea, edita, guarda y recupera documentación; solo se ofrecen capacidades disponibles. Historial/exportación cumplen el alcance declarado en cada plataforma.
- Recomendación de hito: H4. Primera entrega candidata a 3.0; validar alcance y entrada.

### F07 · Portabilidad y transferencia completa entre dispositivos
- Primera entrega: Si se selecciona: paquete documental verificable con assets/.knote, exclusiones explícitas y colisiones controladas.
- Ampliación planificada: Incluir historial, grabaciones, borradores y preferencias portables.
- Aceptación de origen: Exportar en Windows e importar offline en Android conserva los documentos y sus imágenes; el informe enumera qué se incluyó, excluyó o no pudo migrarse.
- Recomendación de hito: H6 · ampliación condicionada. Planificar ampliación; seleccionar caso de uso y alcance antes de comprometerla en 3.0.

### F13 · Exportación íntegra y consistente entre plataformas
- Primera entrega: Resolver o comunicar explícitamente la limitación de exportación Android; para declarar PDF completo, conservar contenido y assets del corpus acordado.
- Ampliación planificada: Previsualización avanzada, nuevos perfiles, portada/índice y exportación por lote.
- Aceptación de origen: El mismo documento de referencia exportado en Windows y Android conserva todo el contenido y elementos esenciales, sin recortes silenciosos; el usuario conoce cualquier pérdida admitida.
- Recomendación de hito: H4. Primera entrega candidata a 3.0; validar alcance y entrada.


## Criterios compartidos del paquete
- P09-C1: Windows y Android pueden operar localmente sin servicio ni proceso auxiliar de producto; las capacidades no disponibles tienen estado explícito.
- P09-C2: Exportación no omite silenciosamente contenido del corpus; los archivos resultantes se abren y se localizan.
- P09-C3: Transferencia verifica contenido y no incluye secretos; una colisión se resuelve antes de reemplazar.

## Límites
Se conserva la arquitectura obligatoria del proyecto. La orden posterior del usuario autoriza implementar el programa completo y sus ampliaciones, conforme al plan principal. Las imágenes no acreditan implementación ni aceptación; cada entrega mantiene su verificación y límites explícitos. Las reglas comunes de privacidad, estado y recuperación se referencian desde el [plan principal](../plan.md) y no se redefinen de forma contradictoria aquí.



## Avance 04
Estado y evidencia vigentes: [continuidad, seguridad nativa y primer uso](../avance-04.md). Continúa el alcance completo restante; no se cierra este paquete.


## Entrega132 · Cierre de desarrollo del bloque4

Historial coexistente y punto de consulta sin checkout/índice/HEAD; familias privadas y preferencias2 con revisión, audio portable detenido Android mediante servicio común, ZIP512MiB/expandido1GiB/archivo64MiB; perfiles de estilo, portada/índice y lotes de32documentos con revisión congelada, entrega exclusiva y acuse sin replay. Originales y generaciones conservados. [Evidencia](../avance-132.md) · [Contratos](../../../architecture/project-portability-and-export.md).

Las limitaciones antiguas de124/125 se sustituyen por este contrato: audio portable Android habilitado y Git existente compatible en Windows. Git nativo Android continúa no disponible. La compilación Rust/capturas controladas no cierran Kotlin/SAF, instalación/dispositivos, rendimiento/fallos físicos ni regresión completa P10. T17 real aplazado; sin gasto, publicación o cambio de versión.


## Alcance vigente consolidado140 · 2026-11-06

El alcance local de este paquete está implementado y verificado; las notas históricas conservan la fecha y no reabren entregas posteriores cerradas. Véase el [alcance consolidado de la candidata](../consolidacion-140-alcance.md). P10/U16 conserva aceptación instalada/física/humana; T17 real permanece aplazada sin gasto y las capacidades condicionadas conservan sus límites.
