# IA de dibujo en `.knote`

KnowNext.ai trata el dibujo IA en notas a mano como un motor de trazos, no como insercion de imagenes, SVG final o formas nativas. Todo resultado visual aplicado a una `.knote` debe terminar como `HandwrittenStroke[]` editable, guardado como draft hasta que el usuario guarde la nota.

## Arquitectura

El flujo de producto es:

```text
Prompt -> DrawingBrief -> SceneGraph -> LayoutPlan -> ToolPlan -> StrokePlan -> Visual QA -> HandwrittenStroke[]
```

- React renderiza y aplica estado, pero no llama proveedores IA ni ejecuta reglas de dibujo.
- Rust/Tauri resuelve permisos, contexto, ejecucion IA estructurada, composicion, generacion de strokes, QA y persistencia de draft.
- `knownext-drawing` concentra layout, mapeo de herramientas, generacion de trazos, rellenos y validacion visual.

## SceneGraph

`sceneSpec.elements` admite elementos semanticos:

- `shape` con `shape`: `square`, `triangle`, `circle`, `ellipse`, `diamond`, `star`.
- `diagram_node` y `connector` para diagramas.
- `text_block`, `annotation` y `label` para texto escrito con stroke font.
- `symbol` con `symbol`: `house`, `sun`, `dog`, `cat`, `person`, `face`, `tree`, `cloud`, `server`, `laptop`, `database`, `rocket`, `starship`, `spacecraft`.
- `portrait` para retratos simples tipo boceto a lapiz.
- `fill_region` y `shadow_region` con `target` y `fill`: `marker_passes`, `hatching`, `cross_hatching`, `scribble`.

Los retratos, animales y objetos figurativos deben modelarse como `portrait` o `symbol` completos, no como diagramas de partes con conectores, salvo que el usuario pida expresamente un diagrama explicativo. Para animales con soporte nativo como `dog` o `cat`, el motor sintetiza un retrato a lapiz con jerarquia de contorno, rasgos, lineas secundarias, textura y pasadas imperfectas. El objetivo no es producir line-art vectorial limpio, sino strokes de `.knote` que parezcan hechos con una herramienta de pencil.

## Infografias

Una infografia o lamina explicativa no debe resolverse como una rejilla de cajas. El `SceneGraph` debe contener:

- un objeto protagonista como `symbol` o `portrait` con `role: primary_outline`;
- notas breves como `annotation`, `label` o `text_block`;
- llamadas visuales finas hacia el objeto, generadas por layout local;
- detalles internos o sombreados como `shadow_region`, `fill_region` o trazos propios del simbolo.

Para peticiones como "muestra como es la Starship", el modelo debe usar `symbol: starship` como dibujo principal y anotaciones alrededor. El motor local coloca la nave en grande, genera su silueta con pencil, dibuja flaps, secciones, motores, escudo termico y zonas internas, y conecta las notas con llamadas discretas. `diagram_node` y flechas gruesas quedan reservados para diagramas de flujo o arquitectura, no para infografias ilustradas.

## ToolPlan

El motor mapea roles visuales a pencils reales de la nota:

- `primary_outline`
- `secondary_sketch`
- `text`
- `connector`
- `accent`
- `highlight`
- `shadow`
- `fill_light`
- `fill_dense`

Si falta un tipo de pencil en la nota, el runtime usa un fallback local compatible, pero el resultado final sigue siendo `HandwrittenStroke[]`.

La sintesis final de strokes aplica interpolacion, jitter determinista, presion variable y pasadas adicionales en lapiz para evitar apariencia de SVG perfecto. Incluso las figuras geometricas y diagramas deben leerse como contenido dibujado con pencils, no como vectores limpios.

## Rellenos

No se permiten `fill` solidos. Un relleno debe expresarse como strokes:

- marker passes para color de rotulador;
- hatching y cross-hatching para lapiz o sombra;
- scribble fill para dibujos infantiles o expresivos;
- highlighter como pasadas anchas de baja opacidad.

## QA visual

Antes de aplicar el dibujo, el runtime valida:

- ningun stroke IA tiene un `path` rellenable;
- figuras pedidas existen y son reconocibles;
- el cuadrado mantiene proporcion 1:1;
- el triangulo se sintetiza con tres lados;
- texto y elementos estan dentro de pagina;
- el stroke count respeta presupuesto;
- rellenos y sombras no sustituyen contornos;
- cuando procede, se usan varios roles/herramientas para jerarquia visual.

## Ruta futura imagen interna -> trazos

Para dibujos complejos, retratos o escenas expresivas puede usarse una imagen interna como referencia, pero nunca como salida final. La ruta prevista es:

```text
Prompt -> imagen interna -> extraccion de contornos/regiones/sombras -> StrokePlan -> QA -> HandwrittenStroke[]
```

La vectorizacion debe producir lineas, regiones y densidades que KnowNext convierta en trazos propios. No se debe pegar el bitmap ni guardar SVGs rellenos como dibujo final.

Opciones externas como VTracer, Potrace, AutoTrace o motores tipo plotter pueden evaluarse solo como apoyo experimental. Cualquier dependencia empaquetada debe pasar revision de licencia y mantener la regla de salida final a trazos.
