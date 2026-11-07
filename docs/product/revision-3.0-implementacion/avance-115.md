# Avance115 · Inventario común y presupuesto de nuevas preparaciones

[Reporte visual](avance-115.html) · [Plan](plan.md).

F04/F06/F17/T02/T08: Recuperación incorpora Copias y límites. El inventario mide metadatos de15 familias, incluidas carpetas mixtas sin recibo, entradas de formato desconocido y copias originales/compactadas. No lee su contenido ni coordinación; no sigue enlaces. Identidades de fila estables, asociación solo a proyectos registrados y revisión de bytes mediante el servicio existente cuando la carpeta mixta tiene identidad válida. Los tamaños no autorizan restauración ni borrado.

Hasta50.000 entradas,2.000 grupos y3 segundos por consulta; cobertura, enlaces, inaccesibles y asociación de proyectos se muestran explícitamente. Lo no recorrido no se considera vacío. Excluye copias/papeleras dentro de carpetas de proyectos y otros almacenes ajenos al alcance declarado. No mide capacidad libre.

Presupuesto opcional de16MiB a8GiB, desactivado inicialmente. Se aplica al alta de selecciones/preparaciones mixtas, recibos y nuevas copias de combinación. Admisión serializada durante su publicación local, con margen conservador; una medición incompleta o capacidad insuficiente rechaza nuevas preparaciones. Guardado, borradores, conservación del trabajo abierto y continuación de trabajo ya conservado no usan esta puerta. No es una cuota absoluta de todo el disco ni una reserva frente a programas externos/guardados excluidos. Otros productores y cuotas de identidades siguen pendientes; no hay podas ni reutilización de IDs.

Política local recovery-policy.json formato1 con revisión SHA y generación creciente. Cambiarla exige la revisión vigente; formato futuro/no regular se preserva y no se sustituye por valores por defecto. Las respuestas inciertas se consultan sin reenviar. La UI pagina grupos, filtra familias y muestra el alcance antes de confirmar.

Verificación agrupada: dos contratos Rust públicos temporales pasan. Inventario sin recibo, extracción legible real, formato desconocido intacto, revisión obsoleta de política, combinación pequeña bajo cuota, negativa antes de nuevo recibo, guardado ordinario bajo cuota agotada y nueva combinación después de ampliar presupuesto. Siete casos frontend/SDK nuevos y TypeScript correctos. Sin suites completas o proveedor.

App/centro/panel/formulario y diálogo de extracción reales con adaptadores API controlados: una única escritura explícita con acuse perdido y consulta posterior, filtro y revisión de una carpeta sin recibo, estado parcial y pie a320x560. Capturas494–498 inspeccionadas, sin errores ni red externa. El fixture no ejecuta selector, extracción, borrado ni efectos nativos; contratos Rust acreditan por separado el almacenamiento temporal real. Revisión original y consulta retornan sin continuación.

Evidencia: output/v3-recovery-inventory-final-contract.log; output/v3-recovery-inventory-ui.log; output/v3-recovery-inventory-types.log; output/v3-recovery-inventory-browser-evidence.json.

Pendientes: retención permanente de conflictos/otras familias, cuotas de identidades y productores restantes, inventarios externos y portabilidad integral de historial/audio/borradores/preferencias, además del resto del programa. Android/SAF continúa pendiente por bloqueo previo Java/Gradle; T17 real aplazada sin gasto. Sin commit, instalación o publicación; VERSION2.6.0.
