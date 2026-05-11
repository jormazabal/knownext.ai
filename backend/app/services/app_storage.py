from __future__ import annotations

import json
import os
import threading
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4


APP_DATA_DIR_ENV = "KNOWNEXT_APP_DATA_DIR"
APP_DATA_DIR_NAME = "KnowNext.ai"
_STORE_LOCKS_GUARD = threading.Lock()
_STORE_LOCKS: dict[str, threading.RLock] = {}


def get_app_data_dir() -> Path:
    configured_dir = os.environ.get(APP_DATA_DIR_ENV)
    if configured_dir:
        return Path(configured_dir)

    appdata_dir = os.environ.get("APPDATA")
    if appdata_dir:
        return Path(appdata_dir) / APP_DATA_DIR_NAME

    return Path.home() / ".knownext.ai"


def get_legacy_app_data_dirs() -> list[Path]:
    current_dir = get_app_data_dir()
    candidates: list[Path] = []

    appdata_dir = os.environ.get("APPDATA")
    if appdata_dir:
        candidates.append(Path(appdata_dir) / APP_DATA_DIR_NAME)

    candidates.append(Path.home() / ".knownext.ai")

    unique_candidates: list[Path] = []
    seen = {str(current_dir.resolve()) if current_dir.exists() else str(current_dir)}
    for candidate in candidates:
        key = str(candidate.resolve()) if candidate.exists() else str(candidate)
        if key in seen:
            continue
        seen.add(key)
        unique_candidates.append(candidate)

    return unique_candidates


def _matches_default_data(data: dict[str, Any], default: dict[str, Any]) -> bool:
    comparable_data = deepcopy(data)
    comparable_default = deepcopy(default)
    comparable_data.pop("updatedAt", None)
    comparable_default.pop("updatedAt", None)
    return comparable_data == comparable_default


class JsonFileStore:
    def __init__(self, filename: str) -> None:
        self.filename = filename

    @property
    def path(self) -> Path:
        return get_app_data_dir() / self.filename

    @property
    def lock(self) -> threading.RLock:
        key = str(self.path.resolve())
        with _STORE_LOCKS_GUARD:
            if key not in _STORE_LOCKS:
                _STORE_LOCKS[key] = threading.RLock()
            return _STORE_LOCKS[key]

    def read(self, default: dict[str, Any]) -> dict[str, Any]:
        with self.lock:
            path = self.path
            if not path.exists():
                legacy_data = self._read_legacy_file(default)
                if legacy_data is not None:
                    self.write(legacy_data)
                    return legacy_data
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

            if _matches_default_data(data, default):
                legacy_data = self._read_legacy_file(default)
                if legacy_data is not None:
                    self.write(legacy_data)
                    return legacy_data

            return data

    def _read_legacy_file(self, default: dict[str, Any]) -> dict[str, Any] | None:
        for legacy_dir in get_legacy_app_data_dirs():
            legacy_path = legacy_dir / self.filename
            if not legacy_path.exists() or legacy_path == self.path:
                continue

            try:
                with legacy_path.open("r", encoding="utf-8") as file:
                    data = json.load(file)
            except (json.JSONDecodeError, OSError):
                continue

            if isinstance(data, dict) and not _matches_default_data(data, default):
                return data

        return None

    def write(self, data: dict[str, Any]) -> None:
        with self.lock:
            path = self.path
            path.parent.mkdir(parents=True, exist_ok=True)
            temp_path = path.with_name(
                f"{path.name}.{os.getpid()}.{threading.get_ident()}.{uuid4().hex}.tmp"
            )

            try:
                with temp_path.open("w", encoding="utf-8") as file:
                    json.dump(data, file, ensure_ascii=False, indent=2)
                    file.write("\n")

                temp_path.replace(path)
            finally:
                try:
                    temp_path.unlink(missing_ok=True)
                except OSError:
                    pass

    def _backup_invalid_file(self, path: Path) -> None:
        with self.lock:
            if not path.exists():
                return

            timestamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
            backup_path = path.with_name(f"{path.name}.corrupt-{timestamp}")
            try:
                path.replace(backup_path)
            except OSError:
                pass
