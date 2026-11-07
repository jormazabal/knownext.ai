# P03 · Plan evolutivo
[Definición](tarea.md) · [Plan principal](../plan.md)
Estado: Desarrollo local del paquete integrado y regresión139 correcta; aceptación instalada/física/humana P10 y T17 real según alcance pendientes. Sin candidata, publicación ni instalación3.0. Responsable: Diseño/UX y frontend; persona por asignar. Esfuerzo relativo XL, sin conversión a calendario.

## Entrada
- [P00](../P00/plan.md): entradas pertinentes según las dependencias del plan principal; no exige finalizar todas sus ampliaciones.
- [P01](../P01/plan.md): entradas pertinentes según las dependencias del plan principal; no exige finalizar todas sus ampliaciones.
Hito propuesto: H2.

## Cortes de trabajo
1. [x] Fijar tokens, escala, contraste y componentes de foco, botones, menús, campos y diálogos; validar claro/oscuro y tacto.
2. [x] Crear shell de tres paneles: centro prioritario, laterales independientes y selectores contextuales; categorías sustituyen árbol en ajustes.
3. [x] Preservar por contexto selección, scroll, pestañas y borradores al cambiar u ocultar paneles; garantizar reapertura por teclado.
4. [x] Integrar asistente plegado/temporal/fijado en el panel contextual: un solo compositor; mantener actividad y destino aunque esté oculto.
5. [x] Adaptar a ventana estrecha con una tarea por vista, retorno claro y teclado virtual; extender componentes a todas las superficies.


Las casillas anteriores describen implementación local/contratos. Lectores reales, teclado virtual, tacto/lápiz/DPI físicos y comprensión de usuarios siguen pendientes en P10/U16; las capturas no certifican esos hechos.

## Superficies a inspeccionar antes de editar
apps/desktop/src/layouts; src/app; src/components; src/features/assistant; estilos y tokens.
Las rutas describen el ámbito propietario esperado, no una orden de modificar todos sus archivos. Confirmar contratos y cambios locales al comenzar cada corte.

## Verificación prevista
Componentes de panel/diálogo, pruebas de teclado y conservación de estado, capturas en tamaños del estudio, NVDA/TalkBack y teclado nativo.
Cada criterio P03-C se asociará a evidencia del corte que lo implemente, con entorno y resultado. Las verificaciones y sus límites se registran en los avances enlazados; no equivalen por sí solas al cierre completo del paquete.

## Riesgos y tratamiento
Montar/desmontar paneles puede perder estado; densidad excesiva puede empeorar tacto y legibilidad. Mantener modelo de sesión fuera de vistas.

## Ampliación y condición de entrada
Alturas configurables, preferencias adicionales y densidad configurable después de validar su utilidad.
Se concreta el comportamiento, contrato y aceptación del siguiente corte antes de empezar; permanece en el backlog aunque no entre en 3.0.

## Progreso y siguiente paso
- Hecho: implementación local y verificación dirigida de los recorridos descritos en [UX138](../avance-138.md) y [cobertura por propuesta](../ux-138-cobertura.md); consultar sus límites, no la antigua cabecera de primer corte.
- Hecho: regresión local139 cerrada; reutilizar evidencia no invalidada, sin repetir suites completas por cambios documentales.
- Pendiente: preparar y aceptar la candidata instalada Windows/Android, migración/actualización/recuperación, dispositivos/fallos físicos y recorridos con personas en P10/U16. T17 real sigue aplazada sin gasto.
- Próximo paso: el coordinador completa la revisión e integración Git y diagnostica el entorno; después construye y valida la candidata instalada según la autoridad actual. Registrar cada resultado por artefacto, entorno y revisión.
- Publicación excluida por instrucción actual. La autorización de preparar e instalar no acredita instalación realizada ni aceptación humana. Las capacidades condicionadas se conservan sin simulación.

## Avance 01
Ver [evidencia y pendientes](../avance-01.md). La orden actual autoriza ejecutar el programa completo. Este paquete no se declara completado.


## Avance 02
Ver [implementacion, pruebas y pendientes](../avance-02.md). Este paquete permanece abierto: no se equipara una implementacion parcial a su aceptacion completa. El desarrollo del programa completo esta autorizado.


