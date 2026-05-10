import { isBackendEnabled, mockDelay, requestJson } from "./client";
import type { AuthStatus, GithubDevicePollResponse, GithubDeviceStartResponse } from "../../types/domain";

const anonymousAuth: AuthStatus = {
  isAuthenticated: false,
  provider: null,
  user: null,
  scopes: [],
};

let mockAuth = anonymousAuth;

export async function getAuthStatus(): Promise<AuthStatus> {
  if (isBackendEnabled()) return requestJson<AuthStatus>("/api/auth/status");
  return mockDelay(mockAuth);
}

export async function startGithubDeviceFlow(): Promise<GithubDeviceStartResponse> {
  if (isBackendEnabled()) return requestJson<GithubDeviceStartResponse>("/api/auth/github/device/start", { method: "POST" });
  return mockDelay({
    deviceCode: "mock-device",
    userCode: "KNXT-DEV",
    verificationUri: "https://github.com/login/device",
    expiresIn: 900,
    interval: 1,
    mock: true,
  });
}

export async function pollGithubDeviceFlow(deviceCode: string): Promise<GithubDevicePollResponse> {
  if (isBackendEnabled()) {
    return requestJson<GithubDevicePollResponse>("/api/auth/github/device/poll", {
      method: "POST",
      body: JSON.stringify({ deviceCode }),
    });
  }
  mockAuth = {
    isAuthenticated: true,
    provider: "github",
    user: { login: "knownext-user", name: "KnowNext User" },
    scopes: ["read:user", "repo"],
  };
  return mockDelay({ status: "authenticated", auth: mockAuth });
}

export async function logout(): Promise<AuthStatus> {
  if (isBackendEnabled()) return requestJson<AuthStatus>("/api/auth/logout", { method: "POST" });
  mockAuth = anonymousAuth;
  return mockDelay(mockAuth);
}
