# Avance 03 · Biblioteca recuperable y acceso rápido
31/10/2026 · Rama `codex/v3-programa` · [Resumen visual](avance.html)

## Implementado y contrastado
- **P05 / F04:** papelera privada por proyecto, sin dependencia de Git. Conserva carpetas, Markdown, notas y recursos. Escribe el manifiesto antes de mover; restaurar rechaza destinos ocupados. No hay eliminación automática ni purga permanente en esta entrega. El contenido conservado queda excluido de Git y de los escáneres normales.
- **P05 / F15:** selección mixta por casillas y teclado, rangos con Mayús, contador de elementos ocultos por filtro o plegado. Revisión previa de Mover y Papelera; el runtime normaliza carpeta y descendientes, comprueba pertenencia, rutas, huellas y destinos. Los borradores se protegen antes de ejecutar. Registro persistente y resultado por elemento; se detiene ante incertidumbre y nunca repite automáticamente un lote iniciado. Los registros interrumpidos se consultan en la papelera.
- **P08 / F01 y U08:** paleta accesible desde la barra principal y Ctrl/Cmd Mayús P, con acciones existentes, rutas, proyectos y documentos recientes de esta sesión. Busca también nombres de notas manuscritas. La búsqueda del árbol conserva su semántica por nombre; la paleta permite desambiguar mediante la ruta.
- **P08 / F01:** búsqueda local explícita de contenido Markdown guardado, con extractos, línea de origen, alcance y avisos. No envía contenido a proveedores. Límites actuales: 50 resultados, 10.000 entradas recorridas, 64 MiB de lectura y 2 MiB por archivo. No incluye borradores sin guardar, texto de notas manuscritas ni extracción de adjuntos. Lee el estado actual del disco; el índice incremental y la optimización para grandes bibliotecas siguen pendientes.
- **P01 / T04:** estado de lote y búsqueda guardada pueden responder fuera de la cola global de mutaciones. Una prueba concurrente mantiene esa cola ocupada y verifica la respuesta. Las demás operaciones conservan su coordinación previa; el desacoplamiento general no se considera terminado.
- **P02 / T08:** árbol y escáneres omiten enlaces y reparse points. Prueba real de junction externa en Windows. El resolvedor bloquea metadatos privados también por alias o rutas enlazadas.
- **P03 / U02:** cerrar el contexto devuelve foco al control; Esc respeta la propiedad de diálogos y menús. La paleta funciona con laterales ocultos. A 390 px no se observa desbordamiento horizontal.

## Evidencia
- **359 pruebas frontend / 77 archivos**, todas superadas: `output/v3-frontend-tests-04.log`.
- **155 pruebas Rust del workspace**, todas superadas, incluidas 83 de almacenamiento: `output/v3-rust-tests-04-final.log`.
- Compilación TypeScript/Vite superada. Persiste el aviso de chunks grandes, pendiente T10.
- Contratos de recuperación, cambios externos entre revisión y ejecución, colisiones, normalización y repetición de lotes comprobados sobre archivos reales. Simulación de interrupción y nueva instancia: el registro sigue visible y no reejecuta la operación.
- Playwright: enviar carpeta y archivo a papelera, restaurar ambos, mover conjuntamente a otro destino, revisar resultados, búsqueda por teclado y adaptación 390×844. Proyecto web-dev desechable, separado del contenido del usuario.
- **Windows nativo:** compilación Tauri debug con identidad `ai.knownext.desktop.v3qa`, almacenamiento separado y archivos de prueba. Arranque, alta de proyecto local, árbol y apertura de Markdown desde Ctrl Mayús P contrastados. Esta comprobación no acredita todavía todos los flujos nativos, DPI, grabación ni actualización. Captura: `implementacion-05-windows.png`.
- **Android:** SDK y NDK disponibles, emulador `knownext_api36` iniciado; compilación x86_64 debug en curso al redactar este avance. No se declara aún instalación ni aceptación offline de esta revisión.
- No se han hecho llamadas de generación facturables, commit, integración, publicación ni despliegue.

## Límites y trabajo pendiente
| Paquete | Estado actual |
|---|---|
| P00 | En curso: falta corpus completo, rendimiento y observación de usuarios |
| P01 | En curso: extender contratos, migración, cancelación y coordinación por recurso |
| P02 | En curso: claves nativas, CSP/permisos y políticas IA pendientes |
| P03 | En curso: referencias/propiedades y aceptación de todas las superficies pendientes |
| P04 | En curso: fidelidad, trazabilidad y reversión IA pendientes |
| P05 | En curso: papelera y primeros lotes implementados; combinación de conflictos, hitos, ciclo de proyecto, retención y lotes adicionales pendientes |
| P06 | En curso: simplificación completa, formularios y primer uso pendientes |
| P07 | En curso: miniventana implementada; aceptación nativa de estados y ampliaciones pendientes |
| P08 | En curso: paleta y búsqueda inicial implementadas; índice, plantillas, referencias e investigaciones pendientes |
| P09 | En curso: validación de plataformas iniciada; exportación, transferencia y migración completas pendientes |
| P10 | Pendiente: candidata, piloto, regresión y release |

**No se cierra ningún paquete completo.** La operación múltiple no es una transacción atómica de toda la selección: mantiene resultados individuales y conserva la información para revisar interrupciones. La comprobación de colisión no se presenta como compare-and-swap frente a programas externos no cooperativos. La retención de papelera y registros no tiene purga automática; cuotas y limpieza explícita siguen pendientes.

Siguiente trabajo: completar la comprobación Android en curso, seguridad de credenciales y permisos, cobertura contextual y simplificación de formularios; mantener el orden de dependencias del [plan](plan.md). [Avance anterior](avance-02.md).
