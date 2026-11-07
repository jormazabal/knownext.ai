import { requestJson } from "./client";
import type { LocalSearchResponse } from "../../types/localSearch";
export function searchSavedProjectContent(projectId: string, query: string) {
  return requestJson<LocalSearchResponse>(`/api/projects/${encodeURIComponent(projectId)}/search/content`, {method:"POST",body:JSON.stringify({query})});
}
