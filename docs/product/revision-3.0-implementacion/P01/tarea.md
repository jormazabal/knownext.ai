# P01 · Contratos, integridad y continuidad de trabajo
Padre: [V3-PLAN](../tarea.md). Responsable propuesto: Rust/runtime con frontend. Persona: por asignar. Estado: desarrollo local implementado y regresión139 cerrada; aceptación instalada/física/humana P10/U16 pendiente y T17 real aplazada sin gasto cuando aplica.

## Objetivo
Proteger documentos y tareas ante fallos, respuestas tardías, suspensión y migración, con responsabilidades claras.

## Alcance y aceptación por propuesta
### T01 · Dividir los núcleos de aplicación por responsabilidades
- Primera entrega: Extraer los dominios y controladores que se modifiquen en guardado, lotes y ajustes, conservando contratos y pruebas.
- Ampliación planificada: Modularización integral de todos los servicios; esfuerzo total potencial XL.
- Aceptación de origen: Los dominios intervenidos tienen pruebas y contratos explícitos; los componentes visuales reciben estado e intenciones. Las extracciones no alteran contratos públicos sin migración ni obligan a reescribir dominios ajenos.
- Recomendación de hito: H1. Primera entrega candidata a 3.0; validar alcance y entrada.

### T02 · Persistencia resistente a interrupciones y errores
- Primera entrega: Guardado recuperable y errores explícitos en documentos y estado crítico.
- Ampliación planificada: Extender la primitiva a toda persistencia secundaria tras inventariarla.
- Aceptación de origen: Inyectar falta de espacio, denegación de acceso y corte entre pasos: siempre queda el original o una copia recuperable; nunca se comunica guardado correcto si falla la persistencia.
- Recomendación de hito: H1. Primera entrega candidata a 3.0; validar alcance y entrada.

### T03 · Evitar sobrescrituras por edición simultánea y respuestas tardías
- Primera entrega: Control de versión en guardado y aplicación de resultados; conservar borradores ante divergencias.
- Ampliación planificada: Coordinación más amplia entre varias instancias y combinación automática.
- Aceptación de origen: Guardar A, editar B antes de recibir la respuesta: B permanece pendiente. Cambiar el archivo desde fuera entre carga y guardado: se ofrece resolución y no se pisa silenciosamente.
- Recomendación de hito: H1. Primera entrega candidata a 3.0; validar alcance y entrada.

### T04 · Desacoplar operaciones largas del bloqueo global
- Primera entrega: Medir esperas y retirar del bloqueo global los trabajos que afecten a edición/guardado; preservar orden por recurso.
- Ampliación planificada: Planificador general con prioridades para todas las capacidades.
- Aceptación de origen: Una consulta IA lenta o una exportación no impide guardar otro documento ni leer el estado. Pruebas concurrentes verifican que dos escrituras del mismo recurso siguen serializadas.
- Recomendación de hito: H1. Primera entrega candidata a 3.0; validar alcance y entrada.

### T05 · Contratos tipados y errores/cancelación coherentes
- Primera entrega: Tipar errores, IDs y estados terminales de los flujos intervenidos; cancelación solo donde sea efectiva.
- Ampliación planificada: Homogeneizar el resto de contratos sin cambios de producto innecesarios.
- Aceptación de origen: Un payload inválido produce un error de dominio predecible; un timeout no deja la UI en pendiente indefinidamente; TS y Rust rechazan la misma colección de contratos inválidos.
- Recomendación de hito: H1. Primera entrega candidata a 3.0; validar alcance y entrada.

### T13 · Diagnóstico útil, acotado y sin contenido privado
- Primera entrega: Diagnóstico de errores y operaciones con IDs, límites de tamaño/retención y exportación redactada.
- Ampliación planificada: Telemetría opcional únicamente si hay una decisión de producto y privacidad.
- Aceptación de origen: Un fallo de guardado o IA se rastrea con su ID; un usuario puede exportar diagnóstico sin prompts, documentos, tokens ni rutas innecesarias. Los logs tienen límite de tamaño/retención.
- Recomendación de hito: H1. Primera entrega candidata a 3.0; validar alcance y entrada.

### T14 · Migraciones y documentación coherentes para pasar a 3.0
- Primera entrega: Migración desde 2.6 recuperable, inventario de formatos y documentación de contratos tocados.
- Ampliación planificada: Limpieza documental y migraciones de formatos no afectados en entregas posteriores.
- Aceptación de origen: Una copia sintética de 2.6 migra y reabre sin perder proyectos, borradores, historial ni ajustes; los documentos vigentes coinciden con capacidades verificadas y señalan límites por plataforma.
- Recomendación de hito: H1. Primera entrega candidata a 3.0; validar alcance y entrada.

### T15 · Continuidad de sesión ante suspensión, cierre y actualización
- Primera entrega: Recorridos de interrupción de escritura/notas y actualización; reconciliación de trabajos existentes y señal de recuperación. Definir y medir la ventana máxima de cambios aún no protegidos.
- Ampliación planificada: Reanudación avanzada de trabajos por etapas, cuando proveedor y plataforma lo permitan; continuidad entre dispositivos se trata en F07.
- Aceptación de origen: Interrumpir una copia de prueba antes/durante/después de la persistencia y comprobar el último borrador confirmado; medir y documentar cambios en memoria no recuperados. Cerrar/abrir y suspender/reanudar no duplican trabajos facturables. Actualizar con cambios durante la descarga y con audio activo tiene un resultado definido y verificable. Nunca comunicar guardado o finalización sin confirmación.
- Recomendación de hito: H1. Primera entrega candidata a 3.0; validar alcance y entrada.


## Criterios compartidos del paquete
- P01-C1: Falta de espacio, permisos denegados y corte entre pasos conservan original o recuperación identificada; nunca se muestra guardado correcto ante fallo.
- P01-C2: Respuesta tardía o edición externa no sobrescribe silenciosamente una revisión más reciente; quedan ambas versiones recuperables.
- P01-C3: Cerrar una vista no cancela su trabajo; la reconciliación no reejecuta una operación con resultado desconocido.
- P01-C4: Los formatos migrados conservan ubicación y preferencias; se documenta qué copia y compatibilidad requiere volver a la versión anterior.

## Límites
Se conserva la arquitectura obligatoria del proyecto. La orden posterior del usuario autoriza implementar el programa completo y sus ampliaciones, conforme al plan principal. Las imágenes no acreditan implementación ni aceptación; cada entrega mantiene su verificación y límites explícitos. Las reglas comunes de privacidad, estado y recuperación se referencian desde el [plan principal](../plan.md) y no se redefinen de forma contradictoria aquí.



## Avance 04
Estado y evidencia vigentes: [continuidad, seguridad nativa y primer uso](../avance-04.md). Continúa el alcance completo restante; no se cierra este paquete.


## Alcance vigente consolidado140 · 2026-11-06

El alcance local de este paquete está implementado y verificado; las notas históricas conservan la fecha y no reabren entregas posteriores cerradas. Véase el [alcance consolidado de la candidata](../consolidacion-140-alcance.md). P10/U16 conserva aceptación instalada/física/humana; T17 real permanece aplazada sin gasto y las capacidades condicionadas conservan sus límites.
