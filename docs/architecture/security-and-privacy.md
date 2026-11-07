# Seguridad, privacidad y autoridad local · bloque3 / entrega131

Implementación local: [criterios](../product/revision-3.0-implementacion/bloque-131.md) y [evidencia](../product/revision-3.0-implementacion/avance-131.md). Windows DPAPI contrastado con credenciales sintéticas; Keystore mantiene el adaptador existente. No equivale a aceptación Android/Windows instalada ni a una auditoría de inmunidad frente a cualquier ataque.

## Credenciales

`security_controls` revisa `credentials.json` sin migrarlo al consultar ni devolver secretos. Rotación y retirada necesitan esquema1, confirmación y revisión SHA vigente. El formulario existente usa este contrato revisado; no se duplica la entrada de claves. `credential_gate` serializa cambios compartidos con autenticación; orden auth→credentials. Los cambios GitHub invalidan la generación de respuestas pendientes y limpian el estado público/desafío conocido. Cambiar OpenAI no revoca ni cambia una autorización externa.

Restablecer/restaurar conserva primero una copia nativa cifrada del original exacto, incluso si es ilegible o futuro. Se comprueba descifrado y coincidencia antes de sustituir; nunca se crea copia en claro. `credential-recovery`: sobres estrictos1,16 copias/16MiB, lectura individual2MiB. Restaurar exige compatibilidad actual y huella exacta de la copia, y vuelve a proteger las claves; originales ilegibles quedan conservados sin prometer reparación. Eliminar una copia requiere identidad, huella y confirmación nuevas. No hay exportación a React ni borrado/rotación en el proveedor. La protección está vinculada al usuario/dispositivo; los valores en memoria tienen vida normal de Rust, sin promesa de borrado completo de RAM.

## Datos IA

`ai-privacy-policy.json`1: hasta256 proyectos/256KiB, revisión y escritura atómica; formatos ilegibles/futuros bloquean nuevos envíos, no se convierten a permiso vacío. Sin regla, se conserva el comportamiento previo. `spend_preflight` comprueba esta política antes de presupuestos/proveedor para texto, imágenes, investigación, dictado y cada nuevo fragmento de grabación. El alcance es el proyecto; una operación sin proyecto no hereda otra identidad. Pausar no interrumpe HTTP iniciado ni impide capturar/guardar PCM.

Revisión explícita por proyecto y selección de categorías. Fecha límite opcional: última fecha válida conocida de creación/actualización/finalización/recepción/indexación; sin fecha se conserva al filtrar antigüedad. La opción Todos elimina las entradas seleccionadas del formato conocido. No caduca ni limpia nada al arrancar o al consultar.

| Categoría | Propietario / efecto local |
|---|---|
| Conversación | ai_private_state; retira eventos seleccionados y conserva el sobre conocido |
| Contexto adjunto | ai_private_state/context_runtime; retira copias/referencias elegidas, no sus archivos de origen |
| Índice | ai_index_store; retira el archivo validado; el estado se consulta desde la fuente actual |
| Resultados conservados | ai_results; catálogo acotado con identidad/hash de archivo y propietario exactos |
| Investigación | ai_operational_state; retira registros del proyecto; no informes guardados ni originales |

Excluidos: documentos, borradores, Git, audio/transcripciones originales, contabilidad/recibos de gasto, copias de recuperación, exportaciones y copias del proveedor. Se gestionan en sus flujos específicos. La app no garantiza eliminación remota, sincronización del borrado ni borrado forense. Las imágenes remotas del documento pueden pedir recursos a su servidor con independencia de la pausa IA; se explica en la política visible.

Antes de eliminar se exige pausa y ausencia de trabajo incompatible. `PrivatePermit` compartido mantiene actividad a través de esperas/cálculos de interacciones, proveedores y reindexado; investigación mantiene su actividad de fondo hasta terminar. La eliminación obtiene exclusión privada, de investigación y de proyecto, revalida política/raíz/selección/huellas de todas las fuentes y solo entonces publica el recibo inicial exclusivo. No puede ganar autoridad a través del contenido de una fuente.

La revisión conjunta admite128MiB/260 archivos; conservan sus topes propios conversación/contexto/investigación32MiB, índice64MiB y resultados256 entradas/64MiB totales. Lecturas no regulares/enlaces, extensiones de sobre/versiones no admitidas, exceso o cambios de revisión impiden aplicar. La validación del formato pertenece a cada dominio; los contenidos de los eventos no se interpretan como instrucciones. Son límites de trabajo/datos, no una garantía absoluta de memoria pico del WebView o del SO.

`ai-privacy-receipts`: esquema1, máximo1000 identidades,64KiB por archivo. Solo ID, proyecto, revisión, fase, contador y fecha; ningún payload eliminado. Antes de cada archivo se revalida su huella; cada efecto es atómico por archivo. No es una transacción atómica del conjunto: un fallo puede dejar una eliminación parcial, se informa y conserva el resto. Consultar o reenviar el mismo ID solo observa. Si quedó applying y ya no existe trabajador exclusivo, la consulta lo describe como interrumpido sin reescribir el recibo. Continuar requiere otra revisión e identidad; no se reciclan IDs automáticamente.

