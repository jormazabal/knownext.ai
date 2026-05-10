import { documents } from "../mockData";
import { isBackendEnabled, mockDelay, requestJson } from "./client";
import type {
  DocumentRecord,
  DraftResponse,
  OrphanDraft,
  RestoreDraftResponse,
  SaveDocumentPayload,
  SaveDraftPayload,
  SyncStatusDocument,
  SyncStatusResponse,
} from "../../types/domain";

export async function getDocument(documentId: string): Promise<DocumentRecord> {
  if (isBackendEnabled()) {
    return requestJson<DocumentRecord>(`/api/documents/${encodeURIComponent(documentId)}`);
  }
  return mockDelay(documents[documentId] ?? documents["meeting-minutes"]);
}

export async function saveDocument(documentId: string, payload: SaveDocumentPayload): Promise<DocumentRecord> {
  if (isBackendEnabled()) {
    return requestJson<DocumentRecord>(`/api/documents/${encodeURIComponent(documentId)}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  }

  const previous = documents[documentId] ?? documents["meeting-minutes"];
  return mockDelay({
    ...previous,
    markdown: payload.markdown,
    wordCount: payload.markdown.trim().split(/\s+/).filter(Boolean).length,
    updatedAt: new Date().toISOString(),
  });
}

export async function saveDocumentDraft(documentId: string, payload: SaveDraftPayload): Promise<DraftResponse> {
  if (isBackendEnabled()) {
    return requestJson<DraftResponse>(`/api/documents/${encodeURIComponent(documentId)}/draft`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  }

  return mockDelay({
    documentId,
    draftUpdatedAt: new Date().toISOString(),
    isDirty: true,
  });
}

export async function discardDocumentDraft(documentId: string): Promise<void> {
  if (isBackendEnabled()) {
    await requestJson<void>(`/api/documents/${encodeURIComponent(documentId)}/draft`, {
      method: "DELETE",
    });
  }
}

export async function getDocumentsSyncStatus(documents: SyncStatusDocument[]): Promise<SyncStatusResponse> {
  if (isBackendEnabled()) {
    return requestJson<SyncStatusResponse>("/api/documents/sync-status", {
      method: "POST",
      body: JSON.stringify({ documents }),
    });
  }

  return mockDelay({
    documents: documents.map((document) => ({
      documentId: document.documentId,
      exists: true,
      currentFingerprint: document.baseFingerprint,
      diskChanged: false,
      hasDraft: false,
      orphaned: false,
      conflictStatus: "none" as const,
    })),
  });
}

export async function listOrphanDrafts(): Promise<OrphanDraft[]> {
  if (isBackendEnabled()) {
    return requestJson<OrphanDraft[]>("/api/drafts/orphans");
  }

  return mockDelay([]);
}

export async function restoreOrphanDraft(draftKey: string): Promise<RestoreDraftResponse> {
  if (isBackendEnabled()) {
    return requestJson<RestoreDraftResponse>(`/api/drafts/${encodeURIComponent(draftKey)}/restore`, {
      method: "POST",
    });
  }

  throw new Error("La recuperación de borradores requiere la API local.");
}

export async function discardOrphanDraft(draftKey: string): Promise<void> {
  if (isBackendEnabled()) {
    await requestJson<void>(`/api/drafts/${encodeURIComponent(draftKey)}`, {
      method: "DELETE",
    });
  }
}
