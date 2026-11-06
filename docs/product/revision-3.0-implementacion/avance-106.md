# Avance106 · Separar los servicios de sincronización

[Reporte visual](avance-106.html) · [Retirada de copias](avance-105.md).

T01: seis métodos,679 líneas, pasan del núcleo `lib.rs` a `project_sync.rs` (estado, ejecución automática, resumen por archivo y sincronización) y `external_changes.rs` (consulta e importación de cambios). Se conservan cuerpos, orden de efectos, admisiones, contratos JSON y rutas. Solo se añaden wrappers `use super::*`/`impl LocalApi` y visibilidad `pub(super)` de los métodos para su acceso desde el crate. Sin dependencias ni cambios de UI.

`output/v3-sync-domains-move-evidence.json` conserva hashes antes/después restaurando únicamente la visibilidad añadida. Identidad exacta:601 líneas en cuatro métodos y78 en dos métodos. Biblioteca Tauri Windows compilada una sola vez junto a105 (`v3-retirement-sync-native-check.log`,4m32s). No se repiten contratos funcionales de cuerpos intactos ni suites completas.

La extracción facilita revisar las precondiciones y coordinar el trabajo sin mezclarlo con otras áreas. No cierra la modularización integral, el planificador general, carreras de publicación ni T01. Sin proveedor, gasto IA, commit, instalación, candidata o publicación. Android sigue con el bloqueo de compilación Java/Gradle ya documentado.
