# Avance 02 · Espacio de trabajo, ajustes e integridad
30/10/2026 · Rama `codex/v3-programa` · [Resumen visual](avance.html)

## Implementado
- **P03:** centro documental con laterales independientes; Navegación y Contexto pueden ocultarse sin desmontar el editor. El derecho alterna Asistente, Historial y Buscar/secciones. Se conserva un solo compositor, montado al ocultar o cambiar de auxiliar.
- Preferencias de navegación y fijación guardadas mediante el contrato de configuración existente, sin guardar prompts en disco. Borrador, modo y profundidad de IA en memoria por proyecto/documento; finalizaciones tardías no limpian texto nuevo de otra revisión.
- Fondo integrado, divisores de redimensionado visibles al interactuar, texto documental de 15 px y filas del árbol de 32 px (44 en puntero táctil). Se conserva el zoom del editor y las paletas elegidas; naranja funcional más oscuro en la línea elegida.
- Árbol con jerarquía semántica y navegación por flechas, Inicio/Fin, Enter y menú por teclado. Diálogo Mover sobre ModalFrame, adaptable y con protección contra doble envío.
- **P06:** ajustes en la superficie de trabajo, categorías laterales y selector móvil; acceso desde cabecera y entrada contextual a IA. Vista avanzada por categoría, con divulgación técnica inicial para índice y visión; el cambio de vista no altera los valores.
- **P01:** escritura compartida en módulo Rust que prepara y sincroniza un temporal y reemplaza sin eliminar previamente el original. Documentos, JSON crítico, notas y configuración usan esta base; fallos de guardado se propagan.
- Guardado público de Markdown/libreta comprueba la huella recibida y devuelve 409 al divergir. Respuestas tardías conservan nuevas ediciones y trazos; se evita doble envío simultáneo por documento.
- **P02:** módulo de rutas con comprobación léxica y del ancestro canónico; rechazo de escapes, rutas de unidad y metadatos Git. Mutaciones rechazan IDs de otro proyecto y el ID de raíz. Crear/duplicar no truncan archivos existentes; renombrar/mover comprueban colisión.
- **P04:** índice de títulos y búsqueda/reemplazo literal sobre el modelo ProseMirror de Milkdown; navegación, recuento, reemplazo individual/todas y deshacer. Se limita reemplazo a conjuntos de hasta 1000 coincidencias para no aplicar un lote parcial inadvertido.

## Verificación ejecutada
- **350 pruebas frontend / 73 archivos**, sin fallos.
- **145 pruebas Rust del workspace**, sin fallos ni ignoradas; incluye **74 pruebas de almacenamiento**.
- Compilación TypeScript/Vite superada; permanece el aviso de chunks grandes, pendiente T10.
- Árbol/Mover/sesiones: pruebas focalizadas; la jerarquía del árbol se recorre por teclado.
- Integridad: escritura parcial y reemplazo fallido conservan el original; JSON/configuración/notas comunican errores; guardar con huella antigua conserva archivo externo y borrador; crear/renombrar no sobrescribe colisiones; IDs ajenos/raíz y rutas privadas se rechazan.
- Las pruebas de enlaces simbólicos Unix están condicionadas a esa plataforma. En Windows se han ejecutado las comprobaciones léxicas; la aceptación específica de junctions/reparse points requiere ampliación. El guardado verifica la base antes de escribir; no se declara una garantía de compare-and-swap frente a programas externos no cooperativos.
- Playwright en 1440×900: editor se mantiene al ocultar paneles; buscar→reemplazar todas→Ctrl+Z restituye el contenido anterior.
- Ajustes: superficie de 1440×864 bajo la barra de ventana de 36 px. En 390×844, anchura y scrollWidth son 390. Cambio de categoría, vista avanzada y Escape contrastados.
- Capturas del producto renderizado con un proyecto web-dev de prueba. No constituyen aceptación nativa Windows/Android, pruebas con proveedor IA ni sesión de usuarios. No se han realizado llamadas de generación facturables.
- Base técnica para archivos: [std::fs::rename](https://doc.rust-lang.org/std/fs/fn.rename.html) y [File::sync_all](https://doc.rust-lang.org/std/fs/struct.File.html#method.sync_all). La durabilidad completa ante apagado físico y el tratamiento de ACL/formatos de sistema de archivos requieren la validación restante; no se afirma inmunidad a cualquier fallo físico.

## Qué sigue pendiente
| Paquete | Estado real y siguiente tramo |
|---|---|
| P00 | En curso: mediciones de rendimiento, corpus completo, observación de usuarios y aceptación nativa pendientes |
| P01 | En curso: extender contratos/errores/cancelación, migración, ciclo de vida y separar trabajos largos; comprobar interrupciones reales |
| P02 | En curso: credenciales nativas, CSP/permisos, política de datos/retención, autoridad IA y corpus adverso completo pendientes |
| P03 | En curso: referencias y propiedades contextuales, foco de retorno, preferencias por contexto y aceptación de lectores/tacto pendientes |
| P04 | En curso: corpus de fidelidad, trazabilidad/reversión IA y superficies especializadas pendientes; búsqueda/secciones implementadas |
| P05 | Pendiente: papelera, restauración y lotes seguros antes de habilitar borrado múltiple |
| P06 | En curso: extender simplificación avanzada a todas las categorías, recuperar errores por formulario y completar primer uso |
| P07 | En curso desde avance 01: aceptación nativa, continuidad y ampliaciones de audio/manuscrito pendientes |
| P08 | Pendiente |
| P09 | Pendiente |
| P10 | Pendiente |

**Ningún paquete completo se da por cerrado.** La escritura se protege antes de ampliar concurrencia; el guardado por documento continúa serializado mientras se completa su procesamiento posterior, a revisar en T04. El borrador IA conserva texto y opciones; el aislamiento completo de fuentes por borrador sigue pendiente. La aplicación continúa usando VERSION 2.6.0 hasta preparar la futura release.

## Próximo corte
Papelera verificable sin Git y restauración con colisiones, contratos de lote y conservación de borradores antes de exponer selección múltiple destructiva. Continuar endurecimiento de rutas y cobertura de superficies; las limitaciones de aceptación no bloquean trabajo independiente.

Sin commit, integración ni publicación. [Avance anterior](avance-01.md).
