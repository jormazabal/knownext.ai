import { versions } from "../mockData";
import { isBackendEnabled, mockDelay, requestJson } from "./client";
import type { CreateVersionResponse, VersionRecord } from "../../types/domain";

export async function getDocumentVersions(documentId: string): Promise<VersionRecord[]> {
  if (isBackendEnabled()) {
    return requestJson<VersionRecord[]>(`/api/documents/${documentId}/versions`);
  }
  return mockDelay(versions);
}

export async function createProjectVersion(projectId: string, documentId: string, title: string): Promise<CreateVersionResponse> {
  if (isBackendEnabled()) {
    return requestJson<CreateVersionResponse>(`/api/projects/${projectId}/versions`, {
      method: "POST",
      body: JSON.stringify({ documentId, title }),
    });
  }
  return mockDelay({ version: { ...versions[0], title, relativeTime: "ahora" } });
}
