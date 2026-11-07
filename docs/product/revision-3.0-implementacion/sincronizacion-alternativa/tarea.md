# SC01 · Sincronización alternativa de proyectos locales

Fecha: 2026-11-06. Revisión3: **Proton directo Windows/Android, sesión persistente; plan corregido e implementación reanudada**.
Responsable propuesto: producto y coordinación técnica; personas por asignar.
[Plan de trabajo](plan.md) · [Programa 3.0](../plan.md) · [Base C1](../avance-140.md).

## 1. Petición, decisión y autoridad

El usuario solicita analizar y proponer de forma completa la sincronización mediante OneDrive, Google Drive y Proton Drive como alternativas a GitHub. Decide aplazar SOLO CLOUD a versiones posteriores.

La orden posterior «Adelante con la implementación de la propuesta. Usa 4 agentes coordinados» autoriza desarrollar e integrar localmente este alcance, con comprobaciones proporcionadas. Aquella implementación se inició con cuatro agentes en total: coordinador y tres subagentes reales; la pausa posterior ha sido levantada por la nueva orden de retomar Proton. No incluye publicación, gasto IA ni transferencia de documentos personales. Los registros OAuth y accesos de prueba reales se deben resolver con su responsable; la ausencia de una cuenta no se sustituye por autenticación simulada. La candidata C1 conserva su evidencia y alcance anterior; esta ampliación no figura como implementada en las matrices 50/70.

La aclaración posterior exige SDK/autenticación directa y recordar sesión; sustituye la interpretación anterior por carpeta. La nueva orden autoriza retomar Proton con cuatro agentes, P0 primero y controles dirigidos; OneDrive/Google aplazados. Poder instalar el cliente no fue aceptación del enfoque de producto. Ver sección14.

### Correcciones tras la revisión crítica

| Debilidad de la primera propuesta | Cambio de la revisión 2 |
|---|---|
| Núcleo general grande antes de ver un resultado real | Construir un recorrido vertical con OneDrive y extraer sólo lo común demostrado al añadir Google. |
| Cambio de proveedor relegado al bloque final | Migración como capacidad central desde el primer conector, con la misma operación para cambiar de cuenta/carpeta o volver a local. |
| Exceso de decisiones durante el alta | Asistente de tres pasos, ubicación gestionada y opciones recomendadas; detalle avanzado progresivo. |
| «Conservar historial» podía confundirse con transportarlo completo | Separar contenido actual, historial local y archivo histórico transportable; mostrar resultado por categoría. |
| Un cambio de asociación local parecía suficiente para otros equipos | Definir generación de asociación, reconexión de réplicas y revisión de aportaciones tardías; no prometer bloqueo de clientes antiguos. |
| Respaldo, audio y gestión avanzada podían retrasar lo esencial | Mantener recuperación mínima obligatoria; separar nuevas opciones de respaldo, audio y automatizaciones de la primera entrega. |

El mayor ahorro debe venir de reducir opciones y abstracciones, no de retirar protección de datos ni comprobar menos un cambio crítico.

## 2. Objetivo de producto

Continuar el mismo proyecto desde varios dispositivos independientes, conservando una copia local utilizable sin conexión y sincronizando los cambios de forma comprensible y recuperable. Mantener GitHub y los proyectos exclusivamente locales.

La sincronización será eventual: un dispositivo recibe cambios cuando su proceso está disponible, tiene acceso y completa la conciliación. No equivale a edición colaborativa simultánea ni a una copia de seguridad independiente.

## 3. Alcance recomendado

- Proyecto con carpeta local y contenido seleccionado disponible localmente. La primera descarga debe terminar y verificarse antes de anunciar disponibilidad offline completa.
- Un destino de sincronización activo por proyecto: ninguno, GitHub, OneDrive, Google Drive o Proton Drive directo.
- Una cuenta predeterminada por proveedor en la interfaz, con conexión específica cuando un proyecto cambia de cuenta. Las asociaciones existentes conservan su cuenta; no hace falta un gestor multicuenta avanzado para soportar ese caso. La identidad de cuenta procede del proveedor, nunca sólo de un correo o nombre visible.
- Sincronización manual y automática mientras la aplicación pueda ejecutarla, con pausa y reanudación. Conservar la política actual de proyectos existentes; la configuración inicial propone automática y pide confirmarla.
- Conectar un proyecto local existente; crear uno local con destino remoto; incorporar en un nuevo dispositivo un proyecto publicado por KnowNext; desconectar o cambiar de cuenta/proveedor con revisión.
- Conflictos de contenido, borrados, movimientos, nombres y metadatos; protección de documentos abiertos y borradores.
- Retención mínima de bases, variantes y operaciones necesarias para recuperación, reutilizando copias existentes. Nuevas políticas avanzadas de respaldo remoto no condicionan los primeros conectores.
- Windows y Android para todos los conectores directos, incluido Proton; separar código, validación y disponibilidad pública.

Fuera del núcleo inicial: solo cloud, descarga selectiva bajo demanda, dos proveedores escribiendo simultáneamente un mismo proyecto, colaboración en tiempo real, gestor avanzado de cuentas, gestión de permisos de equipos, conversión automática a Google Docs/Proton Docs, todo SharePoint/Shared Drives, servicio permanente con la aplicación cerrada y nuevo cifrado extremo a extremo propio de KnowNext. Audio y datos privados conservan un bloque opcional explícito; no se anuncian como sincronizados antes de completarlo.

