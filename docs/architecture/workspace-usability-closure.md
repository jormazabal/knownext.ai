# Cierre de usabilidad del espacio documental

Entrega138, 2026-11-06. Se mantiene React/TypeScript, Milkdown y los tres paneles contextuales plegables. No hay cambios de comandos Rust ni llamadas a proveedores.

## Contratos de interacción

Los diálogos modales declarados en el frontend usan ModalFrame: aislamiento de fondo, foco inicial, recorrido Tab y retorno al disparador o alternativa visible. El manejo de teclado se hace al propagarse el evento React después de los hijos: un menú puede consumir Escape o Tab sin cerrar antes su diálogo. La confirmación de investigación describe una solicitud de detención y conserva resultados guardados; no asegura la inexistencia de contenido parcial ni repite solicitudes del mismo trabajo. Las operaciones de grabación conservan las guardas de guardado y confirmación; mueven foco al contenedor antes de deshabilitar el control activo para que Escape y los errores sigan dentro del diálogo en Chrome real.

La búsqueda del árbol conserva su portal al body y la selección por Enter/Tab; Shift+Tab sólo recorre el foco. Las opciones y confirmación de IA también se muestran en portal para evitar recorte por el panel contextual. La barra mantiene densidad desktop y ofrece controles44px en modo compacto. Roving omite controles no disponibles y se repara si una adaptación responsive oculta el tabstop actual. El visor de imágenes conserva zoom ante objetos de props equivalentes; cambiar realmente kind/src/svg/code reinicia el gesto y la vista.

## Continuidad de consulta

Una LRU de32entradas conserva sólo estado de lectura en memoria de sesión. La clave incorpora proyecto, raíz, pestaña, ruta y formato; la autoridad de reutilización es la huella SHA/tamaño/mtime de la fuente, comprobada de nuevo mediante la API de vistas previas. No conserva texto documental, blobs, rendiciones ni datos en disco. Guarda página y desplazamiento proporcional PDF, zoom, ajuste, consulta hasta512caracteres y hasta16posiciones de hoja. No omite preparar/verificar la fuente al volver; cambios o estados no listos invalidan la entrada. Una nueva petición explícita de página prevalece sobre la posición anterior. El campo de búsqueda usa el mismo límite512.

## Recursos y formularios

Renombrar y mover consultan vínculos guardados antes de continuar cuando hay impacto o revisión parcial; enviar a papelera siempre pide confirmación. Los lotes de movimiento/renombrado/papelera revisan el conjunto una vez. La interfaz distingue tratamiento de imágenes gestionadas y posibles correcciones manuales de otros enlaces relativos. No promete reescritura universal. Las consultas y confirmaciones se cercan con proyecto y época de trabajo antes del efecto y de actualizar la vista; cancelar o cambiar de proyecto no autoriza una acción posterior.

La credencial tiene etiqueta, ayuda y error asociados mediante IDs únicos; conserva el valor ante fallo y revoca el estado inválido al editar. No se persisten claves de prueba ni se ejecutan comprobaciones reales de proveedor en QA. El idioma del documento HTML se alinea con ES/EN; bienvenida, acceso rápido y el control de acceso al modelo respetan la selección. Los errores y advertencias que son evidencia del runtime conservan su texto original.

## Contraste y evidencia

Las variantes claras ámbar/lima/oliva/verde/cian/rojo usan tonos legibles para etiquetas y acciones sin cambiar el naranja predeterminado. Oliva oscuro coincide con sus tokens. Las muestras de acciones normales/hover y texto sobre fondo suave en12paletas y2temas obtienen contraste mínimo4.7297. Esto no certifica todo el producto ni sustituye lectores de pantalla o pantallas físicas.

122casos frontend únicos cubren los ámbitos tocados, con repetición focal de45casos afectados por el cambio de teclado común.25capturas628–652 de componentes reales, con API/props sintéticos aislados, PDF.js y eventos táctiles reales cuando corresponde. Sin UI nativa Windows, puente Tauri falso, perfil real, IA ni gasto. Lectores reales, dispositivos/lápiz, teclado virtual nativo, DPI y aceptación con personas siguen en P10; escala y regresión final continúan en el bloque11.
