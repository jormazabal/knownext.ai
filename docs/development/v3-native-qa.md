# Comprobación nativa aislada de 3.0

Las pruebas de desarrollo usan identidades distintas de las aplicaciones instaladas. No modificar ni borrar datos del usuario para preparar una prueba.

## Android

`KNOWNEXT_ANDROID_QA=1` añade `.v3qa` al identificador **solo en debug**. `scripts/build-android-debug.mjs` comprueba el identificador del `output-metadata.json` antes de copiar el APK. El resultado para el emulador es `output/KnowNext.ai-android-x86_64-debug-qa.apk`; no es un instalador de distribución.

```powershell
$env:KNOWNEXT_ANDROID_ABI='x86_64'
$env:KNOWNEXT_ANDROID_QA='1'
node scripts/build-android-debug.mjs
```

El script compila el frontend y Rust, copia temporalmente la biblioteca JNI y excluye la tarea Gradle que requiere crear un enlace simbólico en Windows. Conserva la configuración portable de Gradle y retira la copia temporal al terminar. No necesita cambiar la configuración de seguridad del sistema.

En este equipo, JBR 21.0.6 y Gradle 8.14.3 fallaron al establecer su conexión interna con un socket UNIX. Se verificó una solución limitada al proceso:

```powershell
# Esta ruta debe permanecer inexistente. No crear la carpeta.
$env:JAVA_TOOL_OPTIONS='-Djdk.net.unixdomain.tmpdir=C:/Dev/knownext.ai/output/gradle-no-unix-sockets'
```

