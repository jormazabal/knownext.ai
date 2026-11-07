# P08 · Plan evolutivo
[Definición](tarea.md) · [Plan principal](../plan.md)
Estado: Desarrollo local del paquete integrado y regresión139 correcta; aceptación instalada/física/humana P10 y T17 real según alcance pendientes. Sin candidata, publicación ni instalación3.0. Responsable: Rust/índices y frontend productividad; persona por asignar. Esfuerzo relativo XL, sin conversión a calendario.

## Entrada
- [P01](../P01/plan.md): entradas pertinentes según las dependencias del plan principal; no exige finalizar todas sus ampliaciones.
- [P02](../P02/plan.md): entradas pertinentes según las dependencias del plan principal; no exige finalizar todas sus ampliaciones.
- [P04](../P04/plan.md): entradas pertinentes según las dependencias del plan principal; no exige finalizar todas sus ampliaciones.
- [P05](../P05/plan.md): entradas pertinentes según las dependencias del plan principal; no exige finalizar todas sus ampliaciones.
Hito propuesto: H4; ampliaciones H6.

## Cortes de trabajo
1. [x] Búsqueda guardada con huellas de bytes, Markdown/texto/OCR de .knote y adjuntos extraíbles;139 contrasta NFKC/PDF complejo y bibliotecas100/1000/5000. El presupuesto2s deja biblioteca5003parcial: no se promete una búsqueda integral en una sola petición.
2. [x] Definir paleta de acciones sobre comandos existentes, con rutas desambiguadas y recientes; mantener acceso a búsqueda fuera de la cabecera del árbol.
3. [x] Guardar/reutilizar plantillas documentales con variables y revisión (C16–17), ampliadas a adjuntos/proyectos/catálogos agrupados en135; sin activar autoridad desde datos importados.
4. [x] Detectar recursos ausentes y límites de extracción en referencias; gestionar backlinks solo tras asegurar movimientos.
5. [x] Añadir referencias verificables y fecha en investigaciones seleccionadas; marcar ausencia de evidencia y permitir revisión de fuentes.

## Superficies a inspeccionar antes de editar
src/features de búsqueda, assistant y documentPreview; crates/knownext-core, knownext-docs y knownext-research.
Las rutas describen el ámbito propietario esperado, no una orden de modificar todos sus archivos. Confirmar contratos y cambios locales al comenzar cada corte.

## Verificación prevista
Integración guardar/mover/borrar–índice, corpus de referencias parciales, plantillas y límites de ruta; evaluación de investigación cuando haya presupuesto.
Cada criterio P08-C se asociará a evidencia del corte que lo implemente, con entorno y resultado. Las verificaciones y sus límites se registran en los avances enlazados; no equivalen por sí solas al cierre completo del paquete.

## Riesgos y tratamiento
Índices obsoletos, grandes corpus y coste de investigación. Medir y limitar recursos antes de añadir búsqueda semántica.

## Ampliación y condición de entrada
PDF/OCR/semántica, backlinks, catálogos de plantillas, favoritos persistentes y recalcular investigación por exclusión de fuentes.
Se concreta el comportamiento, contrato y aceptación del siguiente corte antes de empezar; permanece en el backlog aunque no entre en 3.0.

## Progreso y siguiente paso
- Hecho: implementación local y verificación dirigida de los recorridos descritos en [Recursos135](../avance-135.md), [evidencias136](../avance-136.md), [corpus139](../bloque-139.md); consultar sus límites, no la antigua cabecera de primer corte.
- Hecho: regresión local139 cerrada; reutilizar evidencia no invalidada, sin repetir suites completas por cambios documentales.
- Pendiente: preparar y aceptar la candidata instalada Windows/Android, migración/actualización/recuperación, dispositivos/fallos físicos y recorridos con personas en P10/U16. T17 real sigue aplazada sin gasto.
- Próximo paso: el coordinador completa la revisión e integración Git y diagnostica el entorno; después construye y valida la candidata instalada según la autoridad actual. Registrar cada resultado por artefacto, entorno y revisión.
- Publicación excluida por instrucción actual. La autorización de preparar e instalar no acredita instalación realizada ni aceptación humana. Las capacidades condicionadas se conservan sin simulación.

