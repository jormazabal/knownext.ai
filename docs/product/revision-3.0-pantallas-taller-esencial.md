# KnowNext.ai 3.0 · Pantallas de Taller esencial

30/10/2026. Serie visual basada en la opción 1 elegida y en el estudio de usabilidad. Generada con la herramienta integrada Image Gen. No se ha implementado la aplicación.

[Ver galería](../../output/playwright/revision-3.0/pantallas-taller-esencial/index.html) · [Estudio](revision-3.0-estudio-usabilidad.md) · [Matriz de capacidades](revision-3.0-cobertura-funcional.csv)

## Lectura de la serie

Doce pantallas de una misma dirección, no doce alternativas de estilo. Los nombres e identificadores de archivo permiten comentar cada estado. Las versiones finales de asistente, historial y configuración incorporan correcciones de coherencia respecto a los primeros renders del chat.

Se conserva el fondo común, la jerarquía tipográfica y el acento cálido. Los límites visibles de campos, diálogos, páginas y selección tienen función; no se reintroducen divisores permanentes entre árbol, documento y auxiliares.

Las imágenes representan composición y estados. No acreditan comportamiento, contraste exacto, medidas CSS, tipografía definitiva o accesibilidad. Los tokens y criterios del estudio siguen siendo la especificación. Algunos renders conservan variaciones menores de iconos, escala y ubicación de Historial/Exportar que deberán unificarse en el prototipo. El contenido, fechas, importes y gráficos son ejemplos ficticios.

## Escritura · asistente cerrado

![Escritura · asistente cerrado](../../output/playwright/revision-3.0/pantallas-taller-esencial/01-editor.png)

El documento ocupa el centro; el asistente cerrado deja libre el espacio inferior. La biblioteca comparte el fondo y las utilidades personales siguen accesibles.

Cobertura de la matriz: F19–F30, F41. Antes de implementar: Validar escala de texto y densidad con documentos largos. Unificar Historial/Exportar en la zona del documento; algunas imágenes los mantienen en la cabecera.

## Asistente fijado · cambios aplicados

![Asistente fijado · cambios aplicados](../../output/playwright/revision-3.0/pantallas-taller-esencial/02-asistente.png)

Destino y contexto visibles, respuesta aplicada y acceso a Ver cambios/Deshacer. El compositor queda reservado en el margen, sin cubrir la escritura.

Cobertura de la matriz: F41–F45. Antes de implementar: Fijar, ocultar y cancelar son acciones distintas. Probar conservación del prompt, selección y posición del documento. Versión revisada sin divisor vertical.

## Selección múltiple · acciones comunes

![Selección múltiple · acciones comunes](../../output/playwright/revision-3.0/pantallas-taller-esencial/03-seleccion.png)

Casillas, carpeta parcialmente seleccionada, contador y acciones comunes. El documento abierto permanece reconocible mientras se organiza el árbol.

Cobertura de la matriz: F16–F18. Antes de implementar: Es una capacidad nueva. Resolver selección de descendientes, elementos filtrados y resultados parciales. En prototipo, evitar duplicar Exportar individual y de selección.

## Mover documentos · conflicto de nombre

![Mover documentos · conflicto de nombre](../../output/playwright/revision-3.0/pantallas-taller-esencial/04-mover.png)

Destino explícito y resolución del nombre duplicado por archivo; Conservar ambos evita sobrescritura silenciosa.

Cobertura de la matriz: F14, F17. Antes de implementar: Contrato de lote, colisiones y actualización de referencias por desarrollar/verificar. No prometer atomicidad ni recuperación sin soporte real.

## Error de guardado · contenido conservado

![Error de guardado · contenido conservado](../../output/playwright/revision-3.0/pantallas-taller-esencial/05-error.png)

El texto permanece visible; Reintentar y Guardar copia son siguientes acciones claras. Borrador recuperable se distingue de archivo guardado.

Cobertura de la matriz: F27–F29. Antes de implementar: El estado de borrador solo se mostrará cuando su persistencia esté confirmada. Nunca anunciar guardado local por haber generado un borrador.

## Historial · protección antes de restaurar

![Historial · protección antes de restaurar](../../output/playwright/revision-3.0/pantallas-taller-esencial/06-historial.png)

Versión anterior identificada como vista previa; el trabajo pendiente se protege antes de restaurar. El margen de historial comparte el lienzo blanco.

