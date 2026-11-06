import {invokeManagedNative as invoke} from "./nativeClient";
import { requestJson } from "./client";
import { isTauriRuntime } from "../runtime/platform";
import type { ProjectTransferInventory, ProjectTransferJob, ProjectTransferMode } from "../../types/projectTransfer";

function native() { if (!isTauriRuntime()) throw new Error("La transferencia de proyectos requiere la aplicación nativa de Windows o Android."); }
function post<T>(path: string, body?: unknown): Promise<T> { native(); return requestJson(path, { method: "POST", body: JSON.stringify(body ?? {}) }); }
const path = (id: string) => `/api/project-transfers/${encodeURIComponent(id)}`;
export const projectTransfers = {
  async list(): Promise<ProjectTransferInventory> { native(); return requestJson("/api/project-transfers"); },
  begin(mode: ProjectTransferMode): Promise<ProjectTransferJob> { return post("/api/project-transfers", "templateId" in mode?{kind:mode.kind==="template-import"?"import":"export",templateId:mode.templateId,templateRevision:mode.revision}:mode.kind === "import" ? { kind: "import" } : { kind: "export", projectId: mode.projectId, ...(mode.nodeIds?{nodeIds:mode.nodeIds}:{}), ...(mode.includeArchive?{includeArchive:true}:{}) }); },
  prepare(id: string): Promise<ProjectTransferJob> { return post(`${path(id)}/prepare`); },
  async pick(id: string): Promise<ProjectTransferJob> { native(); return invoke("pick_project_package", { id }); },
  async deliver(id: string, archiveSha256: string): Promise<ProjectTransferJob> { native(); return invoke("export_project_package", { id, archiveSha256 }); },
  commit(id: string, archiveSha256: string, name: string): Promise<ProjectTransferJob> { return post(`${path(id)}/commit`, { archiveSha256, name }); },
  rememberReview(id: string, archiveSha256: string, name: string): Promise<ProjectTransferJob> { return post(`${path(id)}/review`, { archiveSha256, name }); },
  cancel(id: string): Promise<{ id: string; requested: boolean }> { return post(`${path(id)}/cancel`); },
  discard(id: string): Promise<{ id: string; discarded: boolean }> { return post(`${path(id)}/discard`); },
};
