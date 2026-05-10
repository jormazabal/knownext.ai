from __future__ import annotations

import traceback
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.services.app_storage import get_app_data_dir
from app.services.config_service import config_service


class TraceLoggingService:
    @property
    def log_dir(self) -> Path:
        return get_app_data_dir() / "logs"

    @property
    def log_file(self) -> Path:
        return self.log_dir / "knownext.log"

    def is_enabled(self) -> bool:
        return config_service.get_config().diagnostics.traceLoggingEnabled

    def status(self) -> dict[str, Any]:
        if self.is_enabled():
            self.log_dir.mkdir(parents=True, exist_ok=True)

        return {
            "enabled": self.is_enabled(),
            "folderPath": str(self.log_dir),
            "filePath": str(self.log_file),
        }

    def record(self, level: str, source: str, message: str, detail: str | None = None) -> bool:
        if not self.is_enabled():
            return False

        self.log_dir.mkdir(parents=True, exist_ok=True)
        normalized_level = (level or "error").upper()
        timestamp = datetime.now(timezone.utc).isoformat()
        entry = f"{timestamp} [{normalized_level}] {source}\nMessage: {message}\n"
        if detail and detail.strip():
            entry += f"Detail:\n{detail.rstrip()}\n"
        entry += "---\n"

        with self.log_file.open("a", encoding="utf-8") as file:
            file.write(entry)

        return True

    def record_exception(self, source: str, error: BaseException) -> bool:
        return self.record(
            level="error",
            source=source,
            message=str(error),
            detail="".join(traceback.format_exception(type(error), error, error.__traceback__)),
        )


trace_logging_service = TraceLoggingService()
