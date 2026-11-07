# Avance 24 · Índices con identidad, revisión y resultado verificables

Corregido un defecto confirmado de integridad en la ruta del índice textual IA. La limpieza valida identidad y revisión; los errores distinguen lo conservado de un efecto parcial ya realizado. Este corte no acredita una auditoría completa ni la limpieza regenerable integral de F17.

## Corrección y comportamiento

- La [regresión aislada previa](../../../output/v3-ai-index-boundary-red-24.log) demuestra que un ID codificado podía hacer que el borrado saliera del directorio de índices. Solo se usa un centinela dentro de TempDir; nunca se ejecutan esos IDs contra datos habituales o QA anteriores.
- Nuevo módulo Rust `ai_index_store`: ID portable registrado, raíz/directorio/archivo regulares sin enlaces, límite real de lectura de 64 MiB y colecciones acotadas. Lectura, contexto, regeneración y limpieza pasan por esa frontera.
- Acepta el formato heredado escrito por la aplicación y v1. Conserva bytes futuros, dañados, desconocidos, de otra identidad, enlazados o no regulares. Leer no reescribe. Un índice ilegible se comunica como error con revisión/tamaño desconocidos, sin bloquear la carga independiente de configuración IA.
- DELETE exige el SHA de los bytes observados. Una revisión antigua no borra una generación nueva. Se propaga el fallo de borrado y se mantiene el archivo. Las preferencias solo se limpian si pertenecen a ese proyecto; el interruptor RAG se conserva.
- Si el archivo se retiró/reconstruyó pero después fallan preferencias, el mensaje identifica el efecto parcial. El estado procede del archivo validado, sin heredar un estado o error global de otro proyecto. `checkedAt` identifica la consulta.
- `useAiIndexMaintenance` captura proyecto, época y revisión, bloquea duplicados y descarta respuestas antiguas incluso al salir y volver al mismo proyecto. Un acuse desconocido se concilia mediante lectura; nunca repite la mutación automáticamente. Actualizar estado es una acción explícita de solo lectura.
- Error visible en vista básica, controles de 44 px y metadatos nulos sin resucitar fechas/referencias antiguas. La etiqueta «Indexado» evita afirmar frescura de los originales por existir un cache válido; la ayuda aclara cuándo reconstruir. Corregidos singulares del mapa de uso.

## Verificación final

| Comprobación | Resultado y alcance |
|---|---|
| Frontend completo | **568/568, 124 archivos**, [suite 54](../../../output/v3-frontend-tests-54.log). |
| Rust completo | **329/329**, [suite 43](../../../output/v3-rust-tests-43.log). |
| Dominio focal | [9 pruebas Rust](../../../output/v3-ai-index-boundary-tests-04.log): centinela, identidad/ruta, junction Windows real, formato heredado, desconocido/futuro/pertenencia, límites/no regular, revisión obsoleta, permisos, efecto parcial y preferencias de otro proyecto. |
| Integración existente | [2 recorridos Rust](../../../output/v3-ai-index-integration-tests-01.log) de contexto Markdown y notas con el esquema real; fuentes conservadas. |
| Frontend focal | [41 pruebas](../../../output/v3-ai-index-boundary-ui-tests-04.log), incluyendo lectura sin mutación, doble envío, acuse perdido, cambio de época, cache ilegible, error básico y metadatos antiguos. [TypeScript](../../../output/v3-ai-index-boundary-types-04.log). |
| Componentes reales | [Navegador](../../../output/v3-ai-index-boundary-browser-evidence-24.json), 1360×900 y 412×720: tres acciones de 44 px, bloqueo en vuelo, error parcial, lectura explícita y sin overflow. Recibos controlados: una mutación y una lectura. [Captura](../../../output/playwright/revision-3.0/132-indice-error-parcial-movil.png). |

Browser plugin no disponible: Playwright ordinario. Un primer locator apuntó a un panel oculto que conservaba estado; se acotó al tabpanel visible sin cambiar producto ni forzar clics. Los avisos HMR de desarrollo no se presentan como consola de producto limpia.

## Android offline y hallazgo intermedio

