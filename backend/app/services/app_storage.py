from __future__ import annotations

import json
import os
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


APP_DATA_DIR_ENV = "KNOWNEXT_APP_DATA_DIR"
APP_DATA_DIR_NAME = "KnowNext.ai"


def get_app_data_dir() -> Path:
    configured_dir = os.environ.get(APP_DATA_DIR_ENV)
    if configured_dir:
        return Path(configured_dir)

    appdata_dir = os.environ.get("APPDATA")
    if appdata_dir:
        return Path(appdata_dir) / APP_DATA_DIR_NAME

    return Path.home() / ".knownext.ai"


class JsonFileStore:
    def __init__(self, filename: str) -> None:
        self.filename = filename

    @property
    def path(self) -> Path:
        return get_app_data_dir() / self.filename

    def read(self, default: dict[str, Any]) -> dict[str, Any]:
        path = self.path
        if not path.exists():
            self.write(default)
            return deepcopy(default)

        try:
            with path.open("r", encoding="utf-8") as file:
                data = json.load(file)
        except (json.JSONDecodeError, OSError):
            self._backup_invalid_file(path)
            self.write(default)
            return deepcopy(default)

        if not isinstance(data, dict):
            self._backup_invalid_file(path)
            self.write(default)
            return deepcopy(default)

        return data

    def write(self, data: dict[str, Any]) -> None:
        path = self.path
        path.parent.mkdir(parents=True, exist_ok=True)
        temp_path = path.with_suffix(f"{path.suffix}.tmp")

        with temp_path.open("w", encoding="utf-8") as file:
            json.dump(data, file, ensure_ascii=False, indent=2)
            file.write("\n")

        temp_path.replace(path)

    def _backup_invalid_file(self, path: Path) -> None:
        if not path.exists():
            return

        timestamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
        backup_path = path.with_name(f"{path.name}.corrupt-{timestamp}")
        try:
            path.replace(backup_path)
        except OSError:
            pass
