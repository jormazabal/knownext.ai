from __future__ import annotations

import json
import re
import threading
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path

from app.schemas.config import ExportTemplateConfig, ExportTemplateUpdate
from app.services.app_storage import get_app_data_dir


EXPORT_TEMPLATE_FILENAME = "export-template-basic.json"

DEFAULT_EXPORT_TEMPLATE = {
    "schemaVersion": 2,
    "name": "basic",
    "page": {
        "size": "A4",
        "margins": {
            "topMm": 20,
            "rightMm": 18,
            "bottomMm": 20,
            "leftMm": 18,
        },
    },
    "normal": {
        "fontFamily": "Arial",
        "fontSizePt": 11,
        "color": "#111827",
        "textFormat": "normal",
    },
    "headingFontFamily": "Arial",
    "headings": {
        "h1": {"fontFamily": "Arial", "fontSizePt": 22, "color": "#111827", "textFormat": "bold"},
        "h2": {"fontFamily": "Arial", "fontSizePt": 18, "color": "#111827", "textFormat": "bold"},
        "h3": {"fontFamily": "Arial", "fontSizePt": 15, "color": "#111827", "textFormat": "bold"},
        "h4": {"fontFamily": "Arial", "fontSizePt": 13, "color": "#111827", "textFormat": "bold"},
        "h5": {"fontFamily": "Arial", "fontSizePt": 12, "color": "#111827", "textFormat": "bold"},
        "h6": {"fontFamily": "Arial", "fontSizePt": 11, "color": "#111827", "textFormat": "bold"},
    },
    "code": {
        "fontFamily": "Consolas",
        "fontSizePt": 9.5,
        "color": "#111827",
        "textFormat": "normal",
    },
    "paragraph": {
        "lineSpacing": 1.2,
        "spaceAfterPt": 3,
    },
    "document": {
        "includeTitle": False,
        "linkColor": "#D85A12",
        "horizontalRuleColor": "#E5E7EB",
    },
    "updatedAt": "1970-01-01T00:00:00+00:00",
}

_HEX_COLOR_PATTERN = re.compile(r"^#[0-9a-fA-F]{6}$")
EXPORT_FONT_FAMILIES = {
    "Arial",
    "Calibri",
    "Aptos",
    "Times New Roman",
    "Georgia",
    "Verdana",
    "Courier New",
    "Consolas",
}
EXPORT_TEXT_FORMATS = {"normal", "bold", "underline", "bold_underline"}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _clamp_float(value: object, minimum: float, maximum: float, fallback: float) -> float:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        parsed = fallback
    return min(max(parsed, minimum), maximum)


def _normalize_color(value: object, fallback: str) -> str:
    return value if isinstance(value, str) and _HEX_COLOR_PATTERN.match(value) else fallback


def _normalize_font_family(value: object, fallback: str) -> str:
    if not isinstance(value, str):
        return fallback
    normalized = " ".join(value.strip().split())
    return normalized if normalized in EXPORT_FONT_FAMILIES else fallback


def _normalize_text_format(value: object, fallback: str) -> str:
    return value if isinstance(value, str) and value in EXPORT_TEXT_FORMATS else fallback


def _normalize_text_style(value: object, fallback: dict, *, min_size: float = 6, max_size: float = 48) -> dict:
    data = value if isinstance(value, dict) else {}
    return {
        "fontFamily": _normalize_font_family(data.get("fontFamily"), fallback["fontFamily"]),
        "fontSizePt": _clamp_float(data.get("fontSizePt"), min_size, max_size, fallback["fontSizePt"]),
        "color": _normalize_color(data.get("color"), fallback["color"]),
        "textFormat": _normalize_text_format(data.get("textFormat"), fallback.get("textFormat", "normal")),
    }


