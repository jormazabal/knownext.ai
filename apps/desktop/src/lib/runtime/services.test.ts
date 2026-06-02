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
          expectedVersion: "2.0.0",
          version: "2.0.0",
          expectedProfile: "desktop",
          profile: "desktop",
          expectedAppDataDir: "C:\\Users\\user\\AppData\\Roaming\\ai.knownext.desktop",
          appDataDir: "C:\\Users\\user\\AppData\\Roaming\\ai.knownext.desktop",
          port: null,
          managedBy: "tauri",
          instanceId: "tauri-rust-local",
          startedAt: "2026-06-02T09:59:00.000Z",
          externalExecutablePath: null,
          lastError: null,
          canRestart: false,
          canConfigurePort: false,
          portConfig: { mode: "local", port: 0, autoPortStart: 0, autoPortEnd: 0 },
        },
      ],
    });

    const status = await getRuntimeServiceStatus();

    expect(status.services[0]).toMatchObject({
      id: "local-runtime",
      status: "running",
      statusLabel: "Operativo",
      canRestart: false,
      canConfigurePort: false,
      endpoint: "tauri://local-api/health",
    });
  });

  it("reports unavailable outside Tauri instead of probing HTTP", async () => {
    const status = await getRuntimeServiceStatus();

    expect(status.services[0]).toMatchObject({
      id: "local-runtime",
      status: "unavailable",
      statusLabel: "No disponible",
      canRestart: false,
    });
    expect(status.services[0].lastError).toContain("runtime");
  });
});
