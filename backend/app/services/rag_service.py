from __future__ import annotations

import hashlib
import re
import sqlite3
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.services.app_storage import JsonFileStore, get_app_data_dir
from app.services.filesystem_service import DOCUMENT_SUFFIX, EXCLUDED_DIRS, get_document_id
from app.services.openai_service import openai_service


MANIFEST_SCHEMA_VERSION = 1
MAX_EXACT_MATCHES = 5
MAX_EXACT_SNIPPET_CHARS = 700


@dataclass
class RagIndexState:
    project_id: str
    enabled: bool
    status: str
    vector_store_id: str | None = None
    last_indexed_at: str | None = None
    error: str | None = None
    document_count: int = 0
    indexed_document_count: int = 0
    pending_document_count: int = 0
    failed_document_count: int = 0
    deleted_document_count: int = 0
    local_exact_ready: bool = False


class RagService:
    def get_status(self, project_id: str, globally_enabled: bool) -> RagIndexState:
        manifest = self._read_manifest(project_id)
        return self._state_from_manifest(project_id, manifest, globally_enabled)

    def index_project(self, project_id: str, project_root: Path) -> RagIndexState:
        manifest = self._read_manifest(project_id)
        current_documents = manifest.get("documents") if isinstance(manifest.get("documents"), dict) else {}
        vector_store_id = manifest.get("vectorStoreId") if isinstance(manifest.get("vectorStoreId"), str) else None

        self._write_manifest(project_id, {
            **manifest,
            "projectId": project_id,
            "enabled": True,
            "status": "indexing",
            "error": None,
        })

        scanned_documents = self._scan_documents(project_id, project_root)
        scanned_paths = {document["path"] for document in scanned_documents}
        next_documents: dict[str, dict[str, Any]] = {}
        failures: list[str] = []
        deleted_count = 0

        self._rebuild_local_exact_index(project_id, scanned_documents)

        try:
            if vector_store_id is None:
                vector_store_id = openai_service.create_vector_store(project_id)

            for path, record in current_documents.items():
                if path in scanned_paths:
                    continue
                deleted_count += 1
                self._delete_remote_record(vector_store_id, record)

            for document in scanned_documents:
                previous = current_documents.get(document["path"])
                if self._is_unchanged(previous, document):
                    next_documents[document["path"]] = {
                        **previous,
                        "status": "indexed",
                        "error": None,
                    }
                    continue

                if previous:
                    self._delete_remote_record(vector_store_id, previous)

                try:
                    remote = openai_service.upload_markdown_document(
                        vector_store_id=vector_store_id,
                        project_id=project_id,
                        relative_path=document["path"],
                        content=document["content"],
                        attributes={
                            "projectId": project_id,
                            "path": document["path"],
                            "documentId": document["documentId"],
                            "sha256": document["sha256"],
                            "updatedAt": document["updatedAt"],
                        },
                    )
                except Exception as error:
                    failures.append(document["path"])
                    next_documents[document["path"]] = {
                        **self._manifest_record(document),
                        "status": "error",
                        "error": str(error),
                    }
                    continue

                next_documents[document["path"]] = {
                    **self._manifest_record(document),
                    "openaiFileId": remote.get("openaiFileId"),
                    "vectorStoreFileId": remote.get("vectorStoreFileId"),
                    "indexedAt": _now_iso(),
                    "status": "indexed",
                    "error": None,
                }
        except Exception as error:
            next_manifest = {
                **manifest,
                "projectId": project_id,
                "enabled": True,
                "status": "error",
                "vectorStoreId": vector_store_id,
                "lastIndexedAt": manifest.get("lastIndexedAt"),
                "error": str(error),
                "documents": next_documents or current_documents,
                "deletedDocumentCount": deleted_count,
                "localExactReady": True,
            }
            self._write_manifest(project_id, next_manifest)
            return self._state_from_manifest(project_id, next_manifest, globally_enabled=True)

        status = "error" if failures else "updated"
        next_manifest = {
            "schemaVersion": MANIFEST_SCHEMA_VERSION,
            "projectId": project_id,
            "enabled": True,
            "status": status,
            "vectorStoreId": vector_store_id,
            "lastIndexedAt": _now_iso(),
            "error": f"No se pudieron indexar {len(failures)} documentos." if failures else None,
            "documents": next_documents,
            "deletedDocumentCount": deleted_count,
            "localExactReady": True,
        }
        self._write_manifest(project_id, next_manifest)
        return self._state_from_manifest(project_id, next_manifest, globally_enabled=True)

    def delete_index(self, project_id: str) -> RagIndexState:
        manifest = self._read_manifest(project_id)
        vector_store_id = manifest.get("vectorStoreId") if isinstance(manifest.get("vectorStoreId"), str) else None
        if vector_store_id:
            try:
                openai_service.delete_vector_store(vector_store_id)
            except Exception:
                pass
        self._delete_local_exact_index(project_id)
        next_manifest = self._default_manifest(project_id)
        self._write_manifest(project_id, next_manifest)
        return self._state_from_manifest(project_id, next_manifest, globally_enabled=True)

    def query_context(self, project_id: str, prompt: str, enabled: bool) -> dict[str, Any]:
        status = self.get_status(project_id, enabled)
        exact_matches = self.search_exact(project_id, prompt) if enabled and status.local_exact_ready else []
        return {
            "enabled": bool(enabled and status.status == "updated" and status.vector_store_id),
            "vectorStoreId": status.vector_store_id,
            "localExactReady": status.local_exact_ready,
            "exactMatches": exact_matches,
        }

    def search_exact(self, project_id: str, query: str, limit: int = MAX_EXACT_MATCHES) -> list[dict[str, Any]]:
        db_path = self._sqlite_path(project_id)
        if not db_path.exists():
            return []
        match_query = _to_fts_query(query)
        if not match_query:
            return []
        try:
            with sqlite3.connect(db_path) as connection:
                connection.row_factory = sqlite3.Row
                rows = connection.execute(
                    """
                    SELECT path, document_id, snippet(documents_fts, 2, '', '', ' ... ', 12) AS snippet
                    FROM documents_fts
                    WHERE documents_fts MATCH ?
                    ORDER BY rank
                    LIMIT ?
                    """,
                    (match_query, limit),
                ).fetchall()
        except sqlite3.Error:
            return []
        return [
            {
                "path": row["path"],
                "documentId": row["document_id"],
                "snippet": _trim_snippet(row["snippet"] or ""),
                "source": "local-exact",
            }
            for row in rows
        ]

    def _scan_documents(self, project_id: str, project_root: Path) -> list[dict[str, Any]]:
        root = project_root.resolve()
        documents: list[dict[str, Any]] = []
        for document_path in sorted(root.rglob(f"*{DOCUMENT_SUFFIX}")):
            if not document_path.is_file() or self._is_excluded(root, document_path):
                continue
            try:
                content = document_path.read_text(encoding="utf-8")
                stat = document_path.stat()
            except OSError:
                continue
            relative_path = document_path.relative_to(root).as_posix()
            content_bytes = content.encode("utf-8")
            documents.append({
                "path": relative_path,
                "documentId": get_document_id(project_id, relative_path),
                "sha256": hashlib.sha256(content_bytes).hexdigest(),
                "mtimeNs": stat.st_mtime_ns,
                "sizeBytes": stat.st_size,
                "updatedAt": datetime.fromtimestamp(stat.st_mtime, timezone.utc).isoformat(),
                "content": content,
            })
        return documents

    def _rebuild_local_exact_index(self, project_id: str, documents: list[dict[str, Any]]) -> None:
        db_path = self._sqlite_path(project_id)
        db_path.parent.mkdir(parents=True, exist_ok=True)
        with sqlite3.connect(db_path) as connection:
            connection.execute("DROP TABLE IF EXISTS documents_fts")
            connection.execute(
                "CREATE VIRTUAL TABLE documents_fts USING fts5(path, document_id UNINDEXED, content, tokenize='unicode61')"
            )
            connection.executemany(
                "INSERT INTO documents_fts(path, document_id, content) VALUES (?, ?, ?)",
                [(document["path"], document["documentId"], document["content"]) for document in documents],
            )
            connection.commit()

    def _delete_local_exact_index(self, project_id: str) -> None:
        db_path = self._sqlite_path(project_id)
        try:
            db_path.unlink()
        except FileNotFoundError:
            pass
        except OSError:
            pass

    def _delete_remote_record(self, vector_store_id: str | None, record: Any) -> None:
        if not vector_store_id or not isinstance(record, dict):
            return
        vector_store_file_id = record.get("vectorStoreFileId") if isinstance(record.get("vectorStoreFileId"), str) else None
        openai_file_id = record.get("openaiFileId") if isinstance(record.get("openaiFileId"), str) else None
        try:
            openai_service.delete_vector_store_file(vector_store_id, vector_store_file_id or openai_file_id)
        except Exception:
            pass
        if openai_file_id:
            try:
                openai_service.delete_file(openai_file_id)
            except Exception:
                pass

    def _manifest_record(self, document: dict[str, Any]) -> dict[str, Any]:
        return {
            "path": document["path"],
            "documentId": document["documentId"],
            "sha256": document["sha256"],
            "mtimeNs": document["mtimeNs"],
            "sizeBytes": document["sizeBytes"],
            "updatedAt": document["updatedAt"],
        }

    def _is_unchanged(self, previous: Any, document: dict[str, Any]) -> bool:
        return (
            isinstance(previous, dict)
            and previous.get("sha256") == document["sha256"]
            and previous.get("status") == "indexed"
            and isinstance(previous.get("openaiFileId"), str)
            and isinstance(previous.get("vectorStoreFileId"), str)
        )

    def _is_excluded(self, root: Path, path: Path) -> bool:
        try:
            relative_parts = path.relative_to(root).parts[:-1]
        except ValueError:
            return True
        return any(part in EXCLUDED_DIRS or part.startswith(".") for part in relative_parts)

    def _read_manifest(self, project_id: str) -> dict[str, Any]:
        return self._store(project_id).read(self._default_manifest(project_id))

    def _write_manifest(self, project_id: str, manifest: dict[str, Any]) -> None:
        self._store(project_id).write({**self._default_manifest(project_id), **manifest})

    def _state_from_manifest(self, project_id: str, manifest: dict[str, Any], globally_enabled: bool) -> RagIndexState:
        documents = manifest.get("documents") if isinstance(manifest.get("documents"), dict) else {}
        indexed = sum(1 for document in documents.values() if isinstance(document, dict) and document.get("status") == "indexed")
        failed = sum(1 for document in documents.values() if isinstance(document, dict) and document.get("status") == "error")
        status = manifest.get("status") if manifest.get("status") in {"not-indexed", "indexing", "updated", "error"} else "not-indexed"
        vector_store_id = manifest.get("vectorStoreId") if isinstance(manifest.get("vectorStoreId"), str) else None
        return RagIndexState(
            project_id=project_id,
            enabled=bool(globally_enabled and manifest.get("enabled", False)),
            status=status,
            vector_store_id=vector_store_id,
            last_indexed_at=manifest.get("lastIndexedAt") if isinstance(manifest.get("lastIndexedAt"), str) else None,
            error=manifest.get("error") if isinstance(manifest.get("error"), str) else None,
            document_count=len(documents),
            indexed_document_count=indexed,
            pending_document_count=max(0, len(documents) - indexed - failed),
            failed_document_count=failed,
            deleted_document_count=int(manifest.get("deletedDocumentCount") or 0),
            local_exact_ready=bool(manifest.get("localExactReady") and self._sqlite_path(project_id).exists()),
        )

    def _default_manifest(self, project_id: str) -> dict[str, Any]:
        return {
            "schemaVersion": MANIFEST_SCHEMA_VERSION,
            "projectId": project_id,
            "enabled": False,
            "status": "not-indexed",
            "vectorStoreId": None,
            "lastIndexedAt": None,
            "error": None,
            "documents": {},
            "deletedDocumentCount": 0,
            "localExactReady": False,
        }

    def _store(self, project_id: str) -> JsonFileStore:
        return JsonFileStore(f"ai-rag-manifests/{_safe_project_filename(project_id)}.json")

    def _sqlite_path(self, project_id: str) -> Path:
        return get_app_data_dir() / "ai-rag" / f"{_safe_project_filename(project_id)}.sqlite3"


def _safe_project_filename(project_id: str) -> str:
    safe = re.sub(r"[^A-Za-z0-9_.-]+", "_", project_id).strip("._")
    digest = hashlib.sha1(project_id.encode("utf-8")).hexdigest()[:10]
    return f"{safe or 'project'}-{digest}"


def _to_fts_query(query: str) -> str:
    terms = re.findall(r"[\wÀ-ÿ-]{2,}", query.lower(), flags=re.UNICODE)
    unique_terms: list[str] = []
    for term in terms:
        normalized = term.strip("-_")
        if normalized and normalized not in unique_terms:
            unique_terms.append(normalized)
        if len(unique_terms) >= 8:
            break
    return " OR ".join(f'"{term}"' for term in unique_terms)


def _trim_snippet(value: str) -> str:
    collapsed = re.sub(r"\s+", " ", value).strip()
    if len(collapsed) <= MAX_EXACT_SNIPPET_CHARS:
        return collapsed
    return f"{collapsed[:MAX_EXACT_SNIPPET_CHARS].rstrip()}..."


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


rag_service = RagService()