## Avance 03
Ver [contrastes, implementación y pendientes](../avance-03.md). Se mantiene abierto el paquete y su alcance restante; no se declara completado por esta entrega.


## Avance 04
Estado y evidencia vigentes: [continuidad, seguridad nativa y primer uso](../avance-04.md). Continúa el alcance completo restante; no se cierra este paquete.


## Corte 07
Información y referencias contextuales, corpus acotado, capacidades por plataforma y restauración del panel fijado. [Evidencia transversal](../avance-07.md). Este corte no cierra el paquete ni sus ampliaciones.


## Corte 16 en ejecución · plantillas documentales reutilizables
P08/F03 y P04/U04: pasar las cuatro plantillas iniciales del componente a un contrato Rust y añadir catálogo local explícito de plantillas de texto. Guardar desde el documento activo captura su contenido RAM, permite revisar nombre/contenido y no captura configuración, claves ni conversaciones. Las plantillas son datos, nunca código. Variables literales `{{nombre}}`, acotadas y sin evaluación; titulo/fecha/proyecto pueden tener valores iniciales calculados por Rust. Conservar plantillas sin campos. El usuario ve los campos y una previsualización visual antes de crear; crear exige revisión de plantilla vigente y destino nuevo, sin sobrescribir archivos.

Guardar contenido y crear documentos pertenece a Rust; API tipada y componentes por intención. Catálogo acotado y persistencia atómica, versiones futuras/JSON dañado conservados con diagnóstico. Los ejemplos actuales (blanco, acta, requisitos, decisión) siguen disponibles aun sin catálogo personal. Retirar una plantilla personal es explícito y conserva una copia privada; no borra los documentos derivados. Errores mantienen formulario/valores y no crean éxitos aparentes. Diálogos compactos, navegación por teclado, controles móviles de 44 px y vista previa de una columna.

Primer contrato de portabilidad: catálogo de texto, enlaces web e imágenes embebidas. Una plantilla con recursos/rutas locales se rechaza con explicación antes de guardarla, para no crear documentos con referencias rotas en otro proyecto. La captura y traslado de assets, importación/exportación de catálogo y plantillas de proyecto continúan como partes posteriores de F03/P09; esta entrega no las declara completas. Contrastar dos actas con valores diferentes, variable desconocida/faltante, plantilla cambiada, destino ocupado, catálogo dañado/futuro, recursos locales y ausencia de campos de estado ajenos. Pruebas de dominio/componentes y recorrido visual; el APK 29 acredita exclusivamente el corte 15.


## Avance 16
[Plantillas reutilizables y controles sobre el teclado](../avance-16.md): 492 frontend, 268 Rust, 3 JVM y APK32 contrastado sin red. Reinicio, creación y retirada conservan documentos; estado y red restaurados. No cierra el paquete ni sus ampliaciones. Continúa todo el programa.


## Corte 17 en ejecución · trasladar plantillas con revisión
P08/F03 y P09: un archivo JSON portable de una sola plantilla, formato y versión explícitos, únicamente nombre, descripción y Markdown. No exporta ID privado, fecha de origen, raíz, valores rellenados, ajustes, credenciales ni conversaciones. El contenido documental puede contener información personal: revisión visual y advertencia concreta antes de exportar/importar, sin prometer un detector de secretos.

Selección y entrega pertenecen al runtime: Windows usa diálogo nativo y lectura Rust regular/acotada; Android usa ACTION_OPEN_DOCUMENT/ContentResolver con límite durante lectura y UTF-8 estricto. React recibe datos, nunca escribe rutas ni resuelve URI. Cancelación, archivo inválido/futuro, presupuesto y error son estados distintos. El original importado permanece intacto.

