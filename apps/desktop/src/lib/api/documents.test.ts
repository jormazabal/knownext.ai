import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestBinary, requestJson } from "./client";
import {
  discardDocumentDraft,
  discardOrphanDraft,
  exportDocument,
  exportDocumentContent,
  getDocument,
  getDocumentsSyncStatus,
  listOrphanDrafts,
  restoreOrphanDraft,
  saveDocument,
  saveDocumentDraft,
} from "./documents";

vi.mock("./client", () => ({
  requestJson: vi.fn(),
  requestBinary: vi.fn(),
}));

describe("documents API contracts", () => {
  beforeEach(() => {
    vi.mocked(requestJson).mockReset();
    vi.mocked(requestBinary).mockReset();
    vi.mocked(requestJson).mockResolvedValue({ ok: true });
    vi.mocked(requestBinary).mockResolvedValue(new Blob(["pdf"], { type: "application/pdf" }));
  });

  it("routes document save, draft, export and sync-status contracts", async () => {
    await getDocument("docs/Plan.md");
    expect(requestJson).toHaveBeenLastCalledWith("/api/documents/docs%2FPlan.md");
    await saveDocument("docs/Plan.md", { markdown: "# Plan", baseFingerprint: { size: 1, mtimeNs: 123, sha256: "abc" } });
    expect(requestJson).toHaveBeenLastCalledWith("/api/documents/docs%2FPlan.md", {
      method: "PUT",
      body: JSON.stringify({ markdown: "# Plan", baseFingerprint: { size: 1, mtimeNs: 123, sha256: "abc" },expectedDraftWriteRevision:null }),
    });
    await saveDocumentDraft("docs/Plan.md", { markdown: "# Draft", baseFingerprint: null });
    expect(requestJson).toHaveBeenLastCalledWith("/api/documents/docs%2FPlan.md/draft", {
      method: "PUT",
      body: JSON.stringify({ markdown: "# Draft", baseFingerprint: null,expectedDraftWriteRevision:null }),
    });
    await discardDocumentDraft("docs/Plan.md");
    expect(requestJson).toHaveBeenLastCalledWith("/api/documents/docs%2FPlan.md/draft", { method: "DELETE",body:JSON.stringify({expectedDraftWriteRevision:null}) });
    await exportDocument("docs/Plan.md", { format: "pdf", markdown: "# Plan", outputPath: "C:/Temp/Plan.pdf" });
    expect(requestJson).toHaveBeenLastCalledWith("/api/documents/docs%2FPlan.md/export", {
      method: "POST",
      body: JSON.stringify({ format: "pdf", markdown: "# Plan", outputPath: "C:/Temp/Plan.pdf" }),
    });
    await exportDocumentContent("docs/Plan.md", { format: "docx", markdown: "# Plan" });
    expect(requestBinary).toHaveBeenLastCalledWith("/api/documents/docs%2FPlan.md/export/content", {
      method: "POST",
      body: JSON.stringify({ format: "docx", markdown: "# Plan" }),
    });
    await getDocumentsSyncStatus([{ documentId: "docs/Plan.md", baseFingerprint: null }]);
    expect(requestJson).toHaveBeenLastCalledWith("/api/documents/sync-status", {
      method: "POST",
      body: JSON.stringify({ documents: [{ documentId: "docs/Plan.md", baseFingerprint: null }] }),
    });
  });

  it("routes recoverable draft actions", async () => {
    await listOrphanDrafts();
    expect(requestJson).toHaveBeenLastCalledWith("/api/drafts/orphans");
    const review={documentId:"project::Plan.md",fingerprint:"a".repeat(64),locationRevision:"b".repeat(64)};
    const body=JSON.stringify({documentId:review.documentId,expectedFingerprint:review.fingerprint,locationRevision:review.locationRevision});
    await restoreOrphanDraft("docs/Plan.md",review);
    expect(requestJson).toHaveBeenLastCalledWith("/api/drafts/docs%2FPlan.md/restore", { method: "POST",body });
    await discardOrphanDraft("docs/Plan.md",review);
    expect(requestJson).toHaveBeenLastCalledWith("/api/drafts/docs%2FPlan.md", { method: "DELETE",body });
  });
});
