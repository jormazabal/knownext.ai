# Estrategia de validación

La validación se organiza por comportamiento y por hitos. Durante la implementación se ejecutan pruebas focales que cubren los contratos modificados. Al terminar el conjunto se ejecuta una regresión completa; los arreglos posteriores repiten únicamente los resultados que hayan invalidado. Un build, una captura o un benchmark no sustituyen esa regresión.

## Desarrollo por bloques

1. Identificar el contrato o interacción afectados y los archivos de los que dependen.
2. Ejecutar sus pruebas pequeñas, usando fixtures sintéticas y rutas temporales propias.
3. Agrupar compilaciones nativas, build frontend y campañas de UI en hitos de producto. No repetir todo el workspace por cada ajuste visual o de texto.
4. Conservar logs y hashes de fuente/build de los resultados reutilizados.
5. Tras una corrección, repetir sólo el caso fallido y los casos directamente afectados. Ampliar cuando cambie un contrato compartido o aparezca otro defecto concreto.

Los casos de fixtures desactualizadas se alinean con el contrato actual, sin retirar protecciones para hacer pasar un test. Por ejemplo, restaurar o descartar un borrador requiere su revisión de contenido y ubicación; la prueba debe aportar los fingerprints válidos y comprobar que una copia no autorizada continúa bloqueada. La carga diferida del visor se prueba sin convertir un timeout corto de compilación de la biblioteca en un supuesto fallo del modo readonly.

## Runner Rust y aislamiento

Desde la raíz:

```powershell
pnpm rust:test
```

Este comando valida primero el contrato del runner y después ejecuta `scripts/test-native.mjs`. El runner invoca Cargo para `--workspace --lib --tests --no-fail-fast`, con `--test-threads=1`, sin shell intermedio y con ventana oculta en Windows. Conserva el código de salida fallido del proceso hijo. `--no-fail-fast` permite recoger los demás targets aunque uno falle; no convierte fallos en éxitos.

Antes de crear el proceso Cargo se elimina de **una copia del entorno del proceso** este conjunto de variables:

- `KNOWNEXT_SHARED_PROJECT_FIXTURE`
- `KNOWNEXT_SHARED_STATE_FIXTURE`
- `KNOWNEXT_SHARED_MODE`
- `KNOWNEXT_OWNED_LOCK_FIXTURE`
- `KNOWNEXT_OWNED_LOCK_MODE`

No se modifica el entorno persistente del usuario. Se conservan `PATH`, `CARGO_TARGET_DIR` y las demás opciones ordinarias del toolchain. Los probes que necesiten ejecutar un hijo deben darle explícitamente su fixture temporal propia; nunca deben heredar por accidente una ruta externa proporcionada al proceso de pruebas.

Las campañas `#[ignore]` no se activan en la regresión normal: el runner no añade `--ignored` ni `--include-ignored`. Los benchmarks de corpus y dispatcher se solicitan aparte, una vez por hito relevante y con salida identificada. Las pruebas del runner usan un `spawn` controlado para verificar entorno, argumentos, `windowsHide` y propagación del error sin ejecutar una segunda suite Cargo.

No abrir, inspeccionar con metadata ni borrar archivos de coordinación como `owner.lock`, `runtime-owner.lock` o `capture.lock` como técnica de recuperación de tests. La ausencia de un resultado no autoriza a apropiarse de un perfil o workspace real.

## Regresión final y continuación

El frontend se ejecuta desde `apps/desktop` con `pnpm test`; una selección dirigida usa `pnpm exec vitest run <archivo> -t <caso>`. La compilación de TypeScript y Vite se agrupa con el build del hito. El cierre Rust usa el runner anterior.

Si una campaña se interrumpe o un runner anterior se detiene en el primer target fallido, registrar qué targets llegaron a ejecutarse. Continuar los pendientes con su misma procedencia y entorno saneado; no volver a ejecutar los ya aprobados sólo para obtener otro resumen global. Tras corregir un fallo, añadir su resultado focal al registro de validación y conservar el log original.

La consolidación debe incluir el comando, alcance, fuente/build aplicable, resultado, pruebas omitidas o reutilizadas y motivo. Distinguir fallo funcional, fixture antigua, test no ejecutado y campaña ignorada. No sumar una misma prueba varias veces por haberla repetido durante un arreglo.

