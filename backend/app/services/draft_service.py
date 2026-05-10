from __future__ import annotations

import hashlib
import json
import re
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.schemas.document import DocumentFingerprint
from app.services.app_storage import get_app_data_dir
from app.services.filesystem_service import decode_document_id


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _fingerprint_dict(fingerprint: DocumentFingerprint | dict[str, Any] | None) -> dict[str, Any] | None:
    if fingerprint is None:
        return None
    if isinstance(fingerprint, DocumentFingerprint):
        return fingerprint.model_dump()
    return {
        "mtimeNs": fingerprint.get("mtimeNs"),
        "size": fingerprint.get("size"),
        "sha256": fingerprint.get("sha256"),
    }


class DraftService:
    schema_version = 1
    draft_key_pattern = re.compile(r"^[a-f0-9]{64}$")

    @property
    def drafts_dir(self) -> Path:
        return get_app_data_dir() / "drafts"

    @property
    def corrupt_dir(self) -> Path:
        return self.drafts_dir / "corrupt"

    def run_maintenance(self) -> None:
        self.drafts_dir.mkdir(parents=True, exist_ok=True)
        for temp_path in self.drafts_dir.glob("*.tmp"):
            try:
                temp_path.unlink()
            except OSError:
                pass

    def get_draft(self, document_id: str) -> dict[str, Any] | None:
        self.run_maintenance()
        path = self._draft_path(document_id)
        if not path.exists():
            return None

        try:
            with path.open("r", encoding="utf-8") as file:
                data = json.load(file)
        except (OSError, json.JSONDecodeError):
            self._move_corrupt(path)
            return None

        if not self._is_valid_draft(data, document_id):
            self._move_corrupt(path)
            return None

        return data

    def get_draft_by_key(self, draft_key: str) -> dict[str, Any] | None:
        if not self._is_valid_draft_key(draft_key):
            return None
        path = self.drafts_dir / f"{draft_key}.json"
        if not path.exists():
            return None

        try:
            with path.open("r", encoding="utf-8") as file:
                data = json.load(file)
        except (OSError, json.JSONDecodeError):
            self._move_corrupt(path)
            return None

        if not isinstance(data, dict) or not isinstance(data.get("documentId"), str) or not self._is_valid_draft(data, data["documentId"]):
            self._move_corrupt(path)
            return None

        return data

    def list_drafts(self) -> list[dict[str, Any]]:
        self.run_maintenance()
        drafts: list[dict[str, Any]] = []
        for path in sorted(self.drafts_dir.glob("*.json")):
            draft_key = path.stem
            draft = self.get_draft_by_key(draft_key)
            if draft is not None:
                drafts.append({**draft, "draftKey": draft_key})
        return drafts

    def save_draft(
        self,
        *,
        document_id: str,
        project_id: str,
        path: str,
        name: str,
        markdown: str,
        base_fingerprint: DocumentFingerprint | dict[str, Any] | None,
    ) -> dict[str, Any]:
        current = self.get_draft(document_id)
        now = _now_iso()
        data = {
            "schemaVersion": self.schema_version,
            "documentId": document_id,
            "projectId": project_id,
            "path": path,
            "name": name,
            "markdown": markdown,
            "baseFingerprint": _fingerprint_dict(base_fingerprint),
            "createdAt": current.get("createdAt") if current else now,
            "draftUpdatedAt": now,
        }
        self._write_draft(document_id, data)
        return deepcopy(data)

    def delete_draft(self, document_id: str) -> None:
        path = self._draft_path(document_id)
        try:
            path.unlink()
        except FileNotFoundError:
            pass

    def delete_draft_by_key(self, draft_key: str) -> bool:
        if not self._is_valid_draft_key(draft_key):
            return False
        path = self.drafts_dir / f"{draft_key}.json"
        try:
            path.unlink()
            return True
        except FileNotFoundError:
            return False

    def migrate_draft(self, old_document_id: str, new_document_id: str) -> None:
        draft = self.get_draft(old_document_id)
        if draft is None:
            return

        try:
            project_id, relative_path = decode_document_id(new_document_id)
        except Exception:
            project_id = draft["projectId"]
            relative_path = draft["path"]

        draft = {
            **draft,
            "documentId": new_document_id,
            "projectId": project_id,
            "path": relative_path,
            "name": Path(relative_path).name,
            "draftUpdatedAt": _now_iso(),
        }
        self._write_draft(new_document_id, draft)
        self.delete_draft(old_document_id)

    def apply_affected_documents(self, affected_documents: list[Any]) -> None:
        for affected in affected_documents:
            old_id = getattr(affected, "oldId", None)
            new_id = getattr(affected, "newId", None)
            if not old_id:
                continue
            if new_id:
                self.migrate_draft(old_id, new_id)
            else:
                self.delete_draft(old_id)

    def _draft_path(self, document_id: str) -> Path:
        digest = hashlib.sha256(document_id.encode("utf-8")).hexdigest()
        return self.drafts_dir / f"{digest}.json"

    def _is_valid_draft_key(self, draft_key: str) -> bool:
        return bool(self.draft_key_pattern.fullmatch(draft_key))

    def _write_draft(self, document_id: str, data: dict[str, Any]) -> None:
        self.drafts_dir.mkdir(parents=True, exist_ok=True)
        path = self._draft_path(document_id)
        temp_path = path.with_suffix(".json.tmp")
        with temp_path.open("w", encoding="utf-8") as file:
            json.dump(data, file, ensure_ascii=False, indent=2)
            file.write("\n")
        temp_path.replace(path)

    def _move_corrupt(self, path: Path) -> None:
        if not path.exists():
            return
        try:
            self.corrupt_dir.mkdir(parents=True, exist_ok=True)
            target = self.corrupt_dir / f"{path.name}.corrupt-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}"
            path.replace(target)
        except OSError:
            pass

    def _is_valid_draft(self, data: object, document_id: str) -> bool:
        if not isinstance(data, dict):
            return False
        if data.get("schemaVersion") != self.schema_version:
            return False
        required_strings = ["documentId", "projectId", "path", "name", "markdown", "createdAt", "draftUpdatedAt"]
        if any(not isinstance(data.get(key), str) for key in required_strings):
            return False
        return data.get("documentId") == document_id


draft_service = DraftService()
