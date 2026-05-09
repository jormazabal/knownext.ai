from functools import lru_cache
from pathlib import Path


@lru_cache
def get_app_version() -> str:
    for parent in Path(__file__).resolve().parents:
        version_file = parent / "VERSION"
        if version_file.exists():
            return version_file.read_text(encoding="utf-8").strip()

    return "0.0.0"


APP_VERSION = get_app_version()
