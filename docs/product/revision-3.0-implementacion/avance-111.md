# Avance111 · Teclado y vuelta al punto de trabajo

[Reporte visual](avance-111.html) · [Plan](plan.md).

U02/U13: Guardado y sincronización usa el límite ModalFrame compartido: Tab/Shift+Tab quedan dentro, el fondo se aísla con inert, Escape cierra y el foco vuelve al origen conectado y visible. La revisión secundaria conserva su propia propiedad modal. Tabla, tarjetas, decisiones y callbacks permanecen operativos; cierre con control visible o Escape.

La devolución comprueba visibilidad, aislamiento y que el foco se haya aplicado. Si cambiar el tamaño oculta el control de origen, se elige el padre modal o el fallback visible; el panel aporta el área principal del workspace con tabindex-1. La restauración evita desplazar el documento. No se fuerza foco a un control oculto o deshabilitado ni se limpia aislamiento de otro propietario.

Tres casos nuevos (2 del panel/1 compartido) y12 afectados pasan: Tab/Shift+Tab/Escape, aislamiento, retorno al origen, fallback tras ocultarlo, modal secundario, desmontaje conjunto y StrictMode. TypeScript final correcto. App/Milkdown y panel reales con API de resumen controlada; teclado/foco/inert/resize reales del navegador: capturas470–473 inspeccionadas, ciclo de foco, Escape, retorno al launcher de escritorio y al documento tras pasar a320px. Fondo restaurado sin inert residual, sin desbordamiento, errores o red externa. No son aceptación instalada ni prueba de lector de pantalla/dispositivo físico.

Sin cambios Rust ni repetición de sus pruebas; sin suites completas, proveedor o gasto IA. Accesibilidad integral, otros diálogos/idiomas/DPI y aceptación permanecen pendientes. Sin commit, instalación, candidata o publicación; VERSION2.6.0.
