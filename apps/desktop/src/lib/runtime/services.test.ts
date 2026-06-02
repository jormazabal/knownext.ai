import { afterEach, describe, expect, it, vi } from "vitest";
import { getRuntimeServiceStatus } from "./services";

const invokeMock = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));

describe("runtime services", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    invokeMock.mockReset();
    delete (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
  });

  it("reports the local Rust runtime from Tauri commands", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", { value: {}, configurable: true });
    invokeMock.mockResolvedValue({
      checkedAt: "2026-06-02T10:00:00.000Z",
      services: [
        {
          id: "local-runtime",
          name: "Runtime local Rust",
          status: "running",
          statusLabel: "Operativo",
          description: "La aplicación usa Tauri commands.",
          endpoint: "tauri://local-api/health",
          expectedVersion: "2.0.1",
          version: "2.0.1",
          expectedProfile: "desktop",
          profile: "desktop",
          expectedAppDataDir: "C:\\Users\\user\\AppData\\Roaming\\ai.knownext.desktop",
          appDataDir: "C:\\Users\\user\\AppData\\Roaming\\ai.knownext.desktop",
          managedBy: "tauri",
          instanceId: "tauri-rust-local",
          startedAt: "2026-06-02T09:59:00.000Z",
          lastError: null,
        },
      ],
    });

    const status = await getRuntimeServiceStatus();

    expect(status.services[0]).toMatchObject({
      id: "local-runtime",
      status: "running",
      statusLabel: "Operativo",
      endpoint: "tauri://local-api/health",
    });
    expect(status.services[0]).not.toHaveProperty("canRestart");
    expect(status.services[0]).not.toHaveProperty("canConfigurePort");
    expect(status.services[0]).not.toHaveProperty("portConfig");
    expect(status.services[0]).not.toHaveProperty("port");
  });

  it("reports unavailable outside Tauri instead of probing HTTP", async () => {
    const status = await getRuntimeServiceStatus();

    expect(status.services[0]).toMatchObject({
      id: "local-runtime",
      status: "unavailable",
      statusLabel: "No disponible",
    });
    expect(status.services[0]).not.toHaveProperty("canRestart");
    expect(status.services[0].lastError).toContain("runtime");
  });
});
