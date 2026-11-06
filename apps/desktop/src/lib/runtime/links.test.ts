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

it("rejects executable, local, credential-bearing and malformed URLs before native or browser dispatch",async()=>{const browser=vi.spyOn(window,"open").mockImplementation(()=>null);for(const url of ["javascript:alert(1)","file:///C:/private.md","data:text/html,hi","https://user:pass@example.com/","https://example.com/\n","not a URL"]){await expect(openExternalUrl(url)).rejects.toThrow();}expect(browser).not.toHaveBeenCalled();expect(open).not.toHaveBeenCalled();});