## Avance 03
Ver [contrastes, implementación y pendientes](../avance-03.md). Se mantiene abierto el paquete y su alcance restante; no se declara completado por esta entrega.


## Avance 04
Estado y evidencia vigentes: [continuidad, seguridad nativa y primer uso](../avance-04.md). Continúa el alcance completo restante; no se cierra este paquete.


## Avance 05
Recuperación, continuidad e historial: [evidencia y pendientes](../avance-05.md). No se cierra el alcance restante de este paquete.


## Corte 07
Información y referencias contextuales, corpus acotado, capacidades por plataforma y restauración del panel fijado. [Evidencia transversal](../avance-07.md). Este corte no cierra el paquete ni sus ampliaciones.


## Corte 08
Revisión de variantes y copias dañadas, recuperación como otro archivo, archivo privado verificado y categorías fijas. [Evidencia transversal](../avance-08.md). No cierra el paquete ni sus ampliaciones.


## Corte 09
Configuración integrada, continuidad, errores por grupo y guardado ordenado. [Evidencia transversal y límites](../avance-09.md). No cierra el paquete ni sus ampliaciones.


## Corte 10
Estado crítico protegido, revisión/restablecimiento conservando originales y aislamiento del inicio. [Evidencia transversal y límites](../avance-10.md). No completa el resto del paquete ni sus ampliaciones.


## Corte 11
Búsqueda de ajustes, resumen integrado, foco y trabajo de vistas ocultas. [Evidencia transversal y límites](../avance-11.md). Continúa todo el alcance restante; no se cierra el paquete.


## Avance 12
[Espera principal, continuidad y revisión de resultados IA](../avance-12.md). Verificación parcial frontend/Rust y Android sin red; no cierra el paquete ni sus ampliaciones. Continúan todos sus criterios restantes y la aceptación nativa.


## Avance 13
[Revisión, borradores y autoridad IA](../avance-13.md). Evidencia parcial por tramo; continúan el resto del paquete y sus ampliaciones.


## Avance 14
[Imágenes/trazos y revisión raster](../avance-14.md). Evidencia parcial nativa/Rust/frontend; siguen el resto del paquete y sus ampliaciones.


## Avance 15
[Exportación comprobada y destino Android](../avance-15.md): 479 frontend, suite Rust 259/259 más dominio PDF actualizado 19/19 y APK 29 contrastado sin red. Corpus de 15 páginas, cancelación, nombre elegido, escritura y lector nativo. Continúa todo el programa; no cierra paquetes ni sus ampliaciones.


## Avance 20
[Continuidad de revisión y navegación a carpetas](../avance-20.md): 520 frontend, 300 Rust y APK42 offline. Tres ajustes C19 contrastados; campo vacío/reinicio, fallo de permiso y borrador exacto conservados. Se detecta pérdida ALT de imagen, F16/P0, priorizada en C21. Continúa todo el alcance restante.


## Avance 21
[Imágenes que conservan su significado](../avance-21.md): corrección F16/P0 contrastada; 535 frontend, 305 Rust y APK48 offline. Documento idéntico al reabrir; pies debajo, sin URLs temporales. Exportaciones nativas y preparación ZIP verificadas. Entorno QA restaurado; continúa C22/F17 y todo el programa, sin cierre completo del paquete.


## Avance 22
[Retirar un proyecto sin perder su trabajo](../avance-22.md): 554 frontend, 313 Rust y APK50 offline. Retirada/reincorporación, permisos, colisión y reinicio contrastados; bloqueo de modales detectado en 49 y corregido/verificado en 50. Cuatro hashes y red QA restaurados. Continúan F17, todas las áreas y ampliaciones, sin cierre completo de paquetes.


## Corte 26 definido
Visor al ancho real, controles progresivos y prioridad del documento en móvil. Definición y criterios en el [plan principal](../plan.md). C25/QA restituida como entrada; no cierra el paquete.



## Avance 26
[Consulta al ancho real](../avance-26.md): visor progresivo, PDF medido, conteo/búsqueda reales y contexto móvil a demanda; APK57 contrastado y QA restituida. Dos ajustes posteriores pasan solo sus dos regresiones focales y se agrupan en el próximo hito nativo. La instrucción del usuario reserva suites completas al final; continúan todos los frentes del programa.


