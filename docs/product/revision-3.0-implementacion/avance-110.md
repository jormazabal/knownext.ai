# Avance110 · Tres dominios separados del núcleo

[Reporte visual](avance-110.html) · [Plan](plan.md).

T01:40 métodos/1.568 líneas pasan de lib.rs a tres módulos: asset_queries (7 métodos/190 líneas), preview_queries (4/52) y research_workflow (29/1.326). Cuerpos, contratos, límites, precondiciones, orden de efectos y llamadas permanecen idénticos. Se añaden únicamente wrappers y visibilidad pub(super) para acceso desde el crate, incluidos dos métodos genéricos.

`output/v3-research-assets-move-evidence.json` compara hashes tras restaurar solo esa visibilidad: tres coincidencias exactas. La primera comprobación detectó la visibilidad de un método genérico usado por ai_usage; corregidos ambos métodos y vuelto a verificar el hash original. La compilación final Tauri Windows pasa3m24s (`v3-incomplete-domains-native-final-check.log`), junto al nuevo comando de109. Se conserva el log anterior como historial de fallo, no como validación actual.

No se repiten contratos funcionales de cuerpos intactos ni se invoca proveedor. La extracción facilita revisar esas familias; no demuestra mejora de tiempo de compilación, no cambia formatos/datos/versiones y no cierra la modularización integral ni el planificador. Con106 son2.247 líneas trasladadas en estos cortes, con evidencia mecánica independiente.

Sin instalación, commit, candidata o publicación; VERSION2.6.0. Persisten las ampliaciones y aceptación del programa; Android mantiene su bloqueo Java/Gradle previo y T17 real continúa aplazada por no gasto.
