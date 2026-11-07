import {requestJson} from "./client";
import type {CloudSyncCapabilities, CloudSyncProvider, CloudSyncReceipt, CloudSyncReview, CloudSyncStatus} from "../../types/cloudSync";

const projectPath = (projectId: string) => `/api/projects/${encodeURIComponent(projectId)}/cloud-sync`;

export function getCloudSyncCapabilities() {
  return requestJson<CloudSyncCapabilities>("/api/cloud-sync/capabilities");
}

export function getCloudSyncStatus(projectId: string) {
  return requestJson<CloudSyncStatus>(projectPath(projectId));
}

export function reviewCloudSync(projectId: string, provider: CloudSyncProvider) {
  return requestJson<CloudSyncReview>(`${projectPath(projectId)}/review`, {
    method: "POST", body: JSON.stringify({provider}),
  });
}

export function applyCloudSync(projectId: string, review: Pick<CloudSyncReview, "id" | "revision">) {
  return requestJson<CloudSyncReceipt>(`${projectPath(projectId)}/apply`, {
    method: "POST", body: JSON.stringify({id: review.id, revision: review.revision}),
  });
}

export function cancelCloudSync(projectId: string, review: Pick<CloudSyncReview, "id" | "revision">) {
  return requestJson<CloudSyncReceipt>(`${projectPath(projectId)}/cancel`, {
    method: "POST", body: JSON.stringify({id: review.id, revision: review.revision}),
  });
}
