# Avance 21 · Imágenes que conservan su significado

La incidencia F16/P0 reproducida en APK42 está corregida y contrastada con esquema real, editor/formulario reales y Android offline. ALT, pie, fuente y tamaño son independientes. Este corte no cierra F16 ni el programa completo.

## Cambios

- Extensión pública de Milkdown/Crepe, sin sustituir editor ni modificar dependencias instaladas. ALT deja de transportar el ratio. Se conserva el texto existente y la geometría numérica heredada, sin inventar descripciones ya perdidas en versiones anteriores.
- Tamaño manual mediante comentario JSON v1 adyacente y acotado. Anotaciones propias futuras/dañadas se conservan opacas; bloquear resize/reset evita destruir información que esta versión no interpreta. Código y comentarios ajenos permanecen en su fuente.
- Retiradas las sustituciones regex de referencias en DesktopLayout. `proxyDomURL` de Crepe resuelve solo la URL de vista de bloques e imágenes en línea. Markdown, bases IA y snapshot de guardado conservan rutas de producto, sin URL temporal. El editor no intenta cargar las imágenes escritas como ejemplos de código.
- El formulario conserva el pie y la URL/query/fragmento al cambiar solo el ALT de la misma imagen local. Las inserciones escapan caracteres literales. Copiar/pegar y deshacer se contrastan con el parser real.
- Pie debajo de la imagen, centrado y con contraste secundario. Ya no comprime lateralmente el ancho. El mínimo se aplica al ancho, permitiendo reducir imágenes panorámicas. Placeholder localizado; se mantiene el documento de una columna.
- El lector Rust de apariciones usa pulldown-cmark y HTML estructural para referencias y exportación. Excluye frontmatter, código, comentarios y ejemplos de script; admite ALT escapado y referencias definidas. Las posiciones se calculan en un recorrido lineal.
- DOCX/PDF conservan pies y tamaño por aparición sin imprimir anotaciones técnicas. DOCX usa IDs distintos y descripción `docPr/descr`, aunque comparta bytes del recurso. El ajuste DOCX conserva la proporción. PDF no se declara etiquetado accesible.
- La primera publicación del editor distingue una normalización de apertura de una escritura real mediante igualdad del documento montado.

## Verificación local

| Comprobación | Resultado y alcance |
|---|---|
| Frontend final | **535/535, 116 archivos**, [suite 49](../../../output/v3-frontend-tests-49.log). |
| Rust | **305/305**, [suite 39](../../../output/v3-rust-tests-39.log). Servicios sin cambios entre APK47 y APK48. |
| Corpus focal final previo al ajuste visual | 21/21: esquema Milkdown, formulario y resolución de fuentes, [registro](../../../output/v3-image-fidelity-tests-08.log). CSS y mínimo de ancho contrastados después con editor real y APK48. |
| Construcción | TypeScript/Vite, bundle limpio y reconstrucción completa frontend/Rust/Tauri/Gradle: [APK48](../../../output/v3-android-qa-build-48.log). Sin reutilizar un .so con frontend diferente. |
| Esquema real | ALT normal/vacío/numérico, escapado, pies, URLs repetidas, resize/reset, pegado DOM, undo, reemplazo y anotaciones futuras/dañadas. [Corpus](../../../apps/desktop/src/features/editor/imageFidelityCorpus.test.ts). |
| Editor/formulario reales | 1360×900 y 412×720; bloque e inline cargan, la descripción conserva fuente/pie/tamaño, código intacto y sin petición al recurso del ejemplo. [Resolución de vista](../../../output/v3-image-fidelity-proxy-evidence-21.json), [geometría de pie](../../../output/v3-image-caption-layout-evidence-21.json). |

Browser plugin not available: se usó Playwright ordinario. Cero errores de página de producto en los recorridos válidos. La página aislada de desarrollo registró errores HMR/WebSocket por comprobación de red local; no se presentan como cero errores de consola ni como fallos del APK. Una recarga tras optimizar la dependencia pública image-inline permitió contrastar el montaje real. No se modificó seguridad del navegador.

## Android offline y archivos generados

