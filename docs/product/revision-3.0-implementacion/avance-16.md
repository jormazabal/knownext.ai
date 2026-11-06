# Avance 16 · Plantillas reutilizables y teclado visible

El programa completo continúa: diez paquetes iniciados, ninguno cerrado. **492/492 pruebas frontend, 268/268 Rust y 3/3 pruebas JVM de geometría IME. APK QA 32 instalado y contrastado sin red.** VERSION sigue en 2.6.0.

## Implementado

- Captura del documento vivo de Milkdown, incluso una edición aún no publicada en React. Guardar plantilla permite revisar contenido, nombre y descripción; no captura configuración, claves ni conversaciones.
- Catálogo local Rust con cuatro modelos iniciales siempre disponibles, plantillas personales y variables literales sin evaluación. Valores automáticos de título, proyecto y fecha local validados; campos adicionales y vista previa visual antes de crear.
- Creación exclusiva: destino existente, raíz cambiada, revisión antigua o campos incompletos producen error conservando el formulario. Los acuses tardíos no reemplazan el árbol de otro proyecto.
- Archivos acotados, lectura regular sin enlaces, JSON futuro/dañado conservado. Retirada explícita con copia privada exacta; las actas derivadas permanecen. Catálogo y archivo retirado excluidos de backup Android.
- Diálogos con un solo cuerpo desplazable, campos automáticos plegados, destino visible y controles de 44 px. Footer fuera del scroll.
- Corrección nativa del teclado: adjustResize por sí solo no bastó en WebView 133. El contenedor descuenta únicamente la oclusión real y evita aplicar dos veces el espacio del IME. Al cerrar, recupera altura sin perder foco ni valores.

## Verificación

- [Frontend](../../../output/v3-frontend-tests-39.log): 492/492, 109 archivos. [TypeScript](../../../output/v3-template-types-08.log) y compilación final APK correctos; [14 casos focales finales](../../../output/v3-template-final-ui-tests-01.log).
- [Rust completo](../../../output/v3-rust-tests-29.log): 268/268. [Plantillas](../../../output/v3-document-template-tests-06.log): 8/8, con calendario local, dos actas, reinicio, campos, conflicto, revisión, raíz, cuotas, JSON futuro/dañado, recursos locales y retirada. Contrastes de destinos Markdown y referencias incluidos en la suite.
- [Web](../../../output/web-v3-templates-evidence-16.json): guardar, crear dos documentos distintos, conservar ante destino ocupado, cancelar/confirmar retirada y capturar una variable recién escrita en Milkdown. 1440×1000 y 412×915, sin desbordamiento horizontal. Al terminar se restauraron localStorage y sessionStorage exactos. Browser plugin no disponible; fallback Playwright.
- [Android nativo](../../../output/android-v3-templates-evidence-32.json): guardar desde el documento, catálogo tras reinicio, tres actas con valores distintos y creación con el teclado abierto. Cancelar retirada conserva; confirmar retira y archiva exactamente los 345 bytes de la revisión. Las actas permanecen.
- Teclado abierto: viewport 578 px, footer hasta 566 px y Crear 44 px. Cerrado: 915 px, mismo foco y valores. Reapertura estable tras transición. XML nativo contiene 56 nodos y 31 etiquetas; esto no sustituye aceptación TalkBack. [3 pruebas JVM](../../../output/v3-android-ime-unit-tests-32.xml) y [build Kotlin](../../../output/v3-android-qa-ime-build-32.log).
- APK32 SHA256 b6da587e1b9dd6f4bffe6e46059f86f77e3e13202d87f001e5483241c0c5ebab. [406 entradas inventariadas](../../../output/android-v3-ime-inputs-32.json), sin cambios al empaquetar. Frontend/Rust reutilizados del build completo 30; manifiesto 31; corrección Kotlin y pruebas en 32. Licencia de fuentes comprobada dentro del APK.
- [Antes: teclado oculta controles](../../../output/playwright/revision-3.0/80-android-plantilla-ime-antes.png). [Después: controles visibles](../../../output/playwright/revision-3.0/81-android-plantilla-ime-corregido.png), captura nativa inspeccionada. Capturas web 77–79 inspeccionadas; el destino visible final se contrastó en Android.
- Configuración restaurada byte a byte; proyectos, plantilla de exportación y credenciales mantienen sus cuatro hashes originales. Temporal de backup eliminado; red restaurada avión 0/Wi-Fi 1/datos 0; aplicación QA y emulador cerrados. Solo permanecen fixtures sintéticas y archivo retirado en QA. Cero llamadas IA. Instalación Windows habitual intacta.

## Pendientes

Este catálogo admite texto, enlaces web e imágenes embebidas; rechaza recursos locales e imágenes remotas para evitar referencias rotas. Continúan importación/exportación revisada, captura de assets y plantillas de proyecto. No hay restauración visual de plantillas retiradas ni política automática de caducidad. No se declara soporte de todos los dialectos Markdown ni de todos los WebView/teclados, rotación o TalkBack físico.

El primer arranque APK30 mostró un ANR de System UI; se eligió esperar. Los avisos heredados de chunks, cfg Android y deprecaciones Gradle/JDK siguen abiertos. Continúan el ciclo durable de propuestas IA, investigación, integridad secundaria, edición/lotes, ajustes, captura/actas/OCR, portabilidad y P10. Sin commit, integración, publicación ni aceptación humana de 3.0.
