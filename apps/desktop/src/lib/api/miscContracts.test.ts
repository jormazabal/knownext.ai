import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestJson } from "./client";
import { getProjectActivity, recordProjectActivity } from "./activity";
import { getExternalChanges, importExternalChanges, scanExternalChanges } from "./externalChanges";
import { getUserNotes, saveUserNotes } from "./notes";
import { createProjectVersion, getDocumentVersions, getVersionContent, restoreVersion } from "./versions";

vi.mock("./client", () => ({
  requestJson: vi.fn(),
}));

describe("remaining local API boundary contracts", () => {
  beforeEach(() => {
    vi.mocked(requestJson).mockReset();
    vi.mocked(requestJson).mockResolvedValue({ ok: true });
  });

  it("routes activity, notes and external-change actions", async () => {
    await getProjectActivity("project-1");
    expect(requestJson).toHaveBeenLastCalledWith("/api/projects/project-1/activity");
    await recordProjectActivity("project-1", { type: "sync", scope: "github", title: "Sync", message: "Done", tone: "success", documentPath: null, repository: "knownext/docs" });
    expect(requestJson).toHaveBeenLastCalledWith("/api/projects/project-1/activity", {
      method: "POST",
      body: JSON.stringify({ type: "sync", scope: "github", title: "Sync", message: "Done", tone: "success", documentPath: null, repository: "knownext/docs" }),
    });
    await getExternalChanges("project-1");
    expect(requestJson).toHaveBeenLastCalledWith("/api/projects/project-1/external-changes");
    await scanExternalChanges("project-1");
    expect(requestJson).toHaveBeenLastCalledWith("/api/projects/project-1/external-changes/scan", { method: "POST" });
    await importExternalChanges("project-1", { decisions: [{ itemId: "change-1", decision: "include" }], syncRemote: false });
    expect(requestJson).toHaveBeenLastCalledWith("/api/projects/project-1/external-changes/import", {
      method: "POST",
      body: JSON.stringify({ decisions: [{ itemId: "change-1", decision: "include" }], syncRemote: false }),
    });
    await getUserNotes();
    expect(requestJson).toHaveBeenLastCalledWith("/api/notes");
    await saveUserNotes("# Notes");
    expect(requestJson).toHaveBeenLastCalledWith("/api/notes", { method: "PUT", body: JSON.stringify({ markdown: "# Notes" }) });
  });

  it("routes local Git history and restore contracts", async () => {
    await getDocumentVersions("docs/Plan.md");
    expect(requestJson).toHaveBeenLastCalledWith("/api/documents/docs%2FPlan.md/versions");
    await createProjectVersion("project-1", "docs/Plan.md", "Checkpoint");
    expect(requestJson).toHaveBeenLastCalledWith("/api/projects/project-1/versions", {
      method: "POST",
      body: JSON.stringify({ documentId: "docs/Plan.md", title: "Checkpoint" }),
    });
    await getVersionContent("docs/Plan.md", "version/1");
    expect(requestJson).toHaveBeenLastCalledWith("/api/documents/docs%2FPlan.md/versions/version%2F1/content");
    await restoreVersion("docs/Plan.md", "version/1");
    expect(requestJson).toHaveBeenLastCalledWith("/api/documents/docs%2FPlan.md/versions/version%2F1/restore", { method: "POST" });
  });
});
