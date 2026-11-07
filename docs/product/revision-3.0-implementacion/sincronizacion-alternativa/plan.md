# SC01 · Plan de implementación corregido

Fecha: 2026-11-06. Revisión3. **Proton directo en Windows y Android, sesión persistente. Implementación reanudada por orden del usuario; P0 nativo contrastado experimentalmente; integración de cuenta pendiente y retirada inicial del flujo por carpeta validada.**
[Definición y aceptación](tarea.md) · [Programa 3.0](../plan.md).

## 1. Decisión, autoridad y estado real

El usuario quiere conectar KnowNext a Proton mediante autenticación y SDK, sin instalar Proton Drive. Debe recordar la conexión después de cerrar y reabrir. La interpretación de «Proton primero» como aceptación del transporte por carpeta fue incorrecta y queda retirada. Que el usuario pudiera instalar el cliente no convierte ese mecanismo en el producto solicitado.

La nueva orden «Retoma la implementación de Proton con el plan corregido. Usa 4 agentes coordinados» levanta la pausa y autoriza desarrollo, integración y comprobaciones locales proporcionadas, empezando por P0. Microsoft/Google quedan aplazados. Sin publicación, gasto IA, datos personales ni contacto con Proton. No se inicia sesión por cuenta del usuario.

Existen cambios locales SC01 sin consolidar. El transporte por carpeta sigue conservado como legado; en este corte se retira su alta y escritura pública, conservando consulta/estado y desconexión segura. Recuperación/migración integral de estados antiguos sigue pendiente. No hay conexión directa, sesión persistente ni sincronización Windows–Android implementadas. Pruebas anteriores acreditan sólo su alcance original. C1 y matrices50/70 conservan su alcance; no cuentan como progreso de Proton directo.

Se aplica lks-sdd-define; doctor: unbound, plugin instalado sin runtime consumidor. No instalación/migración SDD. Este plan sustituye el anterior; tarea.md mantiene reglas funcionales comunes. Responsable de ejecución: coordinador Codex; responsable de producto: usuario.

## 2. Resultado que se entregará

1. Configuración → Conectar con Proton → navegador de Proton → cuenta conectada.
2. Elegir/crear proyecto remoto gestionado por KnowNext, revisar alcance y confirmar sincronización automática.
3. Guardar localmente y enviar cambios mientras KnowNext pueda ejecutarse; un fallo cloud no invalida Guardar.
4. Reabrir al día siguiente, recuperar/renovar sesión y continuar sin login habitual.
5. Conectar una sesión propia en el segundo dispositivo y abrir el mismo proyecto remoto.
6. Recibir cambios compatibles, proteger borradores y resolver divergencias sin pérdida.
7. Pausar, desconectar o cambiar sincronización conservando contenido e historial local.

Estados: Guardado en este dispositivo; Pendiente de sincronizar; Sincronizando; Al día con Proton; Sin conexión; En pausa; Necesita revisión; Volver a conectar. El estado remoto se liga a una revisión exacta; no prueba recepción en otro equipo. Sin detalles de protocolo en el recorrido normal.

Incluye Markdown, carpetas, imágenes/adjuntos, notas manuscritas y recursos, actas/transcripciones guardadas y metadatos portables permitidos. Audio finalizado y datos privados IA permanecen como ampliaciones explícitas. No SOLO CLOUD, réplica de .git, espejo remoto editable libremente, dos autoridades activas ni servicio permanente. Android reanuda al volver a la app; recordar sesión no promete sincronización con proceso cerrado.

## 3. Base oficial y decisiones P0

La inspección previa revisó el paquete TypeScript0.23.0 y código oficial05c9115955589d9f6ab7392a36f8f0cb39327133 (2026-11-05). No demuestra ejecución ni paridad C#/Kotlin.

