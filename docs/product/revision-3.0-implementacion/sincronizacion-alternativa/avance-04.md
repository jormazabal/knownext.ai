# SC01 · Proton directo · avance04

Fecha: 6 de noviembre de 2026. Cuatro agentes coordinados. [Reporte visual](avance-04.html) · [Plan vigente](plan.md).

**Windows y Android ya tienen autorización real, cuenta recordada y sincronización bidireccional comprobada con tres archivos sintéticos y sus hashes.** Las candidatas Windows, Android x86_64 y ARM64 incorporan las mismas fuentes finales. P4 conserva una discrepancia de estado pendiente del último delta; P5 de almacén, retención y migración y P6 global permanecen parciales. No se ha publicado.

## Implementado

| Bloque | Comportamiento disponible |
|---|---|
| SDK directo | SDK oficial dentro del proceso en Windows y Android. Sin instalar Proton Drive, CLI o servidor auxiliar. |
| Conectar una vez | Acceso en navegador, cuenta independiente por dispositivo, recuperación del intento y renovación. |
| Persistencia y recuperación | Cuenta y journal cifrados mediante DPAPI/Keystore. Se preserva una sesión consumida o renovada aunque falle después el perfil; sin alternativa en texto plano. |
| Transferencia íntegra | Objetos y manifiestos inmutables, hashes, inventario acotado y consulta de intentos antes de repetirlos. |
| Recepción recuperable | Base causal, protección de borradores y cambios locales, copias previas y reconocimiento de escrituras con acuse perdido. |
| Trabajo diario | Cola durable, sincronización automática, eventos del proveedor y espera progresiva. Guardar localmente no depende de la nube. |
| Actualización de la interfaz | Sync y resolución manual invalidan el árbol del proyecto incluso si el acuse es incierto. Proyectos sin Git renuevan el árbol cada 60 s; documentos abiertos se comprueban cada 12 s y los borradores se protegen. |
| Control durante la operación | Pausa y consulta independientes de la transferencia; respuestas antiguas no deshacen una pausa confirmada. |
| Conflictos | Comparación revisada de variantes, conservación local, recibida o ambas. Ante borrado remoto, «Conservar ambos» no está disponible. Sin IA. |
| Desconexión y legado | Desvincular conserva documentos, copias y recuperación. La configuración por carpeta está retirada; el legado no se convierte en una cuenta autenticada. |

P5 sigue **parcial**: inventario y desconexión conservadora no completan cuotas, limpieza/retención, migración integral ni todos los casos del legado. Google Drive y OneDrive continúan aplazados. SOLO CLOUD queda fuera.

## Validación real de Windows

1. El usuario completó la autorización de Proton. La aplicación conservó la cuenta protegida con DPAPI después de cerrarla y reabrirla.
2. La revisión del destino desde la interfaz identificó dos archivos sintéticos, 400 bytes en total: `Prueba.md` (144 bytes) y `Recursos/muestra.bin` (256 bytes).
3. Se asoció el proyecto remoto **Proton · Validación sintética** desde la aplicación y Sync mostró **Al día**. Este estado fue observado en la interfaz; no se dispone de una captura nueva y no se fabrica una imagen para representarlo.
4. Una comprobación focal a través del servicio y el puente reales ejecutó **una renovación explícita**, reinstanció el servicio, verificó el acceso a la raíz y descargó los dos objetos. Los SHA256 y bytes coinciden con los originales sintéticos. El helper no escribió en la nube, no listó el Drive personal ni accedió directamente al vault.

[Recibo redactado de renovación y lectura remota](../../../../output/sc01-proton-p1/native/session-acceptance/receipt.json).

**Límite temporal:** la reapertura real de la aplicación se comprobó antes de renovar. Después de renovar se reinstanció el servicio y se verificó su sesión persistida. Esto no equivale a esperar 24 horas ni a probar una nueva reapertura completa de la aplicación después de esa renovación.

Si Proton ofrece abrir su propia aplicación Drive después de autorizar, puede descartarse esa propuesta y volver a KnowNext. **El cliente Proton Drive no es un requisito**; en Windows la autorización ya está adquirida.

## Aceptación real Windows ↔ Android

El usuario completó un acceso fresco en Android. La aplicación consultó la cuenta y seleccionó el proyecto remoto **existente** Proton · Validación sintética; se conservó el archivo local `pruebaUIRefresh.md`. No se creó otro proyecto remoto ni se copiaron credenciales entre dispositivos.

| Archivo | Bytes | SHA256 idéntico en Windows y Android |
|---|---:|---|
| `Prueba.md` | 144 | `1f55037bc93a5eeb8f41c7a9ad79902ccda4f4c2816b97e84921ea07b17a711e` |
| `Recursos/muestra.bin` | 256 | `40aff2e9d2d8922e47afd4648e6967497158785fbd1da870e7110266bf944880` |
| `pruebaUIRefresh.md` | 104 | `39f3e074ef441b78fe811ec6275c3fe5238214d6330f348bddbf1816719b34a5` |