## Superficies y permisos

| Superficie | Autoridad |
|---|---|
| main | API del espacio, gestión de datos/credenciales, pickers, diagnóstico, actualización y salida, siempre bajo precondiciones de dominio |
| recordings | Comandos auditados de captura y lectura de su audio; GET de salud/proyectos/árbol para elegir destino. Sin documentos privados, claves, gestión IA, diagnóstico general, shell o updater |
| Cualquier otro nombre | Sin acceso a comandos del producto; nombres derivados de la ventana Tauri real |
| Recursos y vistas | Protocolo de assets validado por proyecto; CSP sin object/frame y scripts locales; PDF/Mermaid/imágenes/audio locales conservan mecanismos existentes |
| Navegación de WebViews | Plugin común: solo origen local Tauri y about:blank; dev permite127.0.0.1/10.0.2.2:1420. Rechaza hosts parecidos, credenciales y protocolos externos |
| Enlaces externos explícitos | Helper solo http/https sin credenciales ni controles; nativo conserva el permiso shell existente para main, navegador usa noopener/noreferrer |

Se revisaron las16 entradas registradas del handler y sus guardas, más las operaciones del enum managed_native. Las fachadas no registradas permanecen detrás de esa puerta principal. La CSP de recursos no se amplía por este bloque. Navegación no equivale a filtrado de solicitudes de imágenes enlazadas.

## Matriz de autoridad IA

| Capacidad | Comprobación determinista |
|---|---|
| Consulta | `readOnly:true` reduce permisos del sobre al proveedor y rechaza efectos documentales/archivos al volver; no se infiere del idioma ni de palabras del prompt |
| Editar Markdown/nota | Proyecto, raíz, permiso vigente, destino existente, base guardada y borrador; conserva cambios posteriores |
| Crear | Carpeta elegida, permiso, nombre/tipo portable y publicación exclusiva; no reemplaza ocupaciones tardías |
| Eliminar/mover | Efecto sin ejecutor/confirmación nativa se rechaza; una operación estructurada no demuestra que se ejecutó |
| Imágenes/dibujo | Permisos, destino/base, formato/cupo y coste antes de llamadas nuevas; ACK de recurso solo nativo |
| Investigación | Política/fuentes/presupuesto, estado durable y revisión; una fuente no cambia permisos |
| Transcripción | Audio/proyecto, política de envíos y presupuesto; propuesta/recibo, no autoridad para escribir otro documento |

Se eliminan acuses y campos de efecto suministrados por el modelo. La autoridad actual se vuelve a comprobar tras la espera. Pruebas sintéticas cubren respuesta de solo lectura que intenta5 efectos, otro proyecto/ruta, permisos/raíz cambiados y ACK falsificado. Esto no prueba que un modelo interprete siempre correctamente las intenciones: la campaña semántica real T17 permanece aplazada.

## Límites de entrada y formatos

`validate_runtime_input` se aplica antes de reglas y decodificación de la API local:64 archivos, profundidad JSON64,250000 nodos,192MiB de texto,180MiB base64 por archivo/352MiB conjunto. El vector de recorrido también está acotado antes de ampliarlo. Metadatos y base64 estándar se validan sin decodificar; cada dominio conserva límites menores. La serialización IPC inicial ya ocurre en Tauri: este control no promete prevenir toda asignación del transporte.

| Formato | Control propietario que permanece vigente |
|---|---|
| Markdown/texto/nota importada | file_imports32MiB, nombres portables, UTF-8/formato y publicación nueva; no se convierte base64 inválido en vacío |
| Imágenes | Cabecera real, tipo/dimensiones y límites de imagen antes de crear; no confiar en extensión |
| Contexto subido/PDF |32MiB por fuente antes de extracción; extractor PDF acotado y advertencia explícita; sin OCR/IA implícitos |
| Paquete knownext.project | ZIP128MiB, contenido expandido128MiB, archivo32MiB, manifiesto8MiB,10000 entradas; lector limitado por tamaño verificado, traversal/alias/reservados/futuros rechazados antes de extraer |
| Plantillas/catálogos | Validadores estrictos y límites de sus transferencias; no incluyen configuración ni credenciales |
| Historial/audio portables | Validadores de bundle/partes/WAV, huellas y presupuestos propios; sin activar trabajos ni proveedores al incorporar |
| Índices y almacenes privados | Lectura acotada y versiones por dominio; no normalizar un formato futuro/dañado como instalación vacía |

Los formatos ampliados en otros bloques deben actualizar su propio contrato y corpus. El bloque no añade frameworks, servidor, procesos auxiliares ni cambios de editor.

## Aceptación

Ver evidencia de131. Los tests no usan claves reales ni perfiles instalados. Mantener separación entre compilación de biblioteca Tauri Windows, adaptadores UI controlados y aceptación instalada. P10 conserva WebView empaquetado, permisos/Keystore reales, recuperación entre dispositivos, pérdida de energía/espacio y regresión final. Sin IA de pago.
