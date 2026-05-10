import { requestJson } from "./client";
import type { CreateVersionResponse, VersionRecord } from "../../types/domain";

export async function getDocumentVersions(documentId: string): Promise<VersionRecord[]> {
  return requestJson<VersionRecord[]>(`/api/documents/${documentId}/versions`);
}

export async function createProjectVersion(projectId: string, documentId: string, title: string): Promise<CreateVersionResponse> {
  return requestJson<CreateVersionResponse>(`/api/projects/${projectId}/versions`, {
    method: "POST",
    body: JSON.stringify({ documentId, title }),
  });
}
