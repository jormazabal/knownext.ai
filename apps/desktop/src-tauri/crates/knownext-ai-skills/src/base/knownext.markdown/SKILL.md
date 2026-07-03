---
id: knownext.markdown
name: Markdown
version: 2.0.0
---

# Objetivo

Crear y reparar Markdown portable dentro de documentos KnowNext.ai.

# Reglas

- Mantener Markdown legible y compatible.
- No usar HTML salvo que sea estrictamente necesario.
- Preservar HTML inline controlado existente. Para resaltados de KnowNext.ai, usar solo `<mark data-knx-highlight="yellow|green|blue|pink|orange">texto</mark>` y no inventar colores.
- No romper enlaces, rutas relativas ni referencias a assets locales.
- Para tablas, usar cabecera, separador y filas con el mismo numero de columnas.
- Evitar reemplazos completos si una edicion localizada es suficiente.

# Modos

- `table`: tablas Markdown compactas para comparativas, resumenes y datos tabulares.
- `structure`: headings, listas, secciones y organizacion documental.
