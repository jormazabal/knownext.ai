# P09 · Plan evolutivo
[Definición](tarea.md) · [Plan principal](../plan.md)
Estado: Desarrollo local del paquete integrado y regresión139 correcta; aceptación instalada/física/humana P10 y T17 real según alcance pendientes. Sin candidata, publicación ni instalación3.0. Responsable: Rust/documentos y QA Windows/Android; persona por asignar. Esfuerzo relativo XL, sin conversión a calendario.

## Entrada
- [P01](../P01/plan.md): entradas pertinentes según las dependencias del plan principal; no exige finalizar todas sus ampliaciones.
- [P02](../P02/plan.md): entradas pertinentes según las dependencias del plan principal; no exige finalizar todas sus ampliaciones.
- [P04](../P04/plan.md): entradas pertinentes según las dependencias del plan principal; no exige finalizar todas sus ampliaciones.
- [P05](../P05/plan.md): entradas pertinentes según las dependencias del plan principal; no exige finalizar todas sus ampliaciones.
Hito propuesto: H4; ampliaciones H6.

## Cortes de trabajo
1. [x] Contratos locales de archivos/exportación/audio/portabilidad y capacidades comprobados (132–135). Git nativo Android no disponible; operación offline instalada/hardware se conserva como aceptación P10.
2. [x] Corpus y límites de exportación de tablas/imágenes/Mermaid/manuscrito contrastados localmente (132/133); formatos no representables se conservan y los lectores externos continúan en P10.
3. [x] Diseñar transferencia documental verificable con manifiesto, assets y .knote, exclusión de secretos y resolución de colisiones.
4. [ ] Probar exportación/importación de ida y vuelta y migración 2.6→3.0 en ambos sistemas.
5. [x] Extender a historial/grabaciones/preferencias y a perfiles/portadas/exportación por lote según alcance seleccionado.

Desarrollo/contratos locales de los cortes1/2/3/5 contrastados en132–135. El corte4 conserva ida/vuelta y migración instalada en ambos sistemas como validación pendiente P10; no se marca ejecutado por pruebas de fixtures o compilación cruzada.

## Superficies a inspeccionar antes de editar
crates/knownext-docs y knownext-storage; src-tauri integración Android/Windows; exportación y visores.
Las rutas describen el ámbito propietario esperado, no una orden de modificar todos sus archivos. Confirmar contratos y cambios locales al comenzar cada corte.

## Verificación prevista
Prueba técnica de capacidades, corpus exportado abierto en lectores apropiados, paquetes con hashes/colisiones y operación Android offline.
Cada criterio P09-C se asociará a evidencia del corte que lo implemente, con entorno y resultado. Las verificaciones y sus límites se registran en los avances enlazados; no equivalen por sí solas al cierre completo del paquete.

## Riesgos y tratamiento
Diferencias de APIs nativas y formatos. Acordar compatibilidad objetivo antes de comprometer paridad completa.

## Ampliación y condición de entrada
Paridad nativa adicional, paquete completo con historial/audio y perfiles o exportación por lotes.
Se concreta el comportamiento, contrato y aceptación del siguiente corte antes de empezar; permanece en el backlog aunque no entre en 3.0.

## Progreso y siguiente paso
- Hecho: implementación local y verificación dirigida de los recorridos descritos en [Portabilidad132](../avance-132.md) y [recursos135](../avance-135.md); consultar sus límites, no la antigua cabecera de primer corte.
- Hecho: regresión local139 cerrada; reutilizar evidencia no invalidada, sin repetir suites completas por cambios documentales.
- Pendiente: preparar y aceptar la candidata instalada Windows/Android, migración/actualización/recuperación, dispositivos/fallos físicos y recorridos con personas en P10/U16. T17 real sigue aplazada sin gasto.
- Próximo paso: el coordinador completa la revisión e integración Git y diagnostica el entorno; después construye y valida la candidata instalada según la autoridad actual. Registrar cada resultado por artefacto, entorno y revisión.
- Publicación excluida por instrucción actual. La autorización de preparar e instalar no acredita instalación realizada ni aceptación humana. Las capacidades condicionadas se conservan sin simulación.

## Avance 03
Ver [contrastes, implementación y pendientes](../avance-03.md). Se mantiene abierto el paquete y su alcance restante; no se declara completado por esta entrega.


## Avance 04
Estado y evidencia vigentes: [continuidad, seguridad nativa y primer uso](../avance-04.md). Continúa el alcance completo restante; no se cierra este paquete.


