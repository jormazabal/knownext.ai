# Avance05 · Continuidad, retención y migración Proton

**Desarrollo y QA focal cerrados. Candidatas QA listas, sin publicar.** 47 contratos nativos y 39 de interfaz/API aprobados; Windows final y Android final x86_64 comprobados. Paquete ARM64 final verificado, sin aceptación física. La evidencia P2 anterior se reutiliza dentro de su alcance y se distingue de los binarios finales. El [avance04](avance-04.md) conserva la aceptación anterior de conexión y transferencia.

[Reporte visual](avance-05.html) · [Plan vigente](plan.md) · [Cierre verificado](../../../../output/sc01-proton-p2/final/acceptance-05.json)

## Cambios implementados

- Estado: una lectura de la cola distingue pendientes comprobados de un error de inventario. Una confirmación anterior no reaparece durante una operación o tras una respuesta incierta; consultas acotadas recuperan el resultado sin repetir el envío.
- Recepción parcial: conserva archivos completados y copias; revisa los elementos pendientes si cambian sus bytes o aparece un borrador. Las variantes requieren una decisión actual.
- Carpetas vacías: altas y bajas causales, identidad y nacimiento verificables; nunca borrado recursivo. Recreaciones locales y bases antiguas sin identidad demostrada se conservan.
- Almacén: inventario completo acotado, presupuesto privado local, material protegido y limpieza con revisión, comprobación de otra copia, progreso durable, consulta, continuación y cancelación. Recibos de limpieza conservados en una ventana de 64 metadatos; no se purga el contenido remoto.
- Migración: revisión, preparación y verificación antes del cambio local. Conserva identidad, documentos e historial local. Cuenta/destino anteriores quedan recuperables; los cambios posteriores se muestran pendientes. Recuperación desde copia local exige una elección expresa y no se presenta como traslado integral.
- Réplicas: aviso de traslado sin adopción automática de otra cuenta; el nuevo motor bloquea publicaciones al origen anterior y conserva recepción/local. No se promete detener clientes antiguos.
- GitHub compatible: destino configurado, comprobación de antecedentes, versión revisada por identidad completa y envío ordinario sin forzar. Se bloquean archivos históricos grandes y punteros LFS sin soporte validado; no se transporta `.git` vivo.

## Coordinación y verificación

Cuatro agentes reales: coordinador (integración/rutas/admisión/GitHub/documentación), motor P4, ciclo P5 e interfaz. Ámbitos de archivos exclusivos y revisión cruzada antes de candidatas.

- Interfaz y API: 39 casos únicos aprobados en los dos archivos afectados; las repeticiones dirigidas no se suman como casos nuevos. Incluyen consulta acotada, error definitivo, respuesta antigua que llega tarde, pausa, limpieza interrumpida y confirmación de migración. Los cinco casos de recuperación afectados pasaron: destino real consultado, revisión guardada, cuenta ausente y dos recorridos previos ajustados al DTO completo. Las últimas fuentes están incorporadas a Windows P2 y a Android P2 instalado en QA.
- Rust final: 47 casos únicos aprobados, compuestos por 36 resultados reutilizados, seis de Git y cinco de consultas sin cambios. Los casos afectados se ejecutaron de forma dirigida, sin repetir suites completas ni sumar repeticiones. El [registro de reutilización](../../../../output/sc01-proton-p2/final/reused-evidence-inputs.json) acredita ocho entradas de motor, ciclo de vida, contratos e interfaz sin cambios.
- Se reutilizan autenticación/ABI/criptografía no afectados. No se repiten las suites completas ni se hacen llamadas de IA.
- La compilación QA reduce sólo los símbolos de depuración de `knownext-storage`; no cambia optimización, comprobaciones de integridad, configuración productiva ni dependencias restantes.

## Recorrido visual: componente real con datos controlados

Hay **17 vistas controladas**: quince del recorrido inicial y dos de la recuperación del destino guardado. Se comprobaron a 1280 y 390 px. No muestran una cuenta real, no hacen llamadas a Proton y no acreditan ejecución de Rust ni aceptación instalada. El [recibo inicial](../../../../output/sc01-proton-p2/ui/visual-result.json), el [acuse actualizado](../../../../output/sc01-proton-p2/ui/visual-result-ack.json) y la [recuperación del destino](../../../../output/sc01-proton-p2/ui/migration-recovery-visual-result.json) contienen huellas, geometrías y contadores. Sólo se repitieron los flujos afectados; los demás se reutilizan. Los recibos registran cero errores, tráfico HTTP y desbordamientos horizontales.

