# Avance136 · Bloque8: investigación verificable

[Reporte visual](avance-136.html) · [Criterios/delegación](bloque-136.md) · [Contratos](../../architecture/research-evidence-local-review.md) · [Backlog](backlog.csv).

Implementado localmente con tres agentes reales y ámbitos separados: handwritten_ocr(backend/grafo/calidad), meeting_minutes(UI/controller/entrada), recording_sources(SDK/types/contratos). Coordinador integra rutas locales, snapshots/transacción, App/layout, prueba de cola sin proveedor, revisión y reportes. El trabajo original permanece; se registra un overlay humano, no se regenera su prosa.

13casos nativos únicos correctos:5contratos públicos de inspección/alcance/pausa/IDscitas/CAS/futuros/capacidad,1writer conserva overlay humano,1calidad contraIDsdesconocidos,1coberturaafectada,1colaTauri local y4archivo privado afectado. Se reutiliza composición de paquetes y solo checks pertinentes; al detectar límite final se detuvo una compilación inicial antes de ejecutar tests. La tanda final pasa completa, sin gasto/proveedor ni suites generales.

22casos frontend únicos correctos:11SDK y11UI/controller/entry. Repetidos solo4acuses poralineación ycasosUI invalidados porfixtures/foco. Proyección porafirmación, consentimiento invalidado, cierre/retorno de foco yGETtrasACKperdido exacto. TypeScript/build producción correctos; últimaetiquetaneutra puramentedecontenido secontrastó enrender sin nueva suite. Avisos preexistentes Browserslist/chunks grandes y3Resulttests no son fallos nuevos.

Rust/Tauri aarch64-linux-android comprobado con NDK28.2.13676358, sin errores y con10avisos condicionales preexistentes. Sin Gradle/instalación ni aceptación física.

6capturas614–619 de componentes/controlador reales con APIcontrolada, sin puenteTauri/proveedor/instalación.1280/320sin overflow horizontal,0errores/externas ycontroles44px. Capas120/140 y focoinert de subdiálogo; 1prepare+1applyconACKperdido+1GETademásdelGETinicial, sin replay. Se conservan originalesfixture y revisiones fuera del alcance elegido. Comentario preparado/aplicado usa rótulo neutro. Fuente/scopeSHA deQAactualizados sin repetir capturas no afectadas.

Revisión cruzada corrigió tres problemas reales: IDs conocidos sin fragmento coincidente no daban apoyo utilizable; referencias duplicadas no inflan conteo; prefijo de intento SDK/UI alineado `research-review-`. Root cadena de props, propietario/URL, namespace fuera de envío IA y CAS revisados independientemente, sin incidencias concretas abiertas.

Límites:128fuentes/500afirmaciones/1000evidencias/1000refs porclaim/2MiBtexto,16reviews y32MiBstore. Legado sinclaims estructuradas seadvierte; no seinventan afirmaciones ni fuentes. Coincidencia deextracto no certifica verdad/actualidad. Los originales sources/evidence/findings/markdown permanecen. Archivo privado incluyeoverlaydentrojob, sin nueva familia ni activartrabajos al importar.

Logs: output/v3-research-review-block-native-final.log; output/v3-research-review-block-build.log; output/v3-research-review-block-android.log; output/v3-block8-research-evidence-sdk.log; output/v3-block8-research-evidence-sdk-receipts-final.log; output/v3-block8-research-entry.log; output/v3-block8-research-ui.log; output/v3-block8-research-ui-apply-final.log; output/v3-block8-research-ui-close-final.log; output/v3-block8-research-browser-evidence.json; huellas/matriz output/v3-research-review-block-verification.json. Backlog50/cobertura70,P08 yplanpadre/checklist conciliados.

Continúan copiasprogramadas9,UX10yrendimiento/regresión11. P10 conserva personas/corpus/instalación ypruebasfísicas; T17 real aplazado sin gasto. NoUIWindows/Gradleconincidencia ni publicación/instalación/commit/push/cambioVERSION2.6.0.
