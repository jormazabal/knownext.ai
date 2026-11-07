# Grabación desde la bandeja · propuesta compacta

Fecha: 30 de octubre de 2026. Estado: propuesta visual para revisión; no implementada.

[Galería de los tres estados](../../output/playwright/revision-3.0/grabacion-compacta/index.html)

## Decisión de diseño

La ventana independiente debe funcionar como un pequeño controlador de grabación. El gestor completo sigue disponible para trabajar con muchas sesiones. El mismo lenguaje de Taller esencial se aplica aquí: fondo continuo, jerarquía tipográfica y pocos límites visuales.

Tamaño objetivo del contenido habitual: aproximadamente **420 × 380 unidades lógicas**, más la barra nativa. Frente al contenido inicial actual de 460 × 680, supone cerca de un **49 % menos de superficie**. Es un objetivo de composición, no una medición de los PNG generados ni una validación de DPI. La altura debe adaptarse a escala de texto, mensajes y espacio disponible.

Se elimina la cabecera interior repetida y las tarjetas anidadas. Las dos fuentes usan filas compactas, con nombre, interruptor, dispositivo y nivel. Estado y tiempo comparten una fila. Destino, acciones y acceso a sesiones permanecen visibles.

## Tres vistas

1. **Preparada:** fuentes, selección de dispositivos, prueba de niveles, destino opcional e inicio. “Sin probar” evita confundir una prueba no iniciada con ausencia real de señal.
2. **Grabando:** tiempo y niveles independientes; Pausar y Parar siempre visibles. La selección de dispositivos requiere pausar; los interruptores de fuente siguen disponibles.
3. **En pausa y sesiones desplegadas:** cambiar dispositivos y continuar; lista reciente con estado y siguiente acción. La ampliación es voluntaria. Con muchas sesiones, solo la lista desplaza; el controlador permanece accesible. “Abrir gestor” permite trabajar con el histórico completo.

No se debe forzar el estado expandido a la altura de la ventana habitual. Debe ajustarse al área de trabajo del monitor y conservar la posición cerca de la bandeja.

## Conservación de información y operaciones

| Función actual | Ubicación propuesta |
| --- | --- |
| Estado y duración | Cabecera interior compacta, siempre visible |
| Micrófono y audio de aplicaciones | Dos filas independientes con interruptor, dispositivo y medidor |
| Activar/desactivar fuentes | Interruptor en cada fila, sin abrir ajustes |
| Seleccionar y actualizar dispositivos | Selector de cada fila; actualizar disponible antes de grabar o en pausa |
| Probar/terminar prueba de niveles | Acción secundaria de Preparada; estado “Prueba · no se está grabando” |
| Elegir destino o hacerlo al parar | Fila Destino; diálogo al finalizar cuando sea necesario |
| Nombre opcional de documento | Detalle desplegable junto a Destino; no se pierde el valor |
| Iniciar, pausar, continuar y parar | Franja de acciones fija |
| Descartar la captura | Menú Más, con confirmación explícita |
| Captura ocupada por dictado | Mensaje junto a las acciones; iniciar deshabilitado |
| Errores y finalización | Mensaje visible junto al estado; nunca solo en historial |
| Aviso de audio local y envío a OpenAI | Resumen persistente y detalle de privacidad |
| Ausencia de identificación de hablantes | Texto explícito en información de privacidad, accesible desde el resumen |
| Historial y número de sesiones | Sesiones (N), plegado de inicio |
| Nombre, fecha, duración y estado | Cada fila de sesión |
| Tamaño, ruta, caducidad y conservación del audio | Detalle de sesión; resumen de conservación visible si exige una decisión |
| Estimación de coste, moneda, cambio y vigencia | Detalle de sesión, con avisos visibles antes de una acción relevante |
| Progreso de transcripción por fragmentos | Fila de sesión en curso; acceso a cancelar procesamiento |
| Escuchar, abrir documento y elegir destino | Acción contextual principal de la fila y menú de sesión |
| Transcribir y reintentar | Acción de sesión según estado |
| Resultado desconocido con posible coste duplicado | Aviso específico antes de reintentar, no un reintento automático |
| Conservar/dejar de conservar audio | Menú de sesión y detalle |
| Eliminar audio | Menú de sesión, confirmación y distinción respecto al documento |
| Ajustes y gestor completo | Accesos en el pie |

La información secundaria se revela bajo demanda; no se elimina del producto.

## Comportamientos a validar antes de implementar

- Cerrar debe ocultar el controlador sin detener una captura. Parar debe ser la acción explícita de finalización. Es comportamiento propuesto; requiere verificar y adaptar el ciclo de vida nativo.
- La ventana debe volver a mostrar la captura existente al abrirla desde la bandeja, sin crear otra sesión.
- Dos fuentes apagadas, permisos denegados, dispositivo desconectado, prueba activa, pausa y finalización necesitan estados diferenciados.
- Parar sin destino conserva el audio aunque se cancele la selección de carpeta.
- Un error de transcripción debe informar de que el audio se conserva y ofrecer una recuperación adecuada.
- Navegación por teclado, foco visible y nombres accesibles para interruptores, menús, medidores y botones.
- Verificación en Windows a 100 %, 125 %, 150 % y 200 %; ampliación de texto y monitores de poca altura.
- No reducir la letra para alcanzar un tamaño fijo: texto operativo de 13–14, auxiliar de 12 como objetivo; controles de al menos 32–36 unidades lógicas para escritorio.
- Sin desplazamiento para los controles esenciales en condiciones habituales. En ventanas de poca altura, priorizar controles y permitir que el contenido secundario se desplace.

## Lectura crítica de las imágenes

Son imágenes conceptuales generadas con image_gen, no capturas de una interfaz funcional. La galería las muestra a un ancho de referencia de 420 píxeles CSS, incluyendo el margen de la propia imagen.

En la especificación final deben corregirse estas aproximaciones del render: usar un icono de equipo/disco para “Audio local” (algunas imágenes muestran una nube); hacer inequívoco el estado deshabilitado de los selectores mientras se graba; mantener un único tratamiento de enlaces y el acento terracota de la línea elegida; evitar degradados. El texto de privacidad debe conservar siempre la condición “al parar y elegir destino”, cuando todavía no existe destino.

Los tamaños, el contraste efectivo, la legibilidad y el comportamiento de teclado requieren validación en un prototipo implementado. Los datos y nombres de sesiones de las imágenes son ilustrativos.

## Evidencia revisada

- `apps/desktop/src-tauri/src/recording.rs`: creación de la ventana independiente con contenido inicial 460 × 680 y mínimo 360 × 480.
- `apps/desktop/src/features/recordings/RecordingPanel.tsx`: fuentes, medidores, estados, controles, privacidad, destino e historial con operaciones y metadatos.
- Captura aportada por el usuario y propuesta del gestor principal de tres paneles.

Los archivos de producción no se han modificado. Las imágenes y sus prompts se conservan junto a la galería.
