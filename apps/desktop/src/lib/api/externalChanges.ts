import { requestJson } from "./client";
import type { ExternalChangeImportRequest, ExternalChangeImportResult, ExternalChangeSet } from "../../types/domain";

export async function getExternalChanges(projectId: string): Promise<ExternalChangeSet> {
  return requestJson<ExternalChangeSet>(`/api/projects/${projectId}/external-changes`);
}

export async function scanExternalChanges(projectId: string): Promise<ExternalChangeSet> {
  return requestJson<ExternalChangeSet>(`/api/projects/${projectId}/external-changes/scan`, { method: "POST" });
}

export async function importExternalChanges(projectId: string, payload: ExternalChangeImportRequest): Promise<ExternalChangeImportResult> {
  return requestJson<ExternalChangeImportResult>(`/api/projects/${projectId}/external-changes/import`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
