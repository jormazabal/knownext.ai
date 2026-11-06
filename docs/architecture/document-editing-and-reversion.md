# Edición documental y reversión

Contrato de la entrega133; Tauri/Rust local, React despacha intención y Milkdown sigue siendo el editor visual. VERSION2.6.0 no cambia. Tres subagentes reales con ámbitos separados implementaron fidelidad, historial y reversión IA; el coordinador integró rutas, autoridad, reemplazo e inventarios.

## Fidelidad y estado vivo

Abrir/seleccionar no publica la normalización del parser. Se conserva el Markdown original hasta edición real y al deshacer al estado base. Frontmatter YAML/TOML y definiciones de referencia se presentan como metadatos compactos protegidos. Pegado rico no representable se bloquea antes del parser; el usuario puede elegir texto plano, sobre la selección/documento original y con una transacción de deshacer. El editor principal conserva un único flujo visual.

Una operación IA reserva el documento antes de preparar su journal; captura la instantánea viva de Milkdown antes del acuse, sin esperar el debounce. Editores abiertos, aunque estén ocultos en otra pestaña, usan su controlador. Guardar/autosave no se adelantan al journal. Época de proyecto, permisos, visita/base, propuesta y revisión del borrador se verifican después de esperas y antes del efecto. Acuses tardíos no recrean sesiones ni sustituyen texto manual posterior. Notas personales conservan su propio undo; el journal de proyecto no se les atribuye.

## Restauración histórica

`/api/projects/:id/history-restores`: catálogo GET, `/review` POST, `/preview` POST, aplicación POST y `/:attempt` GET. Se revisan ruta, versión, fuente, disco, borrador y HEAD; la fuente puede seguir un renombre o el punto portable de consulta. Publicación con índice temporal y commit hijo/CAS de HEAD. Nunca se ejecuta Git desde React ni se hace checkout. El índice del usuario se conserva byte a byte: al avanzar HEAD puede mostrar diferencias relativas al nuevo commit, incluso para la ruta restaurada. No se limpia preparación previa por cuenta propia.

Origen hasta32MiB; imagen/PDF/PNG de nota hasta8MiB de vista previa. Otros binarios se restauran sin prometer visor. Almacén `history-restores/<sha256-proyecto>/<history-restore-id>` con64intentos/256MiB. Se retienen copias anterior/origen y borrador privado. Publicación parcial o sin confirmación exige consulta, nunca replay. Git nativo Android sigue no disponible; su capacidad se declara explícitamente.

## Cambios IA y reversión

`/api/documents/:id/ai-changes/prepare|apply`, `/api/projects/:id/ai-changes`, `/:change`, `/:change/review|revert|page-preview` y DELETE explícito del payload. El runtime registra procedencia local y before/after antes de aplicar. La procedencia correlaciona la operación del espacio de trabajo; no es firma ni autenticación de un proveedor. Git previo es metadato opcional: no impide editar sin Git Android.

Markdown y JSON de nota hasta2MiB; hasta128hunks con diff acotado. Mayor complejidad exige revisión completa, sin selección truncada. Reversión por bloques/páginas conserva cambios posteriores disjuntos; solapamientos/ambigüedad bloquean y requieren resolución. La resolución Markdown manual exige segunda confirmación y conserva la copia actual. Creación intacta se envía a Papelera; se revalida su fuente tras persistir el intento. Revalidaciones de fuente/disco/borrador inmediatamente antes del efecto reducen carreras; no prometen CAS del sistema de archivos frente a procesos externos.

Almacén global de perfil `ai-changes`:64payloads activos/128MiB,2048identidades,16acuses por operación y40MiB por registro. Retirar copias termina la posibilidad de reversión de esa operación, conserva identidad/huellas/acuses y documento. No hay caducidad automática. Cambiar una referencia de imagen no borra el recurso generado; operaciones de biblioteca tienen su propio flujo. No hay reversión universal de efectos externos ni de historial anterior sin journal.

## Reemplazo entre documentos

`/api/projects/:id/document-replacements`: catálogo GET, `/review` POST, aplicar POST, `/:attempt` GET y `/:attempt/undo` POST. Selección explícita de1–32Markdown únicos del proyecto, texto literal sensible a mayúsculas; query1–256bytes, sustitución hasta4096bytes,2MiB/documento,16MiB por revisión,10000coincidencias/documento. Exceso o formato no compatible falla sin truncar.

Solo se escriben borradores privados; archivos guardados/Git permanecen. Revisión ligada a raíz canónica/disco/borrador; el hash excluye la fecha volátil updatedAt. Recibo durable antes de efectos, parcial explícito por documento y copias consultables. Deshacer exige que todos los borradores/archivos sigan sobre la base posterior; cualquier cambio manual impide sobrescribir. Consulta no repara ni ejecuta. Almacén por hash de proyecto con64intentos/128MiB; recibo máximo64MiB. No se promete atomicidad multidocumento.

## Inventario, portabilidad y autoridad

Las tres familias se miden en recuperación y cupos. Antes de metadata se excluyen los nombres de coordinación; no se abren ni inspeccionan sus archivos. Links/futuros/incoherencias no conceden autoridad. El archivo privado conserva procedencia como `Edicion/*.bin` con mapa/huellas `Edicion/LEEME.json`, `dataOnly:true`, `runtimeAdoption:false`. Importar no activa recibos, permisos ni operaciones; el paquete documental los excluye. Las generaciones anteriores permanecen. La consulta de catálogo no ejecuta recuperación.

Mutaciones usan la autoridad por proyecto y el checkpoint/recarga del espacio existente. Un resultado incierto libera la vista para reconciliar con almacenamiento; comprobar consulta el mismo intento con protección y recarga. Lecturas de revisión/vista previa van por snapshot independiente, manteniendo cambios serializados. Windows/Android son apps locales autónomas, sin proceso auxiliar ni servidor de producto.

## Validación y límites de entrega

Contratos dirigidos de rutas públicas/estado, componentes, SDK y Milkdown; campaña Chrome con API controlada y App real para fidelidad. No proveedores/gasto IA ni UI nativa Windows. Build de producción y Rust/Tauri Android cruzado no equivalen a aceptación instalada. P10 conserva regresión final, pruebas físicas, IME/portapapeles, lectores/recursos externos y corpus representativo; T17 real permanece aplazado por decisión del usuario. Ver avance133 y su evidencia para resultados ejecutados.
