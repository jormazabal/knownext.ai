# P03 · Sistema visual, tres paneles y control del espacio
Padre: [V3-PLAN](../tarea.md). Responsable propuesto: Diseño/UX y frontend. Persona: por asignar. Estado: desarrollo local implementado y regresión139 cerrada; aceptación instalada/física/humana P10/U16 pendiente y T17 real aplazada sin gasto cuando aplica.

## Objetivo
Implantar Taller esencial y los laterales contextuales sin perder estado ni espacio del documento.

## Alcance y aceptación por propuesta
### U01 · Diálogos adaptados a anchura, altura y teclado virtual
- Primera entrega: Base modal adaptable y corrección de diálogos de creación, mover/papelera y ajustes; comprobar teclado virtual nativo.
- Ampliación planificada: Aplicar a superficies secundarias restantes según inventario y uso.
- Aceptación de origen: A 360/390 px y con altura reducida se ven título, campos y acciones sin desplazamiento horizontal; teclado virtual y rotación no ocultan el control principal.
- Recomendación de hito: H2. Primera entrega candidata a 3.0; validar alcance y entrada.

### U02 · Accesibilidad de teclado, foco y lectores en recorridos principales
- Primera entrega: Foco, Escape y semántica en diálogos, árbol, pestañas y recorridos principales; comprobar NVDA/TalkBack.
- Ampliación planificada: Auditoría completa del producto y declaración de conformidad solo con evidencia suficiente.
- Aceptación de origen: Se completa crear/abrir/editar/guardar/cerrar sin ratón; el foco nunca se pierde ni sale al fondo de un modal; los estados se anuncian sin lectura duplicada.
- Recomendación de hito: H2. Primera entrega candidata a 3.0; validar alcance y entrada.

### U03 · Interacciones táctiles propias, además del cambio de tamaño
- Primera entrega: Acceso táctil a abrir, menú y selección múltiple sin depender de hover/doble clic.
- Ampliación planificada: Arrastre y gestos más avanzados tras validación en hardware.
- Aceptación de origen: En teléfono/tableta se abre, renombra y selecciona un conjunto para moverlo mediante acciones accesibles, sin doble toque ambiguo ni dependencia de arrastre; los controles no solapan filas vecinas.
- Recomendación de hito: H2. Primera entrega candidata a 3.0; validar alcance y entrada.

### U07 · Conservar la posición de trabajo y facilitar la consulta de referencias
- Primera entrega: Conservar posición/selección al alternar edición y consulta; unificar controles esenciales de visor.
- Ampliación planificada: Modo concentración independiente y referencia lateral tras validar U15/U04.
- Aceptación de origen: Leer un documento largo, consultar una referencia y regresar conserva la posición de edición; la consulta no modifica el documento ni duplica controles del asistente. Verificar selección y desplazamiento por documento, también al cerrar y reabrir el visor durante la sesión.
- Recomendación de hito: H2. Primera entrega candidata a 3.0; validar alcance y entrada.

### U11 · Actividad y progreso sin interferir con el documento
- Primera entrega: Indicador de tareas activas y acceso a resultado/error, también con prompt oculto; grabación siempre reconocible.
- Ampliación planificada: Bandeja completa con filtros/historial y planificación.
- Aceptación de origen: Una tarea sigue siendo localizable con el asistente oculto, muestra destino y resultado y no roba foco al terminar; permite cancelar solo cuando es efectivo. Ningún control tapa guardado a 360/390 px y un resultado incierto no invita a un reintento ciego.
- Recomendación de hito: H2. Primera entrega candidata a 3.0; validar alcance y entrada.

### U13 · Rediseño integral de la jerarquía visual y los componentes comunes
- Primera entrega: Jerarquía, tokens y componentes compartidos aplicados al editor, árbol, asistente, ajustes y diálogos críticos, con prototipos y comprobación.
- Ampliación planificada: Extensión a todas las superficies especializadas; densidad configurable solo si la prueba de uso la justifica.
- Aceptación de origen: Los mismos componentes y estados tienen el mismo aspecto y comportamiento en editor y superficies secundarias; no hay controles solapados ni pérdida de acciones con zoom. Crear, encontrar, editar, mover y configurar se completan en los prototipos; se comprueban foco, contraste y traducciones. El área recuperada al plegar IA se acredita por comparación, sin inventar porcentajes de mejora.
- Recomendación de hito: H2. Primera entrega candidata a 3.0; validar alcance y entrada.

### U15 · Asistente de escritura plegable, contextual y fijable
- Primera entrega: Plegado/abierto/fijado en escritorio con altura acotada; móvil temporal; borradores contextuales de sesión y tareas independientes de visibilidad.
- Ampliación planificada: Disposiciones adicionales y persistencia de prompts solo mediante decisiones posteriores de producto/privacidad. Altura ajustable tras validar la disposición inicial.
- Aceptación de origen: Plegado no reserva una franja vacía en el documento. Ocultar/reabrir conserva borrador y fuentes; cambiar de A a B no envía ni aplica el borrador de A a B. Una tarea puede finalizar oculta sin robar foco; el resultado identifica su destino. Fijado no tapa texto/estado y móvil funciona con teclado virtual. El recorrido puede hacerse por teclado y conserva el punto de edición.
- Recomendación de hito: H2. Primera entrega candidata a 3.0; validar alcance y entrada.


## Criterios compartidos del paquete
- P03-C1: Navegación y Contexto se ocultan independientemente; el documento recupera espacio sin anchura de lectura ilimitada ni huecos reservados.
- P03-C2: Ocultar o cambiar auxiliar no pierde prompt, fuentes, cursor o trabajo; A y B recuperan su propio contexto.
- P03-C3: No se tapa Guardar, el cursor o el final del documento; grabación activa sigue visible en cualquier pantalla.
- P03-C4: Diálogos contienen foco, devuelven foco, soportan Escape conforme al estado y no activan el fondo; recorridos estrechos y lectores se comprueban.

## Límites
Se conserva la arquitectura obligatoria del proyecto. La orden posterior del usuario autoriza implementar el programa completo y sus ampliaciones, conforme al plan principal. Las imágenes no acreditan implementación ni aceptación; cada entrega mantiene su verificación y límites explícitos. Las reglas comunes de privacidad, estado y recuperación se referencian desde el [plan principal](../plan.md) y no se redefinen de forma contradictoria aquí.



## Avance 04
Estado y evidencia vigentes: [continuidad, seguridad nativa y primer uso](../avance-04.md). Continúa el alcance completo restante; no se cierra este paquete.


## Alcance vigente consolidado140 · 2026-11-06

El alcance local de este paquete está implementado y verificado; las notas históricas conservan la fecha y no reabren entregas posteriores cerradas. Véase el [alcance consolidado de la candidata](../consolidacion-140-alcance.md). P10/U16 conserva aceptación instalada/física/humana; T17 real permanece aplazada sin gasto y las capacidades condicionadas conservan sus límites.
