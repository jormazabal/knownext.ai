import { afterEach, describe, expect, it, vi } from "vitest";
import { openExternalUrl } from "./links";
import { open } from "@tauri-apps/plugin-shell";

vi.mock("@tauri-apps/plugin-shell", () => ({
  open: vi.fn(),
}));

describe("external link helper", () => {
  afterEach(() => {
    vi.mocked(open).mockReset();
    vi.restoreAllMocks();
    Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
  });

  it("opens external URLs through Tauri shell in the native app", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", { value: {}, configurable: true });

    await openExternalUrl("https://github.com/login/device");

    expect(open).toHaveBeenCalledWith("https://github.com/login/device");
  });

  it("uses a browser noopener fallback outside Tauri", async () => {
    const openWindow = vi.spyOn(window, "open").mockImplementation(() => null);

    await openExternalUrl("https://github.com/login/device");

    expect(openWindow).toHaveBeenCalledWith("https://github.com/login/device", "_blank", "noopener,noreferrer");
    expect(open).not.toHaveBeenCalled();
  });
});
