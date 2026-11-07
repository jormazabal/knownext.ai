# Avance 26 · El visor se adapta al espacio de trabajo

Barra de consulta progresiva, PDF al ancho/alto útil, navegación y búsqueda desde el PDF real y contexto fijado a demanda en móvil. Implementado y contrastado en navegador y APK57; dos ajustes posteriores tienen regresión focal y quedan para el próximo hito nativo agrupado.

## Técnica

- Separados controlador del visor, barra, superficie PDF, estado, medición y presupuesto de raster. Contenedor medido desde carga/error; desaparece el ancho fijo de 900 px. Raster máximo de 8 millones de píxeles y 8192 por borde, independiente del zoom CSS. No se modifica el original.
- Fallo al leer PDF original devuelve error; no se convierte en un PDF de ejemplo. Rechazos string del runtime muestran detalle útil y acotado. Contrato focal de contenido original/ausente y recibos: [seis pruebas](../../../output/v3-viewer-responsive-contract-tests-01.log).
- Fijado guardado y apertura temporal separados: se conserva preferencia de escritorio, hidratación estrecha no cubre el documento, navegación cierra la temporal y ocultación explícita se respeta tras cambios de ancho.

## Funcionalidad y UX

- Barra completa de 44 px en escritorio; en estrecho 105 px y controles de 44 px. Búsqueda, actualizar y abrir permanecen accesibles. Vista agrupa zoom/ajustes, Escape y elección de modo devuelven foco. Hojas usan selector nativo accesible, sin listbox incompleto.
- Página y recuento de coincidencias proceden del PDF cargado. El PDF de tres páginas muestra 1/3 aunque el recibo provisional anuncie una; búsqueda Lectura da tres coincidencias. Navegación desconocida se desactiva.
- Desplazamiento observado actualiza indicador sin ordenar otro scroll. Rueda de 500 px permanece en 500. Resize y modos conservan lectura; la restauración espera dimensiones de la página y de las anteriores, sin confiar en un número fijo de frames.

## Contraste y evidencia

[Componentes y PDF real en navegador](../../../output/v3-viewer-responsive-browser-evidence-26.json): 320/412/1360, centro reducido a 380 dentro de ventana amplia, sin overflow. Canvas 380×538 en 412; Página 287×407 en 320; centro 380 produce canvas 348. Menú, foco, selector de hojas y controles comprobados. [Vista estrecha](../../../output/playwright/revision-3.0/142-visor-pdf-movil-ancho-real.png), [opciones](../../../output/playwright/revision-3.0/143-visor-opciones-progresivas.png) y [hoja 320](../../../output/playwright/revision-3.0/146-visor-hoja-320.png). El contraste final con recarga estable no registra errores de página; avisos HMR y un error de worker durante hot reload quedan separados.

[APK57](../../../output/android-v3-viewer-responsive-evidence-57.json), SHA256 b04f2b5ad5973174e8dd9ea8541af7ecde619993974ffe40e8805f72d3f91a5a, [489 fuentes](../../../output/android-v3-viewer-responsive-inputs-57.json) sin cambios durante [build](../../../output/v3-android-qa-build-57.log). [Instalación](../../../output/v3-android-qa-install-57.log) y SHA del base.apk coincidentes. Se emitió am start antes de terminar install; no se recogió evidencia entonces. Tras Success se comprobó SHA y se arrancó un proceso nuevo antes de validar.

- Android offline: PDF de tres páginas, canvas 380×538, botones 44 px dentro de viewport412, contexto guardado fijado pero cerrado y borrador QA16 original presente sin tocarlo. [Lectura](../../../output/playwright/revision-3.0/148-android-visor-adaptable.png), [opciones](../../../output/playwright/revision-3.0/149-android-visor-opciones.png).
- Giro horizontal muestra controles completos, Página ajusta al alto útil y conserva 2/3. [Captura](../../../output/playwright/revision-3.0/150-android-visor-horizontal.png). La ida/vuelta completa no se declara aceptada: después de volver a vertical/introducir búsqueda se observó 1/3, pendiente del ajuste de anclaje descrito abajo.
- Búsqueda mediante coordenadas de UIA y texto ADB: tres coincidencias del PDF. No se acredita aparición del teclado software. PDF sintético con permiso000: [error nativo útil](../../../output/playwright/revision-3.0/151-android-pdf-error-lectura.png), navegación deshabilitada y ningún PDF de ejemplo como éxito. Restituir600 y Reintentar recupera consulta y tres coincidencias; SHA del original idéntico. Cero errores de página registrados y cero proveedor.

## Ajustes posteriores y nueva política de verificación

El usuario pide reducir drásticamente repetición de suites: política actual en el [plan](plan.md). Última base completa anterior a esa instrucción: [581 frontend/126 archivos](../../../output/v3-frontend-tests-57.log), [339 Rust](../../../output/v3-rust-tests-47.log), TypeScript. Son base histórica y no acreditan por sí solos los cambios posteriores.

Una [regresión focal](../../../output/v3-viewer-anchor-red-26.log) reproduce el anclaje prematuro con getPage retrasado: se ordenaba scroll antes de actualizar las dimensiones anteriores. La corrección espera esa geometría y descarta generaciones antiguas. Se corrige también el falso cero de coincidencias ante un PDF ilegible: muestra desconocido. [Solo dos pruebas focales](../../../output/v3-viewer-anchor-focused-26.log) y [TypeScript](../../../output/v3-viewer-anchor-types-26.log) pasan. No se repiten suites completas ni se empaqueta otro APK por este ajuste; ambos cambios se incluyen en el próximo hito nativo pertinente. APK57 no contiene estos dos cambios.

[Restitución comprobada](../../../output/android-v3-viewer-responsive-restoration-26.json): cuatro hashes, red0/1/0 y orientación1/0 originales; permisos restablecidos; dos fuentes y recibo/catálogo propios retirados con listado/SHA; directorios nuevos solo vacíos, backups/XML/forward propios retirados. La primera guarda de listado se detuvo por CRLF de ADB, sin borrar nada; se normalizó el separador y se repitió la comprobación. QA detenida y Windows habitual intacto.

## Continúa

Frescura/conversión de vistas y Office, PDFs extensos/virtualización según medición, resto de superficies especializadas y todos los frentes funcionales/técnicos del programa. El siguiente bloque prioriza importación de adjuntos: la escritura actual todavía permite reemplazo directo y requiere protección de colisiones y errores antes de ampliar uso. Se actualiza el desglose restante solicitado por el usuario, separando desarrollo de aceptación física/externa y sin usar cantidad de pruebas como porcentaje de producto.

Diez paquetes iniciados, ninguno cerrado en todo su alcance. VERSION2.6.0, cambios locales, sin commit/integración/publicación ni aceptación humana de 3.0. [Avance anterior](avance-25.md).
