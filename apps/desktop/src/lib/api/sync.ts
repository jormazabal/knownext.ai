import { requestJson } from "./client";
import type {
  OpenDocumentSyncState,
  ProjectSyncStatus,
  SyncMode,
} from "../../types/domain";

type SyncScanPayload = {
  openDocuments: OpenDocumentSyncState[];
  allowAutoApply: boolean;
};

export async function getProjectSyncStatus(projectId: string): Promise<ProjectSyncStatus> {
  return requestJson<ProjectSyncStatus>(`/api/projects/${projectId}/sync/status`);
}

export async function scanProjectSync(projectId: string, payload: SyncScanPayload): Promise<ProjectSyncStatus> {
  return requestJson<ProjectSyncStatus>(`/api/projects/${projectId}/sync/scan`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function autoRunProjectSync(projectId: string, payload: SyncScanPayload): Promise<ProjectSyncStatus> {
  return requestJson<ProjectSyncStatus>(`/api/projects/${projectId}/sync/auto-run`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function enableProjectHistory(projectId: string): Promise<{ projectId: string; message: string; versionHash?: string | null }> {
  return requestJson(`/api/projects/${projectId}/history/enable`, { method: "POST" });
}

export async function changeProjectSyncMode(projectId: string, syncMode: SyncMode): Promise<ProjectSyncStatus> {
  return requestJson<ProjectSyncStatus>(`/api/projects/${projectId}/sync-mode`, {
    method: "PUT",
    body: JSON.stringify({ syncMode }),
  });
}

export async function connectProjectGithub(
  projectId: string,
  payload: {
    owner: string;
    repo: string;
    defaultRef?: string | null;
    rootPath?: string;
    syncMode: "manual-github" | "auto-github";
  },
): Promise<ProjectSyncStatus> {
  return requestJson<ProjectSyncStatus>(`/api/projects/${projectId}/github/connect`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function verifyProjectGithubConnection(projectId: string): Promise<ProjectSyncStatus> {
  return requestJson<ProjectSyncStatus>(`/api/projects/${projectId}/github/verify-connection`, { method: "POST" });
}

export async function publishProjectGithub(
  projectId: string,
  payload: {
    owner: string;
    repo: string;
    visibility: "private" | "public";
    description?: string | null;
    syncMode: "manual-github" | "auto-github";
  },
): Promise<ProjectSyncStatus> {
  return requestJson<ProjectSyncStatus>(`/api/projects/${projectId}/github/publish`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function resolveProjectSyncConflict(
  projectId: string,
  conflictId: string,
  resolution: "keep-local" | "take-remote" | "save-local-copy-and-take-remote" | "manual-resolved",
): Promise<ProjectSyncStatus> {
  return requestJson<ProjectSyncStatus>(`/api/projects/${projectId}/sync/conflicts/${encodeURIComponent(conflictId)}/resolve`, {
    method: "POST",
    body: JSON.stringify({ resolution }),
  });
}
