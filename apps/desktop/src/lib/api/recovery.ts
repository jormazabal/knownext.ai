import { requestJson } from "./client";
import type { RestoreDraftResponse } from "../../types/domain";
import type { ArchiveRecoveryResult, RecoveryCopy, RecoveryCopyPayload, RecoveryInventory, RecoveryPreview } from "../../types/recovery";
import type {DocumentFingerprint,HandwrittenNoteContent} from "../../types/domain";

export type LocalEditSnapshot={documentId:string;markdown?:string;content?:HandwrittenNoteContent;baseFingerprint?:DocumentFingerprint|null};
export type LocalEditProof={status:"verified";copy:RecoveryCopy;checkedAt:string}|{status:"absent";checkedAt:string};
export function createLocalEditId(){const bytes=crypto.getRandomValues(new Uint8Array(16));return `recovery-${Array.from(bytes,b=>b.toString(16).padStart(2,"0")).join("")}`;}
export function preserveLocalEdit(id:string,payload:LocalEditSnapshot){return requestJson<LocalEditProof>(`/api/recovery/local-edits/${encodeURIComponent(id)}`,{method:"POST",body:JSON.stringify(payload)});}
export function reviewLocalEdit(id:string,payload:LocalEditSnapshot){return requestJson<LocalEditProof>(`/api/recovery/local-edits/${encodeURIComponent(id)}/review`,{method:"POST",body:JSON.stringify(payload)});}

export function getRecoveryInventory(archived = false) {
  return requestJson<RecoveryInventory>(`/api/recovery/${archived ? "archives" : "drafts"}`);
}

export function recoverAsCopy(copy: RecoveryCopy, payload: RecoveryCopyPayload) {
  return requestJson<RestoreDraftResponse>(`/api/recovery/drafts/${encodeURIComponent(copy.key)}/copy`, {
    method: "POST", body: JSON.stringify(payload),
  });
}

export function archiveRecoveryCopy(copy: RecoveryCopy) {
  return requestJson<ArchiveRecoveryResult>(`/api/recovery/drafts/${encodeURIComponent(copy.key)}/archive`, {
    method: "POST", body: JSON.stringify({ fingerprint: copy.fingerprint, source: copy.source ?? "active" }),
  });
}

export function previewRecoveryCopy(copy: RecoveryCopy) {
  return requestJson<RecoveryPreview>(`/api/recovery/drafts/${encodeURIComponent(copy.key)}/preview`, {
    method: "POST", body: JSON.stringify({ fingerprint: copy.fingerprint, source: copy.source ?? "active" }),
  });
}
