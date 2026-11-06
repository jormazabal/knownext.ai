# Recibo de consolidación local de la 3.0

El [recibo JSON canónico](v3-consolidation-evidence.json) conserva el resultado de la regresión139 y una huella de las fuentes/configuración al consolidar140, antes de cambiar la versión de la candidata. No ejecuta otra campaña ni acredita aceptación instalada.

- Frontend:1.158casos únicos en269archivos correctos; los7fallos iniciales están corregidos y contrastados de forma dirigida.
- Rust:740casos únicos correctos,22fallos iniciales corregidos y5casos nuevos. Dos benchmarks explícitos adicionales, omitidos deliberadamente de la campaña ordinaria.
- TypeScript, build frontend de producción, comprobación de bundle y comprobación Rust Android correctos según los registros139.
- Sin ejecución de GitHubActions, publicación, instalación, aceptación humana o evaluación real de IA acreditadas por este recibo.

Las huellas de fuente son de los bytes del árbol de trabajo durante esta consolidación. No se presentan como un manifiesto completo capturado retroactivamente antes de la campaña original; los7archivos del manifiesto frontend previo sí se han comparado y coinciden. Una normalización LF/CRLF de Git puede variar el hash bruto sin cambiar el contenido lógico.

Los logs detallados, capturas, mediciones y binarios permanecen en áreas locales ignoradas. Un clon limpio conserva este resumen y sus hashes, pero no esos archivos. No copiar perfiles ni datos privados al repositorio para completar la evidencia. Los nombres de coordinación se excluyen antes de consultar su metadata o abrirlos.

Para la candidata se reutiliza la regresión no afectada. Cambiar versión, documentación o consolidación exige comprobar sus propios invariantes y reconstruir el paquete correspondiente; los cambios de comportamiento, dependencias o configuración relevante requieren sólo las comprobaciones afectadas. La validación instalada Windows/Android y el piloto siguen siendo hechos distintos.

Antes del commit se normalizaron únicamente líneas vacías terminales y la representación equivalente de un literal Rust de espacio/salto/tabulación. El JSON conserva la lista y las huellas finales; no cambian comportamiento ni dependencias y no se repiten suites por este formato.
