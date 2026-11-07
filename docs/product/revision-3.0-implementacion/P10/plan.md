# P10 · Plan evolutivo
[Definición](tarea.md) · [Plan principal](../plan.md)
Estado: consolidación y regresión139 cerradas; etapa QA140 de candidata3.0.0 C1 instalada Windows MSI paralelo y Android QA/emulador cerrada en sus recorridos acotados; aceptación productiva/firmada, ARM físico y personas pendientes; publicación excluida. Responsable: Responsable técnico, QA, producto y release; persona por asignar. Esfuerzo relativo L, sin conversión a calendario.

## Entrada
- [P00](../P00/plan.md): entradas pertinentes según las dependencias del plan principal; no exige finalizar todas sus ampliaciones.
- [P01](../P01/plan.md): entradas pertinentes según las dependencias del plan principal; no exige finalizar todas sus ampliaciones.
- [P02](../P02/plan.md): entradas pertinentes según las dependencias del plan principal; no exige finalizar todas sus ampliaciones.
- [P03](../P03/plan.md): entradas pertinentes según las dependencias del plan principal; no exige finalizar todas sus ampliaciones.
- [P04](../P04/plan.md): entradas pertinentes según las dependencias del plan principal; no exige finalizar todas sus ampliaciones.
- [P05](../P05/plan.md): entradas pertinentes según las dependencias del plan principal; no exige finalizar todas sus ampliaciones.
- [P06](../P06/plan.md): entradas pertinentes según las dependencias del plan principal; no exige finalizar todas sus ampliaciones.
- [P07](../P07/plan.md): entradas pertinentes según las dependencias del plan principal; no exige finalizar todas sus ampliaciones.
- [P08](../P08/plan.md): entradas pertinentes según las dependencias del plan principal; no exige finalizar todas sus ampliaciones.
- [P09](../P09/plan.md): entradas pertinentes según las dependencias del plan principal; no exige finalizar todas sus ampliaciones.
Hito propuesto: H5 para alcance 3.0 seleccionado.

## Cortes de trabajo
1. [ ] Congelar alcance seleccionado y revisar cada criterio; comprobar que ninguna funcionalidad existente desapareció por el rediseño.
2. [ ] Ejecutar regresión técnica y nativa proporcional, migración y restauración, accesibilidad y piloto prolongado de tareas críticas.
3. [ ] Resolver P0 y pérdidas silenciosas, documentar limitaciones y capacidades no aceptadas; no esconderlas en promedios.
4. [ ] Preparar release mediante la skill del proyecto cuando se autorice esa fase; alinear VERSION/manifests, firmas y activos.
5. [ ] Comprobar manifiestos y enlaces tras publicación autorizada; registrar publicación, instalación y aceptación como hechos distintos.

## Superficies a inspeccionar antes de editar
docs/development/manual-test-checklist.md; VERSION y manifests solo al preparar release; scripts; docs/releases.
Las rutas describen el ámbito propietario esperado, no una orden de modificar todos sus archivos. Confirmar contratos y cambios locales al comenzar cada corte.

## Verificación prevista
En la candidata local C1 se reutiliza la regresión139 y se ejecutan sólo controles invalidados por versión, empaquetado o defectos reproducidos, según la instrucción de no repetir suites completas. El flujo público posterior conserva sus puertas de release, firmas, activos y aceptación; no se ha ejecutado CI de release ni publicado.
Cada criterio P10-C se asociará a evidencia del corte que lo implemente, con entorno y resultado. Las verificaciones y sus límites se registran en los avances enlazados; no equivalen por sí solas al cierre completo del paquete.

## Riesgos y tratamiento
Confundir build verde con aceptación o implementar más de lo que puede verificarse. Mantener frontera de release explícita.

## Ampliación y condición de entrada
Seguimiento de incidencias y siguientes oleadas del catálogo manteniendo el mismo plan.
Se concreta el comportamiento, contrato y aceptación del siguiente corte antes de empezar; permanece en el backlog aunque no entre en 3.0.