La campaña detectó un encabezado que seguía mostrando una confirmación anterior durante una espera incierta. Se corrigió el grupo: invalidar esa confirmación al empezar o fallar un envío, ignorar consultas antiguas que terminan después y distinguir un error al consultar conflictos del resultado del envío. El aviso principal utiliza lenguaje humano, sin duplicarlo con un código técnico en rojo. Sólo se volvió a comprobar el flujo afectado.

| Recorrido | Qué se puede revisar |
|---|---|
| Confirmación | [Espera sin «Al día»](../../../../output/sc01-proton-p2/ui/proton-ack-waiting-390.png) y [confirmación recuperada](../../../../output/sc01-proton-p2/ui/proton-ack-recovered-390.png), sin repetir el envío. |
| Almacén privado | [Inventario y revisión](../../../../output/sc01-proton-p2/ui/proton-retention-review-390.png). El límite es local, no la cuota de la cuenta Proton. |
| Limpieza interrumpida | [Misma revisión y progreso](../../../../output/sc01-proton-p2/ui/proton-retention-recovery-390.png) y [cancelación de lo pendiente](../../../../output/sc01-proton-p2/ui/proton-retention-cancelled-390.png), conservando lo ya confirmado. |
| Cambio de sincronización | [Revisar el destino](../../../../output/sc01-proton-p2/ui/proton-migration-review-1280.png), [verificar antes de confirmar](../../../../output/sc01-proton-p2/ui/proton-migration-ready-390.png) y [comprobante final](../../../../output/sc01-proton-p2/ui/proton-migration-complete-390.png). |
| Alcance parcial | [Recuperación local elegida](../../../../output/sc01-proton-p2/ui/proton-local-recovery-complete-390.png) y [cambio activo con ediciones nuevas pendientes](../../../../output/sc01-proton-p2/ui/proton-switch-new-edits-pending-390.png) son estados distintos. |
| Réplica anterior | [Aviso y recepción sin publicar](../../../../output/sc01-proton-p2/ui/proton-relocation-notice-1280.png). No se sigue otro destino ni se confirma un cambio automáticamente. |
| Destino guardado | [Intento verificado recuperado](../../../../output/sc01-proton-p2/ui/proton-migration-recovered-destination-390.png). La confirmación muestra su cuenta y ubicación reales; un formulario local por defecto no lo sustituye. |
| Revisión guardada | [Preparar la misma revisión recuperada](../../../../output/sc01-proton-p2/ui/proton-migration-recovered-review-390.png), sin cancelar ni crear otro intento. |

Las dos capturas `*-before-fix.png` conservan el fallo inicial como diagnóstico; no representan la presentación final y no se incluyen en la galería vigente. Los resultados visuales siguen siendo controlados aunque los componentes y formularios sean los reales.

## Windows P2: comprobación nativa parcial

La candidata Windows P2, identificada por SHA256 `187c49c0…d7eec`, ya se abrió con el perfil QA. Estos resultados corresponden a la aplicación nativa y a un proyecto sintético; se mantienen separados de las **17 vistas controladas** anteriores. El [recibo parcial de operaciones](../../../../output/sc01-proton-p2/windows-qa/runtime-receipts.json) conserva cada observación y su momento.

| Recorrido nativo Windows | Resultado observado |
|---|---|
| Sesión recordada | Cuenta conectada al abrir, sin nuevo login. Estado HTTP200 `ready`, cero pendientes y confirmación remota verdadera. |
| Sondeo de cambios | `POST /sync/scan` devuelve HTTP200. El estado posterior mantiene cero pendientes y confirmación remota verdadera, sin recrear el pendiente anterior. |
| Retención real | Una copia candidata de 104 bytes. Aplicación HTTP200, estado completo y 104 bytes liberados; material protegido conservado y ninguna purga remota. Los tres hashes de los documentos originales permanecen iguales. |
| Preparar Proton→local | Revisión HTTP200 sin bloqueos, tres archivos y 538 bytes; preparación en estado listo para confirmar. Todavía no se cambia la asociación. |
| Recuperar tras reabrir | Al reabrir la QA, la consulta devuelve el mismo intento y revisión, destino local y posibilidad de confirmación. El destino mostrado corresponde al intento guardado. |
| Cancelar conservando el origen | Android publicó un antecedente causal nuevo. La preparación Windows se canceló de forma ordinaria antes de confirmarla: HTTP200, estado cancelado y origen conservado. Se concilia antes de revisar otra preparación. |
| Publicar baja de carpeta vacía | Un único envío HTTP200 termina listo, con cero pendientes y confirmación remota verdadera. Los tres hashes originales permanecen iguales. Android recibió después la baja conservando los archivos. |
| Confirmar nueva preparación local | Después de conciliar, una revisión nueva sin bloqueos se preparó y confirmó: HTTP200, estado completo, traslado integral y origen conservado. Es otro intento, distinto del cancelado anterior. |
| Retorno al origen anterior | Confirmación HTTP200 completa, traslado integral y origen conservado; sin recuperación local ni cambios nuevos pendientes. Mismo proyecto, identidad lógica, cuenta y raíz original; generación3, cero pendientes y confirmación remota verdadera. Pausa conservada y tres hashes idénticos. |