Los logs de una campaña parcial o de sus correcciones **no declaran por sí solos la regresión final aprobada**. El informe de entrega publica ese veredicto sólo después de consolidar los targets pendientes y todos los fallos relevantes. No se reescriben los logs iniciales para ocultar fallos ya corregidos.

## UI y fronteras de ejecución

Las pruebas de componentes comprueban interacciones críticas: foco y retorno, aislamiento de modales, Escape, acciones duplicadas, confirmaciones, cambios de ámbito y acuses inciertos. Ante un acuse perdido se consulta el recibo correspondiente; no se repite una mutación como comprobación. La validación de interfaz debe mantener el editor visual Milkdown y las protecciones de borradores y migración.

Una campaña en Chrome puede usar los componentes reales con APIs controladas o el build de producción con la API central de desarrollo. El informe indica cuál de los dos modos empleó. Una API controlada o el navegador no acreditan funcionamiento del runtime nativo. No se inyecta un puente Tauri falso para presentar una prueba web como aceptación nativa.

Las campañas descritas en este hito utilizan documentos sintéticos, sin proveedores IA de pago, micrófono real, UI nativa ni Gradle/ADB. No hay autorización implícita para activar esos recorridos al ampliar pruebas. Empaquetado, actualización, operación offline y aceptación en dispositivos físicos mantienen evidencias propias y un hito explícito.

## Rendimiento reproducible

`scripts/measure-frontend-load.mjs <etiqueta>` recorre el grafo estático del manifiesto de un build ya generado y registra bytes y hashes. No compila. `scripts/benchmark-frontend.mjs` mide un preview local de producción con procesos Chrome aislados y fixtures sintéticas. Admite `--label=...`, `--url=http://127.0.0.1:1432/`, `--runs=3`, `--playwright-module=<package.json>` y `--browser-path=<ejecutable>`; los argumentos con espacios deben ir entre comillas.

La secuencia del bloque 139 conserva seis muestras anteriores y seis intermedias: tres para una nota pequeña y tres para una de 331.455 bytes. Tras separar el último import de transferencia sólo se repitieron bytes y aperturas funcionales. No se reasignan las latencias intermedias al build final. La edición automatizada introduce 14 caracteres y mide el flujo completo, no latencia por tecla.

Separar campañas de latencia de compilaciones y otras cargas intensivas. Las comprobaciones funcionales y de bytes pueden ejecutarse durante compilaciones, pero sus tiempos no se publican como benchmarks. Una vez medidas las variantes previstas, no añadir rondas completas salvo que un cambio invalide esas medidas. Los resultados lentos y la cobertura parcial se conservan en el informe.

`scripts/verify-deferred-production.mjs` verifica mediante la UI pública que ajustes y transferencia se cargan al solicitarse y que reabrir ajustes reutiliza su módulo. `scripts/render-frontend-benchmark.mjs` genera el resumen visual de los artefactos de este hito. El preview de pruebas usa un puerto separado; al terminar se registra PID y línea de comando y se cierra sólo el proceso creado para la campaña, preservando el servidor del usuario.

Referencias verificables del bloque:

- [Contrato del runner](../../output/v3-block11-native-runner-contract.log).
- [Campaña Rust del dispatcher](../../output/v3-block11-native-performance.json).
- [Corpus de búsqueda y PDF sin OCR](../../output/v3-block11-search-corpus-benchmark.json).
- [Grafo frontend final](../../output/frontend-load-block11-final.json) y [aperturas finales](../../output/v3-block11-deferred-production-evidence.json).
- [Mediciones anteriores](../../output/frontend-benchmark-block11-before.json), [intermedias](../../output/frontend-benchmark-block11-after.json) y [resumen visual](../../output/v3-block11-frontend-performance.html).
- [Alcance y límites de las medidas](../architecture/runtime-performance-and-scale.md).

Estos artefactos documentan comportamientos y campañas concretas. La evaluación real de calidad de IA permanece separada cuando no hay presupuesto autorizado; no se sustituye por una respuesta sintética presentada como resultado de proveedor.