def _normalize_template(value: object) -> dict:
    data = value if isinstance(value, dict) else {}
    default = deepcopy(DEFAULT_EXPORT_TEMPLATE)
    source_schema_version = data.get("schemaVersion")
    page = data.get("page") if isinstance(data.get("page"), dict) else {}
    margins = page.get("margins") if isinstance(page.get("margins"), dict) else {}
    paragraph = data.get("paragraph") if isinstance(data.get("paragraph"), dict) else {}
    document = data.get("document") if isinstance(data.get("document"), dict) else {}
    raw_headings = data.get("headings") if isinstance(data.get("headings"), dict) else {}

    headings = {}
    heading_font = _normalize_font_family(data.get("headingFontFamily"), default["headingFontFamily"])
    for level, fallback in default["headings"].items():
        normalized = _normalize_text_style(raw_headings.get(level), {**fallback, "fontFamily": heading_font}, min_size=7, max_size=60)
        headings[level] = normalized

    normalized = {
        "schemaVersion": 2,
        "name": "basic",
        "page": {
            "size": page.get("size") if page.get("size") in {"A4", "Letter"} else default["page"]["size"],
            "margins": {
                "topMm": _clamp_float(margins.get("topMm"), 5, 50, default["page"]["margins"]["topMm"]),
                "rightMm": _clamp_float(margins.get("rightMm"), 5, 50, default["page"]["margins"]["rightMm"]),
                "bottomMm": _clamp_float(margins.get("bottomMm"), 5, 50, default["page"]["margins"]["bottomMm"]),
                "leftMm": _clamp_float(margins.get("leftMm"), 5, 50, default["page"]["margins"]["leftMm"]),
            },
        },
        "normal": _normalize_text_style(data.get("normal"), default["normal"]),
        "headingFontFamily": heading_font,
        "headings": headings,
        "code": _normalize_text_style(data.get("code"), default["code"], min_size=6, max_size=24),
        "paragraph": {
            "lineSpacing": _clamp_float(paragraph.get("lineSpacing"), 1, 2.5, default["paragraph"]["lineSpacing"]),
            "spaceAfterPt": _clamp_float(paragraph.get("spaceAfterPt"), 0, 24, default["paragraph"]["spaceAfterPt"]),
        },
        "document": {
            "includeTitle": False,
            "linkColor": _normalize_color(document.get("linkColor"), default["document"]["linkColor"]),
            "horizontalRuleColor": _normalize_color(document.get("horizontalRuleColor"), default["document"]["horizontalRuleColor"]),
        },
        "updatedAt": str(data.get("updatedAt") or _now_iso()),
    }
    if source_schema_version in {None, 1} and normalized["paragraph"] == {"lineSpacing": 1.35, "spaceAfterPt": 6}:
        normalized["paragraph"] = deepcopy(default["paragraph"])
    return normalized


class ExportTemplateService:
    def __init__(self) -> None:
        self._lock = threading.RLock()

    @property
    def path(self) -> Path:
        return get_app_data_dir() / EXPORT_TEMPLATE_FILENAME

    def get_template(self) -> ExportTemplateConfig:
        return ExportTemplateConfig(**self._read_template())

    def get_template_path(self) -> str:
        self._read_template()
        return str(self.path)

    def update_template(self, payload: ExportTemplateUpdate) -> ExportTemplateConfig:
        data = self._read_template()
        patch = payload.model_dump(exclude_none=True)
        merged = {
            **data,
            **patch,
            "updatedAt": _now_iso(),
        }
        if "headingFontFamily" in patch:
            heading_font = patch["headingFontFamily"]
            merged["headings"] = {
                level: {**style, "fontFamily": heading_font}
                for level, style in data["headings"].items()
            }
        if "headings" in patch:
            merged["headings"] = {
                **data["headings"],
                **patch["headings"],
            }
        normalized = _normalize_template(merged)
        normalized["updatedAt"] = _now_iso()
        self._write_template(normalized)
        return ExportTemplateConfig(**normalized)

    def reset_template(self) -> ExportTemplateConfig:
        data = deepcopy(DEFAULT_EXPORT_TEMPLATE)
        data["updatedAt"] = _now_iso()
        self._write_template(data)
        return ExportTemplateConfig(**data)

    def _read_template(self) -> dict:
        with self._lock:
            path = self.path
            if not path.exists():
                data = deepcopy(DEFAULT_EXPORT_TEMPLATE)
                data["updatedAt"] = _now_iso()
                self._write_template(data)
                return data
            try:
                data = json.loads(path.read_text(encoding="ascii"))
            except (OSError, UnicodeDecodeError, json.JSONDecodeError):
                data = deepcopy(DEFAULT_EXPORT_TEMPLATE)
                data["updatedAt"] = _now_iso()
                self._write_template(data)
                return data
            normalized = _normalize_template(data)
            if normalized != data:
                self._write_template(normalized)
            return normalized

    def _write_template(self, data: dict) -> None:
        with self._lock:
            path = self.path
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps(data, ensure_ascii=True, indent=2) + "\n", encoding="ascii")


export_template_service = ExportTemplateService()