Windows→Android descargó los dos primeros archivos; el tercero llegó automáticamente desde Android a Windows, sin Sync manual adicional en Windows. Se contrastaron los tres hashes y tamaños en ambos directorios: **504 bytes en total**.

**La primera espera de interfaz agotó sus dos minutos y devolvió 504.** La operación siguió; una consulta posterior recuperó «Al día con Proton», sin repetir la sincronización. Se confirmó el resultado antes de cerrar la aplicación. Después de terminar el proceso Android y reabrirlo, cuenta Keystore y asociación seguían disponibles sin login. Una única sincronización SDK real posterior empezó a las `2026-11-06T21:03:27Z` y mostró confirmación a las `2026-11-06T21:03:28Z`; la observación posterior confirmó Al día y controles en reposo. Es un proyecto sintético pequeño, no una promesa de rendimiento para proyectos grandes.

El recibo se registró a las **21:05:42 UTC / 22:05:42 Europe/Madrid**. Las horas de la interfaz Android son UTC. No se esperaron 24 horas ni se forzó una renovación Android con token caducado. El buffer de fallos del proceso actual estaba vacío.

[Recibo bidireccional y continuidad](../../../../output/sc01-proton-p1/android-qa/bidirectional-acceptance-receipt.json) · [informe focal](../../../../output/sc01-proton-p1/android-qa/bidirectional-acceptance-report.md) · [captura nativa del árbol con los tres archivos, sin identidad de cuenta](../../../../output/sc01-proton-p1/android-qa/80-bidirectional-three-files.png).

Este recorrido real se registra aparte de los 29 casos UI/API y del caso offline del árbol; no se suman pasos o repeticiones como nuevos contratos.

### Modificación de un archivo existente

Se añadió la línea ASCII `desde Android: edicion existente` a `pruebaUIRefresh.md` mediante el UID QA, conservando el original en la evidencia. Fue una modificación de archivos del sandbox sintético, **no una edición Milkdown**. Pasó de 104 a **138 bytes**, SHA256 `6212086aeb363092da5a0de5da10eaab3ddfa6c183ea56fc2c4e7e8e9592cf6c`.

Una única Sync Android comenzó a `2026-11-06T21:08:35Z`. Windows recibió automáticamente el cambio del archivo existente, observado a `2026-11-06T21:12:47Z`, con tamaño y SHA idénticos; los archivos de 144 y 256 bytes siguieron intactos. Intervalo observado: **4 min 12 s**, sin medir latencia exacta del servidor. Los tres archivos suman ahora 538 bytes; los 504 bytes anteriores corresponden al primer intercambio.

**Se observó un segundo 504**, en esta operación distinta. No se repitió Sync. La transferencia está verificada, pero la última consulta Android sigue mostrando **1 operación pendiente**, incluso después de comprobar localmente dirty vacío, ningún intento activo, cero errores y verifiedCurrent=true. Una lectura directa del contrato runtime a `2026-11-06T21:18:57.360Z` confirmó state=ready, pendingOperations=1 y remoteConfirmed=false. No es sólo un texto antiguo del componente; **la causa no está confirmada**. Queda revisar el estado/acuse; **no se declara Al día para este último delta ni se cierra globalmente P4**. El primer intercambio y la sincronización tras reabrir sí alcanzaron Al día.

[Recibo de edición existente](../../../../output/sc01-proton-p1/android-qa/existing-edit-acceptance-receipt.json) · [informe y copia original](../../../../output/sc01-proton-p1/android-qa/existing-edit-acceptance-report.md) · [diagnóstico local redactado](../../../../output/sc01-proton-p1/android-qa/existing-edit-dirty-diagnostic.json) · [acuse UI final redactado](../../../../output/sc01-proton-p1/android-qa/91-existing-edit-final-ack.xml) · [DTO runtime redactado](../../../../output/sc01-proton-p1/android-qa/existing-edit-direct-dto.json).

## Validación dirigida acumulada