**El primer intento no se activó.** Preparación, recuperación y cancelación son resultados distintos. Un intento posterior completó el traslado a local y el retorno al mismo origen también quedó confirmado. Estos recorridos P2 se reutilizan sólo en su alcance; la candidata final tiene una comprobación dirigida propia.

Dos capturas nativas inspeccionadas: [sincronización en pausa](../../../../output/sc01-proton-p2/windows-qa/proton-native-paused.png) y [destino local recuperado](../../../../output/sc01-proton-p2/windows-qa/proton-native-migration-recovered.png). La etiqueta de la cuenta se ocultó en el DOM exclusivamente para la evidencia visual; no se cambió su sesión ni se sustituyeron los datos del runtime. La captura pausada no se presenta como una observación de «Al día». La segunda documenta la preparación recuperada antes de su cancelación posterior; no muestra un cambio activado.

Una tercera captura nativa documenta el [retorno completado](../../../../output/sc01-proton-p2/windows-qa/proton-native-return-complete.png), también con etiqueta de cuenta ocultada sólo para la evidencia. En total son **tres imágenes nativas Windows**, separadas de las **17 vistas controladas**.

## Windows final: comprobación de las correcciones afectadas

La candidata final SHA256 `fcd5790f8e7bd23c8ea63dd2e7d4e71f985327af252f742d37dce5a2d3efdcf5` pasó la comprobación dirigida con perfil QA verificado. Cuenta recordada, generación3 y pausa conservadas; cero pendientes y confirmación remota verdadera. Una consulta de cambios externos HTTP200 mantiene ese estado.

Un PDF sintético externo de 15 bytes produce un pendiente real, sin marcadores falsos. Crear y actualizar su vista previa devuelve HTTP200 y mantiene cero marcadores; después de retirar únicamente esa copia comprobada por hash, vuelve a cero pendientes con confirmación remota verdadera. Los tres hashes originales permanecen idénticos. Una observación posterior de 181,113 segundos conserva cero pendientes y confirmación remota verdadera. [Recibo Windows final](../../../../output/sc01-proton-p2/final/windows-qa/readonly-acceptance.json). Se verifican sólo las rutas afectadas; no se repite la campaña de sincronización ni se alteran datos de producción.

## Android final: actualización y consultas afectadas comprobadas

La APK final SHA256 `da5b64961c676c6a62263b45ad29c330e34eef2e3a97907ee1acc1b3be6d28b8` pasó la actualización y comprobación focal en el emulador QA. Conserva UID10217, cuenta recordada, los tres hashes originales, asociación, generación1, aviso y pausa.

Una única consulta de cambios externos HTTP200 y la creación/actualización de la vista previa de un PDF sintético de 15 bytes HTTP200 no generan marcadores. Se retiró sólo ese archivo temporal tras comprobar hash y tipo. Estado final: cero marcadores y pendientes, sin error de inventario y journals de transferencia vacíos. El aviso mantiene el bloqueo de publicación y confirmación remota falsa; no se presenta como «Al día».

[Recibo Android final](../../../../output/sc01-proton-p2/android-qa/final-apk-focused-acceptance.json) · [alcance y pasos](../../../../output/sc01-proton-p2/android-qa/final-apk-focused-acceptance.md). La QA quedó detenida con journals vacíos; el emulador permanece abierto y la cuenta conservada. No se repitieron autenticación, sincronización, migración, retención ni suites completas.

