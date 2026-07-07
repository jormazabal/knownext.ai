---
id: knownext.handwritten_drawing
name: Dibujo en knote
version: 1.0.0
---

# Objetivo

Crear dibujos profesionales dentro de notas `.knote` mediante una escena semantica editable y validable. La IA define intencion, elementos y relaciones; el runtime local calcula layout, texto y trazos.

# Reglas

- Usar `draw_handwritten_note` solo cuando el objetivo sea una nota a mano activa o una nueva `.knote`.
- No devolver coordenadas finales ni `strokes`; devolver `drawingBrief` y `sceneSpec`.
- Mantener los dibujos compactos, legibles y con pocos elementos principales.
- Separar texto visible en labels cortas; el runtime lo reescribe como trazos controlados.
- Usar `route: "precise_scene"` por defecto.
- Usar `route: "mermaid_vector"` solo si el usuario aporta o pide convertir Mermaid.
- Usar `route: "creative_sketch"` solo para bocetos expresivos si la configuracion lo permite.
- Nunca usar `debug_raw_strokes` salvo pruebas internas.

# SceneSpec

`sceneSpec.elements` puede contener:

- `box`: bloque o paso principal.
- `diagram_node`: nodo de diagrama profesional.
- `shape`: figura geometrica con `shape`: `square`, `triangle`, `circle`, `ellipse`, `diamond` o `star`.
- `arrow` o `connector`: relacion entre elementos con `from` y `to`.
- `label`: texto suelto breve.
- `text_block` o `annotation`: texto manuscrito estructurado.
- `group`: agrupacion visual.
- `lane`: carril.
- `timeline_event`: hito temporal.
- `mindmap_node`: nodo de mapa mental.
- `wireframe_component`: componente UI abstracto.
- `icon_hint`: sugerencia visual simple.
- `freeform_shape`: forma expresiva simple.
- `symbol`: simbolo dibujado con `symbol`: `house`, `sun`, `dog`, `person`, `face`, `tree`, `cloud`, `server`, `laptop` o `database`.
- `portrait`: retrato simple tipo line portrait.
- `fill_region` o `shadow_region`: relleno o sombra por trazos con `target` y `fill`: `marker_passes`, `hatching`, `cross_hatching` o `scribble`.

Usar roles visuales cuando aplique: `primary_outline`, `secondary_sketch`, `text`, `connector`, `accent`, `highlight`, `shadow`, `fill_light` y `fill_dense`.

Para retratos, animales u objetos figurativos, usar `portrait` o `symbol` como dibujo unico y evitar labels, partes y flechas salvo que el usuario pida explicitamente un diagrama explicativo.

# Formato de salida

Devolver JSON con `action`, `answer`, `summary`, `route`, `drawingBrief`, `sceneSpec`, `targetPageId` y `replacementPolicy`.
