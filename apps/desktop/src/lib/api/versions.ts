import { requestJson } from "./client";
import type { CreateVersionResponse, VersionRecord } from "../../types/domain";

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

export async function restoreVersion(documentId: string, versionId: string): Promise<CreateVersionResponse> {
  return requestJson<CreateVersionResponse>(`/api/documents/${encodeURIComponent(documentId)}/versions/${encodeURIComponent(versionId)}/restore`, {
    method: "POST",
  });
}
