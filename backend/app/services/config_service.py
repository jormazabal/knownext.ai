from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone

from app.schemas.config import AppConfig, AppConfigUpdate
from app.services.app_storage import JsonFileStore


DEFAULT_LAYOUT = {
    "sidebarWidth": 338,
    "historyWidth": 320,
}

DEFAULT_APPEARANCE = {
    "language": "es",
    "zoomPercent": 100,
}

DEFAULT_DIAGNOSTICS = {
    "traceLoggingEnabled": False,
}

DEFAULT_AI = {
    "provider": "openai",
    "model": "gpt-5.4-mini",
    "permissions": {
        "createFolders": False,
        "createDocuments": False,
        "deleteDocumentsAndFolders": False,
    },
    "rag": {
        "enabled": False,
        "vectorStoreId": None,
        "lastIndexedAt": None,
        "status": "not-indexed",
        "error": None,
    },
    "agentic": {
        "depth": "guided",
        "webResearchEnabled": False,
        "confirmBeforeApplying": True,
        "maxSteps": 4,
        "maxDocuments": 6,
        "maxEstimatedCostEur": 1.0,
        "maxSources": 6,
    },
}

DEFAULT_TABS = {}

LAYOUT_LIMITS = {
    "sidebarWidth": (260, 480),
    "historyWidth": (280, 460),
}

