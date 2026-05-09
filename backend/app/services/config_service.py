from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone

from app.schemas.config import AppConfig, AppConfigUpdate
from app.services.app_storage import JsonFileStore


DEFAULT_LAYOUT = {
    "sidebarWidth": 338,
    "historyWidth": 320,
}

DEFAULT_TABS = {
    "project-alpha": {
        "openTabs": [
            {"id": "meeting-minutes", "name": "acta-reunion.md"},
            {"id": "requirements-functional", "name": "requisitos-funcionales.md"},
            {"id": "decision-tech", "name": "decision-tecnologica.md"},
        ],
        "activeDocumentId": "meeting-minutes",
    }
}

LAYOUT_LIMITS = {
    "sidebarWidth": (260, 480),
    "historyWidth": (280, 460),
}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _default_config() -> dict:
    return {
        "schemaVersion": 1,
        "layout": deepcopy(DEFAULT_LAYOUT),
        "tabsByProject": deepcopy(DEFAULT_TABS),
        "updatedAt": _now_iso(),
    }


def _clamp_width(name: str, value: int) -> int:
    min_width, max_width = LAYOUT_LIMITS[name]
    return min(max(value, min_width), max_width)


def _read_width(layout: dict, name: str) -> int:
    try:
        return int(layout.get(name, DEFAULT_LAYOUT[name]))
    except (TypeError, ValueError):
        return DEFAULT_LAYOUT[name]


def _normalize_tabs_by_project(value: object) -> dict:
    if not isinstance(value, dict):
        return deepcopy(DEFAULT_TABS)

    normalized: dict = {}
    for project_id, tabs_config in value.items():
        if not isinstance(project_id, str) or not isinstance(tabs_config, dict):
            continue

        raw_tabs = tabs_config.get("openTabs")
        if not isinstance(raw_tabs, list):
            continue

        open_tabs = []
        seen_ids = set()
        for tab in raw_tabs:
            if not isinstance(tab, dict):
                continue

            tab_id = tab.get("id")
            tab_name = tab.get("name")
            if not isinstance(tab_id, str) or not tab_id or tab_id in seen_ids:
                continue
            if not isinstance(tab_name, str) or not tab_name:
                continue

            open_tabs.append({"id": tab_id, "name": tab_name})
            seen_ids.add(tab_id)

        if not open_tabs:
            continue

        active_document_id = tabs_config.get("activeDocumentId")
        if not isinstance(active_document_id, str) or active_document_id not in seen_ids:
            active_document_id = open_tabs[0]["id"]

        normalized[project_id] = {
            "openTabs": open_tabs,
            "activeDocumentId": active_document_id,
        }

    return normalized or deepcopy(DEFAULT_TABS)


class ConfigService:
    def __init__(self) -> None:
        self.store = JsonFileStore("config.json")

    def get_config(self) -> AppConfig:
        data = self._read_config()
        return AppConfig(**data)

    def update_config(self, payload: AppConfigUpdate) -> AppConfig:
        data = self._read_config()

        if payload.layout is not None:
            data["layout"] = {
                "sidebarWidth": _clamp_width("sidebarWidth", payload.layout.sidebarWidth),
                "historyWidth": _clamp_width("historyWidth", payload.layout.historyWidth),
            }

        if payload.tabsByProject is not None:
            data["tabsByProject"] = _normalize_tabs_by_project(
                {
                    project_id: tabs_config.model_dump()
                    for project_id, tabs_config in payload.tabsByProject.items()
                }
            )

        data["updatedAt"] = _now_iso()
        self.store.write(data)
        return AppConfig(**data)

    def _read_config(self) -> dict:
        data = self.store.read(_default_config())
        layout = data.get("layout")

        if data.get("schemaVersion") != 1 or not isinstance(layout, dict):
            data = _default_config()
            self.store.write(data)
            return data

        data["layout"] = {
            "sidebarWidth": _clamp_width("sidebarWidth", _read_width(layout, "sidebarWidth")),
            "historyWidth": _clamp_width("historyWidth", _read_width(layout, "historyWidth")),
        }
        data["tabsByProject"] = _normalize_tabs_by_project(data.get("tabsByProject"))
        data["updatedAt"] = str(data.get("updatedAt") or _now_iso())
        return data


config_service = ConfigService()
