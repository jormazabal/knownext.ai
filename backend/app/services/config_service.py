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
    "markdownExtendedUnderlineEnabled": True,
    "themeMode": "system",
    "primaryColor": "orange",
}

DEFAULT_DIAGNOSTICS = {
    "traceLoggingEnabled": False,
}

DEFAULT_AI = {
    "provider": "openai",
    "model": "gpt-5.4-mini",
    "permissions": {
        "editDocuments": True,
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
    "vision": {
        "enabled": True,
        "model": "gpt-5.4-mini",
        "imageIndexingEnabled": False,
        "maxImagesPerPrompt": 4,
        "maxImageSizeMb": 12,
        "detail": "auto",
        "storeVisualDescriptions": True,
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
    "transcription": {
        "enabled": True,
        "model": "gpt-realtime-whisper",
        "defaultTarget": "prompt",
        "defaultLanguage": "auto",
        "favoriteLanguages": ["es", "en"],
    },
}

DEFAULT_TABS = {}

LAYOUT_LIMITS = {
    "sidebarWidth": (260, 480),
    "historyWidth": (280, 460),
}

ZOOM_LIMITS = (85, 125)
THEME_MODES = {"system", "light", "dark"}
ACCENT_COLORS = {
    "orange",
    "amber",
    "yellow",
    "lime",
    "olive",
    "green",
    "cyan",
    "blue",
    "indigo",
    "wine",
    "rose",
    "red",
}
TRANSCRIPTION_LANGUAGES = {"auto", "es", "en", "fr", "de", "it", "pt", "ca", "eu", "gl"}


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

    theme_mode = value.get("themeMode")
    if theme_mode not in THEME_MODES:
        theme_mode = DEFAULT_APPEARANCE["themeMode"]

    primary_color = value.get("primaryColor")
    if primary_color not in ACCENT_COLORS:
        primary_color = DEFAULT_APPEARANCE["primaryColor"]

    min_zoom, max_zoom = ZOOM_LIMITS
    return {
        "language": language,
        "zoomPercent": min(max(zoom_percent, min_zoom), max_zoom),
        "markdownExtendedUnderlineEnabled": bool(value.get("markdownExtendedUnderlineEnabled", DEFAULT_APPEARANCE["markdownExtendedUnderlineEnabled"])),
        "themeMode": theme_mode,
        "primaryColor": primary_color,
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
    vision = value.get("vision")
    if not isinstance(vision, dict):
        vision = {}
    transcription = value.get("transcription")
    if not isinstance(transcription, dict):
        transcription = {}

    rag_status = rag.get("status")
    if rag_status not in {"not-indexed", "indexing", "updated", "error"}:
        rag_status = DEFAULT_AI["rag"]["status"]
    depth = agentic.get("depth")
    if depth not in {"quick", "guided", "deep", "bounded_autonomous"}:
        depth = DEFAULT_AI["agentic"]["depth"]
    transcription_model = transcription.get("model")
    if transcription_model != "gpt-realtime-whisper":
        transcription_model = DEFAULT_AI["transcription"]["model"]
    transcription_target = transcription.get("defaultTarget")
    if transcription_target not in {"prompt", "document"}:
        transcription_target = DEFAULT_AI["transcription"]["defaultTarget"]
    transcription_language = transcription.get("defaultLanguage")
    if transcription_language not in TRANSCRIPTION_LANGUAGES:
        transcription_language = DEFAULT_AI["transcription"]["defaultLanguage"]
    favorite_languages = transcription.get("favoriteLanguages")
    if not isinstance(favorite_languages, list):
        favorite_languages = DEFAULT_AI["transcription"]["favoriteLanguages"]
    normalized_favorite_languages = []
    for language in favorite_languages:
        if language in TRANSCRIPTION_LANGUAGES and language not in normalized_favorite_languages:
            normalized_favorite_languages.append(language)
    if not normalized_favorite_languages:
        normalized_favorite_languages = DEFAULT_AI["transcription"]["favoriteLanguages"]

    return {
        "provider": "openai",
        "model": model,
        "permissions": {
            "editDocuments": bool(permissions.get("editDocuments", DEFAULT_AI["permissions"]["editDocuments"])),
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
        "vision": {
            "enabled": bool(vision.get("enabled", DEFAULT_AI["vision"]["enabled"])),
            "model": vision.get("model") if vision.get("model") in {"gpt-5.5", "gpt-5.4", "gpt-5.4-mini"} else DEFAULT_AI["vision"]["model"],
            "imageIndexingEnabled": bool(vision.get("imageIndexingEnabled", DEFAULT_AI["vision"]["imageIndexingEnabled"])),
            "maxImagesPerPrompt": _clamp_int(vision.get("maxImagesPerPrompt"), 1, 12, DEFAULT_AI["vision"]["maxImagesPerPrompt"]),
            "maxImageSizeMb": _clamp_int(vision.get("maxImageSizeMb"), 1, 50, DEFAULT_AI["vision"]["maxImageSizeMb"]),
            "detail": vision.get("detail") if vision.get("detail") in {"auto", "low", "high"} else DEFAULT_AI["vision"]["detail"],
            "storeVisualDescriptions": bool(vision.get("storeVisualDescriptions", DEFAULT_AI["vision"]["storeVisualDescriptions"])),
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
        "transcription": {
            "enabled": bool(transcription.get("enabled", DEFAULT_AI["transcription"]["enabled"])),
            "model": transcription_model,
            "defaultTarget": transcription_target,
            "defaultLanguage": transcription_language,
            "favoriteLanguages": normalized_favorite_languages[:6],
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