Inspección estricta y huella SHA del contenido antes de confirmar. Importar exige la misma huella, nombre revisado y creación exclusiva en catálogo, con nueva identidad local. Colisión pide otro nombre, conserva contenido/formulario y no sustituye plantillas. Exportar selecciona una revisión fija; cambiar la plantilla invalida la preparación. Windows solo crea un archivo nuevo; Android conserva la semántica del proveedor nativo y advierte de posibles archivos parciales si falla la entrega. Temporal privado hasta ACK y limpieza posterior.

UX: acceso secundario a importar y compartir desde Crear documento; subdiálogo con revisión visual, campos editables pertinentes, acciones visibles y 44 px. Se puede cancelar sin perder nombre/campos del documento que se estaba preparando. No se exportan campos completados ni el acta generada por confusión con la plantilla. Contrastar ida/vuelta, esquema futuro/campos extra, tamaño/UTF-8, cambio de revisión/huella, colisión y cancelación; dos catálogos aislados y QA Android sin red. Continúan catálogos múltiples, assets y plantillas de proyecto, además del resto del programa.


## Avance 17
[Transferencia revisada de plantillas](../avance-17.md): primera entrega F03 implementada y contrastada localmente. 500 frontend, 272 Rust, 6 JVM; recorrido nativo completo APK34 y ajuste final UI APK35 sin red. Continúan assets/proyectos/catálogos y todo el programa. No cierra paquetes ni aceptación física.


## Corte 21 definido · F16/P0, fidelidad de imágenes en Milkdown
Incidencia reproducida en APK42: una edición de texto ajena a la imagen sustituye ALT Pixel por 1.00 en el borrador. La fuente instalada Milkdown 7.20 confirma el uso por defecto de ALT como ratio. Mantener Milkdown/React/Tauri y el flujo de documento normal; corregir mediante extensión pública de esquema/parser/serializer, sin editar node_modules ni usar reemplazos globales de cadenas Markdown.

Separar atributos de texto alternativo, título/caption y tamaño. Abrir/cerrar sin editar no reescribe el archivo. Editar un párrafo, pegar, deshacer, guardar y reabrir conserva ALT, título, URL y tamaño de bloques ajenos. La vista DOM debe exponer el ALT real. Actualizar metadatos de una imagen no pierde el resto de sus atributos ni altera otra aparición de la misma URL.

Conservar el ratio fuera de ALT mediante metadatos explícitos versionados y acotados, ligados estructuralmente a su imagen; un lector Markdown convencional sigue viendo la imagen normal. Validar dato, versión y límites; no consumir ni borrar comentarios ajenos/dañados/futuros. Compatibilidad de geometría numérica del esquema anterior requiere decisión documentada que preserve el ALT existente sin inventar texto perdido. No reconstruir automáticamente etiquetas ya sobrescritas sin una fuente conservada. Las rutas locales/imagen siguen mediadas por Rust y la extensión no descarga recursos.

Contrastar corpus con imagen de bloque y en línea, ALT normal/vacío/numérico/caracteres escapados, título, URL con query/fragmento, imágenes repetidas, resize/reset y metadatos futuros/dañados. Probar esquema real y editor real en navegador aislado y APK QA sin red; distinguir bytes sin edición de la normalización legítima del Markdown al editar. Exportaciones/transferencia deben conservar contenido y no mostrar metadatos técnicos como texto. Solo después de resolver la pérdida reproducible continuar otras ampliaciones. Mantener todo el programa y su aceptación física abiertos.


## Avance 21
[Imágenes que conservan su significado](../avance-21.md): corrección F16/P0 contrastada; 535 frontend, 305 Rust y APK48 offline. Documento idéntico al reabrir; pies debajo, sin URLs temporales. Exportaciones nativas y preparación ZIP verificadas. Entorno QA restaurado; continúa C22/F17 y todo el programa, sin cierre completo del paquete.


## Avance 24
[Índices con identidad, revisión y resultado verificables](../avance-24.md): 568 frontend, 329 Rust y APK53 offline. Defecto de ruta reproducido en TempDir y corregido; revisión, permisos, efectos parciales y cache futuro contrastados sin alterar la fuente. Estado/RAG conservados y QA restituida. Continúan otras rutas de datos secundarios, limpieza ampliada y todo el programa, sin cierre completo de paquetes.