## Avance 06
[Traslados, continuidad y referencias](../avance-06.md). Implementación y comprobación parciales; continúa el alcance restante. No se declara cerrado este paquete.


## Corte 07
Información y referencias contextuales, corpus acotado, capacidades por plataforma y restauración del panel fijado. [Evidencia transversal](../avance-07.md). Este corte no cierra el paquete ni sus ampliaciones.


## Corte 09
Configuración integrada, continuidad, errores por grupo y guardado ordenado. [Evidencia transversal y límites](../avance-09.md). No cierra el paquete ni sus ampliaciones.


## Corte 10
Estado crítico protegido, revisión/restablecimiento conservando originales y aislamiento del inicio. [Evidencia transversal y límites](../avance-10.md). No completa el resto del paquete ni sus ampliaciones.


## Corte 11
Búsqueda de ajustes, resumen integrado, foco y trabajo de vistas ocultas. [Evidencia transversal y límites](../avance-11.md). Continúa todo el alcance restante; no se cierra el paquete.


## Avance 12
[Espera principal, continuidad y revisión de resultados IA](../avance-12.md). Verificación parcial frontend/Rust y Android sin red; no cierra el paquete ni sus ampliaciones. Continúan todos sus criterios restantes y la aceptación nativa.


## Avance 13
[Revisión, borradores y autoridad IA](../avance-13.md). Evidencia parcial por tramo; continúan el resto del paquete y sus ampliaciones.


## Avance 14
[Imágenes/trazos y revisión raster](../avance-14.md). Evidencia parcial nativa/Rust/frontend; siguen el resto del paquete y sus ampliaciones.


## Avance 15
[Exportación comprobada y destino Android](../avance-15.md): 479 frontend, suite Rust 259/259 más dominio PDF actualizado 19/19 y APK 29 contrastado sin red. Corpus de 15 páginas, cancelación, nombre elegido, escritura y lector nativo. Continúa todo el programa; no cierra paquetes ni sus ampliaciones.


## Avance 16
[Plantillas reutilizables y controles sobre el teclado](../avance-16.md): 492 frontend, 268 Rust, 3 JVM y APK32 contrastado sin red. Reinicio, creación y retirada conservan documentos; estado y red restaurados. No cierra el paquete ni sus ampliaciones. Continúa todo el programa.


## Corte 17 en ejecución · trasladar plantillas con revisión
P08/F03 y P09: un archivo JSON portable de una sola plantilla, formato y versión explícitos, únicamente nombre, descripción y Markdown. No exporta ID privado, fecha de origen, raíz, valores rellenados, ajustes, credenciales ni conversaciones. El contenido documental puede contener información personal: revisión visual y advertencia concreta antes de exportar/importar, sin prometer un detector de secretos.

Selección y entrega pertenecen al runtime: Windows usa diálogo nativo y lectura Rust regular/acotada; Android usa ACTION_OPEN_DOCUMENT/ContentResolver con límite durante lectura y UTF-8 estricto. React recibe datos, nunca escribe rutas ni resuelve URI. Cancelación, archivo inválido/futuro, presupuesto y error son estados distintos. El original importado permanece intacto.

Inspección estricta y huella SHA del contenido antes de confirmar. Importar exige la misma huella, nombre revisado y creación exclusiva en catálogo, con nueva identidad local. Colisión pide otro nombre, conserva contenido/formulario y no sustituye plantillas. Exportar selecciona una revisión fija; cambiar la plantilla invalida la preparación. Windows solo crea un archivo nuevo; Android conserva la semántica del proveedor nativo y advierte de posibles archivos parciales si falla la entrega. Temporal privado hasta ACK y limpieza posterior.

UX: acceso secundario a importar y compartir desde Crear documento; subdiálogo con revisión visual, campos editables pertinentes, acciones visibles y 44 px. Se puede cancelar sin perder nombre/campos del documento que se estaba preparando. No se exportan campos completados ni el acta generada por confusión con la plantilla. Contrastar ida/vuelta, esquema futuro/campos extra, tamaño/UTF-8, cambio de revisión/huella, colisión y cancelación; dos catálogos aislados y QA Android sin red. Continúan catálogos múltiples, assets y plantillas de proyecto, además del resto del programa.


