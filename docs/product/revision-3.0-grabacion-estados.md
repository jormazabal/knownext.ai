# Grabación compacta · estados y sesiones
30/10/2026. Dirección visual elegida por el usuario: compacta v2. Estado: especificación para implementación; renders conceptuales, sin cambio de producto.

[Galería de cuatro vistas](../../output/playwright/revision-3.0/grabacion-compacta/estados.html) · [Paquete de implementación P07](revision-3.0-implementacion/P07/plan.md) · [Plan integral](revision-3.0-implementacion/plan.md)

## Composición común
Miniventana de bandeja independiente del shell de tres paneles. Una fila de estado/tiempo/acciones, dos filas de fuentes, destino, avisos breves y accesos a sesiones/ajustes/gestor. Objetivo aproximado 420 × 260 para la vista plegada, ajustable por contenido y DPI; es una orientación, no una medida verificada del render.

Cada fuente reúne icono, nombre de dispositivo, medidor, estado y activación en una sola fila. Nombres largos se abrevian visualmente y se pueden consultar completos por foco/acción accesible, no solo hover. Audio de aplicaciones/sistema debe tener una etiqueta accesible inequívoca aunque el nombre visible sea corto.

| Estado | Tiempo | Acción principal y secundaria | Dispositivos | Medidores |
|---|---|---|---|---|
| Preparada | 00:00:00 | Iniciar; Probar niveles | Editables, actualizar disponible | Inactivos, “Sin probar” accesible; guion visual |
| Prueba de niveles | Sin tiempo de grabación | Terminar prueba; iniciar según transición validada | Conforme al runtime | Señal real; mensaje “No se está grabando” |
| Grabando | Avanza con muestras confirmadas | Pausar; Parar | Selección bloqueada; fuentes activables/desactivables | Señal por fuente |
| En pausa | Congelado | Continuar; Parar | Editables | Inactivos; sin animación ni porcentaje inventado |
| Finalizando | Último valor confirmado | Estado ocupado, sin doble envío | Bloqueados | Inactivos; resultado explícito |
| Error | Valor y estado recuperables | Acción de recuperación concreta | Según causa | Sin simular señal |
| Sesiones desplegadas | Conserva estado actual | Conserva las acciones de arriba | Sin cambios por abrir lista | Siguen visibles y actuales |

El botón de pausa cambia a continuar en el mismo lugar. Su nombre accesible y tooltip reflejan la acción; no depender solo del triángulo. La preparación no presenta controles de pausa/parada que todavía no tengan sentido.

## Sesiones sin perder controles
La expansión añade una lista debajo del controlador. El bloque superior y la fila Sesiones/Ajustes/Abrir gestor quedan fuera del contenedor desplazable. Solo la lista se desplaza. Contiene nombre, fecha, duración, estado y siguiente acción; el menú conserva escuchar, detalles, conservación y eliminación cuando corresponden.

El tamaño expandido orientativo es 420 × 420. Ajustarlo al área de trabajo del monitor; si la ventana está junto a la bandeja inferior, puede crecer hacia arriba para permanecer dentro de pantalla. No maximizar automáticamente ni crear otra captura. Cerrar la lista devuelve el tamaño compacto sin perder posición de lista o selección. Con poco espacio, limitar la lista y ofrecer Abrir gestor; nunca resolverlo ocultando Parar.

El mismo comportamiento de expansión funciona en preparada, grabando y pausa. El render expandido usa grabando para mostrar el caso más exigente; no representa un cuarto estado de captura.

## Criterios verificables R01–R12
- **R01 · Densidad:** cada fuente ocupa una sola fila a la escala objetivo, con dispositivo, nivel e interruptor visibles. Si el texto ampliado no cabe, se adapta el ancho/reflujo sin recortar controles ni reducir la letra por debajo del objetivo de legibilidad.
- **R02 · Ventana:** actualizar tamaño inicial y mínimo nativos, respetar el área de trabajo, escalado y preferencias guardadas. No mantener el mínimo actual 360 × 480 si impide el tamaño compacto. Validar 100/125/150/200 % en Windows y varios monitores.
- **R03 · Estado:** preparada/prueba/grabando/pausa/finalizando/error tienen texto y acciones coherentes; tiempo y niveles se derivan del estado confirmado, no de animaciones ilustrativas.
- **R04 · Entrada:** cambio de dispositivo disponible antes de capturar o en pausa; si una entrada desaparece, informar y conservar sesión. Fuente apagada se distingue de “Sin señal” y “Sin probar”.
- **R05 · Controles persistentes:** tiempo, niveles y acciones de grabación permanecen visibles al abrir, desplazar o cerrar sesiones. Los controles no pertenecen al contenedor con overflow de la lista.
- **R06 · Sesiones:** selección, menú y detalles no alteran la captura activa. Abrir documento/reintentar una sesión pasada mantiene destino y propietario correctos.
- **R07 · Tamaño expandido:** expansión cabe en monitor y vuelve al tamaño anterior; scroll y foco de lista se conservan sin robar foco al editor o forzar reapertura.
- **R08 · Cierre y propietario:** cerrar la miniventana oculta esa vista sin detener captura; reabrir recupera la misma sesión. Salir de la aplicación o actualizar requiere proteger el trabajo con comportamiento explícito. No iniciar captura si dictado ocupa el recurso.
- **R09 · Resultado y errores:** finalizar no permite doble acción; cancelar selección de destino conserva audio; un error de transcripción ofrece recuperación, no pérdida de sesión. Reintentar resultado desconocido informa posible coste duplicado.
- **R10 · Información:** resumen visible de audio local/envío al parar y elegir destino; Detalles conserva ausencia de identificación de hablantes, privacidad, conservación, tamaño, ruta y costes cuando existan. No se introduce diarización ni transcripción en directo por el diseño.
- **R11 · Accesibilidad:** orden de Tab estable, foco visible, nombres accesibles para iconos, estados no dependientes solo del color, nombres completos consultables y anuncio de errores sin lectura continua de cada muestra del medidor.
- **R12 · Paridad de vistas:** gestor principal y bandeja comparten controlador y contratos; no mantienen estados de captura divergentes. Android se adapta a sus capacidades y ciclo de vida; no se traslada literalmente la bandeja Windows.

## Implantación por cortes
1. Extraer presentación compacta del controlador existente y cubrir estados con componentes; mantener la vista del gestor principal.
2. Separar lista desplazable y acciones persistentes; conservar operaciones y metadatos de sesiones.
3. Ajustar ventana nativa, tamaño mínimo, posicionamiento y cierre; comprobar reabrir con sesión activa.
4. Conectar y verificar transiciones reales, interrupciones y hardware; aplicar a los tres estados y expansión.
5. Validar teclado, contraste y DPI, registrar aceptación. Actas/OCR se implementan como ampliaciones independientes.

## Revisión de los renders
Las cuatro imágenes se inspeccionaron visualmente: las fuentes permanecen en una fila, la pausa tiene medidores inactivos y el historial expandido tiene scrollbar propio bajo el controlador. La vista Grabando reutiliza la v2 elegida; las otras tres se generan a partir de ella con image_gen integrado.

Los renders no prueban interacción ni contraste final. Normalizar botones sin degradado, iconos y tonos de estado; el texto de pausa debe usar un tono oscuro legible, manteniendo el punto ámbar como refuerzo. Las medidas son objetivos sujetos a prueba real. No se implementa ni se modifica código en esta entrega.

[Prompts y trazabilidad](../../output/playwright/revision-3.0/grabacion-compacta/prompts-estados.json)
