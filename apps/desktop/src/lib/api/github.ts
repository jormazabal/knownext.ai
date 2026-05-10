import { isBackendEnabled, mockDelay, requestJson } from "./client";
import type { GithubRepositorySummary } from "../../types/domain";

export async function listGithubRepositories(): Promise<GithubRepositorySummary[]> {
  if (isBackendEnabled()) return requestJson<GithubRepositorySummary[]>("/api/github/repositories");
  return mockDelay([]);
}
