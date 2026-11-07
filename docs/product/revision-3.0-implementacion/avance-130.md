# Avance 130 · Bloque 2: fiabilidad y continuidad del runtime

[Reporte visual](avance-130.html) · [Criterios](bloque-130.md) · [Backlog](backlog.csv).

Bloque 2 cerrado en desarrollo local en el alcance acordado. El programa global continúa; la aceptación instalada y la regresión final se mantienen en P10.

## Implementado

Autenticación GitHub, repositorios, consultas y operaciones Git auditadas pasan a una vía independiente de la autoridad global de documentos. La configuración publica bajo autoridad corta y consulta la red después. Las operaciones Git mantienen reserva de proyecto: no se permite sustituir su ubicación durante el trabajo, y otro proyecto puede seguir guardando. La cola comprueba recursos elegibles, prioridades y antigüedad entre vías, evitando que un recurso ocupado bloquee otro libre.

Autenticación publica solo si coinciden generación y revisión del desafío/estado/credencial. Cerrar sesión o sustituir el desafío invalida respuestas anteriores; el controlador React comprueba su propia generación. Consultar estado es de lectura. Un fallo al listar repositorios se devuelve como fallo, sin simular una lista vacía válida.

Detención por etapas en autenticación, repositorios y reindexado: pedir detener un trabajo iniciado no lo declara cancelado. El siguiente punto seguro anterior a publicación confirma la detención; desde publicación no se ofrece cancelar. No se interrumpe por fuerza una llamada HTTP, Git ni E/S del sistema. Los demás dominios conservan su mecanismo propio o cancelación solo en cola.

Diario local versionado, acotado a384 metadatos/512KiB, sin nombres, rutas, cuerpos, prompts ni credenciales. Al reabrir, queued/running anteriores pasan a resultado por revisar; el diario no ejecuta ni reenvía trabajos. Los recibos de dominio siguen siendo la autoridad para continuar operaciones de negocio. Un formato futuro o avería conserva bytes, desactiva la persistencia técnica durante esa sesión y avisa sin impedir editar.

Sobre IPC protocolVersion1 correlacionado por operationId/completedAt, entradas estrictas y validación SDK. Resultados distinguen no inicio, detención antes de publicar y resultado desconocido. La escritura del diario durante admisión/inicio/cancelación ocurre en trabajadores, no en el hilo UI. El registro mantiene un mutex durante su escritura pequeña: no se promete ausencia absoluta de esperas de disco.

UX: tareas de sesión anterior, etapas comprensibles, solicitud y detención confirmada diferenciadas, sin botones de repetición/reanudación automática. Aviso completo limitado al45% de la altura; lista desplazable, controles de44px y documento principal conservado. Diagnóstico explícito de50 entradas, sin etiquetas ni contenido privado.

## Comprobaciones

19 contratos nativos dirigidos correctos:11 nuevos (4 de core,4 de almacenamiento y3 de composición Tauri) más8 afectados de cola/clasificación.23 casos frontend correctos; tras compactar el aviso se repitieron solo sus3 casos. TypeScript y build de producción correctos. La composición Tauri Windows compila en los tests de biblioteca finales. No se ejecutaron suites completas.

El primer test de clasificación usaba una ruta IA singular inexistente; se corrigió al endpoint real interactions. La campaña inicial encontró dos instancias del módulo por el timestamp HMR del entorno Vite; el adaptador se liga al módulo realmente cargado. Las capturas finales son555–558 y reemplazan esos intentos. No se cuentan repeticiones como casos nuevos.

Campaña con App/Milkdown/controlador reales y adaptador de observación controlado, sin inyectar puente Tauri ni contactar servicios externos. Verifica sesión anterior sin ejecución, una sola solicitud de detención, confirmación not-applied, ausencia de cancelación al publicar, edición/guardado conservados y diagnóstico sin etiquetas/contenido. A320×640: ancho total320, aviso288px, botones44px; sin errores de página ni solicitudes externas. No equivale a autenticación remota real, selectores nativos o aplicación instalada.

Evidencia: output/v3-runtime-block-native-final.log; output/v3-runtime-block-scheduler-affected.log; output/v3-runtime-block-lanes-affected.log; output/v3-runtime-block-frontend.log; output/v3-runtime-block-compact-ui-final.log; output/v3-runtime-block-build-final.log; output/v3-runtime-block-browser-final-captures.log; output/v3-runtime-block-browser-evidence.json; output/v3-runtime-block-verification.json.

Backlog:50 propuestas y70 capacidades conservadas, IDs únicos. T01/T04/T05/T13/T15 actualizados y capacidades de continuidad/diagnóstico conciliadas. Plan padre/P01, arquitectura y checklist manual actualizados. Los historiales previos permanecen como cortes anteriores, sustituidos por130 para estos contratos.

## Pendiente fuera de este bloque

P10: regresión completa al finalizar todo el programa, piloto instalado Windows/Android, suspensión/actualización/audio, cortes/espacio físicos y medición con corpus representativo. Android no se recompila mientras siga la incidencia de entorno Gradle ya registrada; no se activa la UI nativa Windows. Continúan los otros bloques funcionales del backlog, incluidas las ampliaciones de combinación, copias programadas y portabilidad. La campaña IA real sigue pendiente por decisión de no gastar.

Sin llamadas a proveedores ni gasto IA; sin instalación, publicación, commit ni cambio de VERSION2.6.0.
