# Avance107 · Respuestas de la sesión actual

[Reporte visual](avance-107.html) · [Plan](plan.md).

T01/T03/U07/U09/U11: capacidades/versionado, cambios externos, sincronización, actividad y resumen por archivo publican solo en el proyecto y visita que inició la lectura. Cada superficie admite únicamente su lectura más reciente. Cambiar de proyecto limpia su resumen antes de confirmar la vista nueva; volver al mismo ID no revive callbacks anteriores.

`ProjectWork` y `useProjectWork` separan propiedad visual/admisión del componente. Importar cambios, traer/enviar versiones y actualizar protección tienen admisión inmediata por proyecto, previa al siguiente render. El trabajo admitido puede terminar aunque se cambie de proyecto; el nuevo permanece utilizable. Volver al proyecto con trabajo pendiente no duplica la solicitud. El cierre de una operación antigua no libera otra ni cambia los indicadores/ventanas del proyecto actual. Unmount/remontaje invalida la propiedad visual; no se anuncia cancelación nativa.

Tres casos dirigidos verifican lecturas fuera de orden, superficies independientes, cambio/retorno, admisión doble, proyectos distintos, liberación repetida, arranque sin proyecto y desmontaje/remontaje. TypeScript final correcto. App real con Milkdown, selector y panel, API de resumen controlada: se retienen consultas para soltarlas en otro proyecto y en otra visita al mismo; tres lecturas A/una B, tres liberaciones, sin fuga, errores o red externa. Capturas454–457 inspeccionadas. El adaptador web de desarrollo no implementa este endpoint; el fixture declara explícitamente su respuesta y no acredita Git, proveedor o app instalada.

Sin Rust adicional ni suites completas. Continúan precondiciones de publicación del historial, coordinación de otros trabajos y resto del programa. Sin gasto IA, instalación, candidata o publicación.

Backlog y cobertura conservan50 y70 IDs únicos. Sin cierre global del programa. VERSION2.6.0; Android/SAF sigue pendiente de compilar por el bloqueo Java/Gradle previo documentado en104. T17 real sigue aplazada por decisión de no gasto.
