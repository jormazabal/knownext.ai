# KnowNext.ai 3.0 · Estudio de usabilidad de Taller esencial

Fecha: 30 de octubre de 2026. Base revisada: versión 2.6.0, commit b6ef84c7. Dirección elegida por el usuario: opción 1, **Taller esencial**. Estado: estudio y especificación propuesta; no implementación ni aceptación de una versión 3.0.

## Dictamen

La dirección elegida es adecuada para una herramienta documental: integra navegación y documento, reduce el ruido y devuelve protagonismo al contenido. Debe convertirse en un sistema completo de interacción. La imagen por sí sola no resuelve selección, seguridad de operaciones, accesibilidad, configuraciones, trabajo simultáneo ni pantallas pequeñas.

Recomiendo conservar el fondo continuo, la composición asimétrica, la tipografía sobria y el acento cálido. Corregiría la escala excesiva de la maqueta, las viñetas coloreadas, la repetición del nombre del documento y la ausencia de varios accesos existentes. El objetivo es una aplicación compacta que facilite trabajar durante horas.

La prioridad de 3.0 debe ser **claridad operativa y control del usuario**: saber dónde está, qué está modificando, qué se ha guardado, qué se enviará a la IA y cómo recuperarse de un error.

## 1. Alcance, método y límites

Se ha contrastado la propuesta con componentes, servicios y contratos del repositorio; recorrido la aplicación compilada; inspeccionado capturas actuales; probado teclado en diálogos; medido dimensiones y estilos; y calculado contraste de los tokens de las doce paletas en claro y oscuro.

La revisión visual se ejecutó en el perfil web-dev mediante la compilación de producción servida localmente. Se creó un proyecto de prueba con un Markdown y una nota manuscrita. Se revisaron tamaños 1440 × 900, 834 × 1112 y 390 × 844. Se conservaron 23 capturas; la captura móvil 09 se repitió tras terminar la transición de navegación.

**Comprobado en esta sesión:** crear proyecto y documentos de prueba, edición visual, guardado mediante teclado, cierre con cambios, menús de archivo, diálogo de mover, adaptación del editor, apertura de las ocho áreas de ajustes, contexto IA, inserción de diagramas, notas personales y apertura de una libreta.

**Analizado por código, sin aceptación nativa:** Git e historial real, cambios externos, archivos reales y conversiones, recuperación persistente, proveedor IA, investigación, audio, lápiz físico, actualizaciones y Android. El error de Audio y el 404 de Skills observados corresponden a limitaciones del perfil web-dev; no prueban defectos del producto nativo. No se han enviado prompts a proveedores ni hecho operaciones destructivas en proyectos del usuario.

El build TypeScript/Vite pasó. Esto acredita compilación, no usabilidad, conformidad WCAG ni funcionamiento nativo. No se han realizado sesiones con usuarios, lector de pantalla, hardware táctil/lápiz o teclado virtual Android. Las mejoras y métricas siguientes son hipótesis y criterios de aceptación pendientes.

Entregables asociados:

- [Matriz funcional](revision-3.0-cobertura-funcional.csv): inventario trazable y tratamiento de cada capacidad.
- [Contraste calculado](../../output/playwright/revision-3.0/estudio-usabilidad/contraste.csv) y [script reproducible](../../output/playwright/revision-3.0/estudio-usabilidad/contraste.py).
- [Evidencias](../../output/playwright/revision-3.0/estudio-usabilidad/evidencias.md).
- [Dirección visual elegida](../../output/playwright/revision-3.0/sintesis-bauhaus/01-taller-esencial.png).

## 2. Hallazgos actuales y consecuencias para 3.0

Prioridad P0: impide una operación esencial o compromete control/recuperación. P1: fricción frecuente o barrera de acceso. P2: optimización. La prioridad se refiere a resolver antes de aceptar el rediseño; no constituye autorización para modificar el producto.

