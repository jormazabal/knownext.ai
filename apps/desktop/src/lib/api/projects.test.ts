import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestDataUrl, requestFormData, requestJson } from "./client";
import {
  buildImageReference,
  createFolder,
  createProject,
  createProjectDocument,
  deleteProject,
  deleteTreeNode,
  duplicateProjectDocument,
  getActiveProject,
  getDocumentMoveImpact,
  getProjectCapabilities,
  getProjectImage,
  getProjectImageContentDataUrl,
  getProjectImageContentUrl,
  getProjectImageUsage,
  getProjectTree,
  getProjectVersioningStatus,
  importProjectAttachment,
  importProjectImage,
  listProjects,
  moveTreeNode,
  pullProject,
  pushProject,
  reindexProjectImages,
  renameTreeNode,
  setActiveProject,
  updateProject,
} from "./projects";
import type { ProjectPayload } from "../../types/domain";

vi.mock("./client", () => ({
  requestJson: vi.fn(),
  requestFormData: vi.fn(),
  requestDataUrl: vi.fn(),
}));

describe("projects API contracts", () => {
  beforeEach(() => {
    vi.mocked(requestJson).mockReset();
    vi.mocked(requestFormData).mockReset();
    vi.mocked(requestDataUrl).mockReset();
    vi.mocked(requestJson).mockResolvedValue({ ok: true });
    vi.mocked(requestFormData).mockResolvedValue({ ok: true });
    vi.mocked(requestDataUrl).mockResolvedValue("data:image/png;base64,AA==");
  });

  it("routes project reads and sync buttons to local runtime endpoints", async () => {
    await listProjects();
    expect(requestJson).toHaveBeenLastCalledWith("/api/projects");
    await getActiveProject();
    expect(requestJson).toHaveBeenLastCalledWith("/api/projects/active");
    await getProjectTree("project-1");
    expect(requestJson).toHaveBeenLastCalledWith("/api/projects/project-1/tree");
    await getProjectCapabilities();
    expect(requestJson).toHaveBeenLastCalledWith("/api/projects/capabilities");
    await getProjectVersioningStatus("project-1");
    expect(requestJson).toHaveBeenLastCalledWith("/api/projects/project-1/versioning/status");
    await pullProject("project-1");
    expect(requestJson).toHaveBeenLastCalledWith("/api/projects/project-1/sync/pull", { method: "POST" });
    await pushProject("project-1");
    expect(requestJson).toHaveBeenLastCalledWith("/api/projects/project-1/sync/push", { method: "POST" });
  });

  it("routes project and tree mutations with structured payloads", async () => {
    await createFolder("project-1", "folder-parent", "Nueva carpeta");
    expect(requestJson).toHaveBeenLastCalledWith("/api/projects/project-1/folders", {
      method: "POST",
      body: JSON.stringify({ parentId: "folder-parent", name: "Nueva carpeta" }),
    });

    await createProjectDocument("project-1", null, "Plan.md", "# Plan");
    expect(requestJson).toHaveBeenLastCalledWith("/api/projects/project-1/documents", {
      method: "POST",
      body: JSON.stringify({ parentId: null, name: "Plan.md", markdown: "# Plan" }),
    });

    await renameTreeNode("project-1", "docs/Plan.md", "Plan 2.md");
    expect(requestJson).toHaveBeenLastCalledWith("/api/projects/project-1/nodes/docs%2FPlan.md/rename", {
      method: "PATCH",
      body: JSON.stringify({ name: "Plan 2.md" }),
    });

    await moveTreeNode("project-1", "docs/Plan.md", "folder-target");
    expect(requestJson).toHaveBeenLastCalledWith("/api/projects/project-1/nodes/docs%2FPlan.md/move", {
      method: "PATCH",
      body: JSON.stringify({ targetFolderId: "folder-target" }),
    });

    await deleteTreeNode("project-1", "docs/Plan.md");
    expect(requestJson).toHaveBeenLastCalledWith("/api/projects/project-1/nodes/docs%2FPlan.md", { method: "DELETE" });

    await duplicateProjectDocument("project-1", "docs/Plan.md");
    expect(requestJson).toHaveBeenLastCalledWith("/api/projects/project-1/documents/docs%2FPlan.md/duplicate", { method: "POST" });
  });

  it("routes project registry and asset contracts without direct filesystem access", async () => {
    const payload: ProjectPayload = {
      name: "KnowNext",
      folderPath: "C:/Docs/KnowNext",
      icon: "folder",
      iconColor: "#F37021",
      creationMode: "new-local",
      storageMode: "local-files",
      versioningMode: "local-git",
      syncMode: "manual-local",
    };

    await createProject(payload);
    expect(requestJson).toHaveBeenLastCalledWith("/api/projects", { method: "POST", body: JSON.stringify(payload) });
    await updateProject("project-1", payload);
    expect(requestJson).toHaveBeenLastCalledWith("/api/projects/project-1", { method: "PUT", body: JSON.stringify(payload) });
    await deleteProject("project-1");
    expect(requestJson).toHaveBeenLastCalledWith("/api/projects/project-1", { method: "DELETE" });
    await setActiveProject("project-1");
    expect(requestJson).toHaveBeenLastCalledWith("/api/projects/project-1/active", { method: "PUT" });

    const image = new File(["png"], "image.png", { type: "image/png" });
    await importProjectImage("project-1", "assets", image);
    expect(requestFormData).toHaveBeenLastCalledWith("/api/projects/project-1/assets/images?parentId=assets", expect.any(FormData));
    await importProjectAttachment("project-1", null, new File(["doc"], "contract.docx"));
    expect(requestFormData).toHaveBeenLastCalledWith("/api/projects/project-1/attachments", expect.any(FormData));
    await importProjectAttachment("project-1", "docs/guides", new File(["# Imported"], "imported.md", { type: "text/markdown" }));
    expect(requestFormData).toHaveBeenLastCalledWith("/api/projects/project-1/attachments?parentId=docs%2Fguides", expect.any(FormData));
    await getProjectImage("project-1", "assets/image.png");
    expect(requestJson).toHaveBeenLastCalledWith("/api/projects/project-1/assets/assets%2Fimage.png");
    await getProjectImageUsage("project-1", "assets/image.png");
    expect(requestJson).toHaveBeenLastCalledWith("/api/projects/project-1/assets/assets%2Fimage.png/usage");
    expect(getProjectImageContentUrl("project-1", "assets/image.png")).toBe("knownext-asset://project-1/assets%2Fimage.png");
    await getProjectImageContentDataUrl("project-1", "assets/image.png");
    expect(requestDataUrl).toHaveBeenLastCalledWith("/api/projects/project-1/assets/assets%2Fimage.png/content");
    await buildImageReference("project-1", "docs/Plan.md", "assets/image.png", "Diagrama");
    expect(requestJson).toHaveBeenLastCalledWith("/api/projects/project-1/documents/docs%2FPlan.md/image-reference", {
      method: "POST",
      body: JSON.stringify({ assetId: "assets/image.png", altText: "Diagrama" }),
    });
    await getDocumentMoveImpact("project-1", "docs/Plan.md");
    expect(requestJson).toHaveBeenLastCalledWith("/api/projects/project-1/documents/docs%2FPlan.md/move-impact");
    await reindexProjectImages("project-1");
    expect(requestJson).toHaveBeenLastCalledWith("/api/projects/project-1/assets/reindex-images", { method: "POST" });
  });
});
