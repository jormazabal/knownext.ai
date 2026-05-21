from __future__ import annotations

import hashlib
from copy import deepcopy
from datetime import datetime, timezone
from typing import Any

from app.schemas.activity import ActivityEvent, ActivityEventList, ActivityScope, ActivityTone
from app.services.app_storage import JsonFileStore


MAX_PROJECT_EVENTS = 100


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class ActivityService:
    def __init__(self) -> None:
        self.store = JsonFileStore("activity.json")

    def list_project_events(self, project_id: str, limit: int = 50) -> ActivityEventList:
        registry = self._read()
        raw_events = registry["projects"].get(project_id, [])
        if not isinstance(raw_events, list):
            raw_events = []
        events = []
        for raw_event in raw_events[: max(1, min(limit, MAX_PROJECT_EVENTS))]:
            if isinstance(raw_event, dict):
                try:
                    events.append(ActivityEvent(**raw_event))
                except ValueError:
                    continue
        return ActivityEventList(projectId=project_id, events=events)

    def record(
        self,
        project_id: str,
        *,
        event_type: str,
        scope: ActivityScope,
        title: str,
        message: str,
        tone: ActivityTone = "info",
        document_path: str | None = None,
        repository: str | None = None,
    ) -> ActivityEvent:
        registry = self._read()
        raw_events = registry["projects"].get(project_id, [])
        if not isinstance(raw_events, list):
            raw_events = []
        event = ActivityEvent(
            id=self._event_id(project_id, event_type, title, message),
            projectId=project_id,
            type=event_type,
            scope=scope,
            title=title,
            message=message,
            tone=tone,
            createdAt=_now_iso(),
            documentPath=document_path,
            repository=repository,
        )
        registry["projects"][project_id] = [event.model_dump(), *raw_events][:MAX_PROJECT_EVENTS]
        self.store.write(registry)
        return event

    def clear_project_events(self, project_id: str) -> None:
        registry = self._read()
        if project_id in registry["projects"]:
            del registry["projects"][project_id]
            self.store.write(registry)

    def _read(self) -> dict[str, Any]:
        data = self.store.read({"schemaVersion": 1, "projects": {}})
        if not isinstance(data.get("projects"), dict):
            data["projects"] = {}
            self.store.write(data)
        return deepcopy(data)

    def _event_id(self, project_id: str, event_type: str, title: str, message: str) -> str:
        digest = hashlib.sha1(f"{project_id}:{event_type}:{title}:{message}:{_now_iso()}".encode("utf-8")).hexdigest()[:16]
        return f"activity-{digest}"


activity_service = ActivityService()
