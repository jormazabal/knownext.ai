from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone

INITIAL_MARKDOWN = """# Acta de reunión del proyecto

## 1. Información general

Reunión semanal del equipo para revisar el progreso del proyecto. El **objetivo principal** es alinear actividades, identificar bloqueos y definir próximos pasos.

## 2. Temas tratados

- Revisión del progreso de las tareas en curso.
- Discusión sobre los bloqueos identificados.
- Planificación de las próximas actividades.

## 3. Acuerdos y próximos pasos

1. Completar la implementación del módulo de autenticación.
2. Preparar la documentación de la API.
3. Reunión de seguimiento el próximo miércoles.

## 4. Asistentes

| Nombre | Rol | Asistencia | Responsabilidad |
|---|---|---|---|
| Ana López | Product Owner | Sí | Definición de requisitos |
| Carlos Pérez | Desarrollador | Sí | Desarrollo backend |
| María Gómez | Diseñadora | No | Diseño de interfaz |
| Luis Martínez | QA Engineer | Sí | Pruebas y calidad |

## 5. Notas técnicas

El endpoint para obtener usuarios es `GET /api/usuarios` y requiere el encabezado `Authorization: Bearer <token>`.

```js
fetch('/api/usuarios', {
  method: 'GET',
  headers: { 'Authorization': 'Bearer <token>' }
});
```

> La coordinación y la comunicación son clave para el éxito del proyecto.
> - Equipo del proyecto

## 6. Tareas acordadas

- [x] Definir requisitos del módulo.
- [x] Revisar diseño de la base de datos.
- [ ] Implementar autenticación.
- [ ] Documentar endpoints de la API.
"""

PROJECTS = [
    {
        "id": "project-alpha",
        "name": "Proyecto Alpha",
        "folderPath": "C:\\Documentacion\\Proyecto Alpha",
        "icon": "folder",
        "iconColor": "#F37021",
        "isGitRepository": True,
        "active": True,
    },
    {
        "id": "project-beta",
        "name": "Proyecto Beta",
        "folderPath": "C:\\Documentacion\\Proyecto Beta",
        "icon": "folder",
        "iconColor": "#7C3AED",
        "isGitRepository": False,
        "active": False,
    },
    {
        "id": "project-gamma",
        "name": "Proyecto Gamma",
        "folderPath": "C:\\Documentacion\\Proyecto Gamma",
        "icon": "folder",
        "iconColor": "#059669",
        "isGitRepository": True,
        "active": False,
    },
]

TREE = [
    {"id": "planning", "name": "01. Planificación", "type": "folder", "open": False},
    {
        "id": "docs",
        "name": "02. Documentación",
        "type": "folder",
        "open": True,
        "children": [
            {
                "id": "requirements",
                "name": "Requisitos",
                "type": "folder",
                "open": True,
                "children": [
                    {"id": "requirements-functional", "name": "requisitos-funcionales.md", "type": "document"},
                    {"id": "requirements-non-functional", "name": "requisitos-no-funcionales.md", "type": "document"},
                ],
            },
            {
                "id": "architecture",
                "name": "Arquitectura",
                "type": "folder",
                "open": True,
                "children": [
                    {"id": "decision-tech", "name": "decision-tecnologica.md", "type": "document"},
                    {"id": "diagram-architecture", "name": "diagrama-arquitectura.md", "type": "document"},
                ],
            },
        ],
    },
    {"id": "development", "name": "03. Desarrollo", "type": "folder", "open": False},
    {"id": "testing", "name": "04. Pruebas", "type": "folder", "open": False},
    {
        "id": "notes",
        "name": "Notas",
        "type": "folder",
        "open": True,
        "children": [
            {"id": "ideas", "name": "ideas.md", "type": "document"},
            {"id": "pending", "name": "pendientes.md", "type": "document"},
            {"id": "meeting-minutes", "name": "acta-reunion.md", "type": "document"},
        ],
    },
    {"id": "resources", "name": "Recursos", "type": "folder", "open": False},
    {"id": "templates", "name": "Plantillas", "type": "folder", "open": False},
]

DOCUMENTS = {
    "meeting-minutes": {
        "id": "meeting-minutes",
        "name": "acta-reunion.md",
        "path": "Notas/acta-reunion.md",
        "projectId": "project-alpha",
        "markdown": INITIAL_MARKDOWN,
        "wordCount": 214,
        "updatedAt": "2026-05-08T13:00:00Z",
    },
    "requirements-functional": {
        "id": "requirements-functional",
        "name": "requisitos-funcionales.md",
        "path": "02. Documentación/Requisitos/requisitos-funcionales.md",
        "projectId": "project-alpha",
        "markdown": "# Requisitos funcionales\n\n- Gestión de proyectos.\n- Edición visual de Markdown.\n- Histórico por commits.\n",
        "wordCount": 32,
        "updatedAt": "2026-05-07T16:42:00Z",
    },
    "decision-tech": {
        "id": "decision-tech",
        "name": "decision-tecnologica.md",
        "path": "02. Documentación/Arquitectura/decision-tecnologica.md",
        "projectId": "project-alpha",
        "markdown": "# Decisión tecnológica\n\nStack inicial: Tauri, React, TypeScript, Tailwind, Milkdown y FastAPI.\n",
        "wordCount": 18,
        "updatedAt": "2026-05-07T09:30:00Z",
    },
}

VERSIONS = [
    {
        "id": "v-a1b2c3d",
        "hash": "a1b2c3d",
        "title": "Actualización de tareas y asistentes",
        "author": "Ana Domínguez",
        "authorInitials": "AD",
        "relativeTime": "hace 2 horas",
        "current": True,
    },
    {
        "id": "v-9f8e7d6",
        "hash": "9f8e7d6",
        "title": "Añade notas técnicas del endpoint de usuarios",
        "author": "Ana Domínguez",
        "authorInitials": "AD",
        "relativeTime": "ayer, 18:42",
    },
    {
        "id": "v-7c6d5e4",
        "hash": "7c6d5e4",
        "title": "Actualiza acuerdos y próximos pasos",
        "author": "Carlos Pérez",
        "authorInitials": "CP",
        "relativeTime": "ayer, 11:30",
    },
    {
        "id": "v-4b3a2f1",
        "hash": "4b3a2f1",
        "title": "Añade sección de asistentes",
        "author": "María Gómez",
        "authorInitials": "MG",
        "relativeTime": "ayer, 09:15",
    },
    {
        "id": "v-e2d1c0b",
        "hash": "e2d1c0b",
        "title": "Versión inicial del acta de reunión",
        "author": "Ana Domínguez",
        "authorInitials": "AD",
        "relativeTime": "anteayer, 17:45",
    },
]


class MockStore:
    def __init__(self) -> None:
        self.documents = deepcopy(DOCUMENTS)

    def save_document(self, document_id: str, markdown: str) -> dict:
        previous = self.documents.get(document_id, self.documents["meeting-minutes"])
        saved = {
            **previous,
            "markdown": markdown,
            "wordCount": len([word for word in markdown.split() if word.strip()]),
            "updatedAt": datetime.now(timezone.utc).isoformat(),
        }
        self.documents[document_id] = saved
        return saved


mock_store = MockStore()
