# KnowNext.ai 3.0 — propuestas visuales y de interacción

Fecha: 30 de octubre de 2026. Estado: exploración de diseño, sin implementación ni aceptación de usabilidad. Vinculado al [catálogo de mejoras](C:/Dev/knownext.ai/docs/product/revision-3.0-catalogo-mejoras.md).

Se han generado tres vistas de una dirección común y una revisión de la primera a petición del usuario: integrar árbol y documento sobre el mismo fondo. Son maquetas estáticas con datos ilustrativos; no acreditan funcionamiento, accesibilidad, dimensiones exactas ni conexión real con proveedores. La adaptación móvil descrita aquí todavía no tiene una maqueta visual propia.

## Dirección recomendada tras el comentario del usuario

Una superficie blanca continua para navegación y edición, con separación por alineación, espacio y jerarquía. El naranja conserva su función de acción y selección. Esta exploración responde a la petición de integrar visualmente el árbol: modifica la propuesta anterior de sidebar gris claro sin cambiar todavía los estilos ni las instrucciones del repositorio.

Recomiendo desarrollar esta variante integrada. Reduce la fragmentación visual y permite que el documento domine. Su principal riesgo es que navegación y contenido se confundan; la solución se debe comprobar con árboles largos, nombres extensos y foco de teclado, además del ejemplo ordenado de la maqueta.

La separación estructural sigue existiendo: árbol y documento conservan su propio desplazamiento. El cambio es visual, no una mezcla de sus interacciones. En escritorio se puede ocultar o redimensionar el árbol; el tirador y su estado de foco deben ser descubribles. No convertir todo el margen entre árbol y documento en un área de arrastre invisible.

## Vistas generadas

### Superficie integrada — revisión más reciente

![Editor con navegación y documento sobre blanco](C:/Dev/knownext.ai/output/playwright/revision-3.0/diseno-04-superficie-integrada.png)

El selector de proyecto pierde el aspecto de caja; el árbol comparte fondo con el documento. Se elimina la línea vertical continua y se conserva una selección naranja suave. El asistente está plegado y no reserva espacio inferior. Es la dirección recomendada para refinar, pendiente de elección y validación.

### Documento primero — punto de comparación

![Editor con sidebar suave y asistente plegado](C:/Dev/knownext.ai/output/playwright/revision-3.0/diseno-01-documento.png)

La primera propuesta conserva un fondo ligeramente diferente en navegación. Permite comparar cuánto ayuda ese contraste a orientarse frente a la variante integrada. Ambas mantienen pestañas compactas y una barra de edición reducida.

### Organización contextual y asistente fijado

![Selección múltiple y asistente fijado](C:/Dev/knownext.ai/output/playwright/revision-3.0/diseno-02-organizacion.png)

Tres archivos seleccionados activan las acciones del lote, mientras otro documento permanece abierto. El asistente está fijado debajo de la edición y muestra su objetivo. La adaptación a superficie blanca continua debe mantener la selección reconocible. Esta imagen ilustra dos estados para discutirlos; no implica que seleccionar archivos abra automáticamente el asistente.

### Configuración por tareas

![Ajustes habituales y opciones avanzadas](C:/Dev/knownext.ai/output/playwright/revision-3.0/diseno-03-configuracion.png)

La configuración ocupa una superficie amplia con retorno al documento, categorías verticales y controles agrupados por tarea. Las opciones avanzadas están plegadas, pero sus personalizaciones activas siguen visibles. El proveedor y los estados son ilustrativos; la interfaz real debe reflejar exclusivamente capacidades y conexiones verificadas.

## Reglas de interacción propuestas

### Editor y asistente — U04, U10, U11, U15

| Estado / acción | Comportamiento |
|---|---|
| Asistente plegado | Botón estable en la barra. El documento ocupa el espacio disponible, sin hueco reservado ni botón flotante que tape contenido. |
| Abrir | Despliega el compositor y permite escribir. La selección de texto por sí sola no lo abre. |
| Fijar | Conserva el compositor visible al trabajar. La preferencia se aplica al dispositivo. |
| Plegar | Conserva borrador y fuentes durante la sesión, devuelve el foco al editor y libera espacio. |
| Cambiar de documento | Recupera el borrador asociado a ese destino; no traslada silenciosamente la petición del anterior. |
| Trabajo en curso | Puede continuar con el panel plegado. Indicador discreto con acceso a resultado/error y destino. No reabre ni roba foco al terminar. |
| Proveedor sin configurar | El panel abierto explica el motivo y enlaza al ajuste concreto. La edición documental sigue disponible. |
| Escape | Actúa sobre la capa superior; respeta la composición de texto y devuelve el foco al origen adecuado. |