| Superficie | Resultado y alcance |
|---|---|
| Servicio de cuenta | **11 contratos únicos correctos**. Casos de sesión con proveedor sustituible sólo en pruebas; DPAPI real en Windows. La renovación autenticada anterior es una comprobación real aparte. |
| Planificador | **15 contratos únicos correctos**: 11 anteriores y 4 sobre antecedentes propios, causalidad, ausencia de archivo y conflictos reales. |
| UI/API | **29 casos únicos correctos**: 27 previos y 2 nuevos sobre invalidación por proyecto tras Sync/resolución, también ante error de acuse, sin repetir la operación. |
| Almacenamiento | **12 contratos únicos correctos**, 4 cloud y 8 directos: ámbito, legado, estructuras, acuse perdido/obsoleto, causalidad, resolución local y borrados. |
| Runtime | **1 caso focal correcto**: pausa y consulta no esperan a la red o al guardado. |
| Frontend final | TypeScript/Vite y `check-client-bundle-clean` correctos después del arreglo del árbol. |
| Windows final | Construcción correcta en **1 min 44 s**, abierta desde `output/sc01-proton-p1/windows-candidate/knownext-ai-desktop.exe`, con la validación autenticada indicada arriba. |
| Android nativo e instalado | ABI, cifrado y HTTPS correctos. Autorización humana real, cuenta y asociación Keystore conservadas tras terminar y reabrir. Una sincronización SDK posterior termina Al día sin login. |
| Android: árbol sin Git | **Un recorrido instalado offline aparte**, sin sumar a los casos UI/API: archivo nuevo visible automáticamente, sin reabrir el proyecto, dentro de 65 s incluyendo la captura. |
| APK finales | ARM64 y x86_64 preparadas y firmadas para QA, con cinco bibliotecas cada una y las mismas 447 fuentes congeladas. La aceptación Android autenticada corresponde a x86_64 en AVD; ARM físico pendiente. |

No se repiten ni suman casos omitidos por filtros, resultados reutilizados o ejecuciones afectadas. No se han repetido suites completas, gastado en IA ni publicado.

### Android: incidencias corregidas y candidata instalada

El primer selector falló porque el espacio de montajes real de la aplicación presenta `/data/user/0` como alias de `/data/data`. La corrección valida la frontera privada y sus descendientes antes de resolver exclusivamente el alias del sistema para Proton. No cambia el registro, mueve datos ni admite enlaces creados dentro del proyecto. El legado se consulta sólo si existe una asociación anterior. [Diagnóstico y revalidación](../../../../output/sc01-proton-p1/android-qa/qa-report.md).

El segundo caso instalado creó únicamente `pruebaUIRefresh.md` en el proyecto QA `local-files` sin Git. El árbol, inicialmente vacío, lo mostró sin cerrar/reseleccionar el proyecto ni reiniciar la aplicación. Observación final a 64 segundos del reloj del dispositivo; su resolución fija el límite superior en 65 s. [Informe](../../../../output/sc01-proton-p1/android-qa/offline-tree-report.md) · [recibo](../../../../output/sc01-proton-p1/android-qa/offline-tree-result.json).

Android empaqueta OpenSSL y usa certificados reales del sistema, **sin desactivar TLS**. Se conserva el fallo del primer ensayo sin esa dependencia. El SDK necesita API29; el mínimo general se mantiene y la función se protege por capacidad. La caché del puente es en memoria; no se declara resuelto el antiguo ensayo SQLite/trunc.

### Artefactos finales

- [Windows QA actual](../../../../output/sc01-proton-p1/windows-candidate/knownext-ai-desktop.exe) · [construcción](../../../../output/sc01-proton-p1/windows-qa-workspace-build.log).
- [APK ARM64 para teléfono](../../../../output/sc01-proton-p1/native/KnowNext.ai-3.0.0-proton-arm64-qa.apk): SHA256 `f2cbd41d4bb7520afcb3c41e537f8f602fdbaa34a604c7670fd1bebb4f11b979`. Preparada; teléfono pendiente.
- [APK x86_64 final instalada](../../../../output/sc01-proton-p1/native/KnowNext.ai-3.0.0-proton-x86_64-qa-final.apk): SHA256 `9346c161889950d460df5467f9f2b56de315e32e83374fd12b7de9ab99d6681a`.
- [Recibo conjunto: firma QA, bibliotecas y fuentes](../../../../output/sc01-proton-p1/native/android-qa-final-artifacts.json).

Las APK inicial y sandboxfix conservan valor histórico para sus pruebas, pero **no son los artefactos finales**.

## Integridad revisada

- Conservar local invalida el sello anterior y genera una nueva publicación causal aunque los bytes ya se hubieran enviado.
- La recepción usa el último antecedente propio observado por el remoto, sin retroceder la base ni aceptar ramas ajenas; evita conflictos falsos A→B→A.
- Confirmaciones antiguas no cubren guardados o ediciones externas posteriores.
- Marcadores pendientes se procesan por lotes y una cola de más de 10.000 guardados no queda bloqueada.
- Se contrasta la huella de cada publicación antes de reutilizar su ID; un descriptor distinto no se acepta silenciosamente.
- Se validan estructuras y revisiones; pausa y consultas permanecen independientes del envío.

Estas guardas tienen revisión y contratos focales; no se convierten por ello en aceptación de todos los escenarios reales de interrupción y conflicto.

