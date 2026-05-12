import { afterEach, describe, expect, it, vi } from "vitest";
import { getRuntimeServiceStatus } from "./services";
import { APP_VERSION } from "../appVersion";

describe("runtime services", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("reports the browser backend as unavailable when health does not answer", async () => {
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

    const statusPromise = getRuntimeServiceStatus();
    await vi.advanceTimersByTimeAsync(2500);
    const status = await statusPromise;

    expect(status.services[0]).toMatchObject({
      id: "backend",
      status: "unavailable",
      statusLabel: "No disponible",
      canRestart: false,
    });
    expect(status.services[0].lastError).toContain("no respondió");
  });

  it("marks a responding browser backend with a mismatched version as degraded", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              status: "ok",
              version: "0.0.1",
              appDataDir: "C:\\Temp\\knownext",
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        ),
      ),
    );

    const status = await getRuntimeServiceStatus();

    expect(status.services[0]).toMatchObject({
      id: "backend",
      status: "degraded",
      statusLabel: "Incompatible",
      expectedVersion: APP_VERSION,
      version: "0.0.1",
    });
    expect(status.services[0].lastError).toContain(`expectedVersion=${APP_VERSION}`);
  });
});
