import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestJson } from "./client";
import { listGithubRepositories } from "./github";

vi.mock("./client", () => ({
  requestJson: vi.fn(),
}));

describe("GitHub API contracts", () => {
  beforeEach(() => {
    vi.mocked(requestJson).mockReset();
  });

  it("loads repositories through the local runtime contract", async () => {
    vi.mocked(requestJson).mockResolvedValue([{ owner: "knownext", repo: "docs", defaultRef: "main", private: true, permissions: ["pull", "push"] }]);

    const repositories = await listGithubRepositories();

    expect(requestJson).toHaveBeenCalledWith("/api/github/repositories");
    expect(repositories[0]?.repo).toBe("docs");
  });
});
