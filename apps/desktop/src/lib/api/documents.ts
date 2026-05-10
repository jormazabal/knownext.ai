import { requestJson } from "./client";
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
  return requestJson<DocumentRecord>(`/api/documents/${encodeURIComponent(documentId)}`);
}

export async function saveDocument(documentId: string, payload: SaveDocumentPayload): Promise<DocumentRecord> {
  return requestJson<DocumentRecord>(`/api/documents/${encodeURIComponent(documentId)}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function saveDocumentDraft(documentId: string, payload: SaveDraftPayload): Promise<DraftResponse> {
  return requestJson<DraftResponse>(`/api/documents/${encodeURIComponent(documentId)}/draft`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function discardDocumentDraft(documentId: string): Promise<void> {
  await requestJson<void>(`/api/documents/${encodeURIComponent(documentId)}/draft`, {
    method: "DELETE",
  });
}

export async function getDocumentsSyncStatus(documents: SyncStatusDocument[]): Promise<SyncStatusResponse> {
  return requestJson<SyncStatusResponse>("/api/documents/sync-status", {
    method: "POST",
    body: JSON.stringify({ documents }),
  });
}

export async function listOrphanDrafts(): Promise<OrphanDraft[]> {
  return requestJson<OrphanDraft[]>("/api/drafts/orphans");
}

export async function restoreOrphanDraft(draftKey: string): Promise<RestoreDraftResponse> {
  return requestJson<RestoreDraftResponse>(`/api/drafts/${encodeURIComponent(draftKey)}/restore`, {
    method: "POST",
  });
}

export async function discardOrphanDraft(draftKey: string): Promise<void> {
  await requestJson<void>(`/api/drafts/${encodeURIComponent(draftKey)}`, {
    method: "DELETE",
  });
}
