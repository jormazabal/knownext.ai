import { afterEach, describe, expect, it, vi } from "vitest";
import { APP_VERSION } from "../appVersion";
import { ApiError, clearPersistentMobileApiBaseUrl, discoverMobileApiBaseUrl, getApiBaseUrl, isMobileApiBaseUrlConfigured, requestJson, setPersistentMobileApiBaseUrl, validateRuntimeHealth } from "./client";

const invokeMock = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));

describe("requestJson", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    invokeMock.mockReset();
    delete (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
  });

  it("routes JSON requests through the local Tauri command", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", { value: {}, configurable: true });
    invokeMock.mockResolvedValue({ status: 200, body: { ok: true } });

    await expect(requestJson("/api/config", { method: "PUT", body: JSON.stringify({ layout: { sidebarWidth: 320 } }) })).resolves.toEqual({ ok: true });

    expect(invokeMock).toHaveBeenCalledWith("local_api_request", {
      request: {
        method: "PUT",
        path: "/api/config",
        body: { layout: { sidebarWidth: 320 } },
      },
    });
  });

  it("converts local command errors into ApiError", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", { value: {}, configurable: true });
    invokeMock.mockResolvedValue({ status: 404, body: { detail: "No encontrado" } });

    await expect(requestJson("/api/projects/active")).rejects.toMatchObject({
      name: "ApiError",
      status: 404,
      detail: "No encontrado",
    });
  });
});

describe("Android local-first runtime", () => {
  afterEach(() => {
    clearPersistentMobileApiBaseUrl();
  });

  it("ignores external mobile endpoints and keeps the local Tauri API", async () => {
    setPersistentMobileApiBaseUrl(" http://10.0.2.2:8775/// ");

    expect(getApiBaseUrl()).toBe("tauri://local-api");
    expect(isMobileApiBaseUrlConfigured()).toBe(true);
    await expect(discoverMobileApiBaseUrl({ subnets: ["192.168.1"] })).resolves.toBe("tauri://local-api");
  });
});

describe("API client runtime compatibility", () => {
  it("accepts a matching desktop runtime", () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", { value: {}, configurable: true });
    expect(() => validateRuntimeHealth({
      app: "knownext",
      status: "ok",
      profile: "desktop",
      version: APP_VERSION,
    })).not.toThrow();
  });

  it("rejects a stale runtime with the right profile but a different version", () => {
    expect(() => validateRuntimeHealth({
      app: "knownext",
      status: "ok",
      profile: "desktop",
      version: "1.0.1",
    })).toThrow(ApiError);
  });
});