La [revisión final independiente](../../../../output/sc01-proton-p1/native/final-review.md) mantiene además dos líneas P4 deducidas del código, sin nueva reproducción:

- Replanificar una recepción parcial si el usuario continúa editando una acción aún pendiente; conservar lo completado y ofrecer una comparación revisable, sin sustituir el nuevo contenido local.
- Definir la retirada causal de directorios vacíos: actualmente puede no propagarse y reaparecer la carpeta. Retirar sólo directorios demostrablemente vacíos y sin cambios locales; sin borrado recursivo automático.


## Recorrido visual y procedencia

**Capturas nativas Android históricas, anteriores a autenticar:**

- [SDK disponible](../../../../output/sc01-proton-p1/android-qa/16-proton-direct.png).
- [Intento Keystore recuperado tras detener y reabrir](../../../../output/sc01-proton-p1/android-qa/22-pending-recovered.png).
- [Árbol actualizado en la APK final sin Git](../../../../output/sc01-proton-p1/android-qa/35-offline-tree-after-poll.png).

**Captura nativa actual de la aplicación autenticada:** [los tres archivos tras sincronización y reapertura](../../../../output/sc01-proton-p1/android-qa/80-bidirectional-three-files.png). La identidad de la cuenta no aparece en la imagen. El estado Al día posterior a reabrir se conserva en un [árbol de accesibilidad redactado antes de guardarlo](../../../../output/sc01-proton-p1/android-qa/78-cold-sdk-sync-observation.xml).

**Estados de componentes con datos controlados**, distintos de los anteriores: [conectado en escritorio](../../../../output/sc01-proton-p1/ui/proton-direct-connected-1280.png), [móvil](../../../../output/sc01-proton-p1/ui/proton-direct-connected-390.png), [login](../../../../output/sc01-proton-p1/ui/proton-direct-login-390.png), [conflicto](../../../../output/sc01-proton-p1/ui/proton-direct-conflict-390.png) y [desconexión](../../../../output/sc01-proton-p1/ui/proton-direct-disconnect-390.png). Sus cuentas y estados «Al día» son de ensayo; no son capturas de la cuenta autenticada del usuario.

La [captura Windows de acceso caducado](../../../../output/sc01-proton-p1/native/windows-qa-expired.jpg) corresponde al primer intento, anterior a la autorización ya obtenida. No representa el estado actual. El «Al día» real actual se acredita por observación del coordinador y por el recibo de lectura, sin atribuirle una captura inexistente.

## Pendiente para cerrar la aceptación

1. Revisar la discrepancia del último delta: bytes recibidos correctamente, pero la consulta Android conserva 1 pendiente frente a un estado local drenado. P4 queda parcial hasta cerrar su observabilidad, replanificación de recepciones parciales y convergencia de directorios vacíos.
2. Completar la aceptación temporal: renovación Android cuando caduque su token y continuidad tras el intervalo real acordado. No se esperaron 24 horas. La renovación explícita Windows ya está contrastada, con sus límites descritos.
3. Contrastar interrupción deliberada, recepción parcial y conflictos concurrentes reales sin pérdida. El 504 recuperado acredita un acuse incierto concreto; no todos esos escenarios.
4. Instalar y aceptar la APK ARM64 en teléfono; preparar el artefacto no acredita su ejecución física.
5. Completar P5 de almacén, cuotas, retención y migración integral y el resto de P6 global.
6. Preparar firmas de producción y publicación cuando se autoricen; las candidatas actuales están firmadas para QA y no se han publicado.

El AVD QA `sc01_proton_p0` / `emulator-5580` permanece abierto y visible con los tres archivos sintéticos. Cuenta propia Keystore y asociación conservadas. No se copió el vault Windows; no hacen falta nuevos accesos para el checkpoint completado.

No se solicitan contraseñas ni tokens por chat. No se publica todavía.

## Evidencia adicional

- [Servicio y planificador](../../../../output/sc01-proton-p1/session/report.md) · [29 casos UI/API](../../../../output/sc01-proton-p1/ui/report.md).
- [12 contratos de almacenamiento](../../../../output/sc01-proton-p1/storage-android-boundary-fix.log) · [1 contrato del runtime](../../../../output/sc01-proton-p1/runtime-lanes-final.log).
- [2 casos de invalidación del espacio de trabajo](../../../../output/sc01-proton-p1/ui/workspace-refresh-tests.json) · [frontend final](../../../../output/sc01-proton-p1/frontend-tree-refresh-final.log).
- [Puente nativo, hashes y límites](../../../../output/sc01-proton-p1/native/report.md) · [resultado Android anónimo](../../../../output/sc01-proton-p1/native/probe-android-result.json).

Este informe sustituye el avance03. Los recibos históricos conservan su alcance; cada aceptación real se atribuye a su dispositivo y recorrido concreto.