- [Cliente publicado](https://unpkg.com/@protontech/drive-sdk@0.23.0/dist/protonDriveClient.d.ts): archivos, revisiones, mover/renombrar/papelera y eventos.
- [Cuenta en incubación](https://github.com/ProtonDriveApps/sdk/blob/05c9115955589d9f6ab7392a36f8f0cb39327133/incubating/account/js/src/auth.ts): authViaWeb y vinculación de sesión.
- [Configuración](https://github.com/ProtonDriveApps/sdk/blob/05c9115955589d9f6ab7392a36f8f0cb39327133/cli/src/config.ts): external-drive distingue terceros del cliente oficial.
- [Renovación](https://github.com/ProtonDriveApps/sdk/blob/05c9115955589d9f6ab7392a36f8f0cb39327133/incubating/account/js/src/apiClient.ts): renovación serializada; logout local no prueba revocación remota.
- [Lenguajes](https://github.com/ProtonDriveApps/sdk/blob/05c9115955589d9f6ab7392a36f8f0cb39327133/client/README.md) y [ABI C](https://github.com/ProtonDriveApps/sdk/blob/05c9115955589d9f6ab7392a36f8f0cb39327133/client/cs/headers/proton_drive_sdk.h): TypeScript/C# y enlaces Kotlin en incubación.
- [Estado y condiciones](https://github.com/ProtonDriveApps/sdk/blob/05c9115955589d9f6ab7392a36f8f0cb39327133/README.md): terceros en producción aún no soportados y migración criptográfica prevista. Licencia del código no equivale a autorización de cualquier distribución conectada.

P0 debe cerrar:
- Ruta preferida: SDK nativo dentro del proceso, orquestado por Rust/Tauri (ABI C y puente Kotlin donde proceda), sin CLI, sidecar, servidor ni runtime instalado aparte.
- Compilación/enlace y equivalencia de métodos, cifrado, callbacks y cancelación Windows x64/Android arm64; emulador no acredita ARM físico.
- Adaptación de autenticación desde código oficial manteniendo secretos nativos; no inventar endpoints ni criptografía Drive.
- Fijar versiones compatibles de cliente/cuenta/cifrado/enlaces y plan de actualización; no mezclar latest con módulos internos.
- Separar viabilidad experimental y condiciones de distribución. Confirmación de Proton/documentación vigente puede condicionar entrega pública; no contactar sin autorización.
- SDK TypeScript sólo como alternativa documentada si cambia el diseño: APIs Node a adaptar, residencia de claves y ciclo de vida; no mover secretos a React silenciosamente.

Si falla P0, registrar bloqueo concreto. No reemplazar el requisito por carpeta externa ni entregar sólo Windows como equivalente.

## 4. Corregir y aprovechar el código anterior

| Ámbito | Acción al reanudar | Garantía |
|---|---|---|
| cloud_providers.rs, CloudSyncDialog, ProtonSyncPanel | Retirar alta por carpeta y mensajes del cliente externo; disponibilidad directa desactivada hasta recorrido real. | No ofrecer un conector ficticio. |
| protonSync API/tipos/rutas | Sustituir folderPath por cuenta, raíz remota y binding versionado. | No reinterpretar asociación antigua como autenticada. |
| proton_sync.rs y appData/proton-sync | Detectar estado antiguo, revisar/importar contenido y recuperar intentos. | Conservar outbox/recovery/recibos; no despejar parciales descartando trabajo. |
| knownext-sync-folder | Extraer sólo captura/manifiestos/hashes/causalidad/exclusiones útiles. | CFAPI y filesystem no son transporte Proton; evitar nuevo framework innecesario. |
| cloud_sync/reconcile, portabilidad/publicación | Reutilizar funciones compatibles tras revisar contratos. | Handoff local no es recibo cloud; no asumir CAS. |
| Credenciales y guardas proyecto/GitHub | Migración explícita y autoridad única. | Preservar GitHub/IA y asociaciones ajenas. |
| Pruebas y reportes01/02 | Conservar evidencia histórica; reutilizar casos puros no afectados. | No contar filesystem/CFAPI como SDK/auth/Android. |

No borrar carpetas, datos privados o cambios locales al corregir. Si no hubo uso del flujo anterior, no inventar migración. Si lo hubo, revisar pendientes/inventarios/hashes, importar al destino directo y conservar intercambio como copia hasta decisión explícita. Rutas antiguas sólo sirven a recuperación controlada, no a nuevas asociaciones.

## 5. Arquitectura y contratos

React presentación → API tipada → comandos Tauri finos → servicios Rust de cuenta/sync → adaptador SDK oficial → Proton.
knownext-storage mantiene la autoridad de publicación local. Red/transferencia fuera del mutex global del editor.

P0/P1 fija contratos lógicos (no endpoints ya implementados):
- Cuenta: iniciar/consultar/cancelar login, estado redactado, renovación, desconexión local y revocación cuando esté soportada.
- Transporte: raíz, listado completo/paginado, eventos/cursor, lectura verificada, creación inmutable y consulta de intento antes de repetir.
- Proyecto: revisión/asociación, estado por revisión, sincronizar/pausar, recepción, conflictos, inventario/limpieza y migración recuperable.
- DTO sin secretos: AccountStatus, ProjectSyncBinding, SyncOperation/Receipt/Conflict/MigrationAttempt, IDs y timestamps.

Cuenta separada de proyecto/dispositivo. Binding: cuenta, raíz, identidad lógica, generación, política y protocolo. Varias asociaciones pueden usar una cuenta; cambiar una no desconecta las otras. Secretos DPAPI/Keystore fuera de proyectos/exportaciones/backups/logs. El esquema estricto debe migrar preservando GitHub/IA. Fallo de Keystore pausa cloud, no edición.

Auth: navegador, intento acotado/cancelable, selector/clave efímera sin logs, cuenta verificada antes de asociar, sesión por dispositivo y renovación única por cuenta. Red/429/5xx no equivalen a revocación. Explicar permisos reales: elegir carpeta no limita necesariamente el alcance de la sesión. No prometer OAuth estándar, token personal ni scopes no contrastados. Desconexión local y revocación remota tienen resultados distintos.

Transporte: espacio gestionado, objetos/revisiones inmutables y descriptor final verificado, IDs del proveedor y base causal. Cifrado a cargo del SDK. No confiar en nombres/reloj ni lectura-seguida-de-escritura. Borrado explícito/tombstone; ausencia en listado parcial no elimina nada. Eventos con cursor, recuperación de cursor inválido e inventarios completos acotados cuando proceda, no recursión continua.

Recepción: verificar conjunto, revalidar borradores/hashes bajo admisión breve, journal por elemento y copia previa. No anunciar atomicidad multiarquivo inexistente. Si cae tras escribir antes de confirmar, reconocer bytes/recibo y conservar cambios posteriores. Conflicto: base/local/remoto, conservar local/recibido/ambos; fusión Markdown revisada sin IA.

Automatización: guardado confirmado, agrupación de cambios aún no enviados, abrir/red/restaurar app como disparadores, eventos, concurrencia limitada y backoff. Cola durable ante suspensión Android, sin login repetido por error. Inventario local/remoto, cuotas finitas y reserva antes de copiar; limpieza revisada por hash protege bases/variantes/intentos/réplicas offline. Cuota remota exacta sólo con fuente demostrada; si no, desconocida y error de espacio manejado. Sin purga remota automática antes de política segura de compactación/reincorporación.

Migración común: reviewed → staging → verifying → ready → switching → active; estados waiting-confirmation/needs-review/uncertain/cancelled. Mantener intento, consultar efectos, conservar origen hasta cambio, absorber ediciones nuevas o mostrarlas pendientes. Binding durable y corto; volver tras editar es otra migración. Aviso/revinculación de réplicas; no prometer detener clientes antiguos. GitHub mantiene adaptador e historial propios, con límites Git de Android.

## 6. Backlog por entregas completas

Avance04: SDK nativo, sesión y motor directo implementados; candidatas aisladas Windows y Android API36/x86_64 autenticadas. Intercambio real en ambos sentidos con hashes idénticos y sesión recordada al reabrir; renovación real contrastada en Windows. Continúan aceptación ampliada y P5 parcial. Los bloques distinguen código disponible de validación real. Tamaños relativos; no son días ni compromisos de fecha.

| Bloque | Entrega y salida | Dependencia | Responsable / tamaño |
|---|---|---|---|
| P0 · Viabilidad y contrato | SDK/ABI/auth/cifrado viable en Windows/Android, versiones y condiciones documentadas, diseño elegido. | Reanudar; sin login en planificación actual. | Coordinador + proveedor / M, alta incertidumbre |
| P1 · Retirada y compatibilidad | Alta por carpeta retirada, estado antiguo recuperable, DTO/almacén versionados. | P0 contrato final; inventario/retirada aislables. | Coordinador + motor + UX / M |
| P2 · Conectar una vez | Navegador, cuenta, cancelación/2FA, protección, reapertura y renovación en ambas plataformas. | P0/P1; cuenta sintética para aceptación. | Proveedor + UX / L |
| P3 · Intercambio completo | Publicar/abrir/actualizar Windows↔Android, recursos e IDs íntegros, borradores protegidos, sin Git obligatorio. | P2 + adaptador | Motor + proveedor / L |
| P4 · Continuidad y conflictos | Automática/offline, mover/borrar concurrentes, acuse incierto, recuperación parcial y resolución visual. | P3 | Motor + UX / L |
| P5 · Almacén y migración | Cuotas/limpieza, Local↔Proton, GitHub↔Proton compatible, cuenta/raíz, reinicio/retorno/dispositivos antiguos. | P4 | Motor + coordinador + UX / L |
| P6 · Aceptación y candidata | Windows↔Android sin cliente externo, sesión recordada/renovada, QA nativa, revisión y regresión final única. | P1–P5 completos | Coordinador + revisión cruzada / M |
| S1 · OneDrive/Google | Conectores directos y registros del usuario; adaptar motor probado y validar cruces con Proton. | Registros + desarrollo restante; no bloquea Proton | Asignación posterior / L |
| S2 · Ampliaciones | Audio finalizado, privados, proceso cerrado según decisión futura. | Selección explícita | Fuera del núcleo |
| R · Publicación | Condiciones Proton vigentes, firmas/paquetes/update y autorización. | Aceptación + autoridad explícita | No autorizada |

P3 no cierra todo Proton; P6 exige ambas plataformas. P5 no simula migración hacia Microsoft/Google aún no operativos: sus cruces pertenecen a S1. Alcance y exclusiones visibles antes de conectar/cambiar proveedor.

## 7. Cuatro agentes al reanudar

Delegación real activada: coordinador + proton_windows_sdk (viabilidad Windows), proton_android_sdk (viabilidad Android) y proton_auth_review (autenticación/retirada UX). En P0 trabajan en ámbitos output/sc01-proton-p0/windows, android y auth; sólo el tercero edita CloudSyncDialog y su test. El coordinador posee runtime/capacidades/contratos nativos y documentación. Tras P0 se reasignará la división prevista:
- Coordinador: contratos compartidos, rutas/dispatch/registro, credenciales centrales, guardas de proyecto, integración/documentación y compilación final.
- Proveedor/auth: módulo o crate SDK y puente Android/sesión propios; entrega integración al coordinador, sin tocar archivos centrales.
- Motor: módulos delimitados de cola/conciliación/recepción/migración/retención y sus pruebas; no transporte ni UI.
- UX: cloudSync, API/tipos específicos pactados, estados y pruebas focales; tipos compartidos con propietario coordinador.

P0 fija interfaz antes de repartir implementaciones dependientes. P1 y preparación de P2 pueden avanzar en archivos independientes. P3–P5 se cierran por bloque con revisión cruzada. Un propietario por archivo y un responsable Cargo/Gradle; no compilaciones nativas duplicadas.

## 8. Validación proporcional

Validación focal en ejecución, sin suites completas ni gasto IA. El usuario ha confirmado que iniciará sesión personalmente cuando esté preparada la candidata; sólo se utilizará el proyecto sintético de QA. Por bloque:
- P0: compilación/enlace mínimo por plataforma e inspección contractual; sin campaña UI completa.
- P1/P2: migración de estado/credenciales, cancelar/caducar, refresh concurrente, error transitorio y cuenta equivocada. Login/2FA/reapertura real con corpus/cuenta sintéticos cuando se autorice conexión; caducidad de access token separada de prueba al día siguiente.
- P3/P4: eventos duplicados/desordenados, inventario truncado, caída en cada transición, disco/cuota, concurrencia y borradores; verificar bytes y estado durable. No llenar deliberadamente cuentas.
- P5: inventarios/hashes/IDs/historial antes/después, cancelación/reinicio por fase, réplica offline y retorno.
- P6: Windows↔Android sin cliente Proton, renovación real, UI teclado/tacto/accesibilidad y editor fluido. ARM físico no acreditado por emulador. Una regresión completa tras todo el alcance seleccionado; luego repetir sólo casos invalidados.

Reutilizar resultados con entradas vigentes; skipped/pending no son PASS. Cada hito informa implementación, comprobaciones/límites y reporte visual de UI real, no mocks como aceptación nativa. Sin gasto IA ni publicación. Estado remoto por revisión y recepción por segundo equipo son pruebas distintas.

## 9. Trazabilidad y progreso

P0/P1: PD01/PD12–PD14. P2: PD02–PD06/SC-C15. P3: PD07/SC-C01–C03/C10/C11/C18/C21/C22. P4: PD08–PD10/SC-C04–C09/C19/C20. P5: PD11/PD12/SC-C16/C17/C23–C31/C34 según destinos operativos. P6 verifica PD01–PD14 y SC-C14/C32/C33 en ambas plataformas. SC-C12/C13 y cruces completos C24 se cierran en S1; exclusiones nunca cuentan como implementadas.

- [x] Revisar código previo y corregir requisito/atribución de decisiones.
- [x] Actualizar definición, plan, programa, arquitectura y checklist.
- [x] P0 diseño viable y seleccionado; distribución pública conserva revisión propia.
- [ ] P1 retirada/migración sin pérdida.
- [ ] P2 aceptación completa: sesión persistente comprobada en ambas QA; queda caducidad/renovación Android.
- [ ] P3 aceptación completa: intercambio real del corpus sintético comprobado; quedan otras familias/operaciones.
- [x] P4 desarrollo: automatización, recuperación parcial, contabilidad y directorios causales. La aceptación ampliada por dispositivo se registra en P6.
- [x] P5 desarrollo: inventario, retención revisada, recuperación de intentos y migración conservadora. La campaña nativa y los destinos realmente contrastados se registran por separado en el avance05.
- [ ] P6 aceptación/candidata.
- [ ] S1 otros proveedores; S2 sólo si seleccionado; R no autorizada.

Paso actual: consolidar la aceptación real de conexión, persistencia y transferencia con SDK directo en candidatas aisladas Windows y Android. La oferta por carpeta sigue retirada; no se amplía ese camino. P5 integral y aceptación ampliada siguen pendientes.

## 10. Antecedentes

[Avance01](avance-01.md) y [recibo01](verificacion-01.json): base de conciliación/asistente/adaptadores acotados, sin conectores completos.
[Avance02](avance-02.md), [visual02](avance-02.html) y [recibo02](verificacion-02.json): manual por carpeta, 25casos Rust/15frontend/TypeScript según recibo; no SDK/auth/Android. Evidencia histórica, no backlog vigente.
C1: fuente736e7484, MSI a4dc873b, consolidación documentalfcff1636; verificar HEAD al ejecutar. Sin instalación/publicación/modificación de C1 en esta revisión.

## Avance03 · ejecución reanudada

Cuatro agentes reales han contrastado Windows/Android/auth, mientras el coordinador retiró nuevas escrituras por carpeta. [Reporte visual](avance-03.html) y [detalle](avance-03.md). Windows SDKNativeAOT/carga/ABI y crypto nativos correctos; Android JNI ARM64 enlazado contra AARoficial y carga real de SDK/crypto/JNI sobre emuladorAPI36x86_64 correcta; no ARM físico, cuenta ni cachéSQLite funcional. Auth offline5casos y adaptador nativo de cuenta compilado; sin login. UI8casos, TypeScript y Rust4contratos correctos; no suites completas. Siete contratos antiguos por carpeta quedan históricos ignorados, nuncaPASS; nuevos fixtures cubren consulta/desconexión/pending sin habilitar altas. P0 y P1 no se marcan completos: falta integración real de cuenta/plataforma y recuperación/migración integral. No se mantiene ningún bloqueo por falta de SDK10 o paquete privado sin reconocer el bootstrap público ya conseguido.

Decisión técnica de aquel corte: continuar por SDK nativo in-process. Avance04 sustituye el experimento AAR/JNI por puente NativeAOT común y crypto compilado desde fuentes oficiales para las dos plataformas, con caché en memoria. El antiguo experimento SQLite conserva su fallo y no se usa como almacenamiento del producto. Android requiere API29 y bibliotecas de 64 bits; se mantiene mínimo24 general con guarda de capacidad. SDK TypeScript no se introduce en React.

## Avance04 · integración directa y candidata

[Reporte visual](avance-04.html) · [Detalle y evidencia](avance-04.md). Implementados cuenta por navegador, sesión cifrada/journal, renovación, SDK dentro del proceso, objetos/manifiestos verificados, eventos, sincronización automática y espera progresiva, recuperación local antes de red, conflicto revisado y pausa/consulta independientes. Cuenta y asociación de proyecto se gestionan por separado. Backups Android excluyen credenciales y estado privado ligado al dispositivo.

Revisión cruzada corregida: resolución local con bytes sin cambios se publica como descendiente; una publicación propia demostrada por la cadena evita conflictos falsos A→B→A; acuses persistidos se contrastan con el contenido actual; se drenan marcadores en lotes finitos y se rechaza una publicación observada cuya huella cambie. Siete contratos directos y cuatro contratos de ámbito/legado correctos; cuatro casos nuevos del planificador, once previos reutilizados. No se suman ejecuciones repetidas como casos únicos.

| Bloque | Código / aceptación actual |
|---|---|
| P0 | ABI, crypto y HTTPS anónimo reales Windows y AVD Androidx64 correctos; revisión de distribución pendiente antes de publicar. |
| P1 | Altas por carpeta retiradas; lectura/conservación del legado correcta. Migración integral no cerrada. |
| P2 | Login real y cuenta recordada tras reabrir ambas candidatas. Renovación real Windows y nuevo sync SDK Android tras reapertura correctos; caducidad/renovación Android pendiente. |
| P3 | Windows publica dos archivos/400 bytes y Android los recibe íntegros; Android publica un tercero/104 bytes que Windows recibe automáticamente. Tres tamaños/SHA256 idénticos; aceptación de otras familias/operaciones pendiente. |
| P4 | Automatización/recuperación/conflictos implementados y pruebas focales correctas. Recepción automática Windows y acuse incierto Android recuperado mediante consulta, sin replay, comprobados con cuenta real. Concurrencia/cortes reales pendientes. |
| P5 | Cuota privada finita e inventario conservador disponibles. Limpieza/retención, migración integral y retorno pendientes. |
| P6 | Windows QA final y APK x86_64 final autenticadas con perfiles aislados: intercambio y reapertura correctos. SDK/navegador, recuperación de intento y árbol local sin Git correctos. APK ARM64 final compilada/firmada QA; aceptación física, ampliada y regresión final del alcance completo pendientes. |

Ninguna casilla de aceptación global se cierra por una compilación o por datos controlados de interfaz. Microsoft/Google, SOLO CLOUD y publicación mantienen sus exclusiones.

La campaña nativa detectó y corrigió un rechazo del alias del sistema Android dentro del proceso. Se resuelve la frontera privada validada y se reutilizan las guardas existentes de descendientes; no se modifica el registro de proyectos ni se relajan enlaces del usuario. Doce contratos focales (cuatro cloud y ocho directos) correctos después del arreglo; prueba única de admisión pausa/consulta correcta. El intento inicial Windows caducó sin cuenta vinculada; los accesos frescos posteriores se completaron personalmente por el usuario. No se renuevan intentos de login automáticamente ni se solicitan secretos por chat.

Actualización de aceptación: un nuevo acceso Windows adquirió la autorización y la conexión persistió al reabrir la candidata. Revisión y publicación del corpus sintético por la UI correctas; renovación real única y lectura SDK independiente de ambos blobs correctas. [Recibo](../../../../output/sc01-proton-p1/native/session-acceptance/receipt.json). No se ha esperado un día completo. La invitación del navegador a abrir Proton Drive se puede descartar: KnowNext usa el SDK y la autorización ya adquirida.

Corregida también la actualización del árbol: eventos después de sync/resolución manual (incluidos acuses inciertos) y comprobación existente cada 60 segundos para proyectos sin Git. Dos pruebas API nuevas; total 29 casos únicos. APK x86_64 final demostró un archivo nuevo visible sin reabrir dentro de 65 segundos. SDK/Rust no se recompilaron por este ajuste de frontend; sólo las aplicaciones que incorporan esos assets.

Aceptación actualizada: el usuario completó el acceso independiente Android; no se copió la sesión Windows. Android recibió los dos archivos Windows y publicó el tercero, recibido automáticamente en Windows. Los tres tamaños/SHA256 coinciden. La cuenta y asociación Android persistieron al detener/reabrir la QA; un sync SDK posterior finalizó sin login. El primer sync Android agotó la espera UI y mostró 504/Resultado pendiente; se consultó el intento hasta confirmar sin reenviarlo. Quedan renovación tras caducidad Android, aceptación física, cortes/concurrencia y P5 integral. No se ha esperado un día completo ni se publica.

Checkpoint final: modificación de un archivo ya existente en Android, 104→138 bytes mediante UID QA; Windows recibió automáticamente el nuevo SHA256 y conservó los otros dos archivos. Total final 538 bytes. Un único sync Android, también con espera UI agotada, sin repetirlo manualmente. No se atribuye este caso a Milkdown ni se usa su duración como promesa de rendimiento. [Recibo Windows](../../../../output/sc01-proton-p1/windows-candidate/cross-device-receipt.json).

Pendiente de P4/UX: tras ese delta, Android sigue mostrando una operación pendiente. Una consulta local directa al runtime a las21:18:57UTC confirma `state=ready`, `pendingOperations=1` y `remoteConfirmed=false`; no es sólo un texto visual antiguo. El diagnóstico local anterior mostraba cero marcadores, sin intentos/error y los bytes ya estaban recibidos en Windows. Causa sin confirmar; no se declara «Al día» final para ese cambio. Completar el diagnóstico de consistencia del estado y mejorar la recuperación visible de acuses lentos. [DTO público redactado](../../../../output/sc01-proton-p1/android-qa/existing-edit-direct-dto.json). Este límite no se oculta bajo el PASS de transferencia.

Revisión independiente P4: completar la replanificación cuando un archivo cambia localmente durante una recepción parcial (se conserva, pero el plan anterior puede seguir rechazándose) y propagar la retirada de directorios vacíos (la recepción actual crea los remotos). Son pendientes funcionales concretos; los contratos focales y el cruce sintético no los cierran. [Revisión](../../../../output/sc01-proton-p1/native/final-review.md).

## Avance05 · cierre de continuidad, retención y migración

Orden vigente del usuario: corregir la operación pendiente y completar recuperación, carpetas vacías, retención y migración con cuatro agentes, sin suites completas repetidas ni gasto IA. Autoriza implementación, integración y QA sintética local; no publicación ni documentos personales. Microsoft/Google y SOLO CLOUD conservan su exclusión.

Delegación real con ámbitos exclusivos: coordinador (rutas/contratos compartidos, integración, comprobaciones agrupadas y documentación); proton_session_runtime (motor `proton_direct.rs`, planificador y contratos de continuidad); proton_native_bridge (nuevo módulo `proton_direct/lifecycle.rs` y contratos de retención/migración); proton_lifecycle_ui (panel, API, tipos y pruebas frontend específicos). Los módulos se integran mediante una interfaz pactada; no hay edición simultánea de un archivo.

Secuencia: diagnóstico reproducible del pendiente; recuperación y convergencia de directorios; revisión/aplicación de retención con protegidos; migración revisada y recuperable conservando origen; integración UI, contratos focales agrupados y un hito de candidatas nativas. Reutilizar ABI, autenticación y pruebas no afectadas. La validación real usa sólo proyectos sintéticos; jamás repetir una escritura externa sin consultar su intento.

Estado: desarrollo y validación focal cerrados en Windows y Androidx86_64; candidatas Windows/Androidx64/ARM64 definitivas preparadas y verificadas, sin publicación. [Reporte vigente05](avance-05.html) · [Detalle05](avance-05.md) · [Recibo de cierre](../../../../output/sc01-proton-p2/final/acceptance-05.json). Cuarenta y siete casos backend únicos correctos: veinte directos, once de ciclo de vida, diez unitarios críticos, un carril Tauri y cinco contratos del marcador de cambios. Treinta y nueve casos únicos de interfaz/API, TypeScript/Vite y comprobación de paquete cliente correctos. Se reutilizan36casos backend y39frontend no afectados; sólo se comprueban6Git y5marcadores después de la revisión final, sin sumar repeticiones.

El pendiente Android quedó reproducido y resuelto: el sondeo creaba marcadores sin modificar documentos. P2 drenó los tres heredados normalmente y mantuvo cero tras una consulta y74,937segundos, sin borrado manual. La corrección final usa una lista positiva de escrituras y excluye también escaneos externos/vistas; Windows definitivo verifica esas rutas sin marcadores y sigue detectando cambios externos reales. Git trata nombres revisados como literales y conserva privados preparados fuera del commit.

Campaña nativa focal: cuenta/sesión conservadas, alta y baja de carpeta vacía entre Windows/Android, limpieza real104bytes con protegidos, recuperación del mismo intento tras reabrir, cancelación conservadora y Proton→local→origen Proton verificados. Mismos tres SHA, cuenta, proyecto e identidad lógica; retorno Windows con pendiente0/confirmación remota. Android recibió el aviso y la baja conservando su asociación; un fallo temporal de red se recuperó normalmente. [Recibos y entradas no afectadas](../../../../output/sc01-proton-p2/final/reused-evidence-inputs.json). Las rutas finales están contrastadas en Windows y APKx64: consultas/vistas no crean marcadores, fixture retirado, cuenta/archivos/asociación conservados. No se repitió la campaña de motor/retención/migración. ARM64 conserva verificación de paquete/firma/bibliotecas, sin aceptación física. P6 mantiene por separado ARM físico, caducidad/renovación Android,24h literales, interrupciones nativas forzadas durante escritura y distribución productiva; GitHub real mantiene su aceptación además de los contratos locales.
