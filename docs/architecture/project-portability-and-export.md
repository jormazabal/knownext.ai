# Portabilidad y exportación · contrato del bloque 4

Corte vigente: entrega132. Fuente de criterios: [bloque-132](../product/revision-3.0-implementacion/bloque-132.md). Desarrollo local; la aceptación de binarios instalados y dispositivos sigue en P10. No hay servicio externo, proceso auxiliar de producto ni llamadas de proveedor.

## Historial coexistente y consulta

`project_transfer/history_adoption.rs` verifica inventario, partes SHA256, bundle autónomo, referencias y objetos en un repositorio temporal. Con destino Git conocido incorpora objetos y crea referencias privadas nuevas mediante una transacción `update-ref`; no sustituye referencias ajenas. No hace checkout, reset, cambio de HEAD, índice, archivos, remotos o configuración. Una preparación previa desconocida se conserva y bloquea la incorporación. Una revisión nueva es necesaria tras cambios de catálogo, índice, HEAD o estado de consulta.

`history_views.rs` conserva schema1 por proyecto y raíz canónica, procedencia preparada/completada y punto elegido. Máximo128 fuentes/128 referencias por fuente y2 MiB. La preparación durable precede a publicar referencias; consultar no ejecuta una continuación. Un acuse perdido se observa y requiere revisión nueva. Las versiones se leen desde el punto elegido; una versión nueva en el historial actual invalida esa selección y vuelve a mostrar HEAD. Nunca se ofrecen ramas en producto. `GET/POST /api/projects/:id/history-points` usa páginas de50 y revisión ligada a raíz/HEAD/estado. La selección solo cambia metadatos de consulta.

El Git externo es el servicio local de versiones ya existente en Windows. Android conserva la limitación explícita de historial nativo: importar archivos no instala Git ni ejecuta un bundle. Los bundles y demás datos viajan sin activarse.

## Archivo privado y familias

El paquete documental mantiene formato1; los archivos privados usan los formatos2/3 existentes y preservan generaciones previas. `Trabajo.json` incorpora colecciones, hitos, favoritos y estilos/perfiles de exportación. `Datos IA` conserva conversación, contexto, investigaciones y resultados como copias. Estos datos pueden contener información confidencial escrita por el usuario; la opción privada lo advierte antes de prepararlos. No se incluye el almacén de claves, configuración Git, permisos operativos o trabajos ejecutables.

La proyección de trabajo se vuelve a comprobar antes de publicar. El estilo predeterminado ausente tiene una fecha estable en la copia; no se confunde un reloj generado al leer valores por defecto con una edición del usuario. Inventarios y fuentes del archivo mantienen sus comprobaciones de contenido. Se excluyen los nombres de coordinación antes de metadata o apertura.

`POST /api/projects/:id/portable-workspace/review|apply` permite seleccionar cinco familias. Colecciones/hitos/favoritos/perfiles conservan IDs existentes y añaden los nuevos; favoritos deduplican ruta y las colecciones homónimas reciben otro nombre. Un estilo seleccionado sustituye el estilo actual, de forma explícita. La revisión incluye huellas de origen/destino y confirmación. Cada archivo es atómico; un fallo conjunto puede ser parcial y exige consulta/revisión nueva, sin replay automático. El archivo de origen y los documentos permanecen.

Las preferencias portables2 amplían las1 compatibles: paleta existente y visibilidad/fijación/contenido de paneles además de sus anchuras. Nunca importan geometría nativa, claves ni configuración IA. Conversaciones/contextos/investigaciones/resultados archivados no se reanudan como sesiones.

## Capacidades y tamaños

ZIP de proyecto512 MiB, contenido expandido1 GiB, archivo64 MiB, manifiesto8 MiB y10000 entradas. Se conservan lectura por partes, SHA256, validación de rutas/alias, límites antes de publicación y destino exclusivo. Superar un límite produce fallo explícito sin truncar ni aceptar un conjunto parcial. Los límites particulares de Git, audio, imágenes, notas o conversión siguen siendo menores que el máximo global cuando corresponda.

