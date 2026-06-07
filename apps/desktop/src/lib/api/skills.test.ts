import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestJson } from "./client";
import { getAiSkill, listAiSkills, previewAiSkillSelection, validateAiSkill } from "./skills";

vi.mock("./client", () => ({
  requestJson: vi.fn(),
}));

describe("AI skills API contracts", () => {
  beforeEach(() => {
    vi.mocked(requestJson).mockReset();
    vi.mocked(requestJson).mockResolvedValue({ skills: [] });
  });

  it("routes skill list, detail and validation through the local runtime", async () => {
    await listAiSkills();
    expect(requestJson).toHaveBeenLastCalledWith("/api/ai/skills");

    await getAiSkill("knownext.mermaid");
    expect(requestJson).toHaveBeenLastCalledWith("/api/ai/skills/knownext.mermaid");

    await validateAiSkill("knownext.mermaid");
    expect(requestJson).toHaveBeenLastCalledWith("/api/ai/skills/knownext.mermaid/validate", {
      method: "POST",
    });

    await previewAiSkillSelection({ prompt: "Crea una tabla", expectedAction: "answer" });
    expect(requestJson).toHaveBeenLastCalledWith("/api/ai/skills/selection-preview", {
      method: "POST",
      body: JSON.stringify({ prompt: "Crea una tabla", expectedAction: "answer" }),
    });
  });
});