ZOOM_LIMITS = (85, 125)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _default_config() -> dict:
    return {
        "schemaVersion": 1,
        "layout": deepcopy(DEFAULT_LAYOUT),
        "appearance": deepcopy(DEFAULT_APPEARANCE),
        "diagnostics": deepcopy(DEFAULT_DIAGNOSTICS),
        "ai": deepcopy(DEFAULT_AI),
        "tabsByProject": deepcopy(DEFAULT_TABS),
        "lastRunAppVersion": None,
        "lastSeenReleaseNotesVersion": None,
        "openUtilityTabs": [],
        "activeUtilityTab": None,
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


def _normalize_appearance(value: object) -> dict:
    if not isinstance(value, dict):
        return deepcopy(DEFAULT_APPEARANCE)

    language = value.get("language")
    if language not in ("es", "en"):
        language = DEFAULT_APPEARANCE["language"]

    try:
        zoom_percent = int(value.get("zoomPercent", DEFAULT_APPEARANCE["zoomPercent"]))
    except (TypeError, ValueError):
        zoom_percent = DEFAULT_APPEARANCE["zoomPercent"]

    min_zoom, max_zoom = ZOOM_LIMITS
    return {
        "language": language,
        "zoomPercent": min(max(zoom_percent, min_zoom), max_zoom),
    }


def _normalize_diagnostics(value: object) -> dict:
    if not isinstance(value, dict):
        return deepcopy(DEFAULT_DIAGNOSTICS)

    return {
        "traceLoggingEnabled": bool(value.get("traceLoggingEnabled", DEFAULT_DIAGNOSTICS["traceLoggingEnabled"])),
    }


def _normalize_ai(value: object) -> dict:
    if not isinstance(value, dict):
        return deepcopy(DEFAULT_AI)

    model = value.get("model")
    if model not in {"gpt-5.5", "gpt-5.4", "gpt-5.4-mini", "gpt-5.4-nano"}:
        model = DEFAULT_AI["model"]

    permissions = value.get("permissions")
    if not isinstance(permissions, dict):
        permissions = {}

    rag = value.get("rag")
    if not isinstance(rag, dict):
        rag = {}
    agentic = value.get("agentic")
    if not isinstance(agentic, dict):
        agentic = {}

    rag_status = rag.get("status")
    if rag_status not in {"not-indexed", "indexing", "updated", "error"}:
        rag_status = DEFAULT_AI["rag"]["status"]
    depth = agentic.get("depth")
    if depth not in {"quick", "guided", "deep", "bounded_autonomous"}:
        depth = DEFAULT_AI["agentic"]["depth"]

    return {
        "provider": "openai",
        "model": model,
        "permissions": {
            "createFolders": bool(permissions.get("createFolders", DEFAULT_AI["permissions"]["createFolders"])),
            "createDocuments": bool(permissions.get("createDocuments", DEFAULT_AI["permissions"]["createDocuments"])),
            "deleteDocumentsAndFolders": bool(permissions.get("deleteDocumentsAndFolders", DEFAULT_AI["permissions"]["deleteDocumentsAndFolders"])),
        },
        "rag": {
            "enabled": bool(rag.get("enabled", DEFAULT_AI["rag"]["enabled"])),
            "vectorStoreId": _normalize_optional_string(rag.get("vectorStoreId")),
            "lastIndexedAt": _normalize_optional_string(rag.get("lastIndexedAt")),
            "status": rag_status,
            "error": _normalize_optional_string(rag.get("error")),
        },
        "agentic": {
            "depth": depth,
            "webResearchEnabled": bool(agentic.get("webResearchEnabled", DEFAULT_AI["agentic"]["webResearchEnabled"])),
            "confirmBeforeApplying": bool(agentic.get("confirmBeforeApplying", DEFAULT_AI["agentic"]["confirmBeforeApplying"])),
            "maxSteps": _clamp_int(agentic.get("maxSteps"), 1, 12, DEFAULT_AI["agentic"]["maxSteps"]),
            "maxDocuments": _clamp_int(agentic.get("maxDocuments"), 1, 30, DEFAULT_AI["agentic"]["maxDocuments"]),
            "maxEstimatedCostEur": _clamp_float(agentic.get("maxEstimatedCostEur"), 0.1, 25.0, DEFAULT_AI["agentic"]["maxEstimatedCostEur"]),
            "maxSources": _clamp_int(agentic.get("maxSources"), 1, 20, DEFAULT_AI["agentic"]["maxSources"]),
        },
    }


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

    return normalized


def _normalize_optional_string(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    normalized = value.strip()
    return normalized or None


def _clamp_int(value: object, minimum: int, maximum: int, default: int) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        parsed = default
    return min(max(parsed, minimum), maximum)


def _clamp_float(value: object, minimum: float, maximum: float, default: float) -> float:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        parsed = default
    return min(max(parsed, minimum), maximum)


def _normalize_utility_tabs(value: object) -> list[str]:
    if not isinstance(value, list):
        return []
    return ["release-notes"] if "release-notes" in value else []


def _normalize_active_utility_tab(value: object, open_utility_tabs: list[str]) -> str | None:
    return "release-notes" if value == "release-notes" and "release-notes" in open_utility_tabs else None


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

        if payload.appearance is not None:
            data["appearance"] = _normalize_appearance(payload.appearance.model_dump())

        if payload.diagnostics is not None:
            data["diagnostics"] = _normalize_diagnostics(payload.diagnostics.model_dump())

        if payload.ai is not None:
            data["ai"] = _normalize_ai(payload.ai.model_dump())

        if payload.tabsByProject is not None:
            data["tabsByProject"] = _normalize_tabs_by_project(
                {
                    project_id: tabs_config.model_dump()
                    for project_id, tabs_config in payload.tabsByProject.items()
                }
            )

        if "lastRunAppVersion" in payload.model_fields_set:
            data["lastRunAppVersion"] = _normalize_optional_string(payload.lastRunAppVersion)

        if "lastSeenReleaseNotesVersion" in payload.model_fields_set:
            data["lastSeenReleaseNotesVersion"] = _normalize_optional_string(payload.lastSeenReleaseNotesVersion)

        if payload.openUtilityTabs is not None:
            data["openUtilityTabs"] = _normalize_utility_tabs(payload.openUtilityTabs)

        if "activeUtilityTab" in payload.model_fields_set:
            data["activeUtilityTab"] = _normalize_active_utility_tab(payload.activeUtilityTab, data.get("openUtilityTabs", []))

        data["activeUtilityTab"] = _normalize_active_utility_tab(data.get("activeUtilityTab"), data.get("openUtilityTabs", []))
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

        legacy_config_without_version_state = "lastRunAppVersion" not in data

        data["layout"] = {
            "sidebarWidth": _clamp_width("sidebarWidth", _read_width(layout, "sidebarWidth")),
            "historyWidth": _clamp_width("historyWidth", _read_width(layout, "historyWidth")),
        }
        data["appearance"] = _normalize_appearance(data.get("appearance"))
        data["diagnostics"] = _normalize_diagnostics(data.get("diagnostics"))
        data["ai"] = _normalize_ai(data.get("ai"))
        data["tabsByProject"] = _normalize_tabs_by_project(data.get("tabsByProject"))
        data["lastRunAppVersion"] = "legacy" if legacy_config_without_version_state else _normalize_optional_string(data.get("lastRunAppVersion"))
        data["lastSeenReleaseNotesVersion"] = _normalize_optional_string(data.get("lastSeenReleaseNotesVersion"))
        data["openUtilityTabs"] = _normalize_utility_tabs(data.get("openUtilityTabs"))
        data["activeUtilityTab"] = _normalize_active_utility_tab(data.get("activeUtilityTab"), data["openUtilityTabs"])
        data["updatedAt"] = str(data.get("updatedAt") or _now_iso())
        return data


config_service = ConfigService()
