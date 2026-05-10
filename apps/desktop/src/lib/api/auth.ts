import { requestJson } from "./client";
import type { AuthStatus, GithubDevicePollResponse, GithubDeviceStartResponse } from "../../types/domain";

export async function getAuthStatus(): Promise<AuthStatus> {
  return requestJson<AuthStatus>("/api/auth/status");
}

export async function startGithubDeviceFlow(): Promise<GithubDeviceStartResponse> {
  return requestJson<GithubDeviceStartResponse>("/api/auth/github/device/start", { method: "POST" });
}

export async function pollGithubDeviceFlow(deviceCode: string): Promise<GithubDevicePollResponse> {
  return requestJson<GithubDevicePollResponse>("/api/auth/github/device/poll", {
    method: "POST",
    body: JSON.stringify({ deviceCode }),
  });
}

export async function logout(): Promise<AuthStatus> {
  return requestJson<AuthStatus>("/api/auth/logout", { method: "POST" });
}
