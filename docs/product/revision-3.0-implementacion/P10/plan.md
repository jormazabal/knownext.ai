# P10 · Plan evolutivo
[Definición](tarea.md) · [Plan principal](../plan.md)
Estado: integración y regresión local139 cerradas; consolidación de alcance140 realizada y candidata instalada en preparación/validación autorizadas; aceptación por plataforma y con personas pendiente; publicación excluida. Responsable: Responsable técnico, QA, producto y release; persona por asignar. Esfuerzo relativo L, sin conversión a calendario.

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
pnpm release:check en candidata; verificaciones nativas/piloto, manifiestos y activos en fase de release. No ejecutar ni publicar en esta tarea de planificación.
Cada criterio P10-C se asociará a evidencia del corte que lo implemente, con entorno y resultado. Las verificaciones y sus límites se registran en los avances enlazados; no equivalen por sí solas al cierre completo del paquete.

## Riesgos y tratamiento
Confundir build verde con aceptación o implementar más de lo que puede verificarse. Mantener frontera de release explícita.

## Ampliación y condición de entrada
Seguimiento de incidencias y siguientes oleadas del catálogo manteniendo el mismo plan.
Se concreta el comportamiento, contrato y aceptación del siguiente corte antes de empezar; permanece en el backlog aunque no entre en 3.0.

## Progreso y siguiente paso
- Hecho: alcance y matrices50/70 conciliados; regresión local139 cerrada con1.158casos frontend y740Rust únicos correctos, dos benchmarks aislados, build/tipos/bundle y comprobación Rust Android correctos. [Alcance congelado140](../consolidacion-140-alcance.md).
- Hecho: regresión local139 cerrada; reutilizar evidencia no invalidada, sin repetir suites completas por cambios documentales.
- Pendiente: preparar y aceptar la candidata instalada Windows/Android, migración/actualización/recuperación, dispositivos/fallos físicos y recorridos con personas en P10/U16. T17 real sigue aplazada sin gasto.
- Próximo paso: el coordinador completa la revisión e integración Git y diagnostica el entorno; después construye y valida la candidata instalada según la autoridad actual. Registrar cada resultado por artefacto, entorno y revisión.
- Publicación excluida por instrucción actual. La autorización de preparar e instalar no acredita instalación realizada ni aceptación humana. Las capacidades condicionadas se conservan sin simulación.

## Validación incremental actualizada · 2026-11-01
Instrucción explícita del usuario: reducir drásticamente la repetición de suites de interfaz y Rust. Durante desarrollo solo comprobaciones focales justificadas, reutilización de evidencia válida y QA nativa agrupada por hitos. Regresión completa al finalizar toda la implementación. Política y base vigente en el [plan principal](../plan.md). Esta instrucción prevalece sobre la práctica anterior por corte.



## Conciliación documental139 previa al cierre de regresión · 2026-11-06

Cierre técnico139 en curso; aceptación instalada/física/humana y fase de release pendientes, no publicación ni instalación3.0. Las notas históricas anteriores conservan su fecha/alcance; sus frases de «pendiente» no reabren desarrollos ya entregados. Evidencia actual: [Alcance139](../bloque-139.md), [backlog50](../backlog.csv) y [cobertura70](../cobertura-capacidades.csv). El [bloque139](../bloque-139.md) está en verificación final: la regresión Rust y correcciones concretas continúan, sin PASS global anticipado. P10/U16 conservan aceptación física/humana; T17 proveedor real permanece aplazado por decisión de no gasto. Git nativo Android y capacidades dependientes de proveedor/hardware siguen sujetos a disponibilidad real.


## Cierre verificado139 · 2026-11-06

Regresión local139 cerrada:1.158casos frontend y740Rust únicos correctos; build/tipos/bundle y comprobación Rust Android correctos. Dos benchmarks aislados adicionales. Una campaña completa y repeticiones sólo de fallos/casos invalidados. La revinculación con origen ausente está corregida y revisada por un segundo agente. [Resultado y límites](../avance-139.md). Las notas históricas conservan su fecha; no reabren desarrollos ya entregados. P10/U16 mantienen instalación/actualización, dispositivos/SAF, cortes/suspensión, accesibilidad y personas; T17 real sigue aplazado sin gasto. Git nativo Android y capacidades condicionadas conservan sus límites documentados. No publicación/instalación/cambioVERSION.


## Consolidación de alcance140 · 2026-11-06

[Alcance local y exclusiones vigentes](../consolidacion-140-alcance.md). La regresión139 está cerrada; los textos anteriores a ese cierre conservan su contexto. La preparación y validación instalada están ahora autorizadas, sin publicar ni gastar en IA. Este ajuste documental no constituye una instalación o aceptación.
