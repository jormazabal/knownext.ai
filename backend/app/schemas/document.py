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
    wordCount: int
    updatedAt: str
    baseFingerprint: DocumentFingerprint | None = None
    hasDraft: bool = False
    isDirty: bool = False
    diskChanged: bool = False
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