- API36 x86_64, exclusivamente `ai.knownext.mobile.v3qa`. [Evidencia consolidada](../../../output/android-v3-image-fidelity-evidence-48.json).
- APK48 SHA256 `02d3f9e69251938cc5173f94e9af27068b643b9ee9960dbf4234f6024a698f12`. **455 entradas de fuente** contrastadas sin cambios durante la construcción: [huella](../../../output/android-v3-image-fidelity-inputs-48.json). [Instalación](../../../output/v3-android-qa-install-48.log).
- JavaScript y tres CSS servidos por Tauri coinciden por SHA con dist: [contraste](../../../output/android-v3-image-fidelity-assets-48.json). JS `/assets/index-yjk5xlY1.js`, SHA `dcd33d7a3df0a2da034870e22e1ed4dd831d608a266eff25a43d7d7d9b3a3b8c`.
- Documento QA nuevo en APK47: abrir conserva hash original, sin dirty ni borrador; ambas imágenes cargan realmente a 800 px naturales. Editar párrafo conserva ALT y código; el borrador no contiene URLs temporales y el archivo sigue intacto hasta Guardar.
- Cambiar ALT desde formulario, reset/undo y resize mantienen pie y segunda aparición. Guardado con acuse nativo; SHA `0df773d64c71d2975fa7f042f3604b88cf3005d793ad7cca064b4ed753ab2ff9`. [Markdown sintético](../../../output/android-v3-image-fidelity-saved-21.md).
- APK48 reabre el mismo archivo con ese SHA exacto, sin dirty ni borrador, ALT y pies intactos, ratios 0.9/0.35 y ambas imágenes cargadas. Geometría nativa: aproximadamente 313/122 px de ancho, pies debajo, sin compresión ni overflow; [medición](../../../output/android-v3-image-fidelity-reopen-48.json), [captura inspeccionada](../../../output/playwright/revision-3.0/118-android-imagenes-columna.png).
- PDF y DOCX producidos por **Rust Android APK47**, cuyos servicios no cambiaron en 48. [Recibos](../../../output/android-v3-image-fidelity-exports-21.json). Se contrasta contenido binario, no una entrega nueva por SAF; el selector/escritura ya tienen evidencia propia de C15/C19.
- [PDF Android](../../../output/QA21-Android.pdf), una página renderizada con Poppler e inspeccionada: imágenes/pies, tamaños diferentes y ejemplo de código completos, sin metadatos visibles. [Render](../../../output/playwright/revision-3.0/116-pdf-android-imagenes.png). No hubo librería de extracción de texto en el Python del sistema; no se inventa esa comprobación.
- [DOCX Android](../../../output/QA21-Android.docx): XML/medios contrastados, IDs 2/4 únicos, descripciones exactas, ambos pies, código y un único archivo de imagen compartido. [Inspección](../../../output/v3-image-native-export-inspection-21.json). No abierto en Word físico.
- Preparación de ZIP nativo incluye el Markdown con el mismo SHA, conservando sus anotaciones. [Recibo](../../../output/android-v3-image-fidelity-transfer-21.json). Preparación descartada con ACK; no se atribuye una nueva importación/entrega externa a este corte.

## Hallazgos intermedios y restauración

APK43–45 fueron intermedios no instalados: la revisión amplió pruebas del formulario, exportación y lector de apariciones. El primer intento 44 se detuvo por `replaceAll` en un test incompatible con ES2020; se corrigió sin elevar el objetivo.

APK46 detectó que el lector regex frontend impedía cargar la primera imagen con ALT escapado y reescribía el ejemplo de código: [evidencia negativa](../../../output/android-v3-image-fidelity-intermediate-46.json). Se sustituyó por resolución DOM. APK47 acreditó datos/exportaciones y detectó el pie lateral que comprimía la imagen; APK48 acredita el ajuste visual y reinicio. No se mezclan estas fases como si todas hubiesen pasado desde el principio.

UIA inicial 48 no produjo archivo durante la carga; se repitió tras estabilizarse y se comprobó que solo estaba el paquete QA. Un puerto CDP ocupado se respetó; ADB asignó un puerto libre. No se usaron clics forzados ni se operó el WebView bajo diálogo del sistema. Los gestos probados mediante CDP no acreditan tacto/stylus físico.

[Restauración](../../../output/android-v3-image-fidelity-restoration-21.json): cuatro hashes de almacenes idénticos al inicio; avión 0/Wi-Fi 1/datos 0; backups privados retirados; proyecto sintético y tres archivos eliminados solo después de contrastar raíz, listado exacto y hashes. Ambos borradores retirados y ausencia de escritura tardía comprobada. Preparación ZIP y XML temporales retirados. QA detenida, emulador disponible. Cero proveedor. Windows habitual intacto, sin reintentar su automatización detenida.

## Continuación completa

Siguiente: C22/F17, retirar una asociación de proyecto y reincorporarla con identidad/borradores conservados y errores verificables. Después, mapa de almacenamiento y limpieza realmente regenerable, cuotas/archivo y demás ampliaciones de F17.

Siguen F16 ampliado (pegado binario, HTML, metadatos de terceros y nombres/rutas especiales), plantillas/proyectos/assets, investigación, coordinación multiinstancia, persistencias secundarias, versiones/conflictos avanzados, captura/actas/OCR, ajustes/i18n, exportación avanzada, accesibilidad física, matriz nativa y P10. No se declara cerrado ningún paquete amplio por este corte. [Plan completo](plan.md), [avance anterior](avance-20.md). VERSION 2.6.0; sin commit, integración, publicación ni aceptación humana de 3.0.
