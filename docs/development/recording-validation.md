# Grabación y catálogo OpenAI: entrega técnica

## Cambios incorporados

- Servicio Rust de sesiones, captura WASAPI de micrófono y salida seleccionada, pausa/continuación, recuperación y exclusión con dictado.
- Plugin Android AudioRecord, servicio con notificación y wake lock; WorkManager por fragmento con inicialización de Rust independiente de WebView.
- Bandeja/miniventana Windows, entrada desde carpetas y raíz, panel Grabaciones, destino diferido, reproducción y conservación local.
- Transcripción GPT-Transcribe mediante la clave existente, fragmentación acotada, SHA-256, reintentos seguros y resultado desconocido explícito.
- Creación Markdown sin sobrescritura y recuperación idempotente del guardado en su carpeta.
- Catálogo JSON compartido, validación por capacidad, conservación de selecciones, comprobación no facturable de visibilidad y retirada de puntuaciones arbitrarias.
- Tarifas USD específicas, conversión BCE fechada, instantáneas de configuración para investigación y separación de históricos monetarios.

## Evidencias automatizadas

| Comprobación | Resultado |
|---|---|
| Suite completa frontend | 334/334 pruebas; incluye configuración, árbol, editor, asistentes, dictado y grabaciones |
| Componentes de grabación | Inicio con destino y nombre editado; parada general y cancelación conservadora; confirmación del runtime, doble acción y revisión atrasada |
| Rust grabación | 9 pruebas: recuperación, exclusión, pausa, entradas, conservación, cancelación, fragmentación y reintento ambiguo |
| Rust core/IA | 2 + 23 pruebas correctas |
| Rust almacenamiento | 61 pruebas correctas en la pasada completa; fixture nuevo de históricos corregido y repetido correctamente; 14 pruebas de IA repetidas correctamente tras congelar configuración del trabajo |
| Frontend producción | TypeScript + Vite compilados |
| Windows | `cargo check --workspace` y compilación del ejecutable debug |
| Android | `cargo check --target aarch64-linux-android` y `:app:compileArm64DebugKotlin -x rustBuildArm64Debug` correctos |
| Diferencias | `git diff --check` sin errores de espacios |

Las advertencias de tamaño de bundles Vite y las de obsolescencia/dead-code de dependencias Android no impiden estas compilaciones. Se mantienen Tauri 2.11.1 y plugins de autoinicio/instancia única compatibles. No se ha generado ni instalado una release o un APK nuevo con este trabajo.

## Aceptación aún pendiente

La implementación en código no equivale a la aceptación de captura nativa. No hay dispositivo Android físico conectado ni una reunión Teams de prueba. No se han capturado o enviado grabaciones personales ni ejecutado generaciones facturables de comprobación.

Quedan pendientes: WASAPI con auriculares y dos fuentes, desfase y consumo de memoria durante dos horas, suspensión y cambio de dispositivos; Android con pantalla bloqueada, llamadas/competencia por el micrófono, permisos y recuperación de WorkManager tras muerte del proceso; calidad de castellano/euskera/bilingüe; inspección visual a 200 %, accesibilidad y autoinicio de la aplicación instalada. El checklist manual incluye estos casos. No debe darse por cerrada la viabilidad nativa ni publicarse la función basándose solo en esta evidencia automatizada.

## Límites concretos

- Android requiere que el dispositivo admita captura PCM a 24 kHz; si no la admite, devuelve un error recuperable. No hay captura de llamadas ni loopback de aplicaciones en Android.
- La alineación Windows usa conversión WASAPI y timestamps QPC; la sincronía prolongada requiere la prueba física indicada.
- Un trabajo presupuestado sin cambio EUR/USD válido queda bloqueado con error recuperable y requiere reintento tras obtener la referencia. No se promete reanudación automática de investigaciones.
- Las estimaciones de una grabación no certifican la facturación de envíos de resultado desconocido. La interfaz avisa de posible consumo adicional al reintentar.
- La limpieza solo sucede con la aplicación abierta y afecta a sus copias locales. No borra copias del proveedor.
- No hay diarización, sincronización palabra-audio ni validación automática de calidad lingüística.

Contratos: [arquitectura](../architecture/recording-runtime.md). Aceptación: [checklist manual](manual-test-checklist.md).


## Prueba nativa Windows — 30 de octubre de 2026

