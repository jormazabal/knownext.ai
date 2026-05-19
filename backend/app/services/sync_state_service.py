from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
from typing import Any

from app.services.app_storage import JsonFileStore


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class SyncStateService:
    def __init__(self) -> None:
        self.store = JsonFileStore("sync-state.json")

    def read(self) -> dict[str, Any]:
        data = self.store.read({"schemaVersion": 1, "projects": {}})
        if not isinstance(data.get("projects"), dict):
            data["projects"] = {}
            self.store.write(data)
        return data

    def get_project_state(self, project_id: str) -> dict[str, Any]:
        registry = self.read()
        state = registry["projects"].get(project_id)
        if isinstance(state, dict):
            return deepcopy(state)
        return self._default_project_state()

    def update_project_state(self, project_id: str, patch: dict[str, Any]) -> dict[str, Any]:
        registry = self.read()
        current = registry["projects"].get(project_id)
        if not isinstance(current, dict):
            current = self._default_project_state()
        next_state = {**current, **patch, "updatedAt": _now_iso()}
        registry["projects"][project_id] = next_state
        self.store.write(registry)
        return deepcopy(next_state)

    def clear_project_state(self, project_id: str) -> None:
        registry = self.read()
        if project_id in registry["projects"]:
            del registry["projects"][project_id]
            self.store.write(registry)

    def _default_project_state(self) -> dict[str, Any]:
        now = _now_iso()
        return {
            "state": "unconfigured",
            "lastScanAt": None,
            "lastSyncAt": None,
            "lastSuccessfulPushAt": None,
            "lastSuccessfulPullAt": None,
            "lastLocalHead": None,
            "lastRemoteHead": None,
            "pendingPush": False,
            "pendingPull": False,
            "pendingAutoVersionPaths": [],
            "conflicts": [],
            "lastError": None,
            "updatedAt": now,
        }


sync_state_service = SyncStateService()