## Avance 17
[Transferencia revisada de plantillas](../avance-17.md): primera entrega F03 implementada y contrastada localmente. 500 frontend, 272 Rust, 6 JVM; recorrido nativo completo APK34 y ajuste final UI APK35 sin red. Continúan assets/proyectos/catálogos y todo el programa. No cierra paquetes ni aceptación física.


## Corte 19 en ejecución · paquetes documentales de proyecto
P09/F07 con P01/P02/P05: paquete ZIP `*.knownext-project.zip` y manifiesto estricto `knownext-project.json`, formato knownext.project/version 1. Primera parte: documentos guardados, imágenes/recursos compatibles, .knote y carpetas vacías. Mantener rutas relativas y verificar tamaños/SHA de cada entrada. No exportar raíz absoluta, credenciales, configuración de aplicación, Git, papelera ni carpetas internas/ocultas; la revisión enumera exclusiones. El contenido de archivos puede incluir datos personales escritos por el usuario: no se promete detección automática de secretos. Historial, grabaciones, borradores y preferencias conservan su ampliación posterior.

Preparar una instantánea de archivos guardados fuera del bloqueo global de guardados, sin convertir ni descargar recursos. Si hay RAM/borradores sin guardar, avisar y pedir una elección explícita de exportar solo lo guardado; no prometer que se incluyeron. Detectar enlaces/recursos ausentes y diferencias de rutas/caso que puedan romperse al pasar de Windows a Android. Toda adaptación determinista de referencias debe figurar en el informe; los originales quedan intactos.

Importar siempre crea un proyecto local nuevo y una identidad nativa nueva, sin fusionar/reemplazar proyectos. Nombre ocupado permite renombrar. Archivo elegido se conserva. Revisión previa mediante trabajo nativo y huella; React recibe resumen/ID, no ZIP base64 ni URI/rutas libres. Windows usa diálogo/lectura Rust; Android ContentResolver copia con límite real a un destino privado controlado por Rust. Confirmar usa la misma instantánea revisada, valida de nuevo entradas/raíz de destino y crea ficheros exclusivamente. Registrar el proyecto solo tras tener contenido completo; fallo de registro conserva un recibo recuperable y permite reintentar sin copiar encima de archivos nuevos o modificados.

Presupuestos iniciales: archivo ZIP y contenido descomprimido hasta 128 MiB cada uno, 32 MiB por archivo, manifiesto hasta 8 MiB, máximo 10.000 entradas y un trabajo pendiente. Acotar también el almacenamiento de preparación, contar restos desconocidos y no limpiarlos a ciegas. Prevalidar directorio central antes de reservar memoria; no admitir ZIP64, cifrado, enlaces ni métodos ajenos a Stored/Deflate en esta primera entrega. Rechazar rutas absolutas, parent/drive/ADS, nombres reservados Windows, duplicados por caso/normalización y archivos extra no declarados. No usar extract genérico del ZIP.

UX integrada: exportar desde acciones de proyecto, importar como origen de proyecto, revisión compacta con nombre, contenido, exclusiones y recursos ausentes; un único scroll y acciones 44 px visibles. Preparación, revisión, selector, guardado/importación, cancelación, fallo y registro pendiente son estados distintos. Conservar formularios/contexto, impedir dobles confirmaciones y volver a cargar lista/árbol solo con acuse nativo. Copias temporales se retiran tras confirmar o cancelar de forma segura; un proyecto pendiente de registro no se borra silenciosamente.

Contrastes: ida/vuelta entre raíces independientes con Markdown + PNG + .knote + carpeta vacía; imágenes/enlaces tras Windows→Android offline, hashes, exclusiones, colisión de nombre, recursos ausentes y rutas con diferencias de caso. Corpus adverso de traversal/drive/ADS/symlink, duplicados, futuro/JSON dañado, manifest/ZIP discrepantes, SHA/tamaño falsos y límites de expansión. Guardado concurrente no bloqueado y fallo de registro recuperable. Separar pruebas de dominio/controladas, recorridos web, selectores nativos y aceptación física. No cierra otras ampliaciones ni el programa.


## Avance 19
[Paquetes documentales entre Windows y Android](../avance-19.md): 517 frontend, 297 Rust, 8 JVM y APK41 offline. Primera parte F07 contrastada; nombre al reabrir, referencias a carpetas y mensajes de entrega pasan al siguiente tramo. Continúan todo el paquete y el programa, sin cierre completo.