La maqueta del compositor fijado dedica todavía bastante altura a cabecera, contexto y entrada. En el siguiente refinamiento conviene agrupar esa información: objetivo inicial aproximado de 160–210 px a altura suficiente, sujeto al contenido y tamaño de texto. No imponer una altura que recorte mensajes, fuentes o acciones. Altura ajustable queda como ampliación.

Los controles deben distinguir contexto consultable y documento modificable. Los archivos seleccionados en el árbol no se adjuntan ni autorizan automáticamente. El resumen de contexto debe reflejar también recuperación local y otras fuentes efectivamente incluidas; el texto simplificado de las imágenes no es un contrato definitivo de privacidad.

### Árbol y selección múltiple — F04, F15, U02, U03

La fila activa, el foco de teclado y el conjunto seleccionado tienen señales diferentes. La maqueta utiliza marca discreta para el abierto y casillas/tinte para el lote; el prototipo deberá hacer reconocibles los tres estados también sin depender del color.

- Selección por teclado y Ctrl/Shift en escritorio; casillas temporales cuando se entra en selección múltiple. En táctil, acción explícita o pulsación larga para entrar y «Cancelar» visible para salir.
- Barra contextual con contador, «Mover a…» y «Papelera». Las acciones aparecen durante la selección, no como iconos permanentes en cada fila.
- Menú de documentos con creación/importación; el selector de proyecto mantiene sus acciones propias. No añadir un botón externo de creación junto al selector ni buscador en su cabecera.
- «Mover a…» abre un destino y un resumen del lote, con origen/destino inequívocos, colisiones visibles y acción deshabilitada cuando el destino no es válido.
- La confirmación de papelera explica el contenido real de carpetas y la recuperación disponible. La selección de un padre y un hijo se procesa una sola vez.
- Un fallo parcial conserva los elementos fallidos y explica los resultados. La selección oculta por filtros aparece en el contador y puede revisarse antes de actuar.

El estilo blanco continuo no debe borrar los límites de selección, las indicaciones de arrastre ni el foco. Las áreas táctiles y los textos largos se validarán con datos más exigentes que los de las imágenes.

### Configuración — U05, U06, U12

Cinco categorías iniciales: Apariencia y edición, Asistente y privacidad, Audio, Archivos y recuperación, Exportación. Diagnóstico permanece accesible como información especializada. «Volver al documento» restaura la posición de trabajo.

En cada sección se muestran los ajustes habituales. «Opciones avanzadas» revela controles adicionales sobre los mismos valores; no crea otro modo de configuración ni restablece opciones al plegarse. El resumen de personalizaciones lleva a sus campos.

Privacidad, coste relevante, errores y requisitos no quedan ocultos por el nivel avanzado. El alcance se indica cuando importa: dispositivo, proyecto o documento. Un perfil que cambie personalizaciones anticipa su efecto.

Autoguardado únicamente para preferencias reversibles que el contrato permita guardar de forma fiable. Estado explícito de guardando/guardado/error; una respuesta tardía no pisa una edición nueva. Credenciales, limpieza, restablecimiento y otras operaciones con consecuencias conservan su acción explícita. El control ilustrado de proveedor debe ser un valor informativo si solo hay un proveedor disponible, sin sugerir alternativas inexistentes.

## Sistema visual propuesto

| Elemento | Dirección inicial, a comprobar en prototipo |
|---|---|
| Superficie | Blanco continuo en editor y árbol; no separar con sombra o grandes bloques coloreados. |
| Color | Naranja #F37021 en acción/selección; #FFF1E8 para selección suave; texto #111827, secundario #6B7280. Comprobar contraste por estado. |
| Tipografía | Inter/sistema existente. UI 14–16 px; documento 16–18 px. La escala de las imágenes es orientativa y parece más amplia que una densidad final compacta. |
| Jerarquía | Documento, herramientas frecuentes, navegación, estados. Reducir el peso visual de metadatos y acciones secundarias. |
| Espaciado | Escala coherente basada en 4/8 px. Separar navegación y contenido con espacio; ancho del árbol orientativo 240–280 px en escritorio amplio. |
| Documento | Una columna; anchura cómoda según tipografía y zoom. Sin tarjeta de papel, borde decorativo ni sombra. |
| Iconos | Biblioteca lineal existente; etiqueta para acciones poco evidentes, nombre accesible y foco visible. |
| Bordes | Reservados para campos, agrupaciones necesarias y separación de barras. No encerrar cada bloque. |
| Estado inferior | Resumen contextual breve de protección/actividad; detalle bajo demanda. No presentar varios indicadores permanentes que vuelvan a saturar. |

