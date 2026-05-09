import { documents } from "../mockData";
import { mockDelay, requestJson } from "./client";
import type { DocumentRecord, DraftResponse, SaveDocumentPayload, SaveDraftPayload } from "../../types/domain";

const USE_BACKEND = import.meta.env.VITE_USE_BACKEND !== "false";

export async function getDocument(documentId: string): Promise<DocumentRecord> {
  if (USE_BACKEND) {
    return requestJson<DocumentRecord>(`/api/documents/${encodeURIComponent(documentId)}`);
  }
  return mockDelay(documents[documentId] ?? documents["meeting-minutes"]);
}

export async function saveDocument(documentId: string, payload: SaveDocumentPayload): Promise<DocumentRecord> {
  if (USE_BACKEND) {
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
  if (USE_BACKEND) {
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
  if (USE_BACKEND) {
    await requestJson<void>(`/api/documents/${encodeURIComponent(documentId)}/draft`, {
      method: "DELETE",
    });
  }
}
