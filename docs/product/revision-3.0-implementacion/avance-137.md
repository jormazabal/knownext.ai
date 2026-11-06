# Avance137 · Bloque9: copias programadas

[Reporte visual](avance-137.html) · [Criterios y reparto](bloque-137.md) · [Contratos](../../architecture/scheduled-project-backups.md) · [Backlog](backlog.csv).

Implementación coordinada con tres subagentes reales y ámbitos independientes: servicio Rust/empaquetado, API/tipos y panel/controlador de ajustes. El coordinador integra rutas, colas, planificador nativo, protección del trabajo abierto, restauración por identidad exacta e inventarios.

La programación diaria es optativa y permanece desactivada de inicio. Funciona mientras el proceso está activo, aunque ajustes estén cerrados. No crea servicios del sistema ni llamadas IA. Las copias son paquetes portables del trabajo guardado, con inclusión opcional de datos privados persistidos; no se presentan como espejo exacto del equipo.

El cursor durable impide repetir una generación tras perder su acuse. Las copias parciales, desconocidas o alteradas no autorizan eliminar la última copia buena. La retención exige consentimiento y una copia posterior verificada de alcance suficiente. Con el historial lleno puede usar la copia compatible más reciente revalidada como ancla, que siempre se conserva, para liberar un registro antes de crear la siguiente generación. Un origen ausente o cambiado no activa programación: la historia conocida puede recuperarse con revisión explícita como proyecto nuevo, sin sustituir el original.

## Verificación

22 casos nativos únicos aprobados:12 de copias,3 de cupos,4 de archivo privado,2 de clasificación/rutas y1 de rutas portables. Una aserción inicial usaba la posición del recibo en vez de su generación; se corrigió y se repitió sólo esa prueba y los casos afectados por la admisión final. Las compilaciones detenidas antes de las pruebas se conservan como evidencia, sin contabilizarlas como resultados correctos.

54 casos frontend únicos aprobados:17API,23panel/controlador/ajustes/transferencia y14inventarios/cupos. Sólo se repitieron interacciones invalidadas por cambios concretos. TypeScript y build de producción correctos; los textos finales de retención se comprobaron con prueba focal y captura621 actualizada. Rust/Tauri aarch64-linux-android correcto con NDK28.2.13676358; sin errores,10avisos condicionales preexistentes y7m26s incluyendo recompilación de dependencia por toolchain. Sin Gradle ni instalación. Sin suites completas durante el desarrollo.

Ocho capturas620–627 de los componentes y el controlador reales con API controlada: programación desactivada, revisión avanzada, activación explícita, historial, restauración parcial e histórica, acuse incierto, confirmación por consulta y origen ausente. Sin puente Tauri simulado, proveedores, peticiones externas, errores ni desbordamiento horizontal. Controles de al menos44px; escritorio1280 y móvil320. Estas capturas no son aceptación instalada.

## Continuación

Siguen el cierre de UX (bloque10), rendimiento/corpus y regresión final (bloque11). La validación física y de la aplicación instalada conserva su estado pendiente en P10. T17 real sigue aplazado por la decisión de no gastar en IA. Sin publicación, instalación, commit, push ni cambio de VERSION2.6.0.


Logs: output/v3-backup-block-native-closing.log; output/v3-backup-block-native-affected.log; output/v3-backup-block-build.log; output/v3-backup-block-typescript-final.log; output/v3-backup-block-android.log; output/v3-block9-scheduled-backups-sdk.log; output/v3-block9-backup-ui.log; output/v3-block9-backup-ui-race.log; output/v3-block9-backup-ui-draft.log; output/v3-block9-backup-transfer-ui.log; output/v3-block9-backup-settings-entry.log; output/v3-backup-block-inventory-frontend.log. Matriz y huellas: output/v3-backup-block-verification.json.