Se arrancó el ejecutable debug con Vite local y un perfil WebView separado de la versión instalada. Se utilizó voz sintética castellana de Windows por WASAPI loopback de `Altavoces (2- Realtek(R) Audio)`, con el micrófono desactivado. La clave OpenAI existente completó las transcripciones reales con GPT-Transcribe.

| Caso | Evidencia observada |
|---|---|
| Inicio desde carpeta | Menú de PRUEBAS → Grabar audio y crear documento; destino preasignado y nombre editable |
| Pausa primera sesión | `paused`, 1.019.676 muestras; PCM de 2.039.352 bytes sin cambios de tamaño ni SHA-256 mientras se reproducía voz durante la pausa |
| Continuación | Mismo UUID; duración excluye la pausa y vuelve a crecer |
| Parada desde carpeta | Sesión completada, 1.499.966 muestras (~62 s), Markdown en PRUEBAS; contiene ambas partes y no la frase «naranja cuarenta y siete» de la pausa |
| Inicio general sin destino | Preparación indica Elegir carpeta al parar; pausa/continuación y parada correctas (~58 s de audio) |
| Cancelación del selector | `pendingDestination`, 0 fragmentos enviados, 1.412.862 muestras conservadas |
| Recuperación y destino posterior | Selección de proyecto de pruebas y carpeta PRUEBAS; transcripción completada con ambas partes y sin «dragón violeta noventa y nueve» |
| Colisión de nombres | El segundo documento utiliza sufijo (1); el primero permanece |
| Editor visual | El marcador de recuperación de los documentos nuevos es una definición Markdown no visible; título y transcripción se muestran sin detalles internos |

Archivos de prueba: `<proyecto>/PRUEBAS/Prueba grabacion carpeta 2026-10-30.md` y `<proyecto>/PRUEBAS/Prueba grabacion carpeta 2026-10-30 (1).md`.

Incidencias encontradas y corregidas: perfil WebView de desarrollo en conflicto con la instalación, ausencia del menú de botón derecho, cierre con Escape/clic externo y anchura del menú, e identificador de recuperación visible en Milkdown. La lectura de identificadores antiguos se conserva para recuperar documentos ya creados.

El usuario abrió la miniventana mediante el icono de la bandeja. Después se completó también el recorrido de grabación desde esa ventana, como se detalla a continuación. El color del icono de notificación no se ha inspeccionado automáticamente. Micrófono, Teams con auriculares, sesiones prolongadas y Android siguen pendientes.


### Continuación: grabación desde la bandeja

El usuario confirmó «Miniventana abierta». Se localizó la ventana nativa `Grabaciones · KnowNext.ai` y se operaron sus controles con Computer Use.

- Sesión `7aaa2a91-760e-46e7-8604-513b5f379ad2`, micrófono desactivado y loopback Realtek activo.
- Inicio y pausa desde la miniventana: contador detenido en 45 s. El panel principal mostró esa misma sesión y duración.
- Durante la pausa se reprodujo la frase sintética «cometa verde treinta y dos». El PCM conservó sus 2.195.890 bytes y el mismo SHA-256.
- Continuación desde la miniventana: mismo UUID, contador vuelve a crecer y barras de audio visibles con señal (54 % en una captura).
- Parada desde la miniventana, selección de proyecto de pruebas, carpeta PRUEBAS y nombre de documento.
- Transcripción real completada con GPT-Transcribe usando la clave existente: 2.046.520 muestras, unos 85 s de audio capturado, ambas partes presentes y frase de pausa ausente.
- `Abrir documento` desde la miniventana restauró la ventana principal y abrió el Markdown visual sin mostrar metadatos internos.

Archivo: `<proyecto>/PRUEBAS/Prueba grabacion bandeja 2026-10-30.md`. La sesión quedó completada y sin captura activa. La aplicación y la miniventana permanecen disponibles para pruebas del usuario.


## Preparación de publicación 2.6.0

El mantenedor solicitó desplegar la aplicación para realizar las siguientes pruebas en reuniones reales con su versión instalada. Se conserva el alcance de aceptación parcial documentado y se prepara la actualización con las identidades de firma existentes. Los artefactos firmados se construyen en GitHub Actions, donde están configurados los secretos; sus valores no se copian al entorno de desarrollo. La verificación pública de MSI, NSIS, firmas, APK y ambos manifiestos se realiza antes y después de publicar.
