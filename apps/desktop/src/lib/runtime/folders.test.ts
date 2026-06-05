import { afterEach, describe, expect, it, vi } from "vitest";
import { requestJson } from "../api/client";
import { selectProjectFolder } from "./folders";
import { open } from "@tauri-apps/plugin-dialog";

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
}));

vi.mock("../api/client", () => ({
  requestJson: vi.fn(),
}));

describe("folder runtime helpers", () => {
  afterEach(() => {
    vi.mocked(open).mockReset();
    vi.mocked(requestJson).mockReset();
  });

  it("uses the native folder picker and preserves the selected absolute path", async () => {
    vi.mocked(open).mockResolvedValue("C:/Users/user/Documents/KnowNext");

    await expect(selectProjectFolder("C:/Users/user/Documents")).resolves.toBe("C:/Users/user/Documents/KnowNext");

    expect(open).toHaveBeenCalledWith({
      directory: true,
      multiple: false,
      title: "Seleccionar carpeta del proyecto",
      defaultPath: "C:/Users/user/Documents",
    });
    expect(requestJson).not.toHaveBeenCalled();
  });

  it("falls back to the local runtime folder contract when the native dialog is unavailable", async () => {
    vi.mocked(open).mockRejectedValue(new Error("dialog unavailable"));
    vi.mocked(requestJson).mockResolvedValue({ folderPath: "C:/Recovered" });

    await expect(selectProjectFolder("C:/Current")).resolves.toBe("C:/Recovered");

    expect(requestJson).toHaveBeenCalledWith("/api/runtime/select-folder", {
      method: "POST",
      body: JSON.stringify({ currentPath: "C:/Current" }),
    });
  });
});
