# Grabaciones, actas y OCR revisable · entrega134

Control de captura compartido existente, sin servidor ni proceso auxiliar. Transcripción/audio originales y trazos son fuente. React consulta servicios; proveedores solo Rust/Tauri. No se ejecutaron llamadas reales IA.

## Grabaciones y escucha

`knownext_recording::transcript_source(root,id)` y `recording_request("transcript",{id})` leen fuente local bajo demanda sin snapshot de textos general. Solo sesión detenida/sin trabajo;2048fragmentos/2MiB texto, intervalos validados contra muestras y SHA del manifiesto. No se atribuye SHA a todos los PCM ni CAS externo. Tiempos son rangos de captura: no palabras ni hablantes inferidos. Audio ausente/retirado y fragmentos pendientes se explican.

`RecordingAudioPlayer` lee como máximo30s/720000muestras por bloque, usa lease renovable contra limpieza y permite escuchar rango. ModalFrame compartido contiene foco/Tab/Escape y devuelve foco sin editar el fondo. Control compacto, niveles reales y tiempo permanecen fuera del scroll. Entradas de acta desde gestor o evento de bandeja a main, sin duplicar captura.

## Actas

GET/POST `/api/projects/:id/meeting-minutes`, POST `/review`, GET `/:attempt`. La fuente autoritativa se relee con el helper de recording, mismo directorio recordings-dev/debug y recordings/release que el runtime. Revisión ligada a proyecto/raíz/fuente/draft; plantilla manual con resumen/acuerdos/acciones y referencias de fragmento. Responsable/fecha son decisiones humanas, no identificación automática ni automatización externa.

Publicación crea archivo Markdown nuevo en raíz del proyecto; objetivo ocupado falla sin sobrescribir. Recibo anterior al efecto, preparado/completado/incierto, fuente completa y Markdown conservados; consulta no infiere ejecución por encontrar texto coincidente. Protección/recarga existente y apertura diferida hasta bootstrap completo. Cambios no publicados requieren descarte explícito al cerrar.

Almacén meeting-minutes/<sha-proyecto>/*.json,64intentos/128MiB por proyecto,8MiB por recibo, fuente4MiB/2000fragmentos yMarkdown4MiB. Hasta64acuerdos+64acciones. No caducidad/replay automático.

## OCR

POST `/api/handwritten-notes/:id/ocr` con pageId/attemptId/acknowledgeRemote. Catálogo GET en esa ruta y GET `/:attempt`; POST `/:attempt/apply`. GET `/api/projects/:id/handwritten-ocr` para inventario/procedencia privada. Fuente nativa toma JSON conocido2MiB, PNG4MiB y huellas de raíz/disco/página/texto; nunca interpreta instrucciones de la imagen como acciones. Config/permisos/pausa/privacidad/presupuesto se comprueban antes del envío. Responses con input_image/store:false, una llamada sin herramientas ni reintento; modelo de visión configurado/catálogo. Contrato conforme a [Images and vision oficial](https://developers.openai.com/api/docs/guides/images-vision?api-mode=responses).

Espera del proveedor fuera de autoridad global/proyecto, con actividad privada y cola IA. Intento durable previo al envío, resultado retenido aunque cambie la vista. Sin clave se informa de indisponibilidad sin enviar; tras acuse incierto consultar no reenvía. La UI requiere consentimiento remoto y muestra posible coste; no anuncia OCR local.

Aplicación es local y explícita tras corregir hasta64000caracteres/256KiB por página,512KiB total de texto por nota. Revalida fuente tras guardar el intento y antes de escribir con CAS de borrador. Solo modifica ocr.textByPage de la página, conservando trazos/otras páginas. Guardar la nota lleva el texto al índice existente; no se ejecuta reconocimiento continuo. Root serializa con autosave/guardar y protege visita/base/época; ACK tardío se fusiona solo si página/texto siguen compatibles, manteniendo ediciones posteriores de otras páginas. Consulta de ACK aplicado verifica borrador nativo exacto y reconcilia sin repetir el efecto.

Almacén handwritten-ocr global64identidades/64MiB,8MiB por registro, sourcePNG+propuesta/corrección/acuses retenidos, sin purga automática. Contiene datos privados; no lo confundir con borrado de historial de conversación. Límite lleno bloquea nuevas admisiones; no recicla identidad silenciosamente.

## Privacidad, portabilidad y límites

Inventarios/cupos incluyen ambos almacenes; archivos de coordinación se excluyen por nombre antes de metadata. Fuentes/recibos viajan con huellas en archivo privado Edicion/*.bin+LEEME.json como dataOnly/runtimeAdoption:false. Importar no activa recibos/permisos/envíos y el paquete documental no incluye ese historial privado.

Diarización y sincronía fina solo se ofrecen cuando existen datos compatibles; el modelo actual devuelve fragmentos de captura. Acta manual no se anuncia como resumen IA. No se certifican hechos ni se crean tareas externas. Reconocimiento continuo/selección arbitraria y pilotos físicos requieren su entrada de producto; página explícita es el recorrido implementado. T17 real se mantiene aplazado por no gasto. P10 incluye dispositivos/IME/portapapeles/audio/stylus, suspensión/cortes/retención, selectores y aceptación instalada. Build y QA controlada no acreditan esos hechos.
