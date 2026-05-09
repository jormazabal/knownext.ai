import { versions } from "../mockData";
import { mockDelay, requestJson } from "./client";
import type { VersionRecord } from "../../types/domain";

const USE_BACKEND = import.meta.env.VITE_USE_BACKEND === "true";

export async function getDocumentVersions(documentId: string): Promise<VersionRecord[]> {
  if (USE_BACKEND) {
    try {
      return await requestJson<VersionRecord[]>(`/api/documents/${documentId}/versions`);
    } catch {
      return mockDelay(versions);
    }
  }
  return mockDelay(versions);
}
