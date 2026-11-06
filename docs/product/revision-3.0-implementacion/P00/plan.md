# P00 · Plan evolutivo
[Definición](tarea.md) · [Plan principal](../plan.md)
Estado: en curso; primer corte parcial. Responsable: QA y producto; apoyo de frontend y Rust; persona por asignar. Esfuerzo relativo L, sin conversión a calendario.

## Entrada
Revisar estado actual, instrucciones de proyecto y corpus de prueba antes de intervenir.
Hito propuesto: H0 y transversal.

## Cortes de trabajo
1. [ ] Inventariar los 70 recorridos, los 14 hallazgos y los 32 casos del estudio; distinguir web, Windows y Android.
2. [ ] Construir proyectos desechables y corpus común: Markdown largo, tablas, enlaces, Mermaid, assets, .knote, rutas adversas y audio.
3. [ ] Medir arranque frío/caliente, latencia de edición/guardado y memoria con entorno y tamaños registrados; fijar presupuestos después de medir.
4. [ ] Preparar pruebas de contrato y recorridos críticos; realizar primera ronda de usuarios y repetir los cambios que resuelvan fallos.
5. [ ] Mantener resultados por commit y plataforma hasta la candidata; extender escenarios y dispositivos por riesgo.

## Superficies a inspeccionar antes de editar
docs/development/manual-test-checklist.md; pruebas frontend/Rust; scripts; corpus de prueba.
Las rutas describen el ámbito propietario esperado, no una orden de modificar todos sus archivos. Confirmar contratos y cambios locales al comenzar cada corte.

## Verificación prevista
Cobertura documental automatizada, corpus reproducible, pnpm build/test por cambios pertinentes; comparativas instrumentadas y sesiones moderadas.
Cada criterio P00-C se asociará a evidencia del corte que lo implemente, con entorno y resultado. Las verificaciones y sus límites se registran en los avances enlazados; no equivalen por sí solas al cierre completo del paquete.

## Riesgos y tratamiento
No disponer de hardware o perfiles de usuarios. Preparar casos locales y reservar agenda sin atribuir aceptación inexistente.

## Ampliación y condición de entrada
Matriz ampliada de equipos y ensayos prolongados; optimizaciones dirigidas por cuellos de botella confirmados.
Se concreta el comportamiento, contrato y aceptación del siguiente corte antes de empezar; permanece en el backlog aunque no entre en 3.0.

## Progreso y siguiente paso
- Hecho: definición y relación con catálogo/inventario.
- Pendiente: asignación de responsable nominal, comprobación de entrada y ejecución de cortes.
- Próximo paso: Inventariar los 70 recorridos, los 14 hallazgos y los 32 casos del estudio; distinguir web, Windows y Android.
- Implementación local y verificación parciales en curso. Integración, publicación, despliegue y aceptación completa no ejecutados; consultar el avance vigente.



## Avance 01
Ver [evidencia y pendientes](../avance-01.md). La orden actual autoriza ejecutar el programa completo. Este paquete no se declara completado.


## Avance 02
Ver [implementacion, pruebas y pendientes](../avance-02.md). Este paquete permanece abierto: no se equipara una implementacion parcial a su aceptacion completa. El desarrollo del programa completo esta autorizado.


## Avance 04
Estado y evidencia vigentes: [continuidad, seguridad nativa y primer uso](../avance-04.md). Continúa el alcance completo restante; no se cierra este paquete.


## Avance 05
Recuperación, continuidad e historial: [evidencia y pendientes](../avance-05.md). No se cierra el alcance restante de este paquete.


## Avance 06
[Traslados, continuidad y referencias](../avance-06.md). Implementación y comprobación parciales; continúa el alcance restante. No se declara cerrado este paquete.


## Corte 07
Información y referencias contextuales, corpus acotado, capacidades por plataforma y restauración del panel fijado. [Evidencia transversal](../avance-07.md). Este corte no cierra el paquete ni sus ampliaciones.


## Corte 08
Revisión de variantes y copias dañadas, recuperación como otro archivo, archivo privado verificado y categorías fijas. [Evidencia transversal](../avance-08.md). No cierra el paquete ni sus ampliaciones.


## Corte 09
Configuración integrada, continuidad, errores por grupo y guardado ordenado. [Evidencia transversal y límites](../avance-09.md). No cierra el paquete ni sus ampliaciones.


## Corte 10
Estado crítico protegido, revisión/restablecimiento conservando originales y aislamiento del inicio. [Evidencia transversal y límites](../avance-10.md). No completa el resto del paquete ni sus ampliaciones.


## Corte 11
Búsqueda de ajustes, resumen integrado, foco y trabajo de vistas ocultas. [Evidencia transversal y límites](../avance-11.md). Continúa todo el alcance restante; no se cierra el paquete.


## Avance 12
[Espera principal, continuidad y revisión de resultados IA](../avance-12.md). Verificación parcial frontend/Rust y Android sin red; no cierra el paquete ni sus ampliaciones. Continúan todos sus criterios restantes y la aceptación nativa.


## Avance 13
[Revisión, borradores y autoridad IA](../avance-13.md). Evidencia parcial por tramo; continúan el resto del paquete y sus ampliaciones.


## Avance 14
[Imágenes/trazos y revisión raster](../avance-14.md). Evidencia parcial nativa/Rust/frontend; siguen el resto del paquete y sus ampliaciones.


## Avance 15
[Exportación comprobada y destino Android](../avance-15.md): 479 frontend, suite Rust 259/259 más dominio PDF actualizado 19/19 y APK 29 contrastado sin red. Corpus de 15 páginas, cancelación, nombre elegido, escritura y lector nativo. Continúa todo el programa; no cierra paquetes ni sus ampliaciones.


## Validación incremental actualizada · 2026-11-01
Instrucción explícita del usuario: reducir drásticamente la repetición de suites de interfaz y Rust. Durante desarrollo solo comprobaciones focales justificadas, reutilización de evidencia válida y QA nativa agrupada por hitos. Regresión completa al finalizar toda la implementación. Política y base vigente en el [plan principal](../plan.md). Esta instrucción prevalece sobre la práctica anterior por corte.