## Corte 20 definido · continuidad de la revisión y referencias a carpetas
Completar los ajustes observados en APK41, sin sustituir la preparación revisada ni ampliar su contenido. Guardar el nombre provisional de una importación al cerrar con ID/huella y acuse nativo; aceptar provisional vacío y validar el nombre final solo al importar. Un fallo de conservación mantiene diálogo/valor para repetir. Cerrar no importa y no recrea archivos; reabrir/reiniciar recupera el nombre confirmado. El formulario de Crear proyecto subyacente permanece intacto.

Comunicar cancelación del destino explícitamente, conservar el mismo paquete revisado y proponer como nombre de archivo el proyecto con saneado portable y longitud acotada; Windows sigue creando un destino nuevo. No añadir rutas a React.

Las referencias guardadas a carpetas regulares deben devolver kind folder/status available, sin convertir un enlace o ruta externa en autoridad de navegación. El panel permite Mostrar carpeta y abre/selecciona esa carpeta en la navegación contextual, conservando documento, cambios y posición. Una carpeta con extensión .md sigue siendo carpeta; faltantes/bloqueadas no ofrecen abrir. No cambiar el alcance de contenido guardado ni dar por resuelta toda navegación directa desde enlaces del editor.

Contrastar nombre distinto/vacío al cerrar/reabrir y reiniciar, error de ACK con valor conservado, huella/ID cambiados, ausencia de importación al cerrar, cancelación de destino sin éxito falso y nombres reservados/largos. Probar carpeta vacía, carpeta con extensión, padre enlazado y navegación desde panel estrecho sin perder el editor. Pruebas Rust/frontend pertinentes y APK QA offline; mantener separados datos sintéticos, selector real y aceptación física. Sigue todo el programa y sus ampliaciones.


## Avance 20
[Continuidad de revisión y navegación a carpetas](../avance-20.md): 520 frontend, 300 Rust y APK42 offline. Tres ajustes C19 contrastados; campo vacío/reinicio, fallo de permiso y borrador exacto conservados. Se detecta pérdida ALT de imagen, F16/P0, priorizada en C21. Continúa todo el alcance restante.


## Corte 21 definido · F16/P0, fidelidad de imágenes en Milkdown
Incidencia reproducida en APK42: una edición de texto ajena a la imagen sustituye ALT Pixel por 1.00 en el borrador. La fuente instalada Milkdown 7.20 confirma el uso por defecto de ALT como ratio. Mantener Milkdown/React/Tauri y el flujo de documento normal; corregir mediante extensión pública de esquema/parser/serializer, sin editar node_modules ni usar reemplazos globales de cadenas Markdown.

Separar atributos de texto alternativo, título/caption y tamaño. Abrir/cerrar sin editar no reescribe el archivo. Editar un párrafo, pegar, deshacer, guardar y reabrir conserva ALT, título, URL y tamaño de bloques ajenos. La vista DOM debe exponer el ALT real. Actualizar metadatos de una imagen no pierde el resto de sus atributos ni altera otra aparición de la misma URL.

Conservar el ratio fuera de ALT mediante metadatos explícitos versionados y acotados, ligados estructuralmente a su imagen; un lector Markdown convencional sigue viendo la imagen normal. Validar dato, versión y límites; no consumir ni borrar comentarios ajenos/dañados/futuros. Compatibilidad de geometría numérica del esquema anterior requiere decisión documentada que preserve el ALT existente sin inventar texto perdido. No reconstruir automáticamente etiquetas ya sobrescritas sin una fuente conservada. Las rutas locales/imagen siguen mediadas por Rust y la extensión no descarga recursos.

Contrastar corpus con imagen de bloque y en línea, ALT normal/vacío/numérico/caracteres escapados, título, URL con query/fragmento, imágenes repetidas, resize/reset y metadatos futuros/dañados. Probar esquema real y editor real en navegador aislado y APK QA sin red; distinguir bytes sin edición de la normalización legítima del Markdown al editar. Exportaciones/transferencia deben conservar contenido y no mostrar metadatos técnicos como texto. Solo después de resolver la pérdida reproducible continuar otras ampliaciones. Mantener todo el programa y su aceptación física abiertos.


## Avance 21
[Imágenes que conservan su significado](../avance-21.md): corrección F16/P0 contrastada; 535 frontend, 305 Rust y APK48 offline. Documento idéntico al reabrir; pies debajo, sin URLs temporales. Exportaciones nativas y preparación ZIP verificadas. Entorno QA restaurado; continúa C22/F17 y todo el programa, sin cierre completo del paquete.


