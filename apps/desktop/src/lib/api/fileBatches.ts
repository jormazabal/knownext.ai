import { requestJson } from "./client";
import type { FileBatchAction, FileBatchPlan } from "../../types/fileBatch";

export function prepareFileBatch(projectId: string, action: FileBatchAction, nodeIds: string[], targetFolderId: string | null, names?: Record<string,string>) {
  return requestJson<FileBatchPlan>(`/api/projects/${encodeURIComponent(projectId)}/nodes/batch/plan`, { method: "POST", body: JSON.stringify({ action, nodeIds, targetFolderId,...(names?{names}:{}) }) });
}
export function executeFileBatch(projectId: string, id: string) {
  return requestJson<FileBatchPlan>(`/api/projects/${encodeURIComponent(projectId)}/nodes/batch/${encodeURIComponent(id)}/execute`, { method: "POST" });
}
export function getFileBatch(projectId: string, id: string) {
  return requestJson<FileBatchPlan>(`/api/projects/${encodeURIComponent(projectId)}/nodes/batch/${encodeURIComponent(id)}`);
}
export function cancelFileBatch(projectId:string,id:string){
  return requestJson<{id:string;projectId:string;requested:boolean;observedState:FileBatchPlan["state"];requestedAt:string}>(`/api/projects/${encodeURIComponent(projectId)}/nodes/batch/${encodeURIComponent(id)}/cancel`,{method:"POST"});
}