El [paquete ARM64 final](../../../../output/sc01-proton-p2/final/native/arm64-v8a-apk-integrity.json), de 173.193.000 bytes y SHA256 `ccf1ac85cbc73fbf98e418f18076bedadb7ba1a019cfd5e8c68310c7fe5a9d6e`, supera la comprobación de firma, identidad, cinco bibliotecas y correspondencia con el corte final de 1.089 fuentes y 187 archivos de interfaz. No está instalado en un dispositivo físico ni publicado.

El [catálogo Android final](../../../../output/sc01-proton-p2/final/native/android-qa-artifacts.json) reúne ambos paquetes y sus recibos de integridad. El [cierre consolidado](../../../../output/sc01-proton-p2/final/acceptance-05.json) vincula contratos, candidatas y aceptación por su alcance, sin confundirlos con distribución pública.

## Android P2: actualización y regresión del sondeo comprobadas

La APK QA `3044353e…f04eb7` se instaló como actualización en el emulador, conservando UID, cuenta recordada sin nuevo login y los tres tamaños/SHA256 originales. La carpeta remota «Carpeta vacía P2» se recibió vacía. El scheduler normal drenó los tres marcadores heredados, sin eliminarlos manualmente.

El [catálogo de paquetes P2](../../../../output/sc01-proton-p2/native/android-qa-artifacts.json) verifica x86_64 (`3044353e…f04eb7`) y ARM64 (`cb67f201…06c6e2`) contra el mismo corte de 1.089 archivos fuente y 187 archivos de interfaz. Verificar el paquete ARM64 no acredita funcionamiento en un dispositivo físico. Ambos paquetes corresponden al corte previo a las correcciones finales indicadas abajo.

Una única consulta `POST /sync/scan` devolvió HTTP200 y mantuvo cero marcadores. Más de un minuto después —74,9 segundos observados— seguían `pendingOperations=0`, `pendingUnknown=false` y `statusIssue=null`, con los tres hashes originales intactos. [Recibo de actualización y regresión](../../../../output/sc01-proton-p2/android-qa/installed-update-acceptance.json) · [informe y alcance](../../../../output/sc01-proton-p2/android-qa/installed-update-acceptance.md).

No se observó `remoteConfirmed=true` antes de la pausa: había otra consulta al proveedor en curso. Android terminó pausado; esa pausa interrumpió la consulta con el mensaje esperado de progreso conservado, sin intentos de publicación/recepción en journal y con un contador de fallo por la interrupción explícita. Esto se registra por separado de la regresión de marcadores, que permanece en cero.

Después del traslado Windows a local, Android recibió la baja de «Carpeta vacía P2» y el aviso de traslado con antecedente causal verificado. Conserva los tres hashes, cuenta, asociación y generación1: no adopta el nuevo destino automáticamente. El estado es revisión necesaria, publicación bloqueada, confirmación remota falsa y cero pendientes. Se acredita el bloqueo por la autoridad y el DTO; no se hizo otro inventario remoto para afirmar ausencia de escrituras.

Una primera consulta falló por conexión; el siguiente reintento natural recuperó la recepción sin login, envío manual ni replay y terminó sin error ni fallos. Los journals de publicación y recepción quedaron vacíos. [Recibo de baja y aviso](../../../../output/sc01-proton-p2/android-qa/directory-and-relocation-acceptance.json) · [alcance observado](../../../../output/sc01-proton-p2/android-qa/directory-and-relocation-acceptance.md). Estos resultados Android nativos no añaden capturas a las **tres imágenes nativas Windows**, y no se mezclan con las **17 vistas controladas**.

## Sondeo: causa reproducida y alcance de la corrección

En la APK anterior se reprodujo que un sondeo local `POST /sync/scan` aumentaba los marcadores de dos a tres sin modificar los hashes de los documentos. La consulta se registraba como un cambio que debía enviarse; el problema no se atribuye ya a una captura antigua ni al alias general del directorio privado.

El hook de cambios de `api_routes.rs` está corregido y sus dos contratos dirigidos son correctos. La [reproducción en la APK anterior](../../../../output/sc01-proton-p2/android-qa/scan-dirty-reproduction.json) y las pruebas [iniciales](../../../../output/sc01-proton-p2/polling-contracts.log) y [afectadas](../../../../output/sc01-proton-p2/polling-affected-contract.log) conservan su alcance. Windows P2 y Android P2 instalado mantienen cero pendientes después del sondeo; la observación Android posterior también mantiene cero marcadores. Se cierra esta regresión concreta, no toda la aceptación de sincronización, migración o hardware.