| ID | Hallazgo y evidencia | Consecuencia | Respuesta en Taller esencial | Prioridad |
|---|---|---|---|---|
| H01 | El botón flotante Grabaciones interceptó el clic en Guardar; Playwright agotó el intento indicando esa intercepción. Guardar con Enter sí funcionó. Captura 05; App.tsx:4637. | Una función secundaria bloquea guardar. | Integrar Grabaciones en la cabecera; reservar espacio para indicadores de sesión, sin cubrir controles. | P0 |
| H02 | Crear documento mide 420 px en viewport de 390 px. Captura 04 y métricas DOM; CreateDocumentDialog.tsx:63. | Parte del formulario queda fuera de pantalla. | Diálogo fluido con margen mínimo y desplazamiento vertical; en móvil, superficie de tarea completa. | P0 |
| H03 | Tras los controles de Crear documento, Tab alcanza BODY y los botones de ventana del fondo. Escape no cerró Crear ni Ajustes. Ajustes abrió conservando foco en el menú anterior. | El usuario de teclado puede perder el contexto y activar el fondo. | Componente modal común: entrada, contención, Escape, retorno de foco e inert del fondo. | P0 |
| H04 | Blanco sobre naranja #F37021 = 2,937:1; Guardar usa 11 px. | El texto activo no alcanza el contraste requerido. | Terracota funcional más oscura; conservar naranja de marca solo donde el contraste lo permita. | P1 |
| H05 | Fila del árbol de 24 px, div sin rol treeitem ni tabIndex; flecha de carpeta de 16 × 20 px. Existen botones de menú accesibles, pero no una navegación completa del árbol. | Abrir y seleccionar elementos con teclado resulta inconsistente. El tacto requiere evaluación de áreas y separación. | Árbol semántico, foco único, flechas, Enter, selección explícita y áreas táctiles de 44 px como objetivo de diseño. | P1 |
| H06 | Menú actual de archivo permite mover, duplicar y eliminar un elemento. La selección principal es singular. | Organizar muchos archivos repite trabajo. | Selección múltiple con contador, alcance explícito, resultado por elemento y recuperación. | P1 |
| H07 | delete_node usa remove_file/remove_dir_all en Rust. | Una etiqueta Papelera prometería una recuperación inexistente en esa ruta. | Diseñar recuperación real antes del borrado masivo; si no existe, declarar eliminación definitiva y alcance. | P0 para borrado masivo |
| H08 | Compositor IA visible aunque no haya clave, también sobre la libreta. Capturas 05, 09 y 23. | Ocupa espacio sin ayudar a la tarea activa. | Asistente cerrado por defecto, apertura explícita, modo temporal o fijado y persistencia del borrador de sesión. | P1 |
| H09 | Cuerpo de documento y controles pequeños; 11 px en la base revisada. La maqueta tiene el extremo contrario, con título y texto sobredimensionados. | Fatiga o pérdida de densidad útil. | Escala definida y dos densidades; evaluar con documentos extensos, no con una portada. | P1 |
| H10 | Ajustes agrupa ocho pestañas; en 390 px la navegación exige desplazamiento horizontal. Abundan tarjetas dentro de tarjetas. | Descubrimiento difícil y excesivo esfuerzo de lectura. | Categorías verticales en escritorio, lista y detalle en móvil; básicos y avanzados dentro de cada categoría. | P1 |
| H11 | Notas personales usa casi la misma superficie que documentos, con autoguardado propio. | Puede confundirse destino, pertenencia y forma de guardado. | Nombre persistente “Notas personales · Este dispositivo”; separar su estado de los archivos del proyecto. | P1 |
| H12 | Menús, diálogos y superficies auxiliares tienen patrones dispares. La tabla de cambios externos establece 900 px mínimos. | Las mejoras aisladas no garantizan coherencia ni uso móvil. | Familias comunes de componentes; lista/detalle de cambios en estrecho. | P1 |
| H13 | La pantalla inicial dedica mucho espacio a notas de versión; faltan proyectos. | La primera tarea compite con información secundaria. | Inicio con Crear/Abrir proyecto; novedades resumidas y consultables. | P2 |
| H14 | El producto aplica automáticamente operaciones IA validadas; las maquetas anteriores muestran aprobación permanente. Hay además documentación desactualizada sobre investigación. | El diseño podría alterar el modelo mental y prometer capacidades incorrectas. | Conservar aplicación validada con deshacer; revisión para operaciones bloqueadas/obsoletas; textos derivados de capacidades reales. | P1 |

El borde #E5E7EB es válido como decoración suave; no basta cuando constituye la única señal que permite reconocer un control. No todos los bordes tenues son un incumplimiento. Tampoco toda fila de 24 px incumple tamaño de objetivo: deben comprobarse área activable, separación y excepciones.

## 3. Qué conservar y qué corregir de la opción 1

| Elemento | Decisión | Motivo y límite |
|---|---|---|
| Fondo común de árbol y documento | Conservar | La agrupación se obtiene con alineación, sangría, proximidad y peso tipográfico. |
| Ausencia de divisores estructurales | Conservar | No dibujar cajas alrededor de cada región. Sí usar límites funcionales en inputs, selección, foco y modales. |
| Tipografía negra y geométrica | Conservar con escala menor | Identidad editorial sin convertir cada documento en una pieza publicitaria. |
| Acento terracota | Refinar por contraste | Color reservado a acción, foco y selección; no colorear todas las viñetas o carpetas. |
| Gran encabezado de marca | Reducir | Debe dejar espacio a nombre de proyecto, documento y herramientas. No rediseñar el logotipo dentro de este estudio. |
| Pestañas ligeras | Conservar | Activa por peso y marcador; cierre accesible, cambios pendientes y menú de abiertos. |
| Ruta + pestaña + H1 | Simplificar | Ruta de carpeta y nombre en pestaña; el H1 pertenece al contenido y puede ser diferente del archivo. No inventar un H1 obligatorio. |
| Barra “Texto, B, I, Enlace, Lista, Insertar” | Conservar como núcleo | Las funciones menos frecuentes se agrupan sin perder acceso por teclado. |
| Asistente cerrado | Conservar | Debe seguir mostrando actividad, incidencias y resultado pendiente aunque esté oculto. |
| Accesos omitidos en la imagen | Restituir | Notas, conversación IA, Grabaciones, recuperación, sincronización y ayuda siguen necesitando rutas claras. |

