# KnowNext.ai 3.0 — catálogo de mejoras para decisión

Fecha: 30 de octubre de 2026. Revisión 3: revisión crítica del conjunto, seis líneas explícitas y alcance/prioridad afinados. Base inspeccionada: versión local 2.6.0, commit `b6ef84c7`. Estado: propuesta de análisis; ninguna mejora está aprobada para implementación por este documento.

**Conclusión de la revisión**

KnowNext.ai ya tiene una base funcional amplia y coherente con un espacio documental local: Milkdown, proyectos, archivos, borradores, historial y restauración, GitHub, IA contextual, investigación, Mermaid, notas manuscritas, adjuntos y grabaciones. La oportunidad de 3.0 es consolidar fiabilidad, autonomía y facilidad de uso, y escoger después las ampliaciones que más mejoren el trabajo documental. No propongo reemplazar Tauri/Milkdown ni introducir un servidor o proceso auxiliar de producto.

El catálogo contiene **50 propuestas: 17 técnicas, 17 funcionales y 16 de UX/UI**. Distingue defectos observados, riesgos deducidos del código y nuevas capacidades. Una carencia no se infiere de una captura aislada. Las referencias apuntan a la base local revisada; no representan comprobación del estado publicado en GitHub.

**Revisión crítica 3 — líneas que faltaban y decisiones de conjunto**

El catálogo cubría muchas superficies, pero todavía era más sólido como inventario que como propuesta ejecutable de versión. Faltaban criterios de conservación del contenido y calidad de IA; otras responsabilidades estaban dispersas entre varias fichas. Esta revisión incorpora **seis líneas explícitas** y revisa las 44 anteriores. Algunas líneas se extraen de propuestas existentes para darles un criterio de aceptación propio; no representan seis carencias completamente nuevas ni trabajo adicional independiente.

| Línea incorporada | Motivo y resultado esperado | Prioridad / esfuerzo | Relación con lo ya propuesto |
|---|---|---|---|
| F16. Fidelidad documental | Conservar el contenido al abrir, pegar, editar y guardar; tratar construcciones no soportadas | P1 / L; P0 ante pérdida reproducida | Complementa F02 y F13; reutiliza corpus T11 |
| T15. Continuidad de sesión | Recuperación comprobada ante suspensión, cierre y actualización, también con trabajos activos | P1 / L; P0 ante pérdida reproducida | Extrae coordinación de T02/T03/T12; ya hay protección de borradores |
| T16. Autoridad de la IA | Diferenciar lo que puede leer de lo que puede modificar y validar cada acción | P1 / L; P0 ante escape demostrado | Extrae de T09 la autorización; aprovecha permisos existentes |
| T17. Calidad real de la IA | Evaluar seguimiento de instrucciones, fidelidad, evidencia, coste y latencia | P1 / M inicial | Completa tests de contrato T11; no implica llamadas reales en esta revisión |
| F17. Ciclo de vida de datos/proyectos | Entender retirar, revincular, eliminar, conservar y limpiar almacenamiento | P1 / L | Une decisiones de producto; reutiliza papelera, privacidad y retención de audio |
| U16. Validación con usuarios | Comprobar que simplificar mejora tareas y no oculta acciones necesarias | P1 / M inicial | Proporciona evidencia para U13/U05/U15/F15; no añade otra pantalla |

**Correcciones al enfoque anterior.** Los valores de impacto se concentraban en 4–5 y no bastan para ordenar trabajo. La matriz añade naturaleza, paquete principal, condición para priorizar y revisión individual. No se inventan frecuencia de uso, ahorro ni precisión económica. P0 se limita al problema/recorrido concreto: no convierte todas las ampliaciones de una ficha en obligatorias. La confianza sobre el código no prueba automáticamente frecuencia, gravedad ni preferencia de usuarios.

F15 pasa de L a una reserva **XL**, porque su alcance seguro incluye referencias, recuperación, borradores, resultados parciales y aceptación nativa. Se divide en selección/plan, mover dentro del proyecto y papelera; exportación, duplicación, arrastre múltiple y traslado entre proyectos siguen fuera del mínimo. U01 sube de riesgo bajo a medio por afectar componentes modales compartidos. U15 conserva plegado/abierto/fijado, pero la altura ajustable se aplaza; U05 prioriza jerarquía, estados y revelado avanzado antes que búsqueda. Son simplificaciones del propio plan de simplificación.

**Mapa de decisiones y secuencia propuesta.**

1. **Caracterizar antes de comprometer:** corpus F16, interrupciones T15, alcance IA T16, capacidades nativas T12, línea base de rendimiento T10 y tareas U16. Preparar el corpus IA T17; las ejecuciones facturables necesitan un presupuesto separado. Producir decisiones y ensayos acotados, no una fase indefinida de auditoría.
2. **Base de confianza:** resolver problemas confirmados de integridad/seguridad, migración recuperable y contratos necesarios. Establecer qué significa borrador protegido, archivo guardado y operación terminada. Diseñar F04 antes de habilitar borrado por lote.
3. **Núcleo visible:** U13/U04/U15 para escribir, F15 para organizar y U05/U06 para configurar; aplicar U01/U02/U03/U09/U10/U11/U12 a esos recorridos. Prototipar el conjunto y luego entregar cortes completos, sin esperar a una reescritura general.
4. **Ampliaciones por utilidad demostrada:** búsqueda F01 y navegación F02 tienen relación directa con trabajo documental. Plantillas, favoritos, actas, OCR, investigación y portabilidad compiten por capacidad disponible; no son condiciones automáticas para llamar 3.0 a la versión.
5. **Piloto y salida:** comprobar actualización desde 2.6, recuperación, corpus documental, recorridos nativos y uso prolongado. Registrar límites conocidos y aceptación. Mantener los requisitos firmados de distribución existentes; este análisis no prepara una release.

**Líneas consideradas sin crear más iniciativas.** Integración con el sistema (abrir/compartir/importar, Atrás, permisos revocados, asociaciones de archivo), energía/temperatura en uso sostenido y protección de dependencias/artefactos se incorporan al inventario T12, medición T10 y gate T11. No se afirma que cada integración falte: hay que inventariar su comportamiento real antes de proponerla. Ayuda y descubrimiento permanecen en U06/U08/U12. Colaboración en tiempo real, cuentas propias, servidor de sincronización, plugins de terceros y más proveedores quedan fuera de la recomendación actual: falta una necesidad validada y podrían aumentar significativamente el alcance o alterar la arquitectura local-first.

**Límites de esta revisión.** Se han releído las 44 fichas y contrastado rutas de editor, borradores, actualización, permisos IA, eliminación de proyectos y retención de audio. No se ha hecho una nueva sesión visual, ensayo de pérdida de datos, ataque reproducido, prueba con proveedor ni estudio con usuarios. Las pruebas de la revisión inicial siguen siendo la evidencia histórica indicada más abajo. Las seis líneas nuevas son propuestas con hipótesis y aceptación explícitas.

**Antecedente: revisión del catálogo tras las aportaciones del usuario**

La propuesta de producto para 3.0 pasa a centrarse en **escribir con menos interferencias, organizar documentos con seguridad y entender la aplicación sin dominar toda su configuración**. Las cuatro aportaciones del usuario se incorporan como candidatas explícitas: asistente plegable/fijable (U15), operaciones sobre selección múltiple (F15), diseño integral más limpio (U13) y ajustes habituales/avanzados (U05). Se conservan los identificadores anteriores para facilitar la comparación.

La primera revisión detectó problemas y oportunidades, pero su recomendación acumulaba demasiadas iniciativas P1 y algunas fichas mezclaban corrección, mejora y ampliación. Esta revisión acota una primera entrega para cada propuesta y separa las ampliaciones. Investigación, actas enriquecidas, portabilidad integral y referencias avanzadas pasan a P2: son opciones valiosas, pero todavía no hay evidencia de uso que justifique situarlas por delante de los flujos diarios señalados por el usuario. La prioridad sigue siendo una recomendación, no una aprobación.

| Aportación | Decisión de diseño recomendada | Riesgo que debe resolver | Valoración revisada |
|---|---|---|---|
| Prompt IA ocupa demasiado | Plegado por defecto; apertura explícita; fijación opcional en escritorio | Perder el borrador o aplicar una petición a otro documento al cambiar de pestaña | U15 · P1 · 5/5 · L |
| Acciones sobre varios archivos/carpetas | Selección múltiple y, primero, mover/enviar a papelera | Borrados irrecuperables, carpetas duplicadas en el lote, referencias y cambios pendientes | F15 · P1 · 5/5 · XL; depende de recuperación F04 |
| Diseño más limpio y profesional | Rediseño de jerarquía, navegación y componentes comunes, aplicado también a estados y diálogos | Ocultar funciones importantes, sustituir texto útil por iconos ambiguos o perder densidad de trabajo | U13 · P1 · 5/5 · L |
| Configuración sencilla y avanzada | Vista habitual por defecto y detalles avanzados dentro de la misma estructura y modelo | Valores activos ocultos, cambios involuntarios al alternar vistas y controles duplicados | U05 · P1 · 5/5 · L |

**Criterio crítico común.** Reducir presencia permanente no significa reducir capacidades. La simplificación debe conservar la posibilidad de descubrir una acción, entender sus consecuencias y recuperar errores. No se propone una nueva pantalla inicial llena de tarjetas, otra capa de navegación general, un modo experto independiente ni abrir el asistente automáticamente al seleccionar texto. El siguiente paso de diseño, si estas líneas se seleccionan, sería contrastar prototipos de los mismos recorridos y estados; este documento no constituye un rediseño visual ya validado.

**Método y cobertura**

Se revisaron estructura del repositorio, componentes y estado de aplicación, frontera React/Tauri, crates Rust de almacenamiento, documentos, IA, skills, investigación, dibujo y grabación, configuración de seguridad, adaptación por plataforma, updater, workflow de release y documentación. Se siguieron rutas representativas de entrada, validación, persistencia y salida, con mayor profundidad en guardado, credenciales, permisos, exportación, contratos y concurrencia. No es una revisión línea a línea de cada archivo ni una prueba de penetración.

El recorrido visual utilizó la aplicación de desarrollo ya disponible, con datos web existentes, en navegador interno: escritorio 1280×720 y 1280×800, tableta 768×1024 y ventana estrecha 390×844. **Una ventana web estrecha no equivale a Android**: no se emuló el runtime nativo, el teclado virtual, el tacto, los permisos, la suspensión ni un stylus real. No se editaron documentos ni se guardaron ajustes. Se abrieron/cerraron paneles y se validó el ejemplo Mermaid sin insertarlo.

| Superficie | Evidencia actual | Límite de esta revisión |
|---|---|---|
| Proyectos, árbol y pestañas | Código, tests y navegación visual; ajustes de proyecto abiertos | No se crearon/borraron proyectos reales |
| Milkdown, creación y Mermaid | Código, tests, capturas y validación local de ejemplo | No se probó edición prolongada ni todos los bloques |
| Borradores, guardado, historial y sincronización | Contratos Rust/TS, pruebas y estados UI | El panel web no tiene el endpoint completo; no es un fallo nativo demostrado |
| IA, skills, RAG, uso e investigación | Código, contratos/tests y estado sin clave | Sin llamadas facturables, credenciales reales ni evaluación factual de informes |
| PDF/DOCX/XLSX, imágenes y exportación | Servicios, componentes, tests y ramas por plataforma | Sin corpus nativo completo ni comparación visual de exportaciones Android |
| Notas manuscritas | Modelo, editor, render, OCR disponible en esquema y tests | Sin aceptación de lápiz/palma/latencia en hardware |
| Audio y grabación | Servicio y puente nativo, tests, limitaciones 2.6 y panel web | Panel web bloquea captura nativa; no se grabó ni se transcribió audio real |
| Ajustes y responsive | Capturas de escritorio/móvil y revisión de código | Sin auditoría completa NVDA/TalkBack ni medición integral de contraste |
| Distribución y actualizaciones | Adaptadores, configuración, workflow y checks locales | Sin publicación, instalación, firma o prueba real de actualización en esta sesión |

**Verificación ejecutada**

Las pruebas y capturas siguientes pertenecen al análisis inicial sobre la misma base 2.6.0. Las revisiones segunda y tercera modifican únicamente el catálogo y su matriz; no vuelven a ejecutar pruebas de aplicación ni acredita aceptación de los comportamientos propuestos.

- `pnpm test`: **69 archivos / 335 pruebas aprobadas**.
- `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --workspace`: **133 pruebas aprobadas**; doc-tests sin fallos.
- `pnpm build`: TypeScript y Vite correctos. Advertencia de chunks superiores a 500 kB; chunk principal de 1.668,13 kB minificado / 461,56 kB gzip. No se midió el arranque en hardware de referencia.
- `node scripts/check-version.mjs`: coherencia de los manifests comprobados con 2.6.0.
- `node scripts/check-client-bundle-clean.mjs`: paquete frontend limpio según su comprobador; no constituye inspección de instaladores.
- No se ejecutó `cargo check` separado ni el gate íntegro de release, no se construyó/publicó una candidata y no se acreditó aceptación humana.

Logs: [pruebas frontend](C:/Dev/knownext.ai/output/playwright/revision-3.0/frontend-tests.log), [pruebas Rust](C:/Dev/knownext.ai/output/playwright/revision-3.0/rust-tests.log) y [build frontend](C:/Dev/knownext.ai/output/playwright/revision-3.0/frontend-build.log).

**Cómo interpretar la valoración**

- **Impacto 1–5**: 5 protege datos/seguridad o mejora un flujo central; 4 aporta valor frecuente; 3 mejora complementaria. Es juicio de producto, no medición de usuarios.
- **P0**: recomendaría resolver o acotar explícitamente antes de una 3.0 estable por integridad, seguridad o funciones básicas incompletas. **P1**: candidato principal para 3.0. **P2**: mejora valiosa a seleccionar según presupuesto. Estas prioridades no autorizan trabajo.
- **Esfuerzo S/M/L/XL**: S, cambio acotado; M, varios componentes o un servicio; L, varios dominios y validación nativa; XL, iniciativa que debe dividirse. Incluye implementación, pruebas y documentación de la primera entrega propuesta. En T12, F13 y F15 se mantiene una reserva XL hasta resolver la incertidumbre nativa; la modularización integral de T01 también podría alcanzar XL. No equivale a días ni a presupuesto cerrado.
- **Riesgo**: riesgo de introducir regresiones al implementar, no gravedad del hallazgo. **Confianza**: solidez de la evidencia actual.
- La valoración se afinará al seleccionar alcance, plataforma mínima, casos de uso y dispositivos. Las propuestas relacionadas comparten trabajo: **no se deben sumar como iniciativas independientes**.

**Aspectos técnicos — 17 propuestas**

| ID | Propuesta | Prioridad | Impacto | Esfuerzo | Riesgo |
|---|---|---|---|---|---|
| T01 | Dividir los núcleos de aplicación por responsabilidades | P1 | 5/5 | L | Alto |
| T02 | Persistencia resistente a interrupciones y errores | P0 | 5/5 | L | Alto |
| T03 | Evitar sobrescrituras por edición simultánea y respuestas tardías | P0 | 5/5 | L | Alto |
| T04 | Desacoplar operaciones largas del bloqueo global | P1 | 5/5 | L | Alto |
| T05 | Contratos tipados y errores/cancelación coherentes | P1 | 4/5 | L | Medio |
| T06 | Proteger claves y tokens con almacenamiento seguro nativo | P0 | 5/5 | M | Alto |
| T07 | Activar CSP y delimitar permisos por ventana/comando | P0 | 5/5 | M | Medio |
| T08 | Endurecer rutas, importaciones y límites de recursos | P0 | 5/5 | L | Medio |
| T09 | Definir y aplicar la política de datos enviados y retenidos por IA | P0 | 5/5 | L | Medio |
| T10 | Medir y optimizar arranque, documentos grandes y consumo de memoria | P1 | 4/5 | L | Medio |
| T11 | Pruebas de integración y controles continuos antes de la release | P1 | 5/5 | L | Medio |
| T12 | Hacer verificables las capacidades nativas de Windows y Android | P1 | 5/5 | XL | Alto |
| T13 | Diagnóstico útil, acotado y sin contenido privado | P1 | 4/5 | M | Medio |
| T14 | Migraciones y documentación coherentes para pasar a 3.0 | P1 | 4/5 | M | Medio |
| T15 | Continuidad de sesión ante suspensión, cierre y actualización | P1 | 5/5 | L | Alto |
| T16 | Separar contexto IA de autoridad y validar el alcance de cada operación | P1 | 5/5 | L | Alto |
| T17 | Evaluación reproducible de calidad, coste y latencia de la IA | P1 | 4/5 | M | Bajo |

**T01. Dividir los núcleos de aplicación por responsabilidades**

**Situación y evidencia.** App.tsx tiene 6.097 líneas; AppSettingsDialog.tsx, 4.449; knownext-storage/lib.rs, 14.520, con el módulo principal de pruebas desde la línea 10.426. LocalApi reúne persistencia, Git, credenciales, IA, investigación, importación y configuración.

**Propuesta.** Extraer servicios Rust de proyectos/documentos, historial, credenciales y trabajos; separar hooks/controladores por flujo en React y secciones de ajustes. Hacerlo por cortes funcionales con contratos estables, conservando Tauri, React y Milkdown. No es una reescritura general ni requiere un gestor de estado nuevo.

**Alcance revisado.** **Primera entrega:** Extraer los dominios y controladores que se modifiquen en guardado, lotes y ajustes, conservando contratos y pruebas. **Ampliación:** Modularización integral de todos los servicios; esfuerzo total potencial XL.

**Valoración.** P1 · impacto 5/5 · esfuerzo L · riesgo de implementación alto. Confianza: alta.

**Criterio de aceptación.** Los dominios intervenidos tienen pruebas y contratos explícitos; los componentes visuales reciben estado e intenciones. Las extracciones no alteran contratos públicos sin migración ni obligan a reescribir dominios ajenos.

