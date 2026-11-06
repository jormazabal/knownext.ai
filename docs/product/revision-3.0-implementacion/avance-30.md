# Favoritos y diagnóstico con control
2026-11-01 · Programa completo en curso; sin paquetes completos cerrados.

[Resumen visual](avance-30.html) · [Plan único](plan.md) · [Pendiente por resultado](avance-28.md#trabajo-que-falta-por-resultado)

## Incorporado
- Favoritos persistentes por proyecto en Acceso rápido. Rutas visibles para homónimos; un destino ausente conserva el marcador e impide navegación. Quitar favorito conserva archivos. Renombrados/movimientos gestionados mantienen identidad y destino; anotación fallida comunica efecto parcial sin ocultar el traslado confirmado.
- Almacén de favoritos validado/acotado con revisión obligatoria y formatos futuros conservados. Un envío en vuelo y lectura conciliatoria ante acuse desconocido, sin repetir mutaciones. La retirada de un proyecto mantiene sus favoritos.
- Diagnóstico técnico local con retención acotada. Preferencia de registro respetada en Rust; desactivada no crea eventos. No transmite message/detail/source libre al bridge ni los escribe en el nuevo almacén.
- Informe explícito y revisable en Sistema, copiado sin rutas/endpoints/errores crudos. Copia fallida conserva texto seleccionable. El error operativo original puede incorporar el ID de un evento realmente confirmado, sin reemplazar avisos posteriores.
- Registros heredados conservados y excluidos del informe seguro. No se leen ni exportan; no se añade telemetría ni envío a terceros.

## Comprobación focal
La instrucción del usuario se mantiene: sin suites completas frontend/Rust ni empaquetado por ajuste.

Rust: contratos focales de favoritos (persistencia/revisión, renombrado/movimiento, origen intacto, ausencia, formatos/permiso y efecto parcial) y diagnóstico (desactivación, ausencia de canarios privados, retención, futuro/dañado y escritura fallida). Ruta existente de logging actualizada y contrastada con preferencia explícita. Logs: output/v3-favorites-focused-29.log, v3-diagnostics-focused-30.log y v3-diagnostics-route-focused-30.log.

Frontend: destino ausente no navega, retirada conserva contexto/foco, acuse desconocido no se repite y respuesta antigua no reemplaza otro proyecto. Bridge diagnóstico excluye texto libre; preparación explícita y copia fallida retienen informe; serialización filtra campos desconocidos. Copia de diagnóstico básico existente contrastada tras retirar rutas. Logs v3-favorites-ui-focused-29.log, v3-diagnostics-ui-focused-30.log y v3-diagnostics-existing-copy-focused-30.log. TypeScript final correcto en v3-product-types-02-30.log, tras corregir una opción de test no admitida por RTL.

Componentes reales con API/informe controlados en navegador: escritorio,412/320px; sin overflow, acciones44px, destino ausente y selección por teclado, foco tras retirar, informe conservado al fallar copia. La muestra inicial de diagnóstico fijaba fuente raíz14px y reducía rem; corregida a16px de la aplicación antes de capturas finales, sin cambio de producto. Evidencia: [favoritos](../../../output/v3-favorites-browser-evidence-29.json), [diagnóstico](../../../output/v3-diagnostics-browser-evidence-30.json). Estas imágenes no acreditan persistencia nativa.

## Hito nativo agrupado58
Fuentes congeladas:513 entradas, SHA c219e662cded59bfbeda2360ce54f82c53ae59dfecec80ba85fdba5dd631db89. Incluye ajustes post57 del visor, importación, historial/continuidad, favoritos y diagnóstico. Compilación terminada. APK58:574.901.794bytes, SHA789ff834a1e11843d881a805c420ba38cbbd70b874b4ed315ad4e56381734ed2. Fuentes congeladas sin deriva. Instalación verificada y campaña nativa agrupada terminada. El SHA instalado coincide con el artefacto. Los cuatro hashes QA se comprobaron antes de construir y coinciden con la restauración anterior; QA estaba detenida y Windows habitual sigue sin operarse.

## Pendiente
- Continuar los demás frentes. Hito58 y restauración terminados; no se equiparan a aceptación completa de la aplicación.
- Personalización de atajos, movimientos externos no adivinados y demás ampliaciones de productividad.
- Código detallado por operación y coordinación de diagnósticos entre instancias siguen siendo ampliaciones; el informe actual registra categorías/estados técnicos, no texto libre del error. Los logs heredados requieren revisión explícita para limpieza, no se borran automáticamente.
- Continúan integridad/planificación, almacenamiento/ciclo de vida, conflictos/lotes ampliados, fidelidad, ajustes/accesibilidad, captura/OCR/actas, conocimiento/plantillas/investigación, exportación/portabilidad y cierre de candidata. No se reduce el alcance de las50propuestas/70capacidades.
- Regresión completa al finalizar la implementación; integración, piloto, publicación y aceptación humana sin ejecutar.

## Resultado nativo58 y ajuste posterior
Android sin conexión: favorito mantiene ID/ruta tras renombrado/reinicio; paleta operable con IME visible. Importación rechazada ante colisión y copia explícita con original intacto. Diagnóstico desactivado no registra; un llamador anterior que envía canario en message/detail no lo incorpora al almacén/informe. Tarjeta de Sistema prepara el informe real con el ID confirmado; no se ejecutó copia al portapapeles del emulador.

Visor:2/3 en horizontal915×412 y tras volver a412×915; fallo de lectura deja contador? y consulta conservada. Tras restituir permiso/reintentar recupera2/3 y3coincidencias con SHA original. [Favoritos nativos](../../../output/playwright/revision-3.0/164-android58-favoritos-persistidos.png), [PDF recuperado](../../../output/playwright/revision-3.0/167-android58-pdf-recuperado.png), [diagnóstico nativo](../../../output/playwright/revision-3.0/168-android58-diagnostico-seguro.png).

Android no dispone de Git local: no se acredita comparación nativa de commits ni se fabrican versiones. La revisión se hizo sobre capacidades reales; continúa vigente la evidencia de Git en Rust/Windows y componentes de historial en navegador. Capturas UIA iniciales sin raíz, etiqueta no resuelta en automatización y espera con puntuación equivocada se trataron como límites del harness, sin repetir mutaciones ni atribuirlos al producto.

Restauración completa del entorno previsto: cuatro hashes coinciden, red/orientación repuestas, app detenida y solo tres fuentes/cuatro almacenes propios, directorios nuevos vacíos, backups/dumps UI temporales y forward propio retirados mediante guardas. [Evidencia](../../../output/android-v3-product-milestone-evidence-58.json) · [Restauración](../../../output/android-v3-product-milestone-restoration-30.json).

C31, posterior a APK58: el historial ya diferencia plataforma no disponible, desactivado, sin preparar y consultable. Conserva acceso a commits existentes aunque los guardados automáticos estén desactivados. Acceso a ajustes solo cuando puede configurarse y singular correcto de evento en diagnóstico. Contraste focal de estados, Git real y UI/TypeScript correcto; no otro APK por este ajuste. [Componente del nuevo estado](../../../output/playwright/revision-3.0/169-historial-capacidad-412.png). No se ha cerrado el programa completo.