La forma se empleará con significado: círculo para actividad; cuadrado o marca para selección; trazo o subrayado para pestaña activa. No añadir grandes figuras decorativas alrededor del documento. Un estado no dependerá únicamente de esa forma o de su color.

## 4. Arquitectura de información propuesta

**Cabecera de aplicación:** marca compacta; selector de proyecto con sus acciones internas; Buscar; acceso Asistente; utilidades (Notas personales, Grabaciones, Configuración y ayuda). Los controles nativos de ventana conservan su zona. Historial y Exportar pasan a las acciones del documento: su destino debe quedar inequívoco.

**Biblioteca izquierda:** nombre de sección, Crear/Importar, Seleccionar y árbol. Sin caja de búsqueda permanente en su cabecera y sin un botón más junto al selector de proyecto. La búsqueda existente se hace más visible desde Buscar; el alcance inicial será nombres del proyecto. Buscar dentro del texto o de todos los proyectos debe presentarse como capacidades adicionales, no como algo ya existente.

**Área central:** documentos abiertos, ruta de carpeta discreta, herramientas contextuales y editor de una columna. Markdown, libreta, imagen y referencia cambian las herramientas, no la estructura general de navegación.

**Zona auxiliar temporal:** asistente, historial o inspector, uno por vez salvo comparación expresamente iniciada. Cambiar de auxiliar conserva el estado del anterior. En pantallas estrechas se abre como vista con volver; no comprime el texto hasta hacerlo ilegible.

**Estado de trabajo:** guardado local junto al documento; sincronización en el contexto del proyecto; grabación activa visible globalmente. Mostrar una frase precisa ante un fallo, en lugar de un “OK” global que oculte estados distintos.

El botón Asistente abre la ayuda contextual; “Conversaciones” dentro de esa zona permite llegar a la vista IA existente. No mantener dos entradas visualmente iguales que conduzcan a comportamientos distintos.

## 5. Recorridos principales y reglas de interacción

### 5.1 Crear, encontrar y abrir

Crear muestra siempre proyecto y carpeta destino, inicialmente calculados con la regla contextual existente. Cambiar destino no obliga a cancelar. Nombre, tipo y plantilla son suficientes para empezar; detalles adicionales se despliegan.

Propuesta a validar: un clic abre un archivo; la flecha expande una carpeta. Al activar Seleccionar, clic o toque marca filas y deja de abrir archivos. Evita depender del doble clic en móvil, pero modifica un hábito actual y requiere prueba con usuarios frecuentes.

