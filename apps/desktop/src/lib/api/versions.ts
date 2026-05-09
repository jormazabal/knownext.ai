import { versions } from "../mockData";
import { isBackendEnabled, mockDelay, requestJson } from "./client";
import type { VersionRecord } from "../../types/domain";

export async function getDocumentVersions(documentId: string): Promise<VersionRecord[]> {
  if (isBackendEnabled()) {
    try {
      return await requestJson<VersionRecord[]>(`/api/documents/${documentId}/versions`);
    } catch {
      return mockDelay(versions);
    }
  }
  return mockDelay(versions);
}
