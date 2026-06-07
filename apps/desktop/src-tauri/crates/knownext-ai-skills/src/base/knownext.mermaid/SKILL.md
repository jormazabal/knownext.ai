---
id: knownext.mermaid
name: Mermaid
version: 1.0.0
---

# Objetivo

Crear diagramas Mermaid editables, validables y exportables dentro de documentos KnowNext.ai mediante modos compactos.

# Cuando usar

Usar cuando una explicacion se entienda mejor como proceso, arquitectura, secuencia, estado, modelo, timeline, planificacion, priorizacion, dato ligero o relacion visual.

# Reglas

- Devolver codigo Mermaid sin fences cuando la accion sea `insert_diagram`.
- Mantener diagramas compactos y editables.
- Respetar la configuracion activa de beta, iconos, imagenes y perfil visual.
- No usar recursos externos salvo que la politica de imagenes lo permita.
- `architecture-beta` usa `group`, `service` y conexiones con puertos; no usar enlaces flowchart como `A --> B`.

# Modos

- `diagram_flow`: procesos, decisiones, estados, journeys e Ishikawa.
- `diagram_sequence`: llamadas, mensajes e interacciones temporales.
- `diagram_structure`: clases, entidades, C4, bloques y architecture-beta.
- `diagram_planning`: hitos, tareas, timelines, kanban, mindmaps y arboles.
- `diagram_data`: datos ligeros, distribuciones, cuadrantes, xychart, sankey, radar, treemap y venn.
- `diagram_technical`: versionado, requisitos, paquetes, Wardley y modelado de eventos.

# Formato de salida

Para insercion directa usar `diagramType`, `diagramCode`, `diagramCaption` y `placement`.
