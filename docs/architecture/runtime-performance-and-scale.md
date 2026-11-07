# Rendimiento local y escala

La aplicación mantiene los documentos y la ejecución en el dispositivo. Las medidas del bloque 139 distinguen el grafo de recursos web, la experiencia del editor en Chrome, el dispatcher Rust y la cobertura de búsqueda. Ninguna de estas medidas equivale por sí sola al arranque de la aplicación nativa.

## Carga del frontend

`createDeferredView` carga módulos de vista al solicitarlos, conserva las propiedades actuales y permite reintentar una importación fallida sin recargar el espacio de trabajo. La activación opcional evita que una vista montada pero oculta solicite su módulo. Después de la primera activación mantiene la instancia del hijo; cerrar y abrir ajustes no añade una pérdida de su estado local.

`App` difiere ajustes, revisión de evidencias, biblioteca de recursos, actas, plantillas de proyecto y transferencia. La transferencia también se difiere desde `ProjectRecoverySection`: mantener esa importación estática anulaba su separación desde `App`. Los documentos de trabajo y las decisiones de persistencia permanecen en sus servicios y modelos existentes. Milkdown conserva su límite de carga previo y sigue siendo el editor visual.

| Build | JavaScript inicial sin comprimir | SHA-256 del manifiesto |
| --- | ---: | --- |
| Antes | 2.040.224 bytes | `1672c816301cc1953d8a91241e379f416f6246b05dd7388ce69cd2c799fe8b5c` |
| Intermedio: cinco límites efectivos | 1.787.928 bytes | `7a63afc8672b7d5f4d8d56479261879a1c1b9fdd7851fe6abe9e456f26435619` |
| Final: transferencia separada también de recuperación | 1.747.990 bytes | `fd1ece6ddca4f167ffbd073b843527d712502f1d6ffab549a170e72bbdbbe994` |

La reducción final es de **292.234 bytes, un 14,32 %**. Se calcula recorriendo los imports estáticos de las entradas del manifiesto de producción; no es una estimación del tamaño instalado ni de la memoria.

La comprobación funcional del build final verifica que ajustes se adquiere al abrirse, que reabrirlo reutiliza el módulo y que transferencia solicita su propio chunk al usarse. El navegador usa la API central de desarrollo; no se inyecta un puente Tauri, no se abre un selector de archivos y no se llama a proveedores.

Evidencias: [grafo final](../../output/frontend-load-block11-final.json), [aperturas en producción](../../output/v3-block11-deferred-production-evidence.json), [informe visual](../../output/v3-block11-frontend-performance.html) y [hashes de fuentes](../../output/v3-block11-frontend-source-evidence.json).

## Editor: medidas y límites observados

El benchmark utiliza un proceso y un contexto nuevos de Chrome por muestra, caché desactivada, notas sintéticas y tres muestras por tamaño. Primero mide la bienvenida con notas vacías. Después recarga con la nota persistida, cuya restauración es automática. Ese segundo tiempo incluye la navegación completa y la carga del editor, no sólo su renderizado.

Las latencias se compararon entre el build anterior y el **intermedio**. Al cerrar el último límite de transferencia se repitieron únicamente el grafo y las aperturas funcionales, sin volver a ejecutar las seis mediciones.

| Mediana observada | Antes | Intermedio medido |
| --- | ---: | ---: |
| Bienvenida, seis muestras | 1.504,1 ms | 1.611,5 ms |
| Restauración de nota de 1.429 bytes | 552,3 ms | 405,6 ms |
| Edición de 14 caracteres en nota pequeña | 111,2 ms | 77,8 ms |
| Heap JS de nota pequeña, tras GC explícito | 9,67 MiB | 9,69 MiB |
| Restauración de nota de 331.455 bytes y 1.200 secciones | 2.360,0 ms | 2.421,8 ms |
| Edición de 14 caracteres en nota grande | 900,3 ms | 981,6 ms |
| Heap JS de nota grande, tras GC explícito | 36,34 MiB | 36,35 MiB |

No hay una victoria estable de latencia para el documento grande ni para la bienvenida. La reducción de bytes sí es determinista para los manifiestos registrados. La edición medida incluye el envío automatizado de los 14 caracteres y dos frames; **no significa 982 ms por tecla**. La persistencia observada es la de desarrollo en `localStorage`, no Rust. El heap JS tampoco es la memoria total de la aplicación.