### Bloque96 · Estructura acotada y resultado conservado
Lector separado con48 niveles/20.000 entradas/10.000 nodos/8MiB/2s cooperativos, error explícito sin árbol parcial. Publicación y refresco separados; pestañas conservadas sin lectura, última vista con aviso/reintento/búsqueda, también sin navegación y en móvil. Dos contratos Rust y cuatro frontend nuevos, TypeScript y capturas400–403 con App real/API controlada. [Evidencia y límites](../avance-96.md). Navegación progresiva, retención/portabilidad, variantes mixtas y aceptación instalada pendientes.

### Bloque107 cerrado · Respuestas de la sesión actual

Admisión inmediata por proyecto y respuestas de última lectura/visita; cambiar/volver no revive callbacks ni libera otro trabajo. Tres casos dirigidos, TypeScript y capturas454–457 con App real/API controlada. [Evidencia/límites](../avance-107.md). No cierra el paquete completo.

### Bloque108 cerrado · Guardado legible en móvil

Tarjetas móviles con nombre/ruta/fecha y tres estados visibles, filtros plegables y carga sin falso vacío. Dos casos nuevos/seis afectados, TypeScript y capturas458–464 con App real/API controlada a320x780/560. [Evidencia/límites](../avance-108.md). No cierra el paquete completo.

### Bloque111 cerrado · Teclado y vuelta al punto de trabajo

Límite modal compartido en guardado/sincronización, fondo aislado, Tab/Shift+Tab/Escape y devolución a origen visible o área principal tras resize. Tres casos nuevos/doce afectados, TypeScript y capturas470–473 de App real/API controlada. [Evidencia/límites](../avance-111.md). El programa y el paquete mantienen trabajo pendiente.


### Bloque126 cerrado

Gestor lateral de Grabaciones comparte el control compacto: fuentes en una fila, tiempo/niveles/acciones fijos y sesiones visibles al entrar, cierre/Ajustes útiles y áreas integradas de44px. La ventana principal no se redimensiona por usar composición compacta: geometría exclusiva de recordings. Contexto de bandeja conservado; documento intacto al configurar, sin captura/envíos automáticos (126). [Evidencia y límites](../avance-126.md). Programa completo abierto; aceptación física y ampliaciones restantes.


## Conciliación documental139 previa al cierre de regresión · 2026-11-06

Cierre UX local implementado (138); regresión139 y aceptación física/humana P10 pendientes. Las notas históricas anteriores conservan su fecha/alcance; sus frases de «pendiente» no reabren desarrollos ya entregados. Evidencia actual: [UX138](../avance-138.md) y [cobertura por propuesta](../ux-138-cobertura.md). El [bloque139](../bloque-139.md) está en verificación final: la regresión Rust y correcciones concretas continúan, sin PASS global anticipado. P10/U16 conservan aceptación física/humana; T17 proveedor real permanece aplazado por decisión de no gasto. Git nativo Android y capacidades dependientes de proveedor/hardware siguen sujetos a disponibilidad real.


## Cierre verificado139 · 2026-11-06

Regresión local139 cerrada:1.158casos frontend y740Rust únicos correctos; build/tipos/bundle y comprobación Rust Android correctos. Dos benchmarks aislados adicionales. Una campaña completa y repeticiones sólo de fallos/casos invalidados. La revinculación con origen ausente está corregida y revisada por un segundo agente. [Resultado y límites](../avance-139.md). Las notas históricas conservan su fecha; no reabren desarrollos ya entregados. P10/U16 mantienen instalación/actualización, dispositivos/SAF, cortes/suspensión, accesibilidad y personas; T17 real sigue aplazado sin gasto. Git nativo Android y capacidades condicionadas conservan sus límites documentados. No publicación/instalación/cambioVERSION.


## Consolidación de alcance140 · 2026-11-06

[Alcance local y exclusiones vigentes](../consolidacion-140-alcance.md). La regresión139 está cerrada; los textos anteriores a ese cierre conservan su contexto. La preparación y validación instalada están ahora autorizadas, sin publicar ni gastar en IA. Este ajuste documental no constituye una instalación o aceptación.
