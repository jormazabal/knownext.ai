# P10 · Integración, piloto y candidata 3.0
Padre: [V3-PLAN](../tarea.md). Responsable propuesto: Responsable técnico, QA, producto y release. Persona: por asignar. Estado: consolidación y regresión139 cerradas; etapa QA140 de candidata3.0.0 C1 instalada Windows MSI paralelo y Android QA/emulador cerrada en sus recorridos acotados; aceptación productiva/firmada, ARM físico y personas pendientes; publicación excluida.

## Objetivo
Aceptar el alcance integrado y preparar una entrega recuperable con evidencia independiente por plataforma.

## Alcance y aceptación por propuesta
Integración y aceptación del alcance seleccionado del programa; no duplica la propiedad de propuestas.

## Criterios compartidos del paquete
- P10-C1: Todas las iniciativas incluidas tienen criterios trazados y evidencia vigente; las excluidas siguen planificadas con razón.
- P10-C2: No quedan pérdidas silenciosas ni bloqueos P0 conocidos en recorridos seleccionados; existe aceptación nativa Windows y Android.
- P10-C3: La migración conserva proyectos y preferencias; volver a una versión anterior requiere compatibilidad o copia documentada.
- P10-C4: La futura release contiene MSI, NSIS, ambas firmas Windows, latest.json, APK firmado y android-latest.json; no se publica si falta alguno.

## Límites
Se conserva la arquitectura obligatoria del proyecto. La orden posterior del usuario autoriza implementar el programa completo y sus ampliaciones, conforme al plan principal. Las imágenes no acreditan implementación ni aceptación; cada entrega mantiene su verificación y límites explícitos. Las reglas comunes de privacidad, estado y recuperación se referencian desde el [plan principal](../plan.md) y no se redefinen de forma contradictoria aquí.



## Alcance vigente consolidado140 · 2026-11-06

La preparación y validación de la candidata instalada están autorizadas; no se publica. El cierre de la regresión local139 se conserva y no se repite por esta conciliación. Véase el [alcance consolidado de la candidata](../consolidacion-140-alcance.md). P10/U16 conserva aceptación instalada/física/humana; T17 real permanece aplazada sin gasto y las capacidades condicionadas conservan sus límites.


## Evidencia intermedia QA140 · Runtime Windows y Android comprobados

QA140 Windows C1 instalado por MSI3.0.0, identidad/perfil separados y2.6 preservada: runtime Tauri real, guardado por botón y paleta Ctrl+Shift+P → Guardar documento activo → Enter, SVG, ajustes/diagnóstico y reapertura con Markdown inalterado tras detención forzada posterior a guardado durable. No acredita cierre normal con cambios, migración/actualización productiva, firma de distribución, hardware o personas.

Evidencia: [MSI y propiedades](../../../../output/candidate-windows-package-140.json), [instalación exit0](../../../../output/candidate-windows-install-140.json), [runtime/UI y reapertura](../../../../output/candidate-windows-ui-140.json). La ausencia de Ctrl+S es una observación UX preexistente; no se anuncia ese atajo como implementado. El guardado por teclado comprobado usa la paleta, no Tab+Enter.

El cierre de esta etapa acepta sólo su alcance QA: no convierte P10-C2/C3/C4 en aceptación productiva completa, no genera firmas oficiales y no publica. Android dispone ya de evidencia final acotada; la aceptación completa de firmas/identidad productiva, dispositivo físico y personas continúa separada.


## Resultado Android QA140 confirmado

QA140 Android completado en emulador API36/x86_64, paquete ai.knownext.mobile.v3qa, versión3.0.0/3000000: actualización adb install -r del QA previo conserva UID/certificado y testigo antes de lanzar; edición Milkdown y botón Guardar, reapertura exacta, arranque offline sin ruta por defecto, Sistema/Vista avanzada y retorno al mismo documento comprobados. APK instalado SHA2568386f3aa85057e24b0d7d57eb65296c9412ac4c86206a0fd5b10615ac438c19b, firma debug QA existente verificada, sin firma productiva. Fuerza de parada QA y red restaurada al estado previo; no demuestra migración de la app pública2.6, ARM físico, hardware/SAF/Keystore completos o personas.

