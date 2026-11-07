# Avance 06 · Traslados con continuidad de documentos y enlaces

31/10/2026 · Rama `codex/v3-programa` · [Resumen visual](avance.html)

## Implementado

- **P01 / T01–T05:** movimientos y actualización de referencias extraídos a `file_moves.rs`, `file_references.rs` y `document_links.rs`. Los modelos de sesión se remapean con funciones tipadas y actualizan también las referencias vigentes de React; las respuestas antiguas no resucitan la identidad retirada.
- **P05 / F04, F06 y F15:** mover y renombrar trasladan la copia privada de recuperación, comprobando propietario, destino y escritura exclusiva. Una copia existente en el destino impide la operación. Los lotes revisan las copias de todo el alcance antes de su primera mutación. Un fallo posterior de limpieza conserva ambas copias y devuelve el movimiento confirmado con un aviso de revisión.
- **P04 / F02 y P05 / F15:** los destinos de Markdown se identifican con el parser CommonMark de Rust y sus posiciones de origen. Se reescriben enlaces, imágenes y definiciones de referencia; se conservan etiquetas, títulos, anclas y parámetros en el corpus probado. Los ejemplos de código y enlaces externos del corpus no se modifican. La codificación de rutas conserva espacios, Unicode y el signo `+`.
- **P01 / T03 y P05 / F06:** los cambios de rutas se aplican al archivo y al borrador. Solo se avanza una base que coincidía exactamente con el disco anterior. Las bases obsoletas o desconocidas siguen exigiendo revisión. Cada documento actualizado lleva una instantánea y el texto anterior; la sesión solo acepta la instantánea si coincide con su contenido. La escritura posterior del usuario permanece pendiente con un conflicto explícito.
- **P05 / F15:** las referencias ya actualizadas conservan sus instantáneas aunque otro documento requiera revisión. Los lotes guardan movimientos, resultados y referencias pendientes; un lote iniciado no se reejecuta automáticamente. Renombrar Markdown o una nota a mano no cambia silenciosamente su formato.
- **P07 / F12:** el conflicto de una nota manuscrita dispone de cargar disco o mantener mi versión. El guardado ordinario de una base desconocida conserva el disco; la decisión explícita permite guardar los trazos.

## Verificación

- **383 pruebas frontend / 81 archivos**, todas superadas: `v3-frontend-tests-15.log`.
- **191 pruebas Rust del workspace**, incluidas 117 de almacenamiento y 12 de documentos, todas superadas: `v3-rust-tests-14.log`. No se suman rondas focalizadas repetidas.
- **APK Android QA 09 y compilación TypeScript/Vite**, correctos: `v3-android-qa-build-09.log`. Se conservan los avisos conocidos de chunks grandes, código Rust no usado y deprecaciones de Gradle; no se presentan como resueltos.
- Android API 36 x86_64, paquete separado `ai.knownext.mobile.v3qa`, red desactivada antes de abrir la app. Se abrió un borrador, se trasladó desde el menú del árbol y se comprobó que seguía pendiente de guardar con su enlace relativo actualizado. Otro documento recibió la nueva ruta del enlace y conservó el ancla.
- El guardado posterior incorporó el texto pendiente al disco, sin conflicto falso, y retiró la copia de borrador. Tras reiniciar el proceso, la ruta nueva, el contenido, el enlace y el documento activo se conservaron.
- Nota manuscrita con base desconocida: guardar ordinariamente dejó cero trazos en disco y uno en el borrador. «Mantener mi versión» guardó el trazo, retiró el borrador y eliminó el aviso. El resultado se conservó tras reiniciar.
- [Evidencia nativa estructurada](../../../output/android-v3-moves-evidence.json). Las pruebas de datos se prepararon mediante la API local del paquete QA; las acciones de abrir, mover, guardar y resolver se realizaron en el DOM del WebView nativo. No se usaron proveedores facturables.
- El emulador mostró de nuevo el diálogo de falta de respuesta de **System UI** en el arranque, antes de las acciones de producto. Se eligió esperar usando su árbol de accesibilidad. Las capturas válidas no contienen esa superposición. Después se restauró la red y se cerró el emulador iniciado para esta comprobación.

## Límites y siguiente trabajo

Diez paquetes iniciados; **ninguno está cerrado completamente**. El parser nuevo y los casos contrastados no certifican todo Markdown, HTML, topologías Git ni exportaciones. La navegación por enlaces, los grandes proyectos, la edición concurrente entre procesos y todas las interrupciones posibles siguen requiriendo cobertura. El orden de escrituras de React no sustituye la planificación de trabajos largos del runtime.

Quedan abiertas las superficies contextuales de referencias y propiedades, recuperación de copias dañadas/variantes, política de datos, recuperación de credenciales, categorías completas de ajustes, captura avanzada, índice, plantillas, exportación, portabilidad, accesibilidad/DPI y piloto/candidata. La declaración de capacidades nativas también debe contrastarse con lo realmente disponible: el contrato actual de creación aún anuncia Git local de forma fija; no se declara paridad Git Android por haber probado traslados sin conexión.

El siguiente corte continúa estas líneas del [plan evolutivo](plan.md), comenzando por las capacidades por plataforma y los controles contextuales. Las ampliaciones siguen autorizadas; no hay reducción tácita del alcance.

VERSION permanece en 2.6.0. No se han ejecutado commit, push, integración, publicación ni aceptación humana de 3.0. La automatización DOM nativa no acredita tacto físico, TalkBack, teclado virtual, rotación ni suspensión.