**Dependencias y relación.** Apoyarse en T05 y T11; dividir en entregas.

**Revisión crítica del conjunto.** Mantener extracción por flujos intervenidos. Medir reducción de acoplamiento y capacidad de probar servicios, no perseguir un tamaño arbitrario de archivo.

**Fuentes.** [apps/desktop/src/app/App.tsx](C:/Dev/knownext.ai/apps/desktop/src/app/App.tsx:284); [apps/desktop/src-tauri/crates/knownext-storage/src/lib.rs](C:/Dev/knownext.ai/apps/desktop/src-tauri/crates/knownext-storage/src/lib.rs:22); [apps/desktop/src/features/settings/AppSettingsDialog.tsx](C:/Dev/knownext.ai/apps/desktop/src/features/settings/AppSettingsDialog.tsx).

**T02. Persistencia resistente a interrupciones y errores**

**Situación y evidencia.** save_document usa fs::write; write_json también escribe directamente. write_json_atomic elimina el original antes de renombrar el temporal. read_json convierte errores de lectura o JSON inválido en valores por defecto; varias escrituras descartan el error.

**Propuesta.** Unificar una primitiva de guardado duradero: temporal único en el mismo volumen, sincronización, sustitución segura, copia recuperable y propagación de errores. Separar archivo inexistente de archivo corrupto. Conservar el borrador hasta confirmar la escritura. Aplicar también a configuración, notas y registro de proyectos.

**Alcance revisado.** **Primera entrega:** Guardado recuperable y errores explícitos en documentos y estado crítico. **Ampliación:** Extender la primitiva a toda persistencia secundaria tras inventariarla.

**Valoración.** P0 · impacto 5/5 · esfuerzo L · riesgo de implementación alto. Confianza: alta.

**Criterio de aceptación.** Inyectar falta de espacio, denegación de acceso y corte entre pasos: siempre queda el original o una copia recuperable; nunca se comunica guardado correcto si falla la persistencia.

**Dependencias y relación.** Base de F04 y F07; coordinar con T03.

**Revisión crítica del conjunto.** Separar durabilidad de archivo, estado y operación compuesta. T15 coordina interrupciones; F04 recuperación de borrados; ningún temporal garantiza atomicidad de un lote.

**Fuentes.** [apps/desktop/src-tauri/crates/knownext-storage/src/lib.rs](C:/Dev/knownext.ai/apps/desktop/src-tauri/crates/knownext-storage/src/lib.rs:859); [apps/desktop/src-tauri/crates/knownext-storage/src/lib.rs](C:/Dev/knownext.ai/apps/desktop/src-tauri/crates/knownext-storage/src/lib.rs:1533); [apps/desktop/src-tauri/crates/knownext-storage/src/lib.rs](C:/Dev/knownext.ai/apps/desktop/src-tauri/crates/knownext-storage/src/lib.rs:2301).

**T03. Evitar sobrescrituras por edición simultánea y respuestas tardías**

**Situación y evidencia.** React envía baseFingerprint y force al guardar, pero save_document no los comprueba. Tras await, handleSave sustituye markdown por la respuesta y marca isDirty=false. El historial ya distingue borradores y cambios externos, pero falta cerrar este contrato de concurrencia.

**Propuesta.** Validar la versión base en Rust justo antes del guardado; devolver conflicto estructurado. Asociar cada guardado a una revisión del editor: si el usuario siguió escribiendo, actualizar solo la base guardada y mantener su nuevo borrador. Aplicar la misma protección a .knote y cambios IA.

**Alcance revisado.** **Primera entrega:** Control de versión en guardado y aplicación de resultados; conservar borradores ante divergencias. **Ampliación:** Coordinación más amplia entre varias instancias y combinación automática.

**Valoración.** P0 · impacto 5/5 · esfuerzo L · riesgo de implementación alto. Confianza: alta en código; reproducción concurrente pendiente.

**Criterio de aceptación.** Guardar A, editar B antes de recibir la respuesta: B permanece pendiente. Cambiar el archivo desde fuera entre carga y guardado: se ofrece resolución y no se pisa silenciosamente.

**Dependencias y relación.** T02 y T05; habilita F06 y F08.

**Revisión crítica del conjunto.** Definir identidad estable o mapeo explícito al mover, versión base y orden de resultados. Necesario también para prompt oculto, pestañas y acciones concurrentes.

**Fuentes.** [apps/desktop/src/app/App.tsx](C:/Dev/knownext.ai/apps/desktop/src/app/App.tsx:2518); [apps/desktop/src-tauri/crates/knownext-storage/src/lib.rs](C:/Dev/knownext.ai/apps/desktop/src-tauri/crates/knownext-storage/src/lib.rs:1533); [apps/desktop/src/app/documentSessions.ts](C:/Dev/knownext.ai/apps/desktop/src/app/documentSessions.ts).

**T04. Desacoplar operaciones largas del bloqueo global**

**Situación y evidencia.** Los comandos local_api_request y local_api_content usan spawn_blocking, pero conservan el mismo Mutex<LocalApi> durante handle/content. Una interacción IA normal ejecuta llamadas síncronas; los trabajos de investigación ya muestran un patrón de ejecución en segundo plano.

**Propuesta.** Reducir el bloqueo a lecturas/actualizaciones de estado y usar exclusión por recurso donde sea necesaria. Ejecutar red, Git y conversiones fuera del bloqueo global, con trabajos acotados, cancelación y progreso. Mantener todo dentro del runtime local.

**Alcance revisado.** **Primera entrega:** Medir esperas y retirar del bloqueo global los trabajos que afecten a edición/guardado; preservar orden por recurso. **Ampliación:** Planificador general con prioridades para todas las capacidades.

**Valoración.** P1 · impacto 5/5 · esfuerzo L · riesgo de implementación alto. Confianza: alta.

**Criterio de aceptación.** Una consulta IA lenta o una exportación no impide guardar otro documento ni leer el estado. Pruebas concurrentes verifican que dos escrituras del mismo recurso siguen serializadas.

**Dependencias y relación.** T02–T03 antes de ampliar concurrencia.

**Revisión crítica del conjunto.** Medir antes de introducir un planificador. Una operación lenta no debe impedir guardar otro documento; mantener serialización cuando comparten recurso.

**Fuentes.** [apps/desktop/src-tauri/src/lib.rs](C:/Dev/knownext.ai/apps/desktop/src-tauri/src/lib.rs:16); [apps/desktop/src-tauri/src/lib.rs](C:/Dev/knownext.ai/apps/desktop/src-tauri/src/lib.rs:136); [apps/desktop/src-tauri/crates/knownext-storage/src/lib.rs](C:/Dev/knownext.ai/apps/desktop/src-tauri/crates/knownext-storage/src/lib.rs:4161).

**T05. Contratos tipados y errores/cancelación coherentes**

**Situación y evidencia.** El adaptador ofrece genéricos TypeScript, pero recibe JSON sin validación de esquema en esa frontera; Rust usa extensamente serde_json::Value. ApiRequestInit declara timeoutMs, que requestJson no aplica. No hay una cancelación general de invoke.

**Propuesta.** Definir DTO y códigos de error por dominio, validar entrada y salida y comprobar compatibilidad en CI. Hacer explícitos timeout, cancelación e identificador de operación en Rust; distinguir cancelar la espera de cancelar el trabajo. Eliminar campos de transporte heredados cuando dejen de tener uso.

**Alcance revisado.** **Primera entrega:** Tipar errores, IDs y estados terminales de los flujos intervenidos; cancelación solo donde sea efectiva. **Ampliación:** Homogeneizar el resto de contratos sin cambios de producto innecesarios.

**Valoración.** P1 · impacto 4/5 · esfuerzo L · riesgo de implementación medio. Confianza: alta.

**Criterio de aceptación.** Un payload inválido produce un error de dominio predecible; un timeout no deja la UI en pendiente indefinidamente; TS y Rust rechazan la misma colección de contratos inválidos.

**Dependencias y relación.** Fundamento de T01, T04 y U12.

**Revisión crítica del conjunto.** Unificar IDs, errores y estados terminales en los flujos elegidos. Distinguir cancelar, detener nuevos pasos y resultado desconocido para no prometer reversión.

**Fuentes.** [apps/desktop/src/lib/api/client.ts](C:/Dev/knownext.ai/apps/desktop/src/lib/api/client.ts:45); [apps/desktop/src/lib/api/ai.ts](C:/Dev/knownext.ai/apps/desktop/src/lib/api/ai.ts:40); [apps/desktop/src/types/domain.ts](C:/Dev/knownext.ai/apps/desktop/src/types/domain.ts).

**T06. Proteger claves y tokens con almacenamiento seguro nativo**

**Situación y evidencia.** credentials_path apunta a credentials.json; update_credentials lo serializa con write_json. La clave OpenAI y el token GitHub se insertan como valores del JSON. No se inspeccionaron credenciales reales ni se acredita una filtración.

**Propuesta.** Migrar los secretos mediante servicios Rust a protección respaldada por el sistema operativo en Windows y Android, o a una bóveda con gestión segura de su clave. El JSON solo conserva referencias y estado público. Diseñar migración verificable, revocación y exclusión de backups/diagnósticos.

**Alcance revisado.** **Primera entrega:** Migración recuperable de claves/tokens al almacén nativo, con lectura, actualización y borrado verificados. **Ampliación:** Rotación o gestión empresarial si aparece una necesidad real.

**Valoración.** P0 · impacto 5/5 · esfuerzo M · riesgo de implementación alto. Confianza: alta.

**Criterio de aceptación.** Tras migrar con una credencial sintética, no aparece en JSON, logs ni exportaciones; se puede usar, sustituir y revocar sin devolverla a React. Los fallos de migración mantienen recuperación controlada.

**Dependencias y relación.** T02 y T14; F07 debe excluir secretos.

**Revisión crítica del conjunto.** La estimación M es provisional hasta probar almacenes Windows/Android y migración. No borrar el secreto anterior hasta comprobar recuperación y no exponerlo en UI/logs.

**Fuentes.** [apps/desktop/src-tauri/crates/knownext-storage/src/lib.rs](C:/Dev/knownext.ai/apps/desktop/src-tauri/crates/knownext-storage/src/lib.rs:813); [apps/desktop/src-tauri/crates/knownext-storage/src/lib.rs](C:/Dev/knownext.ai/apps/desktop/src-tauri/crates/knownext-storage/src/lib.rs:2298); [apps/desktop/src-tauri/crates/knownext-storage/src/lib.rs](C:/Dev/knownext.ai/apps/desktop/src-tauri/crates/knownext-storage/src/lib.rs:6516).

**T07. Activar CSP y delimitar permisos por ventana/comando**

**Situación y evidencia.** tauri.conf.json declara csp:null. Las ventanas main y recordings comparten capabilities de escritorio. Mermaid ya se inicializa con securityLevel strict: hay una protección que conviene preservar.

**Propuesta.** Definir una CSP compatible con el protocolo local, imágenes, fuentes y workers necesarios; separar permisos de la miniventana y del espacio principal; revisar autorización de los comandos propios y sus rutas. Validar enlaces y contenido importado con pruebas adversarias.

**Alcance revisado.** **Primera entrega:** Verificar la superficie accesible y aplicar CSP/permisos mínimos compatibles con los flujos reales. **Ampliación:** Aislamiento adicional de ventanas según amenazas demostradas; no se afirma explotación actual.

**Valoración.** P0 · impacto 5/5 · esfuerzo M · riesgo de implementación medio. Confianza: alta sobre configuración; no hay exploit demostrado.

**Criterio de aceptación.** Contenido de prueba no ejecuta scripts ni inicia navegación/protocolos no permitidos; PDF, Mermaid, imágenes y audio siguen funcionando en la aplicación empaquetada.

**Dependencias y relación.** T05, T08 y pruebas nativas T11.

**Revisión crítica del conjunto.** Validar exposición y regresión antes de fijar restricciones. P0 exige resolver/acotar el riesgo; no significa explotación demostrada.

**Fuentes.** [apps/desktop/src-tauri/tauri.conf.json](C:/Dev/knownext.ai/apps/desktop/src-tauri/tauri.conf.json); [apps/desktop/src-tauri/capabilities/default.json](C:/Dev/knownext.ai/apps/desktop/src-tauri/capabilities/default.json); [apps/desktop/src/features/editor/mermaidDiagrams.ts](C:/Dev/knownext.ai/apps/desktop/src/features/editor/mermaidDiagrams.ts:257).

**T08. Endurecer rutas, importaciones y límites de recursos**

**Situación y evidencia.** resolve_project_relative bloquea rutas absolutas y '..', pero no verifica el destino canónico frente a enlaces/junctions. La creación de transcripciones sí hace esa comprobación. extract_zip_xml_text lee las entradas XML completas; la frontera frontend transforma archivos completos a base64.

**Propuesta.** Centralizar validación de pertenencia al proyecto, incluyendo enlaces y destinos nuevos. Definir cuotas de bytes, expansión de ZIP, dimensiones de imagen, páginas y tiempo; rechazar archivos no compatibles antes de procesarlos. Usar acceso local acotado/por bloques para binarios grandes cuando proceda.

**Alcance revisado.** **Primera entrega:** Validar rutas y límites en importación, assets y lotes, con corpus de entradas adversas aislado. **Ampliación:** Ampliar fuzzing y corpus a todos los formatos; no se presume una intrusión.

**Valoración.** P0 · impacto 5/5 · esfuerzo L · riesgo de implementación medio. Confianza: alta en controles ausentes del camino inspeccionado; explotación no probada.

**Criterio de aceptación.** Pruebas con junctions, traversal, ZIP muy comprimido y archivos grandes son rechazadas sin modificar rutas externas ni agotar memoria; errores recuperables explican el límite.

**Dependencias y relación.** T05; complementa T10 y F14.

**Revisión crítica del conjunto.** Incluir archivos legítimos extremos y cancelación, además de entradas adversas. Coordinar rutas/límites con F15/F16/F17.

**Fuentes.** [apps/desktop/src-tauri/crates/knownext-storage/src/lib.rs](C:/Dev/knownext.ai/apps/desktop/src-tauri/crates/knownext-storage/src/lib.rs:1226); [apps/desktop/src-tauri/crates/knownext-storage/src/lib.rs](C:/Dev/knownext.ai/apps/desktop/src-tauri/crates/knownext-storage/src/lib.rs:98); [apps/desktop/src-tauri/crates/knownext-docs/src/lib.rs](C:/Dev/knownext.ai/apps/desktop/src-tauri/crates/knownext-docs/src/lib.rs:3488); [apps/desktop/src/lib/api/client.ts](C:/Dev/knownext.ai/apps/desktop/src/lib/api/client.ts).

**T09. Definir y aplicar la política de datos enviados y retenidos por IA**

**Situación y evidencia.** AGENTS.md condiciona persistir prompts a una política definida. ai_interaction construye eventos del usuario y append_ai_conversation_events los guarda localmente; hay RAG, adjuntos, investigación, audio y trazas. Esa divergencia necesita una decisión verificable, no asumir que todo permanece local.

**Propuesta.** Documentar y ejecutar políticas por tipo de dato: qué sale del equipo, cuándo se conserva, cuánto tiempo y cómo se elimina. Resolver la divergencia entre la regla de persistencia de prompts y los eventos de conversación existentes, incluyendo datos ya guardados y efecto sobre historial, índice y cachés. Añadir exclusiones de archivos y redacción de diagnósticos. La separación de contenido y autoridad, y la autorización de operaciones, se concretan en T16; no se duplican aquí.

**Alcance revisado.** **Primera entrega:** Definir y hacer visibles los datos enviados, retención y eliminación, sin añadir persistencia de prompts. **Ampliación:** Controles más finos por proyecto/proveedor después de concretar la política.

**Valoración.** P0 · impacto 5/5 · esfuerzo L · riesgo de implementación medio. Confianza: alta.

**Criterio de aceptación.** Un test con datos sintéticos verifica contexto enviado, historial, cachés, retención y eliminación local conforme a una política explícita; documentar qué eliminación externa no puede garantizar la app. Los datos existentes tienen tratamiento definido. T16 verifica que una fuente no amplía autoridad.

**Dependencias y relación.** T06–T08 y F17; T16 posee autorización de acciones y T17 calidad semántica. Soporta F08–F12 y U10.

**Revisión crítica del conjunto.** Separar privacidad de autorización T16. Resolver persistencia de conversación ya existente; la política debe cubrir eliminación y efectos en índice/cachés.

**Fuentes.** [AGENTS.md](C:/Dev/knownext.ai/AGENTS.md); [apps/desktop/src-tauri/crates/knownext-storage/src/lib.rs](C:/Dev/knownext.ai/apps/desktop/src-tauri/crates/knownext-storage/src/lib.rs:4147); [apps/desktop/src-tauri/crates/knownext-storage/src/lib.rs](C:/Dev/knownext.ai/apps/desktop/src-tauri/crates/knownext-storage/src/lib.rs:4161); [apps/desktop/src/lib/runtime/logging.ts](C:/Dev/knownext.ai/apps/desktop/src/lib/runtime/logging.ts).

**T10. Medir y optimizar arranque, documentos grandes y consumo de memoria**

**Situación y evidencia.** El build actual pasa pero genera index de 1.668,13 kB minificado, 461,56 kB gzip, y otros chunks de más de 500 kB. El árbol se aplana para cada búsqueda y el índice RAG se carga como JSON completo. Estos datos no equivalen por sí solos a lentitud percibida.

**Propuesta.** Establecer presupuestos de arranque, escritura, apertura y memoria con corpus pequeño/mediano/grande. Cargar ajustes, visores y herramientas pesadas bajo demanda; indexar incrementalmente; virtualizar listas que lo necesiten; reducir copias de binarios. Optimizar según perfiles medidos.

