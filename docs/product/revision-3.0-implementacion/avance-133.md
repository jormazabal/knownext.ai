# Avance133 · Bloque5: edición documental y reversión

[Reporte visual](avance-133.html) · [Criterios/delegación](bloque-133.md) · [Contratos y límites](../../architecture/document-editing-and-reversion.md) · [Backlog](backlog.csv).

Implementado en desarrollo local con tres subagentes reales de Codex: editor_fidelity (Milkdown/pegado/corpus), history_restore (restauración/vistas/acuse) y ai_reversion (journal/reversión/nota). Ámbitos exclusivos; el coordinador integra contratos/rutas/App, reemplazo entre documentos e inventarios. Revisión cruzada realizada y hallazgos corregidos. El programa3.0 permanece abierto, con aceptación instalada/regresión final en P10.

## Implementado

Fidelidad: abrir/seleccionar conserva Markdown exacto hasta edición real. Metadatos YAML/TOML y definiciones de referencia protegidos/plegables; corpus real Milkdown con tablas, enlaces, pies, HTML, Mermaid e imágenes. Pegado rico incompatible se bloquea antes de pérdida; alternativa explícita de texto plano ligada a la selección y un deshacer. Contraste del aviso6,61:1, controles44px y flujo visual de una columna.

Historial: revisión de archivo/ruta/origen, vista previa según capacidad y restauración como commit nuevo con índice temporal. Copias anterior/origen, borrador y preparación Git del usuario conservados. Índice conservado byte a byte: al avanzar HEAD pueden aparecer diferencias relativas a la nueva versión; no se limpia preparación ajena. Ruta accesible desde menú/paleta incluso sin Markdown abierto. Binarios sin visor conservan restauración explícita; imágenes/PDF/notas permiten comparar. Catálogo e intento durable; parcial o acuse incierto exige consulta sin replay.

IA: procedencia local por interacción/operación/documento previa al efecto; no es autenticación del proveedor. Reversión selectiva de bloques Markdown o páginas manuscritas conserva manual posterior disjunto; solapamientos/ambigüedad requieren resolución. Markdown manual exige segundo consentimiento; creación intacta a Papelera. Se revalida fuente inmediatamente después de persistir el intento y antes de escribir. Nota dibujada captura original antes del guardado nativo. Git previo opcional evita bloquear edición Android. Retirada explícita conserva documento, identidades, huellas y acuses.

Integración: instantánea viva de Milkdown antes del acuse, incluidos editores de otras pestañas. Documento cargado usa controlador aunque aún inicialice; API directa solo para no abierto. Reservas antes de preparar, guardar/autosave serializados, autoridad de proyecto/permiso/visita revalidada después de esperas y ningún acuse tardío sustituye la sesión o el texto posterior. Preparaciones fallidas limpian mapas/reservas. Consultar resultado protege y reconcilia la vista sin repetir efectos. Notas personales conservan su propio deshacer, sin atribución al journal de proyecto.

Reemplazo: selección de1–32Markdown, texto literal sensible a mayúsculas, revisión antes/después y solo borradores privados. Recibo antes de efectos, resultado por documento, copias consultables y deshacer del lote condicionado a que sus bases permanezcan. Cambio manual bloquea el undo y conserva el trabajo; no hay atomicidad múltiple ni regex global.

Inventario/cupos: history-restores64intentos/256MiB por proyecto (fuente32MiB), ai-changes64payloads/128MiB y2048identidades globales, document-replacements64intentos/128MiB por proyecto (2MiB/doc,16MiB/revisión). JSON/Markdown IA2MiB,128hunks como máximo antes de exigir revisión completa. Sin purga automática. Procedencia editorial viaja en archivo privado con huellas como datos, nunca como operaciones/recibos activos del receptor. No hay rollback universal de efectos externos ni CAS del sistema de archivos frente a otro proceso.

## Verificación