[Evidencia consolidada](../../../output/android-v3-ai-index-boundary-evidence-53.json). API36 x86_64, exclusivamente `ai.knownext.mobile.v3qa`. APK53 SHA256 `1a0c7c0c7bc3005e9a37a9a957cce8908a446f5c9e46668048e8a27efc4a8be4`; [478 entradas de fuente](../../../output/android-v3-ai-index-boundary-inputs-53.json) sin cambios durante la [reconstrucción completa](../../../output/v3-android-qa-build-53.log). [Instalación](../../../output/v3-android-qa-install-53.log) y [JS/dos CSS servidos coincidentes con dist](../../../output/android-v3-ai-index-boundary-assets-53.json).

- Proyecto/documento sintéticos sin Git. Reconstrucción desde la interfaz produce un índice cuyo SHA coincide con la revisión nativa; el documento conserva su SHA.
- Archivo del índice en solo lectura: error explícito, mismo archivo/revisión y fuente intacta. Restaurar permiso y repetir de forma explícita permite limpiar. Una revisión anterior rechaza la limpieza y conserva la generación posterior.
- Config sin permiso tras retirar: error «ya se ha retirado», estado no indexado, revisión nula y sin referencias antiguas en la métrica. Actualizar estado consulta sin repetir el borrado.
- Config sin permiso y estado previo no indexado durante reconstrucción: el índice nuevo queda legible, con un documento, revisión exacta y estado «Indexado»; config mantiene su hash. [Captura nativa inspeccionada](../../../output/playwright/revision-3.0/133-android-indice-parcial-confirmado.png).
- Índice sintético futuro/desconocido: bytes conservados, estado error y revisión/tamaño desconocidos; reconstrucción rechazada y limpieza deshabilitada. Reiniciar conserva el error y carga desde Rust el modelo de prueba gpt-5.5, distinto del valor inicial: el cache no bloquea la configuración. [Captura inspeccionada](../../../output/playwright/revision-3.0/134-android-indice-desconocido-conservado.png). No se comprueba acceso al modelo ni se ejecuta un prompt.
- El fixture futuro se retira manualmente solo tras contrastar su hash, dentro de la limpieza QA; no se atribuye esa retirada al producto. Contrato nativo adicional con RAG desactivado: reconstruir mantiene false; consultar y limpiar desde la interfaz también lo conservan. Fuente intacta en todos los casos.
- Cero errores de página registrados, cero proveedor. UIA inicial durante carga no produjo XML; se repitió tras estabilizarse antes de CDP. Sin operación sobre diálogos del sistema ni clics forzados. No se afirma aceptación física por CDP.

APK52 se compiló y **no se instaló**: [registro intermedio](../../../output/android-v3-ai-index-boundary-intermediate-52.json). La revisión añadió una aserción con preferencias previas no indexadas y [reprodujo el estado incorrecto](../../../output/v3-ai-index-status-red-24.log). APK53 contiene la corrección y acredita ese caso nativo. No se mezclan ambos artefactos como una única verificación.

## Restitución y continuidad

[Restauración](../../../output/android-v3-ai-index-boundary-restoration-24.json): cuatro hashes originales, avión 0/Wi-Fi 1/datos 0, permisos restaurados, dos backups retirados y ningún archivo auxiliar del proyecto de prueba. Documento/carpeta retirados tras verificar raíz, listado exacto y SHA; directorio de índices nuevo retirado solo estando vacío; catálogo propio, XML y forwards retirados. QA detenida, emulador disponible. Windows habitual intacto.

Sigue prioritaria la revisión de otras rutas de almacenamiento secundario y sus IDs antes de ampliar limpieza: esta corrección solo cubre el índice textual. También quedan planificación de indexación fuera del mutex, frescura completa de fuentes, revisión de candidatos/regeneración, cuotas y las demás F17. El indicador global del último guardado de preferencias necesita un ámbito más claro ante un efecto parcial del índice; su aviso específico ya es explícito, pero no se declara cerrada la semántica global de estados.

Continúan todas las áreas y ampliaciones del [plan completo](plan.md), incluida la matriz física y P10. Diez paquetes iniciados, ninguno cerrado completamente. VERSION 2.6.0; cambios locales, sin commit, integración, publicación ni aceptación humana de 3.0. [Avance anterior](avance-23.md).
