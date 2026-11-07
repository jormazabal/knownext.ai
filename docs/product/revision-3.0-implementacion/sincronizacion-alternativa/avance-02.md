# SC01 · Proton primero: intercambio local verificado

> Histórico: [plan vigente revisión3](plan.md). El enfoque Proton por carpeta fue descartado por no satisfacer conexión directa Windows/Android y sesión persistente. Esta evidencia conserva su alcance original; no acredita la nueva integración.

2026-11-06. Desarrollo mediante cuatro agentes coordinados. Cliente Proton y transferencia real todavía no aceptados. Microsoft y Google quedan pendientes de sus registros, que gestionará el usuario.

## Implementación de este corte

- Crate independiente `knownext-sync-folder`, con captura acotada, objetos SHA256, publicaciones inmutables, comprobación de contenido, descubrimiento de proyectos y carpetas vacías. El trabajo local permanece fuera del intercambio.
- Servicio nativo `proton_sync`: revisión por identidad/generación, conexión, publicación durable, bandeja recibida, revisión y aplicación, copias previas de actualizaciones y desconexión conservando archivos.
- Actualización sólo con base de contenido y publicación causal demostrada; una rama de un tercer dispositivo no se impone sobre cambios ya recibidos. Se puede recibir un descendiente sin aplicar a mano cada publicación intermedia; los antecesores no revierten el documento.
- Borradores, diferencias concurrentes, borrados y renombrados pendientes impiden la aplicación del lote; se conservan fuentes. Recibir no crea commits Git ni ejecuta captura/transcripción/IA.
- UI real con selector nativo, alcance, controles de publicación/recepción y mensaje «Entregado a la carpeta Proton; nube no confirmada». El estado se vuelve a consultar al salir del panel.
- El estado general reconoce la asociación Proton; las rutas anteriores no pueden activar GitHub o aparentar desconectar Proton mediante una configuración local vacía.
- Guardas Windows CFAPI específicas para la carpeta de intercambio: sólo tags CLOUD_0..F conocidos, nunca name-surrogate, junctions ni tags desconocidos. Captura local y preparación privada mantienen el rechazo estricto de reparse points. Se contrasta el tag de contenido también sobre el handle abierto.

La compatibilidad CFAPI está implementada contra las APIs documentadas, no acreditada con el cliente Proton. Fijar un archivo como disponible offline no se presenta como sustituto de comprobar sus tags reales.

## Estado de validación

Validación dirigida cerrada: **25 casos Rust** (16transporte/CFAPI,7servicio de proyecto,2integración del dispatcher), **15casos frontend únicos correctos** y **TypeScript final correcto**. Resultados y límites en el [recibo del corte](verificacion-02.json). No se deduce aceptación del cliente Proton de estos contratos locales.

Capturas de componente real con datos controlados, sin aceptación instalada:

- [Escritorio](../../../../output/playwright/revision-3.0/sc01-proton-conectado-1280.png).
- [Ancho390px](../../../../output/playwright/revision-3.0/sc01-proton-conectado-390.png).

No se repite la regresión de frontend/Rust completa ni se crea una nueva instalación de C1.

## Límites que no se ocultan

- El usuario confirma que aún no tiene el cliente configurado y puede instalarlo. Se ha pedido una carpeta nueva de pruebas para comprobar después el recorrido real; no se ha escrito en datos personales ni se ha usado una cuenta Proton.
- Este corte proporciona intercambio manual: publicar y comprobar recibidos. No incluye un planificador automático ligado al guardado ni sincronización con KnowNext cerrado.
- No se propagan borrados ni renombrados de forma automática. Si el manifiesto los exige, se bloquea el lote y se informa.
- Una recepción que falla tras publicar parte del lote conserva intento, copias y resultado consultable, y bloquea el replay. Todavía no hay reparación asistida de ese estado; consultar no significa resolverlo. No se anuncia el bloque como fiabilidad integral terminada.
- No hay migración integral GitHub→Proton ni retorno automático: se bloquea activar dos mecanismos a la vez. Desconectar conserva proyecto e intercambio.
- Retención avanzada, compactación, acuses entre dispositivos, Android y aceptación física permanecen pendientes.
- El almacén privado de preparación/copia previa necesita integración con inventario, cupos y limpieza antes de la entrega general. El tamaño de cada captura y el JSON de estado están acotados; eso no equivale a una cuota acumulada del almacén ni a retención ya implementada.
- La UI identifica los archivos en conflicto y detiene su aplicación; la comparación y resolución asistida específica de Proton aún no está integrada.

## Cómo preparar la prueba real

Instalar y conectar el cliente oficial Proton Drive Windows; configurar una subcarpeta nueva destinada sólo al corpus sintético y comprobar desde su cliente que forma parte de la sincronización. No usar el proyecto vivo como carpeta de intercambio. En el segundo equipo, acceder a ese mismo espacio, no a otro directorio homónimo independiente.

En la aplicación con esta fuente compilada: abrir «Sincronización del proyecto», elegir Proton, verificar la carpeta y conectar. Publicar la copia de prueba en el primer equipo; en el segundo, seleccionar el mismo intercambio (un único proyecto se detecta por su identidad), comprobar recibidos y revisar antes de aplicar. Editar en ambos para observar una divergencia conservada. La UI distingue entrega en carpeta y recepción local; el cliente oficial acredita su propio estado de nube.

C1 instalada previamente no contiene este código. Preparar/instalar una candidata posterior es otro hito, agrupado después de estabilizar el alcance seleccionado.