**Alcance revisado.** **Primera entrega:** Medir arranque, memoria y documentos grandes; corregir el cuello de botella confirmado y separar cargas pesadas si procede. **Ampliación:** Virtualización u otras optimizaciones solo con mediciones que las justifiquen.

**Valoración.** P1 · impacto 4/5 · esfuerzo L · riesgo de implementación medio. Confianza: alta sobre bundle; rendimiento de usuario pendiente de medir.

**Criterio de aceptación.** Publicar hardware y corpus representativo acordado, con arranque/apertura p50/p95, latencia de escritura, pico de memoria y consumo sostenido. Comparar antes/después y comprobar que paneles y trabajos no degradan la edición. Los corpus de 1.000/10.000 archivos son pruebas de estrés candidatas, no capacidad prometida.

**Dependencias y relación.** T04, T08 y T11; F01 aporta indexación.

**Revisión crítica del conjunto.** No fijar 10.000 archivos como contrato de producto sin validar uso. Publicar dispositivo, corpus, p50/p95, memoria y consumo sostenido; solo después presupuestos.

**Fuentes.** [apps/desktop/vite.config.ts](C:/Dev/knownext.ai/apps/desktop/vite.config.ts); [apps/desktop/src/features/documents/documentNameSearch.ts](C:/Dev/knownext.ai/apps/desktop/src/features/documents/documentNameSearch.ts); [apps/desktop/src-tauri/crates/knownext-storage/src/lib.rs](C:/Dev/knownext.ai/apps/desktop/src-tauri/crates/knownext-storage/src/lib.rs:6264).

**T11. Pruebas de integración y controles continuos antes de la release**

**Situación y evidencia.** Hay 335 pruebas frontend y 133 Rust aprobadas en esta revisión. El workflow encontrado en .github/workflows es de release, disparado por tags o ejecución manual. La simulación web no implementa file-sync-overview y no permite grabación nativa.

**Propuesta.** Añadir validación en PR con contratos, análisis estático, dependencias y pruebas de recorridos críticos. Mantener fixtures de desarrollo completos y claramente separados del producto; reservar una matriz nativa Windows/Android para guardado, actualizaciones, audio y stylus. Añadir corpus de conversión y pruebas de interrupción.

**Alcance revisado.** **Primera entrega:** Contratos y recorridos críticos de guardado, lotes, prompt, ajustes y exportación; aceptación nativa registrada. **Ampliación:** Matriz extensa de dispositivos y pruebas prolongadas de capacidades secundarias.

**Valoración.** P1 · impacto 5/5 · esfuerzo L · riesgo de implementación medio. Confianza: alta.

**Criterio de aceptación.** Cada PR detecta regresiones de contratos y diseño responsive; una candidata a 3.0 dispone de evidencia nativa fechada y no confunde mocks con aceptación real.

**Dependencias y relación.** Habilitador transversal; conservar el gate firmado existente.

**Revisión crítica del conjunto.** Conservar suites existentes y añadir gates por riesgo. T17 mide calidad IA; U16 utilidad; T15 interrupciones. Auditoría de dependencias y artefactos forma parte de este gate.

**Fuentes.** [.github/workflows/release.yml](C:/Dev/knownext.ai/.github/workflows/release.yml); [apps/desktop/vitest.config.ts](C:/Dev/knownext.ai/apps/desktop/vitest.config.ts); [docs/development/manual-test-checklist.md](C:/Dev/knownext.ai/docs/development/manual-test-checklist.md); [apps/desktop/src/lib/api/webDevLocalApi.ts](C:/Dev/knownext.ai/apps/desktop/src/lib/api/webDevLocalApi.ts).

**T12. Hacer verificables las capacidades nativas de Windows y Android**

**Situación y evidencia.** local_git_command invoca el ejecutable git, mientras el endpoint de capacidades devuelve canUseLocalGit=true. La exportación Markdown→PDF tiene una rama Android mínima. Compilar el APK no demuestra equivalencia de funciones.

**Propuesta.** Devolver capacidades reales por plataforma e instalación. Resolver el historial autónomo mediante biblioteca Rust donde no pueda dependerse de Git instalado, sin introducir un proceso auxiliar de producto. Establecer un contrato mínimo offline y pruebas reales de importación, exportación, suspensión, permisos y recuperación.

**Alcance revisado.** **Primera entrega:** Comprobar capacidades reales por plataforma, funcionamiento local sin procesos auxiliares y estados honestos; acotar brechas nativas. **Ampliación:** Paridad completa de Git y capacidades avanzadas solo tras una prueba técnica y dimensionamiento.

**Valoración.** P1 · impacto 5/5 · esfuerzo XL · riesgo de implementación alto. Confianza: alta en código; aceptación en dispositivos pendiente.

**Criterio de aceptación.** En instalación limpia y sin workstation se crea, edita, guarda y recupera documentación; solo se ofrecen capacidades disponibles. Historial/exportación cumplen el alcance declarado en cada plataforma.

**Dependencias y relación.** T05 y T11; F07 y F13.

**Revisión crítica del conjunto.** Separar autonomía exigida de paridad opcional. Inventariar integración nativa (abrir/importar/compartir, permisos, Atrás, enlaces y carpetas externas) antes de prometerla; no inferir ausencia por una búsqueda.

**Fuentes.** [apps/desktop/src-tauri/crates/knownext-storage/src/lib.rs](C:/Dev/knownext.ai/apps/desktop/src-tauri/crates/knownext-storage/src/lib.rs:328); [apps/desktop/src-tauri/crates/knownext-storage/src/lib.rs](C:/Dev/knownext.ai/apps/desktop/src-tauri/crates/knownext-storage/src/lib.rs:7788); [apps/desktop/src-tauri/crates/knownext-docs/src/lib.rs](C:/Dev/knownext.ai/apps/desktop/src-tauri/crates/knownext-docs/src/lib.rs:120); [docs/architecture/mobile-runtime.md](C:/Dev/knownext.ai/docs/architecture/mobile-runtime.md).

**T13. Diagnóstico útil, acotado y sin contenido privado**

**Situación y evidencia.** Existen trazas y diagnósticos, pero append_trace_log escribe message/detail directamente y algunos errores se muestran como cadenas técnicas. En web-dev se observa un endpoint completo en el error de sincronización; no es prueba de un fallo del servicio nativo.

**Propuesta.** Crear códigos estables, ID de correlación, duración por operación, clasificación recuperable/no recuperable y redacción central de secretos/contenido. Rotar logs y ofrecer un paquete de diagnóstico con vista previa y consentimiento para compartir.

**Alcance revisado.** **Primera entrega:** Diagnóstico de errores y operaciones con IDs, límites de tamaño/retención y exportación redactada. **Ampliación:** Telemetría opcional únicamente si hay una decisión de producto y privacidad.

**Valoración.** P1 · impacto 4/5 · esfuerzo M · riesgo de implementación medio. Confianza: alta.

**Criterio de aceptación.** Un fallo de guardado o IA se rastrea con su ID; un usuario puede exportar diagnóstico sin prompts, documentos, tokens ni rutas innecesarias. Los logs tienen límite de tamaño/retención.

**Dependencias y relación.** T05 y T09; U11–U12.

**Revisión crítica del conjunto.** Diagnóstico exportable y redactado, sin telemetría por defecto. Tener soporte útil antes del piloto; no crear un panel técnico permanente.

**Fuentes.** [apps/desktop/src-tauri/src/lib.rs](C:/Dev/knownext.ai/apps/desktop/src-tauri/src/lib.rs:97); [apps/desktop/src/lib/runtime/logging.ts](C:/Dev/knownext.ai/apps/desktop/src/lib/runtime/logging.ts); [apps/desktop/src/app/App.tsx](C:/Dev/knownext.ai/apps/desktop/src/app/App.tsx:3494).

**T14. Migraciones y documentación coherentes para pasar a 3.0**

**Situación y evidencia.** El frontend normaliza config a schemaVersion 4 y el almacenamiento Rust contiene schemaVersion 3. product-definition todavía declara investigación no disponible aunque 2.5.0 y el runtime la implementan. La matriz funcional conserva cabecera 2.2.0 junto a evidencias posteriores.

**Propuesta.** Establecer versiones de esquema explícitas y migraciones idempotentes con respaldo y recuperación. Consolidar una matriz de capacidades actual por plataforma y separar comportamiento vigente, histórico y pendiente. Automatizar comprobaciones del catálogo de comandos, configuración y manifests realmente sujetos a VERSION.

**Alcance revisado.** **Primera entrega:** Migración desde 2.6 recuperable, inventario de formatos y documentación de contratos tocados. **Ampliación:** Limpieza documental y migraciones de formatos no afectados en entregas posteriores.

**Valoración.** P1 · impacto 4/5 · esfuerzo M · riesgo de implementación medio. Confianza: alta.

**Criterio de aceptación.** Una copia sintética de 2.6 migra y reabre sin perder proyectos, borradores, historial ni ajustes; los documentos vigentes coinciden con capacidades verificadas y señalan límites por plataforma.

**Dependencias y relación.** T02, T05 y T11; prerrequisito de la candidata.

**Revisión crítica del conjunto.** Añadir compatibilidad de ida/migración y recuperación. No prometer que 2.6 pueda abrir datos ya migrados; una vuelta de versión puede requerir restaurar una copia compatible.

**Fuentes.** [apps/desktop/src/lib/api/config.ts](C:/Dev/knownext.ai/apps/desktop/src/lib/api/config.ts:300); [apps/desktop/src-tauri/crates/knownext-storage/src/lib.rs](C:/Dev/knownext.ai/apps/desktop/src-tauri/crates/knownext-storage/src/lib.rs:9985); [docs/product/product-definition.md](C:/Dev/knownext.ai/docs/product/product-definition.md); [docs/development/functional-validation-matrix.md](C:/Dev/knownext.ai/docs/development/functional-validation-matrix.md).

**T15. Continuidad de sesión ante suspensión, cierre y actualización**

**Situación y evidencia.** App.tsx persiste borradores en pagehide mediante llamadas asíncronas y dispone de otros mecanismos de guardado y flushPendingDrafts. handleInstallUpdate ya espera ese vaciado antes de instalar; updater.ts relanza Windows después. La documentación Android exige recuperación al pasar a segundo plano. No se ha demostrado en esta sesión pérdida al suspender: falta comprobar de forma conjunta documentos, notas, audio y trabajos largos.

**Propuesta.** Definir estados de ciclo de vida y puntos de persistencia confirmada en runtime, sin depender exclusivamente del último evento de la WebView. Mantener borradores periódicos recuperables y explicar la diferencia entre texto en memoria, borrador protegido y archivo guardado. Reconciliar al reabrir operaciones completadas, pendientes, fallidas o de resultado desconocido. Considerar grabación activa, edición durante la descarga de una actualización, cierre a bandeja, suspensión/reanudación y terminación forzada. Una petición IA o transcripción de resultado incierto no se reenvía automáticamente; ocultar la UI no equivale a terminar la operación. Declarar qué trabajo puede continuar realmente en cada plataforma, sin prometer ejecución en segundo plano que el sistema no garantice.

**Alcance revisado.** **Primera entrega:** Recorridos de interrupción de escritura/notas y actualización; reconciliación de trabajos existentes y señal de recuperación. Definir y medir la ventana máxima de cambios aún no protegidos. **Ampliación:** Reanudación avanzada de trabajos por etapas, cuando proveedor y plataforma lo permitan; continuidad entre dispositivos se trata en F07.

**Valoración.** P1 · impacto 5/5 · esfuerzo L · riesgo de implementación alto. Confianza: alta sobre mecanismos existentes; aceptación de interrupciones pendiente.

**Criterio de aceptación.** Interrumpir una copia de prueba antes/durante/después de la persistencia y comprobar el último borrador confirmado; medir y documentar cambios en memoria no recuperados. Cerrar/abrir y suspender/reanudar no duplican trabajos facturables. Actualizar con cambios durante la descarga y con audio activo tiene un resultado definido y verificable. Nunca comunicar guardado o finalización sin confirmación.

**Dependencias y relación.** T02–T05, T11–T14 y U09/U11. T02 asegura la escritura; T03 evita sobrescrituras; T15 coordina el ciclo de vida. No duplica F07 ni U07.

**Revisión crítica del conjunto.** Línea transversal antes dispersa: probar interrupciones y reconstrucción real de estado. No equivale a añadir un botón de recuperar ni a garantizar cero pérdida de memoria no persistida.

**Fuentes.** [App.tsx: pagehide](C:/Dev/knownext.ai/apps/desktop/src/app/App.tsx:844); [App.tsx: actualización](C:/Dev/knownext.ai/apps/desktop/src/app/App.tsx:3440); [updater.ts](C:/Dev/knownext.ai/apps/desktop/src/lib/runtime/updater.ts:141); [mobile-runtime.md](C:/Dev/knownext.ai/docs/architecture/mobile-runtime.md).

**T16. Separar contexto IA de autoridad y validar el alcance de cada operación**

**Situación y evidencia.** knownext-ai construye la petición con documento y fuentes de contexto, recibe runtimePermissions y tiene pruebas que bloquean edición sin permiso y acciones no soportadas. knownext-storage sustituye permisos de entrada por configuración del runtime. T09 ya mencionaba instrucciones maliciosas: se extrae esa responsabilidad para definir su validación propia. No se ha demostrado una explotación.

**Propuesta.** Distinguir fuentes que se pueden consultar, documentos que se pueden modificar y acciones autorizadas para la interacción. Adjuntar una referencia o recuperar un fragmento no debe conceder permiso para editarlo, acceder a otros proyectos o activar capacidades. Tratar el contenido documental/externo y la salida del modelo como datos sujetos a validación. Mantener decisión estructurada del LLM y comprobación determinista de tipo de operación, objetivo, pertenencia al proyecto, versión base y permisos antes de ejecutar, también para creación, imagen y dibujo. Los identificadores permitidos derivan del estado autorizado por el usuario, no de un texto del modelo. Conservar autoaplicación de cambios seguros dentro de alcance; revisar solo ampliaciones ambiguas o destructivas conforme a política. No introducir listas de palabras, regex de intención ni una confirmación universal.

**Alcance revisado.** **Primera entrega:** Inventario de entradas/salidas y matriz lectura/escritura/acción por interacción, más pruebas adversas de referencias e índices que intenten ampliar el alcance. **Ampliación:** Aislamiento adicional de capacidades y corpus adverso más extenso según exposición observada; no se promete inmunidad total a prompt injection.

**Valoración.** P1 · impacto 5/5 · esfuerzo L · riesgo de implementación alto. Confianza: alta sobre permisos y composición actuales; eficacia frente a corpus adverso pendiente.

**Criterio de aceptación.** Una referencia sintética con instrucciones de modificar otro proyecto no obtiene autoridad; una consulta de solo lectura no muta documentos; un resultado con destino inexistente, permiso revocado o base obsoleta no se aplica. Las ediciones autorizadas y válidas siguen siendo fluidas. Documentar alcance y resultados de la prueba, sin deducir seguridad por el mero cumplimiento del esquema JSON.

**Dependencias y relación.** T05, T08–T09, T03 y F08/U10. T09 conserva privacidad/retención; T16 posee autorización de acciones; T17 evalúa calidad de respuestas.

**Revisión crítica del conjunto.** Responsabilidad extraída de T09: aprovechar permisos existentes y acreditar ámbito por interacción; no declarar una vulnerabilidad sin reproducción.

