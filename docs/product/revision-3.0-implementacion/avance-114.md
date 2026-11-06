# Avance114 · Recuperación, espacio y traslado desde el centro común

[Reporte visual](avance-114.html) · [Plan](plan.md).

F04/F06/F07/F17/U08: Recuperación incorpora Proyectos y Espacio. Se elige el proyecto de las copias sin cambiar el espacio abierto. El catálogo local de selecciones mixtas se consulta mediante GET, independiente de la revisión remota. Proyecto/versión/fecha, IDs únicos, revisión, límites64 selecciones/256 rutas y avisos se validan en el SDK. Catálogos parciales no se presentan como completos y las entradas desconocidas permanecen intactas.

Revisar una preparación permite conocer su fase y acceder a los diálogos ya implementados de respaldo completo, compactación, retirada local revisada y extracción legible si falla la consulta. Este centro no ofrece aplicar archivos ni continuar una combinación. Las operaciones conservan su revisión/confirmación propia. Cerrar un diálogo vuelve a consultar, sin repetir su mutación. Cambiar de proyecto desmonta su ámbito y descarta respuestas anteriores.

El traslado enlaza la exportación nativa existente para el proyecto elegido. Explica que incluye archivos guardados/recursos y que borradores, historial completo, grabaciones y preferencias necesitan sus copias propias. Espacio reutiliza la medición local y limpieza segura de metadatos de vistas; no mide, abre selector, exporta o limpia al entrar.

Verificación agrupada: un contrato Rust nuevo del GET local sin Git/remoto, inventario vacío sin crear carpeta e inventario desconocido parcial sin modificar originales; seis casos frontend nuevos de ámbito/consulta/revisión/enlaces/SDK y carga de categorías. TypeScript correcto, incluido el contrato compartido en types/mixedRecovery.ts. Se reutilizan contratos y resultados vigentes de los diálogos de respaldo, retirada, compactación y transferencia; sin repetir sus suites ni campañas completas.

App/centro/selector/diálogo de respaldo/panel de espacio reales, con adaptadores de lectura controlados. Capturas489–493 inspeccionadas en escritorio y móvil320; respaldo revisado una vez, consultas de preparación dos (entrada y vuelta), selección de B sin cambiar proyecto activo A, sin detalle anterior. Pie completo a320x560; sin errores ni red externa. No se ejecutan exportación, limpieza, selector nativo ni aceptación instalada en el fixture.

Evidencia: output/v3-recovery-center-catalog-contract.log; output/v3-recovery-center-ui.log; output/v3-recovery-center-types.log; output/v3-recovery-center-final-types.log; output/v3-recovery-center-browser-evidence.json. El build nativo dirigido se realiza una vez para la entrega, sin cambios del registro Tauri ni suite completa.

Pendientes: inventario completo entre familias y preparaciones previas al catálogo, retención permanente de otras familias/cuotas globales y traslado integral de historial/audio/borradores/preferencias. Otros productores internos, ampliaciones funcionales/UX y regresión final continúan. Android/SAF sigue sin compilar por el bloqueo Java/Gradle; campaña IA real aplazada sin gasto. Sin commit, instalación o publicación; VERSION2.6.0.
