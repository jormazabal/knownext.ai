import { requestJson } from "./client";
import type { ActivityEvent, ActivityEventList, ActivityScope, ActivityTone } from "../../types/domain";

export async function getProjectActivity(projectId: string): Promise<ActivityEventList> {
  return requestJson<ActivityEventList>(`/api/projects/${projectId}/activity`);
}

export async function recordProjectActivity(
  projectId: string,
  payload: {
    type: string;
    scope: ActivityScope;
    title: string;
    message: string;
    tone?: ActivityTone;
    documentPath?: string | null;
    repository?: string | null;
  },
): Promise<ActivityEvent> {
  return requestJson<ActivityEvent>(`/api/projects/${projectId}/activity`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
