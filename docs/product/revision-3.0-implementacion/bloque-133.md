# Bloque 5 · Edición documental y reversión · entrega 133

Autorización: petición explícita del usuario de implementar bloque5 con hasta3subagentes reales y coordinador. Se reutiliza el plan padre; no se instala/migra SDD (doctor unbound), publica, cambia VERSION o gasta en IA. Las pruebas son dirigidas; regresión general/aceptación instalada en P10.

## Criterios y delegación

- C1/F16 → editor_fidelity: corpus Milkdown abrir/editar/pegar/deshacer/guardar/reabrir. Apertura sin edición conserva original; bloques no soportados se conservan/protegen antes de una pérdida; flujo visual de una columna, sin raw como editor principal. Ámbito features/editor y notas relacionadas.
- C2/F05 → history_restore: restauración de formatos/recursos a ruta revisada como nueva versión, sin cambiar índice ajeno ni perder borradores; acuse durable y consulta sin replay; previsualización por capacidad. Ámbito history_restore, version_history, features/history y versions.
- C3/F08 → ai_reversion: cambios IA por operación/proyecto/documento con before/after, captura anterior al efecto, reversión directa/selectiva y conflicto explícito cuando hay solapamiento; manual posterior disjunto conservado. Reversión como borrador revisable; fuente/versiones anteriores conservadas. Ámbito ai_change_history y propietarios IA/nuevos componentes AI.
- C4/F02 → coordinador: reemplazo literal revisado entre documentos seleccionados, borradores y archivos conservados, resultados por documento y recuperación/undo condicionado a bases. El reemplazo local Milkdown mantiene una transacción de deshacer; no se promete regex o revisión global sin límites.
- C5/transversal → coordinador: contratos/rutas/App, inventarios/admisión/portabilidad como datos cuando proceda, pruebas agrupadas, revisión final, backlog50/cobertura70 y reporte visual.

## Separación de archivos

Cada subagente tiene sus módulos/componentes/tests exclusivos. Coordinador posee lib.rs, api_routes.rs, App.tsx, stores comunes de inventario/cuotas, runtime_dispatch/operations si hacen falta y documentación. Cambios en archivos compartidos solo por coordinador, después de recibir contratos. Una sola ejecución Cargo simultánea; no UI nativa Windows, no Gradle sin cambio de entorno, ningún acceso a owner.lock/runtime-owner.lock/capture.lock.

## Trabajo

- [x] Fidelidad editorial y corpus.
- [x] Restauración documental revisada.
- [x] Trazabilidad y reversión IA.
- [x] Reemplazo entre documentos.
- [x] Integración, pruebas dirigidas y revisión conjunta.
- [x] Backlog y reporte visual.


## Cierre verificado

36casos nativos y68frontend únicos correctos; solo repetición de objetivos invalidados. TypeScript/build final y Rust/Tauri Android cruzado correctos.13capturas573–585;0errores/conexiones externas/overflow,44px y contraste6,61:1 en aviso. Tandas nativas secuenciales y ámbitos de agentes exclusivos; revisión independiente final sin incidencias concretas abiertas. [Reporte completo](avance-133.md).

Desarrollo local completado dentro de C1–C5. P10 conserva aceptación instalada/física y regresión general al terminar todo el programa; T17 real sin gasto sigue aplazado. No se da por cerrada toda la3.0, no commit/push/publicación/instalación ni cambio de VERSION. Doctor SDD unbound; no instalación ni migración.
