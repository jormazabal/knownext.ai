# KnowNext.ai 3.0 — revisión funcional y síntesis de diseño

Fecha: 30 de octubre de 2026. Estado actualizado: el usuario ha elegido la opción 1, Taller esencial; sin implementación.

Continuación: [estudio profundo de usabilidad y cobertura funcional](revision-3.0-estudio-usabilidad.md). Este estudio precisa la escala y el contraste, restituye las funcionalidades omitidas en las maquetas y distingue capacidades existentes de propuestas nuevas. En particular, la papelera requiere desarrollo real y la IA actual aplica operaciones validadas sin aprobación permanente; las imágenes anteriores no sustituyen esos contratos.

## Alcance y evidencia

Se revisan las cinco maquetas que el usuario ha señalado en esta conversación: Bauhaus original, Atelier cromático, Órbita, Contraste editorial y Archivo modular. Se han vuelto a inspeccionar visualmente. Son evidencia de composición y representación de estados, no de interacción ejecutada. Se contrasta la revisión con `revision-3.0-propuestas-diseno.md`, el inventario de funcionalidades de `apps/desktop/src/features` y el contrato/renderizado de `DocumentStatusBar.tsx`. No se ha repetido una auditoría completa del código ni probado la aplicación en esta fase.

La preferencia expresada es recuperar la calidad estética de la primera Bauhaus. Sigue autorizada la exploración de otros colores; eso no obliga a colorear todo el entorno. Las conclusiones siguientes son juicio de diseño e hipótesis de uso, no resultados de pruebas con usuarios.

## Dictamen

La primera Bauhaus ofrece la base más coherente con la preferencia del usuario: una superficie continua, contraste tipográfico fuerte y navegación subordinada al documento. Hay que reducir su escala de presentación, concretar los estados y conservar las capacidades que una maqueta sencilla oculta.

En las últimas variaciones, la forma ganó protagonismo sin una mejora funcional equivalente demostrada. El proyecto, las secciones y el asistente llegaron a competir con el contenido. La siguiente iteración recupera una jerarquía estable y limita la geometría a identificación, selección y controles. El color tendrá una función consistente dentro de cada alternativa.

## Comparación crítica de las maquetas

| Referencia | Qué funciona visualmente | Riesgo o limitación observable | Decisión |
|---|---|---|---|
| Bauhaus original | Fondo continuo; navegación reconocible; título dominante; pocos acentos | Título y subtítulo altos; ancho de lectura largo; números de sección ambiguos entre interfaz y documento; solo se representa guardado correcto | Conservar la composición y reducir escala; no imponer numeración o adornos al contenido |
| Atelier cromático | Identidad propia; archivo activo reconocible; controles etiquetados | Selector amarillo muy grande, título azul y figuras multicolor compiten; cada sección recibe una forma diferente sin necesidad funcional | Descartar el despliegue simultáneo de colores y formas; conservar una marca de selección pequeña |
| Órbita | Biblioteca accesible; propuesta de IA cerca del fragmento afectado | Tres modos superiores obligan a interpretar dónde se trabaja; pestaña lateral de IA desproporcionada; resultado de IA puede parecer parte del documento | Conservar revisión contextual con alcance y estado explícitos; evitar modos globales sin tareas que los justifiquen |
| Contraste editorial | Abierto y seleccionado se representan de manera diferente; lote explícito | Selector y barra lima dominantes; biblioteca desplazada a la derecha sin beneficio acreditado; tema oscuro confunde la comparación de estructuras | Conservar las diferencias de estado; estudiar el tema oscuro aparte; no cambiar la lateralidad solo por novedad |
| Archivo modular | Acciones conjuntas y vista previa comprensibles | Contador gigante y encabezado consumen espacio; solo caben pocos elementos | Recuperar organización ampliada como estado temporal, con contador compacto y lista de mayor capacidad |

## Recorridos funcionales que deben gobernar el diseño

El estado indicado valora la cobertura en las maquetas; no acredita funcionamiento.