## Progreso y siguiente paso
- Hecho: consolidación funcional fe416299 y candidata C1 versionada3.0.0 en736e7484, sin push/tag/publicación. Regresión139 reutilizada:1.158frontend/740Rust y dos benchmarks, sin nuevas suites completas.
- Hecho: QA140 Windows C1 instalado por MSI3.0.0, identidad/perfil separados y2.6 preservada: runtime Tauri real, guardado por botón y paleta Ctrl+Shift+P → Guardar documento activo → Enter, SVG, ajustes/diagnóstico y reapertura con Markdown inalterado tras detención forzada posterior a guardado durable. No acredita cierre normal con cambios, migración/actualización productiva, firma de distribución, hardware o personas.
- Hecho: QA140 Android completado en emulador API36/x86_64, paquete ai.knownext.mobile.v3qa, versión3.0.0/3000000: actualización adb install -r del QA previo conserva UID/certificado y testigo antes de lanzar; edición Milkdown y botón Guardar, reapertura exacta, arranque offline sin ruta por defecto, Sistema/Vista avanzada y retorno al mismo documento comprobados. APK instalado SHA2568386f3aa85057e24b0d7d57eb65296c9412ac4c86206a0fd5b10615ac438c19b, firma debug QA existente verificada, sin firma productiva. Fuerza de parada QA y red restaurada al estado previo; no demuestra migración de la app pública2.6, ARM físico, hardware/SAF/Keystore completos o personas.
- Hecho: MSI QA final reinstalado con exit0 y SHA256DAC25F7BEFA709546C788B8831A09A183455E0BF36AB2B92949314A683C24845; fuente del runtime736e7484, EXE instalado SHA256ED789DC3C7420A6932A90D316A4A57294F8A6C39EC3C7D6FCD290FADAD2FE433 idéntico al contrastado en UI. El único cambio posterior es de empaquetado WXS/OFL: clave HKCU resuelta, licencia instalada coincidente y documento previo conservado con hash7EE119262B6B4328D0EA6BDF6B6E459ABF69BD98FBF7ACFA617E3CC821D92E6D. La2.6 normal permanece intacta. Se reutilizan los recorridos UI Windows de guardado/teclado/paleta/SVG/ajustes/reapertura porque el binario y el contenido durable se conservan; no se afirma una nueva campaña ni salida normal con borrador pendiente.
- Pendiente fuera del alcance QA: firmas de distribución, actualización con identidad productiva2.6→3.0, ARM físico/SAF/Keystore y fallos físicos, accesibilidad especializada y personas U16. T17 real aplazada sin gasto.
- Próximo paso: el coordinador consolida el reporte final, revisión exacta de empaquetado y sus huellas. La siguiente aceptación es productiva/firmada/física/humana; requiere su entorno y autoridad propios y no se confunde con el cierre QA140.

## Validación incremental actualizada · 2026-11-01
Instrucción explícita del usuario: reducir drásticamente la repetición de suites de interfaz y Rust. Durante desarrollo solo comprobaciones focales justificadas, reutilización de evidencia válida y QA nativa agrupada por hitos. Regresión completa al finalizar toda la implementación. Política y base vigente en el [plan principal](../plan.md). Esta instrucción prevalece sobre la práctica anterior por corte.



## Conciliación documental139 previa al cierre de regresión · 2026-11-06

Cierre técnico139 en curso; aceptación instalada/física/humana y fase de release pendientes, no publicación ni instalación3.0. Las notas históricas anteriores conservan su fecha/alcance; sus frases de «pendiente» no reabren desarrollos ya entregados. Evidencia actual: [Alcance139](../bloque-139.md), [backlog50](../backlog.csv) y [cobertura70](../cobertura-capacidades.csv). El [bloque139](../bloque-139.md) está en verificación final: la regresión Rust y correcciones concretas continúan, sin PASS global anticipado. P10/U16 conservan aceptación física/humana; T17 proveedor real permanece aplazado por decisión de no gasto. Git nativo Android y capacidades dependientes de proveedor/hardware siguen sujetos a disponibilidad real.