Navegación de teclado: flechas recorren/expanden, Inicio/Fin extremos, Enter abre, Espacio selecciona en modo selección, Shift extiende y Ctrl alterna. El foco y el documento abierto son estados diferentes. Las acciones de fila aparecen en hover, focus y menú contextual; en táctil hay un acceso explícito. El patrón se contrastará con [WAI-ARIA Tree View](https://www.w3.org/WAI/ARIA/apg/patterns/treeview/).

Con muchos documentos abiertos, mantener visibles activo y recientes; lista de abiertos accesible por nombre. Cerrar una pestaña sucia conserva el diálogo Guardar/Descartar/Cancelar. Volver de una tarea auxiliar restaura selección y posición de lectura.

### 5.2 Organizar varios archivos

Secuencia propuesta: Seleccionar → marcar archivos/carpetas → “7 elementos seleccionados” → Mover/Duplicar/Exportar/Eliminar según compatibilidad → revisar destino/alcance → resultado.

- Distinguir selección parcial de carpeta y selección de toda la carpeta. Si se selecciona carpeta y descendiente, ejecutar una sola vez por raíz.
- Al filtrar, mantener un contador de elementos seleccionados fuera de la vista y permitir revisarlos. “Seleccionar todo” debe declarar si afecta a resultados o al proyecto.
- Bloquear mover una carpeta a sí misma o a un descendiente. Resolver colisiones por nombre con opciones concretas y sin sobrescritura silenciosa.
- Antes de mover archivos abiertos o sucios, resolver su guardado y conservar identificadores, pestañas y referencias.
- Validar enlaces relativos e imágenes afectadas. La operación no termina al mover una ruta: debe informar de referencias que no pudo actualizar.
- En operaciones mixtas, mostrar acciones comunes o explicar incompatibilidades. No aplicar una acción a algunos elementos silenciosamente.
- Para operaciones largas: progreso, resultado por elemento, reintentar solo fallidos y cancelación entre pasos seguros. No prometer atomicidad si el runtime no la ofrece.
- Eliminar requiere mostrar carpetas, descendientes y alcance. La papelera y deshacer persistente serían trabajo funcional nuevo. Su recuperación debe incluir archivos sin historial y recursos adjuntos.

La selección múltiple existente en cambios de sincronización no sustituye la selección múltiple del árbol. Se reutilizará su lenguaje cuando sea compatible.

### 5.3 Escribir y guardar

La barra mínima incluye bloque, negrita, cursiva, enlace, listas, Insertar y Deshacer/Rehacer; formato menos habitual se agrupa en Más formato. Tablas, imágenes y Mermaid siguen editables. El código Markdown es una vista secundaria explícita.

Escala inicial propuesta: interfaz 14 px; información secundaria 12–13 px; cuerpo 16 px y altura de línea 1,55; H1 30–34 px, H2 22–26 px. Ancho legible de aproximadamente 65–85 caracteres, con tablas y diagramas que puedan ocupar más ancho. Es una hipótesis para validar, no una imposición sobre estilos de exportación.

Distinguir “Cambios sin guardar”, “Guardando”, “Guardado en este equipo”, “Error al guardar” y “Borrador recuperable”. Un borrador recuperable no equivale a archivo guardado ni a versión creada. En error: conservar contenido, explicar causa y ofrecer Reintentar y Guardar copia si resulta viable.

La zona inferior no puede cubrir la última línea, la selección o Guardar. Su espacio se reserva en el flujo. Ocultar interfaz para concentrarse debe tener salida visible y restaurar el estado anterior.

### 5.4 Usar IA con control del espacio y del destino

Tres estados del asistente: **cerrado**, **abierto temporalmente** y **fijado**. Fijar mantiene visible la ayuda durante la sesión; cerrar no envía, no descarta texto y no cancela una operación. Cancelar ejecución es una acción separada, con su alcance real explicado.

El compositor crece hasta un máximo razonable y después desplaza su contenido. En escritorio puede ocupar un margen auxiliar; cuando no hay ancho, se transforma en vista temporal. Cambiar el diseño no autoriza a persistir prompts nuevos: conservación en memoria y cualquier historial deben respetar las reglas de privacidad existentes.

Siempre visibles antes de enviar: destino (documento, selección, notas o proyecto), fuentes adjuntas, modo rápido/razonamiento y si interviene una capacidad con conexión externa. Cambiar de documento con un prompt escrito debe hacer evidente el cambio de destino; si hay selección o anexos asociados, se conserva el destino original hasta que el usuario lo cambie.

Estados: sin configurar, listo, preparando contexto, ejecutando, cancelando, completado, aplicado, parcialmente aplicado, bloqueado, sin conexión y error. Ocultar el asistente mantiene un indicador de actividad y una notificación discreta de resultado.

El código actual intenta aplicar operaciones estructuradas y deja bloqueadas las no válidas. Se conserva esa experiencia: “Cambios aplicados · Ver cambios · Deshacer”. Si el documento cambió entretanto o el anclaje es ambiguo, mostrar la parte pendiente y su causa. Un botón Aplicar para todo resultado sería una decisión funcional nueva, no una consecuencia estética.

La investigación, generación de imágenes, visión y dictado deben distinguirse por propósito y consumo. No atribuir acceso web al modo razonamiento sin el contrato real. Coste y documentos enviados son información básica; los límites técnicos pueden ser avanzados. No hacer invisible una operación que continúa consumiendo recursos.

### 5.5 Versiones, sincronización y recuperación

Historial pertenece al documento; sincronización pertenece al proyecto. La vista de historial muestra versiones, fecha, descripción, previsualización y restauración explícita. Restaurar no debe destruir los cambios actuales sin resolverlos. No se exponen ramas Git.

Estados independientes: sin versionado, versión local pendiente, guardado local, sincronización pausada, sin conexión, enviando, error y conflicto. Un fallo remoto no convierte un guardado local correcto en pérdida de datos.

La revisión de cambios externos distingue diferencias, procedencia y efectos de cada resolución. En móvil, lista de archivos y detalle de uno cada vez; no reducir una tabla de 900 px hasta que resulte inutilizable. Un conflicto requiere conservar ambas variantes hasta resolverlo.

Borradores recuperables merece acceso desde el estado del documento y Configuración/Datos; no depender exclusivamente del menú de cuenta. Mostrar origen, fecha y destino antes de restaurar.

### 5.6 Notas, manuscrito, medios y referencias

Notas personales debe indicar ámbito y autoguardado, conservar su acceso aunque no haya proyecto, y no adoptar silenciosamente el destino del proyecto activo.

La libreta conserva su superficie paginada: páginas, lápiz, borrador, lazo, zoom y plantillas. El panel de páginas se oculta de forma controlada; herramienta, grosor y color activos siempre identificables. Menús con 44 px táctiles como objetivo. El trazo puede requerir movimiento continuo; cambiar de página, mover selecciones o ajustar zoom necesita controles alternativos. Exportar una página y toda la libreta son decisiones distintas.

Imágenes: visor con ajustar, zoom, descripción, dimensiones y opciones de insertar/exportar. Referencias PDF/DOCX/XLSX: etiqueta “Solo lectura”, navegación de páginas/hojas, búsqueda y aviso cuando la extracción sea parcial. No simular edición de formatos que solo se previsualizan.

Diagramas: catálogo y vista previa como punto de entrada; código Mermaid disponible para editar. La pantalla actual favorece el código y tres columnas. Propuesta de diseño: plantilla/propiedades y previsualización, con código desplegable. Un editor gráfico de nodos sería una capacidad nueva; no se presupone en 3.0.

### 5.7 Audio y trabajo prolongado

Grabaciones se integra en utilidades. Una sesión activa mantiene un indicador con duración, estado y acceso a Pausar/Parar, sin superponerse a otras acciones. Dictar al prompt y grabar una reunión permanecen distintos.

Explicar qué entrada se graba y dónde quedará la transcripción. En el flujo general, elegir destino al parar no debe descartar la sesión si se cancela. Mantener recuperación de sesiones, errores de micrófono, permisos, falta de espacio y transcripción fallida.

El panel puede cerrarse sin detener la grabación, si ese es el comportamiento real, pero debe decirlo. En Android se comprobarán permisos, segundo plano y notificación; en Windows, bandeja y miniventana. No se prometen atribución de hablantes ni funciones de audio ausentes.

## 6. Configuración sencilla y avanzada

Reorganizar por tareas: **Apariencia y lectura; Escritura y exportación; IA y privacidad; Audio; Proyectos y datos; Acerca de y diagnóstico**. Cada categoría tiene un resumen útil y “Opciones avanzadas”. No duplicar valores entre dos pantallas que puedan divergir.

| Categoría | Vista sencilla | Avanzado | Siempre visible |
|---|---|---|---|
| Apariencia y lectura | Tema, idioma, tamaño y densidad | Paletas adicionales y ajustes especializados | Vista previa real y restaurar valores |
| Escritura y exportación | Plantilla, formato de página y estilo | Márgenes, niveles H1–H6, resolución y detalles | Diferencia entre aspecto del editor y documento exportado |
| IA y privacidad | Conexión, modelo recomendado, capacidades habilitadas | Modelos por tarea, costes, presupuestos, RAG y skills | Qué sale del equipo, conexión externa y consumo |
| Audio | Micrófono, prueba de nivel, destino y conservación | Parámetros soportados y comportamiento del dispositivo | Grabando/pausado, entrada activa, retención y permisos |
| Proyectos y datos | Ubicación, borradores, sincronización | Índice local y mantenimiento | Efecto y alcance de borrar/restaurar |
| Acerca de y diagnóstico | Versión, actualizaciones y estado | Trazas, detalle técnico y copia de diagnóstico | Error vigente y siguiente acción |

Ajustes de proyecto se abren desde el selector/proyecto y se rotulan “Este proyecto”. Ajustes globales indican “Este dispositivo”. La persona no debe averiguar por ensayo qué ámbito está cambiando.

En móvil: lista de categorías → detalle → volver, conservando desplazamiento. Los campos técnicos mantienen etiquetas, unidades, límites y errores próximos al campo. Las acciones delicadas no se esconden tras un nombre ambiguo. Una búsqueda de ajustes sería útil, pero es una mejora nueva.

## 7. Contraste y sistema visual

El cálculo usa luminancia relativa sRGB, sin muestreo de capturas. Se evalúan valores sin redondear; el CSV muestra tres decimales. Referencia para texto normal: 4,5:1; texto grande: 3:1. El tamaño grande tiene una definición específica, no basta con “parecer grande”. [WCAG 2.2: contraste de texto](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).

Los límites o estados visuales necesarios para identificar controles deben alcanzar 3:1 frente a colores adyacentes; las líneas decorativas no tienen la misma obligación. [WCAG 2.2: contraste no textual](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html).

| Uso | Actual o propuesta | Relación | Dictamen del par |
|---|---|---:|---|
| Botón naranja actual | Blanco / #F37021 | 2,937:1 | Insuficiente para texto normal |
| Hover naranja actual | Blanco / #D85A12 | 3,895:1 | Insuficiente para texto normal |
| Texto secundario actual | #6B7280 / blanco | 4,834:1 | Cumple el par opaco; revisar opacidades reales |
| Borde suave actual | #E5E7EB / blanco | 1,238:1 | Solo decorativo cuando otra señal identifica el control |
| Foco naranja actual opaco | #FB923C / blanco | 2,263:1 | Revisar foco |
| Botón naranja en tema oscuro | Blanco / #FB923C | 2,263:1 | Cambiar primer plano |
| Texto principal propuesto | #17191C / blanco | 17,614:1 | Cumple |
| Texto secundario propuesto | #63666C / blanco | 5,757:1 | Cumple |
| Acción terracota propuesta | Blanco / #A64125 | 6,169:1 | Cumple |
| Hover terracota propuesto | Blanco / #87351F | 8,206:1 | Cumple |
| Borde funcional propuesto | #7B8088 / blanco | 3,973:1 | Cumple |
| Selección propuesta | #A64125 / #FFF1E8 | 5,581:1 | Cumple para texto |
| Acción en oscuro propuesta | #211812 / #F2A080 | 8,401:1 | Cumple |

Tokens adicionales en oscuro: superficie #191A1D, texto #F3F4F6, secundario #B0B4BC, borde funcional #858B95 y selección #38251F. Se conserva el espacio integrado también en oscuro.

El relleno claro de selección es demasiado sutil para constituir su única señal. Añadir marca, peso y estado accesible. Los enlaces en contenido llevan subrayado; éxito, aviso y error incorporan icono y texto. Foco visible con contorno opaco, separación del control y contraste comprobado frente a cada superficie real.

Se calcularon 168 pares de tokens actuales (12 paletas × 2 temas × 7 usos) y 16 pares propuestos. Las combinaciones de foco al 58% son escenarios explícitos sobre superficie, no medición de todos los componentes. El resultado no certifica la interfaz ni valida todavía imágenes, diagramas, resaltados, placeholder, selección de texto, estados deshabilitados o colores del contenido importado.

Las paletas adicionales deben ofrecer variantes accesibles por función; cambiar un único “color principal” para todo no garantiza contraste. El terracota es una especificación propuesta para el prototipo, no una modificación ya hecha de los tokens de marca del proyecto.

## 8. Tamaños, dispositivos y accesibilidad

| Contexto | Composición propuesta | Reglas |
|---|---|---|
| Ventana amplia, aproximadamente ≥1200 px | Biblioteca 220–260 px, documento; auxiliar opcional | Si el documento pierde ancho legible, ocultar temporalmente biblioteca o usar auxiliar superpuesto |
| Intermedia, aproximadamente 768–1199 px | Documento prioritario; biblioteca plegable | Como máximo una región auxiliar; herramientas de menor frecuencia agrupadas |
| Estrecha, aproximadamente 320–767 px | Una tarea por vista | Biblioteca, ajustes, revisión y asistente con volver; barra esencial; zonas táctiles cómodas |
| Lápiz/tablet | Libreta y herramientas contextuales | Posición de mano, orientación, presión, zoom y rechazo de palma se prueban en hardware |
| Zoom del sistema/texto | Reflujo por espacio disponible | No mantener columnas solo porque la pantalla física sea grande |

Los puntos de corte son iniciales, sujetos al contenido. A 390 px el editor actual sí refluye después de la transición; el fallo confirmado es el diálogo de crear. La propuesta debe verificarse además a 320 CSS px y a 200/400% de zoom, sin desplazamiento horizontal en formularios; tablas y diagramas pueden necesitar navegación bidimensional localizada. [WCAG: reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html).

Objetivo de diseño: controles de 32–36 px en puntero preciso, 44 px en táctil; suficiente separación. WCAG AA establece 24 × 24 CSS px o las excepciones previstas, no una obligación universal de 44 px. [WCAG: tamaño mínimo](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html).

Modal común: etiqueta accesible, foco inicial útil, contención, cierre por Escape cuando corresponda y devolución al origen. Si hay cambios, Escape puede iniciar la protección; nunca perderlos silenciosamente. [APG: modal](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/).

El foco no quedará tapado por barras o ventanas auxiliares; comprobar especialmente última línea del documento, compositor, teclado virtual y estados flotantes. [WCAG: foco no oculto](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html). Arrastrar archivos o redimensionar tendrá alternativa mediante controles; dibujar a mano tiene particularidades diferentes. [WCAG: movimientos de arrastre](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html).

Añadir anuncios accesibles breves de guardado/error/selección, sin leer cada token de IA. Respetar reducción de movimiento, alto contraste del sistema, nombres largos, traducción ES/EN y escalado de fuente. Eliminar separadores no debe eliminar regiones semánticas.

## 9. Estados que el prototipo debe representar

| Familia | Estados mínimos | Información y recuperación |
|---|---|---|
| Proyecto | Ninguno, cargando, abierto, ruta ausente, permiso denegado | Abrir/crear, localizar de nuevo o reintentar sin descartar datos |
| Documento | Vacío, editando, guardando, guardado, fallo, externo cambiado | Estado local explícito y contenido conservado |
| Árbol | Vacío, filtrado, cargando, selección múltiple, parcial, operación fallida | Alcance y resultados por elemento |
| Asistente | Cerrado, temporal, fijado, ejecutando, aplicado, parcial, error | Destino, actividad, cancelar y deshacer cuando exista |
| Historial/sync | Sin historial, disponible, offline, pausado, conflicto | Local separado de remoto; protección antes de restaurar |
| Importar/exportar | Preparación, progreso, incompatible, parcial, éxito, error | Formato, destino y limitaciones; acceso al resultado |
| Grabación | Preparada, grabando, pausada, finalizada, transcribiendo, fallida, recuperable | Entrada, duración, destino y audio conservado según política |
| Referencia | Lista, renderizando, extracción parcial, no compatible | Solo lectura y alternativa para abrir original |
| Ajustes | Cargando, guardado, inválido, pendiente, fallo | Evitar “Configuración guardada” si la última operación no lo está |
| Actualización | Disponible, descargando, verificando, pendiente, fallo | Preservar trabajo antes de reiniciar y no interferir con grabación |

## 10. Priorización y dependencias

| Línea | Valor | Complejidad relativa | Dependencia | Recomendación |
|---|---|---|---|---|
| Componentes accesibles, foco y reflujo | Muy alto | Media | Inventario de diálogos | Base de 3.0 |
| Tokens de contraste y tipografía | Muy alto | Media | Pruebas claro/oscuro y densidad | Base de 3.0 |
| Lienzo integrado y navegación | Alto | Media | Estados de foco/selección | Base de 3.0 |
| Asistente plegable/fijable | Muy alto | Media-alta | Conservación de sesión y destinos | Base de 3.0 |
| Selección múltiple y operaciones | Muy alto | Alta | Contratos Rust, colisiones y referencias | Base funcional por etapas |
| Recuperación de eliminación | Muy alto | Alta | Almacenamiento, recursos y retención | Antes de borrado masivo recuperable |
| Estados local/borrador/historial/remoto | Muy alto | Alta | Contratos de guardado y recuperación | Base de 3.0 |
| Ajustes sencillos/avanzados | Alto | Media-alta | Agrupación y ámbitos | Base de 3.0 |
| Audio, libreta y visores en el sistema común | Alto | Alta | Aceptación nativa | Cobertura obligatoria, no rediseño cosmético tardío |
| Búsqueda global de contenido y comandos | Medio-alto | Alta | Índices, permisos, resultados | Evaluar después del núcleo; nombre actual ya existe |
| Editor gráfico de diagramas | Potencial alto | Muy alta | Modelo gráfico reversible | Línea futura; no necesaria para adoptar la estética |
| Favoritos/recientes/papelera avanzada | Medio | Media-alta | Persistencia y reglas reales | Priorizar con uso; no poblar navegación con funciones ficticias |

No doy horas precisas sin descomponer contratos y prototipar los flujos de riesgo. “Cambiar el aspecto” y “añadir recuperación” tienen costes y riesgos muy distintos.

Orden propuesto: 1) componentes y estados; 2) prototipo de escritura/asistente; 3) organización y recuperación; 4) ajustes y superficies especializadas; 5) aceptación nativa. La estética se verifica en cada paso.

