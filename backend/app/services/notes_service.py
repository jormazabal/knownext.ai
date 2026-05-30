from __future__ import annotations

from datetime import datetime, timezone

from app.schemas.notes import UserNotes
from app.services.app_storage import JsonFileStore


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _default_notes() -> dict[str, str | int]:
    return {
        "schemaVersion": 1,
        "markdown": "",
        "updatedAt": datetime(1970, 1, 1, tzinfo=timezone.utc).isoformat(),
    }


class NotesService:
    def __init__(self) -> None:
        self.store = JsonFileStore("notes.json")

    def get_notes(self) -> UserNotes:
        data = self._read_notes()
        return UserNotes(markdown=data["markdown"], updatedAt=data["updatedAt"])

    def update_notes(self, markdown: str) -> UserNotes:
        data = {
            "schemaVersion": 1,
            "markdown": markdown,
            "updatedAt": _now_iso(),
        }
        self.store.write(data)
        return UserNotes(markdown=data["markdown"], updatedAt=data["updatedAt"])

    def _read_notes(self) -> dict[str, str]:
        data = self.store.read(_default_notes())
        markdown = data.get("markdown")
        updated_at = data.get("updatedAt")
        if not isinstance(markdown, str) or not isinstance(updated_at, str):
            data = _default_notes()
            self.store.write(data)
        return {
            "markdown": str(data["markdown"]),
            "updatedAt": str(data["updatedAt"]),
        }


notes_service = NotesService()