## Cierre verificado139 · 2026-11-06

Regresión local139 cerrada:1.158casos frontend y740Rust únicos correctos; build/tipos/bundle y comprobación Rust Android correctos. Dos benchmarks aislados adicionales. Una campaña completa y repeticiones sólo de fallos/casos invalidados. La revinculación con origen ausente está corregida y revisada por un segundo agente. [Resultado y límites](../avance-139.md). Las notas históricas conservan su fecha; no reabren desarrollos ya entregados. P10/U16 mantienen instalación/actualización, dispositivos/SAF, cortes/suspensión, accesibilidad y personas; T17 real sigue aplazado sin gasto. Git nativo Android y capacidades condicionadas conservan sus límites documentados. No publicación/instalación/cambioVERSION.


## Consolidación de alcance140 · 2026-11-06

[Alcance local y exclusiones vigentes](../consolidacion-140-alcance.md). La regresión139 está cerrada; los textos anteriores a ese cierre conservan su contexto. La preparación y validación instalada están ahora autorizadas, sin publicar ni gastar en IA. Este ajuste documental no constituye una instalación o aceptación.


## Evidencia intermedia QA140 · Runtime Windows y Android comprobados

QA140 Windows C1 instalado por MSI3.0.0, identidad/perfil separados y2.6 preservada: runtime Tauri real, guardado por botón y paleta Ctrl+Shift+P → Guardar documento activo → Enter, SVG, ajustes/diagnóstico y reapertura con Markdown inalterado tras detención forzada posterior a guardado durable. No acredita cierre normal con cambios, migración/actualización productiva, firma de distribución, hardware o personas.

Evidencia: [MSI y propiedades](../../../../output/candidate-windows-package-140.json), [instalación exit0](../../../../output/candidate-windows-install-140.json), [runtime/UI y reapertura](../../../../output/candidate-windows-ui-140.json). La ausencia de Ctrl+S es una observación UX preexistente; no se anuncia ese atajo como implementado. El guardado por teclado comprobado usa la paleta, no Tab+Enter.

El cierre de esta etapa acepta sólo su alcance QA: no convierte P10-C2/C3/C4 en aceptación productiva completa, no genera firmas oficiales y no publica. Android dispone ya de evidencia final acotada; la aceptación completa de firmas/identidad productiva, dispositivo físico y personas continúa separada.


## Resultado Android QA140 confirmado

QA140 Android completado en emulador API36/x86_64, paquete ai.knownext.mobile.v3qa, versión3.0.0/3000000: actualización adb install -r del QA previo conserva UID/certificado y testigo antes de lanzar; edición Milkdown y botón Guardar, reapertura exacta, arranque offline sin ruta por defecto, Sistema/Vista avanzada y retorno al mismo documento comprobados. APK instalado SHA2568386f3aa85057e24b0d7d57eb65296c9412ac4c86206a0fd5b10615ac438c19b, firma debug QA existente verificada, sin firma productiva. Fuerza de parada QA y red restaurada al estado previo; no demuestra migración de la app pública2.6, ARM físico, hardware/SAF/Keystore completos o personas.

Evidencia final: [aceptación Android](../../../../output/candidate-android-140.final.json) y [actualización/edición/reapertura previas reutilizadas](../../../../output/candidate-android-140.upgrade.json). La primera actualización abrió la pestaña de Novedades, comportamiento previsto; el testigo se abrió por un toque y su contenido estaba intacto. El primer selector global de Vista avanzada se corrigió para señalar el control visible de Sistema; la comprobación final pasó sin modificar producto ni repetir la campaña. No se presenta esa observación intermedia como pérdida de estado ni fallo de datos.