36 casos nativos únicos correctos:20IA (incluye pérdida de acuse, preservación manual, página de nota y fuente modificada después del journal),4restauración histórica,5reemplazo/integridad/traslado,1restauración parcial afectada,2inventario/cupos y4portabilidad privada afectada. Composición de pruebas Tauri Windows compilada, sin activar la UI instalada.

68 casos frontend únicos correctos:28editor/corpus/continuidad/búsqueda/imágenes,8historial SDK/diálogo,13IA SDK/diálogo y19coordinación/SDK/reemplazo/menú. Los resultados de partes no invalidadas se reutilizan; solo se repiten casos afectados por correcciones. TypeScript y build de producción correctos. Avisos preexistentes de Browserslist/chunks grandes y tres Result de tests se conservan como avisos.

Comprobación cruzada Rust/Tauri `aarch64-linux-android` correcta con NDK28.2.13676358. Diez avisos condicionales preexistentes, sin errores. No Gradle/APK ni dispositivo instalado; Git nativo Android continúa no disponible.

13capturas573–585: App/Milkdown reales para fidelidad, diálogos/controladores reales con API controlada para historial/reversión/reemplazo. No puente Tauri inyectado, proveedores ni gasto. A320×720 y1280×900 sin overflow horizontal;0errores de página/solicitudes externas. Pegado bloqueado→texto explícito→unCtrl+Z y fuente exacta al abrir sin save/draft. En cada escenario de ACK perdido:1intento de escritura y1consulta, sin replay. Comparación de página usa PNG sintético del fixture, no aceptación del raster nativo. Son pruebas de desarrollo/diseño, no aceptación instalada.

Correcciones de revisión: acuse antes de normalización/debounce; autoridad original tras awaits; editores ocultos/cargando; borrador guardado no se adelanta al journal; notas con journal antes del efecto; permiso crear y fuente revalidada antes de Papelera; fuente/hashes estables sin fecha volátil; recibos de reemplazo duplicados/incoherentes rechazados; consulta reconciliada y contraste. Los errores iniciales de compilación/test están en sus logs históricos; el fallo de restauración era URL de fixture con slash no escapado y el del menú aislamiento DOM del test, ambos corregidos y caso afectado repetido.

Logs principales: output/v3-editing-block-native-final.log (resultados válidos de objetivos no invalidados); output/v3-editing-block-native-closing.log; output/v3-editing-block-coordination.log; output/v3-editing-block-coordination-final.log (9válidos/1fixture corregido); output/v3-editing-block-selector-final.log; output/v3-editing-block-workflows-frontend.log; output/v3-editing-block-build-final.log; output/v3-editing-block-android.log; logs editor e historial y output/v3-block5-ai-component-reconcile.log referidos por output/v3-editing-block-verification.json. Evidencias de navegador: output/v3-editing-fidelity-browser-evidence.json, output/v3-editing-fidelity-browser-contrast-evidence.json y output/v3-editing-workflows-browser-evidence.json.

Backlog50/cobertura70 con IDs únicos conservados. F02/F05/F08/F16 conciliados, F07/F17/U04 vinculados sin declarar cerradas ampliaciones ajenas. Plan padre/P04/P05, arquitectura y checklist actualizados. Índice visual y avance.html apuntan a133.

## Pendiente del programa

Aceptación P10: Windows/Android instalados, Git nativo Android aún no disponible, Kotlin/SAF/Keystore, dispositivos/teclado/IME/portapapeles, corpus representativo, lectores externos, cortes/espacio físicos, suspensión/actualización y regresión completa al terminar el programa. No se activa UI nativa Windows ni Gradle mientras persista la incidencia registrada. Otros bloques de audio/OCR y UX mantienen su alcance; no se declara terminada toda la3.0.

T17 real aplazado por no gasto. Sin proveedor IA, suites completas, instalación/publicación, commit/push ni cambio de VERSION2.6.0.
