# Avance 01 · Ejecución del programa 3.0
30/10/2026 · Rama `codex/v3-programa` · [Resumen visual](avance-01.html)

## Autoridad
El usuario ha ordenado ejecutar el plan completo, incluidos sus paquetes y ampliaciones, manteniendo experiencia de usuario y producto como criterios de aceptación. Se registra autorización de implementación y consolidación local dentro de ese alcance. No se interpreta como publicación automática ni como autorización de un presupuesto IA ilimitado.

## Implementado en este corte
- **P07, parcial:** variante compacta para la ventana de bandeja, preparada/grabando/pausa, una fila por fuente, tiempo y acciones en cabecera, sesiones plegadas inicialmente y lista con desplazamiento independiente.
- Ajustes/Abrir gestor enlazados a la ventana principal mediante evento Tauri; misma sesión y comandos del controlador existente. Detalles conserva privacidad y descarte con confirmación; operaciones, reproducción, destino y retención del historial se mantienen.
- Ventana inicial 420×260, mínimo 360×240; expansión hasta 480 de altura y reposicionamiento dentro del área de trabajo. Esta geometría requiere aceptación nativa/DPI.
- **P03, parcial:** componente ModalFrame con aislamiento del fondo, foco inicial, ciclo Tab/Shift+Tab, Escape respetando composición de texto y devolución de foco. Crear documento adopta anchura fluida y altura limitada al viewport.
- **P00, parcial:** ejecución de regresión y nuevas comprobaciones críticas de componentes. No se han realizado aún mediciones completas de rendimiento ni sesiones de usuarios.

## Comprobación ejecutada
- Frontend: **340 pruebas / 70 archivos, sin fallos**, después de añadir casos de grabación y modal.
- Compilación TypeScript/Vite: superada; persiste aviso de chunks grandes, a investigar en T10. No se considera fallo de compilación.
- `cargo check`: superado. Grabación Rust: **9 pruebas sin fallos**.
- Suite Rust workspace: **133 pruebas superadas, 0 fallos y 0 ignoradas**, resultado recogido.
- Playwright sin Browser plugin: componente servido en 127.0.0.1:1420. Flujo Iniciar→Pausar→Continuar→abrir sesiones→desplazar lista. La posición de Parar se mantiene exactamente antes/después del scroll; lista 297 px y contenido 1281 px en la comprobación a 420×520.
- Crear documento: a 390×844, formulario x=12, ancho=366; Escape cierra. Prueba de foco/aislamiento/retorno automatizada.
- Capturas de grabación con adaptador de API de prueba inyectado exclusivamente en navegador; no se ha simulado en producción ni se acredita captura nativa de audio.
- Las capturas de implementación sustituyen al render conceptual como evidencia visual de este corte. Falta aceptación Windows, Android, DPI, periféricos y lectores de pantalla.

## Estado global
| Paquete | Estado |
|---|---|
| P00 | En curso: pruebas; corpus/medición/piloto pendientes |
| P01 | Pendiente |
| P02 | Pendiente |
| P03 | En curso: base modal y creación; shell/tres paneles pendientes |
| P04 | Pendiente |
| P05 | Pendiente |
| P06 | Pendiente |
| P07 | En curso: compacto implementado; aceptación nativa, refinamiento de historial y ampliaciones pendientes |
| P08 | Pendiente |
| P09 | Pendiente |
| P10 | Pendiente |

**Ningún paquete se declara completado.** No hay un porcentaje global significativo todavía: son cortes parciales y tienen tamaños distintos. El programa completo permanece en ejecución.

## Pendientes inmediatos
1. Suite Rust recogida; diff sin errores de espacios. Verificar los ajustes geométricos en Windows nativo.
2. Aceptación de bandeja en Windows: abrir/cerrar con sesión activa, cambiar entrada en pausa, desconectar dispositivo, monitor/DPI, vínculo a ajustes/gestor y conservación de audio.
3. Contratos de estado/actividad P01 y componentes P03 antes de extender el shell.
4. Completar línea base/corpus P00 e implementar después las verticales de edición, recuperación/lotes y ajustes según el plan.
5. Extender el patrón modal a los demás diálogos; no dar por resuelto U01/U02 por un formulario.

Sin commit, integración ni publicación en este corte. Las capturas y logs se conservan en output; los cambios de producto están en el workspace.
