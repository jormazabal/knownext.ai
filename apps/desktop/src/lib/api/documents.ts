import { documents } from "../mockData";
import { isBackendEnabled, mockDelay, requestJson } from "./client";
import type { DocumentRecord, DraftResponse, SaveDocumentPayload, SaveDraftPayload } from "../../types/domain";

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