El listener de Milkdown instalado ya agrupa la serialización Markdown mediante un debounce de 200 ms; el autoguardado de notas añade 800 ms. `checkpointPendingEditorInput` finaliza gestos locales antes de capturar modelos y no sustituye esos mecanismos. Este bloque no cambia la serialización, la integridad ni el modelo de edición. Una siguiente optimización del documento grande necesita atribución de CPU y pruebas de continuidad antes de modificar ese recorrido.

Evidencias: [muestras anteriores](../../output/frontend-benchmark-block11-before.json) y [muestras intermedias](../../output/frontend-benchmark-block11-after.json). Se conservan sus hashes de build; las latencias intermedias no se reasignan al build final.

## DTO de rendimiento del runtime

`GET /api/runtime/diagnostics` puede incluir `performance`. Se observa desde la vista avanzada de Sistema mediante el SDK `runtimePerformance.ts`. Si el runtime no lo ofrece, se muestra como no disponible; no se sustituye por ceros. Una respuesta incompatible produce un error y conserva la última observación válida en pantalla.

| Campo o límite | Contrato |
| --- | --- |
| Versión | `schemaVersion: 1`, `available: true` |
| Ámbito | `scope: "local-api-requests"`, `clock: "monotonic-wall-clock"` |
| Privacidad y efectos | `persistent: false`, `readOnly: true`, `startsProvider: false`, `includesStartup: false` |
| Dimensiones | Hasta 11 clases fijas: documentos, proyectos, historial, búsqueda, IA, transferencia, recuperación, ajustes, seguridad, runtime y otros |
| Muestras | Últimas 128 duraciones por clase; no se crean clases con IDs o nombres del usuario |
| Agregados de sesión | `count`, `errorCount`, `totalDurationUs`, `maxDurationUs` por clase; `observedRequests` y `errorCount` globales |
| Percentil reciente | `p95RecentDurationUs` sobre las muestras retenidas; `recentSamples` indica su cantidad |
| Unidades | Duraciones enteras en microsegundos; presentación en milisegundos |

Los contadores son locales a la instancia de `LocalApi`, compartidos por sus clones y descartados al cerrar. No contienen documentos, rutas, consultas, prompts, credenciales, IDs de petición ni mensajes de error. La clasificación usa posiciones estructurales de rutas, no texto libre del usuario. La consulta del propio diagnóstico se excluye de la medición para que observarlo no altere el snapshot.

El reloj empieza dentro del dispatcher Rust. Excluye cola del llamador, IPC, renderizado, arranque y servicios invocados directamente fuera de este API, como los ticks de copias. Contar una clase IA no inicia una llamada IA.

La campaña Rust sintética registrada utilizó Windows x86-64, perfil debug, 500 Markdown, 20 carpetas y 32.582.500 bytes:

| Operación | Primera observación | p50 posterior | p95 posterior |
| --- | ---: | ---: | ---: |
| Árbol del proyecto | 135,279 ms | 71,299 ms | 115,641 ms |
| Lectura documental | 7,478 ms | 10,307 ms | 13,415 ms |
| Búsqueda de contenido | 1.088,218 ms | 1.297,668 ms | 1.502,412 ms |

La memoria observada pertenece al proceso de prueba completo. No se expulsó la caché del sistema y no se midieron UI nativa, IPC ni Android. No se imponen umbrales de latencia a otros equipos con estos resultados. Véase [campaña del dispatcher](../../output/v3-block11-native-performance.json).

## Búsqueda con cobertura explícita

La búsqueda trabaja sobre archivos visibles, regulares y guardados. Verifica bytes de las fuentes en cada consulta, incluso al reutilizar texto en memoria. No mezcla borradores abiertos con archivos persistidos ni deduce texto por OCR.

Límites registrados: consulta de 2–200 caracteres, hasta 10.000 entradas, 50 resultados, presupuesto de exploración de 2 segundos, 64 MiB de lectura, 2 MiB por archivo de texto, 8 MiB por PDF y 32 MiB de texto cacheado. Alcanzar un presupuesto o excluir contenido no revisable debe producir cobertura parcial; cero resultados parciales no prueba ausencia.

