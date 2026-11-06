import { requestBinary, requestJson } from "./client";
import type {
  DocumentRecord,
  DraftResponse,
  ExportDocumentPayload,
  ExportDocumentResponse,
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

export function loadDocumentDiskVersion(documentId: string, expectedDraftWriteRevision:string|null=null): Promise<DocumentRecord> {
  return requestJson(`/api/documents/${encodeURIComponent(documentId)}/draft/discard-and-read`, {method:"POST",body:JSON.stringify({expectedDraftWriteRevision})});
}

export async function saveDocument(documentId: string, payload: SaveDocumentPayload): Promise<DocumentRecord> {
  return requestJson<DocumentRecord>(`/api/documents/${encodeURIComponent(documentId)}`, {
    method: "PUT",
    body: JSON.stringify({...payload,expectedDraftWriteRevision:payload.expectedDraftWriteRevision??null}),
  });
}

export async function saveDocumentDraft(documentId: string, payload: SaveDraftPayload): Promise<DraftResponse> {
  return requestJson<DraftResponse>(`/api/documents/${encodeURIComponent(documentId)}/draft`, {
    method: "PUT",
    body: JSON.stringify({...payload,expectedDraftWriteRevision:payload.expectedDraftWriteRevision??null}),
  });
}

export async function discardDocumentDraft(documentId: string, expectedDraftWriteRevision:string|null=null): Promise<void> {
  await requestJson<void>(`/api/documents/${encodeURIComponent(documentId)}/draft`, {
    method: "DELETE",
    body:JSON.stringify({expectedDraftWriteRevision}),
  });
}

export async function exportDocument(documentId: string, payload: ExportDocumentPayload): Promise<ExportDocumentResponse> {
  return requestJson<ExportDocumentResponse>(`/api/documents/${encodeURIComponent(documentId)}/export`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function exportDocumentContent(documentId: string, payload: Omit<ExportDocumentPayload, "outputPath">): Promise<Blob> {
  return requestBinary(`/api/documents/${encodeURIComponent(documentId)}/export/content`, {
    method: "POST",
    body: JSON.stringify(payload),
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
export type OrphanDraftInventory={schemaVersion:1;items:OrphanDraft[];limited:boolean;warnings:string[];queriedAt:string};
export function getOrphanDraftInventory(){return requestJson<OrphanDraftInventory>("/api/recovery/orphans");}
type OrphanReview=Pick<OrphanDraft,"documentId"|"fingerprint"|"locationRevision">;
function orphanReviewBody(review:OrphanReview){return JSON.stringify({documentId:review.documentId,expectedFingerprint:review.fingerprint??null,locationRevision:review.locationRevision??null});}

export async function restoreOrphanDraft(draftKey: string,review:OrphanReview): Promise<RestoreDraftResponse> {
  return requestJson<RestoreDraftResponse>(`/api/drafts/${encodeURIComponent(draftKey)}/restore`, {
    method: "POST",body:orphanReviewBody(review),
  });
}

export async function discardOrphanDraft(draftKey: string,review:OrphanReview): Promise<void> {
  await requestJson<void>(`/api/drafts/${encodeURIComponent(draftKey)}`, {
    method: "DELETE",body:orphanReviewBody(review),
  });
}