## Cierre de la etapa QA instalada140 · alcance acotado

El alcance de candidata instalada QA140 está completado en los recorridos siguientes. P10 no queda cerrado como release pública ni como aceptación productiva, física o humana.

| Criterio de esta etapa | Resultado y evidencia |
|---|---|
| QA140-W1 · MSI QA aislado, instalación final y conservación del entorno | Comprobado: [paquete final](../../../../output/candidate-windows-package-final-140.json) y [reinstalación final](../../../../output/candidate-windows-final-install-140.json). Nombre/identidad/UpgradeCode separados, registro de licencia OFL resuelto, binario/documento conservados y2.6 normal intacta. |
| QA140-W2 · Runtime y trabajo documental Windows | Comprobado en [UI instalada](../../../../output/candidate-windows-ui-140.json): puente Tauri real, botón Guardar, paleta Ctrl+Shift+P → Guardar documento activo → Enter, SVG, ajustes/diagnóstico y reapertura tras detención forzada posterior a guardado durable. Binario idéntico permite reutilizar esta evidencia después del reempaquetado. No se afirma Ctrl+S, Tab+Enter, cierre normal con cambios ni recuperación de borrador no guardado. |
| QA140-A1 · Android QA instalado y continuidad | Comprobado en [actualización QA](../../../../output/candidate-android-140.upgrade.json) y [cierre Android](../../../../output/candidate-android-140.final.json): mismo UID/certificado debug, testigo conservado antes de lanzar, edición Milkdown/Guardar, reapertura exacta, offline, Sistema/Vista avanzada y vuelta al documento; QA detenido y red restituida. Emulador API36/x86_64, sin aceptación ARM física. |
| QA140-E1 · Evidencia y límites | Matrices50/70 conservadas; contexto QA separado de aceptación completa por fila. Regresión139 reutilizada, sin nuevas suites completas ni gasto IA. Firmas/canales productivos y personas mantienen sus puertas propias. |

MSI QA final reinstalado con exit0 y SHA256DAC25F7BEFA709546C788B8831A09A183455E0BF36AB2B92949314A683C24845; fuente del runtime736e7484, EXE instalado SHA256ED789DC3C7420A6932A90D316A4A57294F8A6C39EC3C7D6FCD290FADAD2FE433 idéntico al contrastado en UI. El único cambio posterior es de empaquetado WXS/OFL: clave HKCU resuelta, licencia instalada coincidente y documento previo conservado con hash7EE119262B6B4328D0EA6BDF6B6E459ABF69BD98FBF7ACFA617E3CC821D92E6D. La2.6 normal permanece intacta. Se reutilizan los recorridos UI Windows de guardado/teclado/paleta/SVG/ajustes/reapertura porque el binario y el contenido durable se conservan; no se afirma una nueva campaña ni salida normal con borrador pendiente.

Estado de los criterios generales P10: C1 dispone de trazabilidad local y alcance congelado; C2 sólo acredita aquí los recorridos QA seleccionados; C3 conserva pendiente la migración/actualización de la identidad productiva y el procedimiento de vuelta; C4 conserva pendientes firmas/activos/canales de distribución. La actualización del paquete Android QA previo no se presenta como migración de la aplicación pública2.6. No hay publicación ni autorización para publicarla en esta etapa.

Pendientes fuera de esta etapa: firmas oficiales/updater y APK ARM64 productivo; instalación/actualización/migración productiva2.6→3.0 y vuelta documentada; dispositivos ARM físicos y SAF/Keystore/hardware/cortes/espacio/suspensión; lectores/IME/DPI/lápiz/tacto/audio y personas U16. T17 de proveedor real permanece aplazada sin gasto. La aparición prevista de Novedades tras actualizar no acredita pérdida de estado; los testigos guardados se conservaron y se abrieron de forma explícita.
