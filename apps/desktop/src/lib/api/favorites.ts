import { requestJson } from "./client";
import type { FavoriteChange, ProjectFavorites } from "../../types/favorites";

const route = (project: string) => `/api/projects/${encodeURIComponent(project)}/favorites`;
export function getProjectFavorites(project: string): Promise<ProjectFavorites> {
  return requestJson(route(project));
}
export function addProjectFavorite(project: string, path: string, revision: string | null): Promise<FavoriteChange> {
  return requestJson(route(project), {method:"POST", body:JSON.stringify({path,revision})});
}
export function removeProjectFavorite(project: string, id: string, revision: string | null): Promise<FavoriteChange> {
  return requestJson(`${route(project)}/${encodeURIComponent(id)}`, {method:"DELETE", body:JSON.stringify({revision})});
}