**Fuentes.** [knownext-ai: construcción de contexto](C:/Dev/knownext.ai/apps/desktop/src-tauri/crates/knownext-ai/src/lib.rs:1093); [knownext-ai: bloqueo probado](C:/Dev/knownext.ai/apps/desktop/src-tauri/crates/knownext-ai/src/lib.rs:4297); [knownext-storage: permisos runtime](C:/Dev/knownext.ai/apps/desktop/src-tauri/crates/knownext-storage/src/lib.rs:4161); [OWASP: prevención de prompt injection](https://cheatsheetseries.owasp.org/cheatsheets/LLM_Prompt_Injection_Prevention_Cheat_Sheet.html).

**T17. Evaluación reproducible de calidad, coste y latencia de la IA**

**Situación y evidencia.** Existen pruebas de respuestas estructuradas, anclas, permisos y configuración. La matriz de validación también mantiene pruebas con proveedor real pendientes. Esas pruebas de contrato no miden por sí mismas si una respuesta conserva significado, sigue instrucciones o utiliza correctamente las fuentes. En esta revisión no se han realizado llamadas facturables.

**Propuesta.** Crear un corpus sintético o cedido expresamente de tareas representativas: resumir sin inventar, reescribir sin perder datos, editar solo el alcance pedido, responder con evidencia local, abstenerse si falta información y generar estructuras válidas. Separar validez del contrato, autorización T16 y calidad semántica. Versionar corpus, rúbrica, configuración, modelo y fecha; usar casos de referencia para desarrollo y otros reservados para validación. Medir éxito, cambios fuera de alcance, afirmaciones sin respaldo, latencia, tokens y coste observado/estimado. Repetir casos para registrar variabilidad y acompañar evaluación automática con revisión humana de muestras. Comparar modos rápido/razonamiento conforme a sus contratos; no ejecutar razonamiento o evaluación extra en cada petición del usuario.

**Alcance revisado.** **Primera entrega:** Corpus y rúbrica de escritura/consulta con unas decenas de casos como punto de partida, pruebas locales deterministas y protocolo de ejecución con proveedor y presupuesto explícitos. Fijar umbrales después de medir la base. **Ampliación:** Extender corpus a investigación, audio, dibujo y otros proveedores cuando esas capacidades se seleccionen; evaluación periódica de cambios de modelo.

**Valoración.** P1 · impacto 4/5 · esfuerzo M · riesgo de implementación bajo. Confianza: alta sobre cobertura de contrato; línea base de calidad inexistente en esta revisión.

**Criterio de aceptación.** Un cambio de prompt, skill, modelo o recuperación puede compararse con una ejecución fechada sobre la misma rúbrica; se muestran fallos y variabilidad, no solo una media. Si no se ejecuta proveedor real, el informe indica validación local y mantiene pendiente la calidad end-to-end. El corpus no contiene documentos privados de producción sin autorización.

**Dependencias y relación.** T09, T11, T16, F08–F10 y U10. T11 integra la infraestructura; T17 define evaluación semántica y presupuesto, sin duplicar la suite de contratos.

**Revisión crítica del conjunto.** Nuevo criterio de calidad: pruebas de contrato y simulaciones no acreditan respuestas útiles. Registrar variabilidad, coste, modelo y límites del ensayo.

**Fuentes.** [knownext-ai: pruebas estructuradas](C:/Dev/knownext.ai/apps/desktop/src-tauri/crates/knownext-ai/src/lib.rs:3575); [aiEditProposalApplication.test.ts](C:/Dev/knownext.ai/apps/desktop/src/app/aiEditProposalApplication.test.ts); [functional-validation-matrix.md](C:/Dev/knownext.ai/docs/development/functional-validation-matrix.md).

**Aspectos funcionales — 17 propuestas**

| ID | Propuesta | Prioridad | Impacto | Esfuerzo | Riesgo |
|---|---|---|---|---|---|
| F01 | Búsqueda global por contenido e índice local actualizado | P1 | 5/5 | L | Medio |
| F02 | Navegación por secciones y buscar/reemplazar en el documento | P1 | 4/5 | M | Medio |
| F03 | Plantillas documentales y de proyecto reutilizables | P2 | 4/5 | M | Bajo |
| F04 | Papelera y centro de recuperación con copias verificables | P0 | 5/5 | L | Alto |
| F05 | Historial orientado a hitos y comparaciones elegibles | P2 | 4/5 | M | Medio |
| F06 | Resolver conflictos con comparación y combinación asistida | P1 | 5/5 | L | Alto |
| F07 | Portabilidad y transferencia completa entre dispositivos | P2 | 5/5 | L | Alto |
| F08 | Trazabilidad y reversión de cambios realizados por IA | P1 | 5/5 | L | Alto |
| F09 | Presupuestos de IA por proyecto y uso comprensible | P1 | 4/5 | M | Medio |
| F10 | Investigaciones con evidencias verificables y revisión de fuentes | P2 | 4/5 | L | Medio |
| F11 | Convertir grabaciones en actas útiles y revisables | P2 | 5/5 | L | Alto |
| F12 | Hacer consultables las notas manuscritas mediante OCR revisable | P2 | 4/5 | L | Alto |
| F13 | Exportación íntegra y consistente entre plataformas | P0 | 5/5 | XL | Alto |
| F14 | Referencias, adjuntos y assets como conocimiento conectado | P2 | 4/5 | L | Medio |
| F15 | Selección múltiple y operaciones seguras sobre archivos y carpetas | P1 | 5/5 | XL | Alto |
| F16 | Fidelidad documental al abrir, pegar, editar y volver a guardar | P1 | 5/5 | L | Alto |
| F17 | Ciclo de vida del proyecto y control del almacenamiento local | P1 | 4/5 | L | Alto |

**F01. Búsqueda global por contenido e índice local actualizado**

**Situación y evidencia.** La búsqueda visible del árbol se limita al nombre y devuelve por defecto diez resultados. Ya existe RAG local, basado en fragmentos y coincidencia léxica, con reconstrucción; no debe presentarse como inexistente.

**Propuesta.** Extender la búsqueda a contenido, ruta, formato y fecha, con extractos y salto al fragmento. Actualizar el índice al guardar/mover/eliminar y señalar fuentes desactualizadas. Evaluar búsqueda semántica local solo si mejora un corpus de consultas reales.

**Alcance revisado.** **Primera entrega:** Buscar contenido local Markdown con extractos e índice actualizado al guardar/mover/borrar; incluir .knote cuando tenga texto disponible. **Ampliación:** Corpus PDF/OCR y búsqueda semántica si las consultas reales lo justifican.

**Valoración.** P1 · impacto 5/5 · esfuerzo L · riesgo de implementación medio. Confianza: alta.

**Criterio de aceptación.** Encontrar un término que solo está dentro de un documento; tras editarlo o borrarlo, los resultados se actualizan y no abren rutas obsoletas.

**Dependencias y relación.** T03, T10 y T14.

**Revisión crítica del conjunto.** Aclarar búsqueda global: proyecto activo como mínimo, otros proyectos solo mediante ámbito explícito. Excluir eliminados/privados según política y mostrar índice incompleto/desactualizado.

**Fuentes.** [apps/desktop/src/features/documents/documentNameSearch.ts](C:/Dev/knownext.ai/apps/desktop/src/features/documents/documentNameSearch.ts:13); [apps/desktop/src-tauri/crates/knownext-storage/src/lib.rs](C:/Dev/knownext.ai/apps/desktop/src-tauri/crates/knownext-storage/src/lib.rs:6136); [apps/desktop/src-tauri/crates/knownext-storage/src/lib.rs](C:/Dev/knownext.ai/apps/desktop/src-tauri/crates/knownext-storage/src/lib.rs:6264).

**F02. Navegación por secciones y buscar/reemplazar en el documento**

**Situación y evidencia.** Milkdown dispone de formato de títulos y edición visual, pero en la superficie revisada no aparece un índice navegable ni un flujo dedicado de búsqueda/reemplazo. Es una ampliación de productividad.

**Propuesta.** Añadir índice plegable de títulos, posición actual y salto a sección; buscar/reemplazar con coincidencias y vista previa antes de reemplazar todas. Mantener una sola columna de documento y no alterar bloques de código/enlaces sin una opción explícita.

**Alcance revisado.** **Primera entrega:** Índice de títulos y búsqueda/reemplazo acotado con vista previa y deshacer en documento activo. **Ampliación:** Consultas complejas o reemplazo entre documentos como decisión independiente.

**Valoración.** P1 · impacto 4/5 · esfuerzo M · riesgo de implementación medio. Confianza: media-alta.

**Criterio de aceptación.** En un documento largo se navega a una sección y se reemplazan coincidencias elegidas con una única operación de deshacer.

**Dependencias y relación.** T03; U04 y U07.

**Revisión crítica del conjunto.** Priorizar títulos y buscar/reemplazar del documento activo. Compartir fixtures con F16 y verificar deshacer, bloques de código y selecciones.

**Fuentes.** [apps/desktop/src/features/editor/MarkdownToolbar.tsx](C:/Dev/knownext.ai/apps/desktop/src/features/editor/MarkdownToolbar.tsx); [apps/desktop/src/features/editor/MarkdownEditor.tsx](C:/Dev/knownext.ai/apps/desktop/src/features/editor/MarkdownEditor.tsx).

**F03. Plantillas documentales y de proyecto reutilizables**

**Situación y evidencia.** Crear documento ofrece cuatro plantillas fijas: blanco, acta, requisitos y decisión. Ya existe configuración de plantilla de exportación, que tiene otra finalidad.

**Propuesta.** Permitir guardar documentos como plantillas, variables sencillas, vista previa y ámbito personal/proyecto. Añadir estructuras de carpetas y documentos para proyectos repetitivos, sin ejecutar código ni habilitar skills arbitrarias.

**Alcance revisado.** **Primera entrega:** Guardar y reutilizar una plantilla documental con variables sencillas y vista previa. **Ampliación:** Plantillas de proyectos completos y distribución de catálogos.

**Valoración.** P2 · impacto 4/5 · esfuerzo M · riesgo de implementación bajo. Confianza: alta.

**Criterio de aceptación.** Crear dos actas desde una plantilla conserva su estructura y pide solo los campos variables; exportar/importar plantillas no incluye secretos ni datos de ejemplo involuntarios.

**Dependencias y relación.** T02 y T08; U12.

**Revisión crítica del conjunto.** Plantilla documental reutilizable primero; estructura de proyecto después. No añadir mercado de plantillas ni ejecución de código.

**Fuentes.** [apps/desktop/src/features/documents/CreateDocumentDialog.tsx](C:/Dev/knownext.ai/apps/desktop/src/features/documents/CreateDocumentDialog.tsx:23); [apps/desktop/src/lib/api/config.ts](C:/Dev/knownext.ai/apps/desktop/src/lib/api/config.ts).

**F04. Papelera y centro de recuperación con copias verificables**

**Situación y evidencia.** Hay recuperación de borradores e historial, pero delete_node usa remove_file/remove_dir_all. Un documento sin historial no obtiene por ese camino una papelera propia. Recuperar una versión y recuperar un archivo borrado son necesidades distintas.

**Propuesta.** Introducir borrado recuperable con ruta original, fecha y retención; incluir carpetas y assets. Añadir copias locales verificadas y una vista que diferencie borradores, eliminados y restauraciones. No borrar el audio al restaurar/eliminar un Markdown salvo acción explícita.

**Alcance revisado.** **Primera entrega:** Papelera de proyecto con restauración verificable de archivos/carpetas, colisiones y retención explícita; funciona sin Git. **Ampliación:** Centro integral de recuperación, copias programadas y portabilidad F07.

**Valoración.** P0 · impacto 5/5 · esfuerzo L · riesgo de implementación alto. Confianza: alta.

**Criterio de aceptación.** Borrar una carpeta con documentos e imágenes y restaurarla conserva estructura y referencias; el flujo funciona también en proyectos sin Git.

**Dependencias y relación.** T02–T03, T08 y T14; relacionado con F07.

**Revisión crítica del conjunto.** Distinguir recuperación de copia de seguridad. Restaurar exige colisiones, referencias y protección de audios; acordar relación de papelera con Git y rutas externas.

**Fuentes.** [apps/desktop/src-tauri/crates/knownext-storage/src/lib.rs](C:/Dev/knownext.ai/apps/desktop/src-tauri/crates/knownext-storage/src/lib.rs:1412); [apps/desktop/src/features/documents/DocumentProtectionDialogs.tsx](C:/Dev/knownext.ai/apps/desktop/src/features/documents/DocumentProtectionDialogs.tsx).

**F05. Historial orientado a hitos y comparaciones elegibles**

**Situación y evidencia.** Ya existen historial local, visualización de contenido/diff y restauración como nueva versión. Las filas actuales muestran principalmente fecha y hash.

**Propuesta.** Añadir nombres y notas opcionales de hitos, filtros por documento/origen, comparación entre dos versiones elegidas y restauración parcial revisable. Agrupar cambios de una misma operación de usuario o IA sin mostrar ramas.

**Alcance revisado.** **Primera entrega:** Nombrar hitos y comparar dos versiones conservando restauración como nueva versión. **Ampliación:** Restauración parcial por bloques y agrupaciones sofisticadas.

**Valoración.** P2 · impacto 4/5 · esfuerzo M · riesgo de implementación medio. Confianza: alta.

**Criterio de aceptación.** Nombrar y elegir dos hitos permite entender qué cambió; restaurar una versión crea una nueva y no altera documentos ajenos. La restauración parcial se valida por separado si se selecciona.

**Dependencias y relación.** T03 y T12; F08 para operaciones IA.

**Revisión crítica del conjunto.** Separar hitos/comparación de restauración parcial. Reutilizar identificación de operaciones F08/F15, sin introducir ramas en UI.

**Fuentes.** [apps/desktop/src/features/versions/VersionHistoryPanel.tsx](C:/Dev/knownext.ai/apps/desktop/src/features/versions/VersionHistoryPanel.tsx:18); [apps/desktop/src/lib/api/versions.ts](C:/Dev/knownext.ai/apps/desktop/src/lib/api/versions.ts:19); [apps/desktop/src/app/App.tsx](C:/Dev/knownext.ai/apps/desktop/src/app/App.tsx:3371).

**F06. Resolver conflictos con comparación y combinación asistida**

**Situación y evidencia.** El espacio Guardado y sincronización ya distingue estados locales, historial y GitHub y tiene acciones por archivo/lote. La mejora es resolver divergencias de forma comprensible y conservar ambas alternativas.

**Propuesta.** Ofrecer comparación de base, versión local y externa, aceptar cambios por bloque, guardar copia y detectar conflictos en assets/.knote. Validar la versión base otra vez al aplicar; no ofrecer combinación textual automática para binarios.

**Alcance revisado.** **Primera entrega:** Mostrar divergencia y conservar ambas versiones antes de elegir/reponer una; revalidar base. **Ampliación:** Editor de combinación por bloques y escenarios complejos entre dispositivos.

**Valoración.** P1 · impacto 5/5 · esfuerzo L · riesgo de implementación alto. Confianza: alta.

**Criterio de aceptación.** Dos ediciones sobre el mismo párrafo no se sobrescriben; se conservan ambas, se comparan y se revalida la base al aplicar una elección. La combinación por bloques requiere aceptación adicional si se incluye.

**Dependencias y relación.** T02–T03 y T12; U09.

**Revisión crítica del conjunto.** Detectar y conservar ambas versiones es el mínimo. Resolver por bloques es ampliación; no prometer fusión semántica de binarios ni reimplementar control T03.

**Fuentes.** [apps/desktop/src/features/externalChanges/ExternalChangesDrawer.tsx](C:/Dev/knownext.ai/apps/desktop/src/features/externalChanges/ExternalChangesDrawer.tsx); [apps/desktop/src/lib/api/sync.ts](C:/Dev/knownext.ai/apps/desktop/src/lib/api/sync.ts).

**F07. Portabilidad y transferencia completa entre dispositivos**

**Situación y evidencia.** Hay importación/exportación por documento y sincronización GitHub; borradores, notas y cachés viven fuera de la carpeta del proyecto. No se identificó un flujo integral de paquete portable con alcance explícito.

**Propuesta.** Crear exportación/importación de proyecto con manifiesto y verificación de integridad: documentos, assets y .knote; historial y grabaciones como opciones. Excluir credenciales por defecto. Resolver colisiones y versiones de formato sin depender de un servicio nuevo.

**Alcance revisado.** **Primera entrega:** Si se selecciona: paquete documental verificable con assets/.knote, exclusiones explícitas y colisiones controladas. **Ampliación:** Incluir historial, grabaciones, borradores y preferencias portables.

**Valoración.** P2 · impacto 5/5 · esfuerzo L · riesgo de implementación alto. Confianza: media-alta.

**Criterio de aceptación.** Exportar en Windows e importar offline en Android conserva los documentos y sus imágenes; el informe enumera qué se incluyó, excluyó o no pudo migrarse.

**Dependencias y relación.** T02, T06, T08, T12 y T14; comparte infraestructura con F04.

**Revisión crítica del conjunto.** Paquete portable no equivale a sincronización ni copia completa. Definir exclusiones, compatibilidad de esquema y verificación antes de recomendarlo como recuperación.

**Fuentes.** [docs/architecture/data-management.md](C:/Dev/knownext.ai/docs/architecture/data-management.md); [apps/desktop/src/lib/api/projects.ts](C:/Dev/knownext.ai/apps/desktop/src/lib/api/projects.ts); [apps/desktop/src/lib/api/documents.ts](C:/Dev/knownext.ai/apps/desktop/src/lib/api/documents.ts).

**F08. Trazabilidad y reversión de cambios realizados por IA**

**Situación y evidencia.** La IA ya usa operaciones estructuradas, aplicación directa de cambios válidos y revisión de anclas obsoletas. AiEditProposalCard permite selección de operaciones; no conviene añadir confirmación obligatoria a cada cambio seguro.

**Propuesta.** Añadir un registro de cambios por interacción, fuentes empleadas, documentos afectados y un Deshacer conjunto. Revisar antes solo operaciones ambiguas, destructivas o de alcance amplio según política; conservar la fluidez de las ediciones seguras.

**Alcance revisado.** **Primera entrega:** Identificar operación IA, documentos y versiones afectadas; reversión directa cuando las bases sigan vigentes. **Ampliación:** Reversión selectiva sobre ediciones posteriores con resolución explícita; nunca prometer deshacer sin conflictos.

**Valoración.** P1 · impacto 5/5 · esfuerzo L · riesgo de implementación alto. Confianza: alta.

**Criterio de aceptación.** Un cambio IA identifica documentos y versiones afectadas. Se revierte directamente cuando siguen vigentes; ante ediciones posteriores se conserva el trabajo manual y se presenta el conflicto, sin prometer reversión automática del conjunto.

**Dependencias y relación.** T03, T05, T09 y F05.

**Revisión crítica del conjunto.** Reversión segura condicionada a bases vigentes; preservar edición manual posterior. Usar T16 para permiso/alcance y separar registrar cambios de persistir prompts.

**Fuentes.** [apps/desktop/src/features/assistant/AiEditProposalCard.tsx](C:/Dev/knownext.ai/apps/desktop/src/features/assistant/AiEditProposalCard.tsx); [apps/desktop/src/app/aiEditProposalApplication.ts](C:/Dev/knownext.ai/apps/desktop/src/app/aiEditProposalApplication.ts); [docs/product/product-definition.md](C:/Dev/knownext.ai/docs/product/product-definition.md).

**F09. Presupuestos de IA por proyecto y uso comprensible**

**Situación y evidencia.** 2.6 incluye catálogo compartido, uso registrado, estimaciones USD/EUR y presupuesto de investigación. Falta convertir esos mecanismos en un control homogéneo de todas las capacidades y periodos.

**Propuesta.** Permitir alertas y límites por operación, proyecto y mes, con estimación previa cuando sea viable; separar coste estimado, confirmado por respuesta y resultado desconocido. Mostrar qué uso se conoce solo en este dispositivo; no prometer un límite global entre equipos sin coordinación.

**Alcance revisado.** **Primera entrega:** Unificar avisos de uso y estimaciones del dispositivo en las capacidades actuales; límites previos donde puedan hacerse efectivos. **Ampliación:** Presupuestos por proyecto/periodo; no equivalen a un tope exacto de facturación ni global entre equipos.

**Valoración.** P1 · impacto 4/5 · esfuerzo M · riesgo de implementación medio. Confianza: alta.

**Criterio de aceptación.** Texto, imágenes, investigación y audio muestran el alcance conocido de uso/estimación y aplican la política configurada donde sea efectiva; un resultado incierto no se reintenta silenciosamente. Los importes locales no se presentan como factura ni tope global garantizado.

**Dependencias y relación.** T04–T05 y T09.

**Revisión crítica del conjunto.** Diferenciar uso conocido, estimación y facturación. M cubre información/avisos; límites estrictos requieren reserva de presupuesto para trabajos concurrentes y definición de cobertura.

**Fuentes.** [apps/desktop/shared/openai-models.json](C:/Dev/knownext.ai/apps/desktop/shared/openai-models.json); [apps/desktop/src-tauri/crates/knownext-storage/src/lib.rs](C:/Dev/knownext.ai/apps/desktop/src-tauri/crates/knownext-storage/src/lib.rs:6340); [apps/desktop/src-tauri/crates/knownext-storage/src/currency.rs](C:/Dev/knownext.ai/apps/desktop/src-tauri/crates/knownext-storage/src/currency.rs); [docs/releases/2.6.0.md](C:/Dev/knownext.ai/docs/releases/2.6.0.md).

**F10. Investigaciones con evidencias verificables y revisión de fuentes**

**Situación y evidencia.** Investigación ya tiene plan, trabajos, fuentes, cobertura, calidad y revisión. La propuesta profundiza la trazabilidad y la utilidad del informe, no vuelve a implementar la capacidad.

**Propuesta.** Vincular cada conclusión relevante a fuente y fragmento, fecha de consulta, vigencia y confianza; mostrar discrepancias y lagunas. Permitir excluir una fuente y recalcular solo lo afectado; distinguir aceptación editorial de validación factual.

**Alcance revisado.** **Primera entrega:** Si se selecciona: referencias a fuentes/fragmentos y fecha, con afirmaciones sin respaldo identificadas. **Ampliación:** Recalcular por exclusión de fuentes; trazabilidad no certifica veracidad.

**Valoración.** P2 · impacto 4/5 · esfuerzo L · riesgo de implementación medio. Confianza: alta.

**Criterio de aceptación.** Una conclusión sin evidencia aparece marcada y el usuario abre la fuente/fragmento asociado. Si se incluye retirar fuentes, se revisan las afirmaciones dependientes; la asociación no se presenta como certificación factual.

**Dependencias y relación.** T09, F08 y F09.

**Revisión crítica del conjunto.** Fuente y fragmento acreditan procedencia, no verdad. Mantener P2 y evaluar evidencia con T17 si se selecciona investigación.

**Fuentes.** [apps/desktop/src-tauri/crates/knownext-research/src/lib.rs](C:/Dev/knownext.ai/apps/desktop/src-tauri/crates/knownext-research/src/lib.rs); [apps/desktop/src/lib/api/ai.ts](C:/Dev/knownext.ai/apps/desktop/src/lib/api/ai.ts:104); [apps/desktop/src/features/assistant/AiPromptInput.tsx](C:/Dev/knownext.ai/apps/desktop/src/features/assistant/AiPromptInput.tsx).

**F11. Convertir grabaciones en actas útiles y revisables**

**Situación y evidencia.** 2.6 ya graba, pausa, recupera, transcribe y genera Markdown. Sus límites declarados incluyen ausencia de diarización y sincronización palabra/audio, y aceptación pendiente de reuniones largas y bilingües.

**Propuesta.** Priorizar capítulos con marcas temporales, decisiones, tareas y responsables propuestos como pendientes de validar, glosario y revisión bilingüe. Enlazar cada conclusión al tramo de audio. Considerar identificación de hablantes como ampliación posterior sujeta a capacidad y coste reales.

**Alcance revisado.** **Primera entrega:** Si se selecciona: acta revisable vinculada a segmentos disponibles; validar captura/recuperación nativa. **Ampliación:** Diarización, sincronización palabra/audio y automatización de tareas; responsables siempre sujetos a revisión.

**Valoración.** P2 · impacto 5/5 · esfuerzo L · riesgo de implementación alto. Confianza: alta sobre límites; proveedores/hardware pendientes.

**Criterio de aceptación.** Una reunión de referencia produce un acta revisable, permite escuchar el fragmento origen y conserva la transcripción original; se verifican interrupciones y retención en dispositivo real.

**Dependencias y relación.** T09, T11–T12 y F09.

**Revisión crítica del conjunto.** Aceptar captura/recuperación vigente antes de enriquecer actas. Las tareas/responsables son propuestas; no añadir envío o asignación automática.

**Fuentes.** [apps/desktop/src/features/recordings/RecordingPanel.tsx](C:/Dev/knownext.ai/apps/desktop/src/features/recordings/RecordingPanel.tsx); [apps/desktop/src-tauri/crates/knownext-recording/src/transcription.rs](C:/Dev/knownext.ai/apps/desktop/src-tauri/crates/knownext-recording/src/transcription.rs); [docs/releases/2.6.0.md](C:/Dev/knownext.ai/docs/releases/2.6.0.md).

**F12. Hacer consultables las notas manuscritas mediante OCR revisable**

**Situación y evidencia.** El editor ya tiene presión, lazo, páginas, plantillas, historial y exportación. El modelo admite texto OCR por página y el índice lo consume cuando existe; la lectura analizada no demuestra una experiencia completa de reconocimiento y corrección.

**Propuesta.** Ofrecer reconocimiento por página/selección, texto paralelo corregible y conversión a Markdown preservando el original. Mantener vínculo bidireccional entre nota, imagen insertada y texto; decidir reconocimiento local/remoto y comunicarlo antes de ejecutarlo.

**Alcance revisado.** **Primera entrega:** Si se selecciona: reconocimiento corregible por página que conserva trazos y explica envío local/remoto. **Ampliación:** Selecciones arbitrarias, reconocimiento continuo y corpus amplio de escritura.

**Valoración.** P2 · impacto 4/5 · esfuerzo L · riesgo de implementación alto. Confianza: media-alta.

**Criterio de aceptación.** Una nota de prueba se encuentra por una palabra manuscrita reconocida; corregir el OCR no cambia los trazos ni elimina el original.

**Dependencias y relación.** T09, T11–T12 y F01.

**Revisión crítica del conjunto.** Validar corpus de escritura, idioma y dispositivo antes de proveedor/OCR. Evitar confundir búsqueda de texto OCR existente con reconocimiento ya completo.

**Fuentes.** [apps/desktop/src/features/handwritten/HandwrittenEditor.tsx](C:/Dev/knownext.ai/apps/desktop/src/features/handwritten/HandwrittenEditor.tsx); [apps/desktop/src-tauri/crates/knownext-docs/src/lib.rs](C:/Dev/knownext.ai/apps/desktop/src-tauri/crates/knownext-docs/src/lib.rs:66); [docs/architecture/handwritten-ai-drawing.md](C:/Dev/knownext.ai/docs/architecture/handwritten-ai-drawing.md).

**F13. Exportación íntegra y consistente entre plataformas**

**Situación y evidencia.** Ya se exporta a MD/PDF/DOCX y existen plantillas. En minimal_pdf_with_assets_and_template la rama Android omite imágenes/diagramas y utiliza la primera línea no vacía del Markdown para un PDF mínimo.

**Propuesta.** Completar PDF Android con todas las secciones y assets; construir un corpus compartido de tablas, listas, Unicode, imágenes y Mermaid. Añadir previsualización, advertencias de incompatibilidad y perfiles de exportación; después, exportación por lote y portada/índice.

**Alcance revisado.** **Primera entrega:** Resolver o comunicar explícitamente la limitación de exportación Android; para declarar PDF completo, conservar contenido y assets del corpus acordado. **Ampliación:** Previsualización avanzada, nuevos perfiles, portada/índice y exportación por lote.

**Valoración.** P0 · impacto 5/5 · esfuerzo XL · riesgo de implementación alto. Confianza: alta en código; salida android no ejecutada.

**Criterio de aceptación.** El mismo documento de referencia exportado en Windows y Android conserva todo el contenido y elementos esenciales, sin recortes silenciosos; el usuario conoce cualquier pérdida admitida.

**Dependencias y relación.** T08, T11–T12; F03 solo para personalización posterior.

**Revisión crítica del conjunto.** Separar capacidad de producto de limitación declarada: si se anuncia exportación PDF completa, avisar de pérdidas no cumple el criterio. Corregir o retirar esa oferta hasta resolverla.

**Fuentes.** [apps/desktop/src-tauri/crates/knownext-docs/src/lib.rs](C:/Dev/knownext.ai/apps/desktop/src-tauri/crates/knownext-docs/src/lib.rs:120); [apps/desktop/src/features/settings/AppSettingsDialog.tsx](C:/Dev/knownext.ai/apps/desktop/src/features/settings/AppSettingsDialog.tsx); [apps/desktop/src/lib/runtime/exportDialogs.ts](C:/Dev/knownext.ai/apps/desktop/src/lib/runtime/exportDialogs.ts).

**F14. Referencias, adjuntos y assets como conocimiento conectado**

**Situación y evidencia.** Hay preview PDF/DOCX/XLSX, búsqueda de texto en visor y gestión de uso de imágenes. extract_plain_text solo extrae MD/TXT y XML de DOCX/XLSX; PDF no aporta texto por esa función. La búsqueda por nombre tampoco incluye handwritten-note entre los tipos buscables.

**Propuesta.** Mejorar extracción con estructura y referencias a página/hoja; añadir enlaces entrantes y comprobación de enlaces rotos/assets ausentes. Asegurar que .knote participa en búsqueda y filtros coherentes. Señalar archivos sin texto extraíble; OCR de escaneados como opción explícita.

**Alcance revisado.** **Primera entrega:** Si se selecciona: indicar límites de extracción y detectar referencias/recursos ausentes. Mantener enlaces gestionados en los movimientos forma parte de F15. **Ampliación:** Backlinks, extracción estructurada por página/hoja y OCR de escaneados.

**Valoración.** P2 · impacto 4/5 · esfuerzo L · riesgo de implementación medio. Confianza: alta.

**Criterio de aceptación.** El usuario identifica documentos sin texto extraíble y recursos ausentes. Los movimientos preservan referencias gestionadas o informan del impacto; abrir una página/hoja exacta se exige solo si se selecciona esa ampliación.

**Dependencias y relación.** T08, F01 y F12; U07.

**Revisión crítica del conjunto.** El mantenimiento de referencias al mover es parte esencial de F15, aunque backlinks/extracción avanzada queden P2. No posponer esa protección con toda la ficha.

**Fuentes.** [apps/desktop/src/features/documentPreview/ReferenceDocumentViewer.tsx](C:/Dev/knownext.ai/apps/desktop/src/features/documentPreview/ReferenceDocumentViewer.tsx); [apps/desktop/src-tauri/crates/knownext-docs/src/lib.rs](C:/Dev/knownext.ai/apps/desktop/src-tauri/crates/knownext-docs/src/lib.rs:3171); [apps/desktop/src/features/documents/documentNameSearch.ts](C:/Dev/knownext.ai/apps/desktop/src/features/documents/documentNameSearch.ts:46).

**F15. Selección múltiple y operaciones seguras sobre archivos y carpetas**

**Situación y evidencia.** DocumentTree mantiene selectedNodeId y draggedNode individuales; la selección activa también interviene en el destino de creación. Los contratos de mover/eliminar revisados operan por nodo. El usuario solicita acciones sobre un conjunto; las acciones por lote de sincronización existentes no resuelven la organización del árbol.

**Propuesta.** Separar documento abierto, fila con foco, conjunto seleccionado y destino de creación. En escritorio, selección individual, alternancia con Ctrl/Cmd y rango con Shift sobre filas visibles; permitir teclado sin exigir ratón. Ctrl+A se limita al árbol cuando tiene foco y explicita el alcance visible. En táctil, entrar en un modo selección mediante acción accesible o pulsación larga, con casillas temporales. No dejar iconos de acción permanentes en cada fila.

Mostrar número de seleccionados y una barra contextual compacta con Mover, Enviar a papelera y Cancelar selección. Ofrecer solo acciones compatibles con el conjunto y explicar exclusiones. Si un filtro oculta seleccionados, mostrar cuántos quedan ocultos y permitir revisar/limpiar el conjunto; no eliminarlos silenciosamente ni operar sobre ellos sin reflejarlos en el resumen. Cambiar de proyecto limpia la selección. Seleccionar archivos no los añade automáticamente al contexto IA. Mantener la regla de destino de creación basada en el nodo activo, nunca en un miembro arbitrario del lote.

Para carpetas, normalizar ancestro/descendiente y procesar cada recurso una sola vez. La confirmación de borrado informa del contenido realmente afectado, aunque parte del árbol esté plegada. El runtime Rust prepara un plan: rutas permitidas, destinos, colisiones, espacio/permiso cuando comprobable, cambios sin guardar, archivos modificados externamente y referencias. Impedir mover una carpeta dentro de sí misma o de un descendiente; revalidar antes de ejecutar. Ante una incidencia detectada en la preparación, no mutar nada hasta resolverla.

Ejecutar como operación registrada con ID y resultado por elemento; actualizar pestañas, borradores, índices y referencias internas gestionadas. Si un enlace no puede actualizarse, advertir antes de confirmar el alcance. Un fallo durante la ejecución puede dejar resultados parciales: informar de lo completado, conservar seleccionados los fallidos y permitir reintento seguro. No prometer atomicidad total del sistema de archivos ni lanzar una sucesión de borrados desde React. Usar papelera recuperable F04; restaurar o deshacer movimientos con comprobación de colisiones y cambios posteriores. Duplicar, exportar y añadir a contexto IA por lote quedan como ampliaciones separadas; el arrastre múltiple puede esperar a que funcione Mover a…

**Alcance revisado.** **Primera entrega:** Selección mixta accesible, Mover a… dentro del mismo proyecto y papelera por lote con plan, protección de borradores y resultados parciales. **Ampliación:** Arrastre múltiple, duplicar, exportar, renombrar o aportar contexto IA por lote, cada acción dimensionada.

**Valoración.** P1 · impacto 5/5 · esfuerzo XL · riesgo de implementación alto. Confianza: alta en código y necesidad expresada; interacción pendiente de prototipo.

**Criterio de aceptación.** Mover una mezcla de archivos y carpeta con un hijo también seleccionado procesa cada recurso una vez y conserva el contenido abierto. Un documento con cambios pendientes no se descarta. Borrar y restaurar un lote funciona sin Git. Un fallo de permisos parcial informa exactamente de éxitos/fallos y el reintento no duplica movimientos. Se verifica alcance con filtros, cambios externos entre preparación y ejecución, teclado y dispositivo táctil.

**Dependencias y relación.** T02–T03, T05, T08, F04 y U02–U03, U09, U11–U13. Actualizar referencias gestionadas forma parte del movimiento; no exige implementar todo F14.

**Revisión crítica del conjunto.** Subir reserva a XL por ejecución, recuperación, referencias y validación nativa; dividir selección/plan, mover y papelera. Primer alcance dentro del mismo proyecto; entre proyectos/movimientos externos después.

**Fuentes.** [DocumentTree.tsx](C:/Dev/knownext.ai/apps/desktop/src/features/documents/DocumentTree.tsx:135); [knownext-storage/lib.rs](C:/Dev/knownext.ai/apps/desktop/src-tauri/crates/knownext-storage/src/lib.rs:1379); [knownext-storage/lib.rs](C:/Dev/knownext.ai/apps/desktop/src-tauri/crates/knownext-storage/src/lib.rs:1412).

**F16. Fidelidad documental al abrir, pegar, editar y volver a guardar**

**Situación y evidencia.** MarkdownEditor configura serialización propia para subrayado/resaltado, Mermaid y cambios initial-normalization. documentSessions trata esa normalización como posible cambio pendiente; hay una prueba explícita que marca dirty al abrir contenido normalizado. Esto demuestra transformación prevista, no pérdida de datos confirmada. F13 cubría exportación y F02 navegación, pero el catálogo no daba entidad propia a la conservación del documento dentro del editor.

**Propuesta.** Definir el subconjunto Markdown soportado y un contrato de conservación: abrir sin editar no reescribe el archivo; al editar, preservar significado, contenido y metadatos fuera del cambio. Caracterizar títulos, listas anidadas, tablas, enlaces relativos, imágenes, bloques de código/Mermaid, Unicode, saltos de línea, HTML y front matter si aparecen en documentos reales. Distinguir normalización equivalente de pérdida. Para construcciones no editables, conservar un bloque protegido o advertir antes de una conversión explícita, manteniendo el original. Mantener Milkdown visual y una sola columna. Añadir corpus de pegar desde texto/Markdown/HTML/ofimática, edición de tablas/listas, selección, composición del teclado y deshacer/rehacer. Validar enlaces y contenido pegado con T07/T08, sin ejecutar contenido activo.

**Alcance revisado.** **Primera entrega:** Corpus de ida y vuelta abrir/editar/guardar/reabrir para formatos presentes, protección de construcciones no soportadas y pruebas de pegar/deshacer de los recorridos frecuentes. **Ampliación:** Ampliación de dialectos Markdown e importación enriquecida de formatos adicionales, solo tras elegir compatibilidad objetivo; no prometer preservación byte a byte tras editar.

**Valoración.** P1 · impacto 5/5 · esfuerzo L · riesgo de implementación alto. Confianza: alta sobre normalización y extensiones; pérdidas concretas pendientes de reproducir.

**Criterio de aceptación.** Abrir/cerrar sin editar conserva el archivo; modificar un párrafo conserva el contenido de bloques ajenos en el corpus. Una construcción no soportada no desaparece silenciosamente. Pegar y deshacer recupera el estado anterior y una nueva apertura mantiene tablas, enlaces y metadatos admitidos. Si se detecta pérdida reproducible, su corrección se trata como P0.

**Dependencias y relación.** T02–T03, T08, T11, F02/F13 y U04. F16 verifica edición y serialización; F13 verifica salida exportada; no se contabilizan dos veces los mismos fixtures.

**Revisión crítica del conjunto.** Vacío funcional central: preservar contenido antes de añadir más herramientas. Caracterizar normalización; corregir pérdidas si se reproducen.

**Fuentes.** [MarkdownEditor.tsx](C:/Dev/knownext.ai/apps/desktop/src/features/editor/MarkdownEditor.tsx:109); [documentSessions.ts](C:/Dev/knownext.ai/apps/desktop/src/app/documentSessions.ts:112); [documentSessions.test.ts](C:/Dev/knownext.ai/apps/desktop/src/app/documentSessions.test.ts:63); [editorCommands.ts](C:/Dev/knownext.ai/apps/desktop/src/features/editor/editorCommands.ts).

**F17. Ciclo de vida del proyecto y control del almacenamiento local**

**Situación y evidencia.** delete_project elimina el registro del proyecto y actualiza el activo; esa función no borra los archivos del proyecto. Los borradores, índices, conversaciones y cachés usan app data, mientras documentos/assets están en el proyecto. Audio ya dispone de retención y excluye pendientes/fijados de su limpieza. El catálogo cubría papelera, portabilidad y privacidad por separado, sin explicar de forma integral dónde quedan los datos al retirar o eliminar un proyecto.

**Propuesta.** Definir acciones distintas para quitar un proyecto de la lista, volver a vincularlo y eliminar contenido local cuando el usuario lo solicite; identificar propiedad y ubicación antes de cualquier borrado. Inventariar documentos originales, borradores, papelera, historial, audio, fuentes IA y cachés regenerables. Mostrar tamaño estimado y alcance del cálculo, estados de carpeta ausente/permiso revocado y espacio insuficiente. Ofrecer primero limpieza revisable de cachés, no purgar por defecto fuentes, borradores o audio pendiente. Preservar referencias de imágenes desde Markdown, .knote, historial y papelera antes de considerar un recurso huérfano. La eliminación local no equivale a borrar GitHub, copias externas ni datos retenidos por el proveedor; explicar esos límites sin prometer borrado seguro del soporte.

**Alcance revisado.** **Primera entrega:** Semántica clara de retirar/revincular/eliminar, mapa de ubicaciones y datos conservados, indicador de uso con alcance conocido y limpieza segura de cachés regenerables. Tratar falta de espacio en guardado/importación/audio. **Ampliación:** Archivo de proyectos, cuotas configurables y limpieza asistida de recursos candidatos; copias y traslado integrales siguen en F04/F07.

**Valoración.** P1 · impacto 4/5 · esfuerzo L · riesgo de implementación alto. Confianza: alta en rutas y eliminación del registro; necesidad de cuotas/archivo aún no validada.

**Criterio de aceptación.** Retirar y revincular un proyecto conserva originales y recupera su asociación conforme al contrato; eliminar informa de qué permanece y dónde. Limpiar cachés no elimina fuentes, borradores, papelera ni audio pendiente/fijado y permite regenerarlas. Un recurso aún referenciado no se propone como huérfano seguro. La falta de espacio no se informa como guardado correcto.

**Dependencias y relación.** T02, T08–T09, T14, F04/F07/F15 y U05/U09/U12. Reutilizar retención existente de audio; no crear un segundo motor de limpieza ni una consola permanente.

**Revisión crítica del conjunto.** Completar ciclo de datos sin duplicar F04/F07/T09. Reutilizar retención de audio y no interpretar ausencia en el árbol como permiso para borrar.

**Fuentes.** [knownext-storage: delete_project](C:/Dev/knownext.ai/apps/desktop/src-tauri/crates/knownext-storage/src/lib.rs:1174); [data-management.md](C:/Dev/knownext.ai/docs/architecture/data-management.md); [knownext-recording: retención](C:/Dev/knownext.ai/apps/desktop/src-tauri/crates/knownext-recording/src/lib.rs:718).

**Aspectos de UX/UI — 16 propuestas**

| ID | Propuesta | Prioridad | Impacto | Esfuerzo | Riesgo |
|---|---|---|---|---|---|
| U01 | Diálogos adaptados a anchura, altura y teclado virtual | P0 | 5/5 | M | Medio |
| U02 | Accesibilidad de teclado, foco y lectores en recorridos principales | P0 | 5/5 | L | Medio |
| U03 | Interacciones táctiles propias, además del cambio de tamaño | P1 | 5/5 | M | Medio |
| U04 | Barra de edición progresiva y contextual | P1 | 4/5 | M | Medio |
| U05 | Ajustes habituales y avanzados sobre una configuración única | P1 | 5/5 | L | Medio |
| U06 | Primer uso orientado a una tarea y activación contextual | P1 | 4/5 | M | Bajo |
| U07 | Conservar la posición de trabajo y facilitar la consulta de referencias | P2 | 4/5 | M | Medio |
| U08 | Acceso rápido a proyectos, documentos y acciones frecuentes | P2 | 4/5 | M | Bajo |
| U09 | Un lenguaje inequívoco para guardado, historial y sincronización | P1 | 5/5 | M | Medio |
| U10 | Hacer visible qué contexto y alcance tendrá cada petición IA | P1 | 5/5 | M | Medio |
| U11 | Actividad y progreso sin interferir con el documento | P1 | 4/5 | M | Medio |
| U12 | Formularios y errores con validación y recuperación en el lugar adecuado | P1 | 4/5 | M | Bajo |
| U13 | Rediseño integral de la jerarquía visual y los componentes comunes | P1 | 5/5 | L | Medio |
| U14 | Distinguir dictado, grabación y uso del lápiz con flujos claros | P1 | 4/5 | M | Medio |
| U15 | Asistente de escritura plegable, contextual y fijable | P1 | 5/5 | L | Medio |
| U16 | Validar recorridos y simplificación con usuarios antes de extender el rediseño | P1 | 5/5 | M | Bajo |

**U01. Diálogos adaptados a anchura, altura y teclado virtual**

**Situación y evidencia.** En 390×844, Crear documento conserva un formulario de 420 px y queda recortado. Mermaid sí se apila, pero reparte el espacio en varias zonas con scroll. No se probó teclado Android real.

**Propuesta.** Crear una base de diálogo con ancho máximo relativo, altura disponible, un área de desplazamiento clara y acciones accesibles. Usar pantalla completa o panel inferior en móvil cuando la tarea lo exija. Aplicar a crear/mover, confirmaciones, imágenes, ajustes y diagramas.

**Alcance revisado.** **Primera entrega:** Base modal adaptable y corrección de diálogos de creación, mover/papelera y ajustes; comprobar teclado virtual nativo. **Ampliación:** Aplicar a superficies secundarias restantes según inventario y uso.

**Valoración.** P0 · impacto 5/5 · esfuerzo M · riesgo de implementación medio. Confianza: alta: observado.

**Criterio de aceptación.** A 360/390 px y con altura reducida se ven título, campos y acciones sin desplazamiento horizontal; teclado virtual y rotación no ocultan el control principal.

**Dependencias y relación.** T11; base de U05 y U12.

**Revisión crítica del conjunto.** Subir riesgo a medio: base modal compartida afecta foco, teclado y capas. Validar con contenido largo, error y teclado virtual, no solo viewport estrecho.

**Fuentes.** [apps/desktop/src/features/documents/CreateDocumentDialog.tsx](C:/Dev/knownext.ai/apps/desktop/src/features/documents/CreateDocumentDialog.tsx:61); [apps/desktop/src/features/documents/InsertDiagramDialog.tsx](C:/Dev/knownext.ai/apps/desktop/src/features/documents/InsertDiagramDialog.tsx).

**U02. Accesibilidad de teclado, foco y lectores en recorridos principales**

**Situación y evidencia.** Crear documento no expone role=dialog/aria-modal en el formulario y Escape no cerró ese diálogo en la prueba. Las filas del árbol son div con click/doubleClick; algunas acciones sí tienen etiquetas y foco, por lo que hay una base aprovechable.

**Propuesta.** Unificar foco inicial, contención y retorno en modales; Escape sobre la capa superior; árbol con navegación por flechas y apertura por Enter; pestañas con semántica y cierre accesible; anuncios de guardado/error. Verificar con NVDA y TalkBack.

**Alcance revisado.** **Primera entrega:** Foco, Escape y semántica en diálogos, árbol, pestañas y recorridos principales; comprobar NVDA/TalkBack. **Ampliación:** Auditoría completa del producto y declaración de conformidad solo con evidencia suficiente.

**Valoración.** P0 · impacto 5/5 · esfuerzo L · riesgo de implementación medio. Confianza: alta en incidencias observadas; auditoría asistiva completa pendiente.

**Criterio de aceptación.** Se completa crear/abrir/editar/guardar/cerrar sin ratón; el foco nunca se pierde ni sale al fondo de un modal; los estados se anuncian sin lectura duplicada.

**Dependencias y relación.** U01, T05 y T11.

**Revisión crítica del conjunto.** Cumplimiento y usabilidad requieren evidencias distintas; no declarar accesibilidad completa. Revisar contraste y zoom en los recorridos seleccionados.

**Fuentes.** [apps/desktop/src/features/documents/CreateDocumentDialog.tsx](C:/Dev/knownext.ai/apps/desktop/src/features/documents/CreateDocumentDialog.tsx); [apps/desktop/src/features/documents/DocumentTree.tsx](C:/Dev/knownext.ai/apps/desktop/src/features/documents/DocumentTree.tsx:740); [apps/desktop/src/features/documents/DocumentTabs.tsx](C:/Dev/knownext.ai/apps/desktop/src/features/documents/DocumentTabs.tsx).

**U03. Interacciones táctiles propias, además del cambio de tamaño**

**Situación y evidencia.** El árbol usa filas h-6, apertura por doble clic y acciones hover/contexto. Hay adaptaciones pointer:coarse para botones de menú, pero no sustituyen la revisión del gesto y del espacio de toda la fila.

**Propuesta.** Abrir con un toque en táctil, ofrecer menú contextual claro por pulsación larga o acción accesible, ampliar áreas activas y separar desplazamiento de arrastre. Mantener el patrón compacto de ratón y los menús contextuales de escritorio.

**Alcance revisado.** **Primera entrega:** Acceso táctil a abrir, menú y selección múltiple sin depender de hover/doble clic. **Ampliación:** Arrastre y gestos más avanzados tras validación en hardware.

**Valoración.** P1 · impacto 5/5 · esfuerzo M · riesgo de implementación medio. Confianza: alta en código; dispositivo pendiente.

**Criterio de aceptación.** En teléfono/tableta se abre, renombra y selecciona un conjunto para moverlo mediante acciones accesibles, sin doble toque ambiguo ni dependencia de arrastre; los controles no solapan filas vecinas.

**Dependencias y relación.** U01–U02 y T11.

**Revisión crítica del conjunto.** Unificar gesto de selección con F15. Mantener salida clara del modo selección y no activar arrastre mientras se desplaza la lista.

**Fuentes.** [apps/desktop/src/features/documents/DocumentTree.tsx](C:/Dev/knownext.ai/apps/desktop/src/features/documents/DocumentTree.tsx:740); [apps/desktop/src/features/documents/DocumentTree.tsx](C:/Dev/knownext.ai/apps/desktop/src/features/documents/DocumentTree.tsx:833); [apps/desktop/src/lib/runtime/responsive.ts](C:/Dev/knownext.ai/apps/desktop/src/lib/runtime/responsive.ts).

**U04. Barra de edición progresiva y contextual**

**Situación y evidencia.** En escritorio la barra acumula formato, listas, inserción, historial, exportación, fuente, zoom y deshacer. En móvil se agrupa, pero aparecen varios iconos sin texto y cambia la localización de acciones.

**Propuesta.** Conservar formato frecuente y deshacer a mano; agrupar inserciones y documento; mostrar controles especializados al seleccionar tabla, imagen o diagrama. Añadir etiquetas/atajos en menús y ayuda de descubrimiento, sin reemplazar Milkdown.

**Alcance revisado.** **Primera entrega:** Reagrupar acciones frecuentes y ubicar Asistente de forma estable; mantener atajos y accesibilidad. **Ampliación:** Herramientas específicas por cada tipo de bloque tras evaluar uso.

**Valoración.** P1 · impacto 4/5 · esfuerzo M · riesgo de implementación medio. Confianza: alta: observado.

**Criterio de aceptación.** Usuarios nuevos encuentran lista, imagen y exportación en una prueba de tareas; usuarios habituales conservan sus atajos y el texto no salta al aparecer controles.

**Dependencias y relación.** U02–U03; F02.

**Revisión crítica del conjunto.** La ubicación de acciones se decide con U16. Evitar barras que cambian de tamaño constantemente y conservar atajos habituales.

**Fuentes.** [apps/desktop/src/features/editor/MarkdownToolbar.tsx](C:/Dev/knownext.ai/apps/desktop/src/features/editor/MarkdownToolbar.tsx); [apps/desktop/src/features/editor/MarkdownEditor.tsx](C:/Dev/knownext.ai/apps/desktop/src/features/editor/MarkdownEditor.tsx).

**U05. Ajustes habituales y avanzados sobre una configuración única**

**Situación y evidencia.** Configuración tiene ocho pestañas; a 390 px varias quedan fuera por scroll horizontal. IA documental, Audio, Skills y Capacidades distribuyen decisiones relacionadas. El resumen puede mostrar RAG Activo y Ninguno a la vez. El usuario señala expresamente complejidad; no existe una separación global habitual/avanzada en la navegación revisada.

**Propuesta.** Organizar por tareas en Apariencia y edición, Asistente y privacidad, Audio, Archivos y almacenamiento, y Exportación. Mantener el diagnóstico dentro de opciones avanzadas. Mostrar por defecto los ajustes habituales y una entrada «Mostrar opciones avanzadas» por apartado; el nivel elegido cambia la visibilidad, nunca los valores. Usar la misma estructura y el mismo modelo de configuración, con resúmenes comprensibles de lo que está activo.

En la vista habitual deben estar idioma/apariencia y legibilidad, conexión y estado del proveedor, envío de datos y límites de uso disponibles, entrada de audio/idioma, ubicación y recuperación de archivos, y perfil de exportación. En avanzada: modelos específicos por tarea, parámetros de recuperación/indexación, opciones de skills, ajustes de diagramas y diagnóstico. Los ajustes que dependen del proyecto permanecen en su ámbito, enlazados cuando corresponda; la interfaz debe explicar dónde se aplica un cambio.

No ocultar privacidad, coste, fallos ni valores avanzados modificados: mostrar, por ejemplo, «3 ajustes personalizados» con acceso a los campos. Una búsqueda dentro de ajustes debe incluir resultados avanzados y revelar la sección necesaria. Explicar requisitos de opciones deshabilitadas y distinguir activado/configurado/listo. Cambiar un perfil que sobrescriba personalizaciones debe anticipar ese efecto; alternar vistas jamás las restablece. Evitar duplicar controles equivalentes o añadir un segundo panel «experto».

**Alcance revisado.** **Primera entrega:** Vista habitual y avanzado por sección sobre el mismo modelo, navegación adaptable, estados claros y personalizaciones visibles; búsqueda posterior. **Ampliación:** Perfiles de configuración compartidos o asistentes extensos, si se demuestra necesidad. Búsqueda unificada de ajustes habituales/avanzados.

**Valoración.** P1 · impacto 5/5 · esfuerzo L · riesgo de implementación medio. Confianza: alta en estructura y observación; agrupación propuesta pendiente de prueba con usuarios.

**Criterio de aceptación.** Configurar el uso documental y una conexión IA habitual sin abrir opciones avanzadas; alternar vistas conserva todos los valores; una personalización avanzada sigue siendo visible como estado y localizable. A 390 px se accede a todos los apartados sin pestañas ocultas. Un fallo conserva los cambios pendientes y muestra qué se guardó.

**Dependencias y relación.** U01–U02, U06, U12–U13, T05, T09 y T14. Dividir AppSettingsDialog como parte de T01 al intervenir estas secciones.

**Revisión crítica del conjunto.** Primera versión con jerarquía y detalles avanzados por sección. Búsqueda de ajustes puede ir después; mostrar personalizaciones activas y ámbito sin duplicar controles.

**Fuentes.** [AppSettingsDialog.tsx](C:/Dev/knownext.ai/apps/desktop/src/features/settings/AppSettingsDialog.tsx:141); [AiSkillsSettings.tsx](C:/Dev/knownext.ai/apps/desktop/src/features/settings/AiSkillsSettings.tsx).

**U06. Primer uso orientado a una tarea y activación contextual**

**Situación y evidencia.** Ya existe Crea tu primer proyecto. En IA sin clave, la pantalla invita a escribir mientras el prompt indica configurar OpenAI; no ofrece allí un acceso directo visible a resolverlo.

**Propuesta.** Guiar mediante acciones breves: crear/abrir proyecto, crear documento e importar; explicar que el trabajo documental es local. En cada capacidad no configurada, mostrar motivo y acceso a su configuración, con opción de seguir trabajando sin ella.

**Alcance revisado.** **Primera entrega:** Acciones para primer documento y accesos directos a configurar una capacidad en su contexto. **Ampliación:** Tutoriales o recorridos largos solo con evidencia de abandono.

**Valoración.** P1 · impacto 4/5 · esfuerzo M · riesgo de implementación bajo. Confianza: alta sobre estado sin ia; primer arranque por código.

**Criterio de aceptación.** Una instalación limpia permite crear y guardar un documento sin cuenta; desde IA desactivada se llega directamente al ajuste necesario y se vuelve al mismo contexto.

**Dependencias y relación.** T12, U05 y U12.

**Revisión crítica del conjunto.** Ayuda contextual breve y acceso al ajuste concreto. Conservar uso documental sin cuenta; no imponer tutorial inicial.

**Fuentes.** [apps/desktop/src/features/projects/ProjectSelector.tsx](C:/Dev/knownext.ai/apps/desktop/src/features/projects/ProjectSelector.tsx); [apps/desktop/src/features/assistant/AiConversationView.tsx](C:/Dev/knownext.ai/apps/desktop/src/features/assistant/AiConversationView.tsx); [apps/desktop/src/features/assistant/AiPromptInput.tsx](C:/Dev/knownext.ai/apps/desktop/src/features/assistant/AiPromptInput.tsx).

**U07. Conservar la posición de trabajo y facilitar la consulta de referencias**

**Situación y evidencia.** El documento ya mantiene una columna y el árbol puede ocultarse. Las referencias se consultan en pestañas y existen varios visores. El control del prompt se define separadamente en U15 para no contabilizar dos veces la misma mejora.

**Propuesta.** Conservar desplazamiento, selección y estado de lectura al alternar documentos y referencias. Unificar zoom/ajuste y apertura del original en los visores. Después de validar U15 y U04, evaluar si sigue haciendo falta un modo concentración adicional o un panel lateral de referencia opcional. El documento principal conserva su flujo de una columna; no crear varios modos antes de demostrar su utilidad.

**Alcance revisado.** **Primera entrega:** Conservar posición/selección al alternar edición y consulta; unificar controles esenciales de visor. **Ampliación:** Modo concentración independiente y referencia lateral tras validar U15/U04.

**Valoración.** P2 · impacto 4/5 · esfuerzo M · riesgo de implementación medio. Confianza: alta en superficies; fricción de alternancia pendiente de medición.

**Criterio de aceptación.** Leer un documento largo, consultar una referencia y regresar conserva la posición de edición; la consulta no modifica el documento ni duplica controles del asistente. Verificar selección y desplazamiento por documento, también al cerrar y reabrir el visor durante la sesión.

**Dependencias y relación.** U15, U04, F02 y F14; T10 si la conservación de visores afecta a memoria.

**Revisión crítica del conjunto.** La conservación de posición durante U15/U04 es criterio del núcleo; visor lateral y modo concentración adicional siguen P2. No degradar navegación al simplificar.

**Fuentes.** [DesktopLayout.tsx](C:/Dev/knownext.ai/apps/desktop/src/layouts/DesktopLayout.tsx); [ReferenceDocumentViewer.tsx](C:/Dev/knownext.ai/apps/desktop/src/features/documentPreview/ReferenceDocumentViewer.tsx); [VisualMediaViewer.tsx](C:/Dev/knownext.ai/apps/desktop/src/features/editor/VisualMediaViewer.tsx).

**U08. Acceso rápido a proyectos, documentos y acciones frecuentes**

**Situación y evidencia.** Existe búsqueda por nombre y selector de proyectos; las pestañas pueden desbordar y los nombres largos se truncan. No se identificó una paleta unificada de comandos ni favoritos reales de documentos.

**Propuesta.** Añadir paleta de acciones y navegación con atajo, recientes y favoritos, con rutas desambiguadas y volver al último documento. Conservar búsqueda fuera de la cabecera del sidebar y creación dentro del selector, tal como exige el producto.

**Alcance revisado.** **Primera entrega:** Si se selecciona: paleta con acciones existentes, rutas desambiguadas y recientes. **Ampliación:** Favoritos persistentes y personalización de atajos.

**Valoración.** P2 · impacto 4/5 · esfuerzo M · riesgo de implementación bajo. Confianza: media-alta.

**Criterio de aceptación.** Se localiza por teclado una acción existente o un archivo homónimo mediante su ruta sin recorrer el árbol; si se incluyen favoritos, sobreviven a mover el documento.

**Dependencias y relación.** F01, T03 y U02.

**Revisión crítica del conjunto.** No mezclar paleta, favoritos y atajos configurables en una única entrega M. Paleta con acciones existentes primero, si cabe tras el núcleo.

**Fuentes.** [apps/desktop/src/features/projects/ProjectSelector.tsx](C:/Dev/knownext.ai/apps/desktop/src/features/projects/ProjectSelector.tsx); [apps/desktop/src/features/documents/DocumentTabs.tsx](C:/Dev/knownext.ai/apps/desktop/src/features/documents/DocumentTabs.tsx); [apps/desktop/src/features/documents/DocumentTree.tsx](C:/Dev/knownext.ai/apps/desktop/src/features/documents/DocumentTree.tsx).

**U09. Un lenguaje inequívoco para guardado, historial y sincronización**

**Situación y evidencia.** Ya hay estados separados y un panel de guardado/sincronización. El estado vacío del historial dice Cuando guardes y sincronices, lo que puede sugerir dependencia de GitHub; la configuración usa términos técnicos de Git local.

**Propuesta.** Mantener tres preguntas claras: cambios guardados en este equipo, versión registrada y copia remota actualizada. Mostrar acciones solo cuando tengan sentido y explicar que GitHub pausado no significa pérdida local. Adaptar la lista de tres estados a tarjetas en móvil.

**Alcance revisado.** **Primera entrega:** Lenguaje y estados inequívocos para guardado local, versión y remoto; informar resultados de lotes. **Ampliación:** Resumen más amplio de protección por proyecto.

**Valoración.** P1 · impacto 5/5 · esfuerzo M · riesgo de implementación medio. Confianza: alta.

**Criterio de aceptación.** Un usuario identifica qué está protegido y dónde sin conocer Git; un fallo remoto no cambia un guardado local correcto a un mensaje alarmante.

**Dependencias y relación.** T03, T12, F05 y F06.

**Revisión crítica del conjunto.** Distinguir borrador protegido, guardado local, versión e información remota, según estado relevante. Evitar cuatro indicadores permanentes que vuelvan a saturar.

**Fuentes.** [apps/desktop/src/features/documents/DocumentStatusBar.tsx](C:/Dev/knownext.ai/apps/desktop/src/features/documents/DocumentStatusBar.tsx); [apps/desktop/src/features/versions/VersionHistoryPanel.tsx](C:/Dev/knownext.ai/apps/desktop/src/features/versions/VersionHistoryPanel.tsx); [apps/desktop/src/features/externalChanges/ExternalChangesDrawer.tsx](C:/Dev/knownext.ai/apps/desktop/src/features/externalChanges/ExternalChangesDrawer.tsx).

**U10. Hacer visible qué contexto y alcance tendrá cada petición IA**

**Situación y evidencia.** El prompt admite selección, documento, adjuntos, fuentes y capacidades; existen chips y modos. RAG y cursor pueden aportar contexto adicional y las ediciones pueden abarcar varios documentos.

**Propuesta.** Añadir un resumen compacto de ámbito, fuentes incluidas/excluidas, información enviada al proveedor y acción esperada. Usar lenguaje de tarea en los modos y conservar detalles técnicos bajo demanda. Después, explicar dónde se aplicó el resultado.

**Alcance revisado.** **Primera entrega:** Resumen compacto de destino/contexto y datos enviados; no heredar selección múltiple como contexto IA. **Ampliación:** Inspección avanzada de recuperación y fuentes bajo demanda.

**Valoración.** P1 · impacto 5/5 · esfuerzo M · riesgo de implementación medio. Confianza: alta en componentes; ejecución real no probada.

**Criterio de aceptación.** Antes de enviar, el usuario distingue selección/documento/proyecto y capacidad de consulta/edición/investigación; al cambiar de pestaña no se mantiene un contexto inesperado.

**Dependencias y relación.** T09, F08–F10 y U05.

**Revisión crítica del conjunto.** Distinguir contexto consultable y objetivos editables con T16. Seleccionar un lote no concede permiso IA ni envía automáticamente su contenido.

**Fuentes.** [apps/desktop/src/features/assistant/AiPromptInput.tsx](C:/Dev/knownext.ai/apps/desktop/src/features/assistant/AiPromptInput.tsx); [apps/desktop/src/app/aiContextState.ts](C:/Dev/knownext.ai/apps/desktop/src/app/aiContextState.ts); [apps/desktop/src/features/assistant/AiEditProposalCard.tsx](C:/Dev/knownext.ai/apps/desktop/src/features/assistant/AiEditProposalCard.tsx).

**U11. Actividad y progreso sin interferir con el documento**

**Situación y evidencia.** Investigación, sincronización, transcripción y exportación tienen superficies distintas. El botón flotante de grabaciones coincide parcialmente con el estado inferior en las capturas de editor estrecho.

**Propuesta.** Unificar una bandeja de actividad con estado, fase, destino, duración, reintento y cancelación cuando sea real. Reubicar el acceso de grabación para que no cubra contenido/guardado y mantener señal persistente durante captura.

**Alcance revisado.** **Primera entrega:** Indicador de tareas activas y acceso a resultado/error, también con prompt oculto; grabación siempre reconocible. **Ampliación:** Bandeja completa con filtros/historial y planificación.

**Valoración.** P1 · impacto 4/5 · esfuerzo M · riesgo de implementación medio. Confianza: alta en interfaces; trabajos reales por código.

**Criterio de aceptación.** Una tarea sigue siendo localizable con el asistente oculto, muestra destino y resultado y no roba foco al terminar; permite cancelar solo cuando es efectivo. Ningún control tapa guardado a 360/390 px y un resultado incierto no invita a un reintento ciego.

**Dependencias y relación.** T04–T05, T13 y F09.

**Revisión crítica del conjunto.** Un indicador compacto y detalle bajo demanda primero. Estado desconocido y grabación activa deben ser reconocibles; una bandeja universal no es requisito inicial.

**Fuentes.** [apps/desktop/src/features/recordings/RecordingPanel.tsx](C:/Dev/knownext.ai/apps/desktop/src/features/recordings/RecordingPanel.tsx); [apps/desktop/src/features/assistant/AiPromptInput.tsx](C:/Dev/knownext.ai/apps/desktop/src/features/assistant/AiPromptInput.tsx); [apps/desktop/src/layouts/DesktopLayout.tsx](C:/Dev/knownext.ai/apps/desktop/src/layouts/DesktopLayout.tsx).

**U12. Formularios y errores con validación y recuperación en el lugar adecuado**

**Situación y evidencia.** Crear documento acepta nombre vacío y lo normaliza a uno genérico; no tiene un estado pendiente/error propio en su contrato. En la sincronización web-dev se ve un error de endpoint y varios reintentos repetidos.

**Propuesta.** Mostrar destino y resultado del nombre antes de crear, validar colisiones y caracteres, bloquear doble envío y conservar datos tras un fallo. Presentar mensajes breves con acción concreta; dejar detalles técnicos detrás de un desplegable y un ID de diagnóstico.

**Alcance revisado.** **Primera entrega:** Validación y conservación de datos ante fallos en crear/mover, lotes y ajustes; impedir doble envío. **Ampliación:** Revisar formularios secundarios con el mismo componente.

**Valoración.** P1 · impacto 4/5 · esfuerzo M · riesgo de implementación bajo. Confianza: alta.

**Criterio de aceptación.** Un error de permisos o nombre conserva los campos y permite corregir; Enter no crea duplicados; Cancelar nunca envía cambios.

**Dependencias y relación.** T05, T13 y U01–U02.

**Revisión crítica del conjunto.** Crear/mover/ajustes comparten patrones de validación. No hacer silenciosa una acción destructiva ni perder entradas tras un error.

**Fuentes.** [apps/desktop/src/features/documents/CreateDocumentDialog.tsx](C:/Dev/knownext.ai/apps/desktop/src/features/documents/CreateDocumentDialog.tsx:35); [apps/desktop/src/features/projects/CreateProjectDialog.tsx](C:/Dev/knownext.ai/apps/desktop/src/features/projects/CreateProjectDialog.tsx); [apps/desktop/src/features/externalChanges/ExternalChangesDrawer.tsx](C:/Dev/knownext.ai/apps/desktop/src/features/externalChanges/ExternalChangesDrawer.tsx).

**U13. Rediseño integral de la jerarquía visual y los componentes comunes**

**Situación y evidencia.** La revisión visual muestra una base blanca/naranja coherente, pero también una barra densa, varios focos de atención y controles flotantes próximos a estados inferiores. Abundan textos de 10–11 px y hay traducción parcial. Apariencia ofrece Azul como color principal pese a la regla de producto. El usuario reclama una aplicación más limpia, sencilla, moderna y profesional; la preferencia estética debe concretarse y validarse, no darse por satisfecha con una reorganización de código.

**Propuesta.** Definir una jerarquía estable: navegación de proyectos/documentos, pestañas, herramientas de la tarea, documento y estado. Dar protagonismo al contenido, reservar el naranja para acción/selección relevante, reducir bordes y contenedores redundantes, y usar espaciado, tipografía e iconos con significado consistente. Conservar canvas claro, sidebar neutro, densidad operativa y Milkdown en una columna. Mejorar legibilidad sin sustituir etiquetas necesarias por iconos ambiguos ni añadir tarjetas de gran tamaño.

Inventariar componentes y consolidar tokens de texto, espacio, bordes, foco y estados; aplicar el mismo lenguaje a menús, selección múltiple, diálogos, formularios, visores y configuración, incluidos vacío, carga, error y recuperación. Completar traducciones de los recorridos intervenidos y corregir la discrepancia de paleta. U04, U05 y U15 definen comportamientos; U13 define y aplica su lenguaje visual compartido, sin duplicar su coste.

Preparar prototipos con contenido realista del editor con/sin asistente, árbol con lote seleccionado, ajustes básicos/avanzados y formulario con error. Compararlos a 360/390, 768 y 1280/1366 px, altura reducida, zoom de texto y teclado virtual nativo. Registrar una línea base de controles permanentes, área útil del documento y éxito en tareas; acordar objetivos tras medirla. La reducción de controles solo es positiva si las acciones siguen siendo localizables.

**Alcance revisado.** **Primera entrega:** Jerarquía, tokens y componentes compartidos aplicados al editor, árbol, asistente, ajustes y diálogos críticos, con prototipos y comprobación. **Ampliación:** Extensión a todas las superficies especializadas; densidad configurable solo si la prueba de uso la justifica.

**Valoración.** P1 · impacto 5/5 · esfuerzo L · riesgo de implementación medio. Confianza: alta en observaciones; dirección visual propuesta pendiente de prototipos y validación.

**Criterio de aceptación.** Los mismos componentes y estados tienen el mismo aspecto y comportamiento en editor y superficies secundarias; no hay controles solapados ni pérdida de acciones con zoom. Crear, encontrar, editar, mover y configurar se completan en los prototipos; se comprueban foco, contraste y traducciones. El área recuperada al plegar IA se acredita por comparación, sin inventar porcentajes de mejora.

**Dependencias y relación.** U01–U05, U09–U12, U15 y F15; T11 para regresión visual/funcional. Diseñar la base común antes de estilizar cada diálogo por separado.

**Revisión crítica del conjunto.** Separar sistema común de coste por pantalla. Probar jerarquía con U16 antes de estilizar toda la aplicación; modernidad no es una métrica aislada.

**Fuentes.** [index.css](C:/Dev/knownext.ai/apps/desktop/src/styles/index.css); [DesktopLayout.tsx](C:/Dev/knownext.ai/apps/desktop/src/layouts/DesktopLayout.tsx); [AppSettingsDialog.tsx](C:/Dev/knownext.ai/apps/desktop/src/features/settings/AppSettingsDialog.tsx); [AGENTS.md](C:/Dev/knownext.ai/AGENTS.md). Capturas 1–6 y 10–12 de esta revisión.

**U14. Distinguir dictado, grabación y uso del lápiz con flujos claros**

**Situación y evidencia.** El editor muestra micrófono de dictado y un acceso flotante a Grabaciones. La aplicación también incorpora una libreta con herramientas de lápiz, lazo y borrado; estas entradas tienen distintos destinos, permisos y estados de guardado.

**Propuesta.** Nombrar explícitamente Dictar al texto, Dictar al prompt y Grabar reunión; mostrar destino y señal antes/durante la captura. En .knote, hacer evidente si el gesto escribe, selecciona o desplaza, qué página está activa y cuándo quedó protegida. Diseñar incorporación breve para cada entrada.

**Alcance revisado.** **Primera entrega:** Etiquetas y destinos inequívocos de dictado, grabación y lápiz; señales persistentes y estado de protección. **Ampliación:** Incorporación detallada y optimización de gestos después de pruebas con stylus/audio reales.

**Valoración.** P1 · impacto 4/5 · esfuerzo M · riesgo de implementación medio. Confianza: media-alta; hardware pendiente.

**Criterio de aceptación.** Usuarios distinguen qué se capturará y dónde aparecerá; pausar no se confunde con transcribir. En stylus, mano/dedo/lápiz no provocan trazos involuntarios y la página se recupera al volver de segundo plano.

**Dependencias y relación.** T11–T12, F11–F12 y U03.

**Revisión crítica del conjunto.** Mantener precisión de destino y permisos. La aceptación de voz/lápiz depende de hardware y ciclo de vida T15; no ampliar a nuevos gestos sin evidencia.

**Fuentes.** [apps/desktop/src/features/transcription/useRealtimeTranscription.ts](C:/Dev/knownext.ai/apps/desktop/src/features/transcription/useRealtimeTranscription.ts); [apps/desktop/src/features/recordings/RecordingPanel.tsx](C:/Dev/knownext.ai/apps/desktop/src/features/recordings/RecordingPanel.tsx); [apps/desktop/src/features/handwritten/HandwrittenEditor.tsx](C:/Dev/knownext.ai/apps/desktop/src/features/handwritten/HandwrittenEditor.tsx).

**U15. Asistente de escritura plegable, contextual y fijable**

**Situación y evidencia.** DesktopLayout renderiza AiPromptInput mientras no se visualiza una versión histórica, sin un control de visibilidad/fijación del usuario en ese punto. Existe además un degradado inferior anclado a 90 px. AiPromptInput mantiene texto y estado de interacción local; desmontarlo sin trasladar o preservar ese estado puede perder el borrador. El usuario confirma que su presencia permanente ocupa demasiado espacio.

**Propuesta.** Definir tres estados comprensibles: **plegado**, **abierto temporalmente** y **fijado**. Durante edición, iniciar plegado salvo preferencia explícita de fijación. Mantener una acción estable «Asistente» en la barra y acceso por teclado/menú contextual; no añadir otro botón flotante sobre el contenido. Abrir por intención explícita, sin desplegarse cada vez que se selecciona texto. El estado temporal permanece hasta que el usuario lo cierre; no colapsa al perder foco mientras compone, dicta o elige fuentes.

En escritorio, al fijarlo, reservar un área inferior de altura acotada dentro del layout; nunca tapar el cursor, la última línea ni el guardado. El ajuste manual de altura queda como ampliación. Al plegarlo recuperar también padding/degradados y espacio reservado. Recordar fijación por dispositivo y altura si se incorpora ese ajuste; no trasladar automáticamente una disposición de escritorio a teléfono. En móvil usar una superficie temporal adaptada al teclado y altura disponible, con retorno claro al documento; la fijación permanente se reserva inicialmente al escritorio.

Conservar borrador y fuentes al ocultar/mostrar durante la sesión, asociados a proyecto/documento de destino. Al cambiar de documento recuperar su borrador contextual o empezar vacío; no reasignar silenciosamente una petición preparada para otro archivo. Revalidar la selección de texto y la versión antes de enviar/aplicar. No introducir persistencia de prompts ni streaming por este cambio: cualquier retención posterior exige la política T09.

Ocultar no cancela una tarea ya iniciada: su destino queda ligado a la petición original y el progreso se ve en un indicador compacto de actividad. La finalización no obliga a reabrir el panel. Cerrar devuelve foco/posición al editor; Escape actúa sobre la capa superior y respeta composición de texto. En la pestaña de conversación dedicada, el cuadro de entrada sigue siendo parte natural de la conversación; no mostrar dos compositores simultáneos. Un proveedor sin configurar ofrece acceso directo al ajuste desde el panel abierto, sin ocupar permanentemente el documento.

**Alcance revisado.** **Primera entrega:** Plegado/abierto/fijado en escritorio con altura acotada; móvil temporal; borradores contextuales de sesión y tareas independientes de visibilidad. **Ampliación:** Disposiciones adicionales y persistencia de prompts solo mediante decisiones posteriores de producto/privacidad. Altura ajustable tras validar la disposición inicial.

**Valoración.** P1 · impacto 5/5 · esfuerzo L · riesgo de implementación medio. Confianza: alta en código, capturas y necesidad expresada; comportamiento propuesto pendiente de validación.

**Criterio de aceptación.** Plegado no reserva una franja vacía en el documento. Ocultar/reabrir conserva borrador y fuentes; cambiar de A a B no envía ni aplica el borrador de A a B. Una tarea puede finalizar oculta sin robar foco; el resultado identifica su destino. Fijado no tapa texto/estado y móvil funciona con teclado virtual. El recorrido puede hacerse por teclado y conserva el punto de edición.

**Dependencias y relación.** U04, U10–U11, U13, T03, T05 y T09. U07 queda limitado a posición de trabajo y consulta de referencias; no es prerrequisito de este control.

**Revisión crítica del conjunto.** Mantener tres estados; altura ajustable queda como ampliación. Acordar experiencia de actualización desde 2.6 y recordar elección; plegado por defecto es hipótesis a validar con usuarios frecuentes de IA.

**Fuentes.** [DesktopLayout.tsx](C:/Dev/knownext.ai/apps/desktop/src/layouts/DesktopLayout.tsx:913); [AiPromptInput.tsx](C:/Dev/knownext.ai/apps/desktop/src/features/assistant/AiPromptInput.tsx:85); [aiContextState.ts](C:/Dev/knownext.ai/apps/desktop/src/app/aiContextState.ts).

**U16. Validar recorridos y simplificación con usuarios antes de extender el rediseño**

**Situación y evidencia.** La revisión dispone de código, pruebas y capturas; no tiene observación de usuarios representativos ni línea base de éxito, tiempo o errores. U13 proponía prototipos, pero faltaba un trabajo transversal que comprobara la simplificación de los cuatro ejes y resolviera prioridades por uso. Las valoraciones 4/5 y 5/5 del catálogo son juicios, no estadísticas.

**Propuesta.** Seleccionar perfiles y tareas con el usuario: escritor habitual, usuario que organiza muchos archivos y uso móvil/táctil, incorporando necesidades de accesibilidad. Medir primero en 2.6 crear/importar, editar/guardar, consultar y volver, pedir un cambio IA, mover/recuperar un lote y configurar una capacidad; para funciones nuevas registrar el procedimiento actual equivalente. Comparar prototipos con el mismo contenido y dificultad, alternando orden cuando sea viable para reducir aprendizaje. Observar éxito sin ayuda, errores graves, descubrimiento de acciones, esfuerzo percibido y tiempo descriptivo. Combinar sesiones moderadas pequeñas e iterativas con revisión técnica de accesibilidad; no atribuir representatividad estadística a una muestra pequeña. No introducir telemetría remota por defecto ni usar contenido privado sin acuerdo.

**Alcance revisado.** **Primera entrega:** Línea base y primera ronda de prototipos del asistente, árbol/lotes, ajustes y formularios; registrar problemas, decisiones y segunda comprobación de cambios relevantes. **Ampliación:** Piloto de una candidata con uso prolongado y medición voluntaria acordada; sin convertir analítica de producto en dependencia del funcionamiento local.

**Valoración.** P1 · impacto 5/5 · esfuerzo M · riesgo de implementación bajo. Confianza: alta sobre ausencia de medición en esta revisión; preferencias y resultados pendientes.

**Criterio de aceptación.** Cada decisión principal de simplificación tiene evidencia de tareas o se identifica como hipótesis. Se comparan resultados antes/después por perfil, se documentan fracasos y limitaciones y se corrigen bloqueos críticos antes de aceptar el recorrido. Los umbrales se acuerdan al conocer la línea base, sin porcentajes inventados ni sustituir pruebas de accesibilidad.

**Dependencias y relación.** U01–U05, U10–U15, F15–F16 y T11. U16 valida utilidad; U13 define el sistema visual; T11 verifica regresiones técnicas. La primera ronda precede a extender el diseño completo.

**Revisión crítica del conjunto.** Trabajo de validación explícito; no una nueva pantalla ni telemetría. Pocas sesiones cualitativas orientan decisiones, no prueban porcentajes de mejora generalizables.

**Fuentes.** [catálogo: método y cobertura](C:/Dev/knownext.ai/docs/product/revision-3.0-catalogo-mejoras.md); [manual-test-checklist.md](C:/Dev/knownext.ai/docs/development/manual-test-checklist.md); [W3C: evaluación con usuarios](https://www.w3.org/WAI/test-evaluate/involving-users/).

**Criterios externos consultados**

T07 se apoya en los mecanismos oficiales de [CSP de Tauri](https://v2.tauri.app/security/csp/) y [capabilities/permisos](https://v2.tauri.app/security/capabilities/): la separación por ventanas debe complementarse con autorización de comandos propios. T08 aplica límites también al contenido expandido, siguiendo [OWASP sobre procesamiento de archivos](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html). U02 utiliza el patrón de [diálogo modal de WAI-ARIA](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/) para foco, teclado y semántica. Son referencias de diseño y verificación; no certifican cumplimiento ni una vulnerabilidad explotada.



T16 toma como referencia [OWASP sobre prompt injection](https://cheatsheetseries.owasp.org/cheatsheets/LLM_Prompt_Injection_Prevention_Cheat_Sheet.html): la autoridad debe comprobarse en la ejecución, fuera del modelo. U16 combina observación de usuarios con revisión técnica de accesibilidad siguiendo la distinción de [W3C/WAI sobre evaluación con usuarios](https://www.w3.org/WAI/test-evaluate/involving-users/). Estas referencias orientan la propuesta; no prueban un fallo de KnowNext.ai ni sustituyen validación local.

**Paquetes de producto de la revisión 2, complementados por la revisión 3**

Recomiendo que la identidad de 3.0 sea la mejora del trabajo documental cotidiano. La entrada de nuevas capacidades queda subordinada a que los flujos actuales sean claros, fiables y cómodos. No hay datos de uso ni presupuesto que justifiquen prometer todas las propuestas; las valoraciones son relativas y no equivalen a una estimación económica.

| Paquete de decisión | Resultado esperado | Fichas que aportan al alcance | Límites de la primera entrega |
|---|---|---|---|
| 1. Escribir con control del espacio | Documento protagonista, herramientas encontrables y asistente disponible a voluntad | U15, U04, U10, U11, F16; base visual U13 y validación U16 | Sin nuevos modos de trabajo ni persistencia de prompts; conservar destinos y borradores |
| 2. Organizar varios documentos con seguridad | Seleccionar, mover, enviar a papelera y recuperar un conjunto | F15, F04, U02, U03, U09, U12 | Mover a… y papelera primero; exportación/duplicación por lote y arrastre después |
| 3. Una interfaz coherente en todas las tareas | Jerarquía, legibilidad y componentes comunes en editor y superficies secundarias | U13, U01, U02, U12, U14 | Prototipos y recorridos reales antes de extender estilos; medir utilidad y accesibilidad |
| 4. Configurar sin sobrecarga | Ajustes habituales, avanzado por sección, estados claros y acceso contextual | U05, U06; T01 y T14 en los dominios tocados | Un modelo de configuración; privacidad/coste visibles y personalizaciones conservadas |
| 5. Fiabilidad de la base instalada | Guardado, concurrencia, credenciales, permisos, exportación y migración comprobables | T02–T03, T06–T09, T15–T16, F13, F17; soporte T05, T11–T14 | Resolver brechas verificadas y explicitar capacidades; sin reescritura general ni promesa de paridad no demostrada |
| 6. Productividad adicional seleccionable | Encontrar contenido y navegar documentos largos | F01–F02; U07 si se confirma fricción de consulta | Búsqueda local y navegación primero; semántica, visores avanzados y más modos después |

Estos paquetes **comparten implementación**: U13 diseña componentes usados por U05/U15/F15; F04 aporta recuperación a F15; T02/T03/T05 sostienen varios flujos. No sumar sus tamaños como proyectos aislados. T01 se hace incrementalmente, T04 se guía por esperas observadas y T10 empieza midiendo. El orden de la tabla expresa resultados de producto, no una secuencia técnica: preparar persistencia/recuperación antes de habilitar lotes destructivos.

**Cambios de criterio frente al primer catálogo.** U05 y U13 suben de impacto 4/M a 5/L al definir su alcance real; F15 y U15 se incorporan como iniciativas explícitas. U07 pasa a P2 y deja de absorber el control del prompt. F07, F10, F11 y F14 pasan a P2 para reservar capacidad a los cuatro ejes centrales; su prioridad puede cambiar si se aportan usos frecuentes. F04 separa papelera de copias integrales; F13 separa integridad de exportación de perfiles/previsualización; U02 sustituye la promesa de accesibilidad «completa» por recorridos y pruebas definidos. F05/F06/F08 separan restauración o comparación sencilla de combinación/reversión selectiva. T12 requiere una prueba técnica antes de comprometer paridad nativa. Los riesgos de T07/T08 siguen siendo hallazgos de configuración/código, no incidentes de seguridad demostrados.

**Opciones posteriores.** F03/F05/U08 son ampliaciones acotables de productividad. F07/F10/F11/F12/F14 son líneas que requieren una decisión por caso de uso; no es necesario elegir obligatoriamente una para justificar 3.0. El alcance amplio de F09 debe distinguir estimaciones del dispositivo y límites efectivos de una garantía global de gasto que la arquitectura actual no ofrece. Las mejoras de seguridad y fiabilidad de capacidades existentes siguen siendo necesarias aunque sus ampliaciones se pospongan.

Para decidir cada fila, usar: **incluir en 3.0 / incluir una primera parte / investigar antes / posponer / descartar**, indicando alcance mínimo y razón. Todas las filas de la matriz quedan **Pendiente de decisión**; incluir una aportación en el catálogo no autoriza su implementación. La matriz distingue primera entrega, ampliación y origen de la aportación. No fija fecha, coste ni responsables.

**Condiciones propuestas de salida**

Una candidata debería demostrar: migración recuperable desde 2.6; ningún caso conocido de sobrescritura silenciosa; funcionamiento básico offline en Windows/Android; exportación íntegra del corpus acordado; recorridos accesibles en anchos/alturas de referencia; credenciales y permisos conforme a la política; regresión automatizada más aceptación nativa fechada. Para publicar se mantienen las exigencias actuales de MSI, NSIS, firmas, latest.json, APK y android-latest.json. Esta revisión no ha preparado ni publicado esos artefactos.



Si se incluyen los ejes propuestos, la aceptación añadirá: fidelidad de ida/vuelta del corpus F16; recuperación tras interrupciones T15; autorización por interacción T16; alcance comprobado de lotes y restauración F15/F04; conservación de borradores/contexto al plegar IA; configuración avanzada preservada al cambiar de vista; y resultados del piloto U16. La calidad con proveedor solo se declara si T17 se ejecutó realmente. Una reversión de versión requiere datos compatibles o restauración de copia, no solo reinstalar 2.6.

**Recorrido visual y capturas**

Las siguientes imágenes pertenecen a esta sesión. Los pasos 7 y 8 documentan límites del entorno web y no se utilizan como prueba de defectos equivalentes en el producto nativo. Los estados aceptables son juicios sobre la superficie observada, no aprobación funcional completa.

**Paso 1. Editor de escritorio.** Base visual clara; barra densa y acceso flotante próximo al estado de guardado. U04/U11/U13/U15.

![Paso 1: Editor de escritorio](C:/Dev/knownext.ai/output/playwright/revision-3.0/01-editor-escritorio.jpg)

**Paso 2. Resumen de configuración.** Operativo visualmente; abundancia de información y estados RAG que requieren aclaración. U05.

![Paso 2: Resumen de configuración](C:/Dev/knownext.ai/output/playwright/revision-3.0/02-ajustes-escritorio.jpg)

**Paso 3. Ajustes a 390 px.** Necesita mejora: pestañas horizontales parcialmente ocultas y recorrido largo. U01/U05.

![Paso 3: Ajustes a 390 px](C:/Dev/knownext.ai/output/playwright/revision-3.0/03-ajustes-390.jpg)

**Paso 4. Editor a 390 px.** Adaptación básica útil; acceso de grabación se superpone parcialmente al estado inferior. U03/U04/U11/U15.

![Paso 4: Editor a 390 px](C:/Dev/knownext.ai/output/playwright/revision-3.0/04-editor-390.jpg)

**Paso 5. Crear documento a 390 px.** Defecto confirmado: formulario de 420 px recortado; semántica modal ausente y Escape no cierra ese diálogo. U01/U02/U12.

![Paso 5: Crear documento a 390 px](C:/Dev/knownext.ai/output/playwright/revision-3.0/05-crear-documento-390.jpg)

**Paso 6. Editor a 768 px.** Agrupación intermedia presente; falta aceptación táctil y con contenido extenso. U03/U07.

![Paso 6: Editor a 768 px](C:/Dev/knownext.ai/output/playwright/revision-3.0/06-editor-tablet.jpg)

**Paso 7. Panel de grabaciones.** Bloqueado para captura nativa en navegador, de forma explícita. Revisión funcional de audio basada en código/tests; U14/F11 requieren dispositivo.

![Paso 7: Panel de grabaciones](C:/Dev/knownext.ai/output/playwright/revision-3.0/07-grabaciones-limite-web.jpg)

**Paso 8. Guardado y sincronización.** Bloqueado por endpoint web-dev no implementado; error técnico y acciones repetidas observables. T11/T13/U12.

![Paso 8: Guardado y sincronización](C:/Dev/knownext.ai/output/playwright/revision-3.0/08-sincronizacion-limite-web.jpg)

**Paso 9. Asistente sin clave.** Estado vacío claro, pero sin acceso directo visible a configuración en esa superficie. U06/U10.

![Paso 9: Asistente sin clave](C:/Dev/knownext.ai/output/playwright/revision-3.0/09-asistente-sin-configurar.jpg)

**Paso 10. Mermaid en escritorio.** Validación local y vista previa correctas para el ejemplo; panel técnico amplio. U04/U13.

![Paso 10: Mermaid en escritorio](C:/Dev/knownext.ai/output/playwright/revision-3.0/10-diagramas.jpg)

**Paso 11. Mermaid a 390 px.** Se apila y conserva acciones; múltiples zonas con scroll reducen la visión conjunta. U01/U04.

![Paso 11: Mermaid a 390 px](C:/Dev/knownext.ai/output/playwright/revision-3.0/11-diagramas-390.jpg)

**Paso 12. Editar proyecto.** Separación identidad/sincronización clara; terminología Git y opciones de configuración requieren guía para usuarios nuevos. U06/U09/U12.

![Paso 12: Editar proyecto](C:/Dev/knownext.ai/output/playwright/revision-3.0/12-ajustes-proyecto.jpg)

**Artefactos y estado de trabajo**

Catálogo: [docs/product/revision-3.0-catalogo-mejoras.md](C:/Dev/knownext.ai/docs/product/revision-3.0-catalogo-mejoras.md). Matriz editable de decisiones: [docs/product/revision-3.0-matriz-decision.csv](C:/Dev/knownext.ai/docs/product/revision-3.0-matriz-decision.csv). Capturas y logs: `C:/Dev/knownext.ai/output/playwright/revision-3.0/`.

Solo se han añadido estos documentos de análisis y las evidencias locales. No se ha implementado ninguna propuesta, modificado VERSION, hecho commit ni preparado/publicado una release. Los esquemas generados por la compilación se restituyeron al estado inicial.