## 11. Plan de contraste con usuarios y aceptación

Primera ronda formativa propuesta: 6–8 participantes, combinando usuarios habituales y nuevos, documentación intensiva, organización de proyectos y uso móvil/lápiz. Incluir personas que utilicen teclado o ampliación. No presentarlo como muestra estadística representativa.

Comparar la aplicación actual con el prototipo elegido usando tareas equivalentes y alternando el orden para reducir aprendizaje. No pedir solo “qué diseño gusta más”. Registrar éxito sin ayuda, errores, retrocesos, tiempo, acciones, facilidad percibida y explicación del estado final.

| Prueba | Tarea y condición | Criterio de aceptación propuesto |
|---|---|---|
| T01 | Crear proyecto local sin GitHub | Entender que no requiere cuenta; llegar a documento vacío |
| T02 | Crear en carpeta anidada desde archivo activo | Predecir y verificar destino sin mover después |
| T03 | Encontrar archivo entre 500 nodos, seis niveles y nombres largos | Abrir correcto sin ocultar la ruta completa accesible |
| T04 | Recorrer árbol solo con teclado | Abrir, expandir, seleccionar y usar menú sin ratón |
| T05 | Trabajar con 15 pestañas, dos sucias | Identificar activa, pendientes y cerrar sin pérdida |
| T06 | Editar documento de 20 páginas con tabla e imagen | Posición/cursor estables; barra no oculta contenido |
| T07 | Provocar fallo de guardado en entorno desechable | Conservar texto y recuperar mediante acción explícita |
| T08 | Reiniciar con borrador pendiente | Recuperar contenido identificando versión y destino |
| T09 | Abrir, escribir, fijar, ocultar y reabrir IA | Mantener prompt de sesión sin envío accidental |
| T10 | Cambiar documento con prompt preparado | Reconocer destino antes de enviar |
| T11 | Aplicación IA válida y anclaje obsoleto | Distinguir aplicado/pendiente; deshacer con resultado comprobable |
| T12 | Operación IA larga, cerrar auxiliar y cancelar | Identificar actividad y efecto real de cancelar |
| T13 | Seleccionar carpeta y descendiente con filtro activo | No duplicar operaciones; conocer seleccionados ocultos |
| T14 | Mover lote con colisiones y enlaces relativos | Resolver por elemento y verificar referencias |
| T15 | Eliminar y recuperar archivos sin historial y adjuntos | Recuperación completa si se ofrece; sin promesas falsas |
| T16 | Sincronización offline y posterior conflicto | Distinguir guardado local de envío remoto |
| T17 | Restaurar versión con cambios pendientes | Proteger trabajo y recuperar intención correcta |
| T18 | Abrir referencia extensa y parcialmente compatible | Reconocer solo lectura y contenido no disponible |
| T19 | Exportar PDF/DOCX con tabla, imagen y Mermaid | Resultado legible, limitaciones comunicadas y archivo localizable |
| T20 | Crear diagrama válido y corregir sintaxis inválida | Previsualización comprensible y fuente preservada |
| T21 | Escribir en Notas y pasar a proyecto | Explicar ámbito y autoguardado sin confusión |
| T22 | Libreta con lápiz: páginas, lazo, borrar, deshacer, exportar | Trazo estable; controles no interfieren con mano |
| T23 | Grabar, pausar, cerrar panel y cambiar entrada | Saber si sigue grabando y qué entrada captura |
| T24 | Fallo de transcripción y cancelación de destino | Sesión recuperable conforme a política |
| T25 | Configurar IA, revisar privacidad y límite de coste | Encontrar lo esencial sin abrir controles técnicos innecesarios |
| T26 | Cambiar formato de exportación y restablecer | Diferenciar estilo de editor y salida |
| T27 | Crear/Mover/Ajustes a 320/390 px y zoom 200/400% | Formulario completo y acciones alcanzables |
| T28 | Teclado y lector de pantalla en diálogos/pestañas | Foco correcto, etiquetas y orden coherente |
| T29 | Claro/oscuro, alto contraste y movimiento reducido | Estados distinguibles y controles utilizables |
| T30 | Android offline, teclado virtual, volver y rotación | Conservar trabajo y mantener controles visibles |
| T31 | Actualización con documento sucio o grabación activa | Protección antes de reinicio y retorno coherente |
| T32 | Diagnóstico y copia para soporte | Información útil sin claves ni contenido privado |

