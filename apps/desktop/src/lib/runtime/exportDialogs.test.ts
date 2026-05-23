import { describe, expect, it, vi } from "vitest";
import { selectBrowserExportTarget, withExportExtension } from "./exportDialogs";

vi.mock("@tauri-apps/plugin-dialog", () => ({
  save: vi.fn(),
}));

describe("export dialogs", () => {
  it("uses the browser download fallback when file handle writing is blocked", async () => {
    const createObjectUrl = vi.fn(() => "blob:knownext-export");
    const revokeObjectUrl = vi.fn();
    Object.defineProperty(window.URL, "createObjectURL", { configurable: true, value: createObjectUrl });
    Object.defineProperty(window.URL, "revokeObjectURL", { configurable: true, value: revokeObjectUrl });
    Object.defineProperty(window, "showSaveFilePicker", {
      configurable: true,
      value: vi.fn(async () => ({
        createWritable: vi.fn(async () => {
          throw new DOMException("The request is not allowed by the user agent.", "NotAllowedError");
        }),
      })),
    });

    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const target = await selectBrowserExportTarget("browser-export.md", "pdf");

    await target?.save(new Blob(["PDF"]));

    expect(target?.fileName).toBe("browser-export.pdf");
    expect(createObjectUrl).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:knownext-export");

    click.mockRestore();
  });

  it("replaces markdown extensions with the selected export extension", () => {
    expect(withExportExtension("notes.md", "docx")).toBe("notes.docx");
    expect(withExportExtension("notes.pdf", "pdf")).toBe("notes.pdf");
  });
});
