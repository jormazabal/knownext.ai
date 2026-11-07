import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  addAiContextSourceToProject,
  addProjectAttachmentAiContextSource,
  addProjectImageAiContextSource,
  extendAiContextSource,
  previewAiContextSource,
  promptAssistant,
  removeAiContextSource,
  uploadLocalAiContextFiles,
  sendAiInteraction,
  deleteAiIndex,
} from "./ai";
import { requestJson } from "./client";

vi.mock("./client", () => ({
  requestFormData: vi.fn(),
  requestJson: vi.fn(),
}));

const requestJsonMock = vi.mocked(requestJson);

describe("AI context API payloads", () => {
  beforeEach(() => {
    requestJsonMock.mockReset();
    requestJsonMock.mockResolvedValue({
      id: "source",
      projectId: "project",
      kind: "image",
      name: "source",
      sizeBytes: 0,
      status: "ready",
      weight: "medium",
      createdAt: "",
      updatedAt: "",
    });
  });

  it("binds index cleanup to a native revision and encodes the project segment", async () => {
    await deleteAiIndex("project/a", "a".repeat(64));
    expect(requestJsonMock).toHaveBeenCalledWith("/api/projects/project%2Fa/ai/index", {method: "DELETE", body: JSON.stringify({revision: "a".repeat(64)})});
  });

  it("sends the saved base with dirty Markdown so a queued request cannot silently rebase",async()=>{
    const base={mtimeNs:null,size:7,sha256:"a".repeat(64)};
    const payload={projectId:"project",documentId:"project::a.md",prompt:"Edit",activeMarkdown:"Unsaved content",activeDocumentBaseFingerprint:base,activeDocumentDraftContentHash:"b".repeat(64),activeHandwrittenDraftContentHash:null,mode:"document" as const,clientMessageId:"client-qa"};
    await sendAiInteraction(payload);
    expect(requestJsonMock).toHaveBeenCalledWith("/api/projects/project/ai/interactions",expect.objectContaining({method:"POST",body:JSON.stringify(payload)}));
  });

  it("sends image and attachment ids using their runtime contract keys", async () => {
    await addProjectImageAiContextSource("project", "project::assets/image.png");
    await addProjectAttachmentAiContextSource("project", "project::docs/file.pdf");

    expect(requestJsonMock).toHaveBeenNthCalledWith(1, "/api/projects/project/ai/context/project-images", {
      method: "POST",
      body: JSON.stringify({ assetId: "project::assets/image.png" }),
    });
    expect(requestJsonMock).toHaveBeenNthCalledWith(2, "/api/projects/project/ai/context/project-attachments", {
      method: "POST",
      body: JSON.stringify({ attachmentId: "project::docs/file.pdf" }),
    });
  });

  it("sends selected local file paths through the Rust context upload contract", async () => {
    await uploadLocalAiContextFiles("project", ["C:\\Temp\\brief.md"]);

    expect(requestJsonMock).toHaveBeenCalledWith("/api/projects/project/ai/context/local-files", {
      method: "POST",
      body: JSON.stringify({ paths: ["C:\\Temp\\brief.md"] }),
      timeoutMs: 120000,
    });
  });

  it("encodes document ids when routing auxiliary document prompts through Rust", async () => {
    await promptAssistant({
      projectId: "project",
      documentId: "project::docs/Plan.md",
      prompt: "Resume",
      markdown: "# Plan",
    });

    expect(requestJsonMock).toHaveBeenCalledWith("/api/documents/project%3A%3Adocs%2FPlan.md/ai/prompt", {
      method: "POST",
      body: JSON.stringify({ prompt: "Resume", markdown: "# Plan" }),
      timeoutMs: 60000,
    });
  });

  it("encodes context source ids that can be backed by project document ids", async () => {
    const sourceId = "project::docs/Plan.md";

    await removeAiContextSource("project", sourceId);
    await extendAiContextSource("project", sourceId);
    await previewAiContextSource("project", sourceId);
    await addAiContextSourceToProject("project", sourceId, { name: "Plan copy.md", parentId: null });

    expect(requestJsonMock).toHaveBeenNthCalledWith(1, "/api/projects/project/ai/context/sources/project%3A%3Adocs%2FPlan.md", {
      method: "DELETE",
    });
    expect(requestJsonMock).toHaveBeenNthCalledWith(2, "/api/projects/project/ai/context/sources/project%3A%3Adocs%2FPlan.md/extend", {
      method: "POST",
    });
    expect(requestJsonMock).toHaveBeenNthCalledWith(3, "/api/projects/project/ai/context/sources/project%3A%3Adocs%2FPlan.md/preview");
    expect(requestJsonMock).toHaveBeenNthCalledWith(4, "/api/projects/project/ai/context/sources/project%3A%3Adocs%2FPlan.md/add-to-project", {
      method: "POST",
      body: JSON.stringify({ name: "Plan copy.md", parentId: null }),
    });
  });
});