## 4. Hechos de partida contrastados

| Superficie | Hecho actual | Consecuencia |
|---|---|---|
| Proyecto | `Project.folderPath` es obligatorio y `StorageMode` sólo contempla almacenamiento local/cache. | Mantener este modelo local; no introducir ahora un sistema de edición remota. |
| Sincronización | `SyncMode`, estado y operaciones están ligados a local/GitHub; varios contadores y mensajes dicen GitHub. | Añadir contratos neutrales sin reemplazar a ciegas los modos locales actuales. |
| Admisión | `create_project` exige Git para modos de sincronización distintos de `none`. | Desacoplar la sincronización de archivos de la disponibilidad de Git. |
| Conflictos | La revisión remota utiliza commits/referencias Git y las herramientas de cambios externos también tienen dependencias Git. | Reutilizar publicación segura y presentación; no asumir que todo el servicio actual sirve para Drive. |
| Credenciales | Almacén nativo con DPAPI/Keystore y validación de campos conocidos. | Extender el esquema para cuentas y renovación de tokens mediante migración explícita. |
| Historial | Android no dispone de Git nativo; Windows sí cuando está disponible. | Drive debe funcionar sin Git; no prometer historial Git idéntico entre plataformas. |
| Portabilidad/copias | Existen inventarios, hashes, paquetes, revisión, retención y consulta de acuses inciertos. | Reusar esas garantías sin confundir límites de ZIP con límites de transferencias incrementales. |

Fuentes locales: [tipos](../../../../apps/desktop/src/types/domain.ts), [proyectos](../../../../apps/desktop/src-tauri/crates/knownext-storage/src/projects_runtime.rs), [sync](../../../../apps/desktop/src-tauri/crates/knownext-storage/src/project_sync.rs), [capacidad Git](../../../../apps/desktop/src-tauri/crates/knownext-storage/src/project_capabilities.rs), [credenciales](../../../../apps/desktop/src-tauri/crates/knownext-storage/src/credential_store.rs), [portabilidad](../../../architecture/project-portability-and-export.md), [copias](../../../architecture/scheduled-project-backups.md).

## 5. Proveedores y forma de incorporación

### OneDrive: conector directo recomendado