Cobertura de la matriz: F56–F58. Antes de implementar: Guardar y restaurar exige secuencia segura: si guardar falla, no restaurar. Validar comparación y recuperación; no equivale a papelera.

## Configuración sencilla · IA y privacidad

![Configuración sencilla · IA y privacidad](../../output/playwright/revision-3.0/pantallas-taller-esencial/07-ajustes.png)

Una única navegación por tareas. Conexión, modelo recomendado, capacidades, privacidad y gasto permanecen en la vista básica.

Cobertura de la matriz: F59–F63. Antes de implementar: El límite monetario es propuesta de interacción: precisar aviso frente a bloqueo, moneda y medición antes de implementarlo. Versión revisada sin árbol redundante.

## Configuración avanzada · escritura y exportación

![Configuración avanzada · escritura y exportación](../../output/playwright/revision-3.0/pantallas-taller-esencial/08-avanzados.png)

Parámetros de exportación agrupados y previsualización próxima. Se explica que el resultado PDF/DOCX y el editor tienen estilos distintos.

Cobertura de la matriz: F36, F62. Antes de implementar: Usar las mismas seis categorías que la vista básica. Validar render real, unidades, persistencia y disponibilidad de fuentes. Perfiles guardados requieren concretar alcance.

## Libreta manuscrita · herramientas y páginas

![Libreta manuscrita · herramientas y páginas](../../output/playwright/revision-3.0/pantallas-taller-esencial/09-libreta.png)

Herramienta, grosor, páginas y zoom visibles; el asistente no invade el lienzo. Los límites de página tienen una función concreta.

Cobertura de la matriz: F37–F40. Antes de implementar: La miniatura y el dibujo son ilustrativos. Validar lápiz real, mano, presión, desplazamiento y guardado en Windows/Android.

## Grabación activa · continuidad del trabajo

![Grabación activa · continuidad del trabajo](../../output/playwright/revision-3.0/pantallas-taller-esencial/10-grabacion.png)

Indicador global, duración, fuente y controles Pausar/Parar. Cerrar el panel no oculta que la sesión sigue activa.

Cobertura de la matriz: F52–F55. Antes de implementar: La selección de entrada debe respetar cuándo permite cambiarla el runtime. Validar permisos, bandeja, segundo plano, conservación y destino.

## Referencia PDF · solo lectura

![Referencia PDF · solo lectura](../../output/playwright/revision-3.0/pantallas-taller-esencial/11-referencia.png)

Navegación de páginas, búsqueda, abrir original y añadir contexto; aviso de limitaciones de la previsualización.

Cobertura de la matriz: F31–F36, F43. Antes de implementar: Todos los textos, entrevistas y porcentajes del PDF son datos ficticios de maqueta. Añadir contexto no debe enviar el archivo automáticamente.

## Móvil · asistente temporal

![Móvil · asistente temporal](../../output/playwright/revision-3.0/pantallas-taller-esencial/12-movil.png)

Una tarea por vista; contexto, resultado y deshacer legibles. La vuelta al documento está siempre disponible.

Cobertura de la matriz: F41–F45, F67–F70. Antes de implementar: Comprobar 390 y 320 CSS px, teclado virtual, áreas táctiles, foco, desplazamiento y conservación de sesión. La imagen no prueba responsividad.

## Cobertura y siguientes estados

La serie cubre los recorridos principales y los estados de mayor riesgo del estudio. No pretende dibujar las 70 capacidades una por una. Quedan para el prototipo de interacción: inicio sin proyectos, búsqueda con resultados, selector de contexto, operaciones parciales, borrado y recuperación real, sincronización/conflictos externos, tarea IA en curso/error, notas personales, catálogo de sesiones, creación de documentos en móvil, tema oscuro y actualizaciones. Su comportamiento se mantiene definido en el estudio; no se ha aceptado por estas imágenes.

Para la siguiente revisión conviene valorar: densidad del editor; espacio dedicado al asistente fijado; claridad del modo de selección; descubrimiento de opciones avanzadas; legibilidad y retorno en móvil. La decisión de implementar sigue separada de esta exploración visual.

[Prompts completos y trazabilidad de imágenes](../../output/playwright/revision-3.0/pantallas-taller-esencial/prompts-y-manifiesto.json).
