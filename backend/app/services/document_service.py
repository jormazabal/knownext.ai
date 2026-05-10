import hashlib
from datetime import datetime, timezone
from pathlib import Path

from fastapi import HTTPException

from app.schemas.document import (
    Document,
    DocumentFingerprint,
    DocumentSyncStatus,
    DraftResponse,
    OrphanDraft,
    RestoreDraftResponse,
    SyncStatusDocument,
    SyncStatusResponse,
)
from app.services.draft_service import draft_service
from app.services.filesystem_service import decode_document_id
from app.services.filesystem_service import filesystem_service
from app.services.project_service import project_service


def _updated_at(document_path) -> str:
    return datetime.fromtimestamp(document_path.stat().st_mtime, tz=timezone.utc).isoformat()


def _fingerprint(document_path: Path) -> DocumentFingerprint:
    stat = document_path.stat()
    digest = hashlib.sha256()
    with document_path.open("rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(chunk)
    return DocumentFingerprint(mtimeNs=stat.st_mtime_ns, size=stat.st_size, sha256=digest.hexdigest())


def _fingerprint_fast(document_path: Path, base_fingerprint: DocumentFingerprint | None = None) -> DocumentFingerprint:
    stat = document_path.stat()
    if (
        base_fingerprint is not None
        and base_fingerprint.mtimeNs == stat.st_mtime_ns
        and base_fingerprint.size == stat.st_size
        and base_fingerprint.sha256
    ):
        return base_fingerprint
    return _fingerprint(document_path)


def _fingerprints_match(first: DocumentFingerprint | None, second: DocumentFingerprint | None) -> bool:
    if first is None or second is None:
        return False
    if first.sha256 and second.sha256:
        return first.sha256 == second.sha256
    return first.model_dump() == second.model_dump()


def _word_count(markdown: str) -> int:
    return len([word for word in markdown.split() if word.strip()])


def _resolve_project_child(root: Path, relative_path: str) -> Path:
    root = root.resolve()
    candidate = (root / relative_path).resolve()
    try:
        candidate.relative_to(root)
    except ValueError:
        raise HTTPException(status_code=400, detail="Draft path escapes project folder") from None
    return candidate


class DocumentService:
    def get_document(self, document_id: str) -> Document:
        if document_id.startswith("fs_"):
            project_id, relative_path = decode_document_id(document_id)
            markdown, document_path = filesystem_service.read_document(project_id, project_service._get_project_root(project_id), relative_path)
            fingerprint = _fingerprint(document_path)
            document = Document(
                id=document_id,
                name=document_path.name,
                path=relative_path,
                projectId=project_id,
                markdown=markdown,
                wordCount=_word_count(markdown),
                updatedAt=_updated_at(document_path),
                baseFingerprint=fingerprint,
            )
            return self._apply_draft(document)

        raise HTTPException(status_code=404, detail="Document not found")

    def save_document(self, document_id: str, markdown: str, base_fingerprint: DocumentFingerprint | None = None, force: bool = False) -> Document:
        if document_id.startswith("fs_"):
            project_id, relative_path = decode_document_id(document_id)
            project_root = project_service._get_project_root(project_id)
            try:
                _, document_path = filesystem_service.read_document(project_id, project_root, relative_path)
            except HTTPException as error:
                if error.status_code != 404 or not force or draft_service.get_draft(document_id) is None:
                    raise
                document_path = _resolve_project_child(project_root, relative_path)
                document_path.parent.mkdir(parents=True, exist_ok=True)
                document_path.write_text(markdown, encoding="utf-8")
                fingerprint = _fingerprint(document_path)
                draft_service.delete_draft(document_id)
                return Document(
                    id=document_id,
                    name=document_path.name,
                    path=relative_path,
                    projectId=project_id,
                    markdown=markdown,
                    wordCount=_word_count(markdown),
                    updatedAt=_updated_at(document_path),
                    baseFingerprint=fingerprint,
                )

            current_fingerprint = _fingerprint(document_path)
            expected_fingerprint = base_fingerprint
            if expected_fingerprint is None:
                draft = draft_service.get_draft(document_id)
                expected_fingerprint = DocumentFingerprint(**draft["baseFingerprint"]) if draft and draft.get("baseFingerprint") else None
            if expected_fingerprint is not None and not force and not _fingerprints_match(expected_fingerprint, current_fingerprint):
                raise HTTPException(
                    status_code=409,
                    detail={
                        "code": "document_changed_on_disk",
                        "message": "Document changed on disk after it was opened.",
                    },
                )
            document_path = filesystem_service.save_document(project_root, relative_path, markdown)
            fingerprint = _fingerprint(document_path)
            draft_service.delete_draft(document_id)
            return Document(
                id=document_id,
                name=document_path.name,
                path=relative_path,
                projectId=project_id,
                markdown=markdown,
                wordCount=_word_count(markdown),
                updatedAt=_updated_at(document_path),
                baseFingerprint=fingerprint,
            )

        raise HTTPException(status_code=404, detail="Document not found")

    def save_draft(self, document_id: str, markdown: str, base_fingerprint: DocumentFingerprint | None = None) -> DraftResponse:
        try:
            document = self.get_document_without_draft(document_id)
        except HTTPException as error:
            draft = draft_service.get_draft(document_id)
            if error.status_code != 404 or draft is None:
                raise
            document = Document(
                id=draft["documentId"],
                name=draft["name"],
                path=draft["path"],
                projectId=draft["projectId"],
                markdown=draft["markdown"],
                wordCount=_word_count(draft["markdown"]),
                updatedAt=draft["draftUpdatedAt"],
                baseFingerprint=DocumentFingerprint(**draft["baseFingerprint"]) if draft.get("baseFingerprint") else None,
                hasDraft=True,
                isDirty=True,
                orphaned=True,
                conflictStatus="orphaned",
                draftUpdatedAt=draft["draftUpdatedAt"],
            )
        draft = draft_service.save_draft(
            document_id=document.id,
            project_id=document.projectId,
            path=document.path,
            name=document.name,
            markdown=markdown,
            base_fingerprint=base_fingerprint or document.baseFingerprint,
        )
        return DraftResponse(documentId=document_id, draftUpdatedAt=draft["draftUpdatedAt"])

    def discard_draft(self, document_id: str) -> None:
        draft_service.delete_draft(document_id)

    def get_document_without_draft(self, document_id: str) -> Document:
        if document_id.startswith("fs_"):
            project_id, relative_path = decode_document_id(document_id)
            markdown, document_path = filesystem_service.read_document(project_id, project_service._get_project_root(project_id), relative_path)
            fingerprint = _fingerprint(document_path)
            return Document(
                id=document_id,
                name=document_path.name,
                path=relative_path,
                projectId=project_id,
                markdown=markdown,
                wordCount=_word_count(markdown),
                updatedAt=_updated_at(document_path),
                baseFingerprint=fingerprint,
            )

        raise HTTPException(status_code=404, detail="Document not found")

    def _apply_draft(self, document: Document) -> Document:
        draft = draft_service.get_draft(document.id)
        if draft is None:
            return document

        base_fingerprint = DocumentFingerprint(**draft["baseFingerprint"]) if draft.get("baseFingerprint") else None
        disk_changed = document.baseFingerprint is not None and base_fingerprint is not None and not _fingerprints_match(base_fingerprint, document.baseFingerprint)
        markdown = draft["markdown"]
        return document.model_copy(
            update={
                "markdown": markdown,
                "diskMarkdown": document.markdown,
                "wordCount": _word_count(markdown),
                "baseFingerprint": base_fingerprint or document.baseFingerprint,
                "hasDraft": True,
                "isDirty": True,
                "diskChanged": disk_changed,
                "conflictStatus": "disk-changed" if disk_changed else "draft",
                "draftUpdatedAt": draft["draftUpdatedAt"],
            }
        )

    def get_sync_status(self, documents: list[SyncStatusDocument]) -> SyncStatusResponse:
        statuses: list[DocumentSyncStatus] = []
        for document in documents:
            statuses.append(self._get_document_sync_status(document.documentId, document.baseFingerprint))
        return SyncStatusResponse(documents=statuses)

    def list_orphan_drafts(self) -> list[OrphanDraft]:
        orphan_drafts: list[OrphanDraft] = []
        for draft in draft_service.list_drafts():
            root, reason = self._project_root_for_draft(draft)
            if root is None:
                orphan_drafts.append(self._orphan_draft(draft, recoverable=False, reason=reason))
                continue

            document_path = _resolve_project_child(root, draft["path"])
            if document_path.exists():
                continue

            orphan_drafts.append(self._orphan_draft(draft, recoverable=True, reason=None))
        return orphan_drafts

    def restore_orphan_draft(self, draft_key: str) -> RestoreDraftResponse:
        draft = draft_service.get_draft_by_key(draft_key)
        if draft is None:
            raise HTTPException(status_code=404, detail="Draft not found")

        root, reason = self._project_root_for_draft(draft)
        if root is None:
            raise HTTPException(status_code=409, detail=reason or "Draft project is not available")

        document_path = _resolve_project_child(root, draft["path"])
        if document_path.exists():
            raise HTTPException(status_code=409, detail="Document already exists")

        document_path.parent.mkdir(parents=True, exist_ok=True)
        document_path.write_text(draft["markdown"], encoding="utf-8")
        draft_service.delete_draft_by_key(draft_key)

        return RestoreDraftResponse(document=self.get_document_without_draft(draft["documentId"]))

    def discard_orphan_draft(self, draft_key: str) -> None:
        if not draft_service.delete_draft_by_key(draft_key):
            raise HTTPException(status_code=404, detail="Draft not found")

    def _get_document_sync_status(self, document_id: str, base_fingerprint: DocumentFingerprint | None) -> DocumentSyncStatus:
        draft = draft_service.get_draft(document_id)

        if not document_id.startswith("fs_"):
            return DocumentSyncStatus(
                documentId=document_id,
                exists=False,
                hasDraft=draft is not None,
                orphaned=draft is not None,
                conflictStatus="orphaned" if draft is not None else "missing",
            )

        try:
            project_id, relative_path = decode_document_id(document_id)
            project_root = project_service._get_project_root(project_id)
            _, document_path = filesystem_service.read_document(project_id, project_root, relative_path)
        except HTTPException:
            return DocumentSyncStatus(
                documentId=document_id,
                exists=False,
                hasDraft=draft is not None,
                orphaned=draft is not None,
                conflictStatus="orphaned" if draft is not None else "missing",
            )

        current_fingerprint = _fingerprint_fast(document_path, base_fingerprint)
        disk_changed = base_fingerprint is not None and not _fingerprints_match(base_fingerprint, current_fingerprint)
        return DocumentSyncStatus(
            documentId=document_id,
            exists=True,
            currentFingerprint=current_fingerprint,
            diskChanged=disk_changed,
            hasDraft=draft is not None,
            conflictStatus="disk-changed" if disk_changed else "draft" if draft is not None else "none",
        )

    def _project_root_for_draft(self, draft: dict) -> tuple[Path | None, str | None]:
        try:
            registry = project_service._read_registry()
            project = project_service._find_project(registry, draft["projectId"])
        except HTTPException:
            return None, "Project not found"

        root = Path(project["folderPath"])
        if not root.exists() or not root.is_dir():
            return None, "Project folder not found"
        return root, None

    def _orphan_draft(self, draft: dict, recoverable: bool, reason: str | None) -> OrphanDraft:
        return OrphanDraft(
            draftKey=draft["draftKey"],
            documentId=draft["documentId"],
            projectId=draft["projectId"],
            path=draft["path"],
            name=draft["name"],
            wordCount=_word_count(draft["markdown"]),
            createdAt=draft["createdAt"],
            draftUpdatedAt=draft["draftUpdatedAt"],
            recoverable=recoverable,
            reason=reason,
        )


document_service = DocumentService()