Audio portable: el mismo contrato y `RecordingService::import_portable` local en Windows/Android. Verifica WAV/PCM, identidad y revisión; publica sesión detenida y retenida, sin cola, transcripción ni envío. Captura, niveles, dictado o trabajo incompatibles bloquean. El servicio mantiene128 MiB de audio por incorporación,512 MiB/1000 carpetas de almacén y el presupuesto opcional. La fuente permanece; un destino desconocido no se reemplaza.

Android SAF transmite archivos con búfer de64 KiB, sin convertir el ZIP en base64 para React. Su límite de paquete/entrega se alinea a512 MiB; recuperación conserva su propio límite explícito. La compilación Rust cruzada no acredita la compilación Kotlin, un APK instalado ni aceptación física.

## Perfiles y lotes

`export_profiles.rs`:32 perfiles/2 MiB, schema1; captura explícita del estilo vigente y opciones de portada e índice. Revisión por huella, futuros/ilegibles conservados, retiro explícito. Aplicar un perfil a una entrega no cambia el estilo global. La portada y los saltos se representan en PDF y DOCX. El índice enumera títulos del mismo parser de ambos renderers e ignora código cercado; no promete números de página. Las notas manuscritas conservan su representación PDF y no reciben portada/índice Markdown.

`export_batch.rs`: hasta32 documentos del mismo proyecto, PDF para lotes mixtos con notas o PDF/DOCX/Markdown para documentos. Texto capturado y diagramas se envían juntos tras proteger cambios pendientes. El runtime captura los recursos y prepara el resultado fuera de la autoridad de mutación. Markdown conserva sus rutas e imágenes locales; recurso faltante, remoto o referencia interna de visualización provoca fallo explicativo. No se descargan dependencias externas.

Captura128 MiB; contenido de resultados480 MiB, ZIP512 MiB, preparaciones retenidas1 GiB/2048identidades. Se comprueban colisiones portables; nombres de salida únicos, manifiesto de tamaños/SHA y ZIP congelado. La revisión se publica después de cerrar y sincronizar el archivo, incluido Windows. Los originales y las ediciones posteriores no se modifican.

`POST/GET /api/projects/:id/export-batches`, `GET/DELETE /api/export-batches/:id` y el intento nativo tipado `export_document_batch` separan preparación, revisión y entrega. Solo prepared/cancelled permiten elegir destino otra vez; una entrega picking sin trabajador se observa uncertain sin reescribirla. El acuse incierto ofrece consulta; nunca reabre automáticamente el selector. Windows crea un archivo nuevo, sin reemplazo; Android usa SAF. Retirar una preparación elimina exclusivamente su ZIP local verificado y conserva recibo, originales y copias externas. Preparaciones interrumpidas desconocidas se conservan y cuentan contra admisión; no se purgan automáticamente. La familia export-batches figura en el inventario común y en los siete cupos conocidos. El presupuesto opcional reserva512 MiB+128 KiB antes de crear una preparación; retirar su ZIP conserva el cupo de identidad. El límite propio incluye los recibos al publicar. El área de trabajo de traslado aumenta a2 GiB para verificar el ZIP y su contenido expandido, sin elevar implícitamente el presupuesto elegido por el usuario.

## Verificación y límites

Contratos dirigidos, corpus existente de renderers, build TypeScript y capturas565–572 de componentes/controladores reales con API controlada. Son pruebas de desarrollo, sin puente Tauri falso ni UI nativa activada. [Avance 132](../product/revision-3.0-implementacion/avance-132.md) reúne los resultados finales. No se declara compatibilidad con todo archivo posible, paridad Git Android, borrado remoto o aceptación instalada. La regresión completa se ejecuta al finalizar el programa; campaña real T17 aplazada por no gasto.
