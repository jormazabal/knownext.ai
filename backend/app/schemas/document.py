from pydantic import BaseModel


class DocumentFingerprint(BaseModel):
    mtimeNs: int | None = None
    size: int | None = None
    sha256: str | None = None


class Document(BaseModel):
    id: str
    name: str
    path: str
    projectId: str
    markdown: str
    diskMarkdown: str | None = None
    wordCount: int
    updatedAt: str
    baseFingerprint: DocumentFingerprint | None = None
    hasDraft: bool = False
    isDirty: bool = False
    diskChanged: bool = False
    orphaned: bool = False
    conflictStatus: str = "none"
    draftUpdatedAt: str | None = None


class SaveDocumentRequest(BaseModel):
    markdown: str
    baseFingerprint: DocumentFingerprint | None = None
    force: bool = False


class SaveDraftRequest(BaseModel):
    markdown: str
    baseFingerprint: DocumentFingerprint | None = None


class DraftResponse(BaseModel):
    documentId: str
    draftUpdatedAt: str
    isDirty: bool = True


class SyncStatusDocument(BaseModel):
    documentId: str
    baseFingerprint: DocumentFingerprint | None = None


class SyncStatusRequest(BaseModel):
    documents: list[SyncStatusDocument]


class DocumentSyncStatus(BaseModel):
    documentId: str
    exists: bool
    currentFingerprint: DocumentFingerprint | None = None
    diskChanged: bool = False
    hasDraft: bool = False
    orphaned: bool = False
    conflictStatus: str = "none"


class SyncStatusResponse(BaseModel):
    documents: list[DocumentSyncStatus]


class OrphanDraft(BaseModel):
    draftKey: str
    documentId: str
    projectId: str
    path: str
    name: str
    wordCount: int
    createdAt: str
    draftUpdatedAt: str
    recoverable: bool
    reason: str | None = None


class RestoreDraftResponse(BaseModel):
    document: Document
