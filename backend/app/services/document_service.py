import hashlib
from datetime import datetime, timezone
from pathlib import Path

from fastapi import HTTPException

from app.schemas.document import Document, DocumentFingerprint, DraftResponse
from app.services.draft_service import draft_service
from app.services.filesystem_service import decode_document_id
from app.services.filesystem_service import filesystem_service
from app.services.mock_store import mock_store
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


def _fingerprints_match(first: DocumentFingerprint | None, second: DocumentFingerprint | None) -> bool:
    if first is None or second is None:
        return False
    return first.model_dump() == second.model_dump()


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
                wordCount=len([word for word in markdown.split() if word.strip()]),
                updatedAt=_updated_at(document_path),
                baseFingerprint=fingerprint,
            )
            return self._apply_draft(document)

        document = mock_store.documents.get(document_id)
        if document is None:
            raise HTTPException(status_code=404, detail="Document not found")
        return self._apply_draft(Document(**document))

    def save_document(self, document_id: str, markdown: str, base_fingerprint: DocumentFingerprint | None = None, force: bool = False) -> Document:
        if document_id.startswith("fs_"):
            project_id, relative_path = decode_document_id(document_id)
            project_root = project_service._get_project_root(project_id)
            _, document_path = filesystem_service.read_document(project_id, project_root, relative_path)
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
                wordCount=len([word for word in markdown.split() if word.strip()]),
                updatedAt=_updated_at(document_path),
                baseFingerprint=fingerprint,
            )

        if document_id not in mock_store.documents:
            raise HTTPException(status_code=404, detail="Document not found")
        draft_service.delete_draft(document_id)
        return Document(**mock_store.save_document(document_id, markdown))

    def save_draft(self, document_id: str, markdown: str, base_fingerprint: DocumentFingerprint | None = None) -> DraftResponse:
        document = self.get_document_without_draft(document_id)
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
                wordCount=len([word for word in markdown.split() if word.strip()]),
                updatedAt=_updated_at(document_path),
                baseFingerprint=fingerprint,
            )

        document = mock_store.documents.get(document_id)
        if document is None:
            raise HTTPException(status_code=404, detail="Document not found")
        return Document(**document)

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
                "wordCount": len([word for word in markdown.split() if word.strip()]),
                "baseFingerprint": base_fingerprint or document.baseFingerprint,
                "hasDraft": True,
                "isDirty": True,
                "diskChanged": disk_changed,
                "conflictStatus": "disk-changed" if disk_changed else "draft",
                "draftUpdatedAt": draft["draftUpdatedAt"],
            }
        )


document_service = DocumentService()
