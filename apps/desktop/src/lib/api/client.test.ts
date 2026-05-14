import { afterEach, describe, expect, it, vi } from "vitest";
import { APP_VERSION } from "../appVersion";
import { ApiError, requestJson, validateBackendHealth } from "./client";

describe("requestJson", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
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
