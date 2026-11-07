import { requestJson } from "./client";
import type { TrashSnapshot, TrashReview,TrashRestoreResult,TrashRestoreProof } from "../../types/trash";

export function getProjectTrash(projectId: string) {
  return requestJson<TrashSnapshot>(`/api/projects/${encodeURIComponent(projectId)}/trash`);
}
export function reviewProjectTrash(projectId: string, id: string) {
  return requestJson<TrashReview>(`/api/projects/${encodeURIComponent(projectId)}/trash/${encodeURIComponent(id)}/review`);
}
export function restoreProjectTrash(projectId: string, id: string, revision: string,attemptId:string) {
  return requestJson<TrashRestoreResult>(`/api/projects/${encodeURIComponent(projectId)}/trash/${encodeURIComponent(id)}/restore`, { method: "POST", body: JSON.stringify({revision,attemptId}) });
}
export function reviewTrashRestoreAttempt(projectId:string,entryId:string,attemptId:string){
  return requestJson<TrashRestoreProof>(`/api/projects/${encodeURIComponent(projectId)}/trash/${encodeURIComponent(entryId)}/restores/${encodeURIComponent(attemptId)}`);
}
export function createTrashRestoreAttemptId(){
  const bytes=new Uint8Array(16);crypto.getRandomValues(bytes);
  return `attempt-${Array.from(bytes,byte=>byte.toString(16).padStart(2,"0")).join("")}`;
}