| Paso | Tarea y estado de cobertura | Propuesta de comportamiento | Validación pendiente |
|---|---|---|---|
| 1 | Elegir proyecto y abrir documento — cobertura visual parcial | Selector compacto; ruta accesible; árbol plegable; búsqueda global descubrible; conservar posición al volver | Árbol profundo, nombres iguales en distintas carpetas y títulos largos |
| 2 | Escribir y dar formato — composición prometedora, densidad insuficiente | Documento de una columna; herramientas frecuentes estables; títulos proporcionados; tablas, imágenes y diagramas accesibles desde Insertar | Selección, teclado, cursor visible, documentos largos, zoom y contenido ancho |
| 3 | Alternar entre documentos — parcial | Pestañas limitadas con desbordamiento o lista de abiertos; indicar cambios pendientes sin depender solo del color | Muchos documentos, cierre con cambios y retorno al punto de lectura |
| 4 | Pedir ayuda de IA — parcial y variable entre propuestas | Acceso estable; apertura explícita; destino visible; plegar/fijar; borrador conservado; alcance distinguible de archivos seleccionados | Cambio de documento, error, cancelación, resultado tardío y proveedor sin configurar |
| 5 | Revisar una modificación de IA — parcial | Resultado marcado como propuesta; Aplicar/Descartar; cambios revisables; no incorporar la respuesta al documento antes de aceptar | Conflicto con edición posterior y reversibilidad; mantener claro qué texto se sustituye |
| 6 | Mover o eliminar un lote — parcial | Selección separada de archivo abierto y foco; contador compacto; Mover/Papelera; destino y consecuencias explícitos | Padre e hijo seleccionados, colisiones, archivos no visibles y fallo parcial |
| 7 | Guardar, revisar versiones y sincronizar — insuficiente en imágenes | Estado local visible; acción Guardar cuando proceda; sincronización remota diferenciada; historial con comparación y restauración | Error de guardado, cambios externos, falta de conexión y restauración; no ocultar riesgos bajo el minimalismo |
| 8 | Configurar — pendiente en esta serie | Ajustes habituales primero, avanzados desplegables sobre los mismos valores; alcance y personalizaciones visibles | Validación, persistencia, credenciales, texto largo y vuelta al documento |
| 9 | Importar, exportar, consultar referencias y usar audio — no cubierto en estas imágenes | Accesos consistentes desde menús pertinentes; entrada y salida explícitas; estados de progreso/error; no añadir todos los controles a la barra principal | Formatos, destinos, previsualización, grabación activa, transcripción y permisos |
| 10 | Trabajar en ventana estrecha o móvil — no cubierto | Biblioteca temporal; documento prioritario; IA como superficie temporal cuando no quepa; formularios en una columna | 390 px, tableta, 1366×768, teclado virtual, rotación y ampliación de texto |

El inventario del proyecto incluye edición visual, diagramas, medios, referencias, grabaciones, transcripción, escritura manuscrita, versiones y cambios externos. La captura principal no debe convertirse en un catálogo de botones, pero estas capacidades necesitan una ubicación antes de cerrar el diseño. El inventario no prueba su estado funcional actual.

`DocumentStatusBar.tsx` contempla guardando, guardado, error, cambios pendientes, sincronización y revisión remota, además de acciones. No sustituir este contrato por un rótulo permanente de «Guardado». Tampoco introducir autoguardado como un supuesto visual.

## Sistema gráfico común para la siguiente iteración

1. Superficie clara continua. Sin líneas permanentes entre navegación y contenido. Menús, campos y diálogos pueden tener límites cuando ayuden a identificar su interacción.
2. Jerarquía: documento, acción en curso, navegación y metadatos. El selector de proyecto y el asistente en reposo no deben convertirse en los elementos más grandes.
3. Geometría consistente. Marca pequeña para archivo abierto, casilla para selección múltiple, contorno visible para foco. No asignar una figura distinta a cada encabezado.
4. Color restringido por función dentro de cada alternativa. Los errores y advertencias mantienen significado propio. No usar color como única señal.
5. Separar estilo de interfaz y formato del documento. La aplicación no añade números, círculos ni bloques coloreados al Markdown. Las decoraciones de navegación no se exportan. Los números solo aparecerán si pertenecen al contenido.
6. Escala de partida para prototipo: interfaz 14–16 px, cuerpo 16–18 px, título 32–40 px y apartados 22–26 px. Son objetivos, no medidas garantizadas por las imágenes. Mantener tamaño elegido y zoom.
7. Lectura con ancho controlado, alrededor de 60–75 caracteres como hipótesis inicial. Aprovechar ventanas amplias para tareas auxiliares, no para alargar indefinidamente cada línea.
8. Geometría discreta en marca y acciones relevantes; sin selector de proyecto monumental, contadores gigantes o botones flotantes sobre el contenido.
9. No confundir concentración con desaparición de controles: biblioteca, búsqueda, historial e IA siguen teniendo entradas explícitas y posiciones estables.
10. Accesibilidad pendiente de prototipo: contraste real por estado, foco, orden de teclado, nombres accesibles, áreas táctiles, ampliación, alto contraste y movimiento reducido. No se acredita conformidad a partir de renders.

## Tres hipótesis visuales

### Taller esencial

Árbol integrado a la izquierda, pestañas discretas y documento dominante. Fondo blanco, texto carbón y acento terracota. Es la evolución más cercana a la primera Bauhaus: reduce el ruido y mantiene acceso directo a archivos. El asistente aparece plegado.

Ventaja esperada: continuidad entre escritura y navegación. Riesgo: muchos archivos o pestañas pueden consumir espacio; requiere plegado, desbordamiento y redimensionado accesibles. Es la base recomendada para el primer prototipo por su afinidad con la preferencia expresada, no porque ya se haya demostrado superior en pruebas.

### Página abierta

