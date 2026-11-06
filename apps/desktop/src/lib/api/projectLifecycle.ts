import { requestJson } from "./client";
import { isTauriRuntime } from "../runtime/platform";
import type { Project } from "../../types/domain";
import type { RestoredProject, RetiredProjects } from "../../types/projectLifecycle";

function native() { if (!isTauriRuntime()) throw new Error("La gestión de proyectos retirados requiere la aplicación nativa de Windows o Android."); }
export function getRetiredProjects(): Promise<RetiredProjects> {
  native(); return requestJson("/api/retired-projects");
}
export function retireProject(id: string): Promise<Project[]> {
  native(); return requestJson(`/api/projects/${encodeURIComponent(id)}/retire`, {method:"POST",body:JSON.stringify({})});
}
export function restoreRetiredProject(id: string, revision: string, name: string): Promise<RestoredProject> {
  native(); return requestJson(`/api/retired-projects/${encodeURIComponent(id)}/restore`, {method:"POST",body:JSON.stringify({revision,name})});
}