## Favoritos persistentes · corte29
Vista de favoritos en paleta existente, rutas desambiguadas, destino ausente conservado y retirada solo del marcador. Persistencia Rust acotada/validada por proyecto; renombrado/movimiento gestionado mantiene identidad y comunica fallos parciales. Contraste focal y navegador320/412 realizados, sin suites generales ni APK. Continuación y límites en plan principal; personalización de atajos y otras ampliaciones pendientes.


## Búsqueda local incremental
Extracción revalidada por bytes y alcance TXT/CSV/Word/Excel implementados; resultados prioritarios con información secundaria desplegable y selector móvil compacto. Contratos focales y navegador controlado correctos. PDF/OCR ampliado, corpus real e integración instalada siguen pendientes; detalle en el plan principal.


## Catálogo de proyectos reutilizables
Captura revisada, recursos incluidos, proyectos independientes, distribución individual y retirada/reincorporación implementados. Contrato entre dos perfiles y pruebas de componentes dirigidas correctos; capturas290–292 de navegador controlado. Assets de plantillas documentales, catálogos múltiples e integración instalada pendientes. Detalle en el plan principal.


## Plantillas con imágenes y catálogo documental compartido
Preparación explícita de imágenes locales como Markdown embebido y transferencia de1–32 plantillas documentales en catálogo portable1, hasta2MiB. Revisión de nombres/colisiones, contenido idéntico sin duplicar y resultados por entrada; ACK incierto se consulta sin replay. Visor comparte fidelidad de imágenes y feedback queda junto al pie. Contratos entre perfiles, componentes y navegador dirigidos correctos, sin suites generales ni APK. Detalle/límites en plan principal/avance65. Pendientes adjuntos no imagen en plantillas documentales, catálogo agrupado de proyectos e integración/aceptación.


### Bloque91 · PDF por contenido y página
Implementados extracción PDF local acotada, búsqueda/frescura, apertura de página en visor y contexto expresamente añadido. Índice retiene máximo32MiB de texto y declara cobertura parcial; fuentes ilegibles no figuran listas. Ocho casos Rust dirigidos, dos frontend, TypeScript, compilación de knownext-docs Android y capturas378–381 controladas. Véase [avance91](../avance-91.md) para contratos, límites y evidencia; aceptación instalada y resto del programa pendientes.


### Bloque92 · Contexto con origen revisable
Pruebas de bytes/texto/ubicación, revisión sin mutación, actualización explícita y consulta de acuse sin reenvío. Legado/futuros preservados y metadatos privados excluidos del proveedor. Seis casos Rust nuevos, tres afectados y ocho frontend; capturas382–385 controladas. [Contratos y límites](../avance-92.md). Resto del programa y aceptación instalada pendientes.


### Bloque96 · Estructura acotada y resultado conservado
Lector separado con48 niveles/20.000 entradas/10.000 nodos/8MiB/2s cooperativos, error explícito sin árbol parcial. Publicación y refresco separados; pestañas conservadas sin lectura, última vista con aviso/reintento/búsqueda, también sin navegación y en móvil. Dos contratos Rust y cuatro frontend nuevos, TypeScript y capturas400–403 con App real/API controlada. [Evidencia y límites](../avance-96.md). Navegación progresiva, retención/portabilidad, variantes mixtas y aceptación instalada pendientes.

### Bloque112 cerrado · Inserción sobre la revisión viva

Instantáneas PNG inmutables y reutilización exacta, validación de ámbito y originales conservados. Inserciones ligadas a revisión/visita y entrada viva/composición de Milkdown; transacción de fragmento que conserva texto y permite deshacer/rehacer solo la imagen. Un contrato Rust, seis casos frontend nuevos/tres afectados, TypeScript y capturas474–481 con API controlada. [Evidencia/límites](../avance-112.md). No cierra integridad integral ni el programa.

### Bloque114 cerrado · Centro común de preparaciones, espacio y traslado

