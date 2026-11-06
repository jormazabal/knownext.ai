# P02 · Seguridad, privacidad y garantías de IA
Padre: [V3-PLAN](../tarea.md). Responsable propuesto: Rust/seguridad y responsable de producto IA. Persona: por asignar. Estado: desarrollo local implementado y regresión139 cerrada; aceptación instalada/física/humana P10/U16 pendiente y T17 real aplazada sin gasto cuando aplica.

## Objetivo
Controlar credenciales, datos enviados y autoridad de las acciones, y evaluar calidad y coste sin promesas falsas.

## Alcance y aceptación por propuesta
### T06 · Proteger claves y tokens con almacenamiento seguro nativo
- Primera entrega: Migración recuperable de claves/tokens al almacén nativo, con lectura, actualización y borrado verificados.
- Ampliación planificada: Rotación o gestión empresarial si aparece una necesidad real.
- Aceptación de origen: Tras migrar con una credencial sintética, no aparece en JSON, logs ni exportaciones; se puede usar, sustituir y revocar sin devolverla a React. Los fallos de migración mantienen recuperación controlada.
- Recomendación de hito: H1 · H4. Primera entrega candidata a 3.0; validar alcance y entrada.

### T07 · Activar CSP y delimitar permisos por ventana/comando
- Primera entrega: Verificar la superficie accesible y aplicar CSP/permisos mínimos compatibles con los flujos reales.
- Ampliación planificada: Aislamiento adicional de ventanas según amenazas demostradas; no se afirma explotación actual.
- Aceptación de origen: Contenido de prueba no ejecuta scripts ni inicia navegación/protocolos no permitidos; PDF, Mermaid, imágenes y audio siguen funcionando en la aplicación empaquetada.
- Recomendación de hito: H1 · H4. Primera entrega candidata a 3.0; validar alcance y entrada.

### T08 · Endurecer rutas, importaciones y límites de recursos
- Primera entrega: Validar rutas y límites en importación, assets y lotes, con corpus de entradas adversas aislado.
- Ampliación planificada: Ampliar fuzzing y corpus a todos los formatos; no se presume una intrusión.
- Aceptación de origen: Pruebas con junctions, traversal, ZIP muy comprimido y archivos grandes son rechazadas sin modificar rutas externas ni agotar memoria; errores recuperables explican el límite.
- Recomendación de hito: H1 · H4. Primera entrega candidata a 3.0; validar alcance y entrada.

### T09 · Definir y aplicar la política de datos enviados y retenidos por IA
- Primera entrega: Definir y hacer visibles los datos enviados, retención y eliminación, sin añadir persistencia de prompts.
- Ampliación planificada: Controles más finos por proyecto/proveedor después de concretar la política.
- Aceptación de origen: Un test con datos sintéticos verifica contexto enviado, historial, cachés, retención y eliminación local conforme a una política explícita; documentar qué eliminación externa no puede garantizar la app. Los datos existentes tienen tratamiento definido. T16 verifica que una fuente no amplía autoridad.
- Recomendación de hito: H1 · H4. Primera entrega candidata a 3.0; validar alcance y entrada.

### T16 · Separar contexto IA de autoridad y validar el alcance de cada operación
- Primera entrega: Inventario de entradas/salidas y matriz lectura/escritura/acción por interacción, más pruebas adversas de referencias e índices que intenten ampliar el alcance.
- Ampliación planificada: Aislamiento adicional de capacidades y corpus adverso más extenso según exposición observada; no se promete inmunidad total a prompt injection.
- Aceptación de origen: Una referencia sintética con instrucciones de modificar otro proyecto no obtiene autoridad; una consulta de solo lectura no muta documentos; un resultado con destino inexistente, permiso revocado o base obsoleta no se aplica. Las ediciones autorizadas y válidas siguen siendo fluidas. Documentar alcance y resultados de la prueba, sin deducir seguridad por el mero cumplimiento del esquema JSON.
- Recomendación de hito: H1 · H4. Primera entrega candidata a 3.0; validar alcance y entrada.

### T17 · Evaluación reproducible de calidad, coste y latencia de la IA
- Primera entrega: Corpus y rúbrica de escritura/consulta con unas decenas de casos como punto de partida, pruebas locales deterministas y protocolo de ejecución con proveedor y presupuesto explícitos. Fijar umbrales después de medir la base.
- Ampliación planificada: Extender corpus a investigación, audio, dibujo y otros proveedores cuando esas capacidades se seleccionen; evaluación periódica de cambios de modelo.
- Aceptación de origen: Un cambio de prompt, skill, modelo o recuperación puede compararse con una ejecución fechada sobre la misma rúbrica; se muestran fallos y variabilidad, no solo una media. Si no se ejecuta proveedor real, el informe indica validación local y mantiene pendiente la calidad end-to-end. El corpus no contiene documentos privados de producción sin autorización.
- Recomendación de hito: H1 · H4. Primera entrega candidata a 3.0; validar alcance y entrada.

### F09 · Presupuestos de IA por proyecto y uso comprensible
- Primera entrega: Unificar avisos de uso y estimaciones del dispositivo en las capacidades actuales; límites previos donde puedan hacerse efectivos.
- Ampliación planificada: Presupuestos por proyecto/periodo; no equivalen a un tope exacto de facturación ni global entre equipos.
- Aceptación de origen: Texto, imágenes, investigación y audio muestran el alcance conocido de uso/estimación y aplican la política configurada donde sea efectiva; un resultado incierto no se reintenta silenciosamente. Los importes locales no se presentan como factura ni tope global garantizado.
- Recomendación de hito: H1 · H4. Primera entrega candidata a 3.0; validar alcance y entrada.


## Criterios compartidos del paquete
- P02-C1: Exportación, copias, logs y errores no incluyen credenciales; lectura, cambio y borrado se verifican en ambas plataformas.
- P02-C2: Una referencia que contiene instrucciones no amplía permisos ni documentos destino; runtime rechaza acciones fuera del alcance.
- P02-C3: Cada capacidad explica qué sale del dispositivo y qué se conserva; cancelar o borrar tiene un resultado comprobable.
- P02-C4: Consumo local y estimaciones no se presentan como factura ni tope global entre dispositivos; calidad, coste y latencia se registran con su proveedor y corpus.

## Límites
Se conserva la arquitectura obligatoria del proyecto. La orden posterior del usuario autoriza implementar el programa completo y sus ampliaciones, conforme al plan principal. Las imágenes no acreditan implementación ni aceptación; cada entrega mantiene su verificación y límites explícitos. Las reglas comunes de privacidad, estado y recuperación se referencian desde el [plan principal](../plan.md) y no se redefinen de forma contradictoria aquí.



## Avance 04
Estado y evidencia vigentes: [continuidad, seguridad nativa y primer uso](../avance-04.md). Continúa el alcance completo restante; no se cierra este paquete.


## Alcance vigente consolidado140 · 2026-11-06

El alcance local de este paquete está implementado y verificado; las notas históricas conservan la fecha y no reabren entregas posteriores cerradas. Véase el [alcance consolidado de la candidata](../consolidacion-140-alcance.md). P10/U16 conserva aceptación instalada/física/humana; T17 real permanece aplazada sin gasto y las capacidades condicionadas conservan sus límites.
