import { requestJson } from "./client";
import type { CreateVersionResponse, DocumentFingerprint, RestoreVersionResponse, VersionRecord } from "../../types/domain";
import type {DocumentHistorySnapshot,MilestoneResponse} from "../../types/history";

export function getDocumentHistorySnapshot(documentId:string):Promise<DocumentHistorySnapshot>{
  return requestJson(`/api/documents/${encodeURIComponent(documentId)}/history`);
}
export function saveVersionMilestone(documentId:string,versionId:string,title:string,revision:string|null):Promise<MilestoneResponse>{
  return requestJson(`/api/documents/${encodeURIComponent(documentId)}/versions/${encodeURIComponent(versionId)}/milestone`,{method:"PUT",body:JSON.stringify({title,revision})});
}
export function removeVersionMilestone(documentId:string,versionId:string,revision:string|null):Promise<MilestoneResponse>{
  return requestJson(`/api/documents/${encodeURIComponent(documentId)}/versions/${encodeURIComponent(versionId)}/milestone`,{method:"DELETE",body:JSON.stringify({revision})});
}

export async function getDocumentVersions(documentId: string): Promise<VersionRecord[]> {
  return requestJson<VersionRecord[]>(`/api/documents/${encodeURIComponent(documentId)}/versions`);
}

export async function createProjectVersion(projectId: string, documentId: string, title: string): Promise<CreateVersionResponse> {
  return requestJson<CreateVersionResponse>(`/api/projects/${projectId}/versions`, {
    method: "POST",
    body: JSON.stringify({ documentId, title }),
  });
}

export async function getVersionContent(documentId: string, versionId: string): Promise<{ documentId: string; versionId: string; markdown: string }> {
  return requestJson(`/api/documents/${encodeURIComponent(documentId)}/versions/${encodeURIComponent(versionId)}/content`);
}

export async function restoreVersion(documentId: string, versionId: string, baseFingerprint: DocumentFingerprint | null, expectedDraftWriteRevision:string|null=null): Promise<RestoreVersionResponse> {
  return requestJson<RestoreVersionResponse>(`/api/documents/${encodeURIComponent(documentId)}/versions/${encodeURIComponent(versionId)}/restore`, {
    method: "POST",
    body: JSON.stringify({baseFingerprint,expectedDraftWriteRevision}),
  });
}
