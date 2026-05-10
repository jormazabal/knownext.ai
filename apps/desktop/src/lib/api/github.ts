import { requestJson } from "./client";
import type { GithubRepositorySummary } from "../../types/domain";

export async function listGithubRepositories(): Promise<GithubRepositorySummary[]> {
  return requestJson<GithubRepositorySummary[]>("/api/github/repositories");
}
