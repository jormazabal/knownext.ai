# Bloque127 · Cierre funcional de operaciones y transiciones protegidas

Padre: [P01](P01/tarea.md). T01/T02/T03/T04/T05/T13/T14/T15. Autoridad: petición del usuario de completar Fiabilidad y continuidad; sin proveedores de pago, suites completas durante desarrollo, instalación o publicación.

Aceptación de este corte: una petición se inicia una vez; espera agotada no equivale a cancelación; solo una cancelación confirmada en cola afirma no inicio; observar no modifica; las vías independientes no esperan el bloqueo de documentos; últimas ediciones se protegen después de descargar y antes de instalar; cierre efectivo requiere ACK del trabajo; otras ventanas no inician captura durante una reserva de actualización/cierre; diagnóstico acotado sin contenido; publicación atómica sin truncamiento; extracción de servicios conserva contratos.

Alcance del paquete completo no se reduce. P01-C1 se amplía con publicación/durabilidad; C2 con resultado desconocido y protección de revisiones vivas; C3 con cola/observación, salida y actualización sin replay; C4 conserva los formatos/migraciones existentes y documenta procedimiento integral. La aceptación física, fallos compuestos, familias/precondiciones y ampliaciones restantes permanecen en backlog.

Ventanas de protección: el intervalo periódico del modelo publicado sigue siendo5s más latencia hasta ACK; entrada aún no publicada/IME y terminación abrupta no se prometen durables. La última protección antes de actualización/cierre captura entrada pendiente y verifica su ACK; un fallo impide la transición. Cancelar una investigación ya enviada no demuestra que el proveedor haya detenido el cómputo; la actividad en segundo plano sigue bloqueando instalación hasta terminar.