OpenJDK intenta crear el listener UNIX y utiliza la alternativa TCP si no puede enlazarlo. Este ajuste no pertenece al runtime de producto ni modifica el sistema. Aplicarlo únicamente si aparece el mismo fallo; quitar la variable al terminar. Referencia: [implementación de PipeImpl en OpenJDK 21](https://raw.githubusercontent.com/openjdk/jdk21u/master/src/java.base/windows/classes/sun/nio/ch/PipeImpl.java).

Instalar con `adb install -r` únicamente después de comprobar `applicationId=ai.knownext.mobile.v3qa`. La actividad conserva el nombre `ai.knownext.mobile.MainActivity`. Una actualización QA conserva los documentos de ese paquete; no usar `pm clear` ni desinstalar para repetir una prueba de persistencia.

Para probar sin conexión, registrar primero los estados de modo avión, Wi-Fi y datos móviles. Desactivar la red, comprobar que no hay tareas de proveedor pendientes y usar credenciales exclusivamente sintéticas. Retirar esas credenciales y detener el paquete QA antes de restaurar los estados originales. No dejar un dispositivo personal en modo avión.

En API 36, UIAutomator expuso el WebView sin sus controles internos. Las comprobaciones se realizaron con el DOM del WebView nativo mediante Playwright Android y capturas ADB. Esto acredita ejecución de Tauri/Rust y archivos locales; no acredita TalkBack, gestos físicos ni aceptación táctil. La prueba de un toque dispone de cobertura de componente y necesita contraste táctil nativo.

## Credenciales

Windows utiliza DPAPI del usuario. Android cifra el objeto privado con AES-256-GCM y una clave no exportable de Android Keystore; cada cifrado recibe un IV nuevo. La clase Kotlin no se registra como interfaz JavaScript. Un callback nativo conecta el adaptador con almacenamiento Rust, también cuando se inicializa el trabajador de grabaciones sin WebView.

El lector migra JSON legado únicamente tras cifrar, descifrar y comprobar el resultado. La sustitución es atómica. Un archivo dañado, una clave inaccesible o un fallo de escritura conservan el original y muestran un error; no se regeneran claves para intentar descifrar un archivo existente. Las reglas Android excluyen `credentials.json` y `auth.json` del backup y la transferencia del sistema. Se ha verificado su compilación; la restauración real de backups sigue pendiente.

No se exige autenticación biométrica por operación, porque la transcripción existente puede ejecutarse en segundo plano. No se declara protección hardware/StrongBox sin medir el dispositivo. API keys y tokens siguen teniendo vida ordinaria en la memoria del proceso mientras se usan.

**Antes de publicar:** completar la recuperación guiada de un almacén inaccesible, el escenario de dispositivo nuevo, la migración desde instalaciones reales y la documentación de downgrade. El ejecutable 2.6.0 anterior no conoce el nuevo sobre cifrado; reinstalarlo no garantiza recuperar credenciales. Las pruebas actuales usan datos sintéticos y no migran la instalación del usuario.

Referencias: [Android Keystore](https://developer.android.com/privacy-and-security/keystore), [KeyGenParameterSpec](https://developer.android.com/reference/android/security/keystore/KeyGenParameterSpec), [reglas de backup](https://developer.android.com/identity/data/autobackup).

## Windows

La configuración QA usa `ai.knownext.desktop.v3qa` y un título distinguible. Arranque y apertura de Markdown se comprobaron en una compilación independiente. La automatización posterior devolvió `failed to activate captured window` y se detuvo. No atribuir a esta prueba aceptación de la nueva bandeja, grabación, DPI ni actualización. No detener el proceso de la instalación normal al reconstruir un ejecutable QA.


### Corte 18 · conservación y comprobación
Empaquetado Tauri: el frontend de producción se incrusta en el binario Rust. Tras cambiar React/CSS/JS hay que reconstruir frontend y Rust/Tauri antes de Gradle; recompilar solo frontend y reutilizar el .so conserva la UI anterior. Solo se puede reutilizar el .so si frontend y fuentes Rust no cambiaron, verificando huellas. La licencia de fuentes es un asset Gradle adicional y se comprueba aparte. En C18 se detectó APK37 idéntico a 36: empaquetado sustituido por reconstrucción completa 38; 37 no acredita la corrección posterior del hook. Las pruebas Rust Android pueden ejecutarse como binario de test aislado en TMPDIR de shell, fuera del APK, con ejecutores controlados. Retirar ese binario y verificar TMPDIR vacío al terminar; esto no introduce un proceso auxiliar en el producto.


### Corte 19 · transferencia documental de proyecto
El productor QA `knownext-storage/examples/project_package_qa.rs` exige carpeta nueva y usa LocalApi Rust aislada, sin tocar la instalación habitual. Produce un paquete con Markdown, PNG real, .knote, carpeta vacía y exclusión de .env; adapta un enlace con diferencias de caso sin cambiar la fuente. Esto prueba producción Rust Windows, no manejo del diálogo Windows por UI.

Android se limita al paquete `ai.knownext.mobile.v3qa`. Copias de configuración/registro para restauración permanecen solo en su área privada, modo 600; registrar hashes de cuatro almacenes, estado de red y retirada de esos backups al finalizar. Archivo sintético en Downloads se selecciona desde DocumentsUI real; no inyectar URI al WebView. Fuera de la ventana del producto no ejecutar CDP: inspeccionar primero UIA y resolver cualquier overlay del sistema antes de continuar.

El hash del APK instalado y el SHA del JavaScript servido por Tauri deben coincidir con el artefacto/dist. El cambio de copia/UI y de normalización manuscrita del APK41 requiere reconstrucción completa; APK40 queda como evidencia intermedia, porque detectó content.id de origen en la representación de la nota. No se reescriben los bytes .knote al corregir la identidad cargada. La primera prueba nueva de identidad se corrigió para registrar el proyecto antes de leerlo; la segunda reprodujo exactamente el ID de origen y permite contrastar la corrección.


### Muestra real2.6 sin migrar la instalación habitual
El ejemplo migration_profile_pilot se ejecutó contra los seis almacenes permitidos del identificador ai.knownext.desktop, etiquetado lastRunAppVersion2.6.0, con ejecutable instalado2.6.0 contrastado por metadata. Copia temporal privada, sin copiar credenciales ni abrir proyectos, sin proveedores y sin activar/cerrar procesos existentes. Migración crítica/ledger2, copias exactas, reapertura/idempotencia y recuperación crítica conservando ledger nuevo correctas. Notas/cambio exactos, originales sin cambios y copia privada eliminada tras verificar su ámbito.
Esto amplía los fixtures sintéticos con datos reales limitados; no modifica la instalación del usuario ni acredita aceptación nativa. Artefactos privados de evidencia: output/v3-real-26-profile-pilot.json/log, solo metadata. Reporte79 muestra el flujo, sin pantallas falsas ni contenido del perfil. Sigue pendiente campaña instalada con documentos, Git, audio, borradores, interrupciones y retorno.
