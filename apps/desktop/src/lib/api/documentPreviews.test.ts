import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestDataUrl, requestJson } from "./client";
import {
  createDocumentPreview,
  getDocumentPreview,
  getDocumentPreviewPdfUrl,
  getDocumentPreviewText,
  getSpreadsheetSheet,
  getSpreadsheetSheets,
  openDocumentPreviewExternal,
  refreshDocumentPreview,
} from "./documentPreviews";

vi.mock("./client", () => ({
  requestJson: vi.fn(),
  requestDataUrl: vi.fn(),
}));

describe("document preview API contracts", () => {
  beforeEach(() => {
    vi.mocked(requestJson).mockReset();
    vi.mocked(requestDataUrl).mockReset();
    vi.mocked(requestJson).mockResolvedValue({ ok: true });
    vi.mocked(requestDataUrl).mockResolvedValue("data:application/pdf;base64,AA==");
  });

  it("routes preview lifecycle and spreadsheet requests through local runtime", async () => {
    await createDocumentPreview("project 1", { path: "refs/report.xlsx", preferredMode: "spreadsheet" });
    expect(requestJson).toHaveBeenLastCalledWith("/api/projects/project%201/previews", {
      method: "POST",
      body: JSON.stringify({ path: "refs/report.xlsx", preferredMode: "spreadsheet" }),
      timeoutMs: 60000,
    });
    await getDocumentPreview("project 1", "preview/1");
    expect(requestJson).toHaveBeenLastCalledWith("/api/projects/project%201/previews/preview%2F1");
    await refreshDocumentPreview("project 1", "preview/1");
    expect(requestJson).toHaveBeenLastCalledWith("/api/projects/project%201/previews/preview%2F1/refresh", {
      method: "POST",
      timeoutMs: 60000,
    });
    await getDocumentPreviewText("project 1", "preview/1");
    expect(requestJson).toHaveBeenLastCalledWith("/api/projects/project%201/previews/preview%2F1/text");
    await getSpreadsheetSheets("project 1", "preview/1");
    expect(requestJson).toHaveBeenLastCalledWith("/api/projects/project%201/previews/preview%2F1/sheets");
    await getSpreadsheetSheet("project 1", "preview/1", "Hoja 1");
    expect(requestJson).toHaveBeenLastCalledWith("/api/projects/project%201/previews/preview%2F1/sheets/Hoja%201");
    await openDocumentPreviewExternal("project 1", "preview/1");
    expect(requestJson).toHaveBeenLastCalledWith("/api/projects/project%201/previews/preview%2F1/open-external", { method: "POST" });
    await getDocumentPreviewPdfUrl("project 1", "preview/1");
    expect(requestDataUrl).toHaveBeenLastCalledWith("/api/projects/project%201/previews/preview%2F1/pdf");
  });
});