Puerta técnica: cero bloqueos P0 abiertos en estos recorridos, cero pérdida silenciosa de datos, todas las tareas críticas realizables con teclado y sin controles recortados. Objetivo formativo: al menos 90% de tareas críticas resueltas sin ayuda; con muestras pequeñas, informar también recuentos por tarea, nunca esconder un fallo grave tras la media.

Objetivo de eficiencia inicial: no empeorar escritura/guardado y reducir pasos en organización de lotes y configuración frecuente frente a la línea base. Medir tiempos antes de fijar una mejora porcentual. Corregir tras la primera ronda y repetir con tareas equivalentes. La aceptación definitiva requiere Windows y Android nativos.

## 12. Decisiones y líneas de trabajo que faltaban

**Decidido:** Taller esencial como dirección visual. **Propuesto:** organización, escala, tokens, estados del asistente, selección múltiple y reorganización de ajustes descritos aquí. **Pendiente de validación:** descubrimiento sin divisores, cambio de clic/doble clic, densidad, comportamiento móvil y uso real de IA/lápiz/audio.

Las líneas que deben añadirse al programa 3.0 son:

1. Accesibilidad transversal y sistema común de foco, teclado y diálogos.
2. Integridad y recuperación de información, especialmente operaciones por lotes y referencias.
3. Arquitectura de estados y actividades prolongadas, independiente de la pantalla visible.
4. Ámbitos claros: dispositivo, proyecto, documento, selección y proveedor externo.
5. Diseño específico para lápiz, audio y referencias; no quedan cubiertos por una maqueta de Markdown.
6. Rendimiento percibido y continuidad: árboles grandes, documentos largos, progreso útil y recuperación de tareas.
7. Validación empírica y paridad Windows/Android, con criterios observables.
8. Coherencia documental de capacidades: corregir textos obsoletos antes de definir mensajes finales.