La revisión independiente posterior detectó otras dos consultas sin cambios, `external-changes/scan` y `previews/refresh`, que aún podían marcar trabajo pendiente. También detectó que la selección Git debía tratar literalmente nombres como `[.]private` para excluir archivos privados correctamente. Ambas correcciones están integradas, con contratos dirigidos aprobados y comprobaciones Windows/Android finales descritas arriba. Se reutilizan las comprobaciones no afectadas de motor, retención y migración sin presentar los paquetes anteriores como definitivos.

## Evidencia

- [Motor y contratos preparados](../../../../output/sc01-proton-p2/engine/implementation-status.md).
- [Almacén y migración](../../../../output/sc01-proton-p2/lifecycle/implementation.md).
- [Interfaz y comprobaciones focales](../../../../output/sc01-proton-p2/ui/report.md).
- [Campaña visual](../../../../output/sc01-proton-p2/ui/visual-result.json) y [acuse final](../../../../output/sc01-proton-p2/ui/visual-result-ack.json).
- [Registro de contratos agrupados](../../../../output/sc01-proton-p2/storage-final-contracts.log).
- [Ciclo de vida revalidado](../../../../output/sc01-proton-p2/lifecycle-affected-contracts.log) y [reapertura de la revisión guardada](../../../../output/sc01-proton-p2/migration-reopen-contract.log).
- [Nueve unitarios críticos](../../../../output/sc01-proton-p2/critical-unit-tests.log) y [admisión Tauri](../../../../output/sc01-proton-p2/runtime-lanes-final.log).
- [Operaciones nativas Windows parciales](../../../../output/sc01-proton-p2/windows-qa/runtime-receipts.json), separadas de las capturas controladas.
- [Actualización Android y sondeo](../../../../output/sc01-proton-p2/android-qa/installed-update-acceptance.json), con el estado final pausado y sus límites explícitos.
- [Catálogo de los dos paquetes Android P2](../../../../output/sc01-proton-p2/native/android-qa-artifacts.json), anterior a las correcciones finales de consultas y Git.
- [Recepción Android de baja y aviso](../../../../output/sc01-proton-p2/android-qa/directory-and-relocation-acceptance.json), sin cambio automático de asociación y con recuperación de la conexión.
- [Git literal](../../../../output/sc01-proton-p2/final/git-literal-contracts.log), [único caso afectado](../../../../output/sc01-proton-p2/final/git-literal-affected.log) y [cinco contratos de consultas](../../../../output/sc01-proton-p2/final/readonly-polling-contracts-final.log).
- [Reutilización por huellas](../../../../output/sc01-proton-p2/final/reused-evidence-inputs.json) y [Windows final ejecutado en QA](../../../../output/sc01-proton-p2/final/windows-qa/readonly-acceptance.json).
- [Android final instalado](../../../../output/sc01-proton-p2/android-qa/final-apk-focused-acceptance.json), con bloqueo esperado por aviso y sin marcadores falsos.

## Cierre de esta entrega

1. Contratos finales aprobados: 47 Rust y 39 UI/API únicos, reutilizando evidencia no afectada y sin repetir suites completas.
2. QA funcional final Windows y Android cerrada en las rutas afectadas. Paquete ARM64 final verificado; el catálogo P2 anterior conserva su alcance propio. No hay aceptación ARM física.
3. Regresión del sondeo cerrada en ambas candidatas: cero pendientes tras consultar; Android conserva cero marcadores durante la observación posterior.
4. Traslado posterior Proton→local y retorno al mismo origen confirmados. Baja y aviso recibidos en Android con asociación conservada. El primer intento Windows se recuperó y canceló sin activarse; no se confunde con los traslados posteriores completados.

ARM físico, caducidad real del token Android, intervalo literal de 24 horas, interrupción nativa forzada durante escritura de archivos y distribución productiva conservan su aceptación propia. El aviso de traslado acredita autoridad y DTO; no se hizo un inventario remoto adicional para demostrar ausencia de escrituras. La migración GitHub tiene contratos y comprobación literal local, no transferencia real a un repositorio remoto. Microsoft/Google y SOLO CLOUD quedan fuera. No se publica, no se utilizan documentos personales ni se gasta en IA.

