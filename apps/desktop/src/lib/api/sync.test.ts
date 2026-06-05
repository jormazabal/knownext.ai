import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestJson } from "./client";
import {
  autoRunProjectSync,
  changeProjectSyncMode,
  connectProjectGithub,
  enableProjectHistory,
  getProjectSyncStatus,
  publishProjectGithub,
  resolveProjectSyncConflict,
  scanProjectSync,
  verifyProjectGithubConnection,
} from "./sync";

vi.mock("./client", () => ({
  requestJson: vi.fn(),
}));

describe("sync API contracts", () => {
  beforeEach(() => {
    vi.mocked(requestJson).mockReset();
    vi.mocked(requestJson).mockResolvedValue({ projectId: "project-1", state: "synced" });
  });

  it("routes local and remote sync actions to Rust/Tauri contracts", async () => {
    const openDocuments = [{
      documentId: "doc-1",
      path: "docs/plan.md",
      isActive: true,
      isDirty: false,
      hasDraft: false,
    }];

    await getProjectSyncStatus("project-1");
    expect(requestJson).toHaveBeenLastCalledWith("/api/projects/project-1/sync/status");

    await scanProjectSync("project-1", { openDocuments, allowAutoApply: false });
    expect(requestJson).toHaveBeenLastCalledWith("/api/projects/project-1/sync/scan", {
      method: "POST",
      body: JSON.stringify({ openDocuments, allowAutoApply: false }),
    });

    await autoRunProjectSync("project-1", { openDocuments, allowAutoApply: true });
    expect(requestJson).toHaveBeenLastCalledWith("/api/projects/project-1/sync/auto-run", {
      method: "POST",
      body: JSON.stringify({ openDocuments, allowAutoApply: true }),
    });

    await enableProjectHistory("project-1");
    expect(requestJson).toHaveBeenLastCalledWith("/api/projects/project-1/history/enable", { method: "POST" });

    await changeProjectSyncMode("project-1", "auto-github");
    expect(requestJson).toHaveBeenLastCalledWith("/api/projects/project-1/sync-mode", {
      method: "PUT",
      body: JSON.stringify({ syncMode: "auto-github" }),
    });
  });

  it("routes GitHub project sync setup and conflict resolution through structured payloads", async () => {
    await connectProjectGithub("project-1", {
      owner: "knownext",
      repo: "docs",
      defaultRef: "main",
      rootPath: "workspace",
      syncMode: "manual-github",
    });
    expect(requestJson).toHaveBeenLastCalledWith("/api/projects/project-1/github/connect", {
      method: "POST",
      body: JSON.stringify({
        owner: "knownext",
        repo: "docs",
        defaultRef: "main",
        rootPath: "workspace",
        syncMode: "manual-github",
      }),
    });

    await verifyProjectGithubConnection("project-1");
    expect(requestJson).toHaveBeenLastCalledWith("/api/projects/project-1/github/verify-connection", { method: "POST" });

    await publishProjectGithub("project-1", {
      owner: "knownext",
      repo: "docs",
      visibility: "private",
      description: "Project docs",
      syncMode: "auto-github",
    });
    expect(requestJson).toHaveBeenLastCalledWith("/api/projects/project-1/github/publish", {
      method: "POST",
      body: JSON.stringify({
        owner: "knownext",
        repo: "docs",
        visibility: "private",
        description: "Project docs",
        syncMode: "auto-github",
      }),
    });

    await resolveProjectSyncConflict("project-1", "docs/plan.md:remote", "take-remote");
    expect(requestJson).toHaveBeenLastCalledWith("/api/projects/project-1/sync/conflicts/docs%2Fplan.md%3Aremote/resolve", {
      method: "POST",
      body: JSON.stringify({ resolution: "take-remote" }),
    });
  });
});
