# Bloque 2 · Fiabilidad y continuidad del runtime

Autoridad: petición de completar el bloque 2 de las agrupaciones acordadas. Entrega 130; desarrollo completo autorizado, sin llamadas IA pagadas, instalación/publicación ni suites completas durante el desarrollo. Padre: P01, T01/T04/T05/T13/T15. Mantiene la definición del programa y el bloque 1.

## Criterios de cierre

- Autenticación GitHub, consultas remotas y trabajos Git lentos no mantienen el bloqueo global de documentos durante la red. Una sesión cancelada/cerrada o sustituida no se reactiva por una respuesta anterior. Los cambios de configuración de proyecto se publican bajo autoridad corta y comprobada.
- La cola conserva prioridades y antigüedad por recurso: un recurso ocupado no impide atender otro disponible. Las operaciones que exigen exclusión de proyecto mantienen esa exclusión sin impedir trabajar en otro proyecto.
- Cancelación en cola confirmada significa no inicio. Los trabajos que admiten puntos seguros pueden detenerse antes de publicación; pedir detener no demuestra detención. Una vez cruzado el punto de publicación no se promete cancelación. No se mata una llamada del sistema ni se repite una petición.
- El registro local, limitado y con esquema conocido, conserva correlación de tareas/etapas/tiempos sin contenido, nombres, rutas, cuerpos o credenciales. Al reiniciar, las tareas activas anteriores pasan a resultado por revisar; nunca se ejecutan desde el diario. Una avería del diario se comunica sin descartar sus bytes ni impedir editar documentos.
- Contratos de entrada/salida y errores distinguen no inicio, no publicación y resultado desconocido. Interfaz compacta con tareas de sesión anterior, cancelación correcta y diagnóstico sin contenido; mantiene el documento principal.
- Verificación dirigida de concurrencia, sesiones sustituidas, checkpoints, reapertura, formatos futuros, fallos de diario y UI. Reutilizar resultados no afectados; composición nativa/build al cerrar el bloque. Piloto físico y medición con corpus representativo quedan en P10.

## Trabajo

- [x] Cola por recurso y cancelación cooperativa.
- [x] Despacho lento y autenticación con publicación protegida.
- [x] Diario persistente y observación tras reinicio.
- [x] Contratos y UX de tareas/diagnóstico.
- [x] Comprobaciones dirigidas, backlog e informe visual.

Cierre local: [avance-130.md](avance-130.md). Aceptación instalada y regresión global siguen en P10.
