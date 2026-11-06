# P00 · Línea base, pruebas y validación de uso
Padre: [V3-PLAN](../tarea.md). Responsable propuesto: QA y producto; apoyo de frontend y Rust. Persona: por asignar. Estado: en curso; cortes parciales, sin cierre completo.

## Objetivo
Obtener una base comparable de rendimiento, integridad y facilidad de uso, y mantener evidencia por cada entrega.

## Alcance y aceptación por propuesta
### T10 · Medir y optimizar arranque, documentos grandes y consumo de memoria
- Primera entrega: Medir arranque, memoria y documentos grandes; corregir el cuello de botella confirmado y separar cargas pesadas si procede.
- Ampliación planificada: Virtualización u otras optimizaciones solo con mediciones que las justifiquen.
- Aceptación de origen: Publicar hardware y corpus representativo acordado, con arranque/apertura p50/p95, latencia de escritura, pico de memoria y consumo sostenido. Comparar antes/después y comprobar que paneles y trabajos no degradan la edición. Los corpus de 1.000/10.000 archivos son pruebas de estrés candidatas, no capacidad prometida.
- Recomendación de hito: H0 · transversal. Primera entrega candidata a 3.0; validar alcance y entrada.

### T11 · Pruebas de integración y controles continuos antes de la release
- Primera entrega: Contratos y recorridos críticos de guardado, lotes, prompt, ajustes y exportación; aceptación nativa registrada.
- Ampliación planificada: Matriz extensa de dispositivos y pruebas prolongadas de capacidades secundarias.
- Aceptación de origen: Cada PR detecta regresiones de contratos y diseño responsive; una candidata a 3.0 dispone de evidencia nativa fechada y no confunde mocks con aceptación real.
- Recomendación de hito: H0 · transversal. Primera entrega candidata a 3.0; validar alcance y entrada.

### U16 · Validar recorridos y simplificación con usuarios antes de extender el rediseño
- Primera entrega: Línea base y primera ronda de prototipos del asistente, árbol/lotes, ajustes y formularios; registrar problemas, decisiones y segunda comprobación de cambios relevantes.
- Ampliación planificada: Piloto de una candidata con uso prolongado y medición voluntaria acordada; sin convertir analítica de producto en dependencia del funcionamiento local.
- Aceptación de origen: Cada decisión principal de simplificación tiene evidencia de tareas o se identifica como hipótesis. Se comparan resultados antes/después por perfil, se documentan fracasos y limitaciones y se corrigen bloqueos críticos antes de aceptar el recorrido. Los umbrales se acuerdan al conocer la línea base, sin porcentajes inventados ni sustituir pruebas de accesibilidad.
- Recomendación de hito: H0 · transversal. Primera entrega candidata a 3.0; validar alcance y entrada.


## Criterios compartidos del paquete
- P00-C1: Cada propuesta y capacidad tiene paquete responsable y prueba o comprobación prevista.
- P00-C2: Las mediciones incluyen corpus, entorno, fecha y procedimiento; ninguna cifra antigua se presenta como medida actual.
- P00-C3: La validación distingue compilación, pruebas locales, proveedor, hardware y aceptación humana; las omisiones permanecen explícitas.

## Límites
Se conserva la arquitectura obligatoria del proyecto. La orden posterior del usuario autoriza implementar el programa completo y sus ampliaciones, conforme al plan principal. Las imágenes no acreditan implementación ni aceptación; cada entrega mantiene su verificación y límites explícitos. Las reglas comunes de privacidad, estado y recuperación se referencian desde el [plan principal](../plan.md) y no se redefinen de forma contradictoria aquí.



## Avance 04
Estado y evidencia vigentes: [continuidad, seguridad nativa y primer uso](../avance-04.md). Continúa el alcance completo restante; no se cierra este paquete.
