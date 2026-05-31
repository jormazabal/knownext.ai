import { afterEach, describe, expect, it, vi } from "vitest";
import { APP_VERSION } from "../appVersion";
import { ApiError, requestJson, validateBackendHealth } from "./client";

describe("requestJson", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    localStorage.clear();
    delete (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
  });

  it("honors a custom request timeout", async () => {
    vi.useFakeTimers();

    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init?: RequestInit) => {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("aborted", "AbortError"));
          });
        });
      }),
    );

    const request = requestJson("/api/slow", { method: "POST", timeoutMs: 25_000 });
    let settled = false;
    request.catch(() => {
      settled = true;
    });

    await vi.advanceTimersByTimeAsync(7000);
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(18_000);
    await expect(request).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("Android API endpoint configuration", () => {
  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    localStorage.clear();
    delete (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
  });

  it("uses the saved mobile endpoint before the build-time endpoint", async () => {
    vi.resetModules();
    Object.defineProperty(window, "__TAURI_INTERNALS__", { value: {}, configurable: true });
    Object.defineProperty(window.navigator, "userAgent", { value: "Mozilla/5.0 Android", configurable: true });
    localStorage.setItem("knownext.mobileApiBaseUrl", "http://192.168.0.24:8775/");

    const client = await import("./client");

    expect(client.getApiBaseUrl()).toBe("http://192.168.0.24:8775");
    expect(client.expectedBackendProfile()).toBe("mobile");
    expect(client.isMobileApiBaseUrlConfigured()).toBe(true);
  });

  it("validates and normalizes saved mobile endpoints", async () => {
    vi.resetModules();
    Object.defineProperty(window, "__TAURI_INTERNALS__", { value: {}, configurable: true });
    Object.defineProperty(window.navigator, "userAgent", { value: "Mozilla/5.0 Android", configurable: true });

    const client = await import("./client");

    client.setPersistentMobileApiBaseUrl(" http://10.0.2.2:8775/// ");

    expect(client.getApiBaseUrl()).toBe("http://10.0.2.2:8775");
    expect(localStorage.getItem("knownext.mobileApiBaseUrl")).toBe("http://10.0.2.2:8775");
    expect(() => client.setPersistentMobileApiBaseUrl("ftp://10.0.2.2:8775")).toThrow("http:// o https://");
  });
});

describe("API client backend compatibility", () => {
  it("accepts a matching browser-development backend", () => {
    expect(() => validateBackendHealth({
      app: "knownext",
      status: "ok",
      profile: "web-dev",
      version: APP_VERSION,
    })).not.toThrow();
  });

  it("rejects a stale backend with the right profile but a different version", () => {
    expect(() => validateBackendHealth({
      app: "knownext",
      status: "ok",
      profile: "web-dev",
      version: "0.11.0",
    })).toThrow(ApiError);
  });
});