| Corpus sintético | Primera exploración | Cobertura inicial | Exploración posterior | Cobertura posterior |
| --- | ---: | --- | ---: | --- |
| 103 documentos | 140,643 ms; 103 explorados | Completa | 102,001 ms; 103 explorados | Completa |
| 1.003 documentos | 2.037,358 ms; 778 explorados | Parcial | 1.325,395 ms; 1.003 explorados | Completa |
| 5.003 documentos | 2.045,318 ms; 2.177 explorados | Parcial | 2.076,622 ms; 1.894 explorados | Parcial |

El corpus de aproximadamente 5.000 documentos **no demuestra un índice completo** dentro del presupuesto. Los 50 resultados requieren distinguir entre exactamente 50 coincidencias y más coincidencias omitidas. Las pruebas de frescura incluyen cambio de bytes con igual timestamp, renombrado y eliminación; cuando la cobertura es parcial no se generaliza una comprobación puntual al corpus entero.

El PDF sintético tiene tres páginas y comprueba texto multicolumna, Unicode/ToUnicode y ligaduras; excluye metadatos. El orden es el del flujo de contenido: no reconstruye el orden de lectura de columnas. La página escaneada sigue sin texto extraído. **No se ejecuta OCR** y se comunica el adjunto sin texto, en lugar de inventar contenido.

Evidencia y presupuestos exactos: [corpus y PDF](../../output/v3-block11-search-corpus-benchmark.json). Estas campañas no envían información a IA, no abren la UI nativa y no ejecutan Gradle. Sus resultados se consolidan aparte de la regresión funcional final.

## Revinculación y continuidad de raíces

Revincular cambia la asociación de un proyecto existente; no copia, mueve ni elimina sus documentos. Conserva su identidad y deja desactivados sincronización e historial en el nuevo destino hasta una configuración explícita. La admisión distingue una ubicación registrada que devuelve `NotFound` de errores de permisos, archivos en lugar de carpetas y enlaces: estos últimos no habilitan el fallback de ausencia.

Para una fuente ausente se reconstruye la identidad desde un ancestro existente regular y el sufijo normalizado. Así, un registro histórico con `..` o un alias de ruta no omite una reserva anterior. Se conserva el permiso exclusivo del propietario correlacionado; si la identidad no permite correlacionarlo exactamente, se reservan conservadoramente los propietarios retenidos. Un escritor activo bloquea la revinculación; los propietarios inactivos no la dejan bloqueada permanentemente. El destino obtiene además su propia reserva exclusiva. Si otra asociación no permite demostrar ausencia de solapamiento, se exige revisarla o retirarla antes de continuar.

La revisión del usuario se vincula a la revisión del registro, el sello de carpeta y la ruta candidata. Antes de admitir el destino se toma una huella de **metadatos y entradas inmediatas**, ligada de nuevo a esa revisión original; se compara después de adquirir la reserva y antes de publicar. No se acepta un nuevo baseline arbitrario como supuesto efecto de coordinación. La comprobación está acotada a 10.000 entradas y dos segundos. Los nombres `.knownext-runtime`, `owner.lock`, `runtime-owner.lock` y `capture.lock` se excluyen antes de consultar sus metadatos. Esta huella no es un hash recursivo del contenido documental.

Antes de escribir el registro se comprueban también su revisión y la identidad ausente de origen. Que reaparezca la ubicación registrada de origen, cambie el destino o cambie el registro cancela la publicación. El recorrido Tauri de actualización mantiene la autoridad de mutación del runtime y coordina la actividad de grabación; la comparación y escritura del registro están serializadas frente a las mutaciones cooperativas que usan esa autoridad. Una llamada directa a `LocalApi` debe respetar ese contrato. **No hay un CAS atómico contra programas externos** que alteren carpetas o el registro entre comprobaciones.

Las pruebas focales de `project_locations::tests` contemplan propietarios inactivos, alias del origen con escritor retenido, alias de otro proyecto, cambios de entrada o raíz durante admisión y las carreras posteriores de origen, registro y destino. Su resultado se registra en la campaña focal del coordinador; enumerar esta cobertura no declara aprobada la regresión completa. Implementación y fixtures: [project_locations.rs](../../apps/desktop/src-tauri/crates/knownext-storage/src/project_locations.rs), [projects_runtime.rs](../../apps/desktop/src-tauri/crates/knownext-storage/src/projects_runtime.rs) y [permisos de operación](../../apps/desktop/src-tauri/crates/knownext-storage/src/project_owner/operations.rs).