Recuperación incorpora Proyectos y Espacio; catálogo mixto local independiente del remoto, ámbitos de proyecto aislados, revisión y acceso a respaldo/retención/retirada/extracción ya existentes. Exportación por proyecto y medición/limpieza segura explícitas, alcance del traslado visible. Un contrato Rust, seis casos frontend, TypeScript y una campaña visual conjunta489–493. Se reutilizan resultados de los diálogos. [Evidencia/límites](../avance-114.md). Inventarios/cuotas entre familias y traslado integral siguen pendientes.


## Bloque7 · Recursos, plantillas y conocimiento conectado · entrega135

Desarrollo local implementado/revisado en [bloque-135.md](../bloque-135.md) y [reporte visual](../avance-135.md): adjuntos de plantillas, catálogo agrupado de proyectos y recursos/enlaces bajo demanda. Tres agentes reales, ámbitos exclusivos; hashes/copias/colisiones y acuses conservados, movimiento revisado por archivo/carpeta/lote.39casos nativos y56frontend únicos; build final y comprobación Android en reporte.16capturas598–613 controladas; no aceptación instalada.

F03/F14 y relacionesF07/F17/U12 conciliadas; [contratos](../../../architecture/resources-templates-and-links.md). Continúan investigación8/copias9/UX10/rendimiento11 y P10físico/humano. Acciones de ruta renombrar/eliminar se contrastarán en UX10 con el impacto ya disponible. T17 real sin gasto, sin publicación/instalación/cambioVERSION.


## Bloque8 · Investigación verificable · entrega136

Revisión local de fuentes/evidencias por afirmación implementada en [bloque-136.md](../bloque-136.md), con [reporte visual](../avance-136.md) y [contratos](../../../architecture/research-evidence-local-review.md). Fuente/Markdown original conservados; exclusión por alcance, proyección y acuse exacto, sin proveedor ni regeneración. Gaps del proveedor permanecen visibles y no cuentan como apoyo por un ID no vacío.

13casosnativos y22frontend únicos correctos, build y comprobación Android en reporte.6capturas614–619 controladas, sin aceptación instalada. Backlog50/cobertura70 conservados; continúan copias9/UX10/rendimiento11/P10. T17real sin gasto aplazado; no publicar/instalar/cambiarVERSION.


## Conciliación documental139 previa al cierre de regresión · 2026-11-06

Recursos/plantillas/investigación locales implementados (135–136); corpus/búsqueda acotada139 medidos, regresión y aceptación P10 pendientes. Las notas históricas anteriores conservan su fecha/alcance; sus frases de «pendiente» no reabren desarrollos ya entregados. Evidencia actual: [Recursos135](../avance-135.md), [evidencias136](../avance-136.md), [corpus139](../bloque-139.md). El [bloque139](../bloque-139.md) está en verificación final: la regresión Rust y correcciones concretas continúan, sin PASS global anticipado. P10/U16 conservan aceptación física/humana; T17 proveedor real permanece aplazado por decisión de no gasto. Git nativo Android y capacidades dependientes de proveedor/hardware siguen sujetos a disponibilidad real.


## Cierre verificado139 · 2026-11-06

Regresión local139 cerrada:1.158casos frontend y740Rust únicos correctos; build/tipos/bundle y comprobación Rust Android correctos. Dos benchmarks aislados adicionales. Una campaña completa y repeticiones sólo de fallos/casos invalidados. La revinculación con origen ausente está corregida y revisada por un segundo agente. [Resultado y límites](../avance-139.md). Las notas históricas conservan su fecha; no reabren desarrollos ya entregados. P10/U16 mantienen instalación/actualización, dispositivos/SAF, cortes/suspensión, accesibilidad y personas; T17 real sigue aplazado sin gasto. Git nativo Android y capacidades condicionadas conservan sus límites documentados. No publicación/instalación/cambioVERSION.


## Consolidación de alcance140 · 2026-11-06

[Alcance local y exclusiones vigentes](../consolidacion-140-alcance.md). La regresión139 está cerrada; los textos anteriores a ese cierre conservan su contexto. La preparación y validación instalada están ahora autorizadas, sin publicar ni gastar en IA. Este ajuste documental no constituye una instalación o aceptación.
