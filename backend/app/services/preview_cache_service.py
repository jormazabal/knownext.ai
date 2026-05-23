from __future__ import annotations

import json
import shutil
from pathlib import Path
from typing import Any

from app.services.app_storage import get_app_data_dir


class PreviewCacheService:
    @property
    def root(self) -> Path:
        return get_app_data_dir() / "preview-cache"

    def preview_dir(self, project_id: str, source_hash: str) -> Path:
        return self.root / safe_segment(project_id) / safe_segment(source_hash)

    def read_json(self, path: Path) -> dict[str, Any] | None:
        if not path.exists():
            return None
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            return data if isinstance(data, dict) else None
        except (json.JSONDecodeError, OSError):
            return None

    def write_json(self, path: Path, data: dict[str, Any]) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    def clear_project(self, project_id: str) -> None:
        shutil.rmtree(self.root / safe_segment(project_id), ignore_errors=True)


def safe_segment(value: str) -> str:
    return "".join(char if char.isalnum() or char in {"-", "_"} else "_" for char in value)[:96] or "preview"


preview_cache_service = PreviewCacheService()