Eliminar el color de fondo no obliga a eliminar todos los separadores: probar la variante sin división vertical y conservar una línea muy tenue o visible al interactuar si la orientación/redimensión lo requiere. La selección y el foco deben funcionar con zoom, alto contraste y texto largo.

## Adaptación prevista

| Superficie | Escritorio amplio | Ventana intermedia / tableta | Teléfono |
|---|---|---|---|
| Navegación | Árbol visible, ocultable, fondo integrado | Árbol ocultable; priorizar ancho de edición | Panel temporal con retorno claro al documento |
| Herramientas | Una fila con frecuentes y menús | Agrupar según espacio real disponible | Formato esencial y acceso a más acciones, sin scroll horizontal ambiguo |
| Asistente | Abierto temporal o fijado inferior | Abrir sin reducir excesivamente el documento | Superficie temporal adaptada al teclado; fijación permanente fuera del mínimo |
| Selección múltiple | Teclado, rangos y acciones contextuales | Tacto o ratón según dispositivo | Modo explícito, contador y salida accesibles |
| Configuración | Navegación vertical y formulario | Reducir columnas cuando no quepan etiquetas/campos | Lista de categorías y detalle en una columna, con vuelta clara |
| Diálogos | Contenedor acotado y una zona de scroll | Ajuste por altura además de anchura | Pantalla completa cuando la tarea/teclado lo requiera |

360/390, 768 y 1280/1440 px son tamaños de ensayo, no reglas suficientes para detectar dispositivo. Deben comprobarse teclado virtual, rotación, foco, texto ampliado y áreas seguras en Android nativo.

## Siguiente refinamiento y aceptación

La recomendación es llevar la superficie integrada a selección múltiple y configuración, y ajustar la densidad tipográfica/compositor. Antes de trasladarla al producto, contrastar los mismos recorridos con árboles extensos, nombres largos, errores y estados pendientes.

Tareas de prueba: abrir y editar; abrir/plegar/fijar IA sin perder borrador; alternar documentos sin cambiar el objetivo de la petición; seleccionar y mover varios archivos; recuperar un borrado; cambiar un ajuste habitual y localizar una personalización avanzada. Añadir crear/mover con error en ventana estrecha y navegación sin ratón.

Las maquetas acreditan una dirección visual propuesta. La preservación del contenido, la selección, el foco, el guardado y la adaptación móvil necesitan un prototipo funcional y aceptación posterior; no se han implementado ni probado por generar estas imágenes.

## Refinamiento a partir de referencias recientes — 30 de octubre de 2026

Revisión de fuentes primarias y sistemas vigentes, aplicada a la última maqueta de superficie integrada. Las recomendaciones siguientes son una interpretación para KnowNext.ai; no prueban mejoras de rendimiento de usuarios ni se han trasladado todavía a otra imagen o al código.

### Qué aportan las referencias

