from __future__ import annotations

import hashlib
from datetime import datetime, timezone
from pathlib import Path

from fastapi import HTTPException

from app.schemas.project import (
    ExternalChangeImportRequest,
    ExternalChangeImportResult,
    ExternalChangeItem,
    ExternalChangeSet,
    ExternalChangeSummary,
)
from app.services.filesystem_service import DOCUMENT_SUFFIXES, EXCLUDED_DIRS, IMAGE_SUFFIXES, filesystem_service
from app.services.git_service import git_service
from app.services.project_service import project_service


SAFE_AUTOIMPORT_LIMIT = 50
SAFE_AUTOIMPORT_SIZE_BYTES = 25 * 1024 * 1024
PRIVATE_SUFFIXES = {".env", ".key", ".pem", ".p12", ".pfx", ".crt", ".cer"}
PRIVATE_NAMES = {".env", ".env.local", ".env.production", "id_rsa", "id_ed25519"}

class ExternalChangesService:
    def scan(self, project_id: str) -> ExternalChangeSet:
        registry = project_service._read_registry()
        project = project_service._find_project(registry, project_id)
        root = Path(project["folderPath"]).resolve()
        if not root.exists() or not root.is_dir():
            raise HTTPException(status_code=404, detail="Project folder not found")

        if project["versioningMode"] != "local-git":
            return self._empty_change_set(
                project_id,
                source="github-api-cache" if project["versioningMode"] == "github-api" else "filesystem",
                message="La detección automática de cambios externos requiere un proyecto con historial Git local.",
            )

        with git_service.repository_lock(root):
            git_service.ensure_repository(root)
            items = self._items_from_porcelain(project_id, root, git_service.porcelain_status(root))
        summary = self._summarize(items)
        requires_review = summary.review > 0 or summary.blocked > 0 or summary.total > SAFE_AUTOIMPORT_LIMIT or summary.totalBytes > SAFE_AUTOIMPORT_SIZE_BYTES
        status = "none"
        if summary.total:
            status = "needs-review" if requires_review else "safe"
        if summary.blocked == summary.total and summary.total > 0:
            status = "blocked"

        return ExternalChangeSet(
            id=self._change_set_id(project_id, items),
            projectId=project_id,
            title=self._title(items),
            source="git",
            status=status,
            detectedAt=datetime.now(timezone.utc).isoformat(),
            requiresReview=requires_review,
            summary=summary,
            items=items,
            message=self._message(summary, requires_review),
        )

    def import_changes(self, project_id: str, payload: ExternalChangeImportRequest) -> ExternalChangeImportResult:
        registry = project_service._read_registry()
        project = project_service._find_project(registry, project_id)
        root = Path(project["folderPath"]).resolve()
        if project["versioningMode"] != "local-git":
            raise HTTPException(status_code=409, detail="External imports require local Git versioning")

        with git_service.repository_lock(root):
            change_set = self.scan(project_id)
            decisions = {decision.itemId: decision.decision for decision in payload.decisions}
            selected_items = [
                item
                for item in change_set.items
                if item.risk != "blocked" and decisions.get(item.id, item.decision) == "include"
            ]
            selected_paths = [item.path for item in selected_items if item.kind != "folder"]
            if not selected_paths:
                raise HTTPException(status_code=409, detail="No safe external changes selected")

            version_title = f"Importación externa: {self._import_title(selected_items)}"
            git_service.create_project_version(root, selected_paths, version_title)
            pending_remote_sync = False
            status = "synced"
            message = "Versión local guardada."

            if payload.syncRemote and project.get("syncMode") == "manual-github" and git_service.has_remote_origin(root):
                status = "syncing"
                try:
                    git_service.pull(root)
                    git_service.push(root)
                    message = "Versión local guardada y sincronizada con GitHub."
                except HTTPException:
                    pending_remote_sync = True
                    status = "pending"
                    message = "Versión local guardada. La sincronización con GitHub queda pendiente."
            elif project.get("syncMode") == "manual-github":
                pending_remote_sync = True
                status = "pending"
                message = "Versión local guardada. No hay remoto GitHub configurado para sincronizar."

        return ExternalChangeImportResult(
            status=status,
            message=message,
            tree=filesystem_service.get_tree(project_id, root),
            versionTitle=version_title,
            syncedAt=datetime.now(timezone.utc).isoformat() if not pending_remote_sync else None,
            pendingRemoteSync=pending_remote_sync,
        )

    def _items_from_porcelain(self, project_id: str, root: Path, status_output: str) -> list[ExternalChangeItem]:
        items: list[ExternalChangeItem] = []
        status_paths = {self._path_from_porcelain_line(line) for line in status_output.splitlines() if len(line) >= 4}
        for line in status_output.splitlines():
            if not line.strip() or len(line) < 4:
                continue
            code = line[:2]
            path = self._path_from_porcelain_line(line)
            change_type = self._change_type(code)
            candidate = root / path
            item = self._classify_item(project_id, root, path, candidate, change_type)
            items.append(item)
            if item.changeType == "added":
                items.extend(self._new_parent_folder_items(project_id, root, path, status_paths))
        return self._dedupe_items(items)

    def _classify_item(self, project_id: str, root: Path, path: str, candidate: Path, change_type: str) -> ExternalChangeItem:
        name = Path(path).name
        suffix = Path(path).suffix.lower()
        parts = set(Path(path).parts)
        size = candidate.stat().st_size if candidate.exists() and candidate.is_file() else None
        kind = "unsupported"
        risk = "blocked"
        decision = "omit"
        reason = "Tipo de archivo no compatible con la documentación."

        if any(part in EXCLUDED_DIRS or part.startswith(".git") for part in parts):
            kind = "ignored"
            reason = "Carpeta técnica omitida automáticamente."
        elif name.lower() in PRIVATE_NAMES or suffix in PRIVATE_SUFFIXES:
            kind = "private"
            reason = "Archivo potencialmente privado. No se importa automáticamente."
        elif candidate.exists() and candidate.is_dir():
            kind = "folder"
            risk = "safe"
            decision = "include"
            reason = None
        elif suffix in DOCUMENT_SUFFIXES:
            kind = "document"
            risk = "review" if change_type == "deleted" else "safe"
            decision = "review" if risk == "review" else "include"
            reason = "Eliminación externa: revisa antes de versionar." if change_type == "deleted" else None
        elif suffix in IMAGE_SUFFIXES:
            kind = "image"
            risk = "safe"
            decision = "include"
            reason = None
        elif candidate.exists() and candidate.is_file():
            kind = "attachment"
            risk = "review"
            decision = "review"
            reason = "Archivo de apoyo, requiere confirmación."

        if size and size > SAFE_AUTOIMPORT_SIZE_BYTES:
            risk = "review" if risk != "blocked" else risk
            decision = "review" if risk == "review" else decision
            reason = "Archivo grande: revisa antes de versionar."

        return ExternalChangeItem(
            id=self._item_id(project_id, path, change_type),
            path=path,
            name=name,
            changeType=change_type,
            kind=kind,
            risk=risk,
            decision=decision,
            sizeBytes=size,
            reason=reason,
        )

    def _new_parent_folder_items(self, project_id: str, root: Path, path: str, status_paths: set[str]) -> list[ExternalChangeItem]:
        items: list[ExternalChangeItem] = []
        parts = Path(path).parts[:-1]
        for index in range(1, len(parts) + 1):
            folder_path = Path(*parts[:index]).as_posix()
            if not folder_path:
                continue
            if folder_path in status_paths:
                continue
            folder = root / folder_path
            if folder.exists() and folder.is_dir():
                items.append(self._classify_item(project_id, root, folder_path, folder, "added"))
        return items

    def _dedupe_items(self, items: list[ExternalChangeItem]) -> list[ExternalChangeItem]:
        seen: set[str] = set()
        deduped: list[ExternalChangeItem] = []
        for item in sorted(items, key=lambda candidate: (candidate.path.count("/"), candidate.path.lower(), candidate.kind)):
            key = f"{item.changeType}:{item.path}"
            if key in seen:
                continue
            seen.add(key)
            deduped.append(item)
        return deduped

    def _summarize(self, items: list[ExternalChangeItem]) -> ExternalChangeSummary:
        return ExternalChangeSummary(
            total=len(items),
            safe=sum(1 for item in items if item.risk == "safe"),
            review=sum(1 for item in items if item.risk == "review"),
            blocked=sum(1 for item in items if item.risk == "blocked"),
            added=sum(1 for item in items if item.changeType == "added"),
            modified=sum(1 for item in items if item.changeType == "modified"),
            deleted=sum(1 for item in items if item.changeType == "deleted"),
            folders=sum(1 for item in items if item.kind == "folder"),
            documents=sum(1 for item in items if item.kind == "document"),
            images=sum(1 for item in items if item.kind == "image"),
            attachments=sum(1 for item in items if item.kind == "attachment"),
            omitted=sum(1 for item in items if item.decision == "omit"),
            totalBytes=sum(item.sizeBytes or 0 for item in items),
        )

    def _empty_change_set(self, project_id: str, source: str, message: str | None = None) -> ExternalChangeSet:
        return ExternalChangeSet(
            id=self._change_set_id(project_id, []),
            projectId=project_id,
            title="Sin cambios externos",
            source=source,
            status="none",
            detectedAt=datetime.now(timezone.utc).isoformat(),
            requiresReview=False,
            summary=ExternalChangeSummary(),
            items=[],
            message=message,
        )

    def _change_type(self, code: str) -> str:
        if code == "??" or "A" in code:
            return "added"
        if "D" in code:
            return "deleted"
        if "R" in code:
            return "renamed"
        return "modified"

    def _path_from_porcelain_line(self, line: str) -> str:
        raw_path = line[3:].strip()
        return self._decode_git_path(raw_path.split(" -> ", 1)[-1]).replace("\\", "/")

    def _decode_git_path(self, path: str) -> str:
        if len(path) >= 2 and path.startswith('"') and path.endswith('"'):
            return self._decode_git_quoted_path(path[1:-1])
        return path

    def _decode_git_quoted_path(self, path: str) -> str:
        decoded = bytearray()
        index = 0
        simple_escapes = {
            "a": b"\a",
            "b": b"\b",
            "t": b"\t",
            "n": b"\n",
            "v": b"\v",
            "f": b"\f",
            "r": b"\r",
            "\\": b"\\",
            '"': b'"',
            "?": b"?",
        }
        while index < len(path):
            char = path[index]
            if char != "\\":
                decoded.extend(char.encode("utf-8"))
                index += 1
                continue

            next_index = index + 1
            if next_index >= len(path):
                decoded.extend(b"\\")
                index += 1
                continue

            escaped = path[next_index]
            if escaped in "01234567":
                end = next_index
                while end < len(path) and end < next_index + 3 and path[end] in "01234567":
                    end += 1
                decoded.append(int(path[next_index:end], 8))
                index = end
                continue

            replacement = simple_escapes.get(escaped)
            decoded.extend(replacement if replacement is not None else escaped.encode("utf-8"))
            index += 2
        return decoded.decode("utf-8", errors="replace")

    def _title(self, items: list[ExternalChangeItem]) -> str:
        if not items:
            return "Sin cambios externos"
        folder = next((item for item in items if item.kind == "folder"), None)
        if folder:
            return f'Cambios externos en "{folder.name}"'
        return f"{len(items)} cambios externos detectados"

    def _import_title(self, items: list[ExternalChangeItem]) -> str:
        folder = next((item for item in items if item.kind == "folder"), None)
        if folder:
            return folder.name
        first = items[0].name if items else "cambios"
        return first if len(items) == 1 else f"{first} y {len(items) - 1} más"

    def _message(self, summary: ExternalChangeSummary, requires_review: bool) -> str | None:
        if summary.total == 0:
            return None
        if requires_review:
            return "Revisa los cambios antes de incorporarlos al historial."
        return "Los cambios detectados son seguros para importar automáticamente."

    def _item_id(self, project_id: str, path: str, change_type: str) -> str:
        digest = hashlib.sha1(f"{project_id}:{change_type}:{path}".encode("utf-8")).hexdigest()[:16]
        return f"external-{digest}"

    def _change_set_id(self, project_id: str, items: list[ExternalChangeItem]) -> str:
        source = "|".join(f"{item.changeType}:{item.path}:{item.risk}" for item in items)
        digest = hashlib.sha1(f"{project_id}:{source}".encode("utf-8")).hexdigest()[:16]
        return f"changes-{digest}"


external_changes_service = ExternalChangesService()