## Corte 25 definido
Ámbito común de proyecto, identidad/propietario de vistas previas y errores contextuales. Definición completa en el [plan principal](../plan.md); pruebas de manipulación exclusivamente en TempDir y sin cierre del paquete.


## Avance 25
[Ámbito de proyectos y recuperación del visor](../avance-25.md): 573 frontend, 338 Rust y APK56 offline. Fuentes conservadas, reintento/reinicio verificados y QA restituida. Continúan adaptación móvil del visor, durabilidad/limpieza y todo el programa; no se cierra el paquete.


## Corte 26 definido
Visor al ancho real, controles progresivos y prioridad del documento en móvil. Definición y criterios en el [plan principal](../plan.md). C25/QA restituida como entrada; no cierra el paquete.



## Avance 26
[Consulta al ancho real](../avance-26.md): visor progresivo, PDF medido, conteo/búsqueda reales y contexto móvil a demanda; APK57 contrastado y QA restituida. Dos ajustes posteriores pasan solo sus dos regresiones focales y se agrupan en el próximo hito nativo. La instrucción del usuario reserva suites completas al final; continúan todos los frentes del programa.

### Bloque116 cerrado · Respaldo íntegro y retirada de copias de conflictos

ZIP privado con bytes/metadatos originales y paquete documental importable; selección/comprobación exacta antes de retirar representaciones. Diario inmutable, revisión monotónica y cortes consultables sin continuar; recibo/manifiestos/identidad conservados. Admisiones por almacén también en revisión monotónica, con contrato concurrente de dos perfiles. Dos contratos Rust nuevos/tres afectados, seis casos frontend/SDK, TypeScript, Tauri Windows y campaña499–504 controlada. [Evidencia/límites](../avance-116.md). No libera IDs ni cierra retención/portabilidad integral.


### Bloque117 cerrado · Archivo privado portable

Archivo privado opcional knownext.project2: borradores originales/editables, audio detenido asociado en WAV por partes, bundle Git alcanzable en partes verificadas y preferencias visuales permitidas. Importación a proyecto nuevo como datos, sin activar trabajos/historial/ajustes; no convertir en plantilla. Lectura compatible con1, límites128MiB/32MiB y rechazo del conjunto ante fuentes activas/cambiadas, colisiones o metadatos futuros (117). Tres contratos públicos de traslado/rechazos;16 casos frontend/SDK, TypeScript y campaña visual505–509 controlada. [Evidencia y límites](../avance-117.md). No cierra adopción nativa integral ni aceptación física.


### Bloque119 cerrado · Preferencias portables

Adopción explícita de preferencias visuales desde el archivo portable: comparación actual/importado, selección separada de aspecto/idioma y anchos, autoridad existente de protección/recarga del espacio de trabajo y revisión ligada a ubicación/archivo/configuración. Campos no elegidos e IA conservados, futuros/cambios rechazados y acuses inciertos consultados sin reenvío (119). Tres contratos Rust, ocho casos frontend/SDK y TypeScript; App real con adaptadores, transición y reapertura móvil513–516. [Evidencia/límites](../avance-119.md). Continúa adopción de historial/audio/borradores y el resto del programa.


### Bloque121 cerrado · Traslados sucesivos íntegros

Traslados sucesivos conservan el archivo privado anterior, verifican borradores/PCM/bundle/metadatos y añaden payloads actuales en generación distinta. Cabeceras originales bajo Anteriores con huellas; paquete3 e índice privado2, lectura compatible1/2/3. Paquete documental completo excluye toda la carpeta privada, evitando filtrar textos mientras omite audio/JSON. Referencias adaptadas al final sin reescribir copias conservadas; duplicados/futuros/corrupción rechazados sin paquete parcial (121). Cuatro contratos dirigidos del formato/traslado y ampliaciones aisladas; frontend/TypeScript, Tauri Windows agrupado y campaña520–522. [Evidencia/límites](../avance-121.md). Continúan adopción activa, cuotas/retención y aceptación.


### Bloque122 cerrado · Borradores portables y continuación protegida

Borradores del archivo portable revisables por separado, con SHA/formato conocidos y copias del mismo documento diferenciadas. Copia nativa estable en Apartadas; continuación explícita de Markdown/nota solo con base guardada coincidente y sin borrador local/legado, autoridad existente de protección/recarga y publicación sin reemplazo. Fuente y documento guardado conservados, cuota antes de la copia, futuros/parciales rechazados y acuse incierto consultado sin repetir (122). Cuatro contratos Rust, uno afectado del índice compartido, siete casos frontend/SDK, TypeScript y campaña523–526. [Evidencia/límites](../avance-122.md). Continúan audio/historial y el resto del programa.