- [Linear, revisión del 12 de marzo de 2026](https://linear.app/now/behind-the-latest-design-refresh): reduce peso de navegación, iconos y separadores y busca posiciones predecibles para las acciones. Es una referencia pertinente para una herramienta documental con alta densidad funcional; no demuestra que el mismo fondo sea siempre superior.
- [Microsoft Design, 12 de mayo de 2026](https://microsoft.design/articles/a-simplified-system/): describe acceso persistente a IA combinado con puntos de entrada contextuales y trabajo sobre el contenido. Para KnowNext.ai interesa la continuidad del contexto, conservando apertura explícita del compositor.
- [Google Research, CHI 2026](https://research.google/pubs/usability-hasnt-peaked-exploring-how-expressive-design-overcomes-the-usability-plateau/): estudia Material 3 Expressive en tareas móviles y encuentra mejoras en su muestra. La aplicación aquí es selectiva: contraste jerárquico y acciones reconocibles. Sus resultados no permiten prometer el mismo efecto en este editor de escritorio.
- [Apple, principios de Liquid Glass presentados en WWDC25](https://developer.apple.com/videos/play/wwdc2025/219/): material y movimiento comunican capas y relaciones. Para esta aplicación se propone profundidad discreta en superficies temporales; no adoptar transparencia sobre el documento ni replicar un material propio de otro ecosistema.

### Cambios concretos propuestos sobre la última maqueta

| Prioridad | Observación de la maqueta | Refinamiento propuesto | Comprobación |
|---|---|---|---|
| Alta | El fondo está integrado, pero la navegación conserva bastante peso | Iconos de carpetas neutros, título «Documentos» en caja normal y selección como acento principal. Mantener nombres legibles. | Encontrar archivo activo y carpeta de destino con árbol largo, foco y alto contraste. |
| Alta | Título, subtítulo y apartados ocupan mucha altura | Escala inicial H1 30–32 px, H2 22–24 px, cuerpo 16–17 px e interfaz 14–15 px a escala base; preservar zoom y tamaño elegido por el usuario. | Comparar trabajo real en 1366×768 y 1440×900, sin convertir estos valores en límites de accesibilidad. |
| Alta | Varias franjas y divisiones compiten en la cabecera | Pestañas compactas y una sola barra de herramientas agrupada; conservar controles nativos. En la ruta contextual mostrar la carpeta y ofrecer ruta completa bajo demanda. | Encontrar inserción, historial y asistente sin perder espacio útil ni ubicación. |
| Alta | El naranja aparece en carpetas, selección, pestaña, botón y numeración | Reservarlo para selección/acción relevante. Botón Asistente neutro en reposo y estado activo reconocible; numeración documental neutra por defecto, salvo formato elegido. | Identificar acción/selección sin depender solo del color. |
| Alta | El tono de marca no sirve para todos los textos | Usar variantes semánticas de contraste: naranja de marca como acento y un naranja oscuro para texto pequeño sobre blanco. | Comprobar cada combinación real, incluidos hover, foco, selección y disabled. |
| Media | La interfaz depende de controles generales | Mantener formato frecuente estable y revelar herramientas específicas al trabajar con tabla/imagen/diagrama; menú contextual explícito para IA. | Las herramientas no saltan de lugar ni se abren al seleccionar texto sin intención. |
| Media | El asistente fijado de la vista anterior tiene mucha altura | Una cabecera breve con destino/fijación, entrada que crece y fuentes bajo demanda. El estado de tarea permanece accesible al plegarlo. | No ocultar el cursor, perder el borrador ni cambiar el objetivo al alternar pestañas. |
| Media | La captura no muestra continuidad de las transiciones | Aperturas/cierres breves y coherentes; un rango inicial de 120–180 ms es una hipótesis de prototipo. Respetar movimiento reducido y conservar posición de lectura. | Sin saltos de contenido, animaciones repetitivas ni retraso artificial en respuesta al teclado. |
| Media | Todo sobre blanco puede hacer ambiguas las capas temporales | Menús y diálogos opacos con borde o sombra muy tenue; foco claro. Mantener fondo integrado en superficies de trabajo permanentes. | Reconocer qué capa recibe teclado y dónde se vuelve al cerrarla. |
| Alta | La maqueta limpia oculta situaciones exigentes | Probar veinte pestañas, nombres largos, cientos de archivos, operaciones pendientes y error de guardado con el mismo sistema visual. | La claridad se conserva con contenido realista, no solo en la pantalla preparada para presentación. |

Las medidas son propuestas para el siguiente prototipo, no una medición de los píxeles de la imagen generada. [Fluent 2: tipografía](https://fluent2.microsoft.design/typography) sirve como referencia de escala y jerarquía; [toolbar](https://fluent2.microsoft.design/components/web/react/core/toolbar/usage) orienta agrupación y desbordamiento con etiquetas; [movimiento](https://fluent2.microsoft.design/motion) vincula las transiciones con cambios comprensibles de estado. No se propone sustituir Tailwind/Milkdown ni adoptar otro framework.

### Contraste comprobado sobre los colores definidos

Se calculó contraste de luminancia relativa para colores opacos, sin deducirlo de la captura generada:

| Combinación | Relación aproximada | Uso propuesto |
|---|---|---|
| #F37021 sobre blanco | 2,94:1 | Acento de marca; evitar texto pequeño o único indicador necesario con esta combinación. |
| #D85A12 sobre blanco | 3,90:1 | No alcanza por sí solo 4,5:1 para texto normal. |
| #B54708 sobre blanco | 5,43:1 | Candidato de naranja oscuro para texto normal; validar también el fondo de selección. |
| #111827 sobre #F37021 | 6,04:1 | Candidato para texto sobre un botón de naranja de marca. |

Estas cifras solo comprueban las parejas indicadas. La accesibilidad completa necesita foco, semántica, dimensiones, zoom, teclado y estados, además del contraste. No se presenta el blanco sobre naranja de marca como una combinación válida para texto normal.

### Decisión recomendada para el siguiente diseño

Conservar el fondo continuo y avanzar hacia una interfaz compacta, con tipografía equilibrada, acento selectivo, cabecera más ligera y herramientas contextuales. Prototipar primero escala/cabecera/contraste; comprobar después asistente, lotes y configuración con estados reales. La expresividad se concentra en selección, respuesta a acciones y transiciones discretas. Los grandes efectos de cristal, animaciones elásticas y paneles flotantes permanentes no aportan una ventaja demostrada al trabajo documental de esta aplicación.
