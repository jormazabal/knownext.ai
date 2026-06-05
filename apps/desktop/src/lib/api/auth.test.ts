import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestJson } from "./client";
import { getAuthStatus, logout, pollGithubDeviceFlow, startGithubDeviceFlow } from "./auth";

vi.mock("./client", () => ({
  requestJson: vi.fn(),
}));

describe("auth API contracts", () => {
  beforeEach(() => {
    vi.mocked(requestJson).mockReset();
  });

  it("routes GitHub device auth through local Tauri API endpoints", async () => {
    vi.mocked(requestJson).mockResolvedValueOnce({ isAuthenticated: false, provider: null, user: null, scopes: [] });
    await getAuthStatus();
    expect(requestJson).toHaveBeenLastCalledWith("/api/auth/status");

    vi.mocked(requestJson).mockResolvedValueOnce({ status: "pending", deviceCode: "device-1", userCode: "ABCD-EFGH", verificationUri: "https://github.com/login/device", interval: 5, expiresIn: 900 });
    await startGithubDeviceFlow();
    expect(requestJson).toHaveBeenLastCalledWith("/api/auth/github/device/start", { method: "POST" });

    vi.mocked(requestJson).mockResolvedValueOnce({ status: "pending" });
    await pollGithubDeviceFlow("device-1");
    expect(requestJson).toHaveBeenLastCalledWith("/api/auth/github/device/poll", {
      method: "POST",
      body: JSON.stringify({ deviceCode: "device-1" }),
    });

    vi.mocked(requestJson).mockResolvedValueOnce({ isAuthenticated: false, provider: null, user: null, scopes: [] });
    await logout();
    expect(requestJson).toHaveBeenLastCalledWith("/api/auth/logout", { method: "POST" });
  });
});
