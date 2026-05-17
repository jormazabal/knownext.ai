from __future__ import annotations

import os
import subprocess
import threading
import time
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterator

from fastapi import HTTPException

from app.schemas.version import VersionRecord


class GitService:
    def __init__(self) -> None:
        self._locks: dict[str, threading.RLock] = {}
        self._locks_guard = threading.Lock()

    @contextmanager
    def repository_lock(self, root: Path) -> Iterator[None]:
        lock = self._lock_for(root)
        with lock:
            yield

    def is_repository(self, root: Path) -> bool:
        return (root / ".git").exists()

    def ensure_repository(self, root: Path) -> None:
        root.mkdir(parents=True, exist_ok=True)
        if self.is_repository(root):
            return
        self._run(root, ["git", "init"])
        self._run(root, ["git", "config", "user.name", "KnowNext.ai"])
        self._run(root, ["git", "config", "user.email", "knownext@local"])

    def document_history(self, root: Path, relative_path: str) -> list[VersionRecord]:
        if not self.is_repository(root):
            return []
        output = self._run(
            root,
            ["git", "log", "--follow", "--date=iso-strict", "--pretty=format:%H%x1f%an%x1f%ad%x1f%s", "--", relative_path],
            allow_empty=True,
        )
        rows = [row for row in output.splitlines() if row.strip()]
        versions: list[VersionRecord] = []
        for index, row in enumerate(rows):
            try:
                commit_hash, author, date_value, title = row.split("\x1f", 3)
            except ValueError:
                continue
            versions.append(
                VersionRecord(
                    id=f"git-{commit_hash}",
                    hash=commit_hash[:7],
                    title=title or "Versión del documento",
                    author=author or "KnowNext.ai",
                    authorInitials=self._initials(author or "KN"),
                    relativeTime=self._relative_time(date_value),
                    current=index == 0,
                )
            )
        return versions

    def create_version(self, root: Path, relative_path: str, title: str) -> VersionRecord:
        self.ensure_repository(root)
        self._run(root, ["git", "add", "--", relative_path])
        status = self._run(root, ["git", "status", "--porcelain", "--", relative_path], allow_empty=True)
        if not status.strip():
            raise HTTPException(status_code=409, detail="No document changes to version")
        self._run(root, ["git", "commit", "-m", title.strip() or "Actualiza documento"])
        history = self.document_history(root, relative_path)
        if not history:
            raise HTTPException(status_code=500, detail="Version was created but history could not be read")
        return history[0]

    def status(self, root: Path) -> tuple[bool, str | None, str | None]:
        if not self.is_repository(root):
            return False, None, None
        has_changes = bool(self._run(root, ["git", "status", "--porcelain"], allow_empty=True, optional_locks=False).strip())
        last_hash = self._run(root, ["git", "rev-parse", "--short", "HEAD"], allow_empty=True).strip() or None
        last_date = self._run(root, ["git", "log", "-1", "--date=iso-strict", "--pretty=%ad"], allow_empty=True).strip() or None
        return has_changes, last_hash, self._relative_time(last_date) if last_date else None

    def pull(self, root: Path) -> str:
        if not self.is_repository(root):
            raise HTTPException(status_code=409, detail="Project is not a Git repository")
        return self._run(root, ["git", "pull", "--ff-only"], allow_empty=True)

    def push(self, root: Path) -> str:
        if not self.is_repository(root):
            raise HTTPException(status_code=409, detail="Project is not a Git repository")
        return self._run(root, ["git", "push"], allow_empty=True)

    def porcelain_status(self, root: Path) -> str:
        if not self.is_repository(root):
            return ""
        return self._run(root, ["git", "status", "--porcelain", "-uall"], allow_empty=True, optional_locks=False)

    def has_remote_origin(self, root: Path) -> bool:
        if not self.is_repository(root):
            return False
        remotes = {remote.strip() for remote in self._run(root, ["git", "remote"], allow_empty=True).splitlines()}
        return "origin" in remotes

    def create_project_version(self, root: Path, relative_paths: list[str], title: str) -> str | None:
        self.ensure_repository(root)
        paths = [path for path in relative_paths if path.strip()]
        if not paths:
            raise HTTPException(status_code=400, detail="No paths selected for version")
        self._run(root, ["git", "add", "--", *paths])
        status = self._run(root, ["git", "status", "--porcelain", "--", *paths], allow_empty=True)
        if not status.strip():
            raise HTTPException(status_code=409, detail="No selected changes to version")
        self._run(root, ["git", "commit", "-m", title.strip() or "Importa cambios externos"])
        return self._run(root, ["git", "rev-parse", "--short", "HEAD"], allow_empty=True).strip() or None

    def set_remote_origin(self, root: Path, remote_url: str) -> None:
        self.ensure_repository(root)
        remotes = {remote.strip() for remote in self._run(root, ["git", "remote"], allow_empty=True).splitlines()}
        if "origin" in remotes:
            self._run(root, ["git", "remote", "set-url", "origin", remote_url])
            return
        self._run(root, ["git", "remote", "add", "origin", remote_url])

    def _run(self, cwd: Path, command: list[str], allow_empty: bool = False, optional_locks: bool = True) -> str:
        env = None
        if not optional_locks:
            env = {**os.environ, "GIT_OPTIONAL_LOCKS": "0"}

        last_error = ""
        for attempt in range(6):
            try:
                result = subprocess.run(command, cwd=cwd, env=env, text=True, encoding="utf-8", capture_output=True, check=False)
            except FileNotFoundError as error:
                raise HTTPException(status_code=500, detail="Git is not installed or not available") from error
            if result.returncode == 0:
                return result.stdout
            last_error = (result.stderr or result.stdout or "Git command failed").strip()
            if allow_empty and self._is_empty_revision_error(result.stderr):
                return ""
            if not self._is_index_lock_error(last_error):
                break
            time.sleep(0.2 * (attempt + 1))
        raise HTTPException(status_code=409, detail=last_error)

    def _lock_for(self, root: Path) -> threading.RLock:
        key = str(root.resolve()).lower()
        with self._locks_guard:
            lock = self._locks.get(key)
            if lock is None:
                lock = threading.RLock()
                self._locks[key] = lock
            return lock

    def _is_empty_revision_error(self, stderr: str) -> bool:
        normalized = stderr.lower()
        return (
            "does not have any commits yet" in normalized
            or "needed a single revision" in normalized
            or "ambiguous argument 'head'" in normalized
        )

    def _is_index_lock_error(self, message: str) -> bool:
        normalized = message.lower()
        return "index.lock" in normalized or "another git process seems to be running" in normalized

    def _initials(self, name: str) -> str:
        parts = [part for part in name.replace("@", " ").split() if part]
        return "".join(part[0] for part in parts[:2]).upper() or "KN"

    def _relative_time(self, value: str) -> str:
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return value
        delta = datetime.now(timezone.utc) - parsed.astimezone(timezone.utc)
        if delta.days > 1:
            return f"hace {delta.days} días"
        if delta.days == 1:
            return "ayer"
        hours = delta.seconds // 3600
        if hours:
            return f"hace {hours} horas"
        minutes = max(delta.seconds // 60, 1)
        return f"hace {minutes} min"


git_service = GitService()