Biblioteca plegada bajo un control explícito; lista compacta de abiertos y documento centrado. Fondo casi blanco cálido y acento burdeos. El margen puede mostrar un índice discreto del documento largo. No añade modos globales Escribir/Organizar/Consultar.

Ventaja esperada: lectura y redacción prolongadas. Riesgo: cambiar de archivo exige desplegar la biblioteca; debe preservar expansión, selección y scroll. Se compara con Taller esencial con el mismo documento y la IA plegada.

### Estudio contextual

Navegación compacta que reúne abiertos y árbol; documento central; asistencia abierta en el margen derecho, sin divisiones estructurales. Fondo blanco, texto carbón y acento petróleo. El panel auxiliar tiene destino, estado de propuesta, fijación y cierre explícitos. La misma zona puede alojar historial o referencias, de uno en uno y conservando el estado anterior.

Ventaja esperada: revisar cambios sin perder de vista el documento. Riesgo: tres áreas resultan estrechas en ventanas pequeñas; el auxiliar debe transformarse en superficie temporal. Esta imagen muestra IA abierta deliberadamente, por lo que su densidad no debe compararse como si fuera el mismo estado de las otras dos.

## Decisiones y comprobaciones posteriores

Estas alternativas no son compromisos de implementación ni tres productos distintos. Comparten contratos funcionales; exploran la presencia de navegación y ayuda. Tras elegir una base, dibujar con el mismo sistema la selección múltiple, configuración, mover archivos, error de guardado y variante móvil. Mantener el tema oscuro como dimensión separada.

Probar los diez recorridos con contenido realista: árbol de cientos de elementos, nombres largos, quince documentos abiertos, tablas, cambios pendientes y operaciones fallidas. Comparar facilidad para encontrar acciones, pérdidas de contexto, errores y recuperación. No elegir solo por atractivo de una captura.

## Imágenes

Generadas con la herramienta integrada Image Gen, como tres resultados independientes. Orden confirmado por su aparición en el chat. Los briefs de cada versión están descritos arriba; se ha utilizado la Bauhaus original como referencia visual de Taller esencial y este resultado como referencia de las otras dos. No se ha implementado código de interfaz.

### Versión 1 — Taller esencial

![Taller esencial](C:/Dev/knownext.ai/output/playwright/revision-3.0/sintesis-bauhaus/01-taller-esencial.png)

Revisión visual: conserva árbol, pestañas y acceso a selección; elimina las cifras decorativas de los apartados y muestra una sección adicional. El render todavía presenta una tipografía más amplia que la escala objetivo y colorea las viñetas; en prototipo conviene neutralizarlas y revisar el sangrado del primer párrafo. No interpretar su tamaño aparente como especificación exacta.

### Versión 2 — Página abierta

![Página abierta](C:/Dev/knownext.ai/output/playwright/revision-3.0/sintesis-bauhaus/02-pagina-abierta.png)

Revisión visual: acceso explícito a Biblioteca, selector de documento con contador de abiertos, índice y mismo contenido. La paleta se mantiene muy próxima al blanco y el acento no invade el texto. El título y la ruta repiten parte de la información; en prototipo se puede abreviar la ruta a carpeta, manteniendo el nombre completo accesible.

### Versión 3 — Estudio contextual

![Estudio contextual](C:/Dev/knownext.ai/output/playwright/revision-3.0/sintesis-bauhaus/03-estudio-contextual.png)

Revisión visual: se distingue original/propuesta y «Pendiente de aplicar»; el asistente incluye fijar y ocultar sin separadores estructurales. La lista de abiertos repite archivos del árbol, un coste que debe contrastarse frente a las pestañas. No conservar tres áreas simultáneas cuando falte ancho. La selección del ejemplo representa un elemento de lista: una aceptación real debe preservar su estructura Markdown, no sustituir ciegamente texto visible.

### Referencias comparadas

Las siguientes copias corresponden a las maquetas inspeccionadas en esta revisión, no a capturas actuales de la aplicación:

- [Bauhaus original](C:/Dev/knownext.ai/output/playwright/revision-3.0/sintesis-bauhaus/referencia-bauhaus-original.png).
- [Atelier cromático](C:/Dev/knownext.ai/output/playwright/revision-3.0/sintesis-bauhaus/referencia-atelier.png).
- [Órbita](C:/Dev/knownext.ai/output/playwright/revision-3.0/sintesis-bauhaus/referencia-orbita.png).
- [Contraste editorial](C:/Dev/knownext.ai/output/playwright/revision-3.0/sintesis-bauhaus/referencia-contraste.png).
- [Archivo modular](C:/Dev/knownext.ai/output/playwright/revision-3.0/sintesis-bauhaus/referencia-archivo.png).

Las imágenes no prueban teclado, rendimiento, contraste final, responsividad ni conservación de datos. La revisión acepta las tres como alternativas visuales para continuar, con las correcciones señaladas; ninguna se considera aceptación funcional.