Evidencia final: [aceptación Android](../../../../output/candidate-android-140.final.json) y [actualización/edición/reapertura previas reutilizadas](../../../../output/candidate-android-140.upgrade.json). La primera actualización abrió la pestaña de Novedades, comportamiento previsto; el testigo se abrió por un toque y su contenido estaba intacto. El primer selector global de Vista avanzada se corrigió para señalar el control visible de Sistema; la comprobación final pasó sin modificar producto ni repetir la campaña. No se presenta esa observación intermedia como pérdida de estado ni fallo de datos.


## Cierre de la etapa QA instalada140 · alcance acotado

El alcance de candidata instalada QA140 está completado en los recorridos siguientes. P10 no queda cerrado como release pública ni como aceptación productiva, física o humana.

| Criterio de esta etapa | Resultado y evidencia |
|---|---|
| QA140-W1 · MSI QA aislado, instalación final y conservación del entorno | Comprobado: [paquete final](../../../../output/candidate-windows-package-final-140.json) y [reinstalación final](../../../../output/candidate-windows-final-install-140.json). Nombre/identidad/UpgradeCode separados, registro de licencia OFL resuelto, binario/documento conservados y2.6 normal intacta. |
| QA140-W2 · Runtime y trabajo documental Windows | Comprobado en [UI instalada](../../../../output/candidate-windows-ui-140.json): puente Tauri real, botón Guardar, paleta Ctrl+Shift+P → Guardar documento activo → Enter, SVG, ajustes/diagnóstico y reapertura tras detención forzada posterior a guardado durable. Binario idéntico permite reutilizar esta evidencia después del reempaquetado. No se afirma Ctrl+S, Tab+Enter, cierre normal con cambios ni recuperación de borrador no guardado. |
| QA140-A1 · Android QA instalado y continuidad | Comprobado en [actualización QA](../../../../output/candidate-android-140.upgrade.json) y [cierre Android](../../../../output/candidate-android-140.final.json): mismo UID/certificado debug, testigo conservado antes de lanzar, edición Milkdown/Guardar, reapertura exacta, offline, Sistema/Vista avanzada y vuelta al documento; QA detenido y red restituida. Emulador API36/x86_64, sin aceptación ARM física. |
| QA140-E1 · Evidencia y límites | Matrices50/70 conservadas; contexto QA separado de aceptación completa por fila. Regresión139 reutilizada, sin nuevas suites completas ni gasto IA. Firmas/canales productivos y personas mantienen sus puertas propias. |

MSI QA final reinstalado con exit0 y SHA256DAC25F7BEFA709546C788B8831A09A183455E0BF36AB2B92949314A683C24845; fuente del runtime736e7484, EXE instalado SHA256ED789DC3C7420A6932A90D316A4A57294F8A6C39EC3C7D6FCD290FADAD2FE433 idéntico al contrastado en UI. El único cambio posterior es de empaquetado WXS/OFL: clave HKCU resuelta, licencia instalada coincidente y documento previo conservado con hash7EE119262B6B4328D0EA6BDF6B6E459ABF69BD98FBF7ACFA617E3CC821D92E6D. La2.6 normal permanece intacta. Se reutilizan los recorridos UI Windows de guardado/teclado/paleta/SVG/ajustes/reapertura porque el binario y el contenido durable se conservan; no se afirma una nueva campaña ni salida normal con borrador pendiente.

Estado de los criterios generales P10: C1 dispone de trazabilidad local y alcance congelado; C2 sólo acredita aquí los recorridos QA seleccionados; C3 conserva pendiente la migración/actualización de la identidad productiva y el procedimiento de vuelta; C4 conserva pendientes firmas/activos/canales de distribución. La actualización del paquete Android QA previo no se presenta como migración de la aplicación pública2.6. No hay publicación ni autorización para publicarla en esta etapa.

Pendientes fuera de esta etapa: firmas oficiales/updater y APK ARM64 productivo; instalación/actualización/migración productiva2.6→3.0 y vuelta documentada; dispositivos ARM físicos y SAF/Keystore/hardware/cortes/espacio/suspensión; lectores/IME/DPI/lápiz/tacto/audio y personas U16. T17 de proveedor real permanece aplazada sin gasto. La aparición prevista de Novedades tras actualizar no acredita pérdida de estado; los testigos guardados se conservaron y se abrieron de forma explícita.
