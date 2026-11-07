# Grabación de reuniones y catálogo de OpenAI

## Contratos e integración

`knownext-recording` contiene un actor Rust propietario de la captura, manifiestos de sesión y una cola secuencial de transcripción. `src/recording.rs` expone comandos Tauri y adapta bandeja/autoinicio. React utiliza `lib/api/recordings.ts`; no recibe credenciales ni realiza llamadas a OpenAI. Se reutiliza la credencial local de `LocalApi`.

Los estados son `recording`, `paused`, `pendingDestination`, `ready`, `queued`, `transcribing`, `attention` y `completed`. Las acciones se confirman por el runtime; cada instantánea incluye revisión. Una sesión nueva puede capturarse mientras otra se transcribe. El dictado adquiere el mismo propietario exclusivo del micrófono. Las consultas de estado no emiten eventos de modificación del proyecto.

Los datos viven en el directorio privado de aplicación, en `recordings` (`recordings-dev` en compilaciones de desarrollo), nunca dentro del proyecto ni de Git. Cada UUID contiene `session.json` atómico y PCM separado de micrófono/sistema a 24 kHz, 16 bits. Los checkpoints se sincronizan cada dos segundos y en transiciones. La captura no se reanuda automáticamente tras un cierre. Los envíos sin respuesta confirmada requieren reintento explícito.

## Adaptadores

Windows usa WASAPI compartido con conversión nativa a 24 kHz y loopback de una salida seleccionada. Los timestamps de paquetes comparten el reloj QPC y se alinean con relleno de silencios y control de solapamientos. El desfase real en una sesión de dos horas queda sujeto a aceptación con dispositivos físicos. Un intervalo de procesamiento superior a cinco segundos interrumpe la captura de forma recuperable.

Android usa `AudioRecord` y un servicio de micrófono en primer plano en el mismo proceso, con wake lock durante captura, notificación y acciones de pausa/continuación/parada. No captura llamadas ni el audio de Teams. WorkManager ejecuta un fragmento de transcripción por trabajo con requisito de conexión y runtime Rust inicializable sin Activity/WebView. La comunicación HTTPS de Rust en Android utiliza raíces públicas Mozilla con verificación TLS; no necesita inicializar el verificador JVM y no incorpora certificados privados añadidos al almacén Android.

## Procesamiento y conservación

Los fragmentos WAV mono tienen como máximo cinco minutos (14,4 MB más cabecera). Los cortes buscan silencios en los últimos cinco segundos y no solapan muestras. Se guardan resultados y SHA-256 del PCM por fragmento; se verifica su integridad antes del envío. HTTP se ejecuta fuera del mutex de `LocalApi`. Solo se reintentan automáticamente fallos demostrablemente anteriores al envío y HTTP 429, con límite de tres intentos. Un timeout después del envío, respuesta incompleta o HTTP ambiguo conserva el audio y exige confirmación; el consumo puede repetirse.

La escritura Markdown utiliza un temporal y `persist_noclobber`, sufijos numéricos y una marca de sesión. Un reintento de guardado reutiliza resultados y reconoce el documento creado en su carpeta. No se publica un documento con fragmentos pendientes. El documento no contiene enlaces a audio efímero.

La conservación por defecto es siete días desde la creación del documento. Pendientes y marcadas Conservar no caducan. La limpieza se ejecuta con la aplicación abierta. Las concesiones de reproducción y la protección de peticiones en vuelo impiden borrar audio en uso. La reproducción carga bloques locales de treinta segundos con búsqueda temporal.

## Modelos y dinero

`apps/desktop/shared/openai-models.json` es el catálogo versionado consumido por TypeScript y Rust. Los valores guardados no se sustituyen silenciosamente. Modelos desconocidos, retirados o sin capacidad requerida se bloquean antes de consumir. Las nuevas configuraciones usan Sol, Terra, Flare y GPT-Transcribe. Comprobar acceso consulta visibilidad del modelo sin generar contenido.

Los costes nuevos se calculan en USD con tarifas por modalidad y se convierten mediante `EUR = USD / USD_por_EUR`. `eur-usd.json` conserva fecha, fuente BCE y último intento diario. Cada registro nuevo almacena tarifa y referencia aplicada; los históricos sin conversión verificable se excluyen de los nuevos totales. Sin referencia se muestra USD y EUR no disponible. Los trabajos de investigación con presupuesto EUR se bloquean de forma recuperable hasta disponer de una referencia de los últimos siete días. Las estimaciones no equivalen a factura, especialmente ante envíos ambiguos.

## Límites de aceptación

La compilación y las pruebas con PCM sintético no prueban el comportamiento de auriculares, pantalla bloqueada, políticas de batería, dispositivos que no admitan 24 kHz, calidad lingüística o duración prolongada. Estos casos requieren la matriz manual. No se ha publicado ni instalado una release por esta implementación.


Fuentes del catálogo y contratos: [modelos OpenAI](https://developers.openai.com/api/docs/models), [transcripción de archivos](https://developers.openai.com/api/docs/guides/speech-to-text), [BCE](https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml). Cada entrada del catálogo conserva también su URL y fecha de consulta.


### Recibos de consumo por fragmento
Chunk añade usageReceipt opcional y usageRecorded (omitido si falso). Recibo tipado compartido en knownext-core, sin texto/credenciales; inicio y proyecto fijados al enviar. Se persiste antes de HTTP, se confirma junto a transcripción y se entrega idempotente a LocalApi::record_recording_usage. Con resultado incierto se mantiene sin importe EUR confirmado. Una nueva retransmisión explícita usa otra identidad; reintento de acuse local conserva el mismo recibo. Entregar texto ya completo no requiere clave/presupuesto. Reconciliar usa manifiesto completo de disco, nunca snapshot UI con texto omitido. Copia previa exacta por digest antes del primer recibo: sessions-recovery,500/128MiB, sin limpieza implícita. Android clona el mismo LocalApi del servicio para compartir puertas de uso y presupuestos. No downgrade2.6 ni reconstrucción retrospectiva de consumos sin recibo.


### Audio portable · bloque124

Importación portable de escritorio: origen tipado1 opcional en Session (omitido si ausente), futuro rechazado/preservado al leer; identity/SHA y proyecto receptor, sin ruta/estado del proveedor. Publicación exclusiva PCM + session.json al final, attention/keep y sin cola/coste/caducidad. Identidad ocupada no se repite; copiar no transcribe. Admisión global opcional y límite del almacén de512MiB/1000 carpetas para admitir nuevas copias, medición10000 entradas/2segundos. Captura ordinaria conserva sus reglas. Android solo revisión por ahora.


### Historial portable y grabaciones integradas · bloques125–126

RecordingPanel admite embedded para el gestor del espacio: compacto, sesiones iniciales visibles, cierre/Ajustes y áreas44px; bandeja conserva comportamiento. useCompactRecordingWindow solo redimensiona label recordings, después de comprobar runtime/móvil. No se inicia captura/transcripción al abrir sesiones o ajustes.