El siguiente entregable de diseño debería representar doce estados del mismo sistema: escritura normal; IA temporal y fijada; selección múltiple; mover con conflicto; fallo de guardado; historial; ajustes básicos/avanzados; libreta; grabación; referencia; y variante móvil. Esto permitirá validar el sistema completo, con la opción 1 ya elegida como base.

## 13. Trazabilidad técnica principal

- Shell y coordinación: [App.tsx](../../apps/desktop/src/app/App.tsx), [DesktopLayout.tsx](../../apps/desktop/src/layouts/DesktopLayout.tsx).
- Árbol, pestañas y formularios: [DocumentTree.tsx](../../apps/desktop/src/features/documents/DocumentTree.tsx), [DocumentTabs.tsx](../../apps/desktop/src/features/documents/DocumentTabs.tsx), [CreateDocumentDialog.tsx](../../apps/desktop/src/features/documents/CreateDocumentDialog.tsx), [MoveDocumentDialog.tsx](../../apps/desktop/src/features/documents/MoveDocumentDialog.tsx).
- Guardado y recuperación: [DocumentStatusBar.tsx](../../apps/desktop/src/features/documents/DocumentStatusBar.tsx), [DocumentProtectionDialogs.tsx](../../apps/desktop/src/features/documents/DocumentProtectionDialogs.tsx), [almacenamiento Rust](../../apps/desktop/src-tauri/crates/knownext-storage/src/lib.rs).
- Editor/medios: [MarkdownToolbar.tsx](../../apps/desktop/src/features/editor/MarkdownToolbar.tsx), [HandwrittenEditor.tsx](../../apps/desktop/src/features/handwritten/HandwrittenEditor.tsx), [ReferenceDocumentViewer.tsx](../../apps/desktop/src/features/documentPreview/ReferenceDocumentViewer.tsx).
- IA: [AiPromptInput.tsx](../../apps/desktop/src/features/assistant/AiPromptInput.tsx), [AiEditProposalCard.tsx](../../apps/desktop/src/features/assistant/AiEditProposalCard.tsx), coordinación de operaciones en App.tsx.
- Historial/sync: [VersionHistoryPanel.tsx](../../apps/desktop/src/features/versions/VersionHistoryPanel.tsx), [ExternalChangesDrawer.tsx](../../apps/desktop/src/features/externalChanges/ExternalChangesDrawer.tsx).
- Configuración/audio: [AppSettingsDialog.tsx](../../apps/desktop/src/features/settings/AppSettingsDialog.tsx), [RecordingPanel.tsx](../../apps/desktop/src/features/recordings/RecordingPanel.tsx).
- Tokens calculados: [index.css](../../apps/desktop/src/styles/index.css).

Las líneas citadas en hallazgos corresponden a la revisión indicada. La matriz diferencia observación interactiva, inspección de código y capacidad nueva propuesta.
