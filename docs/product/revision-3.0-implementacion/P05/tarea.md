# P05 · Organización por lotes, recuperación y versiones
Padre: [V3-PLAN](../tarea.md). Responsable propuesto: Rust/almacenamiento y frontend biblioteca. Persona: por asignar. Estado: desarrollo local implementado y regresión139 cerrada; aceptación instalada/física/humana P10/U16 pendiente y T17 real aplazada sin gasto cuando aplica.

## Objetivo
Organizar conjuntos de documentos sin perder datos, enlaces ni claridad sobre guardado y sincronización.

## Alcance y aceptación por propuesta
### F04 · Papelera y centro de recuperación con copias verificables
- Primera entrega: Papelera de proyecto con restauración verificable de archivos/carpetas, colisiones y retención explícita; funciona sin Git.
- Ampliación planificada: Centro integral de recuperación, copias programadas y portabilidad F07.
- Aceptación de origen: Borrar una carpeta con documentos e imágenes y restaurarla conserva estructura y referencias; el flujo funciona también en proyectos sin Git.
- Recomendación de hito: H3. Primera entrega candidata a 3.0; validar alcance y entrada.

### F05 · Historial orientado a hitos y comparaciones elegibles
- Primera entrega: Nombrar hitos y comparar dos versiones conservando restauración como nueva versión.
- Ampliación planificada: Restauración parcial por bloques y agrupaciones sofisticadas.
- Aceptación de origen: Nombrar y elegir dos hitos permite entender qué cambió; restaurar una versión crea una nueva y no altera documentos ajenos. La restauración parcial se valida por separado si se selecciona.
- Recomendación de hito: H6 · ampliación condicionada. Planificar ampliación; seleccionar caso de uso y alcance antes de comprometerla en 3.0.

### F06 · Resolver conflictos con comparación y combinación asistida
- Primera entrega: Mostrar divergencia y conservar ambas versiones antes de elegir/reponer una; revalidar base.
- Ampliación planificada: Editor de combinación por bloques y escenarios complejos entre dispositivos.
- Aceptación de origen: Dos ediciones sobre el mismo párrafo no se sobrescriben; se conservan ambas, se comparan y se revalida la base al aplicar una elección. La combinación por bloques requiere aceptación adicional si se incluye.
- Recomendación de hito: H3. Primera entrega candidata a 3.0; validar alcance y entrada.

### F15 · Selección múltiple y operaciones seguras sobre archivos y carpetas
- Primera entrega: Selección mixta accesible, Mover a… dentro del mismo proyecto y papelera por lote con plan, protección de borradores y resultados parciales.
- Ampliación planificada: Arrastre múltiple, duplicar, exportar, renombrar o aportar contexto IA por lote, cada acción dimensionada.
- Aceptación de origen: Mover una mezcla de archivos y carpeta con un hijo también seleccionado procesa cada recurso una vez y conserva el contenido abierto. Un documento con cambios pendientes no se descarta. Borrar y restaurar un lote funciona sin Git. Un fallo de permisos parcial informa exactamente de éxitos/fallos y el reintento no duplica movimientos. Se verifica alcance con filtros, cambios externos entre preparación y ejecución, teclado y dispositivo táctil.
- Recomendación de hito: H3. Primera entrega candidata a 3.0; validar alcance y entrada.

### F17 · Ciclo de vida del proyecto y control del almacenamiento local
- Primera entrega: Semántica clara de retirar/revincular/eliminar, mapa de ubicaciones y datos conservados, indicador de uso con alcance conocido y limpieza segura de cachés regenerables. Tratar falta de espacio en guardado/importación/audio.
- Ampliación planificada: Archivo de proyectos, cuotas configurables y limpieza asistida de recursos candidatos; copias y traslado integrales siguen en F04/F07.
- Aceptación de origen: Retirar y revincular un proyecto conserva originales y recupera su asociación conforme al contrato; eliminar informa de qué permanece y dónde. Limpiar cachés no elimina fuentes, borradores, papelera ni audio pendiente/fijado y permite regenerarlas. Un recurso aún referenciado no se propone como huérfano seguro. La falta de espacio no se informa como guardado correcto.
- Recomendación de hito: H3. Primera entrega candidata a 3.0; validar alcance y entrada.

### U09 · Un lenguaje inequívoco para guardado, historial y sincronización
- Primera entrega: Lenguaje y estados inequívocos para guardado local, versión y remoto; informar resultados de lotes.
- Ampliación planificada: Resumen más amplio de protección por proyecto.
- Aceptación de origen: Un usuario identifica qué está protegido y dónde sin conocer Git; un fallo remoto no cambia un guardado local correcto a un mensaje alarmante.
- Recomendación de hito: H3. Primera entrega candidata a 3.0; validar alcance y entrada.


## Criterios compartidos del paquete
- P05-C1: Seleccionar carpeta y descendiente no duplica operaciones; el contador y la confirmación muestran el alcance real.
- P05-C2: Mover actualiza referencias gestionadas y preserva borradores; fallos parciales permiten saber qué ocurrió y recuperar o reintentar con seguridad.
- P05-C3: La papelera restaura archivo, carpetas y recursos con colisiones resueltas; no se promete atomicidad si el lote es parcial.
- P05-C4: Restaurar crea una versión nueva cuando corresponda; no se muestran nombres de ramas; retirar proyecto no equivale a eliminar sus archivos.

## Límites
Se conserva la arquitectura obligatoria del proyecto. La orden posterior del usuario autoriza implementar el programa completo y sus ampliaciones, conforme al plan principal. Las imágenes no acreditan implementación ni aceptación; cada entrega mantiene su verificación y límites explícitos. Las reglas comunes de privacidad, estado y recuperación se referencian desde el [plan principal](../plan.md) y no se redefinen de forma contradictoria aquí.



## Avance 04
Estado y evidencia vigentes: [continuidad, seguridad nativa y primer uso](../avance-04.md). Continúa el alcance completo restante; no se cierra este paquete.


## Alcance vigente consolidado140 · 2026-11-06

El alcance local de este paquete está implementado y verificado; las notas históricas conservan la fecha y no reabren entregas posteriores cerradas. Véase el [alcance consolidado de la candidata](../consolidacion-140-alcance.md). P10/U16 conserva aceptación instalada/física/humana; T17 real permanece aplazada sin gasto y las capacidades condicionadas conservan sus límites.
