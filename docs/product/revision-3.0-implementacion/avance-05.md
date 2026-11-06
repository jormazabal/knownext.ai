# Avance 05 · Recuperación e historial verificable

31/10/2026 · Rama `codex/v3-programa` · [Resumen visual](avance.html)

## Resultado de este corte

- **P01 / T02–T03:** los borradores utilizan una identidad SHA-256 completa. Nombres como `a-b.md` y `a_b.md` ya no comparten archivo interno. La migración comprueba el propietario, conserva variantes distintas y rechaza datos dañados sin reemplazarlos. El borrador conserva su base original al reabrir; un archivo modificado fuera de la app no se convierte silenciosamente en su nueva base.
- **P01 / T01 y T05:** persistencia de borradores, recuperación e historial extraídos a módulos Rust separados. Los errores de limpieza posteriores al guardado devuelven el contenido confirmado y un aviso de copia conservada.
- **P01 / T03–T04:** cola de escrituras por documento en React; los temporizadores antiguos se vuelven a validar antes de escribir. Guardados y limpieza comparten orden; los cambios nuevos durante el guardado siguen pendientes. El vaciado consulta sesiones vigentes y espera escrituras en curso antes de permitir cambios de proyecto u operaciones revisadas. Esto no elimina todavía el bloqueo global de trabajos largos del runtime.
- **P05 / F06 y U09:** recuperación de Markdown y `.knote` con resultado tipado, creación exclusiva y rechazo de destinos ocupados. El diálogo identifica proyecto, fecha y texto/páginas; evita rutas duplicadas y confirma el descarte definitivo. Errores y doble envío conservan la copia. La paleta permite acceder directamente a recuperación.
- **P05 / F05:** listado y contenido histórico proceden de los commits de Git, incluidos cambios externos y el renombrado contrastado. Crear una versión no captura texto sin guardar ni duplica versiones sin cambios. Las notas manuscritas se pueden registrar sin tratarlas como Markdown. Los archivos históricos antiguos se conservan; un ID antiguo solo se admite si coincide con el historial y los bytes de Git del documento solicitado.
- **P05 / T03:** restauración con base obligatoria, rechazo de cambios externos y respuesta diferenciada si el archivo se restaura pero Git falla. El reconocimiento de la restauración conserva la escritura posterior del usuario. El panel muestra título, autor y fecha, permite comparar la última versión guardada y ofrece retorno explícito al documento. Las respuestas de otra selección o documento se descartan.
- **P03 / U13:** aviso de conflicto adaptable al ancho móvil; controles en una fila independiente del texto. El menú de cuenta deja de mostrar «GitHub pausado» cuando no existe una cuenta.
- **P07 / F12:** la nota manuscrita dispone de las mismas decisiones de conflicto: cargar disco o mantener los trazos. Esta nueva presentación tiene comprobación de tipos, pero aún necesita contraste visual nativo.

## Evidencia

- Regresión frontend vigente: **379 pruebas / 80 archivos**, todas superadas (`v3-frontend-tests-14.log`), y compilación TypeScript/Vite correcta (`v3-build-15.log`). Se mantiene el aviso de chunks grandes. La regresión Rust de la ronda anterior al contrato ampliado de restauración pasó **182 pruebas**, incluidas 109 de almacenamiento (`v3-rust-tests-13.log`); la ronda focalizada posterior pasó **15 pruebas** (`v3-history-tests-03.log`). No se suman pruebas repetidas ni se presenta esa ronda focalizada como una nueva regresión completa.
- Fallos reproducidos antes de corregir: historial con texto sin guardar e identidades de archivos mezcladas (`v3-history-before.log`). Las cinco pruebas iniciales del nuevo historial pasan (`v3-history-tests-02.log`). Restauración con base obsoleta, registro Git bloqueado y conservación de archivos están cubiertos en la ampliación posterior.
- Cola y continuidad: 17 pruebas focalizadas superadas (`v3-session-queue-tests-02.log`). Historial, restauración y contrato frontend: 20 pruebas focalizadas superadas (`v3-history-ui-tests-02.log`). El contraste posterior añade una consulta histórica de otro documento que termina tarde.
- **Android nativo QA, compilación 08**, API 36 x86_64, paquete separado `ai.knownext.mobile.v3qa`. Recuperar el documento y el boceto sin conexión, abrirlos y reiniciar el proceso conserva texto, página y trazo. Ambos registros tienen `hasDraft=false` y `baseVerified=true` después del reinicio. Se comprobó la confirmación de descarte y se eligió conservar.
- La compilación 07 contrastó además un borrador antiguo sin base verificable: guardar de forma ordinaria no alteró el disco; «Mantener mi versión» lo sustituyó tras la decisión explícita. La compilación 08 mejora la presentación del aviso; ese estado visual no se ha vuelto a capturar con un nuevo borrador antiguo.
- [Evidencia estructurada de recuperación](../../../output/android-v3-recovery-evidence.json). Las capturas del resumen son nativas, sin superposición del diálogo de fallo de System UI. El emulador presentó ese fallo de sistema en el arranque; se eligió esperar y se recapturó. No se atribuye al proceso de KnowNext.ai.
- Tras las pruebas se detuvo solo el paquete QA, se restauró la red a su estado anterior y se cerró el emulador iniciado para esta comprobación. Los datos de la instalación habitual permanecen separados.

## Límites y siguiente trabajo

**Diez paquetes iniciados; ninguno cerrado completamente.** El programa completo continúa autorizado, incluidas sus ampliaciones. Las capturas Android de este corte corresponden a la compilación 08: preceden a la cola de escrituras, al nuevo historial y a la decisión de conflicto manuscrito. Una prueba Rust o de componente no acredita esos recorridos nativos completos.

Siguiente corte de integridad: migrar borradores y sesiones al mover/renombrar, actualizar enlaces documentales además de imágenes y conservar un resultado explícito ante efectos parciales. Después, completar las superficies contextuales y el resto del [plan](plan.md). Siguen abiertos recuperación de copias dañadas/variantes, coordinación entre instancias, hitos, retención, mediciones, políticas y evaluación IA, configuración completa, captura avanzada, búsqueda/indexado, plantillas, exportación, portabilidad, accesibilidad y aceptación nativa.

No hay versión 3.0 publicada ni aceptación humana. VERSION sigue en 2.6.0; no se han ejecutado commit, push, integración ni release.