### Bloque124 cerrado · Audio portable retenido en escritorio

Audio del archivo portable revisable y adoptable en escritorio como sesión nativa detenida y retenida: partes WAV/PCM exactas, identidad estable ligada al receptor, copia exclusiva con registro al final, sin cola/costes/envíos ni caducidad automática. Presupuesto global opcional y límite del almacén de512MiB/1000 carpetas para admitir nuevas copias; captura, niveles, dictado o envío activos bloquean. Acuse incierto consultado sin duplicar, y originales/transcripción conservados. Android muestra su alcance pendiente (124). Seis contratos nativos, seis casos frontend/SDK, TypeScript, comprobación Tauri Windows y campaña530–534. [Evidencia/límites](../avance-124.md). Continúan historial, audio Android, otros productores/retención y el programa completo.


### Bloque125 cerrado

Historial portable consultable en escritorio cuando no hay historial ni preparación previa: revisión de bundle/partes y elección de punto por título/autor/fecha, objetos y referencias conservados bajo nombres internos, sin checkout, remotos, configuración del origen ni cambios en documentos/borradores/ajustes. Publicación sin reemplazo y preparación durable inventariada, incluidos proyectos retirados/conservados; protección/recarga del espacio, acuse incierto consultado sin repetir y rutas Windows corregidas (125). [Evidencia y límites](../avance-125.md). Programa completo abierto; aceptación física y ampliaciones restantes.


## Entrega132 · Cierre de desarrollo del bloque4

Historial coexistente y punto de consulta sin checkout/índice/HEAD; familias privadas y preferencias2 con revisión, audio portable detenido Android mediante servicio común, ZIP512MiB/expandido1GiB/archivo64MiB; perfiles de estilo, portada/índice y lotes de32documentos con revisión congelada, entrega exclusiva y acuse sin replay. Originales y generaciones conservados. [Evidencia](../avance-132.md) · [Contratos](../../../architecture/project-portability-and-export.md).

Las limitaciones antiguas de124/125 se sustituyen por este contrato: audio portable Android habilitado y Git existente compatible en Windows. Git nativo Android continúa no disponible. La compilación Rust/capturas controladas no cierran Kotlin/SAF, instalación/dispositivos, rendimiento/fallos físicos ni regresión completa P10. T17 real aplazado; sin gasto, publicación o cambio de versión.


## Conciliación documental139 previa al cierre de regresión · 2026-11-06

Portabilidad/exportación locales implementadas (132–135); regresión139 e ida/vuelta instalada/lectores P10 pendientes. Las notas históricas anteriores conservan su fecha/alcance; sus frases de «pendiente» no reabren desarrollos ya entregados. Evidencia actual: [Portabilidad132](../avance-132.md) y [recursos135](../avance-135.md). El [bloque139](../bloque-139.md) está en verificación final: la regresión Rust y correcciones concretas continúan, sin PASS global anticipado. P10/U16 conservan aceptación física/humana; T17 proveedor real permanece aplazado por decisión de no gasto. Git nativo Android y capacidades dependientes de proveedor/hardware siguen sujetos a disponibilidad real.


## Cierre verificado139 · 2026-11-06

Regresión local139 cerrada:1.158casos frontend y740Rust únicos correctos; build/tipos/bundle y comprobación Rust Android correctos. Dos benchmarks aislados adicionales. Una campaña completa y repeticiones sólo de fallos/casos invalidados. La revinculación con origen ausente está corregida y revisada por un segundo agente. [Resultado y límites](../avance-139.md). Las notas históricas conservan su fecha; no reabren desarrollos ya entregados. P10/U16 mantienen instalación/actualización, dispositivos/SAF, cortes/suspensión, accesibilidad y personas; T17 real sigue aplazado sin gasto. Git nativo Android y capacidades condicionadas conservan sus límites documentados. No publicación/instalación/cambioVERSION.


## Consolidación de alcance140 · 2026-11-06

[Alcance local y exclusiones vigentes](../consolidacion-140-alcance.md). La regresión139 está cerrada; los textos anteriores a ese cierre conservan su contexto. La preparación y validación instalada están ahora autorizadas, sin publicar ni gastar en IA. Este ajuste documental no constituye una instalación o aceptación.
