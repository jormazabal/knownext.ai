# P07 · Grabación compacta, dictado y libreta
Padre: [V3-PLAN](../tarea.md). Responsable propuesto: Frontend/audio, Rust nativo y QA hardware. Persona: por asignar. Estado: desarrollo local implementado y regresión139 cerrada; aceptación instalada/física/humana P10/U16 pendiente y T17 real aplazada sin gasto cuando aplica.

## Objetivo
Aplicar el controlador compacto elegido y conservar captura, transcripción y trabajo manuscrito de forma verificable.

## Alcance y aceptación por propuesta
### F11 · Convertir grabaciones en actas útiles y revisables
- Primera entrega: Si se selecciona: acta revisable vinculada a segmentos disponibles; validar captura/recuperación nativa.
- Ampliación planificada: Diarización, sincronización palabra/audio y automatización de tareas; responsables siempre sujetos a revisión.
- Aceptación de origen: Una reunión de referencia produce un acta revisable, permite escuchar el fragmento origen y conserva la transcripción original; se verifican interrupciones y retención en dispositivo real.
- Recomendación de hito: H6 · ampliación condicionada. Planificar ampliación; seleccionar caso de uso y alcance antes de comprometerla en 3.0.

### F12 · Hacer consultables las notas manuscritas mediante OCR revisable
- Primera entrega: Si se selecciona: reconocimiento corregible por página que conserva trazos y explica envío local/remoto.
- Ampliación planificada: Selecciones arbitrarias, reconocimiento continuo y corpus amplio de escritura.
- Aceptación de origen: Una nota de prueba se encuentra por una palabra manuscrita reconocida; corregir el OCR no cambia los trazos ni elimina el original.
- Recomendación de hito: H6 · ampliación condicionada. Planificar ampliación; seleccionar caso de uso y alcance antes de comprometerla en 3.0.

### U14 · Distinguir dictado, grabación y uso del lápiz con flujos claros
- Primera entrega: Etiquetas y destinos inequívocos de dictado, grabación y lápiz; señales persistentes y estado de protección.
- Ampliación planificada: Incorporación detallada y optimización de gestos después de pruebas con stylus/audio reales.
- Aceptación de origen: Usuarios distinguen qué se capturará y dónde aparecerá; pausar no se confunde con transcribir. En stylus, mano/dedo/lápiz no provocan trazos involuntarios y la página se recupera al volver de segundo plano.
- Recomendación de hito: H2 · H4. Primera entrega candidata a 3.0; validar alcance y entrada.


## Criterios compartidos del paquete
- P07-C1: R01–R12 de la especificación compacta se cumplen, incluidos controles visibles con historial desplazado.
- P07-C2: Preparada no finge señal; grabando bloquea cambio de dispositivo; pausa permite cambiar y no muestra niveles activos ficticios.
- P07-C3: Cerrar/abrir la miniventana no detiene ni duplica la captura; detener la aplicación tiene una política explícita que protege la sesión.
- P07-C4: Cancelar destino conserva audio; reintento con resultado desconocido advierte posible coste duplicado.
- P07-C5: Dictado y grabación no compiten por el mismo propietario de captura; Android no promete audio de sistema o bandeja Windows.
- P07-C6: La libreta conserva trazos al guardar/cambiar página/suspender; OCR no reemplaza el original sin revisión.

## Límites
Se conserva la arquitectura obligatoria del proyecto. La orden posterior del usuario autoriza implementar el programa completo y sus ampliaciones, conforme al plan principal. Las imágenes no acreditan implementación ni aceptación; cada entrega mantiene su verificación y límites explícitos. Las reglas comunes de privacidad, estado y recuperación se referencian desde el [plan principal](../plan.md) y no se redefinen de forma contradictoria aquí.



## Avance 04
Estado y evidencia vigentes: [continuidad, seguridad nativa y primer uso](../avance-04.md). Continúa el alcance completo restante; no se cierra este paquete.


## Alcance vigente consolidado140 · 2026-11-06

El alcance local de este paquete está implementado y verificado; las notas históricas conservan la fecha y no reabren entregas posteriores cerradas. Véase el [alcance consolidado de la candidata](../consolidacion-140-alcance.md). P10/U16 conserva aceptación instalada/física/humana; T17 real permanece aplazada sin gasto y las capacidades condicionadas conservan sus límites.
