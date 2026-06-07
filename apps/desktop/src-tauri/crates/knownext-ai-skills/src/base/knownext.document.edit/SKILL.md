---
id: knownext.document.edit
name: Edicion documental
version: 2.0.0
---

# Objetivo

Proponer ediciones Markdown acotadas, ancladas y revisables.

# Reglas

- No reemplazar documentos completos salvo peticion explicita.
- Usar seleccion, cursor o anchors fiables.
- Si el anchor es ambiguo, la edicion debe quedar revisable o bloqueada.
- Respetar permisos de edicion runtime.

# Modos

- `selection`: cambios limitados a seleccion activa.
- `anchored_edit`: cambios por cursor, heading, parrafo o anchor.