Microsoft Graph, conexión de cuenta y espacio dedicado a KnowNext. Proponer AppFolder para reducir el acceso; su documentación describe soporte personal y laboral. Verificar en el prototipo la combinación exacta de permisos, enumeración de cambios, subida y cuentas empresariales: no deducir que cualquier endpoint acepta cualquier permiso por pertenecer a Graph. [AppFolder](https://learn.microsoft.com/en-us/graph/onedrive-sharepoint-appfolder).

Identificar archivos por ID y revisión, seguir paginación y cambios incrementales. Un cursor inválido exige reconstruir el inventario y compararlo con la base local, conservando cambios pendientes; no equivale a autorización para aplicar todos los borrados. Las sesiones de subida permiten reanudar transferencias y documentan precondiciones que deberán contrastarse hasta la publicación final. [Delta](https://learn.microsoft.com/en-us/graph/api/driveitem-delta), [subidas](https://learn.microsoft.com/en-us/graph/api/driveitem-createuploadsession).

Primera matriz: OneDrive personal y cuentas laborales con consentimiento disponible. No dar por aceptados SharePoint, bibliotecas de Teams, nubes soberanas ni políticas de todos los tenants. La negativa de un administrador pausa la conexión, no el trabajo local.

### Google Drive: conector directo recomendado

Usar archivos Markdown/binarios normales y una carpeta visible gestionada por KnowNext. Para contenido creado o autorizado para la aplicación, evaluar `drive.file`; la autorización de una carpeta no se tratará como acceso recursivo garantizado a cualquier archivo ajeno. Empezar por proyectos gestionados por la aplicación evita requerir acceso general a todo Drive. [Permisos](https://developers.google.com/workspace/drive/api/guides/api-specific-auth).

Identidad por ID, no por nombre: pueden existir homónimos. Consultar `changes` con paginación, subir de forma reanudable y asignar identidades antes del efecto cuando la API lo permita. No convertir a formatos Google Workspace. [Cambios](https://developers.google.com/workspace/drive/api/guides/manage-changes), [subidas](https://developers.google.com/workspace/drive/api/guides/manage-uploads), [IDs](https://developers.google.com/workspace/drive/api/reference/rest/v3/files/generateIds).

No asumir una equivalencia exacta con `If-Match` de OneDrive: el prototipo debe demostrar el contrato de concurrencia o elegir publicación inmutable. Una lectura de versión seguida de una escritura sin precondición no es protección suficiente.

Primera matriz: My Drive personal y My Drive de Workspace cuando su política lo permita. Shared Drives y carpetas arbitrarias de terceros son ampliaciones separadas. La verificación OAuth y configuración de identidad son dependencias de entrega, no trabajo que pueda sustituirse por mocks.

### Proton Drive: conexión directa, sin aplicación externa

Única modalidad objetivo: SDK oficial integrado en KnowNext Windows y Android, «Conectar con Proton» mediante navegador y sesión persistente por dispositivo. No cliente Proton, CLI, carpeta externa sincronizada ni token pegado. El enfoque por carpeta queda descartado como entrega; su código existente debe retirarse/migrarse según el plan.

El cliente dispone de operaciones de archivos/revisiones/eventos. El módulo de cuenta en incubación aporta authViaWeb, material para desbloquear claves y renovación; no se incorpora automáticamente al instalar el SDK principal. CLI sólo como referencia, no dependencia de producto. Contrastar puente nativo, permisos reales, condiciones de terceros y cambio criptográfico antes de ofrecer distribución. [SDK](https://github.com/ProtonDriveApps/sdk), [autenticación](https://github.com/ProtonDriveApps/sdk/blob/main/incubating/account/js/src/auth.ts).

Conectar una vez y recordar: secretos nativos protegidos, reabrir/renovar sin login habitual y sesión por dispositivo. Revocación pide reconectar; fallo de red conserva asociación/cola y permite editar. Desconectar cuenta muestra proyectos afectados y distingue retirada local de credenciales de revocación remota.

«Al día con Proton» significa revisión confirmada en destino, no recepción en otro equipo. Windows y Android son criterio conjunto; sesión persistente no implica ejecución con proceso cerrado. Una limitación SDK bloquea/aplaza la parte afectada, nunca se sustituye silenciosamente por cliente externo.

## 6. Qué se sincroniza

| Familia | Política propuesta | Tratamiento |
|---|---|---|
| Markdown, carpetas, imágenes y adjuntos referenciados | Incluida | Mantener bytes y referencias relativas; ninguna conversión silenciosa. |
| Notas manuscritas y recursos propios | Incluida | Tratar archivo y dependencias como conjunto; conflicto binario conserva ambas. |
| Actas y transcripciones guardadas como documentos | Incluida | Se comportan como documentos ordinarios. |
| Metadatos de proyecto portables | Incluidos mediante lista permitida | Colecciones, hitos de trabajo y perfiles necesarios; IDs estables y esquema compatible. |
| Audio y sesiones finalizadas | Ampliación opcional, excluida del núcleo inicial | Subidas por partes, cuota previa y adopción detenida; nunca reanudar captura/transcripción al recibir. |
| Conversaciones, contexto y resultados privados de IA | Excluidos del núcleo inicial | Ampliación opcional con inventario y explicación de privacidad; cero llamadas IA por sincronizar. |
| Borradores sin guardar, pestañas, geometría y selección | Locales | No confundirlos con trabajo confirmado ni propagar estado de dispositivo. |
| `.git`, credenciales, permisos operativos, locks, colas y cachés | Excluidos | No se transportan como archivos de sincronización. |

Una imagen referenciada no se excluye silenciosamente por superar el límite: el conjunto queda pendiente y la UI explica el motivo. Las exclusiones se muestran antes de conectar y después en el alcance del proyecto; desmarcar una familia no elimina copias ya existentes en otro dispositivo.

Para evitar combinaciones excesivas, la primera entrega descarga todo el alcance elegido. Audio opcional fuera del alcance no afecta al anuncio de disponibilidad documental, pero debe figurar como excluido.

## 7. Flujos completos

### Conectar un proyecto local

1. Elegir proveedor y cuenta; comprobar permisos.
2. Elegir «crear espacio remoto de este proyecto»; calcular inventario, tamaños, familias y exclusiones.
3. Verificar que no hay otro motor actuando sobre la carpeta de trabajo, hasta donde pueda detectarse; no prometer detección exhaustiva de clientes externos.
4. Mostrar revisión inicial. Preferir una nueva raíz remota propia; no mezclar automáticamente con una carpeta remota no vacía.
5. Capturar una base local consistente, publicar por partes y verificar. Las nuevas ediciones quedan en una generación posterior.
6. Mostrar cuándo el proveedor ha confirmado la transferencia; no bloquear la edición mientras se sube.

### Abrir en otro dispositivo

1. Conectar la cuenta y elegir entre proyectos publicados por KnowNext.
2. Elegir carpeta local vacía o una nueva ubicación propia de Android.
3. Comprobar espacio, formato y límites; descargar a preparación separada.
4. Verificar estructura, dependencias y hashes antes de registrar el proyecto utilizable. Interrupciones conservan la preparación identificada.
5. Asociar un ID de dispositivo nuevo sin clonar su identidad ni credenciales desde una copia. Sólo entonces habilitar sincronización automática.

Abrir una carpeta con archivos se resuelve como conciliación revisada, no como clonación que sobreescribe. Retirar un proyecto del selector conserva sus archivos y su remoto.

### Trabajo diario

Guardar confirma primero persistencia local. La cola captura ese contenido durable, no cada pulsación. La UI puede mostrar «Guardado local · 2 cambios pendientes» y más tarde «Sincronizado». Una edición posterior no puede quedar marcada como enviada por el acuse de una anterior.

Al abrir, recuperar conectividad o ejecutar «Sincronizar ahora», obtener cambios y conciliar. En automático se incorporan cambios compatibles sobre archivos cerrados o pestañas inactivas limpias sin confirmaciones repetidas. El documento activo se conserva estable y ofrece «Hay una actualización · Aplicar» sin modal; con borrador se abre revisión de conflicto. Conservar foco, selección y borrador. La red se usa fuera de los bloqueos del editor y de la autoridad local de escritura. No anunciar ni enviar cada pulsación: agrupar guardados que aún no se han publicado sin descartar una revisión ya comprometida.

### Un único flujo: «Cambiar sincronización…»

Se accede desde el menú del proyecto o sus ajustes. Permite cambiar proveedor, cuenta, ubicación remota o pasar a «Sólo en este dispositivo». Pausar es una acción temporal distinta. Crear una copia independiente también es distinto: cambiar sincronización conserva el proyecto, su carpeta, IDs documentales, referencias y pestañas; duplicar crea otra identidad.

El asistente tiene tres pasos: **Destino → Comprobación → Cambio**. En comprobación se ven documentos, recursos, historial y elementos sólo locales con cuatro resultados posibles: «Se transfiere», «Se conserva aquí», «Requiere resolver» y «No compatible». Una vista avanzada abre el inventario exacto; no obliga a inspeccionar cientos de archivos en el caso normal.

### Transiciones admitidas y límites

| Transición | Garantía propuesta | Condición relevante |
|---|---|---|
| Local → proveedor | Publicar el estado local elegido y verificar antes de activar. | Cuenta/destino accesible y alcance compatible. |
| GitHub → OneDrive/Google | Conservar carpeta y Git local; transferir contenido guardado y metadatos compatibles. | Revisar remoto, cambios sin subir, borradores e historial ausente; no afirmar que todo Git se convirtió a Drive. |
| OneDrive ↔ Google | Mismo proyecto e identidades documentales; copiar y verificar al nuevo destino. | Generación nueva de asociación, sin activar dos escritores. |
| Mismo proveedor → otra cuenta/carpeta | Mismo mecanismo de migración. | Conectar el destino para ese proyecto y conservar las credenciales usadas por otros; no sustituir globalmente sus tokens. |
| Proveedor → GitHub | Conservar originales y preparar publicación Git en destino nuevo/vacío. | Dispositivo con Git nativo; comprobar formatos, tamaño, política del repositorio e historial. |
| Proveedor → local | Mantener toda la copia local disponible y detener esa asociación en este dispositivo. | Explicar que otros dispositivos y copias remotas siguen existiendo; no es un borrado global. |
| Hacia/desde Proton directo | Migrar contenido verificado conservando proyecto, cuenta y generación explícitas. | Confirmación SDK remota antes de activar; destinos no operativos permanecen pendientes. |

En Android, una transición que requiera crear/publicar Git se muestra como no disponible y propone hacerla desde Windows; después Android puede usar los proveedores soportados. No llamar migración completa a exportar un ZIP o a cambiar una etiqueta.

### Migración segura y ágil

1. **Precomprobar:** identidad del proyecto, origen/destino, permisos, espacio, tamaño, nombres, dependencias e inventario. Proponer destino nuevo y gestionado; un destino no vacío sólo puede reutilizarse si coincide con el mismo intento verificable. Mezclar proyectos remotos existentes se aplaza.
2. **Conciliar el origen:** revisar cambios recibidos y guardados pendientes. Los borradores pueden guardarse por los controles existentes o permanecer locales, siempre visibles. Los conflictos sin resolver impiden una migración ordinaria; no se elige una variante por conveniencia.
3. **Preparar en segundo plano:** capturar una revisión estable y copiarla a un destino todavía inactivo. Se permite seguir editando localmente. La asociación de origen se conserva; tras la revisión inicial se pausa su envío automático desde este dispositivo y se acumulan nuevos cambios, sin prometer pausar otros equipos.
4. **Verificar y alcanzar el estado final:** hashes, inventario, dependencias y recibos del destino; aplicar el delta de lo editado durante la preparación. Volver a consultar el origen. Si hay cambios ajenos, conciliarlos antes de finalizar. Una barrera local breve evita un guardado a mitad del cambio de asociación; si no se puede cerrar, conservar el proyecto editable y la migración pendiente, sin bloquear la UI durante la red.
5. **Activar:** persistir de forma recuperable la nueva asociación y su generación, manteniendo un solo envío automático desde este dispositivo. La UI informa por separado «Activo en este dispositivo» y los otros equipos aún pendientes. No afirmar una transacción atómica entre proveedores ni que el origen se congeló globalmente.
6. **Conservar y orientar:** mantener el origen intacto, mostrar dónde continúa la copia y cómo reconectar los demás equipos. La retirada remota, revocación de accesos o borrado son operaciones posteriores independientes; ninguna forma parte automática del asistente.

Antes de activar, cancelar mantiene la asociación anterior, consulta intentos inciertos y ofrece reanudarla de forma segura. Las preparaciones remotas sólo se limpian cuando pertenecen al intento y están verificadas. Después de activar, «Volver al proveedor anterior» ejecuta otra migración incluyendo cambios nuevos; no restaura a ciegas una configuración antigua.

Si el origen es inaccesible, ofrecer **«Continuar desde la copia local disponible»** como recuperación con alcance visible. No garantiza cambios guardados sólo en otros dispositivos. No anunciar una migración integral si no se pudo conocer el origen.

En Proton directo se verifica resultado remoto antes de activar. Timeout no demuestra fracaso ni éxito: conservar intento y consultar antes de repetir. Estado antiguo por carpeta requiere revisión/importación explícita; nunca convertirlo automáticamente en conexión cloud.

### Otros dispositivos y cambios tardíos

La identidad lógica del proyecto es independiente de proveedor y cuenta; cada asociación tiene una generación diferente. Los clientes compatibles comprueban esa generación antes de enviar tras reabrir/reconectar. El destino anterior puede recibir un aviso de traslado mínimo cuando el formato y permisos lo permitan, sin secretos ni direcciones privadas; la recepción y verificación de ese aviso también es una operación rastreable.

Un equipo no cambia de cuenta ni obtiene credenciales automáticamente: muestra «Este proyecto cambió de sincronización» y permite conectar el nuevo destino, reutilizando y conciliando su copia local. Si no hay identidad portable previa en un proyecto GitHub, la primera adopción necesita una asociación revisada; no se infiere por nombre de carpeta.

No es posible impedir desde KnowNext que un cliente antiguo, un dispositivo desconectado o una aplicación externa siga escribiendo al proveedor anterior. El origen se conserva como copia anterior, no como remoto técnicamente bloqueado. Las aportaciones tardías se consultan/importan mediante revisión explícita; nunca se inicia una sincronización permanente de ida y vuelta entre ambos destinos. Si no se puede conocer el estado de un dispositivo, se muestra «sin confirmar», no «actualizado».

### Qué significa conservar historial

Conservar el Git local durante el cambio es obligatorio cuando existe. Transportar su historial a otro dispositivo es una opción distinta: archivo portable verificado mediante la capacidad existente, con sus límites, sin copiar `.git` vivo ni activar hooks/configuración. A falta de ese archivo, la UI dice «Historial anterior conservado en este dispositivo», no «Historial migrado».

Al volver a GitHub se puede usar el historial local compatible o iniciar una historia desde el contenido actual conservando el historial anterior aparte, con elección explícita. No convertir revisiones Drive en commits equivalentes ni hacer force-push/reescrituras para encajar una migración. Un objeto grande existente sólo en commits antiguos también puede impedir subir ese historial.

Comprobar límites del destino antes de transferir: GitHub bloquea archivos mayores de 100 MiB en Git ordinario. Sin soporte LFS validado, ese caso se bloquea con alternativas que conservan el archivo; no se excluye ni se convierte automáticamente. [Límites oficiales](https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github). Un archivo puntero LFS no equivale al contenido: verificar que el objeto real esté disponible antes de dar por completo el inventario.

## 8. Reglas de integridad y conflictos

La conciliación usa una base común y revisiones causales; la hora del dispositivo y «último en guardar gana» no deciden qué contenido conservar. Los locks locales coordinan procesos de ese dispositivo, nunca los dispositivos entre sí.

| Situación | Comportamiento requerido |
|---|---|
| Sólo cambia un lado, base conocida | Incorporar cuando el destino local esté limpio y revalidado. |
| Ambos producen el mismo contenido | Unificar sin duplicar documentos ni eventos. |
| Cambios concurrentes en Markdown | Conservar base y ambas variantes; comparación y combinación revisada. Una combinación determinista puede proponerse, no imponerse silenciosamente. |
| Cambios en nota manuscrita/audio/binario | Mantener ambas copias y elegir; no intentar fusión textual. |
| Borrado frente a edición | Conflicto, con contenido recuperable; nunca ganar el borrado por fecha. |
| Movimiento frente a edición | Seguir identidad de documento; resolver sobre la nueva ubicación si es inequívoca, si no revisar. |
| Mismo nombre para dos identidades | Mostrar colisión; no tratar nombre igual como archivo igual. |
| Mayúsculas, Unicode o nombres no portables | Diagnóstico y renombrado revisado antes de materializar. |
| Documento abierto o borrador pendiente | Proteger ambos estados; actualizar sólo con revisión de la base actual. |
| Recibo perdido o timeout tras subida | Consultar la identidad del intento antes de repetir; no crear otra operación con otro ID. |
| Carpeta remota ausente, permisos revocados o listado parcial | Pausar/reinventariar; ausencia no prueba borrado intencionado. |
| Borrado grande o anomalía de inventario | Detener la propagación y mostrar revisión con alcance; no restaurar ni borrar masivamente por iniciativa automática. |
| Lote recibido parcialmente | No activar un documento que dependa de recursos todavía incompletos; informar y reanudar el conjunto. |
| Versión de protocolo futura | Conservar bytes y pausar; no normalizar ni vaciar metadatos desconocidos. |

No se presupone que OneDrive o Google hagan la fusión documental de KnowNext. El SDK Proton tampoco decide conflictos del proyecto: publicaciones inmutables y bases verificadas, sin JSON mutable compartido como única autoridad.

## 9. Historial, recuperación y respaldo

El historial Git local existente continúa en los dispositivos compatibles. Los documentos recibidos pasan por los servicios de publicación y versionado del dispositivo; no se copian `.git`, hooks, índice ni configuración entre equipos. Los commits resultantes pueden diferir entre dispositivos. Sincronizar documentos no promete un único historial Git global; GitHub sigue cubriendo el transporte Git actual.

Las revisiones técnicas del motor permiten detectar divergencias y recuperar copias durante su retención, pero no se presentan como todas las funciones de historial Git en Android. Transportar un archivo portable de historial puede ofrecerse como respaldo explícito mediante la capacidad existente, sin activarlo automáticamente.

Reutilizar copias locales verificadas para la recuperación inicial. Añadir envío programado a una ubicación remota separada es una ampliación posterior, no una dependencia del primer conector. Guardar en la misma cuenta protege frente a ciertos errores, pero no frente a pérdida de la cuenta. La UI distinguirá «sincronizado», «copia local» y «copia externa» sólo cuando cada hecho esté comprobado.

Retención inicial: conservar estado actual, bases necesarias, variantes en conflicto e intentos no confirmados, con cupo y aviso accionable. Reutilizar la limpieza/recuperación existente cuando sea compatible. Políticas nuevas de días, snapshots históricos remotos y recolección distribuida quedan fuera del núcleo inicial; no se promete retención ilimitada ni se elimina contenido necesario al alcanzar cuota. Las preparaciones abandonadas propias pueden retirarse mediante revisión; un dispositivo desconectado largo tiempo no autoriza purgar sus bases sin retiro/reincorporación seguros.

## 10. UX/UI

### Crear/abrir proyecto

Mantener «carpeta local» como base. Separar las intenciones «Crear proyecto», «Abrir proyecto sincronizado» y «Cambiar sincronización». Cada asistente usa tres pasos: elegir destino/proyecto y cuenta, comprobar, finalizar. Seleccionar un proveedor muestra «Conectar cuenta» sin pasar antes por los ajustes globales; reutilizar una conexión existente cuando corresponda.

Proponer automáticamente ubicación local y espacio remoto gestionado, con «Cambiar ubicación» secundario. La revisión normal muestra un resumen corto; sólo incompatibilidades, contenido sensible adicional o cambios de alcance requieren decisiones extra. El botón final expresa la acción («Activar OneDrive» o «Cambiar a Google Drive»); no repetir la confirmación en cada paso. Un error recuperable conserva el avance y ofrece reintento.

Proton muestra «Conectar con Proton», navegador y elección de proyecto remoto, con sesión recordada. Mientras no esté operativo, mostrar disponibilidad pendiente sin abrir el selector de carpeta antiguo. Cuenta/destino fuera del editor.

### Espacio de trabajo

- Selector: proveedor y estado compacto junto al proyecto, sin otra barra lateral permanente.
- Cabecera/documento: guardado local separado del envío; el naranja se reserva para acciones, no para colorear todos los archivos.
- Panel derecho contextual «Sincronización»: pendientes, transferencias, conflictos y última comprobación. Cerrarlo no cancela trabajos.
- Árbol: indicadores discretos sólo para pendientes/conflictos; acciones en contexto/hover, sin botones permanentes ni nuevo buscador en la cabecera.
- Configuración: panel izquierdo con categorías; sección «Cuentas y sincronización» para conexiones y sección del proyecto para su asociación.
- Móvil: el panel contextual se adapta a una hoja/pantalla navegable; texto legible, foco restaurado y objetivos táctiles de al menos 44 px.

Estados de producto: «Sin conexión; trabajo local disponible», «Pendiente de enviar», «Recibiendo cambios», «Sincronizado con [proveedor]», «Revisar 2 conflictos», «Cuenta desconectada», «Espacio insuficiente», «Sincronización pausada». Cada error muestra una acción concreta y el alcance afectado.

Presentación habitual: una línea «Guardado · OneDrive al día» o «Guardado en este dispositivo · 2 cambios pendientes». El detalle conserva revisión y última comprobación, sin afirmar que ningún equipo desconectado tiene cambios. Un estado sano no produce toast ni animación repetida. Sólo se interrumpe el trabajo ante una decisión que afecta a datos; los demás avisos permanecen en el indicador/panel.

Distinguir «Guardado en este dispositivo», «Pendiente de sincronizar» y «Al día con Proton» por revisión. Recepción en otro equipo es diferente; cambios nuevos no quedan ocultos por acuse de revisión anterior.

### Conflictos

Lista breve con documento, causa y dispositivos; comparación de contenido y acciones «Conservar esta versión», «Usar la recibida», «Conservar ambas» y «Combinar». Elegir aplica una nueva resolución referida a las variantes actuales. Si cambian mientras se revisan, se pide refrescar la comparación. No mostrar ramas Git ni hashes como información principal.

### Configuración habitual y avanzada

Habitual: cuenta/destino, automática/manual, pausa y «Cambiar sincronización». Avanzada: alcance, uso de red, cupo, dispositivos y diagnóstico redactado; audio/retención avanzada sólo cuando existan. Al desconectar una cuenta compartida por varios proyectos se muestra su impacto y se permite cancelar; cambiar un proyecto nunca debe desconectar los demás accidentalmente.

## 11. Seguridad, privacidad y operación

- Autenticación en navegador (OAuth Microsoft/Google; vinculación de sesión oficial Proton) y mecanismos soportados por plataforma; tokens permanecen en Rust/puente nativo y almacén seguro, nunca en React, logs, backups ni carpetas sincronizadas.
- Para Microsoft/Google, identidades OAuth registradas y redirects verificables para Windows y Android; no asumir que un secreto embebido es confidencial. Revocar una cuenta pausa sólo sus asociaciones.
- En Windows, Google documenta retorno loopback con PKCE; sería un receptor efímero sólo de autenticación, sin API de producto ni proceso adicional. Documentar su encaje con la prohibición de servidor runtime antes de implementarlo. Android necesita la vía nativa soportada y no reutiliza ese retorno. [OAuth nativo](https://developers.google.com/identity/protocols/oauth2/native-app).
- Validar rutas, tamaños, tipos, esquema, identidad y hashes antes de publicar contenido recibido. Tratar datos remotos como no confiables; no ejecutar hooks, enlaces o trabajos recibidos. Hash aporta integridad, no prueba de autoría frente a quien controla la cuenta.
- Sólo dominios/endpoints autorizados; no filtrar bearer tokens a redirects o URLs de subida ajenas al contrato. URLs de sesión y cursores también son información sensible.
- Transferir con los mecanismos seguros del proveedor. No prometer el mismo modelo de cifrado de Proton para OneDrive/Google ni cifrado adicional propio. La copia local sigue teniendo la protección del dispositivo; sincronizar con Proton no cifra por sí solo el proyecto local.
- Las políticas del proveedor o del tenant pueden impedir una función. Diferenciar autenticación, permiso, cuota, red y formato; nunca degradar a acceso más amplio de forma silenciosa.
- No hay llamadas IA en el motor ni en su campaña de prueba. Una sincronización de documento no autoriza a enviarlo después a un proveedor IA.

## 12. Criterios observables propuestos

| ID | Criterio de aceptación |
|---|---|
| SC-C01 | Abrir y editar offline conserva bytes y borradores; el fallo de red no invalida un guardado local correcto. |
| SC-C02 | Un proyecto existente sin sync y uno GitHub conservan modos, documentos e historial tras migrar el registro. |
| SC-C03 | Publicar y abrir en un segundo dispositivo conserva rutas, Markdown, recursos y metadatos incluidos; exclusiones son visibles. |
| SC-C04 | Dos dispositivos editando el mismo documento conservan ambas variantes y resuelven sin sobrescritura silenciosa. |
| SC-C05 | Renombrar/mover/borrar frente a editar produce la conciliación prevista, incluidos nombres incompatibles Windows/Android. |
| SC-C06 | Un documento abierto con borrador no se sustituye al recibir cambios ni por un acuse tardío. |
| SC-C07 | Subida/descarga cortada y acuse perdido se consultan/reanudan sin duplicar efectos; un contenido incompleto nunca es «sincronizado». |
| SC-C08 | Token revocado, cuota agotada, 429/5xx y cursores inválidos dan estado accionable conservando la base local. |
| SC-C09 | Permiso perdido o inventario parcial no provoca una cascada de borrados. |
| SC-C10 | Cuenta equivocada o raíz no vacía no se asocia ni mezcla sin revisión. |
| SC-C11 | `.git`, secretos, locks, colas y cachés quedan excluidos antes de abrir/consultar metadatos de nombres reservados. |
| SC-C12 | OneDrive supera sus recorridos completos en cada tipo de cuenta anunciado, Windows y Android. |
| SC-C13 | Google supera los mismos recorridos con los permisos anunciados, sin requerir secretamente acceso completo. |
| SC-C14 | Proton directo sin su cliente instalado, sesión recordada y contenido Windows↔Android íntegro ante llegadas parciales/concurrentes, con estado remoto veraz. |
| SC-C15 | Conectar y renovar OAuth funciona en binarios nativos; migración de credenciales preserva GitHub/IA y no expone tokens. |
| SC-C16 | Desconectar, cambiar proveedor y reincorporar dispositivo antiguo conserva originales y pendientes; no duplica identidades. |
| SC-C17 | Recuperar una versión o copia conserva archivos actuales y permite revisión; retención no elimina bases/conflictos/pendientes. |
| SC-C18 | Audio detenido/nota/acta mantienen sus relaciones; recibir datos no ejecuta captura, transcripción ni IA. |
| SC-C19 | UI funciona con teclado, lector, tacto y anchos reducidos; se distingue guardar, versionar, sincronizar y respaldar. |
| SC-C20 | Durante una transferencia representativa se puede guardar y cambiar de documento; medición ligada a hardware y corpus, sin baselines inventadas. |
| SC-C21 | Manipulación remota, ruta traversal, symlink, tamaños excesivos y protocolo futuro se rechazan conservando originales. |
| SC-C22 | La operación anunciada como completada corresponde a la revisión exacta; editar mientras se envía deja la nueva revisión pendiente. |
| SC-C23 | Cambiar de proveedor conserva identidad local/lógica, IDs documentales, rutas relativas, enlaces, pestañas y contenido; no registra un proyecto duplicado. |
| SC-C24 | Local↔OneDrive, GitHub→OneDrive, OneDrive↔Google y vuelta a GitHub/local se verifican en plataformas compatibles; cada limitación se explica antes del efecto. |
| SC-C25 | Una migración interrumpida en cualquier fase se consulta/reanuda por el mismo ID; antes del cambio mantiene el origen y después conserva una asociación inequívoca. |
| SC-C26 | Ediciones hechas durante la preparación llegan al destino o permanecen explícitamente pendientes; no quedan ocultas tras el cambio. |
| SC-C27 | Otro dispositivo recibe/revisa el cambio de asociación y conserva cambios offline; un cliente antiguo que sigue escribiendo al origen no se anuncia como detenido. |
| SC-C28 | Volver al proveedor anterior después de editar en el nuevo conserva las modificaciones nuevas mediante otra migración. |
| SC-C29 | El preflight detecta contenido no compatible, objetos históricos grandes y punteros sin contenido; omisiones nunca se convierten en migración completa. |
| SC-C30 | Cambiar cuenta/destino o volver a local conserva las copias y no desconecta asociaciones ajenas; destino ocupado no se fusiona automáticamente. |
| SC-C31 | Con origen inaccesible o confirmación remota insuficiente, la UI diferencia recuperación local/preparación de migración verificada. |
| SC-C32 | Alta y cambio normales completables en tres pasos del asistente, aparte del login externo; estado recordado tras error y sin confirmaciones repetidas. |
| SC-C33 | Un usuario identifica si el documento está guardado y si puede continuar en otro equipo mediante los estados, sin comprender el protocolo; el estado sano no interrumpe. |
| SC-C34 | La comparación de inventarios demuestra qué contenido/historial se transfiere, permanece local o necesita intervención; todas las variantes en conflicto conservan acceso. |

## 13. Decisiones por cerrar antes del desarrollo dependiente

| Decisión | Recomendación de esta propuesta | Impacto si cambia |
|---|---|---|
| Integración Proton | SDK directo y sesión recordada Windows/Android decididos; puente concreto/distribución a resolver en P0. | Si no es viable, aplazar Proton; no sustituir por carpeta. |
| Espacio remoto | Espacio gestionado por KnowNext para comenzar; importar carpetas existentes como operación revisada. | Sincronizar libremente cualquier carpeta amplía permisos y conflictos con editores externos. |
| Edición directa en la web/otros clientes | No prometer edición concurrente arbitraria del almacén técnico; detectar alteraciones y recuperar/importar mediante revisión. | Requiere contrato fuerte de escritura condicional por proveedor o una modalidad adicional. |
| Contenido privado/audio | Documentos y recursos base incluidos; audio y datos privados opcionales. | Afecta cuota, privacidad y el significado de proyecto completo. |
| Historial global | Git local según plataforma; transporte Git existente por GitHub. | Igualar historial Git entre dispositivos con Drive sería otra capacidad. |
| Segundo plano | Primer alcance con proceso disponible; reanudación al abrir. | Proceso cerrado en Android exige planificación nativa y aceptación adicional. |
| Retención | Recuperación protegida y copias separadas; valores finitos tras medición. | Una cuota pequeña no puede garantizar retención ilimitada. |
| Migración inicial | Incluir el asistente desde el primer conector, destinos nuevos/vacíos y conservación del origen. | Mezclar remotos ocupados o coordinar clientes antiguos globalmente amplía mucho el alcance. |
| Cuenta por proveedor | Predeterminada simple y asociaciones por proyecto; conectar otra cuenta dentro de la migración sin alterar las existentes. | Un único token global obligaría a desconectar proyectos ajenos y no satisface la migración. |

Estas recomendaciones se subordinan a la aclaración de sección14 y al plan revisión3. Al reanudar, P0 resuelve el puente Proton y los contratos pendientes antes de desarrollo dependiente; no se ejecuta una prueba en esta fase documental.

## 14. Corrección: Proton directo y sesión persistente

Proton primero se mantiene mientras el usuario gestiona Microsoft/Google. Se retira la interpretación por carpeta; P-C01–P-C08 son criterios históricos del corte avance02, no aceptación vigente. Conservar evidencia y datos. Corrección de código en P1, todavía no ejecutada.

| ID | Criterio observable |
|---|---|
| PD01 | KnowNext Windows/Android sin cliente Proton ni CLI conecta y sincroniza un proyecto común. |
| PD02 | Login navegador, intento cancelable/caducable, cuenta identificada y alcance explicado; sin contraseña en KnowNext ni secretos en UI/logs. |
| PD03 | Cerrar/reiniciar/reabrir al día siguiente permite guardar/sincronizar sin login habitual; cada dispositivo mantiene su sesión. |
| PD04 | Token caducado se renueva serializadamente; red/429/5xx no borran credenciales ni pierden cola. |
| PD05 | Revocación/sesión irrecuperable pide reconectar sólo la cuenta afectada conservando documentos y asociaciones ajenas. |
| PD06 | DPAPI/Keystore protegen sesión/material criptográfico; migración preserva GitHub/IA, exportaciones sin secretos e identidad de dispositivo no clonada. |
| PD07 | Intercambio de todas las familias incluidas con bytes/IDs/enlaces íntegros y confirmación por revisión; sin Git obligatorio. |
| PD08 | Guardar activa cola sin bloquear edición; offline deja pendientes y abrir/red/reanudar continúa sin reenvío completo innecesario. |
| PD09 | Transferencia/recepción parcial, cierre o acuse perdido se recuperan por mismo intento, sin duplicados ni pérdida de cambios posteriores. |
| PD10 | Ediciones/mover/borrar concurrentes y borradores conservan variantes; resolución visual y revisión obsoleta rechazada. |
| PD11 | Cuotas/inventario/limpieza preservan bases, conflictos, pendientes y desconocidos; cuota remota no inventada ni purga por ausencia de réplica. |
| PD12 | Local↔Proton/GitHub↔Proton donde compatible, cuenta/raíz y estado antiguo por carpeta revisados/migrados sin duplicar proyectos ni perder historial local; retorno/reinicio seguros. |
| PD13 | SDK/cuenta/cifrado/ABI fijados y actualizables; condiciones de distribución/límites documentados. Etiqueta beta no acredita producción. |
| PD14 | Plan/UI/capacidades/checklist/reportes no exigen cliente/carpeta Proton; rutas antiguas sólo para recuperación controlada, sin nuevas asociaciones. |

Aceptación real con cuenta/corpus sintéticos, no instalación Proton Drive. Se reanuda desarrollo y validación local desde P0; no login ni transferencias de cuentas reales en este corte.
