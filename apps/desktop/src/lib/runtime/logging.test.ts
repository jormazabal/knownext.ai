import { afterEach, describe, expect, it, vi } from "vitest";
import { requestJson } from "../api/client";
import { getTraceLogStatus, openTraceLogFolder, recordTraceLog } from "./logging";

const invokeMock = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));

vi.mock("../api/client", () => ({
  requestJson: vi.fn(),
}));

describe("runtime logging helpers", () => {
  afterEach(() => {
    invokeMock.mockReset();
    vi.mocked(requestJson).mockReset();
    Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
  });

  it("uses Tauri commands for trace log status, recording and folder opening", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", { value: {}, configurable: true });
    invokeMock.mockResolvedValueOnce({
      enabled: true,
      folderPath: "C:/Users/user/AppData/Roaming/ai.knownext.desktop/logs",
      filePath: "C:/Users/user/AppData/Roaming/ai.knownext.desktop/logs/knownext.log",
    });

    await expect(getTraceLogStatus()).resolves.toMatchObject({ enabled: true });
    expect(invokeMock).toHaveBeenLastCalledWith("get_trace_log_status");

    await recordTraceLog({ source: "settings", message: "Diagnostic copied", detail: null });
    expect(invokeMock).toHaveBeenLastCalledWith("record_trace_log", {
      level: "error",
      source: "settings",
      message: "Diagnostic copied",
      detail: null,
    });

    await openTraceLogFolder("C:/Logs");
    expect(invokeMock).toHaveBeenLastCalledWith("open_folder", { folderPath: "C:/Logs" });
    expect(requestJson).not.toHaveBeenCalled();
  });

  it("keeps trace logging failures non-blocking for the UI", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", { value: {}, configurable: true });
    invokeMock.mockRejectedValue(new Error("No log file"));

    await expect(recordTraceLog({ level: "info", source: "ai", message: "ignored" })).resolves.toBeUndefined();
  });
});
